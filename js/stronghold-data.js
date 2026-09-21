// ===================== КАТАЛОГИ ТВЕРДЫЕН (единый источник: app + sim; SPEC §1-§3, BALANCE круг 3) =====================
var STRONGHOLDS = [
{ id: 'sh01', prov: 1, icon: '🛖', name: 'Сендер-Хутор',        gar: 3,    def: 2,    total: 5,    slots: 6, tax: 1 },
{ id: 'sh02', prov: 1, icon: '🏕', name: 'Лаголь Земли',        gar: 18,   def: 10,   total: 28,   slots: 6, tax: 2 },
{ id: 'sh03', prov: 1, icon: '🪵', name: 'Лесопилка',           gar: 26,   def: 14,   total: 40,   slots: 6, tax: 4 },
{ id: 'sh04', prov: 1, icon: '⛏', name: 'Медные Копи',         gar: 42,   def: 23,   total: 65,   slots: 6, tax: 7 },
{ id: 'sh05', prov: 1, icon: '🌾', name: 'Житницы',             gar: 71,   def: 39,   total: 110,  slots: 6, tax: 11 },
{ id: 'sh06', prov: 2, icon: '🕯', name: 'Чертож Воли',         gar: 123,  def: 67,   total: 190,  slots: 7, tax: 16 },
{ id: 'sh07', prov: 2, icon: '🪙', name: 'Златоград',           gar: 181,  def: 99,   total: 280,  slots: 7, tax: 22 },
{ id: 'sh08', prov: 2, icon: '🏰', name: 'Дозорный Замок',      gar: 291,  def: 159,  total: 450,  slots: 7, tax: 30 },
{ id: 'sh09', prov: 2, icon: '🗼', name: 'Башня Тягости',       gar: 330,  def: 180,  total: 510,  slots: 7, tax: 39 },
{ id: 'sh10', prov: 2, icon: '⛩', name: 'Врата Свободы',       gar: 520,  def: 280,  total: 800,  slots: 7, tax: 50 },
{ id: 'sh11', prov: 3, icon: '👑', name: 'Терновый Трон',       gar: 720,  def: 380,  total: 1100, slots: 7, tax: 65 },
{ id: 'sh12', prov: 3, icon: '🧂', name: 'Соляной Разлом',      gar: 910,  def: 490,  total: 1400, slots: 7, tax: 85 },
{ id: 'sh13', prov: 3, icon: '🌊', name: 'Гнилые Шлюзы',        gar: 1110, def: 590,  total: 1700, slots: 7, tax: 440 },
{ id: 'sh14', prov: 3, icon: '🐦', name: 'Вороний Придел',      gar: 1330, def: 720,  total: 2050, slots: 7, tax: 560 },
{ id: 'sh15', prov: 3, icon: '🦴', name: 'Костяная Перевязь',   gar: 1560, def: 840,  total: 2400, slots: 7, tax: 700 },
{ id: 'sh16', prov: 4, icon: '🌄', name: 'Заревый Форпост',     gar: 1810, def: 990,  total: 2800, slots: 8, tax: 860 },
{ id: 'sh17', prov: 4, icon: '⛪', name: 'Шёпотящий Монастырь', gar: 2090, def: 1110, total: 3200, slots: 8, tax: 1040 },
{ id: 'sh18', prov: 4, icon: '🌳', name: 'Ясень Забвения',      gar: 2370, def: 1280, total: 3650, slots: 8, tax: 1240 },
{ id: 'sh19', prov: 4, icon: '💨', name: 'Угарный Чертог',      gar: 2690, def: 1460, total: 4150, slots: 8, tax: 1460 },
{ id: 'sh20', prov: 4, icon: '👁', name: 'Венец Угасания',      gar: 3010, def: 1590, total: 4600, slots: 8, tax: 1720 }
];
var BUILDINGS = {
zh1: { id: 'zh1', cat: 'house',  icon: '🏚', name: 'Ополченческий Двор', cost: 60,    upkeep: 3,   grow: 14, tier: 't1', req: null, min: 1 },
zh2: { id: 'zh2', cat: 'house',  icon: '🎖', name: 'Казармы',            cost: 150,   upkeep: 8,   grow: 12, tier: 't2', req: 'zh1', min: 2 },
zh3: { id: 'zh3', cat: 'house',  icon: '🏹', name: 'Стрельбище',         cost: 360,   upkeep: 18,  grow: 10, tier: 't3', req: 'zh2', min: 3 },
zh4: { id: 'zh4', cat: 'house',  icon: '⚔', name: 'Оружейня',           cost: 900,   upkeep: 40,  grow: 8,  tier: 't4', req: 'zh3', min: 5 },
zh5: { id: 'zh5', cat: 'house',  icon: '🐎', name: 'Конюшни Пепла',      cost: 2100,  upkeep: 90,  grow: 6,  tier: 't5', req: 'zh4', min: 8 },
zh6: { id: 'zh6', cat: 'house',  icon: '🌿', name: 'Капелла Терна',      cost: 4800,  upkeep: 200, grow: 6,  tier: 't6', req: 'zh5', min: 11 },
zh7: { id: 'zh7', cat: 'house',  icon: '🏯', name: 'Цитадель Духа',      cost: 10800, upkeep: 450, grow: 4,  tier: 't7', req: 'zh6', min: 15 },
ec1: { id: 'ec1', cat: 'econ',   icon: '⚖', name: 'Рынок',              cost: 120,   upkeep: 10,  market: 0.10, req: null, min: 1 },
ec2: { id: 'ec2', cat: 'econ',   icon: '🌾', name: 'Амбары',             cost: 180,   upkeep: 15,  gold: 20,  req: null, min: 2 },
ec3: { id: 'ec3', cat: 'econ',   icon: '⛏', name: 'Медный Рудник',      cost: 360,   upkeep: 35,  gold: 150, req: null, min: 4 },
ec4: { id: 'ec4', cat: 'econ',   icon: '💼', name: 'Гильдия Торговцев',  cost: 1500,  upkeep: 80,  gold: 400, req: 'ec1', min: 7 },
ec5: { id: 'ec5', cat: 'econ',   icon: '🪙', name: 'Монетный Двор',      cost: 4200,  upkeep: 200, gold: 900, req: 'ec4', min: 12 },
df1: { id: 'df1', cat: 'defense', icon: '🪵', name: 'Частокол',          cost: 180,   upkeep: 8,   def: 20,   req: null, min: 1 },
df2: { id: 'df2', cat: 'defense', icon: '🗼', name: 'Башня Стражи',      cost: 480,   upkeep: 22,  def: 60,   req: 'df1', min: 3 },
df3: { id: 'df3', cat: 'defense', icon: '🧱', name: 'Каменные Стены',    cost: 1200,  upkeep: 55,  def: 160,  req: 'df2', min: 6 },
df4: { id: 'df4', cat: 'defense', icon: '🏰', name: 'Великая Цитадель',  cost: 3300,  upkeep: 140, def: 420,  req: 'df3', min: 10 },
sp1: { id: 'sp1', cat: 'special', icon: '🔭', name: 'Гильдия Разведчиков', cost: 300,  upkeep: 20,  scout: true, req: null, min: 3 },
sp2: { id: 'sp2', cat: 'special', icon: '🚩', name: 'Кузня Знамён',      cost: 2100,  upkeep: 100, attrition: 0.8, req: 'sp1', min: 7 },
sp3: { id: 'sp3', cat: 'special', icon: '⛪', name: 'Собор Порядка',     cost: 3300,  upkeep: 160, step: 4,   req: 'sp1', min: 9 },
sp4: { id: 'sp4', cat: 'special', icon: '🌬', name: 'Врата Ветров',      cost: 6600,  upkeep: 300, growthMult: 1.4, req: 'sp2', min: 13 }
};
var UNIT_TIERS = {
t1: { icon: '🗡', name: 'Ополченец',      cost: 1,    power: 2,    growth: 14 },
t2: { icon: '🛡', name: 'Копейщик',       cost: 5,    power: 6,    growth: 12 },
t3: { icon: '🏹', name: 'Тень-Лучник',    cost: 15,   power: 16,   growth: 10 },
t4: { icon: '⚔', name: 'Заревый Мечник', cost: 50,   power: 45,   growth: 8 },
t5: { icon: '🐎', name: 'Всадник Пепла',  cost: 160,  power: 140,  growth: 6 },
t6: { icon: '🌿', name: 'Хранитель Терна', cost: 525,  power: 450,  growth: 6 }, // [BALANCE круг 10]: 800→525 — закрыт немонотонный стык (кандидат круга 3): eff 0.563→0.857 = цель ×1.1 круга 3 (450/525=0.857 ≈ 1.1×0.778=0.856)
t7: { icon: '👁', name: 'Архонт Угасания', cost: 1800, power: 1400, growth: 4 }
};
// ===================== Г2-1: ПОВЕРЕННЫЕ ТЬМЫ — боссы провинций (каталог рядом с STRONGHOLDS) =====================
// Боссы нумеруются I..XI и выстраиваются очередью по провинциям (в данных 4 провинции × 5 твердынь):
// I–III → пров.1, IV–VI → пров.2, VII–IX → пров.3, X–XI → пров.4. Босс доступен, когда провинция собрана.
// Эскалация целей к XI: bossEscalation(num) = 1 + 0.05×(num−1) → ×1.5 (app.js).
// Фазы: {type:'cards',n} — N карт за день; {type:'quests'} — все дневные квесты done;
// {type:'gold',mult} — заработать mult×dailyGoldGoal сегодня; {type:'streak'} — ≥1 карта (стрик не рвётся).
var BOSSES = [
{ num: 1,  prov: 1, name: 'Гнилоух, Пастух Чумных Стад', icon: '🐀', lore: 'Стада мора текут сквозь границы, и пастух свистит им на гнилом свистке.',
  phases: [ { type: 'cards', n: 3 }, { type: 'streak' }, { type: 'gold', mult: 2 } ],
  artifact: { kind: 'tax', name: 'Пастуший Посох', desc: '+5% налог провинции I' } },
{ num: 2,  prov: 1, name: 'Мгла-над-Топью', icon: '🐸', lore: 'Топь дышит, когда молчит король. Мгла считает вдохи путников.',
  phases: [ { type: 'streak' }, { type: 'cards', n: 3 }, { type: 'gold', mult: 2 } ],
  artifact: { kind: 'attrition', name: 'Болотный Фонарь', desc: '−10% потерь при штурмах' } },
{ num: 3,  prov: 1, name: 'Кузень Пепельных Уз', icon: '⚒', lore: 'Каждый узел на его цепи — чья-то клятва, откованная насильно.',
  phases: [ { type: 'cards', n: 4 }, { type: 'quests' }, { type: 'streak' } ],
  artifact: { kind: 'def', name: 'Пепельные Окосты', desc: '+5% обороны гарнизонов' } },
{ num: 4,  prov: 2, name: 'Барон Соляных Руд', icon: '⛏', lore: 'Он платит солью, и соль разъедает всё, кроме долга.',
  phases: [ { type: 'gold', mult: 2 }, { type: 'cards', n: 3 }, { type: 'streak' } ],
  artifact: { kind: 'tax', name: 'Соляной Скипетр', desc: '+5% налог провинции II' } },
{ num: 5,  prov: 2, name: 'Вдова Медных Копей', icon: '🕸', lore: 'Копи закрылись, но паутина в шахтах всё ещё натянута и ждёт.',
  phases: [ { type: 'quests' }, { type: 'cards', n: 3 }, { type: 'gold', mult: 2 } ],
  artifact: { kind: 'attrition', name: 'Медная Пряжа', desc: '−10% потерь при штурмах' } },
{ num: 6,  prov: 2, name: 'Жнец Житниц', icon: '🌾', lore: 'Урожай поспел везде, где он прошёл. Жалобы некому подавать.',
  phases: [ { type: 'streak' }, { type: 'quests' }, { type: 'cards', n: 4 } ],
  artifact: { kind: 'def', name: 'Серп Жатв', desc: '+5% обороны гарнизонов' } },
{ num: 7,  prov: 3, name: 'Стадо-без-Пастуха', icon: '🐂', lore: 'Тысяча рогов на горизонте. Ни одного пастуха. Беги.',
  phases: [ { type: 'cards', n: 4 }, { type: 'gold', mult: 2 }, { type: 'streak' } ],
  artifact: { kind: 'tax', name: 'Ярмо Стад', desc: '+5% налог провинции III' } },
{ num: 8,  prov: 3, name: 'Прилив Изгнанных', icon: '🌊', lore: 'Волна из тех, кого выгнали. Она возвращается дважды в день.',
  phases: [ { type: 'quests' }, { type: 'streak' }, { type: 'cards', n: 4 } ],
  artifact: { kind: 'attrition', name: 'Ракушка Прилива', desc: '−10% потерь при штурмах' } },
{ num: 9,  prov: 3, name: 'Хор Полых Колоколов', icon: '🔔', lore: 'Колокола звонят без звонаря, и каждый удар — по имени.',
  phases: [ { type: 'gold', mult: 3 }, { type: 'cards', n: 3 }, { type: 'streak' } ],
  artifact: { kind: 'xp', name: 'Язык Колокола', desc: '+10% ко всему опыту' } },
{ num: 10, prov: 4, name: 'Морозный Кенти', icon: '❄', lore: 'Улыбается на морозе. Не моргает. Никогда не моргает.',
  phases: [ { type: 'cards', n: 4 }, { type: 'quests' }, { type: 'gold', mult: 3 } ],
  artifact: { kind: 'tax', name: 'Сосулечный Клык', desc: '+5% налог провинции IV' } },
{ num: 11, prov: 4, name: 'Царь-Облупленный', icon: '👑', lore: 'Корона держится на честном слове, а слово он уже дал Тьме.',
  phases: [ { type: 'gold', mult: 3 }, { type: 'quests' }, { type: 'cards', n: 5 } ],
  artifact: { kind: 'cost', name: 'Облупленная Корона', desc: '−15% цена построек' } }
];
// Артефакт-таблица (11 шт): 4× tax / 3× attrition / 2× def / 1× xp / 1× cost — пассив через bossArtifactMult(kind, prov)
// Г2-фикс: имя ARTIFACTS занято инвентарными артефактами (app.js:1040) — глобальная коллизия убивала app.js целиком
var BOSS_ARTIFACTS = BOSSES.map(function(b, i) {
    return { num: b.num, prov: b.prov, kind: b.artifact.kind, name: b.artifact.name, desc: b.artifact.desc, idx: i };
});
var BOSS_KINDS = ['tax', 'attrition', 'def', 'xp', 'cost'];
if (typeof window !== 'undefined') window.StrongholdData = { STRONGHOLDS: STRONGHOLDS, BUILDINGS: BUILDINGS, UNIT_TIERS: UNIT_TIERS, BOSSES: BOSSES, BOSS_ARTIFACTS: BOSS_ARTIFACTS };
if (typeof module !== 'undefined' && module.exports) module.exports = { STRONGHOLDS: STRONGHOLDS, BUILDINGS: BUILDINGS, UNIT_TIERS: UNIT_TIERS, BOSSES: BOSSES, BOSS_ARTIFACTS: BOSS_ARTIFACTS };
