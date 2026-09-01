// Loop — KPI Card
// Reusable KPI tile with bold value + MoM delta indicator

function formatBaht(n, opts = {}) {
  const { sign = false, compact = false } = opts;
  if (!n && n !== 0) return '฿0';
  const abs = Math.abs(n);
  let s;
  if (compact && abs >= 1000) {
    if (abs >= 1_000_000) s = (abs / 1_000_000).toFixed(2) + 'M';
    else s = (abs / 1000).toFixed(1) + 'K';
  } else {
    s = abs.toLocaleString('th', { maximumFractionDigits: 0 });
  }
  const prefix = sign ? (n >= 0 ? '+฿' : '-฿') : '฿';
  return prefix + s;
}

function formatPct(n) {
  if (!isFinite(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

export function KPICard({ label, sub, value, valueColor = 'var(--text-primary)', delta, deltaLabel, accent }) {
  const positive = delta > 0;
  const neutral  = delta === 0 || delta == null;
  const deltaColor = neutral ? 'var(--text-muted)' : positive ? 'var(--success)' : 'var(--danger)';
  const arrow      = neutral ? '◇' : positive ? '▲' : '▼';

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative', overflow: 'hidden',
      boxShadow: 'var(--shadow-card)',
    }}>
      {accent && (
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: 3, height: '100%', background: accent,
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{
          fontVariantNumeric: 'tabular-nums', fontSize: 13,
          color: 'var(--text-muted)', fontWeight: 500
        }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--f-mono)' }}>{sub}</div>}
      </div>

      <div style={{
        fontFamily: 'var(--f-display)', fontSize: 30, fontWeight: 500,
        color: valueColor, lineHeight: 1.05, letterSpacing: '-0.01em',
      }}>{value}</div>

      {delta !== undefined && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--f-mono)', fontSize: 11, color: deltaColor,
        }}>
          <span style={{ fontSize: 9 }}>{arrow}</span>
          <span style={{ fontWeight: 500 }}>{typeof delta === 'number' ? formatPct(delta) : delta}</span>
          {deltaLabel && <span style={{ color: 'var(--text-muted)' }}>{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

export { formatBaht, formatPct };
