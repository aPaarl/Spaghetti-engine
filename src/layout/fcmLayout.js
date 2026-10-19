// ============================================================================
// Hybrid layout engine for fuzzy cognitive maps (Network tab "Auto Arrange")
// ============================================================================
// Pure and framework-free, so it runs the same in a Web Worker, on the main
// thread and in node tests. Deterministic: the same model and mode always
// give the same picture (all randomness comes from a seeded generator).
//
// Pipeline (see computeFcmLayout):
//   1. Node metrics: in/outdegree, weighted in/outdegree, betweenness and
//      eigenvector centrality, strongly connected components (feedback).
//   2. Communities (Step A): Louvain modularity on the undirected |weight|
//      graph, with the Leiden connectivity fix (every community is split
//      into its connected parts). Cluster view uses the model's own modules
//      instead when it has at least two.
//   3. Local layouts (Step D): each community is laid out on its own by a
//      force simulation, with mode-specific pulls (drivers left, central
//      nodes inward, small feedback loops drawn as rings).
//   4. Coarse layout (Steps B, C): one disc per community, sized to fit its
//      local layout, placed by a force simulation over the community graph
//      (links weighted by the relationships between communities).
//   5. Each community is rotated/reflected to face its partners, then a
//      short global refinement lets concepts drift towards cross-community
//      partners while staying in their community's area.
//   6. Step E: overlap removal, then a time-boxed local search that moves
//      and swaps nodes to remove edge crossings, edges running through
//      cards and label clashes, scored with the weighted objective below.
//   7. Several seeds are tried when time allows; the best score wins.
//
// Objective (higher is better), as specified for the Spaghetti Engine:
//   score = -10 crossings - 5 node overlaps - 5 label overlaps
//           - 2 mean edge length (in card-widths) + 3 cluster separation
//           + 3 centrality visibility + 2 hierarchy visibility
// Edges running straight through an unrelated card count as crossings.

import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from "d3-force";

/**
 * @typedef {{ id: string, w: number, h: number, group?: string }} LayoutNodeInput
 * @typedef {{ source: string, target: string, weight: number }} LayoutEdgeInput
 * @typedef {"readable" | "systems" | "clusters" | "centrality"} LayoutMode
 * @typedef {{ nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], mode?: LayoutMode, budgetMs?: number, deadlineMs?: number }} LayoutInput
 * @typedef {{ crossings: number, nodeOverlaps: number, labelOverlaps: number, meanEdgeLength: number,
 *             clusterSeparation: number, centralityVisibility: number, hierarchyVisibility: number, score: number }} LayoutScore
 * @typedef {{ positions: Record<string, { x: number, y: number }>, report: LayoutScore & { mode: LayoutMode, ms: number,
 *             communities: number, feedbackLoops: number, candidates: number } }} LayoutResult
 */

export const FCM_LAYOUT_MODES = [
  { id: "readable", label: "Readable", hint: "Fewest crossings and a clean structure; tightly linked concepts grouped together" },
  { id: "systems", label: "Systems thinking", hint: "Drivers on the left, outcomes on the right, feedback loops drawn as rings" },
  { id: "clusters", label: "Cluster view", hint: "Strongly separated groups: the model's modules when it has them, otherwise detected communities" },
  { id: "centrality", label: "Centrality view", hint: "The most connected and influential concepts in the centre, peripheral ones outside" },
];

const LABEL_W = 38, LABEL_H = 16;

// Small, fast, seedable PRNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 1. Metrics
// ---------------------------------------------------------------------------
/**
 * Per-node metrics on a graph given by index. Betweenness is Brandes'
 * algorithm on the directed, unweighted graph; eigenvector centrality is a
 * power iteration on the undirected |weight| graph (the directed version is
 * zero everywhere on maps without cycles). Both are scaled to a maximum of 1.
 */
export function computeNodeMetrics(n, edgeList) {
  const out = Array.from({ length: n }, () => []);
  const und = Array.from({ length: n }, () => new Map());
  const indeg = new Array(n).fill(0), outdeg = new Array(n).fill(0);
  const win = new Array(n).fill(0), wout = new Array(n).fill(0);
  edgeList.forEach(({ s, t, w }) => {
    out[s].push(t);
    outdeg[s]++; indeg[t]++;
    wout[s] += Math.abs(w); win[t] += Math.abs(w);
    und[s].set(t, (und[s].get(t) || 0) + Math.abs(w));
    und[t].set(s, (und[t].get(s) || 0) + Math.abs(w));
  });

  const betweenness = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack = [], pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0), dist = new Array(n).fill(-1), delta = new Array(n).fill(0);
    sigma[s] = 1; dist[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi];
      stack.push(v);
      for (const w of out[v]) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
      }
    }
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) betweenness[w] += delta[w];
    }
  }
  const bMax = Math.max(1e-12, ...betweenness);

  let eig = new Array(n).fill(1 / Math.sqrt(Math.max(1, n)));
  for (let it = 0; it < 100; it++) {
    // (A + I) x: the identity shift guarantees convergence on bipartite graphs
    const next = eig.map((x, i) => {
      let s = x;
      und[i].forEach((w, j) => { s += w * eig[j]; });
      return s;
    });
    const norm = Math.hypot(...next) || 1;
    const diff = next.reduce((d, x, i) => d + Math.abs(x / norm - eig[i]), 0);
    eig = next.map((x) => x / norm);
    if (diff < 1e-9) break;
  }
  const eMax = Math.max(1e-12, ...eig);

  return {
    indeg, outdeg, win, wout,
    betweenness: betweenness.map((b) => b / bMax),
    eigenvector: eig.map((e) => e / eMax),
    out, und,
  };
}

