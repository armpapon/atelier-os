// ── Petty Cash — audit SEAL's cash-claim sheet, person by person ─────────────
// Pat suspects padded / duplicated petty-cash claims. Her team logs every claim
// (with a Google Slides receipt link) in one spreadsheet, one tab per year. This
// page reads it read-only through provider-proxy with her own OAuth token and
// leads with PEOPLE: a card per employee (how much, how many claims, which flags
// stand out), expandable to every claim grouped by month. From there she can
// open the receipt, and — with the Slides scope — let Loop read each person's
// deck and check the sheet amount against the slide automatically ("does the
// sheet match the slide?"), recovering the exact day the slide records.
// Loop audits only; paying still happens in Make.
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  startGoogleAuth, getIntegration, updateIntegrationMeta, callProvider, ALL_GOOGLE_SCOPES,
} from '../lib/integrations.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';
import { parseSheetId } from '../lib/sheetTimeline.js';
import { parsePettyCash, deriveFlags, parseName, tabYear } from '../lib/pettyCash.js';
import { flattenSlides, parseDeck, compareRow } from '../lib/pettySlides.js';
import { parseFormResponses, reconcile, reconByPerson, destMatchInfo, payQueue } from '../lib/pettyRecon.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const GRID_FIELDS =
  'sheets(properties(title,sheetId),data(rowData(values('
  + 'formattedValue,effectiveValue,hyperlink,textFormatRuns(format/link),userEnteredValue))))';
const SLIDES_API = 'https://slides.googleapis.com/v1/presentations';
const SLIDES_FIELDS =
  'slides(objectId,pageElements(shape(text(textElements(textRun(content)))),'
  + 'table(tableRows(tableCells(text(textElements(textRun(content))))))))';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// Amounts keep their satang — the raw sheet numbers carry decimals, so show 2
// places everywhere rather than rounding them away.
const baht = n => '฿' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht2 = baht;
const presIdOf = (url = '') => (url.match(/presentation\/d\/([\w-]+)/) || [])[1] || null;

const FLAG_LABEL = {
  slideDup: 'สไลด์ซ้ำ', workDup: 'เบิกซ้ำ', reconcile: 'คงเหลือเพี้ยน', outlier: 'ยอดสูง', noEvidence: 'ไม่มีหลักฐาน',
  noSource: 'ไม่ได้กรอกฟอร์ม', formMissing: 'เบิกแล้วไม่ถึงชีท', formDup: 'ส่งฟอร์มซ้ำ', sumMismatch: 'ยอดรวมไม่ตรง',
};
// Every observation explains itself on hover — Pat shares this screen with
// people who don't know the audit rules, and a bare chip invites guessing.
const FLAG_HELP = {
  slideDup: 'สไลด์หลักฐานใบเดียวกันถูกใช้กับหลายแถว — อาจเป็นการเบิกซ้ำโดยใช้หลักฐานเดิม หรือแค่แปะลิงก์ผิด กดดูสไลด์เทียบได้',
  workDup: 'รายการและยอดเงินเหมือนกันเป๊ะ โผล่มากกว่า 1 แถว — เช็คว่าเป็นงานคนละครั้งจริง หรือเบิกซ้ำ',
  reconcile: 'ยอดคงเหลือในชีทแถวนี้ ไม่ตรงกับยอดที่คำนวณจากเงินเข้า-ออกก่อนหน้า — อาจมีการแก้ตัวเลข หรือลืมบันทึกบางรายการ',
  outlier: 'ยอดสูงผิดปกติเมื่อเทียบกับค่าเฉลี่ยการเบิกของทั้งทีม (เกินค่าเฉลี่ย + 2 เท่าของส่วนเบี่ยงเบน) — ไม่ได้แปลว่าผิด แค่ควรดูหลักฐานให้ละเอียด',
  noEvidence: 'แถวนี้ไม่มีลิงก์สไลด์และไม่มีสลิปแนบ — เบิกเงินโดยไม่มีหลักฐานประกอบ',
  noSource: 'รายการนี้อยู่ในชีทหลัก แต่หาใบเบิกจากฟอร์มของพนักงานไม่เจอ — แปลว่าถูกพิมพ์เข้าชีทตรง ๆ ไม่ผ่านฟอร์ม ควรถามพนักงานว่าเบิกจริงไหม (จุดที่ควรดูก่อนเพื่อน)',
  formMissing: 'พนักงานกดเบิกผ่านฟอร์มแล้ว แต่รายการไม่ถูกนำไปลงในชีทหลัก — ตกหล่นระหว่างทาง หรือถูกตัดออก',
  formDup: 'คนเดียวกันส่งฟอร์มยอดเท่ากัน ห่างกันไม่เกิน 3 วัน — เช็คว่าเป็น 2 งานจริง หรือกดส่งซ้ำ',
  sumMismatch: 'ยอดรวมทั้งกลุ่มที่พนักงานลงไว้ ไม่เท่ากับผลรวมของรายการย่อยที่เขียนเอง — น่าจะบวก/ลบผิด ควรตรวจสอบ เพราะยอดเงินต้องตรงเป๊ะ (กระทบยอดจ่ายจริง)',
};
const FLAG_TONE = t => (t === 'slideDup' || t === 'workDup' || t === 'noSource' || t === 'formDup' || t === 'sumMismatch') ? 'bad' : 'warn';
// Form timestamps are sheet-local values stored as-if-UTC — display with the
// UTC getters or evening submissions (after 17:00 UTC+7) show the next day.
const fmtD = d => `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };
const lbl = { fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' };

// Slide-compare results persist in localStorage so they survive a reload (the
// session cache is in-memory only) — Pat runs them once per person and expects
// them to still be there next time, not vanish on a deploy/refresh.
const slidesKey = (id, y, code) => `pc:slides2:${id}:${y}:${code}`;
function readSavedSlides(id, y) {
  const out = {}, prefix = `pc:slides2:${id}:${y}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) {
      try { out[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch { /* ignore */ }
    }
  }
  return out;
}

