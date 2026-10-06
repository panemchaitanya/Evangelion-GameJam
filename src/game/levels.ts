// ─────────────────────────────────────────────────────────────
// MOTH — level data (5 chapters)
// Physics reference: jump apex ≈ 133px, jump distance ≈ 150px
// ─────────────────────────────────────────────────────────────
import type { LevelDef } from './types';
import { STORY } from '../story';

export const LEVELS: LevelDef[] = [
  // ═══════════════════════ CHAPTER I — THE FOREST ═══════════
  {
    chapter: 'CHAPTER I',
    name: 'lights out. everyone is asleep.',
    theme: 'forest',
    width: 5150,
    height: 720,
    spawn: { x: 180, y: 500 },
    exit: { x: 4960, y: 400, w: 70, h: 80 },
    grounds: [
      { x: -100, y: 560, w: 1000, h: 160 },       // G1 start
      { x: 970, y: 560, w: 780, h: 160 },         // G2 crate field
      { x: 1750, y: 410, w: 650, h: 310 },        // G3 cliff (needs crate)
      { x: 2450, y: 560, w: 900, h: 160 },        // G4 gate field
      { x: 3480, y: 560, w: 80, h: 160 },         // G5 island
      { x: 3690, y: 560, w: 910, h: 160 },        // G6 long run
      { x: 4150, y: 380, w: 200, h: 141, floating: true }, // low tunnel: only Ness fits under (drawn as a stone lintel, not a wall)
      { x: 4600, y: 520, w: 200, h: 200 },        // G7 step
      { x: 4800, y: 480, w: 350, h: 240 },        // G8 summit
    ],
    hazards: [
      { kind: 'spikes', x: 905, y: 688, w: 65, h: 32 },
      { kind: 'trap', x: 1950, y: 410 },
      { kind: 'trap', x: 2090, y: 410 },
      { kind: 'trap', x: 2225, y: 410 },
      { kind: 'spikes', x: 3355, y: 688, w: 330, h: 32 },
    ],
    heavyCrates: [{ x: 1130, y: 520, w: 38, h: 38 }],
    gates: [{ id: 'g1', x: 3050, y: 440, w: 26, h: 120 }],
    levers: [{ x: 2880, y: 560, target: 'g1' }],
    shards: [
      { id: 'forest-root', x: 1540, y: 500 },
      { id: 'forest-cliff', x: 2290, y: 350 },
      { id: 'forest-gate', x: 3250, y: 500 },
    ],
    mothers: [{ x1: 700, x2: 1500, y: 548, scale: 0.7 }, { x1: 3100, x2: 3900, y: 548, scale: 0.75 }],
    checkpoints: [1050, 1820, 2500, 3150, 3750],
    hints: [
      { x: 260, y: 470, text: '← →  walk. quietly.' },
      { x: 120, y: 330, text: 'three stars on the ceiling. one is painted, over bed 9' },
      { x: 640, y: 470, text: '↑  jump' },
      { x: 480, y: 440, text: 'Q  or 1 2 3 - change who leads' },
      { x: 1120, y: 460, text: `too heavy for me. ${STORY.kids.bram} could push it` },
      { x: 1900, y: 320, text: `${STORY.lostChild} came this way. he never came back` },
      { x: 2790, y: 470, text: 'E  - pull the lever' },
      { x: 3990, y: 470, text: `a gap under the stone. only ${STORY.kids.ness} is small enough` },
      { x: 4700, y: 400, text: 'the garden gate. keep going' },
    ],
  },

  // ═══════════════════════ CHAPTER II — THE MACHINE ═════════
  {
    chapter: 'CHAPTER II',
    name: 'the house breathes through its machines',
    theme: 'machine',
    width: 5900,
    height: 720,
    spawn: { x: 150, y: 500 },
    exit: { x: 5760, y: 480, w: 70, h: 80 },
    wardens: [{ x1: 420, x2: 920, y: 560 }],
    grounds: [
      { x: -100, y: 560, w: 1100, h: 160 },       // G1
      { x: 1150, y: 560, w: 850, h: 160 },        // G2 crusher corridor
      { x: 2000, y: 560, w: 900, h: 160 },        // G3 plate puzzle
      { x: 2900, y: 560, w: 700, h: 160 },        // G4
      { x: 1350, y: 100, w: 600, h: 80 },         // ceiling over crushers
      { x: 3760, y: 280, w: 540, h: 440 },        // G5a upper deck
      { x: 4380, y: 280, w: 520, h: 440 },        // G5b upper deck
      { x: 4900, y: 560, w: 400, h: 160 },        // G6
      { x: 5560, y: 560, w: 340, h: 160 },        // G7 exit ledge
    ],
    hazards: [
      { kind: 'saw', x: 1075, y: 440, r: 34, path: [{ x: 1075, y: 440 }, { x: 1075, y: 606 }], speed: 150 },
      { kind: 'crusher', x: 1400, y: 180, w: 90, h: 120, range: 260, period: 2.6, delay: 0 },
      { kind: 'crusher', x: 1600, y: 180, w: 90, h: 120, range: 260, period: 2.6, delay: 0.85 },
      { kind: 'crusher', x: 1800, y: 180, w: 90, h: 120, range: 260, period: 2.6, delay: 1.7 },
      { kind: 'saw', x: 3950, y: 190, r: 30, path: [{ x: 3950, y: 190 }, { x: 4650, y: 190 }], speed: 225 },
      { kind: 'spikes', x: 4305, y: 688, w: 70, h: 32 },
      { kind: 'spikes', x: 5305, y: 688, w: 250, h: 32 },
    ],
    heavyCrates: [{ x: 2150, y: 520, w: 38, h: 38 }],
    gates: [{ id: 'g2', x: 2800, y: 440, w: 26, h: 120, heldBy: 'p1' }],
    plates: [{ id: 'p1', x: 2500, y: 560, w: 60 }],
    movers: [
      { id: 'lift', x: 3650, y: 560, w: 110, h: 18, to: { x: 3650, y: 280 }, speed: 95, waitAtEnds: 0.7 },
      { id: 'ferry', x: 5320, y: 560, w: 100, h: 18, to: { x: 5460, y: 560 }, speed: 130, waitAtEnds: 0.9 },
    ],
    shards: [
      { id: 'machine-rhythm', x: 1280, y: 500 },
      { id: 'machine-weight', x: 2660, y: 500 },
      { id: 'machine-roof', x: 4720, y: 220 },
    ],
    mothers: [{ x1: 1300, x2: 2300, y: 548, scale: 0.72 }, { x1: 4000, x2: 4900, y: 270, scale: 0.7 }],
    checkpoints: [1250, 2050, 2950, 3850, 4950],
    hints: [
      { x: 380, y: 470, text: `${STORY.warden} hums. she always hums` },
      { x: 2900, y: 400, text: `${STORY.warden} locks every door. to keep us in, or something out?` },
      { x: 300, y: 430, text: 'she only sees what moves. stand still' },
      { x: 1300, y: 470, text: 'the machines keep time. so should I' },
      { x: 2200, y: 460, text: 'something heavy will hold the door' },
      { x: 3550, y: 470, text: 'ride the lift' },
      { x: 5200, y: 470, text: 'wait. then go' },
    ],
  },

  // ═══════════════════════ CHAPTER III — THE DEEP ═══════════
  {
    chapter: 'CHAPTER III',
    name: 'something below is still awake',
    theme: 'deep',
    width: 5400,
    height: 720,
    spawn: { x: 150, y: 500 },
    exit: { x: 5290, y: 360, w: 70, h: 80 },
    grounds: [
      { x: -100, y: 560, w: 800, h: 160 },        // G1
      { x: 1230, y: 560, w: 700, h: 160 },        // G2
      { x: 1930, y: 560, w: 800, h: 160 },        // G3
      { x: 3200, y: 560, w: 800, h: 160 },        // G4
      { x: 4000, y: 520, w: 150, h: 200 },        // G5 step
      { x: 4150, y: 480, w: 150, h: 240 },        // G6 step
      { x: 4300, y: 440, w: 1100, h: 280 },       // G7 summit
      // floating debris over pool 1 (static, bob visually)
      { x: 830, y: 588, w: 64, h: 14 },
      { x: 1030, y: 588, w: 64, h: 14 },
    ],
    waters: [
      { x: 700, y: 600, w: 530, h: 120 },
      { x: 2730, y: 600, w: 470, h: 120 },
    ],
    hazards: [
      { kind: 'trap', x: 1500, y: 560 },
      { kind: 'trap', x: 1620, y: 560 },
      { kind: 'saw', x: 1750, y: 430, r: 30, path: [{ x: 1750, y: 430 }, { x: 1750, y: 596 }], speed: 165 },
      {
        kind: 'saw', x: 4600, y: 336, r: 44, speed: 265,
        path: [{ x: 4600, y: 336 }, { x: 4850, y: 424 }, { x: 5100, y: 336 }],
      },
    ],
    movers: [
      { id: 'raft', x: 2780, y: 576, w: 90, h: 16, to: { x: 3030, y: 576 }, speed: 112, waitAtEnds: 0.7 },
    ],
    shards: [
      { id: 'deep-water', x: 1062, y: 535 },
      { id: 'deep-raft', x: 3020, y: 520 },
      { id: 'deep-wake', x: 5070, y: 370 },
    ],
    mothers: [{ x1: 1500, x2: 2400, y: 548, scale: 0.7 }],
    checkpoints: [1300, 1980, 3260, 4350],
    hints: [
      { x: 420, y: 470, text: 'the water keeps what it catches' },
      { x: 2680, y: 470, text: 'cross quickly' },
      { x: 5050, y: 300, text: 'I am not brave. I am just awake' },
    ],
  },

  // ═══════════════════════ CHAPTER IV — THE ECHO ════════════
  {
    chapter: 'CHAPTER IV',
    name: 'the wing no one talks about',
    theme: 'ruins',
    width: 6200,
    height: 720,
    spawn: { x: 150, y: 500 },
    exit: { x: 6070, y: 390, w: 74, h: 90 },
    grounds: [
      { x: -100, y: 560, w: 950, h: 160 },
      { x: 1000, y: 560, w: 700, h: 160 },
      { x: 1700, y: 420, w: 550, h: 300 },
      { x: 2350, y: 560, w: 850, h: 160 },
      { x: 3350, y: 560, w: 850, h: 160 },
      { x: 4200, y: 360, w: 650, h: 360 },
      { x: 4960, y: 560, w: 580, h: 160 },
      { x: 5680, y: 500, w: 520, h: 220 },
    ],
    hazards: [
      { kind: 'spikes', x: 855, y: 688, w: 140, h: 32 },
      { kind: 'trap', x: 1880, y: 420 },
      { kind: 'saw', x: 2300, y: 400, r: 34, path: [{ x: 2300, y: 400 }, { x: 2300, y: 610 }], speed: 180 },
      { kind: 'crusher', x: 3480, y: 160, w: 100, h: 130, range: 270, period: 2.9, delay: 0 },
      { kind: 'crusher', x: 3720, y: 160, w: 100, h: 130, range: 270, period: 2.9, delay: 1.45 },
      { kind: 'saw', x: 5140, y: 470, r: 38, path: [{ x: 5140, y: 470 }, { x: 5400, y: 470 }], speed: 205 },
      { kind: 'spikes', x: 5545, y: 688, w: 130, h: 32 },
    ],
    crates: [{ x: 1540, y: 520, w: 38, h: 38 }, { x: 2630, y: 520, w: 38, h: 38 }],
    gates: [{ id: 'g4', x: 3070, y: 440, w: 28, h: 120, heldBy: 'p4' }],
    plates: [{ id: 'p4', x: 2860, y: 560, w: 64 }],
    movers: [
      { id: 'ruin-lift', x: 4088, y: 560, w: 112, h: 18, to: { x: 4088, y: 360 }, speed: 88, waitAtEnds: 0.8 },
      { id: 'ruin-ferry', x: 5550, y: 560, w: 108, h: 18, to: { x: 5660, y: 500 }, speed: 105, waitAtEnds: 0.7 },
    ],
    shards: [
      { id: 'ruins-rise', x: 2160, y: 355 },
      { id: 'ruins-door', x: 3150, y: 500 },
      { id: 'ruins-sky', x: 4680, y: 295 },
    ],
    mothers: [{ x1: 800, x2: 1700, y: 548, scale: 0.72 }, { x1: 3200, x2: 4200, y: 548, scale: 0.75 }],
    checkpoints: [1050, 1770, 2420, 3400, 4280, 5020, 5740],
    hints: [
      { x: 460, y: 470, text: 'the old wing remembers every child' },
      { x: 1950, y: 400, text: `it is so quiet. like a dream` },
      { x: 3400, y: 420, text: `bed 9. the paint is still wet` },
      { x: 1480, y: 470, text: 'build your own step' },
      { x: 2730, y: 470, text: 'leave the weight behind' },
      { x: 4100, y: 470, text: 'climb with the floorboards' },
      { x: 5900, y: 410, text: 'follow your own echo' },
    ],
  },

  // ═════════════════ CHAPTER V — THE PALE ASCENSION ═════════
  // teaches: rope → crumble → stalker+light → breath swim → combine
  {
    chapter: 'CHAPTER V',
    name: 'beyond the gate, only stars',
    theme: 'pale',
    width: 6900,
    height: 720,
    spawn: { x: 150, y: 500 },
    exit: { x: 6750, y: 440, w: 74, h: 80 },
    grounds: [
      { x: -100, y: 560, w: 900, h: 160 },        // G1 start (ends 800)
      { x: 1080, y: 560, w: 420, h: 160 },        // G2 after rope 1
      { x: 1780, y: 560, w: 670, h: 160 },        // G3 after rope 2
      { x: 3000, y: 560, w: 400, h: 160 },        // G4 after crumble bridge
      { x: 3400, y: 560, w: 1300, h: 160 },       // G5 stalker corridor
      { x: 4700, y: 560, w: 250, h: 160 },        // G6 after the gate
      { x: 4950, y: 700, w: 300, h: 40 },         // pool 1 floor
      { x: 5250, y: 560, w: 150, h: 160 },        // G7 swim island
      { x: 5400, y: 700, w: 260, h: 40 },         // pool 2 floor
      { x: 5660, y: 560, w: 440, h: 160 },        // G8 far shore
      { x: 6620, y: 520, w: 280, h: 200 },        // G9 ascension ledge
    ],
    ropes: [
      { x: 930, y: 230, len: 200 },               // over pit 800–1080
      { x: 1640, y: 230, len: 212 },              // over pit 1500–1780
      { x: 6150, y: 220, len: 210 },              // finale: onto crumbling ledges
      { x: 6520, y: 230, len: 200 },              // finale: to the ascension
    ],
    crumbles: [
      { x: 2470, y: 560, w: 90, h: 16 },          // fragile ground over the long spikes
      { x: 2560, y: 560, w: 90, h: 16 },          // contiguous: cross at a walk, never linger
      { x: 2650, y: 560, w: 90, h: 16 },
      { x: 2740, y: 560, w: 90, h: 16 },
      { x: 2830, y: 560, w: 170, h: 16, standTime: 0.85 }, // long last slab reaching solid ground
      { x: 6190, y: 540, w: 240, h: 16, standTime: 1.0 },  // finale ledge — land, sprint, leap
    ],
    lights: [
      { x: 3720, y: 380, w: 90, h: 180 },         // sanctuaries in the stalker corridor
      { x: 4060, y: 380, w: 90, h: 180 },
      { x: 4410, y: 380, w: 90, h: 180 },
    ],
    stalkers: [
      { x1: 3460, x2: 4640, y: 560, speed: 165, lungeSpeed: 430, senseRadius: 430 },
    ],
    waters: [
      { x: 4950, y: 560, w: 300, h: 160, swim: true },   // pool 1
      { x: 5400, y: 560, w: 260, h: 160, swim: true },   // pool 2 (shard at the bottom)
    ],
    hazards: [
      { kind: 'spikes', x: 830, y: 688, w: 220, h: 32 },     // rope pit 1
      { kind: 'spikes', x: 1530, y: 688, w: 220, h: 32 },    // rope pit 2
      { kind: 'spikes', x: 2455, y: 688, w: 540, h: 32 },    // under the crumble bridge
      { kind: 'spikes', x: 5030, y: 700, w: 120, h: 20 },    // pool 1 floor — stay high
      { kind: 'spikes', x: 6110, y: 688, w: 500, h: 32 },    // finale pit
    ],
    gates: [{ id: 'g5', x: 4640, y: 440, w: 26, h: 120, heldBy: 'p5' }],
    plates: [{ id: 'p5', x: 4560, y: 560, w: 60, latch: true }],   // touch it once — the gate rises
    shards: [
      { id: 'pale-swing', x: 1640, y: 462 },      // on the swing's arc: caught as you pass beneath the pivot
      { id: 'pale-bridge', x: 2650, y: 460 },     // a jump's reach over the bridge
      { id: 'pale-depths', x: 5520, y: 645 },     // bottom of pool 2
    ],
    mothers: [{ x1: 2200, x2: 3200, y: 548, scale: 0.72 }],
    checkpoints: [1120, 2250, 3050, 3450, 4720, 5280, 5700, 6640],
    hints: [
      { x: 300, y: 470, text: 'I am not brave. I am just awake' },
      { x: 1100, y: 400, text: 'I have run this way before. I think I always run this way' },
      { x: 700, y: 460, text: 'jump, and hold on' },
      { x: 1900, y: 470, text: 'swing, then let go' },
      { x: 2320, y: 470, text: 'do not linger' },
      { x: 3500, y: 470, text: `${STORY.warden} hunts what moves. stand in the light` },
      { x: 3765, y: 360, text: 'the lamplight is merciful' },
      { x: 4730, y: 470, text: 'breathe while you can' },
      { x: 5300, y: 400, text: `a painted star. I have seen it before` },
      { x: 5900, y: 470, text: 'one last jump' },
      { x: 6500, y: 430, text: `${STORY.warden} said it is worse out there` },
      { x: 6680, y: 430, text: 'beyond the gate, only lights. wake up' },
    ],
  },
];

export const TOTAL_SHARDS = LEVELS.reduce((sum, level) => sum + (level.shards?.length ?? 0), 0);

export interface SaveData {
  unlocked: number;      // highest level index reachable
  bestDeaths: number | null;
  bestTime: number | null; // seconds
  shards: string[];
}

const KEY = 'moth-save-v1';
const LEGACY_KEY = 'umbra-save-v1';

function sanitize(parsed: Partial<SaveData>): SaveData {
  return {
    unlocked: Math.max(0, Math.min(LEVELS.length - 1, parsed.unlocked ?? 0)),
    bestDeaths: parsed.bestDeaths ?? null,
    bestTime: parsed.bestTime ?? null,
    shards: Array.isArray(parsed.shards) ? [...new Set(parsed.shards)] : [],
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const save = sanitize(JSON.parse(raw) as Partial<SaveData>);
      storeSave(save); // migrate forward (old key left untouched)
      return save;
    }
  } catch { /* ignore */ }
  return { unlocked: 0, bestDeaths: null, bestTime: null, shards: [] };
}

export function storeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
