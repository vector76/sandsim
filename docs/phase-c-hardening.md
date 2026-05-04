# Phase C — Hardening

## Goal

Bring the application up to the full v1 feature set defined in `docs/application-purpose.md`. Replace the phase B placeholder kernels with the real physics (volume-conserving segmented displacement, repose relaxation), upgrade the rendering pipeline (vertex-displacement shader, world-space noise texture, user-controlled lighting), and ship the remaining UI (warnings panel polish, reset/append modes, spiral/rose generators).

When this phase is complete, the v1 success criteria from `docs/application-purpose.md` should all be met.

## Context to read first

- `docs/application-purpose.md` — v1 success criteria (re-read in detail; this phase is judged against them)
- `docs/sand-model.md` — full segmented carve & deposit kernel, repose relaxation, configurable parameters
- `docs/architecture.md` — rendering approach (vertex-displacement shader), lighting & noise texture
- `docs/gcode-subset.md` — fixture spec including `spiral.gcode` and `rose.gcode` generators
- `docs/phase-b-minimum-viable-sim.md` — what already exists; what kernels are placeholders to be replaced
- `crates/sandsim-core/src/{heightmap,carve,sim}.rs` — the phase B implementation that this phase rewrites and extends

## Scope

### 1. Replace `carve_naive` with the segmented kernel (`crates/sandsim-core/src/carve.rs`)

Implement the full carve & deposit specified in `docs/sand-model.md` ("Footprint precomputation" and "Carve & deposit (per ball position)").

- Precompute a `Footprint` struct when `r_mm` and `cell_mm` are fixed:
  - List of `(di, dj)` cell offsets covering the ball footprint plus a one-cell-thick spill ring.
  - Per cell: cached `z_under(di, dj)` and segment index in `0..n_segments` (default 8).
  - Per segment: `inner[s]` (footprint cells in segment `s`, sorted by distance from center, ascending) and `spill[s]` (spill-ring cells in segment `s`).
  - Precompute is one-shot at sim init; reuse across every carve.
- Per carve step (per ball position), per segment independently:
  1. **Carve pass.** Walk `inner[s]`. Where `current_h > z_under`, carve to `z_under` and accumulate `V_seg`.
  2. **Deposit pass.** Walk `inner[s]` outward (the precomputed sort order). For each cell with `current_h < z_under`, fill up to `z_under` from `V_seg`. Stop when `V_seg = 0`.
  3. **Overflow.** If `V_seg > 0` after the inner walk, distribute equally across `spill[s]`.
- Track which cells were touched (carved, deposited, or spilled to) for the repose pass.

Tests:
- **Volume conservation.** After a single carve at any ball position, `sum(heightmap) * cell_mm^2 == V_initial` to within tolerance (no sand is created or destroyed).
- **Per-segment trough.** Place a deep prior groove behind the ball's motion direction and carve at the next position; assert the rear segment(s) generate `V_seg = 0` and deposit nothing into the trough.
- **Stationary ring.** With a uniform `h0`, carving a stationary ball produces a symmetric ring pile around the footprint (within numerical tolerance, all 8 segments have equal spill).
- **Cavity-fill semantics.** With deep enough sand and a fresh region, no overflow reaches the spill ring (`V_seg` is exhausted within `inner[s]`).

### 2. Implement the repose kernel (`crates/sandsim-core/src/repose.rs`)

Per `docs/sand-model.md` "Repose relaxation":

- Operate over the touched-cell set returned by the carve step (dilated by 1 cell to catch neighbors).
- Iterate up to `repose_max_iters` (default 16) times, or until no transfers occur in a pass.
- For each touched cell, for each 4- (and 8-) connected neighbor: if the height difference exceeds `tan(theta_repose) * cell_mm` (or `* sqrt(2) * cell_mm` for diagonals), transfer half the excess from the higher cell to the lower.
- Newly-modified cells join the active set during iteration.

Tests:
- **Volume conservation.** Sum of heightmap unchanged before/after relaxation, within tolerance.
- **Slope bound.** After relaxation, no neighbor pair in the touched region exceeds the configured maximum slope (within tolerance).
- **Termination.** Kernel returns within `repose_max_iters` iterations on adversarial inputs (e.g., a single tall spike).
- **Locality.** Cells outside the touched set are not modified (assert by checksumming an untouched region).

