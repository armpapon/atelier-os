import { useState, useRef } from 'react';
import {
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  bulkCreateTransactions, isMakeFormat,
} from '../lib/api/finance.js';
import { parseKBankPDF } from '../lib/kbankPdfParser.js';

const TYPE_ICONS  = { food: '🍜', transport: '🚗', bills: '💡', income: '💰', shop: '🛍', family: '❤️', other: '📦' };
const TYPE_LABELS = { food: 'อาหาร', transport: 'เดินทาง', bills: 'บิล', income: 'รายรับ', shop: 'ช้อปปิ้ง', family: 'ครอบครัว', other: 'อื่น ๆ' };

const SCOPE_BADGE = {
  personal: { label: 'ส่วนตัว',    bg: '#1a2030', border: '#2a3a60', color: '#7aa4f0' },
  family:   { label: 'ครอบครัว',   bg: '#1f1a30', border: '#4a3060', color: '#c084f5' },
};

export function CSVImporter({ scope: defaultScope = 'personal', onImported, onClose }) {
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

  const handleImport = async () => {
    const toImport = preview
      .filter((_, i) => selected.has(i))
      .map(({ _rowIdx, _pocket, _txtype, ...r }) => r);
    if (!toImport.length) return;
    setImporting(true); setError(null);
    try {
      await bulkCreateTransactions(toImport);
      setStep('done');
      onImported?.();
    } catch (err) {
      setError('Import ไม่สำเร็จ: ' + err.message);
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
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', width: '90vw', maxWidth: 960, maxHeight: '92vh',
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
                color: step === s ? '#1a1410' : ['upload','preview','done'].indexOf(step) > i ? '#1a2a1f' : 'var(--ink-3)',
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
                    boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.3)' : 'none',
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
                  <div style={{ width: 420, background: '#1a1f2e', border: '1px solid #2a3550', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#7aa4f0', marginBottom: 10, letterSpacing: '0.12em' }}>
                      การแยก ส่วนตัว / ครอบครัว อัตโนมัติ
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { color: '#c084f5', label: 'กองทุนครอบครัว', scope: 'ครอบครัว' },
                        { color: '#c084f5', label: 'เงินเพื่อน้องอคิน', scope: 'ครอบครัว' },
                        { color: '#7aa4f0', label: 'กระเป๋าอื่น ๆ ทั้งหมด', scope: 'ส่วนตัว' },
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

                  <div style={{ width: 420, background: '#1a2014', border: '1px solid #2e4a30', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
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
                      <input type={showPwd ? 'text' : 'password'} value={pdfPassword}
                        onChange={e => setPdfPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && pdfFile && handlePDFParse()}
                        placeholder="เช่น วันเดือนปีเกิด 8 หลัก"
                        style={{ flex: 1, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--ink)', fontFamily: 'var(--f-mono)', fontSize: 13 }} />
                      <button onClick={() => setShowPwd(p => !p)}
                        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 14 }}>
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
                <div style={{ width: 420, padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 13 }}>
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
                  padding: '7px 14px', borderRadius: 'var(--r-md)', border: '1px solid #2a3a60',
                  background: '#1a2030', color: '#7aa4f0', cursor: 'pointer', fontSize: 12,
                  fontFamily: 'var(--f-body)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7aa4f0', display: 'inline-block' }} />
                  ส่วนตัว
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, opacity: 0.8 }}>
                    {personalSel}/{personalTot}
                  </span>
                </button>

                {/* Family chip */}
                {familyTot > 0 && (
                  <button onClick={() => toggleScope('family')} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 14px', borderRadius: 'var(--r-md)', border: '1px solid #4a3060',
                    background: '#1f1a30', color: '#c084f5', cursor: 'pointer', fontSize: 12,
                    fontFamily: 'var(--f-body)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c084f5', display: 'inline-block' }} />
                    ครอบครัว
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, opacity: 0.8 }}>
                      {familySel}/{familyTot}
                    </span>
                  </button>
                )}

                {/* Income / Expense totals */}
                <div style={{ padding: '7px 12px', background: 'var(--profit-bg)', border: '1px solid #2e4a37', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--profit)' }}>
                  +฿{totalIncome.toLocaleString('th', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ padding: '7px 12px', background: 'var(--loss-bg)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--loss)' }}>
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
                          style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--f-mono)' }}>
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
                <div style={{ background: '#1a1f2e', border: '1px solid #2a3550', borderRadius: 'var(--r-md)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>✨</span>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#7aa4f0' }}>
                    ตรวจพบ Make Cloud Pocket CSV · แยก scope จากชื่อกระเป๋าอัตโนมัติ
                  </div>
                </div>
              )}

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
                        background: chk ? 'transparent' : 'rgba(0,0,0,0.18)',
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

                        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12, color: isIn ? 'var(--profit)' : 'var(--loss)', fontWeight: 500 }}>
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
                <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* ──────────────── DONE ────────────────────────────────────────── */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 0' }}>
              <div style={{ fontSize: 56 }}>✅</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--ink)', marginBottom: 10 }}>Import สำเร็จ!</div>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {personalSel > 0 && (
                    <div style={{ padding: '8px 16px', background: '#1a2030', border: '1px solid #2a3a60', borderRadius: 'var(--r-md)', color: '#7aa4f0', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
                      ส่วนตัว {personalSel} รายการ
                    </div>
                  )}
                  {familySel > 0 && (
                    <div style={{ padding: '8px 16px', background: '#1f1a30', border: '1px solid #4a3060', borderRadius: 'var(--r-md)', color: '#c084f5', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
                      ครอบครัว {familySel} รายการ
                    </div>
                  )}
                </div>
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
