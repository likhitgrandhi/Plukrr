// ============================================
// Design Copier - Results Page
// Intent-based output generation with deep scan support
// Enhanced with Gemini AI
// ============================================

let currentData = null;
let currentIntent = 'apply-design';
let aiEnhancementEnabled = false;
let isEnhancing = false;
let currentPromptStyle = 'auto';
let smartComponentMode = 'visual'; // Legacy - kept for backwards compatibility

// ============================================
// 4 CORE INTENTS - Simplified & Focused
// ============================================

const INTENTS = {
    'apply-design': {
        id: 'apply-design',
        label: 'Apply Design',
        description: 'Apply styles to existing component',
        icon: '🎨'
    },
    'replicate-design': {
        id: 'replicate-design',
        label: 'Replicate',
        description: 'Pixel-perfect copy',
        icon: '📋'
    },
    'global-tokens': {
        id: 'global-tokens',
        label: 'CSS Tokens',
        description: 'Design system variables',
        icon: '🎯'
    },
    'shadcn-component': {
        id: 'shadcn-component',
        label: 'shadcn/ui',
        description: 'React components',
        icon: '🧱',
        requiresAI: true
    }
};

// Legacy intent mapping - use from gemini-service.js or this local copy
function mapLegacyIntent(intent) {
    const map = {
        'copy-design': 'apply-design',
        'component-with-design': 'replicate-design',
        'component-without-design': 'replicate-design',
        'extract-tokens': 'global-tokens',
        'extract-global-theme': 'global-tokens',
        'adapt-to-codebase': 'apply-design',
        'smart-component': 'apply-design'
    };
    return map[intent] || intent;
}

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
// SMART COMPONENT - SEMANTIC ANALYSIS
// ============================================

// Semantic role detection based on element characteristics
function detectSemanticRole(node) {
    if (!node) return { role: 'unknown', confidence: 0 };
    
    const tag = (node.tag || '').toLowerCase();
    const classes = (node.selector || '').toLowerCase();
    const role = (node.role || '').toLowerCase();
    const text = (node.textContent || '').toLowerCase();
    const styles = node.styles || {};
    const childCount = (node.children || []).length;
    
    // High confidence detections based on tag/role
    const tagRoles = {
        'button': { role: 'trigger', subRole: 'button', confidence: 0.9 },
        'a': { role: 'link', subRole: 'anchor', confidence: 0.9 },
        'input': { role: 'input', subRole: 'field', confidence: 0.9 },
        'textarea': { role: 'input', subRole: 'textarea', confidence: 0.9 },
        'select': { role: 'trigger', subRole: 'select', confidence: 0.9 },
        'img': { role: 'media', subRole: 'image', confidence: 0.95 },
        'svg': { role: 'icon', subRole: 'svg-icon', confidence: 0.8 },
        'i': { role: 'icon', subRole: 'font-icon', confidence: 0.7 },
        'ul': { role: 'list', subRole: 'unordered-list', confidence: 0.9 },
        'ol': { role: 'list', subRole: 'ordered-list', confidence: 0.9 },
        'li': { role: 'list-item', subRole: 'item', confidence: 0.9 },
        'nav': { role: 'navigation', subRole: 'nav', confidence: 0.95 },
        'header': { role: 'header', subRole: 'section-header', confidence: 0.9 },
        'footer': { role: 'footer', subRole: 'section-footer', confidence: 0.9 },
        'h1': { role: 'heading', subRole: 'title', confidence: 0.95 },
        'h2': { role: 'heading', subRole: 'subtitle', confidence: 0.95 },
        'h3': { role: 'heading', subRole: 'section-title', confidence: 0.95 },
        'h4': { role: 'heading', subRole: 'subsection-title', confidence: 0.9 },
        'h5': { role: 'heading', subRole: 'minor-title', confidence: 0.9 },
        'h6': { role: 'heading', subRole: 'minor-title', confidence: 0.9 },
        'p': { role: 'text', subRole: 'paragraph', confidence: 0.85 },
        'span': { role: 'text', subRole: 'inline-text', confidence: 0.5 },
        'label': { role: 'label', subRole: 'form-label', confidence: 0.9 },
        'form': { role: 'form', subRole: 'form-container', confidence: 0.95 },
        'table': { role: 'table', subRole: 'data-table', confidence: 0.95 },
        'hr': { role: 'divider', subRole: 'separator', confidence: 0.95 },
    };
    
    if (tagRoles[tag]) {
        return tagRoles[tag];
    }
    
    // Class-based detection
    const classPatterns = [
        { patterns: ['dropdown', 'popover', 'menu', 'select'], role: 'dropdown', subRole: 'menu-container' },
        { patterns: ['modal', 'dialog', 'popup'], role: 'modal', subRole: 'overlay' },
        { patterns: ['card', 'panel', 'tile', 'box'], role: 'card', subRole: 'content-card' },
        { patterns: ['btn', 'button', 'cta'], role: 'trigger', subRole: 'button' },
        { patterns: ['icon', 'fa-', 'material-icon', 'lucide'], role: 'icon', subRole: 'decorative-icon' },
        { patterns: ['avatar', 'profile-pic', 'user-image'], role: 'avatar', subRole: 'user-avatar' },
        { patterns: ['badge', 'tag', 'chip', 'pill', 'label'], role: 'badge', subRole: 'status-badge' },
        { patterns: ['input', 'field', 'text-box'], role: 'input', subRole: 'text-input' },
        { patterns: ['item', 'option', 'entry', 'row'], role: 'list-item', subRole: 'item' },
        { patterns: ['header', 'head', 'top'], role: 'header', subRole: 'component-header' },
        { patterns: ['footer', 'foot', 'bottom'], role: 'footer', subRole: 'component-footer' },
        { patterns: ['body', 'content', 'main'], role: 'body', subRole: 'content-area' },
        { patterns: ['title', 'heading', 'headline'], role: 'heading', subRole: 'title' },
        { patterns: ['desc', 'description', 'subtitle', 'caption'], role: 'text', subRole: 'description' },
        { patterns: ['action', 'toolbar', 'controls'], role: 'actions', subRole: 'action-bar' },
        { patterns: ['nav', 'menu', 'sidebar'], role: 'navigation', subRole: 'nav-menu' },
        { patterns: ['tab'], role: 'tab', subRole: 'tab-item' },
        { patterns: ['separator', 'divider', 'line'], role: 'divider', subRole: 'separator' },
        { patterns: ['overlay', 'backdrop', 'mask'], role: 'overlay', subRole: 'backdrop' },
        { patterns: ['trigger', 'toggle', 'expand'], role: 'trigger', subRole: 'toggle' },
        { patterns: ['close', 'dismiss', 'cancel'], role: 'trigger', subRole: 'close-button' },
        { patterns: ['search'], role: 'input', subRole: 'search-input' },
        { patterns: ['check', 'checkbox'], role: 'input', subRole: 'checkbox' },
        { patterns: ['radio'], role: 'input', subRole: 'radio' },
        { patterns: ['switch', 'toggle'], role: 'input', subRole: 'switch' },
        { patterns: ['progress', 'loader', 'spinner'], role: 'feedback', subRole: 'loading' },
        { patterns: ['error', 'warning', 'success', 'info', 'alert'], role: 'feedback', subRole: 'alert' },
    ];
    
    for (const { patterns, role: r, subRole } of classPatterns) {
        if (patterns.some(p => classes.includes(p))) {
            return { role: r, subRole, confidence: 0.75 };
        }
    }
    
    // Style-based detection
    if (styles.display === 'flex' || styles.display === 'grid') {
        if (childCount > 0) {
            return { role: 'container', subRole: 'layout-container', confidence: 0.6 };
        }
    }
    
    if (styles.cursor === 'pointer' && tag === 'div') {
        return { role: 'trigger', subRole: 'clickable', confidence: 0.5 };
    }
    
    if (styles['box-shadow'] && styles['box-shadow'] !== 'none' && styles['border-radius']) {
        return { role: 'card', subRole: 'elevated-container', confidence: 0.5 };
    }
    
    // Text content detection
    if (text && !childCount) {
        if (text.length < 20) {
            return { role: 'text', subRole: 'label', confidence: 0.6 };
        }
        return { role: 'text', subRole: 'content', confidence: 0.6 };
    }
    
    // Default container
    if (childCount > 0) {
        return { role: 'container', subRole: 'wrapper', confidence: 0.4 };
    }
    
    return { role: 'element', subRole: 'generic', confidence: 0.3 };
}

// Build semantic tree with roles and purposes
function buildSemanticTree(node, depth = 0, parentRole = null) {
    if (!node || depth > 8) return null;
    
    const semantic = detectSemanticRole(node);
    const styles = categorizeStyles(node.styles || {});
    
    // Determine purpose based on role and context
    const purpose = describePurpose(semantic, node, parentRole);
    
    const semanticNode = {
        tag: node.tag,
        selector: node.selector,
        role: semantic.role,
        subRole: semantic.subRole,
        confidence: semantic.confidence,
        purpose: purpose,
        styles: styles,
        dimensions: node.dimensions,
        textContent: node.textContent,
        children: []
    };
    
    // Process children
    if (node.children && node.children.length > 0) {
        for (const child of node.children) {
            const semanticChild = buildSemanticTree(child, depth + 1, semantic.role);
            if (semanticChild) {
                semanticNode.children.push(semanticChild);
            }
        }
    }
    
    return semanticNode;
}

// Describe the purpose of an element
function describePurpose(semantic, node, parentRole) {
    const { role, subRole } = semantic;
    
    const purposes = {
        'trigger:button': 'Clickable button for user actions',
        'trigger:toggle': 'Toggle that opens/closes content',
        'trigger:close-button': 'Closes the component',
        'trigger:clickable': 'Interactive clickable element',
        'trigger:select': 'Dropdown selection trigger',
        'container:wrapper': 'Groups child elements together',
        'container:layout-container': 'Arranges children in flex/grid layout',
        'card:content-card': 'Self-contained content block with visual boundary',
        'card:elevated-container': 'Raised container with shadow',
        'dropdown:menu-container': 'Dropdown menu that shows options',
        'list:unordered-list': 'List of items without specific order',
        'list:ordered-list': 'Numbered list of items',
        'list-item:item': 'Individual item within a list',
        'icon:svg-icon': 'SVG icon graphic',
        'icon:font-icon': 'Icon from icon font',
        'icon:decorative-icon': 'Decorative icon element',
        'text:paragraph': 'Block of text content',
        'text:inline-text': 'Inline text span',
        'text:description': 'Descriptive or supporting text',
        'text:label': 'Short text label',
        'text:content': 'Main text content',
        'heading:title': 'Primary title/heading',
        'heading:subtitle': 'Secondary heading',
        'heading:section-title': 'Section heading',
        'input:field': 'Text input field',
        'input:text-input': 'Text entry field',
        'input:search-input': 'Search input field',
        'input:checkbox': 'Checkbox toggle',
        'input:radio': 'Radio button option',
        'input:switch': 'On/off toggle switch',
        'input:textarea': 'Multi-line text input',
        'avatar:user-avatar': 'User profile picture',
        'badge:status-badge': 'Status indicator badge/tag',
        'divider:separator': 'Visual separator between sections',
        'header:component-header': 'Header section of component',
        'header:section-header': 'Header for a section',
        'footer:component-footer': 'Footer section of component',
        'body:content-area': 'Main content area',
        'actions:action-bar': 'Container for action buttons',
        'navigation:nav-menu': 'Navigation menu',
        'tab:tab-item': 'Tab for switching views',
        'modal:overlay': 'Modal dialog overlay',
        'feedback:loading': 'Loading/progress indicator',
        'feedback:alert': 'Alert/notification message',
        'media:image': 'Image content',
        'link:anchor': 'Navigation link',
        'label:form-label': 'Label for form input',
        'form:form-container': 'Form for user input',
        'overlay:backdrop': 'Background overlay',
    };
    
    const key = `${role}:${subRole}`;
    return purposes[key] || `${role} element`;
}

// Categorize styles by type
function categorizeStyles(styles) {
    if (!styles || Object.keys(styles).length === 0) {
        return null;
    }
    
    const categorized = {
        layout: {},
        spacing: {},
        visual: {},
        typography: {},
        interactive: {}
    };
    
    const layoutProps = ['display', 'position', 'flex-direction', 'justify-content', 'align-items', 'flex-wrap', 'gap', 'grid-template-columns', 'grid-template-rows', 'top', 'left', 'right', 'bottom', 'z-index'];
    const spacingProps = ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'];
    const visualProps = ['background', 'background-color', 'border', 'border-radius', 'border-color', 'border-width', 'box-shadow', 'opacity', 'overflow'];
    const typographyProps = ['color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform'];
    const interactiveProps = ['cursor', 'transition', 'transform'];
    
    for (const [prop, value] of Object.entries(styles)) {
        if (!value || value === 'initial' || value === 'none' || value === 'normal' || value === 'auto') continue;
        
        if (layoutProps.includes(prop)) {
            categorized.layout[prop] = value;
        } else if (spacingProps.includes(prop)) {
            categorized.spacing[prop] = value;
        } else if (visualProps.includes(prop)) {
            categorized.visual[prop] = value;
        } else if (typographyProps.includes(prop)) {
            categorized.typography[prop] = value;
        } else if (interactiveProps.includes(prop)) {
            categorized.interactive[prop] = value;
        }
    }
    
    // Remove empty categories
    for (const key of Object.keys(categorized)) {
        if (Object.keys(categorized[key]).length === 0) {
            delete categorized[key];
        }
    }
    
    return Object.keys(categorized).length > 0 ? categorized : null;
}

// Format smart component output - with mode selection
function formatSmartComponent(data) {
    if (!data?.tree) return 'No component data available.';
    
    // Build semantic tree
    const semanticTree = buildSemanticTree(data.tree);
    if (!semanticTree) return 'Could not analyze component structure.';
    
    // Use selected mode
    if (smartComponentMode === 'visual') {
        return formatSmartComponentVisual(semanticTree, data);
    } else {
        return formatSmartComponentStructure(semanticTree, data);
    }
}

// VISUAL MODE - Just component styles, no hierarchy
function formatSmartComponentVisual(semanticTree, data) {
    let out = `TASK: Apply these visual styles to your component.

Each section below is a COMPONENT TYPE with its visual styles.
Apply to matching elements in your code. Layout/position not included - keep your own.

`;
    
    // Collect all components by type
    const components = collectComponentsByType(semanticTree);
    
    out += '```\n';
    
    // Output each component type
    for (const [type, items] of Object.entries(components)) {
        if (items.length === 0) continue;
        
        const label = type.toUpperCase();
        const count = items.length > 1 ? ` (×${items.length})` : '';
        
        out += `━━━ ${label}${count} ━━━\n`;
        
        // Get unique style combinations
        const uniqueStyles = getUniqueStyles(items);
        
        uniqueStyles.forEach((styleInfo, idx) => {
            if (uniqueStyles.length > 1) {
                out += `  Variant ${idx + 1}:\n`;
            }
            
            // Format styles in readable CSS-like format
            const styleLines = formatStylesAsCss(styleInfo.styles);
            if (styleLines) {
                out += styleLines.split('\n').map(l => `  ${l}`).join('\n') + '\n';
            } else {
                out += `  (no significant styles)\n`;
            }
            out += '\n';
        });
    }
    
    out += '```\n\n';
    
    // Color palette
    const colors = extractColorsFromTree(semanticTree);
    if (colors.length > 0) {
        out += '**Color Palette:**\n';
        colors.slice(0, 8).forEach(c => {
            out += `- \`${c.value}\` → ${c.usage}\n`;
        });
        out += '\n';
    }
    
    out += '*Layout, position, and dimensions excluded - keep your existing structure.*\n';
    
    return out;
}

