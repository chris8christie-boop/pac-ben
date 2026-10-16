import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { damageBoss } from '../lib/bosses.ts';
import { createGame, drainEvents, hitPlayer, loadLevel, NO_INPUT, robotsOut, runSnapshot, startRun, STEP, titleRows, update } from '../lib/game.ts';
import { BOSS_ORDER, BOSS_SPECS, DIFFICULTIES, LEVEL_COUNT, levelSpec } from '../lib/levels.ts';
import { DOWN, DX, DY, LEFT, RIGHT, UP, atCentre, canGo, tileIndex } from '../lib/maze.ts';
import type { Controls, Game } from '../lib/types.ts';

const run = (g: Game, seconds: number, c: Partial<Controls> = {}) => {
  for (let t = 0; t < seconds; t += STEP) update(g, STEP, { ...NO_INPUT, ...c });
};

function playing(level = 1, seed = 7): Game {
  const g = createGame({ hiScore: 0, unlocked: 5, difficulty: 'hero' }, seed);
  startRun(g, 0);
  if (level !== 1) loadLevel(g, level);
  run(g, g.introLength + 0.05);
  assert.equal(g.state, 'play');
  return g;
}

/**
 * The test bot: heads for the nearest dot (or the boss) and fires all the time.
 * It plans from the tile centre it is about to reach.
 */
let goal = -1;
let goalLevel = -1;

/**
 * The test bot: heads for one dot at a time (or the boss) and fires all the time.
 * It plans from the tile centre it is about to reach, walks round teleport
 * pads when it can, and when it must use one it lets go of the controls so
 * Ben stops on the far side and it can plan again from there.
 */
function hunt(g: Game): Controls {
  const p = g.player;
  const m = g.maze;
  const control = (dir: number): Controls => ({ ...NO_INPUT, dir, fire: true, start: g.state === 'clear' });
  if (!atCentre(p) && p.dir < 0) return control(Number.isInteger(p.x) ? UP : LEFT);
  const boss = g.boss && !g.boss.dead ? g.boss : null;
  if (!boss && (goal < 0 || g.dots[goal] === 0 || goalLevel !== g.level)) {
    goal = -1;
    goalLevel = g.level;
  }
  const isTarget = (i: number) => (boss ? Math.hypot((i % 28) - boss.x, Math.floor(i / 28) - boss.y) < 2.5 : goal >= 0 ? i === goal : g.dots[i] > 0);

  // Plan from the tile centre Ben is about to reach.
  let startTile = tileIndex(p.x, p.y);
  let behind = -1;
  if (!atCentre(p)) {
    const ahead = (v: number, d: number) => (d > 0 ? Math.floor(v + 1e-6) + 1 : Math.ceil(v - 1e-6) - 1);
    const back = (v: number, d: number) => (d > 0 ? Math.floor(v + 1e-6) : Math.ceil(v - 1e-6));
    startTile = DX[p.dir] ? tileIndex(ahead(p.x, DX[p.dir]), p.y) : tileIndex(p.x, ahead(p.y, DY[p.dir]));
    behind = DX[p.dir] ? tileIndex(back(p.x, DX[p.dir]), p.y) : tileIndex(p.x, back(p.y, DY[p.dir]));
    // About to step onto a pad: let go, so Ben stops on the far side.
    if (m.portalLink[startTile] >= 0) return control(-1);
    if (isTarget(startTile)) return control(p.dir);
  }

  const plan = (usePads: boolean): number => {
    const first = new Int8Array(m.tiles.length).fill(-1);
    const seen = new Uint8Array(m.tiles.length);
    seen[startTile] = 1;
    if (behind >= 0) {
      seen[behind] = 1;
      if (m.portalLink[behind] >= 0) seen[m.portalLink[behind]] = 1;
    }
    const queue = [startTile];
    for (let q = 0; q < queue.length; q++) {
      const u = queue[q];
      if (u !== startTile && isTarget(u)) {
        if (!boss) goal = u;
        return first[u];
      }
      const ux = u % 28;
      const uy = (u - ux) / 28;
      for (let d = 0; d < 4; d++) {
        if (!canGo(m, ux, uy, d)) continue;
        let v = tileIndex(ux + DX[d], uy + DY[d]);
        if (m.portalLink[v] >= 0) {
          if (!usePads) continue;
          v = m.portalLink[v];
        }
        if (seen[v]) continue;
        seen[v] = 1;
        first[v] = u === startTile ? d : first[u];
        queue.push(v);
      }
    }
    return -1;
  };
  let dir = plan(false);
  if (dir < 0) dir = plan(true);
  if (dir >= 0) return control(dir);
  // Nothing reachable from here (the goal may sit behind the tile just left): pick another next frame.
  goal = -1;
  return control(p.dir);
}

