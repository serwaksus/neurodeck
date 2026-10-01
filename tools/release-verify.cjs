#!/usr/bin/env node
'use strict';
// ============================================================
// NeuroDeck — Release Gate (R3, очередь 4, 01.10.2026): блокирующий
// verify-прогон перед деплоем. Запуск: `npm run release:verify`.
//
// Отличия от матричного job `test` в .github/workflows/ci.yml:
//  1) visual-регресс БЛОКИРУЕТ гейт. В матричном job он continue-on-error
//     (базлайны сняты вне CI, рендер ubuntu-раннера отличается — там это
//     осознанный advisory-режим для раннего фидбэка), но релиз visual
//     пропускать не может;
//  2) economy sim (test:sim:economy) входит в гейт — в матричном job его нет;
//  3) явная политика ретраев: браузерные шаги (e2e, visual) — ровно 1 повтор
//     на окруженческий флак, детерминированные шаги — без ретраев (провал
//     есть провал). Флак (pass со 2-й попытки) не прячется: фиксируется в
//     артефакте (steps[].flaky + summary.flaky);
//  4) полный артефакт docs/release/verify/artifact.json + логи каждого шага
//     в docs/release/verify/logs/: git SHA/ветка/dirty, env (node/npm/
//     platform/CI), версии из исходников с проверкой согласованности рантайм-
//     пинов (schema из js/storage.js, shell из index.html ?v= и sw.js
//     nd-shell-vN), команды и exit-коды КАЖДОЙ попытки.
//
// Все шаги блокирующие; fail-fast отключён — артефакт всегда полный (каждый
// шаг получает свой exit-код в отчёте, даже если предыдущий упал).
// Preflight: рассинхрон рантайм-пинов = битый кэш у игроков → гейт не стартует.
// Выход: 0 — гейт пройден (деплой разрешён), 1 — провал (деплой запрещён).
// ============================================================

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'docs', 'release', 'verify');

// Порядок шагов = `npm run ci`. sim:economy обязателен (в GitHub-матрице его нет),
// e2e:visual — блокирующий (в матричном job CI он advisory). retries>0 только у
// браузерных playwright-шагов: единственный повтор против окруженческого флака.
const STEPS = [
  { name: 'check:js', npmScript: 'check:js', retries: 0, blocking: true },
  { name: 'unit', npmScript: 'test', retries: 0, blocking: true },
  { name: 'e2e', npmScript: 'test:e2e', retries: 1, blocking: true },
  { name: 'e2e:visual', npmScript: 'test:e2e:visual', retries: 1, blocking: true },
  { name: 'playtest:strongholds', npmScript: 'test:playtest:strongholds', retries: 0, blocking: true },
  { name: 'playtest:acceptance', npmScript: 'test:playtest:acceptance', retries: 0, blocking: true },
  { name: 'qa:data', npmScript: 'test:qa:data', retries: 0, blocking: true },
  { name: 'qa:chaos', npmScript: 'test:qa:chaos', retries: 0, blocking: true },
  { name: 'qa:parity', npmScript: 'test:qa:parity', retries: 0, blocking: true },
  { name: 'sim:economy', npmScript: 'test:sim:economy', retries: 0, blocking: true },
];

const GATE_FACTS = {
  all_steps_blocking: true,
  visual_blocking: true, // в отличие от матричного job CI (там continue-on-error)
  economy_sim_included: true, // test:sim:economy отсутствует в матричном job CI
  fail_fast: false, // полный артефакт даже при провале
};

const RETRY_POLICY = {
  deterministic: 'retries=0 — провал шага есть провал гейта',
  browser: 'retries=1 (test:e2e, test:e2e:visual) — единственный повтор на окруженческий флак',
  flake: 'pass со 2-й попытки: гейт пройден, шаг помечен flaky и виден в артефакте (не прячется)',
};

// ---------- фактология прогона: git / env / версии из исходников ----------

