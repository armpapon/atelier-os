/**
 * บัตรเครดิต — pure rules. No React, no Supabase, no `new Date()` shortcuts.
 *
 * Same contract as src/lib/taxTH.js: every number the card grid shows is
 * computed HERE, so it can be pinned in audit/cases.mjs without mounting a
 * page. If a component is doing arithmetic, it is in the wrong file.
 *
 * Two things this module is opinionated about:
 *
 *   1. A card's balance has ONE source. If the card is linked to a debt row,
 *      the Debt Tracker's `remaining_balance` wins — a card and its own debt
 *      must never show two different numbers on the same screen. Only an
 *      unlinked card falls back to the manually typed `manual_balance`.
 *
 *   2. A credit LINE, not a card, is what has a limit. Two KTC cards can be
 *      one 150,000฿ line ("mastercard คือบัตรหลัก Visa คือบัตรคล้ายบัตรเสริม
 *      แต่ใช้วงเงินร่วมกับบัตรเเรก สองบัตรรวมกันคือ 150000"), so utilisation is
 *      resolved through `lineOf()` and the header counts each line's limit
 *      exactly once. Summing card limits would report a 150,000฿ line as
 *      300,000฿ — flattering, and wrong in the direction that costs money.
 *
 *   3. Cycle dates are Bangkok calendar arithmetic on `YYYY-MM-DD` strings
 *      (via src/lib/dates.js), never on Date getters. A statement day of 31
 *      is CLAMPED to the last day of a short month — the bank bills on the
 *      30th in April, it does not skip April.
 */
import { todayStr, ymdParts } from './dates.js';

/** ธปท. ceiling for credit-card interest — the app's default estimate rate. */
export const DEFAULT_INTEREST_RATE = 0.16;

/** Credit-bureau health line: keep utilisation under 30% at statement time. */
export const HEALTHY_UTILIZATION = 30;

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Days in a Gregorian month, computed in UTC so no device TZ can shift it. */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Utilisation as a PERCENT (0–…), or `null` when there is no limit to divide
 * by. Null is the honest answer: a card with no limit typed in is not "0%
 * used", and the bar must not draw a reassuring empty track for it.
 */
export function utilizationPct(balance, limit) {
  const lim = Number(limit);
  if (!Number.isFinite(lim) || lim <= 0) return null;
  const bal = Math.max(0, num(balance));
  return (bal / lim) * 100;
}

/**
 * The balance the card grid should display for one card.
 * Linked card → the debt's remaining balance. Unlinked → manual_balance.
 */
export function cardBalance(card, debts = []) {
  if (!card) return 0;
  if (card.debt_id) {
    const debt = (debts || []).find(d => d && d.id === card.debt_id);
    if (debt) return Math.max(0, num(debt.remaining_balance));
  }
  return Math.max(0, num(card.manual_balance));
}

// ── วงเงินร่วม · one credit line, several pieces of plastic ──────────────────
//
// `shared_limit_card_id` points at the card that OWNS the line. NULL means the
// card owns its own. Every figure below is computed for the LINE, so the two
// KTC cards show one identical "111,491 / 150,000฿" instead of two half-truths.

/** One hop: the card this card points at, or the card itself. Never null. */
function hopTarget(card, cards) {
  const id = card?.shared_limit_card_id;
  if (!id || id === card.id) return card;               // owns its line / points at itself
  const owner = (cards || []).find(c => c && c.id === id);
  return owner || card;                                 // target deleted → owns its line
}

/**
 * The card that owns this card's credit line — the card itself when it does.
 *
 * At most ONE extra hop is followed, so a sharer pointing at another sharer
 * resolves to that card's own owner and nothing here can ever loop:
 *   A → B → C  ⇒  lineOf(A) = C
 *   A → A      ⇒  A          (self-reference is just "no share")
 *   A → ghost  ⇒  A          (the main card was deleted)
 *   A → B → A  ⇒  A          (a cycle: each card owns its own line again)
 */
export function lineOf(card, cards = []) {
  if (!card) return null;
  const first = hopTarget(card, cards);
  if (first.id === card.id) return card;
  const second = hopTarget(first, cards);
  if (second.id === first.id) return first;
  if (second.id === card.id) return card;               // A → B → A
  return second;
}

/** True when this card's line is spread over more than one card. */
export function isSharedLine(card, cards = []) {
  return lineFamily(card, cards).length > 1;
}