// rowNo → Set(flagType), plus rowNo → partner rows for the grouped dup flags.
// `recon` (optional) folds the form-source result in as one more observation.
function indexFlags(flags, recon = null) {
  const byRow = new Map();
  const partners = new Map();
  const add = (rowNo, t) => { if (!byRow.has(rowNo)) byRow.set(rowNo, new Set()); byRow.get(rowNo).add(t); };
  if (recon) for (const d of recon.destNoSource) add(d.rowNo, 'noSource');
  for (const g of flags.slideDup) g.rows.forEach(r => { add(r.rowNo, 'slideDup'); partners.set(r.rowNo, g.rows.filter(x => x.rowNo !== r.rowNo)); });
  for (const g of flags.workDup) g.rows.forEach(r => { add(r.rowNo, 'workDup'); partners.set(r.rowNo, [...(partners.get(r.rowNo) || []), ...g.rows.filter(x => x.rowNo !== r.rowNo)]); });
  for (const f of flags.reconcile) add(f.row.rowNo, 'reconcile');
  for (const r of flags.outlier) add(r.rowNo, 'outlier');
  for (const r of flags.noEvidence) add(r.rowNo, 'noEvidence');
  for (const r of (flags.sumMismatch || [])) add(r.rowNo, 'sumMismatch');
  // A row in both a slide-dup and a work-dup group with the same partner would
  // list that partner twice ("↔ กับแถว 60, 60") — keep one per rowNo.
  for (const [k, arr] of partners) {
    partners.set(k, [...new Map(arr.map(x => [x.rowNo, x])).values()]);
  }
  return { byRow, partners };
}

