(() => {
'use strict';
if (typeof PIXI === 'undefined') { console.warn('PixiJS not loaded'); return; }

const W = 1280, H = 720;
let app = null, sceneRoot = null;
let loaded = false;

let bgSprite, heroSprite, bossSprite;
let torchGlow, heroLight, bossLight;
let fogParts = [];
let embers = [];
let particles = [];
let damageNums = [];
let slashGfx, flashGfx, grainGfx, vignetteGfx;
let heroHpBar, bossHpBar, heroHpLabel, bossHpLabel;
let letterboxGfx;

const S = {
    time: 0, torch: 1,
    heroAnim: 'idle', heroT: 0,
    bossAnim: 'idle', bossT: 0,
    heroX: 0, heroY: 0, bossX: 0, bossY: 0,
    heroSq: 1, bossSq: 1,
    shake: 0, flash: 0, flashColor: 0xffffff,
    hitStop: 0,
    defeated: false, bossType: 'normal', bossStage: 1,
    tweens: []
};

const ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2,
    outQuad: t => 1 - (1-t)*(1-t),
    back: t => { const c=1.70158, c3=c+1; return 1+c3*Math.pow(t-1,3)+c*Math.pow(t-1,2); }
};

function tween(update, dur, onDone) {
    S.tweens.push({ update, elapsed: 0, dur, onDone });
}

async function init() {
    const container = document.getElementById('combatContainer');
    if (!container) return;

    app = new PIXI.Application({
        width: W, height: H,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true
    });
    container.appendChild(app.view);
    app.view.style.width = '100%';
    app.view.style.height = '100%';

    sceneRoot = new PIXI.Container();
    app.stage.addChild(sceneRoot);

    try {
        const bgTex = PIXI.Texture.from('bg-optimized.jpg');
        const heroTex = PIXI.Texture.from('hero-cutout.png');
        const bossTex = PIXI.Texture.from('snake-cutout.png');
        await Promise.all([bgTex, heroTex, bossTex].map(t => new Promise(res => {
            if (t.baseTexture.valid) res(); else t.baseTexture.on('loaded', res);
            setTimeout(res, 5000);
        })));
        buildScene(bgTex, heroTex, bossTex);
    } catch(e) {
        console.error('Combat load error:', e);
    }

    loaded = true;
    const el = document.getElementById('combatLoading');
    if (el) el.style.display = 'none';

    app.ticker.add(gameLoop);
}

function buildScene(bgTex, heroTex, bossTex) {
    bgSprite = new PIXI.Sprite(bgTex);
    bgSprite.width = W; bgSprite.height = H;
    bgSprite.filters = [new PIXI.filters.BlurFilter(1.5)];
    sceneRoot.addChild(bgSprite);

    const bgDarken = new PIXI.Graphics();
    bgDarken.beginFill(0x000000, 0.25);
    bgDarken.drawRect(0, 0, W, H);
    bgDarken.endFill();
    sceneRoot.addChild(bgDarken);

    torchGlow = new PIXI.Graphics();
    sceneRoot.addChild(torchGlow);

    fogParts = [];
    for (let i = 0; i < 4; i++) {
        const fog = new PIXI.Graphics();
        fog.alpha = 0.06;
        fog._speed = 0.3 + i * 0.2;
        fog._offset = i * 300;
        sceneRoot.addChild(fog);
        fogParts.push(fog);
    }

    heroSprite = new PIXI.Sprite(heroTex);
    heroSprite.anchor.set(0.5, 1);
    const hScale = (H * 0.55) / heroTex.height;
    heroSprite.scale.set(hScale);
    S.heroX = W * 0.18; S.heroY = H * 0.88;
    heroSprite.x = S.heroX; heroSprite.y = S.heroY;
    const heroFilter = new PIXI.filters.ColorMatrixFilter();
    heroFilter.brightness(0.35, false);
    heroFilter.saturate(0.3, true);
    heroFilter.contrast(1.3, true);
    heroSprite.filters = [heroFilter];
    sceneRoot.addChild(heroSprite);

    heroLight = new PIXI.Graphics();
    sceneRoot.addChild(heroLight);

    bossSprite = new PIXI.Sprite(bossTex);
    bossSprite.anchor.set(0.5, 1);
    const bScale = (H * 0.6) / bossTex.height;
    bossSprite.scale.set(bScale);
    S.bossX = W * 0.78; S.bossY = H * 0.88;
    bossSprite.x = S.bossX; bossSprite.y = S.bossY;
    bossSprite.scale.x *= -1;
    const bossFilter = new PIXI.filters.ColorMatrixFilter();
    bossFilter.brightness(0.4, false);
    bossFilter.saturate(0.4, true);
    bossFilter.contrast(1.25, true);
    bossSprite.filters = [bossFilter];
    sceneRoot.addChild(bossSprite);

    bossLight = new PIXI.Graphics();
    sceneRoot.addChild(bossLight);

    slashGfx = new PIXI.Graphics();
    sceneRoot.addChild(slashGfx);

    flashGfx = new PIXI.Graphics();
    sceneRoot.addChild(flashGfx);

    vignetteGfx = new PIXI.Graphics();
    sceneRoot.addChild(vignetteGfx);

    letterboxGfx = new PIXI.Graphics();
    sceneRoot.addChild(letterboxGfx);

    grainGfx = new PIXI.Graphics();
    sceneRoot.addChild(grainGfx);
    grainGfx.alpha = 0.04;

    heroHpBar = new PIXI.Graphics();
    sceneRoot.addChild(heroHpBar);
    bossHpBar = new PIXI.Graphics();
    sceneRoot.addChild(bossHpBar);

    heroHpLabel = new PIXI.Text('Герой', { fontFamily: 'Georgia', fontSize: 14, fill: 0xd4a574, fontWeight: 'bold' });
    heroHpLabel.x = 30; heroHpLabel.y = 45;
    sceneRoot.addChild(heroHpLabel);

    bossHpLabel = new PIXI.Text('Змей Лени', { fontFamily: 'Georgia', fontSize: 14, fill: 0xd4a574, fontWeight: 'bold' });
    bossHpLabel.anchor.x = 1;
    bossHpLabel.x = W - 30; bossHpLabel.y = 45;
    sceneRoot.addChild(bossHpLabel);

    drawHpBars();
}

function drawHpBars(heroPct, bossPct, heroText, bossText) {
    if (!heroHpBar) return;
    heroPct = heroPct !== undefined ? Math.max(0, Math.min(1, heroPct)) : 1;
    bossPct = bossPct !== undefined ? Math.max(0, Math.min(1, bossPct)) : 1;

    heroHpBar.clear();
    heroHpBar.beginFill(0x000000, 0.8); heroHpBar.drawRoundedRect(28, 63, 404, 16, 3); heroHpBar.endFill();
    heroHpBar.beginFill(0x1a1010); heroHpBar.drawRoundedRect(30, 65, 400, 12, 2); heroHpBar.endFill();
    if (heroPct > 0) {
        heroHpBar.beginFill(0xc73e4d); heroHpBar.drawRoundedRect(30, 65, 400 * heroPct, 12, 2); heroHpBar.endFill();
        heroHpBar.beginFill(0xffffff, 0.2); heroHpBar.drawRoundedRect(30, 65, 400 * heroPct, 4, 2); heroHpBar.endFill();
    }
    heroHpBar.lineStyle(1, 0xd4a574, 0.4); heroHpBar.drawRoundedRect(30, 65, 400, 12, 2);

    bossHpBar.clear();
    bossHpBar.beginFill(0x000000, 0.8); bossHpBar.drawRoundedRect(W - 432, 63, 404, 16, 3); bossHpBar.endFill();
    bossHpBar.beginFill(0x1a1010); bossHpBar.drawRoundedRect(W - 430, 65, 400, 12, 2); bossHpBar.endFill();
    if (bossPct > 0) {
        const bx = W - 430;
        bossHpBar.beginFill(0x8b2635); bossHpBar.drawRoundedRect(bx + 400 * (1-bossPct), 65, 400 * bossPct, 12, 2); bossHpBar.endFill();
        bossHpBar.beginFill(0xffffff, 0.15); bossHpBar.drawRoundedRect(bx + 400 * (1-bossPct), 65, 400 * bossPct, 4, 2); bossHpBar.endFill();
    }
    bossHpBar.lineStyle(1, 0xd4a574, 0.4); bossHpBar.drawRoundedRect(W - 430, 65, 400, 12, 2);

    if (heroText && heroHpLabel) heroHpLabel.text = heroText;
    if (bossText && bossHpLabel) bossHpLabel.text = bossText;
}

function drawLighting(t) {
    const flick = S.torch;
    const torchX = 90, torchY = 350;

    torchGlow.clear();
    torchGlow.beginFill(0xff8c38, 0.18 * flick);
    const r1 = 280 * flick;
    torchGlow.drawCircle(torchX, torchY, r1);
    torchGlow.endFill();
    torchGlow.beginFill(0xff6020, 0.1 * flick);
    torchGlow.drawCircle(torchX, torchY, 180 * flick);
    torchGlow.endFill();
    torchGlow.beginFill(0xffd080, 0.05 * flick);
    torchGlow.drawCircle(torchX, torchY, 80);
    torchGlow.endFill();
    torchGlow.blendMode = PIXI.BLEND_MODES.ADD;

    heroLight.clear();
    heroLight.beginFill(0xff8030, 0.15 * flick);
    heroLight.drawCircle(S.heroX - 30, S.heroY - 120, 120);
    heroLight.endFill();
    heroLight.beginFill(0xffa050, 0.08 * flick);
    heroLight.drawCircle(S.heroX - 20, S.heroY - 100, 60);
    heroLight.endFill();
    heroLight.blendMode = PIXI.BLEND_MODES.ADD;

    bossLight.clear();
    const auraColor = S.bossStage >= 3 ? 0x8030c0 : S.bossStage >= 2 ? 0xc02020 : 0x603020;
    bossLight.beginFill(auraColor, 0.1 + Math.sin(t * 0.004) * 0.05);
    bossLight.drawCircle(S.bossX + 20, S.bossY - 150, 130);
    bossLight.endFill();
    bossLight.blendMode = PIXI.BLEND_MODES.ADD;
}

function drawFog(t) {
    for (let i = 0; i < fogParts.length; i++) {
        const fog = fogParts[i];
        fog.clear();
        const offset = (t * 0.02 * fog._speed + fog._offset) % (W + 400);
        fog.beginFill(0xb0b0c0, 0.5);
        fog.drawCircle(offset - 200, H * 0.72 + i * 20, 200);
        fog.drawCircle(offset, H * 0.74 + i * 20, 180);
        fog.drawCircle(offset + 200, H * 0.72 + i * 20, 200);
        fog.endFill();
        fog.alpha = 0.04 + Math.sin(t * 0.001 + i) * 0.02;
        fog.blendMode = PIXI.BLEND_MODES.SCREEN;
    }
}

function drawVignette() {
    if (!vignetteGfx) return;
    vignetteGfx.clear();
    vignetteGfx.beginFill(0x000000, 0);
    vignetteGfx.drawRect(0, 0, W, H);
    vignetteGfx.endFill();
    for (let r = 0.6; r < 0.9; r += 0.05) {
        vignetteGfx.beginFill(0x000000, 0.04);
        vignetteGfx.drawCircle(W/2, H/2, W * r);
        vignetteGfx.endFill();
    }
    vignetteGfx.beginFill(0x000000, 0.4);
    vignetteGfx.drawRect(0, 0, W, H);
    vignetteGfx.endFill();
    vignetteGfx.beginHole();
    vignetteGfx.drawCircle(W/2, H/2, W * 0.35);
    vignetteGfx.endHole();
}

function drawLetterbox() {
    if (!letterboxGfx) return;
    const lbH = H * 0.05;
    letterboxGfx.clear();
    letterboxGfx.beginFill(0x000000);
    letterboxGfx.drawRect(0, 0, W, lbH);
    letterboxGfx.drawRect(0, H - lbH, W, lbH);
    letterboxGfx.endFill();
}

function updateGrain() {
    if (!grainGfx) return;
    grainGfx.clear();
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const v = Math.floor(Math.random() * 255);
        grainGfx.beginFill((v << 16) | (v << 8) | v, 0.3);
        grainGfx.drawRect(x, y, 1, 1);
        grainGfx.endFill();
    }
}

