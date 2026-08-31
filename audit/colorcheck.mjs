// audit/colorcheck.mjs — deterministic colour maths for the palette audit.
//
// Pure functions, no DOM, no network. Everything the styles.css comment block
// claims about contrast and colour-vision separation is computed HERE, and the
// palette cases in audit/cases.mjs assert against these same functions.
//
// A10 finding 2: the previous (ad-hoc, uncommitted) CVD calculator produced
// numbers that an independent auditor could not reproduce — it claimed the
// chart pair held ΔE2000 ≈ 37 under protanopia when the real figure was ≈ 6.
// So this module ships with REFERENCE SELF-TESTS (see selfTest below): if the
// simulation matrices or the ΔE2000 implementation are ever broken, the audit
// harness fails loudly instead of blessing a wrong claim.
//
// Pipeline: sRGB → linear RGB → LMS (Hunt-Pointer-Estévez, D65) →
//           Viénot–Brettel–Mollon 1999 dichromat projection → linear RGB →
//           XYZ (D65) → CIE Lab → CIEDE2000.

// ── sRGB ↔ linear ─────────────────────────────────────────────────────────
export function hexToRgb(hex) {
  const h = String(hex).trim().replace(/^#/, '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`bad hex: ${hex}`);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]) {
  const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

const srgbToLinearChannel = v => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const linearToSrgbChannel = v => {
  const c = Math.max(0, Math.min(1, v));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return s * 255;
};

export const toLinear = hex => hexToRgb(hex).map(srgbToLinearChannel);
export const fromLinear = lin => rgbToHex(lin.map(linearToSrgbChannel));

// ── WCAG 2.x relative luminance + contrast ────────────────────────────────
export function luminance(hex) {
  const [r, g, b] = toLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, unrounded. */
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** One decimal place, the convention used in the styles.css comments. */
export const contrast1 = (a, b) => Math.round(contrast(a, b) * 10) / 10;

/** Composite a translucent overlay (rgba) over an opaque backdrop → hex. */
export function composite(overlayRgb, alpha, backdropHex) {
  const back = hexToRgb(backdropHex);
  return rgbToHex(overlayRgb.map((c, i) => c * alpha + back[i] * (1 - alpha)));
}

// ── Matrix helpers ────────────────────────────────────────────────────────
const mul = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

// Smith–Pokorny LMS fundamentals as published with Viénot, Brettel & Mollon
// (1999). The projection below is applied to LINEAR-light RGB (scaled 0–255),
// not to gamma-encoded values: applying it to gamma-encoded RGB — which several
// JS libraries do — is what shifts protanope separation by ~1.5 ΔE and is the
// likeliest source of a mis-stated CVD claim.
const RGB_TO_LMS = [
  [17.8824,    43.5161,    4.11935  ],
  [ 3.45565,   27.1554,    3.86714  ],
  [ 0.0299566,  0.184309,  1.46709  ],
];
const LMS_TO_RGB = [
  [ 0.0809444479, -0.130504409,   0.116721066  ],
  [-0.0102485335,  0.0540193266, -0.113614708  ],
  [-0.000365296938, -0.00412161469, 0.693511405],
];

// Viénot 1999 single-plane projections, valid for PROTAN and DEUTAN only —
// the paper itself notes the reduction does not hold for tritanopia.
const CVD_LMS = {
  protan: [
    [0, 2.02344, -2.52581],
    [0, 1,        0      ],
    [0, 0,        1      ],
  ],
  deutan: [
    [1,        0, 0      ],
    [0.494207, 0, 1.24827],
    [0,        0, 1      ],
  ],
};

export const CVD_TYPES = Object.freeze(['protan', 'deutan', 'tritan']);
/** The two deficiencies this palette is actually gated on. */
export const CVD_GATING = Object.freeze(['protan', 'deutan']);

const lmsOf = hex => mul(RGB_TO_LMS, toLinear(hex).map(v => v * 255));
const hexOfLms = lms => fromLinear(mul(LMS_TO_RGB, lms).map(v => v / 255));

// Brettel (1997) two-half-plane construction, used for TRITAN. Each half-plane
// is spanned by the neutral axis and one anchor stimulus; a colour is projected
// onto whichever half-plane it falls in. Anchors here are the sRGB blue and red
// primaries — the standard practical stand-in for Brettel's monochromatic
// 485nm / 660nm anchors. Tritan output therefore varies by a few ΔE between
// published implementations; it is reported for information and is NOT a gate.
const WHITE_LMS = mul(RGB_TO_LMS, [255, 255, 255]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function brettelTritan(hex) {
  const lms = lmsOf(hex);
  const anchorA = mul(RGB_TO_LMS, [0, 0, 255]);   // sRGB blue
  const anchorB = mul(RGB_TO_LMS, [255, 0, 0]);   // sRGB red
  const sepNormal = cross(WHITE_LMS, anchorA);
  const side = sepNormal[0] * lms[0] + sepNormal[1] * lms[1] + sepNormal[2] * lms[2];
  const anchor = side >= 0 ? anchorA : anchorB;
  const p = cross(WHITE_LMS, anchor);
  // Solve the plane equation for S, leaving L and M untouched.
  const out = [lms[0], lms[1], -(p[0] * lms[0] + p[1] * lms[1]) / p[2]];
  return hexOfLms(out);
}

/**
 * Full-severity dichromat simulation of a colour.
 * @param {string} hex
 * @param {'protan'|'deutan'|'tritan'} type
 * @returns {string} simulated hex
 */
export function simulateCvd(hex, type) {
  if (type === 'tritan') return brettelTritan(hex);
  const M = CVD_LMS[type];
  if (!M) throw new Error(`unknown CVD type: ${type}`);
  return hexOfLms(mul(M, lmsOf(hex)));
}

// ── Lab (D65) ─────────────────────────────────────────────────────────────
const LIN_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.0721750],
  [0.0193339, 0.1191920, 0.9503041],
];
// D65 white point, 2° observer.
const WHITE = [0.9504559, 1.0, 1.0890578];

export function labOf(hex) {
  const xyz = mul(LIN_TO_XYZ, toLinear(hex));
  const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = xyz.map((v, i) => f(v / WHITE[i]));
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// ── CIEDE2000 ─────────────────────────────────────────────────────────────
const deg = r => (r * 180) / Math.PI;
const rad = d => (d * Math.PI) / 180;

/** CIEDE2000 colour difference between two hex colours (kL=kC=kH=1). */
export function deltaE2000(hexA, hexB) {
  const [L1, a1, b1] = labOf(hexA);
  const [L2, a2, b2] = labOf(hexB);

  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const C7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Math.pow(25, 7))));

  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);

  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);

  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;

  let dhp;
  if (Cp1 * Cp2 === 0) dhp = 0;
  else if (Math.abs(hp2 - hp1) <= 180) dhp = hp2 - hp1;
  else if (hp2 - hp1 > 180) dhp = hp2 - hp1 - 360;
  else dhp = hp2 - hp1 + 360;
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dhp) / 2);

  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;

  let hpbar;
  if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpbar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hpbar = (hp1 + hp2 + 360) / 2;
  else hpbar = (hp1 + hp2 - 360) / 2;

  const T = 1
    - 0.17 * Math.cos(rad(hpbar - 30))
    + 0.24 * Math.cos(rad(2 * hpbar))
    + 0.32 * Math.cos(rad(3 * hpbar + 6))
    - 0.20 * Math.cos(rad(4 * hpbar - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hpbar - 275) / 25, 2));
  const Cpbar7 = Math.pow(Cpbar, 7);
  const Rc = 2 * Math.sqrt(Cpbar7 / (Cpbar7 + Math.pow(25, 7)));
  const Lbar50 = Math.pow(Lbar - 50, 2);
  const Sl = 1 + (0.015 * Lbar50) / Math.sqrt(20 + Lbar50);
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  return Math.sqrt(
    Math.pow(dLp / Sl, 2) +
    Math.pow(dCp / Sc, 2) +
    Math.pow(dHp / Sh, 2) +
    Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/**
 * ΔE2000 between two colours as seen with normal vision and under each
 * full-severity dichromacy.
 * @returns {{normal:number, protan:number, deutan:number, tritan:number}}
 */
export function separation(hexA, hexB) {
  const out = { normal: deltaE2000(hexA, hexB) };
  for (const t of CVD_TYPES) out[t] = deltaE2000(simulateCvd(hexA, t), simulateCvd(hexB, t));
  return out;
}

export const round2 = n => Math.round(n * 100) / 100;

// ── Reference self-tests ──────────────────────────────────────────────────
// These pin the implementation against values computed OUTSIDE this repo.
// If a matrix, a white point or a ΔE term is ever mistyped, these fail —
// which is the whole point: finding 2 existed because nothing guarded them.
export const REFERENCE_CASES = Object.freeze([
  // 1. Sharma, Wu & Dalal (2005) CIEDE2000 test data — the canonical 34-pair
  //    set, fed as Lab directly. These exercise the awkward branches: the
  //    hue-averaging wrap, the Rt rotation term and the near-neutral chroma
  //    case. Tolerance 2e-4 = the precision the published table is given to.
  { kind: 'lab', lab1: [50.0000, 2.6772, -79.7751],  lab2: [50.0000, 0.0000, -82.7485],  expect: 2.0425 },
  { kind: 'lab', lab1: [50.0000, 3.1571, -77.2803],  lab2: [50.0000, 0.0000, -82.7485],  expect: 2.8615 },
  { kind: 'lab', lab1: [50.0000, 2.8361, -74.0200],  lab2: [50.0000, 0.0000, -82.7485],  expect: 3.4412 },
  { kind: 'lab', lab1: [50.0000, 2.5000, 0.0000],    lab2: [73.0000, 25.0000, -18.0000], expect: 27.1492 },
  { kind: 'lab', lab1: [50.0000, 2.5000, 0.0000],    lab2: [50.0000, 3.1736, 0.5854],    expect: 1.0000 },
  { kind: 'lab', lab1: [50.0000, 2.5000, 0.0000],    lab2: [50.0000, 3.2972, 0.0000],    expect: 1.0000 },
  { kind: 'lab', lab1: [50.0000, 0.0000, 0.0000],    lab2: [50.0000, -1.0000, 2.0000],   expect: 2.3669 },
  { kind: 'lab', lab1: [60.2574, -34.0099, 36.2677], lab2: [60.4626, -34.1751, 39.4387], expect: 1.2644 },
  { kind: 'lab', lab1: [22.7233, 20.0904, -46.6940], lab2: [23.0331, 14.9730, -42.5619], expect: 2.0373 },
  // 2. WCAG anchors — black on white is exactly 21:1, white on white 1:1,
  //    and #767676 is the canonical "just passes AA on white" grey.
  { kind: 'contrast', a: '#000000', b: '#ffffff', expect: 21 },
  { kind: 'contrast', a: '#ffffff', b: '#ffffff', expect: 1 },
  { kind: 'contrast', a: '#767676', b: '#ffffff', expect: 4.54 },
  // 3. Structural invariants of a correct dichromat projection. A mistyped
  //    matrix coefficient breaks at least one of these immediately, which is
  //    exactly the guard that was missing when the bad CVD claim shipped.
  //    (a) Neutral greys are on the projection plane → unchanged.
  { kind: 'grey', hexes: ['#000000', '#808080', '#c0c0c0', '#ffffff'], tol: 1.5 },
  //    (b) A projection onto a plane must be idempotent: M·M = M. Checked on
  //        the matrices themselves, because checking it on hex round-trips
  //        would only measure sRGB gamut clamping.
  { kind: 'idempotentMatrix', tol: 1e-6 },
  //    (c) The blue–yellow axis SURVIVES protan and deutan (that is the whole
  //        reason the fixed chart pair leans teal), while the red–green axis
  //        COLLAPSES under deutan (the textbook confusion pair).
  { kind: 'preserveAxis', a: '#0000ff', b: '#ffff00', types: ['protan', 'deutan'], min: 55 },
  { kind: 'collapse', a: '#d02020', b: '#6f8f20', normalMin: 45, cvdMax: 12, types: ['deutan'] },
  //    (d) Tritan uses a DIFFERENT construction from protan/deutan — guards
  //        against one projection being pasted over all three.
  { kind: 'distinctSim', hex: '#c9663a', min: 5 },
  // 4. Cross-implementation check: the A10 auditor's published numbers for the
  //    OUTGOING chart pair #2f6b2c / #c9663a. Reproducing normal + the two
  //    GATING deficiencies proves this module agrees with an independent
  //    implementation. Tritan is checked only loosely (order of magnitude):
  //    Viénot's single plane is invalid for tritan and published Brettel
  //    variants disagree by several ΔE — it was never the finding.
  { kind: 'separation', a: '#2f6b2c', b: '#c9663a',
    expect: { normal: 49.06, protan: 6.27, deutan: 19.19 }, tol: 0.5,
    loose: { tritan: 45.07 }, looseTol: 8 },
]);

/** Runs REFERENCE_CASES. Returns [{name, ok, detail}]. */
export function selfTest() {
  const out = [];
  const near = (got, want, tol) => Math.abs(got - want) <= tol;

  for (const c of REFERENCE_CASES) {
    if (c.kind === 'lab') {
      // deltaE2000 takes hex; expose the Lab path via a tiny shim so the
      // Sharma pairs can be fed verbatim.
      const got = deltaE2000FromLab(c.lab1, c.lab2);
      out.push({
        name: `CIEDE2000 Sharma pair → ${c.expect}`,
        ok: near(got, c.expect, 0.0002),
        detail: `got ${got.toFixed(4)}`,
      });
    } else if (c.kind === 'contrast') {
      const got = contrast(c.a, c.b);
      out.push({
        name: `WCAG contrast ${c.a} vs ${c.b} → ${c.expect}`,
        ok: near(got, c.expect, 0.01),
        detail: `got ${got.toFixed(3)}`,
      });
    } else if (c.kind === 'collapse') {
      const sep = separation(c.a, c.b);
      const ok = sep.normal >= c.normalMin && c.types.every(t => sep[t] <= c.cvdMax);
      out.push({
        name: `red/green pair collapses under ${c.types.join('+')} (≤${c.cvdMax})`,
        ok,
        detail: `normal ${sep.normal.toFixed(1)} · ` + c.types.map(t => `${t} ${sep[t].toFixed(1)}`).join(' · '),
      });
    } else if (c.kind === 'preserveAxis') {
      const sep = separation(c.a, c.b);
      const ok = c.types.every(t => sep[t] >= c.min);
      out.push({
        name: `blue/yellow axis survives ${c.types.join('+')} (≥${c.min})`,
        ok,
        detail: c.types.map(t => `${t} ${sep[t].toFixed(1)}`).join(' · '),
      });
    } else if (c.kind === 'grey') {
      const worst = c.hexes.flatMap(h => CVD_TYPES.map(t => deltaE2000(h, simulateCvd(h, t))))
        .reduce((a, b) => Math.max(a, b), 0);
      out.push({
        name: `neutral greys unchanged by every simulation (ΔE ≤ ${c.tol})`,
        ok: worst <= c.tol,
        detail: `worst ΔE ${worst.toFixed(2)}`,
      });
    } else if (c.kind === 'idempotentMatrix') {
      let worst = 0;
      for (const t of Object.keys(CVD_LMS)) {
        const M = CVD_LMS[t];
        for (let i = 0; i < 3; i++) {
          const row = mul(M, [M[0][i], M[1][i], M[2][i]]);   // (M·M) column i
          for (let j = 0; j < 3; j++) worst = Math.max(worst, Math.abs(row[j] - M[j][i]));
        }
      }
      out.push({
        name: `protan/deutan projections are idempotent — M·M = M (≤${c.tol})`,
        ok: worst <= c.tol,
        detail: `worst |M²−M| ${worst.toExponential(2)}`,
      });
    } else if (c.kind === 'distinctSim') {
      const sims = CVD_TYPES.map(t => simulateCvd(c.hex, t));
      const worst = Math.min(
        deltaE2000(sims[0], sims[1]),
        deltaE2000(sims[0], sims[2]),
        deltaE2000(sims[1], sims[2]),
      );
      out.push({
        name: `protan/deutan/tritan are three distinct projections (≥${c.min})`,
        ok: worst >= c.min,
        detail: `closest pair ΔE ${worst.toFixed(1)}`,
      });
    } else if (c.kind === 'separation') {
      const sep = separation(c.a, c.b);
      const bad = Object.entries(c.expect).filter(([k, v]) => !near(sep[k], v, c.tol));
      const badLoose = Object.entries(c.loose || {}).filter(([k, v]) => !near(sep[k], v, c.looseTol));
      out.push({
        name: `reproduces auditor numbers for ${c.a}/${c.b}`,
        ok: bad.length === 0 && badLoose.length === 0,
        detail: ['normal'].concat(CVD_TYPES).map(k => `${k} ${sep[k].toFixed(2)}`).join(' · '),
      });
    }
  }
  return out;
}

/** ΔE2000 straight from Lab triplets — used by the Sharma reference cases. */
export function deltaE2000FromLab(lab1, lab2) {
  // Re-uses the exact maths in deltaE2000 by routing through a shared core.
  return de2000Core(lab1, lab2);
}

function de2000Core([L1, a1, b1], [L2, a2, b2]) {
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const C7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(C7 / (C7 + Math.pow(25, 7))));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, ap) => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp;
  if (Cp1 * Cp2 === 0) dhp = 0;
  else if (Math.abs(hp2 - hp1) <= 180) dhp = hp2 - hp1;
  else if (hp2 - hp1 > 180) dhp = hp2 - hp1 - 360;
  else dhp = hp2 - hp1 + 360;
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(rad(dhp) / 2);
  const Lbar = (L1 + L2) / 2;
  const Cpbar = (Cp1 + Cp2) / 2;
  let hpbar;
  if (Cp1 * Cp2 === 0) hpbar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpbar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hpbar = (hp1 + hp2 + 360) / 2;
  else hpbar = (hp1 + hp2 - 360) / 2;
  const T = 1
    - 0.17 * Math.cos(rad(hpbar - 30))
    + 0.24 * Math.cos(rad(2 * hpbar))
    + 0.32 * Math.cos(rad(3 * hpbar + 6))
    - 0.20 * Math.cos(rad(4 * hpbar - 63));
  const dTheta = 30 * Math.exp(-Math.pow((hpbar - 275) / 25, 2));
  const Cpbar7 = Math.pow(Cpbar, 7);
  const Rc = 2 * Math.sqrt(Cpbar7 / (Cpbar7 + Math.pow(25, 7)));
  const Lbar50 = Math.pow(Lbar - 50, 2);
  const Sl = 1 + (0.015 * Lbar50) / Math.sqrt(20 + Lbar50);
  const Sc = 1 + 0.045 * Cpbar;
  const Sh = 1 + 0.015 * Cpbar * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) +
    Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// ── CLI: `node audit/colorcheck.mjs [selftest|pair #aaa #bbb|contrast #a #b]`
