# Design System Extract (v2) — Plukrr Web App

**Source:** `Plukrr/web-app` (Vite + React). **Extraction method:** authored CSS (`index.css`, `Login.css`, `Dashboard.css`) and JSX structure.

**Value semantics:** Every field uses one of: a **measured/token value**, **`unknown`** (property is relevant but not detected in DOM/CSS), or **`not_applicable`** (property does not apply to this component or surface). The ambiguous placeholder symbol is not used.

***

## Value policy: `unknown` vs `not_applicable`

| Situation | Use |
|-----------|-----|
| Style or token should exist in a full audit but was not found in extracted sources | `unknown` |
| Slot, state, or metric does not exist for this component (e.g. no right icon on this button) | `not_applicable` |
| Product does not implement a feature (e.g. no dark theme variables in repo) | `not_applicable` *or* `unknown` per row notes: dark palette row uses `not_applicable` (no dark implementation in source) |

***

## 1. Visual Theme & Tokens

**Token** · **Value** · **Notes**

* `theme.name` · `Plukrr Web App` · comment in `index.css` (“Warm, premium, clean”)
* `color.surface.page` · `#f7f5f2` · `:root` `--bg`
* `color.surface.card` · `#ffffff` · `:root` `--card`
* `color.border.default` · `#e8e4de` · `:root` `--line`
* `color.text.primary` · `#1a1714` · `:root` `--text`
* `color.text.muted` · `#8a857d` · `:root` `--muted`
* `color.action.accent` · `#ff5b7f` · `:root` `--accent`
* `shadow.elevation.card` · `0 2px 12px rgba(0, 0, 0, 0.04)` · `:root` `--shadow`
* `font.family.sans` · `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` · `:root` `--font`
* `font.family.logo` · `'Nanum Pen Script', sans-serif` · `.logo-text`, `.dash-logo`
* `motion.transition.default` · `all 0.15s ease` · buttons, inputs, feature cards
* `motion.transition.slow` · `border-color 0.2s ease` · `.pricing-card`
* `theme.dark.palette` · `not_applicable` · no dark theme variables in extracted files

***

## 2. Color System

**Semantic mapping (same hex → same token)**

* `#f7f5f2` → `color.surface.page`
* `#ffffff` → `color.surface.card`
* `#e8e4de` → `color.border.default`
* `#1a1714` → `color.text.primary`
* `#8a857d` → `color.text.muted`
* `#ff5b7f` → `color.action.accent`
* `#d6cec2` → `color.border.focus`
* `#c5bfb6` → `color.text.placeholder`
* `rgba(255, 91, 127, 0.08)` → `color.focus.ring.subtle`
* `rgba(255, 91, 127, 0.12)` → `color.focus.ring.otp`
* `rgba(0, 0, 0, 0.04)` → component of `shadow.elevation.card`

***

## 3. Typography

**Token** · **Spec** · **Where / notes**

* `type.family.body` · `font.family.sans` · `body`
* `type.family.brand` · `font.family.logo` · Google Fonts: Nanum Pen Script + Inter weights 400 to 700
* `type.size.11` · `11px` · `.pricing-badge`, `.status-badge`
* `type.size.12` · `12px` · `.email-display-label`, `.tier-badge`
* `type.size.13` · `13px` · `.form-label`, `.feature-desc`, `.plan-row`, `.ext-hint`
* `type.size.14` · `14px` · secondary body
* `type.size.15` · `15px` · `.form-input`, `.account-email`, `.btn-primary`
* `type.size.16` · `16px` · `.otp-input`, `.pricing-name`
* `type.size.18` · `18px` · `.feature-icon`, `.section-title`
* `type.size.20` · `20px` · `.account-avatar` initial
* `type.size.22` · `22px` · `.success-title`
* `type.size.26` · `26px` · `.login-title`
* `type.size.32` · `32px` · `.price-amount`
* `type.size.34` · `34px` · `.dash-logo`
* `type.size.38` · `38px` · `.logo-text`
* `type.size.40` · `40px` · `.success-icon` glyph
* `type.weight.500` · `500` · labels, secondary buttons
* `type.weight.600` · `600` · titles, primary buttons, badges
* `type.weight.700` · `700` · logo, prices
* `type.lineHeight.body` · `1.5` · `body`
* `type.lineHeight.tight` · `1` · `.price-amount`, `.logo-text`
* `type.lineHeight.loginTitle` · `34px` · `.login-title`
* `type.lineHeight.loginSubtitle` · `21px` · `.login-subtitle`, `.success-text`

