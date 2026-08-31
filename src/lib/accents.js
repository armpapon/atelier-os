// Custom accent palette for the Tweaks panel.
//
// A10 finding 3: the old option list was six swatches from the warm ivory
// build (a tan, a sage, a dusty blue, a lilac, a rose and a terracotta).
// Picking any of them wrote that hex into --amber and resurrected the warm
// palette on top of the True Cupertino tokens — and it wrote --amber ALONE, so
// --accent and --accent-strong stayed blue while their own alias went tan. Two
// bugs: a warm palette that outlived the redesign, and an inconsistent alias
// group. (Literal hexes deliberately not repeated here — the palette harness
// sweeps src/ for the retired warm values and this file must stay clean.)
//
// The set below is a curated iOS system-tint palette, default systemBlue.
// Every option carries its own derived variants so a custom accent obeys the
// same role split as the built-in one (see the accent block in styles.css):
//
//   base    graphical only — 3:1 class. The swatch the user actually sees.
//   fill    a filled control carrying --text-inverse text; ≥4.5:1 vs #ffffff.
//   strong  normal-size accent text; ≥4.5:1 on BOTH #ffffff and #f2f2f7,
//           and ≥4.5:1 on its own `soft` chip fill.
//   soft    light chip fill, `base` composited over white.
//
// fill/strong/soft were derived by darkening `base` in place (hue and
// saturation held) until each threshold was met, using audit/colorcheck.mjs.
// They are stored as literals rather than computed at runtime so the palette
// harness in audit/cases.mjs can assert every one of them without a browser.
// If you add an option, run `node audit/colorcheck.mjs` and add it to the
// harness — the harness asserts this whole list, so an unverified option fails.
//
// ORDER MATTERS: ACCENT_OPTIONS[0] is the default and MUST mirror the values
// in styles.css :root exactly, because selecting it clears the overrides and
// hands the tokens back to the stylesheet.

export const ACCENT_OPTIONS = [
  {
    id: 'ios-blue', label: 'iOS Blue',
    base: '#007aff', fill: '#006ade', strong: '#0058cc', soft: '#d6e6ff',
  },
  {
    id: 'indigo', label: 'Indigo',
    base: '#5856d6', fill: '#3432cd', strong: '#3432cd', soft: '#deddf7',
  },
  {
    id: 'teal', label: 'Teal',
    base: '#00a2b3', fill: '#00818f', strong: '#007a87', soft: '#e6f6f7',
  },
  {
    id: 'violet', label: 'Violet',
    base: '#af52de', fill: '#9c29d6', strong: '#9c29d6', soft: '#f1e1f9',
  },
  {
    id: 'pink', label: 'Pink',
    base: '#ff2d55', fill: '#ea002d', strong: '#dd002a', soft: '#ffeef1',
  },
  {
    id: 'green', label: 'Green',
    base: '#34c759', fill: '#23863c', strong: '#217e39', soft: '#e2f7e7',
  },
];

/** The default option — selecting it means "let styles.css own the tokens". */
export const DEFAULT_ACCENT = ACCENT_OPTIONS[0].base;

/**
 * Look up a saved accent. Anything not in the current option set — every
 * legacy warm value, not just the old LEGACY_ACCENT sentinel — resolves to
 * null so the caller can reset it to the default.
 * @param {string|null} hex
 * @returns {{id:string,label:string,base:string,fill:string,strong:string,soft:string}|null}
 */
export function accentOption(hex) {
  if (!hex) return null;
  const want = String(hex).trim().toLowerCase();
  return ACCENT_OPTIONS.find(o => o.base === want) ?? null;
}

/** True when `hex` is a usable option (and therefore safe to persist). */
export const isKnownAccent = hex => accentOption(hex) !== null;

/**
 * The full alias group a custom accent drives, as [cssProperty, value] pairs.
 *
 * Deliberately does NOT include --amber / --amber-2 / --amber-deep: styles.css
 * declares those as var(--accent) / var(--accent-strong), so overriding the
 * accent trio here makes the amber aliases follow automatically. Setting them
 * separately is what let the two families drift apart in the first place.
 *
 * @param {{base:string,fill:string,strong:string,soft:string}} opt
 */
export function accentVars(opt) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(opt.base.slice(i, i + 2), 16));
  return [
    ['--accent',        opt.base],
    ['--accent-fill',   opt.fill],
    ['--accent-strong', opt.strong],
    ['--accent-soft',   opt.soft],
    ['--accent-tint',   `rgba(${r}, ${g}, ${b}, 0.10)`],
  ];
}

/** Every CSS property accentVars can set — used to clear a custom accent. */
export const ACCENT_VAR_NAMES = accentVars(ACCENT_OPTIONS[0]).map(([k]) => k);
