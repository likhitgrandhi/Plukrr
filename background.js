// ============================================
// Plukrr - Background Service Worker
// Handles messaging, screenshot capture, and access sync
// ============================================

// Track the results tab
let resultsTabId = null;
let extractionInProgress = false;


// Subscription sync interval (5 minutes)
const SYNC_INTERVAL = 5 * 60 * 1000;

// ============================================
// INITIALIZATION
// ============================================

// Open side panel when toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Initialize on install
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Background] Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
        // First install - could show onboarding
        console.log('[Background] First install - initializing...');
    }
});

// Clean up tracking when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === resultsTabId) {
        resultsTabId = null;
    }
});

// ============================================
// MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Auth tokens from web app bridge (content script)
    if (request.type === 'AUTH_TOKEN_FROM_WEBAPP') {
        const authData = {
            accessToken: request.accessToken,
            refreshToken: request.refreshToken,
            user: request.user,
            expiresAt: request.expiresAt
        };

        chrome.storage.local.set({ plukrr_auth: authData }, async () => {
            console.log('[Background] Auth tokens stored from web app bridge');

            // Immediately fetch access info
            if (typeof AccessClient !== 'undefined') {
                await AccessClient.forceRefresh();
            }

            sendResponse({ success: true });
        });

        return true;
    }

    if (request.type === 'SIGN_OUT_FROM_WEBAPP') {
        // Clear auth and access data
        chrome.storage.local.remove(['plukrr_auth', 'plukrr_access'], () => {
            console.log('[Background] Auth cleared via web app bridge sign out');
            sendResponse({ success: true });
        });
        return true;
    }

    // Auth-related messages
    if (request.type === 'GET_AUTH_STATUS') {
        handleGetAuthStatus().then(sendResponse);
        return true;
    }

    if (request.type === 'SYNC_SUBSCRIPTION') {
        handleSyncSubscription().then(sendResponse);
        return true;
    }

    if (request.type === 'CHECK_FEATURE_ACCESS') {
        handleCheckFeatureAccess(request.feature).then(sendResponse);
        return true;
    }

    // Screenshot capture for component preview
    if (request.action === 'CAPTURE_TAB') {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                sendResponse({ dataUrl: null });
            } else {
                sendResponse({ dataUrl: dataUrl || null });
            }
        });
        return true; // async sendResponse
    }

    // Clear old selection when starting a new selection
    if (request.type === 'START_SELECTION') {
        extractionInProgress = false;
        chrome.storage.local.remove(['lastSelection', 'extractionState'], () => {
            console.log('[Background] Cleared old selection data');
            sendResponse({ status: 'cleared' });
        });
        return true;
    }

    // Handle extraction started notification
    if (request.type === 'EXTRACTION_STARTED') {
        extractionInProgress = true;
        const estimatedElements = request.estimatedElements || 0;
        const isComplex = estimatedElements > 50;

        console.log(`[Background] Extraction started: ~${estimatedElements} elements`);

        // Store extraction state so results page knows to show loading
        chrome.storage.local.set({
            extractionState: {
                inProgress: true,
                estimatedElements: estimatedElements,
                startTime: Date.now(),
                isComplex: isComplex
            }
        });

        // If complex, pre-open the results tab with loading state
        if (isComplex) {
            openOrFocusResultsTab({ activate: false });
        }

        sendResponse({ status: 'acknowledged' });
        return true;
    }

    // Handle extraction failure
    if (request.type === 'EXTRACTION_FAILED') {
        extractionInProgress = false;
        console.error('[Background] Extraction failed:', request.error);

        // Update extraction state to show error
        chrome.storage.local.set({
            extractionState: {
                inProgress: false,
                failed: true,
                error: request.error
            }
        });

        sendResponse({ status: 'error_recorded' });
        return true;
    }

    if (request.type === 'ELEMENT_SELECTED') {
        extractionInProgress = false;

        if (request.data?._alreadySaved) {
            // Data was already saved to storage by the content script
            // Just handle history and open the results tab
            console.log('[Background] Data already saved by content script, opening results tab');

            recordFreeSelection().then(() => {
                openOrFocusResultsTab({ activate: true });
            });

            addToHistory(request.data);
            sendResponse({ status: 'saved' });
        } else {
            // Legacy path: data sent via message (small elements)
            const dataWithTimestamp = {
                ...request.data,
                _selectionTimestamp: Date.now()
            };

            chrome.storage.local.set({
                lastSelection: dataWithTimestamp,
                extractionState: { inProgress: false, complete: true }
            }, async () => {
                if (chrome.runtime.lastError) {
                    console.error('[Background] Storage save failed:', chrome.runtime.lastError);
                    sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
                    return;
                }

                console.log('[Background] Design data saved to storage');
                await recordFreeSelection();
                openOrFocusResultsTab({ activate: true });
                sendResponse({ status: 'saved' });
            });

            addToHistory(request.data);
        }

        return true; // Keep message channel open for async sendResponse
    }

    if (request.type === 'CAPTURE_SCREENSHOT') {
        const bounds = request.bounds;

        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Screenshot failed:', chrome.runtime.lastError);
                sendResponse({ screenshot: null, error: chrome.runtime.lastError.message });
                return;
            }

            if (!dataUrl) {
                sendResponse({ screenshot: null, error: 'No screenshot data' });
                return;
            }

            cropScreenshot(dataUrl, bounds)
                .then(croppedDataUrl => {
                    sendResponse({ screenshot: croppedDataUrl });
                })
                .catch(err => {
                    console.error('[Background] Crop failed:', err);
                    sendResponse({ screenshot: dataUrl });
                });
        });

        return true;
    }
});