// Tarjan's strongly connected components. Components of two or more nodes
// are the model's feedback structures.
export function stronglyConnected(n, out) {
  let index = 0;
  const idx = new Array(n).fill(-1), low = new Array(n).fill(0), onStack = new Array(n).fill(false);
  const stack = [], comps = [];
  const visit = (v) => {
    idx[v] = low[v] = index++;
    stack.push(v); onStack[v] = true;
    for (const w of out[v]) {
      if (idx[w] < 0) { visit(w); low[v] = Math.min(low[v], low[w]); }
      else if (onStack[w]) low[v] = Math.min(low[v], idx[w]);
    }
    if (low[v] === idx[v]) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack[w] = false; comp.push(w); } while (w !== v);
      comps.push(comp);
    }
  };
  for (let v = 0; v < n; v++) if (idx[v] < 0) visit(v);
  return comps;
}

// ---------------------------------------------------------------------------
// 2. Communities
// ---------------------------------------------------------------------------
/**
 * Louvain modularity optimisation on an undirected weighted graph (array of
 * Map neighbour -> weight), returning a community index per node. Nodes are
 * visited in index order, so the result is deterministic.
 */
export function louvain(n, und, resolution = 1) {
  let membership = Array.from({ length: n }, (_, i) => i);
  let adj = und.map((m) => new Map(m));
  let self = new Array(n).fill(0);
  for (let level = 0; level < 20; level++) {
    const gn = adj.length;
    const k = adj.map((m, i) => { let s = 2 * self[i]; m.forEach((w) => { s += w; }); return s; });
    const m2 = k.reduce((a, b) => a + b, 0);
    if (m2 <= 0) break;
    const c = Array.from({ length: gn }, (_, i) => i);
    const tot = k.slice();
    let improved = false;
    for (let pass = 0; pass < 50; pass++) {
      let moved = false;
      for (let i = 0; i < gn; i++) {
        const ci = c[i];
        const wTo = new Map();
        adj[i].forEach((w, j) => { wTo.set(c[j], (wTo.get(c[j]) || 0) + w); });
        tot[ci] -= k[i];
        let best = ci, bestGain = (wTo.get(ci) || 0) - (resolution * tot[ci] * k[i]) / m2;
        wTo.forEach((w, cc) => {
          const gain = w - (resolution * tot[cc] * k[i]) / m2;
          if (gain > bestGain + 1e-12) { best = cc; bestGain = gain; }
        });
        tot[best] += k[i];
        if (best !== ci) { c[i] = best; moved = true; improved = true; }
      }
      if (!moved) break;
    }
    if (!improved) break;
    const renum = new Map();
    c.forEach((x) => { if (!renum.has(x)) renum.set(x, renum.size); });
    const cc = c.map((x) => renum.get(x));
    membership = membership.map((x) => cc[x]);
    const K = renum.size;
    const nextAdj = Array.from({ length: K }, () => new Map());
    const nextSelf = new Array(K).fill(0);
    for (let i = 0; i < gn; i++) {
      nextSelf[cc[i]] += self[i];
      adj[i].forEach((w, j) => {
        if (cc[i] === cc[j]) nextSelf[cc[i]] += w / 2;
        else nextAdj[cc[i]].set(cc[j], (nextAdj[cc[i]].get(cc[j]) || 0) + w);
      });
    }
    if (K === gn) break;
    adj = nextAdj; self = nextSelf;
  }
  return membership;
}

