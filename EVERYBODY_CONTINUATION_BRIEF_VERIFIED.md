# EveryBody app continuation brief, verified against current build

Use the latest working zip from this session as the starting point.

This build was inspected directly and a production build completed successfully on **18 March 2026** using `npm run build`.

## Verified current stack

- Vite
- React 18
- TypeScript
- Tailwind v4 via `@import "tailwindcss"`
- localStorage persistence
- Radix UI components
- Recharts
- Embla Carousel

## Verified current handoff status

- The current uploaded zip **builds successfully**.
- `node_modules` are **not** bundled in the uploaded zip.
- Metric polarity logic is already centralised in:
  - `src/lib/metricSemantics.ts`
- Insights is already using polarity helpers via:
  - `getMetricPolarity`
  - `describeHighValue`
- The file to inspect for Profile work is **`src/components/ProfileSettings.tsx`**, not `Profile.tsx`.

## Core product direction

This is not just a symptom tracker.

The product direction is:

- helping users understand their patterns
- explaining hormonal and body changes in a normalising, supportive way
- acting more like a body translator or pattern explainer than a dashboard
- giving a homepage snapshot first, then a deeper page if the user wants more detail

Avoid language that implies something is wrong with the user.

Prefer:

- patterns
- rhythm
- what your body is showing
- what’s becoming clearer

Avoid overusing:

- symptoms
- high symptom
- anything that frames positive states as bad

## Non-negotiable UI principles

### 1. Mobile first

Always optimise for mobile first.

Previous issues repeatedly came from things that looked okay on desktop but broke on mobile:

- content reserving icon gutters
- cards blowing past the viewport
- carousels causing width blowout
- pills wrapping badly
- buttons causing full-page overflow
- controls drifting outside wrappers

Check mobile layout every time.

### 2. One visual system

Do not invent new styling card by card.

Reuse shared semantic classes and approved patterns.

The app should feel like one product, not a set of pages built at different times.

### 3. Exact reuse, not approximation

If the user says:

- use the homepage hero
- use the Profile pills
- use the Insights static pills
- use the shared card-header pattern

then inspect and reuse the exact structure and classes, not something similar.

A lot of time was lost previously because styling was based on something rather than actually copied.

## Approved design language

The app should feel:

- warm
- calm
- premium
- softly feminine but not childish
- theme-led
- modern
- supportive

Avoid:

- flat HTML-box look
- corporate dashboard feel
- puffy childish pills
- stark white on white on white
- muddy grey utility surfaces

## Hero system rules

The app had major hero inconsistencies earlier. Those have been debugged the hard way.

### Source of truth

The hero visual system is now shared and should stay unified.

Important past bug:

- `eb-hero-surface` was overriding the richer hero styling
- if hero styling seems not to apply, check for an old overriding class before tweaking visuals

### Hero content structure

Hero cards should use:

- shared outer header, title and support-copy treatment
- shared inset card treatment
- consistent typography and spacing
- top-right icon behaviour
- no random title-size drift

### Homepage hero copy

Homepage hero was changed away from “Symptom tracking”.

Approved copy direction:

- **Understand your patterns**
- **The app that explains your hormonal patterns.**

Do not revert that.

### Hero inset surfaces

Inset cards inside heroes were too stark white before.

Approved direction:

- soften them
- use pale theme-led surfaces
- not harsh white slabs

## Buttons, pills, tags

These are separate systems and must stay separate.

### Action buttons

Used for real actions:

- open
- save
- start
- continue
- stop
- navigate

### Selector pills

Used for switching local state or view:

- 7 / 30 / 90 days
- Yes / No / Not sure groups where they are true toggles
- metric selectors
- filter chips

### Static tags

Informational only:

- selected metrics
- passive labels
- metadata chips

Do not blur these together.

Past bug:

- buttons inherited pill wrappers
- static tags looked tappable
- selector pills behaved like buttons

Check wrapper family first before changing visuals.

## Card structure and icon behaviour

### Shared card-header pattern

Use the shared `card-header` structure.

Do not build cards with:

- odd absolute-positioned icons
- floating gutters
- content squeezed because of icon placement

### Icons

Approved direction:

- top right
- supporting, not structural
- no big dead gutters
- no tinted icon boxes unless explicitly needed

## Page-top pattern

Each page should open with:

- page title
- one support line
- then hero or first major card

No random kicker labels above titles.
No multiple page-top systems.

