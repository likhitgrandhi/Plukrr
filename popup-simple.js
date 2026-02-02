// ============================================
// ExactAI - Popup Script
// Main extension popup with auth and subscription integration
// ============================================

let aiEnhancementEnabled = false;
let currentSubscription = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await initPopup();
});

async function initPopup() {
    const loadingScreen = document.getElementById('loadingScreen');
    const mainContent = document.getElementById('mainContent');

    try {
        // Check auth and subscription status
        await checkAuthAndSubscription();

        // Initialize AI status
        await initializeAIStatus();

        // Set up event listeners
        setupEventListeners();

        // Show main content
        loadingScreen.classList.add('hidden');
        mainContent.classList.add('active');

    } catch (error) {
        console.error('[Popup] Init error:', error);
        loadingScreen.classList.add('hidden');
        mainContent.classList.add('active');
    }
}

async function checkAuthAndSubscription() {
    // Check if services are available
    if (typeof AuthService === 'undefined' || typeof SubscriptionService === 'undefined') {
        console.warn('[Popup] Auth/Subscription services not loaded');
        return;
    }

    const isAuth = await AuthService.isAuthenticated();

    // Get subscription status
    currentSubscription = await SubscriptionService.getSubscriptionStatus();

    // Update UI based on subscription
    updateSubscriptionUI(currentSubscription);

    // Check if trial/subscription expired and user not authenticated
    if (!isAuth && currentSubscription.status === 'expired') {
        // Redirect to auth page
        window.location.href = 'auth.html';
        return;
    }

    // If no trial started yet, start one
    if (typeof TrialService !== 'undefined') {
        const trialStatus = await TrialService.getTrialStatus();
        if (!trialStatus.hasTrialStarted && !isAuth) {
            await TrialService.startTrial();
            currentSubscription = await SubscriptionService.getSubscriptionStatus();
            updateSubscriptionUI(currentSubscription);
        }
    }
}

function updateSubscriptionUI(subscription) {
    const subBadge = document.getElementById('subBadge');
    const trialBanner = document.getElementById('trialBanner');
    const trialDays = document.getElementById('trialDays');
    const extractGlobalBtn = document.getElementById('extractGlobalBtn');

    if (!subscription) return;

    // Show/update subscription badge
    subBadge.style.display = 'inline-block';
    subBadge.className = 'sub-badge';

    switch (subscription.tier) {
        case 'trial':
            subBadge.textContent = 'TRIAL';
            subBadge.classList.add('trial');
            // Show trial banner
            if (subscription.trialDaysRemaining !== undefined) {
                trialBanner.classList.add('active');
                trialDays.textContent = subscription.trialDaysRemaining;
            }
            break;
        case 'pro':
            subBadge.textContent = 'PRO';
            subBadge.classList.add('pro');
            trialBanner.classList.remove('active');
            break;
        case 'pro-plus':
            subBadge.textContent = 'PRO+';
            subBadge.classList.add('pro-plus');
            trialBanner.classList.remove('active');
            break;
        case 'lifetime':
            subBadge.textContent = 'LIFETIME';
            subBadge.classList.add('lifetime');
            trialBanner.classList.remove('active');
            break;
        case 'free':
        default:
            if (subscription.status === 'expired') {
                subBadge.textContent = 'EXPIRED';
                subBadge.classList.add('expired');
                trialBanner.classList.add('active');
                trialDays.textContent = '0';
            } else {
                subBadge.textContent = 'FREE';
                subBadge.classList.add('expired');
            }
            break;
    }

    // Update feature availability
    updateFeatureAvailability(subscription);
}

