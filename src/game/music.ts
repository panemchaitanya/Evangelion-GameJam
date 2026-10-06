// ─────────────────────────────────────────────────────────────
// Music layer (CC0 pack, see CREDITS/README). Fail-soft: if a track can't load or play
// (autoplay block, unsupported codec, missing file) nothing happens and the procedural ambience stays as is.
// ─────────────────────────────────────────────────────────────
import { audio } from './audio';

const BASE = 'music/';
// One slot per beat. `file` is the track; `fb` is the slot to fall back to if the file is missing/unplayable
// (so a not-yet-delivered track just keeps the current behaviour). Swap files here when the final pack lands.
const TRACKS: Record<string, { file: string; vol: number; fb?: string }> = {
  intro: { file: 'intro_comic.ogg', vol: 0.5 },
  pageA: { file: 'ch01_crawl_dread.ogg', vol: 0.5 },
  pageB: { file: 'ch02_steam_house.ogg', vol: 0.5 },
  pageC: { file: 'ch03_boiler_deep.ogg', vol: 0.5 },
  pageD: { file: 'ch04_dark_hall_stalker.ogg', vol: 0.5 },
  ch1: { file: 'ch01_crawl_dread.ogg', vol: 0.5 },
  ch2: { file: 'ch02_steam_house.ogg', vol: 0.5 },
  ch3: { file: 'ch03_boiler_deep.ogg', vol: 0.5 },
  ch4: { file: 'ch04_dark_hall_stalker.ogg', vol: 0.5 },
  ch5: { file: 'ch05_red_corridor_urgency.ogg', vol: 0.45 },
  outro: { file: 'finale_melancholic.ogg', vol: 0.55 },
  finale: { file: 'finale_melancholic.ogg', vol: 0.55 },
};
/** crossfade length between any two tracks */
const XFADE_MS = 3000;

class Music {
  private el: HTMLAudioElement | null = null;
  private key: string | null = null;
  private file: string | null = null;
  private want: string | null = null;
  private muted = false;
  private fade = 0;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.el) return;
        if (document.hidden) this.el.pause(); else if (this.want) void this.el.play().catch(() => { /* */ });
      });
    }
  }

  setMuted(m: boolean) { this.muted = m; if (this.el) this.el.muted = m; }

  /** start (or keep) a track; crossfades from whatever is playing. Safe to call repeatedly and without a user gesture. */
  play(key: string) {
    this.want = key;
    const t = TRACKS[key];
    if (!t) return;
    // same file already playing (e.g. a page slot that shares its chapter's track): keep it, no restart
    if (this.el && !this.el.paused && this.file === t.file) { this.key = key; return; }
    try {
      const old = this.el;
      const el = new Audio(BASE + t.file);
      el.loop = true; el.volume = 0; el.muted = this.muted; el.preload = 'auto';
      this.el = el; this.key = key; this.file = t.file;
      const p = el.play();
      const ok = () => {
        if (this.el !== el) return;
        audio.duckAmbient(true);
        this.ramp(el, t.vol, XFADE_MS);
      };
      if (p) p.then(ok).catch(() => { if (this.el === el) { this.el = old && !old.paused ? old : null; this.key = this.el ? this.key : null; this.file = null; if (old) this.ramp(old, TRACKS[this.want ?? '']?.vol ?? 0.5, 600); } });
      else ok();
      el.addEventListener('error', () => { if (this.el === el) { this.el = null; this.key = null; this.file = null; audio.duckAmbient(false); } });
      if (old) this.ramp(old, 0, XFADE_MS, true);
    } catch { /* fail soft */ }
  }

  stop() {
    this.want = null;
    const old = this.el; this.el = null; this.key = null;
    audio.duckAmbient(false);
    if (old) this.ramp(old, 0, XFADE_MS, true);
  }

  private ramp(el: HTMLAudioElement, to: number, ms: number, killAfter = false) {
    const from = el.volume, t0 = performance.now();
    const id = ++this.fade;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch { /* */ }
      if (k < 1) requestAnimationFrame(step);
      else if (killAfter) { el.pause(); el.src = ''; }
      void id;
    };
    step();
  }
}

export const music = new Music();
