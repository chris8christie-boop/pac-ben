import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { insetContour, wallContours } from '../lib/contours.ts';
import { LEVEL_COUNT, levelSpec } from '../lib/levels.ts';
import { COLS, DOOR, DX, DY, HOUSE, PATH, ROWS, WALL, distanceMap, generateMaze, tileAt, walkable } from '../lib/maze.ts';
import type { Maze } from '../lib/maze.ts';

function mazeFor(level: number): Maze {
  const spec = levelSpec(level);
  return generateMaze(level, { boss: spec.boss !== null, portals: spec.portals, removeChance: spec.removeChance, nodeChance: spec.nodeChance, tunnels: spec.tunnels });
}

const levels = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);

test('every level builds the same maze each time', () => {
  for (const level of [1, 7, 15, 30]) assert.deepEqual(mazeFor(level).tiles, mazeFor(level).tiles);
  assert.notDeepEqual(mazeFor(1).tiles, mazeFor(2).tiles);
});

test('mazes are mirrored left to right', () => {
  for (const level of levels) {
    const m = mazeFor(level);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = m.tiles[y * COLS + x] === WALL;
        const b = m.tiles[y * COLS + (COLS - 1 - x)] === WALL;
        assert.equal(a, b, `level ${level} tile ${x},${y}`);
      }
    }
  }
});

test('every corridor tile can be reached, and there are no dead ends', () => {
  for (const level of levels) {
    const m = mazeFor(level);
    const dist = distanceMap(m, [{ x: 13, y: m.playerStart.y }]);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (m.tiles[y * COLS + x] !== PATH) continue;
        assert.ok(dist[y * COLS + x] >= 0, `level ${level}: ${x},${y} unreachable`);
        let exits = 0;
        for (let d = 0; d < 4; d++) if (walkable(m, x + DX[d], y + DY[d])) exits++;
        if (m.portalLink[y * COLS + x] < 0) assert.ok(exits >= 2, `level ${level}: dead end at ${x},${y}`);
      }
    }
  }
});

test('corridors are one tile wide outside the boss arena', () => {
  for (const level of levels) {
    const m = mazeFor(level);
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS - 1; x++) {
        const open = [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => walkable(m, x + dx, y + dy));
        const inPlaza = m.plaza && x >= m.plaza.x && x < m.plaza.x + m.plaza.w - 1 && y >= m.plaza.y && y < m.plaza.y + m.plaza.h - 1;
        assert.ok(!open || inPlaza, `level ${level}: open 2x2 at ${x},${y}`);
      }
    }
  }
});

test('the factory, start, exits, tunnels and power cores are where the game expects them', () => {
  for (const level of levels) {
    const m = mazeFor(level);
    const boss = levelSpec(level).boss !== null;
    assert.equal(m.house === null, boss);
    assert.equal(m.plaza !== null, boss);
    if (m.house) {
      assert.equal(tileAt(m, 13, m.house.y), DOOR);
      assert.equal(tileAt(m, 12, m.house.y + 2), HOUSE);
      for (const e of m.exits) assert.ok(walkable(m, e.x, e.y));
    }
    assert.ok(walkable(m, 13, m.playerStart.y) && walkable(m, 14, m.playerStart.y));
    assert.ok(m.tunnelRows.length >= 1);
    for (const y of m.tunnelRows) assert.ok(walkable(m, 0, y) && walkable(m, COLS - 1, y));
    let cores = 0;
    let dots = 0;
    for (let i = 0; i < m.dots.length; i++) {
      if (m.dots[i] === 2) cores++;
      if (m.dots[i]) {
        dots++;
        assert.equal(m.tiles[i], PATH);
      }
    }
    assert.equal(cores, 4, `level ${level} power cores`);
    assert.equal(dots, m.dotTotal);
    assert.ok(dots > 150, `level ${level} has ${dots} dots`);
    assert.equal(m.portals.length, levelSpec(level).portals ? 4 : 0, `level ${level} pads`);
  }
});

test('wall outlines are closed loops with walls kept on one side', () => {
  for (const level of [1, 5, 13, 30]) {
    const m = mazeFor(level);
    const loops = wallContours(m);
    assert.ok(loops.length > 10);
    assert.ok(loops.some((l) => l.outer));
    for (const loop of loops) {
      assert.ok(loop.points.length >= 4);
      for (let i = 0; i < loop.points.length; i++) {
        const a = loop.points[i];
        const b = loop.points[(i + 1) % loop.points.length];
        assert.ok(a.x === b.x || a.y === b.y, 'edges are straight');
      }
      const inset = insetContour(loop.points, 0.36);
      assert.equal(inset.length, loop.points.length);
    }
  }
});