function updateFeatureAvailability(subscription) {
    const extractGlobalBtn = document.getElementById('extractGlobalBtn');

    // Check if full page extraction is available
    const hasFullPageAccess = subscription.isActive &&
        ['trial', 'pro', 'pro-plus', 'lifetime'].includes(subscription.tier);

    if (!hasFullPageAccess) {
        extractGlobalBtn.classList.add('locked');
        extractGlobalBtn.title = 'Upgrade to Pro to unlock full page extraction';
    } else {
        extractGlobalBtn.classList.remove('locked');
        extractGlobalBtn.title = '';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Select element button
    document.getElementById('selectBtn').addEventListener('click', handleSelectElement);

    // Extract full page button
    document.getElementById('extractGlobalBtn').addEventListener('click', handleExtractFullPage);

    // Live Edit button
    document.getElementById('liveEditBtn').addEventListener('click', handleLiveEdit);

    // AI Toggle - COMMENTED OUT (elements removed from HTML)
    // const aiToggle = document.getElementById('aiToggle');
    // if (aiToggle) aiToggle.addEventListener('change', handleAIToggle);

    // Settings - COMMENTED OUT (elements removed from HTML)
    // const settingsBtn = document.getElementById('settingsBtn');
    // if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    // const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    // if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettings);
    // const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
    // if (saveApiKeyBtn) saveApiKeyBtn.addEventListener('click', saveApiKey);
    // const settingsModal = document.getElementById('settingsModal');
    // if (settingsModal) settingsModal.addEventListener('click', (e) => {
    //     if (e.target.id === 'settingsModal') closeSettings();
    // });

    // Account button - go to dashboard if logged in, auth if not
    document.getElementById('accountBtn').addEventListener('click', async () => {
        const isAuth = await AuthService.isAuthenticated();
        if (isAuth) {
            chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
        }
    });

    // Account link - go to dashboard if logged in, auth if not
    document.getElementById('accountLink').addEventListener('click', async (e) => {
        e.preventDefault();
        const isAuth = await AuthService.isAuthenticated();
        if (isAuth) {
            chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
        } else {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
        }
    });

    // Upgrade button in banner
    document.getElementById('upgradeBtnBanner').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
}

// ============================================
// MAIN ACTIONS
// ============================================

async function handleSelectElement() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Check for blocked URLs - only block known system pages, allow unknown/empty URLs to try
    const url = tab.url || '';
    const isSystemPage = url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('comet-extension://') || url.startsWith('about:') || url.startsWith('edge://');
    if (isSystemPage) {
        document.getElementById('status').innerText = 'Cannot run on browser system pages.';
        return;
    }

    try {
        // Clear old selection data FIRST before starting new selection
        chrome.runtime.sendMessage({ type: 'START_SELECTION' });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Store AI state for results page
        chrome.storage.local.set({ aiEnabled: aiEnhancementEnabled });

        chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                document.getElementById('status').innerText = 'Error: Please refresh the page and try again.';
            } else {
                window.close();
            }
        });
    } catch (e) {
        console.error('Injection failed:', e);
        document.getElementById('status').innerText = 'Cannot run on this page. For local files, enable "Allow access to file URLs" in extension settings.';
    }
}

async function handleLiveEdit() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Check for blocked URLs early
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('comet-extension://') || url.startsWith('about:') || url.startsWith('edge://')) {
        document.getElementById('status').innerText = 'Cannot run on browser system pages.';
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        chrome.tabs.sendMessage(tab.id, { action: 'START_LIVE_EDIT' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                document.getElementById('status').innerText = 'Error: Please refresh the page and try again.';
            } else {
                window.close();
            }
        });
    } catch (e) {
        console.error('Injection failed:', e);
        document.getElementById('status').innerText = 'Cannot run on this page. For local files, enable "Allow access to file URLs" in extension settings.';
    }
}