// STRUCTURE MODE - Hierarchy with inline styles
function formatSmartComponentStructure(semanticTree, data) {
    const elementCount = data.elementCount || countNodes(semanticTree);
    const rootRole = semanticTree.subRole || semanticTree.role;
    
    let out = `TASK: Apply this component's visual design to your existing component.

Shows hierarchy + visual styles. Layout/position excluded - keep your own structure.

`;
    out += '```\n';
    out += `COMPONENT: ${rootRole} (${elementCount} elements)\n\n`;
    out += formatCompactTree(semanticTree, 0);
    out += '```\n\n';
    
    // Nested components summary
    const components = collectComponentsByType(semanticTree);
    const nestedTypes = Object.keys(components).filter(t => 
        !['container', 'wrapper', 'element', 'text'].includes(t) && 
        components[t].length > 0
    );
    
    if (nestedTypes.length > 1) {
        out += '**Nested Components Found:**\n';
        nestedTypes.forEach(type => {
            const count = components[type].length;
            out += `- ${type.toUpperCase()}${count > 1 ? ` ×${count}` : ''}\n`;
        });
        out += '\n';
    }
    
    // Compact color summary
    const colors = extractColorsFromTree(semanticTree);
    if (colors.length > 0) {
        out += '**Colors:** ';
        const colorSummary = colors.slice(0, 6).map(c => `\`${c.value}\` (${c.usage})`).join(', ');
        out += colorSummary + '\n\n';
    }
    
    out += '*Layout, position, flex/grid excluded - keep your own.*\n';
    
    return out;
}

// Collect all components grouped by their semantic type
function collectComponentsByType(node, result = {}) {
    if (!node) return result;
    
    const type = node.subRole || node.role || 'element';
    
    // Skip generic wrappers, focus on meaningful components
    const meaningfulTypes = [
        'button', 'trigger', 'link', 'input', 'textarea', 'select',
        'card', 'panel', 'dropdown', 'modal', 'badge', 'avatar',
        'heading', 'title', 'label', 'icon', 'image',
        'list', 'list-item', 'item', 'tab', 'divider',
        'header', 'footer', 'body', 'navigation'
    ];
    
    // Normalize type
    let normalizedType = type.toLowerCase().replace(/-/g, '');
    
    // Map to standard types
    if (['trigger', 'button', 'clickable'].includes(normalizedType)) normalizedType = 'button';
    if (['listitem', 'item', 'option'].includes(normalizedType)) normalizedType = 'list-item';
    if (['title', 'subtitle', 'headline'].includes(normalizedType)) normalizedType = 'heading';
    if (['wrapper', 'layoutcontainer'].includes(normalizedType)) normalizedType = 'container';
    
    if (meaningfulTypes.some(t => normalizedType.includes(t.replace(/-/g, '')))) {
        if (!result[normalizedType]) {
            result[normalizedType] = [];
        }
        result[normalizedType].push({
            node: node,
            styles: node.styles,
            selector: node.selector
        });
    }
    
    // Process children
    for (const child of node.children || []) {
        collectComponentsByType(child, result);
    }
    
    return result;
}

// Get unique style combinations from a list of components
function getUniqueStyles(items) {
    const unique = [];
    const seen = new Set();
    
    for (const item of items) {
        const styleKey = JSON.stringify(item.styles);
        if (!seen.has(styleKey)) {
            seen.add(styleKey);
            unique.push(item);
        }
    }
    
    return unique;
}

