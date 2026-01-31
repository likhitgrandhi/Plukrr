// ============================================
// Gemini AI Service for Design Analysis
// Handles API communication, design analysis, and prompt enhancement
// ============================================

// Using Gemini 2.0 Flash (free preview model)
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ============================================
// API KEY MANAGEMENT
// ============================================

async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['geminiApiKey'], (result) => {
            resolve(result.geminiApiKey || null);
        });
    });
}

async function setApiKey(apiKey) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ geminiApiKey: apiKey }, resolve);
    });
}

async function validateApiKey(apiKey) {
    if (!apiKey || apiKey.length < 20) {
        return false;
    }
    
    try {
        const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: {
                    maxOutputTokens: 10
                }
            })
        });
        
        if (response.ok) {
            return true;
        }
        
        const errorData = await response.json().catch(() => ({}));
        console.log('API validation response:', response.status, errorData);
        
        if (response.status === 429) {
            return true; // Rate limited but key is valid
        }
        
        return false;
    } catch (e) {
        console.error('API key validation error:', e);
        return false;
    }
}

// ============================================
// RATE LIMITING
// ============================================

const rateLimiter = {
    lastRequest: 0,
    minInterval: 1000,
    requestCount: 0,
    maxRequestsPerMinute: 15,
    requestTimestamps: [],

    canMakeRequest() {
        const now = Date.now();
        this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 60000);
        
        if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
            return false;
        }
        
        if (now - this.lastRequest < this.minInterval) {
            return false;
        }
        
        return true;
    },

    recordRequest() {
        const now = Date.now();
        this.lastRequest = now;
        this.requestTimestamps.push(now);
    },

    getWaitTime() {
        const now = Date.now();
        if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
            const oldestRequest = this.requestTimestamps[0];
            return Math.max(0, 60000 - (now - oldestRequest));
        }
        return Math.max(0, this.minInterval - (now - this.lastRequest));
    }
};

// ============================================
// GEMINI API COMMUNICATION
// ============================================

async function callGeminiAPI(prompt, options = {}) {
    const apiKey = await getApiKey();
    
    if (!apiKey) {
        throw new Error('API_KEY_MISSING');
    }

    if (!rateLimiter.canMakeRequest()) {
        const waitTime = rateLimiter.getWaitTime();
        throw new Error(`RATE_LIMITED:${waitTime}`);
    }

    try {
        rateLimiter.recordRequest();
        
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: options.temperature || 0.7,
                maxOutputTokens: options.maxTokens || 2048,
                topP: 0.95,
            }
        };
        
        console.log('[GeminiService] Calling API with model:', GEMINI_MODEL);
        
        const response = await fetch(`${GEMINI_API_BASE}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Gemini API error:', response.status, errorData);
            
            if (response.status === 429) {
                throw new Error('RATE_LIMITED:60000');
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('API_KEY_INVALID');
            }
            throw new Error(`API_ERROR:${response.status}:${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!text) {
            console.error('Empty response from Gemini:', data);
            throw new Error('EMPTY_RESPONSE');
        }

        return text;
    } catch (error) {
        console.error('Gemini API call failed:', error);
        if (error.message.startsWith('API_') || error.message.startsWith('RATE_') || error.message === 'EMPTY_RESPONSE') {
            throw error;
        }
        throw new Error(`NETWORK_ERROR:${error.message}`);
    }
}

// ============================================
// SMART DATA EXTRACTION & GROUPING
// ============================================

