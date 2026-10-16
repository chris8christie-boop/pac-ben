/*
 * Outlines of the maze walls, for drawing. Each wall block becomes a closed
 * loop along its tile edges, which the renderer insets and rounds off.
 */
import { COLS, ROWS, WALL } from './maze.ts';
import type { Maze, Point } from './maze.ts';

export interface Contour {
  /** Corners of the loop in tile-edge coordinates (tile (x, y) spans x..x+1). Walls are on the right. */
  points: Point[];
  /** True for the border round the edge of the maze. */
  outer: boolean;
}

const PAD = 2;

export function wallContours(m: Maze): Contour[] {
  const W = COLS + PAD * 2;
  const H = ROWS + PAD * 2;
  const tunnel = new Set(m.tunnelRows);
  const solid = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = px - PAD;
      const y = py - PAD;
      let s: boolean;
      if (y < 0 || y >= ROWS) s = true;
      else if (x < 0 || x >= COLS) s = !tunnel.has(y);
      else s = m.tiles[y * COLS + x] === WALL;
      solid[py * W + px] = s ? 1 : 0;
    }
  }
  const isSolid = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && solid[py * W + px] === 1;

  // Which wall blocks touch the padding: those are the border.
  const comp = new Int32Array(W * H).fill(-1);
  const outerComp: boolean[] = [];
  for (let k = 0; k < W * H; k++) {
    if (!solid[k] || comp[k] >= 0) continue;
    const id = outerComp.length;
    let outer = false;
    const stack = [k];
    comp[k] = id;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % W;
      const cy = (c - cx) / W;
      if (cx < PAD || cy < PAD || cx >= W - PAD || cy >= H - PAD) outer = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isSolid(nx, ny)) continue;
        const n = ny * W + nx;
        if (comp[n] < 0) {
          comp[n] = id;
          stack.push(n);
        }
      }
    }
    outerComp.push(outer);
  }

  interface Edge { ax: number; ay: number; bx: number; by: number; comp: number }
  const edges: Edge[] = [];
  const from = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (W + 1) + x;
  const add = (ax: number, ay: number, bx: number, by: number, c: number) => {
    const e = edges.length;
    edges.push({ ax, ay, bx, by, comp: c });
    const k = key(ax, ay);
    const list = from.get(k);
    if (list) list.push(e);
    else from.set(k, [e]);
  };
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      if (!solid[py * W + px]) continue;
      const c = comp[py * W + px];
      if (!isSolid(px, py - 1)) add(px, py, px + 1, py, c);
      if (!isSolid(px + 1, py)) add(px + 1, py, px + 1, py + 1, c);
      if (!isSolid(px, py + 1)) add(px + 1, py + 1, px, py + 1, c);
      if (!isSolid(px - 1, py)) add(px, py + 1, px, py, c);
    }
  }

  const used = new Uint8Array(edges.length);
  const contours: Contour[] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s]) continue;
    const loop: Point[] = [];
    let cur = s;
    for (let guard = 0; guard <= edges.length; guard++) {
      used[cur] = 1;
      const e = edges[cur];
      loop.push({ x: e.ax - PAD, y: e.ay - PAD });
      const options = (from.get(key(e.bx, e.by)) ?? []).filter((n) => !used[n] || n === s);
      if (!options.length) break;
      // Where two blocks meet at a corner, keep turning right so they stay separate.
      const dx = e.bx - e.ax;
      const dy = e.by - e.ay;
      let next = options[0];
      let best = -Infinity;
      for (const n of options) {
        const o = edges[n];
        const cross = dx * (o.by - o.ay) - dy * (o.bx - o.ax);
        if (cross > best) {
          best = cross;
          next = n;
        }
      }
      if (next === s) break;
      cur = next;
    }
    contours.push({ points: simplify(loop), outer: outerComp[edges[s].comp] });
  }
  return contours;
}

function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) out.push(b);
  }
  return out;
}

export interface Corner extends Point {
  /** A convex corner of the wall (a right turn, walking with the wall on the right). */
  convex: boolean;
}

/** Moves each edge of a loop `inset` tiles into the wall. */
export function insetContour(points: readonly Point[], inset: number): Corner[] {
  const n = points.length;
  const out: Corner[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[(i - 1 + n) % n];
    const b = points[i];
    const c = points[(i + 1) % n];
    const inX = Math.sign(b.x - a.x);
    const inY = Math.sign(b.y - a.y);
    const outX = Math.sign(c.x - b.x);
    const outY = Math.sign(c.y - b.y);
    out.push({
      x: b.x + inset * (-inY + -outY),
      y: b.y + inset * (inX + outX),
      convex: inX * outY - inY * outX > 0,
    });
  }
  return out;
}
