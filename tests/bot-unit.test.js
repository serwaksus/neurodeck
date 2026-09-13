const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UNIT_PATH = '/etc/systemd/system/neurodeck-bot.service';
const UNIT_REPO = path.join(__dirname, '..', 'bot', 'neurodeck-bot.service');
const BOT_DIR = path.join(__dirname, '..', 'bot');

test('bot/neurodeck-bot.service (каноничный юнит в репо): file exists and parses structurally', () => {
    const raw = fs.readFileSync(UNIT_REPO, 'utf8');
    assert.ok(raw.includes('[Unit]'), 'missing [Unit] section');
    assert.ok(raw.includes('[Service]'), 'missing [Service] section');
    assert.ok(raw.includes('[Install]'), 'missing [Install] section');
});

test('/etc copy must be a symlink to the repo copy (single source of truth, no drift possible)', () => {
    const st = fs.lstatSync(UNIT_PATH);
    assert.ok(st.isSymbolicLink(), '/etc/systemd/system/neurodeck-bot.service must be a symlink to bot/neurodeck-bot.service');
    assert.equal(fs.realpathSync(UNIT_PATH), fs.realpathSync(UNIT_REPO));
    // контент доступен и идентичен через симлинк
    assert.equal(fs.readFileSync(UNIT_PATH, 'utf8'), fs.readFileSync(UNIT_REPO, 'utf8'));
});

test('neurodeck-bot unit: ExecStart/EnvironmentFile targets exist on disk', () => {
    const raw = fs.readFileSync(UNIT_PATH, 'utf8');
    const refs = [...raw.matchAll(/^(?:ExecStart=.*)?(\/root\/\S+\.(?:js|conf))$/gm)]
        .map((m) => m[1]);
    for (const line of raw.split('\n')) {
        const m = line.match(/^(ExecStart|EnvironmentFile)=(.*)$/);
        if (!m) continue;
        // ExecStart: "/usr/bin/env node /root/.../polling.js" — проверяем каждый путь в строке
        const targets = m[2].split(' ').filter((t) => t.startsWith('/'));
        assert.ok(targets.length > 0, m[1] + ' has no absolute target');
        for (const t of targets) {
            assert.ok(fs.existsSync(t), m[1] + ' target missing: ' + t);
        }
    }
    assert.ok(refs.length >= 0); // refs — информативный сбор, основной assert выше
});

test('neurodeck-bot unit: restart policy and token env are wired', () => {
    const raw = fs.readFileSync(UNIT_PATH, 'utf8');
    assert.ok(raw.includes('Restart=always'), 'bot must auto-restart');
    assert.ok(/EnvironmentFile=.*token\.conf$/m.test(raw), 'token must come from token.conf (never inline)');
    const tokenFile = path.join(BOT_DIR, 'token.conf');
    if (fs.existsSync(tokenFile)) {
        const stat = fs.statSync(tokenFile);
        assert.equal(stat.mode & 0o077, 0, 'token.conf must not be group/world readable (chmod 600)');
    }
});

test('neurodeck-bot: token never committed to git', () => {
    const gitignore = fs.readFileSync(path.join(BOT_DIR, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('token.conf'), 'token.conf must be gitignored');
});