// Extract all elements with their styles into a flat list
function extractAllElements(node, elements = [], depth = 0) {
    if (!node || depth > 6) return elements;
    
    const styles = node.styles || {};
    const element = {
        tag: node.tag || 'div',
        role: node.role || 'element',
        text: node.textContent?.slice(0, 50) || null,
        depth,
        styles: {}
    };
    
    // Extract only meaningful styles
    const styleProps = [
        'color', 'background-color', 'background',
        'font-family', 'font-size', 'font-weight', 'line-height',
        'padding', 'margin', 'gap',
        'border', 'border-radius', 'box-shadow',
        'display', 'flex-direction', 'justify-content', 'align-items',
        'width', 'height', 'max-width'
    ];
    
    for (const prop of styleProps) {
        const val = styles[prop];
        if (val && val !== 'none' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)' && val !== 'normal' && val !== '400') {
            // Clean up font-family
            if (prop === 'font-family') {
                element.styles[prop] = val.split(',')[0].trim().replace(/"/g, '');
            } else {
                element.styles[prop] = val;
            }
        }
    }
    
    if (Object.keys(element.styles).length > 0 || element.text) {
        elements.push(element);
    }
    
    for (const child of (node.children || [])) {
        extractAllElements(child, elements, depth + 1);
    }
    
    return elements;
}

// Group similar elements by their style signature
function groupSimilarElements(elements) {
    const groups = {};
    
    for (const el of elements) {
        // Create a style signature (sorted keys + values)
        const styleKeys = Object.keys(el.styles).sort();
        const signature = styleKeys.map(k => `${k}:${el.styles[k]}`).join('|');
        
        const key = `${el.tag}|${signature}`;
        
        if (!groups[key]) {
            groups[key] = {
                tags: new Set(),
                roles: new Set(),
                styles: el.styles,
                count: 0,
                sampleText: null
            };
        }
        
        groups[key].tags.add(el.tag);
        groups[key].roles.add(el.role);
        groups[key].count++;
        if (el.text && !groups[key].sampleText) {
            groups[key].sampleText = el.text;
        }
    }
    
    // Convert to array and sort by count (most common first)
    return Object.values(groups)
        .map(g => ({
            ...g,
            tags: Array.from(g.tags),
            roles: Array.from(g.roles)
        }))
        .sort((a, b) => b.count - a.count);
}

// Extract unique design tokens
function extractUniqueTokens(elements) {
    const tokens = {
        colors: new Set(),
        fonts: new Set(),
        fontSizes: new Set(),
        spacing: new Set(),
        radii: new Set(),
        shadows: new Set()
    };
    
    for (const el of elements) {
        const s = el.styles;
        if (s.color) tokens.colors.add(s.color);
        if (s['background-color']) tokens.colors.add(s['background-color']);
        if (s['font-family']) tokens.fonts.add(s['font-family']);
        if (s['font-size']) tokens.fontSizes.add(s['font-size']);
        if (s.padding) tokens.spacing.add(s.padding);
        if (s.margin) tokens.spacing.add(s.margin);
        if (s.gap) tokens.spacing.add(s.gap);
        if (s['border-radius']) tokens.radii.add(s['border-radius']);
        if (s['box-shadow']) tokens.shadows.add(s['box-shadow']);
    }
    
    return {
        colors: Array.from(tokens.colors),
        fonts: Array.from(tokens.fonts),
        fontSizes: Array.from(tokens.fontSizes).sort((a, b) => parseInt(a) - parseInt(b)),
        spacing: Array.from(tokens.spacing).sort((a, b) => parseInt(a) - parseInt(b)),
        radii: Array.from(tokens.radii),
        shadows: Array.from(tokens.shadows)
    };
}

// Format grouped styles concisely
function formatGroupedStyles(groups) {
    const lines = [];
    
    for (const group of groups.slice(0, 10)) { // Limit to top 10 patterns
        const tags = group.tags.join(', ');
        const countText = group.count > 1 ? ` (${group.count} elements)` : '';
        const roleText = group.roles[0] !== 'element' ? ` [${group.roles[0]}]` : '';
        
        lines.push(`${tags.toUpperCase()}${roleText}${countText}:`);
        
        const styleEntries = Object.entries(group.styles);
        if (styleEntries.length > 0) {
            const styleStr = styleEntries.map(([k, v]) => `${k}: ${v}`).join('; ');
            lines.push(`  ${styleStr}`);
        }
        
        if (group.sampleText) {
            lines.push(`  (e.g., "${group.sampleText.slice(0, 30)}${group.sampleText.length > 30 ? '...' : ''}")`);
        }
        
        lines.push('');
    }
    
    return lines.join('\n');
}

