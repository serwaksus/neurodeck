'use strict';
function createScheduler(opts) {
  opts = opts || {};
  const getDb = opts.getDb || (() => opts.db);
  const getBot = opts.getBot || (() => null);
  const onError = opts.onError || ((e) => console.error('[scheduler]', e && e.message));
  let interval = null;
  let lastFireKey = '';
  let lastGoalFireKey = '';

  function mskNowParts() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Moscow', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    const get = (t) => parseInt(parts.find((p) => p.type === t).value, 10);
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
  }
  const mskKey = (p) => `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
  const shouldFireDaily = (p) => p.hour === 21 && p.minute >= 30 && p.minute < 35;

  async function buildDailyReminder(plan) {
    const incompleteCount = (plan && typeof plan.incompleteCount === 'number') ? plan.incompleteCount : 0;
    const until = (plan && typeof plan.untilMinutesLeft === 'number') ? plan.untilMinutesLeft : 90;
    const goals = (plan && Array.isArray(plan.untitledGoals)) ? plan.untitledGoals : [];
    const lines = [`NeuroDeck 🎯 Босс атакует через ${until} мин.`];
    if (incompleteCount > 0) lines.push(`Не выполнено карточек: ${incompleteCount}.`);
    if (goals.length) { lines.push('Цели:'); for (const g of goals.slice(0, 3)) lines.push(' • ' + (g.name || g.id || '(без имени)')); }
    return lines.join('\n');
  }

  async function tick() {
    const db = getDb();
    if (!db) return;
    const bot = getBot();
    if (!bot) return;
    const now = mskNowParts();
    const today = mskKey(now);

    if (shouldFireDaily(now) && lastFireKey !== today) {
      lastFireKey = today;
      const users = Object.values(db.users || {});
      let sent = 0, dropped = 0;
      for (const u of users) {
        if (!u || u.enabled === false) continue;
        const plan = (db.plans && db.plans[u.chat_id] && db.plans[u.chat_id].plan) || null;
        const text = await buildDailyReminder(plan);
        try { await bot.sendMessage(u.chat_id, text); sent++; }
        catch (e) {
          if (e && (e.status === 403 || e.status === 400)) { u.enabled = false; dropped++; }
          onError(e);
        }
      }
      console.log(`[scheduler] daily ${today}: sent ${sent} dropped ${dropped} of ${users.length}`);
    }

    const alertKey = today + '::alerts';
    if (lastGoalFireKey !== alertKey) {
      const nowMins = now.hour * 60 + now.minute;
      let any = false;
      for (const [cid, entry] of Object.entries(db.plans || {})) {
        if (!entry || !entry.plan || !Array.isArray(entry.plan.deadlineAlerts)) continue;
        const user = db.users && db.users[cid];
        if (!user || user.enabled === false) continue;
        for (const goal of entry.plan.deadlineAlerts) {
          if (!goal || !goal.atMinutes) continue;
          if (Math.abs(nowMins - goal.atMinutes) < 1) {
            try { await bot.sendMessage(cid, `⏳ «${goal.name || 'Цель'}» — дедлайн через 30 минут`); any = true; }
            catch (e) { onError(e); }
          }
        }
      }
      if (any) lastGoalFireKey = alertKey;
    }
  }

  function start() {
    if (interval) return;
    interval = setInterval(() => { Promise.resolve(tick()).catch(onError); }, 60_000);
    Promise.resolve(tick()).catch(onError);
  }
  function stop() { if (interval) clearInterval(interval); interval = null; }
  return { start, stop, _tick: tick };
}
module.exports = { createScheduler };
