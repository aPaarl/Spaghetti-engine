# Roadmap to v1.0

Draft, 27 September 2026. Analytical functionality is largely complete as of v0.4.0 (ten tabs covering
structure, equilibrium, scenarios, sensitivity, Monte Carlo, transition points and pathways). From here,
releases focus on ease of use, intuitive modelling, and ease of analysis, plus one larger feature:
pathways toward an envisioned future. Version numbers and scope are a starting sequence, not a promise;
reorder or merge as priorities shift.

## v0.5.0 — Guided first use

Goal: a new user trusts the tool and knows what to do in the first minute, without reading the manual.

- A short guided walkthrough (a few pointed steps, dismissible) replacing or augmenting the static
  "Where to start" panel on the About page.
- A named model library in the browser: save-as, rename, duplicate, delete, and switch between several
  models, instead of one autosave slot behind the "New / example model" dropdown. Reduces reliance on
  Export/Import JSON as the only way to keep more than one model.
- Replace the seven remaining native `alert()` calls with in-app notifications, consistent with the rest
  of the interface.
- Contrast pass: the widespread slate-400 body text on light backgrounds, flagged in the last
  troubleshooting round, moves to slate-500/600.

## v0.6.0 — Modelling made easier

Goal: building and editing a map on the Network tab feels natural, for a first-time participant as much
as for an analyst.

- Basic/advanced mode on the Network tab: advanced relationship and concept settings are hidden by
  default. (Already on the interface brief from 0.4.0.)
- Plain-language tooltips throughout the Network tab and Inspector. (Also carried over from 0.4.0.)
- Search and filter concepts, for models too large to scan by eye.
- Undo/redo across model edits, not only within a single field.
- Keyboard support: shortcuts for the common actions (add concept, connect, delete, undo/redo), and
  arrow-key navigation on the tab-group pills, fixing the gap noted in the last troubleshooting round.
- Inline validation messages at the point of edit, instead of only in the Model check panel.

## v0.7.0 — Clearer analysis

Goal: reading and comparing results takes less interpretation work.

- Analysis results persist per model (currently lost on tab switch or reload, a known limitation since
  0.4.0), so re-running after every navigation is no longer needed.
- Side-by-side or overlay comparison across scenarios and across Monte Carlo runs.
- A consistent "what this shows" guidance block across every analysis tab, replacing the current
  tab-by-tab variation in how much is explained.
- Figure panel improvements: saved presets, one-click copy to clipboard, consistent styling across the
  four tabs that use it.

## v0.8.0 — Performance and robustness

Goal: the tool stays responsive as models and analyses grow, and nothing freezes the interface.

- Code-splitting so the Monte Carlo, Transition Point, and Pathways tabs load on demand, cutting the
  current 3.7 MB single bundle and speeding up first paint.
- Move Monte Carlo and Pathway analysis into a Web Worker, so a long run no longer blocks the UI.
  (Already on the 0.4.0 dev log's next-steps list.)
- Progress indicators for long-running analyses (Monte Carlo, exhaustive pathway search).
- Safer import: a preview of what an imported JSON file will change before it replaces the current model.

## v0.9.0 — Pathways toward an envisioned future

Goal: support backcasting, not only forecasting from the current map.

- A workflow to capture the current-state map as a baseline, then let stakeholders edit a working copy
  toward a preferred future: add or remove concepts, change relationships, set target levels for key
  outcomes.
- A diff view between the current and envisioned maps: which concepts and relationships were added,
  removed, or reweighted.
- Extend the existing pathway engine to search for lever combinations and orderings that move the
  current-state equilibrium toward the envisioned map's targets, reusing the pathway and total-outcome-gain
  machinery already in the tool rather than building a parallel one.
- Manual and methodological-annex sections for the new workflow: how envisioned-future targets map onto
  the existing beam-search and pathway-classification methods.

This is the largest single item on the roadmap and the design of "search toward an envisioned map" (as
opposed to the current fixed target levels) needs its own worked-out method before implementation starts;
treat the version above as a placeholder for a feature that may take more than one release.

## v1.0.0 — Stable release

Goal: nothing left labelled prototype or "not yet implemented".

- Native PDF, DOCX, and PPTX export of a full analysis, the longest-standing item on the roadmap.
- A full accessibility pass: contrast, keyboard navigation, and screen-reader labels across every tab.
- A layout and interaction audit at phone and tablet width for every tab, matching the pass already done
  on the About page.
- The manual, annex, and dev log reviewed end to end as one consistent set, with a changelog.
- A short "how to cite this tool" note, tied to a Zenodo DOI if the release is archived there.

---

Open questions before the plan firms up further: whether "pathways toward an envisioned future" should
ship as its own major version rather than 0.9, and whether the model library (v0.5.0) should use
IndexedDB from the start, since a growing library of full models may outgrow `localStorage`.
