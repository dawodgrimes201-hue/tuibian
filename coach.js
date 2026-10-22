/* 蜕变 · 语音教练 —— 语音引擎 + 细颗粒度口令播放器 */
'use strict';

/* ---------- 语音引擎（Web Speech API） ---------- */
const TTS = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  enabled: true,
  rate: 1.02,
  voice: null,
  _voices: [],
  _unlocked: false,

  init() {
    if (!this.supported) return;
    const load = () => {
      this._voices = window.speechSynthesis.getVoices() || [];
      this.voice = this.pick();
    };
    load();
    try { window.speechSynthesis.addEventListener('voiceschanged', load); } catch (e) {}
    setTimeout(load, 400);
    setTimeout(load, 1500);
  },

  pick() {
    const vs = this._voices.length ? this._voices : (window.speechSynthesis.getVoices() || []);
    if (!vs.length) return null;
    const score = v => {
      const n = (v.name + ' ' + v.voiceURI).toLowerCase();
      let s = 0;
      if (/zh[-_]?cn|cmn|zh_hans|chinese/i.test(v.lang || '')) s += 10;
      else if (/^zh/i.test(v.lang || '')) s += 8;
      if (/ting|tingting|婷婷|xiaoxiao|晓晓|meijia|美佳|sinji/i.test(n)) s += 6;
      if (/female|女/i.test(n)) s += 1;
      if (v.localService) s += 1;
      return s;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  },

  /* iOS 需要一次用户手势里触发语音，先"空播"一次解锁 */
  unlock() {
    if (!this.supported || this._unlocked) return;
    this._unlocked = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0.01; u.lang = 'zh-CN'; u.rate = 2;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },

  stop() {
    try { if (typeof Voice !== 'undefined') Voice.stop(); } catch (e) {}
    if (!this.supported) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
  },

  est(text) {
    const n = String(text).replace(/\s/g, '').length;
    return Math.min(15000, 380 + n * 235 / Math.max(0.7, this.rate));
  },

  /* 优先用预生成的神经语音片段，没有再退回系统 TTS */
  async say(text, opt = {}) {
    if (!this.enabled || !text) return;
    try {
      if (typeof Voice !== 'undefined' && Voice.ready && Voice.has(text)) {
        const ok = await Voice.play(text);
        if (ok) return;
      }
    } catch (e) {}
    return this.synth(text, opt);
  },

  /* 系统 TTS（兜底） */
  synth(text, opt = {}) {
    if (!this.enabled || !text) return Promise.resolve();
    if (!this.supported) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        const u = new SpeechSynthesisUtterance(String(text));
        if (this.voice) u.voice = this.voice;
        u.lang = 'zh-CN';
        u.rate = (opt.rate || this.rate);
        u.pitch = opt.pitch || 1.0;
        u.volume = 1;
        let safety = setTimeout(finish, this.est(text) * 1.8 + 1200);
        u.onend = () => { clearTimeout(safety); finish(); };
        u.onerror = () => { clearTimeout(safety); finish(); };
        window.speechSynthesis.speak(u);
      } catch (e) { finish(); }
    });
  }
};

/* ---------- 提示音 ---------- */
const Beep = {
  ctx: null,
  unlock() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // iOS 需要真的播出一点东西才算解锁
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
    } catch (e) {}
  },
  tone(freq = 880, dur = 0.09, vol = 0.22, type = 'sine') {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  rep() { this.tone(760, 0.07, 0.16); },
  go() { this.tone(1040, 0.12, 0.2); this.tone(780, 0.1, 0.12); },
  finish() { this.tone(660, 0.12, 0.2); setTimeout(() => this.tone(990, 0.16, 0.2), 140); }
};

