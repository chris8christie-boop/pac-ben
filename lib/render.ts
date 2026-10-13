/*
 * Drawing. The play area is 28 x 36 tiles: three rows of score at the top,
 * the 28 x 31 maze, and two rows for lives and power-ups at the bottom.
 * Everything is drawn in tile units; the canvas transform scales it to fit.
 */
import { BOSS_SPECS, LEVEL_COUNT, ROBOT_SPECS, SECTORS, levelSpec } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { COLS, DX, DY, PATH, ROWS, tileAt } from './maze.ts';
import { insetContour, wallContours } from './contours.ts';
import { POWER_LABELS, laserOrigin, waitingRobots } from './game.ts';
import { cloakAmount } from './robots.ts';
import type { Boss, Bullet, Game, Laser, Pickup, PowerKind, Robot } from './types.ts';

export const GW = 28;
export const GH = 36;
export const HUD_TOP = 3;
const TAU = Math.PI * 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Where things go on screen, in CSS pixels. */
export interface Layout {
  cssW: number;
  cssH: number;
  dpr: number;
  /** CSS pixels per tile. */
  scale: number;
  ox: number;
  oy: number;
  touch: boolean;
  stickHome: Circle;
  fire: Circle;
  pause: Rect;
  mute: Rect;
}

/** Buttons drawn inside the play area, in tiles. */
export const UI = {
  resume: { x: 7, y: 16.6, w: 14, h: 2.4 },
  quit: { x: 7, y: 19.8, w: 14, h: 2.4 },
  sectorLeft: { x: 1, y: 26.4, w: 6, h: 2.6 },
  sectorRight: { x: 21, y: 26.4, w: 6, h: 2.6 },
};

export function computeLayout(cssW: number, cssH: number, dpr: number, touch: boolean): Layout {
  let scale: number;
  let ox: number;
  let oy: number;
  let stickHome: Circle;
  let fire: Circle;
  let pause: Rect;
  let mute: Rect;
  if (touch && cssH >= cssW * 1.2) {
    // Portrait phone: maze on top, thumbs below.
    const controls = Math.min(Math.max(cssH * 0.27, 150), 280);
    scale = Math.min(cssW / GW, (cssH - controls) / GH);
    ox = (cssW - GW * scale) / 2;
    oy = Math.max(4, (cssH - controls - GH * scale) / 3);
    const top = oy + GH * scale;
    const room = cssH - top;
    const r = Math.min(66, room * 0.33, cssW * 0.17);
    const cy = top + room * 0.55;
    fire = { x: cssW - r - 22, y: cy, r };
    stickHome = { x: r + 30, y: cy, r: r * 1.05 };
    pause = { x: cssW / 2 - 46, y: top + 10, w: 40, h: 34 };
    mute = { x: cssW / 2 + 6, y: top + 10, w: 40, h: 34 };
  } else if (touch) {
    // Landscape: maze in the middle, thumbs either side.
    scale = Math.min(cssH / GH, cssW / GW);
    ox = (cssW - GW * scale) / 2;
    oy = (cssH - GH * scale) / 2;
    const side = Math.max(ox, 90);
    const r = Math.min(64, side * 0.36, cssH * 0.15);
    fire = { x: cssW - side / 2, y: cssH * 0.68, r };
    stickHome = { x: side / 2, y: cssH * 0.68, r: r * 1.05 };
    pause = { x: cssW - 52, y: 10, w: 40, h: 34 };
    mute = { x: cssW - 52, y: 50, w: 40, h: 34 };
  } else {
    // Leave room at the side for the pause and sound buttons.
    scale = Math.min((cssW - 112) / GW, cssH / GH) * 0.98;
    ox = (cssW - GW * scale) / 2;
    oy = (cssH - GH * scale) / 2;
    fire = { x: -100, y: -100, r: 0 };
    stickHome = { x: -100, y: -100, r: 0 };
    pause = { x: cssW - 50, y: 10, w: 38, h: 32 };
    mute = { x: cssW - 50, y: 48, w: 38, h: 32 };
  }
  return { cssW, cssH, dpr, scale, ox, oy, touch, stickHome, fire, pause, mute };
}

export interface Stick {
  active: boolean;
  ox: number;
  oy: number;
  x: number;
  y: number;
  dir: number;
}

interface MazeCache {
  key: string;
  canvas: HTMLCanvasElement;
  walls: Path2D;
  outer: Path2D;
}

export interface View {
  ctx: CanvasRenderingContext2D;
  /** The page has keyboard focus. Inside a frame it only gets it once clicked. */
  focused: boolean;
  layout: Layout;
  font: string;
  stick: Stick;
  fireHeld: boolean;
  muted: boolean;
  cache: MazeCache | null;
}

/* ---------- small drawing helpers ---------- */

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighter (f > 0) or darker (f < 0). */
function shade(hex: string, f: number): string {
  const [r, g, b] = rgb(hex);
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, rgba(color, 0.9));
  grd.addColorStop(0.3, rgba(color, 0.4));
  grd.addColorStop(1, rgba(color, 0));
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0 || r <= 0) return;
  const op = ctx.globalCompositeOperation;
  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = op;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface TextOptions {
  align?: CanvasTextAlign;
  weight?: number;
  stroke?: string;
  glow?: string;
  alpha?: number;
  maxWidth?: number;
}

/**
 * Text is drawn at device resolution (not scaled up from a tiny font size),
 * so it stays sharp in every browser.
 */
