// ============================================================================
// Transition Pathways: the metro map
// ============================================================================
// Draws the rows from pathwayMetroLayout.js as one SVG, so the figure export
// (exportFigure) can save it like the other charts. Left: the route names.
// Middle: each route along the cumulative intervention intensity. Every
// intervention (lever) has its own colour, like a metro line; a route of one
// intervention is a solid line, a combined pathway a dashed line in the
// colour of each stage's lever. Open circles are transition points (the next
// lever is added there), a filled circle ends a route, a bar ends a route past
// a tipping point (an outcome worse than Business-as-Usual), and vertical
// transfer lines join a route to the routes that continue it. Right: the
// scorecard (total outcome gain and each outcome's end state, names in full).

import React from "react";
import { metroTicks } from "./pathwayMetroLayout.js";

// One colour per lever, in the order the levers were chosen (colour-blind
// safe first, then further distinct hues).
export const METRO_LEVER_COLORS = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#d55e00", "#56b4e9", "#7a5195", "#8c6d1f", "#2f4b7c", "#c0392b"];
const INK = "#111827";
const MUTED = "#374151";

const signed = (v) => (v > 0 ? "+" : v < 0 ? "-" : "") + Math.abs(v).toFixed(2);

// The width of a text in the figure's font, measured with a canvas (the SVG
// must size itself before it renders); a rough estimate where there is no canvas.
let measureCtx = null;
const textW = (s, px, bold = false) => {
  try {
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = `${bold ? 700 : 400} ${px}px Inter, system-ui, sans-serif`;
    return measureCtx.measureText(String(s)).width;
  } catch { return String(s).length * px * 0.58; }
};

// Greedy word wrap: breaks `text` at `sep` into lines no wider than maxW.
function wrap(text, px, maxW, sep = " ", bold = false) {
  const parts = String(text).split(sep);
  const lines = [];
  parts.forEach((part, i) => {
    const piece = sep === " + " && i > 0 ? `+ ${part}` : part;
    const last = lines[lines.length - 1];
    if (last !== undefined && textW(`${last} ${piece}`, px, bold) <= maxW) lines[lines.length - 1] = `${last} ${piece}`;
    else lines.push(piece);
  });
  return lines;
}

export function routeLabel(c, nameOf) {
  return c.stages.map((s, i) => {
    const n = nameOf(s.leverId);
    const name = i === 0 ? n : n.charAt(0).toLowerCase() + n.slice(1);
    return s.scaleUp ? `${name} (raised)` : name;
  }).join(" + ");
}

