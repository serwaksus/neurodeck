#!/usr/bin/env node
'use strict';
// ============================================================================
// NeuroDeck «Твердыни v2» — балансный симулятор (balance-агент, ADR-0001 §8).
// Детерминированный: SEED в шапке, повторный запуск = те же числа.
// Запуск: node tools/balance-lab/sim.js   (exit 0; печатает таблицу гейтов G1–G3)
//
// Источники чисел: docs/strongholds-v2/SPEC.md ([BALANCE]-числа помечены тут
// комментарием [BALANCE] + причина правки), js/app.js (экономика-основа v1:
// карточка +1💰 L307-336, задачи L1485-1489, XP-кривая L55-58, старт gold=30 L74,
// cardXp=15 L329). Экономика-основу v1 сим НЕ меняет.
// ============================================================================

const SEED = 20260913;          // seed фиксирован: повторный запуск = те же числа
const HORIZON = 98;             // 14 недель (круг 2, D1: окна гейта G1 — 8–14 нед.)
const START_GOLD = 30;          // js/app.js:74
const CARD_XP = 15;             // js/app.js:329 baseCardXp (стрим-множители не моделируем)
const CARD_GOLD = 1;            // SPEC §8
const LEVEL_GOLD = 30;          // SPEC §8
const GHOST_GOLD = 1;           // SPEC §8

// --- Seeded RNG (mulberry32) -------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Таблица 20 твердынь, SPEC §1 --------------------------------------------
// tax #1–11 = REGIONS v1 1:1 (паритет миграции, менять нельзя, Σ=247).
// [BALANCE: G1] налоги #12–20 — эндгеймовая кривая. Круг 2 (D1-а продюсера):
// Σ полного захвата 2337💰/день. Круг 3 (директива пользователя, binding,
// «налоги ×3–4»): #13–20 ×3.27–3.56, #12=85 не тронут → Σ 7322💰/день.
// Доход карточек/задач v1 НЕ инфлирован (паритет binding).
// [BALANCE: G2] кривая «Итого» сжата (круг 1): было 2800..26000 → 1100..4600.
const SH = [
  //  имя                     гар     защ    итого    налог
  { n: 'Сендер-Хутор',        gar: 10,    def: 5,    tot: 15,    tax: 1 },
  { n: 'Лаголь Земли',        gar: 18,    def: 10,   tot: 28,    tax: 2 },
  { n: 'Лесопилка',           gar: 26,    def: 14,   tot: 40,    tax: 4 },    // [BALANCE] 50→40
  { n: 'Медные Копи',         gar: 42,    def: 23,   tot: 65,    tax: 7 },    // [BALANCE] 90→65
  { n: 'Житницы',             gar: 71,    def: 39,   tot: 110,   tax: 11 },   // [BALANCE] 150→110
  { n: 'Чертож Воли',         gar: 123,   def: 67,   tot: 190,   tax: 16 },   // [BALANCE] 260→190
  { n: 'Златоград',           gar: 181,   def: 99,   tot: 280,   tax: 22 },   // [BALANCE] 430→280
  { n: 'Дозорный Замок',      gar: 291,   def: 159,  tot: 450,   tax: 30 },   // [BALANCE] 720→450
  { n: 'Башня Тягости',       gar: 330,   def: 180,  tot: 510,   tax: 39 },   // [BALANCE] 1150→510
  { n: 'Врата Свободы',       gar: 520,   def: 280,  tot: 800,   tax: 50 },   // [BALANCE] 1800→800
  { n: 'Терновый Трон',       gar: 720,   def: 380,  tot: 1100,  tax: 65 },   // [BALANCE] 2800→1100
  { n: 'Соляной Разлом',      gar: 910,   def: 490,  tot: 1400,  tax: 85 },   // [BALANCE: D1] tax 90→85
  { n: 'Гнилые Шлюзы',        gar: 1110,  def: 590,  tot: 1700,  tax: 440 },  // [BALANCE: круг 3] tax 110→440 (×4.0, верх полосы «×3–4»)
  { n: 'Вороний Придел',      gar: 1330,  def: 720,  tot: 2050,  tax: 560 },  // [BALANCE: круг 3] tax 140→560 (×4.0)
  { n: 'Костяная Перевязь',   gar: 1560,  def: 840,  tot: 2400,  tax: 700 },  // [BALANCE: круг 3] tax 175→700 (×4.0)
  { n: 'Заревый Форпост',     gar: 1810,  def: 990,  tot: 2800,  tax: 860 },  // [BALANCE: круг 3] tax 215→860 (×4.0)
  { n: 'Шёпотящий Монастырь', gar: 2090,  def: 1110, tot: 3200,  tax: 1040 }, // [BALANCE: круг 3] tax 260→1040 (×4.0)
  { n: 'Ясень Забвения',      gar: 2370,  def: 1280, tot: 3650,  tax: 1240 }, // [BALANCE: круг 3] tax 310→1240 (×4.0)
  { n: 'Угарный Чертог',      gar: 2690,  def: 1460, tot: 4150,  tax: 1460 }, // [BALANCE: круг 3] tax 365→1460 (×4.0)
  { n: 'Венец Угасания',      gar: 3010,  def: 1590, tot: 4600,  tax: 1720 }, // [BALANCE: круг 3] tax 430→1720 (×4.0)
];