function text(view: View, s: string, x: number, y: number, size: number, color: string, o: TextOptions = {}): number {
  const ctx = view.ctx;
  const m = ctx.getTransform();
  const k = m.a;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${o.weight ?? 700} ${size * k}px ${view.font}`;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  let w = ctx.measureText(s).width;
  let scaleX = 1;
  if (o.maxWidth && w > o.maxWidth * k) {
    scaleX = (o.maxWidth * k) / w;
    w = o.maxWidth * k;
  }
  const dx = m.a * x + m.e;
  const dy = m.d * y + m.f;
  ctx.translate(dx, dy);
  ctx.scale(scaleX, 1);
  if (o.glow) {
    ctx.shadowColor = o.glow;
    ctx.shadowBlur = size * k * 0.6;
  }
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * k * 0.16);
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(s, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, 0, 0);
  ctx.restore();
  return w / k;
}

function pad(n: number, width: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, '0');
}

/* ---------- the maze ---------- */

function roundedLoop(path: Path2D, pts: ReturnType<typeof insetContour>, convexR: number, concaveR: number): void {
  const n = pts.length;
  if (n < 3) return;
  const last = pts[n - 1];
  path.moveTo((last.x + pts[0].x) / 2, (last.y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const prev = pts[(i - 1 + n) % n];
    const lim = Math.min(Math.hypot(p.x - prev.x, p.y - prev.y), Math.hypot(q.x - p.x, q.y - p.y)) / 2;
    path.arcTo(p.x, p.y, q.x, q.y, Math.min(p.convex ? convexR : concaveR, lim));
  }
  path.closePath();
}

function mazeCache(view: View, g: Game): MazeCache {
  const L = view.layout;
  const k = L.scale * L.dpr;
  const w = Math.max(1, Math.ceil(COLS * k));
  const h = Math.max(1, Math.ceil(ROWS * k));
  const m = g.maze;
  const key = `${m.level}:${m.house ? 'h' : 'p'}:${w}x${h}`;
  if (view.cache && view.cache.key === key) return view.cache;
  const sector = SECTORS[levelSpec(m.level).sector];
  const canvas = view.cache?.canvas ?? document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  c.setTransform(k, 0, 0, k, 0, 0);

  c.fillStyle = sector.bg;
  c.fillRect(0, 0, COLS, ROWS);

  // Faint circuit traces along the corridors.
  c.strokeStyle = sector.floor;
  c.lineWidth = 0.05;
  c.beginPath();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tileAt(m, x, y) !== PATH) continue;
      if (x + 1 < COLS && tileAt(m, x + 1, y) === PATH) {
        c.moveTo(x + 0.5, y + 0.5);
        c.lineTo(x + 1.5, y + 0.5);
      }
      if (tileAt(m, x, y + 1) === PATH) {
        c.moveTo(x + 0.5, y + 0.5);
        c.lineTo(x + 0.5, y + 1.5);
      }
    }
  }
  c.stroke();
  c.fillStyle = sector.floor;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tileAt(m, x, y) !== PATH) continue;
      let n = 0;
      for (let d = 0; d < 4; d++) if (tileAt(m, x + DX[d], y + DY[d]) === PATH) n++;
      if (n >= 3) {
        circle(c, x + 0.5, y + 0.5, 0.12);
        c.fill();
      }
    }
  }

  // The boss arena.
  if (m.plaza) {
    const cx = m.plaza.x + m.plaza.w / 2;
    const cy = m.plaza.y + m.plaza.h / 2;
    c.strokeStyle = rgba(sector.wall, 0.16);
    c.lineWidth = 0.08;
    for (const r of [1.4, 2.6]) {
      circle(c, cx, cy, r);
      c.stroke();
    }
    c.setLineDash([0.3, 0.3]);
    circle(c, cx, cy, 3.4);
    c.stroke();
    c.setLineDash([]);
  }

  // The factory floor.
  if (m.house) {
    const hx = m.house.x + 1;
    const hy = m.house.y + 1;
    const hw = m.house.w - 2;
    const hh = m.house.h - 2;
    c.save();
    c.beginPath();
    c.rect(hx, hy, hw, hh);
    c.clip();
    c.fillStyle = rgba(sector.wall, 0.06);
    c.fillRect(hx, hy, hw, hh);
    c.strokeStyle = rgba(sector.wall, 0.1);
    c.lineWidth = 0.18;
    for (let i = -hh; i < hw + hh; i += 0.7) {
      c.beginPath();
      c.moveTo(hx + i, hy + hh);
      c.lineTo(hx + i + hh, hy);
      c.stroke();
    }
    c.restore();
  }

  // Walls: inset outlines with rounded corners, filled, then lit.
  const walls = new Path2D();
  const outer = new Path2D();
  for (const loop of wallContours(m)) {
    roundedLoop(walls, insetContour(loop.points, 0.36), 0.5, 0.3);
    if (loop.outer) roundedLoop(outer, insetContour(loop.points, 0.62), 0.3, 0.55);
  }
  const fill = c.createLinearGradient(0, 0, 0, ROWS);
  fill.addColorStop(0, sector.fillTop);
  fill.addColorStop(1, sector.fillBottom);
  c.fillStyle = fill;
  c.fill(walls);

  c.save();
  c.clip(walls);
  c.strokeStyle = rgba(sector.wall, 0.07);
  c.lineWidth = 0.06;
  c.beginPath();
  for (let i = -ROWS; i < COLS + ROWS; i += 0.5) {
    c.moveTo(i, 0);
    c.lineTo(i + ROWS, ROWS);
  }
  c.stroke();
  c.restore();

  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.shadowColor = sector.wall;
  c.shadowBlur = 0.7 * k;
  c.strokeStyle = sector.wall;
  c.lineWidth = 0.15;
  c.stroke(walls);
  c.shadowBlur = 0.35 * k;
  c.lineWidth = 0.08;
  c.stroke(outer);
  c.shadowBlur = 0;
  c.strokeStyle = sector.core;
  c.lineWidth = 0.05;
  c.stroke(walls);
  c.lineWidth = 0.03;
  c.stroke(outer);

  view.cache = { key, canvas, walls, outer };
  return view.cache;
}

/* ---------- characters ---------- */

interface BenLook {
  t: number;
  moving?: boolean;
  overdrive?: number;
  shield?: boolean;
  muzzle?: number;
  scale?: number;
  /** 0 to 1 through the death animation. */
  death?: number;
}

export function drawBen(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, mouth: number, o: BenLook): void {
  ctx.save();
  ctx.translate(x, y);
  const s = o.scale ?? 1;
  ctx.scale(s, s);
  if (o.overdrive && o.overdrive > 0) {
    const pulse = 0.7 + Math.sin(o.t * 14) * 0.3;
    glow(ctx, 0, 0, 1.5, '#4a7bff', 0.8 * pulse);
    ctx.strokeStyle = rgba('#8fb0ff', 0.6 * pulse);
    ctx.lineWidth = 0.06;
    circle(ctx, 0, 0, 0.62 + Math.sin(o.t * 10) * 0.05);
    ctx.stroke();
  }
  glow(ctx, 0, 0, 1.15, '#ffd23f', 0.45);
  const dir = facing < 0 ? 3 : facing;
  if (dir === 3) ctx.scale(-1, 1);
  else if (dir === 0) ctx.rotate(-Math.PI / 2);
  else if (dir === 2) ctx.rotate(Math.PI / 2);

  const dying = o.death !== undefined;
  const open = dying ? 0.2 + (Math.PI - 0.2) * Math.min(1, o.death!) : o.moving ? 0.06 + 0.6 * Math.abs(Math.sin(mouth)) : 0.24;
  if (open < Math.PI - 0.01) {
    const body = new Path2D();
    body.moveTo(0, 0);
    body.arc(0, 0, 0.46, open, TAU - open);
    body.closePath();
    const grd = ctx.createRadialGradient(-0.12, -0.16, 0.05, 0, 0, 0.5);
    grd.addColorStop(0, '#fff7b8');
    grd.addColorStop(0.55, '#ffd21f');
    grd.addColorStop(1, '#e89400');
    ctx.fillStyle = grd;
    ctx.fill(body);

    if (!dying) {
      // Headband, with its tails flapping behind.
      ctx.save();
      ctx.clip(body);
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 0.13;
      ctx.beginPath();
      ctx.arc(0, 0, 0.41, Math.PI * 1.02, Math.PI * 1.63);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 0.08;
      ctx.lineCap = 'round';
      const flap = o.t * (o.moving ? 20 : 6);
      ctx.beginPath();
      ctx.moveTo(-0.38, -0.2);
      ctx.quadraticCurveTo(-0.52, -0.24, -0.66, -0.18 + Math.sin(flap) * 0.07);
      ctx.moveTo(-0.38, -0.16);
      ctx.quadraticCurveTo(-0.5, -0.08, -0.62, -0.04 + Math.cos(flap * 1.1) * 0.07);
      ctx.stroke();
      // Eye.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0.05, -0.24, 0.1, 0.12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a1030';
      circle(ctx, 0.09, -0.23, 0.052);
      ctx.fill();
      if (o.muzzle && o.muzzle > 0) {
        glow(ctx, 0.5, 0, 0.7, '#fff2a0', 1);
        ctx.fillStyle = '#ffffff';
        circle(ctx, 0.48, 0, 0.12);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  if (o.shield) {
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, 1.2, '#7fd8ff', 0.35);
    ctx.strokeStyle = rgba('#9fe6ff', 0.75);
    ctx.lineWidth = 0.05;
    circle(ctx, 0, 0, 0.64 * s);
    ctx.stroke();
    ctx.setLineDash([0.12, 0.1]);
    ctx.lineDashOffset = -o.t * 0.6;
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    circle(ctx, 0, 0, 0.56 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

export interface RobotLook {
  t: number;
  frightened?: boolean;
  frightLeft?: number;
  flash?: boolean;
  alpha?: number;
  stun?: boolean;
  scale?: number;
  hp?: number;
  maxHp?: number;
  charge?: number;
  /** Where its eyes look. */
  lookX?: number;
  lookY?: number;
}

export function drawRobot(ctx: CanvasRenderingContext2D, kind: RobotKind, x: number, y: number, dir: number, o: RobotLook): void {
  const spec = ROBOT_SPECS[kind];
  const t = o.t;
  const s = spec.size * (o.scale ?? 1);
  const frightened = !!o.frightened;
  const blink = frightened && (o.frightLeft ?? 9) < 1.8 && Math.floor(t * 8) % 2 === 0;
  let base = frightened ? (blink ? '#e0e6ff' : '#2b48ff') : spec.color;
  if (o.flash) base = '#ffffff';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha *= o.alpha ?? 1;
  const bob = Math.sin(t * 9) * 0.03;
  const lx = o.lookX ?? (dir >= 0 ? DX[dir] * 0.07 : 0);
  const ly = o.lookY ?? (dir >= 0 ? DY[dir] * 0.05 : 0);

  glow(ctx, 0, 0, 0.95, frightened ? '#2b48ff' : spec.color, 0.32);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0.44, 0.34, 0.07, 0, 0, TAU);
  ctx.fill();

  const dark = shade(base.startsWith('#') ? base : '#ffffff', -0.5);
  const light = shade(base.startsWith('#') ? base : '#ffffff', 0.3);
  const bodyGrad = (y0: number, y1: number) => {
    const grd = ctx.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, light);
    grd.addColorStop(0.5, base);
    grd.addColorStop(1, dark);
    return grd;
  };

  if (kind === 'phantom') {
    // A ghost: dome and a wavy hem.
    ctx.beginPath();
    ctx.moveTo(-0.4, 0.38);
    ctx.lineTo(-0.4, -0.05 + bob);
    ctx.arc(0, -0.05 + bob, 0.4, Math.PI, 0);
    ctx.lineTo(0.4, 0.38);
    for (let i = 0; i < 4; i++) {
      const x0 = 0.4 - (i + 1) * 0.2;
      ctx.quadraticCurveTo(x0 + 0.1, 0.38 - 0.14 * (i % 2 === 0 ? 1 : -0.2) + Math.sin(t * 12 + i) * 0.04, x0, 0.38);
    }
    ctx.closePath();
    ctx.fillStyle = bodyGrad(-0.45, 0.4);
    ctx.fill();
  } else if (kind === 'bomber') {
    circle(ctx, 0, 0.02 + bob, 0.4);
    ctx.fillStyle = bodyGrad(-0.4, 0.42);
    ctx.fill();
    ctx.strokeStyle = '#3a2a00';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.38, 0.1 + bob);
    ctx.lineTo(0.38, 0.1 + bob);
    ctx.stroke();
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.1, -0.36 + bob);
    ctx.quadraticCurveTo(0.22, -0.55, 0.3, -0.52);
    ctx.stroke();
    glow(ctx, 0.3, -0.52, 0.25 + Math.random() * 0.1, '#ffb030', 1);
  } else {
    // Legs or treads.
    if (kind === 'tank') {
      ctx.fillStyle = '#2a2f40';
      roundRect(ctx, -0.44, 0.22, 0.88, 0.2, 0.08);
      ctx.fill();
      ctx.strokeStyle = '#5a6380';
      ctx.lineWidth = 0.04;
      const off = (t * 3) % 0.16;
      ctx.beginPath();
      for (let i = -0.4 + off; i < 0.42; i += 0.16) {
        ctx.moveTo(i, 0.24);
        ctx.lineTo(i, 0.4);
      }
      ctx.stroke();
    } else if (kind === 'speeder') {
      ctx.strokeStyle = rgba(spec.color, 0.5);
      ctx.lineWidth = 0.04;
      const bx = dir >= 0 ? -DX[dir] : -1;
      const by = dir >= 0 ? -DY[dir] : 0;
      ctx.beginPath();
      for (const o2 of [-0.2, 0, 0.2]) {
        const px = by !== 0 ? o2 : 0;
        const py = bx !== 0 ? o2 : 0;
        ctx.moveTo(bx * 0.45 + px, by * 0.45 + py);
        ctx.lineTo(bx * (0.75 + Math.random() * 0.2) + px, by * (0.75 + Math.random() * 0.2) + py);
      }
      ctx.stroke();
    } else {
      const step = Math.sin(t * 16) * 0.035;
      ctx.fillStyle = '#20263a';
      roundRect(ctx, -0.25, 0.26 + step, 0.13, 0.14, 0.04);
      ctx.fill();
      roundRect(ctx, 0.12, 0.26 - step, 0.13, 0.14, 0.04);
      ctx.fill();
    }
    // Torso.
    const wide = kind === 'tank' ? 0.42 : 0.36;
    roundRect(ctx, -wide, -0.12 + bob, wide * 2, 0.42, 0.12);
    ctx.fillStyle = bodyGrad(-0.12, 0.3);
    ctx.fill();
    if (kind === 'ambusher') {
      ctx.strokeStyle = base;
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      const snap = Math.abs(Math.sin(t * 6)) * 0.2;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * 0.46, 0.06 + bob, 0.13, sx > 0 ? -1.2 - snap : Math.PI - 1.9 + snap, sx > 0 ? 1.2 + snap : Math.PI + 1.9 - snap, sx < 0);
        ctx.stroke();
      }
    }
    if (kind === 'flanker') {
      ctx.fillStyle = dark;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * 0.3, -0.36 + bob);
        ctx.lineTo(sx * 0.52, -0.5 + bob);
        ctx.lineTo(sx * 0.34, -0.18 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Head.
    if (kind === 'splitter') {
      for (const sx of [-0.17, 0.17]) {
        circle(ctx, sx, -0.26 + bob, 0.21);
        ctx.fillStyle = bodyGrad(-0.47, -0.05);
        ctx.fill();
      }
    } else {
      const hw = kind === 'tank' ? 0.38 : kind === 'mini' ? 0.36 : 0.32;
      roundRect(ctx, -hw, -0.47 + bob, hw * 2, 0.38, 0.16);
      ctx.fillStyle = bodyGrad(-0.47, -0.09);
      ctx.fill();
    }
    // Chest light.
    glow(ctx, 0, 0.1 + bob, 0.2, '#ffffff', 0.4 + Math.sin(t * 5) * 0.3);
    if (kind === 'tank') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (const bx of [-0.3, 0.3]) {
        circle(ctx, bx, 0.02 + bob, 0.04);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(-0.42, 0.14 + bob);
      ctx.lineTo(0.42, 0.14 + bob);
      ctx.stroke();
    }
    // Antenna.
    if (kind !== 'tank') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(0, -0.46 + bob);
      ctx.lineTo(0, -0.6 + bob);
      ctx.stroke();
      ctx.fillStyle = Math.floor(t * 3) % 2 === 0 ? '#ffffff' : base;
      circle(ctx, 0, -0.62 + bob, 0.05);
      ctx.fill();
    }
  }

  // Face.
  const fy = (kind === 'phantom' ? -0.1 : kind === 'bomber' ? -0.1 : -0.28) + bob;
  if (frightened) {
    ctx.fillStyle = blink ? '#ff3355' : '#ffe9c4';
    ctx.fillRect(-0.15, fy - 0.05, 0.08, 0.08);
    ctx.fillRect(0.07, fy - 0.05, 0.08, 0.08);
    ctx.strokeStyle = blink ? '#ff3355' : '#ffe9c4';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const px = -0.21 + i * 0.07;
      const py = fy + 0.14 + (i % 2 === 0 ? 0 : -0.05);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else {
    if (kind !== 'splitter') {
      ctx.fillStyle = '#0a0d1c';
      const vw = kind === 'tank' ? 0.6 : kind === 'bomber' ? 0.46 : 0.5;
      roundRect(ctx, -vw / 2, fy - 0.1, vw, 0.2, 0.08);
      ctx.fill();
    }
    const eye = o.stun ? '#7fd8ff' : kind === 'chaser' ? '#ffe14d' : '#ffffff';
    const eyes: [number, number][] =
      kind === 'tank' ? [[0, 0]] : kind === 'mini' ? [[0, 0]] : kind === 'splitter' ? [[-0.17, 0.02], [0.17, 0.02]] : kind === 'wanderer' ? [[Math.cos(t * 4) * 0.08, Math.sin(t * 4) * 0.03]] : [[-0.11, 0], [0.11, 0]];
    for (const [ex, ey] of eyes) {
      const px = ex + lx;
      const py = fy + ey + ly;
      if (o.stun) {
        ctx.strokeStyle = eye;
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(px - 0.04, py - 0.04);
        ctx.lineTo(px + 0.04, py + 0.04);
        ctx.moveTo(px + 0.04, py - 0.04);
        ctx.lineTo(px - 0.04, py + 0.04);
        ctx.stroke();
        continue;
      }
      glow(ctx, px, py, 0.17, eye, 0.9);
      ctx.fillStyle = eye;
      if (kind === 'tank') {
        ctx.fillRect(px - 0.16, py - 0.03, 0.32, 0.06);
      } else {
        circle(ctx, px, py, kind === 'mini' || kind === 'wanderer' ? 0.07 : 0.055);
        ctx.fill();
      }
    }
    if (kind === 'chaser') {
      ctx.strokeStyle = '#0a0d1c';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.2, fy - 0.15);
      ctx.lineTo(-0.04, fy - 0.08);
      ctx.moveTo(0.2, fy - 0.15);
      ctx.lineTo(0.04, fy - 0.08);
      ctx.stroke();
    }
  }

  if (kind === 'gunner' && !frightened) {
    const d = dir < 0 ? 1 : dir;
    ctx.save();
    ctx.translate(0, 0.06 + bob);
    ctx.rotate(Math.atan2(DY[d], DX[d]));
    ctx.fillStyle = '#2e3a12';
    roundRect(ctx, 0.1, -0.07, 0.42, 0.14, 0.05);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.fillRect(0.44, -0.08, 0.08, 0.16);
    if (o.charge && o.charge > 0) glow(ctx, 0.56, 0, 0.3 + (0.42 - o.charge) * 1.2, '#d4ff6b', 1);
    ctx.restore();
  }

  if (o.maxHp && o.maxHp > 1 && o.hp !== undefined && !frightened) {
    for (let i = 0; i < o.maxHp; i++) {
      ctx.fillStyle = i < o.hp ? '#ffffff' : 'rgba(255,255,255,0.2)';
      circle(ctx, (i - (o.maxHp - 1) / 2) * 0.16, -0.78, 0.045);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ---------- bosses ---------- */

function eyeOffset(g: Game, b: Boss, k: number): [number, number] {
  const a = Math.atan2(g.player.y - b.y, g.player.x - b.x);
  return [Math.cos(a) * k, Math.sin(a) * k];
}

function drawBoltz(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  ctx.save();
  ctx.rotate(b.angle);
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = 0.14;
  circle(ctx, 0, 0, R * 0.92);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.fillStyle = i % 2 ? color : shade(color, -0.35);
    circle(ctx, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0.17);
    ctx.fill();
  }
  ctx.restore();
  const grd = ctx.createRadialGradient(-R * 0.25, -R * 0.3, 0.1, 0, 0, R * 0.8);
  grd.addColorStop(0, '#fff7c4');
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, shade(color, -0.55));
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.78);
  ctx.fill();
  // Lightning bolt emblem.
  ctx.fillStyle = '#3a2600';
  ctx.beginPath();
  const bolt = [[0.1, -0.85], [-0.42, 0.12], [-0.06, 0.12], [-0.2, 0.85], [0.42, -0.16], [0.06, -0.16]];
  bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x * R * 0.5, y * R * 0.5 + R * 0.12) : ctx.moveTo(x * R * 0.5, y * R * 0.5 + R * 0.12)));
  ctx.closePath();
  ctx.fill();
  // Angry eyes.
  const [ex, ey] = eyeOffset(g, b, 0.08);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx * R * 0.12 + ex, -R * 0.42 + ey);
    ctx.lineTo(sx * R * 0.5 + ex, -R * 0.52 + ey);
    ctx.lineTo(sx * R * 0.42 + ex, -R * 0.3 + ey);
    ctx.closePath();
    ctx.fill();
  }
  if (b.phase >= 2 || b.mode === 'charge') {
    ctx.strokeStyle = rgba('#fffbd0', 0.8);
    ctx.lineWidth = 0.05;
    for (let k = 0; k < 3; k++) {
      let a = Math.random() * TAU;
      let r = R * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      for (let i = 0; i < 4; i++) {
        r += R * 0.22;
        a += (Math.random() - 0.5) * 0.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }
  if (b.mode === 'charge') glow(ctx, 0, 0, R * 2 + b.modeT * 2, '#fff27a', 0.6);
}

function drawMagnetron(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.rotate(b.angle + k * Math.PI);
    ctx.strokeStyle = '#7a26c9';
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.98, -0.75, 0.75);
    ctx.stroke();
    for (const [a, c] of [[-0.75, '#ff3b5c'], [0.75, '#3b8bff']] as const) {
      ctx.fillStyle = c;
      circle(ctx, Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0.2);
      ctx.fill();
      glow(ctx, Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0.5, c, 0.7);
    }
    ctx.restore();
  }
  const grd = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 0.1, 0, 0, R * 0.72);
  grd.addColorStop(0, '#f3d2ff');
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, '#2a0748');
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.7);
  ctx.fill();
  const [ex, ey] = eyeOffset(g, b, R * 0.14);
  ctx.fillStyle = '#ffffff';
  circle(ctx, 0, 0, R * 0.36);
  ctx.fill();
  ctx.fillStyle = '#9b2cff';
  circle(ctx, ex, ey, R * 0.2);
  ctx.fill();
  ctx.fillStyle = '#12001f';
  circle(ctx, ex * 1.2, ey * 1.2, R * 0.09);
  ctx.fill();
}

function drawShredder(ctx: CanvasRenderingContext2D, b: Boss, R: number, color: string): void {
  ctx.save();
  ctx.rotate(b.angle);
  const teeth = 16;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU;
    const r = i % 2 === 0 ? R : R * 0.8;
    const a2 = a + (i % 2 === 0 ? 0.12 : 0);
    if (i === 0) ctx.moveTo(Math.cos(a2) * r, Math.sin(a2) * r);
    else ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
  }
  ctx.closePath();
  const grd = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
  grd.addColorStop(0, '#5a2a10');
  grd.addColorStop(0.6, '#d9d9e6');
  grd.addColorStop(1, color);
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 0.05;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.06;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
    ctx.lineTo(Math.cos(a + 0.4) * R * 0.72, Math.sin(a + 0.4) * R * 0.72);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#1e0c04';
  circle(ctx, 0, 0, R * 0.42);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.08;
  circle(ctx, 0, 0, R * 0.42);
  ctx.stroke();
  glow(ctx, 0, 0, R * 0.6, '#ff3b1f', 0.9);
  ctx.fillStyle = '#ff5a2a';
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.2, R * 0.08, 0, 0, TAU);
  ctx.fill();
}

function drawHydraCore(ctx: CanvasRenderingContext2D, b: Boss, R: number, color: string): void {
  const exposed = b.mode === 'exposed';
  ctx.save();
  ctx.rotate(b.angle * 0.5);
  for (const [r, c] of [[R * 0.85, '#0e3b2a'], [R * 0.62, color]] as const) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : c;
    ctx.fill();
    ctx.strokeStyle = '#b9ffe2';
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
  ctx.restore();
  const pulse = exposed ? 0.6 + Math.sin(b.t * 18) * 0.4 : 0.4;
  glow(ctx, 0, 0, R * (exposed ? 1.8 : 1), exposed ? '#ffffff' : color, pulse);
  ctx.fillStyle = exposed ? '#ffffff' : '#0a2a1c';
  circle(ctx, 0, 0, R * 0.3);
  ctx.fill();
  if (b.guarded) {
    ctx.strokeStyle = rgba(color, 0.35 + Math.sin(b.t * 6) * 0.1);
    ctx.lineWidth = 0.07;
    circle(ctx, 0, 0, R * 1.05);
    ctx.stroke();
  }
}

function drawGlitchBody(ctx: CanvasRenderingContext2D, R: number, t: number, color: string, flash: boolean): void {
  const body = () => {
    roundRect(ctx, -R * 0.75, -R * 0.55, R * 1.5, R * 1.25, R * 0.25);
  };
  // Crown.
  ctx.fillStyle = '#e8fdff';
  ctx.beginPath();
  ctx.moveTo(-R * 0.6, -R * 0.5);
  ctx.lineTo(-R * 0.55, -R * 0.95);
  ctx.lineTo(-R * 0.25, -R * 0.68);
  ctx.lineTo(0, -R * 1.05);
  ctx.lineTo(R * 0.25, -R * 0.68);
  ctx.lineTo(R * 0.55, -R * 0.95);
  ctx.lineTo(R * 0.6, -R * 0.5);
  ctx.closePath();
  ctx.fill();
  body();
  ctx.fillStyle = flash ? '#ffffff' : '#062a33';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  // Visor with scanlines.
  ctx.fillStyle = '#001218';
  roundRect(ctx, -R * 0.58, -R * 0.3, R * 1.16, R * 0.42, R * 0.1);
  ctx.fill();
  for (const sx of [-1, 1]) {
    glow(ctx, sx * R * 0.28, -R * 0.09, R * 0.4, color, 0.9);
    ctx.fillStyle = color;
    ctx.fillRect(sx * R * 0.28 - R * 0.13, -R * 0.14, R * 0.26, R * 0.1);
  }
  ctx.fillStyle = rgba(color, 0.7);
  for (let i = 0; i < 6; i++) ctx.fillRect(-R * 0.45 + i * R * 0.18, R * 0.3, R * 0.1, R * 0.16 + ((Math.floor(t * 8) + i) % 3) * 0.04);
}

function drawGlitchFigure(ctx: CanvasRenderingContext2D, g: Game, x: number, y: number, R: number, flash: boolean, phase: number): void {
  const color = '#3ff5ff';
  const t = g.time;
  const jitter = g.glitch > 0 || Math.random() < 0.05 + phase * 0.03;
  ctx.save();
  ctx.translate(x, y);
  glow(ctx, 0, 0, R * 2.4, color, 0.4);
  ctx.globalCompositeOperation = 'lighter';
  for (const [dx, c] of [[-0.1, '#ff2266'], [0.1, '#2266ff']] as const) {
    ctx.save();
    ctx.translate(dx + (jitter ? (Math.random() - 0.5) * 0.3 : 0), 0);
    ctx.globalAlpha *= 0.45;
    drawGlitchBody(ctx, R, t, c, false);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (jitter) {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-R * 1.5, -R * 1.2 + (i * R * 2.4) / 3, R * 3, (R * 2.4) / 3);
      ctx.clip();
      ctx.translate((Math.random() - 0.5) * 0.5, 0);
      drawGlitchBody(ctx, R, t, color, flash);
      ctx.restore();
    }
  } else drawGlitchBody(ctx, R, t, color, flash);
  ctx.restore();
}

function drawOmega(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  // Outer ring of segments.
  ctx.save();
  ctx.rotate(b.angle * 0.6);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.95, a + 0.06, a + TAU / 12 - 0.06);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(-b.angle * 0.4);
  ctx.fillStyle = shade(color, -0.3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.12) * R * 1.05, Math.sin(a - 0.12) * R * 1.05);
    ctx.lineTo(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35);
    ctx.lineTo(Math.cos(a + 0.12) * R * 1.05, Math.sin(a + 0.12) * R * 1.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const grd = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 0.75);
  grd.addColorStop(0, b.mode === 'vent' ? '#ffffff' : '#5a0010');
  grd.addColorStop(0.7, '#1a0006');
  grd.addColorStop(1, color);
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.72);
  ctx.fill();
  ctx.save();
  ctx.rotate(b.angle);
  ctx.strokeStyle = rgba('#ff9aaa', 0.8);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
    else ctx.lineTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // The eye.
  const [ex, ey] = eyeOffset(g, b, R * 0.12);
  ctx.fillStyle = '#fff1f3';
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.4, R * 0.28, 0, 0, TAU);
  ctx.fill();
  glow(ctx, ex, ey, R * 0.6, '#ff0033', b.phase >= 3 ? 1 : 0.6);
  ctx.fillStyle = '#ff1744';
  circle(ctx, ex, ey, R * 0.2);
  ctx.fill();
  ctx.fillStyle = '#120004';
  ctx.beginPath();
  ctx.ellipse(ex, ey, R * 0.05, R * 0.17, 0, 0, TAU);
  ctx.fill();
  if (b.phase >= 2) {
    ctx.strokeStyle = 'rgba(255,240,240,0.5)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-R * 0.6, -R * 0.2);
    ctx.lineTo(-R * 0.4, -R * 0.1);
    ctx.lineTo(-R * 0.45, R * 0.15);
    ctx.moveTo(R * 0.5, R * 0.3);
    ctx.lineTo(R * 0.3, R * 0.4);
    ctx.stroke();
  }
  if (b.phase >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      glow(ctx, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 0.6, '#ff6a00', 0.7);
    }
  }
}

function drawBoss(view: View, g: Game, b: Boss): void {
  const ctx = view.ctx;
  const spec = BOSS_SPECS[b.kind];
  const R = b.r;

  // Telegraphs first, under the boss.
  if (b.kind === 'magnetron' && (b.mode === 'warp' || b.mode === 'vanish')) {
    const k = b.mode === 'warp' ? Math.min(1, b.modeT / 0.5) : 0.3;
    ctx.save();
    ctx.translate(b.target.x, b.target.y);
    ctx.strokeStyle = rgba(spec.color, 0.4 + k * 0.5);
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.4, 0.25]);
    ctx.lineDashOffset = -g.time * 3;
    circle(ctx, 0, 0, R * (1.6 - k * 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + g.time * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 1.9, Math.sin(a) * R * 1.9);
      ctx.lineTo(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3);
      ctx.stroke();
    }
    glow(ctx, 0, 0, R * 2, spec.color, k * 0.5);
    ctx.restore();
  }
  const tracking = (b.kind === 'shredder' && b.mode === 'track') || (b.kind === 'omega' && b.mode === 'dash');
  if (tracking && b.modeT > b.fireT - 0.85) {
    const k = Math.min(1, (b.modeT - (b.fireT - 0.85)) / 0.85);
    const locked = b.modeT > b.fireT - 0.3;
    ctx.save();
    ctx.strokeStyle = rgba(locked ? '#ff2a2a' : '#ffb15a', 0.25 + k * 0.6);
    ctx.lineWidth = locked ? 0.16 : 0.07;
    if (!locked) ctx.setLineDash([0.5, 0.3]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.aim) * 40, b.y + Math.sin(b.aim) * 40);
    ctx.stroke();
    ctx.restore();
  }
  if ((b.kind === 'boltz' || b.kind === 'omega') && (b.mode === 'charge' || b.mode === 'burst')) {
    ctx.save();
    ctx.strokeStyle = rgba('#ffffff', 0.25 + Math.min(1, b.modeT * 2) * 0.4);
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.3, 0.3]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.aim) * 8, b.y + Math.sin(b.aim) * 8);
    ctx.stroke();
    ctx.restore();
  }

  if (b.kind === 'hydra') {
    ctx.save();
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.2, 0.2]);
    ctx.lineDashOffset = -g.time * 2;
    for (const d of b.drones) {
      if (!d.alive) continue;
      ctx.strokeStyle = rgba('#7dffc8', 0.35);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  let alpha = b.alpha;
  if (b.dying > 0) alpha *= Math.random() < 0.3 ? 0.4 : 1;
  ctx.globalAlpha = alpha;
  if (b.kind !== 'glitch') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0.3, R * 0.95, R * 0.9, R * 0.22, 0, 0, TAU);
    ctx.fill();
    glow(ctx, 0, 0, R * 2.6, spec.color, 0.45);
  }
  if (b.kind === 'shredder' && b.mode === 'dash') {
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.22 - i * 0.05);
      ctx.translate(-b.vx * 0.03 * i, -b.vy * 0.03 * i);
      drawShredder(ctx, b, R, spec.color);
      ctx.restore();
    }
  }
  switch (b.kind) {
    case 'boltz':
      drawBoltz(ctx, g, b, R, spec.color);
      break;
    case 'magnetron':
      drawMagnetron(ctx, g, b, R, spec.color);
      break;
    case 'shredder':
      drawShredder(ctx, b, R, spec.color);
      break;
    case 'hydra':
      drawHydraCore(ctx, b, R, spec.color);
      break;
    case 'omega':
      drawOmega(ctx, g, b, R, spec.color);
      break;
    case 'glitch':
      break;
  }
  ctx.restore();

  if (b.kind === 'glitch') {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlitchFigure(ctx, g, b.x, b.y, R, b.flash > 0, b.phase);
    ctx.restore();
    for (const c of b.clones) if (c.alive) drawGlitchFigure(ctx, g, c.x, c.y, R, false, b.phase);
  }

  for (const d of b.drones) {
    if (!d.alive) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    glow(ctx, 0, 0, 0.9, '#34f5a0', 0.5);
    ctx.rotate(-g.time * 3);
    ctx.fillStyle = '#1b6b4a';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.4) * 0.36, Math.sin(a - 0.4) * 0.36);
      ctx.lineTo(Math.cos(a) * 0.58, Math.sin(a) * 0.58);
      ctx.lineTo(Math.cos(a + 0.4) * 0.36, Math.sin(a + 0.4) * 0.36);
      ctx.fill();
    }
    ctx.rotate(g.time * 3);
    ctx.fillStyle = d.flash > 0 ? '#ffffff' : '#34f5a0';
    circle(ctx, 0, 0, 0.38);
    ctx.fill();
    const a = Math.atan2(g.player.y - d.y, g.player.x - d.x);
    ctx.fillStyle = '#04150e';
    circle(ctx, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.14);
    ctx.fill();
    ctx.fillStyle = '#ff3b5c';
    circle(ctx, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.06);
    ctx.fill();
    ctx.restore();
  }
}

/* ---------- other things in the maze ---------- */

function drawShot(ctx: CanvasRenderingContext2D, b: Bullet, t: number): void {
  switch (b.kind) {
    case 'shot': {
      const a = Math.atan2(b.vy, b.vx);
      glow(ctx, b.x, b.y, 0.55, b.color, 0.9);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = b.color;
      roundRect(ctx, -0.32, -0.08, 0.5, 0.16, 0.08);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -0.12, -0.04, 0.28, 0.08, 0.04);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'ember': {
      const f = 0.7 + Math.sin(t * 30 + b.x * 7) * 0.3;
      const fade = Math.min(1, b.life / 0.4);
      glow(ctx, b.x, b.y, 0.7 * f, '#ff7a1a', 0.9 * fade);
      ctx.fillStyle = rgba('#ffd27a', fade);
      circle(ctx, b.x, b.y, 0.13 * f);
      ctx.fill();
      break;
    }
    case 'missile': {
      const a = Math.atan2(b.vy, b.vx);
      glow(ctx, b.x, b.y, 0.6, b.color, 0.8);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(0.3, 0);
      ctx.lineTo(-0.22, -0.16);
      ctx.lineTo(-0.12, 0);
      ctx.lineTo(-0.22, 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'shard': {
      glow(ctx, b.x, b.y, 0.5, b.color, 0.9);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(t * 12);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(0, -0.18);
      ctx.lineTo(0.12, 0);
      ctx.lineTo(0, 0.18);
      ctx.lineTo(-0.12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    default: {
      // Enemy energy: bigger than a dot, with a dark rim and a hot core, so it never reads as food.
      const pulse = 1 + Math.sin(t * 20 + b.x * 3) * 0.12;
      glow(ctx, b.x, b.y, 0.75 * pulse, b.color, 0.9);
      ctx.fillStyle = '#1a0010';
      circle(ctx, b.x, b.y, b.r * 1.35 * pulse);
      ctx.fill();
      ctx.fillStyle = b.color;
      circle(ctx, b.x, b.y, b.r * 1.15 * pulse);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, b.x, b.y, b.r * 0.5);
      ctx.fill();
    }
  }
}

function laserEnds(g: Game, l: Laser): [number, number, number, number] {
  if (l.kind === 'row') return [-1, l.pos, COLS, l.pos];
  if (l.kind === 'col') return [l.pos, -1, l.pos, ROWS];
  const o = laserOrigin(g);
  return [o.x, o.y, o.x + Math.cos(l.angle) * l.length, o.y + Math.sin(l.angle) * l.length];
}

function drawLaser(ctx: CanvasRenderingContext2D, g: Game, l: Laser): void {
  const [x0, y0, x1, y1] = laserEnds(g, l);
  ctx.save();
  ctx.lineCap = 'round';
  if (l.t < l.warn) {
    const k = l.t / l.warn;
    const on = Math.sin(g.time * 28) > 0;
    ctx.strokeStyle = rgba(l.color, 0.06 + 0.12 * k);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = rgba(l.color, on ? 0.5 + 0.5 * k : 0.25);
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.4, 0.3]);
    ctx.lineDashOffset = -g.time * 6;
    ctx.stroke();
  } else {
    const k = (l.t - l.warn) / l.on;
    const fade = k > 0.85 ? (1 - k) / 0.15 : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a, c] of [[1.1, 0.25, l.color], [0.6, 0.6, l.color], [0.2, 1, '#ffffff']] as const) {
      ctx.strokeStyle = rgba(c, a * fade);
      ctx.lineWidth = w * (0.9 + Math.random() * 0.2);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    glow(ctx, x1, y1, 0.8, l.color, fade);
  }
  ctx.restore();
}

const PICKUP_COLORS: Record<PowerKind | 'bonus', string> = {
  rapid: '#ff9a3a',
  pierce: '#7ff6ff',
  seeker: '#ff8af0',
  shield: '#7fd8ff',
  emp: '#ffe14d',
  life: '#7dff8a',
  bonus: '#ffd23f',
};

const PICKUP_GLYPHS: Record<PowerKind, string> = { rapid: 'R', pierce: 'P', seeker: 'S', shield: '', emp: 'E', life: '1UP' };

function drawShieldIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 0.3 * s);
  ctx.lineTo(x + 0.25 * s, y - 0.2 * s);
  ctx.quadraticCurveTo(x + 0.24 * s, y + 0.15 * s, x, y + 0.32 * s);
  ctx.quadraticCurveTo(x - 0.24 * s, y + 0.15 * s, x - 0.25 * s, y - 0.2 * s);
  ctx.closePath();
  ctx.fill();
}

function drawBonusIcon(ctx: CanvasRenderingContext2D, sector: number, x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  switch (sector) {
    case 0: // battery
      ctx.fillStyle = '#d8e2ff';
      roundRect(ctx, -0.18, -0.32, 0.36, 0.62, 0.06);
      ctx.fill();
      ctx.fillRect(-0.07, -0.4, 0.14, 0.08);
      ctx.fillStyle = '#3bff8a';
      ctx.fillRect(-0.12, -0.02, 0.24, 0.27);
      break;
    case 1: // gear
      ctx.rotate(t * 2);
      ctx.fillStyle = '#c9d1d9';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * TAU);
        ctx.fillRect(-0.06, -0.38, 0.12, 0.14);
        ctx.restore();
      }
      circle(ctx, 0, 0, 0.27);
      ctx.fill();
      ctx.fillStyle = '#20263a';
      circle(ctx, 0, 0, 0.1);
      ctx.fill();
      break;
    case 2: // microchip
      ctx.fillStyle = '#1f1f2e';
      roundRect(ctx, -0.26, -0.26, 0.52, 0.52, 0.05);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 4; i++) {
        const o = -0.2 + i * 0.13;
        ctx.fillRect(o, -0.36, 0.05, 0.1);
        ctx.fillRect(o, 0.26, 0.05, 0.1);
        ctx.fillRect(-0.36, o, 0.1, 0.05);
        ctx.fillRect(0.26, o, 0.1, 0.05);
      }
      ctx.fillStyle = '#ff3fd2';
      ctx.fillRect(-0.1, -0.1, 0.2, 0.2);
      break;
    case 3: // disk
      ctx.fillStyle = '#2f6bff';
      roundRect(ctx, -0.3, -0.3, 0.6, 0.6, 0.05);
      ctx.fill();
      ctx.fillStyle = '#d0d8e8';
      ctx.fillRect(-0.16, -0.3, 0.32, 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-0.2, 0.04, 0.4, 0.24);
      break;
    case 4: // crystal
      ctx.fillStyle = '#9ff6ff';
      ctx.beginPath();
      ctx.moveTo(0, -0.4);
      ctx.lineTo(0.24, -0.08);
      ctx.lineTo(0, 0.4);
      ctx.lineTo(-0.24, -0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -0.4);
      ctx.lineTo(0.08, -0.08);
      ctx.lineTo(0, 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    default: // golden bolt
      ctx.rotate(0.4);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-0.07, -0.18, 0.14, 0.52);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) ctx.moveTo(Math.cos(a) * 0.22, -0.22 + Math.sin(a) * 0.14);
        else ctx.lineTo(Math.cos(a) * 0.22, -0.22 + Math.sin(a) * 0.14);
      }
      ctx.closePath();
      ctx.fill();
  }
  ctx.restore();
}

function drawPickup(view: View, g: Game, k: Pickup): void {
  const ctx = view.ctx;
  const left = k.life - k.t;
  if (left < 2 && Math.floor(k.t * 10) % 2 === 0) return;
  const bob = Math.sin(k.t * 4) * 0.08;
  const color = PICKUP_COLORS[k.kind];
  glow(ctx, k.x, k.y + bob, 1, color, 0.55);
  if (k.kind === 'bonus') {
    drawBonusIcon(ctx, g.spec.sector, k.x, k.y + bob, g.time);
    return;
  }
  ctx.save();
  ctx.translate(k.x, k.y + bob);
  ctx.fillStyle = rgba(color, 0.18);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
    else ctx.lineTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (k.kind === 'shield') drawShieldIcon(ctx, k.x, k.y + bob, 1, color);
  else text(view, PICKUP_GLYPHS[k.kind], k.x, k.y + bob + 0.02, k.kind === 'life' ? 0.3 : 0.44, color, { weight: 900 });
}

/* ---------- the world, HUD and screens ---------- */

function drawWorld(view: View, g: Game): void {
  const ctx = view.ctx;
  const m = g.maze;
  const sector = SECTORS[g.spec.sector];
  const cache = mazeCache(view, g);
  const t = g.time;

  ctx.save();
  ctx.translate(0, HUD_TOP);
  ctx.drawImage(cache.canvas, 0, 0, COLS, ROWS);

  // The maze flashes white when a level is cleared, as in Pac-Man.
  if (g.state === 'clear' && g.stateT < 2.2 && Math.floor(g.stateT * 5) % 2 === 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, COLS, ROWS);
    ctx.clip();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.14;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 0.6 * view.layout.scale * view.layout.dpr;
    ctx.stroke(cache.walls);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.rect(0, 0, COLS, ROWS);
  ctx.clip();
  ctx.translate(0.5, 0.5);

  // Teleport pads.
  for (const p of m.portals) {
    glow(ctx, p.x, p.y, 1.1, '#b48cff', 0.5 + Math.sin(t * 4) * 0.15);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 2);
    ctx.strokeStyle = '#c9a8ff';
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.18 + i * 0.12, i * 2, i * 2 + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The factory door, and the robots waiting behind it.
  if (m.house) {
    const hy = m.house.y;
    const soon = g.state === 'play' && g.queue.length > 0 && g.spawnT < 0.6;
    const doorColor = soon ? '#ffffff' : '#ff7ad9';
    glow(ctx, 13.5, hy, 1.4, '#ff7ad9', soon ? 0.9 : 0.4);
    ctx.strokeStyle = doorColor;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(12.55, hy);
    ctx.lineTo(14.45, hy);
    ctx.stroke();
    const waiting = waitingRobots(g);
    waiting.forEach((kind, i) => {
      const x = 13.5 + (i - (waiting.length - 1) / 2) * 1.6;
      drawRobot(ctx, kind, x, hy + 2, 2, { t: t + i, scale: 0.8, alpha: 0.75 });
    });
  }

  // Dots and power cores. The last few glow, so they're easy to find.
  const lastFew = !g.boss && g.dotsLeft <= 8;
  const r = lastFew ? 0.15 + Math.sin(t * 6) * 0.03 : 0.1;
  if (lastFew) {
    for (let i = 0; i < g.dots.length; i++) {
      if (g.dots[i] !== 1) continue;
      const x = i % COLS;
      glow(ctx, x, (i - x) / COLS, 0.9, '#ffd23f', 0.55 + Math.sin(t * 6) * 0.25);
    }
  }
  ctx.fillStyle = lastFew ? '#fff3c4' : sector.dot;
  ctx.beginPath();
  for (let i = 0; i < g.dots.length; i++) {
    if (g.dots[i] !== 1) continue;
    const x = i % COLS;
    const y = (i - x) / COLS;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  for (let i = 0; i < g.dots.length; i++) {
    if (g.dots[i] !== 2) continue;
    const x = i % COLS;
    const y = (i - x) / COLS;
    const pulse = 0.75 + Math.sin(t * 6) * 0.25;
    glow(ctx, x, y, 1.1 * pulse, '#8fb0ff', 0.8);
    ctx.fillStyle = '#ffffff';
    circle(ctx, x, y, 0.3 * pulse);
    ctx.fill();
    ctx.strokeStyle = rgba('#8fb0ff', 0.8);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(x, y, 0.45, t * 3, t * 3 + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 0.45, t * 3 + Math.PI, t * 3 + Math.PI + 2);
    ctx.stroke();
  }

  for (const k of g.pickups) drawPickup(view, g, k);

  // Mines.
  for (const mine of g.mines) {
    const armed = mine.t > 0.8;
    ctx.fillStyle = '#3a3420';
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 0.04;
    ctx.save();
    ctx.translate(mine.x, mine.y);
    ctx.rotate(mine.t);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.fillRect(-0.03, -0.32, 0.06, 0.12);
    }
    ctx.restore();
    circle(ctx, mine.x, mine.y, 0.22);
    ctx.fill();
    ctx.stroke();
    const on = Math.floor(mine.t * (armed ? 6 : 2)) % 2 === 0;
    if (on) glow(ctx, mine.x, mine.y, 0.6, '#ff3355', 1);
    ctx.fillStyle = on ? '#ff3355' : '#661020';
    circle(ctx, mine.x, mine.y, 0.07);
    ctx.fill();
  }

  for (const l of g.lasers) if (l.t < l.warn) drawLaser(ctx, g, l);

  // Spawning beams from the factory.
  for (const r of g.robots) {
    if (r.spawnT <= 0 || r.minion) continue;
    const k = r.spawnT / 0.7;
    ctx.fillStyle = rgba(ROBOT_SPECS[r.kind].color, 0.25 * k);
    ctx.fillRect(r.x - 0.4, r.y - 0.4, 0.8, m.house ? m.house.y + 2 - r.y : 1);
  }

  // Robots.
  const p = g.player;
  for (const r of g.robots) {
    if (!r.alive) continue;
    drawRobotEntity(ctx, g, r);
  }

  if (g.boss && !g.boss.dead) drawBoss(view, g, g.boss);

  // Ben.
  if (g.state === 'dying') {
    const k = Math.max(0, Math.min(1, (g.stateT - 0.4) / 1.1));
    if (g.stateT < 1.6) drawBen(ctx, p.x, p.y, 0, 0, { t, death: k });
  } else if (g.state !== 'title') {
    const blink = p.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    if (!blink) drawBen(ctx, p.x, p.y, p.facing, p.mouth, { t, moving: p.moving, overdrive: p.overdrive, shield: p.shield, muzzle: p.muzzle });
  }

  for (const b of g.bullets) drawShot(ctx, b, t);
  for (const l of g.lasers) if (l.t >= l.warn) drawLaser(ctx, g, l);

  // Particles.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const q of g.particles) {
    const a = Math.max(0, q.life / q.max);
    switch (q.kind) {
      case 'spark':
        ctx.strokeStyle = rgba(q.color.startsWith('#') ? q.color : '#ffffff', a);
        ctx.lineWidth = q.size;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
        ctx.stroke();
        break;
      case 'glow':
        glow(ctx, q.x, q.y, q.size * (0.5 + a * 0.5), q.color, a);
        break;
      case 'ring':
        ctx.strokeStyle = rgba(q.color, a * 0.8);
        ctx.lineWidth = 0.08 * a + 0.02;
        circle(ctx, q.x, q.y, q.size * (1 - a) + 0.1);
        ctx.stroke();
        break;
      case 'chunk':
        ctx.fillStyle = rgba(q.color, a);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot + (1 - a) * 8);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
        ctx.restore();
        break;
    }
  }
  ctx.restore();

  for (const q of g.popups) {
    const a = Math.min(1, (q.life - q.t) / 0.4);
    const half = q.text.length * q.size * 0.3;
    const x = Math.min(Math.max(q.x, half - 0.3), COLS - 0.7 - half);
    text(view, q.text, x, q.y, q.size * 0.6, q.color, { weight: 900, stroke: 'rgba(0,0,0,0.7)', alpha: a });
  }

  // READY!
  if (g.state === 'intro' && (g.respawn || g.stateT > g.introLength - 0.9)) {
    const show = g.stateT < g.introLength - 0.5 || Math.floor(g.stateT * 8) % 2 === 0;
    if (show) text(view, 'READY!', m.bonus.x, m.bonus.y + (m.house ? 0 : -3), 0.95, '#ffd23f', { weight: 900, glow: '#ffb000', stroke: 'rgba(0,0,0,0.6)' });
  }
  ctx.restore();
}

function drawRobotEntity(ctx: CanvasRenderingContext2D, g: Game, r: Robot): void {
  const p = g.player;
  let alpha = 1;
  if (r.spawnT > 0) alpha = 1 - r.spawnT / 0.7;
  const cloak = cloakAmount(r);
  if (cloak > 0) alpha *= 1 - cloak * 0.88;
  if (r.spawnT > 0) {
    glow(ctx, r.x, r.y, 1.4 * (r.spawnT / 0.7) + 0.3, ROBOT_SPECS[r.kind].color, 0.7);
  }
  const look = Math.atan2(p.y - r.y, p.x - r.x);
  drawRobot(ctx, r.kind, r.x, r.y, r.dir, {
    t: r.anim,
    frightened: r.frightened,
    frightLeft: g.player.overdrive,
    flash: r.flash > 0,
    alpha,
    stun: r.stun > 0,
    hp: r.hp,
    maxHp: r.maxHp,
    charge: r.charge,
    lookX: r.stun > 0 ? 0 : Math.cos(look) * 0.07,
    lookY: r.stun > 0 ? 0 : Math.sin(look) * 0.05,
  });
}

function drawHud(view: View, g: Game): void {
  const ctx = view.ctx;
  const sector = SECTORS[g.spec.sector];
  text(view, 'SCORE', 1, 0.95, 0.55, '#8a93b8', { align: 'left' });
  text(view, pad(g.score, 6), 1, 2.15, 0.95, '#ffffff', { align: 'left', weight: 800 });
  text(view, 'HI-SCORE', 27, 0.95, 0.55, '#8a93b8', { align: 'right' });
  text(view, pad(g.hiScore, 6), 27, 2.15, 0.95, '#ffd23f', { align: 'right', weight: 800 });
  if (g.state !== 'title') {
    text(view, `LEVEL ${g.level}`, 14, 1.05, 0.8, sector.wall, { weight: 900, glow: sector.wall });
    text(view, `${sector.name}${g.spec.boss ? ' · BOSS' : ''}`, 14, 2.2, 0.48, '#8a93b8');
  }
  if (g.state === 'title') return;

  const y = HUD_TOP + ROWS + 1;
  // Lives.
  const shown = Math.min(g.lives, 6);
  for (let i = 0; i < shown; i++) drawBen(ctx, 1.2 + i * 1.25, y, 1, 0.5, { t: 0, scale: 0.62 });
  if (g.lives > 6) text(view, `+${g.lives - 6}`, 1.2 + 6 * 1.25, y, 0.5, '#ffffff', { align: 'left' });

  // Middle: boss health or robots left.
  const b = g.boss;
  if (b) {
    const spec = BOSS_SPECS[b.kind];
    const x0 = 9;
    const w = 10;
    text(view, spec.name, 14, y - 0.55, 0.45, spec.color, { weight: 900 });
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x0, y - 0.1, w, 0.45, 0.2);
    ctx.fill();
    const f = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : spec.color;
    roundRect(ctx, x0, y - 0.1, Math.max(0.3, w * f), 0.45, 0.2);
    ctx.fill();
    const marks = b.kind === 'shredder' ? [0.5, 0.25] : b.kind === 'omega' ? [0.66, 0.33] : [0.5];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (const mk of marks) ctx.fillRect(x0 + w * mk - 0.03, y - 0.1, 0.06, 0.45);
  } else if (g.state !== 'clear') {
    // Dots left to eat.
    glow(ctx, 12.5, y, 0.7, '#ffd23f', 0.5);
    ctx.fillStyle = sector.dot;
    circle(ctx, 12.5, y, 0.2);
    ctx.fill();
    text(view, `× ${g.dotsLeft}`, 13.2, y + 0.05, 0.7, '#ffffff', { align: 'left', weight: 800 });
  }

  // Right: power-ups and overdrive.
  const p = g.player;
  let rx = 26.8;
  const bar = (x: number, w: number, f: number, color: string) => {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y + 0.42, w, 0.14);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 0.42, w * Math.max(0, Math.min(1, f)), 0.14);
  };
  if (p.overdrive > 0) {
    text(view, 'OVERDRIVE', rx, y - 0.12, 0.42, '#8fb0ff', { align: 'right', weight: 900 });
    bar(rx - 3.6, 3.6, p.overdrive / p.overdriveMax, '#8fb0ff');
    rx -= 4.4;
  }
  if (p.power) {
    const color = PICKUP_COLORS[p.power];
    text(view, POWER_LABELS[p.power], rx, y - 0.12, 0.42, color, { align: 'right', weight: 900, maxWidth: 4.8 });
    bar(rx - 4, 4, p.powerT / p.powerMax, color);
    rx -= 4.8;
  }
  if (p.shield) drawShieldIcon(ctx, rx - 0.3, y + 0.1, 1.3, '#7fd8ff');
  if (g.combo >= 2 && g.comboT > 0) text(view, `COMBO ×${Math.min(g.combo, 8)}`, 14, HUD_TOP + 0.9, 0.6, '#ffd23f', { weight: 900, stroke: 'rgba(0,0,0,0.6)', alpha: Math.min(1, g.comboT * 2) });
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.86)';
  roundRect(ctx, x, y, w, h, 0.6);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.8);
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.restore();
}

function drawIntro(view: View, g: Game): void {
  if (g.respawn) return;
  const ctx = view.ctx;
  const t = g.stateT;
  const sector = SECTORS[g.spec.sector];
  const fade = Math.min(1, t * 4, (g.introLength - 0.9 - t) * 4);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  if (g.spec.boss) {
    const spec = BOSS_SPECS[g.spec.boss];
    // Hazard stripes.
    for (const y0 of [HUD_TOP + 8, HUD_TOP + 20.4]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, GW, 0.9);
      ctx.clip();
      ctx.fillStyle = '#1a0004';
      ctx.fillRect(0, y0, GW, 0.9);
      ctx.fillStyle = '#ff2a3d';
      for (let x = -2 + ((g.time * 4) % 1.6); x < GW + 2; x += 1.6) {
        ctx.beginPath();
        ctx.moveTo(x, y0 + 0.9);
        ctx.lineTo(x + 0.8, y0);
        ctx.lineTo(x + 1.4, y0);
        ctx.lineTo(x + 0.6, y0 + 0.9);
        ctx.fill();
      }
      ctx.restore();
    }
    panel(ctx, 1.5, HUD_TOP + 9.4, 25, 10.4, '#ff2a3d');
    const flash = Math.floor(g.time * 4) % 2 === 0;
    text(view, '⚠ WARNING ⚠', 14, HUD_TOP + 10.9, 1.25, flash ? '#ff2a3d' : '#ffffff', { weight: 900, glow: '#ff2a3d' });
    text(view, 'BOSS APPROACHING', 14, HUD_TOP + 12.3, 0.55, '#ffb3bb', { weight: 700 });
    text(view, spec.name, 14, HUD_TOP + 14.4, 1.7, spec.color, { weight: 900, glow: spec.color, maxWidth: 23 });
    text(view, spec.title, 14, HUD_TOP + 16.2, 0.6, '#ffffff', { weight: 700 });
    text(view, spec.intro.toUpperCase(), 14, HUD_TOP + 17.9, 0.45, '#9aa3c7', { weight: 600, maxWidth: 23 });
  } else {
    const h = g.spec.newKind ? 9.8 : 5.6;
    const y0 = HUD_TOP + 15.5 - h / 2 - (g.spec.newKind ? 0 : 2.2);
    panel(ctx, 4, y0, 20, h, sector.wall);
    text(view, `LEVEL ${g.level}`, 14, y0 + 1.6, 1.4, '#ffffff', { weight: 900, glow: sector.wall });
    text(view, `SECTOR ${g.spec.sector + 1}: ${sector.name}`, 14, y0 + 3.2, 0.55, sector.wall, { weight: 800 });
    text(view, `${g.level} OF ${LEVEL_COUNT}  ·  EAT EVERY DOT`, 14, y0 + 4.3, 0.42, '#8a93b8');
    if (g.spec.newKind) {
      const spec = ROBOT_SPECS[g.spec.newKind];
      ctx.strokeStyle = rgba(sector.wall, 0.4);
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(6, y0 + 5.2);
      ctx.lineTo(22, y0 + 5.2);
      ctx.stroke();
      text(view, 'NEW ROBOT', 14, y0 + 5.9, 0.45, '#ffd23f', { weight: 900 });
      drawRobot(ctx, g.spec.newKind, 7.6, y0 + 7.7, 1, { t: g.time, scale: 1.5 });
      text(view, spec.name, 9.6, y0 + 7.2, 0.8, spec.color, { align: 'left', weight: 900 });
      text(view, spec.blurb.toUpperCase(), 9.6, y0 + 8.4, 0.38, '#c8cfe8', { align: 'left', maxWidth: 13.6 });
    }
  }
  ctx.restore();
}

function drawClear(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.stateT;
  if (t < 0.6) return;
  const sector = SECTORS[g.spec.sector];
  const fade = Math.min(1, (t - 0.6) * 4);
  ctx.save();
  ctx.globalAlpha = fade;
  const lines = g.tally;
  const h = 4.4 + lines.length * 1.1;
  const y0 = HUD_TOP + 15.5 - h / 2;
  panel(ctx, 3.5, y0, 21, h, sector.wall);
  const title = g.boss ? 'BOSS DESTROYED!' : 'LEVEL CLEAR!';
  text(view, title, 14, y0 + 1.5, 1.2, '#ffd23f', { weight: 900, glow: '#ffb000', maxWidth: 19 });
  lines.forEach((line, i) => {
    if (t < 0.9 + i * 0.3) return;
    const y = y0 + 3 + i * 1.1;
    text(view, line.label, 5, y, 0.5, '#c8cfe8', { align: 'left', maxWidth: 12 });
    if (line.value) text(view, `+${line.value}`, 23, y, 0.55, '#ffffff', { align: 'right', weight: 800 });
  });
  if (g.level % 5 === 0 && g.level < LEVEL_COUNT) {
    text(view, `SECTOR ${g.spec.sector + 2} UNLOCKED`, 14, y0 + h - 0.8, 0.45, '#7dff8a', { weight: 800 });
  }
  ctx.restore();
}

function drawPause(view: View, g: Game): void {
  const ctx = view.ctx;
  ctx.fillStyle = 'rgba(2,3,10,0.72)';
  ctx.fillRect(0, 0, GW, GH);
  const sector = SECTORS[g.spec.sector];
  text(view, 'PAUSED', 14, 13.2, 1.6, '#ffffff', { weight: 900, glow: sector.wall });
  for (const [r, label, color] of [
    [UI.resume, 'RESUME', '#7dff8a'],
    [UI.quit, 'QUIT TO TITLE', '#ff6680'],
  ] as const) {
    ctx.fillStyle = rgba(color, 0.12);
    roundRect(ctx, r.x, r.y, r.w, r.h, 0.5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.07;
    ctx.stroke();
    text(view, label, r.x + r.w / 2, r.y + r.h / 2, 0.62, color, { weight: 900 });
  }
  if (!view.layout.touch) {
    if (!view.focused) text(view, 'CLICK THE GAME TO USE THE KEYBOARD AGAIN', 14, 24, 0.45, '#ffd23f', { weight: 800, maxWidth: 25 });
    else text(view, 'P OR ESC: RESUME  ·  Q: QUIT  ·  M: SOUND', 14, 24, 0.42, '#8a93b8');
  }
}

function drawGameOver(view: View, g: Game): void {
  const ctx = view.ctx;
  const a = Math.min(1, g.stateT * 2);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(2,3,10,0.6)';
  ctx.fillRect(0, HUD_TOP, GW, ROWS);
  text(view, 'GAME OVER', 14, 14, 2, '#ff3b5c', { weight: 900, glow: '#ff3b5c' });
  text(view, `SCORE ${g.score}`, 14, 16.6, 0.8, '#ffffff', { weight: 800 });
  text(view, `REACHED LEVEL ${g.level} OF ${LEVEL_COUNT}`, 14, 18, 0.5, '#8a93b8');
  if (g.score > 0 && g.score >= g.hiScore) text(view, 'NEW HIGH SCORE!', 14, 19.6, 0.7, '#ffd23f', { weight: 900, glow: '#ffb000' });
  if (g.stateT > 1.5 && Math.floor(g.time * 2) % 2 === 0) {
    text(view, view.layout.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE', 14, 22.5, 0.55, '#ffffff', { weight: 800 });
  }
  if (g.unlocked > 0) text(view, 'YOU CAN RESTART FROM ANY SECTOR YOU HAVE REACHED', 14, 24, 0.36, '#8a93b8', { maxWidth: 25 });
  ctx.restore();
}

function drawVictory(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.stateT;
  ctx.fillStyle = 'rgba(2,3,10,0.75)';
  ctx.fillRect(0, 0, GW, GH);
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i / 6) * TAU;
    glow(ctx, 14 + Math.cos(a) * 9, 15 + Math.sin(a * 1.3) * 6, 4, SECTORS[i].wall, 0.35);
  }
  text(view, 'YOU WIN!', 14, 10, 2.4, '#ffd23f', { weight: 900, glow: '#ffb000' });
  text(view, 'ALL 30 LEVELS CLEARED', 14, 12.6, 0.7, '#ffffff', { weight: 800 });
  text(view, 'OMEGA IS SCRAP. THE MAZE IS FREE.', 14, 13.9, 0.5, '#c8cfe8');
  drawBen(ctx, 14, 17.5, 1, t * 8, { t, moving: true, scale: 2.4 });
  text(view, `FINAL SCORE ${g.score}`, 14, 21.5, 0.9, '#ffffff', { weight: 900 });
  if (g.score >= g.hiScore) text(view, 'NEW HIGH SCORE!', 14, 23, 0.6, '#ffd23f', { weight: 900 });
  if (t > 1.5 && Math.floor(g.time * 2) % 2 === 0) text(view, view.layout.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER', 14, 26, 0.55, '#ffffff', { weight: 800 });
}

function drawTitle(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.time;
  const cache = mazeCache(view, g);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.drawImage(cache.canvas, 0, HUD_TOP, COLS, ROWS);
  ctx.restore();
  const vg = ctx.createRadialGradient(14, 15, 3, 14, 15, 22);
  vg.addColorStop(0, 'rgba(3,5,13,0.2)');
  vg.addColorStop(1, 'rgba(3,5,13,0.9)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, HUD_TOP, GW, ROWS);

  // Logo.
  const wobble = Math.sin(t * 2) * 0.08;
  text(view, 'PAC BEN', 14, 7.2 + wobble, 3.6, '#ffd23f', { weight: 900, glow: '#ff9d00', stroke: '#7a3a00', maxWidth: 25 });
  text(view, 'SHOOT THE ROBOTS · CLEAR THE MAZE', 14, 9.6, 0.5, '#8fb0ff', { weight: 700 });

  // Cast list, like Pac-Man's attract screen.
  text(view, 'ROBOT  ·  WHAT IT DOES', 14, 11.6, 0.42, '#8a93b8', { weight: 700 });
  const cast: RobotKind[] = ['chaser', 'ambusher', 'flanker', 'wanderer'];
  cast.forEach((kind, i) => {
    const y = 13 + i * 1.6;
    const appear = Math.min(1, Math.max(0, (g.stateT - 0.3 - i * 0.35) * 3));
    if (appear <= 0) return;
    ctx.save();
    ctx.globalAlpha = appear;
    const spec = ROBOT_SPECS[kind];
    drawRobot(ctx, kind, 5.4, y, 1, { t: t + i });
    text(view, spec.name, 7, y, 0.62, spec.color, { align: 'left', weight: 900 });
    text(view, spec.blurb.toUpperCase(), 13.2, y, 0.36, '#c8cfe8', { align: 'left', maxWidth: 13.5 });
    ctx.restore();
  });

  // Chase across the screen: robots chase Ben, then Ben turns the tables.
  const cycle = t % 9;
  const y = 20.6;
  if (cycle < 4.5) {
    const bx = -2 + cycle * 7;
    drawBen(ctx, bx, y, 1, t * 14, { t, moving: true });
    for (let i = 0; i < 4; i++) drawRobot(ctx, cast[i], bx - 2.2 - i * 1.3, y, 1, { t: t + i });
  } else {
    const k = cycle - 4.5;
    const bx = 30 - k * 7.5;
    const fleeX = 30 - k * 5.5;
    for (let i = 0; i < 4; i++) {
      const rx = fleeX - 3 - i * 1.3;
      if (rx < bx - 0.6) drawRobot(ctx, cast[i], rx, y, 3, { t: t + i, frightened: true, frightLeft: 4.5 - k });
    }
    drawBen(ctx, bx, y, 3, t * 14, { t, moving: true, overdrive: 1 });
    for (let s = 0; s < 3; s++) {
      const sx = bx - 1.2 - ((t * 20 + s * 3) % 7);
      if (sx > bx - 7) drawShot(ctx, { kind: 'shot', x: sx, y, vx: -1, vy: 0, color: '#fff2a0' } as Bullet, t);
    }
  }

  const blink = Math.floor(t * 2.2) % 2 === 0;
  const prompt = view.layout.touch ? 'TAP TO START' : view.focused ? 'PRESS ENTER TO START' : 'CLICK HERE TO START';
  if (blink) text(view, prompt, 14, 24.4, 0.75, '#ffffff', { weight: 900, glow: '#ffd23f' });

  if (g.unlocked > 0) {
    const sector = SECTORS[g.menuSector];
    const cy = UI.sectorLeft.y + UI.sectorLeft.h / 2;
    text(view, `START AT SECTOR ${g.menuSector + 1}`, 14, cy - 0.4, 0.42, '#8a93b8');
    text(view, `${sector.name}`, 14, cy + 0.45, 0.62, sector.wall, { weight: 900 });
    if (g.menuSector > 0) text(view, '◀', 4, cy, 1, '#ffffff', { weight: 900 });
    if (g.menuSector < g.unlocked) text(view, '▶', 24, cy, 1, '#ffffff', { weight: 900 });
  } else {
    text(view, '30 LEVELS  ·  6 SECTORS  ·  6 BOSSES', 14, 27.7, 0.48, '#8a93b8', { weight: 700 });
  }

  const hints = view.layout.touch
    ? ['LEFT THUMB: SWIPE OR DRAG TO STEER', 'RIGHT THUMB: HOLD FIRE TO SHOOT']
    : ['HOLD THE ARROW KEYS TO MOVE  ·  SPACE: FIRE', 'P: PAUSE  ·  M: SOUND ON/OFF'];
  text(view, hints[0], 14, 30.3, 0.42, '#c8cfe8');
  text(view, hints[1], 14, 31.4, 0.42, '#c8cfe8');
  text(view, 'EAT EVERY DOT TO CLEAR A LEVEL', 14, 32.9, 0.4, '#ffd23f', { weight: 800, maxWidth: 25 });
  text(view, 'POWER CORES SEND THE ROBOTS RUNNING', 14, 34, 0.36, '#8a93b8', { maxWidth: 25 });
}

function drawControls(view: View): void {
  const ctx = view.ctx;
  const L = view.layout;
  ctx.save();
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  const icon = (r: Rect, draw: () => void) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    draw();
    ctx.restore();
  };
  icon(L.pause, () => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-6, -7, 4, 14);
    ctx.fillRect(2, -7, 4, 14);
  });
  icon(L.mute, () => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(-5, -3);
    ctx.lineTo(1, -8);
    ctx.lineTo(1, 8);
    ctx.lineTo(-5, 3);
    ctx.lineTo(-9, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (view.muted) {
      ctx.moveTo(4, -4);
      ctx.lineTo(11, 4);
      ctx.moveTo(11, -4);
      ctx.lineTo(4, 4);
    } else {
      ctx.arc(2, 0, 5, -0.8, 0.8);
      ctx.moveTo(2 + 9 * Math.cos(-0.8), 9 * Math.sin(-0.8));
      ctx.arc(2, 0, 9, -0.8, 0.8);
    }
    ctx.stroke();
  });

  if (L.touch) {
    // Steering stick.
    const s = view.stick;
    const home = L.stickHome;
    const cx = s.active ? s.ox : home.x;
    const cy = s.active ? s.oy : home.y;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    circle(ctx, cx, cy, home.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let d = 0; d < 4; d++) {
      const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
      const lit = s.active && s.dir === d;
      ctx.fillStyle = lit ? 'rgba(255,210,63,0.95)' : 'rgba(255,255,255,0.35)';
      ctx.save();
      ctx.translate(cx + Math.cos(a) * home.r * 0.72, cy + Math.sin(a) * home.r * 0.72);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (s.active) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      const k = d > home.r * 0.6 ? (home.r * 0.6) / d : 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      circle(ctx, s.ox + dx * k, s.oy + dy * k, home.r * 0.38);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `700 11px ${view.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STEER', cx, cy);
    }
    // Fire button.
    const f = L.fire;
    const held = view.fireHeld;
    const grd = ctx.createRadialGradient(f.x, f.y - f.r * 0.3, f.r * 0.1, f.x, f.y, f.r);
    grd.addColorStop(0, held ? 'rgba(255,240,150,0.95)' : 'rgba(255,90,110,0.55)');
    grd.addColorStop(1, held ? 'rgba(255,120,40,0.75)' : 'rgba(160,20,50,0.35)');
    ctx.fillStyle = grd;
    circle(ctx, f.x, f.y, f.r * (held ? 0.94 : 1));
    ctx.fill();
    ctx.strokeStyle = held ? 'rgba(255,255,255,0.9)' : 'rgba(255,160,170,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(f.r * 0.32)}px ${view.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIRE', f.x, f.y);
  }
  ctx.restore();
}

