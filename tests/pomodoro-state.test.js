'use strict';
// Ф0.5 (аудит 2026-10-03): флаги помодоро переехали из localStorage (nd_pomodoro_*) в сейв
// (HERO.pomodoro). Здесь: санитизация нового поля по образцу state-guards.test.js
// и контракты исходника app.js — старые ключи читает только одноразовая миграция.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SG = require('../js/state-guards.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

const mskDay = (offsetDays) => new Date(Date.now() + 3 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10); // МСК-день, как в sanitizeHero/getMSKDayKey

// ----------------------------------------------------------------
// Санитизация HERO.pomodoro
// ----------------------------------------------------------------

test('sanitizeHero/pomodoro: валидное состояние проходит раундтрип', () => {
    const tk = mskDay(0);
    const p = { active: { 7: Date.now() + 60000, 12: Date.now() + 120000 }, done: {} };
    p.done['7_' + tk] = tk;
    const out = SG.sanitizeHero({ pomodoro: p }).pomodoro;
    assert.deepEqual(out, { active: { 7: p.active[7], 12: p.active[12] }, done: { ['7_' + tk]: tk } });
    assert.deepEqual(SG.sanitizeHero({ pomodoro: JSON.parse(JSON.stringify(out)) }).pomodoro, out, 'повторная санитизация стабильна');
});

test('sanitizeHero/pomodoro: битые таймеры active выкидываются, истёкшие — живут (награду выдаст sweep)', () => {
    const expired = Date.now() - 1000;
    const out = SG.sanitizeHero({ pomodoro: { active: { 7: expired, abc: Date.now() + 60000, 8: NaN, 9: 0, 10: -5, 11: '25:00', 12: 1e16 }, done: {} } }).pomodoro;
    assert.deepEqual(out, { active: { 7: expired }, done: {} });
});

test('sanitizeHero/pomodoro: done хранит только сегодня и только согласованные ключ/значение', () => {
    const tk = mskDay(0), yk = mskDay(-1);
    const out = SG.sanitizeHero({ pomodoro: { active: {}, done: {
        ['7_' + tk]: tk,            // валидно
        ['8_' + tk]: '2000-01-01',  // значение != день ключа
        ['9_' + yk]: yk,            // вчерашний хвост капа
        junk: tk,                   // мусорный ключ
        ['10_день']: tk             // не-числовой id
    } } }).pomodoro;
    assert.deepEqual(out.done, { ['7_' + tk]: tk });
});

test('sanitizeHero/pomodoro: нет поля/мусор/пусто → null (старые сейвы v14 грузятся, поле ленивое)', () => {
    assert.equal(SG.sanitizeHero({}).pomodoro, null);
    assert.equal(SG.sanitizeHero(null).pomodoro, null);
    assert.equal(SG.sanitizeHero({ pomodoro: 'nd_pomodoro_7' }).pomodoro, null);
    assert.equal(SG.sanitizeHero({ pomodoro: ['x'] }).pomodoro, null);
    assert.equal(SG.sanitizeHero({ pomodoro: { active: {}, done: {} } }).pomodoro, null, 'пустое = фичу не включали');
});

// ----------------------------------------------------------------
// Контракты исходника app.js: флаги живут в сейве, localStorage — только миграция
// ----------------------------------------------------------------

test('контракт: nd_pomodoro_* в app.js трогает только migratePomodoroFlags', () => {
    const migStart = app.indexOf('function migratePomodoroFlags(');
    assert.ok(migStart > -1, 'миграция объявлена');
    let depth = 0, migEnd = -1;
    for (let i = app.indexOf('{', migStart); i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) { migEnd = i; break; } }
    }
    assert.ok(migEnd > -1);
    let idx = -1, stray = -1;
    while ((idx = app.indexOf('nd_pomodoro', idx + 1)) !== -1) {
        if (idx < migStart || idx > migEnd) { stray = idx; break; }
    }
    assert.equal(stray, -1, 'вне миграции старых ключей нет: ни чтения, ни записи');
    assert.ok(!/localStorage\.setItem\(\s*'nd_pomodoro/.test(app), 'записи в старые ключи нет вообще');
});

test('контракт: состояние в HERO.pomodoro, миграция — сразу после загрузки сейва', () => {
    assert.ok(app.includes('HERO.pomodoro'), 'дом поля — HERO.pomodoro (едет в сейв через hero: HERO)');
    assert.ok(app.includes('function pomodoroState()'), 'единая точка доступа pomodoroState()');
    assert.ok(app.indexOf('loadGameState();') < app.indexOf('migratePomodoroFlags();'), 'миграция после loadGameState — переносим в уже загруженный сейв');
});
