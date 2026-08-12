// ════════════════════════════════════════════════════════════════════════════
//  Thai personal income tax (ภ.ง.ด.90/91) — pure arithmetic, no dependencies.
//
//  WHY THIS FILE IS PURE
//  Everything here is a function of its arguments: no Date, no supabase, no
//  React, no locale. That is what makes the numbers testable — audit/cases.mjs
//  drives this module directly and pins every bracket boundary and every cap.
//
//  WHAT IS DELIBERATELY *NOT* HERE
//  Year-specific stimulus schemes (Easy E-Receipt, ช้อปดีมีคืน, เที่ยวเมืองรอง …)
//  are reissued with different caps — or not at all — every single year. Baking
//  one in would silently go wrong the year it lapses, and nobody would notice
//  until the filing was already wrong. Those go in the free-form `custom` rows
//  the UI offers instead. Only the permanent statutory structure lives here.
//
//  VERIFY BEFORE FILING
//  Rates and caps below are the long-standing permanent structure, but the
//  authority is กรมสรรพากร for the filing year in question. The UI says so
//  permanently, and so does this comment.
// ════════════════════════════════════════════════════════════════════════════

/** Progressive brackets. `upTo` is the TOP of the band (inclusive). */
export const TAX_BRACKETS = [
  { upTo: 150000,   rate: 0    },
  { upTo: 300000,   rate: 0.05 },
  { upTo: 500000,   rate: 0.10 },
  { upTo: 750000,   rate: 0.15 },
  { upTo: 1000000,  rate: 0.20 },
  { upTo: 2000000,  rate: 0.25 },
  { upTo: 5000000,  rate: 0.30 },
  { upTo: Infinity, rate: 0.35 },
];

/** First baht of taxable net income. Below this, tax is zero. */
export const EXEMPT_THRESHOLD = 150000;

/** ค่าใช้จ่ายเหมา for 40(1)/(2): 50% of income, hard-capped. */
export const EXPENSE_RATE = 0.5;
export const EXPENSE_CAP  = 100000;

/** Personal allowance — automatic, everyone gets it. */
export const PERSONAL_ALLOWANCE = 60000;

/**
 * The combined ceiling every retirement vehicle shares. PVD/กบข. + RMF + SSF +
 * ThaiESG + ประกันบำนาญ may not exceed this in total, whatever each one's own
 * cap allows. Getting this wrong is the single most common over-claim.
 */
export const RETIREMENT_COMBINED_CAP = 500000;

/** Donations are limited to this share of income after expenses + allowances. */
export const DONATION_RATE_CAP = 0.10;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ── Per-field period (เดือน / ปี) ────────────────────────────────────────────
// The owner reads his payslip, which is monthly, and the statute is annual.
// Rather than make him multiply, every money field remembers which unit he
// typed it in. The STORED figure never moves: `salaryMonthly` stays monthly
// (that is what the column has always meant) and everything else stays annual.
// The period only decides how the number is entered and shown.
//
// BACKWARD COMPATIBILITY — the one rule that matters here.
// Rows written by v4.28 have no `periods` key at all. A missing period must
// therefore mean "whatever the old UI's label said", which was ปี everywhere
// except the salary box, which was already labelled "เงินเดือน / เดือน".
// Getting this wrong would silently multiply or divide every saved figure.

export const MONTHS_PER_YEAR = 12;

/** Fields whose STORED value is monthly. Everything else is stored annually. */
export const MONTHLY_STORED_FIELDS = new Set(['salary']);

/** The unit a field is persisted in — not the unit it is displayed in. */
export function storedUnit(field) {
  return MONTHLY_STORED_FIELDS.has(field) ? 'month' : 'year';
}

/** What a v4.28 row meant when it had no `periods` key for this field. */
export function defaultPeriod(field) {
  return storedUnit(field);
}

/** Read one field's period out of a `periods` map, tolerating junk. */
export function periodFor(periods, field) {
  const p = periods && periods[field];
  return p === 'month' || p === 'year' ? p : defaultPeriod(field);
}

/** A number typed in `period` → the unit the field is stored in. */
export function toStored(field, typed, period) {
  const v = Number(typed) || 0;
  const unit = storedUnit(field);
  const p = period === 'month' || period === 'year' ? period : unit;
  if (p === unit) return round2(v);
  return round2(p === 'month' ? v * MONTHS_PER_YEAR : v / MONTHS_PER_YEAR);
}

/** A stored number → the figure to show in a field set to `period`. */
export function toDisplay(field, stored, period) {
  const v = Number(stored) || 0;
  const unit = storedUnit(field);
  const p = period === 'month' || period === 'year' ? period : unit;
  if (p === unit) return round2(v);
  return round2(p === 'month' ? v / MONTHS_PER_YEAR : v * MONTHS_PER_YEAR);
}

/** The annual figure a stored value represents, whatever unit it is kept in. */
export function annualOf(field, stored) {
  return toDisplay(field, stored, 'year');
}

/**
 * The small muted line under a toggled field: "875 × 12 = ฿10,500/ปี".
 * Returns null when the field is typed in the unit it is stored and read in —
 * there is no arithmetic to show, and a line saying "= itself" is noise.
 */
export function periodDerivation(field, stored, period) {
  const p = period === 'month' || period === 'year' ? period : defaultPeriod(field);
  const shown = toDisplay(field, stored, p);
  const annual = annualOf(field, stored);
  if (p === 'month') {
    return `${fmtNumber(shown)} × 12 = ${baht(annual)}/ปี`;
  }
  if (storedUnit(field) === 'month') {
    return `${fmtNumber(shown)} ÷ 12 = ${baht(toDisplay(field, stored, 'month'))}/เดือน`;
  }
  return null;
}

