// Mounted acceptance for the custom accent × theme wiring (v4.54, audit A10-r2).
//
// The r2 auditor's Major 1b: dark mode is LIVE — App persists the theme at
// localStorage 'loop:theme' and stamps data-theme on <html>, and the moon
// toggle sits in the sidebar. But the accent override wrote ONE palette, and
// an inline custom property on <html> beats BOTH :root and
// [data-theme="dark"]. So picking a custom accent and then switching to dark
// left the LIGHT fill in place under dark's --text-inverse (#171310) — as low
// as 2.18:1 on a filled control.
//
// The pure palette cases in audit/cases.mjs prove the VALUES are AA-safe in
// both themes. What they cannot prove is that App applies the right SET at the
// right time, because that needs a real mount, a real click and a real
// documentElement. That is this file's whole job:
//
//   · selecting an accent in light mode writes the option's LIGHT variants
//   · toggling to dark RE-APPLIES the same option's DARK variants (the effect
//     depends on `theme`, which is the actual fix)
//   · toggling back restores the light set
//   · choosing the default clears the overrides entirely, in both themes, so
//     the stylesheet — including the dark block — owns the palette again
//
// Values are read back from the inline style, and asserted against
// src/lib/accents.js rather than against hardcoded hexes: this test proves the
// WIRING, the harness proves the NUMBERS.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';

import App from '../../src/App.jsx';
import {
  ACCENT_OPTIONS, DEFAULT_ACCENT, ACCENT_VAR_NAMES,
  variantsFor, rgbChannels,
} from '../../src/lib/accents.js';
import { __tables, __config } from '../mock-supabase.mjs';

const viewport = (isMobile) => vi.stubGlobal('matchMedia', (query) => ({
  matches: isMobile, media: query, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {},
  addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
}));

const root = () => document.documentElement;
/** What the inline override actually holds for one custom property. */
const applied = (name) => root().style.getPropertyValue(name).trim();
const themeAttr = () => root().getAttribute('data-theme');

/** Every accent property currently pinned inline on <html>. */
const overridden = () => ACCENT_VAR_NAMES.filter(n => applied(n) !== '');

/** The Tweaks panel's swatch for an option id (data-accent, set by the panel). */
const swatch = (id) => document.querySelector(`[data-accent="${id}"]`);

/** jsdom normalises an inline `background: #rrggbb` to `rgb(r, g, b)`. */
const cssColor = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Assert the inline override matches `option`'s variants for `theme` — every
 * member of the group, including the tint, which is derived per option+theme
 * (it used to be hardcoded to the default blue's channels).
 */
function expectVariants(option, theme) {
  const v = variantsFor(option, theme);
  const alpha = theme === 'dark' ? '0.14' : '0.10';
  expect(applied('--accent')).toBe(v.base);
  expect(applied('--accent-fill')).toBe(v.fill);
  expect(applied('--accent-fill-hover')).toBe(v.fillHover);
  expect(applied('--accent-strong')).toBe(v.strong);
  expect(applied('--accent-soft')).toBe(v.soft);
  expect(applied('--accent-tint')).toBe(`rgba(${rgbChannels(v.base)}, ${alpha})`);
}

beforeEach(() => {
  cleanup();
  for (const k of Object.keys(__tables)) __tables[k] = [];
  __config.rpcHandlers = {};
  __config.missingColumns = {};
  __config.opFailures = {};
  __config.opFailurePredicate = null;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/?preview=1');
  viewport(false);
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
  // A previous test's inline overrides would otherwise survive on <html>.
  for (const n of ACCENT_VAR_NAMES) root().style.removeProperty(n);
  root().style.removeProperty('--amber');
  root().removeAttribute('data-theme');
});

afterEach(() => {
  window.localStorage.clear();
  for (const n of ACCENT_VAR_NAMES) root().style.removeProperty(n);
  root().removeAttribute('data-theme');
});

/** Mount the shell and open the Tweaks panel. */
async function mountWithTweaks() {
  const view = render(<App />);
  await screen.findByRole('button', { name: 'การเงินส่วนตัว' });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'เปิด Tweaks' })); });
  return view;
}

const toggleTheme = async () => {
  const label = themeAttr() === 'dark' ? 'โหมดสว่าง' : 'โหมดมืด';
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: label })); });
};

// A non-default option — the default one applies by CLEARING, so it cannot
// show that the right variant SET was chosen.
const CUSTOM = ACCENT_OPTIONS.find(o => o.light.base !== DEFAULT_ACCENT);

