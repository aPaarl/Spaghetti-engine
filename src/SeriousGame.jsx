// The Meinweg serious game: a guided, roughly 30-minute tutorial on system
// modelling, fuzzy cognitive maps and the Spaghetti Engine itself.
//
// The player is the analyst of a fictional park board for the Meinweg, a
// national park in Limburg; the people and events are invented. The game sets the
// system boundaries and the questions the model has to answer, and offers
// stakeholder interviews as evidence, but it never prescribes concepts: the
// player builds their own map in the real tool, in a model of its own, and the
// game follows along by reading what that model holds. Quiz questions about
// the player's own map are generated from it, so they have no fixed answer.
import React, { useEffect, useMemo, useState } from "react";
import {
  Gamepad2, Trophy, Timer, X, ChevronRight, ChevronLeft, ChevronDown, CheckCircle2, Circle, Target, Users, Lightbulb,
  Flag, MessageSquareQuote, Download, Star, MapPin, RotateCcw,
} from "lucide-react";

const GAME_KEY = "se.game.v2";
const GAME_MODEL_NAME = "Meinweg (serious game)";

export function readGameState() {
  try { const g = JSON.parse(localStorage.getItem(GAME_KEY) || "null"); if (g && typeof g === "object") return g; } catch { /* storage unavailable */ }
  return null;
}
function freshGame() {
  return { chapter: 0, startedAt: null, modelId: null, answers: {}, missions: {}, notes: "", texts: {}, interviewsRead: [], finishedAt: null };
}

// ---- the case -----------------------------------------------------------------------

const BOUNDARIES = [
  { label: "Place", text: "The Meinweg national park and its edge: the heath, the pine and oak forest, the fens and the valley of the Roode Beek, with the farmland, the village and the holiday parks along the western side. The Roer valley and the forest across the German border are outside." },
  { label: "Time", text: "The next 20 years. Slow changes count (groundwater that recovers, pine forest that turns into mixed forest); one-off events such as a single storm do not." },
  { label: "Scope", text: "Water, nature, farming, recreation and the livelihoods of the people at the edge of the park." },
  { label: "Outside, but felt", text: "Climate, national nitrogen rules, and milk and pork prices cannot be changed from the Meinweg. They may enter your map as drivers: concepts with arrows going out but none coming in." },
  { label: "Size", text: "Between 8 and 20 concepts. A map that fits on one screen can be discussed with the people it is about." },
];

const QUESTIONS = [
  { id: "q1", short: "Causes", text: "What causes the drying out of the wet heath and fens in the Meinweg, and through which chains of cause and effect?" },
  { id: "q2", short: "Loops", text: "Which feedback loops keep the park in its current state?" },
  { id: "q3", short: "Intervention", text: "Which intervention would help the park most, and who bears its costs?" },
  { id: "q4", short: "Blind spots", text: "What does your map leave out, and how could that change your advice?" },
];

const INTERVIEWS = [
  { id: "farmer", who: "Huub Peeters", role: "Dairy farmer at the edge of the park", quote: "In dry summers I water the maize from my own well, otherwise there is no fodder for the cows. They say my pumping lowers the water in the fens, but without it the farm does not pay. And now the nitrogen rules as well. If my land has to become a buffer zone, the farm closes, and my son will not take it over." },
  { id: "camp", who: "Ellen Coenen", role: "Owner of a holiday park in the village", quote: "People come for the purple heath, the adders and the quiet. Last summer the park was closed for a week because of the fire risk, and the cancellations came in the same day. More visitors bring money to the village, but also more trampling and more cigarette ends in dry grass. Without attractive nature we have no business." },
  { id: "ecologist", who: "Dr. Lotte Hermans", role: "Heathland ecologist", quote: "The wet heath and the fens need high groundwater. Pumping, old drainage ditches and drier summers all lower it. Nitrogen from the air fertilises the poor soil, so grass and birch take over from the heather. The dense pine plantations use a lot of water as well. And dry, grassy heath burns easily: after a fire the grass returns first, which makes the next fire more likely." },
  { id: "water", who: "Ruud Smeets", role: "Regional water board", quote: "We can close the old drainage ditches in the Roode Beek valley and limit pumping permits. That raises the groundwater, but some fields along the park get wetter and yield less. The farmers will want compensation, and our budget for this is small." },
  { id: "alderman", who: "Mieke Willems", role: "Alderman, municipality at the park's edge", quote: "We have a budget of a few million for the coming years. Buying out farms next to the park, turning pine into mixed forest, closing ditches, more rangers in summer: all possible. But money spent on one thing cannot be spent on another, and my voters care about jobs and holiday parks as much as about the heath." },
];

// ---- reading the player's model --------------------------------------------------------

const ACTOR_WORDS = /^(the )?(farmers?|tourists?|people|government|municipality|province|ecologists?|campsites?|villagers?|residents?|water board|alderman|rangers?|stakeholders?|the park|park|holiday parks?|heath|forest|nature|farm(ing)?|tourism|recreation|economy)$/i;

