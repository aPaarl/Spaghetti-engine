# Documentation text for version 0.5.8

This file holds the text that version 0.5.8 adds to the three documents. The User Manual and the Methodological Annex each receive a chapter "Update for Version 0.5.8", placed after the chapter "Update for Version 0.5.7" (docs/update-0.5.7.md) and in the same style. The Development Log for 0.5.8 replaces the 0.5.7 log. Version 0.5.8 covers the changes pushed to main after the 0.5.7 documents (16 and 17 November 2026) and pull requests #19 and #20 (27 November 2026). It brings together the drafts in docs/backcasting-and-empirical-data.md and docs/staged-interventions-and-saved-results.md. The numbers of the worked example are produced by `tests/test_worked_examples.mjs`, which fails if a later change to the engine moves them.

---

## User Manual: Update for Version 0.5.8

This chapter describes the changes in version 0.5.8. Like the chapters on versions 0.5.4 to 0.5.7, it takes precedence over the later sections where they differ. Three features are new to the analysis: backcasting from a vision, the use of empirical data, and timing of the measures in a scenario. In addition, results are kept after a reload, and the interface is available in Dutch.

### U.25 Backcasting from a vision

The side menu now has seven groups. Step 4 is renamed *Forward casting* (Transition Point Analysis and Transition Pathways): it starts from today and looks forward. Step 5 is new, *Backcasting*, with the tab *Vision and backcasting*: it starts from the future that participants want and works back to the steps that lead there. *Sensitivity analyses* becomes step 6.

The tab has three parts.

| Part | What you do there |
|---|---|
| 1. The envisioned system | Today's system is the open model. Choose the model that describes the vision, or click *Create an envisioned version of this map*, which saves a copy named "(vision)". Open the vision, change it into the system you want and come back. The tab counts the concepts in both maps, the concepts new in the vision, the concepts gone in the vision and the relationships changed. |
| 2. What counts, and which steps are allowed | Tick the outcomes that define how close the system is to the vision; each shows its settled value today and in the vision. Tick the measures the search may use. *Allow structural steps* lets the search also introduce new concepts, phase concepts out and change links. Set the maximum number of steps (default 8) and the search width (default 3). Click *Find the path*. |
| 3. The path from today to the vision | The steps, read from the vision back to today (*Read forwards* reverses the order). Each step shows its type, the share of the distance it closes, the share closed after it, how much it is needed, and the milestones on the outcomes. A table compares the outcomes today, at the end of the path and in the vision. Steps that are not needed are listed below. |

Make the vision from a copy of today's map rather than drawing it anew, so that the two maps remain comparable. Steps are phases in a logical order, not periods of time, and the path is a proposal for the group to judge, not a plan. The method is described in section U.19 of the Methodological Annex.

**Workshop mode.** The workshop planner has two new steps, *Draw the future you want* and *Work back from the vision*, and a template *From today to a shared vision* (about three hours). The workshop protocol cites Robinson (1990) when these steps are on the agenda.

### U.26 Empirical data

*Empirical data* in the model menu brings measured values onto the scale of the map. The dialog has two stages.

- **Load a table.** One column per variable and one row per year or case; a first column with years or names labels the rows. Choose a CSV file (comma or semicolon, decimal comma allowed) or paste cells from a spreadsheet, and click *Read*.
- **Match and fuzzify.** Each column is matched to a concept by name; change the match where needed. For each column choose the fuzzification: *Linear between two values*, *Linear between the 5th and 95th percentile*, or *Linguistic terms* (3 or 5 terms). Tick *Reverse* when a higher measurement means a lower concept value. Choose the scale of the map, 0 to 1 or -1 to +1.

The fuzzified data can then be used in three ways.

| Use | What it does |
|---|---|
| Start values | Takes the start values of the matched concepts from one row, for example the most recent year. Concepts without data keep their own start value. |
| Compare with the model | Starts the model from one row, runs it until it settles and compares the end state with a later row: the difference per concept and whether it changed in the same direction. Read it as a check of direction and rough size, not of timing. |
| Suggest weights | For a time series of at least four rows, fits the relationships already on the map to the data. The table shows the expert weight, the weight from the data and the result; a slider sets the share given to the data. Tick the relationships to change and click *Apply the new weights*. |