/* ---------- 小工具 ---------- */
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
function cnNum(n) {
  n = Math.round(n);
  if (n <= 10) return CN[n];
  if (n < 20) return '十' + CN[n - 10];
  if (n < 100) { const a = Math.floor(n / 10), b = n % 10; return CN[a] + '十' + (b ? CN[b] : ''); }
  if (n < 1000) { const a = Math.floor(n / 100), b = n % 100; return CN[a] + '百' + (b ? (b < 10 ? '零' + CN[b] : cnNum(b)) : ''); }
  return String(n);
}
const SET_CN = ['第一组', '第二组', '第三组', '第四组', '第五组', '第六组'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const speakTitle = t => String(t).replace(/\s*·\s*/g, '，').replace(/\s*\+\s*/g, '和');
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + ' 秒';
  const m = Math.floor(sec / 60), s2 = sec % 60;
  return s2 ? `${m} 分 ${s2} 秒` : `${m} 分钟`;
}

/* ---------- 时间轴生成 ---------- */
function variantOf(v) {
  return Object.assign({ mode: 'full', setsDelta: 0, repsDelta: 0, restDelta: 0, skip: [], countMode: null }, v || {});
}

function repsOf(ex, v) {
  let r = ex.reps || 0;
  if (v.mode === 'light') r = Math.max(5, r - 2);
  r = Math.max(4, r + v.repsDelta);
  return r;
}
function setsOf(ex, v) {
  let s = ex.sets || 1;
  if (v.mode === 'light') s = Math.max(1, s - 1);
  s = Math.max(1, s + v.setsDelta);
  return s;
}
function restOf(ex, v) {
  return Math.max(20, (ex.rest || 45) + v.restDelta);
}

function buildTimeline(rid, variant) {
  const r = ROUTINES[rid];
  const v = variantOf(variant);
  const blocks = [];
  const say = t => blocks.push({ k: 'say', t });
  const pause = s => blocks.push({ k: 'pause', s });

  if (!r) return blocks;

  if (r.kind === 'strength') {
    (r.warm || []).forEach(id => blocks.push(...exBlocks(EX[id], v, { warm: true })));
    say('热身完成。现在开始主训练，跟着我的口令做，动作慢一点，姿势比对重要。');
    (r.main || []).forEach(id => {
      if (v.skip.includes(id)) return;
      blocks.push(...exBlocks(EX[id], v, { intro: true }));
    });
    say('主训练完成。现在收尾，拉伸今天练到的部位，每个动作三十秒。');
    (r.cool || []).forEach(id => blocks.push(...exBlocks(EX[id], v, {})));
    say('今天的训练完成了。喝几口水，去洗个澡。明天可能有点酸，正常，别怕。');
    blocks.push({ k: 'done' });
    blocks.unshift({ k: 'say', t: `${speakTitle(r.title)}。今天大概 ${Math.round(estFromBlocks(blocks) / 60)} 分钟。先热身。` });
    return blocks;
  }

  if (r.kind === 'walk' || r.kind === 'belly' || r.kind === 'min') {
    say(`${speakTitle(r.title)}。`);
    (r.blocks || []).forEach(b => blocks.push(b));
    say('完成了。今天这条线没有断。');
    blocks.push({ k: 'done' });
    return blocks;
  }

  if (r.kind === 'back' || r.kind === 'stretch') {
    say(`${speakTitle(r.title)}。跟着口令，别赶。`);
    (r.seq || []).forEach(it => {
      if (typeof it === 'string') blocks.push(...exBlocks(EX[it], v, { intro: true }));
      else blocks.push(...exBlocks(EX[it.id], v, { intro: true, sets: it.sets, reps: it.reps, secs: it.secs }));
    });
    say('做完了。腰放松下来了吗？今天到这里。');
    blocks.push({ k: 'done' });
    return blocks;
  }

  if (r.kind === 'sleep' || r.kind === 'reset') {
    (r.blocks || []).forEach(b => blocks.push(b));
    blocks.push({ k: 'done' });
    return blocks;
  }

  if (r.kind === 'morning') {
    (r.blocks || []).forEach(b => blocks.push(b));
    blocks.push({ k: 'done' });
    return blocks;
  }

  return blocks;
}

