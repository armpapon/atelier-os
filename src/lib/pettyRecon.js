// ── Petty Cash — reconcile the Google-Form source against the curated sheet ──
// Employees claim through a Google Form; the Form writes rows into a "SEAL
// Petty Cash (Responses)" sheet (timestamped, hard to tamper with). A middle
// person then re-keys those claims into the curated sheet executives see. Pat
// wants to know where the numbers change hands: claims that appear in the
// curated sheet with NO form submission behind them, and form submissions that
// never make it to the curated sheet. Matching is many-to-many because the
// middle person both SPLITS one form total into several sheet lines and MERGES
// several form claims into one line — verified against real data (sheet
// ฿2,511 = form ฿1,389 + ฿1,122 exactly).

import { serialToDate } from './sheetTimeline.js';

const text = c => String(c?.formattedValue ?? '').trim();
const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// ── Parse the "Form Responses 1" tab (Sheets API grid) ──────────────────────
// Columns located by header text — the form owner can reorder questions.
export function parseFormResponses(sheet) {
  const rowData = sheet?.data?.[0]?.rowData || [];
  if (!rowData.length) return [];
  const headers = (rowData[0]?.values || []).map(v => norm(text(v)));
  const col = pred => { const i = headers.findIndex(pred); return i === -1 ? null : i; };
  const c = {
    ts: col(h => h === 'timestamp'),
    action: col(h => h.includes('เลือกรายการ')),
    who: col(h => h.includes('ใครเป็นคนเบิก')),
    project: col(h => h.includes('pages') || h === 'projects'),
    detail: col(h => h.includes('รายละเอียดเบิกเงิน')),
    slide: col(h => h.includes('google slide')),
    amount: col(h => h.includes('รวมจำนวนเงิน')),
    paid: col(h => h.includes('ทำจ่าย')),
    note: col(h => h.includes('หมายเหตุ')),
  };
  if (c.ts === null || c.who === null || c.amount === null) return [];

  const rows = [];
  for (let r = 1; r < rowData.length; r++) {
    const v = rowData[r]?.values || [];
    const at = i => (i === null ? {} : (v[i] || {}));
    const tsN = at(c.ts).effectiveValue?.numberValue;
    if (typeof tsN !== 'number') continue;
    // A submission is a claim when it carries a code + a positive amount —
    // don't gate on the "action" dropdown. Some rows pick "เพิ่มข้อมูลธนาคาร"
    // (add bank info) yet also submit a claim ("บันทึกข้อมูล และกรอกเบิกเงินต่อ"),
    // and those were being dropped, wrongly flagging the sheet row as
    // "no form behind it".
    const who = text(at(c.who));
    const code = (who.match(/^(SIE\w*\d+)/i) || [])[1] || null;
    if (!code) continue;
    const amount = at(c.amount).effectiveValue?.numberValue;
    if (typeof amount !== 'number' || amount <= 0) continue;
    // Timestamp serial includes the time of day — keep the fraction.
    const ts = new Date(serialToDate(Math.floor(tsN)).getTime() + Math.round((tsN % 1) * 86400000));
    rows.push({
      formRow: r + 1, ts, code: code.toUpperCase(),
      who, project: text(at(c.project)), detail: text(at(c.detail)),
      slideUrl: text(at(c.slide)), amount: Math.round(amount * 100) / 100,
      paid: at(c.paid).effectiveValue?.boolValue === true || /true|จ่าย/i.test(text(at(c.paid))),
      note: text(at(c.note)),
    });
  }
  return rows;
}

// "…presentation/d/<presId>…slide=id.<slideId>" → joinable key parts.
export function slideParts(url = '') {
  const pres = (String(url).match(/presentation\/d\/([\w-]+)/) || [])[1] || null;
  const slide = (String(url).match(/slide=id\.([\w_-]+)/) || [])[1] || null;
  return { pres, slide, key: pres && slide ? `${pres}:${slide}` : null };
}

function* combos(arr, n) {
  if (n === 1) { for (const a of arr) yield [a]; return; }
  for (let i = 0; i <= arr.length - n; i++) {
    for (const rest of combos(arr.slice(i + 1), n - 1)) yield [arr[i], ...rest];
  }
}

