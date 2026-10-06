// ─────────────────────────────────────────────────────────────
// MOTH — renderer: silhouette world, fog, grain, the child
// ─────────────────────────────────────────────────────────────
import { VIEW_W, VIEW_H, mulberry, clamp, P } from './types';
import type { LevelDef, Rect, RopeDef, CrumbleDef } from './types';

export interface RenderParticle {
  x: number; y: number; life: number; max: number; size: number;
  kind: string; rot?: number;
}
export interface RenderPlayer {
  x: number; y: number; vx: number; vy: number; facing: number;
  grounded: boolean; runPhase: number; pushing: boolean;
  dead: boolean; deadT: number; sinkT: number;
  onRope: boolean; ropeAngle: number;
  swimming: boolean; breath01: number;
  landT: number; shadowY: number;
  kid?: number; w?: number; h?: number;
}
export interface GhostPose { x: number; y: number; facing: number; done: boolean }
export interface RenderState {
  ctx: CanvasRenderingContext2D;
  time: number;
  level: LevelDef;
  camX: number; camY: number;
  player: RenderPlayer | null;
  wardens?: { x: number; y: number; dir: number; walking: boolean; reach: number; exp: number; mom?: boolean }[];
  followers?: { kid: number; x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; runPhase: number; w: number; h: number; dead?: boolean; deadT?: number }[];
  crates: Rect[];
  gates: { def: NonNullable<LevelDef['gates']>[number]; open: number }[];
  movers: Rect[];
  saws: { x: number; y: number; r: number; angle: number }[];
  traps: { x: number; y: number; state: string; timer: number }[];
  crushers: { def: Extract<LevelDef['hazards'][number], { kind: 'crusher' }>; y: number }[];
  levers: { x: number; y: number; on: boolean }[];
  plates: { x: number; y: number; w: number; pressed: boolean }[];
  ropes: { def: RopeDef; angle: number; held: boolean; bobX: number; bobY: number; sway: number }[];
  crumbles: { def: CrumbleDef; state: string; y: number; alpha: number; stood: number }[];
  stalkers: { x: number; y: number; state: string; dir: number; t: number; animT: number }[];
  shards: { x: number; y: number }[];
  particles: RenderParticle[];
  particleCount: number;
  ghost: GhostPose | null;
  lang: 'ar' | 'en';
  mode: string; modeT: number; deathT: number;
  checkpoint: number;
  fx: { grain: boolean; contrast: boolean };
  debug: { fps: number; px: number; py: number; solids: Rect[]; stalkerStates: string[] } | null;
}

// ── cached layers ────────────────────────────────────────────
interface LayerCache {
  level: LevelDef;
  far: HTMLCanvasElement; farF: number;
  mid: HTMLCanvasElement; midF: number;
  fore: HTMLCanvasElement; foreF: number;
  frameTL: HTMLCanvasElement; frameTR: HTMLCanvasElement;
}
let cache: LayerCache | null = null;
let vignette: HTMLCanvasElement | null = null;
let grainTiles: HTMLCanvasElement[] = [];
let grainPatterns: (CanvasPattern | null)[] = [];
// per-theme pre-rendered atmosphere (huge perf win: no per-frame gradients)
const themeStatics = new Map<string, {
  sky: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  fog: HTMLCanvasElement;
  rays: HTMLCanvasElement | null;
}>();
// shared radial glow sprite for the bloom pass
let glowSprite: HTMLCanvasElement | null = null;

function mk(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w)); c.height = Math.ceil(h);
  return c;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// colourful-sad cut-paper night: bold indigo/teal base, citron + apricot signals (visual spec)
function palette(theme: string) {
  switch (theme) {
    case 'machine': return { skyT: '#2c2536', skyM: '#201c2a', skyB: '#14111c', far: '#4B3D3D', mid: '#2e2428', ground: '#3a2a27', dark: '#1a1218', accent: '#D77A52', light: '#F1A15B', glowX: 0.5, glowY: 0.32, glowA: 0.16, fogc: '#7a5a50' };
    case 'deep': return { skyT: '#1a3046', skyM: '#101e31', skyB: '#0a1422', far: '#294659', mid: '#17303f', ground: '#1d3c44', dark: '#0c1a24', accent: '#A5C6B7', light: '#8CCAC5', glowX: 0.5, glowY: 0.12, glowA: 0.14, fogc: '#5a8f96' };
    case 'ruins': return { skyT: '#2e2538', skyM: '#211B2A', skyB: '#150f1d', far: '#40334A', mid: '#2c2236', ground: '#3d2f45', dark: '#1a1222', accent: '#B77C88', light: '#E6A36D', glowX: 0.82, glowY: 0.16, glowA: 0.18, fogc: '#7a6483' };
    case 'pale': return { skyT: '#1c2a52', skyM: '#101A32', skyB: '#0a1124', far: '#283D59', mid: '#1b2c42', ground: '#274a52', dark: '#0d1826', accent: '#D8D08C', light: '#F4C879', glowX: 0.62, glowY: 0.14, glowA: 0.28, fogc: '#6a8fa8' };
    default: return { skyT: '#274a60', skyM: '#18283A', skyB: '#0f1a2a', far: '#35575A', mid: '#223a40', ground: '#2c4545', dark: '#0f1c24', accent: '#D6C56D', light: '#F1B56F', glowX: 0.7, glowY: 0.22, glowA: 0.2, fogc: '#6f9a9a' };
  }
}

// ── silhouette painters ──────────────────────────────────────
function paintTree(g: CanvasRenderingContext2D, x: number, baseY: number, h: number, rnd: () => number, color: string) {
  g.strokeStyle = color; g.fillStyle = color;
  const tw = h * 0.055;
  // trunk
  g.beginPath();
  g.moveTo(x - tw, baseY);
  g.quadraticCurveTo(x - tw * 0.4, baseY - h * 0.55, x - tw * 0.25, baseY - h);
  g.lineTo(x + tw * 0.25, baseY - h);
  g.quadraticCurveTo(x + tw * 0.4, baseY - h * 0.55, x + tw, baseY);
  g.fill();
  // branches
  const nb = 2 + Math.floor(rnd() * 3);
  g.lineWidth = Math.max(1.5, tw * 0.5);
  g.lineCap = 'round';
  for (let i = 0; i < nb; i++) {
    const by = baseY - h * (0.45 + rnd() * 0.45);
    const dir = rnd() > 0.5 ? 1 : -1;
    const bl = h * (0.18 + rnd() * 0.25);
    g.beginPath();
    g.moveTo(x, by);
    g.quadraticCurveTo(x + dir * bl * 0.5, by - bl * 0.28, x + dir * bl, by - bl * 0.45);
    g.stroke();
  }
  // canopy
  const cn = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < cn; i++) {
    const cx = x + (rnd() - 0.5) * h * 0.5;
    const cy = baseY - h + (rnd() - 0.5) * h * 0.28;
    const cr = h * (0.16 + rnd() * 0.17);
    g.beginPath(); g.ellipse(cx, cy, cr, cr * 0.72, 0, 0, Math.PI * 2); g.fill();
  }
}

function paintFar(level: LevelDef, c: HTMLCanvasElement, scale = 1) {
  const g = c.getContext('2d')!;
  const pal = palette(level.theme);
  const rnd = mulberry(level.width * 7 + 13);
  const W = c.width / scale; // logical paint width (canvas may be low-res)
  // distant hills
  g.fillStyle = pal.far; g.globalAlpha = 0.75;
  for (let x = -100; x < W + 100;) {
    const w = 260 + rnd() * 420, h = 60 + rnd() * 130;
    g.beginPath(); g.ellipse(x + w / 2, VIEW_H + 40, w / 2, h + 120, 0, Math.PI, 0); g.fill();
    x += w * 0.7;
  }
  g.globalAlpha = 1;
  if (level.theme === 'machine') {
    // factory skyline
    for (let x = 0; x < W;) {
      const w = 90 + rnd() * 160, h = 150 + rnd() * 260;
      g.fillStyle = pal.far;
      g.fillRect(x, VIEW_H - 120 - h, w, h + 120);
      if (rnd() > 0.5) { // chimney
        g.fillRect(x + w * 0.2, VIEW_H - 160 - h - 60, w * 0.16, 80);
        g.beginPath(); g.ellipse(x + w * 0.28, VIEW_H - 170 - h - 60, 26 + rnd() * 20, 16 + rnd() * 12, 0, 0, Math.PI * 2); g.fill();
      }
      x += w + 30 + rnd() * 90;
    }
  } else if (level.theme === 'deep') {
    for (let x = 0; x < W;) {
      const w = 120 + rnd() * 220, h = 100 + rnd() * 240;
      g.fillStyle = pal.far;
      g.beginPath();
      g.moveTo(x, VIEW_H);
      g.quadraticCurveTo(x + w * 0.3, VIEW_H - h, x + w * 0.5, VIEW_H - h * (0.8 + rnd() * 0.3));
      g.quadraticCurveTo(x + w * 0.8, VIEW_H - h * 0.6, x + w, VIEW_H);
      g.fill();
      x += w * (0.55 + rnd() * 0.3);
    }
    // far stalactites
    for (let x = 20; x < W; x += 60 + rnd() * 120) {
      const h = 60 + rnd() * 150, w = 14 + rnd() * 26;
      g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x + w, 0); g.lineTo(x, h); g.fill();
    }
  } else if (level.theme === 'pale') {
    // drowned arches and broken columns, far away
    for (let x = 40; x < W; x += 240 + rnd() * 260) {
      g.fillStyle = pal.far;
      const w = 120 + rnd() * 160, h = 220 + rnd() * 200;
      if (rnd() > 0.45) {
        // arch
        g.beginPath();
        g.moveTo(x, VIEW_H);
        g.lineTo(x, VIEW_H - h * 0.6);
        g.quadraticCurveTo(x + w / 2, VIEW_H - h * 1.25, x + w, VIEW_H - h * 0.6);
        g.lineTo(x + w, VIEW_H);
        g.lineTo(x + w * 0.82, VIEW_H);
        g.lineTo(x + w * 0.82, VIEW_H - h * 0.55);
        g.quadraticCurveTo(x + w / 2, VIEW_H - h * 1.02, x + w * 0.18, VIEW_H - h * 0.55);
        g.lineTo(x + w * 0.18, VIEW_H);
        g.closePath(); g.fill();
      } else {
        // broken column
        const cw = 26 + rnd() * 22;
        g.fillRect(x, VIEW_H - h, cw, h);
        g.beginPath();
        g.moveTo(x - 6, VIEW_H - h); g.lineTo(x + cw + 6, VIEW_H - h);
        g.lineTo(x + cw * (0.3 + rnd() * 0.4), VIEW_H - h - 26 - rnd() * 30);
        g.closePath(); g.fill();
      }
    }
  } else {
    for (let x = 30; x < W; x += 70 + rnd() * 90)
      paintTree(g, x, VIEW_H - 60, 170 + rnd() * 200, rnd, pal.far);
  }
}

