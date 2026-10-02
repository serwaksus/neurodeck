'use strict';
// Аудит 2026-10-02, P0-хотфикс — регрессии (NeuroDeck-audit-2026-10-02.md, разд. 1):
//  1.1 клятва на крови сверяется со ВЧЕРАШНИМ днём (lastDayReset к моменту вызова уже = сегодня);
//  1.4 финал 20/20: frontIdx() = −1 не должен ронять вкладку «Твердыни» (e2e: tests/e2e/audit-p0.test.js);
//  1.5 импорт/облако: санитайзеры (stats / xpHistory / uid / dailyQuests / bloodOath), без inline onerror (CSP: tests/csp.test.js);
//  1.2/1.3 «база» облака: пуш поверх чужой версии запрещён, восстановление ⟂ старт-колода.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const app = read('js', 'app.js');
const storage = read('js', 'storage.js');
const strongholds = read('js', 'ui', 'strongholds.js');
const SG = require('../js/state-guards.js');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function extractBlock(src, anchor) {
    const start = src.indexOf(anchor);
    assert.ok(start > -1, 'anchor not found: ' + anchor);
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > -1, 'unbalanced braces after: ' + anchor);
    return src.slice(start, end + 1);
}

// ---------------------------------------------------------------- 1.1 клятва на крови
function mkOath(nowIso, oath, card) {
    const now = Date.parse(nowIso);
    class FakeDate extends Date { static now() { return now; } }
    const failed = [];
    const src = 'const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;\n' +
        extractBlock(app, 'function getMSKDate(') + '\n' + extractBlock(app, 'function getMSKDayKey(') + '\n' +
        extractBlock(app, 'function checkBloodOathDaily(') +
        '\nreturn { run: checkBloodOathDaily, oath: function() { return bloodOath; } };';
    const api = new Function('bloodOath', 'findCard', 'failBloodOath', 'Date', src)(oath, () => card, (reason) => failed.push(reason), FakeDate);
    return { api, failed };
}
const WED_10_MSK = '2026-09-30T07:00:00Z'; // среда 10:00 МСК, вторник = 2026-09-29
const TUE_NOON_MSK = Date.parse('2026-09-29T09:00:00Z');
const WED_NOON_MSK = Date.parse('2026-09-30T09:00:00Z');
const mkActive = (extra) => Object.assign({ cardId: 101, cardName: 'Карточка', status: 'active', streak: 2, requiredDays: 5, assignedMonday: '2026-09-28', lastCompletedDay: '2026-09-29' }, extra || {});

test('1.1 клятва: выполнена вчера, сегодня ещё нет → клятва жива (до фикса сверка шла с lastDayReset = сегодня)', () => {
    const { api, failed } = mkOath(WED_10_MSK, mkActive(), { id: 101, lastCompletedAt: TUE_NOON_MSK });
    api.run();
    assert.deepEqual(failed, [], 'не должно быть провала');
    assert.ok(api.oath(), 'клятва на месте');
});

test('1.1 клятва: вчера пропущено (последнее выполнение — позавчера) → провал', () => {
    const { api, failed } = mkOath(WED_10_MSK, mkActive({ lastCompletedDay: '2026-09-28' }), { id: 101, lastCompletedAt: Date.parse('2026-09-28T09:00:00Z') });
    api.run();
    assert.equal(failed.length, 1, 'ровно один провал');
});

test('1.1 клятва: ни разу не выполнена (null) и сегодня не сделана → провал', () => {
    const { api, failed } = mkOath(WED_10_MSK, mkActive({ lastCompletedDay: null, streak: 0 }), { id: 101, lastCompletedAt: null });
    api.run();
    assert.equal(failed.length, 1);
});

test('1.1 клятва: выполнена сегодня → жива независимо от lastCompletedDay', () => {
    const { api, failed } = mkOath(WED_10_MSK, mkActive({ lastCompletedDay: '2026-09-30' }), { id: 101, lastCompletedAt: WED_NOON_MSK });
    api.run();
    assert.deepEqual(failed, []);
});