test('levels get harder, and every fifth is a boss', () => {
  for (let L = 1; L <= LEVEL_COUNT; L++) {
    const spec = levelSpec(L);
    assert.equal(spec.boss, L % 5 === 0 ? BOSS_ORDER[L / 5 - 1] : null);
    if (L > 1) {
      const prev = levelSpec(L - 1);
      assert.ok(spec.robotSpeed > prev.robotSpeed);
      assert.ok(spec.overdrive <= prev.overdrive);
      assert.ok(spec.maxActive >= prev.maxActive);
      assert.ok(spec.respawn <= prev.respawn);
    }
  }
  assert.equal(new Set(BOSS_ORDER).size, 6);
});

test('the title starts a run at level 1 with the difficulty\'s lives', () => {
  const g = createGame({ hiScore: 1234, unlocked: 0 }, 1);
  assert.equal(g.state, 'title');
  run(g, 0.5);
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.state, 'intro');
  assert.equal(g.level, 1);
  assert.equal(g.lives, DIFFICULTIES.rookie.lives);
  assert.equal(g.hiScore, 1234);
});

test('sectors already reached can be chosen on the title screen', () => {
  const g = createGame({ hiScore: 0, unlocked: 2, difficulty: 'hero' }, 1);
  run(g, 0.5);
  assert.deepEqual(titleRows(g), ['new', 'difficulty', 'sector']);
  update(g, STEP, { ...NO_INPUT, down: true });
  update(g, STEP, { ...NO_INPUT, down: true });
  assert.equal(g.menuRow, 2);
  update(g, STEP, { ...NO_INPUT, left: true });
  update(g, STEP, { ...NO_INPUT, left: true });
  assert.equal(g.menuSector, 0);
  update(g, STEP, { ...NO_INPUT, right: true });
  update(g, STEP, { ...NO_INPUT, right: true });
  update(g, STEP, { ...NO_INPUT, right: true });
  assert.equal(g.menuSector, 2);
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.level, 11);
});

test('the difficulty picked on the title changes lives, speeds and boss health', () => {
  const g = createGame({ hiScore: 0, unlocked: 5 }, 1);
  assert.equal(g.difficulty, 'rookie', 'first run defaults to Rookie');
  run(g, 0.5);
  update(g, STEP, { ...NO_INPUT, down: true });
  assert.equal(titleRows(g)[g.menuRow], 'difficulty');
  update(g, STEP, { ...NO_INPUT, right: true });
  update(g, STEP, { ...NO_INPUT, right: true });
  update(g, STEP, { ...NO_INPUT, right: true });
  assert.equal(g.difficulty, 'legend');
  update(g, STEP, { ...NO_INPUT, menuRow: 1, left: true });
  assert.equal(g.difficulty, 'hero');
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.lives, DIFFICULTIES.hero.lives);
  const rookie = levelSpec(7, 'rookie');
  const hero = levelSpec(7, 'hero');
  const legend = levelSpec(7, 'legend');
  assert.ok(rookie.robotSpeed < hero.robotSpeed && hero.robotSpeed < legend.robotSpeed);
  assert.ok(rookie.overdrive > hero.overdrive);
  assert.ok(rookie.respawn > hero.respawn);
  assert.ok(rookie.bossHp < hero.bossHp && hero.bossHp < legend.bossHp);
  assert.ok(rookie.bulletSpeed < hero.bulletSpeed && hero.bulletSpeed < legend.bulletSpeed);
  for (const d of ['rookie', 'legend'] as const) {
    const b = createGame({ hiScore: 0, unlocked: 5 }, 1);
    startRun(b, 0, d);
    loadLevel(b, 5);
    assert.equal(b.boss!.maxHp, Math.round(BOSS_SPECS.boltz.hp * DIFFICULTIES[d].bossHp), `${d} boss`);
    assert.equal(b.lives, DIFFICULTIES[d].lives);
  }
});

