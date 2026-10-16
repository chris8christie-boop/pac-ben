/*
 * The game: state, rules and the update step. No drawing and no browser APIs,
 * so it runs the same in tests as in the page.
 */
import { BOSS_SPECS, CREDITS_TIME, DIFFICULTIES, DIFFICULTY_ORDER, LEVEL_COUNT, ROBOT_SPECS, SECTORS, STORY, STORY_TYPE_SPEED, firstLevelOf, levelSpec } from './levels.ts';
import type { Difficulty, LevelSpec, RobotKind } from './levels.ts';
import { COLS, DX, LEFT, NONE, PATH, RIGHT, advance, atCentre, canGo, distanceMap, generateMaze, opposite, tileAt, tileIndex } from './maze.ts';
import type { Mover } from './maze.ts';
import { mulberry32, pickWeighted } from './rng.ts';
import { bossSolid, bossTakesShot, createBoss, resetBoss, updateBoss } from './bosses.ts';
import { damageRobot, killRobot, reverseAll, solid, updateRobots } from './robots.ts';
import { TAU, addScore, angleTo, bossSays, burst, clamp, dist, emit, inBounds, makeRobot, particle, popup } from './world.ts';
import type { Bullet, Controls, Game, GameEvent, Laser, Pickup, Player, PowerKind, RunStats, SavedRun } from './types.ts';

export interface SaveData {
  hiScore: number;
  unlocked: number;
  difficulty?: Difficulty;
  run?: SavedRun | null;
  storySeen?: boolean;
}

/** The rows of the title menu, top to bottom. */
export type MenuRow = 'continue' | 'new' | 'difficulty' | 'sector' | 'story';

export function titleRows(g: Game): MenuRow[] {
  const rows: MenuRow[] = [];
  if (g.savedRun) rows.push('continue');
  rows.push('new', 'difficulty');
  if (g.unlocked > 0) rows.push('sector');
  rows.push('story');
  return rows;
}

function isDifficulty(d: unknown): d is Difficulty {
  return typeof d === 'string' && d in DIFFICULTIES;
}

function validRun(r: SavedRun | null | undefined): SavedRun | null {
  if (!r || !Number.isFinite(r.level) || r.level < 1 || r.level > LEVEL_COUNT || !(r.lives >= 1) || !isDifficulty(r.difficulty)) return null;
  const s = r.stats;
  const stats = s ? { kills: Math.max(0, Math.floor(s.kills) || 0), dots: Math.max(0, Math.floor(s.dots) || 0), time: Math.max(0, Number(s.time) || 0) } : undefined;
  return { level: Math.round(r.level), score: Math.max(0, Math.floor(r.score) || 0), lives: Math.floor(r.lives), difficulty: r.difficulty, stats };
}

const freshStats = (): RunStats => ({ kills: 0, dots: 0, time: 0 });

export const STEP = 1 / 120;

export const NO_INPUT: Controls = { dir: NONE, fire: false, start: false, pause: false, back: false, left: false, right: false, up: false, down: false, menuRow: -1 };

export const POWER_LABELS: Record<PowerKind, string> = {
  rapid: 'RAPID FIRE',
  pierce: 'PIERCING SHOTS',
  seeker: 'SEEKER SHOTS',
  shield: 'SHIELD',
  emp: 'EMP BLAST',
  life: '1UP',
};

const POWER_TIME = 10;

function mazeFor(spec: LevelSpec) {
  return generateMaze(spec.level, {
    boss: spec.boss !== null,
    portals: spec.portals,
    removeChance: spec.removeChance,
    nodeChance: spec.nodeChance,
    tunnels: spec.tunnels,
  });
}

function makePlayer(x: number, y: number): Player {
  return {
    x,
    y,
    dir: NONE,
    portalLock: -1,
    facing: LEFT,
    desired: NONE,
    fireCd: 0,
    invuln: 0,
    shield: false,
    power: null,
    powerT: 0,
    powerMax: POWER_TIME,
    overdrive: 0,
    overdriveMax: 1,
    mouth: 0,
    moving: false,
    muzzle: 0,
    idleT: 0,
  };
}

