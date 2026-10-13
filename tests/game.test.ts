import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { damageBoss } from '../lib/bosses.ts';
import { createGame, drainEvents, hitPlayer, loadLevel, NO_INPUT, robotsLeft, startRun, STEP, update } from '../lib/game.ts';
import { BOSS_ORDER, LEVEL_COUNT, levelSpec } from '../lib/levels.ts';
import { DOWN, DX, DY, LEFT, RIGHT, UP, canGo, distanceMap } from '../lib/maze.ts';
import type { Controls, Game } from '../lib/types.ts';

const run = (g: Game, seconds: number, c: Partial<Controls> = {}) => {
  for (let t = 0; t < seconds; t += STEP) update(g, STEP, { ...NO_INPUT, ...c });
};

function playing(level = 1, seed = 7): Game {
  const g = createGame({ hiScore: 0, unlocked: 5 }, seed);
  startRun(g, 0);
  if (level !== 1) loadLevel(g, level);
  run(g, g.introLength + 0.05);
  assert.equal(g.state, 'play');
  return g;
}

/** Heads for the nearest robot (or the boss) and fires. */
function hunt(g: Game): Controls {
  const p = g.player;
  const targets = g.boss && !g.boss.dead ? [{ x: Math.round(g.boss.x), y: Math.round(g.boss.y) }] : g.robots.filter((r) => r.alive).map((r) => ({ x: Math.round(r.x), y: Math.round(r.y) }));
  let dir = -1;
  if (targets.length) {
    const map = distanceMap(g.maze, targets);
    let best = Infinity;
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    for (let d = 0; d < 4; d++) {
      if (!canGo(g.maze, px, py, d)) continue;
      const v = map[(py + DY[d]) * 28 + ((px + DX[d] + 28) % 28)];
      if (v >= 0 && v < best) {
        best = v;
        dir = d;
      }
    }
  }
  return { ...NO_INPUT, dir, fire: true, start: g.state === 'clear' };
}

test('levels get harder, and every fifth is a boss', () => {
  for (let L = 1; L <= LEVEL_COUNT; L++) {
    const spec = levelSpec(L);
    assert.equal(spec.boss, L % 5 === 0 ? BOSS_ORDER[L / 5 - 1] : null);
    if (L > 1) {
      const prev = levelSpec(L - 1);
      assert.ok(spec.robotSpeed > prev.robotSpeed);
      assert.ok(spec.overdrive <= prev.overdrive);
      if (!spec.boss && !prev.boss) assert.ok(spec.quota >= prev.quota);
    }
  }
  assert.equal(new Set(BOSS_ORDER).size, 6);
});

test('the title starts a run at level 1 with three lives', () => {
  const g = createGame({ hiScore: 1234, unlocked: 0 }, 1);
  assert.equal(g.state, 'title');
  run(g, 0.5);
  update(g, STEP, { ...NO_INPUT, start: true });
  assert.equal(g.state, 'intro');
  assert.equal(g.level, 1);
  assert.equal(g.lives, 3);
  assert.equal(g.hiScore, 1234);
});

test('sectors already reached can be chosen on the title screen', () => {
  const g = createGame({ hiScore: 0, unlocked: 2 }, 1);
  run(g, 0.5);
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
  const before = robotsLeft(g);
  const score = g.score;
  run(g, 0.4, { fire: true });
  assert.equal(r.alive, false);
  assert.equal(robotsLeft(g), before - 1);
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
  assert.equal(robotsLeft(g), levelSpec(1).quota);
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
  const g = createGame({ hiScore: 0, unlocked: 5 }, 99);
  startRun(g, 0);
  const cleared: number[] = [];
  let level = 1;
  for (let t = 0; t < 4000 && g.state !== 'victory'; t += STEP) {
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
