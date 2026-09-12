import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Play, RotateCcw, Download, Upload, GitCompare,
  Table2, Share2, ChevronDown, ChevronRight,
  X, Lock, Unlock, Info, ClipboardPaste, Check,
  Undo2, Redo2, Copy, Maximize2, HelpCircle, SlidersHorizontal,
  BarChart3, LayoutGrid, GitBranch, Shuffle, MousePointer2, Activity, FlaskConical, TrendingUp,
  Eye, EyeOff, Route, Layers,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, ReferenceLine, Brush, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath,
  MarkerType, useReactFlow, useInternalNode, useViewport, useConnection,
  useUpdateNodeInternals,
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
      ["AIP", "Agricultural intensification pressure", "Food"],
      ["CSW", "Climate-driven soil-water stress", "Water"],
      ["GSN", "Groundwater & surface-water pollution", "Water"],
      ["HLA", "Habitat loss & degradation", "Ecosystems"],
      ["EVF", "Economic vulnerability of farming", "Economy"],
      ["BD", "Biodiversity decline", "Ecosystems"],
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
// Note on "sigmoid" vs "tanh": these are NOT two different curve shapes.
// The bipolar logistic below is exactly tanh at half the steepness —
// 2/(1+e^(-Lx)) - 1 === tanh(Lx/2) — verified to machine precision. So
// picking "sigmoid" over "tanh" at the same lambda halves the slope at 0,
// which is the loop gain of the whole model: it is why a model can settle
// away from zero under tanh and decay back to zero under sigmoid with
// identical weights. Kept as a separate option because a gentler gain is
// a legitimate modelling choice and existing saved models select it, but
// it should be understood (and written up) as a steepness setting rather
// than as a different transfer function. The genuinely different sigmoid
// from the FCM literature is the UNIPOLAR one, 1/(1+e^(-Lx)), whose range
// is [0,1] and whose fixed point at 0 does not exist (f(0) = 0.5); that
// would change what an activation of 0 means everywhere else in this app,
// so it is deliberately not offered here.
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
  const betweenness = computeBetweenness(concepts, edges);
  const raw = concepts.map((c) => {
    const out = edges.filter((e) => e.source === c.id).reduce((s, e) => s + Math.abs(e.weight), 0);
    const inn = edges.filter((e) => e.target === c.id).reduce((s, e) => s + Math.abs(e.weight), 0);
    return {
      id: c.id, name: c.name, indegree: round2(inn), outdegree: round2(out),
      centrality: round2(inn + out), netInfluence: round2(out - inn),
      // Share of the concept's total connection weight that is outgoing
      // (driver score) or incoming (receiver score); the two sum to 1.
      driverScore: inn + out > 0 ? round2(out / (inn + out)) : 0,
      receiverScore: inn + out > 0 ? round2(inn / (inn + out)) : 0,
      betweenness: betweenness[c.id] ?? 0,
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
function enumerateFeedbackLoops(concepts, edges, maxLen = 8, maxLoops = 300) {
  const ids = concepts.map((c) => c.id);
  const adj = {};
  ids.forEach((id) => (adj[id] = []));
  edges.forEach((e) => { if (adj[e.source] && adj[e.target]) adj[e.source].push(e); });

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
  return { loops, capped: capped.hit };
}

function findFeedbackLoops(concepts, edges, maxLen = 8, maxLoops = 300) {
  const { loops, capped } = enumerateFeedbackLoops(concepts, edges, maxLen, maxLoops);
  const classified = loops.map((edgePath) => {
    const negCount = edgePath.filter((e) => e.weight < 0).length;
    return { length: edgePath.length, type: negCount % 2 === 0 ? "reinforcing" : "balancing" };
  });
  return {
    total: classified.length,
    reinforcing: classified.filter((l) => l.type === "reinforcing").length,
    balancing: classified.filter((l) => l.type === "balancing").length,
    capped,
  };
}

// Feedback loops broken down by module, for the Influence Routes tab: every
// loop in the analysed network, whether it stays inside one module or runs
// through several, and a count per module and per combination of modules.
// Uses the same enumeration and caps as findFeedbackLoops, so the totals
// match the loop count on the Influence Metrics tab exactly.
function analyseFeedbackLoops(concepts, edges) {
  const { loops, capped } = enumerateFeedbackLoops(concepts, edges);
  const moduleOf = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
  const list = loops.map((path) => {
    const nodes = path.map((e) => e.source);
    const modules = [...new Set(nodes.map((id) => moduleOf.get(id)))].sort();
    const negative = path.filter((e) => e.weight < 0).length;
    return {
      nodes, edges: path, length: path.length, modules,
      within: modules.length === 1,
      type: negative % 2 === 0 ? "reinforcing" : "balancing",
      strength: path.reduce((s, e) => s * Math.abs(e.weight), 1),
    };
  }).sort((a, b) => b.strength - a.strength || a.length - b.length);

  const tally = () => ({ count: 0, reinforcing: 0, balancing: 0 });
  const add = (t, l) => { t.count += 1; t[l.type] += 1; };
  const total = tally(), within = tally(), between = tally();
  const byModule = new Map();   // module -> loops entirely inside it
  const touching = new Map();   // module -> loops passing through it at all
  const combos = new Map();     // "a|b|c" -> loops running through exactly these modules
  list.forEach((l) => {
    add(total, l);
    if (l.within) {
      add(within, l);
      const k = l.modules[0];
      if (!byModule.has(k)) byModule.set(k, tally());
      add(byModule.get(k), l);
    } else {
      add(between, l);
      const k = l.modules.join("|");
      if (!combos.has(k)) combos.set(k, { modules: l.modules, ...tally() });
      add(combos.get(k), l);
    }
    l.modules.forEach((m) => {
      if (!touching.has(m)) touching.set(m, tally());
      add(touching.get(m), l);
    });
  });
  return {
    loops: list, capped, total, within, between, byModule, touching,
    combos: [...combos.values()].sort((a, b) => b.count - a.count),
  };
}

// Descriptive/structural statistics for the "System Overview" section:
// pure graph-theory numbers, no simulation needed. Always called with the
// network currently in scope, so every figure describes what is being
// analysed rather than the whole model.
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

  const clustering = computeClustering(concepts, edges);
  const modularity = computeModularity(concepts, edges);
  const moduleOf = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
  const interfaceEdges = edges.filter((e) => moduleOf.has(e.source) && moduleOf.has(e.target) && moduleOf.get(e.source) !== moduleOf.get(e.target)).length;

  return {
    concepts: n, relationships: m,
    density, actualConnections: m, possibleConnections: possible,
    avgDegree, maxDegree, minDegree,
    loops,
    complexity, connectivity, centralization,
    clustering: clustering.average, clusteringEligible: clustering.eligible,
    modularity: modularity.q, moduleCount: modularity.moduleCount,
    interfaceEdges, interfaceShare: m > 0 ? round2((interfaceEdges / m) * 100) : 0,
  };
}

const round3 = (v) => Math.round(v * 1000) / 1000;

// Directed betweenness centrality (Brandes 2001) on the unweighted network:
// the share of shortest directed routes between every other pair of
// concepts that pass through this one. Unweighted on purpose: FCM weights
// are strengths of influence, not distances, and there is no agreed way to
// turn one into the other, so this measures pure brokerage position — how
// often a concept sits on the most direct route from one part of the system
// to another. Normalised by (n-1)(n-2), the number of ordered pairs a concept
// could sit between, so it runs 0..1 and stays comparable between networks of
// different size (a module versus the full nexus).
function computeBetweenness(concepts, edges) {
  const ids = concepts.map((c) => c.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const adj = ids.map(() => []);
  edges.forEach((e) => {
    const s = idx.get(e.source), t = idx.get(e.target);
    if (s === undefined || t === undefined || s === t) return;
    if (!adj[s].includes(t)) adj[s].push(t);
  });
  const cb = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = ids.map(() => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1; dist[s] = 0;
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; pred[w].push(v); }
      }
    }
    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop();
      for (const v of pred[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  const norm = n > 2 ? (n - 1) * (n - 2) : 0;
  const out = {};
  ids.forEach((id, i) => { out[id] = norm ? round3(cb[i] / norm) : 0; });
  return out;
}

// Local clustering coefficient on the undirected version of the network: of
// all pairs of concepts a concept is linked to (in either direction), the
// share that are also linked to each other. The network figure is the mean
// over concepts with at least two neighbours (Watts & Strogatz 1998). High
// values mean tightly knit groups of mutual influence; near zero means
// chain- or star-like structure.
function computeClustering(concepts, edges) {
  const nb = new Map(concepts.map((c) => [c.id, new Set()]));
  edges.forEach((e) => {
    if (e.source === e.target || !nb.has(e.source) || !nb.has(e.target)) return;
    nb.get(e.source).add(e.target);
    nb.get(e.target).add(e.source);
  });
  const local = {};
  let sum = 0, eligible = 0;
  nb.forEach((set, id) => {
    const k = set.size;
    if (k < 2) { local[id] = null; return; }
    const arr = [...set];
    let links = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (nb.get(arr[i]).has(arr[j])) links++;
    const c = links / ((k * (k - 1)) / 2);
    local[id] = round3(c);
    sum += c; eligible++;
  });
  return { average: eligible ? round3(sum / eligible) : 0, eligible, local };
}

// Newman-Girvan modularity Q of the partition formed by the concepts' own
// modules (categories), on the undirected network weighted by |weight|. It
// compares the weight falling inside modules with what a random network
// with the same degree sequence would put there: clearly positive Q means
// the modules really are more tightly connected internally than to each
// other; near zero means the module boundaries don't follow the network's
// structure; negative means they cut across it. This scores the categories
// the researcher defined, not an optimal community partition. Undefined
// (null) with fewer than two modules or no relationships.
function computeModularity(concepts, edges) {
  const mod = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
  const moduleCount = new Set(mod.values()).size;
  if (moduleCount < 2) return { q: null, moduleCount };
  const strength = new Map(concepts.map((c) => [c.id, 0]));
  const inside = new Map();
  let twoM = 0;
  edges.forEach((e) => {
    if (!mod.has(e.source) || !mod.has(e.target)) return;
    const w = Math.abs(e.weight);
    strength.set(e.source, strength.get(e.source) + w);
    strength.set(e.target, strength.get(e.target) + w);
    twoM += 2 * w;
    const ms = mod.get(e.source);
    if (ms === mod.get(e.target)) inside.set(ms, (inside.get(ms) || 0) + 2 * w);
  });
  if (twoM === 0) return { q: null, moduleCount };
  const total = new Map();
  strength.forEach((s, id) => { const k = mod.get(id); total.set(k, (total.get(k) || 0) + s); });
  let q = 0;
  total.forEach((t, k) => { q += (inside.get(k) || 0) / twoM - (t / twoM) ** 2; });
  return { q: round3(q), moduleCount };
}

// ============================================================================
// Multi-scale analysis
// ============================================================================
// Every concept is also scored at three fixed scales, independent of the
// active view: the full nexus, its own module on its own, and the nexus
// interface (every module, only the relationships between different
// modules). Each scale is a separate network with its own metrics and its
// own ranking; they are deliberately not rescaled against each other, since
// "most influential inside Marine" and "most influential across the nexus"
// are different questions with legitimately different answers.
function scaleNetworks(concepts, edges, modules) {
  const full = { key: "global", label: "Full Nexus", concepts, edges };
  const moduleNets = modules.map((m) => {
    const v = applyNetworkView(concepts, edges, { mode: "modules", selected: [m.key], showIsolated: true }, modules);
    return { key: `module:${m.key}`, moduleKey: m.key, label: `${m.label} Module`, concepts: v.concepts, edges: v.edges };
  });
  let iface = null;
  if (modules.length >= 2) {
    const v = applyNetworkView(concepts, edges, { mode: "nexus", selected: null, showIsolated: true }, modules);
    iface = { key: "interface", label: "Nexus Interface", concepts: v.concepts, edges: v.edges };
  }
  return { full, moduleNets, iface };
}

function scoreNetwork(net, settings) {
  const structural = computeMetrics(net.concepts, net.edges);
  const advanced = computeAdvancedMetrics(net.concepts, net.edges, settings);
  const byId = {};
  structural.forEach((m) => { byId[m.id] = { ...m, ...advanced[m.id] }; });
  return byId;
}

// Standard competition ranking ("1224"): tied values share the better rank.
function rankBy(byId, field) {
  const entries = Object.values(byId).map((m) => [m.id, m[field] ?? 0]).sort((a, b) => b[1] - a[1]);
  const ranks = {};
  entries.forEach(([id, v], i) => {
    ranks[id] = i > 0 && v === entries[i - 1][1] ? ranks[entries[i - 1][0]] : i + 1;
  });
  return ranks;
}

const MULTISCALE_METRICS = [
  { key: "influence", label: "Influence score", help: "Perturbation-based: average movement this concept causes in the rest of that scale's network when driven to +1." },
  { key: "centrality", label: "Centrality (degree)", help: "Sum of absolute incoming and outgoing weights within that scale's network." },
  { key: "betweenness", label: "Betweenness", help: "Share of shortest directed routes between other concepts, within that scale's network, that pass through this concept." },
  { key: "outdegree", label: "Out-degree (driver strength)", help: "Sum of absolute outgoing weights within that scale's network." },
];

function computeMultiScaleReport(concepts, edges, settings) {
  const modules = listModules(concepts);
  const nets = scaleNetworks(concepts, edges, modules);
  const scored = {
    global: scoreNetwork(nets.full, settings),
    modules: {},
    interface: nets.iface ? scoreNetwork(nets.iface, settings) : null,
  };
  nets.moduleNets.forEach((mn) => { scored.modules[mn.moduleKey] = scoreNetwork(mn, settings); });
  return { nets, scored, modules };
}

// Where a concept's importance comes from, read off its percentile position
// at each scale. A heuristic reading aid, not a finding: the margin (0.15)
// and cut-offs are conventions, and a concept that is unremarkable at every
// scale is simply reported as such.
function importanceProfile(p) {
  const scales = [["global", "System-wide position"], ["module", "Within-module dynamics"], ["interface", "Bridging between modules"]]
    .filter(([k]) => p[k] !== null && p[k] !== undefined);
  if (!scales.length) return "n/a";
  if (scales.every(([k]) => p[k] < 0.5)) return "Peripheral at every scale";
  if (scales.length > 1 && scales.every(([k]) => p[k] >= 0.75)) return "Important at every scale";
  const sorted = [...scales].sort((a, b) => p[b[0]] - p[a[0]]);
  if (sorted.length > 1 && p[sorted[0][0]] - p[sorted[1][0]] < 0.15) return "Mixed";
  return sorted[0][1];
}

function multiScaleRows(report, field) {
  if (!report) return [];
  const moduleLabel = new Map(report.modules.map((m) => [m.key, m.label]));
  const gRank = rankBy(report.scored.global, field);
  const iRank = report.scored.interface ? rankBy(report.scored.interface, field) : null;
  const mRank = {};
  Object.entries(report.scored.modules).forEach(([k, byId]) => { mRank[k] = rankBy(byId, field); });
  const nG = Object.keys(report.scored.global).length;
  const nI = report.scored.interface ? Object.keys(report.scored.interface).length : 0;
  // Percentile of a rank among n concepts (1 = top). A concept scoring 0 at
  // a scale has no position there worth ranking, so it counts as bottom.
  const pct = (rank, n, value) => (value > 0 ? (n > 1 ? 1 - (rank - 1) / (n - 1) : 1) : 0);
  return report.nets.full.concepts.map((c) => {
    const mk = moduleKey(c.category);
    const g = report.scored.global[c.id];
    const mScores = report.scored.modules[mk];
    const nM = mScores ? Object.keys(mScores).length : 0;
    const mv = mScores?.[c.id];
    const iv = report.scored.interface?.[c.id];
    const row = {
      id: c.id, name: c.name, moduleKey: mk, moduleLabel: moduleLabel.get(mk) || mk,
      global: { value: g?.[field] ?? 0, rank: gRank[c.id], n: nG },
      module: mv ? { value: mv[field] ?? 0, rank: mRank[mk][c.id], n: nM } : null,
      interface: iv ? { value: iv[field] ?? 0, rank: iRank[c.id], n: nI } : null,
    };
    row.profile = importanceProfile({
      global: pct(row.global.rank, nG, row.global.value),
      module: row.module && nM > 1 ? pct(row.module.rank, nM, row.module.value) : null,
      interface: row.interface ? pct(row.interface.rank, nI, row.interface.value) : null,
    });
    return row;
  });
}

// Top-ranked concepts by perturbation influence at every scale, for the
// "leverage points by scale" comparison. Each scale is ranked on its own.
function leverageByScale(report, topN = 3) {
  if (!report) return [];
  const top = (byId) => Object.values(byId).filter((m) => m.influence > 0)
    .sort((a, b) => b.influence - a.influence || b.outdegree - a.outdegree).slice(0, topN);
  const out = [{ key: "global", label: report.nets.full.label, n: report.nets.full.concepts.length, top: top(report.scored.global) }];
  report.nets.moduleNets.forEach((mn) => out.push({ key: mn.key, label: mn.label, n: mn.concepts.length, moduleKey: mn.moduleKey, top: top(report.scored.modules[mn.moduleKey]) }));
  if (report.nets.iface) out.push({ key: "interface", label: report.nets.iface.label, n: report.nets.iface.concepts.length, top: top(report.scored.interface) });
  return out;
}

// ============================================================================
// Route analysis
// ============================================================================
// Simple directed routes (no concept visited twice) up to maxLen
// relationships, enumerated from every concept in the analysed network.
// Strength is the product of the absolute weights along the path — the
// usual FCM indirect-effect measure, with the product as the combining
// operator — so a route is never stronger than its weakest link and
// longer chains fade. Sign is the product of the signs: + means the start
// pushes the end in the same direction, - in the opposite direction.
const DEFAULT_BASELINE_INIT = { mode: "model", values: {} };

// The model is saved in this browser automatically (localStorage) and
// restored on the next visit, so closing the tab or reloading never loses
// work. Only the model itself is kept (concepts, relationships, scenarios,
// settings); analysis results are recomputed on demand anyway.
const AUTOSAVE_KEY = "spaghetti-engine:autosave:v1";
function readAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data?.concepts) && Array.isArray(data?.edges) ? data : null;
  } catch {
    return null;
  }
}
const DEFAULT_SETTINGS = {
  maxIterations: 100, convergenceThreshold: 0.001, mode: "synchronous",
  squashFunction: "tanh", lambda: 1, updateRule: "relative",
};
const BASELINE_SCENARIO = { id: "baseline", name: "Baseline", type: "baseline", description: "", initialOverrides: {}, weightOverrides: {}, lockedConcepts: {} };
const DEFAULT_ROUTE_CONFIG = { kind: "interface", moduleA: "", moduleB: "", direction: "both", fromId: "", toId: "", minLen: 2, maxLen: 4 };
const ROUTE_EXPANSION_LIMIT = 250000;
const ROUTE_KEEP_LIMIT = 20000;

function analyseInfluenceRoutes(concepts, edges, config) {
  const moduleOf = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
  const nameOf = new Map(concepts.map((c) => [c.id, c.name]));
  const outgoing = new Map(concepts.map((c) => [c.id, []]));
  edges.forEach((e) => { if (outgoing.has(e.source) && outgoing.has(e.target) && e.source !== e.target) outgoing.get(e.source).push(e); });
  const { kind, moduleA, moduleB, direction, fromId, toId } = config;
  const minLen = Math.max(1, config.minLen || 1);
  const maxLen = Math.max(minLen, Math.min(6, config.maxLen || 4));

  // Which concepts a route may start from, pass through, and end at.
  const startOk = (id) => {
    if (fromId && id !== fromId) return false;
    if (kind === "within") return moduleOf.get(id) === moduleA;
    if (kind === "between") {
      if (direction === "ab") return moduleOf.get(id) === moduleA;
      if (direction === "ba") return moduleOf.get(id) === moduleB;
      return moduleOf.get(id) === moduleA || moduleOf.get(id) === moduleB;
    }
    return true;
  };
  const stepOk = (id) => kind !== "within" || moduleOf.get(id) === moduleA;
  const accept = (nodes, crossings) => {
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (toId && last !== toId) return false;
    if (kind === "interface") return crossings > 0;
    if (kind === "between") {
      const a = moduleOf.get(first), b = moduleOf.get(last);
      const ab = a === moduleA && b === moduleB, ba = a === moduleB && b === moduleA;
      return direction === "ab" ? ab : direction === "ba" ? ba : ab || ba;
    }
    return true;
  };

  const paths = [];
  let expansions = 0, truncated = false;
  const nodes = [], pathEdges = [], onPath = new Set();
  const dfs = (id, strength, sign, crossings) => {
    const len = pathEdges.length;
    if (len >= minLen && accept(nodes, crossings)) {
      if (paths.length >= ROUTE_KEEP_LIMIT) { truncated = true; return; }
      paths.push({ nodes: [...nodes], edges: [...pathEdges], strength, sign, crossings, length: len });
    }
    if (len >= maxLen) return;
    for (const e of outgoing.get(id)) {
      if (onPath.has(e.target) || !stepOk(e.target)) continue;
      if (++expansions > ROUTE_EXPANSION_LIMIT) { truncated = true; return; }
      const crossed = moduleOf.get(e.source) !== moduleOf.get(e.target) ? 1 : 0;
      nodes.push(e.target); pathEdges.push(e); onPath.add(e.target);
      dfs(e.target, strength * Math.abs(e.weight), sign * (e.weight < 0 ? -1 : 1), crossings + crossed);
      nodes.pop(); pathEdges.pop(); onPath.delete(e.target);
      if (truncated) return;
    }
  };
  for (const c of concepts) {
    if (!startOk(c.id)) continue;
    nodes.push(c.id); onPath.add(c.id);
    dfs(c.id, 1, 1, 0);
    nodes.pop(); onPath.delete(c.id);
    if (truncated) break;
  }
  paths.sort((a, b) => b.strength - a.strength || a.length - b.length);

  // Bridge concepts: how much of the selected routes' combined strength
  // flows THROUGH each concept (as an intermediate, not a start or end), and
  // how often a route changes module right at it. A concept carrying a
  // large share of it is where transmission between parts of the system is
  // concentrated — a candidate coupling point or coordination bottleneck.
  const totalStrength = paths.reduce((s, p) => s + p.strength, 0);
  const through = new Map(), boundary = new Map();
  paths.forEach((p) => {
    p.nodes.slice(1, -1).forEach((id) => {
      const t = through.get(id) || { count: 0, strength: 0 };
      t.count += 1; t.strength += p.strength; through.set(id, t);
    });
    p.edges.forEach((e) => {
      if (moduleOf.get(e.source) === moduleOf.get(e.target)) return;
      boundary.set(e.source, (boundary.get(e.source) || 0) + 1);
      boundary.set(e.target, (boundary.get(e.target) || 0) + 1);
    });
  });
  const bridgeIds = new Set([...through.keys(), ...boundary.keys()]);
  const bridges = [...bridgeIds].map((id) => {
    const t = through.get(id) || { count: 0, strength: 0 };
    return {
      id, name: nameOf.get(id), moduleKey: moduleOf.get(id),
      throughCount: t.count, throughStrength: round3(t.strength),
      share: totalStrength > 0 ? round3(t.strength / totalStrength) : 0,
      boundaryCrossings: boundary.get(id) || 0,
    };
  }).sort((a, b) => b.share - a.share || b.boundaryCrossings - a.boundaryCrossings);

  // Start-module -> end-module transmission summary.
  const flows = new Map();
  paths.forEach((p) => {
    const from = moduleOf.get(p.nodes[0]), to = moduleOf.get(p.nodes[p.nodes.length - 1]);
    const key = `${from}|${to}`;
    const f = flows.get(key) || { from, to, count: 0, strength: 0, positive: 0, negative: 0 };
    f.count += 1; f.strength += p.strength;
    if (p.sign > 0) f.positive += 1; else f.negative += 1;
    flows.set(key, f);
  });

  return {
    paths, truncated, totalStrength: round3(totalStrength), bridges,
    flows: [...flows.values()].map((f) => ({ ...f, strength: round3(f.strength) })).sort((a, b) => b.strength - a.strength),
    positive: paths.filter((p) => p.sign > 0).length, negative: paths.filter((p) => p.sign < 0).length,
  };
}

const UNCATEGORIZED = "Uncategorized";

// Concept id -> the category it is grouped under. Categories that differ only
// in case or surrounding spaces ("Marine", "marine ") are one category, the
// same rule the Network tab's module filter uses (moduleKey), so a
// relationship counts as cross-category here exactly when Nexus Interface
// Mode would keep it. Each group is named by the first spelling seen.
function categoryLabelsById(concepts) {
  const labelByKey = new Map();
  return new Map(concepts.map((c) => {
    const key = moduleKey(c.category);
    if (!labelByKey.has(key)) labelByKey.set(key, key === UNCATEGORIZED_MODULE ? UNCATEGORIZED : c.category.trim());
    return [c.id, labelByKey.get(key)];
  }));
}

// Aggregates the same per-concept metrics the table/charts above already
// show (from computeMetrics + computeAdvancedMetrics), grouped by the
// free-text `category` field every concept already has. Concepts with no
// category are grouped under UNCATEGORIZED rather than dropped, so every
// concept is always accounted for somewhere. Generic by construction: it
// only ever groups by whatever category strings are actually present on
// the loaded model, never a fixed/hard-coded list.
function computeCategoryStats(concepts, edges, metrics) {
  const conceptCategory = categoryLabelsById(concepts);
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
  const conceptCategory = categoryLabelsById(concepts);
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
    // Every card is now the same compact shape (category shows as a
    // background tint, not an extra pill row), so there's no more
    // category-conditional height like before.
    children: concepts.map((c) => ({ id: c.id, width: 175, height: 86 })),
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
    .force("collide", forceCollide(65))
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
// Shared "show your working" panel for every tab that computes something,
// modelled on the Baseline Equilibrium tab's diagnostics box. The grid
// carries the facts that make a result reproducible and checkable (how many
// simulations were actually run, under which transfer function and
// settings, whether anything hit a cap or failed to converge); the
// collapsible section carries how the numbers are derived and — more
// importantly for writing any of this up — what they do not mean.
function MethodPanel({ title = "Method & diagnostics", stats = [], children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      {stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} title={s.hint || undefined}>
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                {s.label}{s.hint ? <HelpCircle size={10} className="text-slate-300" /> : null}
              </div>
              <div className={`text-sm font-mono ${s.tone === "warn" ? "text-amber-700" : s.tone === "good" ? "text-teal-700" : ""}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}
      {children ? (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 ${stats.length ? "mt-4 pt-3 border-t border-slate-100 w-full" : ""}`}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            How this is calculated, and what it does not tell you
          </button>
          {open && <div className="mt-2 space-y-2 text-xs text-slate-600 leading-relaxed">{children}</div>}
        </>
      ) : null}
    </div>
  );
}

// The global Analysis Scope bar, under the tab row on every tab: which part of
// the nexus is currently being looked at AND analysed, and the controls to
// change it. Every tab reads the same scope, so switching it here updates the
// canvas, every metric, every simulation and every export at once. The preset
// menu and the module chips are built from the concepts' categories, so a new
// category appears here as soon as a concept uses it.
function AnalysisScopeBar({ viewInfo, modules, networkView, setNetworkView }) {
  const v = viewInfo;
  const [flashChips, setFlashChips] = useState(false);
  const keys = resolveViewModules(modules, networkView);
  const every = keys.length === modules.length;
  const presetValue = networkView.mode === "nexus"
    ? (every ? "nexus" : "custom")
    : every ? "full" : keys.length === 1 ? `m:${keys[0]}` : "custom";
  const choose = (val) => {
    if (val === "full") setNetworkView((nv) => ({ ...nv, mode: "modules", selected: null }));
    else if (val === "nexus") setNetworkView((nv) => ({ ...nv, mode: "nexus", selected: null }));
    else if (val.startsWith("m:")) setNetworkView((nv) => ({ ...nv, mode: "modules", selected: [val.slice(2)] }));
    else {
      // "Custom": the module chips beside the menu ARE the custom selection;
      // point at them rather than guessing which combination was meant.
      setFlashChips(true);
      setTimeout(() => setFlashChips(false), 1600);
    }
  };
  return (
    <div className={`px-5 py-1.5 text-xs border-b ${v.isFiltered ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-white border-slate-200 text-slate-600"}`}>
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="text-slate-400">Viewing:</span>
          <span className={`w-2 h-2 rounded-full ${v.isFiltered ? "bg-amber-500" : "bg-teal-600"}`} />
          <span className="font-semibold">{v.label}</span>
        </span>
        <span className={v.isFiltered ? "text-amber-800/80" : "text-slate-400"}>
          {v.visibleConcepts} of {v.totalConcepts} concepts &middot; {v.visibleEdges} of {v.totalEdges} relationships
          {!v.showIsolated ? " · isolated concepts hidden" : ""}
        </span>
        {modules.length > 0 && (
          <>
            <span className="hidden md:inline h-4 w-px bg-slate-300" />
            <label className="flex items-center gap-1.5">
              <span className="text-slate-400">Analysis scope</span>
              <select
                value={presetValue}
                onChange={(e) => choose(e.target.value)}
                className="border border-slate-300 rounded-md px-1.5 py-0.5 bg-white text-slate-800 text-xs"
              >
                <option value="full">Full Nexus</option>
                {modules.map((m) => <option key={m.key} value={`m:${m.key}`}>{m.label} Module</option>)}
                <option value="nexus" disabled={modules.length < 2}>Nexus Interface Mode</option>
                <option value="custom">Custom module selection&hellip;</option>
              </select>
            </label>
            <NetworkViewControls
              modules={modules} networkView={networkView} setNetworkView={setNetworkView}
              className={`rounded-md transition-shadow ${flashChips ? "ring-2 ring-teal-400 ring-offset-2" : ""}`}
            />
          </>
        )}
        {v.isFiltered && (
          <button onClick={() => setNetworkView((nv) => ({ ...DEFAULT_NETWORK_VIEW, showIsolated: nv.showIsolated }))} className="ml-auto underline hover:no-underline font-medium">
            Back to full nexus
          </button>
        )}
      </div>
    </div>
  );
}

