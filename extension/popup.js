/**
 * popup.js — Complyze Extension Popup v1.2.0
 */

// ── DOM ───────────────────────────────────────────────────────────────────────
const loginPanel = document.getElementById('login-panel');
const mainPanel = document.getElementById('main-panel');
const hdrDot = document.getElementById('hdr-dot');

// Login
const btnGoogle = document.getElementById('btn-google');
const inputEmail = document.getElementById('input-email');
const inputPwd = document.getElementById('input-password');
const btnSignin = document.getElementById('btn-signin');
const signinLabel = document.getElementById('btn-signin-label');
const signinSpinner = document.getElementById('signin-spinner');
const errorMsg = document.getElementById('error-msg');

// Main
const avLetter = document.getElementById('av-letter');
const uName = document.getElementById('u-name');
const uEmail = document.getElementById('u-email');
const uOrg = document.getElementById('u-org');
const shBadge = document.getElementById('sh-badge');
const shieldToggle = document.getElementById('shield-toggle');
const statScanned = document.getElementById('stat-scanned');
const statBlocked = document.getElementById('stat-blocked');
const btnDash = document.getElementById('btn-dash');
const btnRefresh = document.getElementById('btn-refresh');
const btnSignout = document.getElementById('btn-signout');
const footerLink = document.getElementById('footer-link');
const privacyLink = document.getElementById('privacy-link');

// Scan status card
const scanCard = document.getElementById('scan-status-card');
const scanIcon = document.getElementById('scan-icon');
const scanTitle = document.getElementById('scan-title');
const scanTime = document.getElementById('scan-time');
const scanBody = document.getElementById('scan-body');
const scanSnippet = document.getElementById('scan-snippet');
const scanFindings = document.getElementById('scan-findings');
const dbgUser = document.getElementById('dbg-user');
const dbgOrg = document.getElementById('dbg-org');
const dbgGroups = document.getElementById('dbg-groups');
const dbgPolicyVersion = document.getElementById('dbg-policy-version');
const dbgFetchedAt = document.getElementById('dbg-fetched-at');
const dbgPolicySync = document.getElementById('dbg-policy-sync');
const dbgEventSync = document.getElementById('dbg-event-sync');
const dbgQueued = document.getElementById('dbg-queued');
const dbgBackend = document.getElementById('dbg-backend');

// ── Messaging ─────────────────────────────────────────────────────────────────
function msg(type, payload) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(res);
        });
    });
}

// ── Scan status card ──────────────────────────────────────────────────────────
function timeSince(ms) {
    if (!ms) return '—';
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
}

function renderScanCard(last) {
    // Remove previous state classes
    scanCard.classList.remove('idle', 'safe', 'redact', 'block');

    if (!last || !last.action) {
        scanCard.classList.add('idle');
        scanIcon.textContent = '🛡️';
        scanTitle.textContent = 'NO SCANS YET';
        scanTime.textContent = '—';
        scanBody.style.display = 'none';
        return;
    }

    const { action, findings = [], message = '', promptSnippet = '', timestamp } = last;

    const cfg = {
        safe: { cls: 'safe', icon: '✅', label: 'SAFE' },
        redact: { cls: 'redact', icon: '✂️', label: 'AUTO-REDACTED' },
        block: { cls: 'block', icon: '🚫', label: 'BLOCKED' },
    }[action] || { cls: 'safe', icon: '✅', label: 'ALLOWED' };

    scanCard.classList.add(cfg.cls);
    scanIcon.textContent = cfg.icon;
    scanTitle.textContent = cfg.label;
    scanTime.textContent = timeSince(timestamp);

    if (findings.length > 0 || promptSnippet) {
        scanBody.style.display = 'block';
        scanSnippet.textContent = promptSnippet ? '"' + promptSnippet + (promptSnippet.length >= 80 ? '…' : '') + '"' : '';
        scanFindings.innerHTML = findings
            .map(f => `<span class="finding-tag">${f.label || f}</span>`)
            .join('');
    } else if (message) {
        scanBody.style.display = 'block';
        scanSnippet.textContent = message;
        scanFindings.innerHTML = '';
    } else {
        scanBody.style.display = 'none';
    }
}

// ── Render logged-in view ─────────────────────────────────────────────────────
function renderMain(user, stats, lastScan) {
    loginPanel.style.display = 'none';
    mainPanel.style.display = 'block';
    btnSignout.style.display = 'flex';

    hdrDot.className = 'dot ' + (user.shieldActive !== false ? 'on' : 'warn');

    const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    avLetter.textContent = initial;
    uName.textContent = user.displayName || user.email.split('@')[0];
    uEmail.textContent = user.email;
    uOrg.textContent = user.orgName || 'No Org';

    const active = user.shieldActive !== false;
    shieldToggle.checked = active;
    shBadge.textContent = active ? 'ACTIVE' : 'PAUSED';
    shBadge.className = 'sh-badge ' + (active ? 'on' : 'off');

    if (stats) {
        statScanned.textContent = stats.scannedToday ?? '—';
        statBlocked.textContent = stats.blockedToday ?? '—';
    }

    if (user.features && user.features.adminDashboard === false) {
        btnDash.style.display = 'none';
    } else {
        btnDash.style.display = 'flex';
    }

    renderScanCard(lastScan);
}

