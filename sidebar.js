// ============================================
// Plukrr — Sidebar v2
// Auto-scan design system overview + detail navigation
// ============================================

let scanData = null;
let currentSubscription = null;
let isSelecting = false;
let lastScannedTabId = null;
let detailStack = []; // nav stack: [] = overview, [item] = detail
let activeColorTab = 'backgrounds';
let savedScrollTop = 0; // persists scroll position across detail navigation
let cachedScreenshot = null; // JPEG data URL, shared across all detail views in one scan session
let dsBuilderData = null;
let currentDsStep = -1;
let dsBuilderPaused = false;
let isAddingVariantFor = null; // stepKey string while adding a new variant, null otherwise
let isReselectingFor = null;  // stepKey string while reselecting a completed step, null otherwise
let _dsActiveTabId = null;    // tab ID that most recently received START_DS_BUILDER, for cleanup on close

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', () => initSidebar());

window.addEventListener('unload', () => {
    if (_dsActiveTabId !== null && currentDsStep >= 0) {
        chrome.tabs.sendMessage(_dsActiveTabId, { action: 'CANCEL_DS_BUILDER' }, () => chrome.runtime.lastError);
    }
});

async function initSidebar() {
    try {
        const auth = await getAuth();
        if (!auth) { renderAuthScreen(); return; }
        renderTopbar('overview');
        renderLoadingScreen('Scanning page…');
        setupMainListeners();
        await loadSubscription();
        await scanCurrentTab();
    } catch (e) {
        console.error('[Sidebar] Init error:', e);
        renderAuthScreen();
    }
}

async function getAuth() {
    if (typeof AccessClient === 'undefined') return false;
    const { plukrr_auth } = await chrome.storage.local.get(['plukrr_auth']);
    return !!(plukrr_auth?.accessToken);
}

async function loadSubscription() {
    try {
        if (typeof AccessClient !== 'undefined') {
            currentSubscription = await AccessClient.forceRefresh();
        }
    } catch (e) { /* silent */ }
}

// ============================================
// SCAN
// ============================================

async function scanCurrentTab(manual = false) {
    if (!manual) detailStack = [];
    cachedScreenshot = null; // discard previous capture on each new scan
    renderTopbar('overview');
    renderLoadingScreen('Scanning page…');
    showBottomBar(false);

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { renderOverview(null, tab?.url); return; }
        lastScannedTabId = tab.id;
        const url = tab.url || '';
        if (isSystemPage(url)) { renderOverview(null, url); return; }

        try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        } catch (_) { /* already injected */ }
        await sleep(80);

        chrome.tabs.sendMessage(tab.id, { action: 'AUTO_SCAN_PAGE' }, (resp) => {
            if (chrome.runtime.lastError || !resp || resp.status !== 'ok') {
                renderOverview(null, url);
            } else {
                scanData = resp.data;
                renderOverview(scanData, url);
            }
        });
    } catch (e) {
        console.error('[Sidebar] Scan error:', e);
        renderOverview(null, '');
    }
}

// ============================================
// NAVIGATION
// ============================================

function pushDetail(item) {
    savedScrollTop = document.getElementById('contentArea').scrollTop;
    detailStack.push(item);
    renderTopbar('detail', item.label);
    renderDetailView(item);
    showBottomBar(false);
    document.getElementById('contentArea').scrollTop = 0;
    // Async: replace skeleton preview with real screenshot once available
    if (item.scanRect) injectScreenshotPreview(item);
}

// Captures (or reuses cached) tab screenshot, crops to the component's rect, and
// replaces the .detail-preview placeholder with the real pixel image.
async function injectScreenshotPreview(item) {
    try {
        // Step 1: get screenshot (cached after first call)
        if (!cachedScreenshot) {
            const resp = await new Promise(resolve =>
                chrome.runtime.sendMessage({ action: 'CAPTURE_TAB' }, r => resolve(r))
            );
            if (!resp?.dataUrl) return;
            cachedScreenshot = resp.dataUrl;
        }

        // Step 2: get current scroll position from the page
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        const scrollResp = await new Promise(resolve =>
            chrome.tabs.sendMessage(tab.id, { action: 'GET_SCROLL_Y' }, r => resolve(r))
        );
        const currentScrollY = scrollResp?.scrollY ?? 0;

        // Step 3: compute crop — adjust for scroll difference since scan
        const { top, left, width, height, scrollY: scanScrollY } = item.scanRect;
        const cropTop  = top + (currentScrollY - scanScrollY);
        const cropLeft = left;

        // If component scrolled out of view, don't attempt crop
        if (cropTop < -height || cropTop > window.innerHeight) return;

        // Step 4: crop using canvas
        const cropped = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Account for device pixel ratio in the screenshot
                const dpr = img.width / (window.screen.width || window.innerWidth);
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(width  * dpr);
                canvas.height = Math.round(height * dpr);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img,
                    Math.round(cropLeft * dpr), Math.round(cropTop * dpr),
                    Math.round(width    * dpr), Math.round(height  * dpr),
                    0, 0, canvas.width, canvas.height
                );
                resolve(canvas.toDataURL('image/jpeg', 0.92));
            };
            img.onerror = () => resolve(null);
            img.src = cachedScreenshot;
        });
        if (!cropped) return;

        // Step 5: replace .detail-preview content if the same item is still shown
        const current = detailStack[detailStack.length - 1];
        if (current?.id !== item.id) return; // user navigated away
        const previewEl = document.querySelector('.detail-preview');
        if (!previewEl) return;
        previewEl.style.padding = '0';
        previewEl.style.background = 'transparent';
        previewEl.innerHTML = `<img src="${cropped}" style="width:100%;border-radius:var(--radius-lg);display:block;" alt="Component preview">`;
    } catch (_) { /* silent — skeleton preview remains */ }
}

function goBack() {
    detailStack.pop();
    renderTopbar('overview');
    renderOverview(scanData, scanData?.pageUrl);
    // Restore scroll after the DOM is painted
    requestAnimationFrame(() => {
        document.getElementById('contentArea').scrollTop = savedScrollTop;
    });
}

// ============================================
// TOPBAR RENDERING
// ============================================

function renderTopbar(mode, title) {
    const tb = document.getElementById('topbar');
    if (mode === 'overview') {
        const tier = currentSubscription?.tier || 'free';
        const showUpgrade = tier === 'free' || tier === 'launch_offer';
        tb.innerHTML = `
            <div class="topbar-left">
                <span class="topbar-title">Overview</span>
            </div>
            <div class="topbar-right">
                ${showUpgrade ? `<button class="btn-upgrade" id="upgradeBtn">
                    <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="var(--accent)"/></svg>
                    Upgrade</button>` : ''}
                <button class="icon-btn" id="accountBtn" title="Dashboard">
                    <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </button>
                <button class="icon-btn" id="refreshBtn" title="Re-scan">
                    <svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
            </div>`;
        document.getElementById('upgradeBtn')?.addEventListener('click', () => chrome.tabs.create({ url: CONFIG.WEB_APP_URL + '/dashboard' }));
        document.getElementById('accountBtn').addEventListener('click', async () => {
            const { plukrr_auth } = await chrome.storage.local.get(['plukrr_auth']);
            chrome.tabs.create({ url: CONFIG.WEB_APP_URL + (plukrr_auth ? '/dashboard' : '/login') });
        });
        document.getElementById('refreshBtn').addEventListener('click', () => scanCurrentTab(true));
    } else {
        tb.innerHTML = `
            <div class="topbar-left">
                <button class="btn-back" id="backBtn">
                    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>Back
                </button>
                <span class="topbar-title" style="font-size:15px;">${escHtml(title || '')}</span>
            </div>`;
        document.getElementById('backBtn').addEventListener('click', goBack);
    }
}

// ============================================
// SCREEN RENDERING
// ============================================

function renderLoadingScreen(msg) {
    document.getElementById('contentArea').innerHTML = `
        <div class="loading-wrap">
            <div class="spinner"></div>
            <span class="loading-label">${escHtml(msg)}</span>
        </div>`;
}

function renderAuthScreen() {
    renderTopbar('auth');
    document.getElementById('topbar').innerHTML = `
        <div class="topbar-left"><span class="topbar-title">Plukrr</span></div>`;
    document.getElementById('contentArea').innerHTML = `
        <div class="auth-wrap">
            <div class="auth-brand">Plukrr</div>
            <div class="auth-title">Log in to Plukrr</div>
            <div class="auth-sub">Extract pixel-perfect designs from any website and generate production-ready code.</div>
            <button class="btn-login" id="loginBtn">Log in</button>
        </div>`;
    document.getElementById('loginBtn').addEventListener('click', () => chrome.tabs.create({ url: CONFIG.WEB_APP_URL + '/login' }));
}

// ============================================
// OVERVIEW RENDERING
// ============================================

function renderOverview(data, url) {
    showBottomBar(true);
    const ca = document.getElementById('contentArea');

    if (!data) {
        ca.innerHTML = `
            <div class="selecting-hint active">
                <div style="padding:24px;text-align:center;">
                    <div style="font-size:14px;font-weight:600;margin-bottom:8px;">Cannot scan this page</div>
                    <div style="font-size:12px;color:var(--muted);">Try navigating to a website and clicking refresh.</div>
                </div>
            </div>
            ${buildSelectingHint()}
            <div class="status-toast" id="statusToast"></div>
            <div class="content-pad"></div>`;
        setupActionListeners();
        return;
    }

    ca.innerHTML = `
        ${buildSelectingHint()}
        <div class="status-toast" id="statusToast"></div>
        ${buildGeneralSection(data)}
        <div class="divider"></div>
        ${buildTypographySection(data.typography || [])}
        <div class="divider"></div>
        ${buildColorsSection(data.colors || {})}
        <div class="divider"></div>
        ${buildComponentsSection(data.components || [])}
        ${(data.spacing?.scale?.length > 0) ? `<div class="divider"></div>${buildSpacingSection(data.spacing)}` : ''}
        ${(data.radii?.length > 0) ? `<div class="divider"></div>${buildRadiiSection(data.radii)}` : ''}
        ${(data.shadows?.length > 0) ? `<div class="divider"></div>${buildShadowsSection(data.shadows)}` : ''}
        ${hasLayoutData(data.layout) ? `<div class="divider"></div>${buildLayoutSection(data.layout)}` : ''}
        ${hasCSSVars(data.cssVariables) ? `<div class="divider"></div>${buildCSSVarsSection(data.cssVariables)}` : ''}
        <div class="divider"></div>
        <div class="footer-area">
            <button class="signout-btn" id="signOutBtn">
                <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out
            </button>
        </div>
        <div class="content-pad"></div>`;

    // Bind row clicks
    ca.querySelectorAll('.list-row[data-id]').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.id;
            const type = row.dataset.type;
            const item = findItem(data, type, id);
            if (item) pushDetail(item);
        });
    });

    // Render initial color swatches
    // Make sure activeColorTab is a valid tab that has data
    const colorTabKeys = ['backgrounds', 'text', 'interactive', 'borders'].filter(k => (data.colors[k] || []).length > 0);
    if (colorTabKeys.length && !colorTabKeys.includes(activeColorTab)) activeColorTab = colorTabKeys[0];
    renderColorSwatches(data.colors);

    // Bind color tab clicks
    ca.querySelectorAll('.color-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            activeColorTab = tab.dataset.tab;
            // update active tab styling
            ca.querySelectorAll('.color-tab').forEach(t => t.classList.toggle('active', t === tab));
            renderColorSwatches(data.colors);
        });
    });

    // Bind swatch copy
    bindSwatchCopy();

    document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);
    setupActionListeners();
}

// ─── General ───────────────────────────────────────────────

function buildGeneralSection(data) {
    const domain = (() => { try { return new URL(data.pageUrl).hostname; } catch (_) { return data.pageUrl; } })();
    return `
        <div class="section">
            <div class="section-hd"><span class="section-title">General</span></div>
            <div style="font-size:13px;color:var(--muted);word-break:break-all;line-height:1.5;">${escHtml(data.pageUrl)}</div>
            ${data.pageTitle ? `<div style="font-size:12px;color:var(--muted-light);margin-top:4px;">${escHtml(data.pageTitle)}</div>` : ''}
        </div>`;
}

// ─── Typography ────────────────────────────────────────────

function buildTypographySection(typography) {
    if (!typography.length) return `<div class="section"><div class="section-hd"><span class="section-title">Typography</span></div><p style="font-size:12px;color:var(--muted);">No typography data found.</p></div>`;

    const rows = typography.map(t => {
        const previewSize = Math.min(parseFloat(t.size || 14), 18);
        return `
            <div class="list-row" data-id="${t.id}" data-type="typography">
                <div class="list-row-left">
                    <div class="list-row-text">
                        <div class="list-row-title" style="font-family:'${escHtml(t.family)}',sans-serif;font-size:${previewSize}px;font-weight:${t.weight};">${escHtml(t.family)}</div>
                        <div class="list-row-sub">${escHtml(t.size)} · ${weightLabel(t.weight)}${t.textTransform ? ' · ' + t.textTransform : ''}</div>
                    </div>
                </div>
                <div class="list-row-right">
                    <span class="list-row-badge" style="background:var(--line-subtle);color:var(--muted);">${escHtml(t.label)}</span>
                    <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>`;
    }).join('');

    return `<div class="section"><div class="section-hd"><span class="section-title">Typography</span><span class="count-pill">${typography.length}</span></div>${rows}</div>`;
}

// ─── Colors ────────────────────────────────────────────────

function buildColorsSection(colors) {
    const tabs = [
        { key: 'backgrounds', label: 'Background', data: colors.backgrounds || [] },
        { key: 'text', label: 'Text', data: colors.text || [] },
        { key: 'interactive', label: 'Interactive', data: colors.interactive || [] },
        { key: 'borders', label: 'Border', data: colors.borders || [] },
    ].filter(t => t.data.length > 0);

    if (!tabs.length) return '';

    const tabHtml = tabs.map(t =>
        `<button class="color-tab${t.key === activeColorTab ? ' active' : ''}" data-tab="${t.key}">${t.label} <span style="opacity:.6;">${t.data.length}</span></button>`
    ).join('');

    return `
        <div class="section">
            <div class="section-hd"><span class="section-title">Colors</span></div>
            <div class="color-tabs">${tabHtml}</div>
            <div class="color-grid" id="colorGrid"></div>
        </div>`;
}

function renderColorSwatches(colors) {
    const grid = document.getElementById('colorGrid');
    if (!grid) return;
    const data = (colors[activeColorTab] || []);
    if (!data.length) { grid.innerHTML = `<p style="font-size:12px;color:var(--muted);">None detected.</p>`; return; }
    grid.innerHTML = data.map(({ hex }) => {
        const light = isLightHex(hex);
        const tc = light ? '#1f1f1f' : '#ffffff';
        const cp = light ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)';
        return `<div class="color-swatch" style="background:${hex};" data-hex="${hex}">
            <span class="color-swatch-hex" style="color:${tc};">${hex}</span>
            <span class="color-swatch-copy" style="color:${cp};">Copied!</span>
        </div>`;
    }).join('');
    bindSwatchCopy();
}

function bindSwatchCopy() {
    document.querySelectorAll('.color-swatch[data-hex]').forEach(el => {
        el.onclick = () => {
            navigator.clipboard.writeText(el.dataset.hex).then(() => {
                el.classList.add('copied');
                setTimeout(() => el.classList.remove('copied'), 1400);
            });
        };
    });
}

// ─── Components ────────────────────────────────────────────

const CATEGORY_META = {
    button:      { label: 'Buttons',     color: '#3b82f6', icon: '⬜' },
    input:       { label: 'Inputs',      color: '#8b5cf6', icon: '⌨' },
    card:        { label: 'Cards',       color: '#22c55e', icon: '▭' },
    badge:       { label: 'Badges',      color: '#f59e0b', icon: '●' },
    navigation:  { label: 'Navigation',  color: '#ef4444', icon: '≡' },
    'nav-item':  { label: 'Nav Items',   color: '#ef4444', icon: '→' },
    'list-item': { label: 'List Items',  color: '#14b8a6', icon: '▤' },
    modal:       { label: 'Modals',      color: '#6366f1', icon: '◱' },
    tooltip:     { label: 'Tooltips',    color: '#ec4899', icon: '◌' },
    alert:       { label: 'Alerts',      color: '#f59e0b', icon: '⚠' },
    tab:         { label: 'Tabs',        color: '#3b82f6', icon: '⊟' },
    toggle:      { label: 'Toggles',     color: '#22c55e', icon: '◐' },
    avatar:      { label: 'Avatars',     color: '#8b5cf6', icon: '○' },
    progress:    { label: 'Progress',    color: '#3b82f6', icon: '▬' },
};

function buildComponentsSection(components) {
    if (!components.length) return '';

    let html = `<div class="section"><div class="section-hd"><span class="section-title">Components</span><span class="count-pill">${components.length}</span></div>`;

    components.forEach((item, i) => {
        const previewHtml = buildComponentRowPreview(item);
        const meta = CATEGORY_META[item.category] || { color: '#6b6b6b' };
        const typeTag = `<span style="font-size:10px;font-weight:600;color:${meta.color};background:${meta.color}18;padding:1px 6px;border-radius:4px;">${escHtml(item.category || 'component')}</span>`;
        html += `
            <div class="list-row" data-id="${item.id}" data-type="component">
                <div class="list-row-left">
                    <div class="list-row-text">
                        <div class="list-row-title" style="display:flex;align-items:center;gap:6px;">Component ${i + 1} ${typeTag}</div>
                        <div class="list-row-sub">${escHtml(buildComponentSubtitle(item))}</div>
                    </div>
                </div>
                <div class="list-row-right">
                    ${previewHtml}
                    <svg class="chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>`;
    });

    return html + '</div>';
}

function buildComponentRowPreview(item) {
    const cat = item.category;
    const p = item.preview || {};
    if (cat === 'button' && p.bg) {
        const tc = isLightHex(p.bg) ? '#1f1f1f' : '#ffffff';
        return `<span style="display:inline-block;background:${p.bg};color:${tc};padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;">${escHtml(p.label?.slice(0,12) || 'Btn')}</span>`;
    }
    if ((cat === 'badge') && p.bg) {
        const tc = isLightHex(p.bg) ? '#1f1f1f' : '#ffffff';
        return `<span style="background:${p.bg};color:${tc};padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;">${escHtml(p.text?.slice(0,12) || 'Tag')}</span>`;
    }
    if (cat === 'card') {
        const bg = p.bg || '#f5f5f5';
        const r = item.properties?.['Border Radius'] || '8px';
        const border = item.properties?.['Border'] && item.properties['Border'] !== '—' ? `border:${item.properties['Border']};` : 'border:1px solid rgba(0,0,0,0.07);';
        const shadow = p.hasShadow ? 'box-shadow:0 2px 6px rgba(0,0,0,0.1);' : '';
        return `<span style="display:inline-flex;flex-direction:column;gap:3px;width:36px;min-height:28px;background:${bg};border-radius:${r};${border}${shadow}padding:5px 6px;">
            <span style="height:4px;width:70%;background:currentColor;opacity:.2;border-radius:2px;display:block;"></span>
            <span style="height:3px;width:90%;background:currentColor;opacity:.12;border-radius:2px;display:block;"></span>
            <span style="height:3px;width:55%;background:currentColor;opacity:.09;border-radius:2px;display:block;"></span>
        </span>`;
    }
    if (cat === 'nav-item' && p.textColor) {
        const bg = p.active && p.bg ? p.bg : 'transparent';
        const tc = p.textColor;
        return `<span style="display:inline-block;background:${bg};color:${tc};padding:3px 8px;border-radius:5px;font-size:10px;font-weight:600;border:1px solid rgba(0,0,0,0.06);">${escHtml(p.label?.slice(0,10) || 'Nav')}</span>`;
    }
    if (cat === 'list-item') {
        return `<span style="display:inline-block;width:28px;height:16px;background:${p.bg && p.bg !== 'transparent' ? p.bg : 'var(--card)'};border-radius:3px;border:1px solid var(--line);"></span>`;
    }
    return '';
}

function buildComponentSubtitle(item) {
    const p = item.properties || {};
    const parts = [];
    if (p['Background'] && p['Background'] !== 'transparent') parts.push(p['Background']);
    if (p['Border Radius'] && p['Border Radius'] !== '0px') parts.push(`r:${p['Border Radius']}`);
    if (p['Font Size']) parts.push(p['Font Size']);
    return parts.slice(0, 3).join(' · ') || item.category;
}

// ─── Spacing ───────────────────────────────────────────────

