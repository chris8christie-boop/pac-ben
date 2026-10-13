/*
 * Mazes, built the way Pac-Man's are: one-tile corridors on a lattice, walls
 * at least two tiles thick, no dead ends, mirrored left to right, a robot
 * factory in the middle and wrap-around tunnels at the sides.
 *
 * Coordinates: tile (x, y) has its centre at (x, y). An entity standing on a
 * tile centre has whole-number coordinates.
 */
import { mulberry32, pick, pickWeighted, shuffle } from './rng.ts';
import type { Rng } from './rng.ts';

export const COLS = 28;
export const ROWS = 31;

export const WALL = 0;
export const PATH = 1;
export const HOUSE = 2; // inside the robot factory
export const DOOR = 3; // the factory door

export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export const NONE = -1;
export const DX: readonly number[] = [0, 1, 0, -1];
export const DY: readonly number[] = [-1, 0, 1, 0];

export function opposite(d: number): number {
  return d < 0 ? d : (d + 2) % 4;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Maze {
  level: number;
  tiles: Uint8Array;
  /** 0 nothing, 1 energy dot, 2 power core. */
  dots: Uint8Array;
  dotTotal: number;
  /** For each tile, the tile index a teleport pad sends you to, or -1. */
  portalLink: Int16Array;
  portals: Point[];
  playerStart: Point;
  /** Where robots come out of the factory. */
  exits: Point[];
  /** The factory box, walls included. Null on boss levels. */
  house: Rect | null;
  /** The open arena in the middle of a boss level. */
  plaza: Rect | null;
  /** The tiles around the factory where no dots are laid. */
  ring: Rect;
  bonus: Point;
  tunnelRows: number[];
  /** Scatter targets, just outside each corner. */
  corners: Point[];
  center: Point;
}

export function wrapX(x: number): number {
  return ((x % COLS) + COLS) % COLS;
}

export function tileIndex(x: number, y: number): number {
  return y * COLS + wrapX(x);
}

export function tileAt(m: Maze, x: number, y: number): number {
  if (y < 0 || y >= ROWS) return WALL;
  return m.tiles[y * COLS + wrapX(x)];
}

export function walkable(m: Maze, x: number, y: number): boolean {
  return tileAt(m, x, y) === PATH;
}

export function canGo(m: Maze, x: number, y: number, d: number): boolean {
  return d >= 0 && walkable(m, x + DX[d], y + DY[d]);
}

/** Breadth-first step counts from the given tiles to every walkable tile (-1 where unreachable). */
export function distanceMap(m: Maze, sources: readonly Point[], out?: Int16Array): Int16Array {
  const dist = out ?? new Int16Array(COLS * ROWS);
  dist.fill(-1);
  const queue = new Int16Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  for (const s of sources) {
    const sx = Math.round(s.x);
    const sy = Math.round(s.y);
    if (!walkable(m, sx, sy)) continue;
    const i = tileIndex(sx, sy);
    if (dist[i] === 0) continue;
    dist[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % COLS;
    const y = (i - x) / COLS;
    const next = dist[i] + 1;
    for (let d = 0; d < 4; d++) {
      const ny = y + DY[d];
      if (ny < 0 || ny >= ROWS) continue;
      const j = ny * COLS + wrapX(x + DX[d]);
      if (dist[j] >= 0 || m.tiles[j] !== PATH) continue;
      dist[j] = next;
      queue[tail++] = j;
    }
    const link = m.portalLink[i];
    if (link >= 0 && dist[link] < 0) {
      dist[link] = next;
      queue[tail++] = link;
    }
  }
  return dist;
}

/** The walkable tile nearest to a point (searching outwards ring by ring). */
export function nearestWalkable(m: Maze, x: number, y: number): Point {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let r = 0; r < Math.max(COLS, ROWS); r++) {
    let best: Point | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= COLS || !walkable(m, tx, ty)) continue;
        const d = (tx - x) ** 2 + (ty - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: tx, y: ty };
        }
      }
    }
    if (best) return best;
  }
  return { ...m.playerStart };
}

