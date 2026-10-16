/* The title, level intro, level clear, pause, game over and victory screens. */
import { GW, GH, HUD_TOP, TAU, UI, rgba, glow, roundRect, text, panel } from './render-util.ts';
import type { Rect, View } from './render-util.ts';
import { mazeCache } from './render-maze.ts';
import { drawBen } from './render-ben.ts';
import { drawShowBoss } from './render-bosses.ts';
import { drawRobot } from './render-robots.ts';
import { drawShot } from './render-fx.ts';
import { BOSS_ORDER, BOSS_SPECS, CREDITS, CREDITS_FADE, CREDITS_TIME, DIFFICULTIES, DIFFICULTY_ORDER, LEVEL_COUNT, ROBOT_SPECS, SECTORS, STORY, STORY_TYPE_SPEED } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { COLS, ROWS } from './maze.ts';
import { storyTyped, titleRows } from './game.ts';
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

function stars(view: View, t: number, height: number): void {
  const ctx = view.ctx;
  for (let i = 0; i < 80; i++) {
    const x = (i * 137.5) % GW;
    const y = (i * 71.3 + t * 0.25 * (1 + (i % 3))) % height;
    ctx.fillStyle = `rgba(200,220,255,${0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + i))})`;
    ctx.fillRect(x, y, 0.08 + (i % 3) * 0.03, 0.08 + (i % 3) * 0.03);
  }
}

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/* ---------- the opening story ---------- */

function cityScene(view: View, g: Game, t: number): void {
  const ctx = view.ctx;
  const taken = Math.max(0, Math.min(1, (t - STORY[0].lines[0].length / STORY_TYPE_SPEED) / 0.8));
  const neon = taken > 0.5 ? '#ff3355' : '#2f7bff';
  // Sky turns red as Omega arrives.
  if (taken > 0) {
    ctx.fillStyle = `rgba(120,0,20,${taken * 0.35})`;
    ctx.fillRect(0, 1, GW, 21);
  }
  if (taken > 0) drawShowBoss(view, g, 'omega', 14, 6.4, 1.4, taken);
  if (taken > 0 && taken < 0.6) {
    ctx.fillStyle = `rgba(255,60,90,${(0.6 - taken) * 0.8})`;
    ctx.fillRect(0, 1, GW, 21);
  }
  // Skyline.
  for (let i = 0; i < 10; i++) {
    const x = i * 2.9 - 0.5;
    const h = 4 + ((i * 7) % 5) * 1.5;
    ctx.fillStyle = '#0b1230';
    ctx.fillRect(x, 20 - h, 2.4, h);
    ctx.strokeStyle = rgba(neon, 0.8);
    ctx.lineWidth = 0.07;
    ctx.strokeRect(x, 20 - h, 2.4, h);
    for (let wy = 20 - h + 0.6; wy < 19.4; wy += 1) {
      for (let wx = x + 0.4; wx < x + 2.1; wx += 0.7) {
        const lit = ((wx * 13 + wy * 7) | 0) % 3 !== 0;
        if (lit) {
          ctx.fillStyle = taken > 0.5 ? 'rgba(255,90,110,0.7)' : 'rgba(255,226,140,0.7)';
          ctx.fillRect(wx, wy, 0.3, 0.4);
        }
      }
    }
  }
  ctx.fillStyle = rgba(neon, 0.6);
  ctx.fillRect(0, 20, GW, 0.08);
  // The robots, going about their day, until their eyes turn red.
  const kinds: RobotKind[] = ['chaser', 'ambusher', 'flanker', 'wanderer', 'tank'];
  kinds.forEach((kind, i) => {
    const x = ((i * 5.5 + t * 1.2 * (taken > 0.5 ? 0 : 1)) % 30) - 1;
    if (taken > 0.5) glow(ctx, x, 19.2, 1.1, '#ff2a3d', 0.7);
    drawRobot(ctx, kind, x, 19.2, taken > 0.5 ? 2 : 1, { t: g.time + i, scale: 1.25 });
  });
}

function mazesScene(view: View, g: Game, t: number): void {
  const ctx = view.ctx;
  const cache = mazeCache(view, g);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(cache.canvas, 7.5, 3, 13, (13 * ROWS) / COLS);
  ctx.restore();
  const cx = 14;
  const cy = 3 + (13 * ROWS) / COLS / 2;
  const pulse = 0.8 + Math.sin(g.time * 5) * 0.2;
  glow(ctx, cx, cy, 4 * pulse, '#ffd23f', 0.9);
  glow(ctx, cx, cy, 2 * pulse, '#ffffff', 0.9);
  ctx.strokeStyle = 'rgba(255,240,180,0.8)';
  ctx.lineWidth = 0.08;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, 1 + i * 0.5, g.time * (1 + i) + i, g.time * (1 + i) + i + 2.2);
    ctx.stroke();
  }
  BOSS_ORDER.forEach((kind, i) => {
    const appear = Math.max(0, Math.min(1, (t - 0.3 - i * 0.25) * 3));
    if (!appear) return;
    const a = -Math.PI / 2 + (i / BOSS_ORDER.length) * TAU;
    drawShowBoss(view, g, kind, cx + Math.cos(a) * 10.5, cy + Math.sin(a) * 8, 0.55, appear);
  });
}

