// ============================================================================
// Analysis report: the model and every analysis that has been run, as a
// document (Word .docx, or a print view that the browser saves as PDF)
// ============================================================================
// The Analysis Workbook holds every number; the report is the readable
// companion: a title page, the model, the settings, and one section per
// analysis with its key table and figure, ready to attach to a workshop
// report or a paper's supplementary material.
//
// buildReport() turns the app's state into a list of plain blocks (title,
// headings, paragraphs, notes, lists, tables, figures). Two renderers turn
// the blocks into a document: reportToHtml() (a self-contained HTML page with
// print styles) and reportToDocx() (through the `docx` library, passed in so
// that it is loaded only when a report is made). The blocks are pure data,
// so the tests can build a report from real results in Node.
import { t as tr } from "./i18n.js";

const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
const f2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : "");
const signed = (v) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${f2(v)}` : "");
const lagOf = (e) => { const n = Math.round(Number(e?.lag)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * The report as blocks. `input`:
 *   modelName, version, date (Date), scopeLabel (string or ""),
 *   concepts, edges, settings, scenarios, moduleOf(concept) -> string,
 *   analysisConcepts (the concepts in the analysed view),
 *   results (Scenarios: { [scenarioId]: simulate() result }), resultsStale,
 *   compareIds (scenario ids compared), scenarioChanges(scenario) -> [{ name, text }],
 *   baselineResult, sensitivityResult, monteCarloResult, transitionResult, pathwayResult,
 *   isStale(result) -> boolean, pathwayText(stages) -> string, archetypeLabel(key) -> string,
 *   figures: { [key]: true } (which figures exist; the renderer gets the images).
 */
export function buildReport(input) {
  const {
    modelName = tr("Untitled model"), version = "", date = new Date(), scopeLabel = "",
    concepts = [], edges = [], settings = {}, scenarios = [], moduleOf = () => "",
    analysisConcepts = concepts, results = {}, resultsStale = false, compareIds = [], scenarioChanges = () => [],
    baselineResult = null, sensitivityResult = null, monteCarloResult = null, transitionResult = null, pathwayResult = null,
    isStale = () => false, pathwayText = () => "", archetypeLabel = (k) => k || "", figures = {},
  } = input;
  const B = [];
  const nameOf = new Map(concepts.map((c) => [c.id, c.name]));
  const nm = (id) => nameOf.get(id) || id;
  const staleNote = (what) => B.push({ t: "note", text: tr("The model has changed since {what} was run. The results below describe the model as it was then; run the analysis again before relying on them.", { what }) });
  const figure = (key, caption) => { if (figures[key]) B.push({ t: "figure", key, caption }); };
  let tableNo = 0, figureNo = 0;
  const table = (caption, head, rows, numeric = []) => { tableNo += 1; B.push({ t: "table", caption: `${tr("Table")} ${tableNo}. ${caption}`, head, rows, numeric }); };
  const fig = (key, caption) => { if (!figures[key]) return; figureNo += 1; figure(key, `${tr("Figure")} ${figureNo}. ${caption}`); };

  // ---- title -----------------------------------------------------------------
  const when = date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  B.push({ t: "title", text: tr("Analysis report: {name}", { name: modelName }) });
  B.push({ t: "p", text: tr("Made with The Spaghetti Engine{v} on {date}.", { v: version ? ` ${tr("version")} ${version}` : "", date: when }) + (scopeLabel ? " " + tr("Analysis scope: {scope}.", { scope: scopeLabel }) : "") });
  B.push({ t: "note", text: tr("A fuzzy cognitive map shows how the participants see the system. Its results are implications of that view: where the system would settle and how it responds to change if the map is right. They are not forecasts, and iterations are steps of the model, not years.") });

  // ---- model -----------------------------------------------------------------
  B.push({ t: "h1", text: tr("The model") });
  const lags = edges.filter((e) => lagOf(e) > 0);
  const modules = [...new Set(concepts.map(moduleOf).filter(Boolean))];
  B.push({ t: "p", text: tr("The map has {c} concepts and {r} relationships{m}.", { c: concepts.length, r: edges.length, m: modules.length ? tr(" in {n} modules ({list})", { n: modules.length, list: modules.join(", ") }) : "" }) + (lags.length ? " " + (lags.length === 1 ? tr("1 relationship has a delay.") : tr("{n} relationships have a delay.", { n: lags.length })) : "") });
  const fn = settings.squashFunction === "linear" ? tr("no transfer function (linear)") : `${settings.squashFunction || "tanh"} (λ = ${settings.lambda ?? 1})`;
  B.push({ t: "p", text: tr("Simulation settings: transfer function {fn}; {rule} update rule; {mode} updating; at most {n} iterations; a run counts as settled when no concept changes by more than {th}.", {
    fn, rule: settings.updateRule === "absolute" ? tr("absolute") : tr("relative"), mode: settings.mode === "asynchronous" ? tr("asynchronous") : tr("synchronous"),
    n: settings.maxIterations ?? 100, th: settings.convergenceThreshold ?? 0.001,
  }) });
  if (concepts.length) {
    table(tr("Concepts"), [tr("Concept"), tr("Module"), tr("Start value"), tr("Definition")],
      concepts.map((c) => [c.name, moduleOf(c), f2(c.initialValue ?? 0), c.description || ""]), [false, false, true, false]);
  }
  if (edges.length) {
    table(tr("Relationships (weights from -1 to +1)"), [tr("Cause"), tr("Effect"), tr("Weight"), ...(lags.length ? [tr("Delay")] : [])],
      edges.map((e) => [nm(e.source), nm(e.target), signed(e.weight), ...(lags.length ? [lagOf(e) ? String(lagOf(e)) : ""] : [])]), [false, false, true, true]);
  }
  fig("networkGraph", tr("The map as drawn on the Network tab."));

  // ---- baseline --------------------------------------------------------------
  B.push({ t: "h1", text: tr("Baseline equilibrium") });
  if (!baselineResult) B.push({ t: "p", text: tr("Not run. Open the Baseline Equilibrium tab and click Run to include it.") });
  else {
    if (isStale(baselineResult)) staleNote(tr("the baseline equilibrium"));
    B.push({ t: "p", text: baselineResult.converged
      ? tr("Without any intervention the system settles after {n} iterations.", { n: baselineResult.iterationsRun })
      : tr("Without any intervention the system does not settle within {n} iterations; the values below are those of the last iteration.", { n: baselineResult.iterationsRun }) });
    const start = baselineResult.series?.[0]?.values || {};
    table(tr("Where each concept settles without intervention"), [tr("Concept"), tr("Start"), tr("Settles at"), tr("Change")],
      analysisConcepts.map((c) => { const a = start[c.id] ?? c.initialValue ?? 0, b = baselineResult.final?.[c.id] ?? a; return [c.name, f2(a), f2(b), signed(b - a)]; }), [false, true, true, true]);
    fig("baselineConvergence", tr("The path of every concept to its settled state."));
  }

  // ---- scenarios -------------------------------------------------------------
  B.push({ t: "h1", text: tr("Scenarios") });
  const run = compareIds.filter((id) => id !== "baseline" && results[id] && scenarios.some((s) => s.id === id));
  if (!results.baseline || !run.length) B.push({ t: "p", text: tr("Not run. Tick one or more scenarios on the Scenarios & Simulation tab and click Run simulation to include them.") });
  else {
    if (resultsStale) staleNote(tr("the scenarios"));
    const sc = run.map((id) => scenarios.find((s) => s.id === id));
    B.push({ t: "list", items: sc.map((s) => {
      const ch = scenarioChanges(s);
      const what = ch.length ? ch.map((c) => `${c.name} ${c.text}`).join("; ") : tr("no changes");
      const settled = results[s.id].converged ? "" : ` (${tr("did not settle")})`;
      return `${s.name}${settled}: ${what}${s.description ? `. ${s.description}` : ""}`;
    }) });
    const base = results.baseline.final;
    table(tr("Where each concept settles in each scenario, and the difference from the baseline"),
      [tr("Concept"), tr("Baseline"), ...sc.flatMap((s) => [s.name, tr("Difference")])],
      analysisConcepts.map((c) => [c.name, f2(base[c.id]), ...sc.flatMap((s) => { const v = results[s.id].final[c.id]; return [f2(v), signed(v - base[c.id])]; })]),
      [false, true, ...sc.flatMap(() => [true, true])]);
    fig("scenarioComparison", tr("How far each concept ends above or below the baseline in each scenario."));
  }

  // ---- sensitivity -----------------------------------------------------------
  if (sensitivityResult) {
    B.push({ t: "h1", text: tr("Sensitivity analysis") });
    if (isStale(sensitivityResult)) staleNote(tr("the sensitivity analysis"));
    const s = sensitivityResult;
    B.push({ t: "p", text: tr("{input} was swept from {min} to {max} in {n} steps, holding it at each value, and the settled state of the outputs was recorded.", { input: nm(s.inputId), min: f2(s.setup?.min), max: f2(s.setup?.max), n: s.setup?.steps ?? "" }) });
    if (s.elasticity?.length) table(tr("Response of each output (elasticity: change in the output per unit change in {input})", { input: nm(s.inputId) }), [tr("Output"), tr("Lowest"), tr("Highest"), tr("Elasticity")],
      s.elasticity.map((e) => [e.name, f2(e.min), f2(e.max), f2(e.elasticity)]), [false, true, true, true]);
    if (s.tornado?.length) table(tr("Influence of each concept on {out} (each concept swept from the lowest to the highest value)", { out: nm(s.primaryOutput) }), [tr("Concept"), tr("Low"), tr("High"), tr("Impact")],
      [...s.tornado].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, 15).map((x) => [x.name, f2(x.low), f2(x.high), f2(x.impact)]), [false, true, true, true]);
    fig("sensitivityScores", tr("Sensitivity of the outputs."));
  }

  // ---- Monte Carlo -----------------------------------------------------------
  if (monteCarloResult) {
    const m = monteCarloResult;
    B.push({ t: "h1", text: tr("Uncertainty (Monte Carlo)") });
    if (isStale(m)) staleNote(tr("the Monte Carlo analysis"));
    B.push({ t: "p", text: tr("{runs} runs of scenario \"{sc}\", each with every weight varied by up to ±{w} and every start value by up to ±{s} (random seed {seed}). {conv} of the runs settled.", {
      runs: m.runs, sc: m.scenarioName || tr("Baseline"), w: m.config?.weightSpread ?? 0, s: m.config?.initialSpread ?? 0, seed: m.config?.seed ?? "", conv: `${Math.round((m.convergenceRate ?? 0) * 100)}%`,
    }) });
    table(tr("Settled values over all runs: the unperturbed value, the median and the range of the middle 90%"), [tr("Concept"), tr("Unperturbed"), tr("Median"), tr("5th percentile"), tr("95th percentile")],
      (m.perConcept || []).map((c) => [c.name, f2(c.nominal), f2(c.median), f2(c.p5), f2(c.p95)]), [false, true, true, true, true]);
  }

  // ---- transition points -----------------------------------------------------
  if (transitionResult) {
    B.push({ t: "h1", text: tr("Transition points") });
    if (isStale(transitionResult)) staleNote(tr("the transition point analysis"));
    table(tr("Transition point of each outcome: the intervention level beyond which further increase adds little"), [tr("Outcome"), tr("Transition point"), tr("Share of the effect reached there"), tr("Total effect"), tr("Response type")],
      (transitionResult.rows || []).map((x) => [x.outcomeName, f2(x.tp), x.shareAtTp === null || x.shareAtTp === undefined ? "" : `${Math.round(x.shareAtTp * 100)}%`, signed(x.effect), x.responseType || ""]), [false, true, true, true, false]);
    fig("transitionCurves", tr("Response curves with their transition points."));
  }

  // ---- pathways --------------------------------------------------------------
  if (pathwayResult) {
    const p = pathwayResult;
    B.push({ t: "h1", text: tr("Transition pathways") });
    if (isStale(p)) staleNote(tr("the pathway analysis"));
    B.push({ t: "p", text: tr("{n} pathways were evaluated from the levers {levers}, toward the outcomes {outcomes}; {a} are admissible.", {
      n: p.candidates?.length ?? 0, a: p.summary?.counts?.admissible ?? 0,
      levers: (p.levers || []).map((l) => nm(l.id)).join(", "), outcomes: (p.outcomes || []).map((o) => nm(o.id)).join(", "),
    }) });
    const top = [...(p.candidates || [])].filter((c) => c.admissible).sort((a, b) => b.tog - a.tog).slice(0, 10);
    if (top.length) table(tr("The ten admissible pathways with the largest total outcome gain"), [tr("Pathway"), tr("Total outcome gain"), tr("Efficiency"), tr("Archetype")],
      top.map((c) => [pathwayText(c.stages || []), f2(c.tog), f2(c.pei), c.primary ? archetypeLabel(c.primary) : ""]), [false, true, true, false]);
    fig("pathwayPlane", tr("Effort and gain of every pathway."));
  }

  // ---- method ----------------------------------------------------------------
  B.push({ t: "h1", text: tr("Method and sources") });
  B.push({ t: "p", text: tr("The methods are described in the User Manual and the Methodological Annex of The Spaghetti Engine (About & documentation). Every number in this report, with the full results of each analysis, is in the Analysis Workbook (model menu, Export Analysis Workbook).") });
  return B;
}

// ---- HTML (print view; the browser saves it as PDF) ---------------------------
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A self-contained HTML page. images: { key: { dataUrl, width, height } }. */
export function reportToHtml(blocks, images = {}, { lang = "en", autoPrint = false } = {}) {
  const title = blocks.find((b) => b.t === "title")?.text || "Report";
  const body = blocks.map((b) => {
    switch (b.t) {
      case "title": return `<h1 class="title">${esc(b.text)}</h1>`;
      case "h1": return `<h2>${esc(b.text)}</h2>`;
      case "h2": return `<h3>${esc(b.text)}</h3>`;
      case "p": return `<p>${esc(b.text)}</p>`;
      case "note": return `<p class="note">${esc(b.text)}</p>`;
      case "list": return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
      case "table": return `<table><caption>${esc(b.caption)}</caption><thead><tr>${b.head.map((h, i) => `<th${b.numeric[i] ? ' class="n"' : ""} scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td${b.numeric[i] ? ' class="n"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      case "figure": {
        const im = images[b.key];
        return im ? `<figure><img src="${im.dataUrl}" alt="${esc(b.caption)}"><figcaption>${esc(b.caption)}</figcaption></figure>` : "";
      }
      default: return "";
    }
  }).join("\n");
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
@page { size: A4; margin: 20mm 18mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; color: #111; background: #fff; max-width: 170mm; margin: 24px auto; padding: 0 16px; }
h1.title { font-size: 18pt; margin: 0 0 6pt; }
h2 { font-size: 13pt; margin: 18pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; break-after: avoid; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; }
p.note { background: #f3f4f6; border-left: 3px solid #6b7280; padding: 4pt 8pt; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 12pt; font-size: 9pt; break-inside: auto; }
caption { text-align: left; font-weight: bold; padding-bottom: 3pt; caption-side: top; }
th, td { border-top: 1px solid #bbb; border-bottom: 1px solid #bbb; padding: 2pt 4pt; text-align: left; vertical-align: top; }
th { background: #eef0f2; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tr { break-inside: avoid; }
figure { margin: 8pt 0 14pt; break-inside: avoid; }
figure img { max-width: 100%; height: auto; border: 1px solid #ddd; }
figcaption { font-size: 9pt; margin-top: 3pt; }
.toolbar { position: sticky; top: 0; background: #fff; padding: 8px 0; border-bottom: 1px solid #ddd; margin-bottom: 12px; }
.toolbar button { font: inherit; padding: 6px 12px; }
@media print { .toolbar { display: none; } body { margin: 0; max-width: none; padding: 0; } }
</style></head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">${esc(tr("Print or save as PDF"))}</button></div>
${body}
${autoPrint ? "<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>" : ""}
</body></html>`;
}

// ---- Word (.docx) ---------------------------------------------------------------
/**
 * A Word document. `docx` is the docx library (import("docx")); images:
 * { key: { data (Uint8Array or ArrayBuffer), width, height } }. Returns the
 * docx Document; pack it with docx.Packer.toBlob (browser) or toBuffer (Node).
 */
export function reportToDocx(blocks, images, docx) {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, ShadingType, BorderStyle } = docx;
  const children = [];
  const MAX_W = 600; // pixels at 96 dpi: about 16 cm, the text width of an A4 page with 2.5 cm margins
  const border = { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" };
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  blocks.forEach((b) => {
    if (b.t === "title") children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(b.text)] }));
    else if (b.t === "h1") children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(b.text)] }));
    else if (b.t === "h2") children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] }));
    else if (b.t === "p") children.push(new Paragraph({ children: [new TextRun(b.text)], spacing: { after: 120 } }));
    else if (b.t === "note") children.push(new Paragraph({ children: [new TextRun({ text: b.text, italics: true })], shading: { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" }, spacing: { after: 120 } }));
    else if (b.t === "list") b.items.forEach((i) => children.push(new Paragraph({ children: [new TextRun(i)], bullet: { level: 0 } })));
    else if (b.t === "table") {
      children.push(new Paragraph({ children: [new TextRun({ text: b.caption, bold: true })], spacing: { before: 120, after: 60 }, keepNext: true }));
      const cell = (text, i, head) => new TableCell({
        children: [new Paragraph({ alignment: b.numeric[i] ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: String(text ?? ""), bold: head, size: 18 })] })],
        shading: head ? { type: ShadingType.CLEAR, fill: "EEF0F2", color: "auto" } : undefined,
        borders: { top: border, bottom: border, left: none, right: none },
        margins: { top: 30, bottom: 30, left: 60, right: 60 },
      });
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, i, true)) }), ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))],
      }));
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
    } else if (b.t === "figure") {
      const im = images?.[b.key];
      if (!im?.data) return;
      const scale = Math.min(1, MAX_W / (im.width || MAX_W));
      children.push(new Paragraph({ children: [new ImageRun({ type: "png", data: im.data, transformation: { width: Math.round((im.width || MAX_W) * scale), height: Math.round((im.height || MAX_W * 0.6) * scale) } })], keepNext: true }));
      children.push(new Paragraph({ children: [new TextRun({ text: b.caption, size: 18 })], spacing: { after: 200 } }));
    }
  });
  return new Document({
    creator: "The Spaghetti Engine",
    title: blocks.find((b) => b.t === "title")?.text || "Report",
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }],
  });
}
