/*
 * The six bosses. Each one hovers over the maze and gets a new trick when it
 * is badly hurt. Their energy shots fly over walls; their lasers are always
 * flagged before they fire.
 */
import { BOSS_SPECS } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { COLS, PATH, ROWS, nearestWalkable, tileAt } from './maze.ts';
import type { Point } from './maze.ts';
import { killRobot } from './robots.ts';
import { TAU, addScore, angleTo, burst, clamp, dist, emit, enemyBullet, makeRobot, particle, popup, ring } from './world.ts';
import type { Boss, Bullet, Game, Laser } from './types.ts';

const PHASE_LINES: Record<string, string[]> = {
  boltz: ['', 'OVERCHARGED!'],
  magnetron: ['', 'POLARITY REVERSED!'],
  shredder: ['', 'BLADES SHARPENED!', 'MAXIMUM RPM!'],
  hydra: ['', 'SHIELDS DOUBLED!'],
  glitch: ['', 'SYSTEM CORRUPTED!'],
  omega: ['', 'PHASE 2: FURY', 'PHASE 3: OVERLOAD'],
};

export function createBoss(g: Game): Boss {
  const kind = g.spec.boss ?? 'boltz';
  const spec = BOSS_SPECS[kind];
  const c = g.maze.center;
  return {
    kind,
    x: c.x,
    y: c.y,
    vx: 0,
    vy: 0,
    r: spec.radius,
    hp: Math.round(spec.hp * g.spec.bossHp),
    maxHp: Math.round(spec.hp * g.spec.bossHp),
    phase: 1,
    mode: 'enter',
    modeT: 0,
    t: 0,
    angle: 0,
    spin: 1,
    flash: 0,
    alpha: 1,
    dying: 0,
    dead: false,
    aim: Math.PI / 2,
    counter: 0,
    dashLeft: 1,
    dashDist: 0,
    trailT: 0,
    spiral: 0,
    fireT: 1,
    target: { x: c.x, y: c.y },
    home: { x: c.x, y: c.y },
    drones: kind === 'hydra' ? makeDrones(4) : [],
    clones: [],
    guarded: false,
  };
}

/** After Ben loses a life the boss goes back to the middle and waits a moment. */
export function resetBoss(g: Game): void {
  const b = g.boss;
  if (!b || b.dying > 0) return;
  b.x = b.home.x;
  b.y = b.home.y;
  b.vx = b.vy = 0;
  b.alpha = 1;
  b.clones = [];
  b.guarded = false;
  setMode(b, 'enter');
}

function makeDrones(n: number) {
  return Array.from({ length: n }, (_, i) => ({ angle: (i / n) * TAU, x: 0, y: 0, hp: 5, flash: 0, fireCd: 1.6 + i * 0.5, alive: true }));
}

function setMode(b: Boss, mode: string): void {
  b.mode = mode;
  b.modeT = 0;
}

function phaseFor(b: Boss): number {
  const f = b.hp / b.maxHp;
  if (b.kind === 'shredder') return f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
  if (b.kind === 'omega') return f > 0.66 ? 1 : f > 0.33 ? 2 : 3;
  return f > 0.5 ? 1 : 2;
}

function bounds(b: Boss) {
  return { minX: b.r - 0.3, maxX: COLS - 1 - b.r + 0.3, minY: b.r - 0.3, maxY: ROWS - 1 - b.r + 0.3 };
}

function keepInside(b: Boss): boolean {
  const { minX, maxX, minY, maxY } = bounds(b);
  const x = clamp(b.x, minX, maxX);
  const y = clamp(b.y, minY, maxY);
  const hit = x !== b.x || y !== b.y;
  b.x = x;
  b.y = y;
  return hit;
}

function steer(b: Boss, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  const s = d > 0.01 ? Math.min(speed, d * 2.5) / d : 0;
  const k = Math.min(1, dt * 3);
  b.vx += (dx * s - b.vx) * k;
  b.vy += (dy * s - b.vy) * k;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  keepInside(b);
}

/** A spot `want` tiles from Ben, on the boss's side, drifting round him. */
function standoff(b: Boss, p: Point, want: number): Point {
  const d = dist(b.x, b.y, p.x, p.y);
  const a = (d < 0.01 ? -Math.PI / 2 : Math.atan2(b.y - p.y, b.x - p.x)) + Math.sin(b.t * 0.7) * 0.6;
  return { x: p.x + Math.cos(a) * want, y: p.y + Math.sin(a) * want };
}

