// Аудит 2026-10-02 R2 (M7/M9/M10): CI обязан совпадать с `npm run ci`, e2e не должны «осиротеть»,
// визуальный гейт — в закреплённом окружении и без continue-on-error, в Pages уходит whitelist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

test('M9: каждый шаг `npm run ci` (кроме визуального и e2e-обёртки) исполняется в GitHub CI', () => {
    const steps = pkg.scripts.ci.split('&&').map((x) => x.trim()).filter((x) => x.startsWith('npm run ') || x === 'npm test');
    assert.ok(steps.length >= 10, 'цепочка ci распознана: ' + steps.length);
    for (const st of steps) {
        const cmd = st === 'npm test' ? 'npm test' : st;
        assert.ok(yml.includes(cmd), 'шаг `' + st + '` отсутствует в ci.yml');
    }
});

test('M9: каждый tests/e2e/*.test.js входит в какой-либо npm-скрипт (нет «осиротевших» тестов)', () => {
    const scripts = Object.values(pkg.scripts).join(' ');
    const orphans = fs.readdirSync(path.join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.js')).filter((f) => !scripts.includes(f));
    assert.deepEqual(orphans, [], 'не запускаются нигде: ' + orphans.join(', '));
});

test('M9: матрица Node без EOL (20), с активными LTS', () => {
    const m = yml.match(/node:\s*\[([^\]]+)\]/);
    assert.ok(m, 'матрица node найдена');
    const versions = m[1].split(',').map((x) => Number(x.trim()));
    assert.ok(!versions.includes(20), 'Node 20 — EOL: ' + versions);
    assert.ok(versions.includes(22));
});

test('M10: визуальный гейт без continue-on-error и в контейнере Playwright той же версии, что в package-lock', () => {
    assert.ok(!/continue-on-error:\s*true/.test(yml), 'continue-on-error скрывал красный визуальный гейт');
    const img = yml.match(/image:\s*mcr\.microsoft\.com\/playwright:v([0-9.]+)-/);
    assert.ok(img, 'visual job в контейнере Playwright');
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    const ver = lock.packages['node_modules/@playwright/test'].version;
    assert.equal(img[1], ver, 'тег контейнера обязан совпадать с @playwright/test из package-lock (иначе другой браузер → дрейф пикселей)');
});

test('M10: CI-базлайны отделены от локальных (snapshots-ci), deploy ждёт visual', () => {
    const cfg = fs.readFileSync(path.join(ROOT, 'playwright.config.js'), 'utf8');
    assert.match(cfg, /snapshots-ci/);
    assert.match(cfg, /ND_VISUAL_CI/);
    assert.match(yml, /needs:\s*\[test, visual\]/);
});

test('M7: в Pages уходит whitelist, а не весь репозиторий; деплой только по push в main', () => {
    assert.ok(!/upload-pages-artifact@v3\s+with:\s+path:\s*\.\s*$/m.test(yml), 'path: . публиковал docs/.opencode/bot/service/tests');
    assert.match(yml, /path:\s*_site/);
    const cp = yml.match(/cp -r ([^\n]+) _site\//);
    assert.ok(cp, 'копирование в _site');
    const items = cp[1].trim().split(/\s+/);
    for (const forbidden of ['docs', '.opencode', 'bot', 'service', 'tools', 'tests', 'AGENTS.md', 'package.json']) {
        assert.ok(!items.includes(forbidden), forbidden + ' не должен публиковаться');
    }
    for (const needed of ['index.html', 'sw.js', 'manifest.json', 'css', 'js', 'fonts', 'img', 'config']) {
        assert.ok(items.includes(needed), needed + ' нужен приложению');
    }
    assert.match(yml, /github\.event_name == 'push'/);
});

test('M7: всё, что приложение грузит по относительным путям, лежит в whitelist', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="((?!https?:|#|data:)[^"]+)"/g)].map((m) => m[1].split('?')[0]);
    const top = new Set(['index.html', 'sw.js', 'manifest.json', 'css', 'js', 'fonts', 'img', 'config']);
    for (const r of refs) assert.ok(top.has(r.split('/')[0]), r + ' вне whitelist публикации');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    for (const m of sw.matchAll(/'((?:css|js|fonts|img|config)\/[^'?]+)/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), 'прекэш SW ссылается на несуществующий ' + m[1]);
});
