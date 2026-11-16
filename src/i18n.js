// ============================================================================
// Language: English (default) or Dutch
// ============================================================================
// The interface is written in English; t("English text") returns the Dutch
// text when Dutch is chosen and a translation exists, and the English text
// otherwise, so a screen that is not yet translated simply stays English.
// The choice is kept in this browser; switching reloads the page (the model
// is saved first), which keeps every module-level label consistent.
import NL from "./i18n.nl.js";

const KEY = "se.lang";
let lang = "en";
try { const v = localStorage.getItem(KEY); if (v === "nl" || v === "en") lang = v; } catch { /* storage unavailable: English */ }
try { if (typeof document !== "undefined") document.documentElement.lang = lang; } catch { /* no document */ }

export const getLang = () => lang;
export function setLang(next) {
  try { localStorage.setItem(KEY, next); } catch { /* not kept */ }
}

/** The text in the chosen language; {name} placeholders are filled from `vars`. */
export function t(en, vars) {
  let s = lang === "nl" && NL[en] !== undefined ? NL[en] : en;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}
/** Pick between two versions of a longer text or a data object. */
export const pick = (en, nl) => (lang === "nl" && nl !== undefined ? nl : en);