function minions(g: Game): number {
  let n = 0;
  for (const r of g.robots) if (r.alive && r.minion) n++;
  return n;
}

function summon(g: Game, b: Boss, kind: RobotKind, count: number, cap = 4): void {
  for (let i = 0; i < count && minions(g) < cap; i++) {
    const a = g.rng() * TAU;
    const spot = nearestWalkable(g.maze, b.x + Math.cos(a) * 2, b.y + Math.sin(a) * 2);
    const r = makeRobot(g, kind, spot.x, spot.y, Math.floor(g.rng() * 4), true);
    r.dir = -1;
    r.spawnT = 0.8;
    for (let k = 0; k < 8; k++) {
      const t = k / 8;
      particle(g, 'glow', b.x + (spot.x - b.x) * t, b.y + (spot.y - b.y) * t, 0, 0, 0.3 + t * 0.3, BOSS_SPECS[b.kind].color, 0.35);
    }
  }
  emit(g, 'summon', b.x, b.y);
}

function randomSpot(g: Game, b: Boss, awayFrom: Point, minDist: number): Point {
  const { minX, maxX, minY, maxY } = bounds(b);
  let best: Point = { x: b.home.x, y: b.home.y };
  let bestD = -1;
  for (let i = 0; i < 30; i++) {
    const x = minX + 1 + g.rng() * (maxX - minX - 2);
    const y = minY + 1 + g.rng() * (maxY - minY - 2);
    const d = dist(x, y, awayFrom.x, awayFrom.y);
    if (d >= minDist && dist(x, y, b.x, b.y) > 4) return { x, y };
    if (d > bestD) {
      bestD = d;
      best = { x, y };
    }
  }
  return best;
}

function clearEnemyFire(g: Game): void {
  for (const bl of g.bullets) if (bl.enemy) bl.dead = true;
  g.lasers = [];
}

function aimed(g: Game, b: Boss, count: number, spread: number, speed: number, color: string): void {
  for (let i = 0; i < count; i++) enemyBullet(g, 'orb', b.x, b.y, b.aim + (i - (count - 1) / 2) * spread, speed, color);
  emit(g, 'zap', b.x, b.y);
}

function spiralStep(g: Game, b: Boss, dt: number, arms: number, every: number, turn: number, speed: number, color: string): void {
  b.fireT -= dt;
  while (b.fireT <= 0) {
    b.fireT += every;
    for (let k = 0; k < arms; k++) enemyBullet(g, 'orb', b.x, b.y, b.spiral + (k / arms) * TAU, speed, color);
    b.spiral += turn;
  }
}

function laserLine(g: Game, kind: 'row' | 'col', pos: number, warn: number, on: number, color: string): void {
  g.lasers.push({ kind, pos, angle: 0, spin: 0, length: 0, warn, on, t: 0, color });
}

/** Beams across rows and columns: at least one through Ben, the rest scattered. */
function planLasers(g: Game, count: number, cross: boolean, warn: number, color: string): void {
  const p = g.player;
  const rows: number[] = [];
  const cols: number[] = [];
  const throughRow = cross || g.rng() < 0.5;
  if (throughRow) rows.push(Math.round(p.y));
  if (cross || !throughRow) cols.push(Math.round(p.x));
  let guard = 0;
  while (rows.length + cols.length < count && guard++ < 50) {
    const useRow = g.rng() < 0.5;
    const list = useRow ? rows : cols;
    const max = useRow ? ROWS - 2 : COLS - 2;
    const pos = 1 + Math.floor(g.rng() * max);
    if (list.every((q) => Math.abs(q - pos) >= 3)) list.push(pos);
  }
  for (const r of rows) laserLine(g, 'row', r, warn, 0.55, color);
  for (const c of cols) laserLine(g, 'col', c, warn, 0.55, color);
  emit(g, 'laserwarn');
}

/* Charging attack shared by Shredder and Omega: lock on, dash, slam. */
function dashTrack(g: Game, b: Boss, dt: number, aimTime: number): boolean {
  const p = g.player;
  b.spin = 7;
  b.fireT = aimTime;
  steer(b, p.x, p.y, 1.6, dt);
  if (b.modeT < aimTime - 0.3) b.aim = angleTo(b.x, b.y, p.x, p.y);
  if (b.modeT >= aimTime) {
    b.dashDist = 0;
    b.trailT = 0;
    emit(g, 'dash', b.x, b.y);
    return true;
  }
  return false;
}

