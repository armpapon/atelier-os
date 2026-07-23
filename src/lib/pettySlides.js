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
      // "รายการที่ N" number. N restarts per batch (NOT unique deck-wide), but a
      // consecutive run of N — or a repeated same N (one claim over 2 slides) —
      // defines a block, which is what the anchor-window matcher walks.
      no: Number((s.text.match(/รายการที่\s*(\d+)/) || [])[1]) || null,
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
// generic travel claim can't latch onto a random slide. Title overlap is weighted
// ABOVE a bare amount hit (overlap*2 vs +3) so a 2-token งาน match outranks an
// amount-only coincidence — and an amount-only best (zero title overlap) is trusted
// ONLY when that amount is unique in the deck. Several months carry the same baht
// figure, so amount-only across a multi-month deck is the wrong-month trap.
export function findSlideByContent(row, items) {
  const want = tokens(`${row.work || ''} ${row.project || ''}`);
  const amtHits = items.filter(i => i.amount != null && Math.abs(i.amount - row.amountOut) <= 1).length;
  let best = null, bestScore = 0;
  for (const item of items) {
    const overlap = [...tokens(item.title)].filter(t => want.has(t)).length;
    const amtOk = item.amount != null && Math.abs(item.amount - row.amountOut) <= 1;
    if (!amtOk && overlap < 2) continue;
    if (overlap === 0 && amtHits !== 1) continue;
    const score = overlap * 2 + (amtOk ? 3 : 0);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}

export const slideDeepLink = item =>
  `https://docs.google.com/presentation/d/${item.presId}/edit#slide=id.${item.objectId}`;

// Every "N บาท / N THB" figure in a row's text, minus TOTAL/รวม lines (those
// restate the sum) — the per-receipt amounts of a line that bundles several.
function lineAmounts(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (/total|รวม/i.test(line)) continue;
    for (const m of line.matchAll(/([\d,]+(?:\.\d+)?)\s*(?:บาท|thb)/ig)) out.push(Number(m[1].replace(/,/g, '')));
  }
  return out;
}

// A bundled row split into its own line-items: each line's text + its amount.
// Employees list one งาน per line ("… ถ่ายคอนเทนต์งานกาชาด … ค่าสินค้า (110 THB)"),
// so we can match each line to the slide that shares BOTH the amount and the
// งาน name — not just any slide that helps the total add up.
function lineItems(text = '') {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (/total|รวม/i.test(line)) continue;
    const m = line.match(/([\d,]+(?:\.\d+)?)\s*(?:บาท|thb)/i);
    if (m) out.push({ text: line, amount: Number(m[1].replace(/,/g, '')) });
  }
  return out;
}

const itemDay = i => (i.date ? `${i.date.y}-${i.date.m}-${i.date.d}` : null);
const rowPresId = row => row.slideKey ? row.slideKey.split(':')[0]
  : (String(row.evidenceUrl || '').match(/presentation\/d\/([\w-]+)/) || [])[1] || null;
function overlapsRow(row, group) {
  const want = tokens(`${row.work || ''} ${row.project || ''}`);
  return group.some(i => [...tokens(i.title)].filter(t => want.has(t)).length >= 2);
}

