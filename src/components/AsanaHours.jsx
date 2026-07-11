// ── Asana — team hours per person for the selected day ───────────────────────
// Phase 3: the wife's team tags estimated hours in task names ("[3 Hr] ทำ artwork")
// and marks ready-to-start work with an emoji prefix. This card sums hours per
// assignee for tasks due on the Journal's selected date, flags anyone under
// 8 hr, and shows how many of each person's tasks are ready (emoji-prefixed).
// Auth = Personal Access Token pasted in this card (stored via RLS-guarded
// upsert, validated through provider-proxy — never expires, no refresh).
import { useState, useEffect, useCallback } from 'react';
import {
  getIntegration, connectAsana, updateIntegrationMeta, disconnect, callProvider,
} from '../lib/integrations.js';

const ASANA_API = 'https://app.asana.com/api/1.0';

// Hour tag, forgiving: [3 Hr] [3hr] [0.5 hr.] [2 ชม.] — anywhere in the name.
const HOUR_TAG = /\[\s*(\d+(?:[.,]\d+)?)\s*(?:h(?:(?:ou)?rs?)?|ชม)\.?\s*\]/iu;
export function taskHours(name = '') {
  const m = name.match(HOUR_TAG);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Any emoji at the start of the name = the team marked it ready to work on.
const EMOJI_PREFIX = /^\s*\p{Extended_Pictographic}/u;
export function isDoable(name = '') { return EMOJI_PREFIX.test(name); }

function fmtHr(h) {
  return (Math.round(h * 100) / 100).toString();
}

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

const MIN_HOURS = 8;

export function AsanaHours({ date }) {
  const [integ, setInteg] = useState(undefined); // undefined=loading, null=disconnected
  const [pat, setPat] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [wsGid, setWsGid] = useState('');
  const [projects, setProjects] = useState(null);
  const [projGid, setProjGid] = useState('');
  const [people, setPeople] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const meta = integ?.meta || {};
  const projectGid = meta.asana_project_gid;

  const refreshInteg = useCallback(
    () => getIntegration('asana').then(i => { setInteg(i ?? null); return i; }).catch(() => setInteg(null)),
    [],
  );
  useEffect(() => { refreshInteg(); }, [refreshInteg]);

  // ── Load + summarize the selected day's tasks ──────────────────────────────
  const load = useCallback(async () => {
    if (!projectGid) return;
    setBusy(true);
    try {
      const tasks = await asanaGetAll('/tasks', {
        project: projectGid,
        opt_fields: 'name,assignee.name,due_on,completed',
      });
      const byPerson = new Map();
      for (const t of tasks) {
        if (t.due_on !== date) continue;
        const who = t.assignee?.name || 'ไม่ระบุคนทำ';
        if (!byPerson.has(who)) byPerson.set(who, { name: who, hours: 0, tagged: 0, doable: 0, tasks: [] });
        const p = byPerson.get(who);
        const hrs = taskHours(t.name);
        const doable = isDoable(t.name);
        if (hrs != null) { p.hours += hrs; p.tagged++; }
        if (doable) p.doable++;
        p.tasks.push({ gid: t.gid, name: t.name, hrs, done: !!t.completed, doable });
      }
      // Least-loaded people first so the ones needing work assigned surface on top.
      setPeople([...byPerson.values()].sort((a, b) => a.hours - b.hours));
      setExpanded(null);
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) setInteg(null);
      else alert('ดึงงาน Asana ไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); }
  }, [projectGid, date]);

  useEffect(() => { if (projectGid && !picking) load(); }, [projectGid, picking, load]);

  // ── Connect: paste PAT → validate → pick workspace/project ────────────────
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

  // Entering picker later (⚙) — workspace list needs re-fetching.
  const openPicker = async () => {
    setPicking(true);
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

  // Workspace chosen → list its projects.
  useEffect(() => {
    if (!picking || !wsGid) return;
    let cancelled = false;
    setProjects(null);
    asanaGetAll('/projects', { workspace: wsGid, archived: 'false', opt_fields: 'name' })
      .then(rows => { if (!cancelled) { setProjects(rows); setProjGid(rows[0]?.gid || ''); } })
      .catch(e => { if (!cancelled) alert('โหลด project ไม่สำเร็จ: ' + (e.message || e)); });
    return () => { cancelled = true; };
  }, [picking, wsGid]);

  const savePick = async () => {
    const ws = workspaces.find(w => w.gid === wsGid);
    const pr = (projects || []).find(p => p.gid === projGid);
    if (!pr) return;
    setBusy(true);
    try {
      await updateIntegrationMeta('asana', {
        ...meta,
        asana_workspace_gid: ws?.gid || wsGid, asana_workspace_name: ws?.name || '',
        asana_project_gid: pr.gid, asana_project_name: pr.name,
      });
      await refreshInteg();
      setPicking(false);
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + (e.message || e)); }
    finally { setBusy(false); }
  };

  const handleDisconnect = async () => {
    if (!confirm('ยกเลิกการเชื่อม Asana? (token จะถูกลบ)')) return;
    await disconnect('asana');
    setInteg(null); setPicking(false); setPeople(null); setWorkspaces([]);
  };

  const selStyle = {
    width: '100%', padding: '7px 8px', fontSize: 12, color: 'var(--ink)',
    background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
  };
  const mono10 = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' };

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">ชั่วโมงทีม · Asana</div>
        {integ && projectGid && !picking && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button onClick={load} disabled={busy} title="รีเฟรช"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
            <button onClick={openPicker} title="เปลี่ยน project"
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
            style={{ ...selStyle, fontFamily: 'var(--f-mono)' }} />
          <button className="btn btn--ghost" onClick={connect} disabled={busy || !pat.trim()}>
            {busy ? 'กำลังเช็ค token...' : '🔗 เชื่อม Asana'}
          </button>
        </div>
      ) : picking || !projectGid ? (
        /* ── Pick workspace + project ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!workspaces.length ? (
            <button className="btn btn--ghost" onClick={openPicker}>เลือก workspace / project</button>
          ) : (
            <>
              <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Workspace</div>
              <select value={wsGid} onChange={e => setWsGid(e.target.value)} style={selStyle}>
                {workspaces.map(w => <option key={w.gid} value={w.gid}>{w.name}</option>)}
              </select>
              <div style={{ ...mono10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Project</div>
              {projects === null ? (
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>กำลังโหลด project...</div>
              ) : !projects.length ? (
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>ไม่พบ project ใน workspace นี้</div>
              ) : (
                <select value={projGid} onChange={e => setProjGid(e.target.value)} style={selStyle}>
                  {projects.map(p => <option key={p.gid} value={p.gid}>{p.name}</option>)}
                </select>
              )}
              <button className="btn btn--ghost" onClick={savePick} disabled={busy || !projGid}>
                {busy ? 'กำลังบันทึก...' : '✓ ใช้ project นี้'}
              </button>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {projectGid
              ? <button onClick={() => setPicking(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', padding: 0 }}>‹ กลับ</button>
              : <span />}
            <button onClick={handleDisconnect}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)', padding: 0 }}>
              ยกเลิกการเชื่อม
            </button>
          </div>
        </div>
      ) : (
        /* ── Day summary ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ ...mono10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta.asana_project_name} · due {formatShort(date)}
          </div>
          {busy && people === null ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '14px 0', fontSize: 12 }}>กำลังดึง...</div>
          ) : people && !people.length ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '14px 0', fontSize: 12 }}>
              ไม่มีงาน due วันนี้ในโปรเจคนี้
            </div>
          ) : people ? people.map(p => {
            const low = p.hours < MIN_HOURS;
            const open = expanded === p.name;
            return (
              <div key={p.name}
                style={{ border: `1px solid ${low ? 'var(--amber)' : 'var(--line)'}`, borderRadius: 'var(--r-sm)', background: 'var(--surface-2)' }}>
                <button onClick={() => setExpanded(open ? null : p.name)}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={mono10}>{p.doable}/{p.tasks.length} พร้อมทำ</span>
                  </span>
                  <span style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{ display: 'block', fontFamily: 'var(--f-mono)', fontSize: 14, color: low ? 'var(--amber-deep)' : 'var(--ink)' }}>
                      {p.tagged ? `${fmtHr(p.hours)} ชม.` : '—'}
                    </span>
                    {low && <span style={{ ...mono10, color: 'var(--amber-deep)' }}>ต่ำกว่า {MIN_HOURS} ชม.</span>}
                  </span>
                </button>
                {open && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {p.tasks.map(t => (
                      <div key={t.gid} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink-2)', textDecoration: t.done ? 'line-through' : 'none' }}>
                          {t.doable ? '' : '· '}{t.name}
                        </span>
                        <span style={{ ...mono10, flexShrink: 0 }}>{t.hrs != null ? `${fmtHr(t.hrs)} ชม.` : '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          }) : null}
        </div>
      )}
    </div>
  );
}

function formatShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
