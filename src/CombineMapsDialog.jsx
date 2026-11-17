// ============================================================================
// Combine maps: the dialog around mapAggregation.js
// ============================================================================
// Pick two or more models from the library, give each a credibility weight,
// check which concepts were matched by name (and join the ones that mean the
// same thing under different names), see how alike the maps are, and save
// the combined map as a new model. The models picked are only read.
import React, { useMemo, useState } from "react";
import { Merge, X, AlertTriangle } from "lucide-react";
import { aggregateMaps, compareMaps, matchConcepts, DEFAULT_AGGREGATION } from "./mapAggregation.js";
import { t as tr } from "./i18n.js";

const RULES = [
  { id: "all", label: tr("All maps"), hint: tr("A map without the relationship counts as 0 (Kosko 1988). Relationships only a few people drew become weaker.") },
  { id: "both", label: tr("Maps with both concepts"), hint: tr("Only maps that contain both concepts count; a map that has them but no link between them counts as 0.") },
  { id: "present", label: tr("Maps with the relationship"), hint: tr("Only the maps that drew the relationship count. Keeps each relationship at the strength its authors gave it.") },
];

const pct = (v) => (v === null || v === undefined ? "-" : `${Math.round(v * 100)}%`);

export default function CombineMapsDialog({ library, activeId, readModel, onCreate, onClose }) {
  const models = [...(library?.models || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const [picked, setPicked] = useState(() => (activeId ? [activeId] : []));
  const [cred, setCred] = useState({});
  const [opts, setOpts] = useState(DEFAULT_AGGREGATION);
  const [merges, setMerges] = useState({});
  const [name, setName] = useState(tr("Combined map"));
  const [showAll, setShowAll] = useState(false);

  // the picked models' contents, in the order shown in the list
  const maps = useMemo(() => models.filter((m) => picked.includes(m.id)).map((m) => {
    const data = readModel(m.id);
    return data ? { id: m.id, name: m.name, credibility: cred[m.id] ?? 1, concepts: data.concepts, edges: data.edges, settings: data.settings } : null;
  }).filter(Boolean), [picked, cred, library]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = maps.length >= 2;
  const matched = useMemo(() => (ready ? matchConcepts(maps, merges) : null), [ready, maps, merges]);
  const result = useMemo(() => (ready ? aggregateMaps(maps, { ...opts, merges }) : null), [ready, maps, opts, merges]);
  const pairs = useMemo(() => (ready ? compareMaps(maps, merges) : []), [ready, maps, merges]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const groups = matched ? [...matched.groups].sort((a, b) => a.mapIndexes.length - b.mapIndexes.length || a.name.localeCompare(b.name)) : [];
  const shownGroups = showAll ? groups : groups.filter((g) => g.mapIndexes.length < maps.length || g.ownKeys.length > 1);
  const joinInto = (g, target) => setMerges((m) => {
    const next = { ...m };
    if (target) next[g.key] = target;
    return next;
  });
  const separate = (g) => setMerges((m) => {
    const next = { ...m };
    g.ownKeys.forEach((k) => { delete next[k]; });
    Object.keys(next).forEach((k) => { if (next[k] === g.key) delete next[k]; });
    return next;
  });

  const create = () => {
    if (!result) return;
    onCreate(name.trim() || tr("Combined map"), { concepts: result.concepts, edges: result.edges, settings: result.settings }, result.report);
  };

  const box = "border border-slate-200 rounded-lg";
  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/40 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="se-combine-title" className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-200">
          <div>
            <h2 id="se-combine-title" className="text-base font-semibold text-neutral-900 flex items-center gap-2"><Merge size={17} className="text-lagoon-700" />{tr("Combine maps")}</h2>
            <p className="text-sm text-neutral-700 mt-0.5">{tr("Aggregate several stakeholder maps into one group map. Concepts with the same name are matched, and relationship weights are averaged (Kosko 1988; Özesmi and Özesmi 2004). The maps you pick are not changed.")}</p>
          </div>
          <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900" aria-label={tr("Close")}><X size={16} /></button>
        </div>

        <div className="overflow-auto px-5 py-4 space-y-5">
          {/* 1. maps and credibility */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("1. Maps to combine")}</h3>
            <p className="text-[13px] text-neutral-700 mb-2">{tr("Credibility weights how much each map counts (1 = equal weight; 2 = twice as much; 0 = left out of the averages).")}</p>
            <ul className={`${box} divide-y divide-slate-100 max-h-56 overflow-auto`}>
              {models.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <li key={m.id} className={`flex items-center gap-3 px-3 py-2 ${on ? "bg-lagoon-50" : ""}`}>
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggle(m.id)} />
                      <span className="text-sm text-neutral-900 truncate">{m.name}</span>
                      <span className="text-[13px] text-neutral-600 shrink-0">{m.concepts} concepts, {m.relationships} relationships</span>
                    </label>
                    {on && (
                      <label className="flex items-center gap-1.5 text-[13px] text-neutral-800 shrink-0">
                        Credibility
                        <input type="number" min="0" step="0.5" value={cred[m.id] ?? 1}
                          onChange={(e) => setCred((c) => ({ ...c, [m.id]: Math.max(0, Number(e.target.value) || 0) }))}
                          className="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-sm" />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            {!ready && <p className="text-[13px] text-amber-800 mt-1.5">{tr("Pick at least two maps. To combine maps from other people, import their .json files first (Import JSON in the model menu).")}</p>}
          </section>

          {ready && (<>
            {/* 2. averaging rule */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("2. How relationships are averaged")}</h3>
              <div className="grid sm:grid-cols-3 gap-2">
                {RULES.map((r) => (
                  <label key={r.id} className={`${box} p-2.5 cursor-pointer ${opts.rule === r.id ? "border-lagoon-500 bg-lagoon-50" : "hover:bg-slate-50"}`}>
                    <span className="flex items-center gap-2 text-sm font-medium text-neutral-900">
                      <input type="radio" name="se-agg-rule" checked={opts.rule === r.id} onChange={() => setOpts((o) => ({ ...o, rule: r.id }))} />{r.label}
                    </span>
                    <span className="block text-[13px] text-neutral-700 mt-1">{r.hint}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2.5 text-sm text-neutral-900">
                <label className="flex items-center gap-2">Keep a relationship if at least
                  <input type="number" min="1" max={maps.length} value={opts.minMaps}
                    onChange={(e) => setOpts((o) => ({ ...o, minMaps: Math.max(1, Math.min(maps.length, Math.round(Number(e.target.value) || 1))) }))}
                    className="w-14 border border-slate-300 rounded px-1.5 py-0.5" />
                  of {maps.length} maps drew it</label>
                <label className="flex items-center gap-2">and its combined weight is at least
                  <input type="number" min="0" max="1" step="0.05" value={opts.minAbsWeight}
                    onChange={(e) => setOpts((o) => ({ ...o, minAbsWeight: Math.max(0, Math.min(1, Number(e.target.value) || 0)) }))}
                    className="w-16 border border-slate-300 rounded px-1.5 py-0.5" />
                  in size</label>
              </div>
            </section>

            {/* 3. concept matching */}
            <section>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <h3 className="text-sm font-semibold text-neutral-900">{tr("3. Matching concepts")}</h3>
                <label className="text-[13px] text-neutral-800 flex items-center gap-1.5"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />{tr("Show concepts found in every map too")}</label>
              </div>
              <p className="text-[13px] text-neutral-700 mb-2">{tr("Concepts are matched on their name, ignoring capitals and punctuation. When two names mean the same thing (for example \"Farm income\" and \"Income of farmers\"), join one into the other.")}</p>
              <div className={`${box} max-h-64 overflow-auto`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[13px] text-neutral-800 sticky top-0">
                    <tr><th className="px-3 py-1.5 font-medium">{tr("Concept")}</th><th className="px-3 py-1.5 font-medium">{tr("Found in")}</th><th className="px-3 py-1.5 font-medium">{tr("Same as")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shownGroups.map((g) => (
                      <tr key={g.key}>
                        <td className="px-3 py-1.5 text-neutral-900">{g.name}{g.ownKeys.length > 1 && <span className="block text-[13px] text-neutral-600">joins {[...new Set(g.members.map((x) => x.concept.name))].join(", ")}</span>}</td>
                        <td className="px-3 py-1.5 text-neutral-800">{g.mapIndexes.length} of {maps.length}: <span className="text-neutral-600">{g.mapIndexes.map((mi) => maps[mi].name).join(", ")}</span></td>
                        <td className="px-3 py-1.5">
                          {g.ownKeys.length > 1 ? (
                            <button onClick={() => separate(g)} className="text-[13px] text-lagoon-700 underline hover:no-underline">{tr("Separate again")}</button>
                          ) : (
                            <select value="" onChange={(e) => joinInto(g, e.target.value)} className="border border-slate-300 rounded px-1.5 py-0.5 text-sm max-w-[220px]">
                              <option value="">(its own concept)</option>
                              {groups.filter((o) => o.key !== g.key).sort((a, b) => a.name.localeCompare(b.name)).map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!shownGroups.length && <tr><td colSpan={3} className="px-3 py-2 text-neutral-700">{tr("Every concept is found in every map.")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. how alike the maps are */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("4. How alike the maps are")}</h3>
              <p className="text-[13px] text-neutral-700 mb-2">Shared concepts and shared relationships are Jaccard indices (shared / all). Same sign is the share of shared relationships that point the same way. Weight difference is the mean absolute difference in weight among the concepts both maps contain (0 = identical, 2 = opposite).</p>
              <div className={`${box} overflow-auto`}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[13px] text-neutral-800">
                    <tr><th className="px-3 py-1.5 font-medium">{tr("Maps")}</th><th className="px-3 py-1.5 font-medium text-right">{tr("Shared concepts")}</th><th className="px-3 py-1.5 font-medium text-right">{tr("Shared relationships")}</th><th className="px-3 py-1.5 font-medium text-right">{tr("Same sign")}</th><th className="px-3 py-1.5 font-medium text-right">{tr("Weight difference")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pairs.map((p) => (
                      <tr key={`${p.a}-${p.b}`}>
                        <td className="px-3 py-1.5 text-neutral-900">{maps[p.a].name} and {maps[p.b].name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.concepts)} <span className="text-neutral-600">({p.sharedConcepts})</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.relationships)} <span className="text-neutral-600">({p.sharedRelationships})</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.signAgreement)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.weightDiff === null ? "-" : p.weightDiff.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5. the result */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("5. Combined map")}</h3>
              <p className="text-sm text-neutral-900">
                {result.report.concepts} concepts ({result.report.conceptsInAll} in every map, {result.report.conceptsInOne} in one map only) and {result.report.relationships} of {result.report.candidateRelationships} relationships.
                {result.report.dropped.fewMaps > 0 && ` ${result.report.dropped.fewMaps} left out because too few maps drew them.`}
                {result.report.dropped.weak > 0 && ` ${result.report.dropped.weak} left out because the combined weight is too small.`}
                {result.report.dropped.zero > 0 && ` ${result.report.dropped.zero} left out because the weights cancel out.`}
                {result.report.selfLoops > 0 && ` ${result.report.selfLoops} relationship${result.report.selfLoops === 1 ? "" : "s"} between joined concepts left out.`}
              </p>
              {result.report.conflicts.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  <p className="font-medium flex items-center gap-1.5"><AlertTriangle size={14} />The maps disagree on the sign of {result.report.conflicts.length} relationship{result.report.conflicts.length === 1 ? "" : "s"}. Averaging partly cancels these out; they may be worth discussing with the participants.</p>
                  <ul className="list-disc pl-5 mt-1 space-y-0.5">
                    {result.report.conflicts.slice(0, 8).map((c, i) => <li key={i}>{c.from} → {c.to}: {c.weights.map((w) => `${w.map} ${w.weight}`).join(", ")}</li>)}
                    {result.report.conflicts.length > 8 && <li>and {result.report.conflicts.length - 8} more (each relationship's description lists the weights)</li>}
                  </ul>
                </div>
              )}
            </section>
          </>)}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <label className="flex items-center gap-2 text-sm text-neutral-900 mr-auto">Name
            <input value={name} onChange={(e) => setName(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm w-56" />
          </label>
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-neutral-900 hover:bg-slate-50">{tr("Cancel")}</button>
          <button onClick={create} disabled={!ready || !result?.concepts.length} className="px-3 py-1.5 rounded-md bg-lagoon-700 text-white text-sm hover:bg-lagoon-800 disabled:opacity-40">{tr("Create combined model")}</button>
        </div>
      </div>
    </div>
  );
}