Both changes, start values and weights, can be undone with *Undo*. Correlation in data is not causation: use the suggested weights to question the expert weights, not to replace the group's judgement. The methods are described in section U.20 of the Methodological Annex.

### U.27 The worked example

**Backcasting.** On the Backcasting tab, *Load the worked example* adds two models to *Your models*: "Peat meadow today (worked example)", which opens, and "Peat meadow vision (worked example)", which is chosen as the vision. Click *Find the path* to run the example. The result should match the table in section U.21 of the Methodological Annex. The two models are ordinary models: change them to see how the path responds, or delete them in *Your models*.

**Empirical data.** With the peat meadow model open, open *Empirical data* and click *Use the worked example data*. The table is read, every column is matched to a concept, and each column is set linear between the fixed bounds of its unit on the -1..+1 scale. On *Suggest weights*, click *Suggest weights* to see how closely the data reproduce the weights of the map.

**Fixed bounds for suggested weights.** When you suggest weights from your own data, choose *Linear between two values* for every column and enter the values that stand for the ends of the map's scale, for example 20 and 80 cm for drainage depth. The default (each column between its own minimum and maximum) is fine for start values and for the direction of change, but it changes the size of suggested weights.

**New marks.** A suggested weight that the fit placed beyond -1..+1 is shown at the limit and marked *at the limit*. A link that differs between today and the vision only in its delay is offered as a step of its own: *Speed up the link* or *Slow down the link*.

### U.28 Timing of the measures

With *Advanced tools* switched on, a scenario that holds one or more concepts shows *Timing of the measures* below its list of changes. For each measure, enter:

- **Starts in iteration**: when the measure begins (0 = from the start).
- **Held for**: for how many iterations it is held (0 = until the end).
- **Phased in over**: over how many iterations it moves step by step to its value (0 = at once).

The change then reads, for example, "Drainage subsidy ▼ pushed down, from iteration 20, phased in over 10". Leave all three at 0 for the usual behaviour. The timing is saved in the model file (JSON, field `timing` of the scenario) and listed in the *Scenarios Summary* sheet of the Analysis Workbook. If a measure changes at or after the maximum number of iterations, raise that maximum in the simulation settings, or the run cannot settle.

Use the iteration plot on the Scenarios tab to see the effect of a timing. A later start or a slower ramp delays the change; a measure that is held to the end reaches the same end state as one without timing. The method is described in section U.23 of the Methodological Annex.

### U.29 Results are kept

The results of Baseline Equilibrium, Scenarios & Simulation, Sensitivity, Monte Carlo, Transition Point Analysis and Transition Pathways are now kept with each model in this browser. After a reload, or after opening another model and coming back, the last results are shown again, together with the scenarios that were compared. If the model, its settings or its scenarios changed after a result was computed, the result comes back with the usual notice that the model has changed since the analysis was run; run it again to refresh it. The Backcasting result is not yet kept.

Results are stored in the browser's own database (IndexedDB), separately from the models, and only in this browser. Deleting a model deletes its results. In a private window, or with site data blocked, results are not kept, and the tool works as before.

### U.30 Dutch language option

The switch *EN | NL* in the top bar changes the language of the interface. The choice is kept in this browser; switching saves the model and reloads the page. The menus, all tabs, the dialogs, the figure and table editors, the Getting started guide, the Meinweg game and the whole workshop mode, including the facilitator script, the handout and the protocol, are translated. Some sentences built from numbers are still in English. The language changes only the texts: models, results and exports are the same in both languages, and the documentation remains in English.

---

## Methodological Annex: Update for Version 0.5.8

Version 0.5.8 adds three methods: backcasting from an envisioned system, the use of empirical data, and staged interventions. It also adds a worked example and describes how the methods are verified. No default setting changes, and a model without timings gives the same results as before.

### U.19 Backcasting from today's system to an envisioned one

The Transition Point Analysis and Transition Pathways ask where the system goes from today. Backcasting reverses the question: it starts from a desired future and works back to the steps that connect it with the present (Robinson, 1990). In the tool, both the present and the future are fuzzy cognitive maps.

**Two maps.** Backcasting starts from two maps of the same system: the map of today, and a map of the envisioned system that participants make from a copy of it. They may change start values, add or remove concepts, and add, remove, re-weight or delay relationships.

