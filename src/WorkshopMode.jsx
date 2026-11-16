// ============================================================================
// Workshop mode: prepare a workshop, then run it step by step
// ============================================================================
// A facilitator describes the workshop (question, aim, place, team), builds
// an agenda from ready-made steps, each with a duration, a group format, what
// the participants are asked, the result it should give, the materials and
// private notes, and keeps a preparation checklist. The planner checks
// whether the model is ready for each step, and prints a facilitator script
// and a participant handout with worksheets. During the workshop a slim bar
// shows the current step, its prompt and a timer; Next opens the tab the
// step needs.
//
// The plan is kept per model in this browser:
//   spaghetti-engine:workshop:v1:<modelId>
//   { title, question, aim, date, start, location, participants, team, steps, prep, materials, followUp }
import React, { useEffect, useMemo, useState } from "react";
import {
  Users, X, Plus, Trash2, ArrowUp, ArrowDown, Printer, Play, Pause, RotateCcw,
  SkipBack, SkipForward, Check, AlertTriangle, ClipboardList, Timer, Maximize2, ChevronDown, ChevronRight,
} from "lucide-react";

const KEY = (id) => `spaghetti-engine:workshop:v1:${id}`;
export function loadWorkshop(modelId) {
  try { const raw = localStorage.getItem(KEY(modelId)); return raw ? withDefaults(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveWorkshop(modelId, plan) {
  try { localStorage.setItem(KEY(modelId), JSON.stringify(plan)); } catch { /* storage unavailable: the plan lasts this session */ }
}

export const FORMATS = ["Whole group", "Small groups", "Pairs", "On your own"];

// The building blocks of an agenda. `tab` is the tab the step opens,
// `action` something else to open, `check` says what the model still lacks.
export const WORKSHOP_BLOCKS = [
  { id: "welcome", title: "Welcome and introductions", minutes: 15, kind: "talk", format: "Whole group",
    prompt: "Who is in the room, and what brings you here today? We will spend this session on one question together.",
    output: "Everyone knows the question and what will happen with the results.",
    materials: "Name cards; the central question on a flip chart",
    notes: "Keep the round short: name, organisation, one sentence on why the question matters to them. Say who will see the map afterwards." },
  { id: "intro", title: "How a cognitive map works", minutes: 10, kind: "talk", format: "Whole group", tab: "network",
    prompt: "A map like this has two parts: the things that matter, and how they push each other up or down. Once it is drawn, the computer can play it forward.",
    output: "Participants can read a simple map.",
    materials: "",
    notes: "Draw two or three concepts from the case live on screen. Stop after ten minutes; people learn more from doing it themselves." },
  { id: "individual", title: "Draw your own map", minutes: 30, kind: "build", format: "On your own", tab: "network",
    prompt: "Draw your own map of the situation: the eight to twelve factors you think matter most, and how they affect each other.",
    output: "One map per participant.",
    materials: "A laptop per participant with the tool open, or the paper worksheet in the handout",
    notes: "If people work on paper, enter their maps afterwards, one model each. Ask everyone who works on a laptop to save with Export JSON and send you the file." },
  { id: "concepts", title: "Collect the important factors", minutes: 20, kind: "build", format: "Small groups", tab: "editor",
    prompt: "What affects the situation we are discussing? Write one factor per sticky note, as something that can go up or down: 'groundwater level' rather than 'drought'.",
    output: "Ten to twenty-five concepts in the Model editor.",
    materials: "Sticky notes, markers, a wall or flip chart",
    notes: "Give five minutes of silent writing first, then collect per group. Cluster duplicates on the wall before you type them in.",
    check: ({ concepts }) => (concepts.length ? null : "The model has no concepts yet. That is fine if the group builds it from scratch.") },
  { id: "modules", title: "Sort the factors into themes", minutes: 10, kind: "build", format: "Whole group", tab: "editor",
    prompt: "Which factors belong together? Give each group a short name, such as Water, Farming or Policy.",
    output: "Every concept belongs to a theme (module).",
    materials: "",
    notes: "Themes make the map easier to read and let you look at one part at a time. Do not let the naming take long." },
  { id: "relationships", title: "Connect cause and effect", minutes: 25, kind: "build", format: "Small groups", tab: "network",
    prompt: "Take two factors. If the first goes up, what happens to the second: up, down, or nothing? Draw direct effects only.",
    output: "Relationships with a sign and a short reason for each.",
    materials: "Printed list of concepts per group",
    notes: "Work through one theme at a time. Ask 'why?' for every arrow and type the answer into its description; you will need it later.",
    check: ({ concepts }) => (concepts.length >= 2 ? null : "Add at least two concepts first, or put a concept step before this one.") },
  { id: "weights", title: "Agree on how strong each link is", minutes: 15, kind: "build", format: "Whole group", tab: "editor",
    prompt: "For each arrow: compared with the others, is this effect weak, moderate or strong?",
    output: "A weight for every relationship, and a list of points the group did not agree on.",
    materials: "",
    notes: "When people disagree, write both views down rather than splitting the difference. These disagreements are often what the day is really about.",
    check: ({ edges }) => (edges.length ? null : "There are no relationships yet to weigh.") },
  { id: "check", title: "Read the map back", minutes: 10, kind: "build", format: "Whole group", tab: "editor",
    prompt: "Look at the whole map. What is missing? Is there anything you would not recognise from practice?",
    output: "A map the group recognises as its own.",
    materials: "",
    notes: "The Model check at the top of the Model editor lists loose concepts and missing names." },
  { id: "levers", title: "Find the key levers", minutes: 15, kind: "analyse", format: "Whole group", tab: "metrics",
    prompt: "These factors push the rest of the system most, and these respond most. Does that match your experience?",
    output: "Two or three levers the group wants to test.",
    materials: "",
    notes: "Explain the three cards at the top, not the method. A surprise points either to a missing link or to something worth knowing.",
    check: ({ edges }) => (edges.length >= 3 ? null : "The map needs a few relationships before levers can be found.") },
  { id: "baseline", title: "Where is the system heading?", minutes: 10, kind: "analyse", format: "Whole group", tab: "equilibrium",
    prompt: "If nothing changes, this is where the map settles. Is this the future you expect?",
    output: "A shared picture of the current course.",
    materials: "",
    notes: "Run the baseline before the session so you know what comes out. Check that the start values describe today's situation.",
    check: ({ concepts }) => (concepts.some((c) => Math.abs(c.initialValue || 0) > 1e-9) ? null : "Every start value is 0, so nothing will move. Give the concepts that describe today a start value.") },
  { id: "scenarios", title: "What if ...?", minutes: 25, kind: "analyse", format: "Small groups", tab: "scenarios",
    prompt: "Which measure or development would you like to test? What happens to the things you care about, and who notices it first?",
    output: "Two to four scenarios compared with the baseline.",
    materials: "",
    notes: "Prepare two or three scenarios in advance and let each group add one of its own.",
    check: ({ scenarios }) => (scenarios.filter((s) => s.id !== "baseline").length ? null : "No scenarios yet. Prepare them on the Scenarios & Simulation tab.") },
  { id: "transition", title: "How much effort is enough?", minutes: 20, kind: "analyse", format: "Whole group", tab: "transition", advanced: true,
    prompt: "From what intensity does extra effort on this measure stop paying off as much?",
    output: "A view on how ambitious a measure needs to be.",
    materials: "",
    notes: "Run the analysis beforehand for the main measure and talk through the key findings. Show the matrix only if people ask." },
  { id: "pathways", title: "Which order of measures works best?", minutes: 20, kind: "analyse", format: "Whole group", tab: "pathways", advanced: true,
    prompt: "If we can only start with one measure, which should it be, and what comes next?",
    output: "A preferred sequence of measures.",
    materials: "",
    notes: "Prepare the candidate measures and the outcome weights in advance. Show the top three pathways, not the whole table." },
  { id: "combine", title: "Compare the individual maps", minutes: 25, kind: "analyse", format: "Whole group", action: "combine",
    prompt: "Here are your maps side by side. Where do you agree, and where do the arrows point in opposite directions?",
    output: "A group map and a list of disagreements.",
    materials: "",
    notes: "Import every participant's map before this step. Start the discussion with the links on which the signs differ.",
    check: ({ models }) => (models >= 2 ? null : "Only one map in the library. Import the participants' maps first.") },
  { id: "discussion", title: "Open discussion", minutes: 15, kind: "talk", format: "Whole group",
    prompt: "What stands out for you so far?",
    output: "Points to take into the next step or the report.",
    materials: "Flip chart",
    notes: "Write the points on the flip chart as they come up." },
  { id: "break", title: "Break", minutes: 15, kind: "talk", format: "Whole group", prompt: "Coffee and tea.", output: "", materials: "Coffee and tea", notes: "" },
  { id: "reflect", title: "Wrap-up and next steps", minutes: 15, kind: "talk", format: "Whole group",
    prompt: "What did you learn today, and what surprised you? What should happen with this map next?",
    output: "Lessons, open questions and agreed next steps.",
    materials: "",
    notes: "Go round the room once. Before people leave, save the model with Export JSON and agree who receives the report." },
];
const BLOCK = Object.fromEntries(WORKSHOP_BLOCKS.map((b) => [b.id, b]));
export const WORKSHOP_BLOCK_TARGETS = BLOCK;
const KIND = {
  talk: { label: "Discussion", tone: "bg-slate-100 text-slate-800" },
  build: { label: "Building", tone: "bg-lagoon-50 text-lagoon-800" },
  analyse: { label: "Analysis", tone: "bg-sky-50 text-sky-800" },
};

export const WORKSHOP_TEMPLATES = [
  { id: "explore", title: "Map a system together", length: "about 2.5 hours", text: "Build one shared map from scratch and see what it implies.",
    blocks: ["welcome", "intro", "concepts", "modules", "break", "relationships", "weights", "check", "baseline", "reflect"] },
  { id: "interventions", title: "Test interventions", length: "about 2.5 hours", text: "Start from a prepared map and explore measures with the group.",
    blocks: ["welcome", "intro", "check", "levers", "baseline", "break", "scenarios", "transition", "reflect"] },
  { id: "compare", title: "Compare stakeholder views", length: "about 2.5 hours", text: "Everyone draws a map of their own; the maps are then combined and discussed.",
    blocks: ["welcome", "intro", "individual", "break", "combine", "discussion", "baseline", "reflect"] },
  { id: "short", title: "A first introduction", length: "about 1 hour", text: "A short session to show what mapping can do, on a small prepared map.",
    blocks: ["welcome", "intro", "relationships", "baseline", "reflect"] },
];

const BASE_PREP = [
  "Send the invitation with the central question, the time and the place",
  "Check the room: projector, screen, power and internet",
  "Save a copy of the model with Export JSON",
  "Print the participant handouts",
];
const BASE_MATERIALS = ["Laptop with the tool and this model open", "Projector or large screen"];

let seq = 0;
const uid = (p) => { seq += 1; return `${p}${Date.now().toString(36)}${seq}`; };
const stepOf = (blockId) => {
  const b = BLOCK[blockId];
  return { uid: uid("s"), block: blockId, title: b.title, minutes: b.minutes, format: b.format, prompt: b.prompt, output: b.output || "", materials: b.materials || "", notes: b.notes || "" };
};
const materialsFor = (steps) => {
  const seen = new Set(BASE_MATERIALS);
  steps.forEach((s) => String(s.materials || "").split(/;\s*|,\s*(?=[A-Z])/).map((m) => m.trim()).filter(Boolean).forEach((m) => seen.add(m.charAt(0).toUpperCase() + m.slice(1))));
  return [...seen].map((text) => ({ id: uid("m"), text, done: false }));
};
export const newWorkshopPlan = (modelName, templateId = "explore") => {
  const steps = (WORKSHOP_TEMPLATES.find((t) => t.id === templateId) || WORKSHOP_TEMPLATES[0]).blocks.map(stepOf);
  return withDefaults({ title: `Workshop: ${modelName || "my model"}`, steps, materials: materialsFor(steps) });
};
// Plans saved by an earlier version lack the newer fields.
function withDefaults(p) {
  return {
    title: "", question: "", aim: "", date: "", start: "", location: "", participants: "", followUp: "",
    ...p,
    team: { facilitator: "", cofacilitator: "", notetaker: "", ...(p.team || {}) },
    prep: Array.isArray(p.prep) ? p.prep : BASE_PREP.map((text) => ({ id: uid("p"), text, done: false })),
    materials: Array.isArray(p.materials) ? p.materials : materialsFor(p.steps || []),
    steps: (p.steps || []).map((s) => ({ format: BLOCK[s.block]?.format || "Whole group", output: BLOCK[s.block]?.output || "", materials: BLOCK[s.block]?.materials || "", ...s })),
  };
}

const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`);
const clock = (start, add) => {
  if (!/^\d{1,2}:\d{2}$/.test(start || "")) return null;
  const [h, m] = start.split(":").map(Number);
  const t = h * 60 + m + add;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const longDate = (d) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return d || "";
  try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return d; }
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------------------
// The printed documents: plain HTML pages, laid out for A4. The running
// footer and the page numbers are page-margin boxes (Chrome and Edge print
// them; other browsers leave the margin empty).
// ---------------------------------------------------------------------------
const cssText = (s) => `"${String(s ?? "").replace(/["\\]/g, "\\$&").replace(/\s+/g, " ")}"`;
const pageCss = (footer) => `
@page{size:A4;margin:15mm 16mm 19mm;
  @bottom-left{content:${cssText(footer)};font:7.5pt Inter,Arial,sans-serif;color:#8a93a3;vertical-align:top;padding-top:4mm}
  @bottom-right{content:"Page " counter(page) " of " counter(pages);font:7.5pt Inter,Arial,sans-serif;color:#8a93a3;vertical-align:top;padding-top:4mm}}`;
