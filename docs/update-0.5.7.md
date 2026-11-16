# Documentation text for version 0.5.7

This file holds the text that version 0.5.7 adds to the three documents. The User Manual and the Methodological Annex each receive a chapter "Update for Version 0.5.7", placed after the chapter "Update for Version 0.5.6" (docs/update-0.5.6.md) and in the same style. The Development Log for 0.5.7 replaces the 0.5.6 log. Version 0.5.7 covers pull request #18 and the changes pushed to main on 16 November 2026 (commits 61e35eb and c03b278).

---

## User Manual: Update for Version 0.5.7

This chapter describes the changes in version 0.5.7. Like the chapters on versions 0.5.4 to 0.5.6, it takes precedence over the later sections where they differ. Two features are new to the analysis: delays on relationships and the combination of several maps. The other changes concern the layout of the tool.

### U.19 Delays on relationships

With *Advanced tools* switched on, every relationship has a *Delay* setting. It appears in the Inspector on the Network tab (with - and + buttons) and when a relationship is opened in the Model editor. The delay is the number of extra iterations before a change in the source reaches the target, from 0 to 10. Leave it at 0 unless an effect is clearly slower than the others.

- **On the map.** A relationship with a delay shows it next to its weight, for example "+0.60 · lag 2".
- **Basic view.** A delay that has been set remains visible when *Advanced tools* is off.
- **Files.** Model files (JSON) save the delay as `lag`. The relationships table export (CSV and Excel) has a column "Lag (iterations)", and the Analysis Workbook adds a sheet "Relationship Lags" when the model has any delays.
- **Diagnostics.** The *Method & diagnostics* boxes report how many relationships have a delay and the longest delay.
- **Check.** After adding delays, check on the Baseline Equilibrium tab that the model still settles (Annex, section U.15).

An iteration has no calendar meaning. Use delays to express that an effect is slower than the others, for example "about twice as slow", not a number of years.

### U.20 Combining maps

*Combine maps* aggregates two or more maps into one group map, for example the maps that several stakeholders drew on their own. Open it from the model menu, or with *Combine maps* in *Your models*. The maps you pick are only read; the result is saved as a new model.

| Part of the dialog | What you do there |
|---|---|
| 1. Maps to combine | Tick the maps and give each a credibility (1 = equal weight, 2 = twice as much, 0 = left out of the averages). To combine maps from other people, import their files first. |
| 2. How relationships are averaged | Choose which maps count for each relationship: *All maps*, *Maps with both concepts* or *Maps with the relationship* (Annex, section U.16). Optionally keep a relationship only if at least a given number of maps drew it, and only if its combined weight reaches a given size. |
| 3. Matching concepts | Concepts with the same name are matched, ignoring capitals and punctuation. When two names mean the same thing, choose the one to join in *Same as*; *Separate again* undoes it. |
| 4. How alike the maps are | For each pair of maps: shared concepts, shared relationships, the share of shared relationships with the same sign, and the mean weight difference. |
| 5. Combined map | The number of concepts and relationships, what was left out, and the relationships on which the maps disagree in sign. |

Give the new model a name and click *Create combined model*. Each relationship's description lists the maps and weights it was combined from, for example "Combined from 2 of 3 maps: Farmer A 0.80, Farmer B 0.40." Concepts are placed where the first map drew them; use *Arrange* on the Network tab to tidy the layout. Relationships on which the maps disagree in sign partly cancel out in the average and are worth discussing with the participants.

### U.21 Pages for each audience

On the About & documentation page, each card under *Who it is for* now opens a page of its own. A fifth group is added, *Local stakeholders* (farmers, residents, water managers, nature organisations and businesses). The groups are Researchers, Facilitators, Policy makers, Local stakeholders, and Students and teachers. Each page has five parts:

- **What it helps you do.** Why the group would use the tool.
- **A typical way of working.** Numbered steps, each with a button that opens the tab, *Combine maps*, the Getting started guide, the Meinweg game or the workshop planner.
- **What you take away.** The outputs, such as figures, the Analysis Workbook or model files.
- **Keep in mind.** Points to be careful about, for example that results are implications of the map and not forecasts.
- **Recommended reading.** The User Manual or the Methodological Annex.

*Back to About* returns to the page; the buttons at the bottom switch to another group.

### U.22 A simpler Model editor

The Model editor shows the model as two quiet lists.

