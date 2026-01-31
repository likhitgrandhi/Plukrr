// ============================================
// Design Analyzer
// Pre-processes design data for Gemini analysis
// Extracts insights, detects patterns, categorizes tokens
// ============================================

// ============================================
// DESIGN TOKEN EXTRACTION
// ============================================

function collectColors(node, colors = new Set()) {
    if (!node) return colors;
    const styles = node.styles || {};
    if (styles['color']) colors.add(styles['color']);
    if (styles['background-color'] && styles['background-color'] !== 'rgba(0, 0, 0, 0)') {
        colors.add(styles['background-color']);
    }
    if (styles['border-color'] && styles['border-color'] !== 'rgb(0, 0, 0)') {
        colors.add(styles['border-color']);
    }
    (node.children || []).forEach(child => collectColors(child, colors));
    return colors;
}

function collectTypography(node, typo = { sizes: new Set(), weights: new Set(), families: new Set() }) {
    if (!node) return typo;
    const s = node.styles || {};
    if (s['font-size']) typo.sizes.add(s['font-size']);
    if (s['font-weight']) typo.weights.add(s['font-weight']);
    if (s['font-family']) typo.families.add(s['font-family'].split(',')[0].trim().replace(/"/g, ''));
    (node.children || []).forEach(child => collectTypography(child, typo));
    return typo;
}

function collectSpacing(node, spacing = new Set()) {
    if (!node) return spacing;
    const s = node.styles || {};
    ['padding', 'margin', 'gap'].forEach(prop => {
        if (s[prop] && s[prop] !== '0px') {
            const matches = s[prop].match(/\d+px/g);
            if (matches) matches.forEach(m => spacing.add(m));
        }
    });
    (node.children || []).forEach(child => collectSpacing(child, spacing));
    return spacing;
}

function collectBorderRadius(node, radii = new Set()) {
    if (!node) return radii;
    const r = node.styles?.['border-radius'];
    if (r && r !== '0px') radii.add(r);
    (node.children || []).forEach(child => collectBorderRadius(child, radii));
    return radii;
}

function collectShadows(node, shadows = new Set()) {
    if (!node) return shadows;
    const s = node.styles?.['box-shadow'];
    if (s && s !== 'none') shadows.add(s);
    (node.children || []).forEach(child => collectShadows(child, shadows));
    return shadows;
}

// Extract all design tokens from tree
function extractDesignTokens(data) {
    const tree = data.tree;
    
    // From deep scan if available
    if (data.isDeepScan && data.deepScanData?.designTokens) {
        const dt = data.deepScanData.designTokens;
        return {
            colors: dt.colors || [],
            typo: {
                sizes: new Set(dt.fontSizes || []),
                weights: new Set(dt.fontWeights || []),
                families: new Set(dt.fontFamilies || [])
            },
            spacing: dt.spacing || [],
            radii: dt.borderRadii || [],
            shadows: dt.shadows || []
        };
    }
    
    // From element tree
    return {
        colors: Array.from(collectColors(tree)),
        typo: collectTypography(tree),
        spacing: Array.from(collectSpacing(tree)).sort((a, b) => parseInt(a) - parseInt(b)),
        radii: Array.from(collectBorderRadius(tree)),
        shadows: Array.from(collectShadows(tree))
    };
}

// ============================================
// COMPLEXITY ANALYSIS
// ============================================

function detectComponentComplexity(data) {
    const elementCount = data.elementCount || 1;
    const tree = data.tree;
    
    // Calculate depth
    function getDepth(node, current = 0) {
        if (!node || !node.children || node.children.length === 0) return current;
        return Math.max(...node.children.map(c => getDepth(c, current + 1)));
    }
    
    const depth = getDepth(tree);
    const hasDeepScan = data.isDeepScan;
    
    // Complexity scoring
    let score = 0;
    
    // Element count contribution
    if (elementCount > 20) score += 3;
    else if (elementCount > 10) score += 2;
    else if (elementCount > 5) score += 1;
    
    // Depth contribution
    if (depth > 5) score += 2;
    else if (depth > 3) score += 1;
    
    // Deep scan indicates full page complexity
    if (hasDeepScan) score += 2;
    
    // Determine complexity level
    let level = 'simple';
    if (score >= 5) level = 'complex';
    else if (score >= 2) level = 'moderate';
    
    return {
        level,
        score,
        elementCount,
        depth,
        isDeepScan: hasDeepScan
    };
}

// ============================================
// PATTERN DETECTION
// ============================================

function identifyVisualPatterns(data) {
    const patterns = [];
    const tokens = extractDesignTokens(data);
    const tree = data.tree;
    
    // Color patterns
    const colors = tokens.colors;
    if (colors.length > 0) {
        // Check for gradient usage
        const hasGradients = colors.some(c => c.includes('gradient') || c.includes('linear') || c.includes('radial'));
        if (hasGradients) patterns.push('gradient');
        
        // Check for transparency
        const hasTransparency = colors.some(c => c.includes('rgba') && !c.includes('rgba(0, 0, 0, 0)'));
        if (hasTransparency) patterns.push('transparency');
        
        // Monochrome detection
        const uniqueHues = new Set();
        colors.forEach(c => {
            const match = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                const [, r, g, b] = match.map(Number);
                if (r === g && g === b) uniqueHues.add('gray');
                else uniqueHues.add(`${Math.round(r/50)}-${Math.round(g/50)}-${Math.round(b/50)}`);
            }
        });
        if (uniqueHues.size <= 2) patterns.push('monochrome');
        else if (uniqueHues.size > 5) patterns.push('colorful');
    }
    
    // Shadow patterns
    if (tokens.shadows.length > 0) {
        const shadowStr = tokens.shadows.join(' ');
        if (shadowStr.includes('inset')) patterns.push('inset-shadows');
        if (tokens.shadows.length > 2) patterns.push('layered-shadows');
        else patterns.push('subtle-shadows');
    }
    
    // Border radius patterns
    const radii = tokens.radii;
    if (radii.length > 0) {
        const maxRadius = Math.max(...radii.map(r => parseInt(r) || 0));
        if (maxRadius >= 50) patterns.push('pill-shapes');
        else if (maxRadius >= 12) patterns.push('rounded');
        else if (maxRadius > 0) patterns.push('subtle-rounding');
    }
    
    // Typography patterns
    const typo = tokens.typo;
    if (typo.families.size > 2) patterns.push('multi-font');
    if (typo.weights.size > 3) patterns.push('weight-variety');
    
    // Spacing patterns
    const spacing = tokens.spacing;
    if (spacing.length > 0) {
        const values = spacing.map(s => parseInt(s));
        const hasConsistentScale = values.every((v, i) => i === 0 || v % 4 === 0 || v % 8 === 0);
        if (hasConsistentScale) patterns.push('consistent-spacing');
    }
    
    // Layout patterns from tree
    function checkLayoutPatterns(node) {
        if (!node) return;
        const styles = node.styles || {};
        
        if (styles.display === 'flex') patterns.push('flexbox');
        if (styles.display === 'grid') patterns.push('grid');
        if (styles['gap'] && styles['gap'] !== '0px') patterns.push('gap-based');
        
        (node.children || []).forEach(checkLayoutPatterns);
    }
    checkLayoutPatterns(tree);
    
    // Remove duplicates
    return [...new Set(patterns)];
}

function detectDesignSystem(data) {
    const tokens = extractDesignTokens(data);
    const patterns = identifyVisualPatterns(data);
    const cssVars = data.globalCSS?.rootVariables || {};
    
    // Check for known design systems
    const indicators = {
        material: 0,
        ios: 0,
        tailwind: 0,
        bootstrap: 0,
        shadcn: 0,
        custom: 0
    };
    
    // CSS variable patterns
    const varNames = Object.keys(cssVars).join(' ').toLowerCase();
    
    if (varNames.includes('--md-') || varNames.includes('--mdc-')) indicators.material += 3;
    if (varNames.includes('--tw-') || varNames.includes('--ring')) indicators.tailwind += 3;
    if (varNames.includes('--bs-')) indicators.bootstrap += 3;
    if (varNames.includes('--radius') && varNames.includes('--primary') && varNames.includes('--card')) indicators.shadcn += 3;
    
    // Visual patterns
    const radii = tokens.radii;
    const shadows = tokens.shadows;
    
    // Material Design indicators
    if (patterns.includes('layered-shadows')) indicators.material += 1;
    if (radii.some(r => r === '4px' || r === '8px')) indicators.material += 1;
    
    // iOS indicators
    if (patterns.includes('subtle-shadows') && patterns.includes('rounded')) indicators.ios += 2;
    if (shadows.some(s => s.includes('rgba(0, 0, 0, 0.1)') || s.includes('rgba(0, 0, 0, 0.05)'))) indicators.ios += 1;
    
    // Tailwind indicators
    if (patterns.includes('consistent-spacing')) indicators.tailwind += 1;
    const spacingValues = tokens.spacing.map(s => parseInt(s));
    if (spacingValues.every(v => v % 4 === 0)) indicators.tailwind += 2;
    
    // Bootstrap indicators
    if (radii.some(r => r === '0.375rem' || r === '0.25rem')) indicators.bootstrap += 2;
    
    // Find highest scoring system
    const sorted = Object.entries(indicators).sort((a, b) => b[1] - a[1]);
    const [topSystem, topScore] = sorted[0];
    
    // Only report if confident
    if (topScore >= 3) {
        return { system: topSystem, confidence: Math.min(topScore / 5, 1) };
    }
    
    return { system: 'custom', confidence: 0.5 };
}

// ============================================
// COMPONENT CATEGORIZATION
// ============================================

function categorizeComponent(data) {
    const tree = data.tree;
    if (!tree) return { category: 'unknown', subCategory: null };
    
    const tag = (tree.tag || '').toLowerCase();
    const role = (tree.role || '').toLowerCase();
    const classes = (tree.selector || '').toLowerCase();
    const styles = tree.styles || {};
    
    // Primary categorization
    const categories = {
        button: ['button', 'btn', 'trigger', 'submit'],
        card: ['card', 'panel', 'tile', 'box', 'container'],
        form: ['form', 'input', 'field', 'textarea', 'select'],
        navigation: ['nav', 'menu', 'header', 'footer', 'sidebar'],
        list: ['list', 'ul', 'ol', 'menu'],
        media: ['img', 'image', 'video', 'audio', 'media'],
        modal: ['modal', 'dialog', 'popup', 'overlay'],
        badge: ['badge', 'tag', 'chip', 'label', 'pill'],
        avatar: ['avatar', 'profile', 'user-image'],
        table: ['table', 'grid', 'data'],
        text: ['heading', 'paragraph', 'text', 'h1', 'h2', 'h3', 'p', 'span']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(kw => tag.includes(kw) || role.includes(kw) || classes.includes(kw))) {
            return { category, subCategory: detectSubCategory(category, tree) };
        }
    }
    
    // Fallback based on styles
    if (styles.display === 'flex' || styles.display === 'grid') {
        return { category: 'layout', subCategory: styles.display };
    }
    
    return { category: 'generic', subCategory: null };
}

