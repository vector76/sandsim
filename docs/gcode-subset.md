# GCode Subset

This document defines the gcode dialect that `sandsim` v1 understands. The parser is intentionally minimal: a sand table is a 2D motion device with no spindle, no tool changes, and no Z lifts, so most real gcode complexity is irrelevant.

## Coordinate frames

Two distinct 2D coordinate frames are used, and they must not be confused:

- **Gcode frame.** What the user writes and what the parser produces. Origin `(0, 0)` is the lower-left of the *reachable* region — i.e., the closest the ball center can get to the lower-left corner of the table. Reachable extent is `[0, W - 2r] × [0, H - 2r]`, where `W` and `H` are the physical table dimensions and `r` is the ball radius. Units: mm.
- **Table (physics) frame.** What the simulation core uses internally. Origin `(0, 0)` is the lower-left corner of the physical table. The heightmap is indexed in this frame.

The translation is `table = gcode + (r, r)`. It happens once, at the boundary between parser output and the simulation core. Every coordinate inside this document is in the **gcode frame** unless explicitly stated otherwise.

User-visible messages (warnings, error reports) always use the gcode frame, since that matches what the user wrote.

## Supported commands

| Code | Behavior |
| --- | --- |
| `G0 X.. Y.. [F..]` | Move to `(X, Y)`. Carves the sand. Identical to `G1` in this app — there are no rapids on a sand table, since the ball cannot lift. |
| `G1 X.. Y.. [F..]` | Move to `(X, Y)`. Carves the sand. |
| `G28` | Home: move first to `(0, current_y)`, then to `(0, 0)`. Two synthetic carving moves at the current modal feedrate. |
| `$H` | Same as `G28`. (grbl-style mnemonic.) |

Homing is treated as ordinary motion that carves the sand: the ball is being dragged across the table to reach the origin. When concatenating files (the "append" load mode), a homing command in a later file will draw an L-shaped streak from wherever the ball ended up to the origin.

That is the entirety of v1. `G2`, `G3`, polar coordinates, and arcs are deferred.

## Modal state

The parser maintains the following modal state across lines:

- **Current position** `(x, y)` in the gcode frame. Initialized to `(0, 0)` (which corresponds to `(r, r)` in the table frame).
- **Feedrate** `F` in mm/min. Sticky: an `F` word on any line updates the current feedrate and persists. Initial value: configurable default (e.g., 1000 mm/min).
- **Units:** mm only. There is no `G20` / `G21` handling; if a file declares units, those lines are ignored with a warning.
- **Distance mode:** absolute only. There is no `G90` / `G91` handling; relative-mode declarations are warned and ignored (input is assumed absolute).

Lines may specify `X` only, `Y` only, `F` only, or any combination. Missing axes inherit from the modal state.

## Ignored without warning

- **Comments:** `;` to end of line, and parenthesized `( ... )` segments. Stripped before tokenization.
- **Blank lines** and lines containing only whitespace.
- **Line numbers:** `N123` prefixes. Stripped.
- **Z words** on `G0` / `G1` lines: `X10 Y20 Z5` is treated as `X10 Y20`. Z is dropped silently because Z lifts are common in generated files but meaningless here.

## Ignored with warning

Any line that:

- starts with a recognized letter but an unsupported code (e.g., `G2`, `G17`, `G20`, `G21`, `G90`, `G91`, `M3`, `M5`, `T1`),
- or fails to parse,
- or contains an axis word other than `X`, `Y`, `Z`, `F` (e.g., `A`, `I`, `J`, `R`),
- or commands a position outside the reachable region (see "Wall clamping" below).

Each warning includes the source line number and the original line text. Warnings accumulate in a list visible to the user (UI panel — see `architecture.md`); they do not halt simulation.

## Wall clamping

Before executing a move, the parser/interpreter clamps the target position (in the gcode frame) to the reachable region:

```
x_legal = clamp(x, 0, W - 2r)
y_legal = clamp(y, 0, H - 2r)
```

If the original `(x, y)` differed from `(x_legal, y_legal)` by more than a small epsilon, a warning is emitted: `"line N: position (X, Y) clamped to (X_legal, Y_legal)"` (gcode-frame coordinates). The simulation continues from the clamped position.

The internal modal "current position" is the *clamped* position, not the user-requested one. Subsequent moves resume from where the ball actually is, not where the gcode thought it was.

## Tokenization

The parser is line-oriented. For each line:

1. Strip `;`-comments and `( ... )` comments.
2. Strip a leading `N\d+` line number if present.
3. Trim whitespace; skip empty lines.
4. Detect `$H` as a special token (case-insensitive) and treat it identically to `G28`.
5. Tokenize into `LETTER NUMBER` pairs (e.g., `G1`, `X10.5`, `F1200`). Whitespace between letter and number is permitted; case is normalized to uppercase.
6. Validate against the rules above and produce either one or more `Move` events or a `Warning` event.

Note that a homing command expands to **two** move events emitted by the parser, not one. Downstream consumers see them as ordinary moves.

## Sample fixtures

The `tests/fixtures/` directory will contain hand-crafted and generator-produced files for testing. v1 fixtures:

- `square.gcode` — a square trace centered on the table, useful for verifying corners produce the spherical impression.
- `spiral.gcode` — an Archimedean spiral, generated programmatically. Exercises smoothly varying direction and continuous overlap with prior passes.
- `rose.gcode` — a rose curve (`r = a * cos(k * theta)`), generated programmatically. Exercises self-intersection and revisiting prior passes.
- `wall_clamp.gcode` — intentionally commands positions outside the reachable region to verify clamping and warnings.
- `homing.gcode` — exercises `G28` and `$H`, including a `G28` after a non-origin position to verify the L-shaped streak.
- `unsupported.gcode` — contains `G2`, `M3`, comments, line numbers, etc., to exercise the warning path.

Generators for `spiral.gcode` and `rose.gcode` will live in the core crate as small functions exposed for testing (and possibly later as a CLI utility).

## Output of the parser

The parser produces a `Vec<MoveEvent>` and a `Vec<Warning>`. A `MoveEvent` is:

```rust
struct MoveEvent {
    line: u32,           // 1-based source line number
    x_mm: f32,           // absolute target X in the gcode frame (post-clamp)
    y_mm: f32,           // absolute target Y in the gcode frame (post-clamp)
    feedrate_mm_per_min: f32,
}
```

The simulation consumes `MoveEvent`s in order. Translation to the table frame happens at the boundary between the parser and the simulation core: `table_x = x_mm + r`, `table_y = y_mm + r`.

The first move's *starting* position is the modal initial position `(0, 0)` in the gcode frame; subsequent moves start from the previous move's endpoint.