// Format styles as CSS-like readable format
function formatStylesAsCss(styles) {
    if (!styles) return '';
    
    const lines = [];
    
    // Visual styles
    if (styles.visual) {
        const v = styles.visual;
        if (v['background-color'] && !isDefaultColor(v['background-color'])) {
            lines.push(`background: ${v['background-color']};`);
        }
        if (v['border-radius'] && v['border-radius'] !== '0px') {
            lines.push(`border-radius: ${v['border-radius']};`);
        }
        if (v['border'] || (v['border-width'] && v['border-width'] !== '0px')) {
            const border = v['border'] || `${v['border-width']} ${v['border-style'] || 'solid'} ${v['border-color'] || 'currentColor'}`;
            lines.push(`border: ${border};`);
        }
        if (v['box-shadow'] && v['box-shadow'] !== 'none') {
            lines.push(`box-shadow: ${v['box-shadow']};`);
        }
    }
    
    // Typography
    if (styles.typography) {
        const t = styles.typography;
        if (t['color'] && !isDefaultColor(t['color'])) {
            lines.push(`color: ${t['color']};`);
        }
        if (t['font-size']) {
            lines.push(`font-size: ${t['font-size']};`);
        }
        if (t['font-weight'] && t['font-weight'] !== '400' && t['font-weight'] !== 'normal') {
            lines.push(`font-weight: ${t['font-weight']};`);
        }
        if (t['font-family']) {
            const font = t['font-family'].split(',')[0].replace(/"/g, '').trim();
            if (font && !font.includes('system') && !font.includes('serif')) {
                lines.push(`font-family: ${font};`);
            }
        }
        if (t['line-height'] && t['line-height'] !== 'normal') {
            lines.push(`line-height: ${t['line-height']};`);
        }
    }
    
    // Spacing (padding only)
    if (styles.spacing) {
        if (styles.spacing['padding'] && styles.spacing['padding'] !== '0px') {
            lines.push(`padding: ${styles.spacing['padding']};`);
        }
    }
    
    return lines.join('\n');
}

// Compact tree format with inline styles
function formatCompactTree(node, depth = 0, siblingCounts = {}) {
    if (!node || depth > 6) return '';
    
    const indent = '  '.repeat(depth);
    const role = (node.subRole || node.role || 'element').toUpperCase();
    
    // Build element line
    let line = `${indent}[${role}] <${node.tag}>`;
    
    // Add text content if short
    if (node.textContent && node.textContent.length < 30 && !node.children?.length) {
        line += ` "${node.textContent}"`;
    }
    
    // Add selector hint if useful
    if (node.selector && node.selector !== node.tag && !node.selector.includes('ai-design')) {
        const shortSelector = node.selector.split('.').slice(0, 2).join('.');
        if (shortSelector.length < 30) {
            line += ` — ${shortSelector}`;
        }
    }
    
    line += '\n';
    
    // Add compact styles on next line
    const styleStr = formatCompactStyles(node.styles);
    if (styleStr) {
        line += `${indent}  └─ ${styleStr}\n`;
    }
    
    // Process children, grouping similar ones
    const children = node.children || [];
    if (children.length > 0) {
        const grouped = groupSimilarChildren(children);
        
        for (const group of grouped) {
            if (group.count > 1) {
                // Show grouped similar elements
                const child = group.items[0];
                const childRole = (child.subRole || child.role || 'element').toUpperCase();
                line += `${indent}  [${childRole}] <${child.tag}> × ${group.count}`;
                if (child.textContent) line += ` — items`;
                line += '\n';
                
                const childStyles = formatCompactStyles(child.styles);
                if (childStyles) {
                    line += `${indent}    └─ ${childStyles}\n`;
                }
            } else {
                // Show individual element
                line += formatCompactTree(group.items[0], depth + 1, siblingCounts);
            }
        }
    }
    
    return line;
}

// Group children with similar roles/styles
function groupSimilarChildren(children) {
    const groups = [];
    const seen = new Map();
    
    for (const child of children) {
        const key = `${child.role}-${child.tag}-${JSON.stringify(child.styles)}`;
        
        if (seen.has(key)) {
            seen.get(key).items.push(child);
            seen.get(key).count++;
        } else {
            const group = { items: [child], count: 1 };
            seen.set(key, group);
            groups.push(group);
        }
    }
    
    return groups;
}

// Format styles in compact single-line format - VISUAL ONLY (look & feel)
function formatCompactStyles(styles) {
    if (!styles) return '';
    
    const parts = [];
    
    // VISUAL STYLES ONLY - these define the "look"
    
    // Colors & Surfaces
    if (styles.visual) {
        const v = styles.visual;
        if (v['background-color'] && !isDefaultColor(v['background-color'])) {
            parts.push(`bg: ${shortenColor(v['background-color'])}`);
        }
        if (v['border-radius'] && v['border-radius'] !== '0px') {
            parts.push(`radius: ${v['border-radius']}`);
        }
        if (v['border'] || (v['border-width'] && v['border-width'] !== '0px')) {
            const border = v['border'] || `${v['border-width']} solid ${v['border-color'] || '#000'}`;
            parts.push(`border: ${border}`);
        }
        if (v['box-shadow'] && v['box-shadow'] !== 'none') {
            parts.push(`shadow: yes`);
        }
        if (v['opacity'] && v['opacity'] !== '1') {
            parts.push(`opacity: ${v['opacity']}`);
        }
    }
    
    // Typography - always visual
    if (styles.typography) {
        const t = styles.typography;
        if (t['color'] && !isDefaultColor(t['color'])) {
            parts.push(`color: ${shortenColor(t['color'])}`);
        }
        if (t['font-size']) {
            parts.push(`text: ${t['font-size']}`);
        }
        if (t['font-weight'] && t['font-weight'] !== '400' && t['font-weight'] !== 'normal') {
            parts.push(`weight: ${t['font-weight']}`);
        }
        if (t['font-family']) {
            const font = t['font-family'].split(',')[0].replace(/"/g, '').trim();
            if (font && !font.includes('system') && !font.includes('sans-serif')) {
                parts.push(`font: ${font}`);
            }
        }
    }
    
    // Padding only (margin is layout-dependent, skip it)
    if (styles.spacing) {
        const s = styles.spacing;
        if (s['padding'] && s['padding'] !== '0px') {
            parts.push(`padding: ${s['padding']}`);
        }
        // Note: We skip margin, gap - these are layout/context dependent
    }
    
    // Interactive states (visual feedback)
    if (styles.interactive) {
        if (styles.interactive['cursor'] === 'pointer') {
            parts.push('clickable');
        }
        if (styles.interactive['transition']) {
            parts.push('animated');
        }
    }
    
    // NOTE: We intentionally SKIP layout/structural properties:
    // - display, flex, grid (structural)
    // - position, top, left, right, bottom (structural)
    // - width, height (context-dependent)
    // - margin, gap (layout-dependent)
    // - z-index (structural)
    
    return parts.join(' | ');
}

// Helper to check if color is default/transparent
function isDefaultColor(color) {
    if (!color) return true;
    const c = color.toLowerCase();
    return c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === 'inherit' || c === 'initial';
}

// Shorten color value for display
function shortenColor(color) {
    if (!color) return '';
    // If it's a long rgba, just return as is (it's informative)
    if (color.length > 25) {
        // Try to simplify
        if (color.startsWith('rgb(')) {
            return color; // Keep rgb
        }
    }
    return color;
}

// Get quick implementation hints
function getQuickHints(tree) {
    const hints = [];
    const roles = collectRoles(tree);
    
    if (roles.includes('dropdown') || roles.includes('modal') || roles.includes('trigger')) {
        hints.push('Needs open/close state');
    }
    if (roles.includes('list-item')) {
        hints.push('Map items from data');
    }
    if (roles.includes('input')) {
        hints.push('Add form state');
    }
    if (roles.includes('icon')) {
        hints.push('Swap icons for your library');
    }
    
    return hints;
}

// Count nodes in tree
function countNodes(node) {
    if (!node) return 0;
    let count = 1;
    for (const child of node.children || []) {
        count += countNodes(child);
    }
    return count;
}

// Format hierarchy tree
function formatHierarchy(node, prefix = '', isLast = true) {
    if (!node) return '';
    
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    
    let roleDisplay = node.role;
    if (node.subRole && node.subRole !== node.role) {
        roleDisplay = node.subRole;
    }
    
    let line = prefix + connector;
    line += `[${roleDisplay.toUpperCase()}]`;
    line += ` <${node.tag}>`;
    
    if (node.textContent && node.textContent.length < 25) {
        line += ` "${node.textContent}"`;
    }
    
    line += '\n';
    
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
        line += formatHierarchy(children[i], childPrefix, i === children.length - 1);
    }
    
    return line;
}

// Format styles for each element
function formatElementStyles(node, depth = 0) {
    if (!node) return '';
    
    let out = '';
    const indent = '  '.repeat(depth);
    
    // Element header
    const roleLabel = node.subRole || node.role;
    out += `### ${roleLabel.toUpperCase()} — \`<${node.tag}>\`\n\n`;
    out += `**Purpose:** ${node.purpose}\n`;
    
    if (node.selector && node.selector !== node.tag) {
        out += `**Selector:** \`${node.selector}\`\n`;
    }
    
    out += '\n';
    
    // Categorized styles
    if (node.styles) {
        const { layout, spacing, visual, typography, interactive } = node.styles;
        
        if (layout && Object.keys(layout).length > 0) {
            out += '**Layout:**\n```css\n';
            for (const [prop, val] of Object.entries(layout)) {
                out += `${prop}: ${val};\n`;
            }
            out += '```\n\n';
        }
        
        if (spacing && Object.keys(spacing).length > 0) {
            out += '**Spacing:**\n```css\n';
            for (const [prop, val] of Object.entries(spacing)) {
                out += `${prop}: ${val};\n`;
            }
            out += '```\n\n';
        }
        
        if (visual && Object.keys(visual).length > 0) {
            out += '**Visual:**\n```css\n';
            for (const [prop, val] of Object.entries(visual)) {
                out += `${prop}: ${val};\n`;
            }
            out += '```\n\n';
        }
        
        if (typography && Object.keys(typography).length > 0) {
            out += '**Typography:**\n```css\n';
            for (const [prop, val] of Object.entries(typography)) {
                out += `${prop}: ${val};\n`;
            }
            out += '```\n\n';
        }
        
        if (interactive && Object.keys(interactive).length > 0) {
            out += '**Interactive:**\n```css\n';
            for (const [prop, val] of Object.entries(interactive)) {
                out += `${prop}: ${val};\n`;
            }
            out += '```\n\n';
        }
    } else {
        out += '*No significant styles*\n\n';
    }
    
    // Process children (limit depth for readability)
    if (depth < 4 && node.children && node.children.length > 0) {
        for (const child of node.children) {
            out += formatElementStyles(child, depth + 1);
        }
    } else if (node.children && node.children.length > 0) {
        out += `*${node.children.length} child elements (see hierarchy above)*\n\n`;
    }
    
    return out;
}

// Extract colors with usage context
function extractColorsFromTree(node, colors = [], parentRole = null) {
    if (!node) return colors;
    
    const styles = node.styles || {};
    const role = node.subRole || node.role;
    
    // Check visual styles for colors
    if (styles.visual) {
        if (styles.visual['background-color']) {
            const color = styles.visual['background-color'];
            if (!colors.find(c => c.value === color)) {
                colors.push({ value: color, usage: `${role} background` });
            }
        }
        if (styles.visual['border-color']) {
            const color = styles.visual['border-color'];
            if (!colors.find(c => c.value === color)) {
                colors.push({ value: color, usage: `${role} border` });
            }
        }
    }
    
    // Check typography for text color
    if (styles.typography && styles.typography['color']) {
        const color = styles.typography['color'];
        if (!colors.find(c => c.value === color)) {
            colors.push({ value: color, usage: `${role} text` });
        }
    }
    
    // Process children
    for (const child of node.children || []) {
        extractColorsFromTree(child, colors, role);
    }
    
    return colors;
}

// Generate implementation hints
function generateImplementationHints(tree) {
    const hints = [];
    
    // Analyze tree for patterns
    const roles = collectRoles(tree);
    
    if (roles.includes('dropdown') || roles.includes('modal')) {
        hints.push('- This component likely needs **state management** for open/closed visibility');
    }
    
    if (roles.includes('trigger')) {
        hints.push('- Include **click handlers** on trigger elements');
    }
    
    if (roles.includes('list-item')) {
        hints.push('- List items should be **mapped from data** rather than hardcoded');
    }
    
    if (roles.includes('input')) {
        hints.push('- Form inputs need **controlled state** and validation');
    }
    
    if (roles.includes('icon')) {
        hints.push('- Replace icons with your **icon library** (Lucide, Heroicons, etc.)');
    }
    
    if (roles.includes('avatar')) {
        hints.push('- Avatar images should use **fallback** for missing images');
    }
    
    // Add general hints
    hints.push('- Text content shown is **placeholder** — replace with your actual content or props');
    hints.push('- Color values can be replaced with your **CSS variables/design tokens**');
    
    return hints.join('\n');
}

// Collect all roles in tree
function collectRoles(node, roles = []) {
    if (!node) return roles;
    
    if (node.role && !roles.includes(node.role)) {
        roles.push(node.role);
    }
    
    for (const child of node.children || []) {
        collectRoles(child, roles);
    }
    
    return roles;
}

// ============================================
// DEEP SCAN DATA EXTRACTION
// ============================================

function extractDesignTokensFromDeepScan(data) {
    if (!data.isDeepScan || !data.deepScanData) {
        return extractDesignTokens(data);
    }

    const deepData = data.deepScanData;
    return {
        colors: deepData.designTokens.colors || [],
        typo: {
            families: new Set(deepData.designTokens.fontFamilies || []),
            sizes: new Set(deepData.designTokens.fontSizes || []),
            weights: new Set(deepData.designTokens.fontWeights || [])
        },
        spacing: deepData.designTokens.spacing || [],
        radii: deepData.designTokens.borderRadii || [],
        shadows: deepData.designTokens.shadows || [],
        lineHeights: deepData.designTokens.lineHeights || [],
        rootVariables: data.globalCSS?.rootVariables || deepData.cssVariables?.root || {},
        darkVariables: data.globalCSS?.darkVariables || deepData.cssVariables?.dark || {},
        components: deepData.components || {}
    };
}

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

// ============================================
// COMPONENT STYLE FORMATTERS
// ============================================

const COMPONENT_LABELS = {
    button: 'Buttons',
    link: 'Links',
    input: 'Text Inputs',
    checkbox: 'Checkboxes',
    radio: 'Radio Buttons',
    heading: 'Headings',
    navigation: 'Navigation',
    card: 'Cards & Panels',
    list: 'Lists',
    listItem: 'List Items',
    badge: 'Badges & Tags',
    avatar: 'Avatars',
    icon: 'Icons',
    tab: 'Tabs',
    dropdown: 'Dropdowns',
    tooltip: 'Tooltips',
    progress: 'Progress Indicators',
    table: 'Tables',
    tableCell: 'Table Cells',
    form: 'Forms',
    divider: 'Dividers',
    text: 'Text Elements',
    image: 'Images',
    container: 'Containers'
};

function formatComponentStyles(components) {
    if (!components) return '';
    
    let out = '';
    
    for (const [type, items] of Object.entries(components)) {
        if (!items || items.length === 0) continue;
        
        const label = COMPONENT_LABELS[type] || type;
        out += `\n/* ${label} (${items.length} variant${items.length > 1 ? 's' : ''}) */\n`;
        
        items.forEach((item, index) => {
            const styles = item.styles;
            out += `\n.${type}${items.length > 1 ? `-variant-${index + 1}` : ''} {\n`;
            
            // Background
            if (styles.backgroundColor) {
                out += `  background-color: ${styles.backgroundColor};\n`;
            }
            
            // Text color
            if (styles.color) {
                out += `  color: ${styles.color};\n`;
            }
            
            // Typography
            if (styles.fontFamily) {
                out += `  font-family: ${styles.fontFamily}, sans-serif;\n`;
            }
            if (styles.fontSize) {
                out += `  font-size: ${styles.fontSize};\n`;
            }
            if (styles.fontWeight && styles.fontWeight !== '400') {
                out += `  font-weight: ${styles.fontWeight};\n`;
            }
            if (styles.lineHeight && styles.lineHeight !== 'normal') {
                out += `  line-height: ${styles.lineHeight};\n`;
            }
            if (styles.letterSpacing) {
                out += `  letter-spacing: ${styles.letterSpacing};\n`;
            }
            if (styles.textTransform) {
                out += `  text-transform: ${styles.textTransform};\n`;
            }
            
            // Spacing
            if (styles.padding && styles.padding !== '0px') {
                out += `  padding: ${styles.padding};\n`;
            }
            if (styles.margin && styles.margin !== '0px') {
                out += `  margin: ${styles.margin};\n`;
            }
            
            // Borders
            if (styles.borderRadius && styles.borderRadius !== '0px') {
                out += `  border-radius: ${styles.borderRadius};\n`;
            }
            if (styles.borderWidth && styles.borderWidth !== '0px') {
                out += `  border: ${styles.borderWidth} ${styles.borderStyle || 'solid'} ${styles.borderColor || 'currentColor'};\n`;
            }
            
            // Shadows
            if (styles.boxShadow) {
                out += `  box-shadow: ${styles.boxShadow};\n`;
            }
            
            // Layout
            if (styles.display && (styles.display === 'flex' || styles.display === 'inline-flex')) {
                out += `  display: ${styles.display};\n`;
                if (styles.flexDirection !== 'row') {
                    out += `  flex-direction: ${styles.flexDirection};\n`;
                }
                if (styles.justifyContent !== 'flex-start') {
                    out += `  justify-content: ${styles.justifyContent};\n`;
                }
                if (styles.alignItems !== 'stretch') {
                    out += `  align-items: ${styles.alignItems};\n`;
                }
                if (styles.gap) {
                    out += `  gap: ${styles.gap};\n`;
                }
            }
            
            // Transitions
            if (styles.transition) {
                out += `  transition: ${styles.transition};\n`;
            }
            
            // Cursor
            if (styles.cursor && styles.cursor !== 'auto') {
                out += `  cursor: ${styles.cursor};\n`;
            }
            
            out += `}\n`;
        });
    }
    
    return out;
}

// ============================================
// CSS FORMAT GENERATORS
// ============================================

function formatShadcnCSS(tokens, includeComponents = false) {
    let out = '```css\n';
    out += '@layer base {\n';
    out += '  :root {\n';
    
    // CSS Variables from stylesheets
    if (Object.keys(tokens.rootVariables).length > 0) {
        out += '    /* Original CSS Variables */\n';
        for (const [name, value] of Object.entries(tokens.rootVariables)) {
            out += `    ${name}: ${value};\n`;
        }
        out += '\n';
    }
    
    // Colors
    if (tokens.colors.length > 0) {
        out += '    /* Colors (extracted from elements) */\n';
        const uniqueColors = deduplicateColors(tokens.colors);
        uniqueColors.forEach((color, i) => {
            const name = getColorName(color, i);
            out += `    --color-${name}: ${color};\n`;
        });
        out += '\n';
    }
    
    // Typography
    out += '    /* Typography */\n';
    const families = tokens.typo?.families ? Array.from(tokens.typo.families) : [];
    if (families.length > 0) {
        out += `    --font-sans: ${families[0]}, system-ui, sans-serif;\n`;
        if (families.length > 1) {
            out += `    --font-heading: ${families[1]}, system-ui, sans-serif;\n`;
        }
    }
    
    const sizes = tokens.typo?.sizes ? Array.from(tokens.typo.sizes) : [];
    if (sizes.length > 0) {
        out += '\n    /* Font Sizes */\n';
        const sortedSizes = sizes.sort((a, b) => parseFloat(a) - parseFloat(b));
        const sizeNames = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
        sortedSizes.forEach((size, i) => {
            const name = sizeNames[Math.min(i, sizeNames.length - 1)] || `size-${i + 1}`;
            out += `    --text-${name}: ${size};\n`;
        });
    }
    
    // Spacing
    if (tokens.spacing && tokens.spacing.length > 0) {
        out += '\n    /* Spacing Scale */\n';
        const uniqueSpacing = [...new Set(tokens.spacing)].sort((a, b) => parseFloat(a) - parseFloat(b));
        uniqueSpacing.forEach((space, i) => {
            out += `    --spacing-${i + 1}: ${space};\n`;
        });
    }
    
    // Border Radius
    if (tokens.radii && tokens.radii.length > 0) {
        out += '\n    /* Border Radius */\n';
        const uniqueRadii = [...new Set(tokens.radii)];
        out += `    --radius: ${uniqueRadii[0]};\n`;
        if (uniqueRadii.length > 1) {
            uniqueRadii.forEach((r, i) => {
                out += `    --radius-${i + 1}: ${r};\n`;
            });
        }
    }
    
    // Shadows
    if (tokens.shadows && tokens.shadows.length > 0) {
        out += '\n    /* Shadows */\n';
        tokens.shadows.forEach((shadow, i) => {
            out += `    --shadow-${i + 1}: ${shadow};\n`;
        });
    }
    
    out += '  }\n';
    
    // Dark mode
    if (Object.keys(tokens.darkVariables || {}).length > 0) {
        out += '\n  .dark {\n';
        for (const [name, value] of Object.entries(tokens.darkVariables)) {
            out += `    ${name}: ${value};\n`;
        }
        out += '  }\n';
    }
    
    out += '}\n';
    
    // Component styles
    if (includeComponents && tokens.components) {
        out += '\n/* ============================\n';
        out += '   Component Styles\n';
        out += '   ============================ */\n';
        out += formatComponentStyles(tokens.components);
    }
    
    out += '```';
    return out;
}

function formatStandardCSS(tokens, includeComponents = false) {
    let out = '```css\n';
    out += '/* Global Design System Variables */\n';
    out += ':root {\n';
    
    // Colors
    out += '  /* Colors */\n';
    const uniqueColors = deduplicateColors(tokens.colors);
    uniqueColors.forEach((color, i) => {
        const name = getColorName(color, i);
        out += `  --color-${name}: ${color};\n`;
    });
    
    // Typography
    const families = tokens.typo?.families ? Array.from(tokens.typo.families) : [];
    if (families.length > 0) {
        out += '\n  /* Typography */\n';
        families.forEach((font, i) => {
            out += `  --font-family-${i + 1}: ${font}, sans-serif;\n`;
        });
    }
    
    const sizes = tokens.typo?.sizes ? Array.from(tokens.typo.sizes) : [];
    if (sizes.length > 0) {
        out += '\n  /* Font Sizes */\n';
        sizes.sort((a, b) => parseFloat(a) - parseFloat(b)).forEach((size, i) => {
            out += `  --font-size-${i + 1}: ${size};\n`;
        });
    }
    
    // Spacing
    if (tokens.spacing?.length > 0) {
        out += '\n  /* Spacing */\n';
        const uniqueSpacing = [...new Set(tokens.spacing)].sort((a, b) => parseFloat(a) - parseFloat(b));
        uniqueSpacing.forEach((space, i) => {
            out += `  --spacing-${i + 1}: ${space};\n`;
        });
    }
    
    // Border radius
    if (tokens.radii?.length > 0) {
        out += '\n  /* Border Radius */\n';
        const uniqueRadii = [...new Set(tokens.radii)];
        uniqueRadii.forEach((radius, i) => {
            out += `  --radius-${i + 1}: ${radius};\n`;
        });
    }
    
    // Shadows
    if (tokens.shadows?.length > 0) {
        out += '\n  /* Shadows */\n';
        tokens.shadows.forEach((shadow, i) => {
            out += `  --shadow-${i + 1}: ${shadow};\n`;
        });
    }
    
    out += '}\n';
    
    // Component styles
    if (includeComponents && tokens.components) {
        out += '\n/* ============================\n';
        out += '   Component Styles\n';
        out += '   ============================ */\n';
        out += formatComponentStyles(tokens.components);
    }
    
    out += '```';
    return out;
}

function formatTailwindConfig(tokens, includeComponents = false) {
    let out = '```javascript\n';
    out += '// tailwind.config.js\n';
    out += 'module.exports = {\n';
    out += '  theme: {\n';
    out += '    extend: {\n';
    
    // Colors
    out += '      colors: {\n';
    const uniqueColors = deduplicateColors(tokens.colors);
    uniqueColors.forEach((color, i) => {
        const name = getColorName(color, i);
        out += `        '${name}': '${color}',\n`;
    });
    out += '      },\n';
    
    // Font family
    const families = tokens.typo?.families ? Array.from(tokens.typo.families) : [];
    if (families.length > 0) {
        out += '      fontFamily: {\n';
        families.forEach((font, i) => {
            const name = i === 0 ? 'sans' : `heading`;
            out += `        '${name}': ['${font}', 'sans-serif'],\n`;
        });
        out += '      },\n';
    }
    
    // Font sizes
    const sizes = tokens.typo?.sizes ? Array.from(tokens.typo.sizes) : [];
    if (sizes.length > 0) {
        out += '      fontSize: {\n';
        const sizeNames = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
        sizes.sort((a, b) => parseFloat(a) - parseFloat(b)).forEach((size, i) => {
            const name = sizeNames[Math.min(i, sizeNames.length - 1)] || `custom-${i + 1}`;
            out += `        '${name}': '${size}',\n`;
        });
        out += '      },\n';
    }
    
    // Spacing
    if (tokens.spacing?.length > 0) {
        out += '      spacing: {\n';
        const uniqueSpacing = [...new Set(tokens.spacing)].sort((a, b) => parseFloat(a) - parseFloat(b));
        uniqueSpacing.forEach((space, i) => {
            out += `        '${i + 1}': '${space}',\n`;
        });
        out += '      },\n';
    }
    
    // Border radius
    if (tokens.radii?.length > 0) {
        out += '      borderRadius: {\n';
        const uniqueRadii = [...new Set(tokens.radii)];
        uniqueRadii.forEach((radius, i) => {
            const name = i === 0 ? 'DEFAULT' : `${i + 1}`;
            out += `        '${name}': '${radius}',\n`;
        });
        out += '      },\n';
    }
    
    // Box shadow
    if (tokens.shadows?.length > 0) {
        out += '      boxShadow: {\n';
        tokens.shadows.forEach((shadow, i) => {
            out += `        '${i + 1}': '${shadow}',\n`;
        });
        out += '      },\n';
    }
    
    out += '    },\n';
    out += '  },\n';
    out += '}\n';
    out += '```';
    
    // Add component styles as CSS after Tailwind config
    if (includeComponents && tokens.components) {
        out += '\n\n```css\n';
        out += '/* Component Styles (add to your CSS) */\n';
        out += '@layer components {\n';
        out += formatComponentStyles(tokens.components);
        out += '}\n';
        out += '```';
    }
    
    return out;
}

// Color utilities
function deduplicateColors(colors) {
    if (!colors || colors.length === 0) return [];
    
    // Convert to map of normalized colors
    const colorMap = new Map();
    colors.forEach(color => {
        const normalized = normalizeColor(color);
        if (normalized && !colorMap.has(normalized)) {
            colorMap.set(normalized, color);
        }
    });
    
    return Array.from(colorMap.values());
}

function normalizeColor(color) {
    if (!color) return null;
    // Simple normalization - convert to lowercase and trim
    return color.toLowerCase().trim();
}

function getColorName(color, index) {
    // Try to determine if it's a common color
    const c = color.toLowerCase();
    
    if (c.includes('white') || c === 'rgb(255, 255, 255)' || c === '#fff' || c === '#ffffff') {
        return 'white';
    }
    if (c.includes('black') || c === 'rgb(0, 0, 0)' || c === '#000' || c === '#000000') {
        return 'black';
    }
    if (c.includes('transparent') || c === 'rgba(0, 0, 0, 0)') {
        return 'transparent';
    }
    
    // Check if it looks like a primary color based on position
    if (index === 0) return 'background';
    if (index === 1) return 'foreground';
    if (index === 2) return 'primary';
    if (index === 3) return 'secondary';
    if (index === 4) return 'accent';
    if (index === 5) return 'muted';
    
    return `${index + 1}`;
}

// ============================================
// INTENT FORMATTERS
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

function formatExtractGlobalTheme(data) {
    if (!data) return '';
    
    let out = INTENTS['extract-global-theme'].prompt + '\n\n';
    
    // Use deep scan tokens if available
    const tokens = data.isDeepScan 
        ? extractDesignTokensFromDeepScan(data)
        : extractDesignTokens(data);
    
    // Format based on selected format (default to shadcn)
    const format = typeof currentFormat !== 'undefined' ? currentFormat : 'shadcn';
    const includeComponents = data.isDeepScan && tokens.components;
    
    switch (format) {
        case 'tailwind':
            out += formatTailwindConfig(tokens, includeComponents);
            break;
        case 'standard':
            out += formatStandardCSS(tokens, includeComponents);
            break;
        case 'shadcn':
        default:
            out += formatShadcnCSS(tokens, includeComponents);
            break;
    }
    
    out += '\n\n';
    
    // Add summary
    out += '**Extracted Values Summary:**\n';
    
    if (data.isDeepScan && data.deepScanData?.stats) {
        const stats = data.deepScanData.stats;
        out += `- Total elements scanned: ${stats.totalElementsScanned}\n`;
        out += `- Unique components found: ${stats.uniqueComponentsFound}\n`;
    }
    
    if (tokens.colors?.length > 0) out += `- Colors: ${tokens.colors.length} values\n`;
    
    const families = tokens.typo?.families 
        ? (tokens.typo.families instanceof Set ? Array.from(tokens.typo.families) : tokens.typo.families)
        : [];
    if (families.length > 0) out += `- Fonts: ${families.join(', ')}\n`;
    
    const sizes = tokens.typo?.sizes 
        ? (tokens.typo.sizes instanceof Set ? Array.from(tokens.typo.sizes) : tokens.typo.sizes)
        : [];
    if (sizes.length > 0) out += `- Font sizes: ${sizes.length} values\n`;
    
    if (tokens.spacing?.length > 0) out += `- Spacing: ${tokens.spacing.length} values\n`;
    if (tokens.radii?.length > 0) out += `- Border radius: ${tokens.radii.length} values\n`;
    if (tokens.shadows?.length > 0) out += `- Shadows: ${tokens.shadows.length} values\n`;
    
    // Component breakdown
    if (tokens.components) {
        out += '\n**Components Found:**\n';
        for (const [type, items] of Object.entries(tokens.components)) {
            if (items && items.length > 0) {
                const label = COMPONENT_LABELS[type] || type;
                out += `- ${label}: ${items.length} variant${items.length > 1 ? 's' : ''}\n`;
            }
        }
    }
    
    return out;
}

// ============================================
// FORMAT ROUTER
// ============================================

function formatOutput(data, intentId) {
    // Validate data
    if (!data || !data.tree) {
        return 'No design data available. Please select an element first.';
    }
    
    // Map legacy intents to new 4 core intents
    const mappedIntent = mapLegacyIntent(intentId);
    
    // Use EnhancedPromptGenerator for all prompts
    if (window.EnhancedPromptGenerator) {
        return window.EnhancedPromptGenerator.generateQuickPrompt(data, mappedIntent);
    }
    
    // Fallback to legacy formatters
    switch (mappedIntent) {
        case 'apply-design':
            return formatCopyDesign(data);
        case 'replicate-design':
            return formatComponentWithDesign(data);
        case 'global-tokens':
            return formatExtractGlobalTheme(data);
        default:
            return formatCopyDesign(data);
    }
}

// ============================================
// UI
// ============================================

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

function renderPage(data) {
    if (!data) {
        document.querySelector('.container').innerHTML = `
            <div class="empty-state">
                <h2>No capture found</h2>
                <p>Use the extension to select an element first.</p>
            </div>
        `;
        return;
    }
    
    currentData = data;
    
    // Page meta
    document.getElementById('pageMeta').textContent = data.pageTitle || 'Unknown page';
    
    // Screenshot
    const container = document.getElementById('screenshotContainer');
    if (data.screenshot) {
        container.innerHTML = `<img src="${data.screenshot}" alt="Captured element" />`;
    }
    
    // Quick stats
    const stats = document.getElementById('quickStats');
    const tree = data.tree;
    
    if (data.isDeepScan && data.deepScanData?.stats) {
        // Show deep scan stats
        const deepStats = data.deepScanData.stats;
        stats.innerHTML = `
            <div class="stat">
                <div class="stat-label">Type</div>
                <div class="stat-value">Deep Scan</div>
            </div>
            <div class="stat">
                <div class="stat-label">Elements Scanned</div>
                <div class="stat-value">${deepStats.totalElementsScanned.toLocaleString()}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Components Found</div>
                <div class="stat-value">${deepStats.uniqueComponentsFound}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Colors</div>
                <div class="stat-value">${deepStats.colorsFound}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Fonts</div>
                <div class="stat-value">${deepStats.fontsFound}</div>
            </div>
        `;
    } else if (data.isGlobalThemeExtraction) {
        // Show global theme stats
        const globalCSS = data.globalCSS || {};
        const rootVarCount = Object.keys(globalCSS.rootVariables || {}).length;
        const darkVarCount = Object.keys(globalCSS.darkVariables || {}).length;
        
        stats.innerHTML = `
            <div class="stat">
                <div class="stat-label">Type</div>
                <div class="stat-value">Global Theme</div>
            </div>
            <div class="stat">
                <div class="stat-label">CSS Variables</div>
                <div class="stat-value">${rootVarCount} root${darkVarCount > 0 ? `, ${darkVarCount} dark` : ''}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Source</div>
                <div class="stat-value">Full Page</div>
            </div>
        `;
    } else {
        stats.innerHTML = `
            <div class="stat">
                <div class="stat-label">Element</div>
                <div class="stat-value">&lt;${tree?.tag || '?'}&gt;</div>
            </div>
            <div class="stat">
                <div class="stat-label">Size</div>
                <div class="stat-value">${tree?.dimensions?.width || '?'} × ${tree?.dimensions?.height || '?'}</div>
            </div>
            <div class="stat">
                <div class="stat-label">Children</div>
                <div class="stat-value">${data.elementCount || 1}</div>
            </div>
        `;
    }
    
    // Color swatches
    let colors = [];
    if (data.isDeepScan && data.deepScanData?.designTokens?.colors) {
        colors = data.deepScanData.designTokens.colors.slice(0, 20); // Limit to 20 for display
    } else {
        colors = Array.from(collectColors(tree));
    }
    
    const swatchesEl = document.getElementById('colorSwatches');
    if (colors.length > 0) {
        swatchesEl.innerHTML = `
            <div class="card-header" style="margin-top:12px;">Colors${colors.length > 20 ? ` (showing 20 of ${data.deepScanData?.designTokens?.colors?.length || colors.length})` : ''}</div>
            <div class="color-swatches">
                ${colors.map(c => `<div class="color-swatch" style="background:${c}" title="${c}" data-color="${c}"></div>`).join('')}
            </div>
        `;
        
        swatchesEl.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', async () => {
                await navigator.clipboard.writeText(swatch.dataset.color);
                showToast(`Copied: ${swatch.dataset.color}`);
            });
        });
    }
    
    // Load stored intent from popup and then generate output
    chrome.storage.local.get(['currentIntent', 'aiEnabled'], (result) => {
        // Set intent
        if (result.currentIntent && INTENTS[result.currentIntent]) {
            currentIntent = result.currentIntent;
        } else if (data.isGlobalThemeExtraction || data.isDeepScan) {
            currentIntent = 'global-tokens';
        } else {
            currentIntent = 'apply-design'; // default
        }
        
        // Update UI
        document.querySelectorAll('.intent-option').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`[data-intent="${currentIntent}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        // Show/hide CSS merge section for global tokens
        const cssMergeSection = document.getElementById('cssMergeSection');
        if (cssMergeSection) {
            cssMergeSection.classList.toggle('active', currentIntent === 'global-tokens');
        }
        
        // Update AI status
        if (result.aiEnabled === true) {
            aiEnhancementEnabled = true;
        }
        
        // Generate output (only call once, after storage is loaded)
        updateOutput();
    });
}

async function updateOutput() {
    if (!currentData) {
        console.warn('[Results] updateOutput called with no currentData');
        return;
    }
    
    // Validate data has required structure
    if (!currentData.tree) {
        console.warn('[Results] currentData has no tree property');
        const outputEl = document.getElementById('output');
        if (outputEl) {
            outputEl.value = 'Error: No element data found. Please try selecting an element again.';
        }
        return;
    }
    
    const shadcnSection = document.getElementById('shadcnOutputSection');
    const regularSection = document.getElementById('regularOutputSection');
    const outputEl = document.getElementById('output');
    
    // Handle shadcn-component intent specially
    if (currentIntent === 'shadcn-component') {
        shadcnSection?.classList.add('active');
        if (regularSection) regularSection.style.display = 'none';
        await buildShadcnOutput();
        return;
    }
    
    // Regular intents
    shadcnSection?.classList.remove('active');
    if (regularSection) regularSection.style.display = 'block';
    
    let output = '';
    let isEnhanced = false;
    
    // First, always generate template output (fast, synchronous)
    try {
        if (window.EnhancedPromptGenerator) {
            output = window.EnhancedPromptGenerator.generateQuickPrompt(currentData, currentIntent);
        } else {
            output = formatOutput(currentData, currentIntent);
        }
    } catch (e) {
        console.error('Template generation failed:', e);
        output = 'Error generating output. Please try again.';
    }
    
    // Show template output immediately
    if (outputEl) outputEl.value = output;
    
    // Then try AI enhancement if enabled (async, can take time)
    if (aiEnhancementEnabled && window.EnhancedPromptGenerator) {
        try {
            const enhanced = await getEnhancedOutputResults();
            if (enhanced && enhanced.output) {
                output = enhanced.output;
                isEnhanced = enhanced.enhanced;
                if (outputEl) outputEl.value = output;
            }
        } catch (e) {
            console.error('AI enhancement failed:', e);
            // Keep template output
        }
    }
    
    // Update AI badge
    const badge = document.getElementById('aiBadge');
    if (badge) {
        if (isEnhanced) {
            badge.textContent = 'ENHANCED';
            badge.classList.add('active');
        } else if (aiEnhancementEnabled) {
            badge.textContent = 'ON';
            badge.classList.add('active');
        } else {
            badge.textContent = 'OFF';
            badge.classList.remove('active');
        }
    }
}

// ============================================
// SHADCN COMPONENT BUILD FUNCTIONS
// ============================================

async function buildShadcnOutput() {
    const buildingEl = document.getElementById('shadcnBuilding');
    const errorEl = document.getElementById('shadcnError');
    const successEl = document.getElementById('shadcnSuccess');
    const stepEl = document.getElementById('shadcnBuildingStep');
    
    // Check if required elements exist
    if (!buildingEl || !errorEl || !successEl) {
        console.error('[Results] Required shadcn UI elements not found');
        return;
    }
    
    // Reset states
    buildingEl.classList.add('active');
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
    
    // Check if currentData is valid
    if (!currentData || !currentData.tree) {
        buildingEl.classList.remove('active');
        errorEl.style.display = 'block';
        const errorMsg = document.getElementById('shadcnErrorMessage');
        if (errorMsg) {
            errorMsg.textContent = 'No element data found. Please select an element first.';
        }
        return;
    }
    
    try {
        // Check if ShadcnBuilder is available
        if (!window.ShadcnBuilder) {
            throw new Error('Shadcn Builder module not loaded. Please refresh the page.');
        }
        
        // Update build steps
        stepEl.textContent = 'Detecting required components...';
        await sleep(300);
        
        stepEl.textContent = 'Fetching shadcn components from registry...';
        await sleep(300);
        
        stepEl.textContent = 'Generating component with Gemini AI...';
        
        // Call the builder
        const result = await window.ShadcnBuilder.buildShadcnComponent(currentData);
        
        buildingEl.classList.remove('active');
        
        if (result.success) {
            // Show success state
            successEl.style.display = 'block';
            
            // Populate detected components
            const componentsList = document.getElementById('shadcnComponentsList');
            componentsList.innerHTML = (result.detectedComponents || [])
                .map(comp => `<span class="shadcn-component-badge">${comp}</span>`)
                .join('');
            
            // Populate code
            document.getElementById('shadcnComponentCode').value = result.componentCode || '';
            document.getElementById('shadcnCssVars').value = result.cssVariables || '/* No custom CSS variables needed */';
            document.getElementById('shadcnInstallCmd').textContent = result.installCommand || 'npx shadcn@latest add card button';
            document.getElementById('shadcnUsageExample').textContent = result.usageExample || `<${result.componentName || 'Component'} />`;
            
        } else {
            // Show error state
            errorEl.style.display = 'block';
            document.getElementById('shadcnErrorMessage').textContent = result.error || 'Unknown error occurred';
            
            // Show API key hint if that's the issue
            const apiKeyHint = document.getElementById('shadcnApiKeyHint');
            if (result.error && result.error.includes('GEMINI_API_KEY')) {
                apiKeyHint.style.display = 'block';
            } else {
                apiKeyHint.style.display = 'none';
            }
        }
        
    } catch (error) {
        console.error('Shadcn build error:', error);
        
        buildingEl.classList.remove('active');
        errorEl.style.display = 'block';
        document.getElementById('shadcnErrorMessage').textContent = error.message;
        
        // Show API key hint if needed
        const apiKeyHint = document.getElementById('shadcnApiKeyHint');
        if (error.message.includes('API') || error.message.includes('key') || error.message.includes('Gemini')) {
            apiKeyHint.style.display = 'block';
        } else {
            apiKeyHint.style.display = 'none';
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// AI ENHANCEMENT FUNCTIONS (Results Page)
// ============================================

async function initializeAIResultsStatus() {
    const aiToggle = document.getElementById('resultsAiToggle');
    const aiStatus = document.getElementById('aiPanelStatus');
    const regenerateBtn = document.getElementById('regeneratePromptBtn');
    const styleSelect = document.getElementById('promptStyleSelect');
    const badge = document.getElementById('aiBadge');
    
    // Get stored AI preference
    chrome.storage.local.get(['aiEnabled', 'geminiApiKey'], async (result) => {
        const hasKey = !!result.geminiApiKey;
        const wasEnabled = result.aiEnabled === true;
        
        if (hasKey) {
            aiStatus.textContent = 'Gemini AI available';
            
            if (wasEnabled) {
                aiToggle.checked = true;
                aiEnhancementEnabled = true;
                regenerateBtn.disabled = false;
                styleSelect.disabled = false;
                badge.textContent = 'ON';
                badge.classList.add('active');
            } else {
                badge.textContent = 'OFF';
            }
        } else {
            aiStatus.textContent = 'Click ⚙️ to add API key';
            badge.textContent = 'OFF';
        }
    });
}

function showAILoadingResults(show) {
    const loadingEl = document.getElementById('aiLoadingResults');
    if (loadingEl) {
        loadingEl.classList.toggle('active', show);
    }
    isEnhancing = show;
}

async function getEnhancedOutputResults() {
    if (!aiEnhancementEnabled || !window.EnhancedPromptGenerator || !currentData) {
        return null;
    }
    
    try {
        showAILoadingResults(true);
        
        const style = currentPromptStyle !== 'auto' ? currentPromptStyle : undefined;
        
        const result = await window.EnhancedPromptGenerator.generateEnhancedPrompt(currentData, currentIntent, {
            useGemini: true,
            strategy: style
        });
        
        showAILoadingResults(false);
        
        if (result.success || result.prompt) {
            return {
                output: result.prompt,
                enhanced: result.enhanced,
                source: result.source
            };
        }
    } catch (e) {
        console.error('AI enhancement failed:', e);
        showAILoadingResults(false);
    }
    
    return null;
}

async function regeneratePrompt() {
    if (!currentData) return;
    
    const regenerateBtn = document.getElementById('regeneratePromptBtn');
    regenerateBtn.disabled = true;
    regenerateBtn.innerHTML = '<span>🔄</span> Regenerating...';
    
    await updateOutput();
    
    regenerateBtn.disabled = false;
    regenerateBtn.innerHTML = '<span>🔄</span> Regenerate';
}

// AI Settings Modal for Results Page
function openAISettingsResults() {
    const modal = document.getElementById('aiSettingsModal');
    const apiKeyInput = document.getElementById('resultsApiKeyInput');
    
    modal.classList.add('active');
    
    if (window.GeminiService) {
        window.GeminiService.getApiKey().then(key => {
            if (key) {
                apiKeyInput.value = '••••••••••••••••';
                apiKeyInput.dataset.hasKey = 'true';
            }
        });
    }
}

function closeAISettingsResults() {
    const modal = document.getElementById('aiSettingsModal');
    modal.classList.remove('active');
}

async function saveApiKeyResults() {
    const apiKeyInput = document.getElementById('resultsApiKeyInput');
    const statusEl = document.getElementById('resultsApiKeyStatus');
    const saveBtn = document.getElementById('saveResultsApiKeyBtn');
    
    const key = apiKeyInput.value.trim();
    
    if (key === '••••••••••••••••') {
        closeAISettingsResults();
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
            
            aiEnhancementEnabled = true;
            document.getElementById('resultsAiToggle').checked = true;
            document.getElementById('regeneratePromptBtn').disabled = false;
            document.getElementById('promptStyleSelect').disabled = false;
            
            await initializeAIResultsStatus();
            
            setTimeout(() => {
                closeAISettingsResults();
                statusEl.style.display = 'none';
                updateOutput();
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
// EVENT HANDLERS
// ============================================

let currentFormat = 'shadcn';
let hasCSSOption = 'no-css';

// Intent selector - 4 core intents
document.querySelectorAll('.intent-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.intent-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentIntent = btn.dataset.intent;
        
        // Show/hide CSS merge section for global tokens
        const cssMergeSection = document.getElementById('cssMergeSection');
        if (cssMergeSection) {
            cssMergeSection.classList.toggle('active', currentIntent === 'global-tokens');
        }
        
        // Store preference
        chrome.storage.local.set({ currentIntent: currentIntent });
        
        updateOutput();
    });
});

// ============================================
// ADAPT TO CODEBASE EVENT HANDLERS
// ============================================

// Adapt tabs
document.querySelectorAll('.adapt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.adapt-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const tabId = tab.dataset.tab;
        
        // Hide all tab contents
        document.getElementById('adaptTabCss').style.display = 'none';
        document.getElementById('adaptTabSelectors').style.display = 'none';
        document.getElementById('adaptTabFramework').style.display = 'none';
        
        // Show selected tab
        if (tabId === 'css') {
            document.getElementById('adaptTabCss').style.display = 'block';
        } else if (tabId === 'selectors') {
            document.getElementById('adaptTabSelectors').style.display = 'block';
        } else if (tabId === 'framework') {
            document.getElementById('adaptTabFramework').style.display = 'block';
        }
    });
});

// Framework options
document.querySelectorAll('.framework-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.framework-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        adaptationState.selectedFramework = option.dataset.framework;
    });
});

// Analyze & Adapt button
document.getElementById('analyzeAdaptBtn')?.addEventListener('click', () => {
    analyzeAndAdaptStyles();
});

// Reset button
document.getElementById('resetAdaptBtn')?.addEventListener('click', () => {
    resetAdaptation();
});

// Preview on Website button
document.getElementById('previewStylesBtn')?.addEventListener('click', async () => {
    await toggleStylePreview();
});

// Copy AI Prompt button
document.getElementById('copyAIPromptBtn')?.addEventListener('click', async () => {
    if (!currentData) {
        showAdaptStatus('No extracted design data available.', 'error');
        return;
    }
    
    const userContext = document.getElementById('userCssInput')?.value || '';
    const prompt = generateAIPrompt(currentData, userContext);
    
    try {
        await navigator.clipboard.writeText(prompt);
        showToast('AI prompt copied to clipboard!');
        showAdaptStatus('AI prompt copied! Paste it into your favorite AI assistant (ChatGPT, Claude, etc.)', 'success');
    } catch (e) {
        console.error('Failed to copy:', e);
        showAdaptStatus('Failed to copy prompt.', 'error');
    }
});

// CSS Option selector (has CSS or not)
document.querySelectorAll('.css-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.css-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        option.querySelector('input[type="radio"]').checked = true;
        
        hasCSSOption = option.dataset.option;
        
        // Show/hide existing CSS input
        const existingCssInput = document.getElementById('existingCssInput');
        if (hasCSSOption === 'has-css') {
            existingCssInput.classList.add('active');
        } else {
            existingCssInput.classList.remove('active');
            updateOutput(); // Regenerate output when switching to no-css
        }
    });
});

// Format selector
document.querySelectorAll('.format-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.format-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        currentFormat = option.dataset.format;
        updateOutput();
    });
});

// Merge button
document.getElementById('mergeBtn')?.addEventListener('click', () => {
    const existingCSS = document.getElementById('existingCssTextarea').value;
    if (existingCSS.trim()) {
        const mergedOutput = generateMergedCSS(existingCSS);
        document.getElementById('output').value = mergedOutput;
        showToast('CSS merged successfully!');
    } else {
        showToast('Please paste your existing CSS first');
    }
});

// Copy text
document.getElementById('copyBtn').addEventListener('click', async () => {
    const output = document.getElementById('output').value;
    await navigator.clipboard.writeText(output);
    showToast('Copied to clipboard!');
});

// Copy with image
document.getElementById('copyWithImageBtn').addEventListener('click', async () => {
    if (!currentData) return;
    
    const text = document.getElementById('output').value;
    
    try {
        if (currentData.screenshot) {
            const response = await fetch(currentData.screenshot);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/plain': new Blob([text], { type: 'text/plain' }),
                    'image/png': blob
                })
            ]);
            showToast('Copied text + image!');
        } else {
            await navigator.clipboard.writeText(text);
            showToast('Copied text!');
        }
    } catch (err) {
        await navigator.clipboard.writeText(text);
        showToast('Copied text!');
    }
});

// ============================================
// AI STYLE ADAPTATION ENGINE
// ============================================

// Component type to common selector patterns mapping
const COMPONENT_SELECTOR_PATTERNS = {
    button: ['.btn', '.button', 'button', '.cta', '.action-btn', '[role="button"]', '.submit-btn'],
    link: ['.link', 'a', '.nav-link', '.text-link', '.anchor'],
    input: ['.input', '.form-input', '.text-field', 'input', '.form-control', '.text-input'],
    checkbox: ['.checkbox', 'input[type="checkbox"]', '.form-check'],
    radio: ['.radio', 'input[type="radio"]', '.form-radio'],
    heading: ['.heading', '.title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.headline'],
    navigation: ['.nav', '.navbar', '.navigation', 'nav', '.menu', '.sidebar-nav'],
    card: ['.card', '.panel', '.tile', '.widget', '.box', '.container-card'],
    list: ['.list', 'ul', 'ol', '.item-list', '.menu-list'],
    listItem: ['.list-item', 'li', '.item', '.menu-item'],
    badge: ['.badge', '.tag', '.chip', '.label', '.pill'],
    avatar: ['.avatar', '.profile-pic', '.user-image', '.profile-image'],
    icon: ['.icon', 'svg', 'i', '.fa', '.material-icons'],
    tab: ['.tab', '.nav-tab', '[role="tab"]', '.tab-item'],
    dropdown: ['.dropdown', '.select', '.popover', '.menu-dropdown'],
    tooltip: ['.tooltip', '[role="tooltip"]', '.hint'],
    progress: ['.progress', '.loader', '.spinner', '.loading'],
    table: ['.table', 'table', '.data-table', '.grid-table'],
    tableCell: ['.cell', 'td', 'th', '.table-cell'],
    form: ['.form', 'form', '.form-group', '.form-container'],
    divider: ['.divider', 'hr', '.separator', '.line'],
    text: ['.text', 'p', 'span', '.paragraph', '.body-text'],
    image: ['.image', 'img', '.photo', '.picture', '.thumbnail'],
    container: ['.container', '.wrapper', '.section', '.block', '.box']
};

// Framework-specific selector patterns
const FRAMEWORK_PATTERNS = {
    tailwind: {
        button: ['btn', 'bg-', 'text-', 'px-', 'py-', 'rounded-'],
        colors: ['text-', 'bg-', 'border-'],
        spacing: ['p-', 'm-', 'gap-', 'space-'],
        radius: ['rounded-'],
        shadow: ['shadow-']
    },
    bootstrap: {
        button: ['.btn', '.btn-primary', '.btn-secondary', '.btn-outline-'],
        card: ['.card', '.card-body', '.card-header'],
        input: ['.form-control', '.form-group'],
        navigation: ['.navbar', '.nav', '.nav-item', '.nav-link']
    },
    mui: {
        button: ['.MuiButton-root', '.MuiIconButton-root'],
        card: ['.MuiCard-root', '.MuiPaper-root'],
        input: ['.MuiTextField-root', '.MuiInput-root']
    },
    chakra: {
        variablePrefix: '--chakra-',
        button: ['chakra-button'],
        card: ['chakra-card']
    },
    shadcn: {
        variablePrefix: '--',
        button: ['.btn', 'button'],
        card: ['.card'],
        input: ['.input']
    }
};

// State for adaptation
let adaptationState = {
    userCSS: '',
    userSelectors: {},
    selectedFramework: null,
    mappings: [],
    adaptedCSS: '',
    isPreviewActive: false,
    // New: analyzed user codebase
    userAnalysis: null,
    // New: detected overlaps
    detectedOverlaps: [],
    // New: user-selected components to adapt
    selectedComponents: []
};

// Parse user's CSS to extract selectors and variables
function parseUserCSS(cssText) {
    const result = {
        variables: {},
        selectors: {},
        rules: [],
        // New: categorized analysis
        colors: [],
        componentTypes: [],
        hasTypography: false,
        hasSpacing: false
    };
    
    if (!cssText || typeof cssText !== 'string') return result;
    
    // Extract CSS variables from :root
    const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/g);
    if (rootMatch) {
        rootMatch.forEach(block => {
            const vars = block.match(/--[\w-]+\s*:\s*[^;]+/g) || [];
            vars.forEach(v => {
                const [name, value] = v.split(':').map(s => s.trim());
                result.variables[name] = value;
                
                // Categorize variable by type
                if (value.match(/^(#|rgb|hsl)/i)) {
                    result.colors.push({ name, value });
                }
            });
        });
    }
    
    // Extract all selectors and their properties
    const rulePattern = /([^{]+)\{([^}]+)\}/g;
    let match;
    while ((match = rulePattern.exec(cssText)) !== null) {
        const selector = match[1].trim();
        const properties = match[2].trim();
        
        if (selector !== ':root' && !selector.startsWith('@')) {
            const props = parseProperties(properties);
            result.selectors[selector] = props;
            result.rules.push({ selector, properties: props });
            
            // Detect component type from selector
            const detectedType = detectComponentTypeFromSelector(selector);
            if (detectedType && !result.componentTypes.includes(detectedType)) {
                result.componentTypes.push(detectedType);
            }
            
            // Check for typography/spacing
            if (props['font-family'] || props['font-size']) result.hasTypography = true;
            if (props['padding'] || props['margin'] || props['gap']) result.hasSpacing = true;
        }
    }
    
    return result;
}

// Detect what component type a selector likely represents
function detectComponentTypeFromSelector(selector) {
    const selectorLower = selector.toLowerCase();
    
    const typePatterns = {
        button: ['btn', 'button', 'cta', 'submit'],
        input: ['input', 'field', 'textbox', 'form-control'],
        card: ['card', 'panel', 'tile', 'widget', 'box'],
        heading: ['heading', 'title', 'headline', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
        link: ['link', 'anchor', 'nav-link'],
        navigation: ['nav', 'menu', 'sidebar', 'navbar'],
        badge: ['badge', 'tag', 'chip', 'label', 'pill'],
        avatar: ['avatar', 'profile'],
        list: ['list', 'items'],
        container: ['container', 'wrapper', 'section']
    };
    
    for (const [type, patterns] of Object.entries(typePatterns)) {
        for (const pattern of patterns) {
            if (selectorLower.includes(pattern)) {
                return type;
            }
        }
    }
    
    return null;
}

// Analyze overlap between user's CSS and extracted design
function analyzeOverlap(userCSS, extractedData) {
    const overlaps = {
        hasOverlap: false,
        components: [],
        variables: [],
        colors: [],
        suggestions: []
    };
    
    if (!extractedData) return overlaps;
    
    const tokens = extractedData.isDeepScan 
        ? extractDesignTokensFromDeepScan(extractedData)
        : extractDesignTokens(extractedData);
    
    // Find component overlaps
    const extractedComponents = tokens.components ? Object.keys(tokens.components) : [];
    const userComponentTypes = userCSS.componentTypes || [];
    
    for (const type of extractedComponents) {
        const hasInUser = userComponentTypes.includes(type);
        const userSelector = hasInUser ? findMatchingSelector(type, userCSS, {}) : null;
        const extractedCount = tokens.components[type]?.length || 0;
        
        if (extractedCount > 0) {
            overlaps.components.push({
                type,
                extractedCount,
                hasInUser,
                userSelector,
                canAdapt: hasInUser
            });
            
            if (hasInUser) {
                overlaps.hasOverlap = true;
            }
        }
    }
    
    // Find variable overlaps
    const userVarNames = Object.keys(userCSS.variables || {});
    const extractedVarNames = Object.keys(tokens.rootVariables || {});
    
    for (const extractedVar of extractedVarNames) {
        const mappedVar = mapVariableName(extractedVar, userCSS.variables || {});
        const hasMatch = mappedVar !== extractedVar && userVarNames.includes(mappedVar);
        
        overlaps.variables.push({
            extracted: extractedVar,
            mapped: mappedVar,
            hasMatch,
            extractedValue: tokens.rootVariables[extractedVar],
            userValue: hasMatch ? userCSS.variables[mappedVar] : null
        });
        
        if (hasMatch) {
            overlaps.hasOverlap = true;
        }
    }
    
    // Find color overlaps (by similarity)
    const userColors = userCSS.colors || [];
    const extractedColors = tokens.colors || [];
    
    for (const userColor of userColors) {
        for (const extractedColor of extractedColors.slice(0, 20)) {
            const similarity = colorSimilarity(userColor.value, extractedColor);
            if (similarity > 0.85) {
                overlaps.colors.push({
                    userVar: userColor.name,
                    userValue: userColor.value,
                    extractedValue: extractedColor,
                    similarity: Math.round(similarity * 100)
                });
                overlaps.hasOverlap = true;
            }
        }
    }
    
    // Generate suggestions based on analysis
    if (!overlaps.hasOverlap) {
        overlaps.suggestions.push({
            type: 'no-overlap',
            message: 'No direct matches found between your CSS and the extracted design.',
            action: 'Consider adding component selectors that match the extracted design, or use the AI prompt for manual guidance.'
        });
    }
    
    if (userVarNames.length === 0) {
        overlaps.suggestions.push({
            type: 'no-variables',
            message: 'Your CSS doesn\'t use CSS variables.',
            action: 'Add a :root { } block with variables like --primary, --background, etc. for better mapping.'
        });
    }
    
    if (userComponentTypes.length === 0) {
        overlaps.suggestions.push({
            type: 'no-components',
            message: 'No component selectors detected in your CSS.',
            action: 'Add selectors like .btn, .card, .input for component-level adaptation.'
        });
    }
    
    return overlaps;
}

function parseProperties(propString) {
    const props = {};
    const pairs = propString.split(';').filter(s => s.trim());
    pairs.forEach(pair => {
        const [name, value] = pair.split(':').map(s => s.trim());
        if (name && value) {
            props[name] = value;
        }
    });
    return props;
}

// Parse user-defined selector mappings
function parseUserSelectorMappings(mappingText) {
    const mappings = {};
    if (!mappingText) return mappings;
    
    const lines = mappingText.split('\n').filter(l => l.trim());
    lines.forEach(line => {
        const [type, selectors] = line.split(':').map(s => s.trim());
        if (type && selectors) {
            mappings[type.toLowerCase()] = selectors.split(',').map(s => s.trim()).filter(s => s);
        }
    });
    
    return mappings;
}

// Find matching user selector for a component type
function findMatchingSelector(componentType, userCSS, userMappings) {
    // First check user-defined mappings
    if (userMappings[componentType] && userMappings[componentType].length > 0) {
        // Return the first user-defined selector
        return userMappings[componentType][0];
    }
    
    // Then check if any user selectors match our patterns
    const patterns = COMPONENT_SELECTOR_PATTERNS[componentType] || [];
    const userSelectors = Object.keys(userCSS.selectors || {});
    
    // Score-based matching for better accuracy
    let bestMatch = null;
    let bestScore = 0;
    
    for (const userSelector of userSelectors) {
        const score = calculateSelectorMatchScore(componentType, userSelector, patterns);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = userSelector;
        }
    }
    
    if (bestMatch && bestScore > 0.3) {
        return bestMatch;
    }
    
    // Fallback to the first common pattern
    return patterns[0] || `.${componentType}`;
}

// Calculate how well a user selector matches a component type
function calculateSelectorMatchScore(componentType, userSelector, patterns) {
    let score = 0;
    const selectorLower = userSelector.toLowerCase();
    const typeLower = componentType.toLowerCase();
    
    // Direct pattern match
    for (const pattern of patterns) {
        if (selectorLower === pattern.toLowerCase()) {
            return 1.0; // Perfect match
        }
        if (selectorLower.includes(pattern.toLowerCase().replace('.', ''))) {
            score = Math.max(score, 0.8);
        }
    }
    
    // Semantic similarity based on common naming conventions
    const semanticMappings = {
        button: ['btn', 'button', 'cta', 'action', 'submit', 'click'],
        input: ['input', 'field', 'text', 'form-control', 'textbox'],
        card: ['card', 'panel', 'tile', 'box', 'container', 'widget'],
        heading: ['heading', 'title', 'headline', 'header', 'h1', 'h2', 'h3'],
        link: ['link', 'anchor', 'nav-link', 'href'],
        navigation: ['nav', 'menu', 'sidebar', 'navbar', 'navigation'],
        badge: ['badge', 'tag', 'chip', 'label', 'pill', 'status'],
        avatar: ['avatar', 'profile', 'user-image', 'photo'],
        list: ['list', 'items', 'menu', 'options'],
        listItem: ['item', 'list-item', 'option', 'entry'],
        container: ['container', 'wrapper', 'section', 'layout', 'grid']
    };
    
    const semanticTerms = semanticMappings[componentType] || [typeLower];
    for (const term of semanticTerms) {
        if (selectorLower.includes(term)) {
            score = Math.max(score, 0.6);
        }
    }
    
    // Partial name match
    if (selectorLower.includes(typeLower) || typeLower.includes(selectorLower.replace('.', ''))) {
        score = Math.max(score, 0.5);
    }
    
    return score;
}

// Parse RGB/RGBA color to components
function parseColor(colorStr) {
    if (!colorStr) return null;
    
    // Handle rgb/rgba
    const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3]),
            a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1
        };
    }
    
    // Handle hex
    const hexMatch = colorStr.match(/^#([0-9a-f]{3,8})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 1
            };
        } else if (hex.length >= 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
            };
        }
    }
    
    return null;
}

// Calculate color similarity (0-1)
function colorSimilarity(color1, color2) {
    const c1 = parseColor(color1);
    const c2 = parseColor(color2);
    
    if (!c1 || !c2) return 0;
    
    // Euclidean distance in RGB space, normalized
    const dist = Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
        Math.pow(c1.g - c2.g, 2) +
        Math.pow(c1.b - c2.b, 2)
    );
    
    // Max distance is sqrt(3 * 255^2) ≈ 441.67
    const maxDist = 441.67;
    return 1 - (dist / maxDist);
}

// Find the most similar color variable in user's CSS
function findSimilarColorVariable(extractedColor, userVariables) {
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (const [varName, varValue] of Object.entries(userVariables)) {
        // Only consider color-like variables
        if (!varValue || typeof varValue !== 'string') continue;
        if (!varValue.match(/^(#|rgb|hsl)/i)) continue;
        
        const similarity = colorSimilarity(extractedColor, varValue);
        if (similarity > bestSimilarity && similarity > 0.85) {
            bestSimilarity = similarity;
            bestMatch = varName;
        }
    }
    
    return bestMatch;
}

// Generate CSS that uses user's existing variables where possible
function generateVariableAwareCSS(property, value, userVariables) {
    // Check if the value is a color
    if (value.match(/^(#|rgb|hsl)/i)) {
        const matchingVar = findSimilarColorVariable(value, userVariables);
        if (matchingVar) {
            return `var(${matchingVar})`;
        }
    }
    
    // Check if any user variable has the exact value
    for (const [varName, varValue] of Object.entries(userVariables)) {
        if (varValue === value) {
            return `var(${varName})`;
        }
    }
    
    return value;
}

// Map CSS variable names to user's variable naming convention
function mapVariableName(extractedName, userVariables) {
    const userVarNames = Object.keys(userVariables);
    
    // Common variable name mappings
    const commonMappings = {
        '--background': ['--bg', '--background', '--background-color', '--bg-color'],
        '--foreground': ['--fg', '--foreground', '--text-color', '--text', '--color'],
        '--primary': ['--primary', '--primary-color', '--brand', '--accent', '--main'],
        '--secondary': ['--secondary', '--secondary-color', '--alt'],
        '--accent': ['--accent', '--highlight', '--focus'],
        '--muted': ['--muted', '--gray', '--neutral', '--subtle'],
        '--radius': ['--radius', '--border-radius', '--rounded'],
        '--font-sans': ['--font-sans', '--font-family', '--font', '--body-font'],
        '--shadow': ['--shadow', '--box-shadow', '--elevation']
    };
    
    // Check if extracted name has a known mapping
    for (const [standard, variants] of Object.entries(commonMappings)) {
        if (extractedName === standard || variants.includes(extractedName)) {
            // Find if user has any of these variants
            for (const variant of variants) {
                if (userVarNames.includes(variant)) {
                    return variant;
                }
            }
        }
    }
    
    // Check for similar variable names in user's CSS
    const extractedBase = extractedName.replace('--', '').toLowerCase();
    for (const userVar of userVarNames) {
        const userBase = userVar.replace('--', '').toLowerCase();
        if (userBase.includes(extractedBase) || extractedBase.includes(userBase)) {
            return userVar;
        }
    }
    
    // Return original name if no match found
    return extractedName;
}

// Generate adapted CSS based on mappings
function generateAdaptedCSS(extractedData, userCSS, userMappings, framework, overlaps = null) {
    const tokens = extractedData.isDeepScan 
        ? extractDesignTokensFromDeepScan(extractedData)
        : extractDesignTokens(extractedData);
    
    const mappings = [];
    let adaptedCSS = '';
    const userVars = userCSS.variables || {};
    const hasUserVars = Object.keys(userVars).length > 0;
    
    // Only generate :root if user has variables or we found color matches
    const colorMatches = overlaps?.colors || [];
    const variableMatches = (overlaps?.variables || []).filter(v => v.hasMatch);
    
    if (hasUserVars || colorMatches.length > 0 || variableMatches.length > 0) {
        adaptedCSS += ':root {\n';
        adaptedCSS += '  /* Updated values from extracted design */\n';
        
        // Only map variables that have actual matches
        if (variableMatches.length > 0) {
            variableMatches.forEach(v => {
                adaptedCSS += `  ${v.mapped}: ${v.extractedValue}; /* was: ${v.userValue} */\n`;
                mappings.push({ 
                    from: v.extracted, 
                    to: v.mapped, 
                    type: 'variable',
                    hasMatch: true
                });
            });
        }
        
        // Add color updates for matched colors
        if (colorMatches.length > 0) {
            adaptedCSS += '\n  /* Color updates (similar colors found) */\n';
            colorMatches.forEach(c => {
                adaptedCSS += `  ${c.userVar}: ${c.extractedValue}; /* ${c.similarity}% similar to your ${c.userValue} */\n`;
                mappings.push({
                    from: c.extractedValue,
                    to: c.userVar,
                    type: 'color',
                    hasMatch: true
                });
            });
        }
        
        adaptedCSS += '}\n\n';
    }
    
    // Generate component styles - ONLY for components with matches
    const componentMatches = overlaps?.components?.filter(c => c.canAdapt) || [];
    const hasComponentMatches = componentMatches.length > 0;
    
    // Also check userMappings for explicit mappings
    const explicitMappings = Object.keys(userMappings);
    
    if (tokens.components && (hasComponentMatches || explicitMappings.length > 0)) {
        adaptedCSS += '/* Component Styles - Adapted to YOUR selectors */\n\n';
        
        for (const [componentType, items] of Object.entries(tokens.components)) {
            if (!items || items.length === 0) continue;
            
            // Check if this component has a match or explicit mapping
            const matchInfo = componentMatches.find(c => c.type === componentType);
            const hasExplicitMapping = explicitMappings.includes(componentType);
            
            if (!matchInfo?.canAdapt && !hasExplicitMapping) {
                // Skip components without matches
                continue;
            }
            
            const userSelector = matchInfo?.userSelector || 
                                 (hasExplicitMapping ? userMappings[componentType][0] : null) ||
                                 findMatchingSelector(componentType, userCSS, userMappings);
            
            mappings.push({ 
                from: componentType, 
                to: userSelector, 
                type: 'selector',
                count: items.length,
                hasMatch: true
            });
            
            // Generate styles for first variant only (most common pattern)
            const item = items[0];
            adaptedCSS += `${userSelector} {\n`;
            const styles = item.styles;
            
            if (styles.backgroundColor) {
                const bgValue = generateVariableAwareCSS('background-color', styles.backgroundColor, userVars);
                adaptedCSS += `  background-color: ${bgValue};\n`;
            }
            if (styles.color) {
                const colorValue = generateVariableAwareCSS('color', styles.color, userVars);
                adaptedCSS += `  color: ${colorValue};\n`;
            }
            if (styles.fontFamily) {
                const fontValue = generateVariableAwareCSS('font-family', styles.fontFamily, userVars);
                adaptedCSS += `  font-family: ${fontValue.includes('var(') ? fontValue : fontValue + ', sans-serif'};\n`;
            }
            if (styles.fontSize) adaptedCSS += `  font-size: ${styles.fontSize};\n`;
            if (styles.fontWeight && styles.fontWeight !== '400') adaptedCSS += `  font-weight: ${styles.fontWeight};\n`;
            if (styles.padding && styles.padding !== '0px') adaptedCSS += `  padding: ${styles.padding};\n`;
            if (styles.borderRadius && styles.borderRadius !== '0px') {
                const radiusValue = generateVariableAwareCSS('border-radius', styles.borderRadius, userVars);
                adaptedCSS += `  border-radius: ${radiusValue};\n`;
            }
            if (styles.boxShadow) {
                const shadowValue = generateVariableAwareCSS('box-shadow', styles.boxShadow, userVars);
                adaptedCSS += `  box-shadow: ${shadowValue};\n`;
            }
            if (styles.borderWidth && styles.borderWidth !== '0px') {
                const borderColorValue = generateVariableAwareCSS('border-color', styles.borderColor || 'currentColor', userVars);
                adaptedCSS += `  border: ${styles.borderWidth} ${styles.borderStyle || 'solid'} ${borderColorValue};\n`;
            }
            if (styles.transition) adaptedCSS += `  transition: ${styles.transition};\n`;
            
            adaptedCSS += '}\n\n';
            
            // If multiple variants exist, add a comment
            if (items.length > 1) {
                adaptedCSS += `/* Note: ${items.length - 1} more ${componentType} variants available in extracted design */\n\n`;
            }
        }
    }
    
    // If no CSS was generated, provide helpful output
    if (!adaptedCSS.trim()) {
        adaptedCSS = `/* No direct matches found between your CSS and the extracted design.

To get adapted styles, your CSS needs:
1. CSS variables in :root { } that match common naming (--primary, --background, etc.)
2. Component selectors like .btn, .card, .input that we can map to

Example CSS structure:
:root {
  --primary: #3498db;
  --background: #ffffff;
  --radius: 4px;
}

.btn {
  padding: 10px 20px;
}

.card {
  padding: 16px;
}

Paste CSS with this structure and try again, or use the AI Prompt for manual guidance.
*/`;
    }
    
    return { adaptedCSS, mappings };
}

// Generate AI-optimized prompt for external AI tools
function generateAIPrompt(extractedData, userContext) {
    const tokens = extractedData.isDeepScan 
        ? extractDesignTokensFromDeepScan(extractedData)
        : extractDesignTokens(extractedData);
    
    // Analyze what the user has
    const userCSS = userContext ? parseUserCSS(userContext) : null;
    const userVarCount = userCSS ? Object.keys(userCSS.variables).length : 0;
    const userSelectorCount = userCSS ? Object.keys(userCSS.selectors).length : 0;
    const userComponentTypes = userCSS?.componentTypes || [];
    
    let prompt = `TASK: Help me apply this extracted design to my codebase.

`;

    // Section 1: What the user has
    if (userContext && userContext.trim()) {
        prompt += `MY EXISTING CSS (${userVarCount} variables, ${userSelectorCount} selectors):\n\`\`\`css\n${userContext.trim()}\n\`\`\`\n\n`;
        
        if (userComponentTypes.length > 0) {
            prompt += `Components I have: ${userComponentTypes.join(', ')}\n\n`;
        }
    } else {
        prompt += `⚠️ I haven't provided my CSS yet. Please give me general guidance on how to apply these extracted styles.\n\n`;
    }
    
    // Section 2: Relevant extracted values (filtered to what might match)
    prompt += `EXTRACTED DESIGN VALUES:\n`;
    
    // Only show a focused subset of colors
    if (tokens.colors && tokens.colors.length > 0) {
        prompt += `\nKey Colors (${Math.min(tokens.colors.length, 6)} of ${tokens.colors.length}):\n`;
        tokens.colors.slice(0, 6).forEach((color, i) => {
            prompt += `  ${i + 1}. ${color}\n`;
        });
    }
    
    // Typography
    const families = tokens.typo?.families 
        ? (tokens.typo.families instanceof Set ? Array.from(tokens.typo.families) : tokens.typo.families)
        : [];
    if (families.length > 0) {
        prompt += `\nFonts: ${families.slice(0, 2).join(', ')}\n`;
    }
    
    // Only show component types that user might want
    if (tokens.components) {
        const relevantComponents = userComponentTypes.length > 0
            ? Object.entries(tokens.components).filter(([type]) => 
                userComponentTypes.includes(type) || 
                userComponentTypes.some(ut => type.includes(ut) || ut.includes(type))
              )
            : Object.entries(tokens.components).slice(0, 5);
        
        if (relevantComponents.length > 0) {
            prompt += `\nRelevant Components:\n`;
            relevantComponents.forEach(([type, items]) => {
                if (items && items.length > 0) {
                    const sample = items[0].styles;
                    prompt += `  ${type}:\n`;
                    if (sample.backgroundColor) prompt += `    background: ${sample.backgroundColor}\n`;
                    if (sample.color) prompt += `    color: ${sample.color}\n`;
                    if (sample.padding) prompt += `    padding: ${sample.padding}\n`;
                    if (sample.borderRadius) prompt += `    border-radius: ${sample.borderRadius}\n`;
                }
            });
        }
    }
    
    // Section 3: Clear, specific instructions
    prompt += `
INSTRUCTIONS:
1. Look at MY CSS above and identify what selectors/variables I'm using
2. Map the extracted values to MY existing naming conventions
3. Only generate CSS for things that exist in MY codebase
4. Use my variable names (don't invent new ones)
5. Keep my selector names, just update the property values

OUTPUT:
Generate ONLY the CSS I need to add/update. Use my exact selector names.
Add comments like /* updated from extracted design */ where you make changes.`;
    
    return prompt;
}

// Format the adapt-to-codebase output
function formatAdaptToCodebase(data) {
    if (!data || !adaptationState.adaptedCSS) {
        // Show instructions if not yet analyzed
        let out = `# Adapt Styles to Your Codebase

This tool maps extracted design styles to YOUR existing CSS selectors and variables.

## How This Works

1. **Paste Your CSS** above - Your existing global.css or component styles
2. **Click "Analyze & Adapt"** - We'll find what matches between your code and the extracted design
3. **Get Adapted CSS** - Only styles that map to YOUR selectors

---

## What We Can Adapt

**From the extracted design:**
${data?.isDeepScan ? `• ${data.deepScanData?.stats?.uniqueComponentsFound || 0} component styles (buttons, cards, inputs, etc.)` : '• Design tokens extracted'}
${data?.deepScanData?.designTokens?.colors ? `• ${data.deepScanData.designTokens.colors.length} colors` : ''}
${data?.deepScanData?.designTokens?.fontFamilies ? `• ${data.deepScanData.designTokens.fontFamilies.length} font families` : ''}

**What YOU need to provide:**
• CSS with selectors like \`.btn\`, \`.card\`, \`.input\` 
• CSS variables in \`:root { }\` for color/spacing mapping
• Or select a framework preset (Tailwind, Bootstrap, etc.)

---

## Example Input

\`\`\`css
:root {
  --primary: #3498db;
  --background: #ffffff;
  --text: #333333;
}

.btn {
  padding: 8px 16px;
}

.card {
  border-radius: 8px;
}
\`\`\`

Paste something like this, then click "Analyze & Adapt".

---

## Alternative: Use AI Assistant

Click **"Copy AI Prompt"** to get a prompt you can paste into ChatGPT/Claude for more sophisticated mapping.`;
        
        return out;
    }
    
    const matchedMappings = adaptationState.mappings.filter(m => m.hasMatch);
    const totalMappings = adaptationState.mappings.length;
    
    let out = `## Adapted CSS for Your Codebase\n\n`;
    out += `**${matchedMappings.length} direct matches** found between your CSS and the extracted design.\n\n`;
    
    out += '```css\n';
    out += adaptationState.adaptedCSS;
    out += '```\n\n';
    
    // Add mapping summary
    if (matchedMappings.length > 0) {
        out += '---\n\n';
        out += '### What Was Mapped\n\n';
        
        const selectorMappings = matchedMappings.filter(m => m.type === 'selector');
        const varMappings = matchedMappings.filter(m => m.type === 'variable');
        const colorMappings = matchedMappings.filter(m => m.type === 'color');
        
        if (selectorMappings.length > 0) {
            out += '**Components:**\n';
            selectorMappings.forEach(m => {
                out += `- \`${m.from}\` → \`${m.to}\``;
                if (m.count > 1) out += ` (${m.count} variants in source)`;
                out += '\n';
            });
            out += '\n';
        }
        
        if (varMappings.length > 0) {
            out += '**Variables:**\n';
            varMappings.forEach(m => {
                out += `- \`${m.from}\` → \`${m.to}\`\n`;
            });
            out += '\n';
        }
        
        if (colorMappings.length > 0) {
            out += '**Colors:**\n';
            colorMappings.forEach(m => {
                out += `- \`${m.to}\` updated to \`${m.from}\`\n`;
            });
            out += '\n';
        }
    }
    
    out += '---\n\n';
    out += '### Next Steps\n\n';
    out += '1. **Review** the CSS above - it uses YOUR selector names\n';
    out += '2. **Preview** - Click "Preview on Website" to see changes live\n';
    out += '3. **Copy** - Paste into your project when satisfied\n';
    
    if (totalMappings > matchedMappings.length) {
        out += `\n💡 **Tip:** ${totalMappings - matchedMappings.length} more components available in the extracted design. Add matching selectors to your CSS to adapt them too.\n`;
    }
    
    return out;
}

// Analyze and adapt styles
function analyzeAndAdaptStyles() {
    if (!currentData) {
        showAdaptStatus('No extracted design data available. Extract styles first.', 'error');
        return;
    }
    
    showAdaptStatus('Analyzing your codebase structure...', 'loading');
    
    // Get user input based on active tab
    const activeTab = document.querySelector('.adapt-tab.active')?.dataset.tab || 'css';
    
    let userCSS = { variables: {}, selectors: {}, rules: [], colors: [], componentTypes: [] };
    let userMappings = {};
    
    if (activeTab === 'css') {
        const cssInput = document.getElementById('userCssInput')?.value || '';
        if (!cssInput.trim()) {
            showAdaptStatus('Please paste your CSS first. We need your codebase styles to create meaningful mappings.', 'error');
            return;
        }
        userCSS = parseUserCSS(cssInput);
        adaptationState.userCSS = cssInput;
        adaptationState.userAnalysis = userCSS;
    } else if (activeTab === 'selectors') {
        const selectorsInput = document.getElementById('userSelectorsInput')?.value || '';
        if (!selectorsInput.trim()) {
            showAdaptStatus('Please define at least one selector mapping (e.g., "button: .btn").', 'error');
            return;
        }
        userMappings = parseUserSelectorMappings(selectorsInput);
        adaptationState.userSelectors = userMappings;
    } else if (activeTab === 'framework') {
        const selectedFramework = document.querySelector('.framework-option.selected')?.dataset.framework;
        if (!selectedFramework) {
            showAdaptStatus('Please select a framework first.', 'error');
            return;
        }
        adaptationState.selectedFramework = selectedFramework;
        // Use framework defaults as userMappings
        if (FRAMEWORK_PATTERNS[selectedFramework]) {
            const patterns = FRAMEWORK_PATTERNS[selectedFramework];
            for (const [type, selectors] of Object.entries(patterns)) {
                if (Array.isArray(selectors) && selectors.length > 0) {
                    userMappings[type] = selectors;
                }
            }
        }
    }
    
    // Small delay to show loading state
    setTimeout(() => {
        try {
            // First, analyze the overlap
            const overlaps = analyzeOverlap(userCSS, currentData);
            adaptationState.detectedOverlaps = overlaps;
            
            // Show overlap analysis
            renderOverlapAnalysis(overlaps);
            
            if (!overlaps.hasOverlap && activeTab === 'css') {
                showAdaptStatus(
                    'Limited overlap detected. See analysis below for suggestions.', 
                    'info'
                );
                // Still generate what we can, but warn the user
            }
            
            // Generate adapted CSS only for overlapping components
            const result = generateAdaptedCSS(
                currentData, 
                userCSS, 
                userMappings, 
                adaptationState.selectedFramework,
                overlaps // Pass overlaps to filter output
            );
            
            adaptationState.adaptedCSS = result.adaptedCSS;
            adaptationState.mappings = result.mappings;
            
            // Update output
            updateOutput();
            
            // Show mappings preview
            renderMappingsPreview(result.mappings);
            
            const matchCount = result.mappings.filter(m => m.hasMatch).length;
            const totalCount = result.mappings.length;
            
            if (matchCount > 0) {
                showAdaptStatus(
                    `Found ${matchCount} direct matches out of ${totalCount} possible mappings.`, 
                    'success'
                );
            } else {
                showAdaptStatus(
                    `Generated ${totalCount} mappings using defaults. Add more CSS for better results.`, 
                    'info'
                );
            }
        } catch (err) {
            console.error('Adaptation error:', err);
            showAdaptStatus('Error during adaptation: ' + err.message, 'error');
        }
    }, 500);
}

// Render overlap analysis UI
function renderOverlapAnalysis(overlaps) {
    const previewEl = document.getElementById('mappingPreview');
    const listEl = document.getElementById('mappingList');
    
    if (!previewEl || !listEl) return;
    
    previewEl.classList.add('show');
    
    let html = '';
    
    // Show what was found in user's CSS
    if (adaptationState.userAnalysis) {
        const analysis = adaptationState.userAnalysis;
        html += `<div style="margin-bottom: 12px; padding: 10px; background: #f0f7f1; border-radius: 8px; font-size: 12px;">
            <strong style="color: #4a6b4d;">Your CSS contains:</strong><br>
            • ${Object.keys(analysis.variables).length} CSS variables<br>
            • ${Object.keys(analysis.selectors).length} selectors<br>
            • ${analysis.componentTypes.length} component types detected: ${analysis.componentTypes.join(', ') || 'none'}
        </div>`;
    }
    
    // Show suggestions if any
    if (overlaps.suggestions.length > 0) {
        html += `<div style="margin-bottom: 12px; padding: 10px; background: #fff8e6; border-radius: 8px; font-size: 12px; border-left: 3px solid #f9a825;">
            <strong style="color: #e65100;">💡 Suggestions:</strong><br>`;
        overlaps.suggestions.forEach(s => {
            html += `<div style="margin-top: 6px;">${s.message}<br><em style="color: #666;">${s.action}</em></div>`;
        });
        html += `</div>`;
    }
    
    // Show component matches
    const matchingComponents = overlaps.components.filter(c => c.canAdapt);
    const availableComponents = overlaps.components.filter(c => !c.canAdapt && c.extractedCount > 0);
    
    if (matchingComponents.length > 0) {
        html += `<div style="font-size: 11px; color: #4a6b4d; margin-bottom: 8px; font-weight: 600;">✓ Can adapt (${matchingComponents.length}):</div>`;
        matchingComponents.forEach(c => {
            html += `<div class="mapping-item" style="background: #e8f5e9;">
                <span class="mapping-from">${c.type}</span>
                <span class="mapping-arrow">→</span>
                <span class="mapping-to">${c.userSelector}</span>
            </div>`;
        });
    }
    
    if (availableComponents.length > 0 && availableComponents.length <= 5) {
        html += `<div style="font-size: 11px; color: #9a9a9a; margin: 8px 0; font-weight: 600;">Available in design (add to your CSS to adapt):</div>`;
        availableComponents.slice(0, 5).forEach(c => {
            html += `<div class="mapping-item" style="opacity: 0.6;">
                <span class="mapping-from">${c.type} (${c.extractedCount})</span>
                <span class="mapping-arrow">—</span>
                <span class="mapping-to" style="color: #9a9a9a;">no match</span>
            </div>`;
        });
    }
    
    // Show color matches
    if (overlaps.colors.length > 0) {
        html += `<div style="font-size: 11px; color: #4a6b4d; margin: 8px 0; font-weight: 600;">✓ Color matches (${overlaps.colors.length}):</div>`;
        overlaps.colors.slice(0, 3).forEach(c => {
            html += `<div class="mapping-item">
                <span style="display: inline-block; width: 14px; height: 14px; background: ${c.userValue}; border-radius: 3px; margin-right: 6px;"></span>
                <span class="mapping-from">${c.userVar}</span>
                <span class="mapping-arrow">≈</span>
                <span style="display: inline-block; width: 14px; height: 14px; background: ${c.extractedValue}; border-radius: 3px; margin-right: 6px;"></span>
                <span class="mapping-to">${c.similarity}% match</span>
            </div>`;
        });
    }
    
    listEl.innerHTML = html || '<div style="color: #9a9a9a; text-align: center; padding: 10px;">Paste your CSS to see analysis</div>';
}

// Show adaptation status message
function showAdaptStatus(message, type) {
    const statusEl = document.getElementById('adaptStatus');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = 'adapt-status show ' + type;
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 5000);
    }
}

