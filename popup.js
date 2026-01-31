// ============================================
// Design Copier - Popup Script
// Intent-based output generation with Gemini AI enhancement
// ============================================

const MAX_HISTORY = 10;
let currentData = null;
let currentIntent = 'copy-design';
let captureHistory = [];
let selectedHistoryIndex = -1;
let aiEnhancementEnabled = false;
let isEnhancing = false;

// ============================================
// INTENT CONFIGURATION
// Prompts written for AI consumption - clear, direct, actionable
// ============================================

const INTENTS = {
    'copy-design': {
        id: 'copy-design',
        label: 'Apply Design',
        description: 'Apply to existing component',
        prompt: `TASK: Apply this design to my existing component.

CRITICAL: Do NOT copy any text content from the screenshot. Preserve ALL existing text, labels, placeholders, and user content in my component. Only update visual styles.

INSTRUCTIONS:
1. Find the matching component in my codebase (similar structure/purpose)
2. If found: Update ONLY the CSS styles (colors, spacing, typography, shadows, borders, etc.) to match the design specs below
3. Keep my existing: markup structure, class names, logic, text content, labels, and all user-facing content
4. If NOT found: Ask me which component or file to apply this design to. Do not create a new component.

Use screenshot as visual reference for STYLING ONLY. Apply these values:`
    },
    'component-with-design': {
        id: 'component-with-design',
        label: 'New Component',
        description: 'Create new with styles',
        prompt: `TASK: Create a new component matching this design.

NOTE: Text content shown below is for STRUCTURAL REFERENCE ONLY. Use placeholder text or props for actual content.

INSTRUCTIONS:
1. Generate semantic HTML structure as shown below
2. Apply the styles listed for each element
3. Use my existing CSS variables/tokens where they match (ask if unsure)
4. Output as a single reusable component with props for text content
5. Do NOT hardcode the text from the reference - make it configurable

Screenshot is the visual reference. Structure and styles:`
    },
    'component-without-design': {
        id: 'component-without-design',
        label: 'Structure Only',
        description: 'Markup without styles',
        prompt: `TASK: Create component structure only (no styling).

INSTRUCTIONS:
1. Generate semantic HTML matching the structure below
2. Do NOT add any styles, classes for styling, or CSS
3. Focus on: correct HTML elements, accessibility attributes, proper nesting
4. I will apply my own design system afterward

Structure to replicate:`
    },
    'extract-tokens': {
        id: 'extract-tokens',
        label: 'Extract Tokens',
        description: 'Get design values',
        prompt: `TASK: Map these design tokens to my codebase.

INSTRUCTIONS:
1. Find similar values in my existing CSS variables/design tokens
2. List matches: "extracted value → your existing token"
3. List new tokens needed (values with no match)
4. Do NOT apply these anywhere yet - just provide the mapping

Extracted values:`
    },
    'extract-global-theme': {
        id: 'extract-global-theme',
        label: 'Global Theme',
        description: 'Extract full design system',
        prompt: `TASK: Extract the complete design system from this website.

This CSS is ready to paste into your project's global.css or use with no-code tools.
Formats supported: Shadcn/CSS Variables, Tailwind, Standard CSS.

INSTRUCTIONS:
1. Review the CSS variables below - they represent the website's complete design system
2. If you have existing global CSS: paste it and I'll help merge these styles
3. If you don't have global CSS: copy this output directly to your global.css file
4. Variables are organized by: colors (light/dark mode), typography, spacing, borders, shadows

Extracted Design System:`
    },
    'adapt-to-codebase': {
        id: 'adapt-to-codebase',
        label: 'Adapt to Codebase',
        description: 'AI maps to your selectors',
        prompt: `TASK: This intent opens the full results page for AI-powered style adaptation.

Use the results page to:
1. Paste your existing CSS or define selector mappings
2. Let AI analyze and adapt extracted styles to your codebase
3. Preview changes live on any website before applying
4. Copy adapted CSS ready for your project

Opening results page for full adaptation features...`
    },
    'smart-component': {
        id: 'smart-component',
        label: 'Smart Component',
        description: 'Semantic structure + styles',
        prompt: `TASK: Apply this component's VISUAL DESIGN to my existing component.

Below shows:
- Component hierarchy with element ROLES (what each part does)
- VISUAL STYLES only: colors, borders, shadows, typography, padding
- NOT included: position, display, flex, grid, margins (these are layout/structural - keep your own)

Match the visual appearance while keeping your existing HTML structure and layout.`
    },
    'shadcn-component': {
        id: 'shadcn-component',
        label: 'Build with shadcn',
        description: 'Generate React component using shadcn/ui',
        prompt: `Building React component with shadcn/ui...`,
        requiresAI: true
    }
};

// Track shadcn build state
let shadcnBuildResult = null;
let isBuildingShadcn = false;

// ============================================
// HELPERS
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

// ============================================
// INTENT: APPLY DESIGN (to existing component)
// ============================================

