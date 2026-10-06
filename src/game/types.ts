// ─────────────────────────────────────────────────────────────
// MOTH — shared types & constants (formerly UMBRA)
// ─────────────────────────────────────────────────────────────

export interface Vec { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export type ThemeName = 'forest' | 'machine' | 'deep' | 'ruins' | 'pale';

// ── hazards ──────────────────────────────────────────────────
export interface SpikeDef { kind: 'spikes'; x: number; y: number; w: number; h: number }
export interface SawDef {
  kind: 'saw'; id?: string; x: number; y: number; r: number;
  path?: { x: number; y: number }[];   // waypoints (ping-pong)
  speed?: number;                       // px/s along path
  disabledBy?: string;                  // id of lever/gate state that stops it
}
export interface TrapDef { kind: 'trap'; x: number; y: number }          // bear trap (fixed size)
export interface CrusherDef {
  kind: 'crusher'; x: number; y: number; w: number; h: number;
  range: number; period: number; delay: number;                          // slam travel / cycle
}
export type HazardDef = SpikeDef | SawDef | TrapDef | CrusherDef;

// ── mechanisms ───────────────────────────────────────────────
export interface GateDef { id: string; x: number; y: number; w: number; h: number; startsOpen?: boolean; heldBy?: string }
export interface LeverDef { x: number; y: number; target: string; once?: boolean }
export interface PlateDef { id: string; x: number; y: number; w: number; latch?: boolean } // pressure plate; latch = stays pressed
export interface MoverDef {
  id?: string; x: number; y: number; w: number; h: number;
  to: { x: number; y: number }; speed: number;
  activeBy?: string;        // id of lever that must be ON (else idle)
  waitAtEnds?: number;      // seconds to pause at each end
}

// ── advanced mechanisms (chapter V) ──────────────────────────
export interface RopeDef {
  x: number; y: number;      // anchor point
  len: number;               // rope length
  catchRadius?: number;      // grab distance from the bob (default 64)
}
export interface CrumbleDef {
  x: number; y: number; w: number; h: number;
  standTime?: number;        // seconds of standing before collapse (default 0.55)
  respawnTime?: number;      // seconds until it reforms (default 4)
}
export interface LightDef {
  x: number; y: number; w: number; h: number;  // shaft of pale light — shadow creatures will not enter
}
export interface StalkerDef {
  x1: number; x2: number;    // patrol bounds (never leaves them)
  y: number;                 // ground top it walks on
  speed?: number;            // stalk speed (default 165)
  lungeSpeed?: number;       // dash speed (default 430)
  senseRadius?: number;      // how far it can sense the player (default 430)
}

export interface WaterDef { x: number; y: number; w: number; h: number; swim?: boolean }
export interface HintDef { x: number; y: number; text: string; textAr?: string }
export interface ShardDef { id: string; x: number; y: number }

export interface LevelDef {
  chapter: string;
  name: string;
  theme: ThemeName;
  width: number;
  height: number;
  spawn: Vec;
  exit: Rect;
  grounds: (Rect & { floating?: boolean })[];
  hazards: HazardDef[];
  waters?: WaterDef[];
  crates?: Rect[];
  heavyCrates?: Rect[];    // only Bram can push these
  gates?: GateDef[];
  levers?: LeverDef[];
  plates?: PlateDef[];
  movers?: MoverDef[];
  ropes?: RopeDef[];
  crumbles?: CrumbleDef[];
  lights?: LightDef[];
  stalkers?: StalkerDef[];
  shards?: ShardDef[];     // optional memories that persist across runs
  checkpoints: number[];   // x positions; crossing one saves respawn
  hints?: HintDef[];
  wardens?: { x1: number; x2: number; y: number; reach?: number; speed?: number }[]; // the Matron: sees what MOVES in her lantern beam
  mothers?: { x1: number; x2: number; y: number; scale?: number }[];  // background warden patrols (scenery)
}

// ── physics constants ────────────────────────────────────────
export const P = {
  GRAV: 2600,
  RUN: 238,
  ACCEL: 2600,
  AIR_ACCEL: 1500,
  FRICTION: 2400,
  JUMP_V: 835,
  COYOTE: 0.10,
  JUMP_BUF: 0.13,
  PLAYER_W: 20,
  PLAYER_H: 46,
  PUSH_SPEED: 92,
  WATER_SINK_DELAY: 0.42,
  // rope
  ROPE_CATCH: 78,
  ROPE_PUMP: 4.6,          // angular acceleration from input
  ROPE_MAX_ANGLE: 1.22,
  ROPE_RELEASE_BOOST: 110,
  // swim
  BREATH_MAX: 7,
  SWIM_IMPULSE: 265,
  SWIM_IMPULSE_CD: 0.28,
  // stalker
  STALKER_W: 64,
  STALKER_H: 40,
  // ghost replay
  GHOST_DT: 0.25,         // seconds between recorded ghost samples
  GHOST_MAX: 2400,        // max samples per chapter (10 min)
  LAND_SQUASH: 0.16,      // squash-and-settle duration after landing
} as const;

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const aabb = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// deterministic pseudo-random
export function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── player-adjustable settings ───────────────────────────────
export interface GameSettings {
  quality: 'auto' | 'high' | 'low';
  grain: boolean;
  shake: boolean;
  contrast: boolean;
  ghost: boolean;         // race your previous best run
  touchSize: number;      // 0.8 – 1.35
  touchOpacity: number;   // 0.45 – 1
  debug: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'auto',
  grain: true,
  shake: true,
  contrast: false,
  ghost: true,
  touchSize: 1,
  touchOpacity: 0.85,
  debug: false,
};

const SETTINGS_KEY = 'moth-settings-v1';

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<GameSettings>;
      return {
        quality: p.quality === 'high' || p.quality === 'low' || p.quality === 'auto' ? p.quality : 'auto',
        grain: p.grain !== false,
        shake: p.shake !== false,
        contrast: p.contrast === true,
        ghost: p.ghost !== false,
        touchSize: clamp(typeof p.touchSize === 'number' ? p.touchSize : 1, 0.8, 1.35),
        touchOpacity: clamp(typeof p.touchOpacity === 'number' ? p.touchOpacity : 0.85, 0.45, 1),
        debug: p.debug === true,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function storeSettings(s: GameSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