export interface MazeOptions {
  boss: boolean;
  portals: boolean;
  /** Chance of knocking out each candidate corridor: higher means fewer loops. */
  removeChance: number;
  /** Chance of filling in a whole junction, which makes bigger wall blocks. */
  nodeChance: number;
  tunnels: number;
  seed?: number;
}

/** A random way of splitting a span into gaps of 3, 4 or 5 tiles. */
function compose(span: number, rng: Rng): number[] {
  const out: number[] = [];
  let left = span;
  while (left > 0) {
    const options = [3, 4, 5].filter((p) => left - p === 0 || left - p >= 3);
    const p = pickWeighted(rng, options.map((o) => [o, o === 5 ? 1 : 4] as const));
    out.push(p);
    left -= p;
  }
  return out;
}

export function generateMaze(level: number, opts: MazeOptions): Maze {
  const rng = mulberry32(((opts.seed ?? 0x5eed) ^ Math.imul(level, 0x9e3779b1)) >>> 0);

  // Columns: four on the left, mirrored on the right. x = 9 and 18 frame the factory.
  const gaps = pick(rng, [[5, 3, 3], [4, 4, 3], [3, 5, 3]]);
  const left = [1];
  for (const g of gaps) left.push(left[left.length - 1] + g);
  const xs = [...left, ...left.slice().reverse().map((x) => COLS - 1 - x)];
  const nx = xs.length;

  // Rows: the factory sits between rows ra and ra + 6, with a row through its middle.
  const ra = pick(rng, [10, 11, 11, 12]);
  const ys = [1];
  for (const g of compose(ra - 1, rng)) ys.push(ys[ys.length - 1] + g);
  ys.push(ra + 3, ra + 6);
  for (const g of compose(ROWS - 2 - (ra + 6), rng)) ys.push(ys[ys.length - 1] + g);
  const ny = ys.length;
  const jA = ys.indexOf(ra);
  const jM = jA + 1;
  const jB = jA + 2;

  const node = new Uint8Array(nx * ny).fill(1);
  const h = new Uint8Array((nx - 1) * ny).fill(1); // (i, j) to (i + 1, j)
  const v = new Uint8Array(nx * (ny - 1)).fill(1); // (i, j) to (i, j + 1)
  const hLock = new Uint8Array(h.length);
  const vLock = new Uint8Array(v.length);
  const nodeLock = new Uint8Array(node.length);
  const tunnel = new Uint8Array(ny);

  const H = (i: number, j: number) => j * (nx - 1) + i;
  const V = (i: number, j: number) => j * nx + i;
  const N = (i: number, j: number) => j * nx + i;
  const setH = (i: number, j: number, on: number, lock = false) => {
    h[H(i, j)] = on;
    h[H(nx - 2 - i, j)] = on;
    if (lock) hLock[H(i, j)] = hLock[H(nx - 2 - i, j)] = 1;
  };
  const setV = (i: number, j: number, on: number, lock = false) => {
    v[V(i, j)] = on;
    v[V(nx - 1 - i, j)] = on;
    if (lock) vLock[V(i, j)] = vLock[V(nx - 1 - i, j)] = 1;
  };
  const setNode = (i: number, j: number, on: number, lock = false) => {
    node[N(i, j)] = on;
    node[N(nx - 1 - i, j)] = on;
    if (lock) nodeLock[N(i, j)] = nodeLock[N(nx - 1 - i, j)] = 1;
  };

  // The factory: nothing crosses it, and a ring corridor runs round it.
  setNode(3, jM, 0, true);
  setH(2, jM, 0, true);
  setH(3, jM, 0, true);
  setV(3, jA, 0, true);
  setV(3, jM, 0, true);
  for (const j of [jA, jB]) {
    setH(2, j, 1, true);
    setH(3, j, 1, true);
    setNode(2, j, 1, true);
    setNode(3, j, 1, true);
  }
  setV(2, jA, 1, true);
  setV(2, jM, 1, true);
  setNode(2, jM, 1, true);

  // Ben starts in the middle of a row below the factory.
  const jS = ny - 1 - jB >= 3 ? jB + 2 : jB + 1;
  setH(3, jS, 1, true);
  setNode(3, jS, 1, true);

  // Tunnels.
  const tunnelCandidates = [];
  for (let j = 2; j <= ny - 3; j++) if (j !== jA && j !== jB) tunnelCandidates.push(j);
  const tunnelRows: number[] = [];
  const wantMiddle = rng() < 0.6;
  for (let t = 0; t < opts.tunnels; t++) {
    const options = tunnelCandidates.filter((j) => tunnelRows.every((r) => Math.abs(r - j) >= 3));
    if (!options.length) break;
    const j = t === 0 && wantMiddle && options.includes(jM) ? jM : pick(rng, options);
    tunnelRows.push(j);
    tunnel[j] = 1;
    setNode(0, j, 1, true);
    setH(0, j, 1, true);
    setNode(1, j, 1, true);
    if (rng() < 0.6) {
      // Break the outer corridor so the tunnel runs between two wall blocks, as in Pac-Man.
      setV(0, j - 1, 0, true);
      setV(0, j, 0, true);
      for (const k of [j - 1, j + 1]) {
        setH(0, k, 1, true);
        setNode(1, k, 1, true);
      }
      setV(0, j - 2, 1, true);
      setV(0, j + 1, 1, true);
    }
  }

  const degree = (i: number, j: number): number => {
    if (!node[N(i, j)]) return 0;
    let d = 0;
    if (i > 0 && h[H(i - 1, j)]) d++;
    if (i < nx - 1 && h[H(i, j)]) d++;
    if (j > 0 && v[V(i, j - 1)]) d++;
    if (j < ny - 1 && v[V(i, j)]) d++;
    if (tunnel[j] && (i === 0 || i === nx - 1)) d++;
    return d;
  };

  const connected = (): boolean => {
    const seen = new Uint8Array(nx * ny);
    let start = -1;
    let count = 0;
    for (let k = 0; k < node.length; k++) {
      if (node[k] && degree(k % nx, Math.floor(k / nx)) > 0) {
        count++;
        if (start < 0) start = k;
      }
    }
    if (start < 0) return false;
    const stack = [start];
    seen[start] = 1;
    let reached = 0;
    while (stack.length) {
      const k = stack.pop()!;
      reached++;
      const i = k % nx;
      const j = Math.floor(k / nx);
      const visit = (ii: number, jj: number) => {
        const kk = N(ii, jj);
        if (!seen[kk] && node[kk]) {
          seen[kk] = 1;
          stack.push(kk);
        }
      };
      if (i > 0 && h[H(i - 1, j)]) visit(i - 1, j);
      if (i < nx - 1 && h[H(i, j)]) visit(i + 1, j);
      if (j > 0 && v[V(i, j - 1)]) visit(i, j - 1);
      if (j < ny - 1 && v[V(i, j)]) visit(i, j + 1);
      if (tunnel[j] && i === 0) visit(nx - 1, j);
      if (tunnel[j] && i === nx - 1) visit(0, j);
    }
    return reached === count;
  };

  const noDeadEnds = (cells: readonly (readonly [number, number])[]): boolean =>
    cells.every(([i, j]) => !node[N(i, j)] || degree(i, j) >= 2);

  // Wall blocks are the gaps between lattice lines ("pillars"), merged where a
  // corridor has been knocked out. Keep merged blocks Pac-Man sized.
  const PW = nx - 1;
  const PH = ny - 1;
  const MAX_BLOCK = 52;
  const blockArea = (si: number, sj: number): number => {
    const seen = new Uint8Array(PW * PH);
    const stack = [[si, sj]];
    seen[sj * PW + si] = 1;
    let area = 0;
    while (stack.length) {
      const [pi, pj] = stack.pop()!;
      area += (xs[pi + 1] - xs[pi] - 1) * (ys[pj + 1] - ys[pj] - 1);
      const links: [number, number, boolean, number][] = [
        [pi, pj - 1, !h[H(pi, pj)], xs[pi + 1] - xs[pi] - 1],
        [pi, pj + 1, !h[H(pi, pj + 1)], xs[pi + 1] - xs[pi] - 1],
        [pi - 1, pj, !v[V(pi, pj)], ys[pj + 1] - ys[pj] - 1],
        [pi + 1, pj, !v[V(pi + 1, pj)], ys[pj + 1] - ys[pj] - 1],
      ];
      for (const [qi, qj, open, len] of links) {
        if (!open) continue;
        // Merged into the outer border: that's the border's business, not a slab.
        if (qi < 0 || qj < 0 || qi >= PW || qj >= PH) return 0;
        if (seen[qj * PW + qi]) continue;
        seen[qj * PW + qi] = 1;
        area += len;
        stack.push([qi, qj]);
      }
    }
    return area;
  };
  const pillarNear = (i: number, j: number): [number, number] => [Math.min(i, PW - 1), Math.min(j, PH - 1)];

  // Fill in a few junctions to make larger blocks.
  const nodeCandidates: [number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx / 2; i++) if (!nodeLock[N(i, j)]) nodeCandidates.push([i, j]);
  let filled = 0;
  for (const [i, j] of shuffle(rng, nodeCandidates)) {
    if (!node[N(i, j)] || rng() > opts.nodeChance || filled >= 2) continue;
    // Never next to another filled junction, or the blocks merge into one huge slab.
    const near = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1], [i - 1, j - 1], [i + 1, j + 1], [i - 1, j + 1], [i + 1, j - 1]];
    if (near.some(([a, b]) => a >= 0 && b >= 0 && a < nx && b < ny && !node[N(a, b)] && !nodeLock[N(a, b)])) continue;
    const edges: (() => void)[] = [];
    const restore: (() => void)[] = [];
    const touch: [number, number][] = [];
    let locked = false;
    const consider = (kind: 'h' | 'v', ei: number, ej: number, ni: number, nj: number) => {
      const arr = kind === 'h' ? h : v;
      const lock = kind === 'h' ? hLock : vLock;
      const k = kind === 'h' ? H(ei, ej) : V(ei, ej);
      if (!arr[k]) return;
      if (lock[k]) locked = true;
      const set = kind === 'h' ? setH : setV;
      edges.push(() => set(ei, ej, 0));
      restore.push(() => set(ei, ej, 1));
      touch.push([ni, nj], [nx - 1 - ni, nj]);
    };
    if (i > 0) consider('h', i - 1, j, i - 1, j);
    if (i < nx - 1) consider('h', i, j, i + 1, j);
    if (j > 0) consider('v', i, j - 1, i, j - 1);
    if (j < ny - 1) consider('v', i, j, i, j + 1);
    if (locked || tunnel[j]) continue;
    edges.forEach((f) => f());
    setNode(i, j, 0);
    if (!noDeadEnds(touch) || !connected() || blockArea(...pillarNear(i, j)) > MAX_BLOCK) {
      setNode(i, j, 1);
      restore.forEach((f) => f());
    } else filled++;
  }

  // Knock out corridors, keeping every junction at two exits or more and the maze in one piece.
  const edgeCandidates: ['h' | 'v', number, number][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i <= (nx - 2) / 2; i++) if (!hLock[H(i, j)]) edgeCandidates.push(['h', i, j]);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx / 2; i++) if (!vLock[V(i, j)]) edgeCandidates.push(['v', i, j]);
  for (const [kind, i, j] of shuffle(rng, edgeCandidates)) {
    const on = kind === 'h' ? h[H(i, j)] : v[V(i, j)];
    if (!on || rng() > opts.removeChance) continue;
    const ends: [number, number][] =
      kind === 'h' ? [[i, j], [i + 1, j], [nx - 1 - i, j], [nx - 2 - i, j]] : [[i, j], [i, j + 1], [nx - 1 - i, j], [nx - 1 - i, j + 1]];
    if (kind === 'h') setH(i, j, 0);
    else setV(i, j, 0);
    if (!noDeadEnds(ends) || !connected() || blockArea(...pillarNear(i, j)) > MAX_BLOCK) {
      if (kind === 'h') setH(i, j, 1);
      else setV(i, j, 1);
    }
  }

  // Draw the lattice into tiles.
  const tiles = new Uint8Array(COLS * ROWS);
  const open = (x: number, y: number) => {
    tiles[y * COLS + x] = PATH;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (node[N(i, j)] && degree(i, j) > 0) open(xs[i], ys[j]);
      if (i < nx - 1 && h[H(i, j)]) for (let x = xs[i]; x <= xs[i + 1]; x++) open(x, ys[j]);
      if (j < ny - 1 && v[V(i, j)]) for (let y = ys[j]; y <= ys[j + 1]; y++) open(xs[i], y);
    }
  }
  for (const j of tunnelRows) {
    open(0, ys[j]);
    open(COLS - 1, ys[j]);
  }

  const ring: Rect = { x: 9, y: ra, w: 10, h: 7 };
  let house: Rect | null = null;
  let plaza: Rect | null = null;
  if (opts.boss) {
    plaza = { x: 9, y: ra, w: 10, h: 7 };
    for (let y = plaza.y; y < plaza.y + plaza.h; y++) for (let x = plaza.x; x < plaza.x + plaza.w; x++) open(x, y);
  } else {
    house = { x: 10, y: ra + 1, w: 8, h: 5 };
    for (let y = house.y + 1; y < house.y + house.h - 1; y++) {
      for (let x = house.x + 1; x < house.x + house.w - 1; x++) tiles[y * COLS + x] = HOUSE;
    }
    tiles[house.y * COLS + 13] = DOOR;
    tiles[house.y * COLS + 14] = DOOR;
  }

  const startRow = ys[jS];
  const playerStart = { x: 13.5, y: startRow };

  // Teleport pads link a top corner to the opposite bottom corner.
  const portalLink = new Int16Array(COLS * ROWS).fill(-1);
  const portals: Point[] = [];
  if (opts.portals) {
    // Pads link a top corner to the opposite bottom corner, as far apart as possible.
    const usable = (i: number, j: number) => node[N(i, j)] && degree(i, j) >= 2 && !tunnel[j];
    let best: [number, number, number] | null = null;
    for (const i of [1, 2]) {
      for (let jt = 0; jt < jA; jt++) {
        if (!usable(i, jt)) continue;
        for (let jb = ny - 1; jb > jS; jb--) {
          if (!usable(nx - 1 - i, jb)) continue;
          const span = ys[jb] - ys[jt] + (i === 1 ? 1 : 0);
          if (!best || span > best[2]) best = [i, jt, jb];
        }
      }
    }
    if (best) {
      const [i, jt, jb] = best;
      const pairs: [Point, Point][] = [
        [{ x: xs[i], y: ys[jt] }, { x: xs[nx - 1 - i], y: ys[jb] }],
        [{ x: xs[nx - 1 - i], y: ys[jt] }, { x: xs[i], y: ys[jb] }],
      ];
      for (const [a, b] of pairs) {
        portalLink[tileIndex(a.x, a.y)] = tileIndex(b.x, b.y);
        portalLink[tileIndex(b.x, b.y)] = tileIndex(a.x, a.y);
        portals.push(a, b);
      }
    }
  }

  // Dots along the corridors, except round the factory, the start and the pads.
  const dots = new Uint8Array(COLS * ROWS);
  let dotTotal = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      if (tiles[i] !== PATH) continue;
      if (x >= ring.x && x < ring.x + ring.w && y >= ring.y && y < ring.y + ring.h) continue;
      if (y === startRow && (x === 13 || x === 14)) continue;
      if (x === 0 || x === COLS - 1) continue;
      if (portalLink[i] >= 0) continue;
      // Two dots in every five tiles along a corridor: about a hundred a level.
      // Measured from the nearer side so both halves of the maze match.
      const k = (Math.min(x, COLS - 1 - x) + y) % 5;
      if (k !== 0 && k !== 2) continue;
      dots[i] = 1;
      dotTotal++;
    }
  }
  // Four power cores near the corners, on the outer corridor.
  for (const target of [1, ny - 3]) {
    let best = -1;
    for (let j = 0; j < ny; j++) {
      if (!node[N(0, j)] || degree(0, j) < 2 || tunnel[j]) continue;
      if (best < 0 || Math.abs(j - target) < Math.abs(best - target)) best = j;
    }
    if (best < 0) continue;
    for (const x of [xs[0], xs[nx - 1]]) {
      const i = ys[best] * COLS + x;
      if (dots[i] === 0) dotTotal++;
      dots[i] = 2;
    }
  }

  return {
    level,
    tiles,
    dots,
    dotTotal,
    portalLink,
    portals,
    playerStart,
    exits: [
      { x: 13, y: ra },
      { x: 14, y: ra },
    ],
    house,
    plaza,
    ring,
    bonus: { x: 13.5, y: ra + 6 },
    tunnelRows: tunnelRows.map((j) => ys[j]).sort((a, b) => a - b),
    corners: [
      { x: COLS - 3, y: -4 },
      { x: 2, y: -4 },
      { x: COLS - 1, y: ROWS + 1 },
      { x: 0, y: ROWS + 1 },
    ],
    center: { x: 13.5, y: ra + 3 },
  };
}

