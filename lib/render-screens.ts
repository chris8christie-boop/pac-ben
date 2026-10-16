/* The title, level intro, level clear, pause, game over and victory screens. */
import { GW, GH, HUD_TOP, TAU, UI, rgba, glow, roundRect, text, panel } from './render-util.ts';
import type { Rect, View } from './render-util.ts';
import { mazeCache } from './render-maze.ts';
import { drawBen } from './render-ben.ts';
import { drawRobot } from './render-robots.ts';
import { drawShot } from './render-fx.ts';
import { BOSS_SPECS, CREDITS, DIFFICULTIES, DIFFICULTY_ORDER, LEVEL_COUNT, ROBOT_SPECS, SECTORS } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { COLS, ROWS } from './maze.ts';
import { titleRows } from './game.ts';
import type { Bullet, Game } from './types.ts';

export function drawIntro(view: View, g: Game): void {
  if (g.respawn) return;
  const ctx = view.ctx;
  const t = g.stateT;
  const sector = SECTORS[g.spec.sector];
  const fade = Math.min(1, t * 4, (g.introLength - 0.9 - t) * 4);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  if (g.spec.boss) {
    const spec = BOSS_SPECS[g.spec.boss];
    // Hazard stripes.
    for (const y0 of [HUD_TOP + 8, HUD_TOP + 20.4]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, GW, 0.9);
      ctx.clip();
      ctx.fillStyle = '#1a0004';
      ctx.fillRect(0, y0, GW, 0.9);
      ctx.fillStyle = '#ff2a3d';
      for (let x = -2 + ((g.time * 4) % 1.6); x < GW + 2; x += 1.6) {
        ctx.beginPath();
        ctx.moveTo(x, y0 + 0.9);
        ctx.lineTo(x + 0.8, y0);
        ctx.lineTo(x + 1.4, y0);
        ctx.lineTo(x + 0.6, y0 + 0.9);
        ctx.fill();
      }
      ctx.restore();
    }
    panel(ctx, 1.5, HUD_TOP + 9.4, 25, 10.4, '#ff2a3d');
    const flash = Math.floor(g.time * 4) % 2 === 0;
    text(view, '⚠ WARNING ⚠', 14, HUD_TOP + 10.9, 1.25, flash ? '#ff2a3d' : '#ffffff', { weight: 900, glow: '#ff2a3d' });
    text(view, 'BOSS APPROACHING', 14, HUD_TOP + 12.3, 0.55, '#ffb3bb', { weight: 700 });
    text(view, spec.name, 14, HUD_TOP + 14.4, 1.7, spec.color, { weight: 900, glow: spec.color, maxWidth: 23 });
    text(view, spec.title, 14, HUD_TOP + 16.2, 0.6, '#ffffff', { weight: 700 });
    text(view, spec.intro.toUpperCase(), 14, HUD_TOP + 17.9, 0.45, '#9aa3c7', { weight: 600, maxWidth: 23 });
  } else {
    const h = g.spec.newKind ? 9.8 : 5.6;
    const y0 = HUD_TOP + 15.5 - h / 2 - (g.spec.newKind ? 0 : 2.2);
    panel(ctx, 4, y0, 20, h, sector.wall);
    text(view, `LEVEL ${g.level}`, 14, y0 + 1.6, 1.4, '#ffffff', { weight: 900, glow: sector.wall });
    text(view, `SECTOR ${g.spec.sector + 1}: ${sector.name}`, 14, y0 + 3.2, 0.55, sector.wall, { weight: 800 });
    text(view, `${g.level} OF ${LEVEL_COUNT}  ·  EAT EVERY DOT`, 14, y0 + 4.3, 0.42, '#8a93b8');
    if (g.spec.newKind) {
      const spec = ROBOT_SPECS[g.spec.newKind];
      ctx.strokeStyle = rgba(sector.wall, 0.4);
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(6, y0 + 5.2);
      ctx.lineTo(22, y0 + 5.2);
      ctx.stroke();
      text(view, 'NEW ROBOT', 14, y0 + 5.9, 0.45, '#ffd23f', { weight: 900 });
      drawRobot(ctx, g.spec.newKind, 7.6, y0 + 7.7, 1, { t: g.time, scale: 1.5 });
      text(view, spec.name, 9.6, y0 + 7.2, 0.8, spec.color, { align: 'left', weight: 900 });
      text(view, spec.blurb.toUpperCase(), 9.6, y0 + 8.4, 0.38, '#c8cfe8', { align: 'left', maxWidth: 13.6 });
    }
  }
  ctx.restore();
}