***

## 4. Component System

**Component** · **Role** · **Primary classes**

* Primary button · main CTA · `.btn-primary`
* Secondary button · alternate action · `.btn-secondary`
* Ghost button · tertiary · `.btn-ghost`
* Text link button · inline action · `.link-btn`
* Text field · single line · `.form-input`, `.form-label`, `.form-group`
* OTP field · six cells · `.otp-input`, `.otp-container`
* Spinner · loading · `.spinner`
* Card · surface · `.login-card`, `.dash-card`
* Feature row · list item · `.feature-card`
* Pricing column · plan · `.pricing-card`
* Badge · tier/status · `.tier-badge`, `.status-badge`, `.pricing-badge`
* Toast / banner · checkout success · `.checkout-success`
* Error surface · inline message · `.error-msg`

***

## 5. Component States (full matrices)

Convention: `not_applicable` = no such slot or no such interaction in this product’s styles; `unknown` = relevant but not found in extracted CSS/JSX.

### Button.Primary (`.btn-primary`)

| Property | Value |
|----------|--------|
| container.display | `flex` |
| container.alignItems | `center` |
| container.justifyContent | `center` |
| container.gap | `8px` |
| default.background | `color.text.primary` (`#1a1714`) |
| default.color | `color.surface.page` |
| default.height | `48px` |
| default.paddingInline | `24px` |
| default.borderRadius | `12px` |
| default.fontSize | `15px` |
| default.fontWeight | `600` |
| default.border | `none` |
| default.cursor | `pointer` |
| default.transition | `all 0.15s ease` |
| hover.background | `unknown` (opacity applied to whole element, not separate bg) |
| hover.opacity | `0.85` |
| hover.transform | `translateY(-1px)` |
| active.background | `unknown` |
| active.transform | `translateY(0)` |
| focus.background | `unknown` |
| focus.outline | `unknown` |
| focus.boxShadow | `unknown` |
| focus-visible.ring | `unknown` |
| focus-visible.outline | `unknown` |
| disabled.opacity | `0.5` |
| disabled.cursor | `not-allowed` |
| disabled.background | `unknown` (same as default with opacity) |
| loading.content | spinner replaces label text (JSX) |
| loading.spinner.color.ring | `color.border.default` |
| loading.spinner.color.accent | `color.action.accent` (top border) |
| error.border | `not_applicable` (no error variant in CSS) |
| error.background | `not_applicable` |
| slot.leadingIcon | `not_applicable` (not in CSS/markup) |
| slot.trailingIcon | `not_applicable` |
| slot.label | text node or loading spinner |

### Button.Secondary (`.btn-secondary`)

| Property | Value |
|----------|--------|
| default.height | `40px` |
| default.paddingInline | `16px` |
| default.fontSize | `14px` |
| default.fontWeight | `500` |
| default.background | `none` |
| default.color | `color.text.muted` |
| default.border | `1px solid color.border.default` |
| default.borderRadius | `10px` |
| hover.borderColor | `#d6cec2` |
| hover.color | `color.text.primary` |
| hover.background | `unknown` |
| active | `unknown` |
| focus-visible | `unknown` |
| disabled | `unknown` (no `:disabled` rules in CSS) |
| loading | `not_applicable` (no spinner usage in JSX for this class) |
| error | `not_applicable` |
| slot.leadingIcon | `not_applicable` |
| slot.trailingIcon | `not_applicable` |

### Button.Ghost (`.btn-ghost`)

