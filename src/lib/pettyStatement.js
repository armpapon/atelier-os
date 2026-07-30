// ── Statement reconcile — prove the money moved the way the sheet says ───────
// Input: text of a KBank/Make statement (extractPdfText in kbankPdfParser.js)
// + the tab's claim rows (parsePettyCash). Free-tier Make can't export a Cloud
// Pocket by itself, so the statement mixes the keeper's personal traffic with
// the float's. The float's own transactions are isolated by THREE keys per
// transaction — amount === the claim's เงินออก, payee account last-4 === the
// row's BANK column, payee name tokens === the BANK column's name — needing
// amount + at least one identity key (QR merchant payments carry no payee
// account, so their amount must be unique instead). Loop only reads: nothing
// here mutates money.

// One transaction line. The English Make export writes
//   DD-MM-YY  HH:MM  <type>  <amount>  <balance>  <channel>  <detail>
// and the Thai personal export uses Thai type words — accept both.
const TYPE_IN = /^(?:Transfer Deposit|รับโอนเงิน(?: ?ผ่าน ?QR)?|ฝากเงิน|รับเงิน)$/i;
const TX_RE = new RegExp(
  '^(\\d{2}-\\d{2}-\\d{2}) (\\d{2}:\\d{2}) '
  + '(Transfer Withdrawal|Transfer Deposit|Payment|โอนเงิน|รับโอนเงิน(?: ?ผ่าน ?QR)?|ชำระเงิน|ถอนเงิน|ฝากเงิน|รับเงิน) '
  + '([\\d,]+\\.\\d{2}) ([\\d,]+\\.\\d{2}) '
  + '(MAKE by KBank|K PLUS|K-Mobile Banking|Internet/Mobile \\w+) (.*)$',
);
const num = s => Number(String(s).replace(/,/g, ''));

export function parseStatementText(raw = '') {
  const txns = [];
  let meta = {};
  for (const line0 of String(raw).split('\n')) {
    // pdf.js joins text items with wide gaps — collapse to single spaces first.
    const line = line0.replace(/\s+/g, ' ').trim();
    let m = line.match(/Period (\d{2}\/\d{2}\/\d{4}) ?- ?(\d{2}\/\d{2}\/\d{4})/);
    if (m) meta = { ...meta, from: m[1], to: m[2] };
    m = line.match(/Ending Balance ([\d,]+\.\d{2})/);
    if (m) meta = { ...meta, ending: num(m[1]) };
    m = line.match(TX_RE);
    if (!m) continue;
    const [, d, time, typeRaw, amt, bal, channel, detail] = m;
    const [dd, mm, yy] = d.split('-');
    txns.push({
      id: `${d} ${time} ${amt} ${(detail || '').slice(0, 24)}`,
      date: `20${yy}-${mm}-${dd}`, time,
      kind: typeRaw.trim(),
      dir: TYPE_IN.test(typeRaw.trim()) ? 'in' : 'out',
      amount: num(amt), balance: num(bal),
      channel: channel.trim(), detail: (detail || '').trim(),
    });
  }
  return { txns, meta };
}

// "KBANK 048-1-69004-8" → "0048"-style last-4 the statement masks with.
// KBank masks the last four DIGITS of the account, ignoring dashes.
const last4 = bankText => {
  const digits = String(bankText || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
};
// Uppercase A-Z name tokens from the BANK column ("JJ GUNWARA KBANK …") minus
// bank names — for matching "MS. Kunwara Boon++" style payee text.
const BANK_WORDS = new Set(['KBANK', 'KTB', 'SCB', 'BBL', 'TTB', 'BAY', 'GSB', 'UOB', 'CIMB', 'KKP', 'PROMPTPAY']);
const nameTokens = bankText => String(bankText || '').toUpperCase()
  .split(/[^A-Z]+/).filter(w => w.length >= 3 && !BANK_WORDS.has(w));
const detailHasName = (detail, tokens) => {
  const d = String(detail).toUpperCase();
  return tokens.some(t => d.includes(t));
};

// A stable fingerprint for "this counterparty is personal" memory: the masked
// account if present, else the payee/merchant text.
export function txnCounterparty(txn) {
  const m = String(txn.detail).match(/X[\dA-Z]{4,}/i);
  if (m) return m[0].toUpperCase();
  return String(txn.detail).replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40) || txn.kind;
}