function findLoops(concepts, edges, max = 25) {
  const ids = concepts.map((c) => c.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = new Map(ids.map((id) => [id, []]));
  edges.forEach((e) => { if (e.source !== e.target && out.has(e.source) && index.has(e.target)) out.get(e.source).push(e); });
  const loops = [];
  const seen = new Set();
  for (const start of ids) {
    const s = index.get(start);
    const stack = [[start, [start], []]];
    while (stack.length && loops.length < max) {
      const [node, path, path_edges] = stack.pop();
      for (const e of out.get(node) || []) {
        if (e.target === start && path.length >= 2) {
          const key = [...path].sort().join("|");
          if (!seen.has(key)) { seen.add(key); loops.push({ nodes: [...path], edges: [...path_edges, e] }); }
        } else if (!path.includes(e.target) && index.get(e.target) > s && path.length < 7) {
          stack.push([e.target, [...path, e.target], [...path_edges, e]]);
        }
      }
    }
  }
  return loops.map((l) => ({ ...l, reinforcing: l.edges.filter((e) => e.weight < 0).length % 2 === 0 })).sort((a, b) => a.nodes.length - b.nodes.length);
}

function modelStats(concepts, edges) {
  const modules = new Set(concepts.map((c) => (c.category || "").trim()).filter(Boolean));
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  const loops = findLoops(concepts, edges);
  const outStrength = new Map(concepts.map((c) => [c.id, 0]));
  const inCount = new Map(concepts.map((c) => [c.id, 0]));
  edges.forEach((e) => {
    if (outStrength.has(e.source)) outStrength.set(e.source, outStrength.get(e.source) + Math.abs(e.weight));
    if (inCount.has(e.target) && e.source !== e.target) inCount.set(e.target, inCount.get(e.target) + 1);
  });
  return {
    nConcepts: concepts.length,
    modules: [...modules],
    nEdges: edges.length,
    nNegative: edges.filter((e) => e.weight < 0).length,
    isolated: concepts.filter((c) => !linked.has(c.id)),
    actorLike: concepts.filter((c) => ACTOR_WORDS.test((c.name || "").trim())),
    loops,
    outStrength,
    drivers: concepts.filter((c) => inCount.get(c.id) === 0 && edges.some((e) => e.source === c.id)),
    started: concepts.filter((c) => Math.abs(Number(c.initialValue) || 0) > 1e-9),
  };
}

const nameOf = (concepts, id) => concepts.find((c) => c.id === id)?.name || id;
const fmt = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

// Four options for a question about the player's own map: the right answer and
// three others spread over the rest of the ranking, in a fixed order.
function rankedOptions(concepts, score) {
  const ranked = [...concepts].sort((a, b) => score(b) - score(a));
  if (ranked.length < 4) return null;
  const pick = [ranked[0], ranked[Math.floor(ranked.length / 3)], ranked[Math.floor((2 * ranked.length) / 3)], ranked[ranked.length - 1]];
  const unique = [...new Map(pick.map((c) => [c.id, c])).values()];
  if (unique.length < 3) return null;
  const order = [...unique].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return { options: order.map((c) => c.name), correct: order.findIndex((c) => c.id === ranked[0].id), best: ranked[0] };
}

// ---- small building blocks -------------------------------------------------------------

function Card({ children, tone = "plain" }) {
  const cls = tone === "story" ? "bg-lagoon-50 border-lagoon-200" : tone === "tip" ? "bg-coral-50 border-coral-200" : tone === "done" ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200";
  return <div className={`rounded-xl border p-4 text-[16px] leading-[1.7] text-neutral-900 ${cls}`}>{children}</div>;
}

// An exercise: a number, a task, the steps to take, and a live check.
function Mission({ num, done, title, steps, detail, children }) {
  return (
    <div className={`rounded-xl border p-4 ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-300"}`} data-game-exercise={num}>
      <div className="flex items-start gap-3">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[14px] font-semibold ${done ? "bg-emerald-600 text-white" : "bg-lagoon-100 text-lagoon-800"}`}>
          {done ? <CheckCircle2 size={18} /> : num}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-neutral-500">Exercise {num}</div>
          <div className={`text-[17px] font-semibold leading-snug ${done ? "text-emerald-900" : "text-neutral-900"}`}>{title}</div>
          {steps && !done && (
            <ol className="mt-2 space-y-1.5">
              {steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-[16px] leading-relaxed text-neutral-900">
                  <span className="text-lagoon-700 font-semibold shrink-0">{i + 1}.</span><span>{st}</span>
                </li>
              ))}
            </ol>
          )}
          {detail && (
            <div className={`mt-2 text-[15px] leading-relaxed rounded-lg px-3 py-1.5 ${done ? "text-emerald-900" : "bg-slate-50 text-neutral-800"}`}>
              <strong>{done ? "Done. " : "Check: "}</strong>{detail}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function Quiz({ id, question, options, correct, explain, state, answer }) {
  const a = state.answers[id];
  const solved = a?.correct;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-game-quiz={id}>
      <div className="text-[13px] font-semibold uppercase tracking-wide text-lagoon-700 mb-1">Quiz</div>
      <div className="text-[16px] font-semibold leading-snug text-neutral-900 mb-3">{question}</div>
      <div className="space-y-2" role="group" aria-label={question}>
        {options.map((o, i) => {
          const picked = a?.tried?.includes(i);
          const right = solved && i === correct;
          const wrong = picked && i !== correct;
          return (
            <button key={i} disabled={solved} onClick={() => answer(id, i, correct)}
              className={`w-full text-left text-[16px] rounded-lg border px-3 py-2 leading-snug transition-colors ${right ? "bg-emerald-50 border-emerald-400 text-emerald-900 font-medium" : wrong ? "bg-rose-50 border-rose-300 text-rose-900 line-through" : "bg-white border-slate-300 hover:border-lagoon-400 hover:bg-lagoon-50"} disabled:cursor-default`}>
              {o}
            </button>
          );
        })}
      </div>
      {a && !solved && <p className="text-[15px] text-rose-700 mt-2">Not quite. Read the question again and try another answer.</p>}
      {solved && <p className="text-[15px] leading-relaxed text-emerald-900 mt-3 bg-emerald-50 rounded-lg px-3 py-2"><strong>{a.tried.length === 1 ? "Right first time, +10 points." : "Right, +5 points."}</strong> {explain}</p>}
    </div>
  );
}

// A written answer to one of the board's questions, set as an exercise.
function Reflection({ num, id, title, question, instruction, hint, state, setText, rows = 4 }) {
  const v = state.texts[id] || "";
  const done = v.trim().length >= 25;
  return (
    <Mission num={num} done={done} title={title}>
      <p className="mt-2 text-[16px] leading-relaxed text-neutral-900 font-medium">{question}</p>
      {instruction && <p className="mt-1.5 text-[16px] leading-relaxed text-neutral-800">{instruction}</p>}
      {hint && <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-600"><strong>Hint:</strong> {hint}</p>}
      <textarea value={v} onChange={(e) => setText(id, e.target.value)} rows={rows} aria-label={title}
        className="mt-2 w-full text-[16px] leading-relaxed border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-lagoon-300" placeholder="Write your answer here" />
      <p className="text-[15px] text-neutral-600 mt-0.5">{done ? "Saved. +5 points." : "Saved as you type. Done when you have written at least one full sentence."}</p>
    </Mission>
  );
}

// The goal of a chapter and how many of its tasks are done.
function ChapterGoal({ goal, checks }) {
  const n = checks.filter(Boolean).length;
  return (
    <div className="rounded-xl bg-ink text-white p-4">
      <div className="text-[13px] font-semibold uppercase tracking-wide text-coral-300">Goal of this chapter</div>
      <p className="text-[16px] leading-relaxed mt-1">{goal}</p>
      {checks.length > 0 && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex gap-1 flex-1" aria-hidden>
            {checks.map((c, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${c ? "bg-emerald-400" : "bg-white/20"}`} />)}
          </div>
          <span className="text-[15px] text-white/85 shrink-0">{n} of {checks.length} tasks done</span>
        </div>
      )}
    </div>
  );
}

function GoButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="mt-2 inline-flex items-center gap-1 text-[15px] font-semibold text-lagoon-800 bg-lagoon-50 hover:bg-lagoon-100 rounded-full px-2.5 py-1">
      {children} <ChevronRight size={12} />
    </button>
  );
}

// ---- the chapters --------------------------------------------------------------------

const CHAPTERS = [
  { id: "briefing", title: "Your assignment", minutes: 3, icon: Flag, goal: "Understand the case, the boundaries of the system and the four questions your map must answer. To finish, answer the two quiz questions at the bottom." },
  { id: "fcm", title: "Fuzzy cognitive maps in four minutes", minutes: 4, icon: Lightbulb, goal: "Learn the three ideas you will use: concepts, weighted arrows and feedback loops. To finish, answer the three quiz questions." },
  { id: "interviews", title: "Listen to the stakeholders", minutes: 4, icon: Users, goal: "Collect the quantities that will become your concepts. To finish, read the five interviews and write at least five quantities in your notebook." },
  { id: "concepts", title: "Map the concepts", minutes: 6, icon: MapPin, goal: "Put your quantities on the map as concepts and sort them into modules. You work in the Network tab beside this panel." },
  { id: "links", title: "Connect cause and effect", minutes: 6, icon: Target, goal: "Draw the arrows between your concepts, with a direction and a strength, until the map contains at least one feedback loop." },
  { id: "run", title: "Run your map", minutes: 3, icon: Timer, goal: "Describe today's situation, let the map run until it settles, and use the result to answer board question 1." },
  { id: "policy", title: "Test an intervention", minutes: 3, icon: Star, goal: "Test one measure the board could fund, compare it with the baseline, and answer board question 3." },
  { id: "debrief", title: "Advise the board", minutes: 2, icon: Trophy, goal: "Answer the last two board questions and download your advice." },
];

