// Game mode rules (src/game/gameEngine.js) on the Geul game pack.
// Run from the project folder:  node tests/test_game_engine.mjs
//
// The engine functions the game relies on (simulate, computeMetrics,
// checkModel, the loop enumeration) are loaded straight from
// src/SpaghettiEngine.jsx, as in the other tests, so the game is checked
// against the same code the tabs use.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  newGame, cleanGame, roundChecks, canFinishRound, craftPoints, pendingPredictions, scorePrediction,
  checkProposal, totals, outcome, gameLogRows, roundTabs, direction,
} from "../src/game/gameEngine.js";
import { GEUL_PACK as pack } from "../src/game/geulPack.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const lines = fs.readFileSync(path.join(here, "..", "src", "SpaghettiEngine.jsx"), "utf8").split("\n");
const idx = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; throw new Error("not found " + re); };
const part = (a, b) => lines.slice(a, b).join("\n");
const code = [
  part(idx(/^\/\/ Utilities/) - 1, idx(/^function Btn\(/)),
  part(idx(/^const UNCATEGORIZED_MODULE/), idx(/^\/\/ The modules a view actually includes/)),
  part(idx(/^\/\/ Levenshtein distance/), idx(/^function ModelCheck\(/)),
].join("\n");
const stub = () => { throw new Error("stub"); };
const ls = { getItem: () => null, setItem() {}, removeItem() {} };
const deps = new Function("localStorage", "performance", "ExcelJS", "document", "window", "ELK", "forceSimulation", "forceManyBody", "forceLink", "forceCenter", "forceCollide", "domNodeToPngBlob",
  "function layoutByModule(c){ return c; }\n" + code + "\nreturn { simulate, computeMetrics, checkModel, enumerateFeedbackLoops, BASELINE_SCENARIO, DEFAULT_SETTINGS };")(ls, { now: () => Date.now() }, {}, {}, {}, class {}, stub, stub, stub, stub, stub, stub);

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg); } };

// ---- a team's map that matches the Geul example ------------------------------------------
const START = { REGEN: 0.6, DROOG: 0.6, BOUW: 0.6 };
const concepts = pack.concepts.map((c, i) => ({
  id: `c_${c.id.toLowerCase()}`, card: c.id, name: c.name, category: c.module, description: c.hint,
  initialValue: 0, currentValue: 0, position: { x: i * 100, y: 0 },
}));
const cid = (card) => `c_${card.toLowerCase()}`;
const E = [
  ["REGEN", "REGEN", 0.93], ["DROOG", "DROOG", 0.93], ["BOUW", "BOUW", 0.93],
  ["REGEN", "BELGIE", 0.75], ["REGEN", "HEUVEL", 0.5], ["REGEN", "BODEM", 0.25], ["DROOG", "BODEM", -0.5], ["DROOG", "DROOGVAL", 0.5],
  ["HEUVEL", "BODEM", -0.25], ["BELGIE", "OVER", 0.5], ["HEUVEL", "OVER", 0.25], ["BOUW", "OVER", 0.5], ["BOUW", "HEUVEL", 0.25],
  ["BODEM", "DROOGVAL", -0.75], ["DROOGVAL", "NATUUR", -0.5], ["VAST", "HEUVEL", -0.5], ["VAST", "BELGIE", -0.25], ["VAST", "BODEM", 0.25],
  ["RUIMTE", "OVER", -0.5], ["RUIMTE", "NATUUR", 0.5], ["MUUR", "OVER", -0.5], ["MUUR", "BOUW", 0.25], ["MUUR", "NATUUR", -0.25],
];
const edges = E.map(([s, t, w], i) => ({ id: `e${i}`, source: cid(s), target: cid(t), weight: w, description: i % 2 ? "card" : "" }));
const settings = { ...deps.DEFAULT_SETTINGS, lambda: 0.6 };
const scenarios = [{ ...deps.BASELINE_SCENARIO }];
const R = (id) => pack.rounds.find((r) => r.id === id);
const ctxOf = (game, over = {}) => ({ concepts, edges, scenarios, settings, game, ...over });

// ---- starting a game -------------------------------------------------------------------------
const g0 = newGame(pack, "  Table 2 ");
ok(g0.team === "Table 2" && g0.round === "r1" && g0.packId === pack.id, "newGame starts in round 1 with a trimmed team name");
ok(JSON.stringify(cleanGame(JSON.parse(JSON.stringify(g0)))) === JSON.stringify(g0), "a saved game state survives cleanGame unchanged");
ok(cleanGame({ packId: "nope" }) === null && cleanGame(null) === null, "an unknown pack or no game gives no game");
ok(cleanGame({ ...g0, round: "r9", eventId: "flood" }).round === "r1" && cleanGame({ ...g0, eventId: "flood" }).eventId === null, "cleanGame repairs an unknown round and event");
ok([...roundTabs(pack, g0)].sort().join() === "about,editor,network", "round 1 opens the Network tab, the Model editor and About");

