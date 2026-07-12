// ── Working Timeline (Google Sheets) — pure parsing + derivation ─────────────
// Patt's AE team runs one spreadsheet: one tab per client page per year
// ("🛒 2026 Protheeshop", …), one row per job. A 3-level merged header names
// the columns; the team marks a production step done by striking through its
// date, and tracks billing with five checkboxes (Send QT → … → Paid).
// Layout drifts between tabs (some insert a "No." column), so every column is
// located by header text — never by position.

// Accepts a full sheet URL or a bare spreadsheet id.
export function parseSheetId(input = '') {
  const m = String(input).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const bare = String(input).trim();
  return /^[a-zA-Z0-9_-]{20,}$/.test(bare) ? bare : null;
}

// Client-page tabs for a given year; accounting tabs are not timelines.
const SKIP_TABS = /shopee|package|boost/i;
export function pickClientTabs(props, year) {
  return (props?.sheets || [])
    .map(s => s.properties?.title || '')
    .filter(t => t.includes(String(year)) && !SKIP_TABS.test(t));
}

// Google Sheets serial date → JS Date (UTC midnight).
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
export function serialToDate(n) {
  return new Date(SHEETS_EPOCH_MS + Math.round(n) * 86400000);
}

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// Merged header cells only carry a value in their anchor column — carry the
// last seen name rightward so every column knows its group.
function fwdFill(names) {
  let last = '';
  return names.map(n => (n ? (last = n) : last));
}

const EN_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const TH_MONTHS = { 'มค': 0, 'กพ': 1, 'มีค': 2, 'เมย': 3, 'พค': 4, 'มิย': 5, 'กค': 6, 'สค': 7, 'กย': 8, 'ตค': 9, 'พย': 10, 'ธค': 11 };
function monthIndex(v) {
  const en = EN_MONTHS[norm(v).slice(0, 3)];
  if (en !== undefined) return en;
  const th = TH_MONTHS[String(v ?? '').replace(/[\s.]/g, '')];
  return th !== undefined ? th : null;
}

function dateInfo(cell) {
  const n = cell.effectiveValue?.numberValue;
  return {
    date: typeof n === 'number' ? serialToDate(n) : null,
    struck: !!cell.effectiveFormat?.textFormat?.strikethrough,
  };
}

const PRODUCTION_STEPS = [
  ['caption', 'Caption'],
  ['first', 'First Draft'],
  ['final', 'Final Draft'],
  ['approve', 'Approve'],
];
export const PAY_STEPS = [
  ['sendQT', 'ส่ง QT'],
  ['signedQT', 'เซ็น QT'],
  ['sendIV', 'ส่ง IV'],
  ['signedIV', 'เซ็น IV'],
  ['paid', 'จ่ายแล้ว'],
];

// "🐼 2026 Pandabapro" → "🐼 Pandabapro"
function shortTab(title) {
  return title.replace(/20\d{2}/, '').replace(/\s+/g, ' ').trim();
}