**Matching.** The concepts of the two maps are paired in two passes. The first pass pairs concepts with the same identifier, so that a concept kept in the copy remains the same concept even when it is renamed. The second pass pairs the remaining concepts by name, ignoring capitals and punctuation, which allows a vision that was drawn separately. A vision concept without a partner is new; a concept of today without a partner is phased out in the vision.

**Steps.** Every difference between the maps becomes a possible step:

| Step | Meaning | Applied as |
|---|---|---|
| Measure (lever) | A concept that nothing acts on in the vision has another value there | The concept is held at its vision value |
| Introduce | A concept exists only in the vision | The concept is added with its vision relationships to concepts that are present |
| Phase out | A concept exists only today | The concept and its relationships are removed |
| Change a link | A relationship is added, removed, re-weighted, or only faster or slower (another delay) | The relationship takes its weight and delay from the vision |

**Drivers.** Concepts that nothing acts on and that have a start value other than zero describe conditions from outside the system. Both maps are run with their drivers held at those values, so that each describes a sustained situation.

**Distance to the vision.** Let x be the settled state after a set of steps and x* the settled state of the vision. On the outcome concepts O chosen by the user, with weights w(i) (default 1), the distance is

D(x) = Σ(i ∈ O) w(i) · |x(i) - x*(i)| / Σ(i ∈ O) w(i).

By default the outcomes are the concepts that are not drivers in either map and whose settled values differ by more than 0.05.

**Search.** A beam search adds one step at a time. From each of the B best partial paths (default B = 3) every step not yet taken is tried, the map with those steps is run to its settled state, and a step is kept only if it reduces D by at least g = max(0.002, 0.01 · D(0)), where D(0) is today's distance. The search stops after K steps (default 8) or when no step meets g. The importance of a step on the final path is the increase in distance when only that step is left out.

**Reading.** The path is presented from the vision back to today: what must be in place just before the vision is reached, and what must come before that. Steps are phases in a logical order, not periods of time.

**Limitations.** (1) The distance is measured on settled states, so the method says nothing about the transient path between phases; delays (section U.15) affect the path to a settled state but not the state itself. (2) With a saturating transfer function a single strong measure can close most of the distance, after which further steps add less than g and are reported as not needed. This is a property of the map, and it should be discussed with participants rather than read as a recommendation to omit those steps. (3) Runs that do not settle are counted and reported; their distance is computed from the last iteration and is less reliable.

### U.20 Empirical data: fuzzification, model check and suggested weights

**Fuzzification.** A table of observations (rows are years or cases, columns are variables) is brought onto the scale of the map, either 0 to 1 or -1 to +1. Three methods are offered per column: linear between two chosen values, linear between the 5th and 95th percentile of the column, and linguistic terms, in which triangular membership functions are centred on user-chosen values and the value is the weighted mean of the term positions. Centres are sorted before use, so the order in which they are typed does not matter.

**Model check.** The concepts with data start from the observed values of one row, the model is run to its settled state, and the result is compared with the observed values of a later row. The tool reports the mean absolute difference and the share of variables that change in the same direction in the model as in the data.

**Suggested weights.** For a time series, the update rule of the engine is fitted to consecutive rows for every concept that has data for itself and for all its causes. With transfer function f, steepness λ and delay L(ji) on the relationship from j to i, the relative rule A(i, t+1) = f( λ · (A(i, t) + Σ(j) w(ji) · A(j, t - L(ji))) ) gives the linear regression

f⁻¹(A(i, t+1)) - A(i, t) = Σ(j) w(ji) · A(j, t - L(ji)),

and the absolute rule the same equation without A(i, t) on the left. The inverses follow the engine's transfer functions exactly: atanh(y)/λ for tanh, 2 · atanh(y)/λ for the bipolar sigmoid 2/(1 + e^(-λx)) - 1, and y itself without squashing. Values at ±1 are pulled in to ±0.999. The trivalent function is a step and cannot be inverted, so no weights are suggested under it. A relationship of a concept with itself is fitted like any other. Only relationships that the experts drew are fitted, so the structure of the map is kept. The system is solved by least squares with a ridge of 10⁻⁹ times the largest diagonal element, which only steadies the arithmetic; when two causes move together so closely that they cannot be separated (a pivot below 10⁻⁶ of that element), the concept is skipped with that reason. A concept needs at least as many usable steps as relationships plus two, and a delay of L costs L steps at the start of the series. Fitted weights are clipped to -1..+1 and marked when clipped. R² is reported per concept, and the user chooses the share s given to the data: w = (1 - s) · w(expert) + s · w(data).