export function drawClear(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.stateT;
  if (t < 0.6) return;
  const sector = SECTORS[g.spec.sector];
  const fade = Math.min(1, (t - 0.6) * 4);
  ctx.save();
  ctx.globalAlpha = fade;
  const lines = g.tally;
  const h = 4.4 + lines.length * 1.1;
  const y0 = HUD_TOP + 15.5 - h / 2;
  panel(ctx, 3.5, y0, 21, h, sector.wall);
  const title = g.boss ? 'BOSS DESTROYED!' : 'LEVEL CLEAR!';
  text(view, title, 14, y0 + 1.5, 1.2, '#ffd23f', { weight: 900, glow: '#ffb000', maxWidth: 19 });
  lines.forEach((line, i) => {
    if (t < 0.9 + i * 0.3) return;
    const y = y0 + 3 + i * 1.1;
    text(view, line.label, 5, y, 0.5, '#c8cfe8', { align: 'left', maxWidth: 12 });
    if (line.value) text(view, `+${line.value}`, 23, y, 0.55, '#ffffff', { align: 'right', weight: 800 });
  });
  if (g.level % 5 === 0 && g.level < LEVEL_COUNT) {
    text(view, `SECTOR ${g.spec.sector + 2} UNLOCKED`, 14, y0 + h - 0.8, 0.45, '#7dff8a', { weight: 800 });
  }
  ctx.restore();
}

export function drawPause(view: View, g: Game): void {
  const ctx = view.ctx;
  ctx.fillStyle = 'rgba(2,3,10,0.72)';
  ctx.fillRect(0, 0, GW, GH);
  const sector = SECTORS[g.spec.sector];
  text(view, 'PAUSED', 14, 13.2, 1.6, '#ffffff', { weight: 900, glow: sector.wall });
  for (const [r, label, color] of [
    [UI.resume, 'RESUME', '#7dff8a'],
    [UI.quit, 'QUIT TO TITLE', '#ff6680'],
  ] as const) {
    ctx.fillStyle = rgba(color, 0.12);
    roundRect(ctx, r.x, r.y, r.w, r.h, 0.5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.07;
    ctx.stroke();
    text(view, label, r.x + r.w / 2, r.y + r.h / 2, 0.62, color, { weight: 900 });
  }
  if (!view.layout.touch) {
    if (!view.focused) text(view, 'CLICK THE GAME TO USE THE KEYBOARD AGAIN', 14, 24, 0.45, '#ffd23f', { weight: 800, maxWidth: 25 });
    else text(view, 'P OR ESC: RESUME  ·  Q: QUIT  ·  M: SOUND', 14, 24, 0.42, '#8a93b8');
  }
}

export function drawGameOver(view: View, g: Game): void {
  const ctx = view.ctx;
  const a = Math.min(1, g.stateT * 2);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(2,3,10,0.6)';
  ctx.fillRect(0, HUD_TOP, GW, ROWS);
  text(view, 'GAME OVER', 14, 14, 2, '#ff3b5c', { weight: 900, glow: '#ff3b5c' });
  text(view, `SCORE ${g.score}`, 14, 16.6, 0.8, '#ffffff', { weight: 800 });
  text(view, `REACHED LEVEL ${g.level} OF ${LEVEL_COUNT}`, 14, 18, 0.5, '#8a93b8');
  if (g.score > 0 && g.score >= g.hiScore) text(view, 'NEW HIGH SCORE!', 14, 19.6, 0.7, '#ffd23f', { weight: 900, glow: '#ffb000' });
  if (g.stateT > 1.5 && Math.floor(g.time * 2) % 2 === 0) {
    text(view, view.layout.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER TO CONTINUE', 14, 22.5, 0.55, '#ffffff', { weight: 800 });
  }
  if (g.unlocked > 0) text(view, 'YOU CAN RESTART FROM ANY SECTOR YOU HAVE REACHED', 14, 24, 0.36, '#8a93b8', { maxWidth: 25 });
  ctx.restore();
}

export function drawVictory(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.stateT;
  ctx.fillStyle = 'rgba(2,3,10,0.75)';
  ctx.fillRect(0, 0, GW, GH);
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i / 6) * TAU;
    glow(ctx, 14 + Math.cos(a) * 9, 15 + Math.sin(a * 1.3) * 6, 4, SECTORS[i].wall, 0.35);
  }
  text(view, 'YOU WIN!', 14, 10, 2.4, '#ffd23f', { weight: 900, glow: '#ffb000' });
  text(view, 'ALL 30 LEVELS CLEARED', 14, 12.6, 0.7, '#ffffff', { weight: 800 });
  text(view, 'OMEGA IS SCRAP. THE MAZE IS FREE.', 14, 13.9, 0.5, '#c8cfe8');
  drawBen(ctx, 14, 17.5, 1, t * 8, { t, moving: true, scale: 2.4 });
  text(view, `FINAL SCORE ${g.score}`, 14, 21.5, 0.9, '#ffffff', { weight: 900 });
  if (g.score >= g.hiScore) text(view, 'NEW HIGH SCORE!', 14, 23, 0.6, '#ffd23f', { weight: 900 });
  if (t > 1.5 && Math.floor(g.time * 2) % 2 === 0) text(view, view.layout.touch ? 'TAP TO CONTINUE' : 'PRESS ENTER', 14, 26, 0.55, '#ffffff', { weight: 800 });
}

