# Phase A — Toolpath Viewer

## Goal

A static web page where the user drops a `.gcode` file and sees the toolpath rendered as a 3D polyline above a flat table, with orbit camera controls. No simulation, no ball, no sand deformation yet — this phase exists to validate the web build pipeline (Vite, wasm-bindgen, GitHub Pages) and to give the project its first visible artifact.

## Context to read first

- `docs/application-purpose.md` — what the app is, deployment constraints
- `docs/gcode-subset.md` — coordinate frames, parser output (`MoveEvent`, `Warning`)
- `docs/architecture.md` — repo layout, tech stack, hosting story
- `crates/sandsim-core/src/parser.rs` — already implemented and tested; this phase consumes it

## Scope

1. Add `wasm-bindgen` to `crates/sandsim-wasm`. Change its `crate-type` to `["cdylib", "rlib"]`. Add `sandsim-core` as a dependency.
2. Expose a single function from the wasm crate to JavaScript: `parse_gcode(input: &str, table_width_mm, table_height_mm, ball_radius_mm, default_feedrate_mm_per_min) -> JsValue`. Returns `{ moves: MoveEvent[], warnings: Warning[] }`. Use `serde-wasm-bindgen` or similar to serialize the existing `ParseOutput` types — do not duplicate the Rust types in TypeScript by hand.
3. Vite + TypeScript + three.js app under `web/`:
   - `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/tsconfig.json`
   - Vite config must use `vite-plugin-wasm` (or equivalent) and produce a fully static build (`vite build` → `web/dist/`) that works when served from any static host with no special headers.
4. three.js scene:
   - Flat textured (or colored) quad representing the table. Quad spans `[0, W] × [0, H]` in **table-frame** coordinates (the heightmap's frame — see `docs/sand-model.md` for the frame definitions).
   - `OrbitControls` for camera (orbit + zoom + pan).
   - One directional light + ambient — fixed defaults are fine for this phase. (User-controllable lighting is phase C.)
5. File-drop input:
   - Either an `<input type="file" accept=".gcode,.nc,.txt,.cnc">` or a drop zone on the canvas. Both is nicer; one is enough.
   - On file load, read as text, call `parse_gcode()`, then render the toolpath.
6. Toolpath rendering:
   - Build a `THREE.Line` (or `Line2`) from the `MoveEvent` list. The first vertex is the initial position `(0, 0)` in the gcode frame; subsequent vertices are each move's `(x_mm, y_mm)`.
   - Translate by `(r, r)` to convert from gcode frame to table frame before adding to the scene.
   - Draw the line slightly above the table (e.g., `z = 0.1 mm`) so it doesn't z-fight.
7. Warnings panel:
   - Simple HTML `<ul>` (or `<div>` list) somewhere visible on the page.
   - For each warning, show `line N: <message>` and the original source line.
   - Empty/hidden when there are no warnings.

## Out of scope (deferred)

- Sand surface deformation, ball mesh, simulation worker → **Phase B**
- World-space noise texture, user-controllable lighting → **Phase C**
- Warnings panel polish, reset / append modes → **Phase C** (a basic warnings list is in this phase)
- Pause / scrub / speed controls — not in v1 at all
- Path preview overlay as a toggleable feature — not in v1 at all (the toolpath polyline shown in this phase is a debugging artifact and may be removed or hidden once the simulation lands in phase B)

## Prerequisites

- Rust toolchain (already verified: rustc/cargo 1.95)
- Node.js (already verified: 20.x)
- `wasm-pack` — install via `cargo install wasm-pack` or the official installer

## File-level deliverables

```
crates/sandsim-wasm/Cargo.toml       # add wasm-bindgen, serde-wasm-bindgen, sandsim-core
crates/sandsim-wasm/src/lib.rs       # parse_gcode() exposed to JS
web/package.json
web/vite.config.ts
web/tsconfig.json
web/index.html
web/src/main.ts                      # bootstrap: scene, camera, file input wiring
web/src/wasm.ts                      # wasm module loader; typed wrapper around parse_gcode
web/src/render/scene.ts              # three.js scene + OrbitControls + lights + table mesh
web/src/render/toolpath.ts           # MoveEvent[] -> THREE.Line
web/src/ui/file-drop.ts              # file picker / drop zone -> text
web/src/ui/warnings.ts               # warnings panel
web/src/types.ts                     # TypeScript mirrors of MoveEvent / Warning / ParserConfig
                                     # (or generated; do NOT write new ones if serde-wasm-bindgen
                                     #  + a type-generation tool can produce them)
.github/workflows/pages.yml          # optional: GitHub Pages deploy on push to main
```

## Implementation notes

### Coordinate frames

The parser emits **gcode-frame** coordinates (see `docs/gcode-subset.md`). The three.js scene operates in the **table frame**. Translation: `table = gcode + (r, r)`. Apply this translation once, when building the toolpath line geometry.

The table mesh is a `PlaneGeometry` (or two triangles) covering `[0, W] × [0, H]`. Place it on the XY plane at `z = 0`.

three.js conventionally treats Y as "up" in screen space. For this app it's natural to put the *table* on the XY plane and treat Z as "up" (height above the table) — this matches the heightmap's z-coordinate. To do this, set the camera's up vector to `(0, 0, 1)` and place the camera somewhere like `(W/2, -H, max(W, H))` looking at `(W/2, H/2, 0)`.

### Default config

For this phase, hardcode parser config to: `W=300, H=200, r=5, default_feedrate=1000`. Adding UI-driven config is phase C.

### GitHub Pages compatibility check

Before considering this phase done: run `vite build`, serve `web/dist/` via `python -m http.server` or equivalent, and verify the page works without COOP/COEP headers. If it doesn't, the wasm setup is wrong (likely a `SharedArrayBuffer` slipped in via a transitive dep).

### Tests

Pure Rust changes (just adding the wasm wrapper) need no new Rust tests — the parser is already covered. The wrapper itself is a thin serde shim; a single smoke test (Vitest, or just a manual browser load of each fixture) is sufficient. Manual QA of the four fixtures (`square`, `homing`, `wall_clamp`, `unsupported`) is the phase A acceptance check.

## Acceptance criteria

Phase complete; superseded by phase B's simulation pipeline. The toolpath polyline overlay is not retained in the shipped UI.

- [x] `cargo build` and `cargo test` still green (no regression in the parser).
- [x] `cd web && npm run dev` opens a page where:
  - dropping `tests/fixtures/square.gcode` shows a square outline above the table;
  - dropping `tests/fixtures/homing.gcode` shows the homing L-streaks;
  - dropping `tests/fixtures/wall_clamp.gcode` shows the clamped path AND the warnings panel populates;
  - dropping `tests/fixtures/unsupported.gcode` shows the two valid moves AND the warnings panel populates.
- [x] Orbit camera works (drag to rotate, scroll to zoom, right-drag to pan).
- [x] `cd web && npm run build` produces `web/dist/` that, when served from a plain static HTTP server with no special headers, loads and functions correctly.
- [x] The Cargo workspace and the web app are fully integrated: a single command (or short documented sequence) builds both.