// ── ประกันสังคม — derived from the payslip, not typed ────────────────────────
// The employee side of มาตรา 33: a fixed percentage of the monthly wage, with
// the wage itself capped before the percentage is applied. Both the ceiling and
// the rate are government parameters that have moved before and are scheduled
// to move again, so neither is hardcoded into the maths — they are settings
// with defaults, and the UI says out loud that they need confirming each year.

export const SSO_WAGE_CEILING = 17500;   // ฐานค่าจ้างสูงสุดที่ใช้คำนวณ
export const SSO_RATE = 0.05;            // อัตราฝั่งลูกจ้าง
export const SSO_MONTHS = 12;

/** Fill in the defaults, clamp the junk. Pure — no profile, no UI. */
export function ssoSettings(s = {}) {
  const wageCeiling = Number.isFinite(Number(s?.wageCeiling)) && Number(s.wageCeiling) > 0
    ? round2(Number(s.wageCeiling)) : SSO_WAGE_CEILING;
  const rawRate = Number(s?.rate);
  const rate = Number.isFinite(rawRate) && rawRate > 0 && rawRate <= 1 ? rawRate : SSO_RATE;
  const rawMonths = Number(s?.monthsWorked);
  const monthsWorked = Number.isFinite(rawMonths) && rawMonths >= 0
    ? Math.min(12, round2(rawMonths)) : SSO_MONTHS;
  return { wageCeiling, rate, monthsWorked };
}

/**
 * min(เงินเดือน, เพดาน) × อัตรา × จำนวนเดือนที่ทำงาน.
 * @returns {{ monthly, annual, wageCeiling, rate, monthsWorked, base, formula }}
 */
export function deriveSSO(monthlySalary, settings = {}) {
  const { wageCeiling, rate, monthsWorked } = ssoSettings(settings);
  const base = Math.min(num(monthlySalary), wageCeiling);
  const monthly = round2(base * rate);
  return {
    monthly,
    annual: round2(monthly * monthsWorked),
    wageCeiling, rate, monthsWorked, base,
    formula: `${pct(rate)} ของ ${baht(base)} × ${fmtNumber(monthsWorked)} เดือน`,
  };
}

/**
 * The most anyone on มาตรา 33 can legally contribute in a full year under the
 * SAME settings. Replaces the old hardcoded ฿9,000 deduction cap, which was
 * stale: at a ฿17,500 ceiling and 5% the real figure is ฿10,500.
 */
export function ssoLegalMax(settings = {}) {
  const { wageCeiling, rate } = ssoSettings(settings);
  return round2(wageCeiling * rate * MONTHS_PER_YEAR);
}

/**
 * What the ประกันสังคม row is actually claiming, and why.
 *
 * `ssoMode` is the switch:
 *   'auto'    — computed from the salary on every render
 *   'manual'  — the typed number wins (that is the whole point of an override)
 *   undefined — LEGACY. v4.28 had no auto mode, so a row without the key must
 *               behave exactly as it did: the typed number, or nothing.
 */
export function resolveSSO(profile = {}) {
  const income = profile.income || {};
  const ded = profile.deductions || {};
  const settings = ssoSettings(ded.ssoSettings);
  const derived = deriveSSO(income.salaryMonthly, settings);
  const legalMax = ssoLegalMax(settings);
  const typed = num(ded.socialSecurity);
  const auto = ded.ssoMode === 'auto';
  const amount = auto ? derived.annual : typed;
  return {
    mode: auto ? 'auto' : 'manual',
    amount,
    typed,
    derived,
    legalMax,
    settings,
    // "You typed something the calculator would not have produced" — the cue
    // for the คำนวณใหม่ link. Only meaningful once there is a salary to derive
    // from; with no salary every manual figure would look like an override.
    overridden: !auto && typed > 0 && num(income.salaryMonthly) > 0
      && Math.abs(typed - derived.annual) > 0.01,
    overMax: amount - legalMax > 0.01,
  };
}

// ── ค่าลดหย่อนที่กฎหมายกำหนดเป็นยอดตายตัว ────────────────────────────────────
// A statutory flat allowance has exactly ONE legal value. Asking the owner to
// type it is asking him to make a mistake — he ticked "คู่สมรสไม่มีเงินได้" and
// was left staring at an empty ฿ box. So the tick writes the number.
//
// It is still a text box, not a label: a part-year marriage or a
// จดทะเบียนกลางปี case is his call, and the app must never lock him out of the
// truth. When the typed figure differs from the statutory one, the row says so
// and offers one click back — the same กรอกเอง / คำนวณใหม่ pattern ประกันสังคม
// already uses.

export const SPOUSE_ALLOWANCE = 60000;

