// ============================================
// Smart Analyzer v1.0
// Context-aware style analysis and organization
// Captures everything, presents intelligently
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONSTANTS
    // ============================================

    // Universal default values that are almost never intentional
    const UNIVERSAL_DEFAULTS = {
        'opacity': ['1'],
        'visibility': ['visible'],
        'pointer-events': ['auto'],
        'cursor': ['auto'],
        'z-index': ['auto'],
        'transform': ['none', 'matrix(1, 0, 0, 1, 0, 0)'],
        'filter': ['none'],
        'mix-blend-mode': ['normal'],
        'overflow': ['visible'],
        'overflow-x': ['visible'],
        'overflow-y': ['visible'],
        'position': ['static'],
        'float': ['none'],
        'clear': ['none'],
        'clip': ['auto'],
        'resize': ['none'],
        'outline-style': ['none'],
        'outline-width': ['0px'],
        'text-decoration-line': ['none'],
        'text-decoration-style': ['solid'],
        'list-style-type': ['disc', 'none'],
        'list-style-position': ['outside'],
        'vertical-align': ['baseline'],
        'table-layout': ['auto'],
        'border-collapse': ['separate'],
        'empty-cells': ['show'],
        'caption-side': ['top'],
        'backface-visibility': ['visible'],
        'perspective': ['none'],
        'transform-style': ['flat'],
    };

    // Values that indicate "no styling" for color properties
    const TRANSPARENT_VALUES = [
        'rgba(0, 0, 0, 0)',
        'transparent',
        'initial',
        'inherit',
        'unset'
    ];

    // Properties grouped by visual impact
    const STYLE_CATEGORIES = {
        // High visual impact - these define the look
        visual: [
            'background-color', 'background-image', 'background',
            'color', 'border-color',
            'box-shadow', 'text-shadow',
            'opacity', 'filter', 'backdrop-filter'
        ],
        // Shape and borders
        shape: [
            'border-radius', 'border-width', 'border-style',
            'border-top-left-radius', 'border-top-right-radius',
            'border-bottom-left-radius', 'border-bottom-right-radius',
            'outline', 'outline-width', 'outline-style', 'outline-color'
        ],
        // Typography
        typography: [
            'font-family', 'font-size', 'font-weight', 'font-style',
            'line-height', 'letter-spacing', 'word-spacing',
            'text-align', 'text-transform', 'text-decoration',
            'white-space', 'text-overflow'
        ],
        // Spacing
        spacing: [
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'gap', 'row-gap', 'column-gap'
        ],
        // Layout
        layout: [
            'display', 'position', 'flex-direction', 'justify-content', 'align-items',
            'align-content', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
            'grid-template-columns', 'grid-template-rows', 'grid-gap'
        ],
        // Dimensions
        dimensions: [
            'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'
        ],
        // Positioning
        positioning: [
            'top', 'right', 'bottom', 'left', 'z-index'
        ],
        // Interactions
        interactions: [
            'cursor', 'pointer-events', 'user-select', 'transition', 'animation'
        ],
        // Animation properties
        animations: [
            'animation', 'animation-name', 'animation-duration', 'animation-timing-function',
            'animation-delay', 'animation-iteration-count', 'animation-direction',
            'animation-fill-mode', 'animation-play-state',
            'transition', 'transition-property', 'transition-duration',
            'transition-timing-function', 'transition-delay',
            'transform', 'transform-origin', 'transform-style',
            'perspective', 'perspective-origin', 'will-change'
        ]
    };

    // Animation library indicators
    const ANIMATION_INDICATORS = {
        css: ['animation', 'transition', '@keyframes'],
        transform: ['rotate', 'scale', 'translate', 'skew', 'matrix', '3d'],
        libraries: {
            gsap: ['gsap', 'TweenMax', 'TweenLite', 'TimelineMax', 'TimelineLite'],
            threejs: ['THREE', 'WebGLRenderer', 'Scene', 'PerspectiveCamera'],
            framer: ['framer', 'motion', 'AnimatePresence'],
            animejs: ['anime'],
            lottie: ['lottie', 'bodymovin']
        }
    };

    // ============================================
    // CONTEXT DETECTION
    // ============================================

    /**
     * Analyze what type of selection this is
     * Returns context that drives prompt strategy
     */
    function analyzeSelectionContext(tree, elementCount) {
        if (!tree) {
            return { type: 'unknown', strategy: 'fallback', confidence: 0 };
        }

        const depth = getTreeDepth(tree);
        const leafCount = countLeafElements(tree);
        const styledCount = countStyledElements(tree);
        const hasText = hasTextContent(tree);

        // Scoring for context detection
        let scores = {
            'single-element': 0,
            'component': 0,
            'section': 0,
            'page': 0
        };

        // Single element indicators
        if (elementCount === 1) scores['single-element'] += 10;
        if (leafCount <= 1 && depth <= 1) scores['single-element'] += 5;
        if (elementCount <= 3 && depth <= 2) scores['single-element'] += 3;

        // Component indicators (small, shallow, styled)
        if (elementCount >= 2 && elementCount <= 15) scores['component'] += 5;
        if (depth >= 2 && depth <= 5) scores['component'] += 3;
        if (styledCount >= 2 && styledCount <= 10) scores['component'] += 3;

        // Section indicators (medium size, has structure)
        if (elementCount > 15 && elementCount <= 60) scores['section'] += 5;
        if (depth >= 3 && depth <= 7) scores['section'] += 2;
        if (styledCount > 10) scores['section'] += 3;

        // Page indicators (large, deep)
        if (elementCount > 60) scores['page'] += 7;
        if (depth > 6) scores['page'] += 3;

        // Find highest scoring context
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const [topType, topScore] = sorted[0];
        const [secondType, secondScore] = sorted[1];

        // Confidence based on score difference
        const confidence = topScore > 0 ? Math.min((topScore - secondScore) / topScore + 0.5, 1) : 0.5;

        // Map context type to strategy
        const strategies = {
            'single-element': 'detailed',      // Show all styles for this one element
            'component': 'hierarchical',       // Root + key children
            'section': 'pattern-focused',      // Find patterns, summarize
            'page': 'token-extraction'         // Design system tokens
        };

        return {
            type: topType,
            strategy: strategies[topType] || 'fallback',
            confidence,
            metrics: {
                elementCount,
                depth,
                leafCount,
                styledCount,
                hasText
            },
            scores
        };
    }

    function getTreeDepth(node, current = 0) {
        if (!node || !node.children || node.children.length === 0) {
            return current;
        }
        return Math.max(...node.children.map(c => getTreeDepth(c, current + 1)));
    }

    function countLeafElements(node) {
        if (!node) return 0;
        if (!node.children || node.children.length === 0) return 1;
        return node.children.reduce((sum, child) => sum + countLeafElements(child), 0);
    }

    function countStyledElements(node, count = 0) {
        if (!node) return count;
        
        const significance = calculateVisualSignificance(node);
        if (significance.score >= 2) count++;
        
        for (const child of (node.children || [])) {
            count = countStyledElements(child, count);
        }
        return count;
    }

    function hasTextContent(node) {
        if (!node) return false;
        if (node.textContent && node.textContent.trim().length > 0) return true;
        return (node.children || []).some(child => hasTextContent(child));
    }

    // ============================================
    // VISUAL SIGNIFICANCE SCORING
    // ============================================

    /**
     * Calculate how "visually significant" an element is
     * Higher score = more important to capture accurately
     */
    function calculateVisualSignificance(node) {
        if (!node) return { score: 0, signals: [], isSignificant: false };

        const styles = node.styles || {};
        let score = 0;
        const signals = [];

        // Background styling (high signal - 3 points)
        if (hasNonDefaultBackground(styles)) {
            score += 3;
            signals.push('background');
        }

        // Shadow (elevation signal - 2 points)
        if (styles['box-shadow'] && styles['box-shadow'] !== 'none') {
            score += 2;
            signals.push('shadow');
        }

        // Border styling (2 points)
        if (hasVisibleBorder(styles)) {
            score += 2;
            signals.push('border');
        }

        // Border radius (1 point)
        if (hasNonZeroRadius(styles)) {
            score += 1;
            signals.push('rounded');
        }

        // Custom typography (1 point)
        if (hasCustomTypography(styles)) {
            score += 1;
            signals.push('typography');
        }

        // Non-default text color (1 point)
        if (styles.color && !isBlackOrInherit(styles.color)) {
            score += 1;
            signals.push('text-color');
        }

        // Layout definition (1 point)
        if (styles.display === 'flex' || styles.display === 'grid') {
            score += 1;
            signals.push('layout');
        }

        // Has explicit gap (1 point)
        if (styles.gap && styles.gap !== '0px' && styles.gap !== 'normal') {
            score += 1;
            signals.push('gap');
        }

        // Animation/transition (2 points - indicates interactivity)
        if (hasAnimation(styles)) {
            score += 2;
            signals.push('animation');
        }
        if (hasTransition(styles)) {
            score += 1;
            signals.push('transition');
        }

        // Transform (1 point - often indicates animation state)
        if (styles.transform && styles.transform !== 'none' && 
            styles.transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
            score += 1;
            signals.push('transform');
        }

        // Canvas element (3 points - high significance for animation)
        if (node.tag === 'canvas') {
            score += 3;
            signals.push('canvas');
        }

        return {
            score,
            signals,
            isSignificant: score >= 2
        };
    }

    function hasAnimation(styles) {
        const animation = styles.animation || styles['animation-name'];
        return animation && animation !== 'none' && 
               animation !== 'none 0s ease 0s 1 normal none running';
    }

    function hasTransition(styles) {
        const transition = styles.transition || styles['transition-property'];
        return transition && transition !== 'none' && 
               transition !== 'all 0s ease 0s';
    }

    function hasNonDefaultBackground(styles) {
        const bg = styles['background-color'];
        const bgImage = styles['background-image'];
        
        // Has gradient or image
        if (bgImage && bgImage !== 'none') return true;
        
        // Has solid color (not transparent)
        if (bg && !TRANSPARENT_VALUES.includes(bg)) return true;
        
        return false;
    }

    function hasVisibleBorder(styles) {
        const width = styles['border-width'];
        const style = styles['border-style'];
        
        if (!width || width === '0px') return false;
        if (!style || style === 'none') return false;
        
        return true;
    }

    function hasNonZeroRadius(styles) {
        const radius = styles['border-radius'];
        if (!radius) return false;
        if (radius === '0' || radius === '0px' || radius === '0px 0px 0px 0px') return false;
        return true;
    }

    function hasCustomTypography(styles) {
        // Non-default font weight
        if (styles['font-weight'] && !['400', 'normal'].includes(styles['font-weight'])) {
            return true;
        }
        // Non-normal letter spacing
        if (styles['letter-spacing'] && styles['letter-spacing'] !== 'normal') {
            return true;
        }
        // Text transform
        if (styles['text-transform'] && styles['text-transform'] !== 'none') {
            return true;
        }
        return false;
    }

    function isBlackOrInherit(color) {
        if (!color) return true;
        return [
            'rgb(0, 0, 0)',
            'rgba(0, 0, 0, 1)',
            '#000',
            '#000000',
            'black',
            'inherit',
            'initial'
        ].includes(color);
    }

    // ============================================
    // STYLE ORGANIZATION
    // ============================================

    /**
     * Organize styles by priority/relevance
     * KEEPS everything, just categorizes it
     */
    function organizeStyles(node, context) {
        const styles = node.styles || {};
        const significance = calculateVisualSignificance(node);
        
        const organized = {
            // Primary: visually impactful, non-default
            primary: {},
            // Secondary: structural (layout, spacing)
            secondary: {},
            // Tertiary: everything else
            tertiary: {},
            // Metadata
            meta: {
                significance,
                tag: node.tag,
                role: node.role,
                dimensions: node.dimensions,
                hasChildren: (node.children || []).length > 0
            }
        };

        for (const [prop, value] of Object.entries(styles)) {
            // Skip truly meaningless defaults
            if (isUniversalDefault(prop, value)) {
                continue; // Don't even include in tertiary
            }

            const category = getPropertyCategory(prop);
            const isDefault = isLikelyDefault(prop, value);
            const isImpactful = ['visual', 'shape'].includes(category);
            const isStructural = ['spacing', 'layout'].includes(category);

            // Prioritization logic
            if (isImpactful && !isDefault) {
                organized.primary[prop] = value;
            } else if (isStructural || (isImpactful && isDefault)) {
                organized.secondary[prop] = value;
            } else if (!isDefault) {
                organized.tertiary[prop] = value;
            } else {
                // Default non-impactful values - still keep in tertiary
                organized.tertiary[prop] = value;
            }
        }

        return organized;
    }

    function getPropertyCategory(prop) {
        for (const [category, props] of Object.entries(STYLE_CATEGORIES)) {
            if (props.includes(prop)) return category;
        }
        return 'other';
    }

    function isUniversalDefault(prop, value) {
        const defaults = UNIVERSAL_DEFAULTS[prop];
        return defaults && defaults.includes(value);
    }

    function isLikelyDefault(prop, value) {
        if (!value) return true;
        
        // Transparent colors
        if (TRANSPARENT_VALUES.includes(value)) return true;
        
        // Common defaults
        const defaults = {
            'font-weight': ['400', 'normal'],
            'font-style': ['normal'],
            'text-align': ['start', 'left'],
            'text-decoration': ['none'],
            'text-transform': ['none'],
            'letter-spacing': ['normal'],
            'word-spacing': ['normal'],
            'line-height': ['normal'],
            'border-style': ['none'],
            'border-width': ['0px', '0'],
            'box-shadow': ['none'],
            'background-image': ['none'],
            'display': ['block', 'inline'],
            'flex-direction': ['row'],
            'flex-wrap': ['nowrap'],
            'justify-content': ['normal', 'flex-start'],
            'align-items': ['normal', 'stretch'],
        };
        
        return defaults[prop]?.includes(value) || false;
    }

    // ============================================
    // PATTERN DETECTION
    // ============================================

    /**
     * Find patterns by analyzing value repetition
     * Repeated values = design tokens
     */
    function extractPatterns(tree) {
        const valueCounts = {
            colors: {},
            fontSizes: {},
            fontWeights: {},
            fontFamilies: {},
            spacing: {},
            radii: {},
            shadows: {}
        };

        // Walk tree and count occurrences
        walkTree(tree, (node) => {
            const styles = node.styles || {};

            // Colors
            ['color', 'background-color', 'border-color'].forEach(prop => {
                const val = styles[prop];
                if (val && !TRANSPARENT_VALUES.includes(val)) {
                    valueCounts.colors[val] = (valueCounts.colors[val] || 0) + 1;
                }
            });

            // Typography
            if (styles['font-size']) {
                valueCounts.fontSizes[styles['font-size']] = 
                    (valueCounts.fontSizes[styles['font-size']] || 0) + 1;
            }
            if (styles['font-weight'] && styles['font-weight'] !== '400') {
                valueCounts.fontWeights[styles['font-weight']] = 
                    (valueCounts.fontWeights[styles['font-weight']] || 0) + 1;
            }
            if (styles['font-family']) {
                const family = styles['font-family'].split(',')[0].trim().replace(/['"]/g, '');
                valueCounts.fontFamilies[family] = (valueCounts.fontFamilies[family] || 0) + 1;
            }

            // Spacing
            ['padding', 'margin', 'gap'].forEach(prop => {
                const val = styles[prop];
                if (val && val !== '0px' && val !== '0') {
                    extractSpacingValues(val).forEach(v => {
                        valueCounts.spacing[v] = (valueCounts.spacing[v] || 0) + 1;
                    });
                }
            });

            // Border radius
            if (styles['border-radius'] && styles['border-radius'] !== '0px') {
                valueCounts.radii[styles['border-radius']] = 
                    (valueCounts.radii[styles['border-radius']] || 0) + 1;
            }

            // Shadows
            if (styles['box-shadow'] && styles['box-shadow'] !== 'none') {
                valueCounts.shadows[styles['box-shadow']] = 
                    (valueCounts.shadows[styles['box-shadow']] || 0) + 1;
            }
        });

        return {
            colors: categorizeByFrequency(valueCounts.colors),
            fontSizes: categorizeByFrequency(valueCounts.fontSizes),
            fontWeights: categorizeByFrequency(valueCounts.fontWeights),
            fontFamilies: categorizeByFrequency(valueCounts.fontFamilies),
            spacing: analyzeSpacingScale(valueCounts.spacing),
            radii: categorizeByFrequency(valueCounts.radii),
            shadows: categorizeByFrequency(valueCounts.shadows)
        };
    }

    function walkTree(node, callback) {
        if (!node) return;
        callback(node);
        for (const child of (node.children || [])) {
            walkTree(child, callback);
        }
    }

    function extractSpacingValues(value) {
        if (!value || typeof value !== 'string') return [];
        const matches = value.match(/\d+(\.\d+)?(px|rem|em|%)/g);
        return matches || [];
    }

    function categorizeByFrequency(counts) {
        const entries = Object.entries(counts);
        if (entries.length === 0) {
            return { tokens: [], repeated: [], unique: [], all: [] };
        }

        return {
            // Used 3+ times = definitely a design token
            tokens: entries.filter(([, count]) => count >= 3)
                          .sort((a, b) => b[1] - a[1])
                          .map(([val]) => val),
            // Used 2 times = probably intentional
            repeated: entries.filter(([, count]) => count === 2)
                            .map(([val]) => val),
            // Used once = specific to that element
            unique: entries.filter(([, count]) => count === 1)
                          .map(([val]) => val),
            // All values for reference
            all: entries.sort((a, b) => b[1] - a[1]).map(([val]) => val)
        };
    }

    function analyzeSpacingScale(counts) {
        const base = categorizeByFrequency(counts);
        
        // Try to detect scale base (4px, 8px, etc.)
        const allValues = Object.keys(counts)
            .map(v => parseInt(v))
            .filter(v => !isNaN(v))
            .sort((a, b) => a - b);

        let detectedBase = null;
        for (const testBase of [4, 8, 5, 6, 10]) {
            const fitsScale = allValues.filter(v => v > 0).every(v => v % testBase === 0);
            if (fitsScale && allValues.length >= 3) {
                detectedBase = testBase;
                break;
            }
        }

        return {
            ...base,
            scale: detectedBase ? `${detectedBase}px base` : null,
            values: allValues
        };
    }

    // ============================================
    // SIGNIFICANT ELEMENTS FINDER
    // ============================================

    /**
     * Find the most visually significant elements in the tree
     * For component/section views
     */
    function findSignificantElements(tree, maxCount = 8) {
        const elements = [];

        walkTree(tree, (node) => {
            const significance = calculateVisualSignificance(node);
            if (significance.isSignificant) {
                elements.push({
                    node,
                    significance,
                    organized: organizeStyles(node)
                });
            }
        });

        // Sort by significance score, return top N
        return elements
            .sort((a, b) => b.significance.score - a.significance.score)
            .slice(0, maxCount);
    }

    // ============================================
    // MAIN ANALYSIS FUNCTION
    // ============================================

    /**
     * Main entry point - analyze design data
     * Returns organized, prioritized data for prompt generation
     */
    function analyzeDesignData(data) {
        if (!data || !data.tree) {
            return {
                error: 'No design data available',
                context: { type: 'unknown', strategy: 'fallback' }
            };
        }

        const context = analyzeSelectionContext(data.tree, data.elementCount || 1);
        const patterns = extractPatterns(data.tree);
        const rootOrganized = organizeStyles(data.tree, context);
        const significantElements = findSignificantElements(data.tree);
        const animationAnalysis = analyzeAnimations(data);

        // Build analysis result
        return {
            context,
            patterns,
            root: {
                ...rootOrganized,
                dimensions: data.tree.dimensions,
                tag: data.tree.tag,
                role: data.tree.role
            },
            significantElements,
            animations: animationAnalysis,
            // Pass through original data
            originalTree: data.tree,
            globalCSS: data.globalCSS,
            viewportContext: data.viewportContext,
            elementCount: data.elementCount,
            animationData: data.animationData
        };
    }

    /**
     * Analyze animation data and provide recommendations
     */
    function analyzeAnimations(data) {
        const animationData = data.animationData;
        const tree = data.tree;
        
        const analysis = {
            hasAnimations: false,
            complexity: 'none',
            types: [],
            libraries: [],
            cssAnimations: [],
            recommendations: []
        };
        
        // Check for animations from animationData
        if (animationData && animationData.hasAnimations) {
            analysis.hasAnimations = true;
            analysis.complexity = animationData.metadata?.complexity || 'unknown';
            analysis.types = animationData.animationTypes || [];
            analysis.libraries = (animationData.detectedLibraries || []).map(lib => lib.name);
            
            // Add recommendations based on detected animations
            if (animationData.animationTypes?.includes('threejs')) {
                analysis.recommendations.push({
                    type: 'threejs',
                    priority: 'high',
                    message: 'Three.js scene detected. Generated code provides basic setup. You will need to source textures/models separately.',
                    action: 'Use the generated Three.js code as a starting point'
                });
            }
            
            if (animationData.animationTypes?.includes('gsap')) {
                analysis.recommendations.push({
                    type: 'gsap',
                    priority: 'high',
                    message: 'GSAP animations detected. Timeline structure has been captured.',
                    action: 'Install GSAP and use the generated timeline code'
                });
            }
            
            if (animationData.animationTypes?.includes('css')) {
                analysis.recommendations.push({
                    type: 'css',
                    priority: 'medium',
                    message: 'CSS animations detected. These can be replicated exactly.',
                    action: 'Copy the animation properties and @keyframes rules'
                });
            }
            
            if (animationData.animationTypes?.includes('canvas') || 
                animationData.animationTypes?.includes('webgl')) {
                analysis.recommendations.push({
                    type: 'canvas',
                    priority: 'medium',
                    message: 'Canvas/WebGL animation detected. Full replication requires understanding the drawing logic.',
                    action: 'Use generated code as a foundation; customize as needed'
                });
            }
            
            if (animationData.animationTypes?.includes('scroll')) {
                analysis.recommendations.push({
                    type: 'scroll',
                    priority: 'medium',
                    message: 'Scroll-based animations detected.',
                    action: 'Configure the same scroll trigger settings with your preferred library'
                });
            }
        }
        
        // Also scan tree for CSS animation properties
        const cssAnimFromTree = scanTreeForCSSAnimations(tree);
        if (cssAnimFromTree.length > 0) {
            analysis.hasAnimations = true;
            analysis.cssAnimations = cssAnimFromTree;
            if (!analysis.types.includes('css')) {
                analysis.types.push('css');
            }
        }
        
        return analysis;
    }

    /**
     * Scan tree for CSS animation/transition properties
     */
    function scanTreeForCSSAnimations(node, found = []) {
        if (!node) return found;
        
        const styles = node.styles || {};
        
        // Check for animation
        if (hasAnimation(styles)) {
            found.push({
                element: node.tag + (node.classNames?.[0] ? '.' + node.classNames[0] : ''),
                animation: styles.animation || styles['animation-name'],
                duration: styles['animation-duration'],
                timingFunction: styles['animation-timing-function']
            });
        }
        
        // Check for transition
        if (hasTransition(styles)) {
            found.push({
                element: node.tag + (node.classNames?.[0] ? '.' + node.classNames[0] : ''),
                transition: styles.transition,
                property: styles['transition-property'],
                duration: styles['transition-duration']
            });
        }
        
        // Recurse
        for (const child of node.children || []) {
            scanTreeForCSSAnimations(child, found);
        }
        
        return found;
    }

    // ============================================
    // EXPORTS
    // ============================================

    window.SmartAnalyzer = {
        // Main analysis
        analyzeDesignData,
        analyzeSelectionContext,

        // Significance
        calculateVisualSignificance,
        findSignificantElements,

        // Organization
        organizeStyles,
        getPropertyCategory,

        // Patterns
        extractPatterns,
        categorizeByFrequency,

        // Animation analysis
        analyzeAnimations,
        scanTreeForCSSAnimations,
        hasAnimation,
        hasTransition,

        // Utilities
        walkTree,
        isLikelyDefault,
        isUniversalDefault,
        hasNonDefaultBackground,
        hasVisibleBorder,
        hasNonZeroRadius,
        hasCustomTypography,
        
        // Constants
        ANIMATION_INDICATORS
    };

    console.log('[SmartAnalyzer] Module loaded - v1.1 with Animation Support');
})();

