// ============================================================================
// Workshop mode: prepare a workshop, then run it step by step
// ============================================================================
// A facilitator builds an agenda from ready-made blocks (collect concepts,
// draw relationships, run the baseline, test scenarios, ...), each with a
// duration, a prompt for the participants and private notes. The planner
// checks whether the model is ready for each block (a scenario block needs
// scenarios, a combine block needs several maps) and prints a facilitator
// script and a participant handout. During the workshop a slim bar shows the
// current step, its prompt and a timer; Next opens the tab the step needs.
//
// The plan is kept per model in this browser:
//   spaghetti-engine:workshop:v1:<modelId>   { title, question, date, participants, steps }
import React, { useEffect, useMemo, useState } from "react";
import {
  Users, X, Plus, Trash2, ArrowUp, ArrowDown, Printer, Play, Pause, RotateCcw,
  SkipBack, SkipForward, Check, AlertTriangle, ClipboardList, Timer, Maximize2, ChevronDown, ChevronRight,
} from "lucide-react";

const KEY = (id) => `spaghetti-engine:workshop:v1:${id}`;
export function loadWorkshop(modelId) {
  try { const raw = localStorage.getItem(KEY(modelId)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export function saveWorkshop(modelId, plan) {
  try { localStorage.setItem(KEY(modelId), JSON.stringify(plan)); } catch { /* storage unavailable: the plan lasts this session */ }
}

// The building blocks of an agenda. `tab` is the tab the step opens,
// `action` something else to open, `check` says what the model still lacks.
export const WORKSHOP_BLOCKS = [
  { id: "welcome", title: "Welcome and central question", minutes: 10, kind: "talk",
    prompt: "Welcome. Today we look together at the question on the screen. There are no wrong answers: we want to understand how you see the system.",
    notes: "Introduce yourself and the aim. Agree on how the results will be used." },
  { id: "intro", title: "What is a cognitive map?", minutes: 10, kind: "talk", tab: "network",
    prompt: "A cognitive map shows the factors that matter (concepts) and how one raises or lowers another (relationships). Running the map shows how the whole system responds when something changes.",
    notes: "Show a small example map, or draw two or three concepts live." },
  { id: "concepts", title: "Collect concepts", minutes: 20, kind: "build", tab: "editor",
    prompt: "Which factors influence the central question, directly or indirectly? Name them as things that can increase or decrease.",
    notes: "Let people write on sticky notes first, then enter them. Aim for 10 to 25 concepts. Merge duplicates as you go.",
    check: ({ concepts }) => (concepts.length ? null : "The model has no concepts yet. That is fine if the group builds it from scratch.") },
  { id: "modules", title: "Group concepts into modules", minutes: 10, kind: "build", tab: "editor",
    prompt: "Which concepts belong together? Give each group a name, for example Water, Farming or Policy.",
    notes: "Modules make the map easier to read and allow analysis per subsystem." },
  { id: "relationships", title: "Draw relationships", minutes: 25, kind: "build", tab: "network",
    prompt: "Which factor directly influences which other factor? Does it make it go up (+) or down (-)?",
    notes: "Ask for direct effects only. Write down the reasoning in the relationship description.",
    check: ({ concepts }) => (concepts.length >= 2 ? null : "Add at least two concepts before this step, or plan a concept step first.") },
  { id: "weights", title: "Agree on strengths", minutes: 15, kind: "build", tab: "editor",
    prompt: "How strong is each relationship: weak, moderate or strong?",
    notes: "Discuss disagreements rather than averaging them away. Note open points.",
    check: ({ edges }) => (edges.length ? null : "There are no relationships yet to weigh.") },
  { id: "check", title: "Check the map together", minutes: 10, kind: "build", tab: "editor",
    prompt: "Is anything missing? Is every concept connected? Does the map tell the story you recognise?",
    notes: "Use the Model check at the top of the Model editor." },
  { id: "levers", title: "Find the key levers", minutes: 15, kind: "analyse", tab: "metrics",
    prompt: "Which factors influence many others, and which mostly respond? Do the results match your experience?",
    notes: "Centrality and transmitters/receivers. Ask the group to explain surprises.",
    check: ({ edges }) => (edges.length >= 3 ? null : "The map needs relationships before the levers can be found.") },
  { id: "baseline", title: "Where does the system settle?", minutes: 10, kind: "analyse", tab: "equilibrium",
    prompt: "If nothing changes, where does the system end up? Is this the future you expect?",
    notes: "Run the baseline beforehand to know what will come out. Check that the start values describe today.",
    check: ({ concepts }) => (concepts.some((c) => Math.abs(c.initialValue || 0) > 1e-9) ? null : "Every start value is 0, so nothing will move. Give the concepts that describe today a start value.") },
  { id: "scenarios", title: "What if ...?", minutes: 25, kind: "analyse", tab: "scenarios",
    prompt: "Which measures or developments do you want to test? What happens to the outcomes you care about?",
    notes: "Prepare two or three scenarios in advance and let the group propose one more.",
    check: ({ scenarios }) => (scenarios.filter((s) => s.id !== "baseline").length ? null : "No scenarios prepared yet. Make them on the Scenarios & Simulation tab.") },
  { id: "transition", title: "How much effort is enough?", minutes: 20, kind: "analyse", tab: "transition", advanced: true,
    prompt: "From which intensity does extra effort on this measure pay off less?",
    notes: "Run the analysis beforehand for the main measure. Explain the key findings, not the method." },
  { id: "pathways", title: "Compare pathways", minutes: 20, kind: "analyse", tab: "pathways", advanced: true,
    prompt: "Which combination and order of measures brings us closest to where we want to be?",
    notes: "Prepare the candidate measures and outcome weights in advance." },
  { id: "combine", title: "Compare individual maps", minutes: 25, kind: "analyse", action: "combine",
    prompt: "Where do our maps agree, and where do they differ? Let us discuss the relationships with opposite signs.",
    notes: "Collect each participant's map as a .json file and import them first.",
    check: ({ models }) => (models >= 2 ? null : "Only one map in the library. Import the participants' maps before the workshop.") },
  { id: "break", title: "Break", minutes: 15, kind: "talk", prompt: "Break.", notes: "" },
  { id: "reflect", title: "Reflection and next steps", minutes: 15, kind: "talk",
    prompt: "What did we learn? What surprised you? What should happen next?",
    notes: "Export the model (Export JSON) and the figures you need for the report." },
];
const BLOCK = Object.fromEntries(WORKSHOP_BLOCKS.map((b) => [b.id, b]));
export const WORKSHOP_BLOCK_TARGETS = BLOCK;
const KIND = {
  talk: { label: "Discussion", tone: "bg-slate-100 text-slate-800" },
  build: { label: "Building", tone: "bg-lagoon-50 text-lagoon-800" },
  analyse: { label: "Analysis", tone: "bg-sky-50 text-sky-800" },
};

export const WORKSHOP_TEMPLATES = [
  { id: "explore", title: "Map a system together", length: "about 2 hours", text: "Build a shared map from scratch and see what it implies.",
    blocks: ["welcome", "intro", "concepts", "modules", "break", "relationships", "weights", "baseline", "reflect"] },
  { id: "interventions", title: "Test interventions", length: "about 2 hours", text: "Start from a prepared map and explore measures with the group.",
    blocks: ["welcome", "intro", "check", "levers", "baseline", "break", "scenarios", "transition", "reflect"] },
  { id: "compare", title: "Compare stakeholder views", length: "about 2.5 hours", text: "Participants draw their own maps, which are then combined and discussed.",
    blocks: ["welcome", "intro", "concepts", "relationships", "break", "combine", "baseline", "reflect"] },
];

let seq = 0;
const stepOf = (blockId) => { const b = BLOCK[blockId]; seq += 1; return { uid: `s${Date.now().toString(36)}${seq}`, block: blockId, title: b.title, minutes: b.minutes, prompt: b.prompt, notes: b.notes }; };
export const newWorkshopPlan = (modelName, templateId = "explore") => ({
  title: `Workshop: ${modelName || "my model"}`, question: "", date: "", participants: "",
  steps: (WORKSHOP_TEMPLATES.find((t) => t.id === templateId) || WORKSHOP_TEMPLATES[0]).blocks.map(stepOf),
});

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`);
const clock = (start, add) => {
  if (!/^\d{1,2}:\d{2}$/.test(start || "")) return null;
  const [h, m] = start.split(":").map(Number);
  const t = h * 60 + m + add;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// A plain printable page: the facilitator script (with notes and readiness)
// or the participant handout (question and prompts only).
function printPlan(plan, { facilitator, warnings }) {
  let at = 0;
  const rows = plan.steps.map((s, i) => {
    const from = clock(plan.start, at); at += Number(s.minutes) || 0;
    const warn = facilitator && warnings[s.uid] ? `<p class="warn">To prepare: ${esc(warnings[s.uid])}</p>` : "";
    return `<section><h2><span class="n">${i + 1}</span>${esc(s.title)}<span class="t">${from ? `${from}, ` : ""}${esc(s.minutes)} min</span></h2>
      <p class="prompt">${esc(s.prompt)}</p>${facilitator && s.notes ? `<p class="notes"><b>Notes:</b> ${esc(s.notes)}</p>` : ""}${warn}</section>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.title)}</title><style>
    body{font-family:Inter,Arial,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px;line-height:1.45}
    h1{font-size:24px;margin:0 0 4px} .meta{color:#444;margin:0 0 18px} .q{font-size:18px;border-left:4px solid #137d78;padding:8px 12px;background:#f0f9f8;margin:0 0 20px}
    section{border-top:1px solid #ddd;padding:10px 0;break-inside:avoid} h2{font-size:16px;margin:0 0 4px;display:flex;gap:8px;align-items:baseline}
    .n{display:inline-block;min-width:22px;height:22px;border-radius:11px;background:#137d78;color:#fff;text-align:center;font-size:13px;line-height:22px}
    .t{margin-left:auto;color:#555;font-weight:normal;font-size:14px} .prompt{margin:2px 0} .notes{margin:4px 0;color:#333;font-size:14px}
    .warn{margin:4px 0;color:#9a3412;font-size:14px} .lines{height:90px;border-bottom:1px dotted #aaa}
  </style></head><body>
    <h1>${esc(plan.title)}</h1>
    <p class="meta">${[plan.date, plan.start ? `from ${plan.start}` : "", plan.participants, `${fmtMin(plan.steps.reduce((t, s) => t + (Number(s.minutes) || 0), 0))} in total`].filter(Boolean).map(esc).join(" · ")}${facilitator ? " · Facilitator script" : ""}</p>
    ${plan.question ? `<p class="q"><b>Central question:</b> ${esc(plan.question)}</p>` : ""}
    ${rows}
    ${facilitator ? "" : `<section><h2>Your notes</h2><div class="lines"></div></section>`}
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* the page stays open to print by hand */ } }, 300);
  return true;
}

export function WorkshopPlanner({ plan, setPlan, modelName, ctx, onStart, onClose, notify }) {
  const [adding, setAdding] = useState(false);
  const [openNotes, setOpenNotes] = useState(null);
  const total = plan.steps.reduce((t, s) => t + (Number(s.minutes) || 0), 0);
  const warnings = useMemo(() => Object.fromEntries(plan.steps.map((s) => [s.uid, BLOCK[s.block]?.check?.(ctx) || null]).filter(([, w]) => w)), [plan.steps, ctx]);
  const set = (patch) => setPlan({ ...plan, ...patch });
  const setStep = (uid, patch) => set({ steps: plan.steps.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) });
  const move = (i, d) => { const st = [...plan.steps]; const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; set({ steps: st }); };
  const applyTemplate = (t) => set({ steps: t.blocks.map(stepOf) });
  const print = (facilitator) => { if (!printPlan(plan, { facilitator, warnings })) notify("The print page was blocked by the browser. Allow pop-ups for this site and try again."); };
  let at = 0;

  const input = "w-full text-sm text-neutral-900 border border-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-lagoon-300";
  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/40 flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="se-ws-title" className="bg-[#f7f9f9] rounded-xl shadow-xl border border-slate-200 max-w-5xl w-full max-h-[92vh] flex flex-col"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 bg-white rounded-t-xl border-b border-slate-200">
          <div>
            <h2 id="se-ws-title" className="se-display text-lg font-bold text-neutral-900 flex items-center gap-2"><Users size={19} className="text-coral-600" />Prepare a workshop</h2>
            <p className="text-sm text-neutral-700">Build the agenda, check that the model is ready for each step, then run it step by step with the group.</p>
          </div>
          <button onClick={onClose} className="text-neutral-600 hover:text-neutral-900" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-auto p-5 grid lg:grid-cols-[300px_1fr] gap-5">
          {/* the workshop itself */}
          <div className="space-y-4">
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <label className="block text-[13px] font-medium text-neutral-800">Title<input value={plan.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1`} /></label>
              <label className="block text-[13px] font-medium text-neutral-800">Central question
                <textarea value={plan.question} onChange={(e) => set({ question: e.target.value })} rows={3} placeholder="e.g. How can peat meadows stay productive while emissions fall?" className={`${input} mt-1 resize-y`} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[13px] font-medium text-neutral-800">Date<input type="date" value={plan.date} onChange={(e) => set({ date: e.target.value })} className={`${input} mt-1`} /></label>
                <label className="block text-[13px] font-medium text-neutral-800">Start time<input type="time" value={plan.start || ""} onChange={(e) => set({ start: e.target.value })} className={`${input} mt-1`} /></label>
              </div>
              <label className="block text-[13px] font-medium text-neutral-800">Participants<input value={plan.participants} onChange={(e) => set({ participants: e.target.value })} placeholder="e.g. 12 farmers and water board staff" className={`${input} mt-1`} /></label>
              <p className="text-[13px] text-neutral-700">Model: <strong>{modelName}</strong></p>
            </section>
            <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-neutral-900">Start from a template</h3>
              {WORKSHOP_TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => applyTemplate(t)} className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-lagoon-400 hover:bg-lagoon-50">
                  <span className="block text-sm font-medium text-neutral-900">{t.title} <span className="font-normal text-neutral-600">({t.length})</span></span>
                  <span className="block text-[13px] text-neutral-700">{t.text}</span>
                </button>
              ))}
              <p className="text-[13px] text-neutral-600">A template replaces the agenda on the right.</p>
            </section>
          </div>

          {/* the agenda */}
          <section className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="se-display text-[16px] font-bold text-neutral-900">Agenda</h3>
              <span className="text-sm text-neutral-700">{plan.steps.length} steps, {fmtMin(total)}{plan.start && clock(plan.start, total) ? `, ${plan.start} to ${clock(plan.start, total)}` : ""}</span>
              {Object.keys(warnings).length > 0
                ? <span className="ml-auto text-[13px] text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 inline-flex items-center gap-1"><AlertTriangle size={13} />{Object.keys(warnings).length} step{Object.keys(warnings).length === 1 ? "" : "s"} to prepare</span>
                : plan.steps.length > 0 && <span className="ml-auto text-[13px] text-lagoon-800 bg-lagoon-50 border border-lagoon-200 rounded-full px-2.5 py-0.5 inline-flex items-center gap-1"><Check size={13} />The model is ready</span>}
            </div>
            <ol className="space-y-2">
              {plan.steps.map((s, i) => {
                const b = BLOCK[s.block] || {};
                const from = clock(plan.start, at); at += Number(s.minutes) || 0;
                return (
                  <li key={s.uid} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-lagoon-700 text-white text-[13px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                      <input value={s.title} onChange={(e) => setStep(s.uid, { title: e.target.value })} aria-label="Step title" className="flex-1 min-w-0 text-sm font-semibold text-neutral-900 border border-transparent hover:border-slate-200 focus:border-lagoon-500 focus:outline-none rounded px-1.5 py-0.5" />
                      <span className={`hidden sm:inline text-[12px] px-2 py-0.5 rounded-full ${KIND[b.kind]?.tone || KIND.talk.tone}`}>{KIND[b.kind]?.label || "Discussion"}</span>
                      {from && <span className="text-[13px] text-neutral-600 tabular-nums">{from}</span>}
                      <label className="flex items-center gap-1 text-[13px] text-neutral-700"><input type="number" min={1} max={240} value={s.minutes} onChange={(e) => setStep(s.uid, { minutes: Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1))) })} className="w-14 text-sm border border-slate-300 rounded px-1.5 py-0.5 text-right" aria-label="Minutes" />min</label>
                      <span className="flex shrink-0">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded text-neutral-600 hover:bg-slate-100 disabled:opacity-30" aria-label="Move up"><ArrowUp size={14} /></button>
                        <button onClick={() => move(i, 1)} disabled={i === plan.steps.length - 1} className="p-1 rounded text-neutral-600 hover:bg-slate-100 disabled:opacity-30" aria-label="Move down"><ArrowDown size={14} /></button>
                        <button onClick={() => set({ steps: plan.steps.filter((x) => x.uid !== s.uid) })} className="p-1 rounded text-neutral-600 hover:text-red-600 hover:bg-red-50" aria-label="Remove this step"><Trash2 size={14} /></button>
                      </span>
                    </div>
                    <textarea value={s.prompt} onChange={(e) => setStep(s.uid, { prompt: e.target.value })} rows={2} aria-label="Prompt for the participants"
                      className="w-full text-[13px] text-neutral-900 border border-slate-200 rounded px-2 py-1 resize-y focus:outline-none focus:ring-1 focus:ring-lagoon-500" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                      <button onClick={() => setOpenNotes((o) => (o === s.uid ? null : s.uid))} className="text-neutral-700 hover:text-lagoon-800 inline-flex items-center gap-1">
                        {openNotes === s.uid ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Facilitator notes{s.notes && openNotes !== s.uid ? ": " : ""}<span className="text-neutral-500 truncate max-w-[320px]">{openNotes !== s.uid ? s.notes : ""}</span>
                      </button>
                      {(b.tab || b.action) && <span className="text-neutral-600">Opens: {b.action === "combine" ? "Combine maps" : TAB_LABEL[b.tab] || b.tab}</span>}
                    </div>
                    {openNotes === s.uid && (
                      <textarea value={s.notes} onChange={(e) => setStep(s.uid, { notes: e.target.value })} rows={2} aria-label="Facilitator notes" autoFocus
                        className="w-full text-[13px] text-neutral-900 bg-amber-50/50 border border-amber-200 rounded px-2 py-1 resize-y focus:outline-none" />
                    )}
                    {warnings[s.uid] && <p className="text-[13px] text-amber-800 flex items-start gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{warnings[s.uid]}</p>}
                  </li>
                );
              })}
            </ol>
            {adding ? (
              <div className="bg-white rounded-xl border border-lagoon-300 p-3">
                <div className="flex items-center justify-between mb-2"><h4 className="text-sm font-semibold text-neutral-900">Add a step</h4><button onClick={() => setAdding(false)} className="text-neutral-600" aria-label="Close"><X size={15} /></button></div>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {WORKSHOP_BLOCKS.map((b) => (
                    <button key={b.id} onClick={() => { set({ steps: [...plan.steps, stepOf(b.id)] }); setAdding(false); }} className="text-left rounded-lg border border-slate-200 px-3 py-1.5 hover:border-lagoon-400 hover:bg-lagoon-50">
                      <span className="flex items-center gap-2 text-sm text-neutral-900">{b.title}<span className={`ml-auto text-[12px] px-1.5 rounded-full ${KIND[b.kind].tone}`}>{KIND[b.kind].label}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-lagoon-800 hover:border-lagoon-400 hover:bg-white inline-flex items-center justify-center gap-1.5"><Plus size={15} />Add a step</button>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 bg-white rounded-b-xl border-t border-slate-200">
          <button onClick={() => print(true)} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-1.5"><ClipboardList size={15} />Print facilitator script</button>
          <button onClick={() => print(false)} className="px-3 py-1.5 rounded-md border border-slate-300 text-sm text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-1.5"><Printer size={15} />Print participant handout</button>
          <span className="ml-auto text-[13px] text-neutral-600 hidden md:inline">Saved with this model, in this browser.</span>
          <button onClick={onStart} disabled={!plan.steps.length} className="px-4 py-1.5 rounded-md bg-coral-500 text-white text-sm font-semibold hover:bg-coral-600 disabled:opacity-40 inline-flex items-center gap-1.5"><Play size={15} />Start the workshop</button>
        </div>
      </div>
    </div>
  );
}

const TAB_LABEL = {
  editor: "Model editor", network: "Network", metrics: "Influence Metrics", equilibrium: "Baseline Equilibrium",
  scenarios: "Scenarios & Simulation", transition: "Transition Point Analysis", pathways: "Transition Pathways",
};

// The bar shown during the workshop, under the top bar.
export function WorkshopRunBar({ plan, index, setIndex, onGo, onEdit, onEnd }) {
  const step = plan.steps[index];
  const [left, setLeft] = useState((Number(step?.minutes) || 0) * 60);
  const [running, setRunning] = useState(false);
  const [slide, setSlide] = useState(false);
  useEffect(() => { setLeft((Number(step?.minutes) || 0) * 60); setRunning(false); }, [index, step?.minutes]);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!step) return null;
  const go = (i) => { setIndex(i); onGo(plan.steps[i]); };
  const over = left < 0;
  const mmss = `${over ? "-" : ""}${Math.floor(Math.abs(left) / 60)}:${String(Math.abs(left) % 60).padStart(2, "0")}`;

  return (
    <>
      <div className="relative z-30 bg-ink text-white px-3 sm:px-5 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2" role="region" aria-label="Workshop">
        <div className="flex items-center gap-2 shrink-0">
          <Users size={16} className="text-coral-300" />
          <span className="text-[13px] text-slate-300">Step {index + 1} of {plan.steps.length}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{step.title}</div>
          <div className="text-[14px] text-slate-200 line-clamp-2">{step.prompt}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`inline-flex items-center gap-1 font-mono text-[15px] tabular-nums px-2 py-0.5 rounded ${over ? "bg-coral-500 text-white" : "bg-white/10"}`} title="Time left for this step"><Timer size={14} />{mmss}</span>
          <button onClick={() => setRunning((r) => !r)} className="p-1.5 rounded hover:bg-white/10" aria-label={running ? "Pause the timer" : "Start the timer"} title={running ? "Pause" : "Start the timer"}>{running ? <Pause size={15} /> : <Play size={15} />}</button>
          <button onClick={() => { setLeft((Number(step.minutes) || 0) * 60); setRunning(false); }} className="p-1.5 rounded hover:bg-white/10" aria-label="Reset the timer" title="Reset the timer"><RotateCcw size={14} /></button>
          <span className="w-px h-5 bg-white/20 mx-1" aria-hidden="true" />
          <button onClick={() => setSlide(true)} className="p-1.5 rounded hover:bg-white/10" aria-label="Show the question and prompt full screen" title="Show full screen for the group"><Maximize2 size={15} /></button>
          <button onClick={() => go(index - 1)} disabled={index === 0} className="px-2 py-1 rounded hover:bg-white/10 disabled:opacity-30 inline-flex items-center gap-1 text-sm"><SkipBack size={14} />Back</button>
          {index < plan.steps.length - 1
            ? <button onClick={() => go(index + 1)} className="px-3 py-1 rounded bg-coral-500 hover:bg-coral-600 inline-flex items-center gap-1 text-sm font-semibold">Next<SkipForward size={14} /></button>
            : <button onClick={onEnd} className="px-3 py-1 rounded bg-coral-500 hover:bg-coral-600 inline-flex items-center gap-1 text-sm font-semibold"><Check size={14} />Finish</button>}
          <button onClick={onEdit} className="px-2 py-1 rounded hover:bg-white/10 text-sm text-slate-200">Agenda</button>
          <button onClick={onEnd} className="p-1.5 rounded hover:bg-white/10" aria-label="End the workshop" title="End the workshop"><X size={15} /></button>
        </div>
      </div>
      {slide && (
        <div className="fixed inset-0 z-[70] bg-ink text-white flex flex-col items-center justify-center p-8 text-center" onClick={() => setSlide(false)} role="dialog" aria-label="Workshop step, full screen">
          {plan.question && <p className="text-lg sm:text-2xl text-lagoon-200 max-w-4xl mb-8">{plan.question}</p>}
          <p className="text-[15px] uppercase tracking-[0.15em] text-coral-300 mb-3">Step {index + 1} · {step.title}</p>
          <p className="se-display text-3xl sm:text-5xl font-bold leading-tight max-w-5xl">{step.prompt}</p>
          <p className="mt-10 font-mono text-2xl text-slate-300">{mmss}</p>
          <p className="mt-6 text-sm text-slate-400">Click anywhere to return to the tool</p>
        </div>
      )}
    </>
  );
}
