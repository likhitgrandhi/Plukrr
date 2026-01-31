// ============================================
// Component Detector
// Maps extracted design elements to shadcn components
// ============================================

// ============================================
// COMPONENT DETECTION PATTERNS
// ============================================

const COMPONENT_PATTERNS = {
    // Interactive Components
    button: {
        tags: ['button', 'a'],
        roles: ['button', 'link'],
        classHints: ['btn', 'button', 'cta', 'action', 'submit'],
        styleHints: {
            cursor: 'pointer',
            padding: true,
            borderRadius: true,
            backgroundColor: true
        },
        priority: 10
    },
    
    // Form Components
    input: {
        tags: ['input'],
        roles: ['textbox', 'searchbox'],
        classHints: ['input', 'field', 'text-input'],
        styleHints: {
            border: true,
            padding: true
        },
        excludeTypes: ['checkbox', 'radio', 'submit', 'button'],
        priority: 8
    },
    
    textarea: {
        tags: ['textarea'],
        roles: ['textbox'],
        classHints: ['textarea', 'text-area'],
        styleHints: {
            border: true,
            padding: true,
            minHeight: true
        },
        priority: 8
    },
    
    select: {
        tags: ['select'],
        roles: ['combobox', 'listbox'],
        classHints: ['select', 'dropdown', 'picker'],
        priority: 8
    },
    
    checkbox: {
        tags: ['input'],
        roles: ['checkbox'],
        classHints: ['checkbox', 'check'],
        inputTypes: ['checkbox'],
        priority: 7
    },
    
    switch: {
        tags: ['input', 'button'],
        roles: ['switch'],
        classHints: ['switch', 'toggle'],
        styleHints: {
            borderRadius: '9999px'
        },
        priority: 7
    },
    
    label: {
        tags: ['label'],
        roles: ['label'],
        classHints: ['label', 'form-label'],
        priority: 3
    },
    
    // Layout Components
    card: {
        tags: ['div', 'article', 'section'],
        classHints: ['card', 'panel', 'tile', 'box', 'pricing', 'feature'],
        styleHints: {
            boxShadow: true,
            borderRadius: true,
            padding: true,
            backgroundColor: true
        },
        minChildren: 1,
        priority: 9
    },
    
    // Display Components
    badge: {
        tags: ['span', 'div'],
        classHints: ['badge', 'tag', 'chip', 'label', 'pill', 'status'],
        styleHints: {
            padding: true,
            borderRadius: true,
            fontSize: 'small',
            display: 'inline'
        },
        maxWidth: 200,
        priority: 6
    },
    
    avatar: {
        tags: ['img', 'div', 'span'],
        classHints: ['avatar', 'profile', 'user-image', 'profile-pic'],
        styleHints: {
            borderRadius: '50%',
            width: 'square',
            height: 'square'
        },
        priority: 7
    },
    
    separator: {
        tags: ['hr', 'div'],
        classHints: ['divider', 'separator', 'hr', 'line'],
        styleHints: {
            height: '1px',
            borderTop: true
        },
        priority: 4
    },
    
    // Navigation Components
    tabs: {
        tags: ['div', 'nav'],
        roles: ['tablist'],
        classHints: ['tabs', 'tab-list', 'tablist'],
        hasTabChildren: true,
        priority: 8
    },
    
    // Overlay Components
    dialog: {
        tags: ['div', 'dialog'],
        roles: ['dialog', 'alertdialog'],
        classHints: ['modal', 'dialog', 'popup', 'overlay'],
        styleHints: {
            position: 'fixed',
            zIndex: 'high'
        },
        priority: 9
    },
    
    alert: {
        tags: ['div'],
        roles: ['alert', 'status'],
        classHints: ['alert', 'notification', 'message', 'toast'],
        styleHints: {
            padding: true,
            borderRadius: true,
            border: true
        },
        priority: 7
    },
    
    // Data Display
    table: {
        tags: ['table'],
        roles: ['table', 'grid'],
        classHints: ['table', 'data-table', 'grid'],
        priority: 8
    },
    
    // Progress Components
    progress: {
        tags: ['div', 'progress'],
        roles: ['progressbar'],
        classHints: ['progress', 'progress-bar', 'loading-bar'],
        styleHints: {
            overflow: 'hidden',
            borderRadius: true
        },
        priority: 6
    },
    
    skeleton: {
        tags: ['div', 'span'],
        classHints: ['skeleton', 'placeholder', 'loading'],
        styleHints: {
            animation: true,
            backgroundColor: 'gray'
        },
        priority: 5
    },
    
    // Typography (lower priority - often handled by Tailwind)
    heading: {
        tags: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        classHints: ['heading', 'title', 'headline'],
        priority: 2
    },
    
    // Media
    'aspect-ratio': {
        tags: ['div'],
        classHints: ['aspect', 'ratio', 'video-wrapper', 'embed'],
        styleHints: {
            position: 'relative',
            paddingBottom: 'percentage'
        },
        priority: 4
    },
    
    // Accordion
    accordion: {
        tags: ['div', 'details'],
        classHints: ['accordion', 'collapsible', 'expandable', 'faq'],
        hasToggleChildren: true,
        priority: 7
    },
    
    // Tooltip (usually detected by aria)
    tooltip: {
        tags: ['div', 'span'],
        roles: ['tooltip'],
        classHints: ['tooltip', 'tip', 'popover-content'],
        styleHints: {
            position: 'absolute',
            zIndex: 'high'
        },
        priority: 5
    },
    
    // Scroll Area
    'scroll-area': {
        tags: ['div'],
        classHints: ['scroll', 'scrollable', 'overflow'],
        styleHints: {
            overflow: 'auto',
            overflowY: 'scroll'
        },
        priority: 4
    }
};