function dashMove(g: Game, b: Boss, dt: number, speed: number, emberLife: number, shrapnel: number, color: string): boolean {
  b.spin = 24;
  b.vx = Math.cos(b.aim) * speed;
  b.vy = Math.sin(b.aim) * speed;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.dashDist += speed * dt;
  b.trailT -= dt;
  if (b.trailT <= 0) {
    b.trailT = 0.04;
    const tx = Math.round(b.x);
    const ty = Math.round(b.y);
    if (tileAt(g.maze, tx, ty) === PATH) {
      const e = enemyBullet(g, 'ember', b.x + (g.rng() - 0.5) * 0.4, b.y + (g.rng() - 0.5) * 0.4, 0, 0, '#ff9a3a');
      e.life = emberLife;
    }
  }
  const hitWall = keepInside(b);
  if (hitWall || b.dashDist > 30) {
    b.vx = b.vy = 0;
    g.shake = Math.max(g.shake, 0.55);
    emit(g, 'slam', b.x, b.y);
    ring(g, b.x, b.y, shrapnel, 5, g.rng() * TAU, color);
    burst(g, b.x, b.y, color, 24, 9, 1.4);
    return true;
  }
  return false;
}

export function updateBoss(g: Game, dt: number): void {
  const b = g.boss;
  if (!b || b.dead) return;
  b.t += dt;
  b.modeT += dt;
  if (b.flash > 0) b.flash -= dt;
  b.angle += b.spin * dt;
  for (const d of b.drones) if (d.flash > 0) d.flash -= dt;

  if (b.dying > 0) {
    b.dying += dt;
    b.spin = 10;
    const length = b.kind === 'omega' ? 4 : 2.6;
    if (g.rng() < dt * 14) {
      const a = g.rng() * TAU;
      const r = g.rng() * b.r * 1.2;
      burst(g, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, g.rng() < 0.5 ? '#ffffff' : BOSS_SPECS[b.kind].color, 14, 7, 0.9);
      emit(g, 'pop', b.x, b.y);
      g.shake = Math.max(g.shake, 0.35);
    }
    if (b.dying >= length) {
      b.dead = true;
      burst(g, b.x, b.y, '#ffffff', 60, 14, 3);
      burst(g, b.x, b.y, BOSS_SPECS[b.kind].color, 60, 10, 3);
      g.flash = 0.6;
      g.flashColor = '#ffffff';
      g.shake = 1.2;
      emit(g, 'boom', b.x, b.y);
    }
    return;
  }

  if (b.mode === 'enter') {
    b.spin = 1;
    steer(b, b.home.x, b.home.y, 3, dt);
    if (b.modeT > 1) setMode(b, firstMode(g, b));
    return;
  }
  if (b.mode === 'transform') {
    b.guarded = true;
    b.spin = 12;
    b.vx *= 0.9;
    b.vy *= 0.9;
    if (g.rng() < dt * 20) particle(g, 'spark', b.x, b.y, (g.rng() - 0.5) * 12, (g.rng() - 0.5) * 12, 0.4, BOSS_SPECS[b.kind].color, 0.1);
    if (b.modeT > 1.3) {
      b.guarded = false;
      afterTransform(g, b);
    }
    return;
  }

  switch (b.kind) {
    case 'boltz':
      boltz(g, b, dt);
      break;
    case 'magnetron':
      magnetron(g, b, dt);
      break;
    case 'shredder':
      shredder(g, b, dt);
      break;
    case 'hydra':
      hydra(g, b, dt);
      break;
    case 'glitch':
      glitch(g, b, dt);
      break;
    case 'omega':
      omega(g, b, dt);
      break;
  }
}

function firstMode(g: Game, b: Boss): string {
  switch (b.kind) {
    case 'magnetron':
      return 'spin';
    case 'shredder':
      b.dashLeft = b.phase;
      return 'track';
    case 'hydra':
      return b.drones.some((d) => d.alive) ? 'shielded' : 'exposed';
    case 'glitch':
      spawnClones(g, b);
      return 'clone';
    default:
      return 'move';
  }
}

