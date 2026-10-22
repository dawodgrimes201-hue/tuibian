/* 蜕变 · 界面 */
(function () {
  'use strict';
  const LS = 'tb_v3';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function defaultState() {
    return {
      v: 3,
      profile: Object.assign({}, PROFILE_DEFAULT, { startWeight: 80 }),
      checkins: {}, sessions: [], weekly: {}, unlocked: {},
      settings: { voice: true, persona: 'female', music: true, musicVol: 0.07 }
    };
  }
  let state = load();
  let today = R.today();
  let plan = null;
  let draft = null;
  let player = null;
  let wake = null;
  let meta = null;
  let inited = false;

  function migrateOld(d) {
    try {
      const raw = localStorage.getItem('tb_coach_v2');
      if (!raw) return d;
      const old = JSON.parse(raw);
      if (old.profile) {
        d.profile.weight = old.profile.weight || d.profile.weight;
        d.profile.height = old.profile.height || d.profile.height;
        d.profile.startWeight = old.profile.weight || d.profile.startWeight;
      }
      Object.entries(old.checkins || {}).forEach(([date, c]) => {
        const n = { done: {}, food: [] };
        if (c.sleepHours) n.sleepHours = c.sleepHours;
        if (c.weight) n.weight = c.weight;
        if (c.steps) n.steps = c.steps;
        if (c.energy) n.energy = c.energy;
        if (c.signals) n.signals = c.signals;
        else if (c.symptoms) n.signals = (c.symptoms || []).filter(x => x !== '无');
        if (Object.keys(n).length) d.checkins[date] = n;
      });
      (old.sessions || []).forEach(x => d.sessions.push({ date: x.date, wid: 'walk', ts: x.ts || Date.now() }));
      d.weekly = old.weekly || {};
    } catch (e) {}
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return migrateOld(defaultState());
      const s = JSON.parse(raw);
      const d = defaultState();
      return Object.assign(d, s, {
        profile: Object.assign(d.profile, s.profile || {}),
        settings: Object.assign(d.settings, s.settings || {}),
        checkins: s.checkins || {}, sessions: s.sessions || [],
        weekly: s.weekly || {}, unlocked: s.unlocked || {}
      });
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} }
  const check = (date) => {
    const d = date || today;
    if (!state.checkins[d]) state.checkins[d] = { done: {}, food: [] };
    if (!state.checkins[d].done) state.checkins[d].done = {};
    if (!state.checkins[d].food) state.checkins[d].food = [];
    return state.checkins[d];
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
  }
  function badge(level, text) { return `<span class="badge ${level}">${esc(text)}</span>`; }

  function init() {
    if (inited) return; inited = true;
    TTS.supported && TTS.init();
    TTS.enabled = state.settings.voice;
    if (typeof Voice !== 'undefined') Voice.init(state.settings.persona || 'female').then(() => renderMe());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      const hadCtrl = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadCtrl && !reloaded) { reloaded = true; setTimeout(() => location.reload(), 300); }
      });
    }
    bindNav(); bindPlayer();
    renderAll();
    checkVersion();
    handleStartParam();
    setInterval(() => { const t = R.today(); if (t !== today) { today = t; renderAll(); } }, 30000);
  }

  function handleStartParam() {
    const q = new URLSearchParams(location.search);
    const h = (location.hash || '').replace('#', '');
    const start = q.get('start') || h;
    if (!start) return;
    const go = () => {
      try {
        if (start === 'train') { switchTab('tab-train'); setTimeout(startTraining, 500); }
        else if (start === 'morning') { startMorning(); }
        else if (start === 'sleep') { startSleep(); }
        else if (start === 'diet') { switchTab('tab-diet'); }
      } catch (e) {}
    };
    setTimeout(go, 700);
  }

  async function checkVersion() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const v = await r.json();
      state.build = state.build || '';
      if (v.build && v.build !== state.build) {
        const first = !state.build;
        state.build = v.build; save();
        if (!first) {
          // 清掉外壳缓存（语音缓存保留），然后刷新
          const keys = await caches.keys();
          for (const k of keys) if (k.startsWith('tb-offline-')) await caches.delete(k);
          setTimeout(() => location.reload(), 300);
        }
      }
    } catch (e) {}
  }

  function renderAll() {
    today = R.today();
    plan = todayPlan(state, today);
    renderHero(); renderStatus(); renderThree(); renderMorning(); renderSide(); renderTip();
    renderTrain(); renderDiet(); renderBadge(); renderMe();
  }

  /* ---------- 今天 ---------- */
  function renderHero() {
    const left = Math.max(0, R.days(today, APP.end));
    const st = checkinStreak(state, today);
    const doneTrain = !!(check().done || {}).train;
    $('#topDate').textContent = R.cn(today);
    $('#hero').innerHTML = `
      <div class="days">${left}<em>天后过年</em></div>
      <div class="line">今天：${esc(plan.title)} · ${plan.minutes} 分钟</div>
      <div class="sub">${R.cn(today)} · ${plan.mode === 'light' ? '减量日，做轻一点也算完成' : '正常日，跟着时间练'}</div>
      <div class="badges">
        ${badge(plan.level, plan.statusLabel)}
        ${st ? badge('', `连续记录 ${st} 天`) : ''}
        ${doneTrain ? badge('green', '今天练过了') : ''}
      </div>`;
  }

  function renderStatus() {
    const c = check();
    const el = $('#statusCard');
    if (!c.saved) {
      draft = draft && draft.date === today ? draft : { date: today, sleepHours: 7, energy: 3, timeMin: 45, signals: [] };
      const sleepOpts = [['<5.5', 5], ['5.5–6.5', 6], ['6.5–7.5', 7], ['>7.5', 8]];
      const timeOpts = [[90, '90 分钟'], [60, '1 小时'], [45, '45 分钟'], [20, '20 分钟']];
      el.innerHTML = `<div class="card">
        <h3><span>今天什么状态</span><span class="more">30 秒</span></h3>
        <div class="q"><div class="lab"><span>昨晚睡了多久</span></div>
          <div class="chips" id="dSleep">${sleepOpts.map(o => `<button class="chip" data-v="${o[1]}">${o[0]}</button>`).join('')}</div></div>
        <div class="q"><div class="lab"><span>身上有信号吗（可多选，没有就点「无」）</span></div>
          <div class="chips" id="dSig">${SIGNALS.map(s => `<button class="chip" data-v="${s}">${s}</button>`).join('')}</div></div>
        <div class="q"><div class="lab"><span>今天精力</span></div>
          <div class="chips" id="dEnergy">${[1, 2, 3, 4, 5].map(n => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div></div>
        <div class="q"><div class="lab"><span>今天能练多久</span></div>
          <div class="chips" id="dTime">${timeOpts.map(o => `<button class="chip" data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>
        <button class="btn" id="btnPlanNow">生成今天的安排</button>
      </div>`;
      pickOne($('#dSleep'), el.querySelector(`#dSleep .chip[data-v="${draft.sleepHours}"]`));
      pickOne($('#dEnergy'), el.querySelector(`#dEnergy .chip[data-v="${draft.energy}"]`));
      pickOne($('#dTime'), el.querySelector(`#dTime .chip[data-v="${draft.timeMin}"]`));
      draft.signals.forEach(s => { const b = el.querySelector(`#dSig .chip[data-v="${s}"]`); if (b) b.classList.add('on'); });
      $$('#dSleep .chip', el).forEach(b => b.onclick = () => { draft.sleepHours = +b.dataset.v; pickOne($('#dSleep'), b); });
      $$('#dEnergy .chip', el).forEach(b => b.onclick = () => { draft.energy = +b.dataset.v; pickOne($('#dEnergy'), b); });
      $$('#dTime .chip', el).forEach(b => b.onclick = () => { draft.timeMin = +b.dataset.v; pickOne($('#dTime'), b); });
      $$('#dSig .chip', el).forEach(b => b.onclick = () => {
        const v = b.dataset.v;
        if (v === '无') {
          b.classList.add('on');
          $$('#dSig .chip', el).forEach(x => { if (x !== b) x.classList.remove('on'); });
          draft.signals = [];
          return;
        }
        b.classList.toggle('on');
        el.querySelector('#dSig .chip[data-v="无"]').classList.remove('on');
        draft.signals = $$('#dSig .chip.on', el).map(x => x.dataset.v);
      });
      $('#btnPlanNow').onclick = saveStatus;
      return;
    }
    const sig = (c.signals || []).length ? c.signals.join('、') : '没什么';
    el.innerHTML = `<div class="card">
      <h3><span>今天的状态</span><span class="more">已按状态调整</span></h3>
      <div class="badges">
        ${badge('', `睡 ${c.sleepHours || '—'} 小时`)}
        ${badge('', `精力 ${c.energy || 3}`)}
        ${badge('', `可练 ${c.timeMin || 45} 分钟`)}
        ${badge((c.signals || []).length ? 'yellow' : '', sig)}
      </div>
      <button class="btn ghost small" id="btnResetStatus" style="margin-top:12px">改一下</button>
    </div>`;
    $('#btnResetStatus').onclick = () => { delete c.saved; save(); renderAll(); };
  }
  function pickOne(wrap, el) { if (!wrap || !el) return; wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); el.classList.add('on'); }

  function saveStatus() {
    const c = check();
    c.sleepHours = draft.sleepHours;
    c.energy = draft.energy;
    c.timeMin = draft.timeMin;
    c.signals = draft.signals.slice();
    c.saved = true;
    save(); renderAll(); toast('已按状态排好今天');
  }

  function renderThree() {
    const c = check();
    const w = WORKOUTS[plan.wid];
    const eaten = foodTotal().kcal;
    const doneTrain = !!c.done.train;
    const doneSleep = !!c.done.sleep;
    $('#threeCard').innerHTML = `<div class="card">
      <h3><span>今天三件事</span><span class="more">做一件也算赢</span></h3>
      <div class="rows">
        <div class="row-item ${doneTrain ? 'done' : ''}">
          <div class="ico">◎</div>
          <div class="txt"><div class="t1">训练 · ${esc(plan.title)}</div>
            <div class="t2">${plan.minutes} 分钟${plan.mode === 'light' ? ' · 减量版' : ''}</div></div>
          ${doneTrain ? `<div class="tick on">✓</div>` : `<button class="go" id="btnStartTrain">开始</button>`}
        </div>
        <div class="row-item">
          <div class="ico">◍</div>
          <div class="txt"><div class="t1">吃对 · ${eaten} / ${plan.nutrition.target} kcal</div>
            <div class="t2">蛋白目标 ${plan.nutrition.protein} g</div></div>
          <button class="go" id="btnGoDiet">记一笔</button>
        </div>
        <div class="row-item ${doneSleep ? 'done' : ''}">
          <div class="ico">☾</div>
          <div class="txt"><div class="t1">睡前 · 3 分钟呼吸</div>
            <div class="t2">关屏前做，语音带着呼吸</div></div>
          ${doneSleep ? `<div class="tick on">✓</div>` : `<button class="go" id="btnSleep">开始</button>`}
        </div>
      </div>
    </div>`;
    $('#btnStartTrain').onclick = startTraining;
    $('#btnGoDiet').onclick = () => switchTab('tab-diet');
    $('#btnSleep').onclick = startSleep;
  }

  function renderMorning() {
    const el = $('#morningCard');
    if (!el) return;
    const m = plan.morning;
    el.innerHTML = `<div class="card">
      <h3><span>晨间 · 八段锦</span><span class="more">${m.done ? '今天做完了' : '约 ' + m.minutes + ' 分钟'}</span></h3>
      <div class="hint" style="margin-bottom:8px">八式，每式约一分钟，跟着口令和呼吸做。早上做最好，晚上想放松也可以。</div>
      <button class="btn ghost" id="btnMorning">${m.done ? '再做一次' : '开始八段锦'}</button>
    </div>`;
    $('#btnMorning').onclick = startMorning;
  }

  function renderSide() {
    const c = check();
    const items = [
      { k: 'relation', n: '给一个人发条消息', s: '伴侣 / 孩子 / 父母 / 朋友' },
      { k: 'read', n: '读 20 页', s: '手机放另一个房间' },
      { k: 'order', n: '收拾 10 分钟 + 记账', s: '桌面、账单' }
    ];
    $('#sideCard').innerHTML = `<div class="card">
      <h3><span>顺手三件</span><span class="more">不做也不扣分</span></h3>
      <div class="rows">${items.map(i => `
        <div class="row-item ${c.done[i.k] ? 'done' : ''}">
          <div class="txt"><div class="t1">${i.n}</div><div class="t2">${i.s}</div></div>
          <div class="tick ${c.done[i.k] ? 'on' : ''}" data-side="${i.k}">${c.done[i.k] ? '✓' : '○'}</div>
        </div>`).join('')}</div>
    </div>`;
    $$('#sideCard [data-side]').forEach(t => t.onclick = () => {
      const k = t.dataset.side;
      const cc = check();
      if (cc.done[k]) delete cc.done[k]; else cc.done[k] = Date.now();
      save(); renderSide(); checkNewBadges();
    });
  }

  function renderTip() {
    const i = Math.abs(R.days(APP.start, today)) % TIPS.length;
    $('#tipCard').innerHTML = `<div class="card"><h3><span>今天一条</span></h3>
      <div class="hint" style="font-size:14px;color:var(--tx);line-height:1.7">${esc(TIPS[i].t)}</div></div>`;
  }

  /* ---------- 训练 ---------- */
  function startTraining() {
    const w = WORKOUTS[plan.wid];
    meta = { type: 'train', wid: plan.wid };
    openPlayer(w.title, plan.wid, { mode: plan.mode, prog: plan.prog }, state.settings.music ? resolveSound(w.music) : null);
  }
  function resolveSound(def) {
    const s = state.settings.sound;
    return (!s || s === 'auto') ? (def || 'waves') : s;
  }

  function startMorning() {
    const m = WORKOUTS[plan.morning.wid];
    meta = { type: 'morning', wid: plan.morning.wid };
    openPlayer(m.title, plan.morning.wid, { mode: 'full', prog: 0 }, state.settings.music ? resolveSound(m.music) : null);
  }

  function startSleep() {
    meta = { type: 'sleep' };
    openPlayer('睡前 3 分钟', sleepTimeline(), null, state.settings.music ? 'calm' : null);
  }

  function openPlayer(title, widOrTimeline, variant, musicMode) {
    $('#player').classList.add('on');
    $('#pTitle').textContent = title;
    $('#pBig').textContent = '准备开始';
    $('#pSub').textContent = '';
    $('#pBar').style.width = '0';
    $('#pPause').textContent = '暂停';
    $('#pMusic').classList.toggle('on', !!musicMode);
    requestWake();
    const resumeOnTap = () => {
      try {
        if (Beep.ctx && Beep.ctx.state === 'suspended') Beep.ctx.resume();
        TTS.unlock();
      } catch (e) {}
      document.removeEventListener('touchstart', resumeOnTap);
      document.removeEventListener('click', resumeOnTap);
    };
    document.addEventListener('touchstart', resumeOnTap, { once: true });
    document.addEventListener('click', resumeOnTap, { once: true });
    player = new CoachPlayer({
      onState: s => {
        if (s.label) $('#pBig').textContent = s.label;
        if (s.sub !== undefined) $('#pSub').textContent = s.sub;
        if (typeof s.pct === 'number') $('#pBar').style.width = Math.round(Math.min(1, s.pct) * 100) + '%';
        $('#pPause').textContent = s.paused ? '继续' : '暂停';
      },
      onDone: () => finishPlayer()
    });
    player.play(widOrTimeline, variant || { mode: 'full' }, { music: musicMode });
  }

  function finishPlayer() {
    const m = meta || {};
    const c = check();
    if (m.type === 'train') {
      c.done.train = Date.now();
      state.sessions.push({ date: today, wid: m.wid, ts: Date.now() });
      save(); toast('练完了，记下了');
    } else if (m.type === 'sleep') {
      c.done.sleep = Date.now();
      save(); toast('今天到这，睡个好觉');
    } else if (m.type === 'morning') {
      c.done.morning = Date.now();
      state.sessions.push({ date: today, wid: m.wid, ts: Date.now() });
      save(); toast('八段锦做完了');
    }
    checkNewBadges();
    setTimeout(() => { closePlayer(); renderAll(); }, 800);
  }

  function closePlayer() {
    if (player) { player.stop(); player = null; }
    TTS.stop(); Music.stop();
    $('#player').classList.remove('on');
    releaseWake(); meta = null;
  }

  async function requestWake() {
    try {
      if ('wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); $('#pNote').textContent = '屏幕保持常亮'; }
      else $('#pNote').textContent = '请保持屏幕亮着';
    } catch (e) { $('#pNote').textContent = '请保持屏幕亮着'; }
  }
  function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

  function bindPlayer() {
    $('#pClose').onclick = closePlayer;
    $('#pStop').onclick = closePlayer;
    $('#pPause').onclick = () => { if (player) player.togglePause(); };
    $('#pMusic').onclick = () => {
      if (Music.playing) { Music.stop(); $('#pMusic').classList.remove('on'); }
      else if (meta && meta.type === 'train') { Music.start((WORKOUTS[meta.wid] || {}).music || 'calm'); $('#pMusic').classList.add('on'); }
      else { Music.start('calm'); $('#pMusic').classList.add('on'); }
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && $('#player').classList.contains('on')) requestWake();
    });
  }

  function renderTrain() {
    const w = WORKOUTS[plan.wid];
    const c = check();
    const done = !!c.done.train;
    const moves = [];
    (w.blocks || []).forEach(b => {
      if (b.k === 'ex') {
        const ex = EX[b.ex];
        moves.push(`<div class="mv"><div class="n">${esc(ex.n)}</div><div class="s">${b.sets} 组 × ${b.secs} 秒 · 休 ${b.rest} 秒${b.sides ? ' ×2 侧' : ''}</div></div>`);
      } else if (b.k === 'walk') {
        moves.push(`<div class="mv"><div class="n">${esc(b.name)}</div><div class="s">${Math.round(b.secs / 60)} 分钟</div></div>`);
      } else if (b.k === 'warmup' || b.k === 'cool') {
        const ex = EX[b.ex];
        moves.push(`<div class="mv"><div class="n">${esc(b.name || ex.n)}</div><div class="s">${b.secs >= 60 ? Math.round(b.secs / 60) + ' 分钟' : b.secs + ' 秒'}</div></div>`);
      }
    });
    const hist = (state.sessions || []).slice(-7).reverse().map(s => {
      const ww = WORKOUTS[s.wid] || {};
      return `<div class="kv"><span>${esc(s.date.slice(5))}</span><span>${esc(ww.title || s.wid)}</span></div>`;
    }).join('') || '<div class="empty">还没有训练记录</div>';

    $('#trainCard').innerHTML = `<div class="card">
      <h3><span>今天的训练</span><span class="more">${done ? '已完成' : '跟着时间走'}</span></h3>
      <div class="hero" style="padding:6px 0 2px">
        <div class="line" style="font-size:20px">${esc(plan.title)}${plan.mode === 'light' ? '（减量）' : ''}</div>
        <div class="sub">约 ${plan.minutes} 分钟 · ${w.music === 'calm' ? '舒缓音乐' : '可开背景音乐'}</div>
      </div>
      <div class="q"><div class="lab"><span>背景音乐</span></div>
        <div class="chips">
          <button class="chip ${state.settings.music ? 'on' : ''}" id="cMusic">开</button>
          <button class="chip ${state.settings.music ? '' : 'on'}" id="cMusicOff">关</button>
        </div></div>
      <button class="btn" id="btnTrainStart">${done ? '再练一次' : '开始训练'}</button>
      <div class="hint" style="margin-top:8px">口令告诉你：第几组、做多久、休息多久。手机放旁边，屏幕自动常亮。</div>
    </div>
    <div class="card"><h3><span>今天练什么</span></h3>${moves.join('')}
      <div class="hint" style="margin-top:10px">${esc(plan.why)}</div></div>
    <div class="card"><h3><span>最近训练</span></h3>${hist}</div>`;
    $('#btnTrainStart').onclick = startTraining;
    $('#cMusic').onclick = () => { state.settings.music = true; save(); renderTrain(); };
    $('#cMusicOff').onclick = () => { state.settings.music = false; save(); renderTrain(); };
  }

  /* ---------- 饮食 ---------- */
  function foodTotal() {
    const c = check();
    return (c.food || []).reduce((s, f) => ({ kcal: s.kcal + (f.kcal || 0), p: s.p + (f.p || 0) }), { kcal: 0, p: 0 });
  }

  function renderDiet() {
    const c = check();
    const t = foodTotal();
    const target = plan.nutrition.target;
    const pct = Math.min(1, t.kcal / target);
    const rr = 42, C = 2 * Math.PI * rr;
    const dash = C * pct;
    const cal = calorieTarget(state);
    $('#calCard').innerHTML = `<div class="card">
      <h3><span>今天的热量</span><span class="more">目标 ${target} kcal</span></h3>
      <div class="cal">
        <div class="ring">
          <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="${rr}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
            <circle cx="48" cy="48" r="${rr}" fill="none" stroke="#4cc9a4" stroke-width="8" stroke-linecap="round" stroke-dasharray="${dash} ${C}"/>
          </svg>
          <div class="num"><b>${t.kcal}</b><span>已摄入</span></div>
        </div>
        <div class="info">
          <div class="k">还可以吃</div>
          <div class="v"><b>${Math.max(0, target - t.kcal)}</b> kcal</div>
          <div class="k" style="margin-top:10px">蛋白质 ${t.p} / ${plan.nutrition.protein} g</div>
          <div class="bar"><i style="width:${Math.min(100, Math.round(t.p / plan.nutrition.protein * 100))}%"></i></div>
        </div>
      </div>
      <div class="hint" style="margin-top:10px">基础代谢 ${Math.round(bmr(state.profile))} kcal · 日常消耗约 ${cal.tdee} kcal · BMI ${plan.nutrition.bmi}</div>
    </div>`;

    const meals = plan.nutrition.meals;
    const mealRow = (key, name, icon) => {
      const m = meals[key];
      return `<div class="row-item">
        <div class="ico">${icon}</div>
        <div class="txt"><div class="t1">${name} · ${m.kcal} kcal</div><div class="t2">${esc(m.t)}</div></div>
        <button class="go" data-meal="${key}">吃了</button>
      </div>`;
    };
    $('#mealCard').innerHTML = `<div class="card"><h3><span>今天建议这么吃</span><span class="more">点「吃了」直接记</span></h3>
      <div class="rows">
        ${mealRow('breakfast', '早饭', '☀')}
        ${mealRow('lunch', '午饭', '◐')}
        ${mealRow('dinner', '晚饭', '☾')}
        ${mealRow('snack', '加餐', '◌')}
      </div></div>`;
    $$('[data-meal]').forEach(b => b.onclick = () => {
      const m = meals[b.dataset.meal];
      addFood({ n: m.t, kcal: m.kcal, p: m.p });
    });

    const eatenRows = (c.food || []).map((f, i) => `<div class="eaten"><span>${esc(f.n)}</span>
      <span>${f.kcal} kcal <button data-del="${i}">删</button></span></div>`).join('');
    $('#foodCard').innerHTML = `<div class="card">
      <h3><span>快速记一笔</span><span class="more">点一次加一份</span></h3>
      <div class="foods" id="foodChips">${FOODS.slice(0, 12).map((f, i) => `<button class="food" data-food="${i}">${esc(f.n)}</button>`).join('')}</div>
      <button class="btn ghost small" id="btnMoreFood" style="margin-top:10px">更多食物</button>
      <div style="margin-top:12px">${eatenRows || '<div class="hint">今天还没记吃的。</div>'}</div>
    </div>`;
    $$('#foodChips [data-food]').forEach(b => b.onclick = () => addFood(FOODS[+b.dataset.food]));
    $('#btnMoreFood').onclick = showAllFoods;
    $$('#foodCard [data-del]').forEach(b => b.onclick = () => {
      const c2 = check(); c2.food.splice(+b.dataset.del, 1); save(); renderDiet(); renderThree();
    });

    const notes = plan.dietNotes || [];
    $('#dietNoteCard').innerHTML = notes.length ? `<div class="card"><h3><span>根据你的状态</span></h3>
      ${notes.map(n => `<div class="note info"><span>i</span><div>${esc(n)}</div></div>`).join('')}</div>` : '';
  }

  function addFood(f) {
    const c = check();
    c.food.push({ n: f.n, kcal: f.kcal || 0, p: f.p || 0, at: Date.now() });
    save(); renderDiet(); renderThree();
    toast(`+ ${f.kcal || 0} kcal`);
  }

  function showAllFoods() {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = `<h3><span>全部食物</span></h3>
      <div class="foods">${FOODS.map((f, i) => `<button class="food" data-food2="${i}">${esc(f.n)} · ${f.kcal}</button>`).join('')}</div>`;
    $('#foodCard').appendChild(wrap);
    $('#btnMoreFood').style.display = 'none';
    $$('#foodCard [data-food2]').forEach(b => b.onclick = () => addFood(FOODS[+b.dataset.food2]));
  }

  /* ---------- 勋章 ---------- */
  function checkNewBadges() {
    const list = badgeList(state, today);
    let got = null;
    list.forEach(b => { if (b.unlocked && !state.unlocked[b.id]) { state.unlocked[b.id] = today; got = b; } });
    if (got) { save(); toast(`获得勋章：${got.name}`); Beep.unlock(); Beep.finish(); }
  }

  function renderBadge() {
    const s = badgeStats(state, today);
    const list = badgeList(state, today);
    $('#badgeStats').innerHTML = `<div class="stats">
      <div class="stat"><div class="k">连续记录</div><div class="v">${s.streak}<small>天</small></div></div>
      <div class="stat"><div class="k">累计训练</div><div class="v">${s.allSessions}<small>次</small></div></div>
      <div class="stat"><div class="k">本周训练</div><div class="v">${sessionsIn(state, today, 7).length}<small>次</small></div></div>
    </div>`;
    $('#badgeGrid').innerHTML = `<div class="card"><h3><span>勋章墙</span><span class="more">${list.filter(b => b.unlocked).length} / ${list.length}</span></h3>
      <div class="grid3">${list.map(b => `
        <div class="medal ${b.unlocked ? 'on' : ''}">
          <div class="em">${b.icon}</div>
          <div class="nm">${esc(b.name)}</div>
          <div class="ds">${esc(b.unlocked ? b.desc : `${b.cur}/${b.goal}`)}</div>
          ${b.unlocked ? '' : `<div class="p"><i style="width:${b.pct}%"></i></div>`}
        </div>`).join('')}</div></div>`;

    const pts = [];
    for (let i = 29; i >= 0; i--) {
      const d = R.add(today, -i); const c = state.checkins[d];
      if (c && c.weight) pts.push({ w: c.weight });
    }
    let svg = `<text x="150" y="55" text-anchor="middle" fill="#5b6684" font-size="11">记两次体重就能看到曲线</text>`;
    if (pts.length >= 2) {
      const ws = pts.map(p => p.w);
      const min = Math.min(...ws) - 0.5, max = Math.max(...ws) + 0.5;
      const P = pts.map((p, i) => `${(12 + i / (pts.length - 1) * 276).toFixed(1)},${(92 - (p.w - min) / (max - min) * 70).toFixed(1)}`).join(' ');
      svg = `<polyline fill="none" stroke="#4cc9a4" stroke-width="2.2" points="${P}"/>`;
    }
    const bars = [];
    for (let i = 13; i >= 0; i--) {
      const d = R.add(today, -i);
      const h = sleepHours(state.checkins[d] || {});
      bars.push(`<div><i style="height:${h ? Math.min(100, h / 9 * 100) : 2}%"></i><span>${R.wd(d)}</span></div>`);
    }
    $('#chartCard').innerHTML = `<div class="card"><h3><span>体重</span><span class="more">目标 ${state.profile.targetLow}–${state.profile.targetHigh} kg</span></h3>
      <svg class="chart" viewBox="0 0 300 105" preserveAspectRatio="none">${svg}</svg></div>
      <div class="card"><h3><span>睡眠（近 14 天）</span></h3><div class="bars">${bars.join('')}</div></div>
      <div class="card"><h3><span>军师看到的事</span></h3>
        ${insights(state, today).map(x => `<div class="note ${x.type}"><span>i</span><div>${esc(x.t)}</div></div>`).join('') || '<div class="empty">记录几天后这里会有发现</div>'}</div>`;
  }

  /* ---------- 我 ---------- */
  function renderMe() {
    const p = state.profile;
    $('#meCard').innerHTML = `<div class="card">
      <h3><span>我的基线</span></h3>
      <div class="row2">
        <div class="field"><label>年龄</label><input type="number" id="meAge" value="${p.age || 36}"></div>
        <div class="field"><label>身高 cm</label><input type="number" id="meH" value="${p.height || 178}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>体重 kg</label><input type="number" step="0.1" id="meW" value="${p.weight || 80}"></div>
        <div class="field"><label>目标体重 kg</label><input type="number" step="0.1" id="meTW" value="${p.targetLow || 74}"></div>
      </div>
      <button class="btn ghost" id="btnSaveProfile" style="margin-top:12px">保存</button>
    </div>`;

    $('#voiceCard').innerHTML = `<div class="card">
      <h3><span>语音与音乐</span><span class="more" id="voiceName">—</span></h3>
      <div class="row-item" style="padding-top:4px">
        <div class="txt"><div class="t1">训练语音</div><div class="t2">只在训练时说话，其他时候不念</div></div>
        <div class="switch ${state.settings.voice ? 'on' : ''}" id="swVoice"></div>
      </div>
      <div class="q"><div class="lab"><span>音色</span></div>
        <div class="chips" id="personaChips">
          <button class="chip" data-p="female">女声</button>
          <button class="chip" data-p="male">男声</button>
        </div></div>
      <div class="q"><div class="lab"><span>背景声音</span></div>
        <div class="chips" id="soundChips">
          <button class="chip" data-s="auto">自动</button>
          <button class="chip" data-s="rain">雨</button>
          <button class="chip" data-s="wind">风</button>
          <button class="chip" data-s="waves">海浪</button>
        </div></div>
      <div class="row-item">
        <div class="txt"><div class="t1">背景音乐</div><div class="t2">走路、拉伸时更明显</div></div>
        <div class="switch ${state.settings.music ? 'on' : ''}" id="swMusic"></div>
      </div>
      <div class="field"><label>音乐音量 <b id="volVal">${Math.round((state.settings.musicVol || 0.07) * 100)}</b>%</label>
        <input type="range" id="inVol" min="0" max="20" step="1" value="${Math.round((state.settings.musicVol || 0.07) * 100)}"></div>
      <button class="btn ghost small" id="btnTestVoice">试听一句</button>
    </div>`;

    $('#dataCard').innerHTML = `<div class="card">
      <h3><span>离线语音包</span><span class="more" id="offlineState">—</span></h3>
      <div class="hint" style="margin-bottom:8px">下载一次，之后没网也能跟着练。</div>
      <button class="btn ghost" id="btnOffline">下载 / 补齐离线包</button>
    </div>
    <div class="card">
      <h3><span>到点提醒（快捷指令）</span></h3>
      <div class="hint" style="margin-bottom:8px">用 iPhone 快捷指令做定时提醒，点一下直接进训练，不写日历、随时能删。</div>
      <div class="kv"><span>直接开始训练</span><span id="lnkTrain" style="font-size:11px;word-break:break-all">—</span></div>
      <button class="btn ghost small" id="btnCopyTrain" style="margin-top:8px">复制训练链接</button>
      <div class="hint" style="margin-top:10px">设置：快捷指令 → 自动化 → 特定时间 → 添加操作「打开 URL」→ 粘贴上面的链接 → 关掉「运行前询问」。</div>
    </div>
    <div class="card">
      <h3><span>数据</span></h3>
      <div class="row2">
        <button class="btn ghost" id="btnExport">导出</button>
        <label class="btn ghost" style="text-align:center;cursor:pointer">导入<input type="file" id="fileImport" accept="application/json" style="display:none"></label>
      </div>
      <button class="btn ghost" id="btnReset" style="margin-top:10px;color:var(--red);border-color:rgba(255,92,122,.4)">清空所有数据</button>
      <div class="hint" style="margin-top:8px">数据只存在这台手机里。</div>
      <hr class="hr">
      <div class="kv"><span>版本</span><span id="buildTag">—</span></div>
      <button class="btn ghost small" id="btnCheckUpdate" style="margin-top:8px">检查更新</button>
    </div>`;

    $('#btnSaveProfile').onclick = () => {
      state.profile.age = +$('#meAge').value || 36;
      state.profile.height = +$('#meH').value || 178;
      const w = +$('#meW').value;
      if (w) { if (!state.profile.startWeight) state.profile.startWeight = w; state.profile.weight = w; }
      state.profile.targetLow = +$('#meTW').value || 74;
      save(); renderAll(); toast('已保存');
    };
    $('#swVoice').onclick = () => {
      state.settings.voice = !state.settings.voice;
      TTS.enabled = state.settings.voice;
      $('#swVoice').classList.toggle('on', state.settings.voice);
      save();
    };
    $$('#soundChips .chip').forEach(b => {
      b.classList.toggle('on', (state.settings.sound || 'auto') === b.dataset.s);
      b.onclick = () => {
        state.settings.sound = b.dataset.s;
        save(); renderMe();
        if (Music.playing) { Music.start(resolveSound('waves')); }
      };
    });
    $('#swMusic').onclick = () => {
      state.settings.music = !state.settings.music;
      $('#swMusic').classList.toggle('on', state.settings.music);
      save(); renderTrain();
    };
    $('#inVol').oninput = e => {
      state.settings.musicVol = +e.target.value / 100;
      Music.setVolume(state.settings.musicVol);
      $('#volVal').textContent = e.target.value;
      save();
    };
    $$('#personaChips .chip').forEach(b => {
      b.classList.toggle('on', b.dataset.p === (state.settings.persona || 'female'));
      b.onclick = () => {
        state.settings.persona = b.dataset.p;
        if (typeof Voice !== 'undefined') Voice.setPersona(b.dataset.p);
        save(); renderMe();
        TTS.unlock(); TTS.stop(); speakSeq(['准备好了就开始，跟着屏幕上的时间做。']);
      };
    });
    $('#btnTestVoice').onclick = () => { TTS.unlock(); Beep.unlock(); TTS.stop(); speakSeq(['准备开始。跟着屏幕上的时间做，动作慢一点。']); };
    $('#btnOffline').onclick = downloadPack;
    $('#btnExport').onclick = exportData;
    $('#fileImport').onchange = e => importData(e.target.files[0]);
    $('#btnReset').onclick = () => { if (confirm('清空所有记录？')) { localStorage.removeItem(LS); state = defaultState(); renderAll(); toast('已清空'); } };

    const trainLink = location.origin + location.pathname + '?start=train';
    const lnk = $('#lnkTrain'); if (lnk) lnk.textContent = trainLink;
    const cp = $('#btnCopyTrain');
    if (cp) cp.onclick = async () => {
      try { await navigator.clipboard.writeText(trainLink); toast('链接已复制'); }
      catch (e) {
        const ta = document.createElement('textarea');
        ta.value = trainLink; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove(); toast('链接已复制');
      }
    };
    $('#buildTag').textContent = state.build || '首次运行';
    $('#btnCheckUpdate').onclick = async () => {
      try {
        const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        const v = await r.json();
        if (v.build && v.build !== state.build) {
          state.build = v.build; save();
          const keys = await caches.keys();
          for (const k of keys) if (k.startsWith('tb-offline-')) await caches.delete(k);
          toast('发现新版，正在更新');
          setTimeout(() => location.reload(), 500);
        } else if (navigator.serviceWorker) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
          toast('已经是最新版');
        }
      } catch (e) { toast('检查失败，可能没网'); }
    };
    const useClip = typeof Voice !== 'undefined' && Voice.ready;
    $('#voiceName').textContent = useClip ? `神经语音 ${Voice.count()} 句` : '系统语音';
    refreshOffline();
  }

  let seqToken = 0;
  async function speakSeq(arr) {
    const my = ++seqToken;
    for (const t of arr) { if (my !== seqToken) return; await TTS.say(t); await new Promise(r => setTimeout(r, 120)); }
  }

  async function refreshOffline() {
    const el = $('#offlineState');
    if (!el || !('caches' in window)) return;
    try {
      const cache = await caches.open('tb-audio-v1');
      const m = await (await fetch('voice/manifest.json', { cache: 'no-store' })).json();
      const map = m.maps[state.settings.persona || 'female'] || {};
      const keys = Object.keys(map);
      let have = 0;
      for (let i = 0; i < keys.length; i += 30) {
        const part = keys.slice(i, i + 30).map(t => new URL(map[t], location.href).href);
        have += (await Promise.all(part.map(k => cache.match(k)))).filter(Boolean).length;
      }
      el.textContent = `${have} / ${keys.length}`;
      // 顺手清掉旧版本留下的语音（省空间）
      try {
        const valid = new Set(Object.values(map).map(rel => new URL(rel, location.href).href));
        const all = await cache.keys();
        for (const req of all) {
          if (req.url.endsWith('.mp3') && !valid.has(req.url)) await cache.delete(req);
        }
      } catch (e) {}
    } catch (e) { el.textContent = '—'; }
  }

  async function downloadPack() {
    const btn = $('#btnOffline');
    btn.disabled = true;
    try {
      const m = await (await fetch('voice/manifest.json', { cache: 'no-store' })).json();
      const map = m.maps[state.settings.persona || 'female'] || {};
      const items = Object.values(map);
      const cache = await caches.open('tb-audio-v1');
      let done = 0;
      const queue = items.slice();
      const worker = async () => {
        while (queue.length) {
          const rel = queue.shift();
          try {
            const url = new URL(rel, location.href).href;
            if (!(await cache.match(url))) {
              const res = await fetch(rel, { cache: 'no-store' });
              if (res.ok) await cache.put(url, res.clone());
            }
          } catch (e) {}
          done++;
          if (done % 10 === 0) btn.textContent = `下载中 ${done} / ${items.length}`;
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      btn.textContent = '重新检查 / 补齐';
      toast('离线包好了，断网也能练');
    } catch (e) { toast('下载失败，再试一次'); }
    btn.disabled = false;
    refreshOffline();
  }

  function exportData() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `蜕变数据-${today}.json`;
    a.click();
    toast('已导出');
  }
  function importData(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try { state = Object.assign(defaultState(), JSON.parse(r.result)); save(); renderAll(); toast('导入成功'); }
      catch (e) { toast('文件读不出来'); }
    };
    r.readAsText(file);
  }

  /* ---------- 导航 ---------- */
  function switchTab(id) {
    const btn = $$('.nav button').find(b => b.dataset.tab === id);
    if (btn) btn.click();
  }
  function bindNav() {
    $$('.nav button').forEach(b => b.onclick = () => {
      $$('.nav button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      $$('.tab').forEach(t => t.classList.remove('on'));
      $('#' + b.dataset.tab).classList.add('on');
      window.scrollTo({ top: 0 });
      if (b.dataset.tab === 'tab-diet') renderDiet();
      if (b.dataset.tab === 'tab-badge') renderBadge();
      if (b.dataset.tab === 'tab-me') renderMe();
      if (b.dataset.tab === 'tab-train') renderTrain();
      if (b.dataset.tab === 'tab-today') renderThree();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