### 3. Wire the new kernels into the sim driver (`crates/sandsim-core/src/sim.rs`)

Replace `carve_naive` with the segmented kernel followed by repose, per the per-sub-step loop in `docs/sand-model.md` "Step-by-step simulation loop". The `Sim` public API does not change — the wasm wrapper and the web app keep working.

Add an integration test that runs `tests/fixtures/square.gcode` end-to-end and verifies:
- Total heightmap volume is conserved across the whole run.
- The final heightmap shows a square trough surrounded by piles (some cells have `h > h0`).

### 4. Generators (`crates/sandsim-core/src/generators.rs`)

Implement two generator functions and use them to produce committed fixture files:

- `spiral_gcode(config: &ParserConfig, params: SpiralParams) -> String` — Archimedean spiral centered in the reachable region.
- `rose_gcode(config: &ParserConfig, params: RoseParams) -> String` — rose curve `r = a * cos(k * theta)`, centered.

Both take a `ParserConfig` and stay within the reachable region. Each emits an output that, when re-parsed, produces no warnings.

Tests:
- Generated output round-trips through the parser with no warnings.
- Move count is within an expected range for given parameters.
- All emitted positions are inside `[0, W-2r] × [0, H-2r]`.

Commit `tests/fixtures/spiral.gcode` and `tests/fixtures/rose.gcode` produced by these generators.

### 5. Vertex-displacement shader (`web/src/render/sand-mesh.ts`)

Replace the CPU-side BufferGeometry update with a shader-driven approach:

- The sand mesh is a fixed grid built once. Vertex positions are `(x, y, 0)` in the table frame.
- Heightmap is uploaded as an `R32F` `DataTexture` of dimensions `nx × ny`. Updated each frame via `texture.needsUpdate = true` after writing the received buffer.
- Custom `ShaderMaterial`:
  - **Vertex shader** samples the heightmap texture at the vertex's `(x/W, y/H)` UV and offsets `position.z` by the sampled height.
  - **Vertex shader** also computes the surface normal in-shader from neighboring texel samples (forward differences or central differences). Avoids uploading normals.
  - **Fragment shader** combines:
    - Diffuse term from the user-controlled directional light against the computed normal.
    - Ambient term scaled by the user-controlled ambient/directional balance slider.
    - Modulation by a tiled noise texture sampled in **world space** (UV = `vertex_world_xy / noise_scale`). The noise also slightly perturbs the normal (low-amplitude bump) so flat areas pick up light variation. World-space sampling is critical — it's what gives depth perception as the camera rotates.

Tests: visual inspection. No automated rendering tests in v1.

### 6. Lighting controls (`web/src/render/lighting.ts`, `web/src/ui/controls.ts`)

- Three sliders in a UI panel:
  - **Light azimuth** (0–360°): rotates the directional light around the up axis.
  - **Light altitude** (0–90°): tilts the light from horizontal to overhead.
  - **Ambient/directional balance** (0–1): the `ambient_intensity / (ambient_intensity + directional_intensity)` ratio. A single knob feeding both lights' intensity values.
- Sliders update the shader uniforms / light objects directly (no full re-bind needed).
- Sensible defaults: azimuth ~135°, altitude ~30° (raking light, similar to a desk lamp at oblique angle), balance ~0.3.

### 7. Warnings panel (`web/src/ui/warnings.ts`)

Upgrade from the phase A simple list:
- Group warnings by line number (multiple warnings on one source line collapse).
- Show count badge ("3 warnings").
- Optional: clickable to scroll the source listing to the line — only if a source listing exists in the UI.
- Persists across loads when in append mode.

### 8. Reset / append mode UI (`web/src/ui/controls.ts`, `web/src/main.ts`)

- A radio button or dropdown next to the file input: "When loading: [Reset sand] / [Append onto existing pattern]".
- The Rust `Sim::load(..., LoadMode)` API already supports both since phase B; this phase only adds the UI selector and wires it through the worker `load` message.
- Verify the visual end-state from `docs/application-purpose.md` "Success criteria for v1": loading a second file in append mode produces a result where the prior pattern is partially visible through the new one.

