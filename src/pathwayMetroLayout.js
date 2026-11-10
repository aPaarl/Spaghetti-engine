// ============================================================================
// Transition Pathways: metro map layout
// ============================================================================
// The rows of a metro map in the style of the adaptation pathways maps
// (Haasnoot et al. 2012, 2013): every route is a row, drawn along the
// cumulative intervention intensity (CII). A route that continues another
// one starts where that one reaches its transition point, and a vertical
// transfer line joins the two, so the branching of pathways reads like a
// metro network. Pure functions (no React), so node tests can check them.
//
// A row: { c, parent, depth, start, transfers, end, endKind, label }
//   start      CII where the row's line begins (0, or the end of stage 1)
//   transfers  CII of each transition point drawn on the row (open circles)
//   end        CII at the end of the pathway
//   endKind    "end" (filled circle) or "tipping" (bar): at least one outcome
//              ends worse than Business-as-Usual

const near = (a, b) => Math.abs(a - b) <= 1e-6;

// The candidate that is the first k stages of `c`, if the analysis has it.
function prefixOf(c, k, bySig) {
  if (k < 1) return null;
  const sig = c.stages.slice(0, k).map((s) => s.leverId + (s.scaleUp ? "+" : "")).join(">");
  const cii = c.stages[k - 1].ciiAfter;
  return (bySig.get(sig) || []).find((p) => p.stages.length === k && near(p.cii, cii)) || null;
}

// The value a route is sorted and chosen by: "tog" (total outcome gain,
// highest first), "cii" (cumulative intervention intensity, lowest first) or
// "outcome:<id>" (that outcome's end state, best first, with `dirs` giving
// +1 where higher is better and -1 where lower is better).
export function sortValue(c, sort, dirs = {}) {
  if (sort === "cii") return -c.cii;
  if (typeof sort === "string" && sort.startsWith("outcome:")) {
    const id = sort.slice(8);
    const v = c.stages[c.stages.length - 1]?.outcomes?.find((o) => o.id === id)?.value ?? 0;
    return (dirs[id] ?? 1) * v;
  }
  return c.tog;
}

// Chooses the routes to draw: the `top` converged pathways (by total outcome
// gain, or by the chosen outcome when sorting by one), plus `extraIds` (for
// example the selected pathway), plus every shorter pathway they grow out
// of, so the map stays a connected network.
//   sort  "network": grouped by length and under the route each one grows out
//         of (the classic metro layout); "tog", "cii" or "outcome:<id>": every
//         row sorted by that value (see sortValue); `reverse` flips the order.
export function metroRows(candidates, { top = 8, extraIds = [], sort = "network", dirs = {}, reverse = false } = {}) {
  const conv = (candidates || []).filter((c) => c.converged && c.stages?.length);
  const bySig = new Map();
  (candidates || []).forEach((c) => {
    if (!c.stages?.length) return;
    const sig = c.stages.map((s) => s.leverId + (s.scaleUp ? "+" : "")).join(">");
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(c);
  });
  const pickBy = typeof sort === "string" && sort.startsWith("outcome:") ? sort : "tog";
  const chosen = new Map();
  [...conv].sort((a, b) => sortValue(b, pickBy, dirs) - sortValue(a, pickBy, dirs) || b.tog - a.tog).slice(0, Math.max(1, top)).forEach((c) => chosen.set(c.id, c));
  extraIds.forEach((id) => { const c = (candidates || []).find((x) => x.id === id); if (c?.stages?.length) chosen.set(c.id, c); });
  [...chosen.values()].forEach((c) => {
    for (let k = c.stages.length - 1; k >= 1; k--) {
      const p = prefixOf(c, k, bySig);
      if (p) chosen.set(p.id, p);
    }
  });

  const rows = [...chosen.values()].map((c) => {
    const parent = prefixOf(c, c.stages.length - 1, bySig);
    const shown = parent && chosen.has(parent.id) ? parent : null;
    const bounds = c.stages.map((s) => s.ciiAfter);
    // A route that grows out of another starts at the end of its first stage
    // (the first stage is the row of the opening move); one whose shorter
    // pathways are not in the analysis is drawn in full from 0.
    const start = c.stages.length === 1 || !shown ? 0 : bounds[0];
    // One piece of line per stage, in that stage's lever.
    const segments = c.stages.map((st, k) => ({ from: k === 0 ? 0 : bounds[k - 1], to: bounds[k], leverId: st.leverId }))
      .filter((g) => g.to > start + 1e-9)
      .map((g) => ({ ...g, from: Math.max(g.from, start) }));
    return {
      c, parentId: shown ? shown.id : null, depth: c.stages.length,
      start, transfers: bounds.slice(0, -1), segments,
      end: c.cii,
      endKind: c.to > 0 ? "tipping" : "end",
      opening: c.stages[0].leverId,
    };
  });

  let out = [];
  if (sort === "network") {
    // By length, then under the row they grow out of, then by gain.
    const order = new Map();
    for (let d = 1; rows.some((r) => r.depth >= d); d++) {
      rows.filter((r) => r.depth === d)
        .sort((a, b) => (order.get(a.parentId) ?? -1) - (order.get(b.parentId) ?? -1) || b.c.tog - a.c.tog)
        .forEach((r) => { order.set(r.c.id, out.length); out.push(r); });
    }
  } else {
    out = [...rows].sort((a, b) => sortValue(b.c, sort, dirs) - sortValue(a.c, sort, dirs) || b.c.tog - a.c.tog);
  }
  return reverse ? out.reverse() : out;
}

// Short column codes for the outcomes: the first letter of each name, with
// more letters where two would clash, and none equal to a code in `reserved`.
export function outcomeCodes(names, reserved = ["G"]) {
  const used = new Set(reserved);
  return names.map((n) => {
    const w = String(n || "?").replace(/[^A-Za-z0-9 ]/g, "").trim() || "X";
    for (let len = 1; len <= w.length; len++) {
      const code = w.replace(/ /g, "").slice(0, len).toUpperCase().slice(0, 1) + w.replace(/ /g, "").slice(1, len).toLowerCase();
      if (!used.has(code)) { used.add(code); return code; }
    }
    let i = 2; while (used.has(`${w[0].toUpperCase()}${i}`)) i++;
    used.add(`${w[0].toUpperCase()}${i}`); return `${w[0].toUpperCase()}${i}`;
  });
}

// Axis ticks from 0 to just past `max`, at 0.05, 0.1, 0.25, 0.5 or 1 steps.
export function metroTicks(max) {
  const m = Math.max(0.05, max);
  const step = [0.05, 0.1, 0.25, 0.5, 1, 2, 5].find((s) => m / s <= 8) || 10;
  const end = Math.ceil((m + 1e-9) / step) * step;
  const ticks = [];
  for (let v = 0; v <= end + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, end };
}
