// ============================================================================
// Game mode: the rules
// ============================================================================
// Pure functions, no React and no DOM, so the same code runs in the app and in
// node tests. Every check and every score is computed from the model (concepts,
// relationships, scenarios, settings), the game pack and the game state. The
// engine's own functions (simulate, computeMetrics, checkModel, the loop
// enumeration) are passed in as `deps`, so the game never computes anything in
// a way the analysis tabs would not.
//
// The game state is stored with the model, under `game`:
//   { packId, team, startedAt, round, roundsDone, predictions, roundPoints,
//     reflections, eventId, finishedAt }

import { GEUL_PACK } from "./geulPack.js";

export const PACKS = { [GEUL_PACK.id]: GEUL_PACK };
export const DEFAULT_PACK_ID = GEUL_PACK.id;
export const getPack = (id) => PACKS[id] || null;

// A change smaller than this counts as "about the same".
export const DIRECTION_TOLERANCE = 0.01;

export function newGame(pack, team) {
  return {
    packId: pack.id, team: String(team || "").trim() || "Our team", startedAt: Date.now(),
    round: pack.rounds[0].id, roundsDone: [], predictions: {}, roundPoints: {}, reflections: {},
    eventId: null, finishedAt: null,
  };
}

// Keeps only a well-formed game state (for a model read from storage or a file).
export function cleanGame(raw) {
  if (!raw || typeof raw !== "object" || !getPack(raw.packId)) return null;
  const pack = getPack(raw.packId);
  const roundIds = new Set(pack.rounds.map((r) => r.id));
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  return {
    packId: raw.packId,
    team: String(raw.team ?? "Our team"),
    startedAt: Number(raw.startedAt) || Date.now(),
    round: roundIds.has(raw.round) ? raw.round : pack.rounds[0].id,
    roundsDone: Array.isArray(raw.roundsDone) ? raw.roundsDone.filter((r) => roundIds.has(r)) : [],
    predictions: obj(raw.predictions),
    roundPoints: obj(raw.roundPoints),
    reflections: obj(raw.reflections),
    eventId: pack.events.some((e) => e.id === raw.eventId) ? raw.eventId : null,
    finishedAt: Number(raw.finishedAt) || null,
  };
}

export const roundIndex = (pack, id) => pack.rounds.findIndex((r) => r.id === id);
export const currentRound = (pack, game) => pack.rounds[Math.max(0, roundIndex(pack, game.round))];
export const cardConcept = (concepts, cardId) => concepts.find((c) => c.card === cardId) || null;
export const cardOf = (pack, cardId) => pack.concepts.find((c) => c.id === cardId) || null;
export const eventOf = (pack, game) => pack.events.find((e) => e.id === game?.eventId) || null;

// The tabs the round opens (About always stays reachable).
export function roundTabs(pack, game) {
  if (!game || game.finishedAt) return null;
  return new Set([...currentRound(pack, game).tabs, "about"]);
}

const isNamed = (c) => !!c.name?.trim() && !/^New concept \d+$/.test(c.name.trim());
const VERY_STRONG = 0.99;

// ---- checks ----------------------------------------------------------------------