// Render mappings preview (called after generateAdaptedCSS)
function renderMappingsPreview(mappings) {
    // Note: renderOverlapAnalysis handles the main preview now
    // This function updates the header badge if needed
    const previewBadge = document.getElementById('previewBadge');
    
    const matchCount = mappings.filter(m => m.hasMatch).length;
    if (matchCount > 0 && previewBadge) {
        // Show that we have real matches
        previewBadge.textContent = `${matchCount} matches`;
        previewBadge.style.display = 'inline-flex';
        previewBadge.style.background = '#4a6b4d';
    }
}

// Reset adaptation state
function resetAdaptation() {
    adaptationState = {
        userCSS: '',
        userSelectors: {},
        selectedFramework: null,
        mappings: [],
        adaptedCSS: '',
        isPreviewActive: false
    };
    
    // Clear inputs
    const cssInput = document.getElementById('userCssInput');
    const selectorsInput = document.getElementById('userSelectorsInput');
    if (cssInput) cssInput.value = '';
    if (selectorsInput) selectorsInput.value = '';
    
    // Clear framework selection
    document.querySelectorAll('.framework-option').forEach(opt => opt.classList.remove('selected'));
    
    // Hide mappings preview
    const previewEl = document.getElementById('mappingPreview');
    if (previewEl) previewEl.classList.remove('show');
    
    // Clear status
    const statusEl = document.getElementById('adaptStatus');
    if (statusEl) statusEl.classList.remove('show');
    
    // Update output
    updateOutput();
    
    // Remove live preview if active
    removeStylePreview();
    
    showToast('Adaptation reset');
}