/*
 * Moving along corridors. Entities only change direction on a tile centre;
 * `decide` is asked which way to go each time one is reached.
 */
export interface Mover {
  x: number;
  y: number;
  dir: number;
  /** The tile index of the pad just arrived on, so it doesn't bounce straight back. */
  portalLock: number;
}

const EPS = 1e-6;

function snap(n: number): number {
  const r = Math.round(n);
  return Math.abs(n - r) < EPS ? r : n;
}

export function atCentre(m: Mover): boolean {
  return Number.isInteger(m.x) && Number.isInteger(m.y);
}

/** Moves up to `dist` tiles. Returns true if the mover went through a teleport pad. */
export function advance(maze: Maze, m: Mover, dist: number, decide: (m: Mover) => number): boolean {
  let teleported = false;
  // The pad you arrived on stays quiet only while you stand on it. Step off at all and it works again.
  if (m.portalLock >= 0 && !(atCentre(m) && tileIndex(m.x, m.y) === m.portalLock)) m.portalLock = -1;
  for (let guard = 0; dist > EPS && guard < 16; guard++) {
    if (atCentre(m)) {
      const here = tileIndex(m.x, m.y);
      if (m.portalLock !== here) m.portalLock = -1;
      const link = maze.portalLink[here];
      if (link >= 0 && m.portalLock < 0) {
        m.x = link % COLS;
        m.y = (link - m.x) / COLS;
        m.portalLock = link;
        teleported = true;
      }
      const d = decide(m);
      if (d < 0 || !canGo(maze, m.x, m.y, d)) {
        m.dir = NONE;
        return teleported;
      }
      m.dir = d;
    } else if (m.dir < 0) {
      return teleported;
    }
    const horizontal = DX[m.dir] !== 0;
    const sign = horizontal ? DX[m.dir] : DY[m.dir];
    const pos = horizontal ? m.x : m.y;
    const target = sign > 0 ? Math.floor(pos + EPS) + 1 : Math.ceil(pos - EPS) - 1;
    const toCentre = Math.abs(target - pos);
    const step = Math.min(dist, toCentre);
    const next = step === toCentre ? target : pos + sign * step;
    if (horizontal) m.x = snap(next);
    else m.y = snap(next);
    dist -= step;
    if (m.x < -0.5) m.x += COLS;
    else if (m.x >= COLS - 0.5) m.x -= COLS;
  }
  return teleported;
}