- **Find and filter.** A search box finds concepts by name, module or definition. The module buttons next to it show one module at a time.
- **Concepts.** Grouped by module, each on one line with a coloured dot for its module and its number of links. Click a concept to open it: name, module, start value (slider and number), definition, *Add a relationship from here*, *Show on the map* and *Delete*. Only one concept is open at a time.
- **Relationships of a concept.** While a concept is open, the right-hand list shows only its relationships; *Show all* returns to the full list.
- **Relationships.** Each on one line, "A → B", with an arrow coloured by sign (green positive, orange negative) and a badge for the strength (*Very weak*, *Weak*, *Moderate*, *Strong* or *Very strong*, with + or -). Click a relationship to open it: source and target, a slider from -1 to +1 with a number field, the sentence that reads it ("When A increases, B decreases (a moderate effect)."), the delay (section U.19) and *Delete*. The buttons for fixed strengths (+1, +0.75, ...) are removed; type a number for an exact value.
- **An empty model.** A model without concepts shows a start panel with three choices: add the first concept, draw on the map, or paste a matrix.

The Model check and *Import and export tables* are unchanged.

### U.23 Transition Point Analysis: key findings first

The analysis and its results are unchanged (Annex, section U.17); the tab shows less at once.

- **Setup.** The number of steps and the threshold for a flat response are folded into one line next to *Run analysis*, for example "100 steps, flat below 0.015". Click it to change them.
- **Key findings.** The results open with one sentence per outcome that responds, largest effect first, for example "Greenhouse gas emissions falls by 1.59. Returns diminish from intensity 0.87, when 100% of the effect is reached." Each sentence carries the quadrant of the prioritization matrix (*Quick wins*, *Strategic investments*, *Small improvements* or *Poor leverage points*). The heading shows the synergy type, and outcomes without a meaningful response are listed in one line.
- **Prioritization matrix.** The four lists of outcomes below the matrix and the separate synergy box are removed; both are in the key findings.
- **Table.** Five columns: outcome, TP, change at TP, max change and response type. *Show all columns* adds share at TP, range and efficiency. The CSV export still holds every column, including the intervention.
- **Exports.** The export buttons are in the fold-out box *Export data and figures*.

### U.24 Workshop mode

The workshop mode helps a facilitator to prepare a workshop with the tool and to run it step by step. Open it from the Help menu with *Prepare a workshop*, from the link *Running a workshop? Prepare it here* and the card *Prepare a workshop* on the About page, or from the Facilitators page.

**Preparing.** The planner has three parts.

| Part | What it holds |
|---|---|
| 1. The workshop | Title, central question, date, start time and participants. |
| 2. The agenda | The steps of the workshop, each on one line with its start time, type (discussion, building or analysis) and minutes. Click a step to change its title, *What participants are asked* and *Your notes*, or to move it earlier or later or remove it. *Add a step* offers 15 ready-made steps. Three templates fill the agenda at once: *Map a system together*, *Test interventions* and *Compare stakeholder views*. |
| 3. Print and run | *Print facilitator script* (with notes and points to prepare) and *Print participant handout* (the question and the prompts, with space for notes). |

The planner checks whether the model is ready for each step and marks the steps to prepare, for example a scenario step without prepared scenarios, a comparison step with only one map in the library, or a baseline step in which every start value is 0. When nothing is missing it shows *The model is ready*. The plan is saved with the model, in this browser.

**Running.** *Start the workshop* shows a dark bar under the top bar with the step number, its title, the prompt for the participants and a timer for the step (start, pause, reset; it turns coral when the time is up). *Next* and *Back* move between steps and open what the step needs: its tab, *Combine maps*, or *Advanced tools* for the transition analyses. The full-screen button shows the central question, the prompt and the timer in large text for the group; click anywhere to return. *Agenda* reopens the planner, and *Finish* or the close button ends the workshop. Switching to another model also ends it.

---

## Methodological Annex: Update for Version 0.5.7

Version 0.5.7 adds two methods, delays on relationships and the aggregation of maps, and changes how the results of the Transition Point Analysis are presented. No default setting changes, and a model without delays gives the same results as before.

### U.15 Time lags between cause and effect

The update rule of section 3 assumes that every causal effect is passed on within one iteration. Many social-ecological effects are slower than others: a subsidy changes farm practice within a season, while a change in farm practice reaches groundwater quality only after years. The tool therefore allows a time lag on each relationship, following Park and Kim (1995) and Nair, Reckien and van Maarseveen (2020).

A relationship from concept j to concept i with lag L(ji) passes on the value of j from L(ji) iterations earlier. Under the relative update rule, the update becomes A(i, t+1) = f( A(i, t) + Σ(j) w(ji) · A(j, t - L(ji)) ), and under the absolute rule the term A(i, t) is dropped as before. A lag of 0 is the ordinary update. Lags are whole numbers of iterations from 0 to 10.

