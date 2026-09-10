import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Play, RotateCcw, Download, Upload, GitCompare,
  Table2, Share2, ChevronDown, ChevronRight,
  X, Lock, Unlock, Info, ClipboardPaste, Check,
  Undo2, Redo2, Copy, Maximize2, HelpCircle, SlidersHorizontal,
  BarChart3, LayoutGrid, GitBranch, Shuffle, MousePointer2, Activity, FlaskConical, TrendingUp,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, ReferenceLine, Brush, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath,
  MarkerType, useReactFlow, useInternalNode, useViewport,
} from "@xyflow/react";
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from "d3-force";
import ELK from "elkjs/lib/elk.bundled.js";
import ExcelJS from "exceljs";
// React Flow's Network tab renders nodes as HTML (not SVG) with edges as a
// separate SVG layer, so the plain SVG->canvas capture used for every other
// (pure-SVG, Recharts) chart in this app can't reproduce it; html-to-image
// rasterizes an arbitrary DOM subtree (HTML + SVG together) instead, and is
// the approach React Flow's own docs recommend for exporting the canvas.
import { toBlob as domNodeToPngBlob } from "html-to-image";

// ============================================================================
// Utilities
// ============================================================================
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const tanh = Math.tanh;
const round2 = (v) => Math.round(v * 100) / 100;

// Strips a deleted concept's id out of every scenario's initialOverrides/
// lockedConcepts, and a deleted relationship's id out of every scenario's
// weightOverrides. Without this, removeConcept/removeEdge left the override
// behind: it's unreachable through the UI (no row ever renders for a
// concept/edge that no longer exists, so there's nothing to click to clear
// it), invisible on every screen that reads the scenario, but still live in
// simulate() (which reads these maps by id, never checking the id still
// exists) -- silently changing every future run of that scenario and
// inflating "# Interventions" in the exported workbook for an intervention
// whose target is gone.
function pruneScenarioOverrides(scenarios, { removedConceptId, removedEdgeIds } = {}) {
  return scenarios.map((s) => {
    let next = s;
    if (removedConceptId !== undefined && (removedConceptId in (s.initialOverrides || {}) || removedConceptId in (s.lockedConcepts || {}))) {
      const initialOverrides = { ...s.initialOverrides };
      delete initialOverrides[removedConceptId];
      const lockedConcepts = { ...s.lockedConcepts };
      delete lockedConcepts[removedConceptId];
      next = { ...next, initialOverrides, lockedConcepts };
    }
    if (removedEdgeIds && removedEdgeIds.length && Object.keys(s.weightOverrides || {}).some((id) => removedEdgeIds.includes(id))) {
      const weightOverrides = { ...s.weightOverrides };
      removedEdgeIds.forEach((id) => delete weightOverrides[id]);
      next = { ...next, weightOverrides };
    }
    return next;
  });
}

const PRESETS = [
  { label: "Very strong +", value: 1 },
  { label: "Strong +", value: 0.75 },
  { label: "Moderate +", value: 0.5 },
  { label: "Weak +", value: 0.25 },
  { label: "Neutral", value: 0 },
  { label: "Weak −", value: -0.25 },
  { label: "Moderate −", value: -0.5 },
  { label: "Strong −", value: -0.75 },
  { label: "Very strong −", value: -1 },
];

// ============================================================================
// Templates
// ============================================================================
function makeTemplate(kind) {
  if (kind === "blank") {
    return { concepts: [], edges: [] };
  }
  if (kind === "agriculture") {
    const c = [
      ["AIP", "Agricultural intensification pressure", "terrestrial"],
      ["CSW", "Climate-driven soil-water stress", "terrestrial"],
      ["GSN", "Groundwater & surface-water pollution", "terrestrial"],
      ["HLA", "Habitat loss & degradation", "terrestrial"],
      ["EVF", "Economic vulnerability of farming", "terrestrial"],
      ["BD", "Biodiversity decline", "cross-system"],
    ];
    const concepts = c.map(([id, name, category], i) => ({
      id, name, category, description: "", initialValue: 0, currentValue: 0,
      position: circlePos(i, c.length),
    }));
    const e = [
      ["AIP", "CSW", 0.5], ["AIP", "GSN", 0.5], ["AIP", "HLA", 0.5], ["AIP", "EVF", -0.25],
      ["CSW", "AIP", 0.25], ["CSW", "EVF", 0.25],
      ["GSN", "HLA", 0.5], ["GSN", "BD", 0.5],
      ["HLA", "BD", 0.75],
      ["EVF", "AIP", 0.25],
      ["BD", "AIP", -0.25],
    ];
    const edges = e.map(([source, target, weight]) => ({ id: uid("e"), source, target, weight, description: "" }));
    return { concepts, edges };
  }
  if (kind === "energy") {
    const c = [
      ["REI", "Renewable energy investment", "supply"],
      ["FFD", "Fossil fuel dependence", "supply"],
      ["EPR", "Energy prices", "market"],
      ["GHG", "Greenhouse gas emissions", "outcome"],
      ["EMP", "Green sector employment", "outcome"],
      ["POL", "Regulatory support", "policy"],
    ];
    const concepts = c.map(([id, name, category], i) => ({
      id, name, category, description: "", initialValue: 0, currentValue: 0,
      position: circlePos(i, c.length),
    }));
    const e = [
      ["POL", "REI", 0.75], ["POL", "FFD", -0.5],
      ["REI", "FFD", -0.5], ["REI", "GHG", -0.5], ["REI", "EMP", 0.75],
      ["FFD", "GHG", 0.75], ["FFD", "EPR", 0.25],
      ["EPR", "REI", 0.25],
      ["GHG", "POL", 0.25],
    ];
    const edges = e.map(([source, target, weight]) => ({ id: uid("e"), source, target, weight, description: "" }));
    return { concepts, edges };
  }
  return { concepts: [], edges: [] };
}

function circlePos(i, n, r = 220, cx = 380, cy = 300) {
  const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function slugify(name, used) {
  let base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 5) || "C";
  let id = base, n = 1;
  while (used.has(id)) { id = `${base}${n}`; n++; }
  used.add(id);
  return id;
}

// Unconditionally treating "," as a decimal separator misparses a value
// that uses it as a thousands separator instead (e.g. "1,234" silently
// became 1.234). Disambiguate: with both "." and "," present, "," is
// almost certainly thousands-grouping (e.g. "1,234.5") and is stripped;
// with only ",", it's treated as thousands-grouping only if every
// comma-separated group after the first is exactly three digits (the
// signature of grouping, e.g. "1,234" or "1,234,567"); a lone "1,5" or
// "-0,25" (a European decimal comma) doesn't match that and is still
// read as a decimal point, same as before.
function parseNum(raw) {
  if (raw === undefined) return 0;
  let s = String(raw).trim();
  if (s === "" || s === "-") return 0;
  if (s.includes(",")) {
    if (s.includes(".")) {
      s = s.replace(/,/g, "");
    } else {
      const groups = s.split(",");
      const looksGrouped = groups.length > 1 && groups.slice(1).every((g) => /^\d{3}$/.test(g));
      s = looksGrouped ? s.replace(/,/g, "") : s.replace(",", ".");
    }
  }
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

// Parses a tab-separated adjacency matrix (e.g. pasted straight out of Excel).
function parseAdjacencyMatrix(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("Paste at least a header row and one data row.");
  const rows = lines.map((l) => l.split("\t"));
  const header = rows[0].slice(1).map((h) => h.trim()).filter((h) => h.length > 0);
  if (header.length === 0) throw new Error("Couldn't find column headers in the first row. Make sure it's tab-separated (paste directly from Excel).");

  const used = new Set();
  const nameToId = {};
  header.forEach((name) => { nameToId[name.toLowerCase()] = slugify(name, used); });

  const concepts = header.map((name, i) => ({
    id: nameToId[name.toLowerCase()], name, category: "", description: "",
    initialValue: 0, currentValue: 0, position: circlePos(i, header.length),
  }));

  const edges = [];
  rows.slice(1).forEach((r) => {
    const rowLabel = (r[0] || "").trim();
    if (!rowLabel) return;
    const sourceId = nameToId[rowLabel.toLowerCase()];
    if (!sourceId) return;
    header.forEach((colName, j) => {
      const raw = r[j + 1];
      const w = parseNum(raw);
      const targetId = nameToId[colName.toLowerCase()];
      if (sourceId === targetId) return;
      if (w !== 0) edges.push({ id: uid("e"), source: sourceId, target: targetId, weight: clamp(w), description: "" });
    });
  });

  return { concepts, edges };
}

// ============================================================================
// Simulation engine
// ============================================================================
function makeSquash(kind, lambda = 1) {
  const lam = lambda > 0 ? lambda : 1;
  switch (kind) {
    case "sigmoid":
      return (x) => 2 / (1 + Math.exp(-lam * x)) - 1;
    case "trivalent":
      return (x) => (x > 0.001 ? 1 : x < -0.001 ? -1 : 0);
    case "tanh":
    default:
      return (x) => tanh(lam * x);
  }
}

// Array.prototype.sort with a random comparator (the previous asynchronous-
// mode update order) is a well-known biased shuffle: sort implementations
// don't call the comparator on every pair, so the resulting permutation
// isn't uniform, and the bias varies by engine/array size. Fisher-Yates is
// the standard correct approach: walk the array backwards, and for each
// position swap in a uniformly-random not-yet-placed element.
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function simulate(concepts, edges, scenario, settings) {
  const ids = concepts.map((c) => c.id);
  const initial = {};
  ids.forEach((id) => {
    const c = concepts.find((c) => c.id === id);
    // A(0) is the user-defined initial activation vector from the model
    // editor, for baseline exactly the same as for any other scenario.
    // (An earlier version forced baseline to always start at the
    // zero-vector; that's no longer the case, per explicit product
    // direction: the equilibrium must not default to zero unless the
    // model structure actually converges there.) A scenario's own
    // initialOverrides (drivers, manual starting values) still win.
    initial[id] = scenario?.initialOverrides?.[id] ?? c.initialValue;
  });
  const locked = scenario?.lockedConcepts ?? {};

  const incoming = {};
  ids.forEach((id) => (incoming[id] = []));
  edges.forEach((e) => {
    const w = scenario?.weightOverrides?.[e.id] ?? e.weight;
    if (incoming[e.target]) incoming[e.target].push({ source: e.source, weight: w });
  });

  let current = { ...initial };
  Object.keys(locked).forEach((id) => (current[id] = locked[id]));
  const series = [{ iteration: 0, values: { ...current } }];

  const maxIter = settings.maxIterations ?? 100;
  const threshold = settings.convergenceThreshold ?? 0.001;
  const squash = makeSquash(settings.squashFunction, settings.lambda);
  const isRelative = settings.updateRule !== "absolute";
  let converged = false;
  let t = 0;

  for (t = 1; t <= maxIter; t++) {
    let next = { ...current };
    if (settings.mode === "asynchronous") {
      const order = shuffled(ids);
      order.forEach((id) => {
        if (locked[id] !== undefined) { next[id] = locked[id]; return; }
        const sum = incoming[id].reduce((s, { source, weight }) => s + next[source] * weight, 0);
        next[id] = clamp(squash((isRelative ? next[id] : 0) + sum));
      });
    } else {
      ids.forEach((id) => {
        if (locked[id] !== undefined) { next[id] = locked[id]; return; }
        const sum = incoming[id].reduce((s, { source, weight }) => s + current[source] * weight, 0);
        next[id] = clamp(squash((isRelative ? current[id] : 0) + sum));
      });
    }
    const maxDelta = Math.max(...ids.map((id) => Math.abs(next[id] - current[id])));
    current = next;
    series.push({ iteration: t, values: { ...current } });
    if (maxDelta < threshold) { converged = true; break; }
  }

  return { series, final: current, converged, iterationsRun: t };
}

// Role taxonomy is relative to the whole network (Hub needs the centrality
// distribution across every concept), so this is a two-pass computation:
// raw degree numbers first, then role assignment.
//   Isolated:  no relationships at all.
//   Hub:       top quartile of centrality, with both incoming and outgoing
//              relationships (highly connected in both directions).
//   Driver:    outgoing influence clearly outweighs incoming (not a Hub).
//   Receiver:  incoming influence clearly outweighs outgoing (not a Hub).
//   Connector: meaningfully connected both ways but not exceptionally
//              central: a relay/pass-through concept.
function computeMetrics(concepts, edges) {
  const raw = concepts.map((c) => {
    const out = edges.filter((e) => e.source === c.id).reduce((s, e) => s + Math.abs(e.weight), 0);
    const inn = edges.filter((e) => e.target === c.id).reduce((s, e) => s + Math.abs(e.weight), 0);
    return {
      id: c.id, name: c.name, indegree: round2(inn), outdegree: round2(out),
      centrality: round2(inn + out), netInfluence: round2(out - inn),
    };
  });
  const centralities = raw.map((m) => m.centrality).filter((v) => v > 0).sort((a, b) => a - b);
  const hubThreshold = centralities.length ? centralities[Math.min(Math.floor(centralities.length * 0.75), centralities.length - 1)] : Infinity;
  return raw.map((m) => {
    let role;
    if (m.centrality === 0) role = "Isolated";
    else if (m.centrality >= hubThreshold && m.indegree > 0 && m.outdegree > 0) role = "Hub";
    else if (m.outdegree > m.indegree * 1.2) role = "Driver";
    else if (m.indegree > m.outdegree * 1.2) role = "Receiver";
    else role = "Connector";
    return { ...m, role };
  });
}

// Perturbation-based influence/sensitivity scores: drive each concept to +1
// (from the zero-vector baseline) one at a time and measure how much every
// OTHER concept moves. "Influence" = average movement this concept CAUSES
// in the rest of the network. "Sensitivity" = average movement this concept
// UNDERGOES when every other concept is, in turn, driven the same way.
// n simulate() calls total (one per concept), independent of network size.
// Every OTHER concept must be explicitly forced to 0 here, not left to fall
// through to c.initialValue: simulate() only defaults an unoverridden
// concept to c.initialValue, so previously (initialOverrides holding only
// the driven concept) these scores silently depended on whatever's
// currently set on the Model Editor tab, contaminating what's meant to be a
// purely structural, model-independent measurement: e.g. the same network
// could report different Influence/Sensitivity scores depending only on
// what a user happened to type into "Initial activation" elsewhere, with no
// indication anywhere that these numbers weren't purely structural.
function computeAdvancedMetrics(concepts, edges, settings) {
  const ids = concepts.map((c) => c.id);
  const scores = {};
  ids.forEach((id) => (scores[id] = { influence: 0, sensitivity: 0 }));
  ids.forEach((driverId) => {
    const initialOverrides = {};
    ids.forEach((id) => { initialOverrides[id] = id === driverId ? 1 : 0; });
    const sc = { id: "baseline", type: "baseline", initialOverrides, lockedConcepts: { [driverId]: 1 } };
    const r = simulate(concepts, edges, sc, settings);
    ids.forEach((otherId) => {
      if (otherId === driverId) return;
      const delta = Math.abs(r.final[otherId] ?? 0);
      scores[driverId].influence += delta;
      scores[otherId].sensitivity += delta;
    });
  });
  const n = Math.max(1, ids.length - 1);
  ids.forEach((id) => {
    scores[id].influence = round2(scores[id].influence / n);
    scores[id].sensitivity = round2(scores[id].sensitivity / n);
  });
  return scores;
}

// Enumerates simple feedback loops (cycles) up to maxLen edges, capped at
// maxLoops total. Each start node only extends to a neighbor whose id is
// lexicographically >= the start id (or the start id itself to close the
// loop): the standard trick for visiting each simple cycle exactly once
// instead of once per rotation. This is exponential in the worst case, so
// the caps keep it tractable on dense 100-200 concept networks; if the caps
// are hit the UI says so rather than hanging.
function findFeedbackLoops(concepts, edges, maxLen = 8, maxLoops = 300) {
  const ids = concepts.map((c) => c.id);
  const adj = {};
  ids.forEach((id) => (adj[id] = []));
  edges.forEach((e) => { if (adj[e.source]) adj[e.source].push(e); });

  const loops = [];
  const capped = { hit: false };

  function dfs(startId, currentId, depth, edgePath, visited) {
    if (loops.length >= maxLoops) { capped.hit = true; return; }
    if (depth >= maxLen) return;
    for (const e of adj[currentId] || []) {
      if (loops.length >= maxLoops) { capped.hit = true; return; }
      if (e.target === startId) {
        loops.push([...edgePath, e]);
        continue;
      }
      if (e.target < startId || visited.has(e.target)) continue;
      visited.add(e.target);
      edgePath.push(e);
      dfs(startId, e.target, depth + 1, edgePath, visited);
      edgePath.pop();
      visited.delete(e.target);
    }
  }

  [...ids].sort().forEach((startId) => {
    if (loops.length >= maxLoops) return;
    dfs(startId, startId, 0, [], new Set([startId]));
  });

  const classified = loops.map((edgePath) => {
    const negCount = edgePath.filter((e) => e.weight < 0).length;
    return { length: edgePath.length, type: negCount % 2 === 0 ? "reinforcing" : "balancing" };
  });
  return {
    total: classified.length,
    reinforcing: classified.filter((l) => l.type === "reinforcing").length,
    balancing: classified.filter((l) => l.type === "balancing").length,
    capped: capped.hit,
  };
}

// Descriptive/structural statistics for the "System Overview" section:
// pure graph-theory numbers, no simulation needed.
function computeSystemStats(concepts, edges, metrics) {
  const n = concepts.length;
  const m = edges.length;
  const possible = n > 1 ? n * (n - 1) : 0;
  const density = possible > 0 ? round2((m / possible) * 100) : 0;
  const centralities = metrics.map((mt) => mt.centrality);
  const avgDegree = n > 0 ? round2((2 * m) / n) : 0;
  const maxDegree = centralities.length ? round2(Math.max(...centralities)) : 0;
  const minDegree = centralities.length ? round2(Math.min(...centralities)) : 0;

  const loops = findFeedbackLoops(concepts, edges);

  const receivers = metrics.filter((mt) => mt.role === "Receiver").length;
  const drivers = metrics.filter((mt) => mt.role === "Driver").length;
  const complexity = drivers > 0 ? round2(receivers / drivers) : (receivers > 0 ? Infinity : 0);
  const connectivity = n > 0 ? round2(m / n) : 0;
  const maxCentrality = centralities.length ? Math.max(...centralities) : 0;
  const sumGap = centralities.reduce((s, c) => s + (maxCentrality - c), 0);
  const maxPossibleGap = n > 1 ? (n - 1) * maxCentrality : 0;
  const centralization = maxPossibleGap > 0 ? round2((sumGap / maxPossibleGap) * 100) : 0;

  return {
    concepts: n, relationships: m,
    density, actualConnections: m, possibleConnections: possible,
    avgDegree, maxDegree, minDegree,
    loops,
    complexity, connectivity, centralization,
  };
}

const UNCATEGORIZED = "Uncategorized";

// Aggregates the same per-concept metrics the table/charts above already
// show (from computeMetrics + computeAdvancedMetrics), grouped by the
// free-text `category` field every concept already has. Concepts with no
// category are grouped under UNCATEGORIZED rather than dropped, so every
// concept is always accounted for somewhere. Generic by construction: it
// only ever groups by whatever category strings are actually present on
// the loaded model, never a fixed/hard-coded list.
function computeCategoryStats(concepts, edges, metrics) {
  const conceptCategory = new Map(concepts.map((c) => [c.id, c.category || UNCATEGORIZED]));
  const metricById = new Map(metrics.map((m) => [m.id, m]));

  const order = []; // first-seen order, so categories render/color consistently
  const byCategory = new Map();
  concepts.forEach((c) => {
    const cat = conceptCategory.get(c.id);
    if (!byCategory.has(cat)) { byCategory.set(cat, []); order.push(cat); }
    byCategory.get(cat).push(c.id);
  });

  const totals = new Map(order.map((cat) => [cat, {
    concepts: 0, internal: 0, incoming: 0, outgoing: 0,
    indegree: 0, outdegree: 0, centrality: 0, influence: 0, sensitivity: 0,
  }]));

  edges.forEach((e) => {
    const sc = conceptCategory.get(e.source);
    const tc = conceptCategory.get(e.target);
    if (sc === undefined || tc === undefined) return;
    if (sc === tc) {
      totals.get(sc).internal += 1;
    } else {
      totals.get(sc).outgoing += 1;
      totals.get(tc).incoming += 1;
    }
  });

  order.forEach((cat) => {
    const ids = byCategory.get(cat);
    const t = totals.get(cat);
    t.concepts = ids.length;
    ids.forEach((id) => {
      const m = metricById.get(id);
      if (!m) return;
      t.indegree += m.indegree; t.outdegree += m.outdegree; t.centrality += m.centrality;
      t.influence += m.influence ?? 0; t.sensitivity += m.sensitivity ?? 0;
    });
  });

  return order.map((cat) => {
    const t = totals.get(cat);
    const n = t.concepts || 1;
    const possible = t.concepts > 1 ? t.concepts * (t.concepts - 1) : 0;
    return {
      category: cat, isUncategorized: cat === UNCATEGORIZED,
      concepts: t.concepts, internal: t.internal, incoming: t.incoming, outgoing: t.outgoing,
      meanIndegree: round2(t.indegree / n), meanOutdegree: round2(t.outdegree / n),
      meanCentrality: round2(t.centrality / n),
      meanInfluence: round2(t.influence / n), meanSensitivity: round2(t.sensitivity / n),
      density: possible > 0 ? round2((t.internal / possible) * 100) : null,
    };
  });
}

// From-category -> to-category connection matrix (count + total signed
// weight per pair), diagonal included since a category's internal flow is
// informative alongside its cross-category flow. categories is the ordered
// list of category names computeCategoryStats already produced.
function computeCategoryMatrix(concepts, edges, categories) {
  const conceptCategory = new Map(concepts.map((c) => [c.id, c.category || UNCATEGORIZED]));
  const matrix = {};
  categories.forEach((a) => {
    matrix[a] = {};
    categories.forEach((b) => (matrix[a][b] = { count: 0, totalWeight: 0 }));
  });
  edges.forEach((e) => {
    const sc = conceptCategory.get(e.source);
    const tc = conceptCategory.get(e.target);
    if (!matrix[sc] || !matrix[sc][tc]) return;
    matrix[sc][tc].count += 1;
    matrix[sc][tc].totalWeight += e.weight;
  });
  return matrix;
}

const CATEGORY_COLORS = ["#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#be123c", "#4d7c0f", "#a16207", "#0e7490", "#4338ca", "#b91c1c"];

// ============================================================================
// Layout algorithms (Network tab "Auto Arrange")
// ============================================================================
function layoutCircular(concepts) {
  const n = concepts.length;
  return concepts.map((c, i) => ({ ...c, position: circlePos(i, n, 260, 420, 320) }));
}

// Layered layout via elkjs (the standard crossing-minimizing layout engine
// behind most React Flow auto-layout examples). ELK's own cycle-breaking
// handles FCM feedback loops internally, and its LAYER_SWEEP crossing
// minimization scales far better than a hand-rolled layering pass once
// networks get into the dozens-to-hundreds of concepts.
const elk = new ELK();
async function layoutHierarchical(concepts, edges, direction = "DOWN") {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": "100",
      "elk.spacing.nodeNode": "80",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.cycleBreaking.strategy": "GREEDY",
    },
    // Slightly overestimate real card size (name wraps to 1-3 lines) so ELK
    // leaves enough room and cards don't visually overlap once rendered.
    children: concepts.map((c) => ({ id: c.id, width: 210, height: c.category ? 110 : 90 })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);
  const positions = {};
  (result.children || []).forEach((n) => { positions[n.id] = { x: n.x, y: n.y }; });
  return concepts.map((c) => ({ ...c, position: positions[c.id] || c.position }));
}

function layoutForceDirected(concepts, edges) {
  const nodes = concepts.map((c) => ({ id: c.id, x: c.position?.x ?? Math.random() * 700, y: c.position?.y ?? Math.random() * 500 }));
  const links = edges.map((e) => ({ source: e.source, target: e.target }));
  const sim = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-900))
    .force("link", forceLink(links).id((d) => d.id).distance(170))
    .force("center", forceCenter(420, 320))
    .force("collide", forceCollide(80))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();
  const byId = {};
  nodes.forEach((n) => (byId[n.id] = { x: n.x, y: n.y }));
  return concepts.map((c) => ({ ...c, position: byId[c.id] || c.position }));
}

