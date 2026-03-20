/**
 * background.js — Complyze Shield Service Worker v1.1.1
 *
 * Responsibilities:
 *  1. Firebase Auth (email/password + Google OAuth) via REST API
 *  2. User identity cached in chrome.storage.local
 *  3. Device registration on first sign-in (fixes EXT-001)
 *  4. Policy refresh every 5 minutes via chrome.alarms
 *  5. Handles all messages from popup.js and promptScanner.js
 *
 * MV3 NOTE: Service workers are EPHEMERAL — they shut down after ~30s of inactivity
 * and all global variables reset to their initial values. State must be re-hydrated
 * from chrome.storage.local at the start of EVERY entry point:
 *   - onInstalled, onStartup, onAlarm, onMessage
 */

// ── Configuration ─────────────────────────────────────────────────────────────
// The @complyze-build script replaces process.env values during deployment.
var API_ENDPOINT = 'https://api.complyze.co';
var FIREBASE_API_KEY = (typeof process !== 'undefined' && process.env.FIREBASE_API_KEY) || 'AIzaSyCXiD5MwlacKPF8f3sD8PSJPzbFgqGt04A';
var FIREBASE_AUTH_URL = (typeof process !== 'undefined' && process.env.FIREBASE_AUTH_URL) || 'https://identitytoolkit.googleapis.com/v1/accounts';
var FIREBASE_REFRESH_URL = (typeof process !== 'undefined' && process.env.FIREBASE_REFRESH_URL) || 'https://securetoken.googleapis.com/v1/token';

// ── Runtime state ─────────────────────────────────────────────────────────────
// All of these reset to their initial values on every SW cold-start.
// They are ONLY valid after ensureInitialized() resolves.
var installationId = '';
var currentUser = null;   // { uid, email, displayName, idToken, refreshToken, orgId, orgName, shieldActive, ssoToken }
var effectivePolicy = null;
var inspectAttachments = false; // New state for file inspection
var eventQueue = [];
var lastPolicySyncStatus = 'never';
var lastEventSyncStatus = 'never';


// ── FIX BUG-1: Initialization promise lock ────────────────────────────────────
// Without this, two messages arriving simultaneously both call loadLocalStorage()
// and race each other — the second call sees un-updated globals from the first.
var _initPromise = null;