- **State before the run.** Before iteration 0, the system is taken to have been at its starting state. A concept locked in a scenario (a driver) is treated as an intervention that starts at iteration 0; before that, it stood at its own starting value. A lagged relationship out of a driver therefore passes the intervention on L iterations later. In Transition Pathways, each stage starts from the equilibrium of the previous stage, with the new lever not yet applied.
- **Equilibria.** At a fixed point every past state equals the present one, so lags do not change the fixed points of the update. A model that settles to a single equilibrium without lags reaches the same equilibrium with them; in the former peat meadow example the largest difference was below 0.000001. Lags change the path to equilibrium and the number of iterations, can make a model oscillate and, where a model has several equilibria, can change which one is reached. In the former nexus example, a lag of one iteration on every relationship turns a settling baseline into a sustained oscillation. Nair et al. (2020) report changed steady states; in this formulation such changes arise only through these mechanisms.
- **Convergence.** With lags, the state of the system consists of the last L(max) + 1 iterations, where L(max) is the longest lag. A run counts as settled only when the largest change has stayed below the convergence threshold for L(max) + 1 consecutive iterations. Without lags this is the usual single-iteration test.
- **Effect on the analyses.** The convergence charts of Baseline Equilibrium and Scenarios & Simulation show when each effect arrives. The structural measures (sections 5 to 8) are unchanged, since they use the network alone. Sensitivity Analysis, Transition Point Analysis, Monte Carlo and Transition Pathways read settled states, so lags change their results only through convergence, oscillation or the choice between equilibria. Monte Carlo varies weights and starting values, not lags. In asynchronous mode, a lagged relationship reads the recorded past state; an unlagged one reads the value already updated in the current sweep, as before.
- **Interpretation of time.** An iteration has no calendar meaning in an FCM. A lag expresses the relative speed of an effect compared with the other relationships of the same model and should be elicited as such, for example "this effect takes about twice as long as most others", not as years or months.

### U.16 Aggregation of maps

Combine maps builds a group map from K individual maps, the usual way to obtain a social or community cognitive map from individual stakeholder maps (Kosko, 1988; Özesmi and Özesmi, 2004).

**Matching concepts.** Two concepts are taken to be the same when their names are equal after conversion to lower case and replacement of every run of characters other than letters and digits by a single space. The user can join further concepts by hand. Within one map, relationships between concepts that end up joined are averaged, and a relationship between two joined concepts (a self-loop) is left out.

**Combining weights.** Let w(ij, k) be the weight of the relationship from i to j in map k (0 when the map has no such relationship) and c(k) ≥ 0 the credibility of map k (1 by default). The combined weight is the credibility-weighted mean over a set D(ij) of maps:

w(ij) = Σ(k ∈ D(ij)) c(k) · w(ij, k) / Σ(k ∈ D(ij)) c(k).

| Rule | D(ij) | Effect |
|---|---|---|
| All maps (default) | every map | A map without the relationship counts as 0 (Kosko, 1988): a relationship drawn by few people becomes weaker. |
| Maps with both concepts | the maps that contain both i and j | A map that has both concepts but no link between them counts as 0; a map that lacks one of them does not count. |
| Maps with the relationship | the maps that contain the relationship | The relationship keeps the strength its authors gave it. |

A relationship is kept when it is drawn in at least the chosen minimum number of maps, its combined weight is not 0, and the absolute combined weight is at least the chosen minimum. Weights are rounded to four decimals. A relationship is reported as a sign conflict when at least one map gives it a positive and another a negative weight; the standard deviation of its weights over the maps that drew it is stored with it.

**Concepts of the combined map.** The start value of a concept is the credibility-weighted mean of its start values over the maps that contain it. Its module is the most frequent non-empty module, its definition the first non-empty one, and its name the most frequent spelling. The lag of a relationship (section U.15) is the most frequent lag among the maps that drew it.

**Comparing maps.** For each pair of maps A and B, after matching:

| Measure | Definition |
|---|---|
| Shared concepts | Jaccard index of the concept sets, \|C(A) ∩ C(B)\| / \|C(A) ∪ C(B)\| (Jaccard, 1912). |
| Shared relationships | Jaccard index of the sets of directed relationships. |
| Same sign | Share of the shared relationships that have the same sign in both maps. |
| Weight difference | Mean of \|w(A) - w(B)\| over the relationships of either map among the concepts that both maps contain, a missing relationship counting as 0. It runs from 0 (the maps say the same about their common ground) to 2 (opposite). |

