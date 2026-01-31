(function() {
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
        updateOverlay(el);
    }

    // Comprehensive list of CSS properties for pixel-perfect extraction
    const STYLE_PROPERTIES = [
        // Colors & Background
        'color', 'background-color', 'background-image', 'background-size', 'background-position',
        'background-repeat', 'background-attachment', 'background-clip', 'background-origin',
        
        // Typography - CRITICAL for pixel perfection
        'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 
        'letter-spacing', 'word-spacing', 'text-align', 'text-decoration', 'text-transform',
        'text-indent', 'text-shadow', 'white-space', 'word-break', 'overflow-wrap',
        'vertical-align', '-webkit-font-smoothing', 'font-feature-settings',
        
        // Spacing - CRITICAL for pixel perfection
        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
        
        // Box Model - CRITICAL for pixel perfection
        'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
        'box-sizing',
        
        // Borders - CRITICAL
        'border', 'border-radius', 'border-width', 'border-style', 'border-color',
        'border-top', 'border-right', 'border-bottom', 'border-left',
        'border-top-left-radius', 'border-top-right-radius', 
        'border-bottom-left-radius', 'border-bottom-right-radius',
        
        // Effects - CRITICAL
        'box-shadow', 'outline', 'outline-offset',
        'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode',
        
        // Layout
        'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
        'flex-direction', 'justify-content', 'align-items', 'align-content',
        'align-self', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
        'gap', 'row-gap', 'column-gap',
        'grid-template-columns', 'grid-template-rows', 'grid-gap', 'grid-auto-flow',
        'grid-column', 'grid-row',
        
        // Positioning & Overflow
        'overflow', 'overflow-x', 'overflow-y', 'visibility',
        'clip-path', 'object-fit', 'object-position',
        
        // Interactions
        'cursor', 'pointer-events', 'user-select',
        'transform', 'transform-origin',
        'transition', 'animation'
    ];

    function getRelevantStyles(el) {
        const styles = window.getComputedStyle(el);
        const result = {};
        
        // Values to skip (truly default/meaningless values)
        const skipValues = new Set([
            'initial', 'inherit', 'unset', 'revert',
            'start', 'visible', 'static', 'baseline'
        ]);
        
        // Properties where 'none' is meaningful
        const noneIsMeaningful = new Set([
            'text-decoration', 'text-transform', 'list-style'
        ]);
        
        // Properties where '0px' or '0' is meaningful (should still capture)
        const zeroIsMeaningful = new Set([
            'border-radius', 'margin', 'padding', 'gap', 'letter-spacing',
            'border-top-left-radius', 'border-top-right-radius',
            'border-bottom-left-radius', 'border-bottom-right-radius'
        ]);
        
        // Properties where 'auto' is meaningful
        const autoIsMeaningful = new Set([
            'margin', 'margin-left', 'margin-right', 'width', 'height'
        ]);
        
        STYLE_PROPERTIES.forEach(prop => {
            const value = styles.getPropertyValue(prop);
            if (!value) return;
            
            // Skip truly default values
            if (skipValues.has(value)) return;
            
            // Handle 'none' - skip for most properties
            if (value === 'none' && !noneIsMeaningful.has(prop)) return;
            
            // Handle 'normal' - skip for most but keep for some
            if (value === 'normal' && !['letter-spacing', 'word-spacing', 'line-height', 'white-space'].includes(prop)) return;
            
            // Handle 'auto' - skip for most but keep for meaningful ones
            if (value === 'auto' && !autoIsMeaningful.has(prop)) return;
            
            // Handle zero values
            if ((value === '0px' || value === '0' || value === '0px 0px 0px 0px') && !zeroIsMeaningful.has(prop)) return;
            
            // Handle transparent/invisible colors
            if (value === 'rgba(0, 0, 0, 0)' || value === 'transparent') {
                // Only skip for background-color (transparent bg is often default)
                if (prop === 'background-color') return;
            }
            
            // Skip pure black text if it's the default
            if (prop === 'color' && value === 'rgb(0, 0, 0)') {
                // Still include it - black text is valid
            }
            
            result[prop] = value;
        });
        
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
        const classes = Array.from(el.classList).filter(c => !c.includes('ai-design-copier')).join(' ');
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

    // Extract key style properties for a component
    function extractComponentStyles(el) {
        const styles = window.getComputedStyle(el);
        const result = {};

        // Colors
        const bgColor = styles.backgroundColor;
        const textColor = styles.color;
        const borderColor = styles.borderColor;

        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
            result.backgroundColor = bgColor;
        }
        if (textColor) {
            result.color = textColor;
        }
        if (borderColor && borderColor !== 'rgb(0, 0, 0)' && styles.borderWidth !== '0px') {
            result.borderColor = borderColor;
        }

        // Typography
        result.fontFamily = styles.fontFamily.split(',')[0].trim().replace(/"/g, '');
        result.fontSize = styles.fontSize;
        result.fontWeight = styles.fontWeight;
        result.lineHeight = styles.lineHeight;
        if (styles.letterSpacing !== 'normal') {
            result.letterSpacing = styles.letterSpacing;
        }
        if (styles.textTransform !== 'none') {
            result.textTransform = styles.textTransform;
        }

        // Spacing
        const padding = styles.padding;
        const margin = styles.margin;
        if (padding && padding !== '0px') {
            result.padding = padding;
        }
        if (margin && margin !== '0px') {
            result.margin = margin;
        }

        // Borders
        if (styles.borderRadius && styles.borderRadius !== '0px') {
            result.borderRadius = styles.borderRadius;
        }
        if (styles.borderWidth && styles.borderWidth !== '0px') {
            result.borderWidth = styles.borderWidth;
            result.borderStyle = styles.borderStyle;
        }

        // Shadows
        if (styles.boxShadow && styles.boxShadow !== 'none') {
            result.boxShadow = styles.boxShadow;
        }

        // Dimensions
        const rect = el.getBoundingClientRect();
        result.width = Math.round(rect.width);
        result.height = Math.round(rect.height);

        // Layout
        if (styles.display === 'flex' || styles.display === 'inline-flex') {
            result.display = styles.display;
            result.flexDirection = styles.flexDirection;
            result.justifyContent = styles.justifyContent;
            result.alignItems = styles.alignItems;
            if (styles.gap !== 'normal' && styles.gap !== '0px') {
                result.gap = styles.gap;
            }
        } else if (styles.display === 'grid' || styles.display === 'inline-grid') {
            result.display = styles.display;
            result.gridTemplateColumns = styles.gridTemplateColumns;
            result.gridGap = styles.gridGap;
        }

        // Transitions
        if (styles.transition && styles.transition !== 'all 0s ease 0s' && styles.transition !== 'none') {
            result.transition = styles.transition;
        }

        // Cursor
        if (styles.cursor && styles.cursor !== 'auto') {
            result.cursor = styles.cursor;
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
        const lineHeights = new Set();

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

            // Shadows
            if (styles.boxShadow && styles.boxShadow !== 'none') {
                shadows.add(styles.boxShadow);
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
                shadows: Array.from(shadows)
            },
            cssVariables,
            stats: {
                totalElementsScanned: processedCount,
                uniqueComponentsFound: componentCount,
                colorsFound: colors.size,
                fontsFound: fontFamilies.size
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

    async function captureElementScreenshot(el) {
        const rect = el.getBoundingClientRect();
        
        // Add timeout to prevent hanging
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('Screenshot capture timed out');
                resolve(null);
            }, 3000); // 3 second timeout
            
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
                        console.error('Screenshot error:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }
                    if (response && response.screenshot) {
                        resolve(response.screenshot);
                    } else {
                        resolve(null);
                    }
                });
            } catch (e) {
                clearTimeout(timeout);
                console.error('Screenshot capture failed:', e);
                resolve(null);
            }
        });
    }

    async function handleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const el = e.target;
        
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        let screenshot = null;
        try {
            screenshot = await captureElementScreenshot(el);
        } catch (err) {
            console.error('Screenshot capture failed:', err);
        }
        
        // Get parent element for context
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
        
        const elementTree = buildElementTree(el, 0, 10, parentContext);
        const elementCount = countElements(elementTree);
        
        const isPageLevel = isPageLevelElement(el);
        const globalCSS = extractPageGlobalCSS();
        
        // Viewport and page context for pixel-perfect extraction
        const viewportContext = {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            devicePixelRatio: window.devicePixelRatio || 1,
            // Root font size for rem calculations
            rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
        };
        
        const captureData = {
            tree: elementTree,
            elementCount: elementCount,
            screenshot: screenshot,
            pageUrl: window.location.href,
            pageTitle: document.title,
            timestamp: new Date().toISOString(),
            isPageLevel: isPageLevel,
            globalCSS: globalCSS,
            // New: viewport and parent context for pixel perfection
            viewportContext: viewportContext,
            parentContext: parentContext
        };
        
        chrome.runtime.sendMessage({
            type: 'ELEMENT_SELECTED',
            data: captureData
        });

        stopSelection();
        
        const message = isPageLevel 
            ? `Captured page styles — Opening results...`
            : `Captured ${elementCount} element${elementCount > 1 ? 's' : ''} — Opening results...`;
        showToast(message);
        
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

    function stopSelection() {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('click', handleClick, true);
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
            sendResponse({ status: 'started' });
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