// ============================================
// STYLE PREVIEW - COMMUNICATION WITH CONTENT SCRIPT
// ============================================

// Get the active tab
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// Inject the content script if needed
async function ensureContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        // Small delay to ensure script is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
    } catch (e) {
        console.error('Failed to inject content script:', e);
        return false;
    }
}

// Toggle style preview on the active website
async function toggleStylePreview() {
    const previewBtn = document.getElementById('previewStylesBtn');
    const previewBadge = document.getElementById('previewBadge');
    
    if (!adaptationState.adaptedCSS) {
        showAdaptStatus('Please analyze your codebase first to generate adapted CSS.', 'error');
        return;
    }
    
    try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
            showAdaptStatus('No active tab found.', 'error');
            return;
        }
        
        // Check if we can run on this tab
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
            showAdaptStatus('Cannot preview on browser internal pages.', 'error');
            return;
        }
        
        // Ensure content script is injected
        await ensureContentScript(tab.id);
        
        if (adaptationState.isPreviewActive) {
            // Remove preview
            chrome.tabs.sendMessage(tab.id, { action: 'REMOVE_STYLES' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    return;
                }
                
                adaptationState.isPreviewActive = false;
                
                // Update button state
                if (previewBtn) {
                    previewBtn.classList.remove('active');
                    previewBtn.innerHTML = '<span>👁️</span> Preview on Website';
                }
                if (previewBadge) previewBadge.style.display = 'none';
                
                showAdaptStatus('Live preview removed.', 'info');
            });
        } else {
            // Inject styles for preview
            chrome.tabs.sendMessage(tab.id, { 
                action: 'INJECT_STYLES', 
                css: adaptationState.adaptedCSS 
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    showAdaptStatus('Failed to inject styles. Try refreshing the target page.', 'error');
                    return;
                }
                
                if (response?.status === 'injected') {
                    adaptationState.isPreviewActive = true;
                    
                    // Update button state
                    if (previewBtn) {
                        previewBtn.classList.add('active');
                        previewBtn.innerHTML = '<span>✓</span> Preview Active';
                    }
                    if (previewBadge) previewBadge.style.display = 'inline-flex';
                    
                    showAdaptStatus('Live preview activated! Check your website tab.', 'success');
                }
            });
        }
    } catch (e) {
        console.error('Toggle preview error:', e);
        showAdaptStatus('Error toggling preview: ' + e.message, 'error');
    }
}