// Shown at the top of every analysis tab while a view is active. Running an
// analysis on a module or on the nexus interface is a legitimate and useful
// thing to do, but it answers a different question from running it on the
// whole system, and that difference has to be stated where the numbers are.
function ViewScopeBanner({ viewInfo }) {
  const v = viewInfo;
  if (!v.isFiltered) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1.5">
      <p className="flex items-start gap-1.5">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          <strong>Every result on this tab is for {v.label}, not the whole system:</strong> {v.visibleConcepts} of {v.totalConcepts} concepts
          and {v.visibleEdges} of {v.totalEdges} relationships.
        </span>
      </p>
      {v.mode === "nexus" ? (
        <p className="pl-5">
          Nexus Interface Mode keeps only relationships that cross from one module to another and removes every relationship inside a module.
          Structural measures (degree, centrality, density, roles) therefore describe each concept's part in <em>coupling</em> the modules together,
          which is what this view is for. Simulation-based results (influence, sensitivity, equilibria, scenarios, transition points) describe a
          network made of those coupling mechanisms alone, which is a deliberately artificial model. Use them to compare coupling structures, not as
          predictions of how the system behaves.
        </p>
      ) : (
        <p className="pl-5">
          This is the subsystem <em>in isolation</em>. Relationships linking it to concepts outside the view are excluded, so any feedback that runs
          through another module is not represented, and anything the rest of the nexus would push into this subsystem is absent. A concept's
          influence, sensitivity or equilibrium here can legitimately differ (sometimes a lot) from its value in the full nexus; comparing
          the two is exactly what subsystem analysis is for, but the difference should be read as the effect of cutting those links, not as an error.
        </p>
      )}
      {!v.showIsolated && (
        <p className="pl-5">Concepts left with no relationship inside this view are also excluded from the analysis.</p>
      )}
    </div>
  );
}

