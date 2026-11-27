// Runs every test file in this folder and reports the totals. Run from the project folder:  npm test
//
// Each test file is a plain Node script that prints "N passed, M failed" and exits with code 1 on a failure.
// This runner starts them one after another, prints a summary line per file, and exits with code 1 when any
// file fails, so that the same command works on a laptop and in the GitHub check. A file name can be given
// to run only the files that contain it, for example:  npm test -- lags
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || "";
const files = readdirSync(here).filter((f) => /^test_.*\.(c|m)?js$/.test(f) && f.includes(filter)).sort();
if (!files.length) { console.error(`No test files match "${filter}".`); process.exit(1); }

const verbose = process.env.VERBOSE === "1";
let failedFiles = 0, totalPass = 0, totalFail = 0;
const started = Date.now();
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(here, f)], { cwd: join(here, ".."), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  const pass = m ? +m[1] : 0, fail = m ? +m[2] : 0;
  totalPass += pass; totalFail += fail;
  const ok = r.status === 0 && m && fail === 0;
  if (!ok) failedFiles++;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${ok ? "ok  " : "FAIL"} ${f.padEnd(38)} ${m ? `${pass} passed, ${fail} failed` : "no summary line"}  (${secs} s)`);
  if (!ok || verbose) {
    const shown = ok ? out : out.split("\n").filter((l) => !/^PASS /.test(l)).join("\n");
    console.log(shown.replace(/^/gm, "     "));
  }
}
console.log(`\n${files.length - failedFiles} of ${files.length} files passed; ${totalPass} checks passed, ${totalFail} failed (${((Date.now() - started) / 1000).toFixed(1)} s).`);
process.exit(failedFiles ? 1 : 0);
