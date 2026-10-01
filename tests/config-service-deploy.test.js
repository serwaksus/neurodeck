const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

// R4 (очередь 4): оркестрация deploy.sh — атомарные релизы через symlink, автооткат,
// release-rollback, гейты (healthz/owner/port). ВЕРИФИЦИРУЕТСЯ РЕАЛЬНОЕ:
//   · deploy.sh исполняется целиком (bash), в песочнице из ND_DEPLOY_* путей;
//   · stage копирует настоящий server.cjs, стартует его настоящий процесс;
//   · healthz-гейт — настоящий curl по настоящему HTTP;
//   · port-owner-гейт — настоящий ss -tlnp (pid реально слушающего процесса);
//   · owner-гейт — настоящие stat/find по файлам релиза.
// Единственная подмена — systemctl: стаб логирует вызовы в $ND_STUB_LOG и запускает/
// убивает реальный server.cjs из current (pid в $ND_STUB_PIDFILE). systemd на этой
// машине из тестов не трогается; прод-бот не упоминается нигде (пин ниже).
const REPO = path.join(__dirname, '..');
const DEPLOY = path.join(REPO, 'service', 'nd-config', 'deploy.sh');
const CONFIG_SRC = path.join(REPO, 'config', 'weekly-modifiers.v1.json');
const committedBytes = fs.readFileSync(CONFIG_SRC);

const sandboxes = []; // { dir, pidFile } — прибирается в test.after

function mkdtemp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function freePort() {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
            const p = s.address().port;
            s.close(() => resolve(p));
        });
    });
}

// Стаб systemctl: правдоподобные exit-коды (is-active: 0/3), MainPID из pidfile.
// start/restart запускают РЕАЛЬНЫЙ staged server.cjs (current) на ND_CONFIG_PORT.
// ND_STUB_FAIL_COUNT: если файл с числом >0 — «сервис не поднялся» (число decrementится):
// так тесты симулируют битый релиз именно на его рестарте.
const SYSTEMCTL_STUB = String.raw`#!/usr/bin/env bash
echo "$*" >> "$ND_STUB_LOG"
PID_FILE="$ND_STUB_PIDFILE"
pid_of_file() { cat "$PID_FILE" 2>/dev/null || echo 0; }
alive() { local p; p="$(pid_of_file)"; [[ "$p" =~ ^[0-9]+$ ]] && [[ "$p" -gt 0 ]] && kill -0 "$p" 2>/dev/null; }
stop_server() {
    local p; p="$(pid_of_file)"
    if [[ "$p" =~ ^[0-9]+$ ]] && [[ "$p" -gt 0 ]] && kill -0 "$p" 2>/dev/null; then
        kill "$p" 2>/dev/null || true
        local i; for i in $(seq 1 50); do kill -0 "$p" 2>/dev/null || break; sleep 0.1; done
        kill -9 "$p" 2>/dev/null || true
    fi
    echo 0 > "$PID_FILE"
}
start_server() {
    stop_server
    if [[ -f "$ND_STUB_FAIL_COUNT" ]]; then
        local n; n="$(cat "$ND_STUB_FAIL_COUNT" 2>/dev/null || echo 0)"
        if [[ "$n" =~ ^[0-9]+$ ]] && [[ "$n" -gt 0 ]]; then
            echo $((n - 1)) > "$ND_STUB_FAIL_COUNT"
            echo 0 > "$PID_FILE"
            return 0
        fi
    fi
    ND_CONFIG_HOST=127.0.0.1 \
    ND_CONFIG_PORT="$ND_CONFIG_PORT" \
    ND_CONFIG_DIR="$ND_DEPLOY_OPT_DIR/current/config" \
    ND_CONFIG_DATA_DIR="$ND_DEPLOY_STATE_DIR" \
    ND_TELEMETRY_ENABLED=0 \
    node "$ND_DEPLOY_OPT_DIR/current/server.cjs" >> "$ND_STUB_SERVER_LOG" 2>&1 &
    echo $! > "$PID_FILE"
}
case "$1" in
    is-active)  if alive; then echo active;   exit 0; else echo inactive; exit 3; fi ;;
    is-enabled) echo enabled; exit 0 ;;
    show)       pid_of_file; exit 0 ;;
    enable)     [[ "$*" == *"--now"* ]] && start_server; exit 0 ;;
    start|restart) start_server; exit 0 ;;
    stop|disable)  stop_server; exit 0 ;;
    *)           exit 0 ;;
esac
`;

