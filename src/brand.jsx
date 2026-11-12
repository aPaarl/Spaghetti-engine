// The Spaghetti Engine brand: logo mark, colours, and typography.
//
// The mark is one strand of spaghetti that runs from a concept to the coral
// concept in focus, and ties itself into a loop on the way: the strand is a
// causal link, and the loop is the feedback that makes a system behave as a
// whole. The palette is "Lagoon and coral": lagoon carries the
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

// The strand of the mark, in a 64 by 64 box.
export const BRAND_STRAND = "M13 50 C24 50 25 40 28 33 C32 22 47 18 49 30 C51 42 35 45 31 36 C27 27 37 14 51 14";

// The badge.
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
      <path d={BRAND_STRAND} fill="none" stroke="#FFFFFF" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="13" cy="50" r="4.2" fill="#FFFFFF" />
      <circle cx="51" cy="14" r="5.4" fill={BRAND.coral} stroke="#FFFFFF" strokeWidth="2" />
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

// The illustration on the About page: a small causal map whose links are
// soft strands, with one feedback loop drawn in lagoon and the concept in
// focus in coral. Drawn for a light background. Decorative only.
export function BrandHeroArt({ className }) {
  const uid = useId().replace(/:/g, "");
  const nodes = [
    { x: 70, y: 70, r: 15 }, { x: 228, y: 44, r: 12 }, { x: 330, y: 150, r: 17 },
    { x: 196, y: 196, r: 22, focus: true }, { x: 60, y: 230, r: 13 }, { x: 300, y: 292, r: 13 }, { x: 150, y: 318, r: 11 },
  ];
  const links = [
    "M70 70 C120 30 180 30 228 44", "M228 44 C300 60 340 100 330 150", "M330 150 C320 200 260 210 196 196",
    "M196 196 C140 180 100 120 70 70", "M196 196 C150 220 90 210 60 230", "M196 196 C240 240 290 250 300 292",
    "M60 230 C70 290 110 320 150 318", "M150 318 C200 320 260 320 300 292",
  ];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 360" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`halo-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={BRAND.coral} stopOpacity="0.35" />
          <stop offset="1" stopColor={BRAND.coral} stopOpacity="0" />
        </radialGradient>
        <marker id={`arr-${uid}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={BRAND.lagoonBright} />
        </marker>
      </defs>
      <circle cx="196" cy="196" r="70" fill={`url(#halo-${uid})`} />
      <g fill="none" strokeLinecap="round">
        {links.map((d, i) => (
          <path key={i} d={d} stroke={i < 4 ? BRAND.lagoonBright : "#A9C9C6"} strokeWidth={i < 4 ? 4 : 2.5} strokeDasharray={i < 4 ? undefined : "1 7"} />
        ))}
      </g>
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.focus ? BRAND.coral : "#FFFFFF"} stroke={n.focus ? "#FFFFFF" : BRAND.lagoon} strokeWidth={n.focus ? 4 : 3} />
          {!n.focus && <circle cx={n.x} cy={n.y} r={n.r * 0.38} fill={BRAND.lagoonBright} opacity="0.5" />}
        </g>
      ))}
    </svg>
  );
}
