#!/usr/bin/env node
'use strict';
// «Храповик» дизайн-системы (план docs/plan/VISUAL-MAX-2026-10-02.md, фаза 0.3): считает литералы, которые
// должны жить в токенах :root, и не даёт им РАСТИ. Цифры в tools/css-lint.baseline.json можно только
// уменьшать (по мере миграции на токены); рост = красный check:ui. `--update` фиксирует достигнутое (только вниз).
//   node tools/css-lint.cjs            — проверка
//   node tools/css-lint.cjs --update   — записать baseline (разрешено лишь если ничего не выросло)
//   node tools/css-lint.cjs --report   — таблица метрик
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const BASE = path.join(__dirname, 'css-lint.baseline.json');
const TYPE_SCALE = [11, 13, 15, 17, 20, 26, 34]; // допустимые font-size в px

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }
// вырезает содержимое блоков :root { ... } (там литералы разрешены — это и есть токены)
function stripRootBlocks(css) {
    let out = '', i = 0;
    while (i < css.length) {
        const m = css.slice(i).match(/(^|[}\s;])(:root(?:\[[^\]]*\])?)\s*\{/);
        if (!m) { out += css.slice(i); break; }
        const start = i + m.index + m[1].length;
        out += css.slice(i, start);
        let depth = 0, j = start + m[2].length;
        for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}') { depth--; if (depth === 0) { j++; break; } } }
        i = j;
    }
    return out;
}

function metrics() {
    const css = stripComments(fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8'));
    const body = stripRootBlocks(css);
    const count = (re, s) => (s.match(re) || []).length;
    const sizes = (body.match(/font-size:\s*[0-9.]+px/g) || []).map((x) => parseFloat(x.replace(/[^0-9.]/g, '')));
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    return {
        hexLiterals: count(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g, body.replace(/url\([^)]*\)/g, '')),
        rgbaLiterals: count(/rgba?\(\s*\d/g, body),
        zIndexLiterals: count(/z-index:\s*-?\d/g, body),
        importants: count(/!important/g, css),
        fontSizeOffScale: sizes.filter((n) => !TYPE_SCALE.includes(n)).length,
        fontSizeBelow11: sizes.filter((n) => n < 11).length,
        inlineStylesInJs: count(/style="/g, app),
    };
}

// Защита от «съеденных» правил: преждевременный `*/` внутри комментария (напр. в перечислении «.a/.b*/.c») оставляет остаток
// комментария как мусорный селектор и тихо глушит СЛЕДУЮЩЕЕ правило. Селекторы с кириллицей = мусор.
(function sanity() {
    const css = stripComments(fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8'));
    const bad = [];
    css.replace(/(^|[};])\s*([^{};@]+)\{/g, (m, a, sel) => { if (/[А-Яа-яЁё]/.test(sel)) bad.push(sel.trim().slice(0, 80)); return m; });
    let depth = 0; for (const ch of css) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (bad.length || depth !== 0) {
        console.error('css-lint FAIL — битый CSS: ' + (depth !== 0 ? 'несбалансированные скобки (' + depth + ')' : '') + (bad.length ? ' селекторы с кириллицей (след обрезанного комментария?): ' + JSON.stringify(bad.slice(0, 3)) : ''));
        process.exit(1);
    }
})();

const cur = metrics();
const mode = process.argv[2] || '';
if (mode === '--report') { console.table(cur); process.exit(0); }
let base = null;
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch (e) {}
if (mode === '--update') {
    if (base) {
        const grew = Object.keys(cur).filter((k) => cur[k] > (base[k] === undefined ? Infinity : base[k]));
        if (grew.length) { console.error('css-lint: --update запрещён, метрики выросли: ' + grew.join(', ')); process.exit(1); }
    }
    fs.writeFileSync(BASE, JSON.stringify(cur, null, 2) + '\n');
    console.log('css-lint baseline записан:', JSON.stringify(cur));
    process.exit(0);
}
if (!base) { console.error('css-lint: нет baseline (node tools/css-lint.cjs --update)'); process.exit(1); }
const bad = Object.keys(cur).filter((k) => cur[k] > base[k]);
if (bad.length) {
    console.error('css-lint FAIL — литералы вне токенов выросли (правила дизайн-системы, см. docs/design/ART-DIRECTION.md):');
    bad.forEach((k) => console.error('  ' + k + ': ' + base[k] + ' → ' + cur[k]));
    process.exit(1);
}
const better = Object.keys(cur).filter((k) => cur[k] < base[k]);
console.log('css-lint OK' + (better.length ? ' (улучшено: ' + better.map((k) => k + ' ' + base[k] + '→' + cur[k]).join(', ') + ' — зафиксируй: node tools/css-lint.cjs --update)' : ''));