export function PettyCash() {
  const [integ, setInteg] = useState(undefined);
  const [urlInput, setUrlInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null); // { year, rows, flags }
  const [yearTabs, setYearTabs] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [lastSync, setLastSync] = useState(null);
  const [month, setMonth] = useState(null); // null = ทั้งปี
  const [openCode, setOpenCode] = useState(null);
  const [slidesByCode, setSlidesByCode] = useState({});
  const [comparing, setComparing] = useState(null);
  const [marks, setMarks] = useState({});
  const [formUrlInput, setFormUrlInput] = useState('');
  const [recon, setRecon] = useState(null); // reconcile() result for data.year

  const connected = !!(integ && (integ.scope || '').includes('spreadsheets'));
  const hasSlides = !!(integ && (integ.scope || '').includes('presentations'));
  const sheetId = integ?.meta?.pettycash_sheet_id || '';
  const formSheetId = integ?.meta?.pettycash_form_sheet_id || '';

  const refreshInteg = useCallback(
    () => getIntegration('google').then(i => { setInteg(i ?? null); return i; }).catch(() => { setInteg(null); return null; }),
    [],
  );

  const load = useCallback(async (id, wantYear) => {
    if (!id) return;
    setBusy(true);
    try {
      const props = await callProvider('google', { url: `${SHEETS_API}/${id}?fields=sheets.properties(title,sheetId)` });
      if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
      const titles = (props.sheets || []).map(s => s.properties?.title || '').filter(Boolean);
      // year → the real tab title, so we fetch by the actual name (which may be
      // "SEAL 2026" or "2569"), not by the bare year.
      const yearMap = new Map();
      for (const t of titles) { const y = tabYear(t); if (y != null && !yearMap.has(y)) yearMap.set(y, t); }
      const tabs = [...yearMap.keys()].sort((a, b) => b - a);
      if (!tabs.length) throw new Error(`ไม่พบแท็บรายปี (เช่น "2026" หรือ "2569") — แท็บที่เจอในชีท: ${titles.join(', ') || '(ไม่มี)'}`);
      setYearTabs(tabs);
      const y = tabs.includes(wantYear) ? wantYear : tabs[0];
      setYear(y);
      const tabTitle = yearMap.get(y);
      const grid = await callProvider('google', {
        url: `${SHEETS_API}/${id}?includeGridData=true&ranges=${encodeURIComponent(`'${tabTitle.replace(/'/g, "''")}'`)}&fields=${encodeURIComponent(GRID_FIELDS)}`,
      });
      if (grid?.error) throw new Error(grid.error.message || JSON.stringify(grid.error));
      const parsed = parsePettyCash((grid.sheets || [])[0]);
      const result = { year: y, rows: parsed.rows, flags: deriveFlags(parsed.rows) };
      setData(result); setCache(`pc:${id}:${y}`, result); setLastSync(Date.now());
      setOpenCode(null); setSlidesByCode(readSavedSlides(id, y));
      setMarks(JSON.parse(localStorage.getItem(`pc:review:${id}:${y}`) || '{}'));
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) setInteg(null);
      else alert('อ่านชีทไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const i = await refreshInteg();
      if (cancelled) return;
      const id = i?.meta?.pettycash_sheet_id;
      if (i && (i.scope || '').includes('spreadsheets') && id) {
        const y = new Date().getFullYear();
        const key = `pc:${id}:${y}`;
        if (cacheAge(key) <= STALE_MS) {
          const c = getCache(key);
          setData(c.data); setYear(c.data.year); setLastSync(c.ts);
          setSlidesByCode(readSavedSlides(id, c.data.year));
          setMarks(JSON.parse(localStorage.getItem(`pc:review:${id}:${c.data.year}`) || '{}'));
        } else { load(id, y); }
      }
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [refreshInteg, load]);

  // Read the form-responses sheet (source of truth for what employees claimed)
  // and reconcile it against the loaded year — runs by itself whenever both
  // sheets are known; no button, no separate view.
  const loadRecon = useCallback(async (fid, destData, force = false) => {
    if (!fid || !destData) { setRecon(null); return; }
    const cacheKey = `pcform:${fid}`;
    try {
      let forms;
      if (!force && cacheAge(cacheKey) <= STALE_MS) {
        forms = getCache(cacheKey).data.map(f => ({ ...f, ts: new Date(f.ts) }));
      } else {
        const props = await callProvider('google', { url: `${SHEETS_API}/${fid}?fields=sheets.properties(title)` });
        if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
        const tabs = (props.sheets || []).map(s => s.properties?.title || '');
        const tab = tabs.find(t => /form responses/i.test(t) && !/old/i.test(t)) || tabs[0];
        if (!tab) throw new Error('ไม่พบแท็บ Form Responses');
        const grid = await callProvider('google', {
          url: `${SHEETS_API}/${fid}?includeGridData=true&ranges=${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}&fields=${encodeURIComponent(GRID_FIELDS)}`,
        });
        if (grid?.error) throw new Error(grid.error.message || JSON.stringify(grid.error));
        forms = parseFormResponses((grid.sheets || [])[0]);
        if (forms.length) setCache(cacheKey, forms);
      }
      setRecon(forms.length ? reconcile(forms, destData.rows, { year: destData.year }) : null);
    } catch {
      setRecon(null); // recon is an enhancement — the sheet view must not break with it
    }
  }, []);

  useEffect(() => { loadRecon(formSheetId, data); }, [formSheetId, data, loadRecon]);

  const pickYear = (y) => {
    if (y === year && data) return;
    setMonth(null); setOpenCode(null);
    const key = `pc:${sheetId}:${y}`;
    if (cacheAge(key) <= STALE_MS) {
      const c = getCache(key); setYear(y); setData(c.data); setLastSync(c.ts);
      setSlidesByCode(readSavedSlides(sheetId, y));
      setMarks(JSON.parse(localStorage.getItem(`pc:review:${sheetId}:${y}`) || '{}'));
    } else { setYear(y); load(sheetId, y); }
  };

  const saveSheet = async () => {
    const id = parseSheetId(urlInput);
    if (!id) { alert('ลิงก์ไม่ถูกต้อง — วางลิงก์ Google Sheet ทั้งลิงก์ หรือ id ของชีท'); return; }
    const formId = formUrlInput.trim() ? parseSheetId(formUrlInput) : null;
    if (formUrlInput.trim() && !formId) { alert('ลิงก์ชีทฟอร์ม (Responses) ไม่ถูกต้อง — เว้นว่างได้ถ้ายังไม่ใช้'); return; }
    setBusy(true);
    try {
      await updateIntegrationMeta('google', {
        ...(integ?.meta || {}),
        pettycash_sheet_id: id, pettycash_sheet_url: urlInput.trim(),
        pettycash_form_sheet_id: formId || undefined,
        pettycash_form_sheet_url: formId ? formUrlInput.trim() : undefined,
      });
      await refreshInteg(); setEditing(false); setUrlInput(''); setFormUrlInput('');
      load(id, new Date().getFullYear());
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  const setMark = (rowNo, val) => {
    setMarks(prev => {
      const next = { ...prev };
      if (next[rowNo] === val) delete next[rowNo]; else next[rowNo] = val;
      localStorage.setItem(`pc:review:${sheetId}:${year}`, JSON.stringify(next));
      return next;
    });
  };

  const compareDeck = async (person) => {
    const cacheKey = `pcslides:${sheetId}:${year}:${person.code}`;
    if (cacheAge(cacheKey) <= STALE_MS) {
      setSlidesByCode(s => ({ ...s, [person.code]: getCache(cacheKey).data })); return;
    }
    setComparing(person.code);
    try {
      // Always compare the person's WHOLE year, not the month-filtered card rows
      // — the result is cached per year, and a partial run would leave other
      // months silently uncompared after the filter changes.
      const rows = (data?.rows || []).filter(r => r.isExpense && r.isEmployee && r.code === person.code);
      const presIds = [...new Set(rows.map(r => presIdOf(r.evidenceUrl)).filter(Boolean))];
      if (!presIds.length) throw new Error('คนนี้ไม่มีลิงก์สไลด์ในชีท');
      const itemsByKey = new Map();
      const allItems = [];
      for (const pid of presIds) {
        const pres = await callProvider('google', { url: `${SLIDES_API}/${pid}?fields=${encodeURIComponent(SLIDES_FIELDS)}` });
        if (pres?.error) throw new Error(pres.error.message || JSON.stringify(pres.error));
        for (const it of parseDeck(flattenSlides(pres), pid)) {
          itemsByKey.set(`${pid}:${it.objectId}`, it);
          allItems.push(it);
        }
      }
      const res = {};
      for (const r of rows) res[r.rowNo] = compareRow(r, itemsByKey, allItems);
      setSlidesByCode(s => ({ ...s, [person.code]: res }));
      setCache(cacheKey, res);
      try { localStorage.setItem(slidesKey(sheetId, year, person.code), JSON.stringify(res)); } catch { /* quota */ }
    } catch (e) { alert('อ่านสไลด์ไม่สำเร็จ: ' + (e.message || e)); }
    finally { setComparing(null); }
  };

  // ── Header actions ─────────────────────────────────────────────────────────
  const actions = connected && sheetId && !editing && (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {yearTabs.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {yearTabs.map(y => (
            <button key={y} onClick={() => pickYear(y)} style={chip(y === year)}>{y}</button>
          ))}
        </div>
      )}
      {lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>ซิงก์ {fmtSyncClock(lastSync)}</span>}
      <button onClick={() => load(sheetId, year)} disabled={busy} title="รีเฟรช"
        style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 15, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
      <button onClick={() => {
        setEditing(true);
        setUrlInput(integ?.meta?.pettycash_sheet_url || '');
        setFormUrlInput(integ?.meta?.pettycash_form_sheet_url || '');
      }} title="ตั้งค่าชีท"
        style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13, padding: 2 }}>⚙</button>
    </div>
  );

  return (
    <div className="page">
      <PageHeader eyebrow="งาน · Work" title="Petty Cash"
        sub="ตรวจเงินสดย่อยรายคน · Loop ตรวจอย่างเดียว ไม่จ่าย" actions={actions} />

      {integ === undefined ? null : !connected ? (
        <ConnectPanel />
      ) : !sheetId || editing ? (
        <SheetPanel urlInput={urlInput} setUrlInput={setUrlInput}
          formUrlInput={formUrlInput} setFormUrlInput={setFormUrlInput}
          onSave={saveSheet} busy={busy} canCancel={editing} onCancel={() => setEditing(false)} />
      ) : busy && !data ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>กำลังอ่านชีท…</div>
      ) : data ? (
        <Board data={data} recon={recon} month={month} setMonth={setMonth} openCode={openCode} setOpenCode={setOpenCode}
          slidesByCode={slidesByCode} comparing={comparing} compareDeck={compareDeck}
          hasSlides={hasSlides} marks={marks} setMark={setMark} onConnectSlides={() => startGoogleAuth(ALL_GOOGLE_SCOPES)} />
      ) : null}
    </div>
  );
}

