import { Icon } from '../Icon.jsx';

/**
 * True Cupertino · phase 3 — the grouped-inset list primitives.
 *
 * The Finance ภาพรวม and หนี้ rooms are built out of four shapes, and only
 * four: a hero card whose single number is the headline, a small caption above
 * each group, a white rounded group, and rows inside it. They live here rather
 * than in each consumer because the ภาพรวม page, DebtAdvice, MoneyPlanner and
 * DebtTracker all paint the same row — the pattern repeats far past the
 * three-times threshold, and three private copies is how they would drift.
 *
 * Presentational only: every figure is computed by the finance libs and handed
 * in as a prop. Nothing here fetches, formats a currency or decides a colour
 * from data — the caller owns all of that.
 *
 * House rules these obey (audit/cases.mjs enforces them):
 *   · no monospace face — figures get `fontVariantNumeric: 'tabular-nums'`
 *   · no emoji — icons come from <Icon>
 *   · sentence case, negative tracking only
 *   · an interactive row is a real <button>, named by its own visible title
 */

/** Tabular figures — spread onto anything that paints a number. */
export const NUM = { fontVariantNumeric: 'tabular-nums' };

const HAIRLINE = '1px solid var(--hairline)';

/**
 * The one-number headline at the top of a room.
 *
 * @param caption  small label above the number
 * @param amount   the headline itself (already formatted by the caller)
 * @param tone     colour for the headline (default: --text-primary)
 * @param stats    [{ k, v, tone }] — the row of supporting figures below
 * @param aside    optional node beside the caption (e.g. the month picker)
 */
