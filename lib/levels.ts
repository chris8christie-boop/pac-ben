/*
 * The thirty levels: six sectors of five, each ending in a boss. Everything
 * that gets harder as you go is worked out here.
 */

export const LEVEL_COUNT = 30;
export const LEVELS_PER_SECTOR = 5;

export type RobotKind =
  | 'chaser'
  | 'ambusher'
  | 'flanker'
  | 'wanderer'
  | 'tank'
  | 'gunner'
  | 'splitter'
  | 'mini'
  | 'phantom'
  | 'speeder'
  | 'bomber';

export type BossKind = 'boltz' | 'magnetron' | 'shredder' | 'hydra' | 'glitch' | 'omega';

export interface RobotSpec {
  name: string;
  blurb: string;
  color: string;
  hp: number;
  /** Multiplies the level's robot speed. */
  speed: number;
  points: number;
  size: number;
}

export const ROBOT_SPECS: Record<RobotKind, RobotSpec> = {
  chaser: { name: 'ZAPPER', blurb: 'Hunts you down the shortest way.', color: '#ff3b5c', hp: 1, speed: 1, points: 100, size: 1 },
  ambusher: { name: 'PINCER', blurb: 'Heads to where you are going.', color: '#ff7ad9', hp: 1, speed: 1, points: 100, size: 1 },
  flanker: { name: 'FLANKER', blurb: 'Teams up to box you in.', color: '#38e8ff', hp: 1, speed: 1, points: 100, size: 1 },
  wanderer: { name: 'DIZZY', blurb: 'Loses its nerve up close.', color: '#ffa53a', hp: 1, speed: 0.95, points: 100, size: 1 },
  tank: { name: 'BRICK', blurb: 'Armoured. Takes three hits.', color: '#9fb0d6', hp: 3, speed: 0.72, points: 300, size: 1.08 },
  gunner: { name: 'SPARKY', blurb: 'Shoots back when you line up.', color: '#b6ff3b', hp: 2, speed: 0.85, points: 250, size: 1 },
  splitter: { name: 'TWINNER', blurb: 'Splits in two when destroyed.', color: '#a26bff', hp: 2, speed: 0.95, points: 200, size: 1.04 },
  mini: { name: 'MINI', blurb: 'Small and quick.', color: '#d2b6ff', hp: 1, speed: 1.22, points: 50, size: 0.66 },
  phantom: { name: 'PHANTOM', blurb: 'Fades out, then strikes.', color: '#e8f1ff', hp: 2, speed: 0.95, points: 300, size: 1 },
  speeder: { name: 'DASHER', blurb: 'Faster than you.', color: '#3bffb0', hp: 1, speed: 1.3, points: 200, size: 0.92 },
  bomber: { name: 'MINER', blurb: 'Leaves mines behind it.', color: '#ffd23f', hp: 2, speed: 0.85, points: 250, size: 1 },
};

export interface BossSpec {
  name: string;
  title: string;
  color: string;
  hp: number;
  radius: number;
  points: number;
  /** One line shown on the warning screen. */
  intro: string;
}

export const BOSS_SPECS: Record<BossKind, BossSpec> = {
  boltz: { name: 'BOLTZ', title: 'THE BIG BOLT', color: '#ffd23f', hp: 45, radius: 1.5, points: 5000, intro: 'Rings of sparks. Keep moving.' },
  magnetron: { name: 'MAGNETRON', title: 'THE WARPING MAGNET', color: '#c04dff', hp: 70, radius: 1.5, points: 10000, intro: 'Watch where it warps to.' },
  shredder: { name: 'SHREDDER', title: 'THE SPINNING SAW', color: '#ff7a1a', hp: 100, radius: 1.45, points: 15000, intro: 'Get out of its line.' },
  hydra: { name: 'HYDRA-CORE', title: 'THE SHIELDED HEART', color: '#34f5a0', hp: 120, radius: 1.6, points: 20000, intro: 'Break the shield drones first.' },
  glitch: { name: 'GLITCH KING', title: 'THE CORRUPTED CROWN', color: '#3ff5ff', hp: 150, radius: 1.5, points: 30000, intro: 'Only one of them is real.' },
  omega: { name: 'OMEGA', title: 'THE OVERMIND', color: '#ff3355', hp: 240, radius: 2, points: 50000, intro: 'Everything you have faced, at once.' },
};

export const BOSS_ORDER: readonly BossKind[] = ['boltz', 'magnetron', 'shredder', 'hydra', 'glitch', 'omega'];

export interface Sector {
  name: string;
  /** Wall glow. */
  wall: string;
  /** The bright line at the heart of each wall. */
  core: string;
  /** Wall interior, top and bottom of the gradient. */
  fillTop: string;
  fillBottom: string;
  bg: string;
  floor: string;
  dot: string;
  bonus: string;
  bonusPoints: number;
  /** Music: the root note (MIDI) and tempo. */
  root: number;
  bpm: number;
}

