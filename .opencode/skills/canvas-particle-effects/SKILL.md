---
name: canvas-particle-effects
description: Canvas 2D particle system optimization for NeuroDeck. Use when editing burstParticles(), Particle class, Dust class, animateDust(), animate(), the particle canvas (#particles), dust canvas (#dustCanvas), screenShake(), spawnBloodRain(), or any visual effect code. Covers particle lifecycle (spawn/update/draw/die), shape rendering (circle/spark/star), gravity physics, color blending via shadowBlur, the 500-particle hard limit and FIFO eviction, visibilitychange pause/resume pattern, dust particle color theming per room, and the two independent canvas systems (dust vs burst particles). Prevents memory leaks from unbounded particle arrays, performance degradation on mobile, and broken animations after tab switch.
---

# Canvas Particle Effects Guide

## Two Independent Canvas Systems

### 1. Dust Canvas (#dustCanvas) — Ambient Atmosphere
```js
const dustCanvas = document.getElementById('dustCanvas');
const dustCtx = dustCanvas.getContext('2d');
let dustParticles = []; // Fixed 60 particles

class Dust {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.3;  // Slow horizontal drift
        this.vy = -0.1 - Math.random() * 0.2;     // Upward float
        this.size = 0.5 + Math.random() * 1.5;
        this.alpha = 0.2 + Math.random() * 0.4;
        this.color = ROOM_THEMES[currentRoomIndex].particleColor;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx += (Math.random() - 0.5) * 0.02; // Slight wander
        // Recycle when off-screen
        if (this.y < -10 || this.x < -10 || this.x > width + 10) {
            this.x = Math.random() * width;
            this.y = height + 10; // Respawn from bottom
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
```

**Key properties:**
- **60 particles** (fixed count, created once)
- **opacity = 0.6** (always visible, set in CSS via `dustCanvas.style.opacity = 0.6`)
- **Color changes per room** (via `ROOM_THEMES[idx].particleColor`)
- **Particles recycle** (never destroyed, respawn at bottom)

### 2. Burst Canvas (#particles) — Event Effects
```js
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');
let particles = []; // Dynamic, up to 500

class Particle {
    constructor(x, y, o) {
        // o = options object
        this.x = x; this.y = y;
        this.vx = o.vx || (Math.random() - 0.5) * 4;
        this.vy = o.vy || (Math.random() - 0.5) * 4 - 2;
        this.life = o.life || 1;
        this.decay = o.decay || 0.015;
        this.size = o.size || 3;
        this.color = o.color || '#d4a574';
        this.glow = o.glow !== false;
        this.gravity = o.gravity !== undefined ? o.gravity : 0.05;
        this.shape = o.shape || 'circle';
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.2;
    }
}
```

## Particle Shapes

### Circle (default)
```js
ctx.beginPath();
ctx.arc(0, 0, this.size, 0, Math.PI * 2);
ctx.fill();
```

### Spark (rectangle, elongated)
```js
ctx.fillRect(-this.size * 2, -this.size / 2, this.size * 4, this.size);
```

### Star (10-point, 5 outer + 5 inner)
```js
ctx.beginPath();
for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? this.size : this.size / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
}
ctx.closePath();
ctx.fill();
```

## burstParticles() — Spawn Function

```js
function burstParticles(x, y, count, o) {
    o = o || {};
    var MAX_PARTICLES = 500;
    // FIFO eviction if exceeding limit
    if (particles.length + count > MAX_PARTICLES) {
        particles.splice(0, particles.length + count - MAX_PARTICLES);
    }
    for (var i = 0; i < count; i++) {
        var a = (i / count) * Math.PI * 2; // Even radial distribution
        var sp = (o.speed || 6) * (0.5 + Math.random() * 0.5);
        particles.push(new Particle(x, y, Object.assign({}, o, {
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp
        })));
    }
}
```

### Standard Burst Presets

| Event | Count | Color | Speed | Shape | Size | Extra |
|-------|-------|-------|-------|-------|------|-------|
| Card complete | 28 | `#f4c896` | 5 | spark | 3 | gravity 0.08 |
| Critical hit | 40 | `#fbbf24` | 8 | star | 4 | gravity 0.1 |
| Rank up | 80+50 | rankColor | 12+8 | star | 4+2 | |
| Level up | 100 | `#fbbf24` | 14 | star | 4 | gravity 0.12 |
| Boss defeated | 300+200 | gold+red | 15+12 | star+spark | 5+4 | life 2.0+1.5 |
| Boss evolve | 100 | `#c73e4d` | 12 | star | 4 | |
| Goal complete | 120 | type color | 12 | star | 4 | |
| Equip | 40 | itemColor | 6 | star | 3 | |
| Forge | 60 | statColor | 10 | spark | 3 | |
| Loot drop | 40 | rankColor | 7 | star | 3 | |
| Onboarding | 30 | `#d4a574` | 4 | spark | 2 | gravity 0.05 |

## Particle Lifecycle

```
Spawn (burstParticles)
  → Update: x += vx, y += vy, vy += gravity, vx *= 0.99
  → Life decreases: life -= decay
  → Draw if life > 0
  → Removed when life <= 0 (filtered in animate())
```

## Animation Loop

```js
function animate() {
    if (!particlesRunning) return; // Pause flag
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0); // Remove dead
    particles.forEach(p => { p.update(); p.draw(ctx); });
    requestAnimationFrame(animate);
}
```

**Performance:** `filter()` creates a new array each frame. With ≤500 particles this is fine. Do NOT increase MAX_PARTICLES without profiling on mobile.

## visibilitychange — Pause/Resume

```js
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        dustRunning = false;
        particlesRunning = false;
    } else {
        dustRunning = true;
        particlesRunning = true;
        animateDust(); // Restart loops
        animate();
    }
});
```

**CRITICAL:** When tab becomes visible again, you MUST call `animateDust()` and `animate()` again. The `requestAnimationFrame` chain was broken by the return guard. Without re-calling, animations stay frozen.

## screenShake()

```js
function screenShake(intensity, duration) {
    // intensity: pixels of displacement
    // duration: milliseconds
    const t0 = performance.now();
    function shake(now) {
        const elapsed = now - t0;
        if (elapsed > duration) {
            shakeWrap.style.transform = '';
            return;
        }
        const progress = 1 - elapsed / duration; // 1→0
        const current = intensity * progress;     // Dampens over time
        shakeWrap.style.transform =
            'translate(' + ((Math.random()-0.5) * current * 2) + 'px, ' +
            ((Math.random()-0.5) * current * 2) + 'px) rotate(' +
            ((Math.random()-0.5) * current * 0.3) + 'deg)';
        requestAnimationFrame(shake);
    }
    requestAnimationFrame(shake);
}
```

Applied to `#shakeWrap` which wraps the entire `.app` div.

## spawnBloodRain()

```js
function spawnBloodRain(n) {
    for (let i = 0; i < n; i++) {
        setTimeout(() => {
            const d = document.createElement('div');
            d.className = 'blood-drop';
            d.style.left = (Math.random() * 100) + 'vw';
            d.style.animationDuration = (1 + Math.random() * 1.5) + 's';
            d.style.opacity = 0.4 + Math.random() * 0.6;
            document.body.appendChild(d);
            setTimeout(() => d.remove(), 3000); // Cleanup
        }, i * 30); // Staggered spawn
    }
}
```

**DOM-based** (not canvas) — uses CSS `.blood-drop` animation. Each drop auto-removes after 3s.

## Canvas Sizing

```js
function resizeDust() {
    dustCanvas.width = window.innerWidth;
    dustCanvas.height = window.innerHeight;
}
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
// Both listen to window 'resize'
```

**IMPORTANT:** `resize` also triggers `updatePlayerMarker()` recalculation (map marker position depends on DOM layout).

## Performance Tips

1. **Never exceed 500 burst particles** — mobile WebViews will stutter
2. **`ctx.save()/restore()`** is used per-particle for glow effects — expensive but necessary
3. **`shadowBlur`** is the biggest performance cost — particles without glow are ~3× faster
4. **Dust particles are lightweight** (60 fixed, no spawn/destroy overhead)
5. **`visibilitychange` pause** saves battery on mobile when app is backgrounded
6. **Avoid `ctx.filter`** — use `shadowColor` + `shadowBlur` instead for glow
