/* The six bosses. */
import { TAU, rgba, shade, glow, circle, roundRect, text } from './render-util.ts';
import type { View } from './render-util.ts';
import { BOSS_SPECS } from './levels.ts';
import type { BossKind } from './levels.ts';
import { COLS } from './maze.ts';
import type { Boss, Game } from './types.ts';

/* ---------- bosses ---------- */

export function eyeOffset(g: Game, b: Boss, k: number): [number, number] {
  const a = Math.atan2(g.player.y - b.y, g.player.x - b.x);
  return [Math.cos(a) * k, Math.sin(a) * k];
}

export function drawBoltz(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  ctx.save();
  ctx.rotate(b.angle);
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = 0.14;
  circle(ctx, 0, 0, R * 0.92);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.fillStyle = i % 2 ? color : shade(color, -0.35);
    circle(ctx, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, 0.17);
    ctx.fill();
  }
  ctx.restore();
  const grd = ctx.createRadialGradient(-R * 0.25, -R * 0.3, 0.1, 0, 0, R * 0.8);
  grd.addColorStop(0, '#fff7c4');
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, shade(color, -0.55));
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.78);
  ctx.fill();
  // Lightning bolt emblem.
  ctx.fillStyle = '#3a2600';
  ctx.beginPath();
  const bolt = [[0.1, -0.85], [-0.42, 0.12], [-0.06, 0.12], [-0.2, 0.85], [0.42, -0.16], [0.06, -0.16]];
  bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x * R * 0.5, y * R * 0.5 + R * 0.12) : ctx.moveTo(x * R * 0.5, y * R * 0.5 + R * 0.12)));
  ctx.closePath();
  ctx.fill();
  // Angry eyes.
  const [ex, ey] = eyeOffset(g, b, 0.08);
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx * R * 0.12 + ex, -R * 0.42 + ey);
    ctx.lineTo(sx * R * 0.5 + ex, -R * 0.52 + ey);
    ctx.lineTo(sx * R * 0.42 + ex, -R * 0.3 + ey);
    ctx.closePath();
    ctx.fill();
  }
  if (b.phase >= 2 || b.mode === 'charge') {
    ctx.strokeStyle = rgba('#fffbd0', 0.8);
    ctx.lineWidth = 0.05;
    for (let k = 0; k < 3; k++) {
      let a = Math.random() * TAU;
      let r = R * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      for (let i = 0; i < 4; i++) {
        r += R * 0.22;
        a += (Math.random() - 0.5) * 0.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    }
  }
  if (b.mode === 'charge') glow(ctx, 0, 0, R * 2 + b.modeT * 2, '#fff27a', 0.6);
}

export function drawMagnetron(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  for (let k = 0; k < 2; k++) {
    ctx.save();
    ctx.rotate(b.angle + k * Math.PI);
    ctx.strokeStyle = '#7a26c9';
    ctx.lineWidth = 0.34;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.98, -0.75, 0.75);
    ctx.stroke();
    for (const [a, c] of [[-0.75, '#ff3b5c'], [0.75, '#3b8bff']] as const) {
      ctx.fillStyle = c;
      circle(ctx, Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0.2);
      ctx.fill();
      glow(ctx, Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98, 0.5, c, 0.7);
    }
    ctx.restore();
  }
  const grd = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 0.1, 0, 0, R * 0.72);
  grd.addColorStop(0, '#f3d2ff');
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, '#2a0748');
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.7);
  ctx.fill();
  const [ex, ey] = eyeOffset(g, b, R * 0.14);
  ctx.fillStyle = '#ffffff';
  circle(ctx, 0, 0, R * 0.36);
  ctx.fill();
  ctx.fillStyle = '#9b2cff';
  circle(ctx, ex, ey, R * 0.2);
  ctx.fill();
  ctx.fillStyle = '#12001f';
  circle(ctx, ex * 1.2, ey * 1.2, R * 0.09);
  ctx.fill();
}

