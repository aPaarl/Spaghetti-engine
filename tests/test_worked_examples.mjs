// The worked examples of backcasting and empirical data (src/workedExamples.js), run with the real engine.
// Run from the project folder:  node tests/test_worked_examples.mjs
//
// These are the numbers the Methodological Annex reports for the peat meadow example (docs/backcasting-and-
// empirical-data.md). If a change to the engine moves them, this test fails, and the annex must be updated with it.
import { createRequire } from "node:module";
import { PEAT_TODAY, PEAT_VISION, PEAT_DATA_CSV, PEAT_UNITS } from "../src/workedExamples.js";
import { backcast, compareSystems, driversOf } from "../src/backcasting.js";
import { parseTable, matchColumns, fuzzifiedTable, defaultSpec, suggestWeights, compareWithModel } from "../src/empiricalData.js";
const engine = createRequire(import.meta.url)("./engine.cjs");

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed += 1; console.log("PASS " + m); } else { failed += 1; console.log("FAIL " + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, expected ${b} ± ${tol})`);
const S = engine.DEFAULT_SETTINGS;
const held = (m) => { const d = driversOf(m); return { id: "held", initialOverrides: d, lockedConcepts: d, weightOverrides: {} }; };

// ---- the two maps are valid models ----------------------------------------------------------------------------------------
for (const [name, m] of [["today", PEAT_TODAY], ["vision", PEAT_VISION]]) {
  const clean = engine.sanitizeModel({ ...m, scenarios: [], settings: S });
  ok(clean && clean.fixes.length === 0, `the ${name} map passes the import check without repairs`);
  ok(engine.simulate(m.concepts, m.edges, held(m), S).converged, `the ${name} map settles with its drivers held`);
}

// ---- backcasting -----------------------------------------------------------------------------------------------------------
const diff = compareSystems(PEAT_TODAY, PEAT_VISION);
ok(diff.newConcepts.map((c) => c.id).sort().join() === "cp,pc", "new in the vision: wet crops and carbon payments");
ok(diff.removedConcepts.map((c) => c.id).join() === "sub", "gone in the vision: the drainage subsidy");
ok(diff.edgeChanges.some((x) => x.kind === "reweight" && x.source === "dd" && x.target === "mb" && x.to === -0.8), "drainage → meadow birds strengthened");
ok(diff.edgeChanges.some((x) => x.kind === "remove" && x.source === "ls" && x.target === "dd"), "drainage no longer follows subsidence");

const res = backcast(PEAT_TODAY, PEAT_VISION, engine.simulate, S, {});
ok(res.visionConverged && res.currentConverged, "both maps settle");
ok(res.outcomes.slice().sort().join() === "dd,fi,gh,gy,ls,mb,po", "the seven state concepts are the outcomes");
near(res.gapStart, 1.5706, 1e-4, "distance from today to the vision");
ok(res.steps.map((s) => s.move.id).join() === "lever:wl,intro:pc,intro:cp", "path: raise the water level, then wet crops, then carbon payments");
near(res.steps[0].closed, 0.856, 1e-3, "raising the water level alone closes 86% of the distance");
near(res.closed, 0.996, 1e-3, "the three steps close 99.6%");
ok(res.unused.some((m) => m.id === "phase:sub"), "phasing out the subsidy is not needed once the water level is raised");
ok(res.steps.every((s) => s.importance > 0), "every step of the path matters (leaving it out widens the gap)");
ok(res.gapAllSteps <= res.gapEnd, "taking every step closes at least as much as the path");
const lev = backcast(PEAT_TODAY, PEAT_VISION, engine.simulate, S, { structural: false });
ok(lev.steps.length === 1 && lev.closed < res.closed, "with measures only, the water level is the one step and less is closed");

// ---- empirical data --------------------------------------------------------------------------------------------------------
const table = parseTable(PEAT_DATA_CSV);
ok(table.labels.length === 13 && table.columns.length === 9, "13 years, 9 variables");
const mapping = matchColumns(table.columns, PEAT_TODAY.concepts);
ok(Object.values(mapping).every(Boolean), "every column is matched to a concept by name");
const fixedSpecs = Object.fromEntries(table.columns.map((c, i) => { const [low, high] = PEAT_UNITS[mapping[i]].range; return [i, { method: "minmax", low, high, reverse: false }]; }));
const fuzzy = fuzzifiedTable(table, mapping, fixedSpecs, "signed");
const sw = suggestWeights(fuzzy, PEAT_TODAY.concepts, PEAT_TODAY.edges, S);
ok(sw.results.length === PEAT_TODAY.edges.length && !sw.skipped.length, "every relationship can be fitted");
const worst = Math.max(...sw.results.map((r) => Math.abs(r.data - r.expert)));
ok(worst < 0.05, `with fixed bounds the weights the data were made with are recovered (largest error ${worst.toFixed(3)})`);
ok(sw.results.every((r) => r.signAgrees), "every sign agrees");
const pols = sw.results.find((r) => r.source === "po" && r.target === "ls");
ok(pols.n === 10, "the delayed relationship (lag 2) has two usable years fewer");
// the default (each column between its own minimum and maximum) changes the scale, and so the weights
const defaultSpecs = Object.fromEntries(table.columns.map((c, i) => [i, defaultSpec(c.values)]));
const swDefault = suggestWeights(fuzzifiedTable(table, mapping, defaultSpecs, "signed"), PEAT_TODAY.concepts, PEAT_TODAY.edges, S);
const worstDefault = Math.max(...swDefault.results.map((r) => Math.abs(r.data - r.expert)));
ok(worstDefault > 0.3, `with each column scaled to its own range the weights are not recovered (largest error ${worstDefault.toFixed(2)})`);
// the model check: start in 2010, with the drivers as observed in 2022
const last = table.labels.length - 1;
const cmp = compareWithModel(fuzzy, PEAT_TODAY.concepts, (start) => {
  const locks = { wl: fuzzy.wl[last], sub: fuzzy.sub[last] };
  return engine.simulate(PEAT_TODAY.concepts, PEAT_TODAY.edges, { initialOverrides: { ...start, ...locks }, lockedConcepts: locks, weightOverrides: {} }, S);
}, 0, last);
ok(cmp.converged && cmp.rows.length === 9, "the model check runs on all nine variables");
ok(cmp.directionAgreement >= 0.8, `the model moves the same way as the data for most variables (${Math.round(cmp.directionAgreement * 100)}%)`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
