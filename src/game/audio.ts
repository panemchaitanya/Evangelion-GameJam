// ─────────────────────────────────────────────────────────────
// MOTH — procedural audio engine (Web Audio API, no assets)
// ─────────────────────────────────────────────────────────────
import type { ThemeName } from './types';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private silencer: GainNode | null = null;
  private silenced = false;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private depthFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private ambStop: (() => void)[] = [];
  private scrape: { src: AudioBufferSourceNode; g: GainNode } | null = null;
  private sawNodes: { osc: OscillatorNode[]; g: GainNode; pan: StereoPannerNode | null } | null = null;
  private gateLoop: { src: AudioBufferSourceNode; osc: OscillatorNode; g: GainNode } | null = null;
  private humBuf: AudioBuffer | null = null;
  private wardenHum: { o: OscillatorNode[]; src: AudioBufferSourceNode; g: GainNode; pan: StereoPannerNode | null } | null = null;
  private stalkerNodes: { src: AudioBufferSourceNode; osc: OscillatorNode[]; g: GainNode; pan: StereoPannerNode | null } | null = null;
  private lastCreak = 0;
  muted = false;
  private currentTheme: ThemeName | null = null;

  /** must be called from a user gesture */
  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      // underwater depth filter (master low-pass, swept by engine state)
      this.depthFilter = this.ctx.createBiquadFilter();
      this.depthFilter.type = 'lowpass';
      this.depthFilter.frequency.value = 20000;
      this.depthFilter.Q.value = 0.4;
      // gentle limiter
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 22; comp.ratio.value = 8;
      // beam silencer: total silence while in the Matron's light, between master and the output chain
      this.silencer = this.ctx.createGain(); this.silencer.gain.value = 1;
      this.master.connect(this.silencer);
      this.silencer.connect(this.depthFilter);
      this.depthFilter.connect(comp);
      comp.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = this.ducked ? 0.22 : 1; this.ambBus.connect(this.master);
      // shared 2s noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { // pinkish noise
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = (last * 3.2 + w * 0.25) * 0.7;
      }
      if (this.currentTheme) { const t = this.currentTheme; this.currentTheme = null; this.startAmbient(t); }
      this.loadHum();
      this.preloadSamples();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => { /* */ });
  }

  /** suspend/resume cleanly when the app goes to the background */
  suspend() { if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => { /* */ }); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => { /* */ }); }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** everything goes quiet while the player stands in her light: fast drop, softer return */
  setSilenced(on: boolean) {
    if (!this.ctx || !this.silencer || on === this.silenced) return;
    this.silenced = on;
    this.silencer.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, on ? 0.02 : 0.35);
  }

  /** 0 = dry, 1 = fully submerged — sweeps the master low-pass down */
  setUnderwater(k: number) {
    if (!this.ctx || !this.depthFilter) return;
    const freq = 20000 * Math.pow(700 / 20000, k); // 20 kHz → 700 Hz
    this.depthFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
  }

  /** simple stereo panner, created lazily (Safari-safe) */
  private panner(pan: number): StereoPannerNode | null {
    if (!this.ctx) return null;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    return p;
  }

  // ── helpers ────────────────────────────────────────────────
  private noise(dur: number, type: BiquadFilterType, freq: number, q: number, gain: number,
    attack = 0.005, sweepTo?: number, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t, Math.random() * 1.2); src.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number,
    attack = 0.005, when = 0, dest?: AudioNode) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest ?? this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ── ambience ───────────────────────────────────────────────
  startAmbient(theme: ThemeName) {
    this.currentTheme = theme;
    if (!this.ctx) return; // will start on ensure()
    this.stopAmbient();
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.ambBus);
    out.gain.setTargetAtTime(1, ctx.currentTime, 2.5);
    this.ambStop.push(() => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.8); setTimeout(() => out.disconnect(), 3000); });

    // low drone — two detuned oscillators
    const base = theme === 'deep' ? 38 : theme === 'machine' ? 50 : theme === 'pale' ? 62 : 55;
    for (const det of [0, 1.6]) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = base + det;
      const g = ctx.createGain(); g.gain.value = theme === 'pale' ? 0.038 : 0.05;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.06;
      const lg = ctx.createGain(); lg.gain.value = 0.02;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(out); o.start(); lfo.start();
      this.ambStop.push(() => { o.stop(); lfo.stop(); });
    }

    // wind — looped noise through drifting bandpass
    const wind = ctx.createBufferSource(); wind.buffer = this.noiseBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass';
    wf.frequency.value = theme === 'machine' ? 300 : theme === 'pale' ? 700 : 480; wf.Q.value = 0.55;
    const wg = ctx.createGain(); wg.gain.value = theme === 'deep' ? 0.035 : theme === 'pale' ? 0.045 : theme === 'machine' ? 0.022 : 0.06;
    const wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.07;
    const wlg = ctx.createGain(); wlg.gain.value = theme === 'machine' ? 30 : 190;
    wlfo.connect(wlg); wlg.connect(wf.frequency);
    const g2 = ctx.createOscillator(); g2.frequency.value = 0.043;
    const g2g = ctx.createGain(); g2g.gain.value = theme === 'machine' ? 0.008 : 0.028;
    g2.connect(g2g); g2g.connect(wg.gain);
    wind.connect(wf); wf.connect(wg); wg.connect(out);
    wind.start(); wlfo.start(); g2.start();
    this.ambStop.push(() => { wind.stop(); wlfo.stop(); g2.stop(); });

    if (theme === 'machine') {
      // electric hum
      const h = ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 120;
      const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 300;
      const hg = ctx.createGain(); hg.gain.value = 0.006;
      h.connect(hf); hf.connect(hg); hg.connect(out); h.start();
      this.ambStop.push(() => h.stop());
    }

    if (theme === 'pale') {
      // airy shimmer — high slow-beating sines
      for (const [f, gv] of [[520, 0.008], [659, 0.006], [880, 0.004]] as const) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = gv;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11 + Math.random() * 0.1;
        const lg = ctx.createGain(); lg.gain.value = gv * 0.8;
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(out); o.start(); lfo.start();
        this.ambStop.push(() => { o.stop(); lfo.stop(); });
      }
    }

    if (!/noscore/.test(location.search)) this.addScore(theme, out);

    // random distant events
    let alive = true;
    this.ambStop.push(() => { alive = false; });
    const schedule = () => {
      if (!alive || !this.ctx) return;
      const dt = 5000 + Math.random() * 9000;
      setTimeout(() => {
        if (!alive || !this.ctx) return;
        const r = Math.random();
        if (theme === 'deep' && r < 0.55) {
          // water drip
          this.tone('sine', 1500 + Math.random() * 700, 320, 0.28, 0.05, 0.002);
          if (Math.random() < 0.4) this.tone('sine', 1900, 400, 0.2, 0.03, 0.002, 0.18);
        } else if (theme === 'machine' && r < 0.15) {
          // distant metallic clank
          this.tone('sine', 180 + Math.random() * 120, 90, 0.35, 0.012);
          this.noise(0.1, 'lowpass', 900, 1, 0.006);
        } else if (theme === 'pale' && r < 0.6) {
          // sparse chime, like dust settling
          const f = [1046, 1318, 1568, 2093][Math.floor(Math.random() * 4)];
          this.tone('sine', f, f, 1.8, 0.018, 0.4);
        } else {
          // far-away rumble
          this.tone('sine', 46, 28, 2.2, 0.06, 0.5);
          this.noise(2.4, 'lowpass', 120, 0.5, 0.05, 0.7);
        }
        schedule();
      }, dt);
    };
    schedule();
  }


  /** a sparse, dark score: a dread pad, glassy distant tones in a reverb, and slow dissonant swells. all of it rides the ambience bus, so her light silences it too */
  private addScore(theme: ThemeName, out: GainNode) {
    const ctx = this.ctx; if (!ctx) return;
    const root = theme === 'deep' ? 65.4 : theme === 'machine' ? 73.4 : theme === 'pale' ? 98 : 82.4;
    // reverb: a decaying noise impulse
    const irLen = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(1, irLen, ctx.sampleRate);
    for (let c = 0; c < 1; c++) { const d = ir.getChannelData(c); for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.9; verb.connect(wet); wet.connect(out);
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(out); bus.connect(verb);
    // pad: stacked saws through a slowly breathing low-pass; the harmonics carry on a phone speaker
    const padG = ctx.createGain(); padG.gain.value = theme === 'pale' ? 0.05 : theme === 'machine' ? 0.04 : 0.07; padG.connect(bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = theme === 'machine' ? 0.8 : 2; lp.frequency.value = theme === 'machine' ? 300 : 380; lp.connect(padG);
    const fl = ctx.createOscillator(); fl.frequency.value = 0.035;
    const flg = ctx.createGain(); flg.gain.value = theme === 'machine' ? 70 : 170; fl.connect(flg); flg.connect(lp.frequency); fl.start();
    const nodes: OscillatorNode[] = [fl];
    for (const [mult, det] of [[1, 0], [1.5, -2], [1.0595 * 2, 1]] as const) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * mult; o.detune.value = det * 3;
      const g = ctx.createGain(); g.gain.value = mult === 1.0595 * 2 ? 0.25 : 0.6;
      o.connect(g); g.connect(lp); o.start(); nodes.push(o);
    }
    let alive = true;
    this.ambStop.push(() => { alive = false; nodes.forEach(o => { try { o.stop(); } catch { /* */ } }); setTimeout(() => { try { bus.disconnect(); verb.disconnect(); wet.disconnect(); padG.disconnect(); } catch { /* */ } }, 3500); });
    // sparse tones: a minor scale, long glassy decay, never a tune
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const bell = () => {
      if (!alive || !this.ctx) return;
      const t = ctx.currentTime;
      const f = root * 2 * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12) * (Math.random() < 0.3 ? 2 : 1);
      for (const [m, v] of [[1, 0.05], [2.01, 0.018]] as const) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        const pn = this.panner((Math.random() * 2 - 1) * 0.7);
        o.connect(g); if (pn) { g.connect(pn); pn.connect(bus); } else g.connect(bus);
        o.start(t); o.stop(t + 5.7);
      }
      setTimeout(bell, 6500 + Math.random() * 10500);
    };
    setTimeout(bell, 3500);
    // dread swell: two close low pitches rising and falling, now and then
    const swell = () => {
      if (!alive || !this.ctx) return;
      const t = ctx.currentTime, dur = 7 + Math.random() * 3;
      const f = root * (Math.random() < 0.5 ? 2 : 3);
      for (const d of [0, 1.0595]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (d || 1);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.55); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.1);
      }
      setTimeout(swell, 20000 + Math.random() * 20000);
    };
    setTimeout(swell, 9000);
  }

  /** when a music track is playing, the procedural drone steps back (kept quietly for texture) */
  duckAmbient(on: boolean) { if (this.ctx && this.ambBus) this.ambBus.gain.setTargetAtTime(on ? 0.22 : 1, this.ctx.currentTime, 0.6); this.ducked = on; }
  private ducked = false;

  stopAmbient() {
    this.ambStop.forEach(f => f());
    this.ambStop = [];
  }

  /** hard cleanup for leaving the game screen (no dangling nodes/timers) */
  shutdown() {
    this.stopAmbient();
    this.stopScrape();
    this.setSaw(0);
    this.setGateMoving(false);
    this.setStalker(0);
    this.setWardenHum(0); this.setSilenced(false);
  }

  // ── continuous loops ───────────────────────────────────────
  startScrape() {
    if (!this.ctx || this.scrape) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = this.ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.055, this.ctx.currentTime, 0.08);
    const trem = this.ctx.createOscillator(); trem.frequency.value = 9;
    const tg = this.ctx.createGain(); tg.gain.value = 0.02;
    trem.connect(tg); tg.connect(g.gain); trem.start();
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start();
    this.scrape = { src, g };
    const s = this.scrape; this.ambStop.push(() => { try { trem.stop(); } catch { /* */ } void s; });
  }
  stopScrape() {
    if (!this.ctx || !this.scrape) return;
    const s = this.scrape; this.scrape = null;
    s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
    setTimeout(() => { try { s.src.stop(); } catch { /* */ } }, 400);
  }

  /** proximity 0..1 — saw buzz audible when near, panned by screen position */
  setSaw(prox: number, pan = 0) {
    if (!this.ctx) return;
    if (prox > 0.001 && !this.sawNodes) {
      const panNode = this.panner(pan);
      const g = this.ctx.createGain(); g.gain.value = 0;
      if (panNode) { g.connect(panNode); panNode.connect(this.sfxBus); }
      else g.connect(this.sfxBus);
      const osc = [0, 1.7].map(det => {
        const o = this.ctx!.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = 128 + det;
        const f = this.ctx!.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 0.7;
        o.connect(f); f.connect(g); o.start(); return o;
      });
      const trem = this.ctx.createOscillator(); trem.frequency.value = 27;
      const tg = this.ctx.createGain(); tg.gain.value = 0.4;
      trem.connect(tg); tg.connect(g.gain); trem.start();
      osc.push(trem as unknown as OscillatorNode);
      this.sawNodes = { osc, g, pan: panNode };
    }
    if (this.sawNodes) {
      this.sawNodes.g.gain.setTargetAtTime(prox * 0.085, this.ctx.currentTime, 0.1);
      this.sawNodes.pan?.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.15);
      if (prox <= 0.001) {
        const s = this.sawNodes; this.sawNodes = null;
        setTimeout(() => s.osc.forEach(o => { try { o.stop(); } catch { /* */ } }), 500);
      }
    }
  }

  /** proximity 0..1 — skittering chitter of the stalker, panned */
  setStalker(prox: number, pan = 0) {
    if (!this.ctx) return;
    if (prox > 0.001 && !this.stalkerNodes) {
      const panNode = this.panner(pan);
      const g = this.ctx.createGain(); g.gain.value = 0;
      if (panNode) { g.connect(panNode); panNode.connect(this.sfxBus); }
      else g.connect(this.sfxBus);
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      src.playbackRate.value = 1.4;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.6;
      src.connect(f); f.connect(g); src.start();
      // fast tremolo = skittering legs
      const osc = [13, 17].map(fr => {
        const o = this.ctx!.createOscillator(); o.frequency.value = fr;
        const og = this.ctx!.createGain(); og.gain.value = 0.25;
        o.connect(og); og.connect(g.gain); o.start(); return o;
      });
      // low menace undertone
      const sub = this.ctx.createOscillator(); sub.type = 'sawtooth'; sub.frequency.value = 55;
      const subF = this.ctx.createBiquadFilter(); subF.type = 'lowpass'; subF.frequency.value = 130;
      const subG = this.ctx.createGain(); subG.gain.value = 0.5;
      sub.connect(subF); subF.connect(subG); subG.connect(g); sub.start();
      osc.push(sub);
      this.stalkerNodes = { src, osc, g, pan: panNode };
    }
    if (this.stalkerNodes) {
      this.stalkerNodes.g.gain.setTargetAtTime(prox * 0.11, this.ctx.currentTime, 0.08);
      this.stalkerNodes.pan?.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.12);
      if (prox <= 0.001) {
        const s = this.stalkerNodes; this.stalkerNodes = null;
        setTimeout(() => {
          try { s.src.stop(); } catch { /* */ }
          s.osc.forEach(o => { try { o.stop(); } catch { /* */ } });
        }, 500);
      }
    }
  }

  /** load the recorded hum (CC0, see CREDITS) and bake a seamless loop by crossfading the tail into the head */
  private loadHum() {
    const ctx = this.ctx; if (!ctx) return;
    fetch('audio/warden_hum.mp3').then(r => r.arrayBuffer()).then(ab => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej))).then(buf => {
      const sr = buf.sampleRate, X = Math.floor(sr * 1.5), L = buf.length - X;
      const norm = (b: AudioBuffer) => { const d = b.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i])); const k = pk > 0 ? 0.95 / pk : 1; for (let i = 0; i < d.length; i++) d[i] *= k; return b; };
      if (L <= X) { this.humBuf = norm(buf); return; }
      const out = ctx.createBuffer(1, L, sr);
      const src = buf.getChannelData(0), o = out.getChannelData(0);
      for (let i = 0; i < L; i++) o[i] = src[i];
      for (let i = 0; i < X; i++) { // equal-power blend: head fades in while the overhanging tail fades out
        const p = i / X;
        o[i] = src[i] * Math.sin(p * Math.PI / 2) + src[L + i] * Math.cos(p * Math.PI / 2);
      }
      this.humBuf = norm(out);
    }).catch(() => { setTimeout(() => { if (!this.humBuf) this.loadHum(); }, 4000); });
  }

  /** the Matron's hum: a recorded human lullaby hum, quiet far away, panned toward her. prox 0..1 */
  setWardenHum(prox: number, pan = 0, seen = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (prox > 0.003 && !this.wardenHum && this.humBuf) {
      const panNode = this.panner(pan);
      const g = ctx.createGain(); g.gain.value = 0;
      if (panNode) { g.connect(panNode); panNode.connect(this.sfxBus); } else g.connect(this.sfxBus);
      // breath stage: a slow swell around 0.88, kept separate from the proximity gain
      const breath = ctx.createGain(); breath.gain.value = 0.88; breath.connect(g);
      const br = ctx.createOscillator(); br.frequency.value = 0.2;
      const bg = ctx.createGain(); bg.gain.value = 0.12; br.connect(bg); bg.connect(breath.gain); br.start();
      const src = ctx.createBufferSource(); src.buffer = this.humBuf; src.loop = true;
      src.connect(breath); src.start();
      this.wardenHum = { o: [br], src, g, pan: panNode };
    }
    const h = this.wardenHum;
    if (!h) return;
    // seen: cut almost instantly (silence is the tell); otherwise ease back in
    h.g.gain.setTargetAtTime(seen ? 0 : Math.min(1, prox) * 0.85, ctx.currentTime, seen ? 0.02 : 0.35);
    h.pan?.pan.setTargetAtTime(pan, ctx.currentTime, 0.2);
    if (prox <= 0.003) {
      this.wardenHum = null;
      setTimeout(() => {
        try { h.src.stop(); } catch { /* */ }
        h.o.forEach(o => { try { o.stop(); } catch { /* */ } });
      }, 900);
    }
  }

  setGateMoving(moving: boolean) {
    if (!this.ctx) return;
    if (moving && !this.gateLoop) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 210;
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 31;
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(0.11, this.ctx.currentTime, 0.1);
      src.connect(f); f.connect(g); osc.connect(g); g.connect(this.sfxBus);
      src.start(); osc.start();
      this.gateLoop = { src, osc, g };
    } else if (!moving && this.gateLoop) {
      const l = this.gateLoop; this.gateLoop = null;
      l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      setTimeout(() => { try { l.src.stop(); l.osc.stop(); } catch { /* */ } }, 500);
    }
  }

  // ── sample layer (CC0 SFX pack). Fail-soft: not loaded / failed => the procedural sound plays instead ──
  private samples = new Map<string, AudioBuffer | 'loading' | 'failed'>();
  private stepN = 0;
  /** play a pack sample through the sfx bus; returns false if it isn't ready (caller then plays the procedural version) */
  private sample(name: string, gain = 0.6, rate = 1): boolean {
    if (!this.ctx) return false;
    const have = this.samples.get(name);
    if (have && have !== 'loading' && have !== 'failed') {
      const src = this.ctx.createBufferSource(); src.buffer = have; src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
      const g = this.ctx.createGain(); g.gain.value = gain;
      src.connect(g); g.connect(this.sfxBus); src.start();
      return true;
    }
    if (!have) {
      this.samples.set(name, 'loading');
      const ctx = this.ctx;
      fetch('sfx/' + name + '.ogg').then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('missing'))))
        .then(b => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(b, res, rej)))
        .then(buf => { this.samples.set(name, buf); })
        .catch(() => { this.samples.set(name, 'failed'); });
    }
    return false;
  }
  /** warm the samples that matter on first touch so the first jump already has its sound */
  preloadSamples() { for (const n of ['jump', 'land', 'step_wood_01', 'step_wood_02', 'step_wood_03', 'step_hard_01', 'rope_attach_clank', 'rope_swing_whoosh', 'rope_creak', 'mechanism_clank', 'warden_capture_clank', 'shard_pickup']) this.sample(n, 0); }
  wardenCapture() { if (!this.sample('warden_capture_clank', 0.55)) { /* procedural death follows */ } }
  shardPickup() { return this.sample('shard_pickup', 0.5); }

  // ── one-shots ──────────────────────────────────────────────
  step() { if (this.sample(['step_wood_01', 'step_wood_02', 'step_wood_03'][this.stepN++ % 3], 0.35)) return; this.noise(0.075, 'bandpass', 420 + Math.random() * 320, 1.4, 0.11, 0.004); }
  jump() {
    if (this.sample('jump', 0.4)) return;
    this.noise(0.2, 'highpass', 500, 0.7, 0.045, 0.02, 1600);
    this.tone('sine', 190, 320, 0.14, 0.02, 0.01);
  }
  land(v = 1) {
    if (this.sample('land', 0.45 * v)) return;
    this.noise(0.13, 'lowpass', 340, 0.6, 0.16 * v, 0.003);
    this.tone('sine', 105, 46, 0.13, 0.13 * v, 0.003);
  }
  lever() {
    if (this.sample('mechanism_clank', 0.5)) return;
    this.noise(0.05, 'highpass', 1400, 1, 0.2, 0.002);
    this.tone('square', 230, 110, 0.16, 0.1, 0.002, 0.02);
    this.tone('triangle', 460, 430, 0.35, 0.05, 0.004, 0.06);
  }
  plate() {
    this.tone('sine', 320, 180, 0.12, 0.1, 0.004);
    this.noise(0.06, 'lowpass', 500, 1, 0.12, 0.002);
  }
  trapSnap() {
    this.noise(0.05, 'highpass', 2300, 1, 0.5, 0.001);
    this.tone('square', 190, 70, 0.12, 0.24, 0.001);
    this.tone('square', 95, 55, 0.2, 0.16, 0.001, 0.03);
  }
  crusherSlam() {
    this.tone('sine', 64, 26, 0.4, 0.5, 0.004);
    this.noise(0.42, 'lowpass', 160, 0.6, 0.4, 0.002);
    this.noise(0.1, 'highpass', 900, 1, 0.1, 0.001);
  }
  sawHit() {
    this.noise(0.3, 'highpass', 1100, 1, 0.3, 0.001, 300);
    this.tone('sawtooth', 240, 60, 0.35, 0.2, 0.001);
  }
  splash() {
    this.noise(0.35, 'bandpass', 850, 0.8, 0.28, 0.004, 350);
    for (let i = 0; i < 4; i++)
      this.tone('sine', 900 + Math.random() * 600, 300, 0.12, 0.04, 0.002, 0.05 + i * 0.05);
  }
  drown() {
    for (let i = 0; i < 7; i++)
      this.tone('sine', 500 - i * 45 + Math.random() * 60, 180, 0.1, 0.07, 0.01, i * 0.075);
    this.noise(0.7, 'lowpass', 400, 0.8, 0.2, 0.05);
  }
  death() {
    // soft, breathy exhale and a low settling tone - no pop
    this.noise(1.0, 'lowpass', 420, 0.5, 0.13, 0.14, 150);
    this.tone('sine', 118, 58, 0.9, 0.09, 0.09);
    this.tone('sine', 176, 87, 0.7, 0.03, 0.12, 0.03);
  }
  checkpoint() {
    this.tone('sine', 640, 640, 0.5, 0.045, 0.02);
    this.tone('sine', 960, 960, 0.7, 0.032, 0.05, 0.1);
  }
  crateThud() {
    this.noise(0.1, 'lowpass', 300, 0.8, 0.2, 0.002);
    this.tone('sine', 90, 50, 0.11, 0.14, 0.002);
  }
  exitShimmer() {
    if (!this.ctx) return;
    const dl = this.ctx.createDelay(1); dl.delayTime.value = 0.24;
    const fb = this.ctx.createGain(); fb.gain.value = 0.42;
    const mix = this.ctx.createGain(); mix.gain.value = 0.5;
    dl.connect(fb); fb.connect(dl); dl.connect(mix); mix.connect(this.sfxBus);
    [392, 494, 587, 784].forEach((f, i) =>
      this.tone('sine', f, f, 1.4, 0.05, 0.25, i * 0.16, dl));
    this.noise(2.2, 'highpass', 3000, 0.4, 0.02, 0.8);
  }

  // ── chapter V mechanics ────────────────────────────────────
  ropeGrab() {
    if (this.sample('rope_attach_clank', 0.5)) return;
    this.noise(0.09, 'lowpass', 700, 1, 0.2, 0.004);
    this.tone('triangle', 170, 120, 0.12, 0.12, 0.004);
  }
  ropeCreak(intensity: number) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastCreak < 260) return;
    this.lastCreak = now;
    if (this.sample('rope_creak', 0.12 + intensity * 0.2)) return;
    const g = 0.05 + intensity * 0.06;
    this.noise(0.16, 'bandpass', 260 + Math.random() * 120, 4, g, 0.02);
    this.tone('triangle', 90 + Math.random() * 40, 70, 0.14, g * 0.7, 0.02);
  }
  ropeRelease() {
    if (this.sample('rope_swing_whoosh', 0.45)) return;
    this.noise(0.22, 'highpass', 400, 0.8, 0.06, 0.01, 1900);
  }
  crumbleCrack() {
    this.noise(0.14, 'bandpass', 900, 1.2, 0.3, 0.002, 300);
    this.noise(0.22, 'lowpass', 260, 0.8, 0.25, 0.004, undefined, 0.05);
    this.tone('sine', 120, 55, 0.2, 0.16, 0.004, 0.03);
  }
  crumbleWarn() {
    this.noise(0.07, 'bandpass', 620 + Math.random() * 200, 2, 0.1, 0.004);
  }
  stalkerEmerge() {
    this.noise(0.9, 'bandpass', 300, 0.9, 0.12, 0.3, 900);
    this.tone('sawtooth', 70, 44, 0.9, 0.09, 0.25);
  }
  stalkerLunge() {
    this.tone('sawtooth', 820, 260, 0.32, 0.16, 0.004);
    this.tone('sawtooth', 1240, 400, 0.26, 0.1, 0.004, 0.02);
    this.noise(0.3, 'highpass', 1500, 1, 0.16, 0.002);
  }
  stalkerBite() {
    this.noise(0.1, 'highpass', 2000, 1, 0.4, 0.001);
    this.tone('square', 160, 60, 0.2, 0.26, 0.001);
    this.tone('sine', 70, 32, 0.4, 0.4, 0.002, 0.02);
  }
  swimPaddle() {
    this.noise(0.18, 'bandpass', 640, 0.9, 0.13, 0.01, 300);
    this.tone('sine', 420 + Math.random() * 120, 240, 0.1, 0.03, 0.008, 0.03);
  }
  gasp() {
    this.noise(0.28, 'bandpass', 500, 0.8, 0.14, 0.06, 1500);
    this.tone('sine', 300, 520, 0.22, 0.04, 0.05);
  }
  heartTick() {
    this.tone('sine', 68, 44, 0.11, 0.22, 0.004);
    this.tone('sine', 60, 40, 0.09, 0.15, 0.004, 0.14);
  }
  ui() { this.noise(0.045, 'bandpass', 900, 2, 0.12, 0.002); }
  /** the lullaby chime: soft bell, one note per kid (Ness high, Bram low, Ila between) */
  chime(i = 0) {
    const f = [659.25, 329.63, 493.88][i % 3];
    this.tone('sine', f, f, 1.4, 0.07, 0.01);
    this.tone('sine', f * 2.01, f * 2.01, 0.9, 0.025, 0.01);
    this.tone('sine', f * 3, f * 3, 0.5, 0.01, 0.01);
  }

  // ── the moth motif — a small melancholy theme for title & ending ──
  private motif(notes: number[], step: number, gain: number, delayEcho: boolean) {
    if (!this.ctx) return;
    let dest: AudioNode = this.sfxBus;
    if (delayEcho) {
      const dl = this.ctx.createDelay(1); dl.delayTime.value = 0.31;
      const fb = this.ctx.createGain(); fb.gain.value = 0.36;
      const mix = this.ctx.createGain(); mix.gain.value = 0.4;
      dl.connect(fb); fb.connect(dl); dl.connect(mix); mix.connect(this.sfxBus);
      dest = dl;
    }
    notes.forEach((f, i) => {
      const t = i * step;
      this.tone('sine', f, f, step * 2.6, gain, step * 0.35, t, dest);
      this.tone('sine', f * 2, f * 2, step * 1.6, gain * 0.22, step * 0.4, t, dest);
    });
  }

  /** title screen: D4 A3 C4 E4 D4 — falling and rising, like wings */
  titleMotif() {
    this.motif([293.66, 220, 261.63, 329.63, 293.66], 0.62, 0.055, true);
  }

  /** ending: the same notes resolving upward into the light */
  endingMotif() {
    this.motif([293.66, 329.63, 392, 440, 587.33], 0.5, 0.06, true);
  }
}

export const audio = new AudioEngine();
