/**
 * KBank Make PDF Statement Parser
 * Parses password-protected KBank PDF statements in the browser using pdf.js
 *
 * Column layout (with -layout pdftotext style):
 * DD-MM-YY  HH:MM  <type>  <amount>  <balance>  <channel>  <detail>
 */

import * as pdfjsLib from 'pdfjs-dist';
// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseKBankDate(str) {
  // DD-MM-YY (CE, YY = last 2 digits of year e.g. 26 = 2026)
  const m = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `20${y}-${mo}-${d}`;
}

function parseNum(s) {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, '').trim()) || 0;
}

// ── Auto-categorize by merchant name ─────────────────────────────────────────
export function autoCategorizeThai(desc = '', txtype = '') {
  const d = desc.toLowerCase();
  if (['รับโอนเงิน', 'รับโอนเงินผ่าน qr', 'ฝากเงิน'].some(t => txtype.includes(t))) {
    return { category: 'รายรับ', type: 'income' };
  }
  if (/coffee|cafe|คาเฟ่|กาแฟ|ชาวดอย|สตาร์บัค/.test(d)) return { category: 'กาแฟ', type: 'food' };
  if (/อาหาร|ร้าน|ข้าว|หมู|ไก่|ปลา|สลัด|ชาตรามือ|เนื้อแท้|food|restaurant|เจี๊ยบ|โจนส์|มัลลิการ์|บุฟเฟ่|sizzler|the pizza/.test(d)) return { category: 'อาหาร', type: 'food' };
  if (/ttb drive|bmw leas/.test(d)) return { category: 'ค่างวดรถ', type: 'bills' };
  if (/การไฟฟ้า|ประปา|ค่าน้ำ|ค่าไฟ/.test(d)) return { category: 'ค่าสาธารณูปโภค', type: 'bills' };
  if (/true|ทรู มันนี่|ais|dtac|internet|net|phone|โทรศัพท์/.test(d)) return { category: 'โทรศัพท์ & อินเทอร์เน็ต', type: 'bills' };
  if (/โรงเรียน|school|tuition|เลิศหล้า/.test(d)) return { category: 'ค่าเรียน', type: 'bills' };
  if (/สมิติเวช|hospital|โรงพยาบาล|pharmacy|ยา|dentist|clinic/.test(d)) return { category: 'สุขภาพ', type: 'other' };
  if (/golf|กอล์ฟ|อัลไพน์|sport/.test(d)) return { category: 'กีฬา', type: 'other' };
  if (/b2s|โวลคาโน่|ซาร่า|เมกา|central|shop|มณี shop|lazada|shopee/.test(d)) return { category: 'ช้อปปิ้ง', type: 'shop' };
  if (/grab|taxi|แท็กซี่|bts|mrt|การทาง|ทางด่วน|parking|จอดรถ|expressway/.test(d)) return { category: 'เดินทาง', type: 'transport' };
  if (/ประกัน|insurance|howden/.test(d)) return { category: 'ประกัน', type: 'bills' };
  if (/ที่ดิน|land|สำนักงาน/.test(d)) return { category: 'อสังหาริมทรัพย์', type: 'other' };
  if (/โอนไป|baac|scb|ktb|kkp|tmb/.test(d)) return { category: 'โอนเงิน', type: 'other' };
  return { category: 'อื่น ๆ', type: 'other' };
}

function cleanDetail(s = '') {
  let d = s.trim();
  d = d.replace(/^เพื่อชำระ\s+Ref\s+\w+\s*/i, '');
  d = d.replace(/^โอนไป\s+(?:พร้อมเพย์\s+)?(?:\w+\s+)?X[\w\d]+\s*/i, 'โอนไป ');
  d = d.replace(/^จาก\s+(?:\w+\s+)?X[\w\d]+\s*/i, 'รับจาก ');
  return d.trim();
}

// ── PDF text extraction ───────────────────────────────────────────────────────
async function extractPdfText(arrayBuffer, password = '') {
  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    password: password || undefined,
  });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // Sort items by position (top-left to bottom-right)
    const items = content.items
      .filter(item => item.str?.trim())
      .sort((a, b) => {
        const yDiff = Math.round(b.transform[5]) - Math.round(a.transform[5]);
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.transform[4] - b.transform[4];
      });
    // Group by Y coordinate (same row)
    const rows = {};
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: item.transform[4], text: item.str });
    }
    // Build lines sorted by Y descending
    const sortedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const row = rows[y].sort((a, b) => a.x - b.x);
      fullText += row.map(r => r.text).join('  ') + '\n';
    }
    fullText += '\f'; // page break
  }
  return fullText;
}

// ── Main parser ───────────────────────────────────────────────────────────────
const TX_PATTERN = new RegExp(
  '(\\d{2}-\\d{2}-\\d{2})\\s+' +         // date DD-MM-YY
  '(\\d{2}:\\d{2})\\s+' +                  // time HH:MM
  '(ชำระเงิน|โอนเงิน|รับโอนเงิน(?:\\s*ผ่าน QR)?|ถอนเงิน|ฝากเงิน|รับเงิน)\\s+' +
  '([\\d,]+\\.?\\d*)\\s+' +               // amount
  '([\\d,]+\\.\\d{2})',                    // balance
  'g'
);

export async function parseKBankPDF(arrayBuffer, password = '', scope = 'personal') {
  const text = await extractPdfText(arrayBuffer, password);
  const lines = text.split('\n');

  // Build a map of line → rest of line (for detail extraction)
  const transactions = [];
  let match;
  TX_PATTERN.lastIndex = 0;

  // Re-run on full text for matches
  while ((match = TX_PATTERN.exec(text)) !== null) {
    const [, dateRaw, timeStr, txtype, amtStr, balStr] = match;
    const isoDate = parseKBankDate(dateRaw);
    if (!isoDate) continue;

    const amt = parseNum(amtStr);
    const isCredit = /รับโอนเงิน|ฝากเงิน|รับเงิน/.test(txtype);
    const amount = isCredit ? amt : -amt;

    // Extract detail: text after balance + channel on same logical area
    const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 200);
    // Skip channel name (MAKE by KBank, K PLUS, etc.) — grab what comes after
    const detailMatch = afterMatch.match(/(?:MAKE by KBank|K PLUS|K-Mobile Banking|Internet\/Mobile \w+|ตู้เติมเงิน[^\n]*|EDC[^\n]*|ATM[^\n]*)\s+(.*?)(?=\n|$)/);
    const rawDetail = detailMatch ? detailMatch[1] : '';
    const detail = cleanDetail(rawDetail) || txtype;
    const { category, type } = autoCategorizeThai(detail, txtype);

    transactions.push({
      title: detail,
      occurred_at: `${isoDate}T${timeStr}:00+07:00`,
      amount,
      category,
      type,
      scope,
      note: null,
      account_id: null,
    });
  }

  return transactions;
}