// rows = the display tab's parsed rows. personalKeys = Set of counterparty
// fingerprints the user marked ส่วนตัว. Returns everything the panel renders.
export function matchStatement(txns, rows, { personalKeys = new Set() } = {}) {
  const used = new Set();
  const matched = [];
  const take = (txn, row, keys) => { used.add(txn.id); matched.push({ txn, row, keys }); };
  const free = pred => txns.filter(t => !used.has(t.id) && pred(t));

  const claims = rows.filter(r => r.isExpense && r.isEmployee);
  const sealRows = rows.filter(r => r.isExpense && !r.isEmployee);
  const topups = rows.filter(r => typeof r.amountIn === 'number' && r.amountIn > 0);
  const unmatchedRows = [];

  // Pass 1 — one claim ↔ one outgoing transfer: amount + (account OR name).
  for (const c of claims) {
    const l4 = last4(c.bank);
    const toks = nameTokens(c.bank);
    const hit = free(t => t.dir === 'out' && t.amount === c.amountOut
      && ((l4 && t.detail.toUpperCase().includes('X' + l4)) || detailHasName(t.detail, toks)))[0];
    if (hit) {
      const keys = ['amount'];
      if (l4 && hit.detail.toUpperCase().includes('X' + l4)) keys.push('account');
      if (detailHasName(hit.detail, toks)) keys.push('name');
      take(hit, c, keys);
    } else unmatchedRows.push(c);
  }
  // Pass 2 — batch payout: one transfer covering a person's remaining claims.
  const byPerson = new Map();
  for (const c of unmatchedRows.filter(r => r.code)) {
    (byPerson.get(c.code) || byPerson.set(c.code, []).get(c.code)).push(c);
  }
  for (const [, group] of byPerson) {
    if (group.length < 2) continue;
    const sum = Math.round(group.reduce((s, r) => s + r.amountOut, 0) * 100) / 100;
    const l4 = last4(group[0].bank);
    const toks = nameTokens(group[0].bank);
    const hit = free(t => t.dir === 'out' && t.amount === sum
      && ((l4 && t.detail.toUpperCase().includes('X' + l4)) || detailHasName(t.detail, toks)))[0];
    if (!hit) continue;
    const batchKeys = ['amount:รวมทั้งรอบ',
      l4 && hit.detail.toUpperCase().includes('X' + l4) ? 'account' : null,
      detailHasName(hit.detail, toks) ? 'name' : null].filter(Boolean);
    for (const c of group) {
      take(hit, c, batchKeys);
      unmatchedRows.splice(unmatchedRows.indexOf(c), 1);
    }
  }
  // Pass 3 — office/SEAL rows (QR merchants have no payee account): amount must
  // be unique among what's left, otherwise leave it unresolved rather than guess.
  for (const s of sealRows) {
    const hits = free(t => t.dir === 'out' && t.amount === s.amountOut);
    if (hits.length === 1) take(hits[0], s, ['amount:ยอดเดียวในช่วง']);
    else unmatchedRows.push(s);
  }
  // Pass 4 — float top-ups.
  for (const s of topups) {
    const hit = free(t => t.dir === 'in' && t.amount === s.amountIn)[0];
    if (hit) take(hit, s, ['amount']);
    else unmatchedRows.push(s);
  }

  // Leftover transactions: user-marked personal → เก็บ; person-to-person
  // transfers → ask (money left, nobody claimed it); merchant payments →
  // probably personal (K SHOP habits), still promotable in the UI.
  const ask = [], personal = [], probablyPersonal = [], depositsLeft = [];
  for (const t of txns) {
    if (used.has(t.id)) continue;
    if (personalKeys.has(txnCounterparty(t))) { personal.push(t); continue; }
    if (t.dir === 'in') depositsLeft.push(t);
    else if (/payment|ชำระ/i.test(t.kind)) probablyPersonal.push(t);
    else ask.push(t);
  }

  const sum = a => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;
  const inMatched = sum(matched.filter(m => m.txn.dir === 'in').map(m => m.txn.amount));
  const outMatched = sum([...new Set(matched.filter(m => m.txn.dir === 'out').map(m => m.txn.id))]
    .map(id => txns.find(t => t.id === id).amount));
  return {
    matched, unmatchedRows, ask, personal, probablyPersonal, depositsLeft,
    summary: {
      rowsTotal: claims.length + sealRows.length + topups.length,
      rowsMatched: matched.length,
      floatRemainder: Math.round((inMatched - outMatched) * 100) / 100,
      askTotal: sum(ask.map(t => t.amount)),
    },
  };
}