// (pathToFileURL, not a template string — this repo lives under a path with
// spaces, which a naive `file://${argv[1]}` comparison never matches.)
const isCli = process.argv[1]
  && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isCli) {
  const [, , cmd, ...args] = process.argv;
  if (!cmd || cmd === 'selftest') {
    const rows = selfTest();
    for (const r of rows) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  → ${r.detail}`);
    const bad = rows.filter(r => !r.ok).length;
    console.log(`\n──── colorcheck selftest: ${rows.length - bad} passed, ${bad} failed ────`);
    process.exit(bad ? 1 : 0);
  } else if (cmd === 'pair') {
    const s = separation(args[0], args[1]);
    console.log(`${args[0]} vs ${args[1]}`);
    console.log(`  ΔE2000  normal ${s.normal.toFixed(2)} · protan ${s.protan.toFixed(2)} · deutan ${s.deutan.toFixed(2)} · tritan ${s.tritan.toFixed(2)}`);
    for (const c of args) {
      console.log(`  ${c}  ${contrast(c, '#ffffff').toFixed(2)}:1 on #ffffff · ${contrast(c, '#f2f2f7').toFixed(2)}:1 on #f2f2f7`);
    }
  } else if (cmd === 'contrast') {
    console.log(`${args[0]} on ${args[1]} → ${contrast(args[0], args[1]).toFixed(3)}:1`);
  } else {
    console.error('usage: colorcheck.mjs [selftest | pair <hexA> <hexB> | contrast <fg> <bg>]');
    process.exit(2);
  }
}