// ---- round 1 ----------------------------------------------------------------------------------
{
  const empty = roundChecks(pack, R("r1"), ctxOf(g0, { concepts: [], edges: [] }), deps);
  ok(!canFinishRound(empty), "an empty map cannot finish round 1");
  const full = roundChecks(pack, R("r1"), ctxOf(g0, { edges: [] }), deps);
  ok(canFinishRound(full), "12 named, defined concepts in modules finish round 1");
  const cp = craftPoints(R("r1"), ctxOf(g0, { edges: [] }), deps);
  ok(cp.points === 12 + 3, `round 1 craft: 12 definitions + clean bonus = 15 (got ${cp.points})`);
  const typo = concepts.map((c, i) => (i === 0 ? { ...c, category: "Climat" } : c));
  ok(!canFinishRound(roundChecks(pack, R("r1"), ctxOf(g0, { concepts: typo, edges: [] }), deps)), "look-alike modules (Climat / Climate) block round 1");
  const undefinedOne = concepts.map((c, i) => (i === 0 ? { ...c, description: "" } : c));
  ok(canFinishRound(roundChecks(pack, R("r1"), ctxOf(g0, { concepts: undefinedOne, edges: [] }), deps)), "a missing definition costs points but does not block round 1");
}

// ---- round 2 ----------------------------------------------------------------------------------
{
  const ctx = ctxOf({ ...g0, round: "r2" });
  ok(canFinishRound(roundChecks(pack, R("r2"), ctx, deps)), "the Geul relationships finish round 2");
  const cp = craftPoints(R("r2"), ctx, deps);
  const described = edges.filter((e) => e.description).length;
  ok(cp.points === described + 3, `round 2 craft: ${described} descriptions + clean bonus (got ${cp.points})`);
  const strong = edges.map((e, i) => (i < 6 ? { ...e, weight: 1 } : e));
  const chk = roundChecks(pack, R("r2"), ctxOf(g0, { edges: strong }), deps).find((c) => c.id === "strengthBudget");
  ok(!chk.done, "six Very strong relationships break the two-token budget");
}

// ---- round 3 ----------------------------------------------------------------------------------
{
  const game = { ...g0, round: "r3" };
  const ctx = ctxOf(game);
  ok(pendingPredictions(pack, game, "metrics", ctx).length === 3, "Influence Metrics waits for three predictions in round 3");
  ok(pendingPredictions(pack, game, "network", ctx).length === 0, "the Network tab is never gated");
  const metrics = deps.computeMetrics(concepts, edges).sort((a, b) => b.netInfluence - a.netInfluence);
  const pDriver = R("r3").predictions[0], pReceiver = R("r3").predictions[1], pLoop = R("r3").predictions[2];
  ok(scorePrediction(pack, pDriver, metrics[0].id, ctx, deps).points === 2, `the top driver (${metrics[0].name}) scores 2`);
  ok(scorePrediction(pack, pDriver, metrics.at(-1).id, ctx, deps).points === 0, "the strongest receiver is not a driver");
  ok(scorePrediction(pack, pReceiver, metrics.at(-1).id, ctx, deps).points === 2, `the top receiver (${metrics.at(-1).name}) scores 2`);
  ok(scorePrediction(pack, pLoop, { none: true }, ctx, deps).points === 2, "the Geul map has no loop of two or more concepts (self-loops do not count)");
  const looped = [...edges, { id: "eL", source: cid("OVER"), target: cid("MUUR"), weight: 0.5, description: "" }];
  const lctx = ctxOf(game, { edges: looped });
  ok(scorePrediction(pack, pLoop, { ids: [cid("MUUR"), cid("OVER")] }, lctx, deps).points === 2, "Walls -> Flooding -> Walls is found as a loop");
  ok(scorePrediction(pack, pLoop, { ids: [cid("MUUR"), cid("BOUW"), cid("OVER")] }, lctx, deps).points === 2, "Walls -> Building -> Flooding -> Walls is found as a loop");
  ok(scorePrediction(pack, pLoop, { ids: [cid("VAST"), cid("OVER")] }, lctx, deps).points === 0, "two concepts that share no loop score nothing");
  ok(scorePrediction(pack, pLoop, { none: true }, lctx, deps).points === 0, "\"no loop\" is wrong once a loop exists");
}

