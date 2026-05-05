# sandsim

A web-based 3D simulator for **sand tables** — flat tables covered with a thin layer of sand, where a ball driven by a magnet beneath the table is dragged across the surface, leaving patterns in the sand.

Upload a gcode toolpath, watch the ball trace it in real time on a 3D rendering of the sand surface, and see the patterns it leaves behind. Volume-conserving sand displacement means later passes interact with piles left by earlier passes — the subtle hints of prior patterns that real sand tables produce.

## Status

v1 complete. Volume-conserving segmented carve + repose, vertex-displacement shader with world-space noise, user-controlled lighting, reset/append load modes, and a built-in fixture picker (square / spiral / rose / homing / wall_clamp / unsupported / v1_sandify). Deployed automatically to GitHub Pages on push to `main`.

## Building

The build has two steps, both run from the `web/` directory:

```sh
# 1. Compile Rust → WebAssembly (requires wasm-pack)
npm run build:wasm

# 2. Bundle the web app
npm run build
```

For local development:

```sh
npm run build:wasm   # once, or after changing Rust code
npm run dev          # Vite dev server with HMR
```

## Local CI mirror

`scripts/ci-local.sh` runs the same steps as `.github/workflows/ci.yml` + `pages.yml` (rust tests, wasm build, web tests, vite build, static-serve smoke check). Run it before pushing to predict CI/CD success.

## Goals

- 100% static web page; hostable on GitHub Pages.
- Real-time simulation of a configurable rectangular table at high spatial resolution.
- Orbit camera with user-controlled lighting, plus a world-space noise texture for depth perception under rotation.

## Tech stack

- **three.js** (WebGL2) for rendering.
- **Rust** compiled to WebAssembly for the simulation core.
- **Vite** for the static-site bundle.
- Simulation runs in a Web Worker; heightmap snapshots cross thread boundaries via double-buffered transferable `ArrayBuffer`s.

## Documentation

- [`docs/application-purpose.md`](docs/application-purpose.md) — what the app is, v1 scope, what's deferred.
- [`docs/sand-model.md`](docs/sand-model.md) — heightmap, ball geometry, segmented displacement kernel, repose relaxation.
- [`docs/gcode-subset.md`](docs/gcode-subset.md) — supported commands, coordinate frames, wall clamping, parser output.
- [`docs/architecture.md`](docs/architecture.md) — repo layout, worker model, sim pacing, testing strategy, build sequence.