function paintMid(level: LevelDef, c: HTMLCanvasElement, scale = 1) {
  const g = c.getContext('2d')!;
  const pal = palette(level.theme);
  const rnd = mulberry(level.width * 31 + 7);
  const W = c.width / scale;
  if (level.theme === 'machine') {
    for (let x = 40; x < W; x += 150 + rnd() * 200) {
      g.fillStyle = pal.mid; g.strokeStyle = pal.mid;
      const kind = rnd();
      if (kind < 0.35) { // tank
        const w = 120 + rnd() * 90, h = 160 + rnd() * 120;
        g.beginPath(); g.ellipse(x + w / 2, VIEW_H - h, w / 2, 26, 0, Math.PI, 0); g.fill();
        g.fillRect(x, VIEW_H - h, w, h);
      } else if (kind < 0.7) { // girder tower
        const w = 60 + rnd() * 40, h = 240 + rnd() * 200;
        g.lineWidth = 7;
        g.strokeRect(x, VIEW_H - h, w, h);
        g.beginPath();
        for (let yy = VIEW_H - h; yy < VIEW_H - 40; yy += 46) {
          g.moveTo(x, yy); g.lineTo(x + w, yy + 46);
          g.moveTo(x + w, yy); g.lineTo(x, yy + 46);
        }
        g.stroke();
      } else { // pipe run
        const y = 140 + rnd() * 200, len = 200 + rnd() * 260;
        g.lineWidth = 16; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.lineTo(x + len, y + 90 + rnd() * 120); g.stroke();
      }
      // hanging chains
      if (rnd() > 0.4) {
        const cx = x + rnd() * 80, len = 120 + rnd() * 200;
        g.lineWidth = 3;
        g.beginPath();
        for (let yy = 0; yy < len; yy += 9) { g.moveTo(cx - 2.5, yy); g.lineTo(cx + 2.5, yy + 4.5); g.lineTo(cx - 2.5, yy + 9); }
        g.stroke();
        g.beginPath(); g.arc(cx, len + 8, 7, 0, Math.PI * 2); g.stroke();
      }
    }
  } else if (level.theme === 'deep') {
    for (let x = 60; x < W; x += 130 + rnd() * 170) {
      g.fillStyle = pal.mid;
      // rock columns
      const w = 50 + rnd() * 70;
      g.beginPath();
      g.moveTo(x - w / 2, VIEW_H);
      g.quadraticCurveTo(x - w * 0.3, VIEW_H * 0.5, x - w * 0.18, 0);
      g.lineTo(x + w * 0.18, 0);
      g.quadraticCurveTo(x + w * 0.3, VIEW_H * 0.5, x + w / 2, VIEW_H);
      g.fill();
      // big stalactites
      if (rnd() > 0.3) {
        const sx = x + 60 + rnd() * 60, sh = 130 + rnd() * 190, sw = 20 + rnd() * 30;
        g.beginPath(); g.moveTo(sx - sw, 0); g.lineTo(sx + sw, 0);
        g.quadraticCurveTo(sx + sw * 0.2, sh * 0.6, sx, sh); g.fill();
      }
    }
  } else if (level.theme === 'pale') {
    // petrified trees with a few pale leaves, hanging moss
    for (let x = 60; x < W; x += 170 + rnd() * 190) {
      paintTree(g, x, VIEW_H - 30, 260 + rnd() * 220, rnd, pal.mid);
      if (rnd() > 0.4) {
        const mx = x + (rnd() - 0.5) * 100, ml = 60 + rnd() * 120;
        g.strokeStyle = pal.mid; g.lineWidth = 2.5;
        for (let k = 0; k < 3; k++) {
          g.beginPath(); g.moveTo(mx + k * 8, 130 + rnd() * 60);
          g.quadraticCurveTo(mx + k * 8 + 6, 200, mx + k * 8 + (rnd() - 0.5) * 20, 190 + ml);
          g.stroke();
        }
      }
    }
  } else {
    for (let x = 60; x < W; x += 130 + rnd() * 150) {
      paintTree(g, x, VIEW_H - 30, 300 + rnd() * 260, rnd, pal.mid);
      if (rnd() > 0.45) { // hanging vine
        const vx = x + (rnd() - 0.5) * 120, vl = 90 + rnd() * 160;
        g.strokeStyle = pal.mid; g.lineWidth = 3;
        g.beginPath(); g.moveTo(vx, 120);
        g.quadraticCurveTo(vx + 14, 120 + vl * 0.5, vx + (rnd() - 0.5) * 30, 120 + vl);
        g.stroke();
      }
    }
  }
}

function paintFore(level: LevelDef, c: HTMLCanvasElement, scale = 1) {
  // out-of-focus grass strip along the bottom — painted at reduced
  // resolution and drawn upscaled (canvas smoothing = free blur, no filters)
  const g = c.getContext('2d')!;
  const rnd = mulberry(level.width * 91 + 3);
  const W = c.width / scale;
  g.fillStyle = 'rgba(12,16,30,0.82)';
  for (let x = 0; x < W; x += 8 + rnd() * 22) {
    const h = 26 + rnd() * 70;
    for (let b = 0; b < 3; b++) {
      const bx = x + b * 5, bh = h * (0.6 + rnd() * 0.6);
      g.beginPath();
      g.moveTo(bx - 4, VIEW_H + 6);
      g.quadraticCurveTo(bx + (rnd() - 0.5) * 26, VIEW_H - bh * 0.7, bx + (rnd() - 0.5) * 34, VIEW_H - bh);
      g.lineTo(bx + 4, VIEW_H + 6);
      g.fill();
    }
  }
}

function paintFramePieces(theme: string, scale = 1) {
  // big blurred branches for screen corners (low-res + upscale = soft focus)
  const mk2 = (flip: boolean) => {
    const c = mk(420 * scale, 300 * scale); const g = c.getContext('2d')!;
    g.scale(scale, scale);
    const rnd = mulberry(flip ? 77 : 55);
    g.strokeStyle = 'rgba(14,18,34,0.9)'; g.fillStyle = 'rgba(14,18,34,0.9)';
    g.lineCap = 'round';
    const bx = flip ? 420 : 0;
    g.lineWidth = 17;
    g.beginPath(); g.moveTo(bx, 20);
    g.quadraticCurveTo(bx + (flip ? -150 : 150), 50, bx + (flip ? -260 : 260), 150 + rnd() * 60);
    g.stroke();
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + rnd() * 0.75;
      const px = bx + (flip ? -1 : 1) * (260 * t), py = 30 + t * 130;
      g.lineWidth = 5 + rnd() * 6;
      g.beginPath(); g.moveTo(px, py);
      g.quadraticCurveTo(px + (rnd() - 0.5) * 90, py + 40, px + (rnd() - 0.5) * 130, py + 70 + rnd() * 60);
      g.stroke();
      if (theme !== 'machine') {
        g.beginPath(); g.ellipse(px + (rnd() - 0.5) * 110, py + 80, 12 + rnd() * 14, 7 + rnd() * 8, rnd(), 0, Math.PI * 2); g.fill();
      }
    }
    return c;
  };
  return { tl: mk2(false), tr: mk2(true) };
}

// ── progressive layer baking ─────────────────────────────────
// Layers are painted at REDUCED resolution and drawn upscaled — canvas
// smoothing gives the soft cinematic look with zero blur filters and a
// fraction of the raster cost. One layer bakes per frame so the main
// thread never blocks (a sync all-layer bake froze phones for seconds).
const FAR_S = 0.5, MID_S = 0.5, FORE_S = 0.25, FRAME_S = 0.25;
let baking: { level: LevelDef; step: number; parts: Partial<LayerCache> } | null = null;

function scaledCanvas(w: number, h: number, s: number) {
  const c = mk(w * s, h * s);
  c.getContext('2d')!.scale(s, s);
  return c;
}

