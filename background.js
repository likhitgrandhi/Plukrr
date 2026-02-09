// ============================================
// ExactAI - Background Service Worker
// Handles messaging, screenshot capture, and auth/subscription sync
// ============================================

// Track the results tab
let resultsTabId = null;
let extractionInProgress = false;

// Subscription sync interval (5 minutes)
const SYNC_INTERVAL = 5 * 60 * 1000;

// ============================================
// INITIALIZATION
// ============================================

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
            openOrFocusResultsTab();
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

        // Store the data in storage with a unique timestamp to ensure freshness
        const dataWithTimestamp = {
            ...request.data,
            _selectionTimestamp: Date.now()
        };

        // Clear extraction state and save data
        chrome.storage.local.set({
            lastSelection: dataWithTimestamp,
            extractionState: { inProgress: false, complete: true }
        }, () => {
            console.log('[Background] Design data saved to storage');

            // Open or focus results tab
            openOrFocusResultsTab();
        });

        // Also add to history
        addToHistory(request.data);
    }

    // Capture a single viewport segment (used by scroll-and-stitch full page capture)
    if (request.type === 'CAPTURE_VIEWPORT_SEGMENT') {
        chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Viewport segment capture failed:', chrome.runtime.lastError);
                sendResponse({ screenshot: null, error: chrome.runtime.lastError.message });
                return;
            }
            sendResponse({ screenshot: dataUrl });
        });
        return true;
    }

    // Stitch multiple screenshots together into one full page image
    if (request.type === 'STITCH_SCREENSHOTS') {
        const { segments, totalWidth, totalHeight, viewportHeight } = request;

        stitchScreenshots(segments, totalWidth, totalHeight, viewportHeight)
            .then(fullPageDataUrl => {
                sendResponse({ screenshot: fullPageDataUrl });
            })
            .catch(err => {
                console.error('[Background] Stitch failed:', err);
                // Return the first segment as fallback
                sendResponse({ screenshot: segments[0]?.dataUrl || null, error: err.message });
            });

        return true;
    }

    // Legacy: Capture full page screenshot (visible viewport only - fallback)
    if (request.type === 'CAPTURE_FULL_PAGE_SCREENSHOT') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error('[Background] Full page screenshot failed:', chrome.runtime.lastError);
                sendResponse({ screenshot: null, error: chrome.runtime.lastError.message });
                return;
            }

            if (!dataUrl) {
                sendResponse({ screenshot: null, error: 'No screenshot data' });
                return;
            }

            sendResponse({ screenshot: dataUrl });
        });

        return true;
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
// AUTH & SUBSCRIPTION HANDLERS
// ============================================

async function handleGetAuthStatus() {
    try {
        const result = await chrome.storage.local.get(['exactai_auth', 'exactai_trial', 'exactai_subscription']);

        return {
            isAuthenticated: !!(result.exactai_auth && result.exactai_auth.accessToken),
            user: result.exactai_auth?.user || null,
            trial: result.exactai_trial || null,
            subscription: result.exactai_subscription || null
        };
    } catch (error) {
        console.error('[Background] Get auth status error:', error);
        return { isAuthenticated: false, error: error.message };
    }
}

async function handleSyncSubscription() {
    try {
        // This would typically call the subscription service
        // For now, just return the cached status
        const result = await chrome.storage.local.get(['exactai_subscription']);
        return { success: true, subscription: result.exactai_subscription };
    } catch (error) {
        console.error('[Background] Sync subscription error:', error);
        return { success: false, error: error.message };
    }
}

async function handleCheckFeatureAccess(feature) {
    try {
        const result = await chrome.storage.local.get(['exactai_subscription', 'exactai_trial']);

        const subscription = result.exactai_subscription;
        const trial = result.exactai_trial;

        // Default feature access
        let hasAccess = false;

        // Check trial first
        if (trial && trial.startDate) {
            const startDate = new Date(trial.startDate);
            const totalDays = trial.days || 7;
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + totalDays);

            if (new Date() < endDate) {
                // Trial active - all features available
                hasAccess = true;
            }
        }

        // Check subscription
        if (subscription && subscription.isActive) {
            const tier = subscription.tier;

            // Feature gating based on tier
            const featureAccess = {
                basicExtraction: ['free', 'trial', 'pro', 'pro-plus', 'lifetime'],
                aiEnhancements: ['trial', 'pro', 'pro-plus', 'lifetime'],
                shadcnComponents: ['trial', 'pro', 'pro-plus', 'lifetime'],
                fullPageExtraction: ['trial', 'pro', 'pro-plus', 'lifetime'],
                animationCapture: ['trial', 'pro-plus', 'lifetime']
            };

            if (featureAccess[feature] && featureAccess[feature].includes(tier)) {
                hasAccess = true;
            }
        }

        return { hasAccess, feature };
    } catch (error) {
        console.error('[Background] Check feature access error:', error);
        return { hasAccess: false, error: error.message };
    }
}

