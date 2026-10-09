// The marginal-benefit transition point. Run from the project folder:  node tests/test_marginal_benefit_tp.cjs
//
// MB_i = s (Y_{i+1} - Y_i) / dx is the marginal benefit of step i, and the transition point is the sampled level x_i
// (i = 1 .. N-1) at which (MB_i - MB_{i-1}) / dx is lowest: where the marginal benefit declines most steeply. When that is
// the last interior level, or the marginal benefit does not decline at all, the transition point is 1 ("proportional").
// The test loads the engine code straight from src/SpaghettiEngine.jsx, so it needs no build.
const fs = require("fs");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "src", "SpaghettiEngine.jsx");
const lines = fs.readFileSync(file, "utf8").split("\n");
const idx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; throw new Error("not found " + re); };
const a = idx(/^\/\/ Utilities/) - 1, aEnd = idx(/^function Btn\(/);
const s = idx(/^\/\/ The marginal-benefit transition point of a response/), sEnd = idx(/^function TransitionPointAnalysisTab\(/);
const code = [lines.slice(a, aEnd), lines.slice(s, sEnd)].map((x) => x.join(String.fromCharCode(10))).join(String.fromCharCode(10));
const stub = () => { throw new Error("stub"); };
const ls = { getItem: () => null, setItem() {}, removeItem() {} };
const api = new Function("localStorage", "performance", "ExcelJS", "document", "window", "ELK", "forceSimulation", "forceManyBody", "forceLink", "forceCenter", "forceCollide", "domNodeToPngBlob",
  "function layoutByModule(c){ return c; }\n" + code + "\nreturn { makeTemplate, marginalBenefitTP, transitionSimSettings, runTransitionSweep, classifyResponseType, DEFAULT_SETTINGS, BASELINE_SCENARIO, simulate, makePathwayEngine, pathwaySimSettings, runPathwayAnalysis, DEFAULT_PATHWAY_CONFIG, TP_PRECISION_THRESHOLD, TP_MIN_ITERATIONS };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const near = (x, y, tol = 1e-12) => Math.abs(x - y) < tol;
const curve = (f, N) => Array.from({ length: N + 1 }, (_, i) => f(i / N));

// ---- the definition on known curves ----------------------------------------------------------------------------------------
{
  const N = 500;
  // y = tanh(a (x - c)): y'' is lowest where tanh(a (x - c)) = 1/sqrt(3), so the TP is c + atanh(1/sqrt(3)) / a
  const aa = 10, c = 0.4, want = c + Math.atanh(1 / Math.sqrt(3)) / aa;
  const r = api.marginalBenefitTP(curve((x) => Math.tanh(aa * (x - c)), N), 1 / N, 1);
  ok(Math.abs(r.index / N - want) <= 1.5 / N && !r.proportional, `S-curve: TP ${(r.index / N).toFixed(3)} where the marginal benefit falls fastest (analytic ${want.toFixed(3)})`);
  const f = api.marginalBenefitTP(curve((x) => -Math.tanh(aa * (x - c)), N), 1 / N, -1);
  ok(f.index === r.index, "a falling outcome with s = -1 has the same TP as its mirror image");
  ok(f.mb.every((v, i) => near(v, r.mb[i])), "and the same (oriented) marginal benefit");

  const lin = api.marginalBenefitTP(curve((x) => 0.5 * x, N), 1 / N, 1);
  ok(lin.index === N && lin.proportional, "straight line: no decline, TP = 1 (proportional)");
  let seed = 7; const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2e-12;
  const noisy = api.marginalBenefitTP(curve((x) => 0.5 * x + noise(), N), 1 / N, 1);
  ok(noisy.index === N, "straight line with rounding noise: still TP = 1, the noise is not a decline");
  const convex = api.marginalBenefitTP(curve((x) => x * x * x, N), 1 / N, 1);
  ok(convex.index === N && convex.proportional, "ever-steepening (convex) response: TP = 1, not the start of the sweep");
  const sat = api.marginalBenefitTP(curve((x) => 1 - Math.exp(-5 * x), N), 1 / N, 1);
  ok(sat.index === 1, "saturating exponential: the marginal benefit falls fastest right at the start (TP = first interior level)");
  // the steepest decline on the last interior level is reported as 1
  const y = curve((x) => x, N); y[N] = y[N - 1] + 0.5 / N;
  const last = api.marginalBenefitTP(y, 1 / N, 1);
  ok(last.index === N && last.proportional, "steepest decline at the last interior level: TP = 1");
  const flat = api.marginalBenefitTP(curve(() => 0.3, N), 1 / N, 1);
  ok(flat.index === N, "flat response: TP = 1 (and the Flat class takes precedence)");
  ok(api.classifyResponseType(1, 0, 0.015, true) === "Flat", "classification: Flat first");
  ok(api.classifyResponseType(1, 1, 0.015, true) === "Proportional", "classification: Proportional for TP = 1");
  ok(api.classifyResponseType(1 / 3, 1, 0.015) === "Early" && api.classifyResponseType(0.5, 1, 0.015) === "Middle" && api.classifyResponseType(2 / 3, 1, 0.015) === "Late", "classification: Early (at most 1/3), Middle, Late (2/3 or more)");
  const short = api.marginalBenefitTP([0, 0.5, 0.6], 0.5, 1);
  ok(short.index === 2, "two steps: the only interior level is also the last, so TP = 1");
}

// ---- the sweep: settings, convergence counts, and the TP read off the curve --------------------------------------------------
{
  const st = api.transitionSimSettings({ ...api.DEFAULT_SETTINGS, convergenceThreshold: 0.001, maxIterations: 100 });
  ok(st.convergenceThreshold === api.TP_PRECISION_THRESHOLD && st.maxIterations === api.TP_MIN_ITERATIONS && st.acceptThreshold === 0.001, "sweeps run on to 1e-9 with at least 1000 iterations; converged still means below the user's threshold");
  const st2 = api.transitionSimSettings({ ...api.DEFAULT_SETTINGS, convergenceThreshold: 1e-12, maxIterations: 5000 });
  ok(st2.convergenceThreshold === 1e-12 && st2.maxIterations === 5000, "a tighter threshold or a higher cap set by the user is kept");

  const { concepts, edges } = api.makeTemplate("peat");
  const settings = { ...api.DEFAULT_SETTINGS, squashFunction: "sigmoid", updateRule: "absolute" };
  const out = {}; edges.forEach((e) => (out[e.source] = (out[e.source] || 0) + 1));
  const ids = concepts.map((c) => c.id);
  const iv = ids.slice().sort((p, q) => (out[q] || 0) - (out[p] || 0))[0];
  const outcomes = ids.filter((id) => id !== iv);
  const N = 100;
  const sw = api.runTransitionSweep(concepts, edges, { ...api.BASELINE_SCENARIO }, settings, iv, "increase", outcomes, N);
  ok(sw.runs === N + 1 && sw.notConverged === 0 && sw.notPrecise === 0, `peat (sigmoid, absolute): all ${sw.runs} runs settle to 1e-9`);
  ok(outcomes.every((id) => {
    const o = sw.perOutcome[id];
    const s = o.effect < 0 ? -1 : 1;
    return o.sign === s && o.tpIndex === api.marginalBenefitTP(o.y, 1 / N, s).index && near(o.tp, sw.steps[o.tpIndex]);
  }), "every outcome's TP is the marginal-benefit TP of its curve, oriented by the sign of its effect");
  ok(outcomes.every((id) => { const o = sw.perOutcome[id]; return o.mb.every((v, i) => near(v, o.sign * o.slope[i])); }), "the marginal benefit is the slope times that sign");
  ok(outcomes.every((id) => { const o = sw.perOutcome[id]; return !o.proportional || (o.tpIndex === N && near(o.effectAtTp, o.effect)); }), "a proportional outcome reaches its full effect at its TP (Change at TP = Max Change)");
}

// ---- pathways: the conditional TP is the marginal-benefit TP of the total outcome gain ---------------------------------------
for (const [kind, sq, rule] of [["peat", "tanh", "relative"], ["peat", "sigmoid", "absolute"], ["nexus", "sigmoid", "absolute"]]) {
  const { concepts, edges } = api.makeTemplate(kind);
  const settings = { ...api.DEFAULT_SETTINGS, squashFunction: sq, updateRule: rule };
  const out = {}; edges.forEach((e) => (out[e.source] = (out[e.source] || 0) + 1));
  const ids = concepts.map((c) => c.id).sort((p, q) => (out[q] || 0) - (out[p] || 0));
  const N = 20;
  const config = { ...api.DEFAULT_PATHWAY_CONFIG, resolution: N, maxLength: 2, outcomes: ids.slice(-4).map((id) => ({ id, direction: 1, weight: 1, target: "" })), levers: ids.slice(0, 5).map((id) => ({ id, direction: "increase", effort: 1 })) };
  const g = api.runPathwayAnalysis(concepts, edges, settings, config);
  let r = g.next(); while (!r.done) r = g.next();
  const res = r.value;
  const label = `${kind} (${sq}, ${rule})`;
  ok(res.settingsUsed.convergenceThreshold === api.TP_PRECISION_THRESHOLD && res.settingsUsed.maxIterations >= api.TP_MIN_ITERATIONS, `${label}: pathway runs go on to 1e-9 with at least 1000 iterations`);
  ok(res.iso.every((l) => {
    const k = api.marginalBenefitTP(l.gains, 1 / N, 1).index;
    const improves = l.gains[k] > 1e-9;
    return improves ? near(l.tau, k / N) : l.tau === null;
  }), `${label}: each lever's TP on its own is the marginal-benefit TP of its gain curve from BAU, or none if the gain there is not positive`);
  ok(res.iso.every((l) => l.flat || l.tau !== null || !l.included), `${label}: a lever with no TP is left out of the pathways`);
  ok(res.candidates.every((c) => c.stages.every((st) => st.scaleUp || res.rule !== "tp" || st.gainAfter > st.gainBefore + 1e-9)), `${label}: every stage up to its TP raises the total outcome gain`);
  ok(res.candidates.filter((c) => c.length === 1).every((c) => near(c.stages[0].u, res.iso.find((l) => l.id === c.stages[0].leverId).tau)), `${label}: a one-stage pathway stops at the lever's own TP`);
  ok(res.candidates.every((c) => c.stages.every((st) => st.tauCond === null || (st.tauCond >= 0 && st.tauCond <= 1))), `${label}: conditional TPs lie in 0..1`);
  console.log(`  (${label}: ${res.candidates.length} pathways, ${res.blocked} blocked stages, ${res.summary.counts.admissible} admissible, ${res.imprecise} of ${res.runs} runs short of 1e-9)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