// Leiden's guarantee, applied after Louvain: a community must be connected.
// Each community is split into its connected parts; isolated concepts are
// gathered into one group of their own so they don't scatter as singletons.
function connectedCommunities(n, und, membership) {
  const groups = [];
  const seen = new Array(n).fill(false);
  const isolated = [];
  for (let v = 0; v < n; v++) {
    if (seen[v]) continue;
    if (und[v].size === 0) { seen[v] = true; isolated.push(v); continue; }
    const comp = [v];
    seen[v] = true;
    for (let qi = 0; qi < comp.length; qi++) {
      und[comp[qi]].forEach((_, w) => {
        if (!seen[w] && membership[w] === membership[v]) { seen[w] = true; comp.push(w); }
      });
    }
    groups.push(comp);
  }
  if (isolated.length) groups.push(isolated);
  return groups;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
// Pushes overlapping boxes (centre x/y, width w, height h) apart until every
// pair is at least gapX/gapY apart, along whichever axis needs less movement.
export function removeBoxOverlaps(items, gapX, gapY, iterations = 200) {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const ox = (a.w + b.w) / 2 + gapX - Math.abs(dx);
        const oy = (a.h + b.h) / 2 + gapY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const s = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
          a.x -= (s * ox) / 2; b.x += (s * ox) / 2;
        } else {
          const s = dy === 0 ? (j % 2 ? 1 : -1) : Math.sign(dy);
          a.y -= (s * oy) / 2; b.y += (s * oy) / 2;
        }
      }
    }
    if (!moved) break;
  }
  return items;
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Does the segment a-b pass through the box (centre cx/cy, half sizes hw/hh)?
function segmentHitsBox(ax, ay, bx, by, cx, cy, hw, hh) {
  // Liang-Barsky clipping against the box
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - (cx - hw), cx + hw - ax, ay - (cy - hh), cy + hh - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-6;
}

const boxesOverlap = (ax, ay, aw, ah, bx, by, bw, bh) => Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
/**
 * The full objective for a placement. px/py are node centres. Labels are
 * assumed at edge midpoints (where the map draws them unless they are moved
 * clear, so this is the pessimistic case).
 */
export function scoreLayout(ctx, px, py) {
  const { n, w, h, edges, groupOf, groups, drive, central, unit } = ctx;
  const E = edges.length;
  let crossings = 0, nodeOverlaps = 0, labelOverlaps = 0, length = 0;
  for (let a = 0; a < E; a++) {
    const ea = edges[a];
    const ax = px[ea.s], ay = py[ea.s], bx = px[ea.t], by = py[ea.t];
    length += Math.hypot(bx - ax, by - ay);
    for (let b = a + 1; b < E; b++) {
      const eb = edges[b];
      if (eb.s === ea.s || eb.s === ea.t || eb.t === ea.s || eb.t === ea.t) continue;
      if (segmentsCross(ax, ay, bx, by, px[eb.s], py[eb.s], px[eb.t], py[eb.t])) crossings++;
    }
    for (let v = 0; v < n; v++) {
      if (v === ea.s || v === ea.t) continue;
      if (segmentHitsBox(ax, ay, bx, by, px[v], py[v], w[v] / 2 + 4, h[v] / 2 + 4)) crossings++;
    }
    const lx = (ax + bx) / 2, ly = (ay + by) / 2;
    for (let v = 0; v < n; v++) if (boxesOverlap(lx, ly, LABEL_W, LABEL_H, px[v], py[v], w[v], h[v])) labelOverlaps++;
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (boxesOverlap(px[i], py[i], w[i] + 8, h[i] + 8, px[j], py[j], w[j] + 8, h[j] + 8)) nodeOverlaps++;
  }
  const meanEdgeLength = E ? length / E / unit : 0;

  // cluster separation: spacing between community centres relative to the
  // spread of each community around its own centre
  let clusterSeparation = 0;
  if (groups.length > 1) {
    const cx = groups.map((g) => g.reduce((s, v) => s + px[v], 0) / g.length);
    const cy = groups.map((g) => g.reduce((s, v) => s + py[v], 0) / g.length);
    let intra = 0;
    for (let v = 0; v < n; v++) intra += Math.hypot(px[v] - cx[groupOf[v]], py[v] - cy[groupOf[v]]);
    intra = intra / n + unit;
    let nearest = 0;
    groups.forEach((_, i) => {
      let d = Infinity;
      groups.forEach((__, j) => { if (i !== j) d = Math.min(d, Math.hypot(cx[i] - cx[j], cy[i] - cy[j])); });
      nearest += d;
    });
    clusterSeparation = Math.min(3, nearest / groups.length / (2 * intra));
  }

  // centrality visibility: central concepts close to the middle of the map
  const mx = px.reduce((a, b) => a + b, 0) / n, my = py.reduce((a, b) => a + b, 0) / n;
  const r = px.map((x, i) => Math.hypot(x - mx, py[i] - my));
  const rMax = Math.max(1e-9, ...r);
  let cw = 0, cs = 0;
  for (let v = 0; v < n; v++) { cw += central[v]; cs += central[v] * (1 - r[v] / rMax); }
  const centralityVisibility = cw > 0 ? cs / cw : 0;

  // hierarchy visibility: correlation of drive (out minus in) with position
  // towards the top-left (drivers) versus bottom-right (outcomes)
  const proj = px.map((x, i) => -(x + 0.5 * py[i]));
  const hierarchyVisibility = correlation(drive, proj);

  const score = -10 * crossings - 5 * nodeOverlaps - 5 * labelOverlaps - 2 * meanEdgeLength
    + 3 * clusterSeparation + 3 * centralityVisibility + 2 * hierarchyVisibility;
  return { crossings, nodeOverlaps, labelOverlaps, meanEdgeLength, clusterSeparation, centralityVisibility, hierarchyVisibility, score };
}

