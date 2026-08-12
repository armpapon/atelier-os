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

  const setDeduction = useCallback((key, value) => {
    if (!active) return;
    patchProfile(active.id, { deductions: { ...(active.deductions || {}), [key]: value } });
  }, [active, patchProfile]);

  // ── Results, for every person (household total needs them all) ────────────
  const results = useMemo(
    () => new Map(profiles.map(p => [p.id, computeTax({ income: p.income, deductions: p.deductions })])),
    [profiles],
  );
  const activeResult = active ? results.get(active.id) : null;

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
      const arm = await createProfile({ tax_year: year, person_name: 'อาร์ม', is_self: true, sort_order: 0 });
      const pat = await createProfile({ tax_year: year, person_name: 'แพท', is_self: false, sort_order: 1 });
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
                  <IncomeCard
                    key={`income-${active.id}`}
                    profile={active} result={activeResult} onChange={setIncome}
                  />
                  <DeductionsCard
                    key={`ded-${active.id}`}
                    profile={active} result={activeResult}
                    onChange={setDeduction}
                    onCustomChange={rows => patchProfile(active.id, {
                      deductions: { ...(active.deductions || {}), custom: rows },
                    })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
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

function CountInput({ value, onChange, ariaLabel, max }) {
  return (
    <input
      className="input" type="number" min={0} max={max ?? undefined} aria-label={ariaLabel}
      value={Number(value) > 0 ? Number(value) : ''}
      placeholder="0"
      onChange={e => {
        const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
        onChange(max != null ? Math.min(n, max) : n);
      }}
      style={{ ...mono, width: 72, textAlign: 'right', padding: '7px 10px', fontSize: 13, flexShrink: 0 }}
    />
  );
}

// ── Income ──────────────────────────────────────────────────────────────────

function IncomeCard({ profile, result, onChange }) {
  const income = profile.income || {};
  const other = Array.isArray(income.other) ? income.other : [];

  const setOther = (rows) => onChange({ other: rows });

  return (
    <Card>
      <CardHeader eyebrow="รายได้" title={`เงินได้ของ ${profile.person_name}`}
        meta={`เงินได้พึงประเมินทั้งปี ${baht(result.income.gross)}`} />

      <FormRow label="เงินเดือน / เดือน" hint={`× 12 = ${baht(result.income.salaryAnnual)}`}>
        <MoneyInput key="sal" value={income.salaryMonthly} ariaLabel="เงินเดือนต่อเดือน"
          onChange={v => onChange({ salaryMonthly: v })} />
      </FormRow>

      <FormRow label="โบนัส / เงินได้ก้อนอื่นทั้งปี">
        <MoneyInput key="bonus" value={income.bonus} ariaLabel="โบนัส"
          onChange={v => onChange({ bonus: v })} />
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
            style={{ flex: 1, minWidth: 120, fontSize: 13, padding: '7px 10px' }}
          />
          <MoneyInput key={`other-${i}`} value={row?.amount} ariaLabel={`จำนวนรายได้อื่นรายการที่ ${i + 1}`}
            onChange={v => setOther(other.map((r, j) => (j === i ? { ...r, amount: v } : r)))} />
          <button onClick={() => setOther(other.filter((_, j) => j !== i))} className="focus-ring"
            aria-label={`ลบรายได้อื่นรายการที่ ${i + 1}`}
            style={{ background: 'none', border: 0, color: 'var(--ink-3)', cursor: 'pointer', fontSize: 16, padding: 4 }}>×</button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => setOther([...other, { label: '', amount: 0 }])}>
        + เพิ่มรายได้อื่น
      </Button>

      <div style={{ height: 1, background: 'var(--hairline)', margin: '16px 0' }} />

      <FormRow label="ภาษีหัก ณ ที่จ่าย ที่ถูกหักไปแล้ว" hint="ดูจากหนังสือรับรอง 50 ทวิ">
        <MoneyInput key="wht" value={income.wht} ariaLabel="ภาษีหัก ณ ที่จ่าย"
          onChange={v => onChange({ wht: v })} />
      </FormRow>
    </Card>
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

function DeductionsCard({ profile, result, onChange, onCustomChange }) {
  const ded = profile.deductions || {};
  const custom = Array.isArray(ded.custom) ? ded.custom : [];

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
        </div>
        <div style={{ ...mono, fontSize: 13.5, color: 'var(--ink)' }}>{baht(result.expense)}</div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.title} style={{ marginBottom: 18 }}>
          <div style={{ ...label10, marginBottom: 6 }}>{section.title}</div>
          {section.keys.map(key => (
            <DeductionRow
              key={key} spec={DEDUCTIONS.find(d => d.key === key)}
              row={result.rows[key]} value={ded[key]}
              onChange={v => onChange(key, v)}
            />
          ))}
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
            style={{ flex: 1, minWidth: 120, fontSize: 13, padding: '7px 10px' }}
          />
          <MoneyInput key={`c-${i}`} value={row?.amount} ariaLabel={`จำนวนลดหย่อนอื่นรายการที่ ${i + 1}`}
            onChange={v => onCustomChange(custom.map((r, j) => (j === i ? { ...r, amount: v } : r)))} />
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

function DeductionRow({ spec, row, value, onChange }) {
  const claimed = Number(value) || 0;
  const [open, setOpen] = useState(claimed > 0);
  if (!spec || !row) return null;

  const auto = spec.kind === 'auto';
  const isCount = spec.kind === 'count';
  const capText = Number.isFinite(row.cap) && row.cap > 0 && !isCount ? `เพดาน ${baht(row.cap)}` : null;

  const toggle = (on) => {
    setOpen(on);
    if (!on) onChange(0);
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {auto ? (
          <span style={{ ...mono, fontSize: 13, color: 'var(--ink)', minWidth: 132, textAlign: 'right' }}>
            {baht(row.allowed)}
          </span>
        ) : !open ? (
          <span style={{ ...mono, fontSize: 12, color: 'var(--ink-4)', minWidth: 132, textAlign: 'right' }}>—</span>
        ) : isCount ? (
          <>
            <CountInput value={value} max={spec.maxCount} ariaLabel={`จำนวน ${spec.label}`} onChange={onChange} />
            <span style={{ ...mono, fontSize: 12, color: 'var(--ink-2)', width: 52, textAlign: 'right' }}>
              {baht(row.allowed)}
            </span>
          </>
        ) : (
          <MoneyInput value={value} ariaLabel={`จำนวน ${spec.label}`} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

// ── Results ─────────────────────────────────────────────────────────────────

function ResultCard({ result }) {
  const owed = result.balance > 0;
  const bands = result.bands.filter(b => b.amount > 0);

  return (
    <Card>
      <CardHeader eyebrow="ผลการคำนวณ" title="เงินได้สุทธิ & ภาษี" />

      <Line label="เงินได้พึงประเมิน" value={baht(result.income.gross)} />
      <Line label={`หักค่าใช้จ่าย 50%${result.expenseCapped ? ` (ชนเพดาน ${baht(EXPENSE_CAP)})` : ''}`}
        value={'− ' + baht(result.expense)} />
      <Line label="หักค่าลดหย่อน" value={'− ' + baht(result.deductionTotal)} />
      <div style={{ height: 1, background: 'var(--border-strong)', margin: '8px 0' }} />
      <Line label="เงินได้สุทธิ" value={baht(result.netIncome)} strong />

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
      <Line label="ภาษีที่ต้องเสียทั้งปี" value={baht(result.tax)} strong />
      <Line label="หัก ณ ที่จ่าย ที่จ่ายไปแล้ว" value={'− ' + baht(result.income.wht)} />

      <div style={{
        marginTop: 12, padding: '14px 16px', borderRadius: 'var(--radius-field)',
        background: owed ? 'var(--danger-soft)' : 'var(--success-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: owed ? 'var(--loss)' : 'var(--profit)' }}>
          {result.balance === 0 ? 'พอดี ไม่ต้องจ่ายเพิ่มและไม่มีคืน' : owed ? 'ต้องจ่ายเพิ่ม' : 'ขอคืนได้'}
        </span>
        <span style={{ ...mono, fontSize: 22, fontWeight: 500, color: owed ? 'var(--loss)' : 'var(--profit)' }}>
          {baht(Math.abs(result.balance))}
        </span>
      </div>
    </Card>
  );
}

function Line({ label, value, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ fontSize: strong ? 14 : 13, color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 600 : 400 }}>
        {label}
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