function spawnEmber() {
    const g = new PIXI.Graphics();
    g.beginFill(0xff8030); g.drawCircle(0, 0, 1 + Math.random() * 2); g.endFill();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    g._vx = (Math.random() - 0.3) * 0.5;
    g._vy = -0.5 - Math.random() * 1;
    g._life = 1;
    g._decay = 0.003 + Math.random() * 0.004;
    g.x = 80 + Math.random() * 40;
    g.y = 340;
    sceneRoot.addChild(g);
    embers.push(g);
}

function spawnParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(color); g.drawCircle(0, 0, 2 + Math.random() * 3); g.endFill();
        g.blendMode = PIXI.BLEND_MODES.ADD;
        const a = Math.random() * Math.PI * 2;
        g._vx = Math.cos(a) * speed * (0.3 + Math.random() * 0.7);
        g._vy = Math.sin(a) * speed * (0.3 + Math.random() * 0.7) - 1;
        g._life = 1;
        g._decay = 0.015 + Math.random() * 0.025;
        g._grav = 0.05;
        g.x = x; g.y = y;
        sceneRoot.addChild(g);
        particles.push(g);
    }
}

function spawnDamageNumber(x, y, text, color, isCrit) {
    const t = new PIXI.Text(text, {
        fontFamily: 'Georgia', fontSize: isCrit ? 36 : 26,
        fill: color, fontWeight: 'bold',
        stroke: 0x000000, strokeThickness: 3
    });
    t.anchor.set(0.5);
    t.x = x; t.y = y;
    t._vy = -1.5;
    t._life = 1;
    t._decay = 0.012;
    sceneRoot.addChild(t);
    damageNums.push(t);
}