export function createGame(save: SaveData, seed = Date.now()): Game {
  const difficulty: Difficulty = isDifficulty(save.difficulty) ? save.difficulty : 'rookie';
  const spec = levelSpec(1, difficulty);
  const maze = mazeFor(spec);
  const unlocked = clamp(Math.floor(save.unlocked) || 0, 0, SECTORS.length - 1);
  return {
    state: 'title',
    stateT: 0,
    paused: false,
    time: 0,
    level: 1,
    spec,
    maze,
    score: 0,
    hiScore: Math.max(0, Math.floor(save.hiScore) || 0),
    lives: 3,
    nextLife: 10000,
    unlocked,
    menuSector: unlocked,
    menuRow: 0,
    difficulty,
    savedRun: validRun(save.run),
    storySeen: !!save.storySeen,
    storyPanel: 0,
    storyThen: null,
    run: freshStats(),
    taunt: null,
    player: makePlayer(maze.playerStart.x, maze.playerStart.y),
    robots: [],
    queue: [],
    planned: 0,
    kills: 0,
    spawnT: 0,
    exitToggle: 0,
    bossDropT: 12,
    bullets: [],
    mines: [],
    pickups: [],
    particles: [],
    popups: [],
    lasers: [],
    boss: null,
    dots: maze.dots.slice(),
    dotsLeft: maze.dotTotal,
    dotsEaten: 0,
    bonusSpawned: 0,
    modeIndex: 0,
    modeT: 0,
    scatter: true,
    combo: 0,
    comboT: 0,
    chain: 0,
    levelT: 0,
    levelHits: 0,
    distPlayer: new Int16Array(maze.tiles.length),
    distTile: -1,
    distRobots: new Int16Array(maze.tiles.length),
    shake: 0,
    flash: 0,
    flashColor: '#ffffff',
    glitch: 0,
    freeze: 0,
    dotStreak: 0,
    dotStreakT: 0,
    sinceDot: 0,
    radar: -1,
    heartT: 0,
    edgeFlash: 0,
    edgeColor: '#ffffff',
    events: [],
    banner: null,
    tally: [],
    introLength: 2,
    respawn: false,
    nextId: 1,
    rng: mulberry32(seed),
  };
}

export function drainEvents(g: Game): GameEvent[] {
  const out = g.events;
  g.events = [];
  return out;
}

/** Starts a new run at the first level of a sector. */
export function startRun(g: Game, sector: number, difficulty: Difficulty = g.difficulty): void {
  g.difficulty = difficulty;
  g.run = freshStats();
  g.score = 0;
  g.lives = DIFFICULTIES[difficulty].lives;
  g.nextLife = 10000;
  g.paused = false;
  emit(g, 'start');
  loadLevel(g, firstLevelOf(clamp(sector, 0, g.unlocked)));
}

/** Picks up a saved run where it left off. */
export function continueRun(g: Game, run: SavedRun): void {
  g.difficulty = run.difficulty;
  g.run = run.stats ? { ...run.stats } : freshStats();
  g.score = run.score;
  g.lives = run.lives;
  g.nextLife = 10000;
  while (g.nextLife <= g.score) g.nextLife += 30000;
  g.paused = false;
  emit(g, 'start');
  loadLevel(g, run.level);
}

/** What CONTINUE would need to pick this run up again, or null when there's nothing to save. */
export function runSnapshot(g: Game): SavedRun | null {
  if (g.state === 'title' || g.state === 'gameover' || g.state === 'victory' || g.lives <= 0) return null;
  return { level: g.level, score: g.score, lives: g.lives, difficulty: g.difficulty, stats: { ...g.run } };
}

/** Shows the opening story, then starts `then` (or goes back to the title). */
export function beginStory(g: Game, then: { sector: number; difficulty: Difficulty } | null): void {
  g.state = 'story';
  g.stateT = 0;
  g.storyPanel = 0;
  g.storyThen = then;
  emit(g, 'story');
}

function endStory(g: Game): void {
  g.storySeen = true;
  const then = g.storyThen;
  g.storyThen = null;
  if (then) startRun(g, then.sector, then.difficulty);
  else toTitle(g);
}

/** How many letters of the current story panel have typed out. */
export function storyTyped(g: Game): number {
  return Math.floor(g.stateT * STORY_TYPE_SPEED);
}

function storyLength(panel: number): number {
  const p = STORY[panel];
  return p ? p.lines[0].length + p.lines[1].length : 0;
}

function storyStep(g: Game, dt: number, c: Controls): void {
  const total = storyLength(g.storyPanel);
  const before = Math.floor((g.stateT - dt) * STORY_TYPE_SPEED);
  const now = storyTyped(g);
  if (now > before && now <= total && now % 2 === 0) emit(g, 'type');
  if (c.back || c.pause) {
    endStory(g);
    return;
  }
  if (!c.start) return;
  if (now < total) {
    g.stateT = total / STORY_TYPE_SPEED + 0.01;
    return;
  }
  g.storyPanel++;
  g.stateT = 0;
  emit(g, 'menu');
  if (g.storyPanel >= STORY.length) endStory(g);
}



/** The first robots out are the classic four, with any new kind brought in early; then the level's mix. */
function nextKind(g: Game): RobotKind {
  const spec = g.spec;
  const available = new Set(spec.mix.map(([k]) => k));
  const opening: RobotKind[] = (['chaser', 'ambusher', 'flanker', 'wanderer'] as RobotKind[]).filter((k) => available.has(k));
  if (spec.newKind) opening.splice(1, 0, spec.newKind, spec.newKind);
  const kind = g.planned < opening.length ? opening[g.planned] : pickWeighted(g.rng, spec.mix);
  g.planned++;
  return kind;
}

function refillQueue(g: Game): void {
  if (g.boss) return;
  while (g.queue.length < 3) g.queue.push(nextKind(g));
}

