/**
 * บัตรเครดิต — the card grid inside the Finance page's "บัตรเครดิต" tab.
 *
 * Everything numeric comes from src/lib/creditCards.js (pure, pinned in
 * audit/cases.mjs). This file only decides what a number LOOKS like.
 *
 * Two deliberate behaviours:
 *   · The table is created by a migration the owner runs by hand, so a deploy
 *     can land before the SQL does. `missing` is a calm setup notice, never an
 *     error card and never a crash.
 *   · A card linked to a debt row shows the DEBT's remaining balance, read
 *     from the list FinanceView already loaded. Nothing is refetched here.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardHeader, Badge, Button, EmptyState } from '../ui/index.js';
import {
  listCreditCards, createCreditCard, updateCreditCard, deleteCreditCard,
} from '../../lib/api/creditCards.js';
import {
  utilizationPct, waiverStatus, nextCycleDates, monthlyInterestEstimate,
  cardBalance, summarizeCards, sortCards, feeProfileRows, installmentRows,
  cycleDateLabel, cycleDayLabel, baht, isCancelled, safeHttpUrl, safeFaceUrl,
  HEALTHY_UTILIZATION, DEFAULT_INTEREST_RATE,
} from '../../lib/creditCards.js';

// ── Tokens shared by every block in this file ────────────────────────────────
const MONO_LABEL = {
  fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: 'var(--text-muted)',
};
const FACT_BOX = {
  background: 'var(--background-soft)', border: '1px solid var(--hairline)',
  borderRadius: 12, padding: '10px 12px',
};
const INPUT = {
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-control)', padding: '8px 11px',
  color: 'var(--text-primary)', fontSize: 12.5, width: '100%',
  fontFamily: 'var(--f-body)',
};

/** Issuer → the colour of its little plastic chip. Unknown issuers get accent. */
const ISSUER_TONES = {
  kbank: '#0a7f42', kasikorn: '#0a7f42', กสิกร: '#0a7f42',
  cardx: '#5b4b8a', scb: '#5b4b8a', ไทยพาณิชย์: '#5b4b8a',
  ktc: '#00437a', กรุงไทย: '#00437a', krungthai: '#00437a',
  citi: '#1a63a8', uob: '#1a3c6e', bbl: '#00398d', กรุงเทพ: '#00398d',
  ttb: '#2a5caa', krungsri: '#8a6a2b', กรุงศรี: '#8a6a2b', aeon: '#a8752f',
};
function chipTone(card) {
  const hay = `${card?.issuer || ''} ${card?.name || ''}`.toLowerCase();
  const hit = Object.keys(ISSUER_TONES).find(k => hay.includes(k));
  return hit ? ISSUER_TONES[hit] : 'var(--accent-strong)';
}
function chipLabel(card) {
  const src = (card?.issuer || card?.name || '?').trim();
  return src.split(/\s+/)[0].slice(0, 6).toUpperCase();
}

/**
 * The real plastic, at the size the approved mockup drew it. Height is left to
 * the image so an issuer's odd aspect ratio is never squashed, and the two-layer
 * shadow is the same warm ink the rest of the page casts.
 */
const CARD_FACE = {
  width: 104, height: 'auto', flex: 'none', borderRadius: 8,
  border: '1px solid var(--hairline)',
  boxShadow: '0 1px 2px rgba(74, 61, 43, 0.10), 0 5px 14px rgba(74, 61, 43, 0.18)',
};

const utilTone = (pct) =>
  pct == null ? 'var(--text-muted)'
    : pct >= 70 ? 'var(--danger)'
      : pct > HEALTHY_UTILIZATION ? 'var(--warning)'
        : 'var(--success)';

/** The shared utilisation track: fill + the 30% bureau tick. */
function UtilBar({ pct, showTickLabel = false, height = 8 }) {
  const width = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div style={{
      position: 'relative', height, borderRadius: 999,
      background: 'var(--surface-muted)', marginTop: showTickLabel ? 16 : 10,
    }}>
      <div style={{
        position: 'absolute', inset: '0 auto 0 0', width: `${width}%`,
        borderRadius: 999, background: utilTone(pct),
      }} />
      <div style={{
        position: 'absolute', left: `${HEALTHY_UTILIZATION}%`, top: -3, bottom: -3,
        width: 2, background: 'var(--text-primary)', opacity: 0.45, borderRadius: 2,
      }}>
        {showTickLabel && (
          <span style={{
            position: 'absolute', top: -15, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--text-muted)',
            letterSpacing: '0.05em', whiteSpace: 'nowrap',
          }}>30%</span>
        )}
      </div>
    </div>
  );
}

