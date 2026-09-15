const test = require('node:test');
const assert = require('node:assert');
const SM = require('../js/stronghold-model.js');

test('tradeRoutes counts adjacent captured pairs only', () => {
    assert.equal(SM.tradeRoutes([]), 0);
    assert.equal(SM.tradeRoutes([true]), 0);
    assert.equal(SM.tradeRoutes([true, true, false, true]), 1);
    assert.equal(SM.tradeRoutes([true, true, true, false, true, true]), 3);
    assert.equal(SM.tradeRoutes(Array(20).fill(false)), 0);
    assert.equal(SM.tradeRoutes(Array(20).fill(true)), 19);
    assert.equal(SM.tradeRoutes(null), 0);
});

test('tradeBonus: +2% per route, cap 38%', () => {
    assert.equal(SM.tradeBonus(0), 0);
    assert.ok(Math.abs(SM.tradeBonus(1) - 0.02) < 1e-9);
    assert.ok(Math.abs(SM.tradeBonus(10) - 0.20) < 1e-9);
    assert.equal(SM.tradeBonus(19), 0.38);
    assert.equal(SM.tradeBonus(100), 0.38);
});

test('trade income matches app contract on full chain', () => {
    globalThis.StrongholdData = require('../js/stronghold-data.js');
    const flags = Array(20).fill(true);
    const routes = SM.tradeRoutes(flags);
    const bonus = SM.tradeBonus(routes);
    const baseTax = globalThis.StrongholdData.STRONGHOLDS.reduce((a, d) => a + d.tax, 0);
    const boosted = Math.round(baseTax * (1 + bonus));
    assert.ok(boosted > baseTax, 'routes must increase tax income');
    assert.ok(bonus <= 0.38, 'bonus must stay under cap');
});