test('1.1 клятва: граница суток по МСК (00:30 МСК = 21:30 UTC) — «вчера» считается по МСК, не по UTC', () => {
    // 2026-09-29T21:30Z = среда 00:30 МСК → вчера = вторник 2026-09-29
    const { api, failed } = mkOath('2026-09-29T21:30:00Z', mkActive({ lastCompletedDay: '2026-09-29' }), { id: 101, lastCompletedAt: TUE_NOON_MSK });
    api.run();
    assert.deepEqual(failed, []);
});

test('1.1 клятва: карточки нет → клятва снимается тихо; не active → no-op', () => {
    const a = mkOath(WED_10_MSK, mkActive(), null);
    a.api.run();
    assert.equal(a.api.oath(), null);
    assert.deepEqual(a.failed, []);
    const b = mkOath(WED_10_MSK, mkActive({ status: 'completed' }), { id: 101, lastCompletedAt: null });
    b.api.run();
    assert.deepEqual(b.failed, []);
    const c = mkOath(WED_10_MSK, null, null);
    c.api.run();
    assert.deepEqual(c.failed, []);
});

test('1.1 источник: checkBloodOathDaily не сверяется с lastDayReset', () => {
    const src = noComments(extractBlock(app, 'function checkBloodOathDaily('));
    assert.ok(!/lastDayReset/.test(src), 'lastDayReset к моменту вызова уже = сегодня — сверка с ним ломала любую клятву');
    assert.ok(/86400000/.test(src), 'вчерашний ключ дня');
});

// ---------------------------------------------------------------- 1.4 эндгейм
test('1.4 эндгейм: ни одного неохраняемого STRONGHOLDS[frontIdx()] (при 20/20 frontIdx() = −1)', () => {
    for (const [name, src] of [['js/app.js', app], ['js/ui/strongholds.js', strongholds]]) {
        const unguarded = noComments(src).replace(/frontIdx\(\)\s*>=\s*0\s*&&\s*STRONGHOLDS\[\s*frontIdx\(\)\s*\]/g, ''); // «frontIdx() >= 0 && …» — охраняемое
        const hits = unguarded.match(/STRONGHOLDS\[\s*frontIdx\(\)\s*\]\.[a-z]+/g) || [];
        assert.deepEqual(hits, [], name + ': разыменование STRONGHOLDS[frontIdx()] без проверки на −1');
    }
    assert.ok(/_frontI\s*>=\s*0/.test(strongholds), 'осадная тревога: проверка _frontI >= 0');
});

// ---------------------------------------------------------------- 1.5 санитайзеры импорта/облака
const XSS = '<img src=x onerror="window.__xss=1">';

test('1.5 xpHistory: в график (innerHTML) попадают только ГГГГ-ММ-ДД', () => {
    const out = SG.sanitizeXpHistory([
        { date: '2026-10-01', xp: 5 }, { date: XSS, xp: 1 }, { date: '2026-1-1', xp: 1 }, { date: 20261001, xp: 1 }, null, 'x',
    ]);
    assert.deepEqual(out, [{ date: '2026-10-01', xp: 5 }]);
});