export function HeroCard({ caption, amount, tone, stats = [], aside, compact, ...rest }) {
  return (
    <div {...rest} style={{
      background: 'var(--surface)', border: 'none',
      borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
      padding: compact ? '18px 18px' : '22px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{caption}</span>
        {aside}
      </div>
      <div style={{
        fontFamily: 'var(--f-display)', fontSize: compact ? 34 : 44, fontWeight: 700,
        letterSpacing: '-0.02em', lineHeight: 1.05, margin: '4px 0 2px',
        color: tone || 'var(--text-primary)', ...NUM,
      }}>{amount}</div>
      {stats.length > 0 && (
        <div style={{
          display: 'flex', gap: 22, flexWrap: 'wrap',
          marginTop: 15, paddingTop: 15, borderTop: HAIRLINE,
        }}>
          {stats.map((s) => (
            <div key={s.k}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-muted)' }}>{s.k}</div>
              <div style={{
                fontSize: 17, fontWeight: 600, marginTop: 2,
                color: s.tone || 'var(--text-primary)', ...NUM,
              }}>{s.v}</div>
              {/* A stat that cannot be measured says why, right under itself —
                  an unexplained "—" is just as opaque as a wrong number. */}
              {s.sub != null && (
                <div style={{
                  fontSize: 12, fontWeight: 500, marginTop: 2, maxWidth: 190, lineHeight: 1.4,
                  color: s.subTone || 'var(--text-muted)', ...NUM,
                }}>{s.sub}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The small caption that names the group below it. */
export function SectionCaption({ children, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 10, margin: '10px 4px 8px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{children}</span>
      {action}
    </div>
  );
}

/** The white rounded container that holds InsetRow children. */
export function InsetGroup({ children, ...rest }) {
  return (
    <div {...rest} style={{
      background: 'var(--surface)', borderRadius: 16, overflow: 'hidden',
      boxShadow: 'var(--shadow-card)',
    }}>
      {children}
    </div>
  );
}

/** The 30×30 leading chip: an <Icon> on a colour, or a rank number. */
function RowChip({ icon, iconBg, rank }) {
  if (rank != null) {
    return (
      <span style={{
        width: 30, height: 30, borderRadius: 8, flex: 'none',
        display: 'grid', placeItems: 'center',
        background: 'var(--fill)', color: 'var(--text-secondary)',
        fontSize: 14, fontWeight: 700, ...NUM,
      }}>{rank}</span>
    );
  }
  if (!icon) return null;
  return (
    <span style={{
      width: 30, height: 30, borderRadius: 8, flex: 'none',
      display: 'grid', placeItems: 'center',
      background: iconBg || 'var(--fill)',
      color: iconBg ? 'var(--text-inverse)' : 'var(--text-secondary)',
    }}>
      <Icon name={icon} size={17} strokeWidth={1.8} />
    </span>
  );
}

/**
 * One row of a grouped-inset list.
 *
 * `onActivate` turns the row into a real <button> so Enter/Space, focus-visible
 * and the accessible name all come from the platform — the name is the visible
 * title, so no aria-label is invented.
 */
export function InsetRow({
  icon, iconBg, rank, title, subtitle, below,
  value, valueSub, valueTone, valueSubTone,
  onActivate, chevron, first = false, ...rest
}) {
  const body = (
    <>
      <RowChip icon={icon} iconBg={iconBg} rank={rank} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 16, fontWeight: 500,
          letterSpacing: '-0.01em', color: 'var(--text-primary)',
        }}>{title}</span>
        {subtitle != null && (
          <span style={{
            display: 'block', fontSize: 13, color: 'var(--text-secondary)',
            marginTop: 1, lineHeight: 1.45, ...NUM,
          }}>{subtitle}</span>
        )}
        {below}
      </span>
      {value != null && (
        <span style={{ flex: 'none', textAlign: 'right' }}>
          <span style={{
            display: 'block', fontSize: 16, fontWeight: 600,
            color: valueTone || 'var(--text-primary)', ...NUM,
          }}>{value}</span>
          {valueSub != null && (
            <span style={{
              display: 'block', fontSize: 12, fontWeight: 500,
              color: valueSubTone || 'var(--text-muted)', ...NUM,
            }}>{valueSub}</span>
          )}
        </span>
      )}
      {chevron && (
        <span style={{ flex: 'none', color: 'var(--ink-4)', display: 'flex' }}>
          <Icon name="chevron" size={14} strokeWidth={2} />
        </span>
      )}
    </>
  );

  const frame = {
    display: 'flex', alignItems: 'center', gap: 13, width: '100%',
    padding: '13px 16px', textAlign: 'left',
    borderTop: first ? 'none' : HAIRLINE,
  };

  if (!onActivate) {
    return <div {...rest} style={frame}>{body}</div>;
  }
  return (
    <button {...rest} type="button" onClick={onActivate} className="focus-ring"
      style={{
        ...frame, background: 'transparent', border: 0,
        font: 'inherit', color: 'inherit', cursor: 'pointer',
      }}>
      {body}
    </button>
  );
}

/** The thin progress rail under a row's subtitle. */
export function RowBar({ pct, color }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <span style={{
      display: 'block', height: 5, borderRadius: 3, marginTop: 7,
      background: 'var(--fill-2)', overflow: 'hidden',
    }}>
      <span style={{
        display: 'block', height: '100%', width: `${w}%`, borderRadius: 3,
        background: color || 'var(--accent)',
      }} />
    </span>
  );
}

const PILL_TONES = {
  ok:    { bg: 'var(--success-soft)', fg: 'var(--success)' },
  bad:   { bg: 'var(--danger-soft)',  fg: 'var(--danger)' },
  warn:  { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  info:  { bg: 'var(--accent-tint)',  fg: 'var(--accent-strong)' },
  muted: { bg: 'var(--fill)',         fg: 'var(--text-secondary)' },
};

/** A small status pill. `info` is the blue "กรอกเพิ่ม" treatment. */
export function Pill({ tone = 'muted', children, ...rest }) {
  const c = PILL_TONES[tone] || PILL_TONES.muted;
  return (
    <span {...rest} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
      background: c.bg, color: c.fg, marginRight: 5,
    }}>{children}</span>
  );
}
