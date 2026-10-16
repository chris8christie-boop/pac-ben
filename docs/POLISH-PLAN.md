# Pac Ben: the polish plan

The goal: turn a working game into one a kid wants to come back to every day. This plan is written so that any Claude session (or person) can build it phase by phase in `pacben/`. Read `pacben/README.md` first for how the game is put together.

## Where the game stands (review, 16 Oct 2026)

What works: 30 generated Pac-Man-style mazes, 11 robot types, 6 bosses with phases, power-ups, combos, overdrive, touch/keyboard/gamepad, synthesised sound and music, saved high score and sector unlocks, a single-file build, 19 passing tests.

What holds it back:

| | Problem | Where |
|---|---|---|
| Bug | Stepping off a teleport pad and straight back onto it doesn't teleport. The full-run test (`a careful bot can clear every level`) fails on level 12 because of it. | `lib/maze.ts`, `advance()` |
| Feel | Nothing celebrates the player. Kills, level clears and boss phases happen without weight: no freeze-frame, no transitions, no fanfare. | `lib/render.ts`, `lib/game.ts` |
| Story | There is no reason Ben is in the maze. No intro, no villain lines, no ending beyond "YOU WIN". | new |
| Progress | A closed tab loses the run (restarts at sector start). Nothing to collect or unlock. One difficulty, tuned only against a bot. | `lib/main.ts`, `lib/levels.ts` |
| Sound | Never heard by a human. Square waves may be harsh; music is one pattern with different roots. | `lib/audio.ts` |
| Mobile | Works, but isn't installable and doesn't work offline. | `scripts/build-standalone.mjs` |
| Code | `lib/render.ts` is 2,200 lines, hard for any model to edit safely. | `lib/render.ts` |

## Rules for whoever builds this

1. Work only in `pacben/`. Never touch `tyme/`, `src/` or anything at the repository root.
2. Before any change: `cd pacben && pnpm install --frozen-lockfile`. After every task: `pnpm typecheck && pnpm test && pnpm standalone`. All 20 tests must pass before a commit (after task 0.1).
3. Keep `lib/` **flat** and use only `import { x } from './name.ts'` and `export function` / `export const` / `export class`. `scripts/build-standalone.mjs` is a tiny bundler and understands nothing else. No new runtime npm packages.
4. Game rules (`game.ts`, `robots.ts`, `bosses.ts`, `maze.ts`, `levels.ts`) must stay free of browser APIs so tests keep running in Node. Drawing goes in `render*.ts`, sound in `audio.ts`, browser glue in `main.ts`/`input.ts`.
5. Every new rule gets a test in `tests/`. Every new screen gets looked at: open `standalone/pacben.html?level=N` in a browser (or a headless Chromium screenshot) before calling it done.
6. One commit per task, message in the form `Pac Ben: <what changed and why>`. Push to the working branch after each phase.
7. Balance numbers live in `lib/levels.ts` and `lib/bosses.ts`. Change them there, not inline.

## Phase 0: foundation (do first, in this order)

**0.1 Fix the teleport pad.** In `advance()` (`lib/maze.ts`), clear `portalLock` as soon as the mover is no longer standing exactly on the locked pad, not only when it reaches another tile centre. Done when `pnpm test` shows 20 passing, including the full-run bot.

**0.2 Split `render.ts`** into flat files: `render-maze.ts` (maze cache, dots, pads, factory), `render-ben.ts` (`drawBen`), `render-robots.ts` (`drawRobot`), `render-bosses.ts` (all boss drawing), `render-fx.ts` (shots, lasers, pickups, particles, popups, glow helpers), `render-screens.ts` (title, intro, clear, pause, game over, victory), `render-hud.ts`, and keep `render.ts` as the entry (`computeLayout`, `UI`, `View`, `render()`). Pure move, no behaviour change; screenshots before and after must match.

**0.3 Continue where you left off.** Save `{ level, score, lives, difficulty }` at every level start and after every death (`lib/main.ts`, same `localStorage` key family). The title screen shows **CONTINUE** (level N) above **NEW GAME** when a save exists. Test: a game at level 7 with 2 lives, recreated from its save, starts at level 7 with 2 lives and the score intact.

**0.4 Three difficulties** chosen on the title screen and saved: **ROOKIE** (robot speed ×0.8, overdrive ×1.5, 5 lives, respawn delay ×1.5, boss HP ×0.7), **HERO** (as now), **LEGEND** (robot speed ×1.15, 2 lives, boss HP ×1.3, bullets ×1.2 speed). Implement as a multiplier set applied in `levelSpec()` and `createBoss()`; tests check each multiplier. Rookie is the default on first run.

## Phase 1: make it Ben's game

**1.1 Opening story.** Three panels, each a short line of text over a simple drawn scene (reuse `drawRobot`, `drawBen`, boss drawings): *"Neon City ran on good robots... until OMEGA took their minds."* / *"Thirty mazes stand between Omega and the city's last power core."* / *"Only one hero is fast enough. His name is BEN."* Enter/tap advances; skippable; plays on first New Game; **STORY** option on the title afterwards.

**1.2 Boss taunts.** Each boss gets three lines (arrive, halfway, defeated) shown in a speech bubble above it for ~2 s (`lib/levels.ts` holds the lines; `render-bosses.ts` draws the bubble). Examples: Boltz, "YOU CAN'T OUTRUN LIGHTNING, BEN!"; Glitch King, "WHICH ONE OF ME IS REAL?"; Omega, "SO YOU ARE THE ONE THEY CALL BEN."