export function loadLevel(g: Game, level: number): void {
  g.level = clamp(level, 1, LEVEL_COUNT);
  g.spec = levelSpec(g.level, g.difficulty);
  g.maze = mazeFor(g.spec);
  g.dots = g.maze.dots.slice();
  g.dotsLeft = g.maze.dotTotal;
  g.dotsEaten = 0;
  g.bonusSpawned = 0;
  g.robots = [];
  g.bullets = [];
  g.mines = [];
  g.pickups = [];
  g.lasers = [];
  g.particles = [];
  g.popups = [];
  g.boss = g.spec.boss ? createBoss(g) : null;
  g.queue = [];
  g.planned = 0;
  g.kills = 0;
  refillQueue(g);
  g.modeIndex = 0;
  g.modeT = 0;
  g.scatter = true;
  g.combo = 0;
  g.comboT = 0;
  g.chain = 0;
  g.levelT = 0;
  g.levelHits = 0;
  g.sinceDot = 0;
  g.radar = -1;
  g.dotStreak = 0;
  g.dotStreakT = 0;
  g.freeze = 0;
  g.spawnT = 0.3;
  g.exitToggle = 0;
  g.bossDropT = 10;
  g.player = makePlayer(g.maze.playerStart.x, g.maze.playerStart.y);
  g.unlocked = Math.max(g.unlocked, g.spec.sector);
  g.menuSector = g.spec.sector;
  g.state = 'intro';
  g.stateT = 0;
  g.respawn = false;
  g.introLength = g.spec.boss ? 3.8 : g.spec.newKind ? 3.2 : 2.3;
  g.banner = null;
  g.tally = [];
  g.distTile = -1;
  updateDistances(g);
  emit(g, g.spec.boss ? 'warning' : 'intro');
}

export function toTitle(g: Game): void {
  g.state = 'title';
  g.stateT = 0;
  g.paused = false;
  g.menuSector = Math.min(g.menuSector, g.unlocked);
  g.menuRow = 0;
  g.robots = [];
  g.bullets = [];
  g.lasers = [];
  g.mines = [];
  g.pickups = [];
  g.boss = null;
  g.banner = null;
  emit(g, 'title');
}

export function update(g: Game, dt: number, c: Controls): void {
  // Omega's last moments play out in slow motion.
  if (g.boss && g.boss.kind === 'omega' && g.boss.dying > 0 && !g.boss.dead) dt *= 0.45;
  g.time += dt;
  if (g.events.length > 400) g.events.splice(0, 200);
  if (g.paused) {
    if (c.pause || c.start) {
      g.paused = false;
      emit(g, 'resume');
    } else if (c.back) toTitle(g);
    return;
  }
  if (g.freeze > 0) {
    // Hit-stop: everything holds for a beat; only the shake and flash carry on.
    g.freeze = Math.max(0, g.freeze - dt);
    g.shake = Math.max(0, g.shake - dt * 2.2);
    g.flash = Math.max(0, g.flash - dt * 1.6);
    return;
  }
  updateFx(g, dt);
  g.stateT += dt;
  switch (g.state) {
    case 'title':
      titleMenu(g, c);
      break;
    case 'story':
      storyStep(g, dt, c);
      break;
    case 'intro':
      if (c.pause) {
        g.paused = true;
        emit(g, 'pause');
        break;
      }
      for (const r of g.robots) r.anim += dt;
      if (g.boss) {
        g.boss.t += dt;
        // On its first entrance the boss drops in from above and lands as play begins.
        if (!g.respawn) {
          const k = Math.min(1, g.stateT / g.introLength);
          g.boss.y = g.boss.home.y - 16 * (1 - k) ** 3;
        }
      }
      if (g.stateT >= g.introLength) {
        g.state = 'play';
        g.stateT = 0;
        emit(g, 'go');
        if (!g.respawn) {
          popup(g, g.player.x, g.player.y - 1.1, "LET'S GO!", '#ffd23f', 1);
          if (g.boss) {
            const b = g.boss;
            b.y = b.home.y;
            g.shake = 0.9;
            g.freeze = 0.12;
            burst(g, b.x, b.y + b.r, BOSS_SPECS[b.kind].color, 40, 10, 2);
            emit(g, 'slam', b.x, b.y);
            bossSays(g, 0);
          }
        }
      }
      break;
    case 'play':
      if (c.pause) {
        g.paused = true;
        emit(g, 'pause');
        break;
      }
      tick(g, dt, c);
      break;
    case 'dying':
      if (g.stateT >= 2) afterDeath(g);
      break;
    case 'clear':
      if (g.stateT >= 3.8 || (g.stateT > 1.6 && c.start)) {
        if (g.level >= LEVEL_COUNT) {
          g.state = 'victory';
          g.stateT = 0;
          emit(g, 'victory');
        } else loadLevel(g, g.level + 1);
      }
      break;
    case 'gameover':
      if (g.stateT > 1.5 && c.start) toTitle(g);
      break;
    case 'victory':
      // The credits roll; Enter skips to the end, then returns to the title.
      if (!c.start || g.stateT < 1) break;
      if (g.stateT < CREDITS_TIME) g.stateT = CREDITS_TIME;
      else if (g.stateT > CREDITS_TIME + 0.6) toTitle(g);
      break;
  }
}