// The Network tab's view controls: which modules are in view, whether to show
// the whole of each module or only the relationships between them, and
// whether concepts left without any relationship stay on the canvas. The
// module list is read from the concepts' categories, so a new category shows
// up here as soon as a concept uses it.
function NetworkViewControls({ modules, networkView, setNetworkView, className = "" }) {
  const selectedKeys = resolveViewModules(modules, networkView);
  const isNexus = networkView.mode === "nexus";
  const minSelected = isNexus ? 2 : 1;
  const allSelected = selectedKeys.length === modules.length;
  const canNexus = modules.length >= 2;

  const setSelectedKeys = (keys) => {
    setNetworkView((v) => ({ ...v, selected: keys.length === modules.length ? null : keys }));
  };
  const toggle = (key) => {
    if (selectedKeys.includes(key)) {
      if (selectedKeys.length <= minSelected) return;
      setSelectedKeys(selectedKeys.filter((k) => k !== key));
    } else {
      setSelectedKeys(modules.map((m) => m.key).filter((k) => k === key || selectedKeys.includes(k)));
    }
  };
  const setMode = (mode) => {
    if (mode === "nexus" && !canNexus) return;
    setNetworkView((v) => ({
      ...v, mode,
      // An interface needs two sides: entering it from a single-module view
      // widens back to every module rather than showing an empty canvas.
      selected: mode === "nexus" && selectedKeys.length < 2 ? null : v.selected,
    }));
  };

  if (modules.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 flex-wrap text-xs ${className}`}>
      <div className="flex items-center border border-slate-300 rounded-md overflow-hidden" role="group" aria-label="View mode">
        <button
          onClick={() => setMode("modules")}
          className={`px-2.5 py-1 ${!isNexus ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          title="Show the selected modules with every relationship between their concepts"
        >Modules</button>
        <button
          onClick={() => setMode("nexus")}
          disabled={!canNexus}
          className={`px-2.5 py-1 border-l border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed ${isNexus ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          title={canNexus ? "Show only relationships that cross from one module to another" : "Needs concepts in at least two categories"}
        >Nexus Interface</button>
      </div>

      <button
        onClick={() => setSelectedKeys(modules.map((m) => m.key))}
        className={`px-2 py-1 rounded-md border ${allSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
      >All</button>

      {modules.map((m) => {
        const on = selectedKeys.includes(m.key);
        const st = categoryStyle(m.categoryValue);
        const locked = on && selectedKeys.length <= minSelected;
        return (
          <span key={m.key} className="group inline-flex items-stretch">
            <button
              onClick={() => toggle(m.key)}
              aria-pressed={on}
              title={locked ? `At least ${minSelected} module${minSelected > 1 ? "s" : ""} must stay in view` : on ? `Hide ${m.label}` : `Show ${m.label}`}
              className={`inline-flex items-center gap-1.5 pl-2 pr-2 py-1 border ${!isNexus ? "rounded-l-md" : "rounded-md"} ${on ? "text-slate-800" : "text-slate-400 bg-white border-dashed"}`}
              style={on ? { background: st.bg, borderColor: st.border } : { borderColor: "#cbd5e1" }}
            >
              <span className="w-2.5 h-2.5 rounded-sm border" style={{ background: on ? st.border : "transparent", borderColor: st.border }} />
              {m.label}
              <span className={on ? "text-slate-500" : "text-slate-300"}>{m.count}</span>
            </button>
            {!isNexus && (
              <button
                onClick={() => setSelectedKeys([m.key])}
                title={`View ${m.label} on its own`}
                className="px-1.5 py-1 border border-l-0 rounded-r-md border-slate-300 bg-white text-[10px] text-slate-400 hover:text-slate-700 hover:bg-slate-50"
              >only</button>
            )}
          </span>
        );
      })}

      <label className="inline-flex items-center gap-1.5 ml-1 text-slate-600 cursor-pointer select-none" title="Concepts with no relationship inside the current view">
        <input
          type="checkbox"
          checked={networkView.showIsolated}
          onChange={(e) => setNetworkView((v) => ({ ...v, showIsolated: e.target.checked }))}
        />
        Show isolated concepts
      </label>
    </div>
  );
}

function StaleResultBanner({ label }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
      <Info size={13} className="shrink-0 mt-0.5" />
      <span>The model or the network view has changed since {label} was last run: the results below no longer reflect the concepts, relationships, and settings currently in view. Run it again to refresh them.</span>
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
// subtree fresh.
//
// This now recovers automatically instead of waiting on that: the first
// time it catches an error, it waits a beat (so any in-flight state settles)
// then forces a full remount of the wrapped subtree itself — the same clean
// slate a tab switch used to provide, just automatic and near-instant, with
// nothing for the user to click and no tab to leave and re-enter. Only if a
// fresh mount immediately fails again (a real, persistent bug rather than a
// one-off transient race) does it fall back to the manual message+retry UI,
// so a genuinely broken view still surfaces rather than silently looping.
// Once a recovered subtree has run error-free for a few seconds, the
// one-shot auto-recovery re-arms, so a later, unrelated failure gets the
// same automatic handling instead of immediately going manual.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: 0, autoRetried: false };
    this.retryTimer = null;
    this.stabilityTimer = null;
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label || "view"}] render error${this.state.autoRetried ? "" : " (auto-recovering)"}:`, error, info?.componentStack);
    if (this.stabilityTimer) { clearTimeout(this.stabilityTimer); this.stabilityTimer = null; }
    if (!this.state.autoRetried) {
      this.retryTimer = setTimeout(() => {
        this.setState((s) => ({ error: null, resetKey: s.resetKey + 1, autoRetried: true }));
      }, 300);
    }
  }
  componentDidUpdate(_prevProps, prevState) {
    if (prevState.error && !this.state.error && !this.stabilityTimer) {
      this.stabilityTimer = setTimeout(() => {
        this.stabilityTimer = null;
        this.setState({ autoRetried: false });
      }, 4000);
    }
  }
  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
  }
  render() {
    if (this.state.error) {
      if (!this.state.autoRetried) {
        // Within the automatic-recovery window: a quiet, non-alarming
        // placeholder, since this resolves itself a moment later without
        // the user needing to do anything.
        return <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-xs text-slate-400">Refreshing {this.props.label || "this view"}…</div>;
      }
      return (
        <div className="bg-white rounded-lg border border-rose-200 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-700">Something went wrong displaying {this.props.label || "this view"}.</p>
          <p className="text-xs text-slate-500">Your model data is unaffected: this is a display error, not data loss. {this.props.showDetail !== false && this.state.error?.message ? `(${this.state.error.message})` : ""}</p>
          <Btn variant="outline" onClick={() => this.setState((s) => ({ error: null, resetKey: s.resetKey + 1, autoRetried: false }))}><RotateCcw size={14} />Try again</Btn>
        </div>
      );
    }
    // Keying on resetKey is what makes a recovery a true fresh mount of
    // everything below it (including any child hooks' internal state, e.g.
    // React Flow's own store) rather than just re-rendering the same
    // still-live component instance that just threw. A keyed Fragment, not
    // a keyed <div>: a real wrapping element here renders zero-height and
    // silently collapses the whole canvas underneath it, because React
    // Flow's root sizes itself with height:100% and this boundary sits
    // directly inside a plain (non-flex, non-h-full) wrapper around the
    // Network tab's canvas — a <div> with no layout classes of its own
    // breaks that percentage-height chain, while a Fragment adds no DOM
    // node at all and so cannot break it.
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

// ============================================================================
// Network tab: React Flow node/edge colors
// ============================================================================
// Node backgrounds encode CATEGORY (pastel fill), not activation value — see
// categoryStyle below. Activation value is instead shown as a small colored
// number inline in the node (activationTextColor), so the two dimensions
// (what a concept is vs. what state it's in) don't compete for the same
// visual channel.
function activationTextColor(v) {
  if (v <= -0.6) return "#991b1b"; // strong negative
  if (v <= -0.15) return "#c2410c"; // moderate negative
  if (v < 0.15) return "#475569"; // neutral
  if (v < 0.6) return "#1d4ed8"; // moderate positive
  return "#1e40af"; // strong positive
}

// Pastel module fills. Nothing about any particular nexus is built in: each
// module takes the next colour in this list in the order it first appears in
// the model (see assignCategoryColors), so up to ten modules are always
// visibly distinct whatever they are called, and a module keeps its colour
// while other modules are added after it.
const CATEGORY_PASTELS = [
  { bg: "#dcfce7", border: "#86efac" }, // green
  { bg: "#dbeafe", border: "#93c5fd" }, // blue
  { bg: "#ede9fe", border: "#c4b5fd" }, // violet
  { bg: "#fef3c7", border: "#fcd34d" }, // amber
  { bg: "#ccfbf1", border: "#5eead4" }, // teal
  { bg: "#fce7f3", border: "#f9a8d4" }, // pink
  { bg: "#e0e7ff", border: "#a5b4fc" }, // indigo
  { bg: "#ffedd5", border: "#fdba74" }, // orange
  { bg: "#ecfccb", border: "#bef264" }, // lime
  { bg: "#fae8ff", border: "#f0abfc" }, // fuchsia
];
const CATEGORY_UNSET_STYLE = { bg: "#f1f5f9", border: "#cbd5e1" }; // uncategorized — slate

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ============================================================================
// Module-based network views
// ============================================================================
// A "module" is simply a distinct value of a concept's free-text category.
// Nothing here knows the words terrestrial/marine/governance/cross-system:
// modules are discovered from whatever categories the model actually uses,
// so a new category type becomes a filterable module the moment a concept
// is given it, with no code change. Matching is case- and whitespace-
// insensitive ("Marine", "marine " and "MARINE" are one module), and
// concepts with no category form their own "Uncategorized" module rather
// than silently disappearing from every filtered view.
const UNCATEGORIZED_MODULE = "__uncategorized__";
const DEFAULT_NETWORK_VIEW = { mode: "modules", selected: null, showIsolated: true };

function moduleKey(category) {
  const k = (category || "").trim().toLowerCase();
  return k || UNCATEGORIZED_MODULE;
}

function listModules(concepts) {
  const byKey = new Map();
  concepts.forEach((c) => {
    const key = moduleKey(c.category);
    if (!byKey.has(key)) {
      const raw = (c.category || "").trim();
      byKey.set(key, {
        key,
        label: key === UNCATEGORIZED_MODULE ? "Uncategorized" : raw.charAt(0).toUpperCase() + raw.slice(1),
        // The category text to give a concept created while this module is
        // the one in view, so it doesn't vanish the moment it's added.
        categoryValue: raw,
        count: 0,
      });
    }
    byKey.get(key).count += 1;
  });
  return [...byKey.values()].sort((a, b) =>
    (a.key === UNCATEGORIZED_MODULE) - (b.key === UNCATEGORIZED_MODULE) || a.label.localeCompare(b.label));
}

// The modules a view actually includes, resolved against the modules that
// exist right now. A selection naming modules the model no longer has (a
// new template, an import, a category renamed) falls back to "all", so a
// stale filter can never leave the canvas blank.
function resolveViewModules(modules, view) {
  const all = modules.map((m) => m.key);
  if (!view.selected) return all;
  const kept = all.filter((k) => view.selected.includes(k));
  return kept.length ? kept : all;
}

// The visible sub-network for a view. Pure and cheap. In the default view
// (every module, isolated concepts shown) it returns the ORIGINAL arrays
// untouched, so with no filter active the whole app behaves exactly as it
// did before this feature existed.
//   modules mode: concepts in the chosen modules, and only relationships
//                 whose BOTH ends are visible.
//   nexus mode:   additionally drops every relationship whose two ends are
//                 in the same module, leaving only the cross-module coupling.
//   showIsolated off: then drops any concept left with no visible
//                 relationship at all.
function applyNetworkView(concepts, edges, view, modules) {
  const keys = resolveViewModules(modules, view);
  if (view.mode === "modules" && keys.length === modules.length && view.showIsolated) {
    return { concepts, edges, isFiltered: false };
  }
  const keySet = new Set(keys);
  const moduleOf = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
  let vConcepts = concepts.filter((c) => keySet.has(moduleOf.get(c.id)));
  const visible = new Set(vConcepts.map((c) => c.id));
  const vEdges = edges.filter((e) => {
    if (!visible.has(e.source) || !visible.has(e.target)) return false;
    return view.mode !== "nexus" || moduleOf.get(e.source) !== moduleOf.get(e.target);
  });
  if (!view.showIsolated) {
    const connected = new Set();
    vEdges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
    vConcepts = vConcepts.filter((c) => connected.has(c.id));
  }
  return { concepts: vConcepts, edges: vEdges, isFiltered: true };
}

function describeNetworkView(view, modules) {
  const keys = resolveViewModules(modules, view);
  const labels = keys.map((k) => modules.find((m) => m.key === k)?.label || k);
  const everyModule = keys.length === modules.length;
  if (view.mode === "nexus") return everyModule ? "Nexus Interface Mode" : `Nexus Interface: ${labels.join(" ↔ ")}`;
  if (everyModule) return "Full Nexus";
  return labels.length === 1 ? `${labels[0]} Module` : labels.join(" + ");
}

// Module key -> palette slot, refreshed by the app shell from the current
// concepts before anything renders (module state for the same reason as
// activeScopeSlug: every node, chip and legend reads it without threading it
// through props). A category not yet registered, e.g. while it is being typed,
// falls back to a stable hash so it still gets a colour.
// Slots are sticky: a module keeps its colour for as long as it exists, and a
// new module takes the lowest free slot, so renaming, adding or removing one
// module never recolours the others.
let categoryColorSlot = new Map();
function assignCategoryColors(concepts) {
  const present = new Set();
  concepts.forEach((c) => {
    const key = moduleKey(c.category);
    if (key !== UNCATEGORIZED_MODULE) present.add(key);
  });
  const next = new Map();
  present.forEach((k) => { if (categoryColorSlot.has(k)) next.set(k, categoryColorSlot.get(k)); });
  const used = new Set(next.values());
  present.forEach((k) => {
    if (next.has(k)) return;
    let slot = 0;
    while (used.has(slot)) slot++;
    next.set(k, slot);
    used.add(slot);
  });
  categoryColorSlot = next;
}

function categoryStyle(category) {
  const key = moduleKey(category);
  if (key === UNCATEGORIZED_MODULE) return CATEGORY_UNSET_STYLE;
  const slot = categoryColorSlot.has(key) ? categoryColorSlot.get(key) : hashString(key);
  return CATEGORY_PASTELS[slot % CATEGORY_PASTELS.length];
}

// ============================================================================
// Network tab: 12 discrete connection anchors per node (3 per side —
// near-start/center/near-end), instead of one point per side. Every edge
// end always resolves to a specific one of these: a user can drag an
// endpoint onto any of them, and an end nobody has manually chosen still
// lands on one (computed automatically in NetworkTabInner, not left
// continuously "floating" to an arbitrary boundary point), which is what
// lets several edges leaving the same side spread across it instead of
// stacking, and what lets a bidirectional A<->B pair separate onto two
// genuinely different points on each node instead of just bowing apart
// from a shared one.
// ============================================================================
const ANCHOR_SIDES = ["t", "r", "b", "l"];
const ANCHOR_FRACS = [0.25, 0.5, 0.75];
const ANCHOR_SUFFIX = ["a", "c", "z"]; // near-start / center / near-end along the side
const ANCHORS = ANCHOR_SIDES.flatMap((side) =>
  ANCHOR_FRACS.map((frac, i) => ({ id: `${side}-${ANCHOR_SUFFIX[i]}`, side, frac }))
);
const ANCHOR_BY_ID = Object.fromEntries(ANCHORS.map((a) => [a.id, a]));
const ANCHOR_POSITION = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
// Models exported before this feature existed only ever recorded "t"/"r"/
// "b"/"l" (one handle per side); map those onto that side's center anchor
// so an older export still opens with edges attached exactly where they
// were, instead of failing to resolve to any of the 12 new ids.
const LEGACY_HANDLE_MAP = { t: "t-c", r: "r-c", b: "b-c", l: "l-c" };
function normalizeHandleId(id) {
  if (!id) return null;
  if (LEGACY_HANDLE_MAP[id]) return LEGACY_HANDLE_MAP[id];
  return ANCHOR_BY_ID[id] ? id : null;
}

function ConceptNode({ data, selected }) {
  const c = data.concept;
  // Before any simulation has been run, `currentValue` is just a stale
  // default (0) set when the concept was created; it never reflected
  // whatever the user typed into "Initial activation" until they actually
  // ran something. Show the value that's actually true right now: the
  // initial value pre-run, the simulated result post-run, each labeled so
  // it's unambiguous which one is on screen.
  const displayValue = data.hasRun ? c.currentValue : c.initialValue;
  const cat = categoryStyle(c.category);
  const valueColor = activationTextColor(displayValue);
  // True for every node on the canvas for the duration of a connection drag
  // (from the moment the user presses down on any handle to when they
  // release), not just the one it started from — used to light up every
  // node's handles at once so a valid drop target never has to be
  // discovered by trial and error.
  const isConnecting = useConnection().inProgress;
  const pinnedTargets = data.pinnedTargets || EMPTY_ARRAY;
  // Selection ring color overrides the category border; both are applied via
  // inline style (not a Tailwind border-color class) since the unselected
  // color is data-driven and inline style always wins over a class anyway,
  // so mixing the two would just make the class silently do nothing.
  const borderColor = selected ? "#0d9488" : cat.border;
  // Anchors are always faintly visible (so all 12 are discoverable without
  // first having to guess to hover), brighten on hovering anywhere over the
  // node (not just the small dot itself, via the parent's `group`), and go
  // fully prominent — regardless of hover — whenever this node is itself
  // selected, a selected edge touches it (data.showAnchors, set by
  // NetworkTabInner), or a connection is being dragged from anywhere on the
  // canvas, so "reveal anchor points on selection" doesn't depend on the
  // pointer happening to be over this exact node.
  const anchorsProminent = selected || isConnecting || data.showAnchors;
  const dot = `!bg-slate-500 !border !border-white transition-all hover:!scale-125 hover:!opacity-100 ${
    anchorsProminent ? "opacity-80" : "opacity-25 group-hover:opacity-60"
  }`;
  return (
    <div
      // Focus mode: a concept outside the analysis scope stays on the canvas
      // for context but recedes, unless it is the one being worked on.
      style={{ background: cat.bg, color: "#1e293b", minWidth: 135, maxWidth: 185, borderColor, opacity: data.faded && !selected ? 0.15 : 1 }}
      className={`group rounded-xl border-2 px-2.5 py-1.5 shadow-sm transition-[box-shadow,opacity] ${selected ? "shadow-md ring-2 ring-teal-300" : ""} ${isConnecting ? "ring-1 ring-teal-300" : ""}`}
    >
      {/* 12 discrete anchors (3 per side) instead of one point per side, so
          a user can pick exactly where a relationship attaches. Each has a
          matching type="target" handle stacked on top (same id/position,
          invisible AND non-interactive: pointerEvents:"none" so a drag can
          never start or land on it — the visible type="source" dot above it
          stays the only thing the pointer can hit). React Flow still mounts
          and registers each one's bounds regardless of pointer-events, and
          that's all that's needed: it can only resolve a *fixed*
          sourceX/Y/position for a specific handle id by looking up a handle
          of the matching type at render time; with no type="target" handle
          registered for an id at all, that lookup silently fails. */}
      {ANCHORS.map((a) => {
        const posStyle = a.side === "t" || a.side === "b" ? { left: `${a.frac * 100}%` } : { top: `${a.frac * 100}%` };
        // Source-type handles: all 12, always, because any of them can be
        // dragged from (or dropped onto) to anchor a relationship by hand.
        // Target-type handles: only the ones actually needed — the default
        // anchor every unpinned edge end resolves against, plus whichever
        // anchors this node genuinely has an edge pinned to as a target.
        // Rendering all 24 unconditionally put 2,880 handle elements on a
        // 120-concept canvas (43% of its entire DOM) and React Flow measures
        // every one of them before it will show a single node or route a
        // single edge, which is most of the blank-canvas delay on a large
        // model.
        const needsTarget = a.id === DEFAULT_TARGET_ANCHOR || pinnedTargets.includes(a.id);
        return (
          <React.Fragment key={a.id}>
            <Handle type="source" position={ANCHOR_POSITION[a.side]} id={a.id} style={{ width: 9, height: 9, borderRadius: 9999, ...posStyle }} className={dot} />
            {needsTarget && (
              <Handle type="target" position={ANCHOR_POSITION[a.side]} id={a.id} style={{ width: 9, height: 9, borderRadius: 9999, opacity: 0, pointerEvents: "none", ...posStyle }} />
            )}
          </React.Fragment>
        );
      })}
      <div className="text-sm font-semibold leading-snug break-words" style={{ wordBreak: "break-word" }}>{c.name}</div>
      <div className="text-[10.5px] mt-1 leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
        <span className="opacity-60">{data.hasRun ? "Current activation" : "Initial activation"}:</span>{" "}
        <span className="font-mono font-semibold" style={{ color: valueColor }}>
          {displayValue >= 0 ? "+" : ""}{round2(displayValue).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// A node from useInternalNode() can be transiently incomplete — not just
// .measured, but .internals and .internals.positionAbsolute themselves —
// for a node not yet fully registered in React Flow's internal store.
// Every call site that needs a node's live pixel position goes through
// this instead of touching .internals directly, so a momentarily-incomplete
// node degrades to a harmless (0,0) for one frame instead of throwing.
function safeNodePos(node) {
  return node?.internals?.positionAbsolute ?? { x: 0, y: 0 };
}

// Where the straight line between two nodes' centres crosses THIS node's
// rectangle, and which side that is. This is what makes a relationship
// touch the box neatly: the endpoint is always exactly on the border,
// facing the node it actually connects to, however the two are arranged.
// Returns null while either node is still unmeasured so callers can fall
// back to React Flow's own coordinates rather than render garbage.
function boundaryPoint(node, otherNode) {
  const w = node?.measured?.width ?? 0, h = node?.measured?.height ?? 0;
  const ow = otherNode?.measured?.width ?? 0, oh = otherNode?.measured?.height ?? 0;
  if (!w || !h || !ow || !oh) return null;
  const p = safeNodePos(node), op = safeNodePos(otherNode);
  const cx = p.x + w / 2, cy = p.y + h / 2;
  const ocx = op.x + ow / 2, ocy = op.y + oh / 2;
  const dx = ocx - cx, dy = ocy - cy;
  if (dx === 0 && dy === 0) return null;
  // Standard ray/axis-aligned-rectangle intersection: the ray toward the
  // other node's centre leaves this rectangle at whichever axis constraint
  // (half-width vs half-height) it reaches first.
  const tX = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  const vertical = tY < tX;
  const side = vertical ? (dy >= 0 ? "b" : "t") : (dx >= 0 ? "r" : "l");
  return { x: cx + dx * t, y: cy + dy * t, side, w, h, cx, cy };
}

// Slides an endpoint along the side it landed on, so several relationships
// meeting the same face of a box fan out across it instead of stacking on
// one point — and so a reciprocal A->B / B->A pair lands on two clearly
// separate points. Stays inset from the corners so the arrow still visibly
// touches the box rather than clipping its edge.
function spreadAlongSide(pt, slot, count) {
  if (!pt || count <= 1 || !slot) return pt;
  const horizontal = pt.side === "t" || pt.side === "b";
  const extent = (horizontal ? pt.w : pt.h) - 24; // keep clear of the corners
  if (extent <= 0) return pt;
  const spacing = Math.min(26, extent / count);
  // Clamp against the BOX, not against the starting point. The boundary
  // point is wherever the line to the other node crosses this face, which
  // for a diagonal approach is already close to a corner — offsetting from
  // there and only limiting the offset itself could slide the endpoint
  // straight past the corner and leave the arrow hanging off the box.
  const centre = horizontal ? pt.cx : pt.cy;
  const lo = centre - extent / 2, hi = centre + extent / 2;
  const moved = (horizontal ? pt.x : pt.y) + slot * spacing;
  const clamped = Math.max(lo, Math.min(hi, moved));
  return horizontal ? { ...pt, x: clamped } : { ...pt, y: clamped };
}

const SIDE_TO_POSITION = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const EMPTY_ARRAY = [];
// Zoom-to-fit never enlarges beyond this: fitting one or two concepts would
// otherwise blow them up to the maximum zoom, leaving no empty space to
// double-click and making the map feel like it jumped.
const FIT_MAX_ZOOM = 1;
// The one target-type anchor every node must always carry: resolvedHandles
// points every unpinned edge end at it, so React Flow always has something
// to resolve even before any geometry is computed.
const DEFAULT_TARGET_ANCHOR = "l-c";

// A rough, constant node footprint, used only to decide which SIDE of a box
// an edge leaves from when grouping edges for fan-out. The rendered geometry
// never relies on it: InfluenceEdge recomputes the real boundary point from
// React Flow's own measured node sizes.
const ANCHOR_NODE_W = 160, ANCHOR_NODE_H = 70;

// For each unpinned edge end, which of its node's four sides faces the other
// node, and which slot it gets among the edges sharing that side. Pure and
// top-level so it can be called (and benchmarked) independently of render.
function computeEdgeSlots(concepts, edges) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const centerOf = (id) => {
    const p = byId.get(id)?.position || { x: 0, y: 0 };
    return { x: p.x + ANCHOR_NODE_W / 2, y: p.y + ANCHOR_NODE_H / 2 };
  };
  const sideFor = (dx, dy) => {
    if (Math.abs(dx) * ANCHOR_NODE_H > Math.abs(dy) * ANCHOR_NODE_W) return dx >= 0 ? "r" : "l";
    return dy >= 0 ? "b" : "t";
  };

  const ends = [];
  edges.forEach((e) => {
    const sc = centerOf(e.source), tc = centerOf(e.target);
    if (!normalizeHandleId(e.sourceHandle)) {
      ends.push({ edgeId: e.id, end: "source", key: `${e.source}|${sideFor(tc.x - sc.x, tc.y - sc.y)}` });
    }
    if (!normalizeHandleId(e.targetHandle)) {
      ends.push({ edgeId: e.id, end: "target", key: `${e.target}|${sideFor(sc.x - tc.x, sc.y - tc.y)}` });
    }
  });

  const groups = {};
  ends.forEach((it) => { (groups[it.key] = groups[it.key] || []).push(it); });

  const result = {};
  Object.values(groups).forEach((group) => {
    // Ordered by edge id, not by geometry, so an edge keeps the same slot
    // relative to its siblings while nodes move and never visibly swaps
    // places with one of them.
    group.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
    const n = group.length;
    group.forEach((it, i) => {
      const entry = (result[it.edgeId] = result[it.edgeId] || {});
      entry[`${it.end}Slot`] = i - (n - 1) / 2; // centred on the true boundary point
      entry[`${it.end}Count`] = n;
    });
  });
  return result;
}

function InfluenceEdge({
  id, source, target,
  sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  data, selected, markerEnd,
}) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { zoom } = useViewport();

  // Deliberately no `if (!sourceNode) return null` here. Returning null is
  // literally "delete this relationship from the screen", and React Flow's
  // internal node store can be momentarily incomplete (mid-drag, right
  // after a layout, while a node is still being measured). That guard was
  // one of the ways the whole model could blink out while dragging. React
  // Flow always supplies sourceX/sourceY/targetX/targetY for the edge's
  // resolved handles, so those are a safe base to draw from no matter what
  // the internal store is doing; the nicer boundary geometry below simply
  // refines them when it can, and is skipped for a frame when it can't.
  let sx = sourceX, sy = sourceY, sourcePos = sourcePosition;
  let tx = targetX, ty = targetY, targetPos = targetPosition;

  // An end the user has explicitly dragged onto a specific anchor stays
  // exactly there. Any other end floats: it attaches wherever the line to
  // the other node actually crosses this box's border, which is what makes
  // arrows meet boxes cleanly instead of leaving from a fixed point on the
  // wrong face and looping around.
  const pinnedSource = !!normalizeHandleId(data?.edge?.sourceHandle);
  const pinnedTarget = !!normalizeHandleId(data?.edge?.targetHandle);
  const srcPt = pinnedSource ? null : spreadAlongSide(boundaryPoint(sourceNode, targetNode), data?.sourceSlot ?? 0, data?.sourceCount ?? 1);
  const tgtPt = pinnedTarget ? null : spreadAlongSide(boundaryPoint(targetNode, sourceNode), data?.targetSlot ?? 0, data?.targetCount ?? 1);
  if (srcPt) { sx = srcPt.x; sy = srcPt.y; sourcePos = SIDE_TO_POSITION[srcPt.side]; }
  if (tgtPt) { tx = tgtPt.x; ty = tgtPt.y; targetPos = SIDE_TO_POSITION[tgtPt.side]; }

  const w = data?.edge?.weight ?? 0;
  const color = w >= 0 ? "#16a34a" : "#ea580c";
  // Thicker base + steeper weight scaling than before, so relationships read
  // as the dominant visual element against the now-smaller, pastel-category
  // nodes rather than being visually secondary to them.
  const strokeWidth = 2.25 + Math.abs(w) * 5.5 + (selected ? 1.5 : 0);
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
    // Retreat straight out of the face the arrow actually lands on. An
    // earlier version pulled back toward the source node's centre instead,
    // which is only the same direction when the endpoint happens to sit on
    // the centre-to-centre line — for an endpoint spread along the side, or
    // pinned by hand to a specific anchor, that direction is sideways, so
    // the arrowhead got dragged off the box and floated beside it instead
    // of pointing cleanly into it. Backing off along the side's own outward
    // normal keeps the tip square to the border at any approach angle.
    const outward = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] }[
      tgtPt ? tgtPt.side : { [Position.Top]: "t", [Position.Bottom]: "b", [Position.Left]: "l", [Position.Right]: "r" }[targetPos] || "t"
    ];
    tx += outward[0] * ARROW_GAP;
    ty += outward[1] * ARROW_GAP;
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
    // Widened alongside the thicker strokes above (18 -> 24px) so an A<->B
    // pair still reads as two visually distinct curves instead of one
    // thicker-looking line, now that each curve itself takes up more room.
    const offset = parallelSlot * 24;
    const midX = (sx + tx) / 2 + (-dy / len) * offset;
    const midY = (sy + ty) / 2 + (dx / len) * offset;
    path = `M ${sx},${sy} Q ${midX},${midY} ${tx},${ty}`;
    labelX = 0.25 * sx + 0.5 * midX + 0.25 * tx;
    labelY = 0.25 * sy + 0.5 * midY + 0.25 * ty;
  } else {
    // Tighter than React Flow's default curvature (0.25): a straighter,
    // lower-swoop line is easier to trace by eye across a dense graph and
    // crosses fewer other edges along the way than a wide bow between the
    // same two points would.
    [path, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sourcePos, targetX: tx, targetY: ty, targetPosition: targetPos, curvature: 0.15 });
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth, opacity: selected ? 1 : data?.faded ? 0.12 : 0.92 }} />
      {/* labelX/labelY come straight from the path helper's own midpoint
          (or, for a bowed parallel pair, the equivalent midpoint of that
          curve), so the label always sits at ~50% of edge length,
          consistently, without extra positioning logic. EdgeLabelRenderer
          renders into React Flow's dedicated label overlay pane, above every
          edge and node, so a label can never end up hidden under a line or
          arrowhead by construction.
          Two nested elements, not one: the outer div is positioned in FLOW
          space (labelX/labelY, inside React Flow's own pan/zoom-transformed
          layer, same as before) with no transform of its own beyond that
          placement; the inner div then applies its own inverse-zoom scale.
          Splitting it this way means the outer div's percentage-based
          center-anchor is computed from its unscaled layout size, so the
          inner content stays correctly centered on the edge regardless of
          zoom, while its RENDERED size counteracts the flow's own zoom and
          stays a constant, always-readable size on screen at every zoom
          level instead of shrinking to unreadable at a zoomed-out fit. */}
      <EdgeLabelRenderer>
        <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, zIndex: selected ? 20 : data?.faded ? 1 : 5, opacity: data?.faded && !selected ? 0.15 : 1 }}>
          <div
            style={{ transform: `scale(${1 / Math.max(zoom, 0.05)})`, pointerEvents: "all" }}
            className={`px-2 py-1 rounded text-[11px] font-mono font-semibold border shadow-sm ring-2 ring-white select-none ${w >= 0 ? "bg-green-50 border-green-300 text-green-800" : "bg-orange-50 border-orange-300 text-orange-800"}`}
          >
            {w >= 0 ? "+" : ""}{round2(w).toFixed(2)}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { concept: ConceptNode };
const edgeTypes = { influence: InfluenceEdge };

// ============================================================================
// Model-building aids: plain-language relationships and the Model check
// ============================================================================
// Words for a relationship's strength, on the same bands the weight buttons
// in the Inspector use, so what is said and what is set always agree.
const STRENGTH_PRESETS = [
  { label: "Weak", value: 0.25 },
  { label: "Moderate", value: 0.5 },
  { label: "Strong", value: 0.75 },
  { label: "Very strong", value: 1 },
];
function strengthWord(w) {
  const a = Math.abs(w);
  if (a < 1e-9) return "no";
  if (a < 0.2) return "a very weak";
  if (a < 0.4) return "a weak";
  if (a < 0.63) return "a moderate";
  if (a < 0.88) return "a strong";
  return "a very strong";
}
// "When A increases, B increases (a moderate effect)." The sentence a
// non-specialist can check against their own understanding of the system.
function relationshipSentence(sourceName, targetName, w) {
  if (Math.abs(w) < 1e-9) return `${sourceName} has no effect on ${targetName} (weight 0).`;
  return `When ${sourceName} increases, ${targetName} ${w > 0 ? "increases" : "decreases"} (${strengthWord(w)} effect).`;
}

// Levenshtein distance, stopping early once it can no longer be <= limit.
function editDistance(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Everyday problems in a model under construction, each with a plain
// explanation and the concepts or relationships it concerns, so the user can
// jump straight to them. "step" items are next steps for an unfinished
// model; "warn" items are probably mistakes; "tip" items are worth a look.
function checkModel(concepts, edges) {
  const issues = [];
  if (!concepts.length) return issues;
  const degree = new Map(concepts.map((c) => [c.id, 0]));
  edges.forEach((e) => {
    if (degree.has(e.source)) degree.set(e.source, degree.get(e.source) + 1);
    if (degree.has(e.target)) degree.set(e.target, degree.get(e.target) + 1);
  });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  if (concepts.length < 2) {
    issues.push({ id: "few", level: "step", title: "Add a second concept", text: "A map needs at least two concepts before you can draw a relationship between them. Double-click an empty spot on the canvas, or use Add concept." });
  } else if (!edges.length) {
    issues.push({ id: "no-edges", level: "step", title: "Draw your first relationship", text: "Drag from one of the dots on the edge of a concept onto another concept, or select a concept and use \"Add a relationship\" in the Inspector." });
  }

  const unnamed = concepts.filter((c) => !c.name?.trim() || /^New concept \d+$/.test(c.name.trim()));
  if (unnamed.length) {
    issues.push({ id: "unnamed", level: "step", title: `Name ${plural(unnamed.length, "concept", "concepts")}`, text: "Still called \"New concept\". Select it and type a name that says what it measures, for example \"Groundwater quality\".", concepts: unnamed.map((c) => c.id) });
  }

  const byName = new Map();
  concepts.forEach((c) => {
    const k = (c.name || "").trim().toLowerCase();
    if (!k) return;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(c.id);
  });
  const dupes = [...byName.values()].filter((ids) => ids.length > 1);
  if (dupes.length) {
    issues.push({ id: "dupes", level: "warn", title: `${plural(dupes.length, "name is", "names are")} used twice`, text: "Two concepts with the same name are easy to confuse in tables and exports. Rename one, or delete it if it is a copy.", concepts: dupes.flat() });
  }

  const lonely = concepts.filter((c) => !degree.get(c.id));
  if (edges.length && lonely.length) {
    issues.push({ id: "isolated", level: "warn", title: `${plural(lonely.length, "concept is", "concepts are")} not connected`, text: "A concept without any relationship cannot affect anything or be affected, so it never moves in a simulation. Connect it, or delete it if it is not needed.", concepts: lonely.map((c) => c.id) });
  }

  const zero = edges.filter((e) => Math.abs(e.weight) < 1e-9);
  if (zero.length) {
    issues.push({ id: "zero", level: "warn", title: `${plural(zero.length, "relationship has", "relationships have")} weight 0`, text: "A weight of 0 means \"no effect\", so the relationship does nothing. Give it a strength, or delete it.", edges: zero.map((e) => e.id) });
  }

  const modules = listModules(concepts);
  const uncategorized = concepts.filter((c) => moduleKey(c.category) === UNCATEGORIZED_MODULE);
  const named = modules.filter((m) => m.key !== UNCATEGORIZED_MODULE);
  if (named.length && uncategorized.length) {
    issues.push({ id: "no-module", level: "tip", title: `${plural(uncategorized.length, "concept has", "concepts have")} no module`, text: "Every other concept belongs to a module (subsystem). Give these one too, so module views and between-module analyses include them properly.", concepts: uncategorized.map((c) => c.id) });
  } else if (!named.length && concepts.length >= 4) {
    issues.push({ id: "modules", level: "tip", title: "Group concepts into modules", text: "Give each concept a module (for example Water, Energy, Food, Governance) in the Inspector. Modules let you analyse each subsystem on its own and the links between them." });
  }

  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const a = named[i], b = named[j];
      const short = Math.min(a.key.length, b.key.length);
      const similar = short >= 4 && (editDistance(a.key, b.key) <= (short >= 7 ? 2 : 1) || a.key.startsWith(b.key) || b.key.startsWith(a.key));
      if (!similar) continue;
      // The smaller module is most likely the typo; with equal sizes there is
      // no telling which, so both are listed.
      const tie = a.count === b.count;
      const smaller = a.count <= b.count ? a : b, larger = smaller === a ? b : a;
      const involved = tie ? [a.key, b.key] : [smaller.key];
      issues.push({
        id: `similar-${a.key}-${b.key}`, level: "warn",
        title: `"${smaller.label}" and "${larger.label}" look like the same module`,
        text: tie
          ? "If one of them is a typo, give their concepts the same module; otherwise they are analysed as two separate subsystems."
          : `If this is a typo, change the module of the ${plural(smaller.count, "concept", "concepts")} in "${smaller.label}" to "${larger.label}"; otherwise they are analysed as two separate subsystems.`,
        concepts: concepts.filter((c) => involved.includes(moduleKey(c.category))).map((c) => c.id),
      });
    }
  }
  return issues;
}

function ModelCheck({ concepts, edges, onSelectConcept, onSelectEdge, storageKey = "se.fold.modelCheck" }) {
  const issues = useMemo(() => checkModel(concepts, edges), [concepts, edges]);
  const nameOf = useMemo(() => new Map(concepts.map((c) => [c.id, c.name || "(unnamed)"])), [concepts]);
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);
  const summary = !concepts.length
    ? "Your model is empty. Add a concept to get started."
    : issues.length
      ? `${issues.length} thing${issues.length === 1 ? "" : "s"} to look at: ${issues.map((i) => i.title.toLowerCase()).join("; ")}.`
      : "No problems found: every concept is named, connected and in a module.";
  const levelStyle = {
    step: { box: "border-teal-200 bg-teal-50/60", icon: <ChevronRight size={13} className="text-teal-700 shrink-0 mt-0.5" /> },
    warn: { box: "border-amber-200 bg-amber-50/70", icon: <Info size={13} className="text-amber-700 shrink-0 mt-0.5" /> },
    tip: { box: "border-slate-200 bg-slate-50", icon: <HelpCircle size={13} className="text-slate-500 shrink-0 mt-0.5" /> },
  };
  return (
    <FoldableBox
      storageKey={storageKey}
      icon={Check}
      title="Model check"
      badge={concepts.length ? (issues.length ? `${issues.length} suggestion${issues.length === 1 ? "" : "s"}` : "all good") : undefined}
      summary={summary}
      defaultOpen
    >
      {!issues.length ? (
        <p className="text-xs text-slate-500">{summary} This check runs automatically while you build.</p>
      ) : (
        <div className="space-y-2">
          {issues.map((it) => (
            <div key={it.id} className={`rounded-md border p-2.5 text-xs ${levelStyle[it.level].box}`}>
              <div className="flex items-start gap-1.5">
                {levelStyle[it.level].icon}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">{it.title}</p>
                  <p className="text-slate-600 mt-0.5">{it.text}</p>
                  {(it.concepts?.length || it.edges?.length) ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(it.concepts || []).slice(0, 12).map((id) => (
                        <button key={id} onClick={() => onSelectConcept(id)} className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] text-slate-700 hover:border-teal-500 hover:text-teal-800" title="Show this concept on the map">
                          {nameOf.get(id)}
                        </button>
                      ))}
                      {(it.edges || []).slice(0, 12).map((id) => {
                        const e = edgeById.get(id);
                        return e ? (
                          <button key={id} onClick={() => onSelectEdge(id)} className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-[11px] text-slate-700 hover:border-teal-500 hover:text-teal-800" title="Show this relationship on the map">
                            {nameOf.get(e.source)} &rarr; {nameOf.get(e.target)}
                          </button>
                        ) : null;
                      })}
                      {((it.concepts?.length || 0) + (it.edges?.length || 0)) > 12 && (
                        <span className="text-[11px] text-slate-400 self-center">+{(it.concepts?.length || 0) + (it.edges?.length || 0) - 12} more</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Click a name to jump to it on the map. This check runs automatically while you build.</p>
        </div>
      )}
    </FoldableBox>
  );
}

// Module names already in use, offered as suggestions in every module
// field so a module is picked rather than retyped (and mistyped).
function ModuleSuggestions({ concepts }) {
  const modules = useMemo(() => listModules(concepts).filter((m) => m.key !== UNCATEGORIZED_MODULE), [concepts]);
  return (
    <datalist id="se-module-options">
      {modules.map((m) => <option key={m.key} value={m.categoryValue} />)}
    </datalist>
  );
}

// ============================================================================
// Network tab
// ============================================================================
function NetworkTab(props) {
  return (
    <ReactFlowProvider>
      <div className="space-y-5">
        <NetworkTabInner {...props} />
        <ModelCheck
          concepts={props.allConcepts || props.concepts} edges={props.allEdges || props.edges}
          onSelectConcept={(id) => props.onReveal?.("concept", id)} onSelectEdge={(id) => props.onReveal?.("edge", id)}
        />
        <ModuleGuide
          concepts={props.allConcepts || props.concepts} edges={props.allEdges || props.edges}
          networkView={props.networkView} setNetworkView={props.setNetworkView}
          viewInfo={props.viewInfo} displayMode={props.displayMode}
        />
      </div>
    </ReactFlowProvider>
  );
}

function NetworkTabInner({
  concepts, edges, selected, setSelected,
  updateConcept, updateEdge, removeConcept, removeEdge, moveConcept,
  addConceptAt, createEdge, applyBulkPositions,
  commitHistory, undo, redo, canUndo, canRedo,
  copyConcept, pasteConcept, hasClipboard, hasRun, setChartCache,
  modules = EMPTY_ARRAY, networkView = DEFAULT_NETWORK_VIEW, setNetworkView, viewInfo, newConceptCategory = "",
  displayMode = "hide", setDisplayMode, fadedNodeIds = null, fadedEdgeIds = null,
  allConcepts = null, focusRequest = null, focusNameId = null, onNameFocused,
}) {
  const wrapperRef = useRef(null);
  // Mirrors `concepts` every render without being a dependency of anything:
  // read via .current inside the keyboard-shortcut effect below so that
  // effect doesn't need `concepts` in its own dependency array (see the
  // comment there for why that matters).
  const conceptsRef = useRef(concepts);
  conceptsRef.current = concepts;
  // Background snapshot of the canvas for the Export Analysis Workbook,
  // re-taken a beat after the model changes. It rasterises the entire canvas
  // subtree (clone + inline every computed style + serialise + draw at 2x),
  // so its cost scales with the size of the graph — on a large model that is
  // a visible stall landing right after you finish moving something, for a
  // picture nobody has asked for yet. Above a size threshold we stop taking
  // it automatically; the Export PNG button and the workbook's own
  // capture-on-export still produce the same image on demand.
  const graphTooBigToAutoCapture = concepts.length + edges.length > 120;
  useCachedChart(
    graphTooBigToAutoCapture ? null : setChartCache,
    "networkGraph", '[data-chart="network-graph"]', "dom", [concepts, edges, graphTooBigToAutoCapture]
  );
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  // True only between a drag starting and ending — not per frame — so it can
  // gate per-frame work without itself causing per-frame renders.
  const [isDragging, setIsDragging] = useState(false);
  const [edgeStyle, setEdgeStyle] = useState("curved");
  const rf = useReactFlow();

  // ==== Inspector helpers ===================================================
  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  // Every module in the model (not only those in view), offered as one-click
  // choices so a concept's module is picked rather than retyped.
  const moduleList = useMemo(
    () => listModules(allConcepts || concepts).filter((m) => m.key !== UNCATEGORIZED_MODULE),
    [allConcepts, concepts]
  );
  const [linkDir, setLinkDir] = useState("out");
  const [linkTarget, setLinkTarget] = useState("");
  useEffect(() => { setLinkTarget(""); }, [selected?.id]);
  const nameInputRef = useRef(null);

  // ==== self-healing measurement =============================================
  // React Flow measures each node once, via a ResizeObserver, and keeps every
  // node invisible (and drops every edge attached to it, because it has no
  // handle bounds to route to) until that measurement lands. If the very
  // first measurement is missed or comes back empty — the canvas mounted
  // while the tab/window was hidden or still zero-height, the machine was
  // busy, the browser skipped rendering steps — React Flow does NOT retry,
  // and the graph stays blank indefinitely. That is the "model disappeared,
  // and only a refresh or a tab switch brings it back" failure, and the
  // bigger the model the wider the window for it to happen in.
  // This watches React Flow's own "are all nodes measured yet" signal and,
  // while the answer is no, keeps asking it to re-measure — immediately, on
  // a couple of backoff timers, and whenever the page becomes visible or the
  // container resizes (both of which mean sizes that were unavailable before
  // may be available now). It is a no-op the moment measurement succeeds.
  const updateNodeInternals = useUpdateNodeInternals();
  const conceptIdsRef = useRef([]);
  conceptIdsRef.current = concepts.map((c) => c.id);

  // Ask React Flow to re-read any node it currently has no measurement for.
  // Deliberately driven off the *measurements themselves* rather than off
  // useNodesInitialized(): that flag reports whether nodes were ever
  // measured, and it stays true when a bulk position change (Auto Arrange)
  // makes React Flow drop those measurements again — which is precisely the
  // case that left the canvas blank, every node invisible and every edge
  // unrouted, with nothing to bring it back.
  const healUnmeasuredNodes = useCallback(() => {
    const ids = conceptIdsRef.current;
    if (!ids.length) return false;
    // Cheap gate first. React Flow marks an unmeasured node by hiding it, so
    // one querySelector answers "is anything broken?" without allocating,
    // which matters because this runs on a timer forever — walking the whole
    // node list every tick instead churned megabytes a second of garbage on
    // a large model for a question that is almost always "no".
    if (!wrapperRef.current?.querySelector('.react-flow__node[style*="visibility: hidden"]')) return false;
    let stale;
    try {
      stale = rf.getNodes().filter((n) => !n.measured?.width || !n.measured?.height).map((n) => n.id);
    } catch {
      return false;
    }
    if (!stale.length) return false;
    updateNodeInternals(stale);
    return true;
  }, [rf, updateNodeInternals]);

  // Watchdog. A blank canvas is never an acceptable resting state, so this
  // keeps checking cheaply (one pass over the node list) and repairs it
  // without the user having to switch tabs or reload. It also re-checks
  // whenever the page becomes visible or the container resizes, since a
  // canvas that mounted while hidden or zero-sized is the other way nodes
  // end up unmeasured.
  useEffect(() => {
    const id = setInterval(healUnmeasuredNodes, 400);
    document.addEventListener("visibilitychange", healUnmeasuredNodes);
    window.addEventListener("resize", healUnmeasuredNodes);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", healUnmeasuredNodes);
      window.removeEventListener("resize", healUnmeasuredNodes);
    };
  }, [healUnmeasuredNodes]);
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
  // without dominating the visual. Enlarged alongside the thicker edge
  // strokes so arrowheads stay a clearly visible, deliberate focal point
  // against the smaller, pastel-category nodes.
  const markerSize = 9;

  // Nodes touched by the currently-selected edge — passed into their
  // ConceptNode as data.showAnchors so selecting an edge reveals both its
  // endpoints' anchor points, not just whichever node the pointer happens
  // to be resting on.
  const selectedEdgeNodeIds = useMemo(() => {
    if (selected?.kind !== "edge") return null;
    const e = edges.find((e) => e.id === selected.id);
    return e ? new Set([e.source, e.target]) : null;
  }, [selected, edges]);

  // Which anchors each node actually has an edge pinned to as a TARGET.
  // ConceptNode renders a target-type handle only for these (plus the
  // always-present default), instead of duplicating all 12. Keyed on `edges`
  // alone, so the arrays stay referentially stable across a drag.
  const pinnedTargetsByNode = useMemo(() => {
    const map = {};
    edges.forEach((e) => {
      const t = normalizeHandleId(e.targetHandle);
      if (!t || t === DEFAULT_TARGET_ANCHOR) return;
      if (!map[e.target]) map[e.target] = [];
      if (!map[e.target].includes(t)) map[e.target].push(t);
    });
    return map;
  }, [edges]);

  const rfNodes = useMemo(() => concepts.map((c) => ({
    id: c.id, type: "concept", position: c.position || { x: 0, y: 0 },
    data: {
      concept: c, hasRun,
      showAnchors: !!selectedEdgeNodeIds?.has(c.id),
      pinnedTargets: pinnedTargetsByNode[c.id] || EMPTY_ARRAY,
      faded: !!fadedNodeIds?.has(c.id),
    },
    selected: selected?.kind === "concept" && selected.id === c.id,
  })), [concepts, selected, hasRun, selectedEdgeNodeIds, pinnedTargetsByNode, fadedNodeIds]);

  // Distinct categories actually in use, for the color-coding legend below
  // the canvas — only categories someone has actually set are listed, same
  // convention as the category tables elsewhere in the app.
  const categoriesPresent = useMemo(
    () => listModules(concepts).filter((m) => m.key !== UNCATEGORIZED_MODULE).map((m) => m.categoryValue),
    [concepts]
  );

  // Fan-out slots, frozen for the duration of a drag. For every edge END the
  // user hasn't pinned to a specific anchor, computeEdgeSlots works out which
  // side of its box faces the other node and gives each edge sharing that
  // (node, side) its own slot, so they spread along the face instead of
  // stacking on one point — which is also what separates a reciprocal
  // A->B / B->A pair onto two clearly different points.
  //
  // Measured at 120 concepts / 360 relationships, recomputing this was ~88%
  // of all the JavaScript re-run on every single frame of every drag, and it
  // buys nothing mid-gesture: the fan-out only has to be right where the
  // node comes to rest. Holding it steady also keeps the edge objects below
  // referentially stable during a drag, so React Flow re-routes only the
  // edges actually attached to the node being moved instead of diffing every
  // edge in the graph.
  //
  // Note this feeds only `data` (how the edge draws itself), never
  // sourceHandle/targetHandle. Those stay constant (see resolvedHandles): a
  // handle id that changed as a node moved forced React Flow to re-resolve
  // handle bounds every frame, and an id it couldn't resolve in time made it
  // drop the edge outright — one of the ways the model could vanish mid-drag.
  const edgeSlotsRef = useRef({});
  const edgeSlots = useMemo(() => {
    if (isDragging) return edgeSlotsRef.current;
    edgeSlotsRef.current = computeEdgeSlots(concepts, edges);
    return edgeSlotsRef.current;
  }, [concepts, edges, isDragging]);

  // The handle ids handed to React Flow. A hand-pinned anchor is passed
  // through exactly (normalized for older models that only recorded one
  // handle per side); everything else gets a FIXED placeholder. Unpinned
  // ends don't draw from their handle at all — InfluenceEdge overrides
  // their coordinates with live boundary geometry — so the placeholder only
  // has to be a real, always-present handle id, and keeping it constant is
  // what removes per-frame handle churn during a drag.
  const resolvedHandles = useMemo(() => {
    const map = {};
    edges.forEach((e) => {
      map[e.id] = {
        sourceHandle: normalizeHandleId(e.sourceHandle) || "r-c",
        targetHandle: normalizeHandleId(e.targetHandle) || "l-c",
      };
    });
    return map;
  }, [edges]);

  // Reciprocal pairs (A->B and B->A) also get their curves bowed apart in
  // opposite directions, on top of the endpoint fan-out above, so the two
  // are distinguishable along their whole length and not just where they
  // meet the boxes. Skipped when every end of both edges is hand-pinned:
  // there the user has said exactly where they want the line, so nothing
  // should nudge it.
  const parallelSlots = useMemo(() => {
    const groups = {};
    edges.forEach((e) => {
      const key = [e.source, e.target].sort().join("|");
      (groups[key] = groups[key] || []).push(e);
    });
    const slots = {};
    Object.values(groups).forEach((group) => {
      if (group.length < 2) { slots[group[0].id] = 0; return; }
      const allPinned = group.every((e) => normalizeHandleId(e.sourceHandle) && normalizeHandleId(e.targetHandle));
      if (allPinned) { group.forEach((e) => { slots[e.id] = 0; }); return; }
      [...group].sort((a, b) => a.id.localeCompare(b.id))
        .forEach((e, i) => { slots[e.id] = i % 2 === 0 ? Math.ceil((i + 1) / 2) : -Math.ceil(i / 2); });
    });
    return slots;
  }, [edges]);

  const rfEdges = useMemo(() => edges.map((e) => {
    const h = resolvedHandles[e.id];
    const slot = edgeSlots[e.id] || {};
    return {
      id: e.id, source: e.source, target: e.target, type: "influence",
      sourceHandle: h.sourceHandle, targetHandle: h.targetHandle,
      data: {
        edge: e, edgeStyle, parallelSlot: parallelSlots[e.id] || 0,
        sourceSlot: slot.sourceSlot ?? 0, sourceCount: slot.sourceCount ?? 1,
        targetSlot: slot.targetSlot ?? 0, targetCount: slot.targetCount ?? 1,
        faded: !!fadedEdgeIds?.has(e.id),
      },
      // Out-of-scope relationships sit underneath the in-scope ones.
      zIndex: fadedEdgeIds?.has(e.id) ? 0 : 1,
      selected: selected?.kind === "edge" && selected.id === e.id,
      reconnectable: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: e.weight >= 0 ? "#16a34a" : "#ea580c", width: markerSize, height: markerSize },
    };
  }), [edges, selected, edgeStyle, parallelSlots, markerSize, resolvedHandles, edgeSlots, fadedEdgeIds]);

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
        // Drag start/end only — setIsDragging is a no-op when the value is
        // unchanged, so this doesn't add a render per frame; it just lets the
        // per-frame work above (edgeSlots) be skipped for the gesture.
        if (ch.dragging === true) setIsDragging(true);
        if (ch.dragging === false) { setIsDragging(false); commitHistory(); }
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

  // A new concept is created in the module currently in view, and — since it
  // starts with no relationships — isolated concepts are switched back on if
  // they were hidden, so it doesn't vanish the moment it's added.
  const addVisibleConcept = useCallback((pos) => {
    commitHistory();
    addConceptAt(pos, newConceptCategory);
    if (setNetworkView && !networkView.showIsolated) setNetworkView((v) => ({ ...v, showIsolated: true }));
  }, [commitHistory, addConceptAt, newConceptCategory, setNetworkView, networkView.showIsolated]);

  const onPaneDoubleClick = useCallback((e) => {
    addVisibleConcept(rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [rf, addVisibleConcept]);

  // `concepts`/`edges` here are only what the current view shows. A selection
  // made before the view changed can point at something now hidden, and it
  // must not stay live: the side panel would lose it, and Delete would remove
  // a concept the user can no longer see.
  useEffect(() => {
    if (!selected) return;
    const visible = selected.kind === "concept"
      ? concepts.some((c) => c.id === selected.id)
      : edges.some((e) => e.id === selected.id);
    if (!visible) setSelected(null);
  }, [selected, concepts, edges, setSelected]);

  // Re-frame the canvas whenever the view changes, so switching to a small
  // module doesn't leave it as a speck in one corner of the old framing.
  const viewKey = displayMode === "focus" ? "focus" : `${networkView.mode}|${(networkView.selected || []).join(",")}|${networkView.showIsolated}`;
  const firstViewRef = useRef(true);
  useEffect(() => {
    if (firstViewRef.current) { firstViewRef.current = false; return; }
    const t = setTimeout(() => rf.fitView({ padding: 0.2, duration: 300, maxZoom: FIT_MAX_ZOOM }), 60);
    const t2 = setTimeout(healUnmeasuredNodes, 400);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [viewKey, rf, healUnmeasuredNodes]);

  // A concept that was just created gets its name field focused and selected,
  // so the user can simply start typing its name.
  const selectedConceptId = selected?.kind === "concept" ? selected.id : null;
  useEffect(() => {
    if (!focusNameId || selectedConceptId !== focusNameId) return;
    const el = nameInputRef.current;
    if (el) { el.focus(); el.select(); }
    onNameFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNameId, selectedConceptId]);

  // Centre the map on something the user asked to be shown elsewhere (the
  // Model check, or a concept picked on another tab).
  useEffect(() => {
    if (!focusRequest) return;
    const pos = (id) => conceptsRef.current.find((c) => c.id === id)?.position;
    const pts = focusRequest.kind === "edge" ? [pos(focusRequest.source), pos(focusRequest.target)] : [pos(focusRequest.id)];
    if (pts.some((p) => !p)) return;
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length + 80;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length + 35;
    const t = setTimeout(() => rf.setCenter(x, y, { zoom: Math.max(rf.getZoom(), 0.9), duration: 450 }), 120);
    return () => clearTimeout(t);
  }, [focusRequest, rf]);

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
          const c = conceptsRef.current.find((c) => c.id === selected.id);
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
    // `concepts` deliberately excluded (read via conceptsRef.current inside
    // the handler instead): it changes on every single position update
    // while a node is being dragged, and listing it here meant this effect
    // tore down and re-attached two window-level listeners on every one of
    // those updates — for a real, continuous mouse drag (many position
    // updates per second, not just one), that's a lot of listener churn
    // firing on every animation frame for the full duration of every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, commitHistory, removeConcept, removeEdge, copyConcept, pasteConcept, hasClipboard, undo, redo]);

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
      // Moving every node at once makes React Flow discard its per-node
      // measurements, and it does not reliably take them again on its own:
      // left alone, an Auto Arrange on a large model ends with every node
      // invisible and every edge unrouted — a blank canvas that never comes
      // back. Explicitly telling it to re-read the nodes it just had moved
      // out from under it is the documented way to resolve that, and the
      // watchdog above is the backstop if any node still slips through.
      setTimeout(() => {
        updateNodeInternals(next.map((c) => c.id));
        rf.fitView({ padding: 0.2, duration: 300, maxZoom: FIT_MAX_ZOOM });
      }, 50);
      setTimeout(healUnmeasuredNodes, 400);
    } finally {
      setLayoutBusy(false);
    }
  };

  const exportDiagram = async () => {
    setExportingPng(true);
    try {
      await exportNetworkDiagramAsPng(wrapperRef.current, "spaghetti-engine-network-diagram.png");
    } finally {
      setExportingPng(false);
    }
  };

  const selectedConcept = selected?.kind === "concept" ? concepts.find((c) => c.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) : null;

  return (
    <div className="grid grid-cols-[1fr_300px] gap-5 h-[700px]">
      <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-col relative">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Btn variant="outline" onClick={() => addVisibleConcept({ x: 200 + Math.random() * 200, y: 150 + Math.random() * 150 })}>
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
          {setDisplayMode && (
            <div className="flex items-center border border-slate-300 rounded-md overflow-hidden text-xs" role="group" aria-label="Out-of-scope display">
              <button
                onClick={() => setDisplayMode("hide")}
                title="Hide mode: concepts and relationships outside the analysis scope are removed from the canvas"
                className={`px-2.5 py-1.5 flex items-center gap-1 ${displayMode === "hide" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              ><EyeOff size={12} />Hide</button>
              <button
                onClick={() => setDisplayMode("focus")}
                title="Focus mode: everything stays on the canvas; concepts and relationships outside the analysis scope are faded for context"
                className={`px-2.5 py-1.5 border-l border-slate-300 flex items-center gap-1 ${displayMode === "focus" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              ><Eye size={12} />Focus</button>
            </div>
          )}
          <Btn variant="outline" onClick={exportDiagram} disabled={exportingPng} title="Download the current diagram exactly as shown (layout, colors, zoom/pan) as a PNG image">
            <Download size={14} />{exportingPng ? "Exporting..." : "Export PNG"}
          </Btn>
          <span className="text-[11px] text-slate-400 ml-auto italic">
            {spaceHeld ? "Pan mode (space held)" : "Drag any side of a node to connect it (top, right, bottom, or left); double-click empty space to add a concept"}
          </span>
        </div>

        {networkView.mode === "nexus" && (
          <p className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {displayMode === "focus"
              ? "Nexus Interface: relationships between different modules are drawn normally; relationships inside a module are faded and left out of every analysis."
              : "Nexus Interface: only relationships between different modules are drawn. A new relationship between two concepts of the same module is still saved to the model, but it won't appear until you switch back to Modules."}
          </p>
        )}
        {displayMode === "focus" && viewInfo?.isFiltered && networkView.mode !== "nexus" && (
          <p className="mb-2 text-[11px] text-slate-500">
            Focus mode: faded concepts and relationships are outside the analysis scope. They are shown for context only and excluded from every analysis.
          </p>
        )}
        {viewInfo?.isFiltered && concepts.length === 0 && (
          <p className="mb-2 text-[11px] text-slate-500">Nothing to show in this view. Try including isolated concepts or more modules.</p>
        )}

        <div
          ref={wrapperRef} data-chart="network-graph" className="relative flex-1 rounded-lg overflow-hidden border border-slate-200" onWheelCapture={onWheelCapture}
          onDoubleClick={(e) => {
            // Only add a concept when the double-click lands on empty canvas:
            // not on a node, edge, handle, or a UI control like the minimap.
            if (e.target.closest(".react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__minimap, .react-flow__controls")) return;
            onPaneDoubleClick(e);
          }}
        >
          {concepts.length === 0 && !viewInfo?.isFiltered && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="max-w-sm text-center bg-white/90 border border-slate-200 rounded-lg shadow-sm px-5 py-4">
                <p className="text-sm font-semibold text-slate-700">Your map is empty</p>
                <p className="text-xs text-slate-500 mt-1">
                  Double-click anywhere here to add your first concept, or use <strong>Add concept</strong> above.
                  To start from an example instead, pick one from <strong>New / example model</strong> at the top right.
                </p>
              </div>
            </div>
          )}
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
              fitViewOptions={{ padding: 0.2, maxZoom: FIT_MAX_ZOOM }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => categoryStyle(n.data?.concept?.category).bg} className="!bg-white" />
            </ReactFlow>
          </ErrorBoundary>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2 px-1 flex-wrap">
          {categoriesPresent.length > 0 ? (
            categoriesPresent.map((cat) => {
              const s = categoryStyle(cat);
              return (
                <span key={cat} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm inline-block border" style={{ background: s.bg, borderColor: s.border }} />
                  {cat}
                </span>
              );
            })
          ) : (
            <span className="italic text-slate-400">Give a concept a module (select it, then pick or type one in the Inspector) to colour-code the map by module.</span>
          )}
          <span className="flex items-center gap-1 ml-2"><span className="w-4 h-0.5 inline-block bg-green-600" /> positive influence</span>
          <span className="flex items-center gap-1"><span className="w-4 h-0.5 inline-block bg-orange-600" /> negative influence</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 overflow-auto flex flex-col">
        <h3 className="font-semibold text-sm mb-3">Inspector</h3>
        {selectedConcept && (() => {
          const c = selectedConcept;
          const outgoing = edges.filter((e) => e.source === c.id);
          const incoming = edges.filter((e) => e.target === c.id);
          const currentModule = moduleKey(c.category);
          const linkOptions = concepts.filter((o) => o.id !== c.id);
          const linked = new Set((linkDir === "out" ? outgoing.map((e) => e.target) : incoming.map((e) => e.source)));
          const RelRow = ({ e, otherId, arrow }) => (
            <button
              onClick={() => setSelected({ kind: "edge", id: e.id })}
              className="w-full flex items-center gap-1.5 text-left text-[11px] px-1.5 py-1 rounded hover:bg-slate-100"
              title={relationshipSentence(conceptById.get(e.source)?.name, conceptById.get(e.target)?.name, e.weight)}
            >
              <span className="text-slate-400 shrink-0">{arrow}</span>
              <span className="flex-1 truncate">{conceptById.get(otherId)?.name}</span>
              <span className={`font-mono shrink-0 ${e.weight >= 0 ? "text-green-700" : "text-orange-700"}`}>{e.weight > 0 ? "+" : ""}{round2(e.weight)}</span>
            </button>
          );
          return (
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-slate-500">Concept name</label>
                <input
                  ref={nameInputRef}
                  value={c.name}
                  onChange={(e) => updateConcept(c.id, { name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="What does this concept stand for?"
                  className="w-full text-sm font-medium border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500" title="The subsystem of the nexus this concept belongs to (its category).">Module</label>
                {moduleList.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {moduleList.map((m) => {
                      const st = categoryStyle(m.categoryValue);
                      const on = m.key === currentModule;
                      return (
                        <button
                          key={m.key}
                          onClick={() => { if (!on) { commitHistory(); updateConcept(c.id, { category: m.categoryValue }); } }}
                          className={`px-1.5 py-0.5 rounded border text-[11px] ${on ? "ring-2 ring-teal-500 text-slate-900 font-medium" : "text-slate-600 hover:ring-1 hover:ring-slate-400"}`}
                          style={{ background: st.bg, borderColor: st.border }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  list="se-module-options"
                  value={c.category || ""}
                  onChange={(e) => updateConcept(c.id, { category: e.target.value })}
                  placeholder={moduleList.length ? "or type a new module name" : "e.g. Water, Energy, Food"}
                  className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
                />
                {viewInfo?.isFiltered && displayMode === "hide" && (
                  <p className="text-[10px] text-amber-700 mt-0.5">Moving it to a module outside the current analysis scope hides it from this view.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={c.description || ""}
                  onChange={(e) => updateConcept(c.id, { description: e.target.value })}
                  placeholder="What it means and how it is measured (optional)"
                  className="w-full text-xs border border-slate-200 rounded p-1.5 h-14"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500" title="Initial activation, A(0): where this concept starts in a simulation.">Starting value</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={-1} max={1} step={0.05} value={c.initialValue ?? 0}
                    onChange={(e) => updateConcept(c.id, { initialValue: clamp(parseFloat(e.target.value) || 0) })}
                    className="flex-1 accent-teal-700" aria-label="Starting value"
                  />
                  <input
                    type="number" min={-1} max={1} step={0.05} value={c.initialValue ?? 0}
                    onChange={(e) => updateConcept(c.id, { initialValue: clamp(parseFloat(e.target.value) || 0) })}
                    className="w-14 text-xs font-mono text-right border border-slate-200 rounded px-1 py-0.5"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400"><span>&minus;1 very low</span><span>0 neutral</span><span>+1 very high</span></div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {hasRun ? "Simulated activation" : "Not simulated yet"}: <span className="font-mono font-semibold">{round2(hasRun ? c.currentValue : c.initialValue)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-600 mb-1">Relationships</div>
                <div className="text-[11px] text-slate-400">Affects ({outgoing.length})</div>
                {outgoing.length ? outgoing.map((e) => <RelRow key={e.id} e={e} otherId={e.target} arrow="&rarr;" />) : <p className="text-[11px] text-slate-300 italic px-1.5">nothing yet</p>}
                <div className="text-[11px] text-slate-400 mt-1">Affected by ({incoming.length})</div>
                {incoming.length ? incoming.map((e) => <RelRow key={e.id} e={e} otherId={e.source} arrow="&larr;" />) : <p className="text-[11px] text-slate-300 italic px-1.5">nothing yet</p>}
                {linkOptions.length > 0 && (
                  <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-600">Add a relationship</div>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500 shrink-0">This concept</span>
                      <select value={linkDir} onChange={(e) => setLinkDir(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 bg-white text-[11px]">
                        <option value="out">affects</option>
                        <option value="in">is affected by</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <select value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} className="flex-1 min-w-0 border border-slate-300 rounded px-1 py-0.5 bg-white text-[11px]">
                        <option value="">choose a concept</option>
                        {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.name}{linked.has(o.id) ? " (already linked)" : ""}</option>)}
                      </select>
                      <button
                        disabled={!linkTarget}
                        onClick={() => {
                          commitHistory();
                          if (linkDir === "out") createEdge(c.id, linkTarget); else createEdge(linkTarget, c.id);
                          setLinkTarget("");
                        }}
                        className="px-2 py-0.5 rounded bg-teal-700 text-white text-[11px] disabled:opacity-40"
                      >Add</button>
                    </div>
                    <p className="text-[10px] text-slate-400">You can then set whether it increases or decreases, and how strongly. Or drag from a dot on the concept's edge to another concept.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button onClick={() => copyConcept(c)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><Copy size={13} /> Copy (Ctrl+C)</button>
                <button onClick={() => { commitHistory(); removeConcept(c.id); }} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700"><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          );
        })()}
        {selectedEdge && (() => {
          const e = selectedEdge;
          const src = conceptById.get(e.source), tgt = conceptById.get(e.target);
          const w = e.weight;
          const reverseExists = edges.some((o) => o.source === e.target && o.target === e.source);
          const setWeight = (v) => { commitHistory(); updateEdge(e.id, { weight: round2(v) }); };
          const magnitude = Math.abs(w) || 0.5;
          return (
            <div className="space-y-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-700 leading-snug">
                {relationshipSentence(src?.name, tgt?.name, w)}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 items-baseline text-xs">
                <span className="text-slate-500">From</span>
                <button onClick={() => setSelected({ kind: "concept", id: e.source })} className="text-left font-medium truncate hover:text-teal-700" title="Select this concept">{src?.name}</button>
                <span className="text-slate-500">To</span>
                <button onClick={() => setSelected({ kind: "concept", id: e.target })} className="text-left font-medium truncate hover:text-teal-700" title="Select this concept">{tgt?.name}</button>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Effect</div>
                <div className="grid grid-cols-2 border border-slate-300 rounded-md overflow-hidden text-xs">
                  <button onClick={() => setWeight(magnitude)} className={`py-1.5 ${w > 0 ? "bg-green-600 text-white" : "bg-white text-slate-600 hover:bg-green-50"}`}>Increases (+)</button>
                  <button onClick={() => setWeight(-magnitude)} className={`py-1.5 border-l border-slate-300 ${w < 0 ? "bg-orange-600 text-white" : "bg-white text-slate-600 hover:bg-orange-50"}`}>Decreases (&minus;)</button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Increases: more {src?.name} leads to more {tgt?.name}. Decreases: more {src?.name} leads to less {tgt?.name}.</p>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Strength</div>
                <div className="grid grid-cols-4 gap-1">
                  {STRENGTH_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setWeight((w < 0 ? -1 : 1) * p.value)}
                      className={`py-1 rounded border text-[11px] leading-tight ${Math.abs(Math.abs(w) - p.value) < 1e-9 ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                      title={`Weight ${w < 0 ? "−" : "+"}${p.value}`}
                    >{p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block">Fine-tune the weight</label>
                <WeightSlider value={w} onChange={(v) => updateEdge(e.id, { weight: v })} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Description</label>
                <textarea
                  value={e.description || ""}
                  onChange={(ev) => updateEdge(e.id, { description: ev.target.value })}
                  placeholder="Why does this relationship exist? (evidence, source, stakeholder)"
                  className="w-full text-xs border border-slate-200 rounded p-1.5 h-14"
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  disabled={reverseExists}
                  onClick={() => { commitHistory(); updateEdge(e.id, { source: e.target, target: e.source, sourceHandle: undefined, targetHandle: undefined }); }}
                  className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={reverseExists ? "A relationship in the other direction already exists" : "Make it point the other way"}
                >
                  <Shuffle size={13} /> Reverse direction
                </button>
                <button onClick={() => { commitHistory(); removeEdge(e.id); }} className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                  <Trash2 size={13} /> Delete relationship
                </button>
              </div>
            </div>
          );
        })()}
        {!selectedConcept && !selectedEdge && (
          <div className="text-xs text-slate-500 space-y-2">
            <p className="text-slate-400">Nothing selected. Click a concept or a relationship on the map to see and edit it here.</p>
            <p className="font-medium text-slate-600">Building a map in four steps</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Add a concept:</strong> double-click an empty spot on the map, or use Add concept.</li>
              <li><strong>Name it and choose its module</strong> here, in the Inspector.</li>
              <li><strong>Connect concepts:</strong> drag from a dot on a concept's edge onto another concept, or use "Add a relationship" here.</li>
              <li><strong>Click the relationship</strong> to say whether it increases or decreases the other concept, and how strongly.</li>
            </ol>
            <p className="text-slate-400">Mistake? Undo with Ctrl+Z. Your model is saved in this browser automatically.</p>
          </div>
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
  driverScore: "Share of the concept's total connection weight that is outgoing: out-degree / (in-degree + out-degree), 0-1. 1 = pure driver (only sends influence).",
  receiverScore: "Share of the concept's total connection weight that is incoming: in-degree / (in-degree + out-degree), 0-1. 1 = pure receiver (only receives influence). Driver and receiver scores sum to 1.",
  betweenness: "Directed betweenness centrality: the share of shortest directed routes between every other pair of concepts that pass through this one (unweighted, normalised 0-1). High values mark brokers that connect otherwise distant parts of the system.",
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
  clustering: "Average local clustering coefficient (undirected): of the pairs of concepts linked to a concept, the share that are also linked to each other, averaged over concepts with at least two neighbours. High = tightly knit groups of mutual influence; low = chain- or star-like structure.",
  modularity: "Newman-Girvan modularity Q of the partition given by the concepts' modules (categories), on the undirected network weighted by |weight|. Clearly positive = modules are more tightly connected internally than to each other; near 0 = module boundaries don't follow the network's structure; negative = they cut across it. Scores the categories you defined, not an optimal partition.",
  interfaceEdges: "Relationships whose two concepts belong to different modules: the coupling between subsystems, as a count and as a share of all relationships in scope.",
  betweenness: "Concept with the highest betweenness: the share of shortest directed routes between other concepts that pass through it (unweighted, normalised 0-1). High betweenness = a broker that many routes between parts of the system depend on.",
};

// Real text-measurement (not a character-count guess) so long concept names
// get exactly the axis width they need, no more and no less.
function measureTextWidth(text, font = "10px Inter, system-ui, sans-serif") {
  if (typeof document === "undefined") return text.length * 6;
  const canvas = measureTextWidth._canvas || (measureTextWidth._canvas = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  return ctx.measureText(text).width;
}

const ROLE_STYLE = {
  Hub: "bg-purple-50 text-purple-700",
  Driver: "bg-blue-50 text-blue-700",
  Receiver: "bg-orange-50 text-orange-700",
  Connector: "bg-teal-50 text-teal-700",
  Isolated: "bg-slate-100 text-slate-500",
};

// Columns of the Influence metrics table. Every one is sortable: clicking a
// heading ranks the concepts by it, which replaces the separate "most
// influential / most sensitive / most connected" lists with one table that
// can answer any of those questions (and the equivalent for every other
// measure). Numbers sort highest-first on the first click, text A-Z.
const METRIC_TABLE_COLUMNS = [
  { key: "name", label: "Concept", type: "text" },
  { key: "moduleLabel", label: "Module", type: "text", help: "The concept's module (its category)." },
  { key: "indegree", label: "Indegree", type: "num" },
  { key: "outdegree", label: "Outdegree", type: "num" },
  { key: "netInfluence", label: "Net influence", type: "num" },
  { key: "centrality", label: "Centrality", type: "num" },
  { key: "driverScore", label: "Driver score", type: "num" },
  { key: "receiverScore", label: "Receiver score", type: "num" },
  { key: "betweenness", label: "Betweenness", type: "num" },
  { key: "influence", label: "Influence score", type: "num" },
  { key: "sensitivity", label: "Sensitivity score", type: "num" },
  { key: "role", label: "Role", type: "text" },
];

function InfluenceMetricsTab({ concepts, edges, settings, onHighlight, multiScale = null, multiScaleFresh = true, viewInfo = null }) {
  const [sort, setSort] = useState({ key: "influence", dir: "desc" });
  const structural = useMemo(() => computeMetrics(concepts, edges), [concepts, edges]);
  const advanced = useMemo(() => computeAdvancedMetrics(concepts, edges, settings), [concepts, edges, settings]);
  const moduleLabelOf = useMemo(() => {
    const labels = new Map(listModules(concepts).map((m) => [m.key, m.label]));
    return new Map(concepts.map((c) => [c.id, labels.get(moduleKey(c.category))]));
  }, [concepts]);
  const metrics = useMemo(
    () => structural.map((m) => ({ ...m, ...advanced[m.id], moduleLabel: moduleLabelOf.get(m.id) })),
    [structural, advanced, moduleLabelOf]
  );
  const stats = useMemo(() => computeSystemStats(concepts, edges, metrics), [concepts, edges, metrics]);
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
  // Wide enough for every module name on one line (see labelAxisWidth).
  const categoryYAxisWidth = useMemo(() => labelAxisWidth(categoryStats.map((c) => c.category), { max: 360 }), [categoryStats]);
  const categoryColumns = useMemo(() => [
    { key: "category", label: "Category", type: "text" },
    { key: "concepts", label: "Concepts", type: "num" },
    { key: "internal", label: "Internal", type: "num", help: "Relationships where both endpoints are in this category." },
    { key: "incoming", label: "Incoming", type: "num", help: "Relationships coming into this category from a concept in a different category." },
    { key: "outgoing", label: "Outgoing", type: "num", help: "Relationships going out of this category to a concept in a different category." },
    { key: "meanIndegree", label: "Mean indegree", type: "num", help: METRIC_HELP.indegree },
    { key: "meanOutdegree", label: "Mean outdegree", type: "num", help: METRIC_HELP.outdegree },
    { key: "meanCentrality", label: "Mean centrality", type: "num", help: METRIC_HELP.centrality },
    { key: "meanInfluence", label: "Mean influence", type: "num", help: METRIC_HELP.influence },
    { key: "meanSensitivity", label: "Mean sensitivity", type: "num", help: METRIC_HELP.sensitivity },
    { key: "density", label: "Internal density (%)", type: "num", help: "Relationships inside the category divided by the maximum possible between its concepts, as a percentage. n/a for a category with fewer than 2 concepts." },
  ], []);
  const categorySort = useTableSort(categoryStats, categoryColumns, { key: "meanInfluence", dir: "desc" });

  // The Module column only earns its place once there is more than one module.
  const columns = useMemo(
    () => METRIC_TABLE_COLUMNS.filter((c) => c.key !== "moduleLabel" || categoryStats.length > 1),
    [categoryStats.length]
  );
  const sortCol = columns.find((c) => c.key === sort.key) || columns.find((c) => c.key === "influence");
  const sortedRows = useMemo(() => {
    const k = sortCol.key;
    const sign = sort.dir === "asc" ? 1 : -1;
    const rows = [...metrics].sort((a, b) => {
      const d = sortCol.type === "num" ? (a[k] ?? 0) - (b[k] ?? 0) : String(a[k] ?? "").localeCompare(String(b[k] ?? ""));
      return d * sign || a.name.localeCompare(b.name);
    });
    // The # column is the concept's standing on the sorted measure (#1 =
    // highest value), whichever way the list is currently ordered, so
    // reversing the order never turns the lowest concept into "#1". Tied
    // values share the better rank. Text columns just order the rows.
    if (sortCol.type !== "num") return rows.map((m) => ({ ...m, _rank: "" }));
    const ranks = rankBy(Object.fromEntries(metrics.map((m) => [m.id, m])), k);
    return rows.map((m) => ({ ...m, _rank: ranks[m.id] }));
  }, [metrics, sortCol, sort.dir]);
  const onSort = (col) => {
    setSort((s) => (s.key === col.key
      ? { key: col.key, dir: s.dir === "desc" ? "asc" : "desc" }
      : { key: col.key, dir: col.type === "num" ? "desc" : "asc" }));
  };
  const sortDescription = `${sortCol.label}, ${sortCol.type === "num" ? (sort.dir === "desc" ? "highest first" : "lowest first") : (sort.dir === "asc" ? "A to Z" : "Z to A")}`;

  const cell = (m, key) => {
    if (key === "name") return m.name;
    if (key === "moduleLabel") return m.moduleLabel;
    if (key === "role") return <span className={`px-1.5 py-0.5 rounded text-[10px] ${ROLE_STYLE[m.role] || "bg-slate-100 text-slate-600"}`}>{m.role}</span>;
    if (key === "netInfluence") return <span className={m.netInfluence > 0 ? "text-blue-700" : m.netInfluence < 0 ? "text-orange-700" : ""}>{m.netInfluence > 0 ? "+" : ""}{m.netInfluence}</span>;
    return m[key];
  };

  return (
    <div className="space-y-5">
      <FoldableBox
        storageKey="se.fold.metricsMethod"
        title="How these metrics are computed"
        summary="These metrics describe the structure of your map: which concepts drive the system, which absorb change, and which sit at its centre. Sort the table below by any column to rank the concepts on that measure, and click a row to select that concept."
      >
          <div className="space-y-3 text-xs text-slate-600">
            <p className="text-slate-500">Sort the table below by any column to rank the concepts on that measure, and click a row to select that concept (open the Network tab to see it).</p>
            <div className="space-y-2">
              <p><strong>Indegree, Outdegree, Centrality, Net Influence, and Role are purely structural</strong>: computed directly from the relationship weights you've drawn, with no simulation involved. Indegree is the sum of the absolute weights of a concept's incoming relationships; outdegree is the same for outgoing relationships; centrality is indegree + outdegree; net influence is outdegree minus indegree. Role is assigned from those numbers: <strong>Isolated</strong> has zero centrality (no relationships at all); <strong>Hub</strong> is in the top quartile of centrality among all concepts and has at least one relationship in each direction; <strong>Driver</strong> (not already a Hub) has outdegree more than 1.2&times; its indegree; <strong>Receiver</strong> (not already a Hub) has indegree more than 1.2&times; its outdegree; everything else is a <strong>Connector</strong>.</p>
              <p><strong>Driver score and Receiver score</strong> are the shares of a concept's total connection weight that are outgoing and incoming: outdegree / centrality and indegree / centrality. They always add up to 1, so they show a concept's balance between sending and receiving influence independently of how strongly connected it is overall.</p>
              <p><strong>Betweenness</strong> is the share of shortest directed routes between every other pair of concepts that pass through this one (Brandes' method, normalised to 0 to 1). It ignores weights, because weights express strength of influence rather than distance, so it measures position alone: a high value marks a broker that links otherwise distant parts of the system.</p>
              <p>Because these come straight from the relationships, they update the instant you edit one and never require running a simulation. That also means they say nothing about how the model actually <em>behaves</em> once causal effects propagate through it, which is what Influence and Sensitivity scores are for.</p>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p><strong>Influence and Sensitivity scores are perturbation-based</strong>: for each concept in turn, the model is set to all zeros, that one concept is locked at full activation (+1) for the whole run, and the simulation runs to equilibrium under the current squash function, &lambda;, update rule, and convergence settings (Scenarios &amp; Simulation's Advanced options). Every other concept always starts at exactly 0 here, regardless of what's set on the Model editor tab, so these scores measure the network's structure in isolation, not whatever initial values happen to be configured elsewhere.</p>
              <p><strong>Influence</strong> is the average absolute movement a concept <em>causes</em> in every other concept once its own driven run settles. <strong>Sensitivity</strong> is the average absolute movement a concept <em>undergoes</em>, across all of the other concepts' individual driven runs. A concept with high influence is one whose activation, if it changed, would ripple widely through the rest of the system; a concept with high sensitivity is one that tends to move regardless of which other concept is driving the change.</p>
              <p className="text-slate-400">Computing these takes one full simulation run per concept ({concepts.length} run{concepts.length === 1 ? "" : "s"} for the current model). These are the same numbers used to compute the category metrics' "Mean influence"/"Mean sensitivity" below, and are recomputed automatically whenever a concept, relationship, or Advanced option changes.</p>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <p><strong>Ranking.</strong> The # column is each concept's rank on the numeric column the table is sorted by, where #1 is the highest value; reversing the order flips the list but keeps the ranks. Concepts with exactly the same value share a rank, so two concepts tied for first are both #1 and the next one is #3. Sorting by a text column (concept, module, role) only orders the rows.</p>
            </div>
          </div>
      </FoldableBox>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-baseline gap-3 flex-wrap mb-3">
          <h3 className="font-semibold text-sm">Influence metrics: full table</h3>
          <span className="text-[11px] text-slate-400">
            Ranked by <strong className="text-slate-600">{sortDescription}</strong>. Click any column heading to rank by it; click it again to reverse the order.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 font-medium pr-2 w-8" title={`Rank by ${sortCol.label}`}>#</th>
                {columns.map((col) => {
                  const active = col.key === sortCol.key;
                  const arrow = active ? (sort.dir === "desc" ? "↓" : "↑") : "↕";
                  return (
                    <th key={col.key} className={`py-1.5 font-medium pr-3 ${active ? "text-teal-800" : ""}`} aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
                      <button
                        onClick={() => onSort(col)}
                        title={`${METRIC_HELP[col.key] || col.help || ""}${METRIC_HELP[col.key] || col.help ? "\n\n" : ""}Click to rank by ${col.label}.`}
                        className="inline-flex items-center gap-1 hover:text-slate-700 text-left"
                      >
                        {col.label}
                        <span className={active ? "text-teal-700" : "text-slate-300"}>{arrow}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => onHighlight(m.id)}>
                  <td className="py-1.5 pr-2 font-mono text-slate-400">{m._rank}</td>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-1.5 pr-3 ${col.type === "num" ? "font-mono" : ""} ${col.key === sortCol.key ? "bg-teal-50/60 font-semibold text-slate-900" : ""}`}
                    >
                      {cell(m, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {metrics.length === 0 && <tr><td colSpan={columns.length + 1} className="py-3 text-slate-400 italic">Add concepts and relationships to see metrics here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <MethodPanel
        stats={[
          { label: "Concepts / relationships", value: `${concepts.length} / ${edges.length}` },
          { label: "Simulation runs behind these scores", value: concepts.length, hint: "Influence and Sensitivity need one full driven run per concept. Structural columns (degree, centrality, role) need none." },
          { label: "Transfer function / λ", value: `${settings.squashFunction ?? "tanh"} / ${settings.lambda ?? 1}` },
          {
            label: "Feedback loops found",
            value: stats.loops.capped ? `${stats.loops.total}+ (capped)` : stats.loops.total,
            tone: stats.loops.capped ? "warn" : undefined,
            hint: "Simple cycles up to 8 relationships long, up to a maximum of 300. Hitting either limit makes the count a lower bound.",
          },
        ]}
      >
        <p><strong>The role labels depend on cut-offs that are conventions, not findings.</strong> "Hub" means centrality in the top quartile of all non-zero centralities; "Driver" and "Receiver" mean one direction exceeds the other by more than a factor of 1.2. Those numbers are choices built into this tool. A concept sitting just either side of them changes label without changing behaviour, so treat roles as a reading aid and report the underlying degree figures if a role claim matters to an argument.</p>
        <p><strong>Degree and centrality use absolute weights.</strong> A strong negative relationship adds exactly as much centrality as an equally strong positive one, so these columns measure how <em>involved</em> a concept is, never whether its involvement is helpful or harmful. Net influence is the only structural column that keeps direction.</p>
        <p><strong>Influence and Sensitivity are not properties of the network alone.</strong> They come from simulated runs, so they move with the transfer function, &lambda;, update rule and convergence settings currently selected. The same drawn model scored at a different &lambda; yields different numbers, so if you report these scores, report those settings with them.</p>
        <p><strong>Loop counts are a lower bound.</strong> Enumeration stops at 8 relationships per loop and 300 loops in total, so longer or additional cycles simply are not counted{stats.loops.capped ? ", and this model has hit that limit, so the figure above is definitely an undercount" : ""}. A loop is classed reinforcing when it contains an even number of negative relationships and balancing when odd, which is a sign-parity rule: it says nothing about the strength of the loop or how quickly it acts.</p>
      </MethodPanel>

      <MultiScaleSection report={multiScale} fresh={multiScaleFresh} scopeMetrics={metrics} viewInfo={viewInfo} onHighlight={onHighlight} />

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
          <div title={SYSTEM_STAT_HELP.clustering}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Clustering coefficient <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.clusteringEligible ? stats.clustering : "n/a"}</div>
            <div className="text-[11px] text-slate-400">mean over {stats.clusteringEligible} concept{stats.clusteringEligible === 1 ? "" : "s"} with 2+ neighbours</div>
          </div>
          <div title={SYSTEM_STAT_HELP.modularity}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Modularity (Q) <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.modularity === null ? "n/a" : stats.modularity}</div>
            <div className="text-[11px] text-slate-400">{stats.modularity === null ? (stats.moduleCount < 2 ? "needs 2+ modules in scope" : "no relationships") : `of the ${stats.moduleCount}-module partition`}</div>
          </div>
          <div title={SYSTEM_STAT_HELP.interfaceEdges}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Interface relationships <HelpCircle size={10} className="text-slate-300" /></div>
            <div className="text-sm font-mono">{stats.interfaceEdges}</div>
            <div className="text-[11px] text-slate-400">{stats.interfaceShare}% of relationships cross modules</div>
          </div>
          <div title={SYSTEM_STAT_HELP.betweenness}>
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">Top broker (betweenness) <HelpCircle size={10} className="text-slate-300" /></div>
            {(() => {
              const top = [...metrics].sort((a, b) => b.betweenness - a.betweenness)[0];
              return top && top.betweenness > 0
                ? <><div className="text-sm truncate" title={top.name}>{top.name}</div><div className="text-[11px] text-slate-400 font-mono">{top.betweenness}</div></>
                : <div className="text-sm text-slate-400">none</div>;
            })()}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold text-sm mb-1">Network metrics by category</h3>
        <p className="text-xs text-slate-400 mb-3">Compares how influence patterns differ between the categories defined on the Model editor tab. Uses whatever categories are actually present on this model; nothing is hard-coded.</p>

        {!hasCategories ? (
          <p className="text-xs text-slate-400 italic">No categories are set yet. Add a category to a concept on the Model editor tab (e.g. "water", "energy", "food", "governance") to enable this section.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <p className="text-[11px] text-slate-400 mb-1.5">Click any column heading to sort the categories by it; click again to reverse.</p>
              <table className="w-full text-xs min-w-[820px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    {categoryColumns.map((col) => (
                      <SortHeader key={col.key} col={col} sortKey={categorySort.sortKey} sortDir={categorySort.sortDir} onSort={categorySort.onSort} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categorySort.sorted.map((c) => (
                    <tr key={c.category} className="border-b border-slate-50">
                      {categoryColumns.map((col) => (
                        <td key={col.key} className={`py-1.5 pr-3 ${col.type === "num" ? "font-mono" : ""} ${col.key === categorySort.sortKey ? "bg-teal-50/60 font-semibold text-slate-900" : ""}`}>
                          {col.key === "category" ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: categoryColor.get(c.category) }} />
                              <span className={c.isUncategorized ? "italic text-slate-400" : ""}>{c.category}</span>
                            </span>
                          ) : (c[col.key] ?? "n/a")}
                        </td>
                      ))}
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
              ].map(({ key, title }) => {
                const data = [...categoryStats].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
                return (
                  <div key={key} className="border border-slate-100 rounded-lg p-3 overflow-x-auto">
                    <h4 className="text-xs font-semibold mb-2">{title}</h4>
                    <div style={{ minWidth: categoryYAxisWidth + 180, height: Math.max(140, data.length * 30 + 40) }}>
                      <ResponsiveContainer>
                        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 10 }} />
                          {/* interval={0}: show every module's name, never thin them out. */}
                          <YAxis type="category" dataKey="category" width={categoryYAxisWidth} interval={0} tick={(p) => <SingleLineTick {...p} />} />
                          <RTooltip formatter={(v) => (v === null ? "n/a (fewer than 2 concepts)" : v)} />
                          <Bar dataKey={key} radius={[0, 3, 3, 0]}>
                            {/* One Cell per bar IN THE ORDER DRAWN, so each bar keeps its own module's colour. */}
                            {data.map((c) => <Cell key={c.category} fill={categoryColor.get(c.category)} fillOpacity={0.8} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
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
// Multi-scale reporting (Influence Metrics tab + Network inspector)
// ============================================================================
function ModuleChip({ category, label }) {
  const st = categoryStyle(category);
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] text-slate-700 whitespace-nowrap" style={{ background: st.bg, borderColor: st.border }}>
      {label}
    </span>
  );
}

function RankCell({ cell }) {
  if (!cell) return <span className="text-slate-300">n/a</span>;
  return (
    <span className="font-mono whitespace-nowrap">
      {cell.value} <span className="text-slate-400">(#{cell.rank}<span className="text-slate-300">/{cell.n}</span>)</span>
    </span>
  );
}

function MultiScaleSection({ report, fresh = true, scopeMetrics, viewInfo, onHighlight }) {
  const [field, setField] = useState("influence");
  const [sortBy, setSortBy] = useState("global");
  const rows = useMemo(() => multiScaleRows(report, field), [report, field]);
  const leverage = useMemo(() => leverageByScale(report), [report]);
  // A scope that is itself one of the fixed scales (one whole module, or the
  // whole interface) is already a column below; only a custom scope needs one
  // of its own.
  const customScope = !!viewInfo?.isFiltered && !(viewInfo.showIsolated && (
    (viewInfo.mode === "modules" && viewInfo.moduleLabels.length === 1) || viewInfo.label === "Nexus Interface Mode"));
  const scopeRanks = useMemo(() => (customScope ? rankBy(Object.fromEntries(scopeMetrics.map((m) => [m.id, m])), field) : null), [customScope, scopeMetrics, field]);
  const scopeById = useMemo(() => new Map(scopeMetrics.map((m) => [m.id, m])), [scopeMetrics]);
  const sorted = useMemo(() => {
    const key = (r) => (sortBy === "scope" ? scopeRanks?.[r.id] : r[sortBy]?.rank) ?? Infinity;
    return [...rows].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
  }, [rows, sortBy, scopeRanks]);
  const metricDef = MULTISCALE_METRICS.find((m) => m.key === field);
  const categoryOf = useMemo(() => new Map((report?.nets.full.concepts || []).map((c) => [c.id, c.category])), [report]);
  const moduleCategory = useMemo(() => new Map((report?.modules || []).map((m) => [m.key, m.categoryValue])), [report]);

  if (!report) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-4 text-xs text-slate-500 flex items-center gap-2">
        <Layers size={15} className="text-teal-700" />Computing multi-scale ranks (full nexus, each module, nexus interface)&hellip;
      </div>
    );
  }
  const scopeTop = customScope
    ? [...scopeMetrics].filter((m) => m.influence > 0).sort((a, b) => b.influence - a.influence || b.outdegree - a.outdegree).slice(0, 3)
    : null;
  const SortTh = ({ id, children, title }) => (
    <th className="py-1.5 font-medium pr-3 cursor-pointer select-none hover:text-slate-600" title={title} onClick={() => setSortBy(id)}>
      {children}{sortBy === id ? " ↓" : ""}
    </th>
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          <Layers size={15} className="text-teal-700" />Multi-scale analysis
          {!fresh && <span className="text-[11px] font-normal text-amber-700">updating for your latest edit&hellip;</span>}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Every concept scored at three fixed scales, whatever the analysis scope above: the <strong>full nexus</strong>, <strong>its own module on its own</strong>,
          and the <strong>nexus interface</strong> (every module, only relationships between different modules). Each scale is ranked separately, so a concept can
          be #1 inside its module and far down globally; that difference is the point.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-slate-600 mb-2">Leverage points by scale <span className="font-normal text-slate-400">(highest perturbation influence at each scale)</span></h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...leverage, ...(scopeTop ? [{ key: "scope", label: `Current scope: ${viewInfo.label}`, n: scopeMetrics.length, top: scopeTop, current: true }] : [])].map((s) => (
            <div key={s.key} className={`rounded-md border p-2.5 text-xs ${s.current ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                {s.moduleKey ? <ModuleChip category={moduleCategory.get(s.moduleKey)} label={s.label} /> : <span className="font-semibold text-slate-700">{s.label}</span>}
                <span className="text-slate-400 ml-auto">{s.n} concepts</span>
              </div>
              {s.top.length ? (
                <ol className="space-y-0.5">
                  {s.top.map((m, i) => (
                    <li key={m.id} className="flex gap-1.5 cursor-pointer hover:bg-slate-50 rounded px-0.5" onClick={() => onHighlight(m.id)}>
                      <span className="text-slate-400 font-mono w-3">{i + 1}.</span>
                      <span className={`flex-1 truncate ${i === 0 ? "font-semibold" : ""}`} title={m.name}>{m.name}</span>
                      <span className="font-mono text-blue-700">{m.influence}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-slate-400 italic">No concept moves anything else at this scale.</p>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h4 className="text-xs font-semibold text-slate-600">Hierarchical ranking</h4>
          <label className="text-xs text-slate-500 flex items-center gap-1.5">
            Metric
            <select value={field} onChange={(e) => setField(e.target.value)} className="border border-slate-300 rounded px-1.5 py-0.5 text-xs bg-white">
              {MULTISCALE_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <span className="text-[11px] text-slate-400">{metricDef?.help} Click a column heading to sort by that scale's rank.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 font-medium pr-3">Concept</th>
                <th className="py-1.5 font-medium pr-3">Module</th>
                <SortTh id="global" title="Value and rank within the full nexus">Global (#rank)</SortTh>
                <SortTh id="module" title="Value and rank within the concept's own module, analysed on its own">Own module (#rank)</SortTh>
                <SortTh id="interface" title="Value and rank within the nexus interface network (only relationships between modules)">Nexus Interface (#rank)</SortTh>
                {scopeRanks && <SortTh id="scope" title={`Value and rank within the current analysis scope: ${viewInfo.label}`}>Current scope (#rank)</SortTh>}
                <th className="py-1.5 font-medium" title="Heuristic: the scale at which this concept ranks highest, by percentile, with a 0.15 margin; see the method notes below.">Importance mainly from</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const sv = scopeById.get(r.id);
                return (
                  <tr key={r.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => onHighlight(r.id)}>
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3"><ModuleChip category={categoryOf.get(r.id)} label={r.moduleLabel} /></td>
                    <td className="py-1.5 pr-3"><RankCell cell={r.global} /></td>
                    <td className="py-1.5 pr-3"><RankCell cell={r.module} /></td>
                    <td className="py-1.5 pr-3"><RankCell cell={r.interface} /></td>
                    {scopeRanks && <td className="py-1.5 pr-3">{sv ? <RankCell cell={{ value: sv[field] ?? 0, rank: scopeRanks[r.id], n: scopeMetrics.length }} /> : <span className="text-slate-300">out of scope</span>}</td>}
                    <td className="py-1.5 text-slate-600">{r.profile}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <MethodPanel
        title="Method & diagnostics for the multi-scale comparison"
        stats={[
          { label: "Scales scored", value: 1 + report.nets.moduleNets.length + (report.nets.iface ? 1 : 0), hint: "Full nexus, one per module, and the nexus interface." },
          { label: "Interface relationships", value: report.nets.iface ? report.nets.iface.edges.length : "n/a" },
          { label: "Simulation runs", value: report.nets.full.concepts.length * (report.nets.iface ? 3 : 2), hint: "Influence needs one driven run per concept at every scale." },
        ]}
      >
        <p><strong>Each scale is its own network.</strong> "Own module" keeps only the concept's module and the relationships inside it; "Nexus Interface" keeps every concept but only relationships between different modules. Metrics are recomputed from scratch on each, with the same simulation settings, so a value at one scale is never a slice of another scale's value.</p>
        <p><strong>Ranks are within-scale.</strong> A module with 4 concepts and the full nexus with 40 are ranked on their own terms; compare ranks as positions (percentiles), not as raw numbers. Tied values share the better rank.</p>
        <p><strong>"Importance mainly from" is a reading aid.</strong> It converts each rank to a percentile (a concept scoring 0 at a scale counts as bottom there), names the scale where the concept sits highest if it leads the next one by at least 0.15, reports "Important at every scale" when all are in the top quarter and "Peripheral at every scale" when none reaches the top half. The margins are conventions of this tool, not findings; report the ranks themselves if the classification matters to an argument.</p>
        <p><strong>Interface influence describes a coupling-only network.</strong> With within-module relationships removed, a concept's interface influence measures how far its effects travel across module boundaries on their own. Use it to spot bridge concepts, not as a prediction of behaviour in the full system.</p>
      </MethodPanel>
    </div>
  );
}

// ============================================================================
// Routes tab
// ============================================================================
const ROUTE_KINDS = [
  { key: "interface", label: "Cross-module (Nexus Interface)", help: "Every route that crosses at least one module boundary." },
  { key: "between", label: "Between two modules", help: "Routes that start in one module and end in another, through any concepts in scope." },
  { key: "within", label: "Within one module", help: "Routes that stay entirely inside one module." },
  { key: "all", label: "All routes", help: "Every route in the analysis scope." },
];

function routesToCsvRows(result, nameOf, moduleLabel, moduleOf) {
  return [
    ["Rank", "Route", "Modules", "Length", "Module crossings", "Sign", "Strength"],
    ...result.paths.map((p, i) => [
      i + 1,
      p.nodes.map((id) => nameOf.get(id)).join(" -> "),
      p.nodes.map((id) => moduleLabel.get(moduleOf.get(id))).join(" -> "),
      p.length, p.crossings, p.sign > 0 ? "+" : "-", round3(p.strength),
    ]),
  ];
}

// Open/closed state of a foldable box, remembered per viewer so a box
// someone has closed stays closed on their next visit.
function useRememberedOpen(key, defaultOpen) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => setOpen((o) => {
    try { localStorage.setItem(key, o ? "0" : "1"); } catch { /* storage unavailable: keep in memory only */ }
    return !o;
  });
  return [open, toggle];
}

// Every explanatory box in the app ("What is...", "Purpose", "How these
// metrics are computed", module guide) uses this one pattern, so folding
// looks and works the same everywhere: the whole header row is the toggle,
// with a chevron on the left and an explicit Show/Hide label on the right,
// and a one-line summary stays visible while the box is folded.
function FoldableBox({ storageKey, title, icon: Icon = HelpCircle, summary, badge, defaultOpen = false, children }) {
  const [open, toggle] = useRememberedOpen(storageKey, defaultOpen);
  return (
    <div className="bg-white rounded-lg border border-slate-200">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
      >
        {open ? <ChevronDown size={15} className="text-slate-500 shrink-0" /> : <ChevronRight size={15} className="text-slate-500 shrink-0" />}
        <Icon size={15} className="text-teal-700 shrink-0" />
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        {badge && <span className="text-xs font-normal text-slate-400">{badge}</span>}
        <span className="ml-auto shrink-0 text-[11px] font-medium text-teal-700 border border-teal-200 bg-teal-50 rounded px-1.5 py-0.5">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {!open && summary && <p className="px-4 pb-3 -mt-1 pl-[3.1rem] text-xs text-slate-500">{summary}</p>}
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// Width a category axis needs so every label fits on one line: the widest
// label as it will actually render, plus room for the tick mark.
function labelAxisWidth(labels, { min = 80, max = 520, font = "10px Inter, system-ui, sans-serif" } = {}) {
  if (!labels.length) return min;
  const widest = Math.max(...labels.map((l) => measureTextWidth(String(l ?? ""), font)));
  return Math.min(max, Math.max(min, Math.ceil(widest) + 18));
}

// Category-axis tick that never wraps: Recharts' own tick breaks long names
// onto several lines once they exceed the axis width, and drops ticks it
// thinks are crowded. Paired with labelAxisWidth and interval={0}, every
// label is shown, whole, on a single line.
function SingleLineTick({ x, y, payload }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill="#475569">{payload.value}</text>
  );
}

// Sort state for a table whose columns are { key, label, type: "num" |
// "text" }: numbers sort highest-first on the first click, text A to Z, and a
// second click reverses. Missing values (null) always sort last.
function useTableSort(rows, columns, initial) {
  const [sort, setSort] = useState(initial);
  const col = columns.find((c) => c.key === sort.key) || columns[0];
  const sorted = useMemo(() => {
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[col.key], vb = b[col.key];
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      const d = col.type === "num" ? va - vb : String(va).localeCompare(String(vb));
      return d * sign;
    });
  }, [rows, col, sort.dir]);
  const onSort = (c) => setSort((s) => (s.key === c.key
    ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" }
    : { key: c.key, dir: c.type === "num" ? "desc" : "asc" }));
  return { sorted, sortKey: col.key, sortDir: sort.dir, onSort };
}

function SortHeader({ col, sortKey, sortDir, onSort, className = "" }) {
  const active = col.key === sortKey;
  return (
    <th className={`py-1.5 font-medium pr-3 ${active ? "text-teal-800" : ""} ${className}`} aria-sort={active ? (sortDir === "desc" ? "descending" : "ascending") : "none"}>
      <button onClick={() => onSort(col)} title={`${col.help ? col.help + "\n\n" : ""}Click to sort by ${col.label}.`} className="inline-flex items-center gap-1 hover:text-slate-700 text-left">
        {col.label}
        <span className={active ? "text-teal-700" : "text-slate-300"}>{active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );
}


// Explains what the Influence Routes tab is for, what each route type
// answers, and how to read the results. Deliberately says what the tab is
// NOT (a simulation, or a policy/transition pathway), since those are the two
// readings most likely to be brought to it.
function InfluenceRoutesGuide() {
  return (
    <FoldableBox
      storageKey="se.fold.influenceRoutes"
      title="What is the Influence Routes tab?"
      summary="Traces the chains of cause and effect through which one concept can influence another, finds the concepts those chains depend on, and counts the feedback loops in the system."
    >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3 text-xs text-slate-600 leading-relaxed">
          <div className="space-y-2">
            <p>
              <strong>An influence route is a chain of relationships</strong> along which a change in one concept can reach another: if A affects B and B
              affects C, then A &rarr; B &rarr; C is a route from A to C, even though A and C are not directly connected. This tab lists those routes from
              the structure of the map and shows which concepts they pass through and where they cross from one module (subsystem) to another.
            </p>
            <p>
              <strong>Why it matters in a nexus.</strong> Many of the most important nexus effects are indirect: a decision in one sector reaches another sector
              only through a sequence of intermediate concepts. Routes make those sequences visible, so you can see <em>how</em> the subsystems are coupled, which
              concepts act as bridges between them, and where coordination between sectors or policy domains would have to happen.
            </p>
            <p><strong>Four questions, four route types:</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Cross-module (Nexus Interface):</strong> where does influence leave one subsystem and enter another? Every route that crosses at least one module boundary.</li>
              <li><strong>Between two modules:</strong> through which concepts does module A affect module B, and B affect A? Routes that start in one and end in the other.</li>
              <li><strong>Within one module:</strong> how is influence passed on inside this subsystem? Routes that never leave it.</li>
              <li><strong>All routes:</strong> what are the strongest indirect effects anywhere in the current scope?</li>
            </ul>
          </div>
          <div className="space-y-2">
            <p><strong>Reading the results</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Strength</strong> multiplies the absolute weights along the route, so a route is never stronger than its weakest link and long chains fade.</li>
              <li><strong>Sign</strong> (+ or &minus;) says whether the first concept pushes the last one in the same or the opposite direction.</li>
              <li><strong>Bridge concepts</strong> are the intermediate steps many routes depend on; their share is how much of the combined route strength passes through them.</li>
              <li><strong>Boundary crossings</strong> count how often a route changes module at a concept: these are the coupling points between subsystems.</li>
              <li><strong>Bottleneck</strong> marks a concept carrying at least half of the combined strength: the selected routes largely run through it.</li>
              <li><strong>Transmission routes between modules</strong> group everything by the module a route starts in and the module it ends in.</li>
              <li><strong>Feedback loops</strong> (bottom of the tab) are routes that return to where they started. They are counted for the whole system, inside each module, and across modules.</li>
            </ul>
            <p><strong>How to use it:</strong> set the analysis scope in the bar at the top, choose a route type, narrow it with From, To and Length if needed, then read the bridge table before the list of individual routes. Click any concept to select it, and open the Network tab to see it on the map.</p>
            <p className="rounded-md bg-slate-50 border border-slate-200 p-2">
              <strong>What this tab is not.</strong> It does not simulate anything: routes show where influence <em>can</em> travel given the relationships you drew,
              not how much arrives once feedback and the transfer function act on it (use Scenarios &amp; Simulation and Sensitivity Analysis for that). Nor are
              these policy or transition pathways; they are causal routes through the map's structure.
            </p>
          </div>
        </div>
    </FoldableBox>
  );
}

// Network tab: what modules are, how they are made, how the scope and the
// Hide/Focus display use them, and a per-module summary of how each one is
// wired internally and to the others.
function ModuleGuide({ concepts, edges, networkView, setNetworkView, viewInfo, displayMode }) {
  const modules = useMemo(() => listModules(concepts), [concepts]);
  const rows = useMemo(() => {
    const moduleOf = new Map(concepts.map((c) => [c.id, moduleKey(c.category)]));
    const stat = new Map(modules.map((m) => [m.key, { internal: 0, out: 0, in: 0, partners: new Set() }]));
    edges.forEach((e) => {
      const a = moduleOf.get(e.source), b = moduleOf.get(e.target);
      if (a === undefined || b === undefined) return;
      if (a === b) { stat.get(a).internal += 1; return; }
      stat.get(a).out += 1; stat.get(a).partners.add(b);
      stat.get(b).in += 1; stat.get(b).partners.add(a);
    });
    return modules.map((m) => ({ ...m, ...stat.get(m.key) }));
  }, [concepts, edges, modules]);
  const inScope = new Set(resolveViewModules(modules, networkView));
  const labelOf = new Map(modules.map((m) => [m.key, m.label]));

  return (
    <FoldableBox
      storageKey="se.fold.modules"
      icon={Layers}
      title="Modules in this model"
      badge={`${modules.length} module${modules.length === 1 ? "" : "s"}, from the concepts' categories`}
      summary="Modules are the subsystems of your nexus: groups of concepts that share a category. Open for what they are, how the analysis scope uses them, and how each module is connected to the others."
    >
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs text-slate-600 leading-relaxed">
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-700">What a module is</p>
              <p>
                A module is a group of concepts that share the same <strong>Category</strong>. Modules stand for the subsystems of the nexus you are modelling:
                sectors such as water, energy and food, environmental domains, or policy arenas. Nothing is predefined; every distinct category you type becomes a
                module, with its own colour on the map.
              </p>
              <p>
                Set or change a concept's category in the Inspector (select the concept) or on the Model editor tab. Capitals and extra spaces are ignored, so
                "Water" and "water " are the same module. Concepts without a category form the <em>Uncategorized</em> module.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-700">Choosing what to analyse</p>
              <p>
                The <strong>Analysis scope</strong> bar at the top of every tab chooses the modules in play. <strong>Modules</strong> keeps every relationship among
                the selected modules; <strong>Nexus Interface</strong> keeps only relationships that cross from one module to another, and hides those inside a
                module. <strong>Show isolated concepts</strong> decides whether concepts left without any relationship stay in.
              </p>
              <p>The scope applies everywhere: metrics, simulations, scenarios, influence routes and exports all use only the network in scope.</p>
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-700">Hide or Focus on this canvas</p>
              <p>
                <strong>Hide</strong> removes everything outside the scope from the map. <strong>Focus</strong> keeps it on the map but faded, so you can see a
                subsystem in the context of the whole. Either way, faded or hidden concepts and relationships are left out of every analysis, and concept
                positions never change.
              </p>
              <p>Currently: <strong>{viewInfo?.label}</strong>, shown in <strong>{displayMode === "focus" ? "Focus" : "Hide"}</strong> mode.</p>
            </div>
          </div>

          {modules.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No concepts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[720px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="py-1.5 font-medium pr-3">Module</th>
                    <th className="py-1.5 font-medium pr-3">Concepts</th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships with both concepts in this module">Internal relationships</th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships from a concept in this module to a concept in another module">Influences other modules</th>
                    <th className="py-1.5 font-medium pr-3" title="Relationships from a concept in another module to a concept in this module">Influenced by other modules</th>
                    <th className="py-1.5 font-medium pr-3" title="Modules this one is directly connected to">Directly connected to</th>
                    <th className="py-1.5 font-medium pr-3">In scope</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = categoryStyle(r.categoryValue);
                    return (
                      <tr key={r.key} className="border-b border-slate-50">
                        <td className="py-1.5 pr-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm border inline-block" style={{ background: st.bg, borderColor: st.border }} />
                            <span className={r.key === UNCATEGORIZED_MODULE ? "italic text-slate-400" : ""}>{r.label}</span>
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono">{r.count}</td>
                        <td className="py-1.5 pr-3 font-mono">{r.internal}</td>
                        <td className="py-1.5 pr-3 font-mono">{r.out}</td>
                        <td className="py-1.5 pr-3 font-mono">{r.in}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{r.partners.size ? [...r.partners].map((k) => labelOf.get(k)).join(", ") : <span className="text-slate-300">none</span>}</td>
                        <td className="py-1.5 pr-3">{inScope.has(r.key) ? <span className="text-teal-700">yes</span> : <span className="text-slate-400">no</span>}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button onClick={() => setNetworkView((v) => ({ ...v, mode: "modules", selected: [r.key] }))} className="text-teal-700 hover:underline" title={`Set the analysis scope to ${r.label} only`}>
                            Analyse on its own
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-2">
                Counts cover the whole model, whatever the current scope. Relationships between modules are the nexus interface: they are what Nexus Interface mode keeps
                and what the Influence Routes tab traces across. The Influence Metrics tab compares every module in more detail.
              </p>
            </div>
          )}
        </div>
    </FoldableBox>
  );
}

// Feedback loops on the Influence Routes tab: how many there are in the
// whole analysed system, how many stay inside each module, and how many run
// between modules (with the combinations of modules they connect), plus the
// loops themselves.
function FeedbackLoopsSection({ concepts, edges, onHighlight }) {
  const analysis = useMemo(() => analyseFeedbackLoops(concepts, edges), [concepts, edges]);
  const modules = useMemo(() => listModules(concepts), [concepts]);
  const moduleLabel = useMemo(() => new Map(modules.map((m) => [m.key, m.label])), [modules]);
  const moduleCategory = useMemo(() => new Map(modules.map((m) => [m.key, m.categoryValue])), [modules]);
  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const [filter, setFilter] = useState("all");      // all | within | between
  const [moduleFilter, setModuleFilter] = useState(""); // "" = any module
  const [showCount, setShowCount] = useState(25);

  const moduleRows = useMemo(() => modules.map((m) => ({
    key: m.key, label: m.label, categoryValue: m.categoryValue,
    inside: analysis.byModule.get(m.key) || { count: 0, reinforcing: 0, balancing: 0 },
    touching: analysis.touching.get(m.key) || { count: 0, reinforcing: 0, balancing: 0 },
  })), [modules, analysis]);

  const shown = useMemo(() => analysis.loops.filter((l) => {
    if (filter === "within" && !l.within) return false;
    if (filter === "between" && l.within) return false;
    if (moduleFilter && !l.modules.includes(moduleFilter)) return false;
    return true;
  }), [analysis, filter, moduleFilter]);
  useEffect(() => { setShowCount(25); }, [filter, moduleFilter, concepts, edges]);

  const Tally = ({ t }) => (
    <span className="font-mono">
      <span className="text-slate-800 font-semibold">{t.count}</span>
      <span className="text-slate-400"> ({t.reinforcing} R / {t.balancing} B)</span>
    </span>
  );
  const Chip = ({ id }) => {
    const c = conceptById.get(id);
    const st = categoryStyle(c?.category);
    return (
      <button onClick={() => onHighlight(id)} className="inline-flex px-1.5 py-0.5 rounded border text-[11px] text-slate-800 hover:ring-1 hover:ring-teal-400 whitespace-nowrap" style={{ background: st.bg, borderColor: st.border }}>
        {c?.name}
      </button>
    );
  };
  const ModuleTag = ({ k }) => <ModuleChip category={moduleCategory.get(k)} label={moduleLabel.get(k)} />;
  const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%");

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-sm flex items-center gap-1.5"><RotateCcw size={15} className="text-teal-700" />Feedback loops</h3>
        <p className="text-xs text-slate-500 mt-1">
          A feedback loop is a route that returns to where it started (A &rarr; B &rarr; C &rarr; A), so a change can amplify or dampen itself.
          <strong> Reinforcing (R)</strong> loops amplify change; <strong>balancing (B)</strong> loops counteract it. Counted for the whole system in scope, inside each module, and between modules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-slate-400 mb-1">Whole system (in scope)</div>
          <div className="text-lg"><Tally t={analysis.total} /></div>
          <div className="text-slate-400 mt-1">{analysis.capped ? "Enumeration capped at 300 loops: this is a lower bound." : "Every simple loop up to 8 relationships long."}</div>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-slate-400 mb-1">Within modules</div>
          <div className="text-lg"><Tally t={analysis.within} /></div>
          <div className="text-slate-400 mt-1">{pct(analysis.within.count, analysis.total.count)} of all loops stay inside a single module.</div>
        </div>
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-slate-400 mb-1">Between modules</div>
          <div className="text-lg"><Tally t={analysis.between} /></div>
          <div className="text-slate-400 mt-1">{pct(analysis.between.count, analysis.total.count)} of all loops run through two or more modules.</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div>
          <h4 className="text-xs font-semibold text-slate-600 mb-1.5">Per module</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 font-medium pr-3">Module</th>
                <th className="py-1.5 font-medium pr-3" title="Loops made up entirely of this module's concepts">Loops inside the module</th>
                <th className="py-1.5 font-medium" title="Loops passing through at least one concept of this module, including loops that also pass through other modules">Loops passing through it</th>
              </tr>
            </thead>
            <tbody>
              {moduleRows.map((r) => (
                <tr key={r.key} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => { setModuleFilter(r.key); setFilter("all"); }} title={`Show the loops involving ${r.label}`}>
                  <td className="py-1.5 pr-3"><ModuleTag k={r.key} /></td>
                  <td className="py-1.5 pr-3"><Tally t={r.inside} /></td>
                  <td className="py-1.5"><Tally t={r.touching} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-slate-600 mb-1.5">Between modules, by the modules a loop connects</h4>
          {analysis.combos.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No loop runs through more than one module in the current scope.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 font-medium pr-3">Modules connected</th>
                  <th className="py-1.5 font-medium">Loops</th>
                </tr>
              </thead>
              <tbody>
                {analysis.combos.map((c) => (
                  <tr key={c.modules.join("|")} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1 flex-wrap">
                        {c.modules.map((k, i) => (
                          <React.Fragment key={k}>
                            {i > 0 && <span className="text-slate-400">&harr;</span>}
                            <ModuleTag k={k} />
                          </React.Fragment>
                        ))}
                      </span>
                    </td>
                    <td className="py-1.5"><Tally t={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h4 className="text-xs font-semibold text-slate-600 mr-1">Loops, strongest first</h4>
          {[["all", "All"], ["within", "Within a module"], ["between", "Between modules"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-2 py-0.5 rounded-md border text-xs ${filter === k ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
          <label className="text-xs text-slate-500 flex items-center gap-1.5 ml-1">
            involving
            <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white text-xs">
              <option value="">any module</option>
              {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <span className="text-[11px] text-slate-400 ml-auto">showing {Math.min(showCount, shown.length)} of {shown.length}</span>
        </div>
        {shown.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No feedback loops match this selection.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 font-medium pr-2">#</th>
                  <th className="py-1.5 font-medium pr-3">Loop</th>
                  <th className="py-1.5 font-medium pr-3">Modules</th>
                  <th className="py-1.5 font-medium pr-3">Length</th>
                  <th className="py-1.5 font-medium pr-3">Type</th>
                  <th className="py-1.5 font-medium" title="Product of the absolute weights around the loop">Strength</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, showCount).map((l, i) => (
                  <tr key={i} className="border-b border-slate-50 align-top">
                    <td className="py-1.5 pr-2 text-slate-400 font-mono">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {[...l.nodes, l.nodes[0]].map((id, j) => (
                          <React.Fragment key={j}>
                            {j > 0 && (
                              <span className={`font-mono text-[10px] ${l.edges[j - 1].weight >= 0 ? "text-green-700" : "text-orange-700"}`} title={`weight ${l.edges[j - 1].weight}`}>
                                {l.edges[j - 1].weight >= 0 ? "+" : "−"}&rarr;
                              </span>
                            )}
                            <Chip id={id} />
                          </React.Fragment>
                        ))}
                      </div>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex gap-1 flex-wrap">{l.modules.map((k) => <ModuleTag key={k} k={k} />)}</span>
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{l.length}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${l.type === "reinforcing" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-700"}`}>
                        {l.type === "reinforcing" ? "Reinforcing" : "Balancing"}
                      </span>
                    </td>
                    <td className="py-1.5 font-mono">{round3(l.strength)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {showCount < shown.length && (
              <button onClick={() => setShowCount((n) => n + 50)} className="mt-2 text-xs text-teal-700 hover:underline">Show 50 more</button>
            )}
          </div>
        )}
      </div>

      <MethodPanel title="Method & diagnostics for the feedback loops">
        <p><strong>What is counted.</strong> Every simple cycle in the network in scope: a closed route that visits no concept twice before returning to its start, up to 8 relationships long, stopping at 300 loops. These are the same loops, with the same limits, as the loop count on the Influence Metrics tab, so the totals match. If a limit is hit, every count here is a lower bound.</p>
        <p><strong>Reinforcing or balancing</strong> is decided by sign parity: an even number of negative relationships around the loop makes it reinforcing (a change comes back with the same sign and grows), an odd number makes it balancing (a change comes back reversed and is dampened). Parity says nothing about how strong or fast the loop is; <strong>strength</strong>, the product of the absolute weights around the loop, gives a rough idea of that.</p>
        <p><strong>Within versus between modules.</strong> A loop is within a module when every concept on it belongs to that module, and between modules otherwise. Between-module loops are the feedback that couples subsystems: a change in one module returns to it only after passing through another, which is where decisions in one sector can come back to affect that sector through others. In Nexus Interface mode only relationships between modules are kept, so no loop can stay inside a module there.</p>
      </MethodPanel>
    </div>
  );
}

function InfluenceRoutesTab({ concepts, edges, config, setConfig, onHighlight }) {
  const modules = useMemo(() => listModules(concepts), [concepts]);
  const moduleLabel = useMemo(() => new Map(modules.map((m) => [m.key, m.label])), [modules]);
  const moduleCategory = useMemo(() => new Map(modules.map((m) => [m.key, m.categoryValue])), [modules]);
  const nameOf = useMemo(() => new Map(concepts.map((c) => [c.id, c.name])), [concepts]);
  const conceptById = useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);
  const moduleOf = useMemo(() => new Map(concepts.map((c) => [c.id, moduleKey(c.category)])), [concepts]);
  const [showCount, setShowCount] = useState(50);

  // Module choices fall back sensibly when the scope changes underneath a
  // saved selection (e.g. the chosen module is no longer in scope).
  const keys = modules.map((m) => m.key);
  const moduleA = keys.includes(config.moduleA) ? config.moduleA : keys[0] || "";
  const moduleB = keys.includes(config.moduleB) && config.moduleB !== moduleA ? config.moduleB : keys.find((k) => k !== moduleA) || "";
  const effective = {
    ...config, moduleA, moduleB,
    fromId: nameOf.has(config.fromId) ? config.fromId : "",
    toId: nameOf.has(config.toId) ? config.toId : "",
  };
  const unavailable =
    (effective.kind === "between" && (!moduleA || !moduleB)) ? "Routes between two modules need at least two modules in the analysis scope. Widen the scope in the bar above." :
    (effective.kind === "interface" && modules.length < 2) ? "Cross-module routes need at least two modules in the analysis scope. Widen the scope in the bar above." :
    (effective.kind === "within" && !moduleA) ? "No module in scope." : null;
  const effKey = JSON.stringify(effective);
  const result = useMemo(
    () => (unavailable ? null : analyseInfluenceRoutes(concepts, edges, effective)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [concepts, edges, effKey, unavailable]
  );
  useEffect(() => { setShowCount(50); }, [effKey]);
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));

  const Chip = ({ id }) => {
    const c = conceptById.get(id);
    const st = categoryStyle(c?.category);
    return (
      <button onClick={() => onHighlight(id)} className="inline-flex px-1.5 py-0.5 rounded border text-[11px] text-slate-800 hover:ring-1 hover:ring-teal-400 whitespace-nowrap" style={{ background: st.bg, borderColor: st.border }} title={`${c?.name} (${moduleLabel.get(moduleOf.get(id))})`}>
        {c?.name}
      </button>
    );
  };
  const kindDef = ROUTE_KINDS.find((k) => k.key === effective.kind);
  const bottleneck = result?.bridges.find((b) => b.share >= 0.5);

  return (
    <div className="space-y-5">
      <InfluenceRoutesGuide />

      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {ROUTE_KINDS.map((k) => (
            <button key={k.key} onClick={() => set({ kind: k.key })} title={k.help}
              className={`px-2.5 py-1 rounded-md border text-xs ${effective.kind === k.key ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600">
          {(effective.kind === "within" || effective.kind === "between") && (
            <label className="flex items-center gap-1.5">{effective.kind === "within" ? "Module" : "Module A"}
              <select value={moduleA} onChange={(e) => set({ moduleA: e.target.value })} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white">
                {modules.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
          )}
          {effective.kind === "between" && (
            <>
              <label className="flex items-center gap-1.5">Module B
                <select value={moduleB} onChange={(e) => set({ moduleB: e.target.value })} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white">
                  {modules.filter((m) => m.key !== moduleA).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5">Direction
                <select value={effective.direction} onChange={(e) => set({ direction: e.target.value })} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white">
                  <option value="both">{moduleLabel.get(moduleA)} &harr; {moduleLabel.get(moduleB)}</option>
                  <option value="ab">{moduleLabel.get(moduleA)} &rarr; {moduleLabel.get(moduleB)}</option>
                  <option value="ba">{moduleLabel.get(moduleB)} &rarr; {moduleLabel.get(moduleA)}</option>
                </select>
              </label>
            </>
          )}
          <label className="flex items-center gap-1.5">From
            <select value={effective.fromId} onChange={(e) => set({ fromId: e.target.value })} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white max-w-[180px]">
              <option value="">any concept</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">To
            <select value={effective.toId} onChange={(e) => set({ toId: e.target.value })} className="border border-slate-300 rounded px-1.5 py-0.5 bg-white max-w-[180px]">
              <option value="">any concept</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5" title="Number of relationships in a route. 1 = a direct relationship.">Length
            <select value={effective.minLen} onChange={(e) => set({ minLen: Number(e.target.value), maxLen: Math.max(Number(e.target.value), effective.maxLen) })} className="border border-slate-300 rounded px-1 py-0.5 bg-white">
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            to
            <select value={effective.maxLen} onChange={(e) => set({ maxLen: Number(e.target.value), minLen: Math.min(Number(e.target.value), effective.minLen) })} className="border border-slate-300 rounded px-1 py-0.5 bg-white">
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            relationships
          </label>
        </div>
        <p className="text-[11px] text-slate-400">{kindDef?.help}</p>
      </div>

      {unavailable ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-500">{unavailable}</div>
      ) : result && (
        <>
          <MethodPanel
            title="Method & diagnostics for these routes"
            stats={[
              { label: "Routes found", value: result.truncated ? `${result.paths.length}+ (capped)` : result.paths.length, tone: result.truncated ? "warn" : undefined, hint: "Simple directed routes (no concept visited twice) matching the selection above." },
              { label: "Same-direction (+) / opposite (−)", value: `${result.positive} / ${result.negative}` },
              { label: "Combined strength", value: result.totalStrength, hint: "Sum of the strengths of every route found." },
              { label: "Bottleneck", value: bottleneck ? bottleneck.name : "none", tone: bottleneck ? "warn" : undefined, hint: "A concept carrying at least half of the combined route strength." },
            ]}
          >
            <p><strong>Strength</strong> is the product of the absolute weights along a route, the usual FCM indirect-effect measure: a route is never stronger than its weakest relationship, and longer chains fade. <strong>Sign</strong> is the product of the signs: + means the first concept pushes the last one in the same direction, &minus; in the opposite direction.</p>
            <p><strong>This is structure, not simulation.</strong> Routes show the routes along which influence <em>can</em> travel. How much actually arrives depends on the transfer function, feedback and everything else acting on the same concepts, which the simulation tabs capture and this tab does not.</p>
            <p><strong>Bridge concepts</strong> are ranked by the share of combined route strength that passes <em>through</em> them (as an intermediate step, not a start or end). "Boundary crossings" counts how often a route changes module at that concept, which marks it as a coupling point. A concept carrying half or more of the strength is flagged as a bottleneck: the selected routes largely depend on it, which makes it a place where coordination between subsystems is needed. The 50% threshold is a convention of this tool.</p>
            <p><strong>Enumeration is capped</strong> at 6 relationships per route, {ROUTE_KEEP_LIMIT.toLocaleString()} routes and {ROUTE_EXPANSION_LIMIT.toLocaleString()} search steps, so a dense network cannot freeze the page{result.truncated ? ". This selection hit the cap, so counts and shares are based on the routes found before it; narrow the selection (shorter length, a From/To concept) for complete figures" : ""}.</p>
          </MethodPanel>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-sm mb-1">Bridge concepts &amp; coupling points</h3>
              <p className="text-[11px] text-slate-400 mb-2">Share of the selected routes' combined strength that passes through each concept.</p>
              {result.bridges.length === 0 ? <p className="text-xs text-slate-400 italic">No intermediate concepts: every route found is a direct relationship.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-100">
                        <th className="py-1.5 font-medium pr-3">Concept</th>
                        <th className="py-1.5 font-medium pr-3">Module</th>
                        <th className="py-1.5 font-medium pr-3">Share of strength</th>
                        <th className="py-1.5 font-medium pr-3" title="Routes passing through this concept">Routes</th>
                        <th className="py-1.5 font-medium" title="How often a route changes module at this concept">Boundary crossings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bridges.slice(0, 15).map((b) => (
                        <tr key={b.id} className="border-b border-slate-50 cursor-pointer hover:bg-slate-50" onClick={() => onHighlight(b.id)}>
                          <td className="py-1.5 pr-3">
                            {b.name}
                            {b.share >= 0.5 && <span className="ml-1.5 px-1 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px]">bottleneck</span>}
                          </td>
                          <td className="py-1.5 pr-3"><ModuleChip category={moduleCategory.get(b.moduleKey)} label={moduleLabel.get(b.moduleKey)} /></td>
                          <td className="py-1.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              <div className="w-20 h-1.5 bg-slate-100 rounded"><div className="h-1.5 bg-teal-600 rounded" style={{ width: `${Math.round(b.share * 100)}%` }} /></div>
                              <span className="font-mono">{Math.round(b.share * 100)}%</span>
                            </div>
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{b.throughCount}</td>
                          <td className="py-1.5 font-mono">{b.boundaryCrossings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="font-semibold text-sm mb-1">Transmission routes between modules</h3>
              <p className="text-[11px] text-slate-400 mb-2">Routes grouped by the module they start in and the module they end in.</p>
              {result.flows.length === 0 ? <p className="text-xs text-slate-400 italic">No routes match this selection.</p> : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-1.5 font-medium pr-3">From &rarr; to</th>
                      <th className="py-1.5 font-medium pr-3">Routes</th>
                      <th className="py-1.5 font-medium pr-3">Combined strength</th>
                      <th className="py-1.5 font-medium">+ / &minus;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.flows.map((f) => (
                      <tr key={`${f.from}|${f.to}`} className="border-b border-slate-50">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <ModuleChip category={moduleCategory.get(f.from)} label={moduleLabel.get(f.from)} /> <span className="text-slate-400">&rarr;</span> <ModuleChip category={moduleCategory.get(f.to)} label={moduleLabel.get(f.to)} />
                        </td>
                        <td className="py-1.5 pr-3 font-mono">{f.count}</td>
                        <td className="py-1.5 pr-3 font-mono">{f.strength}</td>
                        <td className="py-1.5 font-mono"><span className="text-green-700">{f.positive}</span> / <span className="text-orange-700">{f.negative}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold text-sm">Strongest routes</h3>
              <span className="text-[11px] text-slate-400">showing {Math.min(showCount, result.paths.length)} of {result.paths.length}{result.truncated ? "+" : ""}</span>
              <Btn variant="outline" className="ml-auto" onClick={() => downloadCSV(routesToCsvRows(result, nameOf, moduleLabel, moduleOf), "influence-routes.csv")} disabled={!result.paths.length}>
                <Download size={13} />CSV
              </Btn>
            </div>
            {result.paths.length === 0 ? <p className="text-xs text-slate-400 italic">No routes match this selection in the current scope.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-1.5 font-medium pr-2">#</th>
                      <th className="py-1.5 font-medium pr-3">Route</th>
                      <th className="py-1.5 font-medium pr-3" title="Relationships in the route">Length</th>
                      <th className="py-1.5 font-medium pr-3" title="Times the route changes module">Crossings</th>
                      <th className="py-1.5 font-medium pr-3">Sign</th>
                      <th className="py-1.5 font-medium">Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.paths.slice(0, showCount).map((p, i) => (
                      <tr key={i} className="border-b border-slate-50 align-top">
                        <td className="py-1.5 pr-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="py-1.5 pr-3">
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.nodes.map((id, j) => (
                              <React.Fragment key={id}>
                                {j > 0 && (
                                  <span className={`font-mono text-[10px] ${p.edges[j - 1].weight >= 0 ? "text-green-700" : "text-orange-700"}`} title={`weight ${p.edges[j - 1].weight}`}>
                                    {p.edges[j - 1].weight >= 0 ? "+" : "−"}&rarr;
                                  </span>
                                )}
                                <Chip id={id} />
                              </React.Fragment>
                            ))}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 font-mono">{p.length}</td>
                        <td className="py-1.5 pr-3 font-mono">{p.crossings}</td>
                        <td className={`py-1.5 pr-3 font-mono ${p.sign > 0 ? "text-green-700" : "text-orange-700"}`}>{p.sign > 0 ? "+" : "−"}</td>
                        <td className="py-1.5 font-mono">{round3(p.strength)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showCount < result.paths.length && (
                  <button onClick={() => setShowCount((n) => n + 100)} className="mt-2 text-xs text-teal-700 hover:underline">Show 100 more</button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <FeedbackLoopsSection concepts={concepts} edges={edges} onHighlight={onHighlight} />
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
      <FoldableBox
        storageKey="se.fold.sensitivityWhat"
        icon={SlidersHorizontal}
        title="What is sensitivity analysis?"
        summary="Holds one concept at a series of values across a range, re-runs the model each time, and shows how strongly other concepts respond."
      >
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
      </FoldableBox>

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

          <MethodPanel
            stats={[
              { label: "Sweep", value: `${sensMin} → ${sensMax}, ${Math.max(2, sensSteps) + 1} points` },
              {
                label: "Simulation runs",
                value: (Math.max(2, sensSteps) + 1) * (result.scenarioIds?.length || 1) + 2 * Math.max(0, concepts.length - 1),
                hint: "One full run per sweep point per scenario for the response curves, plus two runs per concept (low end and high end) for the tornado chart.",
              },
              { label: "Transfer function / λ", value: `${settings.squashFunction ?? "tanh"} / ${settings.lambda ?? 1}` },
              {
                label: "Tornado entries shown",
                value: `${result.tornado.length} of ${Math.max(0, concepts.length - 1)}`,
                tone: result.tornado.length < concepts.length - 1 ? "warn" : undefined,
                hint: "The chart is capped at the 12 concepts with the largest absolute impact.",
              },
            ]}
          >
            <p><strong>Elasticity here is a secant, not a derivative.</strong> It is computed as (value at the top of the sweep &minus; value at the bottom) &divide; the width of the sweep, so only the two endpoints are used. A response that rises then falls, or that is flat at both ends but steep in the middle, can therefore report an elasticity near zero while actually moving a great deal. Always read it against the Min/Max columns and the shape of the curve above; if those disagree with the elasticity figure, the curve is the honest account.</p>
            <p><strong>The tornado chart varies one concept at a time.</strong> Each bar is the difference between two runs with that single concept locked low and locked high, everything else left as it is. This is a one-at-a-time design, so it captures no interactions: two concepts that matter enormously together but little apart will both show short bars. It also applies the same {sensMin}&nbsp;to&nbsp;{sensMax} range to every concept regardless of whether that span is plausible for each one.</p>
            <p><strong>The swept concept is held fixed, not merely started there.</strong> Each point locks the input at that value for the entire run, so the curve answers "where does the system settle while this is held here", not "what happens if this is nudged and then released".</p>
            <p><strong>Every point is an equilibrium, not a moment in time.</strong> The x-axis is an input level and the y-axis is a settled state; nothing here describes how long a transition would take or what the system does on the way.</p>
          </MethodPanel>

          {/* Stacked, not side by side: the tornado needs the full width so
              long concept names stay on one line without crushing the bars. */}
          <div className="grid grid-cols-1 gap-5">
            <div className="bg-white rounded-lg border border-slate-200 p-4" data-chart="sensitivity-scores">
              <h4 className="text-sm font-semibold mb-1">Tornado chart: impact on {concepts.find((c) => c.id === result.primaryOutput)?.name}</h4>
              <p className="text-[11px] text-slate-400 mb-2">Every other concept swept from {sensMin} to {sensMax} one at a time; ranked by how much it moves the primary output.</p>
              <div className="w-full" style={{ height: Math.max(200, result.tornado.length * 24 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={result.tornado} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={labelAxisWidth(result.tornado.map((d) => d.name))} interval={0} tick={(p) => <SingleLineTick {...p} />} />
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

function BaselineEquilibriumTab({
  concepts, edges, scenarios, settings, setTab, result, setResult, setChartCache, modelVersion,
  initState = DEFAULT_BASELINE_INIT, setInitState, updateConcept, commitHistory,
}) {
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
  // Steepness (lambda) gets the same local-override treatment. It matters
  // more than it looks: lambda is the slope of the squash at 0, so it sets
  // the loop gain of the whole system. Below a critical value the all-zero
  // state is attracting and every run decays back to 0 no matter how the
  // model is wired; above it, activation is self-sustaining and the run
  // settles somewhere else. Being able to sweep it here, on the tab whose
  // whole job is "where does this model settle", is the difference between
  // "the equilibrium is 0" and "the equilibrium is 0 *at this steepness*".
  const [lambdaOverride, setLambdaOverride] = useState(null);
  const effectiveLambda = lambdaOverride ?? settings.lambda ?? 1;
  const runSettings = useMemo(
    () => ({ ...settings, squashFunction: effectiveSquash, lambda: effectiveLambda }),
    [settings, effectiveSquash, effectiveLambda]
  );

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

  // A(0) for this run: either the model's own initial values (Model editor /
  // Inspector), or a custom vector set on this tab. The custom vector is for
  // this tab only, so it can be varied freely (e.g. to check whether the
  // model settles to the same equilibrium from different starting points)
  // without touching the starting values every scenario uses, unless the
  // user explicitly saves it to the model.
  const customInit = initState.mode === "custom";
  const initVector = useMemo(() => Object.fromEntries(concepts.map((c) => [
    c.id,
    customInit ? clamp(initState.values[c.id] ?? c.initialValue ?? 0) : (c.initialValue ?? 0),
  ])), [concepts, customInit, initState.values]);
  const initKey = useMemo(() => JSON.stringify(initVector), [initVector]);
  const setCustomValue = (id, v) => setInitState((st) => ({ ...st, values: { ...st.values, [id]: clamp(v) } }));
  const setAllCustom = (fn) => setInitState((st) => ({ ...st, mode: "custom", values: Object.fromEntries(concepts.map((c) => [c.id, round2(clamp(fn(c)))])) }));
  const switchToCustom = () => setInitState((st) => ({
    mode: "custom",
    // Start from the current model values for any concept not yet customised.
    values: { ...Object.fromEntries(concepts.map((c) => [c.id, c.initialValue ?? 0])), ...st.values },
  }));
  const saveInitToModel = () => {
    if (!updateConcept) return;
    commitHistory?.();
    concepts.forEach((c) => { if ((c.initialValue ?? 0) !== initVector[c.id]) updateConcept(c.id, { initialValue: initVector[c.id] }); });
    setInitState({ mode: "model", values: {} });
  };

  const run = () => setResult({
    ...simulate(concepts, edges, { ...cleanBaselineScenario, initialOverrides: customInit ? initVector : {} }, runSettings),
    __modelVersion: modelVersion, __initKey: initKey, __initMode: customInit ? "custom" : "model",
  });
  const modelChanged = !!result && result.__modelVersion !== modelVersion;
  const initChanged = !!result && !modelChanged && result.__initKey !== undefined && result.__initKey !== initKey;
  const isStale = modelChanged || initChanged;
  // What the displayed result actually started from (its first iteration),
  // which may differ from the editor below once the user changes it.
  const usedInit = result?.series?.[0]?.values || initVector;

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
    const allInitialZero = concepts.every((c) => Math.abs(usedInit[c.id] ?? 0) < 1e-9);
    const allFinalZero = concepts.every((c) => Math.abs(result.final[c.id] ?? 0) < 1e-9);
    const equalsInitial = concepts.every((c) => Math.abs((result.final[c.id] ?? 0) - (usedInit[c.id] ?? 0)) < 1e-6);
    if (equalsInitial) {
      messages.push({ kind: "info", text: "The model appears already to be at equilibrium: the final state matches the initial state." });
    }
    if (allFinalZero && !allInitialZero) {
      messages.push({ kind: "warning", text: "This run started away from zero but settled back to exactly zero. That's mathematically possible: strong enough damping in the causal structure (weak, offsetting, or predominantly negative relationships) can pull every concept back to rest. If you expected a non-trivial equilibrium instead, double-check the relationship weights and signs on the Model editor / Network tab." });
    }
    return messages;
  }, [result, concepts, usedInit]);

  // "Equilibrium Diagnostics" panel fields. This app has no randomized-
  // initialization feature, so "Initial State Type" only ever reads as one
  // of two states that actually exist here.
  // Before a run this describes the vector about to be used; after one, the
  // vector that run actually started from.
  const allInitialZero = concepts.length > 0 && concepts.every((c) => Math.abs(usedInit[c.id] ?? 0) < 1e-9);
  const initialStateType = allInitialZero ? "All zeros" : (result ? result.__initMode === "custom" : customInit) ? "Custom (this tab)" : "Model's initial values";
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
    const nonZero = concepts.filter((c) => Math.abs(usedInit[c.id] ?? 0) >= 1e-9);
    const names = nonZero.slice(0, 4).map((c) => c.name).join(", ") + (nonZero.length > 4 ? `, +${nonZero.length - 4} more` : "");
    return result.converged
      ? `${nonZero.length} concept${nonZero.length === 1 ? "" : "s"} started away from zero (${names}), so the system evolves from there and settles after ${result.iterationsRun} iteration${result.iterationsRun === 1 ? "" : "s"}.`
      : `${nonZero.length} concept${nonZero.length === 1 ? "" : "s"} started away from zero (${names}), and the system did not settle within the ${settings.maxIterations ?? 100}-iteration cap; see Stability below for whether it's oscillating or diverging.`;
  }, [result, concepts, allInitialZero, settings.maxIterations, effectiveSquash, usedInit]);

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
      <FoldableBox
        storageKey="se.fold.baselinePurpose"
        icon={Activity}
        title="Purpose of this tab"
        summary="See how the model behaves on its own, with no scenario applied, before testing interventions. This is the reference every scenario is compared against."
      >
        <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
        <p>See how the model behaves on its own, with no scenario applied, before testing interventions. This is the reference every scenario on the Scenarios & Simulation tab gets compared against.</p>
        <p>The run starts from A(0), the initial activation vector defined on the Model editor / Network tab (0 for any concept you haven't set), and follows the model's current update rule, A(t+1) = {effectiveSquash === "sigmoid" ? "sigmoid" : "tanh"}(A(t) + W x A(t)) applied element-wise. It stops once the largest change across all concepts drops below the convergence threshold or the iteration cap is reached (currently {settings.maxIterations} iterations, threshold {settings.convergenceThreshold}, both editable in Scenarios &amp; Simulation to Advanced options).</p>
        <p><strong>Steepness (&lambda;) is doing more work here than the choice of curve.</strong> Both options are bipolar logistic curves through the origin, and they are the same curve at different gains: this app's sigmoid, 2/(1+e<sup>-&lambda;x</sup>) &minus; 1, is exactly tanh(&lambda;x/2), so selecting it is equivalent to running tanh at <em>half</em> the steepness. &lambda; is the slope at 0, which is the loop gain of the whole system: when it is too low for the given weight matrix, the all-zero state is attracting and every run decays back to 0 regardless of how the model is wired, and when it is high enough activation sustains itself and the run settles away from 0. So if a run collapses to 0 under sigmoid but not under tanh at the same &lambda;, that is the factor-of-two gain difference, not a difference in the shape of the function: raising &lambda; to about double reproduces the tanh result exactly. Sweep &lambda; before concluding that a model has no non-trivial equilibrium.</p>
        <p>This tab always runs with no forcing terms, regardless of anything set up on the Scenarios &amp; Simulation tab: it's a fixed, isolated reference run, not affected by (and not affecting) any scenario.</p>
        </div>
      </FoldableBox>

      {sharedHasOverrides && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Scenarios &amp; Simulation has driver/lock overrides configured on "Baseline"; this tab always runs with no forcing terms, so those aren't applied here. To test them, use Scenarios &amp; Simulation instead.
        </div>
      )}

      {!result && allInitialZero && !sharedHasOverrides && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <strong>Every concept is currently at 0.</strong> That's a valid, deliberate setup for checking the model's structure in isolation, and it has one unavoidable mathematical consequence worth knowing before you run it: with tanh(0) = sigmoid(0) = 0 and no concept locked or forced, activation cannot appear from nothing, so the run below will converge back to exactly 0 in a single step, for either squash function. That's not a bug; it's the same reason a system sitting still at rest doesn't spontaneously start moving. To see the causal structure actually produce something, either give one or more concepts a real starting value in the initial state vector below (or on the <button onClick={() => setTab("editor")} className="underline font-medium">Model editor tab</button>) reflecting an observed/elicited current condition, or hold a concept active for a full run via a driver on the <button onClick={() => setTab("scenarios")} className="underline font-medium">Scenarios &amp; Simulation tab</button>.
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <h4 className="text-sm font-semibold">Initial state vector: A(0)</h4>
          <div className="flex items-center border border-slate-300 rounded-md overflow-hidden text-xs" role="group" aria-label="Initial state source">
            <button
              onClick={() => setInitState((st) => ({ ...st, mode: "model" }))}
              className={`px-2.5 py-1 ${!customInit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              title="Start from each concept's initial value as set on the Model editor tab or in the Inspector"
            >Model's initial values</button>
            <button
              onClick={switchToCustom}
              className={`px-2.5 py-1 border-l border-slate-300 ${customInit ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              title="Set a starting value for each concept here, for this tab's run only"
            >Custom for this run</button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          {customInit
            ? "These starting values are used by this tab only; Scenarios & Simulation and the other tabs keep using the model's initial values. Running the baseline from several different starting vectors is the standard check of whether the model has one equilibrium (the same end state from every start) or several (the end state depends on where it starts)."
            : "The run starts from each concept's initial value as set on the Model editor tab or in the Inspector. Switch to \"Custom for this run\" to try other starting values here without changing the model."}
        </p>
        {customInit && (
          <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
            <span className="text-slate-500">Set all:</span>
            {[
              ["Model values", (c) => c.initialValue ?? 0],
              ["0", () => 0],
              ["+0.5", () => 0.5],
              ["\u22120.5", () => -0.5],
              ["+1", () => 1],
              ["Random", () => Math.random() * 2 - 1],
            ].map(([label, fn]) => (
              <button key={label} onClick={() => setAllCustom(fn)} className="px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" title={label === "Random" ? "A random value between \u22121 and +1 for every concept" : undefined}>
                {label}
              </button>
            ))}
            {updateConcept && (
              <button onClick={saveInitToModel} className="ml-auto px-2 py-0.5 rounded border border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100" title="Copy these values into the model's own initial values. Scenarios & Simulation and the other tabs will then start from them too.">
                Save as the model's initial values
              </button>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1 font-medium pr-3">Concept</th>
                <th className="py-1 font-medium pr-3" title="The concept's initial value on the Model editor tab">Model's initial value</th>
                <th className="py-1 font-medium">Used for this run</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="py-1 pr-3">{c.name}</td>
                  <td className="py-1 pr-3 font-mono text-slate-400">{round2(c.initialValue ?? 0)}</td>
                  <td className="py-1">
                    {customInit ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="range" min={-1} max={1} step={0.05} value={initVector[c.id]}
                          onChange={(e) => setCustomValue(c.id, parseFloat(e.target.value))}
                          className="w-32 accent-teal-700" aria-label={`Initial value for ${c.name}`}
                        />
                        <input
                          type="number" min={-1} max={1} step={0.05} value={initVector[c.id]}
                          onChange={(e) => setCustomValue(c.id, parseFloat(e.target.value) || 0)}
                          className="w-16 text-xs font-mono text-right border border-slate-200 rounded px-1 py-0.5"
                        />
                        {Math.abs(initVector[c.id] - (c.initialValue ?? 0)) > 1e-9 && <span className="text-[10px] text-amber-700">changed</span>}
                      </div>
                    ) : (
                      <span className="font-mono">{round2(initVector[c.id])}</span>
                    )}
                  </td>
                </tr>
              ))}
              {concepts.length === 0 && <tr><td colSpan={3} className="py-2 text-slate-400 italic">No concepts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-semibold text-sm">Run baseline equilibrium</h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-300 rounded-md overflow-hidden text-xs" title="Overrides the shared squash function for this tab only; Scenarios & Simulation, Sensitivity Analysis, and Transition Point Analysis keep using whatever's set in Scenarios & Simulation's Advanced options.">
            <button onClick={() => setSquashOverride("tanh")} className={`px-2.5 py-1.5 ${effectiveSquash === "tanh" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Hyperbolic tangent</button>
            <button onClick={() => setSquashOverride("sigmoid")} className={`px-2.5 py-1.5 border-l border-slate-300 ${effectiveSquash === "sigmoid" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Sigmoid</button>
          </div>
          <div
            className="flex items-center gap-2"
            title="Steepness (lambda) of the squash function for this tab only. It is the slope of the curve at 0, so it sets the loop gain of the whole model: too low and every run decays back to 0 whatever the weights say, high enough and activation sustains itself and the run settles elsewhere."
          >
            <label className="text-xs text-slate-500 whitespace-nowrap">Steepness &lambda;</label>
            <input
              type="range" min={0.1} max={5} step={0.1} value={effectiveLambda}
              onChange={(e) => setLambdaOverride(parseFloat(e.target.value))}
              className="w-28 accent-teal-700"
            />
            <input
              type="number" min={0.1} max={10} step={0.1} value={effectiveLambda}
              onChange={(e) => setLambdaOverride(clamp(parseFloat(e.target.value) || 1, 0.1, 10))}
              className="w-16 text-xs font-mono text-right border border-slate-200 rounded px-1 py-0.5"
            />
            {lambdaOverride !== null && (
              <button
                onClick={() => setLambdaOverride(null)}
                className="text-[11px] text-slate-400 underline hover:text-slate-600 whitespace-nowrap"
                title={`Go back to the shared setting (${settings.lambda ?? 1}) from Scenarios & Simulation's Advanced options`}
              >
                reset
              </button>
            )}
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
          {modelChanged && <StaleResultBanner label="the baseline equilibrium" />}
          {initChanged && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-1.5">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>The initial state vector above has changed since this run: the results below still start from the previous one. Click Run to use the new starting values.</span>
            </div>
          )}

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
    a.download = scopedFilename(filename);
    a.click();
  });
}

// The Network tab's canvas isn't a single <svg> the way a Recharts chart is
// — it's a React Flow tree (HTML node cards, an SVG edge layer, the
// minimap, zoom controls) — so it goes through html-to-image's DOM capture
// instead of svgElementToPngBlob, the same "dom" mode already used to embed
// this same canvas into the Export Analysis Workbook (see CHART_TARGETS /
// captureOneChart below), with the same settings for a consistent look
// between the two. Returns a Promise<boolean> (true on a real download) so
// the toolbar button can show a brief busy state and silently no-op if
// nothing is mounted to capture yet.
async function exportNetworkDiagramAsPng(containerEl, filename) {
  if (!containerEl) return false;
  const rect = containerEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  try {
    const blob = await domNodeToPngBlob(containerEl, { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true });
    if (!blob) return false;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = scopedFilename(filename);
    a.click();
    return true;
  } catch {
    return false;
  }
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(rows, filename) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = scopedFilename(filename);
  a.click();
}

// Downloads of analysis output carry the active analysis scope in their file
// name ("...-terrestrial-module.png"), so a figure or table saved from a
// module view can't later be mistaken for a full-nexus one. Kept as module
// state, updated by the app shell whenever the scope changes, so every
// export helper picks it up without threading it through each call site.
// The model file itself (Export JSON) is never scoped: it is always the
// complete model.
let activeScopeSlug = "";
function setActiveScopeSlug(label, isFiltered) {
  activeScopeSlug = isFiltered ? String(label).toLowerCase().replace(/\u2194/g, "to").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "";
}
function scopedFilename(name) {
  if (!activeScopeSlug) return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? `${name.slice(0, dot)}-${activeScopeSlug}${name.slice(dot)}` : `${name}-${activeScopeSlug}`;
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
  analysisConcepts = concepts, analysisEdges = edges, viewInfo = null, multiScale = null, routeConfig = null,
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

  // ==== Analysis Scope =================================================
  // The model record below (Model Structure, Adjacency Matrix) is always the
  // complete model. Every analysis sheet after it describes whichever view
  // was active on export — possibly one module, or only the relationships
  // between modules — and this sheet says which, so a number lifted out of
  // the workbook can always be traced back to the network it describes.
  const v = viewInfo;
  const scopeRows = [
    { item: "Analysed network", value: v ? v.label : "Full Nexus" },
    { item: "View mode", value: !v ? "Modules" : v.mode === "nexus" ? "Nexus Interface (only relationships between different modules)" : "Modules (every relationship among the concepts in view)" },
    { item: "Modules in view", value: v ? v.moduleLabels.join(", ") : "All" },
    { item: "Isolated concepts", value: !v || v.showIsolated ? "Included" : "Excluded (concepts with no relationship inside the view)" },
    { item: "Concepts analysed", value: v ? `${v.visibleConcepts} of ${v.totalConcepts}` : String(concepts.length) },
    { item: "Relationships analysed", value: v ? `${v.visibleEdges} of ${v.totalEdges}` : String(edges.length) },
    { item: "Sheets describing the complete model", value: "Model Structure, Adjacency Matrix" },
    { item: "Sheets describing the analysed network", value: "Network Metrics, Category Metrics, Baseline, Scenarios, Sensitivity, Transition Point, Influence Routes, Bridge Concepts, Feedback Loops, System Overview and every chart" },
    { item: "Sheets at fixed scales (independent of the view)", value: "Multi-scale Ranks, Leverage by Scale: always the full nexus, each module on its own, and the nexus interface" },
  ];
  if (v?.isFiltered) {
    scopeRows.push({
      item: "Interpretation",
      value: v.mode === "nexus"
        ? "Within-module relationships were removed. Structural metrics describe each concept's role in coupling the modules; simulation results describe a coupling-only network and should be used to compare coupling structures, not as predictions of system behaviour."
        : "The selected module(s) were analysed in isolation: relationships to concepts outside the view, and any feedback running through them, are excluded. Differences from the full-nexus results reflect the effect of cutting those links.",
    });
  }
  const scopeSheet = addDataSheet(workbook, "Analysis Scope", [{ header: "Item", key: "item" }, { header: "Value", key: "value" }], scopeRows, usedNames);
  scopeSheet.getColumn(2).width = 100;
  scopeSheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  // ==== Model Structure ================================================
  const inView = new Set(analysisConcepts.map((c) => c.id));
  addDataSheet(workbook, "Model Structure", [
    { header: "ID", key: "id" }, { header: "Name", key: "name" },
    { header: "Category", key: "category" }, { header: "Description", key: "description" },
    { header: "Initial Value", key: "initialValue" },
    { header: "Outgoing Relationships", key: "outCount" }, { header: "Incoming Relationships", key: "inCount" },
    ...(v?.isFiltered ? [{ header: "In Analysed View", key: "inView" }] : []),
  ], concepts.map((c) => ({
    id: c.id, name: c.name, category: c.category || "", description: c.description || "",
    initialValue: c.initialValue,
    outCount: edges.filter((e) => e.source === c.id).length,
    inCount: edges.filter((e) => e.target === c.id).length,
    inView: inView.has(c.id) ? "Yes" : "No",
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
    { header: "Driver Score", key: "driverScore" }, { header: "Receiver Score", key: "receiverScore" },
    { header: "Betweenness", key: "betweenness" },
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
  const baselineInitOf = (c) => baselineResult?.series?.[0]?.values?.[c.id] ?? c.initialValue ?? 0;
  const baselineInitType = () => (analysisConcepts.every((c) => Math.abs(baselineInitOf(c)) < 1e-9)
    ? "All zeros" : baselineResult.__initMode === "custom" ? "Custom (set on the Baseline Equilibrium tab)" : "Model's initial values");
  if (baselineResult) {
    const bSheet = addDataSheet(workbook, "Baseline Equilibrium", [
      { header: "Concept", key: "name" }, { header: "Initial Value (A0)", key: "initial" },
      { header: "Equilibrium Value", key: "final" }, { header: "Change", key: "delta" },
    ], analysisConcepts.map((c) => {
      const initial = round2(baselineInitOf(c));
      const final = baselineResult.final?.[c.id] ?? initial;
      return { name: c.name, initial, final: round2(final), delta: round2(final - initial) };
    }), usedNames);
    bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []); bSheet.spliceRows(1, 0, []);
    bSheet.getCell("A1").value = "Initial state type:"; bSheet.getCell("B1").value = baselineInitType();
    bSheet.getCell("A2").value = "Converged:"; bSheet.getCell("B2").value = baselineResult.converged ? "Yes" : "No";
    bSheet.getCell("A3").value = "Iterations to convergence:"; bSheet.getCell("B3").value = baselineResult.iterationsRun;
    bSheet.getCell("A4").value = "Maximum residual change:"; bSheet.getCell("B4").value = round2(seriesFinalMaxDelta(baselineResult.series));
    bSheet.getCell("A5").value = "Stale (model edited since this ran):"; bSheet.getCell("B5").value = isStale(baselineResult) ? "Yes, re-run before relying on this" : "No";
    if (isStale(baselineResult)) { bSheet.getCell("B5").font = { bold: true, color: { argb: "FFB45309" } }; }
    bSheet.views = [{ state: "frozen", ySplit: 6 }];
    bSheet.autoFilter = "A6:D6"; // header row shifted down by the 5 spliced-in diagnostic rows above

    addDataSheet(workbook, "Baseline Iterations", [
      { header: "Iteration", key: "iteration" },
      ...analysisConcepts.map((c) => ({ header: c.name, key: c.id })),
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
      ], analysisConcepts.map((c) => {
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

  // ==== Feedback loops (analysed network) ================================
  {
    const fl = analyseFeedbackLoops(analysisConcepts, analysisEdges);
    const label = new Map(listModules(analysisConcepts).map((m) => [m.key, m.label]));
    const nameOf = new Map(analysisConcepts.map((c) => [c.id, c.name]));
    const flSheet = addDataSheet(workbook, "Feedback Loops", [
      { header: "Rank", key: "rank" }, { header: "Loop", key: "loop" }, { header: "Modules", key: "modules" },
      { header: "Within or Between Modules", key: "scope" }, { header: "Length", key: "length" },
      { header: "Type", key: "type" }, { header: "Strength", key: "strength" },
    ], fl.loops.map((l, i) => ({
      rank: i + 1,
      loop: [...l.nodes, l.nodes[0]].map((id) => nameOf.get(id)).join(" -> "),
      modules: l.modules.map((k) => label.get(k)).join(", "),
      scope: l.within ? "Within" : "Between", length: l.length,
      type: l.type === "reinforcing" ? "Reinforcing" : "Balancing", strength: round3(l.strength),
    })), usedNames);
    const t = (x) => `${x.count} (${x.reinforcing} reinforcing, ${x.balancing} balancing)`;
    flSheet.spliceRows(1, 0, []); flSheet.spliceRows(1, 0, []);
    flSheet.getCell("A1").value = `Whole system: ${t(fl.total)}. Within modules: ${t(fl.within)}. Between modules: ${t(fl.between)}.${fl.capped ? " Enumeration capped at 300 loops of up to 8 relationships, so counts are lower bounds." : ""}`;
    flSheet.getCell("A1").font = { bold: true };
    flSheet.views = [{ state: "frozen", ySplit: 3 }];
    flSheet.autoFilter = "A3:G3";
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
    addDataSheet(workbook, "Convergence Diagnostics", [{ header: "Metric", key: "metric" }, { header: "Value", key: "value" }], [
      { metric: "Initial State Type", value: baselineInitType() },
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
    { metric: "Clustering Coefficient (mean local, undirected)", value: systemStats.clusteringEligible ? systemStats.clustering : "N/A" },
    { metric: "Modularity Q (module partition)", value: systemStats.modularity === null ? "N/A" : systemStats.modularity },
    { metric: "Modules in Scope", value: systemStats.moduleCount },
    { metric: "Interface Relationships (cross-module)", value: systemStats.interfaceEdges },
    { metric: "Interface Share of Relationships (%)", value: systemStats.interfaceShare },
  ], usedNames);

  // ==== Multi-scale ranks + leverage by scale (fixed scales) ================
  const report = multiScale || computeMultiScaleReport(concepts, edges, settings);
  const byField = Object.fromEntries(["influence", "centrality", "betweenness"].map((f) => [f, new Map(multiScaleRows(report, f).map((r) => [r.id, r]))]));
  const msCols = [{ header: "Concept", key: "name" }, { header: "Module", key: "module" }];
  [["influence", "Influence"], ["centrality", "Centrality"], ["betweenness", "Betweenness"]].forEach(([f, label]) => {
    msCols.push(
      { header: `Global ${label}`, key: `${f}_g` }, { header: `Global ${label} Rank`, key: `${f}_gr` },
      { header: `Module ${label}`, key: `${f}_m` }, { header: `Module ${label} Rank`, key: `${f}_mr` },
      { header: `Interface ${label}`, key: `${f}_i` }, { header: `Interface ${label} Rank`, key: `${f}_ir` },
    );
  });
  msCols.push({ header: "Importance Mainly From (influence)", key: "profile" });
  addDataSheet(workbook, "Multi-scale Ranks", msCols, report.nets.full.concepts.map((c) => {
    const row = { name: c.name, module: byField.influence.get(c.id)?.moduleLabel, profile: byField.influence.get(c.id)?.profile };
    Object.entries(byField).forEach(([f, map]) => {
      const r = map.get(c.id);
      row[`${f}_g`] = r?.global.value; row[`${f}_gr`] = r?.global.rank;
      row[`${f}_m`] = r?.module ? r.module.value : "N/A"; row[`${f}_mr`] = r?.module ? r.module.rank : "N/A";
      row[`${f}_i`] = r?.interface ? r.interface.value : "N/A"; row[`${f}_ir`] = r?.interface ? r.interface.rank : "N/A";
    });
    return row;
  }), usedNames);
  const levRows = [];
  leverageByScale(report, 5).forEach((s) => {
    if (!s.top.length) levRows.push({ scale: s.label, n: s.n, rank: "", name: "(no concept moves anything else at this scale)", influence: "" });
    s.top.forEach((m, i) => levRows.push({ scale: s.label, n: s.n, rank: i + 1, name: m.name, influence: m.influence }));
  });
  addDataSheet(workbook, "Leverage by Scale", [
    { header: "Scale", key: "scale" }, { header: "Concepts at Scale", key: "n" }, { header: "Rank", key: "rank" },
    { header: "Concept", key: "name" }, { header: "Influence Score", key: "influence" },
  ], levRows, usedNames);

  // ==== Routes + bridge concepts (analysed network, current selection) =====
  if (routeConfig) {
    const aModules = listModules(analysisConcepts);
    const keys = aModules.map((m) => m.key);
    const mA = keys.includes(routeConfig.moduleA) ? routeConfig.moduleA : keys[0] || "";
    const mB = keys.includes(routeConfig.moduleB) && routeConfig.moduleB !== mA ? routeConfig.moduleB : keys.find((k) => k !== mA) || "";
    const cfg = { ...routeConfig, moduleA: mA, moduleB: mB };
    const feasible = !((cfg.kind === "between" && (!mA || !mB)) || (cfg.kind === "interface" && aModules.length < 2));
    const label = new Map(aModules.map((m) => [m.key, m.label]));
    const nameOf = new Map(analysisConcepts.map((c) => [c.id, c.name]));
    const moduleOf = new Map(analysisConcepts.map((c) => [c.id, moduleKey(c.category)]));
    const kindText = cfg.kind === "within" ? `Within ${label.get(mA)}` : cfg.kind === "between"
      ? `Between ${label.get(mA)} and ${label.get(mB)} (${cfg.direction === "ab" ? `${label.get(mA)} to ${label.get(mB)}` : cfg.direction === "ba" ? `${label.get(mB)} to ${label.get(mA)}` : "both directions"})`
      : cfg.kind === "interface" ? "Cross-module (crosses at least one module boundary)" : "All routes";
    if (feasible) {
      const pw = analyseInfluenceRoutes(analysisConcepts, analysisEdges, cfg);
      const pSheet = addDataSheet(workbook, "Influence Routes", [
        { header: "Rank", key: "rank" }, { header: "Route", key: "path" }, { header: "Modules", key: "mods" },
        { header: "Length", key: "length" }, { header: "Module Crossings", key: "crossings" }, { header: "Sign", key: "sign" }, { header: "Strength", key: "strength" },
      ], pw.paths.slice(0, 5000).map((p, i) => ({
        rank: i + 1, path: p.nodes.map((id) => nameOf.get(id)).join(" -> "), mods: p.nodes.map((id) => label.get(moduleOf.get(id))).join(" -> "),
        length: p.length, crossings: p.crossings, sign: p.sign > 0 ? "+" : "-", strength: round3(p.strength),
      })), usedNames);
      pSheet.spliceRows(1, 0, []); pSheet.spliceRows(1, 0, []);
      pSheet.getCell("A1").value = `Selection: ${kindText}; length ${cfg.minLen}-${cfg.maxLen}${cfg.fromId ? `; from ${nameOf.get(cfg.fromId) ?? "(out of scope)"}` : ""}${cfg.toId ? `; to ${nameOf.get(cfg.toId) ?? "(out of scope)"}` : ""}. ${pw.paths.length}${pw.truncated ? "+ (enumeration capped)" : ""} routes${pw.paths.length > 5000 ? ", strongest 5000 listed" : ""}.`;
      pSheet.getCell("A1").font = { bold: true };
      pSheet.views = [{ state: "frozen", ySplit: 3 }];
      pSheet.autoFilter = "A3:G3";
      addDataSheet(workbook, "Bridge Concepts", [
        { header: "Concept", key: "name" }, { header: "Module", key: "module" },
        { header: "Share of Route Strength", key: "share" }, { header: "Routes Through", key: "throughCount" },
        { header: "Boundary Crossings", key: "boundaryCrossings" }, { header: "Bottleneck (share >= 50%)", key: "bottleneck" },
      ], pw.bridges.map((b) => ({ ...b, module: label.get(b.moduleKey), bottleneck: b.share >= 0.5 ? "Yes" : "" })), usedNames);
    } else {
      addDataSheet(workbook, "Influence Routes", [{ header: "Note", key: "note" }], [
        { note: `Selection "${kindText}" needs at least two modules in the analysed network, which the exported view does not have.` },
      ], usedNames);
    }
  }

  // ==== Chart images =======================================================
  const charts = await captureAnalysisCharts(chartCache);
  const notFound = (tabName) => `Chart not captured: visit the "${tabName}" tab before exporting to include this figure (charts are only rendered once their tab has been opened).`;
  await addChartSheet(workbook, "Network Graph", charts.networkGraph, notFound("Network"), usedNames);
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
      <FoldableBox
        storageKey="se.fold.transitionWhat"
        icon={TrendingUp}
        title="What is a Transition Point?"
        summary="Finds the intervention intensity at which extra effort produces the largest extra change in an outcome, by sweeping one intervention from 0 to 1 and following each outcome's response."
      >
        <div className="text-xs text-slate-500 space-y-1.5 leading-relaxed">
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
        </div>
      </FoldableBox>

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

          <MethodPanel
            stats={[
              { label: "Simulation runs", value: result.resolution + 1, hint: "One full run to equilibrium per sampled intervention level." },
              {
                label: "Transition point precision",
                value: `±${round2(1 / result.resolution)}`,
                tone: result.resolution < 50 ? "warn" : undefined,
                hint: "A transition point can only ever be reported at one of the sampled levels, so the sweep resolution sets how precise it can possibly be.",
              },
              { label: "Transfer function / λ", value: `${settings.squashFunction ?? "tanh"} / ${settings.lambda ?? 1}` },
              {
                label: "Near-flat outcomes",
                value: `${result.rows.filter((r) => r.range <= result.flatThreshold).length} of ${result.rows.length}`,
                tone: result.rows.some((r) => r.range <= result.flatThreshold) ? "warn" : undefined,
                hint: "Outcomes whose total movement across the whole sweep is below the flat threshold. Their transition point is not meaningful.",
              },
            ]}
          >
            <p><strong>The transition point is the steepest sampled step, not a solved inflection.</strong> The sweep evaluates {result.resolution + 1} equally spaced intervention levels, takes the difference between each neighbouring pair, and reports whichever step moved most. It can only ever land on one of those sampled levels, so its precision is bounded at &plusmn;{round2(1 / result.resolution)}. Before quoting a specific threshold value, re-run at a higher resolution and check it does not move.</p>
            <p><strong>On a near-linear response the transition point is close to meaningless.</strong> If an outcome climbs at a near-constant rate, one step is "steepest" only by a rounding margin, and the dashed line lands essentially arbitrarily. The Range column and the Response type classification are the guard here: where Range is at or below the flat threshold ({result.flatThreshold}), treat the transition point as an artefact rather than a finding.</p>
            <p><strong>"Steepest" is by magnitude, in whichever direction the outcome is moving.</strong> The tool has no notion of which direction is desirable for any concept, so a transition point marks the fastest change, not an improvement. Check the sign of the effect before describing one as a leverage point.</p>
            <p><strong>One intervention, held fixed, at equilibrium.</strong> The intervention concept is locked at each level for the whole run and every other concept evolves freely; nothing here sweeps two interventions together, and the x-axis is intensity rather than time, so the curves say nothing about how long a transition takes or what happens en route.</p>
          </MethodPanel>

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
  // Whatever was autosaved in this browser, if anything (read once).
  const [restored] = useState(readAutosave);
  const [concepts, setConcepts] = useState(() => restored?.concepts ?? makeTemplate("agriculture").concepts);
  const [edges, setEdges] = useState(() => restored?.edges ?? makeTemplate("agriculture").edges);
  const [restoreNotice, setRestoreNotice] = useState(() => !!restored?.concepts?.length);

  // ==== module-based network view ============================================
  // `concepts`/`edges` above are always the complete model and the only
  // source of truth; every edit writes to them. The view is a lens over
  // them: `aConcepts`/`aEdges` ("analysed") are the sub-network the active
  // view selects, and they're what the Network tab draws and what every
  // analysis tab computes on. Nothing is ever removed from the model by a
  // view — switching back to the full nexus shows everything, exactly as
  // it was, including positions of concepts that were out of view.
  const [networkView, setNetworkView] = useState(DEFAULT_NETWORK_VIEW);
  const modules = useMemo(() => listModules(concepts), [concepts]);
  // Module colours follow the order modules first appear in this model.
  useMemo(() => assignCategoryColors(concepts), [concepts]);
  const activeView = useMemo(
    () => applyNetworkView(concepts, edges, networkView, modules),
    [concepts, edges, networkView, modules]
  );
  const aConcepts = activeView.concepts;
  const aEdges = activeView.edges;
  const viewLabel = describeNetworkView(networkView, modules);
  const viewModuleKeys = resolveViewModules(modules, networkView);
  // A concept created while a module is in view gets that module's category,
  // otherwise it would be created uncategorized and vanish from the view the
  // instant it appears. With several modules in view the first one is used;
  // the category can be changed in the Inspector like any other.
  const newConceptCategory = activeView.isFiltered && !viewModuleKeys.includes(UNCATEGORIZED_MODULE)
    ? (modules.find((m) => m.key === viewModuleKeys[0])?.categoryValue ?? "")
    : "";
  const viewInfo = {
    label: viewLabel,
    mode: networkView.mode,
    isFiltered: activeView.isFiltered,
    showIsolated: networkView.showIsolated,
    moduleLabels: viewModuleKeys.map((k) => modules.find((m) => m.key === k)?.label || k),
    visibleConcepts: aConcepts.length, totalConcepts: concepts.length,
    visibleEdges: aEdges.length, totalEdges: edges.length,
  };
  const [scenarios, setScenarios] = useState(() => (Array.isArray(restored?.scenarios) && restored.scenarios.length ? restored.scenarios : [BASELINE_SCENARIO]));
  const [activeScenarioId, setActiveScenarioId] = useState("baseline");
  const [compareIds, setCompareIds] = useState([]);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(restored?.settings || {}) }));
  const [selected, setSelected] = useState(null);

  // Network tab display of whatever is outside the analysis scope: removed
  // from the canvas (Hide) or kept, faded, for context (Focus). Either way
  // the analysis itself only ever uses the in-scope network.
  const [networkDisplay, setNetworkDisplay] = useState("hide");
  const focusMode = networkDisplay === "focus" && activeView.isFiltered;
  // Keyed on scope MEMBERSHIP, not on the concept objects: those change on
  // every frame of a drag, and fresh Sets each frame would force every edge
  // on the canvas to re-render mid-gesture for no change in what is faded.
  const scopeMembershipKey = focusMode
    ? `${aConcepts.map((c) => c.id).join(",")}|${aEdges.map((e) => e.id).join(",")}|${concepts.length}|${edges.length}`
    : "";
  const fadedIds = useMemo(() => {
    if (!scopeMembershipKey) return { nodes: null, edges: null };
    const inC = new Set(aConcepts.map((c) => c.id));
    const inE = new Set(aEdges.map((e) => e.id));
    return {
      nodes: new Set(concepts.filter((c) => !inC.has(c.id)).map((c) => c.id)),
      edges: new Set(edges.filter((e) => !inE.has(e.id)).map((e) => e.id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMembershipKey]);

  // Multi-scale report (full nexus / each module / nexus interface), always
  // on the complete model whatever the active scope. It needs one driven
  // simulation per concept at every scale, so it is only computed while
  // something on screen shows it (Influence Metrics, or a concept selected on
  // the Network tab) and cached against the model's structure — module
  // membership, relationships and settings, not positions or initial values —
  // so dragging nodes around never recomputes it.
  const structureSignature = useMemo(() => {
    const c = concepts.map((c) => `${c.id}:${moduleKey(c.category)}:${c.name}`).join(",");
    const e = edges.map((e) => `${e.id}:${e.source}:${e.target}:${e.weight}`).join(",");
    return `${c}|${e}|${JSON.stringify(settings)}`;
  }, [concepts, edges, settings]);
  const needMultiScale = tab === "metrics";
  // Computed after the tab has painted (and debounced, so dragging a weight
  // slider doesn't queue a recomputation per tick): on a 120-concept model it
  // is ~1.5 s of simulation, which must not freeze a tab switch. Until the
  // fresh report lands, the previous one stays on screen marked as updating.
  const [multiScaleState, setMultiScaleState] = useState(null);
  useEffect(() => {
    if (!needMultiScale || multiScaleState?.sig === structureSignature) return;
    const t = setTimeout(() => {
      setMultiScaleState({ sig: structureSignature, report: computeMultiScaleReport(concepts, edges, settings) });
    }, multiScaleState ? 400 : 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMultiScale, structureSignature]);
  const multiScale = multiScaleState?.report ?? null;
  const multiScaleFresh = multiScaleState?.sig === structureSignature;

  const [routeConfig, setRouteConfig] = useState(DEFAULT_ROUTE_CONFIG);
  // The concept whose name field should be focused next (just created), and
  // a request to centre the map on a concept or relationship.
  const [newConceptId, setNewConceptId] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  // Baseline Equilibrium's own initial state (model values or a custom
  // vector), kept here so it survives switching tabs.
  const [baselineInit, setBaselineInit] = useState(DEFAULT_BASELINE_INIT);

  useEffect(() => { setActiveScopeSlug(viewLabel, activeView.isFiltered); }, [viewLabel, activeView.isFiltered]);
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
  // Built from the ACTIVE VIEW's network, not the whole model: switching
  // from, say, the Terrestrial module to the full nexus changes which
  // concepts and relationships every analysis runs on, so any result
  // computed under the previous view must be flagged stale exactly as if
  // the model itself had been edited.
  const simSignature = useMemo(() => {
    const c = aConcepts.map((c) => `${c.id}:${c.initialValue}`).join(",");
    const e = aEdges.map((e) => `${e.id}:${e.source}:${e.target}:${e.weight}`).join(",");
    return `${c}|${e}|${JSON.stringify(settings)}`;
  }, [aConcepts, aEdges, settings]);
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

  // ==== autosave ================================================================
  const [savedAt, setSavedAt] = useState(restored?.savedAt ?? null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const at = Date.now();
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ v: 1, savedAt: at, concepts, edges, scenarios, settings }));
        setSavedAt(at);
      } catch { /* storage unavailable or full: the model simply isn't autosaved */ }
    }, 800);
    return () => clearTimeout(t);
  }, [concepts, edges, scenarios, settings]);

  // ==== "Deleted ... Undo" notice ================================================
  const [toast, setToast] = useState(null);
  const showToast = (text) => setToast({ text, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

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
  //
  // These run unconditionally on every render of the whole app (not just
  // while the Export button's own tab is open), so they must not key off
  // `concepts`/`edges` directly: those get a brand new array reference on
  // every single position update while a node is being dragged on the
  // Network tab, even though none of these five metrics depend on position
  // at all. Left as-is, that meant dragging a node re-ran five O(n²)-ish
  // graph algorithms on every animation frame of every drag, real,
  // synchronous main-thread work with nothing on screen even needing the
  // result yet — exactly the kind of per-frame stall that can make a
  // canvas stutter or blank out mid-gesture. `simSignature` (above) already
  // excludes position for the same reason (it drives modelVersion staleness
  // checks); routing through it here means these only actually recompute
  // when something they truly depend on changes.
  // The active view's network (see simSignature), so the workbook's metric
  // sheets describe the same network as the analyses exported beside them.
  const stableModelForMetrics = useMemo(() => ({ concepts: aConcepts, edges: aEdges }), [simSignature]);
  const exportStructuralMetrics = useMemo(
    () => computeMetrics(stableModelForMetrics.concepts, stableModelForMetrics.edges),
    [stableModelForMetrics]
  );
  const exportAdvancedMetrics = useMemo(
    () => computeAdvancedMetrics(stableModelForMetrics.concepts, stableModelForMetrics.edges, settings),
    [stableModelForMetrics, settings]
  );
  const exportMetrics = useMemo(
    () => exportStructuralMetrics.map((m) => ({ ...m, ...exportAdvancedMetrics[m.id] })).sort((a, b) => b.centrality - a.centrality),
    [exportStructuralMetrics, exportAdvancedMetrics]
  );
  const exportSystemStats = useMemo(
    () => computeSystemStats(stableModelForMetrics.concepts, stableModelForMetrics.edges, exportMetrics),
    [stableModelForMetrics, exportMetrics]
  );
  const exportCategoryStats = useMemo(
    () => computeCategoryStats(stableModelForMetrics.concepts, stableModelForMetrics.edges, exportMetrics),
    [stableModelForMetrics, exportMetrics]
  );
  const exportCategoryMatrix = useMemo(
    () => computeCategoryMatrix(stableModelForMetrics.concepts, stableModelForMetrics.edges, exportCategoryStats.map((c) => c.category)),
    [stableModelForMetrics, exportCategoryStats]
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
    setNewConceptId(id);
  };
  const addConceptAt = (pos, category = "") => {
    const n = concepts.length;
    const id = uid("c");
    setConcepts((cs) => [...cs, {
      id, name: `New concept ${n + 1}`, category, description: "",
      initialValue: 0, currentValue: 0, position: pos,
    }]);
    setSelected({ kind: "concept", id });
    setNewConceptId(id);
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
    const removedName = concepts.find((c) => c.id === id)?.name || "concept";
    showToast(`Deleted "${removedName}"${removedEdgeIds.length ? ` and its ${removedEdgeIds.length} relationship${removedEdgeIds.length === 1 ? "" : "s"}` : ""}.`);
    setConcepts((cs) => cs.filter((c) => c.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    setScenarios((ss) => pruneScenarioOverrides(ss, { removedConceptId: id, removedEdgeIds }));
    setSelected((s) => (s?.id === id ? null : s));
  };
  const moveConcept = useCallback((id, pos) => setConcepts((cs) => cs.map((c) => (c.id === id ? { ...c, position: pos } : c))), []);
  // Used by Auto Arrange. Commits history itself so a layout change is a
  // single undoable step, regardless of which caller triggers it.
  //
  // Merges positions BY ID into the full model rather than replacing the
  // concepts array. The Network tab only ever sees the concepts in the
  // active view (a module, a combination, or the nexus interface), so its
  // layout result contains only those; replacing the array with it would
  // have silently deleted every concept outside the current view. Concepts
  // not in the layout keep exactly the position they had.
  const applyBulkPositions = useCallback((updatedConcepts) => {
    commitHistory();
    const nextPos = new Map(updatedConcepts.map((c) => [c.id, c.position]));
    setConcepts((cs) => cs.map((c) => (nextPos.has(c.id) ? { ...c, position: nextPos.get(c.id) } : c)));
  }, [commitHistory]);

  const addEdge = () => {
    if (concepts.length < 2) return;
    setEdges((es) => [...es, { id: uid("e"), source: concepts[0].id, target: concepts[1].id, weight: 0.5, description: "" }]);
  };
  const updateEdge = (id, patch) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEdge = (id) => {
    const removed = edges.find((e) => e.id === id);
    const nameOf = (cid) => concepts.find((c) => c.id === cid)?.name || "?";
    if (removed) showToast(`Deleted the relationship ${nameOf(removed.source)} \u2192 ${nameOf(removed.target)}.`);
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
      if (sc) next[id] = simulate(aConcepts, aEdges, sc, settings);
    });
    setResults(next);
    setResultsSignatureAtRun(resultsSimSignature);
    const activeResult = next[activeScenarioId] || next["baseline"];
    if (activeResult) {
      setConcepts((cs) => cs.map((c) => ({ ...c, currentValue: activeResult.final[c.id] ?? c.currentValue })));
    }
  }, [aConcepts, aEdges, scenarios, compareIds, settings, activeScenarioId, resultsSimSignature]);

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
  // Anything that replaces the whole model asks first, and snapshots the
  // current concepts and relationships so Undo can bring them back.
  const confirmReplace = (what) => {
    if (!concepts.length) return true;
    return window.confirm(
      `${what} replaces your current model (${concepts.length} concept${concepts.length === 1 ? "" : "s"}, ${edges.length} relationship${edges.length === 1 ? "" : "s"}).\n\n` +
      "Its concepts and relationships can be brought back with Undo (Ctrl+Z) until you reload the page. Use Export JSON first if you want to keep a file copy.\n\nContinue?"
    );
  };

  const importModel = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so choosing the same file again still triggers an import
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.concepts)) throw new Error("no concepts");
        if (!confirmReplace(`Importing "${file.name}"`)) return;
        commitHistory();
        setRestoreNotice(false);
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
        setNetworkView(DEFAULT_NETWORK_VIEW);
        setBaselineInit(DEFAULT_BASELINE_INIT);
      } catch (err) { alert("Could not read that file as a Spaghetti Engine model (a .json file saved with Export JSON)."); }
    };
    reader.readAsText(file);
  };
  const exportComparisonCSV = () => {
    const ids = ["baseline", ...compareIds.filter((i) => i !== "baseline")];
    const header = ["Concept", ...ids.map((id) => scenarios.find((s) => s.id === id)?.name || id)];
    const rows = aConcepts.map((c) => [
      c.name, ...ids.map((id) => results[id]?.final?.[c.id] !== undefined ? round2(results[id].final[c.id]) : ""),
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = scopedFilename("scenario-comparison.csv");
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
        analysisConcepts: aConcepts, analysisEdges: aEdges, viewInfo, multiScale: multiScaleFresh ? multiScale : null, routeConfig,
      });
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = scopedFilename("spaghetti-engine-analysis-workbook.xlsx");
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
      if (!confirmReplace("Building from the pasted matrix")) return;
      commitHistory();
      setRestoreNotice(false);
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
      setNetworkView(DEFAULT_NETWORK_VIEW);
      setBaselineInit(DEFAULT_BASELINE_INIT);
      setSelected(null);
      setMatrixSuccess(`Built ${newConcepts.length} concepts and ${newEdges.length} relationships.`);
    } catch (err) {
      setMatrixError(err.message || "Couldn't parse that as a matrix.");
    }
  };

  const loadTemplate = (kind, { skipConfirm = false } = {}) => {
    const label = kind === "blank" ? "Starting a blank model" : "Loading this example";
    if (!skipConfirm && !confirmReplace(label)) return;
    commitHistory();
    setRestoreNotice(false);
    setSelected(null);
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
    setNetworkView(DEFAULT_NETWORK_VIEW);
    setBaselineInit(DEFAULT_BASELINE_INIT);
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
      aConcepts.forEach((c) => {
        const bv = valueAt(base.series, i, c.id);
        const sv = valueAt(scen.series, i, c.id);
        rowB[c.id] = round2(bv);
        rowS[c.id] = round2(sv);
        rowD[c.id] = round2(sv - bv);
      });
      baseline.push(rowB); scenario.push(rowS); difference.push(rowD);
    }
    return { baseline, scenario, difference };
  }, [compareIds, results, aConcepts]);

  const selectedConcept = selected?.kind === "concept" ? concepts.find((c) => c.id === selected.id) : null;
  const selectedEdge = selected?.kind === "edge" ? edges.find((e) => e.id === selected.id) : null;

  const highlightConcept = useCallback((id) => setSelected({ kind: "concept", id }), []);
  // Open the Network tab on a concept or relationship: widen the scope if it
  // is currently hidden, select it, and centre the map on it.
  const revealItem = (kind, id) => {
    const shownConcepts = focusMode ? concepts : aConcepts;
    const shownEdges = focusMode ? edges : aEdges;
    const visible = kind === "concept" ? shownConcepts.some((c) => c.id === id) : shownEdges.some((e) => e.id === id);
    if (!visible) setNetworkView((v) => ({ ...DEFAULT_NETWORK_VIEW, showIsolated: true }));
    const e = kind === "edge" ? edges.find((x) => x.id === id) : null;
    setSelected({ kind, id });
    setTab("network");
    setFocusRequest({ kind, id, source: e?.source, target: e?.target, at: Date.now() });
  };

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
          {savedAt && (
            <span className="text-[11px] text-slate-400 mr-1 flex items-center gap-1" title="Your model is saved automatically in this browser. Use Export JSON to keep a file copy or move it to another computer.">
              <Check size={12} className="text-teal-400" />Saved in this browser {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <select
            // Always shows the prompt, so the same template can be picked again.
            value=""
            onChange={(e) => { const v = e.target.value; if (v) loadTemplate(v); }}
            className="bg-slate-800 text-xs text-slate-200 rounded px-2 py-1.5 border border-slate-700"
            title="Replace the current model with an example, or start a blank one"
          >
            <option value="" disabled>New / example model…</option>
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

      <ModuleSuggestions concepts={concepts} />

      {restoreNotice && (
        <div className="flex items-center gap-3 flex-wrap px-5 py-2 text-xs bg-teal-50 border-b border-teal-200 text-teal-900">
          <Check size={14} className="text-teal-700" />
          <span>
            <strong>Welcome back.</strong> Your model ({concepts.length} concept{concepts.length === 1 ? "" : "s"}, {edges.length} relationship{edges.length === 1 ? "" : "s"}) was restored from this browser
            {restored?.savedAt ? `, as saved on ${new Date(restored.savedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
            Analysis results are not saved, so re-run any analysis you need.
          </span>
          <span className="ml-auto flex items-center gap-3">
            <button onClick={() => setRestoreNotice(false)} className="font-medium underline hover:no-underline">Continue with this model</button>
            <button onClick={() => loadTemplate("blank", { skipConfirm: true })} className="underline hover:no-underline">Start a blank model</button>
            <button onClick={() => loadTemplate("agriculture", { skipConfirm: true })} className="underline hover:no-underline">Open the example model</button>
          </span>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white text-xs rounded-md shadow-lg px-3.5 py-2.5" role="status">
          <span>{toast.text}</span>
          <button onClick={() => { undo(); setToast(null); }} className="font-semibold text-teal-300 hover:text-teal-200">Undo</button>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white" aria-label="Dismiss"><X size={13} /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 px-5 bg-white overflow-x-auto">
        <TabButton id="editor" icon={Table2}>Model editor</TabButton>
        <TabButton id="network" icon={Share2}>Network</TabButton>
        <TabButton id="metrics" icon={BarChart3}>Influence Metrics</TabButton>
        <TabButton id="routes" icon={Route}>Influence Routes</TabButton>
        <TabButton id="equilibrium" icon={Activity}>Baseline Equilibrium</TabButton>
        <TabButton id="scenarios" icon={GitCompare}>Scenarios & Simulation</TabButton>
        <TabButton id="sensitivity" icon={SlidersHorizontal}>Sensitivity Analysis</TabButton>
        <TabButton id="transition" icon={TrendingUp}>Transition Point Analysis</TabButton>
      </div>

      <AnalysisScopeBar viewInfo={viewInfo} modules={modules} networkView={networkView} setNetworkView={setNetworkView} />

      <div className="flex-1 overflow-auto p-5 bg-slate-50">
        {["metrics", "routes", "equilibrium", "scenarios", "sensitivity", "transition"].includes(tab) && viewInfo.isFiltered && (
          <div className="mb-5"><ViewScopeBanner viewInfo={viewInfo} /></div>
        )}
        {/* ============================= EDITOR ============================= */}
        {tab === "editor" && (
          <div className="space-y-5">
            <ModelCheck concepts={concepts} edges={edges} onSelectConcept={(id) => revealItem("concept", id)} onSelectEdge={(id) => revealItem("edge", id)} />
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
                {concepts.length === 0 && <p className="text-sm text-slate-400 italic">No concepts yet: add one, paste a matrix above, or pick an example from "New / example model" at the top right.</p>}
                {concepts.map((c) => (
                  <div key={c.id} className="border border-slate-200 rounded-md p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={c.name}
                        onChange={(e) => updateConcept(c.id, { name: e.target.value })}
                        // A concept just added here gets focus so its name can be typed straight away.
                        ref={c.id === newConceptId ? (el) => { if (el) { el.focus(); el.select(); setNewConceptId(null); } } : undefined}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        placeholder="Concept name"
                        className="flex-1 text-sm font-medium border-none focus:outline-none focus:ring-1 focus:ring-teal-500 rounded px-1"
                      />
                      <button onClick={() => revealItem("concept", c.id)} className="text-[11px] text-slate-400 hover:text-teal-700" title="Show this concept on the map">show</button>
                      <button onClick={() => { commitHistory(); removeConcept(c.id); }} className="text-slate-300 hover:text-red-500" title="Delete this concept"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        placeholder="module (e.g. Water)"
                        list="se-module-options"
                        title="The module (subsystem) this concept belongs to. Existing modules are suggested as you type."
                        value={c.category || ""}
                        onChange={(e) => updateConcept(c.id, { category: e.target.value })}
                        className="text-xs flex-1 border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                      <label className="text-[11px] text-slate-500" title="Starting value for simulations, from -1 (very low) to +1 (very high)">Start</label>
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
                      <button onClick={() => { commitHistory(); removeEdge(e.id); }} className="text-slate-300 hover:text-red-500 shrink-0" title="Delete this relationship"><Trash2 size={14} /></button>
                    </div>
                    <WeightSlider value={e.weight} onChange={(v) => updateEdge(e.id, { weight: v })} />
                    <p className="text-[11px] text-slate-500 mt-1">
                      {relationshipSentence(concepts.find((c) => c.id === e.source)?.name, concepts.find((c) => c.id === e.target)?.name, e.weight)}
                    </p>
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
            concepts={focusMode ? concepts : aConcepts} edges={focusMode ? edges : aEdges} selected={selected} setSelected={setSelected}
            updateConcept={updateConcept} updateEdge={updateEdge} removeConcept={removeConcept} removeEdge={removeEdge}
            moveConcept={moveConcept} addConceptAt={addConceptAt} createEdge={createEdge} applyBulkPositions={applyBulkPositions}
            commitHistory={commitHistory} undo={undo} redo={redo} canUndo={historyPast.length > 0} canRedo={historyFuture.length > 0}
            copyConcept={copyConcept} pasteConcept={pasteConcept} hasClipboard={!!clipboard}
            hasRun={Object.keys(results).length > 0}
            setChartCache={setChartCache}
            modules={modules} networkView={networkView} setNetworkView={setNetworkView}
            viewInfo={viewInfo} newConceptCategory={newConceptCategory}
            displayMode={networkDisplay} setDisplayMode={setNetworkDisplay} allConcepts={concepts} allEdges={edges}
            fadedNodeIds={fadedIds.nodes} fadedEdgeIds={fadedIds.edges}
            focusRequest={focusRequest} focusNameId={newConceptId} onNameFocused={() => setNewConceptId(null)}
            onReveal={revealItem}
          />
        )}

        {/* ============================= INFLUENCE METRICS ============================= */}
        {tab === "metrics" && (
          <InfluenceMetricsTab concepts={aConcepts} edges={aEdges} settings={settings} onHighlight={highlightConcept} multiScale={multiScale} multiScaleFresh={multiScaleFresh} viewInfo={viewInfo} />
        )}

        {tab === "routes" && (
          <InfluenceRoutesTab concepts={aConcepts} edges={aEdges} config={routeConfig} setConfig={setRouteConfig} onHighlight={highlightConcept} />
        )}

        {/* ============================= BASELINE EQUILIBRIUM ============================= */}
        {tab === "equilibrium" && (
          <BaselineEquilibriumTab concepts={aConcepts} edges={aEdges} scenarios={scenarios} settings={settings} setTab={setTab} result={baselineResult} setResult={setBaselineResult} initState={baselineInit} setInitState={setBaselineInit} updateConcept={updateConcept} commitHistory={commitHistory} setChartCache={setChartCache} modelVersion={modelVersion} />
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
                  {aConcepts.map((c) => {
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
                      <div className="mb-4">
                        <MethodPanel
                          title="Method & diagnostics for this comparison"
                          stats={[
                            { label: "Scenarios simulated", value: 1 + compareIds.length, hint: "The baseline plus every scenario selected for comparison. Each is an independent run." },
                            { label: "Transfer function / λ", value: `${settings.squashFunction ?? "tanh"} / ${settings.lambda ?? 1}` },
                            { label: "Update rule / mode", value: `${settings.updateRule ?? "relative"} / ${settings.mode ?? "synchronous"}` },
                            {
                              label: "All runs converged",
                              value: ["baseline", ...compareIds].every((id) => !results[id] || results[id].converged) ? "Yes" : "No",
                              tone: ["baseline", ...compareIds].every((id) => !results[id] || results[id].converged) ? "good" : "warn",
                              hint: "A run that hit the iteration cap without converging has not reached a steady state, so its 'final' values are wherever it happened to stop.",
                            },
                          ]}
                        >
                          <p><strong>"Synergy" and "Trade-Off" describe direction of movement, not whether something got better.</strong> The classification counts how many outcome concepts moved up versus down relative to baseline by more than the threshold. This tool has no notion of which direction is desirable for any given concept, so a scenario that drives a harmful concept (a pollution or loss indicator, for instance) upward is counted exactly as an improvement would be. Apply your own valence to each concept before repeating any of these labels in writing.</p>
                          <p><strong>Effects are differences between two settled states.</strong> Each scenario is run independently from its own starting vector with its own locks and overrides, and the effect shown is scenario equilibrium minus baseline equilibrium, concept by concept. Concepts you have locked are held at their set value for the entire run, so their "effect" reflects your intervention rather than the model's response.</p>
                          <p><strong>The labels are count-based thresholds.</strong> Full means every outcome moved the same way, Partial means at least half did, Narrow means at least one did, and any mix of upward and downward movement past the threshold becomes a Trade-Off. A concept moving by slightly more or less than the threshold flips the count, and with few outcomes selected a single concept can change the label.</p>
                          <p><strong>Nothing here is dynamic.</strong> Iteration counts are steps to convergence, not time: a scenario converging in 8 iterations is not "faster" in any real-world sense than one converging in 40.</p>
                        </MethodPanel>
                      </div>
                      <div className="w-full h-64 mb-4">
                        <ResponsiveContainer>
                          <BarChart data={aConcepts.map((c) => {
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
                          {aConcepts.map((c) => {
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
                                    {aConcepts.map((c, i) => (
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
                          <div className="w-full" style={{ height: Math.max(200, componentChangeData.length * 26 + 40) }}>
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
                                <YAxis type="category" dataKey="name" width={labelAxisWidth(componentChangeData.map((d) => d.name))} interval={0} tick={(p) => <SingleLineTick {...p} />} />
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
            concepts={aConcepts} edges={aEdges} scenarios={scenarios} activeScenarioId={activeScenarioId} settings={settings}
            result={sensitivityResult} setResult={setSensitivityResult} setChartCache={setChartCache} modelVersion={modelVersion}
          />
        )}

        {/* ============================= TRANSITION POINT ANALYSIS ============================= */}
        {tab === "transition" && (
          <TransitionPointAnalysisTab
            concepts={aConcepts} edges={aEdges} scenarios={scenarios} activeScenarioId={activeScenarioId} settings={settings}
            result={transitionResult} setResult={setTransitionResult} setChartCache={setChartCache} modelVersion={modelVersion}
          />
        )}
      </div>

      <div className="px-5 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-400 flex items-center gap-1.5">
        <Info size={12} /> Prototype scope: runs entirely in your browser. Your model is saved automatically in this browser only; use Export JSON to keep a copy or move it to another computer. Analysis results are not saved and are re-run on demand. Monte Carlo and PDF/DOCX/PPTX export are not yet implemented.
      </div>
    </div>
  );
}