export function drawTitle(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.time;
  const cache = mazeCache(view, g);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.drawImage(cache.canvas, 0, HUD_TOP, COLS, ROWS);
  ctx.restore();
  const vg = ctx.createRadialGradient(14, 15, 3, 14, 15, 22);
  vg.addColorStop(0, 'rgba(3,5,13,0.2)');
  vg.addColorStop(1, 'rgba(3,5,13,0.9)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, HUD_TOP, GW, ROWS);

  // Logo.
  const wobble = Math.sin(t * 2) * 0.08;
  text(view, 'PAC BEN', 14, 7.2 + wobble, 3.6, '#ffd23f', { weight: 900, glow: '#ff9d00', stroke: '#7a3a00', maxWidth: 25 });
  text(view, 'SHOOT THE ROBOTS · CLEAR THE MAZE', 14, 9.6, 0.5, '#8fb0ff', { weight: 700 });

  // Cast list, like Pac-Man's attract screen.
  text(view, 'ROBOT  ·  WHAT IT DOES', 14, 11.6, 0.42, '#8a93b8', { weight: 700 });
  const cast: RobotKind[] = ['chaser', 'ambusher', 'flanker', 'wanderer'];
  cast.forEach((kind, i) => {
    const y = 13 + i * 1.6;
    const appear = Math.min(1, Math.max(0, (g.stateT - 0.3 - i * 0.35) * 3));
    if (appear <= 0) return;
    ctx.save();
    ctx.globalAlpha = appear;
    const spec = ROBOT_SPECS[kind];
    drawRobot(ctx, kind, 5.4, y, 1, { t: t + i });
    text(view, spec.name, 7, y, 0.62, spec.color, { align: 'left', weight: 900 });
    text(view, spec.blurb.toUpperCase(), 13.2, y, 0.36, '#c8cfe8', { align: 'left', maxWidth: 13.5 });
    ctx.restore();
  });

  // Chase across the screen: robots chase Ben, then Ben turns the tables.
  const cycle = t % 9;
  const y = 20.6;
  if (cycle < 4.5) {
    const bx = -2 + cycle * 7;
    drawBen(ctx, bx, y, 1, t * 14, { t, moving: true });
    for (let i = 0; i < 4; i++) drawRobot(ctx, cast[i], bx - 2.2 - i * 1.3, y, 1, { t: t + i });
  } else {
    const k = cycle - 4.5;
    const bx = 30 - k * 7.5;
    const fleeX = 30 - k * 5.5;
    for (let i = 0; i < 4; i++) {
      const rx = fleeX - 3 - i * 1.3;
      if (rx < bx - 0.6) drawRobot(ctx, cast[i], rx, y, 3, { t: t + i, frightened: true, frightLeft: 4.5 - k });
    }
    drawBen(ctx, bx, y, 3, t * 14, { t, moving: true, overdrive: 1 });
    for (let s = 0; s < 3; s++) {
      const sx = bx - 1.2 - ((t * 20 + s * 3) % 7);
      if (sx > bx - 7) drawShot(ctx, { kind: 'shot', x: sx, y, vx: -1, vy: 0, color: '#fff2a0' } as Bullet, t);
    }
  }

  // The menu.
  const rows = titleRows(g);
  if (!view.layout.touch && !view.focused && Math.floor(t * 2.2) % 2 === 0) {
    text(view, 'CLICK HERE TO PLAY', 14, 22.6, 0.6, '#ffffff', { weight: 900, glow: '#ffd23f' });
  }
  rows.forEach((row, i) => {
    const r = titleRowRect(g, i);
    const lit = i === g.menuRow;
    const cy = r.y + r.h / 2;
    if (lit) {
      ctx.fillStyle = 'rgba(255,210,63,0.1)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 0.5);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffd23f', 0.6 + Math.sin(t * 6) * 0.3);
      ctx.lineWidth = 0.07;
      ctx.stroke();
    }
    const ink = lit ? '#ffffff' : '#9aa3c7';
    const arrows = (canLeft: boolean, canRight: boolean) => {
      if (canLeft) text(view, '◀', r.x + 1, cy, 0.7, lit ? '#ffd23f' : '#5a6388', { weight: 900 });
      if (canRight) text(view, '▶', r.x + r.w - 1, cy, 0.7, lit ? '#ffd23f' : '#5a6388', { weight: 900 });
    };
    switch (row) {
      case 'continue': {
        const run = g.savedRun!;
        text(view, `CONTINUE  ·  LEVEL ${run.level}  ·  ${DIFFICULTIES[run.difficulty].name}`, 14, cy, 0.6, lit ? '#7dff8a' : ink, { weight: 900, glow: lit ? '#7dff8a' : undefined, maxWidth: r.w - 1 });
        break;
      }
      case 'new':
        text(view, 'NEW GAME', 14, cy, 0.66, lit ? '#ffd23f' : ink, { weight: 900, glow: lit ? '#ffb000' : undefined });
        break;
      case 'difficulty': {
        const d = DIFFICULTIES[g.difficulty];
        const i0 = DIFFICULTY_ORDER.indexOf(g.difficulty);
        text(view, 'DIFFICULTY', r.x + 2.1, cy, 0.42, ink, { align: 'left', weight: 700 });
        text(view, d.name, r.x + r.w - 2.1, cy - (lit ? 0.22 : 0), 0.62, d.color, { align: 'right', weight: 900, glow: lit ? d.color : undefined });
        if (lit) text(view, d.blurb.toUpperCase(), r.x + r.w - 2.1, cy + 0.42, 0.3, '#c8cfe8', { align: 'right', maxWidth: r.w - 8 });
        arrows(i0 > 0, i0 < DIFFICULTY_ORDER.length - 1);
        break;
      }
      case 'sector': {
        const sector = SECTORS[g.menuSector];
        text(view, 'START AT', r.x + 2.1, cy, 0.42, ink, { align: 'left', weight: 700 });
        text(view, `SECTOR ${g.menuSector + 1}: ${sector.name}`, r.x + r.w - 2.1, cy, 0.5, lit ? sector.wall : ink, { align: 'right', weight: 900, maxWidth: r.w - 8 });
        arrows(g.menuSector > 0, g.menuSector < g.unlocked);
        break;
      }
    }
  });

  const hints = view.layout.touch
    ? ['TAP A ROW TO CHOOSE  ·  TAP AGAIN TO START', 'LEFT THUMB STEERS  ·  RIGHT THUMB FIRES']
    : ['↑ ↓ CHOOSE  ·  ◀ ▶ CHANGE  ·  ENTER: START', 'HOLD THE ARROWS TO MOVE  ·  SPACE: FIRE  ·  P: PAUSE  ·  M: SOUND'];
  text(view, hints[0], 14, 30.4, 0.4, '#c8cfe8', { maxWidth: 26 });
  text(view, hints[1], 14, 31.4, 0.38, '#8a93b8', { maxWidth: 26 });
  text(view, 'EAT EVERY DOT TO CLEAR A LEVEL  ·  POWER CORES SEND THE ROBOTS RUNNING', 14, 32.7, 0.36, '#ffd23f', { weight: 800, maxWidth: 26 });
  text(view, CREDITS, 14, 34.6, 0.42, '#ffd23f', { weight: 900, glow: '#ff9d00', alpha: 0.85 });
}

/** Where row `i` of the title menu sits, in tiles. */
export function titleRowRect(g: Game, i: number): Rect {
  const rows = titleRows(g);
  const top = 23.3 + (4 - rows.length) * 0.45;
  return { x: 4, y: top + i * 1.55, w: 20, h: 1.4 };
}
