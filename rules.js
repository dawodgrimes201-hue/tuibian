/* 蜕变 · 语音教练 —— 状态解读与今晚方案（会随你每天的状态改） */
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

function recentChecks(state, date, n = 7) {
  return R.range(date, n).map(d => ({ date: d, c: getCheckin(state, d) })).reverse();
}

function countSym(state, date, sym, n = 7) {
  return recentChecks(state, date, n).filter(x => (x.c.symptoms || []).includes(sym)).length;
}

function avgOf(arr) {
  const a = arr.filter(v => typeof v === 'number' && !isNaN(v));
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}

/* 睡眠小时：优先填的数字，其次由入睡/起床算 */
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

function sessionsIn(state, date, n = 7) {
  const set = new Set(R.range(date, n));
  return (state.sessions || []).filter(s => set.has(s.date));
}

/* ---------- 今晚方案 ---------- */
function tonightPlan(state, date) {
  const c = getCheckin(state, date);
  const wd = R.wd(date);
  const notes = [];
  const diet = [];
  const profile = state.profile || {};
  const intake = profile.intake || {};
  const baseRid = DAY_ROUTINE[wd];
  const baseRoutine = ROUTINES[baseRid];

  const energy = c.energy || 3;                    // 1–5
  const timeMin = c.timeMin || 90;                 // 今晚可给的时间
  const sh = sleepHours(c);
  const syms = c.symptoms || [];
  const belly7 = countSym(state, date, '肚子疼', 7);
  const bellyToday = syms.includes('肚子疼');
  const bellyLevel = c.bellyLevel || 0;
  const backToday = syms.includes('腰酸');
  const legPain = syms.includes('腰疼到腿');
  const drink = !!c.drink;
  const sessions7 = sessionsIn(state, date, 7);

  let level = 'green';
  let statusLabel = '正常日';
  let routineId = baseRid;
  let variant = { mode: 'full' };
  let why = '';
  let whySay = '';
  const redFlags = [];

  if (legPain) {
    level = 'red'; statusLabel = '先别练';
    routineId = 'back10'; variant = { mode: 'light' };
    why = '腰疼到腿/发麻，今天不练负重';
    whySay = '腰疼放射到腿，今天不练负重，只做腰背和走路。';
    redFlags.push('腰疼放射到腿、腿麻无力，或大小便异常：别自己扛，尽快去骨科/急诊（书 6.29）。');
    notes.push({ type: 'danger', t: '这条按「就医优先」处理：今天只做猫牛、鸟狗、靠墙站，别做弯腰负重。' });
  } else if (bellyToday) {
    level = 'yellow'; statusLabel = '肚子不舒服';
    routineId = 'bellyWalk'; why = '今早/今天肚子疼，改成饭后散步';
    whySay = '今天肚子不舒服，先不练力量，改成饭后散步。';
    notes.push({ type: 'warn', t: '肚子疼时不练腹压大的动作，散步 + 腹式呼吸更合适。' });
  } else if (energy <= 2 || (sh !== null && sh < 6) || timeMin <= 30) {
    level = 'yellow'; statusLabel = timeMin <= 30 ? '时间不够' : '减量日';
    if (timeMin <= 30) { routineId = 'minimal20'; why = '今晚时间不到 30 分钟，切保底版'; whySay = '今晚时间不多，换成保底版，做完就算赢。'; }
    else {
      variant = { mode: 'light' };
      why = energy <= 2 ? '今天精力低，减一组、休息加长' : '昨晚睡眠不足 6 小时，减量';
      whySay = energy <= 2 ? '今天精力低，减一组，休息加长。' : '昨晚睡得少，今天减量。';
    }
  } else if (backToday) {
    level = 'yellow'; statusLabel = '腰在闹';
    if (baseRoutine && baseRoutine.kind === 'strength') {
      routineId = 'back10'; why = '腰酸，今天把力量换成腰背专项'; whySay = '腰在闹，今天把力量换成腰背专项。';
    } else { variant = { mode: 'light' }; why = '腰酸，强度降一档'; whySay = '腰酸，今天强度降一档。'; }
  }

  if (drink) {
    if (level === 'green') { level = 'yellow'; statusLabel = '喝酒后'; }
    why = (why ? why + '；' : '') + '喝酒当天不练力量';
    whySay = (whySay ? whySay : '') + '喝酒当天不练力量。';
    notes.push({ type: 'warn', t: '喝酒当天不做力量，只走路和拉伸，多喝水。' });
  }

  /* 饮食与身体建议 */
  if (bellyToday || belly7 >= 2) {
    diet.push({ t: '早饭吃温热的：粥/面/鸡蛋，别空腹喝咖啡、别喝冰的' });
    diet.push({ t: '饭后慢走 10–20 分钟，别马上坐下或躺下' });
    diet.push({ t: '辣的、油腻的、酒，这周先停' });
    if (bellyLevel >= 2) diet.push({ t: '每顿吃七分饱，别吃太快' });
  }
  if (sh !== null && sh < 6.5) {
    diet.push({ t: '下午 2 点以后不喝咖啡/浓茶' });
    notes.push({ type: 'info', t: '睡眠不足时，优先补觉，训练降量。今晚 22:30 前关屏。' });
  }
  if (backToday || legPain) {
    notes.push({ type: 'info', t: '每坐 45 分钟起来 1 分钟；今天不搬重物、不做仰卧起坐和负重转腰。' });
  }
  if (belly7 >= 5) {
    notes.push({ type: 'warn', t: '最近 7 天有 5 天肚子疼：建议挂消化内科，把「什么时候疼、吃了什么」给医生看，必要时查幽门螺杆菌。别自己长期吃胃药。' });
  }

  if (!whySay) {
    whySay = level === 'green' ? '今天状态不错，按计划来。' : '';
  }
  const minRoutine = ROUTINES[routineId] || ROUTINES.minimal20;

  /* 时长估算 */
  const estMin = (rid, v) => {
    const rr = ROUTINES[rid];
    if (!rr) return 20;
    let m = rr.minutes || 20;
    if (v.mode === 'light') m -= 8;
    if (rid === 'minimal20') m = 20;
    return Math.max(8, m);
  };

  const blocks = [];
  blocks.push({
    dim: 'body', key: 'move',
    title: minRoutine.title + (variant.mode === 'light' ? '（减量版）' : ''),
    sub: `约 ${estMin(routineId, variant)} 分钟 · 语音跟练`,
    minutes: estMin(routineId, variant),
    rid: routineId, variant
  });

  if (level !== 'red') {
    blocks.push({
      dim: 'relation', key: 'relation',
      title: relationTask(wd, intake),
      sub: '5 分钟 · 主动一次，不等别人找你',
      minutes: 5,
      voice: ['现在拿出手机，给一个人发一条消息。不用想说什么，就一句：最近怎么样，最近忙不忙。', '发完就放下，不用等回复。']
    });
    blocks.push({
      dim: 'growth', key: 'growth',
      title: '读 20 页 / 听 20 分钟',
      sub: '20 分钟 · 手机放另一个房间',
      minutes: 20,
      voice: ['现在读二十页书。手机放到另一个房间，或者调成勿扰。', '二十页就够，不追求记住，读完就合上。']
    });
  }
  blocks.push({
    dim: 'mind', key: 'mind',
    title: '睡前 3 分钟 · 呼吸 + 一句',
    sub: '5 分钟 · 语音引导，关屏前做',
    minutes: 5, rid: 'sleep3', variant: { mode: 'full' }
  });
  blocks.push({
    dim: 'order', key: 'order',
    title: '10 分钟整理 + 记账',
    sub: '顺手做完，房间和钱都清一点',
    minutes: 10,
    voice: ['十分钟整理。先收桌面，只收看得见的东西。', '然后记账：今天花了多少，两分钟写完。']
  });

  return {
    date, level, statusLabel, why, whySay, notes, diet, blocks,
    routineId, variant, redFlags,
    snapshot: c,
    metrics: {
      energy, timeMin, sleepHours: sh, belly7, bellyToday,
      sessions7: sessions7.length, backToday, legPain
    }
  };
}

