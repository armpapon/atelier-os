import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { useMediaQuery, MOBILE_QUERY } from '../lib/useMediaQuery.js';
import {
  getManifest, upsertManifest,
  getThemes, upsertThemes,
  listGoals, createGoal, updateGoal, deleteGoal,
  listFocusToday, addFocus, toggleFocus, deleteFocus,
  listRoadmap, createMilestone, updateMilestone, deleteMilestone,
  getFinancePulse, getModulePulse,
} from '../lib/api/lifeOS.js';
import {
  listEntries, listUpcomingEvents, getMoodForDate,
  listHabits, getHabitLogsForDate,
} from '../lib/api/journal.js';
import {
  ManifestCard, ThemesCard, GoalsList, RoadmapTimeline, LifePulse,
} from '../components/dashboard/LifeOSWidgets.jsx';
import { todayStr } from '../lib/dates.js';

const THAI_DAYS   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const MOOD_EMOJI  = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

function formatToday() {
  const now = new Date();
  return {
    dateLabel: `${now.getDate()} ${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`,
    dayLabel:  THAI_DAYS[now.getDay()],
    timeLabel: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    greeting:  now.getHours() < 12 ? 'สวัสดีตอนเช้า' : now.getHours() < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น',
  };
}

export function Dashboard({ onNav, user }) {
  const [manifest, setManifest]     = useState(null);
  const [themes, setThemes]         = useState(null);
  const [goals, setGoals]           = useState([]);
  const [focus, setFocus]           = useState([]);
  const [roadmap, setRoadmap]       = useState([]);
  const [financePulse, setFinPulse] = useState(null);
  const [modulePulse, setModPulse]  = useState(null);
  // ── Live signals pulled from Daily Journal ──
  const [todayEntries, setTodayEntries] = useState([]);
  const [events, setEvents]             = useState([]);
  const [mood, setMood]                 = useState(null);
  const [habits, setHabits]             = useState([]);
  const [habitLogs, setHabitLogs]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const isMobile = useMediaQuery(MOBILE_QUERY);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true); setError(null);
    const td = todayStr();
    try {
      const [m, t, g, f, r, fp, mp, te, ev, md, hb, hl] = await Promise.all([
        getManifest(),
        getThemes(),
        listGoals({ status: 'active', limit: 5 }),
        listFocusToday(),
        listRoadmap({ monthsAhead: 6 }),
        getFinancePulse().catch(() => null),
        getModulePulse().catch(() => null),
        // Journal signals — never let one failure break the whole dashboard
        listEntries({ date: td }).catch(() => []),
        listUpcomingEvents({ days: 14, limit: 10 }).catch(() => []),
        getMoodForDate(td).catch(() => null),
        listHabits().catch(() => []),
        getHabitLogsForDate(td).catch(() => []),
      ]);
      setManifest(m); setThemes(t); setGoals(g); setFocus(f); setRoadmap(r);
      setFinPulse(fp); setModPulse(mp);
      setTodayEntries(te); setEvents(ev); setMood(md); setHabits(hb); setHabitLogs(hl);
    } catch (err) {
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const today = formatToday();
  const td = todayStr();
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'อาทิตย์';

  // ── Derived "today" signals ──
  const tasks       = todayEntries.filter(e => e.bullet_type === 'task');
  const tasksDone   = tasks.filter(e => e.done).length;
  const todayEvents = events.filter(e => e.entry_date === td);
  const agenda      = events.slice(0, 3);
  const habitsDone  = habitLogs.length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Every one of these used to reject into nothing: the widget snapped back to
  // its old value and the page stayed silent. Route failures to the banner
  // that's already rendered above.
  const guarded = (fn, msg) => async (...args) => {
    try { setError(null); await fn(...args); refresh(); }
    catch (err) { setError(`${msg}: ${err.message || err}`); }
  };

  const handleManifestSave = guarded(upsertManifest,  'บันทึก Manifest ไม่สำเร็จ');
  const handleThemesSave   = guarded(upsertThemes,    'บันทึกธีมปีนี้ไม่สำเร็จ');
  const handleGoalAdd      = guarded(createGoal,      'เพิ่มเป้าหมายไม่สำเร็จ');
  const handleGoalUpdate   = guarded(updateGoal,      'อัปเดตเป้าหมายไม่สำเร็จ');
  const handleGoalDelete   = guarded(deleteGoal,      'ลบเป้าหมายไม่สำเร็จ');
  const handleFocusAdd     = guarded(addFocus,        'เพิ่มงานวันนี้ไม่สำเร็จ');
  const handleFocusToggle  = guarded(toggleFocus,     'อัปเดตงานวันนี้ไม่สำเร็จ');
  const handleFocusDelete  = guarded(deleteFocus,     'ลบงานวันนี้ไม่สำเร็จ');
  const handleMilestoneAdd = guarded(createMilestone, 'เพิ่มหมุดหมายไม่สำเร็จ');
  const handleMilestoneDel = guarded(deleteMilestone, 'ลบหมุดหมายไม่สำเร็จ');

  return (
    <div className="page-body" style={{ padding: isMobile ? '16px 14px 40px' : '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.22em', marginBottom: 6 }}>
          ATELIER OS · LIFE OS
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: isMobile ? 26 : 32, color: 'var(--ink)', lineHeight: 1.1 }}>
          {today.greeting}, <em style={{ color: 'var(--amber)' }}>{displayName}</em>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
          {today.dateLabel} · {today.dayLabel} · {today.timeLabel} น.
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: 'var(--danger-soft)', color: 'var(--danger)',
          border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13,
        }}>
          ⚠️ {error}
          {error.includes('does not exist') && (
            <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
              ต้องรัน <code>supabase/migration_add_lifeos.sql</code> ใน Supabase ก่อน
            </div>
          )}
        </div>
      )}

      {/* Compass strip — the strategic anchor, kept slim on top */}
      <CompassStrip manifest={manifest} themes={themes} isMobile={isMobile} />

      {/* TODAY — the daily command center, live from Journal */}
      <TodayHero
        isMobile={isMobile}
        todayEventsCount={todayEvents.length}
        tasksDone={tasksDone} tasksTotal={tasks.length}
        moodValue={mood?.value}
        habitsDone={habitsDone} habitsTotal={habits.length}
        agenda={agenda}
        focus={focus}
        onFocusAdd={handleFocusAdd}
        onFocusToggle={handleFocusToggle}
        onFocusDelete={handleFocusDelete}
        onOpenJournal={() => onNav?.('journal')}
      />

      {/* Life Pulse — module headline numbers */}
      <LifePulse finance={financePulse} modules={modulePulse} onNav={onNav} user={user} />

      {/* ── Direction & review zone (strategic, full editors) ── */}
      <div style={{
        marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)',
        letterSpacing: '0.18em', textTransform: 'uppercase',
        borderBottom: '1px solid var(--line)', paddingBottom: 8,
      }}>
        ทิศทาง & รีวิว
      </div>

      <ManifestCard manifest={manifest} onSave={handleManifestSave} />
      <ThemesCard themes={themes} onSave={handleThemesSave} />
      <GoalsList goals={goals} onAdd={handleGoalAdd} onUpdate={handleGoalUpdate} onDelete={handleGoalDelete} />
      <RoadmapTimeline
        milestones={roadmap} monthsAhead={6}
        onAdd={handleMilestoneAdd}
        onUpdate={async (id, p) => { await updateMilestone(id, p); refresh(); }}
        onDelete={handleMilestoneDel}
      />

      {/* Footer */}
      <div style={{
        marginTop: 8, padding: '10px 16px', borderTop: '1px solid var(--line)',
        fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)',
        letterSpacing: '0.1em', textAlign: 'center',
      }}>
        {goals.length} goals · {focus.length}/3 focus · {roadmap.length} milestones
        {!isSupabaseConfigured && ' · DEMO MODE'}
      </div>
    </div>
  );
}