function checkDef(id, pack, round, ctx, deps) {
  const { concepts, edges, scenarios, game } = ctx;
  const issues = () => deps.checkModel(concepts, edges);
  switch (id) {
    case "conceptCount": {
      const n = concepts.length;
      return { label: "8 to 14 concepts", done: n >= 8 && n <= 14, required: true, detail: `${n} now` };
    }
    case "allNamed": {
      const n = concepts.filter((c) => !isNamed(c)).length;
      return { label: "Every concept has a name", done: concepts.length > 0 && n === 0, required: true, detail: n ? `${n} still to name` : "" };
    }
    case "uniqueNames":
      return { label: "No name is used twice", done: !issues().some((i) => i.id === "dupes"), required: true };
    case "allInModule": {
      const n = concepts.filter((c) => !c.category?.trim()).length;
      return { label: "Every concept is in a module", done: concepts.length > 0 && n === 0, required: true, detail: n ? `${n} without a module` : "" };
    }
    case "noLookAlikeModules":
      return { label: "No module names that look alike", done: !issues().some((i) => i.id.startsWith("similar-")), required: true };
    case "allDefined": {
      const n = concepts.filter((c) => c.description?.trim()).length;
      return { label: "Every concept has a definition (1 point each)", done: concepts.length > 0 && n === concepts.length, required: false, detail: `${n} of ${concepts.length}` };
    }
    case "enoughEdges": {
      const need = Math.max(1, concepts.length - 1);
      return { label: `At least ${need} relationships`, done: edges.length >= need, required: true, detail: `${edges.length} now` };
    }
    case "noIsolated": {
      const iss = issues().find((i) => i.id === "isolated");
      return { label: "Every concept is connected", done: edges.length > 0 && !iss, required: true, detail: iss ? `${iss.concepts.length} not connected` : "" };
    }
    case "noZeroWeights":
      return { label: "No relationship has weight 0", done: !issues().some((i) => i.id === "zero"), required: true };
    case "strengthBudget": {
      const tokens = round.veryStrongTokens ?? 2;
      const n = edges.filter((e) => Math.abs(e.weight) >= VERY_STRONG).length;
      return { label: `At most ${tokens} Very strong relationships`, done: n <= tokens, required: true, detail: `${n} used` };
    }
    case "allDescribed": {
      const n = edges.filter((e) => e.description?.trim()).length;
      return { label: "Every relationship has a Description (1 point each)", done: edges.length > 0 && n === edges.length, required: false, detail: `${n} of ${edges.length}` };
    }
    case "predictionsDone": {
      const preds = round.predictions || [];
      const n = preds.filter((p) => game.predictions[p.id]).length;
      return { label: "Predictions entered and checked", done: n === preds.length, required: true, detail: `${n} of ${preds.length}` };
    }
    case "zeroAnswered":
      return { label: "First question answered (all starting values at 0)", done: !!game.predictions["p-zero"], required: true };
    case "startValuesSet": {
      const n = concepts.filter((c) => Math.abs(c.initialValue || 0) > 1e-9).length;
      return { label: "At least 2 concepts have a starting value", done: n >= 2, required: true, detail: `${n} now` };
    }
    case "goalsAnswered":
      return { label: "Goal predictions entered and checked", done: !!game.predictions["p-goals"], required: true };
    case "twoScenarios": {
      const n = scenarios.filter((s) => s.id !== "baseline").length;
      return { label: "At least 2 scenarios", done: n >= 2, required: true, detail: `${n} now` };
    }
    case "eventDrawn":
      return { label: "Event card drawn", done: !!game.eventId, required: true };
    case "proposalDone":
      return { label: "Proposal chosen, predicted and checked", done: !!game.predictions["p-proposal"], required: true };
    default:
      return { label: id, done: true, required: false };
  }
}

export function roundChecks(pack, round, ctx, deps) {
  return (round.checks || []).map((id) => ({ id, ...checkDef(id, pack, round, ctx, deps) }));
}
export const canFinishRound = (checks) => checks.every((c) => !c.required || c.done);

// Craft points, awarded when a round is finished.
export function craftPoints(round, ctx, deps) {
  const { concepts, edges } = ctx;
  const c = round.craft;
  if (!c) return { points: 0, detail: [] };
  const detail = [];
  let points = 0;
  if (c.perDefinedConcept) {
    const n = Math.min(c.maxDefined ?? Infinity, concepts.filter((x) => x.description?.trim()).length);
    points += n * c.perDefinedConcept;
    detail.push(`${n} concepts with a definition: ${n * c.perDefinedConcept}`);
  }
  if (c.perDescribedEdge) {
    const n = Math.min(c.maxDescribed ?? Infinity, edges.filter((e) => e.description?.trim()).length);
    points += n * c.perDescribedEdge;
    detail.push(`${n} relationships with a Description: ${n * c.perDescribedEdge}`);
  }
  if (c.cleanBonus) {
    // In the first round there are no relationships yet, so the two
    // reminders about drawing them do not count against the model.
    const ignore = round.id === "r1" ? new Set(["no-edges", "isolated", "few"]) : new Set();
    const clean = deps.checkModel(concepts, edges).filter((i) => !ignore.has(i.id)).length === 0;
    if (clean) { points += c.cleanBonus; detail.push(`Clean Model check: ${c.cleanBonus}`); }
    else detail.push("Model check not clean: no bonus");
  }
  return { points, detail };
}

// ---- prediction gates -----------------------------------------------------------

// The predictions that still stand between the team and the result on `tab`.
export function pendingPredictions(pack, game, tab, ctx) {
  if (!game || game.finishedAt) return [];
  const round = currentRound(pack, game);
  const open = (round.predictions || []).filter((p) => p.gatesTab === tab && !game.predictions[p.id]);
  return open.filter((p) => {
    if (p.stage === "goals") {
      const startsSet = ctx.concepts.filter((c) => Math.abs(c.initialValue || 0) > 1e-9).length >= 2;
      return !!game.predictions["p-zero"] && startsSet;
    }
    return true;
  });
}

// ---- scoring ------------------------------------------------------------------------

export const direction = (delta) => (delta > DIRECTION_TOLERANCE ? "up" : delta < -DIRECTION_TOLERANCE ? "down" : "same");
export const DIRECTION_WORDS = { up: "higher", down: "lower", same: "about the same" };

