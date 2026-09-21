'use strict';
// Верификатор UI-ассетов (дополнение к check:js): index.html + css/style.css.
// Использование: node tests/verify-ui-assets.cjs css/style.css index.html
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let ok = true;
for (const rel of process.argv.slice(2)) {
    const abs = path.join(root, rel);
    const src = fs.readFileSync(abs, 'utf8');
    let fileOk = true;
    const checks = [];
    if (rel.endsWith('.css')) {
        const open = (src.match(/{/g) || []).length;
        const close = (src.match(/}/g) || []).length;
        fileOk = fileOk && open === close;
        checks.push('braces ' + open + '/' + close);
        for (const cls of ['.siege-alarm', '.totem-row', '.totem-opt', '.tower-card']) {
            const has = src.includes(cls);
            fileOk = fileOk && has;
            checks.push(cls + (has ? ' ok' : ' MISSING'));
        }
    } else if (rel.endsWith('.html')) {
        const v68 = (src.match(/v=73/g) || []).length;
        fileOk = fileOk && v68 === 8 && !src.includes('?v=69');
        checks.push('v73 x' + v68 + '/8');
        const totem = src.includes('id="totemCard"');
        fileOk = fileOk && totem;
        checks.push('totemCard ' + (totem ? 'ok' : 'MISSING'));
        const cal = src.indexOf('streakCalendar');
        const tot = src.indexOf('totemCard');
        fileOk = fileOk && cal > -1 && tot > cal;
        checks.push('order streak<totem ' + (cal > -1 && tot > cal ? 'ok' : 'BAD'));
    }
    ok = ok && fileOk;
    console.log('VERIFY ' + rel + ' [' + abs + ']: ' + (fileOk ? 'PASS' : 'FAIL') + ' (' + checks.join(', ') + ')');
}
console.log('verified: css/style.css index.html -> ' + (ok ? 'PASS' : 'FAIL'));
process.exit(ok ? 0 : 1);
