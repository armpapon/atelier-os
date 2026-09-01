import { useMemo } from 'react';
import {
  totalInterestBurn, payoffPriority, rolloverOpportunities,
  creditCardDeadline, dataGaps,
} from '../../lib/debtAdvice.js';
import { Icon } from '../Icon.jsx';
import { SectionCaption, InsetGroup, InsetRow, Pill } from './InsetList.jsx';

// ── Reason-tag → Thai copy. The lib emits fact-derived tags; the words live
//    here so the component owns all the language. ─────────────────────────────
const REASON_TEXT = {
  'highest-rate':       'โปะก่อน: อัตราดอกสูงสุดในพอร์ต',
  'second-rate':        'อันดับถัดไปเมื่อก้อนบนจบ',
  'low-rate-no-rush':   'อัตราต่ำสุด — ไม่ต้องเร่งโปะ เอาเงินไปปิดก้อนดอกสูงคุ้มกว่า',
  'credit-card-bureau': 'ปลดหนี้บัตรช่วยลดสัดส่วนใช้วงเงิน ดีต่อเครดิตบูโร',
};

const MAX_PRIORITY_ROWS = 4;

function baht(n) {
  return '฿' + Number(n || 0).toLocaleString('th', { maximumFractionDigits: 0 });
}

// The rate on the right reads as a cost signal: dear is red, mid is amber,
// the cheapest money in the port is green (nothing to rush).
function rateTone(p, lowestRate) {
  if (p.rate >= 12) return 'var(--danger)';
  if (p.reasonTags.includes('low-rate-no-rush') || p.rate === lowestRate) return 'var(--success)';
  return 'var(--warning)';
}

const NOTE = {
  fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55,
  padding: '10px 6px 0', fontVariantNumeric: 'tabular-nums',
};

