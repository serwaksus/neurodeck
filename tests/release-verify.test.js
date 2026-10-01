// ============================================================
// R3 (очередь 4, 01.10.2026): контракт блокирующего release-гейта
// tools/release-verify.cjs. Без браузера и без запуска самих шагов:
// раннер инжектится фейком, артефакт пишется во временный каталог.
// Проверяется: состав шагов (= полная цепочка ci + economy sim,
// visual блокирует), явная политика ретраев/флейков, полнота
// артефакта (команды/exit-коды каждой попытки/логи), preflight
// согласованности рантайм-пинов, честность git-фактологии.
// Реальный полный прогон — `npm run release:verify` (10 шагов).
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const gate = require('../tools/release-verify.cjs');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nd-release-verify-'));

// Детерминированный фейковый раннер: outcomes[script] = exit-коды по попыткам
// (нет записи в outcomes — все попытки exit 0).
function fakeRunner(outcomes) {
  const seen = Object.create(null);
  return (script, logPath) => {
    seen[script] = (seen[script] || 0) + 1;
    fs.writeFileSync(logPath, 'fake log: ' + script + ' attempt ' + seen[script] + '\n');
    const seq = outcomes[script] || [0];
    const exit = seq[Math.min(seen[script], seq.length) - 1];
    return { exit, signal: null, spawnError: null };
  };
}

const fakeGit = { head: '0123456789abcdef0123456789abcdef01234567', branch: 'test-branch', dirty: false, dirty_file_count: 0 };
const fakeEnv = { node: process.version, npm: '0.0.0', platform: 'test x64', ci: null };

test('R3: шаги гейта = полная цепочка ci + economy sim; все шаги блокирующие', () => {
  assert.deepStrictEqual(
    gate.STEPS.map((s) => s.npmScript),
    [
      'check:js', 'test', 'test:e2e', 'test:e2e:visual',
      'test:playtest:strongholds', 'test:playtest:acceptance',
      'test:qa:data', 'test:qa:chaos', 'test:qa:parity', 'test:sim:economy',
    ]
  );
  assert.ok(gate.STEPS.every((s) => s.blocking === true), 'гейт не бывает частично advisory');
  assert.equal(gate.GATE_FACTS.visual_blocking, true, 'visual блокирует гейт');
  assert.equal(gate.GATE_FACTS.economy_sim_included, true, 'economy sim входит в гейт');
});

test('R3: явные ретраи — только браузерные шаги (1 повтор), детерминированные без ретраев', () => {
  for (const s of gate.STEPS) {
    const browser = s.npmScript === 'test:e2e' || s.npmScript === 'test:e2e:visual';
    assert.equal(s.retries, browser ? 1 : 0, s.name);
  }
});

test('R3: чистый проход — по одной попытке, артефакт и все логи на месте', () => {
  const dir = tmpDir();
  const art = gate.runGate({ outDir: dir, runner: fakeRunner({}), git: fakeGit, env: fakeEnv });
  assert.equal(art.result, 'pass');
  assert.equal(art.summary.total, 10);
  assert.deepStrictEqual(art.summary.failed, []);
  assert.deepStrictEqual(art.summary.flaky, []);
  assert.ok(art.steps.every((s) =>
    s.attempts === 1 && s.exit_codes.length === 1 && s.exit_codes[0] === 0 && s.flaky === false));
  assert.ok(art.steps.every((s) => s.command.startsWith('npm run ') && s.passed === true));
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'artifact.json'), 'utf8'));
  assert.equal(onDisk.result, 'pass');
  assert.equal(onDisk.git.head, fakeGit.head);
  assert.equal(onDisk.env.node, fakeEnv.node);
  for (const s of art.steps) {
    assert.ok(fs.existsSync(path.join(gate.ROOT, s.log)), 'лог существует: ' + s.log);
    assert.equal(s.attempt_logs.length, 1);
  }
});

