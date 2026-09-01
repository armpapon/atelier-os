import { useMemo } from 'react';
import { Card, CardHeader, Badge, EmptyState } from '../ui/index.js';
import { Icon } from '../Icon.jsx';

/**
 * CashboxCard — รายงานเงินไหลผ่าน Cashbox เดือนนั้น
 *
 * Props:
 *   txns       = transactions ของเดือนปัจจุบัน (scope='personal')
 *   accounts   = บัญชี personal ทั้งหมด (เพื่อหา Cashbox balance)
 *   yearMonth  = '2026-05' ฯลฯ (สำหรับ label)
 */
export function CashboxCard({ txns, accounts, yearMonth }) {
  const cashboxAcc = accounts?.find(a => a.name === 'Cashbox');

  // From Cashbox transactions only, find inflows / outflows / allocation
  const cashboxTxns = useMemo(() =>
    (txns || []).filter(t => {
      // Match by account_id (auto-linked from CSV import)
      if (cashboxAcc && t.account_id === cashboxAcc.id) return true;
      // Or fallback by note/title hint
      return /cashbox/i.test(t.title || '') || /cashbox/i.test(t.note || '');
    }),
  [txns, cashboxAcc]);

  const inflow      = cashboxTxns.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const allocation  = (txns || []).filter(t => t.category === 'แบ่งงบ').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const directSpend = cashboxTxns.filter(t => t.amount < 0 && t.category !== 'แบ่งงบ').reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const balance     = cashboxAcc ? Number(cashboxAcc.balance || 0) : 0;

  const hasData = inflow > 0 || allocation > 0 || directSpend > 0 || cashboxAcc;

  if (!hasData) {
    return (
      <Card>
        <CardHeader eyebrow="Cashbox · กล่องกลาง" title="เงินไหลผ่าน Cashbox" />
        <EmptyState
          icon={<Icon name="money" size={20} />}
          title="ยังไม่มีกระเป๋า Cashbox"
          description="Import CSV จาก Make → ระบบจะสร้างบัญชี Cashbox ให้อัตโนมัติ"
          compact
        />
      </Card>
    );
  }

  // For bar viz: total flow
  const totalOut = allocation + directSpend;
  const remaining = Math.max(0, inflow - totalOut);
  const baseForBar = Math.max(inflow, totalOut, 1);

  return (
    <Card>
      <CardHeader
        eyebrow={`Cashbox · กล่องกลาง · ${monthLabel(yearMonth)}`}
        title="เงินไหลผ่าน Cashbox"
        meta="เงินเดือน → กระจายไปกองทุน · ที่เหลือใช้รายวัน"
        action={cashboxAcc && <Badge tone="accent" size="lg">฿{balance.toLocaleString('th', { maximumFractionDigits: 0 })}</Badge>}
      />

      {/* 4-up summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        <Stat label="เข้าเดือนนี้" value={fmt(inflow)} color="var(--success)" sub={`${cashboxTxns.filter(t => t.amount > 0).length} ครั้ง`} />
        <Stat label="→ ครอบครัว"   value={'-' + fmt(allocation)} color="var(--violet)" sub="แบ่งไปกองทุน" />
        <Stat label="ใช้จาก Cashbox" value={'-' + fmt(directSpend)} color="var(--danger)" sub="payment ตรง" />
        <Stat label="เหลือ Cashbox" value={fmt(balance)} color="var(--accent-strong)" sub="ตอนนี้" />
      </div>

      {/* Flow bar visualization */}
      <div style={{ marginTop: 4 }}>
        <div style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
          display: 'flex', fontSize: 13,
          color: 'var(--text-muted)', marginBottom: 6
        }}>
          <span>เงินเข้า {fmt(inflow)}</span>
          <span style={{ marginLeft: 'auto' }}>แบ่งออก {fmt(totalOut)}</span>
        </div>

        {/* Inflow bar */}
        <div style={{ height: 12, background: 'var(--surface-muted)', borderRadius: 6, overflow: 'hidden', display: 'flex', marginBottom: 6 }}>
          <div title={`เข้า ฿${inflow.toLocaleString('th')}`}
            style={{ width: `${(inflow / baseForBar) * 100}%`, background: 'var(--success)' }} />
        </div>

        {/* Outflow split bar */}
        <div style={{ height: 12, background: 'var(--surface-muted)', borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
          {allocation > 0 && (
            <div title={`แบ่งครอบครัว ฿${allocation.toLocaleString('th')}`}
              style={{ width: `${(allocation / baseForBar) * 100}%`, background: 'var(--violet)' }} />
          )}
          {directSpend > 0 && (
            <div title={`ใช้จาก Cashbox ฿${directSpend.toLocaleString('th')}`}
              style={{ width: `${(directSpend / baseForBar) * 100}%`, background: 'var(--danger)' }} />
          )}
          {remaining > 0 && (
            <div title={`คงเหลือ ฿${remaining.toLocaleString('th')}`}
              style={{ width: `${(remaining / baseForBar) * 100}%`, background: 'var(--accent-soft)' }} />
          )}
        </div>

        {/* Legend */}
        <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', display: 'flex', gap: 14, marginTop: 8, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--violet)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />แบ่งครอบครัว</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--danger)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />ใช้ตรงจาก Cashbox</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent-soft)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />คงเหลือยังไม่แบ่ง</span>
        </div>

        {/* Warning if income > total out (unallocated money) */}
        {inflow > 0 && remaining > inflow * 0.1 && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--warning-soft)', color: 'var(--accent-strong)',
            border: '1px solid var(--warning)', borderRadius: 'var(--radius-control)',
            fontSize: 12,
          }}>
            <Icon name="warning" size={14} /> มี <strong>{fmt(remaining)}</strong> ใน Cashbox ที่ยังไม่ได้แบ่งงบ — พิจารณาโอนเข้ากองทุนครอบครัวหรือ savings
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <div style={{
      padding: '10px 12px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color, fontWeight: 500, lineHeight: 1.2, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function fmt(n) {
  const abs = Math.abs(n || 0);
  if (abs >= 1_000_000) return '฿' + (abs / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1000)      return '฿' + (abs / 1000).toFixed(1) + 'K';
  return '฿' + abs.toLocaleString('th', { maximumFractionDigits: 0 });
}

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return `${months[m - 1]} ${y + 543}`;
}