// Build semantic structure description (no source classes)
function buildSemanticStructure(node, depth = 0, maxDepth = 4) {
    if (!node || depth > maxDepth) return '';
    
    const indent = '  '.repeat(depth);
    const role = node.role && node.role !== 'element' ? node.role : node.tag;
    
    let line = `${indent}<${role}>`;
    
    if (node.textContent && node.textContent.length < 40) {
        line += ` "${node.textContent.slice(0, 35)}..."`;
    }
    
    const children = node.children || [];
    if (children.length > 0) {
        line += '\n';
        for (const child of children.slice(0, 5)) {
            line += buildSemanticStructure(child, depth + 1, maxDepth);
        }
        if (children.length > 5) {
            line += `${indent}  ... ${children.length - 5} more\n`;
        }
        line += `${indent}</${role}>\n`;
    } else {
        line += `</${role}>\n`;
    }
    
    return line;
}

// ============================================
// INTENT-SPECIFIC PROMPT BUILDERS
// ============================================

const INTENT_PROMPTS = {
    
    // ==========================================
    // APPLY-DESIGN: Apply styles to existing component
    // ==========================================
    'apply-design': (data) => {
        const elements = extractAllElements(data.tree);
        const groups = groupSimilarElements(elements);
        const tokens = extractUniqueTokens(elements);
        
        return `You are writing a CONCISE prompt for an AI coding assistant. The user wants to apply visual styles from a screenshot to their existing component.

EXTRACTED DESIGN DATA:
- Total elements: ${elements.length}
- Unique style patterns: ${groups.length}

STYLE PATTERNS (grouped by similarity):
${formatGroupedStyles(groups)}

DESIGN TOKENS:
- Colors: ${tokens.colors.slice(0, 6).join(', ') || 'none'}
- Fonts: ${tokens.fonts.join(', ') || 'system'}
- Font sizes: ${tokens.fontSizes.join(', ') || 'default'}
- Spacing: ${tokens.spacing.slice(0, 6).join(', ') || 'default'}
- Border radius: ${tokens.radii.join(', ') || 'none'}
- Shadows: ${tokens.shadows.length > 0 ? tokens.shadows.length + ' shadow(s)' : 'none'}

Write a prompt that:
1. Starts with "TASK: Apply this design to my existing component"
2. Has "DO NOT CHANGE" section (preserve text, structure, logic)
3. Has "VISUAL STYLES TO APPLY" section that:
   - Groups similar elements (e.g., "All text elements: color #333, font-size 14px")
   - Lists container styles first, then child elements
   - Is CONCISE - don't repeat identical styles
4. Ends with the exact CSS values organized by category

Be brief but complete. Group similar patterns. Output ONLY the prompt text.`;
    },

    // ==========================================
    // REPLICATE-DESIGN: Create pixel-perfect copy
    // ==========================================
    'replicate-design': (data) => {
        const elements = extractAllElements(data.tree);
        const tokens = extractUniqueTokens(elements);
        const structure = buildSemanticStructure(data.tree);
        
        return `You are writing a prompt for an AI coding assistant. The user wants to CREATE A NEW COMPONENT matching this design.

COMPONENT STRUCTURE (semantic, no source classes):
${structure}

DESIGN TOKENS:
- Colors: ${tokens.colors.slice(0, 6).join(', ')}
- Fonts: ${tokens.fonts.join(', ') || 'system'}
- Font sizes: ${tokens.fontSizes.join(', ')}
- Spacing: ${tokens.spacing.slice(0, 6).join(', ')}
- Border radius: ${tokens.radii.join(', ') || '0'}
${tokens.shadows.length > 0 ? `- Shadows: ${tokens.shadows[0]}` : ''}

Write a prompt that:
1. Starts with "TASK: Create a new component matching this design"
2. Has "STRUCTURE" section with SEMANTIC HTML (use descriptive class names like .card, .card-title, .card-button - NOT source classes)
3. Has "STYLES" section with CSS values grouped by element type
4. Specifies: make text content props, use CSS variables for colors if available
5. Keep it CONCISE - group similar elements

Output ONLY the prompt text, no explanations.`;
    },

    // ==========================================
    // COMPONENT-WITHOUT-DESIGN: Structure only
    // ==========================================
    'component-without-design': (data) => {
        const structure = buildSemanticStructure(data.tree, 0, 5);
        
        return `You are writing a prompt for an AI coding assistant. The user wants ONLY the HTML structure (no styles).

DETECTED STRUCTURE:
${structure}

Write a prompt that:
1. Starts with "TASK: Create the HTML structure only (no styling)"
2. Lists the semantic HTML structure with:
   - Proper HTML5 elements (article, section, header, nav, etc.)
   - Accessibility attributes (aria-label, role, etc.)
   - Clean class names based on PURPOSE (e.g., .user-card, .action-button)
3. Explicitly states: NO CSS, NO inline styles, NO styling classes
4. Mentions: "I will apply my own design system"

Be concise. Output ONLY the prompt text.`;
    },

    // ==========================================
    // GLOBAL-TOKENS: Extract design system variables
    // ==========================================
    'global-tokens': (data) => {
        const elements = extractAllElements(data.tree);
        const tokens = extractUniqueTokens(elements);
        
        return `You are writing a prompt for an AI coding assistant. The user wants to EXTRACT and MAP design tokens.

EXTRACTED TOKENS (deduplicated):

COLORS (${tokens.colors.length}):
${tokens.colors.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

TYPOGRAPHY:
  Fonts: ${tokens.fonts.join(', ') || 'system default'}
  Sizes: ${tokens.fontSizes.join(', ')}

SPACING: ${tokens.spacing.join(', ')}

BORDER RADIUS: ${tokens.radii.join(', ') || 'none'}

SHADOWS: ${tokens.shadows.length > 0 ? tokens.shadows.join('; ') : 'none'}

Write a prompt that:
1. Starts with "TASK: Map these design tokens to my codebase"
2. Lists each token category with the values
3. Asks AI to:
   - Find matching CSS variables in user's code
   - Suggest token names for unmatched values
   - Format as: "extracted value → suggested token name"
4. States: "Do NOT apply these anywhere - just provide the mapping"

Be concise. Output ONLY the prompt text.`;
    },

    // ==========================================
    // SMART-COMPONENT-VISUAL: Just styles grouped by type (no hierarchy)
    // ==========================================
    'smart-component-visual': (data) => {
        const elements = extractAllElements(data.tree);
        const tokens = extractUniqueTokens(elements);
        
        // Group by semantic role/type
        const byRole = {};
        for (const el of elements) {
            const role = el.role !== 'element' ? el.role : el.tag;
            if (!byRole[role]) byRole[role] = [];
            byRole[role].push(el);
        }
        
        // Format roles with unique styles
        const roleStyles = Object.entries(byRole)
            .filter(([_, els]) => els.length > 0)
            .map(([role, els]) => {
                // Get unique style combinations for this role
                const uniqueStyles = new Map();
                for (const el of els) {
                    const sig = JSON.stringify(el.styles);
                    if (!uniqueStyles.has(sig)) {
                        uniqueStyles.set(sig, el.styles);
                    }
                }
                
                const variants = Array.from(uniqueStyles.values());
                const count = els.length;
                let out = `[${role.toUpperCase()}] (${count}x):\n`;
                
                variants.forEach((styles, i) => {
                    const styleStr = Object.entries(styles).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join('; ');
                    if (variants.length > 1) {
                        out += `    Variant ${i + 1}: ${styleStr || 'default'}\n`;
                    } else {
                        out += `    ${styleStr || 'no visual styles'}\n`;
                    }
                });
                return out;
            })
            .join('\n');
        
        return `You are writing a prompt for an AI coding assistant. The user wants to apply VISUAL styles only - no structure changes.

MODE: VISUAL ONLY (no hierarchy shown)

COMPONENT TYPES WITH STYLES:
${roleStyles}

DESIGN TOKENS:
- Colors: ${tokens.colors.slice(0, 6).join(', ')}
- Fonts: ${tokens.fonts.join(', ') || 'system'}
- Sizes: ${tokens.fontSizes.join(', ')}
- Spacing: ${tokens.spacing.slice(0, 4).join(', ')}
- Radius: ${tokens.radii.join(', ') || '0'}
${tokens.shadows.length > 0 ? `- Shadow: ${tokens.shadows[0]}` : ''}

Write a prompt that:
1. Starts with "TASK: Apply these visual styles to matching elements in your component"
2. Lists styles BY COMPONENT TYPE (e.g., "BUTTONS: background #3b82f6, color white, padding 8px 16px")
3. Groups similar variants (e.g., "Primary button: ...", "Secondary button: ...")
4. Clearly states: "Keep your existing HTML structure, class names, and layout"
5. ONLY includes visual styles: colors, typography, padding, borders, shadows, radius
6. EXCLUDES: position, display, flex, grid, margins, dimensions

Be concise. Group by type. Output ONLY the prompt text.`;
    },

    // ==========================================
    // SMART-COMPONENT-STRUCTURE: Hierarchy + styles for adapting
    // ==========================================
    'smart-component-structure': (data) => {
        const elements = extractAllElements(data.tree);
        const tokens = extractUniqueTokens(elements);
        const structure = buildSemanticStructure(data.tree, 0, 4);
        
        // Build hierarchy with inline styles
        const hierarchyWithStyles = buildHierarchyWithStyles(data.tree, 0, 4);
        
        return `You are writing a prompt for an AI coding assistant. The user wants to ADAPT their existing component to match this design's structure and styles.

MODE: STRUCTURE + STYLES (shows hierarchy for adaptation)

COMPONENT HIERARCHY:
${structure}

HIERARCHY WITH KEY STYLES:
${hierarchyWithStyles}

DESIGN TOKENS:
- Colors: ${tokens.colors.slice(0, 6).join(', ')}
- Fonts: ${tokens.fonts.join(', ') || 'system'}
- Sizes: ${tokens.fontSizes.join(', ')}
- Spacing: ${tokens.spacing.slice(0, 4).join(', ')}
- Radius: ${tokens.radii.join(', ') || '0'}
${tokens.shadows.length > 0 ? `- Shadow: ${tokens.shadows[0]}` : ''}

Write a prompt that:
1. Starts with "TASK: Adapt your component to match this design's structure and styles"
2. Describes the COMPONENT HIERARCHY:
   - What's the container/wrapper
   - What elements are inside (headers, content areas, buttons, etc.)
   - The nesting structure
3. For EACH level, describes the styles:
   - Container: "The outer container has white background, 16px padding, 8px radius, subtle shadow"
   - Children: "Inside, there's a heading with bold 18px text, followed by..."
4. Explains how to MAP their existing elements:
   - "Your header/title element should get: font-size 18px, font-weight 600, color #333"
   - "Your action buttons should get: background #3b82f6, padding 8px 16px, radius 4px"
5. Suggests which structural changes might be needed (if any)

Be descriptive but organized. Help the user understand how to restructure AND style. Output ONLY the prompt text.`;
    },

    // Legacy smart-component (defaults to visual)
    'smart-component': (data) => {
        return INTENT_PROMPTS['smart-component-visual'](data);
    },

    // ==========================================
    // SHADCN-COMPONENT: Build with shadcn/ui components
    // ==========================================
    'shadcn-component': (data) => {
        const { designTree, designTokens, fetchedComponents, detectedComponents } = data;
        
        // Build component code context from fetched shadcn components
        const componentContext = Object.entries(fetchedComponents || {})
            .map(([name, comp]) => {
                const code = comp.code || '';
                const deps = comp.dependencies || [];
                return `
### ${name.toUpperCase()} Component (from shadcn/ui)
\`\`\`tsx
${code.slice(0, 2000)}${code.length > 2000 ? '\n// ... truncated for brevity' : ''}
\`\`\`
NPM Dependencies: ${deps.join(', ') || 'none'}
`;
            })
            .join('\n');
        
        // Build structure summary
        const structureSummary = buildSemanticStructure(designTree, 0, 4);
        
        // Get tokens
        const tokens = designTokens || {};
        
        return `You are a senior React/TypeScript developer specializing in shadcn/ui components.

## TASK
Create a production-ready React component using ONLY the shadcn/ui components provided below.
The component should visually match the extracted design.

## EXTRACTED DESIGN STRUCTURE
\`\`\`
${structureSummary}
\`\`\`

## DESIGN TOKENS
- Colors: ${(tokens.colors || []).slice(0, 8).join(', ') || 'not extracted'}
- Fonts: ${(tokens.fonts || []).join(', ') || 'system'}
- Font Sizes: ${(tokens.fontSizes || []).join(', ') || 'default'}
- Spacing: ${(tokens.spacing || []).slice(0, 6).join(', ') || 'default'}
- Border Radius: ${(tokens.radii || []).join(', ') || 'none'}
- Shadows: ${(tokens.shadows || []).length > 0 ? (tokens.shadows || [])[0] : 'none'}

## DETECTED COMPONENTS NEEDED
${(detectedComponents || []).join(', ') || 'card, button'}

## AVAILABLE SHADCN COMPONENTS (use these exactly)
${componentContext || 'No components fetched - use standard shadcn patterns'}

## REQUIREMENTS
1. Use ONLY the shadcn/ui components provided above - do not invent new ones
2. Compose them to match the extracted design structure
3. Use Tailwind CSS classes for:
   - Custom spacing (p-4, m-2, gap-4, etc.)
   - Colors that match the design tokens (bg-primary, text-muted-foreground, etc.)
   - Layout (flex, grid, items-center, justify-between, etc.)
4. Create a TypeScript interface for all props
5. Make ALL text content configurable via props - never hardcode text from the design
6. Include all necessary imports from @/components/ui/*
7. Use semantic, descriptive prop names
8. Add JSDoc comments for the component and complex props

## OUTPUT FORMAT
Return a valid JSON object with exactly these fields:
{
  "componentName": "PascalCaseComponentName",
  "componentCode": "// Full TSX code with imports, interface, and component",
  "cssVariables": "/* CSS variables to add to globals.css if colors don't match shadcn defaults */",
  "installCommand": "npx shadcn@latest add component1 component2 ...",
  "usageExample": "<ComponentName prop1=\\"value\\" prop2=\\"value\\" />"
}

IMPORTANT: 
- Output ONLY valid JSON, no markdown code blocks around it
- Escape all quotes and newlines properly in JSON strings
- The componentCode should be a complete, working React component`;
    }
};

