import React, { useEffect, useRef, useState } from "react";

// Scenario comparison in small multiples: one panel per scenario, one row per
// concept (shared labels on the left), and a horizontal bar per cell for the
// change in steady-state activation relative to the baseline, on one shared
// scale. Bars are coloured by module; a concept the scenario holds fixed (a
// driver) is drawn hatched at its held value. Drawn as a single <svg> in pixel
// coordinates so the figure export (PNG, SVG, PDF) can clone it.

const FONT = "Inter, system-ui, sans-serif";
const INK = "#0f172a", MUTED = "#64748b", GRID = "#e2e8f0";
const charW = (fs) => fs * 0.55;

function useBoxWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function wrap(text, px, fs, maxLines = 3) {
  const n = Math.max(4, Math.floor(px / charW(fs)));
  const lines = [];
  let cur = "";
  String(text).split(/\s+/).forEach((w) => {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= n) cur += " " + w;
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = last.length > n - 1 ? `${last.slice(0, n - 1)}…` : `${last}…`;
    return kept;
  }
  return lines;
}

// Rounded symmetric axis limit that covers every value (at least 1).
function axisLimit(values) {
  const m = Math.max(1, ...values.map((v) => Math.abs(v)));
  return Math.ceil(m * 2 - 1e-9) / 2;
}

