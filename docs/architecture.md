# Architecture

## Hosting & deployment

The application is a 100% static web page. **GitHub Pages compatible** — no server, no special HTTP headers, no `SharedArrayBuffer`, no service-worker tricks. This constraint shapes several decisions below.

## Tech stack

| Layer | Choice |
| --- | --- |
| Rendering | three.js (WebGL2 backend) |
| Simulation core | Rust, compiled to WebAssembly via `wasm-bindgen` |
| Bundler / dev server | Vite, with a wasm plugin |
| Concurrency | One Web Worker hosting the WASM simulation; UI/render on the main thread |
| Sim ↔ render data transfer | Double-buffered transferable `ArrayBuffer`s |
| Tests (Rust) | `cargo test` |
| Tests (JS glue) | Vitest |
| Tests (rendering) | Manual visual inspection in v1 |

## Repo layout

```
sandsim/
  Cargo.toml                 # workspace manifest
  crates/
    sandsim-core/            # pure Rust: parser, heightmap, carve, repose, generators
      src/                   # parser.rs, heightmap.rs, carve.rs, repose.rs,
                             # sim.rs, generators.rs
      tests/                 # parser, sim, generator, end-to-end, committed-fixture tests
      examples/              # generate_fixtures.rs (regenerates spiral/rose .gcode)
    sandsim-wasm/            # thin wasm-bindgen wrapper around sandsim-core
      src/
  web/
    package.json
    vite.config.ts
    index.html
    src/
      main.ts                # bootstrap: scene, camera, controls, file input, light controls
      worker.ts              # owns the wasm sim, runs the wall-clock-paced loop
      sim-protocol.ts        # message types between worker and main
      types.ts               # SimConfig + parser config shared between main and worker
      render/
        scene.ts             # three.js scene + OrbitControls
        sand-mesh.ts         # static grid + R32F DataTexture + displacement shader
        ball.ts
        lighting.ts          # directional + ambient with azimuth/altitude/balance
        noise.ts             # procedural world-space noise texture
        toolpath.ts          # phase-A polyline builder; not wired into the shipped UI
      ui/
        controls.ts          # sim parameter inputs + lighting sliders
        file-drop.ts         # file input, drag-drop, fixture picker, reset/append mode
        warnings.ts          # grouped warnings panel
  tests/
    fixtures/                # *.gcode test inputs (also consumed by sandsim-core tests)
  scripts/
    ci-local.sh              # mirror of GitHub Actions ci.yml + pages.yml
  .github/workflows/
    ci.yml                   # cargo + vitest + vite build on push/PR
    pages.yml                # GitHub Pages deploy
  docs/
```

### Why split `sandsim-core` and `sandsim-wasm`

`sandsim-core` is pure Rust with no `wasm-bindgen` or web-specific dependencies. This means:

- It is testable with plain `cargo test` on any host (fast, no browser, no JS toolchain).
- It can be reused outside the browser later (CLI, headless renderer, comparison tool) without surgery.
- The wasm wrapper stays tiny — its only job is to expose a JS-friendly API and own the heightmap buffers.

## Worker / main-thread split

The main thread does:

- File input handling.
- three.js scene, camera controls (orbit / zoom / pan), lighting controls.
- Receives heightmap snapshots from the worker and uploads them into the sand mesh's `R32F` displacement texture each frame.
- Rendering at 60 fps via `requestAnimationFrame`.

The worker does:

- Owns the WASM module instance.
- Owns two heightmap buffers (`bufA`, `bufB`) of equal size.
- Runs the wall-clock-paced simulation loop.
- Periodically transfers the most recent buffer to the main thread.

### Double-buffered transfer protocol

```
worker:  bufA = active (writing into)
         bufB = idle
loop:
  advance sim by elapsed wall-clock time, writing into bufA
  if main thread is ready for an update:
    postMessage({type: "frame", buf: bufA, ballPos, time}, [bufA.buffer])
    swap: bufA <- bufB, bufB <- (returned from main when it sends back)
  yield
main:
  on "frame":
    upload bufA contents to GPU (heightmap texture or vertex displacement)
    postMessage({type: "release", buf: bufA}, [bufA.buffer])  // return ownership
```

Transferable `ArrayBuffer`s move ownership without copying. The worker always has at least one buffer to write into; the main thread holds at most one at a time.

If the main thread hasn't released a buffer by the time the worker is ready to swap, the worker keeps writing into the current buffer for one more cycle (rare under normal load — render is 60 fps, sim updates at most ~60 fps).

## Sim pacing

The worker's loop is wall-clock-paced, **not** free-running:

```
let mut sim_time = 0.0;
let mut last_real = now();
let mut speed = 1.0;             // future: user-controlled multiplier

loop {
    let real_now = now();
    let real_dt  = real_now - last_real;
    last_real = real_now;

    let advance_by = real_dt * speed;
    advance_simulation(advance_by);   // calls into wasm: process moves up to sim_time + advance_by
    sim_time += advance_by;

    maybe_post_frame();
    yield_to_event_loop();
}
```

Inside `advance_simulation`, the core walks the gcode `MoveEvent`s, sub-stepping as described in `sand-model.md`, until it has consumed `advance_by` worth of simulated time. This naturally gives:

- **Real-time playback** at the gcode's feedrate (speed = 1.0).
- **Free speed-multiplier knob** for the future (just change `speed`).
- **No drift**: time is measured against wall clock, not accumulated dt.