function parseTimelineSheet(sheet, today) {
  const title = sheet.properties?.title || '';
  const rowData = sheet.data?.[0]?.rowData || [];
  if (rowData.length < 4) return [];
  const year = Number((title.match(/20\d{2}/) || [])[0]) || null;
  const cells = r => rowData[r]?.values || [];
  const at = (row, c) => row[c] || {};

  const width = Math.max(cells(0).length, cells(1).length, cells(2).length);
  const r1 = fwdFill(Array.from({ length: width }, (_, c) => norm(at(cells(0), c).formattedValue)));
  const r2 = fwdFill(Array.from({ length: width }, (_, c) => norm(at(cells(1), c).formattedValue)));
  const r3 = Array.from({ length: width }, (_, c) => norm(at(cells(2), c).formattedValue));
  const cols = Array.from({ length: width }, (_, c) => ({ n1: r1[c], n2: r2[c], n3: r3[c] }));
  const find = pred => { const i = cols.findIndex(pred); return i === -1 ? null : i; };

  // Payment headers are English in some tabs ("Send QT") and Thai in others
  // ("ส่ง QT แล้ว", "ลูกค้าเซ็น INV แล้ว") — match by keywords under the
  // Payment group instead of exact names.
  const hasQT = n => /\bqt\b/.test(n);
  const hasIV = n => /\b(iv|inv)\b/.test(n);
  const signed = n => n.includes('signed') || n.includes('เซ็น');
  const send = n => n.includes('send') || n.includes('ส่ง');
  const inPay = c => c.n1 === 'payment';

  const col = {
    month: find(c => c.n1 === 'month'),
    client: find(c => c.n1 === 'clients'),
    ae: find(c => c.n1 === 'ae'),
    boost: find(c => c.n2 === 'client boost post'),
    caption: find(c => c.n2.startsWith('caption') && c.n3 === 'send to client'),
    first: find(c => c.n2 === 'first draft' && c.n3 === 'send to client'),
    final: find(c => c.n2 === 'final draft' && c.n3 === 'send to client'),
    approve: find(c => c.n3 === 'client approve'),
    postDate: find(c => c.n2 === 'post date'),
    postStatus: find(c => c.n2 === 'status' && c.n1.includes('final work')),
    sendQT: find(c => inPay(c) && hasQT(c.n2) && send(c.n2) && !signed(c.n2)),
    signedQT: find(c => inPay(c) && hasQT(c.n2) && signed(c.n2)),
    sendIV: find(c => inPay(c) && hasIV(c.n2) && send(c.n2) && !signed(c.n2)),
    signedIV: find(c => inPay(c) && hasIV(c.n2) && signed(c.n2)),
    paid: find(c => inPay(c) && (c.n2 === 'paid' || c.n2.includes('จ่าย'))),
  };
  if (col.client === null) return []; // not a timeline-shaped tab
  const hasPayCols = PAY_STEPS.some(([key]) => col[key] !== null);

  const jobs = [];
  let lastMonth = null; // month is often written once per group and blank below
  for (let r = 3; r < rowData.length; r++) {
    const row = cells(r);
    const client = String(at(row, col.client).formattedValue ?? '').trim();
    if (!client) continue;

    const mCell = at(row, col.month);
    let monthIdx = monthIndex(mCell.formattedValue);
    if (monthIdx === null && typeof mCell.effectiveValue?.numberValue === 'number') {
      monthIdx = serialToDate(mCell.effectiveValue.numberValue).getUTCMonth();
    }
    if (monthIdx === null && !norm(mCell.formattedValue)) monthIdx = lastMonth;
    if (monthIdx !== null) lastMonth = monthIdx;

    const steps = PRODUCTION_STEPS.map(([key, label]) => {
      const c = col[key];
      return { key, label, ...(c === null ? { date: null, struck: false } : dateInfo(at(row, c))) };
    });
    const post = col.postDate === null ? { date: null, struck: false } : dateInfo(at(row, col.postDate));
    const postConfirmed = at(row, col.postStatus).effectiveValue?.boolValue === true;

    const pay = {};
    for (const [key] of PAY_STEPS) {
      pay[key] = col[key] !== null && at(row, col[key]).effectiveValue?.boolValue === true;
    }
    // A tab without payment columns can't be chased — don't raise false alarms.
    const payMissing = hasPayCols
      ? PAY_STEPS.filter(([key]) => !pay[key]).map(([, label]) => label)
      : [];

    const posted = postConfirmed || post.struck || (post.date !== null && post.date <= today);
    const pending = steps.find(s => !s.struck && !(s.date && s.date <= today && posted));
    const currentStep = posted ? 'โพสต์แล้ว' : (pending ? pending.label : (post.date ? 'รอโพสต์' : 'เตรียมงาน'));
    const daysSincePost = posted && post.date ? Math.floor((today - post.date) / 86400000) : null;

    jobs.push({
      tab: shortTab(title), year,
      monthIdx,
      client,
      ae: String(at(row, col.ae)?.formattedValue ?? '').trim(),
      boost: String(at(row, col.boost)?.formattedValue ?? '').trim(),
      steps, post, postConfirmed, pay, payMissing,
      posted, currentStep, daysSincePost,
      billingPending: posted && payMissing.length > 0,
    });
  }
  return jobs;
}

// sheets = the `sheets` array from spreadsheets.get(includeGridData=true).
export function parseTimeline(sheets, { today = new Date() } = {}) {
  return (sheets || []).flatMap(s => parseTimelineSheet(s, today));
}

// Card-level rollup: this month's counts + the billing chase list (all months).
export function summarizeTimeline(jobs, monthIdx) {
  const inMonth = jobs.filter(j => j.monthIdx === monthIdx);
  const billing = jobs.filter(j => j.billingPending)
    .sort((a, b) => (b.daysSincePost ?? -1) - (a.daysSincePost ?? -1));
  return {
    monthTotal: inMonth.length,
    doing: inMonth.filter(j => !j.posted).length,
    posted: inMonth.filter(j => j.posted).length,
    billing,
    inMonth,
  };
}
