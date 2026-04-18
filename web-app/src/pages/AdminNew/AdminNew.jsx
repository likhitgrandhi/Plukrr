import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminNew.css';

const CATEGORIES = [
  'Productivity', 'Design', 'Developer Tools', 'Finance',
  'Communication', 'Utilities', 'Entertainment', 'Health & Fitness',
  'Social', 'Education', 'Shopping',
];

const PLATFORMS = ['Web', 'iOS', 'Android'];

const LOGO_COLORS = [
  '#5E6AD2', '#000000', '#F24E1E', '#635BFF',
  '#E01C73', '#625DF5', '#FF6B6B', '#FF6363',
  '#007AFF', '#09825D', '#BB5504', '#6B7280',
];

export default function AdminNew() {
  const navigate = useNavigate();
  const screenshotInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const mdFileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    tagline: '',
    description: '',
    logoFile: null,
    logoPreview: null,
    logoColor: '#5E6AD2',
    platforms: [],
    category: '',
    status: 'draft',
    badge: '',
    screenshots: [],
    mdMode: 'paste',
    mdFile: null,
    mdFileName: '',
    mdContent: '',
  });

  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function togglePlatform(p) {
    set('platforms', form.platforms.includes(p)
      ? form.platforms.filter((x) => x !== p)
      : [...form.platforms, p]);
  }

  function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    set('logoFile', file);
    set('logoPreview', URL.createObjectURL(file));
  }

  function handleScreenshotsUpload(e) {
    const files = Array.from(e.target.files);
    const newScreenshots = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
    }));
    set('screenshots', [...form.screenshots, ...newScreenshots]);
    e.target.value = '';
  }

  function removeScreenshot(id) {
    set('screenshots', form.screenshots.filter((s) => s.id !== id));
  }

  function updateCaption(id, caption) {
    set('screenshots', form.screenshots.map((s) => s.id === id ? { ...s, caption } : s));
  }

  function handleMdFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    set('mdFile', file);
    set('mdFileName', file.name);
    const reader = new FileReader();
    reader.onload = (ev) => set('mdContent', ev.target.result);
    reader.readAsText(file);
  }

  function handleDropScreenshots(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const newScreenshots = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      caption: '',
    }));
    set('screenshots', [...form.screenshots, ...newScreenshots]);
  }

  async function handleSubmit(publishStatus) {
    setPublishing(true);
    await new Promise((r) => setTimeout(r, 800)); // simulated save
    setSaved(true);
    setPublishing(false);
    setTimeout(() => navigate('/'), 1000);
  }

  const logoInitial = form.name.trim().charAt(0).toUpperCase() || '?';
  const isValid = form.name.trim() && form.tagline.trim();

  return (
    <div className="admin-root">
      {/* Sticky top bar */}
      <header className="admin-topbar">
        <div className="admin-topbar-left">
          <button className="admin-back-btn" onClick={() => navigate('/')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Apps
          </button>
          <span className="admin-topbar-divider" />
          <span className="admin-topbar-title">New Listing</span>
        </div>
        <div className="admin-topbar-right">
          <button
            className="admin-btn admin-btn-secondary"
            onClick={() => handleSubmit('draft')}
            disabled={!isValid || publishing || saved}
          >
            Save as Draft
          </button>
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => handleSubmit('active')}
            disabled={!isValid || publishing || saved}
          >
            {saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Published!
              </>
            ) : publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

      {/* Scrollable body */}
      <div className="admin-body">
        <div className="admin-content">
          <div className="admin-grid">

            {/* ── Left column ── */}
            <div className="admin-main">

              {/* App Identity */}
              <section className="admin-card">
                <p className="admin-section-label">App Identity</p>
                <div className="admin-field">
                  <label className="admin-label" htmlFor="name">App Name <span className="admin-required">*</span></label>
                  <input
                    id="name"
                    className="admin-input admin-input-lg"
                    type="text"
                    placeholder="e.g. Linear"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label" htmlFor="tagline">Tagline <span className="admin-required">*</span></label>
                  <input
                    id="tagline"
                    className="admin-input"
                    type="text"
                    placeholder="A short one-liner describing the app"
                    value={form.tagline}
                    onChange={(e) => set('tagline', e.target.value)}
                  />
                </div>
              </section>

              {/* Description */}
              <section className="admin-card">
                <p className="admin-section-label">Description</p>
                <div className="admin-field">
                  <label className="admin-label" htmlFor="description">Full Description</label>
                  <textarea
                    id="description"
                    className="admin-textarea"
                    placeholder="Describe what this app does and who it's for…"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    rows={5}
                  />
                </div>
              </section>

              {/* Screenshots */}
              <section className="admin-card">
                <div className="admin-section-header">
                  <p className="admin-section-label">Screenshots</p>
                  {form.screenshots.length > 0 && (
                    <button
                      className="admin-add-btn"
                      onClick={() => screenshotInputRef.current?.click()}
                    >
                      + Add more
                    </button>
                  )}
                </div>

                {form.screenshots.length === 0 ? (
                  <div
                    className="admin-dropzone"
                    onClick={() => screenshotInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDropScreenshots}
                  >
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                      <rect x="3" y="3" width="26" height="26" rx="6" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M16 10v12M10 16h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <p className="admin-dropzone-title">Drop images here or click to browse</p>
                    <p className="admin-dropzone-sub">PNG, JPG, WebP — up to 10MB each</p>
                  </div>
                ) : (
                  <div className="admin-screenshot-grid">
                    {form.screenshots.map((s) => (
                      <div key={s.id} className="admin-screenshot-item">
                        <img src={s.preview} alt="" />
                        <button className="admin-remove-btn" onClick={() => removeScreenshot(s.id)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                        <input
                          className="admin-caption-input"
                          type="text"
                          placeholder="Caption…"
                          value={s.caption}
                          onChange={(e) => updateCaption(s.id, e.target.value)}
                        />
                      </div>
                    ))}
                    {/* Ghost "add" tile */}
                    <div
                      className="admin-screenshot-add"
                      onClick={() => screenshotInputRef.current?.click()}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                )}

                <input
                  ref={screenshotInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleScreenshotsUpload}
                />
              </section>

              {/* Design System */}
              <section className="admin-card">
                <p className="admin-section-label">Design System</p>
                <div className="admin-md-toggle">
                  <button
                    className={`admin-md-tab ${form.mdMode === 'paste' ? 'active' : ''}`}
                    onClick={() => set('mdMode', 'paste')}
                  >
                    Paste
                  </button>
                  <button
                    className={`admin-md-tab ${form.mdMode === 'upload' ? 'active' : ''}`}
                    onClick={() => set('mdMode', 'upload')}
                  >
                    Upload file
                  </button>
                </div>

                {form.mdMode === 'paste' ? (
                  <textarea
                    className="admin-textarea admin-textarea-mono"
                    placeholder="Paste your design.md content here…"
                    value={form.mdContent}
                    onChange={(e) => set('mdContent', e.target.value)}
                    rows={10}
                  />
                ) : (
                  <div>
                    {form.mdFileName ? (
                      <div className="admin-file-attached">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="admin-file-name">{form.mdFileName}</span>
                        <button
                          className="admin-remove-text"
                          onClick={() => { set('mdFile', null); set('mdFileName', ''); set('mdContent', ''); }}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div
                        className="admin-dropzone admin-dropzone-sm"
                        onClick={() => mdFileInputRef.current?.click()}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p className="admin-dropzone-title">Upload design.md</p>
                        <p className="admin-dropzone-sub">.md or .txt</p>
                      </div>
                    )}
                    <input
                      ref={mdFileInputRef}
                      type="file"
                      accept=".md,.txt,text/markdown,text/plain"
                      style={{ display: 'none' }}
                      onChange={handleMdFile}
                    />
                  </div>
                )}
              </section>
            </div>

            {/* ── Right sidebar ── */}
            <div className="admin-sidebar">

              {/* App Icon */}
              <section className="admin-card">
                <p className="admin-section-label">App Icon</p>
                <div className="admin-icon-row">
                  <div
                    className="admin-icon-preview"
                    style={{ background: form.logoPreview ? 'transparent' : form.logoColor }}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {form.logoPreview
                      ? <img src={form.logoPreview} alt="logo" />
                      : <span>{logoInitial}</span>}
                    <div className="admin-icon-overlay">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4v12M4 10h12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  <div className="admin-icon-meta">
                    <p className="admin-icon-hint">Click to upload logo</p>
                    <p className="admin-icon-sub">PNG, JPG, SVG — 512×512px recommended</p>
                    {form.logoPreview && (
                      <button
                        className="admin-remove-text"
                        onClick={() => { set('logoFile', null); set('logoPreview', null); }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {!form.logoPreview && (
                  <div className="admin-field" style={{ marginTop: 16 }}>
                    <label className="admin-label">Fallback colour</label>
                    <div className="admin-color-grid">
                      {LOGO_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`admin-color-swatch ${form.logoColor === c ? 'selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => set('logoColor', c)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
              </section>

              {/* Classification */}
              <section className="admin-card">
                <p className="admin-section-label">Classification</p>
                <div className="admin-field">
                  <label className="admin-label">Category</label>
                  <div className="admin-select-wrap">
                    <select
                      className="admin-select"
                      value={form.category}
                      onChange={(e) => set('category', e.target.value)}
                    >
                      <option value="">Select a category…</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <span className="admin-select-caret">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
                <div className="admin-field">
                  <label className="admin-label">Platform</label>
                  <div className="admin-checkbox-group">
                    {PLATFORMS.map((p) => (
                      <label key={p} className="admin-checkbox-label">
                        <input
                          type="checkbox"
                          className="admin-checkbox"
                          checked={form.platforms.includes(p)}
                          onChange={() => togglePlatform(p)}
                        />
                        <span className="admin-checkbox-custom" />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              {/* Publishing */}
              <section className="admin-card">
                <p className="admin-section-label">Publishing</p>
                <div className="admin-field">
                  <label className="admin-label">Status</label>
                  <div className="admin-radio-group">
                    {['draft', 'active'].map((s) => (
                      <label key={s} className={`admin-radio-label ${form.status === s ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="status"
                          value={s}
                          checked={form.status === s}
                          onChange={() => set('status', s)}
                          style={{ display: 'none' }}
                        />
                        {s === 'draft' ? 'Draft' : 'Active'}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="admin-field">
                  <label className="admin-label">Badge</label>
                  <div className="admin-select-wrap">
                    <select
                      className="admin-select"
                      value={form.badge}
                      onChange={(e) => set('badge', e.target.value)}
                    >
                      <option value="">No badge</option>
                      <option value="new">New</option>
                      <option value="updated">Updated</option>
                    </select>
                    <span className="admin-select-caret">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
