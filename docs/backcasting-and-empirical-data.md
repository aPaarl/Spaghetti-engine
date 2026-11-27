# Backcasting and empirical data: method, worked example and verification

This file holds the text for the next documentation release (after 0.5.7). The two methods were added as drafts on 16 and 17 November 2026; this text completes them. The Methodological Annex receives sections U.19 to U.22 in its next "Update" chapter, the User Manual receives section U.25, and the Development Log can take the last section as its list of defects and checks. All numbers below are produced by `tests/test_worked_examples.mjs`, which fails if a later change to the engine moves them.

---

## Methodological Annex

### U.19 Backcasting from today's system to an envisioned one

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

**Distance to the vision.** Let x be the settled state after a set of steps and x* the settled state of the vision. On the outcome concepts O chosen by the user, with weights w_i (default 1), the distance is

D(x) = Σ_{i∈O} w_i |x_i − x*_i| / Σ_{i∈O} w_i.

By default the outcomes are the concepts that are not drivers in either map and whose settled values differ by more than 0.05.

**Search.** A beam search adds one step at a time. From each of the B best partial paths (default B = 3) every step not yet taken is tried, the map with those steps is run to its settled state, and a step is kept only if it reduces D by at least g = max(0.002, 0.01 D_0), where D_0 is today's distance. The search stops after K steps (default 8) or when no step meets g. The importance of a step on the final path is the increase in distance when only that step is left out.

**Reading.** The path is presented from the vision back to today: what must be in place just before the vision is reached, and what must come before that. Steps are phases in a logical order, not periods of time.

**Limitations.** (1) The distance is measured on settled states, so the method says nothing about the transient path between phases; delays (section U.15) affect the path to a settled state but not the state itself. (2) With a saturating transfer function a single strong measure can close most of the distance, after which further steps add less than g and are reported as not needed. This is a property of the map, and it should be discussed with participants rather than read as a recommendation to omit those steps. (3) Runs that do not settle are counted and reported; their distance is computed from the last iteration and is less reliable.

### U.20 Empirical data: fuzzification, model check and suggested weights

**Fuzzification.** A table of observations (rows are years or cases, columns are variables) is brought onto the scale of the map, either 0 to 1 or −1 to +1. Three methods are offered per column: linear between two chosen values, linear between the 5th and 95th percentile of the column, and linguistic terms, in which triangular membership functions are centred on user-chosen values and the value is the weighted mean of the term positions. Centres are sorted before use, so the order in which they are typed does not matter.

**Model check.** The concepts with data start from the observed values of one row, the model is run to its settled state, and the result is compared with the observed values of a later row. The tool reports the mean absolute difference and the share of variables that change in the same direction in the model as in the data.

**Suggested weights.** For a time series, the update rule of the engine is fitted to consecutive rows for every concept that has data for itself and for all its causes. With transfer function f, steepness λ and delay L_ji on the relationship from j to i, the relative rule A_i(t+1) = f(λ(A_i(t) + Σ_j w_ji A_j(t − L_ji))) gives the linear regression

f⁻¹(A_i(t+1)) − A_i(t) = Σ_j w_ji A_j(t − L_ji),

and the absolute rule the same equation without A_i(t) on the left. The inverses follow the engine's transfer functions exactly: atanh(y)/λ for tanh, 2·atanh(y)/λ for the bipolar sigmoid 2/(1 + e^(−λx)) − 1, and y itself without squashing. Values at ±1 are pulled in to ±0.999. The trivalent function is a step and cannot be inverted, so no weights are suggested under it. A relationship of a concept with itself is fitted like any other. Only relationships that the experts drew are fitted, so the structure of the map is kept. The system is solved by least squares with a ridge of 10⁻⁹ times the largest diagonal element, which only steadies the arithmetic; when two causes move together so closely that they cannot be separated (a pivot below 10⁻⁶ of that element), the concept is skipped with that reason. A concept needs at least as many usable steps as relationships plus two, and a delay of L costs L steps at the start of the series. Fitted weights are clipped to −1..+1 and marked when clipped. R² is reported per concept, and the user chooses the share given to the data: w = (1 − s) w_expert + s w_data.

