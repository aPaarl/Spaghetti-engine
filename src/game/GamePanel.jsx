// ============================================================================
// Game mode: the round panel and the prediction gate
// ============================================================================
// GamePanel is the card in the bottom-left corner while Game mode is on (it
// takes the place of the Getting started guide). PredictionGate stands in
// front of a result until the team has entered its prediction. Both only
// show and collect; every rule lives in gameEngine.js.

import React, { useState } from "react";
import { Gamepad2, Trophy, Printer, CheckCircle2, Circle, XCircle, ChevronDown, ChevronRight, Plus, Download, Shuffle, Lock, Lightbulb, Flag } from "lucide-react";
import {
  currentRound, roundIndex, roundChecks, canFinishRound, cardConcept, cardOf, eventOf, totals, outcome,
  checkProposal, DIRECTION_WORDS,
} from "./gameEngine.js";

const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium";
const primary = `${btn} bg-cobalt-700 text-white hover:bg-cobalt-800 disabled:opacity-40 disabled:cursor-not-allowed`;
const outline = `${btn} border border-slate-300 text-neutral-900 bg-white hover:bg-slate-50 disabled:opacity-40`;

function ScoreLine({ game }) {
  const t = totals(game);
  return <span className="text-[11.5px] text-neutral-600" title={`Craft ${t.craft} · Insight ${t.insight} · Shared goal ${t.shared}`}>{t.total} pts</span>;
}

