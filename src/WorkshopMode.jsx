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

// A numbered heading for the three parts of the planner.
function PlannerHeading({ n, title, children }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-ink text-white text-sm font-bold flex items-center justify-center shrink-0">{n}</span>
      <div className="min-w-0">
        <h3 className="se-display text-[17px] font-bold text-neutral-900 leading-tight">{title}</h3>
        {children && <p className="text-sm text-neutral-700 mt-0.5">{children}</p>}
      </div>
    </div>
  );
}

export function WorkshopPlanner({ plan, setPlan, modelName, ctx, onStart, onClose, notify }) {
  const [adding, setAdding] = useState(false);
  const [openStep, setOpenStep] = useState(null);
  const total = plan.steps.reduce((t, s) => t + (Number(s.minutes) || 0), 0);
  const warnings = useMemo(() => Object.fromEntries(plan.steps.map((s) => [s.uid, BLOCK[s.block]?.check?.(ctx) || null]).filter(([, w]) => w)), [plan.steps, ctx]);
  const set = (patch) => setPlan({ ...plan, ...patch });
  const setStep = (uid, patch) => set({ steps: plan.steps.map((s) => (s.uid === uid ? { ...s, ...patch } : s)) });
  const move = (i, d) => { const st = [...plan.steps]; const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; set({ steps: st }); };
  const applyTemplate = (t) => { set({ steps: t.blocks.map(stepOf) }); setOpenStep(null); };
  const print = (facilitator) => { if (!printPlan(plan, { facilitator, warnings })) notify("The print page was blocked by the browser. Allow pop-ups for this site and try again."); };
  const nWarn = Object.keys(warnings).length;
  let at = 0;

  const input = "w-full text-[15px] text-neutral-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lagoon-300";
  const label = "block text-sm font-semibold text-neutral-800";
  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/40 flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="se-ws-title" className="bg-[#f7f9f9] rounded-2xl shadow-xl border border-slate-200 max-w-5xl w-full max-h-[94vh] flex flex-col"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 bg-white rounded-t-2xl border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-coral-500 text-white flex items-center justify-center shrink-0"><Users size={20} /></span>
            <div>
              <h2 id="se-ws-title" className="se-display text-xl font-bold text-neutral-900">Prepare a workshop</h2>
              <p className="text-sm text-neutral-700">Build the agenda, check that the model is ready for each step, then run it step by step with the group.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="overflow-auto px-6 py-5 space-y-6">
          {/* 1. the workshop itself */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <PlannerHeading n={1} title="The workshop">Model: <strong>{modelName}</strong></PlannerHeading>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <label className={label}>Title<input value={plan.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1.5`} /></label>
                <label className={label}>Participants<input value={plan.participants} onChange={(e) => set({ participants: e.target.value })} placeholder="e.g. 12 farmers and water board staff" className={`${input} mt-1.5`} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={label}>Date<input type="date" value={plan.date} onChange={(e) => set({ date: e.target.value })} className={`${input} mt-1.5`} /></label>
                  <label className={label}>Start time<input type="time" value={plan.start || ""} onChange={(e) => set({ start: e.target.value })} className={`${input} mt-1.5`} /></label>
                </div>
              </div>
              <label className={`${label} flex flex-col`}>Central question
                <textarea value={plan.question} onChange={(e) => set({ question: e.target.value })} placeholder="e.g. How can peat meadows stay productive while emissions fall?" className={`${input} mt-1.5 flex-1 min-h-[120px] resize-y`} />
              </label>
            </div>
          </section>

          {/* 2. the agenda */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <PlannerHeading n={2} title="The agenda">
                {plan.steps.length} steps, {fmtMin(total)}{plan.start && clock(plan.start, total) ? `, ${plan.start} to ${clock(plan.start, total)}` : ""}. Click a step to change its prompt and notes.
              </PlannerHeading>
              {nWarn > 0
                ? <span className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 inline-flex items-center gap-1.5"><AlertTriangle size={14} />{nWarn} step{nWarn === 1 ? "" : "s"} to prepare</span>
                : plan.steps.length > 0 && <span className="text-sm text-lagoon-900 bg-lagoon-50 border border-lagoon-200 rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Check size={14} />The model is ready</span>}
            </div>

            <div className="mb-4">
              <div className="text-sm font-semibold text-neutral-800 mb-2">Start from a template <span className="font-normal text-neutral-600">(replaces the agenda below)</span></div>
              <div className="grid sm:grid-cols-3 gap-2">
                {WORKSHOP_TEMPLATES.map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)} className="text-left rounded-xl border border-slate-200 px-3.5 py-2.5 hover:border-lagoon-400 hover:bg-lagoon-50">
                    <span className="block text-[15px] font-semibold text-neutral-900">{t.title}</span>
                    <span className="block text-[13px] text-neutral-600">{t.length}</span>
                    <span className="block text-sm text-neutral-700 mt-1">{t.text}</span>
                  </button>
                ))}
              </div>
            </div>

            <ol className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {plan.steps.map((s, i) => {
                const b = BLOCK[s.block] || {};
                const from = clock(plan.start, at); at += Number(s.minutes) || 0;
                const open = openStep === s.uid;
                const kind = KIND[b.kind] || KIND.talk;
                return (
                  <li key={s.uid} className={open ? "bg-lagoon-50/40" : "bg-white"}>
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <button onClick={() => setOpenStep(open ? null : s.uid)} aria-expanded={open} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <span className="w-7 h-7 rounded-full bg-lagoon-700 text-white text-[13px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        {plan.start && <span className="w-12 shrink-0 text-sm text-neutral-600 tabular-nums">{from}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-neutral-900 truncate">{s.title}</span>
                          {!open && <span className="block text-sm text-neutral-600 truncate">{s.prompt}</span>}
                        </span>
                        {warnings[s.uid] && <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-label="To prepare" />}
                        <span className={`hidden sm:inline shrink-0 text-[13px] px-2.5 py-0.5 rounded-full ${kind.tone}`}>{kind.label}</span>
                      </button>
                      <label className="shrink-0 flex items-center gap-1.5 text-sm text-neutral-700">
                        <input type="number" min={1} max={240} value={s.minutes} onChange={(e) => setStep(s.uid, { minutes: Math.max(1, Math.min(240, Math.round(Number(e.target.value) || 1))) })} className="w-16 text-[15px] border border-slate-300 rounded-lg px-2 py-1 text-right" aria-label={`Minutes for ${s.title}`} />min
                      </label>
                      <button onClick={() => setOpenStep(open ? null : s.uid)} className="shrink-0 p-1 rounded text-neutral-500 hover:text-neutral-900" aria-label={open ? "Close this step" : "Open this step"}>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
                    </div>
                    {open && (
                      <div className="px-4 pb-4 pt-1 sm:pl-14 space-y-3">
                        <label className={label}>Step title<input value={s.title} onChange={(e) => setStep(s.uid, { title: e.target.value })} className={`${input} mt-1.5`} /></label>
                        <label className={label}>What participants are asked
                          <textarea value={s.prompt} onChange={(e) => setStep(s.uid, { prompt: e.target.value })} rows={3} className={`${input} mt-1.5 resize-y`} />
                        </label>
                        <label className={label}>Your notes <span className="font-normal text-neutral-600">(only in the facilitator script)</span>
                          <textarea value={s.notes} onChange={(e) => setStep(s.uid, { notes: e.target.value })} rows={2} className={`${input} mt-1.5 resize-y bg-amber-50/40`} />
                        </label>
                        {warnings[s.uid] && <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" />{warnings[s.uid]}</p>}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          {(b.tab || b.action) && <span className="text-neutral-700">During the workshop this step opens <strong>{b.action === "combine" ? "Combine maps" : TAB_LABEL[b.tab] || b.tab}</strong>.</span>}
                          <span className="ml-auto flex gap-1.5">
                            <button onClick={() => move(i, -1)} disabled={i === 0} className="px-2.5 py-1 rounded-lg border border-slate-300 text-neutral-800 hover:bg-white disabled:opacity-30 inline-flex items-center gap-1"><ArrowUp size={14} />Earlier</button>
                            <button onClick={() => move(i, 1)} disabled={i === plan.steps.length - 1} className="px-2.5 py-1 rounded-lg border border-slate-300 text-neutral-800 hover:bg-white disabled:opacity-30 inline-flex items-center gap-1"><ArrowDown size={14} />Later</button>
                            <button onClick={() => { set({ steps: plan.steps.filter((x) => x.uid !== s.uid) }); setOpenStep(null); }} className="px-2.5 py-1 rounded-lg border border-slate-300 text-neutral-800 hover:text-red-700 hover:border-red-300 hover:bg-red-50 inline-flex items-center gap-1"><Trash2 size={14} />Remove</button>
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {!plan.steps.length && <li className="px-4 py-3 text-sm text-neutral-700">The agenda is empty. Choose a template or add a step.</li>}
            </ol>

            {adding ? (
              <div className="mt-3 rounded-xl border border-lagoon-300 bg-white p-3">
                <div className="flex items-center justify-between mb-2"><h4 className="text-[15px] font-semibold text-neutral-900">Add a step</h4><button onClick={() => setAdding(false)} className="text-neutral-600" aria-label="Close"><X size={16} /></button></div>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {WORKSHOP_BLOCKS.map((b) => (
                    <button key={b.id} onClick={() => { const st = stepOf(b.id); set({ steps: [...plan.steps, st] }); setAdding(false); setOpenStep(st.uid); }} className="text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-lagoon-400 hover:bg-lagoon-50">
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900">{b.title}<span className={`ml-auto text-[13px] px-2 rounded-full ${KIND[b.kind].tone}`}>{KIND[b.kind].label}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-[15px] font-medium text-lagoon-800 hover:border-lagoon-400 hover:bg-lagoon-50 inline-flex items-center justify-center gap-1.5"><Plus size={16} />Add a step</button>
            )}
          </section>

          {/* 3. print and run */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <PlannerHeading n={3} title="Print and run">Print the agenda for yourself and the participants, then start the workshop. The plan is saved with this model, in this browser.</PlannerHeading>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => print(true)} className="px-4 py-2 rounded-lg border border-slate-300 text-[15px] text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-2"><ClipboardList size={16} />Print facilitator script</button>
              <button onClick={() => print(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-[15px] text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-2"><Printer size={16} />Print participant handout</button>
            </div>
          </section>
        </div>

        <div className="flex items-center gap-3 px-6 py-3.5 bg-white rounded-b-2xl border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[15px] text-neutral-800 hover:bg-slate-100">Close</button>
          <span className="ml-auto text-sm text-neutral-600 hidden sm:inline">{plan.steps.length} steps, {fmtMin(total)}</span>
          <button onClick={onStart} disabled={!plan.steps.length} className="px-5 py-2 rounded-lg bg-coral-500 text-white text-[15px] font-semibold hover:bg-coral-600 disabled:opacity-40 inline-flex items-center gap-2"><Play size={16} />Start the workshop</button>
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
          <div className="text-[17px] font-semibold truncate">{step.title}</div>
          <div className="text-[15px] text-slate-100 leading-snug line-clamp-2">{step.prompt}</div>
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