// ════════════════════════════════════════════════════════════════════════════
//  Debt Advice — the ลำดับโปะ list at the top of the หนี้ tab, above the
//  Money Planner. Pure read over `debts` for the current scope; renders nothing
//  when there is no computable signal at all (so an empty scope stays clean).
//
//  v4.59 (True Cupertino phase 3): the card became a grouped-inset list whose
//  RANK NUMBER is the point — 1 is the debt to attack first. Every figure still
//  comes from src/lib/debtAdvice.js untouched; only the markup changed.
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

  // Gap-only scope → just the fill-in-your-data prompt, in the blue "กรอกเพิ่ม"
  // treatment. There is no honest number to headline yet, so none is shown.
  if (!hasComputedSignal) {
    return (
      <div data-debt-advice data-debt-advice-compact style={{ marginBottom: 14 }}>
        <SectionCaption>ลำดับโปะ</SectionCaption>
        <InsetGroup>
          <InsetRow
            first
            icon="help" iconBg="var(--accent)"
            title={`ข้อมูลหนี้ยังไม่ครบ ${gaps.count} ก้อน`}
            subtitle={`${gaps.debts.join(', ')} ยังไม่ได้กรอกดอก/ยอด`}
            below={
              <span data-gap-note style={{ display: 'block', marginTop: 6 }}>
                <Pill tone="info">กรอกเพิ่มเพื่อเข้าแผนโปะ</Pill>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  ข้อมูลหนี้ยังไม่ครบ {gaps.count} ก้อน — {gaps.debts.join(', ')} ยังไม่ได้กรอกดอก/ยอด
                  {' '}· กรอกอัตราดอกเบี้ยและยอดคงเหลือในตารางหนี้ด้านล่าง แล้วคำแนะนำจะคำนวณให้
                </span>
              </span>
            }
          />
        </InsetGroup>
      </div>
    );
  }

  const shownPriority = priority.slice(0, MAX_PRIORITY_ROWS);
  const overflowCount = Math.max(0, priority.length - MAX_PRIORITY_ROWS);
  const lowestRate = priority.length ? Math.min(...priority.map(p => p.rate)) : 0;

  return (
    <div data-debt-advice style={{ marginBottom: 14 }}>
      <SectionCaption
        action={
          burn.perMonth > 0 ? (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              เผา <b data-burn-permonth style={{ color: 'var(--danger)' }}>{baht(burn.perMonth)}</b>/เดือน
            </span>
          ) : null
        }>
        ลำดับโปะ — ดอกแพงก่อน (avalanche)
      </SectionCaption>

      {shownPriority.length > 0 && (
        <InsetGroup>
          {shownPriority.map((p, i) => (
            <PriorityRow key={p.debt.id} p={p} first={i === 0}
              lowestRate={lowestRate} deadline={deadline} />
          ))}
          {overflowCount > 0 && (
            <InsetRow
              data-prio-overflow
              title={`และอีก ${overflowCount} ก้อน`}
              subtitle="ดอกเบี้ยต่ำกว่าสี่ก้อนบน — ดูรายละเอียดในรายการหนี้ด้านล่าง"
            />
          )}
        </InsetGroup>
      )}

      {/* The burn, said in full — the number the list above is trying to kill */}
      {burn.perMonth > 0 && (
        <div style={NOTE}>
          เท่ากับ <b style={{ color: 'var(--text-primary)' }}>~{baht(burn.perYear)}/ปี</b> ที่หายไปกับดอกล้วน ๆ —
          ทุกบาทที่โปะต้นเงินก้อนดอกสูง ลดตัวเลขนี้ทันที
          {gaps.count > 0 && ' · ตัวเลขจริงสูงกว่านี้ เพราะยังมีหนี้ที่ยังไม่ได้กรอกดอก/ยอด'}
        </div>
      )}

      {/* Rollover wins — one per near-done debt */}
      {rollovers.map((o) => (
        <div key={o.debt.id} data-rollover style={NOTE}>
          <Pill tone="ok"><Icon name="bulb" size={12} /> โอกาสใกล้ตัว</Pill>
          {o.debt.name} เหลืออีก ~{o.monthsLeft} งวด จะปลดล็อกเงิน{' '}
          <b style={{ color: 'var(--text-primary)' }}>{baht(o.freesPerMonth)}/เดือน</b> — เอาไปทบโปะก้อนดอกสูง
        </div>
      ))}

      {/* Credit-card minimum-payment scenario (dated — see MIN_PAYMENT_RISE).
          The pill on each card row above points here; this is the arithmetic. */}
      {deadline && (
        <div data-deadline style={NOTE}>
          <Pill tone="warn"><Icon name="clock" size={12} /> ขั้นต่ำบัตร</Pill>
          เกณฑ์ขั้นต่ำ {deadline.fromPct}% มีผลถึง 31 ธ.ค. 2569 — หากปี 2570 กลับสู่เกณฑ์ปกติ
          {' '}{deadline.toPct}% ยอดขั้นต่ำจะขยับจาก ~{baht(deadline.currentMinTotal)} เป็น{' '}
          <b style={{ color: 'var(--text-primary)' }}>~{baht(deadline.futureMinTotal)}/เดือน</b>
          {' '}วางแผนโปะให้จบก่อนถึงตอนนั้น · ตรวจแหล่ง ธปท. ส.ค. 2569 · ทบทวนก่อน {deadline.effectiveLabel}
        </div>
      )}

      {/* Data-gap prompt — blue, not red: this is an invitation, not a fault */}
      {gaps.count > 0 && (
        <div data-gap-note style={NOTE}>
          <Pill tone="info">กรอกเพิ่ม</Pill>
          ข้อมูลยังไม่ครบ {gaps.count} ก้อน — {gaps.debts.join(', ')} ยังไม่ได้กรอกดอก/ยอด
          {' '}ทำให้ตัวเลข "ดอกที่จ่ายอยู่" จริงสูงกว่านี้ · กรอกเพิ่มในตารางหนี้ด้านล่างเพื่อให้คำแนะนำแม่นขึ้น
        </div>
      )}
    </div>
  );
}

// ── One ranked row: the rank chip is the message, the rate is the price ──────
function PriorityRow({ p, first, lowestRate, deadline }) {
  const why = p.reasonTags.map(t => REASON_TEXT[t]).filter(Boolean).join(' · ');
  const isCard = p.debt.type === 'credit_card';
  return (
    <InsetRow
      data-prio-row data-prio-rank={p.rank}
      first={first}
      rank={p.rank}
      title={<span data-prio-name>{p.debt.name}</span>}
      subtitle={
        <>
          {baht(p.balance)} · เผา {baht(p.monthlyInterest)}/เดือน
          {why && ` — ${why}`}
        </>
      }
      below={
        (isCard && deadline) || p.reasonTags.includes('credit-card-bureau') ? (
          <span style={{ display: 'block', marginTop: 5 }}>
            {isCard && deadline && <Pill tone="warn">ขั้นต่ำขึ้น {deadline.effectiveLabel}</Pill>}
            {p.reasonTags.includes('credit-card-bureau') && <Pill tone="info">ดีต่อบูโร</Pill>}
          </span>
        ) : null
      }
      value={`${p.rate.toFixed(2)}%`}
      valueTone={rateTone(p, lowestRate)}
    />
  );
}