// ============================================
// EXTERNAL MESSAGE HANDLING (from web app)
// ============================================

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    console.log('[Background] External message received:', request.type, 'from:', sender.url);

    if (request.type === 'AUTH_TOKEN') {
        // Store auth tokens from web app
        const authData = {
            accessToken: request.accessToken,
            refreshToken: request.refreshToken,
            user: request.user,
            expiresAt: request.expiresAt
        };

        chrome.storage.local.set({ plukrr_auth: authData }, async () => {
            console.log('[Background] Auth tokens stored from web app');

            // Immediately fetch access info
            if (typeof AccessClient !== 'undefined') {
                await AccessClient.forceRefresh();
            }

            sendResponse({ success: true });
        });

        return true;
    }

    if (request.type === 'SIGN_OUT') {
        // Clear auth and access data
        chrome.storage.local.remove(['plukrr_auth', 'plukrr_access'], () => {
            console.log('[Background] Auth cleared via web app sign out');
            sendResponse({ success: true });
        });
        return true;
    }

    sendResponse({ error: 'Unknown message type' });
    return true;
});

// ============================================
// AUTH & ACCESS HANDLERS
// ============================================

async function handleGetAuthStatus() {
    try {
        const result = await chrome.storage.local.get(['plukrr_auth', 'plukrr_access']);

        return {
            isAuthenticated: !!(result.plukrr_auth && result.plukrr_auth.accessToken),
            user: result.plukrr_auth?.user || null,
            access: result.plukrr_access || null
        };
    } catch (error) {
        console.error('[Background] Get auth status error:', error);
        return { isAuthenticated: false, error: error.message };
    }
}

async function handleSyncSubscription() {
    try {
        if (typeof AccessClient !== 'undefined') {
            const access = await AccessClient.forceRefresh();
            return { success: true, access };
        }
        return { success: false, error: 'AccessClient not available' };
    } catch (error) {
        console.error('[Background] Sync access error:', error);
        return { success: false, error: error.message };
    }
}

async function handleCheckFeatureAccess(feature) {
    try {
        if (typeof AccessClient !== 'undefined') {
            const hasAccess = await AccessClient.hasFeature(feature);
            return { hasAccess, feature };
        }

        // Fallback: check from cached data
        const result = await chrome.storage.local.get(['plukrr_access']);
        const access = result.plukrr_access;
        const hasAccess = access?.features?.[feature] ?? false;
        return { hasAccess, feature };
    } catch (error) {
        console.error('[Background] Check feature access error:', error);
        return { hasAccess: false, error: error.message };
    }
}