// Remove style preview from active website
async function removeStylePreview() {
    const previewBtn = document.getElementById('previewStylesBtn');
    const previewBadge = document.getElementById('previewBadge');
    
    try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) return;
        
        chrome.tabs.sendMessage(tab.id, { action: 'REMOVE_STYLES' }, (response) => {
            if (chrome.runtime.lastError) {
                // Ignore errors when content script isn't present
                return;
            }
            
            adaptationState.isPreviewActive = false;
            
            if (previewBtn) {
                previewBtn.classList.remove('active');
                previewBtn.innerHTML = '<span>👁️</span> Preview on Website';
            }
            if (previewBadge) previewBadge.style.display = 'none';
        });
    } catch (e) {
        // Silently fail
        console.log('Remove preview:', e);
    }
}

// Check preview status on page load
async function checkPreviewStatus() {
    try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) return;
        
        chrome.tabs.sendMessage(tab.id, { action: 'GET_PREVIEW_STATUS' }, (response) => {
            if (chrome.runtime.lastError || !response) return;
            
            const previewBtn = document.getElementById('previewStylesBtn');
            const previewBadge = document.getElementById('previewBadge');
            
            if (response.isActive) {
                adaptationState.isPreviewActive = true;
                if (previewBtn) {
                    previewBtn.classList.add('active');
                    previewBtn.innerHTML = '<span>✓</span> Preview Active';
                }
                if (previewBadge) previewBadge.style.display = 'inline-flex';
            }
        });
    } catch (e) {
        // Silently fail
    }
}