**1.3 Ending.** After Omega: a slow-motion final explosion, the maze walls go white and fade, then a credits scroll: *STARRING BEN · THE ROBOTS · THE BOSSES (each drawn, named) · MADE FOR BEN* with the run's stats (robots destroyed, dots eaten, time, score). Enter/tap returns to the title. The credit line is configurable in `lib/levels.ts` (`CREDITS`).

**1.4 Ben has a personality.** Idle animation (looks left and right, headband flutters); a "LET'S GO!" popup at level start; a hop and "YES!" on level clear; a slump on death. All in `render-ben.ts` driven by `g.state`.

## Phase 2: feel

**2.1 Hit-stop.** Freeze the simulation for 50 ms on a robot kill and 150 ms on a boss phase change or boss death (`g.freeze` countdown in `update()`; the renderer keeps drawing). Test: during a freeze, positions don't change.

**2.2 Level transitions.** A neon iris closes on level clear and opens on the next level's intro; the HUD level number counts up.

**2.3 Dot eating feels good.** Tiny pop particle per dot; the "waka" pitch rises one step for each dot eaten within 0.5 s of the last (resets after), capped at 8 steps.

**2.4 Overdrive.** Ben leaves a glowing trail; the maze walls pulse in time with the music; robots' eyes turn to wide "scared" eyes (exists) and a heartbeat sound fades in for the last 2 s.

**2.5 Kills.** Score popups scale-punch (1.4× to 1×); the screen edge flashes in the robot's colour; combo ×4 and ×8 shout "GREAT!" / "MEGA COMBO!" in big text; HUD combo bar drains visibly.

**2.6 Boss entrance.** The warning panel shows the boss drawn large and animated; the screen shakes as it lands; the name card slams in from the side.

**2.7 Dot radar.** If no dot has been eaten for 8 s and fewer than 20 remain, draw a soft arrow beside Ben pointing to the nearest dot (use `distanceMap` from the dots).

## Phase 3: rewards

**3.1 Medals and level select.** Each level awards bronze/silver/gold from time, no-damage and clean sweep (boss levels: time and no-damage). Replace the sector picker with a **LEVEL SELECT** grid of 30 tiles showing medals; any reached level can be replayed. Saved per difficulty.

**3.2 Costumes.** Beating each boss unlocks a Ben look, chosen on the title: default red headband; Boltz → yellow lightning headband; Magnetron → purple cape; Shredder → orange goggles; Hydra → green visor; Glitch King → pixel crown; Omega → gold armour with a glow. `drawBen` takes a `look` id; the lives icons use it too.

**3.3 Hall of Fame.** Top 10 scores with 3-letter initials, entered arcade-style (arrows/taps cycle letters) on game over or victory when the score makes the list. Shown from the title.

**3.4 Achievements** (12, shown as a toast when earned, listed on the title): First Blood, Sharpshooter (10 kills without a missed shot), Pacifist (clear a level with no kills), Untouchable (a boss with no damage), Clean Sweep ×5, Ghostbuster (eat 4 robots in one overdrive), Speed Demon (any level under 30 s), Survivor (reach level 10 on one life), Boss Rush (all six bosses in one run), Mega Combo (×8), Collector (every power-up kind), Legend (finish on LEGEND).

## Phase 4: sound

**4.1 Listen and tune.** A human plays 5 minutes with sound on and notes anything harsh or missing. Lower square-wave highs with a low-pass on the sfx bus; keep the compressor.

**4.2 Real music.** Each sector gets its own 8-bar bass pattern and arpeggio shape, not only a different root; bosses get a 4-bar riser before the loop; a victory fanfare and a title theme. Keep it all in `audio.ts` as pattern data.

**4.3 Dynamic layers.** A hi-hat layer joins when a robot is within 5 tiles; a lead layer during overdrive; everything drops to a low drone during the boss warning.

## Phase 5: phone and tablet

**5.1 Installable and offline.** The standalone build also writes `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (render once from `app/icon.svg` with headless Chromium and commit the PNGs) and a service worker that caches the page. Opening the site on an iPad and choosing "Add to Home Screen" gives a full-screen app that works offline.

**5.2 Layouts.** Check portrait phone, landscape phone and iPad; the stick and fire button must never overlap the maze. Haptic tick on hit where `navigator.vibrate` exists.

## Phase 6: ship

**6.1 Hosting.** Public GitHub repository `pac-ben` with a GitHub Actions workflow that runs `pnpm standalone` on every push and publishes `standalone/` to GitHub Pages as `index.html`. The README's first line is the play link.

**6.2 Version.** `v1.x` in the title screen corner from `package.json`; a `CHANGELOG.md` with a line per phase.

## Order and size

| Phase | Must / nice | Rough size |
|---|---|---|
| 0 Foundation | Must | 1 session |
| 1 Ben's game | Must | 1–2 sessions |
| 2 Feel | Must (2.1, 2.2, 2.5, 2.6); nice (rest) | 1–2 sessions |
| 3 Rewards | Must (3.1, 3.2); nice (3.3, 3.4) | 2 sessions |
| 4 Sound | Must (4.1); nice (4.2, 4.3) | 1 session |
| 5 Phone | Must (5.1) | 1 session |
| 6 Ship | Must | ½ session |

Definition of done for the whole plan: a kid can open a link on a phone, tablet or laptop, pick Rookie, watch the story, play from level 1 to Omega over several sittings without losing progress, unlock all seven costumes, and see their name in the Hall of Fame.