// ── Render logged-out ─────────────────────────────────────────────────────────
function renderLogout() {
    loginPanel.style.display = 'block';
    mainPanel.style.display = 'none';
    btnSignout.style.display = 'none';
    hdrDot.className = 'dot';
}


async function renderDebugPanel() {
    const d = await msg('GET_DEBUG_STATE');
    if (!d) return;
    dbgUser.textContent = d.user?.email || '—';
    dbgOrg.textContent = d.organizationId || '—';
    dbgGroups.textContent = (d.groupIds || []).join(', ') || '—';
    dbgPolicyVersion.textContent = String(d.policyVersion || 0);
    dbgFetchedAt.textContent = d.fetchedAt || '—';
    dbgPolicySync.textContent = d.lastPolicySyncStatus || '—';
    dbgEventSync.textContent = d.lastEventSyncStatus || '—';
    dbgQueued.textContent = String(d.queuedEvents || 0);
    dbgBackend.textContent = d.backendHealth || '—';
}

// ── Load state ────────────────────────────────────────────────────────────────
async function loadState() {
    const state = await msg('GET_AUTH_STATE');

    // Also read last scan result directly from storage
    const storageData = await new Promise(r => chrome.storage.local.get(['lastScanResult'], r));

    if (state && state.user) {
        renderMain(state.user, state.stats, storageData.lastScanResult);
        await renderDebugPanel();
    } else {
        renderLogout();
    }
}

// ── Events ────────────────────────────────────────────────────────────────────

// Google sign-in
btnGoogle.addEventListener('click', async () => {
    errorMsg.style.display = 'none';
    btnGoogle.disabled = true;
    btnGoogle.textContent = 'Signing in…';
    const result = await msg('SIGN_IN_GOOGLE');
    if (result && result.user) {
        const s = await new Promise(r => chrome.storage.local.get(['lastScanResult'], r));
        renderMain(result.user, result.stats, s.lastScanResult);
    } else {
        errorMsg.textContent = result?.error || 'Google sign-in failed.';
        errorMsg.style.display = 'block';
        btnGoogle.disabled = false;
        btnGoogle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google`;
    }
});

// Email sign-in
btnSignin.addEventListener('click', async () => {
    errorMsg.style.display = 'none';
    const email = inputEmail.value.trim();
    const pwd = inputPwd.value;
    if (!email || !pwd) {
        errorMsg.textContent = 'Please enter email and password.';
        errorMsg.style.display = 'block';
        return;
    }
    btnSignin.disabled = true;
    signinLabel.style.display = 'none';
    signinSpinner.style.display = 'block';

    const result = await msg('SIGN_IN_EMAIL', { email, password: pwd });
    if (result && result.user) {
        const s = await new Promise(r => chrome.storage.local.get(['lastScanResult'], r));
        renderMain(result.user, result.stats, s.lastScanResult);
    } else {
        errorMsg.textContent = result?.error || 'Sign-in failed. Check your credentials.';
        errorMsg.style.display = 'block';
    }
    btnSignin.disabled = false;
    signinLabel.style.display = 'inline';
    signinSpinner.style.display = 'none';
});

inputPwd.addEventListener('keydown', e => { if (e.key === 'Enter') btnSignin.click(); });
inputEmail.addEventListener('keydown', e => { if (e.key === 'Enter') inputPwd.focus(); });

// Shield toggle
shieldToggle.addEventListener('change', async () => {
    const active = shieldToggle.checked;
    shBadge.textContent = active ? 'ACTIVE' : 'PAUSED';
    shBadge.className = 'sh-badge ' + (active ? 'on' : 'off');
    hdrDot.className = 'dot ' + (active ? 'on' : 'warn');
    await msg('SET_SHIELD_ACTIVE', { active });
});

// Open dashboard (SSO)
btnDash.addEventListener('click', async () => {
    const state = await msg('GET_AUTH_STATE');
    const base = state?.apiEndpoint || 'https://api.complyze.co';
    const token = state?.user?.ssoToken;
    const url = token ? `${base}/auth/extension-sso?token=${encodeURIComponent(token)}` : `${base}/dashboard`;
    chrome.tabs.create({ url });
});

// Refresh
btnRefresh.addEventListener('click', async () => {
    btnRefresh.disabled = true;
    const state = await msg('REFRESH_STATS');
    const s = await new Promise(r => chrome.storage.local.get(['lastScanResult'], r));
    if (state && state.user) renderMain(state.user, state.stats, s.lastScanResult);
    btnRefresh.disabled = false;
});

// Sign out
btnSignout.addEventListener('click', async () => {
    await msg('SIGN_OUT');
    renderLogout();
});

// Footer
footerLink.addEventListener('click', () => chrome.tabs.create({ url: 'https://complyze.co' }));
privacyLink.addEventListener('click', () => chrome.tabs.create({ url: 'https://complyze.co/privacypolicy' }));

// Auto-refresh scan status every 3s while popup is open
setInterval(async () => {
    if (mainPanel.style.display === 'none') return;
    const s = await new Promise(r => chrome.storage.local.get(['lastScanResult'], r));
    if (s.lastScanResult) renderScanCard(s.lastScanResult);
    await renderDebugPanel();
}, 3000);

// ── Boot ──────────────────────────────────────────────────────────────────────
loadState();