// ============================================
// CSS MERGE LOGIC
// ============================================

function parseExistingCSS(cssText) {
    const result = {
        rootVariables: {},
        darkVariables: {},
        themeVariables: {},
        otherRules: []
    };
    
    // Parse :root { --variable: value; } - for light mode and shared values
    const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/);
    if (rootMatch) {
        const vars = rootMatch[1].match(/--[\w-]+\s*:\s*[^;]+/g) || [];
        vars.forEach(v => {
            const [name, value] = v.split(':').map(s => s.trim());
            result.rootVariables[name] = value;
        });
    }
    
    // Parse .dark { --variable: value; } - for dark mode
    const darkMatch = cssText.match(/\.dark\s*\{([^}]+)\}/);
    if (darkMatch) {
        const vars = darkMatch[1].match(/--[\w-]+\s*:\s*[^;]+/g) || [];
        vars.forEach(v => {
            const [name, value] = v.split(':').map(s => s.trim());
            result.darkVariables[name] = value;
        });
    }
    
    // Parse @theme inline { --variable: value; } - optional theme variables
    const themeMatch = cssText.match(/@theme\s+inline\s*\{([^}]+)\}/);
    if (themeMatch) {
        const vars = themeMatch[1].match(/--[\w-]+\s*:\s*[^;]+/g) || [];
        vars.forEach(v => {
            const [name, value] = v.split(':').map(s => s.trim());
            result.themeVariables[name] = value;
        });
    }
    
    return result;
}

