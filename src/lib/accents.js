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
// A10-r2 finding 1b/2: the replacement set was still not "AA-safe by role".
// Three separate holes, all now closed:
//
//   · DARK MODE IS LIVE (localStorage 'loop:theme' → data-theme on <html>, moon
//     toggle in the sidebar and mobile nav). The set carried ONE palette, so
//     picking an accent applied LIGHT variants into the dark theme: a filled
//     control's dark --text-inverse #171310 landed on a light fill at
//     2.18–4.00:1. Every option now carries an explicit `dark` set and App
//     re-applies on theme change.
//   · `base` is a graphical value and must clear 3:1, but Green measured
//     2.22:1 on white / 1.99:1 on the ground and Teal 3.08/2.76 — a white tick
//     or icon on those was unreadable. Both are retuned.
//   · `strong` was verified on `soft` but not on the GENERATED 10% tint, where
//     Pink fell to 4.44:1 (white) / 4.00:1 (ground). It is now gated on both
//     tint composites as well.
//
// Roles (they mirror the accent block in styles.css exactly):
//
//   base        graphical only — 3:1 class. The swatch the user sees.
//   fill        a filled control carrying --text-inverse; ≥4.5:1 against it.
//   fillHover   that control's hover. ALWAYS moves away from --text-inverse
//               (darker in light, brighter in dark), so hovering can only ever
//               RAISE contrast — the old `filter: brightness(1.08)` lightened
//               a light fill and pushed white text down to ~4.0:1.
//   strong      normal-size accent text; ≥4.5:1 on the ground, the surface,
//               its own `soft` chip AND its generated tint over both grounds.
//   soft        chip fill, `base` composited over that theme's surface.
//
// Every value was derived by moving `base` in lightness (hue and saturation
// held) until its threshold was met, using audit/colorcheck.mjs, and is stored
// as a literal so the palette harness can assert the whole matrix — 6 options ×
// 2 themes × every role pair — without a browser. If you add an option, the
// harness will fail until its numbers are real.
//
// ORDER MATTERS: ACCENT_OPTIONS[0] is the default. Its `light` mirrors :root
// and its `dark` mirrors [data-theme="dark"], because selecting it CLEARS the
// overrides and hands both themes back to the stylesheet. The harness asserts
// that mirror, so a future retune of either block cannot silently desync.

export const ACCENT_OPTIONS = [
  {
    // 'ตามธีม' — "follows the theme". Not "iOS Blue": this option applies by
    // CLEARING the overrides, so what the user gets is whatever the active
    // stylesheet block declares — systemBlue in light, espresso gold in dark
    // until phase 5. Labelling it by the light colour misdescribed it in dark.
    id: 'ios-blue', label: 'ตามธีม',
    // Mirrors styles.css. Selecting this clears the overrides entirely.
    // The dark set is the espresso GOLD family, not blue: the default option
    // means "follow the theme's own accent", and dark's accent is still gold
    // until the phase 5 retune. The five custom options below keep their own
    // colour in dark, because there the user picked that colour on purpose.
    light: { base: '#007aff', fill: '#006ade', fillHover: '#005dc2', strong: '#0058cc', soft: '#d6e6ff' },
    dark:  { base: '#d9a45e', fill: '#d9a45e', fillHover: '#deb175', strong: '#e7bd83', soft: '#3a2c1c' },
  },
  {
    id: 'indigo', label: 'Indigo',
    light: { base: '#5856d6', fill: '#5856d6', fillHover: '#423fd1', strong: '#5553d5', soft: '#e1e1f8' },
    dark:  { base: '#5957d6', fill: '#7473dd', fillHover: '#8b89e2', strong: '#8583e1', soft: '#292431' },
  },
  {
    id: 'teal', label: 'Teal',
    // base retuned from #00a2b3 (3.08:1 white / 2.76:1 ground — under the 3:1
    // graphical bar on the ground).
    light: { base: '#0099a9', fill: '#00818e', fillHover: '#006772', strong: '#00727e', soft: '#cfecef' },
    dark:  { base: '#00a2b3', fill: '#00a2b3', fillHover: '#00bbcf', strong: '#00a2b3', soft: '#1c2f2d' },
  },
  {
    id: 'violet', label: 'Violet',
    light: { base: '#af52de', fill: '#a944db', fillHover: '#9e2dd7', strong: '#9b29d5', soft: '#f1e0f9' },
    dark:  { base: '#af52de', fill: '#b155df', fillHover: '#bb6de3', strong: '#bd70e4', soft: '#362333' },
  },
  {
    id: 'pink', label: 'Pink',
    // strong darkened from #dd002a: it read 4.44:1 on its own 10% tint.
    light: { base: '#ff2d55', fill: '#ea002d', fillHover: '#ce0027', strong: '#cc0027', soft: '#ffdae1' },
    dark:  { base: '#ff2d55', fill: '#ff2d55', fillHover: '#ff496c', strong: '#ff4b6d', soft: '#401e1e' },
  },
  {
    id: 'green', label: 'Green',
    // base retuned from #34c759 (2.22:1 white / 1.99:1 ground — a white tick on
    // it was unreadable).
    light: { base: '#2a9f47', fill: '#23863c', fillHover: '#1d7032', strong: '#1f7635', soft: '#d5ecdb' },
    dark:  { base: '#34c759', fill: '#34c759', fillHover: '#48cf6a', strong: '#34c759', soft: '#264927' },
  },
];

