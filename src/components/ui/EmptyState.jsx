/**
 * Loop — EmptyState
 * Standardized empty state with icon + headline + description + CTA.
 * Use this ANY time a list/card is empty.
 */
import { Button } from './Button.jsx';

export function EmptyState({
  icon = '✦',
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  minHeight = 220,
  compact = false,
}) {
  return (
    <div style={{
      minHeight: compact ? 140 : minHeight,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      borderRadius: 'var(--radius-card)',
      border: '1px dashed var(--border-strong)',
      background: 'var(--background-soft)',
      padding: compact ? '24px 20px' : '36px 24px',
      gap: compact ? 10 : 14,
    }}>
      <div style={{
        width: compact ? 40 : 48, height: compact ? 40 : 48,
        borderRadius: '50%',
        background: 'var(--accent-soft)', color: 'var(--accent-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: compact ? 18 : 22,
        boxShadow: 'inset 0 0 0 1px rgba(138,90,43,0.10)',
      }}>{icon}</div>

      {title && (
        <div style={{
          fontFamily: 'var(--f-display)',
          fontSize: compact ? 14 : 16, fontWeight: 500,
          color: 'var(--text-primary)',
        }}>{title}</div>
      )}

      {description && (
        <div style={{
          maxWidth: 380, fontSize: compact ? 12 : 13,
          color: 'var(--text-secondary)', lineHeight: 1.65,
        }}>{description}</div>
      )}

      {(actionLabel || secondaryLabel) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {actionLabel && (
            <Button variant="primary" size={compact ? 'sm' : 'md'} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && (
            <Button variant="ghost" size={compact ? 'sm' : 'md'} onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
