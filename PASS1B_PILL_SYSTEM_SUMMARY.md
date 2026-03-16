# Pass 1B Pill System Summary

## What changed
- Standardised **selector pills** across the app using the shared `eb-chip-filter` / `eb-chip-filter-active` family.
- Standardised **choice pills** like yes/no/not sure and sleep-detail options using the shared `eb-choice-pill` family.
- Standardised **metadata pills** using the shared `eb-pill` / `eb-chip-meta` family so passive tags no longer compete with buttons.
- Updated the custom `chipClass()` helper in Insights to return shared pill classes instead of ad hoc black/white chip styling.
- Updated the **Start X-day experiment** CTA to the shared action button system.
- Removed the white-only active override from History hero filters so selected pills now follow the theme-led app-wide active treatment.

## Files updated
- `src/index.css`
- `src/components/Insights.tsx`
- `src/components/DailyCheckIn.tsx`
- `src/components/History.tsx`

## Notes
- Selected interactive pills now use the user theme colour family instead of black.
- Pills are now shorter, flatter, and more compact than buttons.
- Metadata pills remain passive and quieter than selector pills.
- No hero/page-top changes were made in this pass.