**Assumptions.** Matching by name assumes that equal names mean the same concept and that the user joins differently named concepts that do; a poor match distorts every later measure. Averaging assumes that the weights of different people are on the same scale. With *All maps*, a combined map of many people tends to have weaker relationships than any individual map, which lowers the activity of the dynamic model; the rule should be reported with the results.

### U.17 Presentation of the Transition Point Analysis

The procedure, the transition point and the response types of section 12 are unchanged. The key findings summarize the existing results: for each outcome whose response is not flat, ordered by the absolute max change, they state the direction and size of the change, the transition point, and the share of the effect reached there (the share at TP of section 12; omitted when it is not defined). A transition point of 1 is reported as an effect that keeps building up to full intensity. The quadrant is the quadrant of the prioritization matrix, with the split at intensity 0.5 and at the mean absolute effect of the outcomes in the matrix. The synergy type is the synergy classification that the tab already reported, evaluated at full intensity (x = 1).

### U.18 Readiness checks of the workshop planner

The workshop planner checks the open model for each step of the agenda. The checks are counts on the model, not analyses: a concept step notes an empty model; relationship steps need at least two concepts; the strength step needs at least one relationship; the levers step at least three; the baseline step at least one non-zero start value (otherwise nothing can move, section 3); the scenario step at least one scenario besides the baseline; and the comparison step at least two models in the library. The checks do not judge whether the model is good, only whether the step can be carried out.

---

## Development Log, version 0.5.7

### Title table

