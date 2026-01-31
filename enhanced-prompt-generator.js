// ============================================
// Enhanced Prompt Generator v4.1
// TRUE Pixel-Perfect Design Extraction
// With robust null safety
// ============================================

// ============================================
// SAFE HELPERS
// ============================================

function safeJoin(arr, separator = ', ') {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return '';
    return arr.join(separator);
}

function safeGet(obj, path, defaultValue = null) {
    if (!obj) return defaultValue;
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result === null || result === undefined) return defaultValue;
        result = result[key];
    }
    return result !== undefined && result !== null ? result : defaultValue;
}

function parsePixels(value) {
    if (!value || typeof value !== 'string') return 0;
    const match = value.match(/^([\d.]+)px$/);
    return match ? parseFloat(match[1]) : 0;
}

function cleanFontFamily(fontFamily) {
    if (!fontFamily) return null;
    return fontFamily.split(',')[0].trim().replace(/"/g, '').replace(/'/g, '');
}

function isValidColor(color) {
    if (!color || typeof color !== 'string') return false;
    return color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' && color !== 'inherit' && color !== 'initial';
}

// ============================================
// PIXEL-PERFECT DATA EXTRACTION
// ============================================

function extractPixelPerfectData(node, elements = [], depth = 0, parentInfo = null) {
    if (!node || depth > 10) return elements;
    
    const styles = node.styles || {};
    const dims = node.dimensions || {};
    const computed = node.computed || {};
    const position = node.position || {};
    
    // Build comprehensive element data with safe defaults
    const element = {
        tag: node.tag || 'div',
        role: node.role || 'element',
        depth,
        text: node.textContent ? node.textContent.slice(0, 60) : null,
        
        // PIXEL-PERFECT DIMENSIONS
        box: {
            width: dims.width || computed.width || null,
            height: dims.height || computed.height || null,
            contentWidth: dims.contentWidth || null,
            contentHeight: dims.contentHeight || null,
        },
        
        // PIXEL-PERFECT SPACING (numeric values)
        spacing: {
            paddingTop: computed.paddingTop || parsePixels(styles['padding-top']) || parsePixels(styles.padding) || 0,
            paddingRight: computed.paddingRight || parsePixels(styles['padding-right']) || parsePixels(styles.padding) || 0,
            paddingBottom: computed.paddingBottom || parsePixels(styles['padding-bottom']) || parsePixels(styles.padding) || 0,
            paddingLeft: computed.paddingLeft || parsePixels(styles['padding-left']) || parsePixels(styles.padding) || 0,
            marginTop: computed.marginTop || parsePixels(styles['margin-top']) || 0,
            marginRight: computed.marginRight || parsePixels(styles['margin-right']) || 0,
            marginBottom: computed.marginBottom || parsePixels(styles['margin-bottom']) || 0,
            marginLeft: computed.marginLeft || parsePixels(styles['margin-left']) || 0,
        },
        
        // POSITION relative to parent
        position: {
            top: position.relativeTop || 0,
            left: position.relativeLeft || 0,
        },
        
        // Parent context for relative sizing
        parent: parentInfo ? {
            width: parentInfo.width || 0,
            height: parentInfo.height || 0,
            widthPercent: (parentInfo.width && dims.width) ? Math.round((dims.width / parentInfo.width) * 100) : null,
        } : null,
        
        // TYPOGRAPHY (pixel values)
        typography: {
            fontFamily: cleanFontFamily(styles['font-family']),
            fontSize: styles['font-size'] || null,
            fontSizePx: computed.fontSize || parsePixels(styles['font-size']) || null,
            fontWeight: styles['font-weight'] || '400',
            lineHeight: styles['line-height'] || null,
            lineHeightPx: computed.lineHeight || null,
            letterSpacing: styles['letter-spacing'] || 'normal',
            textAlign: styles['text-align'] || 'left',
            textTransform: styles['text-transform'] || 'none',
            textDecoration: styles['text-decoration'] || 'none',
        },
        
        // COLORS
        colors: {
            text: styles.color || styles['color'] || null,
            background: isValidColor(styles['background-color']) ? styles['background-color'] : null,
            border: isValidColor(styles['border-color']) ? styles['border-color'] : null,
        },
        
        // BORDERS
        borders: {
            width: computed.borderWidth || parsePixels(styles['border-width']) || 0,
            style: styles['border-style'] || 'none',
            radius: styles['border-radius'] || '0',
        },
        
        // EFFECTS
        effects: {
            boxShadow: (styles['box-shadow'] && styles['box-shadow'] !== 'none') ? styles['box-shadow'] : null,
            opacity: (styles.opacity && styles.opacity !== '1') ? styles.opacity : null,
            transform: (styles.transform && styles.transform !== 'none') ? styles.transform : null,
        },
        
        // LAYOUT
        layout: {
            display: styles.display || 'block',
            position: styles.position || 'static',
            flexDirection: styles['flex-direction'] || null,
            justifyContent: styles['justify-content'] || null,
            alignItems: styles['align-items'] || null,
            gap: styles.gap || null,
            gapPx: parsePixels(styles.gap) || null,
            overflow: styles.overflow || 'visible',
        },
    };
    
    elements.push(element);
    
    // Process children with current element as parent context
    const currentParent = {
        width: element.box.width,
        height: element.box.height,
    };
    
    const children = node.children || [];
    for (const child of children) {
        extractPixelPerfectData(child, elements, depth + 1, currentParent);
    }
    
    return elements;
}

// ============================================
// FORMATTING HELPERS
// ============================================

function formatSpacingValues(spacing, type) {
    if (!spacing) return null;
    const t = spacing[`${type}Top`] || 0;
    const r = spacing[`${type}Right`] || 0;
    const b = spacing[`${type}Bottom`] || 0;
    const l = spacing[`${type}Left`] || 0;
    
    if (t === 0 && r === 0 && b === 0 && l === 0) return null;
    if (t === r && r === b && b === l) return `${t}px`;
    if (t === b && l === r) return `${t}px ${l}px`;
    return `${t}px ${r}px ${b}px ${l}px`;
}

function formatSpacingFromStyles(styles) {
    if (!styles) return null;
    const padding = styles.padding || styles['padding'];
    if (padding && padding !== '0px' && padding !== '0') return padding;
    return null;
}

// ============================================
// PIXEL-PERFECT HIERARCHY FORMATTER
// ============================================

function formatPixelPerfectHierarchy(node, depth = 0, maxDepth = 8) {
    if (!node || depth > maxDepth) return '';
    
    const indent = '│ '.repeat(depth);
    const branch = depth > 0 ? '├─ ' : '';
    
    const dims = node.dimensions || {};
    const computed = node.computed || {};
    const styles = node.styles || {};
    
    // Element header with dimensions
    let line = `${indent}${branch}`;
    line += `<${node.tag || 'div'}>`;
    
    const role = node.role;
    if (role && role !== 'element' && role !== 'container') {
        line += ` [${role}]`;
    }
    
    // Show exact pixel dimensions
    const width = dims.width || computed.width;
    const height = dims.height || computed.height;
    if (width && height) {
        line += ` ─── ${Math.round(width)}×${Math.round(height)}px`;
    }
    
    line += '\n';
    
    // Spacing details
    const paddingStr = formatSpacingFromStyles(styles) || formatSpacingValues(computed, 'padding');
    const marginStr = formatSpacingValues(computed, 'margin');
    
    if (paddingStr || marginStr) {
        line += `${indent}│   📐 `;
        const parts = [];
        if (paddingStr) parts.push(`padding: ${paddingStr}`);
        if (marginStr) parts.push(`margin: ${marginStr}`);
        line += parts.join(' │ ') + '\n';
    }
    
    // Typography (for text elements)
    const textTags = ['h1','h2','h3','h4','h5','h6','p','span','a','button','label','li'];
    if (node.textContent || textTags.includes((node.tag || '').toLowerCase())) {
        const typo = [];
        if (styles['font-size']) typo.push(styles['font-size']);
        if (styles['font-weight'] && styles['font-weight'] !== '400') typo.push(`w${styles['font-weight']}`);
        if (styles['line-height'] && styles['line-height'] !== 'normal') typo.push(`lh:${styles['line-height']}`);
        if (styles['letter-spacing'] && styles['letter-spacing'] !== 'normal') typo.push(`ls:${styles['letter-spacing']}`);
        
        if (typo.length > 0) {
            line += `${indent}│   🔤 ${typo.join(' • ')}\n`;
        }
    }
    
    // Colors
    const colors = [];
    if (styles.color) colors.push(`text: ${styles.color}`);
    if (isValidColor(styles['background-color'])) colors.push(`bg: ${styles['background-color']}`);
    if (isValidColor(styles['border-color']) && styles['border-width'] !== '0px') {
        colors.push(`border: ${styles['border-color']}`);
    }
    
    if (colors.length > 0) {
        line += `${indent}│   🎨 ${colors.join(' │ ')}\n`;
    }
    
    // Border radius & shadow
    const effects = [];
    if (styles['border-radius'] && styles['border-radius'] !== '0px' && styles['border-radius'] !== '0') {
        effects.push(`radius: ${styles['border-radius']}`);
    }
    if (styles['box-shadow'] && styles['box-shadow'] !== 'none') {
        effects.push(`shadow: ✓`);
    }
    
    if (effects.length > 0) {
        line += `${indent}│   ✨ ${effects.join(' │ ')}\n`;
    }
    
    // Layout info (for flex/grid containers)
    if (styles.display === 'flex' || styles.display === 'grid') {
        const layout = [styles.display];
        if (styles['flex-direction']) layout.push(styles['flex-direction']);
        if (styles['justify-content']) layout.push(`justify: ${styles['justify-content']}`);
        if (styles['align-items']) layout.push(`align: ${styles['align-items']}`);
        if (styles.gap && styles.gap !== '0px') layout.push(`gap: ${styles.gap}`);
        
        line += `${indent}│   📦 ${layout.join(' • ')}\n`;
    }
    
    // Text content preview
    if (node.textContent && node.textContent.trim().length > 0) {
        const preview = node.textContent.trim().slice(0, 40);
        line += `${indent}│   💬 "${preview}${node.textContent.length > 40 ? '...' : ''}"\n`;
    }
    
    // Process children
    const children = node.children || [];
    const maxChildren = 12;
    for (let i = 0; i < children.length && i < maxChildren; i++) {
        line += formatPixelPerfectHierarchy(children[i], depth + 1, maxDepth);
    }
    if (children.length > maxChildren) {
        line += `${indent}│   ... and ${children.length - maxChildren} more elements\n`;
    }
    
    return line;
}

// ============================================
// DETAILED ELEMENT BREAKDOWN
// ============================================

function formatDetailedElementList(elements) {
    if (!elements || !Array.isArray(elements) || elements.length === 0) {
        return 'No elements extracted.\n';
    }
    
    let output = '';
    
    // Group by role/tag
    const groups = {};
    for (const el of elements) {
        if (!el) continue;
        const key = (el.role && el.role !== 'element') ? el.role : (el.tag || 'unknown');
        if (!groups[key]) groups[key] = [];
        groups[key].push(el);
    }
    
    for (const [groupName, groupElements] of Object.entries(groups)) {
        if (!groupElements || groupElements.length === 0) continue;
        
        output += `\n### ${groupName.toUpperCase()} (${groupElements.length})\n`;
        output += '─'.repeat(50) + '\n';
        
        const maxShow = 5;
        for (let i = 0; i < groupElements.length && i < maxShow; i++) {
            const el = groupElements[i];
            if (!el) continue;
            
            // Dimensions
            const box = el.box || {};
            if (box.width && box.height) {
                output += `📐 Size: ${Math.round(box.width)}×${Math.round(box.height)}px`;
                if (el.parent && el.parent.widthPercent) {
                    output += ` (${el.parent.widthPercent}% of parent)`;
                }
                output += '\n';
            }
            
            // Spacing
            const spacing = el.spacing || {};
            const pad = formatSpacingValues(spacing, 'padding');
            const mar = formatSpacingValues(spacing, 'margin');
            if (pad || mar) {
                const spacingParts = [];
                if (pad) spacingParts.push(`Padding: ${pad}`);
                if (mar) spacingParts.push(`Margin: ${mar}`);
                output += `📏 ${spacingParts.join(' │ ')}\n`;
            }
            
            // Typography
            const typo = el.typography || {};
            if (typo.fontSize) {
                const typoParts = [typo.fontSize];
                if (typo.fontWeight && typo.fontWeight !== '400') typoParts.push(`weight: ${typo.fontWeight}`);
                if (typo.lineHeight && typo.lineHeight !== 'normal') typoParts.push(`line-height: ${typo.lineHeight}`);
                if (typo.fontFamily) typoParts.push(typo.fontFamily);
                output += `🔤 Font: ${typoParts.join(' • ')}\n`;
            }
            
            // Colors
            const colors = el.colors || {};
            const colorParts = [];
            if (colors.text) colorParts.push(`text: ${colors.text}`);
            if (colors.background) colorParts.push(`bg: ${colors.background}`);
            if (colors.border) colorParts.push(`border: ${colors.border}`);
            if (colorParts.length > 0) {
                output += `🎨 Colors: ${colorParts.join(' │ ')}\n`;
            }
            
            // Border & effects
            const borders = el.borders || {};
            if (borders.radius && borders.radius !== '0' && borders.radius !== '0px') {
                output += `📦 Border-radius: ${borders.radius}\n`;
            }
            
            const effects = el.effects || {};
            if (effects.boxShadow) {
                output += `✨ Shadow: ${effects.boxShadow}\n`;
            }
            
            // Layout
            const layout = el.layout || {};
            if (layout.display === 'flex' || layout.display === 'grid') {
                const layoutParts = [layout.display];
                if (layout.flexDirection) layoutParts.push(layout.flexDirection);
                if (layout.gap) layoutParts.push(`gap: ${layout.gap}`);
                if (layout.justifyContent) layoutParts.push(`justify: ${layout.justifyContent}`);
                if (layout.alignItems) layoutParts.push(`align: ${layout.alignItems}`);
                output += `📦 Layout: ${layoutParts.join(' • ')}\n`;
            }
            
            // Text preview
            if (el.text) {
                const preview = el.text.slice(0, 30);
                output += `💬 Text: "${preview}${el.text.length > 30 ? '...' : ''}"\n`;
            }
            
            output += '\n';
        }
        
        if (groupElements.length > maxShow) {
            output += `... and ${groupElements.length - maxShow} more ${groupName} elements\n`;
        }
    }
    
    return output;
}

// ============================================
// DESIGN TOKENS EXTRACTION
// ============================================

function extractDesignTokens(elements) {
    const tokens = {
        colors: new Set(),
        bgColors: new Set(),
        borderColors: new Set(),
        fonts: new Set(),
        fontSizes: new Set(),
        fontWeights: new Set(),
        lineHeights: new Set(),
        letterSpacings: new Set(),
        padding: new Set(),
        margin: new Set(),
        gap: new Set(),
        borderRadius: new Set(),
        shadows: new Set(),
        widths: new Set(),
        heights: new Set()
    };
    
    if (!elements || !Array.isArray(elements)) {
        return convertTokensToArrays(tokens);
    }
    
    for (const el of elements) {
        if (!el) continue;
        
        // Colors
        const colors = el.colors || {};
        if (colors.text) tokens.colors.add(colors.text);
        if (colors.background) tokens.bgColors.add(colors.background);
        if (colors.border) tokens.borderColors.add(colors.border);
        
        // Typography
        const typo = el.typography || {};
        if (typo.fontFamily) tokens.fonts.add(typo.fontFamily);
        if (typo.fontSize) tokens.fontSizes.add(typo.fontSize);
        if (typo.fontWeight && typo.fontWeight !== '400') tokens.fontWeights.add(typo.fontWeight);
        if (typo.lineHeight && typo.lineHeight !== 'normal') tokens.lineHeights.add(typo.lineHeight);
        if (typo.letterSpacing && typo.letterSpacing !== 'normal') tokens.letterSpacings.add(typo.letterSpacing);
        
        // Spacing
        const spacing = el.spacing || {};
        const padStr = formatSpacingValues(spacing, 'padding');
        if (padStr) tokens.padding.add(padStr);
        
        const marStr = formatSpacingValues(spacing, 'margin');
        if (marStr) tokens.margin.add(marStr);
        
        // Layout
        const layout = el.layout || {};
        if (layout.gap) tokens.gap.add(layout.gap);
        
        // Borders
        const borders = el.borders || {};
        if (borders.radius && borders.radius !== '0' && borders.radius !== '0px') {
            tokens.borderRadius.add(borders.radius);
        }
        
        // Effects
        const effects = el.effects || {};
        if (effects.boxShadow) tokens.shadows.add(effects.boxShadow);
        
        // Dimensions
        const box = el.box || {};
        if (box.width) tokens.widths.add(`${Math.round(box.width)}px`);
        if (box.height) tokens.heights.add(`${Math.round(box.height)}px`);
    }
    
    return convertTokensToArrays(tokens);
}

function convertTokensToArrays(tokens) {
    if (!tokens) tokens = {};
    
    const safeArray = (set) => {
        try {
            return Array.from(set || []);
        } catch (e) {
            return [];
        }
    };
    
    return {
        colors: safeArray(tokens.colors),
        bgColors: safeArray(tokens.bgColors),
        borderColors: safeArray(tokens.borderColors),
        fonts: safeArray(tokens.fonts),
        fontSizes: safeArray(tokens.fontSizes).sort((a, b) => parseFloat(a || 0) - parseFloat(b || 0)),
        fontWeights: safeArray(tokens.fontWeights).sort((a, b) => parseInt(a || 0) - parseInt(b || 0)),
        lineHeights: safeArray(tokens.lineHeights),
        letterSpacings: safeArray(tokens.letterSpacings),
        padding: safeArray(tokens.padding),
        margin: safeArray(tokens.margin),
        gap: safeArray(tokens.gap),
        borderRadius: safeArray(tokens.borderRadius),
        shadows: safeArray(tokens.shadows),
        widths: safeArray(tokens.widths).sort((a, b) => parseFloat(a || 0) - parseFloat(b || 0)),
        heights: safeArray(tokens.heights).sort((a, b) => parseFloat(a || 0) - parseFloat(b || 0))
    };
}

// Ensure tokens object has all required properties with defaults
function ensureTokens(tokens) {
    const defaults = {
        colors: [],
        bgColors: [],
        borderColors: [],
        fonts: [],
        fontSizes: [],
        fontWeights: [],
        lineHeights: [],
        letterSpacings: [],
        padding: [],
        margin: [],
        gap: [],
        borderRadius: [],
        shadows: [],
        widths: [],
        heights: []
    };
    
    if (!tokens || typeof tokens !== 'object') return defaults;
    
    return { ...defaults, ...tokens };
}

// ============================================
// 4 CORE PROMPT TEMPLATES - PIXEL PERFECT
// ============================================

const CORE_PROMPTS = {
    
    // ==========================================
    // 1. APPLY DESIGN - Style existing component
    // ==========================================
    'apply-design': (data) => {
        if (!data || !data.tree) {
            return 'Error: No design data available. Please select an element.';
        }
        
        const elements = extractPixelPerfectData(data.tree) || [];
        const tokens = ensureTokens(extractDesignTokens(elements));
        const hierarchy = formatPixelPerfectHierarchy(data.tree, 0, 6);
        const rootDims = data.tree.dimensions || {};
        const viewportContext = data.viewportContext || {};
        const rootStyles = data.tree.styles || {};
        
        return `TASK: Apply this design's EXACT visual styles to my existing component.

📎 NOTE: Use the attached screenshot as visual reference. Below are the EXACT CSS values extracted from the DOM.

════════════════════════════════════════════════════════════════════
CAPTURED ELEMENT OVERVIEW
════════════════════════════════════════════════════════════════════
📐 Total Size: ${rootDims.width || '?'}px × ${rootDims.height || '?'}px
🎨 Background: ${rootStyles['background-color'] || 'transparent'}
📦 Display: ${rootStyles.display || 'block'}
${rootStyles['border-radius'] && rootStyles['border-radius'] !== '0px' ? `🔲 Border Radius: ${rootStyles['border-radius']}` : ''}
${rootStyles['box-shadow'] && rootStyles['box-shadow'] !== 'none' ? `✨ Shadow: ${rootStyles['box-shadow']}` : ''}
${rootStyles.padding && rootStyles.padding !== '0px' ? `📏 Padding: ${rootStyles.padding}` : ''}
${viewportContext.rootFontSize ? `📝 Root font-size: ${viewportContext.rootFontSize}px` : ''}

════════════════════════════════════════════════════════════════════
⚠️ PRESERVE MY EXISTING:
• Text content, labels, placeholders
• HTML structure and class names  
• Component logic and event handlers

✅ ONLY CHANGE: Visual CSS styles
════════════════════════════════════════════════════════════════════

════════════════════════════════════════════════════════════════════
PIXEL-PERFECT COMPONENT STRUCTURE
════════════════════════════════════════════════════════════════════

${hierarchy || 'No hierarchy data available'}

════════════════════════════════════════════════════════════════════
EXACT VALUES TO APPLY
════════════════════════════════════════════════════════════════════

🎨 COLORS:
• Text colors: ${safeJoin(tokens.colors) || 'inherit'}
• Background colors: ${safeJoin(tokens.bgColors) || 'transparent'}
• Border colors: ${safeJoin(tokens.borderColors) || 'none'}

🔤 TYPOGRAPHY:
• Font family: ${safeJoin(tokens.fonts) || 'system-ui, sans-serif'}
• Font sizes: ${safeJoin(tokens.fontSizes) || 'inherit'}
• Font weights: ${safeJoin(tokens.fontWeights) || '400'}
• Line heights: ${safeJoin(tokens.lineHeights) || 'normal'}
• Letter spacing: ${safeJoin(tokens.letterSpacings) || 'normal'}

📐 SPACING (EXACT PIXEL VALUES):
• Padding: ${safeJoin(tokens.padding, ' │ ') || '0'}
• Margin: ${safeJoin(tokens.margin, ' │ ') || '0'}
• Gap: ${safeJoin(tokens.gap) || '0'}

📦 BORDERS & RADIUS:
• Border radius: ${safeJoin(tokens.borderRadius) || '0'}

✨ EFFECTS:
${(tokens.shadows || []).length > 0 ? (tokens.shadows || []).map(s => `• box-shadow: ${s}`).join('\n') : '• No shadows'}

📏 ELEMENT DIMENSIONS:
• Widths: ${safeJoin((tokens.widths || []).slice(0, 10)) || 'auto'}
• Heights: ${safeJoin((tokens.heights || []).slice(0, 10)) || 'auto'}

════════════════════════════════════════════════════════════════════
DETAILED ELEMENT BREAKDOWN
════════════════════════════════════════════════════════════════════
${formatDetailedElementList(elements)}

════════════════════════════════════════════════════════════════════
INSTRUCTIONS:
1. Match each element in your component to the types above
2. Apply the EXACT pixel values shown - do NOT approximate
3. Spacing must match exactly (padding, margin, gap)
4. Use the exact color values provided
5. If you see percentage widths, the parent width is shown for calculation
════════════════════════════════════════════════════════════════════`;
    },

    // ==========================================
    // 2. REPLICATE DESIGN - Pixel-perfect copy
    // ==========================================
    'replicate-design': (data) => {
        if (!data || !data.tree) {
            return 'Error: No design data available. Please select an element.';
        }
        
        const elements = extractPixelPerfectData(data.tree) || [];
        const tokens = ensureTokens(extractDesignTokens(elements));
        const hierarchy = formatPixelPerfectHierarchy(data.tree, 0, 8);
        const rootDims = data.tree.dimensions || {};
        const rootStyles = data.tree.styles || {};
        const viewportContext = data.viewportContext || {};
        
        return `TASK: Create a PIXEL-PERFECT replica of this design.

📎 NOTE: Use the attached screenshot as visual reference. Below are the EXACT CSS values extracted from the DOM.

════════════════════════════════════════════════════════════════════
ROOT CONTAINER - EXACT SPECIFICATIONS
════════════════════════════════════════════════════════════════════
📐 SIZE: ${rootDims.width || '?'}px × ${rootDims.height || '?'}px
📦 DISPLAY: ${rootStyles.display || 'block'}
🎨 BACKGROUND: ${rootStyles['background-color'] || 'transparent'}
📏 PADDING: ${rootStyles.padding || '0'}
🔲 BORDER-RADIUS: ${rootStyles['border-radius'] || '0'}
${rootStyles['box-shadow'] && rootStyles['box-shadow'] !== 'none' ? `✨ BOX-SHADOW: ${rootStyles['box-shadow']}` : ''}
${rootStyles['border-width'] && rootStyles['border-width'] !== '0px' ? `🔳 BORDER: ${rootStyles['border-width']} ${rootStyles['border-style'] || 'solid'} ${rootStyles['border-color'] || '#000'}` : ''}
${viewportContext.rootFontSize ? `📝 ROOT FONT-SIZE: ${viewportContext.rootFontSize}px` : ''}

════════════════════════════════════════════════════════════════════
COMPLETE HIERARCHY WITH PIXEL VALUES
════════════════════════════════════════════════════════════════════

${hierarchy || 'No hierarchy data available'}

════════════════════════════════════════════════════════════════════
DESIGN TOKENS (USE EXACT VALUES)
════════════════════════════════════════════════════════════════════

🎨 COLORS:
• Text colors: ${safeJoin(tokens.colors) || 'inherit'}
• Backgrounds: ${safeJoin(tokens.bgColors) || 'transparent'}
• Borders: ${safeJoin(tokens.borderColors) || 'none'}

🔤 TYPOGRAPHY:
• Fonts: ${safeJoin(tokens.fonts) || 'system-ui'}
• Sizes: ${safeJoin(tokens.fontSizes) || 'inherit'}
• Weights: ${safeJoin(tokens.fontWeights) || '400'}
• Line heights: ${safeJoin(tokens.lineHeights) || 'normal'}
• Letter spacing: ${safeJoin(tokens.letterSpacings) || 'normal'}

📐 SPACING SCALE:
• Padding values: ${safeJoin(tokens.padding, ' │ ') || '0'}
• Margin values: ${safeJoin(tokens.margin, ' │ ') || '0'}
• Gap values: ${safeJoin(tokens.gap) || '0'}

📦 BORDERS:
• Radii: ${safeJoin(tokens.borderRadius) || '0'}

✨ SHADOWS:
${(tokens.shadows || []).length > 0 ? (tokens.shadows || []).map(s => `• ${s}`).join('\n') : '• none'}

📏 ELEMENT DIMENSIONS:
• Widths used: ${safeJoin((tokens.widths || []).slice(0, 12)) || 'auto'}
• Heights used: ${safeJoin((tokens.heights || []).slice(0, 12)) || 'auto'}

════════════════════════════════════════════════════════════════════
ELEMENT-BY-ELEMENT SPECIFICATIONS
════════════════════════════════════════════════════════════════════
${formatDetailedElementList(elements)}

════════════════════════════════════════════════════════════════════
REQUIREMENTS FOR PIXEL PERFECTION:
1. ✅ Match EXACT dimensions (width × height) for each element
2. ✅ Use EXACT color values - no approximations
3. ✅ Apply EXACT spacing (padding/margin in pixels)
4. ✅ Replicate border-radius exactly as specified
5. ✅ Include shadows with exact values
6. ✅ Match typography: size, weight, line-height, letter-spacing
7. ✅ Preserve layout: flex/grid settings, gap, alignment
8. ✅ Text content should be configurable via props
════════════════════════════════════════════════════════════════════`;
    },

    // ==========================================
    // 3. GLOBAL TOKENS - Design system variables
    // ==========================================
    'global-tokens': (data) => {
        if (!data) {
            return 'Error: No design data available. Please select an element.';
        }
        
        const deepData = data.deepScanData || {};
        const designTokens = deepData.designTokens || {};
        const cssVars = deepData.cssVariables || data.globalCSS || {};
        
        // Extract from tree
        const elements = data.tree ? extractPixelPerfectData(data.tree) : [];
        const tokens = ensureTokens(extractDesignTokens(elements));
        
        // Combine tokens safely
        const allColors = [...new Set([
            ...(designTokens.colors || []),
            ...(tokens.colors || []),
            ...(tokens.bgColors || []),
            ...(tokens.borderColors || [])
        ].filter(Boolean))];
        
        const allFonts = [...new Set([
            ...(designTokens.fontFamilies || []),
            ...(tokens.fonts || [])
        ].filter(Boolean))];
        
        const allFontSizes = [...new Set([
            ...(designTokens.fontSizes || []),
            ...(tokens.fontSizes || [])
        ].filter(Boolean))].sort((a, b) => parseFloat(a) - parseFloat(b));
        
        const allSpacing = [...new Set([
            ...(designTokens.spacing || []),
            ...(tokens.padding || []),
            ...(tokens.margin || []),
            ...(tokens.gap || [])
        ].filter(Boolean))];
        
        const allRadii = [...new Set([
            ...(designTokens.borderRadii || []),
            ...(tokens.borderRadius || [])
        ].filter(Boolean))];
        
        const allShadows = [...new Set([
            ...(designTokens.shadows || []),
            ...(tokens.shadows || [])
        ].filter(Boolean))];
        
        // Format existing CSS variables
        let existingVars = '';
        const rootVars = cssVars.root || cssVars.rootVariables || {};
        if (Object.keys(rootVars).length > 0) {
            existingVars = '\n════════════════════════════════════════════════════════════════════\nEXISTING CSS VARIABLES FROM PAGE\n════════════════════════════════════════════════════════════════════\n';
            const entries = Object.entries(rootVars).slice(0, 40);
            for (const [name, value] of entries) {
                existingVars += `${name}: ${value};\n`;
            }
        }
        
        let darkVars = '';
        const darkModeVars = cssVars.dark || cssVars.darkVariables || {};
        if (Object.keys(darkModeVars).length > 0) {
            darkVars = '\n════════════════════════════════════════════════════════════════════\nDARK MODE VARIABLES\n════════════════════════════════════════════════════════════════════\n';
            const entries = Object.entries(darkModeVars).slice(0, 25);
            for (const [name, value] of entries) {
                darkVars += `${name}: ${value};\n`;
            }
        }
        
        return `TASK: Extract design system tokens as CSS variables.

════════════════════════════════════════════════════════════════════
EXTRACTED DESIGN TOKENS
════════════════════════════════════════════════════════════════════

🎨 COLORS (${(allColors || []).length} unique values):
${(allColors || []).slice(0, 25).map((c, i) => `  ${i + 1}. ${c}`).join('\n') || '  No colors extracted'}
${(allColors || []).length > 25 ? `  ... and ${(allColors || []).length - 25} more` : ''}

🔤 TYPOGRAPHY:
• Font families: ${safeJoin(allFonts) || 'system default'}
• Font sizes: ${safeJoin(allFontSizes) || 'not extracted'}
• Font weights: ${safeJoin(tokens.fontWeights) || '400'}
• Line heights: ${safeJoin(tokens.lineHeights) || 'normal'}

📐 SPACING SCALE:
${(allSpacing || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') || '  No spacing values extracted'}

📦 BORDER RADIUS:
${(allRadii || []).map((r, i) => `  ${i + 1}. ${r}`).join('\n') || '  0'}

✨ SHADOWS:
${(allShadows || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') || '  none'}
${existingVars}${darkVars}

════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (CSS Custom Properties)
════════════════════════════════════════════════════════════════════

Generate CSS variables mapping the above extracted values:

\`\`\`css
:root {
  /* Colors */
  --background: <extracted-bg-color>;
  --foreground: <extracted-text-color>;
  --primary: <primary-color>;
  --secondary: <secondary-color>;
  --border: <border-color>;
  
  /* Typography */
  --font-sans: <font-family>;
  
  /* Spacing */
  --spacing-1: <smallest-spacing>;
  --spacing-2: ...;
  --spacing-3: ...;
  
  /* Radius */
  --radius-sm: <small-radius>;
  --radius-md: <medium-radius>;
  
  /* Shadows */
  --shadow-sm: <small-shadow>;
  --shadow-md: <medium-shadow>;
}
\`\`\`
════════════════════════════════════════════════════════════════════`;
    },

    // ==========================================
    // 4. SHADCN COMPONENT - React with shadcn/ui
    // ==========================================
    'shadcn-component': (data) => {
        return `🧱 Building shadcn/ui Component

This mode uses AI to generate a production-ready React component with shadcn/ui.

Processing with Gemini AI...`;
    }
};

// ============================================
// MAIN GENERATION FUNCTIONS
// ============================================

function generateQuickPrompt(designData, intent) {
    // Validate input data
    if (!designData) {
        console.warn('[PromptGenerator] No design data provided');
        return 'No design data available. Please select an element first.';
    }
    
    if (!designData.tree) {
        console.warn('[PromptGenerator] Design data has no tree property');
        return 'No element tree data available. Please try selecting an element again.';
    }
    
    const generator = CORE_PROMPTS[intent];
    
    if (!generator) {
        console.warn(`[PromptGenerator] Unknown intent: ${intent}, falling back to apply-design`);
        return CORE_PROMPTS['apply-design'](designData);
    }
    
    try {
        const result = generator(designData);
        return result || 'Error: Empty output generated.';
    } catch (e) {
        console.error('[PromptGenerator] Error generating prompt:', e);
        return `Error generating output: ${e.message}\n\nPlease try selecting the element again.`;
    }
}

async function generateEnhancedPrompt(designData, intent, options = {}) {
    console.log('[PromptGenerator] Generating for intent:', intent);
    
    // For shadcn, defer to the builder
    if (intent === 'shadcn-component') {
        return {
            prompt: CORE_PROMPTS['shadcn-component'](designData),
            enhanced: false,
            source: 'template',
            useShadcnBuilder: true
        };
    }
    
    // Generate the template prompt
    const templatePrompt = generateQuickPrompt(designData, intent);
    
    // Return template prompt (AI enhancement is optional)
    return {
        prompt: templatePrompt,
        enhanced: false,
        source: 'template'
    };
}

// ============================================
// EXPORTS
// ============================================

window.EnhancedPromptGenerator = {
    // Main generation
    generateEnhancedPrompt,
    generateQuickPrompt,
    
    // Utilities
    extractPixelPerfectData,
    extractDesignTokens,
    formatPixelPerfectHierarchy,
    formatDetailedElementList,
    safeJoin,
    safeGet,
    
    // Templates
    CORE_PROMPTS
};

console.log('[EnhancedPromptGenerator] Module loaded - v4.1 Pixel Perfect with null safety');
