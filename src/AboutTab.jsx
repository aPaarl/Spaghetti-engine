// "About & documentation": what the Spaghetti Engine is, who it is for, why it
// was made, the documentation as PDF downloads, and who to contact.
import React, { useState } from "react";
import {
  BookOpen, FileText, ScrollText, Download, Mail, Copy, Check, Users, GraduationCap,
  Microscope, ArrowRight, Landmark, Compass,
} from "lucide-react";
import pkg from "../package.json";
import manifest from "./docs-manifest.json";
import { BrandLockup, BrandHeroArt } from "./brand.jsx";

export const APP_VERSION = pkg.version;
export const CONTACT = {
  name: "Alfred Paarlberg",
  email: "alfred.paarlberg@wur.nl",
  affiliation: "Wageningen University & Research",
};

const BASE = import.meta.env.BASE_URL || "/";
const docUrl = (file) => `${BASE}docs/${file}`;

const DOCS = [
  {
    key: "manual", icon: BookOpen, title: "User Manual", audience: "For everyone who uses the tool",
    blurb: "How to build a model, run every analysis, read the results, export your work, and fix common problems. Includes a primer on fuzzy cognitive maps and a glossary.",
  },
  {
    key: "annex", icon: ScrollText, title: "Methodological Annex", audience: "For researchers and reviewers",
    blurb: "The formal, mathematical, and theoretical basis of every method in the tool.",
  },
  {
    key: "devlog", icon: FileText, title: "Development Log", audience: "For developers and collaborators",
    blurb: "What changed in this release, the implementation choices behind it, the defects found and fixed, how the work was verified, and the known limitations.",
  },
];

const AUDIENCES = [
  {
    icon: Microscope, title: "Researchers and analysts",
    text: "People who build causal models of nexus and socio-environmental systems and need every reported number to be traceable to a documented method.",
  },
  {
    icon: Users, title: "Workshop facilitators and participants",
    text: "The Model building tabs are made for working through a map live with stakeholders: draw it, see what it implies, and change it together.",
  },
  {
    icon: Landmark, title: "Policy and practice partners",
    text: "Anyone who wants to explore what-if questions, tipping points, and the order in which interventions work best on a shared map.",
  },
  {
    icon: GraduationCap, title: "Students and teachers",
    text: "Three worked example models, and documentation that explains the method as well as the buttons.",
  },
];

function SizeLabel({ doc }) {
  if (!doc || !doc.pages) return null;
  const mb = doc.sizeKB >= 1024 ? `${(doc.sizeKB / 1024).toFixed(1)} MB` : `${doc.sizeKB} KB`;
  return <span>PDF, {doc.pages} pages, {mb}</span>;
}