function afterTransform(g: Game, b: Boss): void {
  switch (b.kind) {
    case 'boltz':
      summon(g, b, 'chaser', 2);
      setMode(b, 'move');
      break;
    case 'hydra':
      b.drones = makeDrones(6);
      emit(g, 'shieldup', b.x, b.y);
      setMode(b, 'shielded');
      break;
    case 'glitch':
      setMode(b, 'lasers');
      planLasers(g, 4, true, 1.05, '#3ff5ff');
      break;
    case 'omega':
      if (b.phase === 3) {
        for (const r of g.robots) if (r.alive) killRobot(g, r, 'boss');
        setMode(b, 'overload');
        startOverload(g, b);
      } else setMode(b, 'move');
      break;
    default:
      setMode(b, firstMode(g, b));
  }
}

/* 1. BOLTZ: rings of sparks and an aimed zap every third attack. */
function boltz(g: Game, b: Boss, dt: number): void {
  const p = g.player;
  const fast = b.phase >= 2;
  const color = '#ff8a2a';
  switch (b.mode) {
    case 'move': {
      b.spin = fast ? 2.6 : 1.4;
      const t = standoff(b, p, 5.5);
      steer(b, t.x, t.y, fast ? 3.1 : 2.3, dt);
      if (b.modeT > (fast ? 1.25 : 1.9)) {
        b.counter++;
        if (b.counter % 3 === 0) {
          setMode(b, 'charge');
          emit(g, 'charge', b.x, b.y);
        } else {
          ring(g, b.x, b.y, fast ? 14 : 10, fast ? 4.7 : 4, b.counter * 0.31, color);
          emit(g, 'zap', b.x, b.y);
          setMode(b, fast ? 'ring2' : 'move');
        }
      }
      break;
    }
    case 'ring2':
      if (b.modeT > 0.3) {
        ring(g, b.x, b.y, 14, 4.7, b.counter * 0.31 + Math.PI / 14, color);
        emit(g, 'zap', b.x, b.y);
        setMode(b, 'move');
      }
      break;
    case 'charge':
      b.spin = 6;
      b.vx *= 0.9;
      b.vy *= 0.9;
      if (b.modeT < 0.6) b.aim = angleTo(b.x, b.y, p.x, p.y);
      if (b.modeT > 0.85) {
        aimed(g, b, fast ? 5 : 3, 0.17, 7.5, '#ff5a3a');
        setMode(b, 'move');
      }
      break;
    default:
      setMode(b, 'move');
  }
}

/* 2. MAGNETRON: spiral streams, then it vanishes and warps across the maze, summoning help. */
function magnetron(g: Game, b: Boss, dt: number): void {
  const p = g.player;
  const fast = b.phase >= 2;
  const color = '#d77bff';
  switch (b.mode) {
    case 'spin': {
      b.alpha = 1;
      b.guarded = false;
      b.spin = 3;
      const t = standoff(b, p, 6.5);
      steer(b, t.x, t.y, 1.4, dt);
      spiralStep(g, b, dt, fast ? 3 : 2, fast ? 0.15 : 0.13, fast ? 0.3 : 0.37, 3.6, color);
      if (b.modeT > (fast ? 1.5 : 1.9)) {
        setMode(b, 'vanish');
        emit(g, 'warp', b.x, b.y);
      }
      break;
    }
    case 'vanish':
      b.guarded = true;
      b.alpha = Math.max(0, 1 - b.modeT / 0.45);
      if (b.modeT > 0.45) {
        b.target = randomSpot(g, b, p, 7);
        setMode(b, 'warp');
      }
      break;
    case 'warp':
      b.alpha = 0;
      if (b.modeT > (fast ? 0.6 : 0.8)) {
        b.x = b.target.x;
        b.y = b.target.y;
        b.vx = b.vy = 0;
        b.counter++;
        ring(g, b.x, b.y, fast ? 12 : 8, 4.2, g.rng() * TAU, color);
        burst(g, b.x, b.y, color, 20, 8, 1.3);
        emit(g, 'appear', b.x, b.y);
        if (b.counter % 2 === 0) summon(g, b, fast ? 'mini' : 'chaser', 2);
        setMode(b, 'appear');
      }
      break;
    case 'appear':
      b.alpha = Math.min(1, b.modeT / 0.3);
      if (b.modeT > 0.3) setMode(b, 'spin');
      break;
    default:
      setMode(b, 'spin');
  }
}