// Build hierarchy with inline styles for structure mode
function buildHierarchyWithStyles(node, depth = 0, maxDepth = 4) {
    if (!node || depth > maxDepth) return '';
    
    const indent = '  '.repeat(depth);
    const role = node.role && node.role !== 'element' ? node.role : node.tag;
    const styles = node.styles || {};
    
    // Get key visual styles
    const keyStyles = [];
    if (styles['background-color'] && styles['background-color'] !== 'rgba(0, 0, 0, 0)') {
        keyStyles.push(`bg: ${styles['background-color']}`);
    }
    if (styles.color) keyStyles.push(`color: ${styles.color}`);
    if (styles['font-size']) keyStyles.push(`size: ${styles['font-size']}`);
    if (styles['font-weight'] && styles['font-weight'] !== '400') keyStyles.push(`weight: ${styles['font-weight']}`);
    if (styles.padding && styles.padding !== '0px') keyStyles.push(`pad: ${styles.padding}`);
    if (styles['border-radius'] && styles['border-radius'] !== '0px') keyStyles.push(`radius: ${styles['border-radius']}`);
    if (styles['box-shadow'] && styles['box-shadow'] !== 'none') keyStyles.push('shadow');
    
    let line = `${indent}[${role}]`;
    if (keyStyles.length > 0) {
        line += ` → ${keyStyles.join(', ')}`;
    }
    line += '\n';
    
    const children = node.children || [];
    for (const child of children.slice(0, 5)) {
        line += buildHierarchyWithStyles(child, depth + 1, maxDepth);
    }
    if (children.length > 5) {
        line += `${indent}  ... ${children.length - 5} more\n`;
    }
    
    return line;
}

