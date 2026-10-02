// Кампания 3.0, Ф1 — панель вертикального среза в «Твердынях»: ОД, ресурсы, карта 9 узлов, действия, журнал.
// Рисует только когда включён флаг nd_c3 (иначе панель пуста и скрыта). Логика — js/campaign3/*, здесь только вид и клики.
(function() {
    'use strict';
    var D = window.NeuroDeckC3Data, M = window.NeuroDeckC3Model;
    if (!D || !M) return;
    var sel = null;
    var ART = { town: 'anvil', mine: 'gold-mine', camp: 'watchtower', swamp: 'swamp', lair: 'crowned-skull' };
    var TYPE_NAME = { town: 'Город', mine: 'Шахта', camp: 'Застава нейтралов', swamp: 'Болото', lair: 'Логово порока', path: 'Дорога' };
    var REASON = { far: 'Герой не рядом с узлом', peace: 'Здесь нет врага', ap: 'Не хватает очков движения', done: 'Срез уже пройден' };

    function e(t) { return (typeof esc === 'function') ? esc(String(t)) : String(t).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function visible(s, i) { return s.seen.charAt(i) === '1' || M.ADJ[s.hero.node].indexOf(i) >= 0; }

    function nodeHtml(s, n) {
        var vis = visible(s, n.id), owner = s.own.charAt(n.id), hostile = vis && M.isHostile(s, n.id), isHero = s.hero.node === n.id;
        var cls = 'c3-node' + (isHero ? ' is-hero' : '') + (owner === '1' ? ' is-own' : '') + (hostile ? ' is-hostile' : '') + (!vis ? ' is-fog' : '') + (sel === n.id ? ' is-sel' : '');
        var art = vis ? (ART[n.type] || '') : '';
        var label = vis ? n.name : 'Неизвестно';
        var inner = isHero ? '<span class="nd-medal tone-gilded c3-hero" aria-hidden="true" style="--art:url(../img/gameicons/visored-helm.svg)"></span>'
            : (art ? '<span class="nd-medal c3-art" aria-hidden="true" style="--art:url(../img/gameicons/' + art + '.svg)"></span>' : '<span class="c3-dot" aria-hidden="true"></span>');
        return '<button type="button" class="' + cls + '" data-c3="select" data-n="' + n.id + '" style="left:' + n.x + '%;top:' + n.y + '%" aria-label="' + e(label + (isHero ? ' — здесь герой' : '')) + '"' + (!vis ? ' aria-disabled="true"' : '') + '>' + inner + '</button>';
    }

    function edgesHtml(s) {
        var out = '';
        D.EDGES.forEach(function(ed) {
            if (s.seen.charAt(ed[0]) !== '1' && s.seen.charAt(ed[1]) !== '1') return;
            var a = D.NODES[ed[0]], b = D.NODES[ed[1]];
            out += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" vector-effect="non-scaling-stroke"/>';
        });
        return '<svg class="c3-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>';
    }

    function detailHtml(s) {
        if (sel === null || !visible(s, sel)) return '<div class="c3-detail c3-hint">Выбери узел на карте: путь, бой или найм.</div>';
        var n = D.NODES[sel], owner = s.own.charAt(sel), html = '<div class="c3-detail"><div class="c3-dname">' + e(n.name) + ' <span class="c3-dtype">' + e(TYPE_NAME[n.type] || '') + '</span></div>';
        var acts = '';
        if (s.hero.node === sel) {
            html += '<div class="c3-dline">Герой здесь.</div>';
            if (sel === D.TOWN) {
                var pool = s.town.pool, t1 = Math.min(5, pool.t1, Math.floor(s.res.g / D.UNITS.t1.cost)), t3 = Math.min(1, pool.t3, Math.floor(s.res.g / D.UNITS.t3.cost));
                html += '<div class="c3-dline">Пул недели: ' + D.UNITS.t1.icon + ' ' + pool.t1 + ' · ' + D.UNITS.t3.icon + ' ' + pool.t3 + '</div>';
                acts += '<button type="button" class="demo-btn" data-c3="hire" data-t="t1" data-k="' + t1 + '"' + (t1 < 1 ? ' disabled' : '') + '>' + D.UNITS.t1.icon + ' +' + Math.max(1, t1) + ' (' + Math.max(1, t1) * D.UNITS.t1.cost + ' 💰)</button>';
                acts += '<button type="button" class="demo-btn" data-c3="hire" data-t="t3" data-k="' + t3 + '"' + (t3 < 1 ? ' disabled' : '') + '>' + D.UNITS.t3.icon + ' +1 (' + D.UNITS.t3.cost + ' 💰)</button>';
                var fc = M.forgeCost(s), maxed = s.town.forge >= D.C.FORGE_MAX;
                acts += '<button type="button" class="demo-btn" data-c3="forge"' + (maxed || s.res.s < fc ? ' disabled' : '') + '>🔨 Закалка ' + s.town.forge + '/' + D.C.FORGE_MAX + (maxed ? '' : ' (' + fc + ' стали)') + '</button>';
            }
        } else if (M.isHostile(s, sel)) {
            var f = M.forecast(s, sel);
            html += '<div class="c3-dline">Оборона <b>' + f.def + '</b> · твоя сила <b>' + f.atk + '</b> · ' + (f.win ? '<span class="c3-ok">перевес ×' + f.ratio.toFixed(2) + '</span>' : '<span class="c3-bad">слабее (×' + f.ratio.toFixed(2) + ')</span>') + '</div>';
            if (sel === D.LAIR) html += '<div class="c3-dline">Сила логова растёт от твоих срывов: ×' + M.shadowMult(s).toFixed(2) + '</div>';
            if (f.adjacent) acts += '<button type="button" class="demo-btn primary" data-c3="atk" data-n="' + sel + '"' + (s.ap < f.ap ? ' disabled' : '') + '>⚔ Штурм (' + f.ap + ' ОД)</button>';
            else { var rt = M.route(s, sel); html += '<div class="c3-dline">Подойди ближе' + (rt ? ' — путь ' + rt.cost + ' ОД' : '') + '.</div>'; if (rt && rt.steps.length) acts += '<button type="button" class="demo-btn" data-c3="go" data-n="' + sel + '">➜ Идти (' + rt.cost + ' ОД)</button>'; }
        } else {
            var r2 = M.route(s, sel);
            html += '<div class="c3-dline">' + (owner === '1' ? 'Твой узел. Оборона ' + M.nodeDefense(s, sel) + '.' : 'Свободная земля.') + '</div>';
            if (r2 && r2.steps.length) acts += '<button type="button" class="demo-btn primary" data-c3="go" data-n="' + sel + '"' + (s.ap < 1 ? ' disabled' : '') + '>➜ Идти (' + r2.cost + ' ОД)</button>';
        }
        return html + (acts ? '<div class="c3-acts">' + acts + '</div>' : '') + '</div>';
    }

    window.renderCampaign3 = function() {
        var root = document.getElementById('c3Root');
        if (!root) return;
        if (!window.NDC3 || !NDC3.enabled()) { root.innerHTML = ''; root.hidden = true; return; }
        var s = NDC3.ensure(); if (!s) return;
        root.hidden = false;
        var power = M.armyPower(s), sum = M.shadowSum(s);
        var html = '<section class="c3" aria-label="Кампания 3.0 (бета)">' +
            '<div class="c3-head"><span class="c3-title">🗺 Кампания 3.0 <span class="c3-beta">бета · срез</span></span><span class="c3-week">нед. ' + (s.wk + 1) + '</span></div>' +
            '<div class="c3-stats">' +
              '<span class="c3-chip" title="Очки движения: дают только дела сферы Тело и задачи"><b>' + s.ap + '</b> ОД <i>сегодня +' + s.apDay + '/' + D.C.AP_CAP_DAY + '</i></span>' +
              '<span class="c3-chip">💰 <b>' + s.res.g + '</b></span><span class="c3-chip">⚒ <b>' + s.res.s + '</b></span>' +
              '<span class="c3-chip">⚔ <b>' + power + '</b></span><span class="c3-chip">ур. <b>' + s.hero.lvl + '</b></span></div>' +
            (s.done ? '<div class="c3-done">🏆 Логово Лени пало — срез пройден! Ты доказал, что дела двигают армию.</div>' : '') +
            '<div class="c3-map">' + edgesHtml(s) + D.NODES.map(function(n) { return nodeHtml(s, n); }).join('') + '</div>' +
            detailHtml(s) +
            '<div class="c3-shadow">🌑 Тени Лени за 7 дней: <b>' + (Math.round(sum * 10) / 10) + '</b> → сила логова ×' + M.shadowMult(s).toFixed(2) + '</div>' +
            (s.log.length ? '<ul class="c3-log">' + s.log.slice().reverse().map(function(l) { return '<li><i>' + e(l.d.slice(5)) + '</i> ' + e(l.t) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="c3-note">Очки движения дают только дела сферы <b>Тело</b> (Сила/Стойкость/Ловкость) и задачи; остальные сферы получат героев в следующей фазе. Срывы любых дел усиливают Лень.</div>' +
            '</section>';
        root.innerHTML = html;
        if (!root.dataset.bound) { root.dataset.bound = '1'; root.addEventListener('click', onClick); }
    };

    function onClick(ev) {
        var el = ev.target.closest('[data-c3]'); if (!el || el.disabled) return;
        var act = el.dataset.c3, n = parseInt(el.dataset.n, 10);
        if (act === 'select') { var s0 = NDC3.getState(); if (s0 && !visible(s0, n)) return; sel = (sel === n) ? null : n; renderCampaign3(); return; }
        if (act === 'go') { NDC3.act.travel(n); return; }
        if (act === 'hire') { NDC3.act.hire(el.dataset.t, parseInt(el.dataset.k, 10) || 1); return; }
        if (act === 'forge') { NDC3.act.forge(); return; }
        if (act === 'atk') {
            var s = NDC3.getState(), f = M.forecast(s, n);
            var body = 'Оборона <b>' + f.def + '</b>, твоя сила <b>' + f.atk + '</b> (×' + f.ratio.toFixed(2) + ').<br>' + (f.win ? 'Победа ожидаема, потери ≈ ' + Math.round(f.attritionPct * 100) + '%.' : 'Ты слабее — штурм, скорее всего, провалится.');
            var go = function() { NDC3.act.engage(n); };
            if (typeof dungeonConfirm === 'function') dungeonConfirm('⚔ Штурм «' + D.NODES[n].name + '»?', body).then(function(ok) { if (ok) go(); }); else go();
        }
    }
})();
