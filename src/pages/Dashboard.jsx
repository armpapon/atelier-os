import { useState, useEffect, useCallback } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  getManifest, upsertManifest,
  getThemes, upsertThemes,
  listGoals, createGoal, updateGoal, deleteGoal,
  listFocusToday, addFocus, toggleFocus, deleteFocus,
  listRoadmap, createMilestone, updateMilestone, deleteMilestone,
  getFinancePulse, getModulePulse,
} from '../lib/api/lifeOS.js';
import {
  ManifestCard, ThemesCard, GoalsList, TodayFocus, RoadmapTimeline, LifePulse,
} from '../components/dashboard/LifeOSWidgets.jsx';

const THAI_DAYS   = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

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
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [m, t, g, f, r, fp, mp] = await Promise.all([
        getManifest(),
        getThemes(),
        listGoals({ status: 'active', limit: 5 }),
        listFocusToday(),
        listRoadmap({ monthsAhead: 6 }),
        getFinancePulse().catch(() => null),
        getModulePulse().catch(() => null),
      ]);
      setManifest(m); setThemes(t); setGoals(g); setFocus(f); setRoadmap(r);
      setFinPulse(fp); setModPulse(mp);
    } catch (err) {
      setError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const today = formatToday();
  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'อาทิตย์';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleManifestSave = async (input) => { await upsertManifest(input); refresh(); };
  const handleThemesSave   = async (input) => { await upsertThemes(input);  refresh(); };
  const handleGoalAdd      = async (g) => { await createGoal(g);   refresh(); };
  const handleGoalUpdate   = async (id, p) => { await updateGoal(id, p); refresh(); };
  const handleGoalDelete   = async (id) => { await deleteGoal(id); refresh(); };
  const handleFocusAdd     = async (f) => { await addFocus(f);    refresh(); };
  const handleFocusToggle  = async (id, d) => { await toggleFocus(id, d); refresh(); };
  const handleFocusDelete  = async (id) => { await deleteFocus(id); refresh(); };
  const handleMilestoneAdd = async (m) => { await createMilestone(m); refresh(); };
  const handleMilestoneDel = async (id) => { await deleteMilestone(id); refresh(); };

  return (
    <div className="page-body" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.22em', marginBottom: 6 }}>
            ạ ATELIER OS · LIFE OS
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, color: 'var(--ink)', lineHeight: 1.1 }}>
            {today.greeting}, <em style={{ color: 'var(--amber)' }}>{displayName}</em>
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 6 }}>
            {today.dateLabel} · {today.dayLabel} · {today.timeLabel} น.
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--danger-soft)', color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-control)', fontSize: 13,
        }}>
          ⚠️ {error}
          {error.includes('does not exist') && (
            <div style={{ marginTop: 6, fontSize: 11, fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
              ต้องรัน <code>supabase/migration_add_lifeos.sql</code> ใน Supabase ก่อน
            </div>
          )}
        </div>
      )}

      {/* Section 1: Manifest */}
      <ManifestCard manifest={manifest} onSave={handleManifestSave} />

      {/* Section 2: Themes (Compass) */}
      <ThemesCard themes={themes} onSave={handleThemesSave} />

      {/* Section 3: Goals + Today's Focus */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <GoalsList
          goals={goals}
          onAdd={handleGoalAdd}
          onUpdate={handleGoalUpdate}
          onDelete={handleGoalDelete}
        />
        <TodayFocus
          items={focus}
          onAdd={handleFocusAdd}
          onToggle={handleFocusToggle}
          onDelete={handleFocusDelete}
        />
      </div>

      {/* Section 4: Roadmap */}
      <RoadmapTimeline
        milestones={roadmap}
        monthsAhead={6}
        onAdd={handleMilestoneAdd}
        onUpdate={async (id, p) => { await updateMilestone(id, p); refresh(); }}
        onDelete={handleMilestoneDel}
      />

      {/* Section 5: Life Pulse */}
      <LifePulse
        finance={financePulse}
        modules={modulePulse}
        onNav={onNav}
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