/** Every card on the same line — cancelled ones included (they still exist). */
export function lineFamily(card, cards = []) {
  const owner = lineOf(card, cards);
  if (!owner) return [];
  const pool = (cards || []).some(c => c && c.id === card.id)
    ? (cards || []) : [card, ...(cards || [])];
  return pool.filter(c => c && lineOf(c, cards)?.id === owner.id);
}

/** The line's limit — the OWNER's `credit_limit`, or null when there is none. */
export function lineLimit(card, cards = []) {
  const owner = lineOf(card, cards);
  const lim = Number(owner?.credit_limit);
  return Number.isFinite(lim) && lim > 0 ? lim : null;
}

/**
 * Everything drawn against the line: the owner's balance plus every sharer's.
 * Cancelled cards contribute nothing — they cannot be swiped.
 */
export function lineBalance(card, cards = [], debts = []) {
  return lineFamily(card, cards)
    .filter(isActive)
    .reduce((sum, c) => sum + cardBalance(c, debts), 0);
}

/** The line's utilisation as a PERCENT, or null when the line has no limit. */
export function lineUtilizationPct(card, cards = [], debts = []) {
  return utilizationPct(lineBalance(card, cards, debts), lineLimit(card, cards));
}

/**
 * Annual-fee waiver progress.
 *
 *   mode 'none'   → nothing to chase; `met` is true and the UI says
 *                   "ฟรี ไม่มีเงื่อนไข ✓".
 *   mode 'count'  → progress/target are SWIPES (KBank: 12 ครั้ง/ปีบัตร).
 *   mode 'amount' → progress/target are BAHT  (CardX: 100,000฿/ปีบัตร).
 *
 * A count/amount card with no target typed in yet is NOT met — the condition
 * exists, it just is not measurable, and quietly calling it "safe" is the one
 * failure mode that costs the owner real money.
 *
 * @returns {{mode: string, progress: number, target: number, remaining: number, met: boolean, pct: number|null}}
 */
export function waiverStatus(card) {
  const mode = card?.waiver_mode || 'none';
  if (mode !== 'count' && mode !== 'amount') {
    return { mode: 'none', progress: 0, target: 0, remaining: 0, met: true, pct: null };
  }
  const progress = Math.max(0, num(card?.waiver_progress));
  const target   = Math.max(0, num(card?.waiver_target));
  if (target <= 0) {
    return { mode, progress, target: 0, remaining: 0, met: false, pct: null };
  }
  return {
    mode, progress, target,
    remaining: Math.max(0, target - progress),
    met: progress >= target,
    pct: Math.min(100, (progress / target) * 100),
  };
}

/**
 * The next occurrence of a day-of-month, on or after `today`, clamped to the
 * length of whichever month it lands in.
 *   day 31, today 2026-04-10 → 2026-04-30 (clamped, not skipped)
 *   day 5,  today 2026-08-16 → 2026-09-05 (already passed this month)
 * Returns `YYYY-MM-DD`, or null when the day is not a usable 1–31.
 */