async function handleExtractFullPage() {
    // Check feature access
    if (currentSubscription && !currentSubscription.isActive) {
        document.getElementById('status').innerHTML = '<span style="color: #e57373;">Please upgrade to use this feature</span>';
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        document.getElementById('status').innerText = 'Error: No active tab found.';
        return;
    }

    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('comet-extension://') || tab.url?.startsWith('about:')) {
        document.getElementById('status').innerText = 'Cannot run on browser system pages.';
        return;
    }

    const statusEl = document.getElementById('status');
    const extractBtn = document.getElementById('extractGlobalBtn');

    statusEl.innerHTML = '<span style="color: #6b8f71;">⏳ Scanning page...</span>';
    extractBtn.disabled = true;
    extractBtn.querySelector('span').textContent = 'Scanning...';

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        await new Promise(resolve => setTimeout(resolve, 100));

        // Store AI state for results page
        chrome.storage.local.set({ aiEnabled: aiEnhancementEnabled });

        chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_GLOBAL_THEME' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + chrome.runtime.lastError.message + '</span>';
                extractBtn.disabled = false;
                extractBtn.querySelector('span').textContent = 'Extract Full Page';
                return;
            }

            if (response && response.status === 'error') {
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + (response.message || 'Unknown error') + '</span>';
                extractBtn.disabled = false;
                extractBtn.querySelector('span').textContent = 'Extract Full Page';
                return;
            }

            window.close();
        });
    } catch (e) {
        console.error('Injection failed:', e);
        statusEl.innerHTML = '<span style="color: #e57373;">Cannot run on this page.</span>';
        extractBtn.disabled = false;
        extractBtn.querySelector('span').textContent = 'Extract Full Page';
    }
}

// ============================================
// AI STATUS MANAGEMENT
// ============================================

async function initializeAIStatus() {
    // AI Toggle elements are commented out - just track state internally
    const aiToggle = document.getElementById('aiToggle');
    const aiStatus = document.getElementById('aiStatus');

    chrome.storage.local.get(['geminiApiKey', 'aiEnabled'], async (result) => {
        if (result.geminiApiKey) {
            if (aiStatus) aiStatus.textContent = 'Ready';
            if (aiToggle) aiToggle.checked = result.aiEnabled !== false;
            aiEnhancementEnabled = result.aiEnabled !== false;
        } else {
            if (aiStatus) aiStatus.textContent = 'Click ⚙️ to setup';
            if (aiToggle) aiToggle.checked = false;
            aiEnhancementEnabled = false;
        }
    });
}

async function handleAIToggle(e) {
    const isChecked = e.target.checked;

    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (isChecked && !result.geminiApiKey) {
            e.target.checked = false;
            openSettings();
            return;
        }

        aiEnhancementEnabled = isChecked;
        chrome.storage.local.set({ aiEnabled: isChecked });
    });
}

// ============================================
// SETTINGS MODAL
// ============================================

function openSettings() {
    const modal = document.getElementById('settingsModal');
    const apiKeyInput = document.getElementById('apiKeyInput');

    modal.classList.add('active');

    // Load existing API key (masked)
    chrome.storage.local.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = '••••••••••••••••';
            apiKeyInput.dataset.hasKey = 'true';
        }
    });
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
}

async function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    const saveBtn = document.getElementById('saveApiKeyBtn');

    const key = apiKeyInput.value.trim();

    if (key === '••••••••••••••••') {
        closeSettings();
        return;
    }

    if (!key) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ Please enter an API key';
        statusEl.style.display = 'flex';
        return;
    }

    if (key.length < 20) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ API key seems too short';
        statusEl.style.display = 'flex';
        return;
    }

    statusEl.className = 'api-status checking';
    statusEl.innerHTML = '🔄 Validating...';
    statusEl.style.display = 'flex';
    saveBtn.disabled = true;

    try {
        // Simple validation - try to call the API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 10 }
            })
        });

        if (response.ok || response.status === 429) {
            // Save the key
            chrome.storage.local.set({ geminiApiKey: key, aiEnabled: true });

            statusEl.className = 'api-status valid';
            statusEl.innerHTML = '✓ API key saved!';

            aiEnhancementEnabled = true;
            document.getElementById('aiToggle').checked = true;
            document.getElementById('aiStatus').textContent = 'Ready';

            setTimeout(() => {
                closeSettings();
                statusEl.style.display = 'none';
            }, 1000);
        } else {
            statusEl.className = 'api-status invalid';
            statusEl.innerHTML = '✗ Invalid API key';
        }
    } catch (e) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '✗ Error: ' + e.message;
    }

    saveBtn.disabled = false;
}
