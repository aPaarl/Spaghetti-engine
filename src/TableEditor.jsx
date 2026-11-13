// The table editor: every results table in the app can be edited and
// exported from one place. Hovering a table shows an "Edit & export"
// button; it opens a dialog that reads the table as it is on screen, lets
// the reader choose, rename and reorder columns, sort, round numbers, edit
// any cell and pick a style, and then exports the result as CSV, Excel, a
// PNG image, or a table copied for Word.
//
// The editor works on the rendered table (its header and cell text), so it
// needs nothing from the tab that drew it and covers every table at once.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Table2, X, ChevronUp, ChevronDown, Download, Copy, RotateCcw, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import { toBlob as domNodeToPngBlob } from "html-to-image";

const loadExcelJS = async () => (await import("exceljs")).default;

// ---- reading a table from the page ------------------------------------------------

const clean = (t) => String(t || "").replace(/[↕↑↓]/g, "").replace(/\s+/g, " ").trim();

// The text of a cell, with a space at every element boundary (innerText runs "Phosphorus" and a "bottleneck" badge together).
// An element can give its own export text with data-export-text, and
// aria-hidden parts (bars, icons) are skipped.
function cellText(el) {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) { parts.push(node.nodeValue); return; }
    if (node.nodeType !== 1 || node.getAttribute("aria-hidden") === "true") return;
    if (node.hasAttribute("data-export-text")) { parts.push(" ", node.getAttribute("data-export-text"), " "); return; }
    parts.push(" "); node.childNodes.forEach(walk); parts.push(" ");
  };
  walk(el);
  return clean(parts.join(""));
}

export function readTable(table) {
  const headRows = table.tHead ? [...table.tHead.rows] : [];
  let header = headRows.length ? [...headRows[headRows.length - 1].cells].map(cellText) : [];
  let bodyRows = [];
  (table.tBodies.length ? [...table.tBodies] : [table]).forEach((tb) => {
    [...tb.rows].forEach((tr) => {
      if (tr.parentElement?.tagName === "THEAD") return;
      const cells = [...tr.cells];
      if (cells.length === 1 && cells[0].colSpan > 1) return; // an "empty" message row
      bodyRows.push(cells.map(cellText));
    });
  });
  if (!header.length && bodyRows.length) { header = bodyRows[0]; bodyRows = bodyRows.slice(1); }
  const n = Math.max(header.length, ...bodyRows.map((r) => r.length));
  header = Array.from({ length: n }, (_, i) => header[i] || `Column ${i + 1}`);
  bodyRows = bodyRows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? ""));
  // The card's heading names the table, and a "Show all" button means some
  // rows are folded away on screen.
  const card = table.closest(".rounded-lg, .rounded-xl, section") || table.parentElement;
  const heading = card?.querySelector("h3, h4");
  const title = clean(heading?.innerText) || "Table";
  const folded = !!card && [...card.querySelectorAll("button")].some((b) => /^Show (all \d+|\d+ more)/.test(clean(b.innerText)));
  return { header, rows: bodyRows, title, folded };
}

// ---- numbers -------------------------------------------------------------------------

const NUM_RE = /^([+\-−]?)(\d*\.?\d+(?:e[-+]?\d+)?)(%?)$/i;
function parseNum(text) {
  const m = NUM_RE.exec(String(text).trim());
  if (!m) return null;
  const v = Number((m[1] === "−" || m[1] === "-" ? "-" : "") + m[2]);
  return Number.isFinite(v) ? { v, plus: m[1] === "+", pct: m[3] === "%" } : null;
}
// Columns of whole numbers (ranks, counts) keep their form; only columns
// that hold decimals are rounded.
function formatNum(text, decimals, decimalCol) {
  if (decimals === "asShown" || !decimalCol) return text;
  const p = parseNum(text);
  if (!p) return text;
  const s = p.v.toFixed(Number(decimals));
  return `${p.plus && p.v > 0 ? "+" : ""}${s}${p.pct ? "%" : ""}`;
}

