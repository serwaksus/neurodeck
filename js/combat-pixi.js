(() => {
'use strict';
if (typeof PIXI === 'undefined') { console.warn('PixiJS not loaded'); return; }

const W = 1280, H = 720;
let app = null, root = null;
let bgSprite = null, flashGfx = null, particleLayer = null, slashLayer = null, swordGfx = null;
let hpGfx = null, heroHpText = null, bossHpText = null, defeatedText = null;
let vignetteGfx = null, torchGfx = null, torchA = null, torchB = null, grainGfx = null;
let fxGfx = null, speedGfx = null, teleLayer = null;
let glowTex = null, particleTex = null;
const grainTexes = [];
const particlePool = [];
let bossViewEl = null;
let bgBaseScaleX = 1, bgBaseScaleY = 1;

const bossImages = {
    normal: 'boss-snake.jpg',
    social: 'boss-demon.jpg',
    chimera: 'boss-chimera.jpg'
};

const S = {
    time: 0, torch: 1,
    shake: 0, flash: 0, flashColor: 0xffffff,
    hitStop: 0,
    heroPct: 1, bossPct: 1,
    heroPctTarget: 1, bossPctTarget: 1,
    bossGhost: 1,
    heroHpStr: '86/86', bossHpStr: '420/500', bossName: 'Змей Лени',
    bossType: 'normal', bossStage: 1,
    defeated: false, dying: false,
    hpDirty: true,
    combatActive: null,
    flashDrawn: false,
    particles: [], damageNums: [],
    tweens: [],
    swordActive: false, swordPhase: 0,
    flinchX: 0, flinchY: 0, lunge: 0,
    zoomActive: false,
    teleDim: 0, vign: 0,
    stageTintA: 0, stageTintC: 0xff2020,
    speedLife: 0, speedAngles: [],
    fxAny: false,
    texTried: {}
};

// NeuroDeck perf integration: defensive helpers — all three handle missing NeuroDeckPerf
function pixiPerf() { return window.NeuroDeckPerf || null; }
function pixiSkipEffects() {
    var p = pixiPerf();
    return !!(p && p.prefersReducedMotion && p.prefersReducedMotion());
}
function pixiLowSpec() {
    var p = pixiPerf();
    return !!(p && p.isLowEffect && p.isLowEffect());
}
function pixiSkipParticles() {
    var p = pixiPerf();
    return !!(p && p.isEffectsOff && p.isEffectsOff());
}

const ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,
    outQuad: t => 1 - (1-t)*(1-t),
    inBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
    outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)
};

function tween(fn, dur, done) { S.tweens.push({ fn, t: 0, dur, done }); }

function mixColor(a, b, t) {
    var ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    var br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return (((ar + (br - ar) * t) & 255) << 16) | (((ag + (bg - ag) * t) & 255) << 8) | ((ab + (bb - ab) * t) & 255);
}

// Per-boss special-effect color: snake=green, demon=orange, chimera=purple
function specialColor() {
    return S.bossType === 'social' ? 0xff8020 : S.bossType === 'chimera' ? 0xa050ff : 0x30d060;
}

function buildTextures() {
    var g = new PIXI.Graphics();
    g.beginFill(0xffffff);
    g.drawCircle(4, 4, 4);
    g.endFill();
    particleTex = app.renderer.generateTexture(g);
    g.clear();

    // Radial glow: stacked translucent circles fade toward the edge
    for (var i = 8; i >= 1; i--) {
        g.beginFill(0xffffff, 0.045);
        g.drawCircle(64, 64, 64 * i / 8);
        g.endFill();
    }
    glowTex = app.renderer.generateTexture(g);
    g.destroy();

    for (var gi = 0; gi < 4; gi++) {
        var gr = new PIXI.Graphics();
        for (var k = 0; k < 60; k++) {
            var x = Math.random() * W, y = Math.random() * H;
            var v = Math.floor(Math.random() * 200);
            gr.beginFill((v << 16) | (v << 8) | v, 0.3);
            gr.drawRect(x, y, 1, 1);
            gr.endFill();
        }
        grainTexes.push(app.renderer.generateTexture(gr));
        gr.destroy();
    }
}

// Texture cache with 404/timeout memo — stage files may not exist, never retry them
function loadBossTexture(url) {
    if (S.texTried.hasOwnProperty(url)) return Promise.resolve(S.texTried[url]);
    return new Promise(function(res) {
        var tex;
        try { tex = PIXI.Texture.from(url); } catch (e) { S.texTried[url] = null; return res(null); }
        if (tex.baseTexture.valid) { S.texTried[url] = tex; return res(tex); }
        var done = false;
        var finish = function(t) { if (!done) { done = true; S.texTried[url] = t; res(t); } };
        tex.baseTexture.once('loaded', function() { finish(tex); });
        tex.baseTexture.once('error', function() { finish(null); });
        setTimeout(function() { finish(tex.baseTexture.valid ? tex : null); }, 5000);
    });
}

