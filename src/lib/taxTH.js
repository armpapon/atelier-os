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

// ── Deduction catalogue ─────────────────────────────────────────────────────
// One entry per row the UI renders. Shapes:
//   kind 'auto'   — computed, never typed by the user
//   kind 'amount' — the user types baht; `cap` and/or `capRate` bound it
//   kind 'count'  — the user types a headcount; value = count × per
// `group` ties rows into a shared ceiling. `plannable` marks the rows whose
// remaining headroom is something the owner can actually still act on this
// year (buying more SSF is an action; having another child is not).

export const DEDUCTIONS = [
  {
    key: 'personal', kind: 'auto', label: 'ลดหย่อนส่วนตัว',
    fixed: PERSONAL_ALLOWANCE, note: 'ได้อัตโนมัติทุกคน',
  },
  {
    key: 'spouse', kind: 'amount', label: 'คู่สมรสไม่มีเงินได้',
    cap: 60000, note: 'คู่สมรสต้องไม่มีเงินได้ในปีภาษีนั้น',
  },
  {
    key: 'children', kind: 'count', label: 'บุตร', per: 30000,
    countLabel: 'คน', note: 'คนละ ฿30,000',
  },
  {
    key: 'childrenExtra', kind: 'count', label: 'บุตรคนที่ 2 ขึ้นไป ที่เกิดตั้งแต่ปี 2561', per: 30000,
    countLabel: 'คน', note: 'เพิ่มอีกคนละ ฿30,000 (รวมเป็น ฿60,000)',
  },
  {
    key: 'parents', kind: 'count', label: 'บิดามารดา (อายุ 60+ รายได้ไม่เกิน ฿30,000)', per: 30000,
    countLabel: 'คน', maxCount: 4, note: 'คนละ ฿30,000 · ไม่เกิน 4 คน',
  },
  {
    key: 'socialSecurity', kind: 'amount', label: 'ประกันสังคม', cap: 9000,
    plannable: false, note: 'ตามที่จ่ายจริง',
  },
  {
    key: 'lifeInsurance', kind: 'amount', label: 'ประกันชีวิตตนเอง',
    cap: 100000, group: 'lifeHealth', plannable: true,
    note: 'รวมกับประกันสุขภาพตนเองไม่เกิน ฿100,000',
  },
  {
    key: 'healthInsurance', kind: 'amount', label: 'ประกันสุขภาพตนเอง',
    cap: 25000, group: 'lifeHealth', plannable: true,
    note: 'ไม่เกิน ฿25,000 และรวมกับประกันชีวิตไม่เกิน ฿100,000',
  },
  {
    key: 'parentsHealth', kind: 'amount', label: 'ประกันสุขภาพบิดามารดา',
    cap: 15000, plannable: true, note: 'รวมทั้งบิดาและมารดา ไม่เกิน ฿15,000',
  },
  {
    key: 'pvd', kind: 'amount', label: 'กองทุนสำรองเลี้ยงชีพ / กบข.',
    cap: 500000, capRate: 0.15, group: 'retirement', plannable: true,
    note: '15% ของเงินได้ · ไม่เกิน ฿500,000',
  },
  {
    key: 'rmf', kind: 'amount', label: 'RMF',
    cap: 500000, capRate: 0.30, group: 'retirement', plannable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿500,000',
  },
  {
    key: 'ssf', kind: 'amount', label: 'SSF',
    cap: 200000, capRate: 0.30, group: 'retirement', plannable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿200,000',
  },
  {
    key: 'thaiEsg', kind: 'amount', label: 'Thai ESG',
    cap: 300000, capRate: 0.30, group: 'retirement', plannable: true,
    note: '30% ของเงินได้ · ไม่เกิน ฿300,000',
  },
  {
    key: 'pensionInsurance', kind: 'amount', label: 'ประกันชีวิตแบบบำนาญ',
    cap: 200000, capRate: 0.15, group: 'retirement', plannable: true,
    note: '15% ของเงินได้ · ไม่เกิน ฿200,000',
  },
  {
    key: 'homeLoanInterest', kind: 'amount', label: 'ดอกเบี้ยกู้ยืมเพื่อที่อยู่อาศัย',
    cap: 100000, plannable: false, note: 'ตามที่จ่ายจริง ไม่เกิน ฿100,000',
  },
  {
    key: 'donationEdu', kind: 'donation', label: 'บริจาคการศึกษา / กีฬา / โรงพยาบาลรัฐ',
    weight: 2, plannable: true,
    note: 'หักได้ 2 เท่า · แต่ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน',
  },
  {
    key: 'donationGeneral', kind: 'donation', label: 'เงินบริจาคทั่วไป',
    weight: 1, plannable: true,
    note: 'ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย ลดหย่อน และบริจาค 2 เท่า',
  },
];

export const DEDUCTION_BY_KEY = Object.fromEntries(DEDUCTIONS.map(d => [d.key, d]));

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
function applyRowCap(spec, raw, grossIncome) {
  if (spec.kind === 'auto') {
    return { key: spec.key, claimed: spec.fixed, cap: spec.fixed, allowed: spec.fixed, capped: false };
  }
  if (spec.kind === 'count') {
    const wanted = Math.max(0, Math.floor(num(raw)));
    const count = spec.maxCount != null ? Math.min(wanted, spec.maxCount) : wanted;
    const cap = spec.maxCount != null ? spec.maxCount * spec.per : Infinity;
    return {
      key: spec.key, count, claimed: wanted * spec.per, cap,
      allowed: count * spec.per, capped: count < wanted,
    };
  }
  const claimed = num(raw);
  const caps = [];
  if (spec.cap != null) caps.push(spec.cap);
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
 * @param {object} profile.income      { salaryMonthly, bonus, other:[{label,amount}], wht }
 * @param {object} profile.deductions  { <key>: number, custom:[{label,amount}] }
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
  const rows = {};
  for (const spec of DEDUCTIONS) {
    if (spec.kind === 'donation') continue;
    rows[spec.key] = applyRowCap(spec, ded[spec.key], gross);
  }

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

// ── Formatting + years (used by the page, kept here so tests can pin them) ───

/** ฿ with thousands separators, no decimals. Negative keeps its sign. */
export function baht(n) {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-฿' : '฿') + Math.abs(v).toLocaleString('en-US');
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