// ════════════════════════════════════════════════════════════════════════════
describe('สีธีมที่ผู้ใช้เลือก · ต้องตามธีมสว่าง/มืด (A10-r2)', () => {

  it('applies the LIGHT variants when a custom accent is picked in light mode', async () => {
    await mountWithTweaks();
    expect(themeAttr()).toBe('light');

    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });

    expectVariants(CUSTOM, 'light');
    // --amber must never be pinned on its own: styles.css declares it as
    // var(--accent), so it follows the group.
    expect(applied('--amber')).toBe('');
  });

  it('RE-APPLIES the dark variants when the theme is toggled to dark', async () => {
    await mountWithTweaks();
    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });
    expectVariants(CUSTOM, 'light');

    await toggleTheme();

    expect(themeAttr()).toBe('dark');
    // The regression: these used to still be the light values, leaving dark's
    // --text-inverse on a light fill.
    expectVariants(CUSTOM, 'dark');
    expect(applied('--accent-fill')).toBe(CUSTOM.dark.fill);
    expect(applied('--accent-fill')).not.toBe(CUSTOM.light.fill);
  });

  it('applies the dark variants when the accent is picked while already in dark', async () => {
    await mountWithTweaks();
    await toggleTheme();
    expect(themeAttr()).toBe('dark');

    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });

    expectVariants(CUSTOM, 'dark');
  });

  it('restores the light variants when the theme is toggled back', async () => {
    await mountWithTweaks();
    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });
    await toggleTheme();
    expectVariants(CUSTOM, 'dark');

    await toggleTheme();

    expect(themeAttr()).toBe('light');
    expectVariants(CUSTOM, 'light');
  });

  it('keeps every option honest: each one applies its own set in both themes', async () => {
    await mountWithTweaks();

    for (const option of ACCENT_OPTIONS.filter(o => o.light.base !== DEFAULT_ACCENT)) {
      await act(async () => { fireEvent.click(swatch(option.id)); });
      expectVariants(option, 'light');
      await toggleTheme();
      expectVariants(option, 'dark');
      await toggleTheme();
    }
  });

  it('clears every override for the default option — the stylesheet owns both themes', async () => {
    await mountWithTweaks();
    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });
    expect(overridden().length).toBe(ACCENT_VAR_NAMES.length);

    const dflt = ACCENT_OPTIONS.find(o => o.light.base === DEFAULT_ACCENT);
    await act(async () => { fireEvent.click(swatch(dflt.id)); });

    // Nothing pinned inline → :root applies.
    expect(overridden()).toEqual([]);
    expect(applied('--amber')).toBe('');

    // …and it stays cleared in dark, so [data-theme="dark"] applies there.
    await toggleTheme();
    expect(themeAttr()).toBe('dark');
    expect(overridden()).toEqual([]);
  });

  // ── The swatches themselves (A10-r3 Minor · UX) ──────────────────────────
  // Every option's swatch must paint the colour that option produces IN THE
  // ACTIVE THEME. The first one used to render its light blue in dark while
  // selecting it actually left the espresso gold in place — the one swatch
  // that lied about what it did.

  it('paints every swatch with the LIGHT base in light mode', async () => {
    await mountWithTweaks();
    expect(themeAttr()).toBe('light');

    for (const o of ACCENT_OPTIONS) {
      expect(swatch(o.id).style.background).toBe(cssColor(o.light.base));
    }
  });

  it('repaints every swatch with the DARK base when the theme is dark', async () => {
    await mountWithTweaks();
    await toggleTheme();
    expect(themeAttr()).toBe('dark');

    for (const o of ACCENT_OPTIONS) {
      expect(swatch(o.id).style.background).toBe(cssColor(o.dark.base));
    }
    // The regression, named: the default option's two themes really do differ,
    // so this assertion could not pass by accident.
    const dflt = ACCENT_OPTIONS.find(o => o.light.base === DEFAULT_ACCENT);
    expect(dflt.dark.base).not.toBe(dflt.light.base);
    expect(swatch(dflt.id).style.background).not.toBe(cssColor(dflt.light.base));
  });

  it('labels the default option by what it does, not by one theme’s colour', async () => {
    await mountWithTweaks();
    const dflt = ACCENT_OPTIONS.find(o => o.light.base === DEFAULT_ACCENT);

    // "ตามธีม" = follows the theme. It must not name a colour, because the
    // colour changes with the theme.
    expect(dflt.label).toBe('ตามธีม');
    expect(swatch(dflt.id).getAttribute('aria-label')).toBe('ตามธีม');
    expect(screen.getByRole('button', { name: 'ตามธีม' })).toBe(swatch(dflt.id));
  });

  it('keeps selection tied to the option identity, not the painted colour', async () => {
    // The swatch repaints per theme, but what is stored and matched is always
    // the option's light base — otherwise a theme switch would lose the pick.
    await mountWithTweaks();
    await act(async () => { fireEvent.click(swatch(CUSTOM.id)); });
    expect(swatch(CUSTOM.id).getAttribute('aria-pressed')).toBe('true');

    await toggleTheme();

    expect(swatch(CUSTOM.id).getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem('atelier:accent')).toBe(CUSTOM.light.base);
  });

  it('resets a legacy warm accent saved by an older build, in dark too', async () => {
    // The warm ivory build persisted its own swatch here.
    window.localStorage.setItem('atelier:accent', '#d4a574');
    window.localStorage.setItem('loop:theme', 'dark');

    await mountWithTweaks();

    expect(themeAttr()).toBe('dark');
    // Unknown value → default → overrides cleared, never the warm hex pinned.
    expect(overridden()).toEqual([]);
    expect(window.localStorage.getItem('atelier:accent')).toBe(DEFAULT_ACCENT);
  });
});