function correlation(a, b) {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

// ---------------------------------------------------------------------------
// Step E: local search against crossings, edges through cards and clashes
// ---------------------------------------------------------------------------
// Local cost of node v at its current position: everything in the objective
// that moving v can change, in the same weights. Mode terms keep the search
// from undoing the structure the earlier steps built.
function localCost(ctx, px, py, v) {
  const { n, w, h, edges, incident, unit, modeWeights, targetX, central, cx0, cy0 } = ctx;
  ctx.ops += (incident[v].length + 1) * (edges.length + 2 * n) + n;
  let cost = 0;
  // the "bad" share (crossings, cards hit, overlaps, label clashes) tells
  // the search which nodes are worth trying to move at all
  let bad = 0;
  for (const ei of incident[v]) {
    const e = edges[ei];
    const ax = px[e.s], ay = py[e.s], bx = px[e.t], by = py[e.t];
    for (let fi = 0; fi < edges.length; fi++) {
      const f = edges[fi];
      if (f.s === e.s || f.s === e.t || f.t === e.s || f.t === e.t) continue;
      if (segmentsCross(ax, ay, bx, by, px[f.s], py[f.s], px[f.t], py[f.t])) bad += 10;
    }
    for (let u = 0; u < n; u++) {
      if (u === e.s || u === e.t) continue;
      if (segmentHitsBox(ax, ay, bx, by, px[u], py[u], w[u] / 2 + 4, h[u] / 2 + 4)) bad += 10;
    }
    const lx = (ax + bx) / 2, ly = (ay + by) / 2;
    for (let u = 0; u < n; u++) if (boxesOverlap(lx, ly, LABEL_W, LABEL_H, px[u], py[u], w[u], h[u])) bad += 5;
    cost += (0.5 * Math.hypot(bx - ax, by - ay)) / unit;
  }
  // other edges through v's own card, and other labels on it
  for (let fi = 0; fi < edges.length; fi++) {
    const f = edges[fi];
    if (f.s === v || f.t === v) continue;
    const ax = px[f.s], ay = py[f.s], bx = px[f.t], by = py[f.t];
    if (segmentHitsBox(ax, ay, bx, by, px[v], py[v], w[v] / 2 + 4, h[v] / 2 + 4)) bad += 10;
    if (boxesOverlap((ax + bx) / 2, (ay + by) / 2, LABEL_W, LABEL_H, px[v], py[v], w[v], h[v])) bad += 5;
  }
  for (let u = 0; u < n; u++) {
    if (u !== v && boxesOverlap(px[v], py[v], w[v] + 24, h[v] + 20, px[u], py[u], w[u] + 24, h[u] + 20)) bad += 5;
  }
  ctx.bad = bad;
  cost += bad;
  if (modeWeights.hierarchy) {
    // in Systems thinking a driver far right of its place (or an outcome far
    // left) is itself something to fix
    const off = Math.abs(px[v] - targetX[v]) / unit;
    cost += modeWeights.hierarchy * off;
    if (off > 1) ctx.bad += 1;
  }
  if (modeWeights.centrality) cost += (modeWeights.centrality * central[v] * Math.hypot(px[v] - cx0, py[v] - cy0)) / unit;
  return cost;
}

// The search is bounded by a fixed amount of work (opsBudget), not by the
// clock, so the same input always gives the same result; the deadline is
// only a safety net for very slow machines.
function improveLocally(ctx, px, py, opsBudget, deadline) {
  const { n, w, h, groupOf, incident, edges } = ctx;
  const stop = () => ctx.ops > opsBudget || performance.now() > deadline;
  const neighbours = Array.from({ length: n }, () => []);
  edges.forEach((e) => { neighbours[e.s].push(e.t); neighbours[e.t].push(e.s); });
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => incident[b].length - incident[a].length || a - b);
  const steps = [1, 0.45];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  let rounds = 0;
  for (; rounds < 12; rounds++) {
    let improvedAny = false;
    for (const v of order) {
      if (stop()) return rounds;
      if (!incident[v].length) continue;
      // moves: small displacements in eight directions
      let base = localCost(ctx, px, py, v);
      if (ctx.bad === 0) continue; // nothing wrong around this node
      const ox = px[v], oy = py[v];
      let bestX = ox, bestY = oy, best = base;
      // the barycentre of its neighbours (and halfway there): the classic
      // single move that untangles most crossings around a node
      const bx = neighbours[v].reduce((s, u) => s + px[u], 0) / neighbours[v].length;
      const by = neighbours[v].reduce((s, u) => s + py[u], 0) / neighbours[v].length;
      for (const f of [1, 0.5]) {
        px[v] = ox + (bx - ox) * f; py[v] = oy + (by - oy) * f;
        const c = localCost(ctx, px, py, v);
        if (c < best - 1e-6) { best = c; bestX = px[v]; bestY = py[v]; }
      }
      for (const s of steps) {
        const d = s * (w[v] + 40);
        for (const [dx, dy] of dirs) {
          px[v] = ox + dx * d; py[v] = oy + dy * d * (h[v] + 30) / (w[v] + 40);
          const c = localCost(ctx, px, py, v);
          if (c < best - 1e-6) { best = c; bestX = px[v]; bestY = py[v]; }
        }
      }
      px[v] = bestX; py[v] = bestY;
      if (best < base - 1e-6) { improvedAny = true; base = best; }
      // swaps with the nearest same-community nodes of similar size
      const near = [];
      for (let u = 0; u < n; u++) {
        if (u !== v && groupOf[u] === groupOf[v] && Math.abs(w[u] - w[v]) <= 40) near.push(u);
      }
      near.sort((a, b) => Math.hypot(px[a] - px[v], py[a] - py[v]) - Math.hypot(px[b] - px[v], py[b] - py[v]) || a - b);
      for (const u of near.slice(0, 6)) {
        if (stop()) return rounds;
        const before = base + localCost(ctx, px, py, u);
        [px[u], px[v]] = [px[v], px[u]]; [py[u], py[v]] = [py[v], py[u]];
        const after = localCost(ctx, px, py, v) + localCost(ctx, px, py, u);
        if (after < before - 1e-6) { improvedAny = true; base = localCost(ctx, px, py, v); }
        else { [px[u], px[v]] = [px[v], px[u]]; [py[u], py[v]] = [py[v], py[u]]; }
      }
    }
    if (!improvedAny) break;
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Steps C and D: coarse and local force layouts
// ---------------------------------------------------------------------------
// Pulls each listed group of nodes onto a ring around its own centroid, so a
// short feedback loop reads as a circle.
function forceRings(rings) {
  let nodes = [];
  const force = (alpha) => {
    for (const { members, radius } of rings) {
      let cx = 0, cy = 0;
      members.forEach((i) => { cx += nodes[i].x; cy += nodes[i].y; });
      cx /= members.length; cy /= members.length;
      members.forEach((i, k) => {
        const a = (2 * Math.PI * k) / members.length;
        const d = nodes[i];
        d.vx += (cx + radius * Math.cos(a) - d.x) * 0.15 * alpha;
        d.vy += (cy + radius * Math.sin(a) - d.y) * 0.15 * alpha;
      });
    }
  };
  force.initialize = (ns) => { nodes = ns; };
  return force;
}

function layoutCommunity(members, ctx, mode, random) {
  const { w, h, edges, drive, central, sccOf, sccs } = ctx;
  const local = new Map(members.map((v, i) => [v, i]));
  const m = members.length;
  const nodes = members.map((v, i) => {
    const a = (2 * Math.PI * i) / m + random() * 0.3, r = 20 + 18 * Math.sqrt(m) * 3;
    return { v, x: r * Math.cos(a), y: r * Math.sin(a), w: w[v], h: h[v] };
  });
  if (m === 1) { nodes[0].x = 0; nodes[0].y = 0; return { nodes, radius: Math.hypot(w[members[0]], h[members[0]]) / 2 }; }
  const links = [];
  edges.forEach((e) => {
    if (local.has(e.s) && local.has(e.t)) links.push({ source: local.get(e.s), target: local.get(e.t), w: Math.abs(e.weight) });
  });
  const spread = 60 + 28 * Math.sqrt(m) * 3;
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-260))
    .force("link", forceLink(links).distance((l) => (nodes[l.source.index ?? l.source].w + nodes[l.target.index ?? l.target].w) / 2 + 70).strength((l) => 0.25 + 0.35 * l.w))
    .force("collide", forceCollide((d) => Math.hypot(d.w, d.h) / 2 + 12).iterations(2))
    .stop();
  // drivers towards the left (systems strongly, readable gently); central
  // concepts towards the middle of their community (centrality strongly)
  const hierPull = mode === "systems" ? 0.14 : mode === "readable" ? 0.03 : 0;
  const centrePull = (d) => (mode === "centrality" ? 0.04 + 0.25 * central[d.v] : 0.05 + 0.08 * central[d.v]);
  sim.force("x", forceX((d) => -drive[d.v] * spread * (hierPull ? 1 : 0)).strength((d) => hierPull || centrePull(d)));
  sim.force("y", forceY(0).strength(centrePull));
  if (mode === "systems" || mode === "readable") {
    const rings = [];
    const seen = new Set();
    members.forEach((v) => {
      const s = sccOf[v];
      if (seen.has(s)) return;
      seen.add(s);
      const inside = sccs[s].filter((u) => local.has(u));
      if (inside.length >= 3 && inside.length <= 7) {
        const meanW = inside.reduce((a, u) => a + w[u], 0) / inside.length;
        rings.push({ members: inside.map((u) => local.get(u)), radius: (inside.length * (meanW + 50)) / (2 * Math.PI) });
      }
    });
    if (rings.length) sim.force("rings", forceRings(rings));
  }
  // a faster cooling schedule than d3's default: the overlap pass below
  // tidies what the last ticks would have, at half the cost
  sim.alphaDecay(0.045);
  for (let i = 0; i < 150; i++) sim.tick();
  removeBoxOverlaps(nodes, 40, 32);
  const cx = nodes.reduce((s, d) => s + d.x, 0) / m, cy = nodes.reduce((s, d) => s + d.y, 0) / m;
  let radius = 0;
  nodes.forEach((d) => { d.x -= cx; d.y -= cy; radius = Math.max(radius, Math.hypot(Math.abs(d.x) + d.w / 2, Math.abs(d.y) + d.h / 2)); });
  return { nodes, radius };
}