export function drawShredder(ctx: CanvasRenderingContext2D, b: Boss, R: number, color: string): void {
  ctx.save();
  ctx.rotate(b.angle);
  const teeth = 16;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * TAU;
    const r = i % 2 === 0 ? R : R * 0.8;
    const a2 = a + (i % 2 === 0 ? 0.12 : 0);
    if (i === 0) ctx.moveTo(Math.cos(a2) * r, Math.sin(a2) * r);
    else ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
  }
  ctx.closePath();
  const grd = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
  grd.addColorStop(0, '#5a2a10');
  grd.addColorStop(0.6, '#d9d9e6');
  grd.addColorStop(1, color);
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.4);
  ctx.lineWidth = 0.05;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.06;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3);
    ctx.lineTo(Math.cos(a + 0.4) * R * 0.72, Math.sin(a + 0.4) * R * 0.72);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#1e0c04';
  circle(ctx, 0, 0, R * 0.42);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.08;
  circle(ctx, 0, 0, R * 0.42);
  ctx.stroke();
  glow(ctx, 0, 0, R * 0.6, '#ff3b1f', 0.9);
  ctx.fillStyle = '#ff5a2a';
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.2, R * 0.08, 0, 0, TAU);
  ctx.fill();
}

export function drawHydraCore(ctx: CanvasRenderingContext2D, b: Boss, R: number, color: string): void {
  const exposed = b.mode === 'exposed';
  ctx.save();
  ctx.rotate(b.angle * 0.5);
  for (const [r, c] of [[R * 0.85, '#0e3b2a'], [R * 0.62, color]] as const) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : c;
    ctx.fill();
    ctx.strokeStyle = '#b9ffe2';
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
  ctx.restore();
  const pulse = exposed ? 0.6 + Math.sin(b.t * 18) * 0.4 : 0.4;
  glow(ctx, 0, 0, R * (exposed ? 1.8 : 1), exposed ? '#ffffff' : color, pulse);
  ctx.fillStyle = exposed ? '#ffffff' : '#0a2a1c';
  circle(ctx, 0, 0, R * 0.3);
  ctx.fill();
  if (b.guarded) {
    ctx.strokeStyle = rgba(color, 0.35 + Math.sin(b.t * 6) * 0.1);
    ctx.lineWidth = 0.07;
    circle(ctx, 0, 0, R * 1.05);
    ctx.stroke();
  }
}

export function drawGlitchBody(ctx: CanvasRenderingContext2D, R: number, t: number, color: string, flash: boolean): void {
  const body = () => {
    roundRect(ctx, -R * 0.75, -R * 0.55, R * 1.5, R * 1.25, R * 0.25);
  };
  // Crown.
  ctx.fillStyle = '#e8fdff';
  ctx.beginPath();
  ctx.moveTo(-R * 0.6, -R * 0.5);
  ctx.lineTo(-R * 0.55, -R * 0.95);
  ctx.lineTo(-R * 0.25, -R * 0.68);
  ctx.lineTo(0, -R * 1.05);
  ctx.lineTo(R * 0.25, -R * 0.68);
  ctx.lineTo(R * 0.55, -R * 0.95);
  ctx.lineTo(R * 0.6, -R * 0.5);
  ctx.closePath();
  ctx.fill();
  body();
  ctx.fillStyle = flash ? '#ffffff' : '#062a33';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.08;
  ctx.stroke();
  // Visor with scanlines.
  ctx.fillStyle = '#001218';
  roundRect(ctx, -R * 0.58, -R * 0.3, R * 1.16, R * 0.42, R * 0.1);
  ctx.fill();
  for (const sx of [-1, 1]) {
    glow(ctx, sx * R * 0.28, -R * 0.09, R * 0.4, color, 0.9);
    ctx.fillStyle = color;
    ctx.fillRect(sx * R * 0.28 - R * 0.13, -R * 0.14, R * 0.26, R * 0.1);
  }
  ctx.fillStyle = rgba(color, 0.7);
  for (let i = 0; i < 6; i++) ctx.fillRect(-R * 0.45 + i * R * 0.18, R * 0.3, R * 0.1, R * 0.16 + ((Math.floor(t * 8) + i) % 3) * 0.04);
}

