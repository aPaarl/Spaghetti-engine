// ============================================================================
// Backcasting: from the system of today to an envisioned system
// ============================================================================
// Two maps describe the same system: the current one, and an envisioned one
// that participants made from a copy of it by changing values and
// relationships (adding a new actor, strengthening or cutting a link). The
// method lists what differs between them and turns every difference into a
// possible step:
//
//   lever       hold a concept at the level it has in the vision (a measure)
//   structure   change one relationship to the way it is in the vision (add,
//               remove or re-weight it), introduce a concept that exists only
//               in the vision (with its relationships), or phase out one that
//               exists only today
//
// It then searches, stage by stage (beam search), for the order of steps that
// brings the settled state of the current system closest to the settled
// state of the vision, measured on the outcome concepts the user chooses.
// The result is read backwards, as backcasting does: what has to be in place
// just before the vision is reached, and what has to come before that.
//
// Pure functions; `simulate(concepts, edges, scenario, settings)` is passed in
// (the engine's own simulate in the app, a small one in the tests).
import { normalizeConceptName } from "./mapAggregation.js";

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

// Drivers: concepts that nothing in the map acts on, with a start value other
// than 0. They describe conditions and measures from outside the system, so
// both maps are run with their drivers held at that value: today's system as
// it is sustained, and the envisioned system as it would be sustained.
export function driversOf(model) {
  const targets = new Set(model.edges.map((e) => e.target));
  return Object.fromEntries(model.concepts.filter((c) => !targets.has(c.id) && Math.abs(c.initialValue || 0) > 1e-9).map((c) => [c.id, c.initialValue]));
}
const held = (locks) => ({ id: "held", initialOverrides: { ...locks }, lockedConcepts: { ...locks }, weightOverrides: {} });

/** Matches the concepts of the two maps (by id, then by name) and lists their differences. */
export function compareSystems(current, vision) {
  const visById = new Map(vision.concepts.map((c) => [c.id, c]));
  const visByName = new Map(vision.concepts.map((c) => [normalizeConceptName(c.name), c]));
  const pairs = [];
  const usedVis = new Set();
  current.concepts.forEach((c) => {
    const v = visById.get(c.id) || visByName.get(normalizeConceptName(c.name));
    if (v && !usedVis.has(v.id)) { pairs.push({ cur: c, vis: v }); usedVis.add(v.id); }
  });
  const curOfVis = new Map(pairs.map((p) => [p.vis.id, p.cur.id]));
  const newConcepts = vision.concepts.filter((v) => !usedVis.has(v.id));
  const matchedCur = new Set(pairs.map((p) => p.cur.id));
  const removedConcepts = current.concepts.filter((c) => !matchedCur.has(c.id));
  // relationships, in the ids of the current map (new concepts keep their vision id)
  const key = (a, b) => `${a}>${b}`;
  const toCur = (id) => curOfVis.get(id) || id;
  const curEdges = new Map(current.edges.map((e) => [key(e.source, e.target), e]));
  const visEdges = new Map(vision.edges.map((e) => [key(toCur(e.source), toCur(e.target)), e]));
  const edgeChanges = [];
  visEdges.forEach((ve, k) => {
    const [a, b] = k.split(">");
    const ce = curEdges.get(k);
    if (!ce) edgeChanges.push({ kind: "add", source: a, target: b, from: 0, to: ve.weight, lag: ve.lag || 0 });
    else if (Math.abs(ce.weight - ve.weight) > 1e-9) edgeChanges.push({ kind: "reweight", source: a, target: b, from: ce.weight, to: ve.weight, edgeId: ce.id });
  });
  curEdges.forEach((ce, k) => {
    if (!visEdges.has(k)) {
      const [a, b] = k.split(">");
      edgeChanges.push({ kind: "remove", source: a, target: b, from: ce.weight, to: 0, edgeId: ce.id });
    }
  });
  const valueChanges = pairs.filter((p) => Math.abs((p.cur.initialValue || 0) - (p.vis.initialValue || 0)) > 1e-9)
    .map((p) => ({ id: p.cur.id, from: p.cur.initialValue || 0, to: p.vis.initialValue || 0 }));
  return { pairs, newConcepts, removedConcepts, edgeChanges, valueChanges, toCur };
}

/**
 * The possible steps. `levers` are the ids (in the current map) of concepts
 * that may be held at their vision level; by default the concepts that
 * nothing acts on in the vision and whose start value differs.
 */
