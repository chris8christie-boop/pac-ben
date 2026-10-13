/*
 * Keyboard, touch and gamepad. Touch has a floating stick for the left thumb
 * (or a swipe anywhere) and a fire button for the right.
 */
import type { Layout, Stick } from './render.ts';
import type { Controls } from './types.ts';

export interface Tap {
  x: number;
  y: number;
}

export interface Input {
  /** This frame's controls. Edge flags are cleared once read. */
  poll(): Controls;
  /** Taps and clicks since the last poll, in CSS pixels. */
  taps(): Tap[];
  /** M was pressed. */
  muteToggled(): boolean;
  stick: Stick;
  fireHeld(): boolean;
  /** True once a touch has been seen, so touch controls can be shown. */
  touchSeen(): boolean;
  dispose(): void;
}

const KEY_DIRS: Record<string, number> = {
  ArrowUp: 0,
  KeyW: 0,
  ArrowRight: 1,
  KeyD: 1,
  ArrowDown: 2,
  KeyS: 2,
  ArrowLeft: 3,
  KeyA: 3,
};

const FIRE_KEYS = new Set(['Space', 'KeyJ', 'KeyK', 'KeyZ', 'KeyX', 'ControlLeft', 'ShiftLeft']);

export function createInput(canvas: HTMLCanvasElement, layout: () => Layout, onGesture: () => void): Input {
  const held: number[] = [];
  const fireKeys = new Set<string>();
  const edges = { start: false, pause: false, back: false, left: false, right: false };
  let mute = false;
  let tapList: Tap[] = [];
  let touched = false;

  const stick: Stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, dir: -1 };
  let stickId = -1;
  const fireIds = new Set<number>();
  let swipeDir = -1;

  let padPrev: boolean[] = [];

  function onKeyDown(e: KeyboardEvent): void {
    onGesture();
    const code = e.code;
    if (code in KEY_DIRS) {
      const d = KEY_DIRS[code];
      const i = held.indexOf(d);
      if (i >= 0) held.splice(i, 1);
      held.push(d);
      if (!e.repeat) {
        if (d === 3) edges.left = true;
        if (d === 1) edges.right = true;
      }
      e.preventDefault();
    }
    if (FIRE_KEYS.has(code)) {
      fireKeys.add(code);
      if (!e.repeat && code === 'Space') edges.start = true;
      e.preventDefault();
    }
    if (e.repeat) return;
    if (code === 'Enter' || code === 'NumpadEnter') edges.start = true;
    if (code === 'KeyP' || code === 'Escape') edges.pause = true;
    if (code === 'KeyQ' || code === 'Backspace') edges.back = true;
    if (code === 'KeyM') mute = true;
  }

  function onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    if (code in KEY_DIRS) {
      const i = held.indexOf(KEY_DIRS[code]);
      if (i >= 0) held.splice(i, 1);
    }
    fireKeys.delete(code);
  }

  function onBlur(): void {
    held.length = 0;
    fireKeys.clear();
    fireIds.clear();
    stick.active = false;
    stickId = -1;
  }

  function point(e: PointerEvent): Tap {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const inRect = (p: Tap, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;

  function onPointerDown(e: PointerEvent): void {
    onGesture();
    const p = point(e);
    const L = layout();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') touched = true;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic events; the controls still work.
    }
    const onButton = inRect(p, L.pause) || inRect(p, L.mute);
    tapList.push(p);
    if (onButton || e.pointerType === 'mouse' || !L.touch) return;
    const f = L.fire;
    if (Math.hypot(p.x - f.x, p.y - f.y) < f.r * 1.35) {
      fireIds.add(e.pointerId);
      return;
    }
    if (stickId < 0) {
      stickId = e.pointerId;
      stick.active = true;
      stick.ox = stick.x = p.x;
      stick.oy = stick.y = p.y;
      stick.dir = -1;
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== stickId) return;
    const p = point(e);
    stick.x = p.x;
    stick.y = p.y;
    const dx = p.x - stick.ox;
    const dy = p.y - stick.oy;
    const d = Math.hypot(dx, dy);
    const dead = 12;
    if (d > dead) {
      stick.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      swipeDir = stick.dir;
      // Let the stick follow the thumb, so turning back is always a short move.
      const max = Math.max(40, layout().stickHome.r * 0.9);
      if (d > max) {
        stick.ox = p.x - (dx / d) * max;
        stick.oy = p.y - (dy / d) * max;
      }
    }
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent): void {
    if (e.pointerId === stickId) {
      stickId = -1;
      stick.active = false;
      stick.dir = -1;
    }
    fireIds.delete(e.pointerId);
  }

  const opts: AddEventListenerOptions = { passive: false };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown, opts);
  canvas.addEventListener('pointermove', onPointerMove, opts);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  const noMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener('contextmenu', noMenu);

  function gamepad(): { dir: number; fire: boolean } {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let dir = -1;
    let fire = false;
    for (const pad of pads) {
      if (!pad) continue;
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (b(12)) dir = 0;
      else if (b(15)) dir = 1;
      else if (b(13)) dir = 2;
      else if (b(14)) dir = 3;
      else if (Math.max(Math.abs(ax), Math.abs(ay)) > 0.5) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 1 : 3) : ay > 0 ? 2 : 0;
      fire = fire || b(0) || b(2) || b(5) || b(7);
      const now = pad.buttons.map((x) => x.pressed);
      const pressed = (i: number) => now[i] && !padPrev[i];
      if (pressed(9)) edges.pause = true;
      if (pressed(0) || pressed(9)) edges.start = true;
      if (pressed(1) || pressed(8)) edges.back = true;
      if (pressed(14)) edges.left = true;
      if (pressed(15)) edges.right = true;
      padPrev = now;
      if (dir >= 0 || fire) onGesture();
      break;
    }
    return { dir, fire };
  }

  return {
    poll(): Controls {
      const pad = gamepad();
      let dir = held.length ? held[held.length - 1] : -1;
      if (dir < 0 && stick.active && stick.dir >= 0) dir = stick.dir;
      if (dir < 0 && swipeDir >= 0) dir = swipeDir;
      if (dir < 0) dir = pad.dir;
      swipeDir = -1;
      const c: Controls = { dir, fire: fireKeys.size > 0 || fireIds.size > 0 || pad.fire, ...edges };
      edges.start = edges.pause = edges.back = edges.left = edges.right = false;
      return c;
    },
    taps() {
      const out = tapList;
      tapList = [];
      return out;
    },
    muteToggled() {
      const m = mute;
      mute = false;
      return m;
    },
    stick,
    fireHeld: () => fireIds.size > 0,
    touchSeen: () => touched,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}
