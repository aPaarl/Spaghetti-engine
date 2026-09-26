// The Spaghetti Engine brand: logo mark, colors, and typography.
//
// The mark is one strand of spaghetti drawn as an "S", running through the
// nodes of a causal map, with a cog at its center: the noodle is the system's
// tangle of causal links, the cog is the engine that runs it. The palette is
// "Cobalt and citrus": cobalt carries the interface, navy the dark surfaces,
// and citrus is the one accent.
import React, { useId } from "react";

export const BRAND = {
  cobalt: "#2456D6",       // Cobalt: primary color, buttons, links, active states
  cobaltDeep: "#1B3FA0",   // Deep Cobalt: the dark end of the badge, node outlines
  cobaltBright: "#3B6EF0", // Bright Cobalt: the light end of the badge
  navy: "#0F1B3D",         // Navy: header bar, hero, text on light backgrounds
  citrus: "#FFD23F",       // Citrus: the one accent, used sparingly
  citrusDeep: "#8A6B00",   // Deep Citrus: yellow text on light backgrounds
  citrusSoft: "#FFF3BF",   // Soft Citrus: tinted panels
  cloud: "#F6F8FC",        // Cloud: cool off-white page background
  poppy: "#E5484D",        // Poppy: alerts and warnings only
};

// The badge with the S-strand. `teeth` draws the cog's teeth; leave them out
// at 20 px and below, where they turn into noise.
export function BrandMark({ size = 32, teeth = true, className, title = "The Spaghetti Engine" }) {
  const gid = "se-" + useId().replace(/:/g, "");
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BRAND.cobaltBright} />
          <stop offset="1" stopColor={BRAND.cobaltDeep} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="15" fill={`url(#${gid})`} />
      <path d="M46 16 C32 8 14 16 21 26 C27 34 43 31 43 41 C43 51 24 54 16 47" fill="none" stroke={BRAND.citrus} strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="16" r="4.4" fill="#FFFFFF" stroke={BRAND.cobaltDeep} strokeWidth="1.6" />
      <circle cx="16" cy="47" r="4.4" fill="#FFFFFF" stroke={BRAND.cobaltDeep} strokeWidth="1.6" />
      <g transform="translate(32 31)">
        {teeth && <circle r="7.6" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeDasharray="2.9 2.9" />}
        <circle r="5.6" fill="#FFFFFF" stroke={BRAND.cobaltDeep} strokeWidth="1.6" />
        <circle r="2" fill={BRAND.cobalt} />
      </g>
    </svg>
  );
}

// Mark and name side by side. `tone` is "dark" on a navy or cobalt background
// and "light" on a white or cloud one.
export function BrandLockup({ size = 40, tone = "light", tagline = true }) {
  const dark = tone === "dark";
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={size} />
      <div className="leading-tight">
        <div className={`font-bold tracking-tight ${dark ? "text-white" : "text-ink"}`} style={{ fontSize: size * 0.5 }}>The Spaghetti Engine</div>
        {tagline && (
          <div className={`uppercase tracking-[0.12em] mt-0.5 ${dark ? "text-slate-400" : "text-slate-500"}`} style={{ fontSize: Math.max(9, size * 0.24) }}>
            Visual system modelling workspace
          </div>
        )}
      </div>
    </div>
  );
}

// A full-width backdrop for the hero: long strands that run from edge to edge,
// faint on the left where the text sits and vivid on the right, with a few
// nodes and a cog on them. It fills its (positioned, clipped) parent, so
// nothing stops midway. Decorative only.
export function BrandHeroArt({ className }) {
  const uid = useId().replace(/:/g, "");
  const fade = (name, color) => (
    <linearGradient id={`${name}-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0">
      <stop offset="0" stopColor={color} stopOpacity="0.10" />
      <stop offset="0.4" stopColor={color} stopOpacity="0.2" />
      <stop offset="0.66" stopColor={color} stopOpacity="0.85" />
      <stop offset="1" stopColor={color} stopOpacity="1" />
    </linearGradient>
  );
  const pid = `dots-${uid}`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 440" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <defs>
        {fade("cit", BRAND.citrus)}
        {fade("cob", "#5A87F5")}
        {fade("wht", "#FFFFFF")}
        <pattern id={pid} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1.4" fill="#FFFFFF" />
        </pattern>
      </defs>
      <rect width="1200" height="440" fill={`url(#${pid})`} opacity="0.07" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M-60 120 C 140 260, 300 40, 520 190 S 820 400, 1000 250 S 1160 90, 1260 260" stroke={`url(#cob-${uid})`} strokeWidth="6" />
        <path d="M-60 40 C 220 90, 420 -20, 700 90 S 1020 210, 1260 60" stroke={`url(#cit-${uid})`} strokeWidth="2.5" />
        <path d="M-60 250 C 200 130, 380 330, 600 240 S 900 60, 1260 330" stroke={`url(#wht-${uid})`} strokeWidth="2.5" />
        <path d="M-60 360 C 120 250, 260 470, 460 330 S 760 90, 940 200 S 1140 330, 1260 150" stroke={`url(#cit-${uid})`} strokeWidth="8" />
      </g>
      <g fill="#FFFFFF">
        <circle cx="708" cy="171" r="8" opacity="0.9" />
        <circle cx="775" cy="332" r="7" opacity="0.9" />
        <circle cx="995" cy="172" r="6" opacity="0.9" />
        <circle cx="1000" cy="250" r="9" />
        <circle cx="1122" cy="284" r="7" opacity="0.95" />
        <circle cx="1160" cy="135" r="7" opacity="0.95" />
        <circle cx="192" cy="356" r="5" opacity="0.25" />
        <circle cx="365" cy="135" r="5" opacity="0.25" />
        <circle cx="502" cy="43" r="4" opacity="0.25" />
      </g>
      <g transform="translate(940 200)">
        <circle r="35" fill="none" stroke="#FFFFFF" strokeWidth="13" strokeDasharray="6.9 6.9" />
        <circle r="26" fill="#FFFFFF" stroke={BRAND.cobaltDeep} strokeWidth="4" />
        <circle r="9" fill={BRAND.cobalt} />
      </g>
    </svg>
  );
}