function exBlocks(ex, v, opt = {}) {
  const out = [];
  if (!ex) return out;
  const sets = opt.sets != null ? opt.sets : (opt.warm ? (ex.sets || 1) : setsOf(ex, v));
  const reps = opt.reps != null ? opt.reps : (opt.warm ? (ex.reps || 0) : repsOf(ex, v));
  const rest = opt.warm ? (ex.rest || 0) : restOf(ex, v);
  const sides = ex.sides || 1;
  const perSide = sides > 1 ? '，每侧' : '';

  if (opt.warm) {
    if (ex.kind === 'move') out.push({ k: 'say', t: ex.cue });
    else out.push({ k: 'say', t: `${ex.n}。${ex.cue}` });
  } else {
    let intro = `${ex.n}。`;
    const holdSecs = opt.secs != null ? opt.secs : ex.secs;
    if (ex.kind === 'rep') intro += `${cnNum(sets)} 组，每组 ${cnNum(reps)} 次${perSide}。`;
    else if (ex.kind === 'hold') intro += `${cnNum(sets)} 组，每组 ${cnNum(holdSecs)} 秒${perSide}。`;
    else if (ex.kind === 'stretch') intro += `保持 ${cnNum(holdSecs)} 秒${perSide}。`;
    intro += ex.cue;
    out.push({ k: 'say', t: intro });
    if (opt.intro && ex.easy) out.push({ k: 'say', t: `做不了就${ex.easy}` });
    if (ex.bad && opt.intro) out.push({ k: 'say', t: `注意不要：${ex.bad}` });
  }

  for (let s = 0; s < sets; s++) {
    const setLabel = `${ex.n} · ${SET_CN[s] || '第' + (s + 1) + '组'}`;
    const hsec = opt.secs != null ? opt.secs : ex.secs;
    const tail = ex.kind === 'rep' ? `${cnNum(reps)} 次${perSide}`
      : ex.kind === 'move' ? (ex.secs >= 60 && ex.secs % 60 === 0 ? `${cnNum(ex.secs / 60)} 分钟` : `${cnNum(ex.secs)} 秒`)
      : `${cnNum(hsec)} 秒${perSide}`;
    out.push({ k: 'say', t: sets > 1 ? `${SET_CN[s] || '下一组'}，${tail}，开始。` : `开始，${tail}。` });
    out.push({ k: 'pause', s: 1.4 });

    if (ex.kind === 'rep') {
      for (let side = 0; side < sides; side++) {
        if (sides > 1) out.push({ k: 'say', t: side === 0 ? '左侧。' : '换另一侧。' });
        out.push({ k: 'reps', ex, reps, repSecs: ex.repSecs || 3, label: setLabel + (sides > 1 ? (side === 0 ? '（左）' : '（右）') : '') });
      }
    } else if (ex.kind === 'hold' || ex.kind === 'stretch') {
      for (let side = 0; side < sides; side++) {
        if (sides > 1) out.push({ k: 'say', t: side === 0 ? '左侧。' : '换另一侧。' });
        out.push({
          k: 'hold', secs: hsec, label: setLabel + (sides > 1 ? (side === 0 ? '（左）' : '（右）') : ''),
          countdown: true, beepEvery: 0, cues: []
        });
      }
    }
    if (ex.kind !== 'stretch') {
      const doneLines = ['完成。', '很好，这一组很干净。', '不错，继续。', '保持呼吸，别憋气。'];
      out.push({ k: 'say', t: doneLines[s % doneLines.length] });
    }

    if (s < sets - 1 && rest > 0) {
      out.push({ k: 'say', t: `休息 ${cnNum(rest)} 秒。` });
      out.push({ k: 'rest', secs: rest, label: `${setLabel} 完成 · 休息`,
        cues: rest >= 20 ? [{ at: rest - 10, t: '还有十秒。' }] : [] });
    }
  }
  return out;
}

function estimateMinutes(rid, variant) {
  return Math.max(2, Math.round(estFromBlocks(buildTimeline(rid, variant)) / 60));
}