function gitInfo() {
  const run = (args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const porcelain = run(['status', '--porcelain']);
  return {
    head: run(['rev-parse', 'HEAD']),
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
    dirty: porcelain === null ? null : porcelain.length > 0,
    dirty_file_count: porcelain === null ? null : porcelain.split('\n').filter(Boolean).length,
  };
}

function envInfo() {
  const npmV = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  return {
    node: process.version,
    npm: npmV.status === 0 ? npmV.stdout.trim() : null,
    platform: process.platform + ' ' + process.arch,
    ci: process.env.CI ? String(process.env.CI) : null,
  };
}

// Согласованность рантайм-версий: schema из js/storage.js, shell из index.html
// (?v=N, все пины должны совпадать) и sw.js (nd-shell-vN). Рассинхрон = битый
// кэш у игроков после деплоя, поэтому это preflight-условие самого гейта.
function readVersions() {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const schemaMatch = read('js/storage.js').match(/const SCHEMA_VERSION = (\d+)/);
  const pins = [...read('index.html').matchAll(/\?v=(\d+)/g)].map((m) => Number(m[1]));
  const swMatch = read('sw.js').match(/const VERSION = 'nd-shell-v(\d+)'/);
  const distinct = [...new Set(pins)];
  const v = {
    schema_version: schemaMatch ? Number(schemaMatch[1]) : null,
    shell_version: distinct.length === 1 ? distinct[0] : null,
    sw_shell_version: swMatch ? Number(swMatch[1]) : null,
    html_pin_count: pins.length,
    sources: {
      schema: "js/storage.js: const SCHEMA_VERSION",
      shell_html: 'index.html: ?v= (все пины)',
      shell_sw: "sw.js: const VERSION = 'nd-shell-vN'",
    },
  };
  v.consistent =
    v.schema_version !== null &&
    v.shell_version !== null &&
    v.sw_shell_version !== null &&
    v.shell_version === v.sw_shell_version;
  v.reason = v.consistent
    ? null
    : 'runtime pins out of sync: index.html ?v= pins and/or sw.js nd-shell-vN missing or inconsistent';
  return v;
}

// ---------- раннер одного npm-шага (stdout+stderr → лог файла) ----------

function defaultRunner(npmScript, logPath) {
  const res = spawnSync('npm', ['run', npmScript], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    env: process.env,
  });
  const chunks = ['$ npm run ' + npmScript];
  if (res.stdout) chunks.push(String(res.stdout));
  if (res.stderr) chunks.push(String(res.stderr));
  if (res.error) chunks.push('[spawn error] ' + res.error.message);
  try {
    fs.writeFileSync(logPath, chunks.join('\n') + '\n');
  } catch (e) {
    console.warn('[release-verify] WARN: лог не записан (' + logPath + '): ' + e.message);
  }
  return {
    exit: typeof res.status === 'number' ? res.status : 1,
    signal: res.signal || null,
    spawnError: res.error ? res.error.message : null,
  };
}

// ---------- сам гейт ----------

