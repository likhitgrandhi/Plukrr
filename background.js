chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ELEMENT_SELECTED') {
        // Store the data in storage
        chrome.storage.local.set({ lastSelection: request.data }, () => {
            console.log('Design data saved to storage');
            
            // Open results page in new tab
            chrome.tabs.create({
                url: chrome.runtime.getURL('results.html'),
                active: true
            });
        });
        
        // Also add to history
        addToHistory(request.data);
    }
    
    if (request.type === 'CAPTURE_SCREENSHOT') {
        const bounds = request.bounds;
        
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error('Screenshot failed:', chrome.runtime.lastError);
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
                    console.error('Crop failed:', err);
                    sendResponse({ screenshot: dataUrl });
                });
        });
        
        return true;
    }
});

// Add capture to history
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

// Crop screenshot to element bounds using OffscreenCanvas
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
