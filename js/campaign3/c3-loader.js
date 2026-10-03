// Кампания 3.0 грузится ЛЕНИВО и включена по умолчанию (выключить: nd_c3=0 или ?c3=0). Для выключивших это единственный
// лишний файл (≈1 КБ), модули ≈ 75 КБ не качаются и не лежат в прекэше. Порядок: данные → модель → рантайм → UI (по очереди, не async).
(function() {
    'use strict';
    var cur = document.currentScript, ver = '';
    try { ver = (cur && cur.src.split('?')[1]) || ''; } catch (e) {}
    var on = false;
    try {
        var m = /[?&]c3=([01])\b/.exec(location.search || '');
        if (m) localStorage.setItem('nd_c3', m[1]);
        on = localStorage.getItem('nd_c3') !== '0'; // по умолчанию включена; явное выключение — nd_c3=0
    } catch (e) { on = true; }
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
