// The Spaghetti Engine brand: logo mark, colours, and typography.
//
// The mark is a feedback loop of three concepts, the simplest system that
// behaves as a whole, with the concept in focus in coral. The palette is
// "Lagoon and coral": lagoon carries the
// interface, deep ink the text, and coral is the one accent.
import React, { useId } from "react";

export const BRAND = {
  lagoon: "#0F6863",       // Lagoon: primary colour, buttons, links, active states
  lagoonDeep: "#0F4442",   // Deep Lagoon: the dark end of the badge
  lagoonBright: "#1F9A93", // Bright Lagoon: the light end of the badge
  lagoonSoft: "#EEFBFA",   // Soft Lagoon: tinted panels
  ink: "#0D2326",          // Ink: text and dark surfaces
  coral: "#FF8A5B",        // Coral: the one accent, used sparingly
  coralDeep: "#B6401A",    // Deep Coral: accent text on light backgrounds
  coralSoft: "#FFE5DA",    // Soft Coral: tinted panels
  paper: "#F5F7F7",        // Paper: cool off-white page background
  poppy: "#E5484D",        // Poppy: alerts and warnings only
};

// The badge: three concepts joined in one feedback loop, the concept in
// focus in coral.
export function BrandMark({ size = 32, className, title = "The Spaghetti Engine" }) {
  const gid = "se-" + useId().replace(/:/g, "");
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND.lagoonBright} />
          <stop offset="1" stopColor={BRAND.lagoonDeep} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${gid})`} />
      <path d="M37.99 17.17 A16 16 0 0 1 47.84 34.23" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round"/>
      <path d="M41.85 44.61 A16 16 0 0 1 22.15 44.61" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round"/>
      <path d="M16.16 34.23 A16 16 0 0 1 26.01 17.17" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round"/>
      <circle cx="32.00" cy="16.00" r="6.0" fill="#FF8A5B" stroke="#fff" strokeWidth="2"/>
      <circle cx="45.86" cy="40.00" r="5.2" fill="#fff"/>
      <circle cx="18.14" cy="40.00" r="5.2" fill="#fff"/>
    </svg>
  );
}

// Mark and name side by side. `tone` is "dark" on an ink or lagoon
// background and "light" on a white or paper one.
export function BrandLockup({ size = 40, tone = "light", tagline = true }) {
  const dark = tone === "dark";
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} />
      <div className="leading-tight">
        <div className={`se-display font-bold tracking-tight ${dark ? "text-white" : "text-ink"}`} style={{ fontSize: size * 0.5 }}>The Spaghetti Engine</div>
        {tagline && (
          <div className={`uppercase tracking-[0.12em] mt-0.5 ${dark ? "text-slate-300" : "text-slate-500"}`} style={{ fontSize: Math.max(10, size * 0.24) }}>
            Visual system modelling workspace
          </div>
        )}
      </div>
    </div>
  );
}

// The illustration on the About page: a small causal map of four concepts
// in one feedback loop, with signed links and the concept in focus in coral
// at its centre. Drawn for a light background. Decorative only, so it is
// set as static markup.
const HERO_ART = "<defs><marker id=\"se-hero-arrow\" viewBox=\"0 0 10 10\" refX=\"6\" refY=\"5\" markerWidth=\"5\" markerHeight=\"5\" orient=\"auto\"><path d=\"M0 0 L10 5 L0 10 z\" fill=\"#1F9A93\"/></marker><pattern id=\"se-hero-dots\" width=\"18\" height=\"18\" patternUnits=\"userSpaceOnUse\"><circle cx=\"9\" cy=\"9\" r=\"1.3\" fill=\"#A9E8E2\"/></pattern></defs><circle cx=\"205\" cy=\"180\" r=\"160\" fill=\"#D3F4F1\" opacity=\"0.6\"/><circle cx=\"205\" cy=\"180\" r=\"160\" fill=\"url(#se-hero-dots)\" opacity=\"0.7\"/><circle cx=\"350\" cy=\"52\" r=\"30\" fill=\"#FFE5DA\"/><path d=\"M144.9 102.9 Q197.5 71.6 253.1 97.2\" fill=\"none\" stroke=\"#1F9A93\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M300.1 134.7 Q328.1 168.5 309.6 208.3\" fill=\"none\" stroke=\"#1F9A93\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M275.2 253.9 Q226.2 286.7 171.8 263.9\" fill=\"none\" stroke=\"#1F9A93\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M123.9 228.5 Q93.2 191.2 111.4 146.5\" fill=\"none\" stroke=\"#1F9A93\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M188.8 164.9 Q171.5 136.6 139.2 129.4\" fill=\"none\" stroke=\"#73D4CC\" stroke-width=\"2.5\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M266.7 123.3 Q240.5 132.5 231.2 158.8\" fill=\"none\" stroke=\"#73D4CC\" stroke-width=\"2.5\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><path d=\"M231.6 194.4 Q248.8 221.1 280.1 226.7\" fill=\"none\" stroke=\"#73D4CC\" stroke-width=\"2.5\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-arrow)\"/><rect x=\"60.5\" y=\"85\" width=\"89.0\" height=\"40\" rx=\"20\" fill=\"#FFFFFF\" stroke=\"#0F6863\" stroke-width=\"2.5\"/><circle cx=\"78.5\" cy=\"105\" r=\"6\" fill=\"#1F9A93\"/><text x=\"90.5\" y=\"110\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"#0D2326\">Water</text><rect x=\"246.2\" y=\"75\" width=\"97.6\" height=\"40\" rx=\"20\" fill=\"#FFFFFF\" stroke=\"#0F6863\" stroke-width=\"2.5\"/><circle cx=\"264.2\" cy=\"95\" r=\"6\" fill=\"#1F9A93\"/><text x=\"276.2\" y=\"100\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"#0D2326\">Energy</text><rect x=\"274.8\" y=\"230\" width=\"80.4\" height=\"40\" rx=\"20\" fill=\"#FFFFFF\" stroke=\"#0F6863\" stroke-width=\"2.5\"/><circle cx=\"292.8\" cy=\"250\" r=\"6\" fill=\"#1F9A93\"/><text x=\"304.8\" y=\"255\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"#0D2326\">Food</text><rect x=\"89.8\" y=\"248\" width=\"80.4\" height=\"40\" rx=\"20\" fill=\"#FFFFFF\" stroke=\"#0F6863\" stroke-width=\"2.5\"/><circle cx=\"107.8\" cy=\"268\" r=\"6\" fill=\"#1F9A93\"/><text x=\"119.8\" y=\"273\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"14\" font-weight=\"600\" fill=\"#0D2326\">Land</text><circle cx=\"210\" cy=\"180\" r=\"30\" fill=\"#FF8A5B\" opacity=\"0.25\"/><circle cx=\"210\" cy=\"180\" r=\"20\" fill=\"#FF8A5B\" stroke=\"#FFFFFF\" stroke-width=\"4\"/><circle cx=\"200\" cy=\"72\" r=\"11\" fill=\"#FFFFFF\" stroke=\"#CFD8D8\"/><text x=\"200\" y=\"77\" text-anchor=\"middle\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"15\" font-weight=\"700\" fill=\"#0F6863\">+</text><circle cx=\"345\" cy=\"170\" r=\"11\" fill=\"#FFFFFF\" stroke=\"#CFD8D8\"/><text x=\"345\" y=\"175\" text-anchor=\"middle\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"15\" font-weight=\"700\" fill=\"#0F6863\">+</text><circle cx=\"222\" cy=\"292\" r=\"11\" fill=\"#FFFFFF\" stroke=\"#CFD8D8\"/><text x=\"222\" y=\"297\" text-anchor=\"middle\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"15\" font-weight=\"700\" fill=\"#0F6863\">\u2212</text><circle cx=\"88\" cy=\"190\" r=\"11\" fill=\"#FFFFFF\" stroke=\"#CFD8D8\"/><text x=\"88\" y=\"195\" text-anchor=\"middle\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"15\" font-weight=\"700\" fill=\"#0F6863\">+</text>";

export function BrandHeroArt({ className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 360" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: HERO_ART }} />;
}