// ==========================================
// MAIN PROMPT GENERATION
// ==========================================

// Legacy intent mapping
const LEGACY_INTENT_MAP = {
    'copy-design': 'apply-design',
    'component-with-design': 'replicate-design',
    'component-without-design': 'replicate-design',
    'extract-tokens': 'global-tokens',
    'extract-global-theme': 'global-tokens',
    'adapt-to-codebase': 'apply-design',
    'smart-component': 'apply-design',
    'smart-component-visual': 'apply-design',
    'smart-component-structure': 'replicate-design'
};

function buildIntentPrompt(designData, intent) {
    // Map legacy intents to new 4 core intents
    const mappedIntent = LEGACY_INTENT_MAP[intent] || intent;
    const builder = INTENT_PROMPTS[mappedIntent];
    
    if (!builder) {
        // Fallback to apply-design
        return INTENT_PROMPTS['apply-design'](designData);
    }
    
    return builder(designData);
}

// ============================================
// ENHANCED PROMPT PIPELINE
// ============================================

async function enhanceDesignPrompt(designData, intent) {
    console.log('[GeminiService] enhanceDesignPrompt for intent:', intent);
    
    try {
        // Build intent-specific prompt
        const prompt = buildIntentPrompt(designData, intent);
        console.log('[GeminiService] Built prompt, calling API...');
        
        // Call Gemini to generate the optimized prompt
        const response = await callGeminiAPI(prompt, { 
            temperature: 0.5, 
            maxTokens: 1500 
        });
        
        console.log('[GeminiService] Got response, length:', response.length);
        
        return {
            success: true,
            prompt: response.trim(),
            enhanced: true,
            analysis: null
        };
    } catch (error) {
        console.error('[GeminiService] Enhancement failed:', error);
        return {
            success: false,
            error: error.message,
            prompt: null,
            enhanced: false,
            analysis: null
        };
    }
}

