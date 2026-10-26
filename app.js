/* 蜕变 · 界面 */
(function () {
  'use strict';
  const LS = 'tb_v3';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* 数据层：本机 本机用 /api/state；CloudBase 静态托管用云函数 state（免 本机） */
  const STATE_API = '/api/state';
  const ROLE = 'me';
  const IS_CLOUD = true;   // GitHub Pages 构建：数据走 CloudBase HTTP API
  const CLOUD_API = 'https://tuibian-d3gj3n4b28974e14a.service.tcloudbase.com/stateapi';
  const CLOUD_KEY = '8f3c2a7d91b64e05a1c7d2e934b8f60c';
  async function cbState(action, payload) {
    const r = await fetch(CLOUD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ key: CLOUD_KEY, action }, payload || {}))
    });
    return r.ok ? await r.json() : {};
  }
  function fullState() {
    return {
      v: state.v, profile: state.profile, checkins: state.checkins, sessions: state.sessions,
      weekly: state.weekly, unlocked: state.unlocked, settings: state.settings,
      ratings: state.ratings, challenge: state.challenge, customFoods: state.customFoods,
      workoutLog: state.workoutLog, myName: state.myName, rules: state.rules, aiDone: state.aiDone || [], updatedAt: state.updatedAt || 0
    };
  }
  let pushTimer = null, lastPushAt = 0;
  function scheduleStatePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushState(); }, 2000);
  }
  async function pushState() {
    try {
      state.updatedAt = Date.now();
      if (IS_CLOUD) {
        const res = await cbState('put', { state: fullState(), updated: state.updatedAt });
        if (!res || !res.ok) return false;
      } else {
        const r = await fetch(STATE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: ROLE, state: fullState(), updated: state.updatedAt })
        });
        if (!r.ok) return false;
      }
      lastPushAt = Date.now(); updateBackupLabel();
      save({ silent: true });   // 只把 updatedAt 落盘，不再触发推送
      return true;
    } catch (e) { console.warn('pushState', e); return false; }
  }
  async function pullState(quiet) {
    try {
      if (IS_CLOUD) {
        const res = await cbState('get', {});
        if (!res || !res.ok) { if (!quiet) toast('连不上云备份'); return null; }
        return { ok: true, state: res.state || null, updated: res.updated || null };
      }
      const r = await fetch(STATE_API + '?role=' + ROLE, { cache: 'no-store' });
      if (!r.ok) { if (!quiet) toast('连不上云端备份'); return null; }
      const d = await r.json();
      return d && d.ok ? d : null;
    } catch (e) { if (!quiet) toast('连不上备份'); return null; }
  }
  function applyRestore(d) {
    const s = d.state || {};
    const next = defaultState();
    ['profile', 'checkins', 'sessions', 'weekly', 'unlocked', 'settings', 'ratings', 'challenge',
     'customFoods', 'workoutLog', 'myName', 'rules', 'aiDone', 'updatedAt'].forEach(k => {
      if (s[k] !== undefined && s[k] !== null) next[k] = k === 'settings' ? Object.assign(next.settings, s[k]) : s[k];
    });
    next.build = state.build;
    state = next;
    save(); renderAll();
    toast('已从云恢复');
  }
  function updateBackupLabel() {
    const el = $('#backupAt'); if (!el) return;
    const t = lastPushAt || state.updatedAt || 0;
    el.textContent = t ? new Date(t).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没有';
  }
  async function maybeRestore() {
    const d = await pullState(true);
    if (!d) return;
    const localDays = Object.keys(state.checkins || {}).length;
    const s = d.state;
    if (!s) { pushState(); return; }                 // 主库还没有：用本机初始化
    const serverDays = Object.keys(s.checkins || {}).length;
    if (!localDays && serverDays) { applyRestore(d); return; }
    if ((d.updated || 0) > (state.updatedAt || 0) + 60000 && serverDays >= localDays && serverDays > 0) {
      openSheet('云端有更新的备份', `<div class="hint">云端有一份 ${serverDays} 天记录的备份，更新于 ${new Date((d.updated || 0)).toLocaleString('zh-CN')}；这台手机本地是 ${localDays} 天。</div>
        <button class="btn" id="rsYes" style="margin-top:12px">用云端的覆盖本机</button>
        <button class="btn ghost" id="rsNo" style="margin-top:8px">保留本机</button>`, sheet => {
        $('#rsYes', sheet).onclick = () => { applyRestore(d); closeSheet(); };
        $('#rsNo', sheet).onclick = () => { closeSheet(); pushState(); };
      });
      return;
    }
    pushState();                                     // 本机不旧：把本机推上去
  }
  async function openRestoreSheet() {
    const d = await pullState(false);
    if (!d) return;
    if (!d.state) { toast('云端还没有备份'); return; }
    const days = Object.keys(d.state.checkins || {}).length;
    openSheet('从云恢复', `<div class="hint">云端：${days} 天记录，更新于 ${new Date(d.updated || 0).toLocaleString('zh-CN')}。<br>恢复会覆盖这台手机当前的数据。</div>
      <button class="btn" id="rsYes" style="margin-top:12px">覆盖本机</button>
      <button class="btn ghost" id="rsNo" style="margin-top:8px">取消</button>`, sheet => {
      $('#rsYes', sheet).onclick = () => { applyRestore(d); closeSheet(); };
      $('#rsNo', sheet).onclick = closeSheet;
    });
  }

  function defaultState() {
    return {
      v: 3,
      profile: Object.assign({}, PROFILE_DEFAULT, { startWeight: 80 }),
      checkins: {}, sessions: [], weekly: {}, unlocked: {},
      settings: { voice: true, persona: 'female', music: true, musicVol: 0.18 }, aiDone: [],
      rules: { anchor: '20:30', weeklyGoal: 5, standardMin: 45, minMin: 30, makeup: '21:30', makeupMax: 1 }
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
  let pendingReload = false;
  let photos = {};   // 蜕变照片：存 IndexedDB，不进 localStorage

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
      if (!raw) {
        try {
          const b = JSON.parse(localStorage.getItem(LS + '_backup') || 'null');
          if (b && b.raw) { const restored = JSON.parse(b.raw); restored.__restored = true; return restored; }
        } catch (e) {}
        return migrateOld(defaultState());
      }
      const s = JSON.parse(raw);
      const d = defaultState();
      const mergedSettings = Object.assign(d.settings, s.settings || {});
      if (typeof mergedSettings.musicVol !== 'number' || isNaN(mergedSettings.musicVol)) mergedSettings.musicVol = 0.18;
      mergedSettings.musicVol = Math.max(0, Math.min(0.4, mergedSettings.musicVol));
      return Object.assign(d, s, {
        profile: Object.assign(d.profile, s.profile || {}),
        settings: mergedSettings,
        checkins: s.checkins || {}, sessions: s.sessions || [],
        weekly: s.weekly || {}, unlocked: s.unlocked || {}, aiDone: s.aiDone || [],
        rules: Object.assign({ anchor: '20:30', weeklyGoal: 5, standardMin: 45, minMin: 30, makeup: '21:30', makeupMax: 1 }, s.rules || {})
      });
    } catch (e) { return defaultState(); }
  }
  let saveWarned = false;
  function save(opts) {
    try {
      const raw = JSON.stringify(state);
      localStorage.setItem(LS, raw);
      localStorage.setItem(LS + '_backup', JSON.stringify({ ts: Date.now(), raw }));
    } catch (e) {
      console.error('save failed', e);
      if (!saveWarned) { saveWarned = true; toast('存储空间不足，先导出备份'); }
    }
    if (!(opts && opts.silent)) scheduleStatePush();
  }
  const check = (date) => {
    const d = date || today;
    if (!state.checkins[d]) state.checkins[d] = { done: {}, food: [] };
    if (!state.checkins[d].done) state.checkins[d].done = {};
    if (!state.checkins[d].food) state.checkins[d].food = [];
    if (!state.checkins[d].meals) state.checkins[d].meals = {};
    if (!state.checkins[d].five) state.checkins[d].five = { diet: {} };
    if (!state.checkins[d].five.diet) state.checkins[d].five.diet = {};
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
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
    TTS.supported && TTS.init();
    TTS.enabled = state.settings.voice;
    if (typeof Voice !== 'undefined') Voice.init(state.settings.persona || 'female').then(() => renderMe()).catch(() => {});
    loadPhotos();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      const hadCtrl = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadCtrl || reloaded) return;
        reloaded = true;
        if ($('#player') && $('#player').classList.contains('on')) { pendingReload = true; return; }
        setTimeout(() => location.reload(), 300);
      });
    }
    bindNav(); bindPlayer();
    try { if (typeof Music !== 'undefined') Music.setVolume(state.settings.musicVol || 0.18); } catch (e) {}
    renderAll();
    const bf = $('#bootFallback'); if (bf) bf.style.display = 'none';
    checkVersion();
    handleStartParam();
    setTimeout(maybeRestore, 1200);
    setInterval(() => { const t = R.today(); if (t !== today) { today = t; renderAll(); } }, 30000);
  }

  function handleStartParam() {
    const q = new URLSearchParams(location.search);
    const h = (location.hash || '').replace('#', '');
    const start = q.get('start') || h;
    if (!start) return;
    const go = () => {
      try {
        if (start === 'train') { switchTab('tab-train'); setTimeout(startTraining, 300); }
        else if (start === 'morning') { startMorning(); }
        else if (start === 'sleep') { startSleep(); }
        else if (start === 'diet') { switchTab('tab-diet'); }
      } catch (e) {}
    };
    // iOS 规定音频必须来自用户手势：深链/快捷指令进来先让用户点一下
    const needsTap = (start === 'train' || start === 'sleep' || start === 'morning') &&
      typeof navigator.userActivation !== 'undefined' && !navigator.userActivation.hasBeenActive;
    if (!needsTap) { setTimeout(go, 700); return; }
    const mask = document.createElement('div');
    mask.style.cssText = 'position:fixed;inset:0;z-index:200;background:#080b12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;text-align:center';
    mask.innerHTML = `<div style="font-size:22px;font-weight:800">到时间了</div>
      <div style="color:#8b95b0;font-size:14px;line-height:1.7">点一下开始，声音才会出来（iPhone 的要求）。</div>
      <button id="tapStart" style="margin-top:8px;padding:16px 34px;border-radius:16px;background:#f0b429;color:#1a1305;font-size:17px;font-weight:800">开始</button>`;
    document.body.appendChild(mask);
    $('#tapStart').onclick = () => { mask.remove(); go(); };
  }

  function checkOriginBanner() {
    try {
      const CANON = 'https://macbook-pro-7.tail57206e.ts.net';
      const h = location.hostname;
      if (h === 'macbook-pro-7.tail57206e.ts.net' || h === '127.0.0.1' || h === 'localhost') return;
      const bar = document.createElement('div');
      bar.className = 'originbar';
      bar.innerHTML = `<span>当前不是主地址（${esc(h)}），这里的数据不跟主地址互通。</span>
        <a href="${CANON}/">去主地址</a><button id="obClose" aria-label="关闭">✕</button>`;
      document.body.prepend(bar);
      const b = $('#obClose'); if (b) b.onclick = () => bar.remove();
    } catch (e) {}
  }

  async function checkVersion(manual) {
    let v = null;
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) v = await r.json();
    } catch (e) {}
    const cur = state.build || '';
    const tag = $('#buildTag'); if (tag) tag.textContent = cur || '首次运行';
    const sv = $('#srvBuild'); if (sv) sv.textContent = v && v.build ? v.build : '连不上';
    if (!v || !v.build) { if (manual) toast('连不上服务器，检查网络'); return; }
    if (!cur) { state.build = v.build; save(); return; }   // 首次只记录
    if (v.build !== cur) {
      if (manual) toast('发现新版，正在更新…');
      state.build = v.build; save();
      try { const regs = await navigator.serviceWorker.getRegistrations(); for (const reg of regs) await reg.unregister(); } catch (e) {}
      // 只清外壳缓存，语音包（tb-audio-v1）保留
      try { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('tb-offline-')).map(k => caches.delete(k))); } catch (e) {}
      if ($('#player') && $('#player').classList.contains('on')) {
        pendingReload = true; if (manual) toast('新版已就绪，练完自动更新'); return;
      }
      setTimeout(() => location.replace(location.pathname + '?v=' + encodeURIComponent(v.build)), 200);
      return;
    }
    if (manual) toast('已是最新');
  }
  async function forceUpdate() {
    if (!confirm('强制更新会清掉离线缓存（语音包会保留），然后重新加载。继续？')) return;
    try { const regs = await navigator.serviceWorker.getRegistrations(); for (const reg of regs) await reg.unregister(); } catch (e) {}
    try { const keys = await caches.keys(); await Promise.all(keys.filter(k => k.startsWith('tb-offline-')).map(k => caches.delete(k))); } catch (e) {}
    location.replace(location.pathname + '?force=' + Date.now());
  }


  function safeRender(fn) {
    try { fn(); } catch (e) { console.error('render failed:', fn.name, e); }
  }
  function renderAll() {
    today = R.today();
    plan = todayPlan(state, today);
    [renderHero, renderSixGrid, renderStatus, renderThree, renderTip,
     renderTrain, renderDiet, renderBadge, renderExtras, renderMe].forEach(safeRender);
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
    const eaten = foodTotal().kcal;
    const doneTrain = !!c.done.train;
    const doneSleep = !!c.done.sleep;
    const stopped = plan.mode === 'stop';
    const notes = (plan.notes || []).slice();
    $('#threeCard').innerHTML = `<div class="card">
      <h3><span>今天三件事</span><span class="more">做一件也算赢</span></h3>
      <div class="rows">
        <div class="row-item ${doneTrain ? 'done' : ''}">
          <div class="ico">◎</div>
          <div class="txt"><div class="t1">训练 · ${esc(plan.title)}</div>
            <div class="t2">${stopped ? '今天先不练，先看医生' : plan.minutes + ' 分钟' + (plan.mode === 'light' ? ' · 减量版' : '')}</div></div>
          ${doneTrain ? `<div class="tick on">✓</div>` : (stopped ? '' : `<button class="go" id="btnStartTrain">开始</button>`)}
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
      ${notes.map(n => `<div class="note ${n.type || 'info'}"><span>i</span><div>${esc(n.t)}</div></div>`).join('')}
    </div>`;
    const bStart = $('#btnStartTrain'); if (bStart) bStart.onclick = startTraining;
    const bDiet = $('#btnGoDiet'); if (bDiet) bDiet.onclick = () => switchTab('tab-diet');
    const bSleep = $('#btnSleep'); if (bSleep) bSleep.onclick = startSleep;
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
    if (plan.mode === 'stop') { toast('今天先别练，身体信号需要先看医生'); return; }
    const w = WORKOUTS[plan.wid];
    meta = { type: 'train', wid: plan.wid };
    openPlayer(w.title, plan.wid, { mode: plan.mode, prog: plan.prog }, state.settings.music ? resolveSound(w.music) : null);
  }
  function resolveSound(def) {
    const s = state.settings.sound;
    return (!s || s === 'auto') ? (def || 'waves') : s;
  }

  function startMorningAudio() {
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
    if (pendingReload) { pendingReload = false; setTimeout(() => location.reload(), 400); }
  }

  async function requestWake() {
    try {
      if (wake && !wake.released) return;
      if ('wakeLock' in navigator) {
        wake = await navigator.wakeLock.request('screen');
        $('#pNote').textContent = '屏幕保持常亮';
        wake.addEventListener && wake.addEventListener('release', () => {
          wake = null;
          // 被系统/低电量释放后，页面还在前台就再申请一次
          if ($('#player').classList.contains('on') && document.visibilityState === 'visible') setTimeout(requestWake, 800);
        });
      } else {
        $('#pNote').textContent = '请手动关掉自动锁屏';
      }
    } catch (e) { $('#pNote').textContent = '请手动关掉自动锁屏'; }
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
      const open = $('#player').classList.contains('on');
      if (document.visibilityState === 'hidden') {
        // 切后台=暂停，避免 iOS 节流导致计时错位；顺手把最新数据推到 Mac
        if (open && player && !player.paused) player.togglePause();
        pushState();
        return;
      }
      if (!open) return;
      requestWake();
      try { if (Beep.ctx && Beep.ctx.state !== 'running') Beep.ctx.resume(); } catch (e) {}
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
      <button class="btn ghost" id="btnQuickAdd" style="margin-top:12px">＋ 快速记一笔（自己加也行）</button>
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
        <div class="switch ${state.settings.voice ? 'on' : ''}" id="swVoice" role="switch" aria-checked="${state.settings.voice ? 'true' : 'false'}" tabindex="0"></div>
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
        <div class="switch ${state.settings.music ? 'on' : ''}" id="swMusic" role="switch" aria-checked="${state.settings.music ? 'true' : 'false'}" tabindex="0"></div>
      </div>
      <div class="field"><label>音乐音量 <b id="volVal">${Math.round((state.settings.musicVol == null ? 0.18 : state.settings.musicVol) * 100)}</b>%</label>
        <input type="range" id="inVol" min="0" max="40" step="1" value="${Math.round((state.settings.musicVol == null ? 0.18 : state.settings.musicVol) * 100)}"></div>
      <button class="btn ghost small" id="btnTestVoice">试听一句</button>
    </div>`;

    const recCount = Object.keys(state.checkins || {}).length;
    const lastTs = (() => { try { return JSON.parse(localStorage.getItem(LS + '_backup') || '{}').ts; } catch (e) { return null; } })();
    $('#dataCard').innerHTML = `<div class="card">
      <h3><span>数据自检</span><span class="more">${recCount} 天记录</span></h3>
      <div class="kv"><span>当前地址</span><span style="font-size:11px;word-break:break-all">${esc(location.host)}</span></div>
      <div class="kv"><span>最后保存</span><span>${lastTs ? new Date(lastTs).toLocaleString('zh-CN') : '还没保存'}</span></div>
      <div class="kv"><span>本地备份</span><span>${lastTs ? '有' : '无'}</span></div>
      <div class="kv"><span>云端备份</span><span id="backupAt">—</span></div>
      <div class="row2" style="margin-top:8px">
        <button class="btn ghost" id="btnBackupNow">备份到云</button>
        <button class="btn ghost" id="btnRestore">从云恢复</button>
      </div>
      <div class="hint" style="margin-top:8px">数据会在 2 秒内自动备份到云；换手机、清缓存、换地址后打开会自动恢复。也可以随时导出当外部备份。</div>
    </div>
    <div class="card">
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
      <div class="kv"><span>当前版本</span><span id="buildTag">—</span></div>
      <div class="kv"><span>服务器版本</span><span id="srvBuild">—</span></div>
      <button class="btn ghost small" id="btnCheckUpdate" style="margin-top:8px">检查更新</button>
      <button class="btn ghost small" id="btnForceUpdate" style="margin-top:8px">强制更新（清缓存）</button>
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
    const bbk = $('#btnBackupNow'); if (bbk) bbk.onclick = async () => {
      const ok = await pushState();
      toast(ok ? '已备份到云' : '备份失败，检查网络');
    };
    const brs = $('#btnRestore'); if (brs) brs.onclick = openRestoreSheet;
    updateBackupLabel();
    $('#fileImport').onchange = e => { importData(e.target.files[0]); e.target.value = ''; };
    $('#btnReset').onclick = () => {
      if (!confirm('清空这台手机上的所有记录？清空前建议先导出备份。')) return;
      try { localStorage.removeItem(LS); localStorage.removeItem(LS + '_backup'); localStorage.removeItem('tb_partner'); localStorage.removeItem('tb_coach_v2'); } catch (e) {}
      clearPhotos();
      state = defaultState();
      save(); renderAll(); toast('已清空');
    };

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
    $('#btnForceUpdate').onclick = forceUpdate;
    $('#btnCheckUpdate').onclick = () => checkVersion(true);
;
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
      // 顺手清掉旧版本留下的语音（省空间）；两套音色都保留
      try {
        const allRel = Object.values(m.maps || {}).flatMap(mp => Object.values(mp || {}));
        const valid = new Set(allRel.map(rel => new URL(rel, location.href).href));
        const all = await cache.keys();
        for (const req of all) {
          if (/\.mp3($|\?)/.test(req.url) && !valid.has(req.url)) await cache.delete(req);
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
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.href = url;
    a.download = `蜕变数据-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('已导出');
  }
  function importData(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('bad file');
        const next = defaultState();
        next.profile = Object.assign({}, PROFILE_DEFAULT, parsed.profile || {});
        next.settings = Object.assign({}, next.settings, parsed.settings || {});
        next.checkins = parsed.checkins && typeof parsed.checkins === 'object' ? parsed.checkins : {};
        next.sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
        next.ratings = parsed.ratings && typeof parsed.ratings === 'object' ? parsed.ratings : {};
        next.challenge = parsed.challenge && typeof parsed.challenge === 'object' ? parsed.challenge : {};
        next.customFoods = Array.isArray(parsed.customFoods) ? parsed.customFoods : [];
        next.workoutLog = parsed.workoutLog && typeof parsed.workoutLog === 'object' ? parsed.workoutLog : {};
        next.role = parsed.role || '';
        next.myName = parsed.myName || '';
        next.unlocked = parsed.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {};
        state = next;
        save(); renderAll(); toast('导入成功');
      } catch (e) { toast('文件读不出来'); }
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
      if (b.dataset.tab === 'tab-badge') { renderBadge(); renderExtras(); }
      if (b.dataset.tab === 'tab-me') renderMe();
      if (b.dataset.tab === 'tab-train') renderTrain();
      if (b.dataset.tab === 'tab-today') renderThree();
    });
  }


  /* ================= v2.1 升级：首页 / 饮食 / 训练 / 进度 ================= */
  const DIMS6 = [
    { key: 'body', name: '训练', color: '#4cc9a4' },
    { key: 'diet', name: '饮食', color: '#f5c451' },
    { key: 'mind', name: '心力', color: '#6aa9ff' },
    { key: 'relation', name: '关系', color: '#ff7a9c' },
    { key: 'order', name: '秩序', color: '#b98cff' },
    { key: 'growth', name: '见识', color: '#6fe3e1' }
  ];
  function dimState() {
    const c = check();
    const meals = c.meals || {};
    return {
      body: !!(c.done || {}).train,
      diet: Object.values(meals).some(m => m.status) || (c.food || []).length > 0,
      mind: !!(c.done || {}).sleep,
      relation: !!(c.done || {}).relation,
      order: !!(c.done || {}).order,
      growth: !!(c.done || {}).read
    };
  }

  /* ---------- 弹层 ---------- */
  let sheetEl = null;
  function openSheet(title, body, onOpen) {
    closeSheet();
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `<div class="sheet"><div class="grab"></div><div class="sheet-head"><div class="sheet-title">${esc(title)}</div><button class="sheet-close">✕</button></div><div class="sheet-body">${body}</div></div>`;
    document.body.appendChild(mask); sheetEl = mask;
    $('.sheet-close', mask).onclick = closeSheet;
    mask.onclick = e => { if (e.target === mask) closeSheet(); };
    if (onOpen) onOpen(mask);
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    if (sheetEl) {
      const onClose = sheetEl.__onClose;
      sheetEl.remove(); sheetEl = null;
      if (typeof onClose === 'function') { try { onClose(); } catch (e) {} }
    }
    document.body.style.overflow = '';
  }

  function confetti() {
    const cv = $('#confetti'); if (!cv) return;
    const ctx = cv.getContext('2d'); cv.width = innerWidth; cv.height = innerHeight; cv.classList.add('on');
    const colors = ['#f5c451', '#4cd7a5', '#6aa9ff', '#ff7a9c', '#b98cff', '#6fe3e1'];
    const ps = Array.from({ length: 120 }, () => ({ x: innerWidth / 2, y: innerHeight * .35, vx: (Math.random() - .5) * 12, vy: Math.random() * -13 - 2, r: 2 + Math.random() * 4, c: colors[Math.floor(Math.random() * 6)], a: 1 }));
    let f = 0;
    (function loop() {
      f++; ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += .35; p.a -= .012; ctx.globalAlpha = Math.max(0, p.a); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });
      if (f < 110) requestAnimationFrame(loop); else cv.classList.remove('on');
    })();
  }

  /* ---------- 首页 ---------- */
  function renderHero() {
    const left = Math.max(0, R.days(today, APP.end));
    const st = checkinStreak(state, today);
    const c = check();
    const d = dimState();
    const doneN = Object.values(d).filter(Boolean).length;
    const cx = 100, cy = 100, r = 76, w = 13;
    let ring = '';
    DIMS6.forEach((dm, i) => {
      const a1 = (-90 + i * 60 + 4) * Math.PI / 180, a2 = (-90 + i * 60 + 56) * Math.PI / 180;
      const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)], p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
      ring += `<path d="M${p1[0]} ${p1[1]} A${r} ${r} 0 0 1 ${p2[0]} ${p2[1]}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${w}" stroke-linecap="round"/>`;
      if (d[dm.key]) ring += `<path d="M${p1[0]} ${p1[1]} A${r} ${r} 0 0 1 ${p2[0]} ${p2[1]}" fill="none" stroke="${dm.color}" stroke-width="${w}" stroke-linecap="round" style="filter:drop-shadow(0 0 7px ${dm.color}88)"/>`;
    });
    $('#topDate').textContent = R.cn(today);
    $('#hero').innerHTML = `
      <div class="hero2">
        <div class="ringwrap"><svg viewBox="0 0 200 200">${ring}</svg>
          <div class="c"><b>${doneN}<span>/6</span></b><em>今天六维</em></div></div>
        <div class="hinfo">
          <div class="days">${left}<em>天后过年</em></div>
          <div class="line">今天：${esc(plan.title)}${plan.mode === 'stop' ? '' : ' · ' + plan.minutes + ' 分钟'}</div>
          <div class="badges">
            ${badge(plan.level, plan.statusLabel)}
            ${st ? badge('', `连续 ${st} 天`) : ''}
            ${c.done.train ? badge('green', '练过了') : ''}
          </div>
        </div>
      </div>
      <div class="quickbar">
        <button data-q="food"><span>🍚</span>记饮食</button>
        <button data-q="train"><span>▲</span>训练</button>
        <button data-q="water"><span>💧</span>喝水</button>
        <button data-q="note"><span>✎</span>记一笔</button>
      </div>`;
    $$('#hero .quickbar button').forEach(b => b.onclick = () => {
      const q = b.dataset.q;
      if (q === 'food') { switchTab('tab-diet'); setTimeout(() => openFoodSearch(guessMealKey()), 80); }
      if (q === 'train') { switchTab('tab-train'); if (plan.mode !== 'stop') setTimeout(startTraining, 120); }
      if (q === 'water') { addWater(1); toast('+1 杯水'); renderHero(); renderDiet(); }
      if (q === 'note') openQuickNote();
    });
  }
  function guessMealKey() {
    const h = new Date().getHours();
    return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack';
  }

  /* ---------- 饮食 ---------- */
  function foodTotal() {
    const c = check();
    const skipped = c.meals || {};
    return (c.food || []).filter(f => !(f.meal && skipped[f.meal] && skipped[f.meal].status === 'skipped'))
      .reduce((s, f) => ({ kcal: s.kcal + (f.kcal || 0), p: s.p + (f.p || 0) }), { kcal: 0, p: 0 });
  }
  function mealItems(key) { return (check().food || []).filter(f => f.meal === key); }
  function mealStatus(key) { return ((check().meals || {})[key] || {}).status || ''; }

  function eatSuggestion(key) {
    const m = plan.nutrition.meals[key];
    addFood({ n: m.t, kcal: m.kcal, p: m.p }, key);
    const c = check(); c.meals = c.meals || {}; c.meals[key] = { status: 'eaten' };
    save(); renderDiet(); renderThree(); renderHero(); toast('已记 ' + m.t);
  }
  function skipMeal(key) {
    const reasons = ['不饿', '太忙', '在断食', '没来得及'];
    openSheet('这顿没吃', `<div class="seg" id="skipSeg">${reasons.map((x, i) => `<button data-r="${x}" class="${i === 0 ? 'on' : ''}">${x}</button>`).join('')}</div>
      <div class="hint" style="margin-top:10px">跳过不计热量。忙、不饿、断食都正常，不是失败。</div>
      <button class="btn" id="skipSave" style="margin-top:14px">记「没吃」</button>`, sheet => {
      let reason = reasons[0];
      $$('#skipSeg button', sheet).forEach(b => b.onclick = () => { reason = b.dataset.r; $$('#skipSeg button', sheet).forEach(x => x.classList.toggle('on', x === b)); });
      $('#skipSave', sheet).onclick = () => {
        const c = check(); c.meals = c.meals || {};
        c.food = (c.food || []).filter(f => f.meal !== key);
        c.meals[key] = { status: 'skipped', reason }; save(); closeSheet();
        renderDiet(); renderThree(); renderHero(); toast('已记「没吃」');
      };
    });
  }
  function clearMeal(key) {
    const c = check(); c.meals = c.meals || {}; delete c.meals[key];
    c.food = (c.food || []).filter(f => f.meal !== key); save(); renderDiet(); renderThree(); renderHero();
  }

  function renderDiet() {
    const c = check();
    const t = foodTotal();
    const target = plan.nutrition.target;
    const pct = Math.min(1, t.kcal / target);
    const rr = 42, C = 2 * Math.PI * rr;
    const cal = calorieTarget(state);
    $('#calCard').innerHTML = `<div class="card kcal2">
      <h3><span>今天的热量</span><span class="more">目标 ${target} kcal</span></h3>
      <div class="cal">
        <div class="ring"><svg width="96" height="96" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="${rr}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/>
          <circle cx="48" cy="48" r="${rr}" fill="none" stroke="#f5c451" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * pct} ${C}"/>
        </svg><div class="num"><b>${t.kcal}</b><span>已摄入</span></div></div>
        <div class="info">
          <div class="k">还可以吃</div><div class="v"><b>${Math.max(0, target - t.kcal)}</b> kcal</div>
          <div class="k" style="margin-top:10px">蛋白质 ${Math.round(t.p)} / ${plan.nutrition.protein} g</div>
          <div class="bar"><i style="width:${Math.min(100, Math.round(t.p / plan.nutrition.protein * 100))}%"></i></div>
        </div>
      </div>
      <div class="hint" style="margin-top:10px">基础代谢 ${Math.round(bmr(state.profile))} kcal · 日常消耗约 ${cal.tdee} kcal · BMI ${plan.nutrition.bmi}</div>
      <button class="btn ghost" id="btnQuickAdd" style="margin-top:12px">＋ 快速记一笔（自己加也行）</button>
    </div>`;

    const meals = plan.nutrition.meals;
    const meta = { breakfast: ['早饭', '☀'], lunch: ['午饭', '◐'], dinner: ['晚饭', '☾'], snack: ['加餐', '◌'] };
    $('#mealCard').innerHTML = `<div class="card"><h3><span>今天的三餐</span><span class="more">吃了 / 没吃 都记一下</span></h3>
      ${['breakfast', 'lunch', 'dinner', 'snack'].map(k => {
        const m = meals[k], st = mealStatus(k), its = mealItems(k);
        const kcal = its.reduce((s, x) => s + x.kcal, 0);
        const label = st === 'eaten' ? '<span class="st ok">已吃</span>' : st === 'skipped' ? `<span class="st skip">没吃${(c.meals[k].reason ? ' · ' + c.meals[k].reason : '')}</span>` : '';
        const itemRows = its.map((x, i) => `<div class="mi"><span>${esc(x.n)}</span><span>${x.kcal} kcal <button data-del2="${(c.food || []).indexOf(x)}">删</button></span></div>`).join('');
        return `<div class="meal ${st === 'skipped' ? 'skipped' : ''}">
          <div class="mi-top"><div class="ico">${meta[k][1]}</div>
            <div class="txt"><div class="t1">${meta[k][0]} ${label}</div>
              <div class="t2">建议：${esc(m.t)} · ${m.kcal} kcal${kcal ? ' · 已记 ' + kcal + ' kcal' : ''}</div></div>
            ${kcal ? `<div class="mk">${kcal}</div>` : ''}</div>
          ${itemRows}
          <div class="mbtns">
            ${st === 'skipped'
              ? `<button class="eat" data-eat="${k}">其实吃了</button><button data-undo="${k}">改回来</button>`
              : st === 'eaten'
                ? `<button class="eat" data-add="${k}">再加一笔</button><button data-skip2="${k}">改「没吃」</button><button data-undo="${k}">清空</button>`
                : `<button class="eat" data-eat="${k}">吃了</button><button data-skip2="${k}">没吃</button><button data-add="${k}">自己加</button>`}
          </div></div>`;
      }).join('')}</div>`;
    $('#btnQuickAdd').onclick = () => openFoodSearch(guessMealKey());
    $$('[data-eat]').forEach(b => b.onclick = () => eatSuggestion(b.dataset.eat));
    $$('[data-add]').forEach(b => b.onclick = () => openFoodSearch(b.dataset.add));
    $$('[data-skip2]').forEach(b => b.onclick = () => skipMeal(b.dataset.skip2));
    $$('[data-undo]').forEach(b => b.onclick = () => clearMeal(b.dataset.undo));
    $$('[data-del2]').forEach(b => b.onclick = () => { const cc = check(); cc.food.splice(+b.dataset.del2, 1); save(); renderDiet(); renderThree(); renderHero(); });

    const custom = state.customFoods || [];
    $('#foodCard').innerHTML = `<div class="card">
      <h3><span>快速记一笔</span><span class="more">点一次加一份</span></h3>
      <div class="foods" id="foodChips">${FOODS.slice(0, 10).map((f, i) => `<button class="food" data-food="${i}">${esc(f.n)} · ${f.kcal}</button>`).join('')}
        <button class="food plus" id="btnMoreFood">更多 / 搜索</button>
        <button class="food plus" id="btnCustomFood">＋ 自定义</button></div>
      <div class="hint" style="margin-top:10px">先选加进哪一顿：点上面的「吃了 / 自己加」会指定餐次；这里快速加默认按时间猜。</div>
      <div class="water" style="margin-top:14px">
        <div class="wh"><span>喝水</span><span class="more" id="waterNum">${c.water || 0}/8 杯</span></div>
        <div class="cups">${Array.from({ length: 8 }, (_, i) => `<button class="cup ${i < (c.water || 0) ? 'on' : ''}" data-cup="${i}"></button>`).join('')}</div>
      </div>
    </div>`;
    $$('#foodChips [data-food]').forEach(b => b.onclick = () => addFood(FOODS[+b.dataset.food], guessMealKey()));
    $('#btnMoreFood').onclick = () => openFoodSearch(guessMealKey());
    $('#btnCustomFood').onclick = () => openCustomFood(guessMealKey());
    $$('#foodCard .cup').forEach(cup => cup.onclick = () => {
      const i = +cup.dataset.cup; const cc = check();
      cc.water = (cc.water || 0) === i + 1 ? i : i + 1; save(); renderDiet(); renderHero();
    });

    const notes = plan.dietNotes || [];
    $('#dietNoteCard').innerHTML = notes.length ? `<div class="card"><h3><span>根据你的状态</span></h3>
      ${notes.map(n => `<div class="note info"><span>i</span><div>${esc(n)}</div></div>`).join('')}</div>` : '';
  }
  function addFood(f, meal) {
    const c = check();
    c.food = c.food || [];
    c.food.push({ n: f.n, kcal: f.kcal || 0, p: f.p || 0, meal: meal || 'extra', at: Date.now() });
    if (meal) { c.meals = c.meals || {}; c.meals[meal] = Object.assign({}, c.meals[meal], { status: 'eaten' }); }
    save(); renderDiet(); renderThree(); renderHero();
    toast(`+ ${f.kcal || 0} kcal`);
  }
  function openFoodSearch(meal) {
    let target = meal || guessMealKey();
    const body = `<div class="seg" id="mSeg">${[['breakfast', '早饭'], ['lunch', '午饭'], ['dinner', '晚饭'], ['snack', '加餐']].map(([k, n]) => `<button data-m="${k}" class="${k === target ? 'on' : ''}">${n}</button>`).join('')}</div>
      <input class="search" id="fq" placeholder="搜食物，比如 米饭、鸡胸、奶茶">
      <div id="flist" class="flist"></div>`;
    openSheet('加一笔', body, sheet => {
      const render = () => {
        const q = $('#fq', sheet).value.trim();
        const all = FOODS.concat(state.customFoods || []);
        const list = q ? all.filter(f => f.n.includes(q)) : all;
        $('#flist', sheet).innerHTML = list.slice(0, 40).map((f, i) => `<div class="frow"><div><div class="fn">${esc(f.n)}</div><div class="fk">${f.kcal} kcal · 蛋白 ${f.p || 0}g</div></div><button class="fadd" data-i="${i}">＋</button></div>`).join('') || '<div class="empty">没搜到，点下面自定义</div>';
        $$('#flist .fadd', sheet).forEach(b => b.onclick = () => { addFood(list[+b.dataset.i], target); closeSheet(); });
      };
      $$('#mSeg button', sheet).forEach(b => b.onclick = () => { target = b.dataset.m; $$('#mSeg button', sheet).forEach(x => x.classList.toggle('on', x === b)); });
      $('#fq', sheet).oninput = render;
      render();
    });
  }
  function openCustomFood(meal) {
    openSheet('自定义食物', `<div class="field"><label>名称</label><input id="cfN" placeholder="比如 楼下牛肉面"></div>
      <div class="row2"><div class="field"><label>热量 kcal</label><input type="number" id="cfK" placeholder="600"></div>
      <div class="field"><label>蛋白质 g</label><input type="number" id="cfP" placeholder="25"></div></div>
      <div class="hint">存一次，下次「更多 / 搜索」里就有。</div>
      <button class="btn" id="cfSave" style="margin-top:12px">保存并记一笔</button>`, sheet => {
      $('#cfSave', sheet).onclick = () => {
        const n = $('#cfN', sheet).value.trim(); if (!n) { toast('写个名字'); return; }
        const f = { n, kcal: +$('#cfK', sheet).value || 0, p: +$('#cfP', sheet).value || 0 };
        state.customFoods = state.customFoods || []; state.customFoods.push(f); save();
        addFood(f, meal || guessMealKey()); closeSheet();
      };
    });
  }
  function addWater(n) { const c = check(); c.water = Math.min(8, (c.water || 0) + n); save(); }

  /* ---------- 训练：计时器 + 记录 ---------- */
  function renderTrain() {
    const w = WORKOUTS[plan.wid];
    const c = check();
    const done = !!c.done.train;
    const moves = [];
    (w.blocks || []).forEach(b => {
      if (b.k === 'ex') { const ex = EX[b.ex]; const lib = EX_LIB_MAP[b.ex]; moves.push(`<div class="mv ${lib ? 'has-demo' : ''}"><div class="n">${esc(ex.n)}</div><div class="s">${b.sets} 组 × ${b.secs} 秒 · 休 ${b.rest} 秒${b.sides ? ' ×2 侧' : ''}</div><div class="cue">${esc(ex.cue)}</div>${lib ? `<div class="mvdemo"><img src="ex/${lib}/0.jpg" alt="" loading="lazy"><img class="f1" src="ex/${lib}/1.jpg" alt="" loading="lazy"><button class="exlook" data-lib="${lib}">动作要点</button></div>` : ''}</div>`); }
      else if (b.k === 'walk') moves.push(`<div class="mv"><div class="n">${esc(b.name)}</div><div class="s">${Math.round(b.secs / 60)} 分钟</div></div>`);
      else if (b.k === 'warmup' || b.k === 'cool') { const ex = EX[b.ex]; const lib = EX_LIB_MAP[b.ex]; moves.push(`<div class="mv ${lib ? 'has-demo' : ''}"><div class="n">${esc(b.name || ex.n)}</div><div class="s">${b.secs >= 60 ? Math.round(b.secs / 60) + ' 分钟' : b.secs + ' 秒'}</div>${lib ? `<div class="mvdemo"><img src="ex/${lib}/0.jpg" alt="" loading="lazy"><img class="f1" src="ex/${lib}/1.jpg" alt="" loading="lazy"><button class="exlook" data-lib="${lib}">动作要点</button></div>` : ''}</div>`); }
    });
    const logs = (state.workoutLog || {})[today] || [];
    const hist = (state.sessions || []).slice(-7).reverse().map(s => { const ww = WORKOUTS[s.wid] || {}; return `<div class="kv"><span>${esc(s.date.slice(5))}</span><span>${esc(ww.title || s.wid)}</span></div>`; }).join('') || '<div class="empty">还没有训练记录</div>';
    const logRows = logs.length ? logs.map(x => `<div class="kv"><span>${esc(x.ex)}</span><span>${x.w ? x.w + 'kg ' : ''}${esc(x.r)}</span></div>`).join('') : '<div class="empty">练完一组，记一下重量和次数</div>';

    $('#trainCard').innerHTML = `<div class="card">
      <h3><span>今天的训练</span><span class="more">${done ? '已完成' : (plan.mode === 'stop' ? '今天先不练' : '跟着时间走')}</span></h3>
      <div class="tbig">${esc(plan.title)}${plan.mode === 'light' ? '（减量）' : ''}</div>
      <div class="hint">${plan.mode === 'stop' ? esc(plan.why) : '约 ' + (typeof rulesV3 === 'function' ? rulesV3().standardMin : plan.minutes) + ' 分钟 · ' + (w.music === 'calm' ? '舒缓音乐' : '可开背景音乐')}</div>
      ${plan.mode === 'stop' ? '' : `<button class="btn" id="btnTrainStart" style="margin-top:12px">${done ? '再练一次' : '▶ 开始训练'}</button>`}
      <div class="trow">
        <button class="tbtn" id="btnRest">⏱ 组间计时</button>
        <button class="tbtn" id="btnLog">✎ 记录一组</button>
      </div>
      <div class="hint" style="margin-top:8px">口令告诉你：第几组、做多久、休息多久。手机放旁边，屏幕自动常亮。</div>
    </div>
    <div class="card"><h3><span>今天练什么</span></h3>${moves.join('')}
      <div class="hint" style="margin-top:10px">${esc(plan.why)}</div>
      ${(plan.notes || []).map(n => `<div class="note ${n.type || 'info'}"><span>i</span><div>${esc(n.t)}</div></div>`).join('')}</div>
    <div class="card"><h3><span>今天的记录</span></h3>${logRows}</div>
    <div class="card"><h3><span>晨间八段锦</span><span class="more">约 ${plan.morning.minutes} 分钟</span></h3><div class="hint">八式，每式约一分钟，跟着口令和呼吸做。早上做最好，晚上放松也行。</div><button class="btn ghost" id="btnMorning2" style="margin-top:10px">开始八段锦</button></div>
    <div class="card"><h3><span>最近训练</span></h3>${hist}</div>`;
    const bt = $('#btnTrainStart'); if (bt) bt.onclick = startTraining;
    $$('#trainCard [data-lib]').forEach(b => b.onclick = () => openExDemo(b.dataset.lib));
    $('#btnRest').onclick = () => openTimer(90);
    $('#btnLog').onclick = openTrainLog;
    const bm = $('#btnMorning2'); if (bm) bm.onclick = startMorning;
  }
  function openTimer(sec) {
    let left = sec, timer = null;
    openSheet('组间计时', `<div class="timer-num" id="tnum">${pad2(Math.floor(left / 60))}:${pad2(left % 60)}</div>
      <div class="timer-btns"><button class="btn" id="tStart">开始</button><button class="btn ghost" id="tReset">重置</button></div>
      <div class="seg" style="margin-top:14px" id="tPreset"><button data-s="60">60″</button><button data-s="90">90″</button><button data-s="120">120″</button><button data-s="180">3′</button></div>`, sheet => {
      const draw = () => $('#tnum', sheet).textContent = `${pad2(Math.floor(left / 60))}:${pad2(left % 60)}`;
      const tick = () => { left--; draw(); if (left <= 0) { clearInterval(timer); timer = null; beep(); toast('时间到'); } };
      $('#tStart', sheet).onclick = () => { if (timer) { clearInterval(timer); timer = null; $('#tStart', sheet).textContent = '继续'; } else { timer = setInterval(tick, 1000); $('#tStart', sheet).textContent = '暂停'; } };
      $('#tReset', sheet).onclick = () => { clearInterval(timer); timer = null; left = sec; draw(); };
      $$('#tPreset button', sheet).forEach(b => b.onclick = () => { clearInterval(timer); timer = null; left = +b.dataset.s; draw(); });
      sheet.__onClose = () => clearInterval(timer);
    });
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function beep() {
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); [0, .25, .5].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = .08; o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .12); }); if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
  }
  function openTrainLog() {
    const w = WORKOUTS[plan.wid];
    const exs = (w.blocks || []).filter(b => b.k === 'ex').map(b => EX[b.ex].n);
    openSheet('记录一组', `<div class="field"><label>动作</label><select id="lgEx">${exs.map(x => `<option>${esc(x)}</option>`).join('')}</select></div>
      <div class="row2"><div class="field"><label>重量 kg（自重填 0）</label><input type="number" step="0.5" id="lgW" placeholder="0"></div>
      <div class="field"><label>次数 / 组数</label><input id="lgR" placeholder="10×3"></div></div>
      <button class="btn" id="lgSave">保存</button>`, sheet => {
      $('#lgSave', sheet).onclick = () => {
        const ex = $('#lgEx', sheet).value, wgt = $('#lgW', sheet).value, r = $('#lgR', sheet).value.trim();
        if (!r) { toast('写一下次数'); return; }
        state.workoutLog = state.workoutLog || {};
        (state.workoutLog[today] = state.workoutLog[today] || []).push({ ex, w: wgt, r, ts: Date.now() });
        save(); closeSheet(); renderTrain(); toast('已记录');
      };
    });
  }

  /* ---------- 六维自评 / 照片 / 成果卡 ---------- */
  function weekKey() { return R.add(today, -((new Date(today).getDay() + 6) % 7)); }
  function renderExtras() {
    const el = $('#extraCards'); if (!el) return;
    const ratings = state.ratings || {};
    const cur = ratings[weekKey()] || null;
    const keys = Object.keys(ratings).sort();
    const prev = keys.filter(k => k !== weekKey()).length ? ratings[keys.filter(k => k !== weekKey()).pop()] : null;
    let svg = '', cx = 150, cy = 105, Rr = 66;
    [2.5, 5, 7.5, 10].forEach(v => {
      const pts = DIMS6.map((_, i) => { const a = (-90 + i * 60) * Math.PI / 180, r = Rr * v / 10; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' ');
      svg += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,.07)"/>`;
    });
    DIMS6.forEach((d, i) => { const a = (-90 + i * 60) * Math.PI / 180; svg += `<line x1="${cx}" y1="${cy}" x2="${cx + Rr * Math.cos(a)}" y2="${cy + Rr * Math.sin(a)}" stroke="rgba(255,255,255,.06)"/>`; });
    const poly = (r, fill, stroke, dash) => `<polygon points="${DIMS6.map((d, i) => { const a = (-90 + i * 60) * Math.PI / 180, rr = Rr * (r[d.key] || 5) / 10; return `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`; }).join(' ')}" fill="${fill}" stroke="${stroke}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    if (prev) svg += poly(prev, 'none', 'rgba(139,149,181,.35)', '4 3');
    if (cur) svg += poly(cur, 'rgba(245,196,81,.16)', '#f5c451');
    DIMS6.forEach((d, i) => { const a = (-90 + i * 60) * Math.PI / 180; svg += `<text x="${cx + (Rr + 20) * Math.cos(a)}" y="${cy + (Rr + 20) * Math.sin(a) + 4}" text-anchor="middle" fill="${d.color}" font-size="10">${d.name}</text>`; });

    const slots = [['w0', '第 0 周'], ['w4', '第 4 周'], ['w8', '第 8 周'], ['w13', '第 13 周']];
    const ph = photos;
    const have = slots.filter(([k]) => ph[k]);
    const compare = have.length >= 2
      ? `<div class="photoCmp"><img src="${ph[have[0][0]]}"><img class="after" id="afterImg" src="${ph[have[have.length - 1][0]]}"><input type="range" id="cmp" min="0" max="100" value="50"></div>`
      : `<div class="empty">放两张照片，就能左右滑动对比</div>`;

    el.innerHTML = `<div class="card"><h3><span>六维自评</span><span class="more">每周 1 分钟</span></h3>
        <svg viewBox="0 0 300 210" style="width:100%;height:215px">${svg}</svg>
        <div class="hint">${cur ? '实线本周，虚线上周。哪一维低于 5 分，下周只保那一维。' : '还没打分：点下面，给六个维度各打 1–10 分。'}</div>
        <button class="btn ghost small" id="btnRate" style="margin-top:10px">${cur ? '重新打分' : '开始自评'}</button>
      </div>
      <div class="card"><h3><span>蜕变照片</span><span class="more">只存手机</span></h3>${compare}
        <div class="slots">${slots.map(([k, n]) => `<button data-slot="${k}" class="${ph[k] ? 'has' : ''}">${n}<br>${ph[k] ? '已存' : '拍摄'}</button>`).join('')}</div>
      </div>
      <button class="btn" id="btnShare" style="margin-bottom:12px">生成蜕变成果卡</button>`;
    $('#btnRate').onclick = openRatings;
    bindPhotoInput();
    $$('#extraCards .slots button').forEach(b => b.onclick = () => { window.__slot = b.dataset.slot; $('#photoInput').click(); });
    const cmp = $('#cmp'); if (cmp) cmp.oninput = e => $('#afterImg').style.clipPath = `inset(0 0 0 ${e.target.value}%)`;
    $('#btnShare').onclick = shareCard;
  }

  /* ---------- 照片：IndexedDB，别塞 localStorage ---------- */
  function idb() {
    return new Promise((ok, no) => {
      const r = indexedDB.open('tb-photos', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('p'); } catch (e) {} };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    });
  }
  async function idbPut(k, v) {
    const db = await idb();
    return new Promise((ok, no) => {
      const tx = db.transaction('p', 'readwrite');
      tx.objectStore('p').put(v, k);
      tx.oncomplete = () => { db.close(); ok(); };
      tx.onerror = () => { db.close(); no(tx.error); };
    });
  }
  async function idbAll() {
    const db = await idb();
    return new Promise((ok, no) => {
      const out = {}, tx = db.transaction('p', 'readonly'), rq = tx.objectStore('p').openCursor();
      rq.onsuccess = e => {
        const cur = e.target.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
        else { db.close(); ok(out); }
      };
      rq.onerror = () => { db.close(); no(rq.error); };
    });
  }
  async function loadPhotos() {
    try { photos = await idbAll(); renderExtras(); } catch (e) { console.warn('photos unavailable', e); }
  }
  async function clearPhotos() {
    try { const db = await idb(); const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').clear(); tx.oncomplete = () => db.close(); } catch (e) {}
    photos = {};
  }
  function bindPhotoInput() {
    const inp = $('#photoInput');
    if (!inp || inp.__bound) return;
    inp.__bound = true;
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; inp.value = '';
      if (!f || !window.__slot) return;
      try {
        const data = await compressPhoto(f);
        await idbPut(window.__slot, data);
        photos[window.__slot] = data;
        renderExtras(); toast('照片已存');
      } catch (e) { console.warn(e); toast('照片存不下，换一张小点的'); }
    };
  }
  function compressPhoto(file) {
    return new Promise((ok, no) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          const max = 900, s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          ok(c.toDataURL('image/jpeg', 0.82));
        } catch (e) { URL.revokeObjectURL(url); no(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error('bad image')); };
      img.src = url;
    });
  }
  function openRatings() {
    const wk = weekKey(), cur = (state.ratings || {})[wk] || {};
    openSheet('本周六维自评', `${DIMS6.map(d => `<div class="field"><label><span>${d.name}</span><span><b id="rv_${d.key}">${cur[d.key] || 5}</b>/10</span></label><input type="range" id="rr_${d.key}" min="1" max="10" value="${cur[d.key] || 5}"></div>`).join('')}
      <button class="btn" id="rSave">保存</button>`, sheet => {
      DIMS6.forEach(d => $('#rr_' + d.key, sheet).oninput = () => $('#rv_' + d.key, sheet).textContent = $('#rr_' + d.key, sheet).value);
      $('#rSave', sheet).onclick = () => { const r = {}; DIMS6.forEach(d => r[d.key] = +$('#rr_' + d.key, sheet).value); state.ratings = state.ratings || {}; state.ratings[wk] = r; save(); closeSheet(); renderExtras(); toast('已保存'); };
    });
  }
  function shareCard() {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, '#101728'); g.addColorStop(1, '#161022');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = '#f5c451'; x.font = '700 34px -apple-system'; x.fillText('蜕变 · 语音教练', 80, 140);
    x.fillStyle = '#eef2fb'; x.font = '800 86px -apple-system'; x.fillText('我变了。', 80, 280);
    x.fillStyle = '#8b95b5'; x.font = '400 28px -apple-system'; x.fillText(`${APP.start} → ${APP.end} · ${Math.abs(R.days(APP.start, today))} 天`, 80, 340);
    const ws = Object.values(state.checkins || {}).filter(c2 => c2.weight).map(c2 => c2.weight);
    const first = state.profile.startWeight || ws[0] || 80, last = state.profile.weight || ws[ws.length - 1] || first;
    const rows = [['体重', `${first} → ${last} kg`], ['连续记录', checkinStreak(state, today) + ' 天'], ['累计训练', (state.sessions || []).length + ' 次'], ['六维', (state.ratings || {})[weekKey()] ? Object.values(state.ratings[weekKey()]).reduce((a, b) => a + b, 0) + '/60' : '待自评']];
    rows.forEach((r, i) => { const y = 460 + i * 120; x.fillStyle = 'rgba(255,255,255,.05)'; x.beginPath(); if (x.roundRect) x.roundRect(80, y - 55, 920, 95, 22); else x.rect(80, y - 55, 920, 95); x.fill(); x.fillStyle = '#8b95b5'; x.font = '400 26px -apple-system'; x.fillText(r[0], 120, y); x.fillStyle = '#f5c451'; x.font = '700 38px -apple-system'; x.textAlign = 'right'; x.fillText(r[1], 960, y); x.textAlign = 'left'; });
    x.fillStyle = '#eef2fb'; x.font = '700 26px -apple-system'; x.fillText('回家过年，给家里人看看。', 80, 1120);
    c.toBlob(async blob => { const file = new File([blob], '蜕变成果.png', { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) {} } const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '蜕变成果.png'; a.click(); }, 'image/png');
  }

  /* ---------- 快速记一笔 ---------- */
  function openQuickNote() {
    openSheet('快速记一笔', `<div class="seg" id="qnSeg"><button data-v="weight" class="on">体重</button><button data-v="steps">步数</button><button data-v="sleep">几点睡</button><button data-v="mood">情绪</button><button data-v="read">阅读</button></div><div id="qnBody" style="margin-top:14px"></div>`, sheet => {
      const draw = v => {
        const c = check();
        const bodies = {
          weight: `<div class="field"><label>体重 kg</label><input type="number" step="0.1" id="qW" value="${c.weight || state.profile.weight || ''}"></div>`,
          steps: `<div class="field"><label>今天走了多少步</label><input type="number" id="qS" inputmode="numeric" value="${c.steps || ''}" placeholder="8000"></div>`,
          sleep: `<div class="field"><label>昨晚几点睡</label><input type="time" id="qT" value="${c.sleepAt || '23:00'}"></div>`,
          mood: `<div class="field"><label><span>情绪</span><span><b id="qMV">${c.mood || 7}</b>/10</span></label><input type="range" id="qM" min="1" max="10" value="${c.mood || 7}"></div>`,
          read: `<div class="field"><label>读了几页</label><input type="number" id="qR" placeholder="20"></div>`
        };
        $('#qnBody', sheet).innerHTML = bodies[v] + `<button class="btn" id="qSave" style="margin-top:12px">保存</button>`;
        if (v === 'mood') $('#qM', sheet).oninput = () => $('#qMV', sheet).textContent = $('#qM', sheet).value;
        $('#qSave', sheet).onclick = () => {
          const cc = check();
          if (v === 'weight') { const w2 = +$('#qW', sheet).value; if (w2) { cc.weight = w2; state.profile.weight = w2; } }
          if (v === 'steps') { const n = +$('#qS', sheet).value || 0; if (n) cc.steps = n; }
          if (v === 'sleep') { const t = $('#qT', sheet).value; if (t) { cc.sleepAt = t; if (!cc.wakeAt) { const [h, m] = t.split(':').map(Number); const wm = (h * 60 + m + 7 * 60 + 30) % 1440; cc.wakeAt = `${pad2(Math.floor(wm / 60))}:${pad2(wm % 60)}`; } } }
          if (v === 'mood') cc.mood = +$('#qM', sheet).value;
          if (v === 'read') { const n = +$('#qR', sheet).value || 0; if (n) cc.done.read = Date.now(); cc.pages = (cc.pages || 0) + n; }
          save(); closeSheet(); renderAll(); toast('已记下');
        };
      };
      $$('#qnSeg button', sheet).forEach(b => b.onclick = () => { $$('#qnSeg button', sheet).forEach(x => x.classList.toggle('on', x === b)); draw(b.dataset.v); });
      draw('weight');
    });
  }

  /* ================= v2.2 六维 ================= */
  const SIX_META = {
    body: { name: '身体', icon: '●', color: '#4cc9a4', ref: '第 2 节第 11、16 条', why: '每天 7000–8000 步或每周快走 150–300 分钟；每周 30–60 分钟力量就够。' },
    diet: { name: '饮食', icon: '◍', color: '#f5c451', ref: '第 2 节第 7、9、27 条', why: '不喝含糖饮料、换低钠盐、每天 400 g 蔬果；胰岛素抵抗和体重都先吃出来。' },
    mind: { name: '心力', icon: '☾', color: '#6aa9ff', ref: '第 3 节第 16、17 条；第 1 节第 25 条', why: '减少消耗型关系、生气先离场；情绪持续低落别硬扛，12356。' },
    relation: { name: '关系', icon: '♡', color: '#ff7a9c', ref: '第 10 节；第 18 节', why: '关系质量是长期健康和生活满意度的底层变量；每周主动联系，不等别人找你。' },
    order: { name: '秩序', icon: '▦', color: '#b98cff', ref: '第 3 节第 1 条；第 14 节', why: '关通知、清桌面、记账、证件归档；秩序省下的是每天的注意力和找东西的时间。' },
    growth: { name: '见识', icon: '✦', color: '#6fe3e1', ref: '第 4 节第 1、4 条；第 23 节第 7、10 条', why: '把目标写成「几点在哪做什么」；多受一年教育私人回报约 9%，技能优先选要动手、要现场判断的。' }
  };
  function weekIndex() { return Math.floor(Math.abs(R.days(APP.start, today)) / 7); }
  function focusDim() { return DIMS6[weekIndex() % 6]; }
  function renderSixGrid() {
    const c = check(), d = dimState(), f = focusDim();
    const bodyText = `${esc(plan.title)} · ${plan.minutes} 分钟`;
    const dt = foodTotal();
    const items = [
      ['body', bodyText, d.body],
      ['diet', `${dt.kcal} / ${plan.nutrition.target} kcal`, d.diet],
      ['mind', '睡前 3 分钟 / 写一句情绪', d.mind],
      ['relation', '给一个人发条消息', d.relation],
      ['order', '收拾 10 分钟 + 记账', d.order],
      ['growth', '读 20 页 / 听 20 分钟', d.growth]
    ];
    $('#sixGrid').innerHTML = `<div class="card sixcard">
      <h3><span>今天六维</span><span class="more">点一下就算做到</span></h3>
      <div class="sixhint">本周主攻：<b style="color:${f.color}">${f.name}</b> · 其他五维每天碰一下就行</div>
      <div class="sixg">
        ${items.map(([k, txt, on]) => { const m = SIX_META[k]; return `<button class="sx ${on ? 'on' : ''}" data-dim="${k}" style="--c:${m.color}">
          <span class="si" style="color:${m.color}">${m.icon}</span>
          <span class="sn">${m.name}${k === 'diet' || k === 'body' ? '' : ''}</span>
          <span class="stx">${txt}</span>
          <span class="sck">${on ? '✓' : '○'}</span>
        </button>`; }).join('')}
      </div>
      <div class="sixfoot"><span>依据《高性价比人生指南》767 条</span><button id="btnSixWhy">为什么是这六维？</button></div>
    </div>`;
    $$('#sixGrid .sx').forEach(b => b.onclick = () => {
      const k = b.dataset.dim;
      if (k === 'body') { switchTab('tab-train'); return; }
      if (k === 'diet') { switchTab('tab-diet'); return; }
      if (k === 'mind') { if (!c.done.sleep) startSleep(); else { delete c.done.sleep; save(); renderAll(); } return; }
      const key = k === 'relation' ? 'relation' : k === 'order' ? 'order' : 'read';
      if (c.done[key]) delete c.done[key]; else c.done[key] = Date.now();
      save(); renderAll(); checkNewBadges();
    });
    $('#btnSixWhy').onclick = () => openSixWhy();
  }
  function openSixWhy() {
    openSheet('为什么是这六维', `<div class="hint" style="margin-bottom:10px">只练身体，过完年还是「身体好了一点、其他照旧」。六条线一起往前挪，才叫蜕变；每条线都能在书里找到依据。</div>
      ${DIMS6.map(d => { const m = SIX_META[d.key]; return `<div class="ex" style="border-color:${m.color}33"><div class="ex-top"><b style="color:${m.color}">${m.icon} ${m.name}</b><span>${m.ref}</span></div><div class="ex-cue">${m.why}</div></div>`; }).join('')}
      <div class="hint" style="margin-top:10px">书：《高性价比人生指南》767 条，CC BY 4.0。</div>`);
  }




  /* ================= v3：固定 20:30 纪律版 ================= */
  const V3_DEFAULTS = { anchor: '20:30', weeklyGoal: 5, standardMin: 45, minMin: 30, makeup: '21:30', makeupMax: 1 };
  function rulesV3() { return Object.assign({}, V3_DEFAULTS, state.rules || {}); }
  function hmV3(t) { const a = String(t || '0:0').split(':').map(Number); return (a[0] || 0) * 60 + (a[1] || 0); }
  function nowMinV3() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function weekStartV3() { const d = new Date(today + 'T00:00:00'); return R.add(today, -((d.getDay() + 6) % 7)); }
  function weekDatesV3() { const st = weekStartV3(); return Array.from({ length: 7 }, (_, i) => R.add(st, i)); }
  function isTrainDone(d) { const c = state.checkins && state.checkins[d]; return !!(c && c.done && c.done.train); }
  function isMakeupDay(d) { const c = state.checkins && state.checkins[d]; return !!(c && c.makeup); }
  function weekDoneV3() { return weekDatesV3().filter(isTrainDone).length; }
  function weekMakeupV3() { return weekDatesV3().filter(isMakeupDay).length; }
  function sessionDurV3(s) { if (s && typeof s.dur === 'number') return s.dur; const w = WORKOUTS[s && s.wid] || {}; return w.minutes || 30; }
  function weekMinutesV3() { const set = new Set(weekDatesV3()); return (state.sessions || []).filter(s => set.has(s.date)).reduce((a, s) => a + sessionDurV3(s), 0); }
  function weekDoneAtV3(st) { return Array.from({ length: 7 }, (_, i) => R.add(st, i)).filter(isTrainDone).length; }
  function weekStreakV3() {
    const goal = +rulesV3().weeklyGoal || 5;
    let st = weekStartV3(), n = 0;
    if (weekDoneAtV3(st) < goal) st = R.add(st, -7);
    for (let i = 0; i < 52; i++) {
      if (weekDoneAtV3(st) < goal) break;
      n++; st = R.add(st, -7);
    }
    return n;
  }
  function padV3(n) { return String(n).padStart(2, '0'); }
  function chainHtmlV3() {
    const days = Array.from({ length: 14 }, (_, i) => R.add(today, i - 13));
    return days.map(d => {
      let cls = 'v3day';
      if (isTrainDone(d)) cls += isMakeupDay(d) ? ' makeup' : ' done';
      else cls += ' miss';
      if (d === today) cls += ' today';
      return `<div class="${cls}"><i></i><span>${R.parse(d).getDate()}</span></div>`;
    }).join('');
  }
  function hideV3(id) { const el = $('#' + id); if (el) el.style.display = 'none'; }
  function renderSixGrid() { hideV3('sixGrid'); }
  function renderStatus() { hideV3('statusCard'); }
  function renderThree() { hideV3('threeCard'); }
  function renderTip() { hideV3('tipCard'); }

  function renderRulesCard(force) {
    const el = $('#rulesCard'); if (!el) return;
    if (!force && el.dataset.ready === '1') return;
    el.dataset.ready = '1';
    const r = rulesV3();
    el.innerHTML = `<div class="card">
      <h3><span>纪律规则</span><span class="more">改完立即生效</span></h3>
      <div class="row2">
        <div class="field"><label>开始时间</label><input type="time" id="rAnchor" value="${r.anchor}"></div>
        <div class="field"><label>补场时间</label><input type="time" id="rMakeup" value="${r.makeup}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>每周最少天数</label><input type="number" id="rGoal" min="1" max="7" value="${r.weeklyGoal}"></div>
        <div class="field"><label>标准时长（分钟）</label><input type="number" id="rStd" min="10" max="120" value="${r.standardMin}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>最低算完成（分钟）</label><input type="number" id="rMin" min="5" max="90" value="${r.minMin}"></div>
        <div class="field"><label>补场每周次数</label><input type="number" id="rMax" min="0" max="3" value="${r.makeupMax}"></div>
      </div>
      <button class="btn ghost" id="rSaveRules">保存规则</button>
      <div class="hint" style="margin-top:8px">20:20 准备、20:30 开始、21:30 补场。改时间/天数/时长不用重新部署。</div>
    </div>`;
    $('#rSaveRules').onclick = () => {
      state.rules = {
        anchor: $('#rAnchor').value || '20:30',
        makeup: $('#rMakeup').value || '21:30',
        weeklyGoal: Math.max(1, Math.min(7, +$('#rGoal').value || 5)),
        standardMin: Math.max(10, Math.min(120, +$('#rStd').value || 45)),
        minMin: Math.max(5, Math.min(90, +$('#rMin').value || 30)),
        makeupMax: Math.max(0, Math.min(3, +$('#rMax').value || 1))
      };
      save(); renderRulesCard(true); renderAll(); toast('规则已保存');
    };
  }

  function renderHero() {
    const c = check();
    const r = rulesV3();
    const doneToday = isTrainDone(today);
    const goal = +r.weeklyGoal || 5;
    const done = weekDoneV3();
    const left = Math.max(0, goal - done);
    const now = nowMinV3(), anchor = hmV3(r.anchor), makeup = hmV3(r.makeup);
    const makeupUsed = weekMakeupV3();
    const canMakeup = !doneToday && now >= makeup && now < makeup + 90 && makeupUsed < (+r.makeupMax || 1);
    const closed = !doneToday && now >= makeup + 120;
    const minutes = weekMinutesV3();
    const weeks = weekStreakV3();
    let label = `开始 · ${r.standardMin} 分钟`, disabled = false, stop = false;
    if (doneToday) { label = '今天已完成 ✓'; disabled = true; }
    else if (plan.mode === 'stop') { label = '今天先停 · 看医生'; disabled = true; stop = true; }
    else if (canMakeup) { label = `${r.makeup} 补场（本周还剩 ${Math.max(0, (+r.makeupMax || 1) - makeupUsed)} 次）`; }
    else if (closed) { label = '今天断了 · 明天接上'; disabled = true; }
    else if (now < anchor) { label = `提前开始 · ${r.standardMin} 分钟`; }
    let copy;
    if (doneToday) copy = isMakeupDay(today) ? '补场也算数。明天别断。' : '今天这条链接上了。';
    else if (stop) copy = '身体信号优先。先看医生，别硬练。';
    else if (closed) copy = '补场窗口也过了。今天断了，明天必须接上，别断第二次。';
    else if (left <= 0) copy = '本周已经达标。剩下的日子算送的。';
    else if (canMakeup) copy = `20:30 没做，21:30 是最后一次补场。本周还差 ${left} 天。`;
    else if (now >= anchor) copy = `本周还差 ${left} 天。别想周日一次补。`;
    else copy = `20:30 开始。现在先换衣服、铺垫子，手机放远。本周还差 ${left} 天。`;
    $('#topDate').textContent = R.cn(today);
    $('#hero').innerHTML = `<div class="card v3home">
      <div class="v3top"><span>固定锚点 · 第 ${Math.max(1, Math.abs(R.days(APP.start, today)) + 1)} 天</span><span>${r.anchor}</span></div>
      <div class="v3time">${r.anchor}</div>
      <div class="v3week"><div class="v3wl"><b>${done} / ${goal}</b> 本周完成<span>${left ? '还差 ' + left + ' 天' : '已达标'}</span></div>
        <div class="v3bar"><i style="width:${Math.min(100, Math.round(done / goal * 100))}%"></i></div></div>
      <button class="v3btn ${disabled ? 'off' : ''}" id="v3Start" ${disabled ? 'disabled' : ''}>${label}</button>
      <div class="v3copy">${esc(copy)}</div>
      <div class="v3chain">${chainHtmlV3()}</div>
      <div class="v3meta"><span>本周 ${minutes} 分钟</span><span>连续 ${weeks} 周达标</span><span>补场 ${makeupUsed}/${r.makeupMax}</span></div>
    </div>`;
    hideV3('sixGrid'); hideV3('statusCard'); hideV3('threeCard'); hideV3('tipCard');
    const btn = $('#v3Start');
    if (btn) btn.onclick = () => { if (!disabled) startTraining(); };
    renderRulesCard();
  }

  function startTraining() {
    if (plan.mode === 'stop') { toast('今天先别练，身体信号需要先看医生'); return; }
    const r = rulesV3(); const now = nowMinV3(); const makeupAt = hmV3(r.makeup);
    const isMakeup = now >= makeupAt && now < makeupAt + 90;
    if (isMakeup && weekMakeupV3() >= (+r.makeupMax || 1)) { toast('本周补场已经用完了'); return; }
    if (isTrainDone(today)) { toast('今天已经完成了'); return; }
    const w = WORKOUTS[plan.wid];
    meta = { type: 'train', wid: plan.wid, startedAt: Date.now(), makeup: isMakeup };
    openPlayer(w.title, plan.wid, { mode: plan.mode, prog: plan.prog, targetMin: +r.standardMin || 45 }, state.settings.music ? resolveSound(w.music) : null);
  }

  function finishPlayer() {
    const m = meta || {};
    const c = check();
    if (m.type === 'train') {
      c.done.train = Date.now();
      if (m.makeup) c.makeup = Date.now();
      const dur = Math.max(1, Math.round((Date.now() - (m.startedAt || Date.now())) / 60000));
      state.sessions.push({ date: today, wid: m.wid, ts: Date.now(), dur, makeup: !!m.makeup });
      save(); toast(`完成 ${dur} 分钟，记下了`);
    } else if (m.type === 'sleep') {
      c.done.sleep = Date.now(); save(); toast('今天到这，睡个好觉');
    } else if (m.type === 'morning') {
      c.done.morning = Date.now();
      state.sessions.push({ date: today, wid: m.wid, ts: Date.now(), dur: WORKOUTS[m.wid] ? WORKOUTS[m.wid].minutes : 10 });
      save(); toast('八段锦做完了');
    }
    checkNewBadges();
    setTimeout(() => { closePlayer(); renderAll(); }, 800);
  }

  setInterval(() => { try { if ($('#hero') && $('#hero').innerHTML) renderHero(); } catch (e) {} }, 30000);


  /* ================= 动作库（家用器械） ================= */
  let EXDB = null;
  const EX_LIB_MAP = { squat: 'Bodyweight_Squat', pushup: 'Pushups', bridge: 'Butt_Lift_Bridge', lunge: 'Bodyweight_Walking_Lunge', plank: 'Plank', stepup: 'Step-up_with_Knee_Raise', superman: 'Superman', deadbug: 'Dead_Bug', calf: 'Donkey_Calf_Raises' };
  let exState = { group: '全部', q: '' };
  const EX_GROUPS = ['全部', '下肢/臀', '胸/肩', '背', '核心', '全身', '拉伸'];
  

  function renderExLibCard() {
    const el = $('#exLibCard'); if (!el) return;
    el.innerHTML = `<div class="card">
      <h3><span>动作库</span><span class="more">39 个徒手动作</span></h3>
      <div class="hint">不用器械，在家一块垫子就能练；点开有动作演示和步骤。</div>
      <button class="btn ghost" id="btnExLib" style="margin-top:10px">打开动作库</button>
    </div>`;
    $('#btnExLib').onclick = openExLib;
  }

  async function loadExDB() {
    if (EXDB) return EXDB;
    const r = await fetch('ex.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('ex.json ' + r.status);
    EXDB = await r.json();
    return EXDB;
  }

  function exCard(it) {
    return `<div class="excard" data-id="${it.id}">
      <div class="exthumb"><img src="${it.img[0]}" alt="${esc(it.n)} 起始" loading="lazy"><img class="f1" src="${it.img[1]}" alt="${esc(it.n)} 结束" loading="lazy"></div>
      <div class="exname">${esc(it.n)}</div>
      <div class="exmeta">${esc(it.target)} · ${esc(it.eqLabel)}</div>
    </div>`;
  }

  function renderExGrid() {
    const box = $('#exGrid'); if (!box) return;
    const q = exState.q.trim().toLowerCase();
    const list = (EXDB.items || []).filter(it => {
      if (exState.group !== '全部' && it.group !== exState.group) return false;
      if (q && !(it.n + ' ' + it.en + ' ' + it.target).toLowerCase().includes(q)) return false;
      return true;
    });
    box.innerHTML = list.length ? list.map(exCard).join('') : '<div class="empty">没找到，换个词试试</div>';
    $$('#exGrid .excard').forEach(el => el.onclick = () => showExDetail(el.dataset.id));
    const cnt = $('#exLibCount'); if (cnt) cnt.textContent = list.length + ' 个';
  }

  function showExDetail(id) {
    const it = (EXDB.items || []).find(x => x.id === id); if (!it) return;
    const body = `<div class="exd-imgs"><figure><img src="${it.img[0]}" alt="起始"><figcaption>起始</figcaption></figure><figure><img src="${it.img[1]}" alt="结束"><figcaption>结束</figcaption></figure></div>
      <div class="exd-title">${esc(it.n)}</div>
      <div class="exd-meta">${esc(it.en)} · ${esc(it.eqLabel)} · ${esc(it.target)}</div>
      <ol class="exd-steps">${it.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
      <div class="hint">动作以不痛为准；腰、膝、肩有不适就停。图片和数据：free-exercise-db（Public Domain）。</div>
      <button class="btn" id="exTimer" style="margin-top:12px">⏱ 40 秒计时</button>`;
    openSheet(it.n, body, sheet => {
      const t = $('#exTimer', sheet); if (t) t.onclick = () => { closeSheet(); openTimer(40); };
    });
  }

  async function openExLib() {
    let ov = $('#exLib');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'exLib'; ov.className = 'exlib';
      ov.innerHTML = `<div class="exlib-top"><button id="exLibClose" aria-label="关闭">‹</button><div class="exlib-title">动作库</div><div id="exLibCount" class="exlib-count"></div></div>
        <div class="exlib-body">
          <input class="search" id="exLibQ" placeholder="搜索：深蹲、核心、拉伸">
          <div class="exlib-chips" id="exGroup">${EX_GROUPS.map(g => `<button data-g="${g}" class="${g === '全部' ? 'on' : ''}">${g}</button>`).join('')}</div>
          <div class="exlib-grid" id="exGrid"><div class="empty">加载中…</div></div>
          <div class="exlib-foot">动作图片与数据：free-exercise-db（Public Domain）· 仅作演示，疼痛请停</div>
        </div>`;
      document.body.appendChild(ov);
      $('#exLibClose').onclick = () => { ov.classList.remove('on'); };
      $('#exLibQ').oninput = e => { exState.q = e.target.value; renderExGrid(); };
      $$('#exGroup button').forEach(b => b.onclick = () => { exState.group = b.dataset.g; $$('#exGroup button').forEach(x => x.classList.toggle('on', x === b)); renderExGrid(); });
    }
    ov.classList.add('on');
    try { await loadExDB(); renderExGrid(); } catch (e) { const box = $('#exGrid'); if (box) box.innerHTML = '<div class="empty">动作库加载失败，检查网络后再试</div>'; }
  }

  function openExDemo(id) { loadExDB().then(() => showExDetail(id)).catch(() => toast('动作演示加载失败')); }
  setTimeout(renderExLibCard, 900);


  /* ================= v4：每日五件套 + 互动首页 ================= */
  const AI_PLAN = [
    { d: 1, t: '上下文工程', s: '把 AI 当同事，先把话说清楚', task: '改写你最近用过的一条提示词，加上角色、目标、约束、输出格式。', out: '一条可复用的提示词' },
    { d: 2, t: '评估', s: '别凭感觉说“好用”', task: '给同一个任务写 5 条测试用例，比较两个版本的输出。', out: '5 条测试用例 + 结论' },
    { d: 3, t: 'RAG / 知识库', s: '让 AI 先查资料再回答', task: '画一张你的知识库结构：来源、切分、检索、引用。', out: '一张知识库结构图' },
    { d: 4, t: '工具 / Agent', s: '从“会说”到“会做”', task: '写一个工作流：输入 → AI 处理 → 工具执行 → 检查 → 输出。', out: '一张工作流图' },
    { d: 5, t: '模型选择', s: '成本、延迟、隐私的取舍', task: '做一个选型表：任务、模型、成本、延迟、风险。', out: '一张选型表' },
    { d: 6, t: '搭一个小流程', s: '把一周重复的事交给 AI', task: '选一件每周都做的事，做出能跑的原型。', out: '一个能跑的原型' },
    { d: 7, t: '复盘 + 选题', s: '决定接下来 12 周做什么', task: '写下你想做的项目：给谁、解决什么、怎么算完成。', out: '项目一句话' }
  ];
  const FIVE_ICON = { morning: '☯', train: '▲', ai: '✦', waist: '◒', diet: '◍' };
  const FIVE_COLOR = { morning: '#f0b429', train: '#4cc9a4', ai: '#9b8cff', waist: '#ff9f6b', diet: '#7ed6a5' };

  function fiveOf(date) {
    const d = date || today;
    const c = state.checkins[d] || {};
    const done = c.done || {};
    const diet = (c.five && c.five.diet) || {};
    const dietN = Object.values(diet).filter(Boolean).length;
    const items = [
      { k: 'morning', n: '八段锦', s: '12 分钟 · 早上任意', done: !!done.morning, full: !!done.morning, action: 'morning' },
      { k: 'train', n: '训练', s: '20:30 · 45 分钟', done: !!done.train, full: !!done.train, action: 'train' },
      { k: 'ai', n: 'AI 学习', s: '30 分钟 · 训练后先复盘', done: !!done.ai, full: !!done.ai, action: 'ai' },
      { k: 'waist', n: '养腰', s: '10 分钟 · 可拆开', done: !!done.waist, full: !!done.waist, action: 'waist' },
      { k: 'diet', n: '饮食', s: dietN + '/3 条规则', done: dietN >= 2, full: dietN === 3, action: 'diet' }
    ];
    return { items, dietN, diet, doneN: items.filter(x => x.done).length };
  }
  function fiveDoneAt(date) { return fiveOf(date).doneN === 5; }
  function currentAiDay() {
    const done = state.aiDone || [];
    return AI_PLAN.find(x => !done.includes(x.d)) || AI_PLAN[AI_PLAN.length - 1];
  }
  function daysSinceStart() { return Math.max(1, Math.abs(R.days(APP.start, today)) + 1); }
  function phaseText() {
    const w = Math.floor(daysSinceStart() / 7) + 1;
    if (w <= 2) return '第 1–2 周 · 养腰期';
    if (w <= 8) return '第 3–8 周 · 薄肌期';
    return '第 9 周起 · 维持期';
  }
  function chainV4() {
    const days = Array.from({ length: 7 }, (_, i) => R.add(today, i - 6));
    return days.map(d => {
      const f = fiveOf(d);
      const cls = f.doneN === 5 ? 'done' : f.doneN > 0 ? 'part' : 'miss';
      return `<div class="v4day ${cls} ${d === today ? 'today' : ''}"><i></i><span>${R.parse(d).getDate()}</span></div>`;
    }).join('');
  }
  function ringSegments(f) {
    const cx = 100, cy = 100, r = 78, w = 12, gap = 7;
    return f.items.map((it, i) => {
      const a1 = (-90 + i * 72 + gap / 2) * Math.PI / 180;
      const a2 = (-90 + (i + 1) * 72 - gap / 2) * Math.PI / 180;
      const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
      const p2 = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
      const col = FIVE_COLOR[it.k];
      return `<path d="M${p1[0]} ${p1[1]} A${r} ${r} 0 0 1 ${p2[0]} ${p2[1]}" fill="none" stroke="${it.done ? col : 'rgba(255,255,255,.07)'}" stroke-width="${w}" stroke-linecap="round" class="v4seg ${it.done ? 'on' : ''}" style="filter:${it.done ? `drop-shadow(0 0 8px ${col}88)` : 'none'}"/>`;
    }).join('');
  }
  function fiveRow(it) {
    const done = it.done;
    const isDiet = it.k === 'diet';
    let right = '';
    if (isDiet) {
      const d = it.diet || {};
      right = `<div class="v4diet">${['protein', 'veg', 'drink'].map((k, i) => `<button class="v4dietBtn ${d[k] ? 'on' : ''}" data-diet="${k}" aria-label="${['一掌蛋白', '两拳蔬菜', '不喝含糖饮料'][i]}">${['蛋白', '蔬菜', '无糖'][i]}</button>`).join('')}</div>`;
    } else {
      right = done ? `<span class="v4check">✓</span>` : `<button class="v4go" data-five="${it.k}">${it.k === 'train' ? '开始' : '开始'}</button>`;
    }
    return `<div class="v4row ${done ? 'done' : ''} ${isDiet ? 'dietrow' : ''}" data-five="${it.k}">
      <div class="v4icon" style="--c:${FIVE_COLOR[it.k]}">${FIVE_ICON[it.k]}</div>
      <div class="v4row-main"><b>${it.n}</b><span>${it.s}</span></div>
      ${right}
    </div>`;
  }
  function renderHero() {
    const f = fiveOf(today);
    const r = rulesV3();
    const goal = +r.weeklyGoal || 5;
    const wt = weekDoneV3();
    const pct = Math.round(f.doneN / 5 * 100);
    const next = f.items.find(x => !x.done);
    const label = !next ? '今天完成 · 看周报' : '继续 · ' + next.n;
    const left = 5 - f.doneN;
    const day = currentAiDay();
    const doneToday = isTrainDone(today);
    const now = nowMinV3(), anchor = hmV3(r.anchor), makeup = hmV3(r.makeup);
    const canMakeup = !doneToday && now >= makeup && now < makeup + 90 && weekMakeupV3() < (+r.makeupMax || 1);
    const trainLabel = doneToday ? '已完成' : canMakeup ? '21:30 补场' : '开始';
    $('#topDate').textContent = R.cn(today);
    $('#hero').innerHTML = `
    <div class="v4home ${f.doneN === 5 ? 'all-done' : ''}">
      <section class="v4-hero">
        <div class="v4-glow"></div>
        <div class="v4-hero-top"><span>第 ${daysSinceStart()} 天 · ${phaseText()}</span><span>${r.anchor} 固定</span></div>
        <div class="v4-ringwrap">
          <svg class="v4-ring" viewBox="0 0 200 200">${ringSegments(f)}</svg>
          <div class="v4-ring-center"><b>${f.doneN}<span>/5</span></b><em>${f.doneN === 5 ? '今天完成' : '今日五件'}</em></div>
        </div>
        <div class="v4-hero-copy">${f.doneN === 5 ? '五件都做了，今天这条链接上了。' : `还差 ${left} 件。${next && next.k === 'diet' ? '最后把饮食三条打勾。' : '先做下一件，别想整套。'}`}</div>
        <button class="v4-main-btn" id="v4Next">${esc(label)}</button>
        <div class="v4-hero-meta"><span>本周训练 ${wt}/${goal}</span><span>AI Day ${day.d}/${AI_PLAN.length} · ${esc(day.t)}</span></div>
      </section>

      <section class="v4-card v4-fivecard">
        <div class="v4-card-head"><h3>今日五件</h3><span>${f.doneN}/5</span></div>
        <div class="v4-progress"><i style="width:${pct}%"></i></div>
        <div class="v4rows">${f.items.map(fiveRow).join('')}</div>
        <div class="v4-hint">完成优先于时间；最低版也算。不补昨天。<button class="v4-inline" id="v4DietGuide">今天怎么吃 →</button></div>
      </section>

      <section class="v4-card v4-weekcard">
        <div class="v4-card-head"><h3>最近 7 天</h3><span>五件套 ${Array.from({ length: 7 }, (_, i) => R.add(today, i - 6)).filter(d => fiveDoneAt(d)).length}/7</span></div>
        <div class="v4chain">${chainV4()}</div>
        <div class="v4-weekline"><span>本周训练 ${wt}/${goal}</span><span>${phaseText()}</span><span>补场 ${weekMakeupV3()}/${r.makeupMax}</span></div>
        <div class="v4-weekbtns"><button class="v4-ghost" id="v4ToTrain">查看本周训练 →</button><button class="v4-ghost" id="v4Report">本周复盘 →</button></div>
      </section>

      <section class="v4-card v4-learncard">
        <div class="v4-card-head"><h3>AI 学习</h3><span>Day ${day.d}/${AI_PLAN.length}</span></div>
        <div class="v4-learn-title">${esc(day.t)}</div>
        <div class="v4-learn-sub">${esc(day.s)}</div>
        <div class="v4-learn-task">${esc(day.task)}</div>
        <button class="v4-ghost" id="v4ToLearn">开始 30 分钟 →</button>
      </section>

      <section class="v4-card v4-sixcard">
        <div class="v4-card-head"><h3>六维</h3><span>身体 · 学习 · 饮食深</span></div>
        ${sixRows()}
      </section>

      <section class="v4-card v4-plancard">
        <div class="v4-card-head"><h3>本周</h3><span>${phaseText()}</span></div>
        <div class="v4-plan">${weekPlanMini()}</div>
        <button class="v4-ghost" id="v4ToLearn2">继续 AI →</button>
      </section>
    </div>`;
    hideV3('sixGrid'); hideV3('statusCard'); hideV3('threeCard'); hideV3('tipCard');
    ['tab-diet', 'tab-badge'].forEach(id => { const el = $('#' + id); if (el) el.style.display = 'none'; });
    const nextBtn = $('#v4Next');
    if (nextBtn) nextBtn.onclick = () => {
      if (!next) { openReport(); return; }
      if (next.k === 'diet') { const row = $('.v4row.dietrow'); if (row) { row.classList.add('pulse'); setTimeout(() => row.classList.remove('pulse'), 900); } return; }
      if (next.k === 'train') { switchTab('tab-train'); setTimeout(startTraining, 150); return; }
      if (next.k === 'morning') { startMorning(); return; }
      if (next.k === 'ai') { switchTab('tab-learn'); setTimeout(() => startAi(30), 200); return; }
      if (next.k === 'waist') { openRitual('养腰 10 分钟', 10, 5, WAIST_STEPS, () => markFive('waist')); return; }
    };
    $$('#hero [data-five]').forEach(el => el.onclick = (ev) => {
      if (ev.target.closest('[data-diet]')) return;
      const k = el.dataset.five;
      if (k === 'diet') { const row = el; if (row) { row.classList.add('pulse'); setTimeout(() => row.classList.remove('pulse'), 900); } return; }
      if (k === 'train') { switchTab('tab-train'); setTimeout(startTraining, 120); return; }
      if (k === 'morning') { startMorning(); return; }
      if (k === 'ai') { switchTab('tab-learn'); setTimeout(() => startAi(30), 200); return; }
      if (k === 'waist') { openRitual('养腰 10 分钟', 10, 5, WAIST_STEPS, () => markFive('waist')); return; }
    });
    $$('#hero [data-diet]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); toggleDiet(b.dataset.diet); });
    const tt = $('#v4ToTrain'); if (tt) tt.onclick = () => switchTab('tab-train');
    const tl = $('#v4ToLearn'); if (tl) tl.onclick = () => switchTab('tab-learn');
    const tl2 = $('#v4ToLearn2'); if (tl2) tl2.onclick = () => switchTab('tab-learn');
    const dg = $('#v4DietGuide'); if (dg) dg.onclick = openDietGuide;
    const rp = $('#v4Report'); if (rp) rp.onclick = openReport;
    renderLearn(); bindSix();
    try { renderRulesCard(); } catch (e) {}
    if (f.doneN === 5 && state.lastCelebrate !== today) { state.lastCelebrate = today; save({ silent: true }); setTimeout(celebrateFive, 250); }
  }

  function sixRows() {
    const c = check(); const done = c.done || {};
    const bodyN = [done.morning, done.train, done.waist].filter(Boolean).length;
    const dietN = (((c.five || {}).diet) ? Object.values(c.five.diet).filter(Boolean).length : 0);
    const rows = [
      { k: 'body', n: '身体', v: bodyN + '/3', p: bodyN / 3, c: '#4cc9a4' },
      { k: 'learn', n: '学习', v: done.ai ? '1/1' : '0/1', p: done.ai ? 1 : 0, c: '#9b8cff' },
      { k: 'diet', n: '饮食', v: dietN + '/3', p: dietN / 3, c: '#f0b429' },
      { k: 'mind', n: '心力', v: done.mind ? '已做' : '3 分钟', p: done.mind ? 1 : 0, c: '#ff9f6b' },
      { k: 'order', n: '秩序', v: done.order ? '已做' : '10 分钟', p: done.order ? 1 : 0, c: '#7ed6a5' },
      { k: 'relation', n: '关系', v: done.relation ? '本周已联系' : '本周 1 次', p: done.relation ? 1 : 0, c: '#f5c451' }
    ];
    return rows.map(x => `<div class="v4six" data-six="${x.k}">
      <span class="v4sixdot" style="background:${x.c}"></span><b>${x.n}</b>
      <div class="v4sixbar"><i style="width:${Math.round(x.p * 100)}%;background:${x.c}"></i></div>
      <span class="v4sixv">${x.v}</span></div>`).join('');
  }
  function bindSix() {
    $$('#hero [data-six]').forEach(el => el.onclick = () => {
      const k = el.dataset.six;
      if (k === 'mind') { openRitual('心力 3 分钟', 3, 3, [{ t: '坐下来，双脚踩地', s: 30 }, { t: '4-7-8 呼吸：吸 4、停 7、呼 8', s: 120 }, { t: '写一句今天最耗神的事', s: 30 }], () => markFive('mind')); return; }
      if (k === 'order') { openRitual('秩序 10 分钟', 10, 10, [{ t: '桌面清空', s: 240 }, { t: '厨房台面复位', s: 240 }, { t: '明天的三件事', s: 120 }], () => markFive('order')); return; }
      if (k === 'relation') { markFive('relation'); return; }
      if (k === 'learn') { switchTab('tab-learn'); return; }
    });
  }
  function weekPlanMini() {
    const days = [['周一', '下肢/臀'], ['周二', '推 + 核心'], ['周三', '快走'], ['周四', '拉 + 核心'], ['周五', '全身'], ['周六', '长走/拉伸'], ['周日', '休息 + 复盘']];
    return days.map(([d, n], i) => `<div class="v4-planrow ${i === (new Date(today + 'T00:00:00').getDay() + 6) % 7 ? 'today' : ''}"><span>${d}</span><b>${n}</b></div>`).join('');
  }

  const WAIST_STEPS = [
    { t: '猫牛：慢慢拱背、塌腰', s: 60, img: ['ex/Cat_Stretch/0.jpg', 'ex/Cat_Stretch/1.jpg'] },
    { t: '鸟狗：对侧手脚伸出去（示意）', s: 120, img: ['ex/Superman/0.jpg', 'ex/Superman/1.jpg'] },
    { t: '死虫：腰贴地，对侧手脚', s: 120, img: ['ex/Dead_Bug/0.jpg', 'ex/Dead_Bug/1.jpg'] },
    { t: '臀桥：臀发力，停 2 秒', s: 120, img: ['ex/Butt_Lift_Bridge/0.jpg', 'ex/Butt_Lift_Bridge/1.jpg'] },
    { t: '髋屈肌拉伸：每侧 30 秒', s: 60, img: ['ex/Kneeling_Hip_Flexor/0.jpg', 'ex/Kneeling_Hip_Flexor/1.jpg'] },
    { t: '靠墙站：后脑、肩、臀贴墙（示意）', s: 120, img: ['ex/Standing_Pelvic_Tilt/0.jpg', 'ex/Standing_Pelvic_Tilt/1.jpg'] }
  ];
  function markFive(k) {
    const c = check(); c.done[k] = Date.now(); save(); renderAll();
  }
  function toggleDiet(k) {
    const c = check(); c.five.diet[k] = !c.five.diet[k]; save(); renderHero();
  }
  function startAi(minutes) {
    const day = currentAiDay();
    openRitual('AI · Day ' + day.d + ' · ' + day.t, 30, 15, [
      { t: '5 分钟：回忆昨天学的一个点', s: 300 },
      { t: '20 分钟：' + day.task, s: 1200 },
      { t: '5 分钟：写一句今天学到什么', s: 300 }
    ], () => markAi(minutes >= 30), minutes);
  }
  function markAi(full) {
    const c = check(); c.done.ai = Date.now(); c.aiMin = (c.aiMin || 0) + 30;
    const day = currentAiDay();
    if (full && !(state.aiDone || []).includes(day.d)) { state.aiDone = state.aiDone || []; state.aiDone.push(day.d); }
    save(); renderAll();
  }
  function celebrateFive() {
    if (state.lastCelebrate !== today) { state.lastCelebrate = today; save({ silent: true }); }
    const old = $('#v4Celebrate'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'v4Celebrate'; el.className = 'v4celebrate';
    el.innerHTML = `<div class="v4celebrate-card"><div class="v4celebrate-ic">✓</div><b>今天完成</b><span>五件都做了，链条没断。</span></div>`;
    document.body.appendChild(el);
    const colors = ['#f0b429', '#4cc9a4', '#9b8cff', '#ff9f6b', '#7ed6a5'];
    for (let i = 0; i < 44; i++) {
      const p = document.createElement('i'); p.className = 'v4conf';
      p.style.left = (20 + Math.random() * 60) + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * .35) + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      el.appendChild(p);
    }
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 600); }, 3400);
  }

  function openRitual(title, targetMin, minMin, steps, onDone, preset) {
    const old = $('#ritual'); if (old) old.remove();
    let seconds = (preset || targetMin) * 60, total = seconds, timer = null, running = false, finished = false;
    const el = document.createElement('div'); el.id = 'ritual'; el.className = 'ritual';
    el.innerHTML = `<div class="ritual-card">
      <div class="ritual-head"><button class="ritual-x" id="ritualClose">✕</button><div><b>${esc(title)}</b><span>${targetMin} 分钟 · 最低 ${minMin} 分钟</span></div></div>
      <div class="ritual-demo" id="ritualDemo"></div>
      <div class="ritual-ringwrap"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="84" class="rtrack"/><circle cx="100" cy="100" r="84" class="rprog" id="ritualProg"/></svg><div class="ritual-time" id="ritualTime">${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}</div></div>
      <div class="ritual-steps" id="ritualSteps">${steps.map((s, i) => `<div class="ritual-step" data-s="${i}"><i>${i + 1}</i><span>${esc(s.t)}</span><em>${Math.round(s.s / 60)}′</em></div>`).join('')}</div>
      <div class="ritual-btns"><button class="v4-main-btn" id="ritualStart">开始</button><button class="v4-ghost" id="ritualMin">只做最低 ${minMin} 分钟</button><button class="ritual-manual" id="ritualDone">已经做完了，直接打勾</button></div>
    </div>`;
    document.body.appendChild(el);
    const prog = $('#ritualProg'), time = $('#ritualTime'), demo = $('#ritualDemo'), stepBox = $('#ritualSteps');
    let lastStep = -1;
    const setDemo = (idx) => {
      if (!steps[idx] || !steps[idx].img) { demo.classList.remove('on'); return; }
      demo.classList.add('on');
      demo.innerHTML = `<div class="rd-imgs"><figure><img src="${steps[idx].img[0]}" alt="起始"><span>起始</span></figure><figure><img src="${steps[idx].img[1]}" alt="结束"><span>结束</span></figure></div><div class="rd-cap">${esc(steps[idx].t)}</div>`;
      $$('.ritual-step', el).forEach((x, i) => x.classList.toggle('now', i === idx));
    };
    const currentStep = () => {
      const elapsed = Math.max(0, total - seconds);
      let acc = 0;
      for (let i = 0; i < steps.length; i++) { acc += steps[i].s; if (elapsed < acc) return i; }
      return steps.length - 1;
    };
    const sync = () => {
      const idx = currentStep(); if (idx !== lastStep) { lastStep = idx; setDemo(idx); }
    };
    const draw = () => {
      time.textContent = `${pad2(Math.floor(Math.max(0, seconds) / 60))}:${pad2(Math.max(0, seconds) % 60)}`;
      const p = total ? Math.max(0, seconds) / total : 0;
      const C = 2 * Math.PI * 84;
      prog.style.strokeDasharray = C;
      prog.style.strokeDashoffset = C * (1 - p);
      sync();
    };
    draw();
    const close = () => { clearInterval(timer); el.remove(); };
    $$('.ritual-step', el).forEach((x, i) => x.onclick = () => {
      let acc = 0; for (let j = 0; j < i; j++) acc += steps[j].s;
      seconds = total - acc; draw();
    });
    $('#ritualClose').onclick = close;
    const start = (mins) => {
      clearInterval(timer); seconds = mins * 60; total = seconds; running = true; $('#ritualStart').textContent = '暂停'; draw();
      timer = setInterval(() => {
        if (!running) return; seconds--; draw();
        if (seconds <= 0) { clearInterval(timer); if (!finished) { finished = true; beep(); onDone && onDone(); close(); toast('完成，记下了'); } }
      }, 1000);
    };
    $('#ritualStart').onclick = () => { if (!running) start(Math.ceil(seconds / 60)); else { running = false; $('#ritualStart').textContent = '继续'; } };
    $('#ritualMin').onclick = () => start(minMin);
    $('#ritualDone').onclick = () => { if (finished) return; finished = true; onDone && onDone(); close(); toast('记下了'); };
  }


  function openReport() {
    const days = weekDatesV3();
    const fiveN = days.filter(d => fiveOf(d).doneN === 5).length;
    const trainN = days.filter(d => isTrainDone(d)).length;
    const mins = weekMinutesV3();
    const weight = state.profile.weight ? state.profile.weight + ' kg' : '—';
    const waist = state.profile.waist ? state.profile.waist + ' cm' : '未记';
    const rows = days.map(d => {
      const f = fiveOf(d);
      return `<div class="kv"><span>${d.slice(5)} · ${['一','二','三','四','五','六','日'][(new Date(d + 'T00:00:00').getDay() + 6) % 7]}</span><span>${f.doneN}/5 ${f.doneN === 5 ? '✓' : ''}</span></div>`;
    }).join('');
    openSheet('本周复盘', `<div class="v4-report">
      <div class="v4-report-grid"><div><b>${fiveN}</b><span>五件套 / 7 天</span></div><div><b>${trainN}</b><span>训练 / 5 天</span></div><div><b>${mins}</b><span>训练分钟</span></div></div>
      <div class="kv"><span>体重</span><span>${weight}</span></div>
      <div class="kv"><span>腰围</span><span>${waist}</span></div>
      <div class="v4-report-days">${rows}</div>
      <div class="hint">只调下周内容，不动 20:30。下周只改一件事。</div>
      <button class="btn" id="reportClose" style="margin-top:12px">收好，继续</button>
    </div>`, sheet => { const b = $('#reportClose', sheet); if (b) b.onclick = closeSheet; });
  }
  function openDietGuide() {
    openSheet('今天怎么吃', `<div class="v4-dietguide">
      <div class="v4-dg-row"><b>每餐</b><span>一掌蛋白 · 两拳蔬菜 · 一拳主食 · 一拇指脂肪</span></div>
      <div class="v4-dg-row"><b>每天</b><span>蛋白 96–128g；早餐先吃 25–30g；不喝含糖饮料</span></div>
      <div class="v4-dg-row"><b>示例</b><span>早：2 个鸡蛋 + 牛奶/酸奶 + 燕麦/水果<br>午：一掌鸡肉/鱼 + 两拳蔬菜 + 一拳米饭<br>晚：豆腐/鱼 + 蔬菜 + 少量主食<br>加餐：酸奶/坚果/水果</span></div>
      <div class="v4-dg-row"><b>外食</b><span>蒸/煮/烤，加一份蛋白，米饭减半，不点甜饮</span></div>
      <div class="v4-dg-row"><b>记录</b><span>只打勾 3 条；腰围每 2 周一次，体重不用天天称</span></div>
      <div class="hint">不记卡路里。每周 1 次自由餐，不补不愧疚。</div>
    </div>`, () => {});
  }

  /* 学习页 */
  function renderLearn() {
    const el = $('#learnCard'); if (!el) return;
    const day = currentAiDay();
    const done = state.aiDone || [];
    const doneToday = !!((check().done || {}).ai);
    el.innerHTML = `<div class="v4-card v4-learn-hero">
      <div class="v4-card-head"><h3>AI 学习</h3><span>Day ${day.d} / 7</span></div>
      <div class="v4-learn-title">${esc(day.t)}</div>
      <div class="v4-learn-sub">${esc(day.s)}</div>
      <div class="v4-learn-task">${esc(day.task)}</div>
      <div class="v4-learn-out">产出：${esc(day.out)}</div>
      <div class="v4-learn-btns"><button class="v4-main-btn" id="ai30">开始 30 分钟</button><button class="v4-ghost" id="ai15">最低 15 分钟</button></div>
      ${doneToday ? '<div class="v4-done-note">今天已经完成 AI 学习 ✓</div>' : ''}
    </div>
    <div class="v4-card"><div class="v4-card-head"><h3>7 天试运行</h3><span>${done.length}/7</span></div>
      <div class="v4-days">${AI_PLAN.map(x => `<button class="v4-day ${done.includes(x.d) ? 'done' : ''} ${x.d === day.d ? 'now' : ''}" data-day="${x.d}"><em>Day ${x.d}</em><b>${esc(x.t)}</b><span>${esc(x.out)}</span></button>`).join('')}</div>
      <div class="v4-hint">每天 30 分钟：5 分钟回忆 → 20 分钟动手 → 5 分钟记录。训练后先做 15 分钟复盘。</div>
    </div>
    <div class="v4-card"><div class="v4-card-head"><h3>12 周方向</h3></div>
      <div class="v4-road">原理 → 提示/上下文 → 评估 → RAG/知识库 → 工具/Agent → 项目</div>
      <div class="v4-hint">7 天后根据你的反馈定项目；不教“什么是 AI”这种小白内容。</div>
    </div>`;
    $('#ai30').onclick = () => startAi(30);
    $('#ai15').onclick = () => startAi(15);
    $$('#learnCard [data-day]').forEach(b => b.onclick = () => { const d = AI_PLAN.find(x => x.d === +b.dataset.day); if (d) { toast('Day ' + d.d + ' · ' + d.t); } });
  }

  function renderDiet() { hideV3('calCard'); hideV3('mealCard'); hideV3('foodCard'); hideV3('dietNoteCard'); }
  function renderBadge() { hideV3('badgeStats'); hideV3('badgeGrid'); hideV3('chartCard'); hideV3('extraCards'); }
  function renderExtras() {}
  function renderThree() {}
  function renderTip() { hideV3('tipCard'); }
  function renderStatus() { hideV3('statusCard'); }
  function renderSixGrid() { hideV3('sixGrid'); }
  setInterval(() => { try { if ($('#hero') && $('#hero').innerHTML) renderHero(); } catch (e) {} }, 30000);


  /* ================= 八段锦视频 ================= */
  function startMorning() {
    try { startBaduanjinVideo(); } catch (e) { startMorningAudio(); }
  }
  function startBaduanjinVideo() {
    const old = $('#bdj'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'bdj'; el.className = 'bdj';
    el.innerHTML = `<div class="bdj-stage">
      <video id="bdjVideo" src="baduanjin.mp4?v=20261026021000" poster="baduanjin.jpg" playsinline webkit-playsinline preload="metadata"></video>
      <button class="bdj-x" id="bdjClose">✕</button>
      <div class="bdj-cover" id="bdjCover">
        <div class="bdj-kicker">MORNING · 12 MIN</div>
        <div class="bdj-title">八段锦</div>
        <div class="bdj-sub">跟着视频做，动作幅度以腰不痛为准</div>
        <button class="bdj-start" id="bdjStart">开始跟练</button>
        <div class="bdj-tip">中途可以暂停；做完自动打勾</div>
      </div>
      <div class="bdj-ui" id="bdjUI">
        <div class="bdj-bar" id="bdjBarWrap"><i id="bdjBar"></i></div>
        <div class="bdj-row"><span id="bdjTime">00:00 / 12:08</span><button class="bdj-pause" id="bdjPause">暂停</button></div>
      </div>
      <div class="bdj-outro" id="bdjOutro">
        <div class="bdj-outro-ic">✓</div>
        <div class="bdj-outro-t">八段锦完成</div>
        <div class="bdj-outro-s">今天五件套已完成 1 件</div>
        <button class="bdj-start" id="bdjDone">收下，继续今天</button>
        <button class="bdj-replay" id="bdjReplay">再看一遍</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const v = $('#bdjVideo'), cover = $('#bdjCover'), ui = $('#bdjUI'), pause = $('#bdjPause'), bar = $('#bdjBar'), time = $('#bdjTime'), outro = $('#bdjOutro');
    let finished = false;
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60); };
    const close = () => { try { v.pause(); } catch (e) {} releaseWake(); el.remove(); };
    const markDone = () => { if (finished) return; finished = true; markFive('morning'); };
    const toggle = () => {
      if (v.paused) { v.play().catch(() => {}); pause.textContent = '暂停'; }
      else { v.pause(); pause.textContent = '继续'; }
    };
    $('#bdjClose').onclick = close;
    $('#bdjStart').onclick = () => {
      cover.classList.add('hide'); ui.classList.add('on');
      v.play().catch(() => { toast('点一下画面开始播放'); });
      requestWake();
    };
    pause.onclick = (e) => { e.stopPropagation(); toggle(); };
    v.onclick = toggle;
    v.onended = () => { try { v.pause(); } catch (e) {} markDone(); outro.classList.add('on'); pause.textContent = '重播'; };
    v.onerror = () => { close(); toast('视频加载失败，先用口令版'); startMorningAudio(); };
    v.onloadedmetadata = () => { time.textContent = '00:00 / ' + fmt(v.duration); };
    v.ontimeupdate = () => {
      const p = v.duration ? v.currentTime / v.duration : 0;
      bar.style.width = (p * 100) + '%';
      time.textContent = fmt(v.currentTime) + ' / ' + fmt(v.duration);
    };
    $('#bdjBarWrap').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); v.currentTime = (e.clientX - r.left) / r.width * (v.duration || 0); };
    $('#bdjReplay').onclick = () => { outro.classList.remove('on'); try { v.currentTime = 0; v.play(); } catch (e) {} pause.textContent = '暂停'; };
    $('#bdjDone').onclick = () => { markDone(); close(); };
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