function layoutCoarse(groups, locals, ctx, mode, random) {
  const { edges, groupOf, drive, central } = ctx;
  const K = groups.length;
  const coupling = new Map();
  edges.forEach((e) => {
    const a = groupOf[e.s], b = groupOf[e.t];
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    coupling.set(key, (coupling.get(key) || 0) + Math.abs(e.weight));
  });
  const gap = mode === "clusters" ? 150 : 70;
  const totalR = locals.reduce((s, l) => s + l.radius, 0);
  const meanDrive = groups.map((g) => g.reduce((s, v) => s + drive[v], 0) / g.length);
  const meanCentral = groups.map((g) => g.reduce((s, v) => s + central[v], 0) / g.length);
  const cMax = Math.max(1e-9, ...meanCentral);
  const nodes = groups.map((g, i) => {
    const a = (2 * Math.PI * i) / K + random() * 0.2, r = totalR / 2;
    return { i, x: r * Math.cos(a), y: r * Math.sin(a), r: locals[i].radius };
  });
  if (K === 1) { nodes[0].x = 0; nodes[0].y = 0; return nodes; }
  const cMaxW = Math.max(1e-9, ...coupling.values());
  const links = [...coupling.entries()].map(([key, wt]) => {
    const [a, b] = key.split("|").map(Number);
    return { source: a, target: b, wt: wt / cMaxW };
  });
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength((d) => -6 * d.r))
    .force("link", forceLink(links).distance((l) => nodes[l.source.index ?? l.source].r + nodes[l.target.index ?? l.target].r + gap)
      .strength((l) => (mode === "clusters" ? 0.05 : 0.1 + 0.4 * l.wt)))
    .force("collide", forceCollide((d) => d.r + gap / 2).iterations(3))
    .force("x", forceX((d) => (mode === "systems" ? -meanDrive[d.i] * totalR : 0)).strength((d) => (mode === "systems" ? 0.12 : mode === "centrality" ? 0.03 + 0.2 * (meanCentral[d.i] / cMax) : 0.04)))
    .force("y", forceY(0).strength((d) => (mode === "centrality" ? 0.03 + 0.2 * (meanCentral[d.i] / cMax) : mode === "systems" ? 0.08 : 0.04)))
    .stop();
  sim.alphaDecay(0.035);
  for (let t = 0; t < 200; t++) sim.tick();
  // discs must not overlap at all
  const boxes = nodes.map((d) => ({ x: d.x, y: d.y, w: 2 * d.r, h: 2 * d.r }));
  removeBoxOverlaps(boxes, gap * 0.6, gap * 0.6);
  nodes.forEach((d, i) => { d.x = boxes[i].x; d.y = boxes[i].y; });
  return nodes;
}