**The scale matters.** A weight describes the effect of one unit of the cause on the scale of the map. If each column is scaled to its own observed minimum and maximum (the default), the units differ from those the map was built in, and the suggested weights change with them. For suggested weights, set each column linear between fixed values that stand for the ends of the map's scale, and use the same scale (0..1 or −1..+1) as the map. Section U.21 shows the size of this effect.

**Reading R².** R² measures how much of the movement of the target the fit explains. A concept that hardly moves over the series has little movement to explain, so its R² can be low even when its weight is estimated well.

### U.21 Worked example: a peat meadow

The worked example is a small, illustrative peat meadow system. Its structure follows the usual account of drained peat meadows, but the weights and the data are invented for teaching and do not describe a real area. It is loaded with *Load the worked example* on the Backcasting tab and *Use the worked example data* in the Empirical data dialog.

**Today's map** has nine concepts. Two are drivers: the ditch water level (0.2, low) and a drainage subsidy (0.6). Drainage depth is lowered by the water level (−0.8), deepened by the subsidy (+0.5) and deepened to follow subsidence (+0.3). Drainage depth raises peat oxidation (+0.8), grass yield (+0.5) and lowers meadow birds (−0.6). Oxidation causes subsidence (+0.7, with a delay of two iterations) and greenhouse gas emissions (+0.8). Grass yield raises farm income (+0.7) and subsidence lowers it (−0.3).

**The vision** raises the ditch water level to 0.8, removes the drainage subsidy and the link from subsidence to drainage, strengthens the effect of drainage on meadow birds to −0.8, and adds two new drivers: wet crops (paludiculture, 0.6), which raise farm income (+0.5) and lower emissions (−0.3), and carbon payments (0.5), which raise farm income (+0.4).

**Backcasting result** (default settings: relative rule, tanh, λ = 1; beam width 3; at most 8 steps). The seven state concepts are the outcomes. Today's distance to the vision is D_0 = 1.571.

| Step | Step taken | Distance after | Share closed | Importance |
|---|---|---|---|---|
| 1 | Raise the ditch water level to 0.8 | 0.226 | 85.6% | 1.578 |
| 2 | Introduce wet crops | 0.169 | 89.3% | 0.197 |
| 3 | Introduce carbon payments | 0.006 | 99.6% | 0.162 |

Read backwards, the vision requires carbon payments, which require a farming system with wet crops, which in turn requires a raised water level. Phasing out the subsidy, cutting the subsidence link and strengthening the bird link are not needed: once the water level is high, each would reduce the distance by less than g (0.016). With every step taken together the distance is 0.000. With measures only (no structural steps), the water level is the only step, and 85.6% of the distance is closed; the remaining distance lies in farm income, which needs the new sources of income. The search used 50 runs, of which 2 did not settle.

**Empirical data.** The example table holds yearly observations from 2010 to 2022 for all nine concepts, in physical units (for example, drainage depth in cm below the surface, emissions in t CO2-eq per hectare per year). The data were generated from today's map (`tools/make_worked_example_data.mjs`): the system starts in its settled state in 2010, the ditch water level is raised step by step from 2011 to 2016, and the subsidy is halved in 2019. Each year is one iteration, and uniform observation noise of at most 0.01 on the map's scale is added. Because the true weights are known, the example tests whether the weight suggestion recovers them.

| Fuzzification | Largest error in a weight | Signs that agree |
|---|---|---|
| Each column linear between fixed bounds for −1 and +1 (signed scale) | 0.020 | 10 of 10 |
| Each column between its own minimum and maximum (the default) | 0.60 | 9 of 10 |

