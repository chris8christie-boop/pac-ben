/* Shots, lasers, pickups and bonus items. */
import { TAU, rgba, glow, circle, roundRect, text } from './render-util.ts';
import type { View } from './render-util.ts';
import { COLS, ROWS } from './maze.ts';
import { laserOrigin } from './game.ts';
import type { Bullet, Game, Laser, Pickup, PowerKind } from './types.ts';

/* ---------- other things in the maze ---------- */

export function drawShot(ctx: CanvasRenderingContext2D, b: Bullet, t: number): void {
  switch (b.kind) {
    case 'shot': {
      const a = Math.atan2(b.vy, b.vx);
      glow(ctx, b.x, b.y, 0.55, b.color, 0.9);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = b.color;
      roundRect(ctx, -0.32, -0.08, 0.5, 0.16, 0.08);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -0.12, -0.04, 0.28, 0.08, 0.04);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'ember': {
      const f = 0.7 + Math.sin(t * 30 + b.x * 7) * 0.3;
      const fade = Math.min(1, b.life / 0.4);
      glow(ctx, b.x, b.y, 0.7 * f, '#ff7a1a', 0.9 * fade);
      ctx.fillStyle = rgba('#ffd27a', fade);
      circle(ctx, b.x, b.y, 0.13 * f);
      ctx.fill();
      break;
    }
    case 'missile': {
      const a = Math.atan2(b.vy, b.vx);
      glow(ctx, b.x, b.y, 0.6, b.color, 0.8);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(0.3, 0);
      ctx.lineTo(-0.22, -0.16);
      ctx.lineTo(-0.12, 0);
      ctx.lineTo(-0.22, 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'shard': {
      glow(ctx, b.x, b.y, 0.5, b.color, 0.9);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(t * 12);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(0, -0.18);
      ctx.lineTo(0.12, 0);
      ctx.lineTo(0, 0.18);
      ctx.lineTo(-0.12, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    default: {
      // Enemy energy: bigger than a dot, with a dark rim and a hot core, so it never reads as food.
      const pulse = 1 + Math.sin(t * 20 + b.x * 3) * 0.12;
      glow(ctx, b.x, b.y, 0.75 * pulse, b.color, 0.9);
      ctx.fillStyle = '#1a0010';
      circle(ctx, b.x, b.y, b.r * 1.35 * pulse);
      ctx.fill();
      ctx.fillStyle = b.color;
      circle(ctx, b.x, b.y, b.r * 1.15 * pulse);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, b.x, b.y, b.r * 0.5);
      ctx.fill();
    }
  }
}

export function laserEnds(g: Game, l: Laser): [number, number, number, number] {
  if (l.kind === 'row') return [-1, l.pos, COLS, l.pos];
  if (l.kind === 'col') return [l.pos, -1, l.pos, ROWS];
  const o = laserOrigin(g);
  return [o.x, o.y, o.x + Math.cos(l.angle) * l.length, o.y + Math.sin(l.angle) * l.length];
}

export function drawLaser(ctx: CanvasRenderingContext2D, g: Game, l: Laser): void {
  const [x0, y0, x1, y1] = laserEnds(g, l);
  ctx.save();
  ctx.lineCap = 'round';
  if (l.t < l.warn) {
    const k = l.t / l.warn;
    const on = Math.sin(g.time * 28) > 0;
    ctx.strokeStyle = rgba(l.color, 0.06 + 0.12 * k);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = rgba(l.color, on ? 0.5 + 0.5 * k : 0.25);
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.4, 0.3]);
    ctx.lineDashOffset = -g.time * 6;
    ctx.stroke();
  } else {
    const k = (l.t - l.warn) / l.on;
    const fade = k > 0.85 ? (1 - k) / 0.15 : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a, c] of [[1.1, 0.25, l.color], [0.6, 0.6, l.color], [0.2, 1, '#ffffff']] as const) {
      ctx.strokeStyle = rgba(c, a * fade);
      ctx.lineWidth = w * (0.9 + Math.random() * 0.2);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    glow(ctx, x1, y1, 0.8, l.color, fade);
  }
  ctx.restore();
}

export const PICKUP_COLORS: Record<PowerKind | 'bonus', string> = {
  rapid: '#ff9a3a',
  pierce: '#7ff6ff',
  seeker: '#ff8af0',
  shield: '#7fd8ff',
  emp: '#ffe14d',
  life: '#7dff8a',
  bonus: '#ffd23f',
};