async function init() {
    const container = document.getElementById('combatContainer');
    if (!container) return;

    app = new PIXI.Application({
        width: W, height: H,
        backgroundAlpha: 0, antialias: false,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true
    });
    container.appendChild(app.view);
    app.view.style.width = '100%';
    app.view.style.height = '100%';

    root = new PIXI.Container();
    app.stage.addChild(root);

    // Stage-specific image first (boss-{type}-{stage}.jpg), fall back to boss-{type}.jpg
    var stem = (bossImages[S.bossType] || bossImages.normal).replace('.jpg', '');
    var tex = await loadBossTexture(stem + '-1.jpg');
    if (!tex) tex = await loadBossTexture(bossImages[S.bossType]);
    if (!tex) tex = PIXI.Texture.from(bossImages[S.bossType]);

    bgSprite = new PIXI.Sprite(tex);
    bgSprite.width = W; bgSprite.height = H;
    bgBaseScaleX = bgSprite.scale.x; bgBaseScaleY = bgSprite.scale.y;
    root.addChild(bgSprite);

    buildTextures();

    torchGfx = new PIXI.Container();
    torchA = new PIXI.Sprite(glowTex);
    torchA.anchor.set(0.5);
    torchA.blendMode = PIXI.BLEND_MODES.ADD;
    torchA.tint = 0xff8c38;
    torchA.x = W * 0.2; torchA.y = H * 0.3;
    torchB = new PIXI.Sprite(glowTex);
    torchB.anchor.set(0.5);
    torchB.blendMode = PIXI.BLEND_MODES.ADD;
    torchB.tint = 0xff6020;
    torchB.x = W * 0.8; torchB.y = H * 0.4;
    torchGfx.addChild(torchA, torchB);
    root.addChild(torchGfx);

    vignetteGfx = new PIXI.Graphics();
    root.addChild(vignetteGfx);
    drawVignette();

    // Full-screen overlays: telegraph dim, vignette pulse, stage tint (normal blend)
    fxGfx = new PIXI.Graphics();
    root.addChild(fxGfx);

    // Telegraph glow sprites (ADD blend, above dim)
    teleLayer = new PIXI.Container();
    root.addChild(teleLayer);

    slashLayer = new PIXI.Graphics();
    root.addChild(slashLayer);

    swordGfx = new PIXI.Graphics();
    swordGfx.visible = false;
    root.addChild(swordGfx);

    // Speed lines + rings (ADD blend)
    speedGfx = new PIXI.Graphics();
    speedGfx.blendMode = PIXI.BLEND_MODES.ADD;
    root.addChild(speedGfx);

    particleLayer = new PIXI.Container();
    root.addChild(particleLayer);

    flashGfx = new PIXI.Graphics();
    root.addChild(flashGfx);

    grainGfx = new PIXI.Sprite(grainTexes[0]);
    grainGfx.alpha = 0.03;
    root.addChild(grainGfx);

    hpGfx = new PIXI.Graphics();
    root.addChild(hpGfx);

    heroHpText = new PIXI.Text('86/86', { fontFamily: 'Georgia', fontSize: 14, fill: 0xd4a574 });
    heroHpText.x = 30; heroHpText.y = H - 30;
    root.addChild(heroHpText);

    bossHpText = new PIXI.Text('Змей Лени 420/500', { fontFamily: 'Georgia', fontSize: 14, fill: 0xd4a574 });
    bossHpText.x = 30; bossHpText.y = H - 60;
    root.addChild(bossHpText);

    defeatedText = new PIXI.Text('☠ ПОВЕРЖЕН ☠', { fontFamily: 'Georgia', fontSize: 52, fill: 0x888888, fontWeight: 'bold' });
    defeatedText.anchor.set(0.5);
    defeatedText.x = W/2; defeatedText.y = H/2;
    defeatedText.visible = false;
    root.addChild(defeatedText);

    const el = document.getElementById('combatLoading');
    if (el) el.style.display = 'none';

    bossViewEl = document.getElementById('view-boss');
    if (S.combatActive === null) S.combatActive = !!(bossViewEl && bossViewEl.classList.contains('active'));
    document.addEventListener('visibilitychange', syncTicker);

    app.ticker.add(loop);
    syncTicker();
}

function syncTicker() {
    if (!app) return;
    if (S.combatActive && !document.hidden) app.ticker.start();
    else app.ticker.stop();
}

