// "About & documentation": what the Spaghetti Engine is, how to start, the
// documentation as PDF downloads, who it is for, and who to contact.
import React, { useState } from "react";
import {
  BookOpen, FileText, ScrollText, Download, Mail, Copy, Check, Users, GraduationCap,
  Microscope, ArrowRight, Landmark, ExternalLink, Gamepad2, Compass, HelpCircle,
  Share2, Activity, Sparkles, Sprout, ArrowLeft, Merge,
} from "lucide-react";
import pkg from "../package.json";
import manifest from "./docs-manifest.json";
import { BrandLockup, BrandHeroArt } from "./brand.jsx";
import { AUDIENCE_PAGES } from "./audiencePages.js";

export const APP_VERSION = pkg.version;
export const CONTACT = {
  name: "Alfred Paarlberg",
  email: "alfred.paarlberg@wur.nl",
};

const BASE = import.meta.env.BASE_URL || "/";
const docUrl = (file) => `${BASE}docs/${file}`;

const DOCS = [
  {
    key: "manual", icon: BookOpen, title: "User Manual", audience: "For everyone who uses the tool",
    blurb: "How to build a model, run every analysis, read the results, export your work, and solve common problems. Includes a primer on fuzzy cognitive maps and a glossary.",
    tint: "from-lagoon-600 to-lagoon-800",
  },
  {
    key: "annex", icon: ScrollText, title: "Methodological Annex", audience: "For researchers and reviewers",
    blurb: "The formal, mathematical, and theoretical basis of every method in the tool, with the equations behind each reported number.",
    tint: "from-sky-600 to-sky-800",
  },
  {
    key: "devlog", icon: FileText, title: "Development Log", audience: "For developers and collaborators",
    blurb: "What changed in this release, the implementation choices behind it, the defects found and fixed, how the work was verified, and the known limitations.",
    tint: "from-slate-600 to-slate-800",
  },
];

const AUDIENCES = [
  { id: "researchers", icon: Microscope, title: "Researchers", text: "Traceable models of complex systems", tint: "bg-lagoon-50 text-lagoon-700" },
  { id: "facilitators", icon: Users, title: "Facilitators", text: "Build maps live with stakeholders", tint: "bg-coral-50 text-coral-600" },
  { id: "policy", icon: Landmark, title: "Policy makers", text: "Test what-if questions and interventions", tint: "bg-sky-50 text-sky-700" },
  { id: "stakeholders", icon: Sprout, title: "Local stakeholders", text: "Make your knowledge of the system visible", tint: "bg-emerald-50 text-emerald-700" },
  { id: "education", icon: GraduationCap, title: "Students and teachers", text: "Learn with the guide and the game", tint: "bg-violet-50 text-violet-700" },
];

const STEPS = [
  { tab: "editor", icon: Sparkles, title: "Start a model", text: "Open the model menu at the top left to start a new model or open one you saved before.", link: "Open the Model editor" },
  { tab: "network", icon: Share2, title: "Draw the map", text: "Add concepts, drag to connect them, and set the direction and strength of each relationship.", link: "Open the Network tab" },
  { tab: "equilibrium", icon: Activity, title: "See what it implies", text: "Run the baseline to see where the system settles, then test interventions against it.", link: "Open Baseline Equilibrium" },
];

const jump = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

function SizeLabel({ doc }) {
  if (!doc || !doc.pages) return null;
  const mb = doc.sizeKB >= 1024 ? `${(doc.sizeKB / 1024).toFixed(1)} MB` : `${doc.sizeKB} KB`;
  return <>{doc.pages} pages, {mb}</>;
}

function SectionTitle({ kicker, title, children }) {
  return (
    <div className="space-y-1">
      {kicker && <div className="text-[14px] font-semibold uppercase tracking-[0.12em] text-lagoon-700">{kicker}</div>}
      <h2 className="se-display text-2xl font-bold tracking-tight text-ink">{title}</h2>
      {children && <p className="text-sm text-slate-600 max-w-2xl">{children}</p>}
    </div>
  );
}

