// Transition Point Analysis, sweep directions. Run from the project folder:  node tests/test_transition_direction.cjs
//
// An increase runs the intervention from 0 up to +1 and a decrease from 0 down to -1, so the last step of each is exactly
// the scenario in which that concept is a driver (the Scenarios & Simulation up and down arrows). The test loads the engine
// code straight from src/SpaghettiEngine.jsx, so it needs no build.
const fs = require("fs");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "src", "SpaghettiEngine.jsx");
const lines = fs.readFileSync(file, "utf8").split("\n");
const idx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; throw new Error("not found " + re); };
const a = idx(/^\/\/ Utilities/) - 1, aEnd = idx(/^function Btn\(/);
const s = idx(/^function runTransitionSweep\(/), sEnd = idx(/^function TransitionPointAnalysisTab\(/);
const code = [lines.slice(a, aEnd), lines.slice(s, sEnd)].map((x) => x.join(String.fromCharCode(10))).join(String.fromCharCode(10));
const stub = () => { throw new Error("stub"); };
const store = {};
const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const api = new Function("localStorage", "performance", "ExcelJS", "document", "window", "ELK", "forceSimulation", "forceManyBody", "forceLink", "forceCenter", "forceCollide", "domNodeToPngBlob",
  "function layoutByModule(c){ return c; }\n" + code + "\nreturn { makeTemplate, runTransitionSweep, transitionRangeLabel, classifyResponseType, DEFAULT_SETTINGS, BASELINE_SCENARIO, simulate, makePathwayEngine, pathwaySimSettings, pathwayLeverValue, runPathwayAnalysis, DEFAULT_PATHWAY_CONFIG };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const near = (x, y) => Math.abs(x - y) < 1e-12;

// the driver scenario exactly as setDriver in Scenarios & Simulation builds it
const driverScenario = (base, id, v) => ({ ...base, initialOverrides: { ...base.initialOverrides, [id]: v }, lockedConcepts: { ...base.lockedConcepts, [id]: v } });

for (const kind of ["peat", "nexus"]) {
  const { concepts, edges } = api.makeTemplate(kind);
  const settings = { ...api.DEFAULT_SETTINGS };
  const base = { ...api.BASELINE_SCENARIO };
  const out = {}; edges.forEach((e) => (out[e.from] = (out[e.from] || 0) + 1));
  const iv = concepts.map((c) => c.id).sort((p, q) => (out[q] || 0) - (out[p] || 0))[0];
  const outcomes = concepts.map((c) => c.id).filter((id) => id !== iv);
  const N = 50;
  const inc = api.runTransitionSweep(concepts, edges, base, settings, iv, "increase", outcomes, N);
  const dec = api.runTransitionSweep(concepts, edges, base, settings, iv, "decrease", outcomes, N);
  const up = api.simulate(concepts, edges, driverScenario(base, iv, 1), settings);
  const down = api.simulate(concepts, edges, driverScenario(base, iv, -1), settings);
  const neutral = api.simulate(concepts, edges, driverScenario(base, iv, 0), settings);

  ok(outcomes.every((id) => near(inc.perOutcome[id].y[N], up.final[id])), `${kind}: the last step of an increase equals the ▲ driver scenario for every outcome`);
  ok(outcomes.every((id) => near(dec.perOutcome[id].y[N], down.final[id])), `${kind}: the last step of a decrease equals the ▼ driver scenario for every outcome`);
  ok(outcomes.every((id) => near(inc.perOutcome[id].y[0], neutral.final[id]) && near(dec.perOutcome[id].y[0], neutral.final[id])), `${kind}: both directions start from the lever held at 0`);
  ok(outcomes.every((id) => near(dec.perOutcome[id].effect, down.final[id] - neutral.final[id])), `${kind}: the effect of a decrease is the change from 0 to the ▼ scenario`);
  ok(inc.steps.length === N + 1 && dec.steps.length === N + 1 && near(dec.steps[0], 0) && near(dec.steps[N], 1), `${kind}: intensity still runs 0 to 1 in both directions`);
  const asym = outcomes.filter((id) => Math.abs(dec.perOutcome[id].effect + inc.perOutcome[id].effect) > 0.05).length;
  console.log(`  (${kind}: ${asym} of ${outcomes.length} outcomes respond differently to pushing the lever down than to pushing it up)`);
  // the old reading, for the record: a decrease used to be the increase curve backwards
  const reversed = outcomes.every((id) => dec.perOutcome[id].y.every((v, i) => near(v, inc.perOutcome[id].y[N - i])));
  ok(!reversed, `${kind}: a decrease is no longer the increase curve read backwards`);
}

ok(api.transitionRangeLabel("increase") === "0→1" && api.transitionRangeLabel("decrease") === "0→-1", "range labels read 0→1 and 0→-1");
// ---- Transition Pathways: the same convention for a lever's direction --------------------------------------------------
ok(api.pathwayLeverValue(false, 0.4) === 0.4 && api.pathwayLeverValue(true, 0.4) === -0.4, "a decrease lever at intensity 0.4 is held at -0.4, an increase lever at +0.4");
ok(Object.is(api.pathwayLeverValue(true, 0), 0) && Object.is(api.pathwayLeverValue(false, 0), 0), "intensity 0 holds the lever at +0 in both directions");

for (const kind of ["nexus", "peat"]) {
  const { concepts, edges } = api.makeTemplate(kind);
  const settings = { ...api.DEFAULT_SETTINGS };
  const out = {}; edges.forEach((e) => (out[e.from] = (out[e.from] || 0) + 1));
  const ids = concepts.map((c) => c.id);
  const lever = ids.slice().sort((p, q) => (out[q] || 0) - (out[p] || 0))[0];
  const outcomeIds = ids.filter((id) => id !== lever).slice(0, 4);
  const N = 10;
  const run = (direction) => {
    const config = { ...api.DEFAULT_PATHWAY_CONFIG, resolution: N, maxLength: 1, outcomes: outcomeIds.map((id) => ({ id, direction: 1, weight: 1, target: "" })), levers: [{ id: lever, direction, effort: 1 }] };
    const g = api.runPathwayAnalysis(concepts, edges, settings, config);
    let r = g.next(); while (!r.done) r = g.next();
    return { res: r.value, config };
  };
  const inc = run("increase"), dec = run("decrease");
  // independent reading of the gain: the pathway engine itself, with the lever locked at a known value
  const eng = api.makePathwayEngine(concepts, edges, api.pathwaySimSettings(settings, inc.config));
  const B = eng.equilibrate(eng.initial, [], []).state;
  const gainAt = (v) => { const st = eng.equilibrate(B, [eng.index.get(lever)], [v]).state; return outcomeIds.reduce((g, id) => g + (st[eng.index.get(id)] - B[eng.index.get(id)]), 0); };
  const gi = inc.res.iso.find((l) => l.id === lever).gains, gd = dec.res.iso.find((l) => l.id === lever).gains;
  ok(gi.length === N + 1 && gd.length === N + 1, `${kind}: the lever profile has ${N + 1} points in both directions`);
  ok(near(gi[N], gainAt(1)) && near(gd[N], gainAt(-1)), `${kind}: full intensity is the lever locked at +1 (increase) and at -1 (decrease)`);
  ok(near(gi[0], gainAt(0)) && near(gd[0], gainAt(0)), `${kind}: intensity 0 is the lever locked at 0 in both directions`);
  ok(gd.every((v, i) => near(v, gainAt(-i / N))), `${kind}: every point of the decrease profile is the lever locked at -u`);
  ok(dec.res.levers[0].decrease === true && inc.res.levers[0].decrease === false, `${kind}: the result still records which lever is a decrease`);
}

// ---- Change at TP: the outcome at the end of the steepest step (TP + Δx) minus its value at intensity 0 -------------------------
for (const kind of ["peat", "nexus"]) {
  const { concepts, edges } = api.makeTemplate(kind);
  const settings = { ...api.DEFAULT_SETTINGS };
  const base = { ...api.BASELINE_SCENARIO };
  const out = {}; edges.forEach((e) => (out[e.from] = (out[e.from] || 0) + 1));
  const iv = concepts.map((c) => c.id).sort((p, q) => (out[q] || 0) - (out[p] || 0))[0];
  const outcomes = concepts.map((c) => c.id).filter((id) => id !== iv).slice(0, 6);
  for (const dir of ["increase", "decrease"]) {
    const sw = api.runTransitionSweep(concepts, edges, base, settings, iv, dir, outcomes, 50);
    ok(outcomes.every((id) => { const o = sw.perOutcome[id]; return near(o.effectAtTp, o.y[o.tpIndex + 1] - o.y[0]); }), `${kind}, ${dir}: Change at TP is Y(TP + Δx) - Y(0), the end of the steepest step`);
    const at = (id, x) => api.simulate(concepts, edges, driverScenario(base, iv, dir === "decrease" ? 0 - x : x), settings).final[id];
    ok(outcomes.every((id) => { const o = sw.perOutcome[id]; return near(o.effectAtTp, at(id, sw.steps[o.tpIndex + 1]) - at(id, 0)); }), `${kind}, ${dir}: Change at TP equals the run with the lever held one step past the TP minus the run at 0`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