function formatCopyDesign(data) {
    if (!data?.tree) return '';
    const { tree } = data;
    
    const colors = Array.from(collectColors(tree));
    const typo = collectTypography(tree);
    const spacing = Array.from(collectSpacing(tree)).sort((a, b) => parseInt(a) - parseInt(b));
    const radii = Array.from(collectBorderRadius(tree));
    const shadows = Array.from(collectShadows(tree));
    
    let out = INTENTS['copy-design'].prompt + '\n\n';
    
    out += '```\n';
    
    if (colors.length > 0) {
        out += `COLORS: ${colors.join(', ')}\n`;
    }
    
    if (typo.families.size > 0 || typo.sizes.size > 0) {
        if (typo.families.size > 0) out += `FONT: ${Array.from(typo.families).join(', ')}\n`;
        if (typo.sizes.size > 0) out += `SIZES: ${Array.from(typo.sizes).join(', ')}\n`;
        if (typo.weights.size > 0) out += `WEIGHTS: ${Array.from(typo.weights).join(', ')}\n`;
    }
    
    if (spacing.length > 0) {
        out += `SPACING: ${spacing.join(', ')}\n`;
    }
    
    if (radii.length > 0) {
        out += `RADIUS: ${radii.join(', ')}\n`;
    }
    
    if (shadows.length > 0) {
        out += `SHADOW: ${shadows.join('; ')}\n`;
    }
    
    out += '```';
    
    return out;
}

// ============================================
// INTENT: NEW COMPONENT WITH DESIGN
// ============================================

function formatComponentWithDesign(data) {
    if (!data?.tree) return '';
    const { tree } = data;
    
    let out = INTENTS['component-with-design'].prompt + '\n\n';
    out += '```\n';
    out += formatNodeSpec(tree, 0);
    out += '```';
    
    return out;
}

function formatNodeSpec(node, depth = 0) {
    if (!node || depth > 5) return '';
    
    const indent = '  '.repeat(depth);
    let out = '';
    
    out += `${indent}${node.tag.toUpperCase()}`;
    if (node.role && node.role !== 'element' && node.role !== 'container') {
        out += ` [${node.role}]`;
    }
    if (node.textContent) {
        // Mark text content as reference only - do not copy
        out += ` (text: "${node.textContent.slice(0, 30)}${node.textContent.length > 30 ? '...' : ''}" - REFERENCE ONLY)`;
    }
    out += '\n';
    
    const styles = getKeyStyles(node.styles);
    if (styles) {
        out += `${indent}  style: ${styles}\n`;
    }
    
    if (node.children?.length > 0) {
        for (const child of node.children) {
            out += formatNodeSpec(child, depth + 1);
        }
    }
    
    return out;
}

function getKeyStyles(styles) {
    if (!styles) return '';
    const parts = [];
    
    if (styles['display'] === 'flex') {
        let flex = 'flex';
        if (styles['flex-direction'] === 'column') flex += '-col';
        parts.push(flex);
    }
    if (styles['display'] === 'grid') parts.push('grid');
    if (styles['gap'] && styles['gap'] !== '0px') parts.push(`gap(${styles['gap']})`);
    if (styles['justify-content']) parts.push(`justify-${styles['justify-content'].replace('flex-', '').replace('space-', '')}`);
    if (styles['align-items']) parts.push(`items-${styles['align-items'].replace('flex-', '')}`);
    
    if (styles['padding'] && styles['padding'] !== '0px') parts.push(`p(${styles['padding']})`);
    if (styles['margin'] && styles['margin'] !== '0px') parts.push(`m(${styles['margin']})`);
    if (styles['border-radius'] && styles['border-radius'] !== '0px') parts.push(`rounded(${styles['border-radius']})`);
    
    if (styles['background-color'] && styles['background-color'] !== 'rgba(0, 0, 0, 0)') {
        parts.push(`bg(${styles['background-color']})`);
    }
    if (styles['color']) parts.push(`text(${styles['color']})`);
    
    if (styles['font-size']) parts.push(styles['font-size']);
    if (styles['font-weight'] && styles['font-weight'] !== '400') parts.push(`bold(${styles['font-weight']})`);
    
    if (styles['box-shadow'] && styles['box-shadow'] !== 'none') parts.push('shadow');
    
    return parts.join(', ');
}

// ============================================
// INTENT: STRUCTURE ONLY (no design)
// ============================================

function formatComponentWithoutDesign(data) {
    if (!data?.tree) return '';
    const { tree } = data;
    
    let out = INTENTS['component-without-design'].prompt + '\n\n';
    out += '```\n';
    out += formatStructureOnly(tree, 0);
    out += '```';
    
    return out;
}

