// ── Asana — team hours dashboard, per person per day ─────────────────────────
// Patt's real workflow (clarified 2026-07-12): each employee plans their day by
// placing task cards on their own calendar with hours in the name, e.g.
// "ทำ artwork (3Hr)". She wants, per selected day: did each person fill 8 hr,
// and hours by status — ✅ Finished (completed in Asana), 😄 On Process (emoji
// prefix = actually workable), ❌ Waiting (no emoji yet). Person-centric: tasks
// are pulled by assignee across all projects, not from a single project.
// Auth = Personal Access Token pasted in this card (stored via RLS-guarded
// upsert, validated through provider-proxy — never expires, no refresh).
import { useState, useEffect, useCallback } from 'react';
import {
  getIntegration, connectAsana, updateIntegrationMeta, disconnect, callProvider,
} from '../lib/integrations.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';

const ASANA_API = 'https://app.asana.com/api/1.0';

// Hour tag, forgiving: (3Hr) [3 Hr] (0.5 hr.) (2 ชม.) — anywhere in the name.
const HOUR_TAG = /[[(]\s*(\d+(?:[.,]\d+)?)\s*(?:h(?:(?:ou)?rs?)?|ชม)\.?\s*[\])]/iu;
export function taskHours(name = '') {
  const m = name.match(HOUR_TAG);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Any emoji at the start of the name = the team marked it workable — except
// negation marks, which read as "blocked/waiting" even though they're emoji.
const EMOJI_PREFIX = /^\s*\p{Extended_Pictographic}/u;
const NEGATIVE_PREFIX = /^\s*[❌⛔🚫✖️❎]/u;
export function isDoable(name = '') {
  return EMOJI_PREFIX.test(name) && !NEGATIVE_PREFIX.test(name);
}

function fmtHr(h) { return (Math.round(h * 100) / 100).toString(); }

// GET an Asana collection, following offset pagination (capped for safety).
async function asanaGetAll(path, params = {}) {
  const out = [];
  let offset = '';
  do {
    const qs = new URLSearchParams({ limit: '100', ...params });
    if (offset) qs.set('offset', offset);
    const res = await callProvider('asana', { url: `${ASANA_API}${path}?${qs}` });
    if (res?.errors) throw new Error(res.errors[0]?.message || JSON.stringify(res.errors));
    out.push(...(res.data || []));
    offset = res.next_page?.offset || '';
  } while (offset && out.length < 500);
  return out;
}

// All of the team's tasks due on `date`. Search API filters due_on server-side
// but is premium-only — on a free workspace we fall back to walking each
// person's task list and filtering the date client-side.
async function fetchDayTasks(wsGid, team, date) {
  try {
    const qs = new URLSearchParams({
      'assignee.any': team.map(m => m.gid).join(','),
      due_on: date, limit: '100',
      opt_fields: 'name,assignee.gid,completed',
    });
    const res = await callProvider('asana', {
      url: `${ASANA_API}/workspaces/${wsGid}/tasks/search?${qs}`,
    });
    if (res?.errors) throw new Error(res.errors[0]?.message || JSON.stringify(res.errors));
    return res.data || [];
  } catch (e) {
    const msg = String(e.message || e);
    if (!/premium|payment|upgrade|not available|402/i.test(msg)) throw e;
    const all = [];
    for (const m of team) {
      const rows = await asanaGetAll('/tasks', {
        assignee: m.gid, workspace: wsGid,
        completed_since: `${date}T00:00:00.000Z`,
        opt_fields: 'name,assignee.gid,due_on,completed',
      });
      all.push(...rows.filter(t => t.due_on === date));
    }
    return all;
  }
}

const TARGET = 8;
const STATUSES = [
  { key: 'done', icon: '✅', label: 'Finished' },
  { key: 'proc', icon: '😄', label: 'On Process' },
  { key: 'wait', icon: '❌', label: 'Waiting' },
];

export function AsanaHours({ date }) {
  const [integ, setInteg] = useState(undefined); // undefined=loading, null=disconnected
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [wsGid, setWsGid] = useState('');
  const [members, setMembers] = useState(null);
  const [memberFilter, setMemberFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [people, setPeople] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const meta = integ?.meta || {};
  const team = meta.asana_team || [];
  const ready = !!(meta.asana_workspace_gid && team.length);

  const refreshInteg = useCallback(
    () => getIntegration('asana').then(i => { setInteg(i ?? null); return i; }).catch(() => setInteg(null)),
    [],
  );
  useEffect(() => { refreshInteg(); }, [refreshInteg]);

  // ── Load + summarize the selected day ──────────────────────────────────────
  const load = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const tasks = await fetchDayTasks(meta.asana_workspace_gid, team, date);
      // Seed from the team list so someone with zero cards still shows (0/8).
      const byGid = new Map(team.map(m => [m.gid, {
        gid: m.gid, name: m.name, done: 0, proc: 0, wait: 0, untagged: 0, tasks: [],
      }]));
      for (const t of tasks) {
        const p = byGid.get(t.assignee?.gid);
        if (!p) continue;
        const hrs = taskHours(t.name);
        const status = t.completed ? 'done' : isDoable(t.name) ? 'proc' : 'wait';
        if (hrs == null) p.untagged++;
        else p[status] += hrs;
        p.tasks.push({ gid: t.gid, name: t.name, hrs, status });
      }
      const rows = [...byGid.values()].map(p => ({ ...p, total: p.done + p.proc + p.wait }));
      // Least-filled people first — they're the ones Patt needs to chase.
      rows.sort((a, b) => a.total - b.total);
      setPeople(rows);
      setCache('asana:hours:' + date, rows);
      setLastSync(Date.now());
      setExpanded(null);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) setInteg(null);
      else alert('ดึงงาน Asana ไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); }
  }, [ready, meta.asana_workspace_gid, team, date]);

  useEffect(() => {
    if (!ready || picking) return;
    const key = 'asana:hours:' + date;
    // Fresh cache → show instantly; stale/none → fetch.
    if (cacheAge(key) <= STALE_MS) {
      const c = getCache(key);
      setPeople(c.data); setLastSync(c.ts);
    } else { load(); }
  }, [ready, picking, date, load]);

  // ── Connect: paste PAT → validate → pick workspace + team ─────────────────
  const connect = async () => {
    const token = pat.trim();
    if (!token) return;
    setBusy(true);
    try {
      const me = await connectAsana(token);
      setPat('');
      const ws = me?.workspaces || [];
      setWorkspaces(ws);
      setWsGid(ws[0]?.gid || '');
      await refreshInteg();
      setPicking(true);
    } catch (e) {
      alert(String(e.message || e));
    } finally { setBusy(false); }
  };

  const openPicker = async () => {
    setPicking(true);
    setSelected(new Set(team.map(m => m.gid)));
    if (!workspaces.length) {
      try {
        const me = await callProvider('asana', {
          url: `${ASANA_API}/users/me?opt_fields=name,workspaces.name`,
        });
        const ws = me?.data?.workspaces || [];
        setWorkspaces(ws);
        setWsGid(meta.asana_workspace_gid || ws[0]?.gid || '');
      } catch (e) { alert('โหลด workspace ไม่สำเร็จ: ' + (e.message || e)); }
    }
  };

  // Workspace chosen → list its members.
  useEffect(() => {
    if (!picking || !wsGid) return;
    let cancelled = false;
    setMembers(null);
    asanaGetAll('/users', { workspace: wsGid, opt_fields: 'name' })
      .then(rows => { if (!cancelled) setMembers(rows); })
      .catch(e => { if (!cancelled) alert('โหลดรายชื่อไม่สำเร็จ: ' + (e.message || e)); });
    return () => { cancelled = true; };
  }, [picking, wsGid]);

  const toggleMember = (gid) => setSelected(prev => {
    const next = new Set(prev);
    next.has(gid) ? next.delete(gid) : next.add(gid);
    return next;
  });

  const savePick = async () => {
    const ws = workspaces.find(w => w.gid === wsGid);
    const picked = (members || []).filter(m => selected.has(m.gid))
      .map(m => ({ gid: m.gid, name: m.name }));
    if (!picked.length) return;
    setBusy(true);
    try {
      await updateIntegrationMeta('asana', {
        asana_workspace_gid: ws?.gid || wsGid, asana_workspace_name: ws?.name || '',
        asana_team: picked,
      });
      await refreshInteg();
      setPicking(false);
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('ยกเลิกการเชื่อม Asana? (token จะถูกลบ)')) return;
    await disconnect('asana');
    setInteg(null); setPicking(false); setPeople(null); setWorkspaces([]); setMembers(null);
  };

  const inputStyle = {
    width: '100%', padding: '7px 8px', fontSize: 12, color: 'var(--ink)',
    background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
  };
  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };
  const linkBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', padding: 0 };

  // Team-wide totals for the overview strip.
  const sum = (people || []).reduce(
    (a, p) => ({
      done: a.done + p.done, proc: a.proc + p.proc, wait: a.wait + p.wait,
      full: a.full + (p.total >= TARGET ? 1 : 0),
    }),
    { done: 0, proc: 0, wait: 0, full: 0 },
  );

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">ชั่วโมงทีม · Asana</div>
        {integ && ready && !picking && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>ซิงก์ {fmtSyncClock(lastSync)}</span>}
            <button onClick={load} disabled={busy} title="รีเฟรชเดี๋ยวนี้"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
            <button onClick={openPicker} title="เปลี่ยนทีม / workspace"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 13, padding: 2 }}>⚙</button>
          </span>
        )}
      </div>

      {integ === undefined ? null : integ === null ? (
        /* ── Paste PAT ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            วาง Personal Access Token ของ Asana — สร้างได้ที่{' '}
            <a href="https://app.asana.com/0/my-apps" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--amber-deep)' }}>app.asana.com/0/my-apps</a>{' '}
            → Create new token
          </div>
          <input type="password" value={pat} onChange={e => setPat(e.target.value)}
            placeholder="วาง token ที่นี่" autoComplete="off"
            onKeyDown={e => e.key === 'Enter' && connect()}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
          <button className="btn btn--ghost" onClick={connect} disabled={busy || !pat.trim()}>
            {busy ? 'กำลังเช็ค token...' : '🔗 เชื่อม Asana'}
          </button>
        </div>
      ) : picking || !ready ? (
        /* ── Pick workspace + team members ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!workspaces.length ? (
            <button className="btn btn--ghost" onClick={openPicker}>เลือก workspace / ทีม</button>
          ) : (
            <>
              <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Workspace</div>
              <select value={wsGid} onChange={e => setWsGid(e.target.value)} style={inputStyle}>
                {workspaces.map(w => <option key={w.gid} value={w.gid}>{w.name}</option>)}
              </select>
              <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                คนในทีม{selected.size ? ` · เลือก ${selected.size}` : ''}
              </div>
              {members === null ? (
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>กำลังโหลดรายชื่อ...</div>
              ) : !members.length ? (
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>ไม่พบสมาชิกใน workspace นี้</div>
              ) : (
                <>
                  {members.length > 8 && (
                    <input value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
                      placeholder="ค้นหาชื่อ..." style={inputStyle} />
                  )}
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {members
                      .filter(m => !memberFilter || m.name.toLowerCase().includes(memberFilter.toLowerCase()))
                      .map(m => (
                        <label key={m.gid}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', background: selected.has(m.gid) ? 'var(--surface-2)' : 'transparent' }}>
                          <input type="checkbox" checked={selected.has(m.gid)} onChange={() => toggleMember(m.gid)} />
                          {m.name}
                        </label>
                      ))}
                  </div>
                </>
              )}
              <button className="btn btn--ghost" onClick={savePick} disabled={busy || !selected.size}>
                {busy ? 'กำลังบันทึก...' : `✓ ใช้ทีมนี้ (${selected.size} คน)`}
              </button>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {ready
              ? <button onClick={() => setPicking(false)} style={linkBtn}>‹ กลับ</button>
              : <span />}
            <button onClick={handleDisconnect} style={linkBtn}>ยกเลิกการเชื่อม</button>
          </div>
        </div>
      ) : (
        /* ── Day dashboard ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...mono10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.asana_workspace_name || 'Asana'} · due {formatShort(date)}
          </div>
          {busy && people === null ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '14px 0', fontSize: 12 }}>กำลังดึง...</div>
          ) : people ? (
            <>
              {/* Overview strip */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <OverviewTile value={`${sum.full}/${people.length}`} label={`คนครบ ${TARGET} Hr`} />
                <OverviewTile value={`${fmtHr(sum.done)} ชม.`} label="✅ Finished" />
                <OverviewTile value={`${fmtHr(sum.proc)} ชม.`} label="😄 On Process" />
                <OverviewTile value={`${fmtHr(sum.wait)} ชม.`} label="❌ Waiting" />
              </div>

              {/* Per person */}
              {people.map(p => {
                const low = p.total < TARGET;
                const open = expanded === p.gid;
                return (
                  <div key={p.gid}
                    style={{ border: `1px solid ${low ? 'var(--warning)' : 'var(--line)'}`, borderRadius: 'var(--r-sm)', background: low ? 'var(--warning-soft)' : 'var(--surface-2)' }}>
                    <button onClick={() => setExpanded(open ? null : p.gid)}
                      style={{ display: 'block', width: '100%', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ flexShrink: 0, fontFamily: 'var(--f-mono)', fontSize: 12, color: low ? 'var(--amber-deep)' : 'var(--profit)' }}>
                          {fmtHr(p.total)}/{TARGET}{low ? ` · ขาด ${fmtHr(TARGET - p.total)}` : ' ✓'}
                        </span>
                      </div>
                      <div style={{ height: 4, background: low ? 'var(--surface-2)' : 'var(--bg-2)', borderRadius: 2, margin: '6px 0', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (p.total / TARGET) * 100)}%`, height: '100%', background: low ? 'var(--warning)' : 'var(--profit)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {STATUSES.map(s => (
                          <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: p[s.key] ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                            <span>{s.icon} {s.label}</span>
                            <span style={{ fontFamily: 'var(--f-mono)' }}>{fmtHr(p[s.key])} Hours</span>
                          </div>
                        ))}
                        {p.untagged > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--amber-deep)' }}>
                            ⚠ งานไม่ระบุ ชม. อีก {p.untagged} ใบ — ตัวเลขยังไม่ครบจริง
                          </div>
                        )}
                      </div>
                    </button>
                    {open && p.tasks.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {p.tasks.map(t => (
                          <div key={t.gid} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                            <span style={{
                              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: t.status === 'wait' ? 'var(--ink-3)' : 'var(--ink-2)',
                              textDecoration: t.status === 'done' ? 'line-through' : 'none',
                            }}>{t.name}</span>
                            <span style={{ ...mono10, flexShrink: 0 }}>
                              {t.hrs != null ? `${fmtHr(t.hrs)} Hr` : '—'} {STATUSES.find(s => s.key === t.status)?.icon}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {open && !p.tasks.length && (
                      <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', fontSize: 12, color: 'var(--ink-3)' }}>
                        ยังไม่ได้วางการ์ดงานวันนี้เลย
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function OverviewTile({ value, label }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 6px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 15, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function formatShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
