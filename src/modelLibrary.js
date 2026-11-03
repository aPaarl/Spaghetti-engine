// ============================================================================
// Model library: several named models saved in this browser
// ============================================================================
// Replaces the single autosave slot of 0.4.x. An index lists the models
// (id, name, size, dates) and remembers which one is open; each model's
// content is stored under its own key, so opening the list never has to read
// every model. Everything is plain localStorage, wrapped so that a browser
// with storage blocked or full still works (the model just isn't kept).
//
//   spaghetti-engine:library:v1      { activeId, models: [{ id, name, createdAt, updatedAt, concepts, relationships }] }
//   spaghetti-engine:model:<id>      { v: 1, savedAt, concepts, edges, scenarios, settings }
//
// The 0.4.x slot (spaghetti-engine:autosave:v1) is moved into the library the
// first time 0.5 opens, as a model named "My model".

export const LEGACY_AUTOSAVE_KEY = "spaghetti-engine:autosave:v1";
const INDEX_KEY = "spaghetti-engine:library:v1";
const MODEL_PREFIX = "spaghetti-engine:model:";
export const modelKey = (id) => MODEL_PREFIX + id;

const read = (key) => {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
};
const write = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};
const remove = (key) => { try { localStorage.removeItem(key); } catch { /* nothing to remove */ } };
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function readIndex() {
  const idx = read(INDEX_KEY);
  if (!idx || !Array.isArray(idx.models)) return null;
  return { activeId: idx.activeId, models: idx.models.filter((m) => m && m.id) };
}
function writeIndex(idx) { write(INDEX_KEY, idx); return idx; }

// A name not yet used in the library ("My model", "My model (2)", ...).
export function uniqueName(idx, base) {
  const taken = new Set((idx?.models || []).map((m) => m.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
}

const entryFor = (id, name, payload, createdAt) => ({
  id, name, createdAt: createdAt ?? Date.now(), updatedAt: payload.savedAt ?? Date.now(),
  concepts: payload.concepts?.length ?? 0, relationships: payload.edges?.length ?? 0,
});

/**
 * Opens the library: returns { index, activeId, raw, isNew, migrated }.
 * raw is the active model's stored content (not yet sanitized) or null for a
 * brand-new empty model.
 */
export function bootLibrary() {
  let idx = readIndex();
  if (idx && idx.models.length) {
    let activeId = idx.models.some((m) => m.id === idx.activeId) ? idx.activeId : idx.models[0].id;
    if (activeId !== idx.activeId) idx = writeIndex({ ...idx, activeId });
    return { index: idx, activeId, raw: read(modelKey(activeId)), isNew: false, migrated: false };
  }
  // First visit with the library: bring along a model saved by 0.4.x.
  const legacy = read(LEGACY_AUTOSAVE_KEY);
  const id = newId();
  if (legacy && Array.isArray(legacy.concepts) && legacy.concepts.length) {
    const payload = { v: 1, savedAt: legacy.savedAt ?? Date.now(), concepts: legacy.concepts, edges: legacy.edges || [], scenarios: legacy.scenarios, settings: legacy.settings };
    write(modelKey(id), payload);
    idx = writeIndex({ activeId: id, models: [entryFor(id, "My model", payload)] });
    // the 0.4.x slot is left in place, so an older version could still read it
    return { index: idx, activeId: id, raw: payload, isNew: false, migrated: true };
  }
  const payload = { v: 1, savedAt: Date.now(), concepts: [], edges: [] };
  write(modelKey(id), payload);
  idx = writeIndex({ activeId: id, models: [entryFor(id, "My first model", payload)] });
  return { index: idx, activeId: id, raw: null, isNew: true, migrated: false };
}

/** Saves a model's content and refreshes its line in the index. Returns the new index. */
export function saveModel(id, payload) {
  const ok = write(modelKey(id), payload);
  const idx = readIndex() || { activeId: id, models: [] };
  const at = idx.models.findIndex((m) => m.id === id);
  const prev = at >= 0 ? idx.models[at] : null;
  const entry = entryFor(id, prev?.name ?? "Untitled model", payload, prev?.createdAt);
  const models = at >= 0 ? idx.models.map((m, i) => (i === at ? entry : m)) : [...idx.models, entry];
  return { index: writeIndex({ ...idx, models }), ok };
}

export function loadModel(id) { return read(modelKey(id)); }

export function setActive(id) {
  const idx = readIndex();
  return idx ? writeIndex({ ...idx, activeId: id }) : idx;
}

/** Adds a model (empty unless payload is given) and makes it the open one. */
export function createModel(name, payload = null) {
  const idx = readIndex() || { activeId: null, models: [] };
  const id = newId();
  const content = payload ? { v: 1, ...payload, savedAt: Date.now() } : { v: 1, savedAt: Date.now(), concepts: [], edges: [] };
  write(modelKey(id), content);
  const index = writeIndex({ activeId: id, models: [...idx.models, entryFor(id, uniqueName(idx, name), content)] });
  return { index, id, payload: content };
}

export function renameModel(id, name) {
  const idx = readIndex();
  if (!idx) return idx;
  const clean = String(name || "").trim() || "Untitled model";
  return writeIndex({ ...idx, models: idx.models.map((m) => (m.id === id ? { ...m, name: clean } : m)) });
}

/** A copy of a stored model, named "<name> (copy)". Does not open it. */
export function duplicateModel(id) {
  const idx = readIndex();
  const src = idx?.models.find((m) => m.id === id);
  const content = read(modelKey(id));
  if (!src || !content) return idx;
  const newIdValue = newId();
  const copy = { ...content, savedAt: Date.now() };
  write(modelKey(newIdValue), copy);
  return writeIndex({ ...idx, models: [...idx.models, entryFor(newIdValue, uniqueName(idx, `${src.name} (copy)`), copy)] });
}

/** Removes a model. If it was the open one, the caller opens another. */
export function deleteModel(id) {
  const idx = readIndex();
  if (!idx) return idx;
  remove(modelKey(id));
  remove(`spaghetti-engine:pathways-setup:v1:${id}`);
  const models = idx.models.filter((m) => m.id !== id);
  return writeIndex({ activeId: idx.activeId === id ? (models[0]?.id ?? null) : idx.activeId, models });
}