export function drawGlitchFigure(ctx: CanvasRenderingContext2D, g: Game, x: number, y: number, R: number, flash: boolean, phase: number): void {
  const color = '#3ff5ff';
  const t = g.time;
  const jitter = g.glitch > 0 || Math.random() < 0.05 + phase * 0.03;
  ctx.save();
  ctx.translate(x, y);
  glow(ctx, 0, 0, R * 2.4, color, 0.4);
  ctx.globalCompositeOperation = 'lighter';
  for (const [dx, c] of [[-0.1, '#ff2266'], [0.1, '#2266ff']] as const) {
    ctx.save();
    ctx.translate(dx + (jitter ? (Math.random() - 0.5) * 0.3 : 0), 0);
    ctx.globalAlpha *= 0.45;
    drawGlitchBody(ctx, R, t, c, false);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (jitter) {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-R * 1.5, -R * 1.2 + (i * R * 2.4) / 3, R * 3, (R * 2.4) / 3);
      ctx.clip();
      ctx.translate((Math.random() - 0.5) * 0.5, 0);
      drawGlitchBody(ctx, R, t, color, flash);
      ctx.restore();
    }
  } else drawGlitchBody(ctx, R, t, color, flash);
  ctx.restore();
}

export function drawOmega(ctx: CanvasRenderingContext2D, g: Game, b: Boss, R: number, color: string): void {
  // Outer ring of segments.
  ctx.save();
  ctx.rotate(b.angle * 0.6);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.95, a + 0.06, a + TAU / 12 - 0.06);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.rotate(-b.angle * 0.4);
  ctx.fillStyle = shade(color, -0.3);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.12) * R * 1.05, Math.sin(a - 0.12) * R * 1.05);
    ctx.lineTo(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35);
    ctx.lineTo(Math.cos(a + 0.12) * R * 1.05, Math.sin(a + 0.12) * R * 1.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const grd = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 0.75);
  grd.addColorStop(0, b.mode === 'vent' ? '#ffffff' : '#5a0010');
  grd.addColorStop(0.7, '#1a0006');
  grd.addColorStop(1, color);
  ctx.fillStyle = b.flash > 0 ? '#ffffff' : grd;
  circle(ctx, 0, 0, R * 0.72);
  ctx.fill();
  ctx.save();
  ctx.rotate(b.angle);
  ctx.strokeStyle = rgba('#ff9aaa', 0.8);
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU - Math.PI / 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
    else ctx.lineTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  // The eye.
  const [ex, ey] = eyeOffset(g, b, R * 0.12);
  ctx.fillStyle = '#fff1f3';
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.4, R * 0.28, 0, 0, TAU);
  ctx.fill();
  glow(ctx, ex, ey, R * 0.6, '#ff0033', b.phase >= 3 ? 1 : 0.6);
  ctx.fillStyle = '#ff1744';
  circle(ctx, ex, ey, R * 0.2);
  ctx.fill();
  ctx.fillStyle = '#120004';
  ctx.beginPath();
  ctx.ellipse(ex, ey, R * 0.05, R * 0.17, 0, 0, TAU);
  ctx.fill();
  if (b.phase >= 2) {
    ctx.strokeStyle = 'rgba(255,240,240,0.5)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.moveTo(-R * 0.6, -R * 0.2);
    ctx.lineTo(-R * 0.4, -R * 0.1);
    ctx.lineTo(-R * 0.45, R * 0.15);
    ctx.moveTo(R * 0.5, R * 0.3);
    ctx.lineTo(R * 0.3, R * 0.4);
    ctx.stroke();
  }
  if (b.phase >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      glow(ctx, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, 0.6, '#ff6a00', 0.7);
    }
  }
}

