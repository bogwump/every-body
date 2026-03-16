Pass 1.1 follow-up

What changed
- Separated action buttons from view-toggle pills more clearly.
- Kept white secondary buttons for actions that open, reveal, or move the user somewhere.
- Kept smaller pill toggles for switching views or comparison modes.
- Tightened active/focus colour handling so selected controls do not briefly flip to dark text on tap.
- Updated the hard-coded Insights CTA buttons to use the shared button system.
- Refined the active experiment action row so Extend 2 days feels like a proper action button and Stop reads as a quieter secondary action.
- Adjusted History hero filters to behave like small pills rather than chunky buttons.

Logic used
- Buttons = actions, navigation, opening sections, starting or stopping workflows.
- Pills = changing a view, filter, metric, or comparison mode within the current context.

Examples
- Open your experiments = button
- See suggestions = button
- Extend 2 days = button
- Stop = quieter action button
- Just before / Usual month = pills
- History hero filters = pills