function ensureCache(level: LevelDef) {
  if (cache && cache.level === level) return;
  if (!baking || baking.level !== level) {
    baking = { level, step: 0, parts: {} };
    cache = null; // never draw another level's parallax
  }
  const range = Math.max(1, level.width - VIEW_W);
  const p = baking.parts;
  switch (baking.step) {
    case 0: { const c = scaledCanvas(range * 0.26 + VIEW_W, VIEW_H, FAR_S); paintFar(level, c, FAR_S); p.far = c; break; }
    case 1: { const c = scaledCanvas(range * 0.55 + VIEW_W, VIEW_H, MID_S); paintMid(level, c, MID_S); p.mid = c; break; }
    case 2: { const c = scaledCanvas(range * 0.16 + VIEW_W + 200, VIEW_H, FORE_S); paintFore(level, c, FORE_S); p.fore = c; break; }
    case 3: { const fr = paintFramePieces(level.theme, FRAME_S); p.frameTL = fr.tl; p.frameTR = fr.tr; break; }
  }
  baking.step++;
  if (baking.step >= 4) {
    cache = {
      level,
      far: p.far!, farF: 0.26,
      mid: p.mid!, midF: 0.55,
      fore: p.fore!, foreF: 1.16,
      frameTL: p.frameTL!, frameTR: p.frameTR!,
    };
    baking = null;
  }
}

function buildThemeStatics(theme: string) {
  let ts = themeStatics.get(theme);
  if (ts) return ts;
  const pal = palette(theme);
  // sky gradient baked once
  const sky = mk(VIEW_W, VIEW_H);
  {
    const g = sky.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, pal.skyT); grad.addColorStop(0.55, pal.skyM); grad.addColorStop(1, pal.skyB);
    g.fillStyle = grad; g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // ambient glow baked once
  const glow = mk(VIEW_W, VIEW_H);
  {
    const g = glow.getContext('2d')!;
    const gx = VIEW_W * pal.glowX, gy = VIEW_H * pal.glowY;
    const rg = g.createRadialGradient(gx, gy, 10, gx, gy, VIEW_H * 0.85);
    rg.addColorStop(0, hexA(pal.light, pal.glowA));
    rg.addColorStop(1, hexA(pal.light, 0));
    g.fillStyle = rg; g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // fog band strip baked once
  const fog = mk(VIEW_W + 120, 220);
  {
    const g = fog.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 220);
    grad.addColorStop(0, hexA(pal.fogc, 0));
    grad.addColorStop(0.5, hexA(pal.fogc, 1));
    grad.addColorStop(1, hexA(pal.fogc, 0));
    g.fillStyle = grad; g.fillRect(0, 0, VIEW_W + 120, 220);
  }
  // god rays for the pale chapter, baked once
  let rays: HTMLCanvasElement | null = null;
  if (theme === 'pale') {
    rays = mk(VIEW_W, VIEW_H);
    const g = rays.getContext('2d')!;
    const rnd = mulberry(991);
    for (let i = 0; i < 5; i++) {
      const cx = 120 + i * 260 + rnd() * 120;
      const wTop = 30 + rnd() * 46, wBot = wTop * (2.4 + rnd());
      const a = 0.05 + rnd() * 0.06;
      const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, `rgba(252,252,246,${a})`);
      grad.addColorStop(0.85, 'rgba(252,252,246,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, 0); g.lineTo(cx + wTop, 0);
      g.lineTo(cx + wBot + 120, VIEW_H); g.lineTo(cx + wBot - wTop + 120, VIEW_H);
      g.closePath(); g.fill();
    }
  }
  ts = { sky, glow, fog, rays };
  themeStatics.set(theme, ts);
  return ts;
}

function buildStatics() {
  if (!glowSprite) {
    glowSprite = mk(128, 128);
    const g = glowSprite.getContext('2d')!;
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  }
  if (!vignette) {
    vignette = mk(VIEW_W, VIEW_H);
    const g = vignette.getContext('2d')!;
    const rg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    rg.addColorStop(0, 'rgba(16,21,38,0)');
    rg.addColorStop(0.75, 'rgba(16,21,38,0.2)');
    rg.addColorStop(1, 'rgba(16,21,38,0.5)');
    g.fillStyle = rg; g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (grainTiles.length === 0) {
    for (let i = 0; i < 4; i++) {
      const c = mk(220, 220); const g = c.getContext('2d')!;
      const img = g.createImageData(220, 220);
      for (let p = 0; p < img.data.length; p += 4) {
        const v = Math.random() * 255;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 22;
      }
      g.putImageData(img, 0, 0);
      grainTiles.push(c);
    }
  }
}

// bloom sprite helper (additive)
function bloom(g: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01) return;
  g.globalAlpha = alpha;
  g.drawImage(glowSprite!, x - r, y - r, r * 2, r * 2);
  g.globalAlpha = 1;
}

// ── grass on ground tops ─────────────────────────────────────
const tuftCache = new Map<string, { x: number; h: number; lean: number }[]>();
function tuftsFor(level: LevelDef, r: Rect) {
  const key = level.width + ':' + r.x + ',' + r.y;
  let t = tuftCache.get(key);
  if (!t) {
    const rnd = mulberry(Math.floor(r.x * 3 + r.y * 7));
    t = [];
    for (let x = 4; x < r.w - 2; x += 5 + rnd() * 9)
      if (rnd() > 0.25) t.push({ x, h: 3 + rnd() * (level.theme === 'machine' ? 4 : 9), lean: (rnd() - 0.5) * 6 });
    tuftCache.set(key, t);
  }
  return t;
}

// ── the child ────────────────────────────────────────────────
function solveKnee(hipX: number, hipY: number, fx: number, fy: number, l1: number, l2: number, bend: number) {
  let dx = fx - hipX, dy = fy - hipY;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; fx = hipX + dx; fy = hipY + dy; }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(dy, dx) + a * bend;
  return { kx: hipX + Math.cos(ang) * l1, ky: hipY + Math.sin(ang) * l1, fx, fy };
}

