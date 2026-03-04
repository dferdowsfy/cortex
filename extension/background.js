var apiEndpoint = "http://localhost:3737";
var deploymentToken = "";
var organizationId = "";
var cachedIdentityEmail = "";
var installationId = "";

// 1. Capture Identity (Signed in Browser User)
async function getUserIdentity() {
    return new Promise((resolve) => {
        if (!chrome.identity) {
            resolve("unknown@domain.com");
            return;
        }
        chrome.identity.getProfileUserInfo((userInfo) => {
            if (chrome.runtime.lastError || !userInfo || !userInfo.email) {
                console.warn("[Complyze] Identity API failed or user unauthenticated.");
                resolve("unknown@domain.com");
            } else {
                console.log("[Complyze] Captured user identity:", userInfo.email);
                cachedIdentityEmail = userInfo.email;
                resolve(userInfo.email);
            }
        });
    });
}

// 2. Configuration & Installation ID Management
async function initialize() {
    return new Promise((resolve) => {
        // First try to load from Enterprise Managed Storage (MDM)
        chrome.storage.managed.get(['organizationId', 'deploymentToken'], (managed) => {
            if (managed.organizationId) {
                organizationId = managed.organizationId;
                deploymentToken = managed.deploymentToken;
                console.log("[Complyze] Config loaded from MDM Policy.");
            }

            // Then check local storage for persistence and manual overrides
            chrome.storage.local.get(['organizationId', 'deploymentToken', 'installationId'], (local) => {
                if (!organizationId && local.organizationId) {
                    organizationId = local.organizationId;
                    deploymentToken = local.deploymentToken;
                }

                if (!local.installationId) {
                    installationId = 'inst_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
                    chrome.storage.local.set({ installationId: installationId });
                    console.log("[Complyze] Generated new Installation ID:", installationId);
                } else {
                    installationId = local.installationId;
                }

                getUserIdentity().then(() => resolve());
            });
        });
    });
}

// 3. Centralized Request Handler
async function handleBackendRequest(url, method, body) {
    body = body || null;

    var headers = {
        "Content-Type": "application/json",
        "X-Organization-ID": organizationId || "default-org",
        "X-Installation-ID": installationId || "pending",
        "Authorization": "Bearer " + (deploymentToken || "dummy-token"),
    };

    if (cachedIdentityEmail && cachedIdentityEmail !== "unknown@domain.com") {
        headers["X-User-Email"] = cachedIdentityEmail;
    }

    var options = { method: method, headers: headers };
    if (body) {
        // Enforce installationId in payload for easy backend mapping
        body.installationId = installationId;
        body.userEmail = cachedIdentityEmail;
        options.body = JSON.stringify(body);
    }

    try {
        var res = await fetch(apiEndpoint + url, options);
        if (!res.ok) throw new Error("Backend request failed: " + res.status);
        return await res.json();
    } catch (e) {
        console.error("[Complyze] Network Error:", e.message);
        throw e;
    }
}

async function fetchPolicies() {
    try {
        var policies = await handleBackendRequest("/api/policies", "GET");
        console.log("[Complyze] Policies fetched:", policies);
        await chrome.storage.local.set({ policies: policies });
    } catch (e) { }
}

// Global Lifecycle Events
chrome.runtime.onInstalled.addListener(() => {
    initialize().then(() => fetchPolicies());
});

chrome.runtime.onStartup.addListener(() => {
    initialize().then(() => fetchPolicies());
});

// Communication with Content Scripts (PromptScanner)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SCAN_PROMPT") {
        handleBackendRequest("/api/scanPrompt", "POST", message.payload)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ action: "error", message: error.message }));
        return true;
    } else if (message.type === "LOG_ACTIVITY") {
        handleBackendRequest("/api/activity", "POST", message.payload)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ action: "error", message: error.message }));
        return true;
    }
});
