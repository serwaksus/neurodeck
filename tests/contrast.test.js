// Контраст токенов (WCAG 2.x, фаза 7 плана визуала): пары «текст на поверхности» из словаря :root.
// Считаем по hex-токенам style.css — правка палитры, роняющая читаемость, краснит CI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
function token(name) {
    const m = css.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})\\b'));
    assert.ok(m, 'токен --' + name + ' (hex) не найден');
    return m[1];
}
function lum(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

const SURFACES = ['s0', 's1', 's2', 's3', 's4'];

test('текст --tx-1 и --tx-2 читаем (AA ≥ 4.5) на всех ступенях поверхности', () => {
    for (const t of ['tx-1', 'tx-2']) for (const s of SURFACES) {
        const r = ratio(token(t), token(s));
        assert.ok(r >= 4.5, '--' + t + ' на --' + s + ': ' + r.toFixed(2));
    }
});

test('--tx-3 (подсказки/неактивное) ≥ 3 на поверхностях s0…s2', () => {
    for (const s of ['s0', 's1', 's2']) { const r = ratio(token('tx-3'), token(s)); assert.ok(r >= 3, '--tx-3 на --' + s + ': ' + r.toFixed(2)); }
});

test('акценты (награда/угроза/успех/магия/инфо) читаемы как текст на s1 (AA ≥ 4.5)', () => {
    for (const a of ['ac-reward', 'ac-threat', 'ac-success', 'ac-arcane', 'ac-info']) {
        const r = ratio(token(a), token('s1'));
        assert.ok(r >= 4.5, '--' + a + ': ' + r.toFixed(2));
    }
});

test('текст материалов рангов читаем на своей заливке поверх s2 (AA ≥ 4.5)', () => {
    for (const m of ['iron', 'steel', 'arcane', 'gilded']) {
        const r = ratio(token('mat-' + m + '-text'), token('s2'));
        assert.ok(r >= 4.5, 'mat-' + m + '-text: ' + r.toFixed(2));
    }
});

test('исторические токены: --text и --text-dim на --bg-deep (AA)', () => {
    assert.ok(ratio(token('text'), token('bg-deep')) >= 7);
    assert.ok(ratio(token('text-dim'), token('bg-deep')) >= 4.5);
});