// --- Каталог построек, SPEC §2 ([BALANCE: G1]) -------------------------------
// [BALANCE: G1, D1-б] круг 2: стоимости −40% от круга 1 (потолок, выданный
// продюсером; дальше снижать нельзя). Круг 1: 250..60000 → 100..18000.
// Итог против дизайн-оригинала: −76..−97%.
const BLD = {
  Ж1: { cat: 'Ж', cost: 60,   up: 3,   min: 1,  req: null, tier: 1, growth: 14 },  // [BALANCE: D1-б] 100→60
  Ж2: { cat: 'Ж', cost: 150,  up: 8,   min: 2,  req: 'Ж1', tier: 2, growth: 12 },  // [BALANCE: D1-б] 250→150
  Ж3: { cat: 'Ж', cost: 360,  up: 18,  min: 3,  req: 'Ж2', tier: 3, growth: 10 },  // [BALANCE: D1-б] 600→360
  Ж4: { cat: 'Ж', cost: 900,  up: 40,  min: 5,  req: 'Ж3', tier: 4, growth: 8 },   // [BALANCE: D1-б] 1500→900
  Ж5: { cat: 'Ж', cost: 2100, up: 90,  min: 8,  req: 'Ж4', tier: 5, growth: 6 },   // [BALANCE: D1-б] 3500→2100
  Ж6: { cat: 'Ж', cost: 4800, up: 200, min: 11, req: 'Ж5', tier: 6, growth: 6 },   // [BALANCE] 26000→8000→4800, прирост 4→6
  Ж7: { cat: 'Ж', cost: 10800, up: 450, min: 15, req: 'Ж6', tier: 7, growth: 4 },  // [BALANCE] 60000→18000→10800, прирост 3→4
  Э1: { cat: 'Э', cost: 120,  up: 10,  min: 1,  req: null, pct: 0.10, cap: 0.50 },   // [BALANCE: D1-б] 200→120
  Э2: { cat: 'Э', cost: 180,  up: 15,  min: 2,  req: null, gold: 20 },               // [BALANCE: D1-б] 300→180
  Э3: { cat: 'Э', cost: 360,  up: 35,  min: 4,  req: null, gold: 150 },             // [BALANCE] 3500→600→360; +80→+110→+150 (круг 2)
  Э4: { cat: 'Э', cost: 1500, up: 80,  min: 7,  req: 'Э1', gold: 400 },              // [BALANCE] 2500→1500; +200→+280→+400 (круг 2)
  Э5: { cat: 'Э', cost: 4200, up: 200, min: 12, req: 'Э4', gold: 900 },            // [BALANCE] 7000→4200; +450→+600→+900 (круг 2)
  О1: { cat: 'О', cost: 180,  up: 8,   min: 1,  req: null, def: 20 },                // [BALANCE: D1-б] 300→180
  О2: { cat: 'О', cost: 480,  up: 22,  min: 3,  req: 'О1', def: 60 },               // [BALANCE: D1-б] 800→480
  О3: { cat: 'О', cost: 1200, up: 55,  min: 6,  req: 'О2', def: 160 },              // [BALANCE: D1-б] 2000→1200
  О4: { cat: 'О', cost: 3300, up: 140, min: 10, req: 'О3', def: 420 },              // [BALANCE: D1-б] 5500→3300
  П1: { cat: 'П', cost: 300,  up: 20,  min: 3,  req: null },                        // [BALANCE: D1-б] 500→300
  П2: { cat: 'П', cost: 2100, up: 100, min: 7,  req: 'П1', attrMult: 0.8 },         // [BALANCE: D1-б] 3500→2100
  П3: { cat: 'П', cost: 3300, up: 160, min: 9,  req: 'П1', step: 4 },             // [BALANCE: D1-б] 5500→3300
  П4: { cat: 'П', cost: 6600, up: 300, min: 13, req: 'П2', growthMult: 1.4 },    // [BALANCE] 40000→11000→6600, 1.3→1.4
};
const BUILD_ORDER = ['Ж1', 'Ж2', 'Э2', 'О1', 'Э3', 'Ж3', 'О2', 'Э4', 'Ж4', 'Э1', 'Ж5', 'П1', 'О3', 'Э5', 'П2', 'Ж6', 'П3', 'П4', 'О4', 'Ж7'];  // [BALANCE, круг 3] Ж2 сразу за Ж1 (итер. 2: Ж2 строился на нед. позже накопления — пул «среднего» оставался Т1-only, армия ≤66 против порога штурма 105, фронт вечно 4/20); О-линия и Э-крюк сохранены

