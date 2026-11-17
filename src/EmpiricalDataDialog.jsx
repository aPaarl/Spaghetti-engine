// ============================================================================
// Empirical data: the dialog around empiricalData.js
// ============================================================================
// Load a table of observations, match its columns to concepts and choose how
// each is fuzzified, then use the result: as start values, to compare the
// model with the data, or (for a time series) to suggest weights for the
// relationships the experts drew. Nothing changes in the model until one of
// the Apply buttons is clicked, and both can be undone with Undo.
import React, { useMemo, useRef, useState } from "react";
import { Database, X, Upload, Download, Check, AlertTriangle } from "lucide-react";
import { parseTable, matchColumns, defaultSpec, centersFor, fuzzify, fuzzifiedTable, compareWithModel, suggestWeights, blendWeight, TERM_SETS, quantile } from "./empiricalData.js";
import { t as tr } from "./i18n.js";

const METHODS = [
  { id: "minmax", label: tr("Linear between two values") },
  { id: "percentile", label: tr("Linear between the 5th and 95th percentile") },
  { id: "linguistic", label: tr("Linguistic terms (low, medium, high)") },
];
const r2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : "-");
const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : "-");

function Spark({ values, scale }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) return <span className="text-neutral-400">-</span>;
  const n = values.length - 1 || 1;
  const lo = scale === "signed" ? -1 : 0;
  const path = pts.map(([i, v]) => `${(i / n) * 78 + 1},${19 - ((v - lo) / (1 - lo)) * 18}`).join(" ");
  return <svg width="80" height="20" aria-hidden="true"><rect x="0" y="0" width="80" height="20" fill="#f8fafc" /><polyline points={path} fill="none" stroke="#137d78" strokeWidth="1.5" /></svg>;
}