export function render(view: View, g: Game): void {
  const ctx = view.ctx;
  const L = view.layout;
  const sector = SECTORS[g.spec.sector];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g.state === 'title' ? SECTORS[0].bg : sector.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shake = g.shake > 0 ? g.shake * 0.35 : 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;
  const k = L.scale * L.dpr;
  ctx.setTransform(k, 0, 0, k, L.ox * L.dpr + sx * k, L.oy * L.dpr + sy * k);

  if (g.state === 'title') {
    drawTitle(view, g);
    drawHud(view, g);
  } else {
    drawWorld(view, g);
    drawHud(view, g);
    if (g.state === 'intro') drawIntro(view, g);
    if (g.state === 'clear') drawClear(view, g);
    if (g.state === 'gameover') drawGameOver(view, g);
    if (g.state === 'victory') drawVictory(view, g);
    if (g.banner) {
      const b = g.banner;
      const a = Math.min(1, b.t * 5, (b.life - b.t) * 3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      text(view, b.text, 14, HUD_TOP + 9, 1.3, b.color, { weight: 900, glow: b.color, stroke: 'rgba(0,0,0,0.7)', maxWidth: 26 });
      ctx.restore();
    }
  }

  if (g.glitch > 0) {
    // Tear a few strips of the screen sideways.
    const canvas = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 4; i++) {
      const h = Math.random() * canvas.height * 0.06 + 4;
      const y = Math.random() * (canvas.height - h);
      const dx = (Math.random() - 0.5) * 40 * L.dpr * Math.min(1, g.glitch * 2);
      ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
    }
    ctx.restore();
  }
  if (g.flash > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(0.5, g.flash);
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  ctx.setTransform(k, 0, 0, k, L.ox * L.dpr, L.oy * L.dpr);
  if (g.paused) drawPause(view, g);
  drawControls(view);
}