function runGate(opts) {
  const o = opts || {};
  const outDir = o.outDir || DEFAULT_OUT_DIR;
  const logsDir = path.join(outDir, 'logs');
  const runner = o.runner || defaultRunner;
  const git = o.git || gitInfo();
  const env = o.env || envInfo();
  const versions = o.versions || readVersions();
  const t0 = Date.now();

  // Свежий прогон не должен наследовать логи/артефакт прошлого: чистим logs/
  // и сразу пишем artifact.json c result:'running' — краш посреди прогона не
  // оставит старый артефакт выдавать себя за свежий.
  fs.rmSync(logsDir, { recursive: true, force: true });
  fs.rmSync(path.join(outDir, 'artifact.json'), { force: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const base = {
    tool: 'release-verify',
    created_at: new Date().toISOString(),
    result: 'running',
    gate: GATE_FACTS,
    retry_policy: RETRY_POLICY,
    git,
    env,
    versions,
  };
  const artifactPath = path.join(outDir, 'artifact.json');
  const writeArtifact = (a) => fs.writeFileSync(artifactPath, JSON.stringify(a, null, 2) + '\n');
  writeArtifact(base);

  // Preflight: рассинхрон пинов — гейт не стартует вовсе.
  if (!versions.consistent) {
    const artifact = Object.assign(base, {
      result: 'fail',
      preflight: { versions_consistent: false, reason: versions.reason },
      steps: [],
      summary: { total: 0, failed: [], flaky: [], duration_ms: Date.now() - t0 },
    });
    writeArtifact(artifact);
    console.error('[release-verify] PREFLIGHT FAIL: ' + versions.reason);
    return artifact;
  }

  const steps = STEPS.map((step, i) => {
    const order = String(i + 1).padStart(2, '0');
    const logBase = order + '-' + step.name.replace(/[^a-z0-9]+/gi, '-');
    const maxAttempts = 1 + step.retries;
    const exitCodes = [];
    const attemptLogs = [];
    let attempts = 0;
    let passed = false;
    let signal = null;
    let spawnError = null;
    const stepT0 = Date.now();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      const logPath = path.join(logsDir, logBase + '-attempt' + attempt + '.log');
      console.log(
        '[release-verify] ' + order + '/' + STEPS.length + ' ' + step.name +
        ': attempt ' + attempt + '/' + maxAttempts + ' — npm run ' + step.npmScript
      );
      const res = runner(step.npmScript, logPath);
      exitCodes.push(res.exit);
      attemptLogs.push(path.relative(ROOT, logPath));
      signal = signal || res.signal;
      spawnError = spawnError || res.spawnError;
      if (res.exit === 0) {
        passed = true;
        break;
      }
      if (attempt < maxAttempts) {
        console.log('[release-verify] ' + step.name + ': exit ' + res.exit + ' → повтор (политика: ' + step.retries + ')');
      }
    }
    const rec = {
      name: step.name,
      command: 'npm run ' + step.npmScript,
      blocking: step.blocking,
      retries: step.retries,
      attempts,
      exit_codes: exitCodes,
      passed,
      flaky: passed && attempts > 1,
      signal,
      spawn_error: spawnError,
      duration_ms: Date.now() - stepT0,
      attempt_logs: attemptLogs,
      log: attemptLogs[attemptLogs.length - 1],
    };
    console.log(
      '[release-verify] ' + step.name + ': ' +
      (passed ? (rec.flaky ? 'PASS (flaky: ' + attempts + ' attempts)' : 'PASS') : 'FAIL') +
      ' exits=[' + exitCodes.join(',') + '] ' + rec.duration_ms + 'ms'
    );
    return rec;
  });

  const failed = steps.filter((s) => !s.passed).map((s) => s.name);
  const flaky = steps.filter((s) => s.flaky).map((s) => s.name);
  const artifact = Object.assign(base, {
    result: failed.length ? 'fail' : 'pass',
    preflight: { versions_consistent: true },
    steps,
    summary: {
      total: steps.length,
      failed,
      flaky,
      duration_ms: Date.now() - t0,
      finished_at: new Date().toISOString(),
    },
  });
  writeArtifact(artifact);
  return artifact;
}

function main() {
  const git = gitInfo();
  console.log('[release-verify] NeuroDeck release gate (visual blocking, economy sim included)');
  console.log('[release-verify] head=' + git.head + ' branch=' + git.branch + ' dirty=' + git.dirty);
  console.log('[release-verify] node=' + process.version + ' platform=' + process.platform + '/' + process.arch);
  const artifact = runGate({ git });
  console.log('[release-verify] artifact: ' + path.relative(ROOT, path.join(DEFAULT_OUT_DIR, 'artifact.json')));
  if (artifact.result === 'pass') {
    console.log(
      '[release-verify] RELEASE GATE PASSED: ' + artifact.summary.total + ' steps, ' +
      'flaky=[' + (artifact.summary.flaky.join(', ') || 'none') + ']'
    );
    process.exitCode = 0;
  } else {
    console.error(
      '[release-verify] RELEASE GATE FAILED: failed=[' + artifact.summary.failed.join(', ') + '] — deploy forbidden'
    );
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  STEPS,
  GATE_FACTS,
  RETRY_POLICY,
  DEFAULT_OUT_DIR,
  ROOT,
  runGate,
  gitInfo,
  envInfo,
  readVersions,
};