// Песочница одного «сервера»: пути-оверрайды + стаб systemctl в bin/ + свободный порт.
async function makeSandbox(prefix) {
    const dir = mkdtemp(prefix);
    const binDir = path.join(dir, 'bin');
    const optDir = path.join(dir, 'opt');
    const envDir = path.join(dir, 'etc');
    const unitDst = path.join(dir, 'units', 'nd-config.service');
    const stateDir = path.join(dir, 'var');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(path.dirname(unitDst), { recursive: true });
    const stubPath = path.join(binDir, 'systemctl');
    fs.writeFileSync(stubPath, SYSTEMCTL_STUB, { mode: 0o755 });
    const sb = {
        dir, binDir, optDir, envDir, unitDst, stateDir,
        port: await freePort(),
        stubLog: path.join(dir, 'systemctl.log'),
        pidFile: path.join(dir, 'mainpid'),
        serverLog: path.join(dir, 'server.log'),
        failCountFile: path.join(dir, 'fail-count'),
        env: null, run: null
    };
    sb.env = Object.assign({}, process.env, {
        PATH: binDir + path.delimiter + process.env.PATH,
        ND_DEPLOY_OPT_DIR: optDir,
        ND_DEPLOY_ENV_DIR: envDir,
        ND_DEPLOY_UNIT_DST: unitDst,
        ND_DEPLOY_STATE_DIR: stateDir,
        ND_CONFIG_PORT: String(sb.port),
        ND_STUB_LOG: sb.stubLog,
        ND_STUB_PIDFILE: sb.pidFile,
        ND_STUB_SERVER_LOG: sb.serverLog,
        ND_STUB_FAIL_COUNT: sb.failCountFile
    });
    sb.run = (args, opts) => {
        const res = spawnSync('bash', [DEPLOY].concat(args), {
            env: sb.env, encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024
        });
        if (res.error) throw res.error;
        return res;
    };
    sandboxes.push(sb);
    return sb;
}

function stubLogText(sb) { return fs.existsSync(sb.stubLog) ? fs.readFileSync(sb.stubLog, 'utf8') : ''; }
function releases(sb) { const d = path.join(sb.optDir, 'releases'); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; }
function currentRelease(sb) {
    const link = path.join(sb.optDir, 'current');
    if (!fs.existsSync(link)) return null;
    return path.basename(fs.readlinkSync(link));
}
function pidAlive(sb) {
    const p = parseInt(fs.readFileSync(sb.pidFile, 'utf8').trim(), 10);
    if (!(p > 0)) return false;
    try { process.kill(p, 0); return true; } catch (e) { return false; }
}
const healthz = async (sb) => (await fetch('http://127.0.0.1:' + sb.port + '/healthz')).json();

test.after(() => {
    for (const sb of sandboxes) {
        try {
            const p = parseInt(fs.readFileSync(sb.pidFile, 'utf8').trim(), 10);
            if (p > 0) { try { process.kill(p, 'SIGKILL'); } catch (e) {} }
        } catch (e) {}
        // fs.rmSync(sb.dir, { recursive: true, force: true }); — логи песочник оставляет до
        // конца прогона suite; судить о них можно и после (маленькие). Чистим всё же:
        try { fs.rmSync(sb.dir, { recursive: true, force: true }); } catch (e) {}
    }
});

// ---------- статические ----------

