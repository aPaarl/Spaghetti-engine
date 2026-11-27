// ============================================================================
// Saved analysis results: the last results of each model, kept in this browser
// ============================================================================
// Until 0.5.7 every analysis result lived only in memory, so a reload (or
// opening another model and coming back) meant running every analysis again.
// The results are now kept per model in IndexedDB, next to the models in
// localStorage: results can be large (Monte Carlo keeps every run), and
// IndexedDB keeps them out of the few megabytes that localStorage has for
// the models themselves. Each result carries the signature of the model it
// was computed on; when the model has changed since, the result comes back
// marked as out of date, exactly as when the model is edited in a session.
//
// Everything is wrapped: a browser without IndexedDB, with storage blocked,
// or with a full disk simply does not keep the results.

const DB_NAME = "spaghetti-engine-results";
const STORE = "results";
const VERSION = 1;
export const RESULTS_FORMAT = 1;

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve) => {
    if (!db) { resolve(null); return; }
    try {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && "result" in req ? req.result : true);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
    } catch { resolve(null); }
  }));
}

// A result is stored as a structured clone (which keeps Infinity, NaN, Maps
// and Sets as they are). A stray function or DOM node would make the whole
// write fail, so such a result falls back to its JSON form, and a result that
// cannot be stored either way is left out.
const plain = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch { return null; } };
const storable = (v) => {
  try { if (typeof structuredClone === "function") return structuredClone(v); } catch { /* not clonable: try JSON */ }
  return plain(v);
};

/** Saves the results of one model: { savedAt, entries: { name: { sig, value } }, extra }. */
export function saveResults(modelId, entries, extra = {}) {
  if (!modelId) return Promise.resolve(null);
  const record = { format: RESULTS_FORMAT, savedAt: Date.now(), entries: {}, extra: storable(extra) || {} };
  Object.entries(entries).forEach(([k, e]) => {
    if (!e || e.value === null || e.value === undefined) return;
    const value = storable(e.value);
    if (value !== null) record.entries[k] = { sig: e.sig ?? null, value };
  });
  return tx("readwrite", (s) => s.put(record, modelId));
}

/** The saved results of one model, or null. */
export function loadResults(modelId) {
  if (!modelId) return Promise.resolve(null);
  return tx("readonly", (s) => s.get(modelId)).then((r) => (r && r.format === RESULTS_FORMAT && r.entries ? r : null));
}

/** Forgets the results of one model (when the model is deleted). */
export function deleteResults(modelId) {
  if (!modelId) return Promise.resolve(null);
  return tx("readwrite", (s) => s.delete(modelId));
}
