import { useMemo } from 'react';
import {
  totalInterestBurn, payoffPriority, rolloverOpportunities,
  creditCardDeadline, dataGaps,
} from '../../lib/debtAdvice.js';
import { Icon } from '../Icon.jsx';

// ── Reason-tag → Thai copy. The lib emits fact-derived tags; the words live
//    here so the component owns all the language. ─────────────────────────────
const REASON_TEXT = {
  'highest-rate':       'โปะก่อน: อัตราดอกสูงสุดในพอร์ต',
  'second-rate':        'อันดับถัดไปเมื่อก้อนบนจบ',
  'low-rate-no-rush':   'อัตราต่ำสุด — ไม่ต้องเร่งโปะ เอาเงินไปปิดก้อนดอกสูงคุ้มกว่า',
  'credit-card-bureau': 'ปลดหนี้บัตรช่วยลดสัดส่วนใช้วงเงิน ดีต่อเครดิตบูโร',
};

const MAX_PRIORITY_ROWS = 3;

function baht(n) {
  return '฿' + Number(n || 0).toLocaleString('th', { maximumFractionDigits: 0 });
}

// Rank chip palette — mirrors the mockup: r1 danger, r2 warning, r3+ neutral.
function rankTone(rank) {
  if (rank === 1) return { bg: 'var(--danger-soft)',  fg: 'var(--danger)' };
  if (rank === 2) return { bg: 'var(--warning-soft)', fg: 'var(--accent-strong)' };
  return { bg: 'var(--fill)', fg: 'var(--text-secondary)' };
}

const SECT_LBL = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'
};

const HAIRLINE = '1px solid var(--hairline)';

// ════════════════════════════════════════════════════════════════════════════
//  Debt Advice — computed card at the top of the หนี้ tab, above DebtTracker.
//  Pure read over `debts` for the current scope; renders nothing when there is
//  no computable signal at all (so an empty scope stays clean).
// ════════════════════════════════════════════════════════════════════════════
export function DebtAdvice({ debts }) {
  const advice = useMemo(() => {
    const priority  = payoffPriority(debts);
    const burn      = totalInterestBurn(debts);
    const rollovers = rolloverOpportunities(debts);
    const deadline  = creditCardDeadline(debts);
    const gaps      = dataGaps(debts);
    return { priority, burn, rollovers, deadline, gaps };
  }, [debts]);

  const { priority, burn, rollovers, deadline, gaps } = advice;

  // Something computable to show: a payoff ranking, a live burn figure, a
  // rollover, or the credit-card deadline. Gaps ALONE also earn a render — a
  // scope of all-incomplete debts still needs the prompt to fill them in.
  const hasComputedSignal =
    priority.length || burn.perMonth || rollovers.length || deadline;
  if (!hasComputedSignal && !gaps.count) return null;

  // Gap-only scope → a compact card that is just the fill-in-your-data prompt,
  // with no burn headline (there's no honest number to headline yet).
  if (!hasComputedSignal) {
    return (
      <div
        data-debt-advice
        data-debt-advice-compact
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
          padding: 18, marginBottom: 14,
        }}
      >
        <div data-gap-note style={{
          fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <b style={{ color: 'var(--text-secondary)' }}>ข้อมูลหนี้ยังไม่ครบ {gaps.count} ก้อน</b> — {gaps.debts.join(', ')} ยังไม่ได้กรอกดอก/ยอด
          {' '}· กรอกอัตราดอกเบี้ยและยอดคงเหลือในตารางหนี้ด้านล่าง แล้วคำแนะนำจะคำนวณให้
        </div>
      </div>
    );
  }

  const shownPriority = priority.slice(0, MAX_PRIORITY_ROWS);
  const overflowCount = Math.max(0, priority.length - MAX_PRIORITY_ROWS);

  return (
    <div
      data-debt-advice
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-card)',
        padding: 22, marginBottom: 14,
      }}
    >
      {/* Headline burn */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap',
        borderBottom: HAIRLINE, paddingBottom: 16, marginBottom: 16,
      }}>
        <div>
          <div style={SECT_LBL}>ดอกเบี้ยที่จ่ายอยู่ (ต่อเดือน)</div>
          <div data-burn-permonth style={{
            fontFamily: 'var(--f-display)', fontSize: 32, fontWeight: 800,
            letterSpacing: '-0.01em', color: 'var(--danger)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.15,
          }}>{baht(burn.perMonth)}</div>
        </div>
        <div style={{ flexBasis: '100%', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          เท่ากับ <b style={{ color: 'var(--text-primary)' }}>~{baht(burn.perYear)}/ปี</b> ที่หายไปกับดอกล้วน ๆ —
          ทุกบาทที่โปะต้นเงินก้อนดอกสูง ลดตัวเลขนี้ทันที
          {gaps.count > 0 && ' · ตัวเลขจริงสูงกว่านี้ เพราะยังมีหนี้ที่ยังไม่ได้กรอกดอก/ยอด'}
        </div>
      </div>

      {/* Ranked payoff priority */}
      {shownPriority.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ ...SECT_LBL, marginBottom: 10 }}>
            ลำดับที่ควรโปะก่อน · เรียงตามอัตราดอกเบี้ย
          </div>
          {shownPriority.map((p) => (
            <PriorityRow key={p.debt.id} p={p} />
          ))}
          {overflowCount > 0 && (
            <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-muted)',
              padding: '10px 0 2px'
            }}>
              และอีก {overflowCount} ก้อน
            </div>
          )}
        </div>
      )}

      {/* Rollover wins — one per near-done debt */}
      {rollovers.map((o) => (
        <Callout key={o.debt.id} tone="win" icon={<Icon name="bulb" size={15} />} data-rollover>
          <b>โอกาสใกล้ตัว:</b> {o.debt.name} เหลืออีก ~{o.monthsLeft} งวด
          จะปลดล็อกเงิน <b>{baht(o.freesPerMonth)}/เดือน</b> — เอาไปทบโปะก้อนดอกสูง
        </Callout>
      ))}

      {/* Credit-card minimum-payment scenario (dated — see MIN_PAYMENT_RISE) */}
      {deadline && (
        <Callout tone="warn" icon={<Icon name="clock" size={15} />} data-deadline>
          <b>ขั้นต่ำบัตร (มาตรการชั่วคราว):</b> เกณฑ์ขั้นต่ำ {deadline.fromPct}% มีผลถึง 31 ธ.ค. 2569 —
          หากปี 2570 กลับสู่เกณฑ์ปกติ {deadline.toPct}% ยอดขั้นต่ำจะขยับจาก ~{baht(deadline.currentMinTotal)}
          {' '}เป็น <b>~{baht(deadline.futureMinTotal)}/เดือน</b> วางแผนโปะให้จบก่อนถึงตอนนั้น
          <div style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            marginTop: 6, fontSize: 13, color: 'var(--text-muted)'
          }}>
            ตรวจแหล่ง ธปท. ส.ค. 2569 · ทบทวนก่อน {deadline.effectiveLabel}
          </div>
        </Callout>
      )}

      {/* Data-gap note */}
      {gaps.count > 0 && (
        <div data-gap-note style={{
          marginTop: 16, paddingTop: 14, borderTop: HAIRLINE,
          fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
        }}>
          <b style={{ color: 'var(--text-secondary)' }}>ข้อมูลยังไม่ครบ {gaps.count} ก้อน</b> — {gaps.debts.join(', ')} ยังไม่ได้กรอกดอก/ยอด
          ทำให้ตัวเลข "ดอกที่จ่ายอยู่" จริงสูงกว่านี้ · กรอกเพิ่มในตารางหนี้ด้านล่างเพื่อให้คำแนะนำแม่นขึ้น
        </div>
      )}
    </div>
  );
}