function formatStructureOnly(node, depth = 0) {
    if (!node || depth > 5) return '';
    
    const indent = '  '.repeat(depth);
    let out = `${indent}${node.tag.toUpperCase()}`;
    
    if (node.role && node.role !== 'element' && node.role !== 'container') {
        out += ` [${node.role}]`;
    }
    
    const attrs = [];
    if (node.textContent) attrs.push(`(text: "${node.textContent.slice(0, 30)}${node.textContent.length > 30 ? '...' : ''}" - REFERENCE ONLY)`);
    if (node.href) attrs.push(`href`);
    if (node.src) attrs.push(`src`);
    if (node.alt) attrs.push(`alt="${node.alt}"`);
    if (node.placeholder) attrs.push(`placeholder`);
    
    if (attrs.length > 0) out += ` ${attrs.join(', ')}`;
    out += '\n';
    
    if (node.children?.length > 0) {
        for (const child of node.children) {
            out += formatStructureOnly(child, depth + 1);
        }
    }
    
    return out;
}

// ============================================
// INTENT: EXTRACT DESIGN TOKENS
// ============================================

function formatExtractTokens(data) {
    if (!data?.tree) return '';
    const { tree } = data;
    
    const colors = Array.from(collectColors(tree));
    const typo = collectTypography(tree);
    const spacing = Array.from(collectSpacing(tree)).sort((a, b) => parseInt(a) - parseInt(b));
    const radii = Array.from(collectBorderRadius(tree));
    const shadows = Array.from(collectShadows(tree));
    
    let out = INTENTS['extract-tokens'].prompt + '\n\n';
    out += '```\n';
    
    if (colors.length > 0) {
        out += `COLORS\n`;
        colors.forEach((c, i) => { out += `  ${i + 1}. ${c}\n`; });
        out += '\n';
    }
    
    if (typo.families.size > 0) {
        out += `FONTS\n`;
        Array.from(typo.families).forEach((f, i) => { out += `  ${i + 1}. ${f}\n`; });
        out += '\n';
    }
    
    if (typo.sizes.size > 0) {
        out += `FONT SIZES\n`;
        Array.from(typo.sizes).forEach((s, i) => { out += `  ${i + 1}. ${s}\n`; });
        out += '\n';
    }
    
    if (spacing.length > 0) {
        out += `SPACING\n`;
        spacing.forEach((s, i) => { out += `  ${i + 1}. ${s}\n`; });
        out += '\n';
    }
    
    if (radii.length > 0) {
        out += `BORDER RADIUS\n`;
        radii.forEach((r, i) => { out += `  ${i + 1}. ${r}\n`; });
        out += '\n';
    }
    
    if (shadows.length > 0) {
        out += `SHADOWS\n`;
        shadows.forEach((s, i) => { out += `  ${i + 1}. ${s}\n`; });
    }
    
    out += '```';
    
    return out;
}

// ============================================
// INTENT: EXTRACT GLOBAL THEME
// ============================================

function extractDesignTokens(data) {
    const globalCSS = data.globalCSS || {};
    const tree = data.tree;
    
    return {
        colors: tree ? Array.from(collectColors(tree)) : [],
        typo: tree ? collectTypography(tree) : { sizes: new Set(), weights: new Set(), families: new Set() },
        spacing: tree ? Array.from(collectSpacing(tree)).sort((a, b) => parseInt(a) - parseInt(b)) : [],
        radii: tree ? Array.from(collectBorderRadius(tree)) : [],
        shadows: tree ? Array.from(collectShadows(tree)) : [],
        rootVariables: globalCSS.rootVariables || {},
        darkVariables: globalCSS.darkVariables || {}
    };
}

function formatShadcnCSS(tokens) {
    let out = '```css\n';
    out += ':root {\n';
    out += '  /* Colors */\n';
    
    // Add extracted CSS variables if available
    if (Object.keys(tokens.rootVariables).length > 0) {
        for (const [name, value] of Object.entries(tokens.rootVariables)) {
            out += `  ${name}: ${value};\n`;
        }
    } else {
        // Generate from extracted colors
        tokens.colors.forEach((color, i) => {
            const colorName = i === 0 ? '--background' : i === 1 ? '--foreground' : `--color-${i + 1}`;
            out += `  ${colorName}: ${color};\n`;
        });
    }
    
    out += '\n  /* Typography */\n';
    if (tokens.typo.families.size > 0) {
        const families = Array.from(tokens.typo.families);
        out += `  --font-sans: ${families[0]}, sans-serif;\n`;
        if (families.length > 1) {
            out += `  --font-body: ${families[1]}, sans-serif;\n`;
        }
    }
    
    out += '\n  /* Spacing & Radius */\n';
    if (tokens.radii.length > 0) {
        out += `  --radius: ${tokens.radii[0]};\n`;
    }
    
    if (tokens.shadows.length > 0) {
        out += '\n  /* Shadows */\n';
        tokens.shadows.forEach((shadow, i) => {
            out += `  --shadow-${i + 1}: ${shadow};\n`;
        });
    }
    
    out += '}\n';
    
    // Add dark mode if available
    if (Object.keys(tokens.darkVariables).length > 0) {
        out += '\n.dark {\n';
        for (const [name, value] of Object.entries(tokens.darkVariables)) {
            out += `  ${name}: ${value};\n`;
        }
        out += '}\n';
    }
    
    out += '```';
    return out;
}

