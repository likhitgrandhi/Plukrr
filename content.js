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
        if (el.closest('#plukrr-ds-builder-panel')) return;

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
            background: #ffffff !important;
            border: 1px solid #e6e1d9 !important;
            border-radius: 16px !important;
            box-shadow: 0 16px 40px rgba(30, 20, 10, 0.15) !important;
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
                    border-bottom: 1px solid #f0ece6 !important;
                    display: flex !important;
                    justify-content: space-between !important;
                    align-items: center !important;
                }
                .picker-title {
                    color: #1f1f1f !important;
                    font-size: 13px !important;
                    font-weight: 600 !important;
                    letter-spacing: 0.3px !important;
                }
                .picker-subtitle {
                    color: #6b6b6b !important;
                    font-size: 11px !important;
                    margin-top: 2px !important;
                }
                .picker-close {
                    width: 28px !important;
                    height: 28px !important;
                    border-radius: 8px !important;
                    border: 1px solid #e6e1d9 !important;
                    background: #f7f5f2 !important;
                    color: #6b6b6b !important;
                    cursor: pointer !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    font-size: 16px !important;
                    transition: all 0.15s ease !important;
                }
                .picker-close:hover {
                    background: #fff1f5 !important;
                    color: #b0314f !important;
                    border-color: #f3c3d1 !important;
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
                    background: rgba(31, 31, 31, 0.15) !important;
                    border-radius: 3px !important;
                }
                .picker-item {
                    padding: 10px 12px !important;
                    border-radius: 10px !important;
                    cursor: pointer !important;
                    transition: all 0.15s ease !important;
                    border: 1px solid transparent !important;
                    margin-bottom: 4px !important;
                    background: #ffffff !important;
                }
                .picker-item:hover {
                    background: #fff7fb !important;
                    border-color: #ff5b7f !important;
                }
                .picker-item.selected {
                    background: #fff1f5 !important;
                    border-color: #ff5b7f !important;
                }
                .picker-item-header {
                    display: flex !important;
                    align-items: center !important;
                    gap: 8px !important;
                    margin-bottom: 4px !important;
                }
                .picker-tag {
                    background: #ff5b7f !important;
                    color: white !important;
                    padding: 2px 8px !important;
                    border-radius: 4px !important;
                    font-size: 11px !important;
                    font-weight: 600 !important;
                    font-family: 'SF Mono', 'Fira Code', monospace !important;
                }
                .picker-selector {
                    color: #6b6b6b !important;
                    font-size: 11px !important;
                    font-family: 'SF Mono', 'Fira Code', monospace !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                    flex: 1 !important;
                }
                .picker-depth {
                    color: #6b6b6b !important;
                    font-size: 10px !important;
                    padding: 2px 6px !important;
                    background: #f1f1f1 !important;
                    border-radius: 4px !important;
                }
                .picker-meta {
                    display: flex !important;
                    gap: 12px !important;
                    font-size: 10px !important;
                    color: #9a9a9a !important;
                }
                .picker-meta span {
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                }
                .picker-preview {
                    color: #7a7a7a !important;
                    font-size: 11px !important;
                    margin-top: 4px !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }
                .picker-hint {
                    padding: 10px 16px !important;
                    background: #fdf9f3 !important;
                    border-top: 1px solid #f0ece6 !important;
                    font-size: 11px !important;
                    color: #6b6b6b !important;
                    text-align: center !important;
                }
            </style>
            
            <div class="picker-header">
                <div>
                    <div class="picker-title">Select Element Scope</div>
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
                Go up to capture parent containers • Click to select
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

        // IMPORTANT: Capture screenshot BEFORE showing any overlays/loaders
        // so that captureVisibleTab gets a clean view of the page
        let screenshot = null;
        try {
            // Small delay to let the selection overlay fade out
            await new Promise(resolve => setTimeout(resolve, 80));
            screenshot = await captureElementScreenshot(el);
        } catch (err) {
            console.error('[Design Copier] Screenshot capture failed:', err);
        }

        // Now show extraction loader for complex elements (after screenshot is captured)
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
            // Compress screenshot if needed (screenshot was already captured before the loader)
            if (isVeryComplex && screenshot && screenshot.length > 500000) {
                console.log(`[Design Copier] Screenshot is ${Math.round(screenshot.length / 1024)}KB, compressing...`);
                screenshot = await compressScreenshot(screenshot, 0.8, 1400);
                console.log(`[Design Copier] Compressed to ${Math.round(screenshot.length / 1024)}KB`);
            } else if (screenshot && screenshot.length > 2000000) {
                // Compress only if very large (>2MB)
                console.log(`[Design Copier] Screenshot is ${Math.round(screenshot.length / 1024)}KB, light compression...`);
                screenshot = await compressScreenshot(screenshot, 0.85, 1800);
                console.log(`[Design Copier] Compressed to ${Math.round(screenshot.length / 1024)}KB`);
            }

            // Get parent element for context
            if (isComplexElement) {
                updateLoaderProgress('Analyzing parent context...', 'Step 1 of 3');
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
                updateLoaderProgress('Building element tree...', `Step 2 of 3 — Processing ${estimatedElements} elements`);
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
                updateLoaderProgress('Extracting styles...', 'Step 3 of 3');
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
                    updateLoaderProgress('Detecting animations...', 'Finishing up...');
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
            const treeDataSize = JSON.stringify({ ...captureData, screenshot: null }).length;
            const totalDataSize = JSON.stringify(captureData).length;
            console.log(`[Design Copier] Data size: tree=${Math.round(treeDataSize / 1024)}KB, total=${Math.round(totalDataSize / 1024)}KB`);

            // Only compress screenshot if total data is very large (we have unlimitedStorage)
            if (totalDataSize > 10 * 1024 * 1024 && captureData.screenshot) {
                console.log('[Design Copier] Data very large, compressing screenshot...');
                captureData.screenshot = await compressScreenshot(captureData.screenshot, 0.75, 1200);
                captureData._screenshotCompressed = true;
                console.log(`[Design Copier] After compression: ${Math.round(JSON.stringify(captureData).length / 1024)}KB`);
            }

            if (JSON.stringify(captureData).length > 20 * 1024 * 1024 && captureData.screenshot) {
                console.log('[Design Copier] Still very large, compressing more...');
                captureData.screenshot = await compressScreenshot(captureData.screenshot, 0.6, 900);
                captureData._screenshotCompressed = true;
            }

            // Save data directly to chrome.storage.local from content script
            // This avoids Chrome message size limits for large elements
            const dataWithTimestamp = {
                ...captureData,
                _selectionTimestamp: Date.now()
            };

            try {
                await new Promise((resolve, reject) => {
                    chrome.storage.local.set({
                        lastSelection: dataWithTimestamp,
                        extractionState: { inProgress: false, complete: true }
                    }, () => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve();
                        }
                    });
                });

                console.log('[Design Copier] Data saved to storage successfully');

                // Create a small thumbnail for history (if screenshot exists)
                let historyThumbnail = null;
                if (captureData.screenshot) {
                    try {
                        historyThumbnail = await compressScreenshot(captureData.screenshot, 0.5, 300);
                    } catch (e) {
                        historyThumbnail = null;
                    }
                }

                // Send lightweight message to background to open the results tab
                chrome.runtime.sendMessage({
                    type: 'ELEMENT_SELECTED',
                    data: {
                        // Only send minimal data for history/tab management — NOT the full payload
                        pageTitle: captureData.pageTitle,
                        pageUrl: captureData.pageUrl,
                        elementCount: captureData.elementCount,
                        tree: { tag: captureData.tree?.tag, role: captureData.tree?.role },
                        screenshot: historyThumbnail,
                        timestamp: captureData.timestamp,
                        _alreadySaved: true
                    }
                });
            } catch (storageError) {
                console.error('[Design Copier] Storage save failed:', storageError);
                showToast('Error: Failed to save data. Try selecting a smaller element.');
                hideLoader();
                return;
            }

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
                        viewportWidth: Math.round(window.innerWidth),
                        viewportHeight: Math.round(window.innerHeight),
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
    // GUIDED DS BUILDER
    // ============================================

    const DS_BUILDER_STEP_DEFINITIONS = [
        { index: 0,  stepKey: 'primaryButton',   label: 'Primary Button',        prompt: 'Click a <strong>Primary Button</strong>',          sub: 'The main CTA or submit button',             auto: false, skippable: false },
        { index: 1,  stepKey: 'secondaryButton',  label: 'Secondary Button',       prompt: 'Click a <strong>Secondary Button</strong>',         sub: 'Outlined or ghost button variant',           auto: false, skippable: true  },
        { index: 2,  stepKey: 'input',            label: 'Input Field',            prompt: 'Click an <strong>Input Field</strong>',             sub: 'Any text input or search box',               auto: false, skippable: false },
        { index: 3,  stepKey: 'pageBackground',   label: 'Page Background',        prompt: 'Reading <strong>page background</strong>…',        sub: 'Auto-detected from document body',           auto: true,  skippable: false },
        { index: 4,  stepKey: 'card',             label: 'Card / Surface',         prompt: 'Click a <strong>Card or Surface</strong>',          sub: 'A raised or bordered content area',          auto: false, skippable: true  },
        { index: 5,  stepKey: 'muted',            label: 'Muted Surface',          prompt: 'Click a <strong>Muted / Secondary Surface</strong>', sub: 'A subtle background or secondary panel',    auto: false, skippable: true  },
        { index: 6,  stepKey: 'navigation',       label: 'Navigation',             prompt: 'Click the <strong>Navigation Bar or Sidebar</strong>', sub: 'The main nav or side menu',              auto: false, skippable: true  },
        { index: 7,  stepKey: 'badge',            label: 'Badge / Tag',            prompt: 'Click a <strong>Badge or Tag</strong>',             sub: 'A small label or status chip',               auto: false, skippable: true  },
        { index: 8,  stepKey: 'heading',          label: 'Heading',                prompt: 'Click a <strong>Heading</strong>',                  sub: 'An h1, h2, or page title',                   auto: false, skippable: false },
        { index: 9,  stepKey: 'bodyText',         label: 'Body Text',              prompt: 'Click a <strong>Paragraph or Body Text</strong>',   sub: 'Normal content text',                        auto: false, skippable: false },
        { index: 10, stepKey: 'destructive',      label: 'Danger Button',          prompt: 'Click a <strong>Delete / Danger Button</strong>',   sub: 'Red or warning action button',               auto: false, skippable: true  },
        { index: 11, stepKey: 'accent',           label: 'Link / Accent',          prompt: 'Click a <strong>Link or Accent Element</strong>',   sub: 'An inline link or highlighted text',         auto: false, skippable: true  },
    ];

    let _dsGuidedClickHandler = null;
    let _dsPausedStep = null;    // stepDef stored while paused
    let _dsPausedIndex = null;   // stepIndex stored while paused

    // ---- Panel HTML ----

    function _dsBuildPanelHTML(stepDef, stepIndex, paused) {
        const total = DS_BUILDER_STEP_DEFINITIONS.length;
        const pct = Math.round((stepIndex / total) * 100);

        if (paused) {
            return `
                <div class="plkr-ds-header">
                    <span class="plkr-ds-brand">Plukrr</span>
                    <span class="plkr-ds-status-pill paused">⏸ Paused</span>
                    <span class="plkr-ds-counter">${stepIndex + 1}/${total}</span>
                </div>
                <div class="plkr-ds-progress-track"><div class="plkr-ds-progress-fill" style="width:${pct}%"></div></div>
                <div class="plkr-ds-body">
                    <div class="plkr-ds-prompt paused">${stepDef.label}</div>
                    <div class="plkr-ds-sub">Navigate freely, then tap <strong>Resume</strong> when you find the right element.</div>
                </div>
                <div class="plkr-ds-actions">
                    <button class="plkr-ds-btn plkr-ds-resume" id="plkrDsResume">▶ Resume</button>
                    <button class="plkr-ds-btn plkr-ds-cancel" id="plkrDsCancel">✕</button>
                </div>`;
        }

        const skipBtn = stepDef.skippable
            ? `<button class="plkr-ds-btn plkr-ds-skip" id="plkrDsSkip">Skip</button>`
            : '';
        return `
            <div class="plkr-ds-header">
                <span class="plkr-ds-brand">Plukrr</span>
                <span class="plkr-ds-status-pill selecting">● Selecting</span>
                <span class="plkr-ds-counter">${stepIndex + 1}/${total}</span>
            </div>
            <div class="plkr-ds-progress-track"><div class="plkr-ds-progress-fill" style="width:${pct}%"></div></div>
            <div class="plkr-ds-body">
                <div class="plkr-ds-prompt">${stepDef.prompt}</div>
                <div class="plkr-ds-sub">${stepDef.sub}</div>
            </div>
            <div class="plkr-ds-actions">
                ${skipBtn}
                <button class="plkr-ds-btn plkr-ds-pause" id="plkrDsPause">⏸ Pause</button>
                <button class="plkr-ds-btn plkr-ds-cancel" id="plkrDsCancel">✕</button>
            </div>`;
    }

    function createDsBuilderPanel(stepDef, stepIndex, paused) {
        removeDsBuilderPanel();

        const style = document.createElement('style');
        style.id = 'plkr-ds-builder-style';
        style.textContent = `
            #plukrr-ds-builder-panel {
                position: fixed !important; bottom: 20px !important; right: 20px !important;
                width: 272px !important; z-index: 2147483646 !important;
                background: #ffffff !important; border: 1px solid #e5e7eb !important;
                border-radius: 12px !important; box-shadow: 0 8px 32px rgba(0,0,0,0.18) !important;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                font-size: 13px !important; color: #111827 !important; padding: 14px !important;
                box-sizing: border-box !important;
            }
            .plkr-ds-header { display:flex !important; justify-content:space-between !important; align-items:center !important; gap:6px !important; margin-bottom:8px !important; }
            .plkr-ds-brand { font-weight:700 !important; font-size:13px !important; color:#10b981 !important; flex-shrink:0 !important; }
            .plkr-ds-status-pill { font-size:10px !important; font-weight:600 !important; border-radius:20px !important; padding:2px 8px !important; flex-grow:1 !important; }
            .plkr-ds-status-pill.selecting { background:#dcfce7 !important; color:#16a34a !important; }
            .plkr-ds-status-pill.paused { background:#fef9c3 !important; color:#92400e !important; }
            .plkr-ds-counter { font-size:11px !important; color:#6b7280 !important; flex-shrink:0 !important; }
            .plkr-ds-progress-track { background:#e5e7eb !important; border-radius:4px !important; height:4px !important; margin-bottom:12px !important; }
            .plkr-ds-progress-fill { background:#10b981 !important; height:4px !important; border-radius:4px !important; transition:width 0.3s !important; }
            .plkr-ds-body { margin-bottom:12px !important; }
            .plkr-ds-prompt { font-weight:600 !important; font-size:14px !important; margin-bottom:4px !important; line-height:1.4 !important; }
            .plkr-ds-prompt.paused { font-weight:500 !important; color:#374151 !important; }
            .plkr-ds-sub { font-size:12px !important; color:#6b7280 !important; line-height:1.4 !important; }
            .plkr-ds-actions { display:flex !important; align-items:center !important; gap:6px !important; }
            .plkr-ds-btn { border:none !important; border-radius:6px !important; padding:6px 10px !important; font-size:12px !important; cursor:pointer !important; font-weight:500 !important; line-height:1 !important; }
            .plkr-ds-resume { background:#10b981 !important; color:#fff !important; flex-grow:1 !important; }
            .plkr-ds-resume:hover { background:#059669 !important; }
            .plkr-ds-pause { background:#f3f4f6 !important; color:#374151 !important; }
            .plkr-ds-pause:hover { background:#e5e7eb !important; }
            .plkr-ds-skip { background:#f3f4f6 !important; color:#374151 !important; }
            .plkr-ds-skip:hover { background:#e5e7eb !important; }
            .plkr-ds-cancel { background:transparent !important; color:#9ca3af !important; padding:6px 8px !important; }
            .plkr-ds-cancel:hover { color:#dc2626 !important; }
        `;
        document.head.appendChild(style);

        const panel = document.createElement('div');
        panel.id = 'plukrr-ds-builder-panel';
        panel.innerHTML = _dsBuildPanelHTML(stepDef, stepIndex, paused);
        document.body.appendChild(panel);

        _dsAttachPanelEvents(stepDef, stepIndex, paused);
    }

    function updateDsBuilderPanel(stepDef, stepIndex, paused) {
        const panel = document.getElementById('plukrr-ds-builder-panel');
        if (!panel) { createDsBuilderPanel(stepDef, stepIndex, paused); return; }
        panel.innerHTML = _dsBuildPanelHTML(stepDef, stepIndex, paused);
        _dsAttachPanelEvents(stepDef, stepIndex, paused);
    }

    function _dsAttachPanelEvents(stepDef, stepIndex, paused) {
        document.getElementById('plkrDsCancel')?.addEventListener('click', () => {
            removeDsBuilderPanel();
            if (overlay) overlay.style.display = 'none';
            _dsRemoveGuidedClickHandler();
            chrome.runtime.sendMessage({ type: 'DS_BUILDER_CANCELLED' });
        });

        if (paused) {
            document.getElementById('plkrDsResume')?.addEventListener('click', () => {
                _dsPausedStep = null; _dsPausedIndex = null;
                updateDsBuilderPanel(stepDef, stepIndex, false);
                startGuidedStep(stepDef, stepIndex);
            });
        } else {
            document.getElementById('plkrDsPause')?.addEventListener('click', () => {
                pauseGuidedStep(stepDef, stepIndex);
            });
            document.getElementById('plkrDsSkip')?.addEventListener('click', () => {
                _dsRemoveGuidedClickHandler();
                if (overlay) overlay.style.display = 'none';
                chrome.runtime.sendMessage({ type: 'DS_STEP_COMPLETED', stepKey: stepDef.stepKey, styles: null, stepIndex });
            });
        }
    }

    function pauseGuidedStep(stepDef, stepIndex) {
        _dsPausedStep = stepDef;
        _dsPausedIndex = stepIndex;
        _dsRemoveGuidedClickHandler();
        if (overlay) overlay.style.display = 'none';
        updateDsBuilderPanel(stepDef, stepIndex, true);
        chrome.runtime.sendMessage({ type: 'DS_BUILDER_PAUSED' });
    }

    function removeDsBuilderPanel() {
        document.getElementById('plukrr-ds-builder-panel')?.remove();
        document.getElementById('plkr-ds-builder-style')?.remove();
        _dsRemoveGuidedClickHandler();
        _dsPausedStep = null;
        _dsPausedIndex = null;
    }

    function _dsRemoveGuidedClickHandler() {
        if (_dsGuidedClickHandler) {
            document.removeEventListener('click', _dsGuidedClickHandler, true);
            document.removeEventListener('mousemove', handleMouseMove);
            _dsGuidedClickHandler = null;
        }
    }

    function _dsToHex(rgb) {
        if (!rgb || rgb === 'transparent') return null;
        // Reject transparent/near-transparent rgba before extracting channels
        const alpha = (rgb.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/) || [])[1];
        if (alpha !== undefined && parseFloat(alpha) < 0.05) return null;
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m) return null;
        return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0').toUpperCase()).join('');
    }
    function _dsIsTransparent(rgb) {
        if (!rgb || rgb === 'transparent') return true;
        const a = (rgb.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/) || [])[1];
        if (a !== undefined && parseFloat(a) < 0.05) return true;
        return rgb === 'rgba(0, 0, 0, 0)';
    }

    function extractGuidedStyles(el, stepDef) {
        const s = window.getComputedStyle(el);
        const key = stepDef.stepKey;

        function resolveBackground(element) {
            let cur = element;
            while (cur && cur !== document.documentElement) {
                const bg = window.getComputedStyle(cur).backgroundColor;
                if (!_dsIsTransparent(bg)) return bg;
                cur = cur.parentElement;
            }
            return window.getComputedStyle(document.body).backgroundColor;
        }

        function toH(rgb) { return _dsToHex(rgb) || null; }

        function nonNone(v) { return v && v !== 'none' && v !== 'normal' ? v : null; }
        // For buttons: try direct background, then first opaque child (for layered button UIs).
        // Ghost buttons legitimately return null — that's correct.
        function btnBg(el) {
            const direct = toH(s.backgroundColor);
            if (direct) return direct;
            // Some buttons render color on an inner span/div — scan immediate children
            for (const child of el.children) {
                const childBg = toH(window.getComputedStyle(child).backgroundColor);
                if (childBg) return childBg;
            }
            return null;
        }
        function surfaceBg(el) { return toH(s.backgroundColor) || toH(resolveBackground(el)); }

        if (key === 'primaryButton') {
            const bg = btnBg(el);
            return {
                primary: bg,
                primaryForeground: toH(s.color),
                primaryBorderRadius: s.borderRadius,
                primaryHeight: (s.height !== 'auto' && s.height !== '0px') ? s.height : (el.offsetHeight > 0 ? `${el.offsetHeight}px` : null),
                primaryPaddingTop: s.paddingTop !== '0px' ? s.paddingTop : null,
                primaryPaddingRight: s.paddingRight !== '0px' ? s.paddingRight : null,
                primaryBorderWidth: s.borderTopWidth !== '0px' ? s.borderTopWidth : null,
                primaryBorderColor: s.borderTopWidth !== '0px' ? toH(s.borderTopColor) : null,
                primaryBoxShadow: nonNone(s.boxShadow),
                primaryFontFamily: s.fontFamily,
                primaryFontSize: s.fontSize,
                primaryFontWeight: s.fontWeight,
                primaryLetterSpacing: nonNone(s.letterSpacing),
                primaryTextTransform: nonNone(s.textTransform),
            };
        }
        if (key === 'secondaryButton') {
            const bg = btnBg(el);
            return {
                secondary: bg,
                secondaryForeground: toH(s.color),
                secondaryBorderColor: toH(s.borderTopColor),
                secondaryBorderWidth: s.borderTopWidth !== '0px' ? s.borderTopWidth : null,
                secondaryBorderRadius: s.borderRadius,
                secondaryHeight: (s.height !== 'auto' && s.height !== '0px') ? s.height : (el.offsetHeight > 0 ? `${el.offsetHeight}px` : null),
                secondaryPaddingTop: s.paddingTop !== '0px' ? s.paddingTop : null,
                secondaryPaddingRight: s.paddingRight !== '0px' ? s.paddingRight : null,
                secondaryBoxShadow: nonNone(s.boxShadow),
            };
        }
        if (key === 'input') {
            const bg = surfaceBg(el);
            return {
                border: toH(s.borderTopColor),
                inputBg: bg,
                inputHeight: s.height,
                inputBorderRadius: s.borderRadius,
                inputBorderWidth: s.borderTopWidth,
                inputPaddingTop: s.paddingTop,
                inputPaddingRight: s.paddingRight,
                inputFontSize: s.fontSize,
                inputFontFamily: s.fontFamily,
            };
        }
        if (key === 'card') {
            const bg = surfaceBg(el);
            return {
                card: bg,
                cardForeground: toH(s.color),
                cardBorderRadius: s.borderRadius,
                cardBorderColor: toH(s.borderTopColor),
                cardBorderWidth: s.borderTopWidth !== '0px' ? s.borderTopWidth : null,
                cardPaddingTop: s.paddingTop,
                cardPaddingRight: s.paddingRight,
                cardBoxShadow: nonNone(s.boxShadow),
                cardGap: nonNone(s.gap),
            };
        }
        if (key === 'muted') {
            const bg = surfaceBg(el);
            return {
                muted: bg,
                mutedForeground: toH(s.color),
                mutedBorderRadius: s.borderRadius,
                mutedPaddingTop: s.paddingTop,
                mutedPaddingRight: s.paddingRight,
            };
        }
        if (key === 'navigation') {
            const bg = surfaceBg(el);
            return {
                sidebar: bg,
                sidebarForeground: toH(s.color),
                navigationHeight: s.height !== 'auto' ? s.height : null,
                navigationPaddingTop: s.paddingTop,
                navigationPaddingRight: s.paddingRight,
                navigationBorderColor: toH(s.borderBottomColor),
                navigationBorderWidth: s.borderBottomWidth !== '0px' ? s.borderBottomWidth : null,
            };
        }
        if (key === 'badge') {
            const bg = surfaceBg(el);
            return {
                badgeBackground: bg,
                badgeForeground: toH(s.color),
                badgeBorderRadius: s.borderRadius,
                badgeBorderColor: s.borderTopWidth !== '0px' ? toH(s.borderTopColor) : null,
                badgeFontSize: s.fontSize,
                badgeFontWeight: s.fontWeight,
                badgePaddingTop: s.paddingTop,
                badgePaddingRight: s.paddingRight,
            };
        }
        if (key === 'heading') {
            return {
                headingFontFamily: s.fontFamily,
                h1FontSize: s.fontSize,
                h1FontWeight: s.fontWeight,
                h1LineHeight: s.lineHeight,
                h1LetterSpacing: nonNone(s.letterSpacing),
                h1TextTransform: nonNone(s.textTransform),
                h1Color: toH(s.color),
            };
        }
        if (key === 'bodyText') {
            return {
                bodyFontFamily: s.fontFamily,
                bodyFontSize: s.fontSize,
                bodyLineHeight: s.lineHeight,
                bodyLetterSpacing: nonNone(s.letterSpacing),
                bodyColor: toH(s.color),
            };
        }
        if (key === 'destructive') {
            const bg = btnBg(el);
            return {
                destructive: bg,
                destructiveForeground: toH(s.color),
                destructiveBorderRadius: s.borderRadius,
                destructiveHeight: (s.height !== 'auto' && s.height !== '0px') ? s.height : (el.offsetHeight > 0 ? `${el.offsetHeight}px` : null),
                destructivePaddingTop: s.paddingTop !== '0px' ? s.paddingTop : null,
                destructivePaddingRight: s.paddingRight !== '0px' ? s.paddingRight : null,
                destructiveFontSize: s.fontSize,
                destructiveFontWeight: s.fontWeight,
                destructiveBoxShadow: nonNone(s.boxShadow),
            };
        }
        if (key === 'accent') {
            return {
                accent: toH(s.color),
                accentTextDecoration: nonNone(s.textDecoration),
                accentFontWeight: nonNone(s.fontWeight),
                ring: toH(s.color),
            };
        }
        return {};
    }

    // Walk up the DOM to find the most appropriate element for each DS Builder step.
    // Users frequently click text nodes, icons, or inner spans — this ensures we read
    // styles from the actual interactive/container element, not its children.
    function _dsResolveElement(el, stepKey) {
        const isBtn = stepKey === 'primaryButton' || stepKey === 'secondaryButton' || stepKey === 'destructive';
        const isInput = stepKey === 'input';
        const isSurface = stepKey === 'card' || stepKey === 'muted' || stepKey === 'navigation';
        const isBadge = stepKey === 'badge';

        if (isBtn) {
            // Walk up to the nearest button/link/role=button
            let cur = el;
            while (cur && cur !== document.body) {
                const tag = cur.tagName?.toLowerCase();
                if (tag === 'button' || cur.getAttribute('role') === 'button' ||
                    (tag === 'a' && cur.getAttribute('href'))) return cur;
                cur = cur.parentElement;
            }
        }

        if (isInput) {
            // Walk up to the nearest form control or its wrapper
            let cur = el;
            while (cur && cur !== document.body) {
                const tag = cur.tagName?.toLowerCase();
                if (tag === 'input' || tag === 'select' || tag === 'textarea') return cur;
                // Stop at a wrapper that has a border (likely the styled input container)
                const s = window.getComputedStyle(cur);
                if (s.borderTopWidth && s.borderTopWidth !== '0px' && cur !== el) return cur;
                cur = cur.parentElement;
            }
        }

        if (isSurface || isBadge) {
            // Walk up to the nearest element with a non-transparent background
            let cur = el;
            while (cur && cur !== document.body) {
                const bg = window.getComputedStyle(cur).backgroundColor;
                if (!_dsIsTransparent(bg)) return cur;
                cur = cur.parentElement;
            }
        }

        return el;
    }

    function startGuidedStep(stepDef, stepIndex) {
        createOverlay();
        document.addEventListener('mousemove', handleMouseMove);

        _dsGuidedClickHandler = function(e) {
            const raw = e.target;
            if (raw.closest('#plukrr-ds-builder-panel')) return;
            e.preventDefault();
            e.stopPropagation();

            _dsRemoveGuidedClickHandler();
            if (overlay) overlay.style.display = 'none';

            // Resolve to the correct semantic element for this step type.
            // Users often click text/icon children — walk up to the interactive container.
            const el = _dsResolveElement(raw, stepDef.stepKey);
            const styles = extractGuidedStyles(el, stepDef);
            chrome.runtime.sendMessage({ type: 'DS_STEP_COMPLETED', stepKey: stepDef.stepKey, styles, stepIndex });
        };
        document.addEventListener('click', _dsGuidedClickHandler, true);
    }

    function autoCaptureBodyStep(stepDef, stepIndex) {
        const bodyS = window.getComputedStyle(document.body);
        const htmlS = window.getComputedStyle(document.documentElement);
        const bg = !_dsIsTransparent(bodyS.backgroundColor) ? bodyS.backgroundColor
                 : (!_dsIsTransparent(htmlS.backgroundColor) ? htmlS.backgroundColor : null);
        const fg = !_dsIsTransparent(bodyS.color) ? bodyS.color : null;
        const styles = {
            background: _dsToHex(bg) || null,
            foreground: _dsToHex(fg) || null,
        };
        _dsBuilderCompletedSteps.push(stepDef.label);
        chrome.runtime.sendMessage({ type: 'DS_STEP_COMPLETED', stepKey: stepDef.stepKey, styles, stepIndex });
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

        if (request.action === 'CANCEL_SELECTION') {
            cancelSelection();
            sendResponse({ status: 'cancelled' });
            return true;
        }

        if (request.action === 'START_DS_BUILDER') {
            const stepDef = DS_BUILDER_STEP_DEFINITIONS[request.stepIndex];
            if (!stepDef) { sendResponse({ status: 'done' }); return true; }
            const startPaused = !!request.paused;
            if (request.stepIndex === 0 || request.fresh) {
                createDsBuilderPanel(stepDef, request.stepIndex, startPaused);
            } else {
                updateDsBuilderPanel(stepDef, request.stepIndex, startPaused);
            }
            if (!startPaused) {
                if (stepDef.auto) autoCaptureBodyStep(stepDef, request.stepIndex);
                else startGuidedStep(stepDef, request.stepIndex);
            }
            sendResponse({ status: 'started' });
            return true;
        }

        if (request.action === 'CANCEL_DS_BUILDER') {
            removeDsBuilderPanel();
            cancelSelection();
            sendResponse({ status: 'cancelled' });
            return true;
        }

        if (request.action === 'GET_SCROLL_Y') {
            sendResponse({ scrollY: Math.round(window.scrollY) });
            return;
        }

        if (request.action === 'AUTO_SCAN_PAGE') {
            performQuickScan()
                .then(data  => sendResponse({ status: 'ok', data }))
                .catch(e    => sendResponse({ status: 'error', message: e.message }));
            return true;
        }

        return true;
    });

    // ============================================
    // QUICK PAGE SCAN (for sidebar overview)
    // ============================================

    async function performQuickScan() {
        // ─── HELPERS ───────────────────────────────────────
        function cleanFamily(ff) {
            return (ff || '').split(',')[0].trim().replace(/["']/g, '') || 'System UI';
        }
        function toHex(rgb) {
            const m = (rgb || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return null;
            return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0').toUpperCase()).join('');
        }
        function isTransparent(rgb) {
            if (!rgb || rgb === 'transparent') return true;
            const a = (rgb.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/) || [])[1];
            if (a !== undefined && parseFloat(a) < 0.05) return true;
            return rgb === 'rgba(0, 0, 0, 0)';
        }
        function hexLuminance(hex) {
            if (!hex || hex.length < 7) return 0.5;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        }
        /** sRGB relative luminance 0–1 (WCAG). Used for dark-surface detection (inverse text). */
        function relLuminanceFromHex(hex) {
            if (!hex || hex.length < 7) return 0.5;
            const linear = (v) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            };
            const r = linear(parseInt(hex.slice(1, 3), 16));
            const g = linear(parseInt(hex.slice(3, 5), 16));
            const b = linear(parseInt(hex.slice(5, 7), 16));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        function skipPlukrr(el) {
            return !!(el.closest && el.closest('#plukrr-sidebar, #plukrr-picker, #dc-overlay, .le-action-bar, #plukrr-ds-builder-panel'));
        }

        /** Resolve active light/dark before reading theme tokens — avoids dark-only :root values leaking on light canvases. */
        function detectActiveColorScheme() {
            const signals = {};
            const rootEl = document.documentElement;
            const bodyEl = document.body;

            function normQuick(h) {
                if (!h) return null;
                const u = String(h).toUpperCase();
                if (/^#[0-9A-F]{6}$/.test(u)) return u;
                if (/^#[0-9A-F]{3}$/.test(u)) {
                    return '#' + u[1] + u[1] + u[2] + u[2] + u[3] + u[3];
                }
                const t = toHex(h);
                return t || null;
            }

            // 1. color-scheme on <html>
            const attrScheme = rootEl.getAttribute('color-scheme') || rootEl.getAttribute('data-theme') || rootEl.getAttribute('data-color-scheme') || '';
            if (attrScheme) signals.htmlColorSchemeAttribute = attrScheme;

            // 2. Computed color-scheme CSS property
            const gcs = getComputedStyle(rootEl);
            const schemeCss = gcs.colorScheme;
            if (schemeCss && schemeCss !== 'normal') signals.computedColorScheme = schemeCss;

            // 3. <meta name="color-scheme">
            const meta = document.querySelector('meta[name="color-scheme"]');
            if (meta) signals.metaColorScheme = (meta.getAttribute('content') || '').trim();

            // 4. Stylesheets: :root outside vs inside @media (prefers-color-scheme: dark) — different --* values?
            let dualThemeInSheets = false;
            try {
                const baseVars = {};
                const darkMqVars = {};
                function walk(rules, inDarkColorSchemeMq) {
                    if (!rules) return;
                    for (const r of rules) {
                        if (r.type === CSSRule.MEDIA_RULE) {
                            const mq = (r.media?.mediaText || r.conditionText || '').toLowerCase();
                            const isDarkMq = mq.includes('prefers-color-scheme') && mq.includes('dark');
                            walk(r.cssRules, inDarkColorSchemeMq || isDarkMq);
                        } else if (r.type === CSSRule.STYLE_RULE) {
                            const sel = (r.selectorText || '').trim();
                            if (!/^(:root|html)\b/i.test(sel.split(',')[0] || '')) continue;
                            const st = r.style;
                            const bucket = inDarkColorSchemeMq ? darkMqVars : baseVars;
                            for (let i = 0; i < st.length; i++) {
                                const p = st[i];
                                if (p && p.startsWith('--')) bucket[p] = st.getPropertyValue(p).trim();
                            }
                        }
                    }
                }
                for (const sheet of document.styleSheets) {
                    try { walk(sheet.cssRules || [], false); } catch (_) { /* CORS */ }
                }
                const keys = new Set([...Object.keys(baseVars), ...Object.keys(darkMqVars)]);
                for (const k of keys) {
                    if (baseVars[k] !== darkMqVars[k] && (baseVars[k] || darkMqVars[k])) {
                        dualThemeInSheets = true;
                        break;
                    }
                }
            } catch (_) { /* ignore */ }
            signals.prefersColorSchemeDarkDiffersFromRoot = dualThemeInSheets;

            signals.prefersDarkMediaQuery = typeof window.matchMedia === 'function'
                ? window.matchMedia('(prefers-color-scheme: dark)').matches : null;

            // 5. Body / canvas luminance (authoritative paint signal)
            const bodyBg = getComputedStyle(bodyEl).backgroundColor;
            const htmlBg = getComputedStyle(rootEl).backgroundColor;
            const rawBg = !isTransparent(bodyBg) ? bodyBg : htmlBg;
            const canvasHex = normQuick(toHex(rawBg)) || '#FFFFFF';
            const bodyLum = relLuminanceFromHex(canvasHex);
            signals.bodyBackgroundLuminance = Math.round(bodyLum * 1000) / 1000;

            let mode = 'unknown';
            if (attrScheme) {
                if (/\bdark\b/i.test(attrScheme) && !/\blight\b/i.test(attrScheme)) mode = 'dark';
                else if (/\blight\b/i.test(attrScheme) && !/\bdark\b/i.test(attrScheme)) mode = 'light';
            }
            if (schemeCss) {
                const parts = schemeCss.split(/[\s,]+/).filter(Boolean);
                if (parts.includes('dark') && !parts.includes('light')) mode = 'dark';
                else if (parts.includes('light') && !parts.includes('dark')) mode = 'light';
            }
            if (signals.metaColorScheme) {
                const m = signals.metaColorScheme.toLowerCase();
                if (m === 'dark' || m === 'only dark') mode = 'dark';
                if (m === 'light' || m === 'only light') mode = 'light';
            }
            if (bodyLum < 0.2) mode = 'dark';
            else if (bodyLum > 0.5 && mode !== 'dark') mode = 'light';

            const dualThemeDetected = !!(dualThemeInSheets || /light\s+dark|dark\s+light/i.test(signals.metaColorScheme || ''));

            return { mode, signals, dualThemeDetected };
        }

        // ─── TYPOGRAPHY ───────────────────────────────────────
        // Built after CSS variables are collected (see below) so the full scale + appendix can align.

        // ─── COLORS ───────────────────────────────────────
        const colorSchemeInfo = detectActiveColorScheme();
        const bgMap = new Map(), textMap = new Map(), borderMap = new Map(), accentMap = new Map();

        // Anchor body/html backgrounds with high weight so the canvas color wins
        // over repeated white form elements or card backgrounds.
        for (const root of [document.documentElement, document.body]) {
            const bg = getComputedStyle(root).backgroundColor;
            if (!isTransparent(bg)) {
                const hex = toHex(bg);
                if (hex) bgMap.set(hex, 60);
            }
            const col = getComputedStyle(root).color;
            if (!isTransparent(col)) {
                const hex = toHex(col);
                if (hex) textMap.set(hex, 60);
            }
        }

        let ci = 0;
        for (const el of document.querySelectorAll('*')) {
            if (++ci > 700) break;
            const s = getComputedStyle(el);
            const tag = el.tagName.toLowerCase();
            const isInteractive = tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button';
            const bg = s.backgroundColor;
            if (!isTransparent(bg)) {
                const hex = toHex(bg);
                if (hex) { isInteractive ? accentMap.set(hex, (accentMap.get(hex) || 0) + 1) : bgMap.set(hex, (bgMap.get(hex) || 0) + 1); }
            }
            const col = s.color;
            if (!isTransparent(col)) { const hex = toHex(col); if (hex) textMap.set(hex, (textMap.get(hex) || 0) + 1); }
            if (s.borderTopWidth && s.borderTopWidth !== '0px') {
                const hex = toHex(s.borderTopColor);
                if (hex && !isTransparent(s.borderTopColor)) borderMap.set(hex, (borderMap.get(hex) || 0) + 1);
            }
        }
        const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([hex, count]) => ({ hex, count }));

        /**
         * Walk all stylesheet rules (including @media / @supports nesting) and collect
         * --* definitions so var() chains can be expanded. Cross-origin sheets are skipped.
         */
        function buildResolvedCssVariables() {
            const warnings = [];
            const defMap = new Map();

            function walkAllStyleRules(rules) {
                if (!rules) return;
                for (const rule of rules) {
                    if (rule.type === CSSRule.STYLE_RULE && rule.style) {
                        const st = rule.style;
                        for (let i = 0; i < st.length; i++) {
                            const p = st[i];
                            if (p && p.startsWith('--')) {
                                defMap.set(p, st.getPropertyValue(p).trim());
                            }
                        }
                    } else if (rule.cssRules) {
                        walkAllStyleRules(rule.cssRules);
                    }
                }
            }
            for (const sheet of document.styleSheets) {
                try { walkAllStyleRules(sheet.cssRules || []); } catch (_) { /* CORS */ }
            }

            const cs = getComputedStyle(document.documentElement);

            function normHexLocal(h) {
                if (!h) return null;
                const u = String(h).toUpperCase();
                if (/^#[0-9A-F]{6}$/.test(u)) return u;
                if (/^#[0-9A-F]{3}$/.test(u)) {
                    return '#' + u[1] + u[1] + u[2] + u[2] + u[3] + u[3];
                }
                const rgb = toHex(h);
                return rgb || null;
            }

            function fullyExpandVarChain(input) {
                if (!input || typeof input !== 'string') return '';
                let cur = input.trim();
                for (let iter = 0; iter < 48 && /\bvar\s*\(/i.test(cur); iter++) {
                    const next = cur.replace(/var\s*\(\s*(--[^,)\s]+)\s*(?:,\s*([^)]+))?\s*\)/gi, (full, name, fallback) => {
                        const sub = defMap.get(name) || cs.getPropertyValue(name).trim();
                        if (sub) return sub.trim();
                        if (fallback) return fallback.trim();
                        return full;
                    });
                    if (next === cur) break;
                    cur = next;
                }
                return cur;
            }

            function probeColorCss(value) {
                if (!value) return null;
                const v = value.trim();
                if (!v || /^inherit$/i.test(v) || /^initial$/i.test(v) || /^unset$/i.test(v)) return null;
                try {
                    const el = document.createElement('div');
                    el.style.cssText = `color:${v}!important;position:absolute;visibility:hidden;pointer-events:none`;
                    document.documentElement.appendChild(el);
                    const h = normHexLocal(toHex(getComputedStyle(el).color));
                    el.remove();
                    return h;
                } catch (_) { return null; }
            }

            function probePaddingCss(value) {
                if (!value) return null;
                const v = value.trim();
                if (!v) return null;
                try {
                    const el = document.createElement('div');
                    el.style.cssText = `position:absolute;visibility:hidden;padding-left:${v}!important`;
                    document.documentElement.appendChild(el);
                    const pl = getComputedStyle(el).paddingLeft;
                    el.remove();
                    if (pl && pl !== '0px' && !/\bvar\s*\(/i.test(pl)) return pl;
                } catch (_) {}
                return null;
            }

            function probeFontCss(value) {
                if (!value) return null;
                const v = value.trim();
                if (!v) return null;
                try {
                    const el = document.createElement('div');
                    el.style.cssText = `position:absolute;visibility:hidden;font-family:${v}!important`;
                    document.documentElement.appendChild(el);
                    const ff = getComputedStyle(el).fontFamily;
                    el.remove();
                    if (ff && ff !== 'inherit' && !/\bvar\s*\(/i.test(ff))
                        return ff.split(',')[0].trim().replace(/^["']|["']$/g, '');
                } catch (_) {}
                return null;
            }

            function concreteColor(resolved) {
                const r = resolved.trim();
                if (/^#[0-9a-fA-F]{3,8}$/.test(r)) return normHexLocal(r);
                if (/^rgba?\(/i.test(r)) return normHexLocal(toHex(r));
                if (/^hsla?\(/i.test(r) || /^oklch\s*\(/i.test(r) || /^lab\s*\(/i.test(r) || /^lch\s*\(/i.test(r) || /^color\s*\(/i.test(r))
                    return probeColorCss(r);
                if (r && !/\bvar\s*\(/i.test(r) && /^[^#(]+$/.test(r))
                    return probeColorCss(r);
                if (/\bvar\s*\(/i.test(r)) return probeColorCss(r);
                return null;
            }

            function bucketForName(prop) {
                const name = prop.toLowerCase();
                if (/color|bg|background|foreground|primary|secondary|accent|muted|border|ring|destructive|success|warning|error|content|surface|canvas|palette|fill|stroke/.test(name))
                    return 'colors';
                if (/\b(gray|slate|zinc|neutral|stone|red|blue|green|emerald|amber|orange|purple|pink|rose|teal|cyan|sky|violet|fuchsia|lime)-/.test(name) ||
                    /(gray|green|red|blue|slate|zinc)[-_]?\d{2,4}\b/i.test(name))
                    return 'colors';
                if (/font|family|weight/.test(name)) return 'fonts';
                if (/size|spacing|radius|gap|padding|margin|height|width/.test(name)) return 'sizes';
                return 'other';
            }

            const customPropNames = new Set();
            function collectNames(ruleList) {
                if (!ruleList) return;
                for (const rule of ruleList) {
                    if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
                        collectNames(rule.cssRules);
                        continue;
                    }
                    if (rule.type !== CSSRule.STYLE_RULE || !rule.style) continue;
                    const st = rule.style;
                    for (let i = 0; i < st.length; i++) {
                        const p = st[i];
                        if (p && p.startsWith('--')) customPropNames.add(p);
                    }
                }
            }
            for (const sheet of document.styleSheets) {
                try { collectNames(sheet.cssRules || []); } catch (_) {}
            }
            try {
                for (let i = 0; i < cs.length; i++) {
                    const p = cs[i];
                    if (p && p.startsWith('--')) customPropNames.add(p);
                }
            } catch (_) {}

            const colors = {}, sizes = {}, fonts = {}, other = {};

            function tryResolveColor(expanded, raw, prop) {
                let out = concreteColor(expanded);
                if (!out && /\bvar\s*\(/i.test(expanded)) out = probeColorCss(raw.trim());
                if (!out) out = probeColorCss(`var(${prop})`);
                return out && !/\bvar\s*\(/i.test(out) ? out : null;
            }

            function tryResolveLength(expanded, raw) {
                const r = expanded.trim();
                if (r && !/\bvar\s*\(/i.test(r) && /^[\d.]+\s*(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)$/i.test(r)) return r;
                const pl = probePaddingCss(raw) || probePaddingCss(expanded);
                return pl && !/\bvar\s*\(/i.test(pl) ? pl : null;
            }

            for (const prop of customPropNames) {
                const raw = cs.getPropertyValue(prop).trim();
                if (!raw) continue;
                const expanded = fullyExpandVarChain(raw);
                const bucket = bucketForName(prop);

                if (bucket === 'sizes') {
                    const len = tryResolveLength(expanded, raw);
                    if (len) sizes[prop] = len;
                    else warnings.push(`Unresolved CSS size variable ${prop}: ${raw.slice(0, 120)}`);
                    continue;
                }
                if (bucket === 'fonts') {
                    let out = expanded;
                    if (/\bvar\s*\(/i.test(out)) out = probeFontCss(raw) || probeFontCss(expanded) || '';
                    else out = probeFontCss(out) || out;
                    if (out && !/\bvar\s*\(/i.test(out)) fonts[prop] = out;
                    else warnings.push(`Unresolved CSS font variable ${prop}: ${raw.slice(0, 120)}`);
                    continue;
                }
                if (bucket === 'colors') {
                    const col = tryResolveColor(expanded, raw, prop);
                    if (col) colors[prop] = col;
                    else warnings.push(`Unresolved CSS color variable ${prop}: ${raw.slice(0, 120)}`);
                    continue;
                }
                if (bucket === 'other') {
                    const col = tryResolveColor(expanded, raw, prop);
                    if (col) colors[prop] = col;
                    else if (!/\bvar\s*\(/i.test(expanded)) other[prop] = expanded;
                    else warnings.push(`Unresolved CSS variable ${prop}: ${raw.slice(0, 120)}`);
                }
            }

            return { colors, sizes, fonts, other, warnings };
        }

        const resolvedCssBundle = buildResolvedCssVariables();

        // Semantic color roles: site semantic CSS variables first, then DOM, then named CSS fallbacks, then frequency (confidence ≤ 0.6).
        // Each hex is claimed by at most one role — ordered assignment prevents contradictory buckets.
        function extractSemanticColorRoles(schemeInfo, resolvedColorMap) {
            const claimed = new Set();
            const roles = {};
            const cs = getComputedStyle(document.documentElement);

            /** Site-authored token names (e.g. Groww --border-primary) take priority over DOM inference. */
            const SITE_SEMANTIC_CSS_VARS = {
                'color.bg.canvas': ['--background-primary', '--background', '--color-background', '--bg-canvas', '--color-bg-canvas', '--canvas', '--page-background'],
                'color.bg.surface': ['--background-secondary', '--surface-primary', '--surface', '--card', '--color-card', '--background-elevated', '--bg-surface'],
                'color.text.primary': ['--content-primary', '--foreground', '--text-primary', '--color-foreground', '--color-text', '--text-primary'],
                'color.text.secondary': ['--content-secondary', '--muted-foreground', '--text-secondary', '--color-text-secondary'],
                'color.text.tertiary': ['--content-tertiary', '--text-tertiary', '--color-text-tertiary'],
                'color.text.disabled': ['--content-disabled', '--text-disabled'],
                'color.text.inverse': ['--content-inverse', '--inverse-foreground'],
                'color.action.primary': ['--background-accent', '--accent', '--primary', '--color-primary', '--action-primary'],
                'color.action.primary.hover': ['--accent-hover', '--primary-hover', '--background-accent-hover'],
                'color.feedback.positive': ['--success', '--positive', '--color-success', '--feedback-positive'],
                'color.feedback.negative': ['--error', '--destructive', '--negative', '--color-error', '--color-destructive'],
                'color.border.default': ['--border-primary', '--border', '--color-border', '--border-default'],
            };

            function surfaceConflictsWithScheme(surfaceHex, canvasHex) {
                if (!schemeInfo || schemeInfo.mode === 'unknown' || !surfaceHex) return false;
                const sl = relLuminanceFromHex(surfaceHex);
                const cl = canvasHex ? relLuminanceFromHex(canvasHex) : 0.5;
                if (schemeInfo.mode === 'light' && cl > 0.85 && sl < 0.28) return true;
                if (schemeInfo.mode === 'dark' && cl < 0.2 && sl > 0.82) return true;
                return false;
            }

            function normHex(h) {
                if (!h) return null;
                const u = h.toUpperCase();
                if (/^#[0-9A-F]{6}$/.test(u)) return u;
                if (/^#[0-9A-F]{3}$/.test(u)) {
                    return '#' + u[1] + u[1] + u[2] + u[2] + u[3] + u[3];
                }
                const rgb = toHex(h);
                return rgb || null;
            }

            function resolveCssVarColor(varNames) {
                for (const vn of varNames) {
                    const mapped = resolvedColorMap && resolvedColorMap[vn];
                    if (mapped && /^#[0-9A-F]{3,8}$/i.test(mapped))
                        return { hex: normHex(mapped), source: vn };
                    const raw = cs.getPropertyValue(vn).trim();
                    if (!raw) continue;
                    if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return { hex: normHex(raw), source: vn };
                    if (/^rgba?\(/i.test(raw)) {
                        const h = toHex(raw);
                        if (h) return { hex: h, source: vn };
                    }
                    try {
                        const probe = document.createElement('div');
                        probe.style.cssText = `color:${raw}!important;position:absolute;visibility:hidden;pointer-events:none`;
                        document.documentElement.appendChild(probe);
                        const h = normHex(toHex(getComputedStyle(probe).color));
                        probe.remove();
                        if (h) return { hex: h, source: `${vn}-resolved` };
                    } catch (_) { /* ignore */ }
                }
                return null;
            }

            function trySiteSemanticFirst(roleKey) {
                const list = SITE_SEMANTIC_CSS_VARS[roleKey];
                if (!list || !resolvedColorMap) return null;
                for (const vn of list) {
                    const hex = resolvedColorMap[vn];
                    if (hex && /^#[0-9A-F]{3,8}$/i.test(hex))
                        return {
                            hex: normHex(hex),
                            source: vn,
                            method: 'css-variable',
                            confidence: 1.0,
                            extractionSource: 'named-css-variable',
                        };
                }
                return null;
            }

            function tryClaim(roleKey, hex, source, method, confidence = 1, extractionSource) {
                if (!hex || claimed.has(hex)) return false;
                claimed.add(hex);
                roles[roleKey] = {
                    hex,
                    sourceSelector: source,
                    method,
                    confidence,
                    extractionSource: extractionSource || method,
                };
                return true;
            }

            /**
             * Aggregate computed-style hexes from all visible matches across selectors.
             * Confidence: single match 0.85, multiple same hex 0.8, conflicting hexes (dominant) 0.65.
             */
            function aggregateVisibleHexes(selectors, visitor) {
                const hexStats = new Map();
                let total = 0;
                for (const sel of selectors) {
                    try {
                        for (const el of document.querySelectorAll(sel)) {
                            if (skipPlukrr(el)) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width <= 0 || r.height <= 0) continue;
                            const st = getComputedStyle(el);
                            if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) < 0.05) continue;
                            const out = visitor(el, sel);
                            if (!out || !out.hex) continue;
                            total++;
                            const h = normHex(out.hex);
                            if (!h) continue;
                            if (!hexStats.has(h)) hexStats.set(h, { count: 0, source: out.source || sel });
                            hexStats.get(h).count++;
                        }
                    } catch (_) { /* invalid selector */ }
                }
                if (total === 0 || hexStats.size === 0) return null;
                const sorted = [...hexStats.entries()].sort((a, b) => b[1].count - a[1].count);
                const [domHex, info] = sorted[0];
                const uniqueHexCount = hexStats.size;
                let confidence;
                let extractionSource;
                if (total === 1) {
                    confidence = 0.85;
                    extractionSource = 'computed-dom-unique';
                } else if (uniqueHexCount === 1) {
                    confidence = 0.8;
                    extractionSource = 'computed-dom-consistent';
                } else {
                    confidence = 0.65;
                    extractionSource = 'computed-dom-dominant';
                }
                return { hex: domHex, source: info.source, confidence, extractionSource, method: 'dom' };
            }

            function firstVisibleForSelectors(selectors, visitor) {
                for (const sel of selectors) {
                    try {
                        for (const el of document.querySelectorAll(sel)) {
                            if (skipPlukrr(el)) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width <= 0 || r.height <= 0) continue;
                            const st = getComputedStyle(el);
                            if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) < 0.05) continue;
                            const out = visitor(el, sel);
                            if (out) return { ...out, matchedSelector: sel };
                        }
                    } catch (_) { /* invalid selector */ }
                }
                return null;
            }

            function ancestorBgChainLuminance(el) {
                let cur = el;
                while (cur && cur !== document.documentElement) {
                    const bg = getComputedStyle(cur).backgroundColor;
                    if (!isTransparent(bg)) {
                        const h = normHex(toHex(bg));
                        if (h) return relLuminanceFromHex(h);
                    }
                    cur = cur.parentElement;
                }
                const rootBg = getComputedStyle(document.documentElement).backgroundColor;
                return isTransparent(rootBg) ? 1 : relLuminanceFromHex(normHex(toHex(rootBg)) || '#FFFFFF');
            }

            function getCanvasHexLocal() {
                const bodyS = getComputedStyle(document.body);
                const htmlS = getComputedStyle(document.documentElement);
                const raw = !isTransparent(bodyS.backgroundColor) ? bodyS.backgroundColor : htmlS.backgroundColor;
                if (isTransparent(raw)) return null;
                return normHex(toHex(raw));
            }

            // ── Role order: canvas first; feedback + action before generic text (avoid stealing accent greens/reds)
            const rolePlan = [
                {
                    key: 'color.bg.canvas',
                    pick: () => {
                        const h = getCanvasHexLocal();
                        return h
                            ? {
                                  hex: h,
                                  source: 'body/html background-color',
                                  confidence: 0.85,
                                  extractionSource: 'computed-dom-unique',
                                  method: 'dom',
                              }
                            : null;
                    },
                },
                {
                    key: 'color.feedback.positive',
                    pick: () => aggregateVisibleHexes(
                        ['.success', '.positive', '.gain', '[data-sentiment="positive"]'],
                        (el, sel) => {
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.feedback.negative',
                    pick: () => aggregateVisibleHexes(
                        ['.error', '.negative', '.loss', '[data-sentiment="negative"]', '[role="alert"]'],
                        (el, sel) => {
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.action.primary',
                    pick: () => {
                        const bgPick = aggregateVisibleHexes(
                            [
                                'button[type="submit"]',
                                '.primary',
                                '[data-variant="primary"]',
                            ],
                            (el, sel) => {
                                const s = getComputedStyle(el);
                                const bg = s.backgroundColor;
                                if (!isTransparent(bg)) {
                                    const h = normHex(toHex(bg));
                                    if (h) return { hex: h, source: sel + ' (background)' };
                                }
                                return null;
                            }
                        );
                        if (bgPick) return bgPick;
                        return aggregateVisibleHexes(
                            ['main a', 'article a'],
                            (el, sel) => {
                                if (el.closest('nav, [role="navigation"], header nav, .nav')) return null;
                                const h = normHex(toHex(getComputedStyle(el).color));
                                return h ? { hex: h, source: sel + ' (link color)' } : null;
                            }
                        );
                    },
                },
                {
                    key: 'color.action.primary.hover',
                    pick: () => {
                        const hoverBg = findPrimaryHoverFromStylesheets();
                        if (hoverBg)
                            return {
                                hex: hoverBg.hex,
                                source: hoverBg.source,
                                confidence: 0.85,
                                extractionSource: 'stylesheet-hover-rule',
                                method: 'dom',
                            };
                        return null;
                    },
                },
                {
                    key: 'color.text.primary',
                    pick: () => aggregateVisibleHexes(
                        [
                            'main p:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                            'article p:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                            'main span:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                            'article span:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                            'main div:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                            'article div:not([aria-disabled="true"]):not(.muted):not(.secondary):not([data-variant="secondary"])',
                        ],
                        (el, sel) => {
                            if (el.closest('a, button, [role="button"]')) return null;
                            const lum = ancestorBgChainLuminance(el);
                            if (lum < 0.2) return null;
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.text.secondary',
                    pick: () => aggregateVisibleHexes(
                        ['.secondary', '.muted', '.subtitle', '[data-variant="secondary"]'],
                        (el, sel) => {
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.text.tertiary',
                    pick: () => aggregateVisibleHexes(
                        ['.tertiary', '[data-variant="tertiary"]', '.caption', '[class*="caption"]', 'small:not(.muted)'],
                        (el, sel) => {
                            if (el.closest('a, button')) return null;
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.text.disabled',
                    pick: () => aggregateVisibleHexes(
                        ['[aria-disabled="true"]', '[disabled]', '.disabled'],
                        (el, sel) => {
                            const h = normHex(toHex(getComputedStyle(el).color));
                            return h ? { hex: h, source: sel } : null;
                        }
                    ),
                },
                {
                    key: 'color.text.inverse',
                    pick: () => aggregateVisibleHexes(
                        [
                            'main p', 'main span', 'main h1', 'main h2', 'main h3', 'main li',
                            'article p', 'article span', 'article h1', 'article h2', 'article td',
                        ],
                        (el, sel) => {
                            if (skipPlukrr(el)) return null;
                            if (el.closest('a, button, [role="button"]')) return null;
                            let cur = el;
                            while (cur && cur !== document.body) {
                                const bg = getComputedStyle(cur).backgroundColor;
                                if (!isTransparent(bg)) {
                                    const bh = normHex(toHex(bg));
                                    if (bh && relLuminanceFromHex(bh) < 0.2) {
                                        const h = normHex(toHex(getComputedStyle(el).color));
                                        if (h) return { hex: h, source: `${sel} inverse on dark <${cur.tagName.toLowerCase()}>` };
                                    }
                                    break;
                                }
                                cur = cur.parentElement;
                            }
                            return null;
                        }
                    ),
                },
                {
                    key: 'color.border.default',
                    pick: () =>
                        aggregateVisibleHexes(
                            ['input', 'button:not(.primary):not([data-variant="primary"])', '.card'],
                            (el, sel) => {
                                const s = getComputedStyle(el);
                                if (s.borderTopWidth === '0px') return null;
                                const h = normHex(toHex(s.borderTopColor));
                                return h ? { hex: h, source: sel + ' border-color' } : null;
                            }
                        ),
                },
                {
                    key: 'color.bg.surface',
                    pick: () => {
                        const canvasH = getCanvasHexLocal();
                        return aggregateVisibleHexes(
                            ['.card', 'article', 'main section', 'main [class*="card"]'],
                            (el, sel) => {
                                const s = getComputedStyle(el);
                                const bg = s.backgroundColor;
                                if (isTransparent(bg)) return null;
                                const h = normHex(toHex(bg));
                                if (!h || (canvasH && h === canvasH)) return null;
                                const r = el.getBoundingClientRect();
                                if (r.width < 40 || r.height < 24) return null;
                                if (surfaceConflictsWithScheme(h, canvasH)) return null;
                                return { hex: h, source: sel + ' background' };
                            }
                        );
                    },
                },
            ];

            function findPrimaryHoverFromStylesheets() {
                const hints = [/button/i, /primary/i, /\.primary\b/i, /data-variant/i, /submit/i];
                for (const sheet of document.styleSheets) {
                    let rules;
                    try { rules = sheet.cssRules || sheet.rules; } catch (_) { continue; }
                    if (!rules) continue;
                    for (const rule of rules) {
                        if (rule.type !== CSSRule.STYLE_RULE) continue;
                        const stext = rule.selectorText || '';
                        if (!/:hover/.test(stext)) continue;
                        if (!hints.some((re) => re.test(stext))) continue;
                        const sty = rule.style;
                        let bg = sty && sty.backgroundColor;
                        if (!bg || bg === 'inherit' || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
                            const sh = sty && sty.background;
                            if (sh && sh !== 'none') {
                                const m = sh.match(/#([0-9a-fA-F]{3,8})\b|rgba?\([^)]+\)/);
                                if (m) bg = m[0];
                            }
                        }
                        if (bg && bg !== 'inherit' && bg !== 'transparent') {
                            const h = normHex(toHex(bg));
                            if (h) return { hex: h, source: `stylesheet:${stext.slice(0, 120)}` };
                        }
                    }
                }
                return null;
            }

            for (const step of rolePlan) {
                let got = trySiteSemanticFirst(step.key);
                if (!got) got = step.pick();
                if (!got && step.key === 'color.bg.surface') {
                    const ch = getCanvasHexLocal();
                    got = aggregateVisibleHexes(
                        ['main > div', 'article > div'],
                        (el, sel) => {
                            const bg = getComputedStyle(el).backgroundColor;
                            if (isTransparent(bg)) return null;
                            const h = normHex(toHex(bg));
                            if (!h || (ch && h === ch)) return null;
                            if (surfaceConflictsWithScheme(h, ch)) return null;
                            return { hex: h, source: sel + ' background' };
                        }
                    );
                }
                if (got && step.key === 'color.action.primary.hover' && roles['color.action.primary']?.hex === got.hex)
                    got = null;
                if (got) {
                    const method = got.method || 'dom';
                    const conf = got.confidence != null ? got.confidence : 1;
                    const ext = got.extractionSource || method;
                    if (tryClaim(step.key, got.hex, got.source || got.matchedSelector || step.key, method, conf, ext)) continue;
                }

                const cssFallbacks = {
                    'color.text.primary': ['--foreground', '--color-foreground'],
                    'color.text.secondary': ['--muted-foreground', '--color-muted-foreground'],
                    'color.text.tertiary': ['--color-muted', '--muted-foreground'],
                    'color.text.disabled': ['--muted-foreground'],
                    'color.action.primary': ['--primary', '--color-primary'],
                    'color.feedback.negative': ['--destructive', '--color-destructive', '--error'],
                    'color.feedback.positive': ['--success', '--color-success'],
                    'color.border.default': ['--border', '--color-border'],
                    'color.bg.canvas': ['--background', '--color-background'],
                    'color.bg.surface': ['--card', '--color-card'],
                };
                const cf = cssFallbacks[step.key];
                if (cf) {
                    const r = resolveCssVarColor(cf);
                    if (r && tryClaim(step.key, r.hex, r.source, 'css-variable', 0.9, 'css-variable-inferred-role')) continue;
                }

                const freqPool = {
                    'color.text.primary': textMap,
                    'color.text.secondary': textMap,
                    'color.text.tertiary': textMap,
                    'color.text.disabled': textMap,
                    'color.text.inverse': textMap,
                    'color.action.primary': accentMap,
                    'color.action.primary.hover': accentMap,
                    'color.feedback.positive': textMap,
                    'color.feedback.negative': textMap,
                    'color.border.default': borderMap,
                    'color.bg.canvas': bgMap,
                    'color.bg.surface': bgMap,
                }[step.key];
                if (freqPool) {
                    for (const [hex, count] of [...freqPool.entries()].sort((a, b) => b[1] - a[1])) {
                        const h = normHex(hex);
                        if (!h || claimed.has(h)) continue;
                        if (step.key === 'color.bg.surface' && surfaceConflictsWithScheme(h, getCanvasHexLocal())) continue;
                        tryClaim(step.key, h, `frequency(count=${count})`, 'frequency', 0.5, 'frequency-inference');
                        break;
                    }
                }
            }

            return roles;
        }

        const colorRoles = extractSemanticColorRoles(colorSchemeInfo, resolvedCssBundle.colors);

        function entryFromRole(roleName, countWeight) {
            const r = colorRoles[roleName];
            if (!r) return null;
            return {
                hex: r.hex,
                count: countWeight,
                role: roleName,
                sourceSelector: r.sourceSelector,
                confidence: r.confidence,
                method: r.method,
                extractionSource: r.extractionSource,
            };
        }

        const colors = {
            backgrounds: [
                entryFromRole('color.bg.canvas', 60),
                entryFromRole('color.bg.surface', 50),
            ].filter(Boolean),
            text: [
                entryFromRole('color.text.primary', 55),
                entryFromRole('color.text.secondary', 45),
                entryFromRole('color.text.tertiary', 40),
                entryFromRole('color.text.disabled', 25),
                entryFromRole('color.text.inverse', 20),
            ].filter(Boolean),
            borders: [entryFromRole('color.border.default', 30)].filter(Boolean),
            interactive: [
                entryFromRole('color.action.primary', 50),
                entryFromRole('color.action.primary.hover', 35),
                entryFromRole('color.feedback.positive', 28),
                entryFromRole('color.feedback.negative', 28),
            ].filter(Boolean),
            colorRoles,
        };

        // ─── COMPONENTS (Two-phase: Stylesheet Discovery + Visual Fallback) ──────

        // ── Phase 1: Stylesheet scan ──────────────────────────────────────────
        // Read all accessible CSS rules to discover component class names and
        // their interactive states. Works regardless of class naming conventions.
        // Catches components not currently rendered (modals, drawers, etc.).
        const CSS_TYPE_RULES = [
            { type: 'button',     re: /\b(btn|button)\b/i },
            { type: 'input',      re: /\b(input|field|form-control|textfield|search-bar)\b/i },
            { type: 'card',       re: /\b(card|panel|tile|surface|widget)\b/i },
            { type: 'badge',      re: /\b(badge|tag|chip|pill|status)\b/i },
            { type: 'modal',      re: /\b(modal|dialog|drawer|sheet|lightbox)\b/i },
            { type: 'alert',      re: /\b(alert|toast|notification|banner|callout|snackbar)\b/i },
            { type: 'navigation', re: /\b(nav(?:bar)?|navigation|menu(?:bar)?|breadcrumb)\b/i },
            { type: 'tooltip',    re: /\b(tooltip|popover|flyout|hint)\b/i },
            { type: 'tab',        re: /\b(tab(?:s|-list|-panel|-item|-bar)?)\b/i },
            { type: 'toggle',     re: /\b(toggle|switch)\b/i },
            { type: 'avatar',     re: /\b(avatar|profile-?pic|user-?pic|initials)\b/i },
            { type: 'progress',   re: /\b(progress(?:bar)?|loader|spinner)\b/i },
        ];

        // cssClassInfo: className → { type, states: Set<'hover'|'focus'|'disabled'|'active'> }
        const cssClassInfo = new Map();

        (function walkStylesheets(rules) {
            if (!rules) return;
            for (const rule of rules) {
                try {
                    if (rule.type === CSSRule.STYLE_RULE) {
                        for (const rawSel of (rule.selectorText || '').split(',')) {
                            const sel = rawSel.trim();
                            // extract class names from this selector segment
                            for (const cm of (sel.match(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g) || [])) {
                                const cn = cm.slice(1);
                                for (const { type, re } of CSS_TYPE_RULES) {
                                    if (!re.test(cn)) continue;
                                    if (!cssClassInfo.has(cn)) cssClassInfo.set(cn, { type, states: new Set() });
                                    const entry = cssClassInfo.get(cn);
                                    if (/:hover/.test(sel)) entry.states.add('hover');
                                    if (/:focus/.test(sel)) entry.states.add('focus');
                                    if (/:disabled|\\[disabled\\]/.test(sel)) entry.states.add('disabled');
                                    if (/:active/.test(sel)) entry.states.add('active');
                                    break;
                                }
                            }
                        }
                    } else if (rule.cssRules) {
                        walkStylesheets(rule.cssRules);
                    }
                } catch (_) {}
            }
        }((() => {
            const all = [];
            for (const sheet of document.styleSheets) {
                try { for (const r of sheet.cssRules) all.push(r); } catch (_) {}
            }
            return all;
        })()));

        // Helper: get states for an element based on its classes
        function statesForEl(el) {
            const states = new Set();
            for (const cls of el.classList) {
                const info = cssClassInfo.get(cls);
                if (info) info.states.forEach(s => states.add(s));
            }
            return states;
        }

        // Helper: build state properties object
        function stateProps(states) {
            const p = {};
            if (states.has('hover')) p['Hover State'] = 'Defined in CSS';
            if (states.has('focus')) p['Focus State'] = 'Defined in CSS';
            if (states.has('disabled')) p['Disabled State'] = 'Defined in CSS';
            if (states.has('active')) p['Active State'] = 'Defined in CSS';
            return p;
        }

        // Helper: build an extended selector combining semantic query + CSS-discovered class names
        function extendedSelector(semanticSel, type) {
            const classes = [...cssClassInfo.entries()]
                .filter(([, v]) => v.type === type)
                .map(([cn]) => { try { return `.${CSS.escape(cn)}`; } catch(_) { return null; } })
                .filter(Boolean);
            return [semanticSel, ...classes].filter(Boolean).join(', ');
        }

        // Helper: is element visible and not part of extension UI
        function isEligible(el) {
            if (el.closest('#plukrr-sidebar, #plukrr-picker, #dc-overlay, .le-action-bar')) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) >= 0.1;
        }

        // ── Additional helpers ────────────────────────────────────────────────

        // Safe background: only returns a hex value when the element truly has a fill.
        // Fixes the #000000 bug — toHex('rgba(0,0,0,0)') = '#000000' but it's transparent.
        function safeBg(s) {
            if (isTransparent(s.backgroundColor)) return null;
            return toHex(s.backgroundColor) || null;
        }

        // Bucket a hex color to the nearest step so similar shades share a fingerprint.
        function colorBucket(hex) {
            if (!hex || hex.length < 7) return 'x';
            const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
            return `${Math.round(r/48)}_${Math.round(g/48)}_${Math.round(b/48)}`;
        }

        // Structural fingerprint: tag + sorted direct-child tags + visual buckets.
        // Groups elements that look and feel the same regardless of class names.
        function elFingerprint(el, s, rect) {
            const tag = el.tagName.toLowerCase();
            const bg = safeBg(s);
            const hasBorder = s.borderTopWidth !== '0px';
            const hasShadow = s.boxShadow !== 'none';
            const r = parseFloat(s.borderRadius) || 0;
            const isPtr = s.cursor === 'pointer';
            // Skip elements with no visual identity (plain wrappers)
            if (!bg && !hasBorder && !hasShadow && !isPtr &&
                !['button','a','input','li','img','svg'].includes(tag)) return null;
            if (rect.width < 16 || rect.height < 8) return null;
            const bgB = bg ? colorBucket(bg) : 'none';
            const rB = r === 0 ? 'sq' : r >= 100 ? 'full' : r >= 16 ? 'lg' : r >= 6 ? 'md' : 'sm';
            // Sorted child tags make the fingerprint order-independent
            const childSig = Array.from(el.children).slice(0, 6)
                .map(c => c.tagName.toLowerCase()).sort().join('_');
            const flags = (hasBorder?'b':'') + (hasShadow?'s':'') + (isPtr?'p':'');
            return `${tag}:${childSig}:${bgB}:${rB}:${flags}`;
        }

        // Classify a representative element into a component type using visual properties.
        function classifyElType(el, s, rect) {
            const tag = el.tagName.toLowerCase();
            const bg = safeBg(s);
            const isPtr = s.cursor === 'pointer';
            const { height: h, width: w } = rect;
            const text = el.textContent?.trim() || '';
            const role = el.getAttribute('role') || '';
            const childCount = el.children.length;
            const r = parseFloat(s.borderRadius) || 0;
            const vw = window.innerWidth || document.documentElement.clientWidth;
            const hasBorder = s.borderTopWidth !== '0px';
            const hasShadow = s.boxShadow !== 'none';
            const hasDashedBorder = s.borderTopStyle === 'dashed' || s.borderTopStyle === 'dotted';

            // "Own visual identity" — element has its own visual signal, not just inherited cursor.
            // A div inside a clickable card inherits cursor:pointer from the card but has no bg/border.
            // Without this guard, every text div inside a card becomes a false-positive button/list-item.
            const hasOwnVisual = !!(bg || hasBorder || hasShadow || hasDashedBorder);

            // Semantic tags are definitive — no visual check needed
            if (tag === 'button' || role === 'button') return 'button';
            if (['input','textarea','select'].includes(tag)) return 'input';

            // Nav item: being inside a nav container is strong enough on its own
            if (isPtr && text.length > 0 && h >= 24 && h <= 80 &&
                el.closest('nav,[role="navigation"],header,[class*="sidebar"],[class*="sidenav"],[class*="menu"]')) return 'nav-item';

            // Button: cursor+size heuristic MUST be backed by own visual identity or semantic anchor.
            // Prevents text nodes inside clickable cards from being classified as buttons.
            if (isPtr && h >= 22 && h <= 64 && w >= 36 && text.length > 0 && text.length <= 60 &&
                (hasOwnVisual || tag === 'a')) return 'button';

            // Anchor with fill = button (tag check is own identity)
            if (tag === 'a' && bg && h >= 22 && h <= 64) return 'button';

            // Badge: already requires bg so false positives are already low
            if (h <= 32 && bg && text.length > 0 && text.length <= 30 && childCount <= 2 && r >= 3) return 'badge';

            // Card: narrower than 72% viewport + own visual identity
            if (w / vw < 0.72 && childCount >= 1 && h >= 48 && w >= 48 && hasOwnVisual) return 'card';

            // List item: li is semantic (no own-visual needed); div rows require own visual identity
            if (tag === 'li') return 'list-item';
            if (childCount >= 2 && h >= 32 && h <= 120 && isPtr && hasOwnVisual) return 'list-item';

            return null;
        }

        // Build button properties object from a computed style + rect
        function btnProps(s, rect, bg, states) {
            const hasBorder = s.borderTopWidth !== '0px';
            const hasShadow = s.boxShadow !== 'none';
            return {
                'Background': bg || 'transparent',
                'Text Color': toHex(s.color) || s.color,
                'Font Family': cleanFamily(s.fontFamily), 'Font Size': s.fontSize, 'Font Weight': s.fontWeight,
                'Letter Spacing': s.letterSpacing !== 'normal' ? s.letterSpacing : '—',
                'Text Transform': s.textTransform !== 'none' ? s.textTransform : '—',
                'Border Radius': s.borderRadius,
                'Border': hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor) || s.borderTopColor}` : '—',
                'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                'Height': rect.height > 0 ? `${Math.round(rect.height)}px` : '—',
                'Min Width': s.minWidth !== 'auto' && s.minWidth !== '0px' ? s.minWidth : '—',
                'Box Shadow': hasShadow ? s.boxShadow : '—',
                'Transition': s.transition !== 'none' && s.transition !== 'all 0s ease 0s' ? s.transition : '—',
                'Cursor': s.cursor, ...stateProps(states)
            };
        }

        function btnLabel(bg, hasBorder) {
            if (!bg) return hasBorder ? 'Outline Button' : 'Ghost Button';
            const lum = hexLuminance(bg);
            return lum < 0.35 ? 'Primary Button' : lum > 0.85 ? 'Light Button' : 'Secondary Button';
        }

        // Snapshot element position relative to viewport + document scroll at scan time.
        // Used by the screenshot pipeline to crop the right region of a tab capture.
        function makeRect(r) {
            return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), scrollY: Math.round(window.scrollY) };
        }

        function uniqueLabel(base, existing) {
            let label = base, n = 1;
            while (existing.some(c => c.label === label)) label = `${base} ${++n}`;
            return label;
        }

        // Extract typed sub-components from inside a composite component container.
        // Pass 1: classifyElType on every descendant — surfaces buttons, inputs, badges, etc.
        // Pass 2: direct children that didn't classify — headings, images, media areas.
        // Rule: backgrounds always via safeBg(). Never toHex(s.backgroundColor) directly.
        function extractAnatomy(containerEl) {
            const subComponents = [];
            const usedEls = new Set();
            const sigMap = new Map(); // vSig → subComponent entry for dedup

            // Collect visible descendants (up to 150)
            const descendants = [];
            for (const el of containerEl.querySelectorAll('*')) {
                if (descendants.length >= 150) break;
                if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay,.le-action-bar')) continue;
                const rect = el.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                const s = getComputedStyle(el);
                if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) continue;
                descendants.push({ el, s, rect });
            }

            // Pass 1: typed sub-components via classifyElType
            for (const { el, s, rect } of descendants) {
                if (usedEls.has(el) || el === containerEl) continue;
                const type = classifyElType(el, s, rect);
                // skip null and nested cards (don't recurse into cards-within-cards)
                if (!type || type === 'card') continue;

                const bg = safeBg(s); // ONLY safe path for backgrounds
                const hasBorder = s.borderTopWidth !== '0px';
                const hasShadow = s.boxShadow !== 'none';

                // Dedup visual signature per type
                let vSig;
                if      (type === 'button')    vSig = `btn:${bg}:${s.borderRadius}:${s.fontSize}:${s.fontWeight}:${hasBorder}`;
                else if (type === 'input')     vSig = `input:${bg}:${s.borderRadius}:${toHex(s.borderTopColor)}:${s.fontSize}`;
                else if (type === 'badge')     vSig = `badge:${bg}:${s.borderRadius}:${s.fontSize}`;
                else if (type === 'nav-item')  vSig = `nav-item:${bg}:${s.fontSize}:${s.fontWeight}`;
                else if (type === 'list-item') vSig = `list-item:${Math.round(rect.height / 8)}:${bg}`;
                else                           vSig = `${type}:${bg}:${s.borderRadius}`;

                if (sigMap.has(vSig)) {
                    sigMap.get(vSig).count++;
                    usedEls.add(el);
                    continue;
                }

                // Build props — only include keys with real values (null = omit)
                let props = {};
                if (type === 'button') {
                    props = {
                        'Background':    bg,                                                               // null if transparent — safeBg
                        'Text Color':    toHex(s.color) || null,                                          // text always opaque
                        'Font Size':     s.fontSize,
                        'Font Weight':   s.fontWeight,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : null,
                        'Border':        hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor) || s.borderTopColor}` : null,
                        'Padding':       `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Height':        `${Math.round(rect.height)}px`,
                        'Box Shadow':    hasShadow ? s.boxShadow : null,
                        '_label':        el.textContent?.trim().slice(0, 30) || el.value || null
                    };
                } else if (type === 'input') {
                    const inputEl = el.tagName.toLowerCase() === 'input' ? el : el.querySelector('input,textarea,select');
                    props = {
                        'Background':    bg,                                                               // null if transparent
                        'Border':        hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor) || s.borderTopColor}` : null,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : null,
                        'Font Size':     s.fontSize,
                        'Text Color':    toHex(s.color) || null,
                        'Padding':       `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Placeholder':   inputEl?.getAttribute('placeholder') || null,
                        'Type':          inputEl?.getAttribute('type') || null
                    };
                } else if (type === 'badge') {
                    props = {
                        'Background':    bg,
                        'Text Color':    toHex(s.color) || null,
                        'Font Size':     s.fontSize,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : null,
                        'Padding':       `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        '_label':        el.textContent?.trim().slice(0, 20) || null
                    };
                } else if (type === 'nav-item') {
                    props = {
                        'Text Color':    toHex(s.color) || null,
                        'Background':    bg,
                        'Font Size':     s.fontSize,
                        'Font Weight':   s.fontWeight,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : null,
                        'Padding':       `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        '_label':        el.textContent?.trim().slice(0, 20) || null
                    };
                } else if (type === 'list-item') {
                    props = {
                        'Background':    bg,
                        'Height':        `${Math.round(rect.height)}px`,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : null,
                        'Border Bottom': s.borderBottomWidth !== '0px' ? `${s.borderBottomWidth} ${s.borderBottomStyle} ${toHex(s.borderBottomColor) || s.borderBottomColor}` : null,
                        'Padding':       `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Gap':           s.gap !== 'normal' && s.gap !== '0px' ? s.gap : null,
                        'Display':       s.display
                    };
                }

                const entry = { type, count: 1, props };
                sigMap.set(vSig, entry);
                subComponents.push(entry);
                usedEls.add(el);
            }

            // Pass 2: notable direct children that didn't get typed above
            for (const child of Array.from(containerEl.children)) {
                if (usedEls.has(child)) continue;
                const rect = child.getBoundingClientRect();
                if (!rect.width || !rect.height) continue;
                const s = getComputedStyle(child);
                if (s.display === 'none' || s.visibility === 'hidden') continue;

                const tag = child.tagName.toLowerCase();
                const text = child.textContent?.trim().slice(0, 60) || '';
                const fw = parseInt(s.fontWeight) || 400;
                const fs = parseFloat(s.fontSize) || 14;

                if (['h1','h2','h3','h4','h5','h6'].includes(tag) || (fw >= 600 && fs >= 15 && text && child.children.length === 0)) {
                    subComponents.push({ type: 'heading', count: 1, props: {
                        'Font Size':   s.fontSize,
                        'Font Weight': s.fontWeight,
                        'Color':       toHex(s.color) || null,   // text color — toHex fine for opaque text
                        '_label':      text
                    }});
                    usedEls.add(child);
                } else if (tag === 'svg' || tag === 'canvas' || tag === 'img' || child.querySelector('svg,canvas')) {
                    subComponents.push({ type: 'media', count: 1, props: {
                        'Width':  `${Math.round(rect.width)}px`,
                        'Height': `${Math.round(rect.height)}px`
                    }});
                    usedEls.add(child);
                }
            }

            return subComponents;
        }

        // ── Phase 2: Single DOM traversal — collect + fingerprint ─────────────
        // One pass over 2500 elements. Collects every visible element with its
        // computed style, groups them by structural fingerprint.
        // Repetition (2+ identical fingerprints) = component found in the wild.
        const fpGroups = new Map();   // fingerprint → [{el, s, rect}]
        const allVisible  = [];       // all eligible {el, s, rect} for supplemental pass
        let domCount = 0;

        for (const el of document.querySelectorAll('*')) {
            if (++domCount > 2500) break;
            if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay,.le-action-bar')) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const s = getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) continue;

            allVisible.push({ el, s, rect });

            const fp = elFingerprint(el, s, rect);
            if (!fp) continue;
            if (!fpGroups.has(fp)) fpGroups.set(fp, []);
            fpGroups.get(fp).push({ el, s, rect });
        }

        const coveredElements = new Set();
        const components = [];
        const usedVisualSigs = new Map(); // visual sig → component (cross-group dedup)

        // ── Phase 3: Extract repeated-pattern components ──────────────────────
        // Groups with 2+ members are real components. Sort by count descending
        // so high-frequency components (product cards × 24) appear first.
        const repeatedGroups = [...fpGroups.values()]
            .filter(g => g.length >= 2)
            .sort((a, b) => b.length - a.length);

        for (const group of repeatedGroups) {
            const { el: rep, s, rect } = group[0];
            const type = classifyElType(rep, s, rect);
            if (!type || type === 'input') continue;

            const bg = safeBg(s);
            const hasBorder = s.borderTopWidth !== '0px';
            const hasShadow  = s.boxShadow !== 'none';
            const count = group.length;

            // Visual dedup key — prevents two fingerprint groups that are visually
            // identical (e.g. same button in two DOM locations) from appearing twice.
            let vSig;
            if      (type === 'button')    vSig = `btn:${bg}:${s.borderRadius}:${s.fontSize}:${s.fontWeight}:${hasBorder}`;
            else if (type === 'card')      vSig = `card:${bg}:${s.borderRadius}:${s.boxShadow?.slice(0,24)}`;
            else if (type === 'badge')     vSig = `badge:${bg}:${s.borderRadius}:${s.fontSize}`;
            else if (type === 'nav-item')  vSig = `nav-item:${bg}:${s.borderRadius}:${s.fontSize}:${s.fontWeight}`;
            else if (type === 'list-item') vSig = `list-item:${bg}:${s.borderRadius}:${Math.round(parseFloat(s.height || 0)/8)}`;
            else                           vSig = `${type}:${bg}:${s.borderRadius}`;

            if (usedVisualSigs.has(vSig)) {
                usedVisualSigs.get(vSig).count += count;
                group.forEach(({ el }) => coveredElements.add(el));
                continue;
            }

            const states = statesForEl(rep);
            let item = null;

            if (type === 'button') {
                const base = btnLabel(bg, hasBorder);
                item = {
                    id: `btn_${components.length}`,
                    label: uniqueLabel(base, components),
                    category: 'button', count,
                    preview: { bg: bg || 'transparent', textColor: toHex(s.color), label: rep.textContent?.trim().slice(0,20) || rep.value || 'Button' },
                    properties: btnProps(s, rect, bg, states)
                };
            } else if (type === 'card') {
                item = {
                    id: `card_${components.length}`,
                    label: uniqueLabel('Card', components),
                    category: 'card', count,
                    preview: { bg: bg || '#fff', borderRadius: s.borderRadius, hasShadow },
                    properties: {
                        'Background': bg || 'transparent', 'Border Radius': s.borderRadius,
                        'Border': hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}` : '—',
                        'Box Shadow': hasShadow ? s.boxShadow : '—',
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Width': `${Math.round(rect.width)}px`,
                        'Max Width': s.maxWidth !== 'none' ? s.maxWidth : '—',
                        'Overflow': s.overflow !== 'visible' ? s.overflow : '—',
                        'Gap': s.gap !== 'normal' && s.gap !== '0px' ? s.gap : '—'
                    }
                };
            } else if (type === 'badge') {
                item = {
                    id: `badge_${components.length}`,
                    label: uniqueLabel('Badge', components),
                    category: 'badge', count,
                    preview: { bg, textColor: toHex(s.color) || s.color, text: rep.textContent?.trim().slice(0,15) || 'Badge' },
                    properties: {
                        'Background': bg, 'Text Color': toHex(s.color) || s.color,
                        'Font Size': s.fontSize, 'Font Weight': s.fontWeight,
                        'Border Radius': s.borderRadius,
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Border': hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}` : '—',
                        'Text Transform': s.textTransform !== 'none' ? s.textTransform : '—',
                        'Letter Spacing': s.letterSpacing !== 'normal' ? s.letterSpacing : '—'
                    }
                };
            } else if (type === 'nav-item') {
                item = {
                    id: `nav_item_${components.length}`,
                    label: uniqueLabel('Nav Item', components),
                    category: 'nav-item', count,
                    preview: {
                        bg, textColor: toHex(s.color) || s.color,
                        label: rep.textContent?.trim().slice(0, 20) || 'Nav Item',
                        active: safeBg(s) !== null
                    },
                    properties: {
                        'Text Color': toHex(s.color) || s.color,
                        'Background': bg || '—',
                        'Font Size': s.fontSize, 'Font Weight': s.fontWeight,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : '—',
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Height': `${Math.round(rect.height)}px`,
                        'Active State Background': safeBg(s) || '—'
                    }
                };
            } else if (type === 'list-item') {
                item = {
                    id: `list_item_${components.length}`,
                    label: uniqueLabel('List Item', components),
                    category: 'list-item', count,
                    preview: {
                        bg: bg || 'transparent',
                        height: `${Math.round(rect.height)}px`,
                        label: rep.textContent?.trim().slice(0, 24) || 'Row'
                    },
                    properties: {
                        'Background': bg || 'transparent',
                        'Height': `${Math.round(rect.height)}px`,
                        'Width': `${Math.round(rect.width)}px`,
                        'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : '—',
                        'Border Bottom': s.borderBottomWidth !== '0px' ? `${s.borderBottomWidth} ${s.borderBottomStyle} ${toHex(s.borderBottomColor)||s.borderBottomColor}` : '—',
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Gap': s.gap !== 'normal' && s.gap !== '0px' ? s.gap : '—',
                        'Display': s.display
                    }
                };
            }

            if (item) {
                if (type === 'card' || type === 'list-item') item.anatomy = extractAnatomy(rep);
                item.scanRect = makeRect(rect);
                components.push(item);
                usedVisualSigs.set(vSig, item);
                group.forEach(({ el }) => coveredElements.add(el));
            }
        }

        // ── Phase 4: Supplemental pass for single-occurrence interactive elements ──
        // Fingerprinting only catches repeats. A one-off hero CTA or unique button
        // is still important — catch it here via visual classification.
        {
            const btnSigMap = new Map();
            for (const { el, s, rect } of allVisible) {
                if (coveredElements.has(el)) continue;
                if (classifyElType(el, s, rect) !== 'button') continue;
                const bg = safeBg(s);
                const hasBorder = s.borderTopWidth !== '0px';
                const vSig = `btn:${bg}:${s.borderRadius}:${s.fontSize}:${s.fontWeight}:${hasBorder}`;
                if (usedVisualSigs.has(vSig)) { usedVisualSigs.get(vSig).count++; coveredElements.add(el); continue; }
                if (btnSigMap.has(vSig)) { btnSigMap.get(vSig).count++; coveredElements.add(el); continue; }
                const base = btnLabel(bg, hasBorder);
                const states = statesForEl(el);
                const item = {
                    id: `btn_s_${btnSigMap.size}`,
                    label: uniqueLabel(base, [...components, ...btnSigMap.values()]),
                    category: 'button', count: 1,
                    preview: { bg: bg || 'transparent', textColor: toHex(s.color), label: el.textContent?.trim().slice(0,20) || el.value || 'Button' },
                    properties: btnProps(s, rect, bg, states),
                    scanRect: makeRect(rect)
                };
                btnSigMap.set(vSig, item);
                usedVisualSigs.set(vSig, item);
                coveredElements.add(el);
            }
            components.push(...btnSigMap.values());
        }

        // ── Phase 4b: Single-occurrence cards and list-items ─────────────────
        // Fingerprinting misses elements that appear only once on the page.
        // This pass catches them via direct visual classification.
        {
            const cardSigMap = new Map();
            for (const { el, s, rect } of allVisible) {
                if (coveredElements.has(el)) continue;
                const type = classifyElType(el, s, rect);
                if (type !== 'card' && type !== 'list-item') continue;
                const bg = safeBg(s);
                const hasBorder = s.borderTopWidth !== '0px';
                const hasShadow = s.boxShadow !== 'none';
                // Coarse visual sig — groups near-identical singletons together
                const wBucket = Math.round(rect.width / 24);
                const hBucket = Math.round(rect.height / 24);
                const vSig = `${type}:${bg}:${s.borderRadius}:${wBucket}:${hBucket}`;
                if (usedVisualSigs.has(vSig)) { usedVisualSigs.get(vSig).count++; coveredElements.add(el); continue; }
                if (cardSigMap.has(vSig)) { cardSigMap.get(vSig).count++; coveredElements.add(el); continue; }
                let item;
                if (type === 'card') {
                    item = {
                        id: `card_s_${cardSigMap.size}`,
                        label: uniqueLabel('Card', [...components, ...cardSigMap.values()]),
                        category: 'card', count: 1,
                        preview: { bg: bg || '#fff', borderRadius: s.borderRadius, hasShadow },
                        properties: {
                            'Background': bg || 'transparent', 'Border Radius': s.borderRadius,
                            'Border': hasBorder ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}` : '—',
                            'Box Shadow': hasShadow ? s.boxShadow : '—',
                            'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                            'Width': `${Math.round(rect.width)}px`,
                            'Max Width': s.maxWidth !== 'none' ? s.maxWidth : '—',
                            'Gap': s.gap !== 'normal' && s.gap !== '0px' ? s.gap : '—',
                            'Overflow': s.overflow !== 'visible' ? s.overflow : '—'
                        }
                    };
                    item.anatomy = extractAnatomy(el);
                } else {
                    item = {
                        id: `list_item_s_${cardSigMap.size}`,
                        label: uniqueLabel('List Item', [...components, ...cardSigMap.values()]),
                        category: 'list-item', count: 1,
                        preview: { bg: bg || 'transparent', height: `${Math.round(rect.height)}px` },
                        properties: {
                            'Background': bg || 'transparent',
                            'Height': `${Math.round(rect.height)}px`,
                            'Border Radius': s.borderRadius !== '0px' ? s.borderRadius : '—',
                            'Border Bottom': s.borderBottomWidth !== '0px' ? `${s.borderBottomWidth} ${s.borderBottomStyle} ${toHex(s.borderBottomColor)||s.borderBottomColor}` : '—',
                            'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                            'Gap': s.gap !== 'normal' && s.gap !== '0px' ? s.gap : '—',
                            'Display': s.display
                        }
                    };
                    item.anatomy = extractAnatomy(el);
                }
                item.scanRect = makeRect(rect);
                cardSigMap.set(vSig, item);
                usedVisualSigs.set(vSig, item);
                coveredElements.add(el);
            }
            components.push(...cardSigMap.values());
        }

        // ── Phase 5: Semantic extraction for reliable singleton types ─────────
        // These don't benefit from fingerprinting (appear once, or need targeted props).

        // Inputs
        {
            const sigMap = new Map();
            const sel = extendedSelector(
                'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="color"]),textarea,select',
                'input'
            );
            for (const el of Array.from(document.querySelectorAll(sel)).filter(el => {
                if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay,.le-action-bar')) return false;
                const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
            }).slice(0, 20)) {
                const s = getComputedStyle(el);
                const tag = el.tagName.toLowerCase();
                const type = el.getAttribute('type') || tag;
                const sig = `${s.borderRadius}:${s.fontSize}:${toHex(s.borderTopColor)}:${type}`;
                if (sigMap.has(sig)) continue;
                const rect = el.getBoundingClientRect();
                const bg = safeBg(s);
                const typeLabels = { text:'Text Input', email:'Email Input', password:'Password Input', search:'Search Input', number:'Number Input', textarea:'Textarea', select:'Select Dropdown' };
                sigMap.set(sig, {
                    id: `input_${sigMap.size}`, label: typeLabels[type] || 'Input Field', category: 'input', count: 1,
                    preview: { bg: bg || '#fff', textColor: toHex(s.color) || '#000', borderColor: toHex(s.borderTopColor), placeholder: el.getAttribute('placeholder') || 'Input…' },
                    properties: {
                        'Background': bg || 'transparent', 'Text Color': toHex(s.color) || s.color,
                        'Border': `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}`,
                        'Border Radius': s.borderRadius, 'Font Family': cleanFamily(s.fontFamily),
                        'Font Size': s.fontSize, 'Font Weight': s.fontWeight,
                        'Height': rect.height > 0 ? `${Math.round(rect.height)}px` : '—',
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Box Shadow': s.boxShadow !== 'none' ? s.boxShadow : '—',
                        'Outline': s.outline !== 'none' ? s.outline : '—', ...stateProps(statesForEl(el))
                    }
                });
            }
            components.push(...sigMap.values());
            // Checkbox & Radio
            for (const [itype, ilabel, iid] of [['checkbox','Checkbox','checkbox_0'],['radio','Radio Button','radio_0']]) {
                const el = Array.from(document.querySelectorAll(`input[type="${itype}"]`))
                    .find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
                if (!el) continue;
                const s = getComputedStyle(el); const rect = el.getBoundingClientRect();
                components.push({ id: iid, label: ilabel, category: 'input', count: 1, preview: { type: itype },
                    properties: { 'Accent Color': s.accentColor !== 'auto' ? s.accentColor : '—', 'Width': `${Math.round(rect.width)}px`, 'Height': `${Math.round(rect.height)}px`, 'Cursor': s.cursor } });
            }
        }

        // Navigation
        {
            const sel = extendedSelector('nav,header,[role="navigation"]', 'navigation');
            const navEl = Array.from(document.querySelectorAll(sel)).find(el => {
                if (el.closest('#plukrr-sidebar,#plukrr-picker')) return false;
                const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
            });
            if (navEl) {
                const s = getComputedStyle(navEl); const rect = navEl.getBoundingClientRect();
                const firstLink = navEl.querySelector('a'); const ls = firstLink ? getComputedStyle(firstLink) : null;
                const bg = safeBg(s);
                const navItem = {
                    id: 'nav_0', label: 'Navigation Bar', category: 'navigation', count: 1,
                    preview: { bg: bg || '#fff', height: `${Math.round(rect.height)}px` },
                    properties: {
                        'Background': bg || 'transparent',
                        'Height': `${Math.round(rect.height)}px`,
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Border Bottom': s.borderBottomWidth !== '0px' ? `${s.borderBottomWidth} ${s.borderBottomStyle} ${toHex(s.borderBottomColor)||s.borderBottomColor}` : '—',
                        'Box Shadow': s.boxShadow !== 'none' ? s.boxShadow : '—', 'Position': s.position,
                        ...(ls ? { 'Link Color': toHex(ls.color)||ls.color, 'Link Font Size': ls.fontSize, 'Link Font Weight': ls.fontWeight } : {})
                    },
                    anatomy: extractAnatomy(navEl)
                };
                components.push(navItem);
            }
        }

        // Modal / Dialog
        {
            const sel = extendedSelector('dialog,[role="dialog"]', 'modal');
            const modalEl = document.querySelector(sel);
            if (modalEl) {
                const s = getComputedStyle(modalEl); const rect = modalEl.getBoundingClientRect();
                const bg = safeBg(s);
                components.push({
                    id: 'modal_0', label: 'Modal / Dialog', category: 'modal', count: 1,
                    preview: { bg: bg || '#fff', borderRadius: s.borderRadius },
                    properties: {
                        'Background': bg || 'transparent', 'Border Radius': s.borderRadius,
                        'Box Shadow': s.boxShadow !== 'none' ? s.boxShadow : '—',
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Max Width': s.maxWidth !== 'none' ? s.maxWidth : '—', 'Z-Index': s.zIndex !== 'auto' ? s.zIndex : '—'
                    }
                });
            }
        }

        // Tooltip
        {
            const sel = extendedSelector('[role="tooltip"]', 'tooltip');
            const el = document.querySelector(sel);
            if (el) {
                const s = getComputedStyle(el); const bg = safeBg(s);
                components.push({
                    id: 'tooltip_0', label: 'Tooltip', category: 'tooltip', count: 1,
                    preview: { bg: bg || '#000', textColor: toHex(s.color) },
                    properties: {
                        'Background': bg || 'transparent', 'Text Color': toHex(s.color)||s.color,
                        'Border Radius': s.borderRadius, 'Font Size': s.fontSize,
                        'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                        'Z-Index': s.zIndex !== 'auto' ? s.zIndex : '—'
                    }
                });
            }
        }

        // Alert / Toast
        {
            const sel = extendedSelector('[role="alert"],[role="status"]', 'alert');
            if (sel) {
                const sigMap = new Map();
                for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 8)) {
                    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
                    const s = getComputedStyle(el); const bg = safeBg(s);
                    if (!bg) continue;
                    const sig = `${bg}:${s.borderRadius}:${s.borderTopWidth}`;
                    if (sigMap.has(sig)) continue;
                    sigMap.set(sig, {
                        id: `alert_${sigMap.size}`, label: uniqueLabel('Alert', [...components, ...sigMap.values()]), category: 'alert', count: 1,
                        preview: { bg, textColor: toHex(s.color)||s.color, text: el.textContent?.trim().slice(0,30)||'Alert' },
                        properties: {
                            'Background': bg, 'Text Color': toHex(s.color)||s.color,
                            'Border': s.borderTopWidth !== '0px' ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}` : '—',
                            'Border Radius': s.borderRadius, 'Font Size': s.fontSize,
                            'Padding': `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
                            'Box Shadow': s.boxShadow !== 'none' ? s.boxShadow : '—'
                        }
                    });
                }
                components.push(...sigMap.values());
            }
        }

        // Tabs
        {
            const sel = extendedSelector('[role="tablist"],[role="tab"]', 'tab');
            if (sel) {
                const tabEl = Array.from(document.querySelectorAll(sel)).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
                if (tabEl) {
                    const s = getComputedStyle(tabEl); const bg = safeBg(s);
                    const activeTab = tabEl.querySelector('[aria-selected="true"],[class*="active"],[class*="selected"]');
                    const as = activeTab ? getComputedStyle(activeTab) : null;
                    components.push({
                        id: 'tab_0', label: 'Tabs', category: 'tab', count: 1,
                        preview: { bg: bg || 'transparent', textColor: toHex(s.color) },
                        properties: {
                            'Background': bg || 'transparent',
                            'Border Bottom': s.borderBottomWidth !== '0px' ? `${s.borderBottomWidth} ${s.borderBottomStyle} ${toHex(s.borderBottomColor)||s.borderBottomColor}` : '—',
                            'Gap': s.gap !== 'normal' && s.gap !== '0px' ? s.gap : '—',
                            ...(as ? { 'Active Color': toHex(as.color)||as.color, 'Active Background': safeBg(as)||'transparent' } : {})
                        }
                    });
                }
            }
        }

        // Toggle / Avatar / Progress (CSS-class driven only, no visual heuristic)
        for (const [semSel, cssType, id, label, category, buildProps] of [
            ['[role="switch"]', 'toggle', 'toggle_0', 'Toggle / Switch', 'toggle', (s, r, bg) => ({ 'Background (Off)': bg||'transparent', 'Width': `${Math.round(r.width)}px`, 'Height': `${Math.round(r.height)}px`, 'Border Radius': s.borderRadius, 'Cursor': s.cursor })],
            ['', 'avatar', 'avatar_0', 'Avatar', 'avatar', (s, r, bg) => ({ 'Width': `${Math.round(r.width)}px`, 'Height': `${Math.round(r.height)}px`, 'Background': bg||'transparent', 'Border Radius': s.borderRadius, 'Border': s.borderTopWidth !== '0px' ? `${s.borderTopWidth} ${s.borderTopStyle} ${toHex(s.borderTopColor)||s.borderTopColor}` : '—', 'Font Size': s.fontSize, 'Color': toHex(s.color)||s.color })],
            ['[role="progressbar"]', 'progress', 'progress_0', 'Progress Bar', 'progress', (s, r, bg) => ({ 'Background': bg||'transparent', 'Height': `${Math.round(r.height)}px`, 'Border Radius': s.borderRadius })],
        ]) {
            const sel = extendedSelector(semSel, cssType);
            if (!sel) continue;
            const el = Array.from(document.querySelectorAll(sel)).find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
            if (!el) continue;
            const s = getComputedStyle(el); const rect = el.getBoundingClientRect(); const bg = safeBg(s);
            components.push({ id, label, category, count: 1, preview: { bg: bg||'transparent', borderRadius: s.borderRadius }, properties: buildProps(s, rect, bg) });
        }

        // ─── SPACING SCALE ───────────────────────────────────────
        const spacingValues = new Set();
        let sc = 0;
        for (const el of document.querySelectorAll('*')) {
            if (++sc > 400) break;
            const s = getComputedStyle(el);
            for (const v of [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft, s.marginTop, s.marginBottom, s.gap, s.rowGap, s.columnGap]) {
                if (v && v !== '0px' && v !== 'auto' && v !== 'normal' && v.endsWith('px')) {
                    const n = parseFloat(v);
                    if (n > 0 && n <= 120) spacingValues.add(n);
                }
            }
        }
        const spacingArr = [...spacingValues].sort((a, b) => a - b);
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        let baseUnit = 4;
        if (spacingArr.length >= 2) {
            let g = spacingArr[0];
            for (const v of spacingArr.slice(1, 8)) g = gcd(Math.round(g), Math.round(v));
            if (g >= 2 && g <= 8) baseUnit = g;
        }
        const spacing = { scale: spacingArr.slice(0, 16), baseUnit };

        // ─── BORDER RADII ───────────────────────────────────────
        const radiiSet = new Set();
        let rc = 0;
        for (const el of document.querySelectorAll('*')) {
            if (++rc > 400) break;
            const r = getComputedStyle(el).borderRadius;
            if (r && r !== '0px' && !r.includes(' ')) radiiSet.add(r);
        }
        const radiiArr = [...radiiSet].sort((a, b) => parseFloat(a) - parseFloat(b));
        const radiiLabels = ['XS', 'SM', 'MD', 'LG', 'XL', '2XL'];
        const radii = radiiArr.slice(0, 8).map((v, i) => {
            const n = parseFloat(v);
            const label = (n >= 999 || v.includes('50%')) ? 'Full / Pill' : (radiiLabels[i] || `R${i + 1}`);
            return { id: `r${i}`, value: v, label };
        });

        // ─── SHADOWS ───────────────────────────────────────
        const shadowSet = new Set();
        let shc = 0;
        for (const el of document.querySelectorAll('*')) {
            if (++shc > 400) break;
            const s = getComputedStyle(el).boxShadow;
            if (s && s !== 'none') shadowSet.add(s);
        }
        const shadowLabels = ['Subtle', 'Low', 'Medium', 'High', 'Elevated', 'Floating'];
        const shadows = [...shadowSet].slice(0, 8).map((v, i) => {
            const blurMatch = v.match(/\d+px\s+(\d+)px\s+\d+px\s+rgba?/);
            const blur = blurMatch ? parseInt(blurMatch[1]) : 0;
            const level = blur > 20 ? 3 : blur > 8 ? 2 : 1;
            return { id: `s${i}`, value: v, label: shadowLabels[Math.min(i, shadowLabels.length - 1)], level };
        });

        // ─── CSS VARIABLES ───────────────────────────────────────
        // Populated from buildResolvedCssVariables() (earlier): concrete values only, no unresolved var() chains.
        const cssVariables = {
            colors: resolvedCssBundle.colors,
            sizes: resolvedCssBundle.sizes,
            fonts: resolvedCssBundle.fonts,
            other: resolvedCssBundle.other,
        };

        // ─── TYPOGRAPHY (DOM roles + merged scale; runs after cssVariables) ───
        const typography = (function buildDomRoleTypography() {
            const ignore = '#plukrr-sidebar, #plukrr-picker, #dc-overlay';
            const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

            function vis(el) {
                if (!el || el.closest(ignore)) return false;
                try {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                } catch (_) { return false; }
            }
            function pxNum(s) {
                const n = parseFloat(s);
                return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
            }
            function modePx(arr) {
                if (!arr || !arr.length) return 0;
                const counts = new Map();
                for (const x of arr) counts.set(x, (counts.get(x) || 0) + 1);
                return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
            }
            function parseCssLenToPx(val) {
                if (!val || typeof val !== 'string') return null;
                const v = val.trim();
                if (/^[\d.]+px$/i.test(v)) return parseFloat(v);
                const rem = v.match(/^([\d.]+)rem$/i);
                if (rem) return parseFloat(rem[1]) * rootPx;
                const em = v.match(/^([\d.]+)em$/i);
                if (em) return parseFloat(em[1]) * rootPx;
                return null;
            }
            function collectDomFontSizes() {
                const set = new Set();
                let c = 0;
                for (const el of document.querySelectorAll('*')) {
                    if (++c > 600) break;
                    if (el.closest(ignore)) continue;
                    const fs = pxNum(getComputedStyle(el).fontSize);
                    if (fs >= 8 && fs <= 200) set.add(fs);
                }
                return [...set].sort((a, b) => a - b);
            }
            function mergeScale(domSizes) {
                const s = new Set(domSizes);
                for (const bucket of [cssVariables.fonts, cssVariables.sizes, cssVariables.other]) {
                    if (!bucket) continue;
                    for (const val of Object.values(bucket)) {
                        const px = parseCssLenToPx(val);
                        if (px != null && px >= 8 && px <= 200) s.add(Math.round(px * 100) / 100);
                    }
                }
                return [...s].sort((a, b) => a - b);
            }
            function nearestAtOrBelow(target, scale) {
                if (!scale.length || !target) return target;
                const le = scale.filter(x => x <= target + 0.01).sort((a, b) => b - a);
                return le[0] != null ? le[0] : target;
            }
            function snapDownToMaxRatio(upper, lower, scale) {
                if (!lower || lower <= 0) return upper;
                const cap = 2 * lower;
                if (upper <= cap) return upper;
                const ok = scale.filter(x => x <= cap + 0.01 && x >= lower - 0.01).sort((a, b) => b - a);
                return ok[0] != null ? ok[0] : cap;
            }
            function rowFromEl(roleKey, label, tag, el, preview) {
                if (!el) return null;
                const s = getComputedStyle(el);
                return {
                    id: `role-${roleKey}`,
                    role: roleKey,
                    tag,
                    label,
                    category: 'role',
                    preview: preview || el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || label,
                    family: cleanFamily(s.fontFamily),
                    weight: s.fontWeight,
                    size: s.fontSize,
                    lineHeight: s.lineHeight,
                    letterSpacing: s.letterSpacing,
                    color: toHex(s.color) || s.color,
                    textTransform: s.textTransform !== 'none' ? s.textTransform : null,
                    fontStyle: s.fontStyle !== 'normal' ? s.fontStyle : null
                };
            }
            function findClosestEl(selectorList, targetPx) {
                let best = null, bestD = Infinity;
                for (const sel of selectorList) {
                    try {
                        for (const el of document.querySelectorAll(sel)) {
                            if (!vis(el)) continue;
                            const p = pxNum(getComputedStyle(el).fontSize);
                            const d = Math.abs(p - targetPx);
                            if (d < bestD) { bestD = d; best = el; }
                        }
                    } catch (_) {}
                }
                return best;
            }

            const domSizes = collectDomFontSizes();
            const fullScale = mergeScale(domSizes);

            const h1Els = [...document.querySelectorAll('h1')].filter(vis);
            const heroEls = [...document.querySelectorAll('[class*="hero"]')].filter(vis);
            const h1Px = h1Els.map(el => pxNum(getComputedStyle(el).fontSize));
            const heroPx = heroEls.map(el => pxNum(getComputedStyle(el).fontSize));

            const displayPxRaw = Math.max(
                h1Px.length ? Math.max(...h1Px) : 0,
                heroPx.length ? Math.max(...heroPx) : 0
            );
            const h1NonDisplay = h1Px.filter(px => displayPxRaw > 0 && px < displayPxRaw - 0.5);
            let h1RolePx = h1NonDisplay.length ? modePx(h1NonDisplay) : (h1Px.length ? modePx(h1Px) : displayPxRaw);
            if (!h1RolePx && displayPxRaw) h1RolePx = displayPxRaw;

            const h2Els = [...document.querySelectorAll('h2')].filter(vis);
            const h3Els = [...document.querySelectorAll('h3')].filter(vis);
            const h2PxArr = h2Els.map(el => pxNum(getComputedStyle(el).fontSize)).filter(Boolean);
            const h3PxArr = h3Els.map(el => pxNum(getComputedStyle(el).fontSize)).filter(Boolean);

            let h2RolePx = h2PxArr.length ? modePx(h2PxArr) : 0;
            let h3RolePx = h3PxArr.length ? modePx(h3PxArr) : 0;

            if (!h1Px.length && displayPxRaw) h1RolePx = displayPxRaw;
            if (!h1Px.length && !displayPxRaw) {
                const bfs = pxNum(getComputedStyle(document.body).fontSize);
                h1RolePx = Math.max(bfs * 1.15, 16);
            }

            const mainEl = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
            const mainPs = [...mainEl.querySelectorAll('p')].filter(vis).slice(0, 60);
            const bodyPxArr = mainPs.map(el => pxNum(getComputedStyle(el).fontSize)).filter(Boolean);
            let bodyRolePx = bodyPxArr.length ? modePx(bodyPxArr) : pxNum(getComputedStyle(document.body).fontSize);

            const smallEls = [...mainEl.querySelectorAll('p, span, small')].filter(el => {
                if (!vis(el)) return false;
                const cls = (el.className && el.className.toString) ? el.className.toString() : '';
                return el.tagName === 'SMALL' || /small|secondary|muted|caption|subtle/i.test(cls);
            }).slice(0, 50);
            let bsPxArr = smallEls.map(el => pxNum(getComputedStyle(el).fontSize)).filter(Boolean);
            let bodySmallPx = 0;
            if (bsPxArr.length) {
                let cand = modePx(bsPxArr);
                if (cand >= bodyRolePx - 0.25) {
                    const below = bsPxArr.filter(px => px < bodyRolePx - 0.25);
                    cand = below.length ? modePx(below) : nearestAtOrBelow(bodyRolePx * 0.875, fullScale) || bodyRolePx * 0.875;
                }
                bodySmallPx = cand;
            } else {
                bodySmallPx = nearestAtOrBelow(bodyRolePx * 0.875, fullScale) || bodyRolePx * 0.875;
            }

            const capEls = [...mainEl.querySelectorAll('p, span, label')].filter(vis).slice(0, 60);
            const capPxArr = capEls.map(el => pxNum(getComputedStyle(el).fontSize)).filter(Boolean);
            let captionPx = capPxArr.length ? Math.min(...capPxArr) : bodySmallPx * 0.92;

            if (!h3PxArr.length) {
                h3RolePx = nearestAtOrBelow((h1RolePx || bodyRolePx) * 0.88, fullScale) || Math.max(bodyRolePx * 1.08, 14);
            }
            if (!h2PxArr.length) {
                h2RolePx = nearestAtOrBelow(((h1RolePx || displayPxRaw) + h3RolePx) / 2, fullScale)
                    || (h1RolePx || bodyRolePx) * 0.92 || h3RolePx * 1.08;
            }

            let displayPx = displayPxRaw || h1RolePx || h2RolePx || bodyRolePx || 16;
            let vals = [displayPx, h1RolePx || displayPx, h2RolePx || h1RolePx, h3RolePx || h2RolePx, bodyRolePx, bodySmallPx || bodyRolePx * 0.88, captionPx || bodySmallPx * 0.9];
            vals = vals.map(v => Math.max(v || 0, 8));

            function monotonicDown() {
                for (let i = 1; i < 7; i++) {
                    if (vals[i] > vals[i - 1]) vals[i - 1] = vals[i];
                }
                for (let i = 5; i >= 0; i--) {
                    if (vals[i] < vals[i + 1]) vals[i + 1] = vals[i];
                }
            }
            for (let pass = 0; pass < 2; pass++) {
                monotonicDown();
                for (let i = 0; i < 6; i++) {
                    vals[i] = snapDownToMaxRatio(vals[i], vals[i + 1], fullScale);
                }
                monotonicDown();
            }

            const labels = ['Display', 'H1', 'H2', 'H3', 'Body', 'Body Small', 'Caption'];
            const keys = ['display', 'h1', 'h2', 'h3', 'body', 'bodySmall', 'caption'];
            const tags = ['h1', 'h1', 'h2', 'h3', 'p', 'p', 'span'];

            const pickDisplay = () => {
                let best = null, bestPx = -1;
                for (const el of [...h1Els, ...heroEls]) {
                    const p = pxNum(getComputedStyle(el).fontSize);
                    if (p >= vals[0] - 0.5 && p > bestPx) { bestPx = p; best = el; }
                }
                return best || h1Els[0] || heroEls[0] || document.querySelector('h1') || document.body;
            };
            const pickH1 = () => findClosestEl(['h1'], vals[1]) || h1Els[0];
            const pickH2 = () => findClosestEl(['h2'], vals[2]) || h2Els[0];
            const pickH3 = () => findClosestEl(['h3'], vals[3]) || h3Els[0];
            const pickBody = () => findClosestEl(['main p', 'article p', 'p'], vals[4]) || mainPs[0] || document.body;
            const pickBodySmall = () => findClosestEl(['main p', 'main span', 'p', 'span'], vals[5]) || smallEls[0] || pickBody();
            const pickCaption = () => {
                let best = null, bestDiff = Infinity;
                for (const el of capEls) {
                    const p = pxNum(getComputedStyle(el).fontSize);
                    const d = Math.abs(p - vals[6]);
                    if (d < bestDiff) { bestDiff = d; best = el; }
                }
                return best || capEls[0] || pickBodySmall();
            };

            const pickers = [pickDisplay, pickH1, pickH2, pickH3, pickBody, pickBodySmall, pickCaption];
            const roleRows = [];
            for (let i = 0; i < 7; i++) {
                const el = pickers[i]() || document.body;
                const sz = `${Math.round(vals[i] * 100) / 100}px`;
                const base = rowFromEl(keys[i], labels[i], tags[i], el, null);
                if (base) {
                    base.size = sz;
                    roleRows.push(base);
                }
            }

            const supplement = [];
            for (let hi = 4; hi <= 6; hi++) {
                const el = document.querySelector(`h${hi}`);
                if (!el || !vis(el)) continue;
                const s = getComputedStyle(el);
                supplement.push({
                    id: `h${hi}`, label: `Heading ${hi}`, category: 'extra', tag: `h${hi}`,
                    preview: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || `Heading ${hi}`,
                    family: cleanFamily(s.fontFamily), weight: s.fontWeight, size: s.fontSize,
                    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: toHex(s.color) || s.color,
                    textTransform: s.textTransform !== 'none' ? s.textTransform : null,
                    fontStyle: s.fontStyle !== 'normal' ? s.fontStyle : null
                });
            }
            const monoEl = document.querySelector('code, pre, kbd');
            if (monoEl && vis(monoEl)) {
                const s = getComputedStyle(monoEl);
                supplement.push({
                    id: 'mono', label: 'Code / Monospace', category: 'extra', tag: 'code',
                    preview: monoEl.textContent?.trim().slice(0, 40) || 'const x = "code";',
                    family: cleanFamily(s.fontFamily), weight: s.fontWeight, size: s.fontSize,
                    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: toHex(s.color) || s.color
                });
            }
            const uiBtnEl = document.querySelector('button, [role="button"], .btn, [class*="button"]');
            if (uiBtnEl && vis(uiBtnEl)) {
                const s = getComputedStyle(uiBtnEl);
                supplement.push({
                    id: 'ui-text', label: 'Button / UI Text', category: 'extra', tag: 'button',
                    preview: uiBtnEl.textContent?.trim().slice(0, 30) || 'Button',
                    family: cleanFamily(s.fontFamily), weight: s.fontWeight, size: s.fontSize,
                    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: toHex(s.color) || s.color,
                    textTransform: s.textTransform !== 'none' ? s.textTransform : null
                });
            }
            const navLinkEl = document.querySelector('nav a, header a, [role="navigation"] a');
            if (navLinkEl && vis(navLinkEl)) {
                const s = getComputedStyle(navLinkEl);
                supplement.push({
                    id: 'nav-link', label: 'Nav Link', category: 'extra', tag: 'a',
                    preview: navLinkEl.textContent?.trim().slice(0, 30) || 'Home',
                    family: cleanFamily(s.fontFamily), weight: s.fontWeight, size: s.fontSize,
                    lineHeight: s.lineHeight, letterSpacing: s.letterSpacing, color: toHex(s.color) || s.color
                });
            }

            return [...roleRows, ...supplement];
        })();

        // ─── LAYOUT ───────────────────────────────────────
        const layout = { maxWidth: null, containerPadding: null, breakpoints: [], gridColumns: null, gridGap: null, flexLayouts: 0, gridLayouts: 0 };
        let flexCount = 0, gridCount = 0, lc2 = 0;
        for (const el of document.querySelectorAll('*')) {
            if (++lc2 > 400) break;
            const s = getComputedStyle(el);
            if (s.display === 'flex') flexCount++;
            if (s.display === 'grid') {
                gridCount++;
                if (!layout.gridColumns && s.gridTemplateColumns && s.gridTemplateColumns !== 'none') {
                    const cols = s.gridTemplateColumns.trim().split(/\s+/).length;
                    if (cols > 1) { layout.gridColumns = cols; layout.gridGap = s.gap || s.columnGap || null; }
                }
            }
            if (!layout.maxWidth && s.maxWidth && s.maxWidth !== 'none' && s.maxWidth !== '100%') {
                const tag = el.tagName.toLowerCase();
                if (['main', 'section', 'article', 'div'].includes(tag) || el.className.toString().match(/container|wrapper|layout|content/)) {
                    layout.maxWidth = s.maxWidth;
                    layout.containerPadding = s.paddingLeft || s.paddingRight;
                }
            }
        }
        layout.flexLayouts = flexCount;
        layout.gridLayouts = gridCount;

        // Canonical breakpoints from @media (min/max-width) — clustered, rule-count filtered, max 3–4 bands.
        (function extractCanonicalBreakpoints() {
            const thresholdRuleCount = new Map();

            function countStyleRulesDeep(rules) {
                let n = 0;
                if (!rules) return 0;
                for (const r of rules) {
                    if (r.type === CSSRule.STYLE_RULE) n++;
                    else if (r.cssRules) n += countStyleRulesDeep(r.cssRules);
                }
                return n;
            }

            function extractWidthThresholdsPx(mediaText) {
                const out = [];
                if (!mediaText || typeof mediaText !== 'string') return out;
                const mt = mediaText.toLowerCase();
                const re = /\(\s*(min|max)-width\s*:\s*(\d+)px\s*\)/gi;
                let m;
                while ((m = re.exec(mt)) !== null) {
                    const px = parseInt(m[2], 10);
                    if (px >= 320 && px <= 2560) out.push(px);
                }
                return out;
            }

            function walkMediaRules(rules) {
                if (!rules) return;
                for (const rule of rules) {
                    if (rule.type === CSSRule.MEDIA_RULE) {
                        const mq = rule.conditionText || rule.media?.mediaText || '';
                        const nRules = countStyleRulesDeep(rule.cssRules);
                        const thresh = extractWidthThresholdsPx(mq);
                        const uniq = [...new Set(thresh)];
                        for (const px of uniq) {
                            thresholdRuleCount.set(px, (thresholdRuleCount.get(px) || 0) + nRules);
                        }
                        walkMediaRules(rule.cssRules);
                    } else if (rule.cssRules) {
                        walkMediaRules(rule.cssRules);
                    }
                }
            }

            for (const sheet of document.styleSheets) {
                try { walkMediaRules(sheet.cssRules || []); } catch (_) { /* CORS */ }
            }

            const sortedPairs = [...thresholdRuleCount.entries()].sort((a, b) => a[0] - b[0]);
            const clusters = [];
            for (const [px, cnt] of sortedPairs) {
                const last = clusters[clusters.length - 1];
                const onePxStep = last && px - last.maxPx === 1;
                // Split 996px vs 997px-style pairs (both in upper band); keep 600/601 clustering below.
                const highBandSplit = onePxStep && last.maxPx >= 900 && px >= 900;
                if (!last || px > last.rep * 1.1 || highBandSplit) {
                    clusters.push({ rep: px, minPx: px, maxPx: px, totalRules: cnt });
                } else {
                    last.minPx = Math.min(last.minPx, px);
                    last.maxPx = Math.max(last.maxPx, px);
                    last.totalRules += cnt;
                    last.rep = last.minPx;
                }
            }

            let kept = clusters.filter((c) => c.totalRules >= 3);
            kept.sort((a, b) => a.rep - b.rep);
            while (kept.length > 4) {
                let drop = 0;
                for (let i = 1; i < kept.length; i++) {
                    if (kept[i].totalRules < kept[drop].totalRules) drop = i;
                }
                kept.splice(drop, 1);
            }

            const meta = kept.map((c) => ({
                thresholdPx: c.rep,
                styleRules: c.totalRules,
                clusteredFrom: c.minPx !== c.maxPx ? `${c.minPx}px–${c.maxPx}px` : null,
            }));

            let T = kept.map((c) => c.rep).sort((a, b) => a - b);
            if (T.length >= 3 && T[T.length - 1] - T[T.length - 2] <= 2 && T[T.length - 1] <= 1200) {
                T = T.slice(0, -2).concat(T[T.length - 1]);
            }
            layout.breakpoints = T;
            layout.breakpointMeta = meta;

            const keyFor = (bp) =>
                bp < 480 ? 'Single column, tight padding'
                    : bp < 768 ? 'Standard mobile, stacked layout'
                        : bp < 1024 ? '2-column grids, condensed nav'
                            : 'Full layout, expanded sections';

            const rows = [];
            if (T.length === 0) {
                layout.breakpointRows = [];
                return;
            }
            if (T.length === 1) {
                const t = T[0];
                const m0 = kept.find((c) => c.rep === t);
                rows.push(
                    { name: 'Mobile', range: `< ${t}px`, anchorThresholds: [], keyChanges: keyFor(400), styleRules: null },
                    { name: 'Desktop', range: `≥ ${t}px`, anchorThresholds: [{ px: t, styleRules: m0?.totalRules ?? 0 }], keyChanges: keyFor(1024), styleRules: m0?.totalRules ?? 0 },
                );
            } else if (T.length === 2) {
                const t1 = T[0], t2 = T[1];
                const m1 = kept.find((c) => c.rep === t1);
                const m2 = kept.find((c) => c.rep === t2);
                rows.push(
                    { name: 'Mobile', range: `< ${t1}px`, anchorThresholds: [], keyChanges: keyFor(400), styleRules: null },
                    { name: 'Tablet', range: `${t1}px – ${t2 - 1}px`, anchorThresholds: [{ px: t1, styleRules: m1?.totalRules ?? 0 }], keyChanges: keyFor(t1), styleRules: m1?.totalRules ?? 0 },
                    { name: 'Desktop', range: `≥ ${t2}px`, anchorThresholds: [{ px: t2, styleRules: m2?.totalRules ?? 0 }], keyChanges: keyFor(t2), styleRules: m2?.totalRules ?? 0 },
                );
            } else {
                const t1 = T[0], t2 = T[1], t3 = T[2];
                const m1 = kept.find((c) => c.rep === t1);
                const m2 = kept.find((c) => c.rep === t2);
                const m3 = kept.find((c) => c.rep === t3);
                rows.push(
                    { name: 'Mobile', range: `< ${t1}px`, anchorThresholds: [], keyChanges: keyFor(400), styleRules: null },
                    { name: 'Tablet', range: `${t1}px – ${t2 - 1}px`, anchorThresholds: [{ px: t1, styleRules: m1?.totalRules ?? 0 }], keyChanges: keyFor(t1), styleRules: m1?.totalRules ?? 0 },
                );
                if (T.length === 3) {
                    if (t3 > 1400) {
                        rows.push(
                            { name: 'Desktop', range: `${t2}px – ${t3 - 1}px`, anchorThresholds: [{ px: t2, styleRules: m2?.totalRules ?? 0 }], keyChanges: keyFor(t2), styleRules: m2?.totalRules ?? 0 },
                            { name: 'Wide', range: `≥ ${t3}px`, anchorThresholds: [{ px: t3, styleRules: m3?.totalRules ?? 0 }], keyChanges: 'Large screens, full grid', styleRules: m3?.totalRules ?? 0 },
                        );
                    } else {
                        rows.push(
                            { name: 'Desktop', range: `≥ ${t2}px`, anchorThresholds: [{ px: t2, styleRules: m2?.totalRules ?? 0 }, { px: t3, styleRules: m3?.totalRules ?? 0 }], keyChanges: keyFor(t2), styleRules: (m2?.totalRules ?? 0) + (m3?.totalRules ?? 0) },
                        );
                    }
                } else {
                    const t4 = T[3];
                    const m4 = kept.find((c) => c.rep === t4);
                    if (t4 > 1400) {
                        rows.push(
                            { name: 'Desktop', range: `${t2}px – ${t4 - 1}px`, anchorThresholds: [{ px: t2, styleRules: m2?.totalRules ?? 0 }], keyChanges: keyFor(t2), styleRules: m2?.totalRules ?? 0 },
                            { name: 'Wide', range: `≥ ${t4}px`, anchorThresholds: [{ px: t4, styleRules: m4?.totalRules ?? 0 }], keyChanges: 'Large screens, full grid', styleRules: m4?.totalRules ?? 0 },
                        );
                    } else {
                        rows.push(
                            { name: 'Desktop', range: `≥ ${t2}px`, anchorThresholds: [{ px: t2, styleRules: m2?.totalRules ?? 0 }, { px: t3, styleRules: m3?.totalRules ?? 0 }, { px: t4, styleRules: m4?.totalRules ?? 0 }], keyChanges: keyFor(t2), styleRules: (m2?.totalRules ?? 0) + (m3?.totalRules ?? 0) + (m4?.totalRules ?? 0) },
                        );
                    }
                }
            }

            layout.breakpointRows = rows.slice(0, 4);
        })();

        // ─── SEMANTIC TOKEN EXTRACTION ──────────────────────────────────────────────
        // Role-anchored extraction: for each shadcn semantic slot, find the specific
        // element that represents that role and read directly from it.
        // This eliminates frequency-based guessing.
        function extractSemanticTokens() {
            const st = {};

            function safeBgHex(el) {
                let cur = el;
                while (cur && cur !== document.documentElement) {
                    const bg = getComputedStyle(cur).backgroundColor;
                    if (!isTransparent(bg)) return toHex(bg);
                    cur = cur.parentElement;
                }
                const rootBg = getComputedStyle(document.documentElement).backgroundColor;
                return isTransparent(rootBg) ? null : toHex(rootBg);
            }

            function firstVisible(...selectors) {
                for (const sel of selectors) {
                    try {
                        for (const el of document.querySelectorAll(sel)) {
                            if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay')) continue;
                            const r = el.getBoundingClientRect();
                            if (r.width > 0 && r.height > 0) return el;
                        }
                    } catch (_) {}
                }
                return null;
            }

            function read(el, label) {
                if (!el) return null;
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const bg = safeBgHex(el);
                const hasBorder = s.borderTopWidth !== '0px';
                return {
                    source: label,
                    bg,
                    color: toHex(s.color) || null,
                    borderColor: hasBorder ? (toHex(s.borderTopColor) || null) : null,
                    borderWidth: hasBorder ? s.borderTopWidth : null,
                    borderStyle: hasBorder ? s.borderTopStyle : null,
                    borderRadius: (s.borderRadius && s.borderRadius !== '0px') ? s.borderRadius : null,
                    fontSize: s.fontSize,
                    fontWeight: s.fontWeight,
                    fontFamily: cleanFamily(s.fontFamily),
                    letterSpacing: s.letterSpacing !== 'normal' ? s.letterSpacing : null,
                    lineHeight: s.lineHeight,
                    textTransform: s.textTransform !== 'none' ? s.textTransform : null,
                    paddingTop: s.paddingTop, paddingRight: s.paddingRight,
                    paddingBottom: s.paddingBottom, paddingLeft: s.paddingLeft,
                    boxShadow: s.boxShadow !== 'none' ? s.boxShadow : null,
                    outlineColor: s.outlineWidth !== '0px' ? (toHex(s.outlineColor) || null) : null,
                    width: Math.round(r.width),
                    height: Math.round(r.height),
                    gap: (s.gap && s.gap !== 'normal') ? s.gap : null,
                };
            }

            function set(key, value, source) {
                if (value != null && value !== '' && value !== '0px') st[key] = { value, source };
            }

            // Visual-property-based element finder — used when class-name heuristics fail
            // (CSS modules, Tailwind utility classes, CSS-in-JS all produce unhelpful class names)
            function visualFind(test, tagStr = 'div,section,article,li,span', limit = 400) {
                try {
                    const els = document.querySelectorAll(tagStr);
                    for (const el of els) {
                        if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay,#plukrr-ds-builder-panel')) continue;
                        if (test(el)) return el;
                        if (--limit <= 0) break;
                    }
                } catch (_) {}
                return null;
            }

            // ── 1. Global canvas ─────────────────────────────────────────────────────
            const bodyS = getComputedStyle(document.body);
            const htmlS = getComputedStyle(document.documentElement);
            const canvasBg = !isTransparent(bodyS.backgroundColor)
                ? toHex(bodyS.backgroundColor)
                : (!isTransparent(htmlS.backgroundColor) ? toHex(htmlS.backgroundColor) : null);
            set('background', canvasBg, 'body');
            set('foreground', toHex(bodyS.color), 'body');

            // ── 2. Primary button ────────────────────────────────────────────────────
            // Find highest-saturation button (most "primary" looking)
            const allBtns = Array.from(document.querySelectorAll(
                'button, [role="button"], input[type="submit"], a[class*="btn"], a[class*="button"]'
            )).filter(el => {
                if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay')) return false;
                const r = el.getBoundingClientRect();
                return r.width > 24 && r.height > 20 && r.height < 120;
            }).slice(0, 60);

            let primaryBtn = null, primaryBtnSat = -1;
            for (const btn of allBtns) {
                const bg = safeBgHex(btn);
                if (!bg) continue;
                const rv = parseInt(bg.slice(1,3),16), gv = parseInt(bg.slice(3,5),16), bv = parseInt(bg.slice(5,7),16);
                const mx = Math.max(rv,gv,bv), mn = Math.min(rv,gv,bv);
                const sat = mx === 0 ? 0 : (mx - mn) / mx;
                if (sat > primaryBtnSat) { primaryBtnSat = sat; primaryBtn = btn; }
            }

            if (primaryBtn) {
                const p = read(primaryBtn, primaryBtn.tagName.toLowerCase() + (primaryBtn.className ? '.' + String(primaryBtn.className).trim().split(/\s+/)[0] : ''));
                set('primary', p.bg, p.source);
                set('primaryForeground', p.color, p.source);
                set('primaryBorderRadius', p.borderRadius, p.source);
                set('primaryPaddingTop', p.paddingTop, p.source);
                set('primaryPaddingRight', p.paddingRight, p.source);
                set('primaryPaddingBottom', p.paddingBottom, p.source);
                set('primaryPaddingLeft', p.paddingLeft, p.source);
                set('primaryFontSize', p.fontSize, p.source);
                set('primaryFontWeight', p.fontWeight, p.source);
                set('primaryFontFamily', p.fontFamily, p.source);
                set('primaryLetterSpacing', p.letterSpacing, p.source);
                set('primaryTextTransform', p.textTransform, p.source);
                set('primaryHeight', p.height > 0 ? `${p.height}px` : null, p.source);
                set('primaryBoxShadow', p.boxShadow, p.source);
            }

            // Secondary button: has border but low/no fill, or ghost/outline style
            const secondaryBtn = allBtns.find(btn => {
                if (btn === primaryBtn) return false;
                const s = getComputedStyle(btn);
                const bg = safeBgHex(btn);
                if (!bg) return false;
                const hasBorder = s.borderTopWidth !== '0px';
                const rv = parseInt(bg.slice(1,3),16), gv = parseInt(bg.slice(3,5),16), bv = parseInt(bg.slice(5,7),16);
                const mx = Math.max(rv,gv,bv), mn = Math.min(rv,gv,bv);
                const sat = mx === 0 ? 0 : (mx - mn) / mx;
                return (hasBorder && sat < 0.15) || sat < primaryBtnSat * 0.4;
            });
            if (secondaryBtn) {
                const p = read(secondaryBtn, 'secondary-button');
                set('secondary', p.bg, p.source);
                set('secondaryForeground', p.color, p.source);
                set('secondaryBorderColor', p.borderColor, p.source);
                set('secondaryBorderRadius', p.borderRadius, p.source);
            }

            // Destructive button
            const destructiveBtn = firstVisible(
                'button[class*="danger"]', 'button[class*="destructive"]',
                'button[class*="delete"]', 'button[class*="error"]',
                '[class*="btn-danger"]', '[class*="btn-destructive"]', '[class*="btn-delete"]'
            );
            if (destructiveBtn) {
                const p = read(destructiveBtn, 'destructive-button');
                set('destructive', p.bg, p.source);
                set('destructiveForeground', p.color, p.source);
            }

            // ── 3. Input ─────────────────────────────────────────────────────────────
            const inputEl = firstVisible(
                'input[type="text"]', 'input[type="email"]', 'input[type="search"]',
                'input[type="password"]', 'input[type="url"]', 'input[type="tel"]',
                'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="color"]):not([type="range"])'
            );
            if (inputEl) {
                const p = read(inputEl, 'input');
                set('inputBg', p.bg, p.source);
                set('inputForeground', p.color, p.source);
                set('border', p.borderColor, 'input border');
                set('borderWidth', p.borderWidth, 'input border');
                set('inputBorderRadius', p.borderRadius, p.source);
                set('inputPaddingTop', p.paddingTop, p.source);
                set('inputPaddingRight', p.paddingRight, p.source);
                set('inputHeight', p.height > 0 ? `${p.height}px` : null, p.source);
                set('inputFontSize', p.fontSize, p.source);
            }

            // Textarea
            const textareaEl = firstVisible('textarea');
            if (textareaEl) {
                const p = read(textareaEl, 'textarea');
                set('textareaBg', p.bg, p.source);
                set('textareaBorderRadius', p.borderRadius, p.source);
                set('textareaBorderColor', p.borderColor, p.source);
                set('textareaPadding', `${p.paddingTop} ${p.paddingRight} ${p.paddingBottom} ${p.paddingLeft}`, p.source);
                set('textareaFontSize', p.fontSize, p.source);
            }

            // Select
            const selectEl = firstVisible('select');
            if (selectEl) {
                const p = read(selectEl, 'select');
                set('selectBg', p.bg, p.source);
                set('selectBorderRadius', p.borderRadius, p.source);
                set('selectBorderColor', p.borderColor, p.source);
                set('selectHeight', p.height > 0 ? `${p.height}px` : null, p.source);
            }

            // Checkbox
            const checkboxEl = firstVisible('input[type="checkbox"]', '[role="checkbox"]', '[class*="checkbox"]');
            if (checkboxEl) {
                const p = read(checkboxEl, 'checkbox');
                set('checkboxBorderColor', p.borderColor, p.source);
                set('checkboxBorderRadius', p.borderRadius, p.source);
                set('checkboxSize', Math.min(p.width, p.height) > 0 ? `${Math.min(p.width, p.height)}px` : null, p.source);
            }

            // Switch / Toggle
            const switchEl = firstVisible('[role="switch"]', '[class*="switch"]', '[class*="toggle"]');
            if (switchEl) {
                const p = read(switchEl, 'switch');
                set('switchBg', p.bg, p.source);
                set('switchBorderRadius', p.borderRadius, p.source);
                set('switchWidth', p.width > 0 ? `${p.width}px` : null, p.source);
                set('switchHeight', p.height > 0 ? `${p.height}px` : null, p.source);
            }

            // ── 4. Card ──────────────────────────────────────────────────────────────
            const cardEl = firstVisible(
                '[class*="card"]', '[class*="Card"]',
                'article[class]', '[class*="panel"]', '[class*="Panel"]',
                '[class*="tile"]', '[class*="surface"]', '[class*="widget"]'
            ) || visualFind(el => {
                // Visual fallback: element looks like a card if it has a non-page background
                // plus at least one visual distinguisher (radius / shadow / border).
                // Excludes full-width layout containers and tiny elements.
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                if (r.width < 80 || r.height < 44) return false;
                if (r.width > window.innerWidth * 0.88) return false;
                if (isTransparent(s.backgroundColor)) return false;
                if (toHex(s.backgroundColor) === canvasBg) return false;
                const hasRadius = parseFloat(s.borderRadius) > 2;
                const hasShadow = s.boxShadow !== 'none';
                const hasBorder = s.borderTopWidth !== '0px' && !isTransparent(s.borderTopColor);
                return (hasRadius || hasShadow || hasBorder) && el.children.length >= 1;
            }, 'div,article,section,li');
            if (cardEl) {
                const p = read(cardEl, String(cardEl.className).trim().split(/\s+/)[0] || 'card');
                set('card', p.bg, p.source);
                set('cardForeground', p.color, p.source);
                set('cardBorderRadius', p.borderRadius, p.source);
                set('cardBorderColor', p.borderColor, p.source);
                set('cardBoxShadow', p.boxShadow, p.source);
                set('cardPaddingTop', p.paddingTop, p.source);
                set('cardPaddingRight', p.paddingRight, p.source);
                set('cardGap', p.gap, p.source);
            }

            // ── 5. Badge ─────────────────────────────────────────────────────────────
            const badgeEl = firstVisible(
                '[class*="badge"]', '[class*="Badge"]',
                '[class*="tag"]', '[class*="Tag"]',
                '[class*="chip"]', '[class*="Chip"]',
                '[class*="pill"]', '[class*="status-badge"]'
            ) || visualFind(el => {
                // Visual fallback: small, colored, rounded inline element with short text
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                if (r.width < 20 || r.width > 180 || r.height < 14 || r.height > 34) return false;
                if (isTransparent(s.backgroundColor)) return false;
                if (toHex(s.backgroundColor) === canvasBg) return false;
                const radius = parseFloat(s.borderRadius);
                const display = s.display;
                return radius >= 3 &&
                    (display === 'inline-flex' || display === 'inline-block' || display === 'flex') &&
                    (el.textContent || '').trim().length < 25;
            }, 'span,div,a');
            if (badgeEl) {
                const p = read(badgeEl, 'badge');
                set('badgeBg', p.bg, p.source);
                set('badgeForeground', p.color, p.source);
                set('badgeBorderRadius', p.borderRadius, p.source);
                set('badgePaddingTop', p.paddingTop, p.source);
                set('badgePaddingRight', p.paddingRight, p.source);
                set('badgeFontSize', p.fontSize, p.source);
                set('badgeFontWeight', p.fontWeight, p.source);
                set('badgeBorderColor', p.borderColor, p.source);
            }

            // ── 6. Alert / Toast ─────────────────────────────────────────────────────
            const alertEl = firstVisible(
                '[role="alert"]', '[role="status"]',
                '[class*="alert"]', '[class*="Alert"]',
                '[class*="notification"]', '[class*="callout"]', '[class*="banner"]'
            );
            if (alertEl) {
                const p = read(alertEl, 'alert');
                set('alertBg', p.bg, p.source);
                set('alertForeground', p.color, p.source);
                set('alertBorderColor', p.borderColor, p.source);
                set('alertBorderRadius', p.borderRadius, p.source);
                set('alertPaddingTop', p.paddingTop, p.source);
                set('alertPaddingRight', p.paddingRight, p.source);
                set('alertBoxShadow', p.boxShadow, p.source);
            }

            const toastEl = firstVisible(
                '[class*="toast"]', '[class*="Toast"]',
                '[class*="snackbar"]', '[aria-live="polite"]', '[aria-live="assertive"]'
            );
            if (toastEl && toastEl !== alertEl) {
                const p = read(toastEl, 'toast');
                set('toastBg', p.bg, p.source);
                set('toastForeground', p.color, p.source);
                set('toastBorderColor', p.borderColor, p.source);
                set('toastBorderRadius', p.borderRadius, p.source);
                set('toastBoxShadow', p.boxShadow, p.source);
            }

            // ── 7. Dialog / Modal ────────────────────────────────────────────────────
            const dialogEl = firstVisible(
                'dialog', '[role="dialog"]',
                '[class*="modal"]', '[class*="Modal"]',
                '[class*="dialog"]', '[class*="Dialog"]'
            );
            if (dialogEl) {
                const p = read(dialogEl, 'dialog');
                set('dialogBg', p.bg, p.source);
                set('dialogForeground', p.color, p.source);
                set('dialogBorderRadius', p.borderRadius, p.source);
                set('dialogBoxShadow', p.boxShadow, p.source);
                set('dialogPaddingTop', p.paddingTop, p.source);
                set('dialogPaddingRight', p.paddingRight, p.source);
            }

            // ── 8. Popover ───────────────────────────────────────────────────────────
            const popoverEl = firstVisible(
                '[role="menu"]', '[role="listbox"]',
                '[class*="popover"]', '[class*="Popover"]',
                '[class*="dropdown"]', '[class*="Dropdown"]',
                '[class*="menu-content"]', '[class*="MenuContent"]'
            );
            if (popoverEl && popoverEl !== dialogEl) {
                const p = read(popoverEl, 'popover');
                set('popover', p.bg, p.source);
                set('popoverForeground', p.color, p.source);
                set('popoverBorderRadius', p.borderRadius, p.source);
                set('popoverBoxShadow', p.boxShadow, p.source);
                set('popoverBorderColor', p.borderColor, p.source);
            }

            // ── 9. Tooltip ───────────────────────────────────────────────────────────
            const tooltipEl = firstVisible('[role="tooltip"]', '[class*="tooltip"]', '[class*="Tooltip"]');
            if (tooltipEl) {
                const p = read(tooltipEl, 'tooltip');
                set('tooltipBg', p.bg, p.source);
                set('tooltipForeground', p.color, p.source);
                set('tooltipBorderRadius', p.borderRadius, p.source);
                set('tooltipFontSize', p.fontSize, p.source);
                set('tooltipPaddingTop', p.paddingTop, p.source);
                set('tooltipPaddingRight', p.paddingRight, p.source);
                set('tooltipBoxShadow', p.boxShadow, p.source);
            }

            // ── 10. Navigation / Sidebar ─────────────────────────────────────────────
            const sidebarEl = firstVisible(
                'aside[class]', '[class*="sidebar"]', '[class*="Sidebar"]',
                '[class*="sidenav"]', '[class*="side-nav"]',
                '[role="complementary"]'
            ) || visualFind(el => {
                // Visual fallback: tall narrow panel anchored to left or right edge
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                if (r.width < 80 || r.width > 360) return false;
                if (r.height < window.innerHeight * 0.5) return false;
                const isLeft = r.left < 20;
                const isRight = r.right > window.innerWidth - 20;
                if (!isLeft && !isRight) return false;
                const pos = s.position;
                return (pos === 'fixed' || pos === 'sticky' || pos === 'relative' || pos === 'absolute') &&
                    !isTransparent(s.backgroundColor);
            }, 'div,nav,aside');
            if (sidebarEl) {
                const p = read(sidebarEl, 'sidebar');
                set('sidebar', p.bg, p.source);
                set('sidebarForeground', p.color, p.source);
                set('sidebarBorderColor', p.borderColor, p.source);
                set('sidebarWidth', p.width > 0 ? `${p.width}px` : null, p.source);

                const activeItem = sidebarEl.querySelector('[aria-current],[class*="active"],[class*="selected"],[class*="current"]');
                if (activeItem) {
                    const ap = read(activeItem, 'sidebar-active-item');
                    set('sidebarPrimary', ap.bg, ap.source);
                    set('sidebarPrimaryForeground', ap.color, ap.source);
                    set('sidebarItemBorderRadius', ap.borderRadius, ap.source);
                    set('sidebarItemFontWeight', ap.fontWeight, ap.source);
                }
                const inactiveItem = sidebarEl.querySelector('a:not([aria-current]):not([class*="active"]), [class*="nav-item"]:not([aria-current])');
                if (inactiveItem) {
                    const ip = read(inactiveItem, 'sidebar-item');
                    set('sidebarItemForeground', ip.color, ip.source);
                    set('sidebarItemFontSize', ip.fontSize, ip.source);
                    set('sidebarItemPaddingTop', ip.paddingTop, ip.source);
                    set('sidebarItemPaddingRight', ip.paddingRight, ip.source);
                }
            }

            // Header / TopBar
            const headerEl = firstVisible('header', '[class*="header"]', '[class*="Header"]', '[class*="topbar"]', '[class*="navbar"]');
            if (headerEl) {
                const p = read(headerEl, 'header');
                set('headerBg', p.bg, p.source);
                set('headerBorderColor', p.borderColor, p.source);
                set('headerHeight', p.height > 0 ? `${p.height}px` : null, p.source);
                set('headerBoxShadow', p.boxShadow, p.source);
            }

            // ── 11. Tabs ─────────────────────────────────────────────────────────────
            const tablistEl = firstVisible('[role="tablist"]', '[class*="tablist"]', '[class*="tab-list"]', '[class*="TabList"]')
                || visualFind(el => {
                    // Visual fallback: container with 2–8 direct children that are all similarly-sized
                    // inline/flex elements with similar styles — looks like a tab row
                    const children = Array.from(el.children);
                    if (children.length < 2 || children.length > 10) return false;
                    const s = getComputedStyle(el);
                    const display = s.display;
                    if (display !== 'flex' && display !== 'inline-flex') return false;
                    // All children should be roughly the same height
                    const heights = children.map(c => c.getBoundingClientRect().height).filter(h => h > 0);
                    if (heights.length < 2) return false;
                    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
                    return heights.every(h => Math.abs(h - avg) < avg * 0.3) && avg > 24 && avg < 60;
                }, 'div,nav,ul');
            if (tablistEl) {
                const p = read(tablistEl, 'tablist');
                set('tabsBg', p.bg, p.source);
                set('tabsBorderRadius', p.borderRadius, p.source);
                set('tabsPaddingTop', p.paddingTop, p.source);
                set('tabsGap', p.gap, p.source);

                const activeTab = tablistEl.querySelector('[role="tab"][aria-selected="true"],[class*="active"],[class*="selected"]');
                if (activeTab) {
                    const ap = read(activeTab, 'tab-active');
                    set('tabActiveBg', ap.bg, ap.source);
                    set('tabActiveForeground', ap.color, ap.source);
                    set('tabActiveBorderRadius', ap.borderRadius, ap.source);
                    set('tabActiveFontWeight', ap.fontWeight, ap.source);
                }
                const inactiveTab = tablistEl.querySelector('[role="tab"]:not([aria-selected="true"]),[class*="tab"]:not([class*="active"])');
                if (inactiveTab) {
                    const ip = read(inactiveTab, 'tab-inactive');
                    set('tabInactiveForeground', ip.color, ip.source);
                }
            }

            // ── 12. Table ────────────────────────────────────────────────────────────
            const tableEl = firstVisible('table', '[role="table"]', '[class*="table"]', '[class*="Table"]');
            if (tableEl) {
                const p = read(tableEl, 'table');
                set('tableBg', p.bg, p.source);
                set('tableBorderColor', p.borderColor, p.source);

                const th = tableEl.querySelector('th,[role="columnheader"]');
                if (th) {
                    const tp = read(th, 'th');
                    set('tableHeaderBg', tp.bg, tp.source);
                    set('tableHeaderForeground', tp.color, tp.source);
                    set('tableHeaderFontWeight', tp.fontWeight, tp.source);
                    set('tableHeaderFontSize', tp.fontSize, tp.source);
                    set('tableHeaderPaddingTop', tp.paddingTop, tp.source);
                    set('tableHeaderPaddingRight', tp.paddingRight, tp.source);
                }
                const td = tableEl.querySelector('td,[role="cell"]');
                if (td) {
                    const tp = read(td, 'td');
                    set('tableCellForeground', tp.color, tp.source);
                    set('tableCellPaddingTop', tp.paddingTop, tp.source);
                    set('tableCellPaddingRight', tp.paddingRight, tp.source);
                    set('tableCellBorderColor', tp.borderColor, tp.source);
                }
            }

            // ── 13. Avatar ───────────────────────────────────────────────────────────
            const avatarEl = firstVisible('[class*="avatar"]', '[class*="Avatar"]', 'img[class*="profile"]', 'img[class*="user"]')
                || visualFind(el => {
                    // Visual fallback: small square/circle element — typical avatar dimensions + high radius
                    const s = getComputedStyle(el);
                    const r = el.getBoundingClientRect();
                    const sz = Math.min(r.width, r.height);
                    if (sz < 20 || sz > 80) return false;
                    const ratio = r.width / (r.height || 1);
                    if (ratio < 0.75 || ratio > 1.33) return false;
                    const radius = parseFloat(s.borderRadius);
                    return radius >= sz * 0.3;  // at least 30% of size = near-circular
                }, 'div,span,img,figure');
            if (avatarEl) {
                const p = read(avatarEl, 'avatar');
                set('avatarBg', p.bg, p.source);
                set('avatarBorderRadius', p.borderRadius, p.source);
                set('avatarSize', Math.min(p.width, p.height) > 0 ? `${Math.min(p.width, p.height)}px` : null, p.source);
                set('avatarBorderColor', p.borderColor, p.source);
            }

            // ── 14. Progress ─────────────────────────────────────────────────────────
            const progressEl = firstVisible('[role="progressbar"]', 'progress', '[class*="progress"]', '[class*="Progress"]');
            if (progressEl) {
                const p = read(progressEl, 'progress');
                set('progressBg', p.bg, p.source);
                set('progressBorderRadius', p.borderRadius, p.source);
                set('progressHeight', p.height > 0 ? `${p.height}px` : null, p.source);
                const fill = progressEl.querySelector('[class*="fill"],[class*="bar"],[class*="value"],[class*="indicator"],[class*="track"]');
                if (fill) {
                    const fp = read(fill, 'progress-fill');
                    set('progressFillBg', fp.bg, fp.source);
                }
            }

            // ── 15. Separator ────────────────────────────────────────────────────────
            const sepEl = firstVisible('hr', '[role="separator"]', '[class*="separator"]', '[class*="divider"]');
            if (sepEl) {
                const p = read(sepEl, 'separator');
                const sepColor = p.borderColor || p.bg;
                set('separatorColor', sepColor, p.source);
                set('separatorThickness', p.borderWidth || (p.height > 0 ? `${p.height}px` : null), p.source);
            }

            // ── 16. Accordion ────────────────────────────────────────────────────────
            const accordionEl = firstVisible('[class*="accordion"]', '[class*="Accordion"]', 'details');
            if (accordionEl) {
                const p = read(accordionEl, 'accordion');
                set('accordionBorderColor', p.borderColor, p.source);
                set('accordionBg', p.bg, p.source);
                const trigger = accordionEl.querySelector('summary,[class*="trigger"],[class*="header"] button,button');
                if (trigger) {
                    const tp = read(trigger, 'accordion-trigger');
                    set('accordionTriggerForeground', tp.color, tp.source);
                    set('accordionTriggerFontWeight', tp.fontWeight, tp.source);
                    set('accordionTriggerFontSize', tp.fontSize, tp.source);
                    set('accordionTriggerPaddingTop', tp.paddingTop, tp.source);
                    set('accordionTriggerPaddingRight', tp.paddingRight, tp.source);
                }
            }

            // ── 17. Breadcrumb ───────────────────────────────────────────────────────
            const bcEl = firstVisible('[class*="breadcrumb"]', '[aria-label*="breadcrumb" i]', 'nav[aria-label*="breadcrumb" i]');
            if (bcEl) {
                const p = read(bcEl, 'breadcrumb');
                set('breadcrumbForeground', p.color, p.source);
                set('breadcrumbFontSize', p.fontSize, p.source);
                const bcLink = bcEl.querySelector('a');
                if (bcLink) {
                    const lp = read(bcLink, 'breadcrumb-link');
                    set('breadcrumbLinkColor', lp.color, lp.source);
                }
            }

            // ── 18. Pagination ───────────────────────────────────────────────────────
            const pagEl = firstVisible('[class*="pagination"]', '[aria-label*="pagination" i]');
            if (pagEl) {
                const activeItem = pagEl.querySelector('[aria-current="page"],[class*="active"],[class*="current"]');
                if (activeItem) {
                    const ap = read(activeItem, 'pagination-active');
                    set('paginationActiveBg', ap.bg, ap.source);
                    set('paginationActiveForeground', ap.color, ap.source);
                    set('paginationItemBorderRadius', ap.borderRadius, ap.source);
                }
                const item = pagEl.querySelector('a,button,[class*="page-item"]');
                if (item) {
                    const ip = read(item, 'pagination-item');
                    set('paginationItemForeground', ip.color, ip.source);
                    set('paginationItemFontSize', ip.fontSize, ip.source);
                }
            }

            // ── 19. Skeleton ─────────────────────────────────────────────────────────
            const skelEl = firstVisible('[class*="skeleton"]', '[class*="Skeleton"]', '[class*="shimmer"]', '[class*="placeholder"]');
            if (skelEl) {
                const p = read(skelEl, 'skeleton');
                set('skeletonBg', p.bg, p.source);
                set('skeletonBorderRadius', p.borderRadius, p.source);
            }

            // ── 20. Sheet / Drawer ───────────────────────────────────────────────────
            const sheetEl = firstVisible('[class*="sheet"]', '[class*="Sheet"]', '[class*="drawer"]', '[class*="Drawer"]', '[class*="offcanvas"]');
            if (sheetEl) {
                const p = read(sheetEl, 'sheet/drawer');
                set('sheetBg', p.bg, p.source);
                set('sheetForeground', p.color, p.source);
                set('sheetBorderColor', p.borderColor, p.source);
            }

            // ── 21. Muted surface ────────────────────────────────────────────────────
            const mutedEl = firstVisible(
                'code:not(pre code)', 'pre',
                '[class*="muted"]', '[class*="Muted"]',
                '[class*="bg-secondary"]', '[class*="surface-secondary"]',
                '[class*="bg-muted"]', '[class*="secondary-bg"]'
            );
            if (mutedEl) {
                const p = read(mutedEl, 'muted-surface');
                if (p.bg && p.bg !== st.background?.value) {
                    set('muted', p.bg, p.source);
                    set('mutedForeground', p.color, p.source);
                }
            }

            // Small / secondary text → mutedForeground fallback
            const smallEl = firstVisible('small', '[class*="muted-text"]', '[class*="secondary-text"]', '[class*="hint"]', '[class*="helper-text"]', '[class*="caption"]');
            if (smallEl && !st.mutedForeground) {
                const p = read(smallEl, 'small/caption');
                set('mutedForeground', p.color, p.source);
                set('smallFontSize', p.fontSize, p.source);
            }

            // ── 22. Focus ring (from stylesheet) ────────────────────────────────────
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules || []) {
                        if (!rule.selectorText) continue;
                        if (!/:focus-visible|:focus/.test(rule.selectorText)) continue;
                        const oc = rule.style?.outlineColor;
                        const bs = rule.style?.boxShadow;
                        if (oc && oc !== 'initial' && oc !== 'inherit' && oc !== 'currentcolor') {
                            const hex = toHex(oc);
                            if (hex) { set('ring', hex, ':focus-visible outline-color'); break; }
                        }
                        if (bs && bs !== 'none' && !st.ring) {
                            const m = bs.match(/#[0-9a-f]{3,6}|rgba?\([^)]+\)/i);
                            if (m) { const hex = toHex(m[0]); if (hex) set('ring', hex, ':focus box-shadow'); }
                        }
                    }
                } catch (_) {}
                if (st.ring) break;
            }

            // ── 23. Slider ───────────────────────────────────────────────────────────
            const sliderEl = firstVisible('input[type="range"]', '[role="slider"]', '[class*="slider"]', '[class*="Slider"]');
            if (sliderEl) {
                const p = read(sliderEl, 'slider');
                set('sliderTrackBg', p.bg, p.source);
                set('sliderHeight', p.height > 0 ? `${p.height}px` : null, p.source);
            }

            // ── 24. Typography ───────────────────────────────────────────────────────
            for (let i = 1; i <= 4; i++) {
                const hEl = document.querySelector(`h${i}`);
                if (hEl) {
                    const p = read(hEl, `h${i}`);
                    set(`h${i}FontSize`, p.fontSize, `h${i}`);
                    set(`h${i}FontWeight`, p.fontWeight, `h${i}`);
                    set(`h${i}LineHeight`, p.lineHeight, `h${i}`);
                    set(`h${i}LetterSpacing`, p.letterSpacing, `h${i}`);
                    set(`h${i}Color`, p.color, `h${i}`);
                    if (i === 1) {
                        set('headingFontFamily', p.fontFamily, `h${i}`);
                        set('headingTextTransform', p.textTransform, `h${i}`);
                    }
                }
            }
            const bodyPEl = document.querySelector('p, main p, article p');
            if (bodyPEl) {
                const p = read(bodyPEl, 'p');
                set('bodyFontFamily', p.fontFamily, 'p');
                set('bodyFontSize', p.fontSize, 'p');
                set('bodyLineHeight', p.lineHeight, 'p');
                set('bodyFontWeight', p.fontWeight, 'p');
                set('bodyLetterSpacing', p.letterSpacing, 'p');
            }

            return st;
        }

        const semanticTokens = extractSemanticTokens();

        // ─── CSS CUSTOM PROPERTY TOKENS ───────────────────────────────
        // Reads CSS variables from :root and maps them to semantic token keys.
        // Runs after DOM scan — only fills keys the DOM scan didn't find.
        function extractCssVariableTokens() {
            const result = {};
            const cs = getComputedStyle(document.documentElement);

            function setTok(key, value, source) {
                if (value && !result[key]) result[key] = { value, source };
            }

            // Resolve a CSS variable to a hex string by bouncing it through a dummy element
            function resolveColor(varName) {
                const raw = cs.getPropertyValue(varName).trim();
                if (!raw) return null;
                if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw.toUpperCase();
                if (/^rgba?/.test(raw)) return toHex(raw);
                // HSL / OKLCH / named — force browser to resolve via dummy element
                try {
                    const el = document.createElement('div');
                    el.style.cssText = `color:${raw}!important;position:absolute;visibility:hidden`;
                    document.documentElement.appendChild(el);
                    const hex = toHex(getComputedStyle(el).color);
                    el.remove();
                    return hex;
                } catch (_) { return null; }
            }

            function rawVar(varName) {
                return cs.getPropertyValue(varName).trim() || null;
            }

            // ── shadcn/ui ────────────────────────────────────────────
            const shadcnColors = [
                ['primary',                 '--primary'],
                ['primaryForeground',       '--primary-foreground'],
                ['secondary',               '--secondary'],
                ['secondaryForeground',     '--secondary-foreground'],
                ['background',              '--background'],
                ['foreground',              '--foreground'],
                ['card',                    '--card'],
                ['cardForeground',          '--card-foreground'],
                ['popover',                 '--popover'],
                ['popoverForeground',       '--popover-foreground'],
                ['muted',                   '--muted'],
                ['mutedForeground',         '--muted-foreground'],
                ['accent',                  '--accent'],
                ['accentForeground',        '--accent-foreground'],
                ['destructive',             '--destructive'],
                ['destructiveForeground',   '--destructive-foreground'],
                ['border',                  '--border'],
                ['inputBg',                 '--input'],
                ['ring',                    '--ring'],
                ['sidebar',                 '--sidebar'],
                ['sidebarForeground',       '--sidebar-foreground'],
                ['sidebarPrimary',          '--sidebar-primary'],
                ['sidebarPrimaryForeground','--sidebar-primary-foreground'],
                ['toastBg',                 '--toast-background', '--sonner-toast-background'],
            ];
            for (const [key, ...vars] of shadcnColors) {
                for (const v of vars) {
                    const hex = resolveColor(v);
                    if (hex) { setTok(key, hex, `css-var:${v}`); break; }
                }
            }
            // Radius — applied to all radius tokens as shared base
            const radius = rawVar('--radius');
            if (radius) {
                ['primaryBorderRadius','secondaryBorderRadius','inputBorderRadius',
                 'cardBorderRadius','popoverBorderRadius','dialogBorderRadius',
                 'toastBorderRadius','badgeBorderRadius'].forEach(k => setTok(k, radius, 'css-var:--radius'));
            }

            // ── Bootstrap ────────────────────────────────────────────
            const bsColors = [
                ['primary',           '--bs-primary'],
                ['secondary',         '--bs-secondary'],
                ['destructive',       '--bs-danger'],
                ['card',              '--bs-body-bg'],
                ['foreground',        '--bs-body-color'],
                ['border',            '--bs-border-color'],
                ['inputBg',           '--bs-body-bg'],
                ['badgeBackground',   '--bs-primary'],
            ];
            for (const [key, ...vars] of bsColors) {
                for (const v of vars) {
                    const hex = resolveColor(v);
                    if (hex) { setTok(key, hex, `css-var:${v}`); break; }
                }
            }
            const bsRadius = rawVar('--bs-border-radius');
            if (bsRadius) {
                ['primaryBorderRadius','secondaryBorderRadius','inputBorderRadius','cardBorderRadius'].forEach(k => setTok(k, bsRadius, 'css-var:--bs-border-radius'));
            }

            // ── Material UI / MUI ────────────────────────────────────
            const muiColors = [
                ['primary',           '--md-sys-color-primary',     '--mdc-theme-primary'],
                ['primaryForeground', '--md-sys-color-on-primary',  '--mdc-theme-on-primary'],
                ['secondary',         '--md-sys-color-secondary',   '--mdc-theme-secondary'],
                ['destructive',       '--md-sys-color-error',       '--mdc-theme-error'],
                ['background',        '--md-sys-color-background'],
                ['foreground',        '--md-sys-color-on-background'],
                ['card',              '--md-sys-color-surface'],
                ['cardForeground',    '--md-sys-color-on-surface'],
            ];
            for (const [key, ...vars] of muiColors) {
                for (const v of vars) {
                    const hex = resolveColor(v);
                    if (hex) { setTok(key, hex, `css-var:${v}`); break; }
                }
            }

            // ── Tailwind CSS var conventions ─────────────────────────
            const twColors = [
                ['primary',     '--color-primary',     '--tw-color-primary'],
                ['secondary',   '--color-secondary',   '--tw-color-secondary'],
                ['destructive', '--color-destructive', '--color-danger'],
                ['background',  '--color-background'],
                ['foreground',  '--color-foreground'],
                ['border',      '--color-border'],
            ];
            for (const [key, ...vars] of twColors) {
                for (const v of vars) {
                    const hex = resolveColor(v);
                    if (hex) { setTok(key, hex, `css-var:${v}`); break; }
                }
            }

            // ── Universal scan: read ALL --* variables from :root ─────
            // Catches any design system regardless of naming convention
            // (Linear, custom systems, etc.) by inferring meaning from variable name.
            try {
                for (const sheet of document.styleSheets) {
                    let rules;
                    try { rules = sheet.cssRules || sheet.rules; } catch (_) { continue; }
                    if (!rules) continue;
                    for (const rule of rules) {
                        if (rule.type !== 1) continue;
                        const sel = rule.selectorText || '';
                        if (sel !== ':root' && sel !== 'html' && sel !== 'html, body' && sel !== ':root, html') continue;
                        for (let i = 0; i < rule.style.length; i++) {
                            const prop = rule.style[i];
                            if (!prop.startsWith('--')) continue;
                            const name = prop.toLowerCase();
                            const hex = resolveColor(prop);
                            if (!hex) {
                                // Non-color variable (size, radius, etc.)
                                const raw = rawVar(prop);
                                if (!raw) continue;
                                if (/radius/i.test(name)) {
                                    ['primaryBorderRadius','secondaryBorderRadius','inputBorderRadius','cardBorderRadius'].forEach(k => setTok(k, raw, `css-var:${prop}`));
                                }
                                continue;
                            }
                            // Infer semantic token from variable name
                            const n = name.replace(/^--|color[-_]?|[-_]color$|bg[-_]?|[-_]?bg$|[-_]?background$|background[-_]?/gi, '');
                            if      (/\bprimary\b/i.test(name) && !/foreground|text|on-|fg/i.test(name))   setTok('primary', hex, `css-var:${prop}`);
                            else if (/\bprimary[-_](fg|foreground|text|on)/i.test(name) || (/\bprimary\b/i.test(name) && /foreground|text|on-|fg/i.test(name))) setTok('primaryForeground', hex, `css-var:${prop}`);
                            else if (/\bsecondary\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('secondary', hex, `css-var:${prop}`);
                            else if (/\b(danger|error|destructive)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('destructive', hex, `css-var:${prop}`);
                            else if (/\b(bg|background|canvas|surface|page)\b/i.test(name) && !/card|modal|dialog|popover|tooltip|sidebar|header|nav|muted|secondary/i.test(name)) setTok('background', hex, `css-var:${prop}`);
                            else if (/\b(fg|foreground|text|body-color)\b/i.test(name) && !/placeholder|muted|secondary|link|accent/i.test(name)) setTok('foreground', hex, `css-var:${prop}`);
                            else if (/\b(card|surface|elevated)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('card', hex, `css-var:${prop}`);
                            else if (/\b(border|outline|divider|separator)\b/i.test(name)) setTok('border', hex, `css-var:${prop}`);
                            else if (/\b(muted|subtle|secondary-bg)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('muted', hex, `css-var:${prop}`);
                            else if (/\b(accent|highlight|link)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('accent', hex, `css-var:${prop}`);
                            else if (/\b(input|field|form)\b/i.test(name) && !/border|ring|shadow/i.test(name)) setTok('inputBg', hex, `css-var:${prop}`);
                            else if (/\b(sidebar|sidenav|side-nav)\b/i.test(name) && !/foreground|text|on-|fg|item|link/i.test(name)) setTok('sidebar', hex, `css-var:${prop}`);
                            else if (/\b(popover|dropdown|menu-bg|context)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('popover', hex, `css-var:${prop}`);
                            else if (/\b(toast|snackbar|notification)\b/i.test(name) && !/foreground|text|on-|fg/i.test(name)) setTok('toastBg', hex, `css-var:${prop}`);
                        }
                    }
                }
            } catch (_) {}

            return result;
        }

        // ─── STYLESHEET RULE TOKENS ───────────────────────────────────
        // Scans accessible CSS rules for component class patterns.
        // Used as the lowest-priority fallback — fills gaps not covered by
        // DOM scan or CSS variables (e.g. Avatar when no <img> is on page).
        function extractStylesheetTokens() {
            const result = {};

            function setTok(key, value, source) {
                if (!value || value === 'none' || value === 'transparent' ||
                    value === 'rgba(0, 0, 0, 0)' || value === '0px' ||
                    value === 'auto' || value === 'normal' || result[key]) return;
                result[key] = { value, source };
            }

            function colVal(raw) {
                if (!raw || raw === 'transparent' || raw === 'initial' || raw === 'inherit') return null;
                return toHex(raw) || (/^#/.test(raw) ? raw : null);
            }
            function szVal(raw) {
                if (!raw || raw === 'auto' || raw === '0px' || raw === 'none' || raw === 'normal') return null;
                return raw;
            }

            // Yield all style rules from a sheet, descending into @media/@supports
            function* allRules(sheet) {
                let rules;
                try { rules = sheet.cssRules || sheet.rules; } catch (_) { return; }
                if (!rules) return;
                for (const rule of rules) {
                    if (rule.type === 1) { yield rule; }
                    else if (rule.cssRules) {
                        for (const inner of rule.cssRules) {
                            if (inner.type === 1) yield inner;
                        }
                    }
                }
            }

            // [selectorPattern, handler(style, selectorText)]
            const patterns = [
                // ── Primary Button ────────────────────────────────────
                [/\.(btn-primary|button-primary|btn--primary|primary-btn)\b/i, (s, sel) => {
                    setTok('primary',             colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('primaryForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('primaryBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('primaryBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('primaryBorderWidth',  szVal(s.borderTopWidth),   `sheet:${sel}`);
                    setTok('primaryFontSize',     szVal(s.fontSize),         `sheet:${sel}`);
                    setTok('primaryFontWeight',   szVal(s.fontWeight),       `sheet:${sel}`);
                    setTok('primaryPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('primaryPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Secondary Button ──────────────────────────────────
                [/\.(btn-secondary|button-secondary|btn--secondary|secondary-btn)\b/i, (s, sel) => {
                    setTok('secondary',             colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('secondaryForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('secondaryBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('secondaryBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('secondaryBorderWidth',  szVal(s.borderTopWidth),   `sheet:${sel}`);
                    setTok('secondaryPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('secondaryPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Destructive / Danger Button ───────────────────────
                [/\.(btn-danger|btn-destructive|button-danger|button--danger)\b/i, (s, sel) => {
                    setTok('destructive',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('destructiveForeground', colVal(s.color),           `sheet:${sel}`);
                    setTok('destructiveBorderRadius', szVal(s.borderRadius),   `sheet:${sel}`);
                    setTok('destructivePaddingTop', szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('destructivePaddingRight', szVal(s.paddingRight),   `sheet:${sel}`);
                }],
                // ── Generic button (border-radius / font fallback) ────
                [/^\.btn\b|^\.button\b/i, (s, sel) => {
                    setTok('primaryBorderRadius', szVal(s.borderRadius), `sheet:${sel}`);
                    setTok('primaryFontSize',     szVal(s.fontSize),     `sheet:${sel}`);
                    setTok('primaryPaddingTop',   szVal(s.paddingTop),   `sheet:${sel}`);
                    setTok('primaryPaddingRight', szVal(s.paddingRight), `sheet:${sel}`);
                }],
                // ── Avatar ────────────────────────────────────────────
                [/\.(avatar|Avatar|user-avatar|profile-pic|profile-avatar)\b/i, (s, sel) => {
                    setTok('avatarBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('avatarBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('avatarBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    const w = parseInt(s.width) || 0, h = parseInt(s.height) || 0;
                    if (w > 0 && w === h) setTok('avatarSize', `${w}px`, `sheet:${sel}`);
                }],
                // ── Badge / Tag / Chip ────────────────────────────────
                [/\.(badge|Badge|tag|Tag|chip|Chip|pill)\b/i, (s, sel) => {
                    setTok('badgeBackground',   colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('badgeForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('badgeBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('badgeFontSize',     szVal(s.fontSize),         `sheet:${sel}`);
                    setTok('badgeFontWeight',   szVal(s.fontWeight),       `sheet:${sel}`);
                    setTok('badgePaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('badgePaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Card / Surface ────────────────────────────────────
                [/\.(card|Card|surface|panel|tile)\b(?!-header|-body|-footer|-title|-text)/i, (s, sel) => {
                    setTok('card',             colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('cardForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('cardBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('cardBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('cardBorderWidth',  szVal(s.borderTopWidth),   `sheet:${sel}`);
                    setTok('cardBoxShadow',    szVal(s.boxShadow),        `sheet:${sel}`);
                    setTok('cardPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('cardPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Input / Form Control ──────────────────────────────
                [/\.(input|Input|form-control|text-input|text-field|input-field)\b/i, (s, sel) => {
                    setTok('inputBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('border',            colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('inputBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('inputBorderWidth',  szVal(s.borderTopWidth),   `sheet:${sel}`);
                    setTok('inputFontSize',     szVal(s.fontSize),         `sheet:${sel}`);
                    setTok('inputPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('inputPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                    const h = szVal(s.height) || szVal(s.minHeight);
                    setTok('inputHeight', h, `sheet:${sel}`);
                }],
                // ── Popover / Dropdown ────────────────────────────────
                [/\.(popover|Popover|dropdown-menu|DropdownMenu|context-menu|floating-panel)\b/i, (s, sel) => {
                    setTok('popover',             colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('popoverForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('popoverBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('popoverBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('popoverBoxShadow',    szVal(s.boxShadow),        `sheet:${sel}`);
                }],
                // ── Alert ─────────────────────────────────────────────
                [/\.(alert|Alert|notification|Notification)\b(?!-dismiss|-close|-icon)/i, (s, sel) => {
                    setTok('alertBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('alertForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('alertBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('alertBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('alertPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('alertPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Toast / Snackbar ──────────────────────────────────
                [/\.(toast|Toast|snackbar|Snackbar)\b(?!-close|-action)/i, (s, sel) => {
                    setTok('toastBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('toastForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('toastBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('toastBorderColor',  colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('toastBoxShadow',    szVal(s.boxShadow),        `sheet:${sel}`);
                    setTok('toastPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('toastPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Dialog / Modal ────────────────────────────────────
                [/\.(dialog|Dialog|modal|Modal|modal-content|dialog-content|DialogContent)\b/i, (s, sel) => {
                    setTok('dialogBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('dialogForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('dialogBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('dialogBoxShadow',    szVal(s.boxShadow),        `sheet:${sel}`);
                    setTok('dialogPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('dialogPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Drawer / Sheet ────────────────────────────────────
                [/\.(drawer|Drawer|sheet|Sheet|side-panel|offcanvas)\b/i, (s, sel) => {
                    setTok('sheetBg',         colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('sheetForeground', colVal(s.color),           `sheet:${sel}`);
                    setTok('sheetBorderColor',colVal(s.borderColor),     `sheet:${sel}`);
                }],
                // ── Accordion ─────────────────────────────────────────
                [/\.(accordion|Accordion|accordion-item|AccordionItem)\b/i, (s, sel) => {
                    setTok('accordionBg',                  colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('accordionBorderColor',         colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('accordionTriggerForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('accordionTriggerFontSize',     szVal(s.fontSize),         `sheet:${sel}`);
                    setTok('accordionTriggerPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                    setTok('accordionTriggerPaddingRight', szVal(s.paddingRight),     `sheet:${sel}`);
                }],
                // ── Switch / Toggle ───────────────────────────────────
                [/\.(switch|Switch|toggle|Toggle|switch-track|toggle-track)\b/i, (s, sel) => {
                    setTok('switchBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('switchBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('switchWidth',        szVal(s.width),            `sheet:${sel}`);
                    setTok('switchHeight',       szVal(s.height),           `sheet:${sel}`);
                }],
                // ── Tabs list ─────────────────────────────────────────
                [/\.(tabs|Tabs|tab-list|TabsList|nav-tabs)\b/i, (s, sel) => {
                    setTok('tabsBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('tabsBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('tabsPaddingTop',   szVal(s.paddingTop),       `sheet:${sel}`);
                }],
                // ── Active tab ────────────────────────────────────────
                [/\.(tab--active|tab-active|active-tab|TabsTrigger\[data-state)/i, (s, sel) => {
                    setTok('tabActiveBg',           colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('tabActiveForeground',   colVal(s.color),           `sheet:${sel}`);
                    setTok('tabActiveBorderRadius', szVal(s.borderRadius),     `sheet:${sel}`);
                    setTok('tabActiveFontWeight',   szVal(s.fontWeight),       `sheet:${sel}`);
                }],
                // ── Sidebar / Side nav ────────────────────────────────
                [/\.(sidebar|Sidebar|side-nav|sidenav|side-menu)\b/i, (s, sel) => {
                    setTok('sidebar',            colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('sidebarForeground',  colVal(s.color),           `sheet:${sel}`);
                    setTok('sidebarBorderColor', colVal(s.borderColor),     `sheet:${sel}`);
                    setTok('sidebarWidth',       szVal(s.width),            `sheet:${sel}`);
                }],
                // ── Checkbox ──────────────────────────────────────────
                [/\.(checkbox|Checkbox|check-box|CheckBox)\b/i, (s, sel) => {
                    setTok('checkboxBorderColor',  colVal(s.borderColor), `sheet:${sel}`);
                    setTok('checkboxBorderRadius', szVal(s.borderRadius), `sheet:${sel}`);
                    const w = parseInt(s.width) || 0, h = parseInt(s.height) || 0;
                    const sz = Math.min(w, h);
                    if (sz > 0) setTok('checkboxSize', `${sz}px`, `sheet:${sel}`);
                }],
                // ── Table ─────────────────────────────────────────────
                [/\.(table|Table|data-table|DataTable)\b/i, (s, sel) => {
                    setTok('tableBg',          colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('tableBorderColor', colVal(s.borderColor),     `sheet:${sel}`);
                }],
                [/\.(table-header|TableHeader|thead|table th)\b/i, (s, sel) => {
                    setTok('tableHeaderBg',         colVal(s.backgroundColor), `sheet:${sel}`);
                    setTok('tableHeaderForeground', colVal(s.color),           `sheet:${sel}`);
                    setTok('tableHeaderFontWeight', szVal(s.fontWeight),       `sheet:${sel}`);
                    setTok('tableHeaderFontSize',   szVal(s.fontSize),         `sheet:${sel}`);
                    setTok('tableHeaderPaddingTop', szVal(s.paddingTop),       `sheet:${sel}`);
                }],
            ];

            let ruleCount = 0;
            const MAX_RULES = 6000;

            outer:
            for (const sheet of document.styleSheets) {
                for (const rule of allRules(sheet)) {
                    if (++ruleCount > MAX_RULES) break outer;
                    const sel = rule.selectorText;
                    if (!sel) continue;
                    for (const [pat, handler] of patterns) {
                        if (pat.test(sel)) handler(rule.style, sel);
                    }
                }
            }

            return result;
        }

        // Merge CSS variable tokens (lower priority than DOM scan)
        const cssVarTokens = extractCssVariableTokens();
        for (const [key, val] of Object.entries(cssVarTokens)) {
            if (!semanticTokens[key]) semanticTokens[key] = val;
        }

        // Merge stylesheet rule tokens (sync class-pattern scan — works for named classes)
        const sheetTokens = extractStylesheetTokens();
        for (const [key, val] of Object.entries(sheetTokens)) {
            if (!semanticTokens[key]) semanticTokens[key] = val;
        }

        // ─── DEEP STYLESHEET SCAN ────────────────────────────────────────────────
        // Fetches actual CSS source, correlates classes with known DOM elements,
        // and infers component types from property profiles.
        // Works for CSS modules, Tailwind, CSS-in-JS — anything with actual CSS rules.
        async function deepScanStylesheets() {
            const deep = {};

            // Keys that represent background/surface colors — #000000 is almost always
            // a browser-resolved default (unset color inherits black), not a real design token.
            const _bgKeys = new Set(['primary','secondary','card','inputBg','popover','dialog',
                'sidebar','muted','accent','destructive','toastBg','alertBg','dialogBg',
                'sheetBg','tooltipBg','tabsBg','tabActiveBg','tableHeaderBg','tableBg',
                'headerBg','badgeBackground','avatarBg','switchBg','accordionBg']);

            function setD(key, value, source) {
                if (!value || value === 'none' || value === 'transparent' ||
                    value === 'rgba(0, 0, 0, 0)' || value === '0px' ||
                    value === 'auto' || value === 'normal' || value === 'initial' ||
                    value === 'inherit' || deep[key] || semanticTokens[key]) return;
                // Reject pure black (#000000) as a background/surface token — it is
                // almost always a browser default rather than a real design decision.
                if ((value.toUpperCase() === '#000000') &&
                    (_bgKeys.has(key) || key.endsWith('Bg') || key.endsWith('Background') || key.endsWith('Surface'))) return;
                deep[key] = { value, source };
            }

            // ── 1. Collect all CSS text (inline + fetched cross-origin) ──────────
            const cssBlocks = []; // [{ text, url }]
            let totalBytes = 0;
            const BYTE_CAP = 4_000_000; // 4MB total

            for (const sheet of document.styleSheets) {
                if (totalBytes >= BYTE_CAP) break;
                // Same-origin: serialize accessible rules
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (rules && rules.length > 0) {
                        const lines = [];
                        for (const r of rules) { if (r.cssText) lines.push(r.cssText); }
                        const text = lines.join('\n');
                        cssBlocks.push({ text, url: sheet.href || 'inline' });
                        totalBytes += text.length;
                        continue;
                    }
                } catch (_) {}
                // Cross-origin: try fetch (many CDNs allow CORS)
                if (sheet.href && totalBytes < BYTE_CAP) {
                    try {
                        const res = await fetch(sheet.href, { cache: 'force-cache' });
                        if (res.ok) {
                            const text = await res.text();
                            cssBlocks.push({ text, url: sheet.href });
                            totalBytes += text.length;
                        }
                    } catch (_) {}
                }
            }
            if (cssBlocks.length === 0) return deep;

            // ── 2. Build class → component role map from DOM elements ────────────
            // For elements we CAN identify (they have semantic tags / ARIA roles),
            // record every CSS class they use → that class is "button", "input" etc.
            const classRole = {};
            function mapClasses(selector, role) {
                try {
                    document.querySelectorAll(selector).forEach(el => {
                        if (el.closest('#plukrr-sidebar,#plukrr-picker,#dc-overlay,#plukrr-ds-builder-panel')) return;
                        el.classList.forEach(cls => { if (!classRole[cls]) classRole[cls] = role; });
                    });
                } catch (_) {}
            }
            mapClasses('button, [role="button"], input[type="submit"], input[type="button"]', 'button');
            mapClasses('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])', 'input');
            mapClasses('textarea',                                              'input');
            mapClasses('[role="checkbox"], input[type="checkbox"]',             'checkbox');
            mapClasses('[role="switch"]',                                       'switch');
            mapClasses('[role="tab"]',                                          'tab');
            mapClasses('[role="tablist"]',                                      'tablist');
            mapClasses('[role="menu"], [role="listbox"], [role="combobox"]',    'popover');
            mapClasses('[role="dialog"], [role="alertdialog"]',                 'dialog');
            mapClasses('[role="tooltip"]',                                      'tooltip');
            mapClasses('[role="alert"], [role="status"]',                       'alert');
            mapClasses('aside, [role="complementary"]',                         'sidebar');
            mapClasses('header, [role="banner"]',                               'header');
            mapClasses('table, [role="table"], [role="grid"]',                  'table');
            mapClasses('[role="progressbar"], progress',                        'progress');
            mapClasses('[role="radio"], input[type="radio"]',                   'radio');
            mapClasses('[role="slider"], input[type="range"]',                  'slider');

            // ── 3. Parse CSS: yields { selectors[], decls{} } for every rule ─────
            function* parseCssRules(text) {
                const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
                // Two-pass: top-level rules, then rules inside @media/@supports blocks
                function* extractRules(src) {
                    const re = /([^@{}][^{}]*?)\{([^{}]*)\}/g;
                    let m;
                    while ((m = re.exec(src)) !== null) {
                        const selectors = m[1].trim().split(',').map(s => s.trim()).filter(s => s && !s.startsWith('@'));
                        if (selectors.length === 0) continue;
                        const decls = {};
                        for (const part of m[2].split(';')) {
                            const ci = part.indexOf(':');
                            if (ci < 1) continue;
                            const prop = part.slice(0, ci).trim().toLowerCase();
                            const val  = part.slice(ci + 1).trim().replace(/\s*!important\s*$/, '');
                            if (prop && val) decls[prop] = val;
                        }
                        if (Object.keys(decls).length > 0) yield { selectors, decls };
                    }
                }
                yield* extractRules(clean);
                // Also extract rules nested inside @media / @supports / @layer
                const atBlocks = clean.match(/@[^{]+\{([\s\S]*?)\}\s*\}/g) || [];
                for (const block of atBlocks) {
                    const inner = block.replace(/^[^{]+\{/, '').replace(/\}\s*$/, '');
                    yield* extractRules(inner);
                }
            }

            // ── 4. Value helpers ──────────────────────────────────────────────────
            function resolveVal(val) {
                if (!val) return null;
                val = val.trim();
                if (val.startsWith('var(')) {
                    const vn = (val.match(/var\(\s*(--[^,)]+)/) || [])[1];
                    if (vn) {
                        const resolved = getComputedStyle(document.documentElement).getPropertyValue(vn).trim();
                        return resolved || null;
                    }
                    return null;
                }
                return val;
            }
            function hex(val) {
                const r = resolveVal(val);
                if (!r) return null;
                if (/^#[0-9a-fA-F]{3,8}$/.test(r)) return r.toUpperCase();
                if (/^rgba?/.test(r)) return toHex(r);
                // Try resolving through dummy element for HSL/oklch
                try {
                    const el = document.createElement('div');
                    el.style.cssText = `color:${r}!important;position:absolute;visibility:hidden`;
                    document.documentElement.appendChild(el);
                    const h = toHex(getComputedStyle(el).color);
                    el.remove();
                    return h;
                } catch (_) { return null; }
            }
            function sz(val) {
                const r = resolveVal(val);
                if (!r || r === 'auto' || r === 'none' || r === '0px' || r === 'normal') return null;
                return r;
            }
            function getBorderColor(decls) {
                // border shorthand: "1px solid #ccc"
                const b = resolveVal(decls['border'] || decls['border-top'] || '');
                if (b) {
                    const parts = b.split(/\s+/);
                    for (const p of parts) {
                        const h = hex(p);
                        if (h) return h;
                    }
                }
                return hex(decls['border-color'] || decls['border-top-color'] || '');
            }
            function getBorderWidth(decls) {
                const bw = sz(decls['border-width'] || decls['border-top-width'] || '');
                if (bw) return bw;
                const b = resolveVal(decls['border'] || '');
                if (b) {
                    const m = b.match(/\b(\d+px)\b/);
                    return m ? m[1] : null;
                }
                return null;
            }

            // ── 5. Apply extracted properties to semantic tokens by role ──────────
            function applyProps(role, decls, source) {
                const bg     = hex(decls['background-color'] || decls['background']);
                const fg     = hex(decls['color']);
                const br     = sz(decls['border-radius']);
                const shadow = (() => { const v = resolveVal(decls['box-shadow']); return v && v !== 'none' ? v : null; })();
                const bc     = getBorderColor(decls);
                const bw     = getBorderWidth(decls);
                const fs     = sz(decls['font-size']);
                const fw     = sz(decls['font-weight']);
                const pt     = sz(decls['padding-top']);
                const pr     = sz(decls['padding-right']);
                const h      = sz(decls['height'] || decls['min-height']);
                const w      = sz(decls['width']);

                switch (role) {
                    case 'button':
                        setD('primary',             bg,     source);
                        setD('primaryForeground',   fg,     source);
                        setD('primaryBorderRadius', br,     source);
                        setD('primaryBorderColor',  bc,     source);
                        setD('primaryBorderWidth',  bw,     source);
                        setD('primaryFontSize',     fs,     source);
                        setD('primaryFontWeight',   fw,     source);
                        setD('primaryPaddingTop',   pt,     source);
                        setD('primaryPaddingRight', pr,     source);
                        setD('primaryHeight',       h,      source);
                        setD('primaryBoxShadow',    shadow, source);
                        break;
                    case 'input':
                        setD('inputBg',           bg, source);
                        setD('border',            bc, source);
                        setD('inputBorderRadius', br, source);
                        setD('inputBorderWidth',  bw, source);
                        setD('inputFontSize',     fs, source);
                        setD('inputPaddingTop',   pt, source);
                        setD('inputPaddingRight', pr, source);
                        setD('inputHeight',       h,  source);
                        break;
                    case 'card':
                        setD('card',             bg,     source);
                        setD('cardForeground',   fg,     source);
                        setD('cardBorderRadius', br,     source);
                        setD('cardBorderColor',  bc,     source);
                        setD('cardBorderWidth',  bw,     source);
                        setD('cardBoxShadow',    shadow, source);
                        setD('cardPaddingTop',   pt,     source);
                        setD('cardPaddingRight', pr,     source);
                        break;
                    case 'badge':
                        setD('badgeBackground',   bg, source);
                        setD('badgeForeground',   fg, source);
                        setD('badgeBorderRadius', br, source);
                        setD('badgeFontSize',     fs, source);
                        setD('badgeFontWeight',   fw, source);
                        setD('badgePaddingTop',   pt, source);
                        setD('badgePaddingRight', pr, source);
                        break;
                    case 'dialog':
                        setD('dialogBg',           bg,     source);
                        setD('dialogForeground',   fg,     source);
                        setD('dialogBorderRadius', br,     source);
                        setD('dialogBoxShadow',    shadow, source);
                        setD('dialogPaddingTop',   pt,     source);
                        setD('dialogPaddingRight', pr,     source);
                        break;
                    case 'popover':
                        setD('popover',             bg,     source);
                        setD('popoverForeground',   fg,     source);
                        setD('popoverBorderRadius', br,     source);
                        setD('popoverBoxShadow',    shadow, source);
                        setD('popoverBorderColor',  bc,     source);
                        break;
                    case 'sidebar':
                        setD('sidebar',            bg, source);
                        setD('sidebarForeground',  fg, source);
                        setD('sidebarBorderColor', bc, source);
                        setD('sidebarWidth',       w,  source);
                        break;
                    case 'header':
                        setD('headerBg',          bg,     source);
                        setD('headerBorderColor', bc,     source);
                        setD('headerBoxShadow',   shadow, source);
                        setD('headerHeight',      h,      source);
                        break;
                    case 'tablist':
                        setD('tabsBg',           bg, source);
                        setD('tabsBorderRadius', br, source);
                        setD('tabsPaddingTop',   pt, source);
                        break;
                    case 'tab':
                        setD('tabActiveBg',           bg, source);
                        setD('tabActiveForeground',   fg, source);
                        setD('tabActiveBorderRadius', br, source);
                        setD('tabActiveFontWeight',   fw, source);
                        break;
                    case 'alert':
                        setD('alertBg',           bg, source);
                        setD('alertForeground',   fg, source);
                        setD('alertBorderColor',  bc, source);
                        setD('alertBorderRadius', br, source);
                        setD('alertPaddingTop',   pt, source);
                        setD('alertPaddingRight', pr, source);
                        break;
                    case 'toast':
                        setD('toastBg',           bg,     source);
                        setD('toastForeground',   fg,     source);
                        setD('toastBorderRadius', br,     source);
                        setD('toastBorderColor',  bc,     source);
                        setD('toastBoxShadow',    shadow, source);
                        setD('toastPaddingTop',   pt,     source);
                        setD('toastPaddingRight', pr,     source);
                        break;
                    case 'tooltip':
                        setD('tooltipBg',           bg, source);
                        setD('tooltipForeground',   fg, source);
                        setD('tooltipBorderRadius', br, source);
                        setD('tooltipFontSize',     fs, source);
                        setD('tooltipPaddingTop',   pt, source);
                        setD('tooltipPaddingRight', pr, source);
                        break;
                    case 'avatar':
                        setD('avatarBg',           bg, source);
                        setD('avatarBorderRadius', br, source);
                        setD('avatarSize',         w || h, source);
                        setD('avatarBorderColor',  bc, source);
                        break;
                    case 'switch':
                        setD('switchBg',           bg, source);
                        setD('switchBorderRadius', br, source);
                        setD('switchWidth',        w,  source);
                        setD('switchHeight',       h,  source);
                        break;
                    case 'checkbox':
                        setD('checkboxBorderColor',  bc, source);
                        setD('checkboxBorderRadius', br, source);
                        break;
                }
            }

            // ── 6. Property-profile inference for elements not in DOM ─────────────
            function inferRole(decls) {
                const bg       = resolveVal(decls['background-color'] || decls['background'] || '');
                const br       = parseFloat(resolveVal(decls['border-radius']) || '0');
                const bs       = resolveVal(decls['box-shadow'] || '') || 'none';
                const position = resolveVal(decls['position'] || '') || '';
                const zIdx     = parseInt(resolveVal(decls['z-index'] || '') || '0', 10);
                const cursor   = resolveVal(decls['cursor'] || '') || '';
                const display  = resolveVal(decls['display'] || '') || '';
                const width    = resolveVal(decls['width']  || '') || '';
                const height   = resolveVal(decls['height'] || '') || '';
                const pt       = parseFloat(resolveVal(decls['padding-top']   || '') || '0');
                const pr       = parseFloat(resolveVal(decls['padding-right'] || '') || '0');
                const fs       = parseFloat(resolveVal(decls['font-size']     || '') || '0');
                const hasBg    = bg && bg !== 'transparent' && !bg.includes('none') && bg !== 'inherit';
                const hasBorder = !!(decls['border'] || decls['border-color'] || decls['border-top-width']);
                const hasShadow = bs !== 'none' && !!bs;
                const wPx = parseFloat(width);
                const hPx = parseFloat(height);

                // Avatar: square pixel dimensions + circular radius
                if (width.endsWith('px') && height.endsWith('px') && wPx >= 16 && wPx <= 96 &&
                    Math.abs(wPx - hPx) < 4 && br >= wPx * 0.3) return 'avatar';

                // Badge/Pill: high radius + small + colored + inline-ish
                if (br >= 9 && hasBg && pt >= 1 && pt <= 8 && pr >= 4 && pr <= 20) return 'badge';
                if (br >= 9 && hasBg && hPx > 0 && hPx <= 32) return 'badge';

                // Toast: fixed + bottom + z-index
                if (position === 'fixed' && zIdx >= 50 && hasBg && decls['bottom']) return 'toast';

                // Dialog/Modal: fixed + high z-index + background (no bottom anchor)
                if (position === 'fixed' && zIdx >= 50 && hasBg && !decls['bottom']) return 'dialog';

                // Card: has background + (shadow or border) + radius >= 4
                if (hasBg && (hasShadow || hasBorder) && br >= 4 && !cursor.includes('pointer')) return 'card';

                return null;
            }

            // ── 7. Process all collected CSS text ─────────────────────────────────
            let ruleCount = 0;
            const RULE_CAP = 30_000;

            for (const { text, url } of cssBlocks) {
                for (const { selectors, decls } of parseCssRules(text)) {
                    if (++ruleCount > RULE_CAP) break;

                    for (const sel of selectors) {
                        // Strategy A: class-role correlation (high confidence)
                        const classes = (sel.match(/\.(-?[a-zA-Z_][a-zA-Z0-9_-]*)/g) || []).map(c => c.slice(1));
                        let role = null;
                        for (const cls of classes) {
                            if (classRole[cls]) { role = classRole[cls]; break; }
                        }

                        if (role) {
                            applyProps(role, decls, `deep:${url}→${sel}`);
                            continue;
                        }

                        // Strategy B: property-profile inference (fills gaps for off-page components)
                        const inferred = inferRole(decls);
                        if (inferred) applyProps(inferred, decls, `profile:${url}→${sel}`);
                    }
                }
                if (ruleCount >= RULE_CAP) break;
            }

            return deep;
        }

        // Run deep scan and merge at lowest priority
        try {
            const deepTokens = await deepScanStylesheets();
            for (const [key, val] of Object.entries(deepTokens)) {
                if (!semanticTokens[key]) semanticTokens[key] = val;
            }
        } catch (_) {}

        // ─── UI component presence (detector-based; drives design-system §4 output) ───
        function detectPageComponents() {
            const ign = '#plukrr-sidebar, #plukrr-picker, #dc-overlay';
            function skip(el) { return el && el.closest(ign); }
            function q(sel) {
                try {
                    return [...document.querySelectorAll(sel)].filter(el => el && !skip(el));
                } catch (_) { return []; }
            }
            function px(n) { return parseFloat(n) || 0; }

            const details = {
                inputTextField: false,
                inputTextarea: false
            };

            const hasButton = q('button, [role="button"], a.btn, a[class*="button"]').length > 0;
            const inputs = q('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
            const textareas = q('textarea');
            details.inputTextField = inputs.length > 0;
            details.inputTextarea = textareas.length > 0;
            const hasInput = details.inputTextField || details.inputTextarea;

            let hasCard = false;
            let ci = 0;
            for (const el of document.querySelectorAll('div, section, article, main')) {
                if (++ci > 450) break;
                if (skip(el)) continue;
                const s = getComputedStyle(el);
                const pad = Math.max(px(s.paddingTop), px(s.paddingLeft));
                const hasShadow = s.boxShadow && s.boxShadow !== 'none';
                const hasBorder = px(s.borderTopWidth) > 0 || px(s.borderLeftWidth) > 0;
                const txt = (el.textContent || '').trim();
                if (pad >= 12 && txt.length >= 8 && (hasShadow || hasBorder)) {
                    hasCard = true;
                    break;
                }
            }

            const hasNavigation = q('nav, [role="navigation"], header nav, header [role="navigation"]').length > 0
                || (q('header a[href]').length >= 2);

            const hasLink = q('a[href]').filter(el => {
                const r = el.getAttribute('role');
                if (r === 'button' || r === 'tab') return false;
                return !/btn|button/i.test(el.className?.toString?.() || '');
            }).length > 0;

            const hasBadge = q('[class*="badge"], [class*="Badge"], [data-badge], [class*="chip"], [class*="Chip"]').length > 0;
            const hasAvatar = q('[class*="avatar"], [class*="Avatar"], [data-avatar], img[class*="rounded-full"]').length > 0;

            const hasDialog = q('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog, .modal, [class*="modal"], [class*="Modal"], [class*="Dialog"], [class*="dialog"]').length > 0;

            const hasAccordion = q(
                '[class*="accordion"], [class*="Accordion"], [data-radix-accordion], [data-radix-collapsible], details, summary, ' +
                '[data-state][data-orientation], section[id*="faq"], section[class*="faq"], [id*="accordion"]'
            ).length > 0;

            const hasTable = q('table, [role="table"], [role="grid"]').length > 0;

            let hasToast = q('.toast, [class*="toast"], .snackbar, [class*="snackbar"], [data-sonner-toast]').length > 0;
            if (!hasToast) {
                for (const el of q('[role="status"], [role="alert"]')) {
                    const s = getComputedStyle(el);
                    if (s.position === 'fixed' || s.position === 'sticky') { hasToast = true; break; }
                }
            }

            const hasSwitch = q('[role="switch"]').length > 0;
            const hasCheckbox = q('input[type="checkbox"], [role="checkbox"]').length > 0;
            const hasRadio = q('input[type="radio"], [role="radio"]').length > 0;
            const hasTabs = q('[role="tablist"], [role="tab"]').length > 0;
            const hasTooltip = q('[role="tooltip"], .tooltip, [class*="tooltip"], [class*="Tooltip"]').length > 0;

            const hasDrawer = q('[data-vaul-drawer], [class*="drawer"], [class*="Drawer"], [data-drawer], [class*="sheet"][class*="side"]').length > 0;

            let hasSidebar = q('aside[class*="sidebar"], [class*="Sidebar"], nav[class*="sidebar"]').length > 0;
            if (!hasSidebar) {
                for (const nav of q('aside, nav')) {
                    const s = getComputedStyle(nav);
                    const r = nav.getBoundingClientRect();
                    const flexCol = (s.flexDirection === 'column' || s.display === 'flex' && s.flexDirection !== 'row');
                    if (r.width > 0 && r.width < 320 && r.height > 400 && flexCol) { hasSidebar = true; break; }
                }
            }

            const hasPopover = q('[data-radix-popover-content], [data-state][class*="Popover"], [role="dialog"][class*="popover"]').length > 0;
            const hasDropdown = q('[role="menu"], [data-radix-dropdown-menu-content], [role="listbox"]').length > 0;
            const hasSelect = q('select, [role="combobox"]').length > 0;

            const hasAlert = q('[role="alert"]:not([class*="toast"]):not(.toast)').length > 0;
            const hasContextMenu = q('[role="menu"][id]').length > 0;

            const detectedIds = [];
            const push = (id, cond) => { if (cond) detectedIds.push(id); };

            push('button', hasButton);
            push('input', hasInput);
            push('card', hasCard);
            push('navigation', hasNavigation);
            push('link', hasLink);
            push('badge', hasBadge);
            push('avatar', hasAvatar);
            push('dialog', hasDialog);
            push('accordion', hasAccordion);
            push('table', hasTable);
            push('toast', hasToast);
            push('switch', hasSwitch);
            push('checkbox', hasCheckbox);
            push('radio', hasRadio);
            push('tabs', hasTabs);
            push('tooltip', hasTooltip);
            push('drawer', hasDrawer);
            push('sidebar', hasSidebar);
            push('popover', hasPopover);
            push('dropdown', hasDropdown);
            push('select', hasSelect);
            push('alert', hasAlert);
            push('context_menu', hasContextMenu);

            return { detectedIds, details };
        }

        const componentDetection = detectPageComponents();

        return {
            pageUrl: window.location.href,
            pageTitle: document.title,
            typography,
            colors,
            components,
            spacing,
            radii,
            shadows,
            cssVariables,
            layout,
            semanticTokens,
            colorScheme: colorSchemeInfo,
            componentDetection,
            extractionWarnings: resolvedCssBundle.warnings,
        };
    }

})();
