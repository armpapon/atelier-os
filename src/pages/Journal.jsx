import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../components/Icon.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { DayCountdown } from '../components/DayCountdown.jsx';
import {
  getPartnerId,
  listEntries, listRecentDates, listUpcomingEvents, listEntriesInRange,
  createEntry, bulkCreateEntries, toggleEntry, updateEntry, deleteEntry,
  getMoodForDate, upsertMood,
  listHabits, createHabit, deleteHabit,
  getHabitLogsForDate, toggleHabitLog,
  listEntriesByGcalIds, deleteEntriesByIds,
} from '../lib/api/journal.js';
import { startGoogleAuth, getIntegration, callProvider, listGmailDismissed, dismissGmailThread, ALL_GOOGLE_SCOPES } from '../lib/integrations.js';
import { listShopeeOrders, saveShopeeOrders, setShopeeState } from '../lib/api/shopee.js';
import { getCache, setCache, cacheAge, STALE_MS, fmtSyncClock } from '../lib/sessionCache.js';
import { AsanaHours } from '../components/AsanaHours.jsx';
import { SheetTimeline } from '../components/SheetTimeline.jsx';
import { todayStr, toLocalYMD } from '../lib/dates.js';
import { useAuth } from '../lib/useAuth.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateThai(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
}

function weekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { weekday: 'short' });
}

// "12:00–13:00" when the calendar gave an end time, else just "12:00"
function fmtEventRange(entry) {
  if (!entry?.event_time) return '';
  const start = entry.event_time.slice(0, 5);
  const end = entry.event_end_time ? entry.event_end_time.slice(0, 5) : null;
  return end ? `${start}–${end}` : start;
}

// Which bullet types can be ticked "done" — meetings pulled from the calendar
// are checkable too, so you can mark them handled.
function isCheckable(entry) {
  return entry?.bullet_type === 'task' || entry?.bullet_type === 'event';
}

