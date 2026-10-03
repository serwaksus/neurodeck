// Кампания 3.0, Ф6 — панель карты в «Твердынях»: 4 героя-сферы, ресурсы, карта из 33 узлов, города, бои, фракции пороков, лазарет, журнал.
// Рисует только когда включён флаг nd_c3 (иначе панель пуста и скрыта). Логика — js/campaign3/*, здесь только вид и клики.
(function() {
    'use strict';
    var D = window.NeuroDeckC3Data, M = window.NeuroDeckC3Model;
    if (!D || !M) return;
    var selH = 0, selN = null, tacOpen = null, facOpen = null; // facOpen: null — по умолчанию (раскрыто, если есть тени), иначе выбор игрока
    var SPH = D.SPHERES;
    var TONE = { body: 'steel', mind: 'arcane', spirit: 'gilded', ties: 'ec' };
    var HERO_ART = { body: 'broadsword', mind: 'book-pile', spirit: 'lotus', ties: 'trade' };
    var TOWN_ART = { body: 'anvil', mind: 'bookshelf', spirit: 'church', ties: 'coins-pile' };
    var TYPE_ART = { obelisk: 'magic-gate', mine: 'gold-mine', camp: 'watchtower', bastion: 'guarded-tower', cache: 'cut-diamond', swamp: 'swamp', lair: 'crowned-skull' };
    var TYPE_NAME = { town: 'Город', mine: 'Шахта', camp: 'Застава нейтралов', bastion: 'Оплот порока', cache: 'Тайник', swamp: 'Топь', lair: 'Цитадель пороков', path: 'Дорога', obelisk: 'Обелиск' };
    var FAC_LETTER = ['Л', 'Р', 'У', 'О'];
    var REASON = { away: 'Герой не в своём городе', pool: 'Пул недели исчерпан', gold: 'Не хватает золота', res: 'Не хватает ресурса', nodwelling: 'Нужно жилище', built: 'Уже построено', prereq: 'Сначала жилище Лучников', max: 'Максимальный уровень' };

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
    function ratioTxt(r) { return isFinite(r) ? '×' + r.toFixed(2) : '∞ (без охраны)'; }
    function check(s, fn) { var c = JSON.parse(JSON.stringify(s)); return fn(c); } // «сухая» проверка действия на копии состояния

    function nodeHtml(s, n) {
        var vis = visible(s, n.id), owner = s.own.charAt(n.id), hostile = vis && M.isHostile(s, n.id);
        var here = []; s.heroes.forEach(function(h, i) { if (h.node === n.id) here.push(i); });
        var fo = M.facOf(owner), sieged = n.type === 'town' && s.sg[SPH.indexOf(n.sphere)] > 0;
        var cls = 'c3-node' + (fo >= 0 ? ' is-fac' : '') + (sieged ? ' is-siege' : '') + (owner === '1' ? ' is-own' : '') + (hostile ? ' is-hostile' : '') + (!vis ? ' is-fog' : '') + (selN === n.id ? ' is-sel' : '') + (here.indexOf(selH) >= 0 ? ' is-active' : '');
        var inner, label = vis ? n.name : 'Неизвестно';
        if (here.length) {
            var top = here.indexOf(selH) >= 0 ? selH : here[0];
            inner = medal(HERO_ART[SPH[top]], TONE[SPH[top]], 'c3-hero') + (here.length > 1 ? '<span class="c3-count">' + here.length + '</span>' : '');
            label += ' — ' + here.map(function(i) { return D.HERO_NAME[SPH[i]]; }).join(', ');
        } else if (vis && n.type === 'town') inner = medal(TOWN_ART[n.sphere], TONE[n.sphere]);
        else if (vis && n.type === 'mine') inner = medal(TYPE_ART.mine, TONE[n.sphere]);
        else if (vis && n.type === 'obelisk') inner = medal(TYPE_ART.obelisk, TONE[n.sphere], s.ob[SPH.indexOf(n.sphere)] === 2 ? 'c3-done-ob' : '');
        else if (vis && TYPE_ART[n.type]) inner = medal(TYPE_ART[n.type], hostile ? 'iron' : 'iron');
        else inner = '<span class="c3-dot" aria-hidden="true"></span>';
        if (vis && fo >= 0) { inner += '<span class="c3-fbadge" aria-hidden="true">' + FAC_LETTER[fo] + '</span>'; label += ' — под властью «' + D.FACTIONS[fo].name + '»'; }
        if (sieged) { inner += '<span class="c3-fbadge c3-sg" aria-hidden="true">' + s.sg[SPH.indexOf(n.sphere)] + '/' + D.C.SIEGE_WEEKS + '</span>'; label += ' — осада'; }
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
        if (s.sg[t] > 0) html += '<div class="c3-dline c3-bad">🏰 Под осадой: доход золота и прирост города −' + Math.round((1 - D.C.SIEGE_TOLL) * 100) + '%</div>';
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
    function obeliskHtml(s, h, k) {
        var sp = SPH[k], st = s.ob[k], left = M.obeliskLeft(s, k), need = D.OBELISK.NEED, html = '<div class="c3-dline">🗿 Обелиск «' + e(D.SPHERE_NAME[sp]) + '»: ';
        if (st === 2) return html + '<span class="c3-ok">ответил — награда получена</span></div>';
        if (st === 0) return html + 'принять испытание — сегодня сделай <b>' + need + '</b> дела сферы «' + e(D.SPHERE_NAME[sp]) + '». Награда: +' + D.OBELISK.RES + ' ' + D.RES_ICON[D.RES_KEY[sp]] + ' и открытая карта.</div><div class="c3-acts">' + btn('🗿 Принять испытание', { primary: true, data: 'data-c3="ob-on"' }, true, '') + '</div>';
        return html + (left > 0 ? 'осталось дел сферы сегодня: <b>' + left + '</b> (испытание сгорит в полночь)' : '<span class="c3-ok">условие выполнено</span>') + '</div><div class="c3-acts">' + btn('🗿 Забрать награду', { primary: true, data: 'data-c3="ob-claim"' }, left === 0, 'Сделай ещё дела сферы') + '</div>';
    }
    function tacticsHtml(s, h, id) {
        var offer = NDC3.act.offer(h), base = M.forecast(s, h, id), cards = offer.map(function(t, i) {
            var T = D.TACTICS[t.kind], f = M.forecast(s, h, id, t), eff = Math.round(t.p * 100);
            var what = t.kind === 'formation' ? 'потери ≈ ' + Math.round(f.attritionPct * 100) + '%' : (f.win ? '<span class="c3-ok">победа ' + ratioTxt(f.ratio) + '</span>' : '<span class="c3-bad">' + ratioTxt(f.ratio) + '</span>');
            return '<button type="button" class="c3-tac" data-c3="tac" data-n="' + id + '" data-i="' + i + '"><span class="c3-tacname">' + T.icon + ' ' + e(T.name) + ' +' + eff + '%</span><span class="c3-tacsrc">' + (t.rank ? 'карточка ранга ' + e(t.rank) : 'нет карточки') + '</span><span class="c3-tacfx">' + what + '</span></button>';
        }).join('');
        return '<div class="c3-tactics"><div class="c3-dline">Выбери тактику (сила — от рангов твоих карточек сферы): без неё ' + (base.win ? '<span class="c3-ok">' + ratioTxt(base.ratio) + '</span>' : '<span class="c3-bad">' + ratioTxt(base.ratio) + '</span>') + '</div><div class="c3-tacrow">' + cards + '<button type="button" class="c3-tac" data-c3="tac" data-n="' + id + '" data-i="none"><span class="c3-tacname">Без тактики</span><span class="c3-tacsrc">прямой штурм</span></button></div></div>';
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
            var ok = M.obeliskAt(s, h);
            if (ok >= 0) html += obeliskHtml(s, h, ok);
        } else if (M.isHostile(s, selN)) {
            var f = M.forecast(s, h, selN), fo2 = M.facOf(s.own.charAt(selN));
            if (fo2 >= 0) html += '<div class="c3-dline c3-bad">Под властью «' + e(D.FACTIONS[fo2].name) + '»' + (n.type === 'town' ? ' — освободи город: он снова растит армию' : (selN === D.FACTIONS[fo2].bastion ? ' — разгром оплота обезвредит фракцию' : '')) + '.</div>';
            html += '<div class="c3-dline">Оборона <b>' + f.def + '</b> · сила ' + e(D.HERO_NAME[SPH[h]]) + ' <b>' + f.atk + '</b> · ' + (f.win ? '<span class="c3-ok">перевес ' + ratioTxt(f.ratio) + '</span>' : '<span class="c3-bad">слабее (' + ratioTxt(f.ratio) + ')</span>') + '</div>';
            if (selN === D.LAIR) html += '<div class="c3-dline">Сила цитадели растёт от срывов всех сфер: ×' + M.lairMult(s).toFixed(2) + '. Соберите армии героев в одном узле — штурм ведёт один герой. Победа — когда падут все 5 логов: 4 оплота фракций и цитадель.</div>';
            if (f.adjacent) {
                acts += btn(tacOpen === selN ? '✕ Отмена' : '⚔ Штурм (' + f.ap + ' ОД)', { primary: tacOpen !== selN, data: 'data-c3="atk" data-n="' + selN + '"' }, s.ap[h] >= f.ap, 'Не хватает очков движения');
                if (tacOpen === selN) html += tacticsHtml(s, h, selN);
            }
            else { var rt = M.route(s, h, selN); html += '<div class="c3-dline">Подойди ближе' + (rt ? ' — путь ' + rt.cost + ' ОД' : '') + '.</div>'; if (rt && rt.steps.length) acts += btn('➜ Идти (' + rt.cost + ' ОД)', { data: 'data-c3="go" data-n="' + selN + '"' }, s.ap[h] >= 1, 'Нет очков движения'); }
        } else {
            var r2 = M.route(s, h, selN);
            var tt = D.TOWNS.indexOf(selN), fl = tt >= 0 ? M.freedLeft(s, tt) : 0;
            html += '<div class="c3-dline">' + (s.own.charAt(selN) === '1' ? 'Твой узел. Оборона ' + M.nodeDefense(s, selN) + (fl > 0 ? ' — ослаблена после освобождения (−30%, ещё ' + fl + ' дн.)' : '') + '.' : 'Свободная земля.') + '</div>';
            if (r2 && r2.steps.length) acts += btn('➜ Идти (' + r2.cost + ' ОД)', { primary: true, data: 'data-c3="go" data-n="' + selN + '"' }, s.ap[h] >= 1, 'Нет очков движения');
            if (tt >= 0 && tt !== h) html += '<div class="c3-dline">' + e(D.HERO_NAME[SPH[tt]]) + ' живёт здесь; найм и постройки доступны любому герою в городе.</div>';
        }
        if (hero.node === selN && hereOthers.length) hereOthers.forEach(function(o) { acts += btn('🤝 Принять армию: ' + e(D.HERO_NAME[SPH[o]]) + ' (' + armyLine(s.heroes[o].army) + ')', { data: 'data-c3="gather" data-from="' + o + '"' }, true, ''); });
        return html + (acts ? '<div class="c3-acts">' + acts + '</div>' : '') + '</div>';
    }

    function skillLine(s, h) {
        var sp = SPH[h], K = D.SKILL[sp], hero = s.heroes[h], need = D.C.SHRINE_STREAK;
        return '🎓 ' + e(K.name) + ' ' + hero.sk + '/' + D.C.SKILL_MAX + (K.kind ? ' (' + e(D.TACTICS[K.kind].name) + ' +' + Math.round(D.C.SKILL_STEP * 100 * hero.sk) + '%)' : ' (+' + Math.round(D.C.DIPLO_LOOT * 100 * hero.sk) + '% золота добычи)') + ' · серия дел сферы: <b>' + s.stk[h] + '</b>/' + need + (s.stk[h] >= need ? ' — святилище даст навык' : '');
    }
    function legacyPanel(s) {
        var lg = s.lg; if (!lg) return '';
        var halls = SPH.filter(function(sp, i) { return lg.hall[i]; }).map(function(sp) { return D.HALL[sp].name; });
        var sks = SPH.filter(function(sp, i) { return lg.sk[i]; }).map(function(sp) { return D.HERO_NAME[sp] + ': ' + D.SKILL[sp].name; });
        return '<details class="c3-facs c3-legacy"><summary>🏺 Наследие твердынь 2.0</summary><ul class="c3-flist">' +
            '<li class="c3-frow"><span class="c3-fname">Казна</span><span class="c3-fstat">+' + lg.g + ' 💰 к старту</span></li>' +
            '<li class="c3-frow"><span class="c3-fname">Залы</span><span class="c3-fstat">' + (halls.length ? e(halls.join(', ')) + ' (1 ур.)' : '—') + '</span></li>' +
            '<li class="c3-frow"><span class="c3-fname">Навыки</span><span class="c3-fstat">' + (sks.length ? e(sks.join(' · ')) : '—') + '</span></li>' +
            '<li class="c3-frow"><span class="c3-fname">Армия</span><span class="c3-fstat">+' + lg.a + ' 🗡 каждому герою</span></li>' +
            '<li class="c3-frow"><span class="c3-fname">Уровни героев</span><span class="c3-fstat">' + lg.l.join(' / ') + ' — от твоих характеристик</span></li></ul></details>';
    }
    function nextDayKey(day) { return new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); }
    function eotPanel(s) { // «Закончить ход» (план §1): явное завершение действий на сегодня; сутки закрывает dayEnd на смене дня, не раньше
        var ap = s.ap[0] + s.ap[1] + s.ap[2] + s.ap[3], ended = M.turnEnded(s);
        var b = ended
            ? '<button type="button" class="c3-mini" data-c3="eot" disabled title="Сутки закроются в полночь; оставшиеся ОД сгорают на смене суток">Ход завершён ✓</button>'
            : '<button type="button" class="c3-mini" data-c3="eot" title="Героям без ОД ждать нечего — подведи итог дня. Найм и стройка в городах ОД не тратят">⏭ Закончить ход</button>';
        return '<div class="c3-lz">⏭ Сегодня: ОД осталось <b>' + ap + '</b> (сгорят на смене суток) · дел ' + s.deedsToday + ' · ' + b + '</div>';
    }
    function restPanel(s) { // «объявленный отдых»: заранее обещанный день без теней (UI предлагает только завтра)
        var tm = nextDayKey(s.day), on = M.isRestDay(s, tm), left = M.restLeft(s, tm);
        var b = on
            ? '<button type="button" class="c3-mini" data-c3="rest-off" title="День снова обычный">✕ Отменить отдых на завтра</button>'
            : '<button type="button" class="c3-mini" data-c3="rest-on"' + (left > 0 ? '' : ' disabled title="Лимит недели: ' + D.C.REST_PER_WEEK + ' дня"') + '>🌙 Объявить отдых на завтра</button>';
        return '<div class="c3-lz">🌙 Отдых: объявлено: <b>' + (D.C.REST_PER_WEEK - left) + '</b> из ' + D.C.REST_PER_WEEK + ' на этой неделе · ' + b + '</div>';
    }
    function facPanel(s) {
        var anyTruce = s.fac.some(function(f) { return f.truce; });
        var rows = D.FACTIONS.map(function(F, f) {
            var fs = s.fac[f], nodes = 0, code = M.facCode(f), i;
            for (i = 0; i < s.own.length; i++) if (s.own.charAt(i) === code) nodes++;
            var sum = M.facSum(s, f), state = fs.dead ? '<span class="c3-ok">разбита</span>' : (sum === 0 ? '<span class="c3-ok">затихла</span>' : '<span class="c3-bad">сила ' + M.facPower(s, f) + '</span>');
            var can = !fs.dead && !s.lz.on && (!anyTruce || fs.truce);
            var tbtn = fs.dead ? '' : '<button type="button" class="c3-mini" data-c3="truce" data-f="' + f + '" data-on="' + (fs.truce ? 0 : 1) + '"' + (can ? '' : ' disabled') + ' title="Обет: неделя без срывов в сфере «' + e(D.SPHERE_NAME[F.sphere]) + '». Соблюдёшь — фракция отступит, нарушишь — ударит сильнее.">' + (fs.truce ? '🕊 Обет дан ✕' : '🕊 Перемирие') + '</button>';
            return '<li class="c3-frow' + (fs.dead ? ' is-dead' : '') + '"><span class="c3-fname">' + FAC_LETTER[f] + ' ' + e(F.name) + ' <i>' + e(D.SPHERE_NAME[F.sphere]) + '</i></span><span class="c3-fstat">' + state + ' · тени ' + (Math.round(sum * 10) / 10) + ' · узлов ' + nodes + '</span>' + tbtn + '</li>';
        }).join('');
        var lz = '<div class="c3-lz">🏥 Лазарет: ' + (s.lz.on ? '<b>идёт</b>, осталось ' + s.lz.left + ' дн.' : 'запас <b>' + s.lz.left + '</b> дн. за сезон') + ' <button type="button" class="c3-mini" data-c3="lazaret" data-on="' + (s.lz.on ? 0 : 1) + '"' + (!s.lz.on && s.lz.left <= 0 ? ' disabled' : '') + ' title="Болезнь или отпуск: тени не копятся, фракции не ходят">' + (s.lz.on ? 'Выйти' : 'Объявить') + '</button></div>';
        var open = facOpen !== null ? facOpen : s.fac.some(function(f, i) { return !f.dead && M.facSum(s, i) > 0; });
        return '<details class="c3-facs"' + (open ? ' open' : '') + '><summary>🌑 Фракции пороков</summary><ul class="c3-flist">' + rows + '</ul>' + lz + '</details>';
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
            '<div class="c3-head"><span class="c3-title">🗺 Кампания 3.0 <span class="c3-beta">бета</span></span><span class="c3-week">карта ' + s.mp + (s.cyc ? ' (+' + Math.round(D.C.CYC_K * 100 * s.cyc) + '%)' : '') + ' · логова ' + (5 - M.lairsLeft(s)) + '/5 · нед. ' + (s.wk + 1) + '/' + D.C.SEASON_WEEKS + '</span></div>' +
            '<div class="c3-tabs" role="group" aria-label="Герои">' + tabs + '</div>' +
            '<div class="c3-stats">' + resChips(s) + '</div>' +
            '<div class="c3-hline"><b>' + e(D.HERO_NAME[SPH[selH]]) + '</b> ур. ' + hero.lvl + ' · сила <b>' + M.armyPower(s, selH) + '</b> · ' + armyLine(hero.army) + ' · ОД сегодня +' + s.apDay[selH] + '/' + D.C.AP_CAP_DAY + '<br>' + skillLine(s, selH) + '</div>' +
            (s.done ? '<div class="c3-done">🏆 Все логова пали — карта пройдена! Дела всех четырёх сфер двигали армии.</div>' : '') +
            (M.seasonOver(s) ? '<div class="c3-done">' + (s.done ? 'Следующая карта сложнее на ' + Math.round(D.C.CYC_K * 100 * ((s.cyc || 0) + 1)) + '%, часть силы перенесётся.' : 'Сезон (' + D.C.SEASON_WEEKS + ' недель) закончился.') + ' <button type="button" class="c3-mini" data-c3="newmap">🗺 Новая карта</button></div>' : '') +
            '<div class="c3-mapwrap"><div class="c3-map">' + edgesHtml(s) + D.NODES.map(function(n) { return nodeHtml(s, n); }).join('') + '</div></div>' +
            detailHtml(s) +
            eotPanel(s) +
            restPanel(s) +
            facPanel(s) + legacyPanel(s) +
            '<div class="c3-shadow">🌑 Тени пороков за 7 дней: <b>' + (Math.round(sum * 10) / 10) + '</b> → сила цитадели ×' + M.lairMult(s).toFixed(2) + '</div>' +
            (s.log.length ? '<ul class="c3-log">' + s.log.slice().reverse().map(function(l) { return '<li><i>' + e(l.d.slice(5)) + '</i> ' + e(l.t) + '</li>'; }).join('') + '</ul>' : '') +
            '<div class="c3-note">Очки движения героя дают только дела его сферы (Тело: Сила/Стойкость/Ловкость · Разум: Интеллект · Дух: Воля · Связи: Харизма); задача идёт сфере, выбранной при создании. Срыв дела сферы усиливает ЕЁ фракцию порока: она ходит раз в неделю (понедельник) и берёт соседние узлы, а затем и города.</div>' +
            '</section>';
        root.innerHTML = html;
        var wrap = root.querySelector('.c3-mapwrap');
        if (wrap) {
            if (sl !== null) { wrap.scrollLeft = sl; wrap.scrollTop = st; }
            else { var m = wrap.firstElementChild, hn = D.NODES[hero.node]; wrap.scrollLeft = Math.max(0, m.offsetWidth * hn.x / 100 - wrap.clientWidth / 2); wrap.scrollTop = Math.max(0, m.offsetHeight * hn.y / 100 - wrap.clientHeight / 2); }
        }
        if (!root.dataset.bound) { root.dataset.bound = '1'; root.addEventListener('click', onClick); root.addEventListener('toggle', function(ev) { if (ev.target.classList && ev.target.classList.contains('c3-facs')) facOpen = ev.target.open; }, true); }
    };

    function onClick(ev) {
        var el = ev.target.closest('[data-c3]'); if (!el || el.disabled) return;
        var act = el.dataset.c3, n = parseInt(el.dataset.n, 10), s = NDC3.getState();
        if (act === 'hero') { selH = parseInt(el.dataset.h, 10) || 0; selN = null; tacOpen = null; renderCampaign3(); return; }
        if (act === 'select') { if (s && !visible(s, n)) return; selN = (selN === n) ? null : n; tacOpen = null; renderCampaign3(); return; }
        if (act === 'go') { NDC3.act.travel(selH, n); return; }
        if (act === 'hire') { NDC3.act.hire(selH, el.dataset.t, parseInt(el.dataset.k, 10) || 1); return; }
        if (act === 'dw') { NDC3.act.dwelling(selH, el.dataset.t); return; }
        if (act === 'hall') { NDC3.act.hall(selH); return; }
        if (act === 'truce') { NDC3.act.truce(parseInt(el.dataset.f, 10), el.dataset.on === '1'); return; }
        if (act === 'eot') { NDC3.act.endTurn(); return; }
        if (act === 'rest-on') { NDC3.act.declareRest(nextDayKey(s.day)); return; }
        if (act === 'rest-off') { NDC3.act.cancelRest(nextDayKey(s.day)); return; }
        if (act === 'lazaret') {
            var on = el.dataset.on === '1';
            if (!on || typeof dungeonConfirm !== 'function') { NDC3.act.lazaret(on); return; }
            dungeonConfirm('🏥 Объявить лазарет?', 'Тени не копятся, фракции пороков затаятся. Запас — ' + s.lz.left + ' дн. за сезон; дни тратятся, пока лазарет идёт. Только для болезни или отпуска.').then(function(ok) { if (ok) NDC3.act.lazaret(true); });
            return;
        }
        if (act === 'ob-on') { NDC3.act.obelisk(selH, false); return; }
        if (act === 'ob-claim') { NDC3.act.obelisk(selH, true); return; }
        if (act === 'newmap') {
            var go = function() { selN = null; tacOpen = null; NDC3.act.newMap(); };
            if (typeof dungeonConfirm === 'function') dungeonConfirm('🗺 Начать новую карту?', 'Текущая карта закончится. Перенесётся часть казны, залов, навыков и армии' + (s.done ? '; пороки станут сильнее' : '') + '. Карточки и ранги не меняются.').then(function(ok) { if (ok) go(); }); else go();
            return;
        }
        if (act === 'gather') { NDC3.act.gather(parseInt(el.dataset.from, 10), selH); return; }
        if (act === 'atk') { tacOpen = (tacOpen === n) ? null : n; renderCampaign3(); return; }
        if (act === 'tac') {
            var offer = NDC3.act.offer(selH), pick = el.dataset.i === 'none' ? null : offer[parseInt(el.dataset.i, 10)];
            tacOpen = null; NDC3.act.engage(selH, n, pick); return;
        }
    }
})();