test('deploy.sh: bash -n (синтаксис) и использование только переопределяемых путей', () => {
    const r = spawnSync('bash', ['-n', DEPLOY], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const src = fs.readFileSync(DEPLOY, 'utf8');
    // Все «чувствительные» пути обязаны проходить через ND_DEPLOY_* оверрайды (тестируемость,
    // и никакого хардкода мимо переменных):
    assert.match(src, /OPT_DIR="\$\{ND_DEPLOY_OPT_DIR:-\/opt\/neurodeck-config\}"/);
    assert.match(src, /ENV_DIR="\$\{ND_DEPLOY_ENV_DIR:-\/etc\/neurodeck-config\}"/);
    assert.match(src, /UNIT_DST="\$\{ND_DEPLOY_UNIT_DST:-\/etc\/systemd\/system\/\$UNIT_NAME\}"/);
    assert.match(src, /STATE_DIR="\$\{ND_DEPLOY_STATE_DIR:-\/var\/lib\/neurodeck-config\}"/);
    // атомарная смена current — только через rename (mv -T), не ln -sfn поверх
    assert.match(src, /ln -sfn "releases\/\$1" "\$tmp"\n\s*mv -T "\$tmp" "\$CURRENT_LINK"/);
    assert.ok(!/ln -sfn [^\n]*\$CURRENT_LINK/.test(src), 'прямая перезапись current (не атомарна) запрещена');
});

// ---------- install ----------

test('install: stage → current → env(600, telemetry OFF) → unit → реальный server отвечает; гейты прошли', async () => {
    const sb = await makeSandbox('nd-deploy-install-');
    const r = sb.run(['install']);
    assert.equal(r.status, 0, 'stdout: ' + r.stdout + '\nstderr: ' + r.stderr);

    const rels = releases(sb);
    assert.equal(rels.length, 1, 'ровно один релиз: ' + rels.join(','));
    assert.equal(currentRelease(sb), rels[0], 'current → свежий релиз');
    assert.ok(fs.lstatSync(path.join(sb.optDir, 'current')).isSymbolicLink(), 'current — symlink');

    // env: создан один раз, секретен, телеметрия OFF, retention записан
    const envFile = path.join(sb.envDir, 'env');
    const envTxt = fs.readFileSync(envFile, 'utf8');
    assert.equal(fs.statSync(envFile).mode & 0o777, 0o600);
    assert.match(envTxt, /ND_TELEMETRY_ENABLED=0/);
    assert.match(envTxt, /ND_TELEMETRY_RETENTION_DAYS=30/);
    assert.match(envTxt, /ND_CONFIG_TOKEN=[0-9a-f]{48}/);
    assert.match(envTxt, new RegExp('ND_CONFIG_PORT=' + sb.port));

    // unit установлен
    assert.ok(fs.existsSync(sb.unitDst), 'unit на месте');

    // поднялся РЕАЛЬНЫЙ staged server: healthz + артефакт байт-в-байт
    assert.ok(pidAlive(sb), 'процесс сервиса жив (pid из MainPID-файла стаба)');
    const h = await healthz(sb);
    assert.deepEqual(
        { ok: h.ok, service: h.service, version: h.version, telemetry: h.telemetry, retention_days: h.retention_days },
        { ok: true, service: 'nd-config', version: 2, telemetry: 'disabled', retention_days: 30 },
        'healthz реального staged-процесса'
    );
    const cfg = await fetch('http://127.0.0.1:' + sb.port + '/config/weekly-modifiers.v1.json');
    assert.equal(cfg.status, 200);
    assert.deepEqual(Buffer.from(await cfg.arrayBuffer()), committedBytes, 'артефакт из релиза — байт в байт');

    // оркестрация: enable и start были; бот не упоминается вообще
    const log = stubLogText(sb);
    assert.match(log, /enable nd-config\.service/);
    assert.match(log, /start nd-config\.service/);
    assert.ok(!/neurodeck-bot/.test(log), 'ни одного обращения к прод-боту');

    // stderr-журнал деплоя: все гейты отмечены ok
    for (const gate of ['unit-active', 'healthz', 'main-pid', 'port-owner', 'symlink', 'owner']) {
        assert.ok(r.stderr.includes('[gate] ok ' + gate), 'гейт ' + gate + ': ' + r.stderr);
    }
});

test('install повторно на живом сервисе: env не перегенерируется, релизов больше, порт занят «самим собой» — ок', async () => {
    const sb = await makeSandbox('nd-deploy-reinstall-');
    assert.equal(sb.run(['install']).status, 0);
    const envFile = path.join(sb.envDir, 'env');
    const token1 = fs.readFileSync(envFile, 'utf8').match(/ND_CONFIG_TOKEN=([0-9a-f]+)/)[1];
    const rels1 = releases(sb);

    const r = sb.run(['install']);
    assert.equal(r.status, 0, r.stderr);
    const token2 = fs.readFileSync(envFile, 'utf8').match(/ND_CONFIG_TOKEN=([0-9a-f]+)/)[1];
    assert.equal(token2, token1, 'токен не перегенерирован');
    assert.equal(releases(sb).length, rels1.length + 1, 'добавился второй релиз');
    assert.notEqual(currentRelease(sb), rels1[0]);
    assert.ok((await healthz(sb)).ok);
    // живому сервису сделан restart (enable --now НЕ перезапускает активный unit — ловим старый баг)
    assert.match(stubLogText(sb), /restart nd-config\.service/);
    assert.equal(releases(sb).length, 2, 'prune держит 2 новейших (KEEP=3)');
});

// ---------- upgrade ----------

test('upgrade: атомарная смена current на новый релиз, гейты, prune старых', async () => {
    const sb = await makeSandbox('nd-deploy-upgrade-');
    assert.equal(sb.run(['install']).status, 0);
    const relA = currentRelease(sb);

    const r = sb.run(['upgrade']);
    assert.equal(r.status, 0, r.stderr);
    const relB = currentRelease(sb);
    assert.notEqual(relB, relA, 'current переключён на новый релиз');
    assert.ok(releases(sb).includes(relA), 'старый релиз сохранён (возможность отката)');
    assert.ok((await healthz(sb)).ok);
    assert.match(stubLogText(sb), /restart nd-config\.service/);

    // prune: мусорные «древние» релизы убраны, текущий не удалён никогда
    const junk = ['1000000000000000000Z', '1000000000000000001Z'];
    for (const j of junk) fs.mkdirSync(path.join(sb.optDir, 'releases', j), { recursive: true });
    const r2 = sb.run(['upgrade']);
    assert.equal(r2.status, 0, r2.stderr);
    const rels = releases(sb);
    assert.ok(!rels.includes(junk[0]) && !rels.includes(junk[1]), 'prune удалил древние: ' + rels.join(','));
    assert.ok(rels.includes(currentRelease(sb)), 'текущий не удалён');
    assert.ok(rels.length <= 3, 'держим не больше KEEP_RELEASES: ' + rels.join(','));
});

test('upgrade без установки: отказ с понятной причиной, ничего не ломается', async () => {
    const sb = await makeSandbox('nd-deploy-noupgrade-');
    const r = sb.run(['upgrade']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /сначала install/);
    assert.equal(currentRelease(sb), null);
});

test('upgrade с провалом гейтов: автооткат на предыдущий релиз, сервис здоров, провалившийся релиз сохранён', async () => {
    const sb = await makeSandbox('nd-deploy-autofail-');
    assert.equal(sb.run(['install']).status, 0);
    const relA = currentRelease(sb);
    assert.equal(sb.run(['upgrade']).status, 0);
    const relB = currentRelease(sb);

    // следующий рестарт «не поднимет сервис» (битый релиз): стаб откажет один раз
    fs.writeFileSync(sb.failCountFile, '1');
    const r = sb.run(['upgrade']);
    assert.notEqual(r.status, 0, 'провалившийся upgrade обязан вернуть не-0');
    assert.match(r.stderr, /АВТООТКАТ/);
    assert.equal(currentRelease(sb), relB, 'current откачен на предыдущий релиз');
    const rels = releases(sb);
    assert.equal(rels.length, 3, 'провалившийся релиз сохранён для разбора: ' + rels.join(','));
    // после автоотката сервис ЗДОРОВ на прежнем релизе (реальный процесс, реальный healthz)
    assert.ok(pidAlive(sb), 'процесс поднят после автоотката');
    const h = await healthz(sb);
    assert.equal(h.ok, true);
    assert.equal(h.version, 2, 'версия соответствует работающему коду');
    assert.ok(!/neurodeck-bot/.test(stubLogText(sb)), 'бот не тронут и в отказном сценарии');
    // рестартов было ≥2: на новом релизе и после отката
    const restarts = (stubLogText(sb).match(/restart nd-config\.service/g) || []).length;
    assert.ok(restarts >= 2, 'restart на битом + restart после отката: ' + restarts);

    // roll-forward: именованный release-rollback на провалившийся релиз (следующий рестарт уже здоров)
    const relC = rels[rels.length - 1];
    const rr = sb.run(['release-rollback', relC]);
    assert.equal(rr.status, 0, rr.stderr);
    assert.equal(currentRelease(sb), relC);
    assert.equal((await healthz(sb)).ok, true);
});

// ---------- release-rollback ----------

test('release-rollback без имени: current → предыдущий релиз, гейты, более новые сохранены', async () => {
    const sb = await makeSandbox('nd-deploy-rollback-');
    assert.equal(sb.run(['install']).status, 0);
    const relA = currentRelease(sb);
    assert.equal(sb.run(['upgrade']).status, 0);
    const relB = currentRelease(sb);

    const r = sb.run(['release-rollback']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(currentRelease(sb), relA, 'откат на предыдущий релиз');
    assert.ok(releases(sb).includes(relB), 'более новый релиз сохранён (можно вернуться)');
    assert.ok(pidAlive(sb));
    assert.equal((await healthz(sb)).ok, true);
});

test('release-rollback: именованный; на единственном релизе откатываться некуда', async () => {
    const sb = await makeSandbox('nd-deploy-rollback-named-');
    assert.equal(sb.run(['install']).status, 0);
    const relA = currentRelease(sb);
    assert.equal(sb.run(['upgrade']).status, 0);
    const relB = currentRelease(sb);

    const r = sb.run(['release-rollback', relA]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(currentRelease(sb), relA, 'именованный откат на A');

    // откат на уже текущий и на несуществующий — отказ без изменений
    let bad = sb.run(['release-rollback', relA]);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /уже текущий/);
    bad = sb.run(['release-rollback', 'no-such-release']);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /нет в/);
    assert.equal(currentRelease(sb), relA, 'current не изменился после отказов');
    assert.equal((await healthz(sb)).ok, true);

    // свежая установка из одного релиза: предыдущего нет — внятный отказ
    const sb2 = await makeSandbox('nd-deploy-rollback-sole-');
    assert.equal(sb2.run(['install']).status, 0);
    const sole = sb2.run(['release-rollback']);
    assert.notEqual(sole.status, 0);
    assert.match(sole.stderr, /некуда/);
    assert.equal(currentRelease(sb2), releases(sb2)[0]);
});

// ---------- legacy-миграция ----------

test('легаси-плоская раскладка нормализуется в релиз: install переносит старый код, не теряя его', async () => {
    const sb = await makeSandbox('nd-deploy-legacy-');
    // старая (до-R4) раскладка: код и конфиги лежали прямо в /opt/neurodeck-config
    fs.mkdirSync(path.join(sb.optDir, 'config'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'service', 'nd-config', 'server.cjs'), path.join(sb.optDir, 'server.cjs'));
    fs.copyFileSync(CONFIG_SRC, path.join(sb.optDir, 'config', 'weekly-modifiers.v1.json'));

    const r = sb.run(['install']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(path.join(sb.optDir, 'server.cjs')), 'плоские файлы убраны из корня');
    const rels = releases(sb);
    assert.equal(rels.length, 2, 'легаси-релиз + свежий: ' + rels.join(','));
    assert.ok(rels[0].startsWith('0-legacy-'), 'легаси-релиз сортируется старейшим: ' + rels[0]);
    assert.equal(currentRelease(sb), rels[rels.length - 1], 'текущий — свежий релиз');
    assert.ok(fs.existsSync(path.join(sb.optDir, 'releases', rels[0], 'server.cjs')), 'легаси-код сохранён в релизе');
    assert.equal((await healthz(sb)).ok, true);

    // и на легаси-релиз можно откатиться
    const rr = sb.run(['release-rollback', rels[0]]);
    assert.equal(rr.status, 0, rr.stderr);
    assert.equal(currentRelease(sb), rels[0]);
    const h = await healthz(sb);
    assert.equal(h.ok, true, 'легаси-код реально работает после отката');
});

// ---------- полный снос ----------

test('rollback (снос): unit/opt/env удалены, данные телеметрии сохранены; --purge-data удаляет', async () => {
    const sb = await makeSandbox('nd-deploy-uninstall-');
    assert.equal(sb.run(['install']).status, 0);
    fs.mkdirSync(sb.stateDir, { recursive: true });
    const tel = path.join(sb.stateDir, 'telemetry.jsonl');
    fs.writeFileSync(tel, '{"receivedAt":"2026-10-01T00:00:00Z","payload":{}}\n', { mode: 0o600 });

    const r = sb.run(['rollback']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(sb.unitDst), 'unit удалён');
    assert.ok(!fs.existsSync(sb.optDir), 'opt удалён');
    assert.ok(!fs.existsSync(sb.envDir), 'env удалён');
    assert.ok(fs.existsSync(tel), 'данные телеметрии СОХРАНЕНЫ по умолчанию');
    assert.ok(!pidAlive(sb), 'процесс остановлен');
    assert.match(stubLogText(sb), /disable --now nd-config\.service/);
    assert.ok(!/neurodeck-bot/.test(stubLogText(sb)));

    const r2 = sb.run(['rollback', '--purge-data']);
    assert.equal(r2.status, 0, r2.stderr);
    assert.ok(!fs.existsSync(sb.stateDir), '--purge-data сносит и данные');
});