function ResultItems({ items }) {
  return (
    <ul className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-1.5">
          {it.correct === null ? <Circle size={13} className="text-slate-300 shrink-0 mt-px" /> : it.correct ? <CheckCircle2 size={13} className="text-green-600 shrink-0 mt-px" /> : <XCircle size={13} className="text-poppy-500 shrink-0 mt-px" />}
          <span><span className="text-neutral-900">{it.label}</span>{it.truth && <span className="block text-neutral-600">{it.truth}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

// A printable sheet of role cards: interests and private knowledge cards.
export function printRoleCards(pack) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const interest = (r) => `${r.better > 0 ? "More" : "Less"}: ${esc(cardOf(pack, r.interest)?.name || r.interest)}`;
  const roles = pack.roles.map((r) => `
    <section class="card"><h2>${esc(r.name)}</h2><p class="int">Your interest. ${interest(r)}</p><p class="knows">You know most about: ${esc(r.knows)}</p>
    <ol>${r.cards.map((c) => `<li>${esc(c)}</li>`).join("")}</ol><p class="foot">Keep these cards to yourself. Play one when it helps the map.</p></section>`).join("");
  const concepts = pack.concepts.map((c) => `<section class="small"><h3>${esc(c.name)}</h3><p>${esc(c.hint)}</p></section>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(pack.title)}: cards</title><style>
    body{font-family:system-ui,sans-serif;margin:16px;color:#111} h1{font-size:18px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px} .card,.small{border:1.5px solid #333;border-radius:10px;padding:12px;break-inside:avoid}
    h2{font-size:16px;margin:0 0 6px} h3{font-size:14px;margin:0 0 4px} .int{font-weight:600} .knows{color:#444;font-size:13px} li{margin:6px 0;font-size:14px}
    .foot{font-size:11px;color:#666} .small p{font-size:12px;color:#333;margin:0} .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    @media print{.noprint{display:none}}</style></head><body>
    <p class="noprint"><button onclick="print()">Print</button></p>
    <h1>${esc(pack.title)}: role cards</h1><div class="grid">${roles}</div>
    <h1 style="margin-top:24px">Concept cards (shared)</h1><div class="grid3">${concepts}</div></body></html>`);
  w.document.close();
  return true;
}

function StartCard({ pack, onStart }) {
  const [team, setTeam] = useState("");
  return (
    <div className="px-3.5 py-3 space-y-2.5 text-xs text-neutral-900">
      <p className="leading-snug">{pack.intro}</p>
      <ul className="list-disc pl-4 space-y-0.5 text-neutral-800">
        <li>{pack.rounds.length} rounds, about {pack.rounds.reduce((s, r) => s + r.minutes, 0)} minutes.</li>
        <li>One team of four or five players; each player has a role card (print them below).</li>
        <li>One player, the Modeller, holds the mouse. Change Modeller every round.</li>
        <li>Before every result, the team writes down a prediction. You score for good modelling, good predictions, and measures that help every role.</li>
      </ul>
      <label className="block">
        <span className="font-medium">Team name</span>
        <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Our team" className="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-xs" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={primary} onClick={() => onStart(team)}><Gamepad2 size={14} />Start a new game</button>
        <button className={outline} onClick={() => printRoleCards(pack)}><Printer size={14} />Print role cards</button>
      </div>
      <p className="text-neutral-600">The game opens as a new model in Your models; the model that is open now stays as it is.</p>
    </div>
  );
}

function EndCard({ pack, game, onDownloadLog, onRestart }) {
  const o = outcome(pack, game);
  return (
    <div className="px-3.5 py-3 space-y-2.5 text-xs text-neutral-900">
      <div className={`rounded-md border p-2.5 ${o.won ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="font-semibold text-sm flex items-center gap-1.5"><Trophy size={15} className={o.won ? "text-green-700" : "text-amber-700"} />{o.won ? "You untangled the Geul!" : "Not quite untangled yet"}</p>
        <p className="mt-1">{o.total} points, with {o.target} needed{o.reachedTarget ? " (reached)" : " (not reached)"}; {o.noTradeOff ? "your proposal has no trade-offs between roles." : "your proposal leaves at least one role worse off."}</p>
      </div>
      <table className="w-full">
        <tbody>
          <tr><td>Craft (modelling practice)</td><td className="text-right font-medium">{o.craft}</td></tr>
          <tr><td>Insight (predictions)</td><td className="text-right font-medium">{o.insight}</td></tr>
          <tr><td>Shared goal (every role)</td><td className="text-right font-medium">{o.shared}</td></tr>
          <tr className="border-t border-slate-200"><td className="font-semibold">Total</td><td className="text-right font-semibold">{o.total}</td></tr>
        </tbody>
      </table>
      <p className="text-neutral-700">Debrief: which prediction surprised you most, and which relationship explains it? Would another team, with other weights, reach the same proposal?</p>
      <div className="flex flex-wrap gap-2">
        <button className={primary} onClick={onDownloadLog}><Download size={14} />Download game log</button>
        <button className={outline} onClick={onRestart}><Gamepad2 size={14} />New game</button>
      </div>
    </div>
  );
}

export function GamePanel({ pack, game, ctx, deps, collapsed, setCollapsed, onStart, onAddCard, onFinishRound, onDrawEvent, onGoTab, onDownloadLog, onRestart }) {
  const [reflection, setReflection] = useState("");
  const [confirmSkip, setConfirmSkip] = useState(false);
  const total = pack.rounds.length;
  const round = game && !game.finishedAt ? currentRound(pack, game) : null;
  const idx = round ? roundIndex(pack, round.id) : total;
  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)} className="fixed bottom-14 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink text-white text-xs font-medium px-3.5 py-2 shadow-lg hover:bg-slate-800">
        <Gamepad2 size={14} className="text-citrus-400" />{round ? `Round ${idx + 1} of ${total}: ${round.title}` : pack.title}{game && <> &middot; {totals(game).total} pts</>}
      </button>
    );
  }
  const checks = round ? roundChecks(pack, round, ctx, deps) : [];
  const ready = canFinishRound(checks);
  const preds = round?.predictions || [];
  const ev = game ? eventOf(pack, game) : null;
  return (
    <div className="fixed bottom-14 left-4 z-40 w-[23rem] max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-slate-200 flex flex-col max-h-[60vh]" role="region" aria-label="Game">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-100">
        <Gamepad2 size={15} className="text-citrus-600 shrink-0" />
        <span className="text-sm font-semibold text-neutral-900 flex-1 truncate">{pack.title}{game ? `: ${game.team}` : ""}</span>
        {game && <ScoreLine game={game} />}
        <button onClick={() => setCollapsed(true)} className="text-neutral-600 hover:text-neutral-900" title="Make smaller"><ChevronDown size={15} /></button>
      </div>
      {game && <div className="h-1 bg-slate-100"><div className="h-1 bg-citrus-400 transition-all" style={{ width: `${(100 * Math.min(idx, total)) / total}%` }} /></div>}
      <div className="overflow-auto">
        {!game && <StartCard pack={pack} onStart={onStart} />}
        {game && game.finishedAt && <EndCard pack={pack} game={game} onDownloadLog={onDownloadLog} onRestart={onRestart} />}
        {round && (
          <div className="px-3.5 py-3 space-y-3 text-xs text-neutral-900">
            <div>
              <p className="text-[11.5px] uppercase tracking-wide text-neutral-600">Round {idx + 1} of {total} &middot; about {round.minutes} min</p>
              <p className="text-sm font-semibold">{round.title}</p>
              <p className="mt-0.5 leading-snug">{round.goal}</p>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-neutral-800 leading-snug">{round.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            <div className="flex flex-wrap gap-1.5">
              {round.tabs.map((t) => (
                <button key={t} onClick={() => onGoTab(t)} className="px-2 py-0.5 rounded border border-cobalt-200 bg-cobalt-50 text-cobalt-800 hover:bg-cobalt-100">
                  {{ network: "Network", editor: "Model editor", metrics: "Influence Metrics", equilibrium: "Baseline Equilibrium", scenarios: "Scenarios & Simulation" }[t] || t}
                </button>
              ))}
            </div>

            {round.id === "r1" && (
              <div>
                <p className="font-semibold mb-1">Concept cards</p>
                <ul className="space-y-1">
                  {pack.concepts.map((card) => {
                    const inMap = cardConcept(ctx.concepts, card.id);
                    return (
                      <li key={card.id} className="flex items-start gap-2">
                        <button disabled={!!inMap} onClick={() => onAddCard(card)} className={`${outline} !px-1.5 !py-0.5 shrink-0`} title={inMap ? "Already on your map" : "Add this card to the map as a concept"}>
                          {inMap ? <CheckCircle2 size={12} className="text-green-600" /> : <Plus size={12} />}
                        </button>
                        <span><span className="font-medium">{card.name}</span><span className="block text-neutral-600">{card.hint}</span></span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-neutral-600 mt-1">A card adds only the name: you write the definition and choose the module. New concepts of your own are welcome too.</p>
              </div>
            )}

            {round.id === "r5" && (
              <div className="space-y-2">
                <div className="rounded-md border border-slate-200 p-2">
                  <p className="font-semibold">Budget: {pack.budget} points</p>
                  <ul className="mt-0.5">{pack.measures.map((m) => <li key={m.card}>{cardOf(pack, m.card)?.name}: {m.cost}{!cardConcept(ctx.concepts, m.card) && <span className="text-neutral-600"> (not in your map)</span>}</li>)}</ul>
                </div>
                {ev ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2"><p className="font-semibold flex items-center gap-1"><Flag size={13} />Event card: {ev.title}</p><p className="mt-0.5">{ev.text}</p></div>
                ) : (
                  <button className={outline} onClick={onDrawEvent}><Shuffle size={14} />Draw the event card</button>
                )}
              </div>
            )}

            <div>
              <p className="font-semibold mb-1">To finish this round</p>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-start gap-1.5">
                    {c.done ? <CheckCircle2 size={13} className="text-green-600 shrink-0 mt-px" /> : <Circle size={13} className={`${c.required ? "text-citrus-600" : "text-slate-300"} shrink-0 mt-px`} />}
                    <span className={c.done ? "text-neutral-600" : ""}>{c.label}{!c.required && !c.done ? " (optional)" : ""}{c.detail ? <span className="text-neutral-600"> &middot; {c.detail}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>

            {preds.some((p) => game.predictions[p.id]) && (
              <div className="rounded-md border border-slate-200 p-2 space-y-2">
                <p className="font-semibold flex items-center gap-1"><Lightbulb size={13} className="text-citrus-600" />Your predictions, checked</p>
                {preds.filter((p) => game.predictions[p.id]).map((p) => {
                  const g = game.predictions[p.id];
                  return (
                    <div key={p.id}>
                      <p className="text-neutral-700">{p.prompt} <span className="font-medium text-neutral-900">+{g.points}</span></p>
                      <ResultItems items={g.items || []} />
                      {g.roles && (
                        <div className="mt-1.5">
                          <p className="font-medium">Shared goal: {g.noTradeOff ? "no role is worse off" : "a trade-off between roles"} <span className="text-neutral-900">+{g.shared}</span></p>
                          <ResultItems items={g.roles.map((r) => ({ label: r.role, truth: r.text, correct: r.result === "better" ? true : r.result === "worse" || r.result === "missing" ? false : null }))} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <label className="block">
              <span className="font-medium">Reflection (optional)</span>
              <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={2} placeholder="What surprised you? Would you change the map, or your intuition?" className="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-xs" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button className={primary} disabled={!ready} onClick={() => { onFinishRound(reflection, false); setReflection(""); setConfirmSkip(false); }}>
                {idx + 1 === total ? "Finish the game" : "Finish round"}<ChevronRight size={13} />
              </button>
              {!ready && !confirmSkip && <button className="text-neutral-600 underline hover:text-neutral-900" onClick={() => setConfirmSkip(true)}>Facilitator: move on anyway</button>}
              {!ready && confirmSkip && (
                <span className="text-neutral-700">Move on without the craft points of this round?
                  <button className="ml-1.5 underline font-medium" onClick={() => { onFinishRound(reflection, true); setReflection(""); setConfirmSkip(false); }}>Yes</button>
                  <button className="ml-1.5 underline" onClick={() => setConfirmSkip(false)}>No</button>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- the prediction gate ------------------------------------------------------------

function DirectionPicker({ value, onChange, name }) {
  return (
    <span className="inline-flex gap-1">
      {["up", "down", "same"].map((d) => (
        <label key={d} className={`px-1.5 py-0.5 rounded border cursor-pointer ${value === d ? "border-cobalt-500 bg-cobalt-50 text-cobalt-900" : "border-slate-300"}`}>
          <input type="radio" name={name} className="sr-only" checked={value === d} onChange={() => onChange(d)} />{DIRECTION_WORDS[d]}
        </label>
      ))}
    </span>
  );
}

export function PredictionGate({ pack, game, preds, concepts, scenarios, onSubmit, compact = false }) {
  const [answers, setAnswers] = useState({});
  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const connected = concepts.filter((c) => c.name?.trim());
  const goalsInMap = pack.goals.map((g) => ({ g, c: cardConcept(concepts, g.card) })).filter((x) => x.c);
  const proposalCheck = (a) => checkProposal(pack, game, scenarios.find((s) => s.id === a?.scenarioId), concepts);

  const complete = preds.every((p) => {
    const a = answers[p.id];
    if (p.kind === "pickConcept") return !!a;
    if (p.kind === "pickLoop") return a?.none || (a?.ids?.length >= 2);
    if (p.kind === "choice") return a !== undefined;
    if (p.kind === "goalDirections") return goalsInMap.every(({ g }) => a?.[g.card]);
    if (p.kind === "proposal") return !!a?.scenarioId && proposalCheck(a).errors.length === 0 && goalsInMap.every(({ g }) => a?.directions?.[g.card]);
    return true;
  });

  return (
    <div className={`bg-white rounded-lg border-2 border-citrus-400 p-4 space-y-4 text-sm text-neutral-900 ${compact ? "" : "max-w-3xl mx-auto mt-4"}`}>
      <div className="flex items-start gap-2">
        <Lock size={18} className="text-citrus-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Predict first</p>
          <p className="text-xs text-neutral-700">Agree on your team's answer and lock it in. Then the engine shows its result, and the Game panel shows how you did.</p>
        </div>
      </div>
      {preds.map((p) => (
        <div key={p.id} className="space-y-1.5">
          <p className="font-medium">{p.prompt} <span className="text-xs text-neutral-600">({p.kind === "goalDirections" || p.kind === "proposal" ? `${p.points} per goal` : `${p.points} points`})</span></p>
          {p.kind === "pickConcept" && (
            <select value={answers[p.id] || ""} onChange={(e) => set(p.id, e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm">
              <option value="">Choose a concept</option>
              {connected.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {p.kind === "pickLoop" && (
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1.5">
                {connected.map((c) => {
                  const ids = answers[p.id]?.ids || [];
                  const on = ids.includes(c.id);
                  return (
                    <label key={c.id} className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer ${on ? "border-cobalt-500 bg-cobalt-50" : "border-slate-300"} ${answers[p.id]?.none ? "opacity-40" : ""}`}>
                      <input type="checkbox" className="sr-only" disabled={answers[p.id]?.none || (!on && ids.length >= 4)} checked={on}
                        onChange={() => set(p.id, { ids: on ? ids.filter((x) => x !== c.id) : [...ids, c.id] })} />{c.name}
                    </label>
                  );
                })}
              </div>
              <label className="text-xs flex items-center gap-1.5"><input type="checkbox" checked={!!answers[p.id]?.none} onChange={(e) => set(p.id, e.target.checked ? { none: true, ids: [] } : { ids: [] })} />Our map has no feedback loop</label>
            </div>
          )}
          {p.kind === "choice" && (
            <div className="flex flex-col gap-1">
              {p.options.map((o, i) => (
                <label key={i} className="text-sm flex items-center gap-2"><input type="radio" name={p.id} checked={answers[p.id] === i} onChange={() => set(p.id, i)} />{o}</label>
              ))}
            </div>
          )}
          {(p.kind === "goalDirections" || p.kind === "proposal") && (
            <div className="space-y-1.5">
              {p.kind === "proposal" && (() => {
                const a = answers[p.id] || {};
                const chk = a.scenarioId ? proposalCheck(a) : null;
                return (
                  <div className="space-y-1">
                    <select value={a.scenarioId || ""} onChange={(e) => set(p.id, { ...a, scenarioId: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-sm">
                      <option value="">Choose your proposal (a scenario)</option>
                      {scenarios.filter((s) => s.id !== "baseline").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {chk && <p className="text-xs">Cost: {chk.cost} of {pack.budget}</p>}
                    {chk?.errors.map((er, i) => <p key={i} className="text-xs text-poppy-500">{er}</p>)}
                  </div>
                );
              })()}
              {goalsInMap.map(({ g, c }) => {
                const val = p.kind === "proposal" ? answers[p.id]?.directions?.[g.card] : answers[p.id]?.[g.card];
                const put = (d) => (p.kind === "proposal"
                  ? set(p.id, { ...(answers[p.id] || {}), directions: { ...(answers[p.id]?.directions || {}), [g.card]: d } })
                  : set(p.id, { ...(answers[p.id] || {}), [g.card]: d }));
                return (
                  <div key={g.card} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-48 font-medium">{c.name}</span>
                    <DirectionPicker name={`${p.id}-${g.card}`} value={val} onChange={put} />
                  </div>
                );
              })}
              {goalsInMap.length < pack.goals.length && (
                <p className="text-xs text-neutral-600">Goals not in your map are skipped: {pack.goals.filter((g) => !cardConcept(concepts, g.card)).map((g) => cardOf(pack, g.card)?.name).join(", ")}.</p>
              )}
            </div>
          )}
        </div>
      ))}
      <button className={primary} disabled={!complete} onClick={() => onSubmit(answers)}><Lock size={13} />Lock in our predictions</button>
    </div>
  );
}
