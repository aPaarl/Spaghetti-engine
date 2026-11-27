// Tests for src/empiricalData.js: reading tables, matching, the three
// fuzzification methods, the comparison with the model and the recovery of
// known weights from a generated time series.
// Run: node tests/test_empirical_data.mjs
import { parseTable, matchColumns, fuzzify, fuzzifyValue, quantile, compareWithModel, suggestWeights, blendWeight } from "../src/empiricalData.js";

let passed = 0, failed = 0;
const ok = (cond, msg) => { if (cond) passed += 1; else { failed += 1; console.error("FAIL:", msg); } };
const near = (a, b, msg, tol = 1e-3) => ok(Math.abs(a - b) < tol, `${msg} (got ${a}, expected ${b})`);

// reading: semicolons, decimal commas, a year column, a missing value
const t = parseTable("Year;Groundwater level;Grass yield\n2020;-0,40;8,1\n2021;-0,35;n/a\n2022;-0,30;7,5\n");
ok(t.labelName === "Year" && t.labels.join() === "2020,2021,2022", "year column becomes the row labels");
ok(t.columns.length === 2 && t.columns[0].values[1] === -0.35, "decimal comma read");
ok(Number.isNaN(t.columns[1].values[1]), "n/a read as missing");
const t2 = parseTable("a,b\n1,2\n3,4");
ok(t2.columns.length === 2 && t2.labels.join() === "1,2", "no label column: rows numbered");
const t3 = parseTable("Year\tX\n2020\t1,234.5\n2021\t2,000");
near(t3.columns[0].values[0], 1234.5, "thousands comma");
let threw = false; try { parseTable("only a header"); } catch { threw = true; }
ok(threw, "a table without rows is refused");

// matching
const concepts = [{ id: "g", name: "Groundwater level", initialValue: 0 }, { id: "y", name: "Grass yield", initialValue: 0.5 }];
const m = matchColumns(t.columns, concepts);
ok(m[0] === "g" && m[1] === "y", "columns matched by name");

// fuzzifying
const xs = [0, 5, 10];
near(fuzzify(xs, { method: "minmax", low: 0, high: 10 })[1].value, 0.5, "minmax middle");
near(fuzzify(xs, { method: "minmax", low: 0, high: 10 }, "signed")[0].value, -1, "signed scale");
near(fuzzify(xs, { method: "minmax", low: 0, high: 10, reverse: true })[0].value, 1, "reversed");
near(fuzzify([20], { method: "minmax", low: 0, high: 10 })[0].value, 1, "clipped above");
near(quantile([1, 2, 3, 4, 5], 0.5), 3, "median");
const ling = { method: "linguistic", centers: [0, 10, 20] };
near(fuzzifyValue(5, ling).value, 0.25, "linguistic halfway low-medium");
ok(fuzzifyValue(12, ling).term === "medium", "linguistic term");
near(fuzzifyValue(25, ling).value, 1, "linguistic above the last centre");
ok(Number.isNaN(fuzzify([NaN], ling)[0].value), "missing stays missing");

// recovering weights: A -> C (0.6), B -> C (-0.4), relative rule, tanh
const settings = { squashFunction: "tanh", lambda: 1, updateRule: "relative" };
const T = 12;
const A = Array.from({ length: T }, (_, k) => 0.2 + 0.05 * k);
const B = Array.from({ length: T }, (_, k) => 0.6 - 0.03 * k + 0.02 * Math.sin(k));
const C = [0.1];
for (let k = 0; k + 1 < T; k++) C.push(Math.tanh(C[k] + 0.6 * A[k] - 0.4 * B[k]));
const fuzzy = { a: A, b: B, c: C };
const cs = [{ id: "a", name: "A", initialValue: 0 }, { id: "b", name: "B", initialValue: 0 }, { id: "c", name: "C", initialValue: 0 }];
const es = [{ id: "ac", source: "a", target: "c", weight: 0.5 }, { id: "bc", source: "b", target: "c", weight: 0.3 }];
const sw = suggestWeights(fuzzy, cs, es, settings);
near(sw.results.find((r) => r.edgeId === "ac").data, 0.6, "weight A->C recovered", 0.02);
near(sw.results.find((r) => r.edgeId === "bc").data, -0.4, "weight B->C recovered", 0.02);
ok(sw.results.find((r) => r.edgeId === "bc").signAgrees === false, "sign conflict with the expert flagged");
ok(sw.results[0].r2 > 0.99, "fit explains the generated series");
const few = suggestWeights({ a: A.slice(0, 3), b: B.slice(0, 3), c: C.slice(0, 3) }, cs, es, settings);
ok(few.results.length === 0 && few.skipped.length === 1, "too few steps: skipped with a reason");
near(blendWeight(0.5, 0.6, 0.5), 0.55, "blend");

