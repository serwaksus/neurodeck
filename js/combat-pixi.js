(() => {
'use strict';
if (typeof PIXI === 'undefined') { console.warn('PixiJS not loaded'); return; }

const W = 1280, H = 720;
let app = null, root = null;
let bgSprite = null, flashGfx = null, particleLayer = null, slashLayer = null, swordGfx = null;
let hpGfx = null, heroHpText = null, bossHpText = null, defeatedText = null;
let vignetteGfx = null, torchGfx = null, grainGfx = null;

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
    heroHpStr: '86/86', bossHpStr: '420/500', bossName: 'Змей Лени',
    bossType: 'normal', bossStage: 1,
    defeated: false,
    particles: [], damageNums: [],
    tweens: [],
    swordActive: false, swordPhase: 0
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
    outQuad: t => 1 - (1-t)*(1-t)
};

function tween(fn, dur, done) { S.tweens.push({ fn, t: 0, dur, done }); }

async function init() {
    const container = document.getElementById('combatContainer');
    if (!container) return;

    app = new PIXI.Application({
        width: W, height: H,
        backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true
    });
    container.appendChild(app.view);
    app.view.style.width = '100%';
    app.view.style.height = '100%';

    root = new PIXI.Container();
    app.stage.addChild(root);

    const tex = PIXI.Texture.from(bossImages[S.bossType]);
    if (!tex.baseTexture.valid) await new Promise(r => { tex.baseTexture.once('loaded', r); setTimeout(r, 5000); });

    bgSprite = new PIXI.Sprite(tex);
    bgSprite.width = W; bgSprite.height = H;
    root.addChild(bgSprite);

    torchGfx = new PIXI.Graphics();
    root.addChild(torchGfx);

    vignetteGfx = new PIXI.Graphics();
    root.addChild(vignetteGfx);
    drawVignette();

    slashLayer = new PIXI.Graphics();
    root.addChild(slashLayer);

    swordGfx = new PIXI.Graphics();
    swordGfx.visible = false;
    root.addChild(swordGfx);

    particleLayer = new PIXI.Container();
    root.addChild(particleLayer);

    flashGfx = new PIXI.Graphics();
    root.addChild(flashGfx);

    grainGfx = new PIXI.Graphics();
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

    app.ticker.add(loop);
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

function drawTorch() {
    const f = S.torch;
    torchGfx.clear();
    torchGfx.beginFill(0xff8c38, 0.08 * f);
    torchGfx.drawEllipse(W * 0.2, H * 0.3, 250 * f, 180 * f);
    torchGfx.endFill();
    torchGfx.beginFill(0xff6020, 0.05 * f);
    torchGfx.drawEllipse(W * 0.8, H * 0.4, 200 * f, 150 * f);
    torchGfx.endFill();
    torchGfx.blendMode = PIXI.BLEND_MODES.ADD;
}

function drawSword(progress) {
    swordGfx.clear();
    if (!S.swordActive) return;

    const cx = W * 0.5, cy = H * 0.4;
    var angle, x, y, rot;

    if (progress < 0.3) {
        var p = progress / 0.3;
        angle = -0.8 + p * 0.3;
        x = W * 0.9 - p * W * 0.2;
        y = H * 0.9 - p * H * 0.3;
        rot = -1.2 + p * 0.5;
    } else if (progress < 0.6) {
        var p = (progress - 0.3) / 0.3;
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
            var tp2 = (tp - 0.3) / 0.3;
            var tx = W * 0.7 - tp2 * W * 0.5;
            var ty = H * 0.6 - tp2 * H * 0.3;
            var trot = -0.7 + tp2 * 1.8;
            slashLayer.save();
            slashLayer.alpha = trailAlpha * (1 - i * 0.2) * 0.4;
            slashLayer.lineStyle(3, 0xcccccc, 1);
            slashLayer.moveTo(tx - 40, ty);
            slashLayer.lineTo(tx + 40, ty);
            slashLayer.restore();
        }
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
    grainGfx.clear();
    for (var i = 0; i < 60; i++) {
        var x = Math.random() * W, y = Math.random() * H;
        var v = Math.floor(Math.random() * 200);
        grainGfx.beginFill((v << 16) | (v << 8) | v, 0.3);
        grainGfx.drawRect(x, y, 1, 1);
        grainGfx.endFill();
    }
}

function spawnParticles(x, y, count, color, speed) {
    for (var i = 0; i < count; i++) {
        var g = new PIXI.Graphics();
        g.beginFill(color); g.drawCircle(0, 0, 2 + Math.random() * 4); g.endFill();
        g.blendMode = PIXI.BLEND_MODES.ADD;
        var a = Math.random() * Math.PI * 2;
        g._vx = Math.cos(a) * speed * (0.3 + Math.random() * 0.7);
        g._vy = Math.sin(a) * speed * (0.3 + Math.random() * 0.7) - 1;
        g._life = 1; g._dec = 0.02 + Math.random() * 0.02;
        g.x = x; g.y = y;
        particleLayer.addChild(g);
        S.particles.push(g);
    }
}

function spawnDamageNum(x, y, text, color, crit) {
    var t = new PIXI.Text(text, {
        fontFamily: 'Georgia', fontSize: crit ? 38 : 28,
        fill: color, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 3
    });
    t.anchor.set(0.5);
    t.x = x; t.y = y;
    t._vy = -1.5; t._life = 1; t._dec = 0.012;
    root.addChild(t);
    S.damageNums.push(t);
}

function loop(dt) {
    S.time += dt / 60;
    var frozen = performance.now() < S.hitStop;
    var bossView = document.getElementById('view-boss');
    if (!bossView || !bossView.classList.contains('active')) return;

    S.torch = 0.82 + Math.sin(S.time * 8) * 0.1 + Math.sin(S.time * 23) * 0.06 + Math.random() * 0.04;

    if (!frozen) {
        drawTorch();

        // Flash
        flashGfx.clear();
        if (S.flash > 0.01) {
            var c = S.flashColor;
            var r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
            flashGfx.beginFill((r << 16) | (g << 8) | b, S.flash);
            flashGfx.drawRect(0, 0, W, H);
            flashGfx.endFill();
            S.flash *= Math.pow(0.78, dt);
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
            p.alpha = p._life; p.scale.set(p._life);
            if (p._life <= 0) { particleLayer.removeChild(p); p.destroy(); S.particles.splice(i, 1); }
        }

        // Damage numbers
        for (var j = S.damageNums.length - 1; j >= 0; j--) {
            var d = S.damageNums[j];
            d.y += d._vy * dt; d._life -= d._dec * dt;
            d.alpha = Math.min(1, d._life * 1.5);
            if (d._life <= 0) { root.removeChild(d); d.destroy(); S.damageNums.splice(j, 1); }
        }

        if (Math.random() < 0.1) updateGrain();
    }

    drawHpBars();
    if (heroHpText) heroHpText.text = '⚔ ' + S.heroHpStr;
    if (bossHpText) bossHpText.text = (S.bossStage >= 2 ? '⚡ ' : '') + S.bossName + '  ' + S.bossHpStr;
}

// ============ PUBLIC API ============

window.startHeroAttack = function(dmg, crit) {
    if (S.swordActive || S.defeated) return;
    S.swordActive = true; S.swordPhase = 0;
    swordGfx.visible = true;

    tween(function(t) {}, 0.25, function() {
        // Impact at sword midpoint
        S.flash = crit ? 0.7 : 0.45;
        S.flashColor = 0xffffff;
        S.shake = pixiSkipEffects() ? 0 : (crit ? 22 : 14);
        S.hitStop = pixiSkipEffects() ? 0 : (performance.now() + (crit ? 90 : 60));
        var pColor = crit ? 0xfbbf24 : 0xc73e4d;
        if (!pixiSkipParticles()) spawnParticles(W * 0.5, H * 0.35, crit ? 35 : 20, pColor, 3);
        spawnDamageNum(W * 0.5, H * 0.3, '-' + dmg + (crit ? ' КРИТ!' : ''), crit ? 0xfbbf24 : 0xe74c3c, crit);
    });
};

window.startBossAttack = function(dmg) {
    if (S.defeated) return;

    // Boss lunge (scale up briefly)
    var origScaleX = bgSprite.scale.x, origScaleY = bgSprite.scale.y;
    tween(function(t) {
        bgSprite.scale.x = origScaleX + 0.04 * Math.sin(t * Math.PI);
        bgSprite.scale.y = origScaleY + 0.04 * Math.sin(t * Math.PI);
    }, 0.5);

    tween(function(t) {}, 0.25, function() {
        S.flash = 0.55; S.flashColor = 0xc73e4d;
        S.shake = pixiSkipEffects() ? 0 : 26;
        S.hitStop = pixiSkipEffects() ? 0 : (performance.now() + 110);
        if (!pixiSkipParticles()) spawnParticles(W * 0.5, H * 0.5, 25, 0x8b1414, 2.5);
        spawnDamageNum(W * 0.5, H * 0.6, '-' + dmg + ' HP', 0xc73e4d, false);
    });
};

window.updateHP = function(heroHp, heroMaxHp, bossHp, bossMaxHp, bossName, stageNum, bType) {
    S.heroPct = Math.max(0, heroHp / heroMaxHp);
    S.bossPct = Math.max(0, bossHp / bossMaxHp);
    S.heroHpStr = Math.round(heroHp) + '/' + heroMaxHp;
    S.bossHpStr = Math.round(bossHp) + '/' + bossMaxHp;
    if (bossName) S.bossName = bossName;
    if (typeof stageNum === 'number') S.bossStage = stageNum + 1;
    if (bType && bType !== S.bossType) {
        S.bossType = bType;
        swapBossImage(bType);
    }
};

window.setBossDefeated = function(val) {
    S.defeated = !!val;
    if (defeatedText) defeatedText.visible = !!val;
};

window.setBossType = function(type) {
    if (type === S.bossType) return;
    S.bossType = type;
    swapBossImage(type);
};

function swapBossImage(type) {
    var img = bossImages[type] || bossImages.normal;
    var newTex = PIXI.Texture.from(img);
    if (bgSprite && newTex) {
        if (!newTex.baseTexture.valid) {
            newTex.baseTexture.once('loaded', function() {
                bgSprite.texture = newTex;
                bgSprite.width = W; bgSprite.height = H;
            });
        } else {
            bgSprite.texture = newTex;
            bgSprite.width = W; bgSprite.height = H;
        }
    }
}

// ===================== Performance Mode =====================
// __ndApplyEcoToPixi is invoked by app.js when js/perf.js flips the eco flag.
// In eco mode we drop PixiJS resolution (less GPU) and hide expensive overlays
// (torch glow, vignette). Function is a no-op until init() has populated app.
// In combat-pixi.js we don't pause the ticker entirely because the ticker drives
// combat attacks; instead we cut its per-frame workload.
window.__ndApplyEcoToPixi = function(isEco) {
    try {
        if (app && typeof app.renderer === 'object' && app.renderer) {
            var dpr = window.devicePixelRatio || 1;
            var target = isEco ? 1 : Math.min(2, dpr);
            if (typeof app.renderer.resolution === 'number' && app.renderer.resolution !== target) {
                app.renderer.resolution = target;
            }
        }
    } catch (e) { /* renderer not initialised yet */ }
    try {
        if (torchGfx) { torchGfx.visible = !isEco; }
        if (vignetteGfx) { vignetteGfx.visible = !isEco; }
        if (grainGfx) { grainGfx.visible = !isEco; }
    } catch (e) { /* graphics layers not created yet */ }
};

init();
})();