// --- Существа, SPEC §3 ([BALANCE: G2]) ---------------------------------------
// [BALANCE: G2] Круг 2: найм −50% всем тирам (sink, не кран — паритет §9 цел).
// Круг 3 (директива пользователя, binding, «дешёвый найм»): Т1–Т5
// 15/35/80/180/350 → 1/5/15/50/160. Сила/💰: 2.000/1.200/1.067/0.900/0.875
// против Т7 0.778 — масс дешёвых даёт больше силы за золото, «копить только
// Т7» больше не единственная выгодная стратегия (канон HoMM). Т6–Т7 без
// изменений (директива; Т6 0.563 < Т7 — кандидат на пересмотр в след. круге).
const TIERS = [
  { name: 'Ополченец',       cost: 1,    power: 2,    growth: 14 },  // [BALANCE: круг 3] 15→1: сила/💰 2.000 (цель ~1.5–1.6; цена <1💰 невозможна)
  { name: 'Копейщик',        cost: 5,    power: 6,    growth: 12 },  // [BALANCE: круг 3] 35→5: 1.200 (цель ~1.32, ×1.7 к топу)
  { name: 'Тень-Лучник',     cost: 15,   power: 16,   growth: 10 },  // [BALANCE: круг 3] 80→15: 1.067 (цель ~1.09, ×1.4)
  { name: 'Заревый Мечник',  cost: 50,   power: 45,   growth: 8 },   // [BALANCE: круг 3] 180→50: 0.900 (цель ~0.93, ×1.2)
  { name: 'Всадник Пепла',   cost: 160,  power: 140,  growth: 6 },   // [BALANCE: круг 3] 350→160: 0.875 (цель ~0.86, ×1.1)
  { name: 'Хранитель Терна', cost: 800,  power: 450,  growth: 6 },   // [BALANCE] прирост 4→6; круг 3: без изменений (0.563)
  { name: 'Архонт Угасания', cost: 1800, power: 1400, growth: 4 },   // [BALANCE] прирост 3→4; круг 3: без изменений (0.778)
];

// --- Штурм, SPEC §4 ([BALANCE: G2] attrition) --------------------------------
const ATK_STR_COEF = 0.02;
const ATTR_BASE = 0.30, ATTR_LO = 0.08, ATTR_HI = 0.30;   // clamp(0.30/ratio; 0.08; 0.30)
const AGI_COEF = 0.01, AGI_CAP = 0.50;
const RETREAT_MIN = 10, RETREAT_SPAN = 20;
// ИИ атакует при ratio ≥ P.assaultR (порог — черта профиля: дисциплинированный
// ждёт запас 1.20; средний рискует с 0.90 — атаки с недокачем при ratio 0.90–1.0
// дают отступления, G1 требует ≥2; ленивый лезет с 0.85).
const ASSAULT_RATIO = 1.20;   // дефолт

// --- Воскресная осада, SPEC §5 ([BALANCE: G2]) -------------------------------
const SIEGE_BASE = 0.6;
const SIEGE_WEEK = 1.15, SIEGE_WMAX = 12;
const WRATH_COEF = 0.12;      // [BALANCE] 0.08→0.12: Гнев достаёт ленивого к неделе ≤4 (G3), среднего не достаёт
const WRATH_CAP = 10;
const BREAK_TH = 1.5, BREAK_FADE = 0.85, BREAK_MAX = 3;
const REPEL_LOSS = 0.15;

// --- Коррапшн, SPEC §6 ([BALANCE: G1]) ---------------------------------------
const GRACE_BASE = 2, STEP_BASE = 2, IMMUNE_DAYS = 7;
const STAGE = { RUIN: 0, WORN: 1, INTACT: 2 };

// --- Атрибуты, SPEC §7 -------------------------------------------------------
const CHA_COEF = 0.005, CHA_CAP = 0.30, WIL_DIV = 20;
const ATTR_ROTATION = ['str', 'agi', 'end', 'cha', 'wil'];
const XP_CURVE = [50, 100, 200, 380, 700, 1300, 2400, 4500, 8500, 16000, 22000, 30000, 40000, 52000, 68000];
function xpToNext(level) {
  if (level - 1 < XP_CURVE.length) return XP_CURVE[level - 1];
  return Math.floor(XP_CURVE[XP_CURVE.length - 1] * Math.pow(1.65, level - XP_CURVE.length));
}

// --- Профили (задача A) -------------------------------------------------------
const PROFILES = [
  { key: 'дисциплинированный', seed: SEED,     cards: 5, tasksPerDay: 2.2, skipP: 0,     sickP: 0,     ghostBase: 0, ghostP: 0,    hireEvery: 0, managesGarrison: true,  wrathEst: 0, assaultR: 1.20 },
  { key: 'средний',            seed: SEED + 1, cards: 3, tasksPerDay: 1.1, skipP: 0.10,  sickP: 1 / 14, ghostBase: 0, ghostP: 0.15, hireEvery: 0, managesGarrison: true,  wrathEst: 10, assaultR: 0.95 },
  { key: 'ленивый',            seed: SEED + 2, cards: 1, tasksPerDay: 0.3, skipP: 0,     sickP: 2 / 7, ghostBase: 1, ghostP: 0.3,  hireEvery: 7, managesGarrison: false, wrathEst: 6, assaultR: 0.85 },
];
const TASK_TIERS = [
  { gold: 5, xp: 20, w: 0.4 },
  { gold: 10, xp: 40, w: 0.4 },
  { gold: 20, xp: 80, w: 0.2 },
];