// comparing with the model: a stub simulation that returns the start values
const cmp = compareWithModel({ g: [0.2, 0.4], y: [0.5, 0.7] }, concepts, (start) => ({ final: { g: start.g + 0.1, y: start.y - 0.1 }, converged: true }), 0, 1);
near(cmp.mae, (0.1 + 0.3) / 2, "mean absolute difference");
ok(cmp.rows.find((r) => r.id === "g").direction === true && cmp.rows.find((r) => r.id === "y").direction === false, "direction of change compared");

// ---- edge cases (added with the worked example) ------------------------------------------------------------
{
  const wave = (k) => 0.4 * Math.sin(0.9 * k) + 0.2 * Math.cos(2.1 * k);
  const N = 16;
  const A2 = Array.from({ length: N }, (_, k) => wave(k));
  const B2 = Array.from({ length: N }, (_, k) => 0.3 * Math.cos(1.3 * k + 0.5));
  const cs2 = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  // the engine's sigmoid is bipolar: 2 / (1 + e^(-λx)) - 1
  const sig = (x) => 2 / (1 + Math.exp(-x)) - 1;
  const Cs = [0.1];
  for (let k = 0; k + 1 < N; k++) Cs.push(sig(Cs[k] + 0.7 * A2[k] - 0.5 * B2[k]));
  const s1 = suggestWeights({ a: A2, b: B2, c: Cs }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5 }, { id: "bc", source: "b", target: "c", weight: -0.5 }], { squashFunction: "sigmoid", lambda: 1, updateRule: "relative" });
  near(s1.results.find((r) => r.edgeId === "ac").data, 0.7, "sigmoid: weight recovered with the bipolar inverse", 0.01);
  near(s1.results.find((r) => r.edgeId === "bc").data, -0.5, "sigmoid: second weight recovered", 0.01);
  // a delayed relationship is fitted against the source value it acts on
  const Cl = [0, 0, 0.05];
  for (let k = 2; k + 1 < N; k++) Cl.push(Math.tanh(Cl[k] + 0.6 * A2[k - 2]));
  const lagged = suggestWeights({ a: A2, c: Cl }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5, lag: 2 }], settings).results[0];
  near(lagged.data, 0.6, "a lag-2 relationship is recovered with its delay", 0.01);
  ok(lagged.n === N - 3, "a lag-2 relationship loses two steps at the start");
  const unlagged = suggestWeights({ a: A2, c: Cl }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5 }], settings).results[0];
  ok(Math.abs(unlagged.data - 0.6) > 0.1, `without the delay the same data give a wrong weight (${unlagged.data})`);
  // a relationship of a concept with itself is fitted with the others, absolute rule
  const Ca = [0.2];
  for (let k = 0; k + 1 < N; k++) Ca.push(Math.tanh(-0.4 * Ca[k] + 0.8 * A2[k]));
  const self = suggestWeights({ a: A2, c: Ca }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5 }, { id: "cc", source: "c", target: "c", weight: -0.2 }], { ...settings, updateRule: "absolute" });
  near(self.results.find((r) => r.edgeId === "cc").data, -0.4, "a self-relationship is fitted", 0.01);
  near(self.results.find((r) => r.edgeId === "ac").data, 0.8, "and the other weight with it", 0.01);
  // two causes that move together cannot be told apart
  const col = suggestWeights({ a: A2, b: A2.map((v) => 2 * v), c: Cs }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5 }, { id: "bc", source: "b", target: "c", weight: 0.5 }], settings);
  ok(col.results.length === 0 && /move together/.test(col.skipped[0]?.reason || ""), "collinear causes are skipped with a reason");
  // the trivalent function cannot be inverted
  const tri = suggestWeights({ a: A2, c: Cs }, cs2, [{ id: "ac", source: "a", target: "c", weight: 0.5 }], { squashFunction: "trivalent" });
  ok(tri.results.length === 0 && /trivalent/.test(tri.unsupported || ""), "trivalent: not fitted, with the reason");
  // linguistic centres typed out of order give the same result as in order
  near(fuzzifyValue(5, { method: "linguistic", centers: [20, 0, 10] }).value, 0.25, "linguistic centres are sorted first");
  ok(Number.isNaN(fuzzifyValue(5, { method: "linguistic", centers: [3] }).value), "one centre is not enough for terms");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
