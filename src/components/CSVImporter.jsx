import { useState, useRef, useMemo, useEffect } from 'react';
import {
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  bulkCreateTransactions, isMakeFormat,
  extractAccountsFromMapped, bulkUpsertAccountsByPocket,
  classifyImportRows, getExistingRowsForDedup, assignRowIds,
  suggestDebtPaymentLinks, recordDebtPayment, listDebtPayments, listDebts,
  getMonthBounds, bangkokMonth, bangkokDate,
  importTransactionsBatch, isRpcMissing, isDefinitiveServerError,
} from '../lib/api/finance.js';
import { parseKBankPDF } from '../lib/kbankPdfParser.js';

// ── Round-8 B2 / round-9 M2 / round-10: the COMPLETE import session,
//    survivable across reloads AND across tabs ──────────────────────────────
// A post-commit response loss leaves rows (and receipts) on the server that
// this tab never heard about. Round 8 persisted only the group that happened
// to be in flight, so after a reload `stats.plan` was empty, earlier groups
// were invisible, the account/debt side effects could not be reconstructed and
// force-imported ambiguities lost their category/type/account.
//
// The record therefore persists the WHOLE job:
//   { v, key, at, startedAt,
//     groups:  [{ scope, month, wipe, dedup, ords[] }] — every group, not one
//     rows:    [{ _rid, scope, month, occurred_at, title, amount, category,
//                 type, note, account_id, _pocket, _cp_bal, _synthetic,
//                 _force }]                          — enough to FINISH the job
//     pockets: [...]  createAccts, makeFmt           — the account plan
//     debtLinks: [{ debt_id, debtName, pay_month, amount, _rid }]
//     doneGroups: ['scope|month'], sideEffects: { accounts, debts } }
// It is written as the plan is finalised, updated as each group and each
// side-effect stage completes, and dropped ONLY on authoritative full
// completion or an explicit informed discard.
//
// ── Round-10 case 1: ONE KEY PER SESSION, NOT ONE KEY PER BROWSER ──────────
// v4.22 stored every session at the single key 'loop:import-session'. Two open
// tabs therefore shared one slot: tab A's write overwrote tab B's record and
// tab A's completion deleted it, so B's lost-response session became
// unrecoverable. Records now live at 'loop:import-session:<importKey>', one
// slot per session; a tab may only ever write or remove the slot of the key it
// OWNS, and the legacy single key is read and migrated on mount so v4.22
// records survive the upgrade.
//
// ── Round-10 case 5 (F2): startedAt is IMMUTABLE ───────────────────────────
// `at` is the last-updated stamp (display only). `startedAt` is written once,
// when the session key is minted, and never refreshed — it is the only sound
// clock for the staleness rule below, because it is the receipts' age too.
const SESSION_LS_PREFIX = 'loop:import-session:';
const SESSION_LS_LEGACY_KEY = 'loop:import-session';   // v4.22 and older
const SESSION_RECORD_V = 3;                            // v3 = namespaced + per-group dedup
const SESSION_READABLE_V = new Set([2, 3]);
// Server-side receipts are purged after 90 days (migration_add_import_rpc.sql,
// round-9 retention). Refuse to reconstruct a record whose session STARTED
// more than 60 days ago: with a 30-day margin below the purge horizon, "the
// probe resolved zero outcomes" can only ever mean "nothing committed", never
// "the receipts were purged".
const SESSION_MAX_AGE_MS = 60 * 24 * 3600 * 1000;
// Guard rail, not a quota: ~500 KB of JSON is far more than any real statement
// (a 5 000-row import is ≈ 1 MB of payload, and Make exports are in the low
// hundreds). Beyond it the row payloads are dropped and the record degrades to
// "resume disabled, verify manually" — never a half-written record.
const SESSION_MAX_CHARS = 512 * 1024;

// ── Round-11 follow-up · the size test must measure what actually has to fit ─
// The pre-flight record is written BEFORE the account shells exist, so the
// only field that differs from the FINAL record is rows[].account_id
// (null → an account uuid). Everything else — groups, pockets, debtLinks,
// createAccts/makeFmt, doneGroups, sideEffects — is byte-identical, and
// at/startedAt are fixed-width epoch numbers. Writing `null` there measured a
// smaller payload than the one that really has to fit, so a record could pass
// the pre-flight and then fail after the shells had been created. The
// pre-flight now stands a nil-UUID in every slot a real id will occupy: the
// measured payload is at least as large as the final one, and a quota failure
// surfaces before anything at all is created. It is scrubbed back to null on
// read, so it can never be mistaken for an account.
const ACCOUNT_ID_SIZE_PAD = '00000000-0000-0000-0000-000000000000';
const unpadAccountId = (r) =>
  (r && r.account_id === ACCOUNT_ID_SIZE_PAD ? { ...r, account_id: null } : r);

/**
 * The recovery record could NOT be written. Round-10 case 4 / round-11: this
 * always ABORTS the run — never a silent no-op, whatever the reason.
 *   code 'quota'     — storage refused the write (full / disabled / private).
 *   code 'ownership' — this tab owns a DIFFERENT session key, so it must not
 *                      write this one. Round-11 blocker: v4.23 returned
 *                      silently here and the caller carried on to the RPC,
 *                      committing rows nothing on disk described.
 */
class SessionStorageError extends Error {
  constructor(message, code = 'quota') {
    super(message); this.name = 'SessionStorageError'; this.code = code;
  }
}
const isSessionStorageError = (e) => e?.name === 'SessionStorageError';
const abortReason = (e) =>
  (e?.code === 'ownership' ? 'สถานะงานนำเข้าไม่ตรงกัน' : 'พื้นที่เก็บข้อมูลเต็ม');

/** Shape sanity check + degraded/age flags. Returns null for anything unusable. */
function normalizeSession(s) {
  if (!s?.key || !Array.isArray(s.groups)) return null;
  const groups = s.groups
    .filter(g => g && g.scope && /^\d{4}-\d{2}$/.test(String(g.month || '')) &&
      Array.isArray(g.ords) && g.ords.length)
    .map(g => ({
      ...g, scope: g.scope, month: g.month, ords: g.ords,
      wipe: !!g.wipe,
      // Round-10 case 3: every option that changes what a call MEANS is part
      // of the record. A v2 record has no per-group dedup — unknown resolves
      // to the safe value (dedup ON can never create a duplicate; OFF can).
      dedup: g.dedup === undefined || g.dedup === null ? true : !!g.dedup,
    }));
  if (!groups.length) return null;
  // A record written by the pre-flight (before the shells existed) carries the
  // size placeholder — never let it out as if it were a real account id.
  const rows = (Array.isArray(s.rows) ? s.rows : []).map(unpadAccountId);
  const startedAt = Number.isFinite(s.startedAt) ? s.startedAt : null;
  return {
    ...s, v: SESSION_RECORD_V, groups, rows,
    startedAt,
    // Round-10 case 5: no immutable start stamp ⇒ the age is UNKNOWN, so the
    // record may be probed but never resumed and never trusted on a zero.
    unknownAge: startedAt === null,
    at: Number.isFinite(s.at) ? s.at : (startedAt ?? Date.now()),
    // No row payload (or no trustworthy age) ⇒ the job cannot be finished
    // from storage: probe-only.
    degraded: !!s.degraded || rows.length === 0 || startedAt === null,
    doneGroups: Array.isArray(s.doneGroups) ? s.doneGroups : [],
    debtLinks:  Array.isArray(s.debtLinks)  ? s.debtLinks  : [],
    pockets:    Array.isArray(s.pockets)    ? s.pockets    : [],
  };
}

function parseSessionRecord(raw) {
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch { return null; }   // corrupt → ignore safely
  if (!s || typeof s !== 'object') return null;
  if (SESSION_READABLE_V.has(Number(s.v))) return normalizeSession(s);
  // v4.21 shipped an UNVERSIONED single-group record { key, ords, scope,
  // month }. It still names real receipts, so it is upgraded rather than
  // thrown away — but it carries no row payload, so it lands degraded
  // (probe-only, resume disabled).
  if (!s.v && s.key && Array.isArray(s.ords) && s.ords.length && s.scope && s.month) {
    return normalizeSession({
      v: SESSION_RECORD_V, key: s.key, at: s.at ?? Date.now(),
      startedAt: Number.isFinite(s.at) ? s.at : null,
      groups: [{ scope: s.scope, month: s.month, wipe: false, dedup: true, ords: s.ords }],
      rows: [], pockets: [], debtLinks: [], createAccts: false, makeFmt: false,
      degraded: true, doneGroups: [], sideEffects: {},
    });
  }
  return null;   // unknown version / malformed → ignore safely
}

/**
 * Round-10 case 1: enumerate EVERY pending record, not just one. `migrate`
 * moves a v4.22 single-key record into its own namespaced slot — the only
 * write this function ever performs, and only on mount.
 */
function listStoredSessions({ migrate = false } = {}) {
  const out = [];
  let ls = null;
  try { ls = globalThis.localStorage || null; } catch { return out; }
  if (!ls) return out;
  const seen = new Set();
  const add = (rec) => { if (rec && !seen.has(rec.key)) { seen.add(rec.key); out.push(rec); } };

  try {
    const rec = parseSessionRecord(ls.getItem(SESSION_LS_LEGACY_KEY));
    if (rec) {
      if (migrate) {
        // Give it its own slot so a second tab can never overwrite it.
        // Unreadable data is left exactly where it is — we never delete what
        // we could not parse.
        try {
          ls.setItem(SESSION_LS_PREFIX + rec.key, JSON.stringify(rec));
          ls.removeItem(SESSION_LS_LEGACY_KEY);
        } catch { /* read-only storage: the legacy copy stays readable */ }
      }
      add(rec);
    }
  } catch { /* storage disabled */ }

  try {
    const slots = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(SESSION_LS_PREFIX)) slots.push(k);
    }
    slots.sort();
    for (const k of slots) {
      const rec = parseSessionRecord(ls.getItem(k));
      // A record must live in the slot named after its OWN key, otherwise it
      // has been tampered with or half-migrated — ignore it.
      if (rec && SESSION_LS_PREFIX + rec.key === k) add(rec);
    }
  } catch { /* storage disabled */ }

  out.sort((a, b) => (a.startedAt ?? a.at ?? 0) - (b.startedAt ?? b.at ?? 0));
  return out;
}

/**
 * Write the record into ITS OWN slot, degrading rather than corrupting.
 * Returns what was actually stored; THROWS SessionStorageError when nothing
 * could be stored, so no caller can proceed believing it is recoverable.
 */
function writeStoredImportSession(rec) {
  const slot = SESSION_LS_PREFIX + rec.key;
  const put = (r) => {
    const json = JSON.stringify(r);
    if (json.length > SESSION_MAX_CHARS) return false;
    const ls = globalThis.localStorage;
    if (!ls) throw new Error('localStorage is not available');
    ls.setItem(slot, json);
    return true;
  };
  try {
    if (put(rec)) return rec;
    const lite = { ...rec, rows: [], pockets: [], degraded: true };
    if (put(lite)) return lite;
  } catch (e) {
    throw new SessionStorageError(e?.message || String(e));   // disabled / quota
  }
  throw new SessionStorageError('recovery record too large to store');
}

/** Removes ONE session's slot — never any other tab's. */
function clearStoredImportSession(key) {
  if (!key) return;
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    ls.removeItem(SESSION_LS_PREFIX + key);
    // A legacy record that could not be migrated (storage was read-only then)
    // still belongs to THIS key — remove it, and nothing else.
    const legacy = parseSessionRecord(ls.getItem(SESSION_LS_LEGACY_KEY));
    if (legacy?.key === key) ls.removeItem(SESSION_LS_LEGACY_KEY);
  } catch { /* storage disabled */ }
}

const TYPE_ICONS  = { food: '🍜', transport: '🚗', bills: '💡', income: '💰', shop: '🛍', family: '❤️', other: '📦' };
const TYPE_LABELS = { food: 'อาหาร', transport: 'เดินทาง', bills: 'บิล', income: 'รายรับ', shop: 'ช้อปปิ้ง', family: 'ครอบครัว', other: 'อื่น ๆ' };