function relationTask(wd, intake) {
  const fam = intake.family || '';
  const map = {
    1: '给伴侣发一条消息',
    2: '给孩子/父母打个电话',
    3: '给一个朋友发消息',
    4: '约一个人见面（哪怕下周）',
    5: '家庭通话 10 分钟',
    6: '和一个真人聊 15 分钟'
  };
  if (fam === '一个人') return wd === 6 ? '约一个朋友线下见面' : '给家里打个电话';
  return map[wd] || '给一个人发消息';
}

/* ---------- 这段时间的模式 ---------- */
function insights(state, date) {
  const out = [];
  const checks = recentChecks(state, date, 14);
  const filled = checks.filter(x => Object.keys(x.c).length);
  const bellyDays = checks.filter(x => (x.c.symptoms || []).includes('肚子疼')).length;
  const backDays = checks.filter(x => (x.c.symptoms || []).includes('腰酸')).length;
  const sleepAvg = avgOf(checks.map(x => sleepHours(x.c)));
  const energyAvg = avgOf(checks.map(x => x.c.energy));
  const sess = sessionsIn(state, date, 7).length;
  const checkinDays = filled.length;
  const streak = checkinStreak(state, date);

  if (bellyDays >= 5) {
    out.push({ type: 'danger', t: `最近两周有 ${bellyDays} 天早起/白天肚子疼。这不是「忍一忍」的事：挂号消化内科，带上你的腹痛日记（时间、吃了什么、程度），必要时做幽门螺杆菌检测。` });
  } else if (bellyDays >= 2) {
    out.push({ type: 'warn', t: `最近两周 ${bellyDays} 天肚子疼。先把三个变量管住：空腹咖啡、冰的、辣的。连着记 7 天，看是不是固定在某个时间或某种食物之后。` });
  }
  if (backDays >= 4) out.push({ type: 'warn', t: `两周里 ${backDays} 天腰酸。别只靠拉伸：规律做腰背专项（猫牛/鸟狗/臀桥），比「注意坐姿」有用。` });
  if (checks.filter(x => sleepHours(x.c)).length >= 3 && sleepAvg !== null && sleepAvg < 6.3) out.push({ type: 'warn', t: `近两周平均睡 ${sleepAvg.toFixed(1)} 小时，偏少。先把上床时间提前 30 分钟，比任何补品都值。` });
  if (checks.filter(x => x.c.energy).length >= 3 && energyAvg !== null && energyAvg < 2.5) out.push({ type: 'warn', t: '自评精力长期偏低：先查睡眠和早饭，再谈训练强度。' });
  if (checkinDays === 0) out.push({ type: 'info', t: '还没有状态记录。每天 30 秒勾一下，方案才会按你的状态变。' });
  if (checkinDays >= 5 && sess === 0) out.push({ type: 'info', t: '记录很勤，但一次都没开始练。今晚只做保底 20 分钟，先把「开始」这件事做成。' });
  if (streak >= 7) out.push({ type: 'good', t: `连续记录 ${streak} 天，这个比「练得多」更值钱。` });
  return { items: out, bellyDays, backDays, sleepAvg, energyAvg, sess, checkinDays, streak };
}

function checkinStreak(state, date) {
  let n = 0, d = date;
  for (let i = 0; i < 120; i++) {
    const c = getCheckin(state, d);
    if (!c || !Object.keys(c).length) break;
    n++; d = R.add(d, -1);
  }
  return n;
}

/* ---------- 明日调整预告 ---------- */
function tomorrowHint(state, date) {
  const t = R.add(date, 1);
  const wd = R.wd(t);
  const rid = DAY_ROUTINE[wd];
  const r = ROUTINES[rid];
  const c = getCheckin(state, date);
  const syms = c.symptoms || [];
  if (syms.includes('腰疼到腿')) return { t: '明天先别练，去门诊。', level: 'danger' };
  if (syms.includes('肚子疼')) return { t: '明天如果还疼，运动还是改散步；早饭一定吃热的。', level: 'warn' };
  if ((c.energy || 3) <= 2) return { t: `明天是${r.title}，状态差就自动给你降一档。`, level: 'info' };
  return { t: `明天：${r.title}（${r.minutes} 分钟）。`, level: 'info' };
}
