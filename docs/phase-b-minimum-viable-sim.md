# Phase B — Minimum Viable Simulation

## Goal

Drop a `.gcode` file and watch the ball trace the path in real time on the sand surface, with visible grooves appearing as it moves. This is the project's "it's alive" milestone.

This phase deliberately uses a **stripped-down, non-volume-conserving** carve and **no repose**. Grooves appear; piles do not. The full physically-correct displacement and repose are phase C — the point of phase B is to wire up the entire simulation/render pipeline end-to-end so phase C can swap in the real kernels behind a stable interface.

## Context to read first

- `docs/sand-model.md` — heightmap, ball geometry, `z_under` formula, simulation step loop, configurable parameters
- `docs/architecture.md` — worker model, double-buffered transferable `ArrayBuffer` protocol, sim pacing
- `docs/gcode-subset.md` — `MoveEvent` shape, coordinate-frame translation
- `docs/phase-a-toolpath-viewer.md` — what already exists in `web/`
- `crates/sandsim-core/src/parser.rs` and the parser tests — the API the simulation consumes

## Scope

### Rust core (`crates/sandsim-core`)

1. **Heightmap** (`src/heightmap.rs`):
   - Struct holding `nx`, `ny`, `cell_mm`, `Vec<f32>` of length `nx * ny`.
   - Constructors: `new_flat(config, h0)`, `from_buffer(...)`.
   - `get(i, j)`, `set(i, j, h)`, `idx(i, j)`.
   - `world_to_cell(x_mm, y_mm) -> (i, j)`, `cell_center(i, j) -> (x_mm, y_mm)` (table-frame).
   - Tests for grid math and conversions.
2. **Carve, naive version** (`src/carve.rs`):
   - One function: `carve_naive(heightmap, ball_center_table_mm, ball_radius_mm)`.
   - For every cell whose center lies within the ball footprint, set `h := min(h, z_under(dx, dy))`. No deposition, no spill ring, no segments.
   - Iterate by computing the bounding box of the footprint and walking only those cells. Do **not** precompute an offset list yet — that's phase C.
   - Tests:
     - Carving an initially-flat heightmap with a centered ball produces a circular crater whose deepest point is `0` (touching the table).
     - Carving twice in the same place is idempotent.
     - Cells outside the footprint are unchanged.
3. **Sim driver** (`src/sim.rs`):
   - `Sim` struct holding: parser config, heightmap, current ball position (table frame, starts at `(r, r)`), the `Vec<MoveEvent>` queue (gcode frame), and the index/parametric position along the current segment.
   - `Sim::new(config, h0)` — initialize flat sand, ball at `(r, r)`.
   - `Sim::load(moves: Vec<MoveEvent>, mode: LoadMode)` — `LoadMode::Reset` resets the heightmap to flat and resets ball to `(r, r)`; `LoadMode::Append` keeps both. Append is wired but won't be exercised by UI until phase C — implement it now to keep the Rust API stable.
   - `Sim::advance(dt_seconds)` — advance the simulation by wall-clock `dt`. Walks `MoveEvent`s, sub-stepping each segment by `interp_fraction * cell_mm` per sub-step. At each sub-step, calls `carve_naive` at the new ball position.
   - `Sim::ball_position_table() -> (f32, f32)` — for the renderer.
   - `Sim::heightmap_buffer() -> &[f32]` — shared read of the heightmap, for the wasm wrapper to copy into the transfer buffer.
   - Tests:
     - Stationary ball (one move with zero length) produces the same crater as a single `carve_naive` call.
     - Single straight horizontal move produces a continuous trough (every cell along the path is below `h0`).
     - Two intersecting moves leave a continuous carved shape (no gaps).
     - `advance(dt)` consumes simulated time correctly: at feedrate F mm/min, after `dt = 60 * length / F` seconds the sim should be exactly at the move's endpoint.

### WASM wrapper (`crates/sandsim-wasm`)

Extend the wrapper from phase A. New API surface for JS:

```
// Phase A (already exists)
parse_gcode(input, table_w, table_h, r, default_feedrate) -> { moves, warnings }

// Phase B (new)
class Sim {
  constructor(table_w, table_h, cell_mm, h0, r, default_feedrate)
  load(gcode_text, mode: "reset" | "append") -> { warnings }
  step(dt_seconds) -> void           // advances the sim
  fill_heightmap(buf: Float32Array) -> void  // copies current heightmap into a JS-owned buffer
  ball_position() -> [number, number]        // table-frame xy
  is_done() -> boolean
  nx() -> number
  ny() -> number
}
```

`Sim` is a `#[wasm_bindgen]` opaque handle wrapping the Rust `Sim`. `fill_heightmap` is the seam for the double-buffered transfer protocol — JS hands in an `ArrayBuffer` view, Rust copies into it.

### Web app (`web/`)

1. **Web Worker** (`web/src/worker.ts`):
   - Loads the wasm module.
   - Owns the `Sim` and two `ArrayBuffer`s (`bufA`, `bufB`) sized to `nx * ny * 4` bytes.
   - Implements the message protocol from `docs/architecture.md`:
     - `main → worker`: `config`, `load`, `release`, `stop`
     - `worker → main`: `ready`, `warnings`, `frame`, `done`
   - Wall-clock-paced inner loop (per `docs/architecture.md` "Sim pacing").
2. **Sim protocol types** (`web/src/sim-protocol.ts`):
   - TypeScript message-type union with strict types.