**The scale matters.** A weight describes the effect of one unit of the cause on the scale of the map. If each column is scaled to its own observed minimum and maximum (the default), the units differ from those the map was built in, and the suggested weights change with them. For suggested weights, set each column linear between fixed values that stand for the ends of the map's scale, and use the same scale (0..1 or -1..+1) as the map. Section U.21 shows the size of this effect.

**Reading R².** R² measures how much of the movement of the target the fit explains. A concept that hardly moves over the series has little movement to explain, so its R² can be low even when its weight is estimated well.

### U.21 Worked example: a peat meadow

The worked example is a small, illustrative peat meadow system. Its structure follows the usual account of drained peat meadows, but the weights and the data are invented for teaching and do not describe a real area. It is loaded with *Load the worked example* on the Backcasting tab and *Use the worked example data* in the Empirical data dialog.

**Today's map** has nine concepts. Two are drivers: the ditch water level (0.2, low) and a drainage subsidy (0.6). Drainage depth is lowered by the water level (-0.8), deepened by the subsidy (+0.5) and deepened to follow subsidence (+0.3). Drainage depth raises peat oxidation (+0.8) and grass yield (+0.5) and lowers meadow birds (-0.6). Oxidation causes subsidence (+0.7, with a delay of two iterations) and greenhouse gas emissions (+0.8). Grass yield raises farm income (+0.7) and subsidence lowers it (-0.3).

**The vision** raises the ditch water level to 0.8, removes the drainage subsidy and the link from subsidence to drainage, strengthens the effect of drainage on meadow birds to -0.8, and adds two new drivers: wet crops (paludiculture, 0.6), which raise farm income (+0.5) and lower emissions (-0.3), and carbon payments (0.5), which raise farm income (+0.4).

**Backcasting result** (default settings: relative rule, tanh, λ = 1; beam width 3; at most 8 steps). The seven state concepts are the outcomes. Today's distance to the vision is D(0) = 1.571.

| Step | Step taken | Distance after | Share closed | Importance |
|---|---|---|---|---|
| 1 | Raise the ditch water level to 0.8 | 0.226 | 85.6% | 1.578 |
| 2 | Introduce wet crops | 0.169 | 89.3% | 0.197 |
| 3 | Introduce carbon payments | 0.006 | 99.6% | 0.162 |

Read backwards, the vision requires carbon payments, which require a farming system with wet crops, which in turn requires a raised water level. Phasing out the subsidy, cutting the subsidence link and strengthening the bird link are not needed: once the water level is high, each would reduce the distance by less than g (0.016). With every step taken together the distance is 0.000. With measures only (no structural steps), the water level is the only step, and 85.6% of the distance is closed; the remaining distance lies in farm income, which needs the new sources of income. The search used 50 runs, of which 2 did not settle.

**Empirical data.** The example table holds yearly observations from 2010 to 2022 for all nine concepts, in physical units (for example, drainage depth in cm below the surface, emissions in t CO2-eq per hectare per year). The data were generated from today's map (`tools/make_worked_example_data.mjs`): the system starts in its settled state in 2010, the ditch water level is raised step by step from 2011 to 2016, and the subsidy is halved in 2019. Each year is one iteration, and uniform observation noise of at most 0.01 on the map's scale is added. Because the true weights are known, the example tests whether the weight suggestion recovers them.

| Fuzzification | Largest error in a weight | Signs that agree |
|---|---|---|
| Each column linear between fixed bounds for -1 and +1 (signed scale) | 0.020 | 10 of 10 |
| Each column between its own minimum and maximum (the default) | 0.60 | 9 of 10 |

With fixed bounds every weight is recovered within 0.02, including the delayed relationship from peat oxidation to subsidence (0.716 against 0.700, on 10 rather than 12 steps). Its R² is only 0.09, because subsidence barely moves over the series: an example of a good estimate with a low R². With the default scaling, three weights reach the limit of ±1 and the effect of subsidence on drainage changes sign, although the data are the same.

