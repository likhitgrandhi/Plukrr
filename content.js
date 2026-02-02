(function () {
    // Prevent multiple initializations
    if (window.hasDesignCopierLoaded) return;
    window.hasDesignCopierLoaded = true;

    let overlay = null;
    let toast = null;
    let loaderOverlay = null;
    let injectedStyleEl = null;
    let previewControlPanel = null;
    let isPreviewActive = false;
    let originalStylesBackup = null;

    // Element picker state
    let elementPickerPanel = null;
    let currentHoveredElement = null;
    let isPickerActive = false;

    // Live Edit state
    let liveEditMode = false;
    let liveEditPanel = null;
    let liveEditActionBar = null;
    let liveEditOverlay = null;
    let liveEditSelectionBorder = null; // Persistent selection border for editing element
    let currentEditElement = null;
    let editHistory = []; // Array of { element, selector, originalStyles, changes: [] }
    let debounceTimers = {}; // For debouncing input handlers

    function createOverlay() {
        if (document.getElementById('ai-design-copier-overlay')) {
            overlay = document.getElementById('ai-design-copier-overlay');
            return;
        }
        overlay = document.createElement('div');
        overlay.id = 'ai-design-copier-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            border: 2px solid #6b8f71 !important;
            background-color: rgba(107, 143, 113, 0.1) !important;
            transition: all 0.05s ease !important;
            display: none;
        `;
        document.body.appendChild(overlay);
    }

    function createToast() {
        if (document.getElementById('ai-design-copier-toast')) {
            toast = document.getElementById('ai-design-copier-toast');
            return;
        }
        toast = document.createElement('div');
        toast.id = 'ai-design-copier-toast';
        toast.style.cssText = `
            position: fixed !important;
            bottom: 24px !important;
            left: 50% !important;
            transform: translateX(-50%) translateY(100px) !important;
            background: #2d2d2d !important;
            color: white !important;
            padding: 14px 24px !important;
            border-radius: 12px !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            z-index: 2147483647 !important;
            opacity: 0 !important;
            transition: all 0.3s ease !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2) !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
        `;
        document.body.appendChild(toast);
    }

    function createLoader() {
        if (document.getElementById('ai-design-copier-loader')) {
            loaderOverlay = document.getElementById('ai-design-copier-loader');
            return loaderOverlay;
        }
        loaderOverlay = document.createElement('div');
        loaderOverlay.id = 'ai-design-copier-loader';
        loaderOverlay.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 2147483646;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <div style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid rgba(255,255,255,0.1);
                    border-top-color: #6b8f71;
                    border-radius: 50%;
                    animation: designCopierSpin 1s linear infinite;
                "></div>
                <div id="loader-status" style="
                    color: white;
                    margin-top: 20px;
                    font-size: 16px;
                    font-weight: 500;
                ">Scanning page styles...</div>
                <div id="loader-progress" style="
                    color: rgba(255,255,255,0.6);
                    margin-top: 8px;
                    font-size: 13px;
                ">Initializing...</div>
            </div>
            <style>
                @keyframes designCopierSpin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `;
        document.body.appendChild(loaderOverlay);
        return loaderOverlay;
    }

    function updateLoaderProgress(status, progress) {
        const statusEl = document.getElementById('loader-status');
        const progressEl = document.getElementById('loader-progress');
        if (statusEl) statusEl.textContent = status;
        if (progressEl) progressEl.textContent = progress;
    }

    function hideLoader() {
        if (loaderOverlay) {
            loaderOverlay.remove();
            loaderOverlay = null;
        }
    }

    function showToast(message, duration = 2500) {
        createToast();
        toast.innerHTML = `<span style="font-size:18px;">✓</span> ${message}`;

        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            toast.style.opacity = '0';
        }, duration);
    }

    function updateOverlay(el) {
        if (!overlay) createOverlay();
        const rect = el.getBoundingClientRect();
        overlay.style.top = `${rect.top}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.display = 'block';
    }

    function handleMouseMove(e) {
        const el = e.target;
        if (el === overlay || el.id === 'ai-design-copier-overlay' || el.id === 'ai-design-copier-toast') return;
        if (elementPickerPanel && elementPickerPanel.contains(el)) return;
        if (el.closest('#element-picker-panel')) return;

        currentHoveredElement = el;
        updateOverlay(el);
    }

    // ============================================
    // INTERACTIVE ELEMENT PICKER
    // ============================================

    function getElementPreview(el) {
        if (!el || el === document.body || el === document.documentElement) {
            return { tag: 'body', classes: '', id: '', preview: 'Page body' };
        }

        const tag = el.tagName?.toLowerCase() || 'unknown';
        const id = el.id ? `#${el.id}` : '';
        const classes = Array.from(el.classList || [])
            .filter(c => !c.includes('ai-design-copier'))
            .slice(0, 3)
            .map(c => `.${c}`)
            .join('');
        const moreClasses = el.classList?.length > 3 ? `+${el.classList.length - 3}` : '';

        // Get text preview
        let textPreview = '';
        const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim())
            .join(' ')
            .substring(0, 30);
        if (directText) {
            textPreview = directText;
        } else if (el.innerText) {
            textPreview = el.innerText.trim().substring(0, 30);
        }

        // Get computed styles summary
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const styleHints = [];
        if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)') styleHints.push('bg');
        if (parseFloat(styles.borderWidth) > 0) styleHints.push('border');
        if (styles.boxShadow !== 'none') styleHints.push('shadow');
        if (styles.borderRadius !== '0px') styleHints.push('rounded');
        if (styles.display === 'flex') styleHints.push('flex');
        if (styles.display === 'grid') styleHints.push('grid');

        return {
            tag,
            id,
            classes: classes + moreClasses,
            preview: textPreview || `${Math.round(rect.width)}×${Math.round(rect.height)}px`,
            styleHints: styleHints.join(', '),
            childCount: el.children?.length || 0,
            element: el,
            dimensions: `${Math.round(rect.width)} × ${Math.round(rect.height)}`
        };
    }

    function getAncestorChain(el, maxDepth = 5) {
        const chain = [];
        let current = el;
        let depth = 0;

        while (current && current !== document.body && current !== document.documentElement && depth < maxDepth) {
            chain.push(getElementPreview(current));
            current = current.parentElement;
            depth++;
        }

        // Add body as final option
        if (current === document.body || current === document.documentElement) {
            chain.push({
                tag: 'body',
                id: '',
                classes: '',
                preview: 'Entire page body',
                styleHints: 'page-level',
                childCount: document.body.children.length,
                element: document.body,
                dimensions: `${window.innerWidth} × ${window.innerHeight}`
            });
        }

        return chain;
    }

    function createElementPickerPanel(clickedElement, mouseX, mouseY) {
        // Remove existing panel
        removeElementPickerPanel();

        const ancestors = getAncestorChain(clickedElement);

        elementPickerPanel = document.createElement('div');
        elementPickerPanel.id = 'element-picker-panel';

        // Position panel near click but ensure it's visible
        const panelWidth = 340;
        const panelHeight = Math.min(ancestors.length * 72 + 120, 450);
        let left = mouseX + 20;
        let top = mouseY - 20;

        // Adjust if would go off screen
        if (left + panelWidth > window.innerWidth - 20) {
            left = mouseX - panelWidth - 20;
        }
        if (top + panelHeight > window.innerHeight - 20) {
            top = window.innerHeight - panelHeight - 20;
        }
        if (top < 20) top = 20;
        if (left < 20) left = 20;

        elementPickerPanel.style.cssText = `
            position: fixed !important;
            left: ${left}px !important;
            top: ${top}px !important;
            width: ${panelWidth}px !important;
            max-height: ${panelHeight}px !important;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) !important;
            border: 1px solid rgba(107, 143, 113, 0.4) !important;
            border-radius: 16px !important;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) !important;
            z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif !important;
            overflow: hidden !important;
            animation: pickerSlideIn 0.2s ease-out !important;
        `;

        elementPickerPanel.innerHTML = `
            <style>
                @keyframes pickerSlideIn {
                    from { opacity: 0; transform: translateY(-10px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                #element-picker-panel * {
                    box-sizing: border-box !important;
                }
                .picker-header {
                    padding: 14px 16px !important;
                    border-bottom: 1px solid rgba(255,255,255,0.1) !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                }
                .picker-title {
                    color: #fff !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    letter-spacing: 0.3px !important;
                }
                .picker-subtitle {
                    color: rgba(255,255,255,0.5) !important;
                    font-size: 11px !important;
                    margin-top: 2px !important;
                }
                .picker-close {
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 8px !important;
                    border: none !important;
                    background: rgba(255,255,255,0.1) !important;
                    color: rgba(255,255,255,0.7) !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 16px !important;
                    transition: all 0.15s ease !important;
                }
                .picker-close:hover {
                    background: rgba(255,100,100,0.2) !important;
                    color: #ff6b6b !important;
                }
                .picker-list {
                    max-height: 320px !important;
                    overflow-y: auto !important;
                    padding: 8px !important;
                }
                .picker-list::-webkit-scrollbar {
                    width: 6px !important;
                }
                .picker-list::-webkit-scrollbar-track {
                    background: transparent !important;
                }
                .picker-list::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.2) !important;
                    border-radius: 3px !important;
                }
                .picker-item {
                    padding: 10px 12px !important;
                    border-radius: 10px !important;
                    cursor: pointer !important;
                    transition: all 0.15s ease !important;
                    border: 1px solid transparent !important;
                    margin-bottom: 4px !important;
                    background: rgba(255,255,255,0.03) !important;
                }
                .picker-item:hover {
                    background: rgba(107, 143, 113, 0.15) !important;
                    border-color: rgba(107, 143, 113, 0.3) !important;
                }
                .picker-item.selected {
                    background: rgba(107, 143, 113, 0.25) !important;
                    border-color: rgba(107, 143, 113, 0.5) !important;
                }
                .picker-item-header {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    margin-bottom: 4px !important;
                }
                .picker-tag {
                    background: linear-gradient(135deg, #6b8f71 0%, #5a7d5f 100%) !important;
                    color: white !important;
                    padding: 2px 8px !important;
                    border-radius: 4px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    font-family: 'SF Mono', 'Fira Code', monospace !important;
                }
                .picker-selector {
                    color: rgba(255,255,255,0.7) !important;
                    font-size: 11px !important;
                    font-family: 'SF Mono', 'Fira Code', monospace !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                    flex: 1 !important;
                }
                .picker-depth {
                    color: rgba(255,255,255,0.3) !important;
                    font-size: 10px !important;
                    padding: 2px 6px !important;
                    background: rgba(255,255,255,0.05) !important;
                    border-radius: 4px !important;
                }
                .picker-meta {
                    display: flex !important;
                    gap: 12px !important;
                    font-size: 10px !important;
                    color: rgba(255,255,255,0.4) !important;
                }
                .picker-meta span {
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                }
                .picker-preview {
                    color: rgba(255,255,255,0.5) !important;
                    font-size: 11px !important;
                    margin-top: 4px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }
                .picker-hint {
                    padding: 10px 16px !important;
                    background: rgba(107, 143, 113, 0.1) !important;
                    border-top: 1px solid rgba(255,255,255,0.05) !important;
                    font-size: 11px !important;
                    color: rgba(255,255,255,0.5) !important;
                    text-align: center !important;
                }
                .arrow-up {
                    margin-left: 8px !important;
                    opacity: 0.4 !important;
                }
            </style>
            
            <div class="picker-header">
                <div>
                    <div class="picker-title">🎯 Select Element Scope</div>
                    <div class="picker-subtitle">Click on the element you want to capture</div>
                </div>
                <button class="picker-close" id="picker-close-btn">✕</button>
            </div>
            
            <div class="picker-list" id="picker-list">
                ${ancestors.map((item, index) => `
                    <div class="picker-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
                        <div class="picker-item-header">
                            <span class="picker-tag">&lt;${item.tag}&gt;</span>
                            <span class="picker-selector">${item.id}${item.classes}</span>
                            <span class="picker-depth">${index === 0 ? 'clicked' : `↑${index}`}</span>
                        </div>
                        <div class="picker-meta">
                            <span>📐 ${item.dimensions}</span>
                            ${item.childCount > 0 ? `<span>📦 ${item.childCount} children</span>` : ''}
                            ${item.styleHints ? `<span>🎨 ${item.styleHints}</span>` : ''}
                        </div>
                        ${item.preview ? `<div class="picker-preview">"${item.preview}"</div>` : ''}
                    </div>
                `).join('')}
            </div>
            
            <div class="picker-hint">
                ↑ Go up to capture parent containers • Click to select
            </div>
        `;

        document.body.appendChild(elementPickerPanel);
        isPickerActive = true;

        // Store ancestors for later use
        elementPickerPanel._ancestors = ancestors;

        // Add event listeners
        const closeBtn = elementPickerPanel.querySelector('#picker-close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeElementPickerPanel();
            if (overlay) overlay.style.display = 'none';
            // Resume selection mode
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('click', handleClick, true);
            document.addEventListener('keydown', handleKeyDown);
        });

        // Handle item selection
        const items = elementPickerPanel.querySelectorAll('.picker-item');
        items.forEach((item, index) => {
            item.addEventListener('mouseenter', () => {
                // Highlight this ancestor in the overlay
                const ancestor = ancestors[index];
                if (ancestor && ancestor.element) {
                    updateOverlay(ancestor.element);
                    // Update selected state
                    items.forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                }
            });

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const ancestor = ancestors[index];
                if (ancestor && ancestor.element) {
                    removeElementPickerPanel();
                    captureSelectedElement(ancestor.element);
                }
            });
        });
    }

    function removeElementPickerPanel() {
        if (elementPickerPanel) {
            elementPickerPanel.remove();
            elementPickerPanel = null;
        }
        const existing = document.getElementById('element-picker-panel');
        if (existing) existing.remove();
        isPickerActive = false;
    }

    async function captureSelectedElement(el) {
        // Clean up event listeners
        document.removeEventListener('keydown', handleKeyDown);

        if (overlay) {
            overlay.style.display = 'none';
        }

        // Count children to estimate complexity
        const estimatedElements = countAllChildren(el);
        const isComplexElement = estimatedElements > 50;
        const isVeryComplex = estimatedElements > 200;

        console.log(`[Design Copier] Starting extraction: ~${estimatedElements} elements, complex=${isComplexElement}, veryComplex=${isVeryComplex}`);

        // Show extraction loader for complex elements
        if (isComplexElement) {
            createLoader();
            updateLoaderProgress('Extracting design...', `Found ~${estimatedElements} elements to process`);
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        // Signal to background that extraction is starting
        chrome.runtime.sendMessage({
            type: 'EXTRACTION_STARTED',
            estimatedElements: estimatedElements
        });

        try {
            let screenshot = null;
            try {
                if (isComplexElement) {
                    updateLoaderProgress('Capturing screenshot...', 'Step 1 of 4');
                }
                screenshot = await captureElementScreenshot(el);

                // Compress screenshot for very complex elements to save storage space
                if (isVeryComplex && screenshot && screenshot.length > 500000) {
                    console.log(`[Design Copier] Screenshot is ${Math.round(screenshot.length / 1024)}KB, compressing...`);
                    screenshot = await compressScreenshot(screenshot, 0.7, 1000);
                    console.log(`[Design Copier] Compressed to ${Math.round(screenshot.length / 1024)}KB`);
                } else if (screenshot && screenshot.length > 1000000) {
                    // Also compress regular large screenshots (>1MB)
                    console.log(`[Design Copier] Screenshot is ${Math.round(screenshot.length / 1024)}KB, light compression...`);
                    screenshot = await compressScreenshot(screenshot, 0.8, 1400);
                    console.log(`[Design Copier] Compressed to ${Math.round(screenshot.length / 1024)}KB`);
                }
            } catch (err) {
                console.error('[Design Copier] Screenshot capture failed:', err);
            }

            // Get parent element for context
            if (isComplexElement) {
                updateLoaderProgress('Analyzing parent context...', 'Step 2 of 4');
                await new Promise(resolve => setTimeout(resolve, 10)); // Allow UI to update
            }

            const parentEl = el.parentElement;
            let parentContext = null;

            if (parentEl && parentEl !== document.body) {
                const parentRect = parentEl.getBoundingClientRect();
                const parentStyles = window.getComputedStyle(parentEl);
                parentContext = {
                    width: Math.round(parentRect.width),
                    height: Math.round(parentRect.height),
                    top: parentRect.top,
                    left: parentRect.left,
                    display: parentStyles.display,
                    position: parentStyles.position,
                    padding: parentStyles.padding
                };
            }

            if (isComplexElement) {
                updateLoaderProgress('Building element tree...', `Step 3 of 4 — Processing ${estimatedElements} elements`);
                await new Promise(resolve => setTimeout(resolve, 10)); // Allow UI to update
            }

            // For very complex elements, reduce max depth to prevent huge data
            const maxDepth = isVeryComplex ? 6 : 10;
            const elementTree = buildElementTree(el, 0, maxDepth, parentContext);

            if (!elementTree) {
                throw new Error('Failed to build element tree - element may be too complex or hidden');
            }

            const elementCount = countElements(elementTree);
            console.log(`[Design Copier] Built tree with ${elementCount} elements (maxDepth=${maxDepth})`);

            if (isComplexElement) {
                updateLoaderProgress('Extracting styles...', 'Step 4 of 5');
                await new Promise(resolve => setTimeout(resolve, 10)); // Allow UI to update
            }

            const isPageLevel = isPageLevelElement(el);
            const globalCSS = extractPageGlobalCSS();

            // ============================================
            // ANIMATION DETECTION
            // ============================================
            let animationData = null;
            try {
                if (isComplexElement) {
                    updateLoaderProgress('Detecting animations...', 'Step 5 of 5');
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                animationData = await captureAnimationData(el);
                if (animationData?.hasAnimations) {
                    console.log(`[Design Copier] Detected animations:`, animationData.animationTypes);
                }
            } catch (animErr) {
                console.warn('[Design Copier] Animation detection failed:', animErr);
            }

            // Viewport and page context
            const viewportContext = {
                width: window.innerWidth,
                height: window.innerHeight,
                scrollX: window.scrollX,
                scrollY: window.scrollY,
                devicePixelRatio: window.devicePixelRatio || 1,
                rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
            };

            if (isComplexElement) {
                updateLoaderProgress('Saving data...', 'Almost done!');
            }

            const captureData = {
                tree: elementTree,
                elementCount: elementCount,
                screenshot: screenshot,
                pageUrl: window.location.href,
                pageTitle: document.title,
                timestamp: new Date().toISOString(),
                isPageLevel: isPageLevel,
                globalCSS: globalCSS,
                viewportContext: viewportContext,
                parentContext: parentContext,
                selectionInfo: {
                    wasAdjusted: false, // User explicitly chose this
                    selectedTag: el.tagName?.toLowerCase(),
                    componentType: detectComponentType(el)
                },
                // Animation data
                animationData: animationData,
                _extractionComplete: true // Signal that extraction finished successfully
            };

            // Estimate data size
            let dataSize = JSON.stringify(captureData).length;
            console.log(`[Design Copier] Capture data size: ${Math.round(dataSize / 1024)}KB`);

            // If data is too large, try to reduce screenshot size first
            if (dataSize > 3 * 1024 * 1024 && captureData.screenshot) {
                console.log('[Design Copier] Data large, compressing screenshot further...');
                captureData.screenshot = await compressScreenshot(captureData.screenshot, 0.5, 800);
                dataSize = JSON.stringify(captureData).length;
                console.log(`[Design Copier] After compression: ${Math.round(dataSize / 1024)}KB`);
            }

            // If still too large (>5MB), try even more compression
            if (dataSize > 5 * 1024 * 1024 && captureData.screenshot) {
                console.log('[Design Copier] Still large, compressing to thumbnail...');
                captureData.screenshot = await compressScreenshot(captureData.screenshot, 0.4, 500);
                captureData._screenshotCompressed = true;
                dataSize = JSON.stringify(captureData).length;
                console.log(`[Design Copier] After thumbnail: ${Math.round(dataSize / 1024)}KB`);
            }

            // Only remove screenshot as last resort (>8MB)
            if (dataSize > 8 * 1024 * 1024) {
                console.warn('[Design Copier] Data extremely large, removing screenshot as last resort');
                if (captureData.screenshot) {
                    captureData.screenshot = null;
                    captureData._screenshotRemoved = true;
                }
            }

            // Send message to background
            chrome.runtime.sendMessage({
                type: 'ELEMENT_SELECTED',
                data: captureData
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[Design Copier] Failed to send message:', chrome.runtime.lastError);
                    showToast('Error: Failed to save data. Try selecting a smaller element.');
                }
            });

            // Hide loader
            hideLoader();

            const tagName = el.tagName?.toLowerCase();
            const message = isPageLevel
                ? `Captured page styles — Opening results...`
                : `Captured <${tagName}> with ${elementCount} element${elementCount > 1 ? 's' : ''} — Opening results...`;
            showToast(message);

        } catch (error) {
            console.error('[Design Copier] Extraction failed:', error);
            hideLoader();

            // Notify background of failure
            chrome.runtime.sendMessage({
                type: 'EXTRACTION_FAILED',
                error: error.message
            });

            showToast(`Error: ${error.message || 'Extraction failed'}. Try a smaller selection.`);
        }

        if (overlay) {
            overlay.style.display = 'block';
            overlay.style.backgroundColor = 'rgba(107, 143, 113, 0.3)';
            overlay.style.borderColor = '#6b8f71';
            setTimeout(() => {
                if (overlay) overlay.remove();
                overlay = null;
            }, 300);
        }
    }

    // Compress screenshot by reducing quality and dimensions
    async function compressScreenshot(dataUrl, quality = 0.7, maxDim = 1200) {
        if (!dataUrl) return null;

        return new Promise((resolve) => {
            const img = new Image();

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Reduce dimensions if needed
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressed = canvas.toDataURL('image/jpeg', quality);
                    console.log(`[Design Copier] Compressed ${img.width}x${img.height} → ${width}x${height} @ ${quality} quality`);
                    resolve(compressed);
                } catch (e) {
                    console.error('[Design Copier] Compression error:', e);
                    resolve(dataUrl);
                }
            };

            img.onerror = (e) => {
                console.error('[Design Copier] Image load error during compression:', e);
                resolve(dataUrl); // Return original on error
            };

            img.src = dataUrl;
        });
    }

    // ============================================
    // ANIMATION CAPTURE INTEGRATION
    // ============================================

    /**
     * Capture all animation data for an element
     * Integrates with AnimationDetector, ThreeJSCapture, GSAPCapture, and CanvasAnimationCapture
     */
    async function captureAnimationData(el) {
        const animationData = {
            hasAnimations: false,
            animationTypes: [],
            detectedLibraries: [],
            cssAnimations: [],
            webAnimations: [],
            jsAnimations: {},
            canvasAnimations: [],
            scrollAnimations: [],
            generatedCode: {},
            metadata: {
                captureTime: Date.now()
            }
        };

        try {
            // Use AnimationDetector if available
            if (window.AnimationDetector) {
                const detection = window.AnimationDetector.detectAllAnimations(el);

                animationData.hasAnimations = detection.hasAnimations;
                animationData.animationTypes = detection.animationTypes || [];
                animationData.detectedLibraries = detection.detectedLibraries || [];
                animationData.cssAnimations = detection.cssAnimations || [];
                animationData.webAnimations = detection.webAnimations || [];
                animationData.scrollAnimations = detection.scrollAnimations || [];
                animationData.metadata.complexity = detection.complexity;
            }

            // Capture Three.js specific data if available
            if (window.ThreeJSCapture && window.ThreeJSCapture.isThreeJsAvailable()) {
                try {
                    const threeData = await window.ThreeJSCapture.captureThreeJs(el);
                    if (threeData) {
                        animationData.jsAnimations.threejs = {
                            version: threeData.version,
                            renderers: threeData.renderers?.map(r => ({
                                dimensions: r.dimensions,
                                contextType: r.contextType,
                                isLikelyThreeJs: r.isLikelyThreeJs
                            })),
                            scenes: threeData.scenes?.map(s => ({
                                name: s.name,
                                data: s.data
                            })),
                            animations: threeData.animations,
                            // Store first snapshot only to save space
                            snapshot: threeData.snapshots?.[0]?.dataUrl || null,
                            notes: threeData.notes
                        };
                        animationData.generatedCode.threejs = threeData.generatedCode;

                        if (!animationData.animationTypes.includes('threejs')) {
                            animationData.animationTypes.push('threejs');
                        }
                        animationData.hasAnimations = true;
                    }
                } catch (e) {
                    console.warn('[Design Copier] Three.js capture failed:', e);
                }
            }

            // Capture GSAP specific data if available
            if (window.GSAPCapture && window.GSAPCapture.isGsapAvailable()) {
                try {
                    const gsapData = await window.GSAPCapture.captureGsap(el);
                    if (gsapData) {
                        animationData.jsAnimations.gsap = {
                            version: gsapData.version,
                            plugins: gsapData.plugins,
                            timelines: gsapData.timelines,
                            scrollTriggers: gsapData.scrollTriggers,
                            notes: gsapData.notes
                        };
                        animationData.generatedCode.gsap = gsapData.generatedCode;

                        if (!animationData.animationTypes.includes('gsap')) {
                            animationData.animationTypes.push('gsap');
                        }
                        if (gsapData.timelines?.length > 0 || gsapData.scrollTriggers?.length > 0) {
                            animationData.hasAnimations = true;
                        }
                    }
                } catch (e) {
                    console.warn('[Design Copier] GSAP capture failed:', e);
                }
            }

            // Capture canvas animations
            if (window.CanvasAnimationCapture) {
                const canvasElements = el.tagName === 'CANVAS' ?
                    [el] : el.querySelectorAll('canvas');

                if (canvasElements.length > 0) {
                    try {
                        const canvasData = await window.CanvasAnimationCapture.captureCanvasAnimation(el, {
                            snapshotCount: 3,
                            snapshotInterval: 150
                        });

                        if (canvasData && canvasData.canvases?.length > 0) {
                            animationData.canvasAnimations = canvasData.canvases.map(c => ({
                                id: c.id,
                                dimensions: c.dimensions,
                                contextType: c.contextType,
                                isAnimated: c.analysis?.isAnimated,
                                animationHints: c.animationHints,
                                // Store first snapshot only
                                snapshot: c.snapshots?.[0]?.dataUrl || null
                            }));
                            animationData.generatedCode.canvas = canvasData.generatedCode;
                            animationData.librarySuggestions = canvasData.librarySuggestions;

                            if (canvasData.animationAnalysis?.animatedCanvases > 0) {
                                animationData.hasAnimations = true;
                                if (!animationData.animationTypes.includes('canvas')) {
                                    animationData.animationTypes.push('canvas');
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[Design Copier] Canvas capture failed:', e);
                    }
                }
            }

            // Update metadata
            animationData.metadata.captureComplete = true;
            animationData.metadata.totalTypes = animationData.animationTypes.length;
            animationData.metadata.hasGeneratedCode = Object.keys(animationData.generatedCode).length > 0;

        } catch (e) {
            console.error('[Design Copier] Animation capture error:', e);
            animationData.metadata.error = e.message;
        }

        return animationData;
    }

    // Values that indicate a property is at its default/meaningless state
    const DEFAULT_VALUES = new Set([
        'initial', 'inherit', 'unset', 'revert', 'revert-layer',
        'none', 'normal', 'auto', 'visible', 'static', 'baseline',
        '0', '0px', '0%', '0s', '0ms', '0deg',
        '0px 0px', '0px 0px 0px 0px', '0 0', '0 0 0 0',
        'rgba(0, 0, 0, 0)', 'transparent',
        'repeat', 'scroll', 'border-box', 'padding-box',
        'ease', 'ease 0s', 'all 0s ease 0s',
        'running', 'forwards',
        'ltr', 'separate', 'collapse',
        'inline', 'content-box',
        '1', // default flex values, opacity
        'medium', 'currentcolor',
        'start', 'stretch',
        'row', 'nowrap', // flex defaults
        'none 0s ease 0s 1 normal none running', // animation default
    ]);

    // Properties we should ALWAYS capture even if they look "default"
    const ALWAYS_CAPTURE = new Set([
        'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
        'transform', 'animation', 'transition',
        'background-image', 'background-gradient',
        'clip-path', 'mask', 'mask-image',
        '-webkit-mask', '-webkit-mask-image',
        'border-image', 'outline'
    ]);

    // Properties where certain "default-looking" values are actually meaningful
    const MEANINGFUL_DEFAULTS = {
        'display': ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'table-cell', 'table-row', 'contents'],
        'position': ['relative', 'absolute', 'fixed', 'sticky'],
        'opacity': [], // any non-1 value
        'z-index': [], // any non-auto value
        'flex-grow': ['0'], // 0 is meaningful in flex context
        'flex-shrink': ['1'], // 1 is meaningful in flex context
        'text-decoration': ['underline', 'line-through', 'overline'],
        'text-transform': ['uppercase', 'lowercase', 'capitalize'],
        'font-weight': ['bold', '500', '600', '700', '800', '900'],
        'cursor': ['pointer', 'grab', 'grabbing', 'not-allowed', 'wait', 'text', 'move', 'crosshair', 'zoom-in', 'zoom-out'],
        'overflow': ['hidden', 'scroll', 'auto', 'clip'],
        'overflow-x': ['hidden', 'scroll', 'auto', 'clip'],
        'overflow-y': ['hidden', 'scroll', 'auto', 'clip'],
        'visibility': ['hidden', 'collapse'],
        'white-space': ['nowrap', 'pre', 'pre-wrap', 'pre-line', 'break-spaces'],
        'word-break': ['break-all', 'break-word', 'keep-all'],
        'pointer-events': ['none', 'all'],
        'user-select': ['none', 'all', 'text'],
    };

    function getRelevantStyles(el) {
        const styles = window.getComputedStyle(el);
        const result = {};

        // IMPORTANT: Explicitly capture critical visual properties that might not be enumerated
        // Some browsers don't enumerate shorthand properties, only longhands
        const criticalProperties = [
            'border-radius',
            'border-top-left-radius',
            'border-top-right-radius',
            'border-bottom-left-radius',
            'border-bottom-right-radius',
            'border-width',
            'border-style',
            'border-color',
            'background',
            'background-color',
            'background-image',
            'padding',
            'margin',
            'gap',
            'display',
            'flex-direction',
            'justify-content',
            'align-items',
            'font-size',
            'font-weight',
            'font-family',
            'line-height',
            'letter-spacing',
            'text-align',
            'color',
            'box-shadow',
            'opacity',
            'overflow',
            'position',
            'width',
            'height',
            'min-width',
            'min-height',
            'max-width',
            'max-height'
        ];

        // First, explicitly grab critical properties
        for (const prop of criticalProperties) {
            const value = styles.getPropertyValue(prop);
            if (value && value !== '' && !DEFAULT_VALUES.has(value)) {
                // Special handling for colors
                if (prop.includes('color') || prop === 'background-color') {
                    if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent' && value !== 'currentcolor') {
                        result[prop] = value;
                    }
                } else {
                    result[prop] = value;
                }
            }
        }

        // Iterate through ALL computed style properties for anything we missed
        for (let i = 0; i < styles.length; i++) {
            const prop = styles[i];

            // Skip if we already captured this property
            if (result[prop] !== undefined) continue;

            const value = styles.getPropertyValue(prop);

            if (!value || value === '') continue;

            // Skip vendor-prefixed properties except important ones
            if (prop.startsWith('-webkit-') || prop.startsWith('-moz-') || prop.startsWith('-ms-') || prop.startsWith('-o-')) {
                // Keep important vendor-prefixed properties
                const importantVendorProps = [
                    '-webkit-font-smoothing', '-webkit-text-stroke', '-webkit-background-clip',
                    '-webkit-mask', '-webkit-mask-image', '-webkit-overflow-scrolling',
                    '-webkit-tap-highlight-color', '-webkit-line-clamp', '-webkit-box-orient'
                ];
                if (!importantVendorProps.includes(prop)) continue;
            }

            // Always capture certain important properties regardless of value
            if (ALWAYS_CAPTURE.has(prop)) {
                if (value !== 'none' && value !== 'none 0s ease 0s 1 normal none running') {
                    result[prop] = value;
                }
                continue;
            }

            // Check if this property has meaningful "default" values defined
            if (MEANINGFUL_DEFAULTS[prop]) {
                if (MEANINGFUL_DEFAULTS[prop].length === 0 || MEANINGFUL_DEFAULTS[prop].includes(value)) {
                    result[prop] = value;
                    continue;
                }
            }

            // Skip generic default values
            if (DEFAULT_VALUES.has(value)) continue;

            // Skip empty-looking values
            if (value.trim() === '' || value === '0px 0px 0px 0px rgba(0, 0, 0, 0)') continue;

            // Keep colors that are not transparent/black defaults
            if (prop.includes('color')) {
                if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent' && value !== 'currentcolor') {
                    result[prop] = value;
                }
                continue;
            }

            // Keep background-color if it's not transparent
            if (prop === 'background-color') {
                if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                    result[prop] = value;
                }
                continue;
            }

            // Keep the value - it's meaningful
            result[prop] = value;
        }

        return result;
    }

    function getElementRole(el) {
        const tagName = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const type = el.getAttribute('type');

        if (role) return role;

        const tagRoles = {
            'button': 'button',
            'a': 'link',
            'input': type || 'input',
            'img': 'image',
            'nav': 'navigation',
            'header': 'header',
            'footer': 'footer',
            'main': 'main content',
            'section': 'section',
            'article': 'article',
            'aside': 'sidebar',
            'form': 'form',
            'ul': 'list',
            'ol': 'ordered list',
            'li': 'list item',
            'table': 'table',
            'h1': 'heading level 1',
            'h2': 'heading level 2',
            'h3': 'heading level 3',
            'h4': 'heading level 4',
            'h5': 'heading level 5',
            'h6': 'heading level 6',
            'p': 'paragraph',
            'span': 'inline text',
            'div': 'container',
            'label': 'label',
            'textarea': 'text area',
            'select': 'dropdown',
            'video': 'video',
            'audio': 'audio',
            'svg': 'icon/graphic',
            'canvas': 'canvas'
        };

        return tagRoles[tagName] || 'element';
    }

    function getElementDescription(el) {
        const tagName = el.tagName.toLowerCase();
        const classArray = Array.from(el.classList).filter(c => !c.includes('ai-design-copier'));
        const classes = classArray.join(' ');
        const id = el.id ? `#${el.id}` : '';
        const role = getElementRole(el);
        const text = el.innerText?.trim().substring(0, 50);
        const src = el.src || el.getAttribute('src');
        const href = el.href || el.getAttribute('href');
        const alt = el.alt || el.getAttribute('alt');
        const placeholder = el.placeholder || el.getAttribute('placeholder');

        let description = {
            tag: tagName,
            role: role,
            selector: `${tagName}${id}${classes ? '.' + classes.split(' ').join('.') : ''}`,
            // Include raw class names for Tailwind/utility class detection
            classNames: classArray,
            className: el.className?.toString?.() || '',
        };

        if (text && text.length > 0 && !el.children.length) {
            description.textContent = text;
        }
        if (src) description.src = src;
        if (href) description.href = href;
        if (alt) description.alt = alt;
        if (placeholder) description.placeholder = placeholder;

        return description;
    }

    function buildElementTree(el, depth = 0, maxDepth = 10, parentContext = null) {
        if (depth > maxDepth) return null;
        if (!el || el.nodeType !== 1) return null;
        if (el.id === 'ai-design-copier-overlay' || el.id === 'ai-design-copier-toast' || el.id === 'ai-design-copier-loader') return null;

        const tagName = el.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'meta', 'link'].includes(tagName)) return null;

        const styles = window.getComputedStyle(el);
        if (styles.display === 'none' || styles.visibility === 'hidden') return null;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return null;

        // Get computed pixel values for critical properties
        const computedPx = {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            // Computed padding in pixels
            paddingTop: parseFloat(styles.paddingTop) || 0,
            paddingRight: parseFloat(styles.paddingRight) || 0,
            paddingBottom: parseFloat(styles.paddingBottom) || 0,
            paddingLeft: parseFloat(styles.paddingLeft) || 0,
            // Computed margin in pixels
            marginTop: parseFloat(styles.marginTop) || 0,
            marginRight: parseFloat(styles.marginRight) || 0,
            marginBottom: parseFloat(styles.marginBottom) || 0,
            marginLeft: parseFloat(styles.marginLeft) || 0,
            // Font size in pixels
            fontSize: parseFloat(styles.fontSize) || 16,
            lineHeight: parseFloat(styles.lineHeight) || null,
            // Border
            borderWidth: parseFloat(styles.borderWidth) || 0,
            borderRadius: styles.borderRadius
        };

        const node = {
            ...getElementDescription(el),
            styles: getRelevantStyles(el),
            dimensions: {
                width: computedPx.width,
                height: computedPx.height,
                // Content box dimensions (without padding/border)
                contentWidth: Math.round(rect.width - computedPx.paddingLeft - computedPx.paddingRight - (computedPx.borderWidth * 2)),
                contentHeight: Math.round(rect.height - computedPx.paddingTop - computedPx.paddingBottom - (computedPx.borderWidth * 2))
            },
            computed: computedPx,
            position: {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                // Position relative to parent
                relativeTop: parentContext ? Math.round(rect.top - parentContext.top) : 0,
                relativeLeft: parentContext ? Math.round(rect.left - parentContext.left) : 0
            },
            // Parent context for relative sizing
            parentDimensions: parentContext ? {
                width: parentContext.width,
                height: parentContext.height
            } : null,
            children: []
        };

        // Current element becomes parent context for children
        const currentContext = {
            width: computedPx.width,
            height: computedPx.height,
            top: rect.top,
            left: rect.left
        };

        const children = Array.from(el.children);
        for (const child of children) {
            const childNode = buildElementTree(child, depth + 1, maxDepth, currentContext);
            if (childNode) {
                node.children.push(childNode);
            }
        }

        return node;
    }

    function countElements(tree) {
        if (!tree) return 0;
        let count = 1;
        for (const child of tree.children || []) {
            count += countElements(child);
        }
        return count;
    }

    // Quick count of all children (for estimation before full extraction)
    function countAllChildren(el, maxCount = 500) {
        if (!el) return 0;
        let count = 0;
        const children = el.getElementsByTagName('*');
        // Limit count to avoid blocking on huge trees
        return Math.min(children.length, maxCount);
    }

    // ============================================
    // DEEP PAGE SCANNER - Extract ALL styles
    // ============================================

    // Component type detection
    function detectComponentType(el) {
        const tag = el.tagName.toLowerCase();
        const classes = el.className.toString().toLowerCase();
        const role = el.getAttribute('role');
        const type = el.getAttribute('type');

        // Buttons
        if (tag === 'button' || role === 'button' || type === 'submit' || type === 'button' ||
            classes.includes('btn') || classes.includes('button')) {
            return 'button';
        }

        // Links
        if (tag === 'a' || role === 'link') {
            return 'link';
        }

        // Inputs
        if (tag === 'input' || tag === 'textarea' || tag === 'select' ||
            role === 'textbox' || role === 'combobox') {
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            return 'input';
        }

        // Headings
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
            return 'heading';
        }

        // Navigation
        if (tag === 'nav' || role === 'navigation' || classes.includes('nav') || classes.includes('menu')) {
            return 'navigation';
        }

        // Cards / Containers
        if (classes.includes('card') || classes.includes('panel') || classes.includes('tile') ||
            classes.includes('modal') || classes.includes('dialog') || role === 'dialog') {
            return 'card';
        }

        // Lists
        if (tag === 'ul' || tag === 'ol' || role === 'list' || classes.includes('list')) {
            return 'list';
        }

        // List items
        if (tag === 'li' || role === 'listitem' || classes.includes('item')) {
            return 'listItem';
        }

        // Badges / Tags / Chips
        if (classes.includes('badge') || classes.includes('tag') || classes.includes('chip') ||
            classes.includes('label') || classes.includes('pill')) {
            return 'badge';
        }

        // Avatars
        if (classes.includes('avatar') || classes.includes('profile-pic') || classes.includes('user-image')) {
            return 'avatar';
        }

        // Icons
        if (tag === 'svg' || tag === 'i' || classes.includes('icon') || classes.includes('fa-') ||
            classes.includes('material-icons')) {
            return 'icon';
        }

        // Tabs
        if (role === 'tab' || role === 'tablist' || classes.includes('tab')) {
            return 'tab';
        }

        // Dropdowns / Menus
        if (role === 'menu' || role === 'menuitem' || classes.includes('dropdown') || classes.includes('popover')) {
            return 'dropdown';
        }

        // Tooltips
        if (role === 'tooltip' || classes.includes('tooltip')) {
            return 'tooltip';
        }

        // Progress / Loaders
        if (role === 'progressbar' || classes.includes('progress') || classes.includes('loader') ||
            classes.includes('spinner')) {
            return 'progress';
        }

        // Tables
        if (tag === 'table' || tag === 'thead' || tag === 'tbody' || role === 'grid') {
            return 'table';
        }

        // Table cells
        if (tag === 'td' || tag === 'th' || role === 'cell' || role === 'columnheader') {
            return 'tableCell';
        }

        // Forms
        if (tag === 'form' || role === 'form' || classes.includes('form')) {
            return 'form';
        }

        // Dividers
        if (tag === 'hr' || classes.includes('divider') || classes.includes('separator')) {
            return 'divider';
        }

        // Text elements
        if (tag === 'p' || tag === 'span' || tag === 'label' || tag === 'small' || tag === 'strong' || tag === 'em') {
            return 'text';
        }

        // Images
        if (tag === 'img' || role === 'img' || classes.includes('image')) {
            return 'image';
        }

        // Generic containers
        if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'aside') {
            // Check if it looks like a meaningful container by checking background/border
            const styles = window.getComputedStyle(el);
            if (styles.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
                styles.borderWidth !== '0px' ||
                styles.boxShadow !== 'none') {
                return 'container';
            }
        }

        return null; // Skip non-meaningful elements
    }

    // Extract ALL relevant style properties for a component
    function extractComponentStyles(el) {
        const styles = window.getComputedStyle(el);
        const result = {};

        // Get dimensions first
        const rect = el.getBoundingClientRect();
        result.width = Math.round(rect.width);
        result.height = Math.round(rect.height);

        // Iterate through ALL computed styles
        for (let i = 0; i < styles.length; i++) {
            const prop = styles[i];
            const value = styles.getPropertyValue(prop);

            if (!value || value === '') continue;

            // Convert kebab-case to camelCase for result object
            const camelProp = prop.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

            // Skip vendor-prefixed properties except important ones
            if (prop.startsWith('-webkit-') || prop.startsWith('-moz-') || prop.startsWith('-ms-') || prop.startsWith('-o-')) {
                const importantVendorProps = [
                    '-webkit-font-smoothing', '-webkit-text-stroke', '-webkit-background-clip',
                    '-webkit-mask', '-webkit-mask-image', '-webkit-overflow-scrolling',
                    '-webkit-tap-highlight-color', '-webkit-line-clamp', '-webkit-box-orient'
                ];
                if (!importantVendorProps.includes(prop)) continue;
            }

            // Always capture these important visual properties
            const alwaysCapture = [
                'boxShadow', 'textShadow', 'filter', 'backdropFilter',
                'transform', 'animation', 'transition', 'backgroundImage',
                'clipPath', 'mask', 'maskImage', 'borderImage', 'outline'
            ];

            if (alwaysCapture.includes(camelProp)) {
                if (value !== 'none' && value !== 'none 0s ease 0s 1 normal none running') {
                    result[camelProp] = value;
                }
                continue;
            }

            // Skip generic default values
            const defaultValues = new Set([
                'initial', 'inherit', 'unset', 'revert', 'none', 'normal', 'auto',
                'visible', 'static', 'baseline', '0', '0px', '0%', '0s', '0ms',
                'rgba(0, 0, 0, 0)', 'transparent', 'repeat', 'scroll', 'border-box',
                'ease', 'all 0s ease 0s', 'running', 'ltr', 'separate', 'start', 'stretch',
                'row', 'nowrap', 'medium', 'currentcolor', 'content-box'
            ]);

            if (defaultValues.has(value)) continue;

            // Skip zero values for most properties
            if (value === '0px 0px' || value === '0px 0px 0px 0px' || value === '0 0' || value === '0 0 0 0') continue;

            // Handle colors - skip transparent
            if (prop.includes('color')) {
                if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent' && value !== 'currentcolor') {
                    result[camelProp] = value;
                }
                continue;
            }

            // Handle background-color specially
            if (prop === 'background-color') {
                if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                    result[camelProp] = value;
                }
                continue;
            }

            // Keep meaningful display values
            if (prop === 'display') {
                const meaningfulDisplays = ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'table-cell', 'table-row', 'contents', 'none'];
                if (meaningfulDisplays.includes(value)) {
                    result[camelProp] = value;
                }
                continue;
            }

            // Keep meaningful position values
            if (prop === 'position') {
                if (value !== 'static') {
                    result[camelProp] = value;
                }
                continue;
            }

            // Keep the value - it's meaningful
            result[camelProp] = value;
        }

        return result;
    }

    // Generate a unique key for deduplicating similar styles
    function generateStyleKey(styles) {
        const keyProps = ['backgroundColor', 'color', 'fontSize', 'fontWeight', 'borderRadius', 'padding'];
        return keyProps.map(p => styles[p] || '').join('|');
    }

    // Deep scan the page for all components
    async function deepScanPage(progressCallback) {
        const components = {
            button: [],
            link: [],
            input: [],
            checkbox: [],
            radio: [],
            heading: [],
            navigation: [],
            card: [],
            list: [],
            listItem: [],
            badge: [],
            avatar: [],
            icon: [],
            tab: [],
            dropdown: [],
            tooltip: [],
            progress: [],
            table: [],
            tableCell: [],
            form: [],
            divider: [],
            text: [],
            image: [],
            container: []
        };

        const colors = new Set();
        const fontFamilies = new Set();
        const fontSizes = new Set();
        const fontWeights = new Set();
        const spacingValues = new Set();
        const borderRadii = new Set();
        const shadows = new Set();
        const textShadows = new Set();
        const lineHeights = new Set();
        const animations = new Set();
        const transitions = new Set();
        const transforms = new Set();

        // Get all elements
        const allElements = document.querySelectorAll('*');
        const totalElements = allElements.length;
        let processedCount = 0;
        let componentCount = 0;

        // Process in batches to allow UI updates
        const batchSize = 100;

        for (let i = 0; i < totalElements; i++) {
            const el = allElements[i];

            // Skip hidden and our own elements
            if (el.id?.includes('ai-design-copier')) continue;

            const styles = window.getComputedStyle(el);
            if (styles.display === 'none' || styles.visibility === 'hidden') continue;

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;

            // Detect component type
            const componentType = detectComponentType(el);

            // Extract colors, fonts, etc. from all visible elements
            const bgColor = styles.backgroundColor;
            const textColor = styles.color;
            const borderColor = styles.borderColor;

            if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
                colors.add(bgColor);
            }
            if (textColor && textColor !== 'rgb(0, 0, 0)') {
                colors.add(textColor);
            }
            if (borderColor && borderColor !== 'rgb(0, 0, 0)' && styles.borderWidth !== '0px') {
                colors.add(borderColor);
            }

            // Typography
            const fontFamily = styles.fontFamily.split(',')[0].trim().replace(/"/g, '');
            if (fontFamily) fontFamilies.add(fontFamily);
            if (styles.fontSize) fontSizes.add(styles.fontSize);
            if (styles.fontWeight && styles.fontWeight !== '400') fontWeights.add(styles.fontWeight);
            if (styles.lineHeight && styles.lineHeight !== 'normal') lineHeights.add(styles.lineHeight);

            // Spacing
            ['padding', 'margin', 'gap'].forEach(prop => {
                const value = styles[prop];
                if (value && value !== '0px' && value !== 'normal') {
                    const matches = value.match(/\d+(\.\d+)?px/g);
                    if (matches) matches.forEach(m => spacingValues.add(m));
                }
            });

            // Border radius
            if (styles.borderRadius && styles.borderRadius !== '0px') {
                borderRadii.add(styles.borderRadius);
            }

            // Shadows (box and text)
            if (styles.boxShadow && styles.boxShadow !== 'none') {
                shadows.add(styles.boxShadow);
            }
            if (styles.textShadow && styles.textShadow !== 'none') {
                textShadows.add(styles.textShadow);
            }

            // Animations
            if (styles.animation && styles.animation !== 'none' && styles.animation !== 'none 0s ease 0s 1 normal none running') {
                animations.add(styles.animation);
            }
            if (styles.animationName && styles.animationName !== 'none') {
                animations.add(`name: ${styles.animationName}`);
            }

            // Transitions
            if (styles.transition && styles.transition !== 'none' && styles.transition !== 'all 0s ease 0s') {
                transitions.add(styles.transition);
            }

            // Transforms
            if (styles.transform && styles.transform !== 'none') {
                transforms.add(styles.transform);
            }

            // Add to component collection if it's a meaningful component
            if (componentType && components[componentType]) {
                const componentStyles = extractComponentStyles(el);
                const styleKey = generateStyleKey(componentStyles);

                // Check for duplicates (same style pattern)
                const existing = components[componentType].find(c => c.styleKey === styleKey);
                if (!existing) {
                    components[componentType].push({
                        styleKey,
                        styles: componentStyles,
                        selector: el.className ? `.${el.className.toString().split(' ').filter(c => c).join('.')}` : el.tagName.toLowerCase(),
                        sampleText: el.innerText?.trim().substring(0, 30) || ''
                    });
                    componentCount++;
                }
            }

            processedCount++;

            // Update progress periodically
            if (i % batchSize === 0 && progressCallback) {
                const progress = Math.round((processedCount / totalElements) * 100);
                progressCallback('Scanning elements...', `${progress}% complete (${componentCount} unique components found)`);
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        // Extract CSS variables from stylesheets
        progressCallback('Extracting CSS variables...', 'Processing stylesheets...');
        const cssVariables = await extractCSSVariables();

        return {
            components,
            designTokens: {
                colors: Array.from(colors),
                fontFamilies: Array.from(fontFamilies),
                fontSizes: Array.from(fontSizes).sort((a, b) => parseFloat(a) - parseFloat(b)),
                fontWeights: Array.from(fontWeights).sort((a, b) => parseInt(a) - parseInt(b)),
                lineHeights: Array.from(lineHeights),
                spacing: Array.from(spacingValues).sort((a, b) => parseFloat(a) - parseFloat(b)),
                borderRadii: Array.from(borderRadii),
                shadows: Array.from(shadows),
                textShadows: Array.from(textShadows),
                animations: Array.from(animations),
                transitions: Array.from(transitions),
                transforms: Array.from(transforms)
            },
            cssVariables,
            stats: {
                totalElementsScanned: processedCount,
                uniqueComponentsFound: componentCount,
                colorsFound: colors.size,
                fontsFound: fontFamilies.size,
                shadowsFound: shadows.size + textShadows.size,
                animationsFound: animations.size
            }
        };
    }

    // Extract CSS variables from stylesheets
    async function extractCSSVariables() {
        const variables = {
            root: {},
            dark: {},
            other: {}
        };

        for (const sheet of document.styleSheets) {
            try {
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;

                for (const rule of rules) {
                    if (rule.type !== 1) continue; // Only style rules

                    const selector = rule.selectorText;
                    const style = rule.style;

                    for (let i = 0; i < style.length; i++) {
                        const prop = style[i];
                        if (prop.startsWith('--')) {
                            const value = style.getPropertyValue(prop).trim();

                            if (selector === ':root' || selector === 'html') {
                                variables.root[prop] = value;
                            } else if (selector.includes('.dark') || selector.includes('[data-theme="dark"]') ||
                                selector.includes('[data-mode="dark"]') || selector.includes('.theme-dark')) {
                                variables.dark[prop] = value;
                            } else {
                                if (!variables.other[selector]) {
                                    variables.other[selector] = {};
                                }
                                variables.other[selector][prop] = value;
                            }
                        }
                    }
                }
            } catch (e) {
                // CORS restriction - skip external stylesheets
                continue;
            }
        }

        // Also extract computed CSS variables from document element
        const rootStyles = getComputedStyle(document.documentElement);

        // Get all CSS variables defined on :root
        for (const prop of rootStyles) {
            if (prop.startsWith('--')) {
                const value = rootStyles.getPropertyValue(prop).trim();
                if (value && !variables.root[prop]) {
                    variables.root[prop] = value;
                }
            }
        }

        return variables;
    }

    // ============================================
    // EXTRACT GLOBAL CSS VARIABLES (original function)
    // ============================================

    function extractPageGlobalCSS() {
        const globalCSS = {
            rootVariables: {},
            darkVariables: {},
            computedStyles: {}
        };

        try {
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule.selectorText === ':root') {
                            const style = rule.style;
                            for (let i = 0; i < style.length; i++) {
                                const prop = style[i];
                                if (prop.startsWith('--')) {
                                    globalCSS.rootVariables[prop] = style.getPropertyValue(prop).trim();
                                }
                            }
                        }

                        if (rule.selectorText === '.dark' || rule.selectorText === '[data-theme="dark"]' || rule.selectorText === ':root.dark') {
                            const style = rule.style;
                            for (let i = 0; i < style.length; i++) {
                                const prop = style[i];
                                if (prop.startsWith('--')) {
                                    globalCSS.darkVariables[prop] = style.getPropertyValue(prop).trim();
                                }
                            }
                        }
                    }
                } catch (e) {
                    continue;
                }
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const bodyStyles = getComputedStyle(document.body);

            globalCSS.computedStyles = {
                backgroundColor: bodyStyles.backgroundColor,
                color: bodyStyles.color,
                fontFamily: bodyStyles.fontFamily,
                fontSize: bodyStyles.fontSize,
                lineHeight: bodyStyles.lineHeight
            };

            if (Object.keys(globalCSS.rootVariables).length === 0) {
                if (bodyStyles.backgroundColor && bodyStyles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                    globalCSS.rootVariables['--background'] = bodyStyles.backgroundColor;
                }
                if (bodyStyles.color) {
                    globalCSS.rootVariables['--foreground'] = bodyStyles.color;
                }
                if (bodyStyles.fontFamily) {
                    globalCSS.rootVariables['--font-sans'] = bodyStyles.fontFamily.split(',')[0].trim();
                }
            }

        } catch (e) {
            console.error('Error extracting global CSS:', e);
        }

        return globalCSS;
    }

    function isPageLevelElement(el) {
        const tagName = el.tagName.toLowerCase();
        return tagName === 'body' || tagName === 'html' ||
            el === document.body || el === document.documentElement;
    }

    async function captureElementScreenshot(el, timeoutMs = 8000) {
        const rect = el.getBoundingClientRect();

        console.log(`[Design Copier] Capturing screenshot for element ${rect.width}x${rect.height}px`);

        // Add timeout to prevent hanging - longer timeout for reliability
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn(`[Design Copier] Screenshot capture timed out after ${timeoutMs}ms`);
                resolve(null);
            }, timeoutMs);

            try {
                chrome.runtime.sendMessage({
                    type: 'CAPTURE_SCREENSHOT',
                    bounds: {
                        x: Math.round(rect.left + window.scrollX),
                        y: Math.round(rect.top + window.scrollY),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        viewportX: Math.round(rect.left),
                        viewportY: Math.round(rect.top),
                        scrollX: window.scrollX,
                        scrollY: window.scrollY,
                        devicePixelRatio: window.devicePixelRatio || 1
                    }
                }, (response) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                        console.error('[Design Copier] Screenshot error:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    if (response && response.screenshot) {
                        console.log(`[Design Copier] Screenshot captured: ${Math.round(response.screenshot.length / 1024)}KB`);
                        resolve(response.screenshot);
                    } else {
                        console.warn('[Design Copier] No screenshot in response');
                        resolve(null);
                    }
                });
            } catch (e) {
                clearTimeout(timeout);
                console.error('[Design Copier] Screenshot capture failed:', e);
                resolve(null);
            }
        });
    }

    // ============================================
    // SMART COMPONENT BOUNDARY DETECTION
    // ============================================

    /**
     * Finds the best component root to select instead of the deeply nested target.
     * This "bubbles up" from the clicked element to find a meaningful component boundary.
     */
    function findComponentBoundary(el) {
        // Don't go past body
        if (!el || el === document.body || el === document.documentElement) {
            return el;
        }

        // Tags that are definitely component boundaries - stop here
        const componentRootTags = new Set([
            'button', 'a', 'input', 'select', 'textarea', 'label',
            'article', 'section', 'aside', 'nav', 'header', 'footer', 'main',
            'form', 'fieldset', 'dialog', 'details', 'summary',
            'li', 'tr', 'th', 'td', 'figure', 'figcaption',
            'video', 'audio', 'canvas', 'iframe',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
        ]);

        // Class patterns that suggest this is a component root
        const componentClassPatterns = [
            /^btn[-_]?/i, /[-_]?btn$/i, /button/i,
            /^card[-_]?/i, /[-_]?card$/i,
            /^modal[-_]?/i, /[-_]?modal$/i, /dialog/i,
            /^dropdown[-_]?/i, /[-_]?dropdown$/i, /popover/i,
            /^menu[-_]?/i, /[-_]?menu$/i, /nav/i,
            /^tab[-_]?/i, /[-_]?tab$/i,
            /^chip[-_]?/i, /[-_]?chip$/i, /badge/i, /tag/i, /pill/i,
            /^avatar[-_]?/i, /[-_]?avatar$/i,
            /^alert[-_]?/i, /[-_]?alert$/i, /toast/i, /notification/i,
            /^tooltip[-_]?/i, /[-_]?tooltip$/i,
            /^input[-_]?/i, /[-_]?input$/i, /form[-_]?group/i,
            /^item[-_]?/i, /[-_]?item$/i, /list[-_]?item/i,
            /^panel[-_]?/i, /[-_]?panel$/i,
            /^header[-_]?/i, /[-_]?header$/i, /^footer[-_]?/i, /[-_]?footer$/i,
            /^section[-_]?/i, /[-_]?section$/i,
            /^container[-_]?/i, /[-_]?container$/i, /wrapper/i,
            /^hero[-_]?/i, /[-_]?hero$/i,
            /^cta[-_]?/i, /[-_]?cta$/i,
            /^feature[-_]?/i, /[-_]?feature$/i,
            /component/i, /widget/i, /block/i
        ];

        // ARIA roles that indicate a component boundary
        const componentRoles = new Set([
            'button', 'link', 'menuitem', 'option', 'tab', 'treeitem',
            'listitem', 'row', 'cell', 'gridcell', 'columnheader', 'rowheader',
            'dialog', 'alertdialog', 'menu', 'menubar', 'tablist', 'toolbar',
            'listbox', 'tree', 'treegrid', 'grid', 'table',
            'alert', 'status', 'tooltip', 'banner', 'navigation',
            'main', 'complementary', 'contentinfo', 'form', 'search', 'region',
            'article', 'figure', 'img', 'document', 'application'
        ]);

        // Check if element has meaningful visual styles (not inherited/transparent)
        function hasMeaningfulStyles(element) {
            const styles = window.getComputedStyle(element);

            // Check for explicit background
            const bg = styles.backgroundColor;
            const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';

            // Check for border
            const borderWidth = parseFloat(styles.borderWidth) || 0;
            const hasBorder = borderWidth > 0;

            // Check for box shadow
            const shadow = styles.boxShadow;
            const hasShadow = shadow && shadow !== 'none';

            // Check for explicit padding that suggests intentional styling
            const paddingSum =
                parseFloat(styles.paddingTop) + parseFloat(styles.paddingRight) +
                parseFloat(styles.paddingBottom) + parseFloat(styles.paddingLeft);
            const hasPadding = paddingSum >= 8; // At least 8px total padding

            // Check for border-radius
            const radius = styles.borderRadius;
            const hasRadius = radius && radius !== '0px';

            return hasBg || hasBorder || hasShadow || (hasPadding && hasRadius);
        }

        // Check if element looks like a component root based on class names
        function hasComponentClassName(element) {
            const classes = element.className?.toString?.() || '';
            if (!classes) return false;

            return componentClassPatterns.some(pattern => pattern.test(classes));
        }

        // Check if element is an "inline" element that should bubble up
        function isInlineElement(element) {
            const tag = element.tagName.toLowerCase();
            const inlineTags = new Set([
                'span', 'strong', 'em', 'b', 'i', 'u', 'small', 'sub', 'sup',
                'code', 'kbd', 'samp', 'var', 'abbr', 'cite', 'q', 'mark',
                'svg', 'path', 'g', 'circle', 'rect', 'line', 'polygon', 'polyline',
                'text', 'tspan', 'use', 'symbol', 'defs', 'clippath'
            ]);
            return inlineTags.has(tag);
        }

        // Start from clicked element and walk up
        let current = el;
        let candidate = el;
        let depth = 0;
        const maxDepth = 10; // Don't go too far up

        while (current && current !== document.body && depth < maxDepth) {
            const tagName = current.tagName?.toLowerCase();
            const role = current.getAttribute?.('role');

            // If this is a semantic component root, stop here
            if (componentRootTags.has(tagName)) {
                return current;
            }

            // If it has a component role, stop here
            if (role && componentRoles.has(role)) {
                return current;
            }

            // If it has a component-like class name, this is likely a good boundary
            if (hasComponentClassName(current)) {
                candidate = current;
                // Keep going up one more level to see if parent is also a component
                // (e.g., button inside a button-group)
            }

            // If this element has meaningful visual styles, it's a good candidate
            if (hasMeaningfulStyles(current)) {
                candidate = current;
            }

            // If we started on an inline/svg element, definitely bubble up
            if (depth === 0 && isInlineElement(current)) {
                // The clicked element is inline, we need to go up
                current = current.parentElement;
                depth++;
                continue;
            }

            current = current.parentElement;
            depth++;
        }

        return candidate;
    }

    /**
     * Determines if we should use the component boundary or the exact target.
     * Gives user hints about what was selected.
     */
    function getSmartSelectedElement(originalTarget) {
        const componentBoundary = findComponentBoundary(originalTarget);

        // If component boundary is same as target, just return it
        if (componentBoundary === originalTarget) {
            return { element: originalTarget, wasAdjusted: false };
        }

        // Return the component boundary
        return {
            element: componentBoundary,
            wasAdjusted: true,
            originalTag: originalTarget.tagName?.toLowerCase(),
            selectedTag: componentBoundary.tagName?.toLowerCase()
        };
    }

    async function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();

        const clickedElement = e.target;

        // If clicking inside the picker panel, ignore
        if (elementPickerPanel && elementPickerPanel.contains(clickedElement)) {
            return;
        }
        if (clickedElement.closest('#element-picker-panel')) {
            return;
        }

        // Stop selection mode temporarily
        stopSelection();

        // Show the element picker panel
        createElementPickerPanel(clickedElement, e.clientX, e.clientY);
    }

    function stopSelection() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown);
        currentHoveredElement = null;
    }

    function cancelSelection() {
        stopSelection();
        removeElementPickerPanel();
        if (overlay) {
            overlay.style.display = 'none';
        }
        document.removeEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(e) {
        // Escape to cancel
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelSelection();
            showToast('Selection cancelled');
            return;
        }

        // If picker is active, handle arrow navigation
        if (isPickerActive && elementPickerPanel) {
            const items = elementPickerPanel.querySelectorAll('.picker-item');
            const currentIndex = Array.from(items).findIndex(i => i.classList.contains('selected'));
            const ancestors = elementPickerPanel._ancestors;

            if (e.key === 'ArrowUp' && currentIndex < items.length - 1) {
                e.preventDefault();
                items[currentIndex]?.classList.remove('selected');
                items[currentIndex + 1]?.classList.add('selected');
                const ancestor = ancestors[currentIndex + 1];
                if (ancestor?.element) updateOverlay(ancestor.element);
                items[currentIndex + 1]?.scrollIntoView({ block: 'nearest' });
            }

            if (e.key === 'ArrowDown' && currentIndex > 0) {
                e.preventDefault();
                items[currentIndex]?.classList.remove('selected');
                items[currentIndex - 1]?.classList.add('selected');
                const ancestor = ancestors[currentIndex - 1];
                if (ancestor?.element) updateOverlay(ancestor.element);
                items[currentIndex - 1]?.scrollIntoView({ block: 'nearest' });
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const ancestor = ancestors[currentIndex];
                if (ancestor?.element) {
                    removeElementPickerPanel();
                    captureSelectedElement(ancestor.element);
                }
            }
        }
    }

    // Deep global theme extraction with loader
    async function extractGlobalThemeDeep() {
        createLoader();

        try {
            const scanResult = await deepScanPage((status, progress) => {
                updateLoaderProgress(status, progress);
            });

            updateLoaderProgress('Building design system...', 'Almost done...');
            await new Promise(resolve => setTimeout(resolve, 100));

            // Build a minimal tree for backwards compatibility
            const bodyTree = {
                tag: 'body',
                role: 'document',
                selector: 'body',
                styles: getRelevantStyles(document.body),
                dimensions: {
                    width: window.innerWidth,
                    height: window.innerHeight
                },
                children: []
            };

            const captureData = {
                tree: bodyTree,
                elementCount: scanResult.stats.totalElementsScanned,
                screenshot: null,
                pageUrl: window.location.href,
                pageTitle: document.title,
                timestamp: new Date().toISOString(),
                isPageLevel: true,
                isGlobalThemeExtraction: true,
                isDeepScan: true,
                globalCSS: {
                    rootVariables: scanResult.cssVariables.root,
                    darkVariables: scanResult.cssVariables.dark,
                    computedStyles: {}
                },
                deepScanData: scanResult
            };

            hideLoader();
            return captureData;
        } catch (e) {
            hideLoader();
            console.error('Deep scan failed:', e);
            throw e;
        }
    }

    // Legacy simple extraction
    function extractGlobalTheme() {
        try {
            const globalCSS = extractPageGlobalCSS();

            let bodyTree = null;
            try {
                bodyTree = buildElementTree(document.body, 0, 3);
            } catch (e) {
                console.error('Error building element tree:', e);
            }

            if (!bodyTree) {
                bodyTree = {
                    tag: 'body',
                    role: 'document',
                    selector: 'body',
                    styles: getRelevantStyles(document.body),
                    dimensions: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    },
                    children: []
                };
            }

            const captureData = {
                tree: bodyTree,
                elementCount: 1,
                screenshot: null,
                pageUrl: window.location.href,
                pageTitle: document.title,
                timestamp: new Date().toISOString(),
                isPageLevel: true,
                isGlobalThemeExtraction: true,
                globalCSS: globalCSS
            };

            return captureData;
        } catch (e) {
            console.error('Error in extractGlobalTheme:', e);
            return {
                tree: { tag: 'body', role: 'document', styles: {}, dimensions: { width: 0, height: 0 }, children: [] },
                elementCount: 1,
                screenshot: null,
                pageUrl: window.location.href,
                pageTitle: document.title,
                timestamp: new Date().toISOString(),
                isPageLevel: true,
                isGlobalThemeExtraction: true,
                globalCSS: { rootVariables: {}, darkVariables: {}, computedStyles: {} }
            };
        }
    }

    // ============================================
    // STYLE INJECTION & LIVE PREVIEW
    // ============================================

    function createPreviewControlPanel() {
        if (document.getElementById('design-copier-preview-panel')) {
            previewControlPanel = document.getElementById('design-copier-preview-panel');
            return previewControlPanel;
        }

        previewControlPanel = document.createElement('div');
        previewControlPanel.id = 'design-copier-preview-panel';
        previewControlPanel.innerHTML = `
            <div style="
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
                border-radius: 16px;
                padding: 16px 20px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1);
                z-index: 2147483646;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                min-width: 280px;
                backdrop-filter: blur(10px);
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 14px;
                ">
                    <div style="
                        width: 10px;
                        height: 10px;
                        background: #4ade80;
                        border-radius: 50%;
                        animation: designCopierPulse 1.5s infinite;
                    "></div>
                    <span style="
                        color: white;
                        font-size: 14px;
                        font-weight: 600;
                    ">Live Style Preview Active</span>
                </div>
                
                <div style="
                    display: flex;
                    gap: 8px;
                    margin-bottom: 12px;
                ">
                    <button id="dc-toggle-preview" style="
                        flex: 1;
                        padding: 10px 16px;
                        background: linear-gradient(135deg, #6b8f71 0%, #5a7d5f 100%);
                        color: white;
                        border: none;
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">👁️ Toggle Original</button>
                    
                    <button id="dc-remove-preview" style="
                        padding: 10px 16px;
                        background: rgba(255,255,255,0.1);
                        color: #fff;
                        border: 1px solid rgba(255,255,255,0.2);
                        border-radius: 10px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">✕ Remove</button>
                </div>
                
                <div id="dc-preview-info" style="
                    background: rgba(255,255,255,0.05);
                    border-radius: 8px;
                    padding: 10px 12px;
                    font-size: 11px;
                    color: rgba(255,255,255,0.7);
                    line-height: 1.4;
                ">
                    Styles injected. Click "Toggle Original" to compare.
                </div>
            </div>
            <style>
                @keyframes designCopierPulse {
                    0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
                    50% { opacity: 0.8; box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
                }
                #dc-toggle-preview:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(107, 143, 113, 0.4);
                }
                #dc-remove-preview:hover {
                    background: rgba(255,100,100,0.2);
                    border-color: rgba(255,100,100,0.4);
                }
            </style>
        `;

        document.body.appendChild(previewControlPanel);

        // Add event listeners
        document.getElementById('dc-toggle-preview').addEventListener('click', toggleInjectedStyles);
        document.getElementById('dc-remove-preview').addEventListener('click', removeInjectedStyles);

        return previewControlPanel;
    }

    function injectStyles(cssText) {
        // Remove existing injected styles
        removeInjectedStyles(false);

        // Create and inject new style element
        injectedStyleEl = document.createElement('style');
        injectedStyleEl.id = 'design-copier-injected-styles';
        injectedStyleEl.textContent = cssText;
        document.head.appendChild(injectedStyleEl);

        // Show control panel
        createPreviewControlPanel();
        isPreviewActive = true;

        // Update info
        const infoEl = document.getElementById('dc-preview-info');
        if (infoEl) {
            const ruleCount = (cssText.match(/\{/g) || []).length;
            infoEl.textContent = `${ruleCount} style rules injected. Click "Toggle Original" to compare.`;
        }

        showToast('🎨 Style preview activated');

        return true;
    }

    function toggleInjectedStyles() {
        if (!injectedStyleEl) return;

        const toggleBtn = document.getElementById('dc-toggle-preview');
        const indicator = previewControlPanel?.querySelector('div > div > div');
        const infoEl = document.getElementById('dc-preview-info');

        if (injectedStyleEl.disabled) {
            // Enable injected styles
            injectedStyleEl.disabled = false;
            if (toggleBtn) {
                toggleBtn.textContent = '👁️ Toggle Original';
                toggleBtn.style.background = 'linear-gradient(135deg, #6b8f71 0%, #5a7d5f 100%)';
            }
            if (indicator) {
                indicator.style.background = '#4ade80';
            }
            if (infoEl) {
                infoEl.textContent = 'Showing adapted styles. Click to see original.';
            }
            showToast('Showing adapted styles');
        } else {
            // Disable injected styles to show original
            injectedStyleEl.disabled = true;
            if (toggleBtn) {
                toggleBtn.textContent = '👁️ Show Adapted';
                toggleBtn.style.background = 'linear-gradient(135deg, #e8a87c 0%, #d4956a 100%)';
            }
            if (indicator) {
                indicator.style.background = '#fbbf24';
            }
            if (infoEl) {
                infoEl.textContent = 'Showing original styles. Click to see adapted.';
            }
            showToast('Showing original styles');
        }
    }

    function removeInjectedStyles(showMessage = true) {
        // Remove injected stylesheet
        if (injectedStyleEl) {
            injectedStyleEl.remove();
            injectedStyleEl = null;
        }

        // Also check for any existing ones
        const existingStyle = document.getElementById('design-copier-injected-styles');
        if (existingStyle) existingStyle.remove();

        // Remove control panel
        if (previewControlPanel) {
            previewControlPanel.remove();
            previewControlPanel = null;
        }

        const existingPanel = document.getElementById('design-copier-preview-panel');
        if (existingPanel) existingPanel.remove();

        isPreviewActive = false;

        if (showMessage) {
            showToast('Style preview removed');
        }

        return true;
    }

    function getPreviewStatus() {
        return {
            isActive: isPreviewActive,
            hasInjectedStyles: !!injectedStyleEl,
            isShowingOriginal: injectedStyleEl?.disabled || false
        };
    }

    // ============================================
    // LIVE EDIT MODE
    // ============================================

    function startLiveEditMode() {
        liveEditMode = true;
        editHistory = [];
        createLiveEditOverlay();
        createLiveEditActionBar();
        document.addEventListener('mousemove', handleLiveEditMouseMove);
        document.addEventListener('click', handleLiveEditClick, true);
        document.addEventListener('keydown', handleLiveEditKeyDown);
        showToast('✨ Live Edit mode active — Click any element to edit');
    }

    function exitLiveEditMode() {
        liveEditMode = false;

        // Remove UI elements
        if (liveEditPanel) {
            liveEditPanel.remove();
            liveEditPanel = null;
        }
        if (liveEditActionBar) {
            liveEditActionBar.remove();
            liveEditActionBar = null;
        }
        if (liveEditOverlay) {
            liveEditOverlay.remove();
            liveEditOverlay = null;
        }
        if (liveEditSelectionBorder) {
            liveEditSelectionBorder.remove();
            liveEditSelectionBorder = null;
        }

        // Clear debounce timers
        Object.values(debounceTimers).forEach(timer => clearTimeout(timer));
        debounceTimers = {};

        // Remove event listeners
        document.removeEventListener('mousemove', handleLiveEditMouseMove);
        document.removeEventListener('click', handleLiveEditClick, true);
        document.removeEventListener('keydown', handleLiveEditKeyDown);

        currentEditElement = null;
        showToast('Live Edit mode exited');
    }

    function createLiveEditOverlay() {
        if (document.getElementById('live-edit-overlay')) {
            liveEditOverlay = document.getElementById('live-edit-overlay');
        } else {
            liveEditOverlay = document.createElement('div');
            liveEditOverlay.id = 'live-edit-overlay';
            liveEditOverlay.style.cssText = `
                position: fixed !important;
                pointer-events: none !important;
                z-index: 2147483644 !important;
                border: 2px dashed #3b82f6 !important;
                background-color: rgba(59, 130, 246, 0.08) !important;
                transition: all 0.1s ease !important;
                display: none;
            `;
            document.body.appendChild(liveEditOverlay);
        }

        // Create selection border (solid, for selected element)
        if (document.getElementById('live-edit-selection')) {
            liveEditSelectionBorder = document.getElementById('live-edit-selection');
        } else {
            liveEditSelectionBorder = document.createElement('div');
            liveEditSelectionBorder.id = 'live-edit-selection';
            liveEditSelectionBorder.style.cssText = `
                position: fixed !important;
                pointer-events: none !important;
                z-index: 2147483645 !important;
                border: 2px solid #3b82f6 !important;
                background-color: rgba(59, 130, 246, 0.05) !important;
                border-radius: 4px !important;
                display: none;
            `;
            document.body.appendChild(liveEditSelectionBorder);
        }
    }

    function createLiveEditActionBar() {
        if (document.getElementById('live-edit-action-bar')) {
            liveEditActionBar = document.getElementById('live-edit-action-bar');
            updateActionBarBadge();
            return;
        }

        liveEditActionBar = document.createElement('div');
        liveEditActionBar.id = 'live-edit-action-bar';
        liveEditActionBar.innerHTML = `
            <style>
                #live-edit-action-bar * { box-sizing: border-box !important; }
                .le-action-btn {
                    width: 40px !important;
                    height: 40px !important;
                    border: none !important;
                    background: transparent !important;
                    color: rgba(255,255,255,0.7) !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 16px !important;
                    transition: all 0.15s ease !important;
                    border-radius: 10px !important;
                    position: relative !important;
                }
                .le-action-btn:hover {
                    background: rgba(255,255,255,0.1) !important;
                    color: #fff !important;
                }
                .le-action-btn svg {
                    width: 18px !important;
                    height: 18px !important;
                    stroke: currentColor !important;
                    fill: none !important;
                    stroke-width: 2 !important;
                }
                .le-badge {
                    position: absolute !important;
                    top: 2px !important;
                    right: 2px !important;
                    background: #3b82f6 !important;
                    color: #fff !important;
                    font-size: 9px !important;
                    font-weight: 700 !important;
                    min-width: 14px !important;
                    height: 14px !important;
                    border-radius: 7px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    padding: 0 3px !important;
                }
                .le-divider {
                    width: 24px !important;
                    height: 1px !important;
                    background: rgba(255,255,255,0.1) !important;
                    margin: 4px auto !important;
                }
                .le-prompt-preview {
                    position: absolute !important;
                    right: 60px !important;
                    bottom: 0 !important;
                    width: 320px !important;
                    background: #1c1c1e !important;
                    border: 1px solid rgba(255,255,255,0.08) !important;
                    border-radius: 12px !important;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.4) !important;
                    opacity: 0 !important;
                    visibility: hidden !important;
                    transform: translateX(10px) !important;
                    transition: all 0.2s ease !important;
                    z-index: 2147483647 !important;
                }
                .le-prompt-preview.visible {
                    opacity: 1 !important;
                    visibility: visible !important;
                    transform: translateX(0) !important;
                }
                .le-prompt-header {
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                    padding: 12px 14px !important;
                    border-bottom: 1px solid rgba(255,255,255,0.06) !important;
                }
                .le-prompt-title {
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    color: rgba(255,255,255,0.8) !important;
                }
                .le-prompt-count {
                    font-size: 11px !important;
                    color: rgba(255,255,255,0.4) !important;
                }
                .le-prompt-textarea {
                    width: 100% !important;
                    height: 200px !important;
                    padding: 12px 14px !important;
                    background: transparent !important;
                    border: none !important;
                    color: rgba(255,255,255,0.7) !important;
                    font-size: 11px !important;
                    font-family: ui-monospace, SFMono-Regular, 'SF Mono', monospace !important;
                    line-height: 1.5 !important;
                    resize: none !important;
                    outline: none !important;
                }
                .le-prompt-textarea::-webkit-scrollbar {
                    width: 6px !important;
                }
                .le-prompt-textarea::-webkit-scrollbar-track {
                    background: transparent !important;
                }
                .le-prompt-textarea::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.15) !important;
                    border-radius: 3px !important;
                }
                .le-prompt-footer {
                    padding: 10px 14px !important;
                    border-top: 1px solid rgba(255,255,255,0.06) !important;
                }
                .le-prompt-copy-btn {
                    width: 100% !important;
                    padding: 10px 16px !important;
                    background: #3b82f6 !important;
                    color: #fff !important;
                    border: none !important;
                    border-radius: 8px !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 6px !important;
                    transition: all 0.15s ease !important;
                }
                .le-prompt-copy-btn:hover {
                    background: #2563eb !important;
                }
                .le-prompt-copy-btn svg {
                    width: 14px !important;
                    height: 14px !important;
                }
            </style>
            <div class="le-prompt-preview" id="le-prompt-preview">
                <div class="le-prompt-header">
                    <span class="le-prompt-title">Prompt Preview</span>
                    <span class="le-prompt-count" id="le-prompt-count">0 changes</span>
                </div>
                <textarea class="le-prompt-textarea" id="le-prompt-textarea" readonly></textarea>
                <div class="le-prompt-footer">
                    <button class="le-prompt-copy-btn" id="le-prompt-copy-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy Prompt
                    </button>
                </div>
            </div>
            <button class="le-action-btn" id="le-copy-btn" title="Preview & Copy Prompt">
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span class="le-badge" id="le-edit-count" style="display: none;">0</span>
            </button>
            <button class="le-action-btn" id="le-clear-btn" title="Clear All Edits">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
            <div class="le-divider"></div>
            <button class="le-action-btn" id="le-exit-btn" title="Exit Live Edit">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        liveEditActionBar.style.cssText = `
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            background: #1c1c1e !important;
            border-radius: 14px !important;
            padding: 6px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 2px !important;
            z-index: 2147483646 !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif !important;
        `;
        document.body.appendChild(liveEditActionBar);

        // Prompt preview hover
        const copyBtn = document.getElementById('le-copy-btn');
        const previewPanel = document.getElementById('le-prompt-preview');
        let previewTimeout = null;

        copyBtn.addEventListener('mouseenter', () => {
            clearTimeout(previewTimeout);
            updatePromptPreview();
            previewPanel.classList.add('visible');
        });

        copyBtn.addEventListener('mouseleave', (e) => {
            // Check if moving to preview panel
            const rect = previewPanel.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                return;
            }
            previewTimeout = setTimeout(() => {
                previewPanel.classList.remove('visible');
            }, 100);
        });

        previewPanel.addEventListener('mouseenter', () => {
            clearTimeout(previewTimeout);
        });

        previewPanel.addEventListener('mouseleave', () => {
            previewTimeout = setTimeout(() => {
                previewPanel.classList.remove('visible');
            }, 100);
        });

        // Copy button in preview
        document.getElementById('le-prompt-copy-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            copyPromptToClipboard();
            previewPanel.classList.remove('visible');
        });

        // Clear button
        document.getElementById('le-clear-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            clearAllEdits();
        });

        // Exit button
        document.getElementById('le-exit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            exitLiveEditMode();
        });
    }

    function updatePromptPreview() {
        const textarea = document.getElementById('le-prompt-textarea');
        const countEl = document.getElementById('le-prompt-count');
        if (!textarea || !countEl) return;

        const prompt = generatePrompt();
        textarea.value = prompt;

        const totalChanges = editHistory.reduce((sum, h) => sum + h.changes.length, 0);
        countEl.textContent = `${totalChanges} change${totalChanges !== 1 ? 's' : ''}`;
    }

    function updateActionBarBadge() {
        const badge = document.getElementById('le-edit-count');
        if (badge) {
            const totalEdits = editHistory.reduce((sum, h) => sum + h.changes.length, 0);
            if (totalEdits > 0) {
                badge.textContent = totalEdits;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    function handleLiveEditMouseMove(e) {
        if (!liveEditMode || liveEditPanel) return;

        const el = e.target;
        if (el.id?.includes('live-edit') || el.closest('#live-edit-action-bar') || el.closest('#live-edit-panel')) return;

        currentHoveredElement = el;
        if (liveEditOverlay) {
            const rect = el.getBoundingClientRect();
            liveEditOverlay.style.top = `${rect.top}px`;
            liveEditOverlay.style.left = `${rect.left}px`;
            liveEditOverlay.style.width = `${rect.width}px`;
            liveEditOverlay.style.height = `${rect.height}px`;
            liveEditOverlay.style.display = 'block';
        }
    }

    function handleLiveEditClick(e) {
        if (!liveEditMode) return;

        const el = e.target;
        if (el.id?.includes('live-edit') || el.closest('#live-edit-action-bar') || el.closest('#live-edit-panel')) return;

        e.preventDefault();
        e.stopPropagation();

        // Show edit panel for this element
        showLiveEditPanel(el, e.clientX, e.clientY);
    }

    function handleLiveEditKeyDown(e) {
        if (e.key === 'Escape') {
            if (liveEditPanel) {
                closeLiveEditPanel();
            } else {
                exitLiveEditMode();
            }
        }
    }

    function closeLiveEditPanel() {
        if (liveEditPanel) {
            liveEditPanel.remove();
            liveEditPanel = null;
        }
        currentEditElement = null;

        // Hide selection border when panel closes
        hideSelectionBorder();

        // Resume hover detection (overlay already hidden, will show on next hover)
        if (liveEditOverlay) {
            liveEditOverlay.style.display = 'none';
        }
    }

    function getElementSelector(el) {
        if (!el) return '';

        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = Array.from(el.classList || []).filter(c => !c.includes('live-edit'));
        const classStr = classes.length ? '.' + classes.join('.') : '';

        // Detect Tailwind classes
        const tailwindClasses = classes.filter(c =>
            /^(flex|grid|block|inline|hidden|w-|h-|p-|m-|text-|bg-|border-|rounded-|shadow-|font-|items-|justify-|gap-|space-|overflow-|relative|absolute|fixed|sticky)/.test(c)
        );

        return {
            tag,
            id: el.id || null,
            classes,
            tailwindClasses,
            selector: `${tag}${id}${classStr}`,
            uniqueSelector: generateUniqueSelector(el)
        };
    }

    function generateUniqueSelector(el) {
        if (el.id) return `#${el.id}`;

        let path = [];
        while (el && el.nodeType === 1 && el !== document.body) {
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                selector = `#${el.id}`;
                path.unshift(selector);
                break;
            }
            if (el.className) {
                const classes = Array.from(el.classList).filter(c => !c.includes('live-edit')).slice(0, 2);
                if (classes.length) selector += '.' + classes.join('.');
            }
            path.unshift(selector);
            el = el.parentElement;
        }
        return path.join(' > ');
    }

    function showLiveEditPanel(el, mouseX, mouseY) {
        closeLiveEditPanel();
        currentEditElement = el;

        const selectorInfo = getElementSelector(el);
        const computedStyles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // Store original styles if not already (expanded list)
        let historyEntry = editHistory.find(h => h.element === el);
        if (!historyEntry) {
            historyEntry = {
                element: el,
                selector: selectorInfo,
                originalStyles: {
                    // Layout
                    display: computedStyles.display,
                    flexDirection: computedStyles.flexDirection,
                    justifyContent: computedStyles.justifyContent,
                    alignItems: computedStyles.alignItems,
                    flexWrap: computedStyles.flexWrap,
                    gap: computedStyles.gap,
                    // Spacing
                    padding: computedStyles.padding,
                    paddingTop: computedStyles.paddingTop,
                    paddingRight: computedStyles.paddingRight,
                    paddingBottom: computedStyles.paddingBottom,
                    paddingLeft: computedStyles.paddingLeft,
                    margin: computedStyles.margin,
                    // Sizing
                    width: computedStyles.width,
                    height: computedStyles.height,
                    // Typography
                    fontSize: computedStyles.fontSize,
                    fontWeight: computedStyles.fontWeight,
                    lineHeight: computedStyles.lineHeight,
                    letterSpacing: computedStyles.letterSpacing,
                    textAlign: computedStyles.textAlign,
                    color: computedStyles.color,
                    // Visual
                    backgroundColor: computedStyles.backgroundColor,
                    borderRadius: computedStyles.borderRadius,
                    borderWidth: computedStyles.borderWidth,
                    borderColor: computedStyles.borderColor,
                    borderStyle: computedStyles.borderStyle,
                    boxShadow: computedStyles.boxShadow,
                    opacity: computedStyles.opacity
                },
                changes: []
            };
            editHistory.push(historyEntry);
        }

        // Parse padding values
        const paddingValues = parsePaddingValues(computedStyles);
        const gapValue = parseInt(computedStyles.gap) || 0;

        // Detect current alignment
        const hAlign = computedStyles.justifyContent || 'flex-start';
        const vAlign = computedStyles.alignItems || 'flex-start';

        // Panel position
        const panelWidth = 260;
        const panelHeight = 320;
        let left = rect.right + 16;
        let top = rect.top;

        if (left + panelWidth > window.innerWidth - 20) {
            left = rect.left - panelWidth - 16;
        }
        if (left < 20) left = 20;
        if (top + panelHeight > window.innerHeight - 20) {
            top = window.innerHeight - panelHeight - 20;
        }
        if (top < 20) top = 20;

        liveEditPanel = document.createElement('div');
        liveEditPanel.id = 'live-edit-panel';
        liveEditPanel.innerHTML = `
            <style>
                #live-edit-panel * { box-sizing: border-box !important; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif !important; }
                .le-header { display: flex; justify-content: center; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
                .le-tabs { display: flex; gap: 0; background: rgba(255,255,255,0.06); border-radius: 8px; padding: 2px; }
                .le-tab { width: 40px; height: 32px; border-radius: 6px; background: transparent; border: none; color: rgba(255,255,255,0.35); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; }
                .le-tab:hover { color: rgba(255,255,255,0.6); }
                .le-tab.active { background: rgba(255,255,255,0.12); color: #fff; }
                .le-tab svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.5; }
                .le-content { padding: 0; }
                .le-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; margin: 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
                .le-row:last-child { border-bottom: none; }
                .le-label { color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 400; }
                .le-value { color: rgba(255,255,255,0.4); font-size: 13px; font-weight: 400; }
                .le-controls { display: flex; align-items: center; gap: 4px; }
                .le-align-btn { width: 28px; height: 28px; border-radius: 6px; background: rgba(255,255,255,0.06); border: none; color: rgba(255,255,255,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.12s ease; }
                .le-align-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
                .le-align-btn.active { background: rgba(255,255,255,0.15); color: #fff; }
                .le-align-btn svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }
                .le-input { width: 55px; padding: 6px 8px; border: none; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.6); font-size: 13px; text-align: center; outline: none; border-radius: 6px; }
                .le-input:focus { background: rgba(255,255,255,0.1); color: #fff; }
                .le-input-wide { width: 65px; }
                .le-row-stacked { flex-direction: column !important; align-items: stretch !important; gap: 10px !important; }
                .le-row-header { display: flex; justify-content: space-between; align-items: center; }
                .le-padding-display { display: flex; align-items: center; gap: 6px; }
                .le-padding-value { color: rgba(255,255,255,0.5); font-size: 13px; font-weight: 500; font-family: ui-monospace, SFMono-Regular, monospace; }
                .le-padding-controls { display: flex; flex-direction: column; gap: 8px; }
                .le-padding-modes { display: flex; gap: 6px; }
                .le-mode-btn { min-width: 52px; height: 32px; border-radius: 6px; background: rgba(255,255,255,0.06); border: none; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 11px; transition: all 0.12s ease; padding: 0 8px; }
                .le-mode-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
                .le-mode-btn.active { background: rgba(255,255,255,0.15); color: #fff; }
                .le-mode-btn svg { flex-shrink: 0; }
                .le-mode-label { font-size: 10px; font-weight: 500; }
                .le-padding-inputs { display: flex; gap: 6px; margin-top: 8px; }
                .le-color-row { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.04); }
                .le-color-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
                .le-color-input-group { display: flex; align-items: center; gap: 8px; }
                .le-color-picker { width: 40px; height: 32px; border: none; border-radius: 6px; cursor: pointer; -webkit-appearance: none; flex-shrink: 0; }
                .le-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
                .le-color-picker::-webkit-color-swatch { border: none; border-radius: 6px; }
                .le-hex-input { flex: 1; padding: 6px 10px; border: none; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); font-size: 13px; font-family: ui-monospace, SFMono-Regular, monospace; text-transform: uppercase; outline: none; border-radius: 6px; }
                .le-hex-input:focus { background: rgba(255,255,255,0.1); color: #fff; }
                .le-color-tokens { margin-top: 10px; }
                .le-tokens-label { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.4); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
                .le-tokens-grid { display: flex; flex-wrap: wrap; gap: 6px; }
                .le-token-swatch { width: 24px; height: 24px; border-radius: 6px; border: 2px solid transparent; cursor: pointer; transition: all 0.12s ease; position: relative; }
                .le-token-swatch:hover { transform: scale(1.15); border-color: rgba(255,255,255,0.3); }
                .le-token-swatch.active { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3); }
                .le-expand-btn { color: rgba(255,255,255,0.3); font-size: 14px; background: none; border: none; cursor: pointer; padding: 4px 8px; line-height: 1; border-radius: 4px; transition: all 0.12s ease; }
                .le-expand-btn:hover { color: rgba(255,255,255,0.6); background: rgba(255,255,255,0.06); }
                .le-section-title { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 16px 6px; }
            </style>

            <div class="le-header">
                <div class="le-tabs">
                    <button class="le-tab active" data-tab="layout" title="Layout">
                        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>
                    </button>
                    <button class="le-tab" data-tab="style" title="Style">
                        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>
                    </button>
                    <button class="le-tab" data-tab="text" title="Typography">
                        <svg viewBox="0 0 24 24"><path d="M4 7V4h16v3"></path><line x1="12" y1="4" x2="12" y2="20"></line><line x1="8" y1="20" x2="16" y2="20"></line></svg>
                    </button>
                </div>
            </div>

            <div class="le-content" id="le-panel-content">
                ${generateLayoutTabContent(computedStyles, paddingValues, gapValue, hAlign, vAlign)}
            </div>
        `;

        liveEditPanel.style.cssText = `
            position: fixed !important;
            left: ${left}px !important;
            top: ${top}px !important;
            width: ${panelWidth}px !important;
            background: #1c1c1e !important;
            border: 1px solid rgba(255,255,255,0.06) !important;
            border-radius: 14px !important;
            box-shadow: 0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03) !important;
            z-index: 2147483647 !important;
            animation: leSlideIn 0.15s ease-out !important;
            overflow: hidden !important;
        `;

        // Add animation keyframe
        const styleEl = document.createElement('style');
        styleEl.textContent = `@keyframes leSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`;
        liveEditPanel.appendChild(styleEl);

        document.body.appendChild(liveEditPanel);

        // Show selection border on the element being edited
        showSelectionBorder(el);

        // Hide hover overlay
        if (liveEditOverlay) liveEditOverlay.style.display = 'none';

        // Add event listeners for controls
        setupPanelEventListeners(el, historyEntry);
    }

    function showSelectionBorder(el) {
        if (!liveEditSelectionBorder || !el) return;
        const rect = el.getBoundingClientRect();
        liveEditSelectionBorder.style.top = `${rect.top - 2}px`;
        liveEditSelectionBorder.style.left = `${rect.left - 2}px`;
        liveEditSelectionBorder.style.width = `${rect.width + 4}px`;
        liveEditSelectionBorder.style.height = `${rect.height + 4}px`;
        liveEditSelectionBorder.style.display = 'block';
    }

    function hideSelectionBorder() {
        if (liveEditSelectionBorder) {
            liveEditSelectionBorder.style.display = 'none';
        }
    }

    function parsePaddingValues(computedStyles) {
        const pt = parseInt(computedStyles.paddingTop) || 0;
        const pr = parseInt(computedStyles.paddingRight) || 0;
        const pb = parseInt(computedStyles.paddingBottom) || 0;
        const pl = parseInt(computedStyles.paddingLeft) || 0;

        // Check if uniform
        if (pt === pr && pr === pb && pb === pl) {
            return { mode: 'uniform', values: [pt], display: `${pt}` };
        }
        // Check if vertical/horizontal
        if (pt === pb && pl === pr) {
            return { mode: 'axis', values: [pt, pl], display: `${pt}, ${pl}` };
        }
        // All different
        return { mode: 'individual', values: [pt, pr, pb, pl], display: `${pt}, ${pr}, ${pb}, ${pl}` };
    }

    function generateLayoutTabContent(computedStyles, paddingValues, gapValue, hAlign, vAlign) {
        return `
            <div class="le-row">
                <span class="le-label">H Align</span>
                <div class="le-controls">
                    <button class="le-align-btn ${hAlign === 'flex-start' || hAlign === 'start' ? 'active' : ''}" data-align="h" data-value="flex-start" title="Start">
                        <svg viewBox="0 0 24 24"><line x1="4" y1="4" x2="4" y2="20"></line><rect x="8" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg>
                    </button>
                    <button class="le-align-btn ${hAlign === 'center' ? 'active' : ''}" data-align="h" data-value="center" title="Center">
                        <svg viewBox="0 0 24 24"><line x1="12" y1="4" x2="12" y2="20"></line><rect x="4" y="6" width="16" height="4" rx="1"></rect><rect x="6" y="14" width="12" height="4" rx="1"></rect></svg>
                    </button>
                    <button class="le-align-btn ${hAlign === 'flex-end' || hAlign === 'end' ? 'active' : ''}" data-align="h" data-value="flex-end" title="End">
                        <svg viewBox="0 0 24 24"><line x1="20" y1="4" x2="20" y2="20"></line><rect x="4" y="6" width="12" height="4" rx="1"></rect><rect x="8" y="14" width="8" height="4" rx="1"></rect></svg>
                    </button>
                </div>
            </div>
            <div class="le-row">
                <span class="le-label">V Align</span>
                <div class="le-controls">
                    <button class="le-align-btn ${vAlign === 'flex-start' || vAlign === 'start' ? 'active' : ''}" data-align="v" data-value="flex-start" title="Start">
                        <svg viewBox="0 0 24 24"><line x1="4" y1="4" x2="20" y2="4"></line><rect x="6" y="8" width="4" height="12" rx="1"></rect><rect x="14" y="8" width="4" height="8" rx="1"></rect></svg>
                    </button>
                    <button class="le-align-btn ${vAlign === 'center' ? 'active' : ''}" data-align="v" data-value="center" title="Center">
                        <svg viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12"></line><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="6" width="4" height="12" rx="1"></rect></svg>
                    </button>
                    <button class="le-align-btn ${vAlign === 'flex-end' || vAlign === 'end' ? 'active' : ''}" data-align="v" data-value="flex-end" title="End">
                        <svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="20"></line><rect x="6" y="4" width="4" height="12" rx="1"></rect><rect x="14" y="8" width="4" height="8" rx="1"></rect></svg>
                    </button>
                </div>
            </div>
            <div class="le-row le-row-stacked">
                <div class="le-row-header">
                    <span class="le-label">Padding</span>
                    <span class="le-padding-value" id="le-padding-display">${paddingValues.display}</span>
                </div>
                <div class="le-padding-controls">
                    <div class="le-padding-modes">
                        <button class="le-mode-btn ${paddingValues.mode === 'uniform' ? 'active' : ''}" data-padding-mode="uniform" title="All sides equal">
                            <svg width="14" height="14" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" fill="none" stroke-width="1.5"></rect></svg>
                            <span class="le-mode-label">All</span>
                        </button>
                        <button class="le-mode-btn ${paddingValues.mode === 'axis' ? 'active' : ''}" data-padding-mode="axis" title="Vertical & Horizontal">
                            <svg width="14" height="14" viewBox="0 0 12 12"><rect x="2" y="4" width="8" height="4" rx="0.5" stroke="currentColor" fill="none" stroke-width="1.5"></rect></svg>
                            <span class="le-mode-label">V/H</span>
                        </button>
                        <button class="le-mode-btn ${paddingValues.mode === 'individual' ? 'active' : ''}" data-padding-mode="individual" title="Each side separately">
                            <svg width="14" height="14" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" fill="none" stroke-width="1" stroke-dasharray="2 1"></rect></svg>
                            <span class="le-mode-label">Each</span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="le-row">
                <span class="le-label">Gap</span>
                <input type="number" class="le-input le-input-wide" id="le-gap" value="${gapValue}" min="0" max="200">
            </div>
        `;
    }

    function setupPanelEventListeners(el, historyEntry) {
        const computedStyles = window.getComputedStyle(el);

        // Tab switching
        liveEditPanel.querySelectorAll('.le-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabBtn = e.target.closest('.le-tab');
                if (tabBtn) {
                    const tabName = tabBtn.dataset.tab;
                    switchTab(tabName, el, historyEntry);
                }
            });
        });

        // Setup listeners based on current tab content
        setupLayoutListeners(el, historyEntry, computedStyles);
    }

    function setupLayoutListeners(el, historyEntry, computedStyles) {
        // Alignment buttons
        liveEditPanel.querySelectorAll('.le-align-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const alignBtn = e.target.closest('.le-align-btn');
                if (!alignBtn) return;

                const alignType = alignBtn.dataset.align;
                const value = alignBtn.dataset.value;

                // Update button states
                alignBtn.parentElement.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
                alignBtn.classList.add('active');

                // Apply the change
                if (alignType === 'h') {
                    applyChangeDebounced(el, historyEntry, 'justifyContent', value);
                } else if (alignType === 'v') {
                    applyChangeDebounced(el, historyEntry, 'alignItems', value);
                }
            });
        });

        // Padding mode buttons
        liveEditPanel.querySelectorAll('.le-mode-btn[data-padding-mode]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modeBtn = e.target.closest('.le-mode-btn');
                if (!modeBtn) return;

                const mode = modeBtn.dataset.paddingMode;
                showPaddingEditor(el, historyEntry, mode, computedStyles);
            });
        });

        // Gap input
        const gapInput = document.getElementById('le-gap');
        if (gapInput) {
            gapInput.addEventListener('input', (e) => {
                applyChangeDebounced(el, historyEntry, 'gap', `${e.target.value}px`);
            });
        }
    }

    function showPaddingEditor(el, historyEntry, mode, computedStyles) {
        const row = document.querySelector('.le-row-stacked') ||
                    Array.from(document.querySelectorAll('.le-row')).find(r => r.querySelector('.le-padding-controls'));

        if (!row) return;

        // Update mode button states
        row.querySelectorAll('.le-mode-btn').forEach(b => b.classList.remove('active'));
        row.querySelector(`[data-padding-mode="${mode}"]`)?.classList.add('active');

        // Update the value display
        const valueDisplay = document.getElementById('le-padding-display');

        let inputsHtml = '';
        if (mode === 'uniform') {
            const val = parseInt(computedStyles.paddingTop) || 0;
            if (valueDisplay) valueDisplay.textContent = `${val}`;
            inputsHtml = `
                <div class="le-padding-inputs">
                    <input type="number" class="le-input le-input-wide" id="le-padding-uniform" value="${val}" min="0" max="200" placeholder="All sides">
                </div>
            `;
        } else if (mode === 'axis') {
            const vVal = parseInt(computedStyles.paddingTop) || 0;
            const hVal = parseInt(computedStyles.paddingLeft) || 0;
            if (valueDisplay) valueDisplay.textContent = `${vVal}, ${hVal}`;
            inputsHtml = `
                <div class="le-padding-inputs">
                    <input type="number" class="le-input" id="le-padding-v" value="${vVal}" min="0" max="200" placeholder="V" title="Vertical (Top & Bottom)" style="width: 55px;">
                    <input type="number" class="le-input" id="le-padding-h" value="${hVal}" min="0" max="200" placeholder="H" title="Horizontal (Left & Right)" style="width: 55px;">
                </div>
            `;
        } else {
            const pt = parseInt(computedStyles.paddingTop) || 0;
            const pr = parseInt(computedStyles.paddingRight) || 0;
            const pb = parseInt(computedStyles.paddingBottom) || 0;
            const pl = parseInt(computedStyles.paddingLeft) || 0;
            if (valueDisplay) valueDisplay.textContent = `${pt}, ${pr}, ${pb}, ${pl}`;
            inputsHtml = `
                <div class="le-padding-inputs" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
                    <input type="number" class="le-input" id="le-padding-t" value="${pt}" min="0" max="200" placeholder="T" title="Top" style="width: 45px;">
                    <input type="number" class="le-input" id="le-padding-r" value="${pr}" min="0" max="200" placeholder="R" title="Right" style="width: 45px;">
                    <input type="number" class="le-input" id="le-padding-b" value="${pb}" min="0" max="200" placeholder="B" title="Bottom" style="width: 45px;">
                    <input type="number" class="le-input" id="le-padding-l" value="${pl}" min="0" max="200" placeholder="L" title="Left" style="width: 45px;">
                </div>
            `;
        }

        // Find or create the inputs container
        const controlsEl = row.querySelector('.le-padding-controls');
        if (controlsEl) {
            // Remove existing inputs
            const existingInputs = controlsEl.querySelector('.le-padding-inputs');
            if (existingInputs) existingInputs.remove();

            // Add new inputs after the modes
            controlsEl.insertAdjacentHTML('beforeend', inputsHtml);

            // Add input listeners
            if (mode === 'uniform') {
                document.getElementById('le-padding-uniform')?.addEventListener('input', (e) => {
                    const val = `${e.target.value}px`;
                    applyChangeDebounced(el, historyEntry, 'padding', val);
                });
            } else if (mode === 'axis') {
                document.getElementById('le-padding-v')?.addEventListener('input', (e) => {
                    const vVal = e.target.value;
                    const hVal = document.getElementById('le-padding-h')?.value || '0';
                    applyChangeDebounced(el, historyEntry, 'padding', `${vVal}px ${hVal}px`);
                });
                document.getElementById('le-padding-h')?.addEventListener('input', (e) => {
                    const hVal = e.target.value;
                    const vVal = document.getElementById('le-padding-v')?.value || '0';
                    applyChangeDebounced(el, historyEntry, 'padding', `${vVal}px ${hVal}px`);
                });
            } else {
                ['t', 'r', 'b', 'l'].forEach(side => {
                    document.getElementById(`le-padding-${side}`)?.addEventListener('input', () => {
                        const t = document.getElementById('le-padding-t')?.value || '0';
                        const r = document.getElementById('le-padding-r')?.value || '0';
                        const b = document.getElementById('le-padding-b')?.value || '0';
                        const l = document.getElementById('le-padding-l')?.value || '0';
                        applyChangeDebounced(el, historyEntry, 'padding', `${t}px ${r}px ${b}px ${l}px`);
                    });
                });
            }
        }
    }

    function applyChangeDebounced(el, historyEntry, property, value, delay = 50) {
        if (debounceTimers[property]) {
            clearTimeout(debounceTimers[property]);
        }
        debounceTimers[property] = setTimeout(() => {
            applyChange(el, historyEntry, property, value);
            // Update selection border position in case element size changed
            showSelectionBorder(el);
        }, delay);
    }

    function switchTab(tabName, el, historyEntry) {
        const computedStyles = window.getComputedStyle(el);
        const content = document.getElementById('le-panel-content');

        liveEditPanel.querySelectorAll('.le-tab').forEach(t => t.classList.remove('active'));
        const activeTab = liveEditPanel.querySelector(`.le-tab[data-tab="${tabName}"]`);
        if (activeTab) activeTab.classList.add('active');

        if (tabName === 'layout') {
            const paddingValues = parsePaddingValues(computedStyles);
            const gapValue = parseInt(computedStyles.gap) || 0;
            const hAlign = computedStyles.justifyContent || 'flex-start';
            const vAlign = computedStyles.alignItems || 'flex-start';

            content.innerHTML = generateLayoutTabContent(computedStyles, paddingValues, gapValue, hAlign, vAlign);
            setupLayoutListeners(el, historyEntry, computedStyles);
        } else if (tabName === 'style') {
            content.innerHTML = generateStyleTabContent(computedStyles);
            setupStyleTabListeners(el, historyEntry, computedStyles);
        } else if (tabName === 'text') {
            content.innerHTML = generateTextTabContent(computedStyles);
            setupTextTabListeners(el, historyEntry, computedStyles);
        }
    }

    function generateStyleTabContent(computedStyles) {
        const bgColor = rgbToHex(computedStyles.backgroundColor);
        const borderRadius = parseMultiValue(computedStyles.borderRadius);
        const opacity = parseFloat(computedStyles.opacity) || 1;
        const borderWidth = parseInt(computedStyles.borderWidth) || 0;

        // Detect color tokens
        const colorTokens = detectColorTokens();
        const tokensHtml = generateColorTokensHtml(colorTokens, 'le-bg-color');

        return `
            <div class="le-color-row">
                <div class="le-color-label-row">
                    <span class="le-label">Background</span>
                </div>
                <div class="le-color-input-group">
                    <input type="color" class="le-color-picker" id="le-bg-color" value="${bgColor}">
                    <input type="text" class="le-hex-input" id="le-bg-color-hex" value="${bgColor}" placeholder="#ffffff" maxlength="7">
                </div>
                ${tokensHtml}
            </div>
            <div class="le-row">
                <span class="le-label">Border Radius</span>
                <input type="number" class="le-input le-input-wide" id="le-border-radius" value="${borderRadius}" min="0" max="200">
            </div>
            <div class="le-row">
                <span class="le-label">Opacity</span>
                <div class="le-controls">
                    <input type="range" id="le-opacity-range" min="0" max="100" value="${Math.round(opacity * 100)}" style="width: 70px; accent-color: #3b82f6;">
                    <span class="le-value" id="le-opacity-value" style="width: 36px;">${Math.round(opacity * 100)}%</span>
                </div>
            </div>
            <div class="le-row">
                <span class="le-label">Border</span>
                <button class="le-expand-btn" id="le-border-expand">${borderWidth > 0 ? `${borderWidth}px` : '+'}</button>
            </div>
            <div class="le-row">
                <span class="le-label">Shadow</span>
                <button class="le-expand-btn" id="le-shadow-expand">${computedStyles.boxShadow !== 'none' ? '•' : '+'}</button>
            </div>
        `;
    }

    function generateTextTabContent(computedStyles) {
        const textColor = rgbToHex(computedStyles.color);
        const fontSize = parseInt(computedStyles.fontSize) || 16;
        const fontWeight = computedStyles.fontWeight || '400';
        const lineHeight = parseFloat(computedStyles.lineHeight) || 1.5;
        const letterSpacing = parseFloat(computedStyles.letterSpacing) || 0;
        const textAlign = computedStyles.textAlign || 'left';

        // Detect color tokens
        const colorTokens = detectColorTokens();
        const tokensHtml = generateColorTokensHtml(colorTokens, 'le-text-color');

        return `
            <div class="le-color-row">
                <div class="le-color-label-row">
                    <span class="le-label">Text Color</span>
                </div>
                <div class="le-color-input-group">
                    <input type="color" class="le-color-picker" id="le-text-color" value="${textColor}">
                    <input type="text" class="le-hex-input" id="le-text-color-hex" value="${textColor}" placeholder="#000000" maxlength="7">
                </div>
                ${tokensHtml}
            </div>
            <div class="le-row">
                <span class="le-label">Font Size</span>
                <input type="number" class="le-input le-input-wide" id="le-font-size" value="${fontSize}" min="8" max="120">
            </div>
            <div class="le-row">
                <span class="le-label">Weight</span>
                <div class="le-controls">
                    <button class="le-align-btn ${fontWeight === '400' || parseInt(fontWeight) < 500 ? 'active' : ''}" data-weight="400" title="Regular">
                        <span style="font-weight: 400; font-size: 12px;">Aa</span>
                    </button>
                    <button class="le-align-btn ${fontWeight === '500' ? 'active' : ''}" data-weight="500" title="Medium">
                        <span style="font-weight: 500; font-size: 12px;">Aa</span>
                    </button>
                    <button class="le-align-btn ${fontWeight === '600' ? 'active' : ''}" data-weight="600" title="Semibold">
                        <span style="font-weight: 600; font-size: 12px;">Aa</span>
                    </button>
                    <button class="le-align-btn ${fontWeight === '700' || parseInt(fontWeight) >= 700 ? 'active' : ''}" data-weight="700" title="Bold">
                        <span style="font-weight: 700; font-size: 12px;">Aa</span>
                    </button>
                </div>
            </div>
            <div class="le-row">
                <span class="le-label">Align</span>
                <div class="le-controls">
                    <button class="le-align-btn ${textAlign === 'left' ? 'active' : ''}" data-text-align="left" title="Left">
                        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="15" y2="12"></line><line x1="3" y1="18" x2="18" y2="18"></line></svg>
                    </button>
                    <button class="le-align-btn ${textAlign === 'center' ? 'active' : ''}" data-text-align="center" title="Center">
                        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="6" y1="12" x2="18" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
                    </button>
                    <button class="le-align-btn ${textAlign === 'right' ? 'active' : ''}" data-text-align="right" title="Right">
                        <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="9" y1="12" x2="21" y2="12"></line><line x1="6" y1="18" x2="21" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="le-row">
                <span class="le-label">Line Height</span>
                <input type="number" class="le-input le-input-wide" id="le-line-height" value="${isNaN(lineHeight) ? 1.5 : lineHeight.toFixed(1)}" min="0.5" max="3" step="0.1">
            </div>
            <div class="le-row">
                <span class="le-label">Letter Spacing</span>
                <input type="number" class="le-input le-input-wide" id="le-letter-spacing" value="${isNaN(letterSpacing) ? 0 : letterSpacing.toFixed(1)}" min="-5" max="20" step="0.5">
            </div>
        `;
    }

    function parseMultiValue(value) {
        // Parse values like "10px 20px" and return first value
        if (!value) return 0;
        const match = value.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }

    function setupStyleTabListeners(el, historyEntry, computedStyles) {
        const bgColorPicker = document.getElementById('le-bg-color');
        const bgColorHex = document.getElementById('le-bg-color-hex');

        // Sync color picker -> hex input
        bgColorPicker?.addEventListener('input', (e) => {
            const color = e.target.value;
            applyChangeDebounced(el, historyEntry, 'backgroundColor', color);
            if (bgColorHex) bgColorHex.value = color;
        });

        // Sync hex input -> color picker
        bgColorHex?.addEventListener('input', (e) => {
            let hex = e.target.value.trim();
            // Add # if missing
            if (hex && !hex.startsWith('#')) hex = '#' + hex;
            // Validate hex format
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                applyChangeDebounced(el, historyEntry, 'backgroundColor', hex);
                if (bgColorPicker) bgColorPicker.value = hex;
            }
        });

        // Auto-format hex on blur
        bgColorHex?.addEventListener('blur', (e) => {
            let hex = e.target.value.trim();
            if (hex && !hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
                hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
            }
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                e.target.value = hex.toUpperCase();
                if (bgColorPicker) bgColorPicker.value = hex;
                applyChangeDebounced(el, historyEntry, 'backgroundColor', hex);
            }
        });

        document.getElementById('le-border-radius')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'borderRadius', `${e.target.value}px`);
        });

        const opacityRange = document.getElementById('le-opacity-range');
        const opacityValue = document.getElementById('le-opacity-value');
        if (opacityRange) {
            opacityRange.addEventListener('input', (e) => {
                const val = e.target.value / 100;
                applyChangeDebounced(el, historyEntry, 'opacity', val.toString());
                if (opacityValue) opacityValue.textContent = `${e.target.value}%`;
            });
        }

        document.getElementById('le-border-expand')?.addEventListener('click', (e) => {
            e.stopPropagation();
            expandBorderControls(el, historyEntry);
        });

        document.getElementById('le-shadow-expand')?.addEventListener('click', (e) => {
            e.stopPropagation();
            expandShadowControls(el, historyEntry);
        });

        // Color token listeners
        setupColorTokenListeners(el, historyEntry, 'backgroundColor', 'le-bg-color', 'le-bg-color-hex');
    }

    function setupTextTabListeners(el, historyEntry, computedStyles) {
        const textColorPicker = document.getElementById('le-text-color');
        const textColorHex = document.getElementById('le-text-color-hex');

        // Sync color picker -> hex input
        textColorPicker?.addEventListener('input', (e) => {
            const color = e.target.value;
            applyChangeDebounced(el, historyEntry, 'color', color);
            if (textColorHex) textColorHex.value = color;
        });

        // Sync hex input -> color picker
        textColorHex?.addEventListener('input', (e) => {
            let hex = e.target.value.trim();
            if (hex && !hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                applyChangeDebounced(el, historyEntry, 'color', hex);
                if (textColorPicker) textColorPicker.value = hex;
            }
        });

        // Auto-format hex on blur
        textColorHex?.addEventListener('blur', (e) => {
            let hex = e.target.value.trim();
            if (hex && !hex.startsWith('#')) hex = '#' + hex;
            if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
                hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
            }
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                e.target.value = hex.toUpperCase();
                if (textColorPicker) textColorPicker.value = hex;
                applyChangeDebounced(el, historyEntry, 'color', hex);
            }
        });

        document.getElementById('le-font-size')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'fontSize', `${e.target.value}px`);
            showSelectionBorder(el);
        });

        // Font weight buttons
        liveEditPanel.querySelectorAll('[data-weight]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const weightBtn = e.target.closest('.le-align-btn');
                if (!weightBtn) return;

                weightBtn.parentElement.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
                weightBtn.classList.add('active');
                applyChangeDebounced(el, historyEntry, 'fontWeight', weightBtn.dataset.weight);
            });
        });

        // Text align buttons
        liveEditPanel.querySelectorAll('[data-text-align]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const alignBtn = e.target.closest('.le-align-btn');
                if (!alignBtn) return;

                alignBtn.parentElement.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
                alignBtn.classList.add('active');
                applyChangeDebounced(el, historyEntry, 'textAlign', alignBtn.dataset.textAlign);
            });
        });

        document.getElementById('le-line-height')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'lineHeight', e.target.value);
        });

        document.getElementById('le-letter-spacing')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'letterSpacing', `${e.target.value}px`);
        });

        // Color token listeners
        setupColorTokenListeners(el, historyEntry, 'color', 'le-text-color', 'le-text-color-hex');
    }

    function applyChange(el, historyEntry, property, value) {
        // Apply visual change
        el.style[property] = value;

        // Record change
        const existingChange = historyEntry.changes.find(c => c.property === property);
        if (existingChange) {
            existingChange.newValue = value;
        } else {
            historyEntry.changes.push({
                property,
                originalValue: historyEntry.originalStyles[property] || '',
                newValue: value
            });
        }

        updateActionBarBadge();
    }

    function rgbToHex(color) {
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return '#ffffff';

        // Already a hex color
        if (color.startsWith('#')) {
            // Expand shorthand (#fff -> #ffffff)
            if (color.length === 4) {
                return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
            }
            return color.substring(0, 7); // Remove alpha if present
        }

        // RGB/RGBA format
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }

        // HSL/HSLA format - convert to RGB first
        const hslMatch = color.match(/hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?/);
        if (hslMatch) {
            const h = parseInt(hslMatch[1]) / 360;
            const s = parseInt(hslMatch[2]) / 100;
            const l = parseInt(hslMatch[3]) / 100;
            const rgb = hslToRgb(h, s, l);
            const r = rgb[0].toString(16).padStart(2, '0');
            const g = rgb[1].toString(16).padStart(2, '0');
            const b = rgb[2].toString(16).padStart(2, '0');
            return `#${r}${g}${b}`;
        }

        // Named colors - create temp element to get computed value
        try {
            const tempEl = document.createElement('div');
            tempEl.style.color = color;
            document.body.appendChild(tempEl);
            const computedColor = window.getComputedStyle(tempEl).color;
            document.body.removeChild(tempEl);
            if (computedColor && computedColor !== color) {
                return rgbToHex(computedColor);
            }
        } catch (e) {
            // Ignore errors
        }

        return '#ffffff';
    }

    function hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    // Color token detection from CSS custom properties
    let cachedColorTokens = null;

    function detectColorTokens() {
        if (cachedColorTokens) return cachedColorTokens;

        const tokens = [];
        const seen = new Set();

        // Color-related keywords in variable names
        const colorKeywords = /color|bg|background|text|border|fill|stroke|primary|secondary|accent|surface|brand|theme|gray|grey|neutral|success|error|warning|info|danger|dark|light|muted|foreground/i;

        try {
            // Get computed styles from root
            const rootStyles = getComputedStyle(document.documentElement);

            // Scan all stylesheets
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) continue;

                    for (const rule of rules) {
                        if (rule.style) {
                            for (let i = 0; i < rule.style.length; i++) {
                                const prop = rule.style[i];
                                if (prop.startsWith('--')) {
                                    const value = rule.style.getPropertyValue(prop).trim();
                                    if (!seen.has(prop) && isColorValue(value) && colorKeywords.test(prop)) {
                                        const resolvedColor = resolveColorValue(value, rootStyles);
                                        if (resolvedColor) {
                                            tokens.push({
                                                name: prop,
                                                value: resolvedColor,
                                                original: value,
                                                hex: rgbToHex(resolvedColor)
                                            });
                                            seen.add(prop);
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // CORS restriction on external stylesheets
                }
            }

            // Also check inline styles on root
            const inlineVars = document.documentElement.style.cssText.match(/--[\w-]+:\s*[^;]+/g) || [];
            for (const varDef of inlineVars) {
                const [name, value] = varDef.split(':').map(s => s.trim());
                if (!seen.has(name) && isColorValue(value) && colorKeywords.test(name)) {
                    const resolvedColor = resolveColorValue(value, rootStyles);
                    if (resolvedColor) {
                        tokens.push({
                            name,
                            value: resolvedColor,
                            original: value,
                            hex: rgbToHex(resolvedColor)
                        });
                        seen.add(name);
                    }
                }
            }
        } catch (e) {
            console.warn('Error detecting color tokens:', e);
        }

        // Sort by name
        tokens.sort((a, b) => a.name.localeCompare(b.name));

        // Limit to first 20 tokens
        cachedColorTokens = tokens.slice(0, 20);
        return cachedColorTokens;
    }

    function isColorValue(value) {
        if (!value) return false;
        value = value.trim().toLowerCase();

        // Check for color formats
        if (value.startsWith('#')) return true;
        if (value.startsWith('rgb')) return true;
        if (value.startsWith('hsl')) return true;
        if (value.startsWith('var(')) return true;

        // Common color names
        const colorNames = ['transparent', 'currentcolor', 'inherit', 'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey'];
        if (colorNames.includes(value)) return true;

        return false;
    }

    function resolveColorValue(value, rootStyles) {
        if (!value) return null;
        value = value.trim();

        // If it's a var() reference, resolve it
        if (value.startsWith('var(')) {
            const varMatch = value.match(/var\((--[\w-]+)/);
            if (varMatch) {
                const resolved = rootStyles.getPropertyValue(varMatch[1]).trim();
                if (resolved) return resolveColorValue(resolved, rootStyles);
            }
            return null;
        }

        // Try to compute the color
        try {
            const tempEl = document.createElement('div');
            tempEl.style.color = value;
            document.body.appendChild(tempEl);
            const computed = getComputedStyle(tempEl).color;
            document.body.removeChild(tempEl);
            if (computed && computed !== 'rgba(0, 0, 0, 0)') {
                return computed;
            }
        } catch (e) {}

        return value;
    }

    function generateColorTokensHtml(tokens, inputId) {
        if (!tokens || tokens.length === 0) return '';

        return `
            <div class="le-color-tokens" data-for="${inputId}">
                <div class="le-tokens-label">Design Tokens</div>
                <div class="le-tokens-grid">
                    ${tokens.map(t => `
                        <button class="le-token-swatch" data-color="${t.hex}" data-var="${t.name}" title="${t.name}: ${t.original}" style="background: ${t.hex};">
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function setupColorTokenListeners(el, historyEntry, property, colorPickerId, hexInputId) {
        const container = liveEditPanel.querySelector(`.le-color-tokens[data-for="${colorPickerId}"]`);
        if (!container) return;

        container.querySelectorAll('.le-token-swatch').forEach(swatch => {
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = swatch.dataset.color;
                const varName = swatch.dataset.var;

                // Update inputs
                const picker = document.getElementById(colorPickerId);
                const hexInput = document.getElementById(hexInputId);
                if (picker) picker.value = color;
                if (hexInput) hexInput.value = color;

                // Apply change (use CSS variable for better maintainability)
                applyChangeDebounced(el, historyEntry, property, `var(${varName})`);

                // Visual feedback
                container.querySelectorAll('.le-token-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });
    }

    function expandBorderControls(el, historyEntry) {
        const btn = document.getElementById('le-border-expand');
        if (!btn) return;
        const row = btn.closest('.le-row');
        if (!row) return;

        const computedStyles = window.getComputedStyle(el);
        const borderWidth = parseInt(computedStyles.borderWidth) || 0;
        const borderColor = rgbToHex(computedStyles.borderColor);
        const borderStyle = computedStyles.borderStyle || 'solid';

        row.outerHTML = `
            <div class="le-row" style="flex-direction: column; align-items: stretch; gap: 10px; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="le-label">Border Width</span>
                    <input type="number" class="le-input" id="le-border-width" value="${borderWidth}" min="0" max="20">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="le-label">Border Color</span>
                    <input type="color" style="width: 36px; height: 24px; border: none; border-radius: 4px; cursor: pointer; background: transparent;" id="le-border-color" value="${borderColor}">
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="le-label">Border Style</span>
                    <select class="le-input" id="le-border-style" style="width: 70px; background: rgba(255,255,255,0.06); border-radius: 6px; padding: 4px 6px; border: none; color: rgba(255,255,255,0.6);">
                        <option value="solid" ${borderStyle === 'solid' ? 'selected' : ''}>Solid</option>
                        <option value="dashed" ${borderStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                        <option value="dotted" ${borderStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                        <option value="none" ${borderStyle === 'none' ? 'selected' : ''}>None</option>
                    </select>
                </div>
            </div>
        `;

        document.getElementById('le-border-width')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'borderWidth', `${e.target.value}px`);
            // Also set border style to solid if width > 0 and style is none
            if (parseInt(e.target.value) > 0) {
                const styleSelect = document.getElementById('le-border-style');
                if (styleSelect && styleSelect.value === 'none') {
                    styleSelect.value = 'solid';
                    applyChangeDebounced(el, historyEntry, 'borderStyle', 'solid');
                }
            }
        });
        document.getElementById('le-border-color')?.addEventListener('input', (e) => {
            applyChangeDebounced(el, historyEntry, 'borderColor', e.target.value);
        });
        document.getElementById('le-border-style')?.addEventListener('change', (e) => {
            applyChangeDebounced(el, historyEntry, 'borderStyle', e.target.value);
        });
    }

    function expandShadowControls(el, historyEntry) {
        const btn = document.getElementById('le-shadow-expand');
        if (!btn) return;
        const row = btn.closest('.le-row');
        if (!row) return;

        const computedStyles = window.getComputedStyle(el);
        const currentShadow = computedStyles.boxShadow;

        // Determine which preset matches
        let selectedPreset = 'none';
        if (currentShadow && currentShadow !== 'none') {
            if (currentShadow.includes('24px')) selectedPreset = 'lg';
            else if (currentShadow.includes('12px')) selectedPreset = 'md';
            else if (currentShadow.includes('4px')) selectedPreset = 'sm';
            else selectedPreset = 'custom';
        }

        row.outerHTML = `
            <div class="le-row" style="flex-direction: column; align-items: stretch; gap: 10px; padding: 12px 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="le-label">Shadow</span>
                    <div class="le-controls">
                        <button class="le-align-btn ${selectedPreset === 'none' ? 'active' : ''}" data-shadow="none" title="None" style="font-size: 10px; width: 32px;">Off</button>
                        <button class="le-align-btn ${selectedPreset === 'sm' ? 'active' : ''}" data-shadow="0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)" title="Small">S</button>
                        <button class="le-align-btn ${selectedPreset === 'md' ? 'active' : ''}" data-shadow="0 4px 12px rgba(0,0,0,0.15)" title="Medium">M</button>
                        <button class="le-align-btn ${selectedPreset === 'lg' ? 'active' : ''}" data-shadow="0 10px 24px rgba(0,0,0,0.2)" title="Large">L</button>
                    </div>
                </div>
            </div>
        `;

        // Add shadow button listeners
        document.querySelectorAll('[data-shadow]').forEach(shadowBtn => {
            shadowBtn.addEventListener('click', (e) => {
                const btn = e.target.closest('.le-align-btn');
                if (!btn) return;

                btn.parentElement.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyChangeDebounced(el, historyEntry, 'boxShadow', btn.dataset.shadow);
            });
        });
    }

    function generatePrompt() {
        if (editHistory.length === 0 || editHistory.every(h => h.changes.length === 0)) {
            return 'No changes made yet.';
        }

        // Count total changes
        const totalChanges = editHistory.reduce((sum, h) => sum + h.changes.length, 0);
        const elementsChanged = editHistory.filter(h => h.changes.length > 0).length;

        let prompt = `## Style Updates Required\n\n`;
        prompt += `**Summary:** ${totalChanges} style change${totalChanges !== 1 ? 's' : ''} across ${elementsChanged} element${elementsChanged !== 1 ? 's' : ''}\n\n`;

        editHistory.forEach((entry, index) => {
            if (entry.changes.length === 0) return;

            const sel = entry.selector;
            const tagInfo = sel.tag + (sel.id ? `#${sel.id}` : '') + (sel.classes.length ? `.${sel.classes.slice(0, 2).join('.')}` : '');

            prompt += `### ${index + 1}. \`${tagInfo}\`\n`;
            prompt += `Selector: \`${sel.uniqueSelector}\`\n\n`;

            // Group changes by category
            const layoutProps = ['display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'padding', 'margin'];
            const typographyProps = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color'];
            const visualProps = ['backgroundColor', 'borderRadius', 'borderWidth', 'borderColor', 'borderStyle', 'boxShadow', 'opacity'];

            const layoutChanges = entry.changes.filter(c => layoutProps.includes(c.property));
            const typoChanges = entry.changes.filter(c => typographyProps.includes(c.property));
            const visualChanges = entry.changes.filter(c => visualProps.includes(c.property));
            const otherChanges = entry.changes.filter(c =>
                !layoutProps.includes(c.property) &&
                !typographyProps.includes(c.property) &&
                !visualProps.includes(c.property)
            );

            if (layoutChanges.length > 0) {
                prompt += `**Layout:**\n`;
                layoutChanges.forEach(change => {
                    prompt += `- \`${camelToKebab(change.property)}: ${change.newValue}\`\n`;
                });
            }

            if (typoChanges.length > 0) {
                prompt += `**Typography:**\n`;
                typoChanges.forEach(change => {
                    prompt += `- \`${camelToKebab(change.property)}: ${change.newValue}\`\n`;
                });
            }

            if (visualChanges.length > 0) {
                prompt += `**Visual:**\n`;
                visualChanges.forEach(change => {
                    prompt += `- \`${camelToKebab(change.property)}: ${change.newValue}\`\n`;
                });
            }

            if (otherChanges.length > 0) {
                prompt += `**Other:**\n`;
                otherChanges.forEach(change => {
                    prompt += `- \`${camelToKebab(change.property)}: ${change.newValue}\`\n`;
                });
            }

            prompt += `\n`;
        });

        prompt += `---\n`;
        prompt += `Apply only these specific style changes. Do not modify any other properties or elements.`;

        return prompt;
    }

    function camelToKebab(str) {
        return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    }

    async function copyPromptToClipboard() {
        const prompt = generatePrompt();

        try {
            await navigator.clipboard.writeText(prompt);
            showToast('📋 Prompt copied to clipboard!');
        } catch (e) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = prompt;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('📋 Prompt copied to clipboard!');
        }
    }

    function clearAllEdits() {
        // Revert all visual changes
        editHistory.forEach(entry => {
            const el = entry.element;
            // Check if element still exists in DOM
            if (el && document.body.contains(el)) {
                try {
                    entry.changes.forEach(change => {
                        el.style[change.property] = '';
                    });
                } catch (e) {
                    console.warn('Could not revert style for element:', e);
                }
            }
        });

        editHistory = [];
        updateActionBarBadge();
        closeLiveEditPanel();
        showToast('All edits cleared');
    }

    // ============================================
    // MESSAGE LISTENER
    // ============================================


    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        // Style injection commands
        if (request.action === 'INJECT_STYLES') {
            const success = injectStyles(request.css);
            sendResponse({ status: success ? 'injected' : 'error' });
            return true;
        }

        if (request.action === 'TOGGLE_PREVIEW') {
            toggleInjectedStyles();
            sendResponse({ status: 'toggled', showing: injectedStyleEl?.disabled ? 'original' : 'adapted' });
            return true;
        }

        if (request.action === 'REMOVE_STYLES') {
            removeInjectedStyles();
            sendResponse({ status: 'removed' });
            return true;
        }

        if (request.action === 'GET_PREVIEW_STATUS') {
            sendResponse(getPreviewStatus());
            return true;
        }

        if (request.action === 'START_SELECTION') {
            createOverlay();
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('click', handleClick, true);
            document.addEventListener('keydown', handleKeyDown);
            sendResponse({ status: 'started' });
        }

        if (request.action === 'START_LIVE_EDIT') {
            startLiveEditMode();
            sendResponse({ status: 'started' });
            return true;
        }

        if (request.action === 'EXTRACT_GLOBAL_THEME') {
            // Use deep scan by default now
            extractGlobalThemeDeep().then(data => {
                chrome.runtime.sendMessage({
                    type: 'ELEMENT_SELECTED',
                    data: data
                });

                showToast(`Extracted design system — ${data.deepScanData?.stats?.uniqueComponentsFound || 0} components found`);
                sendResponse({ status: 'extracted', success: true });
            }).catch(e => {
                console.error('Error extracting global theme:', e);
                hideLoader();

                // Fallback to simple extraction
                const data = extractGlobalTheme();
                chrome.runtime.sendMessage({
                    type: 'ELEMENT_SELECTED',
                    data: data
                });

                showToast('Extracted global theme — Opening results...');
                sendResponse({ status: 'extracted', success: true, fallback: true });
            });

            return true; // Keep channel open for async response
        }

        // Legacy simple extraction (if needed)
        if (request.action === 'EXTRACT_GLOBAL_THEME_SIMPLE') {
            try {
                const data = extractGlobalTheme();

                chrome.runtime.sendMessage({
                    type: 'ELEMENT_SELECTED',
                    data: data
                });

                showToast('Extracted global theme — Opening results...');
                sendResponse({ status: 'extracted', success: true });
            } catch (e) {
                console.error('Error extracting global theme:', e);
                sendResponse({ status: 'error', message: e.message });
            }
            return true;
        }

        return true;
    });
})();