3. **Sand mesh** (`web/src/render/sand-mesh.ts`):
   - A `PlaneGeometry` (or custom `BufferGeometry`) with `widthSegments = nx - 1`, `heightSegments = ny - 1` so vertex count matches the heightmap.
   - On each `frame` message from the worker, copy the received heightmap into the geometry's `position` attribute Z-component and mark dirty. CPU-side update — no shader yet.
   - Recompute normals (`geometry.computeVertexNormals()`) per frame so lighting works.
4. **Ball mesh** (`web/src/render/ball.ts`):
   - `SphereGeometry` of radius `r_mm`.
   - Position updated each frame from worker's reported ball position. `z = r_mm` (resting on the table).
5. **Main thread wiring** (`web/src/main.ts`):
   - On file drop, post `{type: "load", gcode, mode: "reset"}` to the worker. The toolpath polyline from phase A may stay as an optional debug overlay or be removed — implementer's choice; the simulation supersedes it visually.
   - On `frame` message: update sand mesh, update ball position, send `release` back.
   - 60 fps render loop (`requestAnimationFrame`) independent of sim cadence.

## Out of scope (deferred to phase C)

- Volume conservation, segmented displacement kernel, spill ring
- Repose relaxation
- Vertex-displacement shader (this phase uses CPU-side BufferGeometry updates)
- World-space noise texture
- User-controlled lighting (azimuth/altitude/ambient sliders)
- Reset/append UI (the Rust API supports both modes; UI exposes only "reset" in this phase by always using `mode: "reset"`)
- Warnings panel improvements (the phase A warning panel still works for parser warnings)
- Spiral / rose generators

## Prerequisites

Phase A complete. wasm-pack installed.

## File-level deliverables

```
crates/sandsim-core/src/heightmap.rs   # Heightmap struct + tests
crates/sandsim-core/src/carve.rs       # carve_naive + tests
crates/sandsim-core/src/sim.rs         # Sim driver + tests
crates/sandsim-core/tests/             # integration tests for the sim driver
crates/sandsim-wasm/src/lib.rs         # extend with the Sim handle
web/src/worker.ts                      # wasm-hosting worker, paced loop, double-buffer protocol
web/src/sim-protocol.ts                # message types
web/src/render/sand-mesh.ts            # grid mesh + per-frame position update
web/src/render/ball.ts                 # ball mesh
web/src/main.ts                        # extend to spawn worker, route messages, render frames
```

## Implementation notes

### Frame dimensions and the f32 buffer

The transferable buffer is exactly `nx * ny * 4` bytes (a `Float32Array` view). The worker's two buffers are allocated once at startup; ownership ping-pongs across the postMessage boundary. The render thread uses the buffer it owns to update the sand mesh, then `postMessage`s it back to the worker.

If the main thread hasn't returned a buffer by the time the worker is ready to swap, the worker keeps writing into the current one for an extra cycle. Don't allocate fresh buffers per frame.

### Normals on the CPU

`geometry.computeVertexNormals()` is acceptable for phase B but is not cheap at 240k vertices. If perf is a problem, a small optimization is to recompute normals only for cells touched this frame. But don't over-engineer: the displacement shader in phase C eliminates this cost entirely.

### Worker bootstrap

A common pitfall: Vite's worker integration depends on the syntax used (`new Worker(new URL("./worker.ts", import.meta.url), {type: "module"})`). Use the form that produces a separate bundle and works in the production build. Verify both `npm run dev` and `npm run build` paths.

### Sim stepping

Per `docs/sand-model.md`, sub-step size is `interp_fraction * cell_mm` (default 0.5 mm). With a 5 mm ball at 0.5 mm cells, a typical 100 mm move at 1000 mm/min takes 6 seconds and ~400 sub-steps. That's well under what we can do at 60 fps; perf headroom is generous in phase B because we're not running repose.

### What "minimum viable" really means

The visual end-state of phase B is: drop `square.gcode`, watch a sphere drag along a square, see four gradually deepening grooves where it traveled. The grooves *do not have piles next to them* and *do not interact with each other beyond the deepest-wins logic*. This is intentional. Reviewers should not flag the missing piles as a defect — that work is owned by phase C.

### Tests

- Rust: heightmap unit tests, carve crater shape, sim straight-line groove, sim feedrate timing. Aim for the full battery to run in well under a second so TDD stays fast.
- Web: a Vitest smoke test that loads the wasm, constructs a `Sim`, posts one `load` and a few `step` calls, and confirms the heightmap buffer is non-flat afterward. Manual QA of the fixtures is the primary acceptance check for the rendering path.

## Acceptance criteria

Phase complete. `carve_naive` has since been replaced by the segmented kernel + repose in phase C; the rest of the pipeline (worker, double-buffer protocol, ball/sand meshes) is unchanged.

- [x] All Rust tests in `cargo test -p sandsim-core` green, including the new heightmap, carve, and sim tests.
- [x] Loading `tests/fixtures/square.gcode` in the browser shows the ball tracing a square in real time, leaving four visible grooves.
- [x] Loading `tests/fixtures/homing.gcode` shows the homing L-streaks carved into the sand.
- [x] Sim runs at the gcode feedrate (real-time): a 100 mm move at F1000 takes 6 seconds.
- [x] Render thread stays at 60 fps during simulation. Camera controls remain responsive.
- [x] No memory leaks: loading multiple files in sequence does not grow the heightmap buffer count beyond two.
- [x] Static build works on a vanilla static host (re-verify GitHub Pages compatibility).
