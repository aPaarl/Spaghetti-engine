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
  return <div className={`rounded-lg border p-3 text-[14.5px] leading-relaxed text-neutral-900 ${cls}`}>{children}</div>;
}

function Mission({ done, title, detail, children }) {
  return (
    <div className={`rounded-lg border p-3 ${done ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
      <div className="flex items-start gap-2">
        {done ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0 mt-px" /> : <Circle size={17} className="text-slate-300 shrink-0 mt-px" />}
        <div className="min-w-0 flex-1">
          <div className={`text-[14.5px] font-semibold ${done ? "text-emerald-900" : "text-neutral-900"}`}>{title}</div>
          {detail && <div className="text-xs text-neutral-700 mt-0.5">{detail}</div>}
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
    <div className="rounded-lg border border-slate-200 bg-white p-3" data-game-quiz={id}>
      <div className="text-[14.5px] font-semibold text-neutral-900 mb-2">{question}</div>
      <div className="space-y-1.5" role="group" aria-label={question}>
        {options.map((o, i) => {
          const picked = a?.tried?.includes(i);
          const right = solved && i === correct;
          const wrong = picked && i !== correct;
          return (
            <button key={i} disabled={solved} onClick={() => answer(id, i, correct)}
              className={`w-full text-left text-[14.5px] rounded-md border px-2.5 py-1.5 transition-colors ${right ? "bg-emerald-50 border-emerald-400 text-emerald-900 font-medium" : wrong ? "bg-rose-50 border-rose-300 text-rose-900 line-through" : "bg-white border-slate-300 hover:border-lagoon-400 hover:bg-lagoon-50"} disabled:cursor-default`}>
              {o}
            </button>
          );
        })}
      </div>
      {a && !solved && <p className="text-xs text-rose-700 mt-2">Not quite. Read the question again and try another answer.</p>}
      {solved && <p className="text-xs text-emerald-900 mt-2"><strong>{a.tried.length === 1 ? "Right first time, +10 points." : "Right, +5 points."}</strong> {explain}</p>}
    </div>
  );
}

function Reflection({ id, label, hint, state, setText, rows = 3 }) {
  const v = state.texts[id] || "";
  return (
    <label className="block">
      <span className="block text-[14.5px] font-semibold text-neutral-900 mb-1">{label}</span>
      {hint && <span className="block text-xs text-neutral-700 mb-1.5">{hint}</span>}
      <textarea value={v} onChange={(e) => setText(id, e.target.value)} rows={rows}
        className="w-full text-[14.5px] border border-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-lagoon-300" placeholder="Write your answer here" />
      <span className="block text-[14px] text-neutral-600 mt-0.5">{v.trim().length >= 25 ? "Saved. +5 points." : "A sentence or two is enough (saved as you type)."}</span>
    </label>
  );
}

function GoButton({ onClick, children }) {
  return (
    <button onClick={onClick} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-lagoon-800 bg-lagoon-50 hover:bg-lagoon-100 rounded-full px-2.5 py-1">
      {children} <ChevronRight size={12} />
    </button>
  );
}

// ---- the chapters --------------------------------------------------------------------

const CHAPTERS = [
  { id: "briefing", title: "Your assignment", minutes: 3, icon: Flag },
  { id: "fcm", title: "Fuzzy cognitive maps in four minutes", minutes: 4, icon: Lightbulb },
  { id: "interviews", title: "Listen to the stakeholders", minutes: 4, icon: Users },
  { id: "concepts", title: "Map the concepts", minutes: 6, icon: MapPin },
  { id: "links", title: "Connect cause and effect", minutes: 6, icon: Target },
  { id: "run", title: "Run your map", minutes: 3, icon: Timer },
  { id: "policy", title: "Test an intervention", minutes: 3, icon: Star },
  { id: "debrief", title: "Advise the board", minutes: 2, icon: Trophy },
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
  const missions = {
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
    if (!open || !onGameModel) return;
    const newly = Object.entries(missions).filter(([k, v]) => v && !state.missions[k]).map(([k]) => k);
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
  const maxPoints = 10 * 10 + 11 * 20 + QUESTIONS.length * 5 + INTERVIEWS.length * 2;
  const minutes = state.startedAt ? Math.max(0, Math.floor(((state.finishedAt || Math.max(now, state.startedAt)) - state.startedAt) / 60000)) : 0;
  const ch = CHAPTERS[state.chapter] || CHAPTERS[0];
  const go = (i) => { setState({ chapter: Math.max(0, Math.min(CHAPTERS.length - 1, i)) }); document.querySelector("[data-game-body]")?.scrollTo?.({ top: 0 }); };
  const start = () => setState((s) => ({ ...s, startedAt: s.startedAt || Date.now() }));
  const restart = () => { if (window.confirm("Start the game again from the beginning? Your answers and points are cleared; the map you built stays in your model library.")) setState(freshGame()); };

  if (!open) return null;

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} className="fixed bottom-14 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink text-white text-xs font-medium px-3.5 py-2 shadow-lg hover:bg-slate-800" data-game-pill>
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

  let body;
  switch (ch.id) {
    case "briefing":
      body = (
        <>
          <Card tone="story">
            <p className="mb-2"><strong>Welcome to the Meinweg Park Board.</strong> You start today as its systems analyst.</p>
            <p className="mb-2">The Meinweg is a national park of heath, forest and fens in Limburg, on the border with Germany. Farms, a village and holiday parks lie along its edge. In recent dry summers the fens fell dry, grass replaced the heather, and the fire risk closed the park for a week. The province meets soon and has asked the board for advice. The case is fictional: the people and events are invented.</p>
            <p>Your job: build a causal map of the Meinweg system with the Spaghetti Engine, use it to answer the board's four questions, and give advice. Nobody tells you which factors to include. That is your call as the analyst.</p>
          </Card>
          <div>
            <h4 className="se-display text-[15.5px] font-semibold mb-1.5">The boundaries of the system</h4>
            <ul className="space-y-1.5">
              {BOUNDARIES.map((b) => <li key={b.label} className="text-[14.5px] text-neutral-900"><strong>{b.label}.</strong> {b.text}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="se-display text-[15.5px] font-semibold mb-1.5">The questions your map must answer</h4>
            <ol className="space-y-1 list-decimal pl-5 text-[14.5px] text-neutral-900">
              {QUESTIONS.map((q) => <li key={q.id}>{q.text}</li>)}
            </ol>
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
            <p>You spent the morning talking to people in and around the park. Read what they told you. Listen for <strong>quantities that change</strong> and for <strong>causes and effects</strong>: these become your concepts and arrows. People do not always agree, and that is part of the system too.</p>
          </Card>
          {INTERVIEWS.map((iv) => {
            const read = state.interviewsRead.includes(iv.id);
            return (
              <div key={iv.id} className={`rounded-lg border p-3 ${read ? "bg-slate-50 border-slate-200" : "bg-white border-slate-200"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquareQuote size={15} className="text-lagoon-600 shrink-0" />
                  <span className="text-[14.5px] font-semibold text-neutral-900">{iv.who}</span>
                  <span className="text-[14px] text-neutral-600 truncate">{iv.role}</span>
                </div>
                <p className="text-[14.5px] text-neutral-900 italic leading-relaxed">"{iv.quote}"</p>
                {!read
                  ? <button onClick={() => setState((s) => ({ ...s, interviewsRead: [...s.interviewsRead, iv.id] }))} className="mt-1.5 text-xs font-medium text-lagoon-800 hover:underline">Mark as read (+2 points)</button>
                  : <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-emerald-800"><CheckCircle2 size={12} />Read</span>}
              </div>
            );
          })}
          <label className="block">
            <span className="block text-[14.5px] font-semibold text-neutral-900 mb-1">Your notebook</span>
            <span className="block text-xs text-neutral-700 mb-1.5">Jot down the quantities you heard, in your own words. You will turn them into concepts in the next chapter.</span>
            <textarea value={state.notes} onChange={(e) => setState({ notes: e.target.value })} rows={4}
              className="w-full text-[14.5px] border border-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-lagoon-300" placeholder="For example: groundwater level, ..." />
          </label>
        </>
      );
      break;
    case "concepts":
      body = (
        <>
          {!onGameModel && needModel}
          <Card tone="story">
            <p>Time to draw. Open the <strong>Network</strong> tab: double-click an empty spot (or click <em>Add concept</em>) to add a concept. Click a concept to open the <strong>Inspector</strong> beside the map, and type its name there. Give each concept a <strong>module</strong> (for example Water, Nature, Farming, Recreation) so the map is coloured by theme.</p>
          </Card>
          <Mission done={missions.model} title="Open a fresh model for your map" detail={onGameModel ? "Your game map is open. Everything you build in it counts." : "Use the button above."} />
          <Mission done={missions.concepts8} title="Add at least 8 concepts" detail={`${stats.nConcepts} so far. Stay within the boundaries; 20 is the upper limit.`}>
            {tab !== "network" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission done={missions.modules3} title="Sort them into at least 3 modules" detail={stats.modules.length ? `Modules so far: ${stats.modules.join(", ")}.` : "Click a concept and pick or type a module in the Inspector."} />
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
          <Card tone="story">
            <p>Now draw the arrows. Hover a concept to see its small dots, then drag from a dot to the concept it affects. You can also click a concept and use <em>Link to a concept already on the map</em> in the Inspector. Then click the arrow and choose whether it <strong>increases</strong> or <strong>decreases</strong> the other concept, and how strongly. Use what the stakeholders told you, and your own judgement.</p>
          </Card>
          <Mission done={missions.edges12} title="Draw at least 12 relationships" detail={`${stats.nEdges} so far.`}>
            {tab !== "network" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission done={missions.negative2} title="Include at least 2 negative relationships" detail={`${stats.nNegative} so far. Real systems have brakes as well as accelerators.`} />
          <Mission done={missions.connected} title="Connect every concept" detail={stats.isolated.length ? `Not connected yet: ${stats.isolated.slice(0, 4).map((c) => c.name).join(", ")}${stats.isolated.length > 4 ? ` and ${stats.isolated.length - 4} more` : ""}.` : "Every concept has at least one arrow."} />
          <Mission done={missions.loop} title="Find a feedback loop" detail={firstLoop ? `Found ${stats.loops.length}${stats.loops.length >= 25 ? "+" : ""}. For example: ${firstLoop.nodes.map((id) => nameOf(concepts, id)).join(" → ")} → ${nameOf(concepts, firstLoop.nodes[0])}.` : "Is there a chain of arrows in your map that comes back to where it started? The stakeholders mentioned a few."} />
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
            <p>Let us see what your map does. First describe <strong>today's situation</strong>: if every concept starts at 0, nothing can move. Then open <strong>Baseline Equilibrium</strong> (step 2, Explore) and click <strong>Run</strong>. The chart shows how every concept moves until the system settles.</p>
          </Card>
          <Mission done={missions.start3} title="Give at least 3 concepts a starting value"
            detail={stats.started.length ? `Set so far: ${stats.started.slice(0, 4).map((c) => `${c.name} ${fmt(Number(c.initialValue))}`).join(", ")}${stats.started.length > 4 ? ` and ${stats.started.length - 4} more` : ""}.` : "Click a concept on the Network tab and move its Starting value slider in the Inspector (or use the Starting value column in the Model editor). For example: algal blooms high (+0.7), reed bed area low (-0.5)."}>
            {tab !== "network" && tab !== "editor" && <GoButton onClick={() => onGoTab("network")}>Go to the Network tab</GoButton>}
          </Mission>
          <Mission done={missions.baseline} title="Run the baseline">
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
          <Reflection id="q1" state={state} setText={setText} label={`Board question 1. ${QUESTIONS[0].text}`} hint="Follow the arrows that lead into your groundwater or heath concept." />
        </>
      );
      break;
    case "policy":
      body = (
        <>
          {!onGameModel && needModel}
          <Card tone="story">
            <p>The alderman wants to know what the subsidy budget should go to. Open <strong>Scenarios &amp; Simulation</strong>, click <em>New scenario</em>, and under <em>Add a change</em> push up (or down) the concept that stands for the measure you would fund. Tick the scenario and click <strong>Run simulation</strong> to compare it with the baseline.</p>
          </Card>
          <Mission done={missions.scenario} title="Make a scenario with at least one change" detail={changedScenarios.length ? `Scenarios: ${changedScenarios.map((s) => s.name).join(", ")}.` : undefined}>
            {tab !== "scenarios" && <GoButton onClick={() => onGoTab("scenarios")}>Go to Scenarios &amp; Simulation</GoButton>}
          </Mission>
          <Mission done={missions.scenarioRun} title="Run it and compare it with the baseline" />
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
          <Reflection id="q3" state={state} setText={setText} label={`Board question 3. ${QUESTIONS[2].text}`} hint="Use your scenario result. Who gains, who loses?" />
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
            <p>The council meets in an hour. Finish your advice by answering the last two questions, then download it.</p>
          </Card>
          <Reflection id="q2" state={state} setText={setText} label={`Board question 2. ${QUESTIONS[1].text}`}
            hint={allLoops.length ? `Your map holds, for example: ${allLoops.join("; ")}.` : "Your map has no feedback loop yet. Is that realistic for a national park?"} />
          <Reflection id="q4" state={state} setText={setText} label={`Board question 4. ${QUESTIONS[3].text}`} hint="Think of the boundaries you were given, the stakeholders you did not hear, and the weights you were unsure about." />
          <div className="rounded-lg border border-coral-300 bg-coral-50 p-3 text-center">
            <Trophy size={26} className="mx-auto text-coral-600 mb-1" />
            <div className="se-display text-[17.5px] font-bold text-neutral-900">{rank}</div>
            <div className="text-[14.5px] text-neutral-800">{points} of {maxPoints} points · {done} of 11 missions · {minutes} min</div>
            <button onClick={report} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-ink text-white text-[14.5px] font-semibold px-3 py-1.5 hover:bg-slate-800"><Download size={14} />Download my advice</button>
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
            <p className="text-[14.5px] text-white/70">The case is fictional. You score points for missions, quiz answers and written answers. Your map is built in a separate model, so your own models are not touched.</p>
            <button onClick={start} className="inline-flex items-center justify-center gap-2 rounded-xl bg-coral-500 text-white text-[17px] font-semibold px-6 py-3 hover:bg-coral-400 shadow-lg shadow-black/20">Start the game <ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="fixed z-40 bg-white border border-slate-200 shadow-2xl flex flex-col inset-x-2 bottom-2 max-h-[62vh] rounded-xl md:static md:z-auto md:order-first md:w-[480px] lg:w-[520px] md:shrink-0 md:max-h-none md:rounded-none md:shadow-none md:border-0 md:border-r"
      role="complementary" aria-label="Meinweg serious game">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-ink text-white rounded-t-xl md:rounded-none">
        <Gamepad2 size={17} className="text-coral-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="se-display text-[15.5px] font-semibold leading-tight">The Meinweg game</div>
          <div className="text-[14px] text-slate-300">A 30-minute tutorial in modelling</div>
        </div>
        <span className="inline-flex items-center gap-1 text-[14.5px] text-coral-300" title="Points"><Trophy size={13} />{points}</span>
        {state.startedAt && <span className="inline-flex items-center gap-1 text-[14.5px] text-slate-300" title="Time played"><Timer size={13} />{minutes}′</span>}
        <button onClick={() => setCollapsed(true)} className="text-slate-300 hover:text-white" title="Make smaller"><ChevronDown size={16} /></button>
        <button onClick={onClose} className="text-slate-300 hover:text-white" title="Close the game (your progress is kept)"><X size={16} /></button>
      </div>
      <div className="flex gap-0.5 px-3.5 pt-2.5" aria-label="Chapters">
        {CHAPTERS.map((c, i) => (
          <button key={c.id} onClick={() => state.startedAt && go(i)} title={`${i + 1}. ${c.title} (${c.minutes} min)`}
            className={`h-1.5 flex-1 rounded-full ${i < state.chapter ? "bg-emerald-500" : i === state.chapter ? "bg-coral-400" : "bg-slate-200"}`} />
        ))}
      </div>
      {!state.startedAt ? null : (
        <>
          <div className="px-3.5 pt-2 pb-1">
            <div className="text-[14px] uppercase tracking-wide text-neutral-600">Chapter {state.chapter + 1} of {CHAPTERS.length} · about {ch.minutes} min</div>
            <h3 className="se-display text-[17.5px] font-bold text-neutral-900">{ch.title}</h3>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-3 space-y-2.5" data-game-body>{body}</div>
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-t border-slate-200">
            <button onClick={() => go(state.chapter - 1)} disabled={state.chapter === 0} className="inline-flex items-center gap-1 text-[14.5px] text-neutral-800 px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-40"><ChevronLeft size={14} />Back</button>
            <button onClick={restart} className="text-neutral-500 hover:text-neutral-800" title="Start the game again"><RotateCcw size={14} /></button>
            <span className="flex-1" />
            {state.chapter < CHAPTERS.length - 1 && (
              <button onClick={() => go(state.chapter + 1)} className="inline-flex items-center gap-1 rounded-lg bg-ink text-white text-[14.5px] font-semibold px-3 py-1.5 hover:bg-slate-800">Next chapter<ChevronRight size={14} /></button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
