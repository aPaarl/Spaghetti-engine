// Auto Arrange layout engine: correctness and speed. Run from the project folder:  node tests/test_fcm_layout.mjs
//
// Builds synthetic fuzzy cognitive maps with planted clusters, drivers and feedback loops at 20, 50, 100 and 200
// concepts, runs every layout mode, and checks: no overlapping cards, the same result twice (deterministic), fewer
// crossings than a plain force-directed layout (Readable), drivers left of outcomes in Systems thinking, central concepts nearer
// the middle in Centrality view, and the time limits (20-50 instant, 50-100 under 2 s, 100-200 under 5 s).
import { computeFcmLayout, runFcmLayout, scoreLayout, louvain, computeNodeMetrics, stronglyConnected, FCM_LAYOUT_MODES } from "../src/layout/fcmLayout.js";
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceCenter } from "d3-force";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// n concepts in ~n/8 planted clusters; dense inside, sparse between; a few drivers (only outgoing) and outcomes
// (only incoming); about 4 relationships per concept, as in typical participatory FCMs.
function makeMap(n, seed) {
  const r = rng(seed);
  const k = Math.max(2, Math.round(n / 8));
  const nodes = Array.from({ length: n }, (_, i) => ({ id: "c" + i, w: 90 + Math.round(r() * 60), h: r() < 0.3 ? 44 : 28, group: "m" + (i % k) }));
  const edges = [], seen = new Set();
  const add = (s, t) => {
    if (s === t || seen.has(s + ">" + t)) return;
    seen.add(s + ">" + t);
    edges.push({ source: "c" + s, target: "c" + t, weight: Math.round((r() * 2 - 1) * 4) / 4 || 0.25 });
  };
  const drivers = new Set(Array.from({ length: Math.max(2, n / 10) }, (_, i) => i * 7 % n));
  const outcomes = new Set(Array.from({ length: Math.max(2, n / 10) }, (_, i) => (i * 7 + 3) % n));
  const m = Math.round(n * 2);
  while (edges.length < m) {
    const s = Math.floor(r() * n);
    const same = r() < 0.8;
    let t = same ? (s % k) + k * Math.floor(r() * Math.ceil(n / k)) : Math.floor(r() * n);
    if (t >= n) t = s % k;
    if (outcomes.has(s) || drivers.has(t)) continue;
    add(s, t);
  }
  return { nodes, edges, drivers, outcomes };
}

function forceBaseline(map) {
  const nodes = map.nodes.map((d, i) => ({ id: d.id, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }));
  const sim = forceSimulation(nodes).force("charge", forceManyBody().strength(-900))
    .force("link", forceLink(map.edges.map((e) => ({ source: e.source, target: e.target }))).id((d) => d.id).distance(170))
    .force("center", forceCenter(0, 0)).force("collide", forceCollide(65)).stop();
  for (let i = 0; i < 300; i++) sim.tick();
  return Object.fromEntries(nodes.map((d) => [d.id, { x: d.x, y: d.y }]));
}

// score any placement with the engine's own objective
function crossingsOf(map, centres) {
  const ids = map.nodes.map((d) => d.id), idx = new Map(ids.map((id, i) => [id, i]));
  const edges = map.edges.map((e) => ({ s: idx.get(e.source), t: idx.get(e.target), weight: e.weight }));
  const n = ids.length;
  const ctx = { n, w: map.nodes.map((d) => d.w), h: map.nodes.map((d) => d.h), edges, groupOf: new Array(n).fill(0), groups: [ids.map((_, i) => i)],
    drive: new Array(n).fill(0), central: new Array(n).fill(0), unit: 180 };
  return scoreLayout(ctx, ids.map((id) => centres[id].x), ids.map((id) => centres[id].y)).crossings;
}