function drawSlash(progress, color) {
    slashGfx.clear();
    if (progress >= 1) return;
    const alpha = Math.sin(progress * Math.PI);
    const fromX = S.heroX + 50, fromY = S.heroY - 150;
    const toX = S.bossX - 50, toY = S.bossY - 150;
    const midX = (fromX + toX) / 2, midY = (fromY + toY) / 2 - 80;
    slashGfx.lineStyle(6 * (1 - progress * 0.5), color, alpha);
    slashGfx.shadowBlur = 20;
    slashGfx.moveTo(fromX, fromY);
    const steps = 15;
    for (let i = 1; i <= steps * progress; i++) {
        const tt = i / steps;
        const x = (1-tt)*(1-tt)*fromX + 2*(1-tt)*tt*midX + tt*tt*toX;
        const y = (1-tt)*(1-tt)*fromY + 2*(1-tt)*tt*midY + tt*tt*toY;
        slashGfx.lineTo(x, y);
    }
    slashGfx.lineStyle(2, 0xffffff, alpha * 0.5);
    slashGfx.moveTo(fromX, fromY);
    for (let i = 1; i <= steps * progress; i++) {
        const tt = i / steps;
        const x = (1-tt)*(1-tt)*fromX + 2*(1-tt)*tt*midX + tt*tt*toX;
        const y = (1-tt)*(1-tt)*fromY + 2*(1-tt)*tt*midY + tt*tt*toY;
        slashGfx.lineTo(x, y);
    }
}