function rankByNet(ctx, deps, top, highest) {
  const m = deps.computeMetrics(ctx.concepts, ctx.edges).filter((x) => x.centrality > 0);
  const sorted = [...m].sort((a, b) => (highest ? b.netInfluence - a.netInfluence : a.netInfluence - b.netInfluence));
  if (!sorted.length) return { ids: new Set(), names: [] };
  const cut = sorted[Math.min(top, sorted.length) - 1].netInfluence;
  const keep = sorted.filter((x) => (highest ? x.netInfluence >= cut && x.netInfluence > 0 : x.netInfluence <= cut && x.netInfluence < 0));
  return { ids: new Set(keep.map((x) => x.id)), names: keep.map((x) => x.name) };
}

export function feedbackLoopSets(ctx, deps) {
  return deps.enumerateFeedbackLoops(ctx.concepts, ctx.edges).loops
    .map((path) => new Set(path.map((e) => e.source)))
    .filter((s) => s.size >= 2);
}

const scenarioFor = (id, locks) => ({ id, name: id, type: "intervention", description: "", initialOverrides: { ...locks }, lockedConcepts: { ...locks }, weightOverrides: {} });

// What a proposal scenario costs, and whether it is a valid proposal.
export function checkProposal(pack, game, scenario, concepts) {
  const errors = [];
  if (!scenario) return { cost: 0, errors: ["Choose a scenario."] };
  const locks = scenario.lockedConcepts || {};
  let cost = 0;
  pack.measures.forEach((m) => {
    const c = cardConcept(concepts, m.card);
    if (c && (locks[c.id] ?? 0) > 1e-9) cost += m.cost;
  });
  if (cost > pack.budget) errors.push(`This proposal costs ${cost}, more than the budget of ${pack.budget}.`);
  const ev = eventOf(pack, game);
  if (!ev) errors.push("Draw the event card first.");
  else {
    const ec = cardConcept(concepts, ev.card);
    if (!ec) errors.push(`Your map has no "${cardOf(pack, ev.card)?.name}" concept for the event card.`);
    else if (!(Math.abs((locks[ec.id] ?? Infinity) - ev.value) <= 1e-9)) errors.push(`The event card is not in this scenario: hold "${ec.name}" at full strength with its up arrow.`);
  }
  if (cost === 0) errors.push("This scenario switches on none of the measure cards.");
  return { cost, errors };
}

// Scores one submitted prediction. Returns { correct, points, items, shared? }.
export function scorePrediction(pack, pred, answer, ctx, deps) {
  const { concepts, edges, settings } = ctx;
  const nameOf = (id) => concepts.find((c) => c.id === id)?.name || "?";
  if (pred.kind === "pickConcept") {
    const r = rankByNet(ctx, deps, pred.top ?? 2, pred.rule === "topNet");
    const correct = r.ids.has(answer);
    return { correct, points: correct ? pred.points : 0, items: [{ label: `You chose ${nameOf(answer)}`, truth: r.names.length ? `The engine ranks highest: ${r.names.join(", ")}` : "No concept qualifies", correct }] };
  }
  if (pred.kind === "pickLoop") {
    const loops = feedbackLoopSets(ctx, deps);
    let correct;
    if (answer?.none) correct = loops.length === 0;
    else {
      const ids = answer?.ids || [];
      correct = ids.length >= 2 && loops.some((s) => ids.every((id) => s.has(id)));
    }
    const label = answer?.none ? "You said there is no loop" : `You chose ${(answer?.ids || []).map(nameOf).join(", ")}`;
    return { correct, points: correct ? pred.points : 0, items: [{ label, truth: `Your map has ${loops.length} feedback loop${loops.length === 1 ? "" : "s"}`, correct }] };
  }
  if (pred.kind === "choice") {
    const correct = answer === pred.correct;
    return { correct, points: correct ? pred.points : 0, items: [{ label: `You chose "${pred.options[answer]}"`, truth: pred.explain, correct }] };
  }
  if (pred.kind === "goalDirections") {
    const run = deps.simulate(concepts, edges, deps.BASELINE_SCENARIO, settings);
    let points = 0;
    const items = pack.goals.map((g) => {
      const c = cardConcept(concepts, g.card);
      if (!c) return { label: `${cardOf(pack, g.card).name}: not in your map`, truth: "", correct: null };
      const truth = direction((run.final[c.id] ?? 0) - (c.initialValue || 0));
      const ok = answer?.[g.card] === truth;
      if (ok) points += pred.points;
      return { label: `${c.name}: you said ${DIRECTION_WORDS[answer?.[g.card]] || "nothing"}`, truth: `It settles ${DIRECTION_WORDS[truth]} (${(c.initialValue || 0).toFixed(2)} to ${(run.final[c.id] ?? 0).toFixed(2)})`, correct: ok };
    });
    return { correct: points > 0, points, items };
  }
  if (pred.kind === "proposal") {
    const sc = ctx.scenarios.find((s) => s.id === answer?.scenarioId);
    const ev = eventOf(pack, ctx.game);
    const ec = ev && cardConcept(concepts, ev.card);
    const base = deps.simulate(concepts, edges, scenarioFor("event-only", ec ? { [ec.id]: ev.value } : {}), settings);
    const run = deps.simulate(concepts, edges, sc, settings);
    const delta = (c) => (run.final[c.id] ?? 0) - (base.final[c.id] ?? 0);
    let points = 0;
    const items = pack.goals.map((g) => {
      const c = cardConcept(concepts, g.card);
      if (!c) return { label: `${cardOf(pack, g.card).name}: not in your map`, truth: "", correct: null };
      const truth = direction(delta(c));
      const ok = answer?.directions?.[g.card] === truth;
      if (ok) points += pred.points;
      return { label: `${c.name}: you said ${DIRECTION_WORDS[answer?.directions?.[g.card]] || "nothing"}`, truth: `It ends up ${DIRECTION_WORDS[truth]} (${delta(c) >= 0 ? "+" : ""}${delta(c).toFixed(2)})`, correct: ok };
    });
    // The shared goal: every role's interest, against the same event without measures.
    const roundDef = pack.rounds.find((r) => r.predictions?.some((p) => p.id === pred.id));
    const perRole = roundDef?.shared?.perRole ?? 2, bonus = roundDef?.shared?.noTradeOffBonus ?? 3;
    let shared = 0, worse = 0;
    const roles = pack.roles.map((r) => {
      const c = cardConcept(concepts, r.interest);
      if (!c) { worse += 1; return { role: r.name, result: "missing", text: `${cardOf(pack, r.interest).name} is not in your map` }; }
      const d = direction(delta(c) * r.better);
      if (d === "up") shared += perRole;
      if (d === "down") worse += 1;
      return { role: r.name, result: d === "up" ? "better" : d === "down" ? "worse" : "same", text: `${c.name} ${d === "up" ? "improves" : d === "down" ? "gets worse" : "stays about the same"}` };
    });
    const noTradeOff = worse === 0;
    if (noTradeOff) shared += bonus;
    return { correct: points > 0, points, items, shared, roles, noTradeOff, scenarioName: sc?.name };
  }
  return { correct: false, points: 0, items: [] };
}