export const THEMES = Object.freeze(['light', 'dark']);

/** The default option — selecting it means "let styles.css own the tokens". */
export const DEFAULT_ACCENT = ACCENT_OPTIONS[0].light.base;

/**
 * Look up a saved accent by its LIGHT base (the value the panel persists).
 * Anything not in the current option set — every legacy warm value, not just
 * the old LEGACY_ACCENT sentinel — resolves to null so the caller can reset it.
 * @param {string|null} hex
 */
export function accentOption(hex) {
  if (!hex) return null;
  const want = String(hex).trim().toLowerCase();
  return ACCENT_OPTIONS.find(o => o.light.base === want) ?? null;
}

/** True when `hex` is a usable option (and therefore safe to persist). */
export const isKnownAccent = hex => accentOption(hex) !== null;

/** The variant set a given theme should apply. */
export const variantsFor = (opt, theme) => (theme === 'dark' ? opt.dark : opt.light);

/** `#rrggbb` → "r, g, b", for building an rgba() tint. */
export function rgbChannels(hex) {
  const h = String(hex).trim().replace(/^#/, '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ');
}

/**
 * The full alias group a custom accent drives, as [cssProperty, value] pairs,
 * for ONE theme.
 *
 * The tint is derived from that theme's own `base` — it used to be hard-coded
 * to the default blue's channels, so every non-blue accent got a blue tint.
 * Alpha matches the stylesheet per theme (0.10 light / 0.14 dark).
 *
 * Deliberately does NOT include --amber / --amber-2 / --amber-deep: styles.css
 * declares those as var(--accent) / var(--accent-strong), so overriding the
 * accent group here makes the amber aliases follow automatically. Setting them
 * separately is what let the two families drift apart in the first place.
 *
 * @param {object} opt   an ACCENT_OPTIONS entry
 * @param {'light'|'dark'} theme
 */
export function accentVars(opt, theme = 'light') {
  const v = variantsFor(opt, theme);
  const alpha = theme === 'dark' ? '0.14' : '0.10';
  return [
    ['--accent',             v.base],
    ['--accent-fill',        v.fill],
    ['--accent-fill-hover',  v.fillHover],
    ['--accent-strong',      v.strong],
    ['--accent-soft',        v.soft],
    ['--accent-tint',        `rgba(${rgbChannels(v.base)}, ${alpha})`],
  ];
}

/** Every CSS property accentVars can set — used to clear a custom accent. */
export const ACCENT_VAR_NAMES = accentVars(ACCENT_OPTIONS[0], 'light').map(([k]) => k);
