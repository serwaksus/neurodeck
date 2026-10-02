'use strict';
// Аудит 2026-10-02, P0 1.5: CSP как <meta http-equiv> (GitHub Pages не умеет заголовки ответа).
// Страж: политика стоит ДО любых скриптов/стилей, хэш единственного inline-скрипта сходится с его содержимым,
// inline-обработчиков on*= нет ни в index.html, ни в JS-шаблонах (CSP без 'unsafe-inline' их молча режет),
// нет eval/new Function/javascript:/динамических <script>, SDK Telegram — синхронный <script> перед deferred-скриптами.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const html = read('index.html');
const jsFiles = ['app.js', 'storage.js', 'audio.js', 'perf.js', 'perf-compat.js', 'event-bus.js', 'telemetry.js', 'stronghold-data.js',
    'stronghold-model.js', 'state-guards.js', 'remote-config.js', path.join('state', 'store.js'), path.join('ui', 'strongholds.js')];
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');

const m = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
const policy = {};
if (m) m[1].split(';').map(s => s.trim()).filter(Boolean).forEach(d => { const [k, ...v] = d.split(/\s+/); policy[k] = v; });

test('CSP: <meta> есть и стоит раньше любых <script>/<link>/<style>', () => {
    assert.ok(m, 'нет <meta http-equiv="Content-Security-Policy">');
    const at = html.indexOf(m[0]);
    for (const tag of ['<script', '<link', '<style']) {
        const i = html.indexOf(tag);
        assert.ok(i === -1 || at < i, 'CSP должна стоять раньше ' + tag + ' (meta действует только на последующее содержимое)');
    }
});

test('CSP: директивы — default-src self, без eval и без unsafe-inline для скриптов, плагины и <base> закрыты', () => {
    assert.deepEqual(policy['default-src'], ["'self'"]);
    assert.deepEqual(policy['object-src'], ["'none'"]);
    assert.deepEqual(policy['base-uri'], ["'self'"]);
    assert.deepEqual(policy['form-action'], ["'self'"]);
    const s = policy['script-src'];
    assert.ok(s.includes("'self'") && s.includes('https://telegram.org'), 'свои скрипты + SDK Telegram');
    assert.ok(!s.includes("'unsafe-inline'") && !s.includes("'unsafe-eval'") && !s.includes('*'), "script-src без 'unsafe-*' и без *");
    assert.ok(s.some(x => /^'sha256-[A-Za-z0-9+/]{43}='$/.test(x)), 'inline-скрипт регистрации SW разрешён по хэшу');
    assert.deepEqual(policy['connect-src'], ["'self'"], 'приложение ходит только на свой origin (облако — через Telegram SDK, не fetch)');
    assert.ok(!(policy['img-src'] || []).includes('*') && !(policy['img-src'] || []).includes('http:'));
});

test('CSP: хэш единственного inline-скрипта сходится с его текстом', () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(inline.length, 1, 'inline-скриптов должно быть ровно один (регистрация SW); каждый новый — это новый хэш в политике');
    const h = "'sha256-" + crypto.createHash('sha256').update(inline[0][1], 'utf8').digest('base64') + "'";
    assert.ok(policy['script-src'].includes(h), 'после правки inline-скрипта обнови хэш в CSP: ожидается ' + h);
});

test('CSP: нет inline-обработчиков on*= ни в index.html, ни в JS-шаблонах', () => {
    const tagHandlers = html.match(/<[a-zA-Z][^>]*\son[a-z]+\s*=/g) || [];
    assert.deepEqual(tagHandlers, [], 'index.html: inline-обработчик заблокирует CSP');
    for (const f of jsFiles) {
        const src = noComments(read('js', f));
        const hits = src.match(/<[a-zA-Z][^>]*\son[a-z]{3,}\s*=\s*\\?["']/g) || [];
        assert.deepEqual(hits, [], 'js/' + f + ': inline-обработчик в HTML-шаблоне');
    }
});

test('CSP: нет eval / new Function / строкового setTimeout / javascript: / динамических <script>', () => {
    for (const f of jsFiles) {
        const src = noComments(read('js', f));
        assert.ok(!/\beval\s*\(/.test(src), 'js/' + f + ': eval');
        assert.ok(!/\bnew\s+Function\s*\(/.test(src), 'js/' + f + ': new Function');
        assert.ok(!/set(Timeout|Interval)\(\s*['"`]/.test(src), 'js/' + f + ': строковый таймер');
        assert.ok(!/javascript:/i.test(src), 'js/' + f + ': javascript: URL');
        assert.ok(!/createElement\(\s*['"]script['"]\s*\)/.test(src), 'js/' + f + ': динамический <script>');
    }
    assert.ok(!/javascript:/i.test(html), 'index.html: javascript: URL');
});

test('SDK Telegram: синхронный <script> без async/defer/onload, раньше deferred-скриптов приложения', () => {
    const tag = html.match(/<script\b[^>]*telegram-web-app\.js[^>]*>/);
    assert.ok(tag, 'тег SDK найден');
    assert.ok(!/\b(async|defer|onload)\b/i.test(tag[0]), 'SDK обязан быть синхронным: app.js читает Telegram.WebApp на старте (гонка со старт-колодой/облаком)');
    const first = html.search(/<script\b[^>]*\bsrc="js\//);
    assert.ok(first > -1 && html.indexOf(tag[0]) < first, 'SDK раньше первого скрипта приложения');
});

test('пины ?v= в index.html: все одинаковые (≥ 15) и совпадают с sw.js', () => {
    const pins = [...html.matchAll(/(?:src|href)="[^"?]+\?v=(\d+)"/g)].map(x => x[1]);
    assert.ok(pins.length >= 15, 'пинов: ' + pins.length);
    assert.equal(new Set(pins).size, 1, 'все пины одной версии');
    const sw = read('sw.js');
    assert.ok(sw.includes("'nd-shell-v" + pins[0] + "'"), 'VERSION sw.js = nd-shell-v' + pins[0]);
});