| Field | Value |
|---|---|
| Version | 0.5.7 (prototype) |
| Log entry date | 16 November 2026 |
| Status | Released by the merge of the branch docs-0.5.7 into the GitHub main branch, together with the 0.5.7 documents and this log. Netlify deploys the site automatically. |
| Live URL | spaghetti-engine.netlify.app (Netlify, auto-deployed from the GitHub main branch) |
| Source repository | github.com/aPaarl/Spaghetti-engine, main branch |
| Previous version | 0.5.6, 16 November 2026, branch docs-0.5.6 (pull request #17) |
| Prepared by | A. Paarlberg |

### 1. Purpose of This Log

This Development Log records the changes from version 0.5.6 to version 0.5.7 of The Spaghetti Engine. Version 0.5.7 adds delays on relationships (pull request #18) and the combination of maps, pages for each audience on the About page, a simpler Model editor, a Transition Point Analysis that opens with its key findings, and a workshop mode for facilitators. The code was deployed on 16 November 2026; this release adds the documents that describe it and raises the version number.

The log documents what changed and why, how existing results are affected, how the changes were checked, and the deployment status.

### 2. Summary of Version 0.5.7

| Area | Change |
|---|---|
| Delays | Each relationship can have a delay of 0 to 10 iterations; the update reads the source from that many iterations earlier. Saved in model files, reported in exports and diagnostics. |
| Combine maps | Aggregates two or more maps into a group map: matching by name with manual joins, three averaging rules, credibility weights, thresholds, pairwise comparison and a list of sign conflicts. |
| About page | A page for each audience, a fifth audience (local stakeholders), and entry points to the workshop planner. |
| Model editor | One-line concepts and relationships that open to edit, search, module filter, relationships per concept, strength badges, a start panel for an empty model. |
| Transition Point Analysis | Key findings first, a five-column table with the rest on request, settings and exports folded away. |
| Workshop mode | A planner with 15 steps, three templates, readiness checks and printable script and handout; a run bar with prompt, timer and navigation that opens each step's tab. |

### 3. The Changes in Detail

**3.1 Delays (pull request #18, commit e3294d1).** The update rule keeps a history of the last L(max) + 1 states and reads a lagged source from it. A run counts as settled only when the change has stayed below the threshold for L(max) + 1 iterations. The Inspector and the Model editor have a Delay setting under Advanced tools; the map labels lagged relationships; the JSON file, the relationships export, the Analysis Workbook and the Method & diagnostics boxes include the lags.

**3.2 Combine maps (commit df6ac98).** A pure module (src/mapAggregation.js) matches concepts, averages the weights under the chosen rule and computes the pairwise comparison; a dialog (src/CombineMapsDialog.jsx) is opened from the model menu and from Your models. The combined map is saved as a new model; the source models are only read.

**3.3 Audience pages (commit 3fa771f).** The cards under Who it is for open a page each, with its text in src/audiencePages.js so that it can be edited apart from the layout. A fifth audience, Local stakeholders, was added.

**3.4 Model editor (commits 217b72f and 6343119).** A first redesign added search, module filters, coloured cards and relationships per concept; it was still too crowded, and the second version shows every concept and relationship as one line that opens to edit. The fixed-strength buttons were removed from the relationship lines to save space.

**3.5 Transition Point Analysis (commit 1ea42e7).** A key findings card replaces the four quadrant lists and the synergy box; the table shows five columns by default; the step settings and the exports are folded away.

**3.6 Workshop mode (commits b5ad55b and c03b278).** A planner and a run bar (src/WorkshopMode.jsx), opened from the Help menu, the About page and the Facilitators page. The plan is stored per model in the browser under spaghetti-engine:workshop:v1:<model id>. A second pass made the planner easier to read: three numbered parts, larger text, and agenda steps that open to edit.

### 4. Implementation Choices

| Topic | Choice in the tool | Reason |
|---|---|---|
| Lag before the run | The system is taken to have been at its starting state; drivers start at iteration 0. | A defined history is needed for the first iterations; it makes a lag delay the arrival of an intervention. |
| Default averaging rule | All maps, absent = 0. | The established augmented-matrix average of Kosko (1988); the other two rules are offered for maps of different scope. |
| Concept matching | By normalized name, with manual joins. | Transparent and predictable; automatic semantic matching would hide choices that the facilitator should make with the group. |
| Model editor | One line per item, one open item at a time. | The card layout showed every field of every item and was found too cluttered. |
| Strength buttons | Removed from the Model editor. | They doubled the height of every relationship; the slider and the number field cover the same values. |
| Workshop storage | Per model, in the browser. | A workshop is prepared for a specific model; nothing leaves the browser. |

### 5. Effect on Existing Results

A model without delays gives exactly the same results as in 0.5.6. Combine maps creates new models and does not change existing ones. The redesigns of the Model editor and the Transition Point Analysis, the audience pages and the workshop mode change the presentation only. Version raised from 0.5.6 to 0.5.7 in package.json and package-lock.json.

### 6. Defects Found and Fixed

None reported in this release.

### 7. Verification

- Tests: all automated tests pass, including the new test of the time lags (16 checks) and of the aggregation of maps (21 checks: matching, the three rules, credibility weights, thresholds, joins and the pairwise comparison).
- Build: the production build completes without errors.
- Website: Combine maps was tried on three test maps, including a manual join; the Model editor, the Transition Point Analysis and the workshop mode were tried on the former peat meadow example at laptop and phone width, and the live site was checked after each push. The print buttons of the workshop planner were not tried in the automated check.

### 8. Deployment Status

The code was deployed by the push of commit 61e35eb (delays and Combine maps) and commit c03b278 (the other changes) to main on 16 November 2026. Version 0.5.7 and its documents are deployed by the merge of the branch docs-0.5.7 into main. Netlify rebuilds the site automatically.

Documents: the 0.5.7 User Manual and Methodological Annex start from the 0.5.6 documents, with an update chapter for 0.5.7 added. Four references were added to the Annex (Jaccard, 1912; Kosko, 1988; Park and Kim, 1995; Nair et al., 2020).

### 9. Prototype Scope and Known Limitations

- All limitations listed in the 0.4.0 to 0.5.6 logs still apply.
- Combine maps matches concepts by name only; differently named concepts must be joined by hand.
- Lags are whole numbers of iterations and have no calendar meaning.
- The workshop plan is kept in the browser where it was made; it is not part of the model file.
- The body chapters of the User Manual still describe the earlier Model editor and Transition Point Analysis; the update chapters take precedence.

### 10. Related Documentation

| Document | Covers |
|---|---|
| The Spaghetti Engine - User Manual (version 0.5.7) | How to use every feature; the chapters Update for Version 0.5.4 to 0.5.7 describe the latest changes. |
| The Spaghetti Engine - Methodological Annex (version 0.5.7) | The methods; sections U.15 to U.18 cover time lags, the aggregation of maps, the presentation of the Transition Point Analysis and the workshop readiness checks. |
| Development Log version 0.5.6 | The 0.5.6 release: new look, structural analysis step, table editor and the Meinweg game. |
| This Development Log | What changed in 0.5.7 and the technical work behind it. |

### 11. Next Steps

- Integrate the update chapters into the body of the User Manual and the Methodological Annex at the next full revision, with new screenshots.
- Save the workshop plan in the model file, so that it travels with the model.
- Continue with the roadmap: version 0.6.0 (modelling made easier).