test('1.5 артефакты: uid только [A-Za-z0-9_-]{1,40}, id — только собственные ключи каталога', () => {
    const catalog = { a1: { id: 'a1', slot: 'head', name: 'Шлем' }, a2: { id: 'a2', slot: 'amulet', name: 'Амулет' } };
    const inv = (backpack) => SG.sanitizeInventory({ backpack: backpack }, catalog, 30).backpack;
    const bad = inv([{ id: 'a1', uid: '"><img src=x onerror=1>' }]);
    assert.equal(bad.length, 1);
    assert.ok(/^[A-Za-z0-9_-]{1,40}$/.test(bad[0].uid) && bad[0].uid !== '"><img src=x onerror=1>', 'опасный uid заменён безопасным запасным');
    assert.equal(inv([{ id: 'a1', uid: 'i17_abc' }])[0].uid, 'i17_abc', 'нормальный uid сохраняется');
    assert.equal(inv([{ id: 'a1', uid: 'x'.repeat(41) }])[0].uid.length <= 40, true, 'длина ≤ 40');
    assert.deepEqual(inv([{ id: 'constructor' }, { id: '__proto__' }, { id: 'toString' }, { id: 'hasOwnProperty' }]), [], 'прототипные ключи — не каталог');
    assert.deepEqual(inv([{ id: ['a1'] }, { id: { toString() { return 'a1'; } } }, { id: 1 }]), [], 'нестроковый id отбрасывается');
    assert.deepEqual(inv([{ id: 'a1', uid: 'dup' }, { id: 'a2', uid: 'dup' }]).map(x => x.id), ['a1'], 'дубли uid отсекаются');
});

const POOL = [
    { id: 'q1', icon: '⚔', text: 'Сделай карточку', goal: 2, type: 'cards', rewardGold: 10 },
    { id: 'q2', icon: '💰', text: 'Накопи золото', goal: 50, type: 'gold', rewardGold: 15 },
    { id: 'q3', icon: '🏗', text: 'Построй', goal: 1, type: 'build', rewardGold: 20 },
];

test('1.5 dailyQuests: задания пересобираются из каталога по id (icon/text из импорта не доезжают до innerHTML)', () => {
    const out = SG.sanitizeDailyQuests({
        day: '2026-10-01',
        quests: [{ id: 'q1', icon: XSS, text: XSS }, { id: 'zzz', icon: XSS }, { id: 'q1' }, { id: 'q2' }, null, 'q3'],
        done: { q1: true, zzz: true, q2: 'yes', q3: 1 },
        progress: { cards: 3, gold: -1, evil: 5, hire: 'abc', build: 1e12 },
    }, POOL);
    assert.equal(out.day, '2026-10-01');
    assert.deepEqual(out.quests.map(q => q.id), ['q1', 'q2'], 'только известные, без дублей');
    assert.equal(out.quests[0], POOL[0], 'объект — из каталога, а не из импорта');
    assert.deepEqual(out.done, { q1: true }, 'только известные id и только === true');
    assert.deepEqual(out.progress, { cards: 3, build: 1e9 }, 'только счётчики; положительные; потолок 1e9');
});

test('1.5 dailyQuests: мусор → пустая структура; день не по формату → null', () => {
    assert.deepEqual(SG.sanitizeDailyQuests(null, POOL), { day: null, quests: [], done: {}, progress: {} });
    assert.deepEqual(SG.sanitizeDailyQuests([1, 2], POOL), { day: null, quests: [], done: {}, progress: {} });
    assert.equal(SG.sanitizeDailyQuests({ day: XSS }, POOL).day, null);
    const many = SG.sanitizeDailyQuests({ day: '2026-10-01', quests: Array.from({ length: 50 }, (_, i) => ({ id: 'q' + (i % 3 + 1) })) }, POOL);
    assert.ok(many.quests.length <= 3);
});

test('1.5 bloodOath: только известные поля и типы', () => {
    const ok = SG.sanitizeBloodOath({ cardId: 101.4, cardName: 'К'.repeat(500), streak: 99, requiredDays: 999, status: 'active',
        assignedMonday: '2026-09-28', lastCompletedDay: XSS, evil: { a: 1 } });
    assert.equal(ok.cardId, 101);
    assert.equal(ok.cardName.length, 80);
    assert.equal(ok.requiredDays, 30);
    assert.equal(ok.streak, 30, 'streak не больше requiredDays');
    assert.equal(ok.assignedMonday, '2026-09-28');
    assert.equal(ok.lastCompletedDay, null);
    assert.equal(ok.evil, undefined);
    assert.deepEqual(Object.keys(ok).sort(), ['assignedMonday', 'cardId', 'cardName', 'lastCompletedDay', 'requiredDays', 'status', 'streak']);
    for (const bad of [null, 'oath', [], { status: 'weird', cardId: 1 }, { status: 'active', cardId: 0 }, { status: 'active', cardId: 'x' }, { status: 'active' }]) {
        assert.equal(SG.sanitizeBloodOath(bad), null, JSON.stringify(bad));
    }
    assert.equal(SG.sanitizeBloodOath({ status: 'active', cardId: 7 }).requiredDays, 5, 'дефолт 5 дней');
});