export default function EmpiricalDataDialog({ concepts, edges, settings, simulate, onSetStart, onSetWeights, onClose }) {
  const [table, setTable] = useState(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [mapping, setMapping] = useState({});
  const [specs, setSpecs] = useState({});
  const [scale, setScale] = useState("unit");
  const [tab, setTab] = useState("start");
  const [startRow, setStartRow] = useState(0);
  const [fromRow, setFromRow] = useState(0);
  const [toRow, setToRow] = useState(0);
  const [comparison, setComparison] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [share, setShare] = useState(0.5);
  const [include, setInclude] = useState({});
  const fileRef = useRef(null);

  const load = (text) => {
    try {
      const t = parseTable(text);
      setTable(t); setError("");
      setMapping(matchColumns(t.columns, concepts));
      setSpecs(Object.fromEntries(t.columns.map((c, i) => [i, defaultSpec(c.values)])));
      const last = t.labels.length - 1;
      setStartRow(last); setFromRow(0); setToRow(last); setComparison(null); setSuggested(null);
    } catch (e) { setError(e.message); }
  };
  const readFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    const r = new FileReader();
    r.onload = () => load(String(r.result));
    r.readAsText(f);
  };

  const fuzzy = useMemo(() => (table ? fuzzifiedTable(table, mapping, specs, scale) : {}), [table, mapping, specs, scale]);
  const matched = table ? table.columns.map((_, i) => i).filter((i) => mapping[i]) : [];
  const setSpec = (i, patch) => { setSpecs((s) => ({ ...s, [i]: { ...s[i], ...patch } })); setComparison(null); setSuggested(null); };
  const usedTwice = new Set(Object.values(mapping).filter((id, k, all) => id && all.indexOf(id) !== k));
  const nameOf = (id) => concepts.find((c) => c.id === id)?.name || id;

  const startValues = Object.fromEntries(Object.entries(fuzzy).filter(([, s]) => Number.isFinite(s[startRow])).map(([id, s]) => [id, s[startRow]]));
  const runCompare = () => setComparison(compareWithModel(fuzzy, concepts, simulate, fromRow, toRow));
  const runSuggest = () => {
    const s = suggestWeights(fuzzy, concepts, edges, settings);
    setSuggested(s);
    setInclude(Object.fromEntries(s.results.map((r) => [r.edgeId, r.signAgrees])));
  };
  const downloadCsv = () => {
    const ids = matched.map((i) => mapping[i]);
    const head = [table.labelName, ...ids.map(nameOf)];
    const rows = table.labels.map((l, k) => [l, ...ids.map((id) => fmt(fuzzy[id][k]))]);
    const csv = [head, ...rows].map((r) => r.map((c) => (/[",;\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "fuzzified-data.csv"; a.click();
  };

  const box = "bg-white rounded-2xl border border-slate-200 p-5";
  const input = "text-sm text-neutral-900 border border-slate-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-lagoon-300";
  const rowSelect = (value, set, label) => (
    <select value={value} onChange={(e) => { set(Number(e.target.value)); setComparison(null); }} className={input} aria-label={label}>
      {table.labels.map((l, k) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const Head = ({ n, title, children }) => (
    <div className="flex items-start gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center shrink-0">{n}</span>
      <div><h3 className="se-display text-[17px] font-bold text-neutral-900 leading-tight">{title}</h3>{children && <p className="text-sm text-neutral-700 mt-0.5">{children}</p>}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/40 flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="se-data-title" className="bg-[#f7f9f9] rounded-2xl shadow-xl border border-slate-200 max-w-5xl w-full max-h-[94vh] flex flex-col" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 bg-white rounded-t-2xl border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-lagoon-700 text-white flex items-center justify-center shrink-0"><Database size={20} /></span>
            <div>
              <h2 id="se-data-title" className="se-display text-xl font-bold text-neutral-900">{tr("Empirical data")}</h2>
              <p className="text-sm text-neutral-700">{tr("Bring measured values onto the scale of the map, and use them for start values, to check the model, or to suggest weights.")}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-600 hover:bg-slate-100" aria-label={tr("Close")}><X size={20} /></button>
        </div>

        <div className="overflow-auto px-6 py-5 space-y-6">
          <section className={box}>
            <Head n={1} title={tr("Load a table")}>{tr("One column per variable, one row per year or case. A first column with years or names labels the rows. CSV from Excel (comma or semicolon) or pasted cells both work.")}</Head>
            <div className="flex flex-wrap items-start gap-3">
              <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-lg bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800 inline-flex items-center gap-2"><Upload size={15} />{tr("Choose a CSV file")}</button>
              <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={readFile} />
              <div className="flex-1 min-w-[260px] flex gap-2">
                <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2} placeholder={"or paste from Excel, e.g.\nYear\tGroundwater level\tGrass yield"} className={`${input} flex-1 font-mono text-xs`} />
                <button onClick={() => load(paste)} disabled={!paste.trim()} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-40 self-start">{tr("Read")}</button>
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            {table && <p className="mt-3 text-sm text-neutral-800"><Check size={14} className="inline text-lagoon-700 mr-1" />{table.labels.length} rows ({table.labels[0]} to {table.labels[table.labels.length - 1]}), {table.columns.length} columns, {matched.length} matched to a concept.</p>}
          </section>

          {table && (
            <section className={box}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Head n={2} title={tr("Match and fuzzify")}>{tr("Each column becomes a concept value. Choose the concept, how the measured values are mapped onto the scale, and whether a higher measurement means a lower concept value.")}</Head>
                <label className="text-sm text-neutral-800 flex items-center gap-2">Scale
                  <select value={scale} onChange={(e) => { setScale(e.target.value); setComparison(null); setSuggested(null); }} className={input}>
                    <option value="unit">{tr("0 to 1")}</option><option value="signed">{tr("-1 to +1")}</option>
                  </select>
                </label>
              </div>
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[13px] text-neutral-700">
                    <tr><th className="px-3 py-2 font-medium">{tr("Column")}</th><th className="px-3 py-2 font-medium">{tr("Concept")}</th><th className="px-3 py-2 font-medium">{tr("Fuzzification")}</th><th className="px-3 py-2 font-medium">{tr("Reverse")}</th><th className="px-3 py-2 font-medium">{tr("Result")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {table.columns.map((col, i) => {
                      const sp = specs[i];
                      const res = fuzzify(col.values, sp, scale);
                      const last = res.length - 1;
                      return (
                        <tr key={i} className={mapping[i] ? "" : "bg-slate-50/60"}>
                          <td className="px-3 py-2 align-top"><div className="font-medium text-neutral-900">{col.name}</div><div className="text-[12px] text-neutral-600">{fmt(Math.min(...col.values.filter(Number.isFinite)))} to {fmt(Math.max(...col.values.filter(Number.isFinite)))}</div></td>
                          <td className="px-3 py-2 align-top">
                            <select value={mapping[i] || ""} onChange={(e) => { setMapping((m) => ({ ...m, [i]: e.target.value })); setComparison(null); setSuggested(null); }} className={`${input} max-w-[190px]`}>
                              <option value="">(not used)</option>
                              {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {usedTwice.has(mapping[i]) && <div className="text-[12px] text-amber-800 mt-1">{tr("Used by two columns")}</div>}
                          </td>
                          <td className="px-3 py-2 align-top space-y-1.5">
                            <select value={sp.method} onChange={(e) => setSpec(i, { method: e.target.value })} className={`${input} max-w-[250px]`}>
                              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                            {sp.method === "minmax" && (
                              <div className="flex items-center gap-1.5 text-[13px] text-neutral-700">{tr("from")} <input type="number" value={sp.low} onChange={(e) => setSpec(i, { low: Number(e.target.value) })} className={`${input} w-24`} /> {tr("to")} <input type="number" value={sp.high} onChange={(e) => setSpec(i, { high: Number(e.target.value) })} className={`${input} w-24`} /></div>
                            )}
                            {sp.method === "percentile" && <div className="text-[13px] text-neutral-700">from {fmt(quantile(col.values, 0.05))} to {fmt(quantile(col.values, 0.95))}</div>}
                            {sp.method === "linguistic" && (
                              <div className="space-y-1">
                                <select value={sp.centers.length} onChange={(e) => setSpec(i, { centers: centersFor(col.values, Number(e.target.value)) })} className={`${input} text-[13px]`}>
                                  <option value={3}>{tr("3 terms")}</option><option value={5}>{tr("5 terms")}</option>
                                </select>
                                <div className="flex flex-wrap gap-1.5">
                                  {sp.centers.map((cv, j) => (
                                    <label key={j} className="text-[12px] text-neutral-700 flex flex-col">{(TERM_SETS[sp.centers.length] || [])[j]}
                                      <input type="number" value={Math.round(cv * 1000) / 1000} onChange={(e) => setSpec(i, { centers: sp.centers.map((x, k) => (k === j ? Number(e.target.value) : x)) })} className={`${input} w-20 text-[13px]`} />
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top"><input type="checkbox" checked={!!sp.reverse} onChange={(e) => setSpec(i, { reverse: e.target.checked })} aria-label={`Reverse ${col.name}`} className="w-4 h-4 accent-lagoon-700" /></td>
                          <td className="px-3 py-2 align-top">
                            <Spark values={res.map((r) => r.value)} scale={scale} />
                            <div className="text-[12px] text-neutral-700">last: {fmt(col.values[last])} → <strong>{fmt(res[last].value)}</strong>{res[last].term ? ` (${res[last].term})` : ""}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex justify-end"><button onClick={downloadCsv} disabled={!matched.length} className="text-[13px] text-lagoon-700 hover:underline inline-flex items-center gap-1 disabled:opacity-40"><Download size={13} />Download the fuzzified data (CSV)</button></div>
            </section>
          )}

          {table && matched.length > 0 && (
            <section className={box}>
              <Head n={3} title={tr("Use the data")} />
              <div className="inline-flex gap-1 rounded-xl bg-slate-200/60 p-1 mb-4" role="tablist">
                {[["start", "Start values"], ["compare", "Compare with the model"], ["weights", "Suggest weights"]].map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${tab === id ? "bg-white shadow-sm text-lagoon-800" : "text-slate-700 hover:bg-white/60"}`}>{label}</button>
                ))}
              </div>

              {tab === "start" && (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-800">{tr("Take the start values of the matched concepts from one row of the data, for example the most recent year. Concepts without data keep their own start value.")}</p>
                  <label className="text-sm text-neutral-800 flex items-center gap-2">Row {rowSelect(startRow, setStartRow, "Row for the start values")}</label>
                  <table className="text-sm"><thead><tr className="text-left text-[13px] text-neutral-600"><th className="pr-6 py-1 font-medium">{tr("Concept")}</th><th className="pr-6 py-1 font-medium">{tr("Now")}</th><th className="py-1 font-medium">{tr("From the data")}</th></tr></thead>
                    <tbody>{Object.entries(startValues).map(([id, v]) => <tr key={id}><td className="pr-6 py-0.5">{nameOf(id)}</td><td className="pr-6 tabular-nums">{fmt(concepts.find((c) => c.id === id)?.initialValue)}</td><td className="tabular-nums font-medium">{fmt(v)}</td></tr>)}</tbody>
                  </table>
                  <button onClick={() => onSetStart(startValues, table.labels[startRow])} disabled={!Object.keys(startValues).length} className="px-4 py-2 rounded-lg bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800 disabled:opacity-40">Set {Object.keys(startValues).length} start values</button>
                </div>
              )}

              {tab === "compare" && (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-800">{tr("The model starts from the data in one row and runs until it settles; the end state is compared with the data in a later row. This checks whether the map moves the way the measurements did. The model has no calendar time, so read it as a check of direction and rough size, not of timing.")}</p>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-800">
                    <label className="flex items-center gap-2">Start from {rowSelect(fromRow, setFromRow, "Start row")}</label>
                    <label className="flex items-center gap-2">compare with {rowSelect(toRow, setToRow, "Comparison row")}</label>
                    <button onClick={runCompare} className="px-4 py-1.5 rounded-lg bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800">{tr("Compare")}</button>
                  </div>
                  {comparison && (
                    <>
                      <p className="text-sm text-neutral-900">
                        Mean difference <strong>{r2(comparison.mae)}</strong>{comparison.directionAgreement !== null && <>; the direction of change agrees for <strong>{Math.round(comparison.directionAgreement * 100)}%</strong> {tr("of the concepts")}</>}.
                        {!comparison.converged && <span className="text-amber-800"> {tr("The model did not settle, so the end state is the last iteration.")}</span>}
                      </p>
                      <table className="w-full text-sm"><thead><tr className="text-left text-[13px] text-neutral-600 border-b border-slate-200"><th className="py-1 font-medium">{tr("Concept")}</th><th className="py-1 font-medium text-right">{tr("Data")}</th><th className="py-1 font-medium text-right">{tr("Model")}</th><th className="py-1 font-medium text-right">{tr("Difference")}</th><th className="py-1 font-medium text-right">{tr("Change in data")}</th><th className="py-1 font-medium text-right">{tr("Change in model")}</th><th className="py-1 font-medium text-center">{tr("Same direction")}</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{comparison.rows.map((r) => (
                          <tr key={r.id}><td className="py-1">{r.name}</td><td className="text-right tabular-nums">{fmt(r.observed)}</td><td className="text-right tabular-nums">{fmt(r.simulated)}</td><td className={`text-right tabular-nums ${Math.abs(r.difference) > 0.25 ? "text-orange-700 font-medium" : ""}`}>{fmt(r.difference)}</td><td className="text-right tabular-nums">{fmt(r.obsChange)}</td><td className="text-right tabular-nums">{fmt(r.simChange)}</td><td className="text-center">{r.direction === null ? "-" : r.direction ? <Check size={15} className="inline text-lagoon-700" /> : <X size={15} className="inline text-orange-700" />}</td></tr>
                        ))}</tbody>
                      </table>
                    </>
                  )}
                </div>
              )}

              {tab === "weights" && (
                <div className="space-y-3">
                  <p className="text-sm text-neutral-800">{tr("For a time series, the update rule of the model is fitted to consecutive rows, for every concept whose causes all have data. Only the relationships already on the map are fitted, so the structure stays the experts'. Correlation in data is not causation: use the suggestions to question the weights, not to replace the group's judgement.")}</p>
                  {table.labels.length < 4 ? <p className="text-sm text-amber-800">{tr("This needs a time series of at least four rows.")}</p> : (
                    <button onClick={runSuggest} className="px-4 py-1.5 rounded-lg bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800">{tr("Suggest weights")}</button>
                  )}
                  {settings?.squashFunction === "trivalent" && <p className="text-sm text-amber-800">{tr("The trivalent transfer function cannot be fitted; choose another one in the simulation settings.")}</p>}
                  {suggested && (
                    <>
                      {!suggested.results.length && <p className="text-sm text-neutral-800">{tr("No relationship could be fitted.")}</p>}
                      {suggested.results.length > 0 && (
                        <>
                          <table className="w-full text-sm"><thead><tr className="text-left text-[13px] text-neutral-600 border-b border-slate-200"><th className="py-1 font-medium">{tr("Use")}</th><th className="py-1 font-medium">{tr("Relationship")}</th><th className="py-1 font-medium text-right">{tr("Expert")}</th><th className="py-1 font-medium text-right">{tr("Data")}</th><th className="py-1 font-medium text-right">{tr("New")}</th><th className="py-1 font-medium text-right">Fit (R²)</th><th className="py-1 font-medium text-right">{tr("Steps")}</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">{suggested.results.map((r) => (
                              <tr key={r.edgeId} className={r.signAgrees ? "" : "bg-orange-50/60"}>
                                <td className="py-1"><input type="checkbox" checked={!!include[r.edgeId]} onChange={(e) => setInclude((s) => ({ ...s, [r.edgeId]: e.target.checked }))} className="w-4 h-4 accent-lagoon-700" aria-label={tr("Use this suggestion")} /></td>
                                <td className="py-1">{nameOf(r.source)} → {nameOf(r.target)}{!r.signAgrees && <span className="ml-2 text-[12px] text-orange-800 inline-flex items-center gap-1"><AlertTriangle size={12} />{tr("opposite sign")}</span>}</td>
                                <td className="text-right tabular-nums">{fmt(r.expert)}</td><td className="text-right tabular-nums">{fmt(r.data)}</td>
                                <td className="text-right tabular-nums font-medium">{include[r.edgeId] ? fmt(blendWeight(r.expert, r.data, share)) : "-"}</td>
                                <td className="text-right tabular-nums">{r2(r.r2)}</td><td className="text-right tabular-nums">{r.n}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-800">
                            <label className="flex items-center gap-2">Weight given to the data
                              <input type="range" min={0} max={1} step={0.05} value={share} onChange={(e) => setShare(Number(e.target.value))} className="w-40 accent-lagoon-700" />
                              <span className="tabular-nums w-10">{Math.round(share * 100)}%</span>
                            </label>
                            <button onClick={() => onSetWeights(Object.fromEntries(suggested.results.filter((r) => include[r.edgeId]).map((r) => [r.edgeId, blendWeight(r.expert, r.data, share)])))}
                              disabled={!suggested.results.some((r) => include[r.edgeId])} className="ml-auto px-4 py-2 rounded-lg bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800 disabled:opacity-40">{tr("Apply the new weights")}</button>
                          </div>
                        </>
                      )}
                      {suggested.skipped.length > 0 && <p className="text-[13px] text-neutral-600">Not fitted: {suggested.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}.</p>}
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
