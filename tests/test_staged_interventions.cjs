// Staged interventions: a held concept with a start, a duration and a ramp. Run from the project folder:
//   node tests/test_staged_interventions.cjs
// Checks: no timing (or an empty one) is the ordinary hold; a start delays the measure, a duration releases it, and a
// ramp phases it in linearly from the concept's own value; a run cannot settle before the last change; a timed measure
// that is never released ends in the same settled state as an untimed one; and imported timings are cleaned.
const engine = require("./engine.cjs");

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };
const close = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const S = { ...engine.DEFAULT_SETTINGS };

// A (a measure) raises B, B raises C; A starts at 0.
const concepts = [{ id: "A", name: "A", initialValue: 0 }, { id: "B", name: "B", initialValue: 0 }, { id: "C", name: "C", initialValue: 0 }];
const edges = [{ id: "ab", source: "A", target: "B", weight: 0.6 }, { id: "bc", source: "B", target: "C", weight: 0.5 }];
const sc = (timing) => ({ id: "s", initialOverrides: { A: 1 }, lockedConcepts: { A: 1 }, weightOverrides: {}, ...(timing ? { timing: { A: timing } } : {}) });
const run = (timing, settings = S) => engine.simulate(concepts, edges, sc(timing), settings);
const at = (r, t, id) => r.series[t].values[id];

// ---- no timing ---------------------------------------------------------------------------------------------------------------
const plain = run(null);
for (const t of [{}, { start: 0, duration: 0, ramp: 0 }, { ramp: 1 }, { start: "x" }]) {
  const r = run(t);
  ok(JSON.stringify(r.series) === JSON.stringify(plain.series), `timing ${JSON.stringify(t)} is the ordinary hold`);
}
ok(engine.interventionTiming({ start: 3.4, duration: -2, ramp: 1 }).start === 3 && engine.interventionTiming({ start: 3.4, duration: -2 }).duration === 0, "timings are whole numbers, negatives read as 0");

// ---- start -------------------------------------------------------------------------------------------------------------------
const late = run({ start: 5 });
ok([0, 1, 2, 3, 4].every((t) => at(late, t, "A") === 0), "before its start the measure is not held (A stays at its own value 0)");
ok([0, 1, 2, 3, 4, 5].every((t) => at(late, t, "B") === 0), "and B does not move before the measure acts");
ok(at(late, 5, "A") === 1 && at(late, 6, "B") > 0, "from iteration 5 A is held at 1, and B moves one iteration later");
ok(late.converged && Object.keys(plain.final).every((id) => close(late.final[id], plain.final[id], 1e-3)), "a later start ends in the same settled state");
ok(late.iterationsRun > plain.iterationsRun, "but takes longer to get there");

// ---- duration ----------------------------------------------------------------------------------------------------------------
const pulse = run({ duration: 3 }, { ...S, updateRule: "absolute" });
ok([0, 1, 2].every((t) => at(pulse, t, "A") === 1), "held for 3 iterations (0, 1 and 2)");
ok(at(pulse, 3, "A") === 0, "then released: with the absolute rule and no causes, A falls to 0 at once");
ok(pulse.converged && close(pulse.final.C, 0, 1e-3), "a pulse leaves no lasting effect in this map");
const pulseRel = run({ duration: 3 });
ok(at(pulseRel, 3, "A") < 1 && at(pulseRel, 3, "A") > 0.5, "with the relative rule a released measure fades gradually");

// ---- ramp --------------------------------------------------------------------------------------------------------------------
const ramp = run({ ramp: 4 });
ok([0, 1, 2, 3].every((t) => close(at(ramp, t, "A"), (t + 1) / 4)), "phased in over 4 iterations: 0.25, 0.5, 0.75, 1");
ok(at(ramp, 10, "A") === 1, "and held at 1 afterwards");
const late2 = run({ start: 3, ramp: 2 });
ok(at(late2, 2, "A") === 0 && close(at(late2, 3, "A"), 0.5) && at(late2, 4, "A") === 1, "a ramp after a later start starts from the concept's value just before");
const down = engine.simulate(concepts, edges, { id: "d", initialOverrides: {}, lockedConcepts: { A: -0.5 }, weightOverrides: {}, timing: { A: { ramp: 5 } } }, S);
ok(close(at(down, 0, "A"), -0.1) && close(at(down, 4, "A"), -0.5), "a ramp downwards works the same way");

// ---- convergence -------------------------------------------------------------------------------------------------------------
// C has no route from A, so without the measure everything is calm from the start; a measure starting at 30 must
// still be reached before the run is called settled.
const calmMap = engine.simulate([{ id: "A", name: "A", initialValue: 0 }, { id: "B", name: "B", initialValue: 0 }], [{ id: "ab", source: "A", target: "B", weight: 0.6 }], { id: "c", initialOverrides: {}, lockedConcepts: { A: 1 }, weightOverrides: {}, timing: { A: { start: 30 } } }, S);
ok(calmMap.converged && calmMap.iterationsRun > 30 && calmMap.final.B > 0.3, "a run cannot settle before the last change of a measure");
ok(engine.lastTimingEvent({ lockedConcepts: { A: 1, B: 1 }, timing: { A: { start: 5, ramp: 3 }, B: { start: 2, duration: 10 } } }) === 12, "the last change is the latest of start + ramp - 1 and start + duration");
const capped = run({ start: 150 });
ok(!capped.converged, "a measure starting after the iteration cap leaves the run unsettled, as it should");

// ---- the other update mode and with lags -------------------------------------------------------------------------------------
const asy = engine.simulate(concepts, edges, sc({ start: 4 }), { ...S, mode: "asynchronous" }, () => 0.3);
ok([0, 1, 2, 3].every((t) => at(asy, t, "A") === 0) && at(asy, 4, "A") === 1, "asynchronous mode follows the same timing");
const lagged = engine.simulate(concepts, [{ ...edges[0], lag: 2 }, edges[1]], sc({ start: 3 }), S);
ok(at(lagged, 5, "B") === 0 && at(lagged, 6, "B") > 0, "with a lag of 2 the measure from iteration 3 reaches B in iteration 6");

// ---- import ------------------------------------------------------------------------------------------------------------------
const clean = engine.sanitizeModel({ concepts, edges, scenarios: [{ id: "s", name: "S", initialOverrides: { A: 1 }, lockedConcepts: { A: 1 }, weightOverrides: {}, timing: { A: { start: "4", ramp: 2.2 }, B: { start: 3 }, Z: { start: 1 } } }] });
const st = clean.scenarios.find((s) => s.id === "s").timing;
ok(st && st.A.start === 4 && st.A.ramp === 2 && !st.B && !st.Z, "imported timing is kept for held concepts only, as whole numbers");
const none = engine.sanitizeModel({ concepts, edges, scenarios: [{ id: "s", name: "S", initialOverrides: {}, lockedConcepts: { A: 1 }, weightOverrides: {}, timing: { A: {} } }] });
ok(!("timing" in none.scenarios.find((s) => s.id === "s")), "an empty timing is dropped, so older files are unchanged");
ok(engine.describeTiming({ start: 5, duration: 10, ramp: 3 }) === "from iteration 5, for 10 iterations, phased in over 3", "a timing is described in words");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
