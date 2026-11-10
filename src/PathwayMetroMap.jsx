import React, { useEffect, useRef, useState } from "react";
import { niceTicks } from "./pathwayMetroLayout.js";

// Metro map of transition pathways, drawn as a single <svg> in pixel
// coordinates so the figure export (PNG, SVG, PDF) can clone it as it does
// a Recharts chart.

const FONT = "Inter, system-ui, sans-serif";
const INK = "#0f172a", MUTED = "#64748b", GRID = "#e2e8f0", TIP = "#dc2626";

const charW = (fontSize) => fontSize * 0.56;
const fit = (text, px, fontSize) => {
  const n = Math.max(1, Math.floor(px / charW(fontSize)));
  return text.length <= n ? text : `${text.slice(0, Math.max(1, n - 1))}…`;
};

function useBoxSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Lays the legend out in lines that fit the width. Returns the items with
// positions and the height the legend needs.
function legendLayout(items, width, fontSize) {
  const gap = 14, sw = 22, rowH = fontSize + 8;
  let x = 0, y = 0;
  const placed = items.map((it) => {
    const w = sw + 5 + it.label.length * charW(fontSize);
    if (x > 0 && x + w > width) { x = 0; y += rowH; }
    const p = { ...it, x, y };
    x += w + gap;
    return p;
  });
  return { placed, height: items.length ? y + rowH : 0 };
}