function titleMenu(g: Game, c: Controls): void {
  const rows = titleRows(g);
  g.menuRow = clamp(g.menuRow, 0, rows.length - 1);
  if (c.menuRow >= 0 && c.menuRow < rows.length && c.menuRow !== g.menuRow) {
    g.menuRow = c.menuRow;
    emit(g, 'menu');
  }
  if (c.up && g.menuRow > 0) {
    g.menuRow--;
    emit(g, 'menu');
  }
  if (c.down && g.menuRow < rows.length - 1) {
    g.menuRow++;
    emit(g, 'menu');
  }
  const row = rows[g.menuRow];
  const step = (c.left ? -1 : 0) + (c.right ? 1 : 0);
  if (step && row === 'difficulty') {
    const i = clamp(DIFFICULTY_ORDER.indexOf(g.difficulty) + step, 0, DIFFICULTY_ORDER.length - 1);
    if (DIFFICULTY_ORDER[i] !== g.difficulty) {
      g.difficulty = DIFFICULTY_ORDER[i];
      emit(g, 'menu');
    }
  } else if (step && row === 'sector') {
    const s = clamp(g.menuSector + step, 0, g.unlocked);
    if (s !== g.menuSector) {
      g.menuSector = s;
      emit(g, 'menu');
    }
  }
  if (!c.start || g.stateT < 0.3) return;
  if (row === 'continue' && g.savedRun) continueRun(g, g.savedRun);
  else if (row === 'story') beginStory(g, null);
  else if (!g.storySeen) beginStory(g, { sector: g.menuSector, difficulty: g.difficulty });
  else startRun(g, g.menuSector, g.difficulty);
}

function tick(g: Game, dt: number, c: Controls): void {
  g.levelT += dt;
  g.run.time += dt;
  updateRadar(g, dt);
  if (g.dotStreakT > 0) g.dotStreakT -= dt;
  if (g.edgeFlash > 0) g.edgeFlash = Math.max(0, g.edgeFlash - dt * 2.5);
  if (!g.boss) updateModes(g, dt);
  updatePlayer(g, dt, c);
  updateDistances(g);
  if (g.boss) {
    updateBoss(g, dt);
    bossDrops(g, dt);
  } else spawner(g, dt);
  updateRobots(g, dt);
  updateBullets(g, dt);
  updateLasers(g, dt);
  for (const m of g.mines) m.t += dt;
  for (const k of g.pickups) k.t += dt;
  g.pickups = g.pickups.filter((k) => k.t < k.life);
  collide(g);
  if (g.comboT > 0) {
    g.comboT -= dt;
    if (g.comboT <= 0) g.combo = 0;
  }
  g.robots = g.robots.filter((r) => r.alive);
  g.mines = g.mines.filter((m) => !m.dead);
  if (g.state === 'play') checkClear(g);
}

