#!/usr/bin/env node
'use strict';
// Бамп кэш-версии (?v=N в index.html, VERSION и прекэш в sw.js, пины в тестах) одной командой.
// Без аргумента — N+1 от текущего пина index.html; с аргументом — явный номер: node tools/bump-pin.cjs 110
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cur = Number((html.match(/\?v=(\d+)/) || [])[1]);
if (!cur) { console.error('пин ?v= не найден в index.html'); process.exit(1); }
const next = process.argv[2] ? Number(process.argv[2]) : cur + 1;
const files = ['index.html', 'sw.js', 'tests/state-store.test.js', 'tests/audio-mixer.test.js', 'tests/event-bus.test.js', 'tests/verify-ui-assets.cjs', 'tests/wave3.test.js'];
let changed = 0;
for (const f of files) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const out = src.replace(new RegExp('\\?v=' + cur + '\\b', 'g'), '?v=' + next).replace(new RegExp('nd-shell-v' + cur + '\\b', 'g'), 'nd-shell-v' + next);
  if (out !== src) { fs.writeFileSync(p, out); changed++; }
}
console.log('pin ' + cur + ' → ' + next + ' (' + changed + ' файлов)');