function drawVignette() {
    vignetteGfx.clear();
    vignetteGfx.beginFill(0x000000, 0.5);
    vignetteGfx.drawRect(0, 0, W, H);
    vignetteGfx.endFill();
    vignetteGfx.beginHole();
    vignetteGfx.drawEllipse(W/2, H*0.4, W*0.45, H*0.4);
    vignetteGfx.endHole();
}

function updateTorch() {
    var f = S.torch;
    torchA.alpha = 0.32 * f;
    torchA.scale.set(3.9 * f, 2.8 * f);
    torchB.alpha = 0.22 * f;
    torchB.scale.set(3.1 * f, 2.3 * f);
}

function drawSword(progress) {
    swordGfx.clear();
    if (!S.swordActive) return;

    const cx = W * 0.5, cy = H * 0.4;
    var angle, x, y, rot;

    if (progress < 0.3) {
        var p = ease.inBack(progress / 0.3);
        angle = -0.8 + p * 0.3;
        x = W * 0.9 - p * W * 0.2;
        y = H * 0.9 - p * H * 0.3;
        rot = -1.2 + p * 0.5;
    } else if (progress < 0.6) {
        var p = ease.out((progress - 0.3) / 0.3);
        angle = -0.5 + p * 1.5;
        x = W * 0.7 - p * W * 0.5;
        y = H * 0.6 - p * H * 0.3;
        rot = -0.7 + p * 1.8;
    } else {
        var p = (progress - 0.6) / 0.4;
        angle = 1.0 - p * 0.5;
        x = W * 0.2 - p * W * 0.1;
        y = H * 0.3 + p * H * 0.3;
        rot = 1.1 - p * 0.5;
    }

    swordGfx.position.set(x, y);
    swordGfx.rotation = rot;

    // Motion trail
    if (progress > 0.25 && progress < 0.65) {
        var trailAlpha = Math.sin((progress - 0.25) / 0.4 * Math.PI);
        slashLayer.clear();
        slashLayer.position.set(0, 0);
        for (var i = 0; i < 5; i++) {
            var tp = progress - i * 0.04;
            if (tp < 0.25 || tp > 0.65) continue;
            var tp2 = ease.out((tp - 0.3) / 0.3);
            var tx = W * 0.7 - tp2 * W * 0.5;
            var ty = H * 0.6 - tp2 * H * 0.3;
            slashLayer.lineStyle(3, 0xcccccc, trailAlpha * (1 - i * 0.2) * 0.4);
            slashLayer.moveTo(tx - 40, ty);
            slashLayer.lineTo(tx + 40, ty);
        }
    } else if (progress >= 0.65) {
        slashLayer.clear();
    }

    // Iron sword (simple, dark grey)
    swordGfx.beginFill(0x3a3a3a);
    swordGfx.drawRect(-3, -120, 6, 100); // blade
    swordGfx.beginFill(0x2a2a2a);
    swordGfx.drawRect(-15, -20, 30, 6); // cross-guard
    swordGfx.drawRect(-4, -14, 8, 20); // grip
    swordGfx.beginFill(0x4a4a4a);
    swordGfx.drawCircle(0, 8, 5); // pommel
    swordGfx.endFill();
    // Blade edge highlight
    swordGfx.beginFill(0x5a5a5a);
    swordGfx.drawRect(-1, -120, 1, 100);
    swordGfx.endFill();
}

function drawHpBars() {
    hpGfx.clear();
    // Boss HP bar
    hpGfx.beginFill(0x000000, 0.7);
    hpGfx.drawRoundedRect(28, H - 70, W - 56, 20, 4);
    hpGfx.endFill();
    hpGfx.beginFill(0x1a0808);
    hpGfx.drawRoundedRect(30, H - 68, W - 60, 16, 3);
    hpGfx.endFill();
    if (S.bossPct > 0) {
        var bColor = S.bossPct < 0.3 ? 0xc02020 : 0x8b2635;
        hpGfx.beginFill(bColor);
        hpGfx.drawRoundedRect(30, H - 68, (W - 60) * S.bossPct, 16, 3);
        hpGfx.endFill();
        // Ghost HP: white lagging segment at the old position, shrinks slowly to catch up
        if (S.bossGhost > S.bossPct + 0.002) {
            hpGfx.beginFill(0xffffff, 0.55);
            hpGfx.drawRoundedRect(30 + (W - 60) * S.bossPct, H - 68, (W - 60) * (S.bossGhost - S.bossPct), 16, 3);
            hpGfx.endFill();
        }
        hpGfx.beginFill(0xffffff, 0.15);
        hpGfx.drawRoundedRect(30, H - 68, (W - 60) * S.bossPct, 5, 3);
        hpGfx.endFill();
    }
    hpGfx.lineStyle(1, 0xd4a574, 0.3);
    hpGfx.drawRoundedRect(30, H - 68, W - 60, 16, 3);

    // Hero HP bar
    hpGfx.beginFill(0x000000, 0.7);
    hpGfx.drawRoundedRect(28, H - 40, W - 56, 20, 4);
    hpGfx.endFill();
    hpGfx.beginFill(0x1a0808);
    hpGfx.drawRoundedRect(30, H - 38, W - 60, 16, 3);
    hpGfx.endFill();
    if (S.heroPct > 0) {
        hpGfx.beginFill(0xc73e4d);
        hpGfx.drawRoundedRect(30, H - 38, (W - 60) * S.heroPct, 16, 3);
        hpGfx.endFill();
        hpGfx.beginFill(0xffffff, 0.15);
        hpGfx.drawRoundedRect(30, H - 38, (W - 60) * S.heroPct, 5, 3);
        hpGfx.endFill();
    }
    hpGfx.lineStyle(1, 0xd4a574, 0.3);
    hpGfx.drawRoundedRect(30, H - 38, W - 60, 16, 3);
}