The model check, starting in 2010 with the drivers at their 2022 values, gives the same direction of change as the data for 8 of 9 variables (89%) but a mean absolute difference of 1.13. The difference is expected: in 2022 the system is still in transition, while the model reports where it will settle.

### U.22 Verification

`npm test` runs every test file in the `tests` folder; a GitHub check runs it, together with a production build, on every pull request and on every change to the main branch. The tests that cover the methods of this chapter are:

- `test_backcasting.mjs`: matching, steps, application of steps and the search on a small map, and the edge cases found during development.
- `test_empirical_data.mjs`: reading tables, the three fuzzification methods, the model check, and recovery of known weights under tanh and the bipolar sigmoid, with a delay, with a relationship of a concept with itself, with collinear causes and under the trivalent function.
- `test_worked_examples.mjs`: the peat meadow example with the engine's own simulation, reproducing the numbers of section U.21.
- `test_staged_interventions.cjs`: the update and the convergence test of section U.23.

### U.23 Staged interventions

**Motivation.** Until this version a scenario held each of its measures (a concept pushed up, pushed down or held at a value) from the first iteration to the last. A transition, however, usually introduces measures one after another, phases them in, or applies them for a limited period. A staged intervention gives each held concept three optional whole numbers:

| Setting | Meaning | Default |
|---|---|---|
| Start s | The first iteration in which the concept is held | 0 |
| Duration d | The number of iterations for which it is held; 0 means until the end of the run | 0 |
| Ramp r | The number of iterations over which it moves to its held value; 0 or 1 means at once | 0 |

**Update.** Let a be the held value of concept i, and v the value of i in iteration s - 1 (its starting value in the model when s = 0). In iteration t,

- for t < s, and for t ≥ s + d when d > 0, the concept is not held and follows the update rule like any other concept;
- for s ≤ t < s + d (or t ≥ s when d = 0), it is held at v + (a - v) · min(t - s + 1, r) / r when r > 1, and at a otherwise.

A concept with a timing starts from its own starting value in the model, not from the scenario's starting value, so that it does not act before its start. Relationship delays (section U.15) apply as before: a measure introduced in iteration s reaches a concept at the end of a relationship with delay L in iteration s + L + 1.

**Convergence.** A run cannot be called settled while a timed measure is still to change. The test of section U.15 (the largest change below the threshold for L(max) + 1 iterations in a row) is counted only from the iteration after the last change, max(s + r - 1, s + d). A measure that changes at or after the iteration cap leaves the run unsettled, and the interface warns about it.

**Effect on results.** A measure that is held to the end of the run ends, in a model with a unique fixed point, in the same settled state whatever its start or ramp: timing changes the path and the time to settle, not the destination. A measure with a duration is released, after which the concept follows the map again. With the absolute update rule and no causes, a released concept returns to zero at once; with the relative rule it fades gradually. A temporary measure therefore leaves a lasting effect only where the map has feedback that sustains it, which is the question a pulse experiment answers.

**Interpretation.** Iterations are steps of the model and have no calendar meaning (section U.15). Starts and ramps express order and pace relative to the other measures, such as "the subsidy is phased out after the water level has been raised", not dates. Models without timings, and model files of earlier versions, give exactly the same results as before.

**Scope.** Timing applies wherever a scenario is simulated: Scenarios & Simulation, Monte Carlo, and the scenarios that the Sensitivity and Transition Point analyses start from. The concept that a Sensitivity or Transition Point analysis sweeps is held for the whole run, whatever its timing in that scenario. The Transition Pathways and Backcasting searches build their own sequences of steps and do not use scenario timings.

**Saved results.** Results that are kept between sessions (User Manual, section U.29) are stamped with a signature of the model, its settings and the compared scenarios, including their timings. A result restored into a model whose signature differs is marked as out of date and is not used until the analysis is run again.

---

## Development Log, version 0.5.8

### Title table

| Field | Value |
|---|---|
| Version | 0.5.8 (prototype) |
| Log entry date | 27 November 2026 |
| Status | Released by the merge of the branch docs-0.5.8 into the GitHub main branch, together with the 0.5.8 documents and this log. Netlify deploys the site automatically. |
| Live URL | spaghetti-engine.netlify.app (Netlify, auto-deployed from the GitHub main branch) |
| Source repository | github.com/aPaarl/Spaghetti-engine, main branch |
| Previous version | 0.5.7, 16 November 2026, branch docs-0.5.7 |
| Prepared by | A. Paarlberg |

