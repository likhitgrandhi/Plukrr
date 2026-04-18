import { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DUMMY_APPS } from '../../data/apps';
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
  const [selectedApp, setSelectedApp] = useState(DUMMY_APPS[0]);
  const [category, setCategory] = useState('All Categories');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [contentTab, setContentTab] = useState('screenshots'); // 'screenshots' | 'design'
  const [mdView, setMdView] = useState('preview'); // 'preview' | 'raw'
  const mainRef = useRef(null);
  const navigate = useNavigate();

  const filteredApps = useMemo(() => {
    return DUMMY_APPS.filter((app) => {
      const matchesCategory = category === 'All Categories' || app.category === category;
      const matchesSearch =
        app.name.toLowerCase().includes(search.toLowerCase()) ||
        app.tagline.toLowerCase().includes(search.toLowerCase()) ||
        app.category.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

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
        <span className="gallery-logo">Plukrr</span>
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
                <span className="app-list-icon" style={{ background: app.logoColor }}>
                  {app.logoInitial}
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
                <span className="detail-icon" style={{ background: selectedApp.logoColor }}>
                  {selectedApp.logoInitial}
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