function updateGrain() {
    grainGfx.texture = grainTexes[Math.floor(Math.random() * grainTexes.length)];
    grainGfx.alpha = 0.02 + Math.random() * 0.02;
    grainGfx.x = Math.random() * 30 - 15;
    grainGfx.y = Math.random() * 30 - 15;
}

function takeParticle() {
    var s = particlePool.pop();
    if (!s) {
        if (S.particles.length >= 64) return null;
        s = new PIXI.Sprite(particleTex);
        s.anchor.set(0.5);
        s.blendMode = PIXI.BLEND_MODES.ADD;
    }
    return s;
}

function emit(s, x, y, vx, vy, dec, base, tint) {
    s.tint = tint;
    s.visible = true;
    s._vx = vx; s._vy = vy;
    s._life = 1; s._dec = dec;
    s._base = base;
    s.x = x; s.y = y;
    particleLayer.addChild(s);
    S.particles.push(s);
}

function spawnParticles(x, y, count, color, speed) {
    for (var i = 0; i < count; i++) {
        var s = takeParticle();
        if (!s) return;
        var a = Math.random() * Math.PI * 2;
        emit(s, x, y,
            Math.cos(a) * speed * (0.3 + Math.random() * 0.7),
            Math.sin(a) * speed * (0.3 + Math.random() * 0.7) - 1,
            0.02 + Math.random() * 0.02,
            0.5 + Math.random(), color);
    }
}

function spawnDamageNum(x, y, text, color, crit) {
    var t = new PIXI.Text(text, {
        fontFamily: 'Georgia', fontSize: crit ? 38 : 28,
        fill: color, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 3
    });
    t.anchor.set(0.5);
    t.x = x + (Math.random() - 0.5) * 20; t.y = y;
    t._vx = (Math.random() - 0.5) * 0.3;
    t._vy = -1.5; t._life = 1; t._dec = 0.012;
    if (crit) {
        t.scale.set(1.6);
        tween(function(p) { t.scale.set(1.6 - 0.6 * p); }, 0.15);
    }
    root.addChild(t);
    S.damageNums.push(t);
}

// ===== Boss idle / flinch / lunge (composited onto bgSprite each frame) =====

function updateBossIdle(dt) {
    if (!bgSprite) return;
    var skipFx = pixiSkipEffects();
    var br = 0;
    if (!skipFx) {
        // Breathing: 1.0 -> 1.01 -> 1.0, 3s sine period
        br = 0.005 * (1 - Math.cos(S.time * Math.PI * 2 / 3));
        // Stage 2+: subtle position sway
        bgSprite.x = S.bossStage >= 2 ? 6 * Math.sin(S.time * 0.8) : 0;
    } else {
        bgSprite.x = 0;
    }
    var s = 1 + br + S.lunge;
    bgSprite.scale.set(bgBaseScaleX * (s + S.flinchX), bgBaseScaleY * (s + S.flinchY));
    // Stage 3: tint pulse toward red
    if (!S.defeated && !S.dying && S.bossStage >= 3 && !skipFx) {
        var k = 0.5 + 0.5 * Math.sin(S.time * 2.2);
        bgSprite.tint = mixColor(0xffffff, 0xff9a8a, 0.35 * k);
    }
}

function flinchBoss() {
    if (pixiSkipEffects()) return;
    tween(function(p) {
        var e = 1 - ease.outBack(p);
        S.flinchX = -0.03 * e;
        S.flinchY = 0.03 * e;
    }, 0.15, function() { S.flinchX = 0; S.flinchY = 0; });
}