export function drawBoss(view: View, g: Game, b: Boss): void {
  const ctx = view.ctx;
  const spec = BOSS_SPECS[b.kind];
  const R = b.r;

  // Telegraphs first, under the boss.
  if (b.kind === 'magnetron' && (b.mode === 'warp' || b.mode === 'vanish')) {
    const k = b.mode === 'warp' ? Math.min(1, b.modeT / 0.5) : 0.3;
    ctx.save();
    ctx.translate(b.target.x, b.target.y);
    ctx.strokeStyle = rgba(spec.color, 0.4 + k * 0.5);
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.4, 0.25]);
    ctx.lineDashOffset = -g.time * 3;
    circle(ctx, 0, 0, R * (1.6 - k * 0.5));
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + g.time * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 1.9, Math.sin(a) * R * 1.9);
      ctx.lineTo(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3);
      ctx.stroke();
    }
    glow(ctx, 0, 0, R * 2, spec.color, k * 0.5);
    ctx.restore();
  }
  const tracking = (b.kind === 'shredder' && b.mode === 'track') || (b.kind === 'omega' && b.mode === 'dash');
  if (tracking && b.modeT > b.fireT - 0.85) {
    const k = Math.min(1, (b.modeT - (b.fireT - 0.85)) / 0.85);
    const locked = b.modeT > b.fireT - 0.3;
    ctx.save();
    ctx.strokeStyle = rgba(locked ? '#ff2a2a' : '#ffb15a', 0.25 + k * 0.6);
    ctx.lineWidth = locked ? 0.16 : 0.07;
    if (!locked) ctx.setLineDash([0.5, 0.3]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.aim) * 40, b.y + Math.sin(b.aim) * 40);
    ctx.stroke();
    ctx.restore();
  }
  if ((b.kind === 'boltz' || b.kind === 'omega') && (b.mode === 'charge' || b.mode === 'burst')) {
    ctx.save();
    ctx.strokeStyle = rgba('#ffffff', 0.25 + Math.min(1, b.modeT * 2) * 0.4);
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.3, 0.3]);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.aim) * 8, b.y + Math.sin(b.aim) * 8);
    ctx.stroke();
    ctx.restore();
  }

  if (b.kind === 'hydra') {
    ctx.save();
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.2, 0.2]);
    ctx.lineDashOffset = -g.time * 2;
    for (const d of b.drones) {
      if (!d.alive) continue;
      ctx.strokeStyle = rgba('#7dffc8', 0.35);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(b.x, b.y);
  let alpha = b.alpha;
  if (b.dying > 0) alpha *= Math.random() < 0.3 ? 0.4 : 1;
  ctx.globalAlpha = alpha;
  if (b.kind !== 'glitch') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0.3, R * 0.95, R * 0.9, R * 0.22, 0, 0, TAU);
    ctx.fill();
    glow(ctx, 0, 0, R * 2.6, spec.color, 0.45);
  }
  if (b.kind === 'shredder' && b.mode === 'dash') {
    for (let i = 1; i <= 3; i++) {
      ctx.save();
      ctx.globalAlpha = alpha * (0.22 - i * 0.05);
      ctx.translate(-b.vx * 0.03 * i, -b.vy * 0.03 * i);
      drawShredder(ctx, b, R, spec.color);
      ctx.restore();
    }
  }
  switch (b.kind) {
    case 'boltz':
      drawBoltz(ctx, g, b, R, spec.color);
      break;
    case 'magnetron':
      drawMagnetron(ctx, g, b, R, spec.color);
      break;
    case 'shredder':
      drawShredder(ctx, b, R, spec.color);
      break;
    case 'hydra':
      drawHydraCore(ctx, b, R, spec.color);
      break;
    case 'omega':
      drawOmega(ctx, g, b, R, spec.color);
      break;
    case 'glitch':
      break;
  }
  ctx.restore();

  if (b.kind === 'glitch') {
    ctx.save();
    ctx.globalAlpha = alpha;
    drawGlitchFigure(ctx, g, b.x, b.y, R, b.flash > 0, b.phase);
    ctx.restore();
    for (const c of b.clones) if (c.alive) drawGlitchFigure(ctx, g, c.x, c.y, R, false, b.phase);
  }

  for (const d of b.drones) {
    if (!d.alive) continue;
    ctx.save();
    ctx.translate(d.x, d.y);
    glow(ctx, 0, 0, 0.9, '#34f5a0', 0.5);
    ctx.rotate(-g.time * 3);
    ctx.fillStyle = '#1b6b4a';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.4) * 0.36, Math.sin(a - 0.4) * 0.36);
      ctx.lineTo(Math.cos(a) * 0.58, Math.sin(a) * 0.58);
      ctx.lineTo(Math.cos(a + 0.4) * 0.36, Math.sin(a + 0.4) * 0.36);
      ctx.fill();
    }
    ctx.rotate(g.time * 3);
    ctx.fillStyle = d.flash > 0 ? '#ffffff' : '#34f5a0';
    circle(ctx, 0, 0, 0.38);
    ctx.fill();
    const a = Math.atan2(g.player.y - d.y, g.player.x - d.x);
    ctx.fillStyle = '#04150e';
    circle(ctx, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.14);
    ctx.fill();
    ctx.fillStyle = '#ff3b5c';
    circle(ctx, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.06);
    ctx.fill();
    ctx.restore();
  }
}