// ── Board: month filter, tiles, person cards ─────────────────────────────────
function Board({ data, recon, month, setMonth, openCode, setOpenCode, slidesByCode, comparing, compareDeck, hasSlides, marks, setMark, onConnectSlides }) {
  const { year, rows, flags } = data;
  const { byRow, partners } = indexFlags(flags, recon);
  const perRecon = recon ? reconByPerson(recon) : new Map();
  const matchInfo = recon ? destMatchInfo(recon) : new Map();
  const inMonth = r => month == null || r.monthIdx === month;
  const tsInMonth = f => month == null || f.ts.getUTCMonth() === month;
  const pay = recon ? (() => {
    const q = payQueue(recon);
    if (month == null) return q;
    const groups = q.groups.map(g => ({ ...g, claims: g.claims.filter(tsInMonth) }))
      .filter(g => g.claims.length).map(g => ({ ...g, total: g.claims.reduce((s, c) => s + c.amount, 0) }));
    return { groups, count: groups.reduce((s, g) => s + g.claims.length, 0), total: groups.reduce((s, g) => s + g.total, 0) };
  })() : null;

  // Aggregate people from expense rows (month-filtered for the view).
  const map = new Map();
  const mk = (key, label, isEmployee) => {
    let g = map.get(key);
    if (!g) map.set(key, g = { code: key, label, isEmployee, out: 0, count: 0, rows: [], flagCounts: {}, formMissing: [], formPending: [], formDups: [] });
    return g;
  };
  for (const r of rows) {
    if (!r.isExpense || !inMonth(r)) continue;
    const g = r.isEmployee ? mk(r.code, r.label, true) : mk('__SEAL__', 'SEAL / ออฟฟิศ', false);
    g.out += r.amountOut; g.count += 1; g.rows.push(r);
    // A row Pat marked "✓ ตรง" is resolved — its observations no longer count
    // toward the person's flags, so clearing them all moves them to "เรียบร้อย".
    if (marks[r.rowNo] === 'ok') continue;
    for (const t of (byRow.get(r.rowNo) || [])) g.flagCounts[t] = (g.flagCounts[t] || 0) + 1;
  }
  // Fold in the form-side observations — including people who claimed via the
  // form but have NO sheet rows at all (they must still surface).
  for (const [code, pr] of perRecon) {
    const missing = pr.missing.filter(tsInMonth);
    const pending = pr.pending.filter(tsInMonth);
    const dups = pr.dups.filter(([a]) => tsInMonth(a));
    if (!missing.length && !pending.length && !dups.length) continue;
    const label = map.get(code)?.label
      || parseName((missing[0] || pending[0] || dups[0]?.[0])?.who || code).label;
    const g = mk(code, label, true);
    g.formMissing = missing; g.formPending = pending; g.formDups = dups;
    if (missing.length) g.flagCounts.formMissing = missing.length;
    if (dups.length) g.flagCounts.formDup = dups.length;
  }
  const people = [...map.values()];
  for (const p of people) p.flagTotal = Object.values(p.flagCounts).reduce((s, n) => s + n, 0);
  const employees = people.filter(p => p.isEmployee);
  // Two groups: people with observations first (most observations → top),
  // then the all-clear group, quieter, sorted by spend.
  const flagged = employees.filter(p => p.flagTotal > 0)
    .sort((a, b) => b.flagTotal - a.flagTotal || b.out - a.out);
  const clean = employees.filter(p => p.flagTotal === 0).sort((a, b) => b.out - a.out);
  const seal = people.find(p => !p.isEmployee);

  const shownRows = rows.filter(r => r.isExpense && inMonth(r));
  const totalOut = shownRows.reduce((s, r) => s + r.amountOut, 0);
  const flaggedCount = shownRows.filter(r => byRow.get(r.rowNo)?.size && marks[r.rowNo] !== 'ok').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Month filter */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...lbl, marginRight: 4 }}>เดือน</span>
        <button onClick={() => setMonth(null)} style={chip(month == null)}>ทั้งปี</button>
        {TH_MONTHS.map((m, i) => (
          <button key={i} onClick={() => setMonth(i)} style={chip(month === i)}>{m}</button>
        ))}
      </div>

      {/* Payout queue — who is still owed money (form col N not ticked) */}
      {pay && pay.count > 0 && <PayQueue pay={pay} />}

      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Tile v={baht(totalOut)} l={`เบิกออก · ${month == null ? year : TH_MONTHS[month]}`} />
        <Tile v={shownRows.length} l={`รายการ · ${employees.length} คน`} />
        <Tile v={flaggedCount} l="🔎 รายการมีจุดสังเกต" warn={flaggedCount > 0} />
        <Tile v={Object.keys(marks).length} l="✓ รีวิวแล้ว (รายการ)" />
      </div>

      {!hasSlides && (
        <div style={{ ...mono10, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '9px 12px', color: 'var(--ink-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>💡 เชื่อม Google Slides เพิ่ม เพื่อให้ Loop เทียบยอดในสไลด์กับชีทอัตโนมัติ</span>
          <button className="btn btn--ghost" style={{ flexShrink: 0 }} onClick={onConnectSlides}>เชื่อมสไลด์</button>
        </div>
      )}

      {/* People — grouped: observations first, all-clear below, office last */}
      {flagged.length > 0 && (
        <>
          <SectionHead icon="🔎" text={`มีจุดสังเกต · ${flagged.length} คน`} tone="warn" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {flagged.map(p => (
              <PersonCard key={p.code} p={p} open={openCode === p.code}
                onToggle={() => setOpenCode(openCode === p.code ? null : p.code)}
                slides={slidesByCode[p.code]} comparing={comparing === p.code} compareDeck={compareDeck}
                hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} matchInfo={matchInfo} />
            ))}
          </div>
        </>
      )}
      {clean.length > 0 && (
        <>
          <SectionHead icon="✓" text={`เรียบร้อย ไม่มีจุดสังเกต · ${clean.length} คน`} tone="ok" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {clean.map(p => (
              <PersonCard key={p.code} p={p} open={openCode === p.code}
                onToggle={() => setOpenCode(openCode === p.code ? null : p.code)}
                slides={slidesByCode[p.code]} comparing={comparing === p.code} compareDeck={compareDeck}
                hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} matchInfo={matchInfo} />
            ))}
          </div>
        </>
      )}
      {seal && (
        <>
          <SectionHead icon="🏢" text="บริษัท / ออฟฟิศ" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            <PersonCard p={seal} open={openCode === seal.code}
              onToggle={() => setOpenCode(openCode === seal.code ? null : seal.code)}
              slides={slidesByCode[seal.code]} comparing={comparing === seal.code} compareDeck={compareDeck}
              hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} matchInfo={matchInfo} isSeal />
          </div>
        </>
      )}

      <div style={{ fontSize: 12, color: 'var(--ink-3)', borderTop: '1px dashed var(--line-2)', paddingTop: 12, lineHeight: 1.7 }}>
        <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Loop แค่ตรวจ ไม่จ่าย</b> · กดการ์ดคนเพื่อดูทุกการเบิก + หลักฐาน ·
        {recon?.coverage && <> เทียบกับใบเบิกฟอร์มอัตโนมัติ (ฟอร์มเริ่มใช้ {TH_MONTHS[recon.coverage.m]} {recon.coverage.y} — ก่อนหน้านั้นไม่ตัดสิน "ไม่ได้กรอกฟอร์ม") ·</>}
        {' '}ปุ่ม ✓/✗ เก็บในเครื่องนี้ (ย้ายขึ้นฐานข้อมูลภายหลังได้)
      </div>
    </div>
  );
}

