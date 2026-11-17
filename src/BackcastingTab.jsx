// ============================================================================
// Backcasting tab: from the system of today to an envisioned system
// ============================================================================
// The open model is today's system. The user picks (or creates) a second
// model that describes the envisioned system, chooses the outcomes that
// define "closer to the vision" and which kinds of steps are allowed, and
// runs the search in backcasting.js. The path is shown from the vision back
// to today, the way backcasting is read, with the state of the outcomes at
// every milestone.
import React, { useMemo, useState } from "react";
import { Flag, Play, ArrowDown, ArrowUp, Sparkles, AlertTriangle, Check } from "lucide-react";
import { compareSystems, buildMoves, backcast, driversOf } from "./backcasting.js";
import { t as tr } from "./i18n.js";

const pct = (v) => `${Math.round((v || 0) * 100)}%`;
const f2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : "-");
const TYPE = {
  lever: { label: "Measure", tone: "bg-sky-50 text-sky-800" },
  introduce: { label: "New element", tone: "bg-emerald-50 text-emerald-800" },
  phaseOut: { label: "Phase out", tone: "bg-orange-50 text-orange-800" },
  edge: { label: "Change a link", tone: "bg-violet-50 text-violet-800" },
};

// The label of a step, in the chosen language.
function moveLabel(m, nameOf) {
  const v = (x) => (Math.round(x * 100) / 100).toString();
  if (m.type === "lever") return tr(m.level >= 0 ? "Raise {name} to {v}" : "Lower {name} to {v}", { name: nameOf(m.concept), v: v(m.level) });
  if (m.type === "introduce") return tr("Introduce {name}", { name: m.concept.name });
  if (m.type === "phaseOut") return tr("Phase out {name}", { name: nameOf(m.concept) });
  const ch = m.change;
  const verb = ch.kind === "add" ? "Create the link {a} → {b}" : ch.kind === "remove" ? "Cut the link {a} → {b}" : ch.to * ch.from < 0 ? "Reverse the link {a} → {b}" : Math.abs(ch.to) > Math.abs(ch.from) ? "Strengthen the link {a} → {b}" : "Weaken the link {a} → {b}";
  return tr(verb, { a: nameOf(ch.source), b: nameOf(ch.target) });
}