// Legacy functions for compatibility
async function analyzeDesignData(designData, intent) {
    // Now handled in enhanceDesignPrompt
    return { success: true, analysis: {}, enhanced: false };
}

async function generateEnhancedPrompt(designData, analysis, intent) {
    return enhanceDesignPrompt(designData, intent);
}

// ============================================
// FALLBACK / DEFAULT ANALYSIS
// ============================================

function getDefaultAnalysis(designData) {
    const elementCount = designData.elementCount || 1;
    
    return {
        designPattern: 'custom',
        complexity: elementCount > 10 ? 'complex' : elementCount > 3 ? 'moderate' : 'simple',
        componentCategory: 'component',
        keyCharacteristics: ['colors', 'spacing', 'typography'],
        colorScheme: 'light',
        styleEmphasis: ['background-color', 'color', 'padding', 'border-radius'],
        edgeCases: [],
        promptStrategy: 'concise',
        suggestedApproach: 'Apply styles directly'
    };
}

// ============================================
// DIRECT CODE GENERATION
// ============================================

async function generateDirectCSS(designData, targetSelector, options = {}) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        return { success: false, error: 'API_KEY_MISSING', css: null };
    }

    const elements = extractAllElements(designData.tree);
    const tokens = extractUniqueTokens(elements);
    
    const prompt = `Generate CSS for "${targetSelector}" using these design values:

Colors: ${tokens.colors.slice(0, 6).join(', ')}
Font: ${tokens.fonts[0] || 'inherit'}
Sizes: ${tokens.fontSizes.join(', ')}
Spacing: ${tokens.spacing.slice(0, 4).join(', ')}
Radius: ${tokens.radii[0] || '0'}
${tokens.shadows[0] ? `Shadow: ${tokens.shadows[0]}` : ''}

${options.framework === 'tailwind' ? 'Output Tailwind classes.' : 'Output clean CSS.'}
${options.includeHover ? 'Include :hover state.' : ''}

Output ONLY the code, no explanations.`;

    try {
        const response = await callGeminiAPI(prompt, { temperature: 0.3 });
        const cssMatch = response.match(/```(?:css)?\n?([\s\S]*?)\n?```/);
        const css = cssMatch ? cssMatch[1].trim() : response.trim();
        
        return { success: true, css, enhanced: true };
    } catch (error) {
        return { success: false, error: error.message, css: null };
    }
}