export default function ScenarioComparisonFigure({
  rows, panels, moduleColor, fig, mode = "delta", containerRef, height,
}) {
  const ownRef = useRef(null);
  const ref = containerRef || ownRef;
  const W = useBoxWidth(ref);
  const fs = fig.tickFontSize;
  const titleFs = Math.max(fs + 1, fig.axisFontSize);
  const legFs = fig.legendFontSize;

  let body = null;
  let H = height || 200;
  if (W > 60 && rows.length && panels.length) {
    // Values: change against the baseline, or the steady state itself.
    const all = panels.flatMap((p) => rows.map((r) => p.cells[r.id]?.value ?? 0));
    const lim = mode === "delta" ? axisLimit(all) : Math.max(1, axisLimit(all));
    const ticks = [-lim, -lim / 2, 0, lim / 2, lim];

    const labelW = Math.min(240, Math.max(130, W * 0.22));
    const swatch = 8;
    const gap = 14;
    const panelW = (W - labelW - swatch - 10 - gap * (panels.length - 1)) / panels.length;
    const headerLines = panels.map((p, i) => wrap(`(${String.fromCharCode(97 + i)}) ${p.name}`, panelW - 6, titleFs, 2));
    const headerH = Math.max(...headerLines.map((l) => l.length)) * (titleFs + 3) + 8;
    const titleH = fig.title ? fig.titleFontSize + 12 : 0;
    const rowLines = rows.map((r) => wrap(r.name, labelW - 6, fs, 3));
    const rowH = Math.max(24, Math.max(...rowLines.map((l) => l.length)) * (fs + 2) + 10);
    const top = titleH + headerH;
    const plotH = rowH * rows.length;
    const axisH = fs + 8 + fig.axisFontSize + 12;

    // Legend: modules, then the hatched driver swatch.
    const mods = [...new Set(rows.map((r) => r.module))];
    const items = [...mods.map((m) => ({ kind: "mod", label: m, color: moduleColor(m) })), { kind: "drv", label: "Driver (held fixed by the scenario)" }];
    let lx = 0, ly = 0;
    const placed = items.map((it) => {
      const w = 18 + it.label.length * charW(legFs) + 18;
      if (lx > 0 && lx + w > W - 8) { lx = 0; ly += legFs + 10; }
      const pl = { ...it, x: lx, y: ly };
      lx += w;
      return pl;
    });
    const legH = fig.legendPosition === "hidden" ? 0 : ly + legFs + 12;
    H = top + plotH + axisH + legH + 6;
    const x0 = labelW + swatch + 10;

    body = (
      <>
        <defs>
          <pattern id="scn-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#ffffff" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#1f2937" strokeWidth="1.4" />
          </pattern>
        </defs>
        {fig.title && <text x={W / 2} y={fig.titleFontSize} textAnchor="middle" fontSize={fig.titleFontSize} fontWeight={700} fill={INK}>{fig.title}</text>}

        {/* Row bands and labels */}
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const lines = rowLines[i];
          return (
            <g key={r.id}>
              {i % 2 === 0 && <rect x={0} y={y} width={W} height={rowH} fill="#f1f5f9" />}
              <text x={labelW} y={y + rowH / 2 - ((lines.length - 1) * (fs + 2)) / 2 + fs * 0.35} textAnchor="end" fontSize={fs} fill={INK}>
                {lines.map((l, k) => <tspan key={k} x={labelW} dy={k === 0 ? 0 : fs + 2}>{l}</tspan>)}
              </text>
              <rect x={labelW + 6} y={y + rowH / 2 - swatch / 2} width={swatch} height={swatch} fill={moduleColor(r.module)} />
            </g>
          );
        })}

        {/* Panels */}
        {panels.map((p, pi) => {
          const px = x0 + pi * (panelW + gap);
          const sx = (v) => px + ((v + lim) / (2 * lim)) * panelW;
          return (
            <g key={p.id}>
              <text x={px + panelW / 2} y={titleH + titleFs} textAnchor="middle" fontSize={titleFs} fontWeight={700} fill={INK}>
                {headerLines[pi].map((l, k) => <tspan key={k} x={px + panelW / 2} dy={k === 0 ? 0 : titleFs + 3}>{l}</tspan>)}
              </text>
              {fig.showGridlines && ticks.map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={top} y2={top + plotH} stroke={GRID} strokeDasharray="2 3" />)}
              <line x1={sx(0)} x2={sx(0)} y1={top} y2={top + plotH} stroke="#334155" strokeWidth={1} />
              <rect x={px} y={top} width={panelW} height={plotH} fill="none" stroke="#cbd5e1" />
              {rows.map((r, i) => {
                const cell = p.cells[r.id];
                if (!cell) return null;
                const v = cell.value ?? 0;
                const y = top + i * rowH;
                const bh = Math.min(16, rowH * 0.56);
                const xa = sx(Math.min(0, v)), xb = sx(Math.max(0, v));
                const label = `${v > 0 ? "+" : ""}${Math.abs(v) < 0.005 ? "0" : v.toFixed(2)}`;
                const right = v >= 0;
                const inside = (xb - xa) > label.length * charW(fs) + 8;
                const tx = right ? (inside ? xb - 4 : xb + 4) : (inside ? xa + 4 : xa - 4);
                const anchor = right ? (inside ? "end" : "start") : (inside ? "start" : "end");
                return (
                  <g key={r.id}>
                    <title>{`${p.name}, ${r.name}: ${cell.driver ? `held at ${v.toFixed(2)} (driver)` : `${label}${mode === "delta" ? " against the baseline" : ""}`}`}</title>
                    <rect x={xa} y={y + (rowH - bh) / 2} width={Math.max(1, xb - xa)} height={bh}
                      fill={cell.driver ? "url(#scn-hatch)" : moduleColor(r.module)} stroke={cell.driver ? "#1f2937" : "none"} strokeWidth={0.8} fillOpacity={fig.opacity} />
                    <text x={tx} y={y + rowH / 2 + fs * 0.35} textAnchor={anchor} fontSize={fs} fill={inside && !cell.driver ? "#ffffff" : INK} fontWeight={cell.driver ? 600 : 400}>{label}</text>
                  </g>
                );
              })}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={sx(t)} x2={sx(t)} y1={top + plotH} y2={top + plotH + 4} stroke={MUTED} />
                  <text x={sx(t)} y={top + plotH + 6 + fs} textAnchor="middle" fontSize={fs} fill={MUTED}>{Number.isInteger(t) ? t : t.toFixed(1)}</text>
                </g>
              ))}
            </g>
          );
        })}
        <text x={x0 + (W - x0) / 2} y={top + plotH + fs + 8 + fig.axisFontSize + 6} textAnchor="middle" fontSize={fig.axisFontSize} fill={INK}>
          {fig.xLabel || (mode === "delta" ? "Change in steady state relative to the baseline" : "Steady-state activation (-1 to +1)")}
        </text>

        {fig.legendPosition !== "hidden" && (
          <g transform={`translate(${x0 > W / 2 ? 4 : x0}, ${top + plotH + axisH + 4})`}>
            {placed.map((it, k) => (
              <g key={k} transform={`translate(${it.x}, ${it.y})`}>
                <rect x={0} y={0} width={14} height={legFs} fill={it.kind === "drv" ? "url(#scn-hatch)" : it.color} stroke={it.kind === "drv" ? "#1f2937" : "none"} strokeWidth={0.8} />
                <text x={19} y={legFs * 0.85} fontSize={legFs} fill={INK}>{it.label}</text>
              </g>
            ))}
          </g>
        )}
      </>
    );
  }

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} style={{ display: "block", fontFamily: FONT }} fontFamily={FONT}>
          {body}
        </svg>
      )}
    </div>
  );
}