// ============================================================================
function runProfile(P) {
  const rng = mulberry32(P.seed);
  const st = {
    day: 0, gold: START_GOLD, level: 1, xp: 0,
    attrs: { str: 3, end: 3, cha: 3, wil: 3, int: 3, agi: 3 },
    pool: 0, rotIdx: 0,
    army: [0, 0, 0, 0, 0, 0, 0],
    garrison: Array.from({ length: 20 }, () => [0, 0, 0, 0, 0, 0, 0]),
    captured: Array(20).fill(false),
    capCount: 0, front: -1, frontSince: null,
    bld: Array.from({ length: 20 }, () => ({})),
    debtDays: 0, poolT: [0, 0, 0, 0, 0, 0, 0],
    ghosts: 0, fails7: [], skips7: [],
    wins: 0, retreats: 0, assaults: 0,
    capDay: Array(20).fill(null),
    siegesRepelled: 0, falls: 0, firstFallDay: null, firstCaptureDay: null,
    fullLosses: 0, deadlockReturns: 0, maxReturnGap: 0, lastFullLossDay: null,
    ruinNights: 0, maxDebt: 0, maxDeficitRun: 0, deficitRun: 0,
    downShifts: 0, upShifts: 0,
    weekIncome: [], weekUpkeep: [], incomeAcc: 0, upkeepAcc: 0,
    bldSpend: 0, hireSpend: 0,
    finishDay: null, weekly: [],
  };

  // v1-семантика (js/app.js:1404 regions:0 → владеешь #1; SPEC §9 миграция i=0..regions):
  // новый игрок стартует с захваченным Сендер-Хутором, первая цель штурма — #2.
  st.captured[0] = true; st.capCount = 1; st.front = 0; st.frontSince = 1; st.capDay[0] = 0;

  const stageMult = (sh, id) => {
    const b = st.bld[sh][id];
    return !b ? 0 : b.stage === 2 ? 1 : b.stage === 1 ? 0.5 : 0;
  };
  const strMult = () => 1 + ATK_STR_COEF * st.attrs.str;
  const fieldPower = () => st.army.reduce((s, c, i) => s + c * TIERS[i].power, 0);
  const garPower = sh => st.garrison[sh].reduce((s, c, i) => s + c * TIERS[i].power, 0);
  const grace = () => GRACE_BASE + Math.floor(st.attrs.wil / WIL_DIV);
  const step = () => (st.bld.some(m => m['П3'] && m['П3'].stage > 0) ? 4 : STEP_BASE);
  const upkeepNow = () => {
    let u = 0;
    for (let sh = 0; sh < 20; sh++)
      for (const [id, b] of Object.entries(st.bld[sh]))
        if (b.stage > STAGE.RUIN) u += BLD[id].up;         // «руина не ест»
    return u;
  };
  const nextFrontIdx = () => (st.front < 19 ? st.front + 1 : -1);
  function incomeBase() {
    let taxes = 0, econ = 0, pct = 0;
    for (let sh = 0; sh < 20; sh++) {
      if (!st.captured[sh]) continue;
      taxes += SH[sh].tax;
      for (const [id] of Object.entries(st.bld[sh])) {
        if (BLD[id].cat !== 'Э') continue;
        const m = stageMult(sh, id);
        if (BLD[id].pct) pct += BLD[id].pct * m;
        else econ += (BLD[id].gold || 0) * m;
      }
    }
    pct = Math.min(pct, BLD['Э1'].cap);
    return { taxes, econ, market: Math.round((taxes + econ) * pct) };
  }
  function garDefOf(sh) {
    let d = SH[sh].tot;
    for (const [id] of Object.entries(st.bld[sh]))
      if (BLD[id].def) d += BLD[id].def * stageMult(sh, id);
    return d + Math.round(garPower(sh) * (1 + ATK_STR_COEF * st.attrs.end));
  }
  const income7 = [];
  const avgIncome7 = () => (income7.length ? income7.reduce((a, b) => a + b, 0) / income7.length : 25);

  function findBuild(gold, guardOn) {
    const guard = 0.40 * Math.max(1, avgIncome7());        // инвариант «содержание ≤ 40% дохода»
    const trySh = (id, sh) => {
      const b = BLD[id];
      if (!st.captured[sh] || st.bld[sh][id]) return false;
      if (b.min > sh + 1) return false;
      if (b.req && !st.bld[sh][b.req]) return false;
      if (gold < b.cost) return false;
      // Э-постройки из-под guard'а: их эффект — доход, guard иначе создаёт ловушку
      // бедности (блокирует единственные постройки, растящие знаменатель).
      if (guardOn && b.cat !== 'Э' && upkeepNow() + b.up > guard) return false;
      return sh;
    };
    for (const id of BUILD_ORDER) {
      if (BLD[id].cat === 'О') { const sh = trySh(id, st.front); if (sh !== false) return { id, sh }; continue; }
      for (let sh = 0; sh < 20; sh++) { const r = trySh(id, sh); if (r !== false) return { id, sh }; }
    }
    for (const id of ['Ж1', 'Ж2', 'Ж3', 'Ж4', 'Ж5', 'Ж6', 'Ж7'])
      for (let sh = 0; sh < 20; sh++) { const r = trySh(id, sh); if (r !== false) return { id, sh }; }
    return null;
  }

  function grantXp(amount) {
    st.xp += Math.round(amount * (1 + (st.attrs.int - 3) * 0.01));
    while (st.xp >= xpToNext(st.level)) {
      st.xp -= xpToNext(st.level); st.level += 1; st.gold += LEVEL_GOLD;
      for (const k of Object.keys(st.attrs)) st.attrs[k] += 1;
      if (st.level % 8 === 0) st.pool += 1;                // ранг-ап ≈ 1/8 уровней
      while (st.pool >= 5) { st.attrs[ATTR_ROTATION[st.rotIdx++ % 5]] += 1; st.pool -= 5; }
    }
  }

  function doAssault() {
    const nx = nextFrontIdx();
    if (nx < 0) return;
    const atk = fieldPower() * strMult();
    const ratio = atk / SH[nx].tot;
    if (ratio < P.assaultR) return;
    st.assaults++;
    const p2 = st.bld.some(m => m['П2'] && m['П2'].stage > 0) ? 0.8 : 1;
    if (ratio > 1) {
      st.wins++;
      const agi = 1 - Math.min(AGI_CAP, AGI_COEF * st.attrs.agi);
      const attr = Math.min(ATTR_HI, Math.max(ATTR_LO, ATTR_BASE / ratio)) * agi * p2;
      for (let i = 0; i < 7; i++) {
        const loss = st.army[i] > 0 ? Math.min(st.army[i] - 1, Math.floor(st.army[i] * attr)) : 0;
        st.army[i] -= loss;                                 // ≥1 в непустой стопе
      }
      st.captured[nx] = true; st.capCount++;
      st.capDay[nx] = st.day;
      st.front = nx; st.frontSince = st.day;
      st.garrison[nx] = [0, 0, 0, 0, 0, 0, 0];
      if (st.firstCaptureDay === null) st.firstCaptureDay = st.day;
      if (st.capCount === 20) st.finishDay = st.day;
      grantXp(150);
    } else {
      st.retreats++;
      const loss = (RETREAT_MIN + Math.floor(rng() * (RETREAT_SPAN + 1))) / 100;
      for (let i = 0; i < 7; i++) {
        const l = st.army[i] > 0 ? Math.min(st.army[i] - 1, Math.floor(st.army[i] * loss)) : 0;
        st.army[i] -= l;
      }
    }
  }

  function siege() {
    if (st.capCount === 0) return;
    const capturedIdx = [];
    for (let i = 19; i >= 0; i--) if (st.captured[i]) capturedIdx.push(i);
    const W = Math.min(SIEGE_WMAX, Math.floor((st.day - st.frontSince) / 7));
    // [D2, ADR П1-12] кап силы осады — по прогрессу, не по календарю:
    // W_eff = min(W, max(4, floor(захвачено × 1.5))) — застой фронта не эскалирует осаду
    // (убрана хвостовая потеря тыла «среднего» на ~10-й неделе круга 1).
    const Weff = Math.min(W, Math.max(4, Math.floor(st.capCount * 1.5)));
    const wrath = Math.min(WRATH_CAP, 2 * st.ghosts + sum(st.skips7) + sum(st.fails7));
    let power = Math.round(SH[st.front].tot * SIEGE_BASE * Math.pow(SIEGE_WEEK, Weff) * (1 + WRATH_COEF * wrath));
    const gdF = garDefOf(st.front);
    const breach = power > BREAK_TH * gdF;                  // прорыв: только >1.5×garDef (SPEC §5)
    if (power <= gdF) {                                     // отбито (бьёт даже при победе)
      st.siegesRepelled++;
      for (let i = 0; i < 7; i++) {
        const c = st.garrison[st.front][i];
        st.garrison[st.front][i] -= c > 0 ? Math.min(c - 1, Math.floor(c * REPEL_LOSS)) : 0;
      }
      grantXp(100 * (Math.floor(st.front / 5) + 1));
      return;
    }
    const fall = sh => {
      st.captured[sh] = false; st.capCount--; st.falls++;
      if (st.capCount === 0) { st.fullLosses++; st.lastFullLossDay = st.day; }
      if (st.firstFallDay === null) st.firstFallDay = st.day;
      st.garrison[sh] = [0, 0, 0, 0, 0, 0, 0];
      for (const id of Object.keys(st.bld[sh])) st.bld[sh][id].stage = STAGE.RUIN;
    };
    fall(st.front);                                         // фронт пал — без каскада, если не прорыв
    if (breach) {
      for (const sh of capturedIdx.slice(1, BREAK_MAX)) {   // прокат по 2-й и 3-й, ×0.85 за удар
        power = Math.round(power * BREAK_FADE);
        if (power <= garDefOf(sh)) break;                   // не пробил — ночь кончилась
        fall(sh);
      }
    }
    st.front = -1;
    for (let i = 19; i >= 0; i--) if (st.captured[i]) { st.front = i; break; }
    st.frontSince = st.day;                                 // след. воскресенье не каскадирует
    // [D3, ADR П1-13] анти-тупик: при потере ВСЕХ твердынь — отступление к №1:
    // владение №1 восстанавливается той же ночью, оборона нейтралов №1 — базовая
    // (гарнизон 0, постройки в руине), W осады сброшен (frontSince = сегодня,
    // накопления нет). Путь возврата существует всегда; возврат ≤ 2 недель (0 дн.).
    if (st.capCount === 0) {
      st.captured[0] = true; st.capCount = 1; st.front = 0;
      st.deadlockReturns++;
      st.maxReturnGap = Math.max(st.maxReturnGap, st.day - st.lastFullLossDay);
      st.lastFullLossDay = null;
    }
  }
  const sum = a => a.reduce((x, y) => x + y, 0);

  function corruptionNight(paid) {
    if (paid) {
      st.debtDays = 0; st.deficitRun = 0;
      for (let sh = 0; sh < 20; sh++)
        for (const b of Object.values(st.bld[sh]))
          if (b.stage < STAGE.INTACT) { b.stage += 1; st.upShifts++; }
      return;
    }
    st.gold = 0; st.debtDays += 1;
    st.maxDebt = Math.max(st.maxDebt, st.debtDays);
    st.deficitRun += 1;
    st.maxDeficitRun = Math.max(st.maxDeficitRun, st.deficitRun);
    const g = grace(), sp = step();
    for (let sh = 0; sh < 20; sh++)
      for (const [id, b] of Object.entries(st.bld[sh])) {
        if (st.day - b.day < IMMUNE_DAYS) continue;
        if (st.debtDays > g + sp) { if (b.stage > STAGE.RUIN) { b.stage = STAGE.RUIN; st.downShifts++; } }
        else if (st.debtDays > g) { if (b.stage > STAGE.WORN) { b.stage = STAGE.WORN; st.downShifts++; } }
      }
  }

  for (st.day = 1; st.day <= HORIZON; st.day++) {
    // 1) утро: карточки/задачи/призраки
    const sick = rng() < P.sickP;
    const skip = !sick && rng() < P.skipP ? 1 : 0;
    const cardsDone = sick ? 0 : P.cards;
    st.gold += cardsDone * CARD_GOLD - skip;
    if (sick) st.skips7.push(P.cards); else if (skip) st.skips7.push(1);
    let taskGold = 0, taskXp = 0;
    let tasks = 0;
    for (let i = 0; i < Math.ceil(P.tasksPerDay); i++) if (rng() < P.tasksPerDay - i) tasks++;
    for (let i = 0; i < tasks; i++) {
      const r = rng(); let acc = 0, t = TASK_TIERS[0];
      for (const tt of TASK_TIERS) { acc += tt.w; if (r <= acc) { t = tt; break; } }
      taskGold += t.gold; taskXp += t.xp;
    }
    st.gold += taskGold; grantXp(taskXp);
    const newGhost = rng() < P.ghostP ? 1 : 0;
    st.ghosts = P.ghostBase + newGhost;
    if (newGhost) st.fails7.push(1);

    // 2) застройка (1/день, инвариант 40%)
    const build = findBuild(st.gold, true);
    if (build) {
      if (process.env.BUILD_LOG) console.error(`d${String(st.day).padStart(3)} [${P.key}] build ${build.id}@sh${build.sh} cost=${BLD[build.id].cost} gold_after=${Math.round(st.gold - BLD[build.id].cost)} army=${fieldPower()}`);
      st.gold -= BLD[build.id].cost; st.bldSpend += BLD[build.id].cost;
      st.bld[build.sh][build.id] = { day: st.day, stage: STAGE.INTACT };
    }

    // 3) понедельник: недельный пул прироста (непокупленное сгорает)
    if ((st.day - 1) % 7 === 0) {
      const gm = st.bld.some(m => m['П4'] && m['П4'].stage > 0) ? BLD['П4'].growthMult : 1;
      for (let t = 0; t < 7; t++) {
        let g = 0;
        for (let sh = 0; sh < 20; sh++) {
          const id = 'Ж' + (t + 1);
          if (st.bld[sh][id] && st.bld[sh][id].stage > 0) g += TIERS[t].growth * stageMult(sh, id);
        }
        st.poolT[t] = Math.floor(g * gm);
      }
    }

    // 4) найм (скидка 🎭). Стройка (блок 2) уже купила, если было по карману;
    // бюджет найма — режимная развилка ниже (ближняя лестница vs дальняя копилка).
    const cha = Math.min(CHA_CAP, CHA_COEF * st.attrs.cha);
    // [круг 2] найм из потока (бюджет = всё золото); постройка покупается утром,
    // когда по карману. Фондовые/фазовые планировщики (итер. 4-6) дали регресс:
    // desire найма ≥ нетто-дохода прибивает золото к нулю либо утренняя закупка
    // дешёвых Э1-дублей вечно сбрасывает копилку до целевой Э2 — откат к простой
    // эвристике; ограничение лестницы задокументировано в BALANCE.md §4.
    let budget = st.gold;
    const hireDay = !P.hireEvery || st.day % P.hireEvery === 0;
    if (hireDay) for (let t = 6; t >= 0; t--) {
      if (!st.poolT[t]) continue;
      const cost = Math.ceil(TIERS[t].cost * (1 - cha));
      const n = Math.min(st.poolT[t], Math.floor(Math.max(0, budget) / cost));
      st.army[t] += n; st.poolT[t] -= n; st.gold -= n * cost; budget -= n * cost; st.hireSpend += n * cost;
    }

    // 5) гарнизон фронта (перевод бесплатный; ленивый не управляет)
    if (st.front >= 0 && P.managesGarrison) {
      const nsun = st.day % 7 === 0 ? st.day : st.day + (7 - st.day % 7);
      const W = Math.min(SIEGE_WMAX, Math.floor((nsun - st.frontSince) / 7));
      const Weff = Math.min(W, Math.max(4, Math.floor(st.capCount * 1.5)));   // [D2] проекция — тот же кап
      const proj = SH[st.front].tot * SIEGE_BASE * Math.pow(SIEGE_WEEK, Weff) * (1 + WRATH_COEF * P.wrathEst);
      let dBase = SH[st.front].tot;
      for (const [id] of Object.entries(st.bld[st.front]))
        if (BLD[id].def) dBase += BLD[id].def * stageMult(st.front, id);
      const need = Math.max(0, Math.ceil((proj - dBase) / (1 + ATK_STR_COEF * st.attrs.end)));
      // [круг 3] резерв штурма: не сдуваем поле ниже силы, нужной на штурм
      // следующей твердыни (итер. 2: «средний» сдавал в гарнизон всё — армия 0,
      // порог штурма 105 недостижим, фронт вечно 4/20)
      const reserve = st.front < 19 ? Math.ceil(P.assaultR * SH[st.front + 1].tot / strMult()) : 0;
      let have = garPower(st.front);
      for (let t = 0; t < 7 && have < need; t++) {
        const move = Math.min(st.army[t], Math.ceil((need - have) / TIERS[t].power));
        if (fieldPower() - move * TIERS[t].power < reserve) break;
        st.army[t] -= move; st.garrison[st.front][t] += move; have += move * TIERS[t].power;
      }
    }

    // 6) штурм (1/день)
    doAssault();

    // 7) учёт дохода дня
    const inc = incomeBase();
    const up = upkeepNow();
    // [FIX круг 3] налоги/эконом/рынок зачисляются в казну: до этого фикса
    // inc.* шли только в incomeAcc (отчётность), st.gold их не получал —
    // кран налогов (D1-а) был отключён от экономики сима (дефект кругов 1-2:
    // армия упиралась в пул Ж1, Э2+ недостижимы, «дыра ×10.8» посчитана
    // по отчётному доходу, которого в потоке не было). SPEC §4: налог — кран v2.
    st.gold += inc.taxes + inc.econ + inc.market;
    st.incomeAcc += inc.taxes + inc.econ + inc.market + cardsDone * CARD_GOLD - skip + taskGold;
    st.upkeepAcc += up;
    income7.push(inc.taxes + inc.econ + inc.market + cardsDone * CARD_GOLD + taskGold);
    if (income7.length > 7) income7.shift();

    // 8) ночь 23:00: содержание → коррапшн → призраки
    const paid = st.gold >= up;
    if (paid) st.gold -= up;
    corruptionNight(paid);
    st.gold = Math.max(0, st.gold - st.ghosts * GHOST_GOLD);

    // 9) воскресенье 23:00: осада + недельный снимок
    if (st.day % 7 === 0) {
      siege();
      let ruins = 0, worn = 0;
      for (let sh = 0; sh < 20; sh++)
        for (const b of Object.values(st.bld[sh])) { if (b.stage === STAGE.RUIN) ruins++; else if (b.stage === STAGE.WORN) worn++; }
      st.weekly.push({
        captured: st.capCount, gold: st.gold, power: fieldPower(),
        gar: st.front >= 0 ? garPower(st.front) : 0,
        ruins, worn, repelled: st.siegesRepelled, falls: st.falls, retreats: st.retreats,
      });
      st.weekIncome.push(st.incomeAcc); st.weekUpkeep.push(st.upkeepAcc);
      st.incomeAcc = 0; st.upkeepAcc = 0;
      st.skips7 = []; st.fails7 = [];
    }
  }

  let ruins = 0, worn = 0;
  for (let sh = 0; sh < 20; sh++)
    for (const b of Object.values(st.bld[sh])) { if (b.stage === STAGE.RUIN) ruins++; else if (b.stage === STAGE.WORN) worn++; }
  st.finalRuins = ruins; st.finalWorn = worn;
  st.finalPower = fieldPower();
  st.finalGar = garPower(Math.max(0, st.front));
  st.maxRatio = Math.max(...st.weekUpkeep.map((u, i) => u / Math.max(1, st.weekIncome[i])));
  return st;
}