function drawBoy(g: CanvasRenderingContext2D, p: RenderPlayer, time: number, _contrast: boolean, echo = false) {
  if (p.dead && p.deadT > 0.85) return;
  const dk = p.dead ? Math.max(0, 1 - p.deadT / 0.85) : 1;
  const alpha = (p.dead ? dk * dk : 1) * (echo ? 0.55 : 1);
  g.save();
  if (p.dead) g.translate(0, (1 - dk) * 5);
  g.globalAlpha = Math.max(0, alpha);
  const kd = p.kid ?? 0;
  g.translate(p.x + (p.w ?? 20) / 2, p.y + (p.h ?? 46));
  { const sc = (p.h ?? 46) / 46; g.scale(sc * (kd === 1 ? 1.16 : kd === 2 ? 0.93 : 0.98), sc); }
  // landing squash & settle
  if (!echo && p.landT < P.LAND_SQUASH && p.grounded) {
    const k = 1 - p.landT / P.LAND_SQUASH;
    g.scale(1 + 0.14 * k, 1 - 0.13 * k);
  }
  if (echo) { g.strokeStyle = 'rgba(225,235,245,0.5)'; g.fillStyle = 'rgba(225,235,245,0.5)'; }
  if (p.onRope) {
    // hanging pose: body below the hands, slight tilt with the swing
    g.rotate(p.ropeAngle * 0.16);
    g.translate(0, -46);
    g.strokeStyle = '#000'; g.fillStyle = '#000';
    g.lineCap = 'round'; g.lineJoin = 'round';
    // arms straight up to the rope
    g.lineWidth = 3.6;
    g.beginPath(); g.moveTo(-1, -34); g.lineTo(0, -46); g.stroke();
    g.beginPath(); g.moveTo(1.5, -34); g.lineTo(0.5, -46); g.stroke();
    // torso
    g.lineWidth = 7.5;
    g.beginPath(); g.moveTo(0, -36); g.lineTo(0, -17); g.stroke();
    // legs tucked, kicking gently
    const kick = Math.sin(time * 3.2) * 2.5;
    const l1 = 10.5, l2 = 10.5;
    for (let i = 0; i < 2; i++) {
      const fx = 3.5 - i * 5 + kick * (i === 0 ? 1 : -0.6);
      const fy = -6 - (i === 0 ? 3 : 0);
      const { kx, ky, fx: ex, fy: ey } = solveKnee(0, -17, fx, fy, l1, l2, -1);
      g.lineWidth = 4.4;
      g.beginPath(); g.moveTo(0, -17); g.lineTo(kx, ky); g.lineTo(ex, ey); g.stroke();
    }
    // head
    g.beginPath(); g.arc(0.5, -41, 7.2, 0, Math.PI * 2); g.fill();
    // glowing eyes look along the swing
    const lookX = clamp(p.ropeAngle * 2.4, -1.6, 1.6);
    g.save();
    g.globalAlpha = Math.max(0, alpha);
    g.shadowColor = 'rgba(255,255,255,0.95)'; g.shadowBlur = 7;
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(2.6 + lookX, -42, 1.35, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(5.2 + lookX, -42.2, 1.15, 0, Math.PI * 2); g.fill();
    g.restore();
    g.restore();
    return;
  }

  g.scale(p.facing, 1);
  if (p.swimming && !p.grounded) g.rotate(0.42); // prone paddle tilt

  const speed = Math.abs(p.vx);
  const running = p.grounded && speed > 30;
  const air = !p.grounded;
  const ph = p.runPhase;
  const bob = running ? Math.abs(Math.sin(ph * 2)) * 1.6 : Math.sin(time * 1.7) * 0.5;
  const lean = p.pushing ? 0.32 : running ? clamp(speed / 900, 0, 0.2) : 0;

  const hipX = 0, hipY = -19 - bob;
  const shX = Math.sin(lean) * 13, shY = -32 - bob + (1 - Math.cos(lean)) * 4;

  if (!echo) { g.strokeStyle = '#000'; g.fillStyle = '#000'; }
  g.lineCap = 'round'; g.lineJoin = 'round';

  // legs (far leg slightly lighter for depth? keep pure silhouette)
  const l1 = 10.5, l2 = 10.5;
  for (let i = 0; i < 2; i++) {
    let fx: number, fy: number;
    if (p.swimming && air) {
      const s = Math.sin(ph + i * Math.PI);
      fx = -4 + s * 5; fy = -4 + Math.abs(s) * 2;
    } else if (air) {
      fx = i === 0 ? 4.5 : -3; fy = i === 0 ? -7 : -4;
      if (p.vy > 200) { fx += 2; fy -= 3; }
    } else if (running) {
      const s = Math.sin(ph + i * Math.PI), c = Math.cos(ph + i * Math.PI);
      fx = s * clamp(speed / 24, 4, 9.5);
      fy = -Math.max(0, c) * 5.5;
    } else if (p.pushing) {
      fx = i === 0 ? -6 : 3; fy = 0;
    } else { fx = i === 0 ? 2.6 : -2.6; fy = 0; }
    const { kx, ky, fx: ex, fy: ey } = solveKnee(hipX, hipY, fx, fy, l1, l2, -1);
    if (!echo) g.strokeStyle = '#768C8D';
    g.lineWidth = 4.4;
    g.beginPath(); g.moveTo(hipX, hipY); g.lineTo(kx, ky); g.lineTo(ex, ey); g.stroke();
    if (!echo) { g.fillStyle = '#34384A'; g.beginPath(); g.ellipse(ex + 1.2, ey, 3.4, 2.2, 0, 0, Math.PI * 2); g.fill(); }
  }

  // torso: oversized citron sleep coat with a flared hem
  if (!echo) { g.strokeStyle = '#D2C66D'; g.fillStyle = '#D2C66D'; }
  g.lineWidth = 8.5;
  g.beginPath(); g.moveTo(hipX, hipY + 1); g.lineTo(shX, shY); g.stroke();
  if (!echo) {
    g.beginPath();
    g.moveTo(hipX - 7.5, hipY + 7); g.lineTo(hipX + 7.5, hipY + 7);
    g.lineTo(shX + 4.5, shY + 2); g.lineTo(shX - 4.5, shY + 2); g.closePath(); g.fill();
    g.fillStyle = '#376C70'; g.fillRect(hipX - 7.5, hipY + 5.4, 15, 1.8);
  }

  // arms
  for (let i = 0; i < 2; i++) {
    let hx: number, hy: number;
    if (p.swimming && air) {
      const s = Math.sin(ph + i * Math.PI + 1.2);
      hx = 6 + s * 6; hy = shY + 6 + Math.cos(ph * 0.5 + i) * 3;
    } else if (p.pushing) { hx = 13; hy = -25 - bob + (i === 0 ? -2.5 : 2.5); }
    else if (air) { hx = i === 0 ? 5 : -5; hy = shY + 4 + i * 3; }
    else if (running) {
      const s = Math.sin(ph + i * Math.PI + Math.PI);
      hx = shX * 0.4 + s * 6.5; hy = shY + 9 + Math.abs(s) * 1.5;
    } else { hx = shX * 0.3 + (i === 0 ? 2.5 : -1); hy = shY + 11 + Math.sin(time * 1.7 + i) * 0.4; }
    const midX = (shX + hx) / 2 + (air ? -2 : 1.5), midY = (shY + hy) / 2 + 2;
    if (!echo) g.strokeStyle = '#C9B85F';
    g.lineWidth = 3.9;
    g.beginPath(); g.moveTo(shX, shY + 1); g.quadraticCurveTo(midX, midY, hx, hy); g.stroke();
    if (!echo) { g.fillStyle = '#C8AE91'; g.beginPath(); g.arc(hx, hy + 0.4, 2.5, 0, Math.PI * 2); g.fill(); }
  }

  // head: dark irregular hair, small pale face turned forward
  const headX = shX + Math.sin(lean) * 4 + 0.5, headY = shY - 8.5;
  if (!echo) g.fillStyle = '#24283A';
  g.beginPath(); g.arc(headX, headY, 7.6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(headX - 6, headY - 4);
  g.quadraticCurveTo(headX - 2, headY - 12.5, headX + 4.5, headY - 7);
  g.lineTo(headX + 1, headY - 4); g.fill();
  if (!echo) { g.fillStyle = '#C8AE91'; g.beginPath(); g.ellipse(headX + 3.4, headY + 1.2, 3.6, 4.6, 0, 0, Math.PI * 2); g.fill(); }
  if (!echo && kd === 2) {  // Ila: gathered hair kept close to the profile, teal scarf
    g.fillStyle = '#24283A'; g.beginPath(); g.ellipse(headX - 7.5, headY + 1, 3.2, 5.2, 0.25, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#376C70'; g.fillRect(shX - 4.2, shY - 1.5, 8.4, 3.2);
  }
  if (!echo && kd === 1) {  // Bram: rounded cap of hair, blush sweater collar under the coat
    g.fillStyle = '#24283A'; g.beginPath(); g.arc(headX - 0.5, headY - 1.5, 7.8, Math.PI * 1.05, Math.PI * 2.1); g.fill();
    g.fillStyle = '#BB7776'; g.fillRect(shX - 4.8, shY - 1.6, 9.6, 3.0);
  }
  if (!echo && kd === 0) {  // Ness: one cuff snags, teal patch at the knee
    g.fillStyle = '#376C70'; g.fillRect(shX + 1.5, shY + 9.5, 4.2, 2.2);
  }
  // two tiny warm eyes (lit by the world, not glowing)
  const lookX = clamp(p.vx / 240, -1, 1) * 0.8;
  g.save();
  g.globalAlpha = Math.max(0, alpha) * (p.dead ? 0.4 : 1);
  g.fillStyle = echo ? 'rgba(235,240,250,0.7)' : '#2a2030';
  g.beginPath(); g.arc(headX + 3.6 + lookX, headY + 0.2, 1.0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(headX + 6.0 + lookX, headY + 0.1, 0.9, 0, Math.PI * 2); g.fill();
  g.restore();

  g.restore();

  if (echo) return; // the echo casts no UI elements

  // breath bar while swimming
  if (p.swimming && p.breath01 < 0.999 && !p.dead) {
    const bx = p.x + 10, by = p.y - 16;
    g.save();
    g.globalAlpha = 0.85;
    g.fillStyle = 'rgba(10,14,18,0.55)';
    g.fillRect(bx - 17, by - 2.5, 34, 5);
    const low = p.breath01 < 0.35;
    const pulse = low ? 0.6 + Math.sin(time * 10) * 0.4 : 1;
    g.fillStyle = low ? `rgba(235,240,245,${pulse})` : 'rgba(205,220,230,0.9)';
    g.fillRect(bx - 16, by - 1.5, 32 * Math.max(0, p.breath01), 3);
    g.restore();
  }
}

// ── world object painters ────────────────────────────────────
function drawSaw(g: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number, time: number) {
  g.save(); g.translate(x, y);
  // motion shimmer
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, r + 2, angle - 0.9, angle + 0.4); g.stroke();
  g.rotate(angle);
  g.fillStyle = '#040404';
  const teeth = 12;
  g.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
    const a2 = ((i + 1) / teeth) * Math.PI * 2;
    g.lineTo(Math.cos(a0) * (r - 4), Math.sin(a0) * (r - 4));
    g.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    g.lineTo(Math.cos(a2) * (r - 4), Math.sin(a2) * (r - 4));
  }
  g.closePath(); g.fill();
  g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fillStyle = '#0d0d0d'; g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(0, 0, r - 4, 0, Math.PI * 2); g.stroke();
  g.restore();
  void time;
}

function drawTrap(g: CanvasRenderingContext2D, x: number, y: number, state: string, timer: number) {
  g.save(); g.translate(x, y);
  if (state === 'shaking') g.translate((Math.random() - 0.5) * 2.4, 0);
  g.fillStyle = '#050505'; g.strokeStyle = '#050505';
  // base
  g.fillRect(-22, -3, 44, 4);
  const open = state === 'snapped' ? 0 : state === 'shaking' ? 0.25 + (0.34 - timer) : 1;
  // jaws: two arcs of teeth rotating up
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * 18, -3);
    g.rotate(side * -(1 - Math.min(open, 1)) * 1.35);
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const px = -side * t * 17;
      const py = -Math.sin(t * Math.PI * 0.62) * 15;
      g.lineTo(px, py - (i % 2 === 0 ? 4 : 0));
    }
    g.lineTo(-side * 17, 0);
    g.closePath(); g.fill();
    g.restore();
  }
  g.restore();
}

