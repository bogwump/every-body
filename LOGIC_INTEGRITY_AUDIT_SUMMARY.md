# Logic integrity pass summary

## Checked
- Dashboard, Insights, Daily Check-in, Rhythm, History, Profile/Settings, Calendar, Companion entry points
- Shared metric semantics and cycle trust helpers
- Shared store shapes in appStore and cross-page localStorage keys
- Cross-file imports and stale helper references tied to recent logic work

## Fixed
- Centralised mood translation and 1-3 to 10-point conversion in `src/lib/metricSemantics.ts`
- Aligned Dashboard, Insights, analytics, pattern state, and Calendar to the same mood helper
- Fixed Dashboard cycle trust check using the real `predictionTrust` enum instead of retired `steady`
- Fixed Profile Settings insights export calling `formatMetricDisplayValue` without importing it
- Removed stale `setExperimentStartedFlash` calls left behind in Insights experiment replacement flow
- Added missing `acidReflux` metadata and `restlessLegs` Daily Check-in slider metadata so enabled modules do not drift from definitions
- Expanded Dashboard metric labels to derive from shared symptom metadata so enabled modules are not silently dropped from label-driven paths

## Verified
- `npm run build` passes successfully after the changes

## Remaining runtime confirmation
- Manual click-through of long-tail flows is still worth doing for experiment replacement, export generation, and niche enabled-module combinations
