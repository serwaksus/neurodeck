const test = require('node:test');
const assert = require('node:assert');
const SG = require('../js/state-guards.js');

test('sanitizeSeason: defaults for null input', () => {
    const s = SG.sanitizeSeason(null, '2026-09-15');
    assert.equal(s.num, 1);
    assert.equal(s.start, '2026-09-15');
    assert.deepEqual(s.snapshot, { totalXp: 0, gold: 0, captured: 0, completions: 0, level: 1 });
});

test('sanitizeSeason: bad fields fall back, good fields kept', () => {
    const s = SG.sanitizeSeason({ num: 'x', start: 'bad-date', snapshot: { gold: '5', level: -3 } }, null);
    assert.equal(s.num, 1);
    assert.equal(s.start, '2000-01-01');
    assert.equal(s.snapshot.gold, 5);
    assert.equal(s.snapshot.level, 1);
});

test('sanitizeSeason: valid season passes through with clamped snapshot', () => {
    const s = SG.sanitizeSeason({ num: 2, start: '2026-09-01', crownBonus: 3, snapshot: { totalXp: 5000, gold: 300, captured: 25, completions: 40, level: 6 } }, '2026-09-15');
    assert.equal(s.num, 2);
    assert.equal(s.start, '2026-09-01');
    assert.equal(s.crownBonus, 3, 'crownBonus должен сохраниться');
    assert.equal(s.snapshot.captured, 20);
    assert.equal(s.snapshot.completions, 40);
});