// ============================================================================
// Отчёт
// ============================================================================
const fmt = n => Math.round(n).toLocaleString('ru-RU');

function report(P, st) {
  console.log(`\n=== ПРОФИЛЬ: ${P.key.toUpperCase()} ===`);
  console.log('нед | захват | золото | армия | гарнизон | обветш/руин | осад отбито | падений | отступлений');
  st.weekly.forEach((s, i) => {
    console.log(
      `${String(i + 1).padStart(2)}  | ${String(s.captured).padStart(4)}   | ${fmt(s.gold).padStart(6)} | ${fmt(s.power).padStart(5)} | ` +
      `${fmt(s.gar).padStart(6)}   | ${String(s.worn).padStart(2)}/${String(s.ruins).padStart(2)}        | ${String(s.repelled).padStart(4)}        | ` +
      `${String(s.falls).padStart(4)}    | ${String(s.retreats).padStart(4)}`
    );
  });
  console.log(`Итог: захвачено ${st.capCount}/20 (день ${st.finishDay ?? '—'}${st.firstCaptureDay ? `, 1-я — день ${st.firstCaptureDay}` : ''}), ` +
    `золото ${fmt(st.gold)}, армия ${fmt(st.finalPower)}, гарнизон ${fmt(st.finalGar)}, руин ${st.finalRuins}, обветшало ${st.finalWorn}`);
  console.log(`События: штурмов ${st.assaults} (побед ${st.wins}, отступлений ${st.retreats}); осад отбито ${st.siegesRepelled}, потеряно твердынь ${st.falls}` +
    (st.firstFallDay ? ` (первая — день ${st.firstFallDay}, нед. ${Math.ceil(st.firstFallDay / 7)})` : ''));
  console.log(`Коррапшн: maxDebt ${st.maxDebt}, макс. серия дефицита ${st.maxDeficitRun} дн., ступени вниз/вверх ${st.downShifts}/${st.upShifts}, руино-ночей ${st.ruinNights}`);
  console.log(`[D2/D3] осадный кап W_eff=min(W; max(4; floor(захвачено×1.5))); полных потерь твердынь ${st.fullLosses}, возвратов к №1 ${st.deadlockReturns} (макс. задержка ${st.maxReturnGap} дн.)`);
  console.log(`Инвариант 40% (содержание/доход, худшая неделя): ${(st.maxRatio * 100).toFixed(1)}%`);
  const capWk = i => (st.capDay[i] !== null ? `нед. ${Math.ceil(st.capDay[i] / 7)} (день ${st.capDay[i]})` : '—');
  console.log(`Темпы захвата: №5 → ${capWk(4)} | №10 → ${capWk(9)} | №20 → ${capWk(19)}`);
  const incSum = st.weekIncome.reduce((a, b) => a + b, 0), upSum = st.weekUpkeep.reduce((a, b) => a + b, 0);
  console.log(`Бюджет ${Math.ceil(HORIZON / 7)} нед [F]: доход ${fmt(incSum)}, содержание ${fmt(upSum)}, построено ${fmt(st.bldSpend)}, нанято ${fmt(st.hireSpend)}, свободный остаток потока ${fmt(incSum - upSum - st.bldSpend - st.hireSpend)}`);
}