// One group's page: why they would use the tool, a typical way of working
// (each step opens its tab), what they take away and what to keep in mind.
function AudiencePage({ id, onBack, onSwitch, onOpenTab, onOpenGuide, onOpenGame, onOpenCombine, onOpenWorkshop }) {
  const page = AUDIENCE_PAGES[id];
  const meta = AUDIENCES.find((a) => a.id === id);
  const doc = DOCS.find((d) => d.key === page.doc);
  const docFile = manifest.documents[page.doc];
  const actions = {
    combine: { run: onOpenCombine, label: "Open Combine maps", icon: Merge },
    guide: { run: onOpenGuide, label: "Open the guide", icon: Compass },
    game: { run: onOpenGame, label: "Play the game", icon: Gamepad2 },
    workshop: { run: onOpenWorkshop, label: "Prepare a workshop", icon: Users },
  };
  const Icon = meta.icon;
  const DocIcon = doc?.icon;
  const list = (items) => (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed"><Check size={16} className="text-lagoon-600 shrink-0 mt-0.5" />{t}</li>
      ))}
    </ul>
  );
  return (
    <div className="se-about max-w-4xl mx-auto space-y-8 pb-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-lagoon-700 hover:text-lagoon-900"><ArrowLeft size={15} /> Back to About</button>
      <header className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${meta.tint}`}><Icon size={30} /></div>
        <div className="space-y-1">
          <div className="text-[14px] font-semibold uppercase tracking-[0.12em] text-lagoon-700">Who it is for</div>
          <h1 className="se-display text-3xl font-bold tracking-tight text-ink">{page.title}</h1>
        </div>
      </header>
      <p className="text-[17px] leading-relaxed text-slate-700">{page.lead}</p>

      <section className="space-y-3">
        <h2 className="se-display text-xl font-bold text-ink">What it helps you do</h2>
        {list(page.purpose)}
      </section>

      <section className="space-y-3">
        <h2 className="se-display text-xl font-bold text-ink">A typical way of working</h2>
        <ol className="space-y-3">
          {page.steps.map((s, i) => {
            const act = s.action ? actions[s.action] : null;
            const ActIcon = act?.icon;
            return (
              <li key={s.title} className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-lagoon-700 text-white flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</span>
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-semibold text-ink">{s.title}</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{s.text}</p>
                </div>
                {act ? (
                  <button onClick={act.run} className="self-start sm:self-center shrink-0 text-[14px] font-semibold text-lagoon-700 hover:text-lagoon-900 inline-flex items-center gap-1"><ActIcon size={14} />{act.label}</button>
                ) : (
                  <button onClick={() => onOpenTab(s.tab)} className="self-start sm:self-center shrink-0 text-[14px] font-semibold text-lagoon-700 hover:text-lagoon-900 inline-flex items-center gap-1">Open <ArrowRight size={14} /></button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <section className="rounded-2xl bg-lagoon-50 border border-lagoon-100 p-5 space-y-3">
          <h2 className="se-display text-lg font-bold text-ink">What you take away</h2>
          {list(page.outputs)}
        </section>
        <section className="rounded-2xl bg-amber-50 border border-amber-100 p-5 space-y-3">
          <h2 className="se-display text-lg font-bold text-ink">Keep in mind</h2>
          <ul className="space-y-2">{page.caveats.map((t) => <li key={t} className="flex gap-2.5 text-sm text-slate-800 leading-relaxed"><HelpCircle size={16} className="text-amber-700 shrink-0 mt-0.5" />{t}</li>)}</ul>
        </section>
      </div>

      {doc && docFile && (
        <section className="rounded-2xl bg-white border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <DocIcon size={26} className="text-lagoon-700 shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">Recommended reading: {doc.title}</div>
            <p className="text-sm text-slate-700">{doc.blurb}</p>
          </div>
          <a href={docUrl(docFile.file)} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-lagoon-700 text-white text-[14px] font-semibold hover:bg-lagoon-800"><ExternalLink size={14} /> Read online</a>
        </section>
      )}

      <nav className="space-y-2">
        <div className="text-[14px] font-semibold text-slate-600">Other groups</div>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.filter((a) => a.id !== id).map((a) => (
            <button key={a.id} onClick={() => onSwitch(a.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-[14px] text-ink hover:border-lagoon-300 hover:text-lagoon-800"><a.icon size={14} />{a.title}</button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default function AboutTab({ onOpenTab, onOpenGuide, onOpenGame, onOpenCombine, onOpenWorkshop }) {
  const [copied, setCopied] = useState(false);
  const [audience, setAudience] = useState(null);
  const showAudience = (id) => { setAudience(id); setTimeout(() => document.querySelector(".se-about")?.scrollIntoView({ block: "start" }), 0); };
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address is on screen and in the link */ }
  };
  const mailto = `mailto:${CONTACT.email}?subject=${encodeURIComponent(`The Spaghetti Engine v${APP_VERSION}`)}`;
  const docsCurrent = manifest.version === APP_VERSION;
  const initials = CONTACT.name.split(" ").map((w) => w[0]).join("").slice(0, 2);

  if (audience && AUDIENCE_PAGES[audience]) {
    return (
      <AudiencePage
        id={audience} onSwitch={showAudience}
        onBack={() => { setAudience(null); setTimeout(() => document.getElementById("about-who")?.scrollIntoView({ block: "start" }), 0); }}
        onOpenTab={onOpenTab} onOpenGuide={onOpenGuide} onOpenGame={onOpenGame} onOpenCombine={onOpenCombine} onOpenWorkshop={onOpenWorkshop}
      />
    );
  }

  return (
    <div className="se-about max-w-6xl mx-auto space-y-12 pb-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-lagoon-100 bg-gradient-to-br from-lagoon-50 via-white to-coral-50">
        <div className="grid md:grid-cols-[1.25fr_1fr] items-center gap-6 p-6 md:p-12">
          <div className="space-y-5">
            <BrandLockup size={46} />
            <h1 className="se-display text-[32px] sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.08] text-ink">
              Untangle complex systems, <span className="text-lagoon-700">together.</span>
            </h1>
            <p className="text-[17px] leading-relaxed text-slate-700 max-w-xl">
              A workspace in your browser for building, simulating, and stress-testing fuzzy cognitive maps of complex systems, with every method documented.
            </p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => onOpenTab("network")} className="w-full sm:w-64 justify-center inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-lagoon-700 bg-lagoon-700 text-white text-sm font-semibold shadow-sm shadow-lagoon-900/20 hover:bg-lagoon-800">
                Start building a map <ArrowRight size={16} />
              </button>
              <a href="#documentation" onClick={jump("documentation")} className="w-full sm:w-64 justify-center inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-ink hover:border-lagoon-400 hover:text-lagoon-800">
                <BookOpen size={16} /> Read the documentation
              </a>
            </div>
            <button onClick={onOpenWorkshop} className="inline-flex items-center gap-2 text-[15px] font-semibold text-coral-600 hover:text-coral-700">
              <Users size={17} /> Running a workshop? Prepare it here <ArrowRight size={15} />
            </button>
          </div>
          <BrandHeroArt className="hidden md:block w-full max-w-[380px] justify-self-center" />
        </div>
      </section>

      {/* What it is */}
      <section id="about-what" className="scroll-mt-4 space-y-5">
        <SectionTitle kicker="About" title="What it is and why it was made" />
        <div className="grid md:grid-cols-3 gap-4">
          {[
            ["What is a fuzzy cognitive map?", <>A causal map of a system. You draw the <strong>concepts</strong> that matter and join them with <strong>relationships</strong> that raise or lower one another, each with a strength. Run as a simple dynamic model, the map shows how the whole system responds when something changes.</>],
            ["Why it was made", "To support participatory processes while still providing in-depth analysis. A map can be drawn and discussed live with stakeholders, and the same map can then be analysed in depth, from structure and scenarios to sensitivity, transition points, and pathways, without changing tools or writing code."],
            ["Why the name?", "Real systems look like a plate of spaghetti: everything is tangled with everything. The engine follows each strand and turns the tangle into a model that can be run."],
          ].map(([h, body]) => (
            <div key={h} className="rounded-2xl bg-white border border-slate-200 p-5 space-y-2">
              <h3 className="text-sm font-semibold text-ink">{h}</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Get started */}
      <section id="about-start" className="scroll-mt-4 space-y-5">
        <SectionTitle kicker="Get started" title="Your first map in three steps" />
        <ol className="grid md:grid-cols-3 gap-4">
          {STEPS.map(({ tab, icon: Icon, title, text, link }, i) => (
            <li key={tab} className="relative rounded-2xl bg-white border border-slate-200 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-full bg-lagoon-700 text-white flex items-center justify-center text-sm font-bold">{i + 1}</span>
                <Icon size={18} className="text-lagoon-600" />
                <span className="text-sm font-semibold text-ink">{title}</span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed flex-1">{text}</p>
              <button onClick={() => onOpenTab(tab)} className="self-start text-[14px] font-semibold text-lagoon-700 hover:text-lagoon-900 inline-flex items-center gap-1">{link} <ArrowRight size={14} /></button>
            </li>
          ))}
        </ol>
        <button onClick={onOpenWorkshop} className="group w-full text-left rounded-2xl bg-ink text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-shadow">
          <span className="w-12 h-12 rounded-xl bg-coral-500 text-white flex items-center justify-center shrink-0"><Users size={22} /></span>
          <span className="flex-1 space-y-1">
            <span className="block se-display text-lg font-bold">Prepare a workshop</span>
            <span className="block text-sm text-slate-200 leading-relaxed">Plan an agenda from ready-made steps, check that your model is ready, print a script and a handout, and run the session step by step with a timer.</span>
          </span>
          <span className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coral-500 text-sm font-semibold group-hover:bg-coral-600">Open the planner <ArrowRight size={15} /></span>
        </button>
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={onOpenGuide} className="group text-left rounded-2xl border border-lagoon-200 bg-lagoon-50 p-5 flex items-start gap-4 hover:border-lagoon-400">
            <span className="w-11 h-11 rounded-xl bg-white text-lagoon-700 flex items-center justify-center shrink-0 shadow-sm"><Compass size={20} /></span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-ink">Getting started guide</span>
              <span className="block text-sm text-slate-700">Step-by-step help that follows you through the tabs while you build your first map.</span>
            </span>
          </button>
          <button onClick={onOpenGame} className="group text-left rounded-2xl border border-coral-200 bg-coral-50 p-5 flex items-start gap-4 hover:border-coral-400">
            <span className="w-11 h-11 rounded-xl bg-white text-coral-600 flex items-center justify-center shrink-0 shadow-sm"><Gamepad2 size={20} /></span>
            <span className="space-y-1">
              <span className="block text-sm font-semibold text-ink">Play the Meinweg game</span>
              <span className="block text-sm text-slate-700">A 30-minute tutorial: build your own model of a national park in trouble and answer its questions.</span>
            </span>
          </button>
        </div>
      </section>

      {/* Documentation */}
      <section id="documentation" className="scroll-mt-4 space-y-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <SectionTitle kicker="Documentation" title="Read the manual and the method">
            Three documents, each as a PDF to download or read in your browser.
          </SectionTitle>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-medium ${docsCurrent ? "bg-lagoon-50 text-lagoon-800" : "bg-amber-50 text-amber-800"}`}>
            {docsCurrent ? <Check size={14} /> : <HelpCircle size={14} />}
            {docsCurrent ? `Up to date with version ${APP_VERSION}` : `Describes version ${manifest.version}, not yet ${APP_VERSION}`}
          </span>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {DOCS.map(({ key, icon: Icon, title, audience, blurb, tint }) => {
            const doc = manifest.documents[key];
            return (
              <article key={key} className="rounded-2xl bg-white border border-slate-200 overflow-hidden flex flex-col shadow-[0_1px_2px_rgba(13,35,38,0.04),0_12px_28px_-20px_rgba(13,35,38,0.35)]">
                <div className={`relative bg-gradient-to-br ${tint} text-white px-5 pt-5 pb-6`}>
                  <Icon size={26} className="opacity-90" />
                  <div className="se-display mt-3 text-lg font-bold leading-tight">{title}</div>
                  <div className="text-[14px] text-white/80">Version {manifest.version} · PDF · <SizeLabel doc={doc} /></div>
                </div>
                <div className="p-5 flex flex-col flex-1 gap-3">
                  <div className="text-[14px] font-semibold uppercase tracking-wide text-slate-500">{audience}</div>
                  <p className="text-sm text-slate-700 leading-relaxed flex-1">{blurb}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a href={docUrl(doc.file)} download={doc.file} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-lagoon-700 text-white text-[14px] font-semibold hover:bg-lagoon-800">
                      <Download size={15} /> Download PDF
                    </a>
                    <a href={docUrl(doc.file)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 text-[14px] font-medium text-ink hover:border-lagoon-300 hover:text-lagoon-800">
                      <ExternalLink size={14} /> Read online
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Who */}
      <section id="about-who" className="scroll-mt-4 space-y-5">
        <SectionTitle kicker="Audience" title="Who it is for">
          Choose a group to read what the tool offers it, a typical way of working, and what to keep in mind.
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {AUDIENCES.map(({ id, icon: Icon, title, text, tint }) => (
            <button key={id} onClick={() => showAudience(id)} className="group rounded-2xl bg-white border border-slate-200 p-5 flex flex-col items-center text-center gap-3 transition-shadow hover:shadow-md hover:border-lagoon-300">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tint}`}><Icon size={26} /></div>
              <div className="se-display text-[16px] font-bold text-ink leading-tight">{title}</div>
              <p className="text-[14px] text-slate-600 leading-snug flex-1">{text}</p>
              <span className="text-[14px] font-semibold text-lagoon-700 group-hover:text-lagoon-900 inline-flex items-center gap-1">Read more <ArrowRight size={14} /></span>
            </button>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="about-contact" className="scroll-mt-4 rounded-3xl bg-ink text-white p-7 md:p-9 flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-lagoon-600 text-white flex items-center justify-center text-xl font-bold shrink-0">{initials}</div>
        <div className="flex-1 space-y-1.5">
          <div className="text-[14px] font-semibold uppercase tracking-[0.12em] text-lagoon-300">Contact</div>
          <h2 className="se-display text-xl font-bold">{CONTACT.name}</h2>
          <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
            Questions, bug reports, ideas, and requests to collaborate are welcome. When reporting a problem, please mention the version ({APP_VERSION}) and, if you can, attach your model file (Export JSON in the model menu).
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <a href={mailto} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 text-white text-sm font-semibold hover:bg-coral-600">
            <Mail size={16} /> Send an email
          </a>
          <button onClick={copyEmail} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 text-[14px] text-slate-200 hover:bg-white/10">
            {copied ? <><Check size={14} className="text-lagoon-300" /> Copied</> : <><Copy size={14} /> {CONTACT.email}</>}
          </button>
        </div>
      </section>

      <p className="text-[14px] text-slate-500 text-center">
        The Spaghetti Engine, version {APP_VERSION} (prototype). Results are implications of the map as drawn, not forecasts.
      </p>
    </div>
  );
}
