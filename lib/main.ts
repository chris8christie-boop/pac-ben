/*
 * Puts the game on a page: a canvas that fills `host`, the game loop, input,
 * sound and saved progress. Returns a function that removes it all again.
 */
import { createSound } from './audio.ts';
import { createGame, drainEvents, loadLevel, runSnapshot, startRun, STEP, titleRows, update } from './game.ts';
import { createInput } from './input.ts';
import { render } from './render.ts';
import { titleRowRect } from './render-screens.ts';
import { GH, GW, UI, computeLayout } from './render-util.ts';
import type { Layout, View } from './render-util.ts';
import type { Difficulty } from './levels.ts';
import type { Controls, Game, SavedRun } from './types.ts';

export interface PacBenOptions {
  /** CSS font-family list for all text. */
  font?: string;
  /** Skip the title and start at this level (for testing). */
  level?: number;
  /** Carry on a run from where it was (after the page reloads itself). */
  resume?: Resume | null;
  /** Receives a function that describes the run in progress, for `resume`. */
  expose?: (snapshot: () => Resume | null) => void;
}

export interface Resume {
  level: number;
  score: number;
  lives: number;
}

const SAVE_KEY = 'pacben.save.v1';

interface Saved {
  hiScore: number;
  unlocked: number;
  muted: boolean;
  difficulty?: Difficulty;
  run?: SavedRun | null;
}

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      return { hiScore: Number(s.hiScore) || 0, unlocked: Number(s.unlocked) || 0, muted: !!s.muted, difficulty: s.difficulty, run: s.run ?? null };
    }
  } catch {
    // Private windows and blocked storage: play without saving.
  }
  return { hiScore: 0, unlocked: 0, muted: false, run: null };
}

function store(s: Saved): void {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // As above.
  }
}

const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;

function musicFor(g: Game): string | null {
  if (g.paused) return null;
  switch (g.state) {
    case 'title':
      return 'title';
    case 'intro':
    case 'play':
      return g.spec.boss ? `boss:${g.spec.sector}` : `sector:${g.spec.sector}`;
    default:
      return null;
  }
}

