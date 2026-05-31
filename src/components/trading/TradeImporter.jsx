import { useState, useRef, useMemo } from 'react';
import { Button, Card, CardHeader, Badge, EmptyState } from '../ui/index.js';
import {
  parseTradeExcel, bulkCreateTrades, getExistingTradeKeys, tradeKey,
} from '../../lib/api/trades.js';

export function TradeImporter({ onImported, onClose }) {
  const [step, setStep]       = useState('upload');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [dedup, setDedup]     = useState(true);
  const [importing, setImporting] = useState(false);
  const [stats, setStats]     = useState(null);
  const [error, setError]     = useState(null);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name); setError(null);
    try {
      const buf = await file.arrayBuffer();
      const trades = await parseTradeExcel(buf);
      if (!trades.length) throw new Error('ไม่พบ trades ใน Excel');
      setPreview(trades);
      setSelected(new Set(trades.map((_, i) => i)));
      setStep('preview');
    } catch (e) { setError('อ่านไฟล์ไม่ได้: ' + e.message); }
  };

  const handleImport = async () => {
    const rows = preview.filter((_, i) => selected.has(i));
    if (!rows.length) return;
    setImporting(true); setError(null);
    try {
      let toInsert = rows;
      let skipped = 0;
      if (dedup) {
        const existing = await getExistingTradeKeys();
        toInsert = rows.filter(r => !existing.has(tradeKey(r)));
        skipped = rows.length - toInsert.length;
      }
      const inserted = toInsert.length ? await bulkCreateTrades(toInsert) : [];
      setStats({ inserted: inserted.length, skipped, total: rows.length });
      setStep('done'); onImported?.();
    } catch (e) {
      setError('Import ไม่สำเร็จ: ' + e.message);
    } finally { setImporting(false); }
  };

  const summary = useMemo(() => {
    const sel = preview.filter((_, i) => selected.has(i));
    const wins   = sel.filter(t => t.status === 'WIN').length;
    const losses = sel.filter(t => t.status === 'LOSS').length;
    const totalPnl = sel.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    return { total: sel.length, wins, losses, totalPnl };
  }, [preview, selected]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(40,30,15,0.5)' }} />
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 900, maxHeight: '90vh',
        background: 'var(--background)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-pop)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.18em' }}>
              📈 IMPORT TRADES
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--text-primary)', marginTop: 4 }}>
              จาก Trading Journal Excel
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', padding: '8px 0' }}>
              <div onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-strong)'; handleFile(e.dataTransfer.files[0]); }}
                style={{
                  width: 440, padding: '36px 24px', border: '2px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-card)', cursor: 'pointer',
                  background: 'var(--background-soft)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                }}>
                <div style={{ fontSize: 40 }}>📊</div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>คลิกเพื่อเลือก หรือลาก Excel มาวาง</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                  .xlsx · sheet 'Trade Log'
                </div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])} />
              <Card variant="paper" padding={16} style={{ width: 440 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent-strong)', letterSpacing: '0.14em', marginBottom: 8 }}>
                  รองรับ columns
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--paper-ink)', lineHeight: 1.7 }}>
                  # · วันที่เปิด · วันที่ปิด · Symbol · Direction · Entry · SL · TP · Lot · RR · P&L (USD) · P&L (%) · Session · Setup · ผลลัพธ์ · Setup Detail · Emotion · Lesson Learned · Balance After
                </div>
              </Card>
              {error && (
                <div style={{ width: 440, padding: '10px 14px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Badge tone="neutral" size="lg">{summary.total} trades</Badge>
                <Badge tone="success" size="lg">{summary.wins} Win</Badge>
                <Badge tone="danger"  size="lg">{summary.losses} Loss</Badge>
                <Badge tone={summary.totalPnl >= 0 ? 'success' : 'danger'} size="lg">
                  {summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(2)}
                </Badge>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                  {fileName}
                </span>
              </div>

              <Card padding={12}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={dedup} onChange={e => setDedup(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>ข้าม trades ที่ซ้ำ</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                      — เช็คจาก (วันที่+สัญลักษณ์+entry+pnl)
                    </span>
                  </span>
                </label>
              </Card>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '30px 80px 70px 60px 1fr 60px 90px',
                  gap: 10, padding: '8px 14px', background: 'var(--surface-muted)',
                  fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)',
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>✓</div><div>วันที่</div><div>Symbol</div><div>Dir</div>
                  <div>Setup</div><div>RR</div><div style={{ textAlign: 'right' }}>P&L</div>
                </div>
                <div style={{ maxHeight: 360, overflow: 'auto' }}>
                  {preview.map((t, i) => {
                    const chk = selected.has(i);
                    const isWin = t.status === 'WIN';
                    return (
                      <div key={i} onClick={() => setSelected(prev => {
                        const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n;
                      })} style={{
                        display: 'grid', gridTemplateColumns: '30px 80px 70px 60px 1fr 60px 90px',
                        gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)',
                        alignItems: 'center', fontSize: 12, cursor: 'pointer',
                        opacity: chk ? 1 : 0.45,
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 3,
                          background: chk ? 'var(--accent)' : 'var(--surface)',
                          border: '1.5px solid ' + (chk ? 'var(--accent)' : 'var(--border-strong)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, color: 'var(--text-inverse)',
                        }}>{chk ? '✓' : ''}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-secondary)' }}>{t.trade_date}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--text-primary)' }}>{t.symbol}</div>
                        <div style={{ fontSize: 10.5, color: t.side === 'long' ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--f-mono)' }}>
                          {t.side === 'long' ? '↗ Long' : '↘ Short'}
                        </div>
                        <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.setup || '—'}</div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>{t.rr || '—'}</div>
                        <div style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 12,
                          color: t.pnl > 0 ? 'var(--success)' : t.pnl < 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 500 }}>
                          {t.pnl != null ? (t.pnl > 0 ? '+' : '') + '$' + t.pnl.toFixed(2) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}
            </>
          )}

          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '40px 0' }}>
              <div style={{ fontSize: 52 }}>✅</div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--text-primary)' }}>Import สำเร็จ!</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Badge tone="success" size="lg">+ {stats?.inserted} trades</Badge>
                {stats?.skipped > 0 && <Badge tone="neutral" size="lg">ข้าม {stats.skipped} ซ้ำ</Badge>}
              </div>
              <Button variant="primary" onClick={onClose}>ปิด</Button>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--surface)' }}>
            <Button variant="ghost" onClick={() => { setStep('upload'); setPreview([]); setSelected(new Set()); }}>← กลับ</Button>
            <Button variant="primary" disabled={importing || !selected.size} onClick={handleImport}>
              {importing ? 'กำลัง Import...' : `💾 Import ${selected.size} trades`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