// ── Reconcile form rows against curated-sheet expense rows (one year) ───────
// Four passes, strongest evidence first:
//   slide  — both sides link the same slide of the same deck
//   amount — same person, same satang amount
//   split  — one form total = 2-3 sheet lines summed (same person)
//   merge  — one sheet line = 2-3 form claims summed (same person)
// Returns per-side match maps + the leftovers Pat actually reviews.
export function reconcile(formRows, destRows, { year } = {}) {
  // ts is read with UTC getters — a form sent after 17:00 (UTC+7) would else
  // land on the next day, a New Year's Eve claim in the wrong year.
  // The form→sheet copy crosses the year boundary: a claim submitted late in
  // year Y-1 is often paid and recorded in the year-Y tab. So the MATCHING pool
  // includes the tail of the previous year (Oct–Dec); "missing/pending" lists,
  // though, stay scoped to forms of this year.
  const inYear = f => f.ts.getUTCFullYear() === year;
  const eligible = f => inYear(f) || (f.ts.getUTCFullYear() === year - 1 && f.ts.getUTCMonth() >= 9);
  const forms = formRows.filter(f => !year || eligible(f));
  const dests = destRows.filter(d => d.isEmployee && d.isExpense);

  const destBySlide = new Map();
  for (const d of dests) {
    const k = slideParts(d.evidenceUrl).key;
    if (k) (destBySlide.get(k) || destBySlide.set(k, []).get(k)).push(d);
  }

  const fmatch = new Map(); // formRow -> {how, destRows:[rowNo]}
  const dmatch = new Map(); // rowNo   -> {how, formRows:[formRow]}
  const tie = (f, ds, how) => {
    fmatch.set(f.formRow, { how, destRows: ds.map(d => d.rowNo) });
    for (const d of ds) {
      const cur = dmatch.get(d.rowNo);
      if (cur) cur.formRows.push(f.formRow);
      else dmatch.set(d.rowNo, { how, formRows: [f.formRow] });
    }
  };

  for (const f of forms) { // P1 slide
    const k = slideParts(f.slideUrl).key;
    const hit = k && destBySlide.get(k);
    if (hit) tie(f, hit, 'slide');
  }
  for (const f of forms) { // P2 person+amount
    if (fmatch.has(f.formRow)) continue;
    const hit = dests.find(d => !dmatch.has(d.rowNo) && d.code === f.code && Math.abs(d.amountOut - f.amount) <= 1);
    if (hit) tie(f, [hit], 'amount');
  }
  for (const f of forms) { // P3 split
    if (fmatch.has(f.formRow)) continue;
    const pool = dests.filter(d => !dmatch.has(d.rowNo) && d.code === f.code);
    let hit = null;
    for (const n of [2, 3]) {
      for (const cb of combos(pool, n)) {
        if (Math.abs(cb.reduce((s, d) => s + d.amountOut, 0) - f.amount) <= 1) { hit = cb; break; }
      }
      if (hit) break;
    }
    if (hit) tie(f, hit, 'split');
  }
  for (const d of dests) { // P4 merge
    if (dmatch.has(d.rowNo)) continue;
    const pool = forms.filter(f => !fmatch.has(f.formRow) && f.code === d.code);
    let hit = null;
    for (const n of [2, 3]) {
      for (const cb of combos(pool, n)) {
        if (Math.abs(cb.reduce((s, f) => s + f.amount, 0) - d.amountOut) <= 1) { hit = cb; break; }
      }
      if (hit) break;
    }
    if (hit) {
      dmatch.set(d.rowNo, { how: 'merge', formRows: hit.map(f => f.formRow) });
      for (const f of hit) fmatch.set(f.formRow, { how: 'merge', destRows: [d.rowNo] });
    }
  }

  // Same claim recorded on the curated sheet MORE times than the employee
  // actually submitted it: one form (matched by its own slide link) is tied to
  // several sheet rows carrying the SAME amount. The lowest row is the real one;
  // the rest are the sheet's own extra copies — they still read as "จ่ายแล้ว"
  // off that single form, so they'd otherwise pass silently. The amount must
  // match, so a legitimate split (one form → sheet lines of DIFFERENT amounts
  // that sum to it) is never touched, and neither is a reused evidence link
  // across genuinely different amounts (บิว ฿672/฿668). This is the sheet-side
  // double-entry the fraud audit is looking for; verify the real cash-out in
  // Make/bank, since Loop only reads.
  const destDup = [];
  const dupSeen = new Set(); // a row can be reached via >1 form (shared slide) — flag it once
  for (const [formRow, m] of fmatch) {
    if (m.how !== 'slide' || m.destRows.length < 2) continue;
    const byAmt = new Map();
    for (const rn of m.destRows) {
      const d = dests.find(x => x.rowNo === rn);
      if (!d) continue;
      const k = d.amountOut.toFixed(2);
      (byAmt.get(k) || byAmt.set(k, []).get(k)).push(d);
    }
    for (const grp of byAmt.values()) {
      if (grp.length < 2) continue;
      grp.sort((a, b) => a.rowNo - b.rowNo);
      for (const d of grp.slice(1)) {
        if (dupSeen.has(d.rowNo)) continue;
        dupSeen.add(d.rowNo);
        destDup.push({ rowNo: d.rowNo, code: d.code, amount: d.amountOut, keep: grp[0].rowNo, formRow });
      }
    }
  }

  // The last form→sheet copy lags; a recent unmatched form row is "pending",
  // not "missing". 21 days covers the payout batching seen in the data.
  const cutoff = Date.now() - 21 * 86400000;
  const formMissing = [], formPending = [];
  for (const f of forms) {
    if (fmatch.has(f.formRow) || (year && !inYear(f))) continue; // prev-year tail isn't this year's queue
    (f.ts.getTime() >= cutoff ? formPending : formMissing).push(f);
  }

  // The form only exists since Aug 2025 — a sheet month older than the first
  // form submission can't have a form behind it, so "no source" is only a
  // meaningful observation inside the form's coverage window.
  const covTs = formRows.length ? Math.min(...formRows.map(f => f.ts.getTime())) : null;
  const coverage = covTs == null ? null
    : { y: new Date(covTs).getUTCFullYear(), m: new Date(covTs).getUTCMonth() };
  const inCoverage = d => coverage != null && year != null && d.monthIdx != null
    && (year > coverage.y || (year === coverage.y && d.monthIdx >= coverage.m));
  const destNoSource = dests.filter(d => !dmatch.has(d.rowNo) && inCoverage(d));

  // Duplicate submissions inside the form itself (same person+amount, ≤3 days
  // apart) — e.g. the same ฿2,031 claim sent twice on one day under two pages.
  const formDup = [];
  const byCodeAmt = new Map();
  for (const f of forms) {
    const k = `${f.code}:${f.amount.toFixed(2)}`;
    (byCodeAmt.get(k) || byCodeAmt.set(k, []).get(k)).push(f);
  }
  for (const g of byCodeAmt.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < g.length; i++) {
      if (g[i].ts - g[i - 1].ts <= 3 * 86400000) { formDup.push([g[i - 1], g[i]]); break; }
    }
  }

  return {
    forms, dests, fmatch, dmatch, coverage,
    matchedForms: forms.filter(f => fmatch.has(f.formRow)).length,
    matchedDests: dests.filter(d => dmatch.has(d.rowNo)).length,
    formMissing, formPending, destNoSource, formDup, destDup,
  };
}