function buildSpacingSection(spacing) {
    if (!spacing?.scale?.length) return '';
    const max = Math.max(...spacing.scale);
    const rows = spacing.scale.map(v => {
        const pct = Math.min((v / max) * 100, 100);
        const label = spacing.baseUnit > 0 ? `${Math.round(v / spacing.baseUnit)}×` : '';
        return `<div class="spacing-row">
            <span class="spacing-val">${v}px</span>
            <div class="spacing-bar-wrap"><div class="spacing-bar" style="width:${pct}%"></div></div>
            <span class="spacing-unit">${label}</span>
        </div>`;
    }).join('');
    return `
        <div class="section">
            <div class="section-hd"><span class="section-title">Spacing</span>
                ${spacing.baseUnit ? `<span class="count-pill">base: ${spacing.baseUnit}px</span>` : ''}
            </div>
            <div class="spacing-scale">${rows}</div>
        </div>`;
}

// ─── Radii ─────────────────────────────────────────────────

function buildRadiiSection(radii) {
    if (!radii?.length) return '';
    const cards = radii.map(r => `
        <div class="radii-card">
            <div class="radii-preview" style="border-radius:${r.value};"></div>
            <div class="radii-label">${escHtml(r.label)}</div>
            <div class="radii-value">${escHtml(r.value)}</div>
        </div>`).join('');
    return `
        <div class="section">
            <div class="section-hd"><span class="section-title">Border Radius</span></div>
            <div class="radii-grid">${cards}</div>
        </div>`;
}

// ─── Shadows ───────────────────────────────────────────────

function buildShadowsSection(shadows) {
    if (!shadows?.length) return '';
    const cards = shadows.map(s => `
        <div class="shadow-card" data-id="${s.id}" data-type="shadow">
            <div class="shadow-preview" style="box-shadow:${s.value};"></div>
            <div class="shadow-label">${escHtml(s.label)}</div>
            <div class="shadow-value">${escHtml(s.value)}</div>
        </div>`).join('');
    return `
        <div class="section">
            <div class="section-hd"><span class="section-title">Shadows</span></div>
            ${cards}
        </div>`;
}

// ─── Layout ────────────────────────────────────────────────

function hasLayoutData(l) {
    return l && (l.maxWidth || l.breakpoints?.length || l.gridColumns || l.flexLayouts > 0);
}

function buildLayoutSection(layout) {
    const stats = [];
    if (layout.maxWidth) stats.push({ label: 'Container max-width', value: layout.maxWidth });
    if (layout.containerPadding && layout.containerPadding !== '0px') stats.push({ label: 'Container padding', value: layout.containerPadding });
    if (layout.gridColumns) stats.push({ label: 'Grid columns', value: `${layout.gridColumns} cols` });
    if (layout.gridGap) stats.push({ label: 'Grid gap', value: layout.gridGap });
    if (layout.flexLayouts > 0) stats.push({ label: 'Flex layouts', value: `${layout.flexLayouts} elements` });
    if (layout.gridLayouts > 0) stats.push({ label: 'Grid layouts', value: `${layout.gridLayouts} elements` });
    if (layout.breakpoints?.length) stats.push({ label: 'Breakpoints', value: layout.breakpoints.join(', ') + 'px' });

    if (!stats.length) return '';
    const rows = stats.map(s => `<div class="layout-stat"><span class="layout-stat-label">${escHtml(s.label)}</span><span class="layout-stat-value">${escHtml(s.value)}</span></div>`).join('');
    return `<div class="section"><div class="section-hd"><span class="section-title">Layout</span></div><div class="layout-grid">${rows}</div></div>`;
}

// ─── CSS Variables ─────────────────────────────────────────

function hasCSSVars(v) {
    return v && (Object.keys(v.colors || {}).length + Object.keys(v.sizes || {}) .length + Object.keys(v.fonts || {}).length) > 0;
}

function buildCSSVarsSection(cssVars) {
    const sections = [
        { key: 'colors', title: 'Color tokens', data: cssVars.colors || {} },
        { key: 'sizes', title: 'Size tokens', data: cssVars.sizes || {} },
        { key: 'fonts', title: 'Font tokens', data: cssVars.fonts || {} },
    ].filter(s => Object.keys(s.data).length > 0);

    if (!sections.length) return '';

    const totalCount = sections.reduce((n, s) => n + Object.keys(s.data).length, 0);

    let html = `<div class="section"><div class="section-hd"><span class="section-title">CSS Variables</span><span class="count-pill">${totalCount}</span></div>`;

    for (const sec of sections) {
        html += `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);padding:8px 2px 4px;">${sec.title}</div>`;
        html += `<div style="background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:0 12px;margin-bottom:8px;">`;
        for (const [prop, val] of Object.entries(sec.data)) {
            const isColor = /^#|^rgb|^hsl/.test(val.trim());
            const hex = isColor ? (val.startsWith('#') ? val : null) : null;
            const tc = hex ? (isLightHex(hex) ? '#1f1f1f' : '#ffffff') : null;
            html += `<div class="cssvar-row">
                <span class="cssvar-name" title="${escHtml(prop)}">${escHtml(prop)}</span>
                <div style="display:flex;align-items:center;gap:5px;">
                    ${hex ? `<span class="cssvar-swatch" style="background:${hex};"></span>` : ''}
                    <span class="cssvar-value">${escHtml(val.length > 20 ? val.slice(0, 20) + '…' : val)}</span>
                </div>
            </div>`;
        }
        html += `</div>`;
    }
    return html + '</div>';
}

// ============================================
// DETAIL VIEW
// ============================================

function findItem(data, type, id) {
    if (type === 'typography') return data.typography?.find(t => t.id === id);
    if (type === 'component') return data.components?.find(c => c.id === id);
    if (type === 'shadow') return data.shadows?.find(s => s.id === id);
    return null;
}

function renderDetailView(item) {
    const ca = document.getElementById('contentArea');
    const type = item.category === undefined ? item._type : (
        ['heading', 'body', 'label', 'mono', 'ui'].includes(item.category) ? 'typography' : 'component'
    );

    let preview = '', propsHtml = '';

    if (['heading', 'body', 'label', 'mono', 'ui'].includes(item.category)) {
        // Typography detail
        const fs = Math.min(parseFloat(item.size || 16), 32);
        preview = `
            <div class="detail-preview">
                <div class="detail-preview-text" style="font-family:'${escHtml(item.family)}',sans-serif;font-size:${fs}px;font-weight:${item.weight};line-height:${item.lineHeight};letter-spacing:${item.letterSpacing || 'normal'};color:${item.color || '#1f1f1f'};">
                    ${escHtml(item.preview || item.family)}
                </div>
            </div>`;
        propsHtml = buildPropsTable([
            { group: 'Font', props: { 'Family': item.family, 'Weight': item.weight + (item.weight ? ` (${weightLabel(item.weight)})` : ''), 'Style': item.fontStyle || 'Normal' } },
            { group: 'Size & Spacing', props: { 'Font Size': item.size, 'Line Height': item.lineHeight, 'Letter Spacing': item.letterSpacing || '0', 'Text Transform': item.textTransform || 'none' } },
            { group: 'Color', props: { 'Color': item.color } },
        ]);
    } else if (item.category === 'button') {
        const p = item.properties || {};
        const bg = item.preview?.bg || p['Background'] || 'transparent';
        const tc = item.preview?.textColor || p['Text Color'] || '#fff';
        const label = item.preview?.label || item.label;
        preview = `
            <div class="detail-preview">
                <button class="comp-preview-btn" style="background:${bg};color:${tc};border-radius:${p['Border Radius'] || '6px'};padding:${p['Padding'] || '8px 16px'};font-size:${p['Font Size'] || '14px'};font-weight:${p['Font Weight'] || '600'};font-family:${p['Font Family'] || 'inherit'},sans-serif;border:${p['Border'] || 'none'};cursor:default;">${escHtml(label)}</button>
            </div>`;
        propsHtml = buildPropsFromObj(p);
    } else if (item.category === 'input') {
        const p = item.properties || {};
        const bg = item.preview?.bg || '#fff';
        const tc = item.preview?.textColor || '#000';
        const bc = item.preview?.borderColor || '#d1d5db';
        preview = `
            <div class="detail-preview">
                <input class="comp-preview-input" style="background:${bg};color:${tc};border:${p['Border'] || `1px solid ${bc || '#d1d5db'}`};border-radius:${p['Border Radius'] || '6px'};font-size:${p['Font Size'] || '14px'};font-family:inherit;" placeholder="${escHtml(item.preview?.placeholder || 'Input…')}" readonly>
            </div>`;
        propsHtml = buildPropsFromObj(p);
    } else if (item.category === 'badge') {
        const p = item.properties || {};
        const bg = item.preview?.bg || p['Background'] || '#eee';
        const tc = item.preview?.textColor || p['Text Color'] || '#333';
        const text = item.preview?.text || item.label;
        preview = `
            <div class="detail-preview">
                <span class="comp-preview-badge" style="background:${bg};color:${tc};border-radius:${p['Border Radius'] || '999px'};font-size:${p['Font Size'] || '12px'};font-weight:${p['Font Weight'] || '600'};padding:${p['Padding'] || '4px 10px'};">${escHtml(text)}</span>
            </div>`;
        propsHtml = buildPropsFromObj(p);
    } else if (item.category === 'card') {
        const p = item.properties || {};
        const bg = item.preview?.bg || p['Background'] || '#fff';
        const borderStyle = p['Border'] && p['Border'] !== '—' ? `border:${p['Border']};` : '';
        const shadowStyle = p['Box Shadow'] && p['Box Shadow'] !== '—' ? `box-shadow:${p['Box Shadow']};` : '';
        const paddingStyle = p['Padding'] ? `padding:${p['Padding']};` : 'padding:14px;';
        const gapStyle = p['Gap'] && p['Gap'] !== '—' ? `gap:${p['Gap']};` : 'gap:10px;';
        const innerHTML = buildCardPreviewInner(item.anatomy);
        preview = `
            <div class="detail-preview" style="padding:12px;">
                <div style="width:100%;background:${bg};border-radius:${p['Border Radius'] || '8px'};${borderStyle}${shadowStyle}${paddingStyle}display:flex;flex-direction:column;${gapStyle}">
                    ${innerHTML}
                </div>
            </div>`;
        propsHtml = buildPropsFromObj(p) + buildAnatomySection(item.anatomy);
    } else if (item.category === 'nav-item') {
        const p = item.properties || {};
        const tc = item.preview?.textColor || p['Text Color'] || '#333';
        const bg = item.preview?.bg || p['Background'] || 'transparent';
        const label = item.preview?.label || item.label;
        preview = `
            <div class="detail-preview" style="gap:6px;flex-wrap:wrap;">
                <span style="display:inline-block;padding:6px 14px;border-radius:${p['Border Radius'] || '6px'};font-size:${p['Font Size'] || '14px'};font-weight:${p['Font Weight'] || '500'};color:${tc};background:${bg};border:1px solid rgba(0,0,0,0.06);">${escHtml(label)}</span>
                <span style="display:inline-block;padding:6px 14px;border-radius:${p['Border Radius'] || '6px'};font-size:${p['Font Size'] || '14px'};font-weight:${p['Font Weight'] || '500'};color:${tc};opacity:0.5;">Other Item</span>
            </div>`;
        propsHtml = buildPropsFromObj(p);
    } else if (item.category === 'list-item') {
        const p = item.properties || {};
        const bg = item.preview?.bg || p['Background'] || 'transparent';
        preview = `
            <div class="detail-preview" style="padding:8px;flex-direction:column;gap:0;align-items:stretch;">
                <div style="height:${p['Height'] || '56px'};background:${bg};border-radius:${p['Border Radius'] && p['Border Radius'] !== '—' ? p['Border Radius'] : '0'};${p['Border Bottom'] && p['Border Bottom'] !== '—' ? 'border-bottom:' + p['Border Bottom'] + ';' : ''}display:flex;align-items:center;padding:${p['Padding'] || '0 12px'};gap:${p['Gap'] && p['Gap'] !== '—' ? p['Gap'] : '8px'};">
                    <div style="width:8px;height:8px;border-radius:50%;background:var(--muted);opacity:.4;flex-shrink:0;"></div>
                    <div style="flex:1;height:8px;background:currentColor;opacity:.12;border-radius:4px;"></div>
                    <div style="width:30px;height:8px;background:currentColor;opacity:.08;border-radius:4px;"></div>
                </div>
                <div style="height:${p['Height'] || '56px'};background:${bg};border-radius:${p['Border Radius'] && p['Border Radius'] !== '—' ? p['Border Radius'] : '0'};display:flex;align-items:center;padding:${p['Padding'] || '0 12px'};gap:${p['Gap'] && p['Gap'] !== '—' ? p['Gap'] : '8px'};opacity:.5;">
                    <div style="width:8px;height:8px;border-radius:50%;background:var(--muted);opacity:.4;flex-shrink:0;"></div>
                    <div style="flex:1;height:8px;background:currentColor;opacity:.12;border-radius:4px;"></div>
                    <div style="width:30px;height:8px;background:currentColor;opacity:.08;border-radius:4px;"></div>
                </div>
            </div>`;
        propsHtml = buildPropsFromObj(p) + buildAnatomySection(item.anatomy);
    } else if (item.category === 'navigation') {
        const p = item.properties || {};
        const bg = item.preview?.bg || p['Background'] || '#fff';
        preview = `
            <div class="detail-preview" style="padding:0;overflow:hidden;border-radius:var(--radius-lg);">
                <div style="width:100%;height:48px;background:${bg};${p['Border Bottom'] && p['Border Bottom'] !== '—' ? 'border-bottom:' + p['Border Bottom'] + ';' : ''}${p['Box Shadow'] && p['Box Shadow'] !== '—' ? 'box-shadow:' + p['Box Shadow'] + ';' : ''}display:flex;align-items:center;padding:0 16px;gap:20px;">
                    <div style="width:60px;height:8px;background:currentColor;opacity:.15;border-radius:4px;"></div>
                    <div style="width:40px;height:8px;background:currentColor;opacity:.1;border-radius:4px;"></div>
                    <div style="width:50px;height:8px;background:currentColor;opacity:.1;border-radius:4px;"></div>
                </div>
            </div>`;
        propsHtml = buildPropsFromObj(p) + buildAnatomySection(item.anatomy);
    } else if (item.id?.startsWith('s')) {
        // Shadow detail
        preview = `
            <div class="detail-preview">
                <div style="width:100px;height:60px;background:#fff;border-radius:8px;box-shadow:${escHtml(item.value)};"></div>
            </div>`;
        propsHtml = buildPropsTable([{ group: 'Shadow', props: { 'Level': item.label, 'Value': item.value } }]);
    } else {
        const p = item.properties || {};
        propsHtml = buildPropsFromObj(p);
    }

    ca.innerHTML = `
        <div class="detail-wrap">
            ${preview}
            ${propsHtml}
        </div>
        <div class="content-pad"></div>`;
}

// Build skeleton preview blocks for the card detail header using typed sub-components.
function buildCardPreviewInner(anatomy) {
    if (!anatomy || anatomy.length === 0) {
        return `<div style="height:8px;width:55%;background:currentColor;opacity:.15;border-radius:4px;"></div>
                <div style="height:7px;width:75%;background:currentColor;opacity:.09;border-radius:4px;margin-top:6px;"></div>`;
    }
    let rows = '';
    for (const sub of anatomy.slice(0, 5)) {
        const p = sub.props || {};
        if (sub.type === 'button') {
            // Use real bg if we have it, otherwise a neutral fill — never default to #000
            const bg = p['Background'] || 'var(--accent)';
            const tc = p['Text Color'] || '#fff';
            const r = p['Border Radius'] || '6px';
            const lbl = p['_label']?.slice(0, 12) || 'Button';
            rows += `<div style="display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:${r};background:${bg};color:${tc};font-size:10px;font-weight:600;height:${Math.min(parseInt(p['Height']) || 28, 28)}px;">${escHtml(lbl)}</div>`;
        } else if (sub.type === 'input') {
            const bg = p['Background'] || 'var(--surface)';
            const border = p['Border'] ? `border:${p['Border']};` : 'border:1px solid var(--line);';
            const r = p['Border Radius'] || '6px';
            rows += `<div style="display:flex;align-items:center;height:24px;padding:0 8px;border-radius:${r};background:${bg};${border}gap:6px;"><div style="flex:1;height:6px;background:currentColor;opacity:.12;border-radius:3px;"></div></div>`;
        } else if (sub.type === 'badge') {
            const bg = p['Background'] || 'var(--line)';
            const tc = p['Text Color'] || 'var(--text)';
            const lbl = p['_label']?.slice(0, 10) || 'Tag';
            rows += `<div style="display:inline-block;padding:2px 7px;border-radius:999px;background:${bg};color:${tc};font-size:9px;font-weight:600;">${escHtml(lbl)}</div>`;
        } else if (sub.type === 'list-item') {
            const bg = p['Background'] || 'transparent';
            const h = Math.min(parseInt(p['Height']) || 36, 28);
            rows += `<div style="display:flex;align-items:center;gap:8px;height:${h}px;background:${bg};padding:0 4px;border-radius:${p['Border Radius'] || '0'};"><div style="width:10px;height:10px;border-radius:50%;background:currentColor;opacity:.2;flex-shrink:0;"></div><div style="flex:1;height:6px;background:currentColor;opacity:.12;border-radius:3px;"></div></div>`;
        } else if (sub.type === 'heading') {
            rows += `<div style="height:9px;width:65%;background:currentColor;opacity:.2;border-radius:4px;"></div>`;
        } else if (sub.type === 'media') {
            const w = Math.min(parseInt(p['Width']) || 80, 80);
            const h = Math.min(parseInt(p['Height']) || 40, 40);
            rows += `<div style="width:${w}px;height:${h}px;background:var(--line);border-radius:4px;opacity:.5;"></div>`;
        } else {
            rows += `<div style="height:7px;width:60%;background:currentColor;opacity:.1;border-radius:4px;"></div>`;
        }
    }
    return rows || `<div style="height:8px;width:55%;background:currentColor;opacity:.15;border-radius:4px;"></div>`;
}