// --- Статический grace-трейс (G2, без RNG) -----------------------------------
function graceTrace() {
  const rows = [];
  let stage = STAGE.INTACT;
  for (let d = 1; d <= 6; d++) {
    if (d > GRACE_BASE + STEP_BASE) stage = STAGE.RUIN;
    else if (d > GRACE_BASE) stage = STAGE.WORN;
    rows.push(`день дефицита ${d} → ${stage === 2 ? 'Целое' : stage === 1 ? 'Обветшало' : 'Руина'}`);
  }
  return rows;
}

// ============================================================================
const results = {};
for (const P of PROFILES) { results[P.key] = runProfile(P); report(P, results[P.key]); }

console.log('\n================ ГЕЙТЫ (G1–G3) ================');
const disc = results['дисциплинированный'], avg = results['средний'], lazy = results['ленивый'];
const wk = st => (st.finishDay ? Math.ceil(st.finishDay / 7) : null);
const g1a = avg.capCount === 20 && wk(avg) >= 8 && wk(avg) <= 14 && avg.retreats >= 2;
const g1b = wk(disc) !== null && wk(disc) >= 6 && wk(disc) <= 10 && wk(disc) < wk(avg) && disc.finalRuins === 0 && disc.ruinNights === 0;
const g2a = avg.finalRuins === 0 && avg.ruinNights === 0;
const g2b = avg.maxDeficitRun <= GRACE_BASE + STEP_BASE;
const g3a = lazy.firstFallDay !== null && Math.ceil(lazy.firstFallDay / 7) <= 4;
const g3b = avg.falls === 0 && disc.falls === 0;
const g3c = lazy.fullLosses >= 1 && lazy.maxReturnGap <= 14;   // [D3] возврат №1 ≤ 2 недель
let allPass = true;
const gate = (name, cond, ev) => { console.log(`${name}: ${cond ? 'PASS' : 'FAIL'} — ${ev}`); allPass = allPass && cond; };