function formatExtractGlobalTheme(data) {
    if (!data) return '';
    
    let out = INTENTS['extract-global-theme'].prompt + '\n\n';
    
    const tokens = extractDesignTokens(data);
    
    // Always use Shadcn format in popup (format selector only in results page)
    out += formatShadcnCSS(tokens);
    
    out += '\n\n';
    
    // Add summary
    out += '**Extracted Values Summary:**\n';
    if (tokens.colors.length > 0) out += `- Colors: ${tokens.colors.length} values\n`;
    if (tokens.typo.families.size > 0) out += `- Fonts: ${Array.from(tokens.typo.families).join(', ')}\n`;
    if (tokens.typo.sizes.size > 0) out += `- Font sizes: ${Array.from(tokens.typo.sizes).join(', ')}\n`;
    if (tokens.spacing.length > 0) out += `- Spacing: ${tokens.spacing.join(', ')}\n`;
    if (tokens.radii.length > 0) out += `- Border radius: ${tokens.radii.join(', ')}\n`;
    if (tokens.shadows.length > 0) out += `- Shadows: ${tokens.shadows.length} values\n`;
    
    return out;
}

// ============================================
// FORMAT ROUTER
// ============================================

function formatOutput(data, intentId) {
    switch (intentId) {
        case 'copy-design':
            return formatCopyDesign(data);
        case 'component-with-design':
            return formatComponentWithDesign(data);
        case 'component-without-design':
            return formatComponentWithoutDesign(data);
        case 'extract-tokens':
            return formatExtractTokens(data);
        case 'extract-global-theme':
            return formatExtractGlobalTheme(data);
        case 'adapt-to-codebase':
            return formatAdaptToCodebase(data);
        case 'smart-component':
            return formatSmartComponentPopup(data);
        case 'shadcn-component':
            return formatShadcnComponent(data);
        default:
            return formatCopyDesign(data);
    }
}

// ============================================
// SHADCN COMPONENT FORMATTING
// ============================================

function formatShadcnComponent(data) {
    if (!data?.tree) return 'No component data available. Select an element first.';
    
    return `🧱 Build with shadcn/ui

This will generate a production-ready React component using shadcn/ui.

**What happens:**
1. Detect required components (Card, Button, Badge, etc.)
2. Fetch real shadcn components from registry
3. AI composes them to match your selected design
4. Get copy-paste ready TSX code

**Requirements:**
- Gemini API key (free from Google AI Studio)
- AI Enhancement must be enabled

Click a captured element to build, or select a new element.`;
}

// Smart component - simplified version for popup (full version in results.js)
function formatSmartComponentPopup(data) {
    if (!data?.tree) return 'No component data available.';
    
    let out = INTENTS['smart-component'].prompt + '\n\n';
    out += '---\n\n';
    out += 'This intent works best on the **Results Page** where you can see:\n';
    out += '- Full component hierarchy visualization\n';
    out += '- Styles categorized by element role\n';
    out += '- Color palette with usage context\n';
    out += '- Implementation hints\n\n';
    out += 'The results page opens automatically after selection.\n\n';
    out += '---\n\n';
    out += '**Quick Preview:**\n\n';
    out += formatQuickHierarchy(data.tree, '', 0);
    
    return out;
}

function formatQuickHierarchy(node, prefix = '', depth = 0) {
    if (!node || depth > 4) return '';
    
    let out = '';
    const role = node.role || node.tag || 'element';
    
    out += `${prefix}• [${role.toUpperCase()}] <${node.tag}>`;
    if (node.textContent && node.textContent.length < 20) {
        out += ` "${node.textContent}"`;
    }
    out += '\n';
    
    const children = node.children || [];
    for (const child of children.slice(0, 5)) {
        out += formatQuickHierarchy(child, prefix + '  ', depth + 1);
    }
    
    if (children.length > 5) {
        out += `${prefix}  ... and ${children.length - 5} more\n`;
    }
    
    return out;
}

function formatAdaptToCodebase(data) {
    return `${INTENTS['adapt-to-codebase'].prompt}

Click the button below to open the full results page where you can:
• Paste your existing CSS for intelligent mapping
• Define custom selector mappings
• Select your framework (Tailwind, Bootstrap, etc.)
• Preview changes live on any website
• Get AI-optimized prompts for external tools

---

**Tip:** The results page opens automatically when you extract styles.
For full adaptation features, use the results page.`;
}

// ============================================
// HISTORY MANAGEMENT
// ============================================

function loadHistory() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['captureHistory'], (result) => {
            captureHistory = result.captureHistory || [];
            resolve(captureHistory);
        });
    });
}

