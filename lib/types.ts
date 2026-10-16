import type { BossKind, Difficulty, LevelSpec, RobotKind } from './levels.ts';
import type { Maze, Mover, Point } from './maze.ts';
import type { Rng } from './rng.ts';

export type GameState = 'title' | 'intro' | 'play' | 'dying' | 'clear' | 'gameover' | 'victory';

export type PowerKind = 'rapid' | 'pierce' | 'seeker' | 'shield' | 'emp' | 'life';

/** What the player is pressing this frame. Edge flags are true for one update only. */
export interface Controls {
  /** The direction being held, or -1. */
  dir: number;
  fire: boolean;
  start: boolean;
  pause: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  /** A tap on a title-menu row (from `titleRows`), or -1. */
  menuRow: number;
}

/** A run in progress, as saved between sittings. */
export interface SavedRun {
  level: number;
  score: number;
  lives: number;
  difficulty: Difficulty;
}

export interface Player extends Mover {
  facing: number;
  desired: number;
  fireCd: number;
  invuln: number;
  shield: boolean;
  power: PowerKind | null;
  powerT: number;
  powerMax: number;
  overdrive: number;
  overdriveMax: number;
  mouth: number;
  moving: boolean;
  muzzle: number;
}

export interface Robot extends Mover {
  id: number;
  kind: RobotKind;
  hp: number;
  maxHp: number;
  /** Counts down while the robot materialises; it can't move, hurt or be hurt. */
  spawnT: number;
  flash: number;
  frightened: boolean;
  stun: number;
  cloakT: number;
  /** Gunners pause and glow before they fire. */
  charge: number;
  chargeDir: number;
  fireCd: number;
  mineCd: number;
  corner: number;
  anim: number;
  alive: boolean;
  /** Summoned by a boss; doesn't count towards the level. */
  minion: boolean;
}

export type BulletKind = 'shot' | 'orb' | 'ember' | 'missile' | 'shard';

export interface Bullet extends Mover {
  kind: BulletKind;
  vx: number;
  vy: number;
  r: number;
  enemy: boolean;
  damage: number;
  pierce: boolean;
  seeker: boolean;
  speed: number;
  life: number;
  /** Stopped by walls. Boss energy passes over them. */
  walls: boolean;
  color: string;
  /** Robots already hit by a piercing shot. */
  hits: number[];
  /** Homing missiles turn towards the player, and can be shot down. */
  turn: number;
  dead: boolean;
}

export interface Mine {
  x: number;
  y: number;
  t: number;
  dead: boolean;
}

export interface Pickup {
  x: number;
  y: number;
  kind: PowerKind | 'bonus';
  t: number;
  life: number;
  points: number;
}

export type ParticleKind = 'spark' | 'glow' | 'ring' | 'chunk';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  drag: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  t: number;
  life: number;
  color: string;
  size: number;
}

export interface Laser {
  kind: 'row' | 'col' | 'ray';
  /** Row or column for straight beams. */
  pos: number;
  /** Rays start at the boss and turn. */
  angle: number;
  spin: number;
  length: number;
  warn: number;
  on: number;
  t: number;
  color: string;
}

export interface Drone {
  angle: number;
  x: number;
  y: number;
  hp: number;
  flash: number;
  fireCd: number;
  alive: boolean;
}

export interface Clone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  alive: boolean;
  fireCd: number;
}

export interface Boss {
  kind: BossKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  phase: number;
  mode: string;
  modeT: number;
  t: number;
  angle: number;
  spin: number;
  flash: number;
  alpha: number;
  dying: number;
  dead: boolean;
  aim: number;
  counter: number;
  dashLeft: number;
  dashDist: number;
  trailT: number;
  spiral: number;
  fireT: number;
  target: Point;
  home: Point;
  drones: Drone[];
  clones: Clone[];
  /** Boss can't be hurt (warping, shielded or changing phase). */
  guarded: boolean;
}

export interface GameEvent {
  type: string;
  x?: number;
  y?: number;
}

export interface Banner {
  text: string;
  sub: string;
  t: number;
  life: number;
  color: string;
}

export interface Tally {
  label: string;
  value: number;
}

export interface Game {
  state: GameState;
  stateT: number;
  paused: boolean;
  time: number;
  level: number;
  spec: LevelSpec;
  maze: Maze;
  score: number;
  hiScore: number;
  lives: number;
  nextLife: number;
  /** Highest sector reached (0-5), so a run can start there. */
  unlocked: number;
  menuSector: number;
  /** The title menu: which row is lit, and the difficulty picked for a new game. */
  menuRow: number;
  difficulty: Difficulty;
  /** The run that CONTINUE would resume, if any. */
  savedRun: SavedRun | null;
  player: Player;
  robots: Robot[];
  /** The next robots out of the factory. Refilled as it empties: robots never run out. */
  queue: RobotKind[];
  /** How many robots have been lined up this level, so the first few follow a set order. */
  planned: number;
  /** Robots destroyed this level. */
  kills: number;
  spawnT: number;
  exitToggle: number;
  /** On boss levels, power-ups appear every so often. */
  bossDropT: number;
  bullets: Bullet[];
  mines: Mine[];
  pickups: Pickup[];
  particles: Particle[];
  popups: Popup[];
  lasers: Laser[];
  boss: Boss | null;
  dots: Uint8Array;
  dotsLeft: number;
  dotsEaten: number;
  bonusSpawned: number;
  modeIndex: number;
  modeT: number;
  scatter: boolean;
  combo: number;
  comboT: number;
  chain: number;
  levelT: number;
  levelHits: number;
  /** Steps from Ben to every tile; robots use it to hunt. */
  distPlayer: Int16Array;
  distTile: number;
  /** Steps from the nearest robot to every tile; seeker shots use it. */
  distRobots: Int16Array;
  shake: number;
  flash: number;
  flashColor: string;
  glitch: number;
  events: GameEvent[];
  banner: Banner | null;
  tally: Tally[];
  introLength: number;
  respawn: boolean;
  nextId: number;
  rng: Rng;
}
