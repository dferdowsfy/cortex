/**
 * sidebar.js — Complyze Extension Sidebar v1.2.6
 * Handles authentication and health status display.
 */

const loginPanel = document.getElementById('login-panel');
const mainPanel = document.getElementById('main-panel');
const userFooter = document.getElementById('user-footer');
const hdrDot = document.getElementById('hdr-dot');

// Login
const emailInp = document.getElementById('email-inp');
const passInp = document.getElementById('pass-inp');
const loginBtn = document.getElementById('login-btn');
const googleBtn = document.getElementById('google-btn');
const loginErr = document.getElementById('login-err');

// Health / Main
const dotConnected = document.getElementById('dot-connected');
const valConnected = document.getElementById('val-connected');
const dotShield = document.getElementById('dot-shield');
const valShield = document.getElementById('val-shield');
const valLastSeen = document.getElementById('val-last-seen');
const statScanned = document.getElementById('stat-scanned');
const statBlocked = document.getElementById('stat-blocked');
const activityFeed = document.getElementById('activity-feed');

// --- Activity Log Management ---
let activityLog = [];

async function loadActivityLog() {
    const data = await chrome.storage.local.get(['sidebarActivityLog']);
    activityLog = data.sidebarActivityLog || [];
}

async function saveActivityLog() {
    await chrome.storage.local.set({ sidebarActivityLog: activityLog });
}

function addEventToLog(scanResult) {
    if (!scanResult || !scanResult.timestamp) return;

    // Avoid duplicates if interval triggers twice
    if (activityLog.length > 0 && activityLog[0].timestamp === scanResult.timestamp) return;

    const event = {
        action: scanResult.action,
        findings: Array.isArray(scanResult.findings) ? scanResult.findings : [scanResult.findings],
        timestamp: scanResult.timestamp,
        tool: scanResult.aiTool || 'AI Core'
    };

    activityLog.unshift(event);
    if (activityLog.length > 15) activityLog.pop(); // Keep last 15
    saveActivityLog();
}

// User
const uAvatar = document.getElementById('u-avatar');
const uName = document.getElementById('u-name');
const uEmail = document.getElementById('u-email');
const signoutBtn = document.getElementById('signout-btn');

// --- Helpers ---
function msg(type, payload) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type, payload }, (res) => {
            if (chrome.runtime.lastError) { resolve(null); return; }
            resolve(res);
        });
    });
}

function timeSince(ms) {
    if (!ms) return '—';
    const diff = Math.floor((Date.now() - ms) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
}

// --- Render Logic ---
function renderState(state, storage) {
    const user = state?.user;
    const stats = state?.stats;
    const lastScan = storage?.lastScanResult;

    if (!user) {
        loginPanel.classList.add('active');
        mainPanel.classList.remove('active');
        userFooter.style.display = 'none';
        hdrDot.classList.remove('on');
        return;
    }

    loginPanel.classList.remove('active');
    mainPanel.classList.add('active');
    userFooter.style.display = 'flex';

    // Update User Info
    uName.textContent = user.displayName || user.email.split('@')[0];
    uEmail.textContent = user.email;
    uAvatar.textContent = (user.displayName || user.email).charAt(0).toUpperCase();

    // Header Dot
    hdrDot.classList.toggle('on', user.shieldActive !== false);

    // Health
    const isShieldOn = user.shieldActive !== false;
    dotConnected.className = 'health-dot green';
    valConnected.textContent = 'Active';
    valConnected.className = 'health-val text-green-400';

    dotShield.className = 'health-dot green';
    valShield.textContent = isShieldOn ? 'Enforced' : 'Applied';
    valShield.className = 'health-val text-green-400';

    // Stats
    statScanned.textContent = stats?.scannedToday ?? 0;
    statBlocked.textContent = stats?.blockedToday ?? 0;

    // Last Activity Pulse
    valLastSeen.textContent = lastScan ? timeSince(lastScan.timestamp) : '—';

    // Activity Feed
    if (lastScan) addEventToLog(lastScan);

    if (activityLog.length === 0) {
        activityFeed.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px dashed var(--border);">
                <div style="font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;">Monitoring Active Sessions</div>
            </div>
        `;
    } else {
        activityFeed.innerHTML = activityLog.map(evt => {
            const isBlock = evt.action === 'block';
            const isRedact = evt.action === 'redact';
            const color = isBlock ? 'var(--red)' : (isRedact ? 'var(--amber)' : 'var(--green)');
            const bg = isBlock ? 'rgba(239, 68, 68, 0.08)' : (isRedact ? 'rgba(245, 158, 11, 0.08)' : 'rgba(34, 197, 94, 0.08)');
            const icon = isBlock ? '🚫' : (isRedact ? '✂️' : '✅');
            const label = evt.findings?.[0]?.label || evt.findings?.[0] || evt.action || 'Clean';

            return `
                <div style="background: ${bg}; border: 1px solid rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <div style="font-size: 16px;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="font-size: 11px; font-weight: 700; color: ${color}; text-transform: uppercase;">${evt.action}${isBlock || isRedact ? ' — Risk' : ''}</div>
                        <div style="font-size: 11px; font-weight: 500; color: #fff; margin-top: 1px;">${label}</div>
                    </div>
                    <div style="text-align: right;">
                         <div style="font-size: 9px; color: var(--muted); text-transform: uppercase; font-weight: 600;">${evt.tool.split('.')[0]}</div>
                         <div style="font-size: 8px; color: var(--muted); font-weight: 500; margin-top: 2px;">${new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function refresh() {
    const [state, storage] = await Promise.all([
        msg('GET_AUTH_STATE'),
        new Promise(r => chrome.storage.local.get(['lastScanResult'], r))
    ]);
    renderState(state, storage);
}

const licenseBtn = document.getElementById('license-btn');
const licenseInp = document.getElementById('license-inp');

// --- Listeners ---
loginBtn.addEventListener('click', async () => {
    loginErr.textContent = '';
    loginBtn.disabled = true;
    const res = await msg('SIGN_IN_EMAIL', { email: emailInp.value, password: passInp.value });
    if (res?.user) {
        refresh();
    } else {
        loginErr.textContent = res?.error || 'Login failed';
        loginBtn.disabled = false;
    }
});

licenseBtn.addEventListener('click', async () => {
    loginErr.textContent = '';
    const key = licenseInp.value.trim();
    if (!key) { loginErr.textContent = 'Please enter a license key'; return; }

    licenseBtn.disabled = true;
    licenseBtn.textContent = 'Activating...';

    const res = await msg('SIGN_IN_LICENSE', { licenseKey: key });
    if (res?.user) {
        refresh();
    } else {
        loginErr.textContent = res?.error || 'Activation failed';
        licenseBtn.disabled = false;
        licenseBtn.textContent = 'Activate Organization License';
    }
});

googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    const res = await msg('SIGN_IN_GOOGLE');
    if (res?.user) {
        refresh();
    } else {
        loginErr.textContent = res?.error || 'Google login failed';
        googleBtn.disabled = false;
    }
});

signoutBtn.addEventListener('click', async () => {
    await msg('SIGN_OUT');
    refresh();
});

document.getElementById('close-sidebar-btn').addEventListener('click', () => {
    window.parent.postMessage({ type: 'COMPLYZE_CLOSE_SIDEBAR' }, '*');
});

// --- Boot ---
loadActivityLog().then(() => {
    refresh();
    setInterval(refresh, 3000);
});