test('1.5 applySyncData: статы — только числа (без Object.assign), клятва/квесты/событие — через санитайзеры', () => {
    const src = noComments(extractBlock(storage, 'function applySyncData('));
    assert.ok(!/Object\.assign\(\s*STATS/.test(src), 'Object.assign(STATS[…], data.stats[…]) пускал name/ключи из импорта');
    assert.ok(/sanitizeBloodOath\(\s*data\.bloodOath/.test(src), 'клятва через санитайзер');
    assert.ok(/sanitizeDailyQuests\(\s*data\.dailyQuests/.test(src), 'дневные задания через санитайзер');
    assert.ok(/buildDailyEvents\(\)/.test(src), 'дневное событие — запись каталога, а не объект из импорта');
});

test('1.5 спрайты: нет inline onerror — запасной эмодзи через data-nd-fb + делегированный обработчик', () => {
    const src = noComments(strongholds);
    assert.ok(!/onerror\s*=/i.test(src), 'inline-обработчик режется CSP (script-src без unsafe-inline)');
    assert.ok(/data-nd-fb/.test(src), 'запасной эмодзи в data-атрибуте');
    assert.ok(/addEventListener\(\s*'error'[\s\S]{0,400}true\s*\)/.test(src), 'error не всплывает — слушатель в фазе захвата');
});

// ---------------------------------------------------------------- 1.2 база облака
function mkBase(win, ls) {
    const src = 'var CLOUD_BASE_KEY = "nd_cloud_base";\n' + ['ndCloudBaseGet', 'ndCloudBaseSet', 'ndCloudDiverged'].map(n => extractBlock(storage, 'function ' + n + '(')).join('\n') +
        '\nreturn { get: ndCloudBaseGet, set: ndCloudBaseSet, diverged: ndCloudDiverged };';
    return new Function('window', 'localStorage', src)(win, ls);
}
const memLS = (init) => { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const B = 'nd_cloud_base';

test('1.2 база: без базы — легаси-правило по честной метке (savedAt последнего сохранения ДО сессии)', () => {
    const b = mkBase({ __ndBootSavedAt: 1000000 }, memLS());
    assert.equal(b.diverged({ t: 1005000 }), false, 'в пределах 10 с — наше');
    assert.equal(b.diverged({ t: 1020000 }), true, 'облако новее нашего последнего сейва — чужое');
    assert.equal(b.diverged(null), false);
    assert.equal(b.diverged('x'), false);
});

test('1.2 база: новое устройство (нет локального сейва) — любое непустое облако «чужое» → старт-колода его не затрёт', () => {
    const b = mkBase({}, memLS());
    assert.equal(b.diverged({ t: 1727500000000, id: 'abc' }), true);
});

test('1.2 база: есть база — решает id версии, а не время', () => {
    const ls = memLS({ [B]: JSON.stringify({ id: 'AAA', pid: '', t: 5 }) });
    const b = mkBase({ __ndBootSavedAt: 9e12 }, ls); // даже «будущий» локальный savedAt не мешает
    assert.equal(b.diverged({ id: 'AAA', t: 5 }), false, 'та же версия');
    assert.equal(b.diverged({ id: 'BBB', t: 1 }), true, 'другая версия — даже с «старой» меткой');
    assert.equal(b.diverged({ t: 5 }), false, 'легаси-конверт без id, та же метка');
    assert.equal(b.diverged({ t: 6 }), true, 'легаси-конверт без id, другая метка');
});

test('1.2 база: pid — пуш «в полёте» (meta мог записаться, колбэк не дошёл)', () => {
    const ls = memLS({ [B]: JSON.stringify({ id: 'AAA', pid: 'PPP', t: 5 }) });
    const b = mkBase({}, ls);
    assert.equal(b.diverged({ id: 'PPP', t: 9 }), false, 'наш незавершённый пуш');
    assert.equal(b.diverged({ id: 'CCC', t: 9 }), true);
});

test('1.2 база: set(meta) заменяет базу и сбрасывает pid; set(null, pid) без базы — no-op, с базой — только pid', () => {
    const ls = memLS();
    const b = mkBase({}, ls);
    b.set(null, 'P1');
    assert.equal(ls.getItem(B), null, 'базы не было — pid не создаёт её');
    b.set({ id: 'A1', t: 11 });
    assert.deepEqual(JSON.parse(ls.getItem(B)), { id: 'A1', pid: '', t: 11 });
    b.set(null, 'P2');
    assert.deepEqual(JSON.parse(ls.getItem(B)), { id: 'A1', pid: 'P2', t: 11 }, 'id прежний — pid добавлен');
    b.set({ id: 'P2', t: 12 });
    assert.deepEqual(JSON.parse(ls.getItem(B)), { id: 'P2', pid: '', t: 12 });
    b.set({ t: 13 }); // легаси-конверт: id пустой, метка
    assert.deepEqual(JSON.parse(ls.getItem(B)), { id: '', pid: '', t: 13 });
    b.set('garbage');
    assert.deepEqual(JSON.parse(ls.getItem(B)), { id: '', pid: '', t: 13 }, 'мусор не затирает базу');
});

test('1.2 база: битый localStorage не роняет', () => {
    const b = mkBase({ __ndBootSavedAt: 0 }, memLS({ [B]: '{not json' }));
    assert.equal(b.get(), null);
    assert.equal(b.diverged({ t: 1727500000000 }), true, 'нет базы и нет локального сейва — считаем чужим');
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const c = mkBase({}, boom);
    assert.doesNotThrow(() => { c.set({ id: 'x', t: 1 }); c.get(); c.diverged({ t: 1 }); });
});

function mkAuto(opts) {
    const calls = { push: 0, timers: [], badge: [], toasts: [] };
    const ls = memLS(opts.base ? { [B]: JSON.stringify(opts.base) } : {});
    const win = Object.assign({}, opts.win || {});
    const diverged = mkBase(win, ls).diverged;
    const cs = { getItem(key, cb) { cb(null, opts.meta === undefined ? null : JSON.stringify(opts.meta)); } };
    const run = new Function('window', '_pushInFlight', 'getCloudStorage', 'FORGED', 'pushCloudChunks', 'updateSyncBadge', 'showToast', 'CLOUD_META_KEY', 'ndCloudDiverged', 'smartCloudSync', 'setTimeout', 'ndTel',
        extractBlock(storage, 'function autoCloudSave(') + '; return autoCloudSave;')(
        win, false, () => cs, [{ id: 1 }], (c, j, done) => { calls.push++; if (done) done(); }, (s) => calls.badge.push(s), (...a) => calls.toasts.push(a), 'nd_meta',
        diverged, function smartCloudSync() {}, (fn, ms) => calls.timers.push([fn, ms]), () => {});
    return { run, calls, win };
}
const SAVED = '{"savedAt":1727500000000}';

test('1.2 autoCloudSave: облако изменено другим устройством (id ≠ база) → пуша НЕТ, запускается сверка', () => {
    const t = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'BBB', t: 1 } });
    t.run(SAVED, false);
    assert.equal(t.calls.push, 0, 'чужой прогресс не перезаписывается');
    assert.equal(t.calls.timers.length, 1, 'сверка (smartCloudSync) поставлена в очередь');
});

test('1.2 autoCloudSave: тот же id, что в базе → пуш идёт', () => {
    const t = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'AAA', t: 1 } });
    t.run(SAVED, false);
    assert.equal(t.calls.push, 1);
});

