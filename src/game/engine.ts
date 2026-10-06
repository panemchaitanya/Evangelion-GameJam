// ─────────────────────────────────────────────────────────────
// MOTH — game engine: physics, entities, hazards, flow
// ─────────────────────────────────────────────────────────────
import { music } from './music';
import {
  P, VIEW_W, VIEW_H, aabb, clamp,
} from './types';
import type { GameSettings, LevelDef, Rect, RopeDef, CrumbleDef, StalkerDef } from './types';
import { LEVELS } from './levels';
import { audio } from './audio';
import { render } from './render';
import type { RenderState } from './render';
import { loadGhost, recordGhost, sampleInto, ghostPoseAt } from './ghost';

export interface GameEvents {
  onIntro: (chapter: string, name: string, index: number, total: number) => void;
  onFinish: (deaths: number, time: number) => void;
  onDeaths: (n: number) => void;
  onPause: (paused: boolean) => void;
  onMute: (muted: boolean) => void;
  onShard: (id: string, collected: number) => void;
  onFps?: (avgFps: number) => void;
  onChar?: (index: number, denied?: boolean) => void;
}

// the three kids: shared sleep-coat base, different bodies and gifts
export const MOM_REACH = 300, MOM_CATCH = 2.8;
export const KIDS = [
  { id: 'ness', name: 'Ness', w: 18, h: 38, jump: 1.06, run: 1.05, heavy: false, quiet: 1 },   // small: crawls through low gaps, jumps best
  { id: 'bram', name: 'Bram', w: 24, h: 50, jump: 0.95, run: 0.95, heavy: true, quiet: 1 },    // broad: pushes heavy crates
  { id: 'ila', name: 'Ila', w: 20, h: 45, jump: 1.0, run: 1.0, heavy: false, quiet: 0.55 },   // quiet steps; listens for what hides
] as const;
interface Hist { x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; runPhase: number; cx: number; feet: number; rope: boolean }

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number;
  kind: 'dust' | 'firefly' | 'chunk' | 'bubble' | 'splash' | 'ash' | 'mote';
  rot?: number; vr?: number;
}

const PARTICLE_POOL = 440;

class Crate {
  vx = 0; vy = 0; grounded = false;
  constructor(public x: number, public y: number, public w: number, public h: number, public heavy = false) {}
  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}

class Gate {
  open: number; target: number;
  constructor(public def: NonNullable<LevelDef['gates']>[number]) {
    this.open = def.startsOpen ? 1 : 0; this.target = this.open;
  }
  get solid(): Rect {
    const h = this.def.h * (1 - this.open);
    return { x: this.def.x, y: this.def.y + this.def.h - h, w: this.def.w, h };
  }
}

class Mover {
  t = 0; dir = 1; wait = 0; dx = 0; dy = 0; x: number; y: number;
  constructor(public def: NonNullable<LevelDef['movers']>[number]) { this.x = def.x; this.y = def.y; }
  get rect(): Rect { return { x: this.x, y: this.y, w: this.def.w, h: this.def.h }; }
}

class Saw {
  x: number; y: number; seg = 0; segT = 0; dir = 1; angle = 0;
  constructor(public def: Extract<LevelDef['hazards'][number], { kind: 'saw' }>) { this.x = def.x; this.y = def.y; }
}

class Trap {
  state: 'idle' | 'shaking' | 'snapped' = 'idle'; timer = 0; lethal = 0;
  constructor(public x: number, public y: number) {}
}

class Crusher {
  timer: number; y: number; vy = 0; slammed = false;
  constructor(public def: Extract<LevelDef['hazards'][number], { kind: 'crusher' }>) {
    this.timer = def.delay; this.y = def.y;
  }
}

// ── chapter V entities ───────────────────────────────────────
class Rope {
  angle = 0; angVel = 0;
  constructor(public def: RopeDef) {}
  bobX() { return this.def.x + Math.sin(this.angle) * this.def.len; }
  bobY() { return this.def.y + Math.cos(this.angle) * this.def.len; }
}

type CrumbleState = 'idle' | 'shaking' | 'falling' | 'gone' | 'returning';
class Crumble {
  state: CrumbleState = 'idle';
  stood = 0; y: number; vy = 0; alpha = 1; goneT = 0; warnT = 0;
  constructor(public def: CrumbleDef) { this.y = def.y; }
  get solid(): boolean { return this.state === 'idle' || this.state === 'shaking'; }
  get rect(): Rect { return { x: this.def.x, y: this.y, w: this.def.w, h: this.def.h }; }
}

type StalkerState = 'lurk' | 'emerge' | 'stalk' | 'lungeTele' | 'lunge' | 'retreat';
class Stalker {
  x: number; dir = 1; state: StalkerState = 'lurk';
  t = 0; senseT = 0; animT = 0; home: number;
  constructor(public def: StalkerDef) {
    this.x = def.x1 + 40; this.home = this.x;
  }
  rect(): Rect {
    return { x: this.x - P.STALKER_W / 2, y: this.def.y - P.STALKER_H, w: P.STALKER_W, h: P.STALKER_H };
  }
}

type Mode = 'attract' | 'intro' | 'playing' | 'dying' | 'fadeout' | 'finished';

export class Game {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  paused = false;

  private level!: LevelDef;
  private levelIndex = 0;
  private mode: Mode = 'attract';
  private modeT = 0;

  // player
  private px = 0; private py = 0; private vx = 0; private vy = 0;
  private facing = 1; private grounded = false; private coyote = 0; private jbuf = 0;
  private runPhase = 0; private pushing = false; private inWater = false; private sinkT = 0;
  private deathT = 0;
  private ch = 0; private pw = 18; private ph = 38;
  private hist: Hist[] = [];
  heavyHintT = 0;
  private wardens: { def: NonNullable<LevelDef['wardens']>[number]; x: number; dir: number; pause: number; exp: number }[] = [];

  // rope state
  private ropes: Rope[] = [];
  private heldRope: Rope | null = null;
  private ropeCd = new Map<Rope, number>();

  // swim state
  private swimWater: { x: number; y: number; w: number; h: number } | null = null;
  private breath: number = P.BREATH_MAX;
  private paddleCd = 0;
  private heartT = 0;
  private wasBreathLow = false;

  // world objects
  private crates: Crate[] = [];
  private gates: Gate[] = [];
  private movers: Mover[] = [];
  private saws: Saw[] = [];
  private traps: Trap[] = [];
  private crushers: Crusher[] = [];
  private crumbles: Crumble[] = [];
  private stalkers: Stalker[] = [];
  private leverState = new Map<number, boolean>();
  private platePressed = new Map<string, boolean>();
  private crateLatched = new Set<string>(); // a crate that has rolled onto a plate keeps it pressed (no soft-lock if pushed past)
  private particles: Particle[] = [];
  private pAlive = 0;
  private checkpoint = 0; // index into checkpoints, -1 = spawn
  private camX = 0; private camY = 0;
  private shake = 0; private shakeMag = 0;
  private time = 0;
  private playTime = 0;
  private deaths = 0;
  private gateMovingPrev = false;
  private collectedShards: Set<string>;

  // input
  private keys = new Set<string>();
  private touch = { jump: false, interact: false };
  private touchAxis = 0;
  private padAxis = 0;
  private padJump = false;
  private padPrev: boolean[] = [];
  private interactQueued = false;
  private attractDir = 1;

  // ghost replay
  private ghostRec: number[] = [];
  private ghost: import('./ghost').GhostRun | null = null;
  private chapterTime = 0;

  // presentation extras
  private landT = 99;
  private lang: 'ar' | 'en' = 'ar';
  private underwaterK = 0;

