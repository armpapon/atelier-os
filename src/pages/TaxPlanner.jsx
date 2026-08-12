// ── วางแผนภาษี — Thai personal income tax planner ────────────────────────────
// A table the owner fills in for himself, แพท, and anyone else he supports;
// it saves as he types and tells him what deduction room he has left.
//
// All arithmetic lives in src/lib/taxTH.js (pure, tested in audit/cases.mjs).
// This file is presentation + persistence only — if you find yourself adding a
// cap or a bracket here, it belongs in taxTH.js instead.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader.jsx';
import { Card, CardHeader, Button, Badge } from '../components/ui/index.js';
import { todayStr } from '../lib/dates.js';
import {
  DEDUCTIONS, EXPENSE_CAP, RETIREMENT_COMBINED_CAP,
  computeTax, deductionHeadroom, planningSummary, baht, toBE, taxYearOf,
  periodFor, toStored, toDisplay, periodDerivation,
  sanityWarnings, derivations, fmtNumber,
  resolveStatutory, RESTORE_LABEL,
  countCeiling, countDerivation, countBlockedNote, countPatch,
} from '../lib/taxTH.js';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, copyYear,
} from '../lib/api/tax.js';

const mono = { fontFamily: 'var(--f-mono)', fontVariantNumeric: 'tabular-nums' };
const label10 = {
  fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: 'var(--ink-3)',
};

/** Deduction rows grouped the way the form reads, top to bottom. */
const SECTIONS = [
  { title: 'ตัวบุคคล & ครอบครัว', keys: ['personal', 'spouse', 'children', 'childrenExtra', 'parents'] },
  { title: 'ประกัน & ประกันสังคม', keys: ['socialSecurity', 'lifeInsurance', 'healthInsurance', 'parentsHealth'] },
  { title: `กองทุนเพื่อการเกษียณ · รวมกันไม่เกิน ${baht(RETIREMENT_COMBINED_CAP)}`, keys: ['pvd', 'rmf', 'ssf', 'thaiEsg', 'pensionInsurance'] },
  { title: 'ที่อยู่อาศัย & บริจาค', keys: ['homeLoanInterest', 'donationEdu', 'donationGeneral'] },
];

/**
 * What a person created from today onwards starts with: the payslip panel,
 * with the two fields the payslip states monthly already set to เดือน.
 * A v4.28 row has none of this and is left exactly as it was.
 */
const NEW_PERSON_INCOME = { entryMode: 'slip', periods: { salary: 'month', wht: 'month' } };
const NEW_PERSON_DEDUCTIONS = { ssoMode: 'auto' };

/** The `periods` map out of an income/deductions blob, tolerating legacy rows. */
const periodsOf = (bag) => (bag && typeof bag.periods === 'object' && bag.periods) || {};

/**
 * Which entry panel this person opens in.
 * Persisted once a person is created; for a v4.28 row that predates the key,
 * anything already filled in means the detailed form — that is the form those
 * numbers were typed into, and dropping him into the slip panel would hide
 * deductions he has already entered.
 */
function entryModeOf(profile) {
  const income = profile?.income || {};
  if (income.entryMode === 'slip' || income.entryMode === 'full') return income.entryMode;
  const touched = Number(income.salaryMonthly) > 0 || Number(income.bonus) > 0
    || Number(income.wht) > 0 || (Array.isArray(income.other) && income.other.length > 0)
    || Object.keys(profile?.deductions || {}).length > 0;
  return touched ? 'full' : 'slip';
}