test('1.2 autoCloudSave: форс-пуш без bypass на чужом облаке — тоже не пишет (бейдж offline), с bypass («Оставить моё») — пишет', () => {
    const a = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'BBB', t: 1 } });
    a.run(SAVED, true, false);
    assert.equal(a.calls.push, 0);
    assert.deepEqual(a.calls.badge, ['offline']);
    const b = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'BBB', t: 1 } });
    b.run(SAVED, true, true);
    assert.equal(b.calls.push, 1, 'осознанный выбор пользователя «Оставить моё»');
});

test('1.2 autoCloudSave: стоп-кран сверки — не чаще раза в 20 с и не поверх открытого диалога', () => {
    const a = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'BBB', t: 1 }, win: { _lastReconcileTry: Date.now() } });
    a.run(SAVED, false);
    assert.equal(a.calls.timers.length, 0, 'недавняя попытка — не повторяем');
    const b = mkAuto({ base: { id: 'AAA', pid: '', t: 1 }, meta: { id: 'BBB', t: 1 }, win: { _cloudDialogOpen: true } });
    b.run(SAVED, false);
    assert.equal(b.calls.timers.length, 0, 'диалог уже открыт');
    assert.equal(b.calls.push, 0);
});

test('1.2 autoCloudSave: пустое облако (нет meta) → пуш идёт', () => {
    const t = mkAuto({ meta: undefined });
    t.run(SAVED, false);
    assert.equal(t.calls.push, 1);
});

