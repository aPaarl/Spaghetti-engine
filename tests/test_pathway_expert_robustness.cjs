// Transition Pathway Analysis, expert-defined sequences and the three robustness families. Run from the project folder:
//   node tests/test_pathway_expert_robustness.cjs
//
// Expert sequences (Step 2 of the methods) are simulated stage by stage with the same engine and classified with the
// enumerated pathways. Robustness (Section 7.3) varies the simulation settings, the outcome weights, and the archetype
// thresholds. The test loads the engine code straight from src/SpaghettiEngine.jsx, so it needs no build.
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
  "function layoutByModule(c){ return c; }\n" + code + "\nreturn { makeTemplate, DEFAULT_SETTINGS, makePathwayEngine, pathwaySimSettings, pathwayLeverValue, runPathwayAnalysis, classifyPathways, pathwayQuantile, pathwayThresholdVariants, pathwayAlternativeSettings, PATHWAY_THRESHOLD_DEFAULTS, PATHWAY_ROBUSTNESS_FAMILIES, DEFAULT_PATHWAY_CONFIG, PATHWAY_CONFIG_KEY, readPathwayConfig, pathwayKeyOf };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const run = (gen) => { let r; do { r = gen.next(); } while (!r.done); return r.value; };

const { concepts, edges } = api.makeTemplate("nexus");
const settings = { ...api.DEFAULT_SETTINGS };
const levers = ["G_CPL", "G_APL", "G_WPL", "G_RND", "E_EFF", "W_TRT"].map((id) => ({ id, direction: "increase", effort: 1 }));
const outcomes = [{ id: "F_SEC", direction: 1, weight: 1, target: "" }, { id: "C_BIO", direction: 1, weight: 1, target: "" }, { id: "C_GHG", direction: -1, weight: 1, target: "" }];
const baseConfig = { ...api.DEFAULT_PATHWAY_CONFIG, levers, outcomes, maxLength: 2, resolution: 20 };

// ---- Expert-defined sequences ---------------------------------------------------------------------------------------
const plain = run(api.runPathwayAnalysis(concepts, edges, settings, baseConfig));
const single = plain.candidates.find((c) => c.length === 1 && c.stages[0].leverId === "G_CPL");
const expertSequences = [
  { name: "Same as enumerated", stages: [{ leverId: "G_CPL", mode: "tp" }] },
  { name: "Fixed", stages: [{ leverId: "G_APL", mode: "fixed", u: 0.33 }, { leverId: "G_WPL", mode: "fixed", u: 0.6 }] },
  { name: "Lowered", stages: [{ leverId: "G_APL", mode: "fixed", u: 0.5 }, { leverId: "G_APL", mode: "fixed", u: 0.3 }] },
  { name: "Unknown lever", stages: [{ leverId: "F_SEC", mode: "tp" }] },
  { name: "Flat lever", stages: [{ leverId: "W_TRT", mode: "tp" }] },
  { name: "Blocked", stages: [{ leverId: "G_CPL", mode: "tp" }, { leverId: "G_WPL", mode: "tp" }] },
  { name: "Scale-up", stages: [{ leverId: "G_APL", mode: "fixed", u: 0.3 }, { leverId: "G_CPL", mode: "tp" }, { leverId: "G_APL", mode: "fixed", u: 1 }] },
];
// an order constraint the "Fixed" sequence breaks (Agri-environmental measures only after Water allocation policy)
const precedence = [{ before: "G_WPL", after: "G_APL" }];
const R = run(api.runPathwayAnalysis(concepts, edges, settings, { ...baseConfig, expertSequences, precedence }));
const rep = Object.fromEntries(R.expert.map((r) => [r.name, r]));
const byId = new Map(R.candidates.map((c) => [c.id, c]));