function PersonCard({ p, open, onToggle, slides, comparing, compareDeck, hasSlides, byRow, partners, marks, setMark, month, matchInfo, isSeal }) {
  const avatar = (p.label || '?').trim()[0] || '?';
  const border = p.flagTotal > 0 ? 'var(--danger)' : (isSeal ? 'var(--line)' : 'var(--profit)');
  const reviewed = p.rows.filter(r => marks[r.rowNo]).length;

  // Busiest month (over the person's shown rows).
  const perMonth = {};
  for (const r of p.rows) if (r.monthIdx != null) perMonth[r.monthIdx] = (perMonth[r.monthIdx] || 0) + r.amountOut;
  const top = Object.entries(perMonth).sort((a, b) => b[1] - a[1])[0];

  return (
    <div style={{ gridColumn: open ? '1 / -1' : 'auto', background: 'var(--surface)', border: `1px solid ${open ? 'var(--accent)' : 'var(--line)'}`, borderLeft: `3px solid ${border}`, borderRadius: '0 var(--r-md) var(--r-md) 0', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 500, background: isSeal ? 'var(--surface-2)' : 'var(--accent-soft)', color: isSeal ? 'var(--ink-3)' : 'var(--accent-strong)' }}>{avatar}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>{isSeal ? 'ค่าใช้จ่ายบริษัท' : p.code}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 16, fontWeight: 500 }}>{baht(p.out)}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.count} รายการ</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.flagTotal === 0
            ? <FlagChip tone="ok"
              label={isSeal ? 'ค่าใช้จ่ายส่วนกลาง — ไม่ตรวจรายคน' : '✓ เรียบร้อย'}
              help={isSeal
                ? 'ค่าใช้จ่ายของบริษัทเอง ไม่ได้เบิกในนามพนักงาน — Loop จึงไม่ตรวจจุดสังเกตรายคนให้ แต่กดเข้าไปดูรายการได้'
                : 'สแกนทุกรายการของคนนี้แล้ว ไม่เข้าเงื่อนไขจุดสังเกตข้อไหนเลย — ไม่ได้แปลว่าการันตีว่าถูกต้อง แค่ไม่มีอะไรผิดสังเกตเท่าที่ระบบตรวจได้ ยังเปิดดูหลักฐานเองได้'} />
            : Object.entries(p.flagCounts).map(([t, n]) => <FlagChip key={t} type={t} count={n} />)}
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{top ? `เบิกเยอะสุด: ${TH_MONTHS[top[0]]} (${baht(top[1])})` : ''}{reviewed > 0 ? ` · รีวิว ${reviewed}/${p.count}` : ''}</span>
          <b style={{ color: 'var(--accent-strong)', fontWeight: 500 }}>{open ? 'ย่อ ▴' : 'ดูรายละเอียด ›'}</b>
        </div>
      </button>

      {open && (
        <PersonDetail p={p} slides={slides} comparing={comparing} compareDeck={compareDeck}
          hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} matchInfo={matchInfo} isSeal={isSeal} />
      )}
    </div>
  );
}