// Render typed sub-components as individual property blocks below the card container props.
function buildSubComponentsSection(anatomy) {
    if (!anatomy || anatomy.length === 0) return '';

    const TYPE_META = {
        button:     { label: 'Button',       icon: '⬜', color: '#3b82f6' },
        input:      { label: 'Input Field',   icon: '⌨',  color: '#8b5cf6' },
        badge:      { label: 'Badge',         icon: '●',  color: '#f59e0b' },
        'nav-item': { label: 'Nav Item',      icon: '→',  color: '#ef4444' },
        'list-item':{ label: 'List Item',     icon: '▤',  color: '#14b8a6' },
        heading:    { label: 'Heading',       icon: '𝐓',  color: '#6b7280' },
        media:      { label: 'Chart / Image', icon: '▭',  color: '#6b7280' },
    };

    let html = '';
    for (const sub of anatomy) {
        const m = TYPE_META[sub.type] || { label: sub.type, icon: '·', color: '#6b7280' };
        const countTag = sub.count > 1 ? `<span style="font-size:10px;font-weight:700;background:${m.color};color:#fff;padding:1px 6px;border-radius:999px;margin-left:6px;">×${sub.count}</span>` : '';

        // Filter props: skip internal _label keys and null/undefined/empty values
        const propEntries = Object.entries(sub.props || {})
            .filter(([k, v]) => !k.startsWith('_') && v !== null && v !== undefined && v !== '' && v !== '—');

        if (propEntries.length === 0 && !sub.props?.['_label']) continue;

        html += `<div class="props-table" style="margin-bottom:8px;">
            <div class="props-group-title" style="display:flex;align-items:center;gap:6px;">
                <span style="color:${m.color};">${m.icon}</span>
                <span>${escHtml(m.label)}</span>
                ${countTag}
                ${sub.props?.['_label'] ? `<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:auto;">"${escHtml(String(sub.props['_label']).slice(0,24))}"</span>` : ''}
            </div>`;
        for (const [k, v] of propEntries) {
            html += buildPropRow(k, String(v));
        }
        html += '</div>';
    }
    return html ? `<div style="margin-top:4px;">${html}</div>` : '';
}

// Keep buildAnatomySection for navigation detail view (uses old format from Phase 5 nav extraction)
function buildAnatomySection(anatomy) {
    return buildSubComponentsSection(anatomy);
}

function buildPropsFromObj(props) {
    const rows = Object.entries(props)
        .filter(([k, v]) => !k.startsWith('_') && v && v !== '—' && v !== 'undefined' && v !== 'null')
        .map(([k, v]) => buildPropRow(k, v))
        .join('');
    return `<div class="props-table"><div class="props-group-title">Properties</div>${rows}</div>`;
}

function buildPropsTable(groups) {
    return groups.filter(g => Object.keys(g.props).length > 0).map(g => {
        const rows = Object.entries(g.props).filter(([, v]) => v && v !== '—').map(([k, v]) => buildPropRow(k, v)).join('');
        return `<div class="props-table" style="margin-bottom:8px;"><div class="props-group-title">${escHtml(g.group)}</div>${rows}</div>`;
    }).join('');
}

function buildPropRow(label, value) {
    const isColor = typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
    const swatch = isColor ? `<span class="prop-swatch" style="background:${value};"></span>` : '';
    return `<div class="prop-row">
        <span class="prop-label">${escHtml(label)}</span>
        <span class="prop-value">${swatch}${escHtml(String(value))}</span>
    </div>`;
}

// ============================================
// SELECTING STATE
// ============================================

function buildSelectingHint() {
    return `<div class="selecting-hint" id="selectingHint">
        <div class="pulse-ring"><svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z"/></svg></div>
        <div class="selecting-title">Click an element on the page</div>
        <div class="selecting-sub">Hover any element and click to extract its design.</div>
        <button class="btn-cancel" id="cancelSelectBtn">Cancel</button>
    </div>`;
}

function enterSelectingState() {
    isSelecting = true;
    document.getElementById('selectingHint')?.classList.add('active');
}

function exitSelectingState() {
    isSelecting = false;
    document.getElementById('selectingHint')?.classList.remove('active');
}

// ============================================
// STATUS
// ============================================

function showStatus(type, msg) {
    const t = document.getElementById('statusToast');
    if (!t) return;
    t.className = `status-toast active ${type}`;
    t.innerHTML = msg;
}
function hideStatus() {
    const t = document.getElementById('statusToast');
    if (t) t.className = 'status-toast';
}

// ============================================
// BOTTOM BAR & ACTIONS
// ============================================

function showBottomBar(show) {
    document.getElementById('bottomBar').classList.toggle('visible', show);
}

async function _reinjectDsBuilder(tabId) {
    if (!dsBuilderData) return;
    currentDsStep = -1;
    dsBuilderPaused = false;
    saveDsBuilderState();
    renderDsBuilderSidebar();
}

function setupMainListeners() {
    // Re-scan on tab change (skip if DS builder is mid-walkthrough)
    chrome.tabs.onActivated.addListener(async ({ tabId }) => {
        if (dsBuilderData) { _reinjectDsBuilder(tabId); return; }
        if (tabId !== lastScannedTabId) { detailStack = []; await scanCurrentTab(); }
    });
    chrome.tabs.onUpdated.addListener(async (tabId, info) => {
        if (info.status === 'complete') {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (active?.id === tabId) {
                if (dsBuilderData) { _reinjectDsBuilder(tabId); return; }
                detailStack = []; await scanCurrentTab();
            }
        }
    });
    // Detect element extracted
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.lastSelection && isSelecting) {
            isSelecting = false;
            exitSelectingState();
            showStatus('success', 'Element extracted — results opening…');
        }
    });

    // DS Builder messages from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'DS_STEP_COMPLETED') {
            const isAddVariant = isAddingVariantFor === message.stepKey;
            accumulateStep(message.stepKey, message.styles, message.stepIndex, isAddVariant);
        }
        if (message.type === 'DS_BUILDER_PAUSED') {
            dsBuilderPaused = true;
            renderDsBuilderSidebar();
        }
        if (message.type === 'DS_BUILDER_FINISHED') {
            finalizeDsBuilder();
        }
        if (message.type === 'DS_BUILDER_CANCELLED') {
            // X on the bottom widget = cancel current step selection, go back to the component list
            // Do NOT wipe dsBuilderData — the user's captured steps must be preserved
            currentDsStep = -1;
            isAddingVariantFor = null;
            isReselectingFor = null;
            dsBuilderPaused = false;
            saveDsBuilderState();
            renderDsBuilderSidebar();
        }
    });
}

function setupActionListeners() {
    document.getElementById('getDesignMdBtn')?.addEventListener('click', handleGetDesignMd);
    document.getElementById('createDsBtn')?.addEventListener('click', handleCreateDs);
    document.getElementById('cancelSelectBtn')?.addEventListener('click', handleCancelSelect);
}

async function handleCancelSelect() {
    isSelecting = false;
    exitSelectingState();
    hideStatus();
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) chrome.tabs.sendMessage(tab.id, { action: 'CANCEL_SELECTION' }, () => chrome.runtime.lastError);
    } catch (_) {}
}

function handleGetDesignMd() {
    if (!scanData) { showStatus('error', 'No scan data available. Scan a page first.'); return; }
    const designMd  = generateDesignMarkdown(scanData);
    const shadcnMd  = generateShadcnThemeMd(scanData);
    showBottomBar(false);
    renderTopbar('detail', 'design files');
    renderDesignMdView(designMd, shadcnMd, scanData.pageUrl);
}

// ============================================
// DS BUILDER (GUIDED MODE)
// ============================================

const DS_BUILDER_TOTAL_STEPS = 26;

// Maps each step to the semantic token key to display in the sidebar progress list
const DS_STEP_DISPLAY = [
    { stepKey: 'primaryButton',   label: 'Primary Button',     fills: 'Button Primary',                     valueKey: 'primary' },
    { stepKey: 'secondaryButton', label: 'Secondary Button',   fills: 'Button Secondary, Button Group',     valueKey: 'secondary' },
    { stepKey: 'input',           label: 'Input Field',        fills: 'Input, Text Area',                   valueKey: 'border' },
    { stepKey: 'pageBackground',  label: 'Page Background',    fills: 'Background, Dialog, Drawer',         valueKey: 'background' },
    { stepKey: 'card',            label: 'Card',               fills: 'Card',                               valueKey: 'card' },
    { stepKey: 'muted',           label: 'Muted Surface',      fills: 'Accordion, Alert, Context Menu',     valueKey: 'muted' },
    { stepKey: 'navigation',      label: 'Navigation',         fills: 'Navigation Menu, Menu Bar, Sidebar', valueKey: 'sidebar' },
    { stepKey: 'badge',           label: 'Badge / Tag',        fills: 'Badge, Chip, Label',                 valueKey: 'badgeFontSize' },
    { stepKey: 'heading',         label: 'Heading',            fills: 'Typography — Headings',              valueKey: 'headingFontFamily' },
    { stepKey: 'bodyText',        label: 'Body Text',          fills: 'Typography — Body',                  valueKey: 'bodyFontFamily' },
    { stepKey: 'destructive',     label: 'Danger Button',      fills: 'Delete, Warning, Error Actions',     valueKey: 'destructive' },
    { stepKey: 'accent',          label: 'Link / Accent',      fills: 'Links, Highlighted Text',            valueKey: 'accent' },
    { stepKey: 'avatar',          label: 'Avatar',             fills: 'User Avatar, Profile Image',         valueKey: 'avatarBg' },
    { stepKey: 'checkbox',        label: 'Checkbox',           fills: 'Checkbox, Multi-select',             valueKey: 'checkboxBorderColor' },
    { stepKey: 'radio',           label: 'Radio Button',       fills: 'Radio, Single-select',               valueKey: 'radioBorderColor' },
    { stepKey: 'switch',          label: 'Switch / Toggle',    fills: 'Toggle, On-Off Switch',              valueKey: 'switchBg' },
    { stepKey: 'select',          label: 'Select',             fills: 'Dropdown Select, Combobox',          valueKey: 'selectBg' },
    { stepKey: 'table',           label: 'Table',              fills: 'Data Table, Grid',                   valueKey: 'tableHeaderBg' },
    { stepKey: 'accordion',       label: 'Accordion',          fills: 'Accordion, Collapsible',             valueKey: 'accordionBg' },
    { stepKey: 'alert',           label: 'Alert',              fills: 'Alert, Banner, Callout',             valueKey: 'alertBg' },
    { stepKey: 'toast',           label: 'Toast',              fills: 'Toast, Snackbar, Notification',      valueKey: 'toastBg' },
    { stepKey: 'tooltip',         label: 'Tooltip',            fills: 'Tooltip, Popover Hint',              valueKey: 'tooltipBg' },
    { stepKey: 'dropdown',        label: 'Dropdown Menu',      fills: 'Dropdown, Popover Menu',             valueKey: 'popover' },
    { stepKey: 'contextMenu',     label: 'Context Menu',       fills: 'Right-click Menu',                   valueKey: 'contextMenuBg' },
    { stepKey: 'drawerModal',     label: 'Drawer / Modal',     fills: 'Modal Dialog, Side Drawer',          valueKey: 'dialogBg' },
    { stepKey: 'sidebarPanel',    label: 'Sidebar Panel',      fills: 'Side Panel, Sheet',                  valueKey: 'sheetBg' },
];

async function handleCreateDs() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) { showStatus('error', 'No active tab found.'); return; }

    // Seed from existing auto-scan data so colors/typography/spacing/layout are populated
    // even if the user skips those DS Builder steps.
    dsBuilderData = {
        pageUrl:    scanData?.pageUrl    || tab.url   || '',
        pageTitle:  scanData?.pageTitle  || tab.title || '',
        colors:     scanData?.colors
                        ? { ...scanData.colors }
                        : { backgrounds: [], text: [], borders: [], interactive: [] },
        // Seed semantic tokens from auto-scan so skipped steps keep extracted values.
        // accumulateStep() overwrites individual keys when the user selects an element,
        // so user picks always take priority over auto-scan — but nothing is lost on skip.
        semanticTokens: scanData?.semanticTokens
            ? Object.fromEntries(Object.entries(scanData.semanticTokens).map(([k, v]) => [k, { ...v, source: 'auto-scan' }]))
            : {},
        stepStatuses: {},
        typography:   scanData?.typography   ? [...scanData.typography]   : [],
        radii:        scanData?.radii        ? [...scanData.radii]        : [],
        cssVariables: scanData?.cssVariables ? { ...scanData.cssVariables } : { colors: {}, sizes: {} },
        spacing:      scanData?.spacing      ? { ...scanData.spacing }    : {},
        shadows:      scanData?.shadows      ? [...scanData.shadows]      : [],
        layout:       scanData?.layout       ? { ...scanData.layout }     : {},
        components:   [],
        stepVariants:  {},
        activeVariants: {},
    };

    preSeedDsBuilderFromScan(dsBuilderData, scanData);

    showBottomBar(false);
    renderTopbar('detail', 'Build DS');
    currentDsStep = -1;
    // Clear any stale saved session — state is only persisted once the user
    // actually clicks a Select card, so opening Create DS fresh never restores Build DS on reload.
    chrome.storage.local.remove('dsBuilderState').catch(() => {});
    renderDsBuilderSidebar();
}

function preSeedDsBuilderFromScan(dsb, scan) {
    if (!scan?.semanticTokens) return;
    const st = {};
    for (const [k, v] of Object.entries(scan.semanticTokens)) {
        if (v?.value) st[k] = v.value;
    }

    function seed(stepKey, primaryKey, tokens) {
        if (!tokens[primaryKey]) return;
        const snap = {};
        for (const [k, v] of Object.entries(tokens)) {
            if (v) snap[k] = v;
        }
        dsb.stepVariants[stepKey] = [{ label: 'Variant 1', tokens: snap }];
        dsb.activeVariants[stepKey] = 0;
        dsb.stepStatuses[stepKey] = 'completed';
    }

    seed('pageBackground', 'background', {
        background: st.background,
        foreground: st.foreground,
    });
    seed('primaryButton', 'primary', {
        primary: st.primary,
        primaryForeground: st.primaryForeground,
        primaryBorderRadius: st.primaryBorderRadius,
        primaryPaddingTop: st.primaryPaddingTop,
        primaryPaddingRight: st.primaryPaddingRight,
        primaryFontSize: st.primaryFontSize,
        primaryFontWeight: st.primaryFontWeight,
        primaryFontFamily: st.primaryFontFamily,
        primaryLetterSpacing: st.primaryLetterSpacing,
        primaryTextTransform: st.primaryTextTransform,
        primaryBoxShadow: st.primaryBoxShadow,
    });
    seed('secondaryButton', 'secondary', {
        secondary: st.secondary,
        secondaryForeground: st.secondaryForeground,
        secondaryBorderColor: st.secondaryBorderColor,
        secondaryBorderRadius: st.secondaryBorderRadius,
    });
    seed('destructive', 'destructive', {
        destructive: st.destructive,
        destructiveForeground: st.destructiveForeground,
    });
    seed('input', 'border', {
        border: st.border,
        inputBg: st.inputBg,
        inputHeight: st.inputHeight,
        inputBorderRadius: st.inputBorderRadius,
        inputPaddingTop: st.inputPaddingTop,
        inputPaddingRight: st.inputPaddingRight,
        inputFontSize: st.inputFontSize,
    });
    seed('card', 'card', {
        card: st.card,
        cardForeground: st.cardForeground,
        cardBorderRadius: st.cardBorderRadius,
        cardBorderColor: st.cardBorderColor,
        cardBoxShadow: st.cardBoxShadow,
        cardPaddingTop: st.cardPaddingTop,
        cardPaddingRight: st.cardPaddingRight,
        cardGap: st.cardGap,
    });
    seed('badge', 'badgeFontSize', {
        badgeBackground: st.badgeBg,
        badgeForeground: st.badgeForeground,
        badgeBorderRadius: st.badgeBorderRadius,
        badgeFontSize: st.badgeFontSize,
        badgeFontWeight: st.badgeFontWeight,
        badgePaddingTop: st.badgePaddingTop,
        badgePaddingRight: st.badgePaddingRight,
        badgeBorderColor: st.badgeBorderColor,
    });
    seed('navigation', 'sidebar', {
        sidebar: st.sidebar,
        sidebarForeground: st.sidebarForeground,
    });
    seed('muted', 'muted', {
        muted: st.muted,
        mutedForeground: st.mutedForeground,
    });
    seed('accent', 'accent', {
        accent: st.accent,
        ring: st.ring,
    });
    seed('heading', 'headingFontFamily', {
        headingFontFamily: st.headingFontFamily,
        h1FontSize: st.h1FontSize,
        h1FontWeight: st.h1FontWeight,
        h1LineHeight: st.h1LineHeight,
        h1LetterSpacing: st.h1LetterSpacing,
        h1Color: st.h1Color,
    });
    seed('bodyText', 'bodyFontFamily', {
        bodyFontFamily: st.bodyFontFamily,
        bodyFontSize: st.bodyFontSize,
        bodyLineHeight: st.bodyLineHeight,
        bodyLetterSpacing: st.bodyLetterSpacing,
    });
    seed('avatar', 'avatarBg', {
        avatarBg: st.avatarBg,
        avatarBorderRadius: st.avatarBorderRadius,
        avatarSize: st.avatarSize,
        avatarBorderColor: st.avatarBorderColor,
    });
    seed('checkbox', 'checkboxBorderColor', {
        checkboxBorderColor: st.checkboxBorderColor,
        checkboxBorderRadius: st.checkboxBorderRadius,
        checkboxSize: st.checkboxSize,
    });
    seed('radio', 'radioBorderColor', {
        radioBorderColor: st.radioBorderColor,
        radioBorderRadius: st.radioBorderRadius,
        radioSize: st.radioSize,
        radioAccentColor: st.radioAccentColor,
    });
    seed('switch', 'switchBg', {
        switchBg: st.switchBg,
        switchBorderRadius: st.switchBorderRadius,
        switchWidth: st.switchWidth,
        switchHeight: st.switchHeight,
    });
    seed('select', 'selectBg', {
        selectBg: st.selectBg,
        selectBorderRadius: st.selectBorderRadius,
        selectBorderColor: st.selectBorderColor,
        selectHeight: st.selectHeight,
    });
    seed('table', 'tableHeaderBg', {
        tableBg: st.tableBg,
        tableBorderColor: st.tableBorderColor,
        tableHeaderBg: st.tableHeaderBg,
        tableHeaderForeground: st.tableHeaderForeground,
        tableHeaderFontWeight: st.tableHeaderFontWeight,
        tableHeaderPaddingTop: st.tableHeaderPaddingTop,
        tableHeaderPaddingRight: st.tableHeaderPaddingRight,
        tableCellForeground: st.tableCellForeground,
        tableCellPaddingTop: st.tableCellPaddingTop,
    });
    seed('accordion', 'accordionBg', {
        accordionBg: st.accordionBg,
        accordionBorderColor: st.accordionBorderColor,
        accordionTriggerForeground: st.accordionTriggerForeground,
        accordionTriggerFontWeight: st.accordionTriggerFontWeight,
        accordionTriggerPaddingTop: st.accordionTriggerPaddingTop,
        accordionTriggerPaddingRight: st.accordionTriggerPaddingRight,
    });
    seed('alert', 'alertBg', {
        alertBg: st.alertBg,
        alertForeground: st.alertForeground,
        alertBorderColor: st.alertBorderColor,
        alertBorderRadius: st.alertBorderRadius,
        alertPaddingTop: st.alertPaddingTop,
        alertPaddingRight: st.alertPaddingRight,
        alertBoxShadow: st.alertBoxShadow,
    });
    seed('toast', 'toastBg', {
        toastBg: st.toastBg,
        toastForeground: st.toastForeground,
        toastBorderColor: st.toastBorderColor,
        toastBorderRadius: st.toastBorderRadius,
        toastBoxShadow: st.toastBoxShadow,
    });
    seed('tooltip', 'tooltipBg', {
        tooltipBg: st.tooltipBg,
        tooltipForeground: st.tooltipForeground,
        tooltipBorderRadius: st.tooltipBorderRadius,
        tooltipFontSize: st.tooltipFontSize,
        tooltipPaddingTop: st.tooltipPaddingTop,
        tooltipPaddingRight: st.tooltipPaddingRight,
        tooltipBoxShadow: st.tooltipBoxShadow,
    });
    seed('dropdown', 'popover', {
        popover: st.popover,
        popoverForeground: st.popoverForeground,
        popoverBorderRadius: st.popoverBorderRadius,
        popoverBoxShadow: st.popoverBoxShadow,
        popoverBorderColor: st.popoverBorderColor,
    });
    seed('drawerModal', 'dialogBg', {
        dialogBg: st.dialogBg,
        dialogForeground: st.dialogForeground,
        dialogBorderRadius: st.dialogBorderRadius,
        dialogBoxShadow: st.dialogBoxShadow,
        dialogPaddingTop: st.dialogPaddingTop,
        dialogPaddingRight: st.dialogPaddingRight,
    });
    seed('sidebarPanel', 'sheetBg', {
        sheetBg: st.sheetBg,
        sheetForeground: st.sheetForeground,
        sheetBorderColor: st.sheetBorderColor,
    });

    rebuildSemanticTokens();
}

function accumulateStep(stepKey, styles, stepIndex, isAddVariant = false) {
    if (!dsBuilderData) return;

    dsBuilderData.stepStatuses[stepKey] = styles ? 'completed' : 'skipped';
    dsBuilderPaused = false;

    if (styles) {
        // Build a raw token snapshot { key: rawValue }
        const tokenSnapshot = {};
        for (const [k, v] of Object.entries(styles)) {
            if (v) tokenSnapshot[k] = v;
        }

        // Store into stepVariants
        if (!dsBuilderData.stepVariants) dsBuilderData.stepVariants = {};
        if (!dsBuilderData.activeVariants) dsBuilderData.activeVariants = {};
        if (!dsBuilderData.stepVariants[stepKey]) dsBuilderData.stepVariants[stepKey] = [];

        if (isAddVariant) {
            const newIdx = dsBuilderData.stepVariants[stepKey].length;
            dsBuilderData.stepVariants[stepKey].push({ label: `Variant ${newIdx + 1}`, tokens: tokenSnapshot });
            dsBuilderData.activeVariants[stepKey] = newIdx;
        } else {
            const activeIdx = dsBuilderData.activeVariants[stepKey] ?? 0;
            if (dsBuilderData.stepVariants[stepKey].length === 0) {
                dsBuilderData.stepVariants[stepKey].push({ label: 'Variant 1', tokens: tokenSnapshot });
                dsBuilderData.activeVariants[stepKey] = 0;
            } else {
                dsBuilderData.stepVariants[stepKey][activeIdx] = {
                    ...dsBuilderData.stepVariants[stepKey][activeIdx],
                    tokens: tokenSnapshot,
                };
            }
        }

        // Sync flat semanticTokens from active variants
        rebuildSemanticTokens();

        // Special cases: also populate fallback arrays
        if (stepKey === 'pageBackground') {
            if (styles.background) dsBuilderData.colors.backgrounds.push({ hex: styles.background, count: 60 });
            if (styles.foreground) dsBuilderData.colors.text.push({ hex: styles.foreground, count: 60 });
        }
        if (stepKey === 'primaryButton' && styles.primaryBorderRadius) {
            dsBuilderData.radii.push({ value: styles.primaryBorderRadius });
        }
        if (stepKey === 'heading') {
            dsBuilderData.typography.push({
                family: (styles.headingFontFamily || '').split(',')[0].replace(/["']/g, '').trim() || null,
                weight: styles.h1FontWeight || null,
                size: styles.h1FontSize,
                lineHeight: styles.h1LineHeight,
                tag: 'h1', label: 'Heading',
            });
        }
        if (stepKey === 'bodyText') {
            dsBuilderData.typography.push({
                family: (styles.bodyFontFamily || '').split(',')[0].replace(/["']/g, '').trim() || null,
                weight: '400',
                size: styles.bodyFontSize,
                lineHeight: styles.bodyLineHeight,
                tag: 'p', label: 'Body',
            });
        }
        if (stepKey === 'input' && styles.border) {
            dsBuilderData.colors.borders.push({ hex: styles.border, count: 10 });
        }
    }

    isAddingVariantFor = null;
    isReselectingFor = null;
    currentDsStep = -1;
    dsBuilderPaused = false;
    saveDsBuilderState();
    renderDsBuilderSidebar();
}

function rebuildSemanticTokens() {
    if (!dsBuilderData?.stepVariants) return;
    const st = dsBuilderData.semanticTokens;
    for (const [stepKey, variants] of Object.entries(dsBuilderData.stepVariants)) {
        const idx = dsBuilderData.activeVariants?.[stepKey] ?? 0;
        const variant = variants[idx];
        if (!variant) continue;
        for (const [k, v] of Object.entries(variant.tokens)) {
            if (v) st[k] = { value: v, source: stepKey };
        }
    }
}

function buildScanDataFromDsBuilderData(dsb) {
    const st = dsb.semanticTokens;

    // Only include valid hex values
    function hexEntry(key, count) {
        const v = st[key]?.value;
        return (v && /^#[0-9a-fA-F]{6}$/.test(v)) ? [{ hex: v, count }] : [];
    }

    // Synthesize full color arrays from semantic tokens so generateDesignMarkdown has real data
    const seenHex = new Set();
    function uniq(entries) {
        return entries.filter(e => e && e.hex && !seenHex.has(e.hex) && seenHex.add(e.hex));
    }

    const backgrounds = uniq([
        ...hexEntry('background', 60),
        ...hexEntry('card',        20),
        ...hexEntry('muted',       15),
        ...hexEntry('sidebar',     10),
        ...(dsb.colors.backgrounds || []),
    ]);
    const texts = uniq([
        ...hexEntry('foreground',         60),
        ...hexEntry('mutedForeground',    20),
        ...hexEntry('primaryForeground',  10),
        ...hexEntry('cardForeground',      8),
        ...(dsb.colors.text || []),
    ]);
    seenHex.clear();
    const interactive = uniq([
        ...hexEntry('primary',     40),
        ...hexEntry('secondary',   20),
        ...hexEntry('destructive', 10),
        ...hexEntry('accent',      10),
    ]);
    seenHex.clear();
    const borders = uniq([
        ...hexEntry('border', 30),
        ...(dsb.colors.borders || []),
    ]);

    // Color fallbacks — when primary steps weren't captured, use component-level colors
    if (!backgrounds.length) {
        seenHex.clear();
        const bgFallbacks = uniq([
            ...hexEntry('badgeBackground', 5),
            ...hexEntry('mutedForeground', 3),
        ]);
        backgrounds.push(...bgFallbacks);
    }
    if (!texts.length) {
        seenHex.clear();
        const textFallbacks = uniq([
            ...hexEntry('h1Color',         20),
            ...hexEntry('bodyColor',       15),
            ...hexEntry('sidebarForeground', 10),
        ]);
        texts.push(...textFallbacks);
    }

    // Synthesize radii — collect from ALL component radius tokens
    const seenRadii = new Set();
    const radii = [];
    for (const r of (dsb.radii || [])) {
        if (r.value && !seenRadii.has(r.value)) { seenRadii.add(r.value); radii.push(r); }
    }
    const radiusKeys = [
        'primaryBorderRadius', 'secondaryBorderRadius', 'destructiveBorderRadius',
        'inputBorderRadius', 'cardBorderRadius', 'badgeBorderRadius', 'mutedBorderRadius',
    ];
    for (const key of radiusKeys) {
        const v = st[key]?.value;
        if (v && !seenRadii.has(v)) {
            seenRadii.add(v);
            const label = key.replace('BorderRadius', '').replace(/([A-Z])/g, ' $1').trim();
            radii.push({ value: v, label });
        }
    }

    // Typography — generators read `family` and `weight` keys
    const typography = dsb.typography.length ? [...dsb.typography] : [];
    if (!typography.some(t => t.tag === 'h1') && st.headingFontFamily?.value) {
        typography.unshift({
            family: st.headingFontFamily.value.split(',')[0].replace(/["']/g, '').trim(),
            weight: st.h1FontWeight?.value || '700',
            size: st.h1FontSize?.value,
            lineHeight: st.h1LineHeight?.value,
            letterSpacing: st.h1LetterSpacing?.value,
            tag: 'h1', label: 'Heading',
        });
    }
    if (!typography.some(t => t.tag === 'p') && st.bodyFontFamily?.value) {
        typography.push({
            family: st.bodyFontFamily.value.split(',')[0].replace(/["']/g, '').trim(),
            weight: '400',
            size: st.bodyFontSize?.value,
            lineHeight: st.bodyLineHeight?.value,
            letterSpacing: st.bodyLetterSpacing?.value,
            tag: 'p', label: 'Body',
        });
    }

    // Synthesize components array from semanticTokens so generateDesignMarkdown renders CSS recipes
    function compProps(fields) {
        const p = {};
        for (const [propName, val] of Object.entries(fields)) {
            if (val && val !== 'none' && val !== '0px') p[propName] = val;
        }
        return Object.keys(p).length ? p : null;
    }
    function padStr(topKey, rightKey) {
        const t = st[topKey]?.value, r = st[rightKey]?.value;
        if (t && r) return `${t} ${r}`;
        return t || r || null;
    }
    function bdrStr(widthKey, colorKey) {
        const w = st[widthKey]?.value, c = st[colorKey]?.value;
        if (w && c) return `${w} solid ${c}`;
        if (c) return `1px solid ${c}`;
        return null;
    }
    function fontFamilyClean(key) {
        const v = st[key]?.value;
        return v ? v.split(',')[0].replace(/["']/g, '').trim() : null;
    }

    const components = [...(dsb.components || [])];
    if (!components.length) {
        // Primary Button
        const btnPrimary = compProps({
            'Background':    st.primary?.value,
            'Text Color':    st.primaryForeground?.value,
            'Font Family':   fontFamilyClean('primaryFontFamily'),
            'Font Size':     st.primaryFontSize?.value,
            'Font Weight':   st.primaryFontWeight?.value,
            'Padding':       padStr('primaryPaddingTop', 'primaryPaddingRight'),
            'Border Radius': st.primaryBorderRadius?.value,
            'Border':        bdrStr('primaryBorderWidth', 'primaryBorderColor'),
            'Box Shadow':    st.primaryBoxShadow?.value,
            'Height':        st.primaryHeight?.value,
        });
        if (btnPrimary) components.push({ category: 'button', label: 'Primary Button', properties: btnPrimary });

        // Secondary Button
        const btnSecondary = compProps({
            'Background':    st.secondary?.value,
            'Text Color':    st.secondaryForeground?.value,
            'Padding':       padStr('secondaryPaddingTop', 'secondaryPaddingRight'),
            'Border Radius': st.secondaryBorderRadius?.value,
            'Border':        bdrStr('secondaryBorderWidth', 'secondaryBorderColor') || st.secondaryBorderColor?.value,
            'Box Shadow':    st.secondaryBoxShadow?.value,
            'Height':        st.secondaryHeight?.value,
        });
        if (btnSecondary) components.push({ category: 'button', label: 'Secondary Button', properties: btnSecondary });

        // Destructive Button
        const btnDestructive = compProps({
            'Background':    st.destructive?.value,
            'Text Color':    st.destructiveForeground?.value,
            'Font Size':     st.destructiveFontSize?.value,
            'Font Weight':   st.destructiveFontWeight?.value,
            'Padding':       padStr('destructivePaddingTop', 'destructivePaddingRight'),
            'Border Radius': st.destructiveBorderRadius?.value,
            'Box Shadow':    st.destructiveBoxShadow?.value,
            'Height':        st.destructiveHeight?.value,
        });
        if (btnDestructive) components.push({ category: 'button', label: 'Destructive Button', properties: btnDestructive });

        // Input
        const inputProps = compProps({
            'Background':    st.inputBg?.value,
            'Border':        st.border?.value ? `${st.inputBorderWidth?.value || '1px'} solid ${st.border.value}` : null,
            'Border Radius': st.inputBorderRadius?.value,
            'Font Size':     st.inputFontSize?.value,
            'Font Family':   fontFamilyClean('inputFontFamily'),
            'Padding':       padStr('inputPaddingTop', 'inputPaddingRight'),
            'Height':        st.inputHeight?.value,
        });
        if (inputProps) components.push({ category: 'input', label: 'Input Field', properties: inputProps });

        // Card
        const cardProps = compProps({
            'Background':    st.card?.value,
            'Text Color':    st.cardForeground?.value,
            'Border Radius': st.cardBorderRadius?.value,
            'Border':        bdrStr('cardBorderWidth', 'cardBorderColor'),
            'Box Shadow':    st.cardBoxShadow?.value,
            'Padding':       padStr('cardPaddingTop', 'cardPaddingRight'),
        });
        if (cardProps) components.push({ category: 'card', label: 'Card / Surface', properties: cardProps });

        // Muted Surface
        const mutedProps = compProps({
            'Background':    st.muted?.value,
            'Text Color':    st.mutedForeground?.value,
            'Border Radius': st.mutedBorderRadius?.value,
            'Padding':       padStr('mutedPaddingTop', 'mutedPaddingRight'),
        });
        if (mutedProps) components.push({ category: 'surface', label: 'Muted Surface', properties: mutedProps });

        // Navigation
        const navProps = compProps({
            'Background':    st.sidebar?.value,
            'Text Color':    st.sidebarForeground?.value,
            'Border':        bdrStr('navigationBorderWidth', 'navigationBorderColor'),
            'Padding':       padStr('navigationPaddingTop', 'navigationPaddingRight'),
            'Height':        st.navigationHeight?.value,
        });
        if (navProps) components.push({ category: 'navigation', label: 'Navigation Bar', properties: navProps });

        // Badge / Tag
        const badgeProps = compProps({
            'Background':    st.badgeBackground?.value,
            'Text Color':    st.badgeForeground?.value,
            'Border Radius': st.badgeBorderRadius?.value,
            'Border':        st.badgeBorderColor?.value,
            'Font Size':     st.badgeFontSize?.value,
            'Font Weight':   st.badgeFontWeight?.value,
            'Padding':       padStr('badgePaddingTop', 'badgePaddingRight'),
        });
        if (badgeProps) components.push({ category: 'badge', label: 'Badge / Tag', properties: badgeProps });

        // Link / Accent
        const linkProps = compProps({
            'Text Color':       st.accent?.value,
            'Font Weight':      st.accentFontWeight?.value,
            'Text Decoration':  st.accentTextDecoration?.value,
        });
        if (linkProps) components.push({ category: 'link', label: 'Link / Accent', properties: linkProps });
    }

    // Build componentVariants: steps with 2+ variants captured
    const componentVariants = {};
    for (const [stepKey, variants] of Object.entries(dsb.stepVariants || {})) {
        if (variants.length > 1) {
            const stepDef = DS_STEP_DISPLAY.find(s => s.stepKey === stepKey);
            componentVariants[stepKey] = {
                label: stepDef?.label || stepKey,
                variants,
                activeIndex: dsb.activeVariants?.[stepKey] ?? 0,
            };
        }
    }

    return {
        pageUrl:        dsb.pageUrl,
        pageTitle:      dsb.pageTitle,
        colors:         { backgrounds, text: texts, interactive, borders },
        semanticTokens: dsb.semanticTokens,
        typography,
        radii,
        cssVariables:   dsb.cssVariables,
        spacing:        dsb.spacing,
        shadows:        dsb.shadows,
        layout:         dsb.layout,
        components,
        componentVariants,
    };
}

async function saveDsBuilderState() {
    try {
        // Only persist if at least one step has been completed or is in progress
        const hasProgress = dsBuilderData && (Object.keys(dsBuilderData.stepStatuses).length > 0 || currentDsStep >= 0);
        if (hasProgress) {
            await chrome.storage.local.set({ dsBuilderState: { data: dsBuilderData, step: currentDsStep } });
        } else {
            await chrome.storage.local.remove('dsBuilderState');
        }
    } catch (_) {}
}

async function restoreDsBuilderState() {
    try {
        const result = await chrome.storage.local.get('dsBuilderState');
        if (!result.dsBuilderState) return false;
        const saved = result.dsBuilderState;
        dsBuilderData = saved.data;
        if (!dsBuilderData.stepStatuses || Object.keys(dsBuilderData.stepStatuses).length === 0) {
            await chrome.storage.local.remove('dsBuilderState');
            return false;
        }
        if (!dsBuilderData.stepVariants) dsBuilderData.stepVariants = {};
        if (!dsBuilderData.activeVariants) dsBuilderData.activeVariants = {};
        currentDsStep = -1;
        dsBuilderPaused = false;
        showBottomBar(false);
        renderTopbar('detail', 'Build DS');
        renderDsBuilderSidebar();
        return true;
    } catch (_) { return false; }
}

function finalizeDsBuilder() {
    if (!dsBuilderData) return;
    const syntheticScanData = buildScanDataFromDsBuilderData(dsBuilderData);
    const designMd = generateDesignMarkdown(syntheticScanData);
    const shadcnMd = generateShadcnThemeMd(syntheticScanData);
    dsBuilderData = null;
    currentDsStep = -1;
    dsBuilderPaused = false;
    saveDsBuilderState(); // clears storage
    renderTopbar('detail', 'design files');
    renderDesignMdView(designMd, shadcnMd, syntheticScanData.pageUrl);
}

function renderDsBuilderSidebar() {
    const ca = document.getElementById('contentArea');
    if (!ca || !dsBuilderData) return;

    const st = dsBuilderData.semanticTokens;
    const statuses = dsBuilderData.stepStatuses;
    const completedCount = Object.values(statuses).filter(s => s === 'completed').length;
    const doneCount = Object.keys(statuses).length;

    const cards = DS_STEP_DISPLAY.map((step, i) => {
        const status = statuses[step.stepKey];
        const isDone = status === 'completed';
        const isSkipped = status === 'skipped';
        const isSelectingStep = (i === currentDsStep) && !isDone;
        const val = st[step.valueKey]?.value;

        const stepVariants = dsBuilderData.stepVariants?.[step.stepKey] || [];
        const activeIdx = dsBuilderData.activeVariants?.[step.stepKey] ?? 0;
        const isAddingThis = isDone && isAddingVariantFor === step.stepKey && i === currentDsStep;
        const isReselectingThis = isDone && isReselectingFor === step.stepKey && i === currentDsStep;

        let swatchHtml = '';
        if (isDone && val && /^#[0-9a-fA-F]{6}$/i.test(val)) {
            swatchHtml = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${val};border:1px solid rgba(0,0,0,.12);vertical-align:middle;margin-right:3px;flex-shrink:0"></span>`;
        }

        let pillsHtml = '';
        if (isDone && stepVariants.length > 1) {
            pillsHtml = `<div style="display:flex;gap:3px;margin-top:5px;flex-wrap:wrap">` +
                stepVariants.map((_, vi) =>
                    `<button class="ds-variant-pill" data-step-key="${step.stepKey}" data-variant-idx="${vi}"
                        style="font-size:9px;padding:2px 6px;border-radius:4px;cursor:pointer;font-weight:600;line-height:1.4;
                               border:1px solid ${vi === activeIdx ? '#10b981' : '#d1d5db'};
                               background:${vi === activeIdx ? '#10b981' : '#fff'};
                               color:${vi === activeIdx ? '#fff' : '#6b7280'}">V${vi + 1}</button>`
                ).join('') +
            `</div>`;
        }

        let cardBg, cardBorder, btnHtml, badgeHtml;

        if (isDone) {
            cardBg = '#f0fdf4'; cardBorder = '#bbf7d0';
            badgeHtml = `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>`;
            if (isAddingThis) {
                btnHtml = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                    <span style="font-size:10px;color:#10b981;font-weight:600;white-space:nowrap">adding V${stepVariants.length + 1}…</span>
                    <button class="ds-step-cancel-btn" data-step="${i}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #d1d5db;background:#fff;color:#6b7280;cursor:pointer;font-weight:500;white-space:nowrap">✕ Cancel</button>
                </div>`;
            } else if (isReselectingThis) {
                btnHtml = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                    <span style="font-size:10px;color:#d97706;font-weight:600;white-space:nowrap">selecting…</span>
                    <button class="ds-step-cancel-btn" data-step="${i}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #d1d5db;background:#fff;color:#6b7280;cursor:pointer;font-weight:500;white-space:nowrap">✕ Cancel</button>
                </div>`;
            } else {
                btnHtml = `<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">
                    <button data-step="${i}" class="ds-card-btn ds-card-reselect" style="font-size:10px;padding:4px 8px;border-radius:5px;border:1px solid #10b981;background:#fff;color:#10b981;cursor:pointer;font-weight:500;white-space:nowrap">Re-select</button>
                    <button data-step="${i}" class="ds-add-variant-btn" data-step-key="${step.stepKey}" style="font-size:10px;padding:4px 8px;border-radius:5px;border:1px solid #10b981;background:#f0fdf4;color:#10b981;cursor:pointer;font-weight:500;white-space:nowrap">+ Variant</button>
                </div>`;
            }
        } else if (isSelectingStep) {
            cardBg = '#fffbeb'; cardBorder = '#fde68a';
            badgeHtml = `<div style="width:18px;height:18px;border-radius:50%;background:#f59e0b;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#fff"/></svg>
            </div>`;
            btnHtml = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span style="font-size:10px;color:#d97706;font-weight:600">selecting…</span>
                <button class="ds-step-cancel-btn" data-step="${i}" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid #d1d5db;background:#fff;color:#6b7280;cursor:pointer;font-weight:500;white-space:nowrap">✕ Cancel</button>
            </div>`;
        } else if (isSkipped) {
            cardBg = '#fafafa'; cardBorder = '#e5e7eb';
            badgeHtml = `<div style="width:18px;height:18px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:#9ca3af">—</div>`;
            btnHtml = `<button data-step="${i}" class="ds-card-btn" style="font-size:10px;padding:4px 8px;border-radius:5px;border:1px solid #d1d5db;background:#fff;color:#6b7280;cursor:pointer;font-weight:500;white-space:nowrap">Select</button>`;
        } else {
            cardBg = '#fff'; cardBorder = '#e5e7eb';
            badgeHtml = `<div style="width:18px;height:18px;border-radius:50%;border:1.5px solid #d1d5db;flex-shrink:0"></div>`;
            btnHtml = `<button data-step="${i}" class="ds-card-btn" style="font-size:10px;padding:4px 8px;border-radius:5px;border:none;background:#111827;color:#fff;cursor:pointer;font-weight:500;white-space:nowrap">Select</button>`;
        }

        return `<div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:9px;padding:10px 12px;display:flex;align-items:${isDone && stepVariants.length > 1 ? 'flex-start' : 'center'};gap:10px">
            ${badgeHtml}
            <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${step.label}</div>
                <div style="font-size:10px;color:${isDone ? '#10b981' : '#9ca3af'};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isDone && val ? (swatchHtml + (/^#[0-9a-fA-F]{6}$/i.test(val) ? val : /^rgba/.test(val) ? val : val.split(',')[0].replace(/["']/g,'').trim().slice(0,18))) : isDone ? 'captured' : step.fills}</div>
                ${pillsHtml}
            </div>
            <div style="flex-shrink:0">${btnHtml}</div>
        </div>`;
    }).join('');

    ca.innerHTML = `
        <div style="padding:14px;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <div style="font-size:13px;font-weight:700;color:#111827">${completedCount} / ${DS_BUILDER_TOTAL_STEPS} components ready</div>
                    <div style="font-size:10px;color:#6b7280;margin-top:1px">Click <strong>Select</strong> on a card, then pick the element on the page</div>
                </div>
                <div style="width:36px;height:36px;position:relative;flex-shrink:0">
                    <svg width="36" height="36" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" stroke-width="3"/>
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#10b981" stroke-width="3"
                            stroke-dasharray="${Math.round((completedCount / DS_BUILDER_TOTAL_STEPS) * 94.2)} 94.2"
                            stroke-dashoffset="23.6" stroke-linecap="round"/>
                    </svg>
                    <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#111827">${Math.round((completedCount / DS_BUILDER_TOTAL_STEPS) * 100)}%</span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
                ${cards}
            </div>
            <div style="display:flex;gap:8px">
                ${doneCount > 0 ? `<button id="sidebarDsGenerate" style="flex:1;background:#111827;color:#fff;border:none;border-radius:7px;padding:9px 0;font-size:12px;font-weight:600;cursor:pointer">Generate DS</button>` : ''}
                <button id="sidebarDsStop" style="flex:${doneCount > 0 ? '0 0 auto' : '1'};background:#f3f4f6;color:#374151;border:none;border-radius:7px;padding:9px 14px;font-size:12px;font-weight:500;cursor:pointer">Cancel</button>
            </div>
        </div>`;

    ca.querySelectorAll('.ds-card-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stepIndex = parseInt(btn.dataset.step, 10);
            if (currentDsStep === stepIndex && !statuses[DS_STEP_DISPLAY[stepIndex].stepKey]) return;
            isAddingVariantFor = null;
            isReselectingFor = statuses[DS_STEP_DISPLAY[stepIndex].stepKey] ? DS_STEP_DISPLAY[stepIndex].stepKey : null;
            currentDsStep = stepIndex;
            dsBuilderPaused = false;
            saveDsBuilderState();
            renderDsBuilderSidebar();
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            _dsActiveTabId = tab.id;
            try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (_) {}
            chrome.tabs.sendMessage(tab.id, { action: 'START_DS_BUILDER', stepIndex, stepKey: DS_STEP_DISPLAY[stepIndex].stepKey, fresh: true }, () => chrome.runtime.lastError);
        });
    });

    ca.querySelectorAll('.ds-step-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                if (tab) chrome.tabs.sendMessage(tab.id, { action: 'CANCEL_DS_BUILDER' }, () => chrome.runtime.lastError);
            });
            currentDsStep = -1;
            isAddingVariantFor = null;
            isReselectingFor = null;
            dsBuilderPaused = false;
            saveDsBuilderState();
            renderDsBuilderSidebar();
        });
    });

    ca.querySelectorAll('.ds-variant-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const stepKey = pill.dataset.stepKey;
            const vi = parseInt(pill.dataset.variantIdx, 10);
            if (!dsBuilderData) return;
            if (!dsBuilderData.activeVariants) dsBuilderData.activeVariants = {};
            dsBuilderData.activeVariants[stepKey] = vi;
            rebuildSemanticTokens();
            saveDsBuilderState();
            renderDsBuilderSidebar();
        });
    });

    ca.querySelectorAll('.ds-add-variant-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const stepIndex = parseInt(btn.dataset.step, 10);
            const stepKey = btn.dataset.stepKey;
            if (currentDsStep === stepIndex && isAddingVariantFor === stepKey) return;
            isAddingVariantFor = stepKey;
            isReselectingFor = null;
            currentDsStep = stepIndex;
            dsBuilderPaused = false;
            saveDsBuilderState();
            renderDsBuilderSidebar();
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;
            _dsActiveTabId = tab.id;
            try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (_) {}
            chrome.tabs.sendMessage(tab.id, { action: 'START_DS_BUILDER', stepIndex, stepKey, fresh: true }, () => chrome.runtime.lastError);
        });
    });

    document.getElementById('sidebarDsGenerate')?.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) chrome.tabs.sendMessage(tab.id, { action: 'CANCEL_DS_BUILDER' }, () => chrome.runtime.lastError);
        });
        finalizeDsBuilder();
    });
    document.getElementById('sidebarDsStop')?.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab) chrome.tabs.sendMessage(tab.id, { action: 'CANCEL_DS_BUILDER' }, () => chrome.runtime.lastError);
        });
        dsBuilderData = null;
        currentDsStep = -1;
        isAddingVariantFor = null;
        isReselectingFor = null;
        dsBuilderPaused = false;
        saveDsBuilderState();
        showBottomBar(true);
        if (scanData) renderOverview(scanData, scanData.pageUrl);
        else renderTopbar('overview');
    });
}

function renderDesignMdView(designMd, shadcnMd, pageUrl) {
    const ca = document.getElementById('contentArea');
    let activeTab = 'design'; // 'design' | 'shadcn'

    function getSlug() {
        try { return new URL(pageUrl).hostname.replace(/^www\./, '').split('.')[0]; } catch (_) { return 'site'; }
    }

    function render() {
        const isShadcn  = activeTab === 'shadcn';
        const content   = isShadcn ? shadcnMd : designMd;
        const filename  = getSlug() + (isShadcn ? '-shadcntheme.md' : '-design.md');

        ca.innerHTML = `
            <div class="design-md-wrap">
                <div class="design-md-tabs">
                    <button class="design-md-tab${activeTab === 'design'  ? ' active' : ''}" id="tabDesign">
                        📄 design.md
                    </button>
                    <button class="design-md-tab${activeTab === 'shadcn' ? ' active' : ''}" id="tabShadcn">
                        🎨 shadcntheme.md
                    </button>
                </div>
                <div class="design-md-actions">
                    <button class="design-md-btn" id="copyMdBtn">
                        <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy
                    </button>
                    <button class="design-md-btn" id="downloadMdBtn">
                        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download
                    </button>
                </div>
                <textarea class="design-md-textarea" id="mdTextarea" spellcheck="false">${escHtml(content)}</textarea>
            </div>`;

        document.getElementById('tabDesign').addEventListener('click', () => { activeTab = 'design';  render(); });
        document.getElementById('tabShadcn').addEventListener('click', () => { activeTab = 'shadcn'; render(); });

        document.getElementById('copyMdBtn').addEventListener('click', () => {
            const text = document.getElementById('mdTextarea').value;
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById('copyMdBtn');
                btn.classList.add('copied');
                btn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!`;
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                }, 2000);
            });
        });

        document.getElementById('downloadMdBtn').addEventListener('click', () => {
            const text  = document.getElementById('mdTextarea').value;
            const blob  = new Blob([text], { type: 'text/markdown' });
            const url   = URL.createObjectURL(blob);
            const a     = document.createElement('a');
            a.href = url; a.download = filename; a.click();
            URL.revokeObjectURL(url);
        });
    }

    render();
}

