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

// The illustration on the About page: one feedback loop of five concepts on
// a soft lagoon disc, the concept in focus in coral. Drawn for a light
// background. Decorative only, so it is set as static markup.
const HERO_ART = "<defs><marker id=\"se-hero-ah\" viewBox=\"0 0 10 10\" refX=\"7\" refY=\"5\" markerWidth=\"5\" markerHeight=\"5\" orient=\"auto\"><path d=\"M1 1 L9 5 L1 9 Z\" fill=\"#0F6863\"/></marker></defs><circle cx=\"200\" cy=\"170\" r=\"150\" fill=\"#EEFBFA\"/><circle cx=\"200\" cy=\"170\" r=\"100\" fill=\"none\" stroke=\"#D3F4F1\" stroke-width=\"18\"/><path d=\"M229.2 74.4 A100 100 0 0 1 285.7 118.5\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-ah)\"/><path d=\"M299.6 161.3 A100 100 0 0 1 275.5 235.6\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-ah)\"/><path d=\"M239.1 262.1 A100 100 0 0 1 160.9 262.1\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-ah)\"/><path d=\"M124.5 235.6 A100 100 0 0 1 100.4 161.3\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-ah)\"/><path d=\"M114.3 118.5 A100 100 0 0 1 170.8 74.4\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"3\" stroke-linecap=\"round\" marker-end=\"url(#se-hero-ah)\"/><circle cx=\"200.0\" cy=\"70.0\" r=\"18\" fill=\"#FF8A5B\" stroke=\"#fff\" stroke-width=\"4\"/><circle cx=\"295.1\" cy=\"139.1\" r=\"13\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"258.8\" cy=\"250.9\" r=\"13\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"141.2\" cy=\"250.9\" r=\"13\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"104.9\" cy=\"139.1\" r=\"13\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/>";

export function BrandHeroArt({ className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 340" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: HERO_ART }} />;
}
