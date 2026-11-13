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

// The illustration on the About page: a light preview of the workspace, a
// window with a small causal map (the concept in focus in coral) and two
// floating cards with a convergence chart and ranked bars. Drawn for a
// light background. Decorative only, so it is set as static markup.
const HERO_ART = "<defs><filter id=\"se-hero-sh\" x=\"-20%\" y=\"-20%\" width=\"140%\" height=\"150%\"><feDropShadow dx=\"0\" dy=\"10\" stdDeviation=\"12\" flood-color=\"#0D2326\" flood-opacity=\"0.14\"/></filter><linearGradient id=\"se-hero-bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#D3F4F1\"/><stop offset=\"1\" stop-color=\"#FFE5DA\"/></linearGradient></defs><rect x=\"30\" y=\"40\" width=\"340\" height=\"280\" rx=\"40\" fill=\"url(#se-hero-bg)\" opacity=\"0.7\"/><g filter=\"url(#se-hero-sh)\"><rect x=\"40\" y=\"62\" width=\"290\" height=\"200\" rx=\"16\" fill=\"#FFFFFF\"/></g><rect x=\"40\" y=\"62\" width=\"290\" height=\"30\" rx=\"16\" fill=\"#F5F7F7\"/><rect x=\"40\" y=\"80\" width=\"290\" height=\"12\" fill=\"#F5F7F7\"/><circle cx=\"58\" cy=\"77\" r=\"4.5\" fill=\"#FF8A5B\"/><circle cx=\"72\" cy=\"77\" r=\"4.5\" fill=\"#FFCAB4\"/><circle cx=\"86\" cy=\"77\" r=\"4.5\" fill=\"#CFD8D8\"/><rect x=\"110\" y=\"71\" width=\"90\" height=\"12\" rx=\"6\" fill=\"#E3E8E8\"/><line x1=\"85\" y1=\"140\" x2=\"150\" y2=\"118\" stroke=\"#73D4CC\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"150\" y1=\"118\" x2=\"205\" y2=\"150\" stroke=\"#FFA984\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"85\" y1=\"140\" x2=\"130\" y2=\"200\" stroke=\"#FFA984\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"130\" y1=\"200\" x2=\"190\" y2=\"222\" stroke=\"#73D4CC\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"205\" y1=\"150\" x2=\"250\" y2=\"195\" stroke=\"#73D4CC\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"190\" y1=\"222\" x2=\"250\" y2=\"195\" stroke=\"#FFA984\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"150\" y1=\"118\" x2=\"130\" y2=\"200\" stroke=\"#73D4CC\" stroke-width=\"3\" stroke-linecap=\"round\"/><line x1=\"205\" y1=\"150\" x2=\"190\" y2=\"222\" stroke=\"#FFA984\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"85\" cy=\"140\" r=\"10\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"150\" cy=\"118\" r=\"10\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"205\" cy=\"150\" r=\"13\" fill=\"#FF8A5B\" stroke=\"#fff\" stroke-width=\"3\"/><circle cx=\"130\" cy=\"200\" r=\"10\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"190\" cy=\"222\" r=\"10\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><circle cx=\"250\" cy=\"195\" r=\"10\" fill=\"#fff\" stroke=\"#0F6863\" stroke-width=\"3\"/><g filter=\"url(#se-hero-sh)\"><rect x=\"228\" y=\"168\" width=\"150\" height=\"112\" rx=\"14\" fill=\"#FFFFFF\"/></g><text x=\"242\" y=\"190\" font-family=\"Inter, system-ui, sans-serif\" font-size=\"11\" font-weight=\"600\" fill=\"#0D2326\">How the system settles</text><polyline points=\"242.0,235.0 254.0,226.6 266.0,220.9 278.0,217.1 290.0,214.6 302.0,212.9 314.0,211.7 326.0,211.0 338.0,210.4 350.0,210.1 362.0,209.9\" fill=\"none\" stroke=\"#0F6863\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><polyline points=\"242.0,235.0 254.0,230.3 266.0,227.1 278.0,224.9 290.0,223.5 302.0,222.5 314.0,221.9 326.0,221.5 338.0,221.2 350.0,221.0 362.0,220.9\" fill=\"none\" stroke=\"#1F9A93\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><polyline points=\"242.0,227.0 254.0,232.8 266.0,236.7 278.0,239.3 290.0,241.0 302.0,242.2 314.0,243.0 326.0,243.5 338.0,243.9 350.0,244.1 362.0,244.3\" fill=\"none\" stroke=\"#FF8A5B\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><polyline points=\"242.0,235.0 254.0,233.4 266.0,232.4 278.0,231.6 290.0,231.2 302.0,230.8 314.0,230.6 326.0,230.5 338.0,230.4 350.0,230.3 362.0,230.3\" fill=\"none\" stroke=\"#73D4CC\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><line x1=\"242\" y1=\"235\" x2=\"362\" y2=\"235\" stroke=\"#CFD8D8\" stroke-dasharray=\"3 3\"/><g filter=\"url(#se-hero-sh)\"><rect x=\"18\" y=\"226\" width=\"128\" height=\"86\" rx=\"14\" fill=\"#FFFFFF\"/></g><rect x=\"32\" y=\"242\" width=\"88\" height=\"9\" rx=\"4.5\" fill=\"#0F6863\"/><rect x=\"32\" y=\"258\" width=\"62\" height=\"9\" rx=\"4.5\" fill=\"#1F9A93\"/><rect x=\"32\" y=\"274\" width=\"40\" height=\"9\" rx=\"4.5\" fill=\"#73D4CC\"/><rect x=\"32\" y=\"290\" width=\"24\" height=\"9\" rx=\"4.5\" fill=\"#FF8A5B\"/>";

export function BrandHeroArt({ className }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 340" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: HERO_ART }} />;
}
