const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('js/app.js');
const html = read('index.html');
const css = read('css/style.css');

test('STARTER_DECK constant is declared with 3-4 cards', () => {
    const m = app.match(/const STARTER_DECK\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(m, 'STARTER_DECK constant missing');
    const items = m[1].split(/\},\s*\{/).length;
    assert.ok(items >= 3 && items <= 4,
        'STARTER_DECK must have 3-4 cards, got ' + items);
});

test('STARTER_DECK cards have required fields (name, stat, time, duration)', () => {
    const m = app.match(/const STARTER_DECK\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(m);
    ['name', 'stat', 'time', 'duration'].forEach(field => {
        const re = new RegExp(field + ':', 'g');
        const count = (m[1].match(re) || []).length;
        const items = m[1].split(/\},\s*\{/).length;
        assert.ok(count >= items,
            field + ' should appear on every card');
    });
});

test('STARTER_DECK stats are valid RPG attributes', () => {
    const m = app.match(/const STARTER_DECK\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(m);
    const validStats = ['str', 'end', 'int', 'cha', 'wil', 'agi'];
    const statMatch = m[1].match(/stat:\s*'(\w+)'/g) || [];
    statMatch.forEach(s => {
        const stat = s.match(/'([^']+)'/)[1];
        assert.ok(validStats.includes(stat),
            stat + ' is not a valid RPG stat');
    });
});

test('Starter deck modal exists in HTML', () => {
    assert.ok(html.indexOf('id="starterDeckModal"') > -1,
        'starterDeckModal missing in HTML');
    assert.ok(html.indexOf('accept-starter-deck') > -1,
        'accept-starter-deck data-action missing');
    assert.ok(html.indexOf('close-starter-deck') > -1,
        'close-starter-deck data-action missing');
    assert.ok(html.indexOf('id="starterDeckList"') > -1,
        'starterDeckList element missing');
});

test('All starter-deck data-actions wired in event delegation', () => {
    ['accept-starter-deck', 'close-starter-deck'].forEach(action => {
        assert.ok(app.indexOf("case '" + action + "'") > -1,
            'event delegation missing case for ' + action);
    });
});

test('showStarterDeck function exists and is guarded', () => {
    const m = app.match(/function showStarterDeck\([\s\S]*?\n\}/);
    assert.ok(m, 'showStarterDeck function missing');
    assert.ok(m[0].indexOf('FORGED.length > 0') > -1,
        'showStarterDeck must guard on FORGED.length > 0');
    assert.ok(m[0].indexOf("neurodeck_starter_done") > -1,
        'showStarterDeck must read localStorage flag');
});

test('acceptStarterDeck function exists and adds cards', () => {
    const m = app.match(/function acceptStarterDeck\([\s\S]*?\nfunction /);
    assert.ok(m, 'acceptStarterDeck missing or not before next function');
    assert.ok(m[0].indexOf('makeStarterCard') > -1,
        'acceptStarterDeck must call makeStarterCard');
    assert.ok(m[0].indexOf("neurodeck_starter_done") > -1,
        'acceptStarterDeck must record done flag');
});

test('closeStarterDeck records done flag even when skipping', () => {
    const m = app.match(/function closeStarterDeck\([\s\S]*?\n\}/);
    assert.ok(m, 'closeStarterDeck missing');
    assert.ok(m[0].indexOf("neurodeck_starter_done") > -1,
        'closeStarterDeck must record done flag so modal never shows again');
});

test('makeStarterCard returns lock-rank-to-C card', () => {
    const m = app.match(/function makeStarterCard\([\s\S]*?\n\}/);
    assert.ok(m, 'makeStarterCard missing');
    assert.ok(m[0].includes("rank: 'C'"),
        'makeStarterCard must lock rank to C');
});

test('Dashboard has help (info) button', () => {
    assert.ok(app.indexOf('data-action="toggle-help"') > -1,
        'data-action="toggle-help" missing');
});

test('toggleHelp function provides rewards/risks content', () => {
    assert.ok(app.indexOf('function toggleHelp') > -1,
        'toggleHelp function missing');
    const html2 = read('js/app.js');
    assert.ok(html2.includes('Награды и риски') || html2.includes('награды') || html2.includes('ярость'),
        'toggleHelp must contain rewards/risk content');
});

test('showTextTooltip helper exists for non-inventory help', () => {
    assert.ok(app.indexOf('function showTextTooltip') > -1,
        'showTextTooltip helper missing');
});

test('renderDashboard branches beginner vs veteran', () => {
    assert.ok(app.indexOf('function renderDashboardBeginner') > -1,
        'renderDashboardBeginner missing');
    assert.ok(app.indexOf('function renderDashboardVeteran') > -1,
        'renderDashboardVeteran missing');
    const m = app.match(/function renderDashboard\([\s\S]*?\n\}/);
    assert.ok(m, 'renderDashboard missing');
    assert.ok(m[0].indexOf('isBeginner') > -1,
        'renderDashboard must branch on isBeginner flag');
    assert.ok(m[0].indexOf('renderDashboardBeginner()') > -1 &&
               m[0].indexOf('renderDashboardVeteran()') > -1,
        'renderDashboard must call both branches');
});

test('Beginner dashboard mentions key numbers', () => {
    const m = app.match(/function renderDashboardBeginner\([\s\S]*?\n\}/);
    assert.ok(m, 'renderDashboardBeginner missing');
    assert.ok(m[0].includes('+15 XP'),
        'beginner dashboard must mention XP reward');
    assert.ok(m[0].includes('ярость') || m[0].includes('ярос'),
        'beginner dashboard must mention босс ярость risk');
    assert.ok(m[0].includes('+1 ОД'),
        'beginner dashboard must mention Action Points reward');
});

test('Starter deck is triggered for first-run players', () => {
    const idx = app.indexOf('showStarterDeck, 900');
    assert.ok(idx >= 0, 'init must call setTimeout(showStarterDeck)');
});

test('CSS provides starter-card and info-btn styles', () => {
    assert.ok(/\.starter-card\s*\{/.test(css),
        '.starter-card style missing');
    assert.ok(/\.starter-card:hover\s*\{/.test(css),
        '.starter-card hover style missing');
    assert.ok(/\.info-btn\s*\{/.test(css),
        '.info-btn style missing');
});

test('Starter deck never forces non-default rank', () => {
    const m = app.match(/function makeStarterCard\([\s\S]*?\n\}/);
    assert.ok(m);
    const bodyContent = m[0];
    assert.equal(bodyContent.indexOf("rank: 'SSS'") === -1, true,
        'starter cards must not start as SSS');
    assert.equal(bodyContent.indexOf("rank: 'SS'") === -1, true,
        'starter cards must not start as SS');
    assert.equal(bodyContent.indexOf("rank: 'A'") === -1, true,
        'starter cards must not start as A or S rank');
});

test('Starter deck respects anti-exploit: rank always C', () => {
    const m = app.match(/function makeStarterCard\([\s\S]*?\n\}/);
    assert.ok(m[0].indexOf("rank: 'C'") > -1);
});