test('R3: флак e2e (exit 1 → retry exit 0) — гейт пройден, флак зафиксирован, а не спрятан', () => {
  const dir = tmpDir();
  const art = gate.runGate({ outDir: dir, runner: fakeRunner({ 'test:e2e': [1, 0] }), git: fakeGit, env: fakeEnv });
  assert.equal(art.result, 'pass');
  const e2e = art.steps.find((s) => s.name === 'e2e');
  assert.deepStrictEqual(e2e.exit_codes, [1, 0]);
  assert.equal(e2e.attempts, 2);
  assert.equal(e2e.flaky, true);
  assert.equal(e2e.attempt_logs.length, 2, 'логи ОБЕИХ попыток в артефакте');
  assert.deepStrictEqual(art.summary.flaky, ['e2e']);
});

test('R3: visual упал дважды — гейт ЗАВАЛЕН (visual блокирует), оба exit-кода в артефакте', () => {
  const dir = tmpDir();
  const art = gate.runGate({ outDir: dir, runner: fakeRunner({ 'test:e2e:visual': [1, 1] }), git: fakeGit, env: fakeEnv });
  assert.equal(art.result, 'fail');
  const visual = art.steps.find((s) => s.name === 'e2e:visual');
  assert.equal(visual.blocking, true);
  assert.deepStrictEqual(visual.exit_codes, [1, 1]);
  assert.equal(visual.passed, false);
  assert.equal(visual.flaky, false);
  assert.deepStrictEqual(art.summary.failed, ['e2e:visual']);
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'artifact.json'), 'utf8'));
  assert.equal(onDisk.result, 'fail');
});

test('R3: детерминированный шаг не ретраится — один прогон, провал = провал гейта', () => {
  const dir = tmpDir();
  const art = gate.runGate({ outDir: dir, runner: fakeRunner({ 'test:qa:data': [1] }), git: fakeGit, env: fakeEnv });
  assert.equal(art.result, 'fail');
  const qa = art.steps.find((s) => s.name === 'qa:data');
  assert.equal(qa.attempts, 1, 'ретрай не маскирует провал детерминированного шага');
  assert.deepStrictEqual(qa.exit_codes, [1]);
});

test('R3: провал не прерывает цепочку — артефакт полный, у каждого шага exit-код', () => {
  const dir = tmpDir();
  const art = gate.runGate({
    outDir: dir,
    runner: fakeRunner({ 'test:qa:data': [1], 'test:sim:economy': [2] }),
    git: fakeGit,
    env: fakeEnv,
  });
  assert.equal(art.result, 'fail');
  assert.deepStrictEqual(art.summary.failed, ['qa:data', 'sim:economy']);
  assert.equal(art.steps.length, 10);
  assert.ok(art.steps.every((s) => Array.isArray(s.exit_codes) && s.exit_codes.length >= 1));
});

test('R3: preflight — рассинхрон рантайм-пинов заваливает гейт до запуска шагов', () => {
  const dir = tmpDir();
  let ran = 0;
  const art = gate.runGate({
    outDir: dir,
    runner: (script, logPath) => {
      ran++;
      fs.writeFileSync(logPath, '');
      return { exit: 0, signal: null, spawnError: null };
    },
    git: fakeGit,
    env: fakeEnv,
    versions: {
      schema_version: 14, shell_version: 104, sw_shell_version: 105,
      html_pin_count: 15, consistent: false, reason: 'pins out of sync',
      sources: {},
    },
  });
  assert.equal(art.result, 'fail');
  assert.equal(art.steps.length, 0, 'шаги не стартуют при рассинхроне пинов');
  assert.equal(ran, 0);
  assert.equal(art.preflight.versions_consistent, false);
  assert.ok(art.preflight.reason.length > 0);
});

test('R3: readVersions — версии из исходников согласованы (storage.js / index.html ?v= / sw.js)', () => {
  const v = gate.readVersions();
  assert.equal(v.consistent, true, JSON.stringify(v));
  assert.ok(Number.isInteger(v.schema_version) && v.schema_version > 0, 'SCHEMA_VERSION парсится');
  assert.equal(v.shell_version, v.sw_shell_version, 'пины index.html совпадают с sw.js');
  assert.ok(v.html_pin_count > 1, 'в index.html несколько синхронных пинов');
});

test('R3: gitInfo — 40-символьный hex HEAD живого репозитория', () => {
  const g = gate.gitInfo();
  assert.match(g.head, /^[0-9a-f]{40}$/);
  assert.equal(typeof g.dirty, 'boolean');
});