function saveHistory() {
    return new Promise((resolve) => {
        chrome.storage.local.set({ captureHistory }, resolve);
    });
}

async function deleteHistoryItem(id) {
    captureHistory = captureHistory.filter(item => item.id !== id);
    await saveHistory();
}

async function clearHistory() {
    captureHistory = [];
    await saveHistory();
}

// ============================================
// UI RENDERING
// ============================================

function renderHistory() {
    const historyList = document.getElementById('historyList');
    
    if (captureHistory.length === 0) {
        historyList.innerHTML = '<div class="history-empty">No captures yet</div>';
        return;
    }
    
    historyList.innerHTML = captureHistory.map((item, index) => `
        <div class="history-item ${index === selectedHistoryIndex ? 'active' : ''}" data-index="${index}">
            ${item.thumbnail 
                ? `<img class="history-thumb" src="${item.thumbnail}" alt="Preview" />`
                : `<div class="history-thumb" style="display:flex;align-items:center;justify-content:center;color:#9a9a9a;font-size:18px;">📷</div>`
            }
            <div class="history-info">
                <div class="history-title">${item.pageTitle}</div>
                <div class="history-meta">&lt;${item.elementTag}&gt; · ${item.elementCount} element${item.elementCount > 1 ? 's' : ''}</div>
            </div>
            <button class="history-delete" data-id="${item.id}" title="Delete">×</button>
        </div>
    `).join('');
    
    historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('history-delete')) return;
            const index = parseInt(item.dataset.index);
            selectHistoryItem(index);
        });
    });
    
    historyList.querySelectorAll('.history-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            await deleteHistoryItem(id);
            
            if (selectedHistoryIndex >= captureHistory.length) {
                selectedHistoryIndex = captureHistory.length - 1;
            }
            
            renderHistory();
            
            if (captureHistory.length > 0 && selectedHistoryIndex >= 0) {
                selectHistoryItem(selectedHistoryIndex);
            } else {
                document.getElementById('result').style.display = 'none';
                currentData = null;
            }
        });
    });
}

function selectHistoryItem(index) {
    selectedHistoryIndex = index;
    const item = captureHistory[index];
    if (!item) return;
    
    currentData = item.data;
    updateOutput();
    renderHistory();
}

async function updateOutput() {
    if (!currentData) return;
    
    document.getElementById('result').style.display = 'block';
    
    const standardOutput = document.getElementById('standardOutput');
    const shadcnOutput = document.getElementById('shadcnOutput');
    
    // Handle shadcn-component intent specially
    if (currentIntent === 'shadcn-component') {
        standardOutput.style.display = 'none';
        shadcnOutput.style.display = 'block';
        
        // Build the shadcn component
        await buildAndDisplayShadcnComponent();
        return;
    }
    
    // Standard output for other intents
    standardOutput.style.display = 'block';
    shadcnOutput.style.display = 'none';
    
    // Try AI enhancement first
    let output;
    let isEnhanced = false;
    
    if (aiEnhancementEnabled && window.EnhancedPromptGenerator) {
        const enhanced = await getEnhancedOutput(currentData, currentIntent);
        if (enhanced && enhanced.output) {
            output = enhanced.output;
            isEnhanced = enhanced.enhanced;
        }
    }
    
    // Fallback to template-based output
    if (!output) {
        if (window.EnhancedPromptGenerator) {
            output = window.EnhancedPromptGenerator.generateQuickPrompt(currentData, currentIntent);
        } else {
            output = formatOutput(currentData, currentIntent);
        }
    }
    
    document.getElementById('output').value = output;
    
    if (currentData.screenshot) {
        const previewContainer = document.getElementById('screenshotPreview');
        const previewImg = document.getElementById('previewImg');
        previewImg.src = currentData.screenshot;
        previewContainer.style.display = 'block';
    } else {
        document.getElementById('screenshotPreview').style.display = 'none';
    }
    
    const count = currentData.elementCount || 1;
    let statusText = `Captured ${count} element${count > 1 ? 's' : ''}`;
    if (isEnhanced) {
        statusText += ' ✨ AI-Enhanced Prompt';
    } else if (aiEnhancementEnabled) {
        statusText += ' (using template - AI fallback)';
    }
    document.getElementById('status').innerText = statusText;
}

// ============================================
// SHADCN BUILD FUNCTIONS
// ============================================

