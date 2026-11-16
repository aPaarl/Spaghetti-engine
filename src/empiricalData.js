// ============================================================================
// Empirical data: from measured values to concept values and weights
// ============================================================================
// A table of observations (rows = years or cases, columns = variables) is
// brought onto the scale of the map in three steps:
//
//   1. read     parseTable: CSV or text pasted from Excel; a first column
//               that is not numeric (or is called year, date, ...) labels
//               the rows.
//   2. match    matchColumns: a column belongs to the concept with the same
//               name (ignoring capitals and punctuation); the user can change it.
//   3. fuzzify  fuzzify: each column is mapped onto 0..1 (or -1..+1), either
//               linearly between two bounds, between two percentiles, or
//               through linguistic terms (triangular membership functions
//               centred on user-chosen values, defuzzified to the weighted
//               mean of the term values).
//
// The fuzzified table can then set start values, be compared with the
// model's baseline, and, for a time series, suggest weights for the
// relationships the experts drew (a least-squares fit of the update rule,
// in the spirit of data-driven FCM learning; Stach et al. 2005).
// Pure functions only, so the tests can run them directly.

import { normalizeConceptName } from "./mapAggregation.js";

// --- 1. read ------------------------------------------------------------------
const num = (s) => {
  if (s === undefined || s === null) return NaN;
  let t = String(s).trim().replace(/\s/g, "");
  if (!t || /^(na|n\/a|nan|-|\.)$/i.test(t)) return NaN;
  // 1.234,5 or 1234,5 (decimal comma) versus 1,234.5 (thousands comma)
  if (/,\d+$/.test(t) && !/\.\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
};

function splitLine(line, sep) {
  const out = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Returns { labelName, labels, columns: [{ name, values }] } or throws with a readable message. */
export function parseTable(text) {
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The table needs a header row and at least one row of values.");
  const head = lines[0];
  const sep = head.includes("\t") ? "\t" : (head.split(";").length > head.split(",").length ? ";" : ",");
  const header = splitLine(head, sep);
  const rows = lines.slice(1).map((l) => splitLine(l, sep));
  const firstNumeric = rows.filter((r) => Number.isFinite(num(r[0]))).length;
  const labelLike = /^(year|jaar|date|datum|time|tijd|period|periode|case|id|name|naam)$/i.test(header[0] || "");
  const hasLabel = labelLike || firstNumeric < rows.length / 2;
  const start = hasLabel ? 1 : 0;
  const columns = header.slice(start).map((name, k) => ({
    name: name || `Column ${k + 1}`,
    values: rows.map((r) => num(r[k + start])),
  })).filter((c) => c.values.some(Number.isFinite));
  if (!columns.length) throw new Error("No column with numbers was found.");
  return {
    labelName: hasLabel ? header[0] || "Row" : "Row",
    labels: rows.map((r, i) => (hasLabel ? r[0] : String(i + 1))),
    columns,
  };
}

// --- 2. match -------------------------------------------------------------------
/** { columnIndex: conceptId | "" } by name. */
export function matchColumns(columns, concepts) {
  const byName = new Map(concepts.map((c) => [normalizeConceptName(c.name), c.id]));
  return Object.fromEntries(columns.map((c, i) => [i, byName.get(normalizeConceptName(c.name)) || ""]));
}

// --- 3. fuzzify ------------------------------------------------------------------
const finite = (xs) => xs.filter(Number.isFinite);
export function quantile(xs, p) {
  const s = finite(xs).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}

export const TERM_SETS = {
  3: ["low", "medium", "high"],
  5: ["very low", "low", "medium", "high", "very high"],
};

/** Default settings for one column: linear between its minimum and maximum. */
export function defaultSpec(values) {
  const xs = finite(values);
  return { method: "minmax", low: Math.min(...xs), high: Math.max(...xs), reverse: false, terms: 3, centers: [quantile(values, 0.1), quantile(values, 0.5), quantile(values, 0.9)] };
}
export function centersFor(values, k) {
  return Array.from({ length: k }, (_, j) => quantile(values, 0.1 + (0.8 * j) / (k - 1)));
}

/**
 * One raw value to 0..1. spec: { method: "minmax" | "percentile" | "linguistic",
 * low, high (minmax), centers (linguistic, increasing), reverse }.
 * Percentile bounds are taken from `all`, the whole column.
 */
export function fuzzifyValue(x, spec, all) {
  if (!Number.isFinite(x)) return { value: NaN, term: "" };
  let v, term = "";
  if (spec.method === "linguistic") {
    const c = spec.centers;
    const k = c.length;
    const names = TERM_SETS[k] || c.map((_, j) => `term ${j + 1}`);
    if (x <= c[0]) { v = 0; term = names[0]; }
    else if (x >= c[k - 1]) { v = 1; term = names[k - 1]; }
    else {
      // triangular memberships on the centres: between two centres the two
      // degrees add up to 1; the value is their weighted mean of j / (k - 1)
      const j = c.findIndex((cj, idx) => x >= cj && x <= c[idx + 1]);
      const mu = c[j + 1] === c[j] ? 1 : (x - c[j]) / (c[j + 1] - c[j]);
      v = ((1 - mu) * j + mu * (j + 1)) / (k - 1);
      term = names[mu < 0.5 ? j : j + 1];
    }
  } else {
    const lo = spec.method === "percentile" ? quantile(all, 0.05) : spec.low;
    const hi = spec.method === "percentile" ? quantile(all, 0.95) : spec.high;
    v = hi === lo ? 0.5 : Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  }
  if (spec.reverse) v = 1 - v;
  return { value: v, term };
}

/** A whole column onto the chosen scale: "unit" 0..1 or "signed" -1..+1. */
export function fuzzify(values, spec, scale = "unit") {
  return values.map((x) => {
    const r = fuzzifyValue(x, spec, values);
    return { ...r, value: Number.isFinite(r.value) ? round4(scale === "signed" ? 2 * r.value - 1 : r.value) : NaN };
  });
}

const round4 = (v) => Math.round(v * 10000) / 10000;

/** The fuzzified table: { [conceptId]: number[] } for the matched columns. */
export function fuzzifiedTable(table, mapping, specs, scale) {
  const out = {};
  table.columns.forEach((c, i) => {
    const id = mapping[i];
    if (id) out[id] = fuzzify(c.values, specs[i], scale).map((r) => r.value);
  });
  return out;
}

// --- comparing with the model ------------------------------------------------------
/**
 * Observed values in row `to` against the model's end state when it starts
 * from row `from` (concepts without data keep their own start value).
 * `simulate(startValues)` must return { final, converged }.
 */
export function compareWithModel(fuzzy, concepts, simulate, from, to) {
  const start = Object.fromEntries(concepts.map((c) => [c.id, Number.isFinite(fuzzy[c.id]?.[from]) ? fuzzy[c.id][from] : c.initialValue]));
  const run = simulate(start);
  const rows = concepts.filter((c) => fuzzy[c.id] && Number.isFinite(fuzzy[c.id][to])).map((c) => {
    const observed = fuzzy[c.id][to];
    const simulated = run.final[c.id];
    const obsChange = Number.isFinite(fuzzy[c.id][from]) ? observed - fuzzy[c.id][from] : NaN;
    const simChange = simulated - start[c.id];
    const flat = (v) => Math.abs(v) < 0.02;
    const direction = !Number.isFinite(obsChange) ? null : flat(obsChange) && flat(simChange) ? true : flat(obsChange) || flat(simChange) ? false : Math.sign(obsChange) === Math.sign(simChange);
    return { id: c.id, name: c.name, observed: round4(observed), simulated: round4(simulated), difference: round4(simulated - observed), obsChange: round4(obsChange), simChange: round4(simChange), direction };
  });
  const mae = rows.length ? round4(rows.reduce((s, r) => s + Math.abs(r.difference), 0) / rows.length) : NaN;
  const judged = rows.filter((r) => r.direction !== null);
  return { rows, mae, directionAgreement: judged.length ? judged.filter((r) => r.direction).length / judged.length : null, converged: run.converged, start };
}

// --- suggesting weights from a time series ------------------------------------------
function inverseSquash(y, settings) {
  const lambda = settings?.lambda || 1;
  const f = settings?.squashFunction || "tanh";
  if (f === "linear") return y;
  if (f === "sigmoid") { const c = Math.min(0.999, Math.max(0.001, y)); return Math.log(c / (1 - c)) / lambda; }
  if (f === "tanh") { const c = Math.min(0.999, Math.max(-0.999, y)); return Math.atanh(c) / lambda; }
  return NaN; // trivalent cannot be inverted
}

// Solves (X'X + ridge I) b = X'y by Gaussian elimination.
function leastSquares(X, y, ridge = 1e-3) {
  const p = X[0].length;
  const A = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? ridge : 0)));
  const b = Array.from({ length: p }, (_, i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < p; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

/**
 * For each concept with incoming relationships and data for itself and all
 * its sources, fits the update rule to consecutive rows:
 *   relative rule:  f^-1(A_i(t+1)) - A_i(t) = Σ_j w_ji A_j(t)
 *   absolute rule:  f^-1(A_i(t+1))          = Σ_j w_ji A_j(t)
 * Only the relationships the experts drew are fitted (their structure is kept),
 * the weights are clipped to -1..+1, and R² says how much of the target's
 * movement the fit explains. Needs at least (number of sources + 2) steps.
 */
export function suggestWeights(fuzzy, concepts, edges, settings) {
  const isRelative = settings?.updateRule !== "absolute";
  const results = [];
  const skipped = [];
  concepts.forEach((c) => {
    const inc = edges.filter((e) => e.target === c.id && e.source !== c.id);
    if (!inc.length) return;
    const series = fuzzy[c.id];
    if (!series) return; // no data for the concept itself: nothing to fit, not worth listing
    const missing = inc.filter((e) => !fuzzy[e.source]).map((e) => concepts.find((x) => x.id === e.source)?.name || e.source);
    if (missing.length) { skipped.push({ name: c.name, reason: `no data for ${missing.join(", ")}` }); return; }
    const X = [], y = [];
    for (let t = 0; t + 1 < series.length; t++) {
      const xs = inc.map((e) => fuzzy[e.source][t]);
      const target = inverseSquash(series[t + 1], settings) - (isRelative ? series[t] : 0);
      if (xs.every(Number.isFinite) && Number.isFinite(target)) { X.push(xs); y.push(target); }
    }
    if (X.length < inc.length + 2) { skipped.push({ name: c.name, reason: `${X.length} usable steps for ${inc.length} relationship${inc.length === 1 ? "" : "s"}` }); return; }
    const w = leastSquares(X, y);
    if (!w) { skipped.push({ name: c.name, reason: "its causes move together too closely to tell apart" }); return; }
    const mean = y.reduce((s, v) => s + v, 0) / y.length;
    const ssTot = y.reduce((s, v) => s + (v - mean) ** 2, 0);
    const ssRes = y.reduce((s, v, k) => s + (v - X[k].reduce((a, x, j) => a + x * w[j], 0)) ** 2, 0);
    const r2 = ssTot > 1e-12 ? Math.max(0, 1 - ssRes / ssTot) : null;
    inc.forEach((e, j) => {
      const data = round4(Math.max(-1, Math.min(1, w[j])));
      results.push({ edgeId: e.id, source: e.source, target: e.target, expert: e.weight, data, signAgrees: Math.sign(data) === Math.sign(e.weight) || Math.abs(data) < 0.05, r2: r2 === null ? null : round4(r2), n: X.length });
    });
  });
  return { results, skipped };
}

/** Blend of expert and data weight: (1 - share) * expert + share * data. */
export const blendWeight = (expert, data, share) => round4((1 - share) * expert + share * data);