// ---------------------------------------------------------------------------
// The whole pipeline
// ---------------------------------------------------------------------------
/** @param {LayoutInput} input @returns {LayoutResult} */
export function computeFcmLayout(input) {
  const t0 = performance.now();
  const mode = input.mode || "readable";
  const ids = input.nodes.map((d) => d.id);
  const n = ids.length;
  if (!n) return { positions: {}, report: emptyReport(mode, 0) };
  const index = new Map(ids.map((id, i) => [id, i]));
  const w = input.nodes.map((d) => d.w || 150), h = input.nodes.map((d) => d.h || 40);
  const edges = [];
  const pairSeen = new Set();
  input.edges.forEach((e) => {
    const s = index.get(e.source), t = index.get(e.target);
    if (s === undefined || t === undefined || s === t) return;
    edges.push({ s, t, weight: e.weight || 0, w: e.weight || 0 });
    pairSeen.add(`${s}>${t}`);
  });
  // a reciprocal pair is drawn as two bowed lines that never cross each
  // other, so the geometry passes treat it as one straight segment
  const geomEdges = edges.filter((e) => !(e.s > e.t && pairSeen.has(`${e.t}>${e.s}`)));

  const metrics = computeNodeMetrics(n, edges.map((e) => ({ s: e.s, t: e.t, w: e.weight })));
  const drive = metrics.wout.map((o, i) => (o - metrics.win[i]) / (o + metrics.win[i] + 1e-9));
  const central = metrics.eigenvector.map((e, i) => 0.6 * e + 0.4 * metrics.betweenness[i]);
  const sccs = stronglyConnected(n, metrics.out);
  const sccOf = new Array(n);
  sccs.forEach((c, i) => c.forEach((v) => { sccOf[v] = i; }));
  const feedbackLoops = sccs.filter((c) => c.length > 1).length;

  // Step A: communities
  let groups;
  const moduleKeys = input.nodes.map((d) => (d.group || "").trim().toLowerCase());
  const distinctModules = new Set(moduleKeys.filter(Boolean));
  if (mode === "clusters" && distinctModules.size >= 2) {
    const byKey = new Map();
    moduleKeys.forEach((k, v) => { const key = k || "\u0000"; if (!byKey.has(key)) byKey.set(key, []); byKey.get(key).push(v); });
    groups = [...byKey.values()];
  } else {
    const resolution = mode === "clusters" ? 1.25 : 1;
    groups = connectedCommunities(n, metrics.und, louvain(n, metrics.und, resolution));
  }
  const groupOf = new Array(n);
  groups.forEach((g, i) => g.forEach((v) => { groupOf[v] = i; }));

  const unit = w.reduce((a, b) => a + b, 0) / n + 60;
  const incident = Array.from({ length: n }, () => []);
  geomEdges.forEach((e, i) => { incident[e.s].push(i); incident[e.t].push(i); });
  const ctx = {
    n, w, h, edges: geomEdges, incident, groupOf, groups, drive, central, sccOf, sccs, unit,
    modeWeights: { hierarchy: mode === "systems" ? 6 : 0, centrality: mode === "centrality" ? 3 : 0 },
    targetX: new Array(n).fill(0), cx0: 0, cy0: 0, ops: 0,
  };

  // time budget: instant for small maps, a few seconds for the largest
  const budget = input.budgetMs ?? (n <= 30 ? 200 : n <= 50 ? 400 : n <= 100 ? 1400 : 3600);
  // safety net only: the search stops on its fixed work budget well before
  const deadline = t0 + (input.deadlineMs ?? Math.min(budget * 1.6, budget + 900));
  let totalOps = 0, searchMs = 0;
  // candidates: firmly anchored to the community plan, and looser (closer to
  // a plain force layout); each gets an equal, fixed share of search work
  // Readable also tries a free force layout seeded from the plan (anchor 0),
  // which often has the fewest crossings on loosely clustered maps.
  const loose = mode === "readable" ? 0 : 0.1;
  const candidates = n <= 60 ? [[2, loose], [1, 0.28], [3, 0.15]] : n <= 120 ? [[2, loose], [1, 0.28]] : [[1, 0.2]];
  const all = candidates.map(([seed, anchor]) => ({ seed, anchor }));
  const OPS_PER_MS = 20000; // measured: about 30,000-55,000 per ms on a 2024 laptop
  let best = null, tried = 0;
  for (const cand of all) {
    if (tried > 0 && performance.now() > deadline - budget * 0.3) break; // safety net only
    tried++;
    const { px, py } = placeOnce(ctx, mode, rng(cand.seed * 7919 + n), cand.anchor);
    const mx = px.reduce((a, b) => a + b, 0) / n, my = py.reduce((a, b) => a + b, 0) / n;
    ctx.cx0 = mx; ctx.cy0 = my;
    // Systems thinking: where each node belongs left to right by its drive
    // (out- minus in-weight)
    const span = Math.max(...px) - Math.min(...px);
    ctx.targetX = mode === "systems" ? drive.map((d) => mx - d * span * 0.4) : px.slice();
    ctx.ops = 0;
    const ts = performance.now();
    improveLocally(ctx, px, py, (budget * 0.7 * OPS_PER_MS) / all.length, deadline);
    totalOps += ctx.ops; searchMs += performance.now() - ts;
    const boxes = px.map((x, i) => ({ x, y: py[i], w: w[i], h: h[i] }));
    removeBoxOverlaps(boxes, 34, 28);
    boxes.forEach((b, i) => { px[i] = b.x; py[i] = b.y; });
    const s = scoreLayout(ctx, px, py);
    if (!best || s.score > best.score.score) best = { px, py, score: s };
  }

  const minX = Math.min(...best.px.map((x, i) => x - w[i] / 2)), minY = Math.min(...best.py.map((y, i) => y - h[i] / 2));
  const positions = {};
  ids.forEach((id, i) => {
    positions[id] = { x: Math.round(best.px[i] - w[i] / 2 - minX + 80), y: Math.round(best.py[i] - h[i] / 2 - minY + 80) };
  });
  return {
    positions,
    report: { mode, ms: Math.round(performance.now() - t0), communities: groups.length, feedbackLoops, candidates: tried,
      searchOpsPerMs: Math.round(totalOps / Math.max(1, searchMs)), ...roundScore(best.score) },
  };
}

