// ─────────────────────────────────────────────────────────────
// MOTH — ghost replay ("race your echo"): stores your fastest
// run of each chapter as compact samples, replayed as a ghost.
// ─────────────────────────────────────────────────────────────
import { P, clamp } from './types';

export interface GhostRun {
  time: number;          // seconds the run took
  data: number[];        // flat [t*10, x, y, facing] quadruples
}

const KEY = 'moth-ghosts-v1';

type GhostBook = Record<string, GhostRun>;

export function loadGhosts(): GhostBook {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<GhostRun>>;
    const out: GhostBook = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v.time !== 'number' || !Array.isArray(v.data)) continue;
      const data = v.data.filter(n => typeof n === 'number' && Number.isFinite(n));
      if (data.length < 8 || data.length % 4 !== 0) continue;
      out[k] = { time: v.time, data: data.slice(0, P.GHOST_MAX * 4) };
    }
    return out;
  } catch { return {}; }
}

export function loadGhost(chapter: number): GhostRun | null {
  return loadGhosts()[String(chapter)] ?? null;
}

/** keep the ghost only when it beats the stored one */
export function recordGhost(chapter: number, time: number, data: number[]): boolean {
  if (data.length < 8 || time <= 0) return false;
  const book = loadGhosts();
  const prev = book[String(chapter)];
  if (prev && prev.time <= time) return false;
  book[String(chapter)] = {
    time: Math.round(time * 100) / 100,
    data: data.slice(0, P.GHOST_MAX * 4).map(n => Math.round(n)),
  };
  try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { return false; }
  return true;
}

/** interpolates the ghost pose at time t; returns null when the run is over */
export function ghostPoseAt(run: GhostRun, t: number): { x: number; y: number; facing: number; done: boolean } | null {
  const d = run.data;
  if (t <= 0) return { x: d[1], y: d[2], facing: d[3] || 1, done: false };
  // times are stored in centiseconds; samples are GHOST_DT apart
  const idx = (t * 100) / (P.GHOST_DT * 100);
  const i = Math.floor(idx);
  const frac = idx - i;
  const a = i * 4, b = (i + 1) * 4;
  if (b + 3 >= d.length) {
    const last = d.length - 4;
    return { x: d[last + 1], y: d[last + 2], facing: d[last + 3] || 1, done: true };
  }
  return {
    x: d[a + 1] + (d[b + 1] - d[a + 1]) * frac,
    y: d[a + 2] + (d[b + 2] - d[a + 2]) * frac,
    facing: (frac < 0.5 ? d[a + 3] : d[b + 3]) || 1,
    done: false,
  };
}

/** recording helper: appends a sample if enough time passed; returns array for chaining */
export function sampleInto(arr: number[], t: number, x: number, y: number, facing: number): number[] {
  if (arr.length >= P.GHOST_MAX * 4) return arr;
  const tc = Math.round(clamp(t, 0, 36000) * 100); // centiseconds — exact at GHOST_DT
  if (arr.length > 0 && tc - arr[arr.length - 4] < P.GHOST_DT * 100) return arr;
  arr.push(tc, Math.round(x), Math.round(y), facing >= 0 ? 1 : -1);
  return arr;
}