async function generateComponentCode(designData, options = {}) {
    const apiKey = await getApiKey();
    if (!apiKey) {
        return { success: false, error: 'API_KEY_MISSING', code: null };
    }

    const elements = extractAllElements(designData.tree);
    const tokens = extractUniqueTokens(elements);
    const structure = buildSemanticStructure(designData.tree);
    
    const prompt = `Generate a ${options.framework || 'React'} component:

STRUCTURE:
${structure}

STYLES:
- Colors: ${tokens.colors.slice(0, 4).join(', ')}
- Font: ${tokens.fonts[0] || 'inherit'}
- Spacing: ${tokens.spacing.slice(0, 3).join(', ')}
- Radius: ${tokens.radii[0] || '0'}

Requirements:
- Semantic HTML, clean class names
- Text content as props
- ${options.includeTypes ? 'Include TypeScript types' : 'JavaScript'}

Output ONLY the component code.`;

    try {
        const response = await callGeminiAPI(prompt, { temperature: 0.4, maxTokens: 2000 });
        const codeMatch = response.match(/```(?:jsx?|tsx?)?\n?([\s\S]*?)\n?```/);
        const code = codeMatch ? codeMatch[1].trim() : response.trim();
        
        return { success: true, code, enhanced: true };
    } catch (error) {
        return { success: false, error: error.message, code: null };
    }
}

