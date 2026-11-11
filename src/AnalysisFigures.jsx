// ============================================================================
// Figures for the Baseline Equilibrium and Scenarios tabs
// ============================================================================
// Plain SVG, so the figure export (exportFigure) and the workbook capture
// save them like the other charts. Concepts are coloured by module with one
// shared palette, so a concept has the same colour in every figure.
//   ConvergenceChart          how each concept moves until the run settles,
//                             one small panel per module, lines labelled at
//                             their end
//   SteadyStateBars           where each concept settles, as bars from 0
//   ScenarioComparisonFigure  one panel per scenario: each concept's change
//                             against the baseline, with the concepts the
//                             scenario holds fixed drawn hatched

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

// One house style for every hand-drawn figure in the tool (the Recharts
// charts follow it through index.css): ink, muted text, grid and bands.
export const FIG = {
  font: "Inter, system-ui, sans-serif",
  ink: "#111827", muted: "#374151", grid: "#e5e7eb", axis: "#9ca3af", zero: "#6b7280",
  band: "#f3f4f6", panel: "#ffffff", border: "#d1d5db", fs: 12,
};
export const SCENARIO_COLORS = ["#2f6db5", "#cc7a1a", "#2e7d32", "#7b4fa8", "#c2185b", "#00838f", "#8d6e00", "#ad3b2f"];

// Width of the box the figure sits in, so figures are drawn in pixels at the
// width they get (no scaled viewBox) and fill the card.
// Set while a figure is being exported, so a figure can add what a printed
// copy needs and the page shows elsewhere (such as the key to numbered dots).
let exportingNow = false;
const exportListeners = new Set();
export function setFigureExporting(v) {
  exportingNow = !!v;
  exportListeners.forEach((f) => f());
}
export function useFigureExporting() {
  return useSyncExternalStore((f) => { exportListeners.add(f); return () => exportListeners.delete(f); }, () => exportingNow);
}

export function useBoxWidth(fallback = 900) {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(Math.floor(el.clientWidth));
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w || fallback];
}

export function niceStep(max, target = 6) {
  const raw = Math.max(1e-9, max / target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= raw);
}

export const MODULE_COLORS = ["#2e7d32", "#2f6db5", "#cc7a1a", "#7b4fa8", "#c2185b", "#00838f", "#8d6e00", "#5d6d7e", "#ad3b2f", "#3f51b5"];
const INK = FIG.ink;
const MUTED = FIG.muted;
const GRID = FIG.grid;
const FONT = FIG.font;
const NO_MODULE = "No module";

const moduleOf = (c) => (c.category && c.category.trim()) || NO_MODULE;

// Module -> colour, in the order modules first appear in the model.
export function moduleColorMap(concepts) {
  const map = new Map();
  concepts.forEach((c) => { const m = moduleOf(c); if (!map.has(m)) map.set(m, MODULE_COLORS[map.size % MODULE_COLORS.length]); });
  return map;
}

let measureCtx = null;
const textW = (s, px, bold = false) => {
  try {
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = `${bold ? 700 : 400} ${px}px ${FONT}`;
    return measureCtx.measureText(String(s)).width;
  } catch { return String(s).length * px * 0.58; }
};
function fitText(s, px, maxW, bold = false) {
  const t = String(s);
  if (textW(t, px, bold) <= maxW) return t;
  let n = t.length;
  while (n > 1 && textW(`${t.slice(0, n)}…`, px, bold) > maxW) n--;
  return `${t.slice(0, n)}…`;
}
function wrapWords(text, px, maxW) {
  const lines = [];
  String(text).split(" ").forEach((w) => {
    const last = lines[lines.length - 1];
    if (last !== undefined && textW(`${last} ${w}`, px) <= maxW) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  });
  return lines;
}
const signed = (v) => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(2);

// Lines of one colour family: shades of the module colour, so lines in one
// panel are told apart while the module stays recognisable.
function shade(hex, i, n) {
  if (n <= 1) return hex;
  const t = (i / (n - 1)) * 0.55 - 0.2; // from a little darker to lighter
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const out = c.map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Spreads labels vertically so none overlap, keeping each as close as it can
// to its own line end.
function spreadLabels(items, minGap, lo, hi) {
  const s = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < minGap) s[i].y = s[i - 1].y + minGap;
  const over = s.length ? s[s.length - 1].y - hi : 0;
  if (over > 0) { for (let i = s.length - 1; i >= 0; i--) { s[i].y -= over; if (i && s[i].y - s[i - 1].y >= minGap) break; } }
  for (let i = s.length - 2; i >= 0; i--) if (s[i + 1].y - s[i].y < minGap) s[i].y = s[i + 1].y - minGap;
  s.forEach((it) => { it.y = Math.max(lo, it.y); });
  return s;
}

// ---- convergence ------------------------------------------------------------------