/** One tile in the four-across summary strip. */
function Stat({ label, value, sub, tone = 'var(--text-primary)', children }) {
  return (
    <Card padding={18}>
      <div style={{ ...MONO_LABEL, marginBottom: 8 }}>{label}</div>
      <div style={{
        fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums', color: tone,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.6 }}>{sub}</div>}
      {children}
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Summary strip
// ════════════════════════════════════════════════════════════════════════════
function SummaryStrip({ summary, isMobile }) {
  const {
    utilization, balance, limit, revolvingBalance, revolvingCount,
    monthlyInterest, watchCards, annualFeeAtRisk, nextStatement, nextDue,
  } = summary;

  return (
    <div style={{
      display: 'grid', gap: 14,
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(210px, 1fr))',
    }}>
      <Stat
        label="ใช้วงเงินรวม (Bureau)"
        value={utilization == null ? '—' : `${utilization.toFixed(1)}%`}
        tone={utilTone(utilization)}
        sub={limit > 0
          ? `${Math.round(balance).toLocaleString('en-US')} / ${Math.round(limit).toLocaleString('en-US')}฿ · เส้น 30% คือเกณฑ์สุขภาพเครดิตบูโร`
          : 'ยังไม่ได้ใส่วงเงินของบัตรใบไหน'}
      >
        <UtilBar pct={utilization} />
      </Stat>

      <Stat
        label="ยอดที่ยังกินดอก"
        value={baht(revolvingBalance)}
        tone={revolvingBalance > 0 ? 'var(--danger)' : 'var(--success)'}
        sub={revolvingCount > 0
          ? <>{revolvingCount} ใบ · ดอก ~<b style={{ color: 'var(--danger)' }}>{baht(monthlyInterest)}/เดือน</b> @{Math.round(DEFAULT_INTEREST_RATE * 100)}%</>
          : 'ทุกใบจ่ายเต็ม ไม่มีดอกเบี้ยเดินอยู่ ✓'}
      />

      <Stat
        label="ค่าธรรมเนียมเฝ้าระวัง"
        value={baht(annualFeeAtRisk)}
        tone={watchCards.length ? 'var(--accent-strong)' : 'var(--text-primary)'}
        sub={watchCards.length
          ? <>เฝ้า {watchCards.length} ใบ: {watchCards.map((c, i) => {
            const w = waiverStatus(c);
            return (
              <span key={c.id}>
                {i > 0 && ' · '}
                <span style={{ color: 'var(--accent-strong)' }}>
                  {c.name} {w.mode === 'count'
                    ? `${w.progress}/${w.target} ครั้ง`
                    : `${Math.round(w.progress).toLocaleString('en-US')}/${Math.round(w.target).toLocaleString('en-US')}฿`}
                </span>
              </span>
            );
          })}</>
          : 'ไม่มีใบไหนติดเงื่อนไขค้างอยู่ ✓'}
      />

      <Stat
        label="บิลถัดไป"
        value={nextStatement ? cycleDayLabel(nextStatement.date) : '—'}
        sub={nextStatement
          ? <>{nextStatement.card.name} สรุปยอด{nextDue ? ` · ครบกำหนด ${cycleDayLabel(nextDue.date)}` : ''}</>
          : 'ยังไม่ได้ใส่วันสรุปยอดของบัตรใบไหน'}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  One card
// ════════════════════════════════════════════════════════════════════════════
function CreditCardBlock({ card, debts, today, onEdit, onDelete }) {
  const cancelled = isCancelled(card);
  const balance   = cardBalance(card, debts);
  const pct       = utilizationPct(balance, card.credit_limit);
  const waiver    = waiverStatus(card);
  const cycle     = nextCycleDates(card.statement_day, card.due_day, today);
  const interest  = monthlyInterestEstimate(balance);
  const fees      = feeProfileRows(card);
  const insts     = installmentRows(card);
  const linkedDebt = card.debt_id ? (debts || []).find(d => d.id === card.debt_id) : null;
  // Only an http(s) address becomes a link. A row saved before v4.40 (or edited
  // straight in the database) can still hold `javascript:` — it renders as no
  // anchor at all rather than as a clickable trap.
  const botUrl    = safeHttpUrl(card.fee_profile?.bot_url);
  // The real card face, when the row has a usable one. Same gate as the ธปท.
  // link plus same-origin paths, so `/cards/ktc-chula.png` renders and
  // `//evil.com/x.png` does not — that one is a foreign host wearing a slash.
  const faceUrl   = safeFaceUrl(card.face_url);

  const meta = [
    card.scope === 'family' ? 'ครอบครัว' : 'ส่วนตัว',
    card.opened_note,
    card.network,
    linkedDebt ? `เชื่อมกับหนี้ “${linkedDebt.name}”` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Card padding={20} style={{
      display: 'flex', flexDirection: 'column', gap: 14,
      opacity: cancelled ? 0.62 : 1,
    }}>
      {/* ── head ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        {/* The plastic itself when we have a picture of it; the coloured
            monogram — unchanged since v4.36 — for every card that has none.
            A cancelled card needs no special case: the whole block is dimmed
            by the `opacity` on the <Card> above, image included. */}
        {faceUrl
          ? <img src={faceUrl} alt={card.name} style={CARD_FACE} />
          : <div style={{
            width: 44, height: 32, borderRadius: 7, flex: 'none',
            display: 'grid', placeItems: 'center', color: '#fff',
            background: cancelled ? 'var(--text-muted)' : chipTone(card),
            fontFamily: 'var(--f-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
          }}>{chipLabel(card)}</div>}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            {card.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {card.issuer ? `${card.issuer}${meta ? ' · ' : ''}` : ''}{meta}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flex: 'none' }}>
          {cancelled
            ? <Badge tone="neutral">ยกเลิกแล้ว</Badge>
            : card.pays_full === false
              ? <Badge tone="danger">ยังกินดอก</Badge>
              : <Badge tone="success">จ่ายเต็ม · ปลอดดอก</Badge>}
          <div style={{ display: 'flex', gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={() => onEdit(card)}
              ariaLabel={`แก้ไข ${card.name}`}>แก้ไข</Button>
            <Button variant="danger" size="sm" onClick={() => onDelete(card)}
              ariaLabel={`ลบ ${card.name}`}>ลบ</Button>
          </div>
        </div>
      </div>

      {/* ── utilisation ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px' }}>
          <span style={MONO_LABEL}>ใช้วงเงิน</span>
          <span style={{
            fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', color: utilTone(pct),
          }}>
            {pct == null
              ? `${Math.round(balance).toLocaleString('en-US')}฿ · ยังไม่ได้ใส่วงเงิน`
              : `${pct.toFixed(0)}% · ${Math.round(balance).toLocaleString('en-US')} / ${Math.round(Number(card.credit_limit)).toLocaleString('en-US')}฿`}
          </span>
        </div>
        <UtilBar pct={pct} />
      </div>

      {/* ── waiver / interest box ────────────────────────────────────────── */}
      {card.pays_full === false && balance > 0 ? (
        <div style={{ ...FACT_BOX, background: 'var(--danger-soft)', borderColor: 'transparent' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...MONO_LABEL, color: 'var(--danger)' }}>ดอกเบี้ยเดือนนี้ (ประมาณ)</span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
              ~{baht(interest)}
            </span>
          </div>
          {card.annual_fee_note && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{card.annual_fee_note}</div>
          )}
        </div>
      ) : (
        <WaiverBox card={card} waiver={waiver} />
      )}

      {/* ── statement / due ──────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <div style={FACT_BOX}>
          <div style={MONO_LABEL}>สรุปยอด</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {card.statement_day ? `ทุกวันที่ ${card.statement_day}` : 'ยังไม่ได้ใส่'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {cycle.statement ? `รอบถัดไป ${cycleDateLabel(cycle.statement)}` : '—'}
          </div>
        </div>
        <div style={FACT_BOX}>
          <div style={MONO_LABEL}>ครบกำหนดจ่าย</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            {card.due_day ? `ทุกวันที่ ${card.due_day}` : 'ยังไม่ได้ใส่'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {cycle.due ? `งวดถัดไป ${cycleDateLabel(cycle.due)}` : '—'}
          </div>
        </div>
      </div>

      {/* ── instalments ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ ...MONO_LABEL, marginBottom: 8 }}>ผ่อน 0% ที่วิ่งอยู่</div>
        {insts.length === 0 ? (
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)',
            borderRadius: 12, padding: '9px 12px',
          }}>— ไม่มีผ่อน 0% ค้างอยู่ —</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insts.map(row => (
              <div key={row.key} style={{
                border: '1px dashed var(--border-strong)', borderRadius: 12,
                padding: '11px 12px', display: 'flex', justifyContent: 'space-between',
                gap: 10, alignItems: 'center',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    กินวงเงิน {baht(row.principal)} · งวดละ {baht(row.perMonth)}
                  </div>
                </div>
                {row.total > 0 && (
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 700,
                    color: 'var(--blue)', whiteSpace: 'nowrap',
                  }}>เหลือ {Math.max(0, row.total - row.paid)}/{row.total} งวด</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── fee profile ──────────────────────────────────────────────────── */}
      {(fees.length > 0 || botUrl || card.fee_profile?.bot_checked) && (
        <details style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10 }}>
          <summary style={{ ...MONO_LABEL, cursor: 'pointer' }}>
            โปรไฟล์ค่าธรรมเนียม (ธปท.)
          </summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 12.5 }}>
            <tbody>
              {fees.map(f => (
                <tr key={f.key}>
                  <td style={{ padding: '6px 0', borderBottom: '1px solid var(--hairline)', verticalAlign: 'top', color: 'var(--text-secondary)' }}>
                    {f.label}
                  </td>
                  <td style={{
                    padding: '6px 0', borderBottom: '1px solid var(--hairline)', verticalAlign: 'top',
                    textAlign: f.key === 'benefits' ? 'left' : 'right',
                    fontWeight: f.key === 'benefits' ? 400 : 600,
                    paddingLeft: 12, fontVariantNumeric: 'tabular-nums',
                  }}>{f.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, fontSize: 11, color: 'var(--text-muted)', gap: 10, flexWrap: 'wrap',
          }}>
            {botUrl
              ? <a href={botUrl} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--accent-strong)', fontWeight: 600, textDecoration: 'none', borderBottom: '1px solid var(--accent-soft)' }}>
                ตารางเปรียบเทียบ ธปท. ↗
              </a>
              : <span />}
            {card.fee_profile?.bot_checked && <span>✓ ตรวจกับ ธปท. แล้ว {card.fee_profile.bot_checked}</span>}
          </div>
        </details>
      )}
    </Card>
  );
}

/** ฟรีค่าธรรมเนียม — pips for a swipe count, a money bar for a spend target. */
function WaiverBox({ card, waiver }) {
  if (waiver.mode === 'none') {
    return (
      <div style={{ ...FACT_BOX, background: 'var(--success-soft)', borderColor: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ ...MONO_LABEL, color: 'var(--success)' }}>ค่าธรรมเนียมรายปี</span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, fontWeight: 700, color: 'var(--success)' }}>
            ฟรี ไม่มีเงื่อนไข ✓
          </span>
        </div>
      </div>
    );
  }

  const target = waiver.target;
  const feeText = card.annual_fee ? baht(card.annual_fee) : 'ค่าธรรมเนียมปีถัดไป';

  return (
    <div style={{ ...FACT_BOX, background: 'var(--warning-soft)', borderColor: 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={MONO_LABEL}>
          ตัวนับฟรีค่าธรรมเนียม{card.waiver_period_note ? ` · ${card.waiver_period_note}` : ''}
        </span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 700, color: waiver.met ? 'var(--success)' : 'var(--accent-strong)' }}>
          {waiver.mode === 'count'
            ? `${waiver.progress}/${target || '?'} ครั้ง`
            : `${Math.round(waiver.progress).toLocaleString('en-US')} / ${target ? Math.round(target).toLocaleString('en-US') : '?'}฿`}
        </span>
      </div>

      {waiver.mode === 'count' && target > 0 && target <= 60 ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {Array.from({ length: Math.round(target) }, (_, i) => (
            <div key={i} style={{
              height: 8, flex: 1, borderRadius: 999,
              background: i < waiver.progress ? 'var(--accent)' : 'var(--surface-muted)',
              border: `1px solid ${i < waiver.progress ? 'var(--accent)' : 'var(--hairline)'}`,
            }} />
          ))}
        </div>
      ) : (
        <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--surface-muted)', marginTop: 8 }}>
          <div style={{
            position: 'absolute', inset: '0 auto 0 0', borderRadius: 999,
            width: `${waiver.pct == null ? 0 : Math.min(100, waiver.pct)}%`,
            background: waiver.met ? 'var(--success)' : 'var(--accent)',
          }} />
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
        {waiver.met
          ? <>ครบเงื่อนไขแล้ว ✓ ปีถัดไปฟรี</>
          : target > 0
            ? <>อีก <b style={{ color: 'var(--accent-strong)' }}>
              {waiver.mode === 'count'
                ? `${waiver.remaining} ครั้ง`
                : baht(waiver.remaining)}
            </b> ถึงฟรีค่าธรรมเนียมปีถัดไป {feeText}</>
            : <>ยังไม่ได้ใส่เป้าของเงื่อนไข — กด “แก้ไข” เพื่อกรอก</>}
        {card.annual_fee_note ? ` — ${card.annual_fee_note}` : ''}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Add / edit — CENTERED modal (Loop style: never a side drawer)
// ════════════════════════════════════════════════════════════════════════════
const BLANK = {
  name: '', issuer: '', network: '', face_url: '', status: 'active', pays_full: 'true',
  credit_limit: '', manual_balance: '', debt_id: '',
  statement_day: '', due_day: '', opened_note: '',
  waiver_mode: 'none', waiver_target: '', waiver_progress: '', waiver_period_note: '',
  annual_fee: '', annual_fee_note: '', sort_order: '',
  fp_annual_fee_display: '', fp_interest: '', fp_cash_advance: '', fp_fx: '',
  fp_benefits: '', fp_bot_url: '', fp_bot_checked: '',
};

function toForm(card) {
  if (!card) return { ...BLANK };
  const fp = card.fee_profile || {};
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    name: s(card.name), issuer: s(card.issuer), network: s(card.network),
    face_url: s(card.face_url),
    status: card.status || 'active',
    pays_full: card.pays_full === false ? 'false' : 'true',
    credit_limit: s(card.credit_limit), manual_balance: s(card.manual_balance),
    debt_id: s(card.debt_id),
    statement_day: s(card.statement_day), due_day: s(card.due_day),
    opened_note: s(card.opened_note),
    waiver_mode: card.waiver_mode || 'none',
    waiver_target: s(card.waiver_target), waiver_progress: s(card.waiver_progress),
    waiver_period_note: s(card.waiver_period_note),
    annual_fee: s(card.annual_fee), annual_fee_note: s(card.annual_fee_note),
    sort_order: s(card.sort_order),
    fp_annual_fee_display: s(fp.annual_fee_display), fp_interest: s(fp.interest),
    fp_cash_advance: s(fp.cash_advance), fp_fx: s(fp.fx), fp_benefits: s(fp.benefits),
    fp_bot_url: s(fp.bot_url), fp_bot_checked: s(fp.bot_checked),
  };
}

/** Everything inside the dialog the keyboard is allowed to land on. */
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function CardFormModal({ initial, scope, debts, onSaved, onClose }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const formRef = useRef(null);

  // Every exit is inert while the write is in flight (audited: DLG-FIN-001 ·
  // A2). Closing mid-save unmounts the only place a rejected write can report
  // itself, leaving the owner unable to tell whether the card was saved.
  const requestClose = useCallback(() => { if (!saving) onClose(); }, [saving, onClose]);

  // Esc closes — same affordance as every other Loop popup — and Tab cycles
  // INSIDE the dialog. The listener sits on window rather than on the form so
  // it still fires if focus has wandered out of the popup.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { requestClose(); return; }
      if (e.key !== 'Tab') return;
      const box = formRef.current;
      if (!box) return;
      const nodes = Array.from(box.querySelectorAll(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last  = nodes[nodes.length - 1];
      const here  = document.activeElement;
      const inside = box.contains(here);
      if (e.shiftKey ? (here === first || !inside) : (here === last || !inside)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // …and the keyboard goes back where it came from — the + เพิ่มบัตร tile or
  // the แก้ไข button that opened the popup — once the popup is gone. Captured
  // during the FIRST RENDER, before the form's own autoFocus moves it.
  const [opener] = useState(() => (typeof document !== 'undefined' ? document.activeElement : null));
  useEffect(() => () => {
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  }, [opener]);

  const numOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('ใส่ชื่อบัตร'); return; }
    setSaving(true); setError(null);
    try {
      const fee_profile = {};
      const put = (k, v) => { if (String(v).trim()) fee_profile[k] = String(v).trim(); };
      put('annual_fee_display', form.fp_annual_fee_display);
      put('interest', form.fp_interest);
      put('cash_advance', form.fp_cash_advance);
      put('fx', form.fp_fx);
      put('benefits', form.fp_benefits);
      // Only a real http(s) address is stored. A `javascript:` value typed here
      // is dropped rather than kept for the grid to render (A2).
      put('bot_url', safeHttpUrl(form.fp_bot_url) || '');
      put('bot_checked', form.fp_bot_checked);

      const payload = {
        scope,
        name: form.name.trim(),
        issuer: form.issuer.trim() || null,
        network: form.network.trim() || null,
        // Same gate the grid draws through, applied on the way IN: anything
        // that is not an app path or an http(s) address is stored as null
        // rather than kept for the card to try to render.
        face_url: safeFaceUrl(form.face_url),
        status: form.status,
        pays_full: form.pays_full === 'true',
        credit_limit: numOrNull(form.credit_limit),
        // A linked card reads its balance from the debt row, so the typed
        // figure is dropped rather than left to rot next to a live number.
        manual_balance: form.debt_id ? null : numOrNull(form.manual_balance),
        debt_id: form.debt_id || null,
        statement_day: numOrNull(form.statement_day),
        due_day: numOrNull(form.due_day),
        opened_note: form.opened_note.trim() || null,
        waiver_mode: form.waiver_mode,
        waiver_target: form.waiver_mode === 'none' ? null : numOrNull(form.waiver_target),
        waiver_progress: form.waiver_mode === 'none' ? 0 : (numOrNull(form.waiver_progress) ?? 0),
        waiver_period_note: form.waiver_period_note.trim() || null,
        annual_fee: numOrNull(form.annual_fee),
        annual_fee_note: form.annual_fee_note.trim() || null,
        fee_profile,
        sort_order: numOrNull(form.sort_order) ?? 0,
      };

      if (initial) await updateCreditCard(initial.id, payload);
      else await createCreditCard(payload);
      onSaved();
    } catch (err) {
      setError(err.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  // The hint sits OUTSIDE the <label> on purpose: inside, it would become part
  // of the field's accessible name ("วงเงิน (฿) ผูกกับหนี้อยู่ — …").
  const field = (label, node, hint) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={MONO_LABEL}>{label}</span>
        {node}
      </label>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
  const row = (children, cols = '1fr 1fr') => (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10 }}>{children}</div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={requestClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <form ref={formRef} onSubmit={submit} role="dialog" aria-modal="true"
        aria-label={initial ? 'แก้ไขบัตร' : 'เพิ่มบัตร'} style={{
        position: 'relative', width: '92vw', maxWidth: 620,
        maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-pop)', padding: 26,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={MONO_LABEL}>บัตรเครดิต</div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 600, marginTop: 3 }}>
              {initial ? 'แก้ไขบัตร' : 'เพิ่มบัตรใหม่'}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={requestClose} disabled={saving}>ปิด</Button>
        </div>

        {field('ชื่อบัตร', <input type="text" value={form.name} required autoFocus
          onChange={e => set('name', e.target.value)}
          placeholder="เช่น KBank PLUSTINUM" style={INPUT} />)}

        {row(<>
          {field('ผู้ออกบัตร', <input type="text" value={form.issuer}
            onChange={e => set('issuer', e.target.value)} placeholder="KBank" style={INPUT} />)}
          {field('เครือข่าย', <input type="text" value={form.network}
            onChange={e => set('network', e.target.value)} placeholder="Visa / Mastercard" style={INPUT} />)}
        </>)}

        {field('รูปหน้าบัตร (path หรือ https URL)', <input type="text" value={form.face_url}
          onChange={e => set('face_url', e.target.value)}
          placeholder="/cards/kbank-plustinum.png" style={INPUT} />,
        'ใส่ไฟล์ที่แอปมีอยู่แล้ว เช่น /cards/kbank-plustinum.png หรือที่อยู่เว็บ https://… — ค่าอื่นจะไม่ถูกบันทึก และการ์ดจะกลับไปใช้ตัวย่อสีเดิม')}

        {row(<>
          {field('สถานะ', <select value={form.status} onChange={e => set('status', e.target.value)} style={INPUT}>
            <option value="active">ใช้งานอยู่</option>
            <option value="cancelled">ยกเลิกแล้ว</option>
          </select>)}
          {field('การจ่าย', <select value={form.pays_full} onChange={e => set('pays_full', e.target.value)} style={INPUT}>
            <option value="true">จ่ายเต็ม · ปลอดดอก</option>
            <option value="false">ยังกินดอก (หนี้หมุน)</option>
          </select>)}
        </>)}

        {row(<>
          {field('วงเงิน (฿)', <input type="number" min="0" step="1" value={form.credit_limit}
            onChange={e => set('credit_limit', e.target.value)} placeholder="300000"
            style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
          {field('ยอดคงค้าง (฿)', <input type="number" min="0" step="1" value={form.manual_balance}
            onChange={e => set('manual_balance', e.target.value)} placeholder="6540"
            disabled={!!form.debt_id}
            style={{ ...INPUT, fontFamily: 'var(--f-mono)', opacity: form.debt_id ? 0.5 : 1 }} />,
          form.debt_id ? 'ผูกกับหนี้อยู่ — ใช้ยอดคงเหลือจากตารางหนี้' : null)}
        </>)}

        {field('ผูกกับหนี้ในตารางหนี้',
          <select value={form.debt_id} onChange={e => set('debt_id', e.target.value)} style={INPUT}>
            <option value="">— ไม่ผูก (กรอกยอดเอง) —</option>
            {(debts || []).map(d => (
              <option key={d.id} value={d.id}>
                {d.name}{d.remaining_balance ? ` · ค้าง ${baht(d.remaining_balance)}` : ''}
              </option>
            ))}
          </select>,
          'ผูกแล้วยอดคงค้างจะอ่านจากตารางหนี้ ไม่ต้องกรอกซ้ำสองที่')}

        {row(<>
          {field('วันสรุปยอด', <input type="number" min="1" max="31" value={form.statement_day}
            onChange={e => set('statement_day', e.target.value)} placeholder="25"
            style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
          {field('วันครบกำหนดจ่าย', <input type="number" min="1" max="31" value={form.due_day}
            onChange={e => set('due_day', e.target.value)} placeholder="10"
            style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
        </>)}

        {field('บันทึกการเปิดบัตร', <input type="text" value={form.opened_note}
          onChange={e => set('opened_note', e.target.value)}
          placeholder="เปิด ส.ค. 2569 · autopay จ่ายเต็ม" style={INPUT} />)}

        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={MONO_LABEL}>เงื่อนไขฟรีค่าธรรมเนียม</div>
          {row(<>
            {field('นับแบบไหน', <select value={form.waiver_mode} onChange={e => set('waiver_mode', e.target.value)} style={INPUT}>
              <option value="none">ฟรี ไม่มีเงื่อนไข</option>
              <option value="count">นับจำนวนครั้งที่รูด</option>
              <option value="amount">นับยอดใช้จ่ายรวม (฿)</option>
            </select>)}
            {field('ค่าธรรมเนียมรายปี (฿)', <input type="number" min="0" step="1" value={form.annual_fee}
              onChange={e => set('annual_fee', e.target.value)} placeholder="1250"
              style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
          </>)}
          {form.waiver_mode !== 'none' && row(<>
            {field('เป้า', <input type="number" min="0" step="1" value={form.waiver_target}
              onChange={e => set('waiver_target', e.target.value)}
              placeholder={form.waiver_mode === 'count' ? '12' : '100000'}
              style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
            {field('ทำไปแล้ว', <input type="number" min="0" step="1" value={form.waiver_progress}
              onChange={e => set('waiver_progress', e.target.value)} placeholder="2"
              style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
          </>)}
          {form.waiver_mode !== 'none' && field('รอบปีบัตร', <input type="text" value={form.waiver_period_note}
            onChange={e => set('waiver_period_note', e.target.value)}
            placeholder="รอบปีบัตร ส.ค. 69 – ก.ค. 70" style={INPUT} />)}
          {field('หมายเหตุค่าธรรมเนียม', <input type="text" value={form.annual_fee_note}
            onChange={e => set('annual_fee_note', e.target.value)}
            placeholder="ปีแรกฟรี" style={INPUT} />)}
        </div>

        <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={MONO_LABEL}>โปรไฟล์ค่าธรรมเนียม (ธปท.)</div>
          {field('ค่าธรรมเนียมรายปี (ข้อความ)', <input type="text" value={form.fp_annual_fee_display}
            onChange={e => set('fp_annual_fee_display', e.target.value)}
            placeholder="ปีแรกฟรี · ปีถัดไป 1,250฿" style={INPUT} />)}
          {row(<>
            {field('ดอกเบี้ย', <input type="text" value={form.fp_interest}
              onChange={e => set('fp_interest', e.target.value)} placeholder="16% ต่อปี" style={INPUT} />)}
            {field('กดเงินสด', <input type="text" value={form.fp_cash_advance}
              onChange={e => set('fp_cash_advance', e.target.value)} placeholder="2.5% + VAT" style={INPUT} />)}
          </>)}
          {field('ความเสี่ยงอัตราแลกเปลี่ยน (FX)', <input type="text" value={form.fp_fx}
            onChange={e => set('fp_fx', e.target.value)} placeholder="ไม่เกิน 2.5%" style={INPUT} />)}
          {field('สิทธิประโยชน์', <textarea value={form.fp_benefits} rows={3}
            onChange={e => set('fp_benefits', e.target.value)}
            placeholder="K Point สูงสุด X3 · ประกันเดินทาง 200,000฿" style={{ ...INPUT, resize: 'vertical' }} />)}
          {row(<>
            {field('ลิงก์ตาราง ธปท.', <input type="url" value={form.fp_bot_url}
              onChange={e => set('fp_bot_url', e.target.value)}
              placeholder="https://app.bot.or.th/…" style={INPUT} />)}
            {field('ตรวจกับ ธปท. เมื่อ', <input type="text" value={form.fp_bot_checked}
              onChange={e => set('fp_bot_checked', e.target.value)} placeholder="16 ส.ค. 69" style={INPUT} />)}
          </>)}
          {field('ลำดับการแสดง', <input type="number" step="1" value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)} placeholder="0"
            style={{ ...INPUT, fontFamily: 'var(--f-mono)' }} />)}
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', background: 'var(--danger-soft)', color: 'var(--danger)',
            borderRadius: 'var(--radius-field)', fontSize: 12,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>ยกเลิก</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : initial ? 'บันทึก' : 'เพิ่มบัตร'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  The tab panel
// ════════════════════════════════════════════════════════════════════════════
export function CreditCards({ scope = 'personal', debts = [], isMobile = false, today }) {
  const [cards, setCards]     = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { cards: rows, missing: gone } = await listCreditCards(scope);
      setCards(rows);
      setMissing(gone);
    } catch (err) {
      setError(err.message || 'โหลดบัตรไม่สำเร็จ');
    } finally { setLoading(false); }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  const ordered = useMemo(() => sortCards(cards), [cards]);
  const summary = useMemo(() => summarizeCards({ cards, debts, today }), [cards, debts, today]);

  const openAdd  = () => { setEditing(null); setShowForm(true); };
  const openEdit = (card) => { setEditing(card); setShowForm(true); };
  const closeForm = useCallback(() => { setShowForm(false); setEditing(null); }, []);
  const onSaved = async () => { closeForm(); await load(); };

  const remove = async (card) => {
    if (!window.confirm(`ลบบัตร “${card.name}” ออกจากรายการ?`)) return;
    try {
      await deleteCreditCard(card.id);
      await load();
    } catch (err) { window.alert(err.message || 'ลบไม่สำเร็จ'); }
  };

  // ── The migration has not been run yet: calm, not an error ──────────────
  if (missing) {
    return (
      <Card>
        <CardHeader title="บัตรเครดิต" meta="รอติดตั้งตารางในฐานข้อมูล" />
        <EmptyState
          icon="💳"
          title="ยังไม่ได้ติดตั้งตาราง credit_cards — รัน SQL migration ใน Supabase แล้วรีเฟรช"
          description="เปิด Supabase → SQL Editor → รัน supabase/migration_add_credit_cards.sql (ตั้งชื่อแท็บว่า loop_credit_cards) แล้วกลับมารีเฟรชหน้านี้ หน้าอื่นในแอปใช้งานได้ตามปกติ"
          compact
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader title="บัตรเครดิต" meta="กำลังโหลด…" />
      </Card>
    );
  }

  return (
    <>
      {error && (
        <Card>
          <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        </Card>
      )}

      {ordered.length > 0 && <SummaryStrip summary={summary} isMobile={isMobile} />}

      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(340px, 1fr))',
      }}>
        {ordered.map(card => (
          <CreditCardBlock key={card.id} card={card} debts={debts} today={today}
            onEdit={openEdit} onDelete={remove} />
        ))}

        {ordered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <Card>
              <CardHeader title="บัตรเครดิต" meta="เริ่มจากใบแรก" />
              <EmptyState
                icon="💳"
                title="ยังไม่มีบัตรในระบบ"
                description="กรอกเอง: ชื่อบัตร · วงเงิน · วันสรุปยอด/ครบกำหนด · เงื่อนไขฟรีค่าธรรมเนียม — แล้วหน้านี้จะสรุป utilization ดอกเบี้ย และบิลถัดไปให้เอง"
                actionLabel="+ เพิ่มบัตร"
                onAction={openAdd}
              />
            </Card>
          </div>
        ) : (
          <button type="button" onClick={openAdd} className="focus-ring" style={{
            textAlign: 'center', padding: '32px 20px', cursor: 'pointer',
            background: 'var(--surface)', border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-card)', color: 'var(--text-secondary)',
            fontFamily: 'var(--f-body)', minHeight: 160,
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>+ เพิ่มบัตร</div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              กรอกเอง: ชื่อบัตร · วงเงิน · วันสรุปยอด/ครบกำหนด · เงื่อนไขฟรีค่าธรรมเนียม
            </div>
          </button>
        )}
      </div>

      {showForm && (
        <CardFormModal initial={editing} scope={scope} debts={debts}
          onSaved={onSaved} onClose={closeForm} />
      )}
    </>
  );
}
