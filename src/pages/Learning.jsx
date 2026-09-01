import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { thumbBg } from '../lib/helpers.js';
import { useMediaQuery, MOBILE_QUERY } from '../lib/useMediaQuery.js';
import {
  listSources, createSource, updateSource, deleteSource, uploadCoverImage,
  listNotes, createNote, deleteNote,
  extractVideoId, getYouTubeEmbedUrl, getYouTubeThumbnail,
  translateText,
} from '../lib/api/learning.js';
import { StudyDrawer } from '../components/learning/StudyDrawer.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const SOURCE_TYPES = [
  { id: 'youtube', label: 'YouTube',  icon: '▶' },
  { id: 'udemy',   label: 'Udemy',    icon: '🎓' },
  { id: 'book',    label: 'หนังสือ',  icon: '📖' },
  { id: 'podcast', label: 'Podcast',  icon: '🎙' },
  { id: 'blog',    label: 'Blog',     icon: '✍' },
  { id: 'course',  label: 'คอร์ส',   icon: '🏫' },
];

const CATEGORIES = ['TRADING', 'TECH', 'MINDSET', 'FINANCE', 'HEALTH', 'LANGUAGE', 'ART', 'OTHER'];
const TARGET_LANGS = [
  { code: 'th',  label: '🇹🇭 ไทย' },
  { code: 'en',  label: '🇬🇧 English' },
  { code: 'ja',  label: '🇯🇵 日本語' },
  { code: 'zh',  label: '🇨🇳 中文' },
];

