# Pac Ben

A top-down maze shooter in the spirit of Pac-Man. Ben runs the corridors, eats the dots and blasts the robots pouring out of the factory in the middle. There are 30 levels across six sectors, and every fifth level is a boss that's harder and stranger than the one before.

## Play

| | Keyboard | Phone or tablet | Gamepad |
|---|---|---|---|
| Move | Arrows or WASD | Drag or swipe with your left thumb | D-pad or left stick |
| Fire | Space (hold for auto-fire) | Hold FIRE with your right thumb | A or right trigger |
| Pause | P or Esc | Pause button | Start |
| Sound | M | Speaker button | |

As in Pac-Man, Ben keeps moving until he hits a wall, and a turn you press early is taken at the next opening. He shoots the way he's facing.

- **Clear a level** by destroying every robot. The count is at the bottom of the screen.
- **Power cores** (the big pulsing dots in the corners) put Ben into overdrive. The robots turn blue and run, you can ram them for 200, 400, 800 and then 1600 points, and you fire twice as fast. On boss levels they also double your damage.
- **Combos**: destroy robots in quick succession to multiply their points, up to ×8.
- **Drops**: destroyed robots sometimes leave a power-up. R is rapid fire, P is piercing shots, S is seeker shots that follow the corridors to the nearest robot, the shield soaks up one hit, E is an EMP that freezes every robot, and 1UP is an extra life. Bonus items appear below the factory after 70 and 170 dots.
- **Extra lives** come at 10,000 points and then every 30,000.
- Reaching a sector unlocks it, so a new run can start there (pick it on the title screen). Your high score and unlocked sectors are kept in this browser.

## Sectors, robots and bosses

| Levels | Sector | New robot | Boss |
|---|---|---|---|
| 1–5 | Neon City | Zapper, Pincer, Dizzy, then Flanker (2) and Brick (3) | **Boltz**: rings of sparks and an aimed zap; it overcharges at half health |
| 6–10 | Toxic Foundry | Sparky shoots back when you line up with it | **Magnetron**: spiral streams, then it warps across the maze and calls in help |
| 11–15 | Synth Circuit | Twinner splits in two | **Shredder**: locks on, charges across the maze leaving embers, bursts into shrapnel, and charges two and then three times in a row as it weakens |
| 16–20 | Solar Core | Phantom fades out, then strikes | **Hydra-Core**: shield drones guard the core. Destroy them all to open a short window. Later it adds homing missiles, which you can shoot down |
| 21–25 | Cryo Grid | Dasher is faster than you | **Glitch King**: decoys that burst when shot, and flagged laser grids across rows and columns |
| 26–30 | The Mainframe | Miner leaves mines | **Omega**: everything above in three phases, ending with turning laser arms |

From sector 3 on, mazes have teleport pads linking opposite corners. Each level's maze is generated from its number, so level 7 is always the same level 7. Mazes follow Pac-Man's rules: mirrored halves, one-tile corridors, no dead ends, and wrap-around tunnels at the sides. Robots behave like the ghosts: they take turns scattering to their corners and hunting, and each type picks its target in its own way.

## Run it

Use Node 22.18 or newer, and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev            # http://127.0.0.1:4322
```

Add `?level=15` to the address to jump straight to a level while testing.

`pnpm standalone` writes `standalone/pacben.html`, the whole game in one file that you can open from disk or put on any static host. Text uses the Orbitron font from Google Fonts and falls back to the system font offline.

Checks:

```sh
pnpm typecheck
pnpm test           # maze rules for all 30 levels, game rules, and a bot playing all 30 levels
pnpm build
```

`pnpm build` fetches Orbitron through `next/font/google`, so it needs access to fonts.googleapis.com and fonts.gstatic.com.

## How it is built

The game is plain TypeScript drawn on one canvas. React only gives the canvas somewhere to sit (`components/pac-ben.tsx`).

| File | What it does |
|---|---|
| `lib/levels.ts` | The 30 levels and their difficulty curve, the sectors and their colours, robot and boss stats |
| `lib/maze.ts` | Maze generation, tile lookups, shortest-path maps and corridor movement |
| `lib/game.ts` | Game state and rules: Ben, shooting, dots, power-ups, scoring, lives and level flow |
| `lib/robots.ts` | Robot brains |
| `lib/bosses.ts` | The six bosses |
| `lib/render.ts`, `lib/contours.ts` | All drawing. Wall outlines are traced from the tile grid, inset and rounded for the neon look |
| `lib/audio.ts` | Sound effects and music, synthesised with Web Audio (no sound files) |
| `lib/input.ts` | Keyboard, touch and gamepad |
| `lib/main.ts` | The game loop and saved progress |

`game.ts`, `robots.ts`, `bosses.ts` and `maze.ts` don't touch the browser, so the tests run the real game in Node. The game updates 120 times a second whatever the screen's refresh rate.

Balance lives in `lib/levels.ts` (speeds, robot counts, spawn rates, overdrive time, which robots appear) and `lib/bosses.ts` (boss health, attack timings and bullet speeds).