// Tints derive from the semantic colour var via color-mix so they track the
// active theme (a fixed rgba literal would stay pinned to the light-mode hue
// once dark mode ships — no --blue-soft/--rose-soft token exists to reach for).
const tint = (v, pct = 10) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`;
const SCOPE_BADGE = {
  personal: { label: 'ส่วนตัว',    bg: tint('--blue', 10),  border: tint('--blue', 35),  color: 'var(--blue)'   },
  family:   { label: 'ครอบครัว',   bg: tint('--rose', 10),  border: tint('--rose', 35),  color: 'var(--rose)'   },
};

const POCKET_TONE_BG = {
  amber:  tint('--accent', 10),  profit: tint('--success', 10),
  blue:   tint('--blue', 10),    violet: tint('--violet', 10),
  rose:   tint('--rose', 10),    brass:  tint('--brass', 10),
};

/** Shared empty list — a stable identity, so "no cross-scope debts" cannot
 *  masquerade as a state change and re-trigger the loads that depend on it. */
const NO_DEBTS = [];

export function CSVImporter({ scope: defaultScope = 'personal', debts = [], onImported, onClose }) {
  const [tab, setTab]           = useState('csv'); // 'csv' | 'pdf'
  const [step, setStep]         = useState('upload');

  // CSV state
  const [headers, setHeaders]   = useState([]);
  const [colMap, setColMap]     = useState({});
  const [rows, setRows]         = useState([]);
  const [makeFmt, setMakeFmt]   = useState(false);

  // Shared state
  const [preview, setPreview]   = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError]       = useState(null);
  const [fileName, setFileName] = useState('');

  // PDF state
  const [pdfFile, setPdfFile]         = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfParsing, setPdfParsing]   = useState(false);
  const [showPwd, setShowPwd]         = useState(false);

  const fileRef    = useRef();
  const pdfFileRef = useRef();

  // ── Round-9 M3: ONE gate in front of every action that starts new work ────
  // A stored session is unfinished work too: letting a new file through would
  // hand the next write a fresh plan and overwrite the only record of the
  // rows that are already on the server.
  const blockNewWork = (what) => {
    if (importing) { alert('กำลังบันทึกอยู่ — รอให้เสร็จก่อน' + what); return true; }
    if (storedSessionRef.current) {
      alert('มีการนำเข้าค้างอยู่จากครั้งก่อน — กด "ตรวจสอบผลอีกครั้ง" ให้จบ '
        + 'หรือกด "ทิ้งการกู้คืนนี้" ก่อน' + what);
      return true;
    }
    if (hasUnfinishedCommittedWork) {
      alert('มีรายการที่บันทึกแล้วแต่ยังปิดงานไม่ครบ — กด Import/ยืนยัน เพื่อทำต่อให้จบก่อน' + what);
      return true;
    }
    return false;
  };

  // Round-11: a refusal from resetImportSession is AUTHORITATIVE. It means the
  // previous session is still needed, so the new plan must not be adopted —
  // v4.23 ignored the return value and started work the tab could not record.
  const REUSE_BLOCKED_MSG =
    'ยังเริ่มงานใหม่ไม่ได้ — งานนำเข้าก่อนหน้ายังปิดไม่จบ กด "ตรวจสอบผลอีกครั้ง" '
    + 'หรือ "ทิ้งการกู้คืนนี้" ให้เรียบร้อยก่อน';

  // ── CSV ────────────────────────────────────────────────────────────────────
  const handleCSVFile = (file) => {
    if (!file) return;
    if (blockNewWork('เริ่มไฟล์ใหม่')) return;
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target.result);
        if (!parsed?.rows?.length) throw new Error('ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง');

        setHeaders(parsed.headers);
        setRows(parsed.rows);

        const detected = detectKBankColumns(parsed.headers);
        setColMap(detected);
        setMakeFmt(isMakeFormat(detected));

        // assignRowIds: the ONE place every source gets its immutable _rid —
        // all ambiguity/force/suggestion bookkeeping keys on it.
        const txns = assignRowIds(mapRowsToTransactions(parsed.rows, detected, defaultScope));
        // new file = new idempotency session — only if the old one may go
        if (!resetImportSession()) { alert(REUSE_BLOCKED_MSG); return; }
        setPreview(txns);
        setSelected(new Set(txns.map((_, i) => i)));
        setStep('preview');
      } catch (err) {
        setError('อ่านไฟล์ไม่ได้: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleColChange = (key, val) => {
    if (blockNewWork('เปลี่ยน mapping')) return;
    const newMap = { ...colMap, [key]: val };
    setColMap(newMap);
    const txns = assignRowIds(mapRowsToTransactions(rows, newMap, defaultScope));
    // remapped columns = a different batch — only if the old one may go
    if (!resetImportSession()) { alert(REUSE_BLOCKED_MSG); return; }
    setPreview(txns);
    setSelected(new Set(txns.map((_, i) => i)));
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
  const handlePDFParse = async () => {
    if (!pdfFile) return;
    if (blockNewWork('เริ่มไฟล์ใหม่')) return;
    setPdfParsing(true); setError(null);
    try {
      const buf  = await pdfFile.arrayBuffer();
      // PDF rows had NO per-row id (round-5 bug 1): every Set key collapsed
      // to undefined, so one ambiguity decision hit ALL PDF rows at once.
      const txns = assignRowIds(await parseKBankPDF(buf, pdfPassword, defaultScope));
      if (!txns.length) throw new Error('ไม่พบรายการธุรกรรม — ลองตรวจสอบรหัสผ่านหรือรูปแบบ Statement');
      // new file = new idempotency session — only if the old one may go
      if (!resetImportSession()) { alert(REUSE_BLOCKED_MSG); return; }
      setPreview(txns);
      setSelected(new Set(txns.map((_, i) => i)));
      setMakeFmt(false);
      setStep('preview');
    } catch (err) {
      let msg = err.message || String(err);
      if (/password|PasswordException/i.test(msg)) msg = 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
      setError('อ่าน PDF ไม่ได้: ' + msg);
    } finally { setPdfParsing(false); }
  };

  // ── Shared ─────────────────────────────────────────────────────────────────
  const toggleRow = (i) => setSelected(prev => {
    const n = new Set(prev);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });

  const toggleAll = () =>
    selected.size === preview.length
      ? setSelected(new Set())
      : setSelected(new Set(preview.map((_, i) => i)));

  const toggleScope = (sc) => {
    const idxs = preview.map((r, i) => r.scope === sc ? i : -1).filter(i => i >= 0);
    const allOn = idxs.every(i => selected.has(i));
    setSelected(prev => {
      const n = new Set(prev);
      idxs.forEach(i => allOn ? n.delete(i) : n.add(i));
      return n;
    });
  };

  const resetUpload = () => {
    // The exits are already gated (hasUnfinishedCommittedWork disables '← กลับ'),
    // so a refusal here would be a bug — honour it anyway rather than land on
    // the upload step with a session this tab can no longer write.
    if (!resetImportSession()) { alert(REUSE_BLOCKED_MSG); return; }
    setStep('upload'); setError(null);
    setPdfFile(null); setPdfPassword(''); setFileName('');
    setPreview([]); setSelected(new Set());
    setHeaders([]); setRows([]); setMakeFmt(false);
  };

  // Import options (Make format only)
  const [dedup, setDedup]         = useState(true);   // skip rows that already exist
  const [createAccts, setCreateAccts] = useState(true); // auto-create accounts from pockets
  const [wipeMonth, setWipeMonth] = useState(false);  // delete all txns in selected months first
  const [importStats, setImportStats] = useState(null);

  // Accounts that will be created/updated
  const pocketSummary = useMemo(
    () => makeFmt ? extractAccountsFromMapped(preview) : [],
    [preview, makeFmt]
  );

  // ── Debt payment auto-link suggestions ───────────────────────────────────
  // Bumped by the "ลองใหม่" button on the auto-link warning — re-runs both
  // loads below without touching the parsed preview.
  const [linkRetry, setLinkRetry] = useState(0);

  // Audit batch A / B6: ONE Make export carries both scopes, but the page
  // hands us only the debts of the scope it is showing. suggestDebtPaymentLinks
  // now refuses to cross scopes, so the debts of every OTHER scope present in
  // the batch have to be loaded here — otherwise a family payment silently
  // stops being offered at all.
  //
  // Both effects below key on STRINGS, and reset to the shared NO_DEBTS
  // constant rather than a fresh []. A new array identity on every render
  // re-ran the history load, and a second (succeeding) read silently cleared
  // the warning the first (failing) one had just raised.
  const missingScopeKey = useMemo(() => {
    const scopes = [...new Set(preview.map(r => r.scope || 'personal'))].sort();
    return scopes.filter(s => s !== defaultScope).join('|');
  }, [preview, defaultScope]);

  const [crossScopeDebts, setCrossScopeDebts] = useState(NO_DEBTS);
  const [debtsLoadFailed, setDebtsLoadFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const scopes = missingScopeKey ? missingScopeKey.split('|') : [];
    if (!scopes.length) { setCrossScopeDebts(NO_DEBTS); setDebtsLoadFailed(false); return; }
    (async () => {
      try {
        const lists = await Promise.all(scopes.map(s => listDebts({ scope: s })));
        if (alive) { setCrossScopeDebts(lists.flat().filter(Boolean)); setDebtsLoadFailed(false); }
      } catch {
        // Unknown debts is not "no debts" — same rule as the history below.
        if (alive) { setCrossScopeDebts(NO_DEBTS); setDebtsLoadFailed(true); }
      }
    })();
    return () => { alive = false; };
  }, [missingScopeKey, linkRetry]);

  const scopedDebts = useMemo(
    () => [...(debts || []), ...crossScopeDebts],
    [debts, crossScopeDebts],
  );

  // Real existing payments for the preview's months — passing [] used to
  // re-offer months that were already recorded (double increment risk).
  //
  // Audit batch A / B7: a FAILED history load used to be swallowed into [],
  // which reads as "nothing has ever been paid" — the strongest possible
  // claim, made from no evidence. An already-paid month was then offered
  // again and recordDebtPayment's insert-or-noop would relink the row to a
  // different transaction. A failure now DISABLES auto-linking entirely and
  // says so, with a retry.
  const [existingPayments, setExistingPayments] = useState([]);
  const [paymentsLoadFailed, setPaymentsLoadFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!preview.length || !scopedDebts.length) {
        if (alive) { setExistingPayments([]); setPaymentsLoadFailed(false); }
        return;
      }
      const yms = [...new Set(preview.map(r => bangkokMonth(r.occurred_at)).filter(Boolean))].sort();
      if (!yms.length) {
        if (alive) { setExistingPayments([]); setPaymentsLoadFailed(false); }
        return;
      }
      try {
        const pays = await listDebtPayments({
          startMonth: `${yms[0]}-01`, endMonth: `${yms[yms.length - 1]}-01`,
        });
        if (alive) { setExistingPayments(pays || []); setPaymentsLoadFailed(false); }
      } catch {
        if (alive) { setExistingPayments([]); setPaymentsLoadFailed(true); }
      }
    })();
    return () => { alive = false; };
  }, [preview, scopedDebts, linkRetry]);

  // One switch in front of every suggestion: if we could not read what is
  // already recorded (or which debts exist), we offer nothing at all.
  const autoLinkBlocked = paymentsLoadFailed || debtsLoadFailed;
  const autoLinkBlockedMsg = debtsLoadFailed
    ? 'โหลดรายการหนี้สินข้ามหมวดไม่สำเร็จ — ปิดการ link จ่ายหนี้อัตโนมัติไว้ก่อน '
      + 'เพื่อไม่ให้บันทึกซ้ำ (นำเข้ารายการได้ตามปกติ)'
    : 'โหลดประวัติการจ่ายหนี้ไม่สำเร็จ — ปิดการ link จ่ายหนี้อัตโนมัติไว้ก่อน '
      + 'เพื่อไม่ให้บันทึกทับเดือนที่จ่ายไปแล้ว (นำเข้ารายการได้ตามปกติ)';

  const debtSuggestions = useMemo(
    () => (autoLinkBlocked ? [] : suggestDebtPaymentLinks(preview, scopedDebts, existingPayments)),
    [preview, scopedDebts, existingPayments, autoLinkBlocked]
  );
  const [skippedSuggestions, setSkippedSuggestions] = useState(new Set());
  // 60–79 = "น่าจะใช่" only — auto-record needs the user's explicit tick, so
  // sub-80 suggestions start UNchecked (≥80 start checked).
  useEffect(() => {
    setSkippedSuggestions(new Set(
      debtSuggestions.filter(s => s.confidence < 80)
        .map(s => `${s.txn._rid}|${s.debt.id}|${s.ym}`)
    ));
  }, [debtSuggestions]);
  const activeSuggestions = debtSuggestions.filter(s =>
    !skippedSuggestions.has(`${s.txn._rid}|${s.debt.id}|${s.ym}`)
  );

  // ── Two-tier dedup pre-classification (audit rounds 4–5) ─────────────────
  // A row that only matches an existing row through made-up clocks is
  // AMBIGUOUS — never decided silently: listed below with both sides shown,
  // default SKIP, one tap (or bulk action) to include → sent with force=true.
  //
  // Round-5 bug 2: classification MUST run on the SELECTED batch, not the
  // full preview — deselecting a tier-1 consumer changes what the rest of
  // the batch means. Existing ledger rows are fetched once per preview
  // (superset range); the classification itself is a pure useMemo over the
  // CURRENT selection, so what is shown never diverges from what executes.
  const [existingRows, setExistingRows] = useState(null);   // null = loading/unavailable
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!preview.length) { if (alive) setExistingRows([]); return; }
      const yms = [...new Set(preview.map(r => bangkokMonth(r.occurred_at)).filter(Boolean))].sort();
      if (!yms.length) { if (alive) setExistingRows([]); return; }
      try {
        const { startTs } = getMonthBounds(yms[0]);
        const { endTs }   = getMonthBounds(yms[yms.length - 1]);
        const rowsAll = [];
        for (const sc of [...new Set(preview.map(r => r.scope))]) {
          const got = await getExistingRowsForDedup({ startDate: startTs, endDate: endTs, scope: sc });
          rowsAll.push(...got.map(g => ({ ...g, scope: sc })));
        }
        if (alive) setExistingRows(rowsAll);
      } catch { if (alive) setExistingRows([]); }
    })();
    return () => { alive = false; };
  }, [preview]);

  const classification = useMemo(() => {
    if (!dedup || wipeMonth || !existingRows) return null;
    const selectedRows = preview.filter((_, i) => selected.has(i));
    if (!selectedRows.length) return null;
    const out = { toImport: [], duplicates: [], ambiguous: [] };
    for (const sc of [...new Set(selectedRows.map(r => r.scope))]) {
      const cls = classifyImportRows(
        selectedRows.filter(r => r.scope === sc),
        existingRows.filter(e => e.scope === sc));
      out.toImport.push(...cls.toImport);
      out.duplicates.push(...cls.duplicates);
      out.ambiguous.push(...cls.ambiguous);
    }
    return out;
  }, [preview, selected, existingRows, dedup, wipeMonth]);

  const ambiguous = classification?.ambiguous ?? [];
  const [includedAmbiguous, setIncludedAmbiguous] = useState(new Set());  // _rid
  // Selection/dedup changes can add or remove ambiguities — keep only the
  // user choices that still apply.
  useEffect(() => {
    setIncludedAmbiguous(prev => {
      const valid = new Set(ambiguous.map(a => a.row._rid));
      const next = new Set([...prev].filter(rid => valid.has(rid)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classification]);

  // Phase-2 (round-5 bug 2b/4): ambiguities discovered by the AUTHORITATIVE
  // RPC (or the execution-time fallback classification) that the preview
  // did not show — the decision step reopens for exactly these rows.
  const [serverAmbiguous, setServerAmbiguous] = useState([]);   // [{ row, incoming, existing }]
  const [serverIncluded, setServerIncluded] = useState(new Set());
  const pendingStatsRef = useRef(null);   // stats accumulated in phase 1

  // Round-6 B1: one import session = ONE idempotency key covering every
  // group and the force phase; committedRef maps _rid → transaction_id for
  // every row known to be committed (from v6 receipts / RETURNING rows).
  // A retry sends only uncommitted work; summary counters are computed only
  // from the final aggregated results.
  const importKeyRef = useRef(null);
  const committedRef = useRef(new Map());
  // Round-9 F1: ords committed by a PRE-v6 deployment that returned no
  // mapping. They sit in committedRef with a null value like an FK-nulled
  // (deleted) row does, but they mean the opposite — "inserted, id unknown" —
  // so the non-null-mapping policy must be able to tell the two apart.
  const unmappedRef = useRef(new Set());
  // Reactive mirror of committedRef.size — drives the exit gates (round 7).
  const [committedCount, setCommittedCount] = useState(0);
  const syncCommitted = () => setCommittedCount(committedRef.current.size);
  // Side effects (account apply + debt links) that failed after commit and
  // still await a successful retry — surfaced on the done screen.
  const [pendingSideEffects, setPendingSideEffects] = useState(null);
  const [sideEffectsDone, setSideEffectsDone] = useState(false);
  const sideEffectsDoneRef = useRef(false);
  const markSideEffects = (pending) => {
    setPendingSideEffects(pending);
    sideEffectsDoneRef.current = !pending;
    setSideEffectsDone(!pending);
  };

  // ── Round-8 B2: OUTCOME-UNKNOWN state ────────────────────────────────────
  // committedRef can only know about writes whose RESPONSE arrived. After a
  // post-commit response loss it is EMPTY while server rows exist, so the
  // round-7 gate silently unlocked and let the import key + mappings be
  // thrown away. pendingRecovery closes that hole: it is set BEFORE every
  // write call, together with the key and the ords in flight, and cleared
  // ONLY by an authoritative answer —
  //   · a response (including recovered:true), or
  //   · a definitive server error proving the transaction was rejected.
  // A network/timeout/gateway error clears NOTHING: the rows may be live.
  const [pendingRecovery, setPendingRecovery] = useState(null);
  const pendingRecoveryRef = useRef(null);

  // ── Round-9 M2/M3 + round-10 case 1: the persisted session records ───────
  // allSessions = EVERY pending record in localStorage (this tab's and other
  // tabs'). storedSession = the one THIS tab has adopted and is responsible
  // for; it gates every action that would start new work (M3), and it is the
  // only route back to those rows.
  //
  // OWNERSHIP (the round-10 semantics, stated in the audit reply):
  //  · A tab owns at most ONE session key — `ownedKeyRef` — set when it mints
  //    a key for a new import, or when it adopts a stored record.
  //  · A tab may write/patch/remove ONLY its owned key's slot. Another tab's
  //    record is read for display and never touched.
  //  · On mount, exactly one pending record ⇒ adopt it (a reload is
  //    indistinguishable from another tab, and adopting is the safe default,
  //    unchanged from v4.22). More than one ⇒ adopt NONE and let the user
  //    pick, so a tab is never silently bound to a session it did not start.
  //  · The new-work gate looks at the ADOPTED record only, so an unrelated
  //    tab's pending session can never permanently lock this tab — a new
  //    import mints its own key and cannot collide with it.
  //
  // ── Round-11 · OWNERSHIP-RELEASE POLICY ───────────────────────────────────
  // v4.23 let ownership OUTLIVE the session it named: resetImportSession()
  // cleared importKeyRef and sessionRecordRef but left ownedKeyRef pointing at
  // the abandoned key, and persistSession() answered the resulting mismatch
  // with a silent `return`. A second import therefore committed rows that
  // NOTHING on disk described. Two rules close it:
  //   1. persistSession THROWS on a mismatch. A caller that cannot record is a
  //      caller that must not write — identical discipline to a full disk.
  //   2. Ownership is released in exactly ONE place (releaseOwnedSession,
  //      reached only through resetImportSession), which moves ownedKey,
  //      importKeyRef, sessionRecordRef and the adopted record TOGETHER.
  // Release is permitted only when the owned session cannot still be needed —
  // the same condition the new-work gate already enforces: no unanswered
  // write, nothing committed awaiting finalisation, no adopted record. What
  // happens to its stored record then depends on whether the server can hold
  // receipts for it (sessionMayHaveReceipts): if it provably cannot, the
  // record is a phantom and is deleted; if it can, the record SURVIVES as an
  // un-adopted pending session — it reappears in the picker and after a
  // reload, so a session can never be lost, only handed back.
  const [allSessions, setAllSessions] = useState(() => listStoredSessions({ migrate: true }));
  const [adoptedKey, setAdoptedKey] = useState(
    () => (allSessions.length === 1 ? allSessions[0].key : null));
  // ownedKey: the ONE key this tab may write or remove. The ref is the
  // authority (read synchronously mid-flow); the state is its render mirror.
  const [ownedKey, setOwnedKeyState] = useState(adoptedKey);
  const ownedKeyRef = useRef(adoptedKey);
  const setOwnedKey = (k) => { ownedKeyRef.current = k; setOwnedKeyState(k); };
  const sessionStartedAtRef = useRef(null);
  // Did any call under this key come back reporting a settled outcome
  // (inserted / dup / ambiguous)? Then the server may hold receipts and the
  // record must outlive a release. Dup-only groups leave committedRef empty,
  // so committedRef alone is not a sound answer.
  const outcomesSeenRef = useRef(false);
  // Account shells prepared by THIS attempt. They hold no balance, no anchor
  // and no transaction, and a retry reuses them — but an abort must still say
  // so rather than implying the server was never touched.
  const shellsReadyRef = useRef(0);
  const noteOutcomes = (res) => {
    if (!res) return;
    if (res.inserted?.length || res.insertedCount > 0
        || res.dupSkipped > 0 || res.ambiguous?.length) outcomesSeenRef.current = true;
  };
  const sessionMayHaveReceipts = () =>
    !!pendingRecoveryRef.current || committedRef.current.size > 0 || outcomesSeenRef.current;

  /**
   * Round-11 case B: the abort copy must match reality. Before anything has
   * committed, "ยังไม่ได้นำเข้าอะไรทั้งสิ้น" is the truth and the user should
   * simply retry. AFTER a partial commit it is a lie — say what already landed,
   * say the job is unfinished, and say the recovery record is still there.
   */
  const recordAbortMessage = (err) => {
    const reason = abortReason(err);
    const tail = 'กรุณาเพิ่มพื้นที่ว่างของเบราว์เซอร์ (หรือออกจากโหมดไม่ระบุตัวตน) แล้วกด Import อีกครั้ง';
    if (!sessionMayHaveReceipts()) {
      // Belt and braces: with the full-size pre-flight this should be
      // unreachable, but if a shell ever does exist, say so.
      if (shellsReadyRef.current > 0) {
        return `บันทึกจุดกู้คืนไม่ได้ (${reason}) — ยังไม่ได้นำเข้ารายการใดเลย `
          + `แต่ระบบเตรียมบัญชีไว้แล้ว ${shellsReadyRef.current} บัญชี `
          + '(บัญชีเปล่า ไม่มียอดและไม่มีรายการ — จะถูกใช้ซ้ำเมื่อ Import ใหม่) ' + tail;
      }
      return `บันทึกจุดกู้คืนไม่ได้ (${reason}) — ยังไม่ได้นำเข้าอะไรทั้งสิ้น ` + tail;
    }
    const live = [...committedRef.current.values()].filter(v => v !== null).length
      + unmappedRef.current.size;
    return `บันทึกจุดกู้คืนเพิ่มไม่ได้ (${reason}) — `
      + `ตอนนี้มี ${live} รายการที่บันทึกลงระบบไปแล้ว และงานนี้ยังไม่จบ `
      + 'ระบบยังเก็บจุดกู้คืนเดิมไว้ให้ (ไม่ได้ล้างทิ้ง) — เพิ่มพื้นที่ว่างแล้วกดทำต่อได้เลย '
      + 'ระบบจะทำเฉพาะส่วนที่ยังไม่สำเร็จ (ไม่มีการเบิ้ล)';
  };
  const storedSession = allSessions.find(s => s.key === adoptedKey) || null;
  const otherSessions = allSessions.filter(s => s.key !== adoptedKey);
  const storedSessionRef = useRef(storedSession);
  storedSessionRef.current = storedSession;
  const [recovering, setRecovering] = useState(false);
  // What the recovery probe actually found: null | {kind:'none'|'partial'
  // |'degraded'|'stale'|'unknown-age', …}. 'none' and 'partial' must NEVER
  // reach the done screen (round-9 M1).
  const [recoveryReport, setRecoveryReport] = useState(null);
  const sessionRecordRef = useRef(storedSession);

  /**
   * Persist the complete record into ITS OWN slot. THROWS — never returns
   * quietly — when this tab owns a different key (round-11 blocker) or when
   * storage refuses the write (round-10 case 4). Every caller that runs
   * BEFORE a server write must let the throw abort it.
   */
  const persistSession = (rec) => {
    if (!rec?.key) throw new SessionStorageError('no session key', 'ownership');
    const owned = ownedKeyRef.current;
    if (owned && owned !== rec.key) {
      throw new SessionStorageError(
        `this tab owns session ${owned}, not ${rec.key}`, 'ownership');
    }
    if (owned !== rec.key) setOwnedKey(rec.key);
    sessionRecordRef.current = writeStoredImportSession(rec);
  };
  const patchSession = (patch) => {
    const cur = sessionRecordRef.current;
    if (!cur) throw new SessionStorageError('no recovery record to patch', 'ownership');
    // startedAt is immutable (round-10 case 5) — `at` is the display stamp.
    persistSession({ ...cur, ...patch, startedAt: cur.startedAt, at: Date.now() });
  };
  /**
   * Post-commit bookkeeping. The write already happened, so a storage failure
   * here can abort nothing: the pre-write record already names every group
   * and every row, and the server receipts keep a resumed wipe idempotent.
   */
  const patchSessionSoft = (patch) => {
    try { patchSession(patch); } catch { /* recovery record is already on disk */ }
  };
  /**
   * The ONE place ownership changes. `discard` deletes the stored record;
   * otherwise the record stays on disk as an un-adopted pending session that
   * the picker (and the next page load) can hand back.
   */
  const releaseOwnedSession = ({ discard, keepImportKey = false }) => {
    const key = ownedKeyRef.current
      || sessionRecordRef.current?.key || storedSessionRef.current?.key || null;
    if (discard && key) clearStoredImportSession(key);
    sessionRecordRef.current = null;
    storedSessionRef.current = null;
    if (!keepImportKey) importKeyRef.current = null;
    outcomesSeenRef.current = false;
    shellsReadyRef.current = 0;
    sessionStartedAtRef.current = null;
    setOwnedKey(null);
    // A kept record is handed straight back to the picker — released, never
    // lost. (Read-only enumeration: releasing must not write anything.)
    if (discard && key) setAllSessions(prev => prev.filter(r => r.key !== key));
    else setAllSessions(listStoredSessions());
    setAdoptedKey(null);
    setRecoveryReport(null);
    return key;
  };
  /** Authoritative full completion / informed discard: the record dies. */
  const dropStoredSession = (opts = {}) => releaseOwnedSession({ discard: true, ...opts });
  /** Take responsibility for one of several pending records (the picker). */
  const adoptStoredSession = (key) => {
    if (importing || recovering) return;
    if (ownedKeyRef.current && ownedKeyRef.current !== key) return;   // button is disabled
    const rec = allSessions.find(s => s.key === key);
    if (!rec) return;
    setOwnedKey(key);
    importKeyRef.current = key;
    sessionRecordRef.current = rec;
    setAdoptedKey(key);
    setRecoveryReport(null);
  };

  // Round-10 case 1: another tab created, finished or discarded a session.
  // Refresh what we SHOW; never touch what we own (a `storage` event is a
  // notification, not permission to rewrite our own in-memory record).
  useEffect(() => {
    const onStorage = (e) => {
      const k = e?.key;
      if (k && k !== SESSION_LS_LEGACY_KEY && !String(k).startsWith(SESSION_LS_PREFIX)) return;
      const owned = ownedKeyRef.current;
      const fromDisk = listStoredSessions().filter(r => r.key !== owned);
      setAllSessions(prev => {
        const mine = prev.find(r => r.key === owned);
        return mine ? [mine, ...fromDisk] : fromDisk;
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const beginPendingRecovery = (info) => {
    pendingRecoveryRef.current = info;
    setPendingRecovery(info);
  };
  // Round 9: this clears the IN-MEMORY marker only. The persisted record has
  // its own, longer life — it survives every group and every side-effect
  // stage and is dropped only on full completion or an informed discard.
  const clearPendingRecovery = () => {
    pendingRecoveryRef.current = null;
    setPendingRecovery(null);
  };
  /** Error path: clear ONLY when the server proved nothing committed. */
  const settlePendingRecovery = (err) => {
    if (isDefinitiveServerError(err)) clearPendingRecovery();
  };

  // Round-7 B4 + round-8 B2: unfinished work THIS page load knows about.
  const inMemoryUnfinished =
    (committedCount > 0 && !sideEffectsDone) || !!pendingRecovery;
  // Round-9 M3: THE gate for starting new work. A stored session belongs in
  // it — otherwise a new file could be dropped before recovery and the next
  // write would overwrite the only record of the committed rows.
  const hasUnfinishedCommittedWork = inMemoryUnfinished || !!storedSession;

  const resetImportSession = () => {
    // Never destroy recovery state while committed work is unfinished, a
    // write's outcome is unknown, or a stored session awaits recovery — the
    // key is the only way back to the rows.
    if (pendingRecoveryRef.current) return false;
    if (storedSessionRef.current) return false;
    if (committedRef.current.size > 0 && !sideEffectsDoneRef.current) return false;
    // ── Round-11 ── The ONLY release point. Reaching here means the three
    // conditions above hold, i.e. the owned session cannot still be needed.
    // Its record survives the release whenever the server might hold receipts
    // for it (it returns as an un-adopted pending session); it is deleted only
    // when nothing under that key ever reached the server.
    if (ownedKeyRef.current) releaseOwnedSession({ discard: !sessionMayHaveReceipts() });
    importKeyRef.current = null;
    committedRef.current = new Map();
    unmappedRef.current = new Set();
    pendingStatsRef.current = null;
    sessionRecordRef.current = null;
    outcomesSeenRef.current = false;
    setCommittedCount(0);
    markSideEffects(null);
    sideEffectsDoneRef.current = false;
    setSideEffectsDone(false);
    setServerAmbiguous([]); setServerIncluded(new Set());
    setImportStats(null);
    setRecoveryReport(null);
    return true;
  };

  // ── Side-effect passes (both idempotent — safe to re-run on retry) ───────
  // Account apply: a plain state write (balance + anchor + source) guarded
  // by the never-rewind rule; running it twice writes the same values.
  const applyAccountPass = async (pockets) => {
    try {
      if (pockets?.length) await bulkUpsertAccountsByPocket(pockets, { mode: 'apply' });
      return null;
    } catch (e) {
      return { pockets, count: pockets.length, message: e.message || String(e) };
    }
  };
  // Debt links: recordDebtPayment is insert-or-noop on the UNIQUE
  // (debt_id, pay_month) — via the RPC or the ON CONFLICT DO NOTHING
  // fallback — so a retried link can never double a payment row or the
  // months_paid counter.
  const applyDebtLinkPass = async (links) => {
    let ok = 0;
    const failed = [];
    for (const l of links) {
      try {
        await recordDebtPayment({
          debt_id: l.debt_id, pay_month: l.pay_month,
          amount_paid: l.amount, transaction_id: l.transaction_id,
          notes: 'auto-linked from import',
        });
        ok++;
      } catch (e) {
        failed.push({ ...l, message: e.message || String(e) });
      }
    }
    return { ok, failed };
  };

  // ── Finalise: post-success side effects + stats + done screen ────────────
  // Runs ONLY after every transaction group (and the force phase, if any)
  // has succeeded. Side-effect policy (round-6 B2/B3): account balance
  // mutations and debt links derive exclusively from rows that actually
  // inserted, using exact ids — never from the preview, never via re-query.
  // Round-7 B2/B3: failures here are NOT swallowed — they surface on the
  // done screen with a retry that re-runs only the failed pass.
  const finalizeImport = async (S) => {
    const committed = committedRef.current;
    const unmapped  = unmappedRef.current;
    // ── Round-9 F1: NON-NULL MAPPING POLICY ────────────────────────────────
    // A receipt whose transaction_id is NULL means the imported transaction
    // was deleted afterwards (FK ON DELETE SET NULL). Such a row must not
    // feed a balance anchor or a debt link — `committed.has()` could not see
    // the difference. The only nulls that still count as live are the pre-v6
    // "inserted but unmapped" ords tracked in unmappedRef.
    const isLive = (rid) => committed.get(rid) != null || unmapped.has(rid);
    const skippedDeleted = [...committed.keys()]
      .filter(rid => committed.get(rid) == null && !unmapped.has(rid)).length;
    const insertedTotal = [...committed.values()].filter(v => v !== null).length + (S.noMapInserted || 0);

    // B2: apply pocket balances AFTER full success, from LIVE inserted rows.
    let accountFail = null;
    if (S.createAccts) {
      const insertedPlanRows = (S.plan || []).filter(r => isLive(r._rid));
      const pockets = extractAccountsFromMapped(insertedPlanRows);
      accountFail = await applyAccountPass(pockets);
    }

    // B3: debt links ONLY for suggestions whose row really inserted, with
    // the exact transaction_id from the receipt/RETURNING mapping. After a
    // reload the suggestions come from the persisted record (M2) — the
    // in-memory `activeSuggestions` is empty there.
    const links = (S.debtLinks || [])
      .map(l => ({ ...l, transaction_id: committed.get(l._rid) }))
      .filter(l => l.transaction_id);   // not inserted / deleted → no link
    const { ok: debtLinked, failed: debtFails } = await applyDebtLinkPass(links);

    const pending = (accountFail || debtFails.length)
      ? { accounts: accountFail, debtFails }
      : null;
    markSideEffects(pending);
    // The record dies ONLY here — authoritative full completion. While a side
    // effect is still outstanding it stays, so a reload can finish the job.
    if (pending) patchSessionSoft({ sideEffects: { accounts: !accountFail, debts: !debtFails.length } });
    else dropStoredSession();

    setImportStats({
      inserted: insertedTotal, skipped: S.dupSkipped, debtLinked, skippedDeleted,
      ambiguousSkipped: S.ambiguousSkipped, ambiguousImported: S.ambiguousImported,
      accountsCreated: S.accountsCreated,
      // A resumed run reports the wipes IT executed (round-10 case 2); the
      // primary path still reports "every month in the plan".
      wipedMonths: S.wipedMonths ?? (S.wipeExecuted ? S.monthArr.length : 0),
    });
    setStep('done');
    onImported?.();
  };

  // Round-7: re-run ONLY the failed side-effect pass(es) from the done
  // screen. Both passes are idempotent (see comments above).
  const retrySideEffects = async () => {
    if (importing) return;
    const P = pendingSideEffects;
    if (!P) return;
    setImporting(true);
    try {
      const accountFail = P.accounts ? await applyAccountPass(P.accounts.pockets) : null;
      let stillFailed = [];
      if (P.debtFails?.length) {
        const { ok, failed } = await applyDebtLinkPass(P.debtFails);
        stillFailed = failed;
        if (ok) setImportStats(s => s ? { ...s, debtLinked: (s.debtLinked || 0) + ok } : s);
      }
      const stillPending = (accountFail || stillFailed.length)
        ? { accounts: accountFail, debtFails: stillFailed }
        : null;
      markSideEffects(stillPending);
      if (stillPending) patchSessionSoft({ sideEffects: { accounts: !accountFail, debts: !stillFailed.length } });
      else dropStoredSession();
      // Round-8 follow-up 1: the retry writes the SAME account balances and
      // debt payments the primary path writes, so it must refresh Finance the
      // same way. Without this the done screen said "สำเร็จ" while the page
      // behind it still showed pre-retry balances until the next reload.
      // finalizeImport() calls onImported unconditionally — this matches it.
      onImported?.();
    } finally { setImporting(false); }
  };

  // ── Round-8 B2 + round-9 M1/M2: cross-reload recovery ────────────────────
  // A stored session means a write was declared and never authoritatively
  // answered. The recovery READ (p_probe: pure reconstruction from the v8
  // receipts — no wipe, no insert) runs over EVERY group of the session, and
  // the number of resolved outcomes decides what may be claimed:
  //   0 resolved       → nothing committed. NOT a success, no finalisation.
  //   < total resolved → part committed. Stays pending; resume finishes it.
  //   = total resolved → the whole job is described; finalise for real.
  const totalOrds = (rec) => (rec?.groups || []).reduce((n, g) => n + g.ords.length, 0);

  /** Rebuild the finalisation input from the PERSISTED record (M2). */
  const statsFromRecord = (rec, extra = {}) => ({
    dupSkipped: 0, ambiguousSkipped: 0, ambiguousImported: 0, noMapInserted: 0,
    usedRpc: true, wipeExecuted: false,
    monthArr: rec.groups.map(g => g.month),
    plan: rec.rows || [],
    accountsCreated: 0,
    // A degraded record has no rows/pockets → no side effects may be invented.
    createAccts: !!rec.createAccts && !rec.degraded,
    debtLinks: rec.degraded ? [] : (rec.debtLinks || []),
    ...extra,
  });

  const recoverStoredSession = async () => {
    if (recovering || importing) return;
    const rec = storedSessionRef.current;
    if (!rec) return;
    // ── Round-10 case 5 (F2) ── The age that matters is the age of the
    // RECEIPTS, i.e. when the session STARTED — never `at`, which every patch
    // refreshes. A record created on day 0 and patched on day 59 looked one
    // day old while its receipts were three weeks from the purge horizon.
    if (rec.startedAt != null && Date.now() - rec.startedAt > SESSION_MAX_AGE_MS) {
      // Older than the receipt retention margin — a probe could read "zero"
      // from a purge and mislead. Say so instead of guessing.
      setRecoveryReport({ kind: 'stale', total: totalOrds(rec), resolved: 0 });
      return;
    }
    setRecovering(true); setError(null);
    try {
      importKeyRef.current = rec.key;
      const total = totalOrds(rec);
      let resolved = 0, dupSkipped = 0;
      const amb = [];
      for (const g of rec.groups) {
        // Only the ords are needed to read back receipts, and p_probe
        // guarantees these stubs can never be processed. `force` is never set
        // on a probe — a forced row would REOPEN its ambiguity receipt.
        const res = await importTransactionsBatch({
          scope: g.scope, month: g.month, wipe: false, dedup: true,
          rows: g.ords.map(o => ({ _rid: o, scope: g.scope })),
          importKey: rec.key, probe: true,
        });
        // transaction_id may be NULL: the FK nulls the mapping when an
        // imported transaction is deleted afterwards. Keep the ord (it is
        // processed, so it must never be re-sent) and let finalisation skip it.
        for (const m of res.inserted) committedRef.current.set(m.ord, m.transaction_id ?? null);
        resolved += res.inserted.length + res.dupSkipped + res.ambiguous.length;
        dupSkipped += res.dupSkipped;
        for (const a of res.ambiguous) amb.push({ group: g, a });
      }
      syncCommitted();

      if (resolved === 0) {
        // ── M1 ── The server has NO outcome under this key: the request never
        // committed. Saying "Import สำเร็จ" here was the round-9 blocker.
        committedRef.current = new Map();
        unmappedRef.current = new Set();
        syncCommitted();
        // Round-10 case 5: on a record with no immutable start stamp, a zero
        // could equally be a purge artefact. Do not claim "nothing imported".
        setRecoveryReport({ kind: rec.unknownAge ? 'unknown-age' : 'none', total, resolved: 0 });
        return;
      }
      if (rec.degraded) {
        // Probe-only record (upgraded v1, or rows dropped by the size guard):
        // the outcome can be reported, but the job cannot be finished from it.
        setRecoveryReport({
          kind: 'degraded', total, resolved,
          inserted: [...committedRef.current.values()].filter(v => v != null).length,
          dup: dupSkipped, ambiguous: amb.length,
        });
        return;
      }
      if (resolved < total) {
        // ── M1 ── Part of the job landed. Still pending — never a success.
        setRecoveryReport({
          kind: 'partial', total, resolved,
          inserted: [...committedRef.current.values()].filter(v => v != null).length,
          dup: dupSkipped, ambiguous: amb.length,
        });
        return;
      }

      clearPendingRecovery();
      const stats = statsFromRecord(rec, { dupSkipped });
      if (amb.length) {
        // The decision UI reappears identically — and the row is the PERSISTED
        // one (M2), so a force-import keeps its category / type / account_id
        // instead of the sparse {title, amount, date} snapshot.
        pendingStatsRef.current = stats;
        setServerAmbiguous(amb.map(({ group, a }) => ({
          row: rowFromRecord(rec, a, group),
          incoming: a.incoming, existing: a.existing,
        })));
        setServerIncluded(new Set());
        setRecoveryReport(null);
        setStep('resolve');
      } else {
        setRecoveryReport(null);
        await finalizeImport(stats);
      }
    } catch (err) {
      setError('ตรวจสอบผลการนำเข้าไม่สำเร็จ: ' + (err.message || String(err)) + ' — ลองอีกครั้งได้');
    } finally { setRecovering(false); }
  };

  /** The full stored row for an ambiguity, falling back to the snapshot. */
  const rowFromRecord = (rec, a, group) => {
    const stored = (rec.rows || []).find(r => r._rid === a.ord);
    if (stored) return { ...stored };
    return {
      _rid: a.ord, scope: group?.scope ?? 'personal',
      title: a.incoming?.title ?? '(ไม่มีชื่อ)',
      occurred_at: a.incoming?.occurred_at,
      amount: Number(a.incoming?.amount),
      note: a.incoming?.note ?? null,
      category: null, type: null, account_id: null,
    };
  };

  /**
   * Round-9 M1 (partial) — finish the job from the persisted record. Every
   * group is re-sent WHOLE under the same import key: settled ords are
   * reconstructed by the RPC (never re-inserted) and unsettled ords are
   * processed, so one response per group describes that group completely and
   * nothing can be double-counted.
   *
   * Round-10 cases 2 + 3: every per-group option comes from the RECORD, never
   * from a re-derived default. `wipe: false, dedup: true` was wrong twice —
   * a group that never ran lost its "replace the month" intent (the month kept
   * its stale rows for ever), and a run with "ข้ามรายการซ้ำ" switched OFF had
   * dedup silently switched back ON, so its deliberate near-duplicates were
   * dropped.
   */
  const resumeStoredSession = async () => {
    if (importing || recovering) return;
    const rec = sessionRecordRef.current || storedSessionRef.current;
    if (!rec || rec.degraded || !rec.rows?.length) return;
    setImporting(true); setError(null);
    try {
      importKeyRef.current = rec.key;
      const byGroup = new Map();
      for (const raw of rec.rows) {
        const r = unpadAccountId(raw);   // never send a size placeholder as an id
        const k = `${r.scope}|${r.month}`;
        if (!byGroup.has(k)) byGroup.set(k, []);
        byGroup.get(k).push(r);
      }
      const groupMeta = new Map((rec.groups || []).map(g => [`${g.scope}|${g.month}`, g]));
      let dupSkipped = 0, noMapInserted = 0, wipedMonths = 0;
      const discovered = [];
      const done = new Set(rec.doneGroups || []);
      for (const [k, rows] of byGroup) {
        const [sc, ym] = k.split('|');
        const meta = groupMeta.get(k) || {};
        // A group that already committed must never be wiped again: its ords
        // carry receipts (found by the probe) or it is recorded as done. The
        // v8 receipts force the wipe off server-side too, but the client's
        // INTENT has to match — a resume must not ask for a destructive
        // operation it knows has already happened.
        const alreadyCommitted = done.has(k)
          || rows.some(r => committedRef.current.has(r._rid));
        const wipeEff  = !!meta.wipe && !alreadyCommitted;
        const dedupEff = meta.dedup !== false;
        beginPendingRecovery({ key: rec.key, ords: rows.map(r => r._rid), scope: sc, month: ym });
        let res;
        try {
          res = await importTransactionsBatch({
            scope: sc, month: ym, wipe: wipeEff, dedup: dedupEff,
            rows, importKey: rec.key,
          });
        } catch (e) { settlePendingRecovery(e); throw e; }
        clearPendingRecovery();
        noteOutcomes(res);
        if (wipeEff) wipedMonths++;
        for (const m of res.inserted) committedRef.current.set(m.ord, m.transaction_id);
        if (!res.inserted.length && res.insertedCount > 0) {
          const ambOrds = new Set(res.ambiguous.map(a => a.ord));
          for (const r of rows) if (!ambOrds.has(r._rid)) {
            committedRef.current.set(r._rid, null);
            unmappedRef.current.add(r._rid);
          }
          noMapInserted += res.insertedCount;
        }
        syncCommitted();
        dupSkipped += res.dupSkipped;
        for (const a of res.ambiguous) {
          discovered.push({ row: rowFromRecord(rec, a, { scope: sc }), incoming: a.incoming, existing: a.existing });
        }
        done.add(k);
        patchSessionSoft({ doneGroups: [...done] });
      }

      const stats = statsFromRecord(rec, { dupSkipped, noMapInserted, wipedMonths });
      setRecoveryReport(null);
      if (discovered.length) {
        pendingStatsRef.current = stats;
        setServerAmbiguous(discovered);
        setServerIncluded(new Set());
        setStep('resolve');
        return;
      }
      await finalizeImport(stats);
    } catch (err) {
      setError('ทำต่อไม่สำเร็จ: ' + (err.message || String(err)) +
        ' — กดทำต่อซ้ำได้เลย ระบบจะทำเฉพาะส่วนที่ยังไม่สำเร็จ (ไม่มีการเบิ้ล)');
    } finally { setImporting(false); }
  };

  /** When the session STARTED (immutable) — '(ไม่ทราบเวลา)' if unknown. */
  const sessionWhen = (rec) => {
    if (rec?.startedAt == null) return '(ไม่ทราบเวลา)';
    try {
      return new Date(rec.startedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    } catch { return '(ไม่ทราบเวลา)'; }
  };
  const describeGroups = (rec) => (rec?.groups || [])
    .map(g => `${g.scope === 'family' ? 'ครอบครัว' : 'ส่วนตัว'} ${g.month} (${g.ords.length} รายการ)`)
    .join(', ');

  /** Human-readable identity of the stored session, for the discard confirm. */
  const describeStoredSession = (rec) => {
    const when = sessionWhen(rec);
    const groups = describeGroups(rec);
    const known = [...committedRef.current.values()].filter(v => v != null).length;
    const knownTxt = committedRef.current.size || recoveryReport
      ? `ตรวจสอบแล้ว: บันทึกลงระบบไปแล้ว ${known} รายการ`
      : 'ยังไม่ได้ตรวจสอบ — ไม่ทราบว่ามีรายการใดถูกบันทึกไปแล้วหรือไม่';
    return 'ทิ้งการกู้คืนนี้?\n\n'
      + `นำเข้าเมื่อ: ${when}\n`
      + `กลุ่มที่ค้าง: ${groups}\n`
      + `${knownTxt}\n\n`
      + 'ถ้าทิ้ง ระบบจะไม่ตรวจสอบผลให้อีก และคุณต้องไปตรวจสอบรายการในหน้า Finance เอง';
  };

  /** Explicit, informed discard — the ONLY way to drop an unresolved record. */
  const discardStoredSession = () => {
    const rec = storedSessionRef.current;
    if (!rec) return;
    if (!confirm(describeStoredSession(rec))) return;
    committedRef.current = new Map();
    unmappedRef.current = new Set();
    syncCommitted();
    importKeyRef.current = null;
    clearPendingRecovery();
    dropStoredSession();
  };

  const handleImport = async () => {
    if (importing) return;                    // single-flight
    // M3: an unrecovered session must be resolved first — starting new work
    // here would overwrite the only record of its committed rows.
    if (storedSessionRef.current) return;
    const selectedRows = preview.filter((_, i) => selected.has(i));
    if (!selectedRows.length) return;

    setImporting(true); setError(null);
    try {
      shellsReadyRef.current = 0;
      if (!importKeyRef.current) {
        importKeyRef.current = (globalThis.crypto?.randomUUID?.()
          ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        // Written once, never refreshed — the receipts' own clock (case 5).
        sessionStartedAtRef.current = Date.now();
      }

      // Detect month range of selected rows (for dedup / wipe)
      const months = new Set();
      for (const r of selectedRows) {
        const ym = bangkokMonth(r.occurred_at);
        if (ym) months.add(ym);
      }
      const monthArr = [...months].sort();

      // Step 1: the PLAN — ambiguity decisions from the same selection-driven
      // classification the user is looking at; keys are the immutable _rid.
      const useAmbiguity = dedup && !wipeMonth && !!classification;
      const ambiguousRids = new Set(ambiguous.map(a => a.row._rid));
      let ambiguousSkipped = 0;
      let ambiguousImported = 0;
      const plan = [];
      for (const row of selectedRows) {
        if (useAmbiguity && ambiguousRids.has(row._rid)) {
          if (!includedAmbiguous.has(row._rid)) { ambiguousSkipped++; continue; }
          ambiguousImported++;
          plan.push({ ...row, _force: true });
        } else {
          plan.push({ ...row });
        }
      }

      // ── Round-9 M2 + round-11 case A: persist the COMPLETE session BEFORE
      //    the first SIDE EFFECT, not merely before the first RPC ──────────
      // Every group (not just the one in flight), every row payload needed to
      // finish the job, the pocket plan and the accepted debt suggestions. A
      // reload at ANY point from here on can reconstruct the whole import.
      // v4.23 proved storage with a 1-byte probe and then created account
      // shells before writing the real record — a namespaced write that failed
      // on size or quota therefore left shells behind. The pre-flight below IS
      // the real record; the only thing missing at that moment is the account
      // ids, which are patched in (still before any RPC) once the shells exist.
      const planGroups = new Map();   // 'scope|ym' → { scope, month, wipe, dedup, ords }
      const sessionRows = [];
      for (const r of plan) {
        const ym = bangkokMonth(r.occurred_at);
        if (!ym) continue;
        const k = `${r.scope}|${ym}`;
        // Round-10 case 3: the record carries the EXACT options each group is
        // sent with, so a resume repeats the run instead of re-deriving it.
        if (!planGroups.has(k)) planGroups.set(k, {
          scope: r.scope, month: ym,
          wipe: !!wipeMonth, dedup: !!(dedup && !wipeMonth), ords: [],
        });
        planGroups.get(k).ords.push(r._rid);
        sessionRows.push({
          _rid: r._rid, scope: r.scope, month: ym,
          occurred_at: r.occurred_at, title: r.title, amount: r.amount,
          category: r.category ?? null, type: r.type ?? null, note: r.note ?? null,
          account_id: null,
          _pocket: r._pocket ?? null, _cp_bal: r._cp_bal ?? null,
          _synthetic: !!r._synthetic, _force: !!r._force,
        });
      }
      const sessionDebtLinks = activeSuggestions.map(sug => ({
        debt_id: sug.debt.id, debtName: sug.debt.name,
        pay_month: `${sug.ym}-01`, amount: sug.amount, _rid: sug.txn._rid,
      }));
      const willCreateAccounts = !!(createAccts && makeFmt);
      const buildRecord = (pocketMap, { padIds = false } = {}) => ({
        v: SESSION_RECORD_V, key: importKeyRef.current,
        at: Date.now(),
        startedAt: sessionRecordRef.current?.startedAt
          ?? sessionStartedAtRef.current ?? Date.now(),
        groups: [...planGroups.values()],
        rows: (pocketMap.size || padIds)
          ? sessionRows.map(r => ({
              ...r,
              account_id: pocketMap.get(r._pocket)
                || (padIds && r._pocket ? ACCOUNT_ID_SIZE_PAD : null),
            }))
          : sessionRows,
        pockets: willCreateAccounts ? extractAccountsFromMapped(plan) : [],
        createAccts: willCreateAccounts, makeFmt: !!makeFmt,
        debtLinks: sessionDebtLinks,
        doneGroups: [], sideEffects: { accounts: false, debts: false },
      });
      // HARD pre-flight: the FULL-SIZE payload — account ids stood in at their
      // real width — before anything leaves the client or is created for it.
      persistSession(buildRecord(new Map(), { padIds: willCreateAccounts }));

      // Step 2 (round-6 B2): accounts — create linkable SHELLS only, and only
      // for pockets present in the executed plan (selection-respecting).
      // Balance/anchor mutations are deferred to finalizeImport, after every
      // transaction group has succeeded.
      let pocketIdMap = new Map();
      if (willCreateAccounts) {
        const planPockets = extractAccountsFromMapped(plan);
        if (planPockets.length) {
          pocketIdMap = await bulkUpsertAccountsByPocket(planPockets, { mode: 'ensure' });
          shellsReadyRef.current = pocketIdMap.size;
        }
        // Same discipline: the ids must be recorded before the RPC can use
        // them — and this write also replaces the size placeholders.
        persistSession(buildRecord(pocketIdMap));
      }

      // Retry safety: rows already committed in this session are never
      // re-sent (v6 receipts make even a lost response recoverable).
      const withMeta = plan
        .filter(r => !committedRef.current.has(r._rid))
        .map(({ _rowIdx, _pocket, _txtype, _cp_bal, ...r }) => ({
          ...r,
          account_id: pocketIdMap.get(_pocket) || null,
        }));

      let dupSkipped = 0;
      let noMapInserted = 0;        // v5/v3 responses: count only, no mapping
      const discovered = [];        // ambiguities found at execution time

      // Step 3 (preferred): atomic import per (scope, month) via the RPC.
      let usedRpc = false;
      try {
        const groups = new Map();   // 'scope|ym' → rows
        for (const r of withMeta) {
          const ym = bangkokMonth(r.occurred_at);
          if (!ym) continue;
          const key = `${r.scope}|${ym}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        }
        const doneGroups = new Set();
        for (const [key, rows] of groups) {
          const [sc, ym] = key.split('|');
          // B2: declare the write BEFORE it happens — if the answer never
          // arrives, this is what proves the group may already be committed.
          beginPendingRecovery({
            key: importKeyRef.current, ords: rows.map(r => r._rid), scope: sc, month: ym,
          });
          let res;
          try {
            res = await importTransactionsBatch({
              scope: sc, month: ym,
              wipe: wipeMonth, dedup: dedup && !wipeMonth,
              rows, importKey: importKeyRef.current,
            });
          } catch (e) { settlePendingRecovery(e); throw e; }
          clearPendingRecovery();   // authoritative answer received
          noteOutcomes(res);
          for (const m of res.inserted) {
            committedRef.current.set(m.ord, m.transaction_id);
          }
          syncCommitted();
          if (!res.inserted.length && res.insertedCount > 0) {
            // Pre-v6 deployment: no mapping — mark the group's non-ambiguous
            // rows committed (null id) so a retry cannot re-send them.
            const ambOrds = new Set(res.ambiguous.map(a => a.ord));
            for (const r of rows) if (!ambOrds.has(r._rid)) {
              committedRef.current.set(r._rid, null);
              unmappedRef.current.add(r._rid);   // inserted-but-unmapped ≠ deleted
            }
            syncCommitted();
            noMapInserted += res.insertedCount;
          }
          dupSkipped += res.dupSkipped;
          for (const a of res.ambiguous) {
            if (a.row) discovered.push({ row: a.row, incoming: a.incoming, existing: a.existing });
            else ambiguousSkipped++;   // v4 count-only: cannot round-trip
          }
          doneGroups.add(key);
          patchSessionSoft({ doneGroups: [...doneGroups] });
        }
        usedRpc = true;
      } catch (err) {
        if (!isRpcMissing(err)) throw err;
        // The RPC is not installed: the legacy path leaves NO receipts, so a
        // persisted record would promise a recovery that cannot happen.
        // keepImportKey: the legacy path below still stamps its in-memory
        // recovery marker with this session's key (round 11 — releasing
        // ownership must not silently blank the key mid-run).
        dropStoredSession({ keepImportKey: true });
      }

      let wipeExecuted = usedRpc && wipeMonth;
      if (!usedRpc) {
        // ── Legacy path (RPC not installed yet) ──────────────────────────
        if (wipeMonth) {
          alert(
            'โหมดแทนที่ทั้งเดือนต้องรันไฟล์ SQL migration_add_import_rpc.sql ก่อน — ' +
            'ครั้งนี้จะใช้โหมดเพิ่ม + ข้ามรายการซ้ำแทน (ไม่มีการลบข้อมูล)'
          );
        }
        const effDedup = dedup || wipeMonth;

        let toImport = withMeta;
        if (effDedup && monthArr.length) {
          const { startTs: first } = getMonthBounds(monthArr[0]);
          const { endTs: lastEnd }  = getMonthBounds(monthArr[monthArr.length - 1]);
          toImport = [];
          for (const sc of [...new Set(withMeta.map(r => r.scope))]) {
            const existing = await getExistingRowsForDedup({ startDate: first, endDate: lastEnd, scope: sc });
            const cls = classifyImportRows(withMeta.filter(r => r.scope === sc), existing);
            toImport.push(...cls.toImport);
            dupSkipped += cls.duplicates.length;
            for (const a of cls.ambiguous) discovered.push({ row: a.row, existing: a.existing });
          }
        }

        if (toImport.length) {
          const cleanRows = toImport.map(({ _rid, _synthetic, _force, ...r }) => r);
          // No receipts on this path (the RPC is not installed), so it is not
          // recoverable after a reload — but the in-memory gate still holds
          // until the outcome is known.
          beginPendingRecovery({ key: importKeyRef.current, ords: toImport.map(r => r._rid) });
          let rowsIns;
          try { rowsIns = (await bulkCreateTransactions(cleanRows)) || []; }
          catch (e) { settlePendingRecovery(e); throw e; }
          clearPendingRecovery();
          // The insert is a single atomic statement; RETURNING preserves row
          // order, giving the exact _rid → transaction_id mapping.
          rowsIns.forEach((tr, i) => committedRef.current.set(toImport[i]._rid, tr.id));
          syncCommitted();
        }
      }

      const stats = {
        dupSkipped, ambiguousSkipped, ambiguousImported, noMapInserted,
        usedRpc, wipeExecuted, monthArr, plan,
        accountsCreated: pocketIdMap.size,
        // Carried explicitly so finalisation works identically whether it runs
        // now or after a reload, where component state is gone (round-9 M2).
        createAccts: !!(createAccts && makeFmt),
        debtLinks: sessionDebtLinks,
      };

      if (discovered.length) {
        // Phase 2: decision step for execution-time ambiguities — the import
        // is NOT declared complete until the user has decided.
        pendingStatsRef.current = stats;
        setServerAmbiguous(discovered);
        setServerIncluded(new Set());
        setStep('resolve');
        return;
      }

      await finalizeImport(stats);
    } catch (err) {
      // Round-10 case 4: a storage refusal is thrown BEFORE any write, so the
      // plan is still intact and nothing reached the server. Say exactly that
      // instead of "กด Import ซ้ำได้เลย" — retrying without freeing space
      // would only hit the same wall.
      if (isSessionStorageError(err)) setError(recordAbortMessage(err));
      else setError('Import ไม่สำเร็จ: ' + (err.message || String(err)) +
        ' — กด Import ซ้ำได้เลย ระบบจะทำต่อเฉพาะส่วนที่ยังไม่สำเร็จ (ไม่มีการเบิ้ล)');
    } finally { setImporting(false); }
  };

  // Phase 2 confirm — idempotent: counters move only AFTER all calls
  // succeed, committed rows are never re-sent, and the v6 receipts absorb
  // response loss. Pressing Confirm again after a partial failure resumes
  // exactly where it stopped.
  const handleResolveAmbiguous = async () => {
    if (importing) return;                    // single-flight
    const S = pendingStatsRef.current;
    if (!S) return;
    setImporting(true); setError(null);
    try {
      const includedCount = serverAmbiguous.filter(a => serverIncluded.has(a.row._rid)).length;
      const approved = serverAmbiguous
        .filter(a => serverIncluded.has(a.row._rid))
        .map(a => ({ ...a.row, _force: true }))
        .filter(r => !committedRef.current.has(r._rid));   // retry: skip committed

      if (approved.length) {
        // ── Round-10 case 4 (force phase) ── Answering an ambiguity CHANGES
        // what this session means: these ords will be reopened and inserted.
        // Record that intent first — if storage refuses, nothing is sent.
        const cur = sessionRecordRef.current;
        // Round-11: on the RPC path the record MUST exist here — the import
        // wrote it before its first call. A missing one means ownership and
        // the record diverged, which is a bug, not a condition to skip past.
        if (!cur && S.usedRpc) {
          throw new SessionStorageError('no recovery record for the force phase', 'ownership');
        }
        if (cur) {
          const forced = new Set(approved.map(r => r._rid));
          const known  = new Set((cur.rows || []).map(r => r._rid));
          const rows = (cur.rows || [])
            .map(r => (forced.has(r._rid) ? { ...r, _force: true } : r));
          for (const a of approved) {
            if (known.has(a._rid)) continue;
            rows.push({
              _rid: a._rid, scope: a.scope, month: bangkokMonth(a.occurred_at),
              occurred_at: a.occurred_at, title: a.title, amount: a.amount,
              category: a.category ?? null, type: a.type ?? null, note: a.note ?? null,
              account_id: a.account_id ?? null, _force: true,
            });
          }
          patchSession({ rows });   // throws → abort before any write
        }
        if (S.usedRpc) {
          const groups = new Map();
          for (const r of approved) {
            const ym = bangkokMonth(r.occurred_at);
            if (!ym) continue;
            const key = `${r.scope}|${ym}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
          }
          for (const [key, rows] of groups) {
            const [sc, ym] = key.split('|');
            beginPendingRecovery({
              key: importKeyRef.current, ords: rows.map(r => r._rid), scope: sc, month: ym,
            });
            let res;
            try {
              res = await importTransactionsBatch({
                scope: sc, month: ym, wipe: false, dedup: true,
                rows, importKey: importKeyRef.current,
              });
            } catch (e) { settlePendingRecovery(e); throw e; }
            clearPendingRecovery();
            noteOutcomes(res);
            for (const m of res.inserted) committedRef.current.set(m.ord, m.transaction_id);
            if (!res.inserted.length && res.insertedCount > 0) {
              for (const r of rows) {
                committedRef.current.set(r._rid, null);
                unmappedRef.current.add(r._rid);   // inserted-but-unmapped ≠ deleted
              }
              S.noMapInserted = (S.noMapInserted || 0) + res.insertedCount;
            }
            syncCommitted();
          }
        } else {
          const cleanRows = approved.map(({ _rid, _synthetic, _force, ...r }) => r);
          beginPendingRecovery({ key: importKeyRef.current, ords: approved.map(r => r._rid) });
          let rowsIns;
          try { rowsIns = (await bulkCreateTransactions(cleanRows)) || []; }
          catch (e) { settlePendingRecovery(e); throw e; }
          clearPendingRecovery();
          rowsIns.forEach((tr, i) => committedRef.current.set(approved[i]._rid, tr.id));
          syncCommitted();
        }
      }

      // Everything committed — only NOW do the counters move.
      S.ambiguousImported += includedCount;
      S.ambiguousSkipped += serverAmbiguous.length - includedCount;

      setServerAmbiguous([]); setServerIncluded(new Set());
      pendingStatsRef.current = null;
      await finalizeImport(S);
    } catch (err) {
      if (isSessionStorageError(err)) setError(recordAbortMessage(err));
      else setError('Import ไม่สำเร็จ: ' + (err.message || String(err)) +
        ' — กดยืนยันซ้ำได้เลย ระบบจะทำต่อเฉพาะส่วนที่ยังไม่สำเร็จ (ไม่มีการเบิ้ล)');
    } finally { setImporting(false); }
  };

  // Stats
  const sel = preview.filter((_, i) => selected.has(i));
  const totalIncome  = sel.reduce((s, r) => r.amount > 0 ? s + r.amount : s, 0);
  const totalExpense = sel.reduce((s, r) => r.amount < 0 ? s + Math.abs(r.amount) : s, 0);
  const personalSel  = sel.filter(r => r.scope === 'personal').length;
  const familySel    = sel.filter(r => r.scope === 'family').length;
  const personalTot  = preview.filter(r => r.scope === 'personal').length;
  const familyTot    = preview.filter(r => r.scope === 'family').length;

  // Round-6 B4 + round-7 B4: the modal may not be dismissed while an import
  // is in flight, while the resolve step holds undecided ambiguities, or —
  // NEW — while committed rows still await finalisation after a partial
  // failure. Chosen flow (stated in the audit reply): pre-done states are
  // hard-disabled (the resume action is the Import/Confirm button right
  // there); on the DONE screen with pending side effects, exits route to an
  // explicit recovery confirm.
  //
  // Round-9 M3 note: a STORED session does not block closing. Closing destroys
  // nothing — the record lives in localStorage and the recovery banner comes
  // back on the next open. Only in-memory unfinished work locks the exits.
  const closeBlocked = importing || recovering || step === 'resolve'
    || (inMemoryUnfinished && step !== 'done');
  const tryClose = () => {
    if (importing || recovering || step === 'resolve') return;
    if (inMemoryUnfinished) {
      if (step === 'done'
          && confirm('มีงานปิดท้ายที่ยังไม่สำเร็จ (อัปเดตยอดบัญชี/ผูกงวดหนี้) — ปิดหน้าต่างโดยไม่ทำต่อหรือไม่?')) {
        onClose();
      }
      return;   // pre-done: blocked — กด Import/ยืนยัน เพื่อทำต่อให้จบ
    }
    onClose();
  };
  // Esc follows the same gate as every other exit.
  const tryCloseRef = useRef(tryClose);
  tryCloseRef.current = tryClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') tryCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={tryClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: 'none',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)', width: '90vw', maxWidth: 960, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '18px 26px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--ink)' }}>
              Import Statement — Make by KBank
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.12em' }}>
              แยก ส่วนตัว / ครอบครัว อัตโนมัติจากชื่อกระเป๋า
            </div>
          </div>
          <button onClick={tryClose} disabled={closeBlocked} aria-label="ปิด"
            title={closeBlocked ? 'ปิดไม่ได้ระหว่างกำลังบันทึก/มีรายการค้างตัดสินใจ' : 'ปิด'}
            style={{ background: 'none', border: 0, color: 'var(--ink-3)', fontSize: 22, padding: '4px 8px',
              cursor: closeBlocked ? 'not-allowed' : 'pointer', opacity: closeBlocked ? 0.35 : 1 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', padding: '9px 26px', borderBottom: '1px solid var(--line)', gap: 18, flexShrink: 0, alignItems: 'center' }}>
          {['upload', 'preview', 'done'].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 21, height: 21, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step === s ? 'var(--amber)' : ['upload','preview','done'].indexOf(step) > i ? 'var(--profit)' : 'var(--surface-2)',
                color: step === s || ['upload','preview','done'].indexOf(step) > i ? 'var(--text-inverse)' : 'var(--ink-3)',
                fontSize: 10, fontFamily: 'var(--f-mono)', fontWeight: 700,
              }}>{i + 1}</div>
              <span style={{ fontSize: 12, color: step === s ? 'var(--ink)' : 'var(--ink-3)' }}>
                {['เลือกไฟล์', 'ตรวจสอบ', 'เสร็จสิ้น'][i]}
              </span>
              {i < 2 && <span style={{ color: 'var(--line)', fontSize: 11 }}>›</span>}
            </div>
          ))}
          {fileName && (
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileName}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '22px 26px' }}>

          {/* ──────────────── UPLOAD ──────────────────────────────────────── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

              {/* Round-10 case 1: more than one pending record exists (other
                  tabs, or several interrupted sessions). None is adopted
                  automatically — the user says which one this tab should
                  finish. The list also refreshes when another tab writes or
                  completes a session (the `storage` listener above). */}
              {otherSessions.length > 0 && (
                <div style={{
                  width: 420, background: tint('--warning', 8),
                  border: `1px solid ${tint('--warning', 45)}`,
                  borderRadius: 'var(--radius-card)', padding: '14px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', fontWeight: 600, color: 'var(--warning)' }}>
                    มีการนำเข้าค้างที่ยังไม่ได้เลือกกู้คืน · {allSessions.length} ชุด — เลือกชุดที่จะกู้คืน
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {ownedKey
                      ? 'แท็บนี้กำลังถืองานนำเข้าอยู่ชุดหนึ่งแล้ว — ทำชุดนั้นให้จบ (หรือทิ้ง) ก่อนจึงจะเลือกชุดอื่นได้'
                      : 'อาจมาจากแท็บอื่นที่เปิดค้างไว้ — เลือกทีละชุด ระบบจะไม่แตะชุดที่ไม่ได้เลือก'}
                  </div>
                  {otherSessions.map(s => (
                    <div key={s.key} style={{
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-control)', padding: '8px 10px',
                    }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)' }}>
                        {describeGroups(s)}
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                          {sessionWhen(s)}
                        </div>
                      </div>
                      <button className="btn btn--ghost btn--sm"
                        disabled={!!ownedKey || importing || recovering}
                        onClick={() => adoptStoredSession(s.key)}>
                        เลือกกู้คืนชุดนี้
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Round-8 B2 + round-9 M1/M2/M3: a write from a previous page
                  load was never authoritatively answered. The probe reads the
                  truth for EVERY group; what it finds decides what is said —
                  a success screen is never shown on a guess. */}
              {storedSession && (
                <div style={{
                  width: 420,
                  background: tint(recoveryReport?.kind === 'none' ? '--loss' : '--warning', 10),
                  border: `1px solid var(${recoveryReport?.kind === 'none' ? '--loss' : '--warning'})`,
                  borderRadius: 'var(--radius-card)', padding: '14px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', fontWeight: 600,
                    color: `var(${recoveryReport?.kind === 'none' ? '--loss' : '--warning'})`,
                  }}>
                    {recoveryReport?.kind === 'none'     ? 'ยังไม่ได้นำเข้า — กรุณานำเข้าใหม่'
                     : recoveryReport?.kind === 'partial' ? 'นำเข้าไปแล้วบางส่วน — ยังไม่จบ'
                     : recoveryReport?.kind === 'degraded' ? 'ตรวจสอบได้ แต่ทำต่ออัตโนมัติไม่ได้'
                     : recoveryReport?.kind === 'stale'    ? 'การนำเข้าค้างนี้เก่าเกินกว่าจะตรวจสอบได้'
                     : recoveryReport?.kind === 'unknown-age' ? 'ไม่ทราบเวลาของการนำเข้าค้างนี้ — ยืนยันผลให้ไม่ได้'
                     : 'มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง'}
                  </div>

                  {!recoveryReport && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      ครั้งก่อนส่งข้อมูลไปแล้วแต่ไม่ได้รับคำตอบจากเซิร์ฟเวอร์
                      ({totalOrds(storedSession)} รายการ · {storedSession.groups.length} กลุ่ม ·
                      เดือน {storedSession.groups.map(g => g.month).join(', ')}) —
                      กดตรวจสอบเพื่ออ่านผลจริงจากเซิร์ฟเวอร์
                      (เป็นการอ่านอย่างเดียว ไม่มีการบันทึกซ้ำ)
                    </div>
                  )}

                  {/* M1 — ZERO outcomes: nothing committed. Say exactly that. */}
                  {recoveryReport?.kind === 'none' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      ตรวจสอบกับเซิร์ฟเวอร์แล้ว — ไม่พบรายการใดถูกบันทึกเลยจากการนำเข้าครั้งนั้น
                      ({recoveryReport.total} รายการ) แปลว่า<strong>ยังไม่ได้นำเข้า</strong>
                      {' '}กรุณานำเข้าไฟล์ใหม่อีกครั้ง
                    </div>
                  )}

                  {/* M1 — PARTIAL: still pending, resume finishes it. */}
                  {recoveryReport?.kind === 'partial' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      บันทึกไปแล้ว {recoveryReport.resolved} จาก {recoveryReport.total} รายการ
                      (ลงระบบจริง {recoveryReport.inserted} · ซ้ำ/ข้าม {recoveryReport.dup}
                      {recoveryReport.ambiguous > 0 ? ` · กำกวม ${recoveryReport.ambiguous}` : ''}) —
                      ยัง<strong>ไม่จบ</strong> กด "ทำต่อให้จบ" เพื่อส่งเฉพาะส่วนที่เหลือ (ไม่มีการเบิ้ล)
                    </div>
                  )}

                  {recoveryReport?.kind === 'degraded' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      บันทึกไปแล้ว {recoveryReport.resolved} จาก {recoveryReport.total} รายการ
                      (ลงระบบจริง {recoveryReport.inserted}) — แต่ไม่ได้เก็บรายละเอียดของแถวไว้
                      จึงทำต่อให้อัตโนมัติไม่ได้ กรุณาตรวจสอบยอดบัญชี/งวดหนี้ในหน้า Finance เอง
                    </div>
                  )}

                  {recoveryReport?.kind === 'stale' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      ข้อมูลใบเสร็จการนำเข้าเก็บไว้ 90 วัน — รายการค้างนี้เริ่มไว้นานเกินกว่านั้น
                      ระบบจึงยืนยันผลให้ไม่ได้ กรุณาตรวจสอบรายการในหน้า Finance เอง
                    </div>
                  )}

                  {/* Round-10 case 5: no immutable start stamp ⇒ we cannot
                      tell "never committed" from "the receipts were purged". */}
                  {recoveryReport?.kind === 'unknown-age' && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      ตรวจสอบกับเซิร์ฟเวอร์แล้วไม่พบใบเสร็จการนำเข้า — แต่รายการค้างนี้
                      ไม่ได้บันทึกเวลาที่เริ่มไว้ จึงแยกไม่ออกว่า "ยังไม่ได้นำเข้า" หรือ
                      "ใบเสร็จหมดอายุ 90 วันไปแล้ว" กรุณาตรวจสอบรายการในหน้า Finance เอง
                      ก่อนนำเข้าใหม่
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!recoveryReport && (
                      <button className="btn btn--primary" onClick={recoverStoredSession} disabled={recovering}>
                        {recovering ? 'กำลังตรวจสอบ...' : '↻ ตรวจสอบผลอีกครั้ง'}
                      </button>
                    )}
                    {recoveryReport?.kind === 'partial' && (
                      <button className="btn btn--primary" onClick={resumeStoredSession} disabled={importing || recovering}>
                        {importing ? 'กำลังทำต่อ...' : '▸ ทำต่อให้จบ'}
                      </button>
                    )}
                    <button className="btn btn--ghost" disabled={recovering || importing}
                      onClick={discardStoredSession}>
                      {recoveryReport?.kind === 'none' ? 'เข้าใจแล้ว — ล้างและเริ่มใหม่' : 'ทิ้งการกู้คืนนี้'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab */}
              <div style={{ display: 'flex', gap: 3, background: 'var(--bg-2)', padding: 3, borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
                {[{ id: 'csv', label: '📋 CSV (Cloud Pocket)' }, { id: 'pdf', label: '📄 PDF Statement' }].map(t => (
                  <button key={t.id} onClick={() => { setTab(t.id); setError(null); }} style={{
                    padding: '7px 18px', borderRadius: 'var(--r-sm)', border: 0,
                    background: tab === t.id ? 'var(--surface)' : 'transparent',
                    color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
                    fontFamily: 'var(--f-body)', fontSize: 13, cursor: 'pointer',
                    boxShadow: tab === t.id ? 'var(--shadow-card)' : 'none',
                    transition: 'all 130ms',
                  }}>{t.label}</button>
                ))}
              </div>

              {/* CSV tab */}
              {tab === 'csv' && (
                <>
                  <div
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--amber)'; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                    onDrop={e => {
                      e.preventDefault(); e.currentTarget.style.borderColor = 'var(--line)';
                      handleCSVFile(e.dataTransfer.files[0]);
                    }}
                    style={{
                      width: 420, padding: '32px 24px', border: '2px dashed var(--line)', borderRadius: 'var(--r-lg)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                      cursor: 'pointer', transition: 'border-color 150ms', background: 'var(--surface-2)',
                    }}>
                    <div style={{ fontSize: 40 }}>📋</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.6 }}>
                      คลิกเพื่อเลือก หรือลาก CSV มาวาง<br/>
                      <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>report_xxx-x-x147-8_…csv</span>
                    </div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>.csv · UTF-8</div>
                  </div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" onChange={e => handleCSVFile(e.target.files[0])} style={{ display: 'none' }} />

                  {/* Legend */}
                  <div style={{ width: 420, background: tint('--blue', 8), border: `1px solid ${tint('--blue', 30)}`, borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--blue)', marginBottom: 10, letterSpacing: '0.12em' }}>
                      การแยก ส่วนตัว / ครอบครัว อัตโนมัติ
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { color: 'var(--violet)', label: 'กองทุนครอบครัว', scope: 'ครอบครัว' },
                        { color: 'var(--violet)', label: 'เงินเพื่อน้องอคิน', scope: 'ครอบครัว' },
                        { color: 'var(--blue)', label: 'กระเป๋าอื่น ๆ ทั้งหมด', scope: 'ส่วนตัว' },
                      ].map(({ color, label, scope }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{label}</span>
                          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color }}>{scope}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-3)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                        แถว Move Money (แอบออมอัตโนมัติ) จะถูกกรองออกอัตโนมัติ
                      </div>
                    </div>
                  </div>

                  <div style={{ width: 420, background: tint('--success', 8), border: `1px solid ${tint('--success', 30)}`, borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--profit)', marginBottom: 8, letterSpacing: '0.12em' }}>วิธี Export CSV จาก Make</div>
                    <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: 'var(--ink-3)', lineHeight: 2 }}>
                      <li>เปิด <strong style={{ color: 'var(--ink-2)' }}>Make by KBank</strong> → กด <strong style={{ color: 'var(--ink-2)' }}>บัญชีหลัก</strong></li>
                      <li>เลือก <strong style={{ color: 'var(--ink-2)' }}>Statement → ช่วงเวลา</strong></li>
                      <li>กด <strong style={{ color: 'var(--amber)' }}>Download → CSV</strong></li>
                      <li>ลากไฟล์ <code style={{ color: 'var(--amber)', fontSize: 10 }}>report_xxx-x-x147-8_…csv</code> มาวางที่นี่</li>
                    </ol>
                  </div>
                </>
              )}

              {/* PDF tab */}
              {tab === 'pdf' && (
                <>
                  <div
                    onClick={() => pdfFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--amber)'; }}
                    onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                    onDrop={e => {
                      e.preventDefault(); e.currentTarget.style.borderColor = 'var(--line)';
                      const f = e.dataTransfer.files[0];
                      if (f?.name?.endsWith('.pdf')) { setPdfFile(f); setFileName(f.name); }
                    }}
                    style={{
                      width: 420, padding: '32px 24px', border: '2px dashed var(--line)', borderRadius: 'var(--r-lg)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                      cursor: 'pointer', transition: 'border-color 150ms', background: 'var(--surface-2)',
                    }}>
                    <div style={{ fontSize: 40 }}>{pdfFile ? '📄' : '📥'}</div>
                    {pdfFile ? (
                      <><div style={{ fontSize: 13, color: 'var(--profit)' }}>{pdfFile.name}</div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{(pdfFile.size/1024).toFixed(0)} KB · คลิกเปลี่ยนไฟล์</div></>
                    ) : (
                      <><div style={{ fontSize: 13, color: 'var(--ink-2)' }}>คลิกเพื่อเลือก หรือลาก PDF มาวาง</div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>.pdf · รองรับไฟล์ที่มีรหัสผ่าน</div></>
                    )}
                  </div>
                  <input ref={pdfFileRef} type="file" accept=".pdf" onChange={e => { const f = e.target.files[0]; if (f) { setPdfFile(f); setFileName(f.name); setError(null); } }} style={{ display: 'none' }} />

                  <div style={{ width: 420 }}>
                    <label style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)', display: 'block', marginBottom: 6, letterSpacing: '0.1em' }}>รหัสผ่าน PDF (ถ้ามี)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type={showPwd ? 'text' : 'password'} className="input" value={pdfPassword}
                        onChange={e => setPdfPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && pdfFile && handlePDFParse()}
                        placeholder="เช่น วันเดือนปีเกิด 8 หลัก"
                        style={{ flex: 1, fontFamily: 'var(--f-mono)', fontSize: 13 }} />
                      <button onClick={() => setShowPwd(p => !p)}
                        style={{ background: 'var(--fill)', border: '1px solid transparent', borderRadius: 'var(--radius-field)', padding: '8px 12px', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14 }}>
                        {showPwd ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>
                  <button className="btn btn--primary" disabled={!pdfFile || pdfParsing} onClick={handlePDFParse}
                    style={{ width: 420, justifyContent: 'center' }}>
                    {pdfParsing ? '⏳ กำลังอ่าน PDF...' : '📊 วิเคราะห์ Statement'}
                  </button>
                </>
              )}

              {error && (
                <div style={{ width: 420, padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid var(--loss)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* ──────────────── PREVIEW ─────────────────────────────────────── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Scope quick-filter bar */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Personal chip */}
                <button onClick={() => toggleScope('personal')} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '7px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${tint('--blue', 35)}`,
                  background: tint('--blue', 12), color: 'var(--blue)', cursor: 'pointer', fontSize: 12,
                  fontFamily: 'var(--f-body)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />
                  ส่วนตัว
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, opacity: 0.8 }}>
                    {personalSel}/{personalTot}
                  </span>
                </button>

                {/* Family chip */}
                {familyTot > 0 && (
                  <button onClick={() => toggleScope('family')} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 14px', borderRadius: 'var(--r-md)', border: `1px solid ${tint('--violet', 35)}`,
                    background: tint('--violet', 12), color: 'var(--violet)', cursor: 'pointer', fontSize: 12,
                    fontFamily: 'var(--f-body)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--violet)', display: 'inline-block' }} />
                    ครอบครัว
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, opacity: 0.8 }}>
                      {familySel}/{familyTot}
                    </span>
                  </button>
                )}

                {/* Income / Expense totals */}
                <div style={{ padding: '7px 12px', background: 'var(--profit-bg)', border: '1px solid var(--profit)', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--profit)' }}>
                  +฿{totalIncome.toLocaleString('th', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ padding: '7px 12px', background: 'var(--loss-bg)', border: '1px solid var(--loss)', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--loss)' }}>
                  -฿{totalExpense.toLocaleString('th', { maximumFractionDigits: 0 })}
                </div>

                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                  เลือก {sel.length}/{preview.length}
                </div>
                <button onClick={toggleAll} className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }}>
                  {selected.size === preview.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>

              {/* Column mapping — generic CSV only */}
              {!makeFmt && headers.length > 0 && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '12px 16px' }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.16em', marginBottom: 10 }}>MAP COLUMNS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { key: 'dateCol', label: 'วันที่' }, { key: 'descCol', label: 'รายการ' },
                      { key: 'amountCol', label: 'จำนวน (รวม)' }, { key: 'debitCol', label: 'ถอน' },
                      { key: 'creditCol', label: 'ฝาก' }, { key: 'balanceCol', label: 'ยอดคงเหลือ' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>{label}</span>
                        <select value={colMap[key] || ''} onChange={e => handleColChange(key, e.target.value || null)}
                          style={{ background: 'var(--fill)', border: '1px solid transparent', borderRadius: 'var(--radius-field)', padding: '4px 6px', fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--f-mono)' }}>
                          <option value="">(ไม่ใช้)</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Make format info */}
              {makeFmt && (
                <div style={{
                  background: 'var(--paper)', border: '1px solid var(--paper-2)',
                  borderRadius: 'var(--r-md)', padding: '10px 16px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--paper-ink)' }}>
                    ตรวจพบ Make Cloud Pocket CSV · แยก scope จากชื่อกระเป๋าอัตโนมัติ
                  </div>
                </div>
              )}

              {/* Accounts to create/update — Make format only */}
              {makeFmt && pocketSummary.length > 0 && (
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--line)',
                  borderRadius: 'var(--r-lg)', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'baseline' }}>
                    <div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.16em' }}>
                        💼 บัญชี / Cloud Pockets · {pocketSummary.length}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3 }}>
                        จะถูกสร้าง/อัพเดต balance จาก CP Bal ล่าสุด
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={createAccts} onChange={e => setCreateAccts(e.target.checked)}
                        style={{ accentColor: 'var(--amber)', cursor: 'pointer' }} />
                      สร้าง/อัพเดตบัญชี
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                    {pocketSummary.map(p => (
                      <div key={p.pocket} style={{
                        background: POCKET_TONE_BG.amber, border: '1px solid var(--line)',
                        borderRadius: 'var(--r-sm)', padding: '8px 10px',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.pocket}
                          </span>
                          <span style={{
                            fontFamily: 'var(--f-mono)', fontSize: 9, padding: '1px 6px', borderRadius: 99,
                            background: SCOPE_BADGE[p.scope].bg, color: SCOPE_BADGE[p.scope].color,
                            border: `1px solid ${SCOPE_BADGE[p.scope].border}`, flexShrink: 0,
                          }}>{SCOPE_BADGE[p.scope].label}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                          <span>{p.txCount} ครั้ง</span>
                          <span style={{ color: 'var(--ink)' }}>
                            ฿{(p.latestBalance != null ? p.latestBalance : 0).toLocaleString('th', { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-link disabled — history (or cross-scope debts) unreadable */}
              {autoLinkBlocked && (
                <div style={{
                  background: tint('--warning', 8), border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius-card)', padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.16em', fontWeight: 600 }}>
                      ⚠️ AUTO-LINK ปิดอยู่
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 3 }}>
                      {autoLinkBlockedMsg}
                    </div>
                  </div>
                  <button className="btn btn--ghost btn--sm" onClick={() => setLinkRetry(n => n + 1)}>
                    ↻ ลองใหม่
                  </button>
                </div>
              )}

              {/* Debt payment auto-link suggestions */}
              {debtSuggestions.length > 0 && (
                <div style={{
                  background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius-card)', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent-strong)', letterSpacing: '0.16em', fontWeight: 600 }}>
                        🔗 AUTO-LINK · {activeSuggestions.length} / {debtSuggestions.length} รายการ
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 3 }}>
                        ระบบเจอ transactions ที่น่าจะเป็นการจ่ายหนี้สิน — จะ link อัตโนมัติให้
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {debtSuggestions.map(sug => {
                      const key = `${sug.txn._rid}|${sug.debt.id}|${sug.ym}`;
                      const isSkipped = skippedSuggestions.has(key);
                      const isStrong  = sug.confidence >= 80;
                      return (
                        <label key={key} style={{
                          display: 'grid', gridTemplateColumns: '20px 1fr auto 60px', gap: 10,
                          padding: '8px 10px',
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-control)',
                          alignItems: 'center', fontSize: 12, cursor: 'pointer',
                          opacity: isSkipped ? 0.4 : 1,
                        }}>
                          <input type="checkbox" checked={!isSkipped}
                            onChange={() => setSkippedSuggestions(prev => {
                              const n = new Set(prev);
                              isSkipped ? n.delete(key) : n.add(key);
                              return n;
                            })}
                            style={{ accentColor: 'var(--accent)' }} />
                          <div style={{ overflow: 'hidden' }}>
                            <span style={{ color: 'var(--text-primary)' }}>{sug.txn.title}</span>
                            <span style={{ marginLeft: 8, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                              → {sug.debt.name}
                            </span>
                          </div>
                          <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            ฿{sug.amount.toLocaleString('th', { maximumFractionDigits: 0 })}
                          </span>
                          <span style={{
                            fontFamily: 'var(--f-mono)', fontSize: 10, textAlign: 'right',
                            color: isStrong ? 'var(--success)' : 'var(--warning)',
                          }}>
                            {isStrong ? 'แม่นยำ' : 'น่าจะใช่'} {sug.confidence}%
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ambiguous rows — user decides, never the machine */}
              {ambiguous.length > 0 && dedup && !wipeMonth && (
                <div style={{
                  background: tint('--warning', 8), border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius-card)', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.16em', fontWeight: 600 }}>
                      ⚠️ อาจซ้ำกับรายการเดิม — เลือกเอง · {ambiguous.length} รายการ
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn--ghost btn--sm"
                        onClick={() => setIncludedAmbiguous(new Set())}>
                        ข้ามทั้งหมด
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm"
                        onClick={() => setIncludedAmbiguous(new Set(ambiguous.map(a => a.row._rid)))}>
                        นำเข้าทั้งหมด
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.55 }}>
                    รายการจากไฟล์นี้ตรงกับรายการเดิมผ่านเวลาที่ระบบสร้างขึ้นเอง (ไฟล์ไม่มีวินาทีจริง) —
                    อาจเป็นรายการเดียวกันที่ export ซ้ำ หรือรายการใหม่ที่หน้าตาเหมือนกันก็ได้
                    ระบบไม่เดาให้: ค่าเริ่มต้นคือ<strong>ข้าม</strong> ติ๊กเฉพาะอันที่มั่นใจว่าเป็นรายการใหม่
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {ambiguous.map(({ row, existing }) => {
                      const included = includedAmbiguous.has(row._rid);
                      return (
                        <label key={row._rid} style={{
                          display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10,
                          padding: '8px 10px', background: 'var(--surface)',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
                          alignItems: 'start', fontSize: 12, cursor: 'pointer',
                        }}>
                          <input type="checkbox" checked={included}
                            onChange={() => setIncludedAmbiguous(prev => {
                              const n = new Set(prev);
                              included ? n.delete(row._rid) : n.add(row._rid);
                              return n;
                            })}
                            style={{ accentColor: 'var(--warning)', marginTop: 2 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--warning)', letterSpacing: '0.1em' }}>ในไฟล์</span>
                              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</span>
                              <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
                                {bangkokDate(row.occurred_at)} · ฿{Math.abs(row.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2, opacity: 0.75 }}>
                              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>ในระบบ</span>
                              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{existing.title}</span>
                              <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-muted)' }}>
                                {bangkokDate(existing.occurred_at)} · ฿{Math.abs(existing.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, marginTop: 3, color: included ? 'var(--profit)' : 'var(--ink-3)' }}>
                              {included ? '✓ จะนำเข้าเป็นรายการใหม่' : '— ข้าม (ค่าเริ่มต้น)'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Import options */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 'var(--r-lg)', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.16em', marginBottom: 2 }}>
                  ⚙ ตัวเลือก IMPORT
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={dedup} onChange={e => setDedup(e.target.checked)}
                    style={{ accentColor: 'var(--amber)', cursor: 'pointer', marginTop: 2 }} disabled={wipeMonth} />
                  <span>
                    <strong style={{ color: 'var(--ink)' }}>ข้ามรายการซ้ำ</strong>
                    <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>
                      — เช็คจาก (วันที่+เวลา+ยอด+ชื่อ) กับฐานข้อมูลเดิม
                    </span>
                  </span>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={wipeMonth} onChange={e => setWipeMonth(e.target.checked)}
                    style={{ accentColor: 'var(--loss)', cursor: 'pointer', marginTop: 2 }} />
                  <span>
                    <strong style={{ color: 'var(--loss)' }}>⚠️ ลบรายการเดิมในเดือนนั้นก่อน import</strong>
                    <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>
                      — ใช้เมื่อต้องการ re-import แบบสะอาด (ลบของเก่าหมดในเดือนที่เกี่ยวข้อง)
                    </span>
                  </span>
                </label>
              </div>

              {/* Table */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: makeFmt ? '28px 80px 1fr 120px 90px 70px 70px' : '28px 80px 1fr 100px 90px 70px',
                  gap: 10, padding: '7px 12px', background: 'var(--bg-2)',
                  fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)',
                }}>
                  <div>✓</div><div>วันที่</div><div>รายการ</div>
                  {makeFmt && <div>กระเป๋า</div>}
                  <div style={{ textAlign: 'right' }}>จำนวน</div>
                  <div>ประเภท</div><div>Scope</div>
                </div>

                <div style={{ maxHeight: 380, overflow: 'auto' }}>
                  {preview.map((row, i) => {
                    const isIn  = row.amount > 0;
                    const chk   = selected.has(i);
                    const badge = SCOPE_BADGE[row.scope] || SCOPE_BADGE.personal;
                    return (
                      <div key={i} onClick={() => toggleRow(i)} style={{
                        display: 'grid',
                        gridTemplateColumns: makeFmt ? '28px 80px 1fr 120px 90px 70px 70px' : '28px 80px 1fr 100px 90px 70px',
                        gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--line)',
                        alignItems: 'center', fontSize: 12, cursor: 'pointer',
                        background: chk ? 'transparent' : 'var(--fill)',
                        opacity: chk ? 1 : 0.4,
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                          background: chk ? 'var(--amber)' : 'var(--surface-2)',
                          border: `1.5px solid ${chk ? 'var(--amber)' : 'var(--line)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
                        }}>{chk ? '✓' : ''}</div>

                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>
                          {bangkokDate(row.occurred_at)}
                        </div>

                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                          {row.title}
                        </div>

                        {makeFmt && (
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row._pocket}
                          </div>
                        )}

                        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12, color: isIn ? 'var(--profit)' : 'var(--loss)', fontWeight: 600 }}>
                          {isIn ? '+' : ''}฿{Math.abs(row.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
                        </div>

                        <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                          {TYPE_ICONS[row.type]} {TYPE_LABELS[row.type]}
                        </div>

                        <div style={{
                          padding: '2px 7px', borderRadius: 99, fontSize: 9.5,
                          background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color,
                          fontFamily: 'var(--f-mono)', whiteSpace: 'nowrap', textAlign: 'center',
                        }}>
                          {badge.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid var(--loss)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* ──────────────── DONE ────────────────────────────────────────── */}
          {/* ──────────────── RESOLVE (phase 2 — execution-time ambiguities) ── */}
          {step === 'resolve' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: tint('--warning', 8), border: '1px solid var(--warning)',
                borderRadius: 'var(--radius-card)', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.16em', fontWeight: 600 }}>
                    ⚠️ พบรายการกำกวมตอนบันทึกจริง · {serverAmbiguous.length} รายการ — ต้องตัดสินใจก่อนปิดงาน
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn--ghost btn--sm"
                      onClick={() => setServerIncluded(new Set())}>
                      ข้ามทั้งหมด
                    </button>
                    <button type="button" className="btn btn--ghost btn--sm"
                      onClick={() => setServerIncluded(new Set(serverAmbiguous.map(a => a.row._rid)))}>
                      นำเข้าทั้งหมด
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.55 }}>
                  ระหว่างบันทึก เซิร์ฟเวอร์เจอรายการที่อาจซ้ำเพิ่มเติมจากที่โชว์ไว้ตอน preview
                  (ข้อมูลในระบบเปลี่ยนระหว่างทาง) — เหมือนเดิม: ระบบไม่เดาให้ ค่าเริ่มต้นคือข้าม
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {serverAmbiguous.map(({ row, incoming, existing }) => {
                    const inc = incoming || row;
                    const included = serverIncluded.has(row._rid);
                    return (
                      <label key={row._rid} style={{
                        display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10,
                        padding: '8px 10px', background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
                        alignItems: 'start', fontSize: 12, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={included}
                          onChange={() => setServerIncluded(prev => {
                            const n = new Set(prev);
                            included ? n.delete(row._rid) : n.add(row._rid);
                            return n;
                          })}
                          style={{ accentColor: 'var(--warning)', marginTop: 2 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--warning)', letterSpacing: '0.1em' }}>ในไฟล์</span>
                            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inc.title}</span>
                            <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }}>
                              {bangkokDate(inc.occurred_at)} · ฿{Math.abs(Number(inc.amount)).toLocaleString('th', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                          {existing && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2, opacity: 0.75 }}>
                              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>ในระบบ</span>
                              <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{existing.title}</span>
                              <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--text-muted)' }}>
                                {bangkokDate(existing.occurred_at)} · ฿{Math.abs(Number(existing.amount)).toLocaleString('th', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          )}
                          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, marginTop: 3, color: included ? 'var(--profit)' : 'var(--ink-3)' }}>
                            {included ? '✓ จะนำเข้าเป็นรายการใหม่' : '— ข้าม (ค่าเริ่มต้น)'}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              {error && (
                <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid var(--loss)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '40px 0' }}>
              <div style={{ fontSize: 52 }}>{pendingSideEffects ? '🟡' : '✅'}</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--ink)', marginBottom: 14 }}>
                  {pendingSideEffects ? 'นำเข้ารายการสำเร็จ — เหลืองานปิดท้าย' : 'Import สำเร็จ!'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, maxWidth: 480 }}>
                  {importStats?.inserted > 0 && (
                    <StatChip label="รายการใหม่"  value={importStats.inserted} accent="var(--profit)" />
                  )}
                  {importStats?.skipped > 0 && (
                    <StatChip label="ข้าม (ซ้ำ)"  value={importStats.skipped} accent="var(--ink-3)" />
                  )}
                  {importStats?.ambiguousSkipped > 0 && (
                    <StatChip label="⚠️ กำกวม — ข้ามไว้" value={importStats.ambiguousSkipped} accent="var(--warning)" />
                  )}
                  {importStats?.ambiguousImported > 0 && (
                    <StatChip label="กำกวม — เลือกนำเข้า" value={importStats.ambiguousImported} accent="var(--profit)" />
                  )}
                  {importStats?.accountsCreated > 0 && (
                    <StatChip label="บัญชี" value={importStats.accountsCreated} accent="var(--amber)" />
                  )}
                  {importStats?.debtLinked > 0 && (
                    <StatChip label="🔗 จ่ายหนี้ที่ link" value={importStats.debtLinked} accent="var(--accent)" />
                  )}
                  {importStats?.wipedMonths > 0 && (
                    <StatChip label="เดือนที่ล้าง" value={importStats.wipedMonths} accent="var(--loss)" />
                  )}
                  {/* Round-9 F1: rows whose transaction was deleted after the
                      import — excluded from balances and debt links. */}
                  {importStats?.skippedDeleted > 0 && (
                    <StatChip label="ข้ามเพราะรายการถูกลบ" value={importStats.skippedDeleted} accent="var(--ink-3)" />
                  )}
                </div>
                {importStats?.skippedDeleted > 0 && (
                  <div style={{ marginTop: 14, color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.55, maxWidth: 480 }}>
                    มี {importStats.skippedDeleted} รายการที่นำเข้าไปแล้วแต่ถูกลบทีหลัง —
                    ไม่ได้นำไปอัปเดตยอดบัญชีและไม่ได้ผูกงวดหนี้
                  </div>
                )}
                {importStats?.inserted === 0 && importStats?.skipped > 0 && (
                  <div style={{ marginTop: 14, color: 'var(--ink-3)', fontSize: 12, fontFamily: 'var(--f-mono)' }}>
                    ทุกรายการเป็นรายการที่มีอยู่แล้ว — ไม่ได้เพิ่มอะไรใหม่
                  </div>
                )}
              </div>

              {/* Round-7 B2/B3: finalisation failures are shown HERE, never
                  swallowed — retry re-runs only the failed pass(es), both of
                  which are idempotent. */}
              {pendingSideEffects && (
                <div style={{
                  width: 480, maxWidth: '100%',
                  background: tint('--warning', 10), border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius-card)', padding: '14px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left',
                }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.16em', fontWeight: 600 }}>
                    ⚠️ นำเข้ารายการสำเร็จ แต่ยังมีงานปิดท้ายไม่สำเร็จ
                  </div>
                  {pendingSideEffects.accounts && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                      · ยังอัปเดตยอดบัญชีไม่สำเร็จ {pendingSideEffects.accounts.count} บัญชี
                      <span style={{ color: 'var(--text-muted)' }}> — {pendingSideEffects.accounts.message}</span>
                    </div>
                  )}
                  {pendingSideEffects.debtFails?.length > 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                      · ผูกงวดหนี้ไม่สำเร็จ {pendingSideEffects.debtFails.length} รายการ
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}({pendingSideEffects.debtFails.map(f => f.debtName).join(', ')})
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    ลองใหม่ได้ปลอดภัย — ทั้งสองงานทำซ้ำแล้วไม่เบิ้ล (ยอดบัญชีเป็นการตั้งค่า, งวดหนี้กันซ้ำด้วย unique key)
                  </div>
                  <button className="btn btn--primary" onClick={retrySideEffects} disabled={importing}
                    style={{ alignSelf: 'flex-start' }}>
                    {importing ? 'กำลังลองใหม่...' : '↻ ลองอีกครั้ง'}
                  </button>
                </div>
              )}

              <button className="btn btn--primary" onClick={tryClose}
                style={pendingSideEffects ? { opacity: 0.7 } : undefined}>
                ปิดและดูรายการ
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div style={{ padding: '14px 26px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
            <button className="btn btn--ghost" onClick={resetUpload}
              disabled={importing || hasUnfinishedCommittedWork}
              title={(importing || hasUnfinishedCommittedWork)
                ? 'กลับไม่ได้ — มีรายการที่บันทึกแล้วแต่ยังปิดงานไม่ครบ กด Import เพื่อทำต่อให้จบ'
                : 'กลับไปเลือกไฟล์'}
              style={(importing || hasUnfinishedCommittedWork) ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>← กลับ</button>
            <button className="btn btn--primary" disabled={importing || sel.length === 0} onClick={handleImport}
              style={{ minWidth: 200, justifyContent: 'center' }}>
              {importing
                ? 'กำลัง Import...'
                : `💾 Import ${sel.length} รายการ${familySel > 0 ? ` (${familySel} ครอบครัว)` : ''}`}
            </button>
          </div>
        )}
        {step === 'resolve' && (
          <div style={{ padding: '14px 26px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
            <button className="btn btn--primary" disabled={importing} onClick={handleResolveAmbiguous}
              style={{ minWidth: 240, justifyContent: 'center' }}>
              {importing
                ? 'กำลังบันทึก...'
                : `✓ ยืนยัน — นำเข้า ${serverIncluded.size} · ข้าม ${serverAmbiguous.length - serverIncluded.size}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, accent }) {
  return (
    <div style={{
      padding: '10px 14px', background: 'var(--surface-2)',
      border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
      display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
    }}>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: accent }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
        {label}
      </div>
    </div>
  );
}