/** The statutory figure for a flat row, or null when the row is not one. */
export function statutoryAmount(key) {
  const spec = DEDUCTION_BY_KEY[key];
  const v = spec && spec.statutory;
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** The one-click-restore line: "ค่ามาตรฐาน ฿60,000". Pinned here, not in JSX. */
export function statutoryHint(key) {
  const v = statutoryAmount(key);
  return v == null ? null : `ค่ามาตรฐาน ${baht(v)}`;
}

/** The link that puts it back. Same word ประกันสังคม uses, on purpose. */
export const RESTORE_LABEL = 'คำนวณใหม่';

/**
 * What a flat row is claiming, and whether the owner has typed over the law.
 *
 * BACKWARD COMPATIBILITY — a v4.28/v4.29 row holds a plain baht number that was
 * typed by hand, with nothing recording whether it was meant to be the
 * statutory figure. It must therefore be read as a MANUAL value: never
 * recomputed, never rounded to ฿60,000 behind his back. If it happens to differ
 * from the statute the row simply offers to restore it.
 */
export function resolveStatutory(key, value) {
  const statutory = statutoryAmount(key);
  if (statutory == null) return null;
  const amount = num(value);
  return {
    key, statutory, amount,
    on: amount > 0,
    overridden: amount > 0 && Math.abs(amount - statutory) > 0.01,
    hint: statutoryHint(key),
    restore: RESTORE_LABEL,
  };
}

// ── แถวที่นับเป็น "คน" ไม่ใช่ "บาท" ──────────────────────────────────────────
// บุตร and บิดามารดา are headcounts. Making the owner hand over baht for them
// is making him do the multiplication — and the บุตร rule has a second rate
// hidden inside it, so the multiplication is not even one sum.
//
// The RULE, in full: every child is ฿30,000. A child who is the SECOND or later
// child AND was born from พ.ศ. 2561 onwards is ฿60,000 instead. So two counts
// describe it completely: how many children there are, and how many of them
// qualify for the higher rate. The qualifying count can never be the whole
// brood — the first child never qualifies, whenever he was born.

export const CHILD_ALLOWANCE = 30000;
export const CHILD_ALLOWANCE_SECOND = 60000;
export const CHILD_SECOND_BORN_FROM_BE = 2561;

export const PARENT_ALLOWANCE = 30000;
/** His two plus his spouse's two. Nobody may claim a fifth. */
export const PARENT_MAX_COUNT = 4;

/**
 * The conditions on บิดามารดา, said out loud next to the stepper rather than
 * left for him to remember. Every clause here is a reason a claim gets
 * disallowed, and the last one is the one families get wrong.
 */
export const PARENT_ELIGIBILITY = [
  'แต่ละคนต้องอายุ 60 ปีขึ้นไป',
  'และมีเงินได้ในปีภาษีนั้นไม่เกิน ฿30,000',
  'พ่อแม่คนหนึ่งมีลูกใช้สิทธิได้แค่คนเดียว — ตกลงกับพี่น้องก่อน',
];

/** Said under บุตรคนที่ 2 ขึ้นไป when there is not a second child to count. */
export const CHILD_SECOND_NEEDS_TWO = 'ต้องมีบุตรตั้งแต่ 2 คนขึ้นไปก่อน';

const countOf = (v) => Math.max(0, Math.floor(num(v)));

/** The most children that can possibly qualify for the ฿60,000 rate. */
export function maxQualifyingChildren(total) {
  return Math.max(0, countOf(total) - 1);
}

/**
 * ฿30,000 per child, ฿60,000 for each second-or-later child born from 2561.
 * `qualifying` is clamped to what is arithmetically possible, so an incoherent
 * saved pair (1 child, 1 qualifying) under-claims rather than over-claims.
 */
export function childrenAllowance(total, qualifying) {
  const count = countOf(total);
  const wanted = countOf(qualifying);
  const second = Math.min(wanted, maxQualifyingChildren(count));
  const plain = count - second;
  return {
    count, second, plain,
    qualifyingClamped: second < wanted,
    base: round2(count * CHILD_ALLOWANCE),
    extra: round2(second * CHILD_ALLOWANCE),
    amount: round2(plain * CHILD_ALLOWANCE + second * CHILD_ALLOWANCE_SECOND),
  };
}

/** "2 คน = 30,000 + 60,000 = ฿90,000" — one term per child, in rate order. */
export function childrenDerivation(total, qualifying) {
  const k = childrenAllowance(total, qualifying);
  if (k.count === 0) return null;
  const terms = [
    ...Array(k.plain).fill(CHILD_ALLOWANCE),
    ...Array(k.second).fill(CHILD_ALLOWANCE_SECOND),
  ];
  if (terms.length === 1) return `1 คน = ${baht(k.amount)}`;
  return `${k.count} คน = ${terms.map(fmtNumber).join(' + ')} = ${baht(k.amount)}`;
}

/** ฿30,000 each, four at the very most. */
export function parentsAllowance(count) {
  const wanted = countOf(count);
  const n = Math.min(wanted, PARENT_MAX_COUNT);
  return {
    count: n, wanted, capped: wanted > PARENT_MAX_COUNT,
    amount: round2(n * PARENT_ALLOWANCE),
    cap: PARENT_MAX_COUNT * PARENT_ALLOWANCE,
  };
}

/** "2 คน × 30,000 = ฿60,000". */
export function parentsDerivation(count) {
  const p = parentsAllowance(count);
  if (p.count === 0) return null;
  return `${p.count} คน × ${fmtNumber(PARENT_ALLOWANCE)} = ${baht(p.amount)}`;
}

/**
 * The ceiling on a count row's stepper, given everything else already entered.
 * บุตรคนที่ 2 ขึ้นไป depends on the บุตร count; บิดามารดา is a flat 4; บุตร
 * itself has no legal maximum.
 */
export function countCeiling(key, deductions = {}) {
  if (key === 'childrenExtra') return maxQualifyingChildren(deductions.children);
  const spec = DEDUCTION_BY_KEY[key];
  return spec && spec.maxCount != null ? spec.maxCount : Infinity;
}

/**
 * The muted line under any headcount stepper. Dispatches to the row's own
 * wording so the page never assembles Thai copy a test cannot reach.
 */
export function countDerivation(key, deductions = {}) {
  if (key === 'children') return childrenDerivation(deductions.children, deductions.childrenExtra);
  if (key === 'parents') return parentsDerivation(deductions.parents);
  const spec = DEDUCTION_BY_KEY[key];
  if (!spec || spec.kind !== 'count') return null;
  const n = Math.min(countOf(deductions[key]), countCeiling(key, deductions));
  if (n <= 0) return null;
  return `${n} คน × ${fmtNumber(spec.per)} = ${baht(round2(n * spec.per))}`;
}

/** Why a stepper is stuck at zero, when it is — or null when it is not. */
export function countBlockedNote(key, deductions = {}) {
  if (key !== 'childrenExtra') return null;
  return countCeiling(key, deductions) <= 0 ? CHILD_SECOND_NEEDS_TWO : null;
}

/**
 * The patch to write when one deduction field changes — normally just that
 * field, but lowering บุตร has to bring บุตรคนที่ 2 ขึ้นไป down with it, or a
 * stale count sits in the jsonb waiting to reappear the next time he adds a
 * child. Pure: it reads the current bag and returns the keys to merge.
 */
export function countPatch(key, value, deductions = {}) {
  const patch = { [key]: value };
  if (key === 'children') {
    const ceiling = maxQualifyingChildren(value);
    if (countOf(deductions.childrenExtra) > ceiling) patch.childrenExtra = ceiling;
  }
  return patch;
}

/** Both headcount rows resolved together, since one bounds the other. */
export function resolveCounts(deductions = {}) {
  return {
    children: childrenAllowance(deductions.children, deductions.childrenExtra),
    parents: parentsAllowance(deductions.parents),
  };
}

// ── Deduction catalogue ─────────────────────────────────────────────────────
// One entry per row the UI renders. Shapes:
//   kind 'auto'   — computed, never typed by the user
//   kind 'amount' — the user types baht; `cap` and/or `capRate` bound it
//     …with `statutory` when the law fixes the figure: ticking the row fills it
//   kind 'count'  — the user counts PEOPLE; value = count × per
// `group` ties rows into a shared ceiling. `plannable` marks the rows whose
// remaining headroom is something the owner can actually still act on this
// year (buying more SSF is an action; having another child is not).
// `monthlyable` marks the rows that are plausibly PAID monthly, and therefore
// get the เดือน/ปี switch. A lump-sum allowance like คู่สมรส never is.
// `dynamicCap` names a ceiling that is computed from settings rather than
// frozen in this file.

export const DEDUCTIONS = [
  {
    key: 'personal', kind: 'auto', label: 'ลดหย่อนส่วนตัว',
    fixed: PERSONAL_ALLOWANCE, note: 'ได้อัตโนมัติทุกคน',
  },
  {
    key: 'spouse', kind: 'amount', label: 'คู่สมรสไม่มีเงินได้',
    cap: SPOUSE_ALLOWANCE, statutory: SPOUSE_ALLOWANCE,
    note: 'คู่สมรสต้องไม่มีเงินได้ในปีภาษีนั้น · ติ๊กแล้วเติมยอดให้เอง',
  },
  {
    key: 'children', kind: 'count', label: 'บุตร', per: CHILD_ALLOWANCE,
    countLabel: 'คน', note: 'คนละ ฿30,000 — นับเป็นจำนวนคน ไม่ต้องคูณเอง',
  },
  {
    key: 'childrenExtra', kind: 'count',
    label: `บุตรคนที่ 2 ขึ้นไป ที่เกิดตั้งแต่ปี ${CHILD_SECOND_BORN_FROM_BE}`,
    per: CHILD_ALLOWANCE, countLabel: 'คน', dependsOn: 'children',
    note: 'เพิ่มอีกคนละ ฿30,000 (รวมเป็น ฿60,000) — นับเฉพาะคนที่เข้าเงื่อนไข',
  },
  {
    key: 'parents', kind: 'count', label: 'บิดามารดา', per: PARENT_ALLOWANCE,
    countLabel: 'คน', maxCount: PARENT_MAX_COUNT,
    note: `คนละ ฿30,000 · ไม่เกิน ${PARENT_MAX_COUNT} คน (ของเรา 2 + ของคู่สมรส 2)`,
    conditions: PARENT_ELIGIBILITY,
  },
  {
    key: 'socialSecurity', kind: 'amount', label: 'ประกันสังคม',
    dynamicCap: 'sso', plannable: false, monthlyable: true,
    note: 'ตามที่จ่ายจริง · ไม่เกินเพดานที่กฎหมายกำหนด',
  },
  {
    key: 'lifeInsurance', kind: 'amount', label: 'ประกันชีวิตตนเอง',
    cap: 100000, group: 'lifeHealth', plannable: true, monthlyable: true,
    note: 'รวมกับประกันสุขภาพตนเองไม่เกิน ฿100,000',
  },
  {
    key: 'healthInsurance', kind: 'amount', label: 'ประกันสุขภาพตนเอง',
    cap: 25000, group: 'lifeHealth', plannable: true, monthlyable: true,
    note: 'ไม่เกิน ฿25,000 และรวมกับประกันชีวิตไม่เกิน ฿100,000',
  },
  {
    key: 'parentsHealth', kind: 'amount', label: 'ประกันสุขภาพบิดามารดา',
    cap: 15000, plannable: true, monthlyable: true,
    note: 'รวมทั้งบิดาและมารดา ไม่เกิน ฿15,000',
  },
  {
    key: 'pvd', kind: 'amount', label: 'กองทุนสำรองเลี้ยงชีพ / กบข.',
    cap: 500000, capRate: 0.15, group: 'retirement', plannable: true, monthlyable: true,
    note: '15% ของเงินได้ · ไม่เกิน ฿500,000',
  },
  {
    key: 'rmf', kind: 'amount', label: 'RMF',
    cap: 500000, capRate: 0.30, group: 'retirement', plannable: true, monthlyable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿500,000',
  },
  {
    key: 'ssf', kind: 'amount', label: 'SSF',
    cap: 200000, capRate: 0.30, group: 'retirement', plannable: true, monthlyable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿200,000',
  },
  {
    key: 'thaiEsg', kind: 'amount', label: 'Thai ESG',
    cap: 300000, capRate: 0.30, group: 'retirement', plannable: true, monthlyable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿300,000',
  },
  {
    key: 'pensionInsurance', kind: 'amount', label: 'ประกันชีวิตแบบบำนาญ',
    cap: 200000, capRate: 0.15, group: 'retirement', plannable: true, monthlyable: true,
    note: '15% ของเงินได้ · ไม่เกิน ฿200,000',
  },
  {
    key: 'homeLoanInterest', kind: 'amount', label: 'ดอกเบี้ยกู้ยืมเพื่อที่อยู่อาศัย',
    cap: 100000, plannable: false, monthlyable: true,
    note: 'ตามที่จ่ายจริง ไม่เกิน ฿100,000',
  },
  {
    key: 'donationEdu', kind: 'donation', label: 'บริจาคการศึกษา / กีฬา / โรงพยาบาลรัฐ',
    weight: 2, plannable: true, monthlyable: true,
    note: 'หักได้ 2 เท่า · แต่ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน',
  },
  {
    key: 'donationGeneral', kind: 'donation', label: 'เงินบริจาคทั่วไป',
    weight: 1, plannable: true, monthlyable: true,
    note: 'ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย ลดหย่อน และบริจาค 2 เท่า',
  },
];

export const DEDUCTION_BY_KEY = Object.fromEntries(DEDUCTIONS.map(d => [d.key, d]));

/** Every row whose value the law fixes — the ones a tick can fill in. */
export const STATUTORY_KEYS = DEDUCTIONS.filter(d => d.statutory != null).map(d => d.key);

/** Every row counted in people rather than baht. */
export const COUNT_KEYS = DEDUCTIONS.filter(d => d.kind === 'count').map(d => d.key);

/** The rows that share the ฿500,000 retirement ceiling, in claim order. */
export const RETIREMENT_KEYS = DEDUCTIONS.filter(d => d.group === 'retirement').map(d => d.key);

// ── Brackets ────────────────────────────────────────────────────────────────

/**
 * Progressive tax on a net income, plus the per-band breakdown the UI shows
 * line by line. Bands that contribute nothing are still returned (with
 * `amount: 0`) — the caller decides whether to render them.
 */
export function taxFromNetIncome(netIncome) {
  const net = Math.max(0, num(netIncome));
  const bands = [];
  let lower = 0;
  let total = 0;
  for (const b of TAX_BRACKETS) {
    const amount = Math.max(0, Math.min(net, b.upTo) - lower);
    const tax = round2(amount * b.rate);
    bands.push({ from: lower, to: b.upTo, rate: b.rate, amount: round2(amount), tax });
    total += tax;
    lower = b.upTo;
    if (net <= b.upTo) break;
  }
  return { tax: round2(total), bands };
}

/**
 * The rate the LAST baht of net income is taxed at — i.e. what one more baht
 * of deduction saves. At exactly a boundary (net = 150,000) the answer is the
 * band that baht sat in (0%), NOT the band the next baht would enter.
 */
export function marginalRate(netIncome) {
  const net = Math.max(0, num(netIncome));
  if (net <= 0) return 0;
  let lower = 0;
  for (const b of TAX_BRACKETS) {
    if (net <= b.upTo) return b.rate;
    lower = b.upTo;
  }
  return TAX_BRACKETS[TAX_BRACKETS.length - 1].rate;
}

// ── The full computation ────────────────────────────────────────────────────

/**
 * Apply one deduction row's own limits (fixed / count / cap / % of income) and
 * report both what was claimed and what the statute allows.
 */
function applyRowCap(spec, raw, grossIncome, dynamicCaps = {}, deductions = {}) {
  if (spec.kind === 'auto') {
    return { key: spec.key, claimed: spec.fixed, cap: spec.fixed, allowed: spec.fixed, capped: false };
  }
  if (spec.kind === 'count') {
    // A headcount row's ceiling can come from the statute (บิดามารดา, 4) or
    // from another row (บุตรคนที่ 2 ขึ้นไป can never exceed บุตร − 1). Both
    // live in countCeiling so the stepper and the maths agree by construction.
    const wanted = Math.max(0, Math.floor(num(raw)));
    const ceiling = countCeiling(spec.key, deductions);
    const count = Math.min(wanted, ceiling);
    const cap = Number.isFinite(ceiling) ? round2(ceiling * spec.per) : Infinity;
    return {
      key: spec.key, count, wanted, ceiling,
      claimed: round2(wanted * spec.per), cap,
      allowed: round2(count * spec.per), capped: count < wanted,
    };
  }
  const claimed = num(raw);
  const caps = [];
  if (spec.cap != null) caps.push(spec.cap);
  // A ceiling that is a government parameter rather than a constant — today
  // only ประกันสังคม, whose maximum falls out of the same editable
  // wage-ceiling × rate the auto-calculation uses.
  if (spec.dynamicCap != null && dynamicCaps[spec.dynamicCap] != null) {
    caps.push(dynamicCaps[spec.dynamicCap]);
  }
  if (spec.capRate != null) caps.push(round2(grossIncome * spec.capRate));
  const cap = caps.length ? Math.min(...caps) : Infinity;
  const allowed = Math.min(claimed, cap);
  return { key: spec.key, claimed, cap, allowed: round2(allowed), capped: allowed < claimed };
}

/**
 * Trim a group of rows down to a shared ceiling, in catalogue order — the
 * earlier row keeps its money and the later one loses it. Mutates the entries.
 */
function applyGroupCeiling(rows, keys, ceiling) {
  let left = ceiling;
  let trimmed = 0;
  for (const key of keys) {
    const row = rows[key];
    if (!row) continue;
    const before = row.allowed;
    const after = Math.min(before, Math.max(0, left));
    if (after < before) {
      trimmed += before - after;
      row.allowed = round2(after);
      row.capped = true;
      row.groupCapped = true;
    }
    left = round2(left - row.allowed);
  }
  return { used: round2(ceiling - Math.max(0, left)), remaining: round2(Math.max(0, left)), trimmed: round2(trimmed) };
}

/**
 * The whole return, from salary to "ต้องจ่ายเพิ่ม / ขอคืนได้".
 *
 * @param {object} profile
 * @param {object} profile.income      { salaryMonthly, bonus, other:[{label,amount}], wht, periods }
 * @param {object} profile.deductions  { <key>: number, custom:[{label,amount}],
 *                                       periods, ssoMode, ssoSettings }
 */
export function computeTax(profile = {}) {
  const income = profile.income || {};
  const ded = profile.deductions || {};

  // ── 1 · เงินได้พึงประเมิน ───────────────────────────────────────────────
  const salaryMonthly = num(income.salaryMonthly);
  const salaryAnnual  = round2(salaryMonthly * 12);
  const bonus         = num(income.bonus);
  const otherRows     = Array.isArray(income.other) ? income.other : [];
  const otherTotal    = round2(otherRows.reduce((s, r) => s + num(r?.amount), 0));
  const gross         = round2(salaryAnnual + bonus + otherTotal);
  const wht           = num(income.wht);

  // ── 2 · หักค่าใช้จ่าย 50% สูงสุด 100,000 ────────────────────────────────
  const expense = round2(Math.min(gross * EXPENSE_RATE, EXPENSE_CAP));
  const expenseCapped = gross * EXPENSE_RATE > EXPENSE_CAP;

  // ── 3 · ลดหย่อน (ยังไม่รวมเงินบริจาค) ───────────────────────────────────
  // ประกันสังคม is resolved first: in 'auto' mode the row claims a figure the
  // owner never typed, and its ceiling is derived from the same settings.
  const sso = resolveSSO(profile);
  const claimedOf = (key) => (key === 'socialSecurity' ? sso.amount : ded[key]);

  const rows = {};
  for (const spec of DEDUCTIONS) {
    if (spec.kind === 'donation') continue;
    rows[spec.key] = applyRowCap(spec, claimedOf(spec.key), gross, { sso: sso.legalMax }, ded);
  }

  // The headcount rows, resolved together — the page reopens the steppers from
  // these, and the บุตร derivation needs both counts to say anything true.
  const counts = resolveCounts(ded);

  // Shared ceilings, applied after each row's own cap.
  const lifeHealthKeys = DEDUCTIONS.filter(d => d.group === 'lifeHealth').map(d => d.key);
  const lifeHealth = applyGroupCeiling(rows, lifeHealthKeys, 100000);
  const retirement = applyGroupCeiling(rows, RETIREMENT_KEYS, RETIREMENT_COMBINED_CAP);

  // Free rows — year-specific schemes the owner types in by hand. Uncapped by
  // definition: this module cannot know what this year's programme allows.
  const customRows = (Array.isArray(ded.custom) ? ded.custom : [])
    .map(r => ({ label: String(r?.label || '').trim(), amount: num(r?.amount) }))
    .filter(r => r.amount > 0 || r.label);
  const customTotal = round2(customRows.reduce((s, r) => s + r.amount, 0));

  const allowanceTotal = round2(
    Object.values(rows).reduce((s, r) => s + r.allowed, 0) + customTotal
  );

  // ── 4 · เงินบริจาค — 10% of what is left, education counts double ───────
  const afterAllowances = round2(Math.max(0, gross - expense - allowanceTotal));

  const eduPaid = num(ded.donationEdu);
  const eduCap  = round2(afterAllowances * DONATION_RATE_CAP);
  const eduAllowed = round2(Math.min(eduPaid * 2, eduCap));

  const afterEdu = round2(Math.max(0, afterAllowances - eduAllowed));
  const genPaid = num(ded.donationGeneral);
  const genCap  = round2(afterEdu * DONATION_RATE_CAP);
  const genAllowed = round2(Math.min(genPaid, genCap));

  rows.donationEdu = {
    key: 'donationEdu', claimed: eduPaid, weighted: round2(eduPaid * 2),
    cap: eduCap, allowed: eduAllowed, capped: eduPaid * 2 > eduCap,
  };
  rows.donationGeneral = {
    key: 'donationGeneral', claimed: genPaid, weighted: genPaid,
    cap: genCap, allowed: genAllowed, capped: genPaid > genCap,
  };

  const donationTotal = round2(eduAllowed + genAllowed);
  const deductionTotal = round2(allowanceTotal + donationTotal);

  // ── 5 · เงินได้สุทธิ → ภาษี → เทียบกับหัก ณ ที่จ่าย ─────────────────────
  const netIncome = round2(Math.max(0, gross - expense - deductionTotal));
  const { tax, bands } = taxFromNetIncome(netIncome);
  const balance = round2(tax - wht);   // > 0 ต้องจ่ายเพิ่ม · < 0 ขอคืนได้

  return {
    income: { salaryMonthly, salaryAnnual, bonus, other: otherRows, otherTotal, gross, wht },
    expense, expenseCapped,
    sso, counts,
    rows, customRows, customTotal,
    allowanceTotal, donationTotal, deductionTotal,
    lifeHealth, retirement,
    afterAllowances,
    netIncome, tax, bands,
    marginalRate: marginalRate(netIncome),
    balance,
    payable: balance > 0 ? balance : 0,
    refund:  balance < 0 ? round2(-balance) : 0,
    exempt: netIncome <= EXEMPT_THRESHOLD,
  };
}

// ── "ควรทำยังไงต่อ" ─────────────────────────────────────────────────────────

/**
 * Remaining room in each plannable category, and the tax that filling it would
 * actually save.
 *
 * `taxSaved` is EXACT — it re-runs the brackets on the reduced net income —
 * because a headroom big enough to cross a bracket boundary saves less than
 * `headroom × marginalRate` suggests. `taxSavedAtMarginal` is kept alongside it
 * so the two can be compared (and so a test can pin the difference).
 */
export function deductionHeadroom(result) {
  if (!result) return [];
  const gross = result.income.gross;
  const out = [];

  const retirementLeft = result.retirement.remaining;

  for (const spec of DEDUCTIONS) {
    if (!spec.plannable) continue;
    const row = result.rows[spec.key];
    if (!row) continue;

    let room;
    if (spec.kind === 'donation') {
      // A donation's cap moves as other deductions move, so the honest room is
      // "what the 10% rule still allows", divided by the weight (2× rows only
      // need half the cash to fill the same room).
      room = Math.max(0, round2((row.cap - row.allowed) / (spec.weight || 1)));
    } else {
      const ownCap = Math.min(
        spec.cap != null ? spec.cap : Infinity,
        spec.capRate != null ? round2(gross * spec.capRate) : Infinity,
      );
      room = Math.max(0, round2(ownCap - row.allowed));
      if (spec.group === 'retirement') room = Math.min(room, retirementLeft);
      if (spec.group === 'lifeHealth') room = Math.min(room, result.lifeHealth.remaining);
    }

    // Room beyond what is left of the taxable net income buys nothing.
    const usable = Math.min(room, result.netIncome);
    const taxSaved = round2(result.tax - taxFromNetIncome(result.netIncome - usable).tax);

    // Every figure on one line must be in the SAME unit or the line lies.
    // A 2× donation row is quoted in CASH throughout — what he would hand
    // over — never a mix of cash room against a doubled "already used".
    const w = spec.weight || 1;
    const used = spec.kind === 'donation' ? row.claimed : row.allowed;
    const capOut = Number.isFinite(row.cap) ? round2(row.cap / w) : null;

    out.push({
      key: spec.key,
      label: spec.label,
      used: round2(used),
      cap: capOut,
      room: round2(room),
      usableRoom: round2(usable),
      taxSaved,
      taxSavedAtMarginal: round2(usable * result.marginalRate),
      weight: spec.weight || 1,
    });
  }

  // Biggest saving first — that is the order the owner reads it in.
  return out.sort((a, b) => b.taxSaved - a.taxSaved || b.room - a.room);
}

/**
 * The one-paragraph verdict above the headroom list. Deliberately refuses to
 * suggest buying anything when there is no tax to save — the point of the
 * panel is arithmetic, not a product pitch.
 */
export function planningSummary(result) {
  if (!result) return { state: 'empty', headline: 'ยังไม่ได้กรอกรายได้', detail: '' };
  if (result.income.gross <= 0) {
    return { state: 'empty', headline: 'ยังไม่ได้กรอกรายได้', detail: 'ใส่เงินเดือนต่อเดือนก่อน แล้วตัวเลขทุกช่องจะคำนวณให้เอง' };
  }
  if (result.netIncome <= EXEMPT_THRESHOLD) {
    return {
      state: 'exempt',
      headline: 'เงินได้สุทธิยังไม่ถึงเกณฑ์เสียภาษี',
      detail: `เงินได้สุทธิ ฿${Math.round(result.netIncome).toLocaleString('en-US')} ยังไม่เกิน ฿150,000 — ปีนี้ไม่ต้องเสียภาษี การซื้อลดหย่อนเพิ่มไม่ช่วยประหยัดอะไร${result.refund > 0 ? ' และขอคืนภาษีที่ถูกหักไปแล้วได้ทั้งก้อน' : ''}`,
    };
  }
  // No third state is possible: tax is zero exactly when net income is at or
  // below the exempt threshold, which the branch above already owns.
  return {
    state: 'taxable',
    headline: `ขั้นภาษีสูงสุดที่เสียอยู่คือ ${Math.round(result.marginalRate * 100)}%`,
    detail: `ทุก ฿100 ที่ลดหย่อนเพิ่มได้ จะประหยัดภาษีประมาณ ฿${Math.round(result.marginalRate * 100)} จนกว่าเงินได้สุทธิจะตกลงไปขั้นถัดไป`,
  };
}

// ── Where every computed number came from ───────────────────────────────────
// One short Thai line per figure the page prints but the owner never typed.
// Built here rather than in JSX so the wording is pinned by the same tests as
// the arithmetic, and so no number can appear on screen unexplained.

export function derivations(result) {
  if (!result) return {};
  const i = result.income;
  const parts = [];
  if (i.salaryMonthly > 0) parts.push(`เงินเดือน ${fmtNumber(i.salaryMonthly)} × 12`);
  else if (i.salaryAnnual > 0) parts.push(`เงินเดือนทั้งปี ${fmtNumber(i.salaryAnnual)}`);
  if (i.bonus > 0) parts.push(`โบนัส ${fmtNumber(i.bonus)}`);
  if (i.otherTotal > 0) parts.push(`รายได้อื่น ${fmtNumber(i.otherTotal)}`);

  return {
    gross: parts.length ? `${parts.join(' + ')} = ${baht(i.gross)}` : 'ยังไม่ได้กรอกรายได้',
    salaryAnnual: `${fmtNumber(i.salaryMonthly)} × 12 = ${baht(i.salaryAnnual)}`,
    expense: `${pct(EXPENSE_RATE)} ของ ${baht(i.gross)} สูงสุด ${baht(EXPENSE_CAP)}`,
    personal: `ได้อัตโนมัติทุกคน ${baht(PERSONAL_ALLOWANCE)}`,
    // The two headcount rows show their own sum, because "2 คน" and "฿90,000"
    // are two different facts and the arithmetic between them is the app's job.
    children: childrenDerivation(result.counts?.children.count, result.counts?.children.second),
    parents: parentsDerivation(result.counts?.parents.count),
    sso: result.sso.derived.formula,
    ssoMax: `เพดานทั้งปี = ${pct(result.sso.settings.rate)} ของ ${baht(result.sso.settings.wageCeiling)} × 12 = ${baht(result.sso.legalMax)}`,
    netIncome: `${baht(i.gross)} − ${baht(result.expense)} − ${baht(result.deductionTotal)}`,
    tax: 'รวมภาษีทุกขั้นบันไดข้างบน',
    balance: `${baht(result.tax)} − หัก ณ ที่จ่าย ${baht(i.wht)}`,
  };
}

// ── Sanity warnings ─────────────────────────────────────────────────────────
// Amber, never blocking. Every one of these is a case where the arithmetic is
// perfectly valid but the INPUT is probably a typo or a misread payslip — the
// calculator cannot know, so it says what it noticed and lets him decide.

/** How far หัก ณ ที่จ่าย may drift from the computed tax before we mention it. */
export const WHT_TOLERANCE = 0.25;

/**
 * @param {object} profile  the raw jsonb, as saved
 * @param {object} result   computeTax(profile)
 * @returns {{key,text,detail}[]}  empty when nothing looks wrong
 */
export function sanityWarnings(profile = {}, result = null) {
  const r = result || computeTax(profile);
  const out = [];

  // 1 · ประกันสังคม above what the law allows anyone to pay in a year.
  if (r.sso.overMax) {
    out.push({
      key: 'ssoOverMax',
      text: `ประกันสังคมที่กรอก ${baht(r.sso.amount)} สูงกว่าเพดานทั้งปี ${baht(r.sso.legalMax)}`,
      detail: `เพดานคือ ${pct(r.sso.settings.rate)} ของฐาน ${baht(r.sso.settings.wageCeiling)} × 12 เดือน — `
        + `ส่วนที่เกินหักลดหย่อนไม่ได้ (หน้านี้หักให้แค่ ${baht(r.rows.socialSecurity.allowed)})`,
    });
  }

  // 2 · หัก ณ ที่จ่าย a long way from the tax this page computes. Which
  // direction it is wrong in is the whole message — "จ่ายเพิ่ม" and "ได้คืน"
  // mean opposite things to plan for.
  const wht = r.income.wht;
  const tax = r.tax;
  if (wht > 0 || tax > 0) {
    const base = Math.max(tax, 0);
    const gap = Math.abs(wht - tax);
    const off = base > 0 ? gap / base : (wht > 0 ? Infinity : 0);
    if (off > WHT_TOLERANCE && gap > 1) {
      const share = base > 0 ? ` (ต่างกัน ${pct(gap / base)})` : '';
      out.push(wht < tax ? {
        key: 'whtLow',
        text: `หัก ณ ที่จ่ายทั้งปี ${baht(wht)} น้อยกว่าภาษีที่คำนวณได้ ${baht(tax)}${share}`,
        detail: `ถ้าตัวเลขถูกต้อง ตอนยื่นน่าจะต้องจ่ายเพิ่มอีก ${baht(tax - wht)} — เตรียมเงินก้อนนี้ไว้ `
          + 'หรือกลับไปเช็กว่ากรอกช่องหัก ณ ที่จ่ายครบทั้งปีแล้วหรือยัง',
      } : {
        key: 'whtHigh',
        text: `หัก ณ ที่จ่ายทั้งปี ${baht(wht)} มากกว่าภาษีที่คำนวณได้ ${baht(tax)}${share}`,
        detail: `ถ้าตัวเลขถูกต้อง น่าจะขอคืนได้ ${baht(wht - tax)} — อย่าลืมยื่นเพื่อขอคืน`,
      });
    }
  }

  // 3 · Deductions typed against no income at all — almost always a person
  // whose salary box was never filled in. Counted on what he TYPED, not on
  // what was allowed: with no income the percentage caps trim most rows to
  // zero, and "you deducted ฿0" is not the thing worth telling him.
  const typedDeductions = round2(
    Object.values(r.rows).reduce((s, row) => s + (row.key === 'personal' ? 0 : num(row.claimed)), 0)
    + r.customTotal,
  );
  if (r.income.gross <= 0 && typedDeductions > 0) {
    out.push({
      key: 'zeroIncome',
      text: `ยังไม่ได้กรอกรายได้ แต่กรอกลดหย่อนไว้แล้ว ${baht(typedDeductions)}`,
      detail: 'ลดหย่อนจะยังไม่ช่วยอะไรจนกว่าจะมีเงินได้ — ใส่เงินเดือนต่อเดือนก่อน',
    });
  }

  return out;
}

// ── Formatting + years (used by the page, kept here so tests can pin them) ───

/** ฿ with thousands separators, no decimals. Negative keeps its sign. */
export function baht(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-฿' : '฿') + Math.abs(v).toLocaleString('en-US');
}

/**
 * A plain number with separators, keeping up to 2 decimals — used inside the
 * derivation lines ("5,410.42 × 12 = …") where rounding to whole baht would
 * make the shown arithmetic not add up.
 */
export function fmtNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** A rate as a percentage, with a decimal only when it needs one. */
export function pct(rate) {
  const v = (Number(rate) || 0) * 100;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

/** Gregorian → พ.ศ. The DB stores the Gregorian year; the UI never shows it. */
export const toBE = (ce) => Number(ce) + 543;
export const toCE = (be) => Number(be) - 543;

/**
 * The tax year a given moment falls in. Thai PIT is filed on the calendar
 * year, so this is just the Bangkok calendar year — passed in explicitly so
 * the function stays pure and the page owns "what time is it".
 */
export function taxYearOf(bangkokYmd) {
  const m = /^(\d{4})-/.exec(String(bangkokYmd || ''));
  return m ? Number(m[1]) : null;
}
