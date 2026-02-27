# Cyberdeck Skin Notes

## Intent
- Theme id: `cyberdeck`
- Style target: retro terminal + Shadowrun cyberdeck HUD.
- Scope: skin-only visual layer, no behavior or data flow changes.

## Tokens
Defined in `body.skin-cyberdeck` in `src/styles.scss`:
- Colors: `--cd-bg`, `--cd-bg-panel`, `--cd-line`, `--cd-text`, `--cd-primary`, `--cd-cyan`, `--cd-magenta`, `--cd-amber`, `--cd-danger`, `--cd-success`
- Spacing: `--cd-space-1` to `--cd-space-4`
- Radius: `--cd-radius-1` to `--cd-radius-3`
- Borders: `--cd-border-thin`, `--cd-border-strong`
- Glow: `--cd-glow-soft`, `--cd-glow-strong`
- Type scale: `--cd-font-xs` to `--cd-font-lg`

## Component Mapping
- Buttons: all Bootstrap button variants, including outlined and link/ghost behavior.
- Inputs: `.form-control`, `.form-select`, `.input-group-text`, textareas.
- Cards/Panels: `.card`, `.card-header`, `.modal-content`.
- Lists/Tables: `.list-group-item`, `.table`, striping and separators.
- Tabs: `.nav-tabs` and `.nav-link` states.
- Badges/Pills: `.badge`, `.text-bg-*`.
- Overlay: tooltips + modal shell.
- Trackers: `.progress`, `.progress-bar`, condition monitor cells.

## Extending
- Keep all new colors derived from the token set first; avoid one-off hex values.
- Prefer adding selectors under `body.skin-cyberdeck ...` so other skins remain isolated.
- Use restrained glow and thin borders before adding new effects.
- If a new component appears, style its base state + hover + focus-visible + disabled together.

## CLI Pass
- Added a second refinement pass to push terminal aesthetics further:
- Hard square corners (`--cd-radius-*` set to 0 in cyberdeck scope).
- Stronger row/column separators for `participant` rows and table cells.
- Grid overlay over the main content area for monitor-like structure.
- Denser monospace rendering with tabular numerics for fast scanning.