export const PICKUP_GLYPHS: Record<PowerKind, string> = { rapid: 'R', pierce: 'P', seeker: 'S', shield: '', emp: 'E', life: '1UP' };

export function drawShieldIcon(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - 0.3 * s);
  ctx.lineTo(x + 0.25 * s, y - 0.2 * s);
  ctx.quadraticCurveTo(x + 0.24 * s, y + 0.15 * s, x, y + 0.32 * s);
  ctx.quadraticCurveTo(x - 0.24 * s, y + 0.15 * s, x - 0.25 * s, y - 0.2 * s);
  ctx.closePath();
  ctx.fill();
}

export function drawBonusIcon(ctx: CanvasRenderingContext2D, sector: number, x: number, y: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  switch (sector) {
    case 0: // battery
      ctx.fillStyle = '#d8e2ff';
      roundRect(ctx, -0.18, -0.32, 0.36, 0.62, 0.06);
      ctx.fill();
      ctx.fillRect(-0.07, -0.4, 0.14, 0.08);
      ctx.fillStyle = '#3bff8a';
      ctx.fillRect(-0.12, -0.02, 0.24, 0.27);
      break;
    case 1: // gear
      ctx.rotate(t * 2);
      ctx.fillStyle = '#c9d1d9';
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * TAU);
        ctx.fillRect(-0.06, -0.38, 0.12, 0.14);
        ctx.restore();
      }
      circle(ctx, 0, 0, 0.27);
      ctx.fill();
      ctx.fillStyle = '#20263a';
      circle(ctx, 0, 0, 0.1);
      ctx.fill();
      break;
    case 2: // microchip
      ctx.fillStyle = '#1f1f2e';
      roundRect(ctx, -0.26, -0.26, 0.52, 0.52, 0.05);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      for (let i = 0; i < 4; i++) {
        const o = -0.2 + i * 0.13;
        ctx.fillRect(o, -0.36, 0.05, 0.1);
        ctx.fillRect(o, 0.26, 0.05, 0.1);
        ctx.fillRect(-0.36, o, 0.1, 0.05);
        ctx.fillRect(0.26, o, 0.1, 0.05);
      }
      ctx.fillStyle = '#ff3fd2';
      ctx.fillRect(-0.1, -0.1, 0.2, 0.2);
      break;
    case 3: // disk
      ctx.fillStyle = '#2f6bff';
      roundRect(ctx, -0.3, -0.3, 0.6, 0.6, 0.05);
      ctx.fill();
      ctx.fillStyle = '#d0d8e8';
      ctx.fillRect(-0.16, -0.3, 0.32, 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-0.2, 0.04, 0.4, 0.24);
      break;
    case 4: // crystal
      ctx.fillStyle = '#9ff6ff';
      ctx.beginPath();
      ctx.moveTo(0, -0.4);
      ctx.lineTo(0.24, -0.08);
      ctx.lineTo(0, 0.4);
      ctx.lineTo(-0.24, -0.08);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.moveTo(0, -0.4);
      ctx.lineTo(0.08, -0.08);
      ctx.lineTo(0, 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    default: // golden bolt
      ctx.rotate(0.4);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-0.07, -0.18, 0.14, 0.52);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) ctx.moveTo(Math.cos(a) * 0.22, -0.22 + Math.sin(a) * 0.14);
        else ctx.lineTo(Math.cos(a) * 0.22, -0.22 + Math.sin(a) * 0.14);
      }
      ctx.closePath();
      ctx.fill();
  }
  ctx.restore();
}

export function drawPickup(view: View, g: Game, k: Pickup): void {
  const ctx = view.ctx;
  const left = k.life - k.t;
  if (left < 2 && Math.floor(k.t * 10) % 2 === 0) return;
  const bob = Math.sin(k.t * 4) * 0.08;
  const color = PICKUP_COLORS[k.kind];
  glow(ctx, k.x, k.y + bob, 1, color, 0.55);
  if (k.kind === 'bonus') {
    drawBonusIcon(ctx, g.spec.sector, k.x, k.y + bob, g.time);
    return;
  }
  ctx.save();
  ctx.translate(k.x, k.y + bob);
  ctx.fillStyle = rgba(color, 0.18);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    if (i === 0) ctx.moveTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
    else ctx.lineTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (k.kind === 'shield') drawShieldIcon(ctx, k.x, k.y + bob, 1, color);
  else text(view, PICKUP_GLYPHS[k.kind], k.x, k.y + bob + 0.02, k.kind === 'life' ? 0.3 : 0.44, color, { weight: 900 });
}