function bossLunge(amp, dur) {
    tween(function(t) {
        var d;
        if (t < 0.35) d = -amp * ease.out(t / 0.35);
        else d = -amp + 2 * amp * Math.pow((t - 0.35) / 0.65, 3);
        S.lunge = d;
    }, dur, function() { S.lunge = 0; });
}

// ===== Telegraph system =====

function telegraphGlow(color, pulses, dur) {
    var g = new PIXI.Sprite(glowTex);
    g.anchor.set(0.5);
    g.blendMode = PIXI.BLEND_MODES.ADD;
    g.tint = color;
    g.x = W * 0.5; g.y = H * 0.4;
    g.scale.set(4);
    teleLayer.addChild(g);
    tween(function(p) {
        g.alpha = Math.abs(Math.sin(p * Math.PI * pulses)) * 0.8;
        g.scale.set(4 + p * 1.5);
    }, dur, function() { teleLayer.removeChild(g); g.destroy(); });
}

function telegraphEnrage() {
    if (pixiSkipParticles()) return;
    var burst = function(n) {
        for (var i = 0; i < n; i++) {
            var s = takeParticle();
            if (!s) return;
            emit(s, Math.random() * W, H + 10,
                (Math.random() - 0.5) * 0.5,
                -(1.5 + Math.random() * 2.5),
                0.02, 0.6 + Math.random(),
                i % 2 ? 0xff8020 : 0xffb040);
        }
    };
    burst(20);
    tween(function(t) {}, 0.3, function() { burst(15); });
}

function telegraphRing(color) {
    var g = new PIXI.Graphics();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    teleLayer.addChild(g);
    tween(function(p) {
        g.clear();
        g.lineStyle(6 - 4 * p, color, (1 - p) * 0.9);
        g.drawCircle(W * 0.5, H * 0.4, 40 + p * 380);
    }, 0.5, function() { teleLayer.removeChild(g); g.destroy(); });
}

// ===== Speed lines =====

function spawnSpeedLines() {
    if (pixiSkipEffects() || pixiSkipParticles()) return;
    S.speedLife = 1;
    S.speedAngles = [];
    for (var i = 0; i < 7; i++) S.speedAngles.push(Math.random() * Math.PI * 2);
}

function drawSpeedLines() {
    speedGfx.clear();
    if (S.speedLife <= 0) return;
    var cx = W * 0.5, cy = H * 0.45;
    var r1 = 120 + (1 - S.speedLife) * 380;
    speedGfx.lineStyle(3, 0xffffff, S.speedLife * 0.8);
    for (var i = 0; i < S.speedAngles.length; i++) {
        var a = S.speedAngles[i];
        speedGfx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        speedGfx.lineTo(cx + Math.cos(a) * (r1 + 90), cy + Math.sin(a) * (r1 + 90));
    }
}

// ===== Full-screen overlays (dim / vignette pulse / stage tint) =====

function drawFx() {
    fxGfx.clear();
    var any = false;
    if (S.teleDim > 0.01) {
        fxGfx.beginFill(0x000000, S.teleDim);
        fxGfx.drawRect(0, 0, W, H);
        fxGfx.endFill();
        any = true;
    }
    if (S.vign > 0.01) {
        var t = 90;
        fxGfx.beginFill(0xff1010, S.vign * 0.4);
        fxGfx.drawRect(0, 0, W, t);
        fxGfx.drawRect(0, H - t, W, t);
        fxGfx.drawRect(0, 0, t, H);
        fxGfx.drawRect(W - t, 0, t, H);
        fxGfx.endFill();
        any = true;
    }
    if (S.stageTintA > 0.01) {
        fxGfx.beginFill(S.stageTintC, S.stageTintA);
        fxGfx.drawRect(0, 0, W, H);
        fxGfx.endFill();
        any = true;
    }
    S.fxAny = any;
}

function lerpPct(cur, target, k) {
    cur += (target - cur) * k;
    if (Math.abs(target - cur) < 0.001) cur = target;
    return cur;
}

