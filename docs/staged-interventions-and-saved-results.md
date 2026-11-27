# Staged interventions and saved results

This file holds the text for the next documentation release, together with `docs/backcasting-and-empirical-data.md`. The Methodological Annex receives section U.23, the User Manual sections U.26 and U.27, and the Development Log the rows at the end. The behaviour described here is checked by `tests/test_staged_interventions.cjs`.

---

## Methodological Annex

### U.23 Staged interventions

**Motivation.** Until this version a scenario held each of its measures (a concept pushed up, pushed down or held at a value) from the first iteration to the last. A transition, however, usually introduces measures one after another, phases them in, or applies them for a limited period. A staged intervention gives each held concept three optional whole numbers:

| Setting | Meaning | Default |
|---|---|---|
| Start s | The first iteration in which the concept is held | 0 |
| Duration d | The number of iterations for which it is held; 0 means until the end of the run | 0 |
| Ramp r | The number of iterations over which it moves to its held value; 0 or 1 means at once | 0 |

**Update.** Let a be the held value of concept i, and v the value of i in iteration s − 1 (its starting value in the model when s = 0). In iteration t,

- for t < s, and for t ≥ s + d when d > 0, the concept is not held and follows the update rule like any other concept;
- for s ≤ t < s + d (or t ≥ s when d = 0), it is held at v + (a − v) · min(t − s + 1, r) / r when r > 1, and at a otherwise.

A concept with a timing starts from its own starting value in the model, not from the scenario's starting value, so that it does not act before its start. Relationship delays (section U.15) apply as before: a measure introduced in iteration s reaches a concept at the end of a relationship with delay L in iteration s + L + 1.

**Convergence.** A run cannot be called settled while a timed measure is still to change. The test of section U.15 (the largest change below the threshold for L_max + 1 iterations in a row) is counted only from the iteration after the last change, max(s + r − 1, s + d). A measure that changes at or after the iteration cap leaves the run unsettled, and the interface warns about it.

**Effect on results.** A measure that is held to the end of the run ends, in a model with a unique fixed point, in the same settled state whatever its start or ramp: timing changes the path and the time to settle, not the destination. A measure with a duration is released, after which the concept follows the map again. With the absolute update rule and no causes, a released concept returns to zero at once; with the relative rule it fades gradually. A temporary measure therefore leaves a lasting effect only where the map has feedback that sustains it, which is the question a pulse experiment answers.

**Interpretation.** Iterations are steps of the model and have no calendar meaning (section U.15). Starts and ramps express order and pace relative to the other measures, such as "the subsidy is phased out after the water level has been raised", not dates. Models without timings, and model files of earlier versions, give exactly the same results as before.

**Scope.** Timing applies wherever a scenario is simulated: Scenarios & Simulation, Monte Carlo, and the scenarios that the Sensitivity and Transition Point analyses start from. The concept that a Sensitivity or Transition Point analysis sweeps is held for the whole run, whatever its timing in that scenario. The Transition Pathways and Backcasting searches build their own sequences of steps and do not use scenario timings.

---

## User Manual

### U.26 Timing of the measures

With *Advanced tools* switched on, a scenario that holds one or more concepts shows *Timing of the measures* below its list of changes. For each measure, enter:

- **Starts in iteration**: when the measure begins (0 = from the start).
- **Held for**: for how many iterations it is held (0 = until the end).
- **Phased in over**: over how many iterations it moves step by step to its value (0 = at once).

The change then reads, for example, "Drainage subsidy ▼ pushed down, from iteration 20, phased in over 10". Leave all three at 0 for the usual behaviour. The timing is saved in the model file (JSON, field `timing` of the scenario) and listed in the *Scenarios Summary* sheet of the Analysis Workbook. If a measure changes at or after the maximum number of iterations, raise that maximum in the simulation settings, or the run cannot settle.

Use the iteration plot on the Scenarios tab to see the effect of a timing. A later start or a slower ramp delays the change; a measure that is held to the end reaches the same end state as one without timing.

### U.27 Results are kept

The results of Baseline Equilibrium, Scenarios & Simulation, Sensitivity, Monte Carlo, Transition Point Analysis and Transition Pathways are now kept with each model in this browser. After a reload, or after opening another model and coming back, the last results are shown again, together with the scenarios that were compared. If the model, its settings or its scenarios changed after a result was computed, the result comes back with the usual notice that the model has changed since the analysis was run; run it again to refresh it. The Backcasting result is not yet kept.

Results are stored in the browser's own database (IndexedDB), separately from the models, and only in this browser. Deleting a model deletes its results. In a private window, or with site data blocked, results are not kept, and the tool works as before.

---

## Development Log

| Change | Detail |
|---|---|
| Staged interventions | `scenario.timing[conceptId] = { start, duration, ramp }`, read by `simulate()`; cleaned on import (whole numbers from 0 to 500, only for held concepts, empty timings dropped). |
| Saved results | `src/resultStore.js` keeps the last result of six analyses per model in IndexedDB. Each result is stamped with the model and scenario signature it was computed on; a mismatch on restore marks it as out of date. |
| Out-of-date check | The signature of the Scenarios comparison now includes the scenarios' timings. |

Verification: all twelve test files pass (335 checks), the production build succeeds, and in a browser a baseline result and a scenario comparison with a timed measure were restored after a reload; a model changed while closed brought its result back marked as out of date. No errors appeared in the console.
