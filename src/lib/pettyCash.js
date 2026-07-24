// ── Petty Cash (Google Sheets) — pure parsing + audit-flag derivation ────────
// SEAL's agency runs one petty-cash spreadsheet: one tab per year ("2026",
// "2025", …). Employees log each cash claim as a row and paste a Google Slides
// link (in the "Evid" column) as the receipt. Loop only *audits* this sheet —
// it never pays. Payment stays in a separate Make flow.
//
// Layout drifts between years (header lands on row 3 in 2026, row 4 in 2025/24;
// 2024 adds transfer-date / slip columns), so every column is located by header
// text — never by position — the same lesson as sheetTimeline.js. Amounts and
// balances are sometimes merged across several description rows; the Sheets API
// returns the value only on the merge's anchor cell, which we lean on so a
// block's single payment is counted once (and reconcile accumulates correctly).

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// A cell's numeric value, or null (dashes, blanks, merge-followers → null).
function num(cell) {
  const n = cell?.effectiveValue?.numberValue;
  return typeof n === 'number' ? n : null;
}
function text(cell) {
  return String(cell?.formattedValue ?? '').trim();
}

// The evidence URL hides behind the display text. Try, in order: a real cell
// hyperlink, a link run on the rich text, a =HYPERLINK() formula, then a bare
// URL typed as the value.
function cellUrl(cell) {
  if (!cell) return '';
  if (cell.hyperlink) return cell.hyperlink;
  const run = (cell.textFormatRuns || []).find(r => r?.format?.link?.uri);
  if (run) return run.format.link.uri;
  const f = cell.userEnteredValue?.formulaValue;
  if (f) { const m = f.match(/HYPERLINK\(\s*"([^"]+)"/i); if (m) return m[1]; }
  const v = String(cell.formattedValue ?? '');
  return /^https?:\/\//.test(v.trim()) ? v.trim() : '';
}

// Google Slides evidence → a dedupe key. A per-slide link (…?slide=id.gXXX)
// pins one slide, so the same key on two rows = the *same* receipt reused. A
// deck-level share link (…?usp=sharing, no slide id) can't be told apart, so we
// flag it as "deck-level, can't verify the slide" instead of as a duplicate.
export function slideRef(url = '') {
  if (!url) return { url: '', slideKey: null, deckLevel: false };
  const pres = url.match(/presentation\/d\/([\w-]+)/) || url.match(/\/d\/([\w-]+)/);
  const slide = url.match(/[?#&]slide=id\.([\w.-]+)/);
  if (pres && slide) return { url, slideKey: `${pres[1]}:${slide[1]}`, deckLevel: false };
  return { url, slideKey: null, deckLevel: !!pres };
}

// "SIE0047 | ปัณฑารีย์ ไชยเพ็ชร (ปันปัน)" → code / full name / nickname.
// "SEAL" / "SEAL INT." are the company's own office spend, not an employee.
export function parseName(raw = '') {
  const s = String(raw).trim();
  const [codePart, namePart = ''] = s.split('|').map(x => x.trim());
  const code = codePart || '';
  const nick = (namePart.match(/\(([^)]+)\)\s*$/) || [])[1] || '';
  const fullName = namePart.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return {
    code,
    fullName: fullName || code,
    nick,
    label: nick || fullName || code || s,
    isEmployee: /^SIE/i.test(code),
  };
}

// The team roster lives in the sheet's "Dropdown List" tab, column A, as
// "SIE0047 | ปัณฑารีย์ ไชยเพ็ชร (ปันปัน)". Read-only for now — position and the
// Asana display-name mapping aren't in the sheet yet and get added later.
export function parseRoster(sheet) {
  const rowData = sheet?.data?.[0]?.rowData || [];
  const byCode = new Map();
  for (const rd of rowData) {
    const who = parseName(text(rd?.values?.[0]));
    if (!who.isEmployee || byCode.has(who.code)) continue;
    byCode.set(who.code, { code: who.code, fullName: who.fullName, nick: who.nick, label: who.label });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

// Year tabs aren't always named exactly "2026" — real sheets use "SEAL 2026",
// "🛒 2026", or the Thai Buddhist year "2569". Pull a Gregorian year out of any
// of those; return null for non-year tabs (Dropdown List, BANK INFO, …).
export function tabYear(title = '') {
  const m = String(title).match(/(20\d{2}|25\d{2})/);
  if (!m) return null;
  let y = Number(m[1]);
  if (y >= 2500) y -= 543; // พ.ศ. → ค.ศ.
  return y >= 2000 && y <= 2100 ? y : null;
}

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// "01-มกราคม" → 0. Prefer the leading number; fall back to the Thai name.
function monthIndex(str = '') {
  const m = String(str).match(/^\s*(\d{1,2})/);
  if (m) { const i = Number(m[1]) - 1; if (i >= 0 && i <= 11) return i; }
  const i = TH_MONTHS.findIndex(n => String(str).includes(n));
  return i === -1 ? null : i;
}

// Find the header row + column map by scanning the first rows for the
// Month/Name/Amount signature. `amount` is a merged header whose in/out labels
// (เงินเข้า/เงินออก) live on the row *below* it.
function locateColumns(rowData) {
  for (let h = 0; h < Math.min(rowData.length, 8); h++) {
    const cells = rowData[h]?.values || [];
    const labels = cells.map(c => norm(c?.formattedValue));
    const hasMonth = labels.indexOf('month');
    const hasName = labels.indexOf('name');
    if (hasMonth === -1 || hasName === -1) continue;
    const sub = (rowData[h + 1]?.values || []).map(c => norm(c?.formattedValue));
    const findLbl = pred => { const i = labels.findIndex(pred); return i === -1 ? null : i; };
    const findSub = pred => { const i = sub.findIndex(pred); return i === -1 ? null : i; };
    const inCol = findSub(x => x.includes('เงินเข้า'));
    const outCol = findSub(x => x.includes('เงินออก'));
    if (inCol === null && outCol === null) continue; // not the ledger header
    return {
      headerRow: h,
      dataStart: h + 2, // skip the เงินเข้า/เงินออก sub-row
      month: hasMonth,
      name: hasName,
      project: findLbl(x => x === 'project'),
      work: findLbl(x => x === 'work'),
      evid: findLbl(x => x === 'evid' || x === 'item'),
      inCol, outCol,
      balance: findLbl(x => x.includes('คงเหลือ')),
      note: findLbl(x => x.includes('หมายเหตุ')),
      // 2024 keeps its receipts as filenames in a "สลิป/หลักฐาน" column instead
      // of a Slides link in Evid — count it so those rows aren't false "missing".
      slip: findLbl(x => x.includes('สลิป') || x.includes('หลักฐาน')),
    };
  }
  return null;
}

// One year tab → normalized claim rows. `sheet` is a Sheets API sheet object
// (spreadsheets.get with includeGridData=true).
export function parsePettyCash(sheet) {
  const title = sheet?.properties?.title || '';
  const year = Number((title.match(/20\d{2}/) || [])[0]) || null;
  const rowData = sheet?.data?.[0]?.rowData || [];
  const col = locateColumns(rowData);
  if (!col) return { year, title, rows: [], ok: false };

  const at = (cells, c) => (c === null ? undefined : cells[c]);
  const rows = [];
  let lastMonth = null;
  for (let r = col.dataStart; r < rowData.length; r++) {
    const cells = rowData[r]?.values || [];
    const nameRaw = text(at(cells, col.name));
    const amountIn = num(at(cells, col.inCol));
    const amountOut = num(at(cells, col.outCol));
    const balance = num(at(cells, col.balance));
    const work = text(at(cells, col.work));
    const project = text(at(cells, col.project));
    // Skip rows that carry no claim and no ledger anchor: spacer rows, and the
    // keeper's treasury notes ("โอนเพิ่ม 6,566.19" with the amount parked in the
    // เงินออก column) — a claim always names a party or describes the work, so a
    // bare amount with neither is bookkeeping, not an expense.
    if (!nameRaw && !work && balance === null) continue;

    let mIdx = monthIndex(text(at(cells, col.month)));
    if (mIdx === null) mIdx = lastMonth; else lastMonth = mIdx;

    const who = parseName(nameRaw);
    const ev = slideRef(cellUrl(at(cells, col.evid)));
    const slip = text(at(cells, col.slip));
    const hasSlip = slip !== '' && slip !== '-';
    rows.push({
      rowNo: r + 1, // 1-based, matches the spreadsheet
      monthIdx: mIdx,
      monthLabel: mIdx != null ? TH_MONTHS[mIdx] : '',
      nameRaw, ...who,
      project, work,
      note: text(at(cells, col.note)),
      evidenceUrl: ev.url,
      slideKey: ev.slideKey,
      deckLevel: ev.deckLevel,
      slip: hasSlip ? slip : '',
      hasEvidence: !!ev.url || hasSlip,
      amountIn, amountOut, balance,
      isExpense: typeof amountOut === 'number' && amountOut > 0,
    });
  }
  splitMergedBlocks(rows);
  return { year, title, rows, ok: true };
}

// A claim's own baht amount, read from its description text: the "TOTAL : N"
// line if present, else the sum of every "(… N บาท)" figure (and bare "= N"
// tails), skipping "โอนล่วงหน้า" advance-transfer notes. Returns null if it
// finds no number at all.
export function amountFromText(str = '') {
  const t = String(str);
  const totals = t.match(/total\s*:?\s*([\d,]+(?:\.\d+)?)/ig);
  if (totals) return Number(totals[totals.length - 1].replace(/[^\d.]/g, ''));
  let sum = 0, found = false;
  for (const line of t.split('\n')) {
    if (line.includes('ล่วงหน้า')) continue;
    if (/บาท|thb/i.test(line)) {
      for (const m of line.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:บาท|thb)/ig)) { sum += Number(m[1].replace(/,/g, '')); found = true; }
    } else {
      const eq = line.trim().match(/=\s*([\d,]+(?:\.\d+)?)\s*$/);
      if (eq) { sum += Number(eq[1].replace(/,/g, '')); found = true; }
    }
  }
  return found ? Math.round(sum * 100) / 100 : null;
}

// Employees sometimes merge several claims into one amount cell: the anchor row
// carries the combined total, the rows below it have a blank amount but their
// own evidence slide + description. The Sheets API returns the amount only on
// the anchor, so those sub-claims would be dropped. Recover them: each block =
// an expense row + the evidence-bearing rows directly under it. Split only when
// the per-row amounts (from amountFromText) reconcile to the anchor total — the
// anchor keeps the exact remainder so the running balance is never disturbed;
// otherwise keep one row and hang the extra receipts off it.
//
// Money math is untouched: amountOut still comes from column H (the anchor absorbs
// any block discrepancy into its remainder). Each split row ALSO gets an optional
// display-only `writtenAmount` = the amount the employee actually wrote for that
// row (its amountFromText) — so a warped anchor can SHOW 615 (its own figure) while
// person/month totals and the balance keep using the exact amountOut. `writtenAmount`
// is absent on non-split rows.
function splitMergedBlocks(rows) {
  for (let i = 0; i < rows.length; i++) {
    const anchor = rows[i];
    if (!anchor.isExpense) continue;
    const sibs = [];
    for (let j = i + 1; j < rows.length; j++) {
      const s = rows[j];
      if (s.amountOut !== null || s.amountIn !== null || s.balance !== null || !s.evidenceUrl) break;
      sibs.push(s);
    }
    if (!sibs.length) continue;

    const total = anchor.amountOut;
    const parts = [anchor, ...sibs].map(r => amountFromText(r.work));
    const sum = parts.reduce((a, b) => a + (b || 0), 0);
    // Allow a small gap between the sub-rows' own totals and the merged total —
    // employees' arithmetic slips a few baht (a subtraction, a rounded satang).
    // The anchor absorbs the gap so the running balance is untouched; a large
    // mismatch (mis-parse, missing amount) still falls back to one row.
    const tol = Math.max(5, Math.min(total * 0.02, 40));
    if (parts.every(p => p != null) && Math.abs(sum - total) <= tol) {
      // Give siblings their parsed amounts; the anchor takes the exact rest so
      // the running balance is preserved. `writtenAmount` records each row's own
      // figure (display-only) — the anchor's amountOut may differ from what the
      // employee wrote because it absorbed the block's discrepancy.
      // The UI renders the whole block as ONE group: every member carries
      // blockId (= anchor rowNo) and the anchor carries blockTotal — the exact
      // column-H figure, which is the only total that ever gets displayed.
      // Employee side-notes (the หมายเหตุ column, their own line arithmetic)
      // are theirs to keep — never compared, never flagged.
      let assigned = 0;
      for (let k = 0; k < sibs.length; k++) {
        sibs[k].amountOut = parts[k + 1];
        sibs[k].isExpense = parts[k + 1] > 0;
        sibs[k].fromMerge = true;
        sibs[k].writtenAmount = parts[k + 1];
        sibs[k].blockId = anchor.rowNo;
        assigned += parts[k + 1];
      }
      anchor.amountOut = Math.round((total - assigned) * 100) / 100;
      anchor.isExpense = anchor.amountOut > 0;
      anchor.fromMerge = true;
      anchor.writtenAmount = parts[0];
      anchor.blockId = anchor.rowNo;
      anchor.blockTotal = total;
    } else {
      // Can't verify the split — keep the combined total, but surface the other
      // receipts so none is lost.
      anchor.extraEvidence = sibs.filter(s => s.evidenceUrl)
        .map(s => ({ url: s.evidenceUrl, work: s.work }));
    }
    i += sibs.length; // don't re-scan the rows we just consumed
  }
}

// ── Audit flags — every flag is "ask Pat to open the receipt", not a verdict ──
export function deriveFlags(rows) {
  const expenses = rows.filter(r => r.isExpense);
  const empExpenses = expenses.filter(r => r.isEmployee);

  // 1) Duplicate claim: same Work description + same amount, anywhere in the tab.
  const workGroups = new Map();
  for (const r of expenses) {
    const key = `${norm(r.work)}|${r.amountOut.toFixed(2)}`;
    if (!norm(r.work)) continue;
    (workGroups.get(key) || workGroups.set(key, []).get(key)).push(r);
  }
  const workDup = [...workGroups.values()]
    .filter(g => g.length > 1)
    .map(g => ({ work: g[0].work, amount: g[0].amountOut, rows: g }))
    .sort((a, b) => b.amount - a.amount);

  // 2) Reused evidence: the same specific slide pinned on a FEW rows. Some
  //    employees lazily paste the deck's first-slide link onto every row, so a
  //    slideKey can land on many rows of unrelated totals — that's linking
  //    noise, not reuse. A genuine "same receipt used twice" shows up as a
  //    small group (2-3 rows), so we flag those and drop the big lazy sets.
  const slideGroups = new Map();
  for (const r of expenses) {
    if (!r.slideKey) continue;
    (slideGroups.get(r.slideKey) || slideGroups.set(r.slideKey, []).get(r.slideKey)).push(r);
  }
  const slideDup = [...slideGroups.values()]
    .filter(g => g.length >= 2 && g.length <= 3)
    .map(g => ({ slideKey: g[0].slideKey, rows: g }))
    .sort((a, b) => b.rows.length - a.rows.length);

  // 3) Balance reconcile: walk the ledger; each recorded balance should equal
  //    the previous balance plus everything in/out since. Merged balance blocks
  //    just accumulate until the next recorded balance.
  const reconcile = [];
  let prev = null, acc = 0;
  for (const r of rows) {
    if (r.amountIn != null) acc += r.amountIn;
    if (r.amountOut != null) acc -= r.amountOut;
    if (r.balance != null) {
      if (prev != null) {
        const expected = prev + acc;
        const diff = r.balance - expected;
        if (Math.abs(diff) > 0.01) reconcile.push({ row: r, expected, balance: r.balance, diff });
      }
      prev = r.balance;
      acc = 0;
    }
  }

  // 4) Unusually large amount (there is no fixed approval ceiling): flag amounts
  //    above mean + 2σ of employee claims.
  const amounts = empExpenses.map(r => r.amountOut);
  const mean = amounts.reduce((s, x) => s + x, 0) / (amounts.length || 1);
  const variance = amounts.reduce((s, x) => s + (x - mean) ** 2, 0) / (amounts.length || 1);
  const threshold = mean + 2 * Math.sqrt(variance);
  const outlier = empExpenses.filter(r => r.amountOut > threshold)
    .sort((a, b) => b.amountOut - a.amountOut);

  // 5) Missing evidence: an employee claim with neither a slide link nor a slip.
  //    (There is deliberately NO flag comparing column H against the employee's
  //    own written figures/side-notes — those are theirs; H is the only money.)
  const noEvidence = empExpenses.filter(r => !r.hasEvidence);

  return {
    workDup, slideDup, reconcile, outlier, noEvidence,
    outlierThreshold: threshold,
    deckLevelCount: expenses.filter(r => r.deckLevel).length,
    total: workDup.length + slideDup.length + reconcile.length + outlier.length + noEvidence.length,
  };
}

// ── Roll-ups: totals per person / month / project ────────────────────────────
export function summarize(rows, by = 'person', flags = null) {
  // Which rows a flag touches, for a per-person flag count.
  const flaggedRowNos = new Set();
  if (flags) {
    for (const g of flags.workDup) g.rows.forEach(r => flaggedRowNos.add(r.rowNo));
    for (const g of flags.slideDup) g.rows.forEach(r => flaggedRowNos.add(r.rowNo));
    for (const f of flags.reconcile) flaggedRowNos.add(f.row.rowNo);
    for (const r of flags.outlier) flaggedRowNos.add(r.rowNo);
    for (const r of flags.noEvidence) flaggedRowNos.add(r.rowNo);
  }
  const keyOf = r =>
    by === 'month' ? (r.monthIdx != null ? String(r.monthIdx) : '?')
    : by === 'project' ? (r.project || '—')
    : (r.code || r.label || '—');
  const labelOf = r =>
    by === 'month' ? (r.monthLabel || '—')
    : by === 'project' ? (r.project || '—')
    : r.label;

  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    let g = map.get(k);
    if (!g) map.set(k, g = { key: k, label: labelOf(r), out: 0, in: 0, count: 0, flags: 0, isEmployee: r.isEmployee });
    if (r.amountOut != null) { g.out += r.amountOut; if (r.isExpense) g.count += 1; }
    if (r.amountIn != null) g.in += r.amountIn;
    if (flaggedRowNos.has(r.rowNo)) g.flags += 1;
  }
  const arr = [...map.values()];
  return by === 'month'
    ? arr.sort((a, b) => Number(a.key) - Number(b.key))
    : arr.sort((a, b) => b.out - a.out);
}
