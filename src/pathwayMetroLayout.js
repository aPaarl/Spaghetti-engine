// Layout for the metro map of transition pathways, after the metro-map
// representation of adaptation pathways (Haasnoot et al., 2013). Pure
// functions only, so the layout can be tested without a browser.
//
// One row per pathway, on the axis of cumulative intervention intensity.
// Pathways that share their first stages are ordered next to each other,
// and a pathway is drawn only from the stage where it leaves the shared
// part, with a vertical transfer line to the row it branches from.

const U_TOL = 1e-6;

export function sameStage(a, b) {
  return a.leverId === b.leverId && !!a.scaleUp === !!b.scaleUp && Math.abs((a.u ?? 0) - (b.u ?? 0)) < U_TOL;
}

export function commonPrefix(a, b) {
  const n = Math.min(a.stages.length, b.stages.length);
  let k = 0;
  while (k < n && sameStage(a.stages[k], b.stages[k])) k++;
  return k;
}

// Orders pathways depth-first along the tree of their shared stages, so
// every pathway sits directly below the pathways it shares the most stages
// with. Siblings are ordered by the best total outcome gain beneath them,
// and a pathway that ends at a node comes before the pathways that go on.
export function orderAsTree(pathways) {
  const root = { children: new Map(), ends: [], best: -Infinity };
  pathways.forEach((p) => {
    let node = root;
    node.best = Math.max(node.best, p.tog);
    p.stages.forEach((s) => {
      const k = `${s.leverId}|${s.scaleUp ? 1 : 0}|${Math.round((s.u ?? 0) / U_TOL)}`;
      if (!node.children.has(k)) node.children.set(k, { children: new Map(), ends: [], best: -Infinity });
      node = node.children.get(k);
      node.best = Math.max(node.best, p.tog);
    });
    node.ends.push(p);
  });
  const out = [];
  const walk = (node) => {
    [...node.ends].sort((a, b) => b.tog - a.tog).forEach((p) => out.push(p));
    [...node.children.values()].sort((a, b) => b.best - a.best).forEach(walk);
  };
  walk(root);
  return out;
}

// First stage at which any outcome is worse than in Business-as-Usual: the
// tipping point of the pathway. Returns null when no stage crosses it.
export function tippingStage(p, eps = 1e-6) {
  for (let i = 0; i < p.stages.length; i++) {
    const worse = (p.stages[i].outcomes || []).filter((o) => o.improvement < -eps).map((o) => o.id);
    if (worse.length) return { stage: i, outcomeIds: worse };
  }
  return null;
}

// Builds the rows of the metro map. Each row lists the segments it draws
// (from the stage where it leaves the shared part), its transfer stations,
// its end, its tipping point, and the connector to the row it branches from.
// The value a row is sorted on: "tog" (total outcome gain), "cii"
// (cumulative intervention intensity), or "outcome:<id>" (that outcome's
// direction-signed change at the end of the pathway).
export function metroSortValue(p, key) {
  if (key === "cii") return p.cii;
  if (key.startsWith("outcome:")) {
    const id = key.slice(8);
    const last = p.stages[p.stages.length - 1];
    const o = last?.outcomes?.find((x) => x.id === id);
    return o ? o.improvement : 0;
  }
  return p.tog;
}

// Orders the pathways. "tree" keeps pathways that share their first stages
// together and draws the shared part once; any other key sorts the rows on
// that value (dir "desc" or "asc") and draws every pathway in full.
export function orderMetroPathways(pathways, sortKey = "tree", dir = "desc") {
  if (sortKey === "tree") return orderAsTree(pathways);
  const sign = dir === "asc" ? 1 : -1;
  return [...pathways].sort((a, b) => sign * (metroSortValue(a, sortKey) - metroSortValue(b, sortKey)) || b.tog - a.tog || a.cii - b.cii);
}

export function buildMetroRows(pathways, { eps = 1e-6, sortKey = "tree", dir = "desc" } = {}) {
  const tree = sortKey === "tree";
  const ordered = orderMetroPathways(pathways, sortKey, dir);
  const rows = [];
  ordered.forEach((p, i) => {
    let shared = 0, parent = null;
    if (tree) for (let j = i - 1; j >= 0; j--) shared = Math.max(shared, commonPrefix(p, ordered[j]));
    // The parent is the nearest row above that shares those stages and is
    // itself drawn at the branching point (it did not branch off later).
    if (shared > 0) {
      for (let j = i - 1; j >= 0; j--) {
        if (commonPrefix(p, ordered[j]) >= shared && rows[j].shared <= shared) { parent = j; break; }
      }
    }
    const xs = [0, ...p.stages.map((s) => s.ciiAfter)];
    const tip = tippingStage(p, eps);
    const segments = [];
    for (let k = shared; k < p.stages.length; k++) {
      segments.push({
        stage: k, leverId: p.stages[k].leverId, scaleUp: !!p.stages[k].scaleUp,
        x0: xs[k], x1: xs[k + 1], afterTipping: tip !== null && k > tip.stage,
      });
    }
    // Transfer stations: where the next lever is added. The first one of a
    // branching row is the station it shares with its parent row.
    const stations = [];
    for (let k = Math.max(shared, 1); k < p.stages.length; k++) stations.push({ x: xs[k], stage: k });
    const end = p.stages.length ? xs[p.stages.length] : 0;
    const finalOutcomes = p.stages.length ? (p.stages[p.stages.length - 1].outcomes || []) : [];
    rows.push({
      id: p.id, pathway: p, index: i, shared, parent,
      branchX: shared > 0 ? xs[shared] : null,
      start: xs[shared], end, segments, stations,
      tipping: tip && tip.stage >= shared ? { x: xs[tip.stage + 1], stage: tip.stage, outcomeIds: tip.outcomeIds } : null,
      tippingInherited: !!(tip && tip.stage < shared),
      tog: p.tog, cii: p.cii,
      outcomes: Object.fromEntries(finalOutcomes.map((o) => [o.id, o.improvement])),
    });
  });
  return rows;
}

// Picks the pathways to draw. "top" takes the converged pathways with the
// highest total outcome gain, "admissible" only those without trade-offs,
// "frontier" the efficient frontier, and "archetypes" the leaders of each
// archetype ranking. The selected pathway is always added.
export function pickMetroPathways(candidates, { mode = "top", limit = 12, ranked = null, perArchetype = 3, selectedId = null } = {}) {
  const byTog = (arr) => [...arr].sort((a, b) => b.tog - a.tog);
  let list;
  if (mode === "admissible") list = byTog(candidates.filter((c) => c.admissible)).slice(0, limit);
  else if (mode === "frontier") list = byTog(candidates.filter((c) => c.frontier)).slice(0, limit);
  else if (mode === "archetypes" && ranked) {
    const seen = new Set();
    list = [];
    Object.values(ranked).forEach((arr) => arr.slice(0, perArchetype).forEach((c) => {
      if (!seen.has(c.id)) { seen.add(c.id); list.push(c); }
    }));
  } else list = byTog(candidates.filter((c) => c.converged && c.length > 0)).slice(0, limit);
  if (selectedId !== null && !list.some((c) => c.id === selectedId)) {
    const sel = candidates.find((c) => c.id === selectedId);
    if (sel && sel.length > 0) list.push(sel);
  }
  return list;
}

// Rounded axis ticks from 0 to at least max.
export function niceTicks(max, target = 6) {
  const hi = max > 0 ? max : 1;
  const raw = hi / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= raw);
  const top = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}
