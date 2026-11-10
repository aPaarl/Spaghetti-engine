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

import React from "react";

export const MODULE_COLORS = ["#2e7d32", "#2f6db5", "#cc7a1a", "#7b4fa8", "#c2185b", "#00838f", "#8d6e00", "#5d6d7e", "#ad3b2f", "#3f51b5"];
const INK = "#111827";
const MUTED = "#4b5563";
const GRID = "#e5e7eb";
const FONT = "Inter, system-ui, sans-serif";
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

export function ConvergenceChart({ series, concepts, converged, diverged, iterationsRun, linear = false, fontSize = 12 }) {
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const modules = [...colors.keys()];
  const cols = modules.length <= 1 ? 1 : 2;
  const labelW = Math.min(240, Math.max(110, ...concepts.map((c) => textW(c.name, fs * 0.82) + 44)));
  const plotW = 250, w = plotW + labelW + 46, padT = fs * 2.2, plotH = 150;
  const panelH = padT + plotH + fs * 2.4;
  const gap = 14;
  const nRows = Math.ceil(modules.length / cols);
  const W = cols * w + (cols - 1) * gap;
  const legendH = fs * 2.2;
  const H = nRows * panelH + (nRows - 1) * gap + legendH;
  const maxIt = Math.max(1, series[series.length - 1]?.iteration ?? 1);
  let lo = -1, hi = 1;
  if (linear || diverged) {
    const vals = series.flatMap((pt) => concepts.map((c) => pt.values[c.id] ?? 0));
    lo = Math.min(0, ...vals); hi = Math.max(0, ...vals);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }} fontFamily={FONT} role="img"
      aria-label="How every concept moves until the baseline run settles, one panel per module">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {modules.map((m, mi) => {
        const x0 = (mi % cols) * (w + gap), y0 = Math.floor(mi / cols) * (panelH + gap);
        const px = (it) => x0 + 34 + (it / maxIt) * plotW;
        const py = (v) => y0 + padT + ((hi - v) / (hi - lo)) * plotH;
        const cs = concepts.filter((c) => moduleOf(c) === m);
        const base = colors.get(m);
        const lines = cs.map((c, i) => ({ c, color: shade(base, i, cs.length), last: series[series.length - 1]?.values[c.id] ?? 0 }));
        const labels = spreadLabels(lines.map((l) => ({ ...l, y: py(l.last) })), fs * 0.95, y0 + padT, y0 + padT + plotH);
        const ticks = linear || diverged ? [lo, 0, hi] : [-1, -0.5, 0, 0.5, 1];
        return (
          <g key={m}>
            <rect x={x0} y={y0} width={w} height={panelH} rx={6} fill="#ffffff" stroke={GRID} />
            <rect x={x0 + 10} y={y0 + fs * 0.6} width={10} height={10} rx={2} fill={base} />
            <text x={x0 + 26} y={y0 + fs * 1.4} fontSize={fs} fontWeight={700} fill={INK}>{m}</text>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={px(0)} x2={px(maxIt)} y1={py(t)} y2={py(t)} stroke={t === 0 ? "#cbd5e1" : GRID} strokeWidth={t === 0 ? 1.2 : 1} />
                <text x={px(0) - 4} y={py(t) + 3} fontSize={fs * 0.72} textAnchor="end" fill={MUTED}>{Math.abs(t) < 1e-9 ? "0" : t.toFixed(linear || diverged ? 1 : 1)}</text>
              </g>
            ))}
            {lines.map((l) => (
              <path key={l.c.id} d={series.map((pt, k) => `${k ? "L" : "M"}${px(pt.iteration).toFixed(1)},${py(pt.values[l.c.id] ?? 0).toFixed(1)}`).join("")} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round">
                <title>{`${l.c.name}: ${signed(l.last)}`}</title>
              </path>
            ))}
            {labels.map((l) => (
              <g key={l.c.id}>
                <line x1={px(maxIt)} x2={px(maxIt) + 8} y1={py(l.last)} y2={l.y} stroke={l.color} strokeWidth={1} />
                <circle cx={px(maxIt)} cy={py(l.last)} r={2.6} fill={l.color} />
                <text x={px(maxIt) + 11} y={l.y + fs * 0.3} fontSize={fs * 0.8} fill={INK}><tspan fontWeight={600}>{signed(l.last)}</tspan> {l.c.name.length > 34 ? `${l.c.name.slice(0, 33)}…` : l.c.name}</text>
              </g>
            ))}
            {[0, maxIt].map((t) => <text key={t} x={px(t)} y={py(lo) + fs * 1.1} fontSize={fs * 0.72} textAnchor="middle" fill={MUTED}>{t}</text>)}
            <text x={(px(0) + px(maxIt)) / 2} y={py(lo) + fs * 1.1} fontSize={fs * 0.72} textAnchor="middle" fill={MUTED}>iteration</text>
          </g>
        );
      })}
      <g fontSize={fs * 0.82} fill={MUTED}>
        <text x={0} y={H - fs * 0.6}>{converged ? `Settled after ${iterationsRun} iteration${iterationsRun === 1 ? "" : "s"}. Numbers: where each concept ends.` : diverged ? "The run ran away and was stopped. Numbers: where each concept was when it stopped." : `Did not settle within ${iterationsRun} iterations. Numbers: where each concept was at the end.`}</text>
      </g>
    </svg>
  );
}

// ---- steady state -------------------------------------------------------------------