export default function PathwayMetroMap({
  rows, leverIds, outcomes, nameOf, fig, colors, colourBy = "lever",
  selectedId = null, onSelect, eps = 1e-6, containerRef, style, className,
}) {
  const ownRef = useRef(null);
  const ref = containerRef || ownRef;
  const { width: W, height: H } = useBoxSize(ref);

  const colorOf = (leverId) => colors[Math.max(0, leverIds.indexOf(leverId)) % colors.length];
  const tick = fig.tickFontSize, axisFs = fig.axisFontSize, legFs = fig.legendFontSize;
  const lw = Math.max(1.5, fig.lineWidth * 2);
  const r = Math.max(3, fig.markerSize + 1.5);

  let body = null;
  if (W > 40 && H > 40 && rows.length) {
    // Legend: one line colour per lever used, then the symbols.
    const used = leverIds.filter((id) => rows.some((rw) => rw.pathway.stages.some((s) => s.leverId === id)));
    const legendItems = [
      ...used.map((id) => ({ kind: "line", color: colorOf(id), label: colourBy === "opening" ? `Opens with ${nameOf(id)}` : nameOf(id) })),
      { kind: "station", label: "Transfer station: next lever added" },
      { kind: "end", label: "End of pathway" },
      { kind: "tip", label: "Tipping point: an outcome falls below Business-as-Usual" },
    ].filter((it) => colourBy !== "opening" || it.kind !== "line" || rows.some((rw) => colorOf(rw.pathway.stages[0].leverId) === it.color));
    const showLegend = fig.legendPosition !== "hidden";
    const leg = showLegend ? legendLayout(legendItems, W - 8, legFs) : { placed: [], height: 0 };
    const legendTop = fig.legendPosition === "top";
    const titleH = fig.title ? fig.titleFontSize + 10 : 0;

    // Columns: labels on the left, the map in the middle, and on the right the
    // total outcome gain and every outcome's end state against Business-as-Usual.
    const labelW = Math.min(Math.max(120, W * 0.3), 260);
    const colW = Math.max(38, Math.min(62, (W * 0.3) / (outcomes.length + 1)));
    const colsW = colW * (outcomes.length + 1);
    const headerH = tick + 14;
    const axisH = tick + axisFs + 22;
    const top = titleH + (legendTop ? leg.height + 6 : 0) + headerH;
    const bottom = H - axisH - (!legendTop && showLegend ? leg.height + 8 : 0);
    const x0 = labelW + 12, x1 = W - colsW - 18;
    const rowH = Math.max(8, (bottom - top) / rows.length);
    const maxCii = Math.max(...rows.map((rw) => rw.end), 1e-9);
    const ticks = niceTicks(maxCii);
    const xMax = ticks[ticks.length - 1];
    const sx = (v) => x0 + ((x1 - x0) * v) / xMax;
    const yOf = (i) => top + (i + 0.5) * rowH;
    const maxAbs = Math.max(eps, ...rows.flatMap((rw) => outcomes.map((o) => Math.abs(rw.outcomes[o.id] ?? 0))));
    const maxTog = Math.max(eps, ...rows.map((rw) => Math.abs(rw.tog)));
    const rowColor = (rw, seg) => colorOf(colourBy === "opening" ? rw.pathway.stages[0].leverId : seg.leverId);
    const cellFill = (v, scale) => {
      if (!(Math.abs(v) > eps)) return "#f1f5f9";
      const a = 0.15 + 0.6 * Math.min(1, Math.abs(v) / scale);
      return v > 0 ? `rgba(22,163,74,${a.toFixed(3)})` : `rgba(220,38,38,${a.toFixed(3)})`;
    };
    const lfs = Math.min(tick, Math.max(7, rowH * 0.55));

    body = (
      <>
        {fig.title && <text x={W / 2} y={fig.titleFontSize} textAnchor="middle" fontSize={fig.titleFontSize} fontWeight={600} fill={INK}>{fig.title}</text>}

        {/* Column headers */}
        <text x={labelW} y={top - 6} textAnchor="end" fontSize={tick} fontWeight={600} fill={MUTED}>Pathway</text>
        <text x={x1 + 18 + colW / 2} y={top - 6} textAnchor="middle" fontSize={tick} fontWeight={600} fill={INK}><title>Total outcome gain</title>TOG</text>
        {outcomes.map((o, j) => (
          <text key={o.id} x={x1 + 18 + colW * (j + 1.5)} y={top - 6} textAnchor="middle" fontSize={tick} fontWeight={600} fill={INK}>
            <title>{`${nameOf(o.id)}: change at the end of the pathway against Business-as-Usual (${o.d === -1 ? "lower" : "higher"} is better; positive is an improvement)`}</title>
            {fit(nameOf(o.id), colW - 4, tick)}
          </text>
        ))}

        {/* Grid and axis */}
        {ticks.map((t) => (
          <g key={t}>
            {fig.showGridlines && <line x1={sx(t)} x2={sx(t)} y1={top} y2={bottom} stroke={GRID} strokeDasharray="3 3" />}
            <line x1={sx(t)} x2={sx(t)} y1={bottom} y2={bottom + 4} stroke={MUTED} />
            <text x={sx(t)} y={bottom + 6 + tick} textAnchor="middle" fontSize={tick} fill={MUTED}>{t.toFixed(Math.min(fig.decimals, 2))}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={bottom} y2={bottom} stroke={MUTED} />
        <line x1={x0} x2={x0} y1={top} y2={bottom} stroke="#94a3b8" strokeWidth={1.5} />
        <text x={x0} y={top - 6} textAnchor="middle" fontSize={tick} fontWeight={600} fill={MUTED}><title>Business-as-Usual: every pathway starts here</title>BAU</text>
        <text x={(x0 + x1) / 2} y={bottom + tick + axisFs + 14} textAnchor="middle" fontSize={axisFs} fill={INK}>{fig.xLabel || "Cumulative intervention intensity (effort)"}</text>

        {/* Rows, in layers: backgrounds, labels and cells; transfer lines;
            pathway lines; stations; and on top a transparent hit area per row. */}
        {rows.map((rw, i) => {
          const y = yOf(i);
          const p = rw.pathway;
          const isSel = rw.id === selectedId;
          // A branching row names only the stages after the shared part, after
          // an arrow; the shared part is on the row it branches from.
          const names = p.stages.map((s) => `${nameOf(s.leverId)}${s.scaleUp ? " (raised)" : ""}`);
          const own = names.slice(rw.shared).join(" › ");
          const prefix = rw.shared > 0 ? "↳ " : "";
          const shown = fit(prefix + (own || "(same stages)"), labelW - 4, lfs);
          return (
            <g key={`bg-${rw.id}`}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill={isSel ? "#e0e7ff" : i % 2 ? "#f8fafc" : "#ffffff"} />
              <text x={labelW} y={y + lfs * 0.35} textAnchor="end" fontSize={lfs} fill={INK} fontWeight={isSel ? 600 : 400}>
                {prefix && <tspan fill="#94a3b8">{prefix}</tspan>}
                <tspan>{shown.slice(prefix.length)}</tspan>
              </text>
              <rect x={x1 + 18 + 1} y={y - rowH / 2 + 1} width={colW - 2} height={rowH - 2} fill={`rgba(36,86,214,${(0.12 + 0.5 * Math.min(1, Math.abs(p.tog) / maxTog)).toFixed(3)})`} />
              <text x={x1 + 18 + colW / 2} y={y + lfs * 0.35} textAnchor="middle" fontSize={lfs} fill={INK}>{p.tog.toFixed(2)}</text>
              {outcomes.map((o, j) => {
                const v = rw.outcomes[o.id] ?? 0;
                return (
                  <g key={o.id}>
                    <rect x={x1 + 18 + colW * (j + 1) + 1} y={y - rowH / 2 + 1} width={colW - 2} height={rowH - 2} fill={cellFill(v, maxAbs)} />
                    <text x={x1 + 18 + colW * (j + 1.5)} y={y + lfs * 0.35} textAnchor="middle" fontSize={lfs} fill={INK}>{Math.abs(v) > eps ? `${v > 0 ? "+" : ""}${v.toFixed(2)}` : "0"}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
        {rows.map((rw, i) => rw.parent !== null && (
          <line key={`tr-${rw.id}`} x1={sx(rw.branchX)} x2={sx(rw.branchX)} y1={yOf(rw.parent)} y2={yOf(i)}
            stroke={rw.segments[0] ? rowColor(rw, rw.segments[0]) : "#94a3b8"} strokeWidth={Math.max(1.2, lw * 0.55)} />
        ))}
        {rows.map((rw, i) => {
          const y = yOf(i);
          return (
            <g key={`ln-${rw.id}`}>
              {rw.segments.map((seg) => (
                <line key={seg.stage} x1={sx(seg.x0)} x2={sx(seg.x1)} y1={y} y2={y} stroke={rowColor(rw, seg)} strokeWidth={lw} strokeLinecap="round"
                  strokeDasharray={seg.afterTipping ? `${lw * 1.5} ${lw * 1.2}` : undefined} strokeOpacity={fig.opacity} />
              ))}
              {rw.tipping && (
                <line x1={sx(rw.tipping.x)} x2={sx(rw.tipping.x)} y1={y - Math.min(rowH * 0.42, 9)} y2={y + Math.min(rowH * 0.42, 9)} stroke={TIP} strokeWidth={Math.max(2.5, lw * 0.8)} />
              )}
            </g>
          );
        })}
        {rows.map((rw, i) => {
          const y = yOf(i);
          const endIsTip = rw.tipping && Math.abs(rw.tipping.x - rw.end) < 1e-9;
          return (
            <g key={`st-${rw.id}`}>
              {rw.stations.map((st) => (
                <circle key={st.stage} cx={sx(st.x)} cy={y} r={r} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
              ))}
              {!endIsTip && <circle cx={sx(rw.end)} cy={y} r={r} fill={rw.pathway.converged ? INK : "#ffffff"} stroke={INK} strokeWidth={1.4} />}
            </g>
          );
        })}
        {rows.map((rw, i) => {
          const p = rw.pathway;
          const label = p.stages.map((s) => `${nameOf(s.leverId)}${s.scaleUp ? " (raised)" : ""}`).join(" > ");
          const tipNote = rw.tipping || rw.tippingInherited ? ` Tipping point: ${(rw.tipping ? rw.tipping.outcomeIds : []).map(nameOf).join(", ") || "an outcome"} below Business-as-Usual.` : "";
          return (
            <rect key={`hit-${rw.id}`} x={0} y={yOf(i) - rowH / 2} width={W} height={rowH} fill="#ffffff" fillOpacity={0}
              onClick={() => onSelect?.(rw.id)} style={{ cursor: onSelect ? "pointer" : undefined }}>
              <title>{`${label}\nTOG ${p.tog.toFixed(2)}, CII ${p.cii.toFixed(2)}.${tipNote}`}</title>
            </rect>
          );
        })}

        {/* Legend */}
        {showLegend && (
          <g transform={`translate(4, ${legendTop ? titleH : H - leg.height})`}>
            {leg.placed.map((it, k) => {
              const cy = it.y + legFs * 0.6;
              return (
                <g key={k} transform={`translate(${it.x}, 0)`}>
                  {it.kind === "line" && <line x1={0} x2={22} y1={cy} y2={cy} stroke={it.color} strokeWidth={lw} strokeLinecap="round" />}
                  {it.kind === "station" && <><line x1={0} x2={22} y1={cy} y2={cy} stroke="#94a3b8" strokeWidth={lw} /><circle cx={11} cy={cy} r={r} fill="#ffffff" stroke={INK} strokeWidth={1.4} /></>}
                  {it.kind === "end" && <><line x1={0} x2={11} y1={cy} y2={cy} stroke="#94a3b8" strokeWidth={lw} /><circle cx={11} cy={cy} r={r} fill={INK} /></>}
                  {it.kind === "tip" && <><line x1={0} x2={11} y1={cy} y2={cy} stroke="#94a3b8" strokeWidth={lw} /><line x1={11} x2={22} y1={cy} y2={cy} stroke="#94a3b8" strokeWidth={lw} strokeDasharray={`${lw * 1.5} ${lw * 1.2}`} /><line x1={11} x2={11} y1={cy - 6} y2={cy + 6} stroke={TIP} strokeWidth={2.5} /></>}
                  <text x={27} y={cy + legFs * 0.35} fontSize={legFs} fill={INK}>{it.label}</text>
                </g>
              );
            })}
          </g>
        )}
      </>
    );
  }

  return (
    <div ref={ref} className={className} style={style}>
      {W > 0 && H > 0 && (
        <svg width={W} height={H} style={{ display: "block", fontFamily: FONT }} fontFamily={FONT}>
          {body}
        </svg>
      )}
    </div>
  );
}
