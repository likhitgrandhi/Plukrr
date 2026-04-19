import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DUMMY_APPS } from '../../data/apps';
import './Home.css';

const CYCLE_WORDS = ['Tokens.', 'Time.', 'Effort.'];

function logoTextColor(hex) {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#000' : '#fff';
}

function mdToHtml(md) {
  if (!md) return '';
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^([ \t]*[-*] .+(\n[ \t]+.+)*)/gm, (m) => `<ul>${m.split('\n').filter(l => l.trim()).map(l => `<li>${l.replace(/^[ \t]*[-*] /, '')}</li>`).join('')}</ul>`)
    .replace(/^\|(.+)\|$/gm, (row) => {
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/gs, (m) => `<table>${m}</table>`)
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[htuplc])/gm, '')
    .replace(/<\/p><p>/g, '</p><p>');
}

function AppChip({ app, active, onClick }) {
  return (
    <button
      className={`home-chip${active ? ' home-chip--active' : ''}`}
      onClick={onClick}
    >
      <span
        className="home-chip-icon"
        style={{ background: app.logoColor, color: logoTextColor(app.logoColor) }}
      >
        {app.logoInitial}
      </span>
      <span className="home-chip-name">{app.name}</span>
    </button>
  );
}

function downloadTextAsFile(text, filename) {
  const blob = new Blob([text ?? ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AppDetail({ app }) {
  const [tab, setTab] = useState('screenshots');
  const [mdView, setMdView] = useState('preview');

  useEffect(() => { setTab('screenshots'); setMdView('preview'); }, [app?.id]);

  if (!app) return null;

  return (
    <div className="home-detail">
      <div className="home-detail-top">
        {/* Header */}
        <div className="home-detail-header">
          <span
            className="home-detail-icon"
            style={{ background: app.logoColor, color: logoTextColor(app.logoColor) }}
          >
            {app.logoInitial}
          </span>
          <div className="home-detail-meta">
            <h2 className="home-detail-name">{app.name}</h2>
            <p className="home-detail-tagline">{app.tagline}</p>
            <div className="home-detail-chips">
              {app.platform?.map(p => <span key={p} className="home-detail-chip">{p}</span>)}
              {app.category && <span className="home-detail-chip">{app.category}</span>}
            </div>
          </div>
          <div className="home-detail-actions">
            <button
              type="button"
              className="home-detail-btn-secondary"
              onClick={() => downloadTextAsFile(app.designMd, 'design.md')}
            >
              Download design.md
            </button>
            <button
              type="button"
              className="home-detail-btn-primary"
              onClick={() => navigator.clipboard?.writeText(app.designMd || '')}
            >
              Copy design.md
            </button>
          </div>
        </div>

        {/* Tabs — full-bleed rule; first tab aligns with app icon above */}
        <div className="home-detail-tabs-bleed">
          <div className="home-detail-tabs-grid">
            <div className="home-detail-tabs">
              <button
                type="button"
                className={`home-detail-tab${tab === 'screenshots' ? ' active' : ''}`}
                onClick={() => setTab('screenshots')}
              >
                Screenshots
                <span className="home-detail-tab-count">{app.screenshots?.length || 0}</span>
              </button>
              <button
                type="button"
                className={`home-detail-tab${tab === 'design' ? ' active' : ''}`}
                onClick={() => setTab('design')}
              >
                Design.md
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="home-detail-scroll">
        {/* Screenshots */}
        {tab === 'screenshots' && (
          <div className="home-screenshots-grid">
            {app.screenshots?.map((s, i) => (
              <div key={i} className="home-screenshot-card">
                <img src={s.url} alt={s.caption || `Screenshot ${i + 1}`} />
                {s.caption && <span className="home-screenshot-caption">{s.caption}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Design.md */}
        {tab === 'design' && (
          <div className="home-design-tab">
            <div className="home-md-switcher">
              <button
                type="button"
                className={`home-md-btn${mdView === 'preview' ? ' active' : ''}`}
                onClick={() => setMdView('preview')}
              >Preview</button>
              <button
                type="button"
                className={`home-md-btn${mdView === 'raw' ? ' active' : ''}`}
                onClick={() => setMdView('raw')}
              >Raw</button>
            </div>
            {mdView === 'preview' ? (
              <div
                className="home-md-preview"
                dangerouslySetInnerHTML={{ __html: mdToHtml(app.designMd || '') }}
              />
            ) : (
              <pre className="home-md-raw">{app.designMd}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [wordIdx, setWordIdx] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState(DUMMY_APPS[0]);

  useEffect(() => {
    const prev = { bg: document.body.style.background, color: document.body.style.color };
    document.body.style.background = '#242423';
    document.body.style.color = '#DDDDDD';
    return () => {
      document.body.style.background = prev.bg;
      document.body.style.color = prev.color;
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      setWordVisible(false);
      setTimeout(() => {
        setWordIdx(i => (i + 1) % CYCLE_WORDS.length);
        setWordVisible(true);
      }, 280);
    }, 2400);
    return () => clearInterval(iv);
  }, []);

  const filtered = DUMMY_APPS.filter(a =>
    a.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="home-root">

      {/* ── Nav ── */}
      <header className="home-nav">
        <button type="button" className="home-logo-btn" onClick={() => navigate('/')}>
          <span className="home-logo-text">Plukrr</span>
        </button>
        <nav className="home-nav-links">
          <button type="button" className="home-nav-ghost" onClick={() => navigate('/gallery')}>
            View Gallery
          </button>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="home-hero">

        {/* Left */}
        <div className="home-hero-left">
          <h1 className="home-hero-headline">
            Never waste
            <br />
            <span
              className={`home-hero-word home-hero-word--${wordIdx} ${wordVisible ? 'home-hero-word--in' : 'home-hero-word--out'}`}
            >
              {CYCLE_WORDS[wordIdx]}
            </span>
          </h1>
          <p className="home-hero-sub">
            Plukrr extracts real design tokens from real apps, so your next
            build starts with proven foundations, not guesswork.
          </p>

          {/* Search */}
          <label className="home-search">
            <svg className="home-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder="Search for your favourite app"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </label>

          {/* App chips */}
          <div className="home-chips-scroll">
            {filtered.length > 0 ? (
              <div className="home-chips-grid">
                {filtered.map(app => (
                  <AppChip
                    key={app.id}
                    app={app}
                    active={selectedApp?.id === app.id}
                    onClick={() => setSelectedApp(app)}
                  />
                ))}
              </div>
            ) : (
              <p className="home-chips-empty">No apps match "{query}"</p>
            )}
          </div>
        </div>

        {/* Right — app detail card */}
        <div className="home-hero-right">
          <AppDetail app={selectedApp} />
        </div>

      </section>
    </div>
  );
}
