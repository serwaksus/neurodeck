'use strict';
// B: заморозка состава множителей XP (cardXpLedger). Падёж = осознанное изменение
// математики XP: обнови список, оцени эффект на кампанию (tools/balance-lab) до коммита.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function extractBlock(anchor) {
    const start = app.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = app.indexOf('{', start); i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return app.slice(start, end + 1);
}
const extractFn = (name) => extractBlock('function ' + name + '(');
function buildIn({ decls = [], stubs = {}, body }) {
    const src = decls.join('\n') + '\nreturn (' + body + ');';
    const keys = Object.keys(stubs);
    return new Function(...keys, src)(...keys.map((k) => stubs[k]));
}

const LEDGER_IDS = ['streak', 'heroInt', 'combo', 'prestige', 'dayPair', 'bloodmoon', 'holiday', 'totem', 'doctrine', 'bossArtifact', 'techIdea', 'tech', 'comboDay'];

test('XP ledger: состав множителей заморожен, округление одно — после prestige', () => {
    const src = extractFn('cardXpLedger');
    const ids = [...src.matchAll(/id: '(\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(ids, LEDGER_IDS);
    assert.equal((src.match(/round: true/g) || []).length, 1, 'округлений ровно одно');
    assert.ok(src.indexOf('prestige') < src.indexOf('round: true'), 'округление стоит после prestige');
});

test('XP ledger: математика эквивалентна исторической формуле', () => {
    const calc = buildIn({
        decls: [extractFn('cardXpLedger'), extractFn('applyXpLedger')],
        stubs: {
            HERO: { comboDayXp: 1.1 },
            holidayRewardMult: () => 1.5,
            totemXpMult: () => 1.1,
            doctrineXpMult: () => 1.25,
            bossArtifactMult: () => 0.9,
            techIdeaXpMult: () => 1.15,
            techXpMult: () => 1.1
        },
        body: '(card, dayMult, bloodMult, s, h, c, p) => applyXpLedger(15, cardXpLedger(card, dayMult, bloodMult, s, h, c, p))'
    });
    const got = calc({}, 2, 2, 1.2, 1.05, 1.3, 1.1);
    const ref = Math.round(15 * 1.2 * 1.05 * 1.3 * 1.1) * 2 * 2 * 1.5 * 1.1 * 1.25 * 0.9 * 1.15 * 1.1 * 1.1;
    assert.equal(got, ref);
});

test('XP ledger: identity — все m=1 без round возвращает base; round округляет', () => {
    const apply = buildIn({ decls: [extractFn('applyXpLedger')], stubs: {}, body: '(b, L) => applyXpLedger(b, L)' });
    assert.equal(apply(15, [{ id: 'x', m: 1, round: false }]), 15);
    assert.equal(apply(15.4, [{ id: 'x', m: 1, round: true }]), 15);
});
