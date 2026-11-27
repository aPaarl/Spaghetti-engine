// Generates the yearly observations of the peat meadow worked example (PEAT_DATA_CSV in src/workedExamples.js).
// Run from the project folder:  node tools/make_worked_example_data.mjs
//
// The data are made from the map itself, so that the true weights are known and the weight suggestion of the
// Empirical data dialog can be checked against them: the system starts in today's settled state (2010); from
// 2011 the ditch water level is raised step by step to 0.8 (2016), and in 2019 the drainage subsidy is halved.
// Each year is one synchronous iteration of the engine's update (relative rule, tanh, with the relationship
// delays). Observation noise (uniform, at most 0.01 on the -1..+1 scale, seeded) is added, and every value is
// written in the units of PEAT_UNITS, rounded to one decimal.
import { PEAT_TODAY, PEAT_UNITS } from "../src/workedExamples.js";
import { createRequire } from "node:module";
const engine = createRequire(import.meta.url)("../tests/engine.cjs");

const rand = ((a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(2026);
const { concepts, edges } = PEAT_TODAY;
const drivers = (year) => ({ wl: Math.min(0.8, 0.2 + 0.1 * Math.max(0, year - 2010)), sub: year >= 2019 ? 0.3 : 0.6 });
const d0 = drivers(2010);
const settled = engine.simulate(concepts, edges, { initialOverrides: d0, lockedConcepts: d0, weightOverrides: {} }, engine.DEFAULT_SETTINGS).final;
const lag = (e) => e.lag || 0;
const states = [{ ...settled }];
for (let year = 2011; year <= 2022; year++) {
  const t = states.length - 1;
  const at = (k) => states[Math.max(0, k)];
  const next = {};
  concepts.forEach((c) => {
    const inc = edges.filter((e) => e.target === c.id);
    next[c.id] = inc.length ? Math.tanh(at(t)[c.id] + inc.reduce((s, e) => s + e.weight * at(t - lag(e))[e.source], 0)) : at(t)[c.id];
  });
  Object.assign(next, drivers(year));
  states.push(next);
}
const ids = concepts.map((c) => c.id);
const head = ["Year", ...ids.map((id) => concepts.find((c) => c.id === id).name)];
const rows = states.map((s, k) => [String(2010 + k), ...ids.map((id) => {
  const noisy = Math.max(-1, Math.min(1, s[id] + (rand() * 2 - 1) * 0.01));
  const [lo, hi] = PEAT_UNITS[id].range;
  return (lo + ((noisy + 1) / 2) * (hi - lo)).toFixed(1).replace(".", ",");
})]);
console.log([head, ...rows].map((r) => r.join(";")).join("\n"));