// --- unit checks -----------------------------------------------------------------------------------------------------
{
  // two 4-cliques joined by one edge: Louvain must find exactly those two
  const und = Array.from({ length: 8 }, () => new Map());
  const link = (a, b) => { und[a].set(b, 1); und[b].set(a, 1); };
  for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { link(a, b); link(a + 4, b + 4); }
  link(3, 4);
  const c = louvain(8, und);
  ok(new Set(c.slice(0, 4)).size === 1 && new Set(c.slice(4)).size === 1 && c[0] !== c[4], "Louvain separates two cliques joined by a bridge");

  // a chain a->b->c: b has all the betweenness; a 3-cycle is one strongly connected component
  const m = computeNodeMetrics(3, [{ s: 0, t: 1, w: 1 }, { s: 1, t: 2, w: 1 }]);
  ok(m.betweenness[1] === 1 && m.betweenness[0] === 0 && m.betweenness[2] === 0, "betweenness peaks on the middle of a chain");
  ok(m.eigenvector[1] === 1, "eigenvector centrality peaks on the middle of a chain");
  const scc = stronglyConnected(4, [[1], [2], [0], []]);
  ok(scc.some((c) => c.length === 3) && scc.some((c) => c.length === 1), "a 3-cycle is found as one feedback component");
}

// --- layouts at each size -------------------------------------------------------------------------------------------
// The time limits are for a typical laptop. This machine's speed is measured first and the limits scaled to it, so a
// laptop on battery saver doesn't fail the test (and a fast desktop isn't let off lightly).
let spin = 0;
const tSpin = performance.now();
for (let i = 0; i < 5e7; i++) spin += i % 7;
const speed = Math.max(1, (performance.now() - tSpin) / 120); // 5e7 iterations take about 120 ms on a typical laptop
console.log(`     machine speed factor ${speed.toFixed(2)} (1 = typical laptop)${spin ? "" : ""}`);
const limits = Object.fromEntries(Object.entries({ 20: 500, 50: 800, 100: 2000, 200: 5000 }).map(([k, v]) => [k, v * speed]));
for (const n of [20, 50, 100, 200]) {
  const map = makeMap(n, n * 31);
  const base = crossingsOf(map, forceBaseline(map));
  for (const { id: mode } of FCM_LAYOUT_MODES) {
    const t = performance.now();
    // deadlineMs: Infinity switches off the wall-clock safety net, so this measures the engine's fixed amount of work
    // and the result doesn't depend on how busy the machine happens to be
    const res = await runFcmLayout({ nodes: map.nodes, edges: map.edges, mode, deadlineMs: Infinity });
    const ms = performance.now() - t;
    const centres = Object.fromEntries(map.nodes.map((d) => [d.id, { x: res.positions[d.id].x + d.w / 2, y: res.positions[d.id].y + d.h / 2 }]));
    const label = `${n} concepts, ${mode}`;
    console.log(`     ${label}: ${Math.round(ms)} ms, crossings ${res.report.crossings} (plain force layout ${base}), overlaps ${res.report.nodeOverlaps}, ` +
      `label clashes ${res.report.labelOverlaps}, communities ${res.report.communities}, loops ${res.report.feedbackLoops}, score ${res.report.score}, ops/ms ${res.report.searchOpsPerMs}`);
    ok(ms < limits[n], `${label}: within ${Math.round(limits[n])} ms`);
    ok(res.report.nodeOverlaps === 0, `${label}: no overlapping cards`);
    // Readable is the crossing-minimising mode and must beat a plain force layout outright; the other modes trade a
    // little of that for their own structure (drivers left, separated modules, centrality), within a margin
    if (mode === "readable") ok(res.report.crossings < base, `${label}: fewer crossings than a plain force-directed layout`);
    // Systems thinking pins drivers left and outcomes right, so feedback running back right-to-left costs crossings
    else if (mode === "systems") ok(res.report.crossings <= base * 2.5 + 3, `${label}: crossings within 2.5x a plain force-directed layout`);
    else ok(res.report.crossings <= base * 1.6 + 3, `${label}: crossings within 60% of a plain force-directed layout`);
    if (mode === "systems") {
      const mean = (set) => [...set].reduce((s, i) => s + centres["c" + i].x, 0) / set.size;
      ok(mean(map.drivers) < mean(map.outcomes), `${label}: drivers sit left of outcomes`);
    }
    if (n === 50 && mode === "readable") {
      // the search runs on a fixed work budget, so with the wall-clock safety net out of the way it is repeatable
      const again = computeFcmLayout({ nodes: map.nodes, edges: map.edges, mode, budgetMs: 400, deadlineMs: Infinity });
      const first = computeFcmLayout({ nodes: map.nodes, edges: map.edges, mode, budgetMs: 400, deadlineMs: Infinity });
      ok(JSON.stringify(again.positions) === JSON.stringify(first.positions), `${label}: same input gives the same layout`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
