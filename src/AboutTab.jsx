// "About & documentation": what the Spaghetti Engine is, how to start, the
// documentation as PDF downloads, who it is for, and who to contact.
import React, { useState } from "react";
import {
  BookOpen, FileText, ScrollText, Download, Mail, Copy, Check, Users, GraduationCap,
  Microscope, ArrowRight, Landmark, ExternalLink, Gamepad2, Compass, HelpCircle,
  Share2, Activity, Sparkles, ShieldCheck, Laptop,
} from "lucide-react";
import pkg from "../package.json";
import manifest from "./docs-manifest.json";
import { BrandLockup, BrandHeroArt } from "./brand.jsx";

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
  { icon: Microscope, title: "Researchers and analysts", text: "Build causal models of nexus and socio-environmental systems, with every number traceable to a documented method." },
  { icon: Users, title: "Workshop facilitators", text: "Draw a map live with stakeholders, see what it implies, and change it together." },
  { icon: Landmark, title: "Policy and practice", text: "Explore what-if questions, tipping points, and the order in which interventions work best." },
  { icon: GraduationCap, title: "Students and teachers", text: "Learn with the guided first map, the 30-minute Veldmeer game, and a simple view with only the essentials." },
];

const STEPS = [
  { tab: "editor", icon: Sparkles, title: "Start a model", text: "Open the model menu at the top left to start a new model or open one you saved before.", link: "Open the Model editor" },
  { tab: "network", icon: Share2, title: "Draw the map", text: "Add concepts, drag to connect them, and set the direction and strength of each relationship.", link: "Open the Network tab" },
  { tab: "equilibrium", icon: Activity, title: "See what it implies", text: "Run the baseline to see where the system settles, then test interventions against it.", link: "Open Baseline Equilibrium" },
];

const SECTIONS = [
  ["about-what", "What it is"], ["about-start", "Get started"], ["documentation", "Documentation"],
  ["about-who", "Who it is for"], ["about-contact", "Contact"],
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
      {kicker && <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-lagoon-700">{kicker}</div>}
      <h2 className="se-display text-2xl font-bold tracking-tight text-ink">{title}</h2>
      {children && <p className="text-sm text-slate-600 max-w-2xl">{children}</p>}
    </div>
  );
}

export default function AboutTab({ onOpenTab, onOpenGuide, onOpenGame }) {
  const [copied, setCopied] = useState(false);
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
              <button onClick={() => onOpenTab("network")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lagoon-700 text-white text-sm font-semibold shadow-sm shadow-lagoon-900/20 hover:bg-lagoon-800">
                Start building a map <ArrowRight size={16} />
              </button>
              <a href="#documentation" onClick={jump("documentation")} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-ink hover:border-lagoon-400 hover:text-lagoon-800">
                <BookOpen size={16} /> Read the documentation
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-1 text-[14px] text-slate-600">
              <li className="inline-flex items-center gap-1.5"><Laptop size={15} className="text-lagoon-600" />Runs in your browser</li>
              <li className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-lagoon-600" />No account, your model stays on your computer</li>
              <li className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-coral-500" />Version {APP_VERSION} (prototype)</li>
            </ul>
          </div>
          <BrandHeroArt className="hidden md:block w-full max-w-[380px] justify-self-center" />
        </div>
      </section>

      {/* On this page */}
      <nav aria-label="On this page" className="flex flex-wrap gap-2 -mt-6">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={jump(id)} className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-[14px] text-slate-700 hover:border-lagoon-300 hover:text-lagoon-800">{label}</a>
        ))}
      </nav>

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
              <span className="block text-sm font-semibold text-ink">Play the Veldmeer game</span>
              <span className="block text-sm text-slate-700">A 30-minute tutorial: build your own model of a lake in trouble and answer its questions.</span>
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
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium ${docsCurrent ? "bg-lagoon-50 text-lagoon-800" : "bg-amber-50 text-amber-800"}`}>
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
                  <div className="text-[13px] text-white/80">Version {manifest.version} · PDF · <SizeLabel doc={doc} /></div>
                  <svg viewBox="0 0 64 64" className="absolute right-3 top-3 w-14 h-14 opacity-20" aria-hidden="true">
                    <path d="M13 50 C24 50 25 40 28 33 C32 22 47 18 49 30 C51 42 35 45 31 36 C27 27 37 14 51 14" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="p-5 flex flex-col flex-1 gap-3">
                  <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">{audience}</div>
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
        <p className="text-sm text-slate-600">
          Help is also built into the tool. The Help menu at the top right holds the Getting started guide, the Veldmeer game, and a short guide to building a map with its keyboard shortcuts. Each tab has foldable explanation boxes, and a Method &amp; diagnostics panel lists every calculated result.
        </p>
      </section>

      {/* Who */}
      <section id="about-who" className="scroll-mt-4 space-y-5">
        <SectionTitle kicker="Audience" title="Who it is for" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AUDIENCES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-lagoon-50 text-lagoon-700 flex items-center justify-center"><Icon size={19} /></div>
              <div className="text-sm font-semibold text-ink">{title}</div>
              <p className="text-sm text-slate-700 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="about-contact" className="scroll-mt-4 rounded-3xl bg-ink text-white p-7 md:p-9 flex flex-col md:flex-row md:items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-lagoon-600 text-white flex items-center justify-center text-xl font-bold shrink-0">{initials}</div>
        <div className="flex-1 space-y-1.5">
          <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-lagoon-300">Contact</div>
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
