import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardHeader, Badge, Button, EmptyState } from '../ui/index.js';
import {
  listSessions, createSession, deleteSession, completeBookPass,
  updateSource, getStudyHints, computeReadingStats,
  extractVideoId, getYouTubeEmbedUrl,
} from '../../lib/api/learning.js';

// ════════════════════════════════════════════════════════════════════════════
//  Main StudyDrawer — open via click on source card
// ════════════════════════════════════════════════════════════════════════════
export function StudyDrawer({ source, onClose, onChange }) {
  const [tab, setTab]     = useState('study');
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!source?.id) return;
    listSessions(source.id).then(setSessions).catch(() => setSessions([]));
  }, [source?.id]);

  const refreshSessions = async () => setSessions(await listSessions(source.id));
  const stats = useMemo(() => computeReadingStats(source, sessions), [source, sessions]);
  const hints = useMemo(() => getStudyHints(source, sessions), [source, sessions]);

  if (!source) return null;

  const isBook  = source.type === 'book';
  const isVideo = source.type === 'youtube';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(40,30,15,0.5)' }} />
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 720, height: '100%',
        background: 'var(--background)', borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>
              {isBook ? '📖 BOOK' : isVideo ? '📺 YOUTUBE' : source.type?.toUpperCase()} · {source.category || '—'}
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.3 }}>
              {source.title}
            </div>
            {source.author && (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                · {source.author}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4, flexShrink: 0 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 24px 0',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {[
            { id: 'study',    label: isBook ? '📖 อ่าน' : '🎬 ดู' },
            { id: 'sessions', label: `📜 Sessions · ${sessions.length}` },
            { id: 'stats',    label: '📊 Stats' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="focus-ring"
              style={{
                padding: '9px 14px', border: 0, background: 'transparent',
                color: tab === t.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                borderBottom: '2px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
                marginBottom: -1, cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--f-body)',
                fontWeight: tab === t.id ? 500 : 400,
              }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Smart hints always visible */}
          {hints.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {hints.map((h, i) => <Hint key={i} {...h} />)}
            </div>
          )}

          {tab === 'study' && (
            isBook  ? <BookStudy source={source} sessions={sessions} onSaved={async () => { await refreshSessions(); onChange?.(); }} /> :
            isVideo ? <VideoStudy source={source} onSaved={async () => { await refreshSessions(); onChange?.(); }} /> :
                      <EmptyState icon="📚" title={`Type "${source.type}" ยังไม่มี study mode`} description="ใช้ Sessions tab บันทึก session แบบ manual" compact />
          )}

          {tab === 'sessions' && (
            <SessionList sessions={sessions} sourceType={source.type}
              onDelete={async (id) => { if (confirm('ลบ session?')) { await deleteSession(id); refreshSessions(); } }} />
          )}

          {tab === 'stats' && <StatsTab source={source} stats={stats} sessions={sessions}
            onCompletePass={async () => { if (confirm(`บันทึกอ่านจบรอบที่ ${(source.reading_count || 0) + 1}?`)) { await completeBookPass(source.id); onChange?.(); onClose(); } }} />}
        </div>
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
//  BookStudy — timer + page tracker + summary
// ════════════════════════════════════════════════════════════════════════════
function BookStudy({ source, sessions, onSaved }) {
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [fromPage, setFromPage] = useState(source.current_page || 0);
  const [toPage, setToPage]     = useState((source.current_page || 0) + 10);
  const [score, setScore]       = useState(3);
  const [summary, setSummary]   = useState('');
  const [notes, setNotes]       = useState('');
  const [totalPages, setTotalPages]   = useState(source.total_pages || '');
  const [saving, setSaving]     = useState(false);
  const intervalRef = useRef();

  // Timer
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setTimerSec(s => s + 1), 1000);
    } else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  // Save total_pages on first set
  const setTotal = async (v) => {
    setTotalPages(v);
    if (v && Number(v) !== source.total_pages) {
      try { await updateSource(source.id, { total_pages: Number(v) }); } catch {}
    }
  };

  const pagesRead = Math.max(0, Number(toPage) - Number(fromPage));
  const fmt = (s) => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const handleSave = async () => {
    if (!summary.trim() && !notes.trim() && timerSec === 0) {
      if (!confirm('ไม่มี timer / summary / notes — บันทึกต่อไหม?')) return;
    }
    setSaving(true);
    try {
      await createSession({
        source_id: source.id,
        duration_min: Math.max(1, Math.round(timerSec / 60)),
        from_page: Number(fromPage), to_page: Number(toPage),
        pages_read: pagesRead,
        understanding_score: score,
        summary: summary.trim() || null,
        notes: notes.trim() || null,
      });
      // Reset for next session
      setTimerSec(0); setRunning(false);
      setFromPage(Number(toPage));
      setToPage(Number(toPage) + 10);
      setSummary(''); setNotes(''); setScore(3);
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader eyebrow="Reading Session" title="บันทึกการอ่านครั้งนี้" />

      {/* Total pages */}
      {!source.total_pages && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            จำนวนหน้าทั้งหมดของหนังสือ:
            <input type="number" min="1" value={totalPages} onChange={e => setTotal(e.target.value)} placeholder="เช่น 320"
              style={{ ...inputStyle, width: 100, fontFamily: 'var(--f-mono)' }} />
          </label>
        </div>
      )}

      {/* Timer */}
      <div style={{
        padding: '20px 16px', background: 'var(--background-soft)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 14,
      }}>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>⏱ TIMER</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 38, fontWeight: 500, color: running ? 'var(--accent-strong)' : 'var(--text-primary)', letterSpacing: '0.05em' }}>
          {fmt(timerSec)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!running
            ? <Button variant="primary" size="md" onClick={() => setRunning(true)}>▶ เริ่ม</Button>
            : <Button variant="secondary" size="md" onClick={() => setRunning(false)}>⏸ พัก</Button>}
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
        <Field label="หน้าสุดท้าย">
          <input type="number" min="0" value={toPage} onChange={e => setToPage(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>
        <div style={{ padding: '8px 14px', background: 'var(--accent-soft)', borderRadius: 'var(--radius-control)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--accent-strong)' }}>อ่าน</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--accent-strong)', fontWeight: 500 }}>{pagesRead}</div>
        </div>
      </div>

      <ScorePicker value={score} onChange={setScore} />

      <Field label="✨ สรุป (1-2 ประโยค ที่ได้จาก session นี้)">
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
          placeholder='เช่น "Mark Douglas บอกว่าทุก trade คือ probability ไม่ใช่ certainty"'
          style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
      </Field>

      <Field label="📝 Notes / quote / pages อ้างอิง (optional)">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="p.45 — 'Best traders are not always right, they just lose less when wrong'"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
      </Field>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? '...' : '💾 บันทึก Session'}
        </Button>
      </div>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  VideoStudy — embed + position tracker + understanding score