// ── One ranked priority row: rank chip · name · figures · pills + why ─────────
function PriorityRow({ p }) {
  const tone = rankTone(p.rank);
  const why = p.reasonTags.map(t => REASON_TEXT[t]).filter(Boolean).join(' · ');

  return (
    <div data-prio-row data-prio-rank={p.rank} style={{
      display: 'flex', gap: 12, padding: '13px 0', borderBottom: HAIRLINE,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 999, flex: 'none',
        display: 'grid', placeItems: 'center',
        fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700,
        background: tone.bg, color: tone.fg,
      }}>{p.rank}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 10,
          alignItems: 'baseline', flexWrap: 'wrap',
        }}>
          <div data-prio-name style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)' }}>
            {p.debt.name}
          </div>
          <div style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap'
          }}>
            {baht(p.balance)} · ดอก <b style={{ color: 'var(--danger)' }}>{baht(p.monthlyInterest)}/ด</b>
          </div>
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <Pill tone={p.rank === 1 ? 'rate' : p.rank === 2 ? 'rate2' : 'muted'}>
            ดอก {p.rate.toFixed(2)}%
          </Pill>
          {p.reasonTags.includes('credit-card-bureau') && (
            <Pill tone="bureau">ดีต่อบูโร</Pill>
          )}
          {why}
        </div>
      </div>
    </div>
  );
}

function Pill({ tone, children }) {
  const map = {
    rate:   { bg: 'var(--danger-soft)',  fg: 'var(--danger)' },
    rate2:  { bg: 'var(--warning-soft)', fg: 'var(--accent-strong)' },
    bureau: { bg: 'var(--accent-tint)',  fg: 'var(--accent-strong)' },
    muted:  { bg: 'var(--fill)',         fg: 'var(--text-secondary)' },
  };
  const c = map[tone] || map.muted;
  return (
    <span style={{
      display: 'inline-block', fontSize: 10.5, fontWeight: 600, borderRadius: 999,
      padding: '1px 8px', marginRight: 5, background: c.bg, color: c.fg,
    }}>{children}</span>
  );
}

function Callout({ tone, icon, children, ...rest }) {
  const bg = tone === 'win' ? 'var(--success-soft)'
    : tone === 'warn' ? 'var(--warning-soft)'
    : 'var(--background-soft)';
  const border = tone === 'win' || tone === 'warn' ? 'transparent' : 'var(--hairline)';
  return (
    <div {...rest} style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      background: bg, border: `1px solid ${border}`,
      borderRadius: 12, padding: '11px 13px', marginTop: 10,
    }}>
      <span style={{ fontSize: 15, flex: 'none' }}>{icon}</span>
      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}