function drawRope(g: CanvasRenderingContext2D, r: RenderState['ropes'][number], time: number) {
  const { x: ax, y: ay, len } = r.def;
  // anchor mount
  g.fillStyle = '#060606';
  g.fillRect(ax - 7, ay - 8, 14, 8);
  g.beginPath(); g.arc(ax, ay, 3.5, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#070707';
  g.lineCap = 'round';
  if (r.held) {
    // taut straight line to the hands
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(r.bobX, r.bobY); g.stroke();
  } else {
    // free rope: gentle curve with idle sway, frayed end
    const swayA = r.sway;
    const bx = ax + Math.sin(swayA) * len;
    const by = ay + Math.cos(swayA) * len;
    const midX = ax + Math.sin(swayA * 0.4) * len * 0.5 + Math.sin(time * 1.3 + ax) * 3;
    const midY = ay + len * 0.52;
    g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(ax, ay);
    g.quadraticCurveTo(midX, midY, bx, by);
    g.stroke();
    // knot at the bottom
    g.lineWidth = 3.6;
    g.beginPath(); g.moveTo(bx, by - 7); g.lineTo(bx, by); g.stroke();
  }
}

function drawCrumble(g: CanvasRenderingContext2D, c: RenderState['crumbles'][number], time: number) {
  if (c.state === 'gone') return;
  const d = c.def;
  g.save();
  g.globalAlpha = clamp(c.alpha, 0, 1) * (c.state === 'returning' ? 0.75 : 1);
  if (c.state === 'shaking') g.translate((Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.4);
  g.fillStyle = '#060606';
  g.fillRect(d.x, c.y, d.w, d.h);
  // crumbling edge
  g.beginPath();
  for (let x = 0; x < d.w; x += 9) {
    g.moveTo(d.x + x, c.y + d.h);
    g.lineTo(d.x + x + 4.5, c.y + d.h + 4);
    g.lineTo(d.x + x + 9, c.y + d.h);
  }
  g.fill();
  // cracks spread as it weakens
  const standTime = d.standTime ?? 0.55;
  const wear = clamp(c.stood / standTime, 0, 1);
  if (wear > 0.12 && c.state !== 'falling') {
    g.strokeStyle = 'rgba(190,190,190,0.28)'; g.lineWidth = 1;
    const rnd = mulberry(Math.floor(d.x * 13 + d.y));
    const cracks = 1 + Math.floor(wear * 3);
    for (let i = 0; i < cracks; i++) {
      const cx = d.x + 8 + rnd() * (d.w - 16);
      g.beginPath(); g.moveTo(cx, c.y + 1);
      g.lineTo(cx + (rnd() - 0.5) * 10, c.y + d.h * 0.55);
      g.lineTo(cx + (rnd() - 0.5) * 14, c.y + d.h - 1);
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.07)';
  g.fillRect(d.x, c.y, d.w, 2);
  g.restore();
  void time;
}

function drawLightShaft(g: CanvasRenderingContext2D, l: { x: number; y: number; w: number; h: number }, time: number) {
  const cx = l.x + l.w / 2;
  const pulse = 0.8 + Math.sin(time * 1.1 + l.x * 0.01) * 0.2;
  // shaft
  const grad = g.createLinearGradient(0, 0, 0, l.y + l.h);
  grad.addColorStop(0, `rgba(250,250,244,${0.20 * pulse})`);
  grad.addColorStop(0.75, `rgba(250,250,244,${0.08 * pulse})`);
  grad.addColorStop(1, 'rgba(250,250,244,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(l.x - 14, 0); g.lineTo(l.x + l.w + 14, 0);
  g.lineTo(l.x + l.w + 4, l.y + l.h); g.lineTo(l.x - 4, l.y + l.h);
  g.closePath(); g.fill();
  // pool of light on the ground
  const rg = g.createRadialGradient(cx, l.y + l.h, 4, cx, l.y + l.h, l.w * 0.9);
  rg.addColorStop(0, `rgba(252,252,246,${0.22 * pulse})`);
  rg.addColorStop(1, 'rgba(252,252,246,0)');
  g.save();
  g.translate(cx, l.y + l.h);
  g.scale(1, 0.22);
  g.translate(-cx, -(l.y + l.h));
  g.fillStyle = rg;
  g.fillRect(cx - l.w, l.y + l.h - l.w, l.w * 2, l.w * 2);
  g.restore();
  // drifting motes inside the shaft
  g.fillStyle = `rgba(255,255,250,${0.5 * pulse})`;
  for (let i = 0; i < 5; i++) {
    const t = ((time * 0.14 + i * 0.23) % 1);
    g.globalAlpha = (1 - t) * 0.45;
    g.beginPath();
    g.arc(cx + Math.sin(i * 7 + time * 0.8) * l.w * 0.3, l.y + l.h - t * l.h, 1.2, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawStalker(g: CanvasRenderingContext2D, s: RenderState['stalkers'][number], time: number) {
  if (s.state === 'lurk') {
    // one tiny dim reflection from the dark, nothing else
    const blink = Math.sin(time * 1.7 + s.x) > -0.9 ? 1 : 0;
    if (blink) {
      g.save();
      g.fillStyle = 'rgba(165,198,183,0.55)';
      g.beginPath(); g.arc(s.x + 2, s.y - 24, 1.3, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    return;
  }
  g.save();
  g.translate(s.x, s.y);
  g.scale(s.dir, 1);
  const emergeK = s.state === 'emerge' ? clamp(1 - s.t / 0.7, 0, 1) : 1;
  const hunt = s.state === 'lungeTele' || s.state === 'lunge';
  const stretch = s.state === 'lunge' ? 1.22 : 1;
  g.globalAlpha = emergeK;
  g.scale(stretch, 1);
  g.translate(0, (1 - emergeK) * 22 + (s.state === 'lungeTele' ? 5 : 0));
  g.lineCap = 'round'; g.lineJoin = 'round';
  const moving = s.state === 'stalk' || s.state === 'lunge';
  const ph = s.animT * (moving ? 7 : 1.4);
  const body = '#0D1422', edge = '#475867';
  // hind legs: short and bent, short deliberate bursts
  g.strokeStyle = body; g.lineWidth = 4.2;
  for (let k = 0; k < 2; k++) {
    const sw = Math.sin(ph + k * 2.4) * (moving ? 5 : 1);
    g.beginPath(); g.moveTo(-18 + k * 6, -16); g.lineTo(-24 + k * 8 + sw, -7); g.lineTo(-20 + k * 8 + sw * 1.4, 0); g.stroke();
  }
  // the overlong forelimb, reaching ahead and testing the ground
  const reach = 30 + Math.sin(ph * 0.5) * (moving ? 5 : 2) + (hunt ? 12 : 0);
  g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(14, -20); g.quadraticCurveTo(22, -34, 20 + reach * 0.55, -16); g.lineTo(18 + reach, 0 - Math.max(0, Math.sin(ph)) * 4); g.stroke();
  // short second foreleg
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(8, -18); g.lineTo(10, -8 - Math.max(0, Math.sin(ph + 1.7)) * 3); g.lineTo(6, 0); g.stroke();
  // long low back, low shoulders (asymmetric)
  g.fillStyle = body;
  g.beginPath();
  g.moveTo(-30, -16);
  g.quadraticCurveTo(-24, -34, -6, -31);
  g.quadraticCurveTo(8, -30, 16, -22);
  g.quadraticCurveTo(14, -14, 2, -13);
  g.quadraticCurveTo(-18, -9, -30, -16);
  g.fill();
  // irregular head, dropped low and forward
  g.beginPath();
  g.moveTo(12, -24); g.quadraticCurveTo(22, -29, 31, -20); g.quadraticCurveTo(33, -16, 27, -14);
  g.quadraticCurveTo(21, -17, 16, -13); g.quadraticCurveTo(10, -16, 12, -24); g.fill();
  // edge catch along the spine, so it never reads as a false platform
  g.strokeStyle = edge; g.lineWidth = 1.1; g.globalAlpha = emergeK * 0.8;
  g.beginPath(); g.moveTo(-28, -18); g.quadraticCurveTo(-22, -33, -6, -30.5); g.quadraticCurveTo(6, -29.5, 14, -22.5); g.stroke();
  g.globalAlpha = emergeK;
  // one tiny dim reflection
  g.fillStyle = hunt ? 'rgba(242,164,90,0.9)' : 'rgba(165,198,183,0.55)';
  g.beginPath(); g.arc(24.5, -21, hunt ? 1.5 : 1.1, 0, Math.PI * 2); g.fill();
  g.restore();
}

// tall lantern-carrying warden, seen at a distance: stops fully before turning, lantern lags each step
function drawMother(g: CanvasRenderingContext2D, x: number, baseY: number, dir: number, walking: boolean, time: number, alpha: number) {
  g.save();
  g.translate(x, baseY);
  g.globalAlpha = alpha;
  const H = 124;
  const step = walking ? Math.sin(time * 2.2) : 0;
  const sway = walking ? Math.sin(time * 2.2 - 0.6) * 2.4 : Math.sin(time * 0.8) * 0.5;
  g.scale(dir, 1);
  g.fillStyle = '#20283A';
  // coat: narrow torso flaring to a triangular hem
  g.beginPath();
  g.moveTo(-6 + sway * 0.4, -H * 0.82); g.lineTo(6 + sway * 0.4, -H * 0.82);
  g.lineTo(9, -H * 0.55); g.lineTo(21 + step * 2, 0); g.lineTo(-21 + step * 2, 0); g.lineTo(-9, -H * 0.55);
  g.closePath(); g.fill();
  // plum inner seam
  g.fillStyle = '#654A5E';
  g.beginPath(); g.moveTo(1.5, -H * 0.55); g.lineTo(4, 0); g.lineTo(-1 + step, 0); g.closePath(); g.fill();
  // high rigid collar and small forward head
  g.fillStyle = '#20283A';
  g.fillRect(-5.5 + sway * 0.5, -H * 0.87, 11, H * 0.08);
  g.beginPath(); g.ellipse(4 + sway * 0.5, -H * 0.93, 6.2, 7.4, 0.12, 0, Math.PI * 2); g.fill();
  // bent arm and low lantern
  const lx = 16 + sway * 1.5 + step * 1.5, ly = -H * 0.28 + Math.abs(step) * 1.5;
  g.strokeStyle = '#20283A'; g.lineWidth = 4.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(3, -H * 0.78); g.quadraticCurveTo(20, -H * 0.55, lx, ly - 8); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.moveTo(lx, ly - 8); g.lineTo(lx, ly - 3); g.stroke();
  const fl = 0.95 + Math.sin(time * 9) * 0.04;
  for (const [r, a, c] of [[34, 0.07, '#C96F57'], [20, 0.24, '#F2A45A']] as const) {
    const rg = g.createRadialGradient(lx, ly, 1, lx, ly, r);
    rg.addColorStop(0, hexA(c, a * fl)); rg.addColorStop(1, hexA(c, 0));
    g.fillStyle = rg; g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#FFE0A0'; g.globalAlpha = alpha * 0.95 * fl;
  g.beginPath(); g.roundRect(lx - 3, ly - 4, 6, 8, 1.5); g.fill();
  g.restore();
}

// ── main render ──────────────────────────────────────────────
export function render(s: RenderState) {
  const g = s.ctx;
  buildStatics();
  ensureCache(s.level); // bakes one layer per frame — never blocks
  const pal = palette(s.level.theme);
  const ts = buildThemeStatics(s.level.theme);
  const scale = g.canvas.width / VIEW_W;
  g.setTransform(scale, 0, 0, scale, 0, 0);

  // sky (baked per theme; darkened for high contrast)
  g.drawImage(ts.sky, 0, 0);
  if (s.fx.contrast) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, VIEW_W, VIEW_H); }
  // ambient glow (baked; drifts slightly with the camera)
  g.drawImage(ts.glow, -s.camX * 0.05 + VIEW_W * pal.glowX - VIEW_W * pal.glowX, 0);
  // god rays in the pale chapter
  if (ts.rays) {
    g.globalAlpha = 0.8 + Math.sin(s.time * 0.4) * 0.2;
    g.drawImage(ts.rays, -s.camX * 0.1, 0);
    g.globalAlpha = 1;
  }

  // parallax layers + baked fog bands
  if (cache) g.drawImage(cache.far, -s.camX * cache.farF, 0, cache.far.width / FAR_S, VIEW_H);
  g.globalAlpha = s.level.theme === 'pale' ? 0.09 : 0.05;
  g.drawImage(ts.fog, -60 + Math.sin(s.time * 0.05) * 30, VIEW_H * 0.35 - 90);
  g.globalAlpha = 1;
  if (cache) g.drawImage(cache.mid, -s.camX * cache.midF, 0, cache.mid.width / MID_S, VIEW_H);
  g.globalAlpha = s.level.theme === 'pale' ? 0.07 : 0.04;
  g.drawImage(ts.fog, -60 - Math.sin(s.time * 0.04) * 30, VIEW_H * 0.62 - 90);
  g.globalAlpha = 1;

  // ── world space ──
  g.save();
  g.translate(-s.camX, -s.camY);

  // exit light
  drawExit(g, s);

  // light sanctuaries (under everything else)
  for (const l of s.level.lights ?? []) {
    if (l.x + l.w < s.camX - 80 || l.x > s.camX + VIEW_W + 80) continue;
    drawLightShaft(g, l, s.time);
  }

  // waters (behind grounds edge)
  for (const w of s.level.waters ?? []) drawWater(g, w, s.time);

  // background wardens (scenery): slow patrol, full stop before turning
  for (const m of s.level.mothers ?? []) {
    const L = Math.abs(m.x2 - m.x1), sp = 36, pause = 4.5;
    const cyc = 2 * (L / sp + pause), t = (s.time + m.x1 * 0.013) % cyc;
    let px: number, dir: number, walking = true;
    if (t < L / sp) { px = m.x1 + t * sp; dir = 1; }
    else if (t < L / sp + pause) { px = m.x2; dir = 1; walking = false; }
    else if (t < 2 * L / sp + pause) { px = m.x2 - (t - L / sp - pause) * sp; dir = -1; }
    else { px = m.x1; dir = -1; walking = false; }
    if (px < s.camX - 80 || px > s.camX + VIEW_W + 80) continue;
    g.save(); g.translate(px, m.y); g.scale(m.scale ?? 0.7, m.scale ?? 0.7);
    drawMother(g, 0, 0, dir, walking, s.time, 0.6);
    g.restore();
  }

  // grounds
  for (const r of s.level.grounds) {
    if (r.x + r.w < s.camX - 60 || r.x > s.camX + VIEW_W + 60) continue;
    const floating = (r as { floating?: boolean }).floating === true;
    g.fillStyle = pal.ground;
    g.fillRect(r.x, r.y, r.w, floating ? r.h : r.h + 200);
    if (floating) {
      // a stone lintel over a low tunnel: darker underside, chipped lower edge, and a shadowed gap beneath
      const by = r.y + r.h;
      let floorY = Infinity;
      for (const o of s.level.grounds) if (o !== r && o.x < r.x + r.w && o.x + o.w > r.x && o.y >= by - 1) floorY = Math.min(floorY, o.y);
      if (!isFinite(floorY)) floorY = by + 39;
      g.fillStyle = hexA(pal.dark, 0.35); g.fillRect(r.x, by, r.w, Math.max(0, floorY - by));
      g.fillStyle = hexA(pal.dark, 0.6); g.fillRect(r.x, by - 16, r.w, 16);
      g.fillStyle = pal.ground;
      g.beginPath();
      for (let x = 0; x < r.w; x += 14) { g.moveTo(r.x + x, by); g.lineTo(r.x + x + 7, by + 5 + ((x * 7) % 5)); g.lineTo(r.x + x + 14, by); }
      g.fill();
      g.fillStyle = hexA(pal.dark, 0.45);
      g.fillRect(r.x, r.y, 5, r.h); g.fillRect(r.x + r.w - 5, r.y, 5, r.h);
    }
    g.fillStyle = hexA(pal.accent, 0.35); g.fillRect(r.x, r.y, r.w, 3);
    g.fillStyle = hexA(pal.dark, 0.5); g.fillRect(r.x, r.y + 3, r.w, 26);
    // soft rim
    const rim = g.createLinearGradient(0, r.y - 14, 0, r.y + 4);
    rim.addColorStop(0, hexA(pal.dark, 0)); rim.addColorStop(1, hexA(pal.dark, 0.5));
    g.fillStyle = rim; g.fillRect(r.x, r.y - 14, r.w, 18);
    // grass tufts
    g.strokeStyle = pal.dark; g.lineWidth = 1.8; g.lineCap = 'round';
    for (const t of tuftsFor(s.level, r)) {
      g.beginPath();
      g.moveTo(r.x + t.x, r.y + 1);
      g.quadraticCurveTo(r.x + t.x + t.lean * 0.5, r.y - t.h * 0.6, r.x + t.x + t.lean, r.y - t.h);
      g.stroke();
    }
  }

  // spikes
  for (const h of s.level.hazards) {
    if (h.kind !== 'spikes') continue;
    if (h.x + h.w < s.camX - 40 || h.x > s.camX + VIEW_W + 40) continue;
    { // warning glow so a pit reads as lethal
      const gr = g.createLinearGradient(0, h.y - 90, 0, h.y + h.h);
      gr.addColorStop(0, 'rgba(200,60,40,0)'); gr.addColorStop(1, 'rgba(210,70,45,0.38)');
      g.fillStyle = gr; g.fillRect(h.x, h.y - 90, h.w, 90 + h.h);
    }
    g.fillStyle = '#9a2f26';
    const tw = 11;
    g.beginPath();
    for (let x = h.x; x < h.x + h.w; x += tw) {
      g.moveTo(x, h.y + h.h);
      g.lineTo(x + tw / 2, h.y);
      g.lineTo(x + tw, h.y + h.h);
    }
    g.fill();
  }

  // plates
  for (const p of s.plates) {
    g.fillStyle = pal.accent;
    const dy = p.pressed ? 2.5 : 0;
    g.fillRect(p.x, p.y - 5 + dy, p.w, 5);
    g.fillRect(p.x + 4, p.y - 7 + dy, p.w - 8, 2);
    if (p.pressed) {
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(p.x, p.y - 5 + dy, p.w, 1.5);
    }
  }

  // movers
  for (const m of s.movers) {
    g.fillStyle = pal.ground;
    g.fillRect(m.x, m.y, m.w, m.h);
    g.fillStyle = hexA(pal.accent, 0.6); g.fillRect(m.x, m.y, m.w, 3);
    g.beginPath(); // jagged bottom
    for (let x = 0; x < m.w; x += 10) {
      g.moveTo(m.x + x, m.y + m.h);
      g.lineTo(m.x + x + 5, m.y + m.h + 5);
      g.lineTo(m.x + x + 10, m.y + m.h);
    }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(m.x, m.y, m.w, 2);
  }

  // crumble platforms
  for (const c of s.crumbles) {
    if (c.def.x + c.def.w < s.camX - 40 || c.def.x > s.camX + VIEW_W + 40) continue;
    drawCrumble(g, c, s.time);
  }

  // ropes
  for (const r of s.ropes) {
    if (r.def.x + r.def.len < s.camX - 60 || r.def.x - r.def.len > s.camX + VIEW_W + 60) continue;
    drawRope(g, r, s.time);
  }

  // gates
  for (const gt of s.gates) {
    const d = gt.def;
    // frame posts
    g.fillStyle = '#080808';
    g.fillRect(d.x - 8, d.y - 26, 8, d.h + 26 + 200);
    g.fillRect(d.x + d.w, d.y - 26, 8, d.h + 26 + 200);
    g.fillRect(d.x - 8, d.y - 26, d.w + 16, 10); // lintel
    // slab sinking into ground
    const h = d.h * (1 - gt.open);
    if (h > 1) {
      const sy = d.y + d.h - h;
      g.fillStyle = '#070707';
      g.fillRect(d.x, sy, d.w, h + 200);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(d.x, sy, d.w, 3);
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let yy = sy + 16; yy < d.y + d.h; yy += 22) {
        g.beginPath(); g.moveTo(d.x + 3, yy); g.lineTo(d.x + d.w - 3, yy); g.stroke();
      }
    }
  }

  // levers
  for (const lv of s.levers) {
    g.fillStyle = '#070707';
    g.beginPath(); g.arc(lv.x, lv.y - 3, 6, Math.PI, 0); g.fill();
    const ang = lv.on ? 0.6 : -0.6;
    g.strokeStyle = '#070707'; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lv.x, lv.y - 4);
    g.lineTo(lv.x + Math.sin(ang) * 20, lv.y - 4 - Math.cos(ang) * 20); g.stroke();
    g.beginPath(); g.arc(lv.x + Math.sin(ang) * 20, lv.y - 4 - Math.cos(ang) * 20, 3.5, 0, Math.PI * 2); g.fill();
    // prompt
    if (s.player && Math.abs(s.player.x + 10 - lv.x) < 52 && !s.player.dead) {
      const pulse = 0.5 + Math.sin(s.time * 4) * 0.25;
      g.font = '600 13px Georgia, serif';
      g.textAlign = 'center';
      g.fillStyle = `rgba(230,230,230,${pulse})`;
      g.fillText('E', lv.x, lv.y - 44);
    }
  }

  // crates
  for (const c of s.crates) {
    g.fillStyle = '#080808';
    g.fillRect(c.x, c.y, c.w, c.h);
    g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1.5;
    g.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    g.beginPath();
    g.moveTo(c.x + 2, c.y + 2); g.lineTo(c.x + c.w - 2, c.y + c.h - 2);
    g.moveTo(c.x + c.w - 2, c.y + 2); g.lineTo(c.x + 2, c.y + c.h - 2);
    g.stroke();
  }

  // traps
  for (const t of s.traps) drawTrap(g, t.x, t.y, t.state, t.timer);

  // crushers
  for (const c of s.crushers) {
    const d = c.def;
    // chains to ceiling
    g.strokeStyle = '#111'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(d.x + d.w * 0.25, 0); g.lineTo(d.x + d.w * 0.25, c.y); g.stroke();
    g.beginPath(); g.moveTo(d.x + d.w * 0.75, 0); g.lineTo(d.x + d.w * 0.75, c.y); g.stroke();
    g.fillStyle = '#050505';
    g.fillRect(d.x, c.y, d.w, d.h);
    // teeth on bottom
    g.beginPath();
    for (let x = d.x; x < d.x + d.w; x += 12) {
      g.moveTo(x, c.y + d.h); g.lineTo(x + 6, c.y + d.h + 9); g.lineTo(x + 12, c.y + d.h);
    }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(d.x, c.y, d.w, 3);
  }

  // saws
  for (const sw of s.saws) {
    const gr = g.createRadialGradient(sw.x, sw.y, sw.r * 0.8, sw.x, sw.y, sw.r + 26);
    gr.addColorStop(0, 'rgba(210,70,45,0.35)'); gr.addColorStop(1, 'rgba(210,70,45,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(sw.x, sw.y, sw.r + 26, 0, Math.PI * 2); g.fill();
    drawSaw(g, sw.x, sw.y, sw.r, sw.angle, s.time);
  }
  // saw rails (from defs, so they don't move)
  g.strokeStyle = 'rgba(10,10,10,0.8)'; g.lineWidth = 3;
  for (const h of s.level.hazards) {
    if (h.kind !== 'saw' || !h.path || h.path.length < 2) continue;
    g.beginPath();
    g.moveTo(h.path[0].x, h.path[0].y);
    for (const pt of h.path.slice(1)) g.lineTo(pt.x, pt.y);
    g.stroke();
  }

  // soft blob shadows grounding the actors
  if (s.player && !s.player.dead && s.player.shadowY < s.level.height + 40) {
    const above = clamp(1 - (s.player.shadowY - (s.player.y + 46)) / 300, 0, 1);
    if (above > 0.02) {
      g.globalAlpha = 0.3 * above;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(s.player.x + 10, s.player.shadowY + 3, 11 + 6 * (1 - above), 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  }
  for (const st of s.stalkers) {
    if (st.state === 'lurk') continue;
    g.globalAlpha = 0.28;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(st.x, st.y + 3, 22, 4, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }

  // stalkers
  for (const st of s.stalkers) {
    if (st.x < s.camX - 120 || st.x > s.camX + VIEW_W + 120) continue;
    drawStalker(g, st, s.time);
  }
  // Ila listens: slow rings mark where the House is breathing
  if (s.player && s.player.kid === 2) {
    for (const st of s.stalkers) {
      if (Math.abs(st.x - s.player.x) > 1100) continue;
      for (let k = 0; k < 3; k++) {
        const ph = ((s.time * 0.5 + k / 3) % 1);
        g.strokeStyle = `rgba(120,200,196,${(1 - ph) * 0.55})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(st.x, st.y - 20, 20 + ph * 90, 12 + ph * 55, 0, 0, Math.PI * 2); g.stroke();
      }
    }
  }

  // memory shards
  for (const shard of s.shards) {
    const pulse = 0.72 + Math.sin(s.time * 3.2 + shard.x) * 0.28;
    g.save();
    g.translate(shard.x, shard.y);
    g.rotate(s.time * 0.35);
    g.shadowColor = 'rgba(235,245,255,0.95)';
    g.shadowBlur = 16 * pulse;
    g.fillStyle = `rgba(244,248,250,${0.72 + pulse * 0.2})`;
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(6, 0); g.lineTo(0, 12); g.lineTo(-6, 0); g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = `rgba(235,245,255,${0.12 * pulse})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(shard.x, shard.y, 22 + pulse * 5, 0, Math.PI * 2); g.stroke();
  }

  // particles (behind player)
  drawParticles(g, s, false);

  // your echo — the translucent ghost of your fastest run
  if (s.ghost && s.player && !s.player.dead) {
    const gp: RenderPlayer = {
      x: s.ghost.x, y: s.ghost.y, vx: s.ghost.facing * 60, vy: 0,
      facing: s.ghost.facing, grounded: true, runPhase: s.ghost.x * 0.055,
      pushing: false, dead: false, deadT: 0, sinkT: 0,
      onRope: false, ropeAngle: 0, swimming: false, breath01: 1, landT: 99, shadowY: 0,
    };
    drawBoy(g, gp, s.time, false, true);
  }

  // player
  for (const w of s.wardens ?? []) {
    // lantern beam: warm cone, flushes red as she notices movement
    const r = Math.min(1, w.exp / 0.55);
    const x0 = w.x + w.dir * 18, x1 = w.x + w.dir * w.reach;
    const grad = g.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, w.mom ? `rgba(255,${Math.round(90 - r * 40)},${Math.round(80 - r * 40)},${0.42 + r * 0.25})` : `rgba(255,${Math.round(214 - r * 120)},${Math.round(130 - r * 90)},${0.34 + r * 0.25})`);
    grad.addColorStop(1, w.mom ? 'rgba(255,90,80,0)' : 'rgba(255,214,130,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x0, w.y - 62); g.lineTo(x1, w.y - 120); g.lineTo(x1, w.y + 20); g.lineTo(x0, w.y - 40); g.closePath(); g.fill();
    g.save(); g.translate(w.x, w.y); g.scale(0.9, 0.9);
    drawMother(g, 0, 0, w.dir, w.walking, s.time, 0.95);
    g.restore();
    if (w.mom) {
      // red tint over her silhouette: a soft red glow at her body so she reads as Mom, not a warden
      g.save(); g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(w.x, w.y - 62, 4, w.x, w.y - 62, 70);
      rg.addColorStop(0, 'rgba(210,40,40,0.55)'); rg.addColorStop(1, 'rgba(210,40,40,0)');
      g.fillStyle = rg; g.fillRect(w.x - 70, w.y - 135, 140, 150); g.restore();
    }
  }
  for (const f of s.followers ?? []) {
    drawBoy(g, Object.assign({ pushing: false, dead: false, deadT: 0, sinkT: 0, onRope: false, ropeAngle: 0, swimming: false, breath01: 1, landT: 99, shadowY: 0 }, f) as RenderPlayer, s.time, false);
  }
  if (s.player) drawBoy(g, s.player, s.time, s.fx.contrast);

  // particles in front (chunks)
  drawParticles(g, s, true);

  // ── bloom: additive glow on the things that shine ──
  g.globalCompositeOperation = 'lighter';
  const e = s.level.exit;
  bloom(g, e.x + e.w / 2, e.y + e.h / 2, 110, 0.35 + Math.sin(s.time * 1.6) * 0.1);
  for (const shard of s.shards)
    bloom(g, shard.x, shard.y, 36, 0.3 + Math.sin(s.time * 3.2 + shard.x) * 0.12);
  for (const l of s.level.lights ?? [])
    bloom(g, l.x + l.w / 2, l.y + l.h - 8, l.w * 0.9, 0.22 + Math.sin(s.time * 1.1 + l.x * 0.01) * 0.06);
  if (s.player && !s.player.dead)
    bloom(g, s.player.x + 10 + s.player.facing * 3.5, s.player.y + 7, 11, 0.28);
  for (const st of s.stalkers)
    if (st.state === 'lungeTele' || st.state === 'lunge') bloom(g, st.x + st.dir * 22, st.y - 27, 16, 0.4);
  g.globalCompositeOperation = 'source-over';

  // hints (Arabic & English)
  if (s.player) {
    const ar = s.lang === 'ar';
    g.font = ar ? "300 15px Tahoma, 'Segoe UI', sans-serif" : '300 15px Georgia, serif';
    g.textAlign = 'center';
    for (const h of s.level.hints ?? []) {
      if (s.player.kid === 1 && h.text.startsWith('too heavy')) continue;
      const d = Math.abs(s.player.x - h.x);
      const a = clamp(1 - d / 320, 0, 1) * 0.9;
      if (a <= 0.01) continue;
      g.fillStyle = `rgba(235,232,220,${a})`;
      const txt = ar && h.textAr ? h.textAr : h.text;
      g.fillText(ar ? txt : spaced(txt), h.x, h.y);
    }
  }

  g.restore();

  // foreground out-of-focus grass
  g.globalAlpha = 0.85;
  if (cache) g.drawImage(cache.fore, -((s.camX * 0.16) % 240), 0, cache.fore.width / FORE_S, VIEW_H);
  g.globalAlpha = 1;

  // corner branches (slow sway)
  const sway = Math.sin(s.time * 0.45) * 5;
  g.globalAlpha = 0.9;
  if (cache) {
    g.drawImage(cache.frameTL, -30 + sway * 0.4, -40 + sway * 0.2, 420, 300);
    g.drawImage(cache.frameTR, VIEW_W - 390 - sway * 0.4, -30 - sway * 0.3, 420, 300);
  }
  g.globalAlpha = 1;

  // underwater tint
  if (s.player && (s.player.sinkT > 0.05 || (s.player.swimming && s.player.breath01 < 0.999))) {
    const drownK = s.player.swimming
      ? (1 - s.player.breath01) * 0.4
      : clamp(s.player.sinkT * 1.4, 0, 0.55);
    g.fillStyle = `rgba(6,10,14,${clamp(drownK, 0, 0.55)})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // death fade
  if (s.mode === 'dying') {
    g.fillStyle = `rgba(0,0,0,${clamp(s.deathT * 0.9, 0, 0.82)})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // level transition fade
  if (s.mode === 'fadeout') {
    g.fillStyle = `rgba(0,0,0,${clamp(s.modeT * 1.1, 0, 1)})`;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  // vignette + grain
  g.drawImage(vignette!, 0, 0);
  if (s.fx.grain && !(typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches)) {
    if (grainPatterns.length === 0)
      grainPatterns = grainTiles.map(t => g.createPattern(t, 'repeat'));
    g.save();
    g.translate(-Math.random() * 220, -Math.random() * 220);
    g.fillStyle = grainPatterns[Math.floor(s.time * 14) % grainPatterns.length]!;
    g.globalAlpha = 0.5;
    g.fillRect(0, 0, VIEW_W + 220, VIEW_H + 220);
    g.restore();
    g.globalAlpha = 1;
  }

  // debug overlay
  if (s.debug) drawDebug(g, s);
}

function drawDebug(g: CanvasRenderingContext2D, s: RenderState) {
  g.save();
  // collision boxes in world space
  g.save();
  g.translate(-s.camX, -s.camY);
  g.strokeStyle = 'rgba(80,255,120,0.5)'; g.lineWidth = 1;
  for (const r of s.debug!.solids) g.strokeRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = 'rgba(255,90,80,0.55)';
  for (const h of s.level.hazards) {
    if (h.kind === 'spikes') g.strokeRect(h.x, h.y, h.w, h.h);
    else if (h.kind === 'saw') { g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.stroke(); }
    else if (h.kind === 'crusher') g.strokeRect(h.x, h.y, h.w, h.h + h.range);
  }
  g.strokeStyle = 'rgba(90,160,255,0.6)';
  for (const r of s.level.ropes ?? []) {
    g.beginPath(); g.arc(r.x, r.y, 4, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(r.x, r.y + r.len, r.catchRadius ?? 64, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,140,0.5)';
  for (const l of s.level.lights ?? []) g.strokeRect(l.x, l.y, l.w, l.h);
  if (s.player) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.strokeRect(s.player.x, s.player.y, 20, 46); }
  g.restore();
  // text panel
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(8, 8, 240, 64 + s.debug!.stalkerStates.length * 14);
  g.fillStyle = '#9f9';
  g.font = '12px monospace';
  g.textAlign = 'left';
  g.fillText(`fps ~${s.debug!.fps}`, 14, 26);
  g.fillText(`pos ${s.debug!.px},${s.debug!.py}`, 14, 42);
  g.fillText(`mode ${s.mode}  cp ${s.debug && s.checkpoint}`, 14, 58);
  s.debug!.stalkerStates.forEach((st, i) =>
    g.fillText(`stalker${i}: ${st}`, 14, 74 + i * 14));
  g.restore();
}

function drawParticles(g: CanvasRenderingContext2D, s: RenderState, front: boolean) {
  for (let i = 0; i < s.particleCount; i++) {
    const p = s.particles[i];
    const t = p.life / p.max;
    if (front !== (p.kind === 'chunk')) continue;
    if (p.x < s.camX - 30 || p.x > s.camX + VIEW_W + 30) continue;
    if (p.kind === 'firefly') {
      const tw = 0.5 + Math.sin(s.time * 6 + p.x) * 0.5;
      g.save();
      g.globalAlpha = (1 - t) * 0.8 * tw;
      g.shadowColor = 'rgba(255,250,230,0.9)'; g.shadowBlur = 6;
      g.fillStyle = 'rgba(255,252,240,0.95)';
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      g.restore();
    } else if (p.kind === 'chunk') {
      g.save();
      g.globalAlpha = 1 - t;
      g.translate(p.x, p.y); g.rotate(p.rot ?? 0);
      g.fillStyle = '#000';
      g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      g.restore();
    } else if (p.kind === 'bubble') {
      g.globalAlpha = (1 - t) * 0.5;
      g.strokeStyle = 'rgba(200,215,225,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    } else if (p.kind === 'splash') {
      g.globalAlpha = (1 - t) * 0.6;
      g.fillStyle = 'rgba(190,205,215,0.8)';
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (p.kind === 'mote') {
      g.globalAlpha = (1 - t) * 0.4;
      g.fillStyle = 'rgba(245,245,235,0.85)';
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else { // dust / ash
      g.globalAlpha = (1 - t) * (p.kind === 'ash' ? 0.28 : 0.16);
      g.fillStyle = p.kind === 'ash' ? '#000' : '#cfcfcf';
      g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
  }
}

function drawWater(g: CanvasRenderingContext2D, w: { x: number; y: number; w: number; h: number }, time: number) {
  const grad = g.createLinearGradient(0, w.y, 0, w.y + w.h);
  grad.addColorStop(0, 'rgba(16,20,26,0.72)');
  grad.addColorStop(1, 'rgba(4,6,9,0.9)');
  g.fillStyle = grad;
  g.fillRect(w.x, w.y, w.w, w.h + 100);
  // animated surface
  g.strokeStyle = 'rgba(205,215,225,0.28)';
  g.lineWidth = 1.6;
  g.beginPath();
  for (let x = w.x; x <= w.x + w.w; x += 8) {
    const yy = w.y + Math.sin(time * 1.8 + x * 0.045) * 1.6 + Math.sin(time * 3.1 + x * 0.11) * 0.8;
    if (x === w.x) g.moveTo(x, yy); else g.lineTo(x, yy);
  }
  g.stroke();
  g.strokeStyle = 'rgba(205,215,225,0.10)';
  g.beginPath();
  for (let x = w.x; x <= w.x + w.w; x += 10) {
    const yy = w.y + 5 + Math.sin(time * 1.3 + x * 0.06 + 2) * 2;
    if (x === w.x) g.moveTo(x, yy); else g.lineTo(x, yy);
  }
  g.stroke();
}

function drawExit(g: CanvasRenderingContext2D, s: RenderState) {
  const e = s.level.exit;
  const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
  const pulse = 0.75 + Math.sin(s.time * 1.6) * 0.25;
  // beam from sky
  const beam = g.createLinearGradient(0, 0, 0, e.y + e.h);
  beam.addColorStop(0, `rgba(255,255,255,${0.14 * pulse})`);
  beam.addColorStop(1, `rgba(255,255,255,${0.03 * pulse})`);
  g.fillStyle = beam;
  g.beginPath();
  g.moveTo(cx - e.w * 0.7, 0); g.lineTo(cx + e.w * 0.7, 0);
  g.lineTo(cx + e.w * 1.5, e.y + e.h); g.lineTo(cx - e.w * 1.5, e.y + e.h);
  g.fill();
  // core glow
  const rg = g.createRadialGradient(cx, cy, 4, cx, cy, 130);
  rg.addColorStop(0, `rgba(255,255,255,${0.5 * pulse})`);
  rg.addColorStop(0.4, `rgba(255,255,255,${0.14 * pulse})`);
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(cx - 130, cy - 130, 260, 260);
  // rising motes
  g.fillStyle = `rgba(255,255,255,${0.5 * pulse})`;
  for (let i = 0; i < 7; i++) {
    const t = ((s.time * 0.32 + i * 0.17) % 1);
    g.globalAlpha = (1 - t) * 0.5;
    g.beginPath();
    g.arc(cx + Math.sin(i * 9 + s.time) * 22, e.y + e.h - t * (e.h + 60), 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

void 0;
export function spaced(t: string) { return t.split('').join(' '); }
