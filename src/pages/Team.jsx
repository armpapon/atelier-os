// ── Team roster — canonical SIE-code ↔ name map, read live from the sheet ─────
// The petty-cash spreadsheet's "Dropdown List" tab is the closest thing SEAL
// has to an employee master (SIE code · full name · nickname). This page reads
// it read-only and cross-checks it against this year's claims, so codes that
// show up in claims but aren't in the master surface as "not registered yet".
// Position and the Asana display-name mapping aren't in the sheet — they come
// in a later phase (this roster is the join key everything else will point at).
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { getIntegration, callProvider } from '../lib/integrations.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';
import { parseRoster, parsePettyCash, tabYear } from '../lib/pettyCash.js';
import { Icon } from '../components/Icon.jsx';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const FIELDS = 'sheets(properties(title),data(rowData(values(formattedValue,effectiveValue))))';

const baht = n => '฿' + Math.round(n).toLocaleString('en-US');
const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };

export function Team() {
  const [integ, setInteg] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null); // { year, roster:[…] }
  const [lastSync, setLastSync] = useState(null);

  const connected = !!(integ && (integ.scope || '').includes('spreadsheets'));
  const sheetId = integ?.meta?.pettycash_sheet_id || '';

  const load = useCallback(async (id) => {
    if (!id) return;
    setBusy(true);
    try {
      // Resolve the real tab names first — "Dropdown List" and the latest year
      // tab, which may be "SEAL 2026" or the พ.ศ. "2569" (never a bare "2026").
      const props = await callProvider('google', { url: `${SHEETS_API}/${id}?fields=sheets.properties(title)` });
      if (props?.error) throw new Error(props.error.message || JSON.stringify(props.error));
      const titles = (props.sheets || []).map(s => s.properties?.title || '').filter(Boolean);
      const dropdownTitle = titles.find(t => /dropdown/i.test(t));
      let year = null, yearTitle = null;
      for (const t of titles) { const y = tabYear(t); if (y != null && (year == null || y > year)) { year = y; yearTitle = t; } }
      const ranges = [dropdownTitle, yearTitle].filter(Boolean);
      if (!ranges.length) throw new Error(`ไม่พบแท็บ "Dropdown List" หรือแท็บรายปี — แท็บที่เจอในชีท: ${titles.join(', ') || '(ไม่มี)'}`);

      const res = await callProvider('google', {
        url: `${SHEETS_API}/${id}?includeGridData=true`
          + ranges.map(t => `&ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'`)}`).join('')
          + `&fields=${encodeURIComponent(FIELDS)}`,
      });
      if (res?.error) throw new Error(res.error.message || JSON.stringify(res.error));
      const sheets = res.sheets || [];
      const dropdown = sheets.find(s => /dropdown/i.test(s.properties?.title || ''));
      const yearSheet = yearTitle ? sheets.find(s => (s.properties?.title || '') === yearTitle) : null;

      // Master roster, then augment with anyone who appears only in claims.
      const master = parseRoster(dropdown);
      const map = new Map(master.map(e => [e.code, { ...e, inMaster: true, claims: 0, total: 0 }]));
      const rows = yearSheet ? parsePettyCash(yearSheet).rows : [];
      for (const r of rows) {
        if (!r.isEmployee || !r.isExpense) continue;
        let g = map.get(r.code);
        if (!g) map.set(r.code, g = { code: r.code, fullName: r.fullName, nick: r.nick, label: r.label, inMaster: false, claims: 0, total: 0 });
        g.claims += 1; g.total += r.amountOut;
      }
      const roster = [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
      const result = { year, roster };
      setData(result);
      setCache(`roster:${id}`, result);
      setLastSync(Date.now());
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) setInteg(null);
      else if (/refresh_failed|invalid_grant/.test(msg)) {
        alert('การเชื่อม Google หมดอายุ — กด "เชื่อม Google" อีกครั้งเพื่อต่ออายุ');
        setInteg(null);
      } else alert('อ่านทะเบียนไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const i = await getIntegration('google').catch(() => null);
      if (cancelled) return;
      setInteg(i ?? null);
      const id = i?.meta?.pettycash_sheet_id;
      if (i && (i.scope || '').includes('spreadsheets') && id) {
        const key = `roster:${id}`;
        if (cacheAge(key) <= STALE_MS) { const c = getCache(key); setData(c.data); setLastSync(c.ts); }
        else load(id);
      }
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [load]);

  const actions = connected && sheetId && (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>ซิงก์ {fmtSyncClock(lastSync)}</span>}
      <button onClick={() => load(sheetId)} disabled={busy} title="รีเฟรช"
        style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 15, padding: 2, opacity: busy ? 0.4 : 1 }}><Icon name="refresh" size={15} /></button>
    </div>
  );

  const unregistered = (data?.roster || []).filter(e => !e.inMaster).length;

  return (
    <div className="page">
      <PageHeader eyebrow="งาน · Work" title="ทะเบียนพนักงาน"
        sub="รหัส SIE ↔ ชื่อ จากชีททีม · ตำแหน่ง & Asana จะเพิ่มทีหลัง" actions={actions} />

      <div className="page-body">
        {integ === undefined ? null : !connected || !sheetId ? (
          <div className="card" style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6 }}>
            ตั้งค่าชีทที่หน้า <b style={{ color: 'var(--ink-2)' }}>Petty Cash</b> ก่อน — ทะเบียนนี้อ่านจากชีทเดียวกัน
          </div>
        ) : busy && !data ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>กำลังอ่านทะเบียน…</div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <Tile v={data.roster.length} l="รายชื่อทั้งหมด" />
              <Tile v={data.roster.filter(e => e.inMaster).length} l="อยู่ในทะเบียนหลัก" />
              <Tile v={unregistered} l="ยังไม่ลงทะเบียน" warn={unregistered > 0} />
            </div>

            {unregistered > 0 && (
              <div style={{ ...mono10, background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 'var(--r-sm)', padding: '8px 11px', color: 'var(--accent-strong)' }}>
                <Icon name="warning" size={13} /> มี {unregistered} รหัสที่เบิกเงินปี {data.year} แต่ยังไม่อยู่ใน Dropdown List — ควรเพิ่มในชีทให้ครบ
              </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 120px', gap: 12, padding: '10px 14px', ...mono10, fontFamily: 'var(--f-body)', fontWeight: 500, fontSize: 13, borderBottom: '1px solid var(--hairline)' }}>
                <span>รหัส</span><span>ชื่อ</span><span style={{ textAlign: 'right' }}>เบิกปี {data.year ?? '—'}</span>
              </div>
              {data.roster.map(e => (
                <div key={e.code} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 120px', gap: 12, alignItems: 'center', padding: '9px 14px', borderTop: '1px solid var(--hairline)' }}>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-2)' }}>{e.code}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{e.fullName}</span>
                    {e.nick && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}> ({e.nick})</span>}
                    {!e.inMaster && <span style={{ marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent-strong)', background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 99, padding: '1px 7px' }}>ยังไม่ลงทะเบียน</span>}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12, color: e.claims ? 'var(--ink)' : 'var(--ink-4)' }}>
                    {e.claims ? `${e.claims} · ${baht(e.total)}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 500, color: warn ? 'var(--accent-strong)' : 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{l}</div>
    </div>
  );
}