// ============================================
// OKLCH COLOR ENGINE
// ============================================

function hexToOklch(hex) {
    if (!hex || hex.length < 7) return { l: 0.5, c: 0, h: 0 };
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    // sRGB → linear
    const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const rl = lin(r), gl = lin(g), bl = lin(b);

    // linear sRGB → LMS
    const ll = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
    const ml = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
    const sl = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

    // LMS → LMS′ (cube root)
    const l_ = Math.cbrt(ll), m_ = Math.cbrt(ml), s_ = Math.cbrt(sl);

    // LMS′ → OKLab
    const L  =  0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
    const a  =  1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const bv =  0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

    // OKLab → OKLCH
    const C = Math.sqrt(a * a + bv * bv);
    let   H = Math.atan2(bv, a) * (180 / Math.PI);
    if (H < 0) H += 360;

    return { l: +L.toFixed(4), c: +C.toFixed(4), h: +H.toFixed(1) };
}

function oklchToHex(l, c, h) {
    const hRad = h * Math.PI / 180;
    const a = c * Math.cos(hRad);
    const b = c * Math.sin(hRad);

    // OKLab → LMS′
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

    // LMS′ → LMS (cube)
    const ll = l_ * l_ * l_, ml = m_ * m_ * m_, sl = s_ * s_ * s_;

    // LMS → linear sRGB
    let r =  4.0767416621 * ll - 3.3077115913 * ml + 0.2309699292 * sl;
    let g = -1.2684380046 * ll + 2.6097574011 * ml - 0.3413193965 * sl;
    let bv = -0.0041960863 * ll - 0.7034186147 * ml + 1.7076147010 * sl;

    // Clamp
    r = Math.max(0, Math.min(1, r));
    g = Math.max(0, Math.min(1, g));
    bv = Math.max(0, Math.min(1, bv));

    // linear → sRGB gamma
    const gam = v => v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return '#' + [r, g, bv].map(v => Math.round(gam(v) * 255).toString(16).padStart(2, '0')).join('');
}