// ── Add Source Form (drawer) ──────────────────────────────────────────────────
function AddSourceForm({ onSave, onClose }) {
  const [form, setForm] = useState({
    type: 'youtube', title: '', author: '', url: '', duration_min: '', category: 'TRADING',
    status: 'active', glyph: '', progress: 0, cover_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [autoTitle, setAutoTitle] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleCoverPick = async (file) => {
    if (!file) return;
    setUploadingCover(true); setError(null);
    try {
      const slug = (form.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
      const url  = await uploadCoverImage(file, slug);
      set('cover_url', url);
    } catch (err) { setError(err.message); }
    finally { setUploadingCover(false); }
  };

  // Auto-detect title from YouTube URL
  const handleUrlChange = async (url) => {
    set('url', url);
    if ((form.type === 'youtube' || url.includes('youtu')) && !form.title && url.length > 15) {
      const vid = extractVideoId(url);
      if (vid && !autoTitle) {
        setAutoTitle(true);
        // Use oEmbed to get title (no API key needed)
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
          if (res.ok) {
            const data = await res.json();
            set('title', data.title || '');
            if (data.author_name) set('author', data.author_name);
          }
        } catch {}
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true); setError(null);
    try {
      await createSource({
        type: form.type,
        title: form.title.trim(),
        author: form.author.trim() || null,
        url: form.url.trim() || null,
        duration_min: Number(form.duration_min) || null,
        category: form.category,
        status: 'active',
        progress: 0,
        glyph: form.glyph.trim() || form.title.slice(0, 2),
        cover_url: form.cover_url || null,
      });
      onSave();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', width: 460, height: '100%', background: 'var(--surface)',
        borderLeft: '1px solid var(--line)', padding: 32, overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่มแหล่งเรียน</div>
          <button type="button" onClick={onClose} style={{ color: 'var(--ink-3)', fontSize: 18 }}>×</button>
        </div>

        {/* Type */}
        <div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>ประเภท</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SOURCE_TYPES.map(s => (
              <button key={s.id} type="button" onClick={() => set('type', s.id)}
                style={{
                  padding: '5px 10px', borderRadius: 'var(--r-md)', fontSize: 12,
                  background: form.type === s.id ? 'var(--amber)' : 'var(--surface-2)',
                  color: form.type === s.id ? 'var(--text-inverse)' : 'var(--ink-2)',
                  border: `1px solid ${form.type === s.id ? 'var(--amber)' : 'var(--line)'}`,
                }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* URL */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>
            {form.type === 'youtube' ? '🔗 YouTube URL' : '🔗 URL / ลิงก์'}
          </span>
          <input className="input" type="url" value={form.url} onChange={e => handleUrlChange(e.target.value)}
            placeholder={form.type === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'} />
          {form.type === 'youtube' && extractVideoId(form.url) && (
            <div style={{ fontSize: 11, color: 'var(--profit)', fontFamily: 'var(--f-mono)' }}>
              ✓ พบ Video ID: {extractVideoId(form.url)}
            </div>
          )}
        </label>

        {/* Title */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>ชื่อเรื่อง *</span>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="ชื่อคลิป / หนังสือ / คอร์ส" required />
        </label>

        {/* Author */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>ผู้สร้าง / ผู้เขียน</span>
          <input className="input" value={form.author} onChange={e => set('author', e.target.value)} placeholder="ICT, Ali Abdaal, etc." />
        </label>

        {/* Category + Duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>หมวดหมู่</span>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>ความยาว (นาที)</span>
            <input className="input" type="number" min="0" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} placeholder="60" />
          </label>
        </div>

        {/* Cover image — แทน initials เช่น "TH" ในการ์ด */}
        <div>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)', marginBottom: 8 }}>
            รูปปก {form.type === 'youtube' && '(ไม่ต้องใส่ — ใช้ thumbnail YouTube)'}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {form.cover_url ? (
              <div style={{
                width: 80, height: 110, borderRadius: 'var(--r-md)',
                background: `url(${form.cover_url}) center/cover`,
                border: '1px solid var(--line)', flexShrink: 0,
              }} />
            ) : (
              <div style={{
                width: 80, height: 110, borderRadius: 'var(--r-md)',
                background: 'var(--surface-2)', border: '1px dashed var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-4)', fontSize: 24, flexShrink: 0,
              }}>📚</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <label className="btn btn--ghost" style={{ cursor: 'pointer', textAlign: 'center', fontSize: 12, padding: '8px 12px' }}>
                {uploadingCover ? 'อัพโหลด...' : (form.cover_url ? '🔄 เปลี่ยนรูป' : '📤 อัพโหลดรูปปก')}
                <input type="file" accept="image/*"
                  onChange={e => handleCoverPick(e.target.files?.[0])}
                  style={{ display: 'none' }}
                  disabled={uploadingCover} />
              </label>
              {form.cover_url && (
                <button type="button" onClick={() => set('cover_url', '')}
                  style={{ fontSize: 11, color: 'var(--loss)', textAlign: 'center', padding: '4px' }}>
                  × ลบรูป
                </button>
              )}
              <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)' }}>
                ระบบจะ resize ให้ ≤ 800px อัตโนมัติ
              </div>
            </div>
          </div>
        </div>

        {error && <div style={{ padding: '10px 12px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid var(--loss)', borderRadius: 'var(--r-md)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 'auto' }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>
            {saving ? 'กำลังบันทึก...' : '+ เพิ่มแหล่งเรียน'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Note Card with Translation ─────────────────────────────────────────────────
function NoteCard({ note, onDelete }) {
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [targetLang, setTargetLang] = useState('th');

  const handleTranslate = async () => {
    if (translation && showTranslation) { setShowTranslation(false); return; }
    if (translation) { setShowTranslation(true); return; }
    setTranslating(true);
    try {
      const result = await translateText(note.body, { targetLang });
      setTranslation({ text: result, lang: targetLang });
      setShowTranslation(true);
    } catch (err) {
      alert('แปลไม่ได้: ' + err.message);
    } finally {
      setTranslating(false);
    }
  };

  const handleRetranslate = async () => {
    setTranslating(true);
    try {
      const result = await translateText(note.body, { targetLang });
      setTranslation({ text: result, lang: targetLang });
      setShowTranslation(true);
    } catch (err) {
      alert('แปลไม่ได้: ' + err.message);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--line)',
      borderRadius: 'var(--r-md)', padding: '12px 14px',
    }}>
      {note.title && (
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--amber-2)', marginBottom: 6 }}>
          {note.title}
        </div>
      )}
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>
        {note.body}
      </div>

      {/* Translation output */}
      {showTranslation && translation && (
        <div style={{
          marginTop: 10, padding: '10px 12px',
          background: 'var(--accent-soft)', border: 'none',
          borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.6,
        }}>
          <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--amber-2)', marginBottom: 4}}>
            🌐 แปล → {TARGET_LANGS.find(l => l.code === translation.lang)?.label || translation.lang}
          </div>
          <div style={{ color: 'var(--ink-2)' }}>{translation.text}</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        {/* Translate button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select value={targetLang} onChange={e => { setTargetLang(e.target.value); setTranslation(null); }}
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface-3)', border: '1px solid var(--line)', borderRadius: 4, padding: '2px 4px', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>
            {TARGET_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button onClick={showTranslation && translation?.lang === targetLang ? () => setShowTranslation(false) : (translation?.lang !== targetLang ? handleRetranslate : handleTranslate)}
            disabled={translating}
            style={{
              padding: '3px 9px', borderRadius: 4, fontSize: 11,
              background: showTranslation ? 'var(--amber)' : 'var(--surface-3)',
              color: showTranslation ? 'var(--text-inverse)' : 'var(--ink-3)',
              border: '1px solid var(--line)', cursor: 'pointer',
              fontFamily: 'var(--f-mono)',
            }}>
            {translating ? '⏳' : '🌐 แปล'}
          </button>
        </div>

        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
          {new Date(note.created_at).toLocaleDateString('th-TH')}
        </span>
        <button onClick={onDelete}
          style={{ color: 'var(--ink-4)', fontSize: 13, padding: '2px 4px' }}>×</button>
      </div>
    </div>
  );
}

// ── Study Mode: YouTube Player + Notes ─────────────────────────────────────────
function StudyMode({ source, onBack, onUpdate }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [progress, setProgress] = useState(source.progress || 0);
  const [savingProgress, setSavingProgress] = useState(false);

  const videoId = extractVideoId(source.url);

  const refreshNotes = useCallback(async () => {
    const n = await listNotes({ sourceId: source.id });
    setNotes(n);
  }, [source.id]);

  useEffect(() => { refreshNotes(); }, [refreshNotes]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await createNote({ source_id: source.id, body: noteText.trim(), title: noteTitle.trim() || null });
      setNoteText(''); setNoteTitle('');
      refreshNotes();
    } catch (err) { alert(err.message); } finally { setSavingNote(false); }
  };

  const handleDeleteNote = async (id) => {
    if (!confirm('ลบโน้ตนี้?')) return;
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const handleSaveProgress = async () => {
    setSavingProgress(true);
    try {
      await updateSource(source.id, {
        progress,
        status: progress >= 100 ? 'completed' : 'active',
      });
      onUpdate();
    } catch (err) { alert(err.message); } finally { setSavingProgress(false); }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 0, height: isMobile ? 'auto' : 'calc(100vh - 120px)', overflow: isMobile ? 'visible' : 'hidden' }}>
      {/* Left: Video + controls */}
      <div style={{ overflow: isMobile ? 'visible' : 'auto', padding: isMobile ? '16px 14px' : '24px 20px 24px 40px', borderRight: isMobile ? 'none' : '1px solid var(--line)' }}>
        {/* Back button + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button onClick={onBack} className="btn btn--ghost btn--sm">
            ← Library
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--ink)', lineHeight: 1.3 }}>{source.title}</div>
            {source.author && <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>โดย {source.author}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {source.category && <span className="tag tag--amber">{source.category}</span>}
            <span className="tag">{source.type?.toUpperCase()}</span>
          </div>
        </div>

        {/* YouTube embed */}
        {videoId ? (
          // Fixed black letterbox behind the iframe while it loads — not a themed
          // surface, so intentionally left off the token palette.
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 'var(--r-lg)', overflow: 'hidden', background: '#000', border: '1px solid var(--line)' }}>
            <iframe
              src={getYouTubeEmbedUrl(videoId)}
              title={source.title}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : source.url ? (
          <div style={{ padding: 24, background: 'var(--surface-2)', borderRadius: 'var(--r-lg)', textAlign: 'center' }}>
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="btn btn--primary">
              🔗 เปิดลิงก์ภายนอก
            </a>
          </div>
        ) : null}

        {/* Progress tracker */}
        <div style={{ marginTop: 20, padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)'}}>PROGRESS</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: progress >= 100 ? 'var(--profit)' : 'var(--amber-2)', fontVariantNumeric: 'tabular-nums' }}>{progress}%</div>
          </div>
          <input type="range" min="0" max="100" value={progress} onChange={e => setProgress(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--amber)', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>
            <span>0%</span>
            <span style={{ color: 'var(--amber-2)' }}>{source.duration_min ? `${source.duration_min} นาที` : ''}</span>
            <span>100%</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => setProgress(v)}
                style={{ flex: 1, padding: '4px 0', fontSize: 11, borderRadius: 4, fontFamily: 'var(--f-mono)', background: progress === v ? 'var(--amber-deep)' : 'var(--surface-2)', color: progress === v ? 'var(--text-inverse)' : 'var(--ink-3)', border: '1px solid var(--line)', cursor: 'pointer' }}>
                {v}%
              </button>
            ))}
          </div>
          <button onClick={handleSaveProgress} disabled={savingProgress} className="btn btn--primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}>
            {savingProgress ? '...' : progress >= 100 ? '🎉 เรียนจบแล้ว!' : '💾 บันทึก Progress'}
          </button>
        </div>

        {/* YouTube tips */}
        {videoId && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--success-soft)', border: 'none', borderRadius: 'var(--r-md)' }}>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--profit)', marginBottom: 6}}>💡 เคล็ดลับการเรียน</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
              • กด <strong>CC</strong> เพื่อเปิดซับไตเติ้ล · <strong>Settings → Subtitles → Auto-translate → Thai</strong> เพื่อแปลอัตโนมัติ<br/>
              • จด Key Insight ในช่องโน้ตด้านขวา · กด <strong>🌐 แปล</strong> เพื่อแปลโน้ตข้ามภาษา<br/>
              • กด <strong>.</strong> เพื่อเลื่อนทีละเฟรม · <strong>&lt; &gt;</strong> เพื่อปรับความเร็ว
            </div>
          </div>
        )}
      </div>

      {/* Right: Notes panel */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Notes header */}
        <div style={{ padding: '24px 20px 14px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>โน้ต</div>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{notes.length} รายการ</span>
          </div>
        </div>

        {/* Add note form */}
        <form onSubmit={handleAddNote} style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <input value={noteTitle} onChange={e => setNoteTitle(e.target.value)}
            placeholder="หัวข้อ (ไม่บังคับ)"
            style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)', padding: '4px 0', fontSize: 12, color: 'var(--ink)', marginBottom: 8, outline: 'none', fontFamily: 'var(--f-display)', fontStyle: 'italic' }} />
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder="จด Key Insight ขณะดูวิดีโอ..."
            rows={3}
            style={{ width: '100%', background: 'var(--fill)', border: '1px solid transparent', borderRadius: 'var(--radius-field)', padding: '10px 12px', fontSize: 13, color: 'var(--ink)', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
          <button type="submit" disabled={savingNote || !noteText.trim()} className="btn btn--primary btn--sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {savingNote ? '...' : '+ บันทึกโน้ต'}
          </button>
        </form>

        {/* Notes list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notes.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-4)', padding: '24px 0', fontSize: 13, fontStyle: 'italic' }}>
              ยังไม่มีโน้ต — จดขณะดูวิดีโอได้เลย ☝
            </div>
          ) : (
            notes.map(note => (
              <NoteCard key={note.id} note={note} onDelete={() => handleDeleteNote(note.id)} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Source Card ───────────────────────────────────────────────────────────────
function SourceCard({ source, onClick, onDelete }) {
  const videoId = source.type === 'youtube' ? extractVideoId(source.url) : null;
  // Priority: user-uploaded cover > YouTube thumbnail > letter placeholder
  const thumb = source.cover_url || (videoId ? getYouTubeThumbnail(videoId) : null);
  const typeInfo = SOURCE_TYPES.find(s => s.id === source.type) || SOURCE_TYPES[0];

  return (
    <div className="course-card" style={{ cursor: 'pointer' }} onClick={onClick}>
      <div className="course-thumb" style={{ background: thumb ? 'var(--bg)' : thumbBg(source.type?.toUpperCase()), position: 'relative' }}>
        {thumb ? (
          <img src={thumb} alt={source.title} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--f-display)', fontStyle: 'italic', fontSize: 36, color: 'var(--amber)', opacity: 0.6 }}>
            {source.glyph || typeInfo.icon}
          </div>
        )}
        <div className="course-thumb__src">{source.type?.toUpperCase()}</div>
        {source.type === 'youtube' && videoId && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 150ms' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
          >
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>▶</div>
          </div>
        )}
        <div className="course-thumb__progress">
          <span style={{ width: `${source.progress || 0}%` }} />
        </div>
      </div>
      <div className="course-card__body">
        <div className="course-card__title" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {source.title}
        </div>
        <div className="course-card__meta">
          {source.author && `${source.author} · `}
          {source.duration_min && `${source.duration_min} นาที · `}
          {source.progress > 0 ? `${source.progress}%` : 'ยังไม่เริ่ม'}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          {source.category && <span className="tag tag--amber" style={{ fontSize: 9.5 }}>{source.category}</span>}
          <span className={`tag ${source.status === 'completed' ? 'tag--profit' : ''}`} style={{ fontSize: 9.5 }}>
            {source.status === 'completed' ? '✓ เรียนจบ' : source.status === 'paused' ? '⏸ หยุด' : source.progress > 0 ? '▶ กำลังเรียน' : 'ยังไม่เริ่ม'}
          </span>
          <button onClick={e => { e.stopPropagation(); if (confirm('ลบแหล่งเรียนนี้?')) onDelete(); }}
            style={{ marginLeft: 'auto', color: 'var(--ink-4)', fontSize: 13, padding: '2px 4px' }}>×</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function Learning() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showAddForm, setShowAddForm] = useState(false);
  const [studySource, setStudySource] = useState(null); // source object when in study mode

  const refresh = useCallback(async () => {
    try {
      const data = await listSources();
      setSources(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = tab === 'all' ? sources : sources.filter(s => s.type === tab);

  // Stats
  const totalHours = sources.reduce((s, src) => s + (Number(src.duration_min) || 0), 0);
  const completed = sources.filter(s => s.status === 'completed').length;
  const inProgress = sources.filter(s => s.progress > 0 && s.status !== 'completed').length;
  const featured = sources.find(s => s.progress > 0 && s.progress < 100) || sources[0];

  // Study drawer (replaces old full-page StudyMode — opens as right drawer overlay)
  // StudyMode component kept available for backward compat but no longer auto-rendered

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
      กำลังโหลด...
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={`กำลังเรียน ${inProgress} · เสร็จแล้ว ${completed} · ${Math.round(totalHours / 60)} ชั่วโมง`}
        title="Learning" em="Hub"
        sub="YouTube · หนังสือ · คอร์ส · Podcast · Blog — รวมไว้ที่นี่ พร้อมโน้ตและระบบแปลภาษา"
        meta={<><div>เวลาเรียนสะสม</div><div className="page-header__meta-big">{Math.round(totalHours / 60)} ชม.</div></>}
        actions={<>
          <button className="btn btn--primary" onClick={() => setShowAddForm(true)}>
            <Icon name="plus" size={14}/> เพิ่มแหล่งเรียน
          </button>
        </>}
      />

      <div className="page-body">
        {/* Featured: currently studying */}
        {featured && (
          <div className="dash-hero" style={{ marginBottom: 22 }}>
            <div className="row row--between" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__label">กำลังเรียน · เน้นสัปดาห์นี้</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, lineHeight: 1.15, marginTop: 8, color: 'var(--ink)' }}>
                  <em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>{featured.title}</em>
                </div>
                {featured.author && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
                    โดย {featured.author}
                  </div>
                )}
                <div className="row" style={{ gap: 8, marginTop: 14 }}>
                  {featured.category && <span className="tag tag--amber">{featured.category}</span>}
                  <span className="tag">{featured.type?.toUpperCase()} {featured.duration_min ? `· ${featured.duration_min} นาที` : ''}</span>
                </div>
              </div>
              <button className="btn btn--primary" style={{ padding: '10px 18px', flexShrink: 0 }}
                onClick={() => setStudySource(featured)}>
                {featured.type === 'youtube' ? '▶ เรียนต่อ' : '📖 เปิด'} · {featured.progress || 0}%
              </button>
            </div>
            {featured.progress > 0 && (
              <>
                <div className="budget-bar" style={{ marginTop: 22, height: 3 }}>
                  <div className="budget-bar__fill" style={{ width: `${featured.progress}%` }} />
                </div>
                <div className="row row--between" style={{ marginTop: 10, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                  <span>เริ่มแล้ว</span>
                  <span>เหลือ {Math.round((featured.duration_min || 60) * (1 - (featured.progress || 0) / 100))} นาที</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          {[{ id: 'all', label: `ทั้งหมด (${sources.length})` }, ...SOURCE_TYPES.map(s => ({ id: s.id, label: `${s.icon} ${s.label}` }))].map(t => (
            <button key={t.id} className={`tab ${tab === t.id ? 'tab--active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Source grid */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '48px 0', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
            {tab === 'all' ? 'ยังไม่มีแหล่งเรียน — กด "+ เพิ่มแหล่งเรียน" เพื่อเริ่มต้น' : `ยังไม่มี ${tab} — ลองเพิ่มดูสิ`}
            <br />
            <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => setShowAddForm(true)}>+ เพิ่มแหล่งเรียน</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
            {filtered.map(source => (
              <SourceCard
                key={source.id}
                source={source}
                onClick={() => setStudySource(source)}
                onDelete={() => deleteSource(source.id).then(refresh)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddForm && <AddSourceForm onSave={refresh} onClose={() => setShowAddForm(false)} />}
      {studySource && (
        <StudyDrawer
          source={sources.find(s => s.id === studySource.id) || studySource}
          onClose={() => setStudySource(null)}
          onChange={refresh}
        />
      )}
    </>
  );
}