function ensureInitialized() {
    if (_initPromise) return _initPromise;   // Already initializing or done — reuse promise
    _initPromise = loadLocalStorage().then(() => {
        // Silently attempt token refresh if we have a logged-in user
        if (currentUser && currentUser.refreshToken) {
            ensureFreshToken().catch(() => { });
        }
        console.log('[Complyze] SW initialized. install:', installationId,
            '| user:', currentUser ? currentUser.email : 'none');
    });
    return _initPromise;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function genInstallId() {
    return 'inst_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
}

// ── FIX BUG-5: Restore effective policy from storage on cold-start ──────────────
async function loadLocalStorage() {
    return new Promise((resolve) => {
        // Added effectivePolicy/eventQueue to survive SW restarts
        chrome.storage.local.get(['installationId', 'currentUser', 'apiEndpoint', 'effectivePolicy', 'eventQueue'], (data) => {
            if (chrome.runtime.lastError) {
                console.error('[Complyze] storage.local.get error:', chrome.runtime.lastError.message);
                resolve();
                return;
            }
            if (data.installationId) {
                installationId = data.installationId;
            } else {
                // FIX BUG EDGE: generate ID synchronously so it's set before resolve()
                installationId = genInstallId();
                chrome.storage.local.set({ installationId });
            }
            if (data.currentUser) { currentUser = data.currentUser; }
            if (data.apiEndpoint) { API_ENDPOINT = data.apiEndpoint; }
            if (data.effectivePolicy) { effectivePolicy = data.effectivePolicy; }
            if (Array.isArray(data.eventQueue)) { eventQueue = data.eventQueue; }
            if (data.inspectAttachments !== undefined) { inspectAttachments = data.inspectAttachments; }
            resolve();
        });
    });
}

async function saveUser(user) {
    currentUser = user;
    await chrome.storage.local.set({ currentUser: user });
}

async function clearUser() {
    currentUser = null;
    _initPromise = null;  // Force re-init on next message so state is fresh
    await chrome.storage.local.remove(['currentUser', 'effectivePolicy', 'eventQueue', 'lastPolicySyncStatus', 'lastEventSyncStatus']);
}

// ── Build request headers ─────────────────────────────────────────────────────
// Reads from globals — only valid after ensureInitialized() has resolved.
function buildHeaders(extra) {
    var headers = {
        'Content-Type': 'application/json',
        'X-Installation-ID': installationId || 'pending',
    };
    if (currentUser) {
        if (currentUser.idToken) headers['Authorization'] = 'Bearer ' + currentUser.idToken;
        if (currentUser.orgId) headers['X-Organization-ID'] = currentUser.orgId;
        if (currentUser.email) headers['X-User-Email'] = currentUser.email;
        if (currentUser.uid) headers['X-User-UID'] = currentUser.uid;
    }
    return Object.assign(headers, extra || {});
}

async function apiRequest(path, method, body) {
    var options = { method: method || 'GET', headers: buildHeaders() };
    if (body) {
        body.installationId = installationId;
        options.body = JSON.stringify(body);
    }
    try {
        var res = await fetch(API_ENDPOINT + path, options);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
    } catch (e) {
        console.error('[Complyze] API error (' + path + '):', e.message);
        throw e;
    }
}

// ── Firebase Auth REST API ────────────────────────────────────────────────────
async function firebaseSignInEmail(email, password) {
    var res = await fetch(FIREBASE_AUTH_URL + ':signInWithPassword?key=' + FIREBASE_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message.replace(/_/g, ' '));
    return data;
}

async function firebaseRefreshToken(refreshToken) {
    var res = await fetch(FIREBASE_REFRESH_URL + '?key=' + FIREBASE_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { idToken: data.id_token, refreshToken: data.refresh_token };
}

// ── Token refresh ─────────────────────────────────────────────────────────────
// FIX BUG-6: called before apiRequest() in scan/log/stats — not just before scan.
async function ensureFreshToken() {
    if (!currentUser || !currentUser.refreshToken) return;
    try {
        var tokens = await firebaseRefreshToken(currentUser.refreshToken);
        currentUser.idToken = tokens.idToken;
        currentUser.refreshToken = tokens.refreshToken;
        await chrome.storage.local.set({ currentUser });
        console.log('[Complyze] Token refreshed silently.');
    } catch (e) {
        console.warn('[Complyze] Token refresh failed:', e.message);
    }
}

// ── Exchange token with backend: get org info + register device ───────────────
async function exchangeWithBackend(idToken, uid, email, displayName) {
    try {
        console.log('[Complyze][AUTH] Exchanging token with backend:', { email, uid: uid?.substring(0, 8) + '...', installationId });
        var res = await fetch(API_ENDPOINT + '/api/auth/extension', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Installation-ID': installationId,
            },
            body: JSON.stringify({ idToken, uid, email, displayName, installationId, agentVersion: '1.1.1' })
        });
        if (!res.ok) { console.warn('[Complyze][AUTH] Backend exchange failed:', res.status); return null; }
        var data = await res.json();
        console.log('[Complyze][AUTH] Exchange success:', { orgId: data.orgId, orgName: data.orgName, plan: data.plan, role: data.role, policyVersion: data.effectivePolicyVersion });
        return data;
    } catch (e) {
        console.warn('[Complyze][AUTH] Backend exchange error:', e.message);
        return null;
    }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
// FIX BUG-6: ensure token is fresh before every authenticated request
async function fetchStats() {
    try {
        await ensureFreshToken();                              // ← BUG-6 fix
        return await apiRequest('/api/auth/extension', 'GET');
    } catch (e) {
        return { scannedToday: 0, blockedToday: 0 };
    }
}

// ── Extension heartbeat (ping) ────────────────────────────────────────────────
// Called alongside policy refresh so the dashboard shows "Extension Health: ONLINE".
// Uses the same auth headers as all other API calls, so no extra credentials needed.
async function sendExtensionPing() {
    if (!currentUser) return;
    try {
        var res = await fetch(API_ENDPOINT + '/api/auth/extension/ping', {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({ installationId }),
        });
        if (res.ok) {
            console.log('[Complyze] Extension ping sent. Dashboard health updated.');
        }
    } catch (e) {
        console.warn('[Complyze] Extension ping failed (non-fatal):', e.message);
    }
}

// ── Full sign-in ──────────────────────────────────────────────────────────────
async function completeSignIn(firebaseData) {
    var { idToken, refreshToken, localId: uid, email, displayName } = firebaseData;
    console.log('[Complyze] Signed in as:', email);

    var backendInfo = await exchangeWithBackend(idToken, uid, email, displayName);
    var user = {
        uid,
        email,
        displayName: displayName || email.split('@')[0],
        idToken,
        refreshToken,
        orgId: backendInfo?.orgId || null,
        orgName: backendInfo?.orgName || 'No Org',
        shieldActive: backendInfo?.shieldActive !== false,
        ssoToken: backendInfo?.ssoToken || idToken,
        plan: backendInfo?.plan || 'SAFE',
        role: backendInfo?.role || 'user',
        features: backendInfo?.features || {
            promptMonitoring: true,
            sensitiveDataDetection: true,
            riskScore: true,
            aiAppDetection: true,
            alerts: true,
            redaction: false,
            blocking: false,
            attachmentScanning: false,
            adminDashboard: false,
            auditLogs: false,
            teamPolicies: false,
            sso: false,
            apiAccess: false
        }
    };

    await saveUser(user);
    fetchAndCachePolicies('startup').catch(() => { });
    // Immediately ping so dashboard shows ONLINE after login
    sendExtensionPing().catch(() => { });
    var stats = await fetchStats();
    return { user, stats };
}

async function loginWithLicense(licenseKey) {
    try {
        var res = await fetch(API_ENDPOINT + '/api/auth/license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Installation-ID': installationId },
            body: JSON.stringify({ licenseKey, installationId, agentVersion: '1.2.0' })
        });
        if (!res.ok) {
            const errBody = await res.json();
            throw new Error(errBody.error || 'Activation failed (HTTP ' + res.status + ')');
        }
        var data = await res.json();
        var user = {
            uid: data.uid,
            email: data.email,
            displayName: data.displayName,
            idToken: data.ssoToken, // Use ssoToken or licenseKey as placeholder for idToken
            refreshToken: 'license_auth',
            orgId: data.orgId,
            orgName: data.orgName,
            shieldActive: data.shieldActive !== false,
            ssoToken: data.ssoToken,
            plan: data.plan || 'SAFE',
            role: data.role || 'user',
            features: data.features || {
                promptMonitoring: true,
                sensitiveDataDetection: true,
                riskScore: true,
                aiAppDetection: true,
                alerts: true,
                redaction: false,
                blocking: false,
                attachmentScanning: false,
                adminDashboard: false,
                auditLogs: false,
                teamPolicies: false,
                sso: false,
                apiAccess: false
            }
        };
        await saveUser(user);
        fetchAndCachePolicies('license_login').catch(() => { });
        var stats = await fetchStats().catch(() => ({ scannedToday: 0, blockedToday: 0 }));
        return { user, stats };
    } catch (e) {
        console.error('[Complyze] License activation error:', e.message);
        throw e;
    }
}

