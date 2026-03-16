# EveryBody UI polish pass summary

## Shared system changes
- Extended the shared semantic visual system in `src/index.css`.
- Added shared border, radius and shadow tokens.
- Unified default card, hero, inset, button, input and chip styling.
- Added shared classes for page headers, icon frames, collapsible secondary blocks, list cards and toggle styling.
- Added a theme-aware `--color-border` token for all themes.

## Page-level updates
- `Navigation.tsx`
  - Refined mobile and desktop navigation surfaces.
  - Unified icon framing and active-state treatment.
- `Dashboard.tsx`
  - Added shared page header styling.
  - Upgraded hero card to shared hero sizing.
  - Switched key card icons to the shared icon frame pattern.
  - Softened secondary cards to reduce the flat stacked look.
- `CalendarView.tsx`
  - Converted the top calendar summary into a hero-style header card.
  - Wrapped month controls in a shared soft card surface.
- `History.tsx`
  - Moved page onto the shared page shell.
  - Converted history hero into the shared hero system.
  - Added collapsible secondary detail blocks for evidence/signals/confidence.
  - Unified event icon treatment and softened the event cards.
- `ProfileSettings.tsx`
  - Moved page containers onto the shared page shell.
  - Converted the profile summary into the shared hero system.
  - Unified settings list panels into shared list-card styling.
  - Unified toggle styling using shared toggle classes.

## Notes
- Eve/Chat and Learn/Resources were not part of this pass.
- No core product features were removed.
- The filled cycle-start flag on the calendar was intentionally left alone.
- `npm install` was used only to validate the build locally. `node_modules` is not included in the output zip.
