// ── Petty Cash evidence — parse a Google Slides deck into claim items ─────────
// Each employee keeps ONE Slides deck as their receipt book. It runs as repeating
// blocks: a "PETTY CASH" divider slide carrying a full date ("17 FEB 2026"),
// then one or more "รายการที่ N" slides — each an expense with a title and a
// baht amount, plus a travel/product breakdown and a "ลูกค้าคอนเฟิร์ม…" line.
//
// A sheet row's evidence link points at a specific slide (…slide=id.gXXXX); the
// Slides API returns that same id as the slide's objectId, so we can join a
// claim row to its exact slide, compare the amount, and recover the real day
// (the sheet only records the month). This is how Loop answers "does the sheet
// actually match the slide?" without Pat opening each deck by hand.

// Flatten the Slides API presentation into [{ objectId, text }] per slide.
function elementText(el) {
  const runs = el?.shape?.text?.textElements;
  if (runs) return runs.map(t => t.textRun?.content || '').join('');
  // Tables: walk every cell.
  const rows = el?.table?.tableRows;
  if (rows) {
    return rows.flatMap(r => (r.tableCells || [])
      .flatMap(c => (c.text?.textElements || []).map(t => t.textRun?.content || ''))).join(' ');
  }
  return '';
}
export function flattenSlides(presentation) {
  return (presentation?.slides || []).map(s => ({
    objectId: s.objectId,
    text: (s.pageElements || []).map(elementText).join('\n').replace(/\r/g, '').trim(),
  }));
}

const EN_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7,
  september: 8, october: 9, november: 10, december: 11,
};
// "17 FEB 2026", "6 July2026" (no space), "1 April 2026" → {y,m,d} | null.
export function parseSlideDate(text = '') {
  const m = text.match(/(\d{1,2})\s*([A-Za-z]{3,9})\.?\s*(\d{4})/);
  if (!m) return null;
  const mon = EN_MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return { y: Number(m[3]), m: mon, d: Number(m[1]) };
}

// First "1,500 บาท" / "931 THB" / "฿99" on the slide → number | null. Commas
// stripped; the header amount (the total for that รายการ) comes first.
export function parseSlideAmount(text = '') {
  // No \b after บาท — Thai letters aren't ASCII word chars, so \b never matches
  // there (only THB, being ASCII, would). Match the unit directly instead.
  const m = text.match(/฿\s*([\d,]+(?:\.\d+)?)/)
    || text.match(/([\d,]+(?:\.\d+)?)\s*(?:บาท|thb)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const isDivider = t => /petty\s*cash/i.test(t);
const isItem = t => /รายการที่\s*\d/.test(t);
// The claim's own title is the first meaningful line after the "รายการ" header.
function itemTitle(text) {
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  const i = lines.findIndex(l => /รายการที่\s*\d/.test(l));
  for (let k = i + 1; k < lines.length; k++) {
    if (!/^[\d,]+(\.\d+)?\s*(บาท|thb|฿)/i.test(lines[k])) return lines[k];
  }
  return lines[i + 1] || '';
}

// Walk slides in order; a divider's date carries down onto the items under it.
// presId is stamped on every item so deep links can be rebuilt later.
export function parseDeck(slides, presId = null) {
  const items = [];
  let curDate = null;
  for (const s of slides) {
    if (isDivider(s.text)) { curDate = parseSlideDate(s.text); continue; }
    if (!isItem(s.text)) continue;
    items.push({
      objectId: s.objectId,
      presId,
      date: curDate,
      title: itemTitle(s.text),
      amount: parseSlideAmount(s.text),
    });
  }
  return items;
}

// ── Content matching — find the right slide when the link doesn't ───────────
// Some Evid links point at the deck (or the wrong slide) — sloppy or worse.
// But the slide's own title mirrors the sheet's Work text ("เพื่อนสนิทติดสวย -
// NIVEA Soft Skin Wonderland … 306 THB"), so we can locate the true slide by
// text + amount and hand back a corrected deep link.
const STOP = new Set(['โปรที่ชอบ', 'ที่ชอบ', 'จัดโปร', 'ค่าเดินทาง', 'ค่าสินค้า', 'ค่าอาหาร',
  'บาท', 'thb', 'ค่า', 'grab', 'car', 'total', 'แพนด้าบ้าโปร', 'รายการที่']);
function tokens(s = '') {
  const words = String(s).toLowerCase().match(/[a-z]{3,}|[฀-๿]{3,}|\d{2,}/g) || [];
  return new Set(words.filter(w => !STOP.has(w)));
}

// Best content match for a sheet row across all parsed deck items.
// Requires either the amount to agree or ≥2 distinctive shared tokens, so a
// generic travel claim can't latch onto a random slide.
export function findSlideByContent(row, items) {
  const want = tokens(`${row.work || ''} ${row.project || ''}`);
  let best = null, bestScore = 0;
  for (const item of items) {
    const overlap = [...tokens(item.title)].filter(t => want.has(t)).length;
    const amtOk = item.amount != null && Math.abs(item.amount - row.amountOut) <= 1;
    if (!amtOk && overlap < 2) continue;
    const score = overlap + (amtOk ? 3 : 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}

export const slideDeepLink = item =>
  `https://docs.google.com/presentation/d/${item.presId}/edit#slide=id.${item.objectId}`;

// Compare one sheet claim row to its evidence deck(s). `itemsByKey` is keyed by
// "presId:objectId" (same shape as row.slideKey) so ids can't collide across
// decks; `allItems` = the same items as a list, for content matching.
//   'match'          — linked slide's amount agrees (within ฿1)
//   'wrong_link'     — linked slide disagrees, but another slide matches the
//                      row's text+amount → fixedUrl points there
//   'content_match'  — no usable link (deck-level/missing) but content found
//                      the slide → fixedUrl
//   'amount_mismatch'— linked slide differs and nothing better exists
//   'no_amount'      — found the slide but couldn't read an amount off it
//   'not_found'      — no link and content matching found nothing
export function compareRow(row, itemsByKey, allItems = []) {
  const linked = row.slideKey ? itemsByKey.get(row.slideKey) : null;

  if (linked && linked.amount != null && Math.abs(linked.amount - row.amountOut) <= 1) {
    return { status: 'match', slideAmount: linked.amount, slideDate: linked.date };
  }

  const found = findSlideByContent(row, allItems);
  const foundAmtOk = found && found.amount != null && Math.abs(found.amount - row.amountOut) <= 1;

  if (foundAmtOk && (!linked || found !== linked)) {
    return {
      status: linked || row.slideKey ? 'wrong_link' : 'content_match',
      slideAmount: found.amount, slideDate: found.date,
      fixedUrl: slideDeepLink(found), fixedTitle: found.title,
    };
  }
  if (linked) {
    if (linked.amount == null) return { status: 'no_amount', slideDate: linked.date };
    return {
      status: 'amount_mismatch', slideAmount: linked.amount,
      sheetAmount: row.amountOut, diff: linked.amount - row.amountOut, slideDate: linked.date,
    };
  }
  return { status: 'not_found' };
}