function PersonDetail({ p, slides, comparing, compareDeck, hasSlides, byRow, partners, marks, setMark, month, matchInfo, isSeal }) {
  // Group rows by month; respect the month filter.
  const byMonth = {};
  for (const r of p.rows) { const k = r.monthIdx ?? -1; (byMonth[k] || (byMonth[k] = [])).push(r); }
  const monthKeys = Object.keys(byMonth).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {hasSlides && !isSeal && (
        <div style={{ padding: '10px 14px', background: 'var(--background-soft)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            {slides
              ? (() => {
                const v = Object.values(slides);
                const n = st => v.filter(s => s.status === st).length;
                return `เทียบสไลด์แล้ว — ${n('amount_mismatch')} ยอดไม่ตรง · ${n('wrong_link')} ลิงก์ผิดจุด · ${n('not_found')} หาไม่เจอ`;
              })()
              : 'ให้ Loop อ่านเด็คของคนนี้แล้วเทียบยอดในสไลด์กับชีท'}
          </span>
          <button className="btn btn--ghost" disabled={comparing} onClick={() => compareDeck(p)} style={{ flexShrink: 0 }}>
            {comparing ? 'กำลังอ่านสไลด์…' : (slides ? '↻ เทียบใหม่' : '🔍 เทียบกับสไลด์')}
          </button>
        </div>
      )}
      {monthKeys.map(mk => (
        <div key={mk}>
          <div style={{ padding: '5px 14px', background: 'var(--surface-2)', ...mono10, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>{mk === -1 ? 'ไม่ระบุเดือน' : TH_MONTHS[mk]} · {byMonth[mk].length} รายการ</span>
            <span>{baht(byMonth[mk].reduce((s, r) => s + r.amountOut, 0))}</span>
          </div>
          {byMonth[mk].map(r => (
            <ClaimRow key={r.rowNo} r={r} flagsSet={byRow.get(r.rowNo)} partners={partners.get(r.rowNo)}
              cmp={slides?.[r.rowNo]} formMatch={matchInfo?.get(r.rowNo)} mark={marks[r.rowNo]} setMark={setMark} isSeal={isSeal} />
          ))}
        </div>
      ))}

      {/* Form-side observations — these have no sheet row to sit on */}
      {(p.formMissing?.length > 0 || p.formPending?.length > 0 || p.formDups?.length > 0) && (
        <div>
          <div style={{ padding: '5px 14px', background: 'var(--danger-soft)', ...mono10, color: '#8a3a2c', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            🧾 ใบเบิกจากฟอร์มที่ยังไม่อยู่ในชีท
          </div>
          {p.formDups?.map(([a, b], i) => (
            <FormRow key={`d${i}`} tone="bad" tag="ส่งฟอร์มซ้ำ" help={FLAG_HELP.formDup}
              left={`${fmtD(a.ts)} และ ${fmtD(b.ts)}`} main={a.detail || b.detail} amt={a.amount} url={a.slideUrl || b.slideUrl} />
          ))}
          {p.formMissing?.map(f => (
            <FormRow key={f.formRow} tone="bad" tag="ไม่ถึงชีท" help={FLAG_HELP.formMissing}
              left={`ส่งฟอร์ม ${fmtD(f.ts)}${f.paid ? ' · ทำจ่ายแล้ว ✓' : ''}`} main={f.detail} amt={f.amount} url={f.slideUrl} />
          ))}
          {p.formPending?.map(f => (
            <FormRow key={f.formRow} tone="dim" tag="รอลงชีท" help="พนักงานเพิ่งส่งฟอร์มไม่เกิน 21 วัน และยังไม่ถูกนำไปลงชีทหลัก — ปกติของรอบทำจ่าย ยังไม่นับว่าตกหล่น"
              left={`ส่งฟอร์ม ${fmtD(f.ts)}`} main={f.detail} amt={f.amount} url={f.slideUrl} />
          ))}
        </div>
      )}
    </div>
  );
}

function PayQueue({ pay }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: '1px solid var(--warning)', borderLeft: '3px solid var(--warning)', borderRadius: '0 var(--r-md) var(--r-md) 0', background: 'var(--warning-soft)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-strong)' }}>🕐 รอทำจ่าย</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--accent-strong)' }}>{pay.count} ใบ · {baht(pay.total)}</span>
        <span style={{ fontSize: 11.5, color: 'var(--ink-3)', flex: 1 }}>— ยังไม่ติ๊ก "ทำจ่ายแล้ว" ในฟอร์ม · ไปทำจ่ายใน Make</span>
        <span style={{ color: 'var(--accent-strong)', fontSize: 12 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--warning)', background: 'var(--surface)' }}>
          {pay.groups.map(g => (
            <div key={g.code}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', background: 'var(--background-soft)', ...mono10, letterSpacing: '0.1em' }}>
                <span>{parseName(g.who).label} · {g.claims.length} ใบ</span>
                <span>{baht(g.total)}</span>
              </div>
              {g.claims.map(c => (
                <div key={c.formRow} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...mono10, marginBottom: 2 }}>ส่งฟอร์ม {fmtD(c.ts)}</div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(c.detail || '—').replace(/\s+/g, ' ')}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13.5, fontWeight: 500 }}>{baht2(c.amount)}</div>
                    {c.slideUrl && <a href={c.slideUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent-strong)', textDecoration: 'none' }}>ดูสไลด์ ↗</a>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FormRow({ tone, tag, help, left, main, amt, url }) {
  const dim = tone === 'dim';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 14px', borderTop: '1px solid var(--line)', opacity: dim ? 0.65 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono10, marginBottom: 2 }}>{left}</div>
        <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(main || '—').replace(/\s+/g, ' ')}</div>
        <div style={{ marginTop: 4 }}>
          <FlagChip tone={dim ? 'warn' : 'bad'} label={tag} help={help} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13.5, fontWeight: 500 }}>{baht2(amt)}</div>
        {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent-strong)', textDecoration: 'none' }}>ดูสไลด์ ↗</a>}
      </div>
    </div>
  );
}