test('a run can be continued from its save, and finishing clears it', () => {
  const g = createGame({ hiScore: 0, unlocked: 5, run: { level: 7, score: 12345, lives: 2, difficulty: 'hero' } }, 1);
  run(g, 0.5);
  assert.deepEqual(titleRows(g), ['continue', 'new', 'difficulty', 'sector']);
  assert.equal(g.menuRow, 0);
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.state, 'intro');
  assert.equal(g.level, 7);
  assert.equal(g.score, 12345);
  assert.equal(g.lives, 2);
  assert.equal(g.difficulty, 'hero');
  assert.deepEqual(runSnapshot(g), { level: 7, score: 12345, lives: 2, difficulty: 'hero' });
  g.state = 'gameover';
  assert.equal(runSnapshot(g), null);
  // A broken save is ignored.
  const bad = createGame({ hiScore: 0, unlocked: 0, run: { level: 99, score: 1, lives: 0, difficulty: 'hero' } }, 1);
  assert.equal(bad.savedRun, null);
  assert.deepEqual(titleRows(bad), ['new', 'difficulty']);
});

test('Ben moves along corridors, turns at junctions and eats dots', () => {
  const g = playing();
  const p = g.player;
  const y = p.y;
  run(g, 0.5, { dir: LEFT });
  assert.equal(p.y, y);
  assert.ok(p.x < 13.5 - 2, `moved left to ${p.x}`);
  assert.ok(g.score > 0, 'ate dots');
  // Ask to go up: Ben keeps going left until there's an opening, then turns.
  run(g, 1.5, { dir: UP });
  assert.ok(p.y < y, 'turned up');
  assert.ok(Number.isInteger(p.x), 'turned on a tile centre');
});

test('Ben stops at walls instead of going through them', () => {
  const g = playing();
  for (const d of [UP, RIGHT, DOWN, LEFT]) {
    run(g, 3, { dir: d });
    const p = g.player;
    assert.ok(g.maze.tiles[Math.round(p.y) * 28 + Math.round(p.x)] === 1);
  }
});

test('shooting a robot destroys it and scores', () => {
  const g = playing();
  run(g, 1);
  const r = g.robots.find((x) => x.spawnT <= 0);
  assert.ok(r, 'a robot is out');
  g.spec = { ...g.spec, robotSpeed: 0 };
  r.x = Math.round(r.x);
  r.y = Math.round(r.y);
  // Put Ben a few tiles from it on the same corridor, facing it.
  for (const d of [LEFT, RIGHT, UP, DOWN]) {
    let x = r.x;
    let y = r.y;
    let ok = true;
    for (let k = 0; k < 3; k++) {
      if (!canGo(g.maze, x, y, d)) ok = false;
      x += DX[d];
      y += DY[d];
    }
    if (!ok) continue;
    g.player.x = x;
    g.player.y = y;
    g.player.dir = -1;
    g.player.facing = (d + 2) % 4;
    break;
  }
  const score = g.score;
  run(g, 0.4, { fire: true });
  assert.equal(r.alive, false);
  assert.equal(g.kills, 1);
  assert.ok(g.score >= score + 100);
});

test('a power core sends robots running, and Ben can ram them', () => {
  const g = playing();
  run(g, 1.5);
  const i = g.dots.indexOf(2);
  const p = g.player;
  p.x = i % 28;
  p.y = Math.floor(i / 28);
  run(g, STEP * 2);
  assert.ok(p.overdrive > 0);
  for (const r of g.robots) assert.ok(r.frightened);
  const r = g.robots[0];
  r.spawnT = 0;
  r.x = p.x;
  r.y = p.y;
  const score = g.score;
  run(g, STEP * 2);
  assert.equal(r.alive, false);
  assert.ok(g.score >= score + 200);
  assert.equal(g.state, 'play');
});

test('touching a robot costs a life, then the robots go back to the factory', () => {
  const g = playing();
  run(g, 2);
  const out = g.robots.length;
  assert.ok(out > 0);
  hitPlayer(g);
  assert.equal(g.state, 'dying');
  assert.equal(g.lives, 2);
  run(g, 2.1);
  assert.equal(g.state, 'intro');
  assert.equal(g.robots.length, 0);
  assert.ok(g.queue.length >= out + 3, 'they wait in the factory');
  run(g, g.introLength + 3);
  assert.ok(robotsOut(g) > 0, 'and come out again');
});

