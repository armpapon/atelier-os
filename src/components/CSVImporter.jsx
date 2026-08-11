import { useState, useRef, useMemo, useEffect } from 'react';
import {
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  bulkCreateTransactions, isMakeFormat,
  extractAccountsFromMapped, bulkUpsertAccountsByPocket,
  classifyImportRows, getExistingRowsForDedup, assignRowIds,
  suggestDebtPaymentLinks, recordDebtPayment, listDebtPayments,
  getMonthBounds, bangkokMonth, bangkokDate,
  importTransactionsBatch, isRpcMissing, isDefinitiveServerError,
} from '../lib/api/finance.js';
import { parseKBankPDF } from '../lib/kbankPdfParser.js';

// ── Round-8 B2: the outcome-unknown session, survivable across reloads ──────
// A post-commit response loss leaves rows (and receipts) on the server that
// this tab never heard about. The import key + the ords that were in flight
// are the ONLY things needed to ask the server what really happened, so they
// live outside React state as well: a reload must not be able to orphan a
// committed import.
const SESSION_LS_KEY = 'loop:import-session';

function readStoredImportSession() {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.key || !Array.isArray(s.ords) || !s.ords.length) return null;
    if (!s.scope || !s.month) return null;
    return s;
  } catch { return null; }
}
function writeStoredImportSession(s) {
  try { globalThis.localStorage?.setItem(SESSION_LS_KEY, JSON.stringify(s)); } catch { /* storage disabled */ }
}
function clearStoredImportSession() {
  try { globalThis.localStorage?.removeItem(SESSION_LS_KEY); } catch { /* storage disabled */ }
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

  // ── CSV ────────────────────────────────────────────────────────────────────
  const handleCSVFile = (file) => {
    if (!file) return;
    if (importing || hasUnfinishedCommittedWork) {
      alert('มีรายการที่บันทึกแล้วแต่ยังปิดงานไม่ครบ — กด Import/ยืนยัน เพื่อทำต่อให้จบก่อนเริ่มไฟล์ใหม่');
      return;
    }
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
        resetImportSession();   // new file = new idempotency session
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
    if (importing || hasUnfinishedCommittedWork) {
      alert('มีรายการที่บันทึกแล้วแต่ยังปิดงานไม่ครบ — กด Import/ยืนยัน เพื่อทำต่อให้จบก่อนเปลี่ยน mapping');
      return;
    }
    const newMap = { ...colMap, [key]: val };
    setColMap(newMap);
    const txns = assignRowIds(mapRowsToTransactions(rows, newMap, defaultScope));
    resetImportSession();   // remapped columns = a different batch
    setPreview(txns);
    setSelected(new Set(txns.map((_, i) => i)));
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
  const handlePDFParse = async () => {
    if (!pdfFile) return;
    if (importing || hasUnfinishedCommittedWork) {
      alert('มีรายการที่บันทึกแล้วแต่ยังปิดงานไม่ครบ — กด Import/ยืนยัน เพื่อทำต่อให้จบก่อนเริ่มไฟล์ใหม่');
      return;
    }
    setPdfParsing(true); setError(null);
    try {
      const buf  = await pdfFile.arrayBuffer();
      // PDF rows had NO per-row id (round-5 bug 1): every Set key collapsed
      // to undefined, so one ambiguity decision hit ALL PDF rows at once.
      const txns = assignRowIds(await parseKBankPDF(buf, pdfPassword, defaultScope));
      if (!txns.length) throw new Error('ไม่พบรายการธุรกรรม — ลองตรวจสอบรหัสผ่านหรือรูปแบบ Statement');
      resetImportSession();   // new file = new idempotency session
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
    setStep('upload'); setError(null);
    setPdfFile(null); setPdfPassword(''); setFileName('');
    setPreview([]); setSelected(new Set());
    setHeaders([]); setRows([]); setMakeFmt(false);
    resetImportSession();
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

  // Debt payment auto-link suggestions.
  // Real existing payments for the preview's months — passing [] used to
  // re-offer months that were already recorded (double increment risk).
  const [existingPayments, setExistingPayments] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!preview.length || !debts.length) { if (alive) setExistingPayments([]); return; }
      const yms = [...new Set(preview.map(r => bangkokMonth(r.occurred_at)).filter(Boolean))].sort();
      if (!yms.length) { if (alive) setExistingPayments([]); return; }
      try {
        const pays = await listDebtPayments({
          startMonth: `${yms[0]}-01`, endMonth: `${yms[yms.length - 1]}-01`,
        });
        if (alive) setExistingPayments(pays || []);
      } catch { if (alive) setExistingPayments([]); }
    })();
    return () => { alive = false; };
  }, [preview, debts]);

  const debtSuggestions = useMemo(
    () => suggestDebtPaymentLinks(preview, debts, existingPayments),
    [preview, debts, existingPayments]
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
  const beginPendingRecovery = (info) => {
    pendingRecoveryRef.current = info;
    setPendingRecovery(info);
    // Only the RPC path leaves receipts behind, so only it is recoverable
    // after a reload; the legacy insert path still raises the in-memory gate.
    if (info.scope && info.month) writeStoredImportSession({ ...info, at: Date.now() });
  };
  const clearPendingRecovery = () => {
    pendingRecoveryRef.current = null;
    setPendingRecovery(null);
    clearStoredImportSession();
  };
  /** Error path: clear ONLY when the server proved nothing committed. */
  const settlePendingRecovery = (err) => {
    if (isDefinitiveServerError(err)) clearPendingRecovery();
  };

  // Round-7 B4 + round-8 B2: THE gate. True whenever rows are committed but
  // their finalisation (side effects) has not fully completed, OR the outcome
  // of a write is still unknown — every exit path respects it, and the
  // session refs are never cleared while it holds.
  const hasUnfinishedCommittedWork =
    (committedCount > 0 && !sideEffectsDone) || !!pendingRecovery;

  const resetImportSession = () => {
    // Never destroy recovery state while committed work is unfinished or a
    // write's outcome is unknown — the key is the only way back to the rows.
    if (pendingRecoveryRef.current) return false;
    if (committedRef.current.size > 0 && !sideEffectsDoneRef.current) return false;
    importKeyRef.current = null;
    committedRef.current = new Map();
    pendingStatsRef.current = null;
    setCommittedCount(0);
    markSideEffects(null);
    sideEffectsDoneRef.current = false;
    setSideEffectsDone(false);
    setServerAmbiguous([]); setServerIncluded(new Set());
    setImportStats(null);
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
    const insertedTotal = [...committed.values()].filter(v => v !== null).length + (S.noMapInserted || 0);

    // B2: apply pocket balances AFTER full success, from inserted rows only.
    let accountFail = null;
    if (createAccts && makeFmt) {
      const insertedPlanRows = S.plan.filter(r => committed.has(r._rid));
      const pockets = extractAccountsFromMapped(insertedPlanRows);
      accountFail = await applyAccountPass(pockets);
    }

    // B3: debt links ONLY for suggestions whose row really inserted, with
    // the exact transaction_id from the receipt/RETURNING mapping.
    const links = activeSuggestions
      .map(sug => ({
        debt_id: sug.debt.id, debtName: sug.debt.name,
        pay_month: `${sug.ym}-01`, amount: sug.amount,
        transaction_id: committed.get(sug.txn._rid),
      }))
      .filter(l => l.transaction_id);   // not inserted / no exact id → no link
    const { ok: debtLinked, failed: debtFails } = await applyDebtLinkPass(links);

    markSideEffects((accountFail || debtFails.length)
      ? { accounts: accountFail, debtFails }
      : null);

    setImportStats({
      inserted: insertedTotal, skipped: S.dupSkipped, debtLinked,
      ambiguousSkipped: S.ambiguousSkipped, ambiguousImported: S.ambiguousImported,
      accountsCreated: S.accountsCreated,
      wipedMonths: S.wipeExecuted ? S.monthArr.length : 0,
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
      markSideEffects((accountFail || stillFailed.length)
        ? { accounts: accountFail, debtFails: stillFailed }
        : null);
      // Round-8 follow-up 1: the retry writes the SAME account balances and
      // debt payments the primary path writes, so it must refresh Finance the
      // same way. Without this the done screen said "สำเร็จ" while the page
      // behind it still showed pre-retry balances until the next reload.
      // finalizeImport() calls onImported unconditionally — this matches it.
      onImported?.();
    } finally { setImporting(false); }
  };

  // ── Round-8 B2: cross-reload recovery ────────────────────────────────────
  // A stored session means a write was declared and never authoritatively
  // answered. Offer a recovery READ (p_probe: pure reconstruction from the v8
  // receipts — no wipe, no insert) and resume the flow from what it reports.
  const [storedSession, setStoredSession] = useState(() => readStoredImportSession());
  const [recovering, setRecovering] = useState(false);

  const recoverStoredSession = async () => {
    if (recovering || importing) return;
    const S0 = storedSession;
    if (!S0) return;
    setRecovering(true); setError(null);
    try {
      // The payload is gone (reload) — only the ords are needed to read back
      // receipts, and p_probe guarantees stubs can never be processed.
      const res = await importTransactionsBatch({
        scope: S0.scope, month: S0.month, wipe: false, dedup: true,
        rows: S0.ords.map(o => ({ _rid: o, scope: S0.scope })),
        importKey: S0.key, probe: true,
      });
      importKeyRef.current = S0.key;
      // transaction_id may be NULL: the FK nulls the mapping when an imported
      // transaction is deleted afterwards. Keep the ord (it is processed, so
      // it must never be re-sent) and let finalisation skip the null.
      for (const m of res.inserted) committedRef.current.set(m.ord, m.transaction_id ?? null);
      syncCommitted();
      clearPendingRecovery();
      setStoredSession(null);

      const stats = {
        dupSkipped: res.dupSkipped, ambiguousSkipped: 0, ambiguousImported: 0,
        noMapInserted: 0, usedRpc: true, wipeExecuted: false,
        monthArr: [S0.month], plan: [], accountsCreated: 0,
      };
      if (res.ambiguous.length) {
        // The decision UI reappears identically — rows rebuilt from the
        // persisted `incoming` snapshot, so approving one still imports it.
        pendingStatsRef.current = stats;
        setServerAmbiguous(res.ambiguous.map(a => ({
          row: {
            _rid: a.ord, scope: S0.scope,
            title: a.incoming?.title ?? '(ไม่มีชื่อ)',
            occurred_at: a.incoming?.occurred_at,
            amount: Number(a.incoming?.amount),
            note: a.incoming?.note ?? null,
            category: null, type: null, account_id: null,
          },
          incoming: a.incoming, existing: a.existing,
        })));
        setServerIncluded(new Set());
        setStep('resolve');
      } else {
        await finalizeImport(stats);
      }
    } catch (err) {
      setError('ตรวจสอบผลการนำเข้าไม่สำเร็จ: ' + (err.message || String(err)) + ' — ลองอีกครั้งได้');
    } finally { setRecovering(false); }
  };

  const handleImport = async () => {
    if (importing) return;                    // single-flight
    const selectedRows = preview.filter((_, i) => selected.has(i));
    if (!selectedRows.length) return;

    setImporting(true); setError(null);
    try {
      if (!importKeyRef.current) {
        importKeyRef.current = (globalThis.crypto?.randomUUID?.()
          ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

      // Step 2 (round-6 B2): accounts — create linkable SHELLS only, and only
      // for pockets present in the executed plan (selection-respecting).
      // Balance/anchor mutations are deferred to finalizeImport, after every
      // transaction group has succeeded.
      let pocketIdMap = new Map();
      if (createAccts && makeFmt) {
        const planPockets = extractAccountsFromMapped(plan);
        if (planPockets.length) {
          pocketIdMap = await bulkUpsertAccountsByPocket(planPockets, { mode: 'ensure' });
        }
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
          for (const m of res.inserted) {
            committedRef.current.set(m.ord, m.transaction_id);
          }
          syncCommitted();
          if (!res.inserted.length && res.insertedCount > 0) {
            // Pre-v6 deployment: no mapping — mark the group's non-ambiguous
            // rows committed (null id) so a retry cannot re-send them.
            const ambOrds = new Set(res.ambiguous.map(a => a.ord));
            for (const r of rows) if (!ambOrds.has(r._rid)) committedRef.current.set(r._rid, null);
            syncCommitted();
            noMapInserted += res.insertedCount;
          }
          dupSkipped += res.dupSkipped;
          for (const a of res.ambiguous) {
            if (a.row) discovered.push({ row: a.row, incoming: a.incoming, existing: a.existing });
            else ambiguousSkipped++;   // v4 count-only: cannot round-trip
          }
        }
        usedRpc = true;
      } catch (err) {
        if (!isRpcMissing(err)) throw err;
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
      setError('Import ไม่สำเร็จ: ' + (err.message || String(err)) +
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
            for (const m of res.inserted) committedRef.current.set(m.ord, m.transaction_id);
            if (!res.inserted.length && res.insertedCount > 0) {
              for (const r of rows) committedRef.current.set(r._rid, null);
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
      setError('Import ไม่สำเร็จ: ' + (err.message || String(err)) +
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
  const closeBlocked = importing || recovering || step === 'resolve'
    || (hasUnfinishedCommittedWork && step !== 'done');
  const tryClose = () => {
    if (importing || recovering || step === 'resolve') return;
    if (hasUnfinishedCommittedWork) {
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

              {/* Round-8 B2: a write from a previous page load was never
                  authoritatively answered — offer the recovery read. */}
              {storedSession && (
                <div style={{
                  width: 420, background: tint('--warning', 10), border: '1px solid var(--warning)',
                  borderRadius: 'var(--radius-card)', padding: '14px 18px',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--warning)', letterSpacing: '0.16em', fontWeight: 600 }}>
                    มีการนำเข้าค้างอยู่ — ตรวจสอบผลอีกครั้ง
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    ครั้งก่อนส่งข้อมูลไปแล้วแต่ไม่ได้รับคำตอบจากเซิร์ฟเวอร์ ({storedSession.ords.length} รายการ ·
                    เดือน {storedSession.month}) — กดตรวจสอบเพื่ออ่านผลจริงจากเซิร์ฟเวอร์
                    (เป็นการอ่านอย่างเดียว ไม่มีการบันทึกซ้ำ)
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn--primary" onClick={recoverStoredSession} disabled={recovering}>
                      {recovering ? 'กำลังตรวจสอบ...' : '↻ ตรวจสอบผลอีกครั้ง'}
                    </button>
                    <button className="btn btn--ghost" disabled={recovering}
                      onClick={() => { setStoredSession(null); clearStoredImportSession(); }}>
                      ไม่ต้องตรวจ
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
                </div>
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