/* 3. SHREDDER: locks on, charges in a straight line leaving burning embers, and bursts into shrapnel. */
function shredder(g: Game, b: Boss, dt: number): void {
  const aimTime = b.phase === 3 ? 0.75 : b.phase === 2 ? 0.95 : 1.2;
  switch (b.mode) {
    case 'track':
      if (dashTrack(g, b, dt, aimTime)) setMode(b, 'dash');
      break;
    case 'dash':
      if (dashMove(g, b, dt, b.phase === 3 ? 18 : 15.5, b.phase >= 2 ? 2.1 : 1.5, 8 + b.phase * 2, '#ffb15a')) {
        b.dashLeft--;
        if (b.dashLeft > 0) {
          setMode(b, 'track');
          b.modeT = Math.max(0, aimTime - 0.6);
        } else setMode(b, 'recover');
      }
      break;
    case 'recover': {
      b.spin = Math.max(3, b.spin - dt * 20);
      const t = standoff(b, g.player, 7);
      steer(b, t.x, t.y, 2, dt);
      if (b.modeT > (b.phase === 3 ? 0.7 : 1.1)) {
        b.dashLeft = b.phase;
        setMode(b, 'track');
      }
      break;
    }
    default:
      setMode(b, 'track');
  }
}

/* 4. HYDRA-CORE: drones shield the core. Break them all to open a window. */
function hydra(g: Game, b: Boss, dt: number): void {
  const p = g.player;
  const fast = b.phase >= 2;
  const radius = fast ? 2.7 + Math.sin(b.t * 1.4) * 0.8 : 2.9;
  const omega = fast ? 1.7 : 1.1;
  for (const d of b.drones) {
    d.angle += omega * dt;
    d.x = b.x + Math.cos(d.angle) * radius;
    d.y = b.y + Math.sin(d.angle) * radius;
    if (!d.alive) continue;
    d.fireCd -= dt;
    if (d.fireCd <= 0) {
      d.fireCd = fast ? 2.3 : 2.9;
      enemyBullet(g, 'orb', d.x, d.y, angleTo(d.x, d.y, p.x, p.y), 4.6, '#7dffc8');
      emit(g, 'enemyshot', d.x, d.y);
    }
  }
  const shielded = b.drones.some((d) => d.alive);
  switch (b.mode) {
    case 'shielded': {
      b.guarded = shielded;
      b.spin = 1.2;
      const t = standoff(b, p, 5.5);
      steer(b, t.x, t.y, 1.5, dt);
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = fast ? 2.6 : 3.2;
        for (let k = 0; k < 6; k++) {
          for (const s of [3.2, 3.9, 4.6]) enemyBullet(g, 'orb', b.x, b.y, b.spiral + (k / 6) * TAU, s, '#34f5a0');
        }
        b.spiral += 0.5;
        emit(g, 'zap', b.x, b.y);
      }
      if (fast) {
        b.trailT -= dt;
        if (b.trailT <= 0) {
          b.trailT = 4.2;
          const a = angleTo(b.x, b.y, p.x, p.y);
          for (const off of [-0.9, 0.9]) {
            const m = enemyBullet(g, 'missile', b.x, b.y, a + off, 3.3, '#ff5a7a');
            m.turn = 1.6;
          }
          emit(g, 'missile', b.x, b.y);
        }
      }
      if (!shielded) {
        setMode(b, 'exposed');
        b.guarded = false;
        popup(g, b.x, b.y - b.r - 0.6, 'CORE EXPOSED!', '#7dffc8', 0.8);
        emit(g, 'shielddown', b.x, b.y);
      }
      break;
    }
    case 'exposed':
      b.guarded = false;
      b.spin = 5;
      b.vx *= 0.95;
      b.vy *= 0.95;
      spiralStep(g, b, dt, 1, 0.12, 0.5, 3.3, '#34f5a0');
      if (b.modeT > (fast ? 5.5 : 7)) {
        b.drones = makeDrones(fast ? 6 : 4);
        emit(g, 'shieldup', b.x, b.y);
        setMode(b, 'shielded');
      }
      break;
    default:
      setMode(b, shielded ? 'shielded' : 'exposed');
  }
}

