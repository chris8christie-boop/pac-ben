/* Score, lives, dots left, boss health and power-ups. */
import { HUD_TOP, glow, circle, roundRect, text, pad } from './render-util.ts';
import type { View } from './render-util.ts';
import { drawBen } from './render-ben.ts';
import { PICKUP_COLORS, drawShieldIcon } from './render-fx.ts';
import { BOSS_SPECS, SECTORS } from './levels.ts';
import { ROWS } from './maze.ts';
import { POWER_LABELS } from './game.ts';
import type { Game } from './types.ts';

export function drawHud(view: View, g: Game): void {
  const ctx = view.ctx;
  const sector = SECTORS[g.spec.sector];
  text(view, 'SCORE', 1, 0.95, 0.55, '#8a93b8', { align: 'left' });
  text(view, pad(g.score, 6), 1, 2.15, 0.95, '#ffffff', { align: 'left', weight: 800 });
  text(view, 'HI-SCORE', 27, 0.95, 0.55, '#8a93b8', { align: 'right' });
  text(view, pad(g.hiScore, 6), 27, 2.15, 0.95, '#ffd23f', { align: 'right', weight: 800 });
  if (g.state !== 'title') {
    // The level number punches in as each new level starts.
    const punch = g.state === 'intro' && !g.respawn ? 1 + 0.6 * Math.max(0, 1 - Math.max(0, g.stateT - 0.3) / 0.5) * Math.min(1, g.stateT / 0.3) : 1;
    text(view, `LEVEL ${g.level}`, 14, 1.05, 0.8 * punch, sector.wall, { weight: 900, glow: sector.wall });
    text(view, `${sector.name}${g.spec.boss ? ' · BOSS' : ''}`, 14, 2.2, 0.48, '#8a93b8');
  }
  if (g.state === 'title') return;

  const y = HUD_TOP + ROWS + 1;
  // Lives.
  const shown = Math.min(g.lives, 6);
  for (let i = 0; i < shown; i++) drawBen(ctx, 1.2 + i * 1.25, y, 1, 0.5, { t: 0, scale: 0.62 });
  if (g.lives > 6) text(view, `+${g.lives - 6}`, 1.2 + 6 * 1.25, y, 0.5, '#ffffff', { align: 'left' });

  // Middle: boss health or robots left.
  const b = g.boss;
  if (b) {
    const spec = BOSS_SPECS[b.kind];
    const x0 = 9;
    const w = 10;
    text(view, spec.name, 14, y - 0.55, 0.45, spec.color, { weight: 900 });
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, x0, y - 0.1, w, 0.45, 0.2);
    ctx.fill();
    const f = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = b.flash > 0 ? '#ffffff' : spec.color;
    roundRect(ctx, x0, y - 0.1, Math.max(0.3, w * f), 0.45, 0.2);
    ctx.fill();
    const marks = b.kind === 'shredder' ? [0.5, 0.25] : b.kind === 'omega' ? [0.66, 0.33] : [0.5];
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    for (const mk of marks) ctx.fillRect(x0 + w * mk - 0.03, y - 0.1, 0.06, 0.45);
  } else if (g.state !== 'clear') {
    // Dots left to eat.
    glow(ctx, 12.5, y, 0.7, '#ffd23f', 0.5);
    ctx.fillStyle = sector.dot;
    circle(ctx, 12.5, y, 0.2);
    ctx.fill();
    text(view, `× ${g.dotsLeft}`, 13.2, y + 0.05, 0.7, '#ffffff', { align: 'left', weight: 800 });
  }

  // Right: power-ups and overdrive.
  const p = g.player;
  let rx = 26.8;
  const bar = (x: number, w: number, f: number, color: string) => {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y + 0.42, w, 0.14);
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 0.42, w * Math.max(0, Math.min(1, f)), 0.14);
  };
  if (p.overdrive > 0) {
    text(view, 'OVERDRIVE', rx, y - 0.12, 0.42, '#8fb0ff', { align: 'right', weight: 900 });
    bar(rx - 3.6, 3.6, p.overdrive / p.overdriveMax, '#8fb0ff');
    rx -= 4.4;
  }
  if (p.power) {
    const color = PICKUP_COLORS[p.power];
    text(view, POWER_LABELS[p.power], rx, y - 0.12, 0.42, color, { align: 'right', weight: 900, maxWidth: 4.8 });
    bar(rx - 4, 4, p.powerT / p.powerMax, color);
    rx -= 4.8;
  }
  if (p.shield) drawShieldIcon(ctx, rx - 0.3, y + 0.1, 1.3, '#7fd8ff');
  if (g.combo >= 2 && g.comboT > 0) {
    const a = Math.min(1, g.comboT * 2);
    const color = g.combo >= 8 ? '#ff3fd2' : '#ffd23f';
    text(view, `COMBO ×${Math.min(g.combo, 8)}`, 14, HUD_TOP + 0.9, 0.6, color, { weight: 900, stroke: 'rgba(0,0,0,0.6)', alpha: a });
    // The bar drains: kill again before it empties to keep the combo.
    const w = 6 * Math.min(1, g.comboT / 1.6);
    const ctx = view.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, 11, HUD_TOP + 1.45, 6, 0.22, 0.11);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, 14 - w / 2, HUD_TOP + 1.45, w, 0.22, 0.11);
    ctx.fill();
    ctx.restore();
  }
}
