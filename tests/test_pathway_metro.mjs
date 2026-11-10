// Metro map layout of the Transition Pathways tab (src/pathwayMetroLayout.js).
// Run from the project folder:  node tests/test_pathway_metro.mjs
import { metroRows, outcomeCodes, metroTicks } from "../src/pathwayMetroLayout.js";

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };

// Candidates as the pathway analysis builds them: every prefix is a candidate.
let id = 0;
const cand = (levers, ciis, tog, to = 0, converged = true) => ({
  id: ++id, converged, tog, to, cii: ciis[ciis.length - 1],
  stages: levers.map((l, i) => ({ leverId: l, scaleUp: false, ciiAfter: ciis[i], outcomes: [] })),
});
const gov = cand(["gov"], [0.85], 1.99);
const pay = cand(["pay"], [0.6], 1.81);
const gw = cand(["gw"], [0.5], 1.66);
const govPay = cand(["gov", "pay"], [0.85, 1.0], 3.6);
const govPrem = cand(["gov", "prem"], [0.85, 1.1], 3.65);
const govPayPrem = cand(["gov", "pay", "prem"], [0.85, 1.0, 1.05], 3.64);
const payGov = cand(["pay", "gov"], [0.6, 1.4], 2.09, 1);
const broken = cand(["gw", "pay"], [0.5, 0.9], 9, 0, false);
const all = [gov, pay, gw, govPay, govPrem, govPayPrem, payGov, broken];

const rows = metroRows(all, { top: 2 });
const ids = rows.map((r) => r.c.id);
ok(ids.includes(govPrem.id) && ids.includes(govPayPrem.id), "the top 2 converged routes are drawn");
ok(!ids.includes(broken.id), "a route that did not converge is left out, whatever its gain");
ok(ids.includes(gov.id) && ids.includes(govPay.id), "the shorter routes they grow out of are added");
ok(!ids.includes(pay.id) && !ids.includes(payGov.id), "routes outside the top and not on their way are left out");
ok(rows.every((r, i) => i === 0 || rows[i - 1].depth <= r.depth), "rows are ordered by length");
const r3 = rows.find((r) => r.c.id === govPayPrem.id);
ok(r3.parentId === govPay.id && r3.start === 0.85 && r3.transfers.join() === "0.85,1", "a three-stage route starts after its first stage, with open circles at 0.85 and 1.00");
ok(rows.find((r) => r.c.id === gov.id).start === 0 && rows.find((r) => r.c.id === gov.id).transfers.length === 0, "an opening move runs from 0 with no transfer");

const withSel = metroRows(all, { top: 1, extraIds: [payGov.id] });
const pg = withSel.find((r) => r.c.id === payGov.id);
ok(!!pg && pg.endKind === "tipping" && pg.parentId === pay.id, "the selected route is added, with its parent, and a trade-off ends at a tipping point");

const orphan = cand(["x", "y"], [0.3, 0.7], 5);
const o = metroRows([orphan], { top: 3 })[0];
ok(o.parentId === null && o.start === 0 && o.transfers.join() === "0.3", "a route without its shorter route in the analysis is drawn in full from 0");

ok(outcomeCodes(["Food production", "Carbon", "Biodiversity"]).join() === "F,C,B", "outcome codes are first letters");
ok(outcomeCodes(["Groundwater", "Gains", "Grass"]).join() === "Gr,Ga,Gra", "no outcome code clashes with G or with each other");
// one line piece per stage, in that stage's lever
ok(r3.segments.map((g) => `${g.leverId}:${g.from}-${g.to}`).join() === "pay:0.85-1,prem:1-1.05", "a combined route has one piece per stage after its opening, each with its lever");
ok(o.segments.length === 2 && o.segments[0].from === 0, "a route drawn in full has a piece for every stage");

// sorting
const dirOutcome = (v) => [{ id: "food", value: v }];
[gov, pay, gw].forEach((c, i) => { c.stages[c.stages.length - 1].outcomes = dirOutcome([0.2, 0.9, -0.5][i]); });
const byTog = metroRows([gov, pay, gw], { top: 3, sort: "tog" }).map((r) => r.c.id);
ok(byTog.join() === [gov.id, pay.id, gw.id].join(), "sorted by total outcome gain, highest first");
const byCii = metroRows([gov, pay, gw], { top: 3, sort: "cii" }).map((r) => r.c.id);
ok(byCii.join() === [gw.id, pay.id, gov.id].join(), "sorted by intensity, lowest CII first");
const byFood = metroRows([gov, pay, gw], { top: 3, sort: "outcome:food", dirs: { food: 1 } }).map((r) => r.c.id);
ok(byFood.join() === [pay.id, gov.id, gw.id].join(), "sorted by an outcome, best first");
const byFoodLow = metroRows([gov, pay, gw], { top: 3, sort: "outcome:food", dirs: { food: -1 } }).map((r) => r.c.id);
ok(byFoodLow.join() === [gw.id, gov.id, pay.id].join(), "where lower is better, the lowest end state comes first");
ok(metroRows([gov, pay, gw], { top: 1, sort: "outcome:food", dirs: { food: 1 } })[0].c.id === pay.id, "sorting by an outcome also picks the top routes by it");
ok(metroRows([gov, pay, gw], { top: 3, sort: "tog", reverse: true })[0].c.id === gw.id, "reverse flips the order");

const t = metroTicks(1.4);
ok(t.ticks[0] === 0 && t.end >= 1.4 && t.ticks.length <= 9, `ticks cover the range (${t.ticks.join(" ")})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
