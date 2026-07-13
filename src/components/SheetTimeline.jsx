// ── Working Timeline — the AE team's job sheet, read live from Google Sheets ─
// Patt's team tracks every client-page job in one spreadsheet (one tab per
// page per year). This card reads it through provider-proxy with her own
// OAuth token (read-only) and surfaces the two things she chases daily:
// which jobs are in flight this month, and which posted jobs still have
// billing steps unchecked (Send QT → … → Paid) = "รอวางบิล".
import { useState, useEffect, useCallback } from 'react';
import {
  startGoogleAuth, getIntegration, updateIntegrationMeta, callProvider, ALL_GOOGLE_SCOPES,
} from '../lib/integrations.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';
import {
  parseSheetId, pickClientTabs, parseTimeline, summarizeTimeline,
} from '../lib/sheetTimeline.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
// Only what the parser needs — keeps a 300-row tab's payload small.
const GRID_FIELDS = 'sheets(properties(title,sheetId),data(rowData(values(formattedValue,effectiveValue,effectiveFormat.textFormat.strikethrough))))';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function fmtD(d) {
  return d ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}` : '—';
}

export function SheetTimeline({ date }) {
  const [integ, setInteg] = useState(undefined); // undefined=loading, null=no google row
  const [urlInput, setUrlInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [tabFilter, setTabFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [allBilling, setAllBilling] = useState(false);
  const [allMonth, setAllMonth] = useState(false);

  const connected = !!(integ && (integ.scope || '').includes('spreadsheets'));
  const sheetId = integ?.meta?.timeline_sheet_id || '';

  const refreshInteg = useCallback(
    () => getIntegration('google').then(i => { setInteg(i ?? null); return i; }).catch(() => { setInteg(null); return null; }),
    [],
  );

  const load = useCallback(async (id) => {
    if (!id) return;
    setBusy(true);
    try {
      const year = new Date().getFullYear();
      const props = await callProvider('google', {
        url: `${SHEETS_API}/${id}?fields=sheets.properties(title,sheetId)`,
      });
      if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
      const tabs = pickClientTabs(props, year);
      if (!tabs.length) throw new Error(`ไม่พบแท็บลูกค้าของปี ${year} ในชีทนี้`);
      // One request per tab keeps each response small.
      const grids = await Promise.all(tabs.map(t => callProvider('google', {
        url: `${SHEETS_API}/${id}?includeGridData=true`
          + `&ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'`)}`
          + `&fields=${encodeURIComponent(GRID_FIELDS)}`,
      })));
      const bad = grids.find(g => g?.error);
      if (bad) throw new Error(bad.error.message || JSON.stringify(bad.error));
      const parsed = parseTimeline(grids.flatMap(g => g.sheets || []));
      setJobs(parsed);
      setCache('sheet:timeline:' + id, parsed);
      setLastSync(Date.now());
      setExpanded(null);
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
      const id = i?.meta?.timeline_sheet_id;
      if (i && (i.scope || '').includes('spreadsheets') && id) {
        const key = 'sheet:timeline:' + id;
        // Fresh cache → show instantly; stale/none → read the sheet.
        if (cacheAge(key) <= STALE_MS) {
          const c = getCache(key);
          setJobs(c.data); setLastSync(c.ts);
        } else { load(id); }
      }
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [refreshInteg, load]);

  const saveSheet = async () => {
    const id = parseSheetId(urlInput);
    if (!id) { alert('ลิงก์ไม่ถูกต้อง — วางลิงก์ Google Sheet ทั้งลิงก์ หรือ id ของชีท'); return; }
    setBusy(true);
    try {
      await updateIntegrationMeta('google', {
        ...(integ?.meta || {}), timeline_sheet_id: id, timeline_sheet_url: urlInput.trim(),
      });
      await refreshInteg();
      setEditing(false);
      setUrlInput('');
      load(id);
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  const monthIdx = new Date(date + 'T00:00:00').getMonth();
  const filtered = (jobs || []).filter(j => !tabFilter || j.tab === tabFilter);
  const sum = summarizeTimeline(filtered, monthIdx);
  const tabNames = [...new Set((jobs || []).map(j => j.tab))];
  const billingShown = allBilling ? sum.billing : sum.billing.slice(0, 6);
  const monthDoing = sum.inMonth.filter(j => !j.posted);
  const monthShown = allMonth ? sum.inMonth : sum.inMonth.slice(0, 8);

  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };
  const inputStyle = {
    width: '100%', padding: '7px 8px', fontSize: 12, color: 'var(--ink)',
    background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
  };
  const moreBtn = {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
    color: 'var(--ink-3)', padding: '2px 0', textAlign: 'left',
  };

  const jobRow = (j, key, warn) => {
    const open = expanded === key;
    return (
      <div key={key}
        style={{ border: `1px solid ${warn ? 'var(--warning)' : 'var(--line)'}`, borderRadius: 'var(--r-sm)', background: warn ? 'var(--warning-soft)' : 'var(--surface-2)' }}>
        <button onClick={() => setExpanded(open ? null : key)}
          style={{ display: 'block', width: '100%', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, ...mono10 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {j.tab}{j.ae ? ` · ${j.ae}` : ''}{j.monthIdx != null ? ` · ${TH_MONTHS[j.monthIdx]}` : ''}
            </span>
            <span style={{ flexShrink: 0, color: warn ? 'var(--amber-deep)' : (j.posted ? 'var(--profit)' : 'var(--ink-2)') }}>
              {warn
                ? `โพสต์แล้ว${j.daysSincePost != null ? ` ${j.daysSincePost} วัน` : ''}`
                : j.currentStep}
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
            {j.client.replace(/\s+/g, ' ')}
          </div>
          {warn && (
            <div style={{ fontSize: 11, color: 'var(--amber-deep)', marginTop: 2 }}>
              ขาด: {j.payMissing.join(' · ')}
            </div>
          )}
        </button>
        {open && (
          <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ ...mono10, color: 'var(--ink-2)' }}>
              {j.steps.map(s => `${s.struck ? '✓' : '·'} ${s.label} ${fmtD(s.date)}`).join('  ')}
            </div>
            <div style={{ ...mono10, color: j.posted ? 'var(--profit)' : 'var(--ink-3)' }}>
              {j.posted ? `✓ โพสต์ ${fmtD(j.post.date)}` : `โพสต์ ${fmtD(j.post.date)}`}
              {j.payMissing.length
                ? ` · รอ: ${j.payMissing.join(', ')}`
                : (j.posted ? ' · เก็บเงินครบ ✓' : '')}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">Working Timeline · ทีม AE</div>
        {connected && sheetId && !editing && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>ซิงก์ {fmtSyncClock(lastSync)}</span>}
            <button onClick={() => load(sheetId)} disabled={busy} title="รีเฟรชเดี๋ยวนี้"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
            <button onClick={() => { setEditing(true); setUrlInput(integ?.meta?.timeline_sheet_url || ''); }} title="เปลี่ยนชีท"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13, padding: 2 }}>⚙</button>
          </span>
        )}
      </div>

      {integ === undefined ? null : !connected ? (
        /* ── Needs the Sheets scope ── */
        <div style={{ textAlign: 'center', padding: '14px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>
            เชื่อม Google Sheets เพื่อดูงานทีม AE และรายการรอวางบิล
          </div>
          <button className="btn btn--ghost" onClick={() => startGoogleAuth(ALL_GOOGLE_SCOPES)}>
            📋 เชื่อม Google Sheets
          </button>
        </div>
      ) : !sheetId || editing ? (
        /* ── Point the card at the team's sheet (once) ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            วางลิงก์ Google Sheet "Working Timeline" ของทีม — ใช้ลิงก์เดียวกับที่เปิดดูในเบราว์เซอร์
          </div>
          <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            onKeyDown={e => e.key === 'Enter' && saveSheet()}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
          <button className="btn btn--ghost" onClick={saveSheet} disabled={busy || !urlInput.trim()}>
            {busy ? 'กำลังบันทึก...' : '✓ ใช้ชีทนี้'}
          </button>
          {editing && (
            <button onClick={() => setEditing(false)} style={moreBtn}>‹ กลับ</button>
          )}
        </div>
      ) : busy && jobs === null ? (
        <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>กำลังอ่านชีท...</div>
      ) : jobs ? (
        /* ── Dashboard ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Page filter chips */}
          {tabNames.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['', ...tabNames].map(t => (
                <button key={t || 'all'} onClick={() => { setTabFilter(t); setExpanded(null); }}
                  style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 99, cursor: 'pointer',
                    border: `1px solid ${tabFilter === t ? 'var(--amber)' : 'var(--line)'}`,
                    background: tabFilter === t ? 'var(--warning-soft)' : 'var(--surface-2)',
                    color: tabFilter === t ? 'var(--amber-deep)' : 'var(--ink-3)',
                  }}>
                  {t || 'ทุกเพจ'}
                </button>
              ))}
            </div>
          )}

          {/* Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Tile value={sum.monthTotal} label={`งาน ${TH_MONTHS[monthIdx]}`} />
            <Tile value={monthDoing.length} label="กำลังทำ" />
            <Tile value={sum.posted} label="โพสต์แล้ว" />
            <Tile value={sum.billing.length} label="🚨 รอวางบิล" warn={sum.billing.length > 0} />
          </div>

          {/* Billing chase list — every month, oldest posted first */}
          {sum.billing.length > 0 && (
            <>
              <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 2 }}>
                🚨 รอวางบิล ({sum.billing.length})
              </div>
              {billingShown.map((j, i) => jobRow(j, `b${i}`, true))}
              {sum.billing.length > 6 && (
                <button onClick={() => setAllBilling(v => !v)} style={moreBtn}>
                  {allBilling ? '‹ ย่อ' : `ดูทั้งหมด ${sum.billing.length} งาน ›`}
                </button>
              )}
            </>
          )}

          {/* This month's jobs */}
          <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 2 }}>
            งานเดือน{TH_MONTHS[monthIdx]} ({sum.monthTotal})
          </div>
          {sum.monthTotal === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>ไม่มีงานในเดือนนี้</div>
          ) : (
            <>
              {monthShown.map((j, i) => jobRow(j, `m${i}`, false))}
              {sum.inMonth.length > 8 && (
                <button onClick={() => setAllMonth(v => !v)} style={moreBtn}>
                  {allMonth ? '‹ ย่อ' : `ดูทั้งหมด ${sum.inMonth.length} งาน ›`}
                </button>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Tile({ value, label, warn }) {
  return (
    <div style={{
      background: warn ? 'var(--warning-soft)' : 'var(--surface-2)',
      border: `1px solid ${warn ? 'var(--warning)' : 'var(--line)'}`,
      borderRadius: 'var(--r-sm)', padding: '8px 6px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 15, color: warn ? 'var(--amber-deep)' : 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
