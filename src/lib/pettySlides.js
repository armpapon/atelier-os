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
export function parseDeck(slides) {
  const items = [];
  let curDate = null;
  for (const s of slides) {
    if (isDivider(s.text)) { curDate = parseSlideDate(s.text); continue; }
    if (!isItem(s.text)) continue;
    items.push({
      objectId: s.objectId,
      date: curDate,
      title: itemTitle(s.text),
      amount: parseSlideAmount(s.text),
    });
  }
  return items;
}

// Compare one sheet claim row to its linked slide. `itemsByKey` is keyed by the
// same "presId:objectId" shape as row.slideKey, so ids can't collide across the
// several decks one person might link to.
//   'match'          — amounts agree (within ฿1)
//   'amount_mismatch'— slide amount differs from the sheet's เงินออก
//   'no_amount'      — found the slide but couldn't read an amount off it
//   'not_in_deck'    — the linked slide id isn't an item slide in the deck
//   'no_slide'       — the row has no per-slide link to compare (deck-level link)
export function compareRow(row, itemsByKey) {
  if (!row.slideKey) return { status: 'no_slide' };
  const item = itemsByKey.get(row.slideKey);
  if (!item) return { status: 'not_in_deck' };
  if (item.amount == null) return { status: 'no_amount', slideDate: item.date };
  const diff = item.amount - row.amountOut;
  return {
    status: Math.abs(diff) <= 1 ? 'match' : 'amount_mismatch',
    slideAmount: item.amount, sheetAmount: row.amountOut, diff, slideDate: item.date,
  };
}