function relativeDayLabel(dateStr) {
  const diffDays = Math.round(
    (new Date(dateStr + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 86400000
  );
  if (diffDays === 0) return 'วันนี้';
  if (diffDays === 1) return 'พรุ่งนี้';
  return `${formatDateShort(dateStr)} · ${weekday(dateStr)}`;
}

function pad2cal(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad2cal(m + 1)}-${pad2cal(d)}`; }

const CAL_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// ── Mini month calendar ─────────────────────────────────────────────────────
function MiniCalendar({ monthDate, selected, activity, onPick, onPrev, onNext }) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const today = todayStr();
  const firstWeekday = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = monthDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });

  return (
    <div className="card">
      <div className="cal-head">
        <button onClick={onPrev} aria-label="เดือนก่อน"
          style={{ color: 'var(--ink-2)', fontSize: 16, padding: '2px 8px', cursor: 'pointer', background: 'none', border: 0 }}>‹</button>
        <b style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{monthLabel}</b>
        <button onClick={onNext} aria-label="เดือนถัดไป"
          style={{ color: 'var(--ink-2)', fontSize: 16, padding: '2px 8px', cursor: 'pointer', background: 'none', border: 0 }}>›</button>
      </div>
      <div className="cal-grid">
        {CAL_WEEKDAYS.map((w, i) => <div key={`wd${i}`} className="wd">{w}</div>)}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = ymd(y, m, d);
          const act = activity.get(ds);
          const isSel = ds === selected;
          const isToday = ds === today;
          return (
            <button key={i} onClick={() => onPick(ds)}
              className={`d${isToday ? ' today' : ''}${isSel && !isToday ? ' sel' : ''}`}>
              {d}
              {act && <span className="dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Build a "https://calendar.google.com/.../render?action=TEMPLATE" link — opens
// Google Calendar's add-event dialog pre-filled, no OAuth needed.
function buildGCalUrl({ text, note, location, event_time, event_end_time }, date) {
  const ymd = date.replace(/-/g, '');
  let dates;
  if (event_time) {
    const start = event_time.slice(0, 5).replace(':', '');
    let end = event_end_time ? event_end_time.slice(0, 5).replace(':', '') : null;
    if (!end) {
      const [h, m] = event_time.slice(0, 5).split(':').map(Number);
      end = `${pad2((h + 1) % 24)}${pad2(m)}`;
    }
    dates = `${ymd}T${start}00/${ymd}T${end}00`;
  } else {
    const d = new Date(date + 'T00:00:00');
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nextYmd = `${next.getFullYear()}${pad2(next.getMonth() + 1)}${pad2(next.getDate())}`;
    dates = `${ymd}/${nextYmd}`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: text || '', dates,
    details: note || '', location: location || '', ctz: 'Asia/Bangkok',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Parse pasted calendar/notes text into journal entries.
// Lines starting with a time (09:30 / 9.30 / 13:30 - 14:00) become timed events;
// the rest become tasks. Leading bullet/checkbox markers are stripped.
function parseScheduleText(text, date) {
  const out = [];
  // Pasted calendar text arrives with CRLF (Outlook), bare CR (some Mac apps)
  // and U+2028/U+2029 line separators — splitting on '\n' alone glued whole
  // schedules into one entry.
  for (const raw of (text || '').split(/\r\n|\r|\n|\u2028|\u2029/)) {
    // Strip leading noise (emoji, checkmarks, bullets, dashes, spaces) but keep
    // digits, letters (incl. Thai) and "[" so "[MKT] ..." survives.
    let s = raw.replace(/^[^\p{L}\p{N}[]+/u, '').trim();
    if (!s) continue;
    const m = s.match(/^(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*\d{1,2}[:.]\d{2})?\s*[:.-]?\s*(.*)$/);
    if (m && Number(m[1]) <= 23) {
      const hh = String(Number(m[1])).padStart(2, '0');
      out.push({ entry_date: date, bullet_type: 'event', text: (m[3].trim() || 'ประชุม'), tag: null, event_time: `${hh}:${m[2]}:00`, event_end_time: null, done: false });
    } else {
      // Same key set on every row — PostgREST rejects a bulk insert whose
      // objects don't all share the same shape.
      out.push({ entry_date: date, bullet_type: 'task', text: s, tag: null, event_time: null, event_end_time: null, done: false });
    }
  }
  out.sort((a, b) => (a.event_time || '99').localeCompare(b.event_time || '99'));
  return out;
}

// ── Paste schedule modal ────────────────────────────────────────────────────
function PasteScheduleModal({ date, onSave, onClose }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = parseScheduleText(text, date);
  const eventCount = parsed.filter(p => p.bullet_type === 'event').length;

  const submit = async () => {
    if (!parsed.length) return;
    setSaving(true);
    try { await bulkCreateEntries(parsed); onSave(); onClose(); }
    catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', padding: 26, width: 520, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, fontWeight: 500 }}>วางตารางจาก Calendar</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4 }}>
            ก๊อปตารางประชุมทั้งวันจาก Google Calendar มาวาง — ระบบจะแยกเวลา เรียงลำดับ และทำเป็นรายการติ๊กได้ให้
          </div>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} autoFocus rows={9}
          placeholder={'09:30 [MKT] รวม Report\n13:30 โปรที่ชอบ Update\n17:00 Meeting AE'}
          className="input" style={{ resize: 'vertical', fontFamily: 'var(--f-mono)', fontSize: 12.5, lineHeight: 1.6 }} />
        {parsed.length > 0 && (
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
            จะเพิ่ม {parsed.length} รายการ · มีเวลา {eventCount} · งาน {parsed.length - eventCount}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving || !parsed.length}>
            {saving ? '...' : `+ เพิ่ม ${parsed.length} รายการ`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Google Calendar — connect + pull the day's meetings into the checklist ────
// Colleagues sit on this domain; anyone else emailing in is treated as a client.
const ORG_DOMAIN = 'sealinteractive.com';

// Local HH:MM:SS from an RFC3339 dateTime (browser tz = user's tz).
function hms(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Map one Google Calendar event → a journal entry for `date`.
function gcalEventToEntry(ev, date) {
  const row = {
    entry_date: date, bullet_type: 'event', done: false, tag: null,
    gcal_event_id: ev.id || null,   // stable id → re-imports update, not duplicate
    text: (ev.summary || 'ประชุม').trim(),
    location: ev.location ? ev.location.trim() : null,
    // Always present, always the same keys — bulk insert needs a uniform shape.
    event_time: null,
    event_end_time: null,
  };
  if (ev.start?.dateTime) {                       // timed event
    // A multi-day event spills into this day but STARTED on another one; its
    // start clock belongs to the origin day, so showing it here was a lie.
    const startsHere = toLocalYMD(new Date(ev.start.dateTime)) === date;
    if (startsHere) {
      row.event_time = hms(ev.start.dateTime);
      if (ev.end?.dateTime) row.event_end_time = hms(ev.end.dateTime);
    }
  }
  return row;                                     // all-day → event bullet, no time
}

// All-day "Office" / work-status markers on the calendar aren't meetings —
// skip them on import so they don't clutter the day. Matched as a whole title
// only (so "Post-Office meeting" etc. are never dropped).
function isOfficeMarker(text = '') {
  const t = text.trim().toLowerCase().replace(/[^a-z฀-๿]/g, '');
  return t === 'office' || t === 'ออฟฟิศ' || t === 'เข้าออฟฟิศ';
}

// Leave / out-of-office entries are informational (who's away) — not tasks for
// the day. Kept conservative so real meetings never get hidden by mistake.
function isLeaveEntry(entry) {
  // Only calendar imports can be someone's leave. A hand-typed line like
  // "Leave for airport 14:00" is the user's own task and used to vanish into
  // the FYI box.
  if (!entry || entry.gcal_event_id == null) return false;
  const t = (entry.text || '').trim();
  if (!t) return false;
  // Explicit leave phrases (Thai + English).
  if (/ลาพักร้อน|ลาป่วย|ลากิจ|ลาคลอด|ลาบวช|ลาพัก|ลาหยุด|วันลา/.test(t)) return true;
  if (/out of office|on leave|annual leave|day off|\bOOO\b|\bPTO\b|vacation|\bleave\b/i.test(t)) return true;
  // Bare "ลา" as a standalone token, e.g. "นก ลา" / "[ลา] ต่าย" — boundary-bounded
  // so "ปลา", "ลาว", "ส่งใบลา" are NOT matched.
  if (/(^|[\s\[\](){}·|\/–—-])ลา($|[\s\[\](){}·|\/–—-])/.test(t)) return true;
  return false;
}

function GoogleCalendarButton({ date, existing, onImported }) {
  const [status, setStatus] = useState('loading'); // loading | connected | disconnected
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => getIntegration('google')
      .then(i => setStatus(i && (i.scope || '').includes('calendar') ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected'));
    check();
    // Re-check once the OAuth exchange finishes (button may mount before the
    // token row is stored → otherwise it stays "connect" until a manual reload).
    window.addEventListener('loop:oauth-connected', check);
    return () => window.removeEventListener('loop:oauth-connected', check);
  }, []);

  const pull = async () => {
    setBusy(true);
    try {
      const timeMin = new Date(date + 'T00:00:00').toISOString();
      const timeMax = new Date(date + 'T23:59:59').toISOString();
      const qs = new URLSearchParams({
        timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '50',
      });
      const res = await callProvider('google', {
        url: `https://www.googleapis.com/calendar/v3/calendars/primary/events?${qs}`,
      });
      if (res?.error) throw new Error(res.error.message || JSON.stringify(res.error));

      // Drop events the user declined and all-day "Office" status markers; map the rest.
      const rows = (res.items || [])
        .filter(ev => {
          const me = (ev.attendees || []).find(a => a.self);
          return !me || me.responseStatus !== 'declined';
        })
        .filter(ev => !isOfficeMarker(ev.summary || ''))
        .map(ev => gcalEventToEntry(ev, date));

      // Reconcile. Matching by gcal id has to span ALL dates, not just this
      // day — a meeting the user moved to another date still lives under its
      // old entry_date, and a day-scoped lookup happily inserted a duplicate.
      const incomingIds = rows.map(r => r.gcal_event_id).filter(Boolean);
      let known = [];
      try { known = await listEntriesByGcalIds(incomingIds); } catch { known = []; }

      const byId = new Map();       // gcal_event_id → existing entry (any date)
      const byKey = new Map();      // "text|time" → legacy entry (imported before ids existed)
      for (const e of known) if (e.gcal_event_id) byId.set(e.gcal_event_id, e);
      for (const e of (existing || [])) {
        if (e.gcal_event_id) { if (!byId.has(e.gcal_event_id)) byId.set(e.gcal_event_id, e); }
        else byKey.set(`${(e.text || '').trim()}|${e.event_time || ''}`, e);
      }

      const toInsert = [];
      const seenIds = new Set();
      let updated = 0;
      for (const r of rows) {
        if (r.gcal_event_id) seenIds.add(r.gcal_event_id);

        let match = r.gcal_event_id ? byId.get(r.gcal_event_id) : null;
        if (match) byId.delete(r.gcal_event_id);
        if (!match) {
          const key = `${r.text}|${r.event_time || ''}`;
          match = byKey.get(key) || null;
          // Claim the legacy row so a second meeting with the same title can't
          // collapse onto it — that pair re-duplicated on every later import.
          if (match) byKey.delete(key);
        }
        if (!match) { toInsert.push(r); continue; }
        // Patch only changed fields; never touch `done` (keep the tick).
        const patch = {};
        if ((match.entry_date || null)     !== r.entry_date)               patch.entry_date = r.entry_date;
        if ((match.event_time || null)     !== (r.event_time || null))     patch.event_time = r.event_time || null;
        if ((match.event_end_time || null) !== (r.event_end_time || null)) patch.event_end_time = r.event_end_time || null;
        if ((match.text || '')             !== r.text)                     patch.text = r.text;
        if ((match.location || null)       !== (r.location || null))       patch.location = r.location || null;
        if (!match.gcal_event_id && r.gcal_event_id)                       patch.gcal_event_id = r.gcal_event_id;
        if (Object.keys(patch).length) { await updateEntry(match.id, patch); updated++; }
      }
      if (toInsert.length) await bulkCreateEntries(toInsert);

      // Events cancelled in Google used to linger on the day forever. Remove
      // only rows that CAME from Google and are gone from today's fetch —
      // hand-written entries (gcal_event_id = null) are never touched.
      const stale = (existing || []).filter(e => e.gcal_event_id && !seenIds.has(e.gcal_event_id));
      let removed = 0;
      if (stale.length) {
        try { removed = await deleteEntriesByIds(stale.map(e => e.id)); } catch { removed = 0; }
      }

      const added = toInsert.length;
      if (!added && !updated && !removed) { alert('ตารางตรงกับที่มีอยู่แล้ว — ไม่มีอะไรต้องอัปเดต'); return; }
      alert(`ซิงก์แล้ว · เพิ่ม ${added} · อัปเดต ${updated} · ลบที่ยกเลิก ${removed} รายการ`);
      onImported();
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) { setStatus('disconnected'); alert('ยังไม่ได้เชื่อม Google — กดเชื่อมก่อน'); }
      else if (/gcal_event_id|column|schema cache/i.test(msg)) {
        alert('ยังไม่ได้รัน SQL — เปิด Supabase แล้วรัน migration_add_gcal_event_id.sql ก่อนนะครับ');
      }
      else alert('ดึงตารางไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); }
  };

  if (status === 'loading') return null;
  if (status === 'disconnected')
    return (
      <button className="btn btn--ghost" onClick={() => startGoogleAuth(ALL_GOOGLE_SCOPES)}
        title="เชื่อม Google Calendar เพื่อดึงตารางประชุมอัตโนมัติ">🗓 เชื่อม Google</button>
    );
  return (
    <button className="btn btn--ghost" onClick={pull} disabled={busy}
      title="ดึงตารางประชุมของวันนี้จาก Google Calendar">
      {busy ? '...' : '🗓 ดึงประชุม'}
    </button>
  );
}