## Calendar lessons

Calendar is fragile.

Known issues:

- extra wrappers made day cells too small
- mobile spacing is easy to break
- icon fit inside cells must be preserved

Touch carefully.

## Mobile structural lessons

The biggest recurring mobile bug category was width blowout.

Root causes found during this session:

- mobile carousels preserving desktop width assumptions
- arrows living outside card bounds
- buttons in flex rows not shrinking properly
- missing `min-w-0`
- components using carousel behaviour when they should switch to stacked mobile layout

### Critical fix pattern

For sections that blow out on mobile:

- use stacked layout on mobile
- only use carousels from `sm` upwards if needed
- add `min-w-0` and `overflow-hidden` to key flex and card wrappers
- hide side arrows on mobile if they destabilise layout

This was especially important in Insights suggested experiments.

## Homepage rules

Homepage should feel like a daily briefing, not a feature directory.

Best homepage flow:

- hero
- companion or new pattern spotted
- action state such as today logged or check-in state
- next-step snapshot
- week at a glance
- tip or gentle support

### Homepage card decisions already made

#### “Want to see what’s saved?”

This is an onboarding-style guide card that only hangs around temporarily.
It changes content by state.

It should use the proper button style, not a legacy text link.

Approved state:

- Open History should be a normal proper button
- darker button treatment
- not a text-link CTA

#### “Most useful next step”

This card was repeatedly reworked.

It should:

- give a useful homepage snapshot first
- then provide one deeper-dive action
- not just signpost to another page

It previously had duplicate status tiles. Those were removed in favour of a clearer card structure.

The logic behind it was expanded, but be careful because this area has had several code regressions before.

## Polarity-aware metric logic

This was a major logic correction in this session.

### Problem found

The app was treating all high values as if they were bad.

That is wrong for metrics like:

- mood
- energy
- focus
- libido
- sleep quality

A high symptom days framing made no sense for good mood, good energy, and similar states.

### Approved fix

The app needs shared metric semantics and polarity awareness.

Examples:

#### Positive when high

- mood
- energy
- focus
- libido
- sleep quality
- motivation

#### Burden-style when high

- pain
- bloating
- stress
- fatigue
- cramps
- night sweats
- tenderness
- brain fog
- joint pain
- hair shedding
- facial spots
- cysts
- bleeding

The logic should be centralised, not re-guessed in each component.

### Verified implementation note

This centralisation currently lives in:

- `src/lib/metricSemantics.ts`

## Display translation for mood

Mood is selected as:

- Low
- Okay
- Good

Internally it may map to numbers for analysis, but user-facing copy should never leak those numeric mappings.

Do not show:

- mood 9/10
- best mood 9/10

if the input was the three-state mood selector.

Always translate surfaced mood back into:

- Low
- Okay
- Good

This should be true across the app.

## Insights page: what was learned

Insights required the deepest debugging this session.

### Mobile blowout root cause

This was not just one broken button.
The real problem was desktop-style carousel behaviour surviving on mobile.

This especially affected:

- suggested experiments
- your data view
- side arrows
- expanding experiment areas

### Fix pattern

For problematic sections:

- mobile = stacked list
- tablet and desktop = carousel
- hide arrows on mobile or when not usable
- keep arrows inside bounds if used
- add `min-w-0` and `overflow-hidden`

This was the structural fix that finally stopped the page becoming a full-screen web layout.

### Your data view

Problems found:

- arrows hanging around when not useful
- dead space in cards
- cards not wrapping text well

Approved direction:

- no dead arrows
- no giant empty blocks
- text should wrap naturally
- mobile should stay contained inside app frame

### Chart cards

Final preferred layout:

- title and body copy span full card width at top
- chart below
- selector beneath the chart

This layout should also be used by similar chart cards like Sleep and Week pattern.

Do not move the selector back up beside the title.

### “Why am I seeing this?”

These disclosure headers had drifted into a tinted half-style.

Approved direction:

- proper all-white disclosure header surface
- not partially tinted

### Suggested experiments

This section was a major source of mobile instability.

Approved direction:

- mobile-safe stacked rendering
- buttons full width on mobile
- no width blowout when tapping See suggestions

## Experiment cards

### Check-in page experiment card

Inside the experiment in progress card on the check-in page:

- What you are trying should be white

### Insights experiment card

Inside the experiment card on Insights:

- What you are trying should use the user’s soft theme inset colour
- Extend 2 days should be the darker primary button
- Stop remains secondary

### Experiment suggestions

Open and see suggestions must not cause width blowout on mobile.

This required structural fixes, not just cosmetic ones.

## Check-in page details

### “Is this the start of a new period?” modal

This looked like a legacy card earlier.

Approved direction:

- align it with the rest of the app’s popout or modal style
- rounder container
- left-aligned text
- softer inset note block
- proper stacked actions

### Other influences twistee

This had temperamental collapse behaviour before.

It was improved, but this area should be treated carefully because nested toggles and page position affected reliability.

## History page

### Month collapse behaviour

History needed month-level twistees so users are not forced to scroll forever.

Approved behaviour:

- small understated month twistee
- collapse hides that month’s cards
- expand reveals them again
- state remembered

### “All” filter behaviour

Important decision:

- tapping All is a true global reset
- it reopens all collapsed months
- and that becomes the new state
- it should not secretly restore previously collapsed months later

Do not make All temporarily become Undo.

## Profile page

Profile order was changed to:

- What you track
- Cycle tracking
- Analyse your data
- the rest of profile and settings

### Cycle tracking

Should be minimisable via a twistee or disclosure style, not an awkward Show button.

### Analyse your data

Section heading belongs inside its wrapper, not floating above it.

### Verified file note

Profile work should be inspected in:

- `src/components/ProfileSettings.tsx`

## Button treatment decisions

There were multiple button style refinements in this session.

General rule:

- proper buttons should look intentional and clickable
- legacy text-link CTAs were replaced in several places
- some soft buttons were too muted and had to be made stronger
- hero pills needed to look more interactive without becoming giant puffy buttons

For the small action pills inside the Insights hero:

- keep them on one row
- make them feel interactive
- slightly sharper shape and a subtle shadow was the preferred improvement

## Build and debug lessons from this session

This session had several logic and runtime regressions from missing imports and hooks.

Common errors encountered:

- variable referenced without binding from hook
- helper function added but not imported
- helper imported but other helper missed
- runtime reference errors in Dashboard and Insights

Examples from this session:

- `experimentHistory is not defined`
- `getMetricPolarity is not defined`
- `describeHighValue is not defined`

### Agent rule

Whenever adding new logic:

- add helper function to the lib file
- import it wherever used
- bind store values from hooks explicitly
- do a syntax and build pass before handing over

Do not say build passed unless it actually passed.

### Verified current status

For this uploaded zip, production build **did pass** during inspection.

## Technical stack reminders

- Vite
- React
- TypeScript
- Tailwind v4
- localStorage persistence

User edits on Windows with Notepad, so:

- instructions must be explicit
- avoid vague just update this bit phrasing
- if sharing code snippets, keep them complete and copy-paste safe

## Current preferred UX and product direction

The app should surface:

- one useful conclusion
- one supporting clue
- one action

This is especially true on homepage.

The homepage should always feel like:

- a meaningful snapshot
- not just a signpost

Deeper pages can hold the full evidence.

## What to be careful not to regress

Do not reintroduce:

- hero typography inconsistency
- old `eb-hero-surface` override problems
- legacy text-link CTAs where proper buttons were agreed
- mobile carousel blowout
- arrows floating outside cards
- selector pills wrapping badly
- chart selector moving back beside titles
- mood numeric leakage
- treating positive metrics as high symptoms
- profile logo floating awkwardly in hero
- duplicated page-top systems
- icon gutters squeezing content on mobile

## Best working mental model for this codebase

When something looks almost right but not quite:

- check structure first
- then wrapper family
- then shared class usage
- then CSS overrides

Do not assume it is just a colour tweak.

A lot of the hard bugs in this session were structural, not cosmetic.

## If picking up work next, inspect these first

Verified key files:

- `src/components/Insights.tsx`
- `src/components/Dashboard.tsx`
- `src/components/ProfileSettings.tsx`
- `src/components/History.tsx`
- `src/index.css`
- `src/lib/metricSemantics.ts`

Also useful shared logic areas:

- `src/lib/companionLogic.ts`
- `src/lib/patternIntelligence.ts`
- `src/lib/experimentSuggestions.ts`
- `src/lib/experimentAnalysis.ts`

Especially on Insights, assume that mobile-safe layout decisions were made deliberately.
Do not casually clean them up into a shared carousel pattern unless you have checked mobile behaviour.
