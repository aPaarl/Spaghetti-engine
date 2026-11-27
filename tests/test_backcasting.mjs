// Tests for src/backcasting.js: comparing the two maps, building the steps,
// applying them, and the search closing the gap to the vision.
// Run: node tests/test_backcasting.mjs
import { compareSystems, buildMoves, applyMoves, gapOf, backcast, backcastMetroCandidates } from "../src/backcasting.js";
import { metroRows } from "../src/pathwayMetroLayout.js";

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

// ---- edge cases (added with the worked example) ------------------------------------------------------------
{
  // matching by id comes before matching by name: today's "P" (id p1) is renamed "Q" in the
  // vision, and a separate today concept named "Q" (id q1) must not take it by name
  const cur = { concepts: [c("q1", "Q"), c("p1", "P")], edges: [] };
  const vis = { concepts: [c("p1", "Q"), c("q9", "Q old")], edges: [] };
  const d = compareSystems(cur, vis);
  ok(d.pairs.length === 1 && d.pairs[0].cur.id === "p1" && d.pairs[0].vis.id === "p1" && d.removedConcepts[0]?.id === "q1", "ids are matched before names");
}
{
  // a concept kept in the copy but renamed stays the same concept; a vision concept that only shares
  // a name with an already paired concept is new, and the steps never produce two concepts with one id
  const cur = { concepts: [c("a", "Alpha", 0.5), c("b", "Beta"), c("x", "Old thing")], edges: [e("a", "b", 0.5)] };
  const vis = { concepts: [c("a", "Alpha", 0.5), c("b", "Beta"), c("x", "Brand new", 0.4), c("y", "Old thing")], edges: [e("a", "b", 0.5), { id: "xb", source: "x", target: "b", weight: 0.3 }] };
  const d = compareSystems(cur, vis);
  ok(d.pairs.find((p) => p.cur.id === "x")?.vis.name === "Brand new" && d.newConcepts.map((k) => k.id).join() === "y", "a renamed concept is matched by its id");
  const applied = applyMoves(cur, vis, d, buildMoves(cur, vis, d, {}));
  ok(new Set(applied.concepts.map((k) => k.id)).size === applied.concepts.length, "after all steps every id is unique");
}
{
  // a change in delay only is a step of its own, and applying it sets the delay
  const cur = { concepts: [c("a", "A", 0.6), c("b", "B")], edges: [{ ...e("a", "b", 0.5), lag: 3 }] };
  const vis = { concepts: [c("a", "A", 0.6), c("b", "B")], edges: [e("a", "b", 0.5)] };
  const d = compareSystems(cur, vis);
  ok(d.edgeChanges.length === 1 && d.edgeChanges[0].kind === "delay" && d.edgeChanges[0].fromLag === 3 && d.edgeChanges[0].lag === 0, "a delay-only change is found");
  const mv = buildMoves(cur, vis, d, {});
  ok(mv.length === 1 && /Speed up/.test(mv[0].label), "and offered as speeding up the link");
  ok(applyMoves(cur, vis, d, mv).edges[0].lag === 0, "applying it removes the delay");
  const rw = compareSystems({ concepts: cur.concepts, edges: [e("a", "b", 0.5)] }, { concepts: vis.concepts, edges: [{ ...e("a", "b", 0.8), lag: 2 }] });
  ok(applyMoves(cur, vis, rw, buildMoves(cur, vis, rw, {})).edges[0].lag === 2, "a re-weighted link takes the delay it has in the vision");
}

// ---- alternative paths and the metro map --------------------------------------------------------------------
{
  const alt = res.alternatives;
  ok(alt.length > res.steps.length, `the search keeps alternative paths (${alt.length})`);
  ok(alt.filter((a) => a.best).length === 1 && alt.find((a) => a.best).id === res.bestId, "exactly one path is the closest");
  ok(new Set(alt.map((a) => a.id)).size === alt.length, "every path is listed once");
  const ids = new Set(alt.map((a) => a.id));
  ok(alt.every((a) => a.steps.length === 1 || ids.has(a.id.split(" > ").slice(0, -1).join(" > "))), "every longer path grows out of a listed shorter one");
  ok(alt.every((a) => a.steps.every((st, i) => i === 0 || st.closed > a.steps[i - 1].closed)), "along every path each step closes more of the distance");
  ok(alt.every((a) => a.closed <= res.closed + 1e-9), "no path comes closer than the closest");
  const cands = backcastMetroCandidates(res);
  ok(cands.length === alt.length && cands.every((k) => k.stages.length && k.cii === k.stages.length && k.stages.every((st, i) => st.ciiAfter === i + 1)), "each path becomes a metro route of one stage per step");
  const rows = metroRows(cands, { top: 8, sort: "network" });
  ok(rows.some((r) => r.c.id === res.bestId), "the closest path is on the map");
  ok(rows.every((r) => r.parentId === null || rows.some((q) => q.c.id === r.parentId)), "the map is a connected network");
  ok(rows.every((r) => r.end === r.c.stages.length && (r.parentId === null ? r.start === 0 : r.start === 1)), "a route ends at its number of steps and continues its parent after the first step");
  ok(cands.find((k) => k.id === res.bestId).tog === res.closed, "the closest route is scored by the share of the distance it closes");
  const one = backcast(current, vision, simulate, {}, { maxSteps: 5, beam: 1 });
  ok(one.alternatives.length === one.steps.length && one.alternatives.every((a, i) => a.steps.length === i + 1), "with a search width of 1 the map is the single path and its stages");
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