export default function AboutTab({ onOpenTab }) {
  const [copied, setCopied] = useState(false);
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the address is on screen and in the link */ }
  };
  const mailto = `mailto:${CONTACT.email}?subject=${encodeURIComponent(`The Spaghetti Engine v${APP_VERSION}`)}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Hero: strands that run edge to edge behind the text, faint on the left and vivid on the right */}
      <section className="relative overflow-hidden rounded-2xl bg-ink text-white">
        <BrandHeroArt className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/75 to-transparent" aria-hidden="true" />
        <div className="relative z-10 p-7 md:p-10 space-y-4 max-w-xl">
          <BrandLockup size={44} tone="dark" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight pt-2">
            Untangle complex systems, <span className="text-citrus-400">together.</span>
          </h1>
          <p className="text-slate-300 text-[15px] leading-relaxed">
            The Spaghetti Engine is a workspace in your browser for building, simulating, and stress-testing fuzzy cognitive maps of complex systems, with every method documented.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button onClick={() => onOpenTab("network")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-citrus-400 text-ink text-sm font-semibold hover:bg-citrus-300">
              Start building a map <ArrowRight size={15} />
            </button>
            <a href="#documentation" onClick={(e) => { e.preventDefault(); document.getElementById("documentation")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-500 bg-ink/40 text-sm font-medium text-slate-100 hover:bg-ink/70">
              <BookOpen size={15} /> Read the documentation
            </a>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">Version {APP_VERSION} (prototype). Runs entirely in your browser: no account, no installation, and your model stays on your computer.</p>
        </div>
      </section>

      {/* What it is and why it was made */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 md:p-7 space-y-4">
        <h2 className="text-base font-semibold text-slate-900">What it is and why it was made</h2>
        <div className="grid md:grid-cols-3 gap-6 md:gap-0 md:divide-x md:divide-slate-100">
          <div className="space-y-1.5 md:pr-6">
            <h3 className="text-sm font-semibold text-slate-800">What is a fuzzy cognitive map?</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              A causal map of a system. You draw the <strong>concepts</strong> that matter and join them with <strong>relationships</strong> that raise or lower one another, each with a strength. Run as a simple dynamic model, the map shows how the whole system responds when something changes, not only which links exist.
            </p>
          </div>
          <div className="space-y-1.5 md:px-6">
            <h3 className="text-sm font-semibold text-slate-800">Why it was made</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              To support participatory processes while still providing in-depth analysis. A map can be drawn and discussed live with stakeholders, and the same map can then be analyzed in depth, from structure and scenarios to sensitivity, transition points, and pathways, without changing tools or writing code.
            </p>
          </div>
          <div className="space-y-1.5 md:pl-6">
            <h3 className="text-sm font-semibold text-slate-800">Why the name?</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Real systems look like a plate of spaghetti: everything is tangled with everything. The engine follows each strand and turns the tangle into a model that can be run.
            </p>
          </div>
        </div>
      </section>

      {/* Who */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Who it is for</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AUDIENCES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-white rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-cobalt-50 text-cobalt-700 flex items-center justify-center"><Icon size={18} /></div>
                <div className="text-sm font-semibold text-slate-900 leading-tight">{title}</div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Where to start */}
      <section className="bg-citrus-50 border border-citrus-200 rounded-xl p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3"><Compass size={16} className="text-citrus-600" /> Where to start</div>
        <ol className="grid md:grid-cols-3 gap-4 text-sm text-slate-700">
          <li className="space-y-1.5">
            <div><span className="font-semibold">1. Pick a model.</span> Use New / example model at the top right for a worked example, or start a blank one.</div>
            <button onClick={() => onOpenTab("editor")} className="text-xs font-medium text-cobalt-700 hover:underline inline-flex items-center gap-1">Open the Model editor <ArrowRight size={12} /></button>
          </li>
          <li className="space-y-1.5">
            <div><span className="font-semibold">2. Draw or refine the map.</span> Drag to connect concepts, then set the direction and strength of each relationship.</div>
            <button onClick={() => onOpenTab("network")} className="text-xs font-medium text-cobalt-700 hover:underline inline-flex items-center gap-1">Open the Network tab <ArrowRight size={12} /></button>
          </li>
          <li className="space-y-1.5">
            <div><span className="font-semibold">3. See what it implies.</span> Run the baseline, then test interventions against it.</div>
            <button onClick={() => onOpenTab("equilibrium")} className="text-xs font-medium text-cobalt-700 hover:underline inline-flex items-center gap-1">Open Baseline Equilibrium <ArrowRight size={12} /></button>
          </li>
        </ol>
      </section>

      {/* Documentation */}
      <section id="documentation" className="space-y-3 scroll-mt-4">
        <div className="flex items-end justify-between flex-wrap gap-2">
          <h2 className="text-base font-semibold text-slate-900">Documentation</h2>
          <span className="text-xs text-slate-500">All three describe version {manifest.version}, the version you are using.</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {DOCS.map(({ key, icon: Icon, title, audience, blurb }) => {
            const doc = manifest.documents[key];
            return (
              <div key={key} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-ink text-citrus-400 flex items-center justify-center"><Icon size={18} /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 leading-tight">{title}</div>
                    <div className="text-[11px] text-slate-500">{audience}</div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">{blurb}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <a
                    href={docUrl(doc.file)} download={doc.file}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cobalt-700 text-white text-xs font-medium hover:bg-cobalt-800"
                  >
                    <Download size={13} /> Download PDF
                  </a>
                  <span className="text-[11px] text-slate-400 text-right"><SizeLabel doc={doc} /></span>
                </div>
                <a href={docUrl(doc.file)} target="_blank" rel="noreferrer" className="mt-2 text-[11px] text-slate-500 hover:text-cobalt-700 hover:underline">Open in a new tab</a>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">
          Help is also built into the tool: foldable explanation boxes at the top of each tab, and a Method &amp; diagnostics panel with every calculated result.
        </p>
      </section>

      {/* Contact */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center gap-5">
        <div className="w-14 h-14 rounded-full bg-ink text-citrus-400 flex items-center justify-center text-lg font-bold shrink-0">AP</div>
        <div className="flex-1 space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Contact</h2>
          <div className="text-sm text-slate-800 font-medium">{CONTACT.name}</div>
          <div className="text-xs text-slate-500">{CONTACT.affiliation}</div>
          <p className="text-xs text-slate-600 leading-relaxed pt-1">
            Questions, bug reports, ideas, and requests to collaborate are welcome. When reporting a problem, please mention the version ({APP_VERSION}) and, if you can, attach your model file (Export JSON).
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <a href={mailto} className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-cobalt-700 text-white text-sm font-medium hover:bg-cobalt-800">
            <Mail size={15} /> {CONTACT.email}
          </a>
          <button onClick={copyEmail} className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-50">
            {copied ? <><Check size={13} className="text-cobalt-700" /> Copied</> : <><Copy size={13} /> Copy address</>}
          </button>
        </div>
      </section>

      <p className="text-[11px] text-slate-500 text-center pb-2">
        The Spaghetti Engine, version {APP_VERSION} (prototype). Results are implications of the map as drawn, not forecasts.
      </p>
    </div>
  );
}