export function nextDayOfMonth(day, today) {
  const d = Number(day);
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  const [y, m, todayDay] = ymdParts(today || todayStr());
  if (!y || !m || !todayDay) return null;

  const at = (yy, mm) => {
    const dd = Math.min(d, daysInMonth(yy, mm));
    return { dd, ymd: `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
  };

  const thisMonth = at(y, m);
  if (thisMonth.dd >= todayDay) return thisMonth.ymd;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return at(ny, nm).ymd;
}

/**
 * The card's next two dates. Statement and due are resolved INDEPENDENTLY —
 * each is simply its own next occurrence — because that is what the owner
 * needs to see: on 16 Aug a card that bills on the 20th and is due on the 5th
 * shows "สรุป 20 ส.ค. · ครบกำหนด 5 ก.ย.", and on 3 Aug the same card shows
 * the 5 Aug due date belonging to July's statement, which is the one that can
 * still be missed.
 *
 * @returns {{statement: string|null, due: string|null}} Bangkok `YYYY-MM-DD`.
 */
export function nextCycleDates(statementDay, dueDay, today) {
  const base = today || todayStr();
  return {
    statement: nextDayOfMonth(statementDay, base),
    due:       nextDayOfMonth(dueDay, base),
  };
}

/**
 * What one month of revolving costs, at the ธปท. ceiling unless told otherwise.
 * Deliberately the simple `balance × rate ÷ 12` — it is an ESTIMATE shown as
 * "~฿676", and pretending to do average-daily-balance with data the app does
 * not have would be false precision.
 */
export function monthlyInterestEstimate(balance, rate = DEFAULT_INTEREST_RATE) {
  const bal = num(balance);
  const r   = Number(rate);
  if (bal <= 0 || !Number.isFinite(r) || r <= 0) return 0;
  return (bal * r) / 12;
}

/** `'2026-08-25'` → `'25 ส.ค. 69'`. Already a Bangkok date string. */
export function cycleDateLabel(ymd) {
  const [y, m, d] = ymdParts(ymd);
  if (!y || !m || !d) return '—';
  return `${d} ${THAI_MONTHS_SHORT[m - 1] || ''} ${String(y + 543).slice(-2)}`;
}

/** `'25 ส.ค.'` — the short form used inside the fact boxes. */
export function cycleDayLabel(ymd) {
  const [y, m, d] = ymdParts(ymd);
  if (!y || !m || !d) return '—';
  return `${d} ${THAI_MONTHS_SHORT[m - 1] || ''}`;
}

/**
 * A ธปท. link is only usable as an `href` when it really is a web address.
 *
 * `fee_profile.bot_url` is free text the owner types, and the card grid used to
 * hand it straight to `<a href>`. A stored `javascript:` / `data:` value would
 * then execute (or render markup) on click instead of opening ธปท.
 * (audited: DLG-FIN-001 · A2). Anything that does not PARSE as an http/https
 * URL is not a link — the caller renders no anchor and stores nothing.
 *
 * @param {*} value raw text
 * @returns {string|null} the trimmed URL, or null when it is not http(s)
 */
export function safeHttpUrl(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  let parsed;
  try { parsed = new URL(s); } catch { return null; }
  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? s : null;
}

/**
 * The card-face image address, or null when it is not one.
 *
 * `face_url` holds one of exactly two shapes:
 *   · a file the app itself ships — `/cards/kbank-plustinum.png`, same origin
 *   · a real http(s) address, judged by `safeHttpUrl` above
 *
 * A leading-slash path is accepted ONLY as a plain path. `//evil.com/x` is
 * protocol-relative — the browser reads it as a foreign HOST, not a folder —
 * so it is refused even though it starts with a slash. Backslashes are
 * refused for the same reason (`/\evil.com` normalises to `//evil.com`), and
 * so is any whitespace, which is how a `java\nscript:` payload gets smuggled
 * past a naive prefix check. Anything else renders no <img> at all: the card
 * falls back to its monogram, which is never wrong, only plainer.
 *
 * @param {*} value raw text
 * @returns {string|null} the trimmed address, or null when it is not usable
 */
export function safeFaceUrl(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return null;
  if (s.startsWith('/')) {
    if (s.startsWith('//')) return null;          // protocol-relative = another host
    if (/[\\\s]/.test(s)) return null;            // backslash normalises to '/', space hides tricks
    return s;
  }
  return safeHttpUrl(s);
}

/** ฿12,345 — whole baht, always with separators. */
export function baht(n) {
  const v = Math.round(num(n));
  return (v < 0 ? '-฿' : '฿') + Math.abs(v).toLocaleString('en-US');
}

export const isActive    = (card) => (card?.status || 'active') !== 'cancelled';
export const isCancelled = (card) => (card?.status || 'active') === 'cancelled';

/**
 * Cards in display order: active first (by sort_order, then name), cancelled
 * last — the grid renders the tail muted rather than hiding it, because a
 * cancelled card is still part of the credit history the owner reasons about.
 */
export function sortCards(cards = []) {
  return (cards || []).slice().sort((a, b) =>
    (isCancelled(a) ? 1 : 0) - (isCancelled(b) ? 1 : 0)
    || num(a.sort_order) - num(b.sort_order)
    || String(a.name || '').localeCompare(String(b.name || ''), 'th')
  );
}

/**
 * Everything the four stat cards at the top of the tab need, in one pass.
 * Cancelled cards are excluded from every figure — they have no limit left to
 * use, no fee to dodge and no statement to miss.
 *
 * `balance` is the plain sum of what every active card owes; `limit` is the
 * sum of each LINE's limit, counted once (see `lineOf`). So the owner's real
 * shape — KBank 300,000฿ + one shared KTC line of 150,000฿ — reports 450,000฿
 * of credit, not 600,000฿.
 *
 * @returns {{
 *   limit: number, balance: number, utilization: number|null,
 *   revolvingBalance: number, revolvingCount: number, monthlyInterest: number,
 *   watchCards: object[], annualFeeAtRisk: number,
 *   nextStatement: {card: object, date: string}|null,
 *   nextDue: {card: object, date: string}|null,
 *   activeCount: number,
 * }}
 */
export function summarizeCards({ cards = [], debts = [], today, rate = DEFAULT_INTEREST_RATE } = {}) {
  const base   = today || todayStr();
  const active = (cards || []).filter(isActive);

  let limit = 0, balance = 0, revolvingBalance = 0, revolvingCount = 0;
  const watchCards = [];
  let nextStatement = null, nextDue = null;
  // Each credit LINE is counted once, keyed by the card that owns it. Two
  // cards sharing 150,000฿ are 150,000฿ of exposure, not 300,000฿.
  const linesCounted = new Set();

  for (const card of active) {
    const bal = cardBalance(card, debts);
    balance += bal;

    // The limit belongs to the line, so the second card on a line adds only
    // its balance. A card with no limit anywhere on its line adds nothing to
    // the denominator — an unmeasured limit is not a phantom limit.
    const owner = lineOf(card, cards) || card;
    const lineKey = owner.id ?? owner;                  // ids in prod, identity in tests
    if (!linesCounted.has(lineKey)) {
      linesCounted.add(lineKey);
      const lim = Number(owner.credit_limit);
      if (Number.isFinite(lim) && lim > 0) limit += lim;
    }

    if (card.pays_full === false) { revolvingBalance += bal; revolvingCount += 1; }

    const waiver = waiverStatus(card);
    if (waiver.mode !== 'none' && !waiver.met) watchCards.push(card);

    const { statement, due } = nextCycleDates(card.statement_day, card.due_day, base);
    if (statement && (!nextStatement || statement < nextStatement.date)) nextStatement = { card, date: statement };
    if (due && (!nextDue || due < nextDue.date)) nextDue = { card, date: due };
  }

  const annualFeeAtRisk = watchCards.reduce((s, c) => s + num(c.annual_fee), 0);

  return {
    limit, balance,
    utilization: utilizationPct(balance, limit),
    revolvingBalance, revolvingCount,
    monthlyInterest: monthlyInterestEstimate(revolvingBalance, rate),
    watchCards, annualFeeAtRisk,
    nextStatement, nextDue,
    activeCount: active.length,
  };
}

/** The fee-profile accordion, in a fixed order, skipping keys left blank. */
export const FEE_PROFILE_FIELDS = [
  { key: 'annual_fee_display', label: 'ค่าธรรมเนียมรายปี' },
  { key: 'interest',           label: 'ดอกเบี้ย (เพดาน ธปท.)' },
  { key: 'cash_advance',       label: 'กดเงินสด' },
  { key: 'fx',                 label: 'ความเสี่ยงอัตราแลกเปลี่ยน (FX)' },
  { key: 'benefits',           label: 'สิทธิประโยชน์' },
];

export function feeProfileRows(card) {
  const fp = card?.fee_profile || {};
  return FEE_PROFILE_FIELDS
    .map(f => ({ ...f, value: typeof fp[f.key] === 'string' ? fp[f.key].trim() : '' }))
    .filter(f => f.value);
}

/**
 * Curated point-maximizing tips for a card, plus when they were last updated.
 *
 * `fee_profile.tips` is typed by hand (via SQL, not a form — see the
 * comment on the accordion in CreditCards.jsx), so this is a filter, not a
 * parser: only a real array survives, and only its non-empty string entries.
 * Anything else — missing key, a string, an object — is quietly `[]` rather
 * than a crash, the same contract as `feeProfileRows` above.
 *
 * @returns {{tips: string[], updated: string|null}}
 */
export function cardTips(card) {
  const fp = card?.fee_profile || {};
  const raw = Array.isArray(fp.tips) ? fp.tips : [];
  const tips = raw.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
  const updatedRaw = typeof fp.tips_updated === 'string' ? fp.tips_updated.trim() : '';
  return { tips, updated: updatedRaw || null };
}

/** The instalment rows a card is carrying, normalised for display. */
export function installmentRows(card) {
  const list = Array.isArray(card?.installments) ? card.installments : [];
  return list.filter(Boolean).map((row, i) => ({
    key: row.id || `inst-${i}`,
    label: String(row.label || 'ผ่อน 0%'),
    principal: num(row.principal),
    perMonth: num(row.per_month),
    paid: Math.max(0, num(row.paid)),
    total: Math.max(0, num(row.total)),
  }));
}