// One panel per module: each concept's activation per iteration, with grid
// lines on both axes, markers along every line, and the end value and name
// at the end of each line (labels spread so they never overlap).
export function ConvergenceChart({ series, concepts, converged, diverged, iterationsRun, linear = false, fontSize = 12 }) {
  const [ref, W] = useBoxWidth();
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const modules = [...colors.keys()];
  const cols = modules.length <= 1 || W < 820 ? 1 : 2;
  const gap = 18;
  const panelW = (W - (cols - 1) * gap) / cols;
  const lfs = fs * 0.9;
  const need = Math.max(90, ...concepts.map((c) => textW(`${signed(0.5)}  ${c.name}`, lfs, true) + 22));
  const labelW = Math.min(need, panelW * 0.44);
  const padL = 46, padT = fs * 3.4, padB = fs * 3.2;
  const plotW = Math.max(120, panelW - padL - labelW - 14);
  const nPer = Math.max(1, ...modules.map((m) => concepts.filter((c) => moduleOf(c) === m).length));
  const plotH = Math.max(170, nPer * lfs * 1.25 + 10);
  const panelH = padT + plotH + padB;
  const nRows = Math.ceil(modules.length / cols);
  const noteH = fs * 2.4;
  const H = nRows * panelH + Math.max(0, nRows - 1) * gap + noteH;
  const maxIt = Math.max(1, series[series.length - 1]?.iteration ?? 1);
  let lo = -1, hi = 1;
  if (linear || diverged) {
    const vals = series.flatMap((pt) => concepts.map((c) => pt.values[c.id] ?? 0));
    lo = Math.min(0, ...vals); hi = Math.max(0, ...vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  }
  const yStep = linear || diverged ? niceStep(hi - lo, 4) : 0.5;
  const yTicks = [];
  for (let t = Math.ceil(lo / yStep - 1e-9) * yStep; t <= hi + 1e-9; t += yStep) yTicks.push(Math.round(t * 1e6) / 1e6);
  const xStep = niceStep(maxIt, Math.max(3, Math.min(8, Math.floor(plotW / 60))));
  const xTicks = [];
  for (let t = 0; t <= maxIt + 1e-9; t += xStep) xTicks.push(Math.round(t));
  if (xTicks[xTicks.length - 1] !== maxIt && maxIt - xTicks[xTicks.length - 1] > xStep * 0.4) xTicks.push(maxIt);
  const markEvery = Math.max(1, Math.ceil(series.length / 12));
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img"
        aria-label="How every concept moves until the baseline run settles, one panel per module">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {modules.map((m, mi) => {
          const x0 = (mi % cols) * (panelW + gap), y0 = Math.floor(mi / cols) * (panelH + gap);
          const px = (it) => x0 + padL + (it / maxIt) * plotW;
          const py = (v) => y0 + padT + ((hi - v) / (hi - lo)) * plotH;
          const cs = concepts.filter((c) => moduleOf(c) === m);
          const base = colors.get(m);
          const lines = cs.map((c, i) => ({ c, color: shade(base, i, cs.length), last: series[series.length - 1]?.values[c.id] ?? 0 }));
          const labels = spreadLabels(lines.map((l) => ({ ...l, y: py(l.last) })), lfs * 1.2, y0 + padT, y0 + padT + plotH);
          const lx = px(maxIt) + 14;
          return (
            <g key={m}>
              <rect x={x0 + 0.5} y={y0 + 0.5} width={panelW - 1} height={panelH - 1} rx={8} fill="#ffffff" stroke={FIG.border} />
              <rect x={x0 + 14} y={y0 + fs * 1.05} width={11} height={11} rx={2} fill={base} />
              <text x={x0 + 32} y={y0 + fs * 1.05 + 10} fontSize={fs * 1.08} fontWeight={700} fill={INK}>{m}</text>
              <text x={x0 + panelW - 14} y={y0 + fs * 1.05 + 10} fontSize={fs * 0.85} textAnchor="end" fill={MUTED}>{cs.length} concept{cs.length === 1 ? "" : "s"}</text>
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={px(0)} x2={px(maxIt)} y1={py(t)} y2={py(t)} stroke={Math.abs(t) < 1e-9 ? FIG.zero : GRID} strokeWidth={Math.abs(t) < 1e-9 ? 1 : 1} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
                  <line x1={px(0) - 4} x2={px(0)} y1={py(t)} y2={py(t)} stroke={FIG.axis} />
                  <text x={px(0) - 7} y={py(t) + fs * 0.32} fontSize={fs * 0.85} textAnchor="end" fill={MUTED}>{Math.abs(t) < 1e-9 ? "0" : t.toFixed(1)}</text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={px(t)} x2={px(t)} y1={py(hi)} y2={py(lo)} stroke={GRID} strokeDasharray="3 3" />
                  <line x1={px(t)} x2={px(t)} y1={py(lo)} y2={py(lo) + 4} stroke={FIG.axis} />
                  <text x={px(t)} y={py(lo) + fs * 1.3} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{t}</text>
                </g>
              ))}
              <line x1={px(0)} x2={px(0)} y1={py(hi)} y2={py(lo)} stroke={FIG.axis} />
              <line x1={px(0)} x2={px(maxIt)} y1={py(lo)} y2={py(lo)} stroke={FIG.axis} />
              <text x={px(maxIt / 2)} y={py(lo) + fs * 2.6} fontSize={fs * 0.9} textAnchor="middle" fill={INK}>Iteration</text>
              <text transform={`translate(${x0 + 13}, ${py((hi + lo) / 2)}) rotate(-90)`} fontSize={fs * 0.9} textAnchor="middle" fill={INK}>Activation</text>
              {lines.map((l) => (
                <g key={l.c.id}>
                  <path d={series.map((pt, k) => `${k ? "L" : "M"}${px(pt.iteration).toFixed(1)},${py(pt.values[l.c.id] ?? 0).toFixed(1)}`).join("")} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round">
                    <title>{`${l.c.name}: ends at ${signed(l.last)}`}</title>
                  </path>
                  {series.map((pt, k) => (k % markEvery === 0 && k < series.length - 1
                    ? <circle key={k} cx={px(pt.iteration)} cy={py(pt.values[l.c.id] ?? 0)} r={2.6} fill={l.color} stroke="#ffffff" strokeWidth={0.9} />
                    : null))}
                </g>
              ))}
              {labels.map((l) => (
                <g key={l.c.id}>
                  <polyline points={`${px(maxIt)},${py(l.last)} ${px(maxIt) + 6},${py(l.last)} ${lx - 3},${l.y}`} fill="none" stroke={l.color} strokeWidth={1} />
                  <circle cx={px(maxIt)} cy={py(l.last)} r={3.8} fill={l.color} stroke="#ffffff" strokeWidth={1.2} />
                  <text x={lx} y={l.y + lfs * 0.34} fontSize={lfs} fill={INK}>
                    <tspan fontWeight={700} fill={l.color}>{signed(l.last)}</tspan>
                    <tspan dx={5}>{fitText(l.c.name, lfs, x0 + panelW - 10 - lx - textW(signed(l.last), lfs, true) - 5)}</tspan>
                    <title>{l.c.name}</title>
                  </text>
                </g>
              ))}
            </g>
          );
        })}
        <text x={2} y={H - fs * 0.7} fontSize={fs * 0.9} fill={MUTED}>{converged ? `Settled after ${iterationsRun} iteration${iterationsRun === 1 ? "" : "s"}. The number at the end of each line is where the concept settles.` : diverged ? "The run ran away and was stopped. The number at the end of each line is where the concept was when it stopped." : `Did not settle within ${iterationsRun} iterations. The number at the end of each line is where the concept was at the end.`}</text>
      </svg>
    </div>
  );
}

// ---- steady state -------------------------------------------------------------------

