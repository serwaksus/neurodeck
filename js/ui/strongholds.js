/* NeuroDeck UI — Твердыни (State Store 2.0, шаг 3 / P20): рендеры обзора и панели
   твердыни вынесены из app.js в отдельный classic-script. Функции — ГЛОБАЛЬНЫЕ
   объявления (как были в app.js): app.js грузится ПОСЛЕ и зовёт их как раньше,
   а этот модуль в рантайме читает глобалы app.js (SM/HERO/army/strongholds/
   currentShIdx…) — разрешение имён в момент вызова, поведение байт-в-байт
   (characterization P17 зелёный, visual-базлайны не тронуты).
   Доменные подписки: NDStore эмитит 'nd:store:stronghold' / 'nd:store:economy' /
   'nd:store:siege' на каждую состоявшуюся команду (js/state/store.js, P19) —
   ndShUiBind() подписывает актуализацию активного экрана «Твердыни» на все три.
   Рендер идемпотентен (тот же HTML из тех же данных), подписка срабатывает только
   при видимой вкладке (#view-strongholds.active) и в той же синхронной задаче, что
   и явный рендер app.js — между ними браузер не красит кадр, дрейфа базлайнов нет.
   ES5, ноль зависимостей; typeof-гварды на NDDBus (модуль грузится и без шины). */

// ---- бейдж стадии постройки (перенос из app.js, единственный потребитель — builtTileHtml) ----
function stageBadgeHtml(st) {
var map = { ok: ['✓ Целое', 'ok'], worn: ['⚠ Обветшало', 'worn'], ruin: ['✖ Руина', 'ruin'] };
var m = map[st] || map.ok;
return '<span class="sh-stage ' + m[1] + '">' + m[0] + '</span>';
}

