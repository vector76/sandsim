# Sand Model

## Overview

The sand surface is represented as a **heightmap** (a dexel grid): a regular 2D array of cells covering the table, where each cell stores the height of the top of the sand at that location. The table surface is at `z = 0`. A cell's value is the local sand thickness in mm.

Granular simulation is explicitly out of scope. All effects (grooves, piles, corner impressions, repose) are produced by combining two operations on the heightmap: **carve** (when the ball is over the cell) and **repose relaxation** (when slopes exceed the angle of repose).

## Coordinate frames

All physics in this document operates in the **table frame**: origin `(0, 0)` at the lower-left corner of the physical table, `x` increasing rightward, `y` increasing "up" when looking down at the table, `z` above the table surface. The heightmap is indexed in the table frame.

The gcode frame (origin at the lower-left of the reachable region) is the user-facing frame; it appears here only in the configurable-parameters table at the bottom (the `gcode_width_mm` / `gcode_height_mm` knobs). Translation `table = gcode + (r, r)` happens at the boundary between the parser and the simulation core. See `gcode-subset.md` for the gcode-frame definition.

## Grid

- Cell size `cell_mm` is configurable. Default `0.5 mm`.
- Grid dimensions: `nx = ceil(W / cell_mm)`, `ny = ceil(H / cell_mm)`, where `W` and `H` are the physical table dimensions (i.e. `gcode_W + 2 r` and `gcode_H + 2 r`).
- Each cell stores a single `f32` height value. For a v1 gcode region of 300 × 200 mm with `r = 8 mm` at 0.5 mm cells: 632 × 432 ≈ 273k cells ≈ 1.1 MB per buffer.
- Cell `(i, j)` covers the region `[i * cell_mm, (i+1) * cell_mm) × [j * cell_mm, (j+1) * cell_mm)`. The cell's "sample point" is its center, at `((i + 0.5) * cell_mm, (j + 0.5) * cell_mm)`.

## Initial state

The sand starts flat at a configurable depth `h0_mm` (default 1 mm). Every cell is initialized to `h0_mm`. The ball's initial position in the table frame is `(r_mm, r_mm)`, corresponding to gcode `(0, 0)`.

## Ball geometry

- Ball radius: `r_mm` (configurable; ball diameter = `2 * r_mm`).
- The ball always rests on the table: ball center is at `z = r_mm`. It does not lift, and its z-coordinate is always `r_mm` regardless of gcode Z (which is ignored).
- The ball center, in the table frame, is constrained to `[r_mm, W - r_mm] × [r_mm, H - r_mm]`. The parser handles this clamping in the gcode frame; by the time positions reach the simulation, they are already legal.
- The ball's underside, at horizontal offset `(dx, dy)` from the ball's center, is at:

  ```
  z_under(dx, dy) = r_mm - sqrt(r_mm^2 - dx^2 - dy^2)    if dx^2 + dy^2 <= r_mm^2
                    (undefined / outside footprint)       otherwise
  ```

## Footprint precomputation

When `r_mm` and `cell_mm` are fixed, we precompute a **footprint table** used by every carve step:

- A list of `(di, dj)` integer cell offsets covering all cells whose centers lie within the ball footprint (`(di * cell_mm)^2 + (dj * cell_mm)^2 <= r_mm^2`).
- For each offset, the cached value `z_under(di * cell_mm, dj * cell_mm)`.
- A **segment index** in `0..N_SEG` (default `N_SEG = 32`) for each cell, computed as `floor(((atan2(dj, di) + pi) / (2 * pi)) * N_SEG)`.
- Per segment, two ordered lists:
  - `inner[s]`: cells whose centers are inside the footprint, **sorted by distance from ball center, ascending**.
  - `spill[s]`: cells whose centers are in a one-cell-thick ring just outside the footprint and whose angle falls in segment `s`.

This precomputation runs once at config time. For `r = 8 mm`, `cell = 0.5 mm`, `N_SEG = 32`, the footprint contains ~800 cells (~25 per segment) plus a ~100-cell spill ring.

## Carve & deposit (per ball position)

Each time the ball is placed at table-frame position `(cx, cy)`, run the following kernel. The wedge structure is what makes the trough behind a moving ball stay open: rear wedges generate no displaced volume because their cells are already at `z_under` from prior steps, so they deposit nothing.

For each segment `s` independently:

1. **Carve pass.** Walk `inner[s]` in any order. For each cell at offset `(di, dj)`:
   ```
   z_u = z_under(di, dj)
   if heightmap[cx + di, cy + dj] > z_u:
       displaced = heightmap[cx + di, cy + dj] - z_u
       V_seg += displaced * cell_mm^2
       heightmap[cx + di, cy + dj] = z_u
   ```