/* 5. GLITCH KING: decoys that burst when shot, and laser grids. */
function spawnClones(g: Game, b: Boss): void {
  const n = b.phase >= 2 ? 4 : 3;
  const spots: Point[] = [];
  for (let i = 0; i <= n; i++) {
    let s = randomSpot(g, b, g.player, 6);
    for (let k = 0; k < 10 && spots.some((q) => dist(q.x, q.y, s.x, s.y) < 4); k++) s = randomSpot(g, b, g.player, 6);
    spots.push(s);
  }
  const real = Math.floor(g.rng() * spots.length);
  b.x = spots[real].x;
  b.y = spots[real].y;
  b.vx = b.vy = 0;
  b.clones = spots
    .filter((_, i) => i !== real)
    .map((s) => ({ x: s.x, y: s.y, vx: 0, vy: 0, hp: 1, alive: true, fireCd: 1 + g.rng() * 1.5 }));
  for (const s of spots) burst(g, s.x, s.y, '#3ff5ff', 12, 6, 1);
  g.glitch = Math.max(g.glitch, 0.35);
  emit(g, 'glitch', b.x, b.y);
}

function glitch(g: Game, b: Boss, dt: number): void {
  const p = g.player;
  const fast = b.phase >= 2;
  const color = '#7ff9ff';
  switch (b.mode) {
    case 'clone': {
      b.guarded = false;
      b.alpha = 1;
      b.spin = 1.5;
      const t = standoff(b, p, 6);
      steer(b, t.x + Math.sin(b.t * 3) * 1.5, t.y + Math.cos(b.t * 2.3) * 1.5, 1.8, dt);
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = 1.9 + g.rng() * 0.6;
        const a = angleTo(b.x, b.y, p.x, p.y);
        enemyBullet(g, 'orb', b.x, b.y, a, 5, color);
        if (fast) {
          enemyBullet(g, 'orb', b.x, b.y, a - 0.25, 5, color);
          enemyBullet(g, 'orb', b.x, b.y, a + 0.25, 5, color);
        }
        emit(g, 'zap', b.x, b.y);
      }
      for (const c of b.clones) {
        if (!c.alive) continue;
        const a = angleTo(c.x, c.y, p.x, p.y) + Math.PI + Math.sin(b.t + c.fireCd) * 0.8;
        const tx = clamp(p.x + Math.cos(a) * 6, 2, COLS - 3);
        const ty = clamp(p.y + Math.sin(a) * 6, 2, ROWS - 3);
        const k = Math.min(1, dt * 2);
        c.vx += ((tx - c.x) * 0.8 - c.vx) * k;
        c.vy += ((ty - c.y) * 0.8 - c.vy) * k;
        c.x = clamp(c.x + c.vx * dt, 1, COLS - 2);
        c.y = clamp(c.y + c.vy * dt, 1, ROWS - 2);
        c.fireCd -= dt;
        if (c.fireCd <= 0) {
          c.fireCd = 2 + g.rng() * 0.8;
          enemyBullet(g, 'orb', c.x, c.y, angleTo(c.x, c.y, p.x, p.y), 5, color);
        }
      }
      const clonesLeft = b.clones.some((c) => c.alive);
      if (b.modeT > 6.5 || !clonesLeft) {
        for (const c of b.clones) if (c.alive) burst(g, c.x, c.y, '#3ff5ff', 10, 5, 0.8);
        b.clones = [];
        g.glitch = Math.max(g.glitch, 0.3);
        setMode(b, 'lasers');
        planLasers(g, fast ? 5 : 3, fast, fast ? 0.95 : 1.1, '#3ff5ff');
      }
      break;
    }
    case 'lasers':
      b.spin = 4;
      b.vx *= 0.9;
      b.vy *= 0.9;
      if (b.modeT > (fast ? 0.95 : 1.1) + 0.55 + 0.35) setMode(b, 'glitchstep');
      break;
    case 'glitchstep':
      b.guarded = true;
      b.alpha = g.rng() < 0.5 ? 0.2 : 1;
      if (b.modeT > 0.5) {
        b.alpha = 1;
        b.guarded = false;
        spawnClones(g, b);
        setMode(b, 'clone');
      }
      break;
    default:
      setMode(b, 'clone');
  }
}

