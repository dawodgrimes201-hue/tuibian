/* 蜕变 · 状态解读：今天练什么、吃多少、要不要减量 */
'use strict';

const R = {
  pad: n => String(n).padStart(2, '0'),
  dstr(d) { return `${d.getFullYear()}-${R.pad(d.getMonth() + 1)}-${R.pad(d.getDate())}`; },
  parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  add(s, n) { const d = R.parse(s); d.setDate(d.getDate() + n); return R.dstr(d); },
  today() { const d = new Date(); d.setHours(0, 0, 0, 0); return R.dstr(d); },
  days(a, b) { return Math.round((R.parse(b) - R.parse(a)) / 86400000); },
  wd(s) { return R.parse(s).getDay(); },
  cn(s) { const d = R.parse(s); return `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`; },
  range(s, n) { const out = []; for (let i = 0; i < n; i++) out.push(R.add(s, -i)); return out; }
};

function getCheckin(state, date) { return (state.checkins && state.checkins[date]) || {}; }
function sleepHours(c) {
  if (typeof c.sleepHours === 'number' && c.sleepHours > 0) return c.sleepHours;
  if (c.sleepAt && c.wakeAt) {
    const [h1, m1] = c.sleepAt.split(':').map(Number);
    const [h2, m2] = c.wakeAt.split(':').map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 1440;
    if (mins > 0 && mins < 900) return Math.round(mins / 6) / 10;
  }
  return null;
}
function avg(a) { const v = a.filter(x => typeof x === 'number' && !isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
function recent(state, date, n = 7) { return R.range(date, n).map(d => ({ date: d, c: getCheckin(state, d) })).reverse(); }
function sessionsIn(state, date, n = 7) {
  const set = new Set(R.range(date, n));
  return (state.sessions || []).filter(s => set.has(s.date));
}
function checkinStreak(state, date) {
  let n = 0, d = date;
  for (let i = 0; i < 200; i++) {
    const c = getCheckin(state, d);
    if (!c || !Object.keys(c).length) break;
    n++; d = R.add(d, -1);
  }
  return n;
}

/* ---------- 热量 ---------- */
function bmr(profile) {
  const p = Object.assign({}, PROFILE_DEFAULT, profile || {});
  return 10 * (p.weight || 80) + 6.25 * (p.height || 178) - 5 * (p.age || 36) + 5;
}
function tdee(profile) { return bmr(profile) * 1.35; }
function calorieTarget(state) {
  const p = Object.assign({}, PROFILE_DEFAULT, state.profile || {});
  const w = p.weight || 80, h = (p.height || 178) / 100;
  const bmi = w / (h * h);
  const t = tdee(p);
  const target = bmi > 24 ? Math.round((t - 400) / 10) * 10 : Math.round((t - 150) / 10) * 10;
  return {
    bmi: Math.round(bmi * 10) / 10,
    bmr: Math.round(bmr(p)),
    tdee: Math.round(t),
    target: Math.max(1500, target),
    protein: Math.round(w * 1.4)
  };
}

/* ---------- 今天的方案 ---------- */
function todayPlan(state, date) {
  const c = getCheckin(state, date);
  const wd = R.wd(date);
  const p = Object.assign({}, PROFILE_DEFAULT, state.profile || {});
  const signals = c.signals || [];
  const energy = c.energy || 3;
  const timeMin = c.timeMin || 45;
  const sh = sleepHours(c);
  let wid = DAY_WORKOUT[wd];
  let mode = 'full';
  const weekNo = Math.floor(R.days(APP.start, date) / 7) + 1;
  const prog = weekNo >= 5 ? 2 : weekNo >= 3 ? 1 : 0;
  let why = '';
  const notes = [];
  const dietNotes = [];
  const cal = calorieTarget(state);

  const has = s => signals.includes(s);

  if (has('腰酸')) {
    wid = 'stretch'; mode = 'light';
    why = '腰酸，今天不练力量，换成拉伸和腰背。';
    notes.push({ type: 'warn', t: '腰酸时别做仰卧起坐、负重转腰；每坐 45 分钟起来 1 分钟。' });
  } else if (has('肚子疼')) {
    wid = 'walk2'; mode = 'light';
    why = '肚子不舒服，今天改快走，别做腹压大的动作。';
    notes.push({ type: 'warn', t: '肚子疼时吃热的、别空腹喝咖啡；如果连着几天都疼，去消化内科看看。' });
  } else if (has('乏力') || energy <= 2) {
    mode = 'light';
    why = '今天精力低，每个动作少一组，休息加长。';
  } else if (sh !== null && sh < 6.3) {
    mode = 'light';
    why = '昨晚睡得少，今天减量。';
  } else if (timeMin <= 20) {
    mode = 'light';
    why = '今晚时间不多，练个缩减版也算完成。';
  } else {
    why = '状态不错，按今天的计划练。';
  }

  const w = WORKOUTS[wid];
  const minutes = estimateMinutes(wid, { mode, prog });

  /* 饮食 */
  const mealPick = i => ({
    breakfast: MEALS.breakfast[i % MEALS.breakfast.length],
    lunch: MEALS.lunch[i % MEALS.lunch.length],
    dinner: MEALS.dinner[i % MEALS.dinner.length],
    snack: MEALS.snack[i % MEALS.snack.length]
  });
  const dayIdx = R.days(APP.start, date);
  const meals = mealPick(Math.abs(dayIdx));
  if (has('肚子疼')) dietNotes.push(...DIET_RULES.belly);
  if (has('腰酸')) dietNotes.push(...DIET_RULES.back);
  if (sh !== null && sh < 6.3) dietNotes.push(...DIET_RULES.sleep);
  if (cal.bmi > 24) dietNotes.push(...DIET_RULES.lose);

  const morning = {
    wid: MORNING_WORKOUT,
    title: WORKOUTS[MORNING_WORKOUT].title,
    minutes: estimateMinutes(MORNING_WORKOUT, { mode: 'full', prog: 0 }),
    done: !!(c.done && c.done.morning)
  };

  return {
    date, wid, title: w.title, minutes, mode, prog, weekNo, morning, why, notes,
    dietNotes: [...new Set(dietNotes)],
    nutrition: { target: cal.target, protein: cal.protein, bmi: cal.bmi, meals },
    level: mode === 'light' ? 'yellow' : 'green',
    statusLabel: mode === 'light' ? '减量日' : '正常日'
  };
}

/* ---------- 勋章 ---------- */
function badgeStats(state, date) {
  const checks = recent(state, date, 30);
  const sessions = sessionsIn(state, date, 30).length;
  const allSessions = (state.sessions || []).length;
  const streak = checkinStreak(state, date);
  const early = (state.checkins ? Object.values(state.checkins) : []).filter(c => c.sleepAt && c.sleepAt <= '22:30').length;
  const stepsDays = (state.checkins ? Object.entries(state.checkins) : []).filter(([d, c]) => (c.steps || 0) >= 8000).length;
  const relation = (state.checkins ? Object.values(state.checkins) : []).filter(c => c.done && c.done.relation).length;
  const read = (state.checkins ? Object.values(state.checkins) : []).filter(c => c.done && c.done.read).length;
  const reviews = Object.keys(state.weekly || {}).length;
  const baseW = (state.profile && state.profile.startWeight) || (state.profile && state.profile.weight) || 80;
  const latestW = (() => {
    for (let i = 0; i < 90; i++) {
      const c = getCheckin(state, R.add(date, -i));
      if (c.weight) return c.weight;
    }
    return null;
  })();
  const lose = latestW ? Math.max(0, baseW - latestW) : 0;
  let noBelly = 0;
  for (let i = 0; i < 60; i++) {
    const c = getCheckin(state, R.add(date, -i));
    if ((c.signals || []).includes('肚子疼')) break;
    if (Object.keys(c).length) noBelly++;
  }
  return {
    sessions, allSessions, streak, early, stepsDays, relation, read, reviews, lose, noBelly
  };
}

function badgeList(state, date) {
  const s = badgeStats(state, date);
  const map = {
    first: s.allSessions, train5: s.allSessions, train20: s.allSessions,
    streak3: s.streak, streak7: s.streak, streak30: s.streak,
    early5: s.early, steps5: s.stepsDays, family10: s.relation,
    read7: s.read, review4: s.reviews, lose1: s.lose, lose3: s.lose,
    nobelly: s.noBelly
  };
  return BADGES.map(b => {
    const cur = Math.min(b.goal, map[b.id] || 0);
    return Object.assign({}, b, { cur, unlocked: cur >= b.goal, pct: Math.round(cur / b.goal * 100) });
  });
}

/* ---------- 提示 ---------- */
function insights(state, date) {
  const out = [];
  const checks = recent(state, date, 14).filter(x => Object.keys(x.c).length);
  const bellyDays = checks.filter(x => (x.c.signals || []).includes('肚子疼')).length;
  const sleepAvg = avg(checks.map(x => sleepHours(x.c)));
  const sess = sessionsIn(state, date, 7).length;
  if (bellyDays >= 5) out.push({ type: 'danger', t: `近两周 ${bellyDays} 天肚子疼。挂消化内科，把疼的时间和吃的东西给医生看。` });
  else if (bellyDays >= 2) out.push({ type: 'warn', t: `近两周 ${bellyDays} 天肚子疼，先把空腹咖啡、冰的、辣的停掉试试。` });
  if (sleepAvg !== null && checks.length >= 3 && sleepAvg < 6.3) out.push({ type: 'warn', t: `近两周平均睡 ${sleepAvg.toFixed(1)} 小时，偏少。先提前 30 分钟上床。` });
  if (checks.length >= 5 && sess === 0) out.push({ type: 'info', t: '记录挺勤，但训练还没开始。今晚只做 10 分钟也算赢。' });
  if (sess >= 3) out.push({ type: 'good', t: `这周已经练了 ${sess} 次，保持。` });
  return out;
}

/* ---------- 睡前呼吸 ---------- */
function sleepTimeline() {
  return [
    { k: 'say', t: '睡前流程。手机放到看不见的地方，坐下来，背挺直。' },
    { k: 'say', t: '腹式呼吸，四拍吸气，两拍停，六拍呼气。跟着做。' },
    { k: 'breath', rounds: 8, inhale: 4, hold: 2, exhale: 6 },
    { k: 'say', t: '好。在心里说一句：今天最难的是什么，我做到了什么。' },
    { k: 'work', secs: 20, label: '心里说一句', cues: [] },
    { k: 'say', t: '今天就到这，去洗漱，关灯。' },
    { k: 'done' }
  ];
}
