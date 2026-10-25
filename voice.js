/* 蜕变 · 神经语音片段（预生成的 mp3 用 Web Audio 播放，比系统 TTS 自然得多） */
'use strict';

const Voice = {
  manifest: null,
  persona: 'female',
  buffers: {},
  pending: {},
  current: null,
  ready: false,
  failed: {},

  async init(persona) {
    if (persona) this.persona = persona;
    try {
      const r = await fetch('voice/manifest.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const m = await r.json();
      if (m && m.maps && m.maps[this.persona]) {
        this.manifest = m;
        this.ready = true;
      }
    } catch (e) { this.ready = false; }
  },

  map() { return (this.manifest && this.manifest.maps && this.manifest.maps[this.persona]) || null; },
  has(text) { const m = this.map(); return !!(m && m[text]); },
  count() { const m = this.map(); return m ? Object.keys(m).length : 0; },

  setPersona(p) {
    if (!p || p === this.persona) return;
    this.persona = p;
    this.buffers = {};
    this.pending = {};
  },

  ctx() {
    Beep.unlock();
    if (Beep.ctx && Beep.ctx.state === 'suspended') { try { Beep.ctx.resume(); } catch (e) {} }
    return Beep.ctx;
  },

  load(text) {
    const m = this.map();
    const rel = m && m[text];
    if (!rel) return Promise.resolve(null);
    if (this.buffers[text]) return Promise.resolve(this.buffers[text]);
    if (this.pending[text]) return this.pending[text];
    const p = (async () => {
      try {
        const ctx = this.ctx();
        if (!ctx) return null;
        const res = await fetch(rel);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        const buf = await new Promise((ok, no) => {
          try { ctx.decodeAudioData(ab, ok, no); } catch (e) { no(e); }
        });
        this.buffers[text] = buf;
        delete this.failed[text];
        return buf;
      } catch (e) {
        this.failed[text] = 1;
        return null;
      }
    })().finally(() => { delete this.pending[text]; });   // 失败也允许下次重试
    this.pending[text] = p;
    return p;
  },

  async play(text) {
    const buf = await this.load(text);
    if (!buf) return false;
    const ctx = this.ctx();
    if (!ctx) return false;
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(true); } };
      try {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = finish;
        this.current = src;
        src.start();
        setTimeout(finish, (buf.duration + 2) * 1000);
      } catch (e) { finish(); }
    });
  },

  stop() {
    try { if (this.current) this.current.stop(); } catch (e) {}
    this.current = null;
  },

  /* 后台预加载：一次 4 个，避免一次性打爆 */
  preload(texts) {
    if (!this.ready) return;
    const uniq = [...new Set(texts)].filter(t => this.has(t) && !this.buffers[t] && !this.pending[t]);
    let i = 0;
    const pump = async () => {
      while (i < uniq.length) {
        const t = uniq[i++];
        await this.load(t);
      }
    };
    for (let k = 0; k < 4; k++) pump();
  }
};