| Property | Value |
|----------|--------|
| default.background | `none` |
| default.border | `none` |
| default.color | `color.text.muted` |
| default.fontSize | `14px` |
| default.fontWeight | `500` |
| default.padding | `8px 12px` |
| default.borderRadius | `8px` |
| hover.background | `color.border.default` |
| hover.color | `color.text.primary` |
| active | `unknown` |
| focus-visible | `unknown` |
| disabled | `unknown` |
| loading | `not_applicable` |
| error | `not_applicable` |
| slot.icon | `not_applicable` |

### Link button (`.link-btn`)

| Property | Value |
|----------|--------|
| default.color | `color.text.primary` |
| default.textDecoration | underline |
| default.fontSize | `14px` |
| hover.color | `color.action.accent` |
| disabled.opacity | `0.5` |
| disabled.cursor | `not-allowed` |
| active | `unknown` |
| focus-visible | `unknown` |
| loading | `not_applicable` |
| error | `not_applicable` |

### Input.Text (`.form-input`)

| Property | Value |
|----------|--------|
| default.padding | `12px 16px` |
| default.fontSize | `15px` |
| default.background | `color.surface.card` |
| default.border | `1px solid color.border.default` |
| default.borderRadius | `12px` |
| default.color | `color.text.primary` |
| default.transition | `all 0.15s ease` |
| hover | `unknown` (no `:hover` in CSS) |
| active | `unknown` |
| focus.borderColor | `#d6cec2` |
| focus.boxShadow | `0 0 0 3px rgba(255, 91, 127, 0.08)` |
| focus-visible | `unknown` (only `:focus` defined) |
| disabled.opacity | `0.6` |
| disabled.cursor | `not-allowed` |
| loading | `not_applicable` (input not replaced by loader in CSS) |
| error.border | `unknown` (errors use `.error-msg`; input border unchanged) |
| error.background | `unknown` |
| placeholder.color | `color.text.placeholder` |
| slot.leadingIcon | `not_applicable` |
| slot.trailingIcon | `not_applicable` |

### Input.OTP (`.otp-input`)

| Property | Value |
|----------|--------|
| default.width | `46px` |
| default.height | `42px` |
| default.textAlign | `center` |
| default.fontSize | `16px` |
| default.fontWeight | `600` |
| default.border | `1px solid color.border.default` |
| default.borderRadius | `12px` |
| hover | `unknown` |
| active | `unknown` |
| focus.borderColor | `#d6cec2` |
| focus.boxShadow | `0 0 0 3px rgba(255, 91, 127, 0.12)` |
| focus-visible | `unknown` |
| disabled.opacity | `0.6` |
| loading | `not_applicable` |
| error.perCell | `unknown` (no per cell error style) |
| slot.icon | `not_applicable` |

### Card.Pricing (`.pricing-card`)

| Property | Value |
|----------|--------|
| default.border | `1px solid color.border.default` |
| default.borderRadius | `16px` |
| default.padding | `24px 20px` |
| default.transition | `border-color 0.2s ease` |
| highlighted.borderColor | `color.action.accent` |
| current.opacity | `0.7` |
| hover | `not_applicable` (no `:hover` rule in CSS; no styled hover behavior) |
| focus | `not_applicable` (not a focusable card) |
| active | `not_applicable` |
| disabled | `not_applicable` |
| loading | `not_applicable` |
| error | `not_applicable` |

### FeatureCard (`.feature-card`)

| Property | Value |
|----------|--------|
| default.padding | `16px 20px` |
| default.borderRadius | `14px` |
| default.transition | `all 0.15s ease` |
| locked.opacity | `0.55` |
| hover | `not_applicable` (no `:hover` in CSS) |
| focus | `not_applicable` |
| error | `not_applicable` |

### Spinner (`.spinner`)

| Property | Value |
|----------|--------|
| size | `18px` × `18px` |
| border | `2px solid color.border.default` |
| borderTopColor | `color.action.accent` |
| animation | `spin 0.6s linear infinite` |
| hover | `not_applicable` |
| disabled | `not_applicable` |

***

## 6. Component Anatomy

### Button.Primary

* **container** · `<button class="btn-primary">`
* **label** · text or loading spinner
* **loader** · `<span class="spinner" />`
* **leading-icon** · `not_applicable`
* **trailing-icon** · `not_applicable`

