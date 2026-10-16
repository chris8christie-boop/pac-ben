/*
 * Shared drawing helpers: the layout of the play area, colours, glows, shapes and text.
 * The play area is 28 x 36 tiles: three rows of score at the top, the 28 x 31 maze,
 * and two rows for lives and power-ups at the bottom. Everything is drawn in tile
 * units; the canvas transform scales it to fit.
 */

export const GW = 28;
export const GH = 36;
export const HUD_TOP = 3;
export const TAU = Math.PI * 2;

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
  skip: { x: 20.5, y: 0.6, w: 6.8, h: 1.8 },
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

export interface MazeCache {
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

export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Lighter (f > 0) or darker (f < 0). */
export function shade(hex: string, f: number): string {
  const [r, g, b] = rgb(hex);
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export const glowCache = new Map<string, HTMLCanvasElement>();

export function glowSprite(color: string): HTMLCanvasElement {
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

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  if (alpha <= 0 || r <= 0) return;
  const op = ctx.globalCompositeOperation;
  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = op;
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export interface TextOptions {
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
export function text(view: View, s: string, x: number, y: number, size: number, color: string, o: TextOptions = {}): number {
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

export function pad(n: number, width: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, '0');
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.86)';
  roundRect(ctx, x, y, w, h, 0.6);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.8);
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.restore();
}