export function SteadyStateBars({ concepts, final, initial = {}, fontSize = 12 }) {
  const fs = fontSize;
  const colors = moduleColorMap(concepts);
  const rows = [...colors.keys()].flatMap((m) => concepts.filter((c) => moduleOf(c) === m).map((c) => ({ c, m, v: final[c.id] ?? 0, s: initial[c.id] ?? 0 })));
  const labelW = Math.min(260, Math.max(120, ...rows.map((r) => textW(r.c.name, fs) + 34)));
  const plotW = 340, rowH = fs * 2.0, top = fs * 1.2;
  const W = labelW + plotW + 60;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.v)), ...rows.map((r) => Math.abs(r.s)));
  const H = top + rows.length * rowH + fs * 4.4;
  const x0 = labelW + 30, mid = x0 + plotW / 2;
  const x = (v) => mid + (v / maxAbs) * (plotW / 2);
  const ticks = maxAbs === 1 ? [-1, -0.5, 0, 0.5, 1] : [-maxAbs, 0, maxAbs];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }} fontFamily={FONT} role="img" aria-label="Where every concept settles in the baseline, as bars from 0">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + rows.length * rowH} stroke={t === 0 ? "#94a3b8" : GRID} />
          <text x={x(t)} y={top + rows.length * rowH + fs * 1.1} fontSize={fs * 0.8} textAnchor="middle" fill={MUTED}>{t === 0 ? "0" : signed(t).replace(".00", "")}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rowH, cy = y + rowH / 2, col = colors.get(r.m);
        const newModule = i === 0 || rows[i - 1].m !== r.m;
        return (
          <g key={r.c.id}>
            {i % 2 === 0 && <rect x={0} y={y} width={W} height={rowH} fill="#f8fafc" />}
            {newModule && i > 0 && <line x1={0} x2={W} y1={y} y2={y} stroke="#d1d5db" />}
            <rect x={6} y={cy - 4} width={8} height={8} rx={1.5} fill={col} />
            <text x={20} y={cy + fs * 0.35} fontSize={fs} fill={INK}>{r.c.name}</text>
            <rect x={Math.min(x(0), x(r.v))} y={cy - rowH * 0.3} width={Math.max(1, Math.abs(x(r.v) - x(0)))} height={rowH * 0.6} fill={col} rx={2}>
              <title>{`${r.c.name}: starts at ${signed(r.s)}, settles at ${signed(r.v)}`}</title>
            </rect>
            <line x1={x(r.s)} x2={x(r.s)} y1={cy - rowH * 0.42} y2={cy + rowH * 0.42} stroke={INK} strokeWidth={1.6} strokeDasharray="2 2" />
            <text x={r.v >= 0 ? x(r.v) + 5 : x(r.v) - 5} y={cy + fs * 0.33} fontSize={fs * 0.85} fontWeight={600} textAnchor={r.v >= 0 ? "start" : "end"} fill={INK}>{signed(r.v)}</text>
          </g>
        );
      })}
      <text x={x0 + plotW / 2} y={H - fs * 1.9} fontSize={fs * 0.85} textAnchor="middle" fill={MUTED}>Steady state (activation, -1 to +1)</text>
      <g fontSize={fs * 0.8} fill={MUTED}>
        <line x1={6} x2={6} y1={H - fs * 0.95} y2={H - fs * 0.05} stroke={INK} strokeWidth={1.6} strokeDasharray="2 2" />
        <text x={14} y={H - fs * 0.3}>Starting value (the coloured square next to each name is its module)</text>
      </g>
    </svg>
  );
}

// ---- scenario comparison ---------------------------------------------------------------

// panels: [{ id, name, result, held: { conceptId: value } }]; baseline: the baseline result.
export function ScenarioComparisonFigure({ concepts, panels, baseline, mode = "change", fontSize = 12, title = "" }) {
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
  const panelW = 190, gap = 14;
  const headLines = panels.map((p, i) => wrapWords(`(${String.fromCharCode(97 + i)}) ${p.name}`, fs, panelW - 10));
  const headH = Math.max(...headLines.map((l) => l.length), 1) * fs * 1.2 + fs * 0.8;
  const top = (title ? fs * 2 : 0) + headH;
  const plotH = rowHs.reduce((a, b) => a + b, 0);
  const W = labelW + panels.length * (panelW + gap);
  const legendY = top + plotH + fs * 3.9;
  // legend items, wrapped onto as many lines as the width needs
  const legendItems = [...colors.entries()].map(([m, col]) => ({ m, col })).concat([{ m: "Held fixed by the scenario", col: null }]);
  { let lx = 10, ly = legendY; legendItems.forEach((it) => { const w = 22 + textW(it.m, fs * 0.85) + 18; if (lx + w > W - 6 && lx > 10) { lx = 10; ly += fs * 1.6; } it.x = lx; it.y = ly; lx += w; }); }
  const H = (legendItems.length ? legendItems[legendItems.length - 1].y : legendY) + fs * 1.4;
  const ys = []; rowHs.reduce((acc, h) => { ys.push(acc); return acc + h; }, top);
  const ticks = lim === 1 ? [-1, -0.5, 0, 0.5, 1] : [-lim, 0, lim];
  const tickLabel = (t) => (t === 0 ? "0" : Number.isInteger(t) ? String(t) : t.toFixed(1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }} fontFamily={FONT} role="img"
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
            {ticks.map((t) => <line key={t} x1={x(t)} x2={x(t)} y1={top} y2={top + plotH} stroke={t === 0 ? "#6b7280" : "#d1d5db"} strokeWidth={t === 0 ? 1.2 : 0.8} />)}
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
            {ticks.map((t) => <text key={t} x={x(t)} y={top + plotH + fs * 1.1} fontSize={fs * 0.78} textAnchor="middle" fill={MUTED}>{tickLabel(t)}</text>)}
          </g>
        );
      })}
      <text x={labelW + (W - labelW) / 2} y={top + plotH + fs * 2.5} fontSize={fs * 0.9} textAnchor="middle" fill={INK}>
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
  );
}
