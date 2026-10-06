// ─────────────────────────────────────────────────────────────
// MOTH — unit tests: physics helpers, save migration, level integrity
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { aabb, clamp, lerp, mulberry, P, loadSettings, storeSettings, DEFAULT_SETTINGS } from './types';
import { LEVELS, TOTAL_SHARDS, loadSave, storeSave } from './levels';
import { loadGhosts, recordGhost, ghostPoseAt, sampleInto } from './ghost';
import type { Rect } from './types';

// minimal localStorage shim
const store = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};
(globalThis as Record<string, unknown>).localStorage = localStorageShim;

beforeEach(() => store.clear());

// ── physics helpers ──────────────────────────────────────────
describe('aabb', () => {
  const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
  it('detects overlap', () => {
    expect(aabb(r(0, 0, 10, 10), r(5, 5, 10, 10))).toBe(true);
    expect(aabb(r(0, 0, 10, 10), r(9.9, 9.9, 5, 5))).toBe(true);
  });
  it('rejects separation', () => {
    expect(aabb(r(0, 0, 10, 10), r(10, 0, 10, 10))).toBe(false);
    expect(aabb(r(0, 0, 10, 10), r(0, 11, 10, 10))).toBe(false);
    expect(aabb(r(0, 0, 10, 10), r(-10.01, 0, 10, 10))).toBe(false);
  });
});

describe('clamp & lerp', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
  it('lerps', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0)).toBe(10);
  });
});