async function buildAndDisplayShadcnComponent() {
    if (!currentData) return;
    
    const statusEl = document.getElementById('status');
    const componentCode = document.getElementById('componentCode');
    const cssVariables = document.getElementById('cssVariables');
    const installCommand = document.getElementById('installCommand');
    const usageExample = document.getElementById('usageExample');
    const componentsList = document.getElementById('componentsList');
    
    // Check if we have the required modules
    if (!window.ShadcnBuilder) {
        componentCode.value = 'Error: ShadcnBuilder module not loaded. Please refresh the extension.';
        statusEl.innerText = 'Error: Module not loaded';
        return;
    }
    
    // Check for API key
    if (window.GeminiService) {
        const status = await window.GeminiService.getServiceStatus();
        if (!status.hasApiKey || !status.isValid) {
            componentCode.value = `🔑 Gemini API Key Required

To build shadcn components, you need a Gemini API key.

Steps:
1. Click the ⚙️ Settings button above
2. Get your free API key from Google AI Studio
3. Paste it and save
4. Enable AI Enhancement toggle
5. Try again!

The API is free and takes 30 seconds to set up.`;
            statusEl.innerText = 'API key required - click ⚙️';
            return;
        }
    }
    
    // Show building state
    isBuildingShadcn = true;
    statusEl.innerHTML = '<span style="color: #6366f1;">🔨 Building component...</span>';
    componentCode.value = 'Building your shadcn component...\n\nStep 1: Detecting required components...\nStep 2: Fetching from shadcn registry...\nStep 3: AI composing component...';
    cssVariables.value = 'Generating...';
    installCommand.textContent = 'npx shadcn@latest add ...';
    usageExample.textContent = '';
    componentsList.innerHTML = '<span style="color: #9a9a9a;">Detecting...</span>';
    
    try {
        // Build the component
        const result = await window.ShadcnBuilder.buildShadcnComponent(currentData);
        
        shadcnBuildResult = result;
        
        if (result.success) {
            // Update component code
            componentCode.value = result.componentCode || '// No component code generated';
            
            // Update CSS variables
            cssVariables.value = result.cssVariables || '/* No additional CSS variables needed - using shadcn defaults */';
            
            // Update install command
            installCommand.textContent = result.installCommand || 'npx shadcn@latest add card button';
            
            // Update usage example
            usageExample.textContent = result.usageExample || `<${result.componentName || 'Component'} />`;
            
            // Update detected components badges
            const components = result.detectedComponents || [];
            componentsList.innerHTML = components.length > 0
                ? components.map(c => `<span class="component-badge">${c}</span>`).join('')
                : '<span style="color: #9a9a9a;">None detected</span>';
            
            statusEl.innerHTML = `<span style="color: #4ade80;">✓ Built ${result.componentName || 'component'}</span> using ${components.length} shadcn components`;
        } else {
            componentCode.value = `// Build failed: ${result.error || 'Unknown error'}\n\n` +
                (result.rawResponse ? `// Raw response:\n${result.rawResponse.slice(0, 500)}...` : '');
            statusEl.innerHTML = `<span style="color: #f87171;">✗ Build failed: ${result.error}</span>`;
        }
    } catch (error) {
        console.error('[Popup] Shadcn build error:', error);
        componentCode.value = `// Error: ${error.message}\n\nPlease check:\n1. API key is valid\n2. Network connection\n3. Try again`;
        statusEl.innerHTML = `<span style="color: #f87171;">✗ Error: ${error.message}</span>`;
    } finally {
        isBuildingShadcn = false;
    }
}

function showShadcnTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.output-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabName + 'Tab');
    });
}

// ============================================
// EVENT HANDLERS
// ============================================

document.getElementById('selectBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        chrome.tabs.sendMessage(tab.id, { action: 'START_SELECTION' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                document.getElementById('status').innerText = 'Error: Please refresh the page and try again.';
            } else {
                window.close();
            }
        });
    } catch (e) {
        console.error('Injection failed:', e);
        document.getElementById('status').innerText = 'Cannot run on this page (try a public website).';
    }
});

// Extract Global Theme button - extracts entire website's CSS without element selection
document.getElementById('extractGlobalBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        document.getElementById('status').innerText = 'Error: No active tab found.';
        return;
    }
    
    // Check if we can run on this tab
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('about:')) {
        document.getElementById('status').innerText = 'Cannot run on this page (try a public website).';
        return;
    }

    // Show scanning status
    const statusEl = document.getElementById('status');
    const extractBtn = document.getElementById('extractGlobalBtn');
    
    statusEl.innerHTML = '<span style="color: #6b8f71;">⏳ Deep scanning page styles...</span>';
    extractBtn.disabled = true;
    extractBtn.innerText = 'Scanning...';

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });

        // Small delay to ensure content script is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_GLOBAL_THEME' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error:', chrome.runtime.lastError.message);
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + chrome.runtime.lastError.message + '</span>';
                extractBtn.disabled = false;
                extractBtn.innerText = 'Extract Global Theme';
                return;
            }
            
            if (response && response.status === 'error') {
                statusEl.innerHTML = '<span style="color: #e57373;">Error: ' + (response.message || 'Unknown error') + '</span>';
                extractBtn.disabled = false;
                extractBtn.innerText = 'Extract Global Theme';
                return;
            }
            
            // Auto-select the global theme intent
            currentIntent = 'extract-global-theme';
            document.querySelectorAll('.intent-option').forEach(b => b.classList.remove('active'));
            const globalThemeBtn = document.querySelector('[data-intent="extract-global-theme"]');
            if (globalThemeBtn) globalThemeBtn.classList.add('active');
            
            window.close();
        });
    } catch (e) {
        console.error('Injection failed:', e);
        statusEl.innerHTML = '<span style="color: #e57373;">Cannot run on this page (try a public website).</span>';
        extractBtn.disabled = false;
        extractBtn.innerText = 'Extract Global Theme';
    }
});

