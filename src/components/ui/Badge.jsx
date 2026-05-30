/**
 * Atelier OS — Badge / Pill
 * Tonal pill for counts, status, tags.
 */

const TONES = {
  neutral: { bg: 'var(--surface-muted)',  color: 'var(--text-secondary)', border: 'transparent' },
  accent:  { bg: 'var(--accent-soft)',     color: 'var(--accent-strong)',  border: 'transparent' },
  success: { bg: 'var(--success-soft)',    color: 'var(--success)',        border: 'transparent' },
  danger:  { bg: 'var(--danger-soft)',     color: 'var(--danger)',         border: 'transparent' },
  warning: { bg: 'var(--warning-soft)',    color: 'var(--accent-strong)',  border: 'transparent' },
  outline: { bg: 'transparent',            color: 'var(--text-secondary)', border: 'var(--border-strong)' },
};

export function Badge({ children, tone = 'neutral', size = 'md', style }) {
  const t = TONES[tone] || TONES.neutral;
  const sizes = {
    sm: { padding: '1px 7px',  fontSize: 9.5  },
    md: { padding: '2px 10px', fontSize: 10.5 },
    lg: { padding: '4px 12px', fontSize: 11.5 },
  };
  const sz = sizes[size] || sizes.md;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: t.bg, color: t.color,
      border: '1px solid ' + t.border,
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--f-mono)', letterSpacing: '0.04em',
      lineHeight: 1.4,
      ...sz, ...style,
    }}>
      {children}
    </span>
  );
}