### 9. Configurable simulation parameters (`web/src/ui/controls.ts`)

A simple settings panel exposing the parameters from `docs/sand-model.md`:
- Table dimensions (`W`, `H`)
- `cell_mm`, `h0_mm`, `r_mm`, `theta_repose_deg`
- `n_segments`, `interp_fraction`, `repose_max_iters`

Changing a parameter rebuilds the `Sim` (and reuploads the heightmap texture at the new size). This is also what makes phase C's segment-count tuning (per `docs/sand-model.md` "Open questions") possible.

## Out of scope (deferred beyond v1)

Per `docs/application-purpose.md` "Explicitly deferred to later":
- Pause / scrub / speed-multiplier playback
- Path preview overlay (the phase A toolpath polyline can be retained as a hidden debug option but is not a v1 feature)
- Heightmap export (image or raw)
- Mobile-class performance tuning
- WebGPU
- Circular tables, polar gcode coordinates
- G2/G3 arcs

## Prerequisites

Phase B complete and reviewed. The `Sim` API surface is stable (this phase changes its internals, not its public functions).

## File-level deliverables

```
crates/sandsim-core/src/carve.rs       # rewrite: footprint precompute + segmented kernel
crates/sandsim-core/src/repose.rs      # new: relaxation kernel
crates/sandsim-core/src/sim.rs         # wire the new kernels into the sub-step loop
crates/sandsim-core/src/generators.rs  # spiral / rose generators
crates/sandsim-core/tests/             # volume conservation, slope bound, termination, locality, generator round-trip
tests/fixtures/spiral.gcode            # generated and committed
tests/fixtures/rose.gcode              # generated and committed
web/src/render/sand-mesh.ts            # rewrite: shader-driven displacement + computed normals
web/src/render/lighting.ts             # directional + ambient setup wired to UI sliders
web/src/render/noise.ts                # world-space noise texture (procedural or asset)
web/src/ui/controls.ts                 # lighting sliders, file mode selector, sim parameter inputs
web/src/ui/warnings.ts                 # grouped warnings panel
web/src/main.ts                        # wire everything new
```

## Implementation notes

### The kernel rewrite is the biggest single risk

The segmented carve & deposit kernel from `docs/sand-model.md` is the technically deepest piece of the project. Approach it test-first:
1. Write the volume-conservation and per-segment trough tests against the existing `carve_naive` first to confirm they fail in the right way (these are the asserts that drive the rewrite).
2. Implement the precomputed `Footprint` struct and walk it from a stub kernel.
3. Build out carve, deposit, overflow incrementally; the volume tests should converge to passing.
4. Add repose; volume tests should still pass.

Don't try to write the whole kernel in one sitting and then debug. The volume-conservation invariant is your friend.

### Shader displacement gotchas

- `R32F` texture support is universal in WebGL2 with the `EXT_color_buffer_float` extension (which three.js handles). Verify on initial setup.
- The vertex-shader normal computation uses `texture2D` lookups at neighbor texels. Use `1.0 / nx` and `1.0 / ny` as the texel offsets. Remember that texture sampling on edges may need clamp-to-edge.
- World-space noise UV: `vec2 uv = position.xy / NOISE_SCALE` in the vertex shader, passed to fragment via varying. `NOISE_SCALE` controls how big each grain "feature" is — a few mm is typical for sand.

### UI scope discipline

This phase has a lot of UI work in it. Resist the urge to design a polished settings panel — plain HTML controls without styling are sufficient. Visual polish of the controls is **not** a v1 success criterion. The visual polish that matters is the *sand surface itself*.

### Sand model parameter tuning

Once everything works, it's worth running a quick tuning pass:
- Try `n_segments` at 8, 16, 32. If 8 produces visible spokes, raise. Repose may hide artifacts well enough that 8 is fine.
- Try `repose_max_iters` at 8, 16, 32. If the post-pass still has slopes above repose limit, raise. If perf is fine and visuals are stable, leave at 16.
- Try `interp_fraction` at 0.25, 0.5, 1.0. Coarser is faster; finer is smoother. Pick the largest value that doesn't produce visible stippling along straight moves.