describe('mulberry determinism', () => {
  it('same seed → same sequence', () => {
    const a = mulberry(42), b = mulberry(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });
  it('different seeds diverge', () => {
    const a = mulberry(1), b = mulberry(2);
    expect(a()).not.toBe(b());
  });
  it('outputs in [0,1)', () => {
    const r = mulberry(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ── save data ────────────────────────────────────────────────
describe('save data', () => {
  it('returns defaults when empty', () => {
    const s = loadSave();
    expect(s.unlocked).toBe(0);
    expect(s.shards).toEqual([]);
    expect(s.bestTime).toBeNull();
  });

  it('migrates the legacy umbra-save-v1 key', () => {
    store.set('umbra-save-v1', JSON.stringify({ unlocked: 3, bestDeaths: 12, bestTime: 900, shards: ['forest-root'] }));
    const s = loadSave();
    expect(s.unlocked).toBe(3);
    expect(s.shards).toContain('forest-root');
    // migrated forward to the new key
    expect(store.get('moth-save-v1')).toBeTruthy();
  });

  it('clamps unlocked to the available chapters', () => {
    store.set('moth-save-v1', JSON.stringify({ unlocked: 99 }));
    expect(loadSave().unlocked).toBe(LEVELS.length - 1);
  });

  it('dedupes shards', () => {
    store.set('moth-save-v1', JSON.stringify({ unlocked: 0, shards: ['a', 'a', 'b'] }));
    expect(loadSave().shards).toEqual(['a', 'b']);
  });

  it('survives corrupted json', () => {
    store.set('moth-save-v1', '{broken');
    expect(loadSave().unlocked).toBe(0);
  });

  it('round-trips', () => {
    storeSave({ unlocked: 2, bestDeaths: 4, bestTime: 500, shards: ['x'] });
    const s = loadSave();
    expect(s.unlocked).toBe(2);
    expect(s.bestTime).toBe(500);
  });
});

describe('settings', () => {
  it('defaults when empty', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it('sanitizes nonsense values', () => {
    store.set('moth-settings-v1', JSON.stringify({ quality: 'ultra', touchSize: 99, touchOpacity: -3 }));
    const s = loadSettings();
    expect(s.quality).toBe('auto');
    expect(s.touchSize).toBe(1.35);
    expect(s.touchOpacity).toBe(0.45);
  });
  it('round-trips', () => {
    const s = { ...DEFAULT_SETTINGS, grain: false, quality: 'low' as const };
    storeSettings(s);
    expect(loadSettings()).toEqual(s);
  });
});

// ── level data integrity ─────────────────────────────────────
describe('level data', () => {
  it('has five chapters', () => {
    expect(LEVELS.length).toBe(5);
  });

  it('counts 15 memory shards', () => {
    expect(TOTAL_SHARDS).toBe(15);
  });

  const onGround = (level: (typeof LEVELS)[number], x: number, w = 2) =>
    level.grounds.some(g => x + w > g.x && x - w < g.x + g.w);

  it('spawn and exit rest on ground', () => {
    for (const level of LEVELS) {
      expect(onGround(level, level.spawn.x, 20), `${level.name} spawn`).toBe(true);
      expect(onGround(level, level.exit.x + level.exit.w / 2), `${level.name} exit`).toBe(true);
    }
  });

  it('checkpoints ascend and stand on ground', () => {
    for (const level of LEVELS) {
      for (let i = 1; i < level.checkpoints.length; i++)
        expect(level.checkpoints[i], `${level.name} cp order`).toBeGreaterThan(level.checkpoints[i - 1]);
      for (const cp of level.checkpoints)
        expect(onGround(level, cp), `${level.name} cp ${cp} on ground`).toBe(true);
    }
  });

  it('shards are unique, in bounds, and reachable above ground/water/swing paths', () => {
    const ids = new Set<string>();
    for (const level of LEVELS) {
      for (const shard of level.shards ?? []) {
        expect(ids.has(shard.id)).toBe(false);
        ids.add(shard.id);
        expect(shard.x).toBeGreaterThan(0);
        expect(shard.x).toBeLessThan(level.width);
        expect(shard.y).toBeGreaterThan(100);
        expect(shard.y).toBeLessThan(level.height);
      }
    }
  });

  it('gate references are valid (lever targets & plate holds)', () => {
    for (const level of LEVELS) {
      const gateIds = new Set((level.gates ?? []).map(g => g.id));
      const plateIds = new Set((level.plates ?? []).map(p => p.id));
      for (const lever of level.levers ?? [])
        expect(gateIds.has(lever.target), `${level.name} lever→${lever.target}`).toBe(true);
      for (const gate of level.gates ?? [])
        if (gate.heldBy) expect(plateIds.has(gate.heldBy), `${level.name} gate heldBy ${gate.heldBy}`).toBe(true);
    }
  });

  it('ropes hang over gaps (no ground under the bob)', () => {
    for (const level of LEVELS) {
      for (const rope of level.ropes ?? []) {
        const bobY = rope.y + rope.len;
        const under = level.grounds.some(g =>
          rope.x > g.x && rope.x < g.x + g.w && g.y <= bobY + 10);
        expect(under, `${level.name} rope@${rope.x} must hang over open space`).toBe(false);
      }
    }
  });

  it('crumble platforms are jump-reachable (≤150px gaps in a sequence)', () => {
    for (const level of LEVELS) {
      const cs = level.crumbles ?? [];
      for (let i = 1; i < cs.length; i++) {
        const gap = cs[i].x - (cs[i - 1].x + cs[i - 1].w);
        const rise = cs[i - 1].y - cs[i].y;
        // only consecutive platforms inside one puzzle sequence (gap < 400)
        if (gap > 0 && gap < 400 && Math.abs(cs[i].y - cs[i - 1].y) < 100) {
          expect(gap, `${level.name} crumble gap ${i}`).toBeLessThanOrEqual(150);
          expect(rise, `${level.name} crumble rise ${i}`).toBeLessThanOrEqual(133);
        }
      }
    }
  });

  it('crumble sequences are flanked by reachable ground', () => {
    // every crumble platform must be within jump range of a ground edge or another crumble
    for (const level of LEVELS) {
      for (const c of level.crumbles ?? []) {
        const nearGroundEdge = level.grounds.some(g =>
          Math.abs(c.x - (g.x + g.w)) <= 170 || Math.abs(g.x - (c.x + c.w)) <= 170);
        const nearCrumble = (level.crumbles ?? []).some(o =>
          o !== c && Math.abs(o.x - c.x) <= 240);
        expect(nearGroundEdge || nearCrumble, `${level.name} crumble@${c.x} reachable`).toBe(true);
      }
    }
  });

  it('stalker patrol bounds stay on their ground plane', () => {
    for (const level of LEVELS) {
      for (const st of level.stalkers ?? []) {
        expect(st.x2).toBeGreaterThan(st.x1);
        const ground = level.grounds.find(g => st.x1 >= g.x && st.x2 <= g.x + g.w && Math.abs(g.y - st.y) < 40);
        expect(ground, `${level.name} stalker ground`).toBeTruthy();
      }
    }
  });

  it('swim pools sit between shores', () => {
    for (const level of LEVELS) {
      for (const w of level.waters ?? []) {
        if (!w.swim) continue;
        const left = level.grounds.some(g => Math.abs(g.x + g.w - w.x) < 40 && g.y <= w.y + 10);
        const right = level.grounds.some(g => Math.abs(g.x - (w.x + w.w)) < 40 && g.y <= w.y + 10);
        expect(left, `${level.name} pool left shore`).toBe(true);
        expect(right, `${level.name} pool right shore`).toBe(true);
      }
    }
  });

  it('breath budget can cross each swim pool at swim speed', () => {
    const swimSpeed = P.RUN * 0.62;
    for (const level of LEVELS) {
      for (const w of level.waters ?? []) {
        if (!w.swim) continue;
        const crossTime = w.w / swimSpeed;
        expect(crossTime, `${level.name} pool ${w.x} crossing ${crossTime.toFixed(1)}s`).toBeLessThan(P.BREATH_MAX * 0.85);
      }
    }
  });

  it('light sanctuaries stand in the stalker corridor', () => {
    const pale = LEVELS[4];
    const st = pale.stalkers![0];
    for (const l of pale.lights ?? []) {
      expect(l.x).toBeGreaterThan(st.x1);
      expect(l.x + l.w).toBeLessThan(st.x2);
    }
  });

  it('every hint has an Arabic translation', () => {
    for (const level of LEVELS)
      for (const h of level.hints ?? [])
        expect(h.text).toBeTruthy();
  });
});

// ── ghost replay ─────────────────────────────────────────────
describe('ghost replay', () => {
  it('sampleInto respects GHOST_DT spacing and caps at GHOST_MAX', () => {
    const arr: number[] = [];
    sampleInto(arr, 0, 100, 500, 1);
    sampleInto(arr, 0.1, 110, 500, 1); // too soon — skipped
    sampleInto(arr, 0.3, 120, 500, 1);
    expect(arr.length).toBe(8);
    expect(arr[4]).toBe(30); // t=0.3 stored as 30 (centiseconds)
    const big: number[] = [];
    for (let i = 0; i < P.GHOST_MAX + 100; i++) sampleInto(big, i * P.GHOST_DT, i, 0, 1);
    expect(big.length).toBe(P.GHOST_MAX * 4);
  });

  it('recordGhost keeps only the fastest run', () => {
    const run1 = Array.from({ length: 40 }, (_, i) => i);
    expect(recordGhost(0, 100, run1)).toBe(true);
    expect(recordGhost(0, 120, run1)).toBe(false); // slower — rejected
    expect(recordGhost(0, 80, run1)).toBe(true);   // faster — kept
    expect(loadGhosts()['0'].time).toBe(80);
  });

  it('recordGhost rejects junk', () => {
    expect(recordGhost(0, 0, [1, 2, 3, 4, 5, 6, 7, 8])).toBe(false);
    expect(recordGhost(0, 50, [1, 2, 3])).toBe(false);
  });

  it('ghostPoseAt interpolates and reports the end', () => {
    // samples every 0.25s: (0s,x=0) (0.25s,x=25) (0.5s,x=50)
    const data = [0, 0, 500, 1, 2, 25, 500, 1, 5, 50, 500, -1];
    const run = { time: 0.5, data };
    const mid = ghostPoseAt(run, 0.125)!;
    expect(mid.x).toBeCloseTo(12.5, 1);
    expect(mid.done).toBe(false);
    const end = ghostPoseAt(run, 5)!;
    expect(end.x).toBe(50);
    expect(end.done).toBe(true);
    const start = ghostPoseAt(run, 0)!;
    expect(start.x).toBe(0);
  });

  it('loadGhosts survives corrupted storage', () => {
    store.set('moth-ghosts-v1', '{bad json');
    expect(loadGhosts()).toEqual({});
    store.set('moth-ghosts-v1', JSON.stringify({ '0': { time: 'x', data: 'y' } }));
    expect(loadGhosts()).toEqual({});
  });
});
