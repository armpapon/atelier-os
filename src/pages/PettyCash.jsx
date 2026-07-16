// ── Petty Cash — audit SEAL's cash-claim sheet, read live from Google Sheets ──
// Pat suspects padded / duplicated petty-cash claims. Her team already logs
// every claim (with a Google Slides receipt link) in one spreadsheet, one tab
// per year. This page reads that sheet read-only through provider-proxy with her
// own OAuth token, then surfaces claims worth a second look — reused slides,
// duplicate line items, balances that don't reconcile, unusually large amounts,
// and missing receipts. Every flag is "open the receipt and check", never a
// verdict. Loop audits only; paying still happens in Make.
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import {
  startGoogleAuth, getIntegration, updateIntegrationMeta, callProvider, ALL_GOOGLE_SCOPES,
} from '../lib/integrations.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';
import { parseSheetId } from '../lib/sheetTimeline.js';
import { parsePettyCash, deriveFlags, summarize } from '../lib/pettyCash.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
// Evidence links hide behind display text, so we must pull hyperlink/link-run/
// formula too — more than SheetTimeline needs, but kept tight to the parser.
const GRID_FIELDS =
  'sheets(properties(title,sheetId),data(rowData(values('
  + 'formattedValue,effectiveValue,hyperlink,textFormatRuns(format/link),userEnteredValue))))';

const baht = n => '฿' + Math.round(n).toLocaleString('en-US');
const baht2 = n => '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };
const lbl = { fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' };

export function PettyCash() {
  const [integ, setInteg] = useState(undefined); // undefined=loading, null=no google row
  const [urlInput, setUrlInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null); // { year, rows, flags }
  const [yearTabs, setYearTabs] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [lastSync, setLastSync] = useState(null);
  const [sumTab, setSumTab] = useState('person');

  const connected = !!(integ && (integ.scope || '').includes('spreadsheets'));
  const sheetId = integ?.meta?.pettycash_sheet_id || '';

  const refreshInteg = useCallback(
    () => getIntegration('google').then(i => { setInteg(i ?? null); return i; }).catch(() => { setInteg(null); return null; }),
    [],
  );

  const load = useCallback(async (id, wantYear) => {
    if (!id) return;
    setBusy(true);
    try {
      const props = await callProvider('google', {
        url: `${SHEETS_API}/${id}?fields=sheets.properties(title,sheetId)`,
      });
      if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
      const tabs = (props.sheets || [])
        .map(s => s.properties?.title || '')
        .filter(t => /^\s*20\d{2}\s*$/.test(t))
        .map(t => Number(t.trim()))
        .sort((a, b) => b - a);
      if (!tabs.length) throw new Error('ไม่พบแท็บรายปี (เช่น "2026") ในชีทนี้');
      setYearTabs(tabs);
      const y = tabs.includes(wantYear) ? wantYear : tabs[0];
      setYear(y);

      const grid = await callProvider('google', {
        url: `${SHEETS_API}/${id}?includeGridData=true`
          + `&ranges=${encodeURIComponent(`'${y}'`)}`
          + `&fields=${encodeURIComponent(GRID_FIELDS)}`,
      });
      if (grid?.error) throw new Error(grid.error.message || JSON.stringify(grid.error));
      const parsed = parsePettyCash((grid.sheets || [])[0]);
      const result = { year: y, rows: parsed.rows, flags: deriveFlags(parsed.rows) };
      setData(result);
      setCache(`pc:${id}:${y}`, result);
      setLastSync(Date.now());
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
        } else { load(id, y); }
      }
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [refreshInteg, load]);

  const pickYear = (y) => {
    if (y === year && data) return;
    const key = `pc:${sheetId}:${y}`;
    if (cacheAge(key) <= STALE_MS) {
      const c = getCache(key); setYear(y); setData(c.data); setLastSync(c.ts);
    } else { setYear(y); load(sheetId, y); }
  };

  const saveSheet = async () => {
    const id = parseSheetId(urlInput);
    if (!id) { alert('ลิงก์ไม่ถูกต้อง — วางลิงก์ Google Sheet ทั้งลิงก์ หรือ id ของชีท'); return; }
    setBusy(true);
    try {
      await updateIntegrationMeta('google', {
        ...(integ?.meta || {}), pettycash_sheet_id: id, pettycash_sheet_url: urlInput.trim(),
      });
      await refreshInteg();
      setEditing(false); setUrlInput('');
      load(id, new Date().getFullYear());
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  // ── Header actions ─────────────────────────────────────────────────────────
  const actions = connected && sheetId && !editing && (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {yearTabs.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {yearTabs.map(y => (
            <button key={y} onClick={() => pickYear(y)}
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 12, padding: '4px 9px', borderRadius: 99, cursor: 'pointer',
                border: `1px solid ${y === year ? 'var(--accent)' : 'var(--line)'}`,
                background: y === year ? 'var(--warning-soft)' : 'var(--surface)',
                color: y === year ? 'var(--accent-strong)' : 'var(--ink-3)',
              }}>{y}</button>
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
      <PageHeader
        eyebrow="งาน · Work"
        title="Petty Cash"
        sub="ตรวจเงินสดย่อยจาก Google Sheet ของทีม · Loop ตรวจอย่างเดียว ไม่จ่าย"
        actions={actions}
      />

      {integ === undefined ? null : !connected ? (
        <ConnectPanel />
      ) : !sheetId || editing ? (
        <SheetPanel urlInput={urlInput} setUrlInput={setUrlInput} onSave={saveSheet} busy={busy}
          canCancel={editing} onCancel={() => setEditing(false)} />
      ) : busy && !data ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>กำลังอ่านชีท…</div>
      ) : data ? (
        <Dashboard data={data} sumTab={sumTab} setSumTab={setSumTab} />
      ) : null}
    </div>
  );
}

// ── Empty / setup states ─────────────────────────────────────────────────────
function ConnectPanel() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '32px 20px' }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 14, lineHeight: 1.6 }}>
        เชื่อม Google Sheets เพื่ออ่านชีท Petty Cash ของทีม (อ่านอย่างเดียว)
      </div>
      <button className="btn btn--ghost" onClick={() => startGoogleAuth(ALL_GOOGLE_SCOPES)}>
        📋 เชื่อม Google Sheets
      </button>
    </div>
  );
}