// ============================================
// SERVICE STATUS
// ============================================

// Cache validation result to avoid repeated network calls
let validationCache = { key: null, valid: null, timestamp: 0 };
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getServiceStatus() {
    const apiKey = await getApiKey();
    const hasKey = !!apiKey;
    
    // Check cache first - don't re-validate on every call
    let isValid = false;
    if (hasKey) {
        const now = Date.now();
        if (validationCache.key === apiKey && 
            validationCache.valid !== null && 
            (now - validationCache.timestamp) < VALIDATION_CACHE_TTL) {
            isValid = validationCache.valid;
        } else {
            // Only validate if we don't have a cached result
            // For quick status check, assume valid if key exists and is long enough
            isValid = apiKey.length >= 30;
            validationCache = { key: apiKey, valid: isValid, timestamp: now };
        }
    }
    
    return {
        hasApiKey: hasKey,
        isValid,
        canMakeRequest: rateLimiter.canMakeRequest(),
        waitTime: rateLimiter.getWaitTime(),
        requestsRemaining: rateLimiter.maxRequestsPerMinute - rateLimiter.requestTimestamps.filter(t => Date.now() - t < 60000).length
    };
}

// Full validation with network call - use this explicitly when needed
async function validateAndCacheApiKey(apiKey) {
    const isValid = await validateApiKey(apiKey);
    validationCache = { key: apiKey, valid: isValid, timestamp: Date.now() };
    return isValid;
}

// ============================================
// EXPORTS
// ============================================

window.GeminiService = {
    // API Key Management
    getApiKey,
    setApiKey,
    validateApiKey,
    
    // Core Analysis
    analyzeDesignData,
    generateEnhancedPrompt,
    enhanceDesignPrompt,
    
    // Direct API Call (for shadcn builder)
    callGeminiAPI,
    
    // Direct Code Generation
    generateDirectCSS,
    generateComponentCode,
    
    // Utilities
    getServiceStatus,
    getDefaultAnalysis,
    
    // Data extraction (exposed for debugging)
    extractAllElements,
    groupSimilarElements,
    extractUniqueTokens,
    
    // Rate Limiter
    rateLimiter
};