function estFromBlocks(tl) {
  let secs = 0, says = 0;
  for (const b of tl) {
    if (b.k === 'say') says++;
    else if (b.k === 'pause') secs += b.s || 0;
    else if (b.k === 'reps') secs += (b.reps || 0) * (b.repSecs || 3);
    else if (b.k === 'hold' || b.k === 'rest') secs += b.secs || 0;
    else if (b.k === 'breath') secs += ((b.inhale || 0) + (b.hold || 0) + (b.exhale || 0)) * (b.rounds || 1);
  }
  return secs + says * 2.2;
}

/* ---------- 播放器 ---------- */
class CoachPlayer {
  constructor(opts = {}) {
    this.onState = opts.onState || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.countMode = opts.countMode || 'every';
    this.running = false;
    this.cancelled = false;
    this.paused = false;
  }

  stop() {
    this.cancelled = true;
    this.paused = false;
    TTS.stop();
  }
  togglePause() {
    this.paused = !this.paused;
    try {
      if (Beep.ctx) { this.paused ? Beep.ctx.suspend() : Beep.ctx.resume(); }
    } catch (e) {}
    this.emit();
  }

  emit(patch = {}) {
    this.onState(Object.assign({
      running: this.running, paused: this.paused,
      label: '', sub: '', progress: 0, remain: 0
    }, patch));
  }

  async wait(ms) {
    let remain = ms;
    while (remain > 0) {
      if (this.cancelled) throw new Error('cancel');
      if (this.paused) { await sleep(100); continue; }
      const step = Math.min(120, remain);
      await sleep(step);
      remain -= step;
    }
  }

  async play(rid, variant) {
    const timeline = Array.isArray(rid) ? rid : buildTimeline(rid, variant);
    this.timeline = timeline;
    this.i = 0;
    this.running = true;
    this.cancelled = false;
    this.paused = false;
    TTS.unlock(); Beep.unlock();
    try {
      if (typeof Voice !== 'undefined' && Voice.ready) {
        const texts = [];
        for (const b of timeline) {
          if (b.k === 'say') texts.push(b.t);
          if (b.cues) for (const c of b.cues) texts.push(c.t);
          if (b.k === 'breath') texts.push('吸气', '停', '呼气');
        }
        Voice.preload(texts);
      }
    } catch (e) {}
    const total = timeline.filter(b => b.k !== 'say').length || 1;
    this.emit({ label: '准备开始', sub: ROUTINES[rid] ? ROUTINES[rid].title : '', progress: 0 });
    try {
      for (let i = 0; i < timeline.length; i++) {
        if (this.cancelled) throw new Error('cancel');
        while (this.paused) { await sleep(120); if (this.cancelled) throw new Error('cancel'); }
        this.i = i;
        const b = timeline[i];
        await this.block(b, (i + 1) / timeline.length);
      }
      this.running = false;
      Beep.finish();
      this.onDone();
    } catch (e) {
      this.running = false;
      if (!this.cancelled) this.onDone();
    }
  }