export function TaxPlanner() {
  const [year, setYear] = useState(() => taxYearOf(todayStr()) || new Date().getFullYear());
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  // ── Autosave plumbing ─────────────────────────────────────────────────────
  // 'idle' | 'dirty' | 'saving' | 'saved' | 'error'. A failure is SHOWN, and
  // the unsent patch is kept so "ลองบันทึกอีกครั้ง" can resend it — this app
  // has a hard rule against a save that quietly does nothing.
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState(null);
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);

  const flush = useCallback(async () => {
    clearTimeout(timerRef.current);
    const entries = [...pendingRef.current.entries()];
    if (!entries.length) return;
    pendingRef.current.clear();
    setSaveState('saving');
    try {
      for (const [id, patch] of entries) await updateProfile(id, patch);
      // Anything typed while the request was in flight keeps us dirty.
      setSaveState(pendingRef.current.size ? 'dirty' : 'saved');
      setSaveError(null);
    } catch (e) {
      // Put the patches back UNDER anything newer, so a retry sends the union
      // and never resurrects a value the user has since changed.
      for (const [id, patch] of entries) {
        pendingRef.current.set(id, { ...patch, ...(pendingRef.current.get(id) || {}) });
      }
      setSaveError(e?.message || String(e));
      setSaveState('error');
    }
  }, []);

  const queueSave = useCallback((id, patch) => {
    pendingRef.current.set(id, { ...(pendingRef.current.get(id) || {}), ...patch });
    setSaveState('dirty');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flush(); }, 600);
  }, [flush]);

  // Leaving the page (or the tab) must not drop an un-sent 600ms of typing.
  useEffect(() => {
    const onHide = () => { if (pendingRef.current.size) flush(); };
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      clearTimeout(timerRef.current);
      if (pendingRef.current.size) flush();
    };
  }, [flush]);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (y) => {
    setLoading(true);
    setLoadError(null);
    try {
      const { rows, missingTable: missing } = await listProfiles(y);
      setMissingTable(missing);
      setProfiles(rows);
      setActiveId(prev => (rows.some(r => r.id === prev) ? prev : (rows[0]?.id || null)));
    } catch (e) {
      setLoadError(e?.message || String(e));
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(year); }, [year, load]);

  // ── Edits ─────────────────────────────────────────────────────────────────
  const patchProfile = useCallback((id, patch) => {
    setProfiles(list => list.map(p => (p.id === id ? { ...p, ...patch } : p)));
    queueSave(id, patch);
  }, [queueSave]);

  const active = profiles.find(p => p.id === activeId) || null;

  const setIncome = useCallback((patch) => {
    if (!active) return;
    patchProfile(active.id, { income: { ...(active.income || {}), ...patch } });
  }, [active, patchProfile]);

  // A patch, not a single key: some rows move two fields at once (lowering
  // บุตร takes บุตรคนที่ 2 ขึ้นไป down with it — see countPatch in taxTH.js).
  const setDeduction = useCallback((patch) => {
    if (!active) return;
    patchProfile(active.id, { deductions: { ...(active.deductions || {}), ...patch } });
  }, [active, patchProfile]);

  // The เดือน/ปี switch stores nothing but the CHOICE — the figure itself is
  // already converted by the field, so flipping a toggle never moves money.
  const setIncomePeriod = useCallback((field, period) => {
    if (!active) return;
    const income = active.income || {};
    patchProfile(active.id, { income: { ...income, periods: { ...periodsOf(income), [field]: period } } });
  }, [active, patchProfile]);

  const setDeductionPeriod = useCallback((field, period) => {
    if (!active) return;
    const ded = active.deductions || {};
    patchProfile(active.id, { deductions: { ...ded, periods: { ...periodsOf(ded), [field]: period } } });
  }, [active, patchProfile]);

  /** ssoMode / ssoSettings / socialSecurity all live in `deductions`. */
  const setSso = useCallback((patch) => {
    if (!active) return;
    patchProfile(active.id, { deductions: { ...(active.deductions || {}), ...patch } });
  }, [active, patchProfile]);

  const setEntryMode = useCallback((mode) => {
    if (!active) return;
    patchProfile(active.id, { income: { ...(active.income || {}), entryMode: mode } });
  }, [active, patchProfile]);

  // ── Results, for every person (household total needs them all) ────────────
  const results = useMemo(
    () => new Map(profiles.map(p => [p.id, computeTax({ income: p.income, deductions: p.deductions })])),
    [profiles],
  );
  const activeResult = active ? results.get(active.id) : null;
  const entryMode = active ? entryModeOf(active) : 'slip';
  const warnings = useMemo(
    () => (active && activeResult ? sanityWarnings(active, activeResult) : []),
    [active, activeResult],
  );

  const household = useMemo(() => {
    let tax = 0, wht = 0, gross = 0;
    for (const r of results.values()) { tax += r.tax; wht += r.income.wht; gross += r.income.gross; }
    return { tax, wht, gross, balance: tax - wht, people: results.size };
  }, [results]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const addPerson = async (name, isSelf = false) => {
    const person = String(name || '').trim();
    if (!person) return;
    setBusy(true);
    try {
      const row = await createProfile({
        tax_year: year, person_name: person, is_self: isSelf,
        sort_order: profiles.length,
        income: NEW_PERSON_INCOME, deductions: NEW_PERSON_DEDUCTIONS,
      });
      setProfiles(list => [...list, row]);
      setActiveId(row.id);
      setNewName('');
      setAdding(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally { setBusy(false); }
  };

  const seedHousehold = async () => {
    setBusy(true);
    try {
      const seed = { income: NEW_PERSON_INCOME, deductions: NEW_PERSON_DEDUCTIONS };
      const arm = await createProfile({ tax_year: year, person_name: 'อาร์ม', is_self: true, sort_order: 0, ...seed });
      const pat = await createProfile({ tax_year: year, person_name: 'แพท', is_self: false, sort_order: 1, ...seed });
      setProfiles([arm, pat]);
      setActiveId(arm.id);
    } catch (e) {
      alert(e?.message || String(e));
      load(year);
    } finally { setBusy(false); }
  };

  const removePerson = async (p) => {
    if (!confirm(`ลบ "${p.person_name}" ออกจากปีภาษี ${toBE(year)}?\nข้อมูลที่กรอกไว้จะหายไป`)) return;
    setBusy(true);
    try {
      pendingRef.current.delete(p.id);
      await deleteProfile(p.id);
      setProfiles(list => list.filter(x => x.id !== p.id));
      setActiveId(cur => (cur === p.id ? null : cur));
    } catch (e) {
      alert(e?.message || String(e));
    } finally { setBusy(false); }
  };

  const doCopyPrevYear = async () => {
    if (!confirm(`คัดลอกทุกคนจากปีภาษี ${toBE(year - 1)} มาเป็นปี ${toBE(year)}?\n(ภาษีหัก ณ ที่จ่ายจะไม่ถูกคัดลอกมา — ต้องกรอกใหม่)`)) return;
    setBusy(true);
    try {
      const { copied, skipped } = await copyYear(year - 1, year);
      await load(year);
      alert(copied
        ? `คัดลอกมา ${copied} คน${skipped.length ? ` · ข้าม ${skipped.join(', ')} (มีอยู่แล้ว)` : ''}`
        : `ไม่มีใครให้คัดลอก — ทุกคนในปี ${toBE(year - 1)} มีอยู่ในปีนี้แล้ว`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally { setBusy(false); }
  };

  // ── Header controls ───────────────────────────────────────────────────────
  const thisYear = taxYearOf(todayStr()) || new Date().getFullYear();
  const yearOptions = [];
  for (let y = thisYear + 1; y >= thisYear - 5; y--) yearOptions.push(y);

  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <SaveIndicator state={saveState} error={saveError} onRetry={flush} />
      <select
        className="input" value={year} aria-label="ปีภาษี"
        onChange={e => setYear(Number(e.target.value))}
        style={{ ...mono, width: 'auto', padding: '7px 10px', fontSize: 13 }}>
        {yearOptions.map(y => <option key={y} value={y}>ปีภาษี {toBE(y)}</option>)}
      </select>
      <Button size="sm" variant="outline" onClick={doCopyPrevYear} disabled={busy || missingTable}>
        คัดลอกจากปีก่อน
      </Button>
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="ชีวิต · Tax"
        title="วางแผนภาษี"
        sub="กรอกรายได้และลดหย่อนของแต่ละคน แล้วดูว่าปีนี้ต้องจ่ายเพิ่มหรือขอคืนได้ · และยังลดหย่อนเพิ่มได้อีกเท่าไหร่"
        actions={actions}
      />

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {missingTable && <SqlNotRunCard />}
        {loadError && (
          <WarnCard>
            โหลดข้อมูลไม่สำเร็จ: {loadError}{' '}
            <Button size="sm" variant="outline" onClick={() => load(year)} style={{ marginLeft: 8 }}>ลองใหม่</Button>
          </WarnCard>
        )}

        {!missingTable && !loading && profiles.length > 0 && (
          <HouseholdCard year={year} household={household} />
        )}

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 13 }}>
            กำลังโหลด…
          </div>
        ) : missingTable ? null : profiles.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '34px 22px' }}>
            <div style={{ fontSize: 15, color: 'var(--ink)', marginBottom: 6 }}>
              ยังไม่มีใครในปีภาษี {toBE(year)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 18, lineHeight: 1.7 }}>
              เริ่มจากตัวคุณกับแพท แล้วค่อยเพิ่มคนอื่น (เช่น คุณพ่อ) ทีหลังก็ได้
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={seedHousehold} disabled={busy}>เริ่มด้วย อาร์ม + แพท</Button>
              <Button variant="outline" onClick={() => setAdding(true)} disabled={busy}>+ เพิ่มคน</Button>
            </div>
            {adding && (
              <AddPersonRow
                value={newName} onChange={setNewName} busy={busy}
                onSubmit={() => addPerson(newName)} onCancel={() => { setAdding(false); setNewName(''); }}
              />
            )}
          </Card>
        ) : (
          <>
            <PersonTabs
              profiles={profiles} results={results} activeId={activeId}
              onSelect={setActiveId}
              adding={adding} onStartAdd={() => setAdding(true)}
              newName={newName} setNewName={setNewName} busy={busy}
              onAdd={() => addPerson(newName)}
              onCancelAdd={() => { setAdding(false); setNewName(''); }}
            />

            {active && activeResult && (
              <div style={{
                display: 'grid', gap: 18,
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                alignItems: 'start',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                  {entryMode === 'slip' ? (
                    <SlipCard
                      key={`slip-${active.id}`}
                      profile={active} result={activeResult}
                      onIncome={setIncome} onPeriod={setIncomePeriod} onSso={setSso}
                      onSwitchToFull={() => setEntryMode('full')}
                    />
                  ) : (
                    <>
                      <IncomeCard
                        key={`income-${active.id}`}
                        profile={active} result={activeResult} onChange={setIncome}
                        onPeriod={setIncomePeriod}
                        onSwitchToSlip={() => setEntryMode('slip')}
                      />
                      <DeductionsCard
                        key={`ded-${active.id}`}
                        profile={active} result={activeResult}
                        onChange={setDeduction} onPeriod={setDeductionPeriod} onSso={setSso}
                        onCustomChange={rows => patchProfile(active.id, {
                          deductions: { ...(active.deductions || {}), custom: rows },
                        })}
                      />
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                  <SanityCard warnings={warnings} />
                  <ResultCard result={activeResult} />
                  <AdviceCard result={activeResult} />
                  <Card variant="flat">
                    <div style={{ ...label10, marginBottom: 8 }}>โน้ต</div>
                    <textarea
                      key={`notes-${active.id}`}
                      className="input" rows={3}
                      defaultValue={active.notes || ''}
                      placeholder="เช่น ปีนี้ตั้งใจซื้อ SSF เดือนละเท่าไหร่ / เอกสารที่ยังขาด"
                      onChange={e => patchProfile(active.id, { notes: e.target.value })}
                      style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.6 }}
                    />
                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="danger" onClick={() => removePerson(active)} disabled={busy}>
                        ลบ {active.person_name} ออกจากปีนี้
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </>
        )}

        <HonestyNote />
      </div>
    </div>
  );
}

// ── Save indicator ──────────────────────────────────────────────────────────

function SaveIndicator({ state, error, onRetry }) {
  if (state === 'idle') return null;
  if (state === 'error') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5,
        color: 'var(--danger)', background: 'var(--danger-soft)',
        borderRadius: 'var(--radius-btn)', padding: '5px 10px', maxWidth: 380,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          บันทึกไม่สำเร็จ: {error}
        </span>
        <button onClick={onRetry} className="focus-ring" style={{
          background: 'none', border: 0, color: 'var(--danger)', cursor: 'pointer',
          textDecoration: 'underline', fontSize: 11.5, padding: 0, flexShrink: 0,
        }}>ลองบันทึกอีกครั้ง</button>
      </span>
    );
  }
  const text = state === 'saved' ? 'บันทึกแล้ว ✓' : state === 'saving' ? 'กำลังบันทึก…' : 'ยังไม่ได้บันทึก';
  return (
    <span style={{
      ...mono, fontSize: 10.5, letterSpacing: '0.06em',
      color: state === 'saved' ? 'var(--success)' : 'var(--ink-3)',
    }}>{text}</span>
  );
}