// ── Gmail — surface client emails still waiting for a reply ───────────────────
// Parse an RFC 5322 From header ("Name" <a@b.com> | a@b.com) into parts.
function parseFrom(from = '') {
  const m = from.match(/<([^>]+)>/);
  const email = (m ? m[1] : from).trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  let name = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (!name) name = email;
  return { email, domain, name };
}

// Automated / notification senders (Google Play, Meta, no-reply, etc.) — never
// something she needs to reply to. Filtered by sender (not a Gmail category
// query, which returns nothing when the user has inbox tabs turned off).
const AUTOMATED_DOMAINS = ['google.com', 'facebookmail.com', 'facebook.com', 'meta.com', 'metamail.com', 'shutterstock.com', 'asana.com', 'soundcloud.com', 'ramayanawaterpark.com'];
// Marketing senders that may mail from a third-party domain — match on display name.
// Word boundaries so real people don't get caught (e.g. "Wasana" contains "asana").
const AUTOMATED_NAME_RE = /\b(ramayana|shutterstock|soundcloud|asana)\b|รามายณะ/i;
function isAutomatedSender(email = '', name = '') {
  const e = email.toLowerCase();
  const local = e.split('@')[0] || '';
  const domain = e.split('@')[1] || '';
  if (/(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreply|notification|notifications|notify|mailer|mailer-daemon|bounce|postmaster)([._+-]|$)/.test(local)) return true;
  if (AUTOMATED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true;
  if (name && AUTOMATED_NAME_RE.test(name)) return true;
  return false;
}

// Pull the email addresses out of a header value (To can list several).
function extractEmails(headerVal = '') {
  const angle = [...headerVal.matchAll(/<([^>]+)>/g)].map(m => m[1].trim().toLowerCase());
  const found = angle.length
    ? angle
    : headerVal.split(',').map(s => s.trim().toLowerCase()).filter(s => s.includes('@'));
  return [...new Set(found)];
}

function gmailHeader(msg, name) {
  const h = (msg?.payload?.headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

// A client 👍/🎉 reaction to our email is a separate thread message — it isn't a
// reply we owe, so it shouldn't mark the thread as waiting. Gmail's reaction
// snippets look like "🎉 Name reacted via Gmail" / "👍 Name ส่งรีแอ็กชั่น", so we
// require an emoji AND either no other text (emoji-only) or the reaction phrase.
// A real email with an emoji but real text is never treated as a reaction.
function isReactionMessage(msg) {
  const s = (msg?.snippet || '').trim();
  if (!s) return false;
  if (!/\p{Extended_Pictographic}/u.test(s)) return false;
  const textOnly = s.replace(/[\p{Extended_Pictographic}‍️\s\p{P}\p{S}]/gu, '');
  if (textOnly.length === 0) return true;              // emoji-only
  return /reacted|รีแอ/iu.test(s);                     // "reacted via Gmail" / "ส่งรีแอ็กชั่น"
}

function waitingLabel(ms) {
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} นาที`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.`;
  return `${Math.floor(hrs / 24)} วัน`;
}

// ── Shopee — orders waiting to ship, read from the shop's notification mail ──
// Shopee mails every order state change from @(mail.)shopee.co.th with the
// order id and buyer in the SUBJECT ("คำสั่งซื้อชำระเงินปลายทาง #260807PG5EP8HX
// จากผู้ซื้อ s0f7jihm4o ถูกยืนยันแล้ว") — so a targeted Gmail search + subject
// parsing is enough; no body fetch. Later mails about the same order id
// (shipped / cancelled / completed) clear it from the queue automatically;
// "ส่งแล้ว ✓" clears it by hand (stored as shopee:<orderId> in the existing
// gmail_dismissed table — synced across devices, no migration).
const SHOPEE_CACHE = 'shopee:toship2'; // v4.12 row shape — old key self-discards
const SHOPEE_SENDER = /@(?:mail\.)?shopee\.(?:co\.th|com)$/i;
// Subjects that mean "this order needs shipping" vs "this order left the queue".
const SHOPEE_OPEN = /ถูกยืนยันแล้ว|คำสั่งซื้อใหม่|ได้ชำระเงิน|ชำระเงินแล้ว|กรุณาจัดส่ง|พร้อมจัดส่ง/;
const SHOPEE_CLOSED = /ยกเลิก|คืนเงิน|คืนสินค้า|จัดส่งสำเร็จ|ได้จัดส่ง|สำเร็จแล้ว|ถึงผู้ซื้อ|รีวิว/;

function parseShopeeSubject(subject = '') {
  const order = (subject.match(/#([0-9A-Z]{8,20})/) || [])[1] || null;
  if (!order) return null;
  const buyer = (subject.match(/จากผู้ซื้อ\s+(\S+)/) || [])[1] || '';
  if (SHOPEE_CLOSED.test(subject)) return { order, buyer, state: 'closed' };
  if (SHOPEE_OPEN.test(subject)) return { order, buyer, state: 'open', label: /ปลายทาง/.test(subject) ? 'COD ยืนยันแล้ว' : 'รอจัดส่ง' };
  return null; // other order chatter (e.g. buyer messages) — not a queue event
}

// Scan the connected Gmail for Shopee order mail → latest state per order id.
// Returns null when Gmail isn't connected (nothing to scan with).
async function scanShopeeMail() {
  const integ = await getIntegration('google').catch(() => null);
  if (!(integ && (integ.scope || '').includes('gmail'))) return null;
  const params = new URLSearchParams({
    q: 'from:shopee subject:คำสั่งซื้อ newer_than:30d', maxResults: '100',
  });
  const list = await callProvider('google', {
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages?' + params,
  });
  if (list?.error) throw new Error(list.error.message || JSON.stringify(list.error));
  const ids = (list.messages || []).map(m => m.id);
  const BATCH = 15;
  const msgs = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const wave = await Promise.all(ids.slice(i, i + BATCH).map(id => {
      const p = new URLSearchParams({ format: 'metadata' });
      p.append('metadataHeaders', 'From');
      p.append('metadataHeaders', 'Subject');
      return callProvider('google', {
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${p}`,
      }).catch(() => null);
    }));
    msgs.push(...wave.filter(Boolean));
  }
  const orders = new Map();
  for (const m of msgs) {
    const from = parseFrom(gmailHeader(m, 'From'));
    if (!SHOPEE_SENDER.test(from.email || '')) continue;
    const parsed = parseShopeeSubject(gmailHeader(m, 'Subject'));
    if (!parsed) continue;
    const ts = Number(m.internalDate) || 0;
    const cur = orders.get(parsed.order);
    if (!cur || ts > cur.ts) orders.set(parsed.order, { ...parsed, ts, threadId: m.threadId || m.id });
  }
  return [...orders.values()];
}

function ShopeeOrders() {
  // mode: 'shared' = the Supabase queue both partners see (migration run);
  //       'local'  = v4.11 behaviour, this device's mail + dismiss marks only.
  const [mode, setMode] = useState(null);
  const [queue, setQueue] = useState(() => getCache(SHOPEE_CACHE)?.data ?? null);
  const [lastSync, setLastSync] = useState(() => getCache(SHOPEE_CACHE)?.ts ?? null);
  const [busy, setBusy] = useState(false);

  // Owner side: push what the mail says into the shared queue. Partner-side
  // scans find no shop mail and RLS blocks their inserts — both harmless.
  const syncSharedFromMail = useCallback(async () => {
    const scanned = await scanShopeeMail().catch(() => null);
    if (!scanned) return;
    const legacy = new Map(
      (await listGmailDismissed().catch(() => [])).map(d => [d.thread_id, Number(d.dismissed_ts)]),
    );
    const db = new Map((await listShopeeOrders(true)).map(r => [r.order_id, r]));
    const inserts = [];
    for (const o of scanned) {
      const cur = db.get(o.order);
      if (!cur) {
        if (o.state === 'closed') continue;         // never queued — nothing to record
        const dts = legacy.get(`shopee:${o.order}`); // v4.11 device-local ticks carry over
        inserts.push({
          order_id: o.order, buyer: o.buyer, label: o.label,
          state: dts && o.ts <= dts ? 'shipped' : 'open',
          mail_ts: new Date(o.ts).toISOString(), thread_id: o.threadId,
        });
      } else if (o.state === 'closed') {
        if (cur.state !== 'cleared') await setShopeeState(o.order, 'cleared').catch(() => {});
      } else if (cur.state === 'shipped' && cur.shipped_at && o.ts > +new Date(cur.shipped_at)) {
        // a NEWER open mail than the tick — Shopee reopened it, resurface
        await setShopeeState(o.order, 'open').catch(() => {});
      }
    }
    if (inserts.length) await saveShopeeOrders(inserts).catch(() => {});
  }, []);

  // Local fallback (migration not run yet): exactly the previous behaviour.
  const loadLocal = useCallback(async () => {
    const scanned = await scanShopeeMail().catch(() => null);
    if (!scanned) { setQueue([]); return; }
    const dismissed = new Map(
      (await listGmailDismissed().catch(() => [])).map(d => [d.thread_id, Number(d.dismissed_ts)]),
    );
    const open = scanned
      .filter(o => o.state === 'open')
      .filter(o => { const dts = dismissed.get(`shopee:${o.order}`); return !(dts && o.ts <= dts); })
      .sort((a, b) => a.ts - b.ts)
      .map(o => ({ order_id: o.order, buyer: o.buyer, label: o.label, mail_ts: new Date(o.ts).toISOString(), thread_id: o.threadId }));
    setQueue(open); setCache(SHOPEE_CACHE, open);
  }, []);

  const refresh = useCallback(async (withMailSync) => {
    setBusy(true);
    try {
      try {
        if (withMailSync) await syncSharedFromMail();
        const rows = await listShopeeOrders();
        setMode('shared');
        setQueue(rows); setCache(SHOPEE_CACHE, rows);
      } catch {
        // table missing / RLS says no → device-local mode, nothing breaks
        setMode('local');
        await loadLocal();
      }
      setLastSync(Date.now());
    } finally { setBusy(false); }
  }, [syncSharedFromMail, loadLocal]);

  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled) refresh(cacheAge(SHOPEE_CACHE) > STALE_MS); };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [refresh]);

  const handleShipped = async (e, o) => {
    e.preventDefault(); e.stopPropagation();
    try {
      if (mode === 'shared') await setShopeeState(o.order_id, 'shipped');
      else await dismissGmailThread(`shopee:${o.order_id}`, +new Date(o.mail_ts));
      setQueue(prev => (prev || []).filter(x => x.order_id !== o.order_id));
    } catch (err) { alert('บันทึกไม่สำเร็จ: ' + (err.message || err)); }
  };

  if (!queue || queue.length === 0) return null;

  const dayOld = o => Date.now() - +new Date(o.mail_ts) > 86400000;
  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">📦 Shopee รอจัดส่ง ({queue.length})</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <a href="https://seller.shopee.co.th/portal/sale/order?type=toship" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: 'var(--accent-strong)', textDecoration: 'none' }}>เปิด Seller Centre ↗</a>
          {lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>
            {mode === 'shared' ? 'คิวร่วม · ' : ''}ซิงก์ {fmtSyncClock(lastSync)}</span>}
          <button onClick={() => refresh(true)} disabled={busy} title="รีเฟรชเดี๋ยวนี้"
            style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {queue.map(o => (
          <a key={o.order_id} href={o.thread_id ? `https://mail.google.com/mail/u/0/#inbox/${o.thread_id}` : 'https://seller.shopee.co.th/portal/sale/order?type=toship'}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: `1px solid ${dayOld(o) ? 'var(--amber)' : 'var(--line)'}`, background: 'var(--surface-2)', textDecoration: 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink)' }}>#{o.order_id}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
                {o.label}{o.buyer ? ` · ผู้ซื้อ ${o.buyer}` : ''} · {waitingLabel(+new Date(o.mail_ts))}ที่แล้ว
              </div>
            </div>
            <button onClick={e => handleShipped(e, o)}
              title="ส่งของแล้ว — เอาออกจากคิวของทั้งคู่"
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 11.5, padding: '4px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
              ส่งแล้ว ✓
            </button>
          </a>
        ))}
      </div>
    </div>
  );
}

const GMAIL_CACHE = 'gmail:waiting';
// Arm doesn't work client mail; Pat does. Hiding is per device (localStorage)
// so each of them keeps the layout they actually use. Hidden also means NO
// inbox scan — the card costs nothing when off.
const GMAIL_HIDE_KEY = 'journal:hideGmailCard';

function GmailInbox() {
  const [hidden, setHidden] = useState(() => localStorage.getItem(GMAIL_HIDE_KEY) === '1');
  const [status, setStatus] = useState('loading'); // loading | connected | disconnected
  const [items, setItems] = useState(() => getCache(GMAIL_CACHE)?.data ?? null); // null=not loaded, []=none
  const [lastSync, setLastSync] = useState(() => getCache(GMAIL_CACHE)?.ts ?? null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done, total} while scanning

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // Walk the whole inbox (no time limit) so every un-replied thread shows,
      // however old. Cap the scan so a huge inbox can't run away.
      const SCAN_CAP = 500;   // most inbox threads to inspect — a busy inbox
                              // buries months-old un-replied threads past 150
      const BATCH = 15;       // concurrent thread fetches per wave (threads.get
                              // = 10 quota units × 15 = 150/s, under the 250 cap)

      // Threads she manually marked as handled (e.g. resolved by phone).
      // Keyed by thread id → ts of the last message at dismissal time.
      const dismissed = new Map(
        (await listGmailDismissed().catch(() => [])).map(d => [d.thread_id, Number(d.dismissed_ts)]),
      );

      const ids = [];
      let pageToken = '';
      do {
        const params = new URLSearchParams({ q: 'in:inbox', maxResults: '100' });
        if (pageToken) params.set('pageToken', pageToken);
        const list = await callProvider('google', {
          url: 'https://gmail.googleapis.com/gmail/v1/users/me/threads?' + params,
        });
        if (list?.error) throw new Error(list.error.message || JSON.stringify(list.error));
        for (const t of (list.threads || [])) ids.push(t.id);
        pageToken = list.nextPageToken || '';
      } while (pageToken && ids.length < SCAN_CAP);

      const details = [];
      const total = Math.min(ids.length, SCAN_CAP);
      setProgress({ done: 0, total });
      for (let i = 0; i < total; i += BATCH) {
        const wave = await Promise.all(ids.slice(i, i + BATCH).map(id => {
          const p = new URLSearchParams({ format: 'metadata' });
          p.append('metadataHeaders', 'From');
          p.append('metadataHeaders', 'Subject');
          p.append('metadataHeaders', 'To');
          return callProvider('google', {
            url: `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?${p}`,
          }).catch(() => null);
        }));
        details.push(...wave);
        setProgress({ done: Math.min(i + BATCH, total), total });
      }

      const waiting = [];
      for (const th of details) {
        const msgs = th?.messages;
        if (!msgs?.length) continue;
        // Look past trailing emoji reactions to the last real message — a client
        // 👍 on our email doesn't mean we still owe a reply.
        let last = null;
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (!isReactionMessage(msgs[i])) { last = msgs[i]; break; }
        }
        if (!last) continue;
        const from = parseFrom(gmailHeader(last, 'From'));
        // Waiting on her only if the latest real message is from outside the org…
        if (!from.domain || from.domain === ORG_DOMAIN) continue;
        // …and it's a real person, not a platform/no-reply notification.
        if (isAutomatedSender(from.email, from.name)) continue;
        const ts = Number(last.internalDate) || Date.now();
        // Manually dismissed — stays hidden unless the client mailed again later.
        const dts = dismissed.get(th.id);
        if (dts && ts <= dts) continue;
        waiting.push({
          id: th.id,
          name: from.name,
          subject: gmailHeader(msgs[0], 'Subject') || '(ไม่มีหัวข้อ)',
          to: extractEmails(gmailHeader(last, 'To')).join(', '),
          ts,
        });
      }
      waiting.sort((a, b) => b.ts - a.ts);
      setItems(waiting);
      setCache(GMAIL_CACHE, waiting);
      setLastSync(Date.now());
    } catch (e) {
      const msg = String(e.message || e);
      if (msg.includes('not_connected')) setStatus('disconnected');
      else alert('ดึงเมลไม่สำเร็จ: ' + msg);
    } finally { setBusy(false); setProgress(null); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (hidden) return undefined; // hidden = no scan at all
    const run = async () => {
      const i = await getIntegration('google').catch(() => null);
      if (cancelled) return;
      const connected = !!(i && (i.scope || '').includes('gmail'));
      setStatus(connected ? 'connected' : 'disconnected');
      // Show cached result instantly; only re-scan the inbox when it's stale.
      if (connected && cacheAge(GMAIL_CACHE) > STALE_MS) load();
    };
    run();
    window.addEventListener('loop:oauth-connected', run);
    return () => { cancelled = true; window.removeEventListener('loop:oauth-connected', run); };
  }, [load, hidden]);

  const toggleHidden = (v) => {
    setHidden(v);
    try { v ? localStorage.setItem(GMAIL_HIDE_KEY, '1') : localStorage.removeItem(GMAIL_HIDE_KEY); } catch { /* private mode */ }
  };
  if (hidden) {
    // A whisper, not a card — the way back for whoever hid it.
    return (
      <button onClick={() => toggleHidden(false)}
        style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 4px', fontSize: 13, color: 'var(--ink-4)' }}>
        ✉ แสดง "เมลค้างตอบ"
      </button>
    );
  }

  // Mark a thread as handled (answered by phone, no reply needed, …).
  // It stays hidden unless the client sends a newer message in that thread.
  const handleDismiss = async (e, m) => {
    e.preventDefault(); e.stopPropagation();
    try {
      await dismissGmailThread(m.id, m.ts);
      setItems(prev => (prev || []).filter(x => x.id !== m.id));
    } catch (err) {
      alert('ซ่อนไม่สำเร็จ: ' + (err.message || err));
    }
  };

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          เมลค้างตอบ{items && items.length ? ` (${items.length})` : ''}
          <button onClick={() => toggleHidden(true)} title={'ไม่ใช้การ์ดนี้ — ซ่อน (เอากลับมาได้จากลิงก์เล็ก ๆ ที่เดิม)'}
            style={{ background: 'none', border: 'none', color: 'var(--ink-4)', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
        {status === 'connected' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {busy && progress
              ? <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>สแกน {progress.done}/{progress.total}…</span>
              : lastSync && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--ink-4)' }}>ซิงก์ {fmtSyncClock(lastSync)}</span>}
            <button onClick={load} disabled={busy} title="รีเฟรชเดี๋ยวนี้"
              style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14, padding: 2, opacity: busy ? 0.4 : 1 }}>↻</button>
          </span>
        )}
      </div>

      {status === 'loading' ? null
        : status === 'disconnected' ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.5 }}>
              เชื่อม Gmail เพื่อดูเมลลูกค้าที่ยังไม่ได้ตอบ
            </div>
            <button className="btn btn--ghost" onClick={() => startGoogleAuth(ALL_GOOGLE_SCOPES)}>
              ✉️ เชื่อม Gmail
            </button>
          </div>
        ) : busy && items === null ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>
            {progress ? `กำลังสแกน ${progress.done}/${progress.total}…` : 'กำลังดึง...'}
          </div>
        ) : (items && items.length === 0) ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>ไม่มีเมลลูกค้าค้างตอบ 🎉</div>
        ) : items ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(m => (
              <a key={m.id} href={`https://mail.google.com/mail/u/0/#inbox/${m.id}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', background: 'var(--surface-2)', textDecoration: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    ค้าง {waitingLabel(m.ts)}
                    <button onClick={e => handleDismiss(e, m)}
                      title="จัดการแล้ว (เช่น โทรคุยแล้ว) — เอาออกจากลิสต์"
                      style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '2px 5px' }}
                      onMouseEnter={ev => { ev.currentTarget.style.color = 'var(--amber-deep)'; ev.currentTarget.style.borderColor = 'var(--amber)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.color = 'var(--ink-3)'; ev.currentTarget.style.borderColor = 'var(--line)'; }}>
                      ✓
                    </button>
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject}</div>
                {m.to && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    ถึง: {m.to}
                  </div>
                )}
              </a>
            ))}
          </div>
        ) : null}
    </div>
  );
}

const BULLET_TYPES = [
  { id: 'task',    label: 'งาน',     symbol: '·' },
  { id: 'event',   label: 'เหตุการณ์', symbol: '○' },
  { id: 'note',    label: 'โน้ต',    symbol: '—' },
  { id: 'star',    label: 'สำคัญ',   symbol: '★' },
  { id: 'migrate', label: 'โยก',     symbol: '›' },
];

// Selection is shown with an accent ring, so the old per-mood colours are gone.
// value / label / emoji are unchanged — `value` is what gets persisted.
const MOODS = [
  { value: 1, label: 'แย่มาก',  emoji: '😞' },
  { value: 2, label: 'แย่',     emoji: '😕' },
  { value: 3, label: 'เฉย ๆ',   emoji: '😐' },
  { value: 4, label: 'ดี',      emoji: '😊' },
  { value: 5, label: 'ดีมาก',  emoji: '😄' },
];

const TAGS = ['TRADE', 'LEARN', 'FAMILY', 'HEALTH', 'WORK', 'FINANCE'];

// ── Add Entry Form ────────────────────────────────────────────────────────────
function AddEntryForm({ date, onSave, onClose, partnerId }) {
  const [type, setType] = useState('task');
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [shareWith, setShareWith] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      const payload = {
        entry_date: date, bullet_type: type, text: text.trim(), tag: tag || null, done: false,
        event_time: type === 'event' && time ? time : null,
        location: type === 'event' && location.trim() ? location.trim() : null,
      };
      // Only reference shared_with when actually sharing — keeps inserts working
      // even before the migration adds the column.
      if (type === 'event' && shareWith && partnerId) payload.shared_with = partnerId;
      await createEntry(payload);
      onSave();
      setText(''); setTime(''); setLocation(''); setShareWith(false);
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: 'var(--fill)', border: 'none',
      borderRadius: 'var(--radius-field)', padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16,
    }}>
      {/* Bullet type */}
      <div style={{ display: 'flex', gap: 6 }}>
        {BULLET_TYPES.map(b => (
          <button key={b.id} type="button" onClick={() => setType(b.id)}
            style={{
              padding: '4px 11px', borderRadius: 'var(--radius-btn)', fontSize: 11.5, fontWeight: 500,
              background: type === b.id ? 'var(--accent-fill)' : 'var(--fill-2)',
              color: type === b.id ? 'var(--text-inverse)' : 'var(--ink-2)',
              border: 'none', cursor: 'pointer',
            }}>
            {b.symbol} {b.label}
          </button>
        ))}
      </div>

      {/* Event time + location */}
      {type === 'event' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{
              background: 'var(--fill-2)', border: 'none', borderRadius: 'var(--radius-field)',
              padding: '4px 8px', fontSize: 12, fontFamily: 'var(--f-mono)', color: 'var(--paper-ink)',
            }}
          />
          <input
            type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="สถานที่ (ถ้ามี)"
            style={{
              flex: 1, background: 'var(--fill-2)', border: 'none', borderRadius: 'var(--radius-field)',
              padding: '4px 8px', fontSize: 12, fontFamily: 'var(--f-display)', color: 'var(--paper-ink)',
            }}
          />
        </div>
      )}

      {/* Shared appointment — only when accounts are linked */}
      {type === 'event' && partnerId && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={shareWith} onChange={e => setShareWith(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          👥 นัดนี้ด้วยกัน (โผล่ในวันของอีกฝ่ายด้วย)
        </label>
      )}

      {/* Text */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <input
          autoFocus value={text} onChange={e => setText(e.target.value)}
          // isComposing: the Thai IME fires Enter to COMMIT the candidate, so
          // submitting there ate the composition and posted it twice.
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault(); handleSubmit(e);
            }
          }}
          placeholder="บันทึกอะไรก็ได้..."
          style={{
            flex: 1, background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--hairline)',
            padding: '5px 0', fontSize: 14.5,
            color: 'var(--ink)', outline: 'none',
          }}
        />
        <select value={tag} onChange={e => setTag(e.target.value)}
          style={{ background: 'var(--fill-2)', border: 'none', borderRadius: 'var(--radius-field)', padding: '4px 8px', fontSize: 11.5, color: 'var(--ink-2)' }}>
          <option value="">แท็ก</option>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onClose && <button type="button" onClick={onClose}
          style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: '4px 10px', background: 'none', border: 0, cursor: 'pointer' }}>ยกเลิก</button>}
        <button type="submit" disabled={saving || !text.trim()}
          style={{ background: 'var(--accent-fill)', color: 'var(--text-inverse)', border: 'none', borderRadius: 'var(--radius-btn)', padding: '6px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? '...' : '+ เพิ่ม'}
        </button>
      </div>
    </form>
  );
}

// ── Add Habit Modal ───────────────────────────────────────────────────────────
function HabitModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('7');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createHabit({ name: name.trim(), target_per_week: Number(target) || 7 });
      onSave(); onClose();
    } catch (err) { alert(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form onSubmit={handleSubmit} style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', padding: 32, width: 340, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 20 }}>เพิ่ม Habit</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>ชื่อ Habit</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ออกกำลังกาย, อ่านหนังสือ" autoFocus required />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-3)' }}>เป้าหมาย/สัปดาห์</span>
          <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n} ครั้ง/สัปดาห์</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ flex: 1 }}>ยกเลิก</button>
          <button type="submit" disabled={saving} className="btn btn--primary" style={{ flex: 2 }}>{saving ? '...' : 'เพิ่ม'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Entry Details (note + event time/location + Google Calendar) ───────────────
function EntryDetails({ entry, date, onUpdate, partnerId }) {
  const [note, setNote] = useState(entry.note || '');
  const [time, setTime] = useState(entry.event_time ? entry.event_time.slice(0, 5) : '');
  const [endTime, setEndTime] = useState(entry.event_end_time ? entry.event_end_time.slice(0, 5) : '');
  const [location, setLocation] = useState(entry.location || '');

  useEffect(() => {
    setNote(entry.note || '');
    setTime(entry.event_time ? entry.event_time.slice(0, 5) : '');
    setEndTime(entry.event_end_time ? entry.event_end_time.slice(0, 5) : '');
    setLocation(entry.location || '');
  }, [entry.id, entry.note, entry.event_time, entry.event_end_time, entry.location]);

  // Blur handlers fire-and-forget; without this every failed save was an
  // unhandled rejection and the field kept showing text that was never stored.
  const save = (patch) => {
    Promise.resolve(onUpdate(entry.id, patch))
      .catch(err => alert('บันทึกไม่สำเร็จ: ' + (err?.message || err)));
  };

  const isEvent = entry.bullet_type === 'event';
  const fieldStyle = {
    fontFamily: 'var(--f-mono)', fontSize: 12, padding: '6px 9px',
    border: '1px solid transparent', borderRadius: 'var(--radius-field)',
    background: 'var(--fill)', color: 'var(--ink)', outline: 'none',
  };
  const labelStyle = {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 500,
    display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13, color: 'var(--ink-2)'
  };

  return (
    <div style={{ padding: '8px 0 14px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isEvent && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={labelStyle}>
            <span>เวลาเริ่ม</span>
            <input type="time" value={time} style={fieldStyle}
              onChange={e => setTime(e.target.value)}
              onBlur={() => save({ event_time: time || null })} />
          </label>
          <label style={labelStyle}>
            <span>เวลาจบ</span>
            <input type="time" value={endTime} style={fieldStyle}
              onChange={e => setEndTime(e.target.value)}
              onBlur={() => save({ event_end_time: endTime || null })} />
          </label>
          <label style={{ ...labelStyle, flex: 1, minWidth: 160 }}>
            <span>สถานที่</span>
            <input type="text" value={location} placeholder="ที่ไหน?" style={fieldStyle}
              onChange={e => setLocation(e.target.value)}
              onBlur={() => save({ location: location.trim() || null })} />
          </label>
        </div>
      )}
      {/* Shared appointment toggle — only on my own events (hidden on ones a
          partner shared to me: shared_with then points at me, not at partnerId) */}
      {isEvent && partnerId && (!entry.shared_with || entry.shared_with === partnerId) && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={entry.shared_with === partnerId}
            onChange={e => save({ shared_with: e.target.checked ? partnerId : null })}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          👥 นัดนี้ด้วยกัน (โผล่ในวันของอีกฝ่ายด้วย)
        </label>
      )}
      <textarea
        value={note} rows={3} placeholder="รายละเอียดเพิ่มเติม..."
        onChange={e => setNote(e.target.value)}
        onBlur={() => save({ note: note.trim() || null })}
        style={{
          fontFamily: 'var(--f-body)', fontSize: 13, padding: '10px 12px', resize: 'vertical',
          border: '1px solid transparent', borderRadius: 'var(--radius-field)',
          background: 'var(--fill)', color: 'var(--ink)', outline: 'none',
        }}
      />
      {isEvent && (
        <a href={buildGCalUrl({ text: entry.text, note, location, event_time: time, event_end_time: endTime }, date)}
          target="_blank" rel="noopener noreferrer"
          style={{
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', fontSize: 13,
            color: 'var(--accent-strong)', textDecoration: 'none', fontWeight: 600,
            border: 'none', borderRadius: 'var(--radius-btn)',
            padding: '6px 12px', background: 'var(--accent-tint)'
          }}>
          <Icon name="calendar" size={13} /> เพิ่มลง Google Calendar
        </a>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function Journal() {
  const { user } = useAuth();
  const myUserId = user?.id || null;
  const [date, setDate] = useState(todayStr());
  const [entries, setEntries] = useState([]);
  const [recentDates, setRecentDates] = useState([]);
  const [mood, setMood] = useState(null);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [partnerId, setPartnerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(todayStr() + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [monthActivity, setMonthActivity] = useState(new Map());

  const refresh = useCallback(async () => {
    try {
      const [e, rd, m, h, hl, up, pid] = await Promise.all([
        listEntries({ date }),
        listRecentDates(14),
        getMoodForDate(date),
        listHabits(),
        getHabitLogsForDate(date),
        listUpcomingEvents(),
        getPartnerId().catch(() => null),
      ]);
      setEntries(e); setRecentDates(rd); setMood(m); setHabits(h); setHabitLogs(hl); setUpcoming(up); setPartnerId(pid);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [date]);

  useEffect(() => { refresh(); }, [refresh]);

  // Load per-day activity for the visible calendar month (refetch when month
  // changes, or after the selected date changes so new entries show as dots).
  const loadMonth = useCallback(async () => {
    try {
      const y = calMonth.getFullYear(), mo = calMonth.getMonth();
      const start = ymd(y, mo, 1);
      const end = ymd(y, mo, new Date(y, mo + 1, 0).getDate());
      const rows = await listEntriesInRange({ start, end });
      const map = new Map();
      for (const r of rows) {
        const cur = map.get(r.entry_date) || { count: 0, hasEvent: false };
        cur.count += 1;
        if (r.bullet_type === 'event' && r.event_time) cur.hasEvent = true;
        map.set(r.entry_date, cur);
      }
      setMonthActivity(map);
    } catch (err) { console.error(err); }
  }, [calMonth, date]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  // Keep the calendar on the selected date's month when the date jumps months.
  useEffect(() => {
    const d = new Date(date + 'T00:00:00');
    if (d.getFullYear() !== calMonth.getFullYear() || d.getMonth() !== calMonth.getMonth()) {
      setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every write below used to reject into an unhandled promise: the row stayed
  // as-is on screen and the user was never told the save failed.
  const handleToggle = async (id, done) => {
    try {
      await toggleEntry(id, !done);
      setEntries(prev => prev.map(e => e.id === id ? { ...e, done: !done } : e));
    } catch (err) { alert('อัปเดตไม่สำเร็จ: ' + (err.message || err)); }
  };

  const handleDelete = async (id) => {
    if (!confirm('ลบรายการนี้?')) return;
    try {
      await deleteEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) { alert('ลบไม่สำเร็จ: ' + (err.message || err)); }
  };

  const handleEntryUpdate = async (id, patch) => {
    try {
      await updateEntry(id, patch);
      // Merge the patch instead of swapping in the whole response: two fields
      // blurred in quick succession returned out of order, and the slower
      // response overwrote the faster one's field with a stale value.
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    } catch (err) { alert('บันทึกไม่สำเร็จ: ' + (err.message || err)); }
  };

  const handleMood = async (value) => {
    try {
      const updated = await upsertMood({ mood_date: date, value, note: null });
      setMood(updated);
    } catch (err) { alert('บันทึกอารมณ์ไม่สำเร็จ: ' + (err.message || err)); }
  };

  const handleHabitToggle = async (habitId) => {
    const isLogged = habitLogs.some(l => l.habit_id === habitId && l.completed);
    try {
      await toggleHabitLog(habitId, date, !isLogged);
      setHabitLogs(await getHabitLogsForDate(date));
    } catch (err) { alert('บันทึกนิสัยไม่สำเร็จ: ' + (err.message || err)); }
  };

  const dateLabel = formatDateThai(date);
  const today = todayStr();
  const isToday = date === today;


  // Split off "leave" entries — shown as FYI, not part of the day's checklist.
  const leaveEntries = entries.filter(e => isLeaveEntry(e));
  const dayEntries   = entries
    .filter(e => !isLeaveEntry(e))
    // Sort by start time (earliest first); entries with no time sink to the bottom.
    .sort((a, b) => (a.event_time || '99:99:99').localeCompare(b.event_time || '99:99:99'));
  // "นัดที่จะถึง" = future days only — today's meetings already show in the day list.
  const futureEvents = upcoming.filter(ev => ev.entry_date > today);

  // Day progress + "next up" highlight are derived from what's already on screen —
  // display only, nothing is written back.
  const checkableEntries = dayEntries.filter(isCheckable);
  const checkableCount   = checkableEntries.length;
  const doneCount        = checkableEntries.filter(e => e.done).length;

  // On today's page, tint the time of the next event that hasn't started yet.
  const nowHm = new Date().toTimeString().slice(0, 5);
  const nextUpHm = isToday
    ? dayEntries
        .filter(e => e.event_time && e.event_time.slice(0, 5) >= nowHm)
        .map(e => e.event_time.slice(0, 5))
        .sort()[0] || null
    : null;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--ink-3)' }}>
      กำลังโหลด...
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="Bullet Journal · บันทึกชีวิตรายวัน"
        title="Daily" em="Journal"
        sub="rapid logging — บุลเล็ตเดียวเล่าเรื่องหนึ่งได้ · กด + เพื่อเพิ่มรายการใหม่"
        meta={<>
          <div>วันนี้</div>
          <div className="page-header__meta-big">
            {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
          </div>
        </>}
        actions={<>
          <button className="btn btn--ghost" onClick={() => setShowHabitModal(true)}>+ Habit</button>
          <GoogleCalendarButton date={date} existing={entries} onImported={refresh} />
          <button className="btn btn--ghost" onClick={() => setShowPaste(true)}>📋 วางตาราง</button>
          <button className="btn btn--primary" onClick={() => setShowAddEntry(v => !v)}>
            <Icon name="plus" size={14}/> รายการใหม่
          </button>
        </>}
      />

      <div className="page-body">
        {/* Daily time countdown — feel the value of each day */}
        {isToday && <DayCountdown />}

        {/* Date navigator — วันนี้ + เลือกวันเอง */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, alignItems: 'center' }}>
          <button onClick={() => setDate(today)}
            style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 'var(--radius-btn)',
              background: date === today ? 'var(--accent-fill)' : 'var(--fill-2)',
              color: date === today ? 'var(--text-inverse)' : 'var(--ink)',
              border: 'none', fontWeight: 500,
              fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer',
            }}>
            วันนี้
          </button>
          {/* Jump to date */}
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{
              padding: '7px 12px', borderRadius: 'var(--radius-field)', background: 'var(--fill)',
              border: 'none', color: 'var(--ink)', fontSize: 12.5,
            }} />
        </div>

        <div className="journal-grid">
          {/* Left: the day's timeline */}
          <div className="journal-day">
            <div className="journal-day__head">
              <div>
                <div className="journal-day__title">{dateLabel}</div>
                <div className="journal-day__sub">{relativeDayLabel(date)}</div>
              </div>
              <div className="journal-day__dow">{weekday(date)}</div>
            </div>

            {/* Day progress — derived from the checkable entries already on screen */}
            {checkableCount > 0 && (
              <div className="day-progress">
                <div className="day-progress__track">
                  <div className="day-progress__fill" style={{ width: `${Math.round((doneCount / checkableCount) * 100)}%` }} />
                </div>
                <span>เสร็จแล้ว {doneCount} จาก {checkableCount}</span>
              </div>
            )}

            {/* Add entry form */}
            {showAddEntry && (
              <AddEntryForm
                date={date}
                partnerId={partnerId}
                onSave={() => { refresh(); }}
                onClose={() => setShowAddEntry(false)}
              />
            )}

            {/* FYI — who's on leave today (informational, not tasks) */}
            {leaveEntries.length > 0 && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--fill)', border: 'none', borderRadius: 'var(--radius-field)' }}>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>
                  วันนี้ใครลา · FYI
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {leaveEntries.map(entry => (
                    <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
                      <span style={{ color: 'var(--ink-3)' }}>—</span>
                      <span style={{ flex: 1 }}>{entry.text}</span>
                      {entry.event_time && <span className="chip">{fmtEventRange(entry)}</span>}
                      <button onClick={() => handleDelete(entry.id)}
                        style={{ opacity: 0.45, fontSize: 14, padding: '0 4px', color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Entries (checklist — leave items are surfaced in FYI above) */}
            {dayEntries.length === 0 && !showAddEntry ? (
              <div style={{ textAlign: 'center', color: 'var(--ink-2)', padding: '32px 0', fontSize: 14.5 }}>
                {isToday ? 'วันนี้ยังว่างอยู่ — เริ่มบันทึกได้เลย' : 'ไม่มีรายการในวันนี้'}
                <br />
                <button onClick={() => setShowAddEntry(true)}
                  style={{ marginTop: 12, background: 'var(--accent-tint)', border: 'none', borderRadius: 'var(--radius-btn)', padding: '8px 18px', color: 'var(--accent-strong)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  + เพิ่มรายการ
                </button>
              </div>
            ) : (
              <div style={{ marginTop: showAddEntry ? 8 : 0 }}>
                {dayEntries.map(entry => {
                  const isExpanded = expandedId === entry.id;
                  const hasDetails = !!(entry.note || entry.location || entry.event_time);
                  const checkable  = isCheckable(entry);
                  const isEvent    = entry.bullet_type === 'event';
                  const startHm    = entry.event_time ? entry.event_time.slice(0, 5) : null;
                  return (
                    <div key={entry.id}>
                      <div className={`tl-item ${entry.done ? 'tl-item--done' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onDoubleClick={() => checkable && handleToggle(entry.id, entry.done)}>
                        {/* time column */}
                        <div className={`tl-time ${startHm && startHm === nextUpHm ? 'tl-time--now' : ''}`}>
                          {startHm || ''}
                        </div>

                        {/* Meetings tick like tasks — same circle, so a calendar
                            item can be marked handled with one click. The circle
                            carries the event identity the old accent bar did:
                            accent for a meeting, pink when it's shared "ด้วยกัน". */}
                        {checkable ? (
                          <button
                            className={`check ${entry.done ? 'check--on' : ''}`
                              + (isEvent ? (entry.shared_with ? ' check--together' : ' check--event') : '')}
                            onClick={() => handleToggle(entry.id, entry.done)}
                            title={entry.done ? 'ยกเลิก' : 'เสร็จแล้ว'}
                            aria-label={entry.done ? 'ยกเลิก' : 'เสร็จแล้ว'}>
                            <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
                          </button>
                        ) : (
                          <span className={`glyph ${entry.bullet_type === 'star' ? 'glyph--star' : ''}`}>
                            {BULLET_TYPES.find(b => b.id === entry.bullet_type)?.symbol || '—'}
                          </span>
                        )}

                        <div className="tl-body">
                          <div className="tl-t">
                            <span>{entry.text}</span>
                            {/* The schema stores only a partner UUID — there is no
                                name to show, so keep the app's existing wording. */}
                            {entry.shared_with && (
                              <span className="chip chip--together" title="นัดด้วยกัน">
                                ♥ ด้วยกัน
                              </span>
                            )}
                            {entry.tag && <span className="chip">{entry.tag}</span>}
                          </div>
                          {(entry.event_time || entry.location) && (
                            <div className="tl-s">
                              {entry.event_time && fmtEventRange(entry)}
                              {entry.event_time && entry.location ? ' · ' : ''}
                              {entry.location && `📍 ${entry.location}`}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                          <button onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            title="รายละเอียด"
                            style={{ opacity: hasDetails ? 0.9 : 0.4, padding: '0 4px', color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex' }}>
                            <span style={{ display: 'inline-flex', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                              <Icon name="chevron" size={12} />
                            </span>
                          </button>
                          {/* A partner-shared row is visible but RLS blocks the
                              delete — the × just did nothing. Don't offer it. */}
                          {(!myUserId || entry.user_id === myUserId) && (
                            <button onClick={() => handleDelete(entry.id)}
                              aria-label="ลบรายการ"
                              style={{ opacity: 0.45, fontSize: 14, padding: '0 4px', color: 'var(--ink-2)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                          )}
                        </div>
                      </div>
                      {isExpanded && <EntryDetails entry={entry} date={date} partnerId={partnerId} onUpdate={handleEntryUpdate} />}
                    </div>
                  );
                })}

                {!showAddEntry && (
                  <button onClick={() => setShowAddEntry(true)}
                    style={{ marginTop: 12, background: 'transparent', border: '1px dashed var(--hairline)', borderRadius: 'var(--radius-field)', padding: '9px 14px', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13, width: '100%', fontWeight: 500 }}>
                    + เพิ่มรายการ
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right column of the top row: calendar only, keeping the row 50/50 */}
          <div className="journal-side">
            {/* Mini calendar */}
            <MiniCalendar
              monthDate={calMonth}
              selected={date}
              activity={monthActivity}
              onPick={setDate}
              onPrev={() => setCalMonth(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              onNext={() => setCalMonth(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            />
          </div>
        </div>

        {/* Full-width stack — everything from "นัดที่จะถึง" down spans 100% so a
            long email/Asana title no longer squeezes the checklist column. */}
        <div className="journal-stack">
            {/* Upcoming events */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">นัดที่จะถึง</div>
              </div>
              {futureEvents.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>
                  ไม่มีนัดใน 14 วันข้างหน้า
                </div>
              ) : (
                <div>
                  {futureEvents.map(ev => {
                    const d = new Date(ev.entry_date + 'T00:00:00');
                    return (
                      <button key={ev.id} onClick={() => setDate(ev.entry_date)} className="up-row">
                        <span className="up-row__badge">
                          <span>{d.toLocaleDateString('th-TH', { month: 'short' })}</span>
                          <b>{d.getDate()}</b>
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: 'var(--ink)' }}>{ev.text}</span>
                          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginTop: 1 }}>
                            {relativeDayLabel(ev.entry_date)} · {fmtEventRange(ev)}
                            {ev.location ? ` · 📍 ${ev.location}` : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Client emails still waiting for a reply */}
            <ShopeeOrders />
            <GmailInbox />

            {/* Asana — team hours for the selected day */}
            <AsanaHours date={date} />

            {/* Working Timeline — AE job sheet + billing chase */}
            <SheetTimeline date={date} />

            {/* Mood */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">อารมณ์วันนี้</div>
                {mood && <span style={{ fontSize: 20 }}>{MOODS.find(m => m.value === mood.value)?.emoji}</span>}
              </div>
              <div className="mood-row">
                {MOODS.map(m => (
                  <button key={m.value} onClick={() => handleMood(m.value)}
                    className={`mood-btn ${mood?.value === m.value ? 'mood-btn--on' : ''}`}
                    title={m.label} aria-label={m.label}>
                    {m.emoji}
                  </button>
                ))}
              </div>
              <div className="mood-lbl">
                {mood ? MOODS.find(m => m.value === mood.value)?.label : ''}
              </div>
            </div>

            {/* Habits */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">Habits</div>
                <button className="btn btn--ghost btn--sm" onClick={() => setShowHabitModal(true)}>+ เพิ่ม</button>
              </div>
              {habits.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '16px 0', fontSize: 12 }}>
                  ยังไม่มี Habit — กด "+ เพิ่ม" เพื่อตั้งค่า
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {habits.map(h => {
                    const done = habitLogs.some(l => l.habit_id === h.id && l.completed);
                    return (
                      <div key={h.id} className="habit-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <button onClick={() => handleHabitToggle(h.id)}
                            className={`check ${done ? 'check--on' : ''}`}
                            aria-label={done ? 'ยกเลิก' : 'ทำแล้ว'}>
                            <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>
                          </button>
                          <span className="habit-row__name" style={{
                            color: done ? 'var(--ink-2)' : 'var(--ink)',
                          }}>{h.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <span className="habit-row__streak">🔥 {h.target_per_week} วัน/สัปดาห์</span>
                          <button onClick={() => { if (confirm('ลบ Habit นี้?')) { deleteHabit(h.id).then(refresh); } }}
                            aria-label="ลบ Habit"
                            style={{ color: 'var(--ink-3)', fontSize: 12, padding: '2px 4px', background: 'none', border: 0, cursor: 'pointer' }}>×</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Stats for today */}
            <div className="card">
              <div className="card__head">
                <div className="card__title">สรุปวัน</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="stat">
                  <div className="stat__label">รายการทั้งหมด</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>{entries.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">งานเสร็จ</div>
                  <div className="stat__value" style={{ fontSize: 22, color: 'var(--profit)' }}>
                    {entries.filter(e => e.done).length}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Habits ทำ</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>
                    {habitLogs.filter(l => l.completed).length}/{habits.length}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat__label">Mood</div>
                  <div className="stat__value" style={{ fontSize: 22 }}>
                    {mood ? MOODS.find(m => m.value === mood.value)?.emoji : '—'}
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>

      {showHabitModal && <HabitModal onSave={refresh} onClose={() => setShowHabitModal(false)} />}
      {showPaste && <PasteScheduleModal date={date} onSave={refresh} onClose={() => setShowPaste(false)} />}
    </>
  );
}
