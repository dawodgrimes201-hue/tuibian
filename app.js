/* 蜕变 · 语音教练 —— 界面与状态 */
(function () {
  'use strict';
  const LS = 'tb_coach_v2';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 状态 ---------- */
  function defaultState() {
    return {
      v: 2,
      profile: { height: 178, weight: 80, targetLow: 74, targetHigh: 78, intake: {} },
      checkins: {}, sessions: [], weekly: {}, belly: [],
      settings: { voice: true, rate: 1.02, count: 'every', move: '19:00', wind: '22:30', intensity: 'auto', persona: 'female' }
    };
  }
  let state = load();
  let today = R.today();
  let plan = null;
  let draft = { symptoms: [], energy: 3, timeMin: 90, sleepHours: 7, bellyLevel: 0 };
  let player = null;
  let wakeLock = null;
  let playerMeta = null;

  function load() {
    try {
      const raw = localStorage.getItem(LS);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      return Object.assign(d, s, {
        profile: Object.assign(d.profile, s.profile || {}),
        settings: Object.assign(d.settings, s.settings || {})
      });
    } catch (e) { return defaultState(); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) {} }

  const check = date => {
    const d = date || today;
    if (!state.checkins[d]) state.checkins[d] = { done: {} };
    if (!state.checkins[d].done) state.checkins[d].done = {};
    return state.checkins[d];
  };

  /* ---------- 通用 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }
  function speak(text) {
    if (!state.settings.voice) return;
    TTS.unlock(); TTS.stop(); TTS.say(text);
  }
  function badge(level, text) { return `<span class="badge ${level}">${esc(text)}</span>`; }
  let seqToken = 0;
  async function speakSeq(arr) {
    const my = ++seqToken;
    for (const t of arr) {
      if (my !== seqToken) return;
      await TTS.say(t);
      await new Promise(r => setTimeout(r, 120));
    }
  }
  function introCueTexts(p) {
    const out = ['今晚这样排。'];
    const ords = ['第一件', '第二件', '第三件', '第四件', '第五件', '第六件'];
    (p.blocks || []).forEach((b, i) => {
      out.push(ords[i] || '然后');
      out.push(speakTitle(String(b.title).replace(/（[^）]*）/g, '')));
    });
    if (p.level === 'red') out.push('今天先别练，去门诊看看。');
    else if (p.whySay) out.push(p.whySay);
    out.push('不用全做完，先做一件。');
    return out;
  }

  /* ---------- 启动 ---------- */
  let inited = false;
  function init() {
    if (inited) return; inited = true;
    TTS.supported && TTS.init();
    TTS.rate = state.settings.rate;
    TTS.enabled = state.settings.voice;
    if (typeof Voice !== 'undefined') Voice.init(state.settings.persona || 'female').then(() => renderMe());
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {});
      }).catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {});
    }
    window.addEventListener('offline', () => toast('已离线，离线包照常能用'));
    window.addEventListener('online', () => toast('网络回来了'));
    bindNav(); bindPlayer(); bindLog(); bindProgress(); bindMe(); bindIntake();
    renderAll();
    setInterval(() => {
      const t = R.today();
      if (t !== today) { today = t; renderAll(); }
      else { renderTimelineNow(); }
    }, 30000);
  }

  function renderAll() {
    today = R.today();
    plan = tonightPlan(state, today);
    renderHero(); renderOfflineBanner(); renderSnap(); renderPlan(); renderWhy(); renderDiet();
    renderTimeline(); renderTip(); renderCoach(); renderLog(); renderProgress(); renderMe();
  }

  /* ---------- 今晚：hero ---------- */
  function renderHero() {
    const left = R.days(today, APP.end);
    $('#heroDays').textContent = left > 0 ? left : 0;
    const wd = R.wd(today);
    const week = Math.min(15, Math.max(1, Math.ceil((R.days(APP.start, today) + 1) / 7)));
    $('#topDate').textContent = R.cn(today);
    $('#heroTitle').textContent = `第 ${week} 周 · 今天把五条线各碰一下`;
    $('#heroSub').textContent = `${R.cn(today)} · 下班之后的时间，做一件也算赢`;
    const b = [badge(plan.level === 'red' ? 'red' : plan.level === 'yellow' ? 'yellow' : 'green', plan.statusLabel)];
    if (plan.why) b.push(badge('', plan.why));
    if (!state.profile.intake || !Object.keys(state.profile.intake).length) b.push(badge('yellow', '先让我了解你 · 2 分钟'));
    $('#heroBadges').innerHTML = b.join('');
  }

  async function renderOfflineBanner() {
    const el = $('#offlineBanner');
    if (!el) return;
    const st = await refreshOfflineStatus();
    if (!st || st.have >= st.total) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card" style="border-color:rgba(240,180,41,.35);background:linear-gradient(180deg,rgba(240,180,41,.10),rgba(13,18,32,.9))">
      <h3><span>先做一次：把 App 装到手机里</span><span class="more">${st.have}/${st.total}</span></h3>
      <div class="hint" style="margin-bottom:8px">下载离线语音包（约 9 MB）。下完之后，<b>Mac 关机、没网也能跟着练</b>，不用再连家里这台电脑。</div>
      <button class="btn" id="btnOfflinePack2">一键下载离线包</button>
    </div>`;
    const b = $('#btnOfflinePack2');
    if (b) b.onclick = downloadOfflinePack;
  }

  /* ---------- 今晚：状态快照 ---------- */
  function renderSnap() {
    const c = check();
    const filled = !!c.quick;
    const el = $('#snapCard');
    if (!filled) {
      const sleepOpts = [['<5.5', 5], ['5.5–6.5', 6], ['6.5–7.5', 7], ['>7.5', 8]];
      const timeOpts = [[90, '90 分钟'], [60, '1 小时'], [30, '半小时'], [10, '几乎没时间']];
      el.innerHTML = `
        <h3><span>① 30 秒 · 今天什么状态</span><span class="more">决定今晚怎么排</span></h3>
        <div class="q">
          <div class="lab"><span>昨晚睡了多久</span><span class="spk" data-spk="昨晚睡了多久？请选择。">🔊</span></div>
          <div class="chips" id="dSleep">${sleepOpts.map(o => `<button class="chip" data-v="${o[1]}">${o[0]} 小时</button>`).join('')}</div>
        </div>
        <div class="q">
          <div class="lab"><span>今早身体有什么信号（可多选）</span></div>
          <div class="chips" id="dSym">${['没什么', '肚子疼', '肚子胀', '腰酸', '腰疼到腿', '头痛', '乏力'].map(s => `<button class="chip" data-v="${s}">${s}</button>`).join('')}</div>
        </div>
        <div class="q">
          <div class="lab"><span>今天精力</span><span id="dEnergyTxt">3 / 5</span></div>
          <div class="chips" id="dEnergy">${[1, 2, 3, 4, 5].map(n => `<button class="chip" data-v="${n}">${n}</button>`).join('')}</div>
        </div>
        <div class="q">
          <div class="lab"><span>今晚能腾出多久</span></div>
          <div class="chips" id="dTime">${timeOpts.map(o => `<button class="chip" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>
        </div>
        <button class="btn" id="btnMakePlan">按我的状态排今晚</button>
        <button class="btn ghost" id="btnPreviewVoice" style="margin-top:8px">先听一句</button>`;
      el.querySelectorAll('#dSleep .chip').forEach(b => b.onclick = () => { draft.sleepHours = +b.dataset.v; pickOne($('#dSleep'), b); });
      el.querySelectorAll('#dSym .chip').forEach(b => b.onclick = () => {
        const v = b.dataset.v;
        if (v === '没什么') { draft.symptoms = []; el.querySelectorAll('#dSym .chip').forEach(x => x.classList.remove('on')); b.classList.add('on'); return; }
        b.classList.toggle('on');
        draft.symptoms = $$('#dSym .chip.on').map(x => x.dataset.v);
      });
      el.querySelectorAll('#dEnergy .chip').forEach(b => b.onclick = () => {
        draft.energy = +b.dataset.v; pickOne($('#dEnergy'), b);
        $('#dEnergyTxt').textContent = draft.energy + ' / 5';
      });
      el.querySelectorAll('#dTime .chip').forEach(b => b.onclick = () => { draft.timeMin = +b.dataset.v; pickOne($('#dTime'), b); });
      // 默认值
      pickOne($('#dSleep'), el.querySelector('#dSleep .chip[data-v="7"]'));
      pickOne($('#dEnergy'), el.querySelector('#dEnergy .chip[data-v="3"]'));
      pickOne($('#dTime'), el.querySelector('#dTime .chip[data-v="90"]'));
      draft.symptoms = [];
      $('#btnMakePlan').onclick = makePlan;
      $('#btnPreviewVoice').onclick = () => speak('今天状态怎么样？点几下就好，我按你的状态排今晚。');
      return;
    }
    const syms = (c.symptoms || []).join('、') || '没什么';
    const sh = c.sleepHours || '';
    el.innerHTML = `
      <h3><span>今天的状态</span><span class="more">已按状态排好</span></h3>
      <div class="sum">
        ${badge('', sh ? `睡 ${sh} 小时` : '睡眠未记')}
        ${badge('', `精力 ${c.energy || 3}/5`)}
        ${badge('', `今晚 ${c.timeMin || 90} 分钟`)}
        ${badge(c.symptoms && c.symptoms.length ? 'yellow' : '', syms)}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn ghost small" id="btnReplan">改一下状态</button>
        <button class="btn small blue" id="btnIntro">▶ 听今晚安排</button>
      </div>`;
    $('#btnReplan').onclick = () => { delete c.quick; save(); renderSnap(); renderPlan(); };
    $('#btnIntro').onclick = playIntro;
  }
  function pickOne(wrap, el) {
    if (!wrap || !el) return;
    wrap.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
    el.classList.add('on');
  }

  function makePlan() {
    const c = check();
    c.quick = true;
    c.symptoms = draft.symptoms.slice();
    c.energy = draft.energy;
    c.timeMin = draft.timeMin;
    if (draft.sleepHours != null) c.sleepHours = draft.sleepHours;
    if (c.symptoms.includes('肚子疼')) c.bellyLevel = c.bellyLevel || 2;
    save();
    renderAll();
    Beep.unlock(); TTS.unlock(); TTS.stop();
    speakSeq(introCueTexts(tonightPlan(state, today)));
    toast('已按你的状态重排今晚');
  }

  function makeSummarySpeech() {
    const p = tonightPlan(state, today);
    const b = p.blocks.map((x, i) => `第${'一二三四五'[i] || (i + 1)}件，${x.title}`).join('；');
    return `好，按你今天的状态，今晚这样排：${b}。${p.why ? '调整原因：' + p.why + '。' : ''}不用全做完，先做运动这件。`;
  }
  /* ---------- 今晚：方案 ---------- */
  function renderPlan() {
    const c = check();
    const el = $('#planCard');
    if (!c.quick) {
      el.innerHTML = `<div class="card"><h3><span>② 今晚的安排</span></h3>
        <div class="empty">先勾一下上面那 30 秒，我给你排。</div></div>`;
      return;
    }
    const blocks = plan.blocks || [];
    const doneCount = blocks.filter(b => c.done && c.done[b.key]).length;
    el.innerHTML = `<div class="card">
      <h3><span>② 今晚的安排</span><span class="more">${doneCount}/${blocks.length} 完成</span></h3>
      <div class="plan">${blocks.map(b => {
        const dim = DIMS.find(d => d.key === b.dim) || DIMS[0];
        const done = !!(c.done && c.done[b.key]);
        const canVoice = !!(b.rid || b.voice);
        return `<div class="pitem ${done ? 'done' : ''}">
          <div class="dot" style="background:${dim.color}"></div>
          <div class="body">
            <div class="ttl">${esc(b.title)}</div>
            <div class="sub">${esc(b.sub || '')}</div>
            ${b.why ? `<div class="why">${esc(b.why)}</div>` : ''}
            <div class="act">
              ${canVoice ? `<button class="voicebtn" data-play="${b.key}">▶ 语音开始</button>` : ''}
              <button class="checkbtn ${done ? 'on' : ''}" data-done="${b.key}">${done ? '已做完' : '做完了'}</button>
            </div>
          </div>
        </div>`;
      }).join('')}</div>
    </div>`;
    $$('#planCard [data-play]').forEach(btn => btn.onclick = () => startBlock(btn.dataset.play));
    $$('#planCard [data-done]').forEach(btn => btn.onclick = () => {
      const k = btn.dataset.done;
      const cc = check();
      if (cc.done[k]) delete cc.done[k]; else { cc.done[k] = Date.now(); markSession(k); }
      save(); renderPlan(); renderProgress();
    });
  }

  function markSession(key) {
    const b = (plan.blocks || []).find(x => x.key === key);
    if (b && b.rid) {
      state.sessions.push({ date: today, rid: b.rid, ts: Date.now() });
      save();
    }
  }

  function startBlock(key) {
    const b = (plan.blocks || []).find(x => x.key === key);
    if (!b) return;
    playerMeta = { key };
    if (b.rid) {
      const r = ROUTINES[b.rid];
      openPlayer(r.title, b.rid, b.variant || { mode: 'full' });
    } else if (b.voice) {
      openPlayer('提示', b.voice.map(t => ({ k: 'say', t })).concat([{ k: 'done' }]));
    }
  }

  function playIntro() {
    playerMeta = { intro: true };
    openPlayer('今晚安排', introCueTexts(plan).map(t => ({ k: 'say', t })).concat([{ k: 'done' }]));
  }

  /* ---------- 今晚：为什么 / 饮食 ---------- */
  function renderWhy() {
    const el = $('#whyCard');
    const c = check();
    if (!c.quick) { el.innerHTML = ''; return; }
    const items = [];
    if (plan.why) items.push(`<div class="note info"><span class="ic">◐</span><div><b>为什么这么调：</b>${esc(plan.why)}</div></div>`);
    (plan.notes || []).forEach(n => {
      const ic = n.type === 'danger' ? '!' : n.type === 'warn' ? '△' : 'i';
      items.push(`<div class="note ${n.type}"><span class="ic">${ic}</span><div>${esc(n.t)}</div></div>`);
    });
    el.innerHTML = items.length ? `<div class="card"><h3><span>③ 军师的话</span></h3>${items.join('')}</div>` : '';
  }

  function renderDiet() {
    const el = $('#dietCard');
    const c = check();
    if (!c.quick || !(plan.diet || []).length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card"><h3><span>今天吃这几样注意</span><span class="more">针对你的记录</span></h3>
      ${plan.diet.map(d => `<div class="dietrow"><i></i><span>${esc(d.t)}</span></div>`).join('')}
    </div>`;
  }

  /* ---------- 今晚：时间轴 ---------- */
  function offWorkTime() {
    const it = (state.profile.intake || {}).offWork || '';
    if (/18:00/.test(it)) return '18:00';
    if (/18:30/.test(it)) return '18:30';
    if (/19:00/.test(it)) return '19:00';
    if (/20:00/.test(it)) return '20:00';
    return '18:30';
  }
  function addMin(hhmm, m) {
    const [h, mi] = hhmm.split(':').map(Number);
    let t = h * 60 + mi + m;
    t = ((t % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  }
  function renderTimeline() {
    const start = offWorkTime();
    const wind = state.settings.wind || '22:30';
    const rows = [
      [start, '到家 · 换衣服、洗手'],
      [addMin(start, 30), '晚饭（吃热的，七分饱）'],
      [addMin(start, 70), '运动 · 语音跟练'],
      [addMin(start, 115), '联系一个人'],
      [addMin(start, 140), '读 20 页'],
      [addMin(start, 170), '整理 10 分钟 + 记账'],
      [wind, '睡前流程 · 呼吸 + 一句']
    ];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    let nowIdx = -1;
    rows.forEach((r, i) => { if (nowMin >= toMin(r[0])) nowIdx = i; });
    $('#tlNow').textContent = nowIdx >= 0 ? '现在在：' + rows[nowIdx][1].split(' · ')[0] : '还没开始';
    $('#tlBody').innerHTML = rows.map((r, i) =>
      `<div class="tlrow ${i === nowIdx ? 'now' : ''}"><div class="tm">${r[0]}</div><div class="ds">${esc(r[1])}</div></div>`
    ).join('');
  }
  function renderTimelineNow() { if ($('#tab-tonight').classList.contains('on')) renderTimeline(); }

  /* ---------- 今晚：贴士 ---------- */
  function renderTip() {
    const i = Math.abs(R.days(APP.start, today)) % TIPS.length;
    const t = TIPS[i];
    $('#tipRef').textContent = `第 ${t.ref} 条`;
    $('#tipTxt').textContent = t.t;
  }

  /* ---------- 教练页 ---------- */
  function renderCoach() {
    const list = $('#coachList');
    const groups = [
      ['力量（隔天做）', ['strengthA', 'strengthB', 'strengthC']],
      ['有氧', ['walk', 'longwalk']],
      ['腰背与恢复', ['back10', 'stretch10', 'reset90']],
      ['睡前 / 晨间', ['sleep3', 'morning2']],
      ['保底', ['minimal20', 'bellyWalk']]
    ];
    list.innerHTML = groups.map(([title, ids]) => `
      <div class="card">
        <h3><span>${title}</span></h3>
        ${ids.map(id => {
          const r = ROUTINES[id];
          return `<div class="pitem">
            <div class="body">
              <div class="ttl">${esc(r.title)}</div>
              <div class="sub">${r.minutes} 分钟 · ${r.kind === 'strength' ? '有组数、次数、组间休息口令' : '全语音引导'}</div>
            </div>
            <div style="display:flex;align-items:center"><button class="voicebtn" data-rid="${id}">▶</button></div>
          </div>`;
        }).join('')}
      </div>`).join('');
    $$('#coachList [data-rid]').forEach(b => b.onclick = () => manualPlay(b.dataset.rid));
    const mode = state.settings.intensity || 'auto';
    $$('#intensityChips .chip').forEach(c => {
      c.classList.toggle('on', c.dataset.mode === mode);
      c.onclick = () => {
        state.settings.intensity = c.dataset.mode; save();
        $$('#intensityChips .chip').forEach(x => x.classList.toggle('on', x === c));
        toast(c.dataset.mode === 'light' ? '手动模式：减量' : c.dataset.mode === 'minimal' ? '手动模式：保底' : '手动模式：完整');
      };
    });
  }
  function manualPlay(rid) {
    const mode = state.settings.intensity || 'auto';
    const v = { mode: mode === 'auto' ? 'full' : mode === 'minimal' ? 'light' : mode };
    playerMeta = { key: 'manual:' + rid };
    openPlayer(ROUTINES[rid].title, rid, v);
  }

  /* ---------- 播放器 ---------- */
  function openPlayer(title, ridOrTimeline, variant) {
    $('#player').classList.add('on');
    $('#pTitle').textContent = title;
    $('#pBig').textContent = '准备开始';
    $('#pSub').textContent = '';
    $('#pBar').style.width = '0';
    $('#pPause').textContent = '暂停';
    $('#pNote').textContent = '🔊 音量开到一半以上 · 屏幕自动常亮';
    requestWake();
    player = new CoachPlayer({
      countMode: state.settings.count || 'every',
      onState: s => {
        if (s.label) $('#pBig').textContent = s.label;
        if (s.sub !== undefined) $('#pSub').textContent = s.sub;
        if (typeof s.pct === 'number') $('#pBar').style.width = Math.round(s.pct * 100) + '%';
        else if (typeof s.progress === 'number') $('#pBar').style.width = Math.round(Math.min(1, s.progress) * 100) + '%';
        $('#pPause').textContent = s.paused ? '继续' : '暂停';
      },
      onDone: () => finishPlayer()
    });
    player.play(ridOrTimeline, variant || { mode: 'full' });
  }

  function finishPlayer() {
    const meta = playerMeta || {};
    if (meta.key && !String(meta.key).startsWith('manual:')) {
      const c = check();
      c.done[meta.key] = Date.now();
      markSession(meta.key);
      save();
      renderPlan(); renderProgress();
      toast('完成，记下了');
    } else if (meta.key && String(meta.key).startsWith('manual:')) {
      const rid = String(meta.key).slice(7);
      state.sessions.push({ date: today, rid, ts: Date.now() });
      save(); renderProgress();
      toast('完成，记下了');
    }
    setTimeout(closePlayer, 900);
  }

  function closePlayer() {
    if (player) { player.stop(); player = null; }
    TTS.stop();
    $('#player').classList.remove('on');
    releaseWake();
    playerMeta = null;
  }

  async function requestWake() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        $('#pWake').textContent = '屏幕保持常亮中';
      } else {
        $('#pWake').textContent = '请保持屏幕亮着（iOS 锁屏会停语音）';
      }
    } catch (e) {
      $('#pWake').textContent = '请保持屏幕亮着（锁屏会停语音）';
    }
  }
  function releaseWake() {
    try { wakeLock && wakeLock.release(); } catch (e) {}
    wakeLock = null;
    $('#pWake').textContent = '—';
  }

  function bindPlayer() {
    $('#pClose').onclick = closePlayer;
    $('#pStop').onclick = closePlayer;
    $('#pPause').onclick = () => { if (player) player.togglePause(); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && $('#player').classList.contains('on')) requestWake();
    });
  }

  /* ---------- 记录 ---------- */
  function bindLog() {
    $('#symChips').innerHTML = SYMPTOMS.concat(['无']).map(s => `<button class="chip" data-v="${s}">${s}</button>`).join('');
    $('#bellyFoods').innerHTML = BELLY_FOODS.map(s => `<button class="chip" data-v="${s}">${s}</button>`).join('');
    $$('#symChips .chip').forEach(b => b.onclick = () => { b.classList.toggle('on'); });
    $$('#bellyFoods .chip').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#inBelly').oninput = e => $('#bellyVal').textContent = ['不疼', '很轻', '轻', '中', '较重', '很疼'][+e.target.value];
    $('#inEnergy').oninput = e => $('#energyVal').textContent = e.target.value + ' / 5';
    $('#inMood').oninput = e => $('#moodVal').textContent = e.target.value + ' / 10';
    $('#inDrink').onclick = () => $('#inDrink').classList.toggle('on');
    $('#btnSaveLog').onclick = saveLog;
    $('#btnBelly').onclick = addBelly;
    $$('[data-speak]').forEach(el => el.onclick = () => speak(el.dataset.speak));
    $('#btnSaveWeek').onclick = saveWeek;
    $('#weekDimChips').innerHTML = DIMS.map(d => `<button class="chip" data-v="${d.key}">${d.name}</button>`).join('');
    $$('#weekDimChips .chip').forEach(b => b.onclick = () => { pickOne($('#weekDimChips'), b); });
  }

  function fillLog() {
    const c = check();
    if (c.sleepAt) $('#inSleepAt').value = c.sleepAt;
    if (c.wakeAt) $('#inWakeAt').value = c.wakeAt;
    if (c.weight) $('#inWeight').value = c.weight;
    if (c.steps) $('#inSteps').value = c.steps;
    if (c.screen) $('#inScreen').value = c.screen;
    if (c.reading) $('#inReading').value = c.reading;
    $('#inBelly').value = c.bellyLevel || 0;
    $('#inBelly').dispatchEvent(new Event('input'));
    $('#inEnergy').value = c.energy || 3;
    $('#inEnergy').dispatchEvent(new Event('input'));
    $('#inMood').value = c.mood || 7;
    $('#inMood').dispatchEvent(new Event('input'));
    $('#inDrink').classList.toggle('on', !!c.drink);
    $$('#symChips .chip').forEach(b => b.classList.toggle('on', (c.symptoms || []).includes(b.dataset.v)));
    $('#inNote').value = c.note || '';
    $('#logDate').textContent = R.cn(today);
  }

  function renderLog() {
    fillLog();
    const c = check();
    const syms = c.symptoms || [];
    if (syms.length && !syms.includes('无')) $$('#symChips .chip').forEach(b => b.classList.toggle('on', syms.includes(b.dataset.v)));
    const hist = [];
    for (let i = 0; i < 7; i++) {
      const d = R.add(today, -i);
      const x = state.checkins[d];
      if (!x) { hist.push(`<div class="hist"><div class="d">${R.cn(d).split(' ')[0]}</div><div class="s" style="color:var(--dim)">没记</div></div>`); continue; }
      const bits = [];
      if (x.sleepHours) bits.push(`睡 ${x.sleepHours}h`);
      if (x.energy) bits.push(`精力 ${x.energy}`);
      if (x.weight) bits.push(`${x.weight}kg`);
      if (x.symptoms && x.symptoms.length) bits.push(x.symptoms.join('/'));
      hist.push(`<div class="hist"><div class="d">${R.cn(d).split(' ')[0]}</div><div class="s">${esc(bits.join(' · ') || '有记录')}</div></div>`);
    }
    $('#histList').innerHTML = hist.join('');
    const bl = (state.belly || []).slice(-6).reverse();
    $('#bellyList').innerHTML = bl.length ? bl.map(b =>
      `<div class="hist"><div class="d">${esc(b.date.slice(5))} ${esc(b.at || '')}</div><div class="s">${esc((b.when || '') + ' · ' + (b.foods || []).join('/'))} · 疼 ${b.level}</div></div>`).join('')
      : '<div class="hint">还没记过。</div>';
  }

  function saveLog() {
    const c = check();
    c.sleepAt = $('#inSleepAt').value || c.sleepAt;
    c.wakeAt = $('#inWakeAt').value || c.wakeAt;
    if (c.sleepAt && c.wakeAt) c.sleepHours = sleepHours(c) || c.sleepHours;
    c.weight = +$('#inWeight').value || c.weight;
    c.steps = +$('#inSteps').value || c.steps;
    c.screen = +$('#inScreen').value || c.screen;
    c.reading = +$('#inReading').value || c.reading;
    c.bellyLevel = +$('#inBelly').value;
    c.energy = +$('#inEnergy').value;
    c.mood = +$('#inMood').value;
    c.drink = $('#inDrink').classList.contains('on');
    c.symptoms = $$('#symChips .chip.on').map(b => b.dataset.v).filter(s => s !== '无');
    c.note = $('#inNote').value;
    c.quick = true;
    if (c.weight) { state.profile.weight = c.weight; }
    save();
    toast('记下了，今晚方案已更新');
    renderAll();
  }

  function addBelly() {
    const foods = $$('#bellyFoods .chip.on').map(b => b.dataset.v);
    const level = +$('#inBelly').value;
    state.belly.push({ date: today, at: $('#bellyAt').value || '', when: $('#bellyWhen').value, foods, level });
    save(); renderLog();
    toast('腹痛日记 +1，这是给医生看的东西');
    $$('#bellyFoods .chip').forEach(b => b.classList.remove('on'));
  }

  function saveWeek() {
    const dim = ($('#weekDimChips .chip.on') || {}).dataset;
    const key = 'W' + Math.ceil((R.days(APP.start, today) + 1) / 7);
    state.weekly[key] = { date: today, dim: dim ? dim.v : '', note: $('#weekNote').value };
    save(); renderProgress();
    toast('本周复盘已保存');
  }

  /* ---------- 进度 ---------- */
  function bindProgress() { }

  function renderProgress() {
    const streak = checkinStreak(state, today);
    const sess = sessionsIn(state, today, 7).length;
    const checks = recentChecks(state, today, 14);
    const sleeps = checks.map(x => sleepHours(x.c)).filter(v => v);
    const sleepAvg = sleeps.length ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null;
    $('#stStreak').innerHTML = streak + '<small>天</small>';
    $('#stSess').innerHTML = sess + '<small>次</small>';
    $('#stSleep').innerHTML = sleepAvg ? sleepAvg.toFixed(1) + '<small>h</small>' : '—';
    const w = latestWeight();
    $('#stWeight').innerHTML = w ? w + '<small>kg</small>' : '—';

    // 体重曲线
    const pts = [];
    for (let i = 29; i >= 0; i--) {
      const d = R.add(today, -i);
      const c = state.checkins[d];
      if (c && c.weight) pts.push({ d, w: c.weight });
    }
    const svg = $('#weightChart');
    if (pts.length < 2) {
      svg.innerHTML = `<text x="150" y="55" text-anchor="middle" fill="#5d6884" font-size="11">再记一次体重，就能看到曲线（每周称一次就够）</text>`;
    } else {
      const ws = pts.map(p => p.w);
      const min = Math.min(...ws) - 0.5, max = Math.max(...ws) + 0.5;
      const P = pts.map((p, i) => {
        const x = 12 + (i / (pts.length - 1)) * 276;
        const y = 95 - ((p.w - min) / (max - min)) * 75;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      svg.innerHTML = `<polyline fill="none" stroke="#4cc9a4" stroke-width="2.2" stroke-linejoin="round" points="${P}" />
        <text x="12" y="12" fill="#5d6884" font-size="9">${max.toFixed(1)}</text>
        <text x="12" y="105" fill="#5d6884" font-size="9">${min.toFixed(1)}</text>`;
    }

    // 睡眠条
    const sb = [];
    for (let i = 13; i >= 0; i--) {
      const d = R.add(today, -i);
      const h = sleepHours(state.checkins[d] || {});
      sb.push(`<div title="${h || 0}h"><i style="height:${h ? Math.min(100, (h / 9) * 100) : 2}%;${h && h < 6.5 ? 'background:linear-gradient(180deg,#f0b429,rgba(240,180,41,.2))' : ''}"></i><span>${R.wd(d) === 0 ? '日' : R.wd(d)}</span></div>`);
    }
    $('#sleepBars').innerHTML = sb.join('');

    // 五维完成度
    const keys = ['move', 'mind', 'relation', 'order', 'growth'];
    const doneCount = {};
    keys.forEach(k => doneCount[k] = 0);
    for (let i = 0; i < 7; i++) {
      const c = state.checkins[R.add(today, -i)];
      if (!c || !c.done) continue;
      keys.forEach(k => { if (c.done[k]) doneCount[k]++; });
    }
    $('#dimBars').innerHTML = DIMS.map((d, i) => {
      const n = doneCount[keys[i]] || 0;
      const pc = Math.round(n / 7 * 100);
      return `<div class="dimbar"><div class="nm">${d.name}</div>
        <div class="track"><i style="width:${pc}%;background:${d.color}"></i></div>
        <div class="pc">${pc}%</div></div>`;
    }).join('');

    // 洞察
    const ins = insights(state, today);
    const icons = { danger: '!', warn: '△', info: 'i', good: '✓' };
    $('#insightList').innerHTML = ins.items.length
      ? ins.items.map(x => `<div class="note ${x.type}"><span class="ic">${icons[x.type] || 'i'}</span><div>${esc(x.t)}</div></div>`).join('')
      : `<div class="empty">记录几天之后，这里会告诉你规律。</div>`;

    // 周复盘历史
    const ws = Object.entries(state.weekly || {}).sort((a, b) => (a[1].date < b[1].date ? 1 : -1)).slice(0, 4);
    $('#weekHistory').innerHTML = ws.length ? ws.map(([k, v]) =>
      `<div class="hist"><div class="d">${esc(k)}</div><div class="s">${esc((DIMS.find(d => d.key === v.dim) || {}).name || '')} · ${esc(v.note || '')}</div></div>`).join('') : '';

    const th = tomorrowHint(state, today);
    $('#tomorrowHint').textContent = th.t;
    const wcur = state.weekly['W' + Math.ceil((R.days(APP.start, today) + 1) / 7)];
    if (wcur) { $('#weekNote').value = wcur.note || ''; const b = $(`#weekDimChips .chip[data-v="${wcur.dim}"]`); if (b) pickOne($('#weekDimChips'), b); }
  }

  function latestWeight() {
    for (let i = 0; i < 90; i++) {
      const c = state.checkins[R.add(today, -i)];
      if (c && c.weight) return c.weight;
    }
    return null;
  }

  /* ---------- 我 ---------- */
  function bindMe() {
    $('#tgVoice').onclick = () => {
      state.settings.voice = !state.settings.voice;
      $('#tgVoice').classList.toggle('on', state.settings.voice);
      TTS.enabled = state.settings.voice;
      save();
    };
    const rateEl = $('#inRate');
    if (rateEl) rateEl.oninput = e => {
      state.settings.rate = +e.target.value;
      TTS.rate = state.settings.rate;
      const rv = $('#rateVal'); if (rv) rv.textContent = (+e.target.value).toFixed(2).replace(/0$/, '');
      save();
    };
    $('#selCount').onchange = e => { state.settings.count = e.target.value; save(); };
    $('#btnTestVoice').onclick = () => { TTS.unlock(); Beep.unlock(); TTS.stop(); speakSeq(['这是蜕变教练的声音。今晚的力量训练二十分钟，第一组，十次。预备，开始。']); };
    $$('#personaChips .chip').forEach(b => b.onclick = () => {
      state.settings.persona = b.dataset.p;
      if (typeof Voice !== 'undefined') Voice.setPersona(b.dataset.p);
      save(); renderMe();
      TTS.unlock(); TTS.stop();
      speakSeq(['这是蜕变教练的声音。今晚的力量训练二十分钟，第一组，十次。预备，开始。']);
    });
    $('#setMove').onchange = e => { state.settings.move = e.target.value; save(); renderTimeline(); };
    $('#setWind').onchange = e => { state.settings.wind = e.target.value; save(); renderTimeline(); };
    $('#btnIcs').onclick = downloadIcs;
    $('#btnOfflinePack').onclick = downloadOfflinePack;
    $('#btnExport').onclick = exportData;
    $('#fileImport').onchange = e => importData(e.target.files[0]);
    $('#btnReset').onclick = () => {
      if (confirm('会清空所有记录，确定？')) { localStorage.removeItem(LS); state = defaultState(); renderAll(); toast('已清空'); }
    };
  }

  function renderMe() {
    const intake = state.profile.intake || {};
    const fam = { '一个人': '一个人住', '和伴侣': '和伴侣', '伴侣+孩子': '伴侣 + 孩子', '和父母': '和父母', '其他': '其他' }[intake.family] || '—';
    const rows = [
      ['身高 / 体重', `${state.profile.height} cm / ${state.profile.weight} kg`],
      ['下班到家', intake.offWork || '—'],
      ['作息', `${intake.sleepAt || '—'} 睡 · ${intake.wakeAt || '—'} 起`],
      ['早上信号', (intake.morningSign && intake.morningSign.length) ? intake.morningSign.join('、') : '—'],
      ['早饭', intake.breakfast || '—'],
      ['腰', intake.back || '—'],
      ['情绪', intake.mood || '—'],
      ['家里', fam],
      ['最想改', intake.focus || '—'],
      ['坚持不下来', (intake.fail && intake.fail.length) ? intake.fail.join('、') : '—'],
      ['装备', (intake.gear && intake.gear.length) ? intake.gear.join('、') : '—']
    ];
    $('#profileCard').innerHTML = `
      <h3><span>我了解的你</span><span class="more">${Object.keys(intake).length ? '已填 ' + Object.keys(intake).length + ' 项' : '还没开始'}</span></h3>
      ${rows.map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v)}</span></div>`).join('')}
      <button class="btn" id="btnIntake" style="margin-top:14px">${Object.keys(intake).length ? '重新语音问诊（会更准）' : '开始 2 分钟语音问诊'}</button>
      <div class="hint" style="margin-top:8px">问诊会念给你听，你点选就行。答得越准，方案越像你的。</div>`;
    $('#btnIntake').onclick = openIntake;
    $('#tgVoice').classList.toggle('on', state.settings.voice);
    const rateEl2 = $('#inRate');
    if (rateEl2) {
      rateEl2.value = state.settings.rate;
      const rv2 = $('#rateVal'); if (rv2) rv2.textContent = (+state.settings.rate).toFixed(2);
    }
    $('#selCount').value = state.settings.count || 'every';
    $('#setMove').value = state.settings.move || '19:00';
    $('#setWind').value = state.settings.wind || '22:30';
    const useClip = typeof Voice !== 'undefined' && Voice.ready;
    const p = state.settings.persona || 'female';
    $$('#personaChips .chip').forEach(c => c.classList.toggle('on', c.dataset.p === p));
    $('#voiceName').textContent = useClip ? `神经语音 ${Voice.count()} 句` : (TTS.supported ? '系统语音' : '不支持');
    refreshOfflineStatus();
    $('#voiceHint').textContent = TTS.supported
      ? '第一次点▶会没声音？先点「试听一句」解锁。iOS 锁屏后语音会停，所以训练时请保持屏幕亮着。'
      : '这台设备的浏览器不支持语音合成，会退化成提示音 + 大字提示。';
  }

  /* ---------- 语音问诊 ---------- */
  let intakeIdx = 0, intakeAns = {}, intakeMulti = [];
  function openIntake() {
    intakeIdx = 0; intakeAns = Object.assign({}, state.profile.intake || {});
    $('#intake').classList.add('on');
    renderIntake();
    TTS.unlock(); Beep.unlock();
  }
  function renderIntake() {
    const q = INTAKE[intakeIdx];
    if (!q) { finishIntake(); return; }
    $('#intakeProg').textContent = `第 ${intakeIdx + 1} / ${INTAKE.length} 题 · 答过的会自动记住`;
    const cur = intakeAns[q.id];
    intakeMulti = Array.isArray(cur) ? cur.slice() : (cur ? [cur] : []);
    $('#intakeBody').innerHTML = `
      <div style="font-size:19px;font-weight:800;line-height:1.5">${esc(q.q)} <span class="spk" id="qSpeak" style="color:var(--amber);font-size:15px">🔊</span></div>
      <div class="chips" style="margin-top:14px">${q.opts.map(o => `<button class="chip ${intakeMulti.includes(o) ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
      ${q.multi ? '<div class="hint" style="margin-top:8px">可以多选</div>' : ''}`;
    $$('#intakeBody .chip').forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      if (q.multi) {
        b.classList.toggle('on');
        intakeMulti = $$('#intakeBody .chip.on').map(x => x.dataset.v);
      } else {
        pickOne($('#intakeBody'), b);
        intakeMulti = [v];
        setTimeout(() => nextIntake(), 260);
      }
    });
    $('#qSpeak').onclick = () => { TTS.unlock(); TTS.stop(); speakSeq([q.q].concat(q.opts)); };
    $('#intakeNext').textContent = intakeIdx === INTAKE.length - 1 ? '完成' : '下一题';
    TTS.unlock(); speakSeq([q.q]);
  }
  function nextIntake() {
    const q = INTAKE[intakeIdx];
    if (intakeMulti.length) intakeAns[q.id] = q.multi ? intakeMulti : intakeMulti[0];
    intakeIdx++;
    renderIntake();
  }
  function bindIntake() {
    $('#intakeClose').onclick = () => { $('#intake').classList.remove('on'); TTS.stop(); };
    $('#intakeSkip').onclick = () => { intakeIdx++; renderIntake(); };
    $('#intakeNext').onclick = nextIntake;
    $('#intake').onclick = e => { if (e.target.id === 'intake') { $('#intake').classList.remove('on'); TTS.stop(); } };
  }
  function finishIntake() {
    state.profile.intake = intakeAns;
    save();
    $('#intake').classList.remove('on');
    renderAll();
    speak('好，我记住了。今天起，方案会跟着你的状态变。');
    toast('画像已更新');
  }

  /* ---------- 离线语音包 ---------- */
  async function swCache() {
    if (!('caches' in window)) return null;
    const names = await caches.keys();
    const mine = names.filter(n => n.startsWith('tb-offline-')).sort();
    if (!mine.length) return null;
    return caches.open(mine[mine.length - 1]);
  }

  function personaMap(m) {
    const persona = state.settings.persona || 'female';
    return (m && m.maps && m.maps[persona]) || {};
  }

  async function packPhrases() {
    try {
      const r = await fetch('voice/manifest.json', { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  let offlineStat = null, offlineStatAt = 0;
  async function refreshOfflineStatus(force) {
    if (!force && offlineStat && Date.now() - offlineStatAt < 20000) return offlineStat;
    const el = $('#offlineStatus');
    if (!el) return offlineStat;
    if (!('caches' in window)) { el.textContent = '此浏览器不支持'; return; }
    const m = await packPhrases();
    const map = personaMap(m);
    const total = Object.keys(map).length;
    if (!total) { el.textContent = '—'; return; }
    const cache = await swCache();
    if (!cache) { el.textContent = `0 / ${total}`; return; }
    let have = 0;
    const keys = [];
    for (const t of Object.keys(map)) keys.push(new URL(map[t], location.href).href);
    // 批量检查，避免 359 次串行太慢
    const chunk = 30;
    for (let i = 0; i < keys.length; i += chunk) {
      const part = keys.slice(i, i + chunk);
      const res = await Promise.all(part.map(k => cache.match(k)));
      have += res.filter(Boolean).length;
    }
    el.textContent = `${have} / ${total}`;
    const hint = $('#offlineHint');
    if (hint) hint.textContent = have >= total ? '已完整离线，Mac 关机也不影响。' : '还没下完，建议在家里 Wi-Fi 下点一次。';
    offlineStat = { have, total };
    offlineStatAt = Date.now();
    return offlineStat;
  }

  async function downloadOfflinePack() {
    const btn = $('#btnOfflinePack');
    const m = await packPhrases();
    const map = personaMap(m);
    const items = Object.values(map);
    if (!items.length) { toast('语音清单还没加载好，稍后再试'); return; }
    btn.disabled = true;
    let done = 0, failed = 0;
    const total = items.length;
    const label = (n) => `下载中 ${n} / ${total}`;
    btn.textContent = label(0);
    const queue = items.slice();
    const worker = async () => {
      while (queue.length) {
        const rel = queue.shift();
        try {
          const res = await fetch(rel, { cache: 'no-store' });
          if (!res.ok) failed++;
        } catch (e) { failed++; }
        done++;
        if (done % 9 === 0 || done === total) {
          btn.textContent = label(done);
          const st = $('#offlineStatus');
          if (st) st.textContent = `${done} / ${total}`;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    btn.disabled = false;
    btn.textContent = '重新检查 / 补齐离线包';
    offlineStat = null;
    await refreshOfflineStatus(true);
    renderOfflineBanner();
    toast(failed ? `下载完成，${failed} 句失败，可再点一次补齐` : '离线包好了，之后断网也能用');
  }

  /* ---------- 提醒 / 数据 ---------- */
  function downloadIcs() {
    const move = state.settings.move || '19:00';
    const wind = state.settings.wind || '22:30';
    const dt = R.parse(today);
    const fmt = (d, hm) => {
      const [h, m] = hm.split(':').map(Number);
      const x = new Date(d); x.setHours(h, m, 0, 0);
      return x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    };
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tuibian Coach//CN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', `UID:move-${Date.now()}@tuibian`, `DTSTAMP:${fmt(dt, '00:00')}`,
      `DTSTART:${fmt(dt, move)}`, `DTEND:${fmt(dt, addMin(move, 45))}`,
      'RRULE:FREQ=DAILY;COUNT=120', 'SUMMARY:运动 · 蜕变语音教练', 'DESCRIPTION:打开 App → 今晚 → 语音开始', 'END:VEVENT',
      'BEGIN:VEVENT', `UID:wind-${Date.now()}@tuibian`, `DTSTAMP:${fmt(dt, '00:00')}`,
      `DTSTART:${fmt(dt, wind)}`, `DTEND:${fmt(dt, addMin(wind, 10))}`,
      'RRULE:FREQ=DAILY;COUNT=120', 'SUMMARY:睡前流程 · 3 分钟呼吸', 'END:VEVENT',
      'BEGIN:VEVENT', `UID:week-${Date.now()}@tuibian`, `DTSTAMP:${fmt(dt, '00:00')}`,
      `DTSTART:${fmt(R.parse(R.add(today, (7 - R.wd(today)) % 7)), '20:30')}`, `DTEND:${fmt(R.parse(R.add(today, (7 - R.wd(today)) % 7)), '21:30')}`,
      'RRULE:FREQ=WEEKLY;COUNT=16', 'SUMMARY:周复盘 · 五条线哪条掉了', 'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '蜕变提醒.ics';
    a.click();
    toast('下载好了，用日历打开导入');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `蜕变数据-${today}.json`;
    a.click();
    toast('已导出');
  }
  function importData(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        state = Object.assign(defaultState(), s);
        save(); renderAll(); toast('导入成功');
      } catch (e) { toast('文件读不出来'); }
    };
    r.readAsText(file);
  }

  /* ---------- 导航 ---------- */
  function bindNav() {
    $$('.nav button').forEach(b => b.onclick = () => {
      $$('.nav button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      $$('.tab').forEach(t => t.classList.remove('on'));
      $('#' + b.dataset.tab).classList.add('on');
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (b.dataset.tab === 'tab-progress') renderProgress();
      if (b.dataset.tab === 'tab-log') renderLog();
      if (b.dataset.tab === 'tab-me') renderMe();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();
})();