// ── Degraded states ─────────────────────────────────────────────────────────

function WarnCard({ children }) {
  return (
    <div style={{
      background: 'var(--warning-soft)', border: '1px solid var(--warning)',
      borderRadius: 'var(--radius-card)', padding: '14px 18px',
      fontSize: 13, lineHeight: 1.7, color: 'var(--accent-strong)',
    }}>{children}</div>
  );
}

function SqlNotRunCard() {
  return (
    <WarnCard>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>ยังไม่ได้รันไฟล์ SQL</div>
      <div>
        ตาราง <code style={mono}>tax_profiles</code> ยังไม่มีในฐานข้อมูล — เปิด Supabase → SQL Editor
        แล้วรันไฟล์ <code style={mono}>supabase/migration_add_tax_planner.sql</code>{' '}
        (ตั้งชื่อแท็บว่า <code style={mono}>loop_tax_planner</code>) แล้วรีเฟรชหน้านี้
        <div style={{ marginTop: 6, color: 'var(--ink-2)' }}>
          หน้าอื่นในแอปใช้งานได้ตามปกติ · ไฟล์นี้รันซ้ำได้ ไม่พัง
        </div>
      </div>
    </WarnCard>
  );
}

function HonestyNote() {
  return (
    <div style={{
      fontSize: 11.5, lineHeight: 1.8, color: 'var(--ink-3)',
      borderTop: '1px solid var(--hairline)', paddingTop: 14,
    }}>
      อัตราภาษีและเพดานลดหย่อนในหน้านี้เป็นโครงสร้างถาวรตามประมวลรัษฎากร —
      <b style={{ color: 'var(--ink-2)' }}> ต้องตรวจสอบกับกรมสรรพากรของปีภาษีที่จะยื่นทุกครั้ง</b>{' '}
      เพราะมาตรการรายปี (เช่น Easy E-Receipt) เปลี่ยนทุกปี ให้กรอกในช่อง "ลดหย่อนอื่น ๆ" เอง ·
      แต่ละคนต้องยื่นตามเงินได้ที่ตัวเองได้รับจริง หน้านี้เป็นเครื่องมือคำนวณเพื่อวางแผนเท่านั้น
      ไม่ใช่คำแนะนำการลงทุนหรือการยื่นภาษี
    </div>
  );
}

// ── Household ───────────────────────────────────────────────────────────────