With fixed bounds every weight is recovered within 0.02, including the delayed relationship from peat oxidation to subsidence (0.716 against 0.700, on 10 rather than 12 steps). Its R² is only 0.09, because subsidence barely moves over the series: an example of a good estimate with a low R². With the default scaling, three weights reach the limit of ±1 and the effect of subsidence on drainage changes sign, although the data are the same.

The model check, starting in 2010 with the drivers at their 2022 values, gives the same direction of change as the data for 8 of 9 variables (89%) but a mean absolute difference of 1.13. The difference is expected: in 2022 the system is still in transition, while the model reports where it will settle.

### U.22 Verification

`npm test` runs every test file in the `tests` folder; a GitHub check runs it, together with a production build, on every pull request and on every change to the main branch. The tests that cover these two methods are:

- `test_backcasting.mjs`: matching, steps, application of steps and the search on a small map, and the edge cases in the last section of this file.
- `test_empirical_data.mjs`: reading tables, the three fuzzification methods, the model check, and recovery of known weights under tanh and the bipolar sigmoid, with a delay, with a relationship of a concept with itself, with collinear causes and under the trivalent function.
- `test_worked_examples.mjs`: the peat meadow example with the engine's own simulation, reproducing the numbers of section U.21.

---

## User Manual

### U.25 The worked example

**Backcasting.** On the Backcasting tab, *Load the worked example* adds two models to *Your models*: "Peat meadow today (worked example)", which opens, and "Peat meadow vision (worked example)", which is chosen as the vision. Click *Find the path* to run the example. The result should match the table in section U.21 of the Methodological Annex. The two models are ordinary models: change them to see how the path responds, or delete them in *Your models*.

**Empirical data.** With the peat meadow model open, open *Empirical data* and click *Use the worked example data*. The table is read, every column is matched to a concept, and each column is set linear between the fixed bounds of its unit on the −1..+1 scale. On *Suggest weights*, click *Suggest weights* to see how closely the data reproduce the weights of the map.

**Fixed bounds for suggested weights.** When you suggest weights from your own data, choose *Linear between two values* for every column and enter the values that stand for the ends of the map's scale, for example 20 and 80 cm for drainage depth. The default (each column between its own minimum and maximum) is fine for start values and for the direction of change, but it changes the size of suggested weights.

**New marks.** A suggested weight that the fit placed beyond −1..+1 is shown at the limit and marked *at the limit*. A link that differs between today and the vision only in its delay is offered as a step of its own: *Speed up the link* or *Slow down the link*.

---

## Development Log: defects found and fixed

| Defect | Fix |
|---|---|
| Suggested weights under the sigmoid transfer function used the inverse of the 0..1 logistic function, while the engine uses the bipolar sigmoid on −1..+1. Weights were wrong (in a test, 1.00 and −0.98 instead of 0.70 and −0.50). | The inverse is now 2·atanh(y)/λ, matching the engine. |
| Suggested weights ignored delays, so a delayed relationship was fitted against the wrong year. | A relationship with delay L is fitted against its source L steps earlier. |
| A relationship of a concept with itself was left out of the fit, although it is part of the update. | It is fitted with the other relationships. |
| The ridge term made the collinearity check unreachable, so causes that move together received arbitrary weights. | The ridge is scaled to the data and the check now skips such a concept with its reason. |
| Linguistic centres typed out of order gave no value. | Centres are sorted; fewer than two give no value. |
| Backcasting could pair a renamed concept with the wrong partner when a name match came before the identifier match. | Identifiers are matched for all concepts first, then names. |
| Backcasting did not see a change of delay, and a re-weighted link kept today's delay. | A delay-only change is a step of its own (*Speed up* or *Slow down the link*), and a changed link takes the vision's delay. |

Verification: all eleven test files pass (309 checks), the production build succeeds, and both worked examples were run in a browser at 1440 by 900 pixels with no errors in the console.