/* 6. OMEGA: every trick so far, then a sweep of turning lasers. */
const OMEGA_ONE = ['ring', 'summon', 'burst', 'spiral', 'ring', 'burst'];
const OMEGA_TWO = ['dash', 'lasers', 'spiral', 'dash', 'ring', 'burst'];

function startOverload(g: Game, b: Boss): void {
  const spin = b.counter % 2 === 0 ? 0.55 : -0.55;
  b.counter++;
  const base = g.rng() * TAU;
  for (let k = 0; k < 4; k++) {
    const l: Laser = { kind: 'ray', pos: 0, angle: base + (k / 4) * TAU, spin, length: 10, warn: 1.5, on: 6, t: 0, color: '#ff3355' };
    g.lasers.push(l);
  }
  b.fireT = 1.4;
  emit(g, 'laserwarn');
}

function omega(g: Game, b: Boss, dt: number): void {
  const p = g.player;
  const color = '#ff6680';
  const list = b.phase === 1 ? OMEGA_ONE : OMEGA_TWO;
  switch (b.mode) {
    case 'move': {
      b.spin = 1.2 + b.phase;
      const t = standoff(b, p, 6.5);
      steer(b, t.x, t.y, b.phase === 1 ? 2.6 : 3.2, dt);
      if (b.modeT > (b.phase === 1 ? 1.3 : 1.0)) {
        const next = list[b.counter % list.length];
        b.counter++;
        if (next === 'dash') b.dashLeft = 2;
        if (next === 'lasers') planLasers(g, 4, true, 1.05, '#ff3355');
        if (next === 'burst') emit(g, 'charge', b.x, b.y);
        setMode(b, next);
      }
      break;
    }
    case 'ring':
      ring(g, b.x, b.y, 16, 4.3, b.counter * 0.2, color);
      emit(g, 'zap', b.x, b.y);
      setMode(b, b.phase >= 2 ? 'ring2' : 'move');
      break;
    case 'ring2':
      if (b.modeT > 0.3) {
        ring(g, b.x, b.y, 16, 4.3, b.counter * 0.2 + Math.PI / 16, color);
        setMode(b, 'move');
      }
      break;
    case 'summon':
      summon(g, b, g.rng() < 0.5 ? 'chaser' : 'tank', 2);
      setMode(b, 'move');
      break;
    case 'burst':
      b.vx *= 0.9;
      b.vy *= 0.9;
      if (b.modeT < 0.35) b.aim = angleTo(b.x, b.y, p.x, p.y);
      if (b.modeT > 0.55) {
        aimed(g, b, 5, 0.15, 7.2, '#ffb3c0');
        setMode(b, 'move');
      }
      break;
    case 'spiral':
      b.spin = 5;
      spiralStep(g, b, dt, b.phase >= 2 ? 3 : 2, 0.12, 0.3, 3.8, color);
      if (b.modeT > 1.6) setMode(b, 'move');
      break;
    case 'dash':
      if (dashTrack(g, b, dt, 0.9)) setMode(b, 'odash');
      break;
    case 'odash':
      if (dashMove(g, b, dt, 16, 1.8, 12, color)) {
        b.dashLeft--;
        if (b.dashLeft > 0) {
          setMode(b, 'dash');
          b.modeT = 0.3;
        } else setMode(b, 'move');
      }
      break;
    case 'lasers':
      b.vx *= 0.9;
      b.vy *= 0.9;
      if (b.modeT > 1.05 + 0.55 + 0.3) setMode(b, 'move');
      break;
    case 'overload': {
      b.spin = 3;
      steer(b, p.x, p.y, 1.1, dt);
      b.fireT -= dt;
      if (b.fireT <= 0) {
        b.fireT = 1.4;
        ring(g, b.x, b.y, 10, 3.6, g.rng() * TAU, color);
        emit(g, 'zap', b.x, b.y);
      }
      if (!g.lasers.some((l) => l.kind === 'ray')) {
        setMode(b, 'vent');
        emit(g, 'vent', b.x, b.y);
        popup(g, b.x, b.y - b.r - 0.6, 'VENTING!', '#ffffff', 0.8);
      }
      break;
    }
    case 'vent':
      b.spin = 0.5;
      b.vx *= 0.92;
      b.vy *= 0.92;
      if (g.rng() < dt * 30) particle(g, 'glow', b.x + (g.rng() - 0.5) * 2, b.y + (g.rng() - 0.5) * 2, 0, -2, 0.6, '#ffffff', 0.3);
      if (b.modeT > 2.4) {
        setMode(b, 'overload');
        startOverload(g, b);
      }
      break;
    default:
      setMode(b, 'move');
  }
}