// ============================================
// TAB MANAGEMENT
// ============================================

function openOrFocusResultsTab() {
    // Check if results tab already exists and is still valid
    if (resultsTabId) {
        chrome.tabs.get(resultsTabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                // Tab doesn't exist anymore, create a new one
                resultsTabId = null;
                openResultsTab();
            } else {
                // Tab exists - reload it and focus
                chrome.tabs.reload(resultsTabId, {}, () => {
                    chrome.tabs.update(resultsTabId, { active: true });
                });
            }
        });
    } else {
        openResultsTab();
    }
}

function openResultsTab() {
    chrome.tabs.create({
        url: chrome.runtime.getURL('results.html'),
        active: true
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
    const { viewportX, viewportY, width, height, devicePixelRatio } = bounds;

    const scaledX = Math.round(viewportX * devicePixelRatio);
    const scaledY = Math.round(viewportY * devicePixelRatio);
    const scaledWidth = Math.round(width * devicePixelRatio);
    const scaledHeight = Math.round(height * devicePixelRatio);

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
// FULL PAGE SCREENSHOT STITCHING
// ============================================

async function stitchScreenshots(segments, totalWidth, totalHeight, viewportHeight) {
    if (!segments || segments.length === 0) {
        throw new Error('No segments to stitch');
    }

    // If only one segment, just return it
    if (segments.length === 1) {
        return segments[0].dataUrl;
    }

    console.log(`[Background] Stitching ${segments.length} segments into ${totalWidth}x${totalHeight} image`);

    // Get device pixel ratio from first segment
    const firstResponse = await fetch(segments[0].dataUrl);
    const firstBlob = await firstResponse.blob();
    const firstBitmap = await createImageBitmap(firstBlob);
    const dpr = firstBitmap.width / totalWidth;

    // Create canvas for full page
    const scaledWidth = Math.round(totalWidth * dpr);
    const scaledHeight = Math.round(totalHeight * dpr);

    // Limit max dimensions to avoid memory issues (max 16384 px in any dimension)
    const maxDimension = 16384;
    let scale = 1;
    if (scaledWidth > maxDimension || scaledHeight > maxDimension) {
        scale = Math.min(maxDimension / scaledWidth, maxDimension / scaledHeight);
        console.log(`[Background] Scaling down to ${scale} to fit within ${maxDimension}px limit`);
    }

    const finalWidth = Math.round(scaledWidth * scale);
    const finalHeight = Math.round(scaledHeight * scale);

    const canvas = new OffscreenCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, finalWidth, finalHeight);

    // Draw each segment
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const response = await fetch(segment.dataUrl);
        const blob = await response.blob();
        const imageBitmap = await createImageBitmap(blob);

        const yOffset = Math.round(segment.scrollY * dpr * scale);
        const drawWidth = Math.round(imageBitmap.width * scale);
        const drawHeight = Math.round(imageBitmap.height * scale);

        // For the last segment, we may need to clip to avoid overlap
        let sourceHeight = imageBitmap.height;
        let targetHeight = drawHeight;

        if (i === segments.length - 1 && segments.length > 1) {
            // Last segment - calculate how much of it we actually need
            const expectedY = segment.scrollY * dpr * scale;
            const remainingHeight = finalHeight - expectedY;
            if (remainingHeight < targetHeight) {
                const clipRatio = remainingHeight / targetHeight;
                sourceHeight = Math.round(imageBitmap.height * clipRatio);
                targetHeight = Math.round(remainingHeight);
            }
        }

        ctx.drawImage(
            imageBitmap,
            0, 0, imageBitmap.width, sourceHeight,
            0, yOffset, drawWidth, targetHeight
        );

        imageBitmap.close();
    }

    firstBitmap.close();

    // Convert to data URL (use JPEG for large images to reduce size)
    const useJpeg = finalHeight > 4000;
    const blob = await canvas.convertToBlob({
        type: useJpeg ? 'image/jpeg' : 'image/png',
        quality: useJpeg ? 0.85 : undefined
    });

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// ============================================
// PERIODIC SUBSCRIPTION SYNC (Alarm-based)
// ============================================

// Set up alarm for periodic sync
chrome.alarms.create('syncSubscription', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'syncSubscription') {
        console.log('[Background] Running periodic subscription sync');
        // In a full implementation, this would sync with Supabase
        // For now, just log that it ran
    }
});