function placeOnce(ctx, mode, random, anchor) {
  const { n, w, h, edges, groups, groupOf, drive } = ctx;
  // Step D: each community on its own
  const locals = groups.map((g) => layoutCommunity(g, ctx, mode, random));
  // Steps B and C: the community graph
  const coarse = layoutCoarse(groups, locals, ctx, mode, random);
  const px = new Array(n), py = new Array(n);
  const rel = new Array(n);
  groups.forEach((g, gi) => locals[gi].nodes.forEach((d) => { rel[d.v] = { x: d.x, y: d.y }; }));

  // rotate / reflect each community towards its partners (systems mode only
  // reflects top-bottom, so drivers stay on the left)
  const place = (gi, angle, flip) => {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    groups[gi].forEach((v) => {
      const x = rel[v].x, y = flip ? -rel[v].y : rel[v].y;
      px[v] = coarse[gi].x + x * cos - y * sin;
      py[v] = coarse[gi].y + x * sin + y * cos;
    });
  };
  groups.forEach((_, gi) => place(gi, 0, false));
  const crossLen = (gi) => edges.reduce((s, e) => {
    const a = groupOf[e.s], b = groupOf[e.t];
    if (a === b || (a !== gi && b !== gi)) return s;
    return s + Math.hypot(px[e.s] - px[e.t], py[e.s] - py[e.t]);
  }, 0);
  if (groups.length > 1) {
    for (let pass = 0; pass < 2; pass++) {
      groups.forEach((g, gi) => {
        if (g.length < 2) return;
        let bestA = 0, bestF = false, bestL = Infinity;
        const angles = mode === "systems" ? [0] : Array.from({ length: 12 }, (_, k) => (2 * Math.PI * k) / 12);
        for (const a of angles) for (const f of [false, true]) {
          place(gi, a, f);
          const L = crossLen(gi);
          if (L < bestL - 1e-6) { bestL = L; bestA = a; bestF = f; }
        }
        place(gi, bestA, bestF);
      });
    }
  }

  // global refinement: stay in the community's area, drift towards partners
  const nodes = px.map((x, i) => ({ x, y: py[i], hx: x, hy: py[i], w: w[i], h: h[i] }));
  const allLinks = edges.map((e) => ({ source: e.s, target: e.t, cross: groupOf[e.s] !== groupOf[e.t] }));
  const spanX = Math.max(...px) - Math.min(...px) + 1;
  const home = mode === "clusters" ? Math.max(0.3, anchor) : anchor;
  const sim = forceSimulation(nodes)
    .force("hx", forceX((d) => d.hx).strength(home))
    .force("hy", forceY((d) => d.hy).strength(home))
    .force("charge", anchor === 0 ? forceManyBody().strength(-700) : forceManyBody().strength(-120).distanceMax(400))
    .force("link", forceLink(allLinks).distance((l) => (l.cross ? 200 : 150)).strength((l) => (l.cross ? (mode === "clusters" ? 0.01 : 0.06) : 0.2)))
    .force("collide", forceCollide((d) => Math.hypot(d.w, d.h) / 2 + 10).iterations(2))
    .stop();
  if (mode === "systems") sim.force("drive", forceX((d, i) => -drive[i] * spanX * 0.45).strength(0.08));
  if (anchor !== 0) sim.alphaDecay(0.045); // the free layout keeps d3's default, slower cooling
  for (let t = 0; t < (anchor === 0 ? 300 : 120); t++) sim.tick();
  const boxes = nodes.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h }));
  removeBoxOverlaps(boxes, 34, 28);
  boxes.forEach((b, i) => { px[i] = b.x; py[i] = b.y; });
  return { px, py };
}

function roundScore(s) {
  const r = (x) => Math.round(x * 100) / 100;
  return {
    crossings: s.crossings, nodeOverlaps: s.nodeOverlaps, labelOverlaps: s.labelOverlaps,
    meanEdgeLength: r(s.meanEdgeLength), clusterSeparation: r(s.clusterSeparation),
    centralityVisibility: r(s.centralityVisibility), hierarchyVisibility: r(s.hierarchyVisibility), score: r(s.score),
  };
}

function emptyReport(mode, ms) {
  return { mode, ms, communities: 0, feedbackLoops: 0, candidates: 0, crossings: 0, nodeOverlaps: 0, labelOverlaps: 0,
    meanEdgeLength: 0, clusterSeparation: 0, centralityVisibility: 0, hierarchyVisibility: 0, score: 0 };
}

// ---------------------------------------------------------------------------
// Entry point used by the app (and the Web Worker)
// ---------------------------------------------------------------------------
/** @param {LayoutInput} input @returns {Promise<LayoutResult>} */
export async function runFcmLayout(input) {
  return computeFcmLayout(input);
}