function generateMergedCSS(existingCSS) {
    if (!currentData) return '';
    
    const existing = parseExistingCSS(existingCSS);
    const tokens = currentData.isDeepScan 
        ? extractDesignTokensFromDeepScan(currentData)
        : extractDesignTokens(currentData);
    
    // Start with user's existing variables - we'll only update what they have
    const mergedRoot = { ...existing.rootVariables };
    const mergedDark = { ...existing.darkVariables };
    const mergedTheme = { ...existing.themeVariables };
    
    // Map extracted variables to user's variables using semantic matching
    if (tokens.rootVariables && Object.keys(tokens.rootVariables).length > 0) {
        // For each extracted variable, find the matching user variable
        Object.entries(tokens.rootVariables).forEach(([extractedVar, extractedValue]) => {
            // Try exact match first
            if (existing.rootVariables[extractedVar]) {
                mergedRoot[extractedVar] = extractedValue;
            } else {
                // Use semantic matching to find similar variable names
                const mappedVar = mapVariableName(extractedVar, existing.rootVariables);
                if (mappedVar && mappedVar !== extractedVar && existing.rootVariables[mappedVar]) {
                    // Found a semantic match - update it
                    mergedRoot[mappedVar] = extractedValue;
                } else if (extractedValue && typeof extractedValue === 'string') {
                    // Try color similarity matching for color values
                    if (extractedValue.match(/^(#|rgb|hsl)/i)) {
                        const similarVar = findSimilarColorVariable(extractedValue, existing.rootVariables);
                        if (similarVar) {
                            mergedRoot[similarVar] = extractedValue;
                        }
                    }
                }
            }
        });
        
        // Also check user variables for direct matches (backwards compatibility)
        Object.keys(existing.rootVariables).forEach(userVar => {
            if (tokens.rootVariables[userVar] && !mergedRoot[userVar]) {
                mergedRoot[userVar] = tokens.rootVariables[userVar];
            }
        });
    }
    
    if (tokens.darkVariables && Object.keys(tokens.darkVariables).length > 0) {
        // Same semantic matching for dark mode variables
        Object.entries(tokens.darkVariables).forEach(([extractedVar, extractedValue]) => {
            if (existing.darkVariables[extractedVar]) {
                mergedDark[extractedVar] = extractedValue;
            } else {
                const mappedVar = mapVariableName(extractedVar, existing.darkVariables);
                if (mappedVar && mappedVar !== extractedVar && existing.darkVariables[mappedVar]) {
                    mergedDark[mappedVar] = extractedValue;
                } else if (extractedValue && typeof extractedValue === 'string') {
                    if (extractedValue.match(/^(#|rgb|hsl)/i)) {
                        const similarVar = findSimilarColorVariable(extractedValue, existing.darkVariables);
                        if (similarVar) {
                            mergedDark[similarVar] = extractedValue;
                        }
                    }
                }
            }
        });
        
        // Backwards compatibility check
        Object.keys(existing.darkVariables).forEach(userVar => {
            if (tokens.darkVariables[userVar] && !mergedDark[userVar]) {
                mergedDark[userVar] = tokens.darkVariables[userVar];
            }
        });
    }
    
    // Handle theme variables if user has them (though extracted sites rarely have @theme inline)
    // We preserve user's theme variables as-is since they're optional
    
    // Fallback: Use extracted colors/fonts/etc. for common variables if not already updated
    // Check if variable exists in user's CSS and hasn't been updated by semantic matching above
    const colors = deduplicateColors(tokens.colors);
    if (colors.length > 0 && existing.rootVariables['--background']) {
        // Only update if the value hasn't changed from the original (meaning it wasn't matched)
        if (mergedRoot['--background'] === existing.rootVariables['--background']) {
            mergedRoot['--background'] = colors[0];
        }
    }
    if (colors.length > 1 && existing.rootVariables['--foreground']) {
        if (mergedRoot['--foreground'] === existing.rootVariables['--foreground']) {
            mergedRoot['--foreground'] = colors[1];
        }
    }
    
    // Only update typography if user has the variable and it wasn't already updated
    const families = tokens.typo?.families 
        ? (tokens.typo.families instanceof Set ? Array.from(tokens.typo.families) : tokens.typo.families)
        : [];
    if (families.length > 0 && existing.rootVariables['--font-sans']) {
        if (mergedRoot['--font-sans'] === existing.rootVariables['--font-sans']) {
            mergedRoot['--font-sans'] = `${families[0]}, sans-serif`;
        }
    }
    
    // Only update radius if user has the variable and it wasn't already updated
    if (tokens.radii?.length > 0 && existing.rootVariables['--radius']) {
        if (mergedRoot['--radius'] === existing.rootVariables['--radius']) {
            mergedRoot['--radius'] = tokens.radii[0];
        }
    }
    
    // Only update shadows if user has the variable and it wasn't already updated
    if (tokens.shadows) {
        tokens.shadows.forEach((shadow, i) => {
            const key = `--shadow-${i + 1}`;
            if (existing.rootVariables[key]) {
                if (mergedRoot[key] === existing.rootVariables[key]) {
                    mergedRoot[key] = shadow;
                }
            }
        });
    }
    
    // Generate output based on format - ONLY supported shadcn formats
    let out = `TASK: Merge these extracted styles with your existing CSS.\n\n`;
    out += `The following CSS includes your existing variables with updated values from the captured design.\n`;
    out += `Only variables that exist in your CSS have been updated - no new variables were added.\n`;
    out += `Only supported formats are included: :root, .dark, and @theme inline.\n`;
    out += `Copy this to your global.css or equivalent file.\n\n`;
    
    out += '```css\n';
    
    // Output :root { --variable: value; } - for light mode and shared values
    if (Object.keys(mergedRoot).length > 0) {
        out += ':root {\n';
        for (const [name, value] of Object.entries(mergedRoot)) {
            out += `  ${name}: ${value};\n`;
        }
        out += '}\n';
    }
    
    // Output .dark { --variable: value; } - for dark mode
    if (Object.keys(mergedDark).length > 0) {
        out += '\n.dark {\n';
        for (const [name, value] of Object.entries(mergedDark)) {
            out += `  ${name}: ${value};\n`;
        }
        out += '}\n';
    }
    
    // Output @theme inline { --variable: value; } - optional theme variables (preserve if user has them)
    if (Object.keys(mergedTheme).length > 0) {
        out += '\n@theme inline {\n';
        for (const [name, value] of Object.entries(mergedTheme)) {
            out += `  ${name}: ${value};\n`;
        }
        out += '}\n';
    }
    
    out += '```\n\n';
    
    out += '**Merged Summary:**\n';
    out += `- Total :root variables: ${Object.keys(mergedRoot).length}\n`;
    if (Object.keys(mergedDark).length > 0) {
        out += `- Total .dark variables: ${Object.keys(mergedDark).length}\n`;
    }
    if (Object.keys(mergedTheme).length > 0) {
        out += `- Total @theme inline variables: ${Object.keys(mergedTheme).length}\n`;
    }
    
    return out;
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize AI status
    await initializeAIResultsStatus();
    
    // AI Toggle handler
    const aiToggle = document.getElementById('resultsAiToggle');
    if (aiToggle) {
        aiToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            
            if (isChecked && window.GeminiService) {
                const status = await window.GeminiService.getServiceStatus();
                if (!status.hasApiKey || !status.isValid) {
                    e.target.checked = false;
                    openAISettingsResults();
                    return;
                }
            }
            
            aiEnhancementEnabled = isChecked;
            
            const regenerateBtn = document.getElementById('regeneratePromptBtn');
            const styleSelect = document.getElementById('promptStyleSelect');
            const badge = document.getElementById('aiBadge');
            
            regenerateBtn.disabled = !isChecked;
            styleSelect.disabled = !isChecked;
            badge.textContent = isChecked ? 'ON' : 'OFF';
            badge.classList.toggle('active', isChecked);
            
            if (currentData) {
                updateOutput();
            }
        });
    }
    
    // Regenerate button handler
    const regenerateBtn = document.getElementById('regeneratePromptBtn');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', regeneratePrompt);
    }
    
    // Prompt style selector handler
    const styleSelect = document.getElementById('promptStyleSelect');
    if (styleSelect) {
        styleSelect.addEventListener('change', (e) => {
            currentPromptStyle = e.target.value;
            if (currentData && aiEnhancementEnabled) {
                updateOutput();
            }
        });
    }
    
    // AI Settings modal handlers
    const openSettingsBtn = document.getElementById('openAISettingsBtn');
    const closeSettingsBtn = document.getElementById('closeAISettingsBtn');
    const saveApiKeyBtn = document.getElementById('saveResultsApiKeyBtn');
    const settingsModal = document.getElementById('aiSettingsModal');
    
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener('click', openAISettingsResults);
    }
    
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', closeAISettingsResults);
    }
    
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', saveApiKeyResults);
    }
    
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target.id === 'aiSettingsModal') {
                closeAISettingsResults();
            }
        });
    }
    
    // ============================================
    // SHADCN UI EVENT HANDLERS
    // ============================================
    
    // Shadcn tab switching
    document.querySelectorAll('.shadcn-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.shadcnTab;
            
            // Update active tab
            document.querySelectorAll('.shadcn-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            document.querySelectorAll('.shadcn-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`shadcnTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
        });
    });
    
    // Copy shadcn component
    const copyShadcnComponentBtn = document.getElementById('copyShadcnComponent');
    if (copyShadcnComponentBtn) {
        copyShadcnComponentBtn.addEventListener('click', async () => {
            const code = document.getElementById('shadcnComponentCode').value;
            if (code) {
                await navigator.clipboard.writeText(code);
                showToast('Component copied to clipboard!');
            }
        });
    }
    
    // Copy all shadcn output
    const copyShadcnAllBtn = document.getElementById('copyShadcnAll');
    if (copyShadcnAllBtn) {
        copyShadcnAllBtn.addEventListener('click', async () => {
            const component = document.getElementById('shadcnComponentCode').value;
            const css = document.getElementById('shadcnCssVars').value;
            const install = document.getElementById('shadcnInstallCmd').textContent;
            
            const combined = `// ============================================
// COMPONENT CODE
// ============================================

${component}

// ============================================
// CSS VARIABLES (add to globals.css)
// ============================================

${css}

// ============================================
// INSTALLATION
// ============================================

// ${install}
`;
            
            await navigator.clipboard.writeText(combined);
            showToast('All output copied to clipboard!');
        });
    }
    
    // Open AI settings from error hint
    const openFromError = document.getElementById('openAISettingsFromError');
    if (openFromError) {
        openFromError.addEventListener('click', openAISettingsResults);
    }
    
    // Load data with retry mechanism to handle potential race condition
    function loadDataWithRetry(retryCount = 0, maxRetries = 3) {
        chrome.storage.local.get(['lastSelection'], (result) => {
            if (result.lastSelection && result.lastSelection.tree) {
                // Data loaded successfully
                renderPage(result.lastSelection);
                
                // Check if preview is already active on the current tab
                setTimeout(() => {
                    checkPreviewStatus();
                }, 500);
            } else if (retryCount < maxRetries) {
                // Data not ready yet, retry after a short delay
                console.log(`[Results] Data not ready, retrying... (${retryCount + 1}/${maxRetries})`);
                setTimeout(() => {
                    loadDataWithRetry(retryCount + 1, maxRetries);
                }, 200);
            } else {
                // Max retries reached, render with whatever we have
                console.warn('[Results] Max retries reached, rendering with available data');
                renderPage(result.lastSelection);
            }
        });
    }
    
    loadDataWithRetry();
});