// ── Google Sign-In ────────────────────────────────────────────────────────────
async function signInWithGoogle() {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: true }, async (oauthToken) => {
            if (chrome.runtime.lastError || !oauthToken) {
                resolve({ error: chrome.runtime.lastError?.message || 'Google sign-in cancelled.' });
                return;
            }
            try {
                var res = await fetch(FIREBASE_AUTH_URL + ':signInWithIdp?key=' + FIREBASE_API_KEY, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        postBody: 'access_token=' + oauthToken + '&providerId=google.com',
                        requestUri: 'https://api.complyze.co',
                        returnIdpCredential: true,
                        returnSecureToken: true,
                    })
                });
                var data = await res.json();
                if (data.error) throw new Error(data.error.message);
                var result = await completeSignIn({
                    idToken: data.idToken, refreshToken: data.refreshToken,
                    localId: data.localId, email: data.email,
                    displayName: data.displayName || data.fullName,
                });
                resolve(result);
            } catch (e) {
                console.error('[Complyze] Google sign-in error:', e.message);
                resolve({ error: e.message });
            }
        });
    });
}

// ── Policy caching + effective policy sync ─────────────────────────────────────
async function fetchAndCachePolicies(trigger) {
    try {
        await ensureFreshToken();
        if (!currentUser || !currentUser.orgId) {
            lastPolicySyncStatus = 'skipped:no_org';
            await chrome.storage.local.set({ lastPolicySyncStatus });
            console.log('[Complyze][POLICY] Skipped: no org assigned');
            return;
        }

        sendExtensionPing().catch(() => { });

        console.log('[Complyze][POLICY] Checking version (trigger=' + trigger + ')...');
        var version = await apiRequest('/api/policy/version', 'GET');
        var currentVersion = effectivePolicy?.policyVersion || 0;
        console.log('[Complyze][POLICY] Server version=' + version.policyVersion + ' local=' + currentVersion);
        if (!effectivePolicy || version.policyVersion !== currentVersion) {
            console.log('[Complyze][POLICY] Version changed — fetching full effective policy...');
            var fetched = await apiRequest('/api/policy/effective', 'GET');
            effectivePolicy = Object.assign({ fetchedAt: new Date().toISOString() }, fetched);
            await chrome.storage.local.set({ effectivePolicy });
            console.log('[Complyze][POLICY] Cached effective policy:', { version: effectivePolicy.policyVersion, rulesCount: (effectivePolicy.resolvedPolicy?.rules || []).length, groupIds: effectivePolicy.groupIds });
            await submitSyncEvent('POLICY_FETCHED', {
                policyVersion: effectivePolicy.policyVersion,
                summary: 'Effective policy fetched',
                metadata: { trigger: trigger || 'manual' }
            });
            await submitSyncEvent('POLICY_APPLIED', {
                policyVersion: effectivePolicy.policyVersion,
                summary: 'Effective policy applied locally'
            });
        }

        lastPolicySyncStatus = 'ok:' + (effectivePolicy?.policyVersion || 'none');
        await chrome.storage.local.set({ lastPolicySyncStatus });

        try {
            var settings = await apiRequest('/api/proxy/settings', 'GET');
            if (settings) {
                inspectAttachments = !!settings.inspect_attachments;
                await chrome.storage.local.set({ inspectAttachments });
            }
        } catch (_) {}
    } catch (e) {
        lastPolicySyncStatus = 'error:' + e.message;
        await chrome.storage.local.set({ lastPolicySyncStatus });
        await submitSyncEvent('POLICY_FETCH_FAILED', {
            summary: 'Failed to fetch effective policy',
            metadata: { error: e.message }
        });
    }
}

