// Transition Pathway Analysis, setup fields left blank. Run from the project folder:
//   node tests/test_pathway_blank_inputs.cjs
//
// A number field the user has just cleared holds "", and Number("") is 0. An outcome weight or the flat-response
// threshold left blank must fall back to its default rather than count as 0. The test loads the engine code straight
// from src/SpaghettiEngine.jsx, so it needs no build.
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
  "function layoutByModule(c){ return c; }\n" + code + "\nreturn { makeTemplate, pathwayNumberOr, DEFAULT_SETTINGS, makePathwayEngine, pathwaySimSettings, pathwayLeverValue, runPathwayAnalysis, classifyPathways, pathwayQuantile, pathwayThresholdVariants, pathwayAlternativeSettings, PATHWAY_THRESHOLD_DEFAULTS, PATHWAY_ROBUSTNESS_FAMILIES, DEFAULT_PATHWAY_CONFIG, PATHWAY_CONFIG_KEY, readPathwayConfig, pathwayKeyOf };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const run = (gen) => { let r; do { r = gen.next(); } while (!r.done); return r.value; };
const summary = (R) => JSON.stringify(R.candidates.map((c) => [c.key, Math.round(c.tog * 1e6), c.admissible]));

ok(api.pathwayNumberOr("", 1) === 1 && api.pathwayNumberOr(null, 1) === 1 && api.pathwayNumberOr("abc", 1) === 1, "a blank or non-numeric field takes the fallback");
ok(api.pathwayNumberOr("0", 1) === 0 && api.pathwayNumberOr("0.5", 1) === 0.5, "an explicit number, 0 included, is kept");

const { concepts, edges } = api.makeTemplate("nexus");
const settings = { ...api.DEFAULT_SETTINGS };
const levers = ["G_CPL", "G_APL", "G_WPL"].map((id) => ({ id, direction: "increase", effort: 1 }));
const outcomes = [{ id: "F_SEC", direction: 1, weight: 1, target: "" }, { id: "C_BIO", direction: 1, weight: 1, target: "" }, { id: "C_GHG", direction: -1, weight: 1, target: "" }];
const base = { ...api.DEFAULT_PATHWAY_CONFIG, levers, outcomes, maxLength: 2, resolution: 20 };
const ref = run(api.runPathwayAnalysis(concepts, edges, settings, base));

const blankWeight = run(api.runPathwayAnalysis(concepts, edges, settings, { ...base, outcomes: outcomes.map((o, i) => (i === 0 ? { ...o, weight: "" } : o)) }));
ok(summary(blankWeight) === summary(ref), "a blank outcome weight counts as 1, not 0");
const zeroWeight = run(api.runPathwayAnalysis(concepts, edges, settings, { ...base, outcomes: outcomes.map((o, i) => (i === 0 ? { ...o, weight: "0" } : o)) }));
ok(summary(zeroWeight) !== summary(ref), "an explicit weight of 0 still drops the outcome from the gain");

const blankFlat = run(api.runPathwayAnalysis(concepts, edges, settings, { ...base, flatThreshold: "" }));
ok(summary(blankFlat) === summary(ref) && blankFlat.eps === api.DEFAULT_PATHWAY_CONFIG.flatThreshold, "a blank flat-response threshold takes the default");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
