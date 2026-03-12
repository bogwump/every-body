# EveryBody companion logic audit

## Already properly implemented

### Companion moments
- Priority ordering exists in `src/lib/companionMoments.ts`.
- Moments already had expiry handling.
- Duplicate prevention already existed by id and same-day type/data signature.
- Home was already generating moments from real app state via `src/lib/generateMoments.ts`.

### Helpful memory reuse
- Helpful experiment learning already existed in `src/lib/experimentLearning.ts`.
- This learning was already reused in:
  - Insights: **What’s been helping lately**
  - Rhythm: support nudges in `src/lib/rhythmCopy.ts`
  - Experiment suggestions: via `getExperimentHistoryContext`
  - Companion moments: **Something that helps**
  - Timeline / export helpers

### Connections in your body
- This section was already backed by actual relationship detection, not just placeholder text.
- It already used:
  - overlapping-day co-movement detection
  - Pearson correlation
  - variance checks
  - quality scoring
  - strongest-few selection
  - stricter gating for hormonal / body-heavy relationships

### Pattern confidence evolution
- The insight engine already distinguished signal confidence and strength (`low` / `medium` / `high`, `weak` / `moderate` / `strong`).
- Stable hero rotation and discovered-pattern tracking were already implemented.

## Partially implemented and tightened in this pass

### Companion moment behaviour
Before this pass:
- suppression was mostly limited to “one active moment of this type now”
- dismissal did not create a strong short-term suppression window
- experiment suggestions were not properly suppressed while an experiment was active or just completed

Now tightened:
- recent dismissed / recent same-type moment suppression added
- experiment suggestion suppression added during active experiments
- experiment suggestion suppression added for a short window after recent experiment completion
- calmer cooldowns added for repeated companion surfaces

### Forward-looking prediction logic
Before this pass:
- Insights hero forecast was mostly phase + strongest metric wording
- recent experiment learnings and lag-triggered “what may be next” logic existed elsewhere but were not powering the Insights hero

Now tightened:
- Insights hero forecast now uses:
  - current phase
  - strongest recent signals
  - experiment learnings
  - recent logs
  - lag-triggered “what may be coming” predictions when available
  - helpful memory fallback when relevant

### Connections in your body
Before this pass:
- co-movement detection existed, but visible companion detail did not reflect maturity or lag behaviour

Now tightened:
- expandable explanation now includes pattern maturity
- lightweight lag detection added for stronger recent lead/follow relationships
- strongest connections remain selected conservatively

### First-30-days behaviour
Before this pass:
- staged behaviour existed, but only in scattered thresholds across Home / Insights / Rhythm

Now tightened:
- a central staged companion model was added for:
  - very new
  - building
  - settling
  - established
- this now supports calmer progression in forecast and reflection logic

### Weekly story / progress reflection
Before this pass:
- only very early milestones existed (3 logs, 7 logs)

Now tightened:
- weekly / baseline-style reflection moments added for 7 / 14 / 21 / 30 day milestones
- these are designed to feel calm and non-noisy rather than celebratory spam

## Missing or mostly placeholder before this pass

These were the main gaps under the current UI before implementation:
- proper cooldown / dismissal suppression for companion moments
- experiment suggestion suppression during active / just-finished experiments
- Insights body weather powered by real predictive logic rather than mostly static copy
- weekly reflection / progress-story layer
- lag-aware explanation beneath Connections in your body

## What was implemented in code

### New file
- `src/lib/companionLogic.ts`
  - stage detection
  - experiment suggestion suppression
  - moment cooldown and dismissal suppression helpers
  - body weather generation
  - weekly reflection moment generation

### Updated files
- `src/lib/generateMoments.ts`
  - added calmer suppression logic
  - suppressed experiment suggestions during active / recently completed experiments
  - added weekly reflection moments
- `src/lib/experimentSuggestions.ts`
  - added suppression so suggestions do not generate during active / just-finished experiment windows
- `src/components/Insights.tsx`
  - wired hero forecast to real body-weather logic
  - added maturity / lag detail under Connections explanations

## Visible UI sections now more honestly backed by real logic

### Insights
- **Over the next few days you might notice**
  - now backed by phase, recent logs, experiment learnings, and stronger signals
- **Connections in your body**
  - now backed by co-movement scoring plus maturity / lag explanation in the detail layer
- **What’s been helping lately**
  - continues to be backed by actual experiment learning

### Rhythm
- Rhythm support nudges were already backed by real logic and helpful memory.
- This pass did not redesign the Rhythm UI, but the underlying companion model it sits on is now calmer and better suppressed.
