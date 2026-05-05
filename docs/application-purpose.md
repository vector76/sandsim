# Application Purpose

## What this is

`sandsim` is a web-based 3D simulator for a **sand table** — a flat table covered with a thin layer of sand, where a ball driven by a magnet beneath the table is dragged across the surface, leaving patterns in the sand. The application takes a gcode toolpath as input and visualizes the sand surface that would result from that path being executed on a real sand table.

The simulation models the sand as a deformable surface that conserves volume: sand displaced by the ball has to go somewhere, so it piles at the edges of the groove. Later passes interact with the piles left by earlier passes, which is the physically interesting behavior — wipe patterns leave subtle hints of prior patterns rather than fully erasing them.

## Who this is for

People who design sand-table toolpaths (Sisyphus-style tables and similar) and want to preview the visual result of a path before running it on real hardware. The user is presumed to be familiar with gcode, table dimensions, and the general behavior of a real sand table.

## Deployment constraints

- **100% static web page.** No server, no backend. Hostable on GitHub Pages.
- Modern desktop browsers (Chromium / Firefox / Safari). WebGL2.
- Mobile is a non-goal for v1, but architecture should not paint us into a corner.

## v1 scope

- **Table:** rectangular, configurable dimensions. Origin at lower-left corner. Units: mm.
- **Ball:** configurable diameter, always resting on the table (no Z lift).
- **Sand:** flat initial surface at configurable depth. Heightmap (dexel grid) representation. Volume-conserving displacement that fills cavities under the ball before spilling outward, segmented into angular wedges so the trough behind the ball stays open. Angle-of-repose relaxation, single configurable angle (default 30°).
- **GCode:** G0 and G1 only (treated identically — both carve, no rapids). Modal feedrate. Z moves and unrecognized commands ignored with warnings. Comments stripped. See `gcode-subset.md`.
- **Playback:** real-time at gcode feedrate. Ball rendered on the surface during playback.
- **Visualization:** orbit camera with zoom and pan. World-space noise texture on the sand surface for depth cues. Single directional light with user-controllable azimuth / altitude, plus ambient, with a slider for ambient/directional balance.
- **File loading:** upload a `.gcode` file. On a subsequent upload, user can choose to reset the sand or play the new file on top of the existing pattern (as if the gcode were concatenated).
- **Wall behavior:** gcode positions are clamped to the configured reachable region `[0, gcode_W] × [0, gcode_H]`; out-of-bounds gcode generates a warning. Internally this corresponds to keeping the ball center at least `r` from each table-frame wall.

## Explicitly deferred to later

- Circular tables and polar gcode coordinates.
- Pause / scrub / speed-multiplier playback controls (real-time only in v1).
- Path preview overlay (nice-to-have).
- Heightmap export (image or raw).
- Mobile-class performance tuning.
- WebGPU (would unlock GPU sim and possibly higher resolution).
- G2 / G3 arcs.

## Success criteria for v1

A user can upload a small gcode file and watch the ball trace the path in real time on a 3D rendering of the sand, with grooves, side piles, and corner impressions all visible. The visualization remains legible (depth perception preserved) under camera rotation thanks to the noise texture and lighting. Loading a second file on top of the first produces a result where the prior pattern is partially visible through the new one.