export default function PathwayMetroMap({ rows, outcomes, levers, nameOf, selectedId, bestId, onSelect, fontSize = 13 }) {
  const fs = fontSize;
  const colorOf = (leverId) => METRO_LEVER_COLORS[Math.max(0, levers.findIndex((l) => l.id === leverId)) % METRO_LEVER_COLORS.length];

  // Route names up to 430 px wide sit on one line; longer ones wrap at a " + ".
  const labels = rows.map((r) => routeLabel(r.c, nameOf));
  const maxLabel = 430;
  const wrapped = labels.map((l) => (textW(l, fs, true) <= maxLabel ? [l] : wrap(l, fs, maxLabel, " + ", true)));
  const rowHs = wrapped.map((w) => Math.round(fs * (2.3 + 1.2 * (w.length - 1))));
  const labelW = Math.max(140, ...wrapped.flat().map((l) => textW(l, fs, true))) + 24;

  // Scorecard columns, headed by the outcome names in full (wrapped by word),
  // with "lower is better" under the outcomes where that is the improvement.
  const headPx = fs * 0.92;
  const heads = [{ lines: ["Total outcome gain"], note: "TOG" }, ...outcomes.map((o) => ({ lines: wrap(nameOf(o.id), headPx, 112, " ", true), note: o.d < 0 ? "lower is better" : "" }))];
  heads.forEach((h) => { h.lines = h.lines.flatMap((l) => (textW(l, headPx, true) > 112 ? wrap(l, headPx, 112, "-", true) : [l])); });
  const colWs = heads.map((h) => Math.max(fs * 4.2, ...h.lines.map((l) => textW(l, headPx, true)), h.note ? textW(h.note, headPx * 0.88) : 0) + 14);
  const headLines = Math.max(...heads.map((h) => h.lines.length + (h.note ? 1 : 0)));
  const headH = headLines * headPx * 1.2 + 8;

  const left = 8, plotX = left + labelW, plotW = 460, plotEnd = plotX + plotW;
  const scoreX = plotEnd + 36;
  const colX = []; colWs.reduce((acc, w) => { colX.push(acc); return acc + w; }, scoreX);
  const scoreEnd = scoreX + colWs.reduce((a, b) => a + b, 0);
  const W = Math.max(scoreEnd + 8, plotX + 560);
  const top = headH + 10;
  const plotH = rowHs.reduce((a, b) => a + b, 0);
  const axisY = top + plotH + 6;

  // Legend: one swatch per lever on the map, then the line styles and markers.
  const shownLevers = levers.filter((l) => rows.some((r) => r.segments.some((g) => g.leverId === l.id)));
  const lw = Math.max(5, fs * 0.6), dotR = fs * 0.5;
  const legendPx = fs * 0.92;
  const items = [
    ...shownLevers.map((l) => ({ kind: "lever", color: colorOf(l.id), text: nameOf(l.id) })),
    { kind: "solid", text: "One intervention" },
    { kind: "dashed", text: "Combined pathway (each stage in its lever's colour)" },
    { kind: "transfer", text: "Transition point: next lever added" },
    { kind: "end", text: "End of pathway" },
    { kind: "tipping", text: "Tipping point: an outcome ends worse than Business-as-Usual" },
  ];
  const legendTop = axisY + fs * 3.4;
  const legendLineH = legendPx * 1.9;
  const placed = [];
  let lx = left, ly = legendTop;
  items.forEach((it) => {
    const w = 34 + textW(it.text, legendPx) + 22;
    if (lx + w > W - 8 && lx > left) { lx = left; ly += legendLineH; }
    placed.push({ ...it, x: lx, y: ly });
    lx += w;
  });
  const footY = ly + legendLineH + fs * 0.4;
  const H = footY + fs * 0.9;

  const maxX = Math.max(0.05, ...rows.map((r) => r.end));
  const { ticks, end } = metroTicks(maxX);
  const x = (v) => plotX + (v / end) * (plotW - 40);
  const yOf = new Map();
  rows.reduce((acc, r, i) => { yOf.set(r.c.id, acc + rowHs[i] / 2); return acc + rowHs[i]; }, top);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: "auto", display: "block" }} fontFamily="Inter, system-ui, sans-serif" role="img"
      aria-label="Metro map of the transition pathways: each route along cumulative intervention intensity, coloured by intervention, with its transition points and scorecard">
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {/* grid */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + plotH} stroke="#e5e7eb" strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={x(t)} y={axisY + fs} fontSize={fs * 0.9} textAnchor="middle" fill={MUTED}>{t === 0 ? "0" : t.toFixed(2)}</text>
        </g>
      ))}
      <text x={(plotX + plotEnd - 40) / 2} y={axisY + fs * 2.4} fontSize={fs} textAnchor="middle" fill={MUTED}>Cumulative intervention intensity (CII)</text>

      {/* scorecard header: names in full */}
      {heads.map((h, i) => {
        const cx = colX[i] + colWs[i] / 2;
        const n = h.lines.length + (h.note ? 1 : 0);
        const y0 = top - 10 - (n - 1) * headPx * 1.2;
        return (
          <text key={i} x={cx} y={y0} fontSize={headPx} textAnchor="middle" fill={INK}>
            {h.lines.map((l, k) => <tspan key={k} x={cx} dy={k === 0 ? 0 : headPx * 1.2} fontWeight={700}>{l}</tspan>)}
            {h.note && <tspan x={cx} dy={headPx * 1.2} fontSize={headPx * 0.88} fill={MUTED} fontStyle={i === 0 ? "normal" : "italic"}>{h.note}</tspan>}
          </text>
        );
      })}

      {/* transfer lines: from the route that is continued to the one that continues it */}
      {rows.filter((r) => r.parentId !== null).map((r) => {
        const p = rows.find((q) => q.c.id === r.parentId);
        return <line key={`t${r.c.id}`} x1={x(p.end)} x2={x(p.end)} y1={yOf.get(p.c.id)} y2={yOf.get(r.c.id)} stroke="#6b7280" strokeWidth={1.6} />;
      })}

      {rows.map((r, i) => {
        const y = yOf.get(r.c.id);
        const bold = r.c.id === selectedId || r.c.id === bestId;
        const last = r.c.stages[r.c.stages.length - 1];
        const endColor = colorOf(last.leverId);
        const dashed = r.depth > 1;
        return (
          <g key={r.c.id} onClick={() => onSelect?.(r.c.id)} style={{ cursor: onSelect ? "pointer" : undefined }}>
            <title>{`${labels[i]}\nTOG ${r.c.tog.toFixed(2)}, CII ${r.c.cii.toFixed(2)}${r.endKind === "tipping" ? "\nTipping point: at least one outcome ends worse than Business-as-Usual" : ""}`}</title>
            {r.c.id === selectedId && <rect x={left - 4} y={y - rowHs[i] / 2 + 2} width={W - left} height={rowHs[i] - 4} rx={4} fill="#eef2ff" />}
            <text x={left} y={y + fs * 0.35 - ((wrapped[i].length - 1) * fs * 1.2) / 2} fontSize={fs} fontWeight={bold ? 700 : 400} fill={INK}>
              {wrapped[i].map((l, k) => <tspan key={k} x={left} dy={k === 0 ? 0 : fs * 1.2}>{l}</tspan>)}
            </text>
            {r.segments.map((g, k) => (
              <line key={k} x1={x(g.from)} x2={x(g.to)} y1={y} y2={y} stroke={colorOf(g.leverId)} strokeWidth={lw} strokeLinecap="butt" strokeDasharray={dashed ? `${lw * 1.6} ${lw * 0.9}` : undefined} />
            ))}
            {r.endKind === "tipping"
              ? <rect x={x(r.end) - 2.5} y={y - fs * 0.75} width={5} height={fs * 1.5} fill={endColor} />
              : <circle cx={x(r.end)} cy={y} r={dotR} fill={endColor} />}
            {r.transfers.filter((t) => t >= r.start - 1e-9).map((t, k) => <circle key={k} cx={x(t)} cy={y} r={dotR} fill="#ffffff" stroke={INK} strokeWidth={2} />)}
            <text x={x(r.end) + dotR + 6} y={y + fs * 0.32} fontSize={fs * 0.88} fill={MUTED}>{r.end.toFixed(2)}</text>
            <text x={colX[0] + colWs[0] / 2} y={y + fs * 0.35} fontSize={fs} fontWeight={bold ? 700 : 400} textAnchor="middle" fill={INK}>{r.c.tog.toFixed(2)}</text>
            {outcomes.map((o, k) => {
              const v = last.outcomes.find((q) => q.id === o.id)?.value ?? 0;
              return <text key={o.id} x={colX[k + 1] + colWs[k + 1] / 2} y={y + fs * 0.35} fontSize={fs} fontWeight={bold ? 700 : 400} textAnchor="middle" fill={INK}>{signed(v)}</text>;
            })}
          </g>
        );
      })}

      {/* legend */}
      <g fontSize={legendPx} fill={INK}>
        {placed.map((it, i) => {
          const sy = it.y - legendPx * 0.32;
          return (
            <g key={i}>
              {it.kind === "lever" && <line x1={it.x} x2={it.x + 26} y1={sy} y2={sy} stroke={it.color} strokeWidth={lw} />}
              {it.kind === "solid" && <line x1={it.x} x2={it.x + 26} y1={sy} y2={sy} stroke="#6b7280" strokeWidth={lw} />}
              {it.kind === "dashed" && <line x1={it.x} x2={it.x + 26} y1={sy} y2={sy} stroke="#6b7280" strokeWidth={lw} strokeDasharray={`${lw * 1.6} ${lw * 0.9}`} />}
              {it.kind === "transfer" && <circle cx={it.x + 13} cy={sy} r={dotR} fill="#fff" stroke={INK} strokeWidth={2} />}
              {it.kind === "end" && <circle cx={it.x + 13} cy={sy} r={dotR} fill="#555" />}
              {it.kind === "tipping" && <rect x={it.x + 10.5} y={sy - fs * 0.75} width={5} height={fs * 1.5} fill="#555" />}
              <text x={it.x + 34} y={it.y}>{it.text}</text>
            </g>
          );
        })}
      </g>
      <text x={left} y={footY} fontSize={fs * 0.85} fill={MUTED}>TOG: total outcome gain against Business-as-Usual. Outcomes: end state of the pathway, on the -1 to +1 scale.</text>
    </svg>
  );
}