export default function BackcastingTab({ concepts, edges, settings, library, activeModelId, activeModelName, readModel, simulate, onCreateVision, onOpenModel }) {
  const others = (library?.models || []).filter((m) => m.id !== activeModelId);
  const guess = others.find((m) => m.name === `${activeModelName} (vision)`) || others.find((m) => /vision|visie|toekomst|future/i.test(m.name));
  const [visionId, setVisionId] = useState(guess?.id || "");
  const [outcomes, setOutcomes] = useState(null);
  const [levers, setLevers] = useState(null);
  const [structural, setStructural] = useState(true);
  const [maxSteps, setMaxSteps] = useState(8);
  const [beam, setBeam] = useState(3);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [forward, setForward] = useState(false);

  const current = useMemo(() => ({ concepts, edges }), [concepts, edges]);
  const vision = useMemo(() => {
    if (!visionId) return null;
    const d = readModel(visionId);
    return d ? { concepts: d.concepts, edges: d.edges } : null;
  }, [visionId, readModel]);
  const diff = useMemo(() => (vision ? compareSystems(current, vision) : null), [current, vision]);
  const moves = useMemo(() => (vision && diff ? buildMoves(current, vision, diff, { structural }) : []), [current, vision, diff, structural]);
  const nameOf = (id) => concepts.find((c) => c.id === id)?.name || vision?.concepts.find((c) => c.id === id)?.name || id;

  // the default outcomes: matched concepts whose settled values differ
  const states = useMemo(() => {
    if (!vision || !diff) return null;
    const held = (m) => { const l = driversOf(m); return { id: "held", initialOverrides: { ...l }, lockedConcepts: { ...l }, weightOverrides: {} }; };
    const a = simulate(current.concepts, current.edges, held(current), settings);
    const b = simulate(vision.concepts, vision.edges, held(vision), settings);
    return diff.pairs.map((p) => ({ id: p.cur.id, name: p.cur.name, today: a.final[p.cur.id] ?? 0, vision: b.final[p.vis.id] ?? 0 }));
  }, [current, vision, diff, settings, simulate]);
  const driverIds = useMemo(() => (vision ? new Set([...Object.keys(driversOf(current)), ...Object.keys(driversOf(vision))]) : new Set()), [current, vision]);
  const defaultOutcomes = useMemo(() => (states || []).filter((s) => !driverIds.has(s.id) && Math.abs(s.today - s.vision) > 0.05).map((s) => s.id), [states, driverIds]);
  const chosenOutcomes = outcomes ?? defaultOutcomes;
  const leverMoves = moves.filter((m) => m.type === "lever");
  const defaultLevers = leverMoves.map((m) => m.concept);
  const chosenLevers = levers ?? defaultLevers;
  const toggle = (list, setList, base, id) => setList((cur) => { const l = cur ?? base; return l.includes(id) ? l.filter((x) => x !== id) : [...l, id]; });

  const run = () => {
    if (!vision) return;
    setRunning(true);
    setTimeout(() => {
      try {
        setResult(backcast(current, vision, simulate, settings, { outcomes: chosenOutcomes, levers: chosenLevers, structural, maxSteps, beam }));
      } finally { setRunning(false); }
    }, 20);
  };

  const box = "bg-white rounded-xl border border-slate-200 p-4";
  const H = ({ n, title, children }) => (
    <div className="flex items-start gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center shrink-0">{n}</span>
      <div><h3 className="font-semibold text-[15px] text-neutral-900">{title}</h3>{children && <p className="text-sm text-neutral-700 mt-0.5">{children}</p>}</div>
    </div>
  );

  const steps = result ? (forward ? result.steps : [...result.steps].reverse()) : [];
  return (
    <div className="space-y-5">
      <div className={box}>
        <h2 className="text-[17px] font-semibold text-neutral-900 flex items-center gap-2"><Flag size={18} className="text-violet-700" />{tr("Backcasting: from today's system to an envisioned one")}</h2>
        <p className="text-sm text-neutral-800 mt-1 max-w-4xl">{tr("Map the system as it is today (this model), then make a copy and change it into the system you want: other values, new or stronger relationships, new actors, things phased out. The method lists every difference as a possible step and searches for the order of steps that brings today's system closest to the vision. The result is read backwards: what has to be in place just before the vision, and what has to come before that.")}</p>
      </div>

      <section className={box}>
        <H n={1} title={tr("The envisioned system")}>{tr("Today's system is the open model. Choose the model that describes the vision, or create one from a copy of this map.")}</H>
        <div className="flex flex-wrap items-center gap-3">
          <select value={visionId} onChange={(e) => { setVisionId(e.target.value); setResult(null); setOutcomes(null); setLevers(null); }} className="text-sm border border-slate-300 rounded-md px-2 py-1.5 min-w-[240px]">
            <option value="">{tr("Choose the envisioned model…")}</option>
            {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button onClick={onCreateVision} className="px-3 py-1.5 rounded-md border border-violet-300 bg-violet-50 text-violet-900 text-sm hover:bg-violet-100 inline-flex items-center gap-1.5"><Sparkles size={14} />{tr("Create an envisioned version of this map")}</button>
          {visionId && <button onClick={() => onOpenModel(visionId)} className="text-sm text-lagoon-700 hover:underline">{tr("Open the vision to edit it")}</button>}
        </div>
        {diff && (
          <div className="mt-3 grid sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5"><div className="text-[13px] text-neutral-600">{tr("Concepts in both")}</div><div className="text-lg font-semibold">{diff.pairs.length}</div></div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5"><div className="text-[13px] text-neutral-600">{tr("New in the vision")}</div><div className="text-lg font-semibold">{diff.newConcepts.length}</div><div className="text-[12px] text-neutral-700 truncate">{diff.newConcepts.map((c) => c.name).join(", ")}</div></div>
            <div className="rounded-lg bg-orange-50 border border-orange-200 p-2.5"><div className="text-[13px] text-neutral-600">{tr("Gone in the vision")}</div><div className="text-lg font-semibold">{diff.removedConcepts.length}</div><div className="text-[12px] text-neutral-700 truncate">{diff.removedConcepts.map((c) => c.name).join(", ")}</div></div>
            <div className="rounded-lg bg-violet-50 border border-violet-200 p-2.5"><div className="text-[13px] text-neutral-600">{tr("Relationships changed")}</div><div className="text-lg font-semibold">{diff.edgeChanges.length}</div><div className="text-[12px] text-neutral-700">{tr("start values changed")}: {diff.valueChanges.length}</div></div>
          </div>
        )}
        {vision && diff && !diff.newConcepts.length && !diff.removedConcepts.length && !diff.edgeChanges.length && !diff.valueChanges.length && (
          <p className="mt-2 text-sm text-amber-800 flex items-center gap-1.5"><AlertTriangle size={14} />{tr("The two maps are the same. Open the vision and change it first.")}</p>
        )}
      </section>

      {diff && states && (
        <section className={box}>
          <H n={2} title={tr("What counts, and which steps are allowed")}>{tr("The outcomes define how close the system is to the vision. Measures hold a concept at the level it has in the vision; structural steps change the map itself.")}</H>
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <div className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("Outcomes")} <span className="font-normal text-neutral-600">({tr("today → vision")})</span></div>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {states.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={chosenOutcomes.includes(s.id)} onChange={() => toggle(outcomes, setOutcomes, defaultOutcomes, s.id)} className="w-4 h-4 accent-lagoon-700" />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="tabular-nums text-neutral-700">{f2(s.today)} → <strong>{f2(s.vision)}</strong></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900 mb-1.5">{tr("Measures")}</div>
                {!leverMoves.length && <p className="text-sm text-neutral-700">{tr("No driver has another value in the vision.")}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {leverMoves.map((m) => (
                    <label key={m.id} className={`text-[13px] px-2.5 py-1 rounded-full border cursor-pointer ${chosenLevers.includes(m.concept) ? "bg-sky-50 border-sky-400 text-sky-900" : "border-slate-300 text-neutral-700"}`}>
                      <input type="checkbox" className="hidden" checked={chosenLevers.includes(m.concept)} onChange={() => toggle(levers, setLevers, defaultLevers, m.concept)} />{moveLabel(m, nameOf)}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-900"><input type="checkbox" checked={structural} onChange={(e) => setStructural(e.target.checked)} className="w-4 h-4 accent-lagoon-700" />{tr("Allow structural steps (new elements, phasing out, changing links)")} <span className="text-neutral-600">({moves.filter((m) => m.type !== "lever").length})</span></label>
              <div className="flex flex-wrap gap-4 text-sm text-neutral-900">
                <label className="flex items-center gap-2">{tr("Maximum number of steps")}<input type="number" min={1} max={15} value={maxSteps} onChange={(e) => setMaxSteps(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} className="w-16 border border-slate-300 rounded px-1.5 py-0.5" /></label>
                <label className="flex items-center gap-2">{tr("Search width")}<select value={beam} onChange={(e) => setBeam(Number(e.target.value))} className="border border-slate-300 rounded px-1.5 py-0.5"><option value={1}>1 ({tr("fastest")})</option><option value={3}>3</option><option value={5}>5 ({tr("most thorough")})</option></select></label>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={run} disabled={running || !chosenOutcomes.length} className="px-4 py-2 rounded-md bg-lagoon-700 text-white text-sm font-semibold hover:bg-lagoon-800 disabled:opacity-40 inline-flex items-center gap-1.5"><Play size={14} />{running ? tr("Searching…") : tr("Find the path")}</button>
            {!chosenOutcomes.length && <span className="text-sm text-amber-800">{tr("Choose at least one outcome.")}</span>}
          </div>
        </section>
      )}

      {result && (
        <section className={box}>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="font-semibold text-[15px] text-neutral-900">{tr("The path from today to the vision")}</h3>
              <p className="text-sm text-neutral-800 mt-0.5">
                {tr("{n} steps close {p} of the distance to the vision (from {a} to {b}).", { n: result.steps.length, p: pct(result.closed), a: f2(result.gapStart), b: f2(result.gapEnd) })}{" "}
                {tr("With every possible step together the distance would be {c}.", { c: f2(result.gapAllSteps) })}
              </p>
            </div>
            <button onClick={() => setForward((v) => !v)} className="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1.5">{forward ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{forward ? tr("Read backwards (from the vision)") : tr("Read forwards (from today)")}</button>
          </div>

          <ol className="relative border-l-2 border-violet-200 ml-3 space-y-3">
            {!forward && (
              <li className="ml-5">
                <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-violet-600" />
                <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
                  <div className="text-sm font-semibold text-violet-900">{tr("The vision")}</div>
                  <div className="text-[13px] text-neutral-800 mt-1">{result.outcomes.slice(0, 6).map((id) => `${nameOf(id)} ${f2(result.targets[id])}`).join(" · ")}</div>
                </div>
              </li>
            )}
            {steps.map((s) => (
              <li key={s.move.id} className="ml-5">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-white border-2 border-violet-500" />
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-neutral-600">{tr("Step")} {s.index}</span>
                    <span className={`text-[12px] px-2 py-0.5 rounded-full ${TYPE[s.move.type].tone}`}>{tr(TYPE[s.move.type].label)}</span>
                    <span className="text-sm font-semibold text-neutral-900">{moveLabel(s.move, nameOf)}</span>
                    {!s.converged && <span className="text-[12px] text-amber-800 inline-flex items-center gap-1"><AlertTriangle size={12} />{tr("did not settle")}</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13px] text-neutral-800">
                    <span>{tr("closes {p} of the distance", { p: pct(s.added) })}</span>
                    <span className="text-neutral-500">·</span>
                    <span>{tr("after this step: {p} closed", { p: pct(s.closed) })}</span>
                    <span className="text-neutral-500">·</span>
                    <span title={tr("How much further from the vision the end state would be without this step")}>{tr("needed: {v}", { v: f2(s.importance) })}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-violet-500" style={{ width: pct(s.closed) }} /></div>
                  <div className="mt-1.5 text-[12px] text-neutral-600">{tr("Milestones")}: {result.outcomes.slice(0, 5).map((id) => `${nameOf(id)} ${f2(s.milestones[id])}`).join(" · ")}</div>
                </div>
              </li>
            ))}
            {!result.steps.length && <li className="ml-5 text-sm text-neutral-800">{tr("No step brings today's system closer to the vision. Check that the vision differs in drivers or structure, and that the outcomes are the ones that differ.")}</li>}
            <li className="ml-5">
              <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-slate-500" />
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                <div className="text-sm font-semibold text-neutral-900">{tr("Today")}</div>
                <div className="text-[13px] text-neutral-800 mt-1">{result.outcomes.slice(0, 6).map((id) => `${nameOf(id)} ${f2(result.today[id])}`).join(" · ")}</div>
              </div>
            </li>
            {forward && (
              <li className="ml-5">
                <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-violet-600" />
                <div className="rounded-lg bg-violet-50 border border-violet-200 p-3"><div className="text-sm font-semibold text-violet-900">{tr("The vision")}</div></div>
              </li>
            )}
          </ol>

          <h4 className="mt-5 mb-1.5 text-sm font-semibold text-neutral-900">{tr("Outcomes: today, at the end of the path, and in the vision")}</h4>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[13px] text-neutral-600 border-b border-slate-200"><th className="py-1 font-medium">{tr("Concept")}</th><th className="py-1 font-medium text-right">{tr("Today")}</th><th className="py-1 font-medium text-right">{tr("End of the path")}</th><th className="py-1 font-medium text-right">{tr("Vision")}</th><th className="py-1 font-medium text-right">{tr("Still to go")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {result.outcomes.map((id) => {
                const left = (result.targets[id] ?? 0) - (result.reached[id] ?? 0);
                return <tr key={id}><td className="py-1">{nameOf(id)}</td><td className="text-right tabular-nums">{f2(result.today[id])}</td><td className="text-right tabular-nums font-medium">{f2(result.reached[id])}</td><td className="text-right tabular-nums">{f2(result.targets[id])}</td><td className={`text-right tabular-nums ${Math.abs(left) > 0.1 ? "text-orange-700 font-medium" : "text-neutral-600"}`}>{Math.abs(left) < 0.005 ? <Check size={14} className="inline text-lagoon-700" /> : f2(left)}</td></tr>;
              })}
            </tbody>
          </table>

          {result.unused.length > 0 && (
            <p className="mt-4 text-[13px] text-neutral-700"><strong>{tr("Not needed on this path")}:</strong> {result.unused.map((m) => moveLabel(m, nameOf)).join("; ")}.</p>
          )}
          <p className="mt-3 text-[13px] text-neutral-600">{tr("Method: every difference between the maps is a possible step; a beam search adds one step at a time and keeps the paths that bring the settled state closest to the vision, measured as the mean absolute distance over the chosen outcomes. Drivers are held at their values in both maps. Steps are phases, not periods of time. Runs: {r}; runs that did not settle: {u}.", { r: result.runs, u: result.unsettled })}</p>
        </section>
      )}
    </div>
  );
}
