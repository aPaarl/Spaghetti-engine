// The analysis report (src/analysisReport.js): blocks built from real engine results, and both renderers.
// Run from the project folder:  node tests/test_analysis_report.mjs
import { createRequire } from "node:module";
import * as docx from "docx";
import { buildReport, reportToHtml, reportToDocx } from "../src/analysisReport.js";
import { PEAT_TODAY } from "../src/workedExamples.js";
const engine = createRequire(import.meta.url)("./engine.cjs");

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed += 1; console.log("PASS " + m); } else { failed += 1; console.log("FAIL " + m); } };
const S = engine.DEFAULT_SETTINGS;
const { concepts, edges } = PEAT_TODAY;
const drivers = { wl: 0.2, sub: 0.6 };
const baseline = { id: "baseline", name: "Baseline", type: "baseline", initialOverrides: drivers, lockedConcepts: drivers, weightOverrides: {} };
const raise = { id: "s1", name: "Raise the water level <now>", type: "intervention", description: "", initialOverrides: { ...drivers, wl: 0.8 }, lockedConcepts: { ...drivers, wl: 0.8 }, weightOverrides: {}, timing: { wl: { start: 5 } } };
const results = { baseline: engine.simulate(concepts, edges, baseline, S), s1: engine.simulate(concepts, edges, raise, S) };
const baselineResult = { ...results.baseline, __modelVersion: 3 };
const input = {
  modelName: "Peat & meadow", version: "0.5.8", date: new Date(2026, 10, 27), concepts, edges, settings: S, scenarios: [baseline, raise],
  moduleOf: (c) => c.category, results, compareIds: ["s1"], scenarioChanges: (s) => (s.id === "s1" ? [{ name: "Ditch water level", text: "held at 0.8, from iteration 5" }] : []),
  baselineResult, isStale: (r) => r.__modelVersion !== 3, figures: { baselineConvergence: true },
};
const blocks = buildReport(input);
const text = (b) => [b.text, b.caption, ...(b.items || []), ...(b.head || []), ...((b.rows || []).flat())].filter(Boolean).join(" ");
const all = blocks.map(text).join("\n");

ok(blocks[0].t === "title" && /Peat & meadow/.test(blocks[0].text), "the title names the model");
ok(blocks.some((b) => b.t === "note" && /not forecasts/.test(b.text)), "the report says results are not forecasts");
const conceptTable = blocks.find((b) => b.t === "table" && /Concepts/.test(b.caption));
ok(conceptTable && conceptTable.rows.length === concepts.length, "a table of all concepts");
const relTable = blocks.find((b) => b.t === "table" && /Relationships/.test(b.caption));
ok(relTable && relTable.head.includes("Delay") && relTable.rows.some((r) => r[3] === "2"), "the relationships table shows the delay where the model has one");
ok(/settles after \d+ iterations/.test(all), "the baseline sentence gives the iterations");
const baseTable = blocks.find((b) => b.t === "table" && /without intervention/.test(b.caption));
ok(baseTable && baseTable.rows.find((r) => r[0] === "Drainage depth")[2] === results.baseline.final.dd.toFixed(2), "baseline values come from the run");
ok(blocks.some((b) => b.t === "list" && /from iteration 5/.test(b.items[0])), "the scenario list describes the change and its timing");
const scTable = blocks.find((b) => b.t === "table" && /each scenario/.test(b.caption));
ok(scTable && scTable.head.length === 4, "the scenario table has the baseline, the scenario and the difference");
ok(blocks.filter((b) => b.t === "figure").map((b) => b.key).join() === "baselineConvergence", "only figures that exist are included");
ok(/Table 1\./.test(all) && /Figure 1\./.test(all), "tables and figures are numbered");
ok(!blocks.some((b) => b.t === "note" && /has changed since/.test(b.text)), "no out-of-date note for current results");
const stale = buildReport({ ...input, baselineResult: { ...baselineResult, __modelVersion: 1 }, resultsStale: true });
ok(stale.filter((b) => b.t === "note" && /has changed since/.test(b.text)).length === 2, "out-of-date baseline and scenarios are marked");
const empty = buildReport({ modelName: "Empty" });
ok(empty.some((b) => /Not run/.test(b.text || "")), "an empty model gives a report that says what has not been run");
ok(!empty.some((b) => b.t === "h1" && /Sensitivity|Monte Carlo|Transition/.test(b.text)), "analyses that were not run are left out");

// HTML
const html = reportToHtml(blocks, { baselineConvergence: { dataUrl: "data:image/png;base64,AAAA", width: 400, height: 200 } });
ok(html.startsWith("<!doctype html>") && /<title>Analysis report: Peat &amp; meadow<\/title>/.test(html), "HTML: a complete page, with the title escaped");
ok(/Raise the water level &lt;now&gt;/.test(html) && !/<now>/.test(html), "HTML: text is escaped");
ok(/<img src="data:image\/png;base64,AAAA"/.test(html) && /@page/.test(html), "HTML: the figure and print styles are included");
ok(!/window.print\(\), 300/.test(html) && /window.print\(\), 300/.test(reportToHtml(blocks, {}, { autoPrint: true })), "HTML: printing starts only when asked");

// Word
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const buf = await docx.Packer.toBuffer(reportToDocx(blocks, { baselineConvergence: { data: png, width: 1200, height: 600 } }, docx));
ok(buf.length > 5000 && buf[0] === 0x50 && buf[1] === 0x4b, `Word: a .docx (zip) file is written (${buf.length} bytes)`);
const { execFileSync } = await import("node:child_process");
const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const tmp = path.join(os.tmpdir(), `report-test-${process.pid}.docx`);
fs.writeFileSync(tmp, buf);
let xml = "";
try { xml = execFileSync("unzip", ["-p", tmp, "word/document.xml"], { encoding: "utf8", maxBuffer: 1 << 26 }); } catch { xml = ""; }
fs.unlinkSync(tmp);
if (xml) {
  ok(/Analysis report: Peat &amp; meadow/.test(xml), "Word: the title is in the document");
  ok((xml.match(/<w:tbl>/g) || []).length === blocks.filter((b) => b.t === "table").length, "Word: one table per table block");
  ok(/<w:drawing>/.test(xml), "Word: the figure is embedded");
} else console.log("(unzip not available: the content checks of the Word file are skipped)");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