function heroScene(view: View, g: Game, t: number): void {
  const ctx = view.ctx;
  // Speed lines.
  ctx.strokeStyle = 'rgba(255,210,63,0.35)';
  ctx.lineWidth = 0.08;
  for (let i = 0; i < 14; i++) {
    const y = 3 + ((i * 1.37) % 1) * 0 + i * 1.2;
    const x = GW - ((g.time * 22 + i * 7.3) % (GW + 8));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3 + (i % 3), y);
    ctx.stroke();
  }
  const zoom = Math.min(1, t * 1.5);
  glow(ctx, 14, 10.5, 7 * zoom, '#ffd23f', 0.5);
  drawBen(ctx, 14, 10.5, 1, g.time * 10, { t: g.time, moving: true, scale: 1 + zoom * 3.4 });
  const named = Math.max(0, Math.min(1, (storyTyped(g) - STORY[2].lines[0].length - 10) / 6));
  if (named > 0) text(view, 'BEN', 14, 18.6, 3.2, '#ffd23f', { weight: 900, glow: '#ff9d00', stroke: '#7a3a00', alpha: named });
}

export function drawStory(view: View, g: Game): void {
  const ctx = view.ctx;
  const panelIndex = Math.min(g.storyPanel, STORY.length - 1);
  const story = STORY[panelIndex];
  const t = g.stateT;
  ctx.fillStyle = '#03050d';
  ctx.fillRect(0, 0, GW, GH);
  stars(view, g.time, 22);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 1, GW, 21.5);
  ctx.clip();
  if (story.scene === 'city') cityScene(view, g, t);
  else if (story.scene === 'mazes') mazesScene(view, g, t);
  else heroScene(view, g, t);
  ctx.restore();

  panel(ctx, 1.2, 23.2, 25.6, 5.6, '#ffd23f');
  const typed = storyTyped(g);
  const [one, two] = story.lines;
  const first = one.slice(0, typed);
  const second = two.slice(0, Math.max(0, typed - one.length));
  text(view, first, 2.4, 25.1, 0.66, '#ffffff', { align: 'left', weight: 800, maxWidth: 23.4 });
  text(view, second, 2.4, 26.9, 0.66, '#ffd23f', { align: 'left', weight: 900, maxWidth: 23.4 });
  const done = typed >= one.length + two.length;
  for (let i = 0; i < STORY.length; i++) {
    ctx.fillStyle = i <= panelIndex ? '#ffd23f' : 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(14 + (i - (STORY.length - 1) / 2) * 1.2, 30.4, 0.22, 0, TAU);
    ctx.fill();
  }
  if (done && Math.floor(g.time * 2.2) % 2 === 0) {
    const last = panelIndex === STORY.length - 1;
    const verb = view.layout.touch ? 'TAP' : 'PRESS ENTER';
    text(view, `${verb} TO ${last ? (g.storyThen ? 'PLAY' : 'FINISH') : 'CONTINUE'}`, 14, 32.4, 0.55, '#ffffff', { weight: 900 });
  }
  const r = UI.skip;
  roundRect(ctx, r.x, r.y, r.w, r.h, 0.5);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  text(view, view.layout.touch ? 'SKIP ▶▶' : 'ESC: SKIP ▶▶', r.x + r.w / 2, r.y + r.h / 2, 0.42, '#c8cfe8', { weight: 800 });
}

/* ---------- the ending ---------- */

interface CreditItem {
  h: number;
  draw: (y: number) => void;
}