export function buildMoves(current, vision, diff, { levers = null, structural = true } = {}) {
  const name = new Map([...current.concepts, ...vision.concepts].map((c) => [c.id, c.name]));
  const visOf = new Map(diff.pairs.map((p) => [p.cur.id, p.vis]));
  const visTargets = new Set(vision.edges.map((e) => diff.toCur(e.target)));
  const moves = [];
  const leverIds = levers || [...new Set([...diff.valueChanges.map((v) => v.id), ...Object.keys(driversOf(current)).filter((id) => visOf.has(id))])]
    .filter((id) => !visTargets.has(id) && Math.abs((visOf.get(id)?.initialValue || 0) - (current.concepts.find((c) => c.id === id)?.initialValue || 0)) > 1e-9);
  leverIds.forEach((id) => {
    const v = visOf.get(id);
    if (!v) return;
    const level = v.initialValue || 0;
    moves.push({ id: `lever:${id}`, type: "lever", concept: id, level, label: `${level >= 0 ? "Raise" : "Lower"} ${name.get(id)} to ${round(level, 2)}` });
  });
  if (structural) {
    const newIds = new Set(diff.newConcepts.map((c) => c.id));
    diff.newConcepts.forEach((c) => moves.push({ id: `intro:${c.id}`, type: "introduce", concept: c, label: `Introduce ${c.name}` }));
    diff.removedConcepts.forEach((c) => moves.push({ id: `phase:${c.id}`, type: "phaseOut", concept: c.id, label: `Phase out ${c.name}` }));
    diff.edgeChanges.forEach((ch) => {
      if (newIds.has(ch.source) || newIds.has(ch.target)) return; // comes with the introduction of the new concept
      const verb = ch.kind === "add" ? "Create the link" : ch.kind === "remove" ? "Cut the link" : ch.to * ch.from < 0 ? "Reverse the link" : Math.abs(ch.to) > Math.abs(ch.from) ? "Strengthen the link" : "Weaken the link";
      moves.push({ id: `edge:${ch.source}>${ch.target}`, type: "edge", change: ch, label: `${verb} ${name.get(ch.source)} → ${name.get(ch.target)}` });
    });
  }
  return moves;
}

/** The current map with a set of steps applied: { concepts, edges, scenario }. */
export function applyMoves(current, vision, diff, moves) {
  let concepts = current.concepts.map((c) => ({ ...c }));
  let edges = current.edges.map((e) => ({ ...e }));
  const locked = { ...driversOf(current) };
  const introduced = new Set();
  moves.forEach((m) => {
    if (m.type === "lever") locked[m.concept] = m.level;
    else if (m.type === "phaseOut") {
      delete locked[m.concept];
      concepts = concepts.filter((c) => c.id !== m.concept);
      edges = edges.filter((e) => e.source !== m.concept && e.target !== m.concept);
    } else if (m.type === "introduce") {
      introduced.add(m.concept.id);
      concepts.push({ ...m.concept });
      // a new concept that nothing acts on in the vision is a new condition: held there too
      if (!vision.edges.some((e) => diff.toCur(e.target) === m.concept.id) && Math.abs(m.concept.initialValue || 0) > 1e-9) locked[m.concept.id] = m.concept.initialValue;
    } else if (m.type === "edge") {
      const ch = m.change;
      const at = edges.findIndex((e) => e.source === ch.source && e.target === ch.target);
      if (ch.kind === "remove") { if (at >= 0) edges.splice(at, 1); }
      else if (at >= 0) edges[at] = { ...edges[at], weight: ch.to };
      else edges.push({ id: `bc_${ch.source}_${ch.target}`, source: ch.source, target: ch.target, weight: ch.to, lag: ch.lag || 0 });
    }
  });
  // relationships of introduced concepts, as in the vision, wherever both ends are present
  if (introduced.size) {
    const present = new Set(concepts.map((c) => c.id));
    vision.edges.forEach((ve) => {
      const a = diff.toCur(ve.source), b = diff.toCur(ve.target);
      if (!(introduced.has(a) || introduced.has(b)) || !present.has(a) || !present.has(b)) return;
      if (!edges.some((e) => e.source === a && e.target === b)) edges.push({ id: `bc_${a}_${b}`, source: a, target: b, weight: ve.weight, lag: ve.lag || 0 });
    });
  }
  return { concepts, edges, scenario: { id: "backcast", initialOverrides: { ...locked }, lockedConcepts: locked, weightOverrides: {} } };
}

/** Weighted mean absolute distance between a state and the vision on the outcome concepts. */
export function gapOf(state, targets, weights) {
  let s = 0, w = 0;
  Object.entries(targets).forEach(([id, t]) => {
    const wi = weights?.[id] ?? 1;
    const v = Number.isFinite(state[id]) ? state[id] : 0;
    s += wi * Math.abs(v - t); w += wi;
  });
  return w ? s / w : 0;
}

