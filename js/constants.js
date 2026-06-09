var ND = window.ND || {};

ND.CONST = {
    ATTR_POOL_THRESHOLD: 5,
    HERO_XP_CURVE: [100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 512000, 1024000, 2048000],
    RANK_PROGRESSION: ['C', 'CC', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA', 'S', 'SS', 'SSS'],
    RANK_PHRASES: {
        'C': 'Пробуждение', 'CC': 'Сила крепнет', 'CCC': 'Воля закаляется',
        'B': 'Путь воина', 'BB': 'Сталь и дух', 'BBB': 'Непреклонный',
        'A': 'Мастерство', 'AA': 'Совершенство', 'AAA': 'Величие',
        'S': 'Легенда', 'SS': 'Миф', 'SSS': 'Бессмертный'
    },
    BASE_DAMAGE: 5,
    LOOT_CHANCE: 0.08,
    BOSS_HEAL_ON_FAIL: 8,
    ESCAPE_MAX: 140,
    ROOMS_STEP: 10,
    SAVE_KEY: 'neurodeck_full_save',
    SAVE_VERSION: 4,
    SYNC_VERSION: 'nd-sync-v4',
    MAX_PARTICLES: 500,
    RANK_COLORS: {
        C: { color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.15)', glow: 'rgba(156, 163, 175, 0.5)' },
        B: { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)', glow: 'rgba(96, 165, 250, 0.5)' },
        A: { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', glow: 'rgba(192, 132, 252, 0.5)' },
        S: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.2)', glow: 'rgba(251, 191, 36, 0.7)' }
    },
    ARTIFACTS: {
        swordDiscipline: { id: 'swordDiscipline', name: 'Меч Дисциплины', icon: '⚔', rank: 'A', slot: 'weapon', type: 'Оружие', category: 'weapon', lore: 'Выкован из стали тех обещаний, что ты сдержал.', bonuses: [{ stat: 'str', value: 5, label: '⚔ Сила' }, { stat: 'wil', value: 2, label: '🧘 Воля' }], special: '+10% к урону по боссам' },
        shieldWill: { id: 'shieldWill', name: 'Щит Воли', icon: '🛡', rank: 'A', slot: 'shield', type: 'Щит', category: 'armor', lore: 'Тяжесть этого щита — вес твоих решений.', bonuses: [{ stat: 'end', value: 6, label: '🛡 Стойкость' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: 'Защита стрика +15%' },
        amuletFocus: { id: 'amuletFocus', name: 'Амулет Фокуса', icon: '💠', rank: 'S', slot: 'amulet', type: 'Амулет', category: 'accessory', lore: 'Кристалл, в котором застыло мгновение полной концентрации.', bonuses: [{ stat: 'int', value: 8, label: '🧠 Интеллект' }, { stat: 'wil', value: 3, label: '🧘 Воля' }], special: '+15% XP за привычки' },
        ringCharisma: { id: 'ringCharisma', name: 'Кольцо Обаяния', icon: '💍', rank: 'B', slot: 'ring1', type: 'Кольцо', category: 'accessory', lore: 'Тёплое на ощупь. Люди оборачиваются, когда ты проходишь.', bonuses: [{ stat: 'cha', value: 5, label: '🎭 Харизма' }], special: 'Шанс крита +5%' },
        bootsWanderer: { id: 'bootsWanderer', name: 'Сапоги Странника', icon: '👢', rank: 'B', slot: 'boots', type: 'Обувь', category: 'armor', lore: 'Сто тысяч шагов впитались в эту кожу.', bonuses: [{ stat: 'agi', value: 5, label: '⚡ Ловкость' }, { stat: 'end', value: 2, label: '🛡 Стойкость' }], special: null },
        crownArchon: { id: 'crownArchon', name: 'Корона Архонта', icon: '👑', rank: 'S', slot: 'head', type: 'Головной убор', category: 'armor', lore: 'Не для слабых. Надевший её уже не сможет вернуться.', bonuses: [{ stat: 'str', value: 3, label: '⚔ Сила' }, { stat: 'end', value: 3, label: '🛡 Стойкость' }, { stat: 'int', value: 3, label: '🧠 Интеллект' }, { stat: 'cha', value: 3, label: '🎭 Харизма' }, { stat: 'wil', value: 3, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Все атрибуты +3' },
        capeShadows: { id: 'capeShadows', name: 'Плащ Теней', icon: '🧣', rank: 'A', slot: 'cape', type: 'Плащ', category: 'armor', lore: 'Соткан из тех ночей, когда ты не сдался.', bonuses: [{ stat: 'wil', value: 5, label: '🧘 Воля' }, { stat: 'agi', value: 3, label: '⚡ Ловкость' }], special: 'Невидимость от искушений' },
        chestVirtue: { id: 'chestVirtue', name: 'Кираса Доблести', icon: '🧥', rank: 'A', slot: 'chest', type: 'Нагрудник', category: 'armor', lore: 'Каждая пластина — выигранная битва с собой.', bonuses: [{ stat: 'end', value: 8, label: '🛡 Стойкость' }, { stat: 'str', value: 3, label: '⚔ Сила' }], special: null },
        ringInsight: { id: 'ringInsight', name: 'Кольцо Прозрения', icon: '💎', rank: 'A', slot: 'ring2', type: 'Кольцо', category: 'accessory', lore: 'В его грани отражаются мысли, что ты не успел забыть.', bonuses: [{ stat: 'int', value: 5, label: '🧠 Интеллект' }, { stat: 'cha', value: 2, label: '🎭 Харизма' }], special: null }
    },
    GOAL_REWARDS: {
        short: { xp: 20, dmg: 5, statXp: 1, label: 'Краткая' },
        medium: { xp: 50, dmg: 12, statXp: 2, label: 'Средняя' },
        long: { xp: 120, dmg: 25, statXp: 5, label: 'Долгая' }
    },
    ROOMS: [
        { name: 'Камера заключенного', icon: '⛓', lore: 'Здесь начинается твой путь.' },
        { name: 'Коридор Забытых', icon: '🚪', lore: 'Шаги эхом в пустоте.' },
        { name: 'Склеп Обетов', icon: '💀', lore: 'Здесь погребены обещания.' },
        { name: 'Зал Разбитых Зеркал', icon: '🪞', lore: 'Отражения лжи.' },
        { name: 'Катакомбы Сомнений', icon: '🕳', lore: 'Там, где живут страхи.' },
        { name: 'Пещера Теней', icon: '🌑', lore: 'Тени шепчут твоё имя.' },
        { name: 'Библиотека Рун', icon: '📜', lore: 'Знание — оружие.' },
        { name: 'Тронный Зал', icon: '👑', lore: 'Здесь правил страх.' },
        { name: 'Сад Забытых', icon: '🌺', lore: 'Мечты, что не сбылись.' },
        { name: 'Мост Раскаяния', icon: '🌉', lore: 'Переправа через сомнения.' },
        { name: 'Башня Снов', icon: '🗼', lore: 'Верх мира.' },
        { name: 'Кузница Воли', icon: '⚒', lore: 'Здесь закаляется характер.' },
        { name: 'Алтарь Истины', icon: '🕯', lore: 'Правда о себе.' },
        { name: 'Врата Свободы', icon: '🌅', lore: 'Выход из подземелья.' }
    ],
    MSK_OFFSET_MS: 3 * 60 * 60 * 1000
};

ND.getXpToNext = function(level) {
    var c = ND.CONST.HERO_XP_CURVE;
    if (level - 1 < c.length) return c[level - 1];
    return c[c.length - 1] * Math.pow(2, level - c.length);
};

ND.getNextRank = function(current) {
    var idx = ND.CONST.RANK_PROGRESSION.indexOf(current);
    if (idx === -1 || idx >= ND.CONST.RANK_PROGRESSION.length - 1) return null;
    return ND.CONST.RANK_PROGRESSION[idx + 1];
};

ND.getRankColorInfo = function(rank) {
    var rc = ND.CONST.RANK_COLORS;
    if (rank === 'CC' || rank === 'CCC') return rc.C;
    if (rank === 'BB' || rank === 'BBB') return rc.B;
    if (rank === 'AA' || rank === 'AAA') return rc.A;
    if (rank === 'SS' || rank === 'SSS') return rc.S;
    return rc[rank] || rc.C;
};

ND.esc = function(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

window.ND = ND;