// Where each concept settles: bars from 0, grouped by module, with the
// modules split over two columns on a wide screen. The open circle is where
// the concept started, so the bar and circle together show how far it moved.
export function SteadyStateBars({ concepts, final, initial = {}, fontSize = 12 }) {
  const [ref, W] = useBoxWidth();
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const groups = [...colors.keys()].map((m) => ({ m, rows: concepts.filter((c) => moduleOf(c) === m).map((c) => ({ c, v: final[c.id] ?? 0, s: initial[c.id] ?? 0 })) }));
  const cols = groups.length > 1 && W >= 900 ? 2 : 1;
  // Balance the modules over the columns by number of rows, in model order.
  const total = groups.reduce((a, g) => a + g.rows.length + 2, 0);
  const colOf = []; { let acc = 0; groups.forEach((g) => { colOf.push(cols === 2 && acc >= total / 2 - 1 ? 1 : 0); acc += g.rows.length + 2; }); }
  const gap = 28;
  const colW = (W - (cols - 1) * gap) / cols;
  const rowH = fs * 2.1, headH = fs * 2.6, axisH = fs * 3.6, legendH = fs * 2.2;
  const labelW = Math.min(colW * 0.42, Math.max(120, ...concepts.map((c) => textW(c.name, fs) + 26)));
  const valW = textW("+0.00", fs * 0.9, true) + 10;
  const maxAbs = Math.max(1, ...groups.flatMap((g) => g.rows.flatMap((r) => [Math.abs(r.v), Math.abs(r.s)])));
  const x0 = labelW + valW, x1 = colW - valW;
  const mid = (x0 + x1) / 2;
  const sx = (v) => mid + (v / maxAbs) * ((x1 - x0) / 2);
  const ticks = maxAbs === 1 ? [-1, -0.5, 0, 0.5, 1] : [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
  const tickLabel = (t) => (Math.abs(t) < 1e-9 ? "0" : `${t > 0 ? "+" : "-"}${Math.abs(t) % 1 === 0 ? Math.abs(t) : Math.abs(t).toFixed(1)}`);
  const colH = [0, 0];
  const placed = groups.map((g, gi) => { const c = colOf[gi]; const y = colH[c]; colH[c] += headH + g.rows.length * rowH + fs * 0.6; return { ...g, col: c, y }; });
  const plotBottom = Math.max(...colH.slice(0, cols));
  const H = plotBottom + axisH + legendH;
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img" aria-label="Where every concept settles in the baseline, as bars from 0, grouped by module">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {Array.from({ length: cols }, (_, c) => {
          const ox = c * (colW + gap);
          const bottom = colH[c] - fs * 0.6;
          return (
            <g key={`axis${c}`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={ox + sx(t)} x2={ox + sx(t)} y1={headH * 0.9} y2={bottom} stroke={Math.abs(t) < 1e-9 ? FIG.zero : GRID} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
                  <line x1={ox + sx(t)} x2={ox + sx(t)} y1={bottom} y2={bottom + 4} stroke={FIG.axis} />
                  <text x={ox + sx(t)} y={bottom + fs * 1.3} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{tickLabel(t)}</text>
                </g>
              ))}
              <line x1={ox + x0} x2={ox + x1} y1={bottom} y2={bottom} stroke={FIG.axis} />
              <text x={ox + mid} y={bottom + fs * 2.7} fontSize={fs * 0.9} textAnchor="middle" fill={INK}>Steady state (activation, -1 to +1)</text>
            </g>
          );
        })}
        {placed.map((g) => {
          const ox = g.col * (colW + gap);
          const col = colors.get(g.m);
          return (
            <g key={g.m}>
              <rect x={ox} y={g.y + fs * 0.7} width={11} height={11} rx={2} fill={col} />
              <text x={ox + 17} y={g.y + fs * 0.7 + 10} fontSize={fs * 1.02} fontWeight={700} fill={INK}>{g.m}</text>
              {g.rows.map((r, i) => {
                const y = g.y + headH + i * rowH, cy = y + rowH / 2;
                const bx = Math.min(sx(0), sx(r.v)), bw = Math.max(1.5, Math.abs(sx(r.v) - sx(0)));
                return (
                  <g key={r.c.id}>
                    {i % 2 === 0 && <rect x={ox} y={y} width={colW} height={rowH} fill={FIG.band} opacity={0.7} />}
                    <text x={ox + 6} y={cy + fs * 0.35} fontSize={fs} fill={INK}>{fitText(r.c.name, fs, labelW - 10)}<title>{r.c.name}</title></text>
                    <rect x={ox + bx} y={cy - rowH * 0.29} width={bw} height={rowH * 0.58} fill={col} rx={2}>
                      <title>{`${r.c.name}: starts at ${signed(r.s)}, settles at ${signed(r.v)}`}</title>
                    </rect>
                    <circle cx={ox + sx(r.s)} cy={cy} r={4} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
                    <text x={ox + (r.v >= 0 ? Math.max(sx(r.v), sx(r.s) + 5) + 5 : Math.min(sx(r.v), sx(r.s) - 5) - 5)} y={cy + fs * 0.33} fontSize={fs * 0.9} fontWeight={700} textAnchor={r.v >= 0 ? "start" : "end"} fill={INK}>{signed(r.v)}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        <g fontSize={fs * 0.9} fill={MUTED}>
          <rect x={4} y={H - fs * 1.55} width={16} height={fs * 0.8} rx={2} fill="#9ca3af" />
          <text x={26} y={H - fs * 0.85}>Where the concept settles</text>
          <circle cx={4 + 200 + 6} cy={H - fs * 1.15} r={4} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
          <text x={4 + 200 + 16} y={H - fs * 0.85}>Where it started</text>
        </g>
      </svg>
    </div>
  );
}

// ---- scenario comparison ---------------------------------------------------------------

// panels: [{ id, name, result, held: { conceptId: value } }]; baseline: the baseline result.
export function ScenarioComparisonFigure({ concepts, panels, baseline, mode = "change", fontSize = 12, title = "" }) {
  const [ref, boxW] = useBoxWidth();
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const rows = [...colors.keys()].flatMap((m) => concepts.filter((c) => moduleOf(c) === m).map((c) => ({ c, m })));
  const labelW = Math.min(250, Math.max(130, ...rows.map((r) => Math.max(...wrapWords(r.c.name, fs * 0.9, 200).map((l) => textW(l, fs * 0.9)))))) + 26;
  const wrapped = rows.map((r) => wrapWords(r.c.name, fs * 0.9, labelW - 26));
  const rowHs = wrapped.map((l) => Math.max(fs * 2.2, l.length * fs * 1.1 + fs * 0.9));
  const valueOf = (p, id) => {
    const v = p.result?.final?.[id];
    if (v === undefined) return null;
    return mode === "change" ? v - (baseline?.final?.[id] ?? 0) : v;
  };
  const all = panels.flatMap((p) => rows.map((r) => valueOf(p, r.c.id)).filter((v) => v !== null));
  const maxAbs = Math.max(1, ...all.map((v) => Math.abs(v)));
  const lim = maxAbs <= 1 ? 1 : Math.ceil(maxAbs * 2) / 2;
  const gap = 16;
  const panelW = Math.max(170, (boxW - labelW - panels.length * gap) / Math.max(1, panels.length));
  const headLines = panels.map((p, i) => wrapWords(`(${String.fromCharCode(97 + i)}) ${p.name}`, fs, panelW - 10));
  const headH = Math.max(...headLines.map((l) => l.length), 1) * fs * 1.25 + fs * 1.6;
  const top = (title ? fs * 2 : 0) + headH;
  const plotH = rowHs.reduce((a, b) => a + b, 0);
  const W = labelW + panels.length * (panelW + gap);
  const legendY = top + plotH + fs * 4.6;
  // legend items, wrapped onto as many lines as the width needs
  const legendItems = [...colors.entries()].map(([m, col]) => ({ m, col })).concat([{ m: "Held fixed by the scenario", col: null }]);
  { let lx = 10, ly = legendY; legendItems.forEach((it) => { const w = 22 + textW(it.m, fs * 0.85) + 18; if (lx + w > W - 6 && lx > 10) { lx = 10; ly += fs * 1.6; } it.x = lx; it.y = ly; lx += w; }); }
  const H = (legendItems.length ? legendItems[legendItems.length - 1].y : legendY) + fs * 1.4;
  const ys = []; rowHs.reduce((acc, h) => { ys.push(acc); return acc + h; }, top);
  const ticks = lim === 1 ? [-1, -0.5, 0, 0.5, 1] : [-lim, 0, lim];
  const tickLabel = (t) => (t === 0 ? "0" : Number.isInteger(t) ? String(t) : t.toFixed(1));
  return (
    <div ref={ref} className="w-full">
    <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img"
      aria-label="Each concept's change against the baseline, one panel per scenario">
      <defs>
        <pattern id="se-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ffffff" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#374151" strokeWidth="1.6" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {title && <text x={W / 2} y={fs * 1.3} fontSize={fs * 1.2} fontWeight={700} textAnchor="middle" fill={INK}>{title}</text>}
      {rows.map((r, i) => (
        <g key={r.c.id}>
          {i % 2 === 0 && <rect x={0} y={ys[i]} width={W} height={rowHs[i]} fill="#f3f4f6" />}
          <text x={labelW - 22} y={ys[i] + rowHs[i] / 2 - ((wrapped[i].length - 1) * fs * 1.1) / 2 + fs * 0.32} fontSize={fs * 0.9} textAnchor="end" fill={INK}>
            {wrapped[i].map((l, k) => <tspan key={k} x={labelW - 22} dy={k ? fs * 1.1 : 0}>{l}</tspan>)}
          </text>
          <rect x={labelW - 15} y={ys[i] + rowHs[i] / 2 - 4} width={8} height={8} fill={colors.get(r.m)} />
        </g>
      ))}
      {panels.map((p, pi) => {
        const x0 = labelW + pi * (panelW + gap) + gap / 2;
        const x = (v) => x0 + 18 + ((v + lim) / (2 * lim)) * (panelW - 36);
        return (
          <g key={p.id}>
            <text x={x0 + panelW / 2} y={top - headH + fs * 1.1} fontSize={fs} fontWeight={700} textAnchor="middle" fill={INK}>
              {headLines[pi].map((l, k) => <tspan key={k} x={x0 + panelW / 2} dy={k ? fs * 1.2 : 0}>{l}</tspan>)}
            </text>
            {ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} stroke={t === 0 ? FIG.zero : GRID} strokeWidth={t === 0 ? 1.2 : 1} strokeDasharray={t === 0 ? undefined : "3 3"} />)}
            <line x1={x(-lim)} x2={x(lim)} y1={top + plotH} y2={top + plotH} stroke={FIG.axis} />
            {ticks.map((t) => <line key={`k${t}`} x1={x(t)} x2={x(t)} y1={top + plotH} y2={top + plotH + 4} stroke={FIG.axis} />)}
            {rows.map((r, i) => {
              const v = valueOf(p, r.c.id);
              const cy = ys[i] + rowHs[i] / 2, bh = Math.min(rowHs[i] * 0.62, fs * 1.5);
              if (v === null) return <text key={r.c.id} x={x(0) + 4} y={cy + fs * 0.3} fontSize={fs * 0.75} fill={MUTED}>not run</text>;
              const held = p.held?.[r.c.id] !== undefined;
              const bx = Math.min(x(0), x(Math.max(-lim, Math.min(lim, v)))), bw = Math.max(1, Math.abs(x(Math.max(-lim, Math.min(lim, v))) - x(0)));
              const label = signed(v).replace(/^\+0\.00$|^-0\.00$/, "0.00");
              const right = v >= 0;
              return (
                <g key={r.c.id}>
                  <rect x={bx} y={cy - bh / 2} width={bw} height={bh} fill={held ? "url(#se-hatch)" : colors.get(r.m)} stroke={held ? "#374151" : "none"} strokeWidth={held ? 1 : 0}>
                    <title>{`${r.c.name}: ${held ? `held at ${signed(p.held[r.c.id])} by the scenario` : ""}${held ? "; " : ""}${mode === "change" ? "change vs baseline" : "end state"} ${signed(v)}`}</title>
                  </rect>
                  {Math.abs(v) >= 0.005 && <text x={right ? x(0) + bw + 4 : x(0) - bw - 4} y={cy + fs * 0.3} fontSize={fs * 0.78} textAnchor={right ? "start" : "end"} fill={INK}>{label}</text>}
                </g>
              );
            })}
            {ticks.map((t) => <text key={t} x={x(t)} y={top + plotH + fs * 1.4} fontSize={fs * 0.78} textAnchor="middle" fill={MUTED}>{tickLabel(t)}</text>)}
          </g>
        );
      })}
      <text x={labelW + (W - labelW) / 2} y={top + plotH + fs * 2.9} fontSize={fs * 0.95} textAnchor="middle" fill={INK}>
        {mode === "change" ? "Change relative to the baseline (activation, -1 to +1 scale)" : "End state of each scenario (activation, -1 to +1 scale)"}
      </text>
      <g fontSize={fs * 0.85} fill={INK}>
        {legendItems.map((it) => (
          <g key={it.m}>
            <rect x={it.x} y={it.y - fs * 0.75} width={16} height={fs * 0.9} fill={it.col || "url(#se-hatch)"} stroke={it.col ? "none" : "#374151"} />
            <text x={it.x + 22} y={it.y}>{it.m}</text>
          </g>
        ))}
      </g>
    </svg>
    </div>
  );
}

// ---- grouped end states -------------------------------------------------------------

// The advanced comparison: for every concept, the end state of the baseline
// and of each scenario as thin bars from 0, in the house style of the
// scenario comparison (rows grouped by module on bands, one shared axis).
// series: [{ id, name, color, final: { conceptId: value } | null }]
export function ScenarioGroupedBars({ concepts, series, fontSize = 12, linear = false }) {
  const [ref, W] = useBoxWidth();
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const rows = [...colors.keys()].flatMap((m) => concepts.filter((c) => moduleOf(c) === m).map((c) => ({ c, m })));
  const ns = Math.max(1, series.length);
  const barH = Math.max(6, fs * 0.95);
  const rowH = ns * (barH + 3) + fs * 1.1;
  const labelW = Math.min(W * 0.34, Math.max(130, ...rows.map((r) => textW(r.c.name, fs) + 30)));
  const valW = textW("+0.00", fs * 0.8, true) + 10;
  const legendItems = series.map((s) => ({ m: s.name, col: s.color }));
  { let lx = 4, ly = 0; legendItems.forEach((it) => { const w = 22 + textW(it.m, fs * 0.9) + 20; if (lx + w > W - 6 && lx > 4) { lx = 4; ly += fs * 1.7; } it.x = lx; it.y = ly; lx += w; }); }
  const legendH = (legendItems.length ? legendItems[legendItems.length - 1].y : 0) + fs * 2;
  const top = legendH + fs * 0.6;
  const plotH = rows.length * rowH;
  const H = top + plotH + fs * 3.6;
  const vals = series.flatMap((s) => (s.final ? rows.map((r) => s.final[r.c.id] ?? 0) : []));
  const lim = linear ? Math.max(1, Math.ceil(Math.max(0, ...vals.map(Math.abs)) * 2) / 2) : 1;
  const x0 = labelW + valW, x1 = W - valW;
  const x = (v) => x0 + ((v + lim) / (2 * lim)) * (x1 - x0);
  const ticks = [-lim, -lim / 2, 0, lim / 2, lim];
  const tl = (t) => (Math.abs(t) < 1e-9 ? "0" : `${t > 0 ? "+" : "-"}${Math.abs(t) % 1 === 0 ? Math.abs(t) : Math.abs(t).toFixed(1)}`);
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img" aria-label="End state of each concept in the baseline and in each scenario">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        <g fontSize={fs * 0.9} fill={INK}>
          {legendItems.map((it) => (
            <g key={it.m}>
              <rect x={it.x} y={it.y + fs * 0.35} width={16} height={fs * 0.85} rx={2} fill={it.col} />
              <text x={it.x + 22} y={it.y + fs * 1.1}>{it.m}</text>
            </g>
          ))}
        </g>
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const newModule = i > 0 && rows[i - 1].m !== r.m;
          return (
            <g key={r.c.id}>
              {i % 2 === 0 && <rect x={0} y={y} width={W} height={rowH} fill={FIG.band} />}
              {newModule && <line x1={0} x2={W} y1={y} y2={y} stroke={FIG.border} />}
              <rect x={6} y={y + rowH / 2 - 4} width={8} height={8} rx={1.5} fill={colors.get(r.m)} />
              <text x={20} y={y + rowH / 2 + fs * 0.35} fontSize={fs} fill={INK}>{fitText(r.c.name, fs, labelW - 26)}<title>{r.c.name}</title></text>
            </g>
          );
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} stroke={Math.abs(t) < 1e-9 ? FIG.zero : GRID} strokeWidth={Math.abs(t) < 1e-9 ? 1.2 : 1} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
            <line x1={x(t)} x2={x(t)} y1={top + plotH} y2={top + plotH + 4} stroke={FIG.axis} />
            <text x={x(t)} y={top + plotH + fs * 1.4} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{tl(t)}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={top + plotH} y2={top + plotH} stroke={FIG.axis} />
        <text x={(x0 + x1) / 2} y={top + plotH + fs * 2.9} fontSize={fs * 0.95} textAnchor="middle" fill={INK}>End state (activation, -1 to +1)</text>
        {rows.map((r, i) => {
          const y = top + i * rowH + fs * 0.55;
          return series.map((s, k) => {
            if (!s.final) return null;
            const v = Math.max(-lim, Math.min(lim, s.final[r.c.id] ?? 0));
            const by = y + k * (barH + 3);
            const bx = Math.min(x(0), x(v)), bw = Math.max(1.5, Math.abs(x(v) - x(0)));
            return (
              <g key={`${r.c.id}-${s.id}`}>
                <rect x={bx} y={by} width={bw} height={barH} fill={s.color} rx={1.5}><title>{`${r.c.name}, ${s.name}: ${signed(s.final[r.c.id] ?? 0)}`}</title></rect>
                <text x={v >= 0 ? bx + bw + 4 : bx - 4} y={by + barH * 0.82} fontSize={fs * 0.8} textAnchor={v >= 0 ? "start" : "end"} fill={MUTED}>{signed(s.final[r.c.id] ?? 0)}</text>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
}

// ---- sensitivity curves ------------------------------------------------------------

// One panel per output concept: where the output settles (y) while the input
// concept is held at each value of the sweep (x). Lines are one per scenario
// compared; the number in the panel header is how far the output moves from
// the low end of the sweep to the high end.
// lines: [{ key, outputId, scenarioName, color }]
export function SensitivityCurves({ data, inputName, outputs, lines, fontSize = 12 }) {
  const [ref, W] = useBoxWidth();
  const fs = fontSize;
  const cols = outputs.length <= 1 ? 1 : W >= 1100 ? 3 : W >= 680 ? 2 : 1;
  const gap = 18;
  const panelW = (W - (cols - 1) * gap) / cols;
  const padL = 46, padR = 16, padT = fs * 4.2, padB = fs * 3.4;
  const plotW = Math.max(120, panelW - padL - padR);
  const plotH = Math.max(150, Math.min(220, plotW * 0.55));
  const panelH = padT + plotH + padB;
  const nRows = Math.ceil(outputs.length / cols);
  const multi = new Set(lines.map((l) => l.scenarioName)).size > 1;
  const legend = multi ? [...new Map(lines.map((l) => [l.scenarioName, l.color])).entries()] : [];
  const legendH = legend.length ? fs * 2.2 : 0;
  const H = legendH + nRows * panelH + Math.max(0, nRows - 1) * gap + 2;
  const xs = data.map((r) => r.input);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const vals = data.flatMap((r) => lines.map((l) => r[l.key])).filter((v) => Number.isFinite(v));
  const lo = Math.min(-1, ...vals), hi = Math.max(1, ...vals);
  const yTicks = lo === -1 && hi === 1 ? [-1, -0.5, 0, 0.5, 1] : [lo, (lo + hi) / 2, hi].map((v) => Math.round(v * 100) / 100);
  const xStep = niceStep(xmax - xmin || 1, Math.max(3, Math.min(6, Math.floor(plotW / 70))));
  const xTicks = [];
  for (let t = Math.ceil(xmin / xStep - 1e-9) * xStep; t <= xmax + 1e-9; t += xStep) xTicks.push(Math.round(t * 1e6) / 1e6);
  const markEvery = Math.max(1, Math.ceil(data.length / 11));
  const fmt = (t) => (Math.abs(t) < 1e-9 ? "0" : `${t > 0 ? "+" : "-"}${Math.abs(t) % 1 === 0 ? Math.abs(t) : Math.abs(t).toFixed(Math.abs(t * 10) % 1 === 0 ? 1 : 2)}`);
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img" aria-label={`Where each output settles while ${inputName} is held at each value of the sweep`}>
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {legend.map(([name, color], i) => {
          const x = legend.slice(0, i).reduce((a, [n]) => a + 22 + textW(n, fs * 0.9) + 22, 0);
          return (
            <g key={name}>
              <line x1={x} x2={x + 16} y1={fs * 0.9} y2={fs * 0.9} stroke={color} strokeWidth={2.4} />
              <circle cx={x + 8} cy={fs * 0.9} r={3} fill={color} stroke="#fff" />
              <text x={x + 22} y={fs * 1.25} fontSize={fs * 0.9} fill={INK}>{name}</text>
            </g>
          );
        })}
        {outputs.map((o, oi) => {
          const x0 = (oi % cols) * (panelW + gap), y0 = legendH + Math.floor(oi / cols) * (panelH + gap);
          const px = (v) => x0 + padL + ((v - xmin) / (xmax - xmin || 1)) * plotW;
          const py = (v) => y0 + padT + ((hi - v) / (hi - lo)) * plotH;
          const ls = lines.filter((l) => l.outputId === o.id);
          const first = ls[0] ? data[0][ls[0].key] : 0, last = ls[0] ? data[data.length - 1][ls[0].key] : 0;
          const d = (last ?? 0) - (first ?? 0);
          const title = wrapWords(o.name, fs * 1.02, panelW - 28 - textW("moves +0.00", fs * 0.9, true) - 12).slice(0, 2);
          return (
            <g key={o.id}>
              <rect x={x0 + 0.5} y={y0 + 0.5} width={panelW - 1} height={panelH - 1} rx={8} fill="#ffffff" stroke={FIG.border} />
              <text x={x0 + 14} y={y0 + fs * 1.7} fontSize={fs * 1.02} fontWeight={700} fill={INK}>
                {title.map((l, k) => <tspan key={k} x={x0 + 14} dy={k ? fs * 1.25 : 0}>{l}</tspan>)}
              </text>
              <text x={x0 + panelW - 14} y={y0 + fs * 1.7} fontSize={fs * 0.9} textAnchor="end" fill={Math.abs(d) < 0.05 ? MUTED : d > 0 ? "#15803d" : "#c2410c"} fontWeight={700}>
                {Math.abs(d) < 0.005 ? "no change" : `moves ${signed(d)}`}
              </text>
              {yTicks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={px(xmin)} x2={px(xmax)} y1={py(t)} y2={py(t)} stroke={Math.abs(t) < 1e-9 ? FIG.zero : GRID} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
                  <line x1={px(xmin) - 4} x2={px(xmin)} y1={py(t)} y2={py(t)} stroke={FIG.axis} />
                  <text x={px(xmin) - 7} y={py(t) + fs * 0.32} fontSize={fs * 0.85} textAnchor="end" fill={MUTED}>{fmt(t)}</text>
                </g>
              ))}
              {xTicks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={px(t)} x2={px(t)} y1={py(hi)} y2={py(lo)} stroke={Math.abs(t) < 1e-9 ? "#cbd5e1" : GRID} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
                  <line x1={px(t)} x2={px(t)} y1={py(lo)} y2={py(lo) + 4} stroke={FIG.axis} />
                  <text x={px(t)} y={py(lo) + fs * 1.3} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{fmt(t)}</text>
                </g>
              ))}
              <line x1={px(xmin)} x2={px(xmin)} y1={py(hi)} y2={py(lo)} stroke={FIG.axis} />
              <line x1={px(xmin)} x2={px(xmax)} y1={py(lo)} y2={py(lo)} stroke={FIG.axis} />
              <text x={px((xmin + xmax) / 2)} y={py(lo) + fs * 2.65} fontSize={fs * 0.88} textAnchor="middle" fill={INK}>{fitText(`${inputName} held at`, fs * 0.88, plotW)}</text>
              <text transform={`translate(${x0 + 13}, ${py((hi + lo) / 2)}) rotate(-90)`} fontSize={fs * 0.88} textAnchor="middle" fill={INK}>Settles at</text>
              {ls.map((l) => (
                <g key={l.key}>
                  <path d={data.map((r, k) => `${k ? "L" : "M"}${px(r.input).toFixed(1)},${py(r[l.key] ?? 0).toFixed(1)}`).join("")} fill="none" stroke={l.color} strokeWidth={2.2} strokeLinejoin="round" />
                  {data.map((r, k) => (k % markEvery === 0 || k === data.length - 1
                    ? <circle key={k} cx={px(r.input)} cy={py(r[l.key] ?? 0)} r={3} fill={l.color} stroke="#ffffff" strokeWidth={1}><title>{`${inputName} at ${r.input}: ${o.name} ${signed(r[l.key] ?? 0)}${multi ? ` (${l.scenarioName})` : ""}`}</title></circle>
                    : null))}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- prioritisation matrix -----------------------------------------------------------

export const QUADRANTS = [
  { key: "quick", label: "Quick wins", text: "large effect, reached at low intensity", fill: "#ecfdf5", ink: "#047857" },
  { key: "strategic", label: "Strategic investments", text: "large effect, needs high intensity", fill: "#eff6ff", ink: "#1d4ed8" },
  { key: "small", label: "Small improvements", text: "small effect, reached at low intensity", fill: "#f8fafc", ink: "#475569" },
  { key: "poor", label: "Poor leverage points", text: "small effect, needs high intensity", fill: "#fff1f2", ink: "#be123c" },
];
export function quadrantOf(d, xSplit, ySplit) {
  if (d.y >= ySplit) return d.x <= xSplit ? "quick" : "strategic";
  return d.x <= xSplit ? "small" : "poor";
}

// Intervention prioritisation matrix: each outcome placed by its transition
// point (x) and the size of its effect (y), on four tinted quadrants, with
// every point named.
// points: [{ x, y, name, effect }]
export function PrioritizationMatrix({ points, xSplit = 0.5, ySplit, fontSize = 12 }) {
  const [ref, W] = useBoxWidth();
  const exporting = useFigureExporting();
  const fs = fontSize;
  const padL = 58, padR = 18, padT = 12, padB = fs * 4.2;
  const plotW = Math.max(200, W - padL - padR);
  const plotH = Math.max(260, Math.min(460, plotW * 0.5));
  // An exported copy carries the key to the numbers under the plot, since the
  // lists on the page do not travel with it.
  const kfs = fs * 0.82, kLine = kfs * 1.55;
  const kColW = Math.min(W - 16, Math.max(...points.map((p, i) => textW(`${i + 1}  ${p.name}`, kfs)), 60) + 30);
  const kCols = Math.max(1, Math.floor((W - 16) / kColW));
  const kRows = Math.ceil(points.length / kCols);
  const keyY = padT + plotH + padB;
  const keyH = exporting && points.length ? kRows * kLine + 8 : 0;
  const H = padT + plotH + padB + keyH;
  const yMax = Math.max(0.1, ...points.map((p) => p.y)) * 1.12;
  const px = (v) => padL + 14 + v * (plotW - 28);
  const py = (v) => padT + (1 - v / yMax) * plotH;
  const ys = ySplit ?? (points.length ? points.reduce((a, p) => a + p.y, 0) / points.length : yMax / 2);
  const yStep = niceStep(yMax, 5);
  const yTicks = []; for (let t = 0; t <= yMax + 1e-9; t += yStep) yTicks.push(Math.round(t * 1e6) / 1e6);
  const lfs = fs * 0.88;
  // Every dot carries its number (the same number as in the lists under the
  // figure). Names are written next to a dot where they fit without touching
  // another name or dot: right, left, above or below, in that order.
  const R = 8;
  // Dots that would sit on top of each other are moved sideways, so every
  // number stays readable; the exact values are in each dot's tooltip.
  const dots = [];
  points.forEach((p) => {
    const d = { x: px(p.x), y: py(p.y) };
    while (dots.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < R * 1.9)) d.x += R * 2 + 1;
    dots.push(d);
  });
  const boxes = dots.map((d) => ({ x0: d.x - R, x1: d.x + R, y0: d.y - R, y1: d.y + R }));
  const free = (b) => b.x0 >= padL + 2 && b.x1 <= padL + plotW - 2 && b.y0 >= padT + 2 && b.y1 <= padT + plotH - 2
    && !boxes.some((o) => o.x0 < b.x1 && b.x0 < o.x1 && o.y0 < b.y1 && b.y0 < o.y1);
  const quad = (key) => QUADRANTS.find((q) => q.key === key);
  const qRects = [
    { q: quad("quick"), x: padL, y: py(yMax), w: px(xSplit) - padL, h: py(ys) - py(yMax), ax: "end" },
    { q: quad("strategic"), x: px(xSplit), y: py(yMax), w: padL + plotW - px(xSplit), h: py(ys) - py(yMax), ax: "end" },
    { q: quad("small"), x: padL, y: py(ys), w: px(xSplit) - padL, h: py(0) - py(ys), ax: "end" },
    { q: quad("poor"), x: px(xSplit), y: py(ys), w: padL + plotW - px(xSplit), h: py(0) - py(ys), ax: "end" },
  ];
  // The quadrant captions are kept clear of the names as well.
  // A caption that a dot would cover moves to the bottom of its quadrant.
  const dotBoxes = boxes.slice();
  qRects.forEach((r) => {
    r.ty = r.y;
    if (r.h <= fs * 2.6) return;
    const tw = Math.max(textW(r.q.label, fs * 1.02) * 1.08, r.h > fs * 4 ? textW(r.q.text, fs * 0.82) : 0);
    const x1 = r.x + r.w - 4, ch = r.h > fs * 4 ? fs * 3.1 : fs * 1.9;
    const hit = (y0) => dotBoxes.some((o) => o.x0 < x1 && x1 - tw - 10 < o.x1 && o.y0 < y0 + ch && y0 < o.y1);
    if (hit(r.y) && !hit(r.y + r.h - ch - 2)) r.ty = r.y + r.h - ch - 2;
    boxes.push({ x0: x1 - tw - 10, x1, y0: r.ty, y1: r.ty + ch });
  });
  const order = points.map((p, i) => i).sort((i, j) => points[j].y - points[i].y);
  const labels = [];
  order.forEach((i) => {
    const d = dots[i], w = textW(points[i].name, lfs) + 2, h = lfs * 1.15;
    const cands = [
      { x: d.x + R + 3, y: d.y - h / 2, a: "start" }, { x: d.x - R - 3 - w, y: d.y - h / 2, a: "start" },
      { x: d.x - w / 2, y: d.y - R - 2 - h, a: "start" }, { x: d.x - w / 2, y: d.y + R + 2, a: "start" },
    ];
    const c = cands.find((k) => free({ x0: k.x, x1: k.x + w, y0: k.y, y1: k.y + h }));
    if (c) { boxes.push({ x0: c.x, x1: c.x + w, y0: c.y, y1: c.y + h }); labels.push({ i, x: c.x, y: c.y + h * 0.78 }); }
  });
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img" aria-label="Intervention prioritisation matrix: transition point against effect size">
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {qRects.map((r) => (
          <g key={r.q.key}>
            <rect x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)} fill={r.q.fill} />
            {r.h > fs * 2.6 && <text x={r.ax === "start" ? r.x + 10 : r.x + r.w - 10} y={r.ty + fs * 1.4} textAnchor={r.ax} fontSize={fs * 1.02} fontWeight={700} fill={r.q.ink}>{r.q.label}</text>}
            {r.h > fs * 4 && <text x={r.ax === "start" ? r.x + 10 : r.x + r.w - 10} y={r.ty + fs * 2.6} textAnchor={r.ax} fontSize={fs * 0.82} fill={r.q.ink}>{r.q.text}</text>}
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={padL} x2={padL + plotW} y1={py(t)} y2={py(t)} stroke={FIG.grid} strokeDasharray="3 3" opacity={0.8} />
            <line x1={padL - 4} x2={padL} y1={py(t)} y2={py(t)} stroke={FIG.axis} />
            <text x={padL - 7} y={py(t) + fs * 0.32} fontSize={fs * 0.85} textAnchor="end" fill={MUTED}>{t.toFixed(yStep < 0.1 ? 2 : 1)}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={`x${t}`}>
            <line x1={px(t)} x2={px(t)} y1={py(yMax)} y2={py(0)} stroke={FIG.grid} strokeDasharray="3 3" opacity={0.8} />
            <line x1={px(t)} x2={px(t)} y1={py(0)} y2={py(0) + 4} stroke={FIG.axis} />
            <text x={px(t)} y={py(0) + fs * 1.3} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{t}</text>
          </g>
        ))}
        <line x1={px(xSplit)} x2={px(xSplit)} y1={py(yMax)} y2={py(0)} stroke="#94a3b8" strokeWidth={1.2} />
        <line x1={padL} x2={padL + plotW} y1={py(ys)} y2={py(ys)} stroke="#94a3b8" strokeWidth={1.2} />
        <rect x={padL} y={py(yMax)} width={plotW} height={plotH} fill="none" stroke={FIG.axis} />
        <text x={px(0.5)} y={py(0) + fs * 2.7} fontSize={fs * 0.92} textAnchor="middle" fill={INK}>Transition point: the intensity from which extra effort pays off less (0 = right away, 1 = only at full intensity)</text>
        <text transform={`translate(${14}, ${py(yMax / 2)}) rotate(-90)`} fontSize={fs * 0.92} textAnchor="middle" fill={INK}>Size of the effect</text>
        {points.map((p, i) => {
          const col = p.effect >= 0 ? "#15803d" : "#c2410c";
          return (
            <g key={`d${i}`}>
              <circle cx={dots[i].x} cy={dots[i].y} r={R} fill={col} stroke="#ffffff" strokeWidth={1.5} opacity={0.92}>
                <title>{`${i + 1}. ${p.name}: transition point ${p.x.toFixed(2)}, effect ${signed(p.effect)}`}</title>
              </circle>
              <text x={dots[i].x} y={dots[i].y + 3.4} fontSize={9.5} textAnchor="middle" fill="#ffffff" fontWeight={700} pointerEvents="none">{i + 1}</text>
            </g>
          );
        })}
        {labels.map((l) => <text key={`l${l.i}`} x={l.x} y={l.y} fontSize={lfs} fill={INK}>{points[l.i].name}</text>)}
        {keyH > 0 && points.map((p, i) => {
          const col = i % kCols, row = Math.floor(i / kCols);
          const x = 8 + col * kColW, y = keyY + row * kLine + kLine / 2;
          return (
            <g key={`k${i}`}>
              <circle cx={x + 7} cy={y} r={6.5} fill={p.effect >= 0 ? "#15803d" : "#c2410c"} />
              <text x={x + 7} y={y + 2.9} fontSize={8} textAnchor="middle" fill="#ffffff" fontWeight={700}>{i + 1}</text>
              <text x={x + 19} y={y + kfs * 0.34} fontSize={kfs} fill={INK}>{p.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---- ranked impact bars --------------------------------------------------------------

// A ranked bar chart in the house style (the tornado chart): one row per
// item on a band, bars from 0, green when the item raises the target and
// orange when it lowers it, the value written at the end of each bar.
// rows: [{ name, value }]
export function RankedBars({ rows, axisLabel = "", fontSize = 12 }) {
  const [ref, W] = useBoxWidth();
  const fs = fontSize;
  const rowH = fs * 2.1;
  const labelW = Math.min(W * 0.36, Math.max(120, ...rows.map((r) => textW(r.name, fs) + 26)));
  const valW = textW("+0.00", fs * 0.9, true) + 12;
  const top = 6, plotH = rows.length * rowH, H = top + plotH + fs * 3.8;
  const lim = Math.max(0.1, ...rows.map((r) => Math.abs(r.value)));
  const step = niceStep(lim, 3);
  const L = Math.ceil(lim / step - 1e-9) * step;
  const x0 = labelW + valW, x1 = W - valW;
  const x = (v) => x0 + ((v + L) / (2 * L)) * (x1 - x0);
  const ticks = []; for (let t = -L; t <= L + 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  const tl = (t) => (Math.abs(t) < 1e-9 ? "0" : `${t > 0 ? "+" : "-"}${+Math.abs(t).toFixed(2)}`);
  return (
    <div ref={ref} className="w-full">
      <svg width={W} height={H} style={{ display: "block" }} fontFamily={FONT} role="img" aria-label={axisLabel || "Ranked impact"}>
        <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
        {rows.map((r, i) => (i % 2 === 0 ? <rect key={`b${i}`} x={0} y={top + i * rowH} width={W} height={rowH} fill={FIG.band} /> : null))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} stroke={Math.abs(t) < 1e-9 ? FIG.zero : GRID} strokeWidth={Math.abs(t) < 1e-9 ? 1.2 : 1} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : "3 3"} />
            <line x1={x(t)} x2={x(t)} y1={top + plotH} y2={top + plotH + 4} stroke={FIG.axis} />
            <text x={x(t)} y={top + plotH + fs * 1.4} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>{tl(t)}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={top + plotH} y2={top + plotH} stroke={FIG.axis} />
        {axisLabel && <text x={(x0 + x1) / 2} y={top + plotH + fs * 2.9} fontSize={fs * 0.95} textAnchor="middle" fill={INK}>{axisLabel}</text>}
        {rows.map((r, i) => {
          const cy = top + i * rowH + rowH / 2;
          const bx = Math.min(x(0), x(r.value)), bw = Math.max(1.5, Math.abs(x(r.value) - x(0)));
          const col = r.value >= 0 ? "#15803d" : "#c2410c";
          return (
            <g key={r.name}>
              <text x={6} y={cy + fs * 0.35} fontSize={fs} fill={INK}>{fitText(r.name, fs, labelW - 12)}<title>{r.name}</title></text>
              <rect x={bx} y={cy - rowH * 0.29} width={bw} height={rowH * 0.58} rx={2} fill={col}><title>{`${r.name}: ${signed(r.value)}`}</title></rect>
              <text x={r.value >= 0 ? bx + bw + 5 : bx - 5} y={cy + fs * 0.33} fontSize={fs * 0.9} fontWeight={700} textAnchor={r.value >= 0 ? "start" : "end"} fill={INK}>{signed(r.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