// Format OKLCH as CSS string
function oklchCss(l, c, h) {
    const lc = Math.max(0, Math.min(1, +l || 0));
    const cc = Math.max(0, +c || 0);
    const hc = (((+h || 0) % 360) + 360) % 360;
    return `oklch(${lc.toFixed(4)} ${cc.toFixed(4)} ${hc.toFixed(1)})`;
}

// Shorthand: token object → css string
function tv(token) { return oklchCss(token.l, token.c, token.h); }

// Pick highest-chroma color as brand — most saturated interactive color wins
function getBrandColor(data) {
    const pool = (data.colors?.interactive || []).length
        ? data.colors.interactive
        : [...(data.colors?.backgrounds || []), ...(data.colors?.text || []), ...(data.colors?.interactive || [])];

    let bestHex = '#6366f1'; // indigo fallback
    let bestC   = -1;
    for (const { hex } of pool) {
        try { const { c } = hexToOklch(hex); if (c > bestC) { bestC = c; bestHex = hex; } } catch (_) {}
    }
    return bestHex;
}

// ============================================
// COMPONENT SPECS GENERATOR (shared by both MDs)
// ============================================

function generateComponentSpecsMd(st) {
    if (!st || !Object.keys(st).length) return '';

    // ── Tailwind helpers ───────────────────────────────────────────────────
    function twH(px) {
        const v = parseFloat(px); if (isNaN(v)) return null;
        const map = { 32:'h-8', 36:'h-9', 40:'h-10', 44:'h-11', 48:'h-12', 56:'h-14', 64:'h-16', 80:'h-20' };
        return map[Math.round(v)] || `h-[${Math.round(v)}px]`;
    }
    function twText(px) {
        const v = parseFloat(px); if (isNaN(v)) return null;
        if (v <= 11) return 'text-[11px]';
        if (v <= 12) return 'text-xs';
        if (v <= 13) return 'text-[13px]';
        if (v <= 14) return 'text-sm';
        if (v <= 15) return 'text-[15px]';
        if (v <= 16) return 'text-base';
        if (v <= 18) return 'text-lg';
        if (v <= 20) return 'text-xl';
        if (v <= 24) return 'text-2xl';
        if (v <= 30) return 'text-3xl';
        if (v <= 36) return 'text-4xl';
        return `text-[${Math.round(v)}px]`;
    }
    function twWeight(w) {
        const v = Math.round(parseFloat(w) / 100) * 100; if (isNaN(v)) return null;
        const map = { 100:'font-thin',200:'font-extralight',300:'font-light',400:'font-normal',500:'font-medium',600:'font-semibold',700:'font-bold',800:'font-extrabold',900:'font-black' };
        return map[v] || null;
    }
    function twRadius(r) {
        const v = parseFloat(r); if (isNaN(v)) return null;
        if (r.includes('%') || v >= 50) return 'rounded-full';
        if (v <= 2) return 'rounded-sm';
        if (v <= 4) return 'rounded';
        if (v <= 6) return 'rounded-md';
        if (v <= 8) return 'rounded-lg';
        if (v <= 12) return 'rounded-xl';
        if (v <= 16) return 'rounded-2xl';
        if (v <= 24) return 'rounded-3xl';
        return `rounded-[${Math.round(v)}px]`;
    }
    function twPad(px) {
        const v = parseFloat(px); if (isNaN(v)) return null;
        const unit = v / 4; // 1 Tailwind unit = 4px
        const neat = [0,1,1.5,2,2.5,3,3.5,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32];
        const closest = neat.reduce((a,b) => Math.abs(b-unit)<Math.abs(a-unit)?b:a, neat[0]);
        return `p-${closest}`;
    }
    function swatch(hex) {
        return hex ? `\`${hex}\`` : '—';
    }

    // ── Row builder ───────────────────────────────────────────────────────
    function row(label, value, tw) {
        if (!value || value === '0px' || value === 'none') return '';
        const twStr = tw ? ` \`${tw}\`` : '';
        return `| ${label} | \`${escMd(String(value))}\` |${twStr} |\n`;
    }

    // ── Component section builder ──────────────────────────────────────────
    function comp(title, rows) {
        const body = rows.filter(Boolean).join('');
        if (!body) return '';
        return `### ${title}\n\n| Property | Value | Tailwind |\n|----------|-------|----------|\n${body}\n`;
    }

    let md = '';

    // ── 1. Primary Button ─────────────────────────────────────────────────
    if (st.primary) {
        md += comp('Button — Primary', [
            row('Background',      st.primary?.value,              st.primary?.value ? `bg-[${st.primary.value}]` : null),
            row('Text Color',      st.primaryForeground?.value,    st.primaryForeground?.value ? `text-[${st.primaryForeground.value}]` : null),
            row('Border Radius',   st.primaryBorderRadius?.value,  twRadius(st.primaryBorderRadius?.value)),
            row('Height',          st.primaryHeight?.value,        twH(st.primaryHeight?.value)),
            row('Padding V',       st.primaryPaddingTop?.value,    null),
            row('Padding H',       st.primaryPaddingRight?.value,  null),
            row('Font Size',       st.primaryFontSize?.value,      twText(st.primaryFontSize?.value)),
            row('Font Weight',     st.primaryFontWeight?.value,    twWeight(st.primaryFontWeight?.value)),
            row('Font Family',     (st.primaryFontFamily?.value||'').split(',')[0].replace(/["']/g,'').trim() || null, null),
            row('Letter Spacing',  st.primaryLetterSpacing?.value, null),
            row('Text Transform',  st.primaryTextTransform?.value, null),
            row('Border',         st.primaryBorderWidth?.value ? `${st.primaryBorderWidth.value} ${st.primaryBorderColor?.value||''}`.trim() : null, null),
            row('Box Shadow',      st.primaryBoxShadow?.value,     null),
        ]);
    }

    // ── 2. Secondary Button ───────────────────────────────────────────────
    if (st.secondary || st.secondaryBorderColor) {
        md += comp('Button — Secondary', [
            row('Background',    st.secondary?.value,             st.secondary?.value ? `bg-[${st.secondary.value}]` : null),
            row('Text Color',    st.secondaryForeground?.value,   null),
            row('Border',        st.secondaryBorderWidth?.value ? `${st.secondaryBorderWidth.value} ${st.secondaryBorderColor?.value||''}`.trim() : (st.secondaryBorderColor?.value || null), null),
            row('Border Radius', st.secondaryBorderRadius?.value, twRadius(st.secondaryBorderRadius?.value)),
            row('Height',        st.secondaryHeight?.value,       twH(st.secondaryHeight?.value)),
            row('Padding V',     st.secondaryPaddingTop?.value,   null),
            row('Padding H',     st.secondaryPaddingRight?.value, null),
            row('Box Shadow',    st.secondaryBoxShadow?.value,    null),
        ]);
    }

    // ── 3. Input / Form Field ─────────────────────────────────────────────
    if (st.border || st.inputBg) {
        md += comp('Input / Form Field', [
            row('Background',    st.inputBg?.value,          st.inputBg?.value ? `bg-[${st.inputBg.value}]` : null),
            row('Border Color',  st.border?.value,           st.border?.value ? `border-[${st.border.value}]` : null),
            row('Border Width',  st.inputBorderWidth?.value, null),
            row('Border Radius', st.inputBorderRadius?.value,twRadius(st.inputBorderRadius?.value)),
            row('Height',        st.inputHeight?.value,      twH(st.inputHeight?.value)),
            row('Padding V',     st.inputPaddingTop?.value,  null),
            row('Padding H',     st.inputPaddingRight?.value,null),
            row('Font Size',     st.inputFontSize?.value,    twText(st.inputFontSize?.value)),
            row('Font Family',   (st.inputFontFamily?.value||'').split(',')[0].replace(/["']/g,'').trim() || null, null),
        ]);
    }

    // ── 4. Card / Surface ─────────────────────────────────────────────────
    if (st.card) {
        md += comp('Card / Surface', [
            row('Background',    st.card?.value,             st.card?.value ? `bg-[${st.card.value}]` : null),
            row('Text Color',    st.cardForeground?.value,   null),
            row('Border Radius', st.cardBorderRadius?.value, twRadius(st.cardBorderRadius?.value)),
            row('Border',        st.cardBorderWidth?.value ? `${st.cardBorderWidth.value} ${st.cardBorderColor?.value||''}`.trim() : (st.cardBorderColor?.value||null), null),
            row('Padding V',     st.cardPaddingTop?.value,   null),
            row('Padding H',     st.cardPaddingRight?.value, null),
            row('Gap',           st.cardGap?.value,          null),
            row('Box Shadow',    st.cardBoxShadow?.value,    null),
        ]);
    }

    // ── 5. Muted / Secondary Surface ─────────────────────────────────────
    if (st.muted) {
        md += comp('Muted / Secondary Surface', [
            row('Background',    st.muted?.value,             st.muted?.value ? `bg-[${st.muted.value}]` : null),
            row('Text Color',    st.mutedForeground?.value,   null),
            row('Border Radius', st.mutedBorderRadius?.value, twRadius(st.mutedBorderRadius?.value)),
            row('Padding V',     st.mutedPaddingTop?.value,   null),
            row('Padding H',     st.mutedPaddingRight?.value, null),
        ]);
    }

    // ── 6. Navigation ─────────────────────────────────────────────────────
    if (st.sidebar) {
        md += comp('Navigation / Sidebar', [
            row('Background',    st.sidebar?.value,                 st.sidebar?.value ? `bg-[${st.sidebar.value}]` : null),
            row('Text Color',    st.sidebarForeground?.value,       null),
            row('Height',        st.navigationHeight?.value,        twH(st.navigationHeight?.value)),
            row('Padding V',     st.navigationPaddingTop?.value,    null),
            row('Padding H',     st.navigationPaddingRight?.value,  null),
            row('Border',        st.navigationBorderWidth?.value ? `${st.navigationBorderWidth.value} ${st.navigationBorderColor?.value||''}`.trim() : (st.navigationBorderColor?.value||null), null),
        ]);
    }

    // ── 7. Badge / Tag ────────────────────────────────────────────────────
    if (st.badgeFontSize || st.badgeBackground) {
        md += comp('Badge / Tag', [
            row('Background',    st.badgeBackground?.value,   st.badgeBackground?.value ? `bg-[${st.badgeBackground.value}]` : null),
            row('Text Color',    st.badgeForeground?.value,   null),
            row('Border Radius', st.badgeBorderRadius?.value, twRadius(st.badgeBorderRadius?.value)),
            row('Border',        st.badgeBorderColor?.value,  null),
            row('Font Size',     st.badgeFontSize?.value,     twText(st.badgeFontSize?.value)),
            row('Font Weight',   st.badgeFontWeight?.value,   twWeight(st.badgeFontWeight?.value)),
            row('Padding V',     st.badgePaddingTop?.value,   null),
            row('Padding H',     st.badgePaddingRight?.value, null),
        ]);
    }

    // ── 8. Destructive / Danger ───────────────────────────────────────────
    if (st.destructive) {
        md += comp('Button — Destructive', [
            row('Background',    st.destructive?.value,               st.destructive?.value ? `bg-[${st.destructive.value}]` : null),
            row('Text Color',    st.destructiveForeground?.value,     null),
            row('Border Radius', st.destructiveBorderRadius?.value,   twRadius(st.destructiveBorderRadius?.value)),
            row('Height',        st.destructiveHeight?.value,         twH(st.destructiveHeight?.value)),
            row('Padding V',     st.destructivePaddingTop?.value,     null),
            row('Padding H',     st.destructivePaddingRight?.value,   null),
            row('Font Size',     st.destructiveFontSize?.value,       twText(st.destructiveFontSize?.value)),
            row('Font Weight',   st.destructiveFontWeight?.value,     twWeight(st.destructiveFontWeight?.value)),
            row('Box Shadow',    st.destructiveBoxShadow?.value,      null),
        ]);
    }

    // ── 9. Accent / Link ─────────────────────────────────────────────────
    if (st.accent) {
        md += comp('Link / Accent', [
            row('Color',           st.accent?.value,               st.accent?.value ? `text-[${st.accent.value}]` : null),
            row('Font Weight',     st.accentFontWeight?.value,     twWeight(st.accentFontWeight?.value)),
            row('Text Decoration', st.accentTextDecoration?.value, null),
        ]);
    }

    // ── 10. Heading Typography ────────────────────────────────────────────
    if (st.headingFontFamily || st.h1FontSize) {
        md += comp('Typography — Heading (H1)', [
            row('Font Family',    (st.headingFontFamily?.value||'').split(',')[0].replace(/["']/g,'').trim() || null, null),
            row('Font Size',      st.h1FontSize?.value,       twText(st.h1FontSize?.value)),
            row('Font Weight',    st.h1FontWeight?.value,     twWeight(st.h1FontWeight?.value)),
            row('Line Height',    st.h1LineHeight?.value,     null),
            row('Letter Spacing', st.h1LetterSpacing?.value,  null),
            row('Text Transform', st.h1TextTransform?.value,  null),
            row('Color',          st.h1Color?.value,          null),
        ]);
    }

    // ── 11. Body Typography ───────────────────────────────────────────────
    if (st.bodyFontFamily || st.bodyFontSize) {
        md += comp('Typography — Body', [
            row('Font Family',    (st.bodyFontFamily?.value||'').split(',')[0].replace(/["']/g,'').trim() || null, null),
            row('Font Size',      st.bodyFontSize?.value,      twText(st.bodyFontSize?.value)),
            row('Line Height',    st.bodyLineHeight?.value,    null),
            row('Letter Spacing', st.bodyLetterSpacing?.value, null),
            row('Color',          st.bodyColor?.value,         null),
        ]);
    }

    // ── 12. Page Background ───────────────────────────────────────────────
    if (st.background) {
        md += comp('Page Background', [
            row('Background',  st.background?.value,  st.background?.value ? `bg-[${st.background.value}]` : null),
            row('Text Color',  st.foreground?.value,  st.foreground?.value ? `text-[${st.foreground.value}]` : null),
        ]);
    }

    return md;
}

// ============================================
// SHADCN TOKEN MAPPER
// ============================================

function generateShadcnTokens(data) {
    const radii = data.radii            || [];
    const st    = data.semanticTokens   || {};

    // ── Helpers ────────────────────────────────────────────────────────────
    const siteVars = { ...(data.cssVariables?.colors || {}), ...(data.cssVariables?.sizes || {}) };

    function cssVarHex(...keys) {
        for (const k of keys) {
            const v = (siteVars[k] || '').trim();
            if (/^#[0-9a-f]{6}$/i.test(v)) return v;
            const m = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
            if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
        }
        return null;
    }
    // Resolve a color slot: semantic token → CSS var → frequency fallback → null
    function resolve(stKey, cssVarKeys, freqHex) {
        const stVal = st[stKey]?.value;
        if (stVal && /^#[0-9a-f]{6}$/i.test(stVal)) return stVal;
        const cv = cssVarHex(...(cssVarKeys || []));
        if (cv) return cv;
        return freqHex || null;
    }
    function toOklchOrFallback(hex, fallback) {
        if (!hex) return fallback;
        try { return hexToOklch(hex); } catch (_) { return fallback; }
    }
    function pxToRem(pxStr) {
        const px = parseFloat(pxStr);
        return isNaN(px) ? null : Math.round((px / 16) * 100) / 100;
    }

    // ── Frequency fallbacks ────────────────────────────────────────────────
    const rawBgs   = data.colors?.backgrounds || [];
    const rawTexts = data.colors?.text        || [];
    const rawBdrs  = data.colors?.borders     || [];
    const rawInter = data.colors?.interactive || [];

    // ── Resolve every CSS variable slot ───────────────────────────────────
    const bgHex       = resolve('background',  ['--background','--color-bg-canvas','--color-bg-primary','--surface'], rawBgs[0]?.hex);
    const fgHex       = resolve('foreground',  ['--foreground','--color-text-primary','--text-primary','--color-fg-default'], rawTexts[0]?.hex);
    const cardHex     = resolve('card',        ['--card','--color-bg-overlay','--surface-raised'], rawBgs[1]?.hex || bgHex);
    const cardFgHex   = resolve('cardForeground', ['--card-foreground'], fgHex);
    const popHex      = resolve('popover',     ['--popover','--color-bg-popover'], cardHex || bgHex);
    const popFgHex    = resolve('popoverForeground', ['--popover-foreground'], fgHex);
    const mutedHex    = resolve('muted',       ['--muted','--color-bg-muted','--bg-muted'], rawBgs[2]?.hex);
    const mutedFgHex  = resolve('mutedForeground', ['--muted-foreground','--color-text-secondary','--text-secondary'], rawTexts[1]?.hex);
    const primaryHex  = resolve('primary',     ['--primary','--color-primary','--brand'], getBrandColor(data));
    const priFgHex    = resolve('primaryForeground', ['--primary-foreground'], st.primaryForeground?.value || null);
    const secHex      = resolve('secondary',   ['--secondary'], st.secondary?.value || null);
    const secFgHex    = resolve('secondaryForeground', ['--secondary-foreground'], st.secondaryForeground?.value || null);
    const destHex     = resolve('destructive', ['--destructive','--color-danger','--color-error'], st.destructive?.value || null);
    const bdrHex      = resolve('border',      ['--border','--color-border','--border-color'], rawBdrs[0]?.hex);
    const inputHex    = resolve('inputBg',     ['--input'], bdrHex);
    const ringHex     = resolve('ring',        ['--ring','--color-focus-ring'], st.ring?.value || primaryHex);
    const sidebarHex  = resolve('sidebar',     ['--sidebar','--color-bg-sidebar'], st.sidebar?.value || rawBgs[1]?.hex || bgHex);
    const sidebarFgHex= resolve('sidebarForeground', ['--sidebar-foreground'], fgHex);
    const sidPriHex   = resolve('sidebarPrimary', ['--sidebar-primary'], primaryHex);
    const sidPriFgHex = resolve('sidebarPrimaryForeground', ['--sidebar-primary-foreground'], priFgHex);
    const accentHex   = resolve('accent',      ['--accent'], mutedHex);
    const accentFgHex = resolve('accentForeground', ['--accent-foreground'], fgHex);

    // ── Convert to OKLCH ───────────────────────────────────────────────────
    const brand  = toOklchOrFallback(primaryHex, { l: 0.55, c: 0.18, h: 250 });
    const nC     = Math.min(brand.c * 0.08, 0.018);
    const nH     = brand.h;
    const fallBg = { l: 0.990, c: nC, h: nH };
    const fallFg = { l: 0.140, c: nC * 2, h: nH };

    const bgP    = toOklchOrFallback(bgHex,      fallBg);
    const bgS    = toOklchOrFallback(cardHex,    { l: Math.max(bgP.l - 0.02, 0), c: nC, h: nH });
    const fgP    = toOklchOrFallback(fgHex,      fallFg);
    const fgS    = toOklchOrFallback(mutedFgHex, { l: 0.46, c: nC * 2, h: nH });
    const bdr    = toOklchOrFallback(bdrHex,     { l: 0.88, c: nC, h: nH });
    const pop    = toOklchOrFallback(popHex,     bgS);
    const popFg  = toOklchOrFallback(popFgHex,   fgP);
    const mut    = toOklchOrFallback(mutedHex,   { l: Math.max(bgP.l - 0.03, 0), c: nC, h: nH });
    const mutFg  = toOklchOrFallback(mutedFgHex, fgS);
    const inp    = toOklchOrFallback(inputHex,   bdr);
    const ring   = toOklchOrFallback(ringHex,    brand);
    const sid    = toOklchOrFallback(sidebarHex, { l: Math.max(bgP.l - 0.025, 0), c: nC, h: nH });
    const sidFg  = toOklchOrFallback(sidebarFgHex, fgP);
    const sidPri = toOklchOrFallback(sidPriHex,  brand);
    const acc    = toOklchOrFallback(accentHex,  mut);
    const accFg  = toOklchOrFallback(accentFgHex, fgP);

    // Primary foreground — semantic token → contrast heuristic
    const priFg  = toOklchOrFallback(priFgHex,
        brand.l > 0.55 ? { l: 0.14, c: 0.01, h: nH } : { l: 0.98, c: 0.01, h: nH });

    // Secondary surface — extracted or derived
    const sec    = toOklchOrFallback(secHex,     mut);
    const secFg  = toOklchOrFallback(secFgHex,   fgP);

    // Destructive — extracted or WCAG red
    const dest   = toOklchOrFallback(destHex,    { l: 0.535, c: 0.225, h: 25 });

    const sidPriFg = toOklchOrFallback(sidPriFgHex, priFg);
    const sidBdr = bdr;

    // ── Dark mode (algorithmic inversion, brand-tinted) ────────────────────
    const dBg      = { l: 0.135, c: nC,     h: nH };
    const dFg      = { l: 0.970, c: nC,     h: nH };
    const dCard    = { l: 0.175, c: nC,     h: nH };
    const dPri     = { l: Math.min(brand.l + 0.09, 0.78), c: brand.c * 0.88, h: brand.h };
    const dPriFg   = dPri.l > 0.55 ? { l: 0.14, c: 0.01, h: nH } : { l: 0.97, c: 0.01, h: nH };
    const dMut     = { l: 0.220, c: nC,     h: nH };
    const dMutFg   = { l: 0.640, c: nC * 2, h: nH };
    const dBdr     = { l: 0.260, c: nC,     h: nH };
    const dSec     = { l: 0.220, c: nC * 1.5, h: nH };
    const dAcc     = { l: 0.235, c: nC * 2, h: nH };
    const dSid     = { l: 0.110, c: nC,     h: nH };
    const dDest    = { l: 0.640, c: 0.220,  h: 25  };

    // ── Chart colors ──────────────────────────────────────────────────────
    const chart = [0, 72, 144, 216, 288].map(offset => ({
        l: 0.600, c: Math.max(brand.c * 0.85, 0.12), h: (brand.h + offset) % 360
    }));

    // ── Radius ─────────────────────────────────────────────────────────────
    // Priority: semantic (button radius) → CSS var --radius → smallest non-pill → 0.5rem
    let radiusRem = 0.5;
    {
        const stBtnRad  = st.primaryBorderRadius?.value;
        const cssRad    = (siteVars['--radius'] || '').trim();
        const nonPill   = radii.filter(r => r.value && !r.value.includes('%') && parseFloat(r.value) > 0 && parseFloat(r.value) < 64);
        const fromSt    = stBtnRad ? pxToRem(stBtnRad) : null;
        const fromCss   = cssRad ? (cssRad.endsWith('rem') ? parseFloat(cssRad) : pxToRem(cssRad)) : null;
        const fromRadii = nonPill.length ? pxToRem(nonPill[0].value) : null;
        radiusRem = fromSt ?? fromCss ?? fromRadii ?? 0.5;
    }

    // ── Per-component sizing tokens (passed through for component overrides) ─
    const compTokens = {
        buttonHeight:       st.primaryHeight?.value        || null,
        buttonPaddingV:     st.primaryPaddingTop?.value    || null,
        buttonPaddingH:     st.primaryPaddingRight?.value  || null,
        buttonFontSize:     st.primaryFontSize?.value      || null,
        buttonFontWeight:   st.primaryFontWeight?.value    || null,
        buttonLetterSpacing:st.primaryLetterSpacing?.value || null,
        buttonTextTransform:st.primaryTextTransform?.value || null,
        buttonShadow:       st.primaryBoxShadow?.value     || null,
        inputHeight:        st.inputHeight?.value          || null,
        inputPaddingV:      st.inputPaddingTop?.value      || null,
        inputPaddingH:      st.inputPaddingRight?.value    || null,
        inputFontSize:      st.inputFontSize?.value        || null,
        inputBorderWidth:   st.borderWidth?.value          || null,
        cardPaddingV:       st.cardPaddingTop?.value       || null,
        cardPaddingH:       st.cardPaddingRight?.value     || null,
        cardGap:            st.cardGap?.value              || null,
        cardShadow:         st.cardBoxShadow?.value        || null,
        badgeFontSize:      st.badgeFontSize?.value        || null,
        badgeFontWeight:    st.badgeFontWeight?.value      || null,
        badgePaddingV:      st.badgePaddingTop?.value      || null,
        badgePaddingH:      st.badgePaddingRight?.value    || null,
        headerHeight:       st.headerHeight?.value         || null,
        sidebarWidth:       st.sidebarWidth?.value         || null,
        tableHeaderFontWeight: st.tableHeaderFontWeight?.value || null,
        tableCellPaddingV:  st.tableCellPaddingTop?.value  || null,
        tableCellPaddingH:  st.tableCellPaddingRight?.value|| null,
        tooltipFontSize:    st.tooltipFontSize?.value      || null,
        tooltipShadow:      st.tooltipBoxShadow?.value     || null,
        separatorColor:     st.separatorColor?.value       || bdrHex || null,
        separatorThickness: st.separatorThickness?.value   || null,
        avatarSize:         st.avatarSize?.value           || null,
        avatarRadius:       st.avatarBorderRadius?.value   || null,
        progressHeight:     st.progressHeight?.value       || null,
        switchWidth:        st.switchWidth?.value          || null,
        switchHeight:       st.switchHeight?.value         || null,
        checkboxSize:       st.checkboxSize?.value         || null,
        tabActiveFontWeight:st.tabActiveFontWeight?.value  || null,
        // Typography from semantic tokens
        headingFamily:      st.headingFontFamily?.value    || null,
        bodyFamily:         st.bodyFontFamily?.value       || null,
        bodyFontSize:       st.bodyFontSize?.value         || null,
        bodyLineHeight:     st.bodyLineHeight?.value       || null,
        h1FontSize:         st.h1FontSize?.value           || null,
        h1FontWeight:       st.h1FontWeight?.value         || null,
        h1LineHeight:       st.h1LineHeight?.value         || null,
        h2FontSize:         st.h2FontSize?.value           || null,
        h3FontSize:         st.h3FontSize?.value           || null,
    };

    return {
        light: {
            background: bgP,  foreground: fgP,
            card: bgS,        cardForeground: toOklchOrFallback(cardFgHex, fgP),
            popover: pop,     popoverForeground: popFg,
            primary: brand,   primaryForeground: priFg,
            secondary: sec,   secondaryForeground: secFg,
            muted: mut,       mutedForeground: mutFg,
            accent: acc,      accentForeground: accFg,
            destructive: dest,
            border: bdr,      input: inp,   ring,
            sidebar: sid,
            sidebarForeground:           sidFg,
            sidebarPrimary:              sidPri,
            sidebarPrimaryForeground:    sidPriFg,
            sidebarAccent:               acc,
            sidebarAccentForeground:     accFg,
            sidebarBorder:               sidBdr,
            sidebarRing:                 ring,
        },
        dark: {
            background: dBg,  foreground: dFg,
            card: dCard,      cardForeground: dFg,
            popover: dCard,   popoverForeground: dFg,
            primary: dPri,    primaryForeground: dPriFg,
            secondary: dSec,  secondaryForeground: dFg,
            muted: dMut,      mutedForeground: dMutFg,
            accent: dAcc,     accentForeground: dFg,
            destructive: dDest,
            border: dBdr,     input: dBdr,  ring: dPri,
            sidebar: dSid,
            sidebarForeground:           dFg,
            sidebarPrimary:              dPri,
            sidebarPrimaryForeground:    dPriFg,
            sidebarAccent:               dAcc,
            sidebarAccentForeground:     dFg,
            sidebarBorder:               dBdr,
            sidebarRing:                 dPri,
        },
        chart,
        radius:      radiusRem,
        brand,
        neutralH:    nH,
        neutralC:    nC,
        compTokens,
        st, // raw semantic tokens for MD generators
    };
}

// ============================================
// SHADCN THEME MD GENERATOR
// ============================================

function generateShadcnThemeMd(data) {
    const domain = (() => { try { return new URL(data.pageUrl).hostname; } catch (_) { return data.pageUrl || 'Unknown'; } })();
    const title  = data.pageTitle || domain;

    const tokens  = generateShadcnTokens(data);
    const { light: L, dark: D, chart, radius, brand, compTokens, st } = tokens;

    const bgs     = data.colors?.backgrounds || [];
    const texts   = data.colors?.text        || [];
    const typo    = data.typography          || [];

    // ── Dark mode detection via semantic token ─────
    const bgHex = st.background?.value || bgs[0]?.hex || '#ffffff';
    const fgHex = st.foreground?.value || texts[0]?.hex || '#000000';
    const isDark = !isLightHex(bgHex) && isLightHex(fgHex);

    // ── Fonts: semantic tokens beat typography array ─
    const headingFont = compTokens.headingFamily
        || typo.find(t => /heading|display|h[1-3]|title/i.test(t.label || ''))?.family
        || typo[0]?.family || 'Inter';
    const bodyFont = compTokens.bodyFamily
        || typo.find(t => /body|paragraph|text|base|ui/i.test(t.label || ''))?.family
        || (typo.length > 1 ? typo[typo.length - 1].family : typo[0]?.family) || 'Inter';

    // ── Radius label (maps to shadcn configurator presets) ─
    const radiusLabel = radius <= 0   ? 'None'
        : radius < 0.30 ? 'Small'
        : radius < 0.55 ? 'Default'
        : radius < 0.90 ? 'Large'
        : 'Full';

    // ── Neutral name from hue ──────────────────────
    const hue = tokens.neutralH;
    const neutralName = hue > 200 && hue < 260 ? 'Slate'
        : hue >= 260 && hue < 310 ? 'Zinc'
        : hue >= 30  && hue < 70  ? 'Stone'
        : 'Neutral';

    // ── Brand descriptors ──────────────────────────
    const hueDesc = brand.h < 30   ? 'red'
        : brand.h < 60  ? 'orange/amber'
        : brand.h < 90  ? 'yellow'
        : brand.h < 150 ? 'green'
        : brand.h < 195 ? 'teal/cyan'
        : brand.h < 260 ? 'blue'
        : brand.h < 300 ? 'violet/purple'
        : 'pink/magenta';
    const chromaDesc = brand.c < 0.05 ? 'achromatic'
        : brand.c < 0.12 ? 'muted'
        : brand.c < 0.20 ? 'moderate'
        : 'vivid';

    // ── CSS block helper ───────────────────────────
    function cssBlock(mode) {
        const T = mode === 'light' ? L : D;
        return [
            `    --background:                  ${tv(T.background)};`,
            `    --foreground:                  ${tv(T.foreground)};`,
            `    --card:                        ${tv(T.card)};`,
            `    --card-foreground:             ${tv(T.cardForeground)};`,
            `    --popover:                     ${tv(T.popover)};`,
            `    --popover-foreground:          ${tv(T.popoverForeground)};`,
            `    --primary:                     ${tv(T.primary)};`,
            `    --primary-foreground:          ${tv(T.primaryForeground)};`,
            `    --secondary:                   ${tv(T.secondary)};`,
            `    --secondary-foreground:        ${tv(T.secondaryForeground)};`,
            `    --muted:                       ${tv(T.muted)};`,
            `    --muted-foreground:            ${tv(T.mutedForeground)};`,
            `    --accent:                      ${tv(T.accent)};`,
            `    --accent-foreground:           ${tv(T.accentForeground)};`,
            `    --destructive:                 ${tv(T.destructive)};`,
            `    --border:                      ${tv(T.border)};`,
            `    --input:                       ${tv(T.input)};`,
            `    --ring:                        ${tv(T.ring)};`,
            `    --chart-1:                     ${tv({ ...chart[0], l: chart[0].l + (mode === 'dark' ? 0.08 : 0) })};`,
            `    --chart-2:                     ${tv({ ...chart[1], l: chart[1].l + (mode === 'dark' ? 0.08 : 0) })};`,
            `    --chart-3:                     ${tv({ ...chart[2], l: chart[2].l + (mode === 'dark' ? 0.08 : 0) })};`,
            `    --chart-4:                     ${tv({ ...chart[3], l: chart[3].l + (mode === 'dark' ? 0.08 : 0) })};`,
            `    --chart-5:                     ${tv({ ...chart[4], l: chart[4].l + (mode === 'dark' ? 0.08 : 0) })};`,
            `    --sidebar:                     ${tv(T.sidebar)};`,
            `    --sidebar-foreground:          ${tv(T.sidebarForeground)};`,
            `    --sidebar-primary:             ${tv(T.sidebarPrimary)};`,
            `    --sidebar-primary-foreground:  ${tv(T.sidebarPrimaryForeground)};`,
            `    --sidebar-accent:              ${tv(T.sidebarAccent)};`,
            `    --sidebar-accent-foreground:   ${tv(T.sidebarAccentForeground)};`,
            `    --sidebar-border:              ${tv(T.sidebarBorder)};`,
            `    --sidebar-ring:                ${tv(T.sidebarRing)};`,
            ...(mode === 'light' ? [`    --radius:                      ${radius}rem;`] : []),
        ].join('\n');
    }

    let md = '';

    // ── Header ─────────────────────────────────────
    md += `# shadcn Theme — ${escMd(title)}\n\n`;
    md += `> Extracted by Plukrr from \`${escMd(data.pageUrl || domain)}\`  \n`;
    md += `> Mode: **${isDark ? 'Dark' : 'Light'}** · Brand: **${chromaDesc} ${hueDesc}** · Radius: **${radiusLabel} (${radius}rem)**\n\n`;
    md += `---\n\n`;

    // ── 1. CSS Variables (the actual deliverable) ──
    md += `## 1. CSS Variables\n\n`;
    md += `Paste into \`app/globals.css\`, replacing your existing \`:root\` and \`.dark\` blocks:\n\n`;
    md += `\`\`\`css\n`;
    md += `@layer base {\n`;
    md += `  :root {\n${cssBlock('light')}\n  }\n\n`;
    md += `  .dark {\n${cssBlock('dark')}\n  }\n`;
    md += `}\n`;
    md += `\`\`\`\n\n`;

    // ── 2. Font Setup ──────────────────────────────
    md += `## 2. Font Setup\n\n`;
    const customFonts = [...new Set([headingFont, bodyFont])].filter(f =>
        f && !f.includes('system') && !f.includes('-apple') && f !== 'Inter' && f !== 'sans-serif'
    );
    if (customFonts.length) {
        md += `Add to your layout \`<head>\` (or use \`next/font\` for Next.js projects):\n\n`;
        md += `\`\`\`html\n`;
        customFonts.forEach(f => {
            const encoded = encodeURIComponent(f).replace(/%20/g, '+');
            md += `<link href="https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap" rel="stylesheet">\n`;
        });
        md += `\`\`\`\n\n`;
    }
    md += `Add font variables to \`globals.css\`:\n\n`;
    md += `\`\`\`css\n:root {\n`;
    md += `  --font-sans:    '${bodyFont}', system-ui, sans-serif;\n`;
    if (headingFont !== bodyFont) {
        md += `  --font-heading: '${headingFont}', system-ui, sans-serif;\n`;
    }
    md += `}\n\`\`\`\n\n`;

    // ── 3. tailwind.config ─────────────────────────
    md += `## 3. tailwind.config\n\n`;
    md += `\`\`\`js\n`;
    md += `theme: {\n  extend: {\n    fontFamily: {\n`;
    md += `      sans:    ['var(--font-sans)'],\n`;
    if (headingFont !== bodyFont) md += `      heading: ['var(--font-heading)'],\n`;
    md += `    },\n    borderRadius: {\n`;
    md += `      sm:    'calc(var(--radius) * 0.6)',\n`;
    md += `      md:    'calc(var(--radius) * 0.8)',\n`;
    md += `      lg:    'var(--radius)',\n`;
    md += `      xl:    'calc(var(--radius) * 1.4)',\n`;
    md += `      '2xl': 'calc(var(--radius) * 1.8)',\n`;
    md += `    },\n  },\n},\n`;
    md += `\`\`\`\n\n`;

    // ── 4. shadcn Configurator Reference ───────────
    // These are the closest matches in the shadcn theme configurator UI.
    // Note: "Style" (Default/New York) is an init-time choice — not set here.
    md += `## 4. shadcn Configurator Reference\n\n`;
    md += `If using the [shadcn theme configurator](https://ui.shadcn.com/themes), these are the closest starting presets — then paste the CSS variables above to override precisely:\n\n`;
    md += `| Setting | Closest Match | Notes |\n`;
    md += `|---------|--------------|-------|\n`;
    md += `| **Base Color** | ${neutralName} | Nearest named neutral palette to extracted tones |\n`;
    md += `| **Mode** | ${isDark ? 'Dark' : 'Light'} | Detected from page scan |\n`;
    md += `| **Heading Font** | ${escMd(headingFont)} | Extracted display typeface |\n`;
    md += `| **Body Font** | ${escMd(bodyFont)} | Extracted UI / body typeface |\n`;
    md += `| **Radius** | ${radiusLabel} | Extracted base: \`${radius}rem\` (${Math.round(radius * 16)}px) |\n`;
    md += `\n`;
    md += `> The CSS variables in Section 1 take full precedence over any configurator preset.\n\n`;

    // ── 5. AI Prompt ───────────────────────────────
    md += `## 5. AI Prompt\n\n`;
    md += `Copy into Cursor, v0, or Claude to build shadcn UI matching this design:\n\n`;
    md += `\`\`\`\n`;
    md += `Build a shadcn/ui interface using this theme:\n\n`;
    md += `Mode: ${isDark ? 'dark' : 'light'} | Neutral base: ${neutralName} | Radius: ${radiusLabel} (${radius}rem)\n`;
    md += `Heading font: "${headingFont}"${headingFont !== bodyFont ? `  Body font: "${bodyFont}"` : ''}\n\n`;
    md += `Key CSS variables:\n`;
    md += `  --primary:    ${tv(L.primary)}  /* ${chromaDesc} ${hueDesc} */\n`;
    md += `  --background: ${tv(L.background)}\n`;
    md += `  --foreground: ${tv(L.foreground)}\n`;
    md += `  --muted:      ${tv(L.muted)}\n`;
    md += `  --border:     ${tv(L.border)}\n`;
    md += `  --ring:       ${tv(L.ring)}\n`;
    md += `  --radius:     ${radius}rem\n\n`;
    const typoSample = typo.slice(0, 3).map(t => `${t.size} ${t.weight}w (${t.label})`).join(', ');
    if (typoSample) md += `Type scale: ${typoSample}\n`;
    md += `Elevation: ${data.shadows?.length ? `${data.shadows.length} shadow level(s)` : 'flat — no shadows'}\n\n`;
    md += `Apply the full @layer base block from the CSS variables section above.\n`;
    md += `\`\`\`\n\n`;

    // ── 6. Token Map ───────────────────────────────
    md += `## 6. Token Map\n\n`;
    md += `Sources for each CSS variable — semantic token (role-anchored) > CSS var > frequency heuristic:\n\n`;
    md += `| Variable | Source element | Light value | Dark value |\n`;
    md += `|----------|---------------|-------------|------------|\n`;
    const tmRows = [
        ['--background',           st.background?.source       || 'body',                   L.background,      D.background],
        ['--foreground',           st.foreground?.source       || 'body',                   L.foreground,      D.foreground],
        ['--card',                 st.card?.source             || 'secondary bg',            L.card,            D.card],
        ['--card-foreground',      st.cardForeground?.source   || 'card text',               L.cardForeground,  D.cardForeground],
        ['--popover',              st.popover?.source          || 'derived from card',       L.popover,         D.popover],
        ['--primary',              st.primary?.source          || 'highest-chroma btn',      L.primary,         D.primary],
        ['--primary-foreground',   st.primaryForeground?.source|| 'btn text / contrast',     L.primaryForeground,D.primaryForeground],
        ['--secondary',            st.secondary?.source        || 'secondary btn / derived', L.secondary,       D.secondary],
        ['--muted',                st.muted?.source            || 'code/secondary surface',  L.muted,           D.muted],
        ['--muted-foreground',     st.mutedForeground?.source  || 'secondary text',          L.mutedForeground, D.mutedForeground],
        ['--accent',               st.accent?.source           || 'derived from muted',      L.accent,          D.accent],
        ['--border',               st.border?.source           || 'input border',            L.border,          D.border],
        ['--input',                st.inputBg?.source          || 'input bg',                L.input,           D.input],
        ['--ring',                 st.ring?.source             || ':focus-visible / primary',L.ring,            D.ring],
        ['--destructive',          st.destructive?.source      || 'WCAG red (fallback)',      L.destructive,     D.destructive],
        ['--sidebar',              st.sidebar?.source          || 'aside/sidebar',            L.sidebar,         D.sidebar],
        ['--radius',               st.primaryBorderRadius?.source || 'button / smallest radius', null, null],
    ];
    for (const [varName, src, lVal, dVal] of tmRows) {
        const lStr = lVal ? `\`${tv(lVal)}\`` : `\`${radius}rem\``;
        const dStr = dVal ? `\`${tv(dVal)}\`` : `\`${radius}rem\``;
        md += `| \`${varName}\` | ${escMd(src)} | ${lStr} | ${dStr} |\n`;
    }
    md += `| \`--chart-1…5\` | brand hue ± 72° rotations | ${hueDesc} spectrum | +0.08L |\n`;
    md += `| dark mode | OKLCH inversion | — | chroma+hue preserved |\n\n`;

    // ── 7. Component Specifications ────────────────
    md += `## 7. Component Specifications\n\n`;
    md += `Exact computed values captured from user-selected elements. Apply as Tailwind utilities or component-level CSS overrides.\n\n`;
    md += generateComponentSpecsMd(st);

    return md;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT PROPERTIES TABLE
// Maps semanticTokens → the standard 28-row component table.
// Populated by auto-scan (performQuickScan → extractSemanticTokens).
// DS Builder enriches the same keys with exact computed values.
// ─────────────────────────────────────────────────────────────────────────────
function computeContrastRatio(hex1, hex2) {
    function lum(hex) {
        if (!hex || hex.length < 7) return 0;
        const rgb = parseInt(hex.replace('#', ''), 16);
        const r = (rgb >> 16) / 255, g = ((rgb >> 8) & 0xff) / 255, b = (rgb & 0xff) / 255;
        const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    }
    const l1 = lum(hex1), l2 = lum(hex2);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return ((hi + 0.05) / (lo + 0.05)).toFixed(1);
}

function generateComponentsBlocks(st) {
    function v(key) {
        const raw = st[key]?.value;
        if (!raw || raw === 'none' || raw === '0px' || raw === 'normal' || raw === 'transparent') return '—';
        const a = (raw.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/) || [])[1];
        if (a !== undefined && parseFloat(a) < 0.05) return '—';
        return raw;
    }

    function pad(topKey, rightKey) {
        const t = v(topKey), r = v(rightKey);
        if (t !== '—' && r !== '—') return `${t} ${r}`;
        if (t !== '—') return t;
        if (r !== '—') return r;
        return '—';
    }

    function bullet(label, value) {
        if (!value || value === '—') return '';
        return `- **${label}:** \`${escMd(value)}\`\n`;
    }

    function fontSpec(...keys) {
        const parts = keys.map(k => v(k)).filter(x => x !== '—');
        return parts.length ? parts.join(' / ') : '—';
    }

    function borderStr(colorKey, widthKey) {
        const color = v(colorKey);
        if (color === '—') return 'none';
        const width = v(widthKey);
        return `${width !== '—' ? width : '1px'} solid ${color}`;
    }

    function block(title, fields) {
        const lines = fields.map(([label, value]) => bullet(label, value)).filter(Boolean);
        if (!lines.length) return '';
        return `### ${title}\n\n${lines.join('')}- **States:** *Capture via Create DS flow — hover/focus states not auto-extracted*\n\n`;
    }

    const detected = {
        buttonPrimary:     v('primary') !== '—',
        buttonSecondary:   v('secondary') !== '—',
        buttonDestructive: v('destructive') !== '—',
        input:             v('border') !== '—' || v('inputBg') !== '—',
        card:              v('card') !== '—',
        navigation:        v('sidebar') !== '—' || v('headerBg') !== '—',
        avatar:            v('avatarBg') !== '—',
        badge:             v('badgeBackground') !== '—' || v('badgeFontSize') !== '—',
        link:              v('accent') !== '—',
        checkbox:          v('checkboxBorderColor') !== '—',
        radio:             v('radioBorderColor') !== '—',
        switch_:           v('switchBg') !== '—',
        select:            v('selectBg') !== '—',
        table:             v('tableHeaderBg') !== '—',
        modal:             v('dialogBg') !== '—',
        toast:             v('toastBg') !== '—',
        tooltip:           v('tooltipBg') !== '—',
        accordion:         v('accordionBg') !== '—',
        alert:             v('alertBg') !== '—',
        sidebar:           v('sheetBg') !== '—',
        contextMenu:       v('contextMenuBg') !== '—',
        dropdown:          v('popover') !== '—',
    };

    const notDetectedLabels = {
        buttonPrimary:     'Button — Primary',
        buttonSecondary:   'Button — Secondary',
        buttonDestructive: 'Button — Destructive',
        input:             'Input / Text Field',
        card:              'Card',
        navigation:        'Navigation',
        avatar:            'Avatar',
        badge:             'Badge / Tag',
        link:              'Link',
        checkbox:          'Checkbox',
        radio:             'Radio Button',
        switch_:           'Switch / Toggle',
        select:            'Select',
        table:             'Table',
        modal:             'Modal / Dialog',
        toast:             'Toast',
        tooltip:           'Tooltip',
        accordion:         'Accordion',
        alert:             'Alert',
        sidebar:           'Sidebar Panel',
        contextMenu:       'Context Menu',
        dropdown:          'Popover / Dropdown',
    };

    let md = '';

    if (detected.buttonPrimary) {
        md += block('Button — Primary', [
            ['Background', v('primary')],
            ['Foreground', v('primaryForeground')],
            ['Padding', pad('primaryPaddingTop', 'primaryPaddingRight')],
            ['Radius', v('primaryBorderRadius')],
            ['Font', fontSpec('primaryFontSize', 'primaryFontWeight', 'primaryFontFamily')],
            ['Border', borderStr('primaryBorderColor', 'primaryBorderWidth')],
            ['Shadow', v('primaryBoxShadow')],
            ['Min height', v('primaryHeight')],
        ]);
    }

    if (detected.buttonSecondary) {
        md += block('Button — Secondary', [
            ['Background', v('secondary')],
            ['Foreground', v('secondaryForeground')],
            ['Padding', pad('secondaryPaddingTop', 'secondaryPaddingRight')],
            ['Radius', v('secondaryBorderRadius')],
            ['Font', fontSpec('primaryFontSize', 'primaryFontWeight', 'primaryFontFamily')],
            ['Border', borderStr('secondaryBorderColor', 'secondaryBorderWidth')],
            ['Shadow', v('secondaryBoxShadow')],
            ['Min height', v('secondaryHeight')],
        ]);
    }

    if (detected.buttonDestructive) {
        md += block('Button — Destructive', [
            ['Background', v('destructive')],
            ['Foreground', v('destructiveForeground')],
            ['Padding', pad('destructivePaddingTop', 'destructivePaddingRight')],
            ['Radius', v('destructiveBorderRadius')],
            ['Font', fontSpec('destructiveFontSize', 'destructiveFontWeight')],
            ['Shadow', v('destructiveBoxShadow')],
            ['Min height', v('destructiveHeight')],
        ]);
    }

    if (detected.input) {
        md += block('Input — Text Field', [
            ['Background', v('inputBg')],
            ['Border', borderStr('border', 'inputBorderWidth')],
            ['Radius', v('inputBorderRadius')],
            ['Padding', pad('inputPaddingTop', 'inputPaddingRight')],
            ['Foreground', v('foreground')],
            ['Font', fontSpec('inputFontSize')],
            ['Min height', v('inputHeight')],
        ]);
    }

    if (detected.card) {
        md += block('Card', [
            ['Background', v('card')],
            ['Foreground', v('cardForeground')],
            ['Border', borderStr('cardBorderColor', 'cardBorderWidth')],
            ['Radius', v('cardBorderRadius')],
            ['Padding', pad('cardPaddingTop', 'cardPaddingRight')],
            ['Shadow', v('cardBoxShadow')],
        ]);
    }

    if (detected.navigation) {
        md += block('Navigation — Top Bar', [
            ['Background', v('headerBg')],
            ['Height', v('headerHeight')],
            ['Item color', v('navLinkForeground')],
            ['Active item color', v('sidebarForeground')],
            ['Border', v('headerBorderColor') !== '—' ? `1px solid ${v('headerBorderColor')}` : 'none'],
            ['Shadow', v('headerBoxShadow')],
        ]);
    }

    if (detected.avatar) {
        md += block('Avatar', [
            ['Background', v('avatarBg')],
            ['Border', v('avatarBorderColor') !== '—' ? `1px solid ${v('avatarBorderColor')}` : 'none'],
            ['Radius', v('avatarBorderRadius')],
            ['Size', v('avatarSize')],
        ]);
    }

    if (detected.badge) {
        md += block('Badge / Tag', [
            ['Background', v('badgeBackground')],
            ['Foreground', v('badgeForeground')],
            ['Padding', pad('badgePaddingTop', 'badgePaddingRight')],
            ['Radius', v('badgeBorderRadius')],
            ['Font', fontSpec('badgeFontSize', 'badgeFontWeight')],
            ['Border', v('badgeBorderColor') !== '—' ? `1px solid ${v('badgeBorderColor')}` : 'none'],
        ]);
    }

    if (detected.link) {
        md += block('Link', [
            ['Color', v('accent')],
            ['Underline', v('accentTextDecoration')],
        ]);
    }

    if (detected.checkbox) {
        md += block('Checkbox', [
            ['Accent color', v('checkboxAccentColor')],
            ['Border', v('checkboxBorderColor') !== '—' ? `1px solid ${v('checkboxBorderColor')}` : '—'],
            ['Radius', v('checkboxBorderRadius')],
            ['Size', v('checkboxSize')],
        ]);
    }

    if (detected.radio) {
        md += block('Radio Button', [
            ['Accent color', v('radioAccentColor')],
            ['Border', v('radioBorderColor') !== '—' ? `1px solid ${v('radioBorderColor')}` : '—'],
            ['Radius', v('radioBorderRadius')],
            ['Size', v('radioSize')],
        ]);
    }

    if (detected.switch_) {
        md += block('Switch / Toggle', [
            ['Background (on)', v('switchBg')],
            ['Radius', v('switchBorderRadius')],
            ['Height', v('switchHeight')],
            ['Width', v('switchWidth')],
        ]);
    }

    if (detected.select) {
        md += block('Select', [
            ['Background', v('selectBg')],
            ['Foreground', v('selectForeground')],
            ['Border', borderStr('selectBorderColor', 'selectBorderWidth')],
            ['Radius', v('selectBorderRadius')],
            ['Height', v('selectHeight')],
        ]);
    }

    if (detected.table) {
        md += `### Table\n\n`;
        md += `**Header row:**\n`;
        md += bullet('Background', v('tableHeaderBg'));
        md += bullet('Foreground', v('tableHeaderForeground'));
        md += bullet('Font', fontSpec('tableHeaderFontSize', 'tableHeaderFontWeight'));
        md += bullet('Padding', pad('tableHeaderPaddingTop', 'tableHeaderPaddingRight'));
        md += bullet('Border', v('tableBorderColor') !== '—' ? `1px solid ${v('tableBorderColor')}` : 'none');
        md += `\n**Data row:**\n`;
        md += bullet('Background', v('tableBg'));
        md += bullet('Foreground', v('tableCellForeground'));
        md += bullet('Font size', v('tableFontSize'));
        md += bullet('Padding', pad('tableCellPaddingTop', 'tableCellPaddingRight'));
        md += `\n- **States:** *Capture via Create DS flow — hover/focus states not auto-extracted*\n\n`;
    }

    if (detected.modal) {
        md += block('Modal / Dialog', [
            ['Background', v('dialogBg')],
            ['Foreground', v('dialogForeground')],
            ['Radius', v('dialogBorderRadius')],
            ['Padding', pad('dialogPaddingTop', 'dialogPaddingRight')],
            ['Shadow', v('dialogBoxShadow')],
        ]);
    }

    if (detected.toast) {
        md += block('Toast', [
            ['Background', v('toastBg')],
            ['Foreground', v('toastForeground')],
            ['Border', v('toastBorderColor') !== '—' ? `1px solid ${v('toastBorderColor')}` : 'none'],
            ['Radius', v('toastBorderRadius')],
            ['Padding', pad('toastPaddingTop', 'toastPaddingRight')],
            ['Shadow', v('toastBoxShadow')],
            ['Font size', v('toastFontSize')],
        ]);
    }

    if (detected.tooltip) {
        md += block('Tooltip', [
            ['Background', v('tooltipBg')],
            ['Foreground', v('tooltipForeground')],
            ['Radius', v('tooltipBorderRadius')],
            ['Padding', pad('tooltipPaddingTop', 'tooltipPaddingRight')],
            ['Shadow', v('tooltipBoxShadow')],
            ['Font size', v('tooltipFontSize')],
        ]);
    }

    if (detected.accordion) {
        md += block('Accordion', [
            ['Background', v('accordionBg')],
            ['Trigger foreground', v('accordionTriggerForeground')],
            ['Border', v('accordionBorderColor') !== '—' ? `1px solid ${v('accordionBorderColor')}` : 'none'],
            ['Padding', pad('accordionTriggerPaddingTop', 'accordionTriggerPaddingRight')],
            ['Font', fontSpec('accordionTriggerFontSize', 'accordionTriggerFontWeight')],
        ]);
    }

    if (detected.alert) {
        md += block('Alert', [
            ['Background', v('alertBg')],
            ['Foreground', v('alertForeground')],
            ['Border', v('alertBorderColor') !== '—' ? `1px solid ${v('alertBorderColor')}` : 'none'],
            ['Radius', v('alertBorderRadius')],
            ['Padding', pad('alertPaddingTop', 'alertPaddingRight')],
            ['Shadow', v('alertBoxShadow')],
            ['Font size', v('alertFontSize')],
        ]);
    }

    if (detected.sidebar) {
        md += block('Sidebar Panel', [
            ['Background', v('sheetBg')],
            ['Foreground', v('sheetForeground')],
            ['Border', v('sheetBorderColor') !== '—' ? `1px solid ${v('sheetBorderColor')}` : 'none'],
        ]);
    }

    if (detected.contextMenu) {
        md += block('Context Menu', [
            ['Background', v('contextMenuBg')],
            ['Foreground', v('contextMenuForeground')],
            ['Border', v('contextMenuBorderColor') !== '—' ? `1px solid ${v('contextMenuBorderColor')}` : 'none'],
        ]);
    }

    if (detected.dropdown) {
        md += block('Popover / Dropdown', [
            ['Background', v('popover')],
            ['Foreground', v('popoverForeground')],
            ['Border', v('popoverBorderColor') !== '—' ? `1px solid ${v('popoverBorderColor')}` : 'none'],
            ['Radius', v('popoverBorderRadius')],
            ['Shadow', v('popoverBoxShadow')],
        ]);
    }

    const missing = Object.entries(detected)
        .filter(([, det]) => !det)
        .map(([key]) => notDetectedLabels[key]);

    if (missing.length) {
        md += `### ⚠ Not detected on scanned pages\n\n`;
        md += `The following components were not found. Use **Create Design System** to capture them:\n\n`;
        missing.forEach(label => { md += `- ${label}\n`; });
        md += `\n`;
    }

    return md;
}

function generateDesignMarkdown(data) {
    const domain = (() => { try { return new URL(data.pageUrl).hostname; } catch (_) { return data.pageUrl || 'Unknown'; } })();
    const title  = data.pageTitle || domain;
    const date   = new Date().toISOString().split('T')[0];

    const bgs       = (data.colors?.backgrounds || []).filter(c => c.hex?.toUpperCase() !== '#000000');
    const texts     = data.colors?.text        || [];
    const interacts = data.colors?.interactive || [];
    const borders   = data.colors?.borders     || [];
    const typo      = data.typography          || [];
    const layout    = data.layout              || {};
    const spacing   = data.spacing             || {};
    const radii     = data.radii               || [];
    const shadows   = data.shadows             || [];
    const cssVars   = data.cssVariables        || {};
    const st        = data.semanticTokens      || {};

    const families = [...new Set(typo.map(t => t.family).filter(Boolean))];
    const weights  = [...new Set(typo.map(t => String(t.weight)).filter(Boolean))];

    // Dark mode detection — same multi-signal approach
    const topBgs        = bgs.slice(0, 3);
    const darkBgCount   = topBgs.filter(c => !isLightHex(c.hex)).length;
    const bgSignal      = darkBgCount >= 2;
    const textSignal    = texts.length > 0 && isLightHex(texts[0].hex);
    const primaryBgDark = bgs.length > 0 && !isLightHex(bgs[0].hex);
    const darkSignals   = [bgSignal, textSignal, primaryBgDark].filter(Boolean).length;
    const isDark        = darkSignals >= 2;
    const isFlat        = shadows.length === 0;
    const hasPill       = radii.some(r => parseFloat(r.value) >= 500 || r.value === '50%' || r.value === '100%');
    const hasRounding   = radii.some(r => { const px = parseFloat(r.value); return px > 4 && px < 500; });
    const modeLabel     = isDark ? 'dark-mode' : 'light-mode';
    const depthLabel    = isFlat ? 'flat / no elevation' : `${shadows.length}-level shadow system`;

    // Spacing base unit
    const spaceScale = (spacing.scale || []).map(v => typeof v === 'number' ? v : parseFloat(v)).filter(n => n > 0);
    const spaceBase  = spacing.baseUnit || (spaceScale.length ? [...spaceScale].sort((a, b) => a - b)[0] : 4);

    // Radius defaults
    const sortedRadii   = [...radii].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
    const defaultRadius = sortedRadii.find(r => parseFloat(r.value) > 0)?.value || sortedRadii[0]?.value || '4px';

    // Accent color
    const accentHex = st.accent?.value || interacts[0]?.hex;

    // Component detection for confidence score
    function vSt(key) {
        const raw = st[key]?.value;
        if (!raw || raw === 'none' || raw === '0px' || raw === 'normal' || raw === 'transparent') return false;
        const a = (raw.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/) || [])[1];
        return !(a !== undefined && parseFloat(a) < 0.05);
    }

    const detectedCount = [
        vSt('primary'), vSt('secondary'), vSt('destructive'),
        vSt('border') || vSt('inputBg'), vSt('card'),
        vSt('sidebar') || vSt('headerBg'),
        vSt('avatarBg'), vSt('badgeBackground') || vSt('badgeFontSize'),
        vSt('accent'), vSt('checkboxBorderColor'), vSt('radioBorderColor'),
        vSt('switchBg'), vSt('selectBg'), vSt('tableHeaderBg'),
        vSt('dialogBg'), vSt('toastBg'), vSt('tooltipBg'),
        vSt('accordionBg'), vSt('alertBg'), vSt('sheetBg'),
        vSt('contextMenuBg'), vSt('popover'),
    ].filter(Boolean).length;
    const totalExpected = 22;
    const confidencePct = Math.round((detectedCount / totalExpected) * 100);

    // DS override count (tokens captured via Build DS, not auto-scan)
    const dsOverrides = Object.values(st).filter(t => t?.source && t.source !== 'auto-scan').length;

    let md = '';

    // ── HEADER ────────────────────────────────────────────────────────────────
    md += `# Design System — ${escMd(title)}\n\n`;
    md += `> Source: \`${escMd(data.pageUrl || domain)}\` · Extracted: \`${date}\` · Pages scanned: 1\n`;
    md += `> Confidence: **${confidencePct}%** — components marked \`⚠\` need manual verification via Create Design System flow.\n\n`;
    md += `---\n\n`;

    // ── 1. FINGERPRINT ────────────────────────────────────────────────────────
    md += `## 1. Fingerprint\n\n`;
    {
        const parts = [`${escMd(title)} is a **${modeLabel}** interface.`];
        if (bgs[0])     parts.push(`Canvas \`${bgs[0].hex}\`,`);
        if (texts[0])   parts.push(`primary text \`${texts[0].hex}\`,`);
        if (accentHex)  parts.push(`accent \`${accentHex}\`.`);
        if (families.length) parts.push(`Typography: \`${families[0]}\`${weights.length ? ` with weights ${weights.join(', ')}` : ''}.`);
        parts.push(`Base spacing unit \`${spaceBase}px\`, default radius \`${defaultRadius}\`.`);
        parts.push(`Depth: **${depthLabel}**.`);
        md += parts.join(' ') + '\n\n';
    }
    md += `---\n\n`;

    // ── 2. TOKENS ─────────────────────────────────────────────────────────────
    md += `## 2. Tokens\n\n`;

    // Color table
    md += `### Color\n\n`;
    md += `| Token | Value | Role |\n`;
    md += `|-------|-------|------|\n`;
    const colorRows = [
        ['color.bg.canvas',         bgs[0]?.hex,                                                              'Page background'],
        ['color.bg.surface',        st.card?.value || bgs[1]?.hex,                                            'Cards, panels, raised surfaces'],
        ['color.bg.muted',          st.muted?.value || bgs[2]?.hex,                                           'Subtle fills, hover states'],
        ['color.text.primary',      texts[0]?.hex,                                                            'Headings, body'],
        ['color.text.secondary',    texts[1]?.hex,                                                            'Supporting text, metadata'],
        ['color.text.disabled',     texts[3]?.hex || texts[2]?.hex,                                           'Disabled states'],
        ['color.text.inverse',      isDark ? texts.find(t => !isLightHex(t.hex))?.hex : texts.find(t => isLightHex(t.hex))?.hex, 'Text on accent backgrounds'],
        ['color.action.primary',    accentHex,                                                                'CTAs, links, focus rings'],
        ['color.feedback.negative', st.destructive?.value,                                                   'Errors, destructive actions'],
        ['color.border.default',    borders[0]?.hex,                                                          'Card/input borders, dividers'],
        ['color.border.strong',     borders[1]?.hex,                                                          'Emphasized borders'],
    ];
    for (const [token, value, role] of colorRows) {
        if (!value || value === 'transparent' || value === 'none') continue;
        md += `| \`${token}\` | \`${escMd(value)}\` | ${role} |\n`;
    }
    md += `\n`;

    // Radius table
    if (radii.length) {
        md += `### Radius\n\n`;
        md += `| Token | Value | Used for |\n`;
        md += `|-------|-------|----------|\n`;
        const seenR = new Set();
        for (const r of sortedRadii) {
            const px = parseFloat(r.value);
            let token, usedFor;
            if (r.value === '50%' || r.value === '100%' || px >= 500) { token = 'radius.pill'; usedFor = 'Tag-style pills, round buttons'; }
            else if (px >= 13 && px <= 48)                             { token = 'radius.lg';   usedFor = 'Cards, modals'; }
            else if (px >= 5  && px <= 12)                             { token = 'radius.md';   usedFor = 'Buttons, small cards'; }
            else if (px > 0   && px <= 4)                              { token = 'radius.sm';   usedFor = 'Inputs, badges, chips'; }
            else                                                        { token = `radius.${Math.round(px) || r.value}`; usedFor = 'Custom'; }
            if (seenR.has(token)) continue;
            seenR.add(token);
            md += `| \`${token}\` | \`${escMd(r.value)}\` | ${usedFor} |\n`;
        }
        md += `\n`;
    }

    // Spacing
    md += `### Spacing\n\n`;
    if (spaceScale.length) {
        md += `- **Base unit:** \`${spaceBase}px\`\n`;
        md += `- **Scale:** ${[...spaceScale].sort((a, b) => a - b).map(v => `${v}px`).join(', ')}\n\n`;
    } else if (spacing.baseUnit) {
        md += `- **Base unit:** \`${spacing.baseUnit}px\`\n\n`;
    } else {
        md += `No spacing scale captured — use **Create Design System** to extract.\n\n`;
    }

    // Typography table
    if (typo.length) {
        md += `### Typography\n\n`;
        md += `| Role | Family | Size | Weight | Line height |\n`;
        md += `|------|--------|------|--------|-------------|\n`;

        function typoRole(t) {
            const lbl = (t.label || '').toLowerCase();
            const tag = (t.tag  || '').toLowerCase();
            if (lbl.includes('display') || lbl.includes('hero'))               return 'Display';
            if (lbl.includes('h1') || lbl.includes('heading 1') || tag==='h1') return 'H1';
            if (lbl.includes('h2') || lbl.includes('heading 2') || tag==='h2') return 'H2';
            if (lbl.includes('h3') || lbl.includes('heading 3') || tag==='h3') return 'H3';
            if (lbl.includes('caption'))                                        return 'Caption';
            if (lbl.includes('small') || lbl.includes('body small'))           return 'Body Small';
            if (lbl.includes('body') || tag === 'p') {
                const bodyEntries = typo.filter(x => (x.label||'').toLowerCase().includes('body') || x.tag === 'p');
                return bodyEntries.indexOf(t) === 0 ? 'Body' : 'Body Small';
            }
            const sorted = [...typo].sort((a, b) => (parseFloat(b.size)||16) - (parseFloat(a.size)||16));
            const rank = sorted.indexOf(t);
            return ['Display','H1','H2','H3','Body','Body Small','Caption'][rank] || `Style ${rank + 1}`;
        }

        const seenRole = new Set();
        for (const t of typo) {
            const role = typoRole(t);
            if (seenRole.has(role)) continue;
            seenRole.add(role);
            md += `| ${role} | \`${escMd(t.family || '—')}\` | \`${t.size || '—'}\` | \`${t.weight || '—'}\` | \`${t.lineHeight || '—'}\` |\n`;
        }
        md += `\n`;
        if (families.length) md += `**Font stack:** \`${families.join(', ')}\`\n`;
        if (weights.length)  md += `**Weights in use:** \`${weights.join(', ')}\`\n`;
        md += `\n`;
    }
    md += `---\n\n`;

    // ── 3. COMPONENTS ─────────────────────────────────────────────────────────
    md += `## 3. Components\n\n`;
    md += generateComponentsBlocks(st);

    if (data.componentVariants && Object.keys(data.componentVariants).length > 0) {
        md += generateVariantsMd(data.componentVariants);
    }

    md += `---\n\n`;

    // ── 4. LAYOUT ─────────────────────────────────────────────────────────────
    md += `## 4. Layout\n\n`;
    let hasLayout = false;
    if (layout.maxWidth) { md += `- **Container max-width:** \`${escMd(layout.maxWidth)}\`\n`; hasLayout = true; }
    if (layout.containerPadding && layout.containerPadding !== '0px') { md += `- **Gutter:** \`${escMd(layout.containerPadding)}\`\n`; hasLayout = true; }
    if (layout.gridColumns) { md += `- **Grid columns:** \`${layout.gridColumns}\` (desktop)\n`; hasLayout = true; }
    if (spaceScale.length) {
        const maxSpace = [...spaceScale].sort((a, b) => a - b).pop();
        md += `- **Section vertical rhythm:** \`${maxSpace}px\` between major sections\n`;
        hasLayout = true;
    }
    if (!hasLayout) md += `No layout constraints detected — use **Create Design System** to capture grid and spacing.\n`;
    md += `\n---\n\n`;

    // ── 5. DEPTH & MOTION ─────────────────────────────────────────────────────
    md += `## 5. Depth & Motion\n\n`;
    if (shadows.length) {
        md += `- **Shadow scale:** ${shadows.length} level(s) — ${shadows.map(s => `\`${escMd(s.value)}\``).join(' / ')}\n`;
    } else {
        md += `- **Shadow scale:** None — flat design system.\n`;
    }
    md += `- **Transition:** \`200ms ease\` (CSS default — not explicitly captured)\n`;
    md += `\n---\n\n`;

    // ── 6. RESPONSIVE ─────────────────────────────────────────────────────────
    md += `## 6. Responsive\n\n`;
    md += `| Breakpoint | Range | Behavior |\n`;
    md += `|------------|-------|----------|\n`;
    if (layout.breakpoints?.length) {
        const bpSorted = [...layout.breakpoints].sort((a, b) => a - b);
        const mobileMax = bpSorted.find(bp => bp >= 400 && bp <= 700) || 640;
        const tabletMax = bpSorted.find(bp => bp >= 900 && bp <= 1200) || 1024;
        md += `| Mobile | \`< ${mobileMax}px\` | Single column, collapsed nav |\n`;
        md += `| Tablet | \`${mobileMax}px – ${tabletMax}px\` | 2-col grid, condensed nav |\n`;
        md += `| Desktop | \`≥ ${tabletMax + 1}px\` | Full layout |\n`;
    } else {
        md += `| Mobile | \`< 640px\` | Single column, collapsed nav |\n`;
        md += `| Tablet | \`640px – 1024px\` | 2-col grid, condensed nav |\n`;
        md += `| Desktop | \`≥ 1025px\` | Full layout |\n`;
    }
    md += `\n---\n\n`;

    // ── 7. PRINCIPLES ─────────────────────────────────────────────────────────
    md += `## 7. Principles\n\n`;
    {
        const principles = [];
        if (texts[0] && bgs[0]) {
            const ratio = computeContrastRatio(texts[0].hex, bgs[0].hex);
            const level = parseFloat(ratio) >= 7 ? 'WCAG AAA' : parseFloat(ratio) >= 4.5 ? 'WCAG AA' : 'below AA — verify';
            principles.push(`${isDark ? 'Dark' : 'Light'}-mode first — canvas \`${bgs[0].hex}\` paired with \`${texts[0].hex}\` text yields **${ratio}:1** contrast (${level}).`);
        }
        if (hasPill) {
            const pillR = sortedRadii.find(r => parseFloat(r.value) >= 500 || r.value === '50%')?.value || '9999px';
            principles.push(`Pill-shaped interactive elements (radius \`${pillR}\`) signal a rounded, approachable aesthetic.`);
        } else if (hasRounding) {
            principles.push(`Consistently rounded corners (radius \`${defaultRadius}\`) create a friendly, modern aesthetic.`);
        }
        if (families.length === 1) {
            principles.push(`Single typeface system (\`${families[0]}\`)${weights.length > 1 ? ` with ${weights.length} weights (${weights.join('/')})` : ''} — hierarchy through weight, not font switching.`);
        } else if (families.length > 1) {
            principles.push(`Dual typeface system: \`${families[0]}\` (display/body) + \`${families[1]}\` (secondary/mono).`);
        }
        if (spaceScale.length > 6) {
            principles.push(`Rich spacing scale (${spaceScale.length} steps, base ${spaceBase}px) enables precise, intentional rhythm.`);
        } else if (spaceScale.length > 0) {
            principles.push(`Focused spacing scale (${spaceScale.length} steps, base ${spaceBase}px) — snap all values to the defined scale.`);
        }
        if (isFlat) {
            principles.push(`Flat design — depth communicated through color contrast alone, not shadows.`);
        } else {
            principles.push(`${shadows.length}-level shadow scale signals elevation hierarchy — reserve higher levels for overlays.`);
        }
        principles.push(`${detectedCount} of ${totalExpected} expected components captured. Run Create DS on additional pages (auth, settings, dashboard) for full coverage.`);
        principles.slice(0, 6).forEach(p => { md += `- ${p}\n`; });
    }
    md += `\n---\n\n`;

    // ── 8. ACCESSIBILITY BASELINE ─────────────────────────────────────────────
    md += `## 8. Accessibility baseline\n\n`;
    if (texts[0] && bgs[0]) {
        const ratio = computeContrastRatio(texts[0].hex, bgs[0].hex);
        const pass  = parseFloat(ratio) >= 4.5 ? '✓ passes' : '✗ fails';
        md += `- **Contrast:** primary text on canvas = \`${ratio}:1\` (${pass} WCAG AA)\n`;
    } else {
        md += `- **Contrast:** — (not enough color data)\n`;
    }
    md += `- **Focus rings:** not captured — verify \`focus-visible\` ring on all interactive elements\n`;
    md += `- **Min tap target:** — (not captured — WCAG 2.2 AA requires 44px)\n`;
    md += `- **Reduced motion:** — (not captured — add \`prefers-reduced-motion\` media query)\n`;
    md += `\n---\n\n`;

    // ── APPENDIX A — RAW CSS VARS ─────────────────────────────────────────────
    const colorVars = cssVars.colors || {};
    const sizeVars  = cssVars.sizes  || {};
    const fontVars  = cssVars.fonts  || {};
    const allVarCount = Object.keys(colorVars).length + Object.keys(sizeVars).length + Object.keys(fontVars).length;

    if (allVarCount > 0) {
        md += `## Appendix A — Raw CSS custom properties\n\n`;
        md += `<details>\n<summary>Click to expand (${allVarCount} variables)</summary>\n\n`;
        md += `\`\`\`css\n`;
        if (Object.keys(colorVars).length) {
            md += `/* Color */\n`;
            for (const [k, v] of Object.entries(colorVars)) md += `${k}: ${v};\n`;
            md += `\n`;
        }
        if (Object.keys(fontVars).length) {
            md += `/* Font */\n`;
            for (const [k, v] of Object.entries(fontVars)) md += `${k}: ${v};\n`;
            md += `\n`;
        }
        if (Object.keys(sizeVars).length) {
            md += `/* Size */\n`;
            for (const [k, v] of Object.entries(sizeVars)) md += `${k}: ${v};\n`;
        }
        md += `\`\`\`\n\n</details>\n\n---\n\n`;
    }

    // ── APPENDIX B — EXTRACTION METADATA ─────────────────────────────────────
    md += `## Appendix B — Extraction metadata\n\n`;
    md += `| Field | Value |\n`;
    md += `|-------|-------|\n`;
    md += `| Extractor version | \`1.0.0\` |\n`;
    md += `| Pages scanned | \`${escMd(data.pageUrl || domain)}\` |\n`;
    md += `| Color-scheme detected | \`${isDark ? 'dark' : 'light'}\` |\n`;
    md += `| Components detected | \`${detectedCount} / ${totalExpected}\` |\n`;
    md += `| Manual overrides via Create DS | \`${dsOverrides}\` |\n`;
    md += `\n`;

    return md;
}

function generateVariantsMd(componentVariants) {
    let md = `---\n\n## 11. Component Variants\n\n`;
    md += `> Components with multiple captured variants. Reference by name when generating UI — e.g. *"use Card Variant 2"* to switch implementations.\n\n`;

    for (const [, { label, variants, activeIndex }] of Object.entries(componentVariants)) {
        md += `### ${escMd(label)}\n`;
        md += `**Default:** Variant ${activeIndex + 1}\n\n`;

        // Collect all unique token keys across all variants
        const allKeys = [...new Set(variants.flatMap(v => Object.keys(v.tokens)))];

        // Header row
        const headers = ['Property', ...variants.map((_, i) =>
            i === activeIndex ? `Variant ${i + 1} *(default)*` : `Variant ${i + 1}`)];
        md += `| ${headers.join(' | ')} |\n`;
        md += `| ${headers.map(() => '---').join(' | ')} |\n`;

        for (const key of allKeys) {
            const rowLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
            const cells = variants.map(v => {
                const val = v.tokens[key];
                return (!val || val === 'none' || val === '0px' || val === 'transparent') ? '—' : escMd(val);
            });
            if (cells.every(c => c === '—')) continue;
            md += `| ${rowLabel} | ${cells.join(' | ')} |\n`;
        }
        md += `\n`;
    }
    return md;
}

function escMd(str) {
    return String(str || '').replace(/\|/g, '\\|');
}

async function handleSignOut() {
    await chrome.storage.local.remove(['plukrr_auth', 'plukrr_access', 'plukrr_usage']);
    if (typeof AccessClient !== 'undefined') await AccessClient.clearCache();
    window.location.reload();
}

// ============================================
// HELPERS
// ============================================

function isSystemPage(url) {
    return !url || url === 'about:blank' ||
        url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
        url.startsWith('about:') || url.startsWith('edge://') || url.startsWith('comet-extension://');
}

function isLightHex(hex) {
    if (!hex || hex.length < 7) return true;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

function weightLabel(w) {
    const n = parseInt(w);
    if (n >= 900) return 'Black';
    if (n >= 700) return 'Bold';
    if (n >= 600) return 'SemiBold';
    if (n >= 500) return 'Medium';
    if (n <= 300) return 'Light';
    return 'Regular';
}

function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
