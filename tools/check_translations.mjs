// Lists the interface texts that have no Dutch translation yet.
// Run from the project folder:  npm run i18n:check            (a summary per file, and every missing text)
//                               npm run i18n:check -- --json  (the same as JSON, for other tools)
//                               npm run i18n:check -- --unused (also Dutch entries that no code uses any more)
//
// Every text the interface shows in Dutch goes through tr("English text") (see src/i18n.js), and its translation is
// the entry with that English text as key in src/i18n.nl.js. This script finds each tr("...") with a literal
// string in src/, and reports those without an entry. Texts built at run time (tr(variable), template strings) cannot
// be checked this way and are counted separately. A missing text is shown in English, so the list is a to-do list,
// not an error: the script always exits with code 0 unless --strict is given.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const args = new Set(process.argv.slice(2));
const NL = (await import(join(src, "i18n.nl.js"))).default;

const files = readdirSync(src, { recursive: true }).map(String).filter((f) => /\.(jsx?|mjs)$/.test(f) && !/i18n(\.nl)?\.js$/.test(f));
// tr("...") or tr('...') with a literal first argument; escaped quotes are allowed inside
const re = /\btr\(\s*(["'])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const unescape = (s) => s.replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
const missing = new Map(); // text -> [file:line]
const used = new Set();
let literal = 0, dynamic = 0;
for (const f of files) {
  const text = readFileSync(join(src, f), "utf8");
  const lineOf = (i) => text.slice(0, i).split("\n").length;
  for (const m of text.matchAll(re)) {
    literal += 1;
    const s = unescape(m[2]);
    used.add(s);
    if (NL[s] === undefined) {
      if (!missing.has(s)) missing.set(s, []);
      missing.get(s).push(`${f}:${lineOf(m.index)}`);
    }
  }
  dynamic += (text.match(/\btr\(\s*[^"'\s)]/g) || []).length;
}
const unused = Object.keys(NL).filter((k) => !used.has(k));

if (args.has("--json")) {
  console.log(JSON.stringify({ literal, dynamic, missing: [...missing].map(([text, where]) => ({ text, where })), unused: args.has("--unused") ? unused : undefined }, null, 2));
} else {
  const byFile = new Map();
  missing.forEach((where) => { const f = where[0].split(":")[0]; byFile.set(f, (byFile.get(f) || 0) + 1); });
  console.log(`${literal} translated texts in the code (${new Set(used).size} different), ${dynamic} built at run time (not checked).`);
  console.log(`${missing.size} different texts have no Dutch translation${missing.size ? ":" : "."}`);
  [...byFile].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`  ${String(n).padStart(4)}  ${f}`));
  if (missing.size) {
    console.log("");
    [...missing].forEach(([text, where]) => console.log(`- ${JSON.stringify(text)}  (${where[0]}${where.length > 1 ? ` and ${where.length - 1} more` : ""})`));
  }
  if (args.has("--unused")) {
    console.log(`\n${unused.length} Dutch entries are not used by any literal tr("...") (some may be used through a variable):`);
    unused.forEach((k) => console.log(`- ${JSON.stringify(k)}`));
  }
}
process.exit(args.has("--strict") && missing.size ? 1 : 0);
