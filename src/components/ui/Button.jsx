/**
 * Loop — Button
 * Hierarchy: primary > secondary > outline > ghost > icon
 * Only ONE primary button per major section.
 */

const SIZES = {
  sm: { padding: '6px 12px',  fontSize: 12,    minHeight: 30, gap: 6  },
  md: { padding: '9px 16px',  fontSize: 13.5,  minHeight: 38, gap: 8  },
  lg: { padding: '12px 22px', fontSize: 14.5,  minHeight: 46, gap: 10 },
};

function variantStyles(variant, disabled) {
  const base = {
    border: '1px solid transparent', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'all 130ms',
  };
  switch (variant) {
    case 'primary':
      return { ...base, background: 'var(--accent-strong)', color: 'var(--text-inverse)',
        boxShadow: '0 2px 6px rgba(138,90,43,0.20)', borderColor: 'var(--accent-strong)' };
    case 'secondary':
      return { ...base, background: 'var(--accent-soft)', color: 'var(--text-primary)',
        borderColor: 'var(--accent-soft)' };
    case 'outline':
      return { ...base, background: 'var(--surface)', color: 'var(--text-primary)',
        borderColor: 'var(--border-strong)' };
    case 'ghost':
      return { ...base, background: 'transparent', color: 'var(--text-secondary)' };
    case 'danger':
      return { ...base, background: 'transparent', color: 'var(--danger)',
        borderColor: 'transparent' };
    case 'icon':
      return { ...base, background: 'var(--surface)', color: 'var(--text-primary)',
        borderColor: 'var(--border)', borderRadius: 'var(--radius-control)' };
    default:
      return base;
  }
}

export function Button({
  children, variant = 'outline', size = 'md',
  type = 'button', onClick, disabled, title, style, fullWidth, ariaLabel,
}) {
  const sz  = SIZES[size] || SIZES.md;
  const vs  = variantStyles(variant, disabled);
  const isIcon = variant === 'icon';

  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      aria-label={ariaLabel}
      className="focus-ring"
      onMouseEnter={(e) => {
        if (disabled) return;
        const el = e.currentTarget;
        if (variant === 'primary')        el.style.background = 'var(--accent)';
        else if (variant === 'secondary') el.style.background = '#e4c99f';
        else if (variant === 'outline')   el.style.background = 'var(--surface-muted)';
        else if (variant === 'ghost')     { el.style.background = 'var(--surface-muted)'; el.style.color = 'var(--text-primary)'; }
        else if (variant === 'danger')    el.style.background = 'var(--danger-soft)';
        else if (variant === 'icon')      el.style.background = 'var(--surface-muted)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        const v = variantStyles(variant, disabled);
        el.style.background = v.background;
        if (variant === 'ghost') el.style.color = 'var(--text-secondary)';
      }}
      style={{
        ...vs,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: sz.gap, padding: isIcon ? 0 : sz.padding,
        fontSize: sz.fontSize, fontFamily: 'var(--f-body)', fontWeight: 500,
        borderRadius: isIcon ? 'var(--radius-control)' : 'var(--radius-pill)',
        minHeight: sz.minHeight, minWidth: isIcon ? sz.minHeight : 'auto',
        width: fullWidth ? '100%' : 'auto',
        letterSpacing: '0.01em', lineHeight: 1,
        ...style,
      }}>
      {children}
    </button>
  );
}