// ============================================================================
// Small shared UI bits
// ============================================================================
function Btn({ children, onClick, variant = "default", disabled, title, className = "" }) {
  const base = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    default: "bg-slate-900 text-white hover:bg-slate-700",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    danger: "bg-transparent text-red-600 hover:bg-red-50",
    accent: "bg-teal-700 text-white hover:bg-teal-600",
  };
  return (
    <button title={title} disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

// Three ways to edit a weight: drag the slider, type a number, or click a
// labeled preset. All three stay in sync and update the network immediately.
function WeightSlider({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex items-center gap-2">
        <input
          type="range" min={-1} max={1} step={0.05} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-teal-700"
        />
        <input
          type="number" min={-1} max={1} step={0.05} value={round2(value)}
          onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
          className="w-16 text-xs font-mono text-right border border-slate-200 rounded px-1 py-0.5"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            title={p.label}
            onClick={() => onChange(p.value)}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${value === p.value ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
          >
            {p.value > 0 ? "+" : ""}{p.value}
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoBox({ children }) {
  return (
    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-md p-3 space-y-1.5">
      {children}
    </div>
  );
}

// Glossary for the What-If Scenario Analysis help panel (Scenarios &
// Simulation tab). Definitions are shown as native browser tooltips via
// `title`, the same lightweight pattern used for other inline hints in this
// app, so no new tooltip library or component is needed.
const SCENARIO_GLOSSARY = {
  "Scenario": "A named, self-contained variant of the model in which one or more interventions are applied, so its results can be run and compared against the baseline without altering the baseline itself.",
  "Intervention": "A specific change applied within a scenario: holding a concept's value fixed (a driver/lock), overriding its starting value, or adjusting a relationship's weight.",
  "Equilibrium": "The state a scenario's concepts settle into once the model stops changing (or the maximum number of iterations is reached), given its interventions and the underlying causal structure.",
  "Effect Size": "How far a concept's equilibrium value in a scenario differs from its value in the baseline, indicating the magnitude of the scenario's impact on that concept.",
  "Synergy": "When two or more interventions, run together, produce a larger effect on an outcome than the sum of their individual effects run separately, suggesting the measures reinforce one another.",
  "Trade-Off": "When an intervention that improves one outcome concept simultaneously worsens another, indicating the two outcomes are structurally in tension within the model.",
};

// Shown by BaselineEquilibriumTab / SensitivityAnalysisTab /
// TransitionPointAnalysisTab whenever the model has changed (any edit to
// concepts, edges, or settings, tracked via the parent's modelVersion
// counter) since that tab's stored result was computed. Without this,
// editing the model after running one of these analyses left its chart/
// table/diagnostics silently showing output from a model that no longer
// matches what's on screen, with nothing on screen saying so. And since
// Export Analysis Workbook now caches these results and their chart images
// across tab switches, a stale result could end up baked into a downloaded
// workbook with no indication it was out of date.
function StaleResultBanner({ label }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
      <Info size={13} className="shrink-0 mt-0.5" />
      <span>The model has changed since {label} was last run: the results below no longer reflect the current concepts, relationships, or settings. Run it again to refresh them.</span>
    </div>
  );
}

function ScenarioTerm({ term, children }) {
  return (
    <span className="border-b border-dotted border-slate-400 cursor-help" title={SCENARIO_GLOSSARY[term] || ""}>
      {children ?? term}
    </span>
  );
}

// There was no error boundary anywhere in the app: an uncaught exception
// during render (e.g. the Network tab's getNodeIntersection destructuring a
// momentarily-undefined node.measured; now guarded, but this is the
// general-purpose safety net for that whole class of bug) had nothing to
// catch it, so React unmounted the tree with no in-place way to recover.
// The only fix was switching tabs and back, which remounts the crashed
// subtree fresh. This wraps a section of the UI and shows a recoverable
// message instead of leaving it silently blank.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-white rounded-lg border border-rose-200 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-700">Something went wrong displaying {this.props.label || "this view"}.</p>
          <p className="text-xs text-slate-500">Your model data is unaffected: this is a display error, not data loss. {this.props.showDetail !== false && this.state.error?.message ? `(${this.state.error.message})` : ""}</p>
          <Btn variant="outline" onClick={() => this.setState({ error: null })}><RotateCcw size={14} />Try again</Btn>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// Network tab: React Flow node/edge colors
// ============================================================================
function nodeColorFor(v) {
  if (v <= -0.6) return { bg: "#991b1b", text: "#ffffff", label: "Strong negative" };
  if (v <= -0.15) return { bg: "#fca5a5", text: "#7f1d1d", label: "Moderate negative" };
  if (v < 0.15) return { bg: "#e2e8f0", text: "#334155", label: "Neutral" };
  if (v < 0.6) return { bg: "#93c5fd", text: "#1e3a8a", label: "Moderate positive" };
  return { bg: "#1e40af", text: "#ffffff", label: "Strong positive" };
}

// Every side is a full connection handle (bar-shaped, not a small dot) so a
// relationship can be started or received from whichever side is closest to
// the other node, instead of being forced through one fixed point.
function ConceptNode({ data, selected }) {
  const c = data.concept;
  // Before any simulation has been run, `currentValue` is just a stale
  // default (0) set when the concept was created; it never reflected
  // whatever the user typed into "Initial activation" until they actually
  // ran something. Show the value that's actually true right now: the
  // initial value pre-run, the simulated result post-run, each labeled so
  // it's unambiguous which one is on screen.
  const displayValue = data.hasRun ? c.currentValue : c.initialValue;
  const { bg, text } = nodeColorFor(displayValue);
  const dot = "!bg-slate-500 !border !border-white opacity-70 hover:opacity-100";
  return (
    <div
      style={{ background: bg, color: text, minWidth: 170, maxWidth: 230 }}
      className={`rounded-xl border-2 px-3 py-2 shadow-sm transition-shadow ${selected ? "border-teal-600 shadow-md ring-2 ring-teal-300" : "border-black/10"}`}
    >
      <Handle type="source" position={Position.Top} id="t" style={{ width: 28, height: 9, borderRadius: 4 }} className={dot} />
      <Handle type="source" position={Position.Right} id="r" style={{ width: 9, height: 28, borderRadius: 4 }} className={dot} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ width: 28, height: 9, borderRadius: 4 }} className={dot} />
      <Handle type="source" position={Position.Left} id="l" style={{ width: 9, height: 28, borderRadius: 4 }} className={dot} />
      {/* Matching type="target" handles, stacked exactly on top of the
          type="source" ones above (same id/position/size, invisible AND
          non-interactive: pointerEvents:"none" so a drag can never start
          or land on these; the visible type="source" bars above stay the
          only thing the pointer can ever hit, exactly as before). React Flow
          still mounts and registers each one's bounds regardless of pointer-
          events, and that's all that's needed here: React Flow can only
          resolve a *fixed* sourceX/Y/position for a manually-drawn edge's
          endpoint by looking up a handle of the matching type at render
          time; with no type="target" handle registered at all, that lookup
          silently failed and React Flow fell back to floating routing,
          discarding the recorded side entirely. These exist purely so that
          lookup has something to find, without changing which element the
          pointer actually interacts with. */}
      <Handle type="target" position={Position.Top} id="t" style={{ width: 28, height: 9, borderRadius: 4, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Right} id="r" style={{ width: 9, height: 28, borderRadius: 4, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Bottom} id="b" style={{ width: 28, height: 9, borderRadius: 4, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Left} id="l" style={{ width: 9, height: 28, borderRadius: 4, opacity: 0, pointerEvents: "none" }} />
      <div className="text-sm font-semibold leading-snug break-words" style={{ wordBreak: "break-word" }}>{c.name}</div>
      <div className="text-[10px] mt-1 font-mono opacity-75">{data.hasRun ? "Current simulated activation" : "Initial activation"}</div>
      <div className="text-xs font-mono font-semibold opacity-95">{displayValue >= 0 ? "+" : ""}{round2(displayValue).toFixed(2)}</div>
      {c.category && (
        <div className="text-[10px] mt-1.5 inline-block px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.12)" }}>{c.category}</div>
      )}
    </div>
  );
}

// ==== floating edges: the connection point is recomputed every render from
// each node's live center position and size, instead of trusting whichever
// fixed handle a connection happened to be dragged from. This is what makes
// a relationship leave and enter whichever side actually faces the other
// node (left-to-right, right-to-left, top-down, bottom-up all fall out of
// the same geometry), and re-route automatically whenever a node moves.
// Standard React Flow "floating edges" technique.
// A node from useInternalNode() can be transiently incomplete, not just
// .measured (guarded before this round), but .internals and
// .internals.positionAbsolute themselves, for a node not yet fully
// registered in React Flow's internal store. The previous fix only guarded
// .measured and missed .internals.positionAbsolute, which was unguarded in
// four places (this function, getEdgePosition, and twice in InfluenceEdge's
// ARROW_GAP block): exactly the same crash, just thrown from one property
// access over instead of another, which is why the disappearing-canvas bug
// survived that fix. This is the one place that reads it now; every call
// site below goes through this instead of touching .internals directly.
function safeNodePos(node) {
  return node?.internals?.positionAbsolute ?? { x: 0, y: 0 };
}

function getNodeIntersection(intersectionNode, targetNode) {
  const iw = intersectionNode.measured?.width ?? 0;
  const ih = intersectionNode.measured?.height ?? 0;
  const ip = safeNodePos(intersectionNode);
  const tp = safeNodePos(targetNode);
  const tw = targetNode.measured?.width ?? 0;
  const th = targetNode.measured?.height ?? 0;

  const w = iw / 2, h = ih / 2;
  const x2 = ip.x + w, y2 = ip.y + h; // intersectionNode's center
  const x1 = tp.x + tw / 2, y1 = tp.y + th / 2; // targetNode's center

  // Standard ray/axis-aligned-rectangle intersection: the ray from this
  // node's center toward the other node's center exits the rectangle at
  // whichever axis constraint (half-width vs half-height) is hit first.
  // (A previous version computed the x and y components of this entirely
  // independently of each other, which only happens to land on the true
  // boundary for square nodes or perfectly axis-aligned lines; for a
  // typical rectangular node approached diagonally it produced a point
  // still well inside the box, which is what let arrowheads render "under"
  // the node even with a healthy pullback gap applied afterward.)
  const dx = x1 - x2, dy = y1 - y2;
  if (dx === 0 && dy === 0) return { x: x2, y: y2 };
  const tX = dx !== 0 ? w / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? h / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  const x = x2 + t * dx;
  const y = y2 + t * dy;
  return { x, y };
}

function getEdgePosition(node, point) {
  const n = safeNodePos(node);
  const nw = node.measured?.width ?? 0;
  const nh = node.measured?.height ?? 0;
  const px = Math.round(point.x), py = Math.round(point.y);
  const nx = Math.round(n.x), ny = Math.round(n.y);
  if (px <= nx + 2) return Position.Left;
  if (px >= nx + nw - 2) return Position.Right;
  if (py <= ny + 2) return Position.Top;
  if (py >= ny + nh - 2) return Position.Bottom;
  return Position.Top;
}

function getEdgeParams(source, target) {
  const sp = getNodeIntersection(source, target);
  const tp = getNodeIntersection(target, source);
  return {
    sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y,
    sourcePos: getEdgePosition(source, sp), targetPos: getEdgePosition(target, tp),
  };
}

function InfluenceEdge({
  id, source, target,
  sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  data, selected, markerEnd,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { zoom } = useViewport();
  if (!sourceNode || !targetNode) return null;

  // If this relationship was drawn from a specific side (top/right/bottom/
  // left), honor exactly that side, the way it was drawn, using the fixed-
  // handle coordinates React Flow already computed. Only fall back to
  // automatic "best side" floating routing for edges with no recorded
  // handle (built from the matrix paste, the Model editor dropdowns, or an
  // import) since there's no drawn side to honor there.
  //
  // Note: React Flow computes sourceX/sourceY/sourcePosition (etc.) from the
  // edge's actual sourceHandle/targetHandle internally, but does NOT forward
  // sourceHandle/targetHandle themselves as props to a custom edge component
  // (they always arrive here as undefined, confirmed by inspecting what
  // actually reaches this render). Read the recorded side from data.edge
  // instead: the same domain field the "edges" array was built from, so
  // the fixed-handle branch is chosen correctly regardless of that gap.
  const hasFixedHandles = !!(data?.edge?.sourceHandle && data?.edge?.targetHandle);
  let sx, sy, tx, ty, sourcePos, targetPos;
  if (hasFixedHandles) {
    sx = sourceX; sy = sourceY; sourcePos = sourcePosition;
    tx = targetX; ty = targetY; targetPos = targetPosition;
  } else {
    const params = getEdgeParams(sourceNode, targetNode);
    sx = params.sx; sy = params.sy; sourcePos = params.sourcePos;
    tx = params.tx; ty = params.ty; targetPos = params.targetPos;
  }

  const w = data?.edge?.weight ?? 0;
  const color = w >= 0 ? "#16a34a" : "#ea580c";
  const strokeWidth = 1.5 + Math.abs(w) * 4.5 + (selected ? 1.5 : 0);
  const isOrthogonal = data?.edgeStyle === "orthogonal";
  const parallelSlot = data?.parallelSlot || 0;

  // Pull the target end back from the true boundary point so the arrowhead
  // has room to render in the open instead of landing exactly on (and
  // getting visually swallowed by) the node's border/background. This has
  // to be a constant number of *screen* pixels, not flow-space units;
  // flow-space coordinates get scaled by the viewport's zoom, so a fixed
  // flow-space gap shrinks to sub-pixel at any zoom below ~1 (which is most
  // of the time: fitView routinely lands well under 1x for anything but a
  // tiny network), letting the arrow tip land back inside the node's
  // border. Dividing by the live zoom keeps the visible gap constant.
  const ARROW_GAP_PX = 8;
  const ARROW_GAP = ARROW_GAP_PX / Math.max(zoom, 0.1);
  {
    // Pull back toward the SOURCE NODE'S CENTER, not "back along sx,sy to
    // tx,ty"; sx,sy and tx,ty are each independently computed as wherever
    // the straight line to the *other* node's center happens to cross this
    // node's own boundary, so for two large boxes approached near a corner
    // the vector between those two independent boundary points doesn't
    // reliably point "away from the target" (it can even point back INTO
    // it, which is exactly what let the arrowhead land inside the box even
    // with a non-zero gap applied). The direction from the target node's
    // own center to the source node's own center is unambiguous and always
    // points out of the target box, so pulling back along that is robust
    // regardless of node size, aspect ratio, or approach angle.
    const targetPos = safeNodePos(targetNode);
    const sourcePos = safeNodePos(sourceNode);
    const targetCx = targetPos.x + (targetNode.measured?.width ?? 0) / 2;
    const targetCy = targetPos.y + (targetNode.measured?.height ?? 0) / 2;
    const sourceCx = sourcePos.x + (sourceNode.measured?.width ?? 0) / 2;
    const sourceCy = sourcePos.y + (sourceNode.measured?.height ?? 0) / 2;
    const pdx = sourceCx - targetCx, pdy = sourceCy - targetCy;
    const plen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    tx += (pdx / plen) * ARROW_GAP;
    ty += (pdy / plen) * ARROW_GAP;
  }

  // Endpoints (sx,sy / tx,ty) always stay directly on (or, for the target,
  // just short of) the node boundary: that's what "connections must
  // anchor directly to nodes" requires. A previous version separated A<->B
  // feedback-loop pairs by shifting BOTH endpoints sideways, which visibly
  // detached the edge from the node it was supposedly attached to. Parallel
  // pairs are now separated by bowing only the curve's MIDPOINT sideways (a
  // quadratic Bezier), leaving the true attachment points untouched.
  let path, labelX, labelY;
  if (isOrthogonal) {
    [path, labelX, labelY] = getSmoothStepPath({ sourceX: sx, sourceY: sy, sourcePosition: sourcePos, targetX: tx, targetY: ty, targetPosition: targetPos, borderRadius: 8 });
  } else if (parallelSlot !== 0) {
    const dx = tx - sx, dy = ty - sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = parallelSlot * 18;
    const midX = (sx + tx) / 2 + (-dy / len) * offset;
    const midY = (sy + ty) / 2 + (dx / len) * offset;
    path = `M ${sx},${sy} Q ${midX},${midY} ${tx},${ty}`;
    labelX = 0.25 * sx + 0.5 * midX + 0.25 * tx;
    labelY = 0.25 * sy + 0.5 * midY + 0.25 * ty;
  } else {
    [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sourcePos, targetX: tx, targetY: ty, targetPosition: targetPos });
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth, opacity: selected ? 1 : 0.85 }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all", zIndex: selected ? 20 : 5 }}
          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border shadow-sm select-none ${w >= 0 ? "bg-green-50 border-green-300 text-green-800" : "bg-orange-50 border-orange-300 text-orange-800"}`}
        >
          {w >= 0 ? "+" : ""}{round2(w).toFixed(2)}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { concept: ConceptNode };
const edgeTypes = { influence: InfluenceEdge };

// ============================================================================
// Network tab
// ============================================================================
function NetworkTab(props) {
  return (
    <ReactFlowProvider>
      <NetworkTabInner {...props} />
    </ReactFlowProvider>
  );
}

function NetworkTabInner({
  concepts, edges, selected, setSelected,
  updateConcept, updateEdge, removeConcept, removeEdge, moveConcept,
  addConceptAt, createEdge, applyBulkPositions,
  commitHistory, undo, redo, canUndo, canRedo,
  copyConcept, pasteConcept, hasClipboard, hasRun, setChartCache,
}) {
  const wrapperRef = useRef(null);
  useCachedChart(setChartCache, "networkGraph", '[data-chart="network-graph"]', "dom", [concepts, edges]);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [edgeStyle, setEdgeStyle] = useState("curved");
  const rf = useReactFlow();
  // Arrowhead size: React Flow's built-in ArrowClosed marker uses
  // markerUnits="strokeWidth" (confirmed by inspecting the rendered SVG),
  // meaning its on-screen size is markerSize x the edge's own strokeWidth,
  // NOT an absolute pixel size. strokeWidth is flow-space and already scales
  // correctly with viewport zoom through the normal SVG transform, the same
  // way the edge lines themselves do, so this needs no zoom term of its own
  // (an earlier version divided this by zoom too, double-compensating on
  // top of the marker's own strokeWidth-relative scaling, which combined
  // with weight-driven strokeWidth 1.5-7.5 to make strong/selected edges'
  // arrowheads render many times too large). A small constant here lets the
  // marker scale proportionally with edge weight/thickness as intended,
  // without dominating the visual.
  const markerSize = 6.5;

  const rfNodes = useMemo(() => concepts.map((c) => ({
    id: c.id, type: "concept", position: c.position || { x: 0, y: 0 },
    data: { concept: c, hasRun }, selected: selected?.kind === "concept" && selected.id === c.id,
  })), [concepts, selected, hasRun]);

  // Parallel-edge slots: when A->B and B->A both exist, give them opposite
  // offsets (see InfluenceEdge) so the two curves visually separate instead
  // of overlapping. Slot assignment is order-stable (sorted by edge id).
  const parallelSlots = useMemo(() => {
    const groups = {};
    edges.forEach((e) => {
      const key = [e.source, e.target].sort().join("|");
      (groups[key] = groups[key] || []).push(e.id);
    });
    const slots = {};
    Object.values(groups).forEach((ids) => {
      if (ids.length < 2) { slots[ids[0]] = 0; return; }
      const sorted = [...ids].sort();
      sorted.forEach((id, i) => { slots[id] = i % 2 === 0 ? Math.ceil((i + 1) / 2) : -Math.ceil(i / 2); });
    });
    return slots;
  }, [edges]);

  const rfEdges = useMemo(() => edges.map((e) => ({
    id: e.id, source: e.source, target: e.target, type: "influence",
    // Set at the top level (not just in `data`) so React Flow itself treats
    // this as a fixed-handle connection and computes sourceX/sourceY/
    // sourcePosition (etc.) from that specific handle, passed into
    // InfluenceEdge below. Omitted entirely when the edge has none stored
    // (created via matrix paste, dropdown, or import), which keeps those on
    // automatic floating routing.
    ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    data: { edge: e, edgeStyle, parallelSlot: parallelSlots[e.id] || 0 },
    selected: selected?.kind === "edge" && selected.id === e.id,
    reconnectable: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: e.weight >= 0 ? "#16a34a" : "#ea580c", width: markerSize, height: markerSize },
  })), [edges, selected, edgeStyle, parallelSlots, markerSize]);

  const onNodesChange = useCallback((changes) => {
    changes.forEach((ch) => {
      if (ch.type === "position" && ch.position) {
        // Tried deferring this to drag-end only (ch.dragging === false), on
        // the theory that React Flow tracks an active drag's visual position
        // entirely internally: verified live that it does NOT, at least
        // not in this controlled-nodes setup; skipping the intermediate
        // dragging:true updates left the node completely frozen in place
        // for the whole gesture. Reverted; every "position" change is
        // applied immediately, same as before. The actual crash mechanism
        // (getNodeIntersection's unguarded .measured destructure, fixed
        // below) and the missing error boundary (also added) are the real
        // fix for the disappearing-canvas bug; see the plan file.
        moveConcept(ch.id, ch.position);
        if (ch.dragging === false) commitHistory();
      } else if (ch.type === "select") {
        if (ch.selected) setSelected({ kind: "concept", id: ch.id });
        else setSelected((s) => (s?.kind === "concept" && s.id === ch.id ? null : s));
      } else if (ch.type === "remove") {
        removeConcept(ch.id);
      }
    });
  }, [moveConcept, commitHistory, setSelected, removeConcept]);

  const onEdgesChange = useCallback((changes) => {
    changes.forEach((ch) => {
      if (ch.type === "select") {
        if (ch.selected) setSelected({ kind: "edge", id: ch.id });
        else setSelected((s) => (s?.kind === "edge" && s.id === ch.id ? null : s));
      } else if (ch.type === "remove") {
        removeEdge(ch.id);
      }
    });
  }, [setSelected, removeEdge]);

  const onConnect = useCallback((params) => {
    commitHistory();
    createEdge(params.source, params.target, params.sourceHandle, params.targetHandle);
  }, [commitHistory, createEdge]);

  // Drag an existing relationship's endpoint onto a different node (or a
  // different side of the same node) to rewire it, instead of deleting and
  // recreating it. Whichever handle it's dropped on becomes the new fixed
  // side for that end.
  const onReconnect = useCallback((oldEdge, newConnection) => {
    commitHistory();
    updateEdge(oldEdge.id, {
      source: newConnection.source, target: newConnection.target,
      sourceHandle: newConnection.sourceHandle, targetHandle: newConnection.targetHandle,
    });
  }, [commitHistory, updateEdge]);

  const onPaneClick = useCallback(() => setSelected(null), [setSelected]);

  const onPaneDoubleClick = useCallback((e) => {
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    commitHistory();
    addConceptAt(pos);
  }, [rf, commitHistory, addConceptAt]);

  // ==== keyboard shortcuts ===================================================
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onKeyDown = (e) => {
      if (e.code === "Space" && !isTyping()) { setSpaceHeld(true); }
      if (isTyping()) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        commitHistory();
        if (selected.kind === "concept") removeConcept(selected.id);
        else removeEdge(selected.id);
      } else if (mod && e.key.toLowerCase() === "c") {
        if (selected?.kind === "concept") {
          const c = concepts.find((c) => c.id === selected.id);
          if (c) copyConcept(c);
        }
      } else if (mod && e.key.toLowerCase() === "v") {
        if (hasClipboard) { e.preventDefault(); pasteConcept(); }
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault(); undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault(); redo();
      }
    };
    const onKeyUp = (e) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selected, concepts, commitHistory, removeConcept, removeEdge, copyConcept, pasteConcept, hasClipboard, undo, redo]);

  // Shift+wheel = horizontal pan instead of zoom (captured before RF's own
  // wheel-zoom handler runs).
  const onWheelCapture = useCallback((e) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const vp = rf.getViewport();
    rf.setViewport({ x: vp.x - e.deltaY, y: vp.y, zoom: vp.zoom });
  }, [rf]);

  const runLayout = async (kind) => {
    setLayoutMenuOpen(false);
    setLayoutBusy(true);
    try {
      let next;
      if (kind === "circular") next = layoutCircular(concepts);
      else if (kind === "hier-td") next = await layoutHierarchical(concepts, edges, "DOWN");
      else if (kind === "hier-lr") next = await layoutHierarchical(concepts, edges, "RIGHT");
      else if (kind === "force") next = layoutForceDirected(concepts, edges);
      else return;
      // Auto-layout only assigns positions once, the same way dragging a
      // node does. Nothing is locked afterward, so manual dragging keeps
      // working immediately.
      applyBulkPositions(next);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
    } finally {
      setLayoutBusy(false);
    }
  };

  const selectedConcept = selected?.kind === "concept" ? concepts.find((c) => c.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) : null;

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5 h-[700px]">
      <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col relative">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Btn variant="outline" onClick={() => { commitHistory(); addConceptAt({ x: 200 + Math.random() * 200, y: 150 + Math.random() * 150 }); }}>
            <Plus size={14} />Add concept
          </Btn>
          <Btn variant="outline" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 size={14} /></Btn>
          <Btn variant="outline" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo2 size={14} /></Btn>
          <div className="relative">
            <Btn variant="outline" onClick={() => setLayoutMenuOpen((v) => !v)} disabled={layoutBusy}>
              <Maximize2 size={14} />{layoutBusy ? "Arranging..." : "Auto Arrange"}<ChevronDown size={12} />
            </Btn>
            {layoutMenuOpen && (
              <div className="absolute z-30 mt-1 w-56 bg-white border border-slate-200 rounded-md shadow-lg py-1">
                <button onClick={() => runLayout("hier-td")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"><GitBranch size={13} />Hierarchical (top-down)</button>
                <button onClick={() => runLayout("hier-lr")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"><GitBranch size={13} className="rotate-90" />Left-to-right causal chain</button>
                <button onClick={() => runLayout("circular")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"><LayoutGrid size={13} />Circular</button>
                <button onClick={() => runLayout("force")} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"><Shuffle size={13} />Force-directed</button>
              </div>
            )}
          </div>
          <div className="flex items-center border border-slate-300 rounded-md overflow-hidden text-xs">
            <button onClick={() => setEdgeStyle("curved")} className={`px-2.5 py-1.5 ${edgeStyle === "curved" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Curved</button>
            <button onClick={() => setEdgeStyle("orthogonal")} className={`px-2.5 py-1.5 border-l border-slate-300 ${edgeStyle === "orthogonal" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Orthogonal</button>
          </div>
          <span className="text-[11px] text-slate-400 ml-auto italic">
            {spaceHeld ? "Pan mode (space held)" : "Drag any side of a node to connect it (top, right, bottom, or left); double-click empty space to add a concept"}
          </span>
        </div>

        <div
          ref={wrapperRef} data-chart="network-graph" className="flex-1 rounded-lg overflow-hidden border border-slate-200" onWheelCapture={onWheelCapture}
          onDoubleClick={(e) => {
            // Only add a concept when the double-click lands on empty canvas:
            // not on a node, edge, handle, or a UI control like the minimap.
            if (e.target.closest(".react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__minimap, .react-flow__controls")) return;
            onPaneDoubleClick(e);
          }}
        >
          <ErrorBoundary label="the network canvas">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onPaneClick={onPaneClick}
              connectionMode="loose"
              panOnDrag={spaceHeld ? [0, 1, 2] : [1, 2]}
              nodesDraggable={!spaceHeld}
              selectionOnDrag={!spaceHeld}
              deleteKeyCode={null}
              zoomOnDoubleClick={false}
              zoomOnScroll
              minZoom={0.15}
              maxZoom={2.5}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => nodeColorFor((hasRun ? n.data?.concept?.currentValue : n.data?.concept?.initialValue) ?? 0).bg} className="!bg-white" />
            </ReactFlow>
          </ErrorBoundary>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2 px-1 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#1e40af" }} /> strong +</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#93c5fd" }} /> moderate +</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#e2e8f0" }} /> neutral</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#fca5a5" }} /> moderate −</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded inline-block" style={{ background: "#991b1b" }} /> strong −</span>
          <span className="flex items-center gap-1 ml-2"><span className="w-4 h-0.5 inline-block bg-green-600" /> positive influence</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block bg-orange-600" /> negative influence</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-auto flex flex-col">
        <h3 className="font-semibold text-sm mb-3">Inspector</h3>
        {selectedConcept && (
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Concept name</label>
            <input
              value={selectedConcept.name}
              onChange={(e) => updateConcept(selectedConcept.id, { name: e.target.value })}
              className="w-full text-sm font-medium border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <label className="text-xs text-slate-500">Description</label>
            <textarea
              value={selectedConcept.description || ""}
              onChange={(e) => updateConcept(selectedConcept.id, { description: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded p-1.5 h-20"
            />
            <label className="text-xs text-slate-500">Category (optional)</label>
            <input
              value={selectedConcept.category || ""}
              onChange={(e) => updateConcept(selectedConcept.id, { category: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
            />
            <label className="text-xs text-slate-500">Initial activation</label>
            <input
              type="number" min={-1} max={1} step={0.05} value={selectedConcept.initialValue}
              onChange={(e) => updateConcept(selectedConcept.id, { initialValue: clamp(parseFloat(e.target.value) || 0) })}
              className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
            />
            <div className="text-xs text-slate-500 pt-1">
              {hasRun ? "Current simulated activation" : "Not yet simulated (showing initial activation)"}: <span className="font-mono font-semibold">{round2(hasRun ? selectedConcept.currentValue : selectedConcept.initialValue)}</span>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => copyConcept(selectedConcept)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Copy size={13} /> Copy (Ctrl+C)</button>
              <button onClick={() => { commitHistory(); removeConcept(selectedConcept.id); }} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        )}
        {selectedEdge && (
          <div className="space-y-2">
            <label className="text-xs text-slate-500">Source concept</label>
            <div className="text-sm font-medium">{concepts.find((c) => c.id === selectedEdge.source)?.name}</div>
            <label className="text-xs text-slate-500">Target concept</label>
            <div className="text-sm font-medium">{concepts.find((c) => c.id === selectedEdge.target)?.name}</div>
            <label className="text-xs text-slate-500 block pt-1">Weight</label>
            <WeightSlider value={selectedEdge.weight} onChange={(v) => updateEdge(selectedEdge.id, { weight: v })} />
            <label className="text-xs text-slate-500">Description</label>
            <textarea
              value={selectedEdge.description || ""}
              onChange={(e) => updateEdge(selectedEdge.id, { description: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded p-1.5 h-16"
            />
            <button onClick={() => { commitHistory(); removeEdge(selectedEdge.id); }} className="mt-1 inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
              <Trash2 size={13} /> Delete relationship
            </button>
          </div>
        )}
        {!selectedConcept && !selectedEdge && (
          <p className="text-xs text-slate-400 italic">Click a node or edge to inspect and edit it here, or use "Add concept" and drag from any side of a node to build the model directly (alongside pasting a matrix from Excel on the Model editor tab).</p>
        )}

        <div className="mt-auto pt-4 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><MousePointer2 size={12} />Keyboard shortcuts</h4>
          <ul className="text-[11px] text-slate-400 space-y-0.5 font-mono">
            <li>Scroll: zoom</li>
            <li>Shift+scroll: pan horizontally</li>
            <li>Right/middle-drag, or hold Space: pan canvas</li>
            <li>Double-click canvas: add concept</li>
            <li>Delete / Backspace: delete selection</li>
            <li>Ctrl+C / Ctrl+V: copy / paste concept</li>
            <li>Ctrl+Z / Ctrl+Y: undo / redo</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Influence Metrics tab
// ============================================================================
const METRIC_HELP = {
  indegree: "Number and strength of incoming influences a concept receives from other concepts. Interpretation: high in-degree indicates a concept is strongly affected by the rest of the system.",
  outdegree: "Number and strength of outgoing influences a concept exerts on other concepts. Interpretation: high out-degree indicates a major driver within the system.",
  netInfluence: "Out-degree minus in-degree. Interpretation: positive values indicate a driver; negative values indicate a receiver.",
  centrality: "Combined measure of overall importance within the network. Interpretation: highly central concepts occupy influential positions within the system structure.",
  influence: "Overall ability of a concept to affect other concepts. Interpretation: higher values indicate stronger system-wide influence.",
  sensitivity: "Overall responsiveness of a concept to changes elsewhere. Interpretation: higher values indicate greater susceptibility to system changes.",
  role: "Categorization of system position. Driver: sends more than it receives. Receiver: receives more than it sends. Connector: meaningfully connected both ways. Hub: exceptionally central, with both incoming and outgoing relationships. Isolated: no relationships at all.",
};

const SYSTEM_STAT_HELP = {
  concepts: "Total number of concepts in the model.",
  relationships: "Total number of relationships (edges) in the model.",
  density: "Actual relationships divided by the maximum possible number of directed relationships between all concept pairs (n x (n-1)), as a percentage.",
  avgDegree: "Average total degree (in-degree plus out-degree) across all concepts: (2 x relationships) / concepts.",
  loops: "Simple feedback loops found in the network, up to 8 concepts long. Reinforcing loops contain an even number of negative relationships (amplify change); balancing loops contain an odd number (dampen change).",
  complexity: "Receiver concepts divided by Driver concepts (Ozesmi & Ozesmi's FCM complexity index). Higher values mean the model leans toward outcome-heavy thinking; lower values mean it leans toward driver-heavy thinking.",
  connectivity: "Relationships per concept: relationships / concepts. A simple measure of how densely connected the model is, distinct from density (which normalizes by the maximum possible).",
  centralization: "How concentrated influence is in a few hub concepts versus spread evenly, normalized 0-100%. Higher values mean a small number of concepts dominate the network's structure.",
};

// Real text-measurement (not a character-count guess) so long concept names
// get exactly the axis width and line wrapping they need, no more and no
// less.
function measureTextWidth(text, font = "10px Inter, system-ui, sans-serif") {
  if (typeof document === "undefined") return text.length * 6;
  const canvas = measureTextWidth._canvas || (measureTextWidth._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

function wrapLabel(text, maxWidth, font) {
  const words = String(text).split(" ");
  const lines = [];
  let current = "";
  words.forEach((w) => {
    const test = current ? `${current} ${w}` : w;
    if (current && measureTextWidth(test, font) > maxWidth) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// Custom Y-axis tick for the two "by concept" bar charts: wraps long
// concept names onto multiple lines instead of letting recharts truncate
// or overlap them.
function WrappedTick({ x, y, payload, width }) {
  const lines = wrapLabel(payload.value, width - 8, "10px Inter, system-ui, sans-serif");
  const lineHeight = 12;
  const offset = -((lines.length - 1) * lineHeight) / 2;
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text key={i} x={0} y={offset + i * lineHeight} dy={4} textAnchor="end" fontSize={10} fill="#475569">{line}</text>
      ))}
    </g>
  );
}

const ROLE_STYLE = {
  Hub: "bg-purple-50 text-purple-700",
  Driver: "bg-blue-50 text-blue-700",
  Receiver: "bg-orange-50 text-orange-700",
  Connector: "bg-teal-50 text-teal-700",
  Isolated: "bg-slate-100 text-slate-500",
};

function InfluenceMetricsTab({ concepts, edges, settings, onHighlight, setChartCache }) {
  const [showMethodology, setShowMethodology] = useState(false);
  const structural = useMemo(() => computeMetrics(concepts, edges), [concepts, edges]);
  const advanced = useMemo(() => computeAdvancedMetrics(concepts, edges, settings), [concepts, edges, settings]);
  const metrics = useMemo(
    () => structural.map((m) => ({ ...m, ...advanced[m.id] })).sort((a, b) => b.centrality - a.centrality),
    [structural, advanced]
  );
  useCachedChart(setChartCache, "influenceScores", '[data-chart="influence-scores"]', "svg", [metrics]);
  const stats = useMemo(() => computeSystemStats(concepts, edges, metrics), [concepts, edges, metrics]);

  const topInfluential = useMemo(() => [...metrics].sort((a, b) => b.influence - a.influence).slice(0, 5), [metrics]);
  const topSensitive = useMemo(() => [...metrics].sort((a, b) => b.sensitivity - a.sensitivity).slice(0, 5), [metrics]);
  const topConnected = useMemo(() => [...metrics].sort((a, b) => b.centrality - a.centrality).slice(0, 5), [metrics]);

  // Longest name across both bar charts sets a shared axis width, capped so
  // one very long name can't crush the plot area to nothing; names past the
  // cap wrap onto extra lines instead of truncating.
  const yAxisWidth = useMemo(() => {
    if (!metrics.length) return 140;
    const longest = Math.max(...metrics.map((m) => measureTextWidth(m.name)));
    return Math.min(340, Math.max(140, Math.ceil(longest) + 16));
  }, [metrics]);
  const rowHeight = 34;

  const categoryStats = useMemo(() => computeCategoryStats(concepts, edges, metrics), [concepts, edges, metrics]);
  const hasCategories = categoryStats.some((c) => !c.isUncategorized);
  const categoryColor = useMemo(() => {
    const map = new Map();
    categoryStats.forEach((c, i) => map.set(c.category, CATEGORY_COLORS[i % CATEGORY_COLORS.length]));
    return map;
  }, [categoryStats]);
  const categoryMatrix = useMemo(
    () => computeCategoryMatrix(concepts, edges, categoryStats.map((c) => c.category)),
    [concepts, edges, categoryStats]
  );
  const categoryYAxisWidth = useMemo(() => {
    if (!categoryStats.length) return 140;
    const longest = Math.max(...categoryStats.map((c) => measureTextWidth(c.category)));
    return Math.min(220, Math.max(110, Math.ceil(longest) + 16));
  }, [categoryStats]);

  const RankList = ({ title, items, field, color }) => (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <ol className="space-y-1.5">
        {items.map((m, i) => (
          <li key={m.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5" onClick={() => onHighlight(m.id)}>
            <span className="w-4 text-slate-400 font-mono">{i + 1}.</span>
            <span className="flex-1 truncate">{m.name}</span>
            <span className="font-mono font-semibold" style={{ color }}>{m[field]}</span>
          </li>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400 italic">No concepts yet.</p>}
      </ol>
    </div>
  );

  return (
    <div className="space-y-5">
      <InfoBox>
        <p><strong>Purpose:</strong> understand the structure of your FCM (which concepts drive the system, which absorb change, and which sit at the center of it all). Click any row or bar to highlight that concept (open the Network tab to see it selected).</p>
      </InfoBox>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <button onClick={() => setShowMethodology((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold w-full text-left">
          <HelpCircle size={15} className="text-teal-700" />
          How these metrics are computed
          {showMethodology ? <ChevronDown size={14} className="ml-auto text-slate-400" /> : <ChevronRight size={14} className="ml-auto text-slate-400" />}
        </button>
        {showMethodology && (
          <div className="mt-3 space-y-3 text-xs text-slate-600">
            <div className="space-y-2">
              <p><strong>Indegree, Outdegree, Centrality, Net Influence, and Role are purely structural</strong>: computed directly from the relationship weights you've drawn, with no simulation involved. Indegree is the sum of the absolute weights of a concept's incoming relationships; outdegree is the same for outgoing relationships; centrality is indegree + outdegree; net influence is outdegree minus indegree. Role is assigned from those numbers: <strong>Isolated</strong> has zero centrality (no relationships at all); <strong>Hub</strong> is in the top quartile of centrality among all concepts and has at least one relationship in each direction; <strong>Driver</strong> (not already a Hub) has outdegree more than 1.2&times; its indegree; <strong>Receiver</strong> (not already a Hub) has indegree more than 1.2&times; its outdegree; everything else is a <strong>Connector</strong>.</p>
              <p>Because these come straight from the weights, they update the instant you edit a relationship and never require running a simulation. That also means they say nothing about how the model actually <em>behaves</em> once causal effects propagate through it, which is what Influence and Sensitivity scores are for.</p>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p><strong>Influence and Sensitivity scores are perturbation-based</strong>: for each concept in turn, the model is set to all zeros, that one concept is locked at full activation (+1) for the whole run, and the simulation runs to equilibrium under the current squash function, &lambda;, update rule, and convergence settings (Scenarios &amp; Simulation's Advanced options). Every other concept always starts at exactly 0 here, regardless of what's set on the Model editor tab, so these scores measure the network's structure in isolation, not whatever initial values happen to be configured elsewhere.</p>
              <p><strong>Influence</strong> is the average absolute movement a concept <em>causes</em> in every other concept once its own driven run settles. <strong>Sensitivity</strong> is the average absolute movement a concept <em>undergoes</em>, across all of the other concepts' individual driven runs. A concept with high influence is one whose activation, if it changed, would ripple widely through the rest of the system; a concept with high sensitivity is one that tends to move regardless of which other concept is driving the change.</p>
              <p className="text-slate-400">Computing these takes one full simulation run per concept ({concepts.length} run{concepts.length === 1 ? "" : "s"} for the current model). These are the same numbers used to compute Category Metrics' "Mean influence"/"Mean sensitivity" below, and are recomputed automatically whenever a concept, relationship, or Advanced option changes.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <RankList title="Most influential" items={topInfluential} field="influence" color="#1d4ed8" />
        <RankList title="Most sensitive" items={topSensitive} field="sensitivity" color="#b45309" />
        <RankList title="Most connected" items={topConnected} field="centrality" color="#0f766e" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-3">Influence metrics: full table</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 font-medium pr-3">Concept</th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.indegree}>Indegree <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.outdegree}>Outdegree <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.netInfluence}>Net influence <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.centrality}>Centrality <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.influence}>Influence score <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.sensitivity}>Sensitivity score <HelpCircle size={10} className="inline text-slate-300" /></th>
                <th className="py-1.5 font-medium" title={METRIC_HELP.role}>Role <HelpCircle size={10} className="inline text-slate-300" /></th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => onHighlight(m.id)}>
                  <td className="py-1.5 pr-3">{m.name}</td>
                  <td className="py-1.5 pr-3 font-mono">{m.indegree}</td>
                  <td className="py-1.5 pr-3 font-mono">{m.outdegree}</td>
                  <td className={`py-1.5 pr-3 font-mono ${m.netInfluence > 0 ? "text-blue-700" : m.netInfluence < 0 ? "text-orange-700" : ""}`}>{m.netInfluence > 0 ? "+" : ""}{m.netInfluence}</td>
                  <td className="py-1.5 pr-3 font-mono">{m.centrality}</td>
                  <td className="py-1.5 pr-3 font-mono">{m.influence}</td>
                  <td className="py-1.5 pr-3 font-mono">{m.sensitivity}</td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${ROLE_STYLE[m.role] || "bg-slate-100 text-slate-600"}`}>{m.role}</span>
                  </td>
                </tr>
              ))}
              {metrics.length === 0 && <tr><td colSpan={8} className="py-3 text-slate-400 italic">Add concepts and relationships to see metrics here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto" data-chart="influence-scores">
          <h4 className="text-sm font-semibold mb-2">Influence score by concept</h4>
          <div style={{ minWidth: yAxisWidth + 180, height: Math.max(180, metrics.length * rowHeight) }}>
            <ResponsiveContainer>
              <BarChart data={[...metrics].sort((a, b) => b.influence - a.influence)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={yAxisWidth} tick={(p) => <WrappedTick {...p} width={yAxisWidth} />} />
                <RTooltip />
                <Bar dataKey="influence" radius={[0, 3, 3, 0]}>
                  {metrics.map((m) => <Cell key={m.id} fill="#1d4ed8" fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-x-auto">
          <h4 className="text-sm font-semibold mb-2">Sensitivity score by concept</h4>
          <div style={{ minWidth: yAxisWidth + 180, height: Math.max(180, metrics.length * rowHeight) }}>
            <ResponsiveContainer>
              <BarChart data={[...metrics].sort((a, b) => b.sensitivity - a.sensitivity)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={yAxisWidth} tick={(p) => <WrappedTick {...p} width={yAxisWidth} />} />
                <RTooltip />
                <Bar dataKey="sensitivity" radius={[0, 3, 3, 0]}>
                  {metrics.map((m) => <Cell key={m.id} fill="#b45309" fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-3">System overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">Network size</div>
            <div className="text-sm">{stats.concepts} concepts</div>
            <div className="text-sm">{stats.relationships} relationships</div>
          </div>
          <div title={SYSTEM_STAT_HELP.density}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Density <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.density}%</div>
            <div className="text-[11px] text-slate-400">{stats.actualConnections} of {stats.possibleConnections} possible</div>
          </div>
          <div title={SYSTEM_STAT_HELP.avgDegree}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Connectivity <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">avg {stats.avgDegree}</div>
            <div className="text-[11px] text-slate-400">max {stats.maxDegree}, min {stats.minDegree}</div>
          </div>
          <div title={SYSTEM_STAT_HELP.loops}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Feedback structure <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.loops.total} loop{stats.loops.total === 1 ? "" : "s"}</div>
            <div className="text-[11px] text-slate-400">{stats.loops.reinforcing} reinforcing, {stats.loops.balancing} balancing{stats.loops.capped ? " (showing first 300 found)" : ""}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div title={SYSTEM_STAT_HELP.complexity}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Complexity score <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{Number.isFinite(stats.complexity) ? stats.complexity : "N/A"}</div>
          </div>
          <div title={SYSTEM_STAT_HELP.connectivity}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Connectivity score <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.connectivity}</div>
          </div>
          <div title={SYSTEM_STAT_HELP.centralization}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Centralization score <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.centralization}%</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-1">Network metrics by category</h3>
        <p className="text-xs text-slate-400 mb-3">Compares how influence patterns differ between the categories defined on the Model editor tab. Uses whatever categories are actually present on this model; nothing is hard-coded.</p>

        {!hasCategories ? (
          <p className="text-xs text-slate-400 italic">No categories are set yet. Add a category to a concept on the Model editor tab (e.g. "terrestrial", "marine", "governance") to enable this section.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 font-medium pr-3">Category</th>
                    <th className="py-1.5 font-medium pr-3">Concepts</th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships where both endpoints are in this category.">Internal <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships coming into this category from a concept in a different category.">Incoming <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships going out of this category to a concept in a different category.">Outgoing <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.indegree}>Mean indegree <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.outdegree}>Mean outdegree <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.centrality}>Mean centrality <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium pr-3" title={METRIC_HELP.influence}>Mean influence <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1.5 font-medium" title={METRIC_HELP.sensitivity}>Mean sensitivity <HelpCircle size={10} className="inline text-slate-300" /></th>
                  </tr>
                </thead>
                <tbody>
                  {categoryStats.map((c) => (
                    <tr key={c.category} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: categoryColor.get(c.category) }} />
                        <span className={c.isUncategorized ? "italic text-slate-400" : ""}>{c.category}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono">{c.concepts}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.internal}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.incoming}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.outgoing}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.meanIndegree}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.meanOutdegree}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.meanCentrality}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.meanInfluence}</td>
                      <td className="py-1.5 font-mono">{c.meanSensitivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              {[
                { key: "meanInfluence", title: "Mean influence score by category", color: "#1d4ed8" },
                { key: "meanSensitivity", title: "Mean sensitivity score by category", color: "#b45309" },
                { key: "meanCentrality", title: "Mean centrality by category", color: "#0f766e" },
                { key: "density", title: "Connection density by category (%)", color: "#7c3aed" },
              ].map(({ key, title, color }) => (
                <div key={key} className="border border-slate-100 rounded-lg p-3 overflow-x-auto">
                  <h4 className="text-xs font-semibold mb-2">{title}</h4>
                  <div style={{ minWidth: categoryYAxisWidth + 160, height: Math.max(120, categoryStats.length * rowHeight) }}>
                    <ResponsiveContainer>
                      <BarChart data={[...categoryStats].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity))} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="category" width={categoryYAxisWidth} tick={(p) => <WrappedTick {...p} width={categoryYAxisWidth} />} />
                        <RTooltip formatter={(v) => (v === null ? "n/a (fewer than 2 concepts)" : v)} />
                        <Bar dataKey={key} radius={[0, 3, 3, 0]}>
                          {categoryStats.map((c) => <Cell key={c.category} fill={categoryColor.get(c.category)} fillOpacity={0.8} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>

            <details className="mt-4 pt-4 border-t border-slate-100">
              <summary className="text-sm font-semibold cursor-pointer">Category interaction matrix (optional)</summary>
              <p className="text-[11px] text-slate-400 mt-2 mb-2">Rows are the source category, columns the target. Darker cells have more connections; hover a cell for the exact count and total weight. The diagonal (A→A) is the same figure as "Internal" above.</p>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="p-1.5 text-left text-slate-400 font-medium">From \ To</th>
                      {categoryStats.map((c) => (
                        <th key={c.category} className="p-1.5 text-left text-slate-400 font-medium whitespace-nowrap">{c.category}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryStats.map((rowCat) => {
                      const maxCount = Math.max(1, ...categoryStats.map((c) => categoryMatrix[rowCat.category]?.[c.category]?.count ?? 0));
                      return (
                        <tr key={rowCat.category}>
                          <td className="p-1.5 font-medium whitespace-nowrap">{rowCat.category}</td>
                          {categoryStats.map((colCat) => {
                            const cell = categoryMatrix[rowCat.category]?.[colCat.category] ?? { count: 0, totalWeight: 0 };
                            const alpha = cell.count > 0 ? 0.15 + 0.65 * (cell.count / maxCount) : 0;
                            return (
                              <td
                                key={colCat.category}
                                className="p-1.5 text-center font-mono whitespace-nowrap border border-slate-100"
                                style={{ background: cell.count > 0 ? `${categoryColor.get(rowCat.category)}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : "transparent" }}
                                title={`${rowCat.category} → ${colCat.category}: ${cell.count} connection${cell.count === 1 ? "" : "s"}, total weight ${cell.totalWeight >= 0 ? "+" : ""}${round2(cell.totalWeight)}`}
                              >
                                {cell.count > 0 ? `${cell.count} / ${cell.totalWeight >= 0 ? "+" : ""}${round2(cell.totalWeight)}` : "0"}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sensitivity Analysis tab
// ============================================================================
function SensitivityAnalysisTab({ concepts, edges, scenarios, activeScenarioId, settings, result, setResult, setChartCache, modelVersion }) {
  useCachedChart(setChartCache, "sensitivityScores", '[data-chart="sensitivity-scores"]', "svg", [result]);
  const [sensInput, setSensInput] = useState(null);
  const [sensOutputs, setSensOutputs] = useState([]);
  const [sensMin, setSensMin] = useState(-1);
  const [sensMax, setSensMax] = useState(1);
  const [sensSteps, setSensSteps] = useState(20);
  const [sensCompareIds, setSensCompareIds] = useState([]);

  // Excludes the current input concept, the same way Transition Point
  // Analysis's availableOutcomeConcepts excludes its intervention concept:
  // selecting a concept as its own output measures how much it drifts from
  // the value it's locked at (now that sweeps lock the input; see the
  // curve/tornado sweeps below), which isn't a meaningful "does the input
  // affect this output" question the way every other pairing is.
  const availableOutputConcepts = useMemo(() => concepts.filter((c) => c.id !== sensInput), [concepts, sensInput]);
  const toggleOutput = (id) => setSensOutputs((os) => (os.includes(id) ? os.filter((o) => o !== id) : [...os, id]));
  const toggleCompareScenario = (id) => setSensCompareIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const runAnalysis = () => {
    if (!sensInput || sensOutputs.length === 0 || sensMin >= sensMax) return;
    const n = Math.max(2, sensSteps);
    const steps = Array.from({ length: n + 1 }, (_, i) => round2(sensMin + ((sensMax - sensMin) * i) / n));
    const scenarioIds = sensCompareIds.length ? sensCompareIds : [activeScenarioId];
    const multi = scenarioIds.length > 1;

    const curveData = steps.map((v) => {
      const row = { input: v };
      scenarioIds.forEach((scId) => {
        const base = scenarios.find((s) => s.id === scId);
        // Lock the swept concept at v for the whole run, the same "driver"
        // semantics setDriver uses for the Scenarios & Simulation ▲/▼
        // controls and runTransitionSweep uses for Transition Point
        // Analysis. Previously this only set v as a starting value and left
        // the concept unlocked, so it could drift away from v as the model's
        // own feedback loops evolved it, meaning "sensitivity to holding
        // this concept at v" and "sensitivity to merely starting there"
        // were silently conflated, and a concept with strong incoming
        // influence could end up nowhere near the value the chart's x-axis
        // claimed it was swept to.
        const locks = { ...(base?.lockedConcepts || {}), [sensInput]: v };
        const sc = { ...base, initialOverrides: { ...base?.initialOverrides, [sensInput]: v }, lockedConcepts: locks };
        const r = simulate(concepts, edges, sc, settings);
        sensOutputs.forEach((outId) => {
          row[multi ? `${outId}__${scId}` : outId] = round2(r.final[outId]);
        });
      });
      return row;
    });

    const primaryScenarioId = scenarioIds[0];
    const elasticity = sensOutputs.map((outId) => {
      const key = multi ? `${outId}__${primaryScenarioId}` : outId;
      const vals = curveData.map((r) => r[key]);
      const first = curveData[0][key], last = curveData[curveData.length - 1][key];
      const inputRange = sensMax - sensMin || 1;
      return {
        id: outId, name: concepts.find((c) => c.id === outId)?.name,
        min: round2(Math.min(...vals)), max: round2(Math.max(...vals)),
        elasticity: round2((last - first) / inputRange),
      };
    });

    const primaryOutput = sensOutputs[0];
    const baseSc = scenarios.find((s) => s.id === primaryScenarioId);
    const tornado = concepts.filter((c) => c.id !== primaryOutput).map((c) => {
      // Same fix as the curve sweep above: lock each swept concept at the
      // low/high end instead of only seeding its initial value.
      const baseLocks = { ...(baseSc?.lockedConcepts || {}) };
      const scLo = { ...baseSc, initialOverrides: { ...baseSc?.initialOverrides, [c.id]: sensMin }, lockedConcepts: { ...baseLocks, [c.id]: sensMin } };
      const scHi = { ...baseSc, initialOverrides: { ...baseSc?.initialOverrides, [c.id]: sensMax }, lockedConcepts: { ...baseLocks, [c.id]: sensMax } };
      const lo = simulate(concepts, edges, scLo, settings).final[primaryOutput] ?? 0;
      const hi = simulate(concepts, edges, scHi, settings).final[primaryOutput] ?? 0;
      return { name: c.name, low: round2(lo), high: round2(hi), impact: round2(hi - lo) };
    }).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 12);

    setResult({ curveData, elasticity, tornado, scenarioIds, multi, primaryOutput, __modelVersion: modelVersion });
  };
  const isStale = !!result && result.__modelVersion !== modelVersion;

  const lineColors = ["#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#be123c", "#4d7c0f"];
  const lineKeys = useMemo(() => {
    if (!result) return [];
    if (!result.multi) return sensOutputs.map((id) => ({ key: id, label: concepts.find((c) => c.id === id)?.name }));
    const keys = [];
    sensOutputs.forEach((id) => result.scenarioIds.forEach((scId) => keys.push({
      key: `${id}__${scId}`,
      label: `${concepts.find((c) => c.id === id)?.name} (${scenarios.find((s) => s.id === scId)?.name})`,
    })));
    return keys;
  }, [result, sensOutputs, concepts, scenarios]);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5"><SlidersHorizontal size={15} className="text-teal-700" />What is sensitivity analysis?</h3>
        <div className="text-xs text-slate-500 space-y-3">
          <div className="space-y-2">
            <p>Sensitivity analysis evaluates how changes in one concept (the input) affect one or more other concepts (the outputs) elsewhere in the system. It works by holding an input concept at a series of fixed values across a range, from a minimum to a maximum, re-running the simulation at each value, and recording where each output settles. It helps identify <strong>critical leverage points</strong>, <strong>robust variables</strong>, <strong>vulnerable variables</strong>, and <strong>high-impact interventions</strong>.</p>
            <p>A highly <strong>sensitive</strong> concept changes significantly when system inputs are modified. A highly <strong>influential</strong> concept produces large changes in other concepts. Use sensitivity analysis to identify potential policy levers and areas of uncertainty, and to see which relationships in the model matter most to the outcomes you care about.</p>
            <p>The results are shown three ways: the <strong>sensitivity curves</strong> plot each output's value across the swept range; the <strong>tornado chart</strong> ranks every other concept by how much it moves the primary output when swept across the same range one at a time; and the <strong>elasticity metrics</strong> summarize, as a single number per output, how much it moved from the low end of the range to the high end.</p>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <p className="font-medium text-slate-700 mb-1.5">Steps</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Choose the input concept to sweep (Step 1).</li>
              <li>Choose one or more output concepts to observe as the input changes (Step 2).</li>
              <li>Set the range the input sweeps across, from Range min to Range max (Step 3).</li>
              <li>Choose how many increments to sample across that range (Step 4).</li>
              <li>Optionally, tick one or more scenarios under "Compare across scenarios" to run the sweep against those instead of just the active scenario.</li>
              <li>Click Run analysis (Step 5) to generate the sensitivity curves, tornado chart, and elasticity table.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-3">Run an analysis</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 1: Input concept</label>
            <select
              value={sensInput || ""}
              onChange={(e) => { setSensInput(e.target.value); setSensOutputs((os) => os.filter((o) => o !== e.target.value)); }}
              className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5"
            >
              <option value="" disabled>Select…</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500 font-medium">Step 2: Output concept(s)</label>
            <div className="mt-1 flex flex-wrap gap-1 max-h-[70px] overflow-auto border border-slate-200 rounded p-1.5">
              {availableOutputConcepts.map((c) => (
                <button
                  key={c.id} onClick={() => toggleOutput(c.id)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${sensOutputs.includes(c.id) ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 4: Increments</label>
            <select value={sensSteps} onChange={(e) => setSensSteps(parseInt(e.target.value))} className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-3">
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 3: Range min</label>
            <input type="number" step={0.1} min={-1} max={1} value={sensMin} onChange={(e) => setSensMin(clamp(parseFloat(e.target.value) || 0))} className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5" />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Range max</label>
            <input type="number" step={0.1} min={-1} max={1} value={sensMax} onChange={(e) => setSensMax(clamp(parseFloat(e.target.value) || 0))} className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slate-500 font-medium">Compare across scenarios (optional)</label>
            <div className="mt-1 flex flex-wrap gap-1 max-h-[38px] overflow-auto">
              {scenarios.map((s) => (
                <button
                  key={s.id} onClick={() => toggleCompareScenario(s.id)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border ${sensCompareIds.includes(s.id) ? "border-purple-600 bg-purple-50 text-purple-800" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Btn variant="accent" onClick={runAnalysis} disabled={!sensInput || sensOutputs.length === 0 || sensMin >= sensMax}><Play size={14} />Step 5: Run analysis</Btn>
          {sensMin >= sensMax && <span className="text-xs text-rose-600 ml-2">Range min must be less than max.</span>}
        </div>
      </div>

      {result && (
        <>
          {isStale && <StaleResultBanner label="this sensitivity analysis" />}

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold mb-2">Sensitivity curves</h4>
            <div className="w-full h-72">
              <ResponsiveContainer>
                <LineChart data={result.curveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="input" tick={{ fontSize: 10 }} label={{ value: concepts.find((c) => c.id === sensInput)?.name, position: "insideBottom", offset: -5, fontSize: 11 }} />
                  <YAxis domain={[(dMin) => Math.min(-0.1, dMin - 0.05), (dMax) => Math.max(0.1, dMax + 0.05)]} tick={{ fontSize: 10 }} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  <ReferenceLine x={0} stroke="#cbd5e1" />
                  {lineKeys.map((lk, i) => (
                    <Line key={lk.key} type="monotone" dataKey={lk.key} name={lk.label} stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4" data-chart="sensitivity-scores">
              <h4 className="text-sm font-semibold mb-1">Tornado chart: impact on {concepts.find((c) => c.id === result.primaryOutput)?.name}</h4>
              <p className="text-[11px] text-slate-400 mb-2">Every other concept swept from {sensMin} to {sensMax} one at a time; ranked by how much it moves the primary output.</p>
              <div className="w-full" style={{ height: Math.max(200, result.tornado.length * 24) }}>
                <ResponsiveContainer>
                  <BarChart data={result.tornado} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                    <RTooltip />
                    <ReferenceLine x={0} stroke="#94a3b8" />
                    <Bar dataKey="impact" radius={[0, 3, 3, 0]}>
                      {result.tornado.map((d, i) => <Cell key={i} fill={d.impact >= 0 ? "#16a34a" : "#dc2626"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold mb-2">Elasticity metrics</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1 font-medium" title="Average slope of the output across the full swept input range: (output at max input − output at min input) / (max input − min input).">Output <HelpCircle size={10} className="inline text-slate-300" /></th>
                    <th className="py-1 font-medium">Min</th>
                    <th className="py-1 font-medium">Max</th>
                    <th className="py-1 font-medium">Elasticity</th>
                  </tr>
                </thead>
                <tbody>
                  {result.elasticity.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="py-1">{e.name}</td>
                      <td className="py-1 font-mono">{e.min}</td>
                      <td className="py-1 font-mono">{e.max}</td>
                      <td className="py-1 font-mono font-semibold">{e.elasticity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="text-sm font-semibold mt-4 mb-2">Impact ranking</h4>
              <ol className="text-xs space-y-1 max-h-40 overflow-auto">
                {result.tornado.map((t, i) => (
                  <li key={i} className="flex justify-between"><span>{i + 1}. {t.name}</span><span className="font-mono">{t.impact >= 0 ? "+" : ""}{t.impact}</span></li>
                ))}
              </ol>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold mb-2">Response table</h4>
            <div className="overflow-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1 font-medium pr-3">{concepts.find((c) => c.id === sensInput)?.name}</th>
                    {lineKeys.map((lk) => <th key={lk.key} className="py-1 font-medium pr-3">{lk.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.curveData.map((row, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="py-1 pr-3 font-mono">{row.input}</td>
                      {lineKeys.map((lk) => <td key={lk.key} className="py-1 pr-3 font-mono">{row[lk.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Baseline Equilibrium tab
// ============================================================================

// Classifies how a baseline run ended, beyond the plain converged/not-converged
// flag simulate() already returns. If it didn't converge, checks the tail of
// the trajectory for a short repeating cycle (period 1-4) before calling it
// non-convergent.
function classifyStability(series, converged, threshold, iterationsRun) {
  if (converged) {
    return { status: "Stable Equilibrium", detail: "The system converged to a fixed point: every concept's activation stopped changing (within the convergence threshold)." };
  }
  const ids = series.length ? Object.keys(series[series.length - 1].values) : [];
  for (let period = 1; period <= 4; period++) {
    const a = series[series.length - 1];
    const b = series[series.length - 1 - period];
    if (!b) continue;
    const maxDiff = Math.max(0, ...ids.map((id) => Math.abs((a.values[id] ?? 0) - (b.values[id] ?? 0))));
    if (maxDiff < threshold) {
      return { status: "Oscillation", detail: `The system settled into a repeating cycle instead of a fixed point (period ${period} iteration${period === 1 ? "" : "s"}).` };
    }
  }
  return { status: "Non-Convergence", detail: `The system did not settle into a fixed point or a short repeating cycle within ${iterationsRun} iterations (it may be diverging, or cycling with a longer period than checked).` };
}

function BaselineEquilibriumTab({ concepts, edges, scenarios, settings, setTab, result, setResult, setChartCache, modelVersion }) {
  useCachedChart(setChartCache, "baselineConvergence", '[data-chart="baseline-convergence"]', "svg", [result]);
  // Local override, not the shared app-wide settings: lets this tab compare
  // tanh vs. sigmoid without silently changing what Scenarios & Simulation,
  // Sensitivity Analysis, or Transition Point Analysis use. Defaults to
  // whatever the shared setting currently is, so nothing changes until the
  // user actually picks something here. (Trivalent isn't offered here on
  // purpose: it's a step function, not a smooth squash, so "tanh vs sigmoid"
  // is the comparison that's actually meaningful for equilibrium shape.)
  const [squashOverride, setSquashOverride] = useState(null);
  const effectiveSquash = squashOverride ?? settings.squashFunction ?? "tanh";
  const runSettings = useMemo(() => ({ ...settings, squashFunction: effectiveSquash }), [settings, effectiveSquash]);

  // Always a fresh, isolated scenario, never the shared/mutable "baseline"
  // row from `scenarios`: Scenarios & Simulation's driver/lock controls
  // operate on whichever scenario is active, which defaults to "baseline",
  // so a user experimenting with drivers there (a prominent, first-thing-
  // to-try control) before creating a dedicated scenario ends up editing
  // this same row. This tab's own copy above already promises "see how the
  // model behaves on its own, with no scenario applied"; this makes that
  // literally true instead of silently inheriting whatever's been set
  // elsewhere. Reproduced live: setting a driver on the shared baseline
  // scenario left the "Initial state vector: A(0)" table showing all zeros
  // (it reads c.initialValue, untouched) while the run silently took 10
  // iterations instead of 1, with nothing in the UI explaining the gap.
  const cleanBaselineScenario = useMemo(() => ({ id: "baseline", type: "baseline", initialOverrides: {}, lockedConcepts: {}, weightOverrides: {} }), []);

  // The shared row, purely to detect and surface (not apply) any overrides
  // configured on it elsewhere, so nothing is silently dropped without
  // explanation.
  const sharedBaselineScenario = scenarios.find((s) => s.id === "baseline");
  const sharedHasOverrides = !!sharedBaselineScenario && (
    Object.keys(sharedBaselineScenario.initialOverrides || {}).length > 0 ||
    Object.keys(sharedBaselineScenario.lockedConcepts || {}).length > 0 ||
    Object.keys(sharedBaselineScenario.weightOverrides || {}).length > 0
  );

  const run = () => setResult({ ...simulate(concepts, edges, cleanBaselineScenario, runSettings), __modelVersion: modelVersion });
  const isStale = !!result && result.__modelVersion !== modelVersion;

  const stability = useMemo(() => {
    if (!result) return null;
    return classifyStability(result.series, result.converged, settings.convergenceThreshold ?? 0.001, result.iterationsRun);
  }, [result, settings.convergenceThreshold]);

  const finalMaxDelta = useMemo(() => {
    if (!result || result.series.length < 2) return 0;
    const a = result.series[result.series.length - 1].values;
    const b = result.series[result.series.length - 2].values;
    return round2(Math.max(0, ...concepts.map((c) => Math.abs((a[c.id] ?? 0) - (b[c.id] ?? 0)))));
  }, [result, concepts]);

  // Sanity checks on the result: catches exactly the failure modes this was
  // built to detect (equilibrium silently collapsing to zero when it
  // shouldn't, or a model that was already sitting at its own equilibrium).
  const validation = useMemo(() => {
    if (!result || !concepts.length) return [];
    const messages = [];
    const allInitialZero = concepts.every((c) => Math.abs(c.initialValue) < 1e-9);
    const allFinalZero = concepts.every((c) => Math.abs(result.final[c.id] ?? 0) < 1e-9);
    const equalsInitial = concepts.every((c) => Math.abs((result.final[c.id] ?? 0) - c.initialValue) < 1e-6);
    if (equalsInitial) {
      messages.push({ kind: "info", text: "The model appears already to be at equilibrium: the final state matches the initial state." });
    }
    if (allFinalZero && !allInitialZero) {
      messages.push({ kind: "warning", text: "This run started away from zero but settled back to exactly zero. That's mathematically possible: strong enough damping in the causal structure (weak, offsetting, or predominantly negative relationships) can pull every concept back to rest. If you expected a non-trivial equilibrium instead, double-check the relationship weights and signs on the Model editor / Network tab." });
    }
    return messages;
  }, [result, concepts]);

  // "Equilibrium Diagnostics" panel fields. This app has no randomized-
  // initialization feature, so "Initial State Type" only ever reads as one
  // of two states that actually exist here.
  const allInitialZero = concepts.length > 0 && concepts.every((c) => Math.abs(c.initialValue) < 1e-9);
  const initialStateType = allInitialZero ? "All zeros" : "User-defined";
  // In this engine "fixed point detected" and "converged" are the same
  // condition: a run that converges *is* a detected fixed point, shown
  // as its own labeled field because that's what was asked for, not
  // because it's a materially different check.
  const fixedPointDetected = result?.converged ?? false;

  const equilibriumExplanation = useMemo(() => {
    if (!result) return "";
    if (allInitialZero && result.converged && result.iterationsRun === 1) {
      return `Every concept started at 0 with no forcing term, so 0 is a fixed point of the update rule (${effectiveSquash}(0) = 0, true for every squash function this app offers) and the system is already at equilibrium. No iteration needed.`;
    }
    if (allInitialZero) {
      // Mathematically this shouldn't be reachable with a clean scenario (0
      // is always a fixed point with no forcing term, for every squash
      // function this app supports). Kept as a defensive explanation rather
      // than silently showing numbers with no narrative if it ever is.
      return "Every concept started at 0, but the system still moved. With no locked or forced concepts this can only come from the model's own structure (e.g. numerical effects in a large feedback loop); check the weight matrix in Advanced Diagnostics below.";
    }
    const nonZero = concepts.filter((c) => Math.abs(c.initialValue) >= 1e-9);
    const names = nonZero.slice(0, 4).map((c) => c.name).join(", ") + (nonZero.length > 4 ? `, +${nonZero.length - 4} more` : "");
    return result.converged
      ? `${nonZero.length} concept${nonZero.length === 1 ? "" : "s"} started away from zero (${names}), so the system evolves from there and settles after ${result.iterationsRun} iteration${result.iterationsRun === 1 ? "" : "s"}.`
      : `${nonZero.length} concept${nonZero.length === 1 ? "" : "s"} started away from zero (${names}), and the system did not settle within the ${settings.maxIterations ?? 100}-iteration cap; see Stability below for whether it's oscillating or diverging.`;
  }, [result, concepts, allInitialZero, settings.maxIterations, effectiveSquash]);

  const exportConvergenceCSV = () => {
    if (!result) return;
    const header = ["Iteration", ...concepts.map((c) => c.name)];
    const rows = result.series.map((pt) => [pt.iteration, ...concepts.map((c) => round2(pt.values[c.id] ?? 0))]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "baseline-convergence.csv";
    a.click();
  };

  const lineColors = ["#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#be123c", "#4d7c0f", "#a16207", "#0e7490"];
  const stabilityColor = stability?.status === "Stable Equilibrium" ? "text-teal-700" : stability?.status === "Oscillation" ? "text-amber-700" : "text-rose-700";

  return (
    <div className="space-y-5">
      <InfoBox>
        <p><strong>Purpose:</strong> see how the model behaves on its own, with no scenario applied, before testing interventions. This is the reference every scenario on the Scenarios & Simulation tab gets compared against.</p>
        <p>The run starts from A(0), the initial activation vector defined on the Model editor / Network tab (0 for any concept you haven't set), and follows the model's current update rule, A(t+1) = {effectiveSquash === "sigmoid" ? "sigmoid" : "tanh"}(A(t) + W x A(t)) applied element-wise. It stops once the largest change across all concepts drops below the convergence threshold or the iteration cap is reached (currently {settings.maxIterations} iterations, threshold {settings.convergenceThreshold}, both editable in Scenarios & Simulation to Advanced options).</p>
        <p>This tab always runs with no forcing terms, regardless of anything set up on the Scenarios &amp; Simulation tab: it's a fixed, isolated reference run, not affected by (and not affecting) any scenario.</p>
      </InfoBox>

      {sharedHasOverrides && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Scenarios &amp; Simulation has driver/lock overrides configured on "Baseline"; this tab always runs with no forcing terms, so those aren't applied here. To test them, use Scenarios &amp; Simulation instead.
        </div>
      )}

      {allInitialZero && !sharedHasOverrides && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <strong>Every concept is currently at 0.</strong> That's a valid, deliberate setup for checking the model's structure in isolation, and it has one unavoidable mathematical consequence worth knowing before you run it: with tanh(0) = sigmoid(0) = 0 and no concept locked or forced, activation cannot appear from nothing, so the run below will converge back to exactly 0 in a single step, for either squash function. That's not a bug; it's the same reason a system sitting still at rest doesn't spontaneously start moving. To see the causal structure actually produce something, either give one or more concepts a real starting value on the <button onClick={() => setTab("editor")} className="underline font-medium">Model editor tab</button> reflecting an observed/elicited current condition, or hold a concept active for a full run via a driver on the <button onClick={() => setTab("scenarios")} className="underline font-medium">Scenarios &amp; Simulation tab</button>.
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h4 className="text-sm font-semibold mb-2">Initial state vector: A(0)</h4>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-1 font-medium">Concept</th>
              <th className="py-1 font-medium">Initial activation</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="py-1">{c.name}</td>
                <td className="py-1 font-mono">{round2(c.initialValue)}</td>
              </tr>
            ))}
            {concepts.length === 0 && <tr><td colSpan={2} className="py-2 text-slate-400 italic">No concepts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold text-sm">Run baseline equilibrium</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-300 rounded-md overflow-hidden text-xs" title="Overrides the shared squash function for this tab only; Scenarios & Simulation, Sensitivity Analysis, and Transition Point Analysis keep using whatever's set in Scenarios & Simulation's Advanced options.">
            <button onClick={() => setSquashOverride("tanh")} className={`px-2.5 py-1.5 ${effectiveSquash === "tanh" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Hyperbolic tangent</button>
            <button onClick={() => setSquashOverride("sigmoid")} className={`px-2.5 py-1.5 border-l border-slate-300 ${effectiveSquash === "sigmoid" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Sigmoid</button>
          </div>
          <Btn variant="accent" onClick={run}><Play size={14} />Run</Btn>
        </div>
      </div>

      {!result ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400 italic">
          Click "Run" above to compute the baseline equilibrium.
        </div>
      ) : (
        <>
          {isStale && <StaleResultBanner label="the baseline equilibrium" />}

          {validation.map((m, i) => (
            <div
              key={i}
              className={`rounded-md border p-3 text-xs ${m.kind === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-teal-50 border-teal-200 text-teal-800"}`}
            >
              {m.text}
            </div>
          ))}

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold mb-3">Equilibrium diagnostics</h4>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-400 mb-1">Initial state type</div>
                <div className="text-sm font-mono">{initialStateType}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Converged</div>
                <div className={`text-sm font-mono ${result.converged ? "text-teal-700" : "text-amber-700"}`}>{result.converged ? "Yes" : "No"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Iterations to convergence</div>
                <div className="text-sm font-mono">{result.converged ? result.iterationsRun : `capped at ${result.iterationsRun}`}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Maximum residual change</div>
                <div className="text-sm font-mono">{finalMaxDelta}</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
              <div title="A converged run is, by this engine's definition, a detected fixed point; the two are the same condition here.">
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Fixed point detected <HelpCircle size={10} className="text-slate-300" /></div>
                <div className={`text-sm font-mono ${fixedPointDetected ? "text-teal-700" : "text-amber-700"}`}>{fixedPointDetected ? "Yes" : "No"}</div>
              </div>
              <div className="col-span-3">
                <div className="text-xs text-slate-400 mb-1">Stability</div>
                <div className={`text-sm font-semibold ${stabilityColor}`}>{stability.status}</div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">{stability.detail}</p>
            <p className="text-xs text-slate-600 mt-2 bg-slate-50 border border-slate-100 rounded p-2">{equilibriumExplanation}</p>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4" data-chart="baseline-convergence">
            <h4 className="text-sm font-semibold mb-2">Convergence plot</h4>
            <p className="text-xs text-slate-400 mb-2">Every concept's activation at each iteration, from its initial value through to convergence (or the iteration cap). Use this to check whether the model settles into a stable equilibrium, oscillates, or diverges.</p>
            <div className="w-full h-72">
              <ResponsiveContainer>
                <LineChart data={result.series.map((pt) => ({ iteration: pt.iteration, ...pt.values }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="iteration" tick={{ fontSize: 10 }} label={{ value: "Iteration", position: "insideBottom", offset: -5, fontSize: 11 }} />
                  <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} label={{ value: "Activation", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  {concepts.map((c, i) => (
                    <Line key={c.id} type="monotone" dataKey={c.id} name={c.name} stroke={lineColors[i % lineColors.length]} strokeWidth={1.75} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold mb-2">Final steady state</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1 font-medium">Concept</th>
                    <th className="py-1 font-medium">Steady state</th>
                  </tr>
                </thead>
                <tbody>
                  {concepts.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="py-1">{c.name}</td>
                      <td className="py-1 font-mono">{round2(result.final[c.id] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Convergence table</h4>
                <Btn variant="outline" onClick={exportConvergenceCSV}><Download size={13} />Export CSV</Btn>
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-1 pr-2 font-medium">Iteration</th>
                      {concepts.map((c) => <th key={c.id} className="py-1 pr-2 font-medium">{c.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.series.map((pt) => (
                      <tr key={pt.iteration} className="border-b border-slate-50">
                        <td className="py-1 pr-2 font-mono">{pt.iteration}</td>
                        {concepts.map((c) => <td key={c.id} className="py-1 pr-2 font-mono">{round2(pt.values[c.id] ?? 0)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <details>
              <summary className="text-sm font-semibold cursor-pointer flex items-center gap-1.5"><FlaskConical size={14} className="text-teal-700" />Advanced Diagnostics</summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-slate-500">Raw mathematical objects behind this run, for verifying the engine matches FCM theory directly: the initial vector A(0), the weight matrix W (row = target, column = source, so W[row][col] is the weight of the relationship column to row), the first few iteration vectors, the final equilibrium A*, and the convergence delta.</p>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">A(0) (initial activation vector)</div>
                  <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-nowrap">
                    [{concepts.map((c) => round2(c.initialValue)).join(", ")}]
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">W (weight matrix)</div>
                  <div className="overflow-auto max-h-64 border border-slate-200 rounded">
                    <table className="text-[11px] font-mono">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-2 py-1 border-b border-r border-slate-200 text-slate-400">to \ from</th>
                          {concepts.map((c) => <th key={c.id} className="px-2 py-1 border-b border-slate-200 text-slate-400 font-medium">{c.id}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {concepts.map((rowC) => (
                          <tr key={rowC.id}>
                            <td className="px-2 py-1 border-r border-b border-slate-100 text-slate-400 font-medium bg-slate-50">{rowC.id}</td>
                            {concepts.map((colC) => {
                              const e = edges.find((e) => e.source === colC.id && e.target === rowC.id);
                              return <td key={colC.id} className="px-2 py-1 border-b border-slate-50 text-right">{e ? round2(e.weight) : 0}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">First iteration vectors</div>
                  <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 space-y-1 overflow-x-auto">
                    {result.series.slice(0, 6).map((pt) => (
                      <div key={pt.iteration} className="whitespace-nowrap">
                        A({pt.iteration}) = [{concepts.map((c) => round2(pt.values[c.id] ?? 0)).join(", ")}]
                      </div>
                    ))}
                    {result.series.length > 6 && <div className="text-slate-400">... {result.series.length - 6} more (see Convergence table above)</div>}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">A* (final equilibrium)</div>
                  <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto whitespace-nowrap">
                    [{concepts.map((c) => round2(result.final[c.id] ?? 0)).join(", ")}]
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-1">Convergence delta: max(|A(t+1) - A(t)|)</div>
                  <div className="text-xs font-mono bg-slate-50 border border-slate-200 rounded p-2">{finalMaxDelta}</div>
                </div>
              </div>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Transition Point Analysis
// ============================================================================
// Sensitivity Analysis asks "what happens if I change X?"; this asks "at
// what intervention intensity does the marginal return become greatest?";
// a different analytical question, so it gets its own module rather than
// living inside Sensitivity Analysis.

// Sweeps one "intervention" concept from 0 to 1 in equal steps, locking it
// (clamped for the whole run, the same convention setDriver already uses
// for scenario "drivers") at the direction-mapped value. This measures a
// sustained intervention intensity, not a one-off nudge that could drift
// after t=0. One simulate() call per intensity step (not per outcome, and
// not a simplified approximation): every selected outcome's equilibrium
// value is read off that single result, exactly like the existing
// SensitivityAnalysisTab sweep already does; always the same equilibrium
// engine as Baseline Equilibrium and Scenario Simulation.
function runTransitionSweep(concepts, edges, baseScenario, settings, interventionId, direction, outcomeIds, resolution) {
  const n = Math.max(2, resolution);
  const steps = Array.from({ length: n + 1 }, (_, i) => i / n);
  const locks = { ...(baseScenario?.lockedConcepts || {}) };
  const overrides = { ...(baseScenario?.initialOverrides || {}) };
  const perOutcome = {};
  outcomeIds.forEach((id) => (perOutcome[id] = { y: [] }));

  steps.forEach((x) => {
    const driverValue = direction === "decrease" ? 1 - x : x;
    const sc = {
      ...baseScenario,
      initialOverrides: { ...overrides, [interventionId]: driverValue },
      lockedConcepts: { ...locks, [interventionId]: driverValue },
    };
    const r = simulate(concepts, edges, sc, settings);
    outcomeIds.forEach((id) => perOutcome[id].y.push(r.final[id] ?? 0));
  });

  const dx = 1 / n;
  outcomeIds.forEach((id) => {
    const y = perOutcome[id].y;
    const slope = [];
    for (let i = 0; i < y.length - 1; i++) slope.push((y[i + 1] - y[i]) / dx);
    // Steepest point of change by MAGNITUDE, not signed value: this app has
    // no per-concept "higher is better" flag, so a signed max would treat
    // an outcome that's improving as its "transition point" but, for one
    // that's monotonically getting WORSE across the sweep (a very normal
    // case: sweeping a stressor concept down towards 0 and watching
    // something it drives fall too), would report wherever it worsens
    // LEAST as the transition point, the opposite of a meaningful
    // leverage point. Magnitude-based picks the step where the outcome is
    // moving fastest in whichever direction it's actually moving,
    // regardless of whether that's an improvement or not; the sign of
    // slope[tpIndex] still tells you which direction it is.
    let tpIndex = 0;
    for (let i = 1; i < slope.length; i++) if (Math.abs(slope[i]) > Math.abs(slope[tpIndex])) tpIndex = i;
    perOutcome[id] = {
      y, slope, tpIndex, tp: steps[tpIndex],
      effect: y[y.length - 1] - y[0],
      range: Math.max(...y) - Math.min(...y),
    };
  });

  return { steps, perOutcome };
}

// "Flat" is checked first (no meaningful response regardless of where the
// slope happens to peak); otherwise classified by *where* the transition
// point falls in [0,1]: Front-Loaded: "strongest slope near starting
// intensity"; Back-Loaded: "...near maximum intensity"; Threshold-Type:
// "somewhere inside the range"; operationalized as equal thirds.
function classifyResponseType(tp, range, flatThreshold) {
  if (range < flatThreshold) return "Flat";
  if (tp <= 1 / 3) return "Front-Loaded";
  if (tp >= 2 / 3) return "Back-Loaded";
  return "Threshold-Type";
}

// Generalizes the spec's 3-outcome (Food Security / Biodiversity / Climate)
// example to any number of selected outcomes: improve = effect > epsilon
// (activation rose), worsen = effect < -epsilon (activation fell), both
// evaluated at full intervention intensity. Mirrored for the case where
// every outcome moves together in the *negative* direction, e.g. sweeping
// a stressor down to 0 and watching everything it drives fall together too;
// that's a coordinated response, not "no synergy" (that label is
// reserved for when nothing moved at all).
function classifySynergy(rows, epsilon) {
  const improve = rows.filter((r) => r.effect > epsilon).length;
  const worsen = rows.filter((r) => r.effect < -epsilon).length;
  const total = rows.length;
  if (improve > 0 && worsen > 0) return { type: "Trade-Off", improve, worsen, total };
  if (improve === total) return { type: "Full Synergy", improve, worsen, total };
  if (worsen === total) return { type: "Full Negative Synergy", improve, worsen, total };
  if (improve >= total / 2) return { type: "Partial Synergy", improve, worsen, total };
  if (worsen >= total / 2) return { type: "Partial Negative Synergy", improve, worsen, total };
  if (improve > 0) return { type: "Narrow Synergy", improve, worsen, total };
  if (worsen > 0) return { type: "Narrow Negative Synergy", improve, worsen, total };
  return { type: "No Synergy", improve, worsen, total };
}

// Serializes a chart's rendered <svg> to a PNG with no external library:
// XMLSerializer -> data URL -> draw onto an offscreen canvas -> toBlob.
// Returns a Promise<{blob, width, height}> (null if no <svg> is currently
// mounted inside containerEl) so callers can either trigger a download
// (exportChartAsPng, the per-chart "PNG" buttons) or embed the bytes
// directly into the exported workbook (exportAnalysisWorkbook).
function svgElementToPngBlob(containerEl) {
  return new Promise((resolve) => {
    const svg = containerEl?.querySelector("svg");
    if (!svg) { resolve(null); return; }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) { resolve(null); return; }
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", rect.width);
    clone.setAttribute("height", rect.height);
    // Recharts elements pick up color from CSS classes that don't exist once
    // serialized standalone; give the clone a plain white background so the
    // exported PNG isn't transparent.
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    const svgData = new XMLSerializer().serializeToString(clone);
    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);
    const scale = 2; // export at 2x for a crisper PNG
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width * scale;
      canvas.height = rect.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      canvas.toBlob((blob) => resolve(blob ? { blob, width: rect.width, height: rect.height } : null), "image/png");
    };
    img.onerror = () => resolve(null);
    img.src = svgUrl;
  });
}

function exportChartAsPng(containerEl, filename) {
  svgElementToPngBlob(containerEl).then((result) => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(result.blob);
    a.download = filename;
    a.click();
  });
}

function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ============================================================================
// Export Analysis Workbook (.xlsx)
// ============================================================================
// Everything below builds the single multi-sheet workbook the "Export
// Analysis Workbook" button produces. Kept as plain top-level functions
// (like downloadCSV/exportChartAsPng above) so it's reusable and testable
// independent of the SpaghettiEngine component tree; the component only
// gathers the current state/results and calls buildAnalysisWorkbook.

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Excel forbids \ / ? * [ ] in sheet names and caps them at 31 chars;
// usedNames (when passed) also de-duplicates two scenarios that happen to
// share a name after truncation/cleanup.
function sanitizeSheetName(name, usedNames) {
  const clean = (String(name || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet").slice(0, 31);
  if (!usedNames) return clean;
  if (!usedNames.has(clean)) { usedNames.add(clean); return clean; }
  let i = 2;
  let candidate;
  do {
    const suffix = ` (${i++})`;
    candidate = clean.slice(0, 31 - suffix.length) + suffix;
  } while (usedNames.has(candidate));
  usedNames.add(candidate);
  return candidate;
}

function excelColLetter(n) {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Adds one tabular sheet: frozen header row, bold/shaded header, autofilter,
// and columns auto-sized from header + a sample of row content (capped, so a
// very large sheet's width calc stays O(sample) rather than O(rows); see
// the plan's "large model" performance note).
function addDataSheet(workbook, name, columns, rows, usedNames) {
  const ws = workbook.addWorksheet(sanitizeSheetName(name, usedNames));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key }));
  rows.forEach((r) => ws.addRow(r));
  if (columns.length) {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = `A1:${excelColLetter(columns.length)}1`;
  }
  const sampleSize = Math.min(rows.length, 200);
  columns.forEach((c, i) => {
    let max = String(c.header ?? "").length;
    for (let r = 0; r < sampleSize; r++) {
      const v = rows[r]?.[c.key];
      if (v === undefined || v === null) continue;
      max = Math.max(max, String(v).length);
    }
    ws.getColumn(i + 1).width = Math.min(60, Math.max(8, max + 2));
  });
  return ws;
}

// Adds a sheet whose sole content is one embedded chart image, or, if that
// chart's tab was never visited this session so nothing was mounted to
// capture, a plain-language note explaining why, per the spec's own
// stated fallback ("if direct embedding is not feasible, include a note").
async function addChartSheet(workbook, name, captured, missingNote, usedNames) {
  const ws = workbook.addWorksheet(sanitizeSheetName(name, usedNames));
  if (captured) {
    const dataUrl = await blobToDataUrl(captured.blob);
    const imageId = workbook.addImage({ base64: dataUrl, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: captured.width, height: captured.height } });
  } else {
    ws.getColumn(1).width = 100;
    ws.getCell("A1").value = missingNote;
    ws.getCell("A1").alignment = { wrapText: true, vertical: "top" };
  }
  return ws;
}

// Every tab in this app is conditionally rendered ({tab === "x" && <...>}),
// so only the currently-active tab's chart actually exists in the DOM at any
// moment: switching tabs unmounts the one you just looked at. Without a
// cache, "export whichever charts you've generated this session" would in
// practice only ever capture the one tab open at export time. useCachedChart
// (called from each chart-bearing tab, see below) re-captures that chart a
// moment after it renders/updates and stores it in the app-shell's
// chartCache, so a chart generated earlier in the session is still
// available to embed even after navigating away from its tab.
const CHART_TARGETS = {
  networkGraph: { selector: '[data-chart="network-graph"]', mode: "dom" },
  influenceScores: { selector: '[data-chart="influence-scores"]', mode: "svg" },
  sensitivityScores: { selector: '[data-chart="sensitivity-scores"]', mode: "svg" },
  baselineConvergence: { selector: '[data-chart="baseline-convergence"]', mode: "svg" },
  scenarioComparison: { selector: '[data-chart="scenario-comparison"]', mode: "svg" },
  transitionCurves: { selector: '[data-chart="transition-curves"]', mode: "svg" },
};

async function captureOneChart(selector, mode) {
  const el = document.querySelector(selector);
  if (!el) return null;
  try {
    if (mode === "dom") {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      // skipFonts avoids html-to-image trying (and, for the Google Fonts /
      // unpkg stylesheets this app loads cross-origin, failing) to inline
      // @font-face rules for portability, which is noisy console errors and wasted
      // network round-trips on every capture, for no visible difference in
      // a chart embedded into a spreadsheet.
      const blob = await domNodeToPngBlob(el, { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true });
      return blob ? { blob, width: rect.width, height: rect.height } : null;
    }
    return await svgElementToPngBlob(el);
  } catch {
    return null;
  }
}

// Custom hook: a tab calls this with its own chart's cache key/selector plus
// whatever data its chart depends on, and a moment after that data settles
// (debounced, so a slider drag or fast successive re-runs don't fire it
// repeatedly) the chart is captured into the shared chartCache. setChartCache
// is undefined for any caller not passed one (none currently), in which case
// this is a no-op.
function useCachedChart(setChartCache, key, selector, mode, deps) {
  useEffect(() => {
    if (!setChartCache) return;
    const t = setTimeout(() => {
      captureOneChart(selector, mode).then((cap) => {
        if (cap) setChartCache((prev) => ({ ...prev, [key]: cap }));
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// Builds the final chart set for the workbook: starts from whatever's
// already cached from earlier in the session, then overwrites with a fresh
// live capture of anything mounted right now (the currently-active tab),
// since a live capture is always at least as fresh as the cache.
async function captureAnalysisCharts(chartCache = {}) {
  const out = { ...chartCache };
  for (const [key, { selector, mode }] of Object.entries(CHART_TARGETS)) {
    if (!document.querySelector(selector)) continue; // not mounted right now: keep whatever's cached (or nothing)
    const cap = await captureOneChart(selector, mode);
    if (cap) out[key] = cap;
  }
  return out;
}

function scenarioInterventionCount(s) {
  const ids = new Set([
    ...Object.keys(s.initialOverrides || {}),
    ...Object.keys(s.weightOverrides || {}),
    ...Object.keys(s.lockedConcepts || {}),
  ]);
  return ids.size;
}

// Max activation change between the last two iterations of a simulate()
// series: the same "maximum residual change" BaselineEquilibriumTab shows
// in its own diagnostics panel, recomputed here since that panel keeps it as
// local derived state rather than part of the lifted result object itself.
function seriesFinalMaxDelta(series) {
  if (!series || series.length < 2) return 0;
  const prev = series[series.length - 2].values;
  const last = series[series.length - 1].values;
  return Math.max(...Object.keys(last).map((id) => Math.abs(last[id] - prev[id])));
}

async function buildAnalysisWorkbook({
  concepts, edges, settings, scenarios, results,
  baselineResult, sensitivityResult, transitionResult,
  metrics, systemStats, categoryStats, categoryMatrix, chartCache, modelVersion, resultsStale,
}) {
  // Each of these three results carries the modelVersion it was computed
  // under (see StaleResultBanner); comparing it against the current one
  // catches a result that's been left sitting since before an edit to
  // concepts/edges/settings, so the workbook can say so explicitly instead
  // of quietly exporting output that no longer matches the model above it.
  const isStale = (result) => !!result && result.__modelVersion !== modelVersion;
  const STALE_NOTE = "Stale: the model was edited after this was run and it has not been re-run since; the figures below reflect the model as it was at the time of that run, not the current one.";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "The Spaghetti Engine";
  workbook.created = new Date();
  const usedNames = new Set();

  // ==== Model Structure ================================================
  addDataSheet(workbook, "Model Structure", [
    { header: "ID", key: "id" }, { header: "Name", key: "name" },
    { header: "Category", key: "category" }, { header: "Description", key: "description" },
    { header: "Initial Value", key: "initialValue" },
    { header: "Outgoing Relationships", key: "outCount" }, { header: "Incoming Relationships", key: "inCount" },
  ], concepts.map((c) => ({
    id: c.id, name: c.name, category: c.category || "", description: c.description || "",
    initialValue: c.initialValue,
    outCount: edges.filter((e) => e.source === c.id).length,
    inCount: edges.filter((e) => e.target === c.id).length,
  })), usedNames);

  // ==== Adjacency Matrix =================================================
  addDataSheet(workbook, "Adjacency Matrix", [
    { header: "Concept \\ Concept", key: "__row" },
    ...concepts.map((c) => ({ header: c.name, key: c.id })),
  ], concepts.map((rowC) => {
    const row = { __row: rowC.name };
    concepts.forEach((colC) => {
      const e = edges.find((e) => e.source === rowC.id && e.target === colC.id);
      row[colC.id] = e ? e.weight : "";
    });
    return row;
  }), usedNames);

  // ==== Network Metrics ===================================================
  addDataSheet(workbook, "Network Metrics", [
    { header: "ID", key: "id" }, { header: "Name", key: "name" }, { header: "Role", key: "role" },
    { header: "In-Degree", key: "indegree" }, { header: "Out-Degree", key: "outdegree" },
    { header: "Centrality", key: "centrality" }, { header: "Net Influence", key: "netInfluence" },
    { header: "Influence Score", key: "influence" }, { header: "Sensitivity Score", key: "sensitivity" },
  ], metrics, usedNames);

  // ==== Category Metrics ===================================================
  addDataSheet(workbook, "Category Metrics", [
    { header: "Category", key: "category" }, { header: "# Concepts", key: "concepts" },
    { header: "Internal Links", key: "internal" }, { header: "Incoming Links", key: "incoming" },
    { header: "Outgoing Links", key: "outgoing" },
    { header: "Mean In-Degree", key: "meanIndegree" }, { header: "Mean Out-Degree", key: "meanOutdegree" },
    { header: "Mean Centrality", key: "meanCentrality" },
    { header: "Mean Influence", key: "meanInfluence" }, { header: "Mean Sensitivity", key: "meanSensitivity" },
    { header: "Internal Density (%)", key: "density" },
  ], categoryStats, usedNames);

  // ==== Baseline Equilibrium + Baseline Iterations ========================
  if (baselineResult) {
    const allInitialZero = concepts.every((c) => Math.abs(c.initialValue ?? 0) < 1e-9);
    const bSheet = addDataSheet(workbook, "Baseline Equilibrium", [
      { header: "Concept", key: "name" }, { header: "Initial Value (A0)", key: "initial" },
      { header: "Equilibrium Value", key: "final" }, { header: "Change", key: "delta" },
    ], concepts.map((c) => {
      const initial = c.initialValue ?? 0;
      const final = baselineResult.final?.[c.id] ?? initial;
      return { name: c.name, initial, final: round2(final), delta: round2(final - initial) };
    }), usedNames);
    bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []);
    bSheet.getCell("A1").value = "Initial state type:"; bSheet.getCell("B1").value = allInitialZero ? "All zeros" : "User-defined";
    bSheet.getCell("A2").value = "Converged:"; bSheet.getCell("B2").value = baselineResult.converged ? "Yes" : "No";
    bSheet.getCell("A3").value = "Iterations to convergence:"; bSheet.getCell("B3").value = baselineResult.iterationsRun;
    bSheet.getCell("A4").value = "Maximum residual change:"; bSheet.getCell("B4").value = round2(seriesFinalMaxDelta(baselineResult.series));
    bSheet.getCell("A5").value = "Stale (model edited since this ran):"; bSheet.getCell("B5").value = isStale(baselineResult) ? "Yes, re-run before relying on this" : "No";
    if (isStale(baselineResult)) { bSheet.getCell("B5").font = { bold: true, color: { argb: "FFB45309" } }; }
    bSheet.views = [{ state: "frozen", ySplit: 6 }];
    bSheet.autoFilter = "A6:D6"; // header row shifted down by the 5 spliced-in diagnostic rows above

    addDataSheet(workbook, "Baseline Iterations", [
      { header: "Iteration", key: "iteration" },
      ...concepts.map((c) => ({ header: c.name, key: c.id })),
    ], baselineResult.series.map((pt) => ({ iteration: pt.iteration, ...pt.values })), usedNames);
  } else {
    addDataSheet(workbook, "Baseline Equilibrium", [{ header: "Note", key: "note" }], [
      { note: "The baseline equilibrium has not been run yet. Visit the Baseline Equilibrium tab and click Run before exporting to include this sheet's data." },
    ], usedNames);
  }

  // ==== Scenarios Summary + one sheet per scenario ========================
  addDataSheet(workbook, "Scenarios Summary", [
    { header: "Name", key: "name" }, { header: "Type", key: "type" }, { header: "Description", key: "description" },
    { header: "# Interventions", key: "interventions" },
    { header: "Run?", key: "run" }, { header: "Converged", key: "converged" }, { header: "Iterations Run", key: "iterations" },
    { header: "Stale (model edited since run)", key: "stale" },
  ], scenarios.map((s) => {
    const r = results[s.id];
    return {
      name: s.name, type: s.type, description: s.description || "",
      interventions: scenarioInterventionCount(s),
      run: r ? "Yes" : "No", converged: r ? (r.converged ? "Yes" : "No") : "", iterations: r ? r.iterationsRun : "",
      stale: r ? (resultsStale ? "Yes" : "No") : "",
    };
  }), usedNames);

  scenarios.forEach((s) => {
    const r = results[s.id];
    const baselineR = results["baseline"];
    if (r) {
      const scSheet = addDataSheet(workbook, s.name, [
        { header: "Concept", key: "name" },
        { header: "Baseline Final", key: "baseline" },
        { header: "Scenario Final", key: "scenario" },
        { header: "Effect Size", key: "delta" },
      ], concepts.map((c) => {
        const baseVal = baselineR?.final?.[c.id] ?? c.initialValue;
        const scVal = r.final?.[c.id] ?? c.initialValue;
        return { name: c.name, baseline: round2(baseVal), scenario: round2(scVal), delta: round2(scVal - baseVal) };
      }), usedNames);
      if (resultsStale) {
        scSheet.spliceRows(1, 0, []);
        scSheet.getCell("A1").value = STALE_NOTE;
        scSheet.getCell("A1").font = { bold: true, color: { argb: "FFB45309" } };
        scSheet.views = [{ state: "frozen", ySplit: 2 }];
        scSheet.autoFilter = "A2:D2"; // header row shifted down by the spliced-in stale-note row above
      }
    } else {
      addDataSheet(workbook, s.name, [{ header: "Note", key: "note" }], [
        { note: `"${s.name}" has not been run yet. Tick it under "compare" in Scenarios & Simulation and run the simulation before exporting to include its results.` },
      ], usedNames);
    }
  });

  // ==== Optional: Sensitivity Analysis ====================================
  if (sensitivityResult) {
    const sSheet = addDataSheet(workbook, "Sensitivity Analysis", [
      { header: "Output Concept", key: "name" }, { header: "Min", key: "min" }, { header: "Max", key: "max" },
      { header: "Elasticity", key: "elasticity" },
    ], sensitivityResult.elasticity, usedNames);
    if (isStale(sensitivityResult)) {
      sSheet.spliceRows(1, 0, []);
      sSheet.getCell("A1").value = STALE_NOTE;
      sSheet.getCell("A1").font = { bold: true, color: { argb: "FFB45309" } };
      sSheet.views = [{ state: "frozen", ySplit: 2 }];
      sSheet.autoFilter = "A2:D2"; // header row shifted down by the spliced-in stale-note row above
    }
    const tornadoStart = sSheet.rowCount + 3;
    sSheet.getCell(`A${tornadoStart - 1}`).value = "Tornado (impact of sweeping each concept on the primary output)";
    sSheet.getCell(`A${tornadoStart - 1}`).font = { bold: true };
    ["Concept", "Low", "High", "Impact"].forEach((h, i) => { sSheet.getCell(tornadoStart, i + 1).value = h; sSheet.getCell(tornadoStart, i + 1).font = { bold: true }; });
    sensitivityResult.tornado.forEach((t, i) => {
      sSheet.getCell(tornadoStart + 1 + i, 1).value = t.name;
      sSheet.getCell(tornadoStart + 1 + i, 2).value = t.low;
      sSheet.getCell(tornadoStart + 1 + i, 3).value = t.high;
      sSheet.getCell(tornadoStart + 1 + i, 4).value = t.impact;
    });
  }

  // ==== Optional: Transition Point Analysis ===============================
  if (transitionResult) {
    const tSheet = addDataSheet(workbook, "Transition Point Analysis", [
      { header: "Outcome Concept", key: "outcomeName" }, { header: "Transition Point", key: "tp" },
      { header: "Range", key: "range" }, { header: "Effect", key: "effect" },
      { header: "Response Type", key: "responseType" }, { header: "Efficiency", key: "efficiency" },
    ], transitionResult.rows.map((r) => ({
      outcomeName: r.outcomeName, tp: round2(r.tp), range: round2(r.range), effect: round2(r.effect),
      responseType: r.responseType, efficiency: round2(r.efficiency),
    })), usedNames);
    if (isStale(transitionResult)) {
      tSheet.spliceRows(1, 0, []);
      tSheet.getCell("A1").value = STALE_NOTE;
      tSheet.getCell("A1").font = { bold: true, color: { argb: "FFB45309" } };
      tSheet.views = [{ state: "frozen", ySplit: 2 }];
      tSheet.autoFilter = "A2:F2"; // header row shifted down by the spliced-in stale-note row above
    }
  }

  // ==== Optional: Category Interaction Matrix (always computable, >=2 categories) ====
  const categoryNames = categoryStats.map((c) => c.category);
  if (categoryNames.length >= 2) {
    const cSheet = addDataSheet(workbook, "Category Interaction Matrix", [
      { header: "From \\ To (link count)", key: "__row" },
      ...categoryNames.map((cat) => ({ header: cat, key: cat })),
    ], categoryNames.map((rowCat) => {
      const row = { __row: rowCat };
      categoryNames.forEach((colCat) => (row[colCat] = categoryMatrix[rowCat]?.[colCat]?.count ?? 0));
      return row;
    }), usedNames);
    const weightStart = cSheet.rowCount + 3;
    cSheet.getCell(`A${weightStart - 1}`).value = "Total signed weight, same From \\ To layout";
    cSheet.getCell(`A${weightStart - 1}`).font = { bold: true };
    // Corner cell, matching the count table's own "From \ To (...)" header above.
    cSheet.getCell(weightStart, 1).value = "From \\ To (total weight)";
    cSheet.getCell(weightStart, 1).font = { bold: true };
    categoryNames.forEach((cat, i) => { cSheet.getCell(weightStart, i + 2).value = cat; cSheet.getCell(weightStart, i + 2).font = { bold: true }; });
    categoryNames.forEach((rowCat, r) => {
      cSheet.getCell(weightStart + 1 + r, 1).value = rowCat;
      categoryNames.forEach((colCat, c) => {
        cSheet.getCell(weightStart + 1 + r, c + 2).value = round2(categoryMatrix[rowCat]?.[colCat]?.totalWeight ?? 0);
      });
    });
  }

  // ==== Optional: Convergence Diagnostics (same source as Baseline Equilibrium) ====
  if (baselineResult) {
    const allInitialZero = concepts.every((c) => Math.abs(c.initialValue ?? 0) < 1e-9);
    addDataSheet(workbook, "Convergence Diagnostics", [{ header: "Metric", key: "metric" }, { header: "Value", key: "value" }], [
      { metric: "Initial State Type", value: allInitialZero ? "All zeros" : "User-defined" },
      { metric: "Converged", value: baselineResult.converged ? "Yes" : "No" },
      { metric: "Iterations to Convergence", value: baselineResult.iterationsRun },
      { metric: "Maximum Residual Change", value: round2(seriesFinalMaxDelta(baselineResult.series)) },
      { metric: "Fixed Point Detected", value: baselineResult.converged ? "Yes" : "No" },
      { metric: "Stale (model edited since this ran)", value: isStale(baselineResult) ? "Yes, re-run before relying on this" : "No" },
    ], usedNames);
  }

  // ==== Optional: System Overview Metrics (always computable) =============
  addDataSheet(workbook, "System Overview Metrics", [{ header: "Metric", key: "metric" }, { header: "Value", key: "value" }], [
    { metric: "Concepts", value: systemStats.concepts }, { metric: "Relationships", value: systemStats.relationships },
    { metric: "Density (%)", value: systemStats.density }, { metric: "Average Degree", value: systemStats.avgDegree },
    { metric: "Max Degree", value: systemStats.maxDegree }, { metric: "Min Degree", value: systemStats.minDegree },
    { metric: "Feedback Loops (total)", value: systemStats.loops.total },
    { metric: "Feedback Loops (reinforcing)", value: systemStats.loops.reinforcing },
    { metric: "Feedback Loops (balancing)", value: systemStats.loops.balancing },
    {
      // computeSystemStats returns Infinity when there are Receiver concepts
      // but zero Drivers (division by zero); ExcelJS silently writes
      // Infinity/NaN as a blank cell rather than erroring, which reads as
      // "no data" with no explanation. The live UI already guards this
      // exact case (Number.isFinite(stats.complexity) ? ... : "N/A"); match
      // it here instead of leaving the exported cell blank.
      metric: "Structural Complexity (receivers/drivers)",
      value: Number.isFinite(systemStats.complexity) ? systemStats.complexity : "N/A",
    },
    { metric: "Connectivity (edges/concepts)", value: systemStats.connectivity },
    { metric: "Centralization (%)", value: systemStats.centralization },
  ], usedNames);

  // ==== Chart images =======================================================
  const charts = await captureAnalysisCharts(chartCache);
  const notFound = (tabName) => `Chart not captured: visit the "${tabName}" tab before exporting to include this figure (charts are only rendered once their tab has been opened).`;
  await addChartSheet(workbook, "Network Graph", charts.networkGraph, notFound("Network"), usedNames);
  await addChartSheet(workbook, "Influence Scores Chart", charts.influenceScores, notFound("Influence Metrics"), usedNames);
  await addChartSheet(workbook, "Sensitivity Scores Chart", charts.sensitivityScores, notFound("Sensitivity Analysis") + " Also requires having run an analysis there.", usedNames);
  await addChartSheet(workbook, "Baseline Convergence Plot", charts.baselineConvergence, notFound("Baseline Equilibrium") + " Also requires clicking Run there.", usedNames);
  await addChartSheet(workbook, "Scenario Comparison Plot", charts.scenarioComparison, notFound("Scenarios & Simulation") + " Also requires comparing and running at least one scenario.", usedNames);
  await addChartSheet(workbook, "Transition Point Curves", charts.transitionCurves, notFound("Transition Point Analysis") + " Also requires having run an analysis there.", usedNames);

  return workbook.xlsx.writeBuffer();
}

const RESPONSE_TYPE_STYLE = {
  "Flat": "bg-slate-100 text-slate-500 border-slate-200",
  "Front-Loaded": "bg-teal-50 text-teal-800 border-teal-200",
  "Threshold-Type": "bg-amber-50 text-amber-800 border-amber-200",
  "Back-Loaded": "bg-rose-50 text-rose-800 border-rose-200",
};
const RESPONSE_TYPE_HELP = {
  "Flat": "No meaningful response: the maximum change in this outcome across the whole intensity range is below the flat-response threshold.",
  "Front-Loaded": "Most benefit is achieved with low effort: the strongest marginal return happens near the starting intensity, with diminishing returns after that.",
  "Threshold-Type": "A threshold must be crossed before substantial impact occurs: the strongest marginal return happens at an intermediate intensity.",
  "Back-Loaded": "Requires substantial effort before impacts emerge: the strongest marginal return happens near the maximum intensity.",
};

const SYNERGY_STYLE = {
  "Trade-Off": "bg-rose-50 text-rose-800 border-rose-200",
  "Full Synergy": "bg-teal-50 text-teal-800 border-teal-200",
  "Partial Synergy": "bg-amber-50 text-amber-800 border-amber-200",
  "Narrow Synergy": "bg-amber-50 text-amber-800 border-amber-200",
  "Full Negative Synergy": "bg-rose-50 text-rose-800 border-rose-200",
  "Partial Negative Synergy": "bg-orange-50 text-orange-800 border-orange-200",
  "Narrow Negative Synergy": "bg-orange-50 text-orange-800 border-orange-200",
  "No Synergy": "bg-slate-100 text-slate-500 border-slate-200",
};

function TransitionPointAnalysisTab({ concepts, edges, scenarios, activeScenarioId, settings, result, setResult, setChartCache, modelVersion }) {
  useCachedChart(setChartCache, "transitionCurves", '[data-chart="transition-curves"]', "svg", [result]);
  const [tpIntervention, setTpIntervention] = useState("");
  const [tpDirection, setTpDirection] = useState("increase");
  const [tpOutcomes, setTpOutcomes] = useState([]);
  const [tpResolution, setTpResolution] = useState(100);
  const [tpFlatThreshold, setTpFlatThreshold] = useState(0.015);
  const [running, setRunning] = useState(false);

  const responseChartRef = useRef(null);
  const slopeChartRef = useRef(null);

  const availableOutcomeConcepts = useMemo(() => concepts.filter((c) => c.id !== tpIntervention), [concepts, tpIntervention]);
  const toggleOutcome = (id) => setTpOutcomes((os) => (os.includes(id) ? os.filter((o) => o !== id) : [...os, id]));
  const selectAllOutcomes = () => setTpOutcomes(availableOutcomeConcepts.map((c) => c.id));
  const clearOutcomes = () => setTpOutcomes([]);

  const runAnalysis = () => {
    const outcomeIds = tpOutcomes.filter((id) => id !== tpIntervention);
    if (!tpIntervention || outcomeIds.length === 0) return;
    setRunning(true);
    // Defer one tick so the busy state actually paints before the
    // synchronous sweep (up to 501 simulate() runs at resolution 500).
    setTimeout(() => {
      const base = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];
      const sweep = runTransitionSweep(concepts, edges, base, settings, tpIntervention, tpDirection, outcomeIds, tpResolution);
      const rows = outcomeIds.map((id) => {
        const o = sweep.perOutcome[id];
        const responseType = classifyResponseType(o.tp, o.range, tpFlatThreshold);
        const efficiency = o.effect / Math.max(o.tp, 1 / tpResolution);
        return { outcomeId: id, outcomeName: concepts.find((c) => c.id === id)?.name || id, ...o, responseType, efficiency };
      });
      setResult({
        interventionId: tpIntervention,
        interventionName: concepts.find((c) => c.id === tpIntervention)?.name || tpIntervention,
        direction: tpDirection, resolution: tpResolution, flatThreshold: tpFlatThreshold,
        steps: sweep.steps, rows, __modelVersion: modelVersion,
      });
      setRunning(false);
    }, 10);
  };
  const isStale = !!result && result.__modelVersion !== modelVersion;

  const lineColors = ["#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#be123c", "#4d7c0f", "#a16207", "#0e7490"];

  const curveData = useMemo(() => {
    if (!result) return [];
    return result.steps.map((x, i) => {
      const row = { x: round2(x) };
      result.rows.forEach((r) => (row[r.outcomeId] = round2(r.y[i])));
      return row;
    });
  }, [result]);

  const slopeData = useMemo(() => {
    if (!result) return [];
    return result.steps.slice(0, -1).map((x, i) => {
      const row = { x: round2(x) };
      result.rows.forEach((r) => (row[r.outcomeId] = round2(r.slope[i])));
      return row;
    });
  }, [result]);

  const kpis = useMemo(() => {
    if (!result || result.rows.length === 0) return null;
    const rows = result.rows;
    return {
      earliest: [...rows].sort((a, b) => a.tp - b.tp)[0],
      latest: [...rows].sort((a, b) => b.tp - a.tp)[0],
      highestEffect: [...rows].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))[0],
      mostEfficient: [...rows].sort((a, b) => Math.abs(b.efficiency) - Math.abs(a.efficiency))[0],
    };
  }, [result]);

  const matrixData = useMemo(() => {
    if (!result) return [];
    return result.rows.map((r) => ({ x: round2(r.tp), y: round2(Math.abs(r.effect)), name: r.outcomeName, effect: r.effect }));
  }, [result]);
  const matrixYSplit = useMemo(() => {
    if (!matrixData.length) return 0;
    return round2(matrixData.reduce((s, d) => s + d.y, 0) / matrixData.length);
  }, [matrixData]);

  const synergy = useMemo(() => {
    if (!result || result.rows.length < 2) return null;
    return classifySynergy(result.rows, result.flatThreshold);
  }, [result]);

  const exportResponseCSV = () => {
    if (!result) return;
    const header = ["Intensity", ...result.rows.map((r) => r.outcomeName)];
    const rows = result.steps.map((x, i) => [round2(x), ...result.rows.map((r) => round2(r.y[i]))]);
    downloadCSV([header, ...rows], "transition-response-curves.csv");
  };
  const exportSlopeCSV = () => {
    if (!result) return;
    const header = ["Intensity", ...result.rows.map((r) => r.outcomeName)];
    const rows = result.steps.slice(0, -1).map((x, i) => [round2(x), ...result.rows.map((r) => round2(r.slope[i]))]);
    downloadCSV([header, ...rows], "transition-marginal-returns.csv");
  };
  const exportTableCSV = () => {
    if (!result) return;
    const header = ["Intervention", "Outcome", "Direction", "TP", "Max Change", "Response Type", "Efficiency Score"];
    const rows = result.rows.map((r) => [result.interventionName, r.outcomeName, result.direction, round2(r.tp), round2(r.effect), r.responseType, round2(r.efficiency)]);
    downloadCSV([header, ...rows], "transition-point-table.csv");
  };
  const exportRankingsCSV = () => {
    if (!kpis) return;
    const header = ["KPI", "Outcome", "TP", "Effect", "Efficiency"];
    const rows = [
      ["Earliest Transition Point", kpis.earliest.outcomeName, round2(kpis.earliest.tp), round2(kpis.earliest.effect), round2(kpis.earliest.efficiency)],
      ["Latest Transition Point", kpis.latest.outcomeName, round2(kpis.latest.tp), round2(kpis.latest.effect), round2(kpis.latest.efficiency)],
      ["Highest Total Effect", kpis.highestEffect.outcomeName, round2(kpis.highestEffect.tp), round2(kpis.highestEffect.effect), round2(kpis.highestEffect.efficiency)],
      ["Most Efficient Lever", kpis.mostEfficient.outcomeName, round2(kpis.mostEfficient.tp), round2(kpis.mostEfficient.effect), round2(kpis.mostEfficient.efficiency)],
    ];
    downloadCSV([header, ...rows], "transition-point-rankings.csv");
  };

  return (
    <div className="space-y-5">
      <InfoBox>
        <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-1.5 mb-1"><TrendingUp size={15} className="text-teal-700" />What is a Transition Point?</h3>
        <p>Transition Point Analysis identifies the intervention intensity at which additional effort produces the greatest additional change in an outcome, whether that change is an improvement or a worsening.</p>
        <p>It works by sweeping one intervention concept from 0 to 1 (or 1 to 0) in small steps, re-running the simulation at each step, and recording how each chosen outcome concept responds along the way. The <strong>transition point</strong> for an outcome is the step where its rate of change (marginal return) is largest in magnitude, i.e. where the response curve is steepest, in whichever direction it happens to be moving. This app has no notion of which direction is "good" for a given concept, so always check the sign of the effect (shown in the table below) before treating a transition point as a leverage point worth pursuing.</p>
        <p>Many interventions produce non-linear responses. An intervention may produce its effect immediately, require substantial effort before that effect emerges, or remain ineffective across all intensities. Transition Point Analysis identifies where the rate of change is greatest.</p>
        <p>This helps decision makers identify:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Efficient intervention levels</li>
          <li>Leverage points</li>
          <li>Diminishing returns</li>
          <li>Threshold effects</li>
          <li>Potential implementation challenges</li>
        </ul>

        <p className="font-medium text-slate-700 mt-2 mb-1">Steps</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Choose the intervention variable to sweep (Step 1).</li>
          <li>Choose its direction: increase from 0 to 1, or decrease from 1 to 0 (Step 2).</li>
          <li>Choose one or more outcome variables to observe (Step 3), or use "All variables" to select every other concept at once.</li>
          <li>Choose the intensity resolution, i.e. how many steps to sample across the sweep (Step 4), and, optionally, adjust the flat-response threshold used to classify an outcome with little to no response.</li>
          <li>Click Run analysis (Step 5) to generate the response curves, marginal-return curves, transition point table, and rankings.</li>
        </ol>
      </InfoBox>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-3">Run an analysis</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 1: Intervention variable</label>
            <select
              value={tpIntervention}
              onChange={(e) => { setTpIntervention(e.target.value); setTpOutcomes((os) => os.filter((o) => o !== e.target.value)); }}
              className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5"
            >
              <option value="" disabled>Select…</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 2: Direction</label>
            <div className="flex mt-1 border border-slate-200 rounded overflow-hidden">
              <button onClick={() => setTpDirection("increase")} className={`flex-1 text-xs py-1.5 ${tpDirection === "increase" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Increase (0→1)</button>
              <button onClick={() => setTpDirection("decrease")} className={`flex-1 text-xs py-1.5 ${tpDirection === "decrease" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Decrease (1→0)</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Step 4: Intensity resolution</label>
            <select value={tpResolution} onChange={(e) => setTpResolution(parseInt(e.target.value))} className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5">
              <option value={50}>50 increments</option>
              <option value={100}>100 increments</option>
              <option value={200}>200 increments</option>
              <option value={500}>500 increments</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium" title="Below this, an outcome's total range across the whole sweep is classified as a 'Flat' (no meaningful) response.">Flat-response threshold <HelpCircle size={10} className="inline text-slate-300" /></label>
            <input type="number" step={0.005} min={0} max={1} value={tpFlatThreshold} onChange={(e) => setTpFlatThreshold(Math.max(0, parseFloat(e.target.value) || 0))} className="w-full mt-1 text-xs border border-slate-200 rounded px-2 py-1.5" />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-500 font-medium">Step 3: Outcome variable(s)</label>
          <div className="mt-1 flex items-center gap-2 mb-1.5">
            <button onClick={selectAllOutcomes} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-slate-400">All variables</button>
            <button onClick={clearOutcomes} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-slate-400">Clear</button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-[70px] overflow-auto border border-slate-200 rounded p-1.5">
            {availableOutcomeConcepts.map((c) => (
              <button
                key={c.id} onClick={() => toggleOutcome(c.id)}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${tpOutcomes.includes(c.id) ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Btn variant="accent" onClick={runAnalysis} disabled={!tpIntervention || tpOutcomes.filter((o) => o !== tpIntervention).length === 0 || running}>
            <Play size={14} />{running ? "Running…" : "Step 5: Run analysis"}
          </Btn>
          {!tpIntervention && <span className="text-xs text-slate-400 ml-2">Select an intervention variable to begin.</span>}
        </div>
      </div>

      {result && (
        <>
          {isStale && <StaleResultBanner label="this transition point analysis" />}

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold">Response curves: {result.interventionName} ({result.direction === "increase" ? "0→1" : "1→0"})</h4>
              <Btn variant="outline" onClick={() => exportChartAsPng(responseChartRef.current, "transition-response-curves.png")}><Download size={13} />PNG</Btn>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Dashed vertical lines mark each outcome's transition point (greatest marginal return). Drag the strip below the chart to zoom into an intensity range.</p>
            <div ref={responseChartRef} data-chart="transition-curves" className="w-full h-80">
              <ResponsiveContainer>
                <LineChart data={curveData} margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="x" type="number" domain={[0, 1]} tick={{ fontSize: 10 }} label={{ value: "Intervention Intensity", position: "insideBottom", offset: -12, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: "Equilibrium Outcome", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {result.rows.map((r, i) => (
                    <ReferenceLine key={`tp-${r.outcomeId}`} x={round2(r.tp)} stroke={lineColors[i % lineColors.length]} strokeDasharray="4 4"
                      label={i === 0 ? { value: `TP = ${round2(r.tp)}`, position: "top", fontSize: 10, fill: lineColors[i % lineColors.length] } : undefined} />
                  ))}
                  {result.rows.map((r, i) => (
                    <Line key={r.outcomeId} type="monotone" dataKey={r.outcomeId} name={r.outcomeName} stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={false} />
                  ))}
                  <Brush dataKey="x" height={20} stroke="#0f766e" travellerWidth={8} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold">Marginal return: Greatest Marginal Return highlighted</h4>
              <Btn variant="outline" onClick={() => exportChartAsPng(slopeChartRef.current, "transition-marginal-returns.png")}><Download size={13} />PNG</Btn>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Slope(i) = (Y(i+1) − Y(i)) / Δx at every intensity step. The peak of each curve is that outcome's transition point.</p>
            <div ref={slopeChartRef} className="w-full h-72">
              <ResponsiveContainer>
                <LineChart data={slopeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="x" type="number" domain={[0, 1]} tick={{ fontSize: 10 }} label={{ value: "Intervention Intensity", position: "insideBottom", offset: -5, fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} label={{ value: "Slope (Marginal Return)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine y={0} stroke="#cbd5e1" />
                  {result.rows.map((r, i) => (
                    <Line key={r.outcomeId} type="monotone" dataKey={r.outcomeId} name={r.outcomeName} stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Transition point results</h4>
              <Btn variant="outline" onClick={exportTableCSV}><Download size={13} />Export CSV</Btn>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1 font-medium pr-3">Intervention</th>
                  <th className="py-1 font-medium pr-3">Outcome</th>
                  <th className="py-1 font-medium pr-3">TP</th>
                  <th className="py-1 font-medium pr-3">Max Change</th>
                  <th className="py-1 font-medium pr-3" title="See the definitions above the results.">Response Type <HelpCircle size={10} className="inline text-slate-300" /></th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.outcomeId} className="border-b border-slate-50">
                    <td className="py-1 pr-3">{result.interventionName}</td>
                    <td className="py-1 pr-3">{r.outcomeName}</td>
                    <td className="py-1 pr-3 font-mono">{round2(r.tp)}</td>
                    <td className="py-1 pr-3 font-mono">{r.effect >= 0 ? "+" : ""}{round2(r.effect)}</td>
                    <td className="py-1 pr-3">
                      <span title={RESPONSE_TYPE_HELP[r.responseType]} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${RESPONSE_TYPE_STYLE[r.responseType]}`}>{r.responseType}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {kpis && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">Transition point dashboard</h4>
                <Btn variant="outline" onClick={exportRankingsCSV}><Download size={13} />Export CSV</Btn>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Earliest transition point</div>
                  <div className="text-sm font-semibold mt-0.5">{kpis.earliest.outcomeName}</div>
                  <div className="text-xs font-mono text-slate-500">TP = {round2(kpis.earliest.tp)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Rapid impact.</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Latest transition point</div>
                  <div className="text-sm font-semibold mt-0.5">{kpis.latest.outcomeName}</div>
                  <div className="text-xs font-mono text-slate-500">TP = {round2(kpis.latest.tp)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Difficult leverage point.</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Highest total effect</div>
                  <div className="text-sm font-semibold mt-0.5">{kpis.highestEffect.outcomeName}</div>
                  <div className="text-xs font-mono text-slate-500">{kpis.highestEffect.effect >= 0 ? "+" : ""}{round2(kpis.highestEffect.effect)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Largest equilibrium change.</div>
                </div>
                <div className="border border-slate-200 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wide" title="Efficiency = Total Effect / Transition Point (TP). How much this outcome changed overall, relative to how far the intervention had to be pushed before its steepest response kicked in. A high efficiency means a small nudge produces a big change; a low one means most of the intervention's range is spent for comparatively little. Sign matches the effect: a negative efficiency means the outcome got worse, not better.">Most efficient lever <HelpCircle size={10} className="inline text-slate-300" /></div>
                  <div className="text-sm font-semibold mt-0.5">{kpis.mostEfficient.outcomeName}</div>
                  <div className="text-xs font-mono text-slate-500">Efficiency = {round2(kpis.mostEfficient.efficiency)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">Effect size / required intensity.</div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold mb-1">Intervention prioritization matrix</h4>
            <p className="text-[11px] text-slate-400 mb-2">X: transition point (required intensity). Y: |effect size|. Point color: green = outcome improves, red = outcome declines.</p>
            <div className="w-full h-80">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="x" domain={[0, 1]} tick={{ fontSize: 10 }} label={{ value: "Transition Point", position: "insideBottom", offset: -12, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" tick={{ fontSize: 10 }} label={{ value: "Effect Size", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <ZAxis range={[80, 80]} />
                  <RTooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => active && payload?.[0] ? (
                    <div className="bg-white border border-slate-200 rounded shadow-sm p-2 text-[11px]">
                      <div className="font-semibold">{payload[0].payload.name}</div>
                      <div>TP = {payload[0].payload.x}</div>
                      <div>Effect = {payload[0].payload.effect >= 0 ? "+" : ""}{payload[0].payload.effect}</div>
                    </div>
                  ) : null} />
                  <ReferenceLine x={0.5} stroke="#94a3b8" />
                  <ReferenceLine y={matrixYSplit} stroke="#94a3b8" />
                  <Scatter data={matrixData}>
                    {matrixData.map((d, i) => <Cell key={i} fill={d.effect >= 0 ? "#16a34a" : "#dc2626"} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[10px] text-slate-400">
              <div><strong className="text-slate-600">Quick Wins</strong>: low TP, high effect</div>
              <div><strong className="text-slate-600">Strategic Investments</strong>: high TP, high effect</div>
              <div><strong className="text-slate-600">Small Improvements</strong>: low TP, low effect</div>
              <div><strong className="text-slate-600">Poor Leverage Points</strong>: high TP, low effect</div>
            </div>
          </div>

          {synergy && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h4 className="text-sm font-semibold mb-1">Synergy classification</h4>
              <p className="text-[11px] text-slate-400 mb-2">Across the {synergy.total} selected outcomes, evaluated at full intervention intensity (x = 1).</p>
              <div className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${SYNERGY_STYLE[synergy.type]}`}>
                {synergy.type}
              </div>
              <p className="text-xs text-slate-500 mt-2">{synergy.improve} improved, {synergy.worsen} worsened, {synergy.total - synergy.improve - synergy.worsen} unchanged (within the flat-response threshold).</p>
            </div>
          )}

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h4 className="text-sm font-semibold mb-2">Export</h4>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" onClick={exportResponseCSV}><Download size={13} />Response curves (CSV)</Btn>
              <Btn variant="outline" onClick={exportSlopeCSV}><Download size={13} />Marginal return curves (CSV)</Btn>
              <Btn variant="outline" onClick={exportTableCSV}><Download size={13} />TP table (CSV)</Btn>
              <Btn variant="outline" onClick={exportRankingsCSV} disabled={!kpis}><Download size={13} />Rankings (CSV)</Btn>
              <Btn variant="outline" onClick={() => exportChartAsPng(responseChartRef.current, "transition-response-curves.png")}><Download size={13} />Response chart (PNG)</Btn>
              <Btn variant="outline" onClick={() => exportChartAsPng(slopeChartRef.current, "transition-marginal-returns.png")}><Download size={13} />Marginal chart (PNG)</Btn>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 italic">PDF export is not yet implemented (see the roadmap note at the bottom of the page). Use PNG for images and CSV for data in the meantime.</p>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Main app
// ============================================================================
export default function SpaghettiEngine() {
  const [tab, setTab] = useState("editor");
  const [concepts, setConcepts] = useState(() => makeTemplate("agriculture").concepts);
  const [edges, setEdges] = useState(() => makeTemplate("agriculture").edges);
  const [scenarios, setScenarios] = useState([
    { id: "baseline", name: "Baseline", type: "baseline", description: "", initialOverrides: {}, weightOverrides: {}, lockedConcepts: {} },
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState("baseline");
  const [compareIds, setCompareIds] = useState([]);
  const [settings, setSettings] = useState({
    maxIterations: 100, convergenceThreshold: 0.001, mode: "synchronous",
    squashFunction: "tanh", lambda: 1, updateRule: "relative",
  });
  const [selected, setSelected] = useState(null);
  // Bumped whenever something that actually affects simulate()'s output
  // changes (a concept's initialValue, an edge's source/target/weight, or
  // any simulation setting), so BaselineEquilibriumTab / SensitivityAnalysisTab
  // / TransitionPointAnalysisTab can each tell whether their stored result
  // still matches the current model (see StaleResultBanner) instead of
  // silently going stale with no indication. Deliberately built from a
  // signature of just those fields, not a raw concepts/edges reference-watch:
  // concepts/edges are replaced with a new array reference on every edit
  // throughout this file, including ones simulate() never reads at all (a
  // concept's position, name, category, or description). moveConcept in
  // particular replaces the concepts array on every single drag frame while
  // repositioning a node, which would otherwise mark every analysis "stale"
  // just from dragging something around the canvas.
  const simSignature = useMemo(() => {
    const c = concepts.map((c) => `${c.id}:${c.initialValue}`).join(",");
    const e = edges.map((e) => `${e.id}:${e.source}:${e.target}:${e.weight}`).join(",");
    return `${c}|${e}|${JSON.stringify(settings)}`;
  }, [concepts, edges, settings]);
  const [modelVersion, setModelVersion] = useState(0);
  const simSignatureRef = useRef(simSignature);
  useEffect(() => {
    if (simSignatureRef.current !== simSignature) {
      simSignatureRef.current = simSignature;
      setModelVersion((v) => v + 1);
    }
  }, [simSignature]);
  // `results` (Scenarios & Simulation's comparison runs) additionally
  // depends on each scenario's own overrides/locks/type, unlike Baseline/
  // Sensitivity/Transition (which each build their own clean or locally-
  // parameterized scenario object rather than reading `scenarios` state
  // directly), so its staleness check needs a broader signature: simSignature
  // plus every scenario's initialOverrides/lockedConcepts/weightOverrides.
  const resultsSimSignature = useMemo(() => {
    const sc = scenarios.map((s) => `${s.id}:${s.type}:${JSON.stringify(s.initialOverrides)}:${JSON.stringify(s.lockedConcepts)}:${JSON.stringify(s.weightOverrides)}`).join(",");
    return `${simSignature}||${sc}`;
  }, [simSignature, scenarios]);
  // The signature at the moment `results` was last computed by runAll;
  // `results` is stale once resultsSimSignature has since diverged from
  // this. null before the first run, when there's nothing yet to be stale.
  const [resultsSignatureAtRun, setResultsSignatureAtRun] = useState(null);
  const [results, setResults] = useState({});
  const resultsStale = resultsSignatureAtRun !== null && resultsSignatureAtRun !== resultsSimSignature && Object.keys(results).length > 0;
  // Lifted out of BaselineEquilibriumTab / SensitivityAnalysisTab /
  // TransitionPointAnalysisTab (each used to keep its computed result in
  // purely local state) so the Export Analysis Workbook button can include
  // whichever of these analyses have actually been run, without forcing
  // every tab to be re-run at export time.
  const [baselineResult, setBaselineResult] = useState(null);
  const [sensitivityResult, setSensitivityResult] = useState(null);
  const [transitionResult, setTransitionResult] = useState(null);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);
  // Captured chart PNGs, keyed by chart (see useCachedChart / captureAnalysisCharts
  // above): each chart-bearing tab refreshes its own entry a moment after it
  // renders, so a chart generated earlier in the session survives navigating
  // away from its tab and is still available when Export Analysis Workbook
  // is clicked later, even though only the active tab is actually mounted.
  const [chartCache, setChartCache] = useState({});
  // The scenario comparison chart is rendered inline in this component's own
  // JSX (Scenarios & Simulation tab), not a separate tab component, so it's
  // cached here directly rather than via a prop like the other five charts.
  useCachedChart(setChartCache, "scenarioComparison", '[data-chart="scenario-comparison"]', "svg", [results, compareIds]);
  const [matrixText, setMatrixText] = useState("");
  const [showMatrixPanel, setShowMatrixPanel] = useState(false);
  const [showInitialValueHelp, setShowInitialValueHelp] = useState(false);
  const [showScenarioHelp, setShowScenarioHelp] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [matrixSuccess, setMatrixSuccess] = useState(null);
  const fileInputRef = useRef(null);

  // ==== undo/redo history (structural network edits) ==========================
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  // A ref mirroring the latest concepts/edges, updated every render, so
  // commitHistory/undo/redo can read the current values without listing
  // concepts/edges as dependencies. Without this, these three functions get
  // a new identity every time concepts/edges change, which, before the
  // fix, was every single frame while a node was being dragged (moveConcept
  // calls setConcepts on every "position" change event), and every
  // callback/effect downstream that lists them as a dependency (notably the
  // Network tab's keyboard-shortcut effect, which attaches window keydown/
  // keyup listeners) was tearing down and reattaching continuously for the
  // whole duration of every drag. Keeping these three referentially stable
  // removes that churn without changing when history actually gets
  // committed (still exactly the same call sites as before).
  const latestModelRef = useRef({ concepts, edges });
  latestModelRef.current = { concepts, edges };
  const commitHistory = useCallback(() => {
    const { concepts, edges } = latestModelRef.current;
    setHistoryPast((p) => [...p.slice(-49), { concepts, edges }]);
    setHistoryFuture([]);
  }, []);
  const undo = useCallback(() => {
    setHistoryPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setHistoryFuture((f) => [latestModelRef.current, ...f]);
      setConcepts(prev.concepts);
      setEdges(prev.edges);
      return p.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setHistoryFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistoryPast((p) => [...p, latestModelRef.current]);
      setConcepts(next.concepts);
      setEdges(next.edges);
      return f.slice(1);
    });
  }, []);

  // ==== clipboard (Network tab copy/paste) ====================================
  const [clipboard, setClipboard] = useState(null);
  const copyConcept = useCallback((c) => setClipboard(c), []);

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  // Reuses the same pure compute functions InfluenceMetricsTab already
  // builds its charts/tables from (computeMetrics/computeAdvancedMetrics/
  // computeSystemStats/computeCategoryStats/computeCategoryMatrix, all
  // stateless functions of concepts/edges/settings) so the Export Analysis
  // Workbook button has network/category/system metrics available without
  // duplicating any of that math.
  const exportStructuralMetrics = useMemo(() => computeMetrics(concepts, edges), [concepts, edges]);
  const exportAdvancedMetrics = useMemo(() => computeAdvancedMetrics(concepts, edges, settings), [concepts, edges, settings]);
  const exportMetrics = useMemo(
    () => exportStructuralMetrics.map((m) => ({ ...m, ...exportAdvancedMetrics[m.id] })).sort((a, b) => b.centrality - a.centrality),
    [exportStructuralMetrics, exportAdvancedMetrics]
  );
  const exportSystemStats = useMemo(() => computeSystemStats(concepts, edges, exportMetrics), [concepts, edges, exportMetrics]);
  const exportCategoryStats = useMemo(() => computeCategoryStats(concepts, edges, exportMetrics), [concepts, edges, exportMetrics]);
  const exportCategoryMatrix = useMemo(
    () => computeCategoryMatrix(concepts, edges, exportCategoryStats.map((c) => c.category)),
    [concepts, edges, exportCategoryStats]
  );

  // ==== concept/edge editing ===============================================
  const addConcept = () => {
    const n = concepts.length;
    const id = uid("c");
    setConcepts((cs) => [...cs, {
      id, name: `New concept ${n + 1}`, category: "", description: "",
      initialValue: 0, currentValue: 0, position: circlePos(n, n + 1),
    }]);
    setSelected({ kind: "concept", id });
  };
  const addConceptAt = (pos) => {
    const n = concepts.length;
    const id = uid("c");
    setConcepts((cs) => [...cs, {
      id, name: `New concept ${n + 1}`, category: "", description: "",
      initialValue: 0, currentValue: 0, position: pos,
    }]);
    setSelected({ kind: "concept", id });
  };
  const pasteConcept = useCallback(() => {
    setClipboard((cb) => {
      if (!cb) return cb;
      commitHistory();
      const id = uid("c");
      const pos = cb.position ? { x: cb.position.x + 40, y: cb.position.y + 40 } : { x: 200, y: 200 };
      setConcepts((cs) => [...cs, { ...cb, id, name: `${cb.name} (copy)`, position: pos }]);
      setSelected({ kind: "concept", id });
      return cb;
    });
  }, [commitHistory]);
  const updateConcept = (id, patch) => setConcepts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeConcept = (id) => {
    const removedEdgeIds = edges.filter((e) => e.source === id || e.target === id).map((e) => e.id);
    setConcepts((cs) => cs.filter((c) => c.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setScenarios((ss) => pruneScenarioOverrides(ss, { removedConceptId: id, removedEdgeIds }));
    setSelected((s) => (s?.id === id ? null : s));
  };
  const moveConcept = useCallback((id, pos) => setConcepts((cs) => cs.map((c) => (c.id === id ? { ...c, position: pos } : c))), []);
  // Used by Auto Arrange. Commits history itself so a layout change is a
  // single undoable step, regardless of which caller triggers it.
  const applyBulkPositions = useCallback((updatedConcepts) => { commitHistory(); setConcepts(updatedConcepts); }, [commitHistory]);

  const addEdge = () => {
    if (concepts.length < 2) return;
    setEdges((es) => [...es, { id: uid("e"), source: concepts[0].id, target: concepts[1].id, weight: 0.5, description: "" }]);
  };
  const updateEdge = (id, patch) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEdge = (id) => {
    setEdges((es) => es.filter((e) => e.id !== id));
    setScenarios((ss) => pruneScenarioOverrides(ss, { removedEdgeIds: [id] }));
    setSelected((s) => (s?.id === id ? null : s));
  };
  // sourceHandle/targetHandle record exactly which side (top/right/bottom/
  // left) the user dragged from and to, so the edge renders on that side
  // instead of always auto-picking the geometrically "best" one. Edges
  // created without a manual drag (matrix paste, dropdown, import) get no
  // handle info and fall back to automatic routing.
  const createEdge = useCallback((sourceId, targetId, sourceHandle, targetHandle) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setEdges((es) => {
      const existing = es.find((e) => e.source === sourceId && e.target === targetId);
      if (existing) {
        setSelected({ kind: "edge", id: existing.id });
        return es.map((e) => (e.id === existing.id ? { ...e, sourceHandle, targetHandle } : e));
      }
      const id = uid("e");
      setSelected({ kind: "edge", id });
      return [...es, { id, source: sourceId, target: targetId, weight: 0.5, description: "", sourceHandle, targetHandle }];
    });
  }, []);

  // ==== scenarios ============================================================
  const addScenario = (type = "intervention") => {
    const id = uid("s");
    setScenarios((ss) => [...ss, { id, name: `New scenario ${ss.length}`, type, description: "", initialOverrides: {}, weightOverrides: {}, lockedConcepts: {} }]);
    setActiveScenarioId(id);
  };
  const duplicateScenario = (srcId) => {
    const src = scenarios.find((s) => s.id === srcId);
    if (!src) return;
    const id = uid("s");
    setScenarios((ss) => [...ss, { ...src, id, name: `${src.name} (copy)` }]);
    setActiveScenarioId(id);
  };
  const updateScenario = (id, patch) => setScenarios((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeScenario = (id) => {
    if (id === "baseline") return;
    setScenarios((ss) => ss.filter((s) => s.id !== id));
    setCompareIds((ids) => ids.filter((i) => i !== id));
    if (activeScenarioId === id) setActiveScenarioId("baseline");
  };

  // All four of these look up their scenario by id before touching it; none
  // of the app's own UI can currently call one with an id that's been
  // removed (a scenario is only ever acted on from its own still-rendered
  // card), but nothing enforced that invariant here, so each still
  // silently no-ops rather than throwing if that scenario is ever gone by
  // the time this runs.
  const setOverride = (scenarioId, conceptId, value) => {
    const s = scenarios.find((s) => s.id === scenarioId);
    if (!s) return;
    updateScenario(scenarioId, {
      initialOverrides: { ...s.initialOverrides, [conceptId]: value },
    });
  };
  const clearOverride = (scenarioId, conceptId) => {
    const s = scenarios.find((s) => s.id === scenarioId);
    if (!s) return;
    const next = { ...s.initialOverrides };
    delete next[conceptId];
    updateScenario(scenarioId, { initialOverrides: next });
  };
  const toggleLock = (scenarioId, conceptId, value) => {
    const s = scenarios.find((s) => s.id === scenarioId);
    if (!s) return;
    const next = { ...s.lockedConcepts };
    if (next[conceptId] !== undefined) delete next[conceptId]; else next[conceptId] = value;
    updateScenario(scenarioId, { lockedConcepts: next });
  };
  const setDriver = (scenarioId, conceptId, direction) => {
    const s = scenarios.find((s) => s.id === scenarioId);
    if (!s) return;
    const isSameDriver = s.lockedConcepts?.[conceptId] === direction && s.initialOverrides?.[conceptId] === direction;
    if (isSameDriver) {
      const nextOv = { ...s.initialOverrides }; delete nextOv[conceptId];
      const nextLocked = { ...s.lockedConcepts }; delete nextLocked[conceptId];
      updateScenario(scenarioId, { initialOverrides: nextOv, lockedConcepts: nextLocked });
    } else {
      updateScenario(scenarioId, {
        initialOverrides: { ...s.initialOverrides, [conceptId]: direction },
        lockedConcepts: { ...s.lockedConcepts, [conceptId]: direction },
      });
    }
  };

  // ==== run ==================================================================
  const runAll = useCallback(() => {
    const ids = ["baseline", ...compareIds.filter((i) => i !== "baseline")];
    const next = {};
    ids.forEach((id) => {
      const sc = scenarios.find((s) => s.id === id);
      if (sc) next[id] = simulate(concepts, edges, sc, settings);
    });
    setResults(next);
    setResultsSignatureAtRun(resultsSimSignature);
    const activeResult = next[activeScenarioId] || next["baseline"];
    if (activeResult) {
      setConcepts((cs) => cs.map((c) => ({ ...c, currentValue: activeResult.final[c.id] ?? c.currentValue })));
    }
  }, [concepts, edges, scenarios, compareIds, settings, activeScenarioId, resultsSimSignature]);

  const resetActivation = () => {
    setConcepts((cs) => cs.map((c) => ({ ...c, currentValue: c.initialValue })));
    setResults({});
    setResultsSignatureAtRun(null);
  };

  const toggleCompare = (id) => setCompareIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  // ==== import / export ======================================================
  const exportModel = () => {
    const payload = { concepts, edges, scenarios, settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "spaghetti-engine-model.json";
    a.click();
  };
  const importModel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.concepts) setConcepts(data.concepts);
        if (data.edges) setEdges(data.edges);
        if (data.scenarios) setScenarios(data.scenarios);
        if (data.settings) setSettings(data.settings);
        // An imported model has no relationship to whatever was analyzed
        // before it: clear every cached analysis result/chart so a stale
        // result from the PREVIOUS model can't silently end up in an
        // Export Analysis Workbook run against this new one.
        setResults({});
        setResultsSignatureAtRun(null);
        setBaselineResult(null);
        setSensitivityResult(null);
        setTransitionResult(null);
        setChartCache({});
      } catch (err) { alert("Could not read that file as a valid FCM model."); }
    };
    reader.readAsText(file);
  };
  const exportComparisonCSV = () => {
    const ids = ["baseline", ...compareIds.filter((i) => i !== "baseline")];
    const header = ["Concept", ...ids.map((id) => scenarios.find((s) => s.id === id)?.name || id)];
    const rows = concepts.map((c) => [
      c.name, ...ids.map((id) => results[id]?.final?.[c.id] !== undefined ? round2(results[id].final[c.id]) : ""),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "scenario-comparison.csv";
    a.click();
  };

  const exportAnalysisWorkbook = async () => {
    setExportingWorkbook(true);
    try {
      const buffer = await buildAnalysisWorkbook({
        concepts, edges, settings, scenarios, results,
        baselineResult, sensitivityResult, transitionResult,
        metrics: exportMetrics, systemStats: exportSystemStats,
        categoryStats: exportCategoryStats, categoryMatrix: exportCategoryMatrix,
        chartCache, modelVersion, resultsStale,
      });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "spaghetti-engine-analysis-workbook.xlsx";
      a.click();
    } catch (err) {
      alert("Could not build the analysis workbook: " + (err?.message || err));
    } finally {
      setExportingWorkbook(false);
    }
  };

  const buildFromMatrix = () => {
    setMatrixError(null);
    setMatrixSuccess(null);
    try {
      const { concepts: newConcepts, edges: newEdges } = parseAdjacencyMatrix(matrixText);
      if (newConcepts.length === 0) throw new Error("No concepts found in the pasted matrix.");
      setConcepts(newConcepts);
      setEdges(newEdges);
      setScenarios([{ id: "baseline", name: "Baseline", type: "baseline", description: "", initialOverrides: {}, weightOverrides: {}, lockedConcepts: {} }]);
      setActiveScenarioId("baseline");
      setCompareIds([]);
      setResults({});
      setResultsSignatureAtRun(null);
      // This replaces the whole model, so any previously-run baseline/
      // sensitivity/transition analysis (and its cached chart) described a
      // now-gone model and would be actively misleading if left in place
      // for the next Export Analysis Workbook.
      setBaselineResult(null);
      setSensitivityResult(null);
      setTransitionResult(null);
      setChartCache({});
      setSelected(null);
      setMatrixSuccess(`Built ${newConcepts.length} concepts and ${newEdges.length} relationships.`);
    } catch (err) {
      setMatrixError(err.message || "Couldn't parse that as a matrix.");
    }
  };

  const loadTemplate = (kind) => {
    const t = makeTemplate(kind);
    setConcepts(t.concepts);
    setEdges(t.edges);
    setScenarios([{ id: "baseline", name: "Baseline", type: "baseline", description: "", initialOverrides: {}, weightOverrides: {}, lockedConcepts: {} }]);
    setActiveScenarioId("baseline");
    setCompareIds([]);
    setResults({});
    setResultsSignatureAtRun(null);
    setBaselineResult(null);
    setSensitivityResult(null);
    setTransitionResult(null);
    setChartCache({});
    setSelected(null);
    setHistoryPast([]);
    setHistoryFuture([]);
  };

  const componentChangeData = useMemo(() => {
    if (compareIds.length !== 1) return null;
    const base = results.baseline;
    const scen = results[compareIds[0]];
    if (!base || !scen) return null;
    return concepts
      .map((c) => ({ name: c.name, change: round2(((scen.final[c.id] ?? 0) - (base.final[c.id] ?? 0)) * 100) }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  }, [compareIds, results, concepts]);

  // Baseline / scenario / difference time series, aligned iteration-by-
  // iteration. Once a run converges its series stops growing, so the
  // shorter run's last value is held flat for any iteration beyond its own
  // length (it has, in effect, already reached its resting state there).
  const trajectoryComparison = useMemo(() => {
    if (compareIds.length !== 1) return null;
    const base = results.baseline;
    const scen = results[compareIds[0]];
    if (!base || !scen) return null;
    const valueAt = (series, i, id) => (series[Math.min(i, series.length - 1)]?.values[id] ?? 0);
    const maxLen = Math.max(base.series.length, scen.series.length);
    const baseline = [], scenario = [], difference = [];
    for (let i = 0; i < maxLen; i++) {
      const rowB = { iteration: i }, rowS = { iteration: i }, rowD = { iteration: i };
      concepts.forEach((c) => {
        const bv = valueAt(base.series, i, c.id);
        const sv = valueAt(scen.series, i, c.id);
        rowB[c.id] = round2(bv);
        rowS[c.id] = round2(sv);
        rowD[c.id] = round2(sv - bv);
      });
      baseline.push(rowB); scenario.push(rowS); difference.push(rowD);
    }
    return { baseline, scenario, difference };
  }, [compareIds, results, concepts]);

  const selectedConcept = selected?.kind === "concept" ? concepts.find((c) => c.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) : null;

  const highlightConcept = useCallback((id) => setSelected({ kind: "concept", id }), []);

  const TabButton = ({ id, icon: Icon, children }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        tab === id ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <Icon size={15} /> {children}
    </button>
  );

  return (
    <div className="w-full h-full min-h-[820px] bg-white text-slate-800 flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-900 text-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-teal-500 flex items-center justify-center font-bold text-sm">SE</div>
          <span className="font-semibold tracking-tight">The Spaghetti Engine</span>
          <span className="text-xs text-slate-400 ml-2">Visual System Modelling Workspace</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => e.target.value && loadTemplate(e.target.value)}
            defaultValue=""
            className="bg-slate-800 text-xs text-slate-200 rounded px-2 py-1.5 border border-slate-700"
          >
            <option value="" disabled>Load template…</option>
            <option value="blank">Blank model</option>
            <option value="agriculture">Sustainable agriculture</option>
            <option value="energy">Energy transition</option>
          </select>
          <Btn
            variant="outline" className="!text-slate-200 !border-slate-600 hover:!bg-slate-800"
            onClick={exportAnalysisWorkbook} disabled={exportingWorkbook}
            title="Builds one .xlsx workbook with the model structure, network metrics, baseline equilibrium, and every scenario/analysis that's been run"
          >
            <Table2 size={14} />{exportingWorkbook ? "Building workbook…" : "Export Analysis Workbook"}
          </Btn>
          <Btn variant="outline" className="!text-slate-200 !border-slate-600 hover:!bg-slate-800" onClick={exportModel}><Download size={14} />Export JSON</Btn>
          <Btn variant="outline" className="!text-slate-200 !border-slate-600 hover:!bg-slate-800" onClick={() => fileInputRef.current?.click()}><Upload size={14} />Import</Btn>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importModel} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-5 bg-white overflow-x-auto">
        <TabButton id="editor" icon={Table2}>Model editor</TabButton>
        <TabButton id="network" icon={Share2}>Network</TabButton>
        <TabButton id="metrics" icon={BarChart3}>Influence Metrics</TabButton>
        <TabButton id="equilibrium" icon={Activity}>Baseline Equilibrium</TabButton>
        <TabButton id="scenarios" icon={GitCompare}>Scenarios & Simulation</TabButton>
        <TabButton id="sensitivity" icon={SlidersHorizontal}>Sensitivity Analysis</TabButton>
        <TabButton id="transition" icon={TrendingUp}>Transition Point Analysis</TabButton>
      </div>

      <div className="flex-1 overflow-auto p-5 bg-slate-50">
        {/* ============================= EDITOR ============================= */}
        {tab === "editor" && (
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <button onClick={() => setShowMatrixPanel((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold w-full text-left">
                <ClipboardPaste size={15} className="text-teal-700" />
                Build from an adjacency matrix
                {showMatrixPanel ? <ChevronDown size={14} className="ml-auto text-slate-400" /> : <ChevronRight size={14} className="ml-auto text-slate-400" />}
              </button>
              {showMatrixPanel && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-slate-500">
                    Copy a square weight matrix out of Excel (concept names as both column headers and row labels, cell [row, col] = weight of the edge <em>row → col</em>) and paste it below. This <strong>replaces</strong> the current model.
                  </p>
                  <textarea
                    value={matrixText}
                    onChange={(e) => setMatrixText(e.target.value)}
                    placeholder={"Paste directly from Excel, e.g.:\n\t Concept A\tConcept B\tConcept C\nConcept A\t0\t0.5\t0\nConcept B\t-0.25\t0\t0.5\nConcept C\t0\t0\t0"}
                    className="w-full h-32 text-xs font-mono border border-slate-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <div className="flex items-center gap-2">
                    <Btn onClick={buildFromMatrix} disabled={!matrixText.trim()}><ClipboardPaste size={13} />Build model from matrix</Btn>
                    {matrixError && <span className="text-xs text-rose-600">{matrixError}</span>}
                    {matrixSuccess && <span className="text-xs text-teal-700 flex items-center gap-1"><Check size={12} />{matrixSuccess}</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-xs text-teal-800">
              Prefer building visually? The <button onClick={() => setTab("network")} className="underline font-medium">Network tab</button> is now the primary way to create and edit concepts and relationships by dragging on a canvas (this table view is for bulk review and editing).
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <button onClick={() => setShowInitialValueHelp((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold w-full text-left">
                <HelpCircle size={15} className="text-teal-700" />
                How to set each concept's "Initial" value
                {showInitialValueHelp ? <ChevronDown size={14} className="ml-auto text-slate-400" /> : <ChevronRight size={14} className="ml-auto text-slate-400" />}
              </button>
              {showInitialValueHelp && (
                <div className="mt-3 space-y-2.5 text-xs text-slate-600">
                  <p>This is <strong>A(0)</strong>: each concept's activation at the start of a run, on the same -1 (fully suppressed) to +1 (fully active) scale as relationship weights. It's what the <button onClick={() => setTab("equilibrium")} className="underline font-medium text-teal-700">Baseline Equilibrium tab</button> starts from.</p>

                  <p><strong>Important: all-zero will always stay at zero.</strong> If every concept is set to 0 here, the Baseline Equilibrium run cannot move away from zero, no matter how strong or complex the causal weights are. This isn't a limit of this app; it's a mathematical property of the tanh/sigmoid update rule itself, since tanh(0) = sigmoid(0) = 0: with nothing pushing a concept away from zero, the model has no way to activate itself from nothing. Use this "all zeros" setup only when you specifically want that structural check ("could this network run away on its own from total rest, e.g. because of a strong self-reinforcing loop") rather than a realistic system state.</p>

                  <p><strong>For a meaningful, non-trivial baseline equilibrium: give at least the currently-active concepts a real starting value</strong>, reflecting the stakeholder-elicited or observed current state of the system, on the same -1 to +1 scale used for weights (e.g. "already strongly present" -&gt; +0.75 to +1; "moderately present" -&gt; +0.25 to +0.5; "actively suppressed" -&gt; negative). This is what produces an equilibrium that actually diverges from zero: the model's own structure then carries those starting conditions forward to wherever the causal relationships settle.</p>

                  <p><strong>Don't use this field to test interventions or policies</strong> once you have a meaningful baseline set up. Setting AIP's initial value to +1 to see "what if agricultural pressure were maxed out" changes what the baseline itself represents, so it stops being a clean reference to compare against. For that, use the <button onClick={() => setTab("scenarios")} className="underline font-medium text-teal-700">Scenarios &amp; Simulation tab</button> instead: its driver controls (▲/▼) hold a concept at full activation for a whole run without touching these baseline values, and every scenario there is automatically compared back against this baseline.</p>

                  <p className="text-slate-400">After setting values here, open Baseline Equilibrium and click Run. With any concept away from zero, expect a multi-iteration trace toward wherever the structure settles; with everything still at zero, expect immediate convergence back to zero, exactly as described above, and the diagnostics panel there will say so explicitly.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Concepts ({concepts.length})</h3>
                <Btn onClick={addConcept}><Plus size={14} />Add concept</Btn>
              </div>
              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {concepts.length === 0 && <p className="text-sm text-slate-400 italic">No concepts yet: add one, paste a matrix above, or load a template above.</p>}
                {concepts.map((c) => (
                  <div key={c.id} className="border border-slate-200 rounded-md p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={c.name}
                        onChange={(e) => updateConcept(c.id, { name: e.target.value })}
                        className="flex-1 text-sm font-medium border-none focus:outline-none focus:ring-1 focus:ring-teal-500 rounded px-1"
                      />
                      <span className="text-[10px] font-mono text-slate-400">{c.id}</span>
                      <button onClick={() => removeConcept(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        placeholder="category (optional)"
                        value={c.category || ""}
                        onChange={(e) => updateConcept(c.id, { category: e.target.value })}
                        className="text-xs flex-1 border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <label className="text-[11px] text-slate-500">Initial</label>
                      <input
                        type="number" min={-1} max={1} step={0.05} value={c.initialValue}
                        onChange={(e) => updateConcept(c.id, { initialValue: clamp(parseFloat(e.target.value) || 0) })}
                        className="w-16 text-xs border border-slate-200 rounded px-1.5 py-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Relationships ({edges.length})</h3>
                <Btn onClick={addEdge} disabled={concepts.length < 2}><Plus size={14} />Add relationship</Btn>
              </div>
              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {edges.length === 0 && <p className="text-sm text-slate-400 italic">No relationships yet.</p>}
                {edges.map((e) => (
                  <div key={e.id} className="border border-slate-200 rounded-md p-2.5">
                    <div className="flex items-center gap-2 mb-2">
                      <select value={e.source} onChange={(ev) => updateEdge(e.id, { source: ev.target.value })} className="text-xs border border-slate-200 rounded px-1 py-1 flex-1">
                        {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <ChevronRight size={14} className="text-slate-400 shrink-0" />
                      <select value={e.target} onChange={(ev) => updateEdge(e.id, { target: ev.target.value })} className="text-xs border border-slate-200 rounded px-1 py-1 flex-1">
                        {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button onClick={() => removeEdge(e.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
                    </div>
                    <WeightSlider value={e.weight} onChange={(v) => updateEdge(e.id, { weight: v })} />
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>
        )}

        {/* ============================= NETWORK ============================= */}
        {tab === "network" && (
          <NetworkTab
            concepts={concepts} edges={edges} selected={selected} setSelected={setSelected}
            updateConcept={updateConcept} updateEdge={updateEdge} removeConcept={removeConcept} removeEdge={removeEdge}
            moveConcept={moveConcept} addConceptAt={addConceptAt} createEdge={createEdge} applyBulkPositions={applyBulkPositions}
            commitHistory={commitHistory} undo={undo} redo={redo} canUndo={historyPast.length > 0} canRedo={historyFuture.length > 0}
            copyConcept={copyConcept} pasteConcept={pasteConcept} hasClipboard={!!clipboard}
            hasRun={Object.keys(results).length > 0}
            setChartCache={setChartCache}
          />
        )}

        {/* ============================= INFLUENCE METRICS ============================= */}
        {tab === "metrics" && (
          <InfluenceMetricsTab concepts={concepts} edges={edges} settings={settings} onHighlight={highlightConcept} setChartCache={setChartCache} />
        )}

        {/* ============================= BASELINE EQUILIBRIUM ============================= */}
        {tab === "equilibrium" && (
          <BaselineEquilibriumTab concepts={concepts} edges={edges} scenarios={scenarios} settings={settings} setTab={setTab} result={baselineResult} setResult={setBaselineResult} setChartCache={setChartCache} modelVersion={modelVersion} />
        )}

        {/* ============================= SCENARIOS ============================= */}
        {tab === "scenarios" && (
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <button onClick={() => setShowScenarioHelp((v) => !v)} className="flex items-center gap-1.5 text-sm font-semibold w-full text-left">
                <HelpCircle size={15} className="text-teal-700" />
                What-If Scenario Analysis: how it works
                {showScenarioHelp ? <ChevronDown size={14} className="ml-auto text-slate-400" /> : <ChevronRight size={14} className="ml-auto text-slate-400" />}
              </button>
              {showScenarioHelp && (
                <div className="mt-3 space-y-3 text-xs text-slate-600">
                  <div className="space-y-2.5">
                    <p>A <ScenarioTerm term="Scenario">scenario</ScenarioTerm> is a "what if" copy of your model: the same concepts and causal relationships, but with one or more <ScenarioTerm term="Intervention">interventions</ScenarioTerm> applied, such as holding a concept at a fixed value or changing a relationship's strength. Running it re-computes where the system settles, reaching its new <ScenarioTerm term="Equilibrium">equilibrium</ScenarioTerm>, and compares that against the baseline.</p>
                    <p>Scenario analysis is useful because it lets you test a policy option, a shock, or a combination of measures entirely inside the model before anything is implemented in reality: does strengthening this driver actually move the outcome you care about, and by how much, given everything else the model says influences it?</p>
                    <p>When interpreting results, look at the <ScenarioTerm term="Effect Size">effect size</ScenarioTerm> for each concept (how far it moved from baseline), whether interventions combine with <ScenarioTerm term="Synergy">synergy</ScenarioTerm> or work against each other as a <ScenarioTerm term="Trade-Off">trade-off</ScenarioTerm>, and whether the run actually reached a stable equilibrium or was still changing when it stopped.</p>
                    <p className="text-slate-400"><strong>Results do not predict the future.</strong> They show what this specific causal structure, as you've defined it, implies under the assumptions you set, not a forecast of what will actually happen. Treat scenario output as a tool for reasoning about the system's structure and stakeholders' shared understanding of it, not as a prediction.</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <p className="font-medium text-slate-700 mb-1.5">Typical workflow</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Make sure the baseline (no intervention) reflects a meaningful starting state; see the Model Editor's guidance on setting initial values.</li>
                      <li>Click <strong>New</strong> to create a scenario, or <strong>Duplicate</strong> an existing one as a starting point.</li>
                      <li>Give it a name and a short description of the policy or shock it represents.</li>
                      <li>Apply your intervention(s): lock a concept's value, override an initial value, or adjust a relationship's weight.</li>
                      <li>Tick <strong>compare</strong> on the scenarios you want side-by-side, then run the simulation.</li>
                      <li>Read the comparison table and chart: check convergence, effect sizes, and whether concepts moved together (synergy) or in opposite directions (trade-off).</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

          <div className="grid grid-cols-[300px_1fr] gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Scenarios</h3>
              </div>
              <div className="flex gap-1.5 mb-3 flex-wrap">
                <Btn variant="outline" onClick={() => addScenario("intervention")}><Plus size={13} />New</Btn>
                <Btn variant="outline" onClick={() => duplicateScenario(activeScenarioId)}>Duplicate</Btn>
              </div>
              <div className="space-y-1.5">
                {scenarios.map((s) => (
                  <div key={s.id} className={`rounded-md border p-2 cursor-pointer ${activeScenarioId === s.id ? "border-teal-600 bg-teal-50" : "border-slate-200"}`} onClick={() => setActiveScenarioId(s.id)}>
                    <div className="flex items-center justify-between">
                      <input
                        value={s.name}
                        onChange={(e) => updateScenario(s.id, { name: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm bg-transparent font-medium flex-1 focus:outline-none"
                      />
                      <label className="flex items-center gap-1 text-[10px] text-slate-500" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => toggleCompare(s.id)} /> compare
                      </label>
                      {s.id !== "baseline" && (
                        <button onClick={(e) => { e.stopPropagation(); removeScenario(s.id); }} className="text-slate-300 hover:text-red-500 ml-1"><Trash2 size={12} /></button>
                      )}
                    </div>
                    <select
                      value={s.type} onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateScenario(s.id, { type: e.target.value })}
                      className="text-[10px] text-slate-500 mt-1 bg-transparent"
                    >
                      <option value="baseline">baseline</option>
                      <option value="intervention">intervention</option>
                      <option value="shock">shock</option>
                      <option value="policy_bundle">policy bundle</option>
                    </select>
                    <input
                      value={s.description || ""}
                      placeholder="Short description (used in the exported workbook)"
                      onChange={(e) => updateScenario(s.id, { description: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 text-[11px] bg-transparent text-slate-500 placeholder:text-slate-300 focus:outline-none border-b border-transparent focus:border-slate-200"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <details>
                  <summary className="text-xs font-medium text-slate-500 cursor-pointer">Advanced options</summary>
                  <p className="text-[11px] text-slate-400 mt-2 mb-1">
                    These govern how every simulation in this app runs (Scenarios &amp; Simulation, Sensitivity Analysis, Transition Point Analysis, and the structural Influence/Sensitivity scores on the Influence Metrics tab), and are recorded exactly as set here in anything you export. Hover <HelpCircle size={10} className="inline text-slate-300" /> on any setting for what it does.
                  </p>
                  <div className="mt-2 space-y-2">
                    <label className="text-xs text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-1" title="The simulation stops after this many iterations even if it hasn't converged. Higher values let a slowly-converging or oscillating model keep running longer before being cut off, at the cost of a slower run.">Max iterations <HelpCircle size={10} className="text-slate-300" /></span>
                      <input type="number" value={settings.maxIterations} onChange={(e) => setSettings((s) => ({ ...s, maxIterations: parseInt(e.target.value) || 100 }))} className="w-16 border border-slate-200 rounded px-1 text-xs" />
                    </label>
                    <label className="text-xs text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-1" title="The run is considered converged, and stops, once the largest change in any concept's activation from one iteration to the next drops below this value. A smaller threshold demands a more precise, closer-to-exact equilibrium before stopping.">Convergence threshold <HelpCircle size={10} className="text-slate-300" /></span>
                      <input type="number" step={0.0001} value={settings.convergenceThreshold} onChange={(e) => setSettings((s) => ({ ...s, convergenceThreshold: parseFloat(e.target.value) || 0.001 }))} className="w-16 border border-slate-200 rounded px-1 text-xs" />
                    </label>
                    <label className="text-xs text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-1" title="Synchronous: every concept updates at once, each computed purely from the PREVIOUS iteration's values; the standard FCM update, and the only mode that gives a reproducible result for a given model. Asynchronous: concepts update one at a time in a randomly shuffled order each iteration, each seeing already-updated values from earlier in that same pass, so results can differ between runs of the identical model.">Update mode <HelpCircle size={10} className="text-slate-300" /></span>
                      <select value={settings.mode} onChange={(e) => setSettings((s) => ({ ...s, mode: e.target.value }))} className="text-xs border border-slate-200 rounded px-1">
                        <option value="synchronous">synchronous</option>
                        <option value="asynchronous">asynchronous</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-1" title="Relative (adds to current state): A(t+1) = squash(A(t) + W·A(t)); each concept's new value builds on top of where it currently is, the standard FCM formulation this app uses by default. Absolute (from inputs only): A(t+1) = squash(W·A(t)); each concept's new value comes purely from incoming influences, discarding its own previous value entirely (the original Kosko FCM rule).">Update rule <HelpCircle size={10} className="text-slate-300" /></span>
                      <select value={settings.updateRule} onChange={(e) => setSettings((s) => ({ ...s, updateRule: e.target.value }))} className="text-xs border border-slate-200 rounded px-1">
                        <option value="relative">Relative (adds to current state)</option>
                        <option value="absolute">Absolute (from inputs only)</option>
                      </select>
                    </label>
                    <label className="text-xs text-slate-500 flex justify-between items-center">
                      <span className="flex items-center gap-1" title="Maps a concept's total incoming influence onto the -1..+1 activation scale. Hyperbolic tangent: smooth and symmetric, tanh(x), with gain 1 at zero. Sigmoid: smooth and symmetric, 2/(1+e^-λx)-1, but with gain 0.5 at zero, half as responsive to weak signals as tanh, so the same weights can settle at a different, sometimes zero, equilibrium under each. Trivalent (step): a hard threshold that snaps straight to -1, 0, or +1 with no smooth transition.">Squashing function <HelpCircle size={10} className="text-slate-300" /></span>
                      <select value={settings.squashFunction} onChange={(e) => setSettings((s) => ({ ...s, squashFunction: e.target.value }))} className="text-xs border border-slate-200 rounded px-1">
                        <option value="tanh">Hyperbolic tangent</option>
                        <option value="sigmoid">Sigmoid</option>
                        <option value="trivalent">Trivalent (step)</option>
                      </select>
                    </label>
                    {settings.squashFunction !== "trivalent" && (
                      <label className="text-xs text-slate-500 flex justify-between items-center">
                        <span className="flex items-center gap-1" title="Multiplies a concept's total incoming influence before it's passed through the squashing function, controlling how sharply activation responds. Higher values make the model behave more like a step function (fast transitions between -1 and +1 for a given change in influence); lower values make it respond more gradually to the same influence. Not shown for Trivalent, which is already a hard step regardless of this.">λ (steepness) <HelpCircle size={10} className="text-slate-300" /></span>
                        <input
                          type="number" step={0.1} min={0.1} max={10} value={settings.lambda}
                          onChange={(e) => setSettings((s) => ({ ...s, lambda: parseFloat(e.target.value) || 1 }))}
                          className="w-16 border border-slate-200 rounded px-1 text-xs"
                        />
                      </label>
                    )}
                  </div>
                </details>
              </div>

              <div className="flex gap-2 mt-4">
                <Btn variant="accent" onClick={runAll}><Play size={14} />Run simulation</Btn>
                <Btn variant="ghost" onClick={resetActivation}><RotateCcw size={14} />Reset</Btn>
              </div>
            </div>

            <div className="space-y-5">
              {/* editing overrides for the active scenario */}
              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-sm mb-1">Editing: {activeScenario?.name}</h3>
                <p className="text-xs text-slate-400 mb-3">
                  Mark a concept as a <strong>driver</strong> (▲ increase / ▼ decrease) the way Mental Modeler scenarios work: it's forced to full activation (+1 / -1) and held there for the entire run. Or set a custom starting value for finer-grained control, and lock it independently if you want it held fixed too.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {concepts.map((c) => {
                    const ov = activeScenario?.initialOverrides?.[c.id];
                    const locked = activeScenario?.lockedConcepts?.[c.id] !== undefined;
                    const isIncreaseDriver = locked && activeScenario?.lockedConcepts?.[c.id] === 1 && ov === 1;
                    const isDecreaseDriver = locked && activeScenario?.lockedConcepts?.[c.id] === -1 && ov === -1;
                    return (
                      <div key={c.id} className="border border-slate-200 rounded p-2 flex items-center gap-1.5">
                        <span className="text-xs flex-1 truncate">{c.name}</span>
                        <button
                          onClick={() => setDriver(activeScenario.id, c.id, 1)}
                          title="Driver: increase (locked at +1)"
                          className={`text-[10px] w-5 h-5 rounded border leading-none ${isIncreaseDriver ? "border-teal-700 bg-teal-50 text-teal-800" : "border-slate-200 text-slate-400 hover:border-slate-400"}`}
                        >▲</button>
                        <button
                          onClick={() => setDriver(activeScenario.id, c.id, -1)}
                          title="Driver: decrease (locked at −1)"
                          className={`text-[10px] w-5 h-5 rounded border leading-none ${isDecreaseDriver ? "border-rose-600 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-400 hover:border-slate-400"}`}
                        >▼</button>
                        <input
                          type="number" step={0.05} min={-1} max={1}
                          placeholder={String(c.initialValue)}
                          value={ov ?? ""}
                          onChange={(e) => e.target.value === "" ? clearOverride(activeScenario.id, c.id) : setOverride(activeScenario.id, c.id, clamp(parseFloat(e.target.value)))}
                          className="w-14 text-xs border border-slate-200 rounded px-1 py-0.5"
                        />
                        <button onClick={() => toggleLock(activeScenario.id, c.id, ov ?? c.initialValue)} title="Lock this value for the whole run" className={locked ? "text-teal-700" : "text-slate-300 hover:text-slate-500"}>
                          {locked ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* comparison */}
              {compareIds.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-4" data-chart="scenario-comparison">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">Comparison to baseline</h3>
                    <Btn variant="outline" onClick={exportComparisonCSV} disabled={!Object.keys(results).length}><Download size={13} />Export CSV</Btn>
                  </div>
                  {!Object.keys(results).length ? (
                    <p className="text-xs text-slate-400 italic">Run the simulation to see results here.</p>
                  ) : (
                    <>
                      {resultsStale && <div className="mb-3"><StaleResultBanner label="this comparison" /></div>}
                      <div className="w-full h-64 mb-4">
                        <ResponsiveContainer>
                          <BarChart data={concepts.map((c) => {
                            const row = { name: c.id };
                            ["baseline", ...compareIds].forEach((id) => {
                              row[scenarios.find((s) => s.id === id)?.name || id] = results[id] ? round2(results[id].final[c.id]) : 0;
                            });
                            return row;
                          })}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis domain={[-1, 1]} tick={{ fontSize: 10 }} />
                            <RTooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke="#94a3b8" />
                            <Bar dataKey="Baseline" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                            {compareIds.map((id, i) => (
                              <Bar key={id} dataKey={scenarios.find((s) => s.id === id)?.name || id} fill={["#0f766e", "#c2410c", "#7c3aed", "#0369a1"][i % 4]} radius={[3, 3, 0, 0]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-100">
                            <th className="py-1 font-medium">Concept</th>
                            <th className="py-1 font-medium">Baseline</th>
                            {compareIds.map((id) => <th key={id} className="py-1 font-medium">{scenarios.find((s) => s.id === id)?.name}</th>)}
                            {compareIds.length === 1 && <th className="py-1 font-medium">Δ</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {concepts.map((c) => {
                            const b = results.baseline?.final?.[c.id];
                            return (
                              <tr key={c.id} className="border-b border-slate-50">
                                <td className="py-1">{c.name}</td>
                                <td className="py-1 font-mono">{b !== undefined ? round2(b).toFixed(2) : "n/a"}</td>
                                {compareIds.map((id) => {
                                  const v = results[id]?.final?.[c.id];
                                  return <td key={id} className="py-1 font-mono">{v !== undefined ? round2(v).toFixed(2) : "n/a"}</td>;
                                })}
                                {compareIds.length === 1 && (
                                  <td className="py-1 font-mono">
                                    {b !== undefined && results[compareIds[0]]?.final?.[c.id] !== undefined
                                      ? (results[compareIds[0]].final[c.id] - b >= 0 ? "+" : "") + round2(results[compareIds[0]].final[c.id] - b).toFixed(2)
                                      : "n/a"}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {trajectoryComparison && (
                        <div className="mt-5 pt-4 border-t border-slate-100 space-y-4">
                          <h4 className="text-sm font-semibold flex items-center gap-1.5"><Activity size={14} className="text-teal-700" />Trajectory comparison</h4>
                          <p className="text-xs text-slate-400">
                            The baseline is always computed and shown alongside every scenario run. Baseline (no scenario applied) and "{scenarios.find((s) => s.id === compareIds[0])?.name}", iteration by iteration, plus their difference (scenario minus baseline).
                          </p>
                          {[
                            { key: "baseline", title: "Baseline (time series)" },
                            { key: "scenario", title: `${scenarios.find((s) => s.id === compareIds[0])?.name} (time series)` },
                            { key: "difference", title: "Difference (scenario minus baseline)" },
                          ].map(({ key, title }) => (
                            <div key={key}>
                              <div className="text-xs font-medium text-slate-600 mb-1">{title}</div>
                              <div className="w-full h-52">
                                <ResponsiveContainer>
                                  <LineChart data={trajectoryComparison[key]}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                    <XAxis dataKey="iteration" tick={{ fontSize: 9 }} />
                                    <YAxis domain={key === "difference" ? ["auto", "auto"] : [-1, 1]} tick={{ fontSize: 9 }} />
                                    <RTooltip />
                                    <ReferenceLine y={0} stroke="#cbd5e1" />
                                    {concepts.map((c, i) => (
                                      <Line key={c.id} type="monotone" dataKey={c.id} name={c.name} stroke={["#0f766e", "#c2410c", "#7c3aed", "#0369a1", "#be123c", "#4d7c0f", "#a16207", "#0e7490"][i % 8]} strokeWidth={1.5} dot={false} />
                                    ))}
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {componentChangeData && (
                        <div className="mt-5 pt-4 border-t border-slate-100">
                          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5"><GitCompare size={14} className="text-teal-700" />Component change vs. baseline</h4>
                          <p className="text-xs text-slate-400 mb-3">
                            Mental-Modeler-style output: each concept's equilibrium activation under "{scenarios.find((s) => s.id === compareIds[0])?.name}", expressed in percentage points of the full −100%…+100% activation range, relative to baseline. Sorted by magnitude of change.
                          </p>
                          <div className="w-full" style={{ height: Math.max(200, componentChangeData.length * 26) }}>
                            <ResponsiveContainer>
                              <BarChart data={componentChangeData} layout="vertical" margin={{ left: 8, right: 24 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                {/* A concept swinging from fully negative to fully positive is a
                                    200-point change, past a fixed [-100,100] domain (confirmed
                                    reproducible: Biodiversity decline swung -194 points in this
                                    session's own agriculture-template test), which silently clipped
                                    the bar. Same dataMin/dataMax-expanding pattern already used for
                                    the Sensitivity curves' YAxis below: -100..100 stays the default
                                    view for ordinary changes, and only expands when the data actually
                                    needs it, so nothing is ever cut off. */}
                                <XAxis type="number" domain={[(dataMin) => Math.min(-100, dataMin - 10), (dataMax) => Math.max(100, dataMax + 10)]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10 }} />
                                <RTooltip formatter={(v) => [`${v > 0 ? "+" : ""}${v}%`, "Change"]} />
                                <ReferenceLine x={0} stroke="#94a3b8" />
                                <Bar dataKey="change" radius={[0, 3, 3, 0]}>
                                  {componentChangeData.map((d) => (
                                    <Cell key={d.name} fill={d.change >= 0 ? "#16a34a" : "#dc2626"} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* ============================= SENSITIVITY ANALYSIS ============================= */}
        {tab === "sensitivity" && (
          <SensitivityAnalysisTab
            concepts={concepts} edges={edges} scenarios={scenarios} activeScenarioId={activeScenarioId} settings={settings}
            result={sensitivityResult} setResult={setSensitivityResult} setChartCache={setChartCache} modelVersion={modelVersion}
          />
        )}

        {/* ============================= TRANSITION POINT ANALYSIS ============================= */}
        {tab === "transition" && (
          <TransitionPointAnalysisTab
            concepts={concepts} edges={edges} scenarios={scenarios} activeScenarioId={activeScenarioId} settings={settings}
            result={transitionResult} setResult={setTransitionResult} setChartCache={setChartCache} modelVersion={modelVersion}
          />
        )}
      </div>

      <div className="px-5 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-400 flex items-center gap-1.5">
        <Info size={12} /> Prototype scope: client-side only, in-memory (nothing persists on reload), Monte Carlo and PDF/DOCX/PPTX export are not yet implemented. See the development roadmap for what a full build adds.
      </div>
    </div>
  );
}