// ── Compass strip: North Star + this week's theme (glance only) ──────────────
function CompassStrip({ manifest, themes, isMobile }) {
  const northStar = manifest?.statement;
  const weekTheme = themes?.week_theme;
  if (!northStar && !weekTheme) return null;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {northStar && (
        <div style={{
          flex: isMobile ? '1 1 100%' : '2 1 320px',
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)', padding: '9px 14px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            ✦ North Star
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>{northStar}</div>
        </div>
      )}
      {weekTheme && (
        <div style={{
          flex: '1 1 200px',
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)', padding: '9px 14px',
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            ◷ ธีมสัปดาห์นี้
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>{weekTheme}</div>
        </div>
      )}
    </div>
  );
}

// ── TODAY hero: the daily command center ─────────────────────────────────────
function TodayHero({
  isMobile, todayEventsCount, tasksDone, tasksTotal, moodValue,
  habitsDone, habitsTotal, agenda, focus, onFocusAdd, onFocusToggle, onFocusDelete, onOpenJournal,
}) {
  const [newFocus, setNewFocus] = useState('');
  const canAddFocus = focus.length < 3;

  const submitFocus = async (e) => {
    e.preventDefault();
    const t = newFocus.trim();
    if (!t || !canAddFocus) return;
    setNewFocus('');
    await onFocusAdd({ title: t, ord: focus.length });
  };

  const stats = [
    { n: String(todayEventsCount), t: 'นัดวันนี้', tone: 'plain' },
    { n: `${tasksDone}/${tasksTotal}`, t: 'งานเสร็จ', tone: tasksTotal > 0 && tasksDone === tasksTotal ? 'good' : 'plain' },
    { n: moodValue ? MOOD_EMOJI[moodValue] : '—', t: 'อารมณ์วันนี้', tone: 'plain' },
    { n: `${habitsDone}/${habitsTotal}`, t: 'Habits', tone: habitsTotal > 0 && habitsDone === habitsTotal ? 'good' : 'plain' },
  ];

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--line-2)',
      borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)',
      padding: isMobile ? '18px 16px' : '22px 24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: 'var(--amber)' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--ink)', fontWeight: 600 }}>วันนี้</div>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--accent-strong)', background: 'var(--accent-soft)', padding: '2px 8px', borderRadius: 999 }}>
            ↺ สดจาก Journal
          </span>
        </div>
        <button onClick={onOpenJournal} className="focus-ring"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--accent-strong)',
            border: '1px solid var(--accent-soft)', borderRadius: 999, padding: '6px 13px',
            background: 'var(--background-soft)', cursor: 'pointer',
          }}>
          เปิด Journal เต็ม →
        </button>
      </div>

      {/* Stat chips */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            background: 'var(--background-soft)', border: '1px solid var(--line)',
            borderRadius: 'var(--r-md)', padding: '11px 12px', textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 22, fontWeight: 600, lineHeight: 1,
              color: s.tone === 'good' ? 'var(--profit)' : 'var(--ink)',
            }}>{s.n}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 5 }}>{s.t}</div>
          </div>
        ))}
      </div>

      {/* Focus + agenda */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.25fr 1fr', gap: 16 }}>
        {/* Focus 3 */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
              โฟกัส 3 อย่างวันนี้
            </span>
          </div>
          {focus.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '6px 0 10px' }}>
              ยังไม่ได้ตั้งโฟกัส — พิมพ์ 1–3 อย่างที่สำคัญที่สุดวันนี้
            </div>
          )}
          {focus.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--hairline)' }}>
              <button onClick={() => onFocusToggle(f.id, !f.done)} aria-label={f.done ? 'ยกเลิก' : 'เสร็จ'}
                style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                  border: `1.6px solid ${f.done ? 'var(--accent)' : 'var(--ink-3)'}`,
                  background: f.done ? 'var(--accent)' : 'transparent',
                  color: 'var(--text-inverse)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {f.done ? '✓' : ''}
              </button>
              <span style={{
                flex: 1, fontSize: 14,
                textDecoration: f.done ? 'line-through' : 'none',
                color: f.done ? 'var(--ink-3)' : 'var(--ink)',
              }}>{f.title}</span>
              <button onClick={() => onFocusDelete(f.id)} aria-label="ลบ"
                style={{ background: 'none', border: 0, color: 'var(--ink-4)', cursor: 'pointer', fontSize: 15, padding: '0 4px' }}>×</button>
            </div>
          ))}
          {canAddFocus && (
            <form onSubmit={submitFocus} style={{ marginTop: 8 }}>
              <input
                value={newFocus} onChange={e => setNewFocus(e.target.value)}
                placeholder="+ เพิ่มโฟกัส..."
                style={{
                  width: '100%', background: 'var(--bg-2)', border: '1px solid var(--line)',
                  borderRadius: 'var(--r-sm)', padding: '8px 11px', fontSize: 14, color: 'var(--ink)',
                  outline: 'none', fontFamily: 'inherit',
                }} />
            </form>
          )}
        </div>

        {/* Agenda */}
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8 }}>
            นัดถัดไป
          </div>
          <div style={{ background: 'var(--background-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', padding: '11px 14px' }}>
            {agenda.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '4px 0' }}>ไม่มีนัดใน 14 วันข้างหน้า</div>
            ) : agenda.map((ev, i) => (
              <div key={ev.id} style={{
                display: 'flex', gap: 10, padding: '7px 0',
                borderBottom: i < agenda.length - 1 ? '1px dotted var(--line)' : 0,
              }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent-strong)', width: 78, flexShrink: 0 }}>
                  {ev.event_time
                    ? (ev.event_end_time ? `${ev.event_time.slice(0, 5)}–${ev.event_end_time.slice(0, 5)}` : ev.event_time.slice(0, 5))
                    : '—'}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', flex: 1 }}>{ev.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
