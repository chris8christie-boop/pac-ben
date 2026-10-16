/* The maze: walls, floor and factory, drawn once per level into an offscreen canvas. */
import { rgba, circle } from './render-util.ts';
import type { MazeCache, View } from './render-util.ts';
import { SECTORS, levelSpec } from './levels.ts';
import { COLS, DX, DY, PATH, ROWS, tileAt } from './maze.ts';
import { insetContour, wallContours } from './contours.ts';
import type { Game } from './types.ts';

/* ---------- the maze ---------- */

export function roundedLoop(path: Path2D, pts: ReturnType<typeof insetContour>, convexR: number, concaveR: number): void {
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

export function mazeCache(view: View, g: Game): MazeCache {
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
