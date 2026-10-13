/* Small helpers shared by the robots, the bosses and the main game loop. */
import { ROBOT_SPECS } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { COLS, NONE, ROWS } from './maze.ts';
import type { Bullet, BulletKind, Game, ParticleKind, Robot } from './types.ts';

export const TAU = Math.PI * 2;

export function emit(g: Game, type: string, x?: number, y?: number): void {
  g.events.push({ type, x, y });
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function addScore(g: Game, points: number, x?: number, y?: number, color = '#ffffff'): void {
  g.score += points;
  if (g.score > g.hiScore) g.hiScore = g.score;
  while (g.score >= g.nextLife) {
    g.lives++;
    g.nextLife += 30000;
    emit(g, 'life');
    popup(g, g.player.x, g.player.y - 1, '1UP', '#7dff8a', 1.1);
  }
  if (x !== undefined && y !== undefined) popup(g, x, y, String(points), color);
}

export function popup(g: Game, x: number, y: number, text: string, color = '#ffffff', size = 0.8): void {
  g.popups.push({ x, y, text, t: 0, life: 1, color, size });
}

export function particle(g: Game, kind: ParticleKind, x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, drag = 2): void {
  if (g.particles.length > 900) return;
  g.particles.push({ kind, x, y, vx, vy, life, max: life, color, size, rot: g.rng() * TAU, drag });
}

/** An explosion: sparks, a flash and a ring. */
export function burst(g: Game, x: number, y: number, color: string, count = 18, speed = 7, size = 1): void {
  for (let i = 0; i < count; i++) {
    const a = g.rng() * TAU;
    const s = speed * (0.35 + g.rng() * 0.75);
    particle(g, 'spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + g.rng() * 0.35, color, 0.08 * size + g.rng() * 0.06, 3);
  }
  for (let i = 0; i < Math.ceil(count / 4); i++) {
    const a = g.rng() * TAU;
    const s = speed * 0.4 * g.rng();
    particle(g, 'chunk', x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + g.rng() * 0.4, color, 0.12 * size, 2.5);
  }
  particle(g, 'glow', x, y, 0, 0, 0.28, color, 1.1 * size);
  particle(g, 'ring', x, y, 0, 0, 0.35, color, 1.2 * size);
}

export function makeRobot(g: Game, kind: RobotKind, x: number, y: number, dir: number, minion = false): Robot {
  const spec = ROBOT_SPECS[kind];
  const r: Robot = {
    id: g.nextId++,
    kind,
    x,
    y,
    dir,
    portalLock: -1,
    hp: spec.hp,
    maxHp: spec.hp,
    spawnT: 0.7,
    flash: 0,
    frightened: false,
    stun: 0,
    cloakT: g.rng() * 2,
    charge: 0,
    chargeDir: NONE,
    fireCd: g.spec.gunnerCooldown * (0.5 + g.rng()),
    mineCd: 3 + g.rng() * 2,
    corner: g.nextId % 4,
    anim: g.rng() * 10,
    alive: true,
    minion,
  };
  g.robots.push(r);
  return r;
}

export function enemyBullet(g: Game, kind: BulletKind, x: number, y: number, angle: number, speed: number, color: string, walls = false): Bullet {
  const b: Bullet = {
    kind,
    x,
    y,
    dir: NONE,
    portalLock: -1,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: kind === 'ember' ? 0.3 : kind === 'missile' ? 0.24 : kind === 'shard' ? 0.16 : 0.2,
    enemy: true,
    damage: 1,
    pierce: false,
    seeker: false,
    speed,
    life: kind === 'ember' ? 1.6 : kind === 'missile' ? 5.5 : 7,
    walls,
    color,
    hits: [],
    turn: 0,
    dead: false,
  };
  g.bullets.push(b);
  return b;
}

export function ring(g: Game, x: number, y: number, count: number, speed: number, offset: number, color: string): void {
  for (let i = 0; i < count; i++) enemyBullet(g, 'orb', x, y, offset + (i / count) * TAU, speed, color);
}

export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}

export function inBounds(x: number, y: number, margin = 1): boolean {
  return x > -margin && y > -margin && x < COLS - 1 + margin && y < ROWS - 1 + margin;
}
