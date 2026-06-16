import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Badge, EmptyState } from '../components/ui/index.js';
import {
  listNotes, listAllTags, listBacklinks, parseWikiLinks,
  createNote, updateNote, deleteNote,
} from '../lib/api/notes.js';
import { NOTE_TEMPLATES, fillTemplateTokens } from '../lib/noteTemplates.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatStamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function snippet(body, n = 90) {
  const clean = (body || '').replace(/\[\[([^\[\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
}

// Pixel position of the caret (at `position`) inside a textarea, relative to its
// own padding box — used to anchor the [[link]] autocomplete dropdown. Mirror-div
// technique: clone the textarea's text styling into a hidden div and measure a span.
const MIRROR_PROPS = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight',
  'fontFamily', 'textAlign', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
];
function caretCoords(el, position) {
  const cs = window.getComputedStyle(el);
  const div = document.createElement('div');
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  MIRROR_PROPS.forEach(p => { div.style[p] = cs[p]; });
  div.textContent = el.value.slice(0, position);
  const span = document.createElement('span');
  span.textContent = el.value.slice(position) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const coords = {
    top: span.offsetTop + parseInt(cs.borderTopWidth || '0', 10),
    left: span.offsetLeft + parseInt(cs.borderLeftWidth || '0', 10),
    height: parseInt(cs.lineHeight, 10) || 20,
  };
  document.body.removeChild(div);
  return coords;
}

// ── Note list item ──────────────────────────────────────────────────────────
function NoteListItem({ note, active, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', width: '100%',
        padding: '11px 13px', borderRadius: 'var(--r-md)', cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--surface)',
        transition: 'all 120ms',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'var(--surface)'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {note.pinned && <span style={{ color: 'var(--accent-strong)', fontSize: 11 }}>📌</span>}
        <span style={{
          fontFamily: 'var(--f-display)', fontSize: 14.5, fontWeight: 500, color: 'var(--ink)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>{note.title || 'ไม่มีชื่อ'}</span>
      </div>
      {snippet(note.body) && (
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {snippet(note.body)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {(note.tags || []).slice(0, 3).map(t => (
          <span key={t} style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--accent-strong)' }}>#{t}</span>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-4)' }}>
          {formatStamp(note.updated_at)}
        </span>
      </div>
    </button>
  );
}

// ── Note editor ───────────────────────────────────────────────────────────────
function NoteEditor({ note, titleIndex, allTitles, onPatch, onDelete, onOpenTitle, backlinks }) {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody]   = useState(note.body || '');
  const [tagInput, setTagInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const bodyRef = useRef(null);

  // [[link]] autocomplete
  const [linkCtx, setLinkCtx] = useState(null); // { query, open, cursor, xy } | null
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    setTitle(note.title || '');
    setBody(note.body || '');
    setTagInput('');
    setLinkCtx(null);
  }, [note.id]);

  // Titles that match the active [[query]] (excluding this note's own title).
  const suggestions = useMemo(() => {
    if (linkCtx == null) return [];
    const q = linkCtx.query.trim().toLowerCase();
    const self = (note.title || '').toLowerCase();
    const pool = (allTitles || []).filter(t => t.toLowerCase() !== self);
    const scored = pool
      .map(t => {
        const lt = t.toLowerCase();
        if (!q) return { t, rank: 2 };
        if (lt.startsWith(q)) return { t, rank: 0 };
        if (lt.includes(q)) return { t, rank: 1 };
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => a.rank - b.rank || a.t.localeCompare(b.t));
    return scored.slice(0, 6).map(s => s.t);
  }, [linkCtx, allTitles, note.title]);

  // Detect whether the caret sits inside an unclosed [[ … and refresh the dropdown.
  const refreshLinkCtx = (el) => {
    const val = el.value;
    const cur = el.selectionStart;
    const upto = val.slice(0, cur);
    const open = upto.lastIndexOf('[[');
    if (open === -1) { setLinkCtx(null); return; }
    const between = upto.slice(open + 2);
    if (between.includes(']]') || between.includes('\n')) { setLinkCtx(null); return; }
    setActiveIdx(0);
    setLinkCtx({ query: between, open, cursor: cur, xy: caretCoords(el, open) });
  };

  const selectSuggestion = (chosen) => {
    if (!chosen || linkCtx == null) return;
    const { open, cursor } = linkCtx;
    const after = body.slice(cursor);
    const hasClose = after.startsWith(']]');
    const insert = `[[${chosen}]]`;
    const newBody = body.slice(0, open) + insert + (hasClose ? after.slice(2) : after);
    setBody(newBody);
    setLinkCtx(null);
    onPatch(note.id, { body: newBody });
    flashSaved();
    const caret = open + insert.length;
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = caret; }
    });
  };

  const flashSaved = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200); };

  const saveTitle = () => {
    const t = title.trim() || 'ไม่มีชื่อ';
    if (t !== note.title) { onPatch(note.id, { title: t }); flashSaved(); }
  };
  const saveBody = () => {
    if (body !== note.body) { onPatch(note.id, { body }); flashSaved(); }
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    if (!(note.tags || []).includes(t)) {
      onPatch(note.id, { tags: [...(note.tags || []), t] });
      flashSaved();
    }
    setTagInput('');
  };
  const removeTag = (t) => {
    onPatch(note.id, { tags: (note.tags || []).filter(x => x !== t) });
    flashSaved();
  };

  // Insert a [[ ]] template at the cursor and open the autocomplete dropdown.
  const insertLinkTemplate = () => {
    const el = bodyRef.current;
    const pos = el ? el.selectionStart : body.length;
    const next = body.slice(0, pos) + '[[]]' + body.slice(pos);
    setBody(next);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = pos + 2;
        refreshLinkCtx(el);
      }
    });
  };

  const handleBodyKeyDown = (e) => {
    if (linkCtx != null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions[activeIdx]); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setLinkCtx(null); return; }
    }
  };

  const outgoing = parseWikiLinks(body);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
      {/* Title + actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          placeholder="ชื่อโน้ต..."
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--f-display)', fontSize: 26, fontWeight: 500, color: 'var(--ink)',
            borderBottom: '1px solid var(--line)', padding: '2px 0 8px',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 4 }}>
          <button onClick={() => { onPatch(note.id, { pinned: !note.pinned }); }}
            title={note.pinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
            style={{ padding: '6px 8px', borderRadius: 'var(--r-sm)', fontSize: 14,
              color: note.pinned ? 'var(--accent-strong)' : 'var(--ink-4)', cursor: 'pointer' }}>
            📌
          </button>
          <button onClick={() => onDelete(note.id)} title="ลบโน้ต"
            style={{ padding: '6px 8px', borderRadius: 'var(--r-sm)', fontSize: 16, color: 'var(--ink-4)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--ink-4)'}>×</button>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {(note.tags || []).map(t => (
          <span key={t} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--accent-soft)', color: 'var(--accent-strong)',
            borderRadius: 'var(--radius-pill)', padding: '3px 10px',
            fontFamily: 'var(--f-mono)', fontSize: 10.5,
          }}>
            #{t}
            <button onClick={() => removeTag(t)} style={{ color: 'var(--accent-strong)', fontSize: 12, lineHeight: 1, cursor: 'pointer', opacity: 0.6 }}>×</button>
          </span>
        ))}
        <input
          value={tagInput} onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          onBlur={addTag}
          placeholder="+ แท็ก"
          style={{
            background: 'transparent', border: '1px dashed var(--border-strong)', outline: 'none',
            borderRadius: 'var(--radius-pill)', padding: '3px 10px', width: 90,
            fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-2)',
          }}
        />
      </div>

      {/* Body */}
      <div style={{ position: 'relative' }}>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={e => { setBody(e.target.value); refreshLinkCtx(e.target); }}
          onKeyDown={handleBodyKeyDown}
          onKeyUp={e => { if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) refreshLinkCtx(e.target); }}
          onClick={e => refreshLinkCtx(e.target)}
          onScroll={() => { if (linkCtx) setLinkCtx(null); }}
          onBlur={() => { saveBody(); setLinkCtx(null); }}
          placeholder="เขียนอะไรก็ได้... พิมพ์ [[ชื่อโน้ต]] เพื่อลิงก์ไปโน้ตอื่น"
          style={{
            width: '100%', minHeight: 320, resize: 'vertical',
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
            padding: '14px 16px', fontFamily: 'var(--f-body)', fontSize: 14.5, lineHeight: 1.7,
            color: 'var(--ink)', outline: 'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        />

        {/* [[link]] autocomplete dropdown */}
        {linkCtx != null && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', zIndex: 20,
            top: (linkCtx.xy.top - (bodyRef.current?.scrollTop || 0) + linkCtx.xy.height + 2),
            left: Math.min(linkCtx.xy.left, 260),
            minWidth: 200, maxWidth: 320,
            background: 'var(--surface)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-pop)', padding: 4, overflow: 'hidden',
          }}>
            {suggestions.map((t, i) => (
              <button key={t}
                onMouseDown={e => { e.preventDefault(); selectSuggestion(t); }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  background: i === activeIdx ? 'var(--accent-soft)' : 'transparent',
                  color: i === activeIdx ? 'var(--accent-strong)' : 'var(--ink)', fontSize: 13.5,
                }}>
                <span style={{ fontSize: 11 }}>🔗</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
              </button>
            ))}
            <div style={{ padding: '4px 10px 2px', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>
              ↑↓ เลือก · Enter ยืนยัน · Esc ปิด
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button onClick={insertLinkTemplate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--accent-strong)', cursor: 'pointer',
              border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', padding: '4px 9px' }}>
            [[ ]] แทรกลิงก์
          </button>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: savedFlash ? 'var(--success)' : 'var(--ink-4)', transition: 'color 200ms' }}>
            {savedFlash ? '✓ บันทึกแล้ว' : 'บันทึกอัตโนมัติเมื่อคลิกออก'}
          </span>
        </div>
      </div>

      {/* Outgoing links */}
      {outgoing.length > 0 && (
        <div>
          <div className="card__label" style={{ marginBottom: 8 }}>ลิงก์ในโน้ตนี้</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {outgoing.map(t => {
              const exists = titleIndex.has(t.toLowerCase());
              return (
                <button key={t} onClick={() => onOpenTitle(t)}
                  title={exists ? 'เปิดโน้ต' : 'สร้างโน้ตใหม่'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: 12.5, padding: '4px 11px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                    border: `1px solid ${exists ? 'var(--accent)' : 'var(--border-strong)'}`,
                    background: exists ? 'var(--accent-soft)' : 'transparent',
                    color: exists ? 'var(--accent-strong)' : 'var(--ink-3)',
                    fontStyle: exists ? 'normal' : 'italic',
                  }}>
                  {exists ? '🔗' : '+'} {t}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Backlinks */}
      <div>
        <div className="card__label" style={{ marginBottom: 8 }}>
          ถูกอ้างถึงจาก {backlinks.length > 0 && <Badge tone="accent" size="sm">{backlinks.length}</Badge>}
        </div>
        {backlinks.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ink-4)', fontStyle: 'italic' }}>
            ยังไม่มีโน้ตอื่นลิงก์มาที่นี่
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {backlinks.map(b => (
              <button key={b.id} onClick={() => onOpenTitle(b.title)}
                style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left',
                  padding: '8px 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                  border: '1px solid var(--line)', background: 'var(--surface)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
                  ← {b.title}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{snippet(b.body, 70)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template picker ───────────────────────────────────────────────────────────
function TemplatePicker({ onPick, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 28, width: 560, maxWidth: '100%',
        maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-pop)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div className="card__label" style={{ marginBottom: 4 }}>เริ่มโน้ตใหม่</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500 }}>เลือกเทมเพลต</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: 'var(--ink-4)', cursor: 'pointer', padding: 4 }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {NOTE_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => onPick(t)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 11, textAlign: 'left',
                padding: '13px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                border: '1px solid var(--line)', background: 'var(--surface)', transition: 'all 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--line)'; }}>
              <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{t.emoji}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontFamily: 'var(--f-display)', fontSize: 14.5, fontWeight: 500, color: 'var(--ink)' }}>{t.name}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export function SecondBrain() {
  const [notes, setNotes] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [titleIndex, setTitleIndex] = useState(new Map());
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [backlinks, setBacklinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  const selected = notes.find(n => n.id === selectedId) || null;

  const refresh = useCallback(async () => {
    try {
      const [list, tags] = await Promise.all([
        listNotes({ search, tag: activeTag }),
        listAllTags(),
      ]);
      setNotes(list);
      setAllTags(tags);
      // Title index for resolving [[wiki links]] (always the full set).
      // Keyed by lowercase title → { id, title } so we keep the original case.
      const idx = new Map();
      const source = (search.trim() || activeTag) ? await listNotes({}) : list;
      for (const n of source) idx.set(n.title.toLowerCase(), { id: n.id, title: n.title });
      setTitleIndex(idx);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [search, activeTag]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load backlinks whenever the selected note (or its title) changes.
  useEffect(() => {
    let cancelled = false;
    if (!selected) { setBacklinks([]); return; }
    listBacklinks(selected.title)
      .then(b => { if (!cancelled) setBacklinks(b.filter(x => x.id !== selected.id)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selected?.id, selected?.title]);

  const handlePatch = async (id, patch) => {
    const updated = await updateNote(id, patch);
    setNotes(prev => prev.map(n => n.id === id ? updated : n));
    if (patch.title || patch.tags) refresh();
  };

  const handlePickTemplate = async (tmpl) => {
    setShowTemplates(false);
    const title = fillTemplateTokens(tmpl.title) || 'ไม่มีชื่อ';
    const body  = fillTemplateTokens(tmpl.body) || '';
    const note = await createNote({ title, body, tags: tmpl.tags || [] });
    setNotes(prev => [note, ...prev]);
    setSelectedId(note.id);
    setTitleIndex(prev => new Map(prev).set(note.title.toLowerCase(), { id: note.id, title: note.title }));
    if (tmpl.tags?.length) refresh();
  };

  const handleDelete = async (id) => {
    if (!confirm('ลบโน้ตนี้?')) return;
    await deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  // Open an existing note by title, or create one if it doesn't exist yet.
  const handleOpenTitle = async (title) => {
    const id = titleIndex.get(title.toLowerCase())?.id;
    if (id) {
      const inList = notes.find(n => n.id === id);
      if (inList) { setSelectedId(id); return; }
      // Filtered out of current view — clear filters then select.
      setSearch(''); setActiveTag(''); setSelectedId(id);
      return;
    }
    const note = await createNote({ title, body: '' });
    setNotes(prev => [note, ...prev]);
    setSelectedId(note.id);
    setTitleIndex(prev => new Map(prev).set(note.title.toLowerCase(), { id: note.id, title: note.title }));
  };

  const allTitles = useMemo(() => [...titleIndex.values()].map(v => v.title), [titleIndex]);

  return (
    <>
      <PageHeader
        eyebrow="Second Brain · จัดระเบียบความคิด"
        title="Second" em="Brain"
        sub="โน้ตทั้งหมดของคุณในที่เดียว — เชื่อมโยงกันด้วย [[ลิงก์]] แบบ Zettelkasten"
        meta={<>
          <div>โน้ตทั้งหมด</div>
          <div className="page-header__meta-big">{notes.length}</div>
        </>}
        actions={
          <button className="btn btn--primary" onClick={() => setShowTemplates(true)}>
            <Icon name="plus" size={14} /> โน้ตใหม่
          </button>
        }
      />

      <div className="page-body">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
            กำลังโหลด...
          </div>
        ) : notes.length === 0 && !search && !activeTag ? (
          <EmptyState
            icon="✦"
            title="เริ่มต้น Second Brain ของคุณ"
            description="จดทุกอย่างที่อยากจำ ความคิด ไอเดีย บทเรียน แล้วเชื่อมโยงกันด้วย [[ลิงก์]] — ค้นเจอได้เสมอ"
            actionLabel="+ สร้างโน้ตแรก"
            onAction={() => setShowTemplates(true)}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
            {/* Left: search + tags + list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', display: 'inline-flex' }}>
                  <Icon name="search" size={15} />
                </span>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="ค้นหาโน้ต..."
                  className="input" style={{ paddingLeft: 34 }}
                />
              </div>

              {allTags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setActiveTag('')}
                    style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, padding: '3px 10px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                      border: `1px solid ${!activeTag ? 'var(--accent)' : 'var(--line)'}`,
                      background: !activeTag ? 'var(--accent-soft)' : 'transparent',
                      color: !activeTag ? 'var(--accent-strong)' : 'var(--ink-3)' }}>
                    ทั้งหมด
                  </button>
                  {allTags.map(({ tag, count }) => (
                    <button key={tag} onClick={() => setActiveTag(activeTag === tag ? '' : tag)}
                      style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, padding: '3px 10px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                        border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--line)'}`,
                        background: activeTag === tag ? 'var(--accent-soft)' : 'transparent',
                        color: activeTag === tag ? 'var(--accent-strong)' : 'var(--ink-3)' }}>
                      #{tag} · {count}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '24px 0', fontSize: 13 }}>
                    ไม่พบโน้ตที่ตรงกับการค้นหา
                  </div>
                ) : (
                  notes.map(n => (
                    <NoteListItem key={n.id} note={n} active={n.id === selectedId} onClick={() => setSelectedId(n.id)} />
                  ))
                )}
              </div>
            </div>

            {/* Right: editor */}
            <div className="card" style={{ minHeight: 480 }}>
              {selected ? (
                <NoteEditor
                  key={selected.id}
                  note={selected}
                  titleIndex={titleIndex}
                  allTitles={allTitles}
                  backlinks={backlinks}
                  onPatch={handlePatch}
                  onDelete={handleDelete}
                  onOpenTitle={handleOpenTitle}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 440, gap: 10, color: 'var(--ink-3)', textAlign: 'center' }}>
                  <Icon name="brain" size={32} />
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 16 }}>เลือกโน้ตทางซ้าย</div>
                  <div style={{ fontSize: 13 }}>หรือกด "โน้ตใหม่" เพื่อเริ่มเขียน</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showTemplates && (
        <TemplatePicker onPick={handlePickTemplate} onClose={() => setShowTemplates(false)} />
      )}
    </>
  );
}