function detectSubCategory(category, tree) {
    const styles = tree.styles || {};
    const role = (tree.role || '').toLowerCase();
    
    switch (category) {
        case 'button':
            if (role.includes('primary') || styles['background-color']?.includes('rgb')) return 'primary';
            if (styles['background-color'] === 'transparent' || styles['background-color'] === 'rgba(0, 0, 0, 0)') return 'ghost';
            if (styles['border-width'] && styles['border-width'] !== '0px') return 'outlined';
            return 'default';
            
        case 'card':
            if (styles['box-shadow'] && styles['box-shadow'] !== 'none') return 'elevated';
            if (styles['border-width'] && styles['border-width'] !== '0px') return 'bordered';
            return 'flat';
            
        case 'form':
            if (tree.tag === 'textarea') return 'textarea';
            if (tree.tag === 'select') return 'select';
            if (role.includes('checkbox')) return 'checkbox';
            if (role.includes('radio')) return 'radio';
            return 'input';
            
        default:
            return null;
    }
}

// ============================================
// COLOR SCHEME ANALYSIS
// ============================================

function analyzeColorScheme(colors) {
    if (!colors || colors.length === 0) return { scheme: 'unknown', dominant: null };
    
    let lightCount = 0;
    let darkCount = 0;
    let colorfulCount = 0;
    let dominant = null;
    let maxOccurrence = 0;
    
    const colorCounts = {};
    
    colors.forEach(color => {
        // Count occurrences
        colorCounts[color] = (colorCounts[color] || 0) + 1;
        if (colorCounts[color] > maxOccurrence) {
            maxOccurrence = colorCounts[color];
            dominant = color;
        }
        
        // Parse RGB
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            const [, r, g, b] = rgbMatch.map(Number);
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            
            if (luminance > 0.7) lightCount++;
            else if (luminance < 0.3) darkCount++;
            
            // Check if colorful (not grayscale)
            if (Math.abs(r - g) > 20 || Math.abs(g - b) > 20 || Math.abs(r - b) > 20) {
                colorfulCount++;
            }
        }
    });
    
    // Determine scheme
    let scheme = 'mixed';
    if (lightCount > colors.length * 0.6) scheme = 'light';
    else if (darkCount > colors.length * 0.6) scheme = 'dark';
    else if (colorfulCount > colors.length * 0.5) scheme = 'colorful';
    else if (colorfulCount < colors.length * 0.2) scheme = 'monochrome';
    
    return { scheme, dominant };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