### 1. Purpose of This Log

This Development Log records the changes from version 0.5.7 to version 0.5.8 of The Spaghetti Engine. Version 0.5.8 adds backcasting from a vision, the use of empirical data, a peat meadow worked example, staged interventions, saved analysis results and a Dutch language option, and it introduces automated tests on every pull request. The code was deployed between 16 and 27 November 2026; this release adds the documents that describe it and raises the version number.

The log documents what changed and why, how existing results are affected, how the changes were checked, and the deployment status.

### 2. Summary of Version 0.5.8

| Area | Change |
|---|---|
| Backcasting | A new step in the side menu with the tab Vision and backcasting: compares today's map with an envisioned map, turns every difference into a possible step, and finds by beam search the order of steps that brings today's settled state closest to the vision. |
| Empirical data | A dialog that fuzzifies measured data onto the scale of the map and uses it for start values, a check of the model, or suggested weights fitted to a time series. |
| Worked example | A peat meadow system today and in a vision, with yearly data, loadable from the Backcasting tab and the Empirical data dialog. |
| Staged interventions | A held concept in a scenario can have a start, a duration and a ramp. |
| Saved results | The last results of six analyses are kept per model in the browser and restored after a reload. |
| Dutch | An EN and NL switch in the top bar; the interface, the game and the workshop documents are translated. |
| Tests | `npm test` runs every test file; a GitHub check runs the tests and the production build on every pull request and on every push to main. |

### 3. The Changes in Detail