// ── Person-centric projections — the UI leads with people, not lists ────────
// Split a reconcile() result per employee code so each person's card can carry
// its own recon observations.
export function reconByPerson(R) {
  const per = new Map();
  const g = code => per.get(code) || per.set(code, { noSource: [], missing: [], pending: [], dups: [] }).get(code);
  for (const d of R.destNoSource) g(d.code).noSource.push(d);
  for (const f of R.formMissing) g(f.code).missing.push(f);
  for (const f of R.formPending) g(f.code).pending.push(f);
  for (const pair of R.formDup) g(pair[0].code).dups.push(pair);
  return per;
}

// Sheet rowNo → { how, ts, paid } of the form submission that backs it, so a
// claim row can show "ใบเบิกฟอร์ม 5/3" and whether it's been paid. paid is true
// only if every backing form submission is ticked ทำจ่ายแล้ว.
export function destMatchInfo(R) {
  const byForm = new Map(R.forms.map(f => [f.formRow, f]));
  const m = new Map();
  for (const [rowNo, v] of R.dmatch) {
    const fs = v.formRows.map(fr => byForm.get(fr)).filter(Boolean);
    m.set(rowNo, { how: v.how, ts: fs[0]?.ts || null, paid: fs.length > 0 && fs.every(f => f.paid) });
  }
  return m;
}

// The payout queue: every form claim still unticked in the "ทำจ่ายแล้ว" column
// (col N), grouped by person, newest first — who is still owed money. Independent
// of whether the claim reached the curated sheet.
export function payQueue(R) {
  const per = new Map();
  for (const f of R.forms) {
    if (f.paid) continue;
    const g = per.get(f.code) || per.set(f.code, { code: f.code, who: f.who, claims: [], total: 0 }).get(f.code);
    g.claims.push(f); g.total += f.amount;
  }
  const groups = [...per.values()].map(g => ({
    ...g, claims: g.claims.sort((a, b) => b.ts - a.ts),
  })).sort((a, b) => b.total - a.total);
  return { groups, count: groups.reduce((s, g) => s + g.claims.length, 0), total: groups.reduce((s, g) => s + g.total, 0) };
}
