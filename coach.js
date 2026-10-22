/* 蜕变 · 语音：片段播放（预生成神经语音）+ 时间制训练引擎 + 舒缓背景音乐 */
'use strict';

/* ---------- 语音引擎 ---------- */
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
      if (v.localService) s += 1;
      return s;
    };
    return vs.slice().sort((a, b) => score(b) - score(a))[0] || null;
  },

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
        const safety = setTimeout(finish, this.est(text) * 1.8 + 1200);
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
  tick() { this.tone(760, 0.06, 0.12); },
  go() { this.tone(1040, 0.12, 0.18); this.tone(780, 0.1, 0.1); },
  finish() { this.tone(660, 0.12, 0.18); setTimeout(() => this.tone(990, 0.16, 0.18), 140); }
};

/* ---------- 舒缓背景音乐（实时合成，不用下载音频） ---------- */
const Music = {
  playing: false,
  mode: 'calm',
  master: null,
  nodes: [],
  timer: null,
  volume: 0.07,

  ctx() { Beep.unlock(); return Beep.ctx; },

  chords(mode) {
    const beat = [[110.00, 220.00, 261.63, 329.63],   // Am
                  [87.31, 174.61, 220.00, 261.63],    // F
                  [130.81, 196.00, 261.63, 329.63],   // C
                  [98.00, 196.00, 246.94, 293.66]];   // G
    const calm = [[110.00, 164.81, 261.63, 329.63],
                  [87.31, 130.81, 220.00, 261.63],
                  [98.00, 146.83, 246.94, 293.66],
                  [73.42, 146.83, 220.00, 293.66]];
    return mode === 'calm' ? calm : beat;
  },

  start(mode) {
    if (this.playing) this.stop();
    const ctx = this.ctx();
    if (!ctx) return;
    this.mode = mode || 'calm';
    this.playing = true;
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.mode === 'calm' ? 900 : 1300;
    filter.Q.value = 0.4;
    master.connect(filter); filter.connect(ctx.destination);
    this.master = master;
    master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 2.5);

    const prog = this.chords(this.mode);
    const chordDur = this.mode === 'calm' ? 9 : 7;
    let ci = 0;
    const playChord = () => {
      if (!this.playing) return;
      const ctx2 = this.ctx();
      const chord = prog[ci % prog.length]; ci++;
      const t = ctx2.currentTime;
      chord.forEach((f, idx) => {
        for (let d = 0; d < 3; d++) {
          const o = ctx2.createOscillator();
          const g = ctx2.createGain();
          o.type = idx === 0 ? 'sine' : 'triangle';
          o.frequency.value = f * (1 + (d - 1) * 0.0032);
          const v = idx === 0 ? 0.16 : 0.09;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(v, t + 2.2);
          g.gain.linearRampToValueAtTime(0.0001, t + chordDur + 1.6);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + chordDur + 1.8);
          this.nodes.push(o);
        }
      });
      if (this.nodes.length > 120) this.nodes = this.nodes.slice(-40);
    };
    playChord();
    this.timer = setInterval(playChord, chordDur * 1000 + 200);
  },

  stop() {
    this.playing = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try {
      if (this.master && Beep.ctx) {
        this.master.gain.cancelScheduledValues(Beep.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(0.0001, Beep.ctx.currentTime + 1.2);
      }
    } catch (e) {}
    const nodes = this.nodes.slice();
    this.nodes = [];
    setTimeout(() => {
      nodes.forEach(o => { try { o.stop(); } catch (e) {} });
      try { this.master && this.master.disconnect(); } catch (e) {}
      this.master = null;
    }, 1400);
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(0.3, v));
    try { if (this.master) this.master.gain.value = this.volume; } catch (e) {}
  }
};