function ClaimRow({ r, flagsSet, partners, cmp, formMatch, mark, setMark, isSeal }) {
  const cmpView = compareView(cmp);
  const bg = cmp?.status === 'amount_mismatch' ? '#fdf3f0' : (mark === 'no' ? '#fdf3f0' : 'transparent');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', borderTop: '1px solid var(--line)', background: bg }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono10, marginBottom: 2 }}>
          แถว {r.rowNo}{r.project ? ` · ${r.project}` : ''}
          {cmp?.slideDate ? ` · สไลด์ลงวันที่ ${cmp.slideDate.d}/${cmp.slideDate.m + 1}` : ''}
          {formMatch?.ts && <span style={{ color: '#3c5c3b' }}> · ✓ ใบเบิกฟอร์ม {fmtD(formMatch.ts)}</span>}
          {formMatch && (formMatch.paid
            ? <span style={{ color: '#3c5c3b' }}> · จ่ายแล้ว ✓</span>
            : <span style={{ color: 'var(--accent-strong)' }}> · รอทำจ่าย</span>)}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work || '—'}</div>
        {r.sumMismatch && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>
            ⚠ พนักงานลงยอดรวม {baht(r.sumMismatch.recorded)} · รวมรายการย่อยได้ {baht(r.sumMismatch.itemsSum)}
            {' '}({r.sumMismatch.diff > 0 ? 'ลงเกิน' : 'ลงขาด'} {baht(Math.abs(r.sumMismatch.diff))})
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, opacity: mark === 'ok' ? 0.45 : 1 }}>
          {mark === 'ok' && (flagsSet?.size || cmpView) && (
            <span style={{ ...mono10, alignSelf: 'center', color: '#3c5c3b' }}>ตรวจแล้ว ✓</span>
          )}
          {[...(flagsSet || [])].map(t => <FlagChip key={t} type={t} />)}
          {partners && partners.length > 0 && (flagsSet?.has('slideDup') || flagsSet?.has('workDup')) && (
            <span style={{ ...mono10, alignSelf: 'center' }}>↔ กับแถว {partners.map(x => x.rowNo).join(', ')}</span>
          )}
          {cmpView && <FlagChip tone={cmpView.tone} label={cmpView.text} help={cmpView.help} />}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 500 }}>{baht2(r.amountOut)}</div>
        {cmp?.parts ? (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            {cmp.parts.map((p, i) => (
              <a key={i} href={p.url} target="_blank" rel="noreferrer" title={p.title}
                style={{ fontSize: 11.5, color: '#3c5c3b', textDecoration: 'none', border: '1px solid var(--profit, #5b8a5a)', borderRadius: 'var(--r-sm)', padding: '3px 9px', background: 'var(--profit-soft, #dbe7d3)', whiteSpace: 'nowrap' }}>สไลด์ {baht(p.amount)} ↗</a>
            ))}
          </span>
        ) : cmp?.fixedUrl ? (
          <span style={{ display: 'flex', gap: 5 }}>
            <a href={cmp.fixedUrl} target="_blank" rel="noreferrer" title={cmp.fixedTitle}
              style={{ fontSize: 11.5, color: '#3c5c3b', textDecoration: 'none', border: '1px solid var(--profit, #5b8a5a)', borderRadius: 'var(--r-sm)', padding: '3px 9px', background: 'var(--profit-soft, #dbe7d3)', whiteSpace: 'nowrap' }}>สไลด์ที่ใช่ ↗</a>
            {r.evidenceUrl && <a href={r.evidenceUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 11.5, color: 'var(--ink-3)', textDecoration: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '3px 9px', background: 'var(--surface)', whiteSpace: 'nowrap' }}>ลิงก์เดิม ↗</a>}
          </span>
        ) : r.evidenceUrl
          ? <a href={r.evidenceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: 'var(--accent-strong)', textDecoration: 'none', border: '1px solid var(--accent-soft)', borderRadius: 'var(--r-sm)', padding: '3px 9px', background: 'var(--surface)', whiteSpace: 'nowrap' }}>ดูสไลด์ ↗</a>
          : r.slip ? <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>สลิป: {r.slip.slice(0, 16)}</span>
            : <span style={{ fontSize: 11, color: 'var(--danger)' }}>ไม่มีลิงก์</span>}
        {!isSeal && (
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={() => setMark(r.rowNo, 'ok')} style={markBtn(mark === 'ok', 'ok')}>✓ ตรง</button>
            <button onClick={() => setMark(r.rowNo, 'no')} style={markBtn(mark === 'no', 'no')}>✗ ไม่ตรง</button>
          </div>
        )}
      </div>
    </div>
  );
}

function compareView(cmp) {
  if (!cmp) return null;
  switch (cmp.status) {
    case 'match': return { tone: 'ok', text: '✓ ยอดตรงสไลด์', help: 'ยอดที่เขียนในสไลด์หลักฐาน ตรงกับยอดที่เบิกในชีท (ต่างกันไม่เกิน 1 บาท)' };
    case 'match_multi': return { tone: 'ok', text: `✓ ยอดตรงสไลด์ (รวม ${cmp.count} ใบ)`, help: 'แถวนี้รวมหลายรายการไว้ในบรรทัดเดียว — Loop จับคู่ยอดย่อยแต่ละอันกับสไลด์คนละใบในเด็คแล้ว ผลรวมตรงกับยอดที่เบิก · กดดูสไลด์แต่ละใบได้ทางขวา' };
    case 'wrong_link': return { tone: 'bad', text: '🔗 ลิงก์ในชีทชี้ผิดจุด — Loop หาสไลด์ที่ใช่ให้แล้ว', help: 'ลิงก์ที่กรอกในชีทเปิดไปเจอสไลด์ที่ไม่ใช่ของรายการนี้ — Loop ไล่หาในเด็คแล้วเจอสไลด์ที่ชื่องานและยอดตรงกัน กดปุ่ม "สไลด์ที่ใช่" เพื่อไปดูใบจริง' };
    case 'content_match': return { tone: 'ok', text: '✓ เจอสไลด์จากเนื้อหา (ลิงก์เดิมไม่เจาะจง)', help: 'ลิงก์ในชีทชี้แค่ไฟล์เด็คทั้งใบ ไม่ได้เจาะจงสไลด์ — Loop หาสไลด์ที่ตรงจากชื่องาน+ยอดให้แล้ว กด "สไลด์ที่ใช่" ได้เลย' };
    case 'amount_mismatch': return { tone: 'bad', text: `⚠ สไลด์ ${baht2(cmp.slideAmount)} ≠ ชีท ${baht2(cmp.sheetAmount)}`, help: 'ยอดที่เขียนในสไลด์หลักฐาน ไม่ตรงกับยอดที่เบิกจริงในชีท — เปิดสไลด์เทียบว่าฝั่งไหนถูก' };
    case 'no_amount': return { tone: 'warn', text: 'อ่านยอดในสไลด์ไม่ได้', help: 'เจอสไลด์ของรายการนี้แล้ว แต่ Loop อ่านตัวเลขยอดในสไลด์ไม่ออก (อาจเป็นรูปภาพหรือเขียนคนละรูปแบบ) — ต้องเปิดดูเอง' };
    case 'not_found': return { tone: 'warn', text: '⛔ หาสไลด์ของรายการนี้ไม่เจอ', help: 'ไล่ทั้งเด็คของคนนี้แล้วไม่เจอสไลด์ที่ตรงกับรายการนี้ — อาจยังไม่ได้ทำสไลด์ หรือเขียนชื่องาน/ยอดต่างจากในชีทมาก' };
    default: return null;
  }
}

