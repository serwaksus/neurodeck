const test = require('node:test');
const assert = require('node:assert/strict');
// Campaign 2.0 C6-lite: эндгейм-ротация модификаторов недели (CAMPAIGN-2.0.md §5) — каталог WEEKLY_MODS
// (stronghold-data), детерминированный выбор по (season.num, siege.week) без бэкенда, гейт 20/20,
// чистые множители в stronghold-model (те же три ключа, что у правил провинций C3).
const SM = require('../js/stronghold-model.js');
const DATA = require('../js/stronghold-data.js');
globalThis.StrongholdData = DATA; // catalog() модели
const WM = DATA.WEEKLY_MODS;

test('каталог WEEKLY_MODS: 6–8 записей, уникальные id, тексты для UI, mods {incomeMult, upkeepMult, siegeMult} в (0; 3]', () => {
    assert.ok(Array.isArray(WM) && WM.length >= 6 && WM.length <= 8, '6–8 модификаторов, сейчас ' + (WM ? WM.length : 'нет'));
    const ids = new Set(WM.map((m) => m.id));
    assert.equal(ids.size, WM.length, 'id уникальны');
    WM.forEach((m) => {
        assert.equal(typeof m.id, 'string', m.id + '.id');
        ['icon', 'name', 'desc'].forEach((k) => assert.equal(typeof m[k], 'string', m.id + '.' + k + ' — строка для UI-строки панели'));
        ['incomeMult', 'upkeepMult', 'siegeMult'].forEach((k) => {
            const v = m.mods[k];
            assert.ok(typeof v === 'number' && isFinite(v) && v > 0 && v <= 3, m.id + '.mods.' + k + ' = ' + v);
        });
    });
});

test('тематические пины §5: «Неделя тумана» и «Неделя жадности» в каталоге; каждая неделя — трейд-офф (множитель ≠ 1)', () => {
    const byId = {};
    WM.forEach((m) => byId[m.id] = m);
    assert.ok(byId.fog, '«Неделя тумана» из спеки §5');
    assert.ok(byId.greed, '«Неделя жадности» из спеки §5');
    WM.forEach((m) => {
        const off = [m.mods.incomeMult, m.mods.upkeepMult, m.mods.siegeMult].some((v) => v !== 1);
        assert.ok(off, m.id + ': нейтральная неделя не имеет смысла в ротации');
    });
});

test('детерминизм: выбор стабилен между вызовами и пиннут по паре (season, week)', () => {
    for (let call = 0; call < 3; call++) {
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed');
        assert.equal(SM.weeklyModifierOf(1, 2).id, 'storm');
        assert.equal(SM.weeklyModifierOf(2, 1).id, 'greed');
        assert.equal(SM.weeklyModifierOf(3, 1).id, 'lent');
    }
    assert.equal(SM.weeklyModifierOf('1', '1').id, SM.weeklyModifierOf(1, 1).id, 'числовые строки эквивалентны');
    [0, -1, NaN, undefined, null, Infinity].forEach((v) => {
        assert.ok(SM.weeklyModifierOf(v, v), 'мусорные входы (' + v + ') не ломают выбор');
    });
});

test('ротация: сезон 1 недели 1–12 пиннут; за 6 сезонов × 26 недель достижим весь каталог', () => {
    const s1 = Array.from({ length: 12 }, (_, i) => SM.weeklyModifierOf(1, i + 1).id);
    assert.deepEqual(s1, ['greed', 'storm', 'greed', 'lent', 'fog', 'storm', 'goldvein', 'greed', 'stillness', 'lent', 'fog', 'feast']);
    const seen = new Set();
    for (let s = 1; s <= 6; s++) for (let w = 1; w <= 26; w++) seen.add(SM.weeklyModifierOf(s, w).id);
    assert.equal(seen.size, WM.length, 'все модификаторы достижимы (нет «мёртвых» недель)');
});

test('гейт 20/20: endgame=false → все множители 1 даже у «Жадности»; endgame=true → значения каталога', () => {
    assert.equal(SM.weeklyIncomeMult(1, 1, false), 1);
    assert.equal(SM.weeklyUpkeepMult(1, 1, false), 1);
    assert.equal(SM.weeklySiegeMult(1, 1, false), 1);
    assert.equal(SM.weeklyIncomeMult(1, 1, true), 1.3, '«Жадность» (1,1): налоги ×1.3');
    assert.equal(SM.weeklyUpkeepMult(1, 1, true), 1.3, '«Жадность» (1,1): содержание ×1.3');
    assert.equal(SM.weeklySiegeMult(1, 5, true), 0.8, '«Туман» (1,5): осады ×0.8');
    assert.equal(SM.weeklyIncomeMult(1, 5, true), 1, '«Туман»: налоги не трогает');
    for (let s = 1; s <= 4; s++) for (let w = 1; w <= 16; w++) {
        const m = SM.weeklyModifierOf(s, w);
        assert.equal(SM.weeklyIncomeMult(s, w, true), m.mods.incomeMult, 'income (' + s + ',' + w + ')');
        assert.equal(SM.weeklyUpkeepMult(s, w, true), m.mods.upkeepMult, 'upkeep (' + s + ',' + w + ')');
        assert.equal(SM.weeklySiegeMult(s, w, true), m.mods.siegeMult, 'siege (' + s + ',' + w + ')');
    }
    [undefined, null, 0, 1, 'yes'].forEach((v) => assert.equal(SM.weeklyIncomeMult(1, 1, v), 1, 'endgame=' + JSON.stringify(v) + ' → вне ротации'));
});

