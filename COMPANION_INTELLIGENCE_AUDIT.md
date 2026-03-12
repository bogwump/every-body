# Companion Intelligence Audit

## Already properly implemented

- Companion moments already had priority ordering, dismissal-aware suppression, cooldown windows, and active experiment suppression.
- Helpful memory from experiment history already existed and was being reused in experiment suggestions and support nudges.
- Insights hero already used real insight signals rather than static placeholder copy.
- Connections in your body already used real co-movement logic, confidence thresholds, and strongest-pair selection.
- Data-stage behaviour already existed in a lightweight form through very-new / building / settling / established thresholds.

## Partially implemented and tightened in this pass

- Hormonal context explanations existed only indirectly. They are now explicitly mapped and surfaced when confidence is at least moderate.
- Forward-looking prediction logic existed, but was relatively light. It now combines phase context, recent signals, experiment learnings, lag patterns, and cross-cycle memory.
- Connections already had hidden lag checks, but they were only lightly used. They now drive visible cause-effect titles and explanation text when stronger than same-day co-movement.
- Weekly reflection logic existed as milestone copy only. It now references actual pattern activity and repeat-pattern memory.
- History resurfacing existed loosely through discovered patterns. It now also supports repeat-pattern resurfacing from cross-cycle memory.

## Missing or placeholder before this pass and now implemented

- Explicit hormonal context explanation layer.
- Cross-cycle pattern memory records with repeat count, first seen cycle, last seen cycle, confidence, and phase context.
- Repeat-pattern wording such as "This appeared last cycle too" and "This pattern has shown up across several cycles."
- Rhythm hero prediction window powered by stronger logic instead of a generic support nudge.
- Cause-effect timeline detection for lag +1 and lag +2 relationships in Connections.
- Hero alignment with connections logic through lag-based observation reuse.

## Visible UI areas now backed by real logic

- **Insights hero**: observation lines can now include hormonal context and cross-cycle repeat memory.
- **Insights forecast / body weather**: now uses phase, recent signals, experiment learnings, lag patterns, and repeat-pattern memory.
- **Connections in your body**: can now surface stronger lead-lag relationships and optional chain-style reads, while keeping technical detail in the explanation layer.
- **Rhythm hero prediction window**: now behaves like a short prediction window rather than a generic reminder bubble.
- **Weekly reflections / companion resurfacing**: now reference actual repeat-pattern memory instead of milestone copy alone.