// Intent selector
document.querySelectorAll('.intent-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.intent-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentIntent = btn.dataset.intent;
        
        if (currentData) {
            updateOutput();
        }
    });
});

// Clear history
document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
    await clearHistory();
    selectedHistoryIndex = -1;
    currentData = null;
    document.getElementById('result').style.display = 'none';
    renderHistory();
});

// Copy text - handles both standard and shadcn outputs
document.getElementById('copyBtn').addEventListener('click', async () => {
    let textToCopy;
    
    // Check if we're in shadcn mode
    if (currentIntent === 'shadcn-component') {
        // Get the active tab's content
        const activeTab = document.querySelector('.output-tab.active');
        if (activeTab) {
            const tabName = activeTab.dataset.tab;
            if (tabName === 'component') {
                textToCopy = document.getElementById('componentCode').value;
            } else if (tabName === 'styles') {
                textToCopy = document.getElementById('cssVariables').value;
            } else if (tabName === 'install') {
                textToCopy = document.getElementById('installCommand').textContent;
            }
        }
        textToCopy = textToCopy || document.getElementById('componentCode').value;
    } else {
        textToCopy = document.getElementById('output').value;
    }
    
    try {
        await navigator.clipboard.writeText(textToCopy);
        const copyBtn = document.getElementById('copyBtn');
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => { copyBtn.innerText = originalText; }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
});

// Copy with image
document.getElementById('copyWithImageBtn').addEventListener('click', async () => {
    if (!currentData) return;
    
    let textToCopy;
    
    // Check if we're in shadcn mode
    if (currentIntent === 'shadcn-component') {
        textToCopy = document.getElementById('componentCode').value;
    } else {
        textToCopy = document.getElementById('output').value;
    }
    
    const copyBtn = document.getElementById('copyWithImageBtn');
    
    try {
        if (currentData.screenshot) {
            const response = await fetch(currentData.screenshot);
            const blob = await response.blob();
            
            const clipboardItems = [
                new ClipboardItem({
                    'text/plain': new Blob([textToCopy], { type: 'text/plain' }),
                    'image/png': blob
                })
            ];
            
            await navigator.clipboard.write(clipboardItems);
            copyBtn.innerText = 'Copied!';
        } else {
            await navigator.clipboard.writeText(textToCopy);
            copyBtn.innerText = 'Copied!';
        }
        
        setTimeout(() => { copyBtn.innerText = 'Copy + Image'; }, 2000);
    } catch (err) {
        console.error('Failed to copy with image:', err);
        try {
            await navigator.clipboard.writeText(textToCopy);
            copyBtn.innerText = 'Copied!';
            setTimeout(() => { copyBtn.innerText = 'Copy + Image'; }, 2000);
        } catch (e) {
            console.error('Fallback copy failed:', e);
        }
    }
});

// ============================================
// AI ENHANCEMENT FUNCTIONS
// ============================================

async function initializeAIStatus() {
    const aiToggle = document.getElementById('aiToggle');
    const aiStatus = document.getElementById('aiStatus');
    
    if (!window.GeminiService) {
        aiStatus.textContent = 'AI service not loaded';
        aiToggle.disabled = true;
        return;
    }
    
    try {
        const status = await window.GeminiService.getServiceStatus();
        
        if (status.hasApiKey && status.isValid) {
            aiStatus.textContent = `Gemini 2.0 Flash • ${status.requestsRemaining}/min`;
            aiToggle.checked = true;
            aiEnhancementEnabled = true;
        } else if (status.hasApiKey && !status.isValid) {
            aiStatus.textContent = 'Invalid API key - click ⚙️';
            aiToggle.checked = false;
            aiEnhancementEnabled = false;
        } else {
            aiStatus.textContent = 'Click ⚙️ to add API key';
            aiToggle.checked = false;
            aiEnhancementEnabled = false;
        }
    } catch (e) {
        aiStatus.textContent = 'Error checking status';
        aiToggle.disabled = true;
    }
}

function showAILoading(show) {
    const loadingEl = document.getElementById('aiLoading');
    if (loadingEl) {
        loadingEl.classList.toggle('active', show);
    }
    isEnhancing = show;
}

async function getEnhancedOutput(data, intent) {
    if (!aiEnhancementEnabled || !window.EnhancedPromptGenerator) {
        console.log('[Design Copier] AI enhancement disabled or not available');
        return null;
    }
    
    try {
        console.log('[Design Copier] Starting AI enhancement for intent:', intent);
        showAILoading(true);
        
        const result = await window.EnhancedPromptGenerator.generateEnhancedPrompt(data, intent, {
            useGemini: true
        });
        showAILoading(false);
        
        console.log('[Design Copier] AI result:', {
            success: result.success,
            enhanced: result.enhanced,
            source: result.source,
            promptLength: result.prompt?.length || 0
        });
        
        if (result.success || result.prompt) {
            return {
                output: result.prompt,
                enhanced: result.enhanced,
                source: result.source
            };
        }
    } catch (e) {
        console.error('[Design Copier] AI enhancement failed:', e);
        showAILoading(false);
    }
    
    return null;
}

// ============================================
// SETTINGS MODAL
// ============================================

function openSettings() {
    const modal = document.getElementById('settingsModal');
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    modal.classList.add('active');
    
    // Load existing API key (masked)
    if (window.GeminiService) {
        window.GeminiService.getApiKey().then(key => {
            if (key) {
                apiKeyInput.value = '••••••••••••••••';
                apiKeyInput.dataset.hasKey = 'true';
            }
        });
    }
}

function closeSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.remove('active');
}

