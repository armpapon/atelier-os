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
import { parsePettyCash, deriveFlags } from '../lib/pettyCash.js';
import { flattenSlides, parseDeck, compareRow } from '../lib/pettySlides.js';
import { parseFormResponses, reconcile } from '../lib/pettyRecon.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const GRID_FIELDS =
  'sheets(properties(title,sheetId),data(rowData(values('
  + 'formattedValue,effectiveValue,hyperlink,textFormatRuns(format/link),userEnteredValue))))';
const SLIDES_API = 'https://slides.googleapis.com/v1/presentations';
const SLIDES_FIELDS =
  'slides(objectId,pageElements(shape(text(textElements(textRun(content)))),'
  + 'table(tableRows(tableCells(text(textElements(textRun(content))))))))';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const baht = n => '฿' + Math.round(n).toLocaleString('en-US');
const baht2 = n => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const presIdOf = (url = '') => (url.match(/presentation\/d\/([\w-]+)/) || [])[1] || null;

const FLAG_LABEL = { slideDup: 'สไลด์ซ้ำ', workDup: 'เบิกซ้ำ', reconcile: 'คงเหลือเพี้ยน', outlier: 'ยอดสูง', noEvidence: 'ไม่มีหลักฐาน' };
const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };
const lbl = { fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' };

// rowNo → Set(flagType), plus rowNo → partner rows for the grouped dup flags.
function indexFlags(flags) {
  const byRow = new Map();
  const partners = new Map();
  const add = (rowNo, t) => { if (!byRow.has(rowNo)) byRow.set(rowNo, new Set()); byRow.get(rowNo).add(t); };
  for (const g of flags.slideDup) g.rows.forEach(r => { add(r.rowNo, 'slideDup'); partners.set(r.rowNo, g.rows.filter(x => x.rowNo !== r.rowNo)); });
  for (const g of flags.workDup) g.rows.forEach(r => { add(r.rowNo, 'workDup'); partners.set(r.rowNo, [...(partners.get(r.rowNo) || []), ...g.rows.filter(x => x.rowNo !== r.rowNo)]); });
  for (const f of flags.reconcile) add(f.row.rowNo, 'reconcile');
  for (const r of flags.outlier) add(r.rowNo, 'outlier');
  for (const r of flags.noEvidence) add(r.rowNo, 'noEvidence');
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
  const [mode, setMode] = useState('people'); // 'people' | 'recon'

  const connected = !!(integ && (integ.scope || '').includes('spreadsheets'));
  const hasSlides = !!(integ && (integ.scope || '').includes('presentations'));
  const sheetId = integ?.meta?.pettycash_sheet_id || '';

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
      const tabs = (props.sheets || []).map(s => s.properties?.title || '')
        .filter(t => /^\s*20\d{2}\s*$/.test(t)).map(t => Number(t.trim())).sort((a, b) => b - a);
      if (!tabs.length) throw new Error('ไม่พบแท็บรายปี (เช่น "2026") ในชีทนี้');
      setYearTabs(tabs);
      const y = tabs.includes(wantYear) ? wantYear : tabs[0];
      setYear(y);
      const grid = await callProvider('google', {
        url: `${SHEETS_API}/${id}?includeGridData=true&ranges=${encodeURIComponent(`'${y}'`)}&fields=${encodeURIComponent(GRID_FIELDS)}`,
      });
      if (grid?.error) throw new Error(grid.error.message || JSON.stringify(grid.error));
      const parsed = parsePettyCash((grid.sheets || [])[0]);
      const result = { year: y, rows: parsed.rows, flags: deriveFlags(parsed.rows) };
      setData(result); setCache(`pc:${id}:${y}`, result); setLastSync(Date.now());
      setOpenCode(null); setSlidesByCode({});
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
          setMarks(JSON.parse(localStorage.getItem(`pc:review:${id}:${c.data.year}`) || '{}'));
        } else { load(id, y); }
      }
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [refreshInteg, load]);

  const pickYear = (y) => {
    if (y === year && data) return;
    setMonth(null); setOpenCode(null);
    const key = `pc:${sheetId}:${y}`;
    if (cacheAge(key) <= STALE_MS) {
      const c = getCache(key); setYear(y); setData(c.data); setLastSync(c.ts);
      setMarks(JSON.parse(localStorage.getItem(`pc:review:${sheetId}:${y}`) || '{}'));
    } else { setYear(y); load(sheetId, y); }
  };

  const saveSheet = async () => {
    const id = parseSheetId(urlInput);
    if (!id) { alert('ลิงก์ไม่ถูกต้อง — วางลิงก์ Google Sheet ทั้งลิงก์ หรือ id ของชีท'); return; }
    setBusy(true);
    try {
      await updateIntegrationMeta('google', { ...(integ?.meta || {}), pettycash_sheet_id: id, pettycash_sheet_url: urlInput.trim() });
      await refreshInteg(); setEditing(false); setUrlInput('');
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
      const presIds = [...new Set(person.rows.map(r => presIdOf(r.evidenceUrl)).filter(Boolean))];
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
      for (const r of person.rows) if (r.isExpense) res[r.rowNo] = compareRow(r, itemsByKey, allItems);
      setSlidesByCode(s => ({ ...s, [person.code]: res }));
      setCache(cacheKey, res);
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
      <button onClick={() => { setEditing(true); setUrlInput(integ?.meta?.pettycash_sheet_url || ''); }} title="เปลี่ยนชีท"
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
        <SheetPanel urlInput={urlInput} setUrlInput={setUrlInput} onSave={saveSheet} busy={busy}
          canCancel={editing} onCancel={() => setEditing(false)} />
      ) : busy && !data ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>กำลังอ่านชีท…</div>
      ) : data ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button style={chip(mode === 'people')} onClick={() => setMode('people')}>👤 รายคน</button>
            <button style={chip(mode === 'recon')} onClick={() => setMode('recon')}>⇄ ต้นทาง ↔ ปลายทาง</button>
          </div>
          {mode === 'people' ? (
            <Board data={data} month={month} setMonth={setMonth} openCode={openCode} setOpenCode={setOpenCode}
              slidesByCode={slidesByCode} comparing={comparing} compareDeck={compareDeck}
              hasSlides={hasSlides} marks={marks} setMark={setMark} onConnectSlides={() => startGoogleAuth(ALL_GOOGLE_SCOPES)} />
          ) : (
            <ReconView integ={integ} refreshInteg={refreshInteg} data={data} />
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Board: month filter, tiles, person cards ─────────────────────────────────
function Board({ data, month, setMonth, openCode, setOpenCode, slidesByCode, comparing, compareDeck, hasSlides, marks, setMark, onConnectSlides }) {
  const { year, rows, flags } = data;
  const { byRow, partners } = indexFlags(flags);
  const inMonth = r => month == null || r.monthIdx === month;

  // Aggregate people from expense rows (month-filtered for the view).
  const map = new Map();
  for (const r of rows) {
    if (!r.isExpense || !inMonth(r)) continue;
    const key = r.isEmployee ? r.code : '__SEAL__';
    let g = map.get(key);
    if (!g) map.set(key, g = { code: key, label: r.isEmployee ? r.label : 'SEAL / ออฟฟิศ', isEmployee: r.isEmployee, out: 0, count: 0, rows: [], months: new Set(), flagCounts: {} });
    g.out += r.amountOut; g.count += 1; g.rows.push(r); if (r.monthIdx != null) g.months.add(r.monthIdx);
    for (const t of (byRow.get(r.rowNo) || [])) g.flagCounts[t] = (g.flagCounts[t] || 0) + 1;
  }
  const people = [...map.values()];
  for (const p of people) p.flagTotal = Object.values(p.flagCounts).reduce((s, n) => s + n, 0);
  const employees = people.filter(p => p.isEmployee).sort((a, b) => b.out - a.out);
  const seal = people.find(p => !p.isEmployee);

  const shownRows = rows.filter(r => r.isExpense && inMonth(r));
  const totalOut = shownRows.reduce((s, r) => s + r.amountOut, 0);
  const flaggedCount = shownRows.filter(r => byRow.has(r.rowNo)).length;

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

      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Tile v={baht(totalOut)} l={`เบิกออก · ${month == null ? year : TH_MONTHS[month]}`} />
        <Tile v={shownRows.length} l={`รายการ · ${employees.length} คน`} />
        <Tile v={flaggedCount} l="🚩 รายการติดธง" warn={flaggedCount > 0} />
        <Tile v={Object.keys(marks).length} l="✓ รีวิวแล้ว (รายการ)" />
      </div>

      {!hasSlides && (
        <div style={{ ...mono10, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '9px 12px', color: 'var(--ink-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span>💡 เชื่อม Google Slides เพิ่ม เพื่อให้ Loop เทียบยอดในสไลด์กับชีทอัตโนมัติ</span>
          <button className="btn btn--ghost" style={{ flexShrink: 0 }} onClick={onConnectSlides}>เชื่อมสไลด์</button>
        </div>
      )}

      {/* People */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {employees.map(p => (
          <PersonCard key={p.code} p={p} open={openCode === p.code}
            onToggle={() => setOpenCode(openCode === p.code ? null : p.code)}
            slides={slidesByCode[p.code]} comparing={comparing === p.code} compareDeck={compareDeck}
            hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} />
        ))}
        {seal && (
          <PersonCard p={seal} open={openCode === seal.code}
            onToggle={() => setOpenCode(openCode === seal.code ? null : seal.code)}
            slides={slidesByCode[seal.code]} comparing={comparing === seal.code} compareDeck={compareDeck}
            hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} isSeal />
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', borderTop: '1px dashed var(--line-2)', paddingTop: 12, lineHeight: 1.7 }}>
        <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Loop แค่ตรวจ ไม่จ่าย</b> · กดการ์ดคนเพื่อดูทุกการเบิก + หลักฐาน ·
        {flags.deckLevelCount > 0 && <> {flags.deckLevelCount} แถวใช้ลิงก์ระดับเด็ค (เทียบสไลด์อัตโนมัติไม่ได้) ·</>}
        {' '}ปุ่ม ✓/✗ เก็บในเครื่องนี้ (ย้ายขึ้นฐานข้อมูลภายหลังได้)
      </div>
    </div>
  );
}

function PersonCard({ p, open, onToggle, slides, comparing, compareDeck, hasSlides, byRow, partners, marks, setMark, month, isSeal }) {
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
            ? <span style={statStyle('ok')}>{isSeal ? 'ไม่ตรวจธงรายคน' : '✓ ไม่มีธง'}</span>
            : Object.entries(p.flagCounts).map(([t, n]) => (
              <span key={t} style={statStyle(t === 'noEvidence' || t === 'outlier' || t === 'reconcile' ? 'warn' : 'bad')}>{FLAG_LABEL[t]} {n}</span>
            ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{top ? `เบิกเยอะสุด: ${TH_MONTHS[top[0]]} (${baht(top[1])})` : ''}{reviewed > 0 ? ` · รีวิว ${reviewed}/${p.count}` : ''}</span>
          <b style={{ color: 'var(--accent-strong)', fontWeight: 500 }}>{open ? 'ย่อ ▴' : 'ดูรายละเอียด ›'}</b>
        </div>
      </button>

      {open && (
        <PersonDetail p={p} slides={slides} comparing={comparing} compareDeck={compareDeck}
          hasSlides={hasSlides} byRow={byRow} partners={partners} marks={marks} setMark={setMark} month={month} isSeal={isSeal} />
      )}
    </div>
  );
}

function PersonDetail({ p, slides, comparing, compareDeck, hasSlides, byRow, partners, marks, setMark, month, isSeal }) {
  // Group rows by month; respect the month filter.
  const byMonth = {};
  for (const r of p.rows) { const k = r.monthIdx ?? -1; (byMonth[k] || (byMonth[k] = [])).push(r); }
  const monthKeys = Object.keys(byMonth).map(Number).sort((a, b) => a - b);

  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      {hasSlides && !isSeal && (
        <div style={{ padding: '10px 14px', background: 'var(--background-soft)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            {slides ? `เทียบสไลด์แล้ว — ${Object.values(slides).filter(s => s.status === 'amount_mismatch').length} ยอดไม่ตรง · ${Object.values(slides).filter(s => s.status === 'not_in_deck').length} ไม่พบในเด็ค` : 'ให้ Loop อ่านเด็คของคนนี้แล้วเทียบยอดในสไลด์กับชีท'}
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
              cmp={slides?.[r.rowNo]} mark={marks[r.rowNo]} setMark={setMark} isSeal={isSeal} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ClaimRow({ r, flagsSet, partners, cmp, mark, setMark, isSeal }) {
  const cmpView = compareView(cmp);
  const bg = cmp?.status === 'amount_mismatch' ? '#fdf3f0' : (mark === 'no' ? '#fdf3f0' : 'transparent');
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', borderTop: '1px solid var(--line)', background: bg }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono10, marginBottom: 2 }}>แถว {r.rowNo}{r.project ? ` · ${r.project}` : ''}{cmp?.slideDate ? ` · สไลด์ลงวันที่ ${cmp.slideDate.d}/${cmp.slideDate.m + 1}` : ''}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work || '—'}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {[...(flagsSet || [])].map(t => (
            <span key={t} style={statStyle(t === 'slideDup' || t === 'workDup' ? 'bad' : 'warn')}>{FLAG_LABEL[t]}</span>
          ))}
          {partners && partners.length > 0 && (flagsSet?.has('slideDup') || flagsSet?.has('workDup')) && (
            <span style={{ ...mono10, alignSelf: 'center' }}>↔ กับแถว {partners.map(x => x.rowNo).join(', ')}</span>
          )}
          {cmpView && <span style={statStyle(cmpView.tone)}>{cmpView.text}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 500 }}>{baht2(r.amountOut)}</div>
        {cmp?.fixedUrl ? (
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
    case 'match': return { tone: 'ok', text: '✓ ยอดตรงสไลด์' };
    case 'wrong_link': return { tone: 'bad', text: '🔗 ลิงก์ในชีทชี้ผิดจุด — Loop หาสไลด์ที่ใช่ให้แล้ว' };
    case 'content_match': return { tone: 'ok', text: '✓ เจอสไลด์จากเนื้อหา (ลิงก์เดิมไม่เจาะจง)' };
    case 'amount_mismatch': return { tone: 'bad', text: `⚠ สไลด์ ${baht2(cmp.slideAmount)} ≠ ชีท ${baht2(cmp.sheetAmount)}` };
    case 'no_amount': return { tone: 'warn', text: 'อ่านยอดในสไลด์ไม่ได้' };
    case 'not_found': return { tone: 'warn', text: '⛔ หาสไลด์ของรายการนี้ไม่เจอ' };
    default: return null;
  }
}

// ── Recon: form source ↔ curated sheet ───────────────────────────────────────
// Employees claim via a Google Form (timestamped, tamper-resistant); a middle
// person re-keys into the sheet execs see. This view shows where they diverge.
function ReconView({ integ, refreshInteg, data }) {
  const [urlInput, setUrlInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const formSheetId = integ?.meta?.pettycash_form_sheet_id || '';

  const load = useCallback(async (fid) => {
    if (!fid || !data) return;
    setBusy(true);
    try {
      const props = await callProvider('google', { url: `${SHEETS_API}/${fid}?fields=sheets.properties(title)` });
      if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
      const tabs = (props.sheets || []).map(s => s.properties?.title || '');
      const tab = tabs.find(t => /form responses/i.test(t) && !/old/i.test(t)) || tabs[0];
      if (!tab) throw new Error('ไม่พบแท็บ Form Responses ในชีทนี้');
      const grid = await callProvider('google', {
        url: `${SHEETS_API}/${fid}?includeGridData=true&ranges=${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}&fields=${encodeURIComponent(GRID_FIELDS)}`,
      });
      if (grid?.error) throw new Error(grid.error.message || JSON.stringify(grid.error));
      const forms = parseFormResponses((grid.sheets || [])[0]);
      if (!forms.length) throw new Error(`อ่านแท็บ "${tab}" ได้ แต่ไม่พบรายการเบิก — เช็คว่าเป็นชีทที่ Google Form เขียนลง`);
      setResult(reconcile(forms, data.rows, { year: data.year }));
    } catch (e) { alert('เทียบต้นทางไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  }, [data]);

  useEffect(() => { if (formSheetId && data) load(formSheetId); }, [formSheetId, data, load]);

  const saveFormSheet = async () => {
    const id = parseSheetId(urlInput);
    if (!id) { alert('ลิงก์ไม่ถูกต้อง — วางลิงก์ชีท (Responses) ทั้งลิงก์'); return; }
    setBusy(true);
    try {
      await updateIntegrationMeta('google', { ...(integ?.meta || {}), pettycash_form_sheet_id: id, pettycash_form_sheet_url: urlInput.trim() });
      await refreshInteg(); setEditing(false); setUrlInput('');
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  if (!formSheetId || editing) {
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          วางลิงก์ชีท <b style={{ color: 'var(--ink-2)' }}>"SEAL Petty Cash (Responses)"</b> — ชีทที่ Google Form
          ของพนักงานเขียนลงอัตโนมัติ (ต้นทาง) · Loop จะเทียบกับชีทหลักให้เห็นว่ารายการไหนหาย/โผล่/ถูกแก้
        </div>
        <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          onKeyDown={e => e.key === 'Enter' && saveFormSheet()}
          style={{ width: '100%', padding: '9px 10px', fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--f-mono)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost" onClick={saveFormSheet} disabled={busy || !urlInput.trim()}>{busy ? 'กำลังบันทึก…' : '✓ ใช้ชีทนี้'}</button>
          {editing && <button className="btn btn--ghost" onClick={() => setEditing(false)}>ยกเลิก</button>}
        </div>
      </div>
    );
  }
  if (busy && !result) return <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>กำลังอ่านชีทต้นทาง…</div>;
  if (!result) return null;

  const R = result;
  const missSum = R.formMissing.reduce((s, f) => s + f.amount, 0);
  const orphanSum = R.destNoSource.reduce((s, d) => s + d.amountOut, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Tile v={`${R.matchedForms}/${R.forms.length}`} l="ใบฟอร์มจับคู่ได้" />
        <Tile v={R.destNoSource.length} l="🔴 ในชีทแต่ไร้ต้นทาง" warn={R.destNoSource.length > 0} />
        <Tile v={R.formMissing.length} l="🟠 เบิกแล้วแต่ไม่ถึงชีท" warn={R.formMissing.length > 0} />
        <Tile v={R.formDup.length} l="👯 ส่งฟอร์มซ้ำ" warn={R.formDup.length > 0} />
      </div>
      <div style={{ ...mono10, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>ปี {data.year} · จับคู่ 4 ชั้น (สไลด์ → ยอด → แตกใบ → ควบใบ) · ใบฟอร์ม ≤21 วันที่ยังไม่ถึงชีทนับเป็น "รอลงชีท" ({R.formPending.length} ใบ)</span>
        <button onClick={() => { setEditing(true); setUrlInput(integ?.meta?.pettycash_form_sheet_url || ''); }}
          style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13, padding: 2 }}>⚙</button>
      </div>

      {R.destNoSource.length > 0 && (
        <ReconSection tone="bad" title={`🔴 อยู่ในชีทหลัก แต่ไม่มีใบเบิกจากฟอร์ม (${R.destNoSource.length} แถว · ${baht(orphanSum)})`}
          sub="ใครกรอกเข้าไป? — พนักงานคนนั้นไม่ได้ส่งฟอร์ม หรือส่งนอกระบบ">
          {R.destNoSource.map(d => (
            <ReconRow key={d.rowNo} left={`แถวชีท ${d.rowNo} · ${TH_MONTHS[d.monthIdx] ?? ''} · ${d.label}`}
              main={d.work} amt={d.amountOut} url={d.evidenceUrl} />
          ))}
        </ReconSection>
      )}

      {R.formDup.length > 0 && (
        <ReconSection tone="bad" title={`👯 ส่งฟอร์มซ้ำ — คนเดียวกัน ยอดเท่ากัน ห่างกัน ≤3 วัน (${R.formDup.length} คู่)`}
          sub="เช็คว่าตั้งใจเบิก 2 งานจริง หรือใบเดียวถูกส่ง/ถูกเบิกซ้ำ">
          {R.formDup.map(([a, b], i) => (
            <ReconRow key={i} left={`${a.who.split('|')[1] || a.code} · ${fmtD(a.ts)} และ ${fmtD(b.ts)}`}
              main={a.detail || b.detail} amt={a.amount} url={a.slideUrl || b.slideUrl} />
          ))}
        </ReconSection>
      )}

      {R.formMissing.length > 0 && (
        <ReconSection tone="warn" title={`🟠 พนักงานเบิกผ่านฟอร์มแล้ว แต่ไม่พบในชีทหลัก (${R.formMissing.length} ใบ · ${baht(missSum)})`}
          sub="ตกหล่นระหว่างทาง? ถูกจ่ายไหม? — ไล่จากเก่าสุดก่อน">
          {R.formMissing.map(f => (
            <ReconRow key={f.formRow} left={`ฟอร์ม ${fmtD(f.ts)} · ${f.who.split('|')[1] || f.code}${f.paid ? ' · ทำจ่ายแล้ว ✓' : ''}`}
              main={f.detail} amt={f.amount} url={f.slideUrl} />
          ))}
        </ReconSection>
      )}

      {R.destNoSource.length === 0 && R.formMissing.length === 0 && R.formDup.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-2)', fontSize: 13 }}>
          ✓ ต้นทางกับปลายทางตรงกันหมดในปี {data.year}
        </div>
      )}
    </div>
  );
}

function fmtD(d) { return `${d.getDate()}/${d.getMonth() + 1}`; }

function ReconSection({ tone, title, sub, children }) {
  const bd = tone === 'bad' ? 'var(--danger)' : 'var(--warning)';
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${bd}`, borderRadius: '0 var(--r-md) var(--r-md) 0', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--background-soft)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function ReconRow({ left, main, amt, url }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 14px', borderTop: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono10, marginBottom: 2 }}>{left}</div>
        <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(main || '—').replace(/\s+/g, ' ')}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13.5, fontWeight: 500 }}>{baht2(amt)}</div>
        {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent-strong)', textDecoration: 'none' }}>ดูสไลด์ ↗</a>}
      </div>
    </div>
  );
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

function SheetPanel({ urlInput, setUrlInput, onSave, busy, canCancel, onCancel }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        วางลิงก์ Google Sheet "Petty Cash" ของทีม — ต้องมีแท็บรายปี เช่น 2026
      </div>
      <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        onKeyDown={e => e.key === 'Enter' && onSave()}
        style={{ width: '100%', padding: '9px 10px', fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--f-mono)', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost" onClick={onSave} disabled={busy || !urlInput.trim()}>{busy ? 'กำลังบันทึก…' : '✓ ใช้ชีทนี้'}</button>
        {canCancel && <button className="btn btn--ghost" onClick={onCancel}>ยกเลิก</button>}
      </div>
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