/** After 8 seconds without a dot, with fewer than 20 left, point Ben at the nearest one. */
function updateRadar(g: Game, dt: number): void {
  g.sinceDot += dt;
  if (g.boss || g.dotsLeft <= 0 || g.dotsLeft >= 20 || g.sinceDot < 8) {
    g.radar = -1;
    return;
  }
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < g.dots.length; i++) {
    if (!g.dots[i]) continue;
    const d = g.distPlayer[i];
    if (d >= 0 && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  g.radar = best;
}

function updateModes(g: Game, dt: number): void {
  if (g.player.overdrive > 0) return;
  const modes = g.spec.modes;
  if (g.modeIndex >= modes.length) {
    g.scatter = false;
    return;
  }
  g.modeT += dt;
  if (g.modeT >= modes[g.modeIndex]) {
    g.modeT = 0;
    g.modeIndex++;
    g.scatter = g.modeIndex % 2 === 0 && g.modeIndex < modes.length;
    reverseAll(g);
  }
}

function updateDistances(g: Game): void {
  const x = Math.round(g.player.x);
  const y = Math.round(g.player.y);
  const tile = tileIndex(x, y);
  if (tile === g.distTile) return;
  if (tileAt(g.maze, x, y) !== PATH) return;
  distanceMap(g.maze, [{ x, y }], g.distPlayer);
  g.distTile = tile;
}

function updatePlayer(g: Game, dt: number, c: Controls): void {
  const p = g.player;
  const m = g.maze;
  // Ben moves only while a direction is held. Let go and he finishes the step
  // he's on (so he stays lined up with the corridors) and stops.
  p.desired = c.dir;
  if (p.desired >= 0) {
    if (p.dir >= 0 && p.desired === opposite(p.dir)) p.dir = p.desired;
    else if (p.dir < 0 && !atCentre(p)) {
      // Standing between two tiles (the start): move along that corridor.
      const horizontal = !Number.isInteger(p.x);
      if (horizontal === (DX[p.desired] !== 0)) p.dir = p.desired;
    }
  }
  const speed = g.spec.playerSpeed * (p.overdrive > 0 ? 1.1 : 1);
  const decide = (mv: Mover) => {
    if (p.desired < 0) return NONE;
    if (canGo(m, mv.x, mv.y, p.desired)) return p.desired;
    if (mv.dir >= 0 && canGo(m, mv.x, mv.y, mv.dir)) return mv.dir;
    return NONE;
  };
  if (advance(m, p, speed * dt, decide)) {
    emit(g, 'teleport', p.x, p.y);
    burst(g, p.x, p.y, '#b48cff', 10, 5, 0.7);
  }
  p.moving = p.dir >= 0;
  p.idleT = p.moving ? 0 : p.idleT + dt;
  if (p.dir >= 0) p.facing = p.dir;
  else if (p.desired >= 0) p.facing = p.desired;
  if (p.moving) p.mouth += dt * 14;

  // Eat whatever is on the tile underfoot.
  const tx = Math.round(p.x);
  const ty = Math.round(p.y);
  if (Math.abs(p.x - tx) + Math.abs(p.y - ty) < 0.45) {
    const i = tileIndex(tx, ty);
    const dot = g.dots[i];
    if (dot) {
      g.dots[i] = 0;
      g.dotsLeft--;
      g.dotsEaten++;
      g.run.dots++;
      g.sinceDot = 0;
      g.radar = -1;
      g.dotStreak = g.dotStreakT > 0 ? Math.min(g.dotStreak + 1, 8) : 0;
      g.dotStreakT = 0.5;
      particle(g, 'ring', tx, ty, 0, 0, 0.2, '#ffe9b0', 0.55);
      if (dot === 1) {
        addScore(g, 10);
        g.events.push({ type: 'dot', x: tx, y: ty, n: g.dotStreak });
      } else {
        addScore(g, 50);
        startOverdrive(g);
      }
      if (!g.boss && (g.dotsEaten === 30 || g.dotsEaten === 70)) {
        const sector = SECTORS[g.spec.sector];
        g.pickups.push({ x: m.bonus.x, y: m.bonus.y, kind: 'bonus', t: 0, life: 9.5, points: sector.bonusPoints });
        g.bonusSpawned++;
      }
      if (g.dotsLeft === 0 && g.boss) {
        popup(g, p.x, p.y - 1, 'CLEAN SWEEP!', '#7dff8a', 0.8);
        emit(g, 'sweep');
      }
    }
  }

  p.fireCd -= dt;
  p.muzzle = Math.max(0, p.muzzle - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.power) {
    p.powerT -= dt;
    if (p.powerT <= 0) {
      p.power = null;
      emit(g, 'powerdown');
    }
  }
  if (p.overdrive > 0) {
    if (g.rng() < dt * 40) particle(g, 'glow', p.x, p.y, 0, 0, 0.4, '#5a8bff', 0.75);
    if (p.overdrive < 2) {
      g.heartT -= dt;
      if (g.heartT <= 0) {
        g.heartT = 0.5;
        emit(g, 'heartbeat');
      }
    }
    p.overdrive -= dt;
    if (p.overdrive <= 0) {
      p.overdrive = 0;
      for (const r of g.robots) r.frightened = false;
      emit(g, 'overdriveend');
    }
  }
  if (c.fire && p.fireCd <= 0) shoot(g);
}

function startOverdrive(g: Game): void {
  const p = g.player;
  p.overdrive = p.overdriveMax = g.spec.overdrive;
  g.chain = 0;
  for (const r of g.robots) {
    if (!r.alive) continue;
    if (!r.frightened && r.spawnT <= 0 && r.dir >= 0) {
      const back = opposite(r.dir);
      if (!atCentre(r) || canGo(g.maze, r.x, r.y, back)) r.dir = back;
    }
    r.frightened = true;
  }
  g.flash = 0.18;
  g.flashColor = '#4a6bff';
  popup(g, p.x, p.y - 1, g.boss ? 'DOUBLE DAMAGE!' : 'OVERDRIVE!', '#8fb0ff', 0.8);
  emit(g, 'power', p.x, p.y);
}

function shoot(g: Game): void {
  const p = g.player;
  const d = p.facing < 0 ? LEFT : p.facing;
  const rapid = p.power === 'rapid' || p.overdrive > 0;
  p.fireCd = rapid ? 0.1 : 0.19;
  p.muzzle = 0.07;
  const pierce = p.power === 'pierce';
  const seeker = p.power === 'seeker';
  const speed = seeker ? 13 : 17;
  const start = seeker ? 0 : 0.35;
  const b: Bullet = {
    kind: 'shot',
    x: p.x + DX[d] * start,
    y: p.y + (d === 0 ? -start : d === 2 ? start : 0),
    dir: d,
    portalLock: -1,
    vx: DX[d] * speed,
    vy: (d === 0 ? -1 : d === 2 ? 1 : 0) * speed,
    r: 0.12,
    enemy: false,
    damage: 1 + (pierce ? 1 : 0) + (g.boss && p.overdrive > 0 ? 1 : 0),
    pierce,
    seeker,
    speed,
    life: seeker ? 1.8 : 2,
    walls: true,
    color: pierce ? '#7ff6ff' : seeker ? '#ff8af0' : '#fff2a0',
    hits: [],
    turn: 0,
    dead: false,
  };
  g.bullets.push(b);
  emit(g, 'shoot', p.x, p.y);
}

function decideSeeker(g: Game, b: Bullet): number {
  const m = g.maze;
  const options: number[] = [];
  for (let d = 0; d < 4; d++) if (d !== opposite(b.dir) && canGo(m, b.x, b.y, d)) options.push(d);
  if (!options.length) return NONE;
  const boss = g.boss;
  let best = options.includes(b.dir) ? b.dir : options[0];
  let bestScore = Infinity;
  for (const d of options) {
    const nx = b.x + DX[d];
    const ny = b.y + (d === 0 ? -1 : d === 2 ? 1 : 0);
    let score: number;
    if (boss && !boss.dead) score = dist(nx, ny, boss.x, boss.y);
    else {
      const v = g.distRobots[tileIndex(nx, ny)];
      score = v < 0 ? 9999 : v;
    }
    if (d === b.dir) score -= 0.01;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function updateBullets(g: Game, dt: number): void {
  const p = g.player;
  if (!g.boss && g.bullets.some((b) => b.seeker && !b.dead)) {
    distanceMap(g.maze, g.robots.filter(solid), g.distRobots);
  }
  for (const b of g.bullets) {
    if (b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    if (b.seeker) {
      advance(g.maze, b, b.speed * dt, (mv) => decideSeeker(g, mv as Bullet));
      if (b.dir < 0) b.dead = true;
      else {
        b.vx = DX[b.dir] * b.speed;
        b.vy = (b.dir === 0 ? -1 : b.dir === 2 ? 1 : 0) * b.speed;
      }
    } else {
      if (b.kind === 'missile') {
        const a = Math.atan2(b.vy, b.vx);
        let diff = angleTo(b.x, b.y, p.x, p.y) - a;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const na = a + clamp(diff, -b.turn * dt, b.turn * dt);
        b.vx = Math.cos(na) * b.speed;
        b.vy = Math.sin(na) * b.speed;
        if (g.rng() < dt * 30) particle(g, 'glow', b.x, b.y, -b.vx * 0.2, -b.vy * 0.2, 0.3, '#ff9a6a', 0.18);
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    if (b.walls) {
      if (b.x < -0.5) b.x += COLS;
      else if (b.x >= COLS - 0.5) b.x -= COLS;
      if (tileAt(g.maze, Math.round(b.x), Math.round(b.y)) !== PATH) {
        b.dead = true;
        for (let i = 0; i < 4; i++) {
          const a = Math.atan2(-b.vy, -b.vx) + (g.rng() - 0.5) * 1.6;
          particle(g, 'spark', b.x, b.y, Math.cos(a) * 4, Math.sin(a) * 4, 0.15, b.color, 0.05);
        }
        continue;
      }
    } else if (!inBounds(b.x, b.y, 2)) {
      b.dead = true;
      continue;
    }
    if (!b.enemy) shotHits(g, b);
  }
  g.bullets = g.bullets.filter((b) => !b.dead);
}

function shotHits(g: Game, b: Bullet): void {
  for (const r of g.robots) {
    if (!solid(r) || b.hits.includes(r.id)) continue;
    if (dist(b.x, b.y, r.x, r.y) > 0.42 * ROBOT_SPECS[r.kind].size + 0.16) continue;
    damageRobot(g, r, b.damage);
    if (!b.pierce) {
      b.dead = true;
      return;
    }
    b.hits.push(r.id);
  }
  for (const m of g.mines) {
    if (m.dead || dist(b.x, b.y, m.x, m.y) > 0.45) continue;
    m.dead = true;
    burst(g, m.x, m.y, '#ffd23f', 14, 6, 0.8);
    addScore(g, 50, m.x, m.y);
    emit(g, 'kill', m.x, m.y);
    if (!b.pierce) {
      b.dead = true;
      return;
    }
  }
  for (const e of g.bullets) {
    if (!e.enemy || e.kind !== 'missile' || e.dead || dist(b.x, b.y, e.x, e.y) > 0.45) continue;
    e.dead = true;
    b.dead = true;
    burst(g, e.x, e.y, '#ff5a7a', 10, 5, 0.6);
    addScore(g, 50, e.x, e.y);
    emit(g, 'pop', e.x, e.y);
    return;
  }
  if (g.boss && bossTakesShot(g, b)) b.dead = true;
}

function updateLasers(g: Game, dt: number): void {
  for (const l of g.lasers) {
    const before = l.t;
    l.t += dt;
    if (l.kind === 'ray') l.angle += l.spin * dt;
    if (before < l.warn && l.t >= l.warn) emit(g, 'laser');
  }
  g.lasers = g.lasers.filter((l) => l.t < l.warn + l.on);
}

export function laserOrigin(g: Game): { x: number; y: number } {
  return g.boss ? { x: g.boss.x, y: g.boss.y } : { x: 13.5, y: 15 };
}

function laserHits(g: Game, l: Laser, x: number, y: number): boolean {
  if (l.t < l.warn) return false;
  if (l.kind === 'row') return Math.abs(y - l.pos) < 0.45;
  if (l.kind === 'col') return Math.abs(x - l.pos) < 0.45;
  const o = laserOrigin(g);
  const dx = Math.cos(l.angle);
  const dy = Math.sin(l.angle);
  const along = clamp((x - o.x) * dx + (y - o.y) * dy, 0, l.length);
  return dist(x, y, o.x + dx * along, o.y + dy * along) < 0.42;
}

function spawner(g: Game, dt: number): void {
  g.spawnT -= dt;
  if (g.spawnT > 0 || !g.queue.length) return;
  let active = 0;
  for (const r of g.robots) if (r.alive && r.kind !== 'mini') active++;
  if (active >= g.spec.maxActive) return;
  // Use whichever exit Ben isn't standing next to. If he camps at the door,
  // robots come out anyway after a moment (they materialise harmlessly first).
  const p = g.player;
  let exit = g.maze.exits[g.exitToggle % 2];
  if (dist(p.x, p.y, exit.x, exit.y) < 2.5) exit = g.maze.exits[++g.exitToggle % 2];
  if (dist(p.x, p.y, exit.x, exit.y) < 2.5 && g.spawnT > -2.5) return;
  g.exitToggle++;
  const kind = g.queue.shift()!;
  refillQueue(g);
  makeRobot(g, kind, exit.x, exit.y, g.rng() < 0.5 ? LEFT : RIGHT);
  g.spawnT = active < 2 ? 1.1 : g.spec.spawnEvery;
  emit(g, 'spawn', exit.x, exit.y);
}

function bossDrops(g: Game, dt: number): void {
  g.bossDropT -= dt;
  if (g.bossDropT > 0 || g.pickups.length >= 2) return;
  g.bossDropT = 13;
  const kinds: PowerKind[] = ['rapid', 'pierce', 'seeker', 'shield', 'rapid'];
  const b = g.boss;
  for (let tries = 0; tries < 40; tries++) {
    const x = 1 + Math.floor(g.rng() * (COLS - 2));
    const y = 1 + Math.floor(g.rng() * 29);
    if (tileAt(g.maze, x, y) !== PATH) continue;
    if (b && dist(x, y, b.x, b.y) < 5) continue;
    if (dist(x, y, g.player.x, g.player.y) < 4) continue;
    g.pickups.push({ x, y, kind: kinds[Math.floor(g.rng() * kinds.length)], t: 0, life: 11, points: 0 });
    emit(g, 'drop', x, y);
    return;
  }
}

function collect(g: Game, k: Pickup): void {
  const p = g.player;
  k.life = 0;
  switch (k.kind) {
    case 'bonus':
      addScore(g, k.points, k.x, k.y, '#ffd23f');
      emit(g, 'bonus', k.x, k.y);
      return;
    case 'life':
      g.lives++;
      popup(g, k.x, k.y - 0.8, '1UP', '#7dff8a', 1);
      emit(g, 'life', k.x, k.y);
      return;
    case 'shield':
      p.shield = true;
      break;
    case 'emp':
      for (const r of g.robots) if (r.alive && r.spawnT <= 0) r.stun = 3;
      for (const b of g.bullets) if (b.enemy) b.dead = true;
      for (const m of g.mines) {
        m.dead = true;
        burst(g, m.x, m.y, '#ffd23f', 8, 4, 0.6);
      }
      g.flash = 0.3;
      g.flashColor = '#7fd8ff';
      particle(g, 'ring', p.x, p.y, 0, 0, 0.6, '#7fd8ff', 12);
      emit(g, 'emp', p.x, p.y);
      break;
    default:
      p.power = k.kind;
      p.powerT = p.powerMax = POWER_TIME;
  }
  popup(g, k.x, k.y - 0.8, POWER_LABELS[k.kind], '#ffffff', 0.62);
  emit(g, 'pickup', k.x, k.y);
}

function collide(g: Game): void {
  const p = g.player;
  for (const k of g.pickups) if (k.life > 0 && dist(p.x, p.y, k.x, k.y) < 0.75) collect(g, k);
  g.pickups = g.pickups.filter((k) => k.life > 0 && k.t < k.life);

  for (const r of g.robots) {
    if (!solid(r)) continue;
    if (dist(p.x, p.y, r.x, r.y) > 0.36 + 0.36 * ROBOT_SPECS[r.kind].size) continue;
    if (r.frightened) killRobot(g, r, 'eaten');
    else if (r.stun <= 0) hitPlayer(g);
    if (g.state !== 'play') return;
  }
  for (const b of g.bullets) {
    if (!b.enemy || b.dead || dist(p.x, p.y, b.x, b.y) > b.r + 0.28) continue;
    if (b.kind !== 'ember') b.dead = true;
    hitPlayer(g);
    if (g.state !== 'play') return;
  }
  for (const m of g.mines) {
    if (m.dead || m.t < 0.8 || dist(p.x, p.y, m.x, m.y) > 0.6) continue;
    m.dead = true;
    burst(g, m.x, m.y, '#ffd23f', 20, 8, 1);
    emit(g, 'kill', m.x, m.y);
    hitPlayer(g);
    if (g.state !== 'play') return;
  }
  for (const l of g.lasers) {
    if (laserHits(g, l, p.x, p.y)) {
      hitPlayer(g);
      if (g.state !== 'play') return;
    }
  }
  const b = g.boss;
  if (b && bossSolid(b)) {
    if (dist(p.x, p.y, b.x, b.y) < b.r * 0.8 + 0.3) hitPlayer(g);
    for (const d of b.drones) if (d.alive && dist(p.x, p.y, d.x, d.y) < 0.75) hitPlayer(g);
    for (const c of b.clones) if (c.alive && dist(p.x, p.y, c.x, c.y) < b.r * 0.8 + 0.3) hitPlayer(g);
  }
}

export function hitPlayer(g: Game): void {
  const p = g.player;
  if (p.invuln > 0 || g.state !== 'play') return;
  if (p.shield) {
    p.shield = false;
    p.invuln = 1.5;
    g.shake = Math.max(g.shake, 0.3);
    burst(g, p.x, p.y, '#7fd8ff', 20, 7, 1);
    emit(g, 'shieldbreak', p.x, p.y);
    return;
  }
  g.state = 'dying';
  g.stateT = 0;
  g.lives--;
  g.levelHits++;
  p.power = null;
  p.overdrive = 0;
  p.dir = NONE;
  for (const r of g.robots) r.frightened = false;
  g.shake = 0.6;
  burst(g, p.x, p.y, '#ffd23f', 30, 8, 1.2);
  emit(g, 'death', p.x, p.y);
}

function afterDeath(g: Game): void {
  if (g.lives <= 0) {
    g.state = 'gameover';
    g.stateT = 0;
    emit(g, 'gameover');
    return;
  }
  // Robots out on the maze go back into the factory to come out again.
  const back = g.robots.filter((r) => r.alive && !r.minion).map((r) => r.kind);
  g.queue.unshift(...back);
  g.robots = [];
  g.bullets = [];
  g.lasers = [];
  g.mines = [];
  resetBoss(g);
  g.player = makePlayer(g.maze.playerStart.x, g.maze.playerStart.y);
  g.player.invuln = g.boss ? 2 : 0.5;
  g.distTile = -1;
  updateDistances(g);
  g.spawnT = 1;
  g.combo = 0;
  g.state = 'intro';
  g.stateT = 0;
  g.introLength = 1.7;
  g.respawn = true;
  emit(g, 'respawn');
}

/** As in Pac-Man, a level is cleared by eating every dot. A boss level is cleared by destroying the boss. */
function checkClear(g: Game): void {
  if (g.boss ? g.boss.dead : g.dotsLeft <= 0) clearLevel(g);
}

function clearLevel(g: Game): void {
  g.state = 'clear';
  g.stateT = 0;
  popup(g, g.player.x, g.player.y - 1.1, 'YES!', '#7dff8a', 1.1);
  // The robots still out vanish, as Pac-Man's ghosts do.
  for (const r of g.robots) if (r.alive) killRobot(g, r, 'boss');
  g.robots = [];
  const par = g.boss ? 120 : 30 + g.maze.dotTotal * 0.6;
  const tally = [];
  if (!g.boss) tally.push({ label: `ROBOTS DESTROYED: ${g.kills}`, value: 0 });
  const time = Math.max(0, Math.round(par - g.levelT)) * 20;
  if (time > 0) tally.push({ label: 'TIME BONUS', value: time });
  if (g.levelHits === 0) tally.push({ label: 'NO DAMAGE', value: g.boss ? 5000 : 2500 });
  if (g.boss && g.dotsLeft === 0) tally.push({ label: 'CLEAN SWEEP', value: 3000 });
  if (g.boss) tally.push({ label: BOSS_SPECS[g.boss.kind].name + ' DESTROYED', value: 0 });
  for (const t of tally) if (t.value) addScore(g, t.value);
  g.tally = tally;
  if (g.boss) g.unlocked = Math.max(g.unlocked, Math.min(SECTORS.length - 1, g.spec.sector + 1));
  for (const b of g.bullets) if (b.enemy) burst(g, b.x, b.y, b.color, 3, 3, 0.4);
  g.bullets = [];
  g.lasers = [];
  for (const m of g.mines) burst(g, m.x, m.y, '#ffd23f', 6, 4, 0.5);
  g.mines = [];
  g.player.power = null;
  g.player.overdrive = 0;
  emit(g, 'clear');
}

function updateFx(g: Game, dt: number): void {
  for (const q of g.particles) {
    q.life -= dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    const k = Math.max(0, 1 - q.drag * dt);
    q.vx *= k;
    q.vy *= k;
  }
  g.particles = g.particles.filter((q) => q.life > 0);
  for (const q of g.popups) {
    q.t += dt;
    q.y -= dt * 1.1;
  }
  g.popups = g.popups.filter((q) => q.t < q.life);
  g.shake = Math.max(0, g.shake - dt * 2.2);
  g.flash = Math.max(0, g.flash - dt * 1.6);
  g.glitch = Math.max(0, g.glitch - dt);
  if (g.taunt) {
    g.taunt.t += dt;
    if (g.taunt.t > g.taunt.life) g.taunt = null;
  }
  if (g.banner) {
    g.banner.t += dt;
    if (g.banner.t > g.banner.life) g.banner = null;
  }
}

/** The robots shown waiting inside the factory. */
export function waitingRobots(g: Game): RobotKind[] {
  return g.queue.slice(0, 3);
}

export function robotsOut(g: Game): number {
  let n = 0;
  for (const r of g.robots) if (r.alive && !r.minion) n++;
  return n;
}