function SheetPanel({ urlInput, setUrlInput, onSave, busy, canCancel, onCancel }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        วางลิงก์ Google Sheet "Petty Cash" ของทีม — ใช้ลิงก์เดียวกับที่เปิดในเบราว์เซอร์ (ต้องมีแท็บรายปี เช่น 2026)
      </div>
      <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/..."
        onKeyDown={e => e.key === 'Enter' && onSave()}
        style={{
          width: '100%', padding: '9px 10px', fontSize: 12, color: 'var(--ink)', fontFamily: 'var(--f-mono)',
          background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
        }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn--ghost" onClick={onSave} disabled={busy || !urlInput.trim()}>
          {busy ? 'กำลังบันทึก…' : '✓ ใช้ชีทนี้'}
        </button>
        {canCancel && <button className="btn btn--ghost" onClick={onCancel}>ยกเลิก</button>}
      </div>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────
function Dashboard({ data, sumTab, setSumTab }) {
  const { year, rows, flags } = data;
  const expenses = rows.filter(r => r.isExpense);
  const totalOut = expenses.reduce((s, r) => s + r.amountOut, 0);
  const totalIn = rows.reduce((s, r) => s + (r.amountIn || 0), 0);
  const people = new Set(expenses.filter(r => r.isEmployee).map(r => r.code)).size;
  const summary = summarize(rows, sumTab, flags);
  const maxOut = Math.max(1, ...summary.map(s => s.out));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Tile v={baht(totalOut)} l={`เบิกออกปี ${year}`} />
        <Tile v={expenses.length} l={`รายการ · ${people} คน`} />
        <Tile v={flags.total} l="🚩 ธงรอรีวิว" warn={flags.total > 0} />
        <Tile v={baht(totalIn)} l="เงินเข้ารวม" />
      </div>

      <div style={{ ...mono10, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 11px', color: 'var(--ink-3)' }}>
        💡 ทุกธงคือ “ชวนเปิดดูหลักฐาน” ไม่ใช่คำตัดสินว่าผิด — กดดูสไลด์ข้างรายการได้เลย
      </div>

      {/* Flag sections */}
      {flags.total === 0 ? (
        <div style={{ color: 'var(--profit)', fontSize: 13, padding: '4px 0' }}>✓ ไม่พบรายการที่ต้องรีวิวในปีนี้</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <GroupFlags title="🖼 หลักฐานซ้ำ (สไลด์เดียวกัน)" tone="danger" groups={flags.slideDup}
            head={g => `${g.rows.length} แถวใช้สไลด์เดียวกัน`} />
          <GroupFlags title="↔ เบิกซ้ำ (รายการ + ยอดเท่ากัน)" tone="danger" groups={flags.workDup}
            head={g => `${g.rows.length} แถว · ${g.work} · ${baht2(g.amount)}`} />
          <RowFlags title="⚖️ ยอดคงเหลือไม่ตรง (reconcile)" tone="warn" rows={flags.reconcile.map(f => f.row)}
            reason={r => {
              const f = flags.reconcile.find(x => x.row.rowNo === r.rowNo);
              return `ควรเหลือ ${baht2(f.expected)} แต่ชีทลง ${baht2(f.balance)} (ต่าง ${baht2(f.diff)})`;
            }} />
          <RowFlags title="📈 ยอดสูงผิดปกติ" tone="warn" rows={flags.outlier}
            reason={() => `เกินเกณฑ์เฉลี่ย (~${baht(flags.outlierThreshold)}) — ยอดโตผิดปกติ`} />
          <RowFlags title="⛔ ไม่มีหลักฐาน" tone="muted" rows={flags.noEvidence}
            reason={() => 'ไม่มีลิงก์สไลด์/สลิปแนบ'} />
        </div>
      )}

      {/* Summaries */}
      <div>
        <div style={{ ...lbl, marginBottom: 10 }}>สรุปยอด</div>
        <div className="card" style={{ padding: '16px 16px 8px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[['person', 'ต่อคน'], ['month', 'ต่อเดือน'], ['project', 'ต่อโปรเจกต์']].map(([id, label]) => (
              <button key={id} onClick={() => setSumTab(id)}
                style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 99, cursor: 'pointer',
                  border: `1px solid ${sumTab === id ? 'var(--accent)' : 'var(--line)'}`,
                  background: sumTab === id ? 'var(--warning-soft)' : 'var(--background-soft)',
                  color: sumTab === id ? 'var(--accent-strong)' : 'var(--ink-3)',
                }}>{label}</button>
            ))}
          </div>
          {summary.map(s => (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 96px', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</div>
                {s.flags > 0 && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--danger)' }}>{s.flags} ธง</div>}
              </div>
              <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((s.out / maxOut) * 100)}%`, background: 'var(--accent)', borderRadius: 99 }} />
              </div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, textAlign: 'right', color: 'var(--ink)' }}>{baht(s.out)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', borderTop: '1px dashed var(--line-2)', paddingTop: 12, lineHeight: 1.7 }}>
        <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>Loop แค่ตรวจ ไม่จ่าย</b> — จ่ายจริงไปทำใน Make เหมือนเดิม ·
        {flags.deckLevelCount > 0 && <> {flags.deckLevelCount} แถวใช้ลิงก์ระดับเด็ค (ตรวจสไลด์ซ้ำเองไม่ได้) ·</>} SEAL/ออฟฟิศ = ค่าใช้จ่ายบริษัท ไม่นับเป็นคนเบิก
      </div>
    </div>
  );
}

function Tile({ v, l, warn }) {
  return (
    <div style={{
      background: warn ? 'var(--warning-soft)' : 'var(--surface)',
      border: `1px solid ${warn ? 'var(--warning)' : 'var(--line)'}`,
      borderRadius: 'var(--r-md)', padding: '13px 14px',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 500, color: warn ? 'var(--accent-strong)' : 'var(--ink)' }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{l}</div>
    </div>
  );
}

const TONES = {
  danger: { border: 'var(--danger)', pill: 'var(--danger-soft)', pillText: '#8a3a2c' },
  warn: { border: 'var(--warning)', pill: 'var(--warning-soft)', pillText: 'var(--accent-strong)' },
  muted: { border: 'var(--ink-4)', pill: 'var(--surface-2)', pillText: 'var(--ink-2)' },
};

function SectionHead({ title, count, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={lbl}>{title}</span>
      <span style={{ background: TONES[tone].pill, color: TONES[tone].pillText, border: `1px solid ${TONES[tone].border}`, borderRadius: 99, padding: '1px 9px', fontFamily: 'var(--f-mono)', fontSize: 11 }}>{count}</span>
    </div>
  );
}

// A single claim row line used inside every flag section.
function ClaimLine({ r, reason }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '9px 12px', borderTop: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...mono10, marginBottom: 2 }}>{r.label}{r.monthLabel ? ` · ${r.monthLabel}` : ''}{r.project ? ` · ${r.project}` : ''}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.work || '—'}</div>
        {reason && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>{reason(r)}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{r.amountOut != null ? baht2(r.amountOut) : '—'}</div>
        {r.evidenceUrl
          ? <a href={r.evidenceUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 11.5, color: 'var(--accent-strong)', textDecoration: 'none', border: '1px solid var(--accent-soft)', borderRadius: 'var(--r-sm)', padding: '3px 8px', background: 'var(--surface)', whiteSpace: 'nowrap' }}>
              ดูสไลด์ ↗</a>
          : r.slip
            ? <span style={{ fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>สลิป: {r.slip.slice(0, 18)}</span>
            : <span style={{ fontSize: 11, color: 'var(--danger)', border: '1px solid var(--danger-soft)', borderRadius: 'var(--r-sm)', padding: '3px 8px', background: 'var(--danger-soft)' }}>ไม่มีลิงก์</span>}
      </div>
    </div>
  );
}

// Grouped flags (dup slide / dup work): each group is its own bordered card.
function GroupFlags({ title, tone, groups, head }) {
  if (!groups.length) return null;
  return (
    <div>
      <SectionHead title={title} count={groups.length} tone={tone} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map((g, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${TONES[tone].border}`, borderRadius: '0 var(--r-md) var(--r-md) 0', background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ ...mono10, padding: '8px 12px', color: TONES[tone].pillText, background: 'var(--background-soft)' }}>{head(g)}</div>
            {g.rows.map(r => <ClaimLine key={r.rowNo} r={r} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// Flat flags (reconcile / outlier / no-evidence): one bordered list.
function RowFlags({ title, tone, rows, reason }) {
  if (!rows.length) return null;
  return (
    <div>
      <SectionHead title={title} count={rows.length} tone={tone} />
      <div style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${TONES[tone].border}`, borderRadius: '0 var(--r-md) var(--r-md) 0', background: 'var(--surface)', overflow: 'hidden' }}>
        {rows.map(r => <ClaimLine key={r.rowNo} r={r} reason={reason} />)}
      </div>
    </div>
  );
}