/** A boss built only to be drawn: on the story screens and in the credits. */
export function showBoss(g: Game, kind: BossKind, x = 0, y = 0): Boss {
  const r = BOSS_SPECS[kind].radius;
  const drones =
    kind === 'hydra'
      ? Array.from({ length: 4 }, (_, i) => {
          const angle = g.time * 1.1 + (i / 4) * TAU;
          return { angle, x: x + Math.cos(angle) * 2.9, y: y + Math.sin(angle) * 2.9, hp: 5, flash: 0, fireCd: 9, alive: true };
        })
      : [];
  return {
    kind, x, y, vx: 0, vy: 0, r, hp: 1, maxHp: 1, phase: 1, mode: 'show', modeT: 0, t: g.time, angle: g.time * 1.4, spin: 1,
    flash: 0, alpha: 1, dying: 0, dead: false, aim: 0, counter: 0, dashLeft: 0, dashDist: 0, trailT: 0, spiral: 0, fireT: 0,
    target: { x, y }, home: { x, y }, drones, clones: [], guarded: false,
  };
}

/** Draws a boss at (x, y), scaled. */
export function drawShowBoss(view: View, g: Game, kind: BossKind, x: number, y: number, scale: number, alpha = 1): void {
  const ctx = view.ctx;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= alpha;
  drawBoss(view, g, showBoss(g, kind));
  ctx.restore();
}

/** The boss's speech bubble. */
export function drawTaunt(view: View, g: Game): void {
  const b = g.boss;
  const say = g.taunt;
  if (!b || !say || b.dead) return;
  const ctx = view.ctx;
  const color = BOSS_SPECS[b.kind].color;
  const size = 0.46;
  const w = Math.min(26.5, say.text.length * size * 0.78 + 1.6);
  const h = 1.35;
  const pop = Math.min(1, say.t * 7);
  const fade = Math.max(0, Math.min(1, (say.life - say.t) * 3));
  const bx = Math.max(w / 2 - 0.4, Math.min(COLS - 0.6 - w / 2, b.x));
  let by = b.y - b.r - 1.6;
  const below = by - h / 2 < -0.3;
  if (below) by = b.y + b.r + 1.6;
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.translate(bx, by);
  const k = 0.5 + 0.5 * pop + Math.sin(Math.min(1, say.t * 4) * Math.PI) * 0.08;
  ctx.scale(k, k);
  // Tail towards the boss.
  const tx = Math.max(-w / 2 + 0.7, Math.min(w / 2 - 0.7, b.x - bx));
  const edge = below ? -h / 2 : h / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(tx - 0.35, edge);
  ctx.lineTo(tx, edge + (below ? -0.7 : 0.7));
  ctx.lineTo(tx + 0.35, edge);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  glow(ctx, 0, 0, w * 0.55, color, 0.25);
  roundRect(ctx, -w / 2, -h / 2, w, h, 0.5);
  ctx.fill();
  ctx.stroke();
  // Cover the tail's join so the bubble reads as one shape.
  ctx.fillRect(tx - 0.3, below ? -h / 2 - 0.02 : h / 2 - 0.1, 0.6, 0.12);
  text(view, say.text, 0, 0.04, size, '#10131f', { weight: 900, maxWidth: w - 0.8 });
  ctx.restore();
}