// ============================================
// DETECTION LOGIC
// ============================================

/**
 * Check if a node matches a component's detection pattern
 * @param {Object} node - Design tree node
 * @param {Object} patterns - Component patterns
 * @returns {number} Match score (0 = no match, higher = better match)
 */
function getMatchScore(node, patterns) {
    let score = 0;
    
    const tag = (node.tag || '').toLowerCase();
    const role = (node.role || '').toLowerCase();
    const classes = (node.selector || '').toLowerCase();
    const styles = node.styles || {};
    const dimensions = node.dimensions || {};
    
    // Tag match (strong signal)
    if (patterns.tags?.includes(tag)) {
        score += 3;
    }
    
    // Role match (strong signal)
    if (patterns.roles?.includes(role)) {
        score += 4;
    }
    
    // Class hint match
    if (patterns.classHints) {
        const classMatches = patterns.classHints.filter(hint => classes.includes(hint));
        score += classMatches.length * 2;
    }
    
    // Input type exclusion
    if (patterns.excludeTypes && tag === 'input') {
        const inputType = node.type || 'text';
        if (patterns.excludeTypes.includes(inputType)) {
            return 0; // Exclude this match
        }
    }
    
    // Input type inclusion
    if (patterns.inputTypes && tag === 'input') {
        const inputType = node.type || 'text';
        if (patterns.inputTypes.includes(inputType)) {
            score += 3;
        }
    }
    
    // Style hint match
    if (patterns.styleHints) {
        for (const [prop, expected] of Object.entries(patterns.styleHints)) {
            const value = styles[prop];
            
            if (expected === true) {
                // Just check if property exists and has meaningful value
                if (value && value !== 'none' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
                    score += 1;
                }
            } else if (expected === 'small') {
                // Check for small value
                if (value && parseInt(value) < 16) {
                    score += 1;
                }
            } else if (expected === 'square') {
                // Check if width equals height
                if (dimensions.width && dimensions.height && 
                    Math.abs(dimensions.width - dimensions.height) < 5) {
                    score += 2;
                }
            } else if (expected === 'high') {
                // Check for high z-index
                if (value && parseInt(value) > 100) {
                    score += 1;
                }
            } else if (expected === 'percentage') {
                // Check if value is percentage
                if (value && value.includes('%')) {
                    score += 1;
                }
            } else if (typeof expected === 'string') {
                // Exact or partial match
                if (value && value.includes(expected)) {
                    score += 2;
                }
            }
        }
    }
    
    // Min children check
    if (patterns.minChildren !== undefined) {
        const childCount = (node.children || []).length;
        if (childCount >= patterns.minChildren) {
            score += 1;
        } else {
            score -= 2; // Penalty for not meeting minimum
        }
    }
    
    // Max width check (for badges, etc.)
    if (patterns.maxWidth !== undefined) {
        if (dimensions.width && dimensions.width <= patterns.maxWidth) {
            score += 1;
        }
    }
    
    return score;
}

/**
 * Detect the best matching shadcn component for a node
 * @param {Object} node - Design tree node
 * @returns {Object|null} Best match { component, score }
 */