// ---- рендеры Твердынь: обзор (баннер/казна/карта/фронт/сезон) и панель твердыни ----
// (перенос из app.js, шаг 3 state-store: app.js худеет, вызовы остаются глобальными)
function renderStrongholds() {
ensureStrongholdState();
if (!SM) return;
if (currentShIdx !== null) { renderStrongholdPanel(currentShIdx); return; }
var root = document.getElementById('strongholdsRoot');
if (!root) return;
kmCamInit();
var front = frontIdx();
var cap = capturedCount();
// (баннер «Королевство Владыки» перезаписывался итоговым root.innerHTML — вызов убран; функция осталась для совместимости)
var _ic = function(n) { return '<svg class="icn" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
var html = '<div class="sh-treasury">' +
'<div class="tr-cell tr-gold">' + _ic('gold') + '<b>' + (HERO.gold || 0) + '</b></div>' +
'<div class="tr-cell">Налоги: <b class="up">+' + shIncomePerDay() + ' 💰/день</b></div>' +
'<div class="tr-cell">Содержание: <b class="down">−' + shUpkeepPerDay() + ' 💰/день</b></div>' +
'<div class="tr-cell">' + _ic('sword') + ' Армия: <b>' + SM.armyPower(army.units) + '</b></div></div>';
html += corruptionForecastLineHtml(); // P7: прогноз «до руины N дн.» (только при реальной угрозе)
var fi = frontIdx();
var daysToSiege = daysToSiegeNow();
html += '<div class="sh-context-anchor"><span class="ctx">' + _ic('siege') + ' Фронт: <b>' + (STRONGHOLDS[fi] ? STRONGHOLDS[fi].name : '—') + '</b></span><span class="ctx warn">Осада через <b>' + Math.max(1, daysToSiege) + ' дн.</b></span><span class="ctx">Гнев: <b>' + siegeWrathNow() + '/10</b></span></div>';
// ФАЗА E: карта королевства заменяет ленту провинций (панели твердыни не тронуты)
html += kingdomMapHtml(daysToSiege);
// Фронт: штурмовая карточка под картой (штурм остаётся доступным из обзорного состояния)
// C2: целей может быть несколько (развилка пров. 2/4) — карточка на каждую фронтирную,
// дефолт (линейный фронт) первой и подсвечена классом front
var _frontTargets = assaultTargetChoices();
_frontTargets.forEach(function(ti) {
var fd = STRONGHOLDS[ti];
var _tiLabel = (ti === 0) ? ' <span class="sh-req">стартовый лагерь</span>'
: (_frontTargets.length > 1 ? ' <span class="sh-req" title="' + branchTipText(ti) + '">' + branchMeta(fd.branch).icon + ' ' + branchMeta(fd.branch).name + '</span>' : '');
html += '<div class="sh-card' + (ti === front ? ' front' : '') + ' km-front-card"><div class="sh-icon">' + fd.icon + '</div>' +
'<div class="sh-body"><div class="sh-name">' + fd.name + _tiLabel + '</div>' +
'<div class="sh-meta">' + frontPowerText(ti) + '</div></div>' +
'<button class="sh-assault" data-action="sh-assault" data-idx="' + ti + '">' + _ic('sword') + ' Штурм</button>' + scoutButtonHtml(ti) + '</div>';
});
html += '<div class="km-stance-row">' + '<button class="km-stance km-chron-btn" data-action="km-chronicle-open"><span class="km-stance-ico">📜</span><span class="km-stance-name">Хроника</span><span class="km-stance-desc">летопись кампании</span></button>' + '<button class="km-stance km-chron-btn" data-action="km-techs-open"><span class="km-stance-ico">🔬</span><span class="km-stance-name">Технологии</span><span class="km-stance-desc">🔬' + TECH_PTS + ' · 📦' + resPool() + '</span></button>' + Object.keys(STANCES).map(function(sid) {
  var st = STANCES[sid], act = weekStance() === sid;
  return '<button class="km-stance' + (act ? ' active' : '') + '" data-action="km-stance" data-stance="' + sid + '"' + (act ? ' disabled' : '') + '><span class="km-stance-ico">' + st.icon + '</span><span class="km-stance-name">' + st.name + '</span><span class="km-stance-desc">' + st.desc + '</span></button>';
}).join('') + '</div>';
html += siegePrepBlockHtml(); // C4: подготовка осады — подход недели + осадный склад
var tRoutesUI = SM.tradeRoutes ? SM.tradeRoutes(strongholds.map(function(s) { return !!s.captured; })) : 0; // P10: отчёт тени консолидирован в панель подготовки (siegePrepScoutHtml) — и для не-фронтальных целей
if (tRoutesUI > 0) html += '<div class="sh-trade">🛃 Торговые пути: <b>' + tRoutesUI + '</b> · налоги <b>+' + Math.round((SM.tradeBonus(tRoutesUI)) * 100) + '%</b></div>';
var _season = ensureSeason();
var _sTotal = seasonDaysTotal(_season.start);
var _sDone = seasonDaysDone(_season.start);
html += '<div class="sh-season"><div class="sh-season-line">🍂 Сезон ' + _season.num + ': <b>' + seasonName(_season.num) + '</b> · осталось <b>' + Math.max(0, _sTotal - _sDone) + '</b> дн.</div><div class="sh-season-bar"><div class="sh-season-fill" style="width:' + Math.min(100, Math.round(_sDone / _sTotal * 100)) + '%;"></div></div></div>';
html += weeklyModifierLineHtml(); // C6-lite: модификатор недели (только эндгейм 20/20 — вне эндгейма строка пустая, базлайны не задеты)
html += weeklyScoreLineHtml(); // P14: счёт недели (только эндгейм 20/20) — в блоке панели сезона
var _wt = warlordTempo(), _wm = seasonCapturedDelta(); // Г1-6: тень воеводы
html += '<div class="sh-warlord">⚔ Глорх, Погибель Урядов: <b>' + _wt + '</b> · ты: <b>' + _wm + '</b><div class="sh-season-bar" title="Прогресс до обгона воеводы"><div class="sh-season-fill' + (_wm >= _wt ? ' warlord-ahead' : '') + '" style="width:' + Math.min(100, Math.round(_wm / (_wt + 1) * 100)) + '%;"></div></div></div>';
html += '<div class="sh-wrath">😮 Гнев: <b>' + siegeWrathNow() + '/10</b> <span style="color:var(--text-dim)">· призраки задач и пропуски усилят удар</span></div>'; // #37: гнев виден заранее
var _alarm = (daysToSiege <= 2) ? siegeAlarmPreview() : null; // Ф1: осадная тревога за 2 дня и в день осады
html += seasonTrialsHtml(); // G2: испытания сезона
if (_alarm) {
    var _agenda = []; // G2: повестка осадной недели — конкретные шаги
    if (_alarm.ratio !== null && _alarm.ratio < 1) _agenda.push('найм/постройки обороны до штурма');
    if ((siegeWrathNow() || 0) >= 4) _agenda.push('закрыть призраки и задачи — гнев ' + siegeWrathNow() + '/10');
    var _stW = weatherSeasonWeek();
    var _frontI = frontIdx(); // при 20/20 фронта нет (−1)
    var _frontProv = (_frontI >= 0 && STRONGHOLDS[_frontI]) ? STRONGHOLDS[_frontI].prov : null;
    if (_frontProv !== null && weatherOf(_frontProv, _stW.sn, _stW.wk).id === 'blizzard' && weatherNorth(_frontProv)) _agenda.push('метель: содержание ×2 — не нанимай лишнего');
    html += '<div class="siege-alarm">⚠ <b>Осадная тревога</b> · враг ~<b>' + _alarm.power + '</b> · оборона <b>' + _alarm.def + '</b>' + (_alarm.ratio === null ? '' : ' (' + Math.round(_alarm.ratio * 100) + '%)') + ' — ' + _alarm.advice + (_agenda.length ? '<br><span style="color:var(--text-dim)">Повестка: ' + _agenda.join(' · ') + '</span>' : '') + '</div>';
}
html += renderTowerCard(cap); // Ф3: башня-марафон (только при 20/20)
checkSiegeAlarmToast();
// Квест-доска (3 ротационных дневных задания)
if (!dailyQuests || dailyQuests.day !== getMSKDayKey() || !dailyQuests.quests || !dailyQuests.quests.length) {
    var seed = parseInt(getMSKDayKey().replace(/-/g, ''));
    var _sameDay = !!(dailyQuests && dailyQuests.day === getMSKDayKey());
    dailyQuests = { day: getMSKDayKey(), quests: [DQ_POOL[seed % 6], DQ_POOL[(seed + 2) % 6], DQ_POOL[(seed + 4) % 6]], done: _sameDay ? (dailyQuests.done || {}) : {}, progress: _sameDay ? (dailyQuests.progress || {}) : {} };
}
html += '<div class="sh-quest-board"><div class="sh-quest-title">📋 Задания дня</div>';
dailyQuests.quests.forEach(function(q) {
    if (dailyQuests.done[q.id]) { html += '<div class="sh-quest done">✓ ' + q.text + ' (+' + q.reward + ' 💰)</div>'; return; }
    var _qp = (dailyQuests.progress || {})[q.counter] || 0;
    html += '<div class="sh-quest" data-action="sh-daily-quest" data-qid="' + q.id + '" data-reward="' + q.reward + '">☐ ' + q.icon + ' ' + q.text + ' (' + Math.min(_qp, q.goal) + '/' + q.goal + ') → +' + q.reward + ' 💰</div>';
});
html += '</div>';
root.innerHTML = html;
}
function html_strongholds_banner(root, cap) {
var pct = Math.round(cap / 20 * 100);
var html = '<div class="kingdom-banner">' +
'<div class="kb-crown">👑</div>' +
'<div class="kb-info">' +
'<div class="kb-title">Королевство Владыки</div>' +
'<div class="kb-sub">' + cap + '/20 твердыней · ' + pct + '%</div>' +
'</div>' +
'<div class="kb-bar"><div class="kb-bar-fill" style="width:' + pct + '%"></div></div>' +
'</div>';
root.innerHTML = html;
}
function shSpriteImg(path, emoji) {
// Визуал-план фаза 3: единый язык иконок — силуэты game-icons (CC BY 3.0, см. ART_MANIFEST) в медальонах вместо смеси
// изометрии Kenney и пиксельных юнитов. Таблица внутри функции: харнессы извлекают её поодиночке.
var M = { zh1: ['huts-village', 'zh'], zh2: ['barracks', 'zh'], zh3: ['archery-target', 'zh'], zh4: ['sword-smithing', 'zh'], zh5: ['stable', 'zh'], zh6: ['church', 'zh'], zh7: ['castle', 'zh'],
ec1: ['trade', 'ec'], ec2: ['barn', 'ec'], ec3: ['gold-mine', 'ec'], ec4: ['coins-pile', 'ec'], ec5: ['coins', 'ec'],
df1: ['wooden-fence', 'df'], df2: ['watchtower', 'df'], df3: ['stone-wall', 'df'], df4: ['guarded-tower', 'df'],
sp1: ['spyglass', 'sp'], sp2: ['tattered-banner', 'sp'], sp3: ['saint-basil-cathedral', 'sp'], sp4: ['magic-gate', 'sp'],
t1: ['pitchfork', 'iron'], t2: ['spears', 'iron'], t3: ['archer', 'steel'], t4: ['sword-brandish', 'steel'], t5: ['cavalry', 'arcane'], t6: ['hooded-figure', 'arcane'], t7: ['imperial-crown', 'gilded'] };
var m = /^img\/(?:tract\/buildings\/([a-z0-9]+)|units\/tier([1-7]))\.png$/.exec(String(path));
var hit = m ? M[m[1] || ('t' + m[2])] : null;
if (hit) return '<span class="nd-medal tone-' + hit[1] + '" aria-hidden="true" style="--art:url(../img/gameicons/' + hit[0] + '.svg)"></span>';
return '<img src="' + path + '" alt="" loading="lazy" decoding="async" data-nd-fb="' + String(emoji).replace(/[&<>"']/g, function(c) { return '&#' + c.charCodeAt(0) + ';'; }) + '">';
}
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    document.addEventListener('error', function(e) { // error у <img> не всплывает — capture-фаза
        var t = e && e.target;
        if (!t || t.tagName !== 'IMG' || typeof t.getAttribute !== 'function') return;
        var fb = t.getAttribute('data-nd-fb');
        if (fb === null) return;
        try { t.replaceWith(document.createTextNode(fb)); } catch (err) {}
    }, true);
}
function catClass(bd) { // ФАЗА F: категорийная рамка тайла постройки
return 'cat-' + (bd.cat === 'house' ? 'zh' : bd.cat === 'econ' ? 'ec' : bd.cat === 'defense' ? 'df' : 'sp');
}
function builtTileHtml(id, bd, b, rb) { // rb = {idx, cost} для worn/ruin (P7: кнопка восстановления, −25%)
return '<div class="sh-tile built ' + catClass(bd) + '"><div class="sh-tile-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-tile-name">' + bd.name + '</div>' +
'<div class="sh-tile-meta">' + buildingEffectText(bd) + ' · содержание ' + bd.upkeep + ' 💰/день</div>' +
stageBadgeHtml(b.corruptionStage) +
((b.corruptionStage === 'worn' || b.corruptionStage === 'ruin') && rb && typeof rb.cost === 'number' && rb.cost > 0
? '<button class="sh-buy sh-rebuild" data-action="sh-rebuild" data-idx="' + rb.idx + '" data-bid="' + id + '">🔨 Восстановить ' + rb.cost + ' 💰 (−25%)</button>'
: '') + '</div>';
}
function buyTileHtml(idx, id, bd, reqOk, can, reason) {
return '<div class="sh-tile buy ' + catClass(bd) + (reqOk ? '' : ' locked') + '"><div class="sh-tile-icon">' + shSpriteImg('img/tract/buildings/' + id + '.png', bd.icon) + '</div>' +
'<div class="sh-tile-name">' + bd.name + (reqOk ? '' : ' <span class="sh-req">нужна: ' + BUILDINGS[bd.req].name + '</span>') + '</div>' +
'<div class="sh-tile-meta">' + buildingEffectText(bd) + '</div>' +
buildingBreakdownHtml(idx, id) + // P6: контрфакт-брейкдаун «до → после» через превью казны
'<div class="sh-tile-badges"><span class="sh-tile-cost">🏗 ' + buildCostOf(id) + ' 💰</span><span class="sh-tile-upkeep">−' + bd.upkeep + '/день</span></div>' +
(can ? '<button class="sh-buy" data-action="sh-buy" data-idx="' + idx + '" data-bid="' + id + '">Купить</button>' : '<span class="sh-stage lock">🔒 ' + reason + '</span>') +
'</div>';
}
function renderStrongholdPanel(idx) {
ensureStrongholdState();
if (!SM) return;
var root = document.getElementById('strongholdsRoot');
if (!root) { currentShIdx = null; return; }
var d = STRONGHOLDS[idx], s = strongholds[idx];
if (!s || (!s.captured && idx !== 0)) { currentShIdx = null; renderStrongholds(); return; } // Сендер-Хутор — стартовый лагерь и без захвата (SPEC §9)
var html = '<button class="sh-back" data-action="sh-back">← Все твердыни</button>';
html += bossCardHtml(idx); // Г2-1: карточка босса провинции сверху панели
html += '<div class="sh-panel-head"><div class="sh-panel-title">' + d.icon + ' ' + d.name + '</div>' +
'<div class="sh-panel-sub">Налог +' + d.tax + ' 💰/день · слоты ' + builtList(idx).length + '/' + d.slots + ' · ' + PROVINCES[d.prov] + '</div></div>' +
provinceRuleLineHtml(d.prov); // C3: региональное правило провинции (каталог PROVINCES; модификаторы — в stronghold-model)
html += edictBlockHtml(idx); // Г4: эдикты провинции + порядок + ресурс
if (idx === 19 && typeof throne !== 'undefined') {
html += '<div class="sh-sec-title">👑 Вечный трон — ' + throne + '/5 · налоги +' + throne + '%</div>';
if (throne >= 5) html += '<div class="empty-state">Трон возведён полностью: +5% налогов навсегда.</div>' + (HERO.ascension ? '<div class="empty-state">✨ Круг Вознесения ' + HERO.ascension + ': враги +25%, артефакты ×0.5.</div>' : '') + '<button class="sh-buy ascend-btn" data-action="ascend">✨ Вознестись</button>';
else { var tc = throneCost(); html += '<div class="sh-build-row buy"><div class="sh-build-body"><div class="sh-build-name">Возвести ярус трона</div><div class="sh-build-meta">+' + (throne + 1) + '% налогов навсегда · цена ' + tc.toLocaleString('ru-RU') + ' 💰</div></div>' + ((HERO.gold || 0) >= tc ? '<button class="sh-buy" data-action="throne-invest">👑 ' + tc.toLocaleString('ru-RU') + '</button>' : '<span class="sh-stage lock">🔒 ' + tc.toLocaleString('ru-RU') + '</span>') + '</div>'; }
}
if (HERO.storm && HERO.storm.paid === false && HERO.storm.num === ensureSeason().num && HERO.storm.regionIdx === idx) { // Г1-5: баннер бури в панели региона
var _sd = Math.max(0, daysBetween(getMSKDayKey(), HERO.storm.dueDayKey));
var _sc = 50 * capturedCount();
html += '<div class="sh-sec-title">🌩 Буря над регионом</div><div class="sh-build-row buy"><div class="sh-build-body"><div class="sh-build-name">🌩 Буря над ' + STRONGHOLDS[idx].name + '</div><div class="sh-build-meta">Дань до дедлайна: ' + _sd + ' ' + (_sd === 1 ? 'день' : 'дн.') + ' · иначе постройки ветшают</div></div>' + ((HERO.gold || 0) >= _sc ? '<button class="sh-buy" data-action="storm-pay">🌧 ' + _sc.toLocaleString('ru-RU') + ' 💰</button>' : '<span class="sh-stage lock">🌧 ' + _sc.toLocaleString('ru-RU') + ' 💰</span>') + '</div>';
}
html += '<div class="sh-sec-title">🏗 Постройки</div>';
if (emergencyMaintNeeded(idx) && SM && typeof SM.emergencyMaintenanceCost === 'function') { // P7: аварийный ремонт — лечит на ступень за 2× содержания
var _emCost = SM.emergencyMaintenanceCost(s.buildings, corruptionTickOpts(idx));
html += '<div class="sh-emergency"><div class="sh-emergency-body"><b>🔧 Аварийный ремонт</b> — все постройки +1 ступень, долг содержания обнулится. Цена 2× дневного содержания: <b>' + _emCost + ' 💰</b></div>' +
((HERO.gold || 0) >= _emCost
? '<button class="sh-buy" data-action="sh-emergency-maint" data-idx="' + idx + '">🔧 Оплатить ' + _emCost + ' 💰</button>'
: '<span class="sh-stage lock">🔒 ' + _emCost + ' 💰</span>') + '</div>';
}
var built = builtList(idx);
if (built.length === 0) html += '<div class="empty-state">Пока ничего не построено.</div>';
if (built.length > 0) { // ФАЗА F: построенное — тайлы-сетка
html += '<div class="sh-build-grid">';
built.forEach(function(id) {
var bd = BUILDINGS[id], b = s.buildings[id];
var _rb = ((b.corruptionStage === 'worn' || b.corruptionStage === 'ruin') && SM && typeof SM.rebuildCost === 'function') ? { idx: idx, cost: SM.rebuildCost(buildCostOf(id)) } : null; // P7
html += builtTileHtml(id, bd, b, _rb);
});
html += '</div>';
}
var slotLeft = d.slots - built.length;
var avail = [];
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (bd.min > idx + 1) return;
if (s.buildings[id] && s.buildings[id].built) return;
avail.push(id);
});
avail.sort(function(a, b) { return BUILDINGS[a].cost - BUILDINGS[b].cost; });
var rec = avail.filter(function(id) { var bd = BUILDINGS[id]; return !bd.req || (s.buildings[bd.req] && s.buildings[bd.req].built); }).slice(0, 3);
var shown = shCatalogOpen ? avail : rec;
html += '<div class="sh-sec-title">📓 ' + (shCatalogOpen ? 'Каталог' : 'Что построить сейчас') + ' (свободно\u00A0слотов:\u00A0' + slotLeft + ')</div>';
var anyShown = false;
 shown.forEach(function(id) {
  var bd = BUILDINGS[id];
  anyShown = true;
  var reqOk = !bd.req || (s.buildings[bd.req] && s.buildings[bd.req].built);
  var can = reqOk && slotLeft > 0 && (HERO.gold || 0) >= buildCostOf(id);
  var reason = !reqOk ? 'нужна: ' + BUILDINGS[bd.req].name : (slotLeft <= 0 ? 'нет слотов' : 'мало золота');
  html += buyTileHtml(idx, id, bd, reqOk, can, reason);
 });
if (!anyShown) html += '<div class="empty-state">Каталог пуст — захватывай новые земли.</div>';
if (avail.length > 3) html += '<button class="sh-back" data-action="sh-catalog-toggle">' + (shCatalogOpen ? '∧ Свернуть каталог' : '📓 Открыть весь каталог (ещё ' + (avail.length - rec.length) + ')') + '</button>';
html += '<div class="sh-sec-title">⚔ Найм (пул недели · скидка 🎭 ' + Math.round(Math.min(0.30, 0.005 * STATS.cha.value) * 100) + '%)</div>';
var hireRows = '';
Object.keys(BUILDINGS).forEach(function(id) {
var bd = BUILDINGS[id];
if (!bd.grow) return;
var b = s.buildings[id];
if (!b || !b.built) return;
var tier = bd.tier, u = UNIT_TIERS[tier];
hireRows += '<div class="sh-hire-row"><div class="sh-build-icon">' + shSpriteImg('img/units/tier' + tier.slice(1) + '.png', u.icon) + '</div>' +
'<div class="sh-build-body"><div class="sh-build-name">' + u.name + ' (Т' + tier.slice(1) + ') · сила ' + u.power + '</div>' +
'<div class="sh-build-meta">Пул недели: <b>' + (hirePool[tier] || 0) + '</b> · цена ' + hireCostOf(tier) + ' 💰</div></div>' +
'<div class="sh-hire-actions">' +
'<button class="sh-mini" data-action="sh-hire-army" data-idx="' + idx + '" data-tier="' + tier + '">В армию</button>' +
'<button class="sh-mini" data-action="sh-hire-garrison" data-idx="' + idx + '" data-tier="' + tier + '">В гарнизон</button>' +
'</div></div>';
});
html += hireRows || '<div class="empty-state">Построй жилище, чтобы нанимать существ.</div>';
var garDef = SM.defensePower(d, s.garrison, STATS.end.value, defBonusOf(idx));
html += synergyRows(idx).map(function(r) { return '<div class="sh-sec-title" style="color:var(--violet,#c4b5fd)">' + r + '</div>'; }).join(''); // Г1-3: ✦ Синергия
html += '<div class="sh-sec-title">🛡 Гарнизон — сила ' + SM.stackPower(s.garrison) + ' · оборона ' + garDef + ' (база ' + d.total + ' + постройки +' + defBonusOf(idx) + ')</div>';
html += garrisonRows(s.garrison, idx, 'sh-to-army', '→ Армия');
html += '<div class="sh-sec-title">⚔ Полевая армия — сила ' + SM.armyPower(army.units) + '</div>';
html += garrisonRows(SM.TIER_KEYS.map(function(t) { return { tier: t, count: army.units[t] || 0 }; }).filter(function(x) { return x.count > 0; }), idx, 'sh-to-garrison', '→ Гарнизон');
root.innerHTML = html;
}