function analyzeDesign(data) {
    const tokens = extractDesignTokens(data);
    const complexity = detectComponentComplexity(data);
    const patterns = identifyVisualPatterns(data);
    const designSystem = detectDesignSystem(data);
    const component = categorizeComponent(data);
    const colorScheme = analyzeColorScheme(tokens.colors);
    
    // Build insights summary
    const insights = {
        summary: buildInsightsSummary(data, complexity, patterns, component),
        recommendations: generateRecommendations(complexity, patterns, component, designSystem)
    };
    
    return {
        tokens,
        complexity,
        patterns,
        designSystem,
        component,
        colorScheme,
        insights
    };
}

function buildInsightsSummary(data, complexity, patterns, component) {
    const parts = [];
    
    // Component description
    if (component.category !== 'unknown') {
        parts.push(`${component.category}${component.subCategory ? ` (${component.subCategory})` : ''}`);
    }
    
    // Complexity
    parts.push(`${complexity.level} complexity (${complexity.elementCount} elements)`);
    
    // Key patterns
    if (patterns.length > 0) {
        parts.push(`patterns: ${patterns.slice(0, 3).join(', ')}`);
    }
    
    return parts.join(' | ');
}

function generateRecommendations(complexity, patterns, component, designSystem) {
    const recs = [];
    
    // Complexity-based recommendations
    if (complexity.level === 'complex') {
        recs.push('Use structured prompt with clear sections for each component part');
        recs.push('Consider breaking into smaller components');
    } else if (complexity.level === 'simple') {
        recs.push('Use concise, direct styling instructions');
    }
    
    // Pattern-based recommendations
    if (patterns.includes('gradient')) {
        recs.push('Include exact gradient values - these are often hard to replicate');
    }
    if (patterns.includes('layered-shadows')) {
        recs.push('Multiple shadows detected - provide all shadow values explicitly');
    }
    if (patterns.includes('consistent-spacing')) {
        recs.push('Consistent spacing scale detected - reference spacing tokens');
    }
    
    // Design system recommendations
    if (designSystem.system !== 'custom' && designSystem.confidence > 0.5) {
        recs.push(`Appears to use ${designSystem.system} patterns - reference accordingly`);
    }
    
    // Component-specific recommendations
    if (component.category === 'button') {
        recs.push('Include hover and active states if visible in design');
    }
    if (component.category === 'form') {
        recs.push('Include focus states and validation styling');
    }
    if (component.category === 'card') {
        recs.push('Pay attention to internal spacing and shadow depth');
    }
    
    return recs;
}

// ============================================
// PREPARE DATA FOR GEMINI
// ============================================

function prepareForGemini(data) {
    const analysis = analyzeDesign(data);
    
    // Add analysis to data
    return {
        ...data,
        analysisData: analysis
    };
}

// ============================================
// EXPORTS
// ============================================

window.DesignAnalyzer = {
    // Token extraction
    extractDesignTokens,
    collectColors,
    collectTypography,
    collectSpacing,
    collectBorderRadius,
    collectShadows,
    
    // Analysis
    analyzeDesign,
    detectComponentComplexity,
    identifyVisualPatterns,
    detectDesignSystem,
    categorizeComponent,
    analyzeColorScheme,
    
    // Preparation
    prepareForGemini
};