function detectNodeComponent(node) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [component, patterns] of Object.entries(COMPONENT_PATTERNS)) {
        const score = getMatchScore(node, patterns);
        const adjustedScore = score + (patterns.priority || 0) / 10;
        
        if (score >= 3 && adjustedScore > bestScore) {
            bestScore = adjustedScore;
            bestMatch = { component, score: adjustedScore };
        }
    }
    
    return bestMatch;
}

/**
 * Analyze entire design tree and return needed components
 * @param {Object} designTree - Root of design tree
 * @returns {string[]} List of unique component names
 */
function detectRequiredComponents(designTree) {
    const detected = new Map(); // component -> { count, maxScore }
    
    function analyzeNode(node, depth = 0) {
        if (!node || depth > 10) return;
        
        const match = detectNodeComponent(node);
        if (match) {
            const existing = detected.get(match.component);
            if (!existing || match.score > existing.maxScore) {
                detected.set(match.component, {
                    count: (existing?.count || 0) + 1,
                    maxScore: match.score
                });
            } else {
                existing.count++;
            }
        }
        
        // Recurse into children
        (node.children || []).forEach(child => analyzeNode(child, depth + 1));
    }
    
    analyzeNode(designTree);
    
    // Sort by score and return component names
    const sorted = Array.from(detected.entries())
        .sort((a, b) => b[1].maxScore - a[1].maxScore)
        .map(([name]) => name);
    
    console.log('[ComponentDetector] Detected components:', sorted);
    return sorted;
}

/**
 * Get detailed detection results with scores
 * @param {Object} designTree - Root of design tree
 * @returns {Object[]} Array of { component, count, score, nodes }
 */
function getDetailedDetection(designTree) {
    const detected = new Map();
    
    function analyzeNode(node, path = []) {
        if (!node) return;
        
        const match = detectNodeComponent(node);
        if (match) {
            if (!detected.has(match.component)) {
                detected.set(match.component, {
                    component: match.component,
                    count: 0,
                    maxScore: 0,
                    nodes: []
                });
            }
            
            const entry = detected.get(match.component);
            entry.count++;
            entry.maxScore = Math.max(entry.maxScore, match.score);
            entry.nodes.push({
                tag: node.tag,
                selector: node.selector?.slice(0, 50),
                path: path.join(' > '),
                score: match.score
            });
        }
        
        // Recurse
        (node.children || []).forEach((child, i) => {
            analyzeNode(child, [...path, `${node.tag}[${i}]`]);
        });
    }
    
    analyzeNode(designTree);
    
    return Array.from(detected.values())
        .sort((a, b) => b.maxScore - a.maxScore);
}

/**
 * Suggest component composition based on structure
 * @param {Object} designTree - Root of design tree
 * @returns {Object} Suggested composition
 */
function suggestComposition(designTree) {
    const detected = getDetailedDetection(designTree);
    const components = detected.map(d => d.component);
    
    // Check for common compositions
    const suggestions = {
        components,
        composition: null,
        notes: []
    };
    
    // Card composition
    if (components.includes('card')) {
        suggestions.composition = 'card';
        suggestions.notes.push('Detected card layout - consider using Card, CardHeader, CardContent, CardFooter');
        
        if (components.includes('button')) {
            suggestions.notes.push('Card has action buttons - place in CardFooter');
        }
        if (components.includes('badge')) {
            suggestions.notes.push('Card has badges - can be positioned absolutely or in CardHeader');
        }
    }
    
    // Form composition
    if (components.includes('input') || components.includes('select') || components.includes('textarea')) {
        suggestions.notes.push('Form elements detected - wrap with Label and consider form validation');
    }
    
    // Dialog/Modal
    if (components.includes('dialog')) {
        suggestions.notes.push('Dialog detected - use Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter');
    }
    
    return suggestions;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get all available patterns
 * @returns {Object} Component patterns
 */
function getPatterns() {
    return COMPONENT_PATTERNS;
}

/**
 * Check if a specific component type is detected in the tree
 * @param {Object} designTree - Design tree
 * @param {string} componentName - Component to look for
 * @returns {boolean}
 */
function hasComponent(designTree, componentName) {
    const detected = detectRequiredComponents(designTree);
    return detected.includes(componentName);
}

// ============================================
// EXPORTS
// ============================================

window.ComponentDetector = {
    // Main detection
    detectRequiredComponents,
    detectNodeComponent,
    getDetailedDetection,
    
    // Composition
    suggestComposition,
    
    // Utilities
    getMatchScore,
    getPatterns,
    hasComponent,
    
    // Constants
    COMPONENT_PATTERNS
};

console.log('[ComponentDetector] Module loaded');


