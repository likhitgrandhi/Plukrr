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
// ANIMATION DATA FORMATTING
// ============================================

/**
 * Format animation data for inclusion in prompts
 */
function formatAnimationData(animationData) {
    if (!animationData || !animationData.hasAnimations) {
        return null;
    }
    
    const lines = [];
    
    lines.push('════════════════════════════════════════════════════════════════════');
    lines.push('🎬 ANIMATION DATA DETECTED');
    lines.push('════════════════════════════════════════════════════════════════════');
    lines.push('');
    
    // Detected libraries
    if (animationData.detectedLibraries && animationData.detectedLibraries.length > 0) {
        lines.push('📚 DETECTED ANIMATION LIBRARIES:');
        for (const lib of animationData.detectedLibraries) {
            lines.push(`  • ${lib.name}${lib.version ? ` (v${lib.version})` : ''}`);
            if (lib.indicators && lib.indicators.length > 0) {
                lines.push(`    Indicators: ${lib.indicators.join(', ')}`);
            }
        }
        lines.push('');
    }
    
    // Animation types
    if (animationData.animationTypes && animationData.animationTypes.length > 0) {
        lines.push('🎯 ANIMATION TYPES:');
        lines.push(`  ${animationData.animationTypes.join(', ')}`);
        lines.push('');
    }
    
    // CSS Animations
    if (animationData.cssAnimations && animationData.cssAnimations.length > 0) {
        lines.push('🎨 CSS ANIMATIONS:');
        for (const anim of animationData.cssAnimations.slice(0, 5)) {
            if (anim.type === 'css-animation') {
                lines.push(`  • Element: ${anim.element}`);
                lines.push(`    animation: ${anim.animationName} ${anim.duration} ${anim.timingFunction}`);
                if (anim.iterationCount !== '1') {
                    lines.push(`    iteration-count: ${anim.iterationCount}`);
                }
            } else if (anim.type === 'css-transition') {
                lines.push(`  • Element: ${anim.element}`);
                lines.push(`    transition: ${anim.property} ${anim.duration} ${anim.timingFunction}`);
            }
        }
        if (animationData.cssAnimations.length > 5) {
            lines.push(`  ... and ${animationData.cssAnimations.length - 5} more CSS animations`);
        }
        lines.push('');
    }
    
    // Scroll animations
    if (animationData.scrollAnimations && animationData.scrollAnimations.length > 0) {
        lines.push('📜 SCROLL-BASED ANIMATIONS:');
        for (const scroll of animationData.scrollAnimations.slice(0, 3)) {
            lines.push(`  • Type: ${scroll.type}`);
            lines.push(`    Element: ${scroll.element}`);
            if (scroll.animation) lines.push(`    Animation: ${scroll.animation}`);
        }
        lines.push('');
    }
    
    // Canvas animations
    if (animationData.canvasAnimations && animationData.canvasAnimations.length > 0) {
        lines.push('🖼️ CANVAS ANIMATIONS:');
        for (const canvas of animationData.canvasAnimations) {
            lines.push(`  • ID: ${canvas.id || 'unnamed'}`);
            lines.push(`    Dimensions: ${canvas.dimensions?.width}×${canvas.dimensions?.height}`);
            lines.push(`    Context: ${canvas.contextType?.type || 'unknown'}`);
            if (canvas.animationHints && canvas.animationHints.length > 0) {
                lines.push(`    Hints: ${canvas.animationHints.join(', ')}`);
            }
        }
        lines.push('');
    }
    
    // Three.js data
    if (animationData.jsAnimations?.threejs) {
        const three = animationData.jsAnimations.threejs;
        lines.push('🎮 THREE.JS SCENE DATA:');
        lines.push(`  Version: ${three.version || 'unknown'}`);
        if (three.renderers && three.renderers.length > 0) {
            lines.push(`  Renderers: ${three.renderers.length}`);
            for (const r of three.renderers) {
                lines.push(`    • ${r.dimensions?.width}×${r.dimensions?.height} (${r.contextType})`);
            }
        }
        if (three.scenes && three.scenes.length > 0) {
            lines.push(`  Scenes captured: ${three.scenes.length}`);
        }
        lines.push('');
    }
    
    // GSAP data
    if (animationData.jsAnimations?.gsap) {
        const gsap = animationData.jsAnimations.gsap;
        lines.push('⚡ GSAP ANIMATION DATA:');
        lines.push(`  Version: ${gsap.version?.version || 'unknown'} (${gsap.version?.type || 'unknown'})`);
        if (gsap.plugins && gsap.plugins.length > 0) {
            lines.push(`  Plugins: ${gsap.plugins.map(p => p.name).join(', ')}`);
        }
        if (gsap.timelines && gsap.timelines.length > 0) {
            lines.push(`  Timelines: ${gsap.timelines.length}`);
            for (const tl of gsap.timelines.slice(0, 2)) {
                lines.push(`    • Duration: ${tl.duration}s, Children: ${tl.children?.length || 0}`);
            }
        }
        if (gsap.scrollTriggers && gsap.scrollTriggers.length > 0) {
            lines.push(`  ScrollTriggers: ${gsap.scrollTriggers.length}`);
        }
        lines.push('');
    }
    
    return lines.join('\n');
}

