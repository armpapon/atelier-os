import { useState, useRef } from 'react';
import {
  parseCSV, detectKBankColumns, mapRowsToTransactions,
  bulkCreateTransactions, parseAmount,
} from '../lib/api/finance.js';

const TYPE_ICONS = { food: '🍜', transport: '🚗', bills: '💡', income: '💰', shop: '🛍', family: '❤️', other: '📦' };
const TYPE_LABELS = { food: 'อาหาร', transport: 'เดินทาง', bills: 'บิล', income: 'รายรับ', shop: 'ช้อปปิ้ง', family: 'ครอบครัว', other: 'อื่น ๆ' };

export function CSVImporter({ scope, onImported, onClose }) {
  const [step, setStep] = useState('upload'); // upload → preview → done
  const [headers, setHeaders] = useState([]);
  const [colMap, setColMap] = useState({});
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]); // mapped transactions
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef();

  // ── Step 1: Parse file ────────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Try UTF-8 first, then TIS-620 for Thai bank exports
        let text = ev.target.result;
        const parsed = parseCSV(text);
        if (!parsed?.rows?.length) throw new Error('ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง');

        setHeaders(parsed.headers);
        setRows(parsed.rows);

        // Auto-detect KBank columns
        const detected = detectKBankColumns(parsed.headers);
        setColMap(detected);

        // Generate preview immediately
        const txns = mapRowsToTransactions(parsed.rows, detected, scope);
        setPreview(txns);
        setSelected(new Set(txns.map((_, i) => i)));
        setStep('preview');
      } catch (err) {
        setError('อ่านไฟล์ไม่ได้: ' + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Remap when colMap changes
  const handleColChange = (key, val) => {
    const newMap = { ...colMap, [key]: val };
    setColMap(newMap);
    const txns = mapRowsToTransactions(rows, newMap, scope);
    setPreview(txns);
    setSelected(new Set(txns.map((_, i) => i)));
  };

  const toggleRow = (i) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === preview.length) setSelected(new Set());
    else setSelected(new Set(preview.map((_, i) => i)));
  };

  // ── Step 2: Import ────────────────────────────────────────────────────────
  const handleImport = async () => {
    const toImport = preview.filter((_, i) => selected.has(i)).map(({ _rowIdx, ...r }) => r);
    if (!toImport.length) return;
    setImporting(true); setError(null);
    try {
      await bulkCreateTransactions(toImport);
      setStep('done');
      onImported?.();
    } catch (err) {
      setError('Import ไม่สำเร็จ: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const totalIncome  = preview.filter((_, i) => selected.has(i)).reduce((s, r) => r.amount > 0 ? s + r.amount : s, 0);
  const totalExpense = preview.filter((_, i) => selected.has(i)).reduce((s, r) => r.amount < 0 ? s + Math.abs(r.amount) : s, 0);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-xl)', width: '90vw', maxWidth: 900, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--ink)' }}>
              Import จาก Make by KBank
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.12em' }}>
              {scope === 'personal' ? 'การเงินส่วนตัว' : 'การเงินครอบครัว'} · CSV / Excel Export
            </div>
          </div>
          <button onClick={onClose} style={{ color: 'var(--ink-3)', fontSize: 22, padding: '4px 8px' }}>×</button>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', padding: '10px 28px', borderBottom: '1px solid var(--line)', gap: 20, flexShrink: 0 }}>
          {['upload', 'preview', 'done'].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step === s ? 'var(--amber)' : ['upload', 'preview', 'done'].indexOf(step) > i ? 'var(--profit)' : 'var(--surface-2)',
                color: step === s ? '#1a1410' : ['upload', 'preview', 'done'].indexOf(step) > i ? '#1a2a1f' : 'var(--ink-3)',
                fontSize: 11, fontFamily: 'var(--f-mono)', fontWeight: 600,
              }}>{i + 1}</div>
              <span style={{ fontSize: 12, color: step === s ? 'var(--ink)' : 'var(--ink-3)' }}>
                {['เลือกไฟล์', 'ตรวจสอบ', 'เสร็จสิ้น'][i]}
              </span>
              {i < 2 && <span style={{ color: 'var(--line-2)', fontSize: 12 }}>›</span>}
            </div>
          ))}
          {fileName && <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)' }}>{fileName}</span>}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

          {/* STEP: upload */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '32px 0' }}>
              <div style={{ fontSize: 48 }}>📂</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>เลือกไฟล์ Statement</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.7 }}>
                  Export Statement จาก <strong style={{ color: 'var(--amber)' }}>Make by KBank</strong> แล้วลากหรือกดเลือกไฟล์<br/>
                  รองรับ <strong>.csv</strong> ทุกรูปแบบ (UTF-8, TIS-620) · รัน preview ก่อน import จริง
                </div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--amber)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; }}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = 'var(--line)';
                  const file = e.dataTransfer.files[0];
                  if (file) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current.files = dt.files; handleFile({ target: { files: [file] } }); }
                }}
                style={{
                  width: 360, padding: '28px 24px', border: '2px dashed var(--line)', borderRadius: 'var(--r-lg)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
                  transition: 'border-color 150ms', background: 'var(--surface-2)',
                }}>
                <div style={{ fontSize: 28 }}>📋</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>คลิกเพื่อเลือก หรือลาก CSV มาวาง</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-4)' }}>.csv</div>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: 'none' }} />

              {error && (
                <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  {error}
                </div>
              )}

              {/* How to export guide */}
              <div style={{ width: '100%', maxWidth: 520, background: '#1a2014', border: '1px solid #2e4a30', borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--profit)', marginBottom: 10, letterSpacing: '0.12em' }}>วิธี Export จาก Make by KBank</div>
                <ol style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 2 }}>
                  <li>เปิด app <strong style={{ color: 'var(--ink-2)' }}>Make by KBank</strong></li>
                  <li>ไปที่ <strong style={{ color: 'var(--ink-2)' }}>Account → Statement</strong></li>
                  <li>เลือกช่วงเวลา (เช่น เดือนที่แล้ว)</li>
                  <li>กด <strong style={{ color: 'var(--ink-2)' }}>Download / Share</strong> → เลือก <strong style={{ color: 'var(--amber)' }}>CSV</strong></li>
                  <li>ส่งไฟล์มาที่คอมแล้วลากมาวางที่นี่</li>
                </ol>
              </div>
            </div>
          )}

          {/* STEP: preview */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Column mapping */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '14px 18px' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.16em', marginBottom: 12 }}>MAP COLUMNS — ถ้า auto-detect ไม่ถูก ปรับได้ที่นี่</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { key: 'dateCol',    label: 'วันที่' },
                    { key: 'descCol',    label: 'รายการ / ชื่อ' },
                    { key: 'amountCol',  label: 'จำนวนเงิน (รวม)' },
                    { key: 'debitCol',   label: 'ถอน / รายจ่าย' },
                    { key: 'creditCol',  label: 'ฝาก / รายรับ' },
                    { key: 'balanceCol', label: 'ยอดคงเหลือ' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--f-mono)' }}>{label}</span>
                      <select value={colMap[key] || ''}
                        onChange={e => handleColChange(key, e.target.value || null)}
                        style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 6px', fontSize: 11, color: 'var(--ink)', fontFamily: 'var(--f-mono)' }}>
                        <option value="">(ไม่ใช้)</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              {/* Summary bar */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ padding: '8px 14px', background: 'var(--profit-bg)', border: '1px solid #2e4a37', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--profit)' }}>
                  รายรับ +฿{totalIncome.toLocaleString('th', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ padding: '8px 14px', background: 'var(--loss-bg)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--loss)' }}>
                  รายจ่าย -฿{totalExpense.toLocaleString('th', { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                  เลือก {selected.size} / {preview.length} รายการ
                </div>
                <button onClick={toggleAll} className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }}>
                  {selected.size === preview.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>

              {/* Transaction table preview */}
              <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '32px 90px 1fr 100px 110px 80px', gap: 12, padding: '8px 14px', background: 'var(--bg-2)', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>
                  <div>✓</div><div>วันที่</div><div>รายการ</div><div style={{ textAlign: 'right' }}>จำนวน</div><div>ประเภท</div><div>หมวด</div>
                </div>
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  {preview.map((row, i) => {
                    const isIn = row.amount > 0;
                    const checked = selected.has(i);
                    return (
                      <div key={i}
                        onClick={() => toggleRow(i)}
                        style={{
                          display: 'grid', gridTemplateColumns: '32px 90px 1fr 100px 110px 80px', gap: 12,
                          padding: '9px 14px', borderBottom: '1px solid var(--line)', alignItems: 'center',
                          fontSize: 12.5, cursor: 'pointer',
                          background: checked ? 'transparent' : 'rgba(0,0,0,0.15)',
                          opacity: checked ? 1 : 0.45,
                        }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          background: checked ? 'var(--amber)' : 'var(--surface-2)',
                          border: `1.5px solid ${checked ? 'var(--amber)' : 'var(--line)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, flexShrink: 0,
                        }}>{checked ? '✓' : ''}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                          {row.occurred_at?.split('T')[0] || ''}
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                          {row.title}
                        </div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12.5, color: isIn ? 'var(--profit)' : 'var(--loss)', fontWeight: 500 }}>
                          {isIn ? '+' : ''}฿{Math.abs(row.amount).toLocaleString('th', { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                          {TYPE_ICONS[row.type]} {TYPE_LABELS[row.type]}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--f-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.category}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 16px', background: 'var(--loss-bg)', color: 'var(--loss)', border: '1px solid #4a2e2a', borderRadius: 'var(--r-md)', fontSize: 13 }}>
                  {error}
                </div>
              )}
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 0' }}>
              <div style={{ fontSize: 56 }}>✅</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--ink)', marginBottom: 8 }}>Import สำเร็จ!</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                  เพิ่ม {selected.size} รายการเข้า{scope === 'personal' ? 'การเงินส่วนตัว' : 'การเงินครอบครัว'} เรียบร้อยแล้ว
                </div>
              </div>
              <button className="btn btn--primary" onClick={onClose}>ปิดและดูรายการ</button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'preview' && (
          <div style={{ padding: '16px 28px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
            <button className="btn btn--ghost" onClick={() => { setStep('upload'); setError(null); }}>← กลับ</button>
            <button
              className="btn btn--primary"
              disabled={importing || selected.size === 0}
              onClick={handleImport}
              style={{ minWidth: 180, justifyContent: 'center' }}>
              {importing ? 'กำลัง Import...' : `💾 Import ${selected.size} รายการ`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
