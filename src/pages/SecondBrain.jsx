import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { Badge, EmptyState } from '../components/ui/index.js';
import {
  listNotes, listAllTags, listBacklinks, parseWikiLinks,
  createNote, updateNote, deleteNote,
} from '../lib/api/notes.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatStamp(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function snippet(body, n = 90) {
  const clean = (body || '').replace(/\[\[([^\[\]]+)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n) + '…' : clean;
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
function NoteEditor({ note, titleIndex, onPatch, onDelete, onOpenTitle, backlinks }) {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody]   = useState(note.body || '');
  const [tagInput, setTagInput] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    setTitle(note.title || '');
    setBody(note.body || '');
    setTagInput('');
  }, [note.id]);

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

  // Insert a [[ ]] template at the cursor in the body.
  const insertLinkTemplate = () => {
    const el = bodyRef.current;
    const pos = el ? el.selectionStart : body.length;
    const next = body.slice(0, pos) + '[[]]' + body.slice(pos);
    setBody(next);
    requestAnimationFrame(() => {
      if (el) { el.focus(); el.selectionStart = el.selectionEnd = pos + 2; }
    });
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
          value={body} onChange={e => setBody(e.target.value)} onBlur={saveBody}
          placeholder="เขียนอะไรก็ได้... พิมพ์ [[ชื่อโน้ต]] เพื่อลิงก์ไปโน้ตอื่น"
          style={{
            width: '100%', minHeight: 320, resize: 'vertical',
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
            padding: '14px 16px', fontFamily: 'var(--f-body)', fontSize: 14.5, lineHeight: 1.7,
            color: 'var(--ink)', outline: 'none',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        />
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
      const idx = new Map();
      if (search.trim() || activeTag) {
        const all = await listNotes({});
        for (const n of all) idx.set(n.title.toLowerCase(), n.id);
      } else {
        for (const n of list) idx.set(n.title.toLowerCase(), n.id);
      }
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

  const handleNew = async () => {
    const note = await createNote({ title: 'ไม่มีชื่อ', body: '' });
    setNotes(prev => [note, ...prev]);
    setSelectedId(note.id);
    setTitleIndex(prev => new Map(prev).set(note.title.toLowerCase(), note.id));
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
    const id = titleIndex.get(title.toLowerCase());
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
    setTitleIndex(prev => new Map(prev).set(note.title.toLowerCase(), note.id));
  };

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
          <button className="btn btn--primary" onClick={handleNew}>
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
            onAction={handleNew}
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
    </>
  );
}