function HouseholdCard({ year, household }) {
  const owed = household.balance > 0;
  return (
    <Card variant="paper">
      <div style={{
        display: 'grid', gap: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      }}>
        <Stat label={`รวมทั้งบ้าน · ปีภาษี ${toBE(year)}`} value={baht(household.tax)} sub={`ภาษีรวม ${household.people} คน`} big />
        <Stat label="เงินได้รวม" value={baht(household.gross)} />
        <Stat label="หัก ณ ที่จ่ายไปแล้ว" value={baht(household.wht)} />
        <Stat
          label={owed ? 'ต้องจ่ายเพิ่มรวม' : 'ขอคืนได้รวม'}
          value={baht(Math.abs(household.balance))}
          tone={owed ? 'var(--loss)' : 'var(--profit)'}
        />
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, tone, big }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...label10 }}>{label}</div>
      <div style={{
        ...mono, fontSize: big ? 26 : 20, fontWeight: 500, marginTop: 5,
        color: tone || 'var(--ink)', letterSpacing: '-0.01em',
      }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Person tabs ─────────────────────────────────────────────────────────────

function PersonTabs({
  profiles, results, activeId, onSelect,
  adding, onStartAdd, newName, setNewName, busy, onAdd, onCancelAdd,
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {profiles.map(p => {
          const r = results.get(p.id);
          const on = p.id === activeId;
          return (
            <button
              key={p.id} onClick={() => onSelect(p.id)} className="focus-ring"
              style={{
                textAlign: 'left', cursor: 'pointer', minWidth: 132,
                padding: '10px 14px', borderRadius: 'var(--radius-field)',
                background: on ? 'var(--surface)' : 'transparent',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--hairline)'}`,
                boxShadow: on ? 'var(--shadow-card)' : 'none',
                transition: 'all 130ms',
              }}>
              <div style={{
                fontSize: 13.5, fontWeight: on ? 600 : 500, color: 'var(--ink)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {p.person_name}
                {p.is_self && <Badge tone="outline" size="sm">ฉัน</Badge>}
              </div>
              <div style={{ ...mono, fontSize: 11.5, color: on ? 'var(--accent)' : 'var(--ink-3)', marginTop: 3 }}>
                ภาษี {baht(r?.tax || 0)}
              </div>
            </button>
          );
        })}
        {!adding && (
          <button onClick={onStartAdd} className="focus-ring" disabled={busy}
            style={{
              padding: '10px 16px', borderRadius: 'var(--radius-field)',
              background: 'transparent', border: '1px dashed var(--border-strong)',
              color: 'var(--ink-2)', cursor: 'pointer', fontSize: 13,
            }}>+ เพิ่มคน</button>
        )}
      </div>
      {adding && (
        <AddPersonRow value={newName} onChange={setNewName} busy={busy} onSubmit={onAdd} onCancel={onCancelAdd} />
      )}
    </div>
  );
}

function AddPersonRow({ value, onChange, busy, onSubmit, onCancel }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <input
        className="input" autoFocus value={value} placeholder="ชื่อคน เช่น พ่อ"
        aria-label="ชื่อคนที่จะเพิ่ม"
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        style={{ maxWidth: 220, fontSize: 13 }}
      />
      <Button size="sm" variant="primary" onClick={onSubmit} disabled={busy || !value.trim()}>เพิ่ม</Button>
      <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>ยกเลิก</Button>
    </div>
  );
}

// ── Money input ─────────────────────────────────────────────────────────────
// Uncontrolled text on purpose: the parent stores a number, and remounting on
// person-switch (via `key`) is what resets it. Typing must never be reformatted
// mid-keystroke — that is how "100,000" turns into "1,000,00".

function MoneyInput({ value, onChange, placeholder = '0', ariaLabel, width = 132, suffix = '฿' }) {
  // Saved figures arrive already grouped; only live typing is left raw.
  const [text, setText] = useState(() => (Number(value) > 0 ? Number(value).toLocaleString('en-US') : ''));
  const commit = (t) => {
    const clean = t.replace(/[, ]/g, '');
    const n = clean === '' ? 0 : Number(clean);
    onChange(Number.isFinite(n) && n > 0 ? n : 0);
  };
  return (
    <div style={{ position: 'relative', width, flexShrink: 0 }}>
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        ...mono, fontSize: 12, color: 'var(--ink-4)', pointerEvents: 'none',
      }}>{suffix}</span>
      <input
        className="input" inputMode="decimal" aria-label={ariaLabel} placeholder={placeholder}
        value={text}
        onChange={e => {
          const t = e.target.value.replace(/[^\d.,]/g, '');
          setText(t);
          commit(t);
        }}
        onBlur={() => {
          const n = Number(text.replace(/[, ]/g, ''));
          setText(Number.isFinite(n) && n > 0 ? n.toLocaleString('en-US') : '');
        }}
        onFocus={() => setText(t => t.replace(/[, ]/g, ''))}
        style={{
          ...mono, width: '100%', textAlign: 'right',
          padding: '7px 10px 7px 24px', fontSize: 13,
        }}
      />
    </div>
  );
}

// ── เดือน / ปี ──────────────────────────────────────────────────────────────
// A two-option segmented control, deliberately not a <select>: the whole point
// is that the current unit is readable without opening anything, and that
// switching is one tap on a phone.

const PERIOD_LABEL = { month: 'เดือน', year: 'ปี' };

function PeriodToggle({ value, onChange, name }) {
  return (
    <div style={{
      display: 'inline-flex', flexShrink: 0, gap: 2, padding: 2,
      background: 'var(--fill)', borderRadius: 999,
    }}>
      {['month', 'year'].map(p => {
        const on = value === p;
        return (
          <button
            key={p} type="button" className="focus-ring" aria-pressed={on}
            aria-label={`${name} เป็นราย${PERIOD_LABEL[p]}`}
            onClick={() => onChange(p)}
            style={{
              ...mono, fontSize: 10, letterSpacing: '0.04em', lineHeight: 1.6,
              padding: '2px 8px', borderRadius: 999, border: 0, cursor: 'pointer',
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--ink)' : 'var(--ink-3)',
              boxShadow: on ? 'var(--shadow-card)' : 'none',
              transition: 'background 120ms, color 120ms',
            }}>{PERIOD_LABEL[p]}</button>
        );
      })}
    </div>
  );
}

/**
 * A money input that remembers whether the owner types it monthly or yearly.
 * The parent only ever sees the STORED figure — the conversion (and the little
 * "875 × 12 = ฿10,500/ปี" line that proves it) happens here.
 *
 * `key` on the inner MoneyInput carries the period because MoneyInput is
 * uncontrolled: flipping the unit has to reseed the box with the converted
 * figure, and a remount is the only honest way to do that.
 */
function MoneyField({
  field, stored, period, onStored, onPeriod,
  ariaLabel, name, width, showDerivation = true,
}) {
  const shown = toDisplay(field, stored, period);
  const deriv = periodDerivation(field, stored, period);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <MoneyInput
          key={`${field}-${period}`} value={shown} ariaLabel={ariaLabel} width={width}
          onChange={v => onStored(toStored(field, v, period))}
        />
        <PeriodToggle value={period} onChange={onPeriod} name={name || ariaLabel} />
      </div>
      {showDerivation && deriv && Number(stored) > 0 && (
        <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'right' }}>{deriv}</div>
      )}
    </div>
  );
}

// ── นับเป็นคน ───────────────────────────────────────────────────────────────
// บุตร and บิดามารดา are people, so the control counts people. − and + because
// the answer is almost always 1, 2 or 3 and nobody should have to reach for a
// keyboard; a real number input in the middle because it is what a label — and
// therefore a test, and a screen reader — can hold on to.