/**
 * Format generated animation code for prompts
 */
function formatGeneratedAnimationCode(animationData) {
    if (!animationData || !animationData.generatedCode) {
        return null;
    }
    
    const lines = [];
    const code = animationData.generatedCode;
    
    lines.push('════════════════════════════════════════════════════════════════════');
    lines.push('📝 GENERATED ANIMATION CODE');
    lines.push('════════════════════════════════════════════════════════════════════');
    lines.push('');
    
    if (code.threejs) {
        lines.push('### THREE.JS SETUP CODE:');
        lines.push('```javascript');
        lines.push(code.threejs);
        lines.push('```');
        lines.push('');
    }
    
    if (code.gsap) {
        lines.push('### GSAP ANIMATION CODE:');
        lines.push('```javascript');
        lines.push(code.gsap);
        lines.push('```');
        lines.push('');
    }
    
    if (code.canvas) {
        lines.push('### CANVAS ANIMATION CODE:');
        lines.push('```javascript');
        lines.push(code.canvas);
        lines.push('```');
        lines.push('');
    }
    
    // Library suggestions
    if (animationData.librarySuggestions && animationData.librarySuggestions.length > 0) {
        lines.push('### LIBRARY SUGGESTIONS:');
        for (const suggestion of animationData.librarySuggestions) {
            lines.push(`\n#### ${suggestion.library}:`);
            lines.push('```javascript');
            lines.push(suggestion.code);
            lines.push('```');
        }
        lines.push('');
    }
    
    return lines.join('\n');
}

/**
 * Get animation complexity description
 */
