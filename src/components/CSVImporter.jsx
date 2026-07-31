import { useState, useRef, useMemo } from 'react';
import {
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  bulkCreateTransactions, isMakeFormat,
  extractAccountsFromMapped, bulkUpsertAccountsByPocket,
  getExistingTxnKeys, txnKey, deleteTransactionsInMonth,
  suggestDebtPaymentLinks, recordDebtPayment, listDebtPayments,
  getMonthBounds, bangkokMonth,
} from '../lib/api/finance.js';
import { parseKBankPDF } from '../lib/kbankPdfParser.js';

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

        const txns = mapRowsToTransactions(parsed.rows, detected, defaultScope);
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
    const newMap = { ...colMap, [key]: val };
    setColMap(newMap);
    const txns = mapRowsToTransactions(rows, newMap, defaultScope);
    setPreview(txns);
    setSelected(new Set(txns.map((_, i) => i)));
  };

  // ── PDF ────────────────────────────────────────────────────────────────────
  const handlePDFParse = async () => {
    if (!pdfFile) return;
    setPdfParsing(true); setError(null);
    try {
      const buf  = await pdfFile.arrayBuffer();
      const txns = await parseKBankPDF(buf, pdfPassword, defaultScope);
      if (!txns.length) throw new Error('ไม่พบรายการธุรกรรม — ลองตรวจสอบรหัสผ่านหรือรูปแบบ Statement');
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

  // Debt payment auto-link suggestions
  const debtSuggestions = useMemo(
    () => suggestDebtPaymentLinks(preview, debts, []),
    [preview, debts]
  );
  const [skippedSuggestions, setSkippedSuggestions] = useState(new Set());
  const activeSuggestions = debtSuggestions.filter(s =>
    !skippedSuggestions.has(`${s.txn._rowIdx}|${s.debt.id}|${s.ym}`)
  );

  const handleImport = async () => {
    const selectedRows = preview.filter((_, i) => selected.has(i));
    if (!selectedRows.length) return;

    setImporting(true); setError(null);
    try {
      // Detect month range of selected rows (for dedup / wipe)
      const months = new Set();
      for (const r of selectedRows) {
        const ym = bangkokMonth(r.occurred_at);
        if (ym) months.add(ym);
      }
      const monthArr = [...months].sort();

      // Step 1: optionally wipe existing transactions in these months
      if (wipeMonth && monthArr.length) {
        const scopes = new Set(selectedRows.map(r => r.scope));
        await Promise.all(
          monthArr.flatMap(ym =>
            [...scopes].map(sc => deleteTransactionsInMonth(ym, sc))
          )
        );
      }

      // Step 2: auto-create accounts from pocket names → get id map
      let pocketIdMap = new Map();
      if (createAccts && makeFmt && pocketSummary.length) {
        pocketIdMap = await bulkUpsertAccountsByPocket(pocketSummary);
      }

      // Step 3: dedup against existing transactions
      let toImport = selectedRows;
      let skipped = 0;
      if (dedup && !wipeMonth && monthArr.length) {
        const { startTs: first } = getMonthBounds(monthArr[0]);
        const { endTs: lastEnd }  = getMonthBounds(monthArr[monthArr.length - 1]);
        const scopesNeeded = [...new Set(selectedRows.map(r => r.scope))];
        const allKeys = new Set();
        for (const sc of scopesNeeded) {
          const keys = await getExistingTxnKeys({ startDate: first, endDate: lastEnd, scope: sc });
          keys.forEach(k => allKeys.add(k + '|' + sc));
        }
        toImport = selectedRows.filter(r => !allKeys.has(txnKey(r) + '|' + r.scope));
        skipped = selectedRows.length - toImport.length;
      }

      // Step 4: attach account_id from pocket → strip internal _* fields → insert
      // Keep _rowIdx so we can match inserted rows back to suggestions
      const rowIndexes = toImport.map(r => r._rowIdx);
      const clean = toImport.map(({ _rowIdx, _pocket, _txtype, _cp_bal, ...r }) => ({
        ...r,
        account_id: pocketIdMap.get(_pocket) || null,
      }));

      let inserted = 0;
      let insertedRows = [];
      if (clean.length) {
        insertedRows = (await bulkCreateTransactions(clean)) || [];
        inserted = insertedRows.length || clean.length;
      }

      // Step 5: auto-link debt payments using suggestions on the still-active rows
      let debtLinked = 0;
      if (activeSuggestions.length && insertedRows.length) {
        // map by natural key (date+amount+title) → inserted id
        const insertedByKey = new Map();
        for (let i = 0; i < insertedRows.length; i++) {
          insertedByKey.set(txnKey(insertedRows[i]), insertedRows[i]);
        }
        for (const sug of activeSuggestions) {
          const inserted = insertedByKey.get(txnKey(sug.txn));
          if (!inserted) continue;
          try {
            await recordDebtPayment({
              debt_id: sug.debt.id,
              pay_month: sug.ym + '-01',
              amount_paid: sug.amount,
              transaction_id: inserted.id,
              notes: 'auto-linked from import',
            });
            debtLinked++;
          } catch (_) { /* swallow individual link failures */ }
        }
      }

      setImportStats({
        inserted, skipped, debtLinked,
        accountsCreated: pocketIdMap.size,
        wipedMonths: wipeMonth ? monthArr.length : 0,
      });
      setStep('done');
      onImported?.();
    } catch (err) {
      setError('Import ไม่สำเร็จ: ' + (err.message || String(err)));
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
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
          <button onClick={onClose} style={{ background: 'none', border: 0, color: 'var(--ink-3)', fontSize: 22, padding: '4px 8px', cursor: 'pointer' }}>×</button>
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
                      const key = `${sug.txn._rowIdx}|${sug.debt.id}|${sug.ym}`;
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
                          {row.occurred_at?.split('T')[0] || ''}
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
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, padding: '40px 0' }}>
              <div style={{ fontSize: 52 }}>✅</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--ink)', marginBottom: 14 }}>
                  Import สำเร็จ!
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, maxWidth: 480 }}>
                  {importStats?.inserted > 0 && (
                    <StatChip label="รายการใหม่"  value={importStats.inserted} accent="var(--profit)" />
                  )}
                  {importStats?.skipped > 0 && (
                    <StatChip label="ข้าม (ซ้ำ)"  value={importStats.skipped} accent="var(--ink-3)" />
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
              <button className="btn btn--primary" onClick={onClose}>ปิดและดูรายการ</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div style={{ padding: '14px 26px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
            <button className="btn btn--ghost" onClick={resetUpload}>← กลับ</button>
            <button className="btn btn--primary" disabled={importing || sel.length === 0} onClick={handleImport}
              style={{ minWidth: 200, justifyContent: 'center' }}>
              {importing
                ? 'กำลัง Import...'
                : `💾 Import ${sel.length} รายการ${familySel > 0 ? ` (${familySel} ครอบครัว)` : ''}`}
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
