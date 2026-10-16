/*
 * Drawing, entry point: the world each frame, the touch controls, and the
 * screens on top. See render-util.ts for the layout and the helpers.
 */
import { GW, GH, HUD_TOP, TAU, rgba, glow, circle, roundRect, text } from './render-util.ts';
import type { Rect, View } from './render-util.ts';
import { mazeCache } from './render-maze.ts';
import { drawBen } from './render-ben.ts';
import { drawRobot, drawRobotEntity } from './render-robots.ts';
import { drawBoss, drawTaunt } from './render-bosses.ts';
import { drawShot, drawLaser, drawPickup } from './render-fx.ts';
import { drawHud } from './render-hud.ts';
import { drawIntro, drawClear, drawPause, drawGameOver, drawVictory, drawTitle, drawStory } from './render-screens.ts';
import { ROBOT_SPECS, SECTORS } from './levels.ts';
import { COLS, ROWS } from './maze.ts';
import { waitingRobots } from './game.ts';
import type { Game } from './types.ts';

/* ---------- the world, HUD and screens ---------- */

export function drawWorld(view: View, g: Game): void {
  const ctx = view.ctx;
  const m = g.maze;
  const sector = SECTORS[g.spec.sector];
  const cache = mazeCache(view, g);
  const t = g.time;

  ctx.save();
  ctx.translate(0, HUD_TOP);
  ctx.drawImage(cache.canvas, 0, 0, COLS, ROWS);

  // In overdrive the walls throb in time with the music.
  if (g.player.overdrive > 0 && (g.state === 'play' || g.state === 'intro')) {
    const beat = (g.time * SECTORS[g.spec.sector].bpm) / 60;
    const pulse = Math.pow(1 - (beat % 1), 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, COLS, ROWS);
    ctx.clip();
    ctx.strokeStyle = rgba('#8fb0ff', 0.15 + pulse * 0.55);
    ctx.lineWidth = 0.12 + pulse * 0.18;
    ctx.shadowColor = '#4a7bff';
    ctx.shadowBlur = (0.4 + pulse) * view.layout.scale * view.layout.dpr;
    ctx.stroke(cache.walls);
    ctx.restore();
  }

  // The maze flashes white when a level is cleared, as in Pac-Man.
  if (g.state === 'clear' && g.stateT < 2.2 && Math.floor(g.stateT * 5) % 2 === 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, COLS, ROWS);
    ctx.clip();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.14;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 0.6 * view.layout.scale * view.layout.dpr;
    ctx.stroke(cache.walls);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.rect(0, 0, COLS, ROWS);
  ctx.clip();
  ctx.translate(0.5, 0.5);

  // Teleport pads.
  for (const p of m.portals) {
    glow(ctx, p.x, p.y, 1.1, '#b48cff', 0.5 + Math.sin(t * 4) * 0.15);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 2);
    ctx.strokeStyle = '#c9a8ff';
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.18 + i * 0.12, i * 2, i * 2 + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The factory door, and the robots waiting behind it.
  if (m.house) {
    const hy = m.house.y;
    const soon = g.state === 'play' && g.queue.length > 0 && g.spawnT < 0.6;
    const doorColor = soon ? '#ffffff' : '#ff7ad9';
    glow(ctx, 13.5, hy, 1.4, '#ff7ad9', soon ? 0.9 : 0.4);
    ctx.strokeStyle = doorColor;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(12.55, hy);
    ctx.lineTo(14.45, hy);
    ctx.stroke();
    const waiting = waitingRobots(g);
    waiting.forEach((kind, i) => {
      const x = 13.5 + (i - (waiting.length - 1) / 2) * 1.6;
      drawRobot(ctx, kind, x, hy + 2, 2, { t: t + i, scale: 0.8, alpha: 0.75 });
    });
  }

  // Dots and power cores. The last few glow, so they're easy to find.
  const lastFew = !g.boss && g.dotsLeft <= 8;
  const r = lastFew ? 0.2 + Math.sin(t * 6) * 0.03 : 0.16;
  if (lastFew) {
    for (let i = 0; i < g.dots.length; i++) {
      if (g.dots[i] !== 1) continue;
      const x = i % COLS;
      glow(ctx, x, (i - x) / COLS, 0.9, '#ffd23f', 0.55 + Math.sin(t * 6) * 0.25);
    }
  }
  ctx.fillStyle = lastFew ? '#fff3c4' : sector.dot;
  ctx.beginPath();
  for (let i = 0; i < g.dots.length; i++) {
    if (g.dots[i] !== 1) continue;
    const x = i % COLS;
    const y = (i - x) / COLS;
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fill();
  for (let i = 0; i < g.dots.length; i++) {
    if (g.dots[i] !== 2) continue;
    const x = i % COLS;
    const y = (i - x) / COLS;
    const pulse = 0.75 + Math.sin(t * 6) * 0.25;
    glow(ctx, x, y, 1.1 * pulse, '#8fb0ff', 0.8);
    ctx.fillStyle = '#ffffff';
    circle(ctx, x, y, 0.3 * pulse);
    ctx.fill();
    ctx.strokeStyle = rgba('#8fb0ff', 0.8);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(x, y, 0.45, t * 3, t * 3 + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 0.45, t * 3 + Math.PI, t * 3 + Math.PI + 2);
    ctx.stroke();
  }

  for (const k of g.pickups) drawPickup(view, g, k);

  // Mines.
  for (const mine of g.mines) {
    const armed = mine.t > 0.8;
    ctx.fillStyle = '#3a3420';
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 0.04;
    ctx.save();
    ctx.translate(mine.x, mine.y);
    ctx.rotate(mine.t);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.fillRect(-0.03, -0.32, 0.06, 0.12);
    }
    ctx.restore();
    circle(ctx, mine.x, mine.y, 0.22);
    ctx.fill();
    ctx.stroke();
    const on = Math.floor(mine.t * (armed ? 6 : 2)) % 2 === 0;
    if (on) glow(ctx, mine.x, mine.y, 0.6, '#ff3355', 1);
    ctx.fillStyle = on ? '#ff3355' : '#661020';
    circle(ctx, mine.x, mine.y, 0.07);
    ctx.fill();
  }

  for (const l of g.lasers) if (l.t < l.warn) drawLaser(ctx, g, l);

  // Spawning beams from the factory.
  for (const r of g.robots) {
    if (r.spawnT <= 0 || r.minion) continue;
    const k = r.spawnT / 0.7;
    ctx.fillStyle = rgba(ROBOT_SPECS[r.kind].color, 0.25 * k);
    ctx.fillRect(r.x - 0.4, r.y - 0.4, 0.8, m.house ? m.house.y + 2 - r.y : 1);
  }

  // Robots.
  const p = g.player;
  for (const r of g.robots) {
    if (!r.alive) continue;
    drawRobotEntity(ctx, g, r);
  }

  if (g.boss && !g.boss.dead) drawBoss(view, g, g.boss);

  // The dot radar: after a while with no dot, an arrow points at the nearest.
  if (g.radar >= 0 && g.state === 'play') {
    const tx = g.radar % COLS;
    const ty = (g.radar - tx) / COLS;
    const a = Math.atan2(ty - p.y, tx - p.x);
    const pulse = 0.6 + Math.sin(t * 8) * 0.4;
    glow(ctx, tx, ty, 1.3, '#ffd23f', 0.4 + pulse * 0.4);
    ctx.save();
    ctx.translate(p.x + Math.cos(a) * (1.15 + pulse * 0.2), p.y + Math.sin(a) * (1.15 + pulse * 0.2));
    ctx.rotate(a);
    ctx.scale(1.5, 1.5);
    glow(ctx, 0, 0, 0.6, '#ffd23f', 0.6);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0.32, 0);
    ctx.lineTo(-0.16, -0.24);
    ctx.lineTo(-0.04, 0);
    ctx.lineTo(-0.16, 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Ben.
  if (g.state === 'dying') {
    // A squash and a slump, then he folds away as Pac-Man does.
    if (g.stateT < 0.45) drawBen(ctx, p.x, p.y, p.facing, 0.4, { t, squash: Math.min(1, g.stateT / 0.15) });
    else if (g.stateT < 1.6) drawBen(ctx, p.x, p.y, 0, 0, { t, death: Math.min(1, (g.stateT - 0.45) / 1.05) });
  } else if (g.state !== 'title' && g.state !== 'story') {
    const blink = p.invuln > 0 && Math.floor(t * 12) % 2 === 0;
    // A hop of joy when the level is cleared.
    const hop = g.state === 'clear' && g.stateT < 1.8 ? Math.abs(Math.sin(g.stateT * 7)) * 0.55 * (1 - g.stateT / 1.8) : 0;
    if (!blink) drawBen(ctx, p.x, p.y - hop, hop ? 1 : p.facing, hop ? g.stateT * 14 : p.mouth, { t, moving: p.moving || hop > 0, overdrive: p.overdrive, shield: p.shield, muzzle: p.muzzle, idle: g.state === 'play' ? p.idleT : 0 });
  }

  for (const b of g.bullets) drawShot(ctx, b, t);
  for (const l of g.lasers) if (l.t >= l.warn) drawLaser(ctx, g, l);

  // Particles.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const q of g.particles) {
    const a = Math.max(0, q.life / q.max);
    switch (q.kind) {
      case 'spark':
        ctx.strokeStyle = rgba(q.color.startsWith('#') ? q.color : '#ffffff', a);
        ctx.lineWidth = q.size;
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035);
        ctx.stroke();
        break;
      case 'glow':
        glow(ctx, q.x, q.y, q.size * (0.5 + a * 0.5), q.color, a);
        break;
      case 'ring':
        ctx.strokeStyle = rgba(q.color, a * 0.8);
        ctx.lineWidth = 0.08 * a + 0.02;
        circle(ctx, q.x, q.y, q.size * (1 - a) + 0.1);
        ctx.stroke();
        break;
      case 'chunk':
        ctx.fillStyle = rgba(q.color, a);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot + (1 - a) * 8);
        ctx.fillRect(-q.size / 2, -q.size / 2, q.size, q.size);
        ctx.restore();
        break;
    }
  }
  ctx.restore();

  drawTaunt(view, g);

  for (const q of g.popups) {
    const a = Math.min(1, (q.life - q.t) / 0.4);
    const half = q.text.length * q.size * 0.3;
    const x = Math.min(Math.max(q.x, half - 0.3), COLS - 0.7 - half);
    // Pops in big and settles.
    const punch = 1 + 0.5 * Math.max(0, 1 - q.t / 0.16);
    text(view, q.text, x, q.y, q.size * 0.6 * punch, q.color, { weight: 900, stroke: 'rgba(0,0,0,0.7)', alpha: a });
  }

  // READY!
  if (g.state === 'intro' && (g.respawn || g.stateT > g.introLength - 0.9)) {
    const show = g.stateT < g.introLength - 0.5 || Math.floor(g.stateT * 8) % 2 === 0;
    if (show) text(view, 'READY!', m.bonus.x, m.bonus.y + (m.house ? 0 : -3), 0.95, '#ffd23f', { weight: 900, glow: '#ffb000', stroke: 'rgba(0,0,0,0.6)' });
  }
  ctx.restore();
}

