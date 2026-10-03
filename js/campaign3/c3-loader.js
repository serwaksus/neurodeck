// Кампания 3.0 грузится ЛЕНИВО — только при включённой бете (nd_c3=1 или ?c3=1/0). Для остальных игроков это единственный
// лишний файл (≈1 КБ), модули ≈ 75 КБ не качаются и не лежат в прекэше. Порядок: данные → модель → рантайм → UI (по очереди, не async).
(function() {
    'use strict';
    var cur = document.currentScript, ver = '';
    try { ver = (cur && cur.src.split('?')[1]) || ''; } catch (e) {}
    var on = false;
    try {
        var m = /[?&]c3=([01])\b/.exec(location.search || '');
        if (m) { if (m[1] === '1') localStorage.setItem('nd_c3', '1'); else localStorage.removeItem('nd_c3'); }
        on = localStorage.getItem('nd_c3') === '1';
    } catch (e) {}
    if (!on) return;
    var q = ver ? '?' + ver : '';
    var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/campaign3.css' + q; document.head.appendChild(link);
    var files = ['c3-data.js', 'c3-model.js', 'c3-runtime.js', '../ui/campaign3.js'], i = 0;
    function next() {
        if (i >= files.length) { try { if (window.NDC3 && NDC3.boot) NDC3.boot(); } catch (e) {} return; }
        var s = document.createElement('script'); s.src = 'js/campaign3/' + files[i++] + q;
        s.onload = next; s.onerror = function() { console.warn('[c3] не загрузился ' + s.src); };
        document.head.appendChild(s);
    }
    next();
})();