### Button.Secondary / Ghost / Link

* **container** · `<button>` or link-styled control
* **label** · text only
* **leading-icon** · `not_applicable`
* **trailing-icon** · `not_applicable`

### Input.Text

* **container** · `.form-group` (flex column)
* **label** · `.form-label` (static, above field)
* **field** · `.form-input`
* **placeholder** · `::placeholder` → `color.text.placeholder`
* **helper-text** · `not_applicable` (no helper element in source)
* **error-text** · `.error-msg` (sibling block, not inside field)

### Input.OTP

* **container** · `.otp-container`
* **field** · six `.otp-input`
* **per-cell-label** · `not_applicable`
* **group-label** · section title + subtitle only (not a formal `<label>` for each cell)

### PricingCard

* **container** · `.pricing-card`
* **badge** · `.pricing-badge` (optional)
* **header** · `.pricing-header` → `.pricing-name`, `.pricing-price`
* **price-amount** · `.price-amount`
* **price-period** · `.price-period`
* **features** · `ul.pricing-features`
* **action** · `.btn-primary` or `.btn-current`

### Account card

* **container** · `.dash-card.account-card`
* **avatar** · `.account-avatar`
* **details** · `.account-details` → `.account-email`, `.account-tier`

***

## 7. Layout Hierarchy

```
App
└── AuthProvider
    └── BrowserRouter
        └── Routes
            ├── /login → Login
            │   └── .login-page
            │       └── .login-container
            │           ├── .login-card
            │           │   ├── .logo (.logo-text, .logo-tagline)
            │           │   └── .login-step | .success-step
            │           │       ├── headings, .error-msg
            │           │       ├── form (.form-group, .btn-primary, .otp-container, .link-btn, .btn-secondary)
            │           │       └── .success-icon, titles
            │           └── .ext-hint
            └── /dashboard → Dashboard
                └── .dash-page
                    └── .dash-container
                        ├── header.dash-header (.dash-logo, .btn-ghost)
                        ├── section.dash-section Account (.dash-card.account-card)
                        ├── section.dash-section Features (.features-grid → .feature-card × n)
                        ├── section.dash-section Pricing (.pricing-grid → .pricing-card × n) [conditional]
                        └── .checkout-success [conditional, fixed position]
```

***

## 8. Section-Level Layout Rules

### Login (`.login-page`, `.login-container`, `.login-card`)

| Rule | Value |
|------|--------|
| page.layout | flex, align center, justify center, min-height 100vh |
| page.padding | `56px 16px` |
| container.maxWidth | `380px` |
| container.width | `100%` |
| container.flex | column, gap `16px`, align items center |
| card.flex | column, align start, width `100%` |
| card.padding | `28px 24px 24px` |
| card.borderRadius | `20px` |
| step.gap | `16px` |

### Dashboard (`.dash-page`, `.dash-container`)

| Rule | Value |
|------|--------|
| page.padding | `24px 16px 64px` |
| page.minHeight | `100vh` |
| container.maxWidth | `640px` |
| container.margin | `0 auto` |
| container.gap | `32px` (column) |
| header.layout | flex, space-between, align center |
| section.gap | `16px` |
| accountInfo.gap | `16px` (row) |

### Pricing (`.pricing-grid`)

| Rule | Value |
|------|--------|
| layout.type | CSS Grid |
| columns.default | `1fr 1fr` |
| gap | `14px` |
| columns.atMaxWidth500 | `1fr` |

### Features (`.features-grid`)

| Rule | Value |
|------|--------|
| layout.type | flex column |
| gap | `10px` |

***

## 9. Grid System

| Property | Value |
|----------|--------|
| columns.12colSystem | `not_applicable` (no 12 column grid in source) |
| pricing.grid.columns | `2` (`1fr 1fr`) on wide viewports |
| pricing.grid.gap | `14px` |
| container.maxWidth.login | `380px` |
| container.maxWidth.dashboard | `640px` |
| column.span.pricingCard | `1` fractional unit of grid (not 12-span) |
| margin.pageHorizontal | `16px` (dashboard and login horizontal padding) |

