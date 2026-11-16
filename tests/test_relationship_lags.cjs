// Relationship time lags. Run from the project folder:  node tests/test_relationship_lags.cjs
//
// A relationship with lag L passes on its source's value from L iterations earlier (Park & Kim 1995; Nair et al. 2020).
// Checks: lag 0 is the ordinary update; a lag delays when a driver's effect arrives by exactly L iterations; lags leave the
// equilibrium of a model that settles where it was; a run only counts as settled once its whole lag window is calm; the
// pathway engine follows simulate() with lags; and the importer keeps lags only as whole numbers above 0.
const fs = require("fs");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "src", "SpaghettiEngine.jsx");
const lines = fs.readFileSync(file, "utf8").split("\n");
const idx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; throw new Error("not found " + re); };
const a = idx(/^\/\/ Utilities/) - 1, aEnd = idx(/^function Btn\(/);
const s = idx(/^\/\/ The marginal-benefit transition point of a response/), sEnd = idx(/^function TransitionPointAnalysisTab\(/);
const code = [lines.slice(a, aEnd), lines.slice(s, sEnd)].map((x) => x.join(String.fromCharCode(10))).join(String.fromCharCode(10));
const stub = () => { throw new Error("stub"); };
const store = {};
const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const api = new Function("localStorage", "performance", "ExcelJS", "document", "window", "ELK", "forceSimulation", "forceManyBody", "forceLink", "forceCenter", "forceCollide", "domNodeToPngBlob",
  "function layoutByModule(c){ return c; }\n" + fs.readFileSync(path.join(__dirname, "fixtures", "example-models.js"), "utf8") + "\n" + code + "\nreturn { makeTemplate, DEFAULT_SETTINGS, BASELINE_SCENARIO, simulate, makePathwayEngine, pathwaySimSettings, edgeLag, MAX_EDGE_LAG, sanitizeModel };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const close = (x, y, tol) => Math.abs(x - y) < tol;
const settings = { ...api.DEFAULT_SETTINGS };

// ---- edgeLag ---------------------------------------------------------------------------------------------------------------
ok(api.edgeLag({}) === 0 && api.edgeLag({ lag: 0 }) === 0 && api.edgeLag({ lag: -2 }) === 0 && api.edgeLag({ lag: "x" }) === 0, "no lag, 0, negative and non-numbers read as lag 0");
ok(api.edgeLag({ lag: 2 }) === 2 && api.edgeLag({ lag: "3" }) === 3 && api.edgeLag({ lag: 1.6 }) === 2, "lags are whole numbers of iterations");
ok(api.edgeLag({ lag: 99 }) === api.MAX_EDGE_LAG, `lags are capped at ${api.MAX_EDGE_LAG}`);

// ---- a driver's effect arrives exactly L iterations later ------------------------------------------------------------------
{
  const concepts = [{ id: "A", name: "A", initialValue: 0 }, { id: "B", name: "B", initialValue: 0 }];
  const driver = { id: "s", initialOverrides: { A: 1 }, lockedConcepts: { A: 1 } };
  const firstMove = (lag) => {
    const r = api.simulate(concepts, [{ id: "e", source: "A", target: "B", weight: 0.5, lag }], driver, settings);
    return r.series.findIndex((p) => Math.abs(p.values.B) > 1e-12);
  };
  ok(firstMove(0) === 1, "without a lag, B moves in iteration 1");
  ok([1, 2, 3, 5].every((L) => firstMove(L) === 1 + L), "with lag L, B first moves in iteration 1 + L");
  const r0 = api.simulate(concepts, [{ id: "e", source: "A", target: "B", weight: 0.5 }], driver, settings);
  const r3 = api.simulate(concepts, [{ id: "e", source: "A", target: "B", weight: 0.5, lag: 3 }], driver, settings);
  ok(r3.converged && close(r3.final.B, r0.final.B, 0.01), "the delayed chain settles where the undelayed one does");
}

// ---- lag 0 is the ordinary update; lags keep the equilibrium of the example models -------------------------------------------
for (const kind of ["peat", "nexus"]) {
  const { concepts, edges } = api.makeTemplate(kind);
  const base = { ...api.BASELINE_SCENARIO };
  const tight = { ...settings, maxIterations: 5000, convergenceThreshold: 1e-6 };
  const plain = api.simulate(concepts, edges, base, tight);
  const zero = api.simulate(concepts, edges.map((e) => ({ ...e, lag: 0 })), base, tight);
  ok(JSON.stringify(plain.series) === JSON.stringify(zero.series), `${kind}: lag 0 on every relationship gives exactly the same run`);
  // a deterministic spread of lags 0..3
  const lagged = edges.map((e, i) => ({ ...e, lag: (i * 7) % 4 }));
  const withLags = api.simulate(concepts, lagged, base, tight);
  if (plain.converged && withLags.converged) {
    const worst = Math.max(...concepts.map((c) => Math.abs(plain.final[c.id] - withLags.final[c.id])));
    ok(worst < 1e-4, `${kind}: with lags the baseline settles at the same equilibrium (largest difference ${worst.toExponential(1)})`);
    ok(JSON.stringify(plain.series.slice(0, 5)) !== JSON.stringify(withLags.series.slice(0, 5)), `${kind}: but the path there differs`);
  } else {
    console.log(`  (${kind}: converged without lags ${plain.converged}, with lags ${withLags.converged}; equilibrium comparison skipped)`);
  }
  // a settled run has been calm for at least maxLag + 1 iterations
  if (withLags.converged) {
    const n = withLags.series.length, tail = withLags.series.slice(n - 5);
    const calm = tail.slice(1).every((p, i) => concepts.every((c) => Math.abs(p.values[c.id] - tail[i].values[c.id]) < tight.convergenceThreshold));
    ok(calm, `${kind}: a settled lagged run was calm for the last 4 iterations (longest lag 3, plus one)`);
  }

  // the pathway engine follows simulate() with lags, including a driver
  const sim = api.pathwaySimSettings(settings, { maxIterations: 2000 });
  const eng = api.makePathwayEngine(concepts, lagged, sim);
  const B = eng.equilibrate(eng.initial, [], []);
  const ref = api.simulate(concepts, lagged, base, sim);
  ok(concepts.every((c) => close(B.state[eng.index.get(c.id)], ref.final[c.id], 1e-12)) && B.iterations === ref.iterationsRun, `${kind}: the pathway engine's baseline equals simulate() step for step with lags`);
  const lever = concepts[0].id;
  const st = eng.equilibrate(B.state, [eng.index.get(lever)], [0.8]);
  const before = Object.fromEntries(concepts.map((c) => [c.id, B.state[eng.index.get(c.id)]]));
  // simulate() takes the pre-intervention value of a driver from the model, so give the model the stage's starting values
  const stageConcepts = concepts.map((c) => ({ ...c, initialValue: before[c.id] }));
  const refStage = api.simulate(stageConcepts, lagged, { id: "s", initialOverrides: { [lever]: 0.8 }, lockedConcepts: { [lever]: 0.8 } }, sim);
  ok(concepts.every((c) => close(st.state[eng.index.get(c.id)], refStage.final[c.id], 1e-12)) && st.iterations === refStage.iterationsRun, `${kind}: a pathway stage with a new lever equals simulate() with that driver`);
}

// ---- import keeps only valid lags -------------------------------------------------------------------------------------------
{
  const m = api.sanitizeModel({ concepts: [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }], edges: [{ source: "A", target: "B", weight: 0.5, lag: 2 }, { source: "B", target: "C", weight: 0.5, lag: "nonsense" }] });
  const edges = m.edges || m.model?.edges || [];
  ok(edges[0]?.lag === 2 && !("lag" in (edges[1] || {})), "the importer keeps a valid lag and drops an invalid one");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