function creditItems(view: View, g: Game): CreditItem[] {
  const ctx = view.ctx;
  const items: CreditItem[] = [];
  const label = (s: string) => items.push({ h: 2, draw: (y) => text(view, s, 14, y + 1, 0.55, '#8a93b8', { weight: 800 }) });
  const gap = (h: number) => items.push({ h, draw: () => undefined });
  items.push({ h: 4.4, draw: (y) => text(view, 'PAC BEN', 14, y + 2, 3, '#ffd23f', { weight: 900, glow: '#ff9d00', stroke: '#7a3a00', maxWidth: 25 }) });
  gap(1);
  label('STARRING');
  items.push({ h: 3.6, draw: (y) => drawBen(ctx, 14, y + 1.8, 1, g.time * 9, { t: g.time, moving: true, scale: 2.6 }) });
  items.push({ h: 2.8, draw: (y) => text(view, 'BEN', 14, y + 1.3, 1.6, '#ffd23f', { weight: 900, glow: '#ff9d00' }) });
  gap(1.5);
  label('THE ROBOTS');
  for (const kind of Object.keys(ROBOT_SPECS) as RobotKind[]) {
    const spec = ROBOT_SPECS[kind];
    items.push({
      h: 2,
      draw: (y) => {
        drawRobot(ctx, kind, 7, y + 1, 1, { t: g.time, scale: 1.25 });
        text(view, spec.name, 9.2, y + 0.75, 0.58, spec.color, { align: 'left', weight: 900 });
        text(view, spec.blurb.toUpperCase(), 9.2, y + 1.45, 0.33, '#c8cfe8', { align: 'left', maxWidth: 17 });
      },
    });
  }
  gap(1.5);
  label('THE BOSSES');
  for (const kind of BOSS_ORDER) {
    const spec = BOSS_SPECS[kind];
    items.push({
      h: 4,
      draw: (y) => {
        drawShowBoss(view, g, kind, 7.2, y + 2, 0.72);
        text(view, spec.name, 10.6, y + 1.6, 0.78, spec.color, { align: 'left', weight: 900, glow: spec.color });
        text(view, spec.title, 10.6, y + 2.55, 0.38, '#c8cfe8', { align: 'left' });
      },
    });
  }
  gap(1.5);
  label('YOUR RUN');
  const stats: [string, string][] = [
    ['ROBOTS DESTROYED', String(g.run.kills)],
    ['DOTS EATEN', String(g.run.dots)],
    ['TIME', clock(g.run.time)],
    ['DIFFICULTY', DIFFICULTIES[g.difficulty].name],
    ['FINAL SCORE', String(g.score)],
  ];
  for (const [k, v] of stats) {
    items.push({
      h: 1.2,
      draw: (y) => {
        text(view, k, 6.5, y + 0.6, 0.5, '#c8cfe8', { align: 'left', weight: 700 });
        text(view, v, 21.5, y + 0.6, 0.6, '#ffffff', { align: 'right', weight: 900 });
      },
    });
  }
  if (g.score > 0 && g.score >= g.hiScore) items.push({ h: 1.6, draw: (y) => text(view, 'NEW HIGH SCORE!', 14, y + 0.9, 0.6, '#ffd23f', { weight: 900, glow: '#ffb000' }) });
  gap(2.5);
  items.push({ h: 2.6, draw: (y) => text(view, CREDITS, 14, y + 1.3, 0.95, '#ffd23f', { weight: 900, glow: '#ff9d00', maxWidth: 25 }) });
  items.push({ h: 2.4, draw: (y) => text(view, 'THANKS FOR PLAYING!', 14, y + 1.2, 0.8, '#ffffff', { weight: 900 }) });
  return items;
}

/** The ending: the maze flashes white and fades, then the credits roll. */
export function drawVictory(view: View, g: Game): void {
  const ctx = view.ctx;
  const t = g.stateT;
  if (t < CREDITS_FADE) {
    const a = t / CREDITS_FADE;
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.92, a * 2)})`;
    ctx.fillRect(0, 0, GW, GH);
    if (a > 0.5) {
      ctx.fillStyle = `rgba(3,5,13,${(a - 0.5) * 2})`;
      ctx.fillRect(0, 0, GW, GH);
    }
    return;
  }
  ctx.fillStyle = '#03050d';
  ctx.fillRect(0, 0, GW, GH);
  stars(view, g.time, GH);
  const items = creditItems(view, g);
  let height = 0;
  for (const it of items) height += it.h;
  const travel = GH / 2 - 2 + height;
  const progress = Math.min(1, (t - CREDITS_FADE) / (CREDITS_TIME - CREDITS_FADE));
  let y = GH + 1 - travel * progress;
  for (const it of items) {
    if (y + it.h > -2 && y < GH + 2) it.draw(y);
    y += it.h;
  }
  if (t >= CREDITS_TIME && Math.floor(g.time * 2) % 2 === 0) {
    text(view, view.layout.touch ? 'TAP TO FINISH' : 'PRESS ENTER', 14, GH - 3, 0.6, '#ffffff', { weight: 900 });
  } else if (t < CREDITS_TIME) {
    text(view, view.layout.touch ? 'TAP TO SKIP' : 'ENTER: SKIP', GW - 1, GH - 1, 0.36, '#5a6388', { align: 'right' });
  }
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
      case 'story':
        text(view, 'WATCH THE STORY', 14, cy, 0.5, lit ? '#8fb0ff' : '#6a73a0', { weight: 800 });
        break;
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
  const top = 22.9 + (5 - rows.length) * 0.55;
  return { x: 4, y: top + i * 1.42, w: 20, h: 1.28 };
}