export function startPacBen(host: HTMLElement, options: PacBenOptions = {}): () => void {
  const font = options.font ?? '"Orbitron", "Segoe UI", system-ui, sans-serif';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Pac Ben game');
  canvas.setAttribute('role', 'img');
  canvas.tabIndex = 0;
  Object.assign(canvas.style, {
    display: 'block',
    width: '100%',
    height: '100%',
    touchAction: 'none',
    userSelect: 'none',
    webkitUserSelect: 'none',
    outline: 'none',
    cursor: 'default',
  });
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const saved = load();
  const g = createGame({ hiScore: saved.hiScore, unlocked: saved.unlocked, difficulty: saved.difficulty, run: saved.run });
  const sound = createSound(saved.muted);
  const resume = options.resume;
  if (resume && resume.level >= 1 && resume.lives > 0) {
    startRun(g, 0);
    g.score = Math.max(0, Math.floor(resume.score) || 0);
    g.lives = Math.floor(resume.lives);
    while (g.nextLife <= g.score) g.nextLife += 30000;
    loadLevel(g, resume.level);
  } else if (options.level && options.level >= 1) {
    startRun(g, 0);
    loadLevel(g, options.level);
  }
  options.expose?.(() => (g.state === 'title' || g.state === 'gameover' || g.state === 'victory' ? null : { level: g.level, score: g.score, lives: g.lives }));
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  let layout: Layout = computeLayout(1, 1, 1, coarse);
  const input = createInput(canvas, () => layout, () => sound.unlock());
  const view: View = { ctx, layout, font, focused: document.hasFocus(), stick: input.stick, fireHeld: false, muted: saved.muted, cache: null };

  function resize(): void {
    // The canvas's own box, so padding on the host (safe areas) is respected.
    const w = Math.max(1, canvas.clientWidth || host.clientWidth);
    const h = Math.max(1, canvas.clientHeight || host.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    layout = computeLayout(w, h, dpr, coarse || input.touchSeen());
    view.layout = layout;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  resize();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro?.observe(host);
  window.addEventListener('resize', resize);

  if (document.fonts?.load) {
    for (const w of [600, 700, 800, 900]) void document.fonts.load(`${w} 20px ${font}`).catch(() => undefined);
  }

  const pending: Controls = { dir: -1, fire: false, start: false, pause: false, back: false, left: false, right: false, up: false, down: false, menuRow: -1 };
  let wasTouch = input.touchSeen();
  let lastRunKey = '';

  function save(): void {
    const run = runSnapshot(g) ?? g.savedRun;
    lastRunKey = run ? `${run.level}/${run.lives}` : '';
    store({ hiScore: g.hiScore, unlocked: g.unlocked, muted: sound.isMuted(), difficulty: g.difficulty, run });
  }
  let lastSaved = { hi: g.hiScore, unlocked: g.unlocked, muted: saved.muted, difficulty: g.difficulty };

  function handleTaps(): void {
    for (const tap of input.taps()) {
      if (inRect(tap.x, tap.y, layout.mute)) {
        toggleMute();
        continue;
      }
      if (inRect(tap.x, tap.y, layout.pause)) {
        if (g.state === 'play' || g.state === 'intro' || g.paused) pending.pause = true;
        continue;
      }
      const gx = (tap.x - layout.ox) / layout.scale;
      const gy = (tap.y - layout.oy) / layout.scale;
      const insideGame = gx >= 0 && gy >= 0 && gx <= GW && gy <= GH;
      if (g.paused) {
        if (inRect(gx, gy, UI.quit)) pending.back = true;
        else if (inRect(gx, gy, UI.resume) || !layout.touch) pending.pause = true;
        continue;
      }
      switch (g.state) {
        case 'title': {
          // Tap a row to light it; the left or right third of a picker row changes it, the middle (or
          // a button row) confirms it. Tapping anywhere else starts the game.
          const rows = titleRows(g);
          let hit = -1;
          for (let i = 0; i < rows.length; i++) if (inRect(gx, gy, titleRowRect(g, i))) hit = i;
          if (hit < 0) {
            if (insideGame || layout.touch) pending.start = true;
            break;
          }
          pending.menuRow = hit;
          const picker = rows[hit] === 'difficulty' || rows[hit] === 'sector';
          if (picker && gx < GW / 3) pending.left = true;
          else if (picker && gx > (GW * 2) / 3) pending.right = true;
          else if (hit === g.menuRow || !picker) pending.start = true;
          break;
        }
        case 'clear':
        case 'gameover':
        case 'victory':
          pending.start = true;
          break;
      }
    }
  }

  function toggleMute(): void {
    sound.unlock();
    sound.setMuted(!sound.isMuted());
    view.muted = sound.isMuted();
  }

  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let running = true;

  function frame(now: number): void {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;

    if (input.touchSeen() !== wasTouch) {
      wasTouch = input.touchSeen();
      resize();
    }
    const c = input.poll();
    if (input.muteToggled()) toggleMute();
    pending.start ||= c.start;
    pending.pause ||= c.pause;
    pending.back ||= c.back;
    pending.left ||= c.left;
    pending.right ||= c.right;
    pending.up ||= c.up;
    pending.down ||= c.down;
    handleTaps();

    while (acc >= STEP) {
      const step: Controls = { ...pending, dir: c.dir, fire: c.fire };
      pending.start = pending.pause = pending.back = pending.left = pending.right = pending.up = pending.down = false;
      pending.menuRow = -1;
      update(g, STEP, step);
      acc -= STEP;
    }

    for (const e of drainEvents(g)) sound.play(e.type);
    sound.music(musicFor(g));

    view.fireHeld = input.fireHeld();
    view.focused = document.hasFocus();
    view.muted = sound.isMuted();
    render(view, g);

    // Save when something lasting changes: the run reaching a new level or losing a life, a record,
    // a new sector, the difficulty or the sound setting. Score alone is saved when the page is hidden.
    const run = runSnapshot(g);
    const runKey = run ? `${run.level}/${run.lives}` : g.state === 'gameover' || g.state === 'victory' ? '' : lastRunKey;
    if (runKey !== lastRunKey && (g.state !== 'play' || run)) {
      if (!run && (g.state === 'gameover' || g.state === 'victory')) g.savedRun = null;
      save();
    }
    if (g.hiScore !== lastSaved.hi || g.unlocked !== lastSaved.unlocked || view.muted !== lastSaved.muted || g.difficulty !== lastSaved.difficulty) {
      if (g.state !== 'play' || g.hiScore - lastSaved.hi > 5000 || g.unlocked !== lastSaved.unlocked || view.muted !== lastSaved.muted || g.difficulty !== lastSaved.difficulty) {
        lastSaved = { hi: g.hiScore, unlocked: g.unlocked, muted: view.muted, difficulty: g.difficulty };
        save();
      }
    }
  }
  raf = requestAnimationFrame(frame);

  function onVisibility(): void {
    if (document.hidden) {
      if (g.state === 'play' || g.state === 'intro') g.paused = true;
      sound.music(null);
      save();
    }
  }
  // Clicking outside the game (or into another frame) takes the keyboard away: pause until it's back.
  function onBlur(): void {
    view.focused = false;
    if (!layout.touch && (g.state === 'play' || g.state === 'intro')) g.paused = true;
    save();
  }
  function onFocus(): void {
    view.focused = true;
  }
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pagehide', save);
  canvas.focus({ preventScroll: true });

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pagehide', save);
    save();
    input.dispose();
    sound.dispose();
    canvas.remove();
  };
}