function loop() {
    var dt = Math.min(3, app.ticker.deltaMS / 16.667);
    S.time += dt / 60;
    var frozen = performance.now() < S.hitStop;
    if (!bossViewEl || !bossViewEl.classList.contains('active')) return;

    S.torch = 0.82 + Math.sin(S.time * 8) * 0.1 + Math.sin(S.time * 23) * 0.06 + Math.random() * 0.04;

    if (!frozen) {
        updateTorch();
        updateBossIdle(dt);

        // Flash
        if (S.flash > 0.01) {
            flashGfx.clear();
            var c = S.flashColor;
            var r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
            flashGfx.beginFill((r << 16) | (g << 8) | b, S.flash);
            flashGfx.drawRect(0, 0, W, H);
            flashGfx.endFill();
            S.flash *= Math.pow(0.78, dt);
            S.flashDrawn = true;
        } else if (S.flashDrawn) {
            flashGfx.clear();
            S.flashDrawn = false;
        }

        // Shake
        if (S.shake > 0.5) {
            root.x = (Math.random() - 0.5) * S.shake;
            root.y = (Math.random() - 0.5) * S.shake;
            S.shake *= Math.pow(0.85, dt);
        } else { root.x = 0; root.y = 0; }

        // Sword animation
        if (S.swordActive) {
            S.swordPhase += 0.04 * dt;
            drawSword(S.swordPhase);
            if (S.swordPhase >= 1) {
                S.swordActive = false;
                swordGfx.visible = false;
                slashLayer.clear();
            }
        }

        // Tweens
        S.tweens = S.tweens.filter(function(tw) {
            tw.t += dt / 60;
            var p = Math.min(1, tw.t / tw.dur);
            tw.fn(p);
            if (p >= 1) { if (tw.done) tw.done(); return false; }
            return true;
        });

        // Particles
        for (var i = S.particles.length - 1; i >= 0; i--) {
            var p = S.particles[i];
            p.x += p._vx * dt; p.y += p._vy * dt;
            p._vy += 0.05 * dt;
            p._life -= p._dec * dt;
            p.alpha = p._life; p.scale.set(p._life * p._base);
            if (p._life <= 0) { particleLayer.removeChild(p); p.visible = false; particlePool.push(p); S.particles.splice(i, 1); }
        }

        // Damage numbers
        for (var j = S.damageNums.length - 1; j >= 0; j--) {
            var d = S.damageNums[j];
            d.x += d._vx * dt;
            d.y += d._vy * dt; d._life -= d._dec * dt;
            d.alpha = Math.min(1, d._life * 1.5);
            if (d._life <= 0) { root.removeChild(d); d.destroy(); S.damageNums.splice(j, 1); }
        }

        // Speed lines (0.1s life)
        if (S.speedLife > 0) {
            S.speedLife -= dt / 6;
            if (S.speedLife < 0) S.speedLife = 0;
            drawSpeedLines();
        }

        // Overlays — redraw only while something is active (plus one final clear)
        if (S.fxAny || S.teleDim > 0.01 || S.vign > 0.01 || S.stageTintA > 0.01) drawFx();

        if (Math.random() < 0.1) updateGrain();
    }

    // HP bar tween: lerp current -> target (~0.3s), ghost lags (~0.8s)
    var hk = 1 - Math.exp(-dt / 6);
    var gk = 1 - Math.exp(-dt / 16);
    S.heroPct = lerpPct(S.heroPct, S.heroPctTarget, hk);
    S.bossPct = lerpPct(S.bossPct, S.bossPctTarget, hk);
    if (S.bossGhost < S.bossPct) S.bossGhost = S.bossPct;
    else S.bossGhost = lerpPct(S.bossGhost, S.bossPct, gk);
    var hpAnim = S.heroPct !== S.heroPctTarget || S.bossPct !== S.bossPctTarget || S.bossGhost - S.bossPct > 0.002;
    if (S.hpDirty || hpAnim) { drawHpBars(); S.hpDirty = false; }

    var hStr = '⚔ ' + S.heroHpStr;
    if (heroHpText.text !== hStr) heroHpText.text = hStr;
    var bStr = (S.bossStage >= 2 ? '⚡ ' : '') + S.bossName + '  ' + S.bossHpStr;
    if (bossHpText.text !== bStr) bossHpText.text = bStr;
}

// ============ PUBLIC API ============

window.startHeroAttack = function(dmg, crit, blocked) {
    if (!app || !swordGfx) return;
    if (S.swordActive || S.defeated) return;
    S.swordActive = true; S.swordPhase = 0;
    swordGfx.visible = true;

    tween(function(t) {}, 0.25, function() {
        var skipFx = pixiSkipEffects();
        // Impact at sword midpoint
        S.flash = crit ? 0.7 : 0.45;
        S.flashColor = 0xffffff;
        S.shake = skipFx ? 0 : (crit ? 22 : 14);
        S.hitStop = skipFx ? 0 : (performance.now() + (crit ? 90 : 60));
        var pColor = crit ? 0xfbbf24 : 0xc73e4d;
        if (!pixiSkipParticles()) spawnParticles(W * 0.5, H * 0.35, crit ? 35 : 20, pColor, 3);
        spawnDamageNum(W * 0.5, H * 0.3, '-' + dmg + (crit ? ' КРИТ!' : ''), crit ? 0xfbbf24 : 0xe74c3c, crit);
        flinchBoss();
        // Crit zoom-punch: 1.02 for 80ms then back
        if (crit && !skipFx && !S.zoomActive) {
            S.zoomActive = true;
            tween(function(p) { root.scale.set(1 + 0.02 * Math.sin(p * Math.PI)); }, 0.16,
                function() { root.scale.set(1); S.zoomActive = false; });
        }
    });
};

