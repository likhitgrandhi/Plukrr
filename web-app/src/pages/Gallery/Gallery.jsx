import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DUMMY_APPS } from '../../data/apps';
import { getPublishedApps } from '../../data/appStore';
import './Gallery.css';

const CATEGORIES = [
  'All Categories',
  'Productivity',
  'Design',
  'Developer Tools',
  'Finance',
  'Communication',
  'Utilities',
  'Entertainment',
  'Health & Fitness',
  'Social',
  'Education',
  'Shopping',
];

function formatInline(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (line.startsWith('# ')) {
      html += `<h1>${formatInline(line.slice(2))}</h1>`;
      i++;
    } else if (line.startsWith('## ')) {
      html += `<h2>${formatInline(line.slice(3))}</h2>`;
      i++;
    } else if (line.startsWith('### ')) {
      html += `<h3>${formatInline(line.slice(4))}</h3>`;
      i++;
    } else if (trimmed.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter((l) => !/^\|[\s\-|]+\|$/.test(l.trim()));
      if (rows.length > 0) {
        const parseRow = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
        const [header, ...body] = rows;
        const headers = parseRow(header);
        html += '<table>';
        html += `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
        if (body.length > 0) {
          html += `<tbody>${body
            .map((r) => `<tr>${parseRow(r).map((c) => `<td>${c}</td>`).join('')}</tr>`)
            .join('')}</tbody>`;
        }
        html += '</table>';
      }
    } else if (trimmed === '') {
      i++;
    } else {
      html += `<p>${formatInline(line)}</p>`;
      i++;
    }
  }

  return html;
}

export default function Gallery() {
  const [allApps] = useState(() => [...DUMMY_APPS, ...getPublishedApps()]);
  const [selectedApp, setSelectedApp] = useState(() => allApps[0]);
  const [category, setCategory] = useState('All Categories');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [contentTab, setContentTab] = useState('screenshots'); // 'screenshots' | 'design'
  const [mdView, setMdView] = useState('preview'); // 'preview' | 'raw'
  const mainRef = useRef(null);
  const navigate = useNavigate();

  const filteredApps = useMemo(() => {
    return allApps.filter((app) => {
      const matchesCategory = category === 'All Categories' || app.category === category;
      const matchesSearch =
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.tagline.toLowerCase().includes(search.toLowerCase()) ||
        app.category.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [allApps, category, search]);

  function handleSelectApp(app) {
    setSelectedApp(app);
    setContentTab('screenshots');
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }

  async function handleCopy() {
    if (!selectedApp) return;
    try {
      await navigator.clipboard.writeText(selectedApp.designMd);
    } catch {
      const el = document.createElement('textarea');
      el.value = selectedApp.designMd;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    if (!selectedApp) return;
    const blob = new Blob([selectedApp.designMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedApp.slug}-design.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="gallery-root">
      {/* Top Nav */}
      <header className="gallery-topnav">
        <button className="gallery-logo" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex', alignItems: 'center' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 50" height="40" aria-label="Plukrr">
            <path fill="currentColor" d="m2 4.7h16.1c8.8 0 16.3 3.8 16.3 13.2 0 6.7-4.1 13.4-14.4 13.4h-6v5.3c0 3.9 0.7 6.5 2.4 8.8 0.3 0.5 0.3 1.1-0.2 1.1h-13.8c-0.5 0.1-0.5-0.6-0.2-1.1 1.6-2.6 2.2-5.5 2.2-8.8v-21.9c0-3.6-0.8-6.3-2.2-8.7-0.3-0.7-0.3-1.3-0.2-1.3zm12 3.2v20.2h2.5c4.3 0 6.8-3.3 6.8-10.2 0-6.2-2.7-10-7-10h-2.3z"/>
            <path fill="currentColor" d="m35.4 5.9 11.4-3.9c0.7-0.2 0.8 0.1 0.8 0.6v34.8c0 3.8 0.5 5.9 1.9 8.2 0.3 0.5 0.2 0.9-0.2 0.9h-13.7c-0.5 0-0.5-0.4-0.2-0.9 1.1-2.2 1.8-4.8 1.8-8.2v-23c0-3.6-0.7-5.5-2.1-7.5-0.4-0.4-0.2-0.9 0.3-1z"/>
            <path fill="currentColor" d="m50.4 18.2 12.1-2.3c0.5-0.1 0.5 0.3 0.4 0.7v19c0.1 4.5 1.4 6.2 3.5 6.2 2 0 3.8-2.3 3.8-4.8v-11c0-2.6-0.8-5.1-2.3-6.8-0.3-0.5-0.1-0.8 0.3-0.9l11.4-2.4c0.5-0.1 0.6 0.2 0.6 0.6v20.2c0 2.7 0.8 4.9 2.2 6.3 0.4 0.5 0.3 0.8-0.2 1l-9.3 3.2c-0.5 0.2-0.8 0.1-0.9-0.4l-1.1-5.4c-1.8 3.2-4.6 5.9-8.9 5.9-5.6 0-9.5-3.5-9.5-11.1v-9.4c0-3.6-0.6-5.5-2.2-7.7-0.3-0.4-0.3-0.8 0.1-0.9z"/>
            <path fill="currentColor" d="m83.8 5.9 11.1-3.9c0.7-0.2 0.9 0 0.9 0.6v28.7l6.6-6.3c1.2-1.2 1.6-2.2 1.6-3.6 0-1.3-0.6-2.5-1.6-3.7-0.3-0.3 0-0.8 0.4-0.8h11.9c0.7 0 0.9 0.7 0 1.2-2.4 1.1-6.1 4.5-10.6 8.5l5.5 9.4c2.7 4.5 4.8 7.6 7 9.2 0.7 0.5 0.6 1.3 0.1 1.3h-8.1c-3.6 0-5.3-1.1-6.9-3.7l-5.8-9.9v5c0 3.4 0.7 5.5 1.9 7.7 0.4 0.5 0.1 0.9-0.2 0.9h-13.4c-0.4 0-0.5-0.5-0.2-1 1.2-2.1 1.7-4.3 1.7-7.6v-22.6c0-4.3-0.5-6.4-2.2-8.5-0.4-0.4-0.1-0.8 0.3-0.9z"/>
            <path fill="currentColor" d="m117.3 19.6 10.3-3.5c0.8-0.3 1 0.1 1.1 0.6l0.3 6.3c1.5-3.8 4.2-7.1 8.2-7.1 3.2 0 5.7 1.8 5.8 5.1 0.1 3-2.1 6.6-5 6.6-0.7 0-2.1-0.1-2.1-0.9-0.1-1.6-1-3.7-2.8-3.6-2.1 0.2-3.3 2.4-3.3 6.3v8.9c0 3.1 0.7 5.5 2.2 7.3 0.4 0.6 0.4 0.9 0 1h-14c-0.4 0-0.4-0.6 0-1.3 1.1-1.9 1.5-4.3 1.5-7v-10.1c0-3.6-0.9-5.6-2.4-7.7-0.3-0.4-0.3-0.7 0.2-0.9z"/>
            <path fill="currentColor" d="m144.2 19.4 9.8-3.4c0.5-0.1 1-0.1 1.1 0.7l0.4 6.5c1.5-3.8 4.1-7.2 8-7.3 3.1-0.1 5.3 1.9 5.4 4.9 0 2.8-2 6.8-4.9 6.8-0.6 0-2-0.1-2-0.8-0.1-1.7-1-3.8-2.8-3.7-2.3 0.1-3 2.5-2.9 6.3v9.3c0 3.1 0.6 5.2 2 6.8 0.3 0.4 0.2 1-0.2 1h-13.4c-0.5 0-0.6-0.4-0.2-1.1 1.1-2 1.9-4.3 1.9-7.5v-10.1c0-2.9-0.8-5-2.5-7.3-0.5-0.6-0.3-0.8 0.3-1.1z"/>
          </svg>
        </button>
        <div className="gallery-nav-right">
          <button className="gallery-new-btn" onClick={() => navigate('/admin/new')}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            New app
          </button>
          <button className="gallery-signin">Sign in</button>
        </div>
      </header>

      {/* Body */}
      <div className="gallery-body">
        {/* Sidebar */}
        <aside className="gallery-sidebar">
          <div className="sidebar-top">
            <div className="sidebar-search-wrap">
              <span className="sidebar-search-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
              <input
                className="sidebar-search"
                type="text"
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="category-select-wrap">
              <select
                className="category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <span className="select-caret">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>

          <div className="sidebar-list">
            {filteredApps.length > 0 && (
              <p className="sidebar-count">{filteredApps.length} apps</p>
            )}
            {filteredApps.length === 0 && (
              <p className="sidebar-empty">No apps found</p>
            )}
            {filteredApps.map((app) => (
              <button
                key={app.id}
                className={`app-list-item ${selectedApp?.id === app.id ? 'selected' : ''}`}
                onClick={() => handleSelectApp(app)}
              >
                <span className="app-list-icon" style={{ background: app.logoImage ? 'transparent' : app.logoColor }}>
                  {app.logoImage
                    ? <img src={app.logoImage} alt={app.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    : app.logoInitial}
                </span>
                <span className="app-list-meta">
                  <span className="app-list-name">{app.name}</span>
                  <span className="app-list-category">{app.category}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main Panel */}
        <main className="gallery-main" ref={mainRef}>
          {!selectedApp ? (
            <div className="gallery-empty-state">
              <p>Select an app to view its design system</p>
            </div>
          ) : (
            <div className="detail-view">
              {/* Header — icon + info left, actions right */}
              <div className="detail-header">
                <span className="detail-icon" style={{ background: selectedApp.logoImage ? 'transparent' : selectedApp.logoColor }}>
                  {selectedApp.logoImage
                    ? <img src={selectedApp.logoImage} alt={selectedApp.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                    : selectedApp.logoInitial}
                </span>
                <div className="detail-info">
                  <h1 className="detail-name">{selectedApp.name}</h1>
                  <p className="detail-tagline">{selectedApp.tagline}</p>
                  <div className="detail-chips">
                    {selectedApp.platform.map((p) => (
                      <span key={p} className="platform-chip">{p}</span>
                    ))}
                    <span className="platform-chip">{selectedApp.category}</span>
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="action-btn action-btn-secondary" onClick={handleDownload}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v8m0 0l-3-3m3 3l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    Download .md
                  </button>
                  <button className="action-btn action-btn-primary" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                          <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Copy design.md
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Content tabs */}
              <div className="content-tabs">
                <button
                  className={`content-tab ${contentTab === 'screenshots' ? 'active' : ''}`}
                  onClick={() => setContentTab('screenshots')}
                >
                  Screenshots
                  <span className="tab-count">{selectedApp.screenshots.length}</span>
                </button>
                <button
                  className={`content-tab ${contentTab === 'design' ? 'active' : ''}`}
                  onClick={() => setContentTab('design')}
                >
                  Design.md
                </button>
              </div>

              {/* Tab content */}
              {contentTab === 'screenshots' && (
                <div className="screenshots-grid">
                  {selectedApp.screenshots.map((s, i) => (
                    <div key={i} className="screenshot-card">
                      <img src={s.url} alt={s.caption || `Screenshot ${i + 1}`} loading="lazy" />
                      {s.caption && <span className="screenshot-caption">{s.caption}</span>}
                    </div>
                  ))}
                </div>
              )}

              {contentTab === 'design' && (
                <div className="design-tab-content">
                  <div className="design-tab-toolbar">
                    <div className="md-switcher">
                      <button
                        className={`md-tab ${mdView === 'preview' ? 'active' : ''}`}
                        onClick={() => setMdView('preview')}
                      >
                        Preview
                      </button>
                      <button
                        className={`md-tab ${mdView === 'raw' ? 'active' : ''}`}
                        onClick={() => setMdView('raw')}
                      >
                        Raw
                      </button>
                    </div>
                  </div>

                  {mdView === 'preview' ? (
                    <div
                      className="md-preview"
                      dangerouslySetInnerHTML={{ __html: mdToHtml(selectedApp.designMd) }}
                    />
                  ) : (
                    <pre className="design-md-block">{selectedApp.designMd}</pre>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