function drawFlash() {
    flashGfx.clear();
    if (S.flash > 0.01) {
        const c = S.flashColor;
        const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
        flashGfx.beginFill((r << 16) | (g << 8) | b, S.flash);
        flashGfx.drawRect(0, 0, W, H);
        flashGfx.endFill();
    }
}

let slashState = null;

function triggerImpact(attacker, dmg, crit) {
    if (attacker === 'hero') {
        S.flash = crit ? 0.7 : 0.5; S.flashColor = 0xffffff;
        S.shake = crit ? 20 : 12;
        S.hitStop = performance.now() + (crit ? 90 : 60);
        S.bossSq = crit ? 0.75 : 0.85;
        bossSprite.scale.y = bBaseScaleY * (crit ? 1.2 : 1.1);
        slashState = { progress: 0, color: crit ? 0xfbbf24 : 0xfff0d0 };
        spawnParticles(S.bossX, S.heroY - 150, crit ? 35 : 18, crit ? 0xfbbf24 : 0xc73e4d, 3);
        spawnDamageNumber(S.bossX, S.heroY - 200, '-' + dmg + (crit ? ' КРИТ!' : ''), crit ? 0xfbbf24 : 0xe74c3c, crit);
    } else {
        S.flash = 0.5; S.flashColor = 0xc73e4d;
        S.shake = 24;
        S.hitStop = performance.now() + 100;
        S.heroSq = 0.8;
        heroSprite.scale.y = hBaseScaleY * 1.15;
        spawnParticles(S.heroX, S.heroY - 150, 25, 0x8b1414, 2.5);
        spawnDamageNumber(S.heroX, S.heroY - 200, '-' + dmg + ' HP', 0xc73e4d, false);
    }
}

