(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.NeuroDeckRemoteConfig = factory(); root.NDRemoteConfig = root.NeuroDeckRemoteConfig; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    // P15 / C6-full шаг 1 (static): версионированный remote-config эндгейм-модификаторов недели.
    // Артефакт — config/weekly-modifiers.v1.json (schema + version + checksum + expires + modifiers).
    // Контракт безопасности: ЛЮБОЙ сбой (сеть / не JSON / чужая schema / просрочен / checksum не сошёлся /
    // кривые множители) → каталог НЕ меняется, экономика остаётся на встроенном WEEKLY_MODS
    // (stronghold-data.js). Модель дополнительно клампит каждый множитель в (0; 3] (weeklyMult),
    // поэтому даже успешно установленный каталог не может сломать доход/осады.
    // checksum — 2×FNV-1a 32-bit → hex16 над канонической сериализацией modifiers (алгоритм тот же,
    // что ndSnapshotChecksum в storage.js: charCodeAt по UTF-16, Math.imul). Это контроль целостности
    // против случайного дрейфа файла (сверка с коммитом), НЕ подпись: злоумышленник с доступом к файлу
    // пересчитает checksum так же. Подпись — вне скоупа (правило 21: ноль новых зависимостей).
    var SCHEMA_ID = 'neurodeck/weekly-modifiers@1';
    var DEFAULT_URL = 'config/weekly-modifiers.v1.json'; // файл версионируется именем: новые данные = .v2.json + правка здесь
    var MIN_MODS = 1, MAX_MODS = 16; // встроенный каталог — 7; потолок ограничивает объём удалённого файла

    function fnv1a64(s) {
        var a = 0x811c9dc5, b = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charCodeAt(i);
            a = Math.imul(a ^ ch, 16777619) >>> 0;
            b = Math.imul(b ^ (ch + i), 16777619) >>> 0;
        }
        return ('0000000' + a.toString(16)).slice(-8) + ('0000000' + b.toString(16)).slice(-8);
    }

    // Каноническая сериализация записи: фиксированный порядок ключей и приведение типов —
    // одинаковый файл даёт одинаковый checksum на любом движке. Изменение НАБОРА ключей = новая schema.
    function canonModifier(m) {
        return '{"id":' + JSON.stringify(String(m.id)) +
            ',"icon":' + JSON.stringify(String(m.icon)) +
            ',"name":' + JSON.stringify(String(m.name)) +
            ',"desc":' + JSON.stringify(String(m.desc)) +
            ',"mods":{"incomeMult":' + Number(m.mods.incomeMult) +
            ',"upkeepMult":' + Number(m.mods.upkeepMult) +
            ',"siegeMult":' + Number(m.mods.siegeMult) + '}}';
    }
    function canonicalModifiers(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(canonModifier(list[i]));
        return '[' + out.join(',') + ']';
    }
    function checksumOf(list) { return 'fnv1a64:' + fnv1a64(canonicalModifiers(list)); }

    function isMult(v) { return typeof v === 'number' && isFinite(v) && v > 0 && v <= 3; }

    function fail(reason, detail) { return { ok: false, reason: reason, detail: detail }; }

    // Валидация записи: строки для UI + mods {incomeMult, upkeepMult, siegeMult} в (0; 3] —
    // те же границы, что у правил провинций C3 и клампов модели.
    function modifierError(m, i) {
        if (!m || typeof m !== 'object' || Array.isArray(m)) return 'modifiers[' + i + '] не объект';
        if (typeof m.id !== 'string' || !m.id) return 'modifiers[' + i + '].id не непустая строка';
        var uiKeys = ['icon', 'name', 'desc'];
        for (var u = 0; u < uiKeys.length; u++) {
            if (typeof m[uiKeys[u]] !== 'string') return 'modifiers[' + i + '].' + uiKeys[u] + ' не строка';
        }
        if (!m.mods || typeof m.mods !== 'object' || Array.isArray(m.mods)) return 'modifiers[' + i + '].mods не объект';
        var keys = ['incomeMult', 'upkeepMult', 'siegeMult'];
        for (var k = 0; k < keys.length; k++) {
            if (!isMult(m.mods[keys[k]])) return 'modifiers[' + i + '].mods.' + keys[k] + ' не число в (0; 3]';
        }
        return null;
    }

    // Главная валидация. raw — объект ИЛИ строка-JSON (что вернул fetch); now — мс-эпоха для проверки
    // expires (дефолт Date.now()). Чистая функция, сеть не трогает. Порядок проверок: shape → schema →
    // version → modifiers → expires → checksum (checksum последним, по уже проверенному списку).
    function validateWeeklyConfig(raw, now) {
        var obj = raw;
        if (typeof obj === 'string') {
            try { obj = JSON.parse(String(obj).replace(/^\uFEFF/, '')); } catch (e) { return fail('parse', 'не JSON: ' + String(e && e.message || e)); }
        }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return fail('shape', 'конфиг не объект');
        if (obj.schema !== SCHEMA_ID) return fail('schema', 'schema=' + JSON.stringify(obj.schema) + ' ≠ ' + SCHEMA_ID);
        var version = Math.floor(Number(obj.version));
        if (!(isFinite(version) && version >= 1)) return fail('version', 'version=' + JSON.stringify(obj.version) + ' не целое ≥ 1');
        var list = obj.modifiers;
        if (!Array.isArray(list) || list.length < MIN_MODS || list.length > MAX_MODS) {
            return fail('modifiers', 'modifiers не массив из ' + MIN_MODS + '..' + MAX_MODS + ' записей');
        }
        var ids = {};
        for (var i = 0; i < list.length; i++) {
            var err = modifierError(list[i], i);
            if (err) return fail('modifier', err);
            if (ids[list[i].id]) return fail('modifier', 'дубль id "' + list[i].id + '"');
            ids[list[i].id] = true;
        }
        var expiresAt = Date.parse(String(obj.expires));
        if (!isFinite(expiresAt)) return fail('expires', 'expires=' + JSON.stringify(obj.expires) + ' не ISO-дата');
        var nowMs = (typeof now === 'number' && isFinite(now)) ? now : Date.now();
        if (nowMs >= expiresAt) return fail('expired', 'просрочен ' + obj.expires);
        var expected = 'fnv1a64:' + fnv1a64(canonicalModifiers(list));
        if (obj.checksum !== expected) return fail('checksum', 'checksum=' + JSON.stringify(obj.checksum) + ' ≠ ' + expected);
        // Нормализованная копия: только канонические поля, дальше живёт своей жизнью
        var clean = list.map(function(m) {
            return { id: String(m.id), icon: String(m.icon), name: String(m.name), desc: String(m.desc),
                     mods: { incomeMult: Number(m.mods.incomeMult), upkeepMult: Number(m.mods.upkeepMult), siegeMult: Number(m.mods.siegeMult) } };
        });
        return { ok: true, schema: obj.schema, version: version, expires: String(obj.expires), expiresAt: expiresAt, checksum: expected, modifiers: clean };
    }

    // Установка/сброс каталога: модель (weeklyModifierOf) отдаёт приоритет WEEKLY_MODS_REMOTE над
    // встроенным WEEKLY_MODS. Сейв-схему не трогаем — это слой каталога, не состояния.
    function strongholdCatalog() { return (typeof globalThis !== 'undefined' && globalThis.StrongholdData) || null; }
    function installWeeklyModifiers(list) {
        var cat = strongholdCatalog();
        if (!cat || !Array.isArray(list) || !list.length) return false;
        cat.WEEKLY_MODS_REMOTE = list;
        return true;
    }
    function resetWeeklyModifiers() {
        var cat = strongholdCatalog();
        if (cat && cat.WEEKLY_MODS_REMOTE) { delete cat.WEEKLY_MODS_REMOTE; return true; }
        return false;
    }

    // Телеметрия — typeof-гварды (харнессы тянут функции поодиночке; в Node NDTelemetry нет).
    function tel(name, data) {
        try {
            if (typeof NDTelemetry !== 'undefined' && NDTelemetry && typeof NDTelemetry.event === 'function') {
                NDTelemetry.event(name, data);
            }
        } catch (e) {}
    }

    // Лоадер: fetch → validate → install. ВСЕГДА завершается тихо: успех = каталог заменён, любая
    // ошибка = встроенный каталог нетронут (safe fallback). opts: {url, fetch, now} — для тестов.
    function loadWeeklyConfig(opts) {
        opts = (opts && typeof opts === 'object') ? opts : {};
        var url = (typeof opts.url === 'string' && opts.url) ? opts.url : DEFAULT_URL;
        var nowMs = (typeof opts.now === 'number' && isFinite(opts.now)) ? opts.now : Date.now();
        // Аудит R2 M6: `root` — параметр внешней UMD-обёртки, внутри фабрики он не виден, поэтому раньше
        // fetch не находился никогда и лоадер в проде молча отвечал 'no-fetch'. Берём глобал напрямую.
        var holder = (typeof globalThis !== 'undefined') ? globalThis : null;
        var fetchFn = (typeof opts.fetch === 'function') ? opts.fetch
            : ((holder && typeof holder.fetch === 'function') ? holder.fetch.bind(holder) : null);
        if (!fetchFn) return Promise.resolve({ applied: false, reason: 'no-fetch' });
        var timeoutMs = (typeof opts.timeout === 'number' && opts.timeout > 0) ? opts.timeout : 8000;
        return new Promise(function(resolve, reject) { // «висящий» запрос не должен держать лоадер вечно
            var t = setTimeout(function() { reject(new Error('timeout')); }, timeoutMs);
            Promise.resolve().then(function() { return fetchFn(url, { cache: 'no-cache' }); })
                .then(function(r) { clearTimeout(t); resolve(r); }, function(e) { clearTimeout(t); reject(e); });
        }).then(function(res) {
            if (!res || typeof res.text !== 'function' || !res.ok) {
                var code = (res && typeof res.ok === 'boolean') ? ('http ' + res.status) : 'не Response';
                throw new Error(code);
            }
            return res.text();
        }).then(function(text) {
            var v = validateWeeklyConfig(text, nowMs);
            if (!v.ok) {
                tel('nd_config_fallback', { reason: v.reason, detail: v.detail });
                return { applied: false, reason: v.reason, detail: v.detail };
            }
            var installed = installWeeklyModifiers(v.modifiers);
            if (!installed) { tel('nd_config_fallback', { reason: 'no-catalog' }); return { applied: false, reason: 'no-catalog' }; }
            tel('nd_config_apply', { version: v.version, count: v.modifiers.length, expires: v.expires });
            return { applied: true, version: v.version, count: v.modifiers.length, expires: v.expires };
        }).catch(function(e) {
            tel('nd_config_fallback', { reason: 'network', detail: String(e && e.message || e) });
            return { applied: false, reason: 'network', detail: String(e && e.message || e) };
        });
    }

    return {
        SCHEMA_ID: SCHEMA_ID,
        DEFAULT_URL: DEFAULT_URL,
        fnv1a64: fnv1a64,
        canonicalModifiers: canonicalModifiers,
        checksumOf: checksumOf,
        validateWeeklyConfig: validateWeeklyConfig,
        installWeeklyModifiers: installWeeklyModifiers,
        resetWeeklyModifiers: resetWeeklyModifiers,
        loadWeeklyConfig: loadWeeklyConfig
    };
});
