# EveryBody UI Pass 1 Summary

This pass focuses only on the shared component system.

## What changed

- Added a shared `eb-choice-pill` system for yes/no/not sure and similar option groups
- Added `eb-chip-meta` and `eb-chip-filter` so passive chips and interactive chips are no longer styled the same way
- Added `eb-inset-soft` and `eb-inset-callout` to separate neutral inner panels from tonal callouts
- Strengthened `eb-disclosure` / `eb-collapsible` so disclosure rows use a more consistent shell, spacing, and chevron behaviour
- Added `eb-btn-tertiary` for low-emphasis utility actions like Customise
- Updated visible usage on Insights, Check-in, History, Profile, and part of Rhythm to use the new system

## Files changed

- `src/index.css`
- `src/components/Insights.tsx`
- `src/components/DailyCheckIn.tsx`
- `src/components/History.tsx`
- `src/components/ProfileSettings.tsx`
- `src/components/Rhythm.tsx`

## Validation focus for this pass

Check these pages first:

- Insights
- Daily check-in
- History
- Profile

## What to verify

- Yes / No / Not sure now feels like one choice control, not three unrelated button styles
- Passive chips and filter chips no longer look interchangeable
- Disclosure rows feel more related across pages
- Inner panels feel more system-led and less random
- The new tertiary action style works for lower-emphasis utility actions like Customise

## Not included in this pass

- Hero layout consistency
- Page-top structure consistency
- Full section-card unification
- Page-specific cleanup beyond the component-system changes above