function CountStepper({ value, onChange, max, ariaLabel, name, disabled }) {
  const ceiling = Number.isFinite(max) ? max : Infinity;
  const n = Math.max(0, Math.min(Math.floor(Number(value) || 0), ceiling));
  const set = (v) => onChange(Math.max(0, Math.min(Math.floor(v) || 0, ceiling)));
  const btn = (on) => ({
    ...mono, width: 26, height: 28, flexShrink: 0, fontSize: 15, lineHeight: 1,
    borderRadius: 'var(--radius-btn)', border: '1px solid var(--hairline)',
    background: 'var(--surface)', color: on ? 'var(--ink)' : 'var(--ink-4)',
    cursor: on ? 'pointer' : 'default',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <button
        type="button" className="focus-ring" aria-label={`ลดจำนวน ${name}`}
        disabled={disabled || n <= 0} onClick={() => set(n - 1)}
        style={btn(!disabled && n > 0)}>−</button>
      <input
        className="input" type="number" min={0}
        max={Number.isFinite(ceiling) ? ceiling : undefined}
        aria-label={ariaLabel} value={n} disabled={disabled}
        onChange={e => set(Number(e.target.value) || 0)}
        style={{ ...mono, width: 54, textAlign: 'center', padding: '7px 6px', fontSize: 13 }}
      />
      <button
        type="button" className="focus-ring" aria-label={`เพิ่มจำนวน ${name}`}
        disabled={disabled || n >= ceiling} onClick={() => set(n + 1)}
        style={btn(!disabled && n < ceiling)}>+</button>
      <span style={{ fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>คน</span>
    </div>
  );
}

// ── Income ──────────────────────────────────────────────────────────────────

function IncomeCard({ profile, result, onChange, onPeriod, onSwitchToSlip }) {
  const income = profile.income || {};
  const other = Array.isArray(income.other) ? income.other : [];
  const periods = periodsOf(income);
  const d = derivations(result);

  const setOther = (rows) => onChange({ other: rows });

  return (
    <Card>
      <CardHeader eyebrow="รายได้" title={`เงินได้ของ ${profile.person_name}`}
        meta={d.gross} />

      <FormRow label="เงินเดือน" hint={`ทั้งปี ${baht(result.income.salaryAnnual)}`}>
        <MoneyField
          field="salary" stored={income.salaryMonthly} period={periodFor(periods, 'salary')}
          ariaLabel="เงินเดือนต่อเดือน" name="เงินเดือน"
          onStored={v => onChange({ salaryMonthly: v })}
          onPeriod={p => onPeriod('salary', p)}
        />
      </FormRow>

      <FormRow label="โบนัส / เงินได้ก้อนอื่น">
        <MoneyField
          field="bonus" stored={income.bonus} period={periodFor(periods, 'bonus')}
          ariaLabel="โบนัส" name="โบนัส"
          onStored={v => onChange({ bonus: v })}
          onPeriod={p => onPeriod('bonus', p)}
        />
      </FormRow>

      <div style={{ ...label10, marginTop: 16, marginBottom: 8 }}>
        รายได้อื่น · มาตรา 40(2)–(8)
      </div>
      {other.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input" value={row?.label || ''} placeholder="เช่น ค่าเช่า / ฟรีแลนซ์"
            aria-label={`ชื่อรายได้อื่นรายการที่ ${i + 1}`}
            onChange={e => setOther(other.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
            style={{ flex: 1, minWidth: 110, fontSize: 13, padding: '7px 10px' }}
          />
          <MoneyField
            field={`other:${i}`} stored={row?.amount} period={periodFor(periods, `other:${i}`)}
            ariaLabel={`จำนวนรายได้อื่นรายการที่ ${i + 1}`} name={`รายได้อื่นรายการที่ ${i + 1}`}
            width={110}
            onStored={v => setOther(other.map((r, j) => (j === i ? { ...r, amount: v } : r)))}
            onPeriod={p => onPeriod(`other:${i}`, p)}
          />
          <button onClick={() => setOther(other.filter((_, j) => j !== i))} className="focus-ring"
            aria-label={`ลบรายได้อื่นรายการที่ ${i + 1}`}
            style={{ background: 'none', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setOther([...other, { label: '', amount: 0 }])}>
        + เพิ่มรายได้อื่น
      </Button>

      <div style={{ height: 1, background: 'var(--hairline)', margin: '16px 0' }} />

      <FormRow
        label="ภาษีหัก ณ ที่จ่าย ที่ถูกหักไปแล้ว"
        hint={'ในสลิปมักอยู่ในช่อง "อื่นๆ" ของฝั่งรายการหัก · หรือดูหนังสือรับรอง 50 ทวิ'}>
        <MoneyField
          field="wht" stored={income.wht} period={periodFor(periods, 'wht')}
          ariaLabel="ภาษีหัก ณ ที่จ่าย" name="ภาษีหัก ณ ที่จ่าย"
          onStored={v => onChange({ wht: v })}
          onPeriod={p => onPeriod('wht', p)}
        />
      </FormRow>

      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <LinkButton onClick={onSwitchToSlip}>← กลับไปกรอกจากสลิป</LinkButton>
      </div>
    </Card>
  );
}

/** A text link that is a real button — used for every "switch mode" affordance. */
function LinkButton({ onClick, children, tone }) {
  return (
    <button
      type="button" onClick={onClick} className="focus-ring"
      style={{
        background: 'none', border: 0, padding: 0, cursor: 'pointer',
        fontSize: 12, color: tone || 'var(--accent)', textDecoration: 'underline',
        textUnderlineOffset: 2,
      }}>{children}</button>
  );
}

// ── "กรอกจากสลิป" ───────────────────────────────────────────────────────────
// The four boxes on a payslip, in the order they appear on the payslip, all
// monthly except the bonus. Nothing here is a new number: each one writes the
// same annual field the detailed form writes, through the same conversion.

function SlipCard({ profile, result, onIncome, onPeriod, onSso, onSwitchToFull }) {
  const income = profile.income || {};
  const periods = periodsOf(income);
  const sso = result.sso;
  const d = derivations(result);

  // ประกันสังคม is shown per month because that is how the slip shows it, and
  // it starts out as the calculated figure — typing over it is the override.
  const ssoShown = sso.mode === 'auto' ? sso.derived.monthly : toDisplay('sso', sso.typed, 'month');

  return (
    <Card>
      <CardHeader
        eyebrow="กรอกจากสลิป" title={`สลิปเงินเดือนของ ${profile.person_name}`}
        meta="กรอกตัวเลขจากสลิปเดือนล่าสุดตามลำดับ — ระบบคูณ 12 ให้เอง ไม่ต้องคิดในหัว" />

      <FormRow label="เงินเดือนค่าจ้าง / เดือน" hint={income.salaryMonthly > 0 ? d.salaryAnnual : 'ช่องแรกของฝั่งรายการได้'}>
        <MoneyField
          field="salary" stored={income.salaryMonthly} period={periodFor(periods, 'salary')}
          ariaLabel="เงินเดือนต่อเดือน" name="เงินเดือน" showDerivation={false}
          onStored={v => onIncome({ salaryMonthly: v })}
          onPeriod={p => onPeriod('salary', p)}
        />
      </FormRow>

      <FormRow
        label="ประกันสังคม / เดือน"
        hint={sso.mode === 'auto'
          ? `${d.sso} = ${baht(sso.derived.annual)}/ปี`
          : `${fmtNumber(ssoShown)} × 12 = ${baht(sso.typed)}/ปี · กรอกเอง`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <MoneyInput
            key={`slip-sso-${sso.mode}-${sso.derived.monthly}`}
            value={ssoShown} ariaLabel="ประกันสังคมต่อเดือน"
            onChange={v => onSso({ ssoMode: 'manual', socialSecurity: toStored('sso', v, 'month') })}
          />
          {sso.mode === 'manual' && sso.overridden && (
            <LinkButton onClick={() => onSso({ ssoMode: 'auto' })}>
              คำนวณใหม่ ({baht(sso.derived.monthly)}/เดือน)
            </LinkButton>
          )}
        </div>
      </FormRow>

      <FormRow
        label="ภาษีหัก ณ ที่จ่าย / เดือน"
        hint={'ในสลิปมักอยู่ในช่อง "อื่นๆ" ของฝั่งรายการหัก'}>
        <MoneyField
          field="wht" stored={income.wht} period={periodFor(periods, 'wht')}
          ariaLabel="ภาษีหัก ณ ที่จ่ายต่อเดือน" name="ภาษีหัก ณ ที่จ่าย"
          onStored={v => onIncome({ wht: v })}
          onPeriod={p => onPeriod('wht', p)}
        />
      </FormRow>

      <FormRow label="โบนัส (ทั้งปี)" hint="ถ้ายังไม่ออก ใส่ที่คาดว่าจะได้ หรือเว้นไว้ก่อน">
        <MoneyField
          field="bonus" stored={income.bonus} period={periodFor(periods, 'bonus')}
          ariaLabel="โบนัสทั้งปี" name="โบนัส"
          onStored={v => onIncome({ bonus: v })}
          onPeriod={p => onPeriod('bonus', p)}
        />
      </FormRow>

      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
          มีประกัน / SSF / RMF / บริจาค / คนในอุปการะ ให้กรอกในฟอร์มเต็ม
        </span>
        <LinkButton onClick={onSwitchToFull}>กรอกแบบละเอียด →</LinkButton>
      </div>
    </Card>
  );
}

// ── Sanity warnings ─────────────────────────────────────────────────────────
// Amber, never blocking, and never a modal: they say what looks off and what
// it probably means, and the owner keeps typing.

function SanityCard({ warnings }) {
  if (!warnings.length) return null;
  return (
    <div style={{
      background: 'var(--warning-soft)', border: '1px solid var(--warning)',
      borderRadius: 'var(--radius-card)', padding: '12px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {warnings.map(w => (
        <div key={w.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span aria-hidden style={{ color: 'var(--accent-strong)', fontSize: 12, lineHeight: 1.7 }}>⚠</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--accent-strong)', lineHeight: 1.6, fontWeight: 600 }}>
              {w.text}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.7, marginTop: 2 }}>
              {w.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FormRow({ label, hint, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, padding: '7px 0', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{label}</div>
        {hint && <div style={{ ...mono, fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Deductions ──────────────────────────────────────────────────────────────

function DeductionsCard({ profile, result, onChange, onPeriod, onSso, onCustomChange }) {
  const ded = profile.deductions || {};
  const custom = Array.isArray(ded.custom) ? ded.custom : [];
  const periods = periodsOf(ded);
  const d = derivations(result);

  return (
    <Card>
      <CardHeader eyebrow="ลดหย่อน" title="ค่าลดหย่อน"
        meta={`หักลดหย่อนได้จริงรวม ${baht(result.deductionTotal)}`} />

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, padding: '9px 12px', marginBottom: 14,
        background: 'var(--fill)', borderRadius: 'var(--radius-field)',
      }}>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
          ค่าใช้จ่าย 50% (สูงสุด {baht(EXPENSE_CAP)})
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)', marginLeft: 8 }}>อัตโนมัติ</span>
          <span style={{ ...mono, display: 'block', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {d.expense}
          </span>
        </div>
        <div style={{ ...mono, fontSize: 13.5, color: 'var(--ink)' }}>{baht(result.expense)}</div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 18 }}>
          <div style={{ ...label10, marginBottom: 6 }}>{section.title}</div>
          {section.keys.map(key => (key === 'socialSecurity' ? (
            <SocialSecurityRow
              key={key} spec={DEDUCTIONS.find(x => x.key === key)}
              row={result.rows[key]} sso={result.sso}
              period={periodFor(periods, key)}
              onSso={onSso} onPeriod={p => onPeriod(key, p)}
            />
          ) : (
            <DeductionRow
              key={key} spec={DEDUCTIONS.find(x => x.key === key)}
              row={result.rows[key]} value={ded[key]}
              period={periodFor(periods, key)}
              ceiling={countCeiling(key, ded)}
              derivation={countDerivation(key, ded)}
              blocked={countBlockedNote(key, ded)}
              onChange={v => onChange(countPatch(key, v, ded))}
              onPeriod={p => onPeriod(key, p)}
            />
          )))}
          {section.keys.includes('ssf') && result.retirement.trimmed > 0 && (
            <div style={{ ...mono, fontSize: 11, color: 'var(--accent-strong)', marginTop: 4 }}>
              ⚠ รวมกันเกินเพดาน {baht(RETIREMENT_COMBINED_CAP)} — ส่วนเกิน {baht(result.retirement.trimmed)} หักไม่ได้
            </div>
          )}
          {section.keys.includes('healthInsurance') && result.lifeHealth.trimmed > 0 && (
            <div style={{ ...mono, fontSize: 11, color: 'var(--accent-strong)', marginTop: 4 }}>
              ⚠ ประกันชีวิต + สุขภาพ รวมกันเกิน {baht(100000)} — ส่วนเกิน {baht(result.lifeHealth.trimmed)} หักไม่ได้
            </div>
          )}
        </div>
      ))}

      <div style={{ ...label10, marginBottom: 6 }}>ลดหย่อนอื่น ๆ (กรอกเอง)</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 8, lineHeight: 1.6 }}>
        มาตรการรายปีของรัฐเปลี่ยนทุกปี ระบบจึงไม่ฝังไว้ให้ — ใส่ชื่อกับจำนวนเองตามประกาศปีนั้น
      </div>
      {custom.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input" value={row?.label || ''} placeholder="ชื่อรายการลดหย่อน"
            aria-label={`ชื่อลดหย่อนอื่นรายการที่ ${i + 1}`}
            onChange={e => onCustomChange(custom.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
            style={{ flex: 1, minWidth: 110, fontSize: 13, padding: '7px 10px' }}
          />
          <MoneyField
            field={`custom:${i}`} stored={row?.amount} period={periodFor(periods, `custom:${i}`)}
            ariaLabel={`จำนวนลดหย่อนอื่นรายการที่ ${i + 1}`} name={`ลดหย่อนอื่นรายการที่ ${i + 1}`}
            width={110}
            onStored={v => onCustomChange(custom.map((r, j) => (j === i ? { ...r, amount: v } : r)))}
            onPeriod={p => onPeriod(`custom:${i}`, p)}
          />
          <button onClick={() => onCustomChange(custom.filter((_, j) => j !== i))} className="focus-ring"
            aria-label={`ลบลดหย่อนอื่นรายการที่ ${i + 1}`}
            style={{ background: 'none', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onCustomChange([...custom, { label: '', amount: 0 }])}>
        + เพิ่มลดหย่อนอื่น
      </Button>
    </Card>
  );
}

function DeductionRow({ spec, row, value, period, ceiling, derivation, blocked, onChange, onPeriod }) {
  const claimed = Number(value) || 0;
  const [open, setOpen] = useState(claimed > 0);
  // MoneyInput is uncontrolled, so the only way to push a figure INTO it is to
  // remount it. Bumped when the row writes a number he did not type — never on
  // his own keystrokes, which would steal the caret mid-word.
  const [reseed, setReseed] = useState(0);
  if (!spec || !row) return null;

  const auto = spec.kind === 'auto';
  const isCount = spec.kind === 'count';
  const statutory = resolveStatutory(spec.key, value);
  const capText = Number.isFinite(row.cap) && row.cap > 0 && !isCount ? `เพดาน ${baht(row.cap)}` : null;

  // Ticking a row must never leave him staring at an empty box. A statutory
  // flat row fills in the one legal figure; a headcount row starts at one
  // person, because "I have children" and "I have zero children" are not the
  // same statement. Unticking clears back to nothing either way.
  const toggle = (on) => {
    setOpen(on);
    if (!on) { onChange(0); return; }
    if (statutory) { onChange(statutory.statutory); return; }
    if (isCount) onChange(Math.min(1, Number.isFinite(ceiling) ? ceiling : 1));
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '7px 0', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap',
    }}>
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 9,
        flex: 1, minWidth: 150, cursor: auto ? 'default' : 'pointer',
      }}>
        <input
          type="checkbox" checked={auto ? true : open} disabled={auto}
          aria-label={`ใช้ลดหย่อน ${spec.label}`}
          onChange={e => toggle(e.target.checked)}
          style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
        />
        <span style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{spec.label}</span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>
            {spec.note}{capText && !spec.note?.includes('เกิน') ? ` · ${capText}` : ''}
          </span>
          {/* Conditions that decide whether a claim is legal at all — shown
              beside the stepper, not buried in a help page nobody opens. */}
          {open && Array.isArray(spec.conditions) && (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>
              {spec.conditions.map(c => <span key={c} style={{ display: 'block' }}>· {c}</span>)}
            </span>
          )}
          {row.capped && (
            <span style={{
              ...mono, display: 'inline-block', marginTop: 4, fontSize: 10,
              color: 'var(--accent-strong)', background: 'var(--warning-soft)',
              border: '1px solid var(--warning)', borderRadius: 999, padding: '1px 8px',
            }}>
              เกินเพดาน · หักได้ {baht(row.allowed)}
            </span>
          )}
        </span>
      </label>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
        gap: 3, flexShrink: 0,
      }}>
        {auto ? (
          <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', minWidth: 132, textAlign: 'right' }}>
            {baht(row.allowed)}
          </span>
        ) : !open ? (
          <span style={{ ...mono, fontSize: 12, color: 'var(--ink-4)', minWidth: 132, textAlign: 'right' }}>—</span>
        ) : isCount ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CountStepper
                value={value} max={ceiling} disabled={Number.isFinite(ceiling) && ceiling <= 0}
                ariaLabel={`จำนวน ${spec.label}`} name={spec.label} onChange={onChange}
              />
              <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', width: 76, textAlign: 'right' }}>
                {baht(row.allowed)}
              </span>
            </div>
            {(blocked || derivation) && (
              <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'right' }}>
                {blocked || derivation}
              </span>
            )}
          </>
        ) : spec.monthlyable ? (
          <MoneyField
            field={`ded:${spec.key}`} stored={value} period={period}
            ariaLabel={`จำนวน ${spec.label}`} name={spec.label}
            onStored={onChange} onPeriod={onPeriod}
          />
        ) : (
          <>
            <MoneyInput
              key={`${spec.key}-${reseed}`}
              value={value} ariaLabel={`จำนวน ${spec.label}`} onChange={onChange}
            />
            {/* He typed something the law does not say. Keep it — a part-year
                marriage is his to judge — but offer the standard figure back. */}
            {statutory && statutory.overridden && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)' }}>{statutory.hint} ·</span>
                <LinkButton onClick={() => { setReseed(s => s + 1); onChange(statutory.statutory); }}>
                  {statutory.restore}
                </LinkButton>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── ประกันสังคม ─────────────────────────────────────────────────────────────
// The only row the page fills in by itself. It is derived from the salary the
// owner already typed, from two parameters he can see and edit, and it shows
// its own arithmetic — because a number that appears without being typed and
// without an explanation is exactly the kind of thing nobody checks.

function SocialSecurityRow({ spec, row, sso, period, onSso, onPeriod }) {
  const [openSettings, setOpenSettings] = useState(false);
  if (!spec || !row) return null;

  const claiming = sso.mode === 'auto' || sso.typed > 0;
  const s = sso.settings;

  const toggle = (on) => {
    // Turning it back on returns to the calculated figure — that is the
    // sensible default, and the manual box is one click away.
    onSso(on ? { ssoMode: 'auto' } : { ssoMode: 'manual', socialSecurity: 0 });
  };

  return (
    <div style={{ padding: '7px 0', borderTop: '1px solid var(--hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, flex: 1, minWidth: 150, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={claiming} aria-label={`ใช้ลดหย่อน ${spec.label}`}
            onChange={e => toggle(e.target.checked)}
            style={{ marginTop: 3, accentColor: 'var(--accent)', flexShrink: 0 }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>{spec.label}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.5 }}>
              {sso.mode === 'auto'
                ? `คำนวณให้จากเงินเดือน · ${sso.derived.formula}`
                : `กรอกเอง · เพดานทั้งปี ${baht(sso.legalMax)}`}
            </span>
            {row.capped && (
              <span style={{
                ...mono, display: 'inline-block', marginTop: 4, fontSize: 10,
                color: 'var(--accent-strong)', background: 'var(--warning-soft)',
                border: '1px solid var(--warning)', borderRadius: 999, padding: '1px 8px',
              }}>
                เกินเพดาน · หักได้ {baht(row.allowed)}
              </span>
            )}
          </span>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {!claiming ? (
            <span style={{ ...mono, fontSize: 12, color: 'var(--ink-4)', minWidth: 132, textAlign: 'right' }}>—</span>
          ) : sso.mode === 'auto' ? (
            <>
              <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', minWidth: 132, textAlign: 'right' }}>
                {baht(sso.derived.annual)}
              </span>
              <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)' }}>
                {baht(sso.derived.monthly)}/เดือน × {fmtNumber(s.monthsWorked)} เดือน
              </span>
              <LinkButton onClick={() => onSso({ ssoMode: 'manual', socialSecurity: sso.derived.annual })}>
                กรอกเอง
              </LinkButton>
            </>
          ) : (
            <>
              <MoneyField
                field="ded:socialSecurity" stored={sso.typed} period={period}
                ariaLabel={`จำนวน ${spec.label}`} name={spec.label}
                onStored={v => onSso({ ssoMode: 'manual', socialSecurity: v })}
                onPeriod={onPeriod}
              />
              {sso.overridden && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--accent-strong)' }}>กรอกเอง (ทับค่าที่คำนวณ)</span>
                  <LinkButton onClick={() => onSso({ ssoMode: 'auto' })}>คำนวณใหม่</LinkButton>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 4, textAlign: 'right' }}>
        <LinkButton onClick={() => setOpenSettings(v => !v)} tone="var(--ink-3)">
          {openSettings ? 'ซ่อนเกณฑ์ประกันสังคม' : 'เกณฑ์ประกันสังคม'}
        </LinkButton>
      </div>

      {openSettings && (
        <div style={{
          marginTop: 8, padding: '10px 12px', background: 'var(--fill)',
          borderRadius: 'var(--radius-field)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <SettingRow label="ฐานค่าจ้างสูงสุด / เดือน">
            <MoneyInput
              key={`sso-ceiling-${s.wageCeiling}`} value={s.wageCeiling} width={110}
              ariaLabel="ฐานค่าจ้างสูงสุดของประกันสังคม"
              onChange={v => onSso({ ssoSettings: { ...s, wageCeiling: v } })}
            />
          </SettingRow>
          <SettingRow label="อัตราฝั่งลูกจ้าง (%)">
            <input
              className="input" inputMode="decimal" aria-label="อัตราประกันสังคมเป็นเปอร์เซ็นต์"
              defaultValue={String(Math.round(s.rate * 10000) / 100)}
              onChange={e => {
                const n = Number(String(e.target.value).replace(/[^\d.]/g, ''));
                if (Number.isFinite(n) && n > 0 && n <= 100) onSso({ ssoSettings: { ...s, rate: n / 100 } });
              }}
              style={{ ...mono, width: 72, textAlign: 'right', padding: '7px 10px', fontSize: 13 }}
            />
          </SettingRow>
          <SettingRow label="จำนวนเดือนที่ส่งเงินสมทบปีนี้">
            <input
              className="input" type="number" min={0} max={12} aria-label="จำนวนเดือนที่ส่งเงินสมทบ"
              value={s.monthsWorked}
              onChange={e => {
                const n = Math.max(0, Math.min(12, Number(e.target.value) || 0));
                onSso({ ssoSettings: { ...s, monthsWorked: n } });
              }}
              style={{ ...mono, width: 72, textAlign: 'right', padding: '7px 10px', fontSize: 13 }}
            />
          </SettingRow>
          <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.7 }}>
            ฐานค่าจ้างสูงสุดและอัตราเป็น<b>พารามิเตอร์ที่รัฐกำหนดและเปลี่ยนได้</b> —
            ตรวจกับประกาศของสำนักงานประกันสังคมทุกปีก่อนยื่น ·
            เพดานลดหย่อนทั้งปีคิดจากค่าพวกนี้ = {baht(sso.legalMax)}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>
      {children}
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function ResultCard({ result }) {
  const owed = result.balance > 0;
  const bands = result.bands.filter(b => b.amount > 0);
  const d = derivations(result);

  return (
    <Card>
      <CardHeader eyebrow="ผลการคำนวณ" title="เงินได้สุทธิ & ภาษี" />

      <Line label="เงินได้พึงประเมิน" value={baht(result.income.gross)} hint={d.gross} />
      <Line label={`หักค่าใช้จ่าย 50%${result.expenseCapped ? ` (ชนเพดาน ${baht(EXPENSE_CAP)})` : ''}`}
        value={'− ' + baht(result.expense)} hint={d.expense} />
      <Line label="หักค่าลดหย่อน" value={'− ' + baht(result.deductionTotal)}
        hint={`ส่วนตัว ${baht(result.rows.personal.allowed)}`
          + (result.rows.socialSecurity.allowed > 0 ? ` + ประกันสังคม ${baht(result.rows.socialSecurity.allowed)}` : '')
          + ` + อื่น ๆ ${baht(result.deductionTotal - result.rows.personal.allowed - result.rows.socialSecurity.allowed)}`} />
      <div style={{ height: 1, background: 'var(--border-strong)', margin: '8px 0' }} />
      <Line label="เงินได้สุทธิ" value={baht(result.netIncome)} strong hint={d.netIncome} />

      <div style={{ ...label10, marginTop: 18, marginBottom: 6 }}>ภาษีตามขั้นบันได</div>
      {bands.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '6px 0' }}>
          เงินได้สุทธิเป็นศูนย์ — ยังไม่เข้าขั้นใดเลย
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Two groups, not four columns: at 375px the money pair wraps onto
              its own right-aligned line instead of shredding the range label
              into "฿0–" / "฿150,000". */}
          {bands.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
              padding: '5px 0', borderTop: i ? '1px solid var(--hairline)' : 'none',
            }}>
              <span style={{ ...mono, fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                {baht(b.from)}–{Number.isFinite(b.to) ? baht(b.to) : 'ขึ้นไป'}
              </span>
              <span style={{ ...mono, fontSize: 11, color: b.rate ? 'var(--accent)' : 'var(--ink-4)' }}>
                {Math.round(b.rate * 100)}%
              </span>
              <span style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
                <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-2)', width: 92, textAlign: 'right' }}>
                  {baht(b.amount)}
                </span>
                <span style={{ ...mono, fontSize: 12.5, color: b.tax ? 'var(--ink)' : 'var(--ink-4)', width: 88, textAlign: 'right' }}>
                  {baht(b.tax)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 1, background: 'var(--border-strong)', margin: '10px 0 6px' }} />
      <Line label="ภาษีที่ต้องเสียทั้งปี" value={baht(result.tax)} strong hint={d.tax} />
      <Line label="หัก ณ ที่จ่าย ที่จ่ายไปแล้ว" value={'− ' + baht(result.income.wht)} />

      <div style={{
        marginTop: 12, padding: '14px 16px', borderRadius: 'var(--radius-field)',
        background: owed ? 'var(--danger-soft)' : 'var(--success-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: owed ? 'var(--loss)' : 'var(--profit)' }}>
          {result.balance === 0 ? 'พอดี ไม่ต้องจ่ายเพิ่มและไม่มีคืน' : owed ? 'ต้องจ่ายเพิ่ม' : 'ขอคืนได้'}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ ...mono, fontSize: 22, fontWeight: 500, color: owed ? 'var(--loss)' : 'var(--profit)' }}>
            {baht(Math.abs(result.balance))}
          </span>
          <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)' }}>{d.balance}</span>
        </span>
      </div>
    </Card>
  );
}

function Line({ label, value, strong, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: strong ? 14 : 13,
          color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400,
        }}>{label}</span>
        {hint && (
          <span style={{ ...mono, display: 'block', fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1, lineHeight: 1.5 }}>
            {hint}
          </span>
        )}
      </span>
      <span style={{ ...mono, fontSize: strong ? 16 : 13, color: 'var(--ink)', fontWeight: strong ? 500 : 400, whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

// ── "ควรทำยังไงต่อ" ─────────────────────────────────────────────────────────

function AdviceCard({ result }) {
  const summary = planningSummary(result);
  const rooms = useMemo(() => deductionHeadroom(result), [result]);
  const actionable = rooms.filter(r => r.room > 0 && r.taxSaved > 0);

  return (
    <Card variant="flat">
      <CardHeader eyebrow="ควรทำยังไงต่อ" title={summary.headline} meta={summary.detail} />

      {summary.state !== 'taxable' ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          ไม่มีอะไรต้องรีบซื้อเพิ่มเพื่อภาษีในปีนี้
        </div>
      ) : actionable.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.7 }}>
          ช่องลดหย่อนที่ระบบรู้จักถูกใช้เต็มเพดานหมดแล้ว — ส่วนที่เหลือต้องดูมาตรการรายปีของกรมสรรพากรเอง
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10, lineHeight: 1.6 }}>
            ช่องที่ยังเหลือเพดาน · ตัวเลขคือภาษีที่ประหยัดได้ถ้าใช้เต็มช่องนั้น (คำนวณตามขั้นบันไดจริง ไม่ใช่คูณอัตราเดียว)
          </div>
          {actionable.map(r => (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '9px 0', borderTop: '1px solid var(--hairline)', flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)' }}>
                  {r.label} เพิ่มได้อีก <b style={mono}>{baht(r.room)}</b>
                  {r.weight === 2 && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}> (หัก 2 เท่า)</span>}
                </div>
                <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>
                  ใช้ไปแล้ว {baht(r.used)}{r.cap != null ? ` / ${baht(r.cap)}` : ''}
                </div>
              </div>
              <div style={{ ...mono, fontSize: 14, color: 'var(--profit)', whiteSpace: 'nowrap' }}>
                ประหยัด ~{baht(r.taxSaved)}
              </div>
            </div>
          ))}
          <div style={{
            marginTop: 12, fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.7,
            borderTop: '1px solid var(--hairline)', paddingTop: 10,
          }}>
            นี่คือเลขคณิตของ "เพดานที่เหลือ × ขั้นภาษีของคุณ" เท่านั้น ไม่ใช่คำแนะนำให้ซื้อผลิตภัณฑ์ใด
            — เงินที่ใส่กองทุนเหล่านี้มีเงื่อนไขถือครองและมีความเสี่ยงของตัวมันเอง
          </div>
        </>
      )}
    </Card>
  );
}
