// Tests for src/backcasting.js: comparing the two maps, building the steps,
// applying them, and the search closing the gap to the vision.
// Run: node tests/test_backcasting.mjs
import { compareSystems, buildMoves, applyMoves, gapOf, backcast } from "../src/backcasting.js";

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed += 1; else { failed += 1; console.error("FAIL:", m); } };

// a small FCM simulation: relative rule, tanh, synchronous, locks held
function simulate(concepts, edges, scenario) {
  const ids = concepts.map((c) => c.id);
  const lock = scenario?.lockedConcepts || {};
  let a = Object.fromEntries(concepts.map((c) => [c.id, lock[c.id] ?? scenario?.initialOverrides?.[c.id] ?? c.initialValue ?? 0]));
  let converged = false;
  for (let t = 0; t < 200; t++) {
    const n = {};
    ids.forEach((id) => {
      if (lock[id] !== undefined) { n[id] = lock[id]; return; }
      const s = edges.filter((e) => e.target === id && a[e.source] !== undefined).reduce((x, e) => x + e.weight * a[e.source], 0);
      n[id] = Math.tanh(a[id] + s);
    });
    const d = Math.max(...ids.map((id) => Math.abs(n[id] - a[id])));
    a = n;
    if (d < 1e-6) { converged = true; break; }
  }
  return { final: a, converged };
}

const c = (id, name, v = 0) => ({ id, name, initialValue: v });
const e = (s, t, w) => ({ id: `${s}${t}`, source: s, target: t, weight: w });

// Today: drainage (D, a driver at 0.8) lowers water (W), water raises birds (B).
// Vision: drainage at 0.1, a new concept Cooperative (K, 0.6) that raises water,
// and the link water -> birds strengthened.
const current = { concepts: [c("D", "Drainage", 0.8), c("W", "Water", 0), c("B", "Birds", 0), c("X", "Old subsidy", 0.5)], edges: [e("D", "W", -0.7), e("W", "B", 0.4), e("X", "D", 0.2)] };
const vision = { concepts: [c("D", "Drainage", 0.1), c("W", "Water", 0), c("B", "Birds", 0), c("K", "Cooperative", 0.6)], edges: [e("D", "W", -0.7), e("W", "B", 0.8), e("K", "W", 0.5)] };

const diff = compareSystems(current, vision);
ok(diff.pairs.length === 3, "three concepts matched");
ok(diff.newConcepts.length === 1 && diff.newConcepts[0].id === "K", "Cooperative is new");
ok(diff.removedConcepts.length === 1 && diff.removedConcepts[0].id === "X", "Old subsidy is phased out");
ok(diff.edgeChanges.some((x) => x.kind === "reweight" && x.source === "W"), "water -> birds re-weighted");
ok(diff.edgeChanges.some((x) => x.kind === "remove" && x.source === "X"), "subsidy link removed");

const moves = buildMoves(current, vision, diff, {});
ok(moves.some((m) => m.type === "lever" && m.concept === "D" && m.level === 0.1), "lever: drainage to 0.1");
ok(moves.some((m) => m.type === "introduce"), "introduce the cooperative");
ok(!moves.some((m) => m.type === "edge" && m.change.source === "K"), "links of a new concept come with it");

const all = applyMoves(current, vision, diff, moves);
ok(all.concepts.some((x) => x.id === "K") && !all.concepts.some((x) => x.id === "X"), "all steps: concept added and removed");
ok(all.edges.some((x) => x.source === "K" && x.target === "W"), "the cooperative's link is added");
ok(all.edges.find((x) => x.source === "W").weight === 0.8, "re-weighted link");

ok(gapOf({ a: 0.5, b: 0 }, { a: 1, b: 0 }, {}) === 0.25, "gap is the mean absolute distance");

const res = backcast(current, vision, simulate, {}, { maxSteps: 5, beam: 3 });
ok(res.gapEnd < res.gapStart, `the path closes part of the gap (${res.gapStart} -> ${res.gapEnd})`);
ok(res.closed > 0.9, `most of the gap is closed (${res.closed})`);
ok(res.steps.length >= 2, "more than one step is needed");
ok(res.steps.every((s, i) => i === 0 || s.gapAfter <= res.steps[i - 1].gapAfter), "every step brings the vision closer");
ok(res.steps.every((s) => s.importance >= 0), "importance is a loss when a step is left out");
ok(res.outcomes.includes("B") && res.outcomes.includes("W"), "water and birds are outcomes by default");

// with only levers allowed the structural gap remains
const lev = backcast(current, vision, simulate, {}, { structural: false });
ok(lev.gapEnd > res.gapEnd, "without structural change less of the gap is closed");

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