// ===================== ДОМЕННЫЕ ПОДПИСКИ (NDDBus, P20) =====================
// Стор изменился → экран «Твердыни» актуален без явного рендера вызывающего.
// Вызовы между слоями — через typeof-гварды: extract-харнессы тянут функции поодиночке.
function ndShUiActive() { // вкладка Твердынь видима? (DOM — единственный источник правды о view)
    try {
        var el = document.getElementById('view-strongholds');
        return !!(el && el.classList && el.classList.contains('active'));
    } catch (e) { return false; }
}
function ndShUiRerender() { // идемпотентный рефреш: currentShIdx !== null → панель, иначе обзор
    if (!ndShUiActive()) return false;
    try { renderStrongholds(); return true; } catch (e) { return false; }
}
var ND_SH_UI_EVENTS = ['nd:store:stronghold', 'nd:store:economy', 'nd:store:siege'];
function ndShUiBind(bus) { // отдельная функция — тестируемость (fake-bus в юнит-тестах); без шины — 0
    if (!bus || typeof bus.on !== 'function') return 0;
    var n = 0;
    ND_SH_UI_EVENTS.forEach(function(evt) { bus.on(evt, ndShUiRerender); n++; });
    return n;
}
ndShUiBind((typeof NDDBus !== 'undefined') ? NDDBus : null);