// ── Setup states ─────────────────────────────────────────────────────────────
function ConnectPanel() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14, lineHeight: 1.6 }}>
        เชื่อม Google เพื่ออ่านชีท Petty Cash + สไลด์หลักฐานของทีม (อ่านอย่างเดียว)
      </div>
      <button className="btn btn--ghost" onClick={() => startGoogleAuth(ALL_GOOGLE_SCOPES)}>📋 เชื่อม Google</button>
    </div>
  );
}

function SheetPanel({ urlInput, setUrlInput, formUrlInput, setFormUrlInput, onSave, busy, canCancel, onCancel }) {
  const inputStyle = { width: '100%', padding: '9px 10px', fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--f-mono)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>1 · ชีทหลัก "Petty Cash" (ต้องมีแท็บรายปี เช่น 2026)</div>
        <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..." style={inputStyle} />
      </div>
      <div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 6 }}>
          2 · ชีทฟอร์ม "(Responses)" ที่พนักงานกดเบิก <span style={{ color: 'var(--ink-4)' }}>(ไม่ใส่ก็ได้ — ใส่แล้ว Loop เทียบใบเบิกให้อัตโนมัติ)</span>
        </div>
        <input value={formUrlInput} onChange={e => setFormUrlInput(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..." style={inputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost" onClick={onSave} disabled={busy || !urlInput.trim()}>{busy ? 'กำลังบันทึก…' : '✓ บันทึก'}</button>
        {canCancel && <button className="btn btn--ghost" onClick={onCancel}>ยกเลิก</button>}
      </div>
    </div>
  );
}

// A "?" that explains the chip it sits in. Fixed-positioned so it escapes the
// card's overflow:hidden, clamped to the viewport, and tap-toggleable (the
// chips live inside the card's toggle button, so clicks must not bubble).
function HelpTip({ text }) {
  const [pos, setPos] = useState(null);
  const place = (el) => {
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150) });
  };
  return (
    <>
      <span
        role="button" tabIndex={0} aria-label="คำอธิบาย"
        onMouseEnter={e => place(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
        onClick={e => { e.stopPropagation(); e.preventDefault(); pos ? setPos(null) : place(e.currentTarget); }}
        style={{
          marginLeft: 5, width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
          border: '1px solid currentColor', opacity: 0.5, cursor: 'help',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, lineHeight: 1, fontFamily: 'var(--f-mono)',
        }}>?</span>
      {pos && (
        <div style={{
          position: 'fixed', top: pos.top - 10, left: pos.left,
          transform: 'translate(-50%, -100%)', zIndex: 1000, pointerEvents: 'none',
          width: 'max-content', maxWidth: 290, padding: '9px 11px',
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.13)',
          fontSize: 12, lineHeight: 1.65, fontWeight: 400, textAlign: 'left', whiteSpace: 'normal',
        }}>{text}</div>
      )}
    </>
  );
}

function FlagChip({ type, count, tone, label, help }) {
  const t = label ?? FLAG_LABEL[type];
  const h = help ?? FLAG_HELP[type];
  return (
    <span style={{ ...statStyle(tone ?? FLAG_TONE(type)), display: 'inline-flex', alignItems: 'center' }}>
      {t}{count != null ? ` ${count}` : ''}
      {h && <HelpTip text={h} />}
    </span>
  );
}

function SectionHead({ icon, text, tone }) {
  const color = tone === 'warn' ? 'var(--accent-strong)' : tone === 'ok' ? '#3c5c3b' : 'var(--ink-3)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ ...lbl, color }}>{icon} {text}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

function Tile({ v, l, warn }) {
  return (
    <div style={{ background: warn ? 'var(--warning-soft)' : 'var(--surface)', border: `1px solid ${warn ? 'var(--warning)' : 'var(--line)'}`, borderRadius: 'var(--r-md)', padding: '13px 14px' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 500, color: warn ? 'var(--accent-strong)' : 'var(--ink)' }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{l}</div>
    </div>
  );
}

// ── Small style helpers ──────────────────────────────────────────────────────
function chip(on) {
  return {
    fontFamily: 'var(--f-mono)', fontSize: 12, padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
    background: on ? 'var(--warning-soft)' : 'var(--surface)',
    color: on ? 'var(--accent-strong)' : 'var(--ink-3)',
  };
}
const STAT = {
  ok: { bg: 'var(--profit-soft, #dbe7d3)', fg: '#3c5c3b', bd: 'var(--profit, #5b8a5a)' },
  bad: { bg: 'var(--danger-soft)', fg: '#8a3a2c', bd: 'var(--danger)' },
  warn: { bg: 'var(--warning-soft)', fg: 'var(--accent-strong)', bd: 'var(--warning)' },
};
function statStyle(tone) {
  const s = STAT[tone] || STAT.warn;
  return { fontSize: 11, padding: '2px 9px', borderRadius: 99, background: s.bg, color: s.fg, border: `1px solid ${s.bd}` };
}
function markBtn(on, kind) {
  const c = kind === 'ok' ? { bg: 'var(--profit-soft, #dbe7d3)', fg: '#3c5c3b', bd: 'var(--profit, #5b8a5a)' } : { bg: 'var(--danger-soft)', fg: '#8a3a2c', bd: 'var(--danger)' };
  return {
    fontSize: 11, padding: '3px 9px', borderRadius: 99, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${on ? c.bd : 'var(--line)'}`, background: on ? c.bg : 'var(--surface)', color: on ? c.fg : 'var(--ink-3)',
  };
}