async function submitSyncEvent(eventType, data) {
    var event = Object.assign({
        eventId: crypto.randomUUID(),
        eventType,
        timestamp: new Date().toISOString(),
        extensionVersion: '1.2.0',
        browser: 'chrome',
        platform: navigator.platform || 'unknown',
        policyVersion: effectivePolicy?.policyVersion || 0,
    }, data || {});

    try {
        await apiRequest('/api/events/ingest', 'POST', event);
        lastEventSyncStatus = 'ok:' + eventType;
        await chrome.storage.local.set({ lastEventSyncStatus });
    } catch (e) {
        eventQueue.push(event);
        await chrome.storage.local.set({ eventQueue });
        lastEventSyncStatus = 'queued:' + eventType;
        await chrome.storage.local.set({ lastEventSyncStatus });
    }
}

async function flushEventQueue() {
    if (!eventQueue.length) return;
    var pending = [...eventQueue];
    eventQueue = [];
    for (var i = 0; i < pending.length; i++) {
        try {
            await apiRequest('/api/events/ingest', 'POST', pending[i]);
        } catch (e) {
            eventQueue.push(pending[i]);
        }
    }
    await chrome.storage.local.set({ eventQueue });
}

// ── Prompt scanning ────────────────────────────────────────────────────────────
async function scanPrompt(payload) {
    await ensureFreshToken();
    var enrichedPayload = Object.assign({}, payload);
    if (effectivePolicy?.resolvedPolicy?.rules?.length > 0) {
        enrichedPayload.cachedPolicies = effectivePolicy.resolvedPolicy.rules;
        enrichedPayload.policyVersion = effectivePolicy.policyVersion;
    }
    // Always send user/org identity so backend policy engine uses the correct user's rules.
    if (currentUser) {
        enrichedPayload.userEmail = currentUser.email;
        enrichedPayload.user_id = currentUser.uid;          // explicit user identity
        enrichedPayload.orgId = currentUser.orgId;
        enrichedPayload.organization_id = currentUser.orgId; // explicit org identity
        // workspaceId MUST be orgId (not uid) so events land in the correct workspace bucket
        enrichedPayload.workspaceId = currentUser.orgId || currentUser.uid;
    }

    console.log('[Complyze][SCAN] Sending to backend:', {
        tool: enrichedPayload.aiTool,
        promptLength: (enrichedPayload.prompt || '').length,
        cachedPolicyRules: (enrichedPayload.cachedPolicies || []).length,
        policyVersion: enrichedPayload.policyVersion || 'none',
        workspaceId: enrichedPayload.workspaceId,
        user_id: enrichedPayload.user_id,
        organization_id: enrichedPayload.organization_id,
    });

    var result = await apiRequest('/api/scanPrompt', 'POST', enrichedPayload);

    console.log('[Complyze][SCAN] Backend response:', {
        action: result?.action,
        riskScore: result?.riskScore,
        decision_source: result?.decision_source,
        model_used: result?.model_used,
        policy_used: result?.policy_used,
        ollama_model: result?.ollama_model_used,
        ollama_host: result?.ollama_host_used,
    });

    return result;
}