window.startBossAttack = function(dmg, intentType) {
    if (!app || !bgSprite) return;
    if (S.defeated) return;
    var it = intentType || 'normal';
    var skipFx = pixiSkipEffects();

    // Lunge profiles per intent (enrage shakes without lunge)
    if (!skipFx) {
        if (it === 'heavy') bossLunge(0.06, 0.5);        // 1.5x pull
        else if (it === 'quick') bossLunge(0.04, 0.35);  // 0.7x duration
        else if (it === 'special') bossLunge(0.05, 0.45);
        else if (it !== 'enrage') bossLunge(0.04, 0.5);
    }

    var delay = it === 'quick' ? 0.18 : 0.25;
    tween(function(t) {}, delay, function() {
        var color = 0xc73e4c, flashA = 0.55, shake = 26, stopMs = 110;
        var pColor = 0x8b1414, px = W * 0.5, py = H * 0.5;
        if (it === 'heavy') {
            color = 0xff2020; flashA = 0.8; shake = 38; stopMs = 130;
            spawnSpeedLines();
        } else if (it === 'quick') {
            color = 0xffdd30; flashA = 0.5; shake = 18;
        } else if (it === 'special') {
            color = specialColor(); flashA = 0.65; pColor = color;
            px = W * 0.5; py = H * 0.4; // boss position
        }
        S.flash = flashA; S.flashColor = color;
        S.shake = skipFx ? 0 : Math.max(S.shake, shake);
        S.hitStop = skipFx ? 0 : (performance.now() + stopMs);
        if (!pixiSkipParticles()) spawnParticles(px, py, 25, pColor, 2.5);
        spawnDamageNum(W * 0.5, H * 0.6, '-' + dmg + ' HP', color, false);
    });
};

window.updateHP = function(heroHp, heroMaxHp, bossHp, bossMaxHp, bossName, stageNum, bType) {
    S.heroPctTarget = Math.max(0, heroHp / heroMaxHp);
    S.bossPctTarget = Math.max(0, bossHp / bossMaxHp);
    S.heroHpStr = Math.round(heroHp) + '/' + heroMaxHp;
    S.bossHpStr = Math.round(bossHp) + '/' + bossMaxHp;
    S.hpDirty = true;
    if (bossName) S.bossName = bossName;
    if (typeof stageNum === 'number') S.bossStage = Math.min(3, Math.max(1, stageNum + 1));
    if (bType && bType !== S.bossType) {
        S.bossType = bType;
        swapBossImage(bType, S.bossStage);
    }
};

window.setBossDefeated = function(val) {
    S.defeated = !!val;
    if (!val) {
        S.dying = false;
        if (app) app.ticker.speed = 1;
        if (defeatedText) defeatedText.visible = false;
        if (bgSprite) { bgSprite.tint = 0xffffff; bgSprite.alpha = 1; }
        return;
    }
    if (!bgSprite || !app) { if (defeatedText) defeatedText.visible = true; return; }

    S.dying = true;
    var skipFx = pixiSkipEffects();
    if (!skipFx) {
        // Slow-mo for 0.5s real time
        app.ticker.speed = 0.3;
        setTimeout(function() { if (app) app.ticker.speed = 1; }, 500);
        // Desaturate gradually
        tween(function(p) { bgSprite.tint = mixColor(0xffffff, 0x666666, p); }, 0.6);
        // Grey/white particle burst
        if (!pixiSkipParticles()) {
            spawnParticles(W * 0.5, H * 0.4, 25, 0xffffff, 3.5);
            spawnParticles(W * 0.5, H * 0.4, 25, 0x999999, 3);
        }
    } else {
        bgSprite.tint = 0x666666;
    }
    if (defeatedText) defeatedText.visible = false;
    // Then the existing fade
    tween(function(t) {}, 0.5, function() {
        tween(function(p) { bgSprite.alpha = 1 - p; }, 1.2, function() {
            if (defeatedText) defeatedText.visible = true;
        });
    });
};

window.setBossType = function(type) {
    if (type === S.bossType) return;
    S.bossType = type;
    swapBossImage(type, S.bossStage);
};

// Round separation: true when no combat animation is in progress
window.__ndCombatReady = function() {
    return !!(app && !S.swordActive && S.tweens.length === 0 && !S.dying);
};