let hBaseScaleY = 1, bBaseScaleY = 1;

function updateAnims(dt) {
    const now = performance.now();
    S.torch = 0.82 + Math.sin(S.time * 8) * 0.1 + Math.sin(S.time * 23) * 0.06 + Math.random() * 0.04;

    if (heroSprite) {
        if (S.heroAnim === 'idle') {
            heroSprite.x = S.heroX;
            heroSprite.y = S.heroY + Math.sin(S.time * 2) * 2;
            heroSprite.rotation = Math.sin(S.time * 1.5) * 0.01;
        }
        heroSprite.scale.x = hBaseScaleX * S.heroSq;
        if (Math.abs(S.heroSq - 1) > 0.01) S.heroSq += (1 - S.heroSq) * 0.15;
        else S.heroSq = 1;
        heroSprite.scale.y += (hBaseScaleY - heroSprite.scale.y) * 0.15;
    }

    if (bossSprite) {
        if (S.bossAnim === 'idle') {
            bossSprite.x = S.bossX;
            bossSprite.y = S.bossY + Math.sin(S.time * 1.8 + 1.5) * 3;
            bossSprite.rotation = Math.sin(S.time * 1.2 + 1) * 0.015;
        }
        bossSprite.scale.x = -bBaseScaleX * S.bossSq;
        if (Math.abs(S.bossSq - 1) > 0.01) S.bossSq += (1 - S.bossSq) * 0.15;
        else S.bossSq = 1;
        bossSprite.scale.y += (bBaseScaleY - bossSprite.scale.y) * 0.15;
    }

    if (slashState) {
        slashState.progress += 0.07 * dt;
        drawSlash(slashState.progress, slashState.color);
        if (slashState.progress >= 1) slashState = null;
    } else slashGfx.clear();

    S.flash *= Math.pow(0.8, dt);
    drawFlash();

    if (S.shake > 0.5) {
        sceneRoot.x = (Math.random() - 0.5) * S.shake;
        sceneRoot.y = (Math.random() - 0.5) * S.shake;
        S.shake *= Math.pow(0.85, dt);
    } else { sceneRoot.x = 0; sceneRoot.y = 0; }

    S.tweens = S.tweens.filter(tw => {
        tw.elapsed += dt / 60;
        const t = Math.min(1, tw.elapsed / tw.dur);
        tw.update(t);
        if (t >= 1) { if (tw.onDone) tw.onDone(); return false; }
        return true;
    });
}