/* ---------- 工具 ---------- */
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
const SET_CN = ['第一组', '第二组', '第三组', '第四组', '第五组'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} 秒`;
}

/* ---------- 时间轴 ---------- */
function buildTimeline(wid, variant) {
  const w = WORKOUTS[wid];
  const v = Object.assign({ mode: 'full' }, variant || {});
  const light = v.mode === 'light';
  const out = [];
  const say = t => out.push({ k: 'say', t });
  if (!w) return out;

  say(w.intro);
  say('准备开始，跟着屏幕上的时间做就行。');

  (w.blocks || []).forEach(b => {
    if (b.k === 'warmup') {
      say(`先热身，${b.name}，${cnNum(Math.round(b.secs / 60)) || ''}${b.secs >= 60 ? '分钟' : '秒'}。`);
      out.push({ k: 'work', secs: b.secs, label: b.name, cues: [] });
      return;
    }
    if (b.k === 'walk') {
      say(`${b.name}。`);
      out.push({ k: 'work', secs: b.secs, label: b.name, cues: (b.cues || []) });
      return;
    }
    if (b.k === 'ex') {
      const ex = EX[b.ex];
      let sets = b.sets;
      let rest = b.rest;
      if (light) { sets = Math.max(1, sets - 1); rest = rest + 10; }
      const sides = b.sides || 1;
      say(`${ex.n}，${cnNum(sets)} 组，每组 ${cnNum(b.secs)} 秒${sides > 1 ? '，每侧' : ''}。${ex.cue}`);
      for (let s = 0; s < sets; s++) {
        for (let side = 0; side < sides; side++) {
          if (sides > 1) say(side === 0 ? '左侧，开始。' : '换另一侧。');
          else say(s > 0 ? `${SET_CN[s] || '再来一组'}，开始。` : '开始。');
          const cues = [];
          if (b.secs >= 25) cues.push({ at: Math.floor(b.secs / 2), t: '一半。' });
          if (b.secs >= 15) cues.push({ at: b.secs - 10, t: '最后十秒。' });
          out.push({ k: 'work', secs: b.secs, label: `${ex.n} · ${SET_CN[s] || '第' + (s + 1) + '组'}${sides > 1 ? (side === 0 ? '（左）' : '（右）') : ''}`, cues });
        }
        if (s < sets - 1 && rest > 0) {
          say(`休息 ${cnNum(rest)} 秒。`);
          out.push({ k: 'rest', secs: rest, label: '休息' });
        }
      }
      return;
    }
    if (b.k === 'cool') {
      const ex = EX[b.ex];
      const sides = b.sides || 1;
      if (sides > 1) {
        say(`${ex.n}，左侧，${cnNum(b.secs)} 秒。`);
        out.push({ k: 'work', secs: b.secs, label: `${ex.n}（左）`, cues: [] });
        say('换另一侧。');
        out.push({ k: 'work', secs: b.secs, label: `${ex.n}（右）`, cues: [] });
      } else {
        say(`${ex.n}，${cnNum(b.secs)} 秒。`);
        out.push({ k: 'work', secs: b.secs, label: ex.n, cues: [] });
      }
    }
  });

  say('练完了。今天这条线没有断。去喝口水。');
  out.push({ k: 'done' });
  return out;
}

function estimateMinutes(wid, variant) {
  const tl = buildTimeline(wid, variant);
  let secs = 0, says = 0;
  tl.forEach(b => {
    if (b.k === 'say') says++;
    else if (b.k === 'work' || b.k === 'rest') secs += b.secs || 0;
  });
  return Math.max(3, Math.round((secs + says * 2.4) / 60));
}

/* ---------- 播放器 ---------- */
class CoachPlayer {
  constructor(opts = {}) {
    this.onState = opts.onState || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.running = false;
    this.cancelled = false;
    this.paused = false;
  }

  stop() { this.cancelled = true; this.paused = false; TTS.stop(); Music.stop(); }

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
      label: '', sub: '', pct: 0, remain: 0
    }, patch));
  }

  async phase(secs, freq, sub) {
    let e = 0;
    while (e < secs * 1000) {
      if (this.cancelled) throw new Error('cancel');
      while (this.paused) { await sleep(100); if (this.cancelled) throw new Error('cancel'); }
      this.emit({ sub });
      Beep.tone(freq, 0.12, 0.09);
      await this.wait(Math.min(1000, secs * 1000 - e));
      e += 1000;
    }
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

  async play(wid, variant, options = {}) {
    const timeline = Array.isArray(wid) ? wid : buildTimeline(wid, variant);
    this.running = true; this.cancelled = false; this.paused = false;
    TTS.unlock(); Beep.unlock();
    try {
      if (typeof Voice !== 'undefined' && Voice.ready) {
        const texts = [];
        timeline.forEach(b => {
          if (b.k === 'say') texts.push(b.t);
          if (b.cues) b.cues.forEach(c => texts.push(c.t));
        });
        Voice.preload(texts);
      }
    } catch (e) {}
    if (options.music) Music.start(options.music);
    this.emit({ label: '准备', sub: '', pct: 0 });
    try {
      for (const b of timeline) {
        if (this.cancelled) throw new Error('cancel');
        while (this.paused) { await sleep(100); if (this.cancelled) throw new Error('cancel'); }
        await this.block(b, timeline);
      }
      this.running = false;
      Beep.finish(); Music.stop();
      this.onDone();
    } catch (e) {
      this.running = false;
      Music.stop();
      if (!this.cancelled) this.onDone();
    }
  }

  async block(b, tl) {
    if (b.k === 'say') {
      this.emit({ label: b.t, sub: '' });
      await TTS.say(b.t);
      return;
    }
    if (b.k === 'work' || b.k === 'rest') {
      const total = b.secs;
      let elapsed = 0;
      const cues = (b.cues || []).slice().sort((a, b2) => a.at - b2.at);
      const tick = 100;
      while (elapsed < total * 1000) {
        if (this.cancelled) throw new Error('cancel');
        while (this.paused) { await sleep(100); if (this.cancelled) throw new Error('cancel'); }
        const remain = Math.ceil((total * 1000 - elapsed) / 1000);
        this.emit({
          label: b.label,
          sub: fmtClock(remain),
          pct: Math.min(1, elapsed / (total * 1000)),
          remain
        });
        while (cues.length && elapsed >= cues[0].at * 1000) TTS.say(cues.shift().t);
        if (b.k === 'work' && remain <= 3 && remain > 0 && elapsed % 1000 < tick) Beep.tick();
        if (b.k === 'rest' && remain === 10) TTS.say('还有十秒。');
        await this.wait(tick);
        elapsed += tick;
      }
      if (b.k === 'work') Beep.go();
      return;
    }
    if (b.k === 'breath') {
      for (let r = 1; r <= b.rounds; r++) {
        this.emit({ label: '腹式呼吸', sub: `第 ${r}/${b.rounds} 轮 · 吸气 4 秒` });
        await TTS.say('吸气');
        await this.phase(b.inhale, 440, `第 ${r}/${b.rounds} 轮 · 吸气`);
        this.emit({ sub: `第 ${r}/${b.rounds} 轮 · 停 2 秒` });
        await TTS.say('停');
        await this.phase(b.hold, 520, `第 ${r}/${b.rounds} 轮 · 停`);
        this.emit({ sub: `第 ${r}/${b.rounds} 轮 · 呼气 6 秒` });
        await TTS.say('呼气');
        await this.phase(b.exhale, 330, `第 ${r}/${b.rounds} 轮 · 呼气`);
      }
      return;
    }
    if (b.k === 'done') {
      this.emit({ label: '完成', sub: '', pct: 1 });
      return;
    }
  }
}