2. **Deposit pass.** Walk `inner[s]` in **distance-from-center ascending** order. For each cell at offset `(di, dj)`:
   ```
   z_u = z_under(di, dj)
   room_height = z_u - heightmap[cx + di, cy + dj]
   if room_height > 0 and V_seg > 0:
       fill_volume = min(room_height * cell_mm^2, V_seg)
       heightmap[cx + di, cy + dj] += fill_volume / cell_mm^2
       V_seg -= fill_volume
       if V_seg == 0: break
   ```
3. **Overflow.** If `V_seg > 0`, distribute it onto `spill[s]`:
   - Equal share per cell in `spill[s]`: `delta_h = V_seg / (cell_count * cell_mm^2)`.
   - Each cell's height is increased by `delta_h`.

Across all segments, this is volume-conserving: every cubic mm carved is either redeposited inside the footprint or pushed onto the spill ring.

## Repose relaxation

After carve & deposit, run a relaxation kernel over the cells touched this step (footprint cells + spill ring cells, dilated by 1 cell to catch neighbors).

- Single configurable angle of repose `theta_repose` (default 30°). The corresponding maximum height difference between two 4-connected neighbors is `tan(theta_repose) * cell_mm`. (For 8-connected diagonal neighbors, scale by `sqrt(2)`.)
- For each touched cell, compare its height to each neighbor. If the height difference exceeds the maximum allowed slope, transfer half the excess from the higher cell to the lower cell. (Half-excess transfer keeps the kernel stable — full transfer can oscillate.)
- Newly-modified cells are added to the active set; iteration is local to the active set, not the whole grid.
- Iterate until no further transfers occur in a pass, or up to `repose_max_iters` (default 16) to bound per-step cost.

This is conservative (volume-preserving) and confined to the neighborhood of the ball, satisfying the "kernel constantly computing near the ball" intent.

## Step-by-step simulation loop

For each gcode segment (a straight-line move from `(x0, y0)` to `(x1, y1)` in the table frame at feedrate `f`):

1. Compute segment length and duration: `duration = length_mm / f * 60` (seconds).
2. Compute the number of sub-steps so that each sub-step advances the ball by no more than `interp_fraction * cell_mm` (default `interp_fraction = 0.5`, configurable; setting it to `1.0` gives the coarse "step = grid size" mode).
3. For each sub-step:
   1. Advance the ball center along the segment.
   2. Run carve & deposit (segmented kernel above) at the new position.
   3. Run repose relaxation on the touched cells.
4. Emit a "frame" of the heightmap at a paced rate (see `architecture.md`) so the renderer can display it.

## Configurable parameters (v1)

User-facing config is in the **gcode frame**: `gcode_width_mm` and `gcode_height_mm` are the reachable extent the user types positions against. The simulation core sizes the heightmap to `gcode_W + 2 r` × `gcode_H + 2 r` internally so a given gcode file fits cleanly under any ball radius without warnings. The `W` / `H` referenced elsewhere in this document are the **physical / table-frame** dimensions, i.e. `gcode_W + 2 r` / `gcode_H + 2 r`.

| Parameter | Default | Notes |
| --- | --- | --- |
| `gcode_width_mm` | 300 | Reachable extent in the gcode frame |
| `gcode_height_mm` | 200 | Reachable extent in the gcode frame |
| `cell_mm` | 0.5 | Grid resolution |
| `h0_mm` | 1.0 | Initial sand depth |
| `ball_radius_mm` (`r_mm`) | 8.0 | Ball radius |
| `theta_repose_deg` | 30 | Angle of repose |
| `n_segments` | 32 | Wedge count for displacement; raise if wedge-boundary artifacts appear |
| `interp_fraction` | 0.5 | Sub-step size as fraction of `cell_mm` |
| `repose_max_iters` | 16 | Per-step cap on relaxation iterations |

## Open questions / future work

- **Per-source-cell flow paths.** The current model pools displaced volume per segment and walks outward. A more rigorous version would model each carved cell's volume as flowing radially outward to the nearest available cavity along its own ray. Substantially more work; almost certainly invisible at the resolutions we're targeting. Left as a future refinement only if needed.
- **Adaptive iteration cap for repose.** If 16 iterations is consistently insufficient at high feedrates, consider running repose less often but longer, or splitting it across frames.
- **Segment count tuning.** Started at `N = 8`; raised to `N = 32` after wedge-boundary spokes proved visible at coarser counts. Drop back if perf becomes a constraint and visuals can absorb it.