  async block(b, prog) {
    if (this.cancelled) throw new Error('cancel');
    if (b.k === 'say') {
      this.emit({ label: b.t, sub: '', progress: prog });
      await TTS.say(b.t);
      return;
    }
    if (b.k === 'pause') { await this.wait((b.s || 1) * 1000); return; }

    if (b.k === 'reps') {
      const { ex, reps, repSecs } = b;
      for (let r = 1; r <= reps; r++) {
        if (this.cancelled) throw new Error('cancel');
        while (this.paused) { await sleep(100); if (this.cancelled) throw new Error('cancel'); }
        const left = reps - r + 1;
        this.emit({ label: b.label, sub: `第 ${r} / ${reps} 次`, progress: prog, remain: 0 });
        Beep.rep();
        let said = Promise.resolve();
        const countOn = this.countMode === 'every' || (this.countMode === 'half' && (r === 1 || r === 2 || left <= 3 || r % 5 === 0));
        if (countOn) said = TTS.say(cnNum(r));
        const start = Date.now();
        await this.wait(Math.max(300, repSecs * 1000 - (countOn ? 320 : 0)));
        await said;
        const used = Date.now() - start;
        if (used < repSecs * 1000 - 500) await this.wait(repSecs * 1000 - used);
      }
      return;
    }

    if (b.k === 'hold' || b.k === 'rest') {
      const total = b.secs;
      let elapsed = 0;
      const cues = (b.cues || []).slice().sort((a, b2) => a.at - b2.at);
      const tick = 100;
      while (elapsed < total * 1000) {
        if (this.cancelled) throw new Error('cancel');
        while (this.paused) { await sleep(100); if (this.cancelled) throw new Error('cancel'); }
        const remain = Math.ceil((total * 1000 - elapsed) / 1000);
        const pct = Math.min(1, elapsed / (total * 1000));
        this.emit({ label: b.label, sub: fmtClock(remain), progress: prog, remain, pct });
        if (cues.length && elapsed >= cues[0].at * 1000) {
          const c = cues.shift();
          TTS.say(c.t);
        }
        if (b.beepEvery && elapsed > 0 && elapsed % (b.beepEvery * 1000) < tick) Beep.tone(700, 0.06, 0.1);
        if (b.countdown) {
          if (remain <= 3 && remain > 0) Beep.tone(900, 0.08, 0.18);
        }
        await this.wait(tick);
        elapsed += tick;
      }
      if (b.countdown) Beep.go();
      return;
    }

    if (b.k === 'breath') {
      for (let r = 1; r <= b.rounds; r++) {
        this.emit({ label: '腹式呼吸', sub: `第 ${r}/${b.rounds} 轮 · 吸气 ${b.inhale} 秒`, progress: prog });
        await TTS.say('吸气');
        await this.breathPhase(b.inhale, 440, `第 ${r}/${b.rounds} 轮 · 吸气 ${b.inhale} 秒`);
        this.emit({ sub: `第 ${r}/${b.rounds} 轮 · 停 ${b.hold} 秒` });
        await TTS.say('停');
        await this.breathPhase(b.hold, 520, `第 ${r}/${b.rounds} 轮 · 停 ${b.hold} 秒`);
        this.emit({ sub: `第 ${r}/${b.rounds} 轮 · 呼气 ${b.exhale} 秒` });
        await TTS.say('呼气');
        await this.breathPhase(b.exhale, 330, `第 ${r}/${b.rounds} 轮 · 呼气 ${b.exhale} 秒`);
      }
      return;
    }

    if (b.k === 'done') {
      this.emit({ label: '完成', sub: '今天的动作做完了', progress: 1 });
      return;
    }
  }

  async breathPhase(secs, freq, sub) {
    const total = secs * 1000;
    let e = 0;
    while (e < total) {
      if (sub) this.emit({ sub });
      Beep.tone(freq, 0.14, 0.1, 'sine');
      await this.wait(Math.min(1000, total - e));
      e += 1000;
    }
  }
}

/* ---------- 今晚导览（把方案念出来） ---------- */
function buildIntroTimeline(plan) {
  const b = [];
  const items = (plan.blocks || []).filter(x => x.title);
  b.push({ k: 'say', t: `今晚给你排了 ${items.length} 件事。${plan.level === 'red' ? '但今天有个提醒，先别练。' : ''}` });
  items.forEach((x, i) => {
    b.push({ k: 'say', t: `第 ${cnNum(i + 1)} 件，${x.title}。${x.sub || ''}${x.why ? '，' + x.why : ''}` });
  });
  if (plan.diet && plan.diet.length) b.push({ k: 'say', t: '另外，今天饮食上注意：' + plan.diet.map(d => d.t || d).join('；') });
  b.push({ k: 'say', t: '就这些。不用全做完，先做第一件。' });
  b.push({ k: 'done' });
  return b;
}