// ════════════════════════════════════════════════════════════════════════════
function VideoStudy({ source, onSaved }) {
  const videoId = extractVideoId(source.url);
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [score, setScore]   = useState(3);
  const [summary, setSummary] = useState('');
  const [notes, setNotes]   = useState('');
  const [videoSec, setVideoSec] = useState(source.video_position_sec || 0);
  const [saving, setSaving] = useState(false);
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
        duration_min: Math.max(1, Math.round(timerSec / 60)),
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
      {/* Video */}
      {videoId ? (
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
          <EmptyState icon="📺" title="ไม่มี YouTube URL" description="แก้ source ใส่ url ก่อนเริ่ม study" compact />
        </Card>
      )}

      <Card>
        <CardHeader eyebrow="Watch Session" title="บันทึกการดูครั้งนี้" />

        {/* Timer */}
        <div style={{
          padding: '14px', background: 'var(--background-soft)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.16em' }}>⏱ TIMER</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 30, fontWeight: 500, color: running ? 'var(--accent-strong)' : 'var(--text-primary)' }}>
            {String(Math.floor(timerSec/60)).padStart(2,'0')}:{String(timerSec%60).padStart(2,'0')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!running
              ? <Button variant="primary" size="sm" onClick={() => setRunning(true)}>▶ เริ่ม</Button>
              : <Button variant="secondary" size="sm" onClick={() => setRunning(false)}>⏸ พัก</Button>}
          </div>
        </div>

        {/* Video position */}
        <Field label={`📍 ดูถึงนาทีไหน (วินาที) · ตอนนี้ ${fmt(videoSec)}`}>
          <input type="number" min="0" value={videoSec} onChange={e => setVideoSec(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--f-mono)' }} />
        </Field>

        <ScorePicker value={score} onChange={setScore} />

        <Field label="✨ สรุป (key takeaway 1-2 ข้อ)">
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
            placeholder='เช่น "FVG ที่จะใช้ได้จริงต้องมี H1 align กับ M15"'
            style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
        </Field>

        <Field label="📝 Notes / timestamps สำคัญ">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            placeholder="0:12:30 — Setup A+ definition · 0:24:15 — example chart"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 56, fontFamily: 'var(--f-mono)' }} />
        </Field>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? '...' : '💾 บันทึก Session'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Sessions list
