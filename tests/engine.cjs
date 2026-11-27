// The engine code of src/SpaghettiEngine.jsx, for tests that need the real simulate() rather than a stand-in.
// The engine lives in a React file with imports, so (as in test_relationship_lags.cjs) the plain-JavaScript part
// between "// Utilities" and "function Btn(" is cut out and evaluated with stubs for the browser objects.
// Usage:  const engine = require("./engine.cjs");  engine.simulate(concepts, edges, scenario, settings)
const fs = require("fs");
const path = require("path");
const lines = fs.readFileSync(path.join(__dirname, "..", "src", "SpaghettiEngine.jsx"), "utf8").split("\n");
const idx = (re) => { const i = lines.findIndex((l) => re.test(l)); if (i < 0) throw new Error("engine section not found: " + re); return i; };
const code = lines.slice(idx(/^\/\/ Utilities/) - 1, idx(/^function Btn\(/)).join("\n");
const stub = () => { throw new Error("stub"); };
const store = {};
const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const TR_STUB = "const tr = (x, v) => (v ? x.replace(/\\{(\\w+)\\}/g, (m, q) => (v[q] !== undefined ? String(v[q]) : m)) : x); const getLang = () => \"en\"; const pick = (en) => en;\n";
module.exports = new Function("localStorage", "performance", "ExcelJS", "document", "window", "ELK", "forceSimulation", "forceManyBody", "forceLink", "forceCenter", "forceCollide", "domNodeToPngBlob",
  TR_STUB + "function layoutByModule(c){ return c; }\n" + code + "\nreturn { DEFAULT_SETTINGS, BASELINE_SCENARIO, simulate, sanitizeModel, edgeLag };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);