***

## 10. Spacing & Density

**Base unit (explicit in repo):** `not_applicable` (no single documented base; smallest recurring gap `6px`).

**Observed px values:** `2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 42, 46, 48, 56, 64, 80`

**Token map (value → token id)**

* `2px` → `space.2`
* `3px` → `space.3`
* `4px` → `space.4`
* `6px` → `space.6`
* `8px` → `space.8`
* `10px` → `space.10`
* `12px` → `space.12`
* `14px` → `space.14`
* `16px` → `space.16`
* `18px` → `space.18`
* `20px` → `space.20`
* `24px` → `space.24`
* `28px` → `space.28`
* `32px` → `space.32`
* `40px` → `space.40`
* `42px` → `space.42`
* `46px` → `space.46`
* `48px` → `space.48`
* `56px` → `space.56`
* `64px` → `space.64`
* `80px` → `space.80`

**Density**

| Metric | Value |
|--------|--------|
| sectionGap.dashboard | `32px` |
| cardPadding.typical | `24px` (also `20px` horizontal on pricing cards) |
| whitespace.ratio | `unknown` (needs viewport measurement) |

***

## 11. Interaction & Behavior Patterns

| Pattern | Value |
|---------|--------|
| auth.redirectIfLoggedIn | navigate to `/dashboard` when `user` on Login |
| auth.redirectIfLoggedOut | navigate to `/login` when no user on Dashboard |
| otp.autoAdvance | focus next `.otp-input` on digit entry |
| otp.backspace | focus previous when empty + Backspace |
| otp.paste | distribute digits, focus last filled index |
| otp.autoSubmit | verify when six digits filled |
| button.loading | label replaced by `.spinner`, `disabled={loading}` |
| checkout.redirect | POST then `window.location` to returned URL |
| checkout.successQuery | `?checkout=success` shows banner |
| pricing.cta.disabled | when loading or current plan |
| navbar.sticky | `not_applicable` (no sticky rule in CSS) |
| card.pricing.hover | `not_applicable` (no hover styling) |

***

## 12. Motion System

| Token | Value |
|-------|--------|
| transition.fast | `all 0.15s ease` |
| transition.border | `border-color 0.2s ease` |
| keyframes.spin | rotate `360deg` |
| animation.spinner | `spin 0.6s linear infinite` |
| modal.enter | `not_applicable` (no modal) |
| tooltip.enter | `not_applicable` (no tooltip component) |
| duration.fastMs | `150` (from `0.15s`) |
| duration.spinMs | `600` (from `0.6s`) |
| easing.default | `ease` |

***

## 13. Responsive System

| Breakpoint | Source | Behavior |
|------------|--------|----------|
| `max-width: 500px` | `Dashboard.css` | `.pricing-grid` one column |
| other.breakpoints | `unknown` (no other `@media` in extracted CSS) |

**Navbar:** same layout at all widths in source (logo + Sign Out); **hamburger** · `not_applicable` (not implemented).

**Pricing grid:** one column at `max-width: 500px`; two columns above that.

***

## 14. Accessibility

| Topic | Value |
|-------|--------|
| input.focus.ring | box-shadow on `:focus` (not `:focus-visible` only) |
| button.focus.style | `unknown` (no explicit focus rule in CSS) |
| otp.inputMode | `numeric` |
| headings | `h1`, `h2`, `h3` used |
| disabled.styles | where defined: opacity + `not-allowed` |
| aria.audit | `unknown` (not systematically extracted) |
| contrast.wcag | `unknown` (needs tooling) |

***

## 15. Elevation & Layers

| Level | Value |
|-------|--------|
| elevation.0 | page background only |
| elevation.1 | `shadow.elevation.card` on `.login-card`, `.checkout-success` |
| elevation.2plus | `unknown` (no higher defined) |

**z-index**

| Selector | Value |
|----------|--------|
| `.checkout-success` | `100` |
| other.layers | `unknown` (only this z-index found) |

***

## 16. Iconography