// ── Activity logging ──────────────────────────────────────────────────────────
// ISSUE 2 FIX: Include workspaceId (= orgId) so events land in the correct
// workspace bucket that the dashboard reads from.
async function logActivity(payload) {
    await ensureFreshToken();
    var enrichedPayload = Object.assign({
        userEmail: currentUser?.email || 'unknown',
        uid: currentUser?.uid || '',
        workspaceId: currentUser?.orgId || currentUser?.uid || 'default',
        policyVersion: effectivePolicy?.policyVersion || 0,
    }, payload);

    var action = (enrichedPayload.action || '').toLowerCase();
    var eventType = 'PROMPT_SCANNED';
    if (action.includes('block')) eventType = 'PROMPT_BLOCKED';
    else if (action.includes('redact')) eventType = 'PROMPT_REDACTED';
    else if (action.includes('audit')) eventType = 'AUDIT_ONLY_FLAGGED';
    else if (action.includes('allow')) eventType = 'PROMPT_ALLOWED';

    console.log('[Complyze][EVENT] Submitting sync event:', { eventType, action: enrichedPayload.action, workspaceId: enrichedPayload.workspaceId, user: enrichedPayload.userEmail });

    await submitSyncEvent(eventType, {
        decision: enrichedPayload.action,
        riskScore: enrichedPayload.riskScore,
        modelScore: enrichedPayload.analysis_score,
        redactionApplied: eventType === 'PROMPT_REDACTED',
        summary: enrichedPayload.message || eventType,
        metadata: {
            tool: enrichedPayload.aiTool,
            findings: enrichedPayload.findings,
        }
    });

    console.log('[Complyze][EVENT] Submitting activity to /api/activity:', { eventType, tool: enrichedPayload.aiTool });
    return apiRequest('/api/activity', 'POST', enrichedPayload);
}

// ── Ensure alarm exists ───────────────────────────────────────────────────────
// FIX BUG-3: Called on BOTH onInstalled and onStartup so alarm survives
// extension updates, profile wipes, and Chrome restarts that clear alarms.
async function ensureAlarmExists() {
    const existing = await chrome.alarms.get('policy_refresh');
    if (!existing) {
        chrome.alarms.create('policy_refresh', { periodInMinutes: 5 });
        console.log('[Complyze] Created policy_refresh alarm.');
    }
    const queueAlarm = await chrome.alarms.get('event_sync');
    if (!queueAlarm) {
        chrome.alarms.create('event_sync', { periodInMinutes: 1 });
    }
}

