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
      return { ...base, background: 'var(--accent-fill)', color: 'var(--text-inverse)',
        fontWeight: 600, borderColor: 'transparent' };
    case 'secondary':
      return { ...base, background: 'var(--fill-2)', color: 'var(--text-primary)',
        borderColor: 'transparent' };
    case 'outline':
      return { ...base, background: 'transparent', color: 'var(--text-primary)',
        borderColor: 'var(--hairline)' };
    case 'ghost':
      return { ...base, background: 'transparent', color: 'var(--text-secondary)' };
    case 'danger':
      return { ...base, background: 'transparent', color: 'var(--danger)',
        borderColor: 'transparent' };
    case 'icon':
      return { ...base, background: 'var(--fill)', color: 'var(--text-primary)',
        borderColor: 'transparent', borderRadius: 'var(--radius-field)' };
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
        // A10-r2: brightness(1.08) LIGHTENED the fill, so white text lost
        // contrast on hover (4.02–4.07:1 on some accents). Darken instead —
        // an explicit token, so a custom accent supplies its own hover fill.
        if (variant === 'primary')        el.style.background = 'var(--accent-fill-hover)';
        else if (variant === 'secondary') el.style.background = 'var(--fill-2)';
        else if (variant === 'outline')   el.style.background = 'var(--fill)';
        else if (variant === 'ghost')     { el.style.background = 'var(--fill)'; el.style.color = 'var(--text-primary)'; }
        else if (variant === 'danger')    el.style.background = 'var(--danger-soft)';
        else if (variant === 'icon')      el.style.background = 'var(--fill-2)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        const v = variantStyles(variant, disabled);
        el.style.background = v.background;
        el.style.filter = 'none';
        if (variant === 'ghost') el.style.color = 'var(--text-secondary)';
      }}
      style={{
        ...vs,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: sz.gap, padding: isIcon ? 0 : sz.padding,
        fontSize: sz.fontSize, fontFamily: 'var(--f-body)', fontWeight: 500,
        borderRadius: isIcon ? 'var(--radius-field)' : 'var(--radius-btn)',
        minHeight: sz.minHeight, minWidth: isIcon ? sz.minHeight : 'auto',
        width: fullWidth ? '100%' : 'auto', lineHeight: 1,
        ...style
      }}>
      {children}
    </button>
  );
}