async function recordFreeSelection() {
    try {
        const result = await chrome.storage.local.get(['plukrr_access', 'plukrr_usage']);
        const access = result.plukrr_access;

        // Only record for Free tier users
        if (access && access.tier !== 'free') {
            return;
        }

        // Increment selection count
        const usage = result.plukrr_usage || { selectionsUsed: 0 };
        usage.selectionsUsed = (usage.selectionsUsed || 0) + 1;
        usage.lastSelectionAt = new Date().toISOString();

        await chrome.storage.local.set({ plukrr_usage: usage });
        console.log('[Background] Free selection recorded:', usage.selectionsUsed);
    } catch (error) {
        console.error('[Background] Failed to record free selection:', error);
    }
}

// ============================================
// TAB MANAGEMENT
// ============================================

function openOrFocusResultsTab({ activate } = { activate: true }) {
    // Check if results tab already exists and is still valid
    if (resultsTabId) {
        chrome.tabs.get(resultsTabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                // Tab doesn't exist anymore, create a new one
                resultsTabId = null;
                openResultsTab(activate);
            } else {
                if (activate) {
                    chrome.tabs.update(resultsTabId, { active: true });
                }
            }
        });
    } else {
        openResultsTab(activate);
    }
}

function openResultsTab(activate = true) {
    chrome.tabs.create({
        url: chrome.runtime.getURL('results.html'),
        active: activate
    }, (tab) => {
        resultsTabId = tab.id;
    });
}

// ============================================
// HISTORY MANAGEMENT
// ============================================

async function addToHistory(data) {
    const MAX_HISTORY = 10;

    const result = await chrome.storage.local.get(['captureHistory']);
    let history = result.captureHistory || [];

    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        pageTitle: data.pageTitle || 'Unknown',
        pageUrl: data.pageUrl || '',
        elementTag: data.tree?.tag || 'element',
        elementRole: data.tree?.role || 'element',
        elementCount: data.elementCount || 1,
        thumbnail: data.screenshot || null,
        data: data
    };

    history.unshift(historyItem);

    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }

    await chrome.storage.local.set({ captureHistory: history });
}

// ============================================
// SCREENSHOT UTILITIES
// ============================================

async function cropScreenshot(dataUrl, bounds) {
    const { viewportX, viewportY, width, height, devicePixelRatio, viewportWidth, viewportHeight } = bounds;

    // Calculate the visible portion of the element within the viewport
    // For elements larger than viewport, crop to the visible intersection
    const visibleX = Math.max(0, viewportX);
    const visibleY = Math.max(0, viewportY);
    const visibleRight = Math.min(viewportWidth || width, viewportX + width);
    const visibleBottom = Math.min(viewportHeight || height, viewportY + height);
    const visibleWidth = visibleRight - visibleX;
    const visibleHeight = visibleBottom - visibleY;

    if (visibleWidth < 1 || visibleHeight < 1) {
        return dataUrl;
    }

    const scaledX = Math.round(visibleX * devicePixelRatio);
    const scaledY = Math.round(visibleY * devicePixelRatio);
    const scaledWidth = Math.round(visibleWidth * devicePixelRatio);
    const scaledHeight = Math.round(visibleHeight * devicePixelRatio);

    if (scaledWidth < 1 || scaledHeight < 1) {
        return dataUrl;
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    const sourceX = Math.max(0, Math.min(scaledX, imageBitmap.width - 1));
    const sourceY = Math.max(0, Math.min(scaledY, imageBitmap.height - 1));
    const sourceWidth = Math.min(scaledWidth, imageBitmap.width - sourceX);
    const sourceHeight = Math.min(scaledHeight, imageBitmap.height - sourceY);

    if (sourceWidth < 1 || sourceHeight < 1) {
        return dataUrl;
    }

    const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(
        imageBitmap,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, sourceWidth, sourceHeight
    );

    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(croppedBlob);
    });
}

// ============================================
// PERIODIC ACCESS SYNC (Alarm-based)
// ============================================

// Set up alarm for periodic sync
chrome.alarms.create('syncAccess', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'syncAccess') {
        console.log('[Background] Running periodic access sync');
        if (typeof AccessClient !== 'undefined') {
            await AccessClient.forceRefresh();
        }
    }
});
