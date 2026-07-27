---
name: souls-like-ui-design
description: Dark Souls-inspired dungeon UI design patterns for NeuroDeck. Use when editing css/style.css, creating new UI components, modifying CSS variables, working with ROOM_THEMES, changing atmospheric layers (mist, torch, light-rays, dust), adding CSS animations, creating modals, or designing responsive layouts. Covers the CSS variable system (color palette, atmospheric vars), 14 ROOM_THEMES with hue/sat/light/mist/torch/rays transitions, atmospheric layer stacking (dungeon-bg, light-rays, mist SVG, dust canvas, torch-flicker, particle canvas), card 3D tilt effect, modal system, rank color system, responsive breakpoints, and the dungeonConfirm dialog. Prevents visual inconsistency, broken theme transitions, missing CSS animations, and non-responsive layouts.
---

# Souls-Like UI Design Guide

## CSS Variable System

### Core Palette
```css
:root {
    /* Base surfaces */
    --bg-deep: #050508;        /* Deepest background */
    --bg: #0a0a12;             /* Main background */
    --surface: #12121a;        /* Card surface */
    --surface-hi: #1a1a26;     /* Highlighted surface */

    /* Text */
    --text: #c4b59b;           /* Primary text (parchment) */
    --text-dim: #5c564d;       /* Dimmed text */

    /* Gold (primary accent) */
    --gold: #8b5a2b;           /* Dark gold */
    --gold-bright: #fbbf24;    /* Bright gold (highlights) */

    /* Blood (danger) */
    --blood: #2a0a0f;          /* Dark blood */
    --blood-bright: #c73e4d;   /* Bright blood */

    /* Green (success) */
    --green: #34d399;

    /* Borders */
    --border: rgba(212, 165, 116, 0.15);  /* Semi-transparent gold */
}
```

### Atmospheric Variables (dynamic, set by JS)
```css
:root {
    --atmosphere-hue: 25;       /* Set by updateAtmosphereByEscape() */
    --atmosphere-light: 3;
    --atmosphere-sat: 12;
    --mist-opacity: 0.7;
    --torch-intensity: 0.3;
    --light-rays-opacity: 0;
}
```

These change when the player enters a new dungeon room (every 10 rank-ups).

## 14 ROOM_THEMES

Each room has unique atmospheric parameters:

| Room # | Hue | Light | Sat | Mist | Torch | Rays | Particle Color |
|--------|-----|-------|-----|------|-------|------|----------------|
| 1 (Cell) | 25 | 3 | 12 | 0.7 | 0.3 | 0 | #d4a574 |
| 2 (Corridor) | 220 | 5 | 18 | 0.8 | 0.15 | 0 | #8090b0 |
| 3 (Crypt) | 355 | 5 | 22 | 0.65 | 0.25 | 0 | #c04040 |
| 4 (Mirrors) | 280 | 7 | 28 | 0.5 | 0.35 | 0.1 | #b060e0 |
| 5 (Catacombs) | 120 | 4 | 18 | 0.75 | 0.2 | 0 | #60a060 |
| 6 (Shadows) | 260 | 3 | 22 | 0.85 | 0.1 | 0 | #7050a0 |
| 7 (Library) | 195 | 10 | 35 | 0.4 | 0.4 | 0.2 | #40c0e0 |
| 8 (Throne) | 45 | 14 | 42 | 0.3 | 0.5 | 0.3 | #f0c060 |
| 9 (Garden) | 160 | 12 | 32 | 0.35 | 0.4 | 0.25 | #50c0a0 |
| 10 (Bridge) | 210 | 14 | 12 | 0.7 | 0.3 | 0.15 | #a0b0c0 |
| 11 (Tower) | 240 | 12 | 38 | 0.3 | 0.45 | 0.4 | #7070e0 |
| 12 (Forge) | 15 | 10 | 42 | 0.25 | 0.6 | 0.2 | #f08030 |
| 13 (Altar) | 50 | 20 | 32 | 0.2 | 0.5 | 0.5 | #f0e0a0 |
| 14 (Gates) | 38 | 35 | 45 | 0.1 | 0.7 | 0.7 | #f0d080 |

**Progression:** Rooms get brighter, warmer, less misty, more torchlight — symbolizing escape from darkness to freedom.

## Atmospheric Layer Stack (z-index order)

```
Layer 0: .dungeon-bg          — Radial gradient, darkest base
Layer 1: .light-rays          — CSS gradient rays (opacity per room)
Layer 2: #mistLayer           — SVG with 2 feTurbulence filters
Layer 3: #dustCanvas          — 60 floating dust particles (opacity 0.6)
Layer 4: .torch-flicker       — CSS keyframe flicker overlay
Layer 5: #particles           — Burst effects (above atmosphere, below UI)
Layer 6: #lvlOverlay etc.     — Full-screen overlays (level-up, rank-up)
Layer 7: .modal-overlay       — Modal dialogs
Layer 8: #confirmOverlay      — Confirm dialog (highest)
```

### Mist SVG
```html
<svg preserveAspectRatio="none" viewBox="0 0 1920 1080">
    <defs>
        <filter id="mist">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed="5"/>
            <feColorMatrix values="0 0 0 0 0.9  0 0 0 0 0.85  0 0 0 0 0.75  0 0 0 0.5 0"/>
            <feGaussianBlur stdDeviation="20"/>
        </filter>
    </defs>
    <rect width="100%" height="100%" filter="url(#mist)" opacity="0.5"/>
</svg>
```