export function drawControls(view: View): void {
  const ctx = view.ctx;
  const L = view.layout;
  ctx.save();
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  const icon = (r: Rect, draw: () => void) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    draw();
    ctx.restore();
  };
  icon(L.pause, () => {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-6, -7, 4, 14);
    ctx.fillRect(2, -7, 4, 14);
  });
  icon(L.mute, () => {
    const ink = view.muted ? '#ff5d73' : 'rgba(255,255,255,0.8)';
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.lineTo(-5, -3);
    ctx.lineTo(1, -8);
    ctx.lineTo(1, 8);
    ctx.lineTo(-5, 3);
    ctx.lineTo(-9, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (view.muted) {
      ctx.moveTo(4, -4);
      ctx.lineTo(11, 4);
      ctx.moveTo(11, -4);
      ctx.lineTo(4, 4);
    } else {
      ctx.arc(2, 0, 5, -0.8, 0.8);
      ctx.moveTo(2 + 9 * Math.cos(-0.8), 9 * Math.sin(-0.8));
      ctx.arc(2, 0, 9, -0.8, 0.8);
    }
    ctx.stroke();
  });

  if (L.touch) {
    // Steering stick.
    const s = view.stick;
    const home = L.stickHome;
    const cx = s.active ? s.ox : home.x;
    const cy = s.active ? s.oy : home.y;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    circle(ctx, cx, cy, home.r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let d = 0; d < 4; d++) {
      const a = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][d];
      const lit = s.active && s.dir === d;
      ctx.fillStyle = lit ? 'rgba(255,210,63,0.95)' : 'rgba(255,255,255,0.35)';
      ctx.save();
      ctx.translate(cx + Math.cos(a) * home.r * 0.72, cy + Math.sin(a) * home.r * 0.72);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-4, -7);
      ctx.lineTo(-4, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (s.active) {
      const dx = s.x - s.ox;
      const dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      const k = d > home.r * 0.6 ? (home.r * 0.6) / d : 1;
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      circle(ctx, s.ox + dx * k, s.oy + dy * k, home.r * 0.38);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = `700 11px ${view.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STEER', cx, cy);
    }
    // Fire button.
    const f = L.fire;
    const held = view.fireHeld;
    const grd = ctx.createRadialGradient(f.x, f.y - f.r * 0.3, f.r * 0.1, f.x, f.y, f.r);
    grd.addColorStop(0, held ? 'rgba(255,240,150,0.95)' : 'rgba(255,90,110,0.55)');
    grd.addColorStop(1, held ? 'rgba(255,120,40,0.75)' : 'rgba(160,20,50,0.35)');
    ctx.fillStyle = grd;
    circle(ctx, f.x, f.y, f.r * (held ? 0.94 : 1));
    ctx.fill();
    ctx.strokeStyle = held ? 'rgba(255,255,255,0.9)' : 'rgba(255,160,170,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.round(f.r * 0.32)}px ${view.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIRE', f.x, f.y);
  }
  ctx.restore();
}

export function render(view: View, g: Game): void {
  const ctx = view.ctx;
  const L = view.layout;
  const sector = SECTORS[g.spec.sector];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = g.state === 'title' || g.state === 'story' ? SECTORS[0].bg : sector.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shake = g.shake > 0 ? g.shake * 0.35 : 0;
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;
  const k = L.scale * L.dpr;
  ctx.setTransform(k, 0, 0, k, L.ox * L.dpr + sx * k, L.oy * L.dpr + sy * k);

  if (g.state === 'title') {
    drawTitle(view, g);
    drawHud(view, g);
  } else if (g.state === 'story') {
    drawStory(view, g);
  } else {
    drawWorld(view, g);
    drawHud(view, g);
    if (g.state === 'intro') drawIntro(view, g);
    if (g.state === 'clear') drawClear(view, g);
    if (g.state === 'gameover') drawGameOver(view, g);
    if (g.state === 'victory') drawVictory(view, g);
    if (g.banner) {
      const b = g.banner;
      const a = Math.min(1, b.t * 5, (b.life - b.t) * 3);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      text(view, b.text, 14, HUD_TOP + 9, 1.3, b.color, { weight: 900, glow: b.color, stroke: 'rgba(0,0,0,0.7)', maxWidth: 26 });
      ctx.restore();
    }
  }

  if (g.glitch > 0) {
    // Tear a few strips of the screen sideways.
    const canvas = ctx.canvas;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 4; i++) {
      const h = Math.random() * canvas.height * 0.06 + 4;
      const y = Math.random() * (canvas.height - h);
      const dx = (Math.random() - 0.5) * 40 * L.dpr * Math.min(1, g.glitch * 2);
      ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
    }
    ctx.restore();
  }
  if (g.edgeFlash > 0) {
    // The edges of the play area glow in the colour of what was just destroyed.
    ctx.save();
    const a = Math.min(0.55, g.edgeFlash * 0.6);
    const edge = (x0: number, y0: number, x1: number, y1: number, x: number, y: number, w: number, h: number) => {
      const grd = ctx.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, rgba(g.edgeColor, a));
      grd.addColorStop(1, rgba(g.edgeColor, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);
    };
    const top = HUD_TOP;
    const bottom = HUD_TOP + ROWS;
    edge(0, 0, 1.6, 0, 0, top, 1.6, ROWS);
    edge(GW, 0, GW - 1.6, 0, GW - 1.6, top, 1.6, ROWS);
    edge(0, top, 0, top + 1.6, 0, top, GW, 1.6);
    edge(0, bottom, 0, bottom - 1.6, 0, bottom - 1.6, GW, 1.6);
    ctx.restore();
  }
  drawIris(view, g);
  if (g.flash > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.min(0.5, g.flash);
    ctx.fillStyle = g.flashColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  ctx.setTransform(k, 0, 0, k, L.ox * L.dpr, L.oy * L.dpr);
  if (g.paused) drawPause(view, g);
  drawControls(view);
}

/** A neon iris closes on Ben when a level is cleared and opens on the next one. */
function drawIris(view: View, g: Game): void {
  let open: number;
  if (g.state === 'clear' && g.stateT > 2.9) open = 1 - Math.min(1, (g.stateT - 2.9) / 0.8);
  else if (g.state === 'intro' && !g.respawn && g.stateT < 0.7) open = g.stateT / 0.7;
  else return;
  const ctx = view.ctx;
  const p = g.player;
  const cx = p.x + 0.5;
  const cy = p.y + 0.5 + HUD_TOP;
  const r = Math.max(0, open * open * 34);
  const color = SECTORS[g.spec.sector].wall;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-4, -4, GW + 8, GH + 8);
  ctx.arc(cx, cy, r, 0, TAU, true);
  ctx.fillStyle = '#03050d';
  ctx.fill('evenodd');
  if (r > 0.05) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.25;
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.8 * view.layout.scale * view.layout.dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.07;
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
}