// ════════════════════════════════════════════════════════════════════════════
function SessionList({ sessions, sourceType, onDelete }) {
  if (!sessions.length) {
    return <EmptyState icon="📜" title="ยังไม่มี session" description="ไปที่ tab Study เพื่อเริ่ม session แรก" compact />;
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-secondary)' }}>
                  {new Date(s.session_date).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {s.duration_min ? ` · ${s.duration_min} นาที` : ''}
                  {s.pages_read ? ` · ${s.pages_read} หน้า (p.${s.from_page}–${s.to_page})` : ''}
                  {s.video_to_sec ? ` · ดูถึง ${Math.floor(s.video_to_sec/60)}:${String(s.video_to_sec%60).padStart(2,'0')}` : ''}
                </div>
                {s.understanding_score && (
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--accent-strong)' }}>
                    {'★'.repeat(s.understanding_score)}{'☆'.repeat(5 - s.understanding_score)}{' '}
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', fontSize: 10 }}>
                      ความเข้าใจ {s.understanding_score}/5
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => onDelete(s.id)} aria-label="ลบ"
                style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 4 }}>×</button>
            </div>
            {s.summary && (
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', padding: '6px 0', borderTop: '1px solid var(--border)', lineHeight: 1.6 }}>
                ✨ {s.summary}
              </div>
            )}
            {s.notes && (
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--f-mono)', padding: '6px 0 0', borderTop: '1px dashed var(--border)', whiteSpace: 'pre-wrap' }}>
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
function StatsTab({ source, stats, sessions, onCompletePass }) {
  const isBook = source.type === 'book';
  const progress = source.progress || 0;
  return (
    <Card>
      <CardHeader eyebrow="Stats" title="สรุปการเรียน source นี้" />

      {/* Progress */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isBook && source.total_pages
              ? `อ่านแล้ว ${source.current_page || 0} / ${source.total_pages} หน้า`
              : `Progress`}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--accent-strong)', fontWeight: 500 }}>{progress}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface-muted)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 300ms' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
        <Stat label="Sessions"        value={stats.sessionsCount} />
        <Stat label="เวลารวม"           value={`${Math.floor(stats.totalMin/60)}h ${stats.totalMin%60}m`} />
        {isBook && <Stat label="หน้ารวม"      value={`${stats.totalPages}`} sub={`${stats.pagesPerHour.toFixed(1)} หน้า/ชม.`} />}
        <Stat label="คะแนนเฉลี่ย"      value={stats.avgScore ? `${stats.avgScore.toFixed(1)}/5` : '—'} />
        {isBook && stats.readingCount > 0 && <Stat label="อ่านจบไปแล้ว"  value={`${stats.readingCount} รอบ`} />}
      </div>

      {isBook && (
        <Button variant="secondary" fullWidth onClick={onCompletePass}>
          🎁 บันทึกว่า "อ่านจบรอบที่ {(source.reading_count || 0) + 1}"
        </Button>
      )}
    </Card>
  );
}

// ─── Reusable ───────────────────────────────────────────────────────────────
function ScorePicker({ value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', letterSpacing: '0.12em', marginBottom: 6 }}>
        ⭐ ความเข้าใจ session นี้
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} className="focus-ring"
            style={{
              padding: '8px 14px', borderRadius: 'var(--radius-control)',
              background: value === n ? 'var(--accent)' : 'var(--surface)',
              color: value === n ? 'var(--text-inverse)' : 'var(--text-secondary)',
              border: '1px solid ' + (value === n ? 'var(--accent)' : 'var(--border)'),
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
              fontFamily: 'var(--f-mono)', minWidth: 44,
            }}>{n}</button>
        ))}
        <span style={{ alignSelf: 'center', marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          {value === 1 && 'งง'}
          {value === 2 && 'ยังไม่ค่อย'}
          {value === 3 && 'พอเข้าใจ'}
          {value === 4 && 'เข้าใจดี'}
          {value === 5 && 'แม่นมาก'}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--background-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--text-primary)', fontWeight: 500, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', letterSpacing: '0.12em' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle = {
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-control)', padding: '8px 11px',
  color: 'var(--text-primary)', fontSize: 13, width: '100%',
};