// ---- round 4 ----------------------------------------------------------------------------------
{
  const game = { ...g0, round: "r4" };
  const pZero = R("r4").predictions[0], pGoals = R("r4").predictions[1];
  ok(pendingPredictions(pack, game, "equilibrium", ctxOf(game)).map((p) => p.id).join() === "p-zero", "round 4 first asks about the all-zero run");
  const zeroRun = deps.simulate(concepts, edges, deps.BASELINE_SCENARIO, settings);
  ok(Object.values(zeroRun.final).every((v) => v === 0), "the engine confirms: an all-zero map stays at zero");
  ok(scorePrediction(pack, pZero, 0, ctxOf(game), deps).points === 3 && scorePrediction(pack, pZero, 3, ctxOf(game), deps).points === 0, "\"Everything stays at 0\" scores 3, other answers 0");
  const answered = { ...game, predictions: { "p-zero": { points: 3 } } };
  ok(pendingPredictions(pack, answered, "equilibrium", ctxOf(answered)).length === 0, "the goal question waits until starting values are set");
  const started = concepts.map((c) => ({ ...c, initialValue: START[c.card] ?? 0 }));
  const sctx = ctxOf(answered, { concepts: started });
  ok(pendingPredictions(pack, answered, "equilibrium", sctx).map((p) => p.id).join() === "p-goals", "with starting values set, the goal question gates the tab");
  const run = deps.simulate(started, edges, deps.BASELINE_SCENARIO, settings);
  const truth = Object.fromEntries(pack.goals.map((g) => [g.card, direction(run.final[cid(g.card)] - 0)]));
  ok(scorePrediction(pack, pGoals, truth, sctx, deps).points === 6, `three right goal directions score 6 (${JSON.stringify(truth)})`);
  ok(truth.OVER === "up", "with today's pressures, flooding settles higher than its start of 0");
}

// ---- round 5 ----------------------------------------------------------------------------------
{
  const started = concepts.map((c) => ({ ...c, initialValue: START[c.card] ?? 0 }));
  const locks = (cards) => Object.fromEntries(cards.map((k) => [cid(k), 1]));
  const sc = (id, cards) => ({ id, name: id, type: "intervention", description: "", initialOverrides: locks(cards), lockedConcepts: locks(cards), weightOverrides: {} });
  const green = sc("green", ["REGEN", "RUIMTE", "VAST"]);
  const all = sc("all", ["REGEN", "RUIMTE", "VAST", "MUUR"]);
  const walls = sc("walls", ["REGEN", "MUUR"]);
  const noEvent = sc("noevent", ["RUIMTE", "VAST"]);
  const scs = [{ ...deps.BASELINE_SCENARIO }, green, all, walls, noEvent];
  const game = { ...g0, round: "r5", eventId: "rain" };
  const ctx = ctxOf(game, { concepts: started, scenarios: scs });
  ok(checkProposal(pack, game, green, started).errors.length === 0 && checkProposal(pack, game, green, started).cost === 5, "the green path costs 5 and is a valid proposal");
  ok(checkProposal(pack, game, all, started).errors.some((e) => e.includes("budget")), "all three measures (cost 7) exceed the budget of 6");
  ok(checkProposal(pack, game, noEvent, started).errors.some((e) => e.includes("event")), "a proposal without the event card is refused");
  ok(checkProposal(pack, { ...game, eventId: null }, green, started).errors.some((e) => e.includes("Draw")), "no proposal before the event card is drawn");
  ok(roundChecks(pack, R("r5"), ctx, deps).find((c) => c.id === "twoScenarios").done, "four scenarios meet the two-scenario check");
  const p = R("r5").predictions[0];
  const res = scorePrediction(pack, p, { scenarioId: "green", directions: { OVER: "down", DROOGVAL: "down", NATUUR: "up" } }, ctx, deps);
  ok(res.points === 6, `the green path: flooding and drying down, nature up, all predicted right (got ${res.points})`);
  ok(res.noTradeOff && res.shared === 5 * 2 + 3, `the green path helps all five roles with no trade-off: 13 shared points (got ${res.shared})`);
  const wres = scorePrediction(pack, p, { scenarioId: "walls", directions: {} }, ctx, deps);
  ok(!wres.noTradeOff && wres.roles.find((r) => r.role.startsWith("Nature")).result === "worse", "walls alone leave nature worse off: a trade-off, no bonus");
  ok(pendingPredictions(pack, game, "scenarios", ctx).length === 1, "Run simulation waits for the proposal");

  // ---- totals ----
  const done = { ...game, roundPoints: { r1: { craft: 15 }, r2: { craft: 14 } }, predictions: { a: { points: 6 }, "p-proposal": { points: 6, shared: 13, noTradeOff: true, items: res.items, roles: res.roles } } };
  const t = totals(done);
  ok(t.craft === 29 && t.insight === 12 && t.shared === 13 && t.total === 54, "totals add craft, insight and shared goal points");
  ok(outcome(pack, done).won, "54 points and no trade-off win the game (target 45)");
  ok(!outcome(pack, { ...done, predictions: { ...done.predictions, "p-proposal": { ...done.predictions["p-proposal"], noTradeOff: false } } }).won, "a trade-off loses the game whatever the score");
  const rows = gameLogRows(pack, done);
  ok(rows[0][0] === "Round" && rows.at(-1)[0] === "Total" && rows.at(-1)[5] === 54, "the game log has a header and a total row");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