| Attribute | Value |
|-----------|--------|
| library | `unknown` (no SVG icon pack detected) |
| usage | emoji and Unicode (`✓`, `🔒`, `🎉`) |
| size.inherited | `18px` (`.feature-icon`), `40px` (`.success-icon`) |
| strokeWidth | `not_applicable` (emoji, not strokes) |
| style.outlineVsFilled | `not_applicable` |

***

## 17. Form Behavior

| Topic | Value |
|-------|--------|
| validation.html | `required` on email |
| validation.otp | JS length check six digits |
| error.surface | `.error-msg` padding `12px 16px`, border, `14px` text; no separate error color token |
| helperText | `not_applicable` (no helper UI) |
| placeholder | `color.text.placeholder` |
| label.position | static above field |
| floatingLabels | `not_applicable` |

***

## 18. Reusable UI Patterns

| Pattern | Value |
|---------|--------|
| authCard | centered column, max width, elevated card, logo |
| dashboardSection | `.dash-section` + title + content |
| featureRow | icon + text; locked uses opacity |
| pricingCard | optional badge, header, list, CTA |
| fixedToast | bottom fixed banner, shadow, optional refresh |
| modal | `not_applicable` in routes |
| dataTable | `not_applicable` in routes |

***

## 19. Design Constraints & Ratios

| Constraint | Value |
|------------|--------|
| login.maxWidth | `380px` |
| dashboard.maxWidth | `640px` |
| otp.cell | `46px` × `42px` |
| avatar | `48px` circle |
| success.iconCircle | `80px` |
| pricing.badge.offset | `top: -10px`, `right: 12px` |
| image.aspectRatios | `unknown` (no img layout rules in CSS) |
| text.maxWidth.ch | `unknown` |

***

## 20. DOM-to-Token Mapping

| Selector | Mapped tokens |
|----------|----------------|
| `:root`, `body` | `color.surface.page`, `color.text.primary`, `font.family.sans` |
| `.btn-primary` | `color.text.primary`, `color.surface.page`, `motion.transition.default` |
| `.btn-primary:hover:not(:disabled)` | opacity, transform (no separate bg token) |
| `.btn-secondary` | `color.text.muted`, `color.border.default` |
| `.btn-ghost:hover` | `color.text.primary`, `color.border.default` as fill |
| `.form-input` | `color.surface.card`, `color.border.default`, `color.text.primary` |
| `.form-input:focus` | `color.border.focus`, `color.focus.ring.subtle` |
| `.form-input::placeholder` | `color.text.placeholder` |
| `.spinner` | `color.border.default`, `color.action.accent` |
| `.login-card` | `color.surface.card`, `color.border.default`, `shadow.elevation.card` |
| `.dash-card` | `color.surface.card`, `color.border.default` |
| `.tier-badge`, `.feature-card.locked` | variants use `color.border.default` fills |
| `.pricing-card.highlighted` | `color.action.accent` border |
| `.pricing-badge` | `color.action.accent` bg, `color.surface.page` text |
| `.checkout-success` | card colors, `shadow.elevation.card`, `z-index` |

***

## 21. Brand Personality

Attributes (from copy + visuals):

* warm-neutral (cream page vs stark white/black)
* premium-soft (large radii `12px` to `20px`, light shadow)
* approachable (script wordmark, conversational login)
* product-led (features and pricing in app)
* calm / low-chrome (borders over heavy fills)
* tooling-focused (extension and extraction messaging)

***

## Cursor / user rules applied

* Workspace: codebase search on `Plucker_updated`, then CSS/JSX reads.
* No `feedback-forms.css` in this web-app path.
* Documentation only; no app code changes.

***

## Validation

* No ambiguous lone placeholder character used for **cell** values; every semantic field is `unknown`, `not_applicable`, or explicit.
* Markdown/GFM **table separator rows** (lines made of hyphen characters between pipes) are syntax only, not data fields.
* Horizontal rules use `***` (not triple hyphen).
* Hyphens inside **identifiers and values** (e.g. `-apple-system`, `translateY(-1px)`, `max-width`, `not-allowed`) are literal text, not missing-value placeholders.

*End of Design System Extract (v2).*
