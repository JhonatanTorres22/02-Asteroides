# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Clone of the classic arcade game **Asteroids**, implemented in pure HTML5 Canvas + vanilla ES6+ JavaScript. No dependencies, no bundler, no build step, no package.json.

## Running

Open `index.html` directly in a browser, or serve it locally:

```bash
npx serve .
```

There is no build, lint, or test tooling in this repo — changes to `game.js` are verified by reloading the page in a browser.

## Architecture

Everything lives in a single file, `game.js`, loaded directly by `index.html` (canvas id `canvas`, 800×600, fixed size — no resize handling). The file is organized top-to-bottom as:

- **Input** — `keys` (held) and `justPressed` (edge-triggered, consumed via `pressed(code)`) populated by `keydown`/`keyup` listeners.
- **Utils** — `wrap` (toroidal position wrap for screen-edge wraparound), `dist`, `rand`, `randInt`.
- **Entity classes** — `Bullet`, `Asteroid`, `Ship`, `Particle`. Each has `update(dt)` and `draw()`; entities mark themselves `dead = true` and get filtered out of their arrays each frame rather than being spliced in place.
- **Global mutable game state** — `ship`, `bullets`, `asteroids`, `particles`, `score`, `lives`, `level`, `state` (`'playing' | 'dead' | 'gameover'`), `deadTimer`. Reset via `initGame()`, advanced via `nextLevel()`.
- **`update(dt)`** — branches on `state` first. Handles shooting, per-entity updates, bullet↔asteroid collisions (asteroids split via `Asteroid.split()` into two smaller ones, or disappear at the smallest size), ship↔asteroid collision (triggers `killShip()`), and level completion when `asteroids.length === 0`.
- **`draw()`** / **`drawHUD()`** / **`drawOverlay()`** — pure rendering, no state mutation.
- **Main loop** — `requestAnimationFrame(loop)`, computing `dt` in seconds and clamping it (`Math.min(..., 0.05)`) to avoid large jumps after tab-switch.

Key gameplay constants (asteroid radii/speeds/points per size, ship thrust/rotation/drag, bullet speed/lifetime) are defined near the top of each relevant section rather than centralized — check `RADII`/`SPEEDS`/`POINTS` arrays (indexed by asteroid size 1–3) and the per-class constructors when tuning balance.

The space is toroidal: all moving entities wrap position via `wrap(v, max)` on both axes.
