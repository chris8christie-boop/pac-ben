/*
 * Robot brains. Like Pac-Man's ghosts, each kind picks a target tile in its
 * own way and only decides where to turn at junctions. They take turns
 * scattering to their corners and hunting, and run when Ben is in overdrive.
 */
import { ROBOT_SPECS } from './levels.ts';
import { DX, DY, NONE, advance, canGo, opposite, tileAt, tileIndex, walkable, PATH } from './maze.ts';
import type { Mover, Point } from './maze.ts';
import { TAU, addScore, burst, dist, emit, enemyBullet, makeRobot, particle, popup } from './world.ts';
import type { Game, PowerKind, Robot } from './types.ts';

const PHANTOM_CYCLE = 6.5;

/** 0 fully visible, 1 fully faded. */
export function cloakAmount(r: Robot): number {
  if (r.kind !== 'phantom') return 0;
  const t = r.cloakT % PHANTOM_CYCLE;
  if (t < 3.5) return 0;
  if (t < 4) return (t - 3.5) / 0.5;
  if (t < 6) return 1;
  return 1 - (t - 6) / 0.5;
}

/** Whether a robot can touch Ben or be shot. */
export function solid(r: Robot): boolean {
  return r.alive && r.spawnT <= 0 && cloakAmount(r) < 0.5;
}