export const SECTORS: readonly Sector[] = [
  { name: 'NEON CITY', wall: '#2f7bff', core: '#d5e4ff', fillTop: 'rgba(40,90,255,0.20)', fillBottom: 'rgba(20,30,120,0.10)', bg: '#03050d', floor: 'rgba(90,130,255,0.09)', dot: '#ffe2b8', bonus: 'BATTERY', bonusPoints: 100, root: 45, bpm: 118 },
  { name: 'TOXIC FOUNDRY', wall: '#22e07a', core: '#d4ffe6', fillTop: 'rgba(30,220,120,0.18)', fillBottom: 'rgba(10,80,40,0.10)', bg: '#020a06', floor: 'rgba(60,255,150,0.08)', dot: '#f4ffc8', bonus: 'GEAR', bonusPoints: 300, root: 43, bpm: 122 },
  { name: 'SYNTH CIRCUIT', wall: '#ff3fd2', core: '#ffd8f6', fillTop: 'rgba(255,60,210,0.18)', fillBottom: 'rgba(90,10,80,0.10)', bg: '#0a020a', floor: 'rgba(255,90,220,0.08)', dot: '#ffe0fb', bonus: 'MICROCHIP', bonusPoints: 500, root: 46, bpm: 126 },
  { name: 'SOLAR CORE', wall: '#ffaa1f', core: '#fff1d0', fillTop: 'rgba(255,170,30,0.18)', fillBottom: 'rgba(110,50,0,0.10)', bg: '#0c0703', floor: 'rgba(255,180,60,0.08)', dot: '#fff4d6', bonus: 'DISK', bonusPoints: 1000, root: 41, bpm: 130 },
  { name: 'CRYO GRID', wall: '#3ff0ff', core: '#e2fdff', fillTop: 'rgba(60,240,255,0.16)', fillBottom: 'rgba(0,70,90,0.10)', bg: '#020a0d', floor: 'rgba(80,240,255,0.08)', dot: '#e8fbff', bonus: 'CRYSTAL', bonusPoints: 2000, root: 44, bpm: 134 },
  { name: 'THE MAINFRAME', wall: '#ff3355', core: '#ffd9df', fillTop: 'rgba(255,50,85,0.18)', fillBottom: 'rgba(100,0,20,0.12)', bg: '#0d0205', floor: 'rgba(255,70,100,0.08)', dot: '#ffe6ea', bonus: 'GOLDEN BOLT', bonusPoints: 5000, root: 42, bpm: 138 },
];

export interface LevelSpec {
  level: number;
  sector: number;
  boss: BossKind | null;
  /** Robots out on the maze at once. Destroyed ones are rebuilt, as Pac-Man's ghosts return. */
  maxActive: number;
  spawnEvery: number;
  /** Seconds the factory takes to rebuild a destroyed robot. */
  respawn: number;
  robotSpeed: number;
  playerSpeed: number;
  overdrive: number;
  mix: [RobotKind, number][];
  /** A robot type seen for the first time on this level. */
  newKind: RobotKind | null;
  portals: boolean;
  tunnels: number;
  removeChance: number;
  nodeChance: number;
  /** Alternating scatter and chase times, in seconds. After the last, robots chase for good. */
  modes: number[];
  gunnerCooldown: number;
}

export function sectorOf(level: number): number {
  return Math.floor((level - 1) / LEVELS_PER_SECTOR);
}

export function firstLevelOf(sector: number): number {
  return sector * LEVELS_PER_SECTOR + 1;
}

const UNLOCKS: [number, RobotKind][] = [
  [1, 'chaser'],
  [1, 'ambusher'],
  [1, 'wanderer'],
  [2, 'flanker'],
  [3, 'tank'],
  [6, 'gunner'],
  [11, 'splitter'],
  [16, 'phantom'],
  [21, 'speeder'],
  [26, 'bomber'],
];

function mixFor(level: number): [RobotKind, number][] {
  const mix: [RobotKind, number][] = [];
  for (const [from, kind] of UNLOCKS) {
    if (level < from) continue;
    // Newer kinds become more common the longer you have known them.
    const age = level - from;
    const base = kind === 'tank' ? 1 : 2;
    mix.push([kind, base + Math.min(age, 8) * 0.12]);
  }
  return mix;
}

export function levelSpec(level: number): LevelSpec {
  const L = Math.max(1, Math.min(LEVEL_COUNT, Math.round(level)));
  const sector = sectorOf(L);
  const bossLevel = L % LEVELS_PER_SECTOR === 0;
  const step = L - 1;
  const fresh = UNLOCKS.find(([from, kind]) => from === L && kind !== 'chaser' && kind !== 'ambusher' && kind !== 'wanderer');
  return {
    level: L,
    sector,
    boss: bossLevel ? BOSS_ORDER[sector] : null,
    maxActive: Math.min(4 + Math.floor(step / 4), 8),
    spawnEvery: Math.max(3.2 - step * 0.07, 1.2),
    respawn: Math.max(6 - step * 0.12, 2.5),
    robotSpeed: 4.3 + step * 0.115,
    playerSpeed: 7 + step * 0.04,
    overdrive: Math.max(7 - step * 0.17, 2.5),
    mix: mixFor(L),
    newKind: fresh ? fresh[1] : null,
    portals: sector >= 2,
    tunnels: bossLevel ? 2 : L >= 11 && L % 3 === 0 ? 2 : 1,
    removeChance: bossLevel ? 0.22 : 0.42 + ((L * 37) % 11) / 55,
    nodeChance: bossLevel ? 0.04 : 0.1 + ((L * 13) % 7) / 60,
    modes: L < 6 ? [7, 20, 7, 20, 5, 20, 5] : L < 16 ? [5, 20, 5, 20, 3] : [3, 25, 2],
    gunnerCooldown: Math.max(2.6 - step * 0.04, 1.4),
  };
}
