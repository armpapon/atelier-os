import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardHeader, Button, EmptyState } from '../ui/index.js';
import {
  listSessions, createSession, deleteSession, completeBookPass,
  updateSource, getStudyHints, computeReadingStats,
  listInsights, createInsight, toggleInsightDone, deleteInsight,
  extractVideoId, getYouTubeEmbedUrl,
} from '../../lib/api/learning.js';
import { todayStr } from '../../lib/dates.js';
import { Icon } from '../Icon.jsx';

// ════════════════════════════════════════════════════════════════════════════
//  StudyDrawer — premium study/reading companion (open via source card)
// ════════════════════════════════════════════════════════════════════════════
export function StudyDrawer({ source, onClose, onChange }) {
  const [tab, setTab]           = useState('study');
  const [sessions, setSessions] = useState([]);
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    if (!source?.id) return;
    listSessions(source.id).then(setSessions).catch(() => setSessions([]));
    listInsights(source.id).then(setInsights).catch(() => setInsights([]));
  }, [source?.id]);

  const refreshSessions = async () => setSessions(await listSessions(source.id).catch(() => []));
  const refreshInsights = async () => setInsights(await listInsights(source.id).catch(() => []));

  const stats = useMemo(() => computeReadingStats(source, sessions), [source, sessions]);
  const hints = useMemo(() => getStudyHints(source, sessions),       [source, sessions]);

  // Close on Esc
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!source) return null;

  const isBook  = source.type === 'book';
  const isVideo = source.type === 'youtube';
  const openActions = insights.filter(i => i.kind === 'action' && !i.is_done).length;

  const tabs = [
    { id: 'study',    label: isBook ? 'อ่าน' : isVideo ? 'ดู' : 'เรียน' },
    { id: 'insights', label: `Insights${insights.length ? ` · ${insights.length}` : ''}` },
    { id: 'sessions', label: `Sessions${sessions.length ? ` · ${sessions.length}` : ''}` },
    { id: 'stats',    label: 'Stats' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', width: '92vw', maxWidth: 760, height: '100%',
        background: 'var(--background)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'slideInRight 200ms cubic-bezier(.2,.8,.3,1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', gap: 14, alignItems: 'center',
        }}>
          {/* cover thumb */}
          {source.cover_url ? (
            <div style={{
              width: 46, height: 62, borderRadius: 6, flexShrink: 0,
              background: `url(${source.cover_url}) center/cover`,
              border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
            }} />
          ) : (
            <div style={{
              width: 46, height: 62, borderRadius: 6, flexShrink: 0,
              background: 'var(--accent-soft)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}><Icon name={isVideo ? 'play' : 'book'} size={22} /></div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
              {isBook ? 'BOOK' : isVideo ? 'YOUTUBE' : source.type?.toUpperCase()} · {source.category || '—'}
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 19, color: 'var(--text-primary)', marginTop: 3, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {source.title}
            </div>
            {source.author && (
              <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
                · {source.author}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4, flexShrink: 0, alignSelf: 'flex-start' }}>×</button>
        </div>

        {/* Hero progress */}
        <ProgressHero source={source} stats={stats} isBook={isBook} />

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 2, padding: '8px 16px 0',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="focus-ring"
              style={{
                padding: '9px 13px', border: 0, background: 'transparent',
                color: tab === t.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                borderBottom: '2px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
                marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
                fontSize: 12.5, fontFamily: 'var(--f-body)',
                fontWeight: tab === t.id ? 600 : 400,
              }}>
              {t.label}
              {t.id === 'insights' && openActions > 0 && (
                <span style={{
                  marginLeft: 5, fontSize: 9, padding: '1px 5px', borderRadius: 8,
                  background: 'var(--warning)', color: 'var(--text-inverse)', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                }}>{openActions} to-do</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 32px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'study' && hints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hints.map((h, i) => <Hint key={i} {...h} />)}
            </div>
          )}

          {tab === 'study' && (
            isBook  ? <BookStudy  source={source} onSaved={async () => { await refreshSessions(); onChange?.(); }} /> :
            isVideo ? <VideoStudy source={source} onSaved={async () => { await refreshSessions(); onChange?.(); }} /> :
                      <GenericStudy source={source} onSaved={async () => { await refreshSessions(); onChange?.(); }} />
          )}

          {tab === 'insights' && (
            <InsightsBank source={source} insights={insights} onChange={refreshInsights} />
          )}

          {tab === 'sessions' && (
            <SessionList sessions={sessions}
              onDelete={async (id) => { if (confirm('ลบ session นี้?')) { await deleteSession(id); refreshSessions(); onChange?.(); } }} />
          )}

          {tab === 'stats' && (
            <StatsTab source={source} stats={stats} insights={insights}
              onCompletePass={async () => {
                if (confirm(`บันทึกว่าอ่านจบรอบที่ ${(source.reading_count || 0) + 1}? (current page จะรีเซ็ตเป็น 0 เพื่ออ่านทวนรอบใหม่)`)) {
                  await completeBookPass(source.id); onChange?.(); onClose();
                }
              }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Progress Hero — sits under header, always visible
// ════════════════════════════════════════════════════════════════════════════
function ProgressHero({ source, stats, isBook }) {
  const progress = source.progress || 0;
  const hasPages = isBook && source.total_pages;

  return (
    <div style={{
      padding: '14px 24px 16px', background: 'var(--surface)',
      borderBottom: '1px solid var(--border)', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
          {hasPages
            ? `อ่านแล้ว ${source.current_page || 0} / ${source.total_pages} หน้า`
            : 'ความคืบหน้า'}
          {source.reading_count > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--accent-strong)' }}>· อ่านจบมาแล้ว {source.reading_count} รอบ</span>
          )}
        </div>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, fontWeight: 600, color: progress >= 100 ? 'var(--success)' : 'var(--accent-strong)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {progress}%
        </div>
      </div>

      {/* progress bar */}
      <div style={{ height: 4, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: `${progress}%`, height: '100%',
          background: progress >= 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--accent), var(--accent-strong))',
          borderRadius: 999, transition: 'width 400ms cubic-bezier(.2,.8,.3,1)',
        }} />
      </div>

      {/* metric chips */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        <MiniMetric icon={<Icon name="flame" size={15} />} label="streak" value={stats.streak > 0 ? `${stats.streak} วัน` : '—'} hot={stats.streak >= 3} />
        <MiniMetric icon={<Icon name="clock" size={15} />} label="เวลารวม" value={stats.totalMin >= 60 ? `${Math.floor(stats.totalMin/60)}h ${stats.totalMin%60}m` : `${stats.totalMin}m`} />
        {isBook && <MiniMetric icon={<Icon name="bolt" size={15} />} label="ความเร็ว" value={stats.pagesPerHour > 0 ? `${stats.pagesPerHour.toFixed(0)} น./ชม.` : '—'} />}
        {isBook && stats.daysToFinish != null && (
          <MiniMetric icon={<Icon name="flag" size={15} />} label="คาดว่าจบใน" value={`~${stats.daysToFinish} วัน`} />
        )}
        <MiniMetric icon={<Icon name="star" size={15} />} label="เข้าใจเฉลี่ย" value={stats.avgScore ? `${stats.avgScore.toFixed(1)}/5` : '—'} />
      </div>
    </div>
  );
}

function MiniMetric({ icon, label, value, hot }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: hot ? 'var(--accent-strong)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>{value}
      </div>
    </div>
  );
}

function Hint({ tone, icon, text }) {
  const bg = { success: 'var(--success-soft)', warning: 'var(--warning-soft)', danger: 'var(--danger-soft)', accent: 'var(--accent-soft)', neutral: 'var(--background-soft)' }[tone];
  const bd = { success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)', accent: 'var(--accent)', neutral: 'var(--border)' }[tone];
  return (
    <div style={{
      padding: '8px 12px', background: bg, border: '1px solid ' + bd,
      borderRadius: 'var(--radius-control)', fontSize: 12.5, color: 'var(--text-primary)',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  BookStudy — total-pages setup + timer + page tracker + summary
// ════════════════════════════════════════════════════════════════════════════
function BookStudy({ source, onSaved }) {
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning]   = useState(false);
  const [fromPage, setFromPage] = useState(source.current_page || 0);
  const [toPage, setToPage]     = useState((source.current_page || 0) + 10);
  const [score, setScore]       = useState(3);
  const [summary, setSummary]   = useState('');
  const [notes, setNotes]       = useState('');
  const [totalPages, setTotalPages] = useState(source.total_pages || '');
  const [savingTotal, setSavingTotal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const intervalRef = useRef();

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const saveTotalPages = async () => {
    if (!totalPages || Number(totalPages) < 1) return;
    setSavingTotal(true);
    try { await updateSource(source.id, { total_pages: Number(totalPages) }); onSaved(); }
    catch (e) { alert(e.message); }
    finally { setSavingTotal(false); }
  };

  const pagesRead = Math.max(0, Number(toPage) - Number(fromPage));
  const fmt = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const handleSave = async () => {
    if (!summary.trim() && !notes.trim() && timerSec === 0 && pagesRead === 0) {
      if (!confirm('ยังไม่มี timer / หน้า / summary — บันทึกต่อไหม?')) return;
    }
    setSaving(true);
    try {
      await createSession({
        source_id: source.id,
        session_date: todayStr(),
        // A timer that was never started recorded 1 minute, which turned a
        // 30-page session into "1,800 หน้า/ชม.".
        duration_min: timerSec >= 30 ? Math.round(timerSec / 60) : null,
        from_page: Number(fromPage), to_page: Number(toPage),
        pages_read: pagesRead,
        understanding_score: score,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
      });
      setTimerSec(0); setRunning(false);
      setFromPage(Number(toPage));
      setToPage(Number(toPage) + 10);
      setSummary(''); setNotes(''); setScore(3);
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  // ── Setup step: ask total pages (this is what made progress feel "stuck") ──
  if (!source.total_pages) {
    return (
      <Card>
        <CardHeader eyebrow="ตั้งค่าหนังสือ" title="หนังสือเล่มนี้มีกี่หน้า?" />
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
          ใส่จำนวนหน้าทั้งหมดก่อน — ระบบจะได้คำนวณ % ความคืบหน้า, ความเร็วอ่าน
          และประมาณว่าอีกกี่วันจะอ่านจบให้อัตโนมัติ
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Field label="จำนวนหน้าทั้งหมด">
            <input type="number" min="1" value={totalPages} autoFocus
              onChange={e => setTotalPages(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTotalPages(); }}
              placeholder="เช่น 320"
              style={{ ...inputStyle, fontFamily: 'var(--f-mono)', fontSize: 16 }} />
          </Field>
          <Button variant="primary" size="md" onClick={saveTotalPages} disabled={savingTotal || !totalPages}>
            {savingTotal ? '...' : 'เริ่มอ่าน →'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader eyebrow="Reading Session" title="บันทึกการอ่านครั้งนี้"
        meta={`เริ่มจากหน้า ${source.current_page || 0}`} />

      {/* Timer */}
      <div style={{
        padding: '18px 16px', background: 'var(--background-soft)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 14,
      }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}><Icon name="clock" size={13} /> จับเวลาอ่าน</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 40, fontWeight: 600, color: running ? 'var(--accent-strong)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {fmt(timerSec)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!running
            ? <Button variant="primary" size="md" onClick={() => setRunning(true)}><Icon name="play" size={13} /> {timerSec > 0 ? 'อ่านต่อ' : 'เริ่ม'}</Button>
            : <Button variant="secondary" size="md" onClick={() => setRunning(false)}><Icon name="pause" size={14} /> พัก</Button>}
          {timerSec > 0 && !running && (
            <Button variant="ghost" size="md" onClick={() => setTimerSec(0)}>↺ รีเซ็ต</Button>
          )}
        </div>
      </div>

      {/* Pages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 12, alignItems: 'flex-end' }}>
        <Field label="หน้าเริ่ม">
          <input type="number" min="0" value={fromPage} onChange={e => setFromPage(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>
        <Field label="อ่านถึงหน้า">
          <input type="number" min="0" value={toPage} onChange={e => setToPage(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>
        <div style={{ padding: '8px 16px', background: 'var(--accent-soft)', borderRadius: 'var(--radius-control)', textAlign: 'center' }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 9, color: 'var(--accent-strong)' }}>+อ่าน</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--accent-strong)', fontWeight: 600 }}>{pagesRead}</div>
        </div>
      </div>

      <ScorePicker value={score} onChange={setScore} />

      <Field label="สรุป — ได้อะไรจาก session นี้ (1-2 ประโยค)">
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
          placeholder='เช่น "Mark Douglas: ทุก trade คือ probability ไม่ใช่ certainty"'
          style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
      </Field>

      <Field label="Notes / quote / ข้ออ้างอิง (ไม่บังคับ)">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="p.45 — 'Best traders just lose less when wrong'"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
      </Field>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? '...' : 'บันทึก Session'}
        </Button>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        <Icon name="bulb" size={13} /> อยากเก็บข้อคิด/quote/สิ่งที่จะลงมือทำถาวร? ไปแท็บ <strong>Insights</strong>
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  InsightsBank — takeaways / quotes / action items
// ════════════════════════════════════════════════════════════════════════════
const KINDS = {
  takeaway: { label: 'ข้อคิด',    icon: '💡', color: 'var(--accent-strong)',  soft: 'var(--accent-soft)' },
  quote:    { label: 'Quote',     icon: '❝',  color: 'var(--violet)', soft: 'var(--background-soft)' },
  action:   { label: 'ลงมือทำ',   icon: '✅', color: 'var(--success)', soft: 'var(--success-soft)' },
};

function InsightsBank({ source, insights, onChange }) {
  const [kind, setKind]       = useState('takeaway');
  const [content, setContent] = useState('');
  const [pageRef, setPageRef] = useState('');
  const [filter, setFilter]   = useState('all');
  const [saving, setSaving]   = useState(false);

  const add = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await createInsight({
        source_id: source.id, kind,
        content: content.trim(),
        page_ref: pageRef ? Number(pageRef) : null,
      });
      setContent(''); setPageRef('');
      onChange();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const shown = filter === 'all' ? insights : insights.filter(i => i.kind === filter);
  const counts = {
    all: insights.length,
    takeaway: insights.filter(i => i.kind === 'takeaway').length,
    quote: insights.filter(i => i.kind === 'quote').length,
    action: insights.filter(i => i.kind === 'action').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Quick add */}
      <Card>
        <CardHeader eyebrow="คลังปัญญา" title="เก็บข้อคิดจากเล่มนี้"
          meta="ข้อคิด · quote · สิ่งที่จะลงมือทำ" />

        {/* kind picker */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {Object.entries(KINDS).map(([k, m]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className="focus-ring"
              style={{
                flex: 1, padding: '8px 6px', borderRadius: 'var(--radius-control)',
                background: kind === k ? m.color : 'var(--surface)',
                color: kind === k ? 'var(--text-inverse)' : 'var(--text-secondary)',
                border: '1px solid ' + (kind === k ? m.color : 'var(--border)'),
                fontSize: 12, fontWeight: kind === k ? 600 : 400, cursor: 'pointer',
              }}>{m.icon} {m.label}</button>
          ))}
        </div>

        <textarea value={content} onChange={e => setContent(e.target.value)} rows={2}
          placeholder={
            kind === 'takeaway' ? 'ข้อคิดสำคัญที่อยากจำ...' :
            kind === 'quote'    ? 'พิมพ์ quote ที่โดนใจ...' :
                                  'สิ่งที่จะลงมือทำจริง เช่น "ตั้ง stop loss ทุกไม้ก่อนเข้า"'
          }
          onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 58, marginBottom: 8 }} />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {kind !== 'action' && (
            <input type="number" min="0" value={pageRef} onChange={e => setPageRef(e.target.value)}
              placeholder="หน้า"
              style={{ ...inputStyle, width: 90, fontFamily: 'var(--f-mono)' }} />
          )}
          <div style={{ flex: 1 }} />
          <Button variant="primary" size="md" onClick={add} disabled={saving || !content.trim()}>
            {saving ? '...' : `+ เพิ่ม${KINDS[kind].label}`}
          </Button>
        </div>
      </Card>

      {/* Filter pills */}
      {insights.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `ทั้งหมด · ${counts.all}` },
            { id: 'takeaway', label: `${KINDS.takeaway.icon} ข้อคิด · ${counts.takeaway}` },
            { id: 'quote', label: `${KINDS.quote.icon} Quote · ${counts.quote}` },
            { id: 'action', label: `${KINDS.action.icon} ลงมือทำ · ${counts.action}` },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className="focus-ring"
              style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums',
                padding: '5px 11px', borderRadius: 'var(--radius-pill)', fontSize: 13,
                background: filter === f.id ? 'var(--accent-soft)' : 'var(--surface)',
                color: filter === f.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                border: '1px solid ' + (filter === f.id ? 'var(--accent)' : 'var(--border)'),
                cursor: 'pointer'
              }}>{f.label}</button>
          ))}
        </div>
      )}

      {/* List */}
      {shown.length === 0 ? (
        <EmptyState icon={<Icon name="gem" size={20} />} title="ยังไม่มี insight"
          description="ทุกครั้งที่อ่านเจออะไรดี ๆ เก็บไว้ที่นี่ — มันจะกลายเป็นคลังปัญญาส่วนตัวของเล่มนี้"
          compact />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(ins => (
            <InsightCard key={ins.id} insight={ins}
              onToggle={async () => { await toggleInsightDone(ins.id, !ins.is_done); onChange(); }}
              onDelete={async () => { if (confirm('ลบ insight นี้?')) { await deleteInsight(ins.id); onChange(); } }} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, onToggle, onDelete }) {
  const m = KINDS[insight.kind] || KINDS.takeaway;
  const isAction = insight.kind === 'action';
  const isQuote  = insight.kind === 'quote';
  return (
    <div style={{
      padding: '11px 13px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderLeft: '3px solid ' + m.color,
      borderRadius: 'var(--radius-control)',
      display: 'flex', gap: 10, alignItems: 'flex-start',
      opacity: isAction && insight.is_done ? 0.55 : 1,
    }}>
      {isAction ? (
        <button onClick={onToggle} aria-label="toggle"
          style={{
            width: 20, height: 20, flexShrink: 0, marginTop: 1, cursor: 'pointer',
            borderRadius: 5, border: '1.5px solid ' + (insight.is_done ? 'var(--success)' : 'var(--border-strong)'),
            background: insight.is_done ? 'var(--success)' : 'transparent',
            color: 'var(--text-inverse)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{insight.is_done ? <Icon name="check" size={12} /> : ''}</button>
      ) : (
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{m.icon}</span>
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)',
          fontStyle: isQuote ? 'italic' : 'normal',
          textDecoration: isAction && insight.is_done ? 'line-through' : 'none',
        }}>
          {isQuote && '“'}{insight.content}{isQuote && '”'}
        </div>
        {insight.page_ref != null && (
          <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            หน้า {insight.page_ref}
          </div>
        )}
      </div>

      <button onClick={onDelete} aria-label="ลบ"
        style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 2, flexShrink: 0 }}>×</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  VideoStudy — embed + position tracker + understanding score
// ════════════════════════════════════════════════════════════════════════════
function VideoStudy({ source, onSaved }) {
  const videoId = extractVideoId(source.url);
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning]   = useState(false);
  const [score, setScore]       = useState(3);
  const [summary, setSummary]   = useState('');
  const [notes, setNotes]       = useState('');
  const [videoSec, setVideoSec] = useState(source.video_position_sec || 0);
  const [saving, setSaving]     = useState(false);
  const intervalRef = useRef();

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      await createSession({
        source_id: source.id,
        session_date: todayStr(),
        // A timer that was never started recorded 1 minute, which turned a
        // 30-page session into "1,800 หน้า/ชม.".
        duration_min: timerSec >= 30 ? Math.round(timerSec / 60) : null,
        video_from_sec: source.video_position_sec || 0,
        video_to_sec: Number(videoSec) || 0,
        understanding_score: score,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
      });
      setTimerSec(0); setRunning(false);
      setSummary(''); setNotes(''); setScore(3);
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {videoId ? (
        // Fixed black letterbox behind the iframe while it loads — not a themed
        // surface, so intentionally left off the token palette.
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--radius-control)', overflow: 'hidden', background: '#000' }}>
          <iframe
            src={getYouTubeEmbedUrl(videoId, { startSec: source.video_position_sec || 0 })}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <Card padding={20}>
          <EmptyState icon={<Icon name="play" size={20} />} title="ไม่มี YouTube URL" description="แก้ source ใส่ url ก่อนเริ่ม study" compact />
        </Card>
      )}

      <Card>
        <CardHeader eyebrow="Watch Session" title="บันทึกการดูครั้งนี้" />

        <div style={{
          padding: '14px', background: 'var(--background-soft)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}><Icon name="clock" size={13} /> จับเวลา</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 30, fontWeight: 600, color: running ? 'var(--accent-strong)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {String(Math.floor(timerSec/60)).padStart(2,'0')}:{String(timerSec%60).padStart(2,'0')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!running
              ? <Button variant="primary" size="sm" onClick={() => setRunning(true)}><Icon name="play" size={13} /> เริ่ม</Button>
              : <Button variant="secondary" size="sm" onClick={() => setRunning(false)}><Icon name="pause" size={14} /> พัก</Button>}
          </div>
        </div>

        <Field label={`ดูถึงนาทีไหน (วินาที) · ตอนนี้ ${fmt(videoSec)}`}>
          <input type="number" min="0" value={videoSec} onChange={e => setVideoSec(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>

        <ScorePicker value={score} onChange={setScore} />

        <Field label="สรุป (key takeaway 1-2 ข้อ)">
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
            placeholder='เช่น "FVG ที่ใช้ได้จริงต้องมี H1 align กับ M15"'
            style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
        </Field>

        <Field label="Notes / timestamps สำคัญ">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="0:12:30 — Setup A+ · 0:24:15 — example chart"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'var(--f-mono)' }} />
        </Field>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? '...' : 'บันทึก Session'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  GenericStudy — manual session log for podcast/blog/course/udemy
// ════════════════════════════════════════════════════════════════════════════
function GenericStudy({ source, onSaved }) {
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning]   = useState(false);
  const [score, setScore]       = useState(3);
  const [summary, setSummary]   = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const intervalRef = useRef();

  useEffect(() => {
    if (running) intervalRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await createSession({
        source_id: source.id,
        session_date: todayStr(),
        // A timer that was never started recorded 1 minute, which turned a
        // 30-page session into "1,800 หน้า/ชม.".
        duration_min: timerSec >= 30 ? Math.round(timerSec / 60) : null,
        understanding_score: score,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
      });
      setTimerSec(0); setRunning(false); setSummary(''); setNotes(''); setScore(3);
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader eyebrow="Study Session" title="บันทึกการเรียนครั้งนี้" />
      {source.url && (
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm" style={{ marginBottom: 12, display: 'inline-flex' }}>
          <Icon name="link" size={14} /> เปิดลิงก์
        </a>
      )}
      <div style={{
        padding: '14px', background: 'var(--background-soft)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 12,
      }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}><Icon name="clock" size={13} /> จับเวลา</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 30, fontWeight: 600, color: running ? 'var(--accent-strong)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {String(Math.floor(timerSec/60)).padStart(2,'0')}:{String(timerSec%60).padStart(2,'0')}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!running
            ? <Button variant="primary" size="sm" onClick={() => setRunning(true)}><Icon name="play" size={13} /> เริ่ม</Button>
            : <Button variant="secondary" size="sm" onClick={() => setRunning(false)}><Icon name="pause" size={14} /> พัก</Button>}
        </div>
      </div>
      <ScorePicker value={score} onChange={setScore} />
      <Field label="สรุป (key takeaway)">
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
      </Field>
      <Field label="Notes (ไม่บังคับ)">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
      </Field>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? '...' : 'บันทึก Session'}
        </Button>
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Sessions list (timeline)
// ════════════════════════════════════════════════════════════════════════════
function SessionList({ sessions, onDelete }) {
  if (!sessions.length) {
    return <EmptyState icon={<Icon name="history" size={20} />} title="ยังไม่มี session" description="ไปแท็บแรกเพื่อเริ่ม session ของคุณ" compact />;
  }
  return (
    <Card>
      <CardHeader eyebrow={`${sessions.length} sessions`} title="ประวัติการเรียน" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sessions.map(s => (
          <div key={s.id} style={{
            padding: '10px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: s.summary || s.notes ? 6 : 0 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {new Date(s.session_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {s.duration_min ? ` · ${s.duration_min} นาที` : ''}
                  {s.pages_read ? ` · ${s.pages_read} หน้า (p.${s.from_page}–${s.to_page})` : ''}
                  {s.video_to_sec ? ` · ดูถึง ${Math.floor(s.video_to_sec/60)}:${String(s.video_to_sec%60).padStart(2,'0')}` : ''}
                </div>
                {s.understanding_score && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent-strong)' }}>
                    {'★'.repeat(s.understanding_score)}<span style={{ color: 'var(--border-strong)' }}>{'★'.repeat(5 - s.understanding_score)}</span>{' '}
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', fontSize: 10 }}>
                      {s.understanding_score}/5
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => onDelete(s.id)} aria-label="ลบ"
                style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 4 }}>×</button>
            </div>
            {s.summary && (
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', padding: '6px 0 0', borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
                <Icon name="spark" size={13} /> {s.summary}
              </div>
            )}
            {s.notes && (
              <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-secondary)', padding: '6px 0 0', borderTop: '1px dashed var(--border)', whiteSpace: 'pre-wrap' }}>
                {s.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Stats tab
// ════════════════════════════════════════════════════════════════════════════
function StatsTab({ source, stats, insights, onCompletePass }) {
  const isBook = source.type === 'book';
  const progress = source.progress || 0;
  const actionsTotal = insights.filter(i => i.kind === 'action').length;
  const actionsDone  = insights.filter(i => i.kind === 'action' && i.is_done).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <CardHeader eyebrow="Stats" title="สรุปการเรียนเล่มนี้" />

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              {isBook && source.total_pages
                ? `อ่านแล้ว ${source.current_page || 0} / ${source.total_pages} หน้า`
                : 'Progress'}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--accent-strong)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--fill)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'var(--accent)', transition: 'width 300ms' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <Stat label="Streak"       value={stats.streak > 0 ? `${stats.streak} วัน` : '—'} />
          <Stat label="Sessions"        value={stats.sessionsCount} sub={`${stats.readingDays} วันที่อ่าน`} />
          <Stat label="เวลารวม"          value={`${Math.floor(stats.totalMin/60)}h ${stats.totalMin%60}m`} />
          <Stat label="คะแนนเฉลี่ย"      value={stats.avgScore ? `${stats.avgScore.toFixed(1)}/5` : '—'} />
          {isBook && <Stat label="หน้ารวม"     value={`${stats.totalPages}`} sub={`${stats.pagesPerHour.toFixed(0)} หน้า/ชม.`} />}
          {isBook && stats.daysToFinish != null && <Stat label="คาดว่าจบใน" value={`~${stats.daysToFinish} วัน`} sub={`${stats.pagesPerDay.toFixed(0)} หน้า/วัน`} />}
          {isBook && stats.readingCount > 0 && <Stat label="อ่านจบแล้ว"  value={`${stats.readingCount} รอบ`} />}
          {actionsTotal > 0 && <Stat label="ลงมือทำ" value={`${actionsDone}/${actionsTotal}`} sub="action items" />}
        </div>
      </Card>

      {isBook && (
        <Button variant="secondary" fullWidth onClick={onCompletePass}>
          <Icon name="gift" size={14} /> บันทึกว่า "อ่านจบรอบที่ {(source.reading_count || 0) + 1}"
        </Button>
      )}
    </div>
  );
}

// ─── Reusable ───────────────────────────────────────────────────────────────
function ScorePicker({ value, onChange }) {
  const labels = { 1: 'งง', 2: 'ยังไม่ค่อย', 3: 'พอเข้าใจ', 4: 'เข้าใจดี', 5: 'แม่นมาก' };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
        <Icon name="star" size={13} /> ความเข้าใจ session นี้
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className="focus-ring"
            style={{
              padding: '8px 0', flex: 1, borderRadius: 'var(--radius-control)',
              background: value === n ? 'var(--accent-fill)' : 'var(--surface)',
              color: value === n ? 'var(--text-inverse)' : 'var(--text-secondary)',
              border: '1px solid ' + (value === n ? 'var(--accent)' : 'var(--border)'),
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--f-mono)',
            }}>{n}</button>
        ))}
        <span style={{ minWidth: 64, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
          {labels[value]}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--background-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>{label}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: 'var(--fill)', border: '1px solid transparent',
  borderRadius: 'var(--radius-field)', padding: '10px 12px',
  color: 'var(--text-primary)', fontSize: 13, width: '100%',
};
