const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Гейт легаси-строк: после пивота «Твердыни v2» в продукте не должно оставаться
// текстов/имён вырезанных систем (Тракт, Эстус, HP-эко, latin Sender, ...).
// storage.js исключён из estus/shards-правил: его MIGRATIONS-код
// удаляет легаси-поля старых сейвов (это их работа).
const ROOT = path.join(__dirname, '..');
const files = ['index.html']
    .concat(fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f));

const RULES = [
    { re: /(?<![Кконон])тракт[а-яё]*/i, name: 'тракт (легаси Тракта; «контракт» Кровавой Клятвы разрешён)' },
    { re: /Sender-Хутор/i, name: 'latin Sender (должно быть Сендер)' },
    { re: /11 локаций/i, name: '«11 локаций» (легаси-число тракта)' },
    { re: /Тронного Зала/i, name: '«Тронного Зала» (легаси-финиш тракта)' },
    { re: /adaptationMult|getAdaptation/i, name: 'adaptation decay (вырезан в v28, заменён стрик-бонусом)' },
    { re: /эстус|estus/i, name: 'Эстус (вырезан в v25)', skip: (f) => f === 'js/storage.js' },
];

test('нет легаси-строк вырезанных систем в продукте', () => {
    const hits = [];
    files.forEach((rel) => {
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        const lines = text.split('\n');
        RULES.forEach((rule) => {
            if (rule.skip && rule.skip(rel)) return;
            lines.forEach((line, i) => {
                if (rule.re.test(line)) hits.push(rel + ':' + (i + 1) + ' [' + rule.name + '] ' + line.trim().slice(0, 80));
            });
        });
    });
    assert.deepEqual(hits, [], 'легаси-строки найдены:\n' + hits.join('\n'));
});