function gameLoop(dt) {
    S.time += dt / 60;
    const frozen = performance.now() < S.hitStop;

    const bossView = document.getElementById('view-boss');
    if (!bossView || !bossView.classList.contains('active')) return;

    if (!frozen) {
        updateAnims(dt);
        drawLighting(S.time * 1000);
        drawFog(S.time * 1000);

        if (Math.random() < 0.3 * dt) spawnEmber();

        for (let i = embers.length - 1; i >= 0; i--) {
            const e = embers[i];
            e.x += e._vx * dt; e.y += e._vy * dt;
            e._vy -= 0.01 * dt;
            e._life -= e._decay * dt;
            e.alpha = e._life * 0.7 * (0.6 + Math.random() * 0.4);
            if (e._life <= 0) { sceneRoot.removeChild(e); e.destroy(); embers.splice(i, 1); }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p._vx * dt; p.y += p._vy * dt;
            p._vy += p._grav * dt;
            p._life -= p._decay * dt;
            p.alpha = p._life;
            p.scale.set(p._life);
            if (p._life <= 0) { sceneRoot.removeChild(p); p.destroy(); particles.splice(i, 1); }
        }

        for (let i = damageNums.length - 1; i >= 0; i--) {
            const d = damageNums[i];
            d.y += d._vy * dt;
            d._life -= d._decay * dt;
            d.alpha = Math.min(1, d._life * 1.5);
            if (d._life <= 0) { sceneRoot.removeChild(d); d.destroy(); damageNums.splice(i, 1); }
        }

        if (Math.random() < 0.15) updateGrain();
    }
}

var hBaseScaleX = 1;

window.startHeroAttack = function(dmg, crit) {
    if (S.heroAnim !== 'idle' || S.defeated) return;
    S.heroAnim = 'attacking';
    hBaseScaleX = heroSprite.scale.x; hBaseScaleY = heroSprite.scale.y;

    tween(t => { heroSprite.x = S.heroX - 20 * ease.out(t); heroSprite.rotation = -0.06 * ease.out(t); }, 0.15, () => {
        tween(t => { heroSprite.x = S.heroX - 20 + 160 * ease.inOut(t); heroSprite.rotation = -0.06 + 0.12 * ease.inOut(t); }, 0.13, () => {
            triggerImpact('hero', dmg, crit);
            tween(t => { heroSprite.x = S.heroX + 140 * (1 - ease.outQuad(t)); heroSprite.rotation = 0.06 * (1 - ease.outQuad(t)); }, 0.25, () => {
                S.heroAnim = 'idle';
            });
        });
    });
};

window.startBossAttack = function(dmg) {
    if (S.bossAnim !== 'idle' || S.defeated) return;
    S.bossAnim = 'attacking';
    bBaseScaleY = bossSprite.scale.y;

    tween(t => { bossSprite.x = S.bossX + 25 * ease.out(t); bossSprite.rotation = 0.07 * ease.out(t); }, 0.18, () => {
        tween(t => { bossSprite.x = S.bossX + 25 - 180 * ease.inOut(t); bossSprite.rotation = 0.07 - 0.1 * ease.inOut(t); }, 0.14, () => {
            triggerImpact('boss', dmg, false);
            tween(t => { bossSprite.x = S.bossX - 155 * (1 - ease.outQuad(t)); bossSprite.rotation = -0.03 * (1 - ease.outQuad(t)); }, 0.28, () => {
                S.bossAnim = 'idle';
            });
        });
    });
};

window.updateHP = function(heroHp, heroMaxHp, bossHp, bossMaxHp, bossName, stageNum, bType) {
    if (heroHpLabel) heroHpLabel.text = Math.round(heroHp) + '/' + heroMaxHp;
    if (bossHpLabel && bossName) bossHpLabel.text = bossName;
    drawHpBars(heroHp / heroMaxHp, bossHp / bossMaxHp);
    if (typeof stageNum === 'number') S.bossStage = stageNum + 1;
    if (bType) S.bossType = bType;
};

window.setBossDefeated = function(val) {
    S.defeated = !!val;
};

window.setBossType = function(type) { S.bossType = type; };

init();
})();
