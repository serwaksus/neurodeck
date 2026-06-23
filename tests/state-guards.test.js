const test = require('node:test');
const assert = require('node:assert/strict');

const guards = require('../js/state-guards.js');

const catalog = {
  swordDiscipline: { id: 'swordDiscipline', name: 'Sword', icon: 'S', rank: 'A', slot: 'weapon', category: 'weapon', bonuses: [] },
  crownArchon: { id: 'crownArchon', name: 'Crown', icon: 'C', rank: 'S', slot: 'head', category: 'armor', bonuses: [] },
  ringInsight: { id: 'ringInsight', name: 'Ring', icon: 'R', rank: 'A', slot: 'ring2', category: 'accessory', bonuses: [] }
};

test('sanitizeCard rejects invalid rank and clamps progression fields', () => {
  const card = guards.sanitizeCard({
    id: -10,
    name: '',
    rank: 'GOD',
    stat: 'luck',
    mastery: 999,
    masteryThreshold: 500,
    streak: -5,
    prestige: 9,
    evolutionPath: 'cheat'
  }, 42);

  assert.equal(card.id, 42);
  assert.equal(card.name, 'Безымянная карточка');
  assert.equal(card.rank, 'C');
  assert.equal(card.stat, 'str');
  assert.equal(card.masteryThreshold, 50);
  assert.equal(card.mastery, 50);
  assert.equal(card.streak, 0);
  assert.equal(card.prestige, 3);
  assert.equal(card.evolutionPath, null);
});

test('sanitizeInventory only accepts catalog artifacts', () => {
  const inventory = guards.sanitizeInventory({
    backpack: [
      { id: 'crownArchon', uid: 'c1', rank: 'SSS', bonuses: [{ stat: 'str', value: 999 }] },
      { id: 'fakeSword', uid: 'x1', slot: 'weapon', bonuses: [{ stat: 'str', value: 999 }] }
    ],
    equipped: {
      weapon: { id: 'swordDiscipline', uid: 's1', slot: 'weapon' },
      head: { id: 'fakeCrown', uid: 'h1', slot: 'head' }
    }
  }, catalog, 30);

  assert.equal(inventory.backpack.length, 1);
  assert.equal(inventory.backpack[0].id, 'crownArchon');
  assert.deepEqual(inventory.backpack[0].bonuses, []);
  assert.equal(inventory.equipped.weapon.id, 'swordDiscipline');
  assert.equal(inventory.equipped.head, null);
});

test('sanitizeInventory removes duplicate artifacts across equipped and backpack', () => {
  const inventory = guards.sanitizeInventory({
    backpack: [
      { id: 'swordDiscipline', uid: 'dup', slot: 'weapon' },
      { id: 'ringInsight', uid: 'dup', slot: 'ring2' }
    ],
    equipped: {
      weapon: { id: 'swordDiscipline', uid: 'dup', slot: 'weapon' }
    }
  }, catalog, 30);

  assert.equal(inventory.equipped.weapon.id, 'swordDiscipline');
  assert.equal(inventory.backpack.length, 0);
});

test('sanitizeCounter keeps counters within safe numeric bounds', () => {
  assert.equal(guards.sanitizeCounter('abc', 100), 100);
  assert.equal(guards.sanitizeCounter(-1, 10), 10);
  assert.equal(guards.sanitizeCounter(25.7, 10), 26);
});