const PRINT_CSS = `
*{box-sizing:border-box}
body{font-family:Inter,Arial,sans-serif;color:#1d2433;font-size:10pt;line-height:1.45;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1,h2,h3{font-family:"Plus Jakarta Sans",Inter,Arial,sans-serif;color:#0f1b3d;margin:0}
.brand{display:flex;align-items:center;gap:8px;font-size:8.5pt;color:#5b6577;letter-spacing:.08em;text-transform:uppercase;border-bottom:2px solid #137d78;padding-bottom:6px;margin-bottom:14px}
.brand i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#f26b4f}
h1{font-size:21pt;line-height:1.15;margin-bottom:8px}
h2{font-size:13pt;margin:18px 0 8px;padding-bottom:3px;border-bottom:1px solid #d7dde5;break-after:avoid}
h3{font-size:11pt;break-after:avoid}
p{margin:0 0 6px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:3px 14px;margin:8px 0 12px;font-size:9.5pt}
.meta b{color:#5b6577;font-weight:500}
.q{background:#eef7f6;border-left:4px solid #137d78;padding:9px 12px;margin:10px 0;font-size:11.5pt;color:#0f1b3d}
.aim{margin:6px 0 12px}
table{width:100%;border-collapse:collapse;font-size:9.5pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{text-align:left;font-weight:600;color:#5b6577;font-size:8.5pt;text-transform:uppercase;letter-spacing:.05em;border-bottom:1.5px solid #0f1b3d;padding:5px 6px}
td{border-bottom:1px solid #e2e7ee;padding:6px;vertical-align:top}
td.t{white-space:nowrap;color:#5b6577;font-variant-numeric:tabular-nums;width:1%}
tr.pause td{background:#f4f6f8;color:#5b6577}
.step{display:grid;grid-template-columns:24mm 1fr;gap:0 10px;padding:10px 0;border-bottom:1px solid #e2e7ee;break-inside:avoid}
.step .when{font-variant-numeric:tabular-nums;color:#5b6577;font-size:9pt}
.step .when b{display:block;color:#0f1b3d;font-size:11pt}
.step .box{display:inline-block;width:10px;height:10px;border:1.3px solid #0f1b3d;border-radius:2px;margin-top:6px}
.step h3{margin-bottom:4px}
.pause{display:flex;gap:10px;align-items:baseline;background:#f4f6f8;border-radius:6px;padding:7px 10px;margin:8px 0;color:#5b6577;break-inside:avoid}
.pause b{color:#0f1b3d;font-variant-numeric:tabular-nums}
.tag{display:inline-block;font-size:8pt;border:1px solid #c9d1dc;border-radius:10px;padding:0 6px;margin-left:6px;color:#5b6577;font-family:Inter,Arial,sans-serif;font-weight:500;vertical-align:2px}
.ask{margin:2px 0 6px;font-size:10.5pt}
.rows{display:grid;grid-template-columns:24mm 1fr;gap:2px 8px;font-size:9.3pt}
.rows b{color:#5b6577;font-weight:500}
.note{background:#fff8e6;border-left:3px solid #e8b13a;padding:5px 9px;margin-top:6px;font-size:9.3pt}
.warn{color:#9a3412}
.check{list-style:none;padding:0;margin:0;columns:2;column-gap:10mm}
.check li{break-inside:avoid;padding:3px 0 3px 18px;position:relative}
.check li:before{content:"";position:absolute;left:0;top:5px;width:10px;height:10px;border:1.3px solid #0f1b3d;border-radius:2px}
.check li.done:before{background:#137d78;border-color:#137d78}
.team{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px}
.team div{border:1px solid #e2e7ee;border-radius:6px;padding:6px 8px;min-height:12mm}
.team b{display:block;font-size:8pt;color:#5b6577;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.lines div{border-bottom:1px solid #c9d1dc;height:8mm}
.keep{break-inside:avoid}
.pb{break-before:page}
.ws td{height:9.5mm}
.ws.tall td{height:15mm}
.small{font-size:8.5pt;color:#5b6577}
.example{margin:10px 0 8px}
.example svg{width:100%;max-width:150mm;height:auto}
.legend{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;font-size:9.5pt;margin-top:6px}
.legend b{color:#0f1b3d}
`;

