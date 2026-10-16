/* Ben. */
import { TAU, rgba, glow, circle } from './render-util.ts';

/* ---------- characters ---------- */

export interface BenLook {
  t: number;
  moving?: boolean;
  overdrive?: number;
  shield?: boolean;
  muzzle?: number;
  scale?: number;
  /** 0 to 1 through the death animation. */
  death?: number;
  /** Seconds standing still: he looks about. */
  idle?: number;
  /** 0 to 1: squashed flat (the moment he's hit). */
  squash?: number;
}

export function drawBen(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, mouth: number, o: BenLook): void {
  ctx.save();
  ctx.translate(x, y);
  const s = o.scale ?? 1;
  ctx.scale(s, s);
  if (o.squash) ctx.scale(1 + o.squash * 0.25, 1 - o.squash * 0.35);
  // Standing still for a while, he bobs gently.
  const idle = o.idle !== undefined && o.idle > 1 ? o.idle - 1 : 0;
  if (idle) ctx.translate(0, Math.sin(idle * 3) * 0.04);
  if (o.overdrive && o.overdrive > 0) {
    const pulse = 0.7 + Math.sin(o.t * 14) * 0.3;
    glow(ctx, 0, 0, 1.5, '#4a7bff', 0.8 * pulse);
    ctx.strokeStyle = rgba('#8fb0ff', 0.6 * pulse);
    ctx.lineWidth = 0.06;
    circle(ctx, 0, 0, 0.62 + Math.sin(o.t * 10) * 0.05);
    ctx.stroke();
  }
  glow(ctx, 0, 0, 1.15, '#ffd23f', 0.45);
  const dir = facing < 0 ? 3 : facing;
  if (dir === 3) ctx.scale(-1, 1);
  else if (dir === 0) ctx.rotate(-Math.PI / 2);
  else if (dir === 2) ctx.rotate(Math.PI / 2);

  const dying = o.death !== undefined;
  const open = dying ? 0.2 + (Math.PI - 0.2) * Math.min(1, o.death!) : o.moving ? 0.06 + 0.6 * Math.abs(Math.sin(mouth)) : 0.24;
  if (open < Math.PI - 0.01) {
    const body = new Path2D();
    body.moveTo(0, 0);
    body.arc(0, 0, 0.46, open, TAU - open);
    body.closePath();
    const grd = ctx.createRadialGradient(-0.12, -0.16, 0.05, 0, 0, 0.5);
    grd.addColorStop(0, '#fff7b8');
    grd.addColorStop(0.55, '#ffd21f');
    grd.addColorStop(1, '#e89400');
    ctx.fillStyle = grd;
    ctx.fill(body);

    if (!dying) {
      // Headband, with its tails flapping behind.
      ctx.save();
      ctx.clip(body);
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 0.13;
      ctx.beginPath();
      ctx.arc(0, 0, 0.41, Math.PI * 1.02, Math.PI * 1.63);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#ff2d55';
      ctx.lineWidth = 0.08;
      ctx.lineCap = 'round';
      const flap = o.t * (o.moving ? 20 : idle ? 9 : 6);
      ctx.beginPath();
      ctx.moveTo(-0.38, -0.2);
      ctx.quadraticCurveTo(-0.52, -0.24, -0.66, -0.18 + Math.sin(flap) * 0.07);
      ctx.moveTo(-0.38, -0.16);
      ctx.quadraticCurveTo(-0.5, -0.08, -0.62, -0.04 + Math.cos(flap * 1.1) * 0.07);
      ctx.stroke();
      // Eye.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0.05, -0.24, 0.1, 0.12, 0, 0, TAU);
      ctx.fill();
      // Looks about while idle: ahead, back over his shoulder, up.
      const look = idle ? Math.sin(idle * 1.7) : 1;
      ctx.fillStyle = '#1a1030';
      circle(ctx, 0.05 + 0.04 * look, -0.23 - (idle ? Math.max(0, Math.cos(idle * 1.1)) * 0.03 : 0), 0.052);
      ctx.fill();
      if (o.squash) {
        // Eyes screwed shut.
        ctx.strokeStyle = '#1a1030';
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(-0.02, -0.28);
        ctx.lineTo(0.12, -0.22);
        ctx.lineTo(-0.02, -0.18);
        ctx.stroke();
      }
      if (o.muzzle && o.muzzle > 0) {
        glow(ctx, 0.5, 0, 0.7, '#fff2a0', 1);
        ctx.fillStyle = '#ffffff';
        circle(ctx, 0.48, 0, 0.12);
        ctx.fill();
      }
    }
  }
  ctx.restore();
  if (o.shield) {
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, 1.2, '#7fd8ff', 0.35);
    ctx.strokeStyle = rgba('#9fe6ff', 0.75);
    ctx.lineWidth = 0.05;
    circle(ctx, 0, 0, 0.64 * s);
    ctx.stroke();
    ctx.setLineDash([0.12, 0.1]);
    ctx.lineDashOffset = -o.t * 0.6;
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    circle(ctx, 0, 0, 0.56 * s);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
