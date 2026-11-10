// ============================================================================
// Transition Point Analysis: one panel per outcome
// ============================================================================
// A small-multiples figure that reads more easily than two overlaid charts.
// Each panel shows, for one outcome:
//   - top: the response curve (equilibrium outcome against intervention
//     intensity), with the part up to the transition point shaded;
//   - bottom: the marginal benefit of every step as bars, so the drop in
//     returns at the transition point is visible as the bars shrinking;
//   - a dashed line at the transition point, labelled with the intensity and
//     the share of the total effect already reached there.
// One SVG, so the figure export saves it like the other charts.

import React from "react";

const INK = "#111827";
const MUTED = "#4b5563";
const GRID = "#e5e7eb";
const TYPE_COLORS = {
  Early: "#0072b2", Middle: "#e69f00", Late: "#d55e00", Proportional: "#7a5195", Flat: "#9ca3af",
};

function Panel({ r, steps, x0, y0, w, h, fs }) {
  const color = TYPE_COLORS[r.responseType] || "#2456d6";
  const padL = 34, padR = 10, titleH = fs * 2.6;
  const curveH = (h - titleH) * 0.58, gap = fs * 0.9, barH = (h - titleH) * 0.3;
  const px = (v) => x0 + padL + v * (w - padL - padR);
  const cTop = y0 + titleH, cBot = cTop + curveH;
  const ys = r.y;
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-6) { lo -= 0.05; hi += 0.05; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const py = (v) => cBot - ((v - lo) / (hi - lo)) * curveH;
  const line = steps.map((s, i) => `${i ? "L" : "M"}${px(s).toFixed(1)},${py(ys[i]).toFixed(1)}`).join("");
  // shaded area under the curve up to the transition point
  const k = steps.findIndex((s) => s >= r.tp - 1e-9);
  const upTo = k < 0 ? steps.length - 1 : k;
  const area = `M${px(steps[0]).toFixed(1)},${cBot}` + steps.slice(0, upTo + 1).map((s, i) => `L${px(s).toFixed(1)},${py(ys[i]).toFixed(1)}`).join("") + `L${px(steps[upTo]).toFixed(1)},${cBot}Z`;

  const bTop = cBot + gap, bBot = bTop + barH;
  const mbMax = Math.max(1e-9, ...r.mb.map((m) => Math.abs(m)));
  const bw = (w - padL - padR) / Math.max(1, r.mb.length);
  const share = r.shareAtTp === null || r.shareAtTp === undefined ? null : Math.round(100 * r.shareAtTp);
  const tpX = px(r.tp);
  const tpLabel = `TP ${r.tp.toFixed(2)}${share !== null ? ` · ${share}% of effect` : ""}`;
  const labelRight = tpX > x0 + w * 0.6;

  return (
    <g>
      <rect x={x0} y={y0} width={w} height={h} rx={6} fill="#ffffff" stroke={GRID} />
      <text x={x0 + 10} y={y0 + fs * 1.2} fontSize={fs} fontWeight={700} fill={INK}>{r.outcomeName}</text>
      <text x={x0 + 10} y={y0 + fs * 2.25} fontSize={fs * 0.8} fill={color} fontWeight={600}>{r.responseType}
        <tspan fill={MUTED} fontWeight={400}>{`  ·  total effect ${r.effect >= 0 ? "+" : ""}${r.effect.toFixed(2)}`}</tspan>
      </text>
      {/* curve axes */}
      <line x1={px(0)} x2={px(1)} y1={cBot} y2={cBot} stroke={GRID} />
      <text x={px(0) - 4} y={py(hi - pad) + 3} fontSize={fs * 0.7} textAnchor="end" fill={MUTED}>{(hi - pad).toFixed(2)}</text>
      <text x={px(0) - 4} y={py(lo + pad) + 3} fontSize={fs * 0.7} textAnchor="end" fill={MUTED}>{(lo + pad).toFixed(2)}</text>
      <path d={area} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.2} />
      {/* marginal benefit bars */}
      <text x={px(0) - 4} y={bTop + fs * 0.6} fontSize={fs * 0.66} textAnchor="end" fill={MUTED}>MB</text>
      {r.mb.map((m, i) => {
        const hgt = (Math.abs(m) / mbMax) * barH;
        const before = steps[i] < r.tp - 1e-9;
        return <rect key={i} x={px(steps[i]) + bw * 0.12} y={bBot - hgt} width={bw * 0.76} height={hgt} fill={m < 0 ? "#dc2626" : color} opacity={before ? 0.85 : 0.35} />;
      })}
      <line x1={px(0)} x2={px(1)} y1={bBot} y2={bBot} stroke={GRID} />
      {[0, 0.5, 1].map((t) => <text key={t} x={px(t)} y={bBot + fs * 0.95} fontSize={fs * 0.7} textAnchor="middle" fill={MUTED}>{t === 0 ? "0" : t.toFixed(1)}</text>)}
      {/* transition point */}
      <line x1={tpX} x2={tpX} y1={cTop - 2} y2={bBot} stroke={INK} strokeWidth={1.4} strokeDasharray="4 3" />
      <text x={labelRight ? tpX - 4 : tpX + 4} y={cTop + fs * 0.75} fontSize={fs * 0.78} fontWeight={600} textAnchor={labelRight ? "end" : "start"} fill={INK} stroke="#ffffff" strokeWidth={3} style={{ paintOrder: "stroke" }}>{tpLabel}</text>
    </g>
  );
}

export default function TransitionSmallMultiples({ result, rows, fontSize = 12 }) {
  const fs = fontSize;
  const n = rows.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const w = 330, h = 230, gapX = 14, gapY = 14, legendH = fs * 3;
  const nRows = Math.ceil(n / cols);
  const W = cols * w + (cols - 1) * gapX;
  const H = nRows * h + (nRows - 1) * gapY + legendH;
  const steps = result.steps;
  const ly = nRows * h + (nRows - 1) * gapY + fs * 1.6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }} fontFamily="Inter, system-ui, sans-serif" role="img"
      aria-label="Response curve and marginal benefit of every outcome, one panel each, with the transition point marked">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {rows.map((r, i) => (
        <Panel key={r.outcomeId} r={r} steps={steps} x0={(i % cols) * (w + gapX)} y0={Math.floor(i / cols) * (h + gapY)} w={w} h={h} fs={fs} />
      ))}
      <g fontSize={fs * 0.82} fill={MUTED}>
        <rect x={0} y={ly - fs * 0.7} width={14} height={fs * 0.8} fill="#2456d6" opacity={0.14} />
        <text x={20} y={ly}>Shaded: the effect built up before the transition point (TP)</text>
        <rect x={W * 0.5} y={ly - fs * 0.75} width={6} height={fs * 0.85} fill="#2456d6" opacity={0.85} />
        <rect x={W * 0.5 + 8} y={ly - fs * 0.45} width={6} height={fs * 0.55} fill="#2456d6" opacity={0.35} />
        <text x={W * 0.5 + 20} y={ly}>Bars: marginal benefit (MB) of each step; faded after the TP</text>
      </g>
    </svg>
  );
}
