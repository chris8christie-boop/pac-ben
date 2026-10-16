/* The robots. */
import { TAU, rgba, shade, glow, circle, roundRect } from './render-util.ts';
import { ROBOT_SPECS } from './levels.ts';
import type { RobotKind } from './levels.ts';
import { DX, DY } from './maze.ts';
import { cloakAmount } from './robots.ts';
import type { Game, Robot } from './types.ts';

export interface RobotLook {
  t: number;
  frightened?: boolean;
  frightLeft?: number;
  flash?: boolean;
  alpha?: number;
  stun?: boolean;
  scale?: number;
  hp?: number;
  maxHp?: number;
  charge?: number;
  /** Where its eyes look. */
  lookX?: number;
  lookY?: number;
}

export function drawRobot(ctx: CanvasRenderingContext2D, kind: RobotKind, x: number, y: number, dir: number, o: RobotLook): void {
  const spec = ROBOT_SPECS[kind];
  const t = o.t;
  const s = spec.size * (o.scale ?? 1);
  const frightened = !!o.frightened;
  const blink = frightened && (o.frightLeft ?? 9) < 1.8 && Math.floor(t * 8) % 2 === 0;
  let base = frightened ? (blink ? '#e0e6ff' : '#2b48ff') : spec.color;
  if (o.flash) base = '#ffffff';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha *= o.alpha ?? 1;
  const bob = Math.sin(t * 9) * 0.03;
  const lx = o.lookX ?? (dir >= 0 ? DX[dir] * 0.07 : 0);
  const ly = o.lookY ?? (dir >= 0 ? DY[dir] * 0.05 : 0);

  glow(ctx, 0, 0, 0.95, frightened ? '#2b48ff' : spec.color, 0.32);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0.44, 0.34, 0.07, 0, 0, TAU);
  ctx.fill();

  const dark = shade(base.startsWith('#') ? base : '#ffffff', -0.5);
  const light = shade(base.startsWith('#') ? base : '#ffffff', 0.3);
  const bodyGrad = (y0: number, y1: number) => {
    const grd = ctx.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, light);
    grd.addColorStop(0.5, base);
    grd.addColorStop(1, dark);
    return grd;
  };

  if (kind === 'phantom') {
    // A ghost: dome and a wavy hem.
    ctx.beginPath();
    ctx.moveTo(-0.4, 0.38);
    ctx.lineTo(-0.4, -0.05 + bob);
    ctx.arc(0, -0.05 + bob, 0.4, Math.PI, 0);
    ctx.lineTo(0.4, 0.38);
    for (let i = 0; i < 4; i++) {
      const x0 = 0.4 - (i + 1) * 0.2;
      ctx.quadraticCurveTo(x0 + 0.1, 0.38 - 0.14 * (i % 2 === 0 ? 1 : -0.2) + Math.sin(t * 12 + i) * 0.04, x0, 0.38);
    }
    ctx.closePath();
    ctx.fillStyle = bodyGrad(-0.45, 0.4);
    ctx.fill();
  } else if (kind === 'bomber') {
    circle(ctx, 0, 0.02 + bob, 0.4);
    ctx.fillStyle = bodyGrad(-0.4, 0.42);
    ctx.fill();
    ctx.strokeStyle = '#3a2a00';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.38, 0.1 + bob);
    ctx.lineTo(0.38, 0.1 + bob);
    ctx.stroke();
    ctx.strokeStyle = '#c9b48a';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.1, -0.36 + bob);
    ctx.quadraticCurveTo(0.22, -0.55, 0.3, -0.52);
    ctx.stroke();
    glow(ctx, 0.3, -0.52, 0.25 + Math.random() * 0.1, '#ffb030', 1);
  } else {
    // Legs or treads.
    if (kind === 'tank') {
      ctx.fillStyle = '#2a2f40';
      roundRect(ctx, -0.44, 0.22, 0.88, 0.2, 0.08);
      ctx.fill();
      ctx.strokeStyle = '#5a6380';
      ctx.lineWidth = 0.04;
      const off = (t * 3) % 0.16;
      ctx.beginPath();
      for (let i = -0.4 + off; i < 0.42; i += 0.16) {
        ctx.moveTo(i, 0.24);
        ctx.lineTo(i, 0.4);
      }
      ctx.stroke();
    } else if (kind === 'speeder') {
      ctx.strokeStyle = rgba(spec.color, 0.5);
      ctx.lineWidth = 0.04;
      const bx = dir >= 0 ? -DX[dir] : -1;
      const by = dir >= 0 ? -DY[dir] : 0;
      ctx.beginPath();
      for (const o2 of [-0.2, 0, 0.2]) {
        const px = by !== 0 ? o2 : 0;
        const py = bx !== 0 ? o2 : 0;
        ctx.moveTo(bx * 0.45 + px, by * 0.45 + py);
        ctx.lineTo(bx * (0.75 + Math.random() * 0.2) + px, by * (0.75 + Math.random() * 0.2) + py);
      }
      ctx.stroke();
    } else {
      const step = Math.sin(t * 16) * 0.035;
      ctx.fillStyle = '#20263a';
      roundRect(ctx, -0.25, 0.26 + step, 0.13, 0.14, 0.04);
      ctx.fill();
      roundRect(ctx, 0.12, 0.26 - step, 0.13, 0.14, 0.04);
      ctx.fill();
    }
    // Torso.
    const wide = kind === 'tank' ? 0.42 : 0.36;
    roundRect(ctx, -wide, -0.12 + bob, wide * 2, 0.42, 0.12);
    ctx.fillStyle = bodyGrad(-0.12, 0.3);
    ctx.fill();
    if (kind === 'ambusher') {
      ctx.strokeStyle = base;
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      const snap = Math.abs(Math.sin(t * 6)) * 0.2;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * 0.46, 0.06 + bob, 0.13, sx > 0 ? -1.2 - snap : Math.PI - 1.9 + snap, sx > 0 ? 1.2 + snap : Math.PI + 1.9 - snap, sx < 0);
        ctx.stroke();
      }
    }
    if (kind === 'flanker') {
      ctx.fillStyle = dark;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * 0.3, -0.36 + bob);
        ctx.lineTo(sx * 0.52, -0.5 + bob);
        ctx.lineTo(sx * 0.34, -0.18 + bob);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Head.
    if (kind === 'splitter') {
      for (const sx of [-0.17, 0.17]) {
        circle(ctx, sx, -0.26 + bob, 0.21);
        ctx.fillStyle = bodyGrad(-0.47, -0.05);
        ctx.fill();
      }
    } else {
      const hw = kind === 'tank' ? 0.38 : kind === 'mini' ? 0.36 : 0.32;
      roundRect(ctx, -hw, -0.47 + bob, hw * 2, 0.38, 0.16);
      ctx.fillStyle = bodyGrad(-0.47, -0.09);
      ctx.fill();
    }
    // Chest light.
    glow(ctx, 0, 0.1 + bob, 0.2, '#ffffff', 0.4 + Math.sin(t * 5) * 0.3);
    if (kind === 'tank') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (const bx of [-0.3, 0.3]) {
        circle(ctx, bx, 0.02 + bob, 0.04);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(-0.42, 0.14 + bob);
      ctx.lineTo(0.42, 0.14 + bob);
      ctx.stroke();
    }
    // Antenna.
    if (kind !== 'tank') {
      ctx.strokeStyle = dark;
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(0, -0.46 + bob);
      ctx.lineTo(0, -0.6 + bob);
      ctx.stroke();
      ctx.fillStyle = Math.floor(t * 3) % 2 === 0 ? '#ffffff' : base;
      circle(ctx, 0, -0.62 + bob, 0.05);
      ctx.fill();
    }
  }

  // Face.
  const fy = (kind === 'phantom' ? -0.1 : kind === 'bomber' ? -0.1 : -0.28) + bob;
  if (frightened) {
    ctx.fillStyle = blink ? '#ff3355' : '#ffe9c4';
    ctx.fillRect(-0.15, fy - 0.05, 0.08, 0.08);
    ctx.fillRect(0.07, fy - 0.05, 0.08, 0.08);
    ctx.strokeStyle = blink ? '#ff3355' : '#ffe9c4';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const px = -0.21 + i * 0.07;
      const py = fy + 0.14 + (i % 2 === 0 ? 0 : -0.05);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else {
    if (kind !== 'splitter') {
      ctx.fillStyle = '#0a0d1c';
      const vw = kind === 'tank' ? 0.6 : kind === 'bomber' ? 0.46 : 0.5;
      roundRect(ctx, -vw / 2, fy - 0.1, vw, 0.2, 0.08);
      ctx.fill();
    }
    const eye = o.stun ? '#7fd8ff' : kind === 'chaser' ? '#ffe14d' : '#ffffff';
    const eyes: [number, number][] =
      kind === 'tank' ? [[0, 0]] : kind === 'mini' ? [[0, 0]] : kind === 'splitter' ? [[-0.17, 0.02], [0.17, 0.02]] : kind === 'wanderer' ? [[Math.cos(t * 4) * 0.08, Math.sin(t * 4) * 0.03]] : [[-0.11, 0], [0.11, 0]];
    for (const [ex, ey] of eyes) {
      const px = ex + lx;
      const py = fy + ey + ly;
      if (o.stun) {
        ctx.strokeStyle = eye;
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(px - 0.04, py - 0.04);
        ctx.lineTo(px + 0.04, py + 0.04);
        ctx.moveTo(px + 0.04, py - 0.04);
        ctx.lineTo(px - 0.04, py + 0.04);
        ctx.stroke();
        continue;
      }
      glow(ctx, px, py, 0.17, eye, 0.9);
      ctx.fillStyle = eye;
      if (kind === 'tank') {
        ctx.fillRect(px - 0.16, py - 0.03, 0.32, 0.06);
      } else {
        circle(ctx, px, py, kind === 'mini' || kind === 'wanderer' ? 0.07 : 0.055);
        ctx.fill();
      }
    }
    if (kind === 'chaser') {
      ctx.strokeStyle = '#0a0d1c';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.2, fy - 0.15);
      ctx.lineTo(-0.04, fy - 0.08);
      ctx.moveTo(0.2, fy - 0.15);
      ctx.lineTo(0.04, fy - 0.08);
      ctx.stroke();
    }
  }

  if (kind === 'gunner' && !frightened) {
    const d = dir < 0 ? 1 : dir;
    ctx.save();
    ctx.translate(0, 0.06 + bob);
    ctx.rotate(Math.atan2(DY[d], DX[d]));
    ctx.fillStyle = '#2e3a12';
    roundRect(ctx, 0.1, -0.07, 0.42, 0.14, 0.05);
    ctx.fill();
    ctx.fillStyle = base;
    ctx.fillRect(0.44, -0.08, 0.08, 0.16);
    if (o.charge && o.charge > 0) glow(ctx, 0.56, 0, 0.3 + (0.42 - o.charge) * 1.2, '#d4ff6b', 1);
    ctx.restore();
  }

  if (o.maxHp && o.maxHp > 1 && o.hp !== undefined && !frightened) {
    for (let i = 0; i < o.maxHp; i++) {
      ctx.fillStyle = i < o.hp ? '#ffffff' : 'rgba(255,255,255,0.2)';
      circle(ctx, (i - (o.maxHp - 1) / 2) * 0.16, -0.78, 0.045);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawRobotEntity(ctx: CanvasRenderingContext2D, g: Game, r: Robot): void {
  const p = g.player;
  let alpha = 1;
  if (r.spawnT > 0) alpha = 1 - r.spawnT / 0.7;
  const cloak = cloakAmount(r);
  if (cloak > 0) alpha *= 1 - cloak * 0.88;
  if (r.spawnT > 0) {
    glow(ctx, r.x, r.y, 1.4 * (r.spawnT / 0.7) + 0.3, ROBOT_SPECS[r.kind].color, 0.7);
  }
  const look = Math.atan2(p.y - r.y, p.x - r.x);
  drawRobot(ctx, r.kind, r.x, r.y, r.dir, {
    t: r.anim,
    frightened: r.frightened,
    frightLeft: g.player.overdrive,
    flash: r.flash > 0,
    alpha,
    stun: r.stun > 0,
    hp: r.hp,
    maxHp: r.maxHp,
    charge: r.charge,
    lookX: r.stun > 0 ? 0 : Math.cos(look) * 0.07,
    lookY: r.stun > 0 ? 0 : Math.sin(look) * 0.05,
  });
}