ok(R.expert.length === expertSequences.length, "every expert sequence is reported");
ok(single && rep["Same as enumerated"].duplicate && byId.get(rep["Same as enumerated"].id)?.key === single.key, "a sequence equal to an enumerated pathway marks that pathway instead of adding a copy");
ok(byId.get(rep["Same as enumerated"].id).expertNames.includes("Same as enumerated") && !byId.get(rep["Same as enumerated"].id).expertOnly, "the enumerated pathway carries the expert name");
const fx = byId.get(rep["Fixed"].id);
ok(fx && fx.expertOnly && fx.expertNames[0] === "Fixed", "a new expert sequence becomes a candidate flagged as expert");
ok(fx && fx.stages.map((st) => st.u).join() === "0.35,0.6", "fixed intensities are rounded to the intensity grid (0.33 -> 0.35 at 20 steps)");
ok(fx && R.candidates.filter((c) => c.sig === "G_APL>G_WPL" && !c.expertOnly).length === 0, "the order constraint still applies to the enumeration but not to the expert sequence");
{
  // the same stages chained by hand with the engine, from Business-as-Usual
  const eng = api.makePathwayEngine(concepts, edges, api.pathwaySimSettings(settings, baseConfig));
  const bau = eng.equilibrate(eng.initial, [], []).state;
  const s1 = eng.equilibrate(bau, [eng.index.get("G_APL")], [0.35]).state;
  const s2 = eng.equilibrate(s1, [eng.index.get("G_APL"), eng.index.get("G_WPL")], [0.35, 0.6]).state;
  const last = fx.stages[1].outcomes;
  ok(last.every((o) => Math.abs(o.value - s2[eng.index.get(o.id)]) < 1e-12), "an expert pathway's end state is the stage-by-stage equilibrium of the same engine");
  const g = outcomes.reduce((acc, o) => acc + (o.direction === -1 ? -1 : 1) * (s2[eng.index.get(o.id)] - bau[eng.index.get(o.id)]), 0);
  ok(Math.abs(fx.tog - g) < 1e-12 && Math.abs(fx.cii - 0.95) < 1e-12, "TOG and CII of an expert pathway follow the metric definitions");
}
ok(rep["Lowered"].problem && /never lowered/.test(rep["Lowered"].problem) && rep["Lowered"].id === null, "a stage that lowers an intensity is refused, not simulated");
ok(rep["Unknown lever"].problem && rep["Unknown lever"].id === null, "a stage whose lever is not a chosen lever is refused");
ok(rep["Blocked"].problem && /Stage 2: blocked/.test(rep["Blocked"].problem) && rep["Blocked"].id === null, "a transition-point stage for a lever with no improving transition point in the state reached is reported as blocked");
ok(!rep["Flat lever"].problem && !byId.get(rep["Flat lever"].id).admissible, "a lever left out of the enumeration as flat can still be used by experts, and is judged like any other pathway");
const su = byId.get(rep["Scale-up"].id);
ok(su && su.stages[2].scaleUp && su.stages[2].u === 1 && su.stages[2].uPrev === 0.3, "an expert sequence can raise a lever it implemented earlier");
ok(["tog", "cii", "pei", "avgTp", "ebi", "ig"].every((k) => k in fx) && Array.isArray(fx.memberships), "expert pathways get every metric and are classified");
{
  // Section 6.1 of the methods: thresholds over the admissible set, which includes the expert sequences (Step 2 lists them as candidate pathways)
  const adm = R.candidates.filter((c) => c.admissible);
  const ciiS = adm.map((c) => c.cii).sort((x, y) => x - y);
  ok(Math.abs(R.summary.q.cii25 - api.pathwayQuantile(ciiS, 0.25)) < 1e-12, "the effort quartile is taken over the admissible set including the expert pathways");
}
{
  // the setup is remembered with the expert sequences
  store[api.PATHWAY_CONFIG_KEY] = JSON.stringify({ ...baseConfig, expertSequences: [...expertSequences, { name: "bad", stages: "x" }] });
  const back = api.readPathwayConfig();
  ok(back.expertSequences.length === expertSequences.length && back.expertSequences[1].stages[0].mode === "fixed" && back.expertSequences[0].stages[0].mode === "tp", "saved expert sequences are read back, malformed ones dropped");
}