**Parallax:** Mist layers translate on mousemove (opposite directions for depth).

## Rank Color System

```css
RANK_COLORS = {
    C:  { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', glow: 'rgba(156, 163, 175, 0.5)' },
    B:  { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)',  glow: 'rgba(96, 165, 250, 0.5)' },
    A:  { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', glow: 'rgba(192, 132, 252, 0.5)' },
    S:  { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)',   glow: 'rgba(251, 191, 36, 0.7)' },
};
// CC/CCC → C colors, BB/BBB → B colors, etc.
```

Applied via CSS custom properties on card elements:
```css
.card { --card-color: var(--gold-bright); --card-bg: rgba(...); --card-glow: rgba(...); }
.card.rank-C { border-color: #9ca3af40; }
.card.rank-S { border-color: #fbbf2480; box-shadow: 0 0 20px rgba(251,191,36,0.3); }
```

## Card 3D Tilt Effect

```js
// Mouse tilt (desktop)
el.addEventListener('mousemove', (e) => {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.transform = 
        'perspective(800px) ' +
        'rotateX(' + (-(y-r.height/2)/r.height*14) + 'deg) ' +
        'rotateY(' + ((x-r.width/2)/r.width*14) + 'deg) ' +
        'translateZ(4px)';
    // Mouse-following radial gradient
    el.style.setProperty('--mx', ((x/r.width)*100) + '%');
    el.style.setProperty('--my', ((y/r.height)*100) + '%');
});

// Touch tilt (mobile, gentler)
el.addEventListener('touchmove', (e) => {
    // Same but with /8 instead of /14 (less aggressive)
});
```

**CSS uses `--mx`/`--my` for a radial-gradient highlight that follows the cursor.**

## Modal System

### Structure
```html
<div class="modal-overlay" id="myModal">
    <div class="modal">
        <div class="modal-header">
            <h3>Title</h3>
            <button class="modal-close" data-action="close-my-modal">✕</button>
        </div>
        <div class="modal-body">...</div>
        <div class="modal-footer">
            <button class="demo-btn">Cancel</button>
            <button class="demo-btn primary">Confirm</button>
        </div>
    </div>
</div>
```

### Show/Hide
```css
.modal-overlay { display: none; }
.modal-overlay.show { display: flex; }
```

### Click-outside-to-close
```js
document.getElementById('myModal').addEventListener('click', (e) => {
    if (e.target.id === 'myModal') closeMyModal();
});
```

### Button Styles
```css
.demo-btn { /* Default: gold border, dark bg */ }
.demo-btn.primary { /* Filled gold background */ }
.demo-btn:hover { /* Brighten border + glow */ }
```

## dungeonConfirm() Dialog

Custom Promise-based replacement for `confirm()`:
```html
<div class="modal-overlay" id="confirmOverlay">
    <div class="modal confirm-modal">
        <div class="confirm-title" id="confirmTitle"></div>
        <div class="confirm-body" id="confirmBody"></div>
        <div class="confirm-actions">
            <button class="demo-btn" id="confirmNo">Отмена</button>
            <button class="demo-btn primary" id="confirmYes">Подтвердить</button>
        </div>
    </div>
</div>
```

```js
function dungeonConfirm(title, body) {
    return new Promise(function(resolve) {
        // Set title/body, show overlay
        // Wire yes/no buttons to resolve(true/false)
        // Cleanup handlers on resolve
    });
}
```

## Responsive Design

### Breakpoints
```css
/* Default: desktop layout */
.app { display: grid; grid-template-columns: 1fr 280px; }

@media (max-width: 900px) {
    .boss-panel { display: none; }     /* Hide sidebar */
    .bottom-nav { display: flex; }     /* Show bottom nav */
}

@media (max-width: 480px) {
    .map-rooms { grid-template-columns: 1fr 1fr; }
    .hero-layout { grid-template-columns: 1fr; }
    /* All grids collapse to single column */
}
```

### Mobile-Specific
- **Bottom navigation bar** (`footer.bottom-nav`) replaces sidebar boss panel
- **Touch targets** minimum 44×44px
- **Swipe navigation** between views (min 60px horizontal gesture)
- **Long-press** (500ms) on card → edit modal
- **Card tilt** is gentler on touch (8° max vs 14° on mouse)

## Toast System

```css
.toast {
    position: fixed; bottom: 80px; right: 16px;
    border-left: 3px solid var(--gold-bright);
    transform: translateX(120%);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.toast.show { transform: translateX(0); }
```

Types change border color:
- Default: gold
- `blood`: blood-red
- `crit`/`save`: bright gold

## Spirit Message

```css
.spirit-msg {
    position: fixed; top: 15%; left: 50%; transform: translateX(-50%);
    opacity: 0; transition: opacity 1s;
    font-style: italic; color: var(--text);
    text-shadow: 0 0 20px var(--gold-bright);
}
.spirit-msg.show { opacity: 1; }
```

## Design Principles

1. **Dark palette with gold accents** — parchment text on near-black surfaces
2. **Minimal use of color** — gold for positive, blood-red for negative, green for success
3. **Layered atmosphere** — depth through overlapping semi-transparent layers
4. **Subtle animation everywhere** — flicker, drift, pulse, breathe
5. **Responsive feedback** — every interaction has visual + audio + haptic response
6. **No flat colors** — everything uses gradients, glows, or transparency