function greedy(r: Robot, options: number[], target: Point): number {
  let best = options[0];
  let bestD = Infinity;
  for (const d of options) {
    const nx = r.x + DX[d];
    const ny = r.y + DY[d];
    const dd = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (dd < bestD - 1e-9) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

/** Follows (or flees) the shortest-path map from Ben. */
function byMap(g: Game, r: Robot, options: number[], flee: boolean): number {
  let best = options[0];
  let bestD = flee ? -Infinity : Infinity;
  for (const d of options) {
    const i = tileIndex(r.x + DX[d], r.y + DY[d]);
    let dd = g.distPlayer[i];
    if (dd < 0) dd = 999;
    if (flee ? dd > bestD : dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

function decide(g: Game, r: Robot): number {
  const m = g.maze;
  const options: number[] = [];
  for (let d = 0; d < 4; d++) if (d !== opposite(r.dir) && canGo(m, r.x, r.y, d)) options.push(d);
  if (!options.length) return canGo(m, r.x, r.y, opposite(r.dir)) ? opposite(r.dir) : NONE;
  if (options.length === 1) return options[0];

  if (r.frightened) {
    return g.rng() < 0.3 ? options[Math.floor(g.rng() * options.length)] : byMap(g, r, options, true);
  }
  // A little unpredictability keeps them from bunching up.
  if (g.rng() < 0.07) return options[Math.floor(g.rng() * options.length)];

  const p = g.player;
  const corner = m.corners[r.corner];
  if (g.scatter && !r.minion) return greedy(r, options, corner);

  const facing = p.facing < 0 ? 0 : p.facing;
  const far = dist(r.x, r.y, p.x, p.y) > 8;
  switch (r.kind) {
    case 'ambusher':
    case 'splitter':
      return greedy(r, options, { x: p.x + DX[facing] * 4, y: p.y + DY[facing] * 4 });
    case 'flanker': {
      const partner = g.robots.find((o) => o.alive && o.kind === 'chaser' && o.spawnT <= 0) ?? r;
      const px = p.x + DX[facing] * 2;
      const py = p.y + DY[facing] * 2;
      return greedy(r, options, { x: px * 2 - partner.x, y: py * 2 - partner.y });
    }
    case 'wanderer':
    case 'bomber':
      return far ? byMap(g, r, options, false) : greedy(r, options, corner);
    case 'gunner': {
      const here = g.distPlayer[tileIndex(r.x, r.y)];
      return here >= 0 && here < 5 ? byMap(g, r, options, true) : byMap(g, r, options, false);
    }
    default:
      return byMap(g, r, options, false);
  }
}

/** Clear line of sight along a row or column, without walls in between. */
function lineOfSight(g: Game, ax: number, ay: number, bx: number, by: number): number {
  const rx = Math.round(ax);
  const ry = Math.round(ay);
  const tx = Math.round(bx);
  const ty = Math.round(by);
  let d = NONE;
  if (ry === ty && Math.abs(ay - by) < 0.3) d = tx > rx ? 1 : 3;
  else if (rx === tx && Math.abs(ax - bx) < 0.3) d = ty > ry ? 2 : 0;
  if (d < 0) return NONE;
  const steps = Math.abs(tx - rx) + Math.abs(ty - ry);
  if (steps > 14) return NONE;
  for (let s = 1; s < steps; s++) {
    if (!walkable(g.maze, rx + DX[d] * s, ry + DY[d] * s)) return NONE;
  }
  return d;
}

export function updateRobots(g: Game, dt: number): void {
  const p = g.player;
  for (const r of g.robots) {
    if (!r.alive) continue;
    r.anim += dt;
    if (r.flash > 0) r.flash -= dt;
    if (r.spawnT > 0) {
      r.spawnT -= dt;
      continue;
    }
    if (r.stun > 0) {
      r.stun -= dt;
      if (g.rng() < dt * 8) particle(g, 'spark', r.x + (g.rng() - 0.5) * 0.8, r.y + (g.rng() - 0.5) * 0.8, 0, -1, 0.25, '#7fd8ff', 0.06);
      continue;
    }
    if (r.kind === 'phantom') r.cloakT += dt;

    if (r.kind === 'gunner' && !r.frightened) {
      if (r.charge > 0) {
        r.charge -= dt;
        if (r.charge <= 0) {
          const a = Math.atan2(DY[r.chargeDir], DX[r.chargeDir]);
          enemyBullet(g, 'shard', r.x + DX[r.chargeDir] * 0.4, r.y + DY[r.chargeDir] * 0.4, a, 8.5, '#d4ff6b', true);
          emit(g, 'enemyshot', r.x, r.y);
          r.fireCd = g.spec.gunnerCooldown;
        }
        continue;
      }
      r.fireCd -= dt;
      if (r.fireCd <= 0 && g.state === 'play') {
        const d = lineOfSight(g, r.x, r.y, p.x, p.y);
        if (d >= 0) {
          r.charge = 0.42;
          r.chargeDir = d;
          emit(g, 'charge', r.x, r.y);
          continue;
        }
      }
    }

    if (r.kind === 'bomber' && !r.frightened) {
      r.mineCd -= dt;
      const onTile = Math.abs(r.x - Math.round(r.x)) < 0.15 && Math.abs(r.y - Math.round(r.y)) < 0.15;
      if (r.mineCd <= 0 && onTile && g.mines.length < 8 && dist(r.x, r.y, p.x, p.y) > 3) {
        g.mines.push({ x: Math.round(r.x), y: Math.round(r.y), t: 0, dead: false });
        r.mineCd = 5 + g.rng() * 2;
        emit(g, 'mine', r.x, r.y);
      }
    }

    const spec = ROBOT_SPECS[r.kind];
    let speed = g.spec.robotSpeed * spec.speed;
    if (r.frightened) speed *= 0.55;
    else if (g.boss && r.minion) speed *= 0.9;
    // Robots slow down in the side tunnels, as ghosts do.
    if (r.x < 3 || r.x > 24) {
      if (g.maze.tunnelRows.includes(Math.round(r.y))) speed *= 0.6;
    }
    if (advance(g.maze, r, speed * dt, (m: Mover) => decide(g, m as Robot))) emit(g, 'teleport', r.x, r.y);
    if (r.dir < 0) {
      // Stuck (it can happen after a reversal on a corner): pick any open way.
      for (let d = 0; d < 4; d++) {
        if (canGo(g.maze, r.x, r.y, d)) {
          r.dir = d;
          break;
        }
      }
    }
  }
}

/** Reverses every robot out on the maze, as ghosts do when the mode changes. */
export function reverseAll(g: Game): void {
  for (const r of g.robots) {
    if (!r.alive || r.spawnT > 0 || r.dir < 0) continue;
    const back = opposite(r.dir);
    // Mid-tile, reversing is always possible: you just came from there.
    if (!Number.isInteger(r.x) || !Number.isInteger(r.y) || canGo(g.maze, r.x, r.y, back)) r.dir = back;
  }
}

const DROPS: [PowerKind, number][] = [
  ['rapid', 30],
  ['pierce', 20],
  ['seeker', 20],
  ['shield', 15],
  ['emp', 12],
  ['life', 3],
];

export function killRobot(g: Game, r: Robot, how: 'shot' | 'eaten' | 'boss'): void {
  if (!r.alive) return;
  r.alive = false;
  const spec = ROBOT_SPECS[r.kind];
  burst(g, r.x, r.y, r.frightened ? '#4a6bff' : spec.color, 22, 8, spec.size);
  g.shake = Math.max(g.shake, 0.12);
  emit(g, how === 'eaten' ? 'eat' : 'kill', r.x, r.y);
  if (how === 'boss') return;

  if (how === 'eaten') {
    const points = 200 * 2 ** Math.min(g.chain, 3);
    g.chain++;
    addScore(g, points, r.x, r.y, '#7fb8ff');
  } else {
    g.combo = g.comboT > 0 ? g.combo + 1 : 1;
    g.comboT = 1.6;
    const mult = Math.min(g.combo, 8);
    addScore(g, spec.points * mult, r.x, r.y, mult > 1 ? '#ffd23f' : '#ffffff');
    if (mult > 1) popup(g, r.x, r.y - 0.9, `x${mult}`, '#ffd23f', 0.6);
  }

  if (r.kind === 'splitter') {
    for (const d of [r.dir < 0 ? 1 : r.dir, opposite(r.dir < 0 ? 1 : r.dir)]) {
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      const m = makeRobot(g, 'mini', x, y, canGo(g.maze, x, y, d) ? d : NONE, r.minion);
      m.spawnT = 0.25;
    }
  }

  if (!r.minion && r.kind !== 'mini' && g.rng() < 0.11) {
    let total = 0;
    for (const [, w] of DROPS) total += w;
    let roll = g.rng() * total;
    let kind: PowerKind = 'rapid';
    for (const [k, w] of DROPS) {
      roll -= w;
      if (roll < 0) {
        kind = k;
        break;
      }
    }
    const x = Math.round(r.x);
    const y = Math.round(r.y);
    if (tileAt(g.maze, x, y) === PATH) g.pickups.push({ x, y, kind, t: 0, life: 9, points: 0 });
  }
}

/** Shots, flashes and armour plates: a hit that doesn't destroy. */
export function damageRobot(g: Game, r: Robot, damage: number): void {
  if (r.frightened || r.stun > 0) damage = r.hp;
  r.hp -= damage;
  r.flash = 0.09;
  if (r.hp <= 0) killRobot(g, r, 'shot');
  else {
    emit(g, 'clank', r.x, r.y);
    for (let i = 0; i < 6; i++) {
      const a = g.rng() * TAU;
      particle(g, 'spark', r.x, r.y, Math.cos(a) * 5, Math.sin(a) * 5, 0.2, '#ffffff', 0.06);
    }
  }
}