If the sim falls behind (cannot keep up with `speed = 1.0`), it processes what it can per tick and the user perceives slowdown rather than skipped state. We will not skip simulation steps to "catch up" — correctness over framerate.

## Sim ↔ main message protocol

Worker → main:

- `{type: "ready"}` — worker has loaded wasm and is ready to accept commands.
- `{type: "warnings", warnings: Warning[]}` — emitted after parsing or during simulation.
- `{type: "frame", buf: ArrayBuffer, nx, ny, ballPos: {x, y}, simTime}` — heightmap snapshot. `buf` ownership transfers to main.
- `{type: "done"}` — gcode fully consumed; sim idle.

Main → worker:

- `{type: "config", params: SimConfig}` — table dimensions, cell size, ball radius, repose angle, etc.
- `{type: "load", gcode: string, mode: "reset" | "append"}` — load gcode; either reset sand or layer onto existing pattern.
- `{type: "release", buf: ArrayBuffer}` — return buffer ownership to worker.
- `{type: "stop"}` — halt simulation.

## Rendering approach

The sand surface is rendered as a regular grid mesh with `nx * ny` vertices, each displaced in `z` by the heightmap value. Two viable options for the displacement:

1. **Vertex displacement in shader:** upload the heightmap as an `R32F` texture; a vertex shader samples it and offsets `z`. The grid mesh is built once. Transfer per frame is cheap (texture upload).
2. **CPU-side BufferGeometry update:** copy the heightmap into the geometry's position attribute each frame and mark it dirty.

We will use option (1) for v1 — it offloads work to the GPU, keeps per-frame CPU cost to a texture upload, and is the standard approach for animated terrain. Normals can be computed in the shader from neighbor samples to avoid uploading them.

## Lighting & noise texture

- One directional light. Azimuth and altitude are user-controlled (UI sliders). Color is white for v1.
- One ambient light. A "balance" slider controls the ratio of ambient to directional intensity.
- Optional shadow map — out of scope for v1, but the directional light is positioned so it can drive shadows later if added.
- A tiled noise texture (e.g., grain-pattern Perlin or Worley) is sampled in **world space** (using the vertex's `(x, y)` position scaled to texture coordinates) so the grain stays put on the table surface as the sand deforms. This gives strong depth cues during camera rotation. The texture also modulates the surface normal slightly (a low-amplitude bump) so flat areas pick up some light variation.

## Testing strategy

| Component | How tested |
| --- | --- |
| GCode parser | `cargo test` in `sandsim-core`. Hand-crafted fixtures in `tests/fixtures/`. Tests for: comments, line numbers, modal feedrate, Z drop, unsupported codes (warnings), wall clamping. |
| Heightmap & carve kernel | `cargo test` in `sandsim-core`. Tests verify: ball footprint correctness, volume conservation (carved volume == deposited volume modulo repose), idempotence on already-carved cells. |
| Repose kernel | `cargo test` in `sandsim-core`. Tests verify: volume conservation, slopes after relaxation are <= configured angle, kernel terminates within iteration cap. |
| Spiral / rose generators | `cargo test` in `sandsim-core`. Tests verify: outputs are well-formed gcode, produce expected number of moves, stay within table bounds. |
| WASM wrapper | One smoke test (`vitest`) that loads the wasm, runs a tiny fixture, and checks frame output shape. Not a deep test surface. |
| Web UI / three.js | Manual visual inspection in v1. Aim for low-logic, declarative wiring so the test gap is small. |

The Rust core is the bulk of the logic and the bulk of the test coverage. Per the project's TDD CLAUDE.md, parser and kernel tests will be written before or alongside their implementations.

## v1 build sequence

v1 is shipped. Implementation was organized into three phases, each producing a visible milestone. Each phase has its own document with scope, deliverables, and an acceptance walk-through.

- **Phase A — toolpath viewer** (`phase-a-toolpath-viewer.md`). First visual moment. Vite + three.js + minimal wasm-bindgen wrapper exposing the parser. Drop a gcode file, see the toolpath as a 3D polyline above a flat table. Validated the web build pipeline and GitHub Pages compatibility before deeper work depended on it. The polyline overlay was retired once the simulation landed.
- **Phase B — minimum viable simulation** (`phase-b-minimum-viable-sim.md`). First "it's alive" moment. Heightmap, naive (non-volume-conserving) carve, sim driver, web worker, double-buffered transferable buffers, CPU-side mesh updates. The pipeline (worker, double-buffer protocol, ball/sand meshes) survives to v1; the naive kernel was replaced in phase C.
- **Phase C — hardening** (`phase-c-hardening.md`). All v1 success criteria from `application-purpose.md`. Replaced phase B's placeholder kernels with the full segmented carve & repose from `sand-model.md`, switched sand rendering to a vertex-displacement shader, added the world-space noise texture and user-controllable lighting, shipped the warnings panel, the reset/append mode UI, the simulation parameter inputs, and the spiral/rose generators.

After phase C: configs were reframed into the gcode coordinate frame (the user-facing `gcode_width_mm` / `gcode_height_mm`; the heightmap is sized to gcode + 2·r internally), defaults were retuned (`r=8`, `h0=1`, `n_segments=32`), a built-in fixture picker was added to the file-drop UI, and GitHub Pages auto-deploy + a local CI mirror script (`scripts/ci-local.sh`) were wired up.
