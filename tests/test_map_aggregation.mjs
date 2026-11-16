// Tests for src/mapAggregation.js: concept matching, the three averaging
// rules, credibility weights, thresholds, merges and the pairwise comparison.
// Run: node tests/test_map_aggregation.mjs
import { normalizeConceptName, matchConcepts, aggregateMaps, compareMaps } from "../src/mapAggregation.js";

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) passed += 1; else { failed += 1; console.error("FAIL:", msg); } };
const near = (a, b, msg) => ok(Math.abs(a - b) < 1e-3, `${msg} (got ${a}, expected ${b})`);

const c = (id, name, extra = {}) => ({ id, name, category: "", description: "", initialValue: 0, position: { x: 0, y: 0 }, ...extra });
const e = (source, target, weight, extra = {}) => ({ id: `${source}${target}`, source, target, weight, ...extra });

// A: rain -> crops 0.8, crops -> income 0.6
// B: Rain -> Crops 0.4, crops -> income -0.2, pests -> crops -0.5
// C: rain, income only; no link
const A = { name: "A", concepts: [c("r", "Rain", { initialValue: 0.5 }), c("k", "Crops"), c("i", "Income")], edges: [e("r", "k", 0.8), e("k", "i", 0.6)] };
const B = { name: "B", concepts: [c("x", " rain. ", { initialValue: 0.1 }), c("y", "CROPS"), c("z", "income"), c("p", "Pests")], edges: [e("x", "y", 0.4), e("y", "z", -0.2), e("p", "y", -0.5, { lag: 2 })] };
const C = { name: "C", concepts: [c("a", "Rain"), c("b", "Income")], edges: [] };

ok(normalizeConceptName("  Soil  Moisture. ") === "soil moisture", "names are normalised");
const m = matchConcepts([A, B, C]);
ok(m.groups.length === 4, "four concepts after matching");
ok(m.groups.find((g) => g.key === "rain").mapIndexes.length === 3, "rain is in all three maps");

const w = (res, from, to) => {
  const id = (n) => res.concepts.find((x) => x.name === n).id;
  return res.edges.find((x) => x.source === id(from) && x.target === id(to))?.weight;
};

// rule all: every map counts, absent = 0
let r = aggregateMaps([A, B, C], { rule: "all" });
near(w(r, "Rain", "Crops"), (0.8 + 0.4 + 0) / 3, "all: rain->crops");
near(w(r, "Crops", "Income"), (0.6 - 0.2 + 0) / 3, "all: crops->income");
near(w(r, "Pests", "Crops"), -0.5 / 3, "all: pests->crops");
ok(r.report.conflicts.length === 1, "one sign conflict (crops->income)");
ok(r.edges.find((x) => x.lag === 2), "lag carried over");
near(r.concepts.find((x) => x.name === "Rain").initialValue, 0.2, "start value averaged over maps that have the concept");

// rule both: only maps with both concepts; C has rain but not crops
r = aggregateMaps([A, B, C], { rule: "both" });
near(w(r, "Rain", "Crops"), 0.6, "both: rain->crops over A and B");
near(w(r, "Pests", "Crops"), -0.5, "both: pests->crops over B only");

// rule present
r = aggregateMaps([A, B, C], { rule: "present" });
near(w(r, "Crops", "Income"), 0.2, "present: crops->income");

// credibility
r = aggregateMaps([{ ...A, credibility: 3 }, { ...B, credibility: 1 }], { rule: "present" });
near(w(r, "Rain", "Crops"), (3 * 0.8 + 0.4) / 4, "credibility-weighted mean");

// thresholds
r = aggregateMaps([A, B, C], { rule: "all", minMaps: 2 });
ok(r.edges.length === 2 && r.report.dropped.fewMaps === 1, "minMaps drops pests->crops");
r = aggregateMaps([A, B, C], { rule: "all", minAbsWeight: 0.2 });
ok(r.edges.length === 1, `minAbsWeight keeps only rain->crops (got ${r.edges.length})`);

// merges: Pests same as Crops -> pests->crops becomes a self-loop and is dropped
r = aggregateMaps([A, B], { merges: { pests: "crops" } });
ok(r.concepts.length === 3 && r.report.selfLoops === 1, "merge folds pests into crops");

// comparison
const p = compareMaps([A, B]);
near(p[0].concepts, 3 / 4, "concept Jaccard");
near(p[0].relationships, 2 / 3, "relationship Jaccard");
near(p[0].signAgreement, 0.5, "sign agreement");
near(p[0].weightDiff, (0.4 + 0.8) / 2, "weight difference over common concepts");

// positions do not stack
r = aggregateMaps([A, B, C]);
const pos = r.concepts.map((x) => `${x.position.x},${x.position.y}`);
ok(new Set(pos).size === pos.length, "every concept gets its own position");

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