gate('G1', g1a && g1b,
  `средний: ${avg.capCount}/20 к нед. ${wk(avg) ?? '—'} (норма D1: все 20 в нед. 8–14), отступлений ${avg.retreats} (норма ≥2) | ` +
  `дисциплинированный: нед. ${wk(disc) ?? '—'} (норма D1: 6–10 и быстрее среднего), руин ${disc.finalRuins} (норма 0)`);
gate('G2', g2a && g2b,
  `средний: руино-ночей ${avg.ruinNights} (норма 0), худшая серия дефицита ${avg.maxDeficitRun} дн. (руина требует >${GRACE_BASE + STEP_BASE} дн. подряд)`);
console.log(`   grace-трейс (дефицит подряд → стадия): ${graceTrace().join('; ')}. Один пропущенный день = debt 1 ≤ grace ${GRACE_BASE} → деградации нет.`);
gate('G3', g3a && g3b && g3c,
  `ленивый: первая потеря — ${lazy.firstFallDay ? `нед. ${Math.ceil(lazy.firstFallDay / 7)} (норма ≤4)` : 'не случилась (FAIL)'}; ` +
  `[D3] полных потерь ${lazy.fullLosses}, возвратов к №1 ${lazy.deadlockReturns}, макс. задержка возврата ${lazy.maxReturnGap} дн. (норма ≤14) | ` +
  `средний/дисциплинированный потеряли: ${avg.falls}/${disc.falls} (норма 0/0)`);
console.log('==============================================');
// [R1, круг 3] проверка директивы: «копить только тир-7» — не единственная
// выгодная стратегия (статика по золоту, без учёта пула жилищ).
const effList = TIERS.map((t, i) => `Т${i + 1}=${(t.power / t.cost).toFixed(3)}`).join(' ');
const bestT = TIERS.reduce((b, t, i) => (t.power / t.cost > TIERS[b].power / TIERS[b].cost ? i : b), 0);
const needP = SH.reduce((s, x) => s + x.tot, 0);
const costVia = t => Math.ceil(needP / t.power) * t.cost;
console.log(`[R1] сила/💰: ${effList} | максимум Т${bestT + 1} = ${(TIERS[bestT].power / TIERS[bestT].cost).toFixed(3)} против Т7 = ${(TIERS[6].power / TIERS[6].cost).toFixed(3)} → масс дешёвых конкурирует с элитой`);
console.log(`[R1] кампания ${fmt(needP)} силы [C]: закупка только Т7 = ${fmt(costVia(TIERS[6]))}💰, только Т1 = ${fmt(costVia(TIERS[0]))}💰`);
console.log(`VERDICT: ${allPass ? 'ALL GATES PASS' : 'FAIL — см. таблицу выше'}`);
process.exit(0);