// ---- styles --------------------------------------------------------------------------

const TABLE_FONTS = [
  { id: "inter", label: "Inter (as on screen)", stack: "Inter, Arial, Helvetica, sans-serif" },
  { id: "arial", label: "Arial / Helvetica", stack: "Arial, Helvetica, 'Liberation Sans', sans-serif" },
  { id: "calibri", label: "Calibri (as in Word)", stack: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif" },
  { id: "times", label: "Times New Roman", stack: "'Times New Roman', Times, 'Liberation Serif', serif" },
  { id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
];
const TABLE_STYLES = [
  { id: "academic", label: "Academic (lines only)" },
  { id: "grid", label: "Grid" },
  { id: "striped", label: "Striped rows" },
];

// Inline styles, so the same markup looks right in the preview, in the PNG
// and when pasted into Word.
function cellStyle(style, { head = false, rowIndex = 0, last = false, numeric = false, font, size }) {
  const s = { fontFamily: font, fontSize: `${size}px`, padding: "5px 10px", textAlign: numeric ? "right" : "left", verticalAlign: "top", color: "#111" };
  if (head) s.fontWeight = 600;
  if (style === "academic") {
    if (head) { s.borderTop = "1.5px solid #111"; s.borderBottom = "1px solid #111"; }
    if (last) s.borderBottom = "1.5px solid #111";
  } else if (style === "grid") {
    s.border = "1px solid #9aa5a5";
    if (head) s.background = "#eef2f2";
  } else {
    if (head) { s.background = "#0f6863"; s.color = "#fff"; }
    else if (rowIndex % 2 === 1) s.background = "#f1f5f5";
  }
  return s;
}

// ---- the floating button ---------------------------------------------------------------

export function TableToolsHost() {
  const [target, setTarget] = useState(null);   // the table under the pointer
  const [pos, setPos] = useState(null);
  const [open, setOpen] = useState(null);       // the table being edited
  const hideTimer = useRef(null);
  const overButton = useRef(false);

  useEffect(() => {
    const onOver = (e) => {
      const t = e.target instanceof Element ? e.target.closest("table") : null;
      if (!t || t.closest("[role=dialog], [data-table-editor], [data-no-table-tools]") || !t.tBodies[0]?.rows.length) return;
      clearTimeout(hideTimer.current);
      setTarget(t);
    };
    const onOut = (e) => {
      const t = e.target instanceof Element ? e.target.closest("table") : null;
      if (!t) return;
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => { if (!overButton.current) setTarget(null); }, 500);
    };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    return () => { document.removeEventListener("pointerover", onOver); document.removeEventListener("pointerout", onOut); };
  }, []);

  useEffect(() => {
    if (!target) { setPos(null); return undefined; }
    let raf = 0;
    const place = () => {
      if (!target.isConnected) { setTarget(null); return; }
      const r = target.getBoundingClientRect();
      const box = target.parentElement?.getBoundingClientRect() || r;
      // Just below the table, or at the bottom of the window when the
      // table runs past it.
      setPos({ top: Math.max(r.top + 40, Math.min(r.bottom + 4, window.innerHeight - 48)), right: window.innerWidth - Math.min(r.right, box.right) + (r.bottom + 4 > window.innerHeight - 48 ? 8 : 0) });
    };
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [target]);

  return (
    <>
      {target && pos && !open && (
        <button
          data-table-tools
          onPointerEnter={() => { overButton.current = true; clearTimeout(hideTimer.current); }}
          onPointerLeave={() => { overButton.current = false; hideTimer.current = setTimeout(() => setTarget(null), 400); }}
          onClick={() => { setOpen(readTable(target)); overButton.current = false; setTarget(null); }}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 45 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-lagoon-200 bg-white/95 px-3 py-1 text-[13.5px] font-medium text-lagoon-800 shadow-md hover:bg-lagoon-50"
        >
          <Table2 size={14} />Edit &amp; export table
        </button>
      )}
      {open && <TableEditor key={open.title + open.rows.length} data={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ---- the editor ------------------------------------------------------------------------

function slug(t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "table"; }
function saveBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const csvCell = (v) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function TableEditor({ data, onClose }) {
  const fresh = () => ({
    title: data.title, note: "",
    cols: data.header.map((name, i) => ({ i, name, on: true })),
    sortCol: "", sortDir: "desc", limit: "all", decimals: "asShown",
    style: "academic", font: "inter", size: 13, edits: {},
  });
  const [s, setS] = useState(fresh);
  const [msg, setMsg] = useState("");
  const set = (patch) => setS((o) => ({ ...o, ...patch }));
  const previewRef = useRef(null);
  const font = (TABLE_FONTS.find((f) => f.id === s.font) || TABLE_FONTS[0]).stack;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A column counts as numeric when every filled cell in it is a number.
  const numericCol = useMemo(() => data.header.map((_, c) => {
    const vals = data.rows.map((r) => r[c]).filter((v) => v !== "");
    return vals.length > 0 && vals.every((v) => parseNum(v));
  }), [data]);
  const decimalCol = useMemo(() => data.header.map((_, c) => data.rows.some((r) => parseNum(r[c]) && r[c].includes("."))), [data]);

  const view = useMemo(() => {
    const shownCols = s.cols.filter((c) => c.on);
    let rows = data.rows.map((r, ri) => ({ ri, cells: r.map((v, ci) => (s.edits[`${ri}:${ci}`] ?? v)) }));
    if (s.sortCol !== "") {
      const c = Number(s.sortCol);
      const sign = s.sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const x = parseNum(a.cells[c]); const y = parseNum(b.cells[c]);
        const d = x && y ? x.v - y.v : String(a.cells[c]).localeCompare(String(b.cells[c]));
        return d * sign;
      });
    }
    if (s.limit !== "all") rows = rows.slice(0, Number(s.limit));
    return { shownCols, rows };
  }, [s, data]);

  const out = (row, c) => formatNum(row.cells[c.i], s.decimals, decimalCol[c.i]);
  const matrix = () => [view.shownCols.map((c) => c.name), ...view.rows.map((r) => view.shownCols.map((c) => out(r, c)))];
  const base = slug(s.title);

  const moveCol = (k, d) => setS((o) => {
    const cols = [...o.cols]; const j = k + d;
    if (j < 0 || j >= cols.length) return o;
    [cols[k], cols[j]] = [cols[j], cols[k]];
    return { ...o, cols };
  });
  const setCol = (k, patch) => setS((o) => ({ ...o, cols: o.cols.map((c, j) => (j === k ? { ...c, ...patch } : c)) }));

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  const exportCsv = () => {
    const lines = matrix().map((r) => r.map(csvCell).join(","));
    saveBlob(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
  };
  const exportXlsx = async () => {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(s.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " ") || "Table");
    let r = 1;
    if (s.title) { ws.getCell(r, 1).value = s.title; ws.getCell(r, 1).font = { bold: true, size: 13 }; r += 2; }
    const m = matrix();
    m.forEach((row, i) => {
      row.forEach((v, j) => {
        const p = i > 0 ? parseNum(v) : null;
        const cell = ws.getCell(r, j + 1);
        cell.value = p ? (p.pct ? p.v / 100 : p.v) : v;
        if (p?.pct) cell.numFmt = "0.##%";
        else if (p && s.decimals !== "asShown" && decimalCol[view.shownCols[j].i]) cell.numFmt = Number(s.decimals) ? `0.${"0".repeat(Number(s.decimals))}` : "0";
        if (i === 0) { cell.font = { bold: true }; cell.border = { bottom: { style: "thin" } }; }
      });
      r += 1;
    });
    if (s.note) { r += 1; ws.getCell(r, 1).value = s.note; ws.getCell(r, 1).font = { italic: true }; }
    m[0].forEach((_, j) => { ws.getColumn(j + 1).width = Math.min(50, Math.max(10, ...m.map((row) => String(row[j]).length + 2))); });
    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
  };
  const exportPng = async () => {
    const node = previewRef.current;
    if (!node) return;
    const blob = await domNodeToPngBlob(node, { pixelRatio: 3, backgroundColor: "#ffffff" });
    if (blob) saveBlob(blob, `${base}.png`);
  };
  const copyForWord = async () => {
    const node = previewRef.current;
    if (!node) return;
    const html = node.outerHTML.replace(/ contenteditable="true"/g, "");
    const text = matrix().map((r) => r.join("\t")).join("\n");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      flash("Copied. Paste it into Word or PowerPoint.");
    } catch {
      const sel = window.getSelection(); const range = document.createRange();
      range.selectNode(node); sel.removeAllRanges(); sel.addRange(range);
      const ok = document.execCommand("copy"); sel.removeAllRanges();
      flash(ok ? "Copied. Paste it into Word or PowerPoint." : "Copying is blocked here; use Excel or PNG instead.");
    }
  };

  const label = "block text-[13.5px] font-medium text-neutral-700 mb-1";
  const input = "w-full border border-slate-300 rounded-md px-2 py-1 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-lagoon-300";
  const sortable = s.cols;

  return (
    <div className="fixed inset-0 z-[90] bg-ink/50 flex items-center justify-center p-3" role="dialog" aria-label="Edit and export table" data-table-editor onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Table2 size={18} className="text-lagoon-700" />
          <h2 className="se-display font-semibold text-[16px] flex-1">Edit &amp; export table</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-neutral-600 hover:bg-slate-100" title="Close (Esc)"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* settings */}
          <div className="md:w-[340px] shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 p-4 space-y-4">
            <div>
              <span className={label}>1. Title and note</span>
              <input className={input} value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" />
              <textarea className={`${input} mt-1.5`} rows={2} value={s.note} onChange={(e) => set({ note: e.target.value })} placeholder="Note below the table (optional)" />
            </div>
            <div>
              <span className={label}>2. Columns: tick, rename, reorder</span>
              <ul className="space-y-1">
                {s.cols.map((c, k) => (
                  <li key={c.i} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={c.on} onChange={(e) => setCol(k, { on: e.target.checked })} className="accent-lagoon-700" aria-label={`Show ${c.name}`} />
                    <input className={`${input} py-0.5 ${c.on ? "" : "text-neutral-400"}`} value={c.name} onChange={(e) => setCol(k, { name: e.target.value })} />
                    <button onClick={() => moveCol(k, -1)} disabled={k === 0} className="p-0.5 rounded text-neutral-600 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ChevronUp size={15} /></button>
                    <button onClick={() => moveCol(k, 1)} disabled={k === s.cols.length - 1} className="p-0.5 rounded text-neutral-600 hover:bg-slate-100 disabled:opacity-30" title="Move down"><ChevronDown size={15} /></button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className={label}>3. Rows and numbers</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[13.5px] text-neutral-700">Sort by
                  <select className={input} value={s.sortCol} onChange={(e) => set({ sortCol: e.target.value })}>
                    <option value="">As on screen</option>
                    {sortable.map((c) => <option key={c.i} value={c.i}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-[13.5px] text-neutral-700">Order
                  <select className={input} value={s.sortDir} onChange={(e) => set({ sortDir: e.target.value })} disabled={s.sortCol === ""}>
                    <option value="desc">Highest first</option>
                    <option value="asc">Lowest first</option>
                  </select>
                </label>
                <label className="text-[13.5px] text-neutral-700">Rows
                  <select className={input} value={s.limit} onChange={(e) => set({ limit: e.target.value })}>
                    <option value="all">All {data.rows.length}</option>
                    {[3, 5, 10, 15, 20].filter((n) => n < data.rows.length).map((n) => <option key={n} value={n}>First {n}</option>)}
                  </select>
                </label>
                <label className="text-[13.5px] text-neutral-700">Decimals
                  <select className={input} value={s.decimals} onChange={(e) => set({ decimals: e.target.value })}>
                    <option value="asShown">As on screen</option>
                    {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              {data.folded && <p className="mt-2 text-[13.5px] text-amber-800 bg-amber-50 rounded-md px-2 py-1.5">Some rows are folded away on screen. Close this, click "Show all" under the table, and open the editor again to include them.</p>}
            </div>
            <div>
              <span className={label}>4. Style</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[13.5px] text-neutral-700 col-span-2">Look
                  <select className={input} value={s.style} onChange={(e) => set({ style: e.target.value })}>
                    {TABLE_STYLES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
                <label className="text-[13.5px] text-neutral-700">Font
                  <select className={input} value={s.font} onChange={(e) => set({ font: e.target.value })}>
                    {TABLE_FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="text-[13.5px] text-neutral-700">Size
                  <select className={input} value={s.size} onChange={(e) => set({ size: Number(e.target.value) })}>
                    {[11, 12, 13, 14, 16].map((n) => <option key={n} value={n}>{n} pt</option>)}
                  </select>
                </label>
              </div>
            </div>
            <button onClick={() => setS(fresh())} className="inline-flex items-center gap-1.5 text-[13.5px] text-neutral-700 hover:text-neutral-900"><RotateCcw size={13} />Start again from the table on screen</button>
          </div>

          {/* preview */}
          <div className="flex-1 min-w-0 overflow-auto bg-slate-50 p-4">
            <p className="text-[13.5px] text-neutral-600 mb-2">Preview. Click any cell to change its text.</p>
            <div className="bg-white rounded-lg border border-slate-200 p-5 inline-block min-w-full">
              <div ref={previewRef} style={{ background: "#fff", padding: 8, display: "inline-block" }}>
                {s.title && <div style={{ fontFamily: font, fontSize: `${s.size + 2}px`, fontWeight: 600, marginBottom: 8, color: "#111" }}>{s.title}</div>}
                <table style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{view.shownCols.map((c) => <th key={c.i} style={cellStyle(s.style, { head: true, numeric: numericCol[c.i], font, size: s.size })}>{c.name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r, k) => (
                      <tr key={r.ri}>
                        {view.shownCols.map((c) => (
                          <td key={c.i} contentEditable suppressContentEditableWarning
                            onBlur={(e) => { const t = e.currentTarget.innerText.trim(); if (t !== out(r, c)) setS((o) => ({ ...o, edits: { ...o.edits, [`${r.ri}:${c.i}`]: t } })); }}
                            style={{ ...cellStyle(s.style, { rowIndex: k, last: k === view.rows.length - 1, numeric: numericCol[c.i], font, size: s.size }), outline: "none" }}
                            className="focus:ring-2 focus:ring-lagoon-300">
                            {out(r, c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.note && <div style={{ fontFamily: font, fontSize: `${Math.max(10, s.size - 1)}px`, fontStyle: "italic", marginTop: 6, color: "#333", maxWidth: 640 }}>{s.note}</div>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-slate-200">
          <span className="text-[13.5px] text-neutral-700 mr-1">Export</span>
          <button onClick={exportXlsx} className="inline-flex items-center gap-1.5 rounded-lg bg-lagoon-700 text-white px-3 py-1.5 text-[14px] font-medium hover:bg-lagoon-800"><FileSpreadsheet size={14} />Excel</button>
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium hover:bg-slate-50"><Download size={14} />CSV</button>
          <button onClick={exportPng} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium hover:bg-slate-50"><ImageIcon size={14} />PNG image</button>
          <button onClick={copyForWord} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[14px] font-medium hover:bg-slate-50"><Copy size={14} />Copy for Word</button>
          {msg && <span className="text-[13.5px] text-emerald-800">{msg}</span>}
          <button onClick={onClose} className="ml-auto rounded-lg px-3 py-1.5 text-[14px] text-neutral-700 hover:bg-slate-100">Close</button>
        </div>
      </div>
    </div>
  );
}