// ── Lifecycle entry points ────────────────────────────────────────────────────
// Every entry point MUST call ensureInitialized() first.

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
        ensureInitialized().then(() => {
            fetchAndCachePolicies('login').catch(() => { });
            ensureAlarmExists();                                    // ← BUG-3 fix
        });
    });

    chrome.runtime.onStartup.addListener(() => {
        ensureInitialized().then(() => {
            fetchAndCachePolicies('login').catch(() => { });
            ensureAlarmExists();                                    // ← BUG-3 fix (recreate if cleared)
        });
    });

    // FIX BUG-2: Alarm handler now calls ensureInitialized() before fetching policies
    // so auth headers are populated even when the SW cold-starts from an alarm wake.
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        await ensureInitialized();
        if (alarm.name === 'policy_refresh') {
            await fetchAndCachePolicies('alarm').catch(() => { });
            console.log('[Complyze] Alarm: policies refreshed at', new Date().toISOString());
            return;
        }
        if (alarm.name === 'event_sync') {
            await flushEventQueue().catch(() => { });
            return;
        }
    });


    if (chrome.tabs && chrome.tabs.onActivated) {
        chrome.tabs.onActivated.addListener(async () => {
            await ensureInitialized();
            await fetchAndCachePolicies('tab_activated').catch(() => { });
            await flushEventQueue().catch(() => { });
        });
    }

    // ── Sidebar toggle via native sidePanel ───────────────────────────────────────
    // We configure the side panel to open when the user clicks the extension's action.
    // This handles viewport resizing natively so content is never cut off.
    chrome.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));


    // ── Message router ────────────────────────────────────────────────────────────
    // FIX BUG-4: All message handlers are now part of a single top-level async
    // function that awaits ensureInitialized() before doing anything. sendResponse
    // is always called synchronously relative to the resolved async path, so
    // Chrome's message port stays open (we return true from the sync listener
    // while the async work is in flight).
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        var type = message.type;
        var payload = message.payload || {};

        (async () => {
            // ── Always restore state first (BUG-1 + BUG-2 fix) ──
            await ensureInitialized();

            // ── Auth messages ─────────────────────────────────────────────────────
            if (type === 'GET_AUTH_STATE') {
                if (!currentUser) { sendResponse({ user: null }); return; }
                var stats = await fetchStats().catch(() => ({ scannedToday: 0, blockedToday: 0 }));

                // Mirror local session stats for "Instant Live" feel
                const localStats = await chrome.storage.local.get(['sessionScanned', 'sessionBlocked']);
                stats.scannedToday = (stats.scannedToday || 0) + (localStats.sessionScanned || 0);
                stats.blockedToday = (stats.blockedToday || 0) + (localStats.sessionBlocked || 0);

                sendResponse({ user: currentUser, stats, apiEndpoint: API_ENDPOINT, effectivePolicy, lastPolicySyncStatus, lastEventSyncStatus, queuedEvents: eventQueue.length });
                return;
            }


            if (type === 'GET_DEBUG_STATE') {
                sendResponse({
                    user: currentUser,
                    organizationId: currentUser?.orgId || null,
                    groupIds: effectivePolicy?.groupIds || [],
                    policyVersion: effectivePolicy?.policyVersion || 0,
                    fetchedAt: effectivePolicy?.fetchedAt || null,
                    lastPolicySyncStatus,
                    lastEventSyncStatus,
                    queuedEvents: eventQueue.length,
                    backendHealth: API_ENDPOINT,
                });
                return;
            }

            if (type === 'SIGN_IN_EMAIL') {
                await chrome.storage.local.set({ sessionScanned: 0, sessionBlocked: 0 }); // Reset local stats
                try {
                    var fbData = await firebaseSignInEmail(payload.email, payload.password);
                    var result = await completeSignIn(fbData);
                    sendResponse(result);
                } catch (e) { sendResponse({ error: e.message }); }
                return;
            }

            if (type === 'SIGN_IN_LICENSE') {
                await chrome.storage.local.set({ sessionScanned: 0, sessionBlocked: 0 });
                try {
                    var result = await loginWithLicense(payload.licenseKey);
                    sendResponse(result);
                } catch (e) { sendResponse({ error: e.message }); }
                return;
            }

            if (type === 'SIGN_IN_GOOGLE') {
                await chrome.storage.local.set({ sessionScanned: 0, sessionBlocked: 0 }); // Reset local stats
                try {
                    var result = await signInWithGoogle();
                    sendResponse(result);
                } catch (e) { sendResponse({ error: e.message }); }
                return;
            }

            if (type === 'SIGN_OUT') {
                await clearUser();
                effectivePolicy = null;
                eventQueue = [];
                await chrome.storage.local.set({ sessionScanned: 0, sessionBlocked: 0 });
                console.log('[Complyze] User signed out (stats reset).');
                sendResponse({ ok: true });
                return;
            }

            if (type === 'SET_SHIELD_ACTIVE') {
                if (currentUser) {
                    currentUser.shieldActive = payload.active;
                    chrome.storage.local.set({ currentUser });
                }
                sendResponse({ ok: true });
                return;
            }

            if (type === 'REFRESH_STATS') {
                try {
                    var stats = await fetchStats();
                    // Merge local stats even on refresh to keep them live
                    const localStats = await chrome.storage.local.get(['sessionScanned', 'sessionBlocked']);
                    stats.scannedToday = (stats.scannedToday || 0) + (localStats.sessionScanned || 0);
                    stats.blockedToday = (stats.blockedToday || 0) + (localStats.sessionBlocked || 0);
                    sendResponse({ user: currentUser, stats });
                } catch (e) { sendResponse({ user: currentUser, stats: null }); }
                return;
            }

            // ── Content script messages ───────────────────────────────────────────
            if (type === 'SCAN_PROMPT') {
                if (currentUser && currentUser.shieldActive === false) {
                    sendResponse({ action: 'allow', message: 'Shield disabled', riskScore: 0 });
                    return;
                }
                try {
                    // Pre-increment local scanned count
                    const data = await chrome.storage.local.get(['sessionScanned']);
                    await chrome.storage.local.set({ sessionScanned: (data.sessionScanned || 0) + 1 });

                    var scanResult = await scanPrompt(payload);

                    if (scanResult && scanResult.action === 'block') {
                        const blk = await chrome.storage.local.get(['sessionBlocked']);
                        await chrome.storage.local.set({ sessionBlocked: (blk.sessionBlocked || 0) + 1 });
                    }

                    // Debug: log the full decision path so we can verify correct flow
                    if (scanResult) {
                        console.log('[Complyze] Scan result:', {
                            action: scanResult.action,
                            decision_source: scanResult.decision_source,
                            model_used: scanResult.model_used,
                            policy_used: scanResult.policy_used,
                            blocked_locally: scanResult.blocked_locally,
                            riskScore: scanResult.riskScore,
                        });
                    }

                    sendResponse(scanResult);
                } catch (e) {
                    console.error('[Complyze] Scan fallback triggered:', e.message);

                    const fallbackResult = {
                        action: 'warn',
                        message: 'Data security analysis is offline. Proceed with caution. Error: ' + e.message,
                        riskScore: 0,
                        decision_source: 'extension_error_fallback',
                        timestamp: Date.now()
                    };

                    // Log this warning to the dashboard so it shows up in real-time activity
                    logActivity({
                        action: 'warn',
                        aiTool: payload.aiTool || 'Unknown',
                        promptSnippet: payload.prompt ? payload.prompt.substring(0, 100) : '',
                        findings: ['Engine Offline'],
                        riskScore: 0,
                        message: fallbackResult.message
                    }).catch(() => { });

                    sendResponse(fallbackResult);
                }
                return;
            }

            if (type === 'LOG_ACTIVITY') {
                try {
                    // ISSUE 2 FIX: If the content script logged a block, increment local counter
                    // so the sidebar updates instantly without waiting for a backend poll.
                    if (payload.action === 'block' || payload.blocked === true) {
                        const blk = await chrome.storage.local.get(['sessionBlocked']);
                        await chrome.storage.local.set({ sessionBlocked: (blk.sessionBlocked || 0) + 1 });
                    }
                    var logResult = await logActivity(payload);
                    sendResponse(logResult);
                } catch (e) { sendResponse({ error: e.message }); }
                return;
            }

            if (type === 'SCAN_FILE') {
                if (!inspectAttachments) {
                    sendResponse({ action: 'allow', message: 'Attachment inspection disabled' });
                    return;
                }
                if (currentUser && currentUser.shieldActive === false) {
                    sendResponse({ action: 'allow', message: 'Shield disabled' });
                    return;
                }
                try {
                    // For files, we treat the filename + content as the prompt
                    var filePayload = {
                        prompt: `[FILE: ${payload.fileName}] \n\n ${payload.content}`,
                        aiTool: payload.aiTool || "Unknown Tool",
                        context: "FILE_UPLOAD"
                    };
                    var scanResult = await scanPrompt(filePayload);
                    sendResponse(scanResult);
                } catch (e) { sendResponse({ action: 'allow', message: e.message }); }
                return;
            }

            // Unknown message type — respond to unblock the caller
            sendResponse({ error: 'Unknown message type: ' + type });
        })();

        return true; // Keep the message channel open while async work runs
    });
}