**3.1 Empirical data (commit b8ab14e; completed in pull request #19).** Model menu, Empirical data. A pure module (src/empiricalData.js) reads CSV or pasted cells, matches columns to concepts, fuzzifies them, compares the model with the data and fits weights by least squares; a dialog (src/EmpiricalDataDialog.jsx) offers the three uses. Both changes to the model can be undone.

**3.2 Dutch language option (commits 5a1c7ff, df05b5f, fcfc41d and 90d1524).** src/i18n.js translates by the English text, so a text without a translation stays in English. The Dutch texts are in src/i18n.nl.js and src/workshop.nl.js. The choice is kept in the browser; switching saves the model and reloads.

**3.3 Backcasting (commits 8051343, 44cc109 and d3608b4; completed in pull request #19).** A pure module (src/backcasting.js) matches the two maps, builds the steps and runs the search; the tab (src/BackcastingTab.jsx) shows the path from the vision back to today. The side menu gains step 5, Backcasting; step 4 is renamed Forward casting. The workshop mode gains two steps, a three-hour template and the reference Robinson (1990).

**3.4 Worked example and tests (pull request #19, commit e57f3e6).** src/workedExamples.js holds the peat meadow maps and data; tools/make_worked_example_data.mjs generated the data. tests/run-all.mjs runs every test file, tests/engine.cjs gives the tests the real simulate(), and .github/workflows/tests.yml runs npm ci, npm test and npm run build.

**3.5 Staged interventions and saved results (pull request #20, commit fb280f4).** `scenario.timing[conceptId] = { start, duration, ramp }`, read by simulate() and cleaned on import (whole numbers from 0 to 500, only for held concepts, empty timings dropped). Timing controls appear under Advanced tools on the Scenarios tab, and the Scenarios Summary sheet of the Analysis Workbook has a timing column. src/resultStore.js keeps the last result of six analyses per model in IndexedDB, each stamped with the model and scenario signature it was computed on; the signature of the Scenarios comparison now includes the timings.

### 4. Implementation Choices

| Topic | Choice in the tool | Reason |
|---|---|---|
| Vision | A second model, made from a copy of today's map. | The two maps stay comparable concept by concept, and the vision can be edited with the usual tools. |
| Distance | Mean absolute difference of settled states on chosen outcomes. | Simple to explain to participants and independent of the number of iterations, which has no calendar meaning. |
| Search | Beam search with a minimum gain per step. | An exhaustive search grows with the factorial of the number of steps; the beam keeps alternatives without that cost. |
| Suggested weights | Only relationships already on the map, blended with the expert weights. | The structure of the map remains the experts'; data question the weights rather than replace them. |
| Timing | Start, duration and ramp per held concept, in iterations. | Covers sequencing, phasing in and temporary measures, without suggesting a calendar. |
| Saved results | In IndexedDB, per model, apart from the model files. | Results can be large; keeping them out of the model keeps the files small and the models unchanged. |
| Translation | By the English text, falling back to English. | Screens could be translated one at a time without breaking those not yet done. |

### 5. Effect on Existing Results

A model without timings gives exactly the same results as in 0.5.7, and model files of earlier versions open unchanged. Backcasting, the empirical data dialog and the worked example add new analyses and new models and do not change existing ones. Saved results and the Dutch language option change what is shown, not what is computed. Version raised from 0.5.7 to 0.5.8 in package.json and package-lock.json.

### 6. Defects Found and Fixed

| Defect | Fix |
|---|---|
| Suggested weights under the sigmoid transfer function used the inverse of the 0..1 logistic function, while the engine uses the bipolar sigmoid on -1..+1. Weights were wrong (in a test, 1.00 and -0.98 instead of 0.70 and -0.50). | The inverse is now 2 · atanh(y)/λ, matching the engine. |
| Suggested weights ignored delays, so a delayed relationship was fitted against the wrong year. | A relationship with delay L is fitted against its source L steps earlier. |
| A relationship of a concept with itself was left out of the fit, although it is part of the update. | It is fitted with the other relationships. |
| The ridge term made the collinearity check unreachable, so causes that move together received arbitrary weights. | The ridge is scaled to the data and the check now skips such a concept with its reason. |
| Linguistic centres typed out of order gave no value. | Centres are sorted; fewer than two give no value. |
| Backcasting could pair a renamed concept with the wrong partner when a name match came before the identifier match. | Identifiers are matched for all concepts first, then names. |
| Backcasting did not see a change of delay, and a re-weighted link kept today's delay. | A delay-only change is a step of its own (Speed up or Slow down the link), and a changed link takes the vision's delay. |

### 7. Verification

- Tests: all twelve test files pass (335 checks), including the new tests of backcasting, empirical data, the worked example and staged interventions. The GitHub check passed on pull requests #19 and #20.
- Build: the production build completes without errors.
- Website: both worked examples were run in a browser at 1440 by 900 pixels with no errors in the console. A baseline result and a scenario comparison with a timed measure were restored after a reload, and a model changed while closed brought its result back marked as out of date.

### 8. Deployment Status

The code was deployed by the pushes to main on 16 and 17 November 2026 (empirical data, Dutch language option, backcasting) and by the merges of pull requests #19 and #20 on 27 November 2026. Version 0.5.8 and its documents are deployed by the merge of the branch docs-0.5.8 into main. Netlify rebuilds the site automatically.

Documents: the 0.5.8 User Manual and Methodological Annex start from the 0.5.7 documents, with an update chapter for 0.5.8 added. One reference was added to the Annex (Robinson, 1990).

### 9. Prototype Scope and Known Limitations

- All limitations listed in the 0.4.0 to 0.5.7 logs still apply.
- Backcasting compares settled states only; it says nothing about the transient path between phases.
- The Backcasting result is not yet kept after a reload.
- Saved results are kept only in the browser where they were computed.
- Some sentences built from numbers are still in English in the Dutch interface; the documentation is in English only.
- The worked example is illustrative; its weights and data do not describe a real area.

### 10. Related Documentation

| Document | Covers |
|---|---|
| The Spaghetti Engine - User Manual (version 0.5.8) | How to use every feature; the chapters Update for Version 0.5.4 to 0.5.8 describe the latest changes. |
| The Spaghetti Engine - Methodological Annex (version 0.5.8) | The methods; sections U.19 to U.23 cover backcasting, empirical data, the worked example, verification and staged interventions. |
| Development Log version 0.5.7 | The 0.5.7 release: delays, Combine maps, audience pages, the Model editor, the Transition Point Analysis and workshop mode. |
| This Development Log | What changed in 0.5.8 and the technical work behind it. |

### 11. Next Steps

- Keep the Backcasting result after a reload, like the other analyses.
- Translate the remaining sentences built from numbers.
- Integrate the update chapters into the body of the User Manual and the Methodological Annex at the next full revision, with new screenshots.
- Continue with the roadmap: version 0.6.0 (modelling made easier).
