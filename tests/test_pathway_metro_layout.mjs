// Tests for the metro-map layout of transition pathways.
// Run: node tests/test_pathway_metro_layout.mjs
import assert from "node:assert/strict";
import { buildMetroRows, orderAsTree, tippingStage, pickMetroPathways, niceTicks, commonPrefix, orderMetroPathways, metroSortValue } from "../src/pathwayMetroLayout.js";

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; console.log(`ok   ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${e.message}`); } };

// A stage: lever, intensity, cumulative intensity after it, and the outcome
// improvements (direction-signed) at its end.
const st = (leverId, u, ciiAfter, imp = { F: 0.1 }) => ({ leverId, u, ciiAfter, outcomes: Object.entries(imp).map(([id, improvement]) => ({ id, improvement })) });
const pw = (id, tog, stages, extra = {}) => ({ id, tog, cii: stages.length ? stages[stages.length - 1].ciiAfter : 0, stages, length: stages.length, converged: true, admissible: true, ...extra });

const A = st("A", 0.4, 0.4), B = st("B", 0.3, 0.7), C = st("C", 0.5, 1.2), D = st("D", 0.2, 0.9);
const p1 = pw(1, 0.9, [A, B, C]);
const p2 = pw(2, 0.8, [A, B, D]);
const p3 = pw(3, 0.6, [A, st("E", 0.3, 0.7)]);
const p4 = pw(4, 0.95, [st("E", 0.5, 0.5), st("A", 0.4, 0.9)]);
const p5 = pw(5, 0.5, [A]);

test("commonPrefix counts equal leading stages", () => {
  assert.equal(commonPrefix(p1, p2), 2);
  assert.equal(commonPrefix(p1, p3), 1);
  assert.equal(commonPrefix(p1, p4), 0);
});

test("stages with a different intensity are not shared", () => {
  assert.equal(commonPrefix(p1, pw(9, 0, [st("A", 0.5, 0.5)])), 0);
});

test("orderAsTree keeps branches together and orders by best gain", () => {
  const ids = orderAsTree([p3, p2, p5, p4, p1]).map((p) => p.id);
  // E-opening has the best gain (0.95) so it comes first; within A, the
  // pathway that ends at A comes before the ones that go on.
  assert.deepEqual(ids, [4, 5, 1, 2, 3]);
});

test("rows draw only the stages after the shared part", () => {
  const rows = buildMetroRows([p1, p2, p3]);
  const r2 = rows.find((r) => r.id === 2);
  assert.equal(r2.shared, 2);
  assert.equal(r2.segments.length, 1);
  assert.equal(r2.segments[0].leverId, "D");
  assert.equal(r2.branchX, 0.7);
  assert.equal(rows[r2.parent].id, 1);
});

test("a branch connects to a row that is drawn at the branching point", () => {
  const rows = buildMetroRows([p1, p2, p3]);
  const r3 = rows.find((r) => r.id === 3);
  assert.equal(r3.shared, 1);
  // Row 2 shares A but starts drawing at 0.7, so the transfer goes to row 1.
  assert.equal(rows[r3.parent].id, 1);
  assert.equal(r3.branchX, 0.4);
});

test("transfer stations sit at every stage change", () => {
  const rows = buildMetroRows([p1]);
  assert.deepEqual(rows[0].stations.map((s) => s.x), [0.4, 0.7]);
  assert.equal(rows[0].end, 1.2);
  assert.equal(rows[0].parent, null);
});

test("tippingStage finds the first stage with a worsened outcome", () => {
  const p = pw(7, 0.2, [st("A", 0.4, 0.4, { F: 0.1 }), st("B", 0.3, 0.7, { F: -0.2, G: 0.3 }), st("C", 0.2, 0.9, { F: -0.3 })]);
  assert.deepEqual(tippingStage(p), { stage: 1, outcomeIds: ["F"] });
  const row = buildMetroRows([p])[0];
  assert.equal(row.tipping.x, 0.7);
  assert.deepEqual(row.segments.map((s) => s.afterTipping), [false, false, true]);
  assert.equal(tippingStage(p1), null);
});

test("pickMetroPathways respects the mode and adds the selected pathway", () => {
  const cands = [p1, p2, p3, { ...p4, admissible: false }, pw(8, 0, [], { converged: true })];
  assert.deepEqual(pickMetroPathways(cands, { mode: "top", limit: 2 }).map((p) => p.id), [4, 1]);
  assert.deepEqual(pickMetroPathways(cands, { mode: "admissible", limit: 2 }).map((p) => p.id), [1, 2]);
  assert.deepEqual(pickMetroPathways(cands, { mode: "top", limit: 1, selectedId: 3 }).map((p) => p.id), [4, 3]);
  assert.ok(!pickMetroPathways(cands, { mode: "top", limit: 10 }).some((p) => p.length === 0));
  const ranked = { hi: [p1, p2], ef: [p2, p3] };
  assert.deepEqual(pickMetroPathways(cands, { mode: "archetypes", ranked }).map((p) => p.id), [1, 2, 3]);
});

test("niceTicks covers the maximum from zero", () => {
  const t = niceTicks(1.23);
  assert.equal(t[0], 0);
  assert.ok(t[t.length - 1] >= 1.23);
  assert.deepEqual(niceTicks(0), [0, 0.2, 0.4, 0.6, 0.8, 1]);
});

test("sorting by a value draws every pathway in full", () => {
  const rows = buildMetroRows([p1, p2, p3], { sortKey: "tog" });
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
  assert.ok(rows.every((r) => r.shared === 0 && r.parent === null));
  assert.equal(rows[1].segments.length, 3);
});

test("sorting by intensity and by an outcome follows the chosen direction", () => {
  assert.deepEqual(orderMetroPathways([p1, p3, p5], "cii", "asc").map((p) => p.id), [5, 3, 1]);
  const q1 = pw(11, 0.5, [st("A", 0.4, 0.4, { F: 0.3, G: -0.1 })]);
  const q2 = pw(12, 0.6, [st("B", 0.4, 0.4, { F: 0.1, G: 0.2 })]);
  assert.equal(metroSortValue(q1, "outcome:G"), -0.1);
  assert.deepEqual(orderMetroPathways([q1, q2], "outcome:F", "desc").map((p) => p.id), [11, 12]);
  assert.deepEqual(orderMetroPathways([q1, q2], "outcome:F", "asc").map((p) => p.id), [12, 11]);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
