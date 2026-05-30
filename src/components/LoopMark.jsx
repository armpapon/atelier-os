/**
 * Loop — brand mark
 * A circular arc that suggests a loop/cycle — fits the daily-ritual identity
 */
export function LoopMark({ size = 28, color = 'currentColor', strokeWidth }) {
  const sw = strokeWidth || Math.max(2, size * 0.085);
  const r  = size / 2 - sw;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* outer arc — open at top-right for the 'loop end' */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * r * 0.78} ${2 * Math.PI * r}`}
        transform={`rotate(-100 ${size / 2} ${size / 2})`}
      />
      {/* small dot at the start of the loop */}
      <circle
        cx={size / 2 + Math.cos(-Math.PI * 0.55) * r}
        cy={size / 2 + Math.sin(-Math.PI * 0.55) * r}
        r={sw * 0.65} fill={color}
      />
    </svg>
  );
}

/** Lock-up: mark + wordmark side by side */
export function LoopBrand({ size = 'md', color }) {
  const sizes = {
    sm: { mark: 22, font: 15, gap: 8  },
    md: { mark: 28, font: 18, gap: 10 },
    lg: { mark: 40, font: 26, gap: 12 },
  };
  const s = sizes[size] || sizes.md;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: s.gap, color: color || 'var(--accent)' }}>
      <LoopMark size={s.mark} color="currentColor" />
      <span style={{
        fontFamily: 'var(--f-display)', fontSize: s.font, fontWeight: 500,
        color: 'var(--text-primary)', letterSpacing: '-0.005em', lineHeight: 1,
      }}>Loop</span>
    </div>
  );
}