// Visual telegraph before the boss attack
window.__ndBossTelegraph = function(intentType) {
    if (!app || !teleLayer || S.defeated || pixiSkipEffects()) return;
    if (intentType === 'heavy') {
        telegraphGlow(0xff2020, 3, 0.8);
        tween(function(p) { S.teleDim = Math.sin(p * Math.PI) * 0.25; }, 0.8, function() { S.teleDim = 0; });
    } else if (intentType === 'quick') {
        telegraphGlow(0xffdd30, 2, 0.4);
    } else if (intentType === 'enrage') {
        telegraphEnrage();
    } else if (intentType === 'special') {
        telegraphRing(specialColor());
    }
};

// Cinematic stage transition. S.bossStage is already updated by updateHP before
// app.js calls this; the `stage` param is kept for contract compatibility.
window.__ndStageTransition = function(stage) {
    if (!app || !bgSprite || S.dying) return;
    var newStage = Math.min(3, Math.max(1, S.bossStage));
    S.bossStage = newStage;
    var skipFx = pixiSkipEffects();

    // White flash (~0.3s visual)
    S.flash = Math.max(S.flash, skipFx ? 0.4 : 1.0);
    S.flashColor = 0xffffff;
    // Screen shake
    if (!skipFx) S.shake = Math.max(S.shake, 15);
    // Colored tint overlay: red for danger (stage 2), purple for chaos (stage 3)
    S.stageTintC = newStage >= 3 ? 0xa050ff : 0xff2020;
    tween(function(p) { S.stageTintA = Math.sin(p * Math.PI) * 0.2; }, 1.2, function() { S.stageTintA = 0; });

    // Crossfade boss sprite to the new stage image (0.5s)
    var stem = (bossImages[S.bossType] || bossImages.normal).replace('.jpg', '');
    loadBossTexture(stem + '-' + newStage + '.jpg').then(function(tex) {
        if (!tex || !bgSprite || !app || bgSprite.texture === tex) return;
        var old = bgSprite;
        var nu = new PIXI.Sprite(tex);
        nu.width = W; nu.height = H;
        nu.position.copyFrom(old.position);
        nu.scale.copyFrom(old.scale);
        nu.tint = old.tint;
        nu.alpha = 0;
        root.addChildAt(nu, root.getChildIndex(old) + 1);
        tween(function(p) { nu.alpha = p; }, 0.5, function() {
            if (bgSprite === nu) return;
            bgSprite = nu;
            root.removeChild(old);
            old.destroy();
        });
    });
};

function applyBossTexture(tex) {
    if (tex && bgSprite) {
        bgSprite.texture = tex;
        bgSprite.width = W; bgSprite.height = H;
    }
}

function swapBossImage(type, stage) {
    var base = bossImages[type] || bossImages.normal;
    var stem = base.replace('.jpg', '');
    if (stage >= 1) {
        loadBossTexture(stem + '-' + stage + '.jpg').then(function(tex) {
            if (tex) return applyBossTexture(tex);
            loadBossTexture(base).then(function(t2) { applyBossTexture(t2 || PIXI.Texture.from(base)); });
        });
    } else {
        loadBossTexture(base).then(function(tex) { applyBossTexture(tex || PIXI.Texture.from(base)); });
    }
}

// ===================== Performance Mode =====================
// __ndApplyEcoToPixi is invoked by app.js when js/perf.js flips the eco flag.
// In eco mode we drop PixiJS resolution (less GPU) and hide expensive overlays
// (torch glow, vignette, fx overlays). Function is a no-op until init() has
// populated app. In combat-pixi.js we don't pause the ticker entirely because
// the ticker drives combat attacks; instead we cut its per-frame workload.
window.__ndApplyEcoToPixi = function(isEco) {
    try {
        if (app && typeof app.renderer === 'object' && app.renderer) {
            var dpr = window.devicePixelRatio || 1;
            var target = isEco ? 1 : Math.min(2, dpr);
            if (typeof app.renderer.resolution === 'number' && app.renderer.resolution !== target) {
                app.renderer.resolution = target;
                app.renderer.resize(W, H);
            }
        }
    } catch (e) { /* renderer not initialised yet */ }
    try {
        if (torchGfx) { torchGfx.visible = !isEco; }
        if (vignetteGfx) { vignetteGfx.visible = !isEco; }
        if (grainGfx) { grainGfx.visible = !isEco; }
        if (fxGfx) { fxGfx.visible = !isEco; }
        if (teleLayer) { teleLayer.visible = !isEco; }
        if (speedGfx) { speedGfx.visible = !isEco; }
    } catch (e) { /* graphics layers not created yet */ }
};

init();
})();