function getAnimationComplexityDescription(animationData) {
    if (!animationData || !animationData.hasAnimations) {
        return 'No animations detected';
    }
    
    const complexity = animationData.metadata?.complexity || 'unknown';
    const typeCount = animationData.animationTypes?.length || 0;
    const libCount = animationData.detectedLibraries?.length || 0;
    
    let desc = `Complexity: ${complexity.toUpperCase()}`;
    desc += ` | ${typeCount} animation type(s)`;
    if (libCount > 0) {
        desc += ` | ${libCount} library/libraries detected`;
    }
    
    return desc;
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
// ELEMENT COUNTING FOR PHASED APPROACH
// ============================================

function countTotalElements(node, count = { total: 0, depth: 0 }) {
    if (!node) return count;
    count.total++;
    count.depth = Math.max(count.depth, node.depth || 0);
    for (const child of (node.children || [])) {
        countTotalElements(child, count);
    }
    return count;
}

function generatePhasedGuidance(elementCount, maxDepth) {
    if (elementCount <= 30) return null; // No guidance needed for small selections
    
    const phases = Math.ceil(elementCount / 25);
    return `
⚠️ LARGE SELECTION DETECTED: ${elementCount} elements across ${maxDepth} levels

📋 RECOMMENDED PHASED APPROACH:
For best results with complex designs, consider extracting in ${phases} phases:
• Phase 1: Extract the main container/header section only
• Phase 2: Extract the content/body area separately  
• Phase 3: Extract footer/sidebar/additional sections

This ensures the AI receives complete, non-truncated data for each section.
To do this: Use the element picker to select smaller, logical sections one at a time.

────────────────────────────────────────────────────────────────────
PROCEEDING WITH FULL EXTRACTION (all ${elementCount} elements included below):
────────────────────────────────────────────────────────────────────
`;
}

// ============================================
// PIXEL-PERFECT HIERARCHY FORMATTER
// ============================================

function formatPixelPerfectHierarchy(node, depth = 0, maxDepth = 15) {
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
    
    // Show class names (helpful for understanding utility classes like Tailwind)
    const classNames = node.classNames || [];
    if (classNames.length > 0) {
        // Filter to show styling-related classes (not random IDs or state classes)
        const styleClasses = classNames.filter(c => 
            !c.match(/^[a-z]{1,3}-[0-9a-f]{4,}$/i) && // Skip hashed classes
            !c.includes('__') && // Skip BEM modifiers
            c.length < 40 // Skip very long generated classes
        ).slice(0, 12); // Allow more classes for accuracy
        
        if (styleClasses.length > 0) {
            line += `${indent}│   📌 class: "${styleClasses.join(' ')}"\n`;
        }
    }
    
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
    
    // Border radius & shadow - be more thorough with border-radius
    const effects = [];
    const borderRadius = styles['border-radius'] || computed.borderRadius;
    if (borderRadius && borderRadius !== '0px' && borderRadius !== '0') {
        effects.push(`radius: ${borderRadius}`);
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
    
    // Process ALL children - no truncation for accuracy
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
        line += formatPixelPerfectHierarchy(children[i], depth + 1, maxDepth);
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
        
        // Show ALL elements - no truncation for accurate replication
        for (let i = 0; i < groupElements.length; i++) {
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
        const hierarchy = formatPixelPerfectHierarchy(data.tree, 0, 15);
        const rootDims = data.tree.dimensions || {};
        const viewportContext = data.viewportContext || {};
        const rootStyles = data.tree.styles || {};
        
        // Get border-radius from either kebab or camelCase, also check computed
        const rootComputed = data.tree.computed || {};
        const rootBorderRadius = rootStyles['border-radius'] || rootComputed.borderRadius || null;
        const rootClasses = data.tree.classNames || [];
        
        // Count elements for phased guidance
        const elementStats = countTotalElements(data.tree);
        const phasedGuidance = generatePhasedGuidance(elementStats.total, elementStats.depth);
        
        return `TASK: Apply this design's EXACT visual styles to my EXISTING component.

📎 NOTE: Use the attached screenshot as visual reference. Below are the EXACT CSS values extracted from the DOM.
${phasedGuidance || ''}
════════════════════════════════════════════════════════════════════
🧠 STEP 1: LOGICAL ELEMENT MAPPING (Do this first!)
════════════════════════════════════════════════════════════════════

Before applying ANY styles, mentally map each element in the reference design to its CONCEPTUAL equivalent in my component:
• Reference "heading" → My component's heading (even if text content differs)
• Reference "card container" → My component's container (regardless of what it contains)
• Reference "action button" → My component's action button (even if the action is different)
• Reference "metadata/subtitle" → My component's metadata/subtitle area
• Reference "icon/image area" → My component's icon/image area

⚠️ CRITICAL: The reference design may have COMPLETELY DIFFERENT CONTENT than my component.
Example: Reference might be a "subscription card" but I have a "user profile card".
You are ONLY borrowing the VISUAL APPEARANCE (colors, spacing, shadows, typography).
Map elements by their ROLE (heading, body, button, icon area), NOT by their content.
My component's PURPOSE and CONTENT must remain unchanged.

════════════════════════════════════════════════════════════════════
🎯 STEP 2: APPLY STYLES - CRITICAL INSTRUCTIONS
════════════════════════════════════════════════════════════════════

✅ DO:
• Apply styles from reference elements to MY EQUIVALENT elements (based on role mapping above)
• Use MY styling approach (Tailwind classes, CSS modules, styled-components, etc.)
• Update ONLY the visual CSS values (colors, spacing, typography, borders, shadows)
• Keep ALL my existing content, text, labels, and functionality unchanged

❌ DO NOT:
• Replace my content/text with the reference design's content
• Change what my component IS or DOES (keep its semantic purpose)
• Create new components, files, or wrapper elements
• Invent new class names or CSS variables I don't have
• Add unnecessary imports, dependencies, or code
• Change my HTML structure, logic, or text content
• Add/remove elements to match the reference (only style what I already have)
• Override my existing styling methodology with a different one

⚠️ If you can't find a matching component: ASK which file/component to apply to.

════════════════════════════════════════════════════════════════════
CAPTURED ELEMENT OVERVIEW (${elementStats.total} elements)
════════════════════════════════════════════════════════════════════
📐 Total Size: ${rootDims.width || '?'}px × ${rootDims.height || '?'}px
🎨 Background: ${rootStyles['background-color'] || 'transparent'}
📦 Display: ${rootStyles.display || 'block'}
${rootBorderRadius && rootBorderRadius !== '0px' && rootBorderRadius !== '0' ? `🔲 Border Radius: ${rootBorderRadius}` : ''}
${rootStyles['box-shadow'] && rootStyles['box-shadow'] !== 'none' ? `✨ Shadow: ${rootStyles['box-shadow']}` : ''}
${rootStyles.padding && rootStyles.padding !== '0px' ? `📏 Padding: ${rootStyles.padding}` : ''}
${rootClasses.length > 0 ? `📌 Classes: ${rootClasses.slice(0, 10).join(' ')}` : ''}
${viewportContext.rootFontSize ? `📝 Root font-size: ${viewportContext.rootFontSize}px` : ''}

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
• Widths: ${safeJoin((tokens.widths || []).slice(0, 15)) || 'auto'}
• Heights: ${safeJoin((tokens.heights || []).slice(0, 15)) || 'auto'}

════════════════════════════════════════════════════════════════════
DETAILED ELEMENT BREAKDOWN
════════════════════════════════════════════════════════════════════
${formatDetailedElementList(elements)}

════════════════════════════════════════════════════════════════════
HOW TO APPLY:
1. Identify MY component that matches this design's structure
2. Map each extracted element to MY existing selectors/classes
3. Update MY CSS values to match the EXACT pixel values shown
4. Keep my methodology: if I use Tailwind, update Tailwind classes; if CSS, update CSS
5. Preserve ALL my existing: text, labels, logic, event handlers, structure
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
        const rootComputed = data.tree.computed || {};
        const viewportContext = data.viewportContext || {};
        const rootClasses = data.tree.classNames || [];
        
        // Get border-radius from either kebab or camelCase
        const rootBorderRadius = rootStyles['border-radius'] || rootComputed.borderRadius || '0';
        
        return `TASK: Create a PIXEL-PERFECT replica of this design.

📎 NOTE: Use the attached screenshot as visual reference. Below are the EXACT CSS values extracted from the DOM.

════════════════════════════════════════════════════════════════════
ROOT CONTAINER - EXACT SPECIFICATIONS
════════════════════════════════════════════════════════════════════
📐 SIZE: ${rootDims.width || '?'}px × ${rootDims.height || '?'}px
📦 DISPLAY: ${rootStyles.display || 'block'}
🎨 BACKGROUND: ${rootStyles['background-color'] || 'transparent'}
📏 PADDING: ${rootStyles.padding || '0'}
🔲 BORDER-RADIUS: ${rootBorderRadius}
${rootStyles['box-shadow'] && rootStyles['box-shadow'] !== 'none' ? `✨ BOX-SHADOW: ${rootStyles['box-shadow']}` : ''}
${rootStyles['border-width'] && rootStyles['border-width'] !== '0px' ? `🔳 BORDER: ${rootStyles['border-width']} ${rootStyles['border-style'] || 'solid'} ${rootStyles['border-color'] || '#000'}` : ''}
${rootClasses.length > 0 ? `📌 CLASSES: ${rootClasses.slice(0, 10).join(' ')}` : ''}
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
════════════════════════════════════════════════════════════════════
${data.animationData && data.animationData.hasAnimations ? `
${formatAnimationData(data.animationData)}
${formatGeneratedAnimationCode(data.animationData)}
════════════════════════════════════════════════════════════════════
⚠️ ANIMATION REPLICATION NOTES:
• CSS animations can be replicated exactly using the keyframes shown
• Three.js scenes require manual asset loading (textures, models)
• GSAP timelines are provided as starter code - adjust targets as needed
• Canvas animations may need adaptation based on your implementation
• For complex 3D animations, the generated code provides a foundation
════════════════════════════════════════════════════════════════════` : ''}`;
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
    },

    // ==========================================
    // 5. REPLICATE ANIMATION - Animation-focused
    // ==========================================
    'replicate-animation': (data) => {
        if (!data || !data.tree) {
            return 'Error: No design data available. Please select an element.';
        }
        
        const animationData = data.animationData || {};
        const hasAnimations = animationData.hasAnimations;
        const rootDims = data.tree.dimensions || {};
        
        if (!hasAnimations) {
            return `⚠️ NO ANIMATIONS DETECTED

The selected element does not appear to have JavaScript-powered animations.

Checked for:
• CSS animations and transitions
• Three.js / WebGL scenes
• GSAP timelines and tweens
• Canvas animations
• Scroll-based animations (AOS, ScrollTrigger, etc.)
• Web Animations API

Tips:
• Make sure to select an element that contains animated content
• For canvas/WebGL animations, select the canvas element directly
• Some animations only trigger on user interaction - try hovering or scrolling first
• Animations may be using a library we don't yet support

If you believe there are animations present, try:
1. Refreshing the page and triggering the animation
2. Selecting a parent container of the animated element
3. Using browser dev tools to verify animation presence`;
        }
        
        const animationInfo = formatAnimationData(animationData);
        const generatedCode = formatGeneratedAnimationCode(animationData);
        const complexity = getAnimationComplexityDescription(animationData);
        
        return `TASK: Replicate the JavaScript-powered animations from this element.

📎 NOTE: Use the attached screenshot as visual reference.

════════════════════════════════════════════════════════════════════
ANIMATION OVERVIEW
════════════════════════════════════════════════════════════════════
📐 Element Size: ${rootDims.width || '?'}px × ${rootDims.height || '?'}px
🎬 ${complexity}

${animationInfo || 'No detailed animation info available.'}

${generatedCode || ''}

════════════════════════════════════════════════════════════════════
IMPLEMENTATION GUIDE
════════════════════════════════════════════════════════════════════

${animationData.animationTypes?.includes('threejs') ? `
### THREE.JS IMPLEMENTATION:
1. Install Three.js: \`npm install three\`
2. Import and use the generated scene setup code
3. Customize geometry, materials, and lighting as needed
4. Add your own animation logic in the animate() loop
5. Note: Original textures/models must be sourced separately
` : ''}

${animationData.animationTypes?.includes('gsap') ? `
### GSAP IMPLEMENTATION:
1. Install GSAP: \`npm install gsap\`
2. Import GSAP and any required plugins
3. Use the generated timeline code as a starting point
4. Adjust selectors to match your element structure
5. Fine-tune timing and easing to match the original
` : ''}

${animationData.animationTypes?.includes('css') ? `
### CSS ANIMATION IMPLEMENTATION:
1. Copy the @keyframes definitions to your CSS
2. Apply animation properties to target elements
3. Adjust timing-function if needed to match feel
4. Consider using CSS custom properties for reusability
` : ''}

${animationData.animationTypes?.includes('canvas') ? `
### CANVAS ANIMATION IMPLEMENTATION:
1. Create a canvas element with appropriate dimensions
2. Get the rendering context (2D or WebGL)
3. Use the generated setup code as a foundation
4. Implement your drawing/animation logic
5. Use requestAnimationFrame for smooth animation
` : ''}

${animationData.animationTypes?.includes('scroll') ? `
### SCROLL ANIMATION IMPLEMENTATION:
1. Install the detected library (GSAP ScrollTrigger, AOS, etc.)
2. Initialize the library on page load
3. Apply data attributes or configuration as shown
4. Test scroll positions and adjust triggers as needed
` : ''}

════════════════════════════════════════════════════════════════════
⚠️ IMPORTANT NOTES:
• Generated code provides a starting structure, not exact replication
• External assets (3D models, textures, fonts) must be sourced separately  
• Complex WebGL shaders cannot be automatically captured
• Animation timing may need manual adjustment
• Test across browsers for consistent behavior
════════════════════════════════════════════════════════════════════`;
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
    
    // Animation utilities
    formatAnimationData,
    formatGeneratedAnimationCode,
    getAnimationComplexityDescription,
    
    // Templates
    CORE_PROMPTS
};

console.log('[EnhancedPromptGenerator] Module loaded - v4.2 Pixel Perfect with Animation Support');