// ---- totals and the end of the game ---------------------------------------------

export function totals(game) {
  const craft = Object.values(game?.roundPoints || {}).reduce((s, r) => s + (r?.craft || 0), 0);
  const preds = Object.values(game?.predictions || {});
  const insight = preds.reduce((s, p) => s + (p?.points || 0), 0);
  const shared = preds.reduce((s, p) => s + (p?.shared || 0), 0);
  return { craft, insight, shared, total: craft + insight + shared };
}

export function outcome(pack, game) {
  const t = totals(game);
  const noTradeOff = !!game?.predictions?.["p-proposal"]?.noTradeOff;
  return { ...t, target: pack.targetScore, reachedTarget: t.total >= pack.targetScore, noTradeOff, won: t.total >= pack.targetScore && noTradeOff };
}

// Rows for the game log (CSV): one per scored item.
export function gameLogRows(pack, game) {
  const rows = [["Round", "Item", "Answer or result", "Engine says", "Correct", "Points"]];
  const when = (t) => (t ? new Date(t).toISOString() : "");
  pack.rounds.forEach((r) => {
    const rp = game.roundPoints[r.id];
    if (rp) rows.push([r.title, "Craft points", (rp.detail || []).join("; "), "", "", rp.craft]);
    (r.predictions || []).forEach((p) => {
      const g = game.predictions[p.id];
      if (!g) return;
      (g.items || []).forEach((it, i) => rows.push([r.title, i === 0 ? p.prompt : "", it.label, it.truth, it.correct === null ? "" : it.correct ? "yes" : "no", i === 0 ? g.points : ""]));
      if (g.roles) g.roles.forEach((x) => rows.push([r.title, "Shared goal", x.role, x.text, x.result === "better" ? "yes" : "no", ""]));
      if (g.shared !== undefined) rows.push([r.title, "Shared goal points", g.noTradeOff ? "No trade-offs" : "Trade-offs between roles", "", "", g.shared]);
      rows.push([r.title, "Answered at", when(g.at), "", "", ""]);
    });
    if (game.reflections[r.id]) rows.push([r.title, "Reflection", game.reflections[r.id], "", "", ""]);
  });
  const o = outcome(pack, game);
  rows.push(["Total", `Craft ${o.craft}, Insight ${o.insight}, Shared goal ${o.shared}`, `Target ${o.target}`, o.won ? "Won" : "Not won", "", o.total]);
  return rows;
}