function shell(title, footer, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700&display=swap" rel="stylesheet">
<style>${pageCss(footer)}${PRINT_CSS}</style></head><body>${body}</body></html>`;
}

function headerBlock(plan, kind, extraMeta = []) {
  const total = plan.steps.reduce((t, s) => t + (Number(s.minutes) || 0), 0);
  const when = [longDate(plan.date), plan.start ? `${plan.start} to ${clock(plan.start, total)}` : fmtMin(total)].filter(Boolean).join(", ");
  const meta = [["When", when], ["Where", plan.location], ["With", plan.participants], ...extraMeta].filter(([, v]) => v);
  return `<div class="brand"><i></i>The Spaghetti Engine · ${esc(kind)}</div>
<h1>${esc(plan.title || "Workshop")}</h1>
${meta.length ? `<div class="meta">${meta.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("")}</div>` : ""}
${plan.question ? `<div class="q">${esc(plan.question)}</div>` : ""}`;
}

const isPause = (s) => s.block === "break";

function agendaTable(plan, { withFormat }) {
  let at = 0;
  return `<table><thead><tr><th>Time</th><th>Step</th>${withFormat ? "<th>Format</th>" : ""}<th style="text-align:right">Min</th></tr></thead><tbody>${plan.steps.map((s) => {
    const from = clock(plan.start, at); at += Number(s.minutes) || 0;
    return `<tr class="${isPause(s) ? "pause" : ""}"><td class="t">${from || ""}</td><td>${esc(s.title)}</td>${withFormat ? `<td class="small">${isPause(s) ? "" : esc(s.format)}</td>` : ""}<td class="t" style="text-align:right">${esc(s.minutes)}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function facilitatorScript(plan, warnings, modelName) {
  let at = 0;
  const team = plan.team || {};
  const steps = plan.steps.map((s, i) => {
    const from = clock(plan.start, at); at += Number(s.minutes) || 0;
    const to = clock(plan.start, at);
    if (isPause(s)) return `<div class="pause"><b>${from || ""}</b><span><b>${esc(s.title)}</b>, ${esc(s.minutes)} min${s.materials ? ` · ${esc(s.materials)}` : ""}</span></div>`;
    const b = BLOCK[s.block] || {};
    const opens = b.action === "combine" ? "Combine maps" : TAB_LABEL[b.tab];
    const rows = [["Result", s.output], ["Materials", s.materials], ["In the tool", opens]].filter(([, v]) => v);
    return `<div class="step"><div class="when"><b>${from ? `${from}` : `Step ${i + 1}`}</b>${from && to ? `to ${to}<br>` : ""}${esc(s.minutes)} min<br><span class="box" title="done"></span></div><div>
<h3>${esc(s.title)}<span class="tag">${esc(s.format)}</span></h3>
${s.prompt ? `<p class="ask">“${esc(s.prompt)}”</p>` : ""}
${rows.length ? `<div class="rows">${rows.map(([k, v]) => `<b>${k}</b><span>${esc(v)}</span>`).join("")}</div>` : ""}
${s.notes ? `<div class="note">${esc(s.notes)}</div>` : ""}
${warnings[s.uid] ? `<p class="warn small" style="margin-top:4px">Before the session: ${esc(warnings[s.uid])}</p>` : ""}
</div></div>`;
  }).join("");
  const prep = [...plan.steps.filter((s) => warnings[s.uid]).map((s) => ({ text: `${s.title}: ${warnings[s.uid]}`, done: false })), ...(plan.prep || [])];
  const body = `${headerBlock(plan, "Facilitator script", [["Model", modelName]])}
${plan.aim ? `<p class="aim"><b>Aim.</b> ${esc(plan.aim)}</p>` : ""}
<div class="team"><div><b>Facilitator</b>${esc(team.facilitator)}</div><div><b>Co-facilitator</b>${esc(team.cofacilitator)}</div><div><b>Notes and tool</b>${esc(team.notetaker)}</div></div>
<h2>The session at a glance</h2>
${agendaTable(plan, { withFormat: true })}
<div class="keep"><h2>Before the session</h2>
<ul class="check">${prep.map((t) => `<li class="${t.done ? "done" : ""}">${esc(t.text)}</li>`).join("")}</ul></div>
<div class="keep"><h3 style="margin-top:12px">Bring along</h3>
<ul class="check" style="margin-top:4px">${(plan.materials || []).map((t) => `<li class="${t.done ? "done" : ""}">${esc(t.text)}</li>`).join("")}</ul></div>
<h2>Step by step</h2>
${steps}
<div class="keep"><h2>After the session</h2>
${plan.followUp ? `<p>${esc(plan.followUp)}</p>` : ""}
<ul class="check"><li>Save the final model with Export JSON</li><li>Export the figures and tables for the report</li><li>Write up the points the group did not agree on</li><li>Send the participants the map and a short summary</li></ul>
<h3 style="margin-top:12px">Notes</h3>
<div class="lines">${"<div></div>".repeat(5)}</div></div>`;
  return shell(`${plan.title} - facilitator script`, `${plan.title} · facilitator script`, body);
}

const EXAMPLE_SVG = `<svg viewBox="0 0 520 96" xmlns="http://www.w3.org/2000/svg" font-family="Inter,Arial" font-size="13">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
<rect x="2" y="34" width="130" height="34" rx="8" fill="#eef7f6" stroke="#137d78" stroke-width="1.5"/><text x="67" y="56" text-anchor="middle" fill="#0f1b3d">Rainfall</text>
<rect x="195" y="34" width="130" height="34" rx="8" fill="#eef7f6" stroke="#137d78" stroke-width="1.5"/><text x="260" y="56" text-anchor="middle" fill="#0f1b3d">Soil moisture</text>
<rect x="388" y="34" width="130" height="34" rx="8" fill="#eef7f6" stroke="#137d78" stroke-width="1.5"/><text x="453" y="56" text-anchor="middle" fill="#0f1b3d">Peat oxidation</text>
<line x1="134" y1="51" x2="192" y2="51" stroke="#15803d" stroke-width="2.5" marker-end="url(#a)"/><text x="163" y="28" text-anchor="middle" fill="#15803d" font-size="12" font-weight="600">+ strong</text>
<line x1="327" y1="51" x2="385" y2="51" stroke="#c2410c" stroke-width="2.5" marker-end="url(#a)"/><text x="356" y="28" text-anchor="middle" fill="#c2410c" font-size="12" font-weight="600">- moderate</text>
<text x="163" y="88" text-anchor="middle" fill="#5b6577" font-size="11">more rain, wetter soil</text>
<text x="356" y="88" text-anchor="middle" fill="#5b6577" font-size="11">wetter soil, less oxidation</text>
</svg>`;

function participantHandout(plan) {
  const build = plan.steps.some((s) => ["concepts", "individual", "relationships"].includes(s.block));
  const measures = plan.steps.some((s) => ["scenarios", "transition", "pathways"].includes(s.block));
  const rows = (n, cells) => Array.from({ length: n }, (_, i) => `<tr><td class="t">${i + 1}</td>${"<td></td>".repeat(cells)}</tr>`).join("");
  const sheets = [];
  if (build) {
    sheets.push(`<h2 class="pb">Worksheet: the factors that matter</h2>
<p class="small">One factor per line, written as something that can go up or down: "groundwater level" rather than "drought". Use the theme column to group them later.</p>
<table class="ws"><thead><tr><th style="width:8mm">#</th><th>Factor</th><th style="width:42mm">Theme</th></tr></thead><tbody>${rows(15, 2)}</tbody></table>`);
    sheets.push(`<h2 class="pb">Worksheet: how they influence each other</h2>
<p class="small">If the first factor goes up, does the second go up (+) or down (-)? Is the effect weak, moderate or strong? A word on why helps the group later.</p>
<table class="ws"><thead><tr><th style="width:8mm">#</th><th>From</th><th>To</th><th style="width:13mm">+ / -</th><th style="width:22mm">Strength</th><th style="width:48mm">Why</th></tr></thead><tbody>${rows(15, 5)}</tbody></table>`);
  }
  if (measures) {
    sheets.push(`<h2 class="pb">Worksheet: measures to test</h2>
<p class="small">Which measures or developments would you like to see tested on the map? What should they change, and who would notice?</p>
<table class="ws tall"><thead><tr><th style="width:8mm">#</th><th>Measure</th><th>What it changes first</th><th>What you expect to happen</th><th style="width:30mm">Who is affected</th></tr></thead><tbody>${rows(8, 4)}</tbody></table>`);
  }
  const body = `${headerBlock(plan, "Workshop handout")}
<p>Thank you for taking part. Today we work on the question above with a cognitive map: a drawing of the things that matter in this situation and of how they influence each other. The map is built from what you know; we are not working towards an answer that someone already has.</p>
${plan.aim ? `<p class="aim"><b>What we hope to achieve.</b> ${esc(plan.aim)}</p>` : ""}
<h2>Programme</h2>
${agendaTable(plan, { withFormat: false })}
<div class="keep"><h2>Reading a map</h2>
<div class="example">${EXAMPLE_SVG}</div>
<div class="legend">
<span><b>A box</b> is a concept: something that can increase or decrease.</span>
<span><b>An arrow</b> is a relationship: one concept pushing another.</span>
<span><b>+</b> (green): when the first goes up, the second goes up too.</span>
<span><b>-</b> (orange): when the first goes up, the second goes down.</span>
</div>
<p style="margin-top:8px">Each relationship is weak, moderate or strong. When the map is complete, the computer plays it forward: it shows where the situation is heading if nothing changes, and what changes when we try a measure.</p></div>
${sheets.map((h, i) => (i === 0 ? h.replace('<h2 class="pb">', "<h2>") : h)).join("")}
${sheets.length ? "" : `<div class="keep"><h2>Notes</h2>
<div class="lines">${"<div></div>".repeat(8)}</div></div>`}
${plan.team?.facilitator ? `<p class="small" style="margin-top:10px">Questions afterwards? Contact ${esc(plan.team.facilitator)}.</p>` : ""}`;
  return shell(`${plan.title} - handout`, plan.title, body);
}

// for tests and previews
export const workshopDocuments = { facilitatorScript, participantHandout };

function printDoc(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  // print once the fonts are in, so the page is not laid out with a fallback font
  const go = () => { try { w.focus(); w.print(); } catch { /* the page stays open to print by hand */ } };
  try { (w.document.fonts?.ready || Promise.resolve()).then(() => setTimeout(go, 150)); } catch { setTimeout(go, 700); }
  return true;
}

// A numbered heading for the parts of the planner.
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

// An editable checklist (preparation tasks, materials).
function Checklist({ items, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (!t) return; onChange([...items, { id: uid("c"), text: t, done: false }]); setDraft(""); };
  return (
    <div className="space-y-1.5">
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id} className="group flex items-start gap-2.5">
            <input type="checkbox" checked={!!it.done} onChange={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))} className="mt-1 w-4 h-4 accent-lagoon-700 shrink-0" aria-label={it.text} />
            <span className={`flex-1 text-[15px] ${it.done ? "text-neutral-500 line-through" : "text-neutral-900"}`}>{it.text}</span>
            <button onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-neutral-500 hover:text-red-600" aria-label={`Remove ${it.text}`}><X size={14} /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder={placeholder}
          className="flex-1 min-w-0 text-sm text-neutral-900 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-lagoon-300" />
        <button onClick={add} disabled={!draft.trim()} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-neutral-800 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1"><Plus size={14} />Add</button>
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
  const setTeam = (patch) => set({ team: { ...plan.team, ...patch } });
  const setStep = (id, patch) => set({ steps: plan.steps.map((s) => (s.uid === id ? { ...s, ...patch } : s)) });
  const move = (i, d) => { const st = [...plan.steps]; const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; set({ steps: st }); };
  // A template replaces the agenda; materials the new steps need are added to the list.
  const applyTemplate = (t) => {
    const steps = t.blocks.map(stepOf);
    const have = new Set(plan.materials.map((m) => m.text.toLowerCase()));
    set({ steps, materials: [...plan.materials, ...materialsFor(steps).filter((m) => !have.has(m.text.toLowerCase()))] });
    setOpenStep(null);
  };
  const print = (facilitator) => {
    const ok = printDoc(facilitator ? facilitatorScript(plan, warnings, modelName) : participantHandout(plan));
    if (!ok) notify("The print page was blocked by the browser. Allow pop-ups for this site and try again.");
  };
  const nWarn = Object.keys(warnings).length;
  const prepOpen = plan.prep.filter((p) => !p.done).length + nWarn;
  let at = 0;

  const input = "w-full text-[15px] text-neutral-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-lagoon-300";
  const label = "block text-sm font-semibold text-neutral-800";
  const hint = "font-normal text-neutral-600";
  return (
    <div className="fixed inset-0 z-[55] bg-slate-900/40 flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="se-ws-title" className="bg-[#f7f9f9] rounded-2xl shadow-xl border border-slate-200 max-w-5xl w-full max-h-[94vh] flex flex-col"
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 bg-white rounded-t-2xl border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-coral-500 text-white flex items-center justify-center shrink-0"><Users size={20} /></span>
            <div>
              <h2 id="se-ws-title" className="se-display text-xl font-bold text-neutral-900">Prepare a workshop</h2>
              <p className="text-sm text-neutral-700">Describe the session, build the agenda, work through the preparation list, then print and run it.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="overflow-auto px-6 py-5 space-y-6">
          {/* 1. the workshop itself */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <PlannerHeading n={1} title="The workshop">Model: <strong>{modelName}</strong></PlannerHeading>
            <div className="grid md:grid-cols-2 gap-x-5 gap-y-4">
              <label className={label}>Title<input value={plan.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1.5`} /></label>
              <label className={label}>Where<input value={plan.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Village hall, Zegveld" className={`${input} mt-1.5`} /></label>
              <label className={`${label} md:row-span-2 flex flex-col`}>Central question
                <textarea value={plan.question} onChange={(e) => set({ question: e.target.value })} placeholder="e.g. How can the peat meadows stay productive while emissions fall?" className={`${input} mt-1.5 flex-1 min-h-[96px] resize-y`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>Date<input type="date" value={plan.date} onChange={(e) => set({ date: e.target.value })} className={`${input} mt-1.5`} /></label>
                <label className={label}>Start time<input type="time" value={plan.start || ""} onChange={(e) => set({ start: e.target.value })} className={`${input} mt-1.5`} /></label>
              </div>
              <label className={label}>Participants<input value={plan.participants} onChange={(e) => set({ participants: e.target.value })} placeholder="e.g. 12 farmers and water board staff" className={`${input} mt-1.5`} /></label>
              <label className={`${label} md:col-span-2`}>Aim <span className={hint}>(what should the group have at the end of the day?)</span>
                <textarea value={plan.aim} onChange={(e) => set({ aim: e.target.value })} rows={2} placeholder="e.g. A shared map of the area and two measures the group wants to explore further" className={`${input} mt-1.5 resize-y`} />
              </label>
            </div>
            <div className="mt-4">
              <div className={label}>Team</div>
              <div className="grid sm:grid-cols-3 gap-3 mt-1.5">
                <input value={plan.team.facilitator} onChange={(e) => setTeam({ facilitator: e.target.value })} placeholder="Facilitator" aria-label="Facilitator" className={input} />
                <input value={plan.team.cofacilitator} onChange={(e) => setTeam({ cofacilitator: e.target.value })} placeholder="Co-facilitator" aria-label="Co-facilitator" className={input} />
                <input value={plan.team.notetaker} onChange={(e) => setTeam({ notetaker: e.target.value })} placeholder="Notes and tool" aria-label="Who keeps notes and works the tool" className={input} />
              </div>
            </div>
          </section>

          {/* 2. the agenda */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <PlannerHeading n={2} title="The agenda">
                {plan.steps.length} steps, {fmtMin(total)}{plan.start && clock(plan.start, total) ? `, ${plan.start} to ${clock(plan.start, total)}` : ""}. Click a step to change what is asked, the format and your notes.
              </PlannerHeading>
              {nWarn > 0
                ? <span className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 inline-flex items-center gap-1.5"><AlertTriangle size={14} />{nWarn} step{nWarn === 1 ? "" : "s"} to prepare</span>
                : plan.steps.length > 0 && <span className="text-sm text-lagoon-900 bg-lagoon-50 border border-lagoon-200 rounded-full px-3 py-1 inline-flex items-center gap-1.5"><Check size={14} />The model is ready</span>}
            </div>

            <div className="mb-4">
              <div className="text-sm font-semibold text-neutral-800 mb-2">Start from a template <span className={hint}>(replaces the agenda below)</span></div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                          {!open && <span className="block text-sm text-neutral-600 truncate">{s.format} · {s.prompt}</span>}
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
                        <div className="grid sm:grid-cols-[1fr_200px] gap-3">
                          <label className={label}>Step title<input value={s.title} onChange={(e) => setStep(s.uid, { title: e.target.value })} className={`${input} mt-1.5`} /></label>
                          <label className={label}>Format
                            <select value={s.format} onChange={(e) => setStep(s.uid, { format: e.target.value })} className={`${input} mt-1.5`}>
                              {FORMATS.map((f) => <option key={f}>{f}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className={label}>What participants are asked
                          <textarea value={s.prompt} onChange={(e) => setStep(s.uid, { prompt: e.target.value })} rows={3} className={`${input} mt-1.5 resize-y`} />
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <label className={label}>Result <span className={hint}>(what the step should give)</span>
                            <textarea value={s.output} onChange={(e) => setStep(s.uid, { output: e.target.value })} rows={2} className={`${input} mt-1.5 resize-y`} />
                          </label>
                          <label className={label}>Materials
                            <textarea value={s.materials} onChange={(e) => setStep(s.uid, { materials: e.target.value })} rows={2} className={`${input} mt-1.5 resize-y`} />
                          </label>
                        </div>
                        <label className={label}>Your notes <span className={hint}>(only in the facilitator script)</span>
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
                      <span className="flex items-center gap-2 text-[15px] text-neutral-900">{b.title}<span className="ml-auto text-[13px] text-neutral-600">{b.minutes} min</span><span className={`text-[13px] px-2 rounded-full ${KIND[b.kind].tone}`}>{KIND[b.kind].label}</span></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-[15px] font-medium text-lagoon-800 hover:border-lagoon-400 hover:bg-lagoon-50 inline-flex items-center justify-center gap-1.5"><Plus size={16} />Add a step</button>
            )}
          </section>

          {/* 3. preparation */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <PlannerHeading n={3} title="Preparation">{prepOpen ? `${prepOpen} thing${prepOpen === 1 ? "" : "s"} still to do.` : "Everything is ready."} The lists are printed in the facilitator script.</PlannerHeading>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-[15px] font-semibold text-neutral-900 mb-2">Before the session</h4>
                {nWarn > 0 && (
                  <ul className="mb-2 space-y-1">
                    {plan.steps.filter((s) => warnings[s.uid]).map((s) => (
                      <li key={s.uid} className="flex items-start gap-2.5 text-[15px] text-amber-900"><AlertTriangle size={15} className="shrink-0 mt-1 text-amber-600" /><span><strong>{s.title}:</strong> {warnings[s.uid]}</span></li>
                    ))}
                  </ul>
                )}
                <Checklist items={plan.prep} onChange={(prep) => set({ prep })} placeholder="Add a task, e.g. book the room" />
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h4 className="text-[15px] font-semibold text-neutral-900">Bring along</h4>
                  <button onClick={() => { const have = new Set(plan.materials.map((m) => m.text.toLowerCase())); set({ materials: [...plan.materials, ...materialsFor(plan.steps).filter((m) => !have.has(m.text.toLowerCase()))] }); }}
                    className="text-[13px] text-lagoon-700 hover:underline">Add what the steps need</button>
                </div>
                <Checklist items={plan.materials} onChange={(materials) => set({ materials })} placeholder="Add an item, e.g. extension cable" />
              </div>
            </div>
            <label className={`${label} mt-5`}>After the session <span className={hint}>(follow-up, report, who receives what)</span>
              <textarea value={plan.followUp} onChange={(e) => set({ followUp: e.target.value })} rows={2} placeholder="e.g. Send the map and a two-page summary to all participants within two weeks" className={`${input} mt-1.5 resize-y`} />
            </label>
          </section>

          {/* 4. print and run */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5">
            <PlannerHeading n={4} title="Print and run">The facilitator script holds the programme, the preparation lists and every step with its notes. The handout gives participants the programme, a short guide to reading a map, and two worksheets.</PlannerHeading>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => print(true)} className="px-4 py-2 rounded-lg border border-slate-300 text-[15px] text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-2"><ClipboardList size={16} />Print facilitator script</button>
              <button onClick={() => print(false)} className="px-4 py-2 rounded-lg border border-slate-300 text-[15px] text-neutral-900 hover:bg-slate-50 inline-flex items-center gap-2"><Printer size={16} />Print participant handout</button>
            </div>
            <p className="text-[13px] text-neutral-600 mt-2">Both open in a new window with the print dialog; choose "Save as PDF" there to keep a file. The plan is saved with this model, in this browser.</p>
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
          <span className="text-[13px] text-slate-300">Step {index + 1} of {plan.steps.length}{step.format ? ` · ${step.format}` : ""}</span>
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