test('robustness: без каталога / пустой каталог / кривые mods → null и 1 (экономика не ломается)', () => {
    const saved = globalThis.StrongholdData;
    try {
        globalThis.StrongholdData = undefined;
        assert.equal(SM.weeklyModifierOf(1, 1), null);
        assert.equal(SM.weeklyIncomeMult(1, 1, true), 1);
        assert.equal(SM.weeklyUpkeepMult(1, 1, true), 1);
        assert.equal(SM.weeklySiegeMult(1, 1, true), 1);
        globalThis.StrongholdData = { WEEKLY_MODS: [] };
        assert.equal(SM.weeklyModifierOf(1, 1), null, 'пустой каталог → нет модификатора');
        globalThis.StrongholdData = { WEEKLY_MODS: [{ id: 'bad', mods: { incomeMult: NaN, upkeepMult: 0, siegeMult: 9 } }] };
        assert.equal(SM.weeklyModifierOf(1, 1).id, 'bad');
        assert.equal(SM.weeklyIncomeMult(1, 1, true), 1, 'NaN → 1');
        assert.equal(SM.weeklyUpkeepMult(1, 1, true), 1, '0 → 1');
        assert.equal(SM.weeklySiegeMult(1, 1, true), 1, '9 (> капа 3) → 1');
    } finally {
        globalThis.StrongholdData = saved;
    }
});

test('corruptionTick: недельный upkeep перемножается с провинцией одним множителем (паттерн тика app.js)', () => {
    const b = { zh1: { built: true, corruptionStage: 'ok', debtDays: 0 }, zh2: { built: true, corruptionStage: 'ok', debtDays: 0 } };
    const base = DATA.BUILDINGS.zh1.upkeep + DATA.BUILDINGS.zh2.upkeep; // 3 + 8 = 11
    const combined = SM.provinceUpkeepMult(4) * SM.weeklyUpkeepMult(1, 1, true); // Пепел 1.1 × Жадность 1.3 = 1.43
    const r = SM.corruptionTick(b, 1000, 3, { provinceUpkeepMult: combined });
    assert.ok(combined <= 3, 'произведение не выходит за кламп (0; 3] модели');
    assert.equal(r.upkeep, Math.round(base * combined), 'round(11×1.43) — одно округление, как в превью');
});

test('parity ре-пин C6: (сезон 1, неделя 1) = «Жадность» ×1.3 → 20/20 доход 16117, корона 17729', () => {
    assert.equal(SM.weeklyModifierOf(1, 1).id, 'greed', 'харнес parity сброса живёт на (сезон 1, неделя 1)');
    let taxes = Math.round(8984 * 1.38); // Σ налогов C3 (Пепел ×1.1) × маршруты 19 (кап +38%) = 12398 (пин круга 6)
    taxes = Math.round(taxes * 1.3); // C6: «Жадность» ×1.3 — авторизовано дизайном (CAMPAIGN-2.0 §5)
    assert.equal(taxes, 16117, 'пин 1b-доход qa-economy-parity');
    assert.equal(Math.round(taxes * 1.10), 17729, 'пин 1b-доход + корона III');
});

test('app.js: множители применены ровно в 2 местах каждый (тик+превью / осада+тревога), гварды и гейт на месте', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
    assert.equal((app.match(/weeklyModsNow\(\)\.income/g) || []).length, 2, 'доход: strongholdsDailyTick + shIncomePerDay');
    assert.equal((app.match(/weeklyModsNow\(\)\.upkeep/g) || []).length, 2, 'содержание: strongholdsDailyTick + shUpkeepPerDay');
    assert.equal((app.match(/weeklyModsNow\(\)\.siege/g) || []).length, 2, 'осада врага: runWeeklySiege + siegeAlarmPreview');
    ['weeklyIncomeMult', 'weeklyUpkeepMult', 'weeklySiegeMult'].forEach((k) => {
        assert.ok(app.includes('(SM && SM.' + k + ') ? SM.' + k + '('), 'typeof-гвард вызова ' + k);
    });
    assert.ok(app.includes('function weeklyEndgame() { return capturedCount() >= STRONGHOLDS.length; }'), 'гейт ротации = 20/20');
    assert.ok(app.includes('html += weeklyModifierLineHtml();'), 'строка модификатора недели в панели Твердынь');
});
