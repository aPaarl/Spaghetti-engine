// ============================================================================
// Combining maps: several cognitive maps aggregated into one
// ============================================================================
// The usual way to build a group or community map from individual
// stakeholder maps (Kosko 1988; Özesmi and Özesmi 2004): concepts with the
// same name are taken to be the same concept, every map is written as a
// matrix over the union of all concepts, and the matrices are averaged,
// optionally weighted by a credibility value per map. Three choices of which
// maps count in the average for a relationship are offered:
//
//   all       every map; a map without the relationship counts as 0
//             (Kosko's augmented-matrix average)
//   both      only the maps that contain both concepts; a map that had the
//             concepts but drew no link between them counts as 0
//   present   only the maps that drew the relationship
//
// The functions here are pure (no React, no storage), so the tests can run
// them directly.
//
//   maps: [{ id, name, credibility, concepts, edges }]   (sanitized models)

// "Soil  Moisture." and "soil moisture" are the same concept.
export const normalizeConceptName = (name) =>
  String(name ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const mostCommon = (values) => {
  const counts = new Map();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  let best = values[0], n = 0;
  counts.forEach((c, v) => { if (c > n) { best = v; n = c; } });
  return best;
};

// Follows "same as" choices to their end, so A -> B -> C puts A in C; a
// loop of choices is cut where it closes.
function resolveMerge(key, merges) {
  const seen = new Set([key]);
  let k = key;
  while (merges[k] && !seen.has(merges[k])) { k = merges[k]; seen.add(k); }
  return k;
}

/**
 * Groups the concepts of all maps by name. merges maps a group key to the
 * key of another group it should join (the user's "same as" choices).
 * Returns { groups, keyOf } where keyOf(mapIndex, conceptId) gives a
 * concept's group key.
 */
export function matchConcepts(maps, merges = {}) {
  const byKey = new Map();
  const conceptKey = new Map();
  maps.forEach((m, mi) => (m.concepts || []).forEach((c) => {
    const own = normalizeConceptName(c.name) || `__${mi}_${c.id}`;
    const key = resolveMerge(own, merges);
    conceptKey.set(`${mi}|${c.id}`, key);
    if (!byKey.has(key)) byKey.set(key, { key, ownKeys: new Set(), members: [] });
    const g = byKey.get(key);
    g.ownKeys.add(own);
    g.members.push({ mapIndex: mi, conceptId: c.id, concept: c });
  }));
  const groups = [...byKey.values()].map((g) => ({
    key: g.key,
    ownKeys: [...g.ownKeys],
    name: mostCommon(g.members.map((x) => x.concept.name)),
    members: g.members,
    mapIndexes: [...new Set(g.members.map((x) => x.mapIndex))].sort((a, b) => a - b),
  }));
  return { groups, keyOf: (mi, id) => conceptKey.get(`${mi}|${id}`) };
}

// Each map as { concepts: Set<key>, edges: Map<"a>b", { weight, lag }> } over
// group keys. Two concepts of one map that fall in the same group have their
// relationships averaged; a relationship that becomes a self-loop is dropped.
function mapsOverGroups(maps, keyOf) {
  let selfLoops = 0;
  const out = maps.map((m, mi) => {
    const concepts = new Set((m.concepts || []).map((c) => keyOf(mi, c.id)));
    const acc = new Map();
    (m.edges || []).forEach((e) => {
      const a = keyOf(mi, e.source), b = keyOf(mi, e.target);
      if (a === undefined || b === undefined) return;
      if (a === b) { selfLoops += 1; return; }
      const k = `${a}>${b}`;
      if (!acc.has(k)) acc.set(k, { sum: 0, n: 0, lags: [] });
      const x = acc.get(k);
      x.sum += Number(e.weight) || 0; x.n += 1;
      x.lags.push(Math.max(0, Math.round(Number(e.lag) || 0)));
    });
    const edges = new Map();
    acc.forEach((x, k) => edges.set(k, { weight: x.sum / x.n, lag: mostCommon(x.lags) }));
    return { concepts, edges };
  });
  return { perMap: out, selfLoops };
}

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Pairwise comparison of the maps over the matched concepts:
 *   concepts       Jaccard index of the concept sets
 *   relationships  Jaccard index of the relationship sets (direction counts)
 *   signAgreement  share of the shared relationships with the same sign
 *   weightDiff     mean absolute weight difference over the relationships of
 *                  either map among the concepts both maps contain (0 = the
 *                  maps say the same about their common ground)
 */
export function compareMaps(maps, merges = {}) {
  const { keyOf } = matchConcepts(maps, merges);
  const { perMap } = mapsOverGroups(maps, keyOf);
  const pairs = [];
  for (let i = 0; i < perMap.length; i++) for (let j = i + 1; j < perMap.length; j++) {
    const A = perMap[i], B = perMap[j];
    const sharedC = [...A.concepts].filter((k) => B.concepts.has(k));
    const unionC = new Set([...A.concepts, ...B.concepts]);
    const eA = new Set(A.edges.keys()), eB = new Set(B.edges.keys());
    const sharedE = [...eA].filter((k) => eB.has(k));
    const unionE = new Set([...eA, ...eB]);
    const sameSign = sharedE.filter((k) => Math.sign(A.edges.get(k).weight) === Math.sign(B.edges.get(k).weight)).length;
    const common = new Set(sharedC);
    const onCommon = [...unionE].filter((k) => { const [a, b] = k.split(">"); return common.has(a) && common.has(b); });
    const diff = onCommon.reduce((s, k) => s + Math.abs((A.edges.get(k)?.weight ?? 0) - (B.edges.get(k)?.weight ?? 0)), 0);
    pairs.push({
      a: i, b: j,
      sharedConcepts: sharedC.length, sharedRelationships: sharedE.length,
      concepts: unionC.size ? round(sharedC.length / unionC.size) : 1,
      relationships: unionE.size ? round(sharedE.length / unionE.size) : 1,
      signAgreement: sharedE.length ? round(sameSign / sharedE.length) : null,
      weightDiff: onCommon.length ? round(diff / onCommon.length) : null,
    });
  }
  return pairs;
}

export const DEFAULT_AGGREGATION = { rule: "all", minMaps: 1, minAbsWeight: 0 };

/**
 * Combines the maps into one model. options: { rule, minMaps, minAbsWeight,
 * merges }. Returns { concepts, edges, settings, report }.
 */
export function aggregateMaps(maps, options = {}) {
  const { rule, minMaps, minAbsWeight } = { ...DEFAULT_AGGREGATION, ...options };
  const merges = options.merges || {};
  const uid = options.uid || ((p) => `${p}_${Math.random().toString(36).slice(2, 9)}`);
  const N = maps.length;
  const cred = maps.map((m) => { const c = Number(m.credibility); return Number.isFinite(c) && c >= 0 ? c : 1; });
  const { groups, keyOf } = matchConcepts(maps, merges);
  const { perMap, selfLoops } = mapsOverGroups(maps, keyOf);

  // concepts ----------------------------------------------------------------
  // Placed where the first map (in the order given) drew them; a concept that
  // would land on top of another is moved aside.
  const idOf = new Map();
  const placed = [];
  const free = (p) => !placed.some((q) => Math.abs(q.x - p.x) < 150 && Math.abs(q.y - p.y) < 70);
  const concepts = groups.map((g) => {
    const first = g.members[0].concept;
    let pos = { x: Number(first.position?.x) || 0, y: Number(first.position?.y) || 0 };
    for (let n = 0; !free(pos) && n < 200; n++) pos = { x: pos.x + 40, y: pos.y + (n % 2 ? 90 : 0) };
    placed.push(pos);
    let wSum = 0, cSum = 0;
    g.mapIndexes.forEach((mi) => {
      const vals = g.members.filter((x) => x.mapIndex === mi).map((x) => Number(x.concept.initialValue) || 0);
      wSum += cred[mi] * (vals.reduce((s, v) => s + v, 0) / vals.length); cSum += cred[mi];
    });
    const id = uid("c");
    idOf.set(g.key, id);
    const categories = g.members.map((x) => String(x.concept.category || "").trim()).filter(Boolean);
    const initialValue = cSum > 0 ? round(wSum / cSum) : 0;
    return {
      id, name: g.name,
      category: categories.length ? mostCommon(categories) : "",
      description: g.members.map((x) => String(x.concept.description || "").trim()).find(Boolean) || "",
      initialValue, currentValue: initialValue, position: pos,
      aggregation: { maps: g.mapIndexes.length, of: N, inMaps: g.mapIndexes.map((mi) => maps[mi].name), names: [...new Set(g.members.map((x) => x.concept.name))] },
    };
  });

  // relationships ------------------------------------------------------------
  const allKeys = new Set();
  perMap.forEach((m) => m.edges.forEach((_, k) => allKeys.add(k)));
  const edges = [];
  const dropped = { fewMaps: 0, weak: 0, zero: 0 };
  const conflicts = [];
  const nameOfKey = new Map(groups.map((g) => [g.key, g.name]));
  [...allKeys].sort().forEach((k) => {
    const [a, b] = k.split(">");
    const present = perMap.map((m, mi) => (m.edges.has(k) ? mi : -1)).filter((mi) => mi >= 0);
    const counted = rule === "present" ? present
      : rule === "both" ? perMap.map((m, mi) => (m.concepts.has(a) && m.concepts.has(b) ? mi : -1)).filter((mi) => mi >= 0)
      : perMap.map((_, mi) => mi);
    const cSum = counted.reduce((s, mi) => s + cred[mi], 0);
    if (present.length < minMaps) { dropped.fewMaps += 1; return; }
    if (cSum <= 0) { dropped.zero += 1; return; }
    const weight = round(counted.reduce((s, mi) => s + cred[mi] * (perMap[mi].edges.get(k)?.weight ?? 0), 0) / cSum);
    if (weight === 0) { dropped.zero += 1; return; }
    if (Math.abs(weight) < minAbsWeight) { dropped.weak += 1; return; }
    const ws = present.map((mi) => perMap[mi].edges.get(k).weight);
    const mean = ws.reduce((s, v) => s + v, 0) / ws.length;
    const sd = Math.sqrt(ws.reduce((s, v) => s + (v - mean) ** 2, 0) / ws.length);
    const signConflict = ws.some((v) => v > 0) && ws.some((v) => v < 0);
    if (signConflict) conflicts.push({ from: nameOfKey.get(a), to: nameOfKey.get(b), weights: present.map((mi) => ({ map: maps[mi].name, weight: round(perMap[mi].edges.get(k).weight, 3) })) });
    const lags = present.map((mi) => perMap[mi].edges.get(k).lag);
    const lag = mostCommon(lags);
    const edge = {
      id: uid("e"), source: idOf.get(a), target: idOf.get(b), weight,
      description: `Combined from ${present.length} of ${N} maps: ${present.map((mi) => `${maps[mi].name} ${round(perMap[mi].edges.get(k).weight, 2)}`).join(", ")}.${signConflict ? " The maps disagree on the sign." : ""}`,
      aggregation: { maps: present.length, of: N, sd: round(sd, 3), signConflict },
    };
    if (lag > 0) edge.lag = lag;
    edges.push(edge);
  });

  const inAll = groups.filter((g) => g.mapIndexes.length === N).length;
  const inOne = groups.filter((g) => g.mapIndexes.length === 1).length;
  return {
    concepts, edges,
    settings: maps[0]?.settings,
    report: {
      maps: N, rule, minMaps, minAbsWeight,
      concepts: concepts.length, conceptsInAll: inAll, conceptsInOne: inOne,
      relationships: edges.length, candidateRelationships: allKeys.size,
      dropped, selfLoops, conflicts,
    },
  };
}