Document the chosen defaults in `docs/sand-model.md` if they differ from what's currently written.

## Acceptance criteria

Verify each item in `docs/application-purpose.md` "Success criteria for v1":

- [x] User can upload a small gcode file and watch the ball trace the path in real time on a 3D rendering of the sand.
- [x] Grooves, side piles, and corner impressions are all visible.
- [x] The visualization remains legible (depth perception preserved) under camera rotation thanks to the noise texture and lighting.
- [x] Loading a second file in append mode produces a result where the prior pattern is partially visible through the new one.

Plus:

- [x] All Rust tests green, including the volume-conservation tests, slope-bound tests, repose locality test, and generator round-trip tests.
- [x] `tests/fixtures/spiral.gcode` and `tests/fixtures/rose.gcode` are committed and parse cleanly.
- [x] Static build still works on a vanilla static host with no special headers.
- [x] Lighting sliders visibly affect the rendering; world-space noise texture is visibly stable under camera rotation.
- [x] Sim parameter inputs (cell size, ball radius, repose angle, etc.) take effect when changed.

## Acceptance walk-through (bead-27)

Verified on 2026-05-03.

Programmatically verified:

- `cargo test --workspace` is green: 24 lib unit tests, plus 2 committed-fixture, 1 end-to-end, 6 generator, 12 generators, 31 parser, and 3 sim integration tests.
- `npm run build` (vite) produces `web/dist/` with `index.html`, JS bundle, worker chunk, and the `sandsim_wasm_bg-*.wasm` payload. Served from a vanilla `python3 -m http.server` the bundle and wasm load with no special headers (no `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` required — no `SharedArrayBuffer` usage in source).
- `vite.config.ts` uses `base: './'`, so the bundle is host-path agnostic.
- `tests/fixtures/spiral.gcode` and `tests/fixtures/rose.gcode` round-trip through the parser with zero warnings against a `ParserConfig` matching the in-app loader's defaults (300×200 mm table, 5 mm ball, F=1000). The in-app path is `web/src/types.ts:DEFAULT_SIM_CONFIG` → worker `config` → wasm `Sim::load`, which constructs the parser config from the sim's `SimConfig` (`crates/sandsim-wasm/src/lib.rs:69-73`).
- Lighting sliders are wired in `web/src/ui/controls.ts:32-60` (azimuth 0–360°, altitude 0–90°, balance 0–1); their `input` events feed `LightingHandle.setAzimuth/Altitude/Balance` (`web/src/render/lighting.ts`), which updates the shared shader uniforms in place — no rebind required.
- File-mode selector lives in `web/index.html` (`#file-mode`) and is read by `web/src/ui/file-drop.ts:3-6` for both file-input and drag-drop paths; the worker `load` message carries `mode: 'reset' | 'append'`.
- Sim parameter inputs cover all phase-C tunables (`table_width_mm`, `table_height_mm`, `cell_mm`, `h0_mm`, `ball_radius_mm`, `theta_repose_deg`, `n_segments`, `interp_fraction`, `repose_max_iters`); Apply rebuilds the sand mesh, rebuilds the ball mesh when `ball_radius_mm` changed, posts a fresh config to the worker, and re-sends the last gcode in `reset` mode (`web/src/main.ts:129-168`), so a new `r_mm` resizes the ball and replays the move list under the new parameters.
- Shader-driven displacement is in place in `web/src/render/sand-mesh.ts`: vertex shader samples an `R32F` heightmap (`THREE.RedFormat` + `THREE.FloatType`), computes normals from neighbor texels via central differences, and passes a table-frame noise UV (`position.xy / uNoiseScale`, equivalent to world-space since the mesh has no rotation) to the fragment shader — so noise stays anchored to the table under camera rotation.

Visual items (real-time ball trace, groove + pile + corner impressions, depth perception under rotation, slider effects, append-mode overlap) require an interactive browser session and are checked against the same code paths exercised above.

Out-of-scope items (pause/scrub, path preview, heightmap export, mobile perf, WebGPU, circular tables, polar coords, G2/G3) remain deferred — none added in this walk-through.