  // settings & metrics
  private settings!: GameSettings;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(canvas: HTMLCanvasElement, private events: GameEvents, collectedShards: string[] = [],
    settings?: GameSettings) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.settings = settings ?? {
      quality: 'auto', grain: true, shake: true, contrast: false, ghost: true,
      touchSize: 1, touchOpacity: 0.85, debug: false,
    };
    this.collectedShards = new Set(collectedShards);
    this.bindInput();
    this.loadLevel(0, true);
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min((t - this.last) / 1000, 0.1);
      this.last = t;
      if (!this.paused) {
        this.acc += dt;
        const step = 1 / 120;
        let n = 0;
        while (this.acc >= step && n++ < 8) { this.update(step); this.acc -= step; }
      }
      this.draw();
      // fps meter (reports ~once per 1.3s)
      this.fpsFrames++; this.fpsTime += dt;
      if (this.fpsTime >= 1.3) {
        this.events.onFps?.(this.fpsFrames / this.fpsTime);
        this.fpsFrames = 0; this.fpsTime = 0;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  setSettings(s: GameSettings) { this.settings = s; }
  setLanguage(lang: 'ar' | 'en') { this.lang = lang; }

  /** QA hooks — used by debug mode (?debug=1) and automated tests */
  getDebugState() {
    return {
      mode: this.mode,
      levelIndex: this.levelIndex,
      px: Math.round(this.px), py: Math.round(this.py),
      vx: Math.round(this.vx), vy: Math.round(this.vy),
      grounded: this.grounded,
      deaths: this.deaths,
      checkpoint: this.checkpoint,
      heldRope: this.heldRope !== null,
      ropes: this.ropes.map(r => ({ angle: Math.round(r.angle * 100) / 100, angVel: Math.round(r.angVel * 100) / 100 })),
      breath: Math.round(this.breath * 100) / 100,
      swimming: this.swimWater !== null,
      wardens: this.wardens.map(w => ({ x: Math.round(w.x), dir: w.dir, exp: Math.round(w.exp * 100) / 100 })),
      gates: this.gates.map(g => Math.round(g.open * 100) / 100),
      crushers: this.crushers.map(c => Math.round(c.y)),
      saws: this.saws.map(s => ({ x: Math.round(s.x), y: Math.round(s.y) })),
      movers: this.movers.map(m => ({ x: Math.round(m.x), y: Math.round(m.y) })),
      crates: this.crates.map(c => ({ x: Math.round(c.x), y: Math.round(c.y) })),
      crumbles: this.crumbles.map(c => c.state),
      ghost: this.ghost ? (ghostPoseAt(this.ghost, this.chapterTime) ?? 'done') : null,
      ghostRecording: this.ghostRec.length / 4,
      ghostStored: this.ghost ? { time: this.ghost.time, samples: this.ghost.data.length / 4 } : null,
      chapterTime: Math.round(this.chapterTime * 100) / 100,
      stalkers: this.stalkers.map(s => s.state),
      stalkerDetail: this.stalkers.map(s => ({ x: Math.round(s.x), senseT: Math.round(s.senseT * 100) / 100 })),
      particles: this.particles.length,
    };
  }

  warpTo(x: number) {
    if (!this.settings.debug) return;
    this.heldRope = null;
    this.px = clamp(x, 0, this.level.width - this.pw);
    this.py = this.groundTopAt(this.px) - this.ph - 2;
    this.vx = 0; this.vy = 0;
    this.hazPrev = null; this.fol = []; this.folCache = [];
    this.camX = clamp(this.px - VIEW_W * 0.42, 0, Math.max(0, this.level.width - VIEW_W));
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    audio.shutdown();
  }

  // ── input ──────────────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.jbuf = P.JUMP_BUF;
    if (e.code === 'KeyE' || e.code === 'ArrowDown' || e.code === 'KeyS') this.interactQueued = true;
    if (e.code === 'Escape' || e.code === 'KeyP') { this.setPaused(!this.paused); this.events.onPause(this.paused); }
    if (e.code === 'KeyQ' || e.code === 'Tab') { e.preventDefault(); this.nextKid(); }
    if (e.code === 'Digit1') this.switchKid(0);
    if (e.code === 'Digit2') this.switchKid(1);
    if (e.code === 'Digit3') this.switchKid(2);
    if (e.code === 'KeyM') { audio.setMuted(!audio.muted); this.events.onMute(audio.muted); }
    if (e.code === 'KeyR' && (this.mode === 'playing' || this.mode === 'intro')) this.respawn(false);
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private bindInput() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** standard gamepad: left stick / d-pad = move, A = jump, X/B = interact, start = pause, select = restart */
  private pollGamepad() {
    this.padAxis = 0;
    let jump = false;
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { this.padJump = false; this.padPrev = []; return; }

    const axis = gp.axes[0] ?? 0;
    if (Math.abs(axis) > 0.28) this.padAxis = clamp(axis * 1.15, -1, 1);
    if (gp.buttons[14]?.pressed) this.padAxis = -1;
    if (gp.buttons[15]?.pressed) this.padAxis = 1;

    const pressed = (i: number) => gp.buttons[i]?.pressed ?? false;
    const edge = (i: number) => pressed(i) && !this.padPrev[i];
    jump = pressed(0);
    if (edge(0)) this.jbuf = P.JUMP_BUF;
    if (edge(2) || edge(1)) this.interactQueued = true;
    if (edge(9)) { this.setPaused(!this.paused); this.events.onPause(this.paused); }
    if (edge(8) && (this.mode === 'playing' || this.mode === 'intro')) this.respawn(false);
    this.padJump = jump;
    this.padPrev = gp.buttons.map(b => b.pressed);
  }

  setPaused(p: boolean) { this.paused = p; if (p) { audio.setWardenHum(0); audio.setSilenced(false); } if (!p) this.last = performance.now(); }

  setMoveAxis(axis: number) {
    this.touchAxis = clamp(axis, -1, 1);
  }

  setTouchAction(action: 'jump' | 'interact', pressed: boolean) {
    if (pressed && !this.touch[action]) {
      if (action === 'jump') this.jbuf = P.JUMP_BUF;
      else this.interactQueued = true;
    }
    this.touch[action] = pressed;
  }

  clearTouch() {
    this.touchAxis = 0;
    this.touch.jump = false;
    this.touch.interact = false;
  }

  // ── level management ───────────────────────────────────────
  private loadLevel(i: number, attract = false) {
    this.levelIndex = i;
    this.level = LEVELS[i];
    const L = this.level;
    this.crates = [...(L.crates ?? []).map(c => new Crate(c.x, c.y, c.w, c.h)), ...(L.heavyCrates ?? []).map(c => new Crate(c.x, c.y, c.w, c.h, true))];
    this.gates = (L.gates ?? []).map(g => new Gate(g));
    this.movers = (L.movers ?? []).map(m => new Mover(m));
    this.saws = L.hazards.filter(h => h.kind === 'saw').map(h => new Saw(h as Saw['def']));
    this.traps = L.hazards.filter(h => h.kind === 'trap').map(h => new Trap(h.x, h.y));
    this.crushers = L.hazards.filter(h => h.kind === 'crusher').map(h => new Crusher(h as Crusher['def']));
    this.ropes = (L.ropes ?? []).map(r => new Rope(r));
    this.crumbles = (L.crumbles ?? []).map(c => new Crumble(c));
    this.stalkers = (L.stalkers ?? []).map(s => new Stalker(s));
    this.wardens = (L.wardens ?? []).map(w => ({ def: w, x: w.x1, dir: 1, pause: 1.5, exp: 0 }));
    this.heldRope = null;
    this.breath = P.BREATH_MAX; this.swimWater = null; this.paddleCd = 0;
    this.leverState.clear(); this.platePressed.clear(); this.crateLatched.clear();
    this.pAlive = 0;
    this.ghostRec = [];
    this.chapterTime = 0;
    this.ghost = this.settings.ghost ? loadGhost(i) : null;
    this.checkpoint = -1;
    this.px = L.spawn.x; this.py = L.spawn.y;
    this.vx = 0; this.vy = 0;
    this.camX = clamp(this.px - VIEW_W * 0.42, 0, Math.max(0, L.width - VIEW_W));
    this.camY = 0;
    this.mode = attract ? 'attract' : 'intro';
    this.modeT = 0;
    if (!attract) {
      audio.startAmbient(L.theme);
      music.play('ch' + (i + 1));
      this.events.onIntro(L.chapter, L.name, i, LEVELS.length);
    }
  }

  startGame(levelIndex = 0) {
    this.deaths = 0; this.playTime = 0;
    this.loadLevel(levelIndex);
  }

  beginAttract() { this.loadLevel(0, true); }

  private resetDynamics() {
    const L = this.level;
    this.crates = [...(L.crates ?? []).map(c => new Crate(c.x, c.y, c.w, c.h)), ...(L.heavyCrates ?? []).map(c => new Crate(c.x, c.y, c.w, c.h, true))];
    this.movers = (L.movers ?? []).map(m => new Mover(m));
    this.saws = L.hazards.filter(h => h.kind === 'saw').map(h => new Saw(h as Saw['def']));
    this.traps = L.hazards.filter(h => h.kind === 'trap').map(h => new Trap(h.x, h.y));
    this.crushers = L.hazards.filter(h => h.kind === 'crusher').map(h => new Crusher(h as Crusher['def']));
    this.ropes = (L.ropes ?? []).map(r => new Rope(r));
    this.crumbles = (L.crumbles ?? []).map(c => new Crumble(c));
    this.stalkers = (L.stalkers ?? []).map(s => new Stalker(s));
    this.wardens = (L.wardens ?? []).map(w => ({ def: w, x: w.x1, dir: 1, pause: 1.5, exp: 0 }));
    this.heldRope = null;
    this.breath = P.BREATH_MAX; this.swimWater = null;
    this.ghostRec = [];
    this.chapterTime = 0;
    this.ghost = this.settings.ghost ? loadGhost(this.levelIndex) : null;
    for (const g of this.gates) {
      const levIdx = (L.levers ?? []).findIndex(l => l.target === g.def.id);
      if (levIdx >= 0) g.target = this.leverState.get(levIdx) ? 1 : 0;
      else if (g.def.heldBy) g.target = 0;
    }
  }

  private groundTopAt(x: number): number {
    let best = this.level.height;
    for (const g of this.level.grounds)
      if (x >= g.x - 4 && x <= g.x + g.w + 4 && g.y < best) best = g.y;
    return best;
  }

  /** swap the leading kid; refused if the new body would not fit where the old one stands */
  switchKid(i: number) {
    if (i < 0 || i > 2 || i === this.ch || this.mode !== 'playing' || this.heldRope) return;
    const k = KIDS[i];
    const cx = this.px + this.pw / 2, feet = this.py + this.ph;
    let nr: Rect = { x: cx - k.w / 2, y: feet - k.h, w: k.w, h: k.h };
    const hits = (r: Rect) => this.solids().some(sd => aabb(r, sd)) || this.crates.some(c => aabb(r, c.rect));
    // standing flush against a crate or wall, a wider body would overlap it: slide the new body clear (up to 20px)
    let blocked = hits(nr);
    for (const off of [-2, 2, -4, 4, -6, 6, -9, 9, -12, 12, -16, 16, -20, 20]) {
      if (!blocked) break;
      const t: Rect = { ...nr, x: nr.x + off };
      if (!hits(t)) { nr = t; blocked = false; }
    }
    if (blocked) { this.events.onChar?.(this.ch, true); audio.ui(); return; }
    this.ch = i; this.pw = k.w; this.ph = k.h;
    this.px = nr.x; this.py = nr.y;
    this.vx *= 0.3;
    this.events.onChar?.(i);
    audio.chime(i);
  }
  private lastGroundCx = 0;
  private lastGroundFeet = 0;
  private hazPrev: Rect | null = null;
  private fol: ({ x: number; y: number } | undefined)[] = [];
  private folT = 0;
  private followerPoses() {
    const out: { kid: number; x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; runPhase: number; w: number; h: number }[] = [];
    const now = performance.now();
    const dt = this.folT ? Math.min(0.05, (now - this.folT) / 1000) : 0.016;
    this.folT = now;
    // when the leader rides a moving platform the followers ride it too
    const leadFeet = this.py + this.ph;
    const riding = this.movers.find(m => Math.abs(leadFeet - m.y) < 4 && this.px + this.pw > m.x + 1 && this.px < m.x + m.def.w - 1);
    const supports: Rect[] = [...this.solids(), ...this.crates.map(c => c.rect), ...this.movers.map(m => m.rect)];
    let slot = 0;
    for (let k = 0; k < 3; k++) {
      if (k === this.ch) continue;
      slot++;
      const idx = this.hist.length - 1 - slot * 85;
      const h = this.hist[Math.max(0, idx)];
      if (!h || this.hist.length < 20) { this.fol[k] = undefined; continue; }
      const kd = KIDS[k];
      // followers keep the leader's feet line, adjusted for their own height
      const leadCx = this.px + this.pw / 2;
      const onRope = this.heldRope !== null || h.rope;
      // on a rope the followers wait on the solid ground the leader left from, never in the air
      let tx = onRope ? this.lastGroundCx - slot * 30 * (this.facing || 1) - kd.w / 2 : h.cx - kd.w / 2;
      if (riding) tx = riding.x + riding.def.w * (slot === 1 ? 0.28 : 0.72) - kd.w / 2;
      // always within sight of the leader (and the screen): never left far behind, ahead, or off camera
      if (!onRope && !riding && Math.abs(tx + kd.w / 2 - leadCx) > 440) tx = leadCx - Math.sign(this.facing || 1) * (slot * 34) - kd.w / 2;
      tx = clamp(tx, this.camX + 16, this.camX + VIEW_W - kd.w - 16);
      const histY = (onRope && this.lastGroundFeet > 0 ? this.lastGroundFeet : h.feet) - kd.h;
      let f = this.fol[k];
      if (!f || Math.abs(tx - f.x) > 500) { f = { x: tx, y: histY }; this.fol[k] = f; }
      f.x += clamp(tx - f.x, -600 * dt, 600 * dt);
      // leader standing on solid ground right now: followers settle onto the ground under them, never hang on a stale airborne/rope frame
      const leaderStanding = this.grounded && this.heldRope === null && Math.abs(this.vx) < 5;
      let grounded = h.grounded || onRope || leaderStanding;
      if (riding && Math.abs(f.x + kd.w / 2 - (riding.x + riding.def.w / 2)) <= riding.def.w / 2) {
        f.y = riding.y - kd.h; grounded = true;
      } else if (grounded) {
        // stand on whatever is under them now (a lift may have moved away from where the leader stood)
        const cx = f.x + kd.w / 2, feet = f.y + kd.h;
        let top = Infinity;
        for (const r of supports) if (cx >= r.x && cx <= r.x + r.w && r.y >= feet - 10 && r.y < top) top = r.y;
        if (top < Infinity && top - kd.h > histY - 2000) {
          const ty = top - kd.h;
          f.y = ty < f.y ? ty : Math.min(ty, f.y + 700 * dt);
        } else f.y = histY;
      } else f.y = histY;
      out.push({ kid: k, x: f.x, y: f.y, vx: riding || onRope ? 0 : h.vx, vy: riding || onRope ? 0 : h.vy, facing: h.facing, grounded, runPhase: onRope ? 0 : h.runPhase, w: kd.w, h: kd.h });
    }
    return out;
  }
  private folCache: { kid: number; x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; runPhase: number; w: number; h: number; dead?: boolean; deadT?: number }[] = [];
  private folDead: number[] = [-1, -1, -1];
  /** the two followers are real bodies in the world: saws, spikes, traps and crushers hurt them too.
   *  A hurt follower fades out, then slips back in behind the leader after a couple of seconds
   *  (no party death, so a follower lost out of reach can never soft-lock the level). */
  private updateFollowers(dt: number) {
    const poses = this.followerPoses();
    for (const p of poses) {
      const k = p.kid;
      if (this.folDead[k] >= 0) {
        this.folDead[k] += dt;
        if (this.folDead[k] > 2.4) this.folDead[k] = -1;
        else { Object.assign(p, { dead: true, deadT: Math.min(this.folDead[k], 0.85) }); if (this.folDead[k] > 0.85) Object.assign(p, { deadT: 1 }); continue; }
      }
      if (this.mode !== 'playing') continue;
      const r: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (this.rectHurt(r)) {
        this.folDead[k] = 0;
        audio.death();
        for (let i = 0; i < 6; i++) {
          this.spawn({
            x: p.x + p.w / 2 + (Math.random() - 0.5) * p.w, y: p.y + p.h * (0.3 + Math.random() * 0.6),
            vx: (Math.random() - 0.5) * 40, vy: -(14 + Math.random() * 26), life: 0, max: 0.9 + Math.random() * 0.8,
            size: 1.5 + Math.random() * 2, kind: 'mote', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
          });
        }
        Object.assign(p, { dead: true, deadT: 0 });
      }
    }
    this.folCache = poses;
  }
  /** does a lethal hazard overlap this body? (same shapes as the leader's checks) */
  private rectHurt(pr: Rect): boolean {
    for (const h of this.level.hazards) {
      if (h.kind !== 'spikes') continue;
      if (aabb(pr, { x: h.x + 3, y: h.y + 6, w: h.w - 6, h: h.h - 6 })) return true;
    }
    for (const s of this.saws) {
      const cx = clamp(s.x, pr.x, pr.x + pr.w), cy = clamp(s.y, pr.y, pr.y + pr.h);
      if (Math.hypot(s.x - cx, s.y - cy) < s.def.r - 5) return true;
    }
    for (const t of this.traps) {
      if (t.state === 'snapped' && t.lethal > 0 && aabb(pr, { x: t.x - 24, y: t.y - 18, w: 48, h: 20 })) return true;
    }
    for (const c of this.crushers) {
      if (c.vy > 300 && aabb(pr, { x: c.def.x + 2, y: c.y, w: c.def.w - 4, h: c.def.h })) return true;
    }
    return false;
  }
  nextKid() { this.switchKid((this.ch + 1) % 3); }
  get kid() { return this.ch; }

  private respawn(countDeath: boolean) {
    if (countDeath) { this.deaths++; this.events.onDeaths(this.deaths); }
    this.resetDynamics();
    const L = this.level;
    if (this.checkpoint >= 0) {
      const cx = L.checkpoints[this.checkpoint];
      this.px = cx; this.py = this.groundTopAt(cx) - this.ph - 2;
    } else { this.px = L.spawn.x; this.py = L.spawn.y; }
    this.vx = 0; this.vy = 0; this.sinkT = 0;
    this.px += (18 - this.pw) * 0; this.hist = []; this.hazPrev = null; this.fol = []; this.folDead = [-1, -1, -1]; this.folCache = [];
    this.mode = 'playing'; this.modeT = 0;
    audio.shutdown();
  }

  private die(cause: string) {
    audio.setSilenced(false);
    if (this.mode !== 'playing' && this.mode !== 'intro') return;
    this.mode = 'dying'; this.deathT = 0;
    if (this.heldRope) this.heldRope = null;
    audio.shutdown();
    if (cause === 'drown') audio.drown();
    else if (cause === 'saw') audio.sawHit();
    else if (cause === 'stalker') audio.stalkerBite();
    else { if (cause === 'warden') audio.wardenCapture(); audio.death(); }
    if (cause === 'crush' || cause === 'stalker') { this.shakeFn(0.35, 9); }
    // a few slow motes drift up and away (drowning keeps its bubbles)
    const n = cause === 'drown' ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = cause === 'drown' ? 60 + Math.random() * 260 : 8 + Math.random() * 30;
      this.spawn({
        x: this.px + this.pw / 2 + (Math.random() - 0.5) * this.pw, y: this.py + this.ph * (0.3 + Math.random() * 0.6),
        vx: Math.cos(a) * sp, vy: cause === 'drown' ? Math.sin(a) * sp - 120 : -(14 + Math.random() * 26),
        life: 0, max: cause === 'drown' ? 0.6 + Math.random() * 0.7 : 0.9 + Math.random() * 0.8,
        size: cause === 'drown' ? 2 + Math.random() * 5 : 1.5 + Math.random() * 2,
        kind: cause === 'drown' ? 'bubble' : 'mote',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  private shakeFn(t: number, m: number) { this.shake = Math.max(this.shake, t); this.shakeMag = m; }

  // ── solids query ───────────────────────────────────────────
  private solids(): Rect[] {
    const out: Rect[] = [...this.level.grounds];
    for (const g of this.gates) { const s = g.solid; if (s.h > 2) out.push(s); }
    for (const c of this.crumbles) if (c.solid) out.push(c.rect);
    return out;
  }

  private inLight(x: number, y: number): boolean {
    for (const l of this.level.lights ?? [])
      if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return true;
    return false;
  }

  // ── update ─────────────────────────────────────────────────
  private update(dt: number) {
    this.time += dt;
    this.updateParticles(dt);

    if (this.mode === 'attract') {
      this.camX += 28 * this.attractDir * dt;
      if (this.camX > 700) this.attractDir = -1;
      if (this.camX < 40) this.attractDir = 1;
      return;
    }
    if (this.mode === 'finished') return;

    if (this.mode === 'dying') {
      this.deathT += dt;
      if (this.deathT > 1.15) this.respawn(true);
      return;
    }
    if (this.mode === 'fadeout') {
      this.modeT += dt;
      if (this.modeT > 1.5) {
        // chapter finished — keep the ghost if it is the fastest run
        if (this.ghostRec.length >= 8) {
          recordGhost(this.levelIndex, this.chapterTime, this.ghostRec);
          this.ghostRec = [];
        }
        if (this.levelIndex + 1 < LEVELS.length) this.loadLevel(this.levelIndex + 1);
        else { this.mode = 'finished'; audio.stopAmbient(); this.events.onFinish(this.deaths, this.playTime); }
      }
      return;
    }

    this.playTime += dt;
    this.chapterTime += dt;
    this.landT += dt;
    if (this.mode === 'intro') { this.modeT += dt; if (this.modeT > 3.2) this.mode = 'playing'; }

    // timers
    this.coyote -= dt; this.jbuf -= dt; this.paddleCd -= dt;
    if (this.shake > 0) this.shake -= dt;
    for (const [r, t] of this.ropeCd) {
      if (t - dt <= 0) this.ropeCd.delete(r);
      else this.ropeCd.set(r, t - dt);
    }

    this.pollGamepad();
    this.updateMovers(dt);
    this.updateGates(dt);
    this.updateCrates(dt);
    this.updateCrumbles(dt);
    this.updateHazards(dt);
    this.updateFollowers(dt);
    this.updateStalkers(dt);
    this.updateWardens(dt);
    this.updatePlayer(dt);
    const onRope = this.heldRope !== null;
    if (this.grounded && !onRope) { this.lastGroundCx = this.px + this.pw / 2; this.lastGroundFeet = this.py + this.ph; }
    this.hist.push({ x: this.px, y: this.py, vx: this.vx, vy: this.vy, facing: this.facing, grounded: this.grounded, runPhase: this.runPhase, cx: this.px + this.pw / 2, feet: this.py + this.ph, rope: onRope });
    if (this.hist.length > 300) this.hist.shift();
    if (this.heavyHintT > 0) this.heavyHintT -= dt;
    this.updateCamera(dt);

    // record the run for the ghost replay
    sampleInto(this.ghostRec, this.chapterTime, this.px, this.py, this.facing);

    // underwater audio depth (smooth in/out)
    const submerged = (this.swimWater && this.py + 16 > this.swimWater.y) || this.sinkT > 0.2;
    const targetK = submerged ? 1 : 0;
    if (Math.abs(targetK - this.underwaterK) > 0.01) {
      this.underwaterK += (targetK - this.underwaterK) * Math.min(1, dt * 4);
      audio.setUnderwater(this.underwaterK);
    }

    // checkpoint crossing
    const cps = this.level.checkpoints;
    for (let i = this.checkpoint + 1; i < cps.length; i++) {
      if (this.px > cps[i]) { this.checkpoint = i; audio.checkpoint(); this.spawnGlow(this.px, this.py); }
    }

    // memory shards
    for (const shard of this.level.shards ?? []) {
      if (this.collectedShards.has(shard.id)) continue;
      const dx = this.px + this.pw / 2 - shard.x;
      const dy = this.py + this.ph / 2 - shard.y;
      if (Math.hypot(dx, dy) < 46) {
        this.collectedShards.add(shard.id);
        audio.shardPickup();
        this.events.onShard(shard.id, this.collectedShards.size);
        audio.checkpoint();
        this.spawnGlow(shard.x, shard.y - 12);
        this.spawnGlow(shard.x, shard.y + 12);
      }
    }

    // exit
    if (aabb(this.playerRect(), this.level.exit)) {
      this.mode = 'fadeout'; this.modeT = 0;
      audio.exitShimmer(); audio.stopScrape(); audio.setSaw(0); audio.setStalker(0);
    }
  }

  private playerRect(): Rect { return { x: this.px, y: this.py, w: this.pw, h: this.ph }; }

  private spawnGlow(x: number, y: number) {
    for (let i = 0; i < 10; i++)
      this.spawn({
        x: x + (Math.random() - 0.5) * 30, y: y + Math.random() * 40,
        vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 30,
        life: 0, max: 0.9 + Math.random() * 0.6, size: 1 + Math.random() * 2, kind: 'firefly',
      });
  }

  // ── player ─────────────────────────────────────────────────
  private updatePlayer(dt: number) {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    const jumpHeld = this.keys.has('Space') || this.keys.has('ArrowUp') || this.keys.has('KeyW')
      || this.touch.jump || this.padJump;

    const wasGrounded = this.grounded;
    const wasVy = this.vy;

    // ── rope swinging ──
    if (this.heldRope) { this.updateRope(dt); return; }
    // try to catch a rope while airborne
    if (!this.grounded) {
      const pcx = this.px + this.pw / 2, pcy = this.py + this.ph / 2;
      for (const r of this.ropes) {
        if ((this.ropeCd.get(r) ?? 0) > 0) continue;
        const reach = r.def.catchRadius ?? P.ROPE_CATCH;
        if (Math.hypot(pcx - r.bobX(), pcy - r.bobY()) < reach) {
          this.heldRope = r;
          // pendulum state from current motion
          const dx = pcx - r.def.x, dy = pcy - r.def.y;
          r.angle = clamp(Math.atan2(dx, dy), -P.ROPE_MAX_ANGLE, P.ROPE_MAX_ANGLE);
          r.angVel = clamp((this.vx * Math.cos(r.angle) - this.vy * Math.sin(r.angle)) / r.def.len, -5, 5);
          this.vx = 0; this.vy = 0;
          audio.ropeGrab();
          this.shakeFn(0.08, 1.5);
          return;
        }
      }
    }

    // water state
    const waters = this.level.waters ?? [];
    const feet = this.py + this.ph;
    this.inWater = false;
    this.swimWater = null;
    let submerged = false;
    for (const w of waters) {
      if (this.px + this.pw > w.x && this.px < w.x + w.w) {
        if (feet > w.y + 2) {
          this.inWater = true;
          if (w.swim && feet > w.y + 10) this.swimWater = w;
        }
        if (this.py + 12 > w.y) submerged = true;
        // splash on entry
        if (feet > w.y && feet - wasVy * dt <= w.y && wasVy > 260) {
          audio.splash();
          for (let i = 0; i < 12; i++)
            this.spawn({
              x: this.px + 10 + (Math.random() - 0.5) * 24, y: w.y,
              vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 180,
              life: 0, max: 0.5, size: 1 + Math.random() * 2, kind: 'splash',
            });
        }
      }
    }
    const swimming = this.swimWater !== null;

    if (submerged) {
      this.sinkT += dt;
      if (Math.random() < dt * 14 * this.particleScale())
        this.spawn({
          x: this.px + 10 + (Math.random() - 0.5) * 12, y: this.py + 8,
          vx: (Math.random() - 0.5) * 15, vy: -40 - Math.random() * 40,
          life: 0, max: 0.8, size: 1 + Math.random() * 2, kind: 'bubble',
        });
      if (swimming) {
        // breath management instead of instant drowning
        const headUnder = this.py + 16 > this.swimWater!.y;
        if (headUnder) {
          this.breath -= dt;
          if (this.breath < P.BREATH_MAX * 0.35) {
            this.wasBreathLow = true;
            this.heartT -= dt;
            if (this.heartT <= 0) {
              audio.heartTick();
              this.heartT = 0.35 + (this.breath / (P.BREATH_MAX * 0.35)) * 0.5;
            }
          }
          if (this.breath <= 0) { this.breath = 0; this.die('drown'); return; }
        } else {
          if (this.wasBreathLow && this.breath < P.BREATH_MAX * 0.6) audio.gasp();
          this.wasBreathLow = false;
          this.breath = Math.min(P.BREATH_MAX, this.breath + dt * 2.6);
        }
      } else if (this.sinkT > P.WATER_SINK_DELAY) { this.die('drown'); return; }
    } else {
      this.sinkT = Math.max(0, this.sinkT - dt * 3);
      if (this.wasBreathLow) audio.gasp();
      this.wasBreathLow = false;
      this.breath = Math.min(P.BREATH_MAX, this.breath + dt * 3.2);
    }

    const speedMul = this.inWater ? (swimming ? 0.62 : 0.55) : 1;
    const gravMul = swimming ? 0.22 : this.inWater ? 0.55 : 1;

    // horizontal
    const accel = (this.grounded ? P.ACCEL : P.AIR_ACCEL) * speedMul;
    const runK = P.RUN * KIDS[this.ch].run;
    let target = (this.touchAxis || this.padAxis) * runK * speedMul;
    if (left) target = -runK * speedMul;
    if (right) target = runK * speedMul;
    if (this.pushing) target = clamp(target, -P.PUSH_SPEED, P.PUSH_SPEED);
    if (target !== 0) {
      this.vx += clamp(target - this.vx, -accel * dt, accel * dt);
      this.facing = target > 0 ? 1 : -1;
    } else if (this.grounded) {
      const f = P.FRICTION * dt;
      this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
    } else this.vx *= (1 - (swimming ? 1.8 : 0.4) * dt);

    // jump / swim paddle
    if (this.grounded) this.coyote = P.COYOTE;
    if (this.jbuf > 0) {
      if (swimming && this.paddleCd <= 0) {
        this.vy = -P.SWIM_IMPULSE;
        this.paddleCd = P.SWIM_IMPULSE_CD;
        this.jbuf = 0;
        audio.swimPaddle();
        for (let i = 0; i < 4; i++)
          this.spawn({
            x: this.px + 10 + (Math.random() - 0.5) * 16, y: this.py + this.ph - 6,
            vx: (Math.random() - 0.5) * 40, vy: 20 + Math.random() * 40,
            life: 0, max: 0.5, size: 1 + Math.random() * 2, kind: 'bubble',
          });
      } else if (!swimming && this.coyote > 0) {
        this.vy = -P.JUMP_V * KIDS[this.ch].jump * (this.inWater ? 0.8 : 1);
        this.coyote = 0; this.jbuf = 0; this.grounded = false;
        audio.jump();
      }
    }
    if (!jumpHeld && this.vy < -380 && !swimming) this.vy = -380; // variable jump height

    // gravity
    this.vy += P.GRAV * gravMul * dt;
    if (swimming) this.vy = clamp(this.vy, -340, 170);
    else if (this.inWater) this.vy = clamp(this.vy, -400, 520);
    this.vy = Math.min(this.vy, 1400);

    // ── move X ──
    this.pushing = false;
    let nx = this.px + this.vx * dt;
    const solids = this.solids();
    // crate push
    for (const c of this.crates) {
      const pr: Rect = { x: nx, y: this.py, w: this.pw, h: this.ph };
      if (aabb(pr, c.rect)) {
        const dir = this.vx > 0 ? 1 : -1;
        const overlap = dir > 0 ? pr.x + pr.w - c.x : c.x + c.w - pr.x;
        const moved = c.heavy && !KIDS[this.ch].heavy ? 0 : this.tryMoveCrate(c, dir * (overlap + 0.5));
        if (c.heavy && !KIDS[this.ch].heavy && this.heavyHintT <= 0) { this.heavyHintT = 3; this.events.onChar?.(this.ch, true); }
        if (Math.abs(moved) > 0.01) {
          this.pushing = true;
          if (Math.abs(moved) < Math.abs(dir * overlap) - 0.01)
            nx = dir > 0 ? c.x - this.pw : c.x + c.w;
        } else nx = dir > 0 ? c.x - this.pw : c.x + c.w;
      }
    }
    for (const s of solids) {
      // 2px of slack at the feet: a kid standing flush on a floor (e.g. riding a lift that sits level
      // with the ground) must never be shoved sideways out of that floor by a rounding sliver
      const pr: Rect = { x: nx, y: this.py, w: this.pw, h: this.ph };
      if (aabb(pr, s) && !(this.vy >= 0 && this.py + this.ph - s.y <= 2)) nx = this.vx > 0 ? s.x - this.pw : s.x + s.w;
    }
    for (const m of this.movers) {
      const pr: Rect = { x: nx, y: this.py, w: this.pw, h: this.ph };
      if (aabb(pr, m.rect)) {
        // allow standing alignment (handled by carry), block sides
        if (this.py + this.ph - m.y > 6) nx = this.vx > 0 ? m.x - this.pw : m.x + m.def.w;
      }
    }
    this.px = clamp(nx, 0, this.level.width - this.pw);

    // ── move Y ──
    let ny = this.py + this.vy * dt;
    this.grounded = false;
    const allSolids: Rect[] = [...solids, ...this.crates.map(c => c.rect), ...this.movers.map(m => m.rect)];
    for (const s of allSolids) {
      const pr: Rect = { x: this.px, y: ny, w: this.pw, h: this.ph };
      if (aabb(pr, s)) {
        if (this.vy > 0) { ny = s.y - this.ph; this.grounded = true; }
        else if (this.vy < 0) ny = s.y + s.h;
        this.vy = 0;
      }
    }
    this.py = ny;

    // landing
    if (!wasGrounded && this.grounded) {
      const v = clamp(wasVy / 900, 0.2, 1);
      if (wasVy > 220) this.landT = 0;
      audio.land(v);
      for (let i = 0; i < 6; i++)
        this.spawn({
          x: this.px + 10 + (Math.random() - 0.5) * 20, y: this.py + this.ph,
          vx: (Math.random() - 0.5) * 70, vy: -Math.random() * 40,
          life: 0, max: 0.4, size: 1 + Math.random() * 2, kind: 'dust',
        });
    }

    // carry by movers
    for (const m of this.movers) {
      const onTop = Math.abs(this.py + this.ph - m.y) < 3 &&
        this.px + this.pw > m.x + 1 && this.px < m.x + m.def.w - 1;
      if (onTop) {
        this.px += m.dx; this.py += m.dy;
        if (m.dy < 0) { this.py = m.y - this.ph; this.grounded = true; this.vy = Math.min(this.vy, 0); }
      }
    }

    // run animation + footsteps
    if (this.grounded && Math.abs(this.vx) > 30) {
      const prev = this.runPhase;
      this.runPhase += Math.abs(this.vx) * dt * 0.055;
      if (Math.floor(this.runPhase / Math.PI) !== Math.floor(prev / Math.PI)) {
        audio.step();
        if (Math.abs(this.vx) > 170) // fast run kicks up dust
          this.spawn({
            x: this.px + 10 - this.facing * 6, y: this.py + this.ph - 2,
            vx: -this.facing * (20 + Math.random() * 30), vy: -12 - Math.random() * 20,
            life: 0, max: 0.45, size: 1 + Math.random() * 1.6, kind: 'dust',
          });
      }
    } else if (this.grounded) this.runPhase *= 0.8;
    else if (swimming) this.runPhase += dt * 6;

    // push sound
    if (this.pushing && this.grounded && Math.abs(this.vx) > 8) audio.startScrape();
    else audio.stopScrape();

    // levers
    if (this.interactQueued) {
      this.interactQueued = false;
      (this.level.levers ?? []).forEach((lv, i) => {
        if (Math.abs(this.px + 10 - lv.x) < 44 && Math.abs(this.py + this.ph - lv.y) < 40) {
          const on = !this.leverState.get(i);
          this.leverState.set(i, lv.once ? true : on);
          audio.lever();
          for (const g of this.gates) if (g.def.id === lv.target) g.target = this.leverState.get(i) ? 1 : 0;
        }
      });
    }

    // fell out of world
    if (this.py > this.level.height + 80) this.die('fall');
  }

  // ── rope swinging ──────────────────────────────────────────
  private updateRope(dt: number) {
    const r = this.heldRope!;
    const L = r.def.len;
    const axis = this.touchAxis || this.padAxis ||
      (this.keys.has('ArrowLeft') || this.keys.has('KeyA') ? -1 : 0) +
      (this.keys.has('ArrowRight') || this.keys.has('KeyD') ? 1 : 0);

    const prevSign = Math.sign(r.angVel);
    // pendulum + player pumping
    r.angVel += (-(P.GRAV * 0.9) / L * Math.sin(r.angle)) * dt;
    r.angVel += axis * P.ROPE_PUMP * dt;
    r.angVel *= 1 - 0.1 * dt;
    r.angVel = clamp(r.angVel, -5.2, 5.2);
    r.angle += r.angVel * dt;
    if (r.angle > P.ROPE_MAX_ANGLE) { r.angle = P.ROPE_MAX_ANGLE; r.angVel = Math.min(0, r.angVel); }
    if (r.angle < -P.ROPE_MAX_ANGLE) { r.angle = -P.ROPE_MAX_ANGLE; r.angVel = Math.max(0, r.angVel); }

    if (prevSign !== Math.sign(r.angVel) && Math.abs(r.angVel) > 1.4)
      audio.ropeCreak(clamp(Math.abs(r.angVel) / 4, 0, 1));

    // hang from the bob
    const bobX = r.def.x + Math.sin(r.angle) * L;
    const bobY = r.def.y + Math.cos(r.angle) * L;
    this.px = bobX - this.pw / 2;
    this.py = bobY + 2;
    this.facing = r.angVel > 0.2 ? 1 : r.angVel < -0.2 ? -1 : this.facing;
    this.grounded = false;
    this.coyote = 0;
    this.runPhase += Math.abs(r.angVel) * dt * 2;

    // release
    const release = () => {
      this.heldRope = null;
      this.ropeCd.set(r, 0.6);
      this.vx = Math.cos(r.angle) * L * r.angVel * 1.05;
      this.vy = -Math.sin(r.angle) * L * r.angVel - P.ROPE_RELEASE_BOOST;
      // arcade assist: any release carries you somewhere useful (forgiving on touch)
      const dir = Math.sign(this.vx) || Math.sign(r.angVel) || this.facing;
      if (Math.abs(this.vx) < 300) this.vx = dir * 300;
      if (this.vy > -190) this.vy = -190;
      r.angVel = 0;
      this.jbuf = 0;
      audio.ropeRelease();
    };
    if (this.jbuf > 0) { release(); return; }

    // collide with the world while swinging — landing or hitting a wall lets go
    const pr = this.playerRect();
    for (const s of this.solids()) {
      if (!aabb(pr, s)) continue;
      const overlapTop = pr.y + pr.h - s.y;
      const fromAbove = overlapTop < 18 && r.angVel !== 0 && bobY + this.ph <= s.y + 18;
      if (fromAbove) {
        this.py = s.y - this.ph;
        this.grounded = true;
        this.heldRope = null;
        this.ropeCd.set(r, 0.6);
        r.angVel = 0;
        this.vx = Math.cos(r.angle) * L * 0.6;
        this.vy = 0;
        audio.land(0.5);
      } else {
        // side / head contact — just drop off
        this.heldRope = null;
        this.ropeCd.set(r, 0.6);
        this.vx = Math.cos(r.angle) * L * r.angVel * 0.4;
        this.vy = 60;
        r.angVel = 0;
      }
      return;
    }

    // water entry while swinging
    for (const w of this.level.waters ?? []) {
      if (this.px + this.pw > w.x && this.px < w.x + w.w && this.py + this.ph > w.y + 4) {
        this.heldRope = null;
        this.ropeCd.set(r, 0.6);
        this.vx = Math.cos(r.angle) * L * r.angVel * 0.5;
        this.vy = Math.max(0, -Math.sin(r.angle) * L * r.angVel);
        r.angVel = 0;
        audio.splash();
        return;
      }
    }

    if (this.py > this.level.height + 80) this.die('fall');
  }

  private tryMoveCrate(c: Crate, dx: number): number {
    const nx = c.x + dx;
    const test: Rect = { x: nx, y: c.y, w: c.w, h: c.h };
    const blocked = [...this.solids(), ...this.crates.filter(o => o !== c).map(o => o.rect)]
      .some(s => aabb(test, s));
    if (blocked) return 0;
    c.x = nx; return dx;
  }

  // ── crates ─────────────────────────────────────────────────
  private updateCrates(dt: number) {
    const solids = this.solids();
    for (const c of this.crates) {
      c.vy += P.GRAV * dt;
      c.vy = Math.min(c.vy, 1200);
      let ny = c.y + c.vy * dt;
      c.grounded = false;
      for (const s of solids) {
        const r: Rect = { x: c.x, y: ny, w: c.w, h: c.h };
        if (aabb(r, s)) {
          if (c.vy > 0) {
            ny = s.y - c.h; c.grounded = true;
            if (c.vy > 320) audio.crateThud();
          } else ny = s.y + s.h;
          c.vy = 0;
        }
      }
      // rest on movers
      for (const m of this.movers) {
        const r: Rect = { x: c.x, y: ny, w: c.w, h: c.h };
        if (aabb(r, m.rect) && c.vy >= 0) { ny = m.y - c.h; c.grounded = true; c.vy = 0; }
      }
      c.y = ny;
    }
  }

  // ── crumble platforms ──────────────────────────────────────
  private updateCrumbles(dt: number) {
    if (this.crumbles.length === 0) return;
    const feet = this.py + this.ph;
    for (const c of this.crumbles) {
      const standTime = c.def.standTime ?? 0.55;
      const respawnTime = c.def.respawnTime ?? 4;
      // is the player standing on it?
      const onIt = c.solid && this.grounded &&
        Math.abs(feet - c.y) < 3 &&
        this.px + this.pw > c.def.x + 2 && this.px < c.def.x + c.def.w - 2;
      switch (c.state) {
        case 'idle':
          c.stood = onIt ? c.stood + dt : Math.max(0, c.stood - dt * 2);
          if (c.stood > standTime * 0.4) { c.state = 'shaking'; audio.crumbleWarn(); }
          break;
        case 'shaking':
          c.warnT -= dt;
          if (c.warnT <= 0) { audio.crumbleWarn(); c.warnT = 0.16; }
          c.stood = onIt ? c.stood + dt : Math.max(0, c.stood - dt * 0.5);
          if (c.stood >= standTime) {
            c.state = 'falling'; c.vy = 0; c.alpha = 1;
            audio.crumbleCrack();
            this.shakeFn(0.12, 2.5);
            for (let i = 0; i < 8; i++)
              this.spawn({
                x: c.def.x + Math.random() * c.def.w, y: c.y + 4,
                vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 60,
                life: 0, max: 0.5 + Math.random() * 0.3, size: 1.5 + Math.random() * 3, kind: 'chunk',
                rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
              });
          } else if (!onIt && c.stood <= standTime * 0.4) c.state = 'idle';
          break;
        case 'falling':
          c.vy += P.GRAV * 0.65 * dt;
          c.y += c.vy * dt;
          c.alpha -= dt * 2.6;
          if (c.alpha <= 0) { c.state = 'gone'; c.goneT = 0; }
          break;
        case 'gone':
          c.goneT += dt;
          if (c.goneT >= respawnTime) { c.state = 'returning'; c.y = c.def.y; c.alpha = 0; c.stood = 0; }
          break;
        case 'returning':
          c.alpha += dt * 1.8;
          if (c.alpha >= 1) { c.alpha = 1; c.state = 'idle'; }
          break;
      }
    }
  }

  // ── stalker ────────────────────────────────────────────────
  private updateStalkers(dt: number) {
    if (this.stalkers.length === 0) return;
    let prox = 0;
    let stalkPan = 0;
    const pcx = this.px + this.pw / 2;
    const pcy = this.py + this.ph / 2;
    const playerMoving = Math.abs(this.vx) > 40 || !this.grounded;
    const playerSafe = this.inLight(pcx, pcy);

    for (const s of this.stalkers) {
      s.animT += dt;
      const dx = pcx - s.x;
      const dist = Math.abs(dx);
      const sameLevel = Math.abs(this.py + this.ph - s.def.y) < 40;
      const speed = s.def.speed ?? 165;
      const lungeSpeed = s.def.lungeSpeed ?? 430;
      const sense = (s.def.senseRadius ?? 430) * KIDS[this.ch].quiet;

      switch (s.state) {
        case 'lurk':
          if (dist < sense && playerMoving && sameLevel) s.senseT += dt;
          else s.senseT = Math.max(0, s.senseT - dt * 1.5);
          if (s.senseT > 0.45) {
            s.state = 'emerge'; s.t = 0.7;
            s.dir = dx > 0 ? 1 : -1;
            audio.stalkerEmerge();
          }
          break;
        case 'emerge':
          s.t -= dt;
          if (s.t <= 0) s.state = 'stalk';
          break;
        case 'stalk': {
          if (playerSafe || dist > sense * 1.5) { s.state = 'retreat'; s.t = 1.2; break; }
          s.dir = dx > 0 ? 1 : -1;
          const pace = speed * (playerMoving ? 1.12 : 0.42);
          const nx = s.x + s.dir * pace * dt;
          if (this.inLight(nx, s.def.y - 20)) { s.state = 'retreat'; s.t = 1.2; break; }
          s.x = clamp(nx, s.def.x1, s.def.x2);
          if (dist < 112 && sameLevel) { s.state = 'lungeTele'; s.t = 0.34; }
          break;
        }
        case 'lungeTele':
          s.t -= dt;
          if (s.t <= 0) {
            s.state = 'lunge'; s.t = 0.5;
            s.dir = dx > 0 ? 1 : -1;
            audio.stalkerLunge();
          }
          break;
        case 'lunge': {
          s.t -= dt;
          const nx = s.x + s.dir * lungeSpeed * dt;
          if (this.inLight(nx, s.def.y - 20)) { s.x = clamp(nx, s.def.x1, s.def.x2); s.state = 'retreat'; s.t = 1.4; break; }
          s.x = clamp(nx, s.def.x1, s.def.x2);
          if (s.t <= 0) { s.state = 'retreat'; s.t = 1.1; }
          break;
        }
        case 'retreat': {
          s.t -= dt;
          const homeward = Math.sign(s.home - s.x);
          if (homeward !== 0) s.x = clamp(s.x + homeward * speed * 0.6 * dt, s.def.x1, s.def.x2);
          if (!playerSafe && dist < sense * 0.85 && s.t <= 0 && sameLevel) s.state = 'stalk';
          else if (dist > sense * 1.6 || Math.abs(s.x - s.home) < 4) {
            if (dist > sense || playerSafe) { s.state = 'lurk'; s.senseT = 0; }
          }
          break;
        }
      }

      // lethal touch while hunting
      if (s.state === 'stalk' || s.state === 'lungeTele' || s.state === 'lunge') {
        prox = Math.max(prox, clamp(1 - dist / 620, 0, 1));
        if (aabb(this.playerRect(), s.rect())) { this.die('stalker'); audio.setStalker(0); return; }
      } else if (s.state === 'emerge') {
        prox = Math.max(prox, clamp(1 - dist / 700, 0, 1) * 0.6);
      }
      if (prox > 0.01) stalkPan = clamp((s.x - pcx) / 640, -1, 1);
    }
    audio.setStalker(prox, stalkPan);
  }

  // ── the Matron: her lantern only catches what moves ──
  private updateWardens(dt: number) {
    if (this.wardens.length === 0) { audio.setWardenHum(0); audio.setSilenced(false); return; }
    {
      // hum: audible well before she is on screen, panned toward her, silent when not playing
      const pcx = this.px + this.pw / 2;
      let near = 99999, wx = pcx;
      for (const w of this.wardens) { const d = Math.abs(w.x - pcx); if (d < near) { near = d; wx = w.x; } }
      const prox = this.mode === 'playing' ? Math.pow(clamp(1 - near / 1700, 0, 1), 1.0) : 0;
      // her tell: the instant any part of you is inside a beam (moving or still) the hum drops out; it returns when you leave the light
      let seen = false;
      if (this.mode === 'playing') {
        const pr = this.playerRect();
        for (const w of this.wardens) {
          const reach = w.def.reach ?? (w.def.mom ? MOM_REACH : 250);
          if (aabb(pr, { x: w.dir > 0 ? w.x : w.x - reach, y: w.def.y - 120, w: reach, h: 140 })) { seen = true; break; }
        }
      }
      audio.setWardenHum(prox, clamp((wx - pcx) / 800, -1, 1), seen);
      audio.setSilenced(seen);
    }
    for (const w of this.wardens) {
      if (w.pause > 0) w.pause -= dt;
      else {
        w.x += w.dir * (w.def.speed ?? 52) * dt;
        if (w.x >= w.def.x2) { w.x = w.def.x2; w.dir = -1; w.pause = 2.6; }
        if (w.x <= w.def.x1) { w.x = w.def.x1; w.dir = 1; w.pause = 2.6; }
      }
      const reach = w.def.reach ?? (w.def.mom ? MOM_REACH : 250);
      const beam: Rect = { x: w.dir > 0 ? w.x : w.x - reach, y: w.def.y - 120, w: reach, h: 140 };
      // Mom: standing still does NOT protect. Any time in her light counts, and she needs longer to be sure (MOM_CATCH),
      // sized so a straight run through (slowest kid, even leaving ahead of her) always clears the beam first.
      const moving = w.def.mom || Math.abs(this.vx) > 35 || !this.grounded;
      if (this.mode === 'playing' && aabb(this.playerRect(), beam)) {
        w.exp = moving ? w.exp + dt : Math.max(0, w.exp - dt * 1.5);
        if (w.exp > (w.def.mom ? MOM_CATCH : 0.55)) { w.exp = 0; audio.setWardenHum(0); this.die('warden'); return; }
      } else w.exp = Math.max(0, w.exp - dt * 1.5);
    }
  }

  // ── movers / gates ─────────────────────────────────────────
  private updateMovers(dt: number) {
    for (const m of this.movers) {
      m.dx = 0; m.dy = 0;
      const active = !m.def.activeBy ||
        this.leverState.get((this.level.levers ?? []).findIndex(l => l.target === m.def.activeBy)) === true;
      if (!active) continue;
      if (m.wait > 0) { m.wait -= dt; continue; }
      const from = { x: m.def.x, y: m.def.y }, to = m.def.to;
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const step = (m.def.speed * dt) / len;
      m.t += step * m.dir;
      if (m.t >= 1) { m.t = 1; m.dir = -1; m.wait = m.def.waitAtEnds ?? 0.5; }
      if (m.t <= 0) { m.t = 0; m.dir = 1; m.wait = m.def.waitAtEnds ?? 0.5; }
      const nx2 = from.x + (to.x - from.x) * m.t;
      const ny2 = from.y + (to.y - from.y) * m.t;
      m.dx = nx2 - m.x; m.dy = ny2 - m.y;
      m.x = nx2; m.y = ny2;
    }
  }

  private updateGates(dt: number) {
    let moving = false;
    // plates
    (this.level.plates ?? []).forEach(p => {
      const zone: Rect = { x: p.x, y: p.y - 8, w: p.w, h: 12 };
      const was = this.platePressed.get(p.id) ?? false;
      const crateOn = this.crates.some(c => aabb(c.rect, zone));
      if (crateOn) this.crateLatched.add(p.id);
      const touched = aabb(this.playerRect(), zone) || crateOn;
      const pressed = p.latch ? (was || touched) : (touched || this.crateLatched.has(p.id));
      this.platePressed.set(p.id, pressed);
      if (pressed !== was) audio.plate();
    });
    for (const g of this.gates) {
      if (g.def.heldBy) g.target = this.platePressed.get(g.def.heldBy) ? 1 : 0;
      const prev = g.open;
      g.open += clamp(g.target - g.open, -dt * 0.7, dt * 0.7);
      if (Math.abs(g.open - prev) > 0.0001) moving = true;
      // crush player if closing on them — just push out (keep simple: never lethal)
    }
    if (moving !== this.gateMovingPrev) { audio.setGateMoving(moving); this.gateMovingPrev = moving; }
  }

  // ── hazards ────────────────────────────────────────────────
  private updateHazards(dt: number) {
    const pr = this.playerRect();
    const pcx = pr.x + pr.w / 2;
    // swept checks: on a slow frame the player and the hazards can move many pixels, so test along the whole
    // path of this step instead of only where everything ended up
    const pp = this.hazPrev ?? pr;
    this.hazPrev = { ...pr };
    const prAt = (t: number): Rect => ({ x: pp.x + (pr.x - pp.x) * t, y: pp.y + (pr.y - pp.y) * t, w: pr.w, h: pr.h });
    const stepsFor = (dist: number) => clamp(Math.ceil(dist / 6), 1, 30);
    const pMove = Math.hypot(pr.x - pp.x, pr.y - pp.y);

    // spikes
    for (const h of this.level.hazards) {
      if (h.kind !== 'spikes') continue;
      const r: Rect = { x: h.x + 3, y: h.y + 6, w: h.w - 6, h: h.h - 6 };
      const n = stepsFor(pMove);
      for (let i = 1; i <= n; i++) if (aabb(prAt(i / n), r)) { this.die('spike'); return; }
    }

    // saws
    let prox = 0;
    let sawPan = 0;
    for (const s of this.saws) {
      const sx0 = s.x, sy0 = s.y;
      const path = s.def.path;
      if (path && path.length > 1) {
        const a = path[s.seg], b = path[s.seg + s.dir] ?? path[s.seg];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        s.segT += ((s.def.speed ?? 120) * dt) / segLen;
        if (s.segT >= 1) {
          s.segT = 0;
          s.seg += s.dir;
          if (s.seg >= path.length - 1) { s.seg = path.length - 1; s.dir = -1; }
          if (s.seg <= 0) { s.seg = 0; s.dir = 1; }
        }
        const c = path[s.seg], d = path[s.seg + s.dir] ?? path[s.seg];
        s.x = c.x + (d.x - c.x) * s.segT;
        s.y = c.y + (d.y - c.y) * s.segT;
      }
      s.angle += dt * 9;
      const d = Math.hypot(pcx - s.x, pr.y + pr.h / 2 - s.y);
      const newProx = clamp(1 - d / 640, 0, 1);
      if (newProx > prox) sawPan = clamp((s.x - pcx) / 640, -1, 1);
      prox = Math.max(prox, newProx);
      // circle vs aabb, swept along both paths
      const n = stepsFor(Math.max(pMove, Math.hypot(s.x - sx0, s.y - sy0)));
      for (let i = 1; i <= n; i++) {
        const t = i / n, q = prAt(t), qx = sx0 + (s.x - sx0) * t, qy = sy0 + (s.y - sy0) * t;
        const cx = clamp(qx, q.x, q.x + q.w), cy = clamp(qy, q.y, q.y + q.h);
        if (Math.hypot(qx - cx, qy - cy) < s.def.r - 5) { this.die('saw'); return; }
      }
    }
    audio.setSaw(prox, sawPan);

    // bear traps
    for (const t of this.traps) {
      if (t.state === 'idle') {
        if (Math.abs(pcx - t.x) < 52 && Math.abs(pr.y + pr.h - t.y) < 30) { t.state = 'shaking'; t.timer = 0.34; }
      } else if (t.state === 'shaking') {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = 'snapped'; t.lethal = 0.16;
          audio.trapSnap(); this.shakeFn(0.12, 3);
        }
      } else if (t.lethal > 0) {
        t.lethal -= dt;
        const jaw: Rect = { x: t.x - 24, y: t.y - 18, w: 48, h: 20 };
        const n = stepsFor(pMove);
        for (let i = 1; i <= n; i++) if (aabb(prAt(i / n), jaw)) { this.die('trap'); return; }
      }
    }

    // crushers
    for (const c of this.crushers) {
      const cy0 = c.y;
      c.timer += dt;
      const per = c.def.period;
      const cyc = c.timer % per;
      const up = per * 0.44, slam = per * 0.07, down = per * 0.24;
      const y0 = c.def.y, R = c.def.range;
      let y = y0; c.vy = 0;
      if (cyc < up) { y = y0; c.slammed = false; }
      else if (cyc < up + slam) {
        const p = (cyc - up) / slam; y = y0 + R * p * p; c.vy = (2 * R * p) / slam;
      } else if (cyc < up + slam + down) {
        y = y0 + R;
        if (!c.slammed) {
          c.slammed = true;
          audio.crusherSlam();
          if (Math.abs(pcx - (c.def.x + c.def.w / 2)) < 520) this.shakeFn(0.22, 6);
        }
      } else {
        const p = (cyc - up - slam - down) / (per - up - slam - down);
        y = y0 + R * (1 - p);
      }
      c.y = y;
      if (c.vy > 300) {
        const n = stepsFor(Math.max(pMove, Math.abs(y - cy0)));
        for (let i = 1; i <= n; i++) {
          const r: Rect = { x: c.def.x + 2, y: cy0 + (y - cy0) * (i / n), w: c.def.w - 4, h: c.def.h };
          if (aabb(prAt(i / n), r)) { this.die('crush'); return; }
        }
      }
    }
  }

  // ── camera ─────────────────────────────────────────────────
  private updateCamera(dt: number) {
    const L = this.level;
    const look = this.facing * 70;
    const tx = clamp(this.px + 10 - VIEW_W * 0.44 + look, 0, Math.max(0, L.width - VIEW_W));
    this.camX += (tx - this.camX) * Math.min(1, dt * 4.2);
    this.camY = 0;
  }

  // ── particles (pooled — zero allocation in the hot loop) ────
  private particleScale() {
    return this.settings.quality === 'low' ? 0.4 : this.settings.quality === 'auto' ? 0.8 : 1;
  }

  private spawn(p: Particle) {
    if (this.pAlive >= PARTICLE_POOL) return; // pool full: drop the oldest-free slot silently
    if (this.particles.length <= this.pAlive) this.particles.push(p);
    else this.particles[this.pAlive] = p;
    this.pAlive++;
  }

  private updateParticles(dt: number) {
    const scale = this.particleScale();
    // ambient spawns
    const theme = this.level.theme;
    if (Math.random() < dt * (theme === 'forest' ? 6 : 3) * scale) {
      this.spawn({
        x: this.camX + Math.random() * VIEW_W, y: Math.random() * VIEW_H * 0.9,
        vx: 6 + Math.random() * 14, vy: -4 - Math.random() * 8,
        life: 0, max: 3 + Math.random() * 3, size: 0.7 + Math.random() * 1.6,
        kind: theme === 'machine' ? 'ash' : theme === 'pale' ? 'mote' : 'dust',
      });
    }
    if ((theme === 'forest' || theme === 'deep') && Math.random() < dt * 2.4 * scale) {
      this.spawn({
        x: this.camX + Math.random() * VIEW_W, y: 200 + Math.random() * 420,
        vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 12,
        life: 0, max: 4 + Math.random() * 4, size: 1 + Math.random() * 1.8, kind: 'firefly',
      });
    }
    if (theme === 'pale' && Math.random() < dt * 4 * scale) {
      this.spawn({
        x: this.camX + Math.random() * VIEW_W, y: 100 + Math.random() * 520,
        vx: (Math.random() - 0.5) * 10, vy: -6 - Math.random() * 14,
        life: 0, max: 5 + Math.random() * 5, size: 1 + Math.random() * 2, kind: 'mote',
      });
    }
    for (let i = this.pAlive - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life > p.max) { // swap-remove: no splice churn
        this.pAlive--;
        if (i !== this.pAlive) this.particles[i] = this.particles[this.pAlive];
        continue;
      }
      if (p.kind === 'chunk') { p.vy += 1500 * dt; p.rot = (p.rot ?? 0) + (p.vr ?? 0) * dt; }
      if (p.kind === 'bubble') p.vy -= 120 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  // ── draw ───────────────────────────────────────────────────
  private draw() {
    const noShake = !this.settings.shake;
    const shakeX = this.shake > 0 && !noShake ? (Math.random() - 0.5) * this.shakeMag : 0;
    const shakeY = this.shake > 0 && !noShake ? (Math.random() - 0.5) * this.shakeMag : 0;
    const swimming = this.swimWater !== null;
    const ghostPose = this.ghost && this.mode !== 'attract' && this.mode !== 'finished'
      ? ghostPoseAt(this.ghost, this.chapterTime) : null;
    const state: RenderState = {
      ctx: this.ctx, time: this.time, level: this.level,
      camX: this.camX + shakeX, camY: this.camY + shakeY,
      player: this.mode === 'attract' || this.mode === 'finished' ? null : {
        x: this.px, y: this.py, vx: this.vx, vy: this.vy, facing: this.facing,
        grounded: this.grounded, runPhase: this.runPhase, pushing: this.pushing,
        dead: this.mode === 'dying', deadT: this.deathT, sinkT: this.sinkT,
        onRope: this.heldRope !== null,
        ropeAngle: this.heldRope?.angle ?? 0,
        swimming,
        breath01: swimming || this.breath < P.BREATH_MAX ? this.breath / P.BREATH_MAX : 1,
        landT: this.landT,
        shadowY: this.groundTopAt(this.px + this.pw / 2),
        kid: this.ch, w: this.pw, h: this.ph,
      },
      wardens: this.wardens.map(w => ({ x: w.x, y: w.def.y, dir: w.dir, walking: w.pause <= 0, reach: w.def.reach ?? (w.def.mom ? MOM_REACH : 250), exp: w.def.mom ? w.exp * (0.55 / MOM_CATCH) : w.exp, mom: !!w.def.mom })),
      followers: this.mode === 'playing' || this.mode === 'dying' ? this.folCache : [],
      ghost: ghostPose && !ghostPose.done ? ghostPose : null,
      lang: this.lang,
      particleCount: this.pAlive,
      crates: this.crates.map(c => c.rect),
      gates: this.gates.map(g => ({ def: g.def, open: g.open })),
      movers: this.movers.map(m => m.rect),
      saws: this.saws.map(s => ({ x: s.x, y: s.y, r: s.def.r, angle: s.angle })),
      traps: this.traps.map(t => ({ x: t.x, y: t.y, state: t.state, timer: t.timer })),
      crushers: this.crushers.map(c => ({ def: c.def, y: c.y })),
      levers: (this.level.levers ?? []).map((l, i) => ({ ...l, on: !!this.leverState.get(i) })),
      plates: (this.level.plates ?? []).map(p => ({ ...p, pressed: !!this.platePressed.get(p.id) })),
      ropes: this.ropes.map(r => ({
        def: r.def, angle: r.angle, held: r === this.heldRope,
        bobX: r.bobX(), bobY: r.bobY(),
        sway: Math.sin(this.time * 0.9 + r.def.x * 0.13) * 0.05,
      })),
      crumbles: this.crumbles.map(c => ({
        def: c.def, state: c.state, y: c.y, alpha: c.alpha, stood: c.stood,
      })),
      stalkers: this.stalkers.map(s => ({
        x: s.x, y: s.def.y, state: s.state, dir: s.dir, t: s.t, animT: s.animT,
      })),
      shards: (this.level.shards ?? [])
        .filter(shard => !this.collectedShards.has(shard.id))
        .map(shard => ({ x: shard.x, y: shard.y })),
      particles: this.particles,
      mode: this.mode, modeT: this.modeT, deathT: this.deathT,
      checkpoint: this.checkpoint,
      fx: {
        grain: this.settings.grain,
        contrast: this.settings.contrast,
      },
      debug: this.settings.debug ? {
        fps: Math.round(this.fpsTime > 0 ? this.fpsFrames / this.fpsTime : 0),
        px: Math.round(this.px), py: Math.round(this.py),
        solids: this.solids(),
        stalkerStates: this.stalkers.map(s => s.state),
      } : null,
    };
    render(state);
  }
}