// One sheet row that bundles several receipts (e.g. "…อาหาร 950 / …เดินทาง 153",
// amount 1,103) has no single slide matching its total. Employees keep each งาน on
// its own "รายการที่ N" slide, and the row's Evid link lands on the FIRST slide of
// that row's own block (a consecutive run of N; a repeated N = one claim over 2
// slides). Since real decks span many months and the same title+amount recurs, a
// deck-wide amount search grabs another month's receipt (whose total still adds up,
// so the card falsely shows "✓ ยอดตรง"). We pair the row four ways, most-trustworthy
// first — this is a fraud audit, so an honest miss beats a confident wrong link:
//   A) ANCHOR WINDOW (only when the link points at a real slide): walk the block
//      forward from the anchor and pair each sheet line to a slide INSIDE that
//      block — never deck-wide. The employee's own link is ground truth for which
//      block, so a same-amount slide from another month can't be reached.
//   0) deck-wide per-item (no usable anchor): for each line, the unused slide that
//      shares its amount AND the most title overlap. HARDENED to fail rather than
//      accept a zero-title-overlap (amount-only) best — that's the wrong-month trap.
//   1) date-divider group whose slides sum to the row total — for decks that DO
//      carry "PETTY CASH <date>" dividers (the linked slide or a title overlap
//      picks which); PunPun's deck has none, other employees' do.
//   2) last resort: pair the row's bare "N บาท" figures to distinct slides by amount.
function matchMultiItem(row, allItems) {
  const presId = rowPresId(row);
  const pool = allItems.filter(i => i.amount != null && (!presId || i.presId === presId));
  if (pool.length < 2) return null;
  const linkedObj = row.slideKey ? row.slideKey.split(':')[1] : null;
  const lines = lineItems(row.work);
  let pick = null;

  // A) Anchor window — stay inside the block the employee's own link points at.
  if (linkedObj && lines.length >= 2) {
    // Deck-ordered items for this deck, INCLUDING amount-null slides: a slide whose
    // amount misparsed must not punch a hole in the block walk.
    const ordered = allItems.filter(i => !presId || i.presId === presId);
    const anchor = ordered.findIndex(i => i.objectId === linkedObj);
    if (anchor >= 0) {
      // Collect the block: a forward run of N (same N = a 2-slide claim, or N+1),
      // stopping when the run breaks; capped a little past the line count for
      // spanned slides so a title-only fallback still has room to land.
      const win = [ordered[anchor]];
      for (let k = anchor + 1; k < ordered.length && win.length < lines.length + 3; k++) {
        const cur = win[win.length - 1], nx = ordered[k];
        if (cur.no == null || nx.no == null) break;
        if (nx.no === cur.no || nx.no === cur.no + 1) win.push(nx); else break;
      }
      // Assign each line, in order, to a distinct window slide: amount ±1 first,
      // then title overlap, then window order. ONE line may pair by title/order
      // alone (its slide's amount misparsed); a second unmatched line fails the pass.
      const used = new Set(), chosen = [];
      let ok = true, fell = 0;
      for (const ln of lines) {
        const avail = win.filter(s => !used.has(s.objectId));
        if (!avail.length) { ok = false; break; }
        const want = tokens(ln.text);
        const ov = s => [...tokens(s.title)].filter(t => want.has(t)).length;
        const amtc = avail.filter(s => s.amount != null && Math.abs(s.amount - ln.amount) <= 1);
        let s, amt;
        if (amtc.length) {
          amtc.sort((a, b) => ov(b) - ov(a) || win.indexOf(a) - win.indexOf(b));
          s = amtc[0]; amt = s.amount;
        } else {
          if (fell++) { ok = false; break; }
          const rest = [...avail].sort((a, b) => ov(b) - ov(a) || win.indexOf(a) - win.indexOf(b));
          s = rest[0];
          amt = s.amount != null ? s.amount : ln.amount; // slide amount unreadable → trust the line
        }
        used.add(s.objectId); chosen.push({ ...s, amount: amt });
      }
      if (ok && Math.abs(chosen.reduce((sum, c) => sum + c.amount, 0) - row.amountOut) <= Math.max(2, lines.length)) pick = chosen;
    }
  }

  // 0) deck-wide per-item — no usable anchor, or the window didn't add up. Take,
  //    per line, the unused slide with its amount AND the most title overlap.
  if (!pick && lines.length >= 2) {
    const used = new Set(), parts = [];
    let ok = true;
    for (const it of lines) {
      const cands = pool.filter(s => !used.has(s.objectId) && Math.abs(s.amount - it.amount) <= 1);
      if (!cands.length) { ok = false; break; }
      const want = tokens(it.text);
      cands.sort((a, b) =>
        [...tokens(b.title)].filter(t => want.has(t)).length -
        [...tokens(a.title)].filter(t => want.has(t)).length);
      // A deck-wide best that shares NO งาน token is an amount-only hit — exactly
      // the cross-month receipt this module exists to reject. Fail, don't guess.
      if (![...tokens(cands[0].title)].some(t => want.has(t))) { ok = false; break; }
      used.add(cands[0].objectId); parts.push(cands[0]);
    }
    if (ok && Math.abs(parts.reduce((s, i) => s + i.amount, 0) - row.amountOut) <= Math.max(2, lines.length)) pick = parts;
  }

  // 1) date-divider group whose slides sum to the row total.
  if (!pick) {
    const groups = new Map();
    for (const i of pool) { const k = itemDay(i) || 'nd'; (groups.get(k) || groups.set(k, []).get(k)).push(i); }
    for (const g of groups.values()) {
      if (g.length < 2 || Math.abs(g.reduce((s, i) => s + i.amount, 0) - row.amountOut) > 1) continue;
      if (linkedObj && g.some(i => i.objectId === linkedObj)) { pick = g; break; }
      if (!pick && overlapsRow(row, g)) pick = g;
    }
  }

  // 2) last resort: pair the row's bare "N บาท" figures to distinct slides.
  if (!pick) {
    const amts = lineAmounts(row.work);
    if (amts.length >= 2) {
      const used = new Set(), parts = [];
      for (const a of amts) {
        const it = pool.find(i => !used.has(i.objectId) && Math.abs(i.amount - a) <= 1);
        if (it) { used.add(it.objectId); parts.push(it); }
      }
      if (parts.length === amts.length && Math.abs(parts.reduce((s, i) => s + i.amount, 0) - row.amountOut) <= 1) pick = parts;
    }
  }
  if (!pick) return null;
  return {
    status: 'match_multi', count: pick.length, slideDate: pick[0].date,
    parts: pick.map(i => ({ url: slideDeepLink(i), amount: i.amount, title: i.title })),
  };
}

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

  // A single line that bundles several receipts → match each to its own slide.
  const multi = matchMultiItem(row, allItems);
  if (multi) return multi;

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