export default function SeriousGame({
  open, onClose, concepts, edges, scenarios, results, baselineResult, tab, onGoTab,
  activeModelId, onStartModel, onOpenModel, modelExists, collapsed: collapsedProp, setCollapsed: setCollapsedProp,
}) {
  const [state, setStateRaw] = useState(() => readGameState() || freshGame());
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  const collapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = setCollapsedProp || setOwnCollapsed;
  const [now, setNow] = useState(Date.now());
  const setState = (patch) => setStateRaw((s) => {
    const next = typeof patch === "function" ? patch(s) : { ...s, ...patch };
    try { localStorage.setItem(GAME_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  useEffect(() => { if (!open) return undefined; const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, [open]);

  const onGameModel = !!state.modelId && state.modelId === activeModelId;
  const lost = !!state.modelId && !modelExists(state.modelId);
  const stats = useMemo(() => modelStats(onGameModel ? concepts : [], onGameModel ? edges : []), [concepts, edges, onGameModel]);
  const scenarioRuns = onGameModel ? Object.keys(results || {}).filter((k) => k !== "baseline" && results[k]) : [];
  const changedScenarios = onGameModel ? scenarios.filter((s) => s.id !== "baseline" && Object.keys(s.initialOverrides || {}).length + Object.keys(s.lockedConcepts || {}).length > 0) : [];

  // Missions are checked from the model itself, so they follow whatever the
  // player does in the tool, in any order.
  const noteCount = (state.notes || "").split(/[,;\n]+/).map((t) => t.trim()).filter((t) => t.length >= 3).length;
  const missions = {
    notes5: noteCount >= 5,
    model: onGameModel,
    concepts8: stats.nConcepts >= 8,
    modules3: stats.modules.length >= 3,
    edges12: stats.nEdges >= 12,
    negative2: stats.nNegative >= 2,
    loop: stats.loops.length > 0,
    connected: stats.nConcepts > 0 && stats.isolated.length === 0,
    start3: stats.started.length >= 3,
    baseline: onGameModel && !!baselineResult,
    scenario: changedScenarios.length > 0,
    scenarioRun: scenarioRuns.length > 0,
  };
  // A mission counts for points once it has been met; later edits do not take
  // the points away again.
  useEffect(() => {
    if (!open) return;
    const newly = Object.entries(missions).filter(([k, v]) => v && !state.missions[k] && (onGameModel || k === "notes5")).map(([k]) => k);
    if (newly.length) setState((s) => ({ ...s, missions: { ...s.missions, ...Object.fromEntries(newly.map((k) => [k, true])) } }));
  });

  const answer = (id, i, correct) => setState((s) => {
    const prev = s.answers[id] || { tried: [] };
    if (prev.correct || prev.tried.includes(i)) return s;
    return { ...s, answers: { ...s.answers, [id]: { tried: [...prev.tried, i], correct: i === correct } } };
  });
  const setText = (id, v) => setState((s) => ({ ...s, texts: { ...s.texts, [id]: v } }));

  // Questions about the player's own map change id when the map changes; only
  // the best answer per question counts.
  const best = {};
  Object.entries(state.answers).forEach(([id, a]) => {
    const k = id.split(":")[0], p = a.correct ? (a.tried.length === 1 ? 10 : 5) : 0;
    best[k] = Math.max(best[k] || 0, p);
  });
  const points = Object.values(best).reduce((p, v) => p + v, 0)
    + Object.keys(state.missions).length * 20
    + Object.values(state.texts).filter((t) => (t || "").trim().length >= 25).length * 5
    + state.interviewsRead.length * 2;
  const missionCount = Object.keys(missions).length;
  const maxPoints = 10 * 10 + missionCount * 20 + QUESTIONS.length * 5 + INTERVIEWS.length * 2;
  const minutes = state.startedAt ? Math.max(0, Math.floor(((state.finishedAt || Math.max(now, state.startedAt)) - state.startedAt) / 60000)) : 0;
  const ch = CHAPTERS[state.chapter] || CHAPTERS[0];
  const go = (i) => { setState({ chapter: Math.max(0, Math.min(CHAPTERS.length - 1, i)) }); document.querySelector("[data-game-body]")?.scrollTo?.({ top: 0 }); };
  const start = () => setState((s) => ({ ...s, startedAt: s.startedAt || Date.now() }));
  const restart = () => { if (window.confirm("Start the game again from the beginning? Your answers and points are cleared; the map you built stays in your model library.")) setState(freshGame()); };

  if (!open) return null;

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} className="fixed bottom-14 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink text-white text-[15px] font-medium px-3.5 py-2 shadow-lg hover:bg-slate-800" data-game-pill>
        <Gamepad2 size={14} className="text-coral-400" />Meinweg game · chapter {state.chapter + 1} of {CHAPTERS.length} · {points} points
      </button>
    );
  }

  const needModel = (
    <Card tone="tip">
      {lost ? <p>The model you built for the game is no longer in your model library.</p>
        : state.modelId ? <p>Your game map is not the model that is open now.</p>
          : <p>You build your map in a new, empty model, so the model you were working on stays as it is.</p>}
      <div className="flex flex-wrap gap-x-2">
        {state.modelId && !lost
          ? <GoButton onClick={() => onOpenModel(state.modelId)}>Open my game map</GoButton>
          : <GoButton onClick={() => { const id = onStartModel(GAME_MODEL_NAME); setState({ modelId: id }); }}>Create my game map</GoButton>}
        {state.modelId && activeModelId && <GoButton onClick={() => setState({ modelId: activeModelId })}>Play on with the model that is open</GoButton>}
      </div>
    </Card>
  );

  // Questions about the player's own map.
  const driverQ = onGameModel ? rankedOptions(concepts, (c) => stats.outStrength.get(c.id) || 0) : null;
  const finals = onGameModel && baselineResult?.final ? concepts.map((c) => baselineResult.final[c.id] ?? 0) : [];
  const finalQ = finals.length && Math.max(...finals) - Math.min(...finals) > 0.05 ? rankedOptions(concepts, (c) => baselineResult.final[c.id] ?? 0) : null;
  const firstLoop = stats.loops[0];
  const solved = (id) => !!state.answers[id]?.correct;
  const wrote = (id) => (state.texts[id] || "").trim().length >= 25;
  const chapterChecks = {
    briefing: [solved("b1"), solved("b2")],
    fcm: [solved("f1"), solved("f2"), solved("f3")],
    interviews: [state.interviewsRead.length >= INTERVIEWS.length, missions.notes5],
    concepts: [missions.model, missions.concepts8, missions.modules3],
    links: [missions.edges12, missions.negative2, missions.connected, missions.loop],
    run: [missions.start3, missions.baseline, wrote("q1")],
    policy: [missions.scenario, missions.scenarioRun, wrote("q3")],
    debrief: [wrote("q2"), wrote("q4"), !!state.finishedAt],
  };

  let body;
  switch (ch.id) {
    case "briefing":
      body = (
        <>
          <Card tone="story">
            <p className="text-[18px] font-semibold mb-2">Welcome to the Meinweg Park Board.</p>
            <p className="mb-3">You start today as its systems analyst.</p>
            <p className="mb-3">The Meinweg is a national park of heath, forest and fens in Limburg, on the border with Germany. Farms, a village and holiday parks lie along its edge.</p>
            <p className="mb-3">In recent dry summers the fens fell dry and grass replaced the heather. The fire risk closed the park for a week. The province has asked the board for advice.</p>
            <p className="text-[15px] text-neutral-600">The case is fictional: the people and events are invented.</p>
          </Card>
          <Card>
            <p className="font-semibold mb-1">Your task</p>
            <p>Build a causal map of the Meinweg with the Spaghetti Engine, use it to answer the board's four questions, and give advice. Nobody tells you which factors to include. That is your call.</p>
          </Card>
          <div>
            <h4 className="se-display text-[18px] font-semibold mb-2">The questions your map must answer</h4>
            <ol className="space-y-2">
              {QUESTIONS.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-[16px] leading-relaxed text-neutral-900">
                  <span className="w-7 h-7 rounded-full bg-lagoon-100 text-lagoon-800 text-[14px] font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span>{q.text}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="se-display text-[18px] font-semibold mb-2">The boundaries of the system</h4>
            <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {BOUNDARIES.map((b) => (
                <div key={b.label} className="px-4 py-3">
                  <dt className="text-[14px] font-semibold uppercase tracking-wide text-lagoon-700">{b.label}</dt>
                  <dd className="text-[16px] leading-relaxed text-neutral-900 mt-0.5">{b.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Quiz id="b1" state={state} answer={answer}
            question="A nature group wants the Veluwe, a large heath 150 km to the north, in your map. Does it belong inside the boundary?"
            options={["Yes: every heath affects visitors", "No: it lies outside the Meinweg and its edge", "Only if it also dries out"]}
            correct={1} explain="A boundary keeps a model focused. Influences from outside, such as competition from other destinations, can enter as a driver if they matter, but the other heath itself is not part of the system." />
          <Quiz id="b2" state={state} answer={answer}
            question="Which of these is the best name for a concept in a causal map?"
            options={["Farmers", "The drought problem", "Groundwater level", "Nature"]}
            correct={2} explain="A concept is a quantity that can go up or down. 'Farmers' or 'Nature' cannot increase or decrease as such; 'Groundwater level' or 'Farm income' can." />
        </>
      );
      break;
    case "fcm":
      body = (
        <>
          <Card>
            <p className="mb-2"><strong>A fuzzy cognitive map (FCM)</strong> is a map of how people think a system works. It has two ingredients:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Concepts</strong>: quantities that can rise or fall, such as <em>Groundwater level</em> or <em>Visitor numbers</em>.</li>
              <li><strong>Relationships</strong>: arrows from cause to effect, each with a weight from -1 to +1. A positive weight means "more of A gives more of B"; a negative weight means "more of A gives less of B". The size says how strong the effect is.</li>
            </ul>
          </Card>
          <Card>
            <p className="mb-2"><strong>Feedback loops</strong> are chains of arrows that come back to where they started. A loop with an even number of negative arrows is <em>reinforcing</em>: change keeps feeding itself (a vicious or virtuous circle). A loop with an odd number is <em>balancing</em>: it pushes back against change.</p>
            <p><strong>Running the map</strong>: the engine passes every concept's value along the arrows again and again, until the values stop changing. Where they settle shows the state the system tends towards. The numbers are relative, from -1 to +1, not real units: an FCM tells you about direction and strength, not about kilograms or euros.</p>
          </Card>
          <Quiz id="f1" state={state} answer={answer}
            question="The arrow 'Pine forest area → Groundwater level' has weight -0.6. What does it say?"
            options={["More pine gives a higher groundwater level", "More pine gives a lower groundwater level, fairly strongly", "Pine forest and groundwater are unrelated"]}
            correct={1} explain="The minus sign gives the direction (more of one, less of the other) and 0.6 the strength, on a scale up to 1." />
          <Quiz id="f2" state={state} answer={answer}
            question="Heather cover → (−) Grass cover → (+) Heath fires → (−) Heather cover. What kind of loop is this?"
            options={["Balancing: it has negative arrows", "Reinforcing: it has two negative arrows, an even number", "No loop at all"]}
            correct={1} explain="Two negatives cancel out: less heather gives more grass and more fires, and so even less heather. This is the ecologist's 'fire trap'." />
          <Quiz id="f3" state={state} answer={answer}
            question="Your map shows Visitor numbers settling at +0.4. What can you conclude?"
            options={["40% more visitors than today", "Exactly 40,000 visitors a year", "Visitor numbers tend to end on the high side, relative to the other concepts"]}
            correct={2} explain="FCM values are relative. They are good for comparing directions and scenarios, not for forecasting real numbers." />
        </>
      );
      break;
    case "interviews":
      body = (
        <>
          <Card tone="story">
            <p>You spent the morning talking to people in and around the park. People do not always agree, and that disagreement is part of the system too.</p>
          </Card>
          <Mission num="3.1" done={state.interviewsRead.length >= INTERVIEWS.length} title="Read the five interviews"
            steps={["Read each quote below.", "Look for quantities that can rise or fall, such as groundwater level or farm income.", "Look for causes and effects: what makes what go up or down?", "Click Mark as read under each quote."]}
            detail={`${state.interviewsRead.length} of ${INTERVIEWS.length} read.`} />
          {INTERVIEWS.map((iv) => {
            const read = state.interviewsRead.includes(iv.id);
            return (
              <div key={iv.id} className={`rounded-xl border p-4 ${read ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200"}`}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-10 h-10 rounded-full bg-lagoon-100 text-lagoon-800 font-semibold text-[15px] flex items-center justify-center shrink-0">{iv.who.replace(/^Dr\. /, "").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-neutral-900 leading-tight">{iv.who}</div>
                    <div className="text-[15px] text-neutral-600 leading-tight">{iv.role}</div>
                  </div>
                </div>
                <p className="text-[16px] text-neutral-900 leading-[1.7] border-l-[3px] border-lagoon-200 pl-3">{iv.quote}</p>
                {!read
                  ? <button onClick={() => setState((s) => ({ ...s, interviewsRead: [...s.interviewsRead, iv.id] }))} className="mt-3 text-[15px] font-medium text-lagoon-800 hover:underline">Mark as read (+2 points)</button>
                  : <span className="mt-1.5 inline-flex items-center gap-1 text-[15px] text-emerald-800"><CheckCircle2 size={12} />Read</span>}
              </div>
            );
          })}
          <Mission num="3.2" done={missions.notes5} title="Write at least five quantities in your notebook"
            steps={["Write each quantity in your own words.", "Separate them with commas or new lines.", "Name quantities, not groups: write 'Farm income', not 'Farmers'."]}
            detail={`${noteCount} quantit${noteCount === 1 ? "y" : "ies"} so far. You turn them into concepts in the next chapter.`}>
            <textarea value={state.notes} onChange={(e) => setState({ notes: e.target.value })} rows={4} aria-label="Your notebook"
              className="mt-2 w-full text-[16px] leading-relaxed border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-lagoon-300" placeholder="For example: groundwater level, grass cover, ..." />
          </Mission>
        </>
      );
      break;
    case "concepts":
      body = (
        <>
          {!onGameModel && needModel}
          <Mission num="4.1" done={missions.model} title="Create your game map"
            steps={["Click Create my game map above.", "A new, empty model opens. Your own models stay as they are."]}
            detail={onGameModel ? "Your game map is open. Everything you build in it counts." : "No game map is open yet."} />
          <Mission num="4.2" done={missions.concepts8} title="Add between 8 and 20 concepts"
            steps={["Open the Network tab.", "Double-click an empty spot on the map, or click Add concept.", "Type the name in the Inspector beside the map. Use the quantities from your notebook.", "Repeat until you have at least 8 concepts."]}
            detail={`${stats.nConcepts} concept${stats.nConcepts === 1 ? "" : "s"} so far.`}>
            {tab !== "network" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission num="4.3" done={missions.modules3} title="Sort the concepts into at least 3 modules"
            steps={["Click a concept on the map.", "In the Inspector, pick or type a module, for example Water, Nature, Farming or Recreation.", "Do this for every concept. The map is then coloured by theme."]}
            detail={stats.modules.length ? `Modules so far: ${stats.modules.join(", ")}.` : "No modules yet."} />
          {stats.actorLike.length > 0 && (
            <Card tone="tip">
              <p><strong>Analyst's tip.</strong> {stats.actorLike.map((c) => `"${c.name}"`).join(", ")} {stats.actorLike.length === 1 ? "sounds" : "sound"} like a group or a sector rather than a quantity. What about it goes up or down? For example the number, the income, or the satisfaction.</p>
            </Card>
          )}
          {stats.nConcepts > 20 && <Card tone="tip"><p><strong>Analyst's tip.</strong> {stats.nConcepts} concepts is more than the boundary allows. Can some be merged into one?</p></Card>}
          <Quiz id="c1" state={state} answer={answer}
            question="Your map has 'Groundwater level' and 'Water table in the fens'. They mean almost the same. What do you do?"
            options={["Keep both: more concepts make a better map", "Merge them into one concept, or make the difference explicit", "Delete both"]}
            correct={1} explain="Two concepts for one idea split its effects over two places and make loops harder to see. Keep one, or name them so the difference is clear." />
        </>
      );
      break;
    case "links":
      body = (
        <>
          {!onGameModel && needModel}
          <Mission num="5.1" done={missions.edges12} title="Draw at least 12 relationships"
            steps={["Hover over a concept until small dots appear on its edge.", "Drag from a dot to the concept it affects. Alternatively, click a concept and use Link to a concept already on the map in the Inspector.", "Click the new arrow and choose whether it increases or decreases the other concept.", "Set how strong the effect is. Base it on the interviews and your own judgement."]}
            detail={`${stats.nEdges} relationship${stats.nEdges === 1 ? "" : "s"} so far.`}>
            {tab !== "network" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission num="5.2" done={missions.negative2} title="Include at least 2 negative relationships"
            steps={["Find an effect where more of one concept gives less of another, for example more pumping gives a lower groundwater level.", "Set that arrow to decreases.", "Find a second one."]}
            detail={`${stats.nNegative} negative relationship${stats.nNegative === 1 ? "" : "s"} so far. Real systems have brakes as well as accelerators.`} />
          <Mission num="5.3" done={missions.connected} title="Connect every concept"
            steps={["Look at the list of unconnected concepts below.", "Give each one at least one arrow in or out, or delete it if it does not belong in the map."]}
            detail={stats.isolated.length ? `Not connected yet: ${stats.isolated.slice(0, 4).map((c) => c.name).join(", ")}${stats.isolated.length > 4 ? ` and ${stats.isolated.length - 4} more` : ""}.` : (stats.nConcepts ? "Every concept has at least one arrow." : "No concepts yet.")} />
          <Mission num="5.4" done={missions.loop} title="Make sure the map contains a feedback loop"
            steps={["Start at a concept and follow its arrows.", "If you can return to the concept you started from, you have found a loop.", "If there is none, add the missing arrow. The ecologist described one: grass cover, heath fires and heather cover."]}
            detail={firstLoop ? `Found ${stats.loops.length}${stats.loops.length >= 25 ? "+" : ""}. For example: ${firstLoop.nodes.map((id) => nameOf(concepts, id)).join(" → ")} → ${nameOf(concepts, firstLoop.nodes[0])}.` : "No loop yet."} />
          {firstLoop && (
            <Quiz id={`l1:${firstLoop.nodes.join(",")}`} state={state} answer={answer}
              question={`Look at your loop ${firstLoop.nodes.map((id) => nameOf(concepts, id)).join(" → ")} → ${nameOf(concepts, firstLoop.nodes[0])}. Is it reinforcing or balancing?`}
              options={["Reinforcing", "Balancing"]} correct={firstLoop.reinforcing ? 0 : 1}
              explain={`It has ${firstLoop.edges.filter((e) => e.weight < 0).length} negative arrow${firstLoop.edges.filter((e) => e.weight < 0).length === 1 ? "" : "s"}: an ${firstLoop.reinforcing ? "even number, so a change keeps feeding itself" : "odd number, so it pushes back against change"}.`} />
          )}
          {stats.drivers.length > 0 && (
            <Card tone="tip"><p><strong>Drivers in your map:</strong> {stats.drivers.slice(0, 5).map((c) => c.name).join(", ")}. Nothing feeds into them, so they act from outside the system. Is that what you meant?</p></Card>
          )}
        </>
      );
      break;
    case "run":
      body = (
        <>
          {!onGameModel && needModel}
          <Card tone="story">
            <p>If every concept starts at 0, nothing can move. So you first describe today's situation, and then let the map run.</p>
          </Card>
          <Mission num="6.1" done={missions.start3} title="Give at least 3 concepts a starting value"
            steps={["On the Network tab, click a concept.", "In the Inspector, move the Starting value slider. A positive value means high today, a negative value means low today.", "Do this for at least three concepts, for example grass cover +0.6 and groundwater level -0.5."]}
            detail={stats.started.length ? `Set so far: ${stats.started.slice(0, 4).map((c) => `${c.name} ${fmt(Number(c.initialValue))}`).join(", ")}${stats.started.length > 4 ? ` and ${stats.started.length - 4} more` : ""}.` : "No starting values yet."}>
            {tab !== "network" && tab !== "editor" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission num="6.2" done={missions.baseline} title="Run the baseline"
            steps={["Open Baseline Equilibrium under State and scenario analysis.", "Click Run.", "Read the chart: where does each concept settle?"]}
            detail={missions.baseline ? "The baseline has run." : "Not run yet."}>
            {tab !== "equilibrium" && <GoButton onClick={() => onGoTab("equilibrium")}>Go to Baseline Equilibrium</GoButton>}
          </Mission>
          {missions.baseline && baselineResult && (
            <Card tone={baselineResult.converged ? "done" : "tip"}>
              <p>{!baselineResult.converged ? "Your map has not settled: some concepts keep moving. Strong reinforcing loops often cause this. Check the weights in your loops."
                : finals.length && Math.max(...finals.map(Math.abs)) < 0.01 ? "Your map settled right away at 0: nothing had a starting value when you ran it. Set a few starting values and click Run again."
                  : `Your map settled after ${baselineResult.iterationsRun} rounds.`}</p>
            </Card>
          )}
          {finalQ && (
            <Quiz id={`r1:${finalQ.best.id}`} state={state} answer={answer}
              question="Read your result. Which of these concepts ends highest?"
              options={finalQ.options} correct={finalQ.correct}
              explain={`${finalQ.best.name} settles at ${fmt(baselineResult.final[finalQ.best.id] ?? 0)}. The bar chart on the Baseline Equilibrium tab ranks every concept.`} />
          )}
          {driverQ && (
            <Quiz id={`r2:${driverQ.best.id}`} state={state} answer={answer}
              question="Which of these concepts has the most influence on the rest of your map (the strongest arrows going out)?"
              options={driverQ.options} correct={driverQ.correct}
              explain={`${driverQ.best.name} sends out arrows with a total weight of ${(stats.outStrength.get(driverQ.best.id) || 0).toFixed(2)}. The Influence Metrics tab measures this for every concept: a strong 'driver' is a good place to look for levers.`} />
          )}
          <Reflection num="6.3" id="q1" state={state} setText={setText} title="Answer board question 1" question={QUESTIONS[0].text}
            instruction="Write two or three sentences. Name at least one chain of cause and effect from your map, for example A → B → C."
            hint="Follow the arrows that lead into your groundwater or heath concept." />
        </>
      );
      break;
    case "policy":
      body = (
        <>
          {!onGameModel && needModel}
          <Card tone="story">
            <p>The alderman wants to know what the budget should go to. Choose one measure, such as closing ditches or turning pine into mixed forest, and test it.</p>
          </Card>
          <Mission num="7.1" done={missions.scenario} title="Make a scenario for one measure"
            steps={["Open Scenarios & Simulation.", "Click New scenario and give it a name, for example Close the ditches.", "Under Add a change, pick the concept your measure acts on and push it up or down."]}
            detail={changedScenarios.length ? `Scenarios: ${changedScenarios.map((s) => s.name).join(", ")}.` : "No scenario with a change yet."}>
            {tab !== "scenarios" && <GoButton onClick={() => onGoTab("scenarios")}>Go to Scenarios &amp; Simulation</GoButton>}
          </Mission>
          <Mission num="7.2" done={missions.scenarioRun} title="Run it and compare it with the baseline"
            steps={["Tick your scenario.", "Click Run simulation.", "Compare it with the baseline: which concepts change most, and in which direction?"]}
            detail={missions.scenarioRun ? "The scenario has run." : "Not run yet."} />
          {scenarioRuns.length > 0 && results.baseline && (() => {
            const sid = scenarioRuns[0];
            const diffs = concepts.map((c) => ({ c, d: (results[sid].final[c.id] ?? 0) - (results.baseline.final[c.id] ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 4);
            return (
              <Card tone="done">
                <p className="mb-1"><strong>Largest changes in "{scenarios.find((s) => s.id === sid)?.name}":</strong></p>
                <ul className="list-disc pl-5">{diffs.map(({ c, d }) => <li key={c.id}>{c.name}: {fmt(d)}</li>)}</ul>
              </Card>
            );
          })()}
          <Quiz id="p1" state={state} answer={answer}
            question="Your intervention raises the groundwater but lowers farm income. What does a good analyst do with that?"
            options={["Leave farm income out of the advice", "Report the trade-off, and look for a second measure that softens it", "Choose another model until the trade-off disappears"]}
            correct={1} explain="Trade-offs are a result, not a flaw. Showing them is what makes the advice credible to all stakeholders." />
          <Reflection num="7.3" id="q3" state={state} setText={setText} title="Answer board question 3" question={QUESTIONS[2].text}
            instruction="Name the measure, its two or three largest effects, and who gains and who loses."
            hint="Use the largest changes in your scenario result." />
        </>
      );
      break;
    default: {
      const allLoops = stats.loops.slice(0, 3).map((l) => `${l.nodes.map((id) => nameOf(concepts, id)).join(" → ")} (${l.reinforcing ? "reinforcing" : "balancing"})`);
      const done = Object.keys(state.missions).length;
      const rank = points >= maxPoints * 0.85 ? "Chief systems analyst" : points >= maxPoints * 0.6 ? "Senior analyst" : points >= maxPoints * 0.35 ? "Analyst" : "Trainee analyst";
      const report = () => {
        const lines = [
          "# Meinweg Park Board: advice", "",
          `Map: ${stats.nConcepts} concepts, ${stats.nEdges} relationships, ${stats.loops.length} feedback loop(s), modules: ${stats.modules.join(", ") || "none"}.`,
          `Points: ${points} of ${maxPoints} (${rank}). Time: ${minutes} minutes.`, "",
          ...QUESTIONS.flatMap((q) => [`## ${q.text}`, "", (state.texts[q.id] || "(no answer)").trim(), ""]),
          "## Notebook", "", (state.notes || "(empty)").trim(), "",
        ];
        const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
        const a = document.createElement("a"); a.href = url; a.download = "meinweg-advice.md"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (!state.finishedAt) setState({ finishedAt: Date.now() });
      };
      body = (
        <>
          <Card tone="story">
            <p>The council meets in an hour. Your answers to board questions 1 and 3 are already in your advice.</p>
          </Card>
          <Reflection num="8.1" id="q2" state={state} setText={setText} title="Answer board question 2" question={QUESTIONS[1].text}
            instruction="Name one or two loops from your map, and say for each whether it reinforces or balances change."
            hint={allLoops.length ? `Your map holds, for example: ${allLoops.join("; ")}.` : "Your map has no feedback loop yet. Is that realistic for a national park?"} />
          <Reflection num="8.2" id="q4" state={state} setText={setText} title="Answer board question 4" question={QUESTIONS[3].text}
            instruction="Name one thing your map leaves out, and say how it could change your advice."
            hint="Think of the boundaries you were given, the stakeholders you did not hear, and the weights you were unsure about." />
          <Mission num="8.3" done={!!state.finishedAt} title="Download your advice"
            steps={["Click Download my advice below.", "The file holds your four answers and your notebook."]} />
          <div className="rounded-lg border border-coral-300 bg-coral-50 p-3 text-center">
            <Trophy size={26} className="mx-auto text-coral-600 mb-1" />
            <div className="se-display text-[17.5px] font-bold text-neutral-900">{rank}</div>
            <div className="text-[16px] text-neutral-800">{points} of {maxPoints} points · {done} of {missionCount} map tasks · {minutes} min</div>
            <button onClick={report} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ink text-white text-[16px] font-semibold px-3 py-1.5 hover:bg-slate-800"><Download size={14} />Download my advice</button>
          </div>
          <Card>
            <p className="mb-1"><strong>Where to go next.</strong> Turn on <em>Advanced tools</em> at the top right for the deeper analyses:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li><strong>Transition Point Analysis</strong>: from what intensity does extra effort pay off less?</li>
              <li><strong>Transition Pathways</strong>: in which order should measures be taken?</li>
              <li><strong>Sensitivity analyses and Monte Carlo</strong>: how much do your conclusions depend on uncertain weights?</li>
            </ul>
            <p className="mt-1">The user manual under About &amp; documentation explains every tab.</p>
          </Card>
        </>
      );
    }
  }

  // Before the game starts it fills the whole screen with its cover.
  if (!state.startedAt) {
    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-gradient-to-br from-lagoon-900 via-lagoon-800 to-ink text-white" role="dialog" aria-label="Meinweg serious game">
        <div className="absolute top-4 right-4 flex gap-2">
          <button onClick={() => setCollapsed(true)} className="rounded-full px-3 py-1.5 text-[14px] text-white/80 hover:text-white hover:bg-white/10">Later</button>
          <button onClick={onClose} className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/10" title="Close the game"><X size={20} /></button>
        </div>
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="w-full max-w-2xl space-y-6">
            <div className="flex items-center gap-3 text-coral-300"><Gamepad2 size={28} /><span className="text-[14px] font-semibold uppercase tracking-[0.18em]">The Meinweg game</span></div>
            <h1 className="se-display text-4xl md:text-5xl font-extrabold leading-tight">Can you save the Meinweg?</h1>
            <p className="text-[18px] leading-relaxed text-white/85">In about 30 minutes you learn how to think in systems, what a fuzzy cognitive map is, and how to use the Spaghetti Engine, by building your own model of a national park in trouble.</p>
            <ol className="grid sm:grid-cols-2 gap-2.5">
              {CHAPTERS.map((c, i) => {
                const Icon = c.icon;
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl bg-white/10 px-3.5 py-2.5 text-[15px]">
                    <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0"><Icon size={16} className="text-coral-300" /></span>
                    <span className="flex-1">{i + 1}. {c.title}</span><span className="text-[14px] text-white/60">{c.minutes} min</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-[14.5px] text-white/70">The case is fictional. Each chapter has numbered exercises with clear steps. You score points for exercises, quiz answers and written answers. Your map is built in a separate model, so your own models are not touched.</p>
            <button onClick={start} className="inline-flex items-center justify-center gap-2 rounded-xl bg-coral-500 text-white text-[17px] font-semibold px-6 py-3 hover:bg-coral-400 shadow-lg shadow-black/20">Start the game <ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="fixed z-40 bg-white border border-slate-200 shadow-2xl flex flex-col inset-x-2 bottom-2 max-h-[62vh] rounded-xl md:static md:z-auto md:order-first md:w-[540px] lg:w-[600px] md:shrink-0 md:max-h-none md:rounded-none md:shadow-none md:border-0 md:border-r"
      role="complementary" aria-label="Meinweg serious game">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-ink text-white rounded-t-xl md:rounded-none">
        <Gamepad2 size={17} className="text-coral-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="se-display text-[18px] font-semibold leading-tight">The Meinweg game</div>
          <div className="text-[15px] text-slate-300">A 30-minute tutorial in modelling</div>
        </div>
        <span className="inline-flex items-center gap-1 text-[16px] text-coral-300" title="Points"><Trophy size={13} />{points}</span>
        {state.startedAt && <span className="inline-flex items-center gap-1 text-[16px] text-slate-300" title="Time played"><Timer size={13} />{minutes}′</span>}
        <button onClick={() => setCollapsed(true)} className="text-slate-300 hover:text-white" title="Make smaller"><ChevronDown size={16} /></button>
        <button onClick={onClose} className="text-slate-300 hover:text-white" title="Close the game (your progress is kept)"><X size={16} /></button>
      </div>
      <div className="flex gap-1 px-5 pt-3" aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button key={c.id} onClick={() => state.startedAt && go(i)} title={`${i + 1}. ${c.title} (${c.minutes} min)`}
            className={`h-1.5 flex-1 rounded-full ${i < state.chapter ? "bg-emerald-500" : i === state.chapter ? "bg-coral-400" : "bg-slate-200"}`} />
        ))}
      </div>
      {!state.startedAt ? null : (
        <>
          <div className="px-5 pt-3 pb-2">
            <div className="text-[15px] uppercase tracking-wide text-neutral-600">Chapter {state.chapter + 1} of {CHAPTERS.length} · about {ch.minutes} min</div>
            <h3 className="se-display text-[22px] font-bold leading-tight text-neutral-900 mt-0.5">{ch.title}</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-6 space-y-4" data-game-body>
            <ChapterGoal goal={ch.goal} checks={chapterChecks[ch.id] || []} />
            {body}
          </div>
          <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200">
            <button onClick={() => go(state.chapter - 1)} disabled={state.chapter === 0} className="inline-flex items-center gap-1 text-[16px] text-neutral-800 px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={14} />Back</button>
            <button onClick={restart} className="text-neutral-500 hover:text-neutral-800" title="Start the game again"><RotateCcw size={14} /></button>
            <span className="flex-1" />
            {state.chapter < CHAPTERS.length - 1 && (
              <button onClick={() => go(state.chapter + 1)} className="inline-flex items-center gap-1 rounded-lg bg-ink text-white text-[16px] font-semibold px-3 py-1.5 hover:bg-slate-800">Next chapter<ChevronRight size={14} /></button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
