/**
 * Atelier OS — Card system
 * Standardized card with optional eyebrow / title / meta / actions
 *
 * Variants:
 *   - 'default' — surface bg with subtle shadow
 *   - 'paper'   — kraft/warm tinted (for highlights, manifest, journal)
 *   - 'flat'    — no shadow (for nested cards)
 */

const VARIANTS = {
  default: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
  },
  paper: {
    background: 'var(--surface-warm)', border: '1px solid var(--paper-2)',
    boxShadow: 'var(--shadow-soft)',
  },
  flat: {
    background: 'var(--surface)', border: '1px solid var(--border)',
    boxShadow: 'none',
  },
};

export function Card({ children, variant = 'default', padding = 22, style }) {
  return (
    <div style={{
      ...VARIANTS[variant],
      borderRadius: 'var(--radius-card)',
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Standard card header: eyebrow + title + meta + action slot */
export function CardHeader({ eyebrow, title, meta, action, accent = 'var(--text-muted)' }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: 14, marginBottom: 14,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10.5, color: accent,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>{eyebrow}</div>
        )}
        {title && (
          <div style={{
            fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 500,
            color: 'var(--text-primary)', lineHeight: 1.3,
          }}>{title}</div>
        )}
        {meta && (
          <div style={{
            fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4,
          }}>{meta}</div>
        )}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}
