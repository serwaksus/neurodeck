// Кампания 3.0, Ф2 — панель карты в «Твердынях»: 4 героя-сферы, ресурсы, карта из 33 узлов, города, бои, журнал.
// Рисует только когда включён флаг nd_c3 (иначе панель пуста и скрыта). Логика — js/campaign3/*, здесь только вид и клики.
(function() {
    'use strict';
    var D = window.NeuroDeckC3Data, M = window.NeuroDeckC3Model;
    if (!D || !M) return;
    var selH = 0, selN = null;
    var SPH = D.SPHERES;
    var TONE = { body: 'steel', mind: 'arcane', spirit: 'gilded', ties: 'ec' };
    var HERO_ART = { body: 'broadsword', mind: 'book-pile', spirit: 'lotus', ties: 'trade' };
    var TOWN_ART = { body: 'anvil', mind: 'bookshelf', spirit: 'church', ties: 'coins-pile' };
    var TYPE_ART = { mine: 'gold-mine', camp: 'watchtower', fort: 'guarded-tower', cache: 'cut-diamond', swamp: 'swamp', lair: 'crowned-skull' };
    var TYPE_NAME = { town: 'Город', mine: 'Шахта', camp: 'Застава нейтралов', fort: 'Форт нейтралов', cache: 'Тайник', swamp: 'Топь', lair: 'Логово порока', path: 'Дорога' };
    var REASON = { away: 'Герой не в городе', pool: 'Пул недели исчерпан', gold: 'Не хватает золота', res: 'Не хватает ресурса', nodwelling: 'Нужно жилище', built: 'Уже построено', prereq: 'Сначала жилище Лучников', max: 'Максимальный уровень' };

    function e(t) { return (typeof esc === 'function') ? esc(String(t)) : String(t).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function adjSeen(s, i) { return s.heroes.some(function(h) { return h.node === i || M.ADJ[h.node].indexOf(i) >= 0; }); }
    function visible(s, i) { return s.seen.charAt(i) === '1' || adjSeen(s, i); }
    function medal(art, tone, cls) { return '<span class="nd-medal tone-' + tone + (cls ? ' ' + cls : '') + '" aria-hidden="true" style="--art:url(../img/gameicons/' + art + '.svg)"></span>'; }
    function armyLine(a) { return D.UNIT_KEYS.map(function(k) { return D.UNITS[k].icon + ' ' + (a[k] || 0); }).join(' · '); }
    function resChips(s) {
        return '<span class="c3-chip" title="Золото">💰 <b>' + s.res.g + '</b></span>' + SPH.map(function(sp) {
            var k = D.RES_KEY[sp]; return '<span class="c3-chip" title="' + e(D.RES_NAME[k]) + '">' + D.RES_ICON[k] + ' <b>' + s.res[k] + '</b></span>';
        }).join('');
    }
    function check(s, fn) { var c = JSON.parse(JSON.stringify(s)); return fn(c); } // «сухая» проверка действия на копии состояния

    function nodeHtml(s, n) {
        var vis = visible(s, n.id), owner = s.own.charAt(n.id), hostile = vis && M.isHostile(s, n.id);
        var here = []; s.heroes.forEach(function(h, i) { if (h.node === n.id) here.push(i); });
        var cls = 'c3-node' + (owner === '1' ? ' is-own' : '') + (hostile ? ' is-hostile' : '') + (!vis ? ' is-fog' : '') + (selN === n.id ? ' is-sel' : '') + (here.indexOf(selH) >= 0 ? ' is-active' : '');
        var inner, label = vis ? n.name : 'Неизвестно';
        if (here.length) {
            var top = here.indexOf(selH) >= 0 ? selH : here[0];
            inner = medal(HERO_ART[SPH[top]], TONE[SPH[top]], 'c3-hero') + (here.length > 1 ? '<span class="c3-count">' + here.length + '</span>' : '');
            label += ' — ' + here.map(function(i) { return D.HERO_NAME[SPH[i]]; }).join(', ');
        } else if (vis && n.type === 'town') inner = medal(TOWN_ART[n.sphere], TONE[n.sphere]);
        else if (vis && n.type === 'mine') inner = medal(TYPE_ART.mine, TONE[n.sphere]);
        else if (vis && TYPE_ART[n.type]) inner = medal(TYPE_ART[n.type], hostile ? 'iron' : 'iron');
        else inner = '<span class="c3-dot" aria-hidden="true"></span>';
        return '<button type="button" class="' + cls + '" data-c3="select" data-n="' + n.id + '" style="left:' + n.x + '%;top:' + n.y + '%" aria-label="' + e(label) + '"' + (!vis ? ' aria-disabled="true"' : '') + '>' + inner + '</button>';
    }
    function edgesHtml(s) {
        var out = '';
        D.EDGES.forEach(function(ed) {
            if (!visible(s, ed[0]) && !visible(s, ed[1])) return;
            var a = D.NODES[ed[0]], b = D.NODES[ed[1]];
            out += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" vector-effect="non-scaling-stroke"/>';
        });
        return '<svg class="c3-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>';
    }

    function btn(label, attrs, ok, why) {
        return '<button type="button" class="demo-btn' + (attrs.primary ? ' primary' : '') + '" ' + attrs.data + (ok ? '' : ' disabled') + (!ok && why ? ' title="' + e(why) + '"' : '') + '>' + label + '</button>';
    }
    function townHtml(s, h, t) {
        var town = s.towns[t], sp = SPH[t], key = D.RES_KEY[sp], hallInfo = D.HALL[sp], html = '', acts = '';
        html += '<div class="c3-dline">Пул недели: ' + D.UNIT_KEYS.map(function(k) { return D.UNITS[k].icon + ' ' + town.pool[k] + (k !== 't1' && !town.dw[k] ? ' (нет жилища)' : ''); }).join(' · ') + '</div>';
        html += '<div class="c3-dline">' + e(hallInfo.name) + ' ' + town.hall + '/' + D.C.HALL_MAX + ': ' + e(hallInfo.desc) + '</div>';
        D.UNIT_KEYS.forEach(function(k) {
            var u = D.UNITS[k], n = k === 't1' ? Math.max(1, Math.min(5, town.pool.t1)) : 1;
            var r = check(s, function(c) { return M.hire(c, h, k, n); });
            var cost = M.hireGold(s, k, n), need = M.resNeed(u, n, t), extra = Object.keys(need).filter(function(x) { return need[x] > 0; }).map(function(x) { return need[x] + D.RES_ICON[x]; }).join(' ');
            acts += btn(u.icon + ' +' + n + ' (' + cost + '💰' + (extra ? ' ' + extra : '') + ')', { data: 'data-c3="hire" data-t="' + k + '" data-k="' + n + '"' }, r.ok, REASON[r.reason] || '');
        });
        ['t3', 't5'].forEach(function(k) {
            if (town.dw[k]) return;
            var r = check(s, function(c) { return M.buildDwelling(c, h, k); }), c = M.dwellingCost(s, t, k);
            var extra = Object.keys(c.need).filter(function(x) { return c.need[x] > 0; }).map(function(x) { return c.need[x] + D.RES_ICON[x]; }).join(' ');
            acts += btn('🏗 ' + D.UNITS[k].icon + ' (' + c.g + '💰 ' + extra + ')', { data: 'data-c3="dw" data-t="' + k + '"' }, r.ok, REASON[r.reason] || '');
        });
        var hr = check(s, function(c) { return M.buyHall(c, h); });
        acts += btn('🔨 ' + e(hallInfo.name) + (town.hall >= D.C.HALL_MAX ? '' : ' (' + M.hallCost(s, t) + D.RES_ICON[key] + ')'), { data: 'data-c3="hall"' }, hr.ok, REASON[hr.reason] || '');
        return html + '<div class="c3-acts">' + acts + '</div>';
    }
    function detailHtml(s) {
        var h = selH, hero = s.heroes[h];
        if (selN === null || !visible(s, selN)) return '<div class="c3-detail c3-hint">Выбери узел на карте: путь, бой, найм в городе. Каждый герой ходит на свои очки движения.</div>';
        var n = D.NODES[selN], html = '<div class="c3-detail"><div class="c3-dname">' + e(n.name) + ' <span class="c3-dtype">' + e(TYPE_NAME[n.type] || '') + (n.sphere ? ' · ' + e(D.SPHERE_NAME[n.sphere]) : '') + '</span></div>', acts = '';
        var hereOthers = []; s.heroes.forEach(function(o, i) { if (i !== h && o.node === selN) hereOthers.push(i); });
        if (hero.node === selN) {
            html += '<div class="c3-dline">' + e(D.HERO_NAME[SPH[h]]) + ' здесь.</div>';
            var t = M.townAt(s, h);
            if (t >= 0) html += townHtml(s, h, t);
        } else if (M.isHostile(s, selN)) {
            var f = M.forecast(s, h, selN);
            html += '<div class="c3-dline">Оборона <b>' + f.def + '</b> · сила ' + e(D.HERO_NAME[SPH[h]]) + ' <b>' + f.atk + '</b> · ' + (f.win ? '<span class="c3-ok">перевес ×' + f.ratio.toFixed(2) + '</span>' : '<span class="c3-bad">слабее (×' + f.ratio.toFixed(2) + ')</span>') + '</div>';
            if (selN === D.LAIR) html += '<div class="c3-dline">Сила логова растёт от срывов: ×' + M.shadowMult(s).toFixed(2) + '. Соберите армии героев в одном узле — штурм ведёт один герой.</div>';
            if (f.adjacent) acts += btn('⚔ Штурм (' + f.ap + ' ОД)', { primary: true, data: 'data-c3="atk" data-n="' + selN + '"' }, s.ap[h] >= f.ap, 'Не хватает очков движения');
            else { var rt = M.route(s, h, selN); html += '<div class="c3-dline">Подойди ближе' + (rt ? ' — путь ' + rt.cost + ' ОД' : '') + '.</div>'; if (rt && rt.steps.length) acts += btn('➜ Идти (' + rt.cost + ' ОД)', { data: 'data-c3="go" data-n="' + selN + '"' }, s.ap[h] >= 1, 'Нет очков движения'); }
        } else {
            var r2 = M.route(s, h, selN);
            html += '<div class="c3-dline">' + (s.own.charAt(selN) === '1' ? 'Твой узел. Оборона ' + M.nodeDefense(s, selN) + '.' : 'Свободная земля.') + '</div>';
            if (r2 && r2.steps.length) acts += btn('➜ Идти (' + r2.cost + ' ОД)', { primary: true, data: 'data-c3="go" data-n="' + selN + '"' }, s.ap[h] >= 1, 'Нет очков движения');
            var tt = D.TOWNS.indexOf(selN);
            if (tt >= 0 && tt !== h) html += '<div class="c3-dline">' + e(D.HERO_NAME[SPH[tt]]) + ' живёт здесь; найм и постройки доступны любому герою в городе.</div>';
        }
        if (hero.node === selN && hereOthers.length) hereOthers.forEach(function(o) { acts += btn('🤝 Принять армию: ' + e(D.HERO_NAME[SPH[o]]) + ' (' + armyLine(s.heroes[o].army) + ')', { data: 'data-c3="gather" data-from="' + o + '"' }, true, ''); });
        return html + (acts ? '<div class="c3-acts">' + acts + '</div>' : '') + '</div>';
    }

    window.renderCampaign3 = function() {
        var root = document.getElementById('c3Root');
        if (!root) return;
        if (!window.NDC3 || !NDC3.enabled()) { root.innerHTML = ''; root.hidden = true; return; }
        var s = NDC3.ensure(); if (!s) return;
        root.hidden = false;
        var wrapOld = root.querySelector('.c3-mapwrap'), sl = wrapOld ? wrapOld.scrollLeft : null, st = wrapOld ? wrapOld.scrollTop : null;
        var hero = s.heroes[selH], sum = M.shadowSum(s);
        var tabs = SPH.map(function(sp, i) {
            return '<button type="button" class="c3-tab' + (i === selH ? ' is-active' : '') + '" data-c3="hero" data-h="' + i + '" aria-pressed="' + (i === selH) + '">' + medal(HERO_ART[sp], TONE[sp], 'c3-tabicon') + '<span class="c3-tabname">' + e(D.SPHERE_NAME[sp]) + '</span><span class="c3-tabap" title="Очки движения">' + s.ap[i] + ' ОД</span></button>';
        }).join('');
        var html = '<section class="c3" aria-label="Кампания 3.0 (бета)">' +
            '<div class="c3-head"><span class="c3-title">🗺 Кампания 3.0 <span class="c3-beta">бета</span></span><span class="c3-week">нед. ' + (s.wk + 1) + '</span></div>' +
            '<div class="c3-tabs" role="group" aria-label="Герои">' + tabs + '</div>' +
            '<div class="c3-stats">' + resChips(s) + '</div>' +
            '<div class="c3-hline"><b>' + e(D.HERO_NAME[SPH[selH]]) + '</b> ур. ' + hero.lvl + ' · сила <b>' + M.armyPower(s, selH) + '</b> · ' + armyLine(hero.army) + ' · ОД сегодня +' + s.apDay[selH] + '/' + D.C.AP_CAP_DAY + '</div>' +
            (s.done ? '<div class="c3-done">🏆 Логово Лени пало — карта пройдена! Дела всех четырёх сфер двигали армии.</div>' : '') +
            '<div class="c3-mapwrap"><div class="c3-map">' + edgesHtml(s) + D.NODES.map(function(n) { return nodeHtml(s, n); }).join('') + '</div></div>' +
            detailHtml(s) +
            '<div class="c3-shadow">🌑 Тени Лени за 7 дней: <b>' + (Math.round(sum * 10) / 10) + '</b> → сила логова ×' + M.shadowMult(s).toFixed(2) + '</div>' +
            (s.log.length ? '<ul class="c3-log">' + s.log.slice().reverse().map(function(l) { return '<li><i>' + e(l.d.slice(5)) + '</i> ' + e(l.t) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="c3-note">Очки движения героя дают только дела его сферы (Тело: Сила/Стойкость/Ловкость · Разум: Интеллект · Дух: Воля · Связи: Харизма); задача идёт сфере, выбранной при создании. Срывы любых дел усиливают Лень.</div>' +
            '</section>';
        root.innerHTML = html;
        var wrap = root.querySelector('.c3-mapwrap');
        if (wrap) {
            if (sl !== null) { wrap.scrollLeft = sl; wrap.scrollTop = st; }
            else { var m = wrap.firstElementChild, hn = D.NODES[hero.node]; wrap.scrollLeft = Math.max(0, m.offsetWidth * hn.x / 100 - wrap.clientWidth / 2); wrap.scrollTop = Math.max(0, m.offsetHeight * hn.y / 100 - wrap.clientHeight / 2); }
        }
        if (!root.dataset.bound) { root.dataset.bound = '1'; root.addEventListener('click', onClick); }
    };

    function onClick(ev) {
        var el = ev.target.closest('[data-c3]'); if (!el || el.disabled) return;
        var act = el.dataset.c3, n = parseInt(el.dataset.n, 10), s = NDC3.getState();
        if (act === 'hero') { selH = parseInt(el.dataset.h, 10) || 0; selN = null; renderCampaign3(); return; }
        if (act === 'select') { if (s && !visible(s, n)) return; selN = (selN === n) ? null : n; renderCampaign3(); return; }
        if (act === 'go') { NDC3.act.travel(selH, n); return; }
        if (act === 'hire') { NDC3.act.hire(selH, el.dataset.t, parseInt(el.dataset.k, 10) || 1); return; }
        if (act === 'dw') { NDC3.act.dwelling(selH, el.dataset.t); return; }
        if (act === 'hall') { NDC3.act.hall(selH); return; }
        if (act === 'gather') { NDC3.act.gather(parseInt(el.dataset.from, 10), selH); return; }
        if (act === 'atk') {
            var f = M.forecast(s, selH, n);
            var body = 'Оборона <b>' + f.def + '</b>, сила героя <b>' + f.atk + '</b> (×' + f.ratio.toFixed(2) + ').<br>' + (f.win ? 'Победа ожидаема, потери ≈ ' + Math.round(f.attritionPct * 100) + '%.' : 'Ты слабее — штурм, скорее всего, провалится.');
            var go = function() { NDC3.act.engage(selH, n); };
            if (typeof dungeonConfirm === 'function') dungeonConfirm('⚔ Штурм «' + D.NODES[n].name + '»?', body).then(function(ok) { if (ok) go(); }); else go();
        }
    }
})();