test('1.2 pushCloudChunks / saveToCloud / loadFromCloud / tryCloudRecovery / smartCloudSync обновляют базу', () => {
    const push = noComments(extractBlock(storage, 'function pushCloudChunks('));
    assert.ok(/ndCloudBaseSet\(\s*null\s*,\s*saveId\s*\)/.test(push), 'pid ставится ДО записи meta');
    assert.ok(/ndCloudBaseSet\(\s*\{\s*id:\s*saveId/.test(push), 'база = записанная версия после успеха');
    for (const fn of ['loadFromCloud', 'tryCloudRecovery', 'smartCloudSync']) {
        assert.ok(/ndCloudBaseSet\(/.test(noComments(extractBlock(storage, 'function ' + fn + '('))), fn + ' обновляет базу после принятия облака');
    }
    assert.ok(/__ndBootSavedAt\s*=/.test(extractBlock(storage, 'function loadGameState(')), 'честная метка boot-сейва запоминается до первого ресейва');
});

// ---------------------------------------------------------------- 1.3 восстановление ⟂ старт-колода
test('1.3 holdStarterDeck: ждёт и проверку облака, и открытый диалог восстановления', () => {
    const src = noComments(extractBlock(app, 'holdStarterDeck'));
    assert.ok(/__ndCloudCheckPending/.test(src));
    assert.ok(/__ndRecoveryOpen/.test(src), 'пока открыт диалог «Найдено облачное сохранение» — колоду не показываем');
});

test('1.3 tryCloudRecovery: флаг диалога поднят до confirm и опущен в любом исходе; fail-safe гасится ответом облака', () => {
    const src = noComments(extractBlock(storage, 'function tryCloudRecovery('));
    const up = src.indexOf('__ndRecoveryOpen = true');
    const confirmAt = src.indexOf('dungeonConfirm(');
    assert.ok(up > -1 && confirmAt > -1 && up < confirmAt, 'флаг до диалога');
    assert.ok(/__ndRecoveryOpen\s*=\s*false/.test(src), 'флаг опускается');
    assert.ok(/clearTimeout\(\s*failSafe\s*\)/.test(src), 'fail-safe отменяется, когда облако ответило');
});
