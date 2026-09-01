/**
 * Loop — Card system
 * Standardized card with optional eyebrow / title / meta / actions
 *
 * Variants:
 *   - 'default' — surface bg with subtle shadow
 *   - 'paper'   — kraft/warm tinted (for highlights, manifest, journal)
 *   - 'flat'    — no shadow (for nested cards)
 */

// Cupertino Warm: surfaces are borderless and separated by shadow, not by a
// hairline box. 'flat' keeps a hairline since nested cards have no shadow to
// separate them from the parent surface.
const VARIANTS = {
  default: {
    background: 'var(--surface)', border: 'none',
    boxShadow: 'var(--shadow-card)',
  },
  paper: {
    background: 'var(--surface-warm)', border: 'none',
    boxShadow: 'var(--shadow-soft)',
  },
  flat: {
    background: 'var(--surface)', border: '1px solid var(--hairline)',
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
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500, fontSize: 13, color: accent,
            marginBottom: 4
          }}>{eyebrow}</div>
        )}
        {title && (
          <div style={{
            fontFamily: 'var(--f-display)', fontSize: 17, fontWeight: 600,
            letterSpacing: '-0.01em',
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