/** Takes damage, changes phase, or dies. */
export function damageBoss(g: Game, amount: number): void {
  const b = g.boss;
  if (!b || b.dying > 0 || b.dead) return;
  if (b.kind === 'omega' && b.mode === 'vent') amount *= 2;
  b.hp -= amount;
  b.flash = 0.08;
  addScore(g, 10 * amount);
  emit(g, 'bosshit', b.x, b.y);
  if (b.hp <= 0) {
    b.hp = 0;
    b.dying = 1e-4;
    b.guarded = true;
    b.clones = [];
    for (const r of g.robots) if (r.alive) killRobot(g, r, 'boss');
    clearEnemyFire(g);
    const spec = BOSS_SPECS[b.kind];
    addScore(g, spec.points, b.x, b.y - b.r - 0.5, spec.color);
    emit(g, 'bossdie', b.x, b.y);
    g.shake = 0.8;
    return;
  }
  const phase = phaseFor(b);
  if (phase > b.phase) {
    b.phase = phase;
    clearEnemyFire(g);
    g.flash = 0.35;
    g.flashColor = BOSS_SPECS[b.kind].color;
    g.shake = 0.7;
    if (b.kind === 'glitch') g.glitch = 1.2;
    g.banner = { text: PHASE_LINES[b.kind][phase - 1] ?? 'PHASE ' + phase, sub: BOSS_SPECS[b.kind].name, t: 0, life: 1.8, color: BOSS_SPECS[b.kind].color };
    emit(g, 'roar', b.x, b.y);
    setMode(b, 'transform');
  }
}

/** Ben's shot against the boss, its drones and its decoys. Returns true if the shot is used up. */
export function bossTakesShot(g: Game, s: Bullet): boolean {
  const b = g.boss;
  if (!b || b.dead || b.dying > 0) return false;
  for (const d of b.drones) {
    if (!d.alive || dist(s.x, s.y, d.x, d.y) > 0.62) continue;
    d.hp -= s.damage;
    d.flash = 0.08;
    if (d.hp <= 0) {
      d.alive = false;
      burst(g, d.x, d.y, '#7dffc8', 16, 7, 0.8);
      addScore(g, 250, d.x, d.y, '#7dffc8');
      emit(g, 'kill', d.x, d.y);
    } else emit(g, 'clank', d.x, d.y);
    return true;
  }
  for (const c of b.clones) {
    if (!c.alive || dist(s.x, s.y, c.x, c.y) > b.r * 0.85) continue;
    c.alive = false;
    burst(g, c.x, c.y, '#3ff5ff', 18, 7, 1.1);
    ring(g, c.x, c.y, 6, 3.4, g.rng() * TAU, '#7ff9ff');
    addScore(g, 100, c.x, c.y, '#7ff9ff');
    popup(g, c.x, c.y - 1, 'FAKE!', '#7ff9ff', 0.6);
    emit(g, 'pop', c.x, c.y);
    return true;
  }
  if (b.alpha < 0.5 || dist(s.x, s.y, b.x, b.y) > b.r + 0.1) return false;
  if (b.guarded) {
    for (let i = 0; i < 5; i++) {
      const a = angleTo(b.x, b.y, s.x, s.y) + (g.rng() - 0.5) * 1.2;
      particle(g, 'spark', s.x, s.y, Math.cos(a) * 6, Math.sin(a) * 6, 0.2, '#ffffff', 0.06);
    }
    emit(g, 'clink', s.x, s.y);
    return true;
  }
  for (let i = 0; i < 4; i++) {
    const a = g.rng() * TAU;
    particle(g, 'spark', s.x, s.y, Math.cos(a) * 5, Math.sin(a) * 5, 0.2, BOSS_SPECS[b.kind].color, 0.07);
  }
  damageBoss(g, s.damage);
  return true;
}

/** Whether the boss's body can hurt Ben right now. */
export function bossSolid(b: Boss): boolean {
  return !b.dead && b.dying <= 0 && b.alpha > 0.5 && b.mode !== 'enter';
}