async function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const statusEl = document.getElementById('apiKeyStatus');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    
    const key = apiKeyInput.value.trim();
    
    // Don't save if it's the masked placeholder
    if (key === '••••••••••••••••') {
        closeSettings();
        return;
    }
    
    if (!key) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ Please enter an API key';
        statusEl.style.display = 'flex';
        return;
    }
    
    if (key.length < 20) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '⚠️ API key seems too short. Get your key from Google AI Studio.';
        statusEl.style.display = 'flex';
        return;
    }
    
    // Show checking state
    statusEl.className = 'api-status checking';
    statusEl.innerHTML = '🔄 Validating API key with Gemini 2.0 Flash...';
    statusEl.style.display = 'flex';
    saveBtn.disabled = true;
    
    try {
        const isValid = await window.GeminiService.validateApiKey(key);
        
        if (isValid) {
            await window.GeminiService.setApiKey(key);
            statusEl.className = 'api-status valid';
            statusEl.innerHTML = '✓ API key saved! Using Gemini 2.0 Flash (free preview)';
            
            // Update toggle status
            aiEnhancementEnabled = true;
            document.getElementById('aiToggle').checked = true;
            document.getElementById('aiStatus').textContent = 'Ready (Gemini 2.0 Flash)';
            
            setTimeout(() => {
                closeSettings();
                statusEl.style.display = 'none';
            }, 1500);
        } else {
            statusEl.className = 'api-status invalid';
            statusEl.innerHTML = '✗ Invalid API key. Make sure you copied the full key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>';
        }
    } catch (e) {
        statusEl.className = 'api-status invalid';
        statusEl.innerHTML = '✗ Error: ' + e.message;
    }
    
    saveBtn.disabled = false;
}

// ============================================
// INITIALIZATION
// ============================================

window.addEventListener('DOMContentLoaded', async () => {
    await loadHistory();
    renderHistory();
    
    // Initialize AI status
    await initializeAIStatus();
    
    // AI Toggle handler
    document.getElementById('aiToggle').addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        
        if (isChecked && window.GeminiService) {
            const status = await window.GeminiService.getServiceStatus();
            if (!status.hasApiKey || !status.isValid) {
                e.target.checked = false;
                openSettings();
                return;
            }
        }
        
        aiEnhancementEnabled = isChecked;
        
        // Re-generate output if we have data
        if (currentData) {
            updateOutput();
        }
    });
    
    // Settings button handler
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
    document.getElementById('saveApiKeyBtn').addEventListener('click', saveApiKey);
    
    // Close modal on overlay click
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') {
            closeSettings();
        }
    });
    
    // Shadcn output tab handlers
    document.querySelectorAll('.output-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            showShadcnTab(tab.dataset.tab);
        });
    });
    
    // Copy install command button
    const copyInstallBtn = document.getElementById('copyInstallBtn');
    if (copyInstallBtn) {
        copyInstallBtn.addEventListener('click', async () => {
            const installCommand = document.getElementById('installCommand');
            try {
                await navigator.clipboard.writeText(installCommand.textContent);
                copyInstallBtn.textContent = 'Copied!';
                setTimeout(() => { copyInstallBtn.textContent = 'Copy Command'; }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        });
    }
    
    chrome.storage.local.get(['lastSelection'], async (result) => {
        if (result.lastSelection) {
            const isNew = !captureHistory.some(item => 
                item.timestamp === result.lastSelection.timestamp
            );
            
            if (isNew && captureHistory.length === 0) {
                await loadHistory();
                renderHistory();
            }
            
            if (captureHistory.length > 0) {
                selectedHistoryIndex = 0;
                currentData = captureHistory[0].data;
                updateOutput();
                renderHistory();
            }
        } else if (captureHistory.length > 0) {
            selectedHistoryIndex = 0;
            currentData = captureHistory[0].data;
            updateOutput();
        }
    });
});
