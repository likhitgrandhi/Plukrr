export const DUMMY_APPS = [
  {
    id: '1',
    slug: 'linear',
    name: 'Linear',
    tagline: 'The issue tracker for modern software teams',
    description:
      'Linear helps streamline software projects, sprints, tasks, and bug tracking. It\'s fast, focused, and built for modern product teams who care about quality and speed. Loved by thousands of engineering teams worldwide.',
    platform: ['Web', 'iOS'],
    category: 'Productivity',
    logoColor: '#5E6AD2',
    logoInitial: 'L',
    screenshots: [
      { url: 'https://placehold.co/1280x800/f5f5f0/aaaaaa?text=Issues+View', caption: 'Issues view' },
      { url: 'https://placehold.co/1280x800/f0f5ff/aaaaaa?text=Project+Board', caption: 'Project board' },
      { url: 'https://placehold.co/1280x800/f5f0ff/aaaaaa?text=Cycles', caption: 'Cycles' },
      { url: 'https://placehold.co/1280x800/f0fff5/aaaaaa?text=Roadmap', caption: 'Roadmap' },
    ],
    designMd: `# Linear — Design System

## Typography
**Font Family:** Inter, -apple-system, sans-serif
**Base Size:** 14px

| Role    | Size  | Weight | Line Height |
|---------|-------|--------|-------------|
| Display | 32px  | 700    | 1.2         |
| Heading | 20px  | 600    | 1.3         |
| Body    | 14px  | 400    | 1.5         |
| Caption | 12px  | 500    | 1.4         |

## Colors

### Brand
--color-brand:        #5E6AD2
--color-brand-hover:  #4F5BBF

### Background
--bg-primary:         #FFFFFF
--bg-secondary:       #F7F8FA
--bg-hover:           #F0F1F3

### Text
--text-primary:       #111827
--text-secondary:     #6B7280
--text-disabled:      #D1D5DB

### Border
--border-default:     #E5E7EB
--border-focus:       #5E6AD2

## Components

### Buttons
Border radius:        6px
Height (default):     32px
Height (large):       40px

### Inputs
Border radius:        6px
Height:               36px
Border:               1px solid #E5E7EB

### Cards
Border radius:        8px
Border:               1px solid #E5E7EB

## Layout
Sidebar width:        240px
Content max width:    1200px
Base spacing unit:    4px

## Spacing Scale
4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`,
  },
  {
    id: '2',
    slug: 'notion',
    name: 'Notion',
    tagline: 'The all-in-one workspace for notes and docs',
    description:
      'Notion is a single space where you can think, write, and plan. Capture thoughts, manage projects, or even run an entire company — and do it exactly the way you want.',
    platform: ['Web', 'iOS', 'Android'],
    category: 'Productivity',
    logoColor: '#000000',
    logoInitial: 'N',
    screenshots: [
      { url: 'https://placehold.co/1280x800/fafafa/aaaaaa?text=Home+Dashboard', caption: 'Home dashboard' },
      { url: 'https://placehold.co/1280x800/f5f5f5/aaaaaa?text=Document+Editor', caption: 'Document editor' },
      { url: 'https://placehold.co/1280x800/f0f0f0/aaaaaa?text=Database+View', caption: 'Database view' },
    ],
    designMd: `# Notion — Design System

## Typography
**Font Family:** ui-sans-serif, system-ui, sans-serif
**Base Size:** 16px

| Role    | Size  | Weight | Line Height |
|---------|-------|--------|-------------|
| Title   | 40px  | 700    | 1.2         |
| H1      | 30px  | 700    | 1.2         |
| H2      | 24px  | 600    | 1.3         |
| Body    | 16px  | 400    | 1.6         |
| Small   | 14px  | 400    | 1.5         |

## Colors

### Background
--bg-default:         #FFFFFF
--bg-sidebar:         #F7F6F3
--bg-hover:           #EBEBEA

### Text
--text-default:       #37352F
--text-secondary:     #787774
--text-placeholder:   #C1C1BE

### Border
--border-default:     rgba(55, 53, 47, 0.16)

## Components
Block padding:        2px 2px
Page padding:         96px 96px
Max content width:    900px
Border radius:        3px`,
  },
  {
    id: '3',
    slug: 'figma',
    name: 'Figma',
    tagline: 'Collaborative design for the modern web',
    description:
      'Figma is a vector graphics editor and prototyping tool. Used by design teams across the world to create interfaces, illustrations, wireframes, and interactive prototypes in the browser.',
    platform: ['Web'],
    category: 'Design',
    logoColor: '#F24E1E',
    logoInitial: 'F',
    screenshots: [
      { url: 'https://placehold.co/1280x800/1e1e2e/555577?text=Canvas', caption: 'Design canvas' },
      { url: 'https://placehold.co/1280x800/2a2a3e/555577?text=Components', caption: 'Component panel' },
      { url: 'https://placehold.co/1280x800/25253a/555577?text=Prototype', caption: 'Prototype mode' },
    ],
    designMd: `# Figma — Design System

## Typography
**Font Family:** Inter, sans-serif
**Base Size:** 12px (dense UI)

| Role       | Size  | Weight |
|------------|-------|--------|
| Panel text | 11px  | 400    |
| Label      | 12px  | 500    |
| Heading    | 14px  | 600    |

## Colors

### Canvas
--canvas-bg:          #1E1E2E
--panel-bg:           #2C2C2C
--panel-border:       rgba(255,255,255,0.1)

### Text (on dark)
--text-primary:       #FFFFFF
--text-secondary:     rgba(255,255,255,0.6)
--text-placeholder:   rgba(255,255,255,0.3)

### Brand
--figma-purple:       #7B61FF
--figma-green:        #1BC47D

## Components
Toolbar height:       48px
Panel width:          240px
Border radius:        4px`,
  },
  {
    id: '4',
    slug: 'stripe',
    name: 'Stripe',
    tagline: 'Payment infrastructure for the internet',
    description:
      'Stripe is a suite of APIs powering online payment processing and commerce solutions for internet businesses of every size. Build a better internet by connecting businesses and their customers.',
    platform: ['Web'],
    category: 'Finance',
    logoColor: '#635BFF',
    logoInitial: 'S',
    screenshots: [
      { url: 'https://placehold.co/1280x800/f6f9fc/aaaaaa?text=Dashboard', caption: 'Payments dashboard' },
      { url: 'https://placehold.co/1280x800/f0f4fc/aaaaaa?text=Analytics', caption: 'Revenue analytics' },
      { url: 'https://placehold.co/1280x800/eef3fc/aaaaaa?text=Customers', caption: 'Customer list' },
    ],
    designMd: `# Stripe — Design System

## Typography
**Font Family:** -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto
**Base Size:** 14px

| Role    | Size  | Weight | Color   |
|---------|-------|--------|---------|
| Heading | 20px  | 600    | #1A1F36 |
| Body    | 14px  | 400    | #3C4257 |
| Small   | 12px  | 400    | #697386 |

## Colors

### Brand
--stripe-purple:      #635BFF
--stripe-blurple:     #5469D4

### Background
--bg-page:            #F6F9FC
--bg-card:            #FFFFFF
--bg-highlight:       #F5F5FF

### Text
--text-dark:          #1A1F36
--text-body:          #3C4257
--text-muted:         #697386

### Status
--success:            #09825D
--warning:            #BB5504
--danger:             #C0123C

## Layout
Max width:            1200px
Card radius:          8px
Input radius:         6px
Button radius:        6px`,
  },
  {
    id: '5',
    slug: 'vercel',
    name: 'Vercel',
    tagline: 'Deploy. Scale. Ship faster.',
    description:
      'Vercel is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration. Deploy Next.js, React, Vue, and more in seconds.',
    platform: ['Web'],
    category: 'Developer Tools',
    logoColor: '#000000',
    logoInitial: 'V',
    screenshots: [
      { url: 'https://placehold.co/1280x800/0a0a0a/333333?text=Deployments', caption: 'Deployments' },
      { url: 'https://placehold.co/1280x800/111111/333333?text=Analytics', caption: 'Analytics' },
      { url: 'https://placehold.co/1280x800/0d0d0d/333333?text=Settings', caption: 'Project settings' },
    ],
    designMd: `# Vercel — Design System

## Typography
**Font Family:** Geist, "Inter", sans-serif
**Base Size:** 14px

| Role    | Size  | Weight |
|---------|-------|--------|
| Display | 48px  | 700    |
| H1      | 28px  | 700    |
| Body    | 14px  | 400    |
| Mono    | 13px  | 400    |

## Colors (dark theme)

### Background
--bg-primary:         #000000
--bg-secondary:       #111111
--bg-tertiary:        #1A1A1A

### Text
--text-primary:       #EDEDED
--text-secondary:     #888888
--text-muted:         #444444

### Brand
--color-success:      #50E3C2
--color-error:        #FF0000
--color-warning:      #F5A623

### Border
--border-default:     #333333

## Components
Border radius (sm):   4px
Border radius (md):   8px
Button height:        32px
Input height:         36px`,
  },
  {
    id: '6',
    slug: 'loom',
    name: 'Loom',
    tagline: 'Record and share video messages',
    description:
      'Loom is a video messaging tool that helps you get your message across through instantly shareable videos. Record your screen, camera, or both, and share in seconds.',
    platform: ['Web', 'iOS'],
    category: 'Communication',
    logoColor: '#625DF5',
    logoInitial: 'L',
    screenshots: [
      { url: 'https://placehold.co/1280x800/faf9ff/aaaaaa?text=Home', caption: 'Home screen' },
      { url: 'https://placehold.co/1280x800/f5f4ff/aaaaaa?text=Video+Player', caption: 'Video player' },
      { url: 'https://placehold.co/1280x800/f0eeff/aaaaaa?text=Library', caption: 'Video library' },
    ],
    designMd: `# Loom — Design System

## Typography
**Font Family:** Inter, sans-serif
**Base Size:** 15px

| Role    | Size  | Weight |
|---------|-------|--------|
| H1      | 28px  | 700    |
| H2      | 22px  | 600    |
| Body    | 15px  | 400    |
| Caption | 13px  | 400    |

## Colors

### Brand
--purple-primary:     #625DF5
--purple-light:       #EAE9FE
--pink-accent:        #F96791

### Background
--bg-page:            #FFFFFF
--bg-surface:         #F9F9F9
--bg-hover:           #F3F2FF

### Text
--text-primary:       #1A1A2E
--text-secondary:     #6B7280

## Components
Border radius:        12px
Button height:        40px
Video card radius:    10px`,
  },
  {
    id: '7',
    slug: 'arc',
    name: 'Arc',
    tagline: 'The browser that puts you in control',
    description:
      'Arc from The Browser Company is a Chromium-based browser built to help you be your best self on the internet. Customizable, distraction-free, and delightfully opinionated.',
    platform: ['iOS', 'Web'],
    category: 'Utilities',
    logoColor: '#FF6B6B',
    logoInitial: 'A',
    screenshots: [
      { url: 'https://placehold.co/1280x800/1a1a2e/555555?text=Browser+Window', caption: 'Browser window' },
      { url: 'https://placehold.co/1280x800/16213e/555555?text=Spaces', caption: 'Spaces' },
      { url: 'https://placehold.co/1280x800/0f3460/555555?text=Little+Arc', caption: 'Little Arc' },
    ],
    designMd: `# Arc — Design System

## Typography
**Font Family:** "Neue Haas Grotesk", system-ui, sans-serif
**Base Size:** 14px

| Role    | Size  | Weight |
|---------|-------|--------|
| Display | 36px  | 700    |
| Body    | 14px  | 400    |
| Small   | 12px  | 500    |

## Colors

### Sidebar (customizable)
--sidebar-bg:         user-defined gradient
--sidebar-text:       auto (light/dark based on bg)

### UI
--bg-primary:         #1A1A2E
--bg-secondary:       #16213E

### Brand Gradient
from:                 #FF6B6B
to:                   #A855F7

## Components
Tab item radius:      10px
Address bar radius:   9999px
Sidebar width:        220px`,
  },
  {
    id: '8',
    slug: 'raycast',
    name: 'Raycast',
    tagline: 'A blazingly fast, totally extendable launcher',
    description:
      'Raycast lets you control your tools with a few keystrokes. It\'s designed to keep you focused, and is packed with tools to boost developer productivity.',
    platform: ['iOS'],
    category: 'Developer Tools',
    logoColor: '#FF6363',
    logoInitial: 'R',
    screenshots: [
      { url: 'https://placehold.co/1280x800/1c1c1e/555555?text=Command+Bar', caption: 'Command bar' },
      { url: 'https://placehold.co/1280x800/1e1e22/555555?text=Extensions', caption: 'Extensions' },
      { url: 'https://placehold.co/1280x800/1a1a1f/555555?text=Snippets', caption: 'Snippets' },
    ],
    designMd: `# Raycast — Design System

## Typography
**Font Family:** SF Pro Display, system-ui
**Base Size:** 13px

| Role     | Size  | Weight |
|----------|-------|--------|
| Result   | 14px  | 400    |
| Subtitle | 12px  | 400    |
| Category | 11px  | 600    |

## Colors (dark)

### Background
--bg-window:          rgba(28, 28, 30, 0.95)
--bg-item-hover:      rgba(255, 255, 255, 0.08)
--bg-item-selected:   rgba(255, 99, 99, 0.2)

### Text
--text-primary:       rgba(255,255,255,0.95)
--text-secondary:     rgba(255,255,255,0.45)

### Brand
--color-red:          #FF6363

## Components
Window radius:        12px
Window width:         640px
Item height:          44px
Search input height:  52px`,
  },
  {
    id: '9',
    slug: 'craft',
    name: 'Craft',
    tagline: 'A new take on documents',
    description:
      'Craft is a powerful, native document editor for Apple devices. Create beautiful notes, documents, and work journals, with a design that feels right at home on iOS and macOS.',
    platform: ['iOS'],
    category: 'Productivity',
    logoColor: '#007AFF',
    logoInitial: 'C',
    screenshots: [
      { url: 'https://placehold.co/1280x800/f9f9f9/aaaaaa?text=Document+View', caption: 'Document view' },
      { url: 'https://placehold.co/1280x800/f5f5f5/aaaaaa?text=Library', caption: 'Library' },
      { url: 'https://placehold.co/1280x800/f0f0f0/aaaaaa?text=Sharing', caption: 'Share sheet' },
    ],
    designMd: `# Craft — Design System

## Typography
**Font Family:** SF Pro Text (system), New York (editorial)
**Base Size:** 16px

| Role    | Size  | Weight |
|---------|-------|--------|
| Display | 34px  | 700    |
| H1      | 28px  | 700    |
| H2      | 22px  | 600    |
| Body    | 17px  | 400    |

## Colors

### Background
--bg-primary:         #FFFFFF
--bg-secondary:       #F2F2F7
--bg-tertiary:        #E5E5EA

### Text
--text-primary:       #000000
--text-secondary:     #3C3C43
--text-tertiary:      #8E8E93

### Brand
--apple-blue:         #007AFF
--apple-indigo:       #5856D6

## Spacing (iOS HIG)
Base unit:            8px
Scale:                4 · 8 · 12 · 16 · 20 · 24 · 32 · 44`,
  },
  {
    id: '10',
    slug: 'superhuman',
    name: 'Superhuman',
    tagline: 'The fastest email experience ever made',
    description:
      'Superhuman is a beautifully crafted email client engineered for speed. With AI triage, keyboard shortcuts, and split inbox, it helps you reach inbox zero twice as fast.',
    platform: ['Web', 'iOS'],
    category: 'Communication',
    logoColor: '#E01C73',
    logoInitial: 'S',
    screenshots: [
      { url: 'https://placehold.co/1280x800/fdf9ff/aaaaaa?text=Inbox', caption: 'Inbox' },
      { url: 'https://placehold.co/1280x800/faf5ff/aaaaaa?text=Compose', caption: 'Compose view' },
      { url: 'https://placehold.co/1280x800/f5f0ff/aaaaaa?text=Command+K', caption: 'Command palette' },
    ],
    designMd: `# Superhuman — Design System

## Typography
**Font Family:** Graphik, -apple-system, sans-serif
**Base Size:** 14px

| Role    | Size  | Weight |
|---------|-------|--------|
| H1      | 20px  | 600    |
| Body    | 14px  | 400    |
| Meta    | 12px  | 500    |
| Mono    | 13px  | 400    |

## Colors

### Brand
--brand-pink:         #E01C73
--brand-gradient:     linear-gradient(135deg, #E01C73, #9C27B0)

### Background
--bg-primary:         #FFFFFF
--bg-secondary:       #FAFAFA
--bg-hover:           #F5F0FF

### Text
--text-primary:       #0F0F0F
--text-secondary:     #6B7280
--text-muted:         #9CA3AF

## Components
Sidebar width:        260px
Email row height:     64px
Border radius:        4px
Input height:         40px`,
  },
];