// ---- Robustness: three families -------------------------------------------------------------------------------------
const RR = run(api.runPathwayAnalysis(concepts, edges, settings, { ...baseConfig, expertSequences: expertSequences.slice(0, 2), robustness: true }));
const fam = (k) => RR.robustness.configs.filter((c) => c.family === k);
ok(fam("settings").length === api.pathwayAlternativeSettings(settings).length, `settings family: ${fam("settings").length} alternative simulation settings`);
ok(fam("weights").length === outcomes.length && fam("weights").every((c) => /weighted double/.test(c.label)), "weights family: one variant per outcome, its weight doubled");
ok(fam("thresholds").length === 8, "thresholds family: eight variants (effort quartiles, top share, average-TP cut-offs, EBI cut-off, each both ways)");
ok(RR.robustness.rows.length > 0 && RR.robustness.rows.every((r) => api.PATHWAY_ROBUSTNESS_FAMILIES.every((f) => r.families[f.key].of === fam(f.key).length)), "every tracked pathway is scored in every variant of every family");
ok(RR.robustness.rows.every((r) => r.of === RR.robustness.configs.length && r.sameArchetype <= r.admissible && r.top <= r.admissible && r.admissible <= r.of), "per-pathway totals add up across the families");
ok(RR.robustness.rows.every((r) => r.families.thresholds.admissible === r.families.thresholds.of), "threshold variants re-classify the same pathways, so admissibility never changes there");
ok(RR.robustness.rows.some((r) => r.expertName === "Fixed") || !byId.get(rep["Fixed"].id)?.primary, "a classified expert sequence is tracked by name");
{
  // threshold variants work on copies and leave the main classification untouched
  const before = JSON.stringify(RR.candidates.map((c) => [c.id, c.memberships, c.primary]));
  const copies = RR.candidates.map((c) => ({ ...c }));
  const again = api.classifyPathways(copies, outcomes.length, RR.eps, RR.config.minGainShare);
  ok(JSON.stringify(again.counts) === JSON.stringify(RR.summary.counts), "default thresholds reproduce the main classification");
  ok(JSON.stringify(RR.candidates.map((c) => [c.id, c.memberships, c.primary])) === before, "the robustness run leaves the main pathways' archetypes as they were");
  const cls = (th) => api.classifyPathways(RR.candidates.map((c) => ({ ...c })), outcomes.length, RR.eps, RR.config.minGainShare, { ...api.PATHWAY_THRESHOLD_DEFAULTS, ...th }).counts;
  ok(cls({ top: 0.75 }).hi >= RR.summary.counts.hi && RR.summary.counts.hi >= cls({ top: 0.85 }).hi, "a lower top share admits at least as many High-Impact pathways, a higher one at most as many");
  ok(cls({ ciiLo: 0.3, ciiHi: 0.7 }).lhf >= cls({ ciiLo: 0.2, ciiHi: 0.8 }).lhf, "a wider lowest effort group admits at least as many Low-Hanging Fruit pathways");
  const v = api.pathwayThresholdVariants(20);
  ok(Math.abs(v[4].th.tpLo - (1 / 3 - 0.05)) < 1e-12 && Math.abs(v[5].th.tpHi - 0.55) < 1e-12, "the average-TP cut-offs move by one grid step");
}
console.log("  robustness configs: " + RR.robustness.configs.map((c) => `[${c.family}] ${c.label}: ${c.admissible} of ${c.candidates}`).join(" | "));
console.log("  tracked: " + RR.robustness.rows.map((r) => `${r.expertName ? "expert " + r.expertName : r.sig} ${r.archetype}#${r.rank} ` + api.PATHWAY_ROBUSTNESS_FAMILIES.map((f) => `${f.key} ${r.families[f.key].admissible}/${r.families[f.key].sameArchetype}/${r.families[f.key].top} of ${r.families[f.key].of}`).join(", ")).join(" | "));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
