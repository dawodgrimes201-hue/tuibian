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

/* ---------- 自然声（风 / 雨 / 海浪，实时合成，不用下载音频） ---------- */
const Music = {
  playing: false,
  mode: 'rain',
  master: null,
  nodes: [],
  timers: [],
  volume: 0.12,
  _noise: null,

  ctx() { Beep.unlock(); return Beep.ctx; },

  noiseBuffer(ctx) {
    if (this._noise && this._noise.sampleRate === ctx.sampleRate) return this._noise;
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  },

  noiseLayer(out, opt) {
    const ctx = this.ctx();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opt.type || 'lowpass';
    f.frequency.value = opt.freq || 500;
    f.Q.value = opt.q == null ? 0.7 : opt.q;
    const g = ctx.createGain();
    g.gain.value = opt.gain || 0.2;
    src.connect(f); f.connect(g); g.connect(out);
    src.start();
    this.nodes.push(src, f, g);
    return { src, f, g };
  },

  lfo(param, rate, depth, base) {
    const ctx = this.ctx();
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.frequency.value = rate;
    amp.gain.value = depth;
    param.value = base;
    osc.connect(amp); amp.connect(param);
    osc.start();
    this.nodes.push(osc, amp);
    return osc;
  },

  start(mode) {
    this.stop();
    const ctx = this.ctx();
    if (!ctx) return;
    this.mode = mode || 'rain';
    this.playing = true;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    master.gain.linearRampToValueAtTime(this.volume, ctx.currentTime + 2);

    if (this.mode === 'rain') {
      const hiss = this.noiseLayer(master, { type: 'highpass', freq: 1100, gain: 0.26 });
      this.lfo(hiss.g.gain, 0.13, 0.05, 0.26);
      this.noiseLayer(master, { type: 'lowpass', freq: 320, gain: 0.12 });
      this.timers.push(setInterval(() => {
        if (!this.playing) return;
        if (Math.random() > 0.45) return;
        try {
          const c = this.ctx();
          const t = c.currentTime;
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.value = 1200 + Math.random() * 1800;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.03, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + Math.random() * 0.2);
          o.connect(g); g.connect(master);
          o.start(t); o.stop(t + 0.5);
        } catch (e) {}
      }, 220));
    } else if (this.mode === 'wind') {
      const band = this.noiseLayer(master, { type: 'bandpass', freq: 480, q: 1.1, gain: 0.22 });
      this.lfo(band.f.frequency, 0.05, 220, 480);
      this.lfo(band.g.gain, 0.07, 0.10, 0.20);
      this.noiseLayer(master, { type: 'lowpass', freq: 180, gain: 0.10 });
    } else { // waves
      const body = this.noiseLayer(master, { type: 'lowpass', freq: 520, gain: 0.22 });
      this.lfo(body.g.gain, 0.09, 0.14, 0.20);
      const spray = this.noiseLayer(master, { type: 'highpass', freq: 2600, gain: 0.05 });
      this.lfo(spray.g.gain, 0.09, 0.04, 0.05);
      this.noiseLayer(master, { type: 'lowpass', freq: 140, gain: 0.08 });
    }
  },

  stop() {
    this.playing = false;
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
    // 先摘出旧 master/nodes，延时清理只碰旧对象；否则会误杀下一次 start() 的新 master
    const oldMaster = this.master, oldNodes = this.nodes.slice();
    this.master = null; this.nodes = [];
    try {
      if (oldMaster && Beep.ctx) {
        oldMaster.gain.cancelScheduledValues(Beep.ctx.currentTime);
        oldMaster.gain.linearRampToValueAtTime(0.0001, Beep.ctx.currentTime + 1.2);
      }
    } catch (e) {}
    clearTimeout(this._stopTimer);
    this._stopTimer = setTimeout(() => {
      oldNodes.forEach(n => { try { n.stop && n.stop(); } catch (e) {} });
      try { oldMaster && oldMaster.disconnect(); } catch (e) {}
    }, 1400);
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(0.4, v));
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
  const prog = v.prog || 0;
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
      // 走路日也要吃「减量/20 分钟」：时长减半，cue 超出新时长的丢掉
      const wsecs = light ? Math.max(300, Math.round(b.secs * 0.5)) : b.secs;
      out.push({ k: 'work', secs: wsecs, label: b.name + (light ? '（减量）' : ''), cues: (b.cues || []).filter(c => c.at < wsecs) });
      return;
    }
    if (b.k === 'ex') {
      const ex = EX[b.ex];
      let sets = b.sets;
      let rest = b.rest;
      let secs = b.secs + (prog >= 2 ? 10 : prog >= 1 ? 5 : 0);
      if (prog >= 2 && sets >= 2) sets += 1;
      if (light) { sets = Math.max(1, sets - 1); rest = rest + 10; }
      const sides = b.sides || 1;
      say(`${ex.n}，${cnNum(sets)} 组，每组 ${cnNum(secs)} 秒${sides > 1 ? '，每侧' : ''}。${ex.cue}`);
      for (let s = 0; s < sets; s++) {
        for (let side = 0; side < sides; side++) {
          if (sides > 1) say(side === 0 ? '左侧，开始。' : '换另一侧。');
          else say(s > 0 ? `${SET_CN[s] || '再来一组'}，开始。` : '开始。');
          const cues = [];
          if (secs >= 25) cues.push({ at: Math.floor(secs / 2), t: '一半。' });
          if (secs >= 15) cues.push({ at: secs - 10, t: '最后十秒。' });
          out.push({ k: 'work', secs, label: `${ex.n} · ${SET_CN[s] || '第' + (s + 1) + '组'}${sides > 1 ? (side === 0 ? '（左）' : '（右）') : ''}`, cues });
        }
        if (s < sets - 1 && rest > 0) {
          say(`休息 ${cnNum(rest)} 秒。`);
          out.push({ k: 'rest', secs: rest, label: '休息' });
        }
      }
      return;
    }
    if (b.k === 'badu') {
      say(`${b.name}，${cnNum(b.secs)} 秒。${b.cue}`);
      out.push({ k: 'work', secs: b.secs, label: b.name, cues: [{ at: Math.max(5, b.secs - 10), t: '最后十秒。' }] });
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
      if (this.cancelled) return;
      // 不要把异常当成「练完了」记一次训练；留在播放器里让用户自己决定
      console.warn('player stopped by error', e);
      this.emit({ label: '出错了，先停下', sub: '点「结束」退出，再重新开始一次', pct: 0 });
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
      const cues = (b.cues || []).slice().sort((a, b2) => a.at - b2.at);
      const t0 = performance.now();
      let pausedMs = 0, pauseAt = 0, lastTickSec = -1, saidTen = false;
      while (true) {
        if (this.cancelled) throw new Error('cancel');
        if (this.paused) { if (!pauseAt) pauseAt = performance.now(); await sleep(100); continue; }
        if (pauseAt) { pausedMs += performance.now() - pauseAt; pauseAt = 0; }
        const elapsed = performance.now() - t0 - pausedMs;   // 墙钟，后台节流也不会错位
        if (elapsed >= total * 1000) break;
        const remain = Math.ceil((total * 1000 - elapsed) / 1000);
        this.emit({
          label: b.label,
          sub: fmtClock(remain),
          pct: Math.min(1, elapsed / (total * 1000)),
          remain
        });
        while (cues.length && elapsed >= cues[0].at * 1000) TTS.say(cues.shift().t);
        if (b.k === 'work' && remain <= 3 && remain > 0 && remain !== lastTickSec) { lastTickSec = remain; Beep.tick(); }
        if (b.k === 'rest' && remain === 10 && !saidTen) { saidTen = true; TTS.say('还有十秒。'); }
        await sleep(100);
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