test('a level is cleared by eating every dot, not by shooting robots', () => {
  const g = playing();
  g.player.invuln = 99;
  run(g, 3);
  // Destroy everything out on the maze: the level carries on and the factory rebuilds them.
  for (const r of g.robots) r.alive = false;
  g.queue = g.queue.slice(0, 3);
  run(g, levelSpec(1).respawn + levelSpec(1).spawnEvery * 2);
  assert.equal(g.state, 'play');
  assert.ok(robotsOut(g) > 0, 'robots came back');
  // Leave one dot, right where Ben is going.
  const p = g.player;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  g.dots.fill(0);
  for (const d of [LEFT, RIGHT, UP, DOWN]) {
    if (!canGo(g.maze, x, y, d)) continue;
    g.dots[(y + DY[d]) * 28 + x + DX[d]] = 1;
    g.dotsLeft = 1;
    for (const r of g.robots) r.alive = false;
    g.robots = [];
    g.spawnT = 99;
    run(g, 0.4, { dir: d });
    break;
  }
  assert.equal(g.dotsLeft, 0);
  assert.equal(g.state, 'clear');
  run(g, 4);
  assert.equal(g.level, 2);
});

test('a shield absorbs one hit', () => {
  const g = playing();
  g.player.shield = true;
  hitPlayer(g);
  assert.equal(g.state, 'play');
  assert.equal(g.lives, 3);
  assert.equal(g.player.shield, false);
  g.player.invuln = 0;
  hitPlayer(g);
  assert.equal(g.state, 'dying');
});

test('losing every life ends the game and keeps the high score', () => {
  const g = playing();
  g.score = 4321;
  g.hiScore = 4321;
  for (let i = 0; i < 3; i++) {
    g.player.invuln = 0;
    hitPlayer(g);
    run(g, 2.1);
    if (g.state === 'intro') run(g, g.introLength + 0.05);
  }
  assert.equal(g.state, 'gameover');
  assert.equal(g.hiScore, 4321);
  run(g, 1.6);
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.state, 'title');
});

test('pausing freezes the game', () => {
  const g = playing();
  run(g, 0.2, { dir: LEFT });
  update(g, STEP, { ...NO_INPUT, pause: true });
  assert.ok(g.paused);
  const x = g.player.x;
  run(g, 1, { dir: LEFT });
  assert.equal(g.player.x, x);
  update(g, STEP, { ...NO_INPUT, pause: true });
  assert.ok(!g.paused);
});

test('a careful bot can clear every level, bosses included, without errors', () => {
  const g = createGame({ hiScore: 0, unlocked: 5, difficulty: 'hero' }, 99);
  startRun(g, 0);
  const cleared: number[] = [];
  let level = 1;
  for (let t = 0; t < 8000 && g.state !== 'victory'; t += STEP) {
    g.player.invuln = 1;
    update(g, STEP, hunt(g));
    drainEvents(g);
    if (g.level !== level) {
      cleared.push(level);
      level = g.level;
    }
  }
  assert.equal(g.state, 'victory', `stopped on level ${g.level} (${g.state})`);
  assert.equal(cleared.length, LEVEL_COUNT - 1);
  assert.ok(g.unlocked === 5);
});

test('each boss changes phase as it is hurt, and the level clears when it is destroyed', () => {
  const lastPhase: Record<string, number> = { boltz: 2, magnetron: 2, shredder: 3, hydra: 2, glitch: 2, omega: 3 };
  for (const level of [5, 10, 15, 20, 25, 30]) {
    const g = playing(level);
    const b = g.boss!;
    let seen = 1;
    let ticks = 0;
    for (let t = 0; t < 300 && g.state !== 'clear'; t += STEP) {
      g.player.invuln = 1;
      // Knock out Hydra's shield drones so its core opens up.
      if (b.mode === 'shielded') for (const d of b.drones) d.alive = false;
      update(g, STEP, NO_INPUT);
      drainEvents(g);
      if (++ticks % 30 === 0 && !b.guarded) damageBoss(g, 1);
      seen = Math.max(seen, b.phase);
    }
    assert.equal(seen, lastPhase[b.kind], `${b.kind} phases`);
    assert.ok(b.dead, `${b.kind} destroyed`);
    assert.equal(g.state, 'clear');
    assert.equal(g.robots.length, 0, 'minions go with it');
  }
});