/**
 * The search. options: { outcomes: [currentId] (default: matched concepts that
 * differ by more than 0.05), weights, levers, structural, maxSteps, beam,
 * minGain }. Returns the path of steps with the state after each, read
 * forwards; the UI reads it backwards as well.
 */
export function backcast(current, vision, simulate, settings, options = {}) {
  const diff = compareSystems(current, vision);
  const visRun = simulate(vision.concepts, vision.edges, held(driversOf(vision)), settings);
  const curRun = simulate(current.concepts, current.edges, held(driversOf(current)), settings);
  const targetsAll = Object.fromEntries(diff.pairs.map((p) => [p.cur.id, visRun.final[p.vis.id]]));
  const outcomes = options.outcomes && options.outcomes.length
    ? options.outcomes.filter((id) => targetsAll[id] !== undefined)
    : diff.pairs.filter((p) => !(p.cur.id in driversOf(current)) && !(p.vis.id in driversOf(vision)) && Math.abs((curRun.final[p.cur.id] ?? 0) - (visRun.final[p.vis.id] ?? 0)) > 0.05).map((p) => p.cur.id);
  const targets = Object.fromEntries(outcomes.map((id) => [id, targetsAll[id]]));
  const weights = options.weights || {};
  const moves = buildMoves(current, vision, diff, options);
  const maxSteps = Math.max(1, Math.min(options.maxSteps ?? 8, moves.length || 1));
  const beam = Math.max(1, options.beam ?? 3);
  let minGain = options.minGain ?? 0.002;
  let runs = 2, unsettled = 0;
  const evaluate = (set) => {
    const m = applyMoves(current, vision, diff, set);
    const r = simulate(m.concepts, m.edges, m.scenario, settings);
    runs += 1; if (!r.converged) unsettled += 1;
    return { state: r.final, gap: gapOf(r.final, targets, weights), converged: r.converged };
  };
  const start = { set: [], ...evaluate([]), trail: [] };
  if (options.minGain === undefined) minGain = Math.max(0.002, 0.01 * start.gap); // at least 1% of the distance
  let frontier = [start];
  let best = start;
  for (let step = 0; step < maxSteps; step++) {
    const seen = new Set();
    const next = [];
    frontier.forEach((node) => {
      moves.forEach((mv) => {
        if (node.set.includes(mv)) return;
        const set = [...node.set, mv];
        const sig = set.map((m) => m.id).sort().join("|");
        if (seen.has(sig)) return;
        seen.add(sig);
        const ev = evaluate(set);
        if (node.gap - ev.gap < minGain) return; // a step must bring the vision closer
        next.push({ set, ...ev, trail: [...node.trail, { move: mv, gapBefore: node.gap, gapAfter: ev.gap, state: ev.state, converged: ev.converged }] });
      });
    });
    if (!next.length) break;
    next.sort((a, b) => a.gap - b.gap);
    frontier = next.slice(0, beam);
    if (frontier[0].gap < best.gap) best = frontier[0];
  }
  const full = moves.length ? evaluate(moves) : start;
  // how much worse the end state gets without each step of the path (its importance)
  const importance = best.set.map((mv) => {
    const without = evaluate(best.set.filter((m) => m !== mv));
    return { id: mv.id, loss: round(without.gap - best.gap) };
  });
  const gap0 = start.gap;
  const steps = best.trail.map((t, i) => ({
    index: i + 1, move: t.move, gapBefore: round(t.gapBefore), gapAfter: round(t.gapAfter),
    closed: gap0 > 0 ? round((gap0 - t.gapAfter) / gap0) : 1,
    added: gap0 > 0 ? round((t.gapBefore - t.gapAfter) / gap0) : 0,
    converged: t.converged,
    milestones: Object.fromEntries(outcomes.map((id) => [id, round(t.state[id] ?? 0)])),
    importance: importance.find((x) => x.id === t.move.id)?.loss ?? 0,
  }));
  const used = new Set(best.set.map((m) => m.id));
  return {
    diff, moves, outcomes, targets,
    today: Object.fromEntries(outcomes.map((id) => [id, round(start.state[id] ?? 0)])),
    reached: Object.fromEntries(outcomes.map((id) => [id, round(best.state[id] ?? 0)])),
    gapStart: round(gap0), gapEnd: round(best.gap), gapAllSteps: round(full.gap),
    closed: gap0 > 0 ? round((gap0 - best.gap) / gap0) : 1,
    steps, unused: moves.filter((m) => !used.has(m.id)),
    runs, unsettled, visionConverged: visRun.converged, currentConverged: curRun.converged,
  };
}
