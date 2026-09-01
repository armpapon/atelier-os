import { useState, useEffect, useMemo } from 'react';
import { Button, Card, CardHeader, Badge, EmptyState } from '../ui/index.js';
import {
  updateMember,
  listVaccinations, createVaccination, deleteVaccination,
  listGrowthRecords, createGrowthRecord, deleteGrowthRecord,
  listMilestones, createMilestone, deleteMilestone,
} from '../../lib/api/family.js';
import { todayStr } from '../../lib/dates.js';
import { Icon } from '../Icon.jsx';

/** Whole years between a birth date and today, by the calendar. */
function calcAge(birthDate) {
  const b = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (isNaN(b)) return null;
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) years--;
  return years < 0 ? null : years;
}

// ─── Avatar helper (small inline copy to keep this file self-contained) ──────
function Avatar({ member, size = 56 }) {
  const initial = (member?.initial || member?.name || '?').charAt(0).toUpperCase();
  const baseStyle = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
    boxShadow: 'var(--shadow-card)',
  };
  if (member?.avatar_url) {
    return (
      <div style={baseStyle}>
        <img src={member.avatar_url} alt={member.name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{
      ...baseStyle, background: member?.color || 'var(--accent)',
      color: 'var(--text-inverse)', fontFamily: 'var(--f-display)',
      fontSize: size * 0.42, fontWeight: 500,
    }}>{initial}</div>
  );
}

const MILESTONE_CAT = {
  first:       { icon: '✨', label: 'ครั้งแรก' },
  physical:    { icon: '🏃', label: 'พัฒนาการ' },
  language:    { icon: '💬', label: 'ภาษา' },
  social:      { icon: '🤝', label: 'สังคม' },
  academic:    { icon: '📚', label: 'การเรียน' },
  achievement: { icon: '🏆', label: 'รางวัล' },
  general:     { icon: '◇',  label: 'ทั่วไป' },
};

const VACCINE_PRESETS = [
  'BCG', 'HEP B', 'DTaP', 'DTP', 'OPV', 'IPV', 'HIB', 'PCV',
  'Rotavirus', 'MMR', 'VAR', 'JE', 'HEP A', 'HPV', 'Influenza', 'COVID-19',
];

// ════════════════════════════════════════════════════════════════════════════
//  Main MemberDetail Drawer
// ════════════════════════════════════════════════════════════════════════════
export function MemberDetail({ member, onClose, onChange }) {
  const [tab, setTab] = useState('profile');

  if (!member) return null;

  // Calendar diff, not /365.25 — the average-year approximation reported the
  // wrong age for roughly 43% of the year.
  const age = member.birth_date ? calcAge(member.birth_date) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--dim)' }} />
      <div style={{
        position: 'relative', width: '90vw', maxWidth: 640, height: '100%',
        background: 'var(--background)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: 'var(--shadow-pop)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 26px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <Avatar member={member} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, color: 'var(--text-primary)' }}>
              {member.name}
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginTop: 3}}>
              {member.role}{age != null && ` · ${age} ปี`}
              {member.birth_date && ` · เกิด ${new Date(member.birth_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด"
            style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', fontSize: 22, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '12px 26px 0',
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          {[
            { id: 'profile',    label: 'Profile' },
            { id: 'health',     label: 'Health' },
            { id: 'growth',     label: 'Growth' },
            { id: 'milestones', label: 'Milestones' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="focus-ring"
              style={{
                padding: '9px 14px', border: 0, background: 'transparent',
                color: tab === t.id ? 'var(--accent-strong)' : 'var(--text-muted)',
                borderBottom: '2px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
                marginBottom: -1, cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--f-body)',
                fontWeight: tab === t.id ? 500 : 400, transition: 'all 130ms',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'profile'    && <ProfileTab    member={member} onChange={onChange} />}
          {tab === 'health'     && <HealthTab     member={member} onChange={onChange} />}
          {tab === 'growth'     && <GrowthTab     member={member} onChange={onChange} />}
          {tab === 'milestones' && <MilestonesTab member={member} onChange={onChange} />}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB · PROFILE — read-only summary
// ════════════════════════════════════════════════════════════════════════════
function ProfileTab({ member }) {
  return (
    <>
      <Card>
        <CardHeader eyebrow="ข้อมูลพื้นฐาน" title="Profile" />
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 14px' }}>
          <KV label="ชื่อ"            value={member.name} />
          <KV label="ความสัมพันธ์"  value={member.role || '—'} />
          <KV label="วันเกิด"         value={member.birth_date ? new Date(member.birth_date).toLocaleDateString('th-TH') : '—'} />
          <KV label="โน้ต"             value={member.note || '—'} multiline />
        </div>
      </Card>

      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center'}}>
        แก้ไขข้อมูล/รูปได้จากปุ่มแก้ไขบนการ์ดสมาชิก
      </div>
    </>
  );
}

function KV({ label, value, multiline }) {
  return (
    <>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', paddingTop: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: 13, color: 'var(--text-primary)',
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
      }}>{value}</div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB · HEALTH — profile fields + vaccinations
// ════════════════════════════════════════════════════════════════════════════
function HealthTab({ member, onChange }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    blood_type:          member.blood_type          || '',
    allergies:           member.allergies           || '',
    chronic_conditions:  member.chronic_conditions  || '',
    current_medications: member.current_medications || '',
    doctor_name:         member.doctor_name         || '',
    doctor_clinic:       member.doctor_clinic       || '',
    doctor_phone:        member.doctor_phone        || '',
    insurance_info:      member.insurance_info      || '',
    last_checkup:        member.last_checkup        || '',
  });
  const [vaccinations, setVaccinations] = useState([]);
  const [addingVacc, setAddingVacc] = useState(false);

  useEffect(() => {
    listVaccinations(member.id).then(setVaccinations).catch(() => setVaccinations([]));
  }, [member.id]);

  const saveHealth = async () => {
    try {
      await updateMember(member.id, {
        ...form,
        last_checkup: form.last_checkup || null,
      });
      setEditing(false);
      onChange?.();
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEmpty = !member.blood_type && !member.allergies && !member.doctor_name;

  return (
    <>
      {/* Health Profile Card */}
      <Card>
        <CardHeader
          eyebrow="ข้อมูลสุขภาพ"
          title="Health Profile"
          action={!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {isEmpty ? '+ เพิ่ม' : 'แก้ไข'}
            </Button>
          )}
        />

        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="เลือดกรุ๊ป">
                <select value={form.blood_type} onChange={e => set('blood_type', e.target.value)}
                  style={fieldInputStyle}>
                  <option value="">—</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="checkup ล่าสุด">
                <input type="date" value={form.last_checkup} onChange={e => set('last_checkup', e.target.value)} style={fieldInputStyle} />
              </Field>
            </div>
            <Field label="แพ้ยา / แพ้อาหาร"><input value={form.allergies} onChange={e => set('allergies', e.target.value)} placeholder="ถั่ว, นมวัว, เพนิซิลิน" style={fieldInputStyle} /></Field>
            <Field label="โรคประจำตัว"><input value={form.chronic_conditions} onChange={e => set('chronic_conditions', e.target.value)} placeholder="หอบหืด, ภูมิแพ้" style={fieldInputStyle} /></Field>
            <Field label="ยาที่กินประจำ"><input value={form.current_medications} onChange={e => set('current_medications', e.target.value)} placeholder="วิตามิน, ยาแก้แพ้" style={fieldInputStyle} /></Field>
            <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="หมอประจำ"><input value={form.doctor_name} onChange={e => set('doctor_name', e.target.value)} placeholder="พญ. สมหญิง" style={fieldInputStyle} /></Field>
              <Field label="คลินิก/รพ."><input value={form.doctor_clinic} onChange={e => set('doctor_clinic', e.target.value)} placeholder="สมิติเวช" style={fieldInputStyle} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field label="เบอร์หมอ"><input value={form.doctor_phone} onChange={e => set('doctor_phone', e.target.value)} placeholder="02-xxx-xxxx" style={fieldInputStyle} /></Field>
              <Field label="ประกัน"><input value={form.insurance_info} onChange={e => set('insurance_info', e.target.value)} placeholder="AIA / กรมธรรม์ #" style={fieldInputStyle} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>ยกเลิก</Button>
              <Button variant="primary" size="sm" onClick={saveHealth}><Icon name="save" size={14} /> บันทึก</Button>
            </div>
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={<Icon name="health" size={20} />}
            title="ยังไม่ได้บันทึกข้อมูลสุขภาพ"
            description="เลือดกรุ๊ป · แพ้ยา · หมอประจำ — มีประโยชน์ตอนพาไปหาหมอ / ฉุกเฉิน"
            actionLabel="เริ่มบันทึก"
            onAction={() => setEditing(true)}
            compact
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {member.blood_type && <InfoChip icon={<Icon name="drop" size={15} />} label="เลือดกรุ๊ป" value={member.blood_type} />}
              {member.last_checkup && <InfoChip icon={<Icon name="calendar" size={15} />} label="checkup" value={new Date(member.last_checkup).toLocaleDateString('th-TH')} />}
            </div>
            {member.allergies && <InfoBlock icon={<Icon name="warning" size={15} />} label="แพ้ยา/อาหาร" value={member.allergies} tone="danger" />}
            {member.chronic_conditions && <InfoBlock icon={<Icon name="health" size={15} />} label="โรคประจำตัว" value={member.chronic_conditions} />}
            {member.current_medications && <InfoBlock icon={<Icon name="pill" size={15} />} label="ยาประจำ" value={member.current_medications} />}
            {(member.doctor_name || member.doctor_phone) && (
              <InfoBlock
                icon={<Icon name="user" size={20} />} label="หมอประจำ"
                value={[member.doctor_name, member.doctor_clinic, member.doctor_phone].filter(Boolean).join(' · ')}
              />
            )}
            {member.insurance_info && <InfoBlock icon={<Icon name="shield" size={15} />} label="ประกัน" value={member.insurance_info} />}
          </div>
        )}
      </Card>

      {/* Vaccinations */}
      <Card>
        <CardHeader
          eyebrow={`วัคซีน · ${vaccinations.length} เข็ม`}
          title="Vaccinations"
          action={<Button variant="secondary" size="sm" onClick={() => setAddingVacc(true)}>+ เพิ่ม</Button>}
        />

        {addingVacc && (
          <VaccinationForm memberId={member.id}
            onSubmit={async () => {
              setAddingVacc(false);
              setVaccinations(await listVaccinations(member.id));
            }}
            onCancel={() => setAddingVacc(false)}
          />
        )}

        {vaccinations.length === 0 && !addingVacc ? (
          <EmptyState
            icon={<Icon name="syringe" size={20} />} title="ยังไม่มีบันทึกวัคซีน"
            description="บันทึกประวัติวัคซีน เผื่อต้องใช้ตอนเดินทาง / สมัครเรียน"
            actionLabel="เพิ่มวัคซีนแรก"
            onAction={() => setAddingVacc(true)}
            compact
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {vaccinations.map(v => (
              <div key={v.id} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr auto auto', gap: 10,
                padding: '8px 12px', alignItems: 'center', fontSize: 12.5,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-control)',
              }}>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {v.date_given ? new Date(v.date_given).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}
                </span>
                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v.vaccine_name}</span>
                  {v.dose_number && <Badge tone="neutral" size="sm" style={{ marginLeft: 6 }}>เข็ม {v.dose_number}</Badge>}
                  {v.location && <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums', marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>{v.location}</span>}
                </div>
                {v.next_due && (
                  <Badge tone="warning" size="sm">
                    เข็มถัดไป {new Date(v.next_due).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </Badge>
                )}
                <button onClick={() => { if (confirm(`ลบ ${v.vaccine_name}?`)) deleteVaccination(v.id).then(async () => setVaccinations(await listVaccinations(member.id))); }}
                  aria-label="ลบ"
                  style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 4 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function VaccinationForm({ memberId, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    vaccine_name: '', date_given: '', dose_number: '', next_due: '', location: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.vaccine_name.trim()) return;
    try {
      await createVaccination({
        member_id: memberId,
        vaccine_name: form.vaccine_name.trim(),
        date_given: form.date_given || null,
        dose_number: form.dose_number ? Number(form.dose_number) : null,
        next_due: form.next_due || null,
        location: form.location.trim() || null,
      });
      onSubmit();
    } catch (err) { alert(err.message); }
  };

  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 12, marginBottom: 8,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6 }}>
        <input list="vaccine-list" value={form.vaccine_name} onChange={e => set('vaccine_name', e.target.value)}
          placeholder="ชื่อวัคซีน" required style={fieldInputStyle} />
        <datalist id="vaccine-list">{VACCINE_PRESETS.map(v => <option key={v} value={v} />)}</datalist>
        <input type="number" min="1" value={form.dose_number} onChange={e => set('dose_number', e.target.value)}
          placeholder="เข็ม" style={{ fontVariantNumeric: 'tabular-nums', ...fieldInputStyle }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <input type="date" value={form.date_given} onChange={e => set('date_given', e.target.value)}
          style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
        <input type="date" value={form.next_due} onChange={e => set('next_due', e.target.value)}
          placeholder="เข็มถัดไป" style={{ fontVariantNumeric: 'tabular-nums', ...fieldInputStyle, color: 'var(--text-secondary)' }} />
        <input value={form.location} onChange={e => set('location', e.target.value)}
          placeholder="รพ." style={fieldInputStyle} />
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">+ เพิ่ม</Button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB · GROWTH — height/weight chart + measurements log
// ════════════════════════════════════════════════════════════════════════════
function GrowthTab({ member }) {
  const [records, setRecords] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listGrowthRecords(member.id).then(setRecords).catch(() => setRecords([]));
  }, [member.id]);

  const refresh = async () => setRecords(await listGrowthRecords(member.id));
  const latest = records.length > 0 ? records[records.length - 1] : null;
  const first  = records[0];

  return (
    <>
      <Card>
        <CardHeader
          eyebrow={`พัฒนาการ · ${records.length} บันทึก`}
          title="Growth Log"
          meta={latest ? `ล่าสุด ${new Date(latest.recorded_at).toLocaleDateString('th-TH')}` : null}
          action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ วัดใหม่</Button>}
        />

        {adding && <GrowthForm memberId={member.id}
          onSubmit={async () => { setAdding(false); await refresh(); }}
          onCancel={() => setAdding(false)} />}

        {records.length === 0 && !adding ? (
          <EmptyState
            icon={<Icon name="ruler" size={20} />} title="ยังไม่มีข้อมูลพัฒนาการ"
            description="บันทึกส่วนสูง · น้ำหนัก · รอบหัว ดูแนวโน้มและจุดสำคัญ"
            actionLabel="เริ่มบันทึก" onAction={() => setAdding(true)} compact
          />
        ) : (
          <>
            {/* Latest stats */}
            {latest && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                <StatTile label="ส่วนสูง" value={latest.height_cm} unit="cm"
                  delta={first && first !== latest && first.height_cm ? latest.height_cm - first.height_cm : null} />
                <StatTile label="น้ำหนัก" value={latest.weight_kg} unit="kg"
                  delta={first && first !== latest && first.weight_kg ? latest.weight_kg - first.weight_kg : null} />
                <StatTile label="รอบหัว" value={latest.head_cm} unit="cm" />
              </div>
            )}

            {/* Chart */}
            {records.length >= 2 && <GrowthChart records={records} />}

            {/* Log */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...records].reverse().map(r => (
                <div key={r.id} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: 10,
                  padding: '7px 12px', fontSize: 12,
                  borderBottom: '1px solid var(--hairline)',
                }}>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {new Date(r.recorded_at).toLocaleDateString('th-TH')}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--f-mono)' }}>
                    {r.height_cm && `${r.height_cm}cm`}
                    {r.weight_kg && `${r.weight_kg}kg`}
                    {r.head_cm && `${r.head_cm}cm`}
                    {r.notes && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontFamily: 'var(--f-body)' }}>· {r.notes}</span>}
                  </span>
                  <button onClick={() => { if (confirm('ลบรายการนี้?')) deleteGrowthRecord(r.id).then(refresh); }}
                    aria-label="ลบ"
                    style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 2 }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function StatTile({ label, value, unit, delta }) {
  return (
    <div style={{
      padding: '10px 12px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 500, color: value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {value || '—'} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{value && unit}</span>
      </div>
      {delta != null && delta !== 0 && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: delta > 0 ? 'var(--success)' : 'var(--danger)' }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unit}
        </div>
      )}
    </div>
  );
}

function GrowthForm({ memberId, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    recorded_at: todayStr(),
    height_cm: '', weight_kg: '', head_cm: '', notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.height_cm && !form.weight_kg && !form.head_cm) {
      alert('ใส่อย่างน้อย 1 ค่า'); return;
    }
    try {
      await createGrowthRecord({
        member_id: memberId,
        recorded_at: form.recorded_at,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        head_cm:   form.head_cm   ? Number(form.head_cm)   : null,
        notes: form.notes.trim() || null,
      });
      onSubmit();
    } catch (err) { alert(err.message); }
  };
  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 12, marginBottom: 8,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
        <input type="date" value={form.recorded_at} onChange={e => set('recorded_at', e.target.value)}
          style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
        <input type="number" step="0.1" value={form.height_cm} onChange={e => set('height_cm', e.target.value)}
          placeholder="ส่วนสูง cm" style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)' }} />
        <input type="number" step="0.1" value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)}
          placeholder="น้ำหนัก kg" style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)' }} />
        <input type="number" step="0.1" value={form.head_cm} onChange={e => set('head_cm', e.target.value)}
          placeholder="รอบหัว cm" style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)' }} />
      </div>
      <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="โน้ต (ถ้ามี)" style={fieldInputStyle} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">+ บันทึก</Button>
      </div>
    </form>
  );
}

// Simple dual-axis SVG line chart (height + weight)
function GrowthChart({ records }) {
  const W = 540, H = 180, padL = 36, padR = 36, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;

  const heights = records.filter(r => r.height_cm).map(r => ({ x: new Date(r.recorded_at).getTime(), y: Number(r.height_cm) }));
  const weights = records.filter(r => r.weight_kg).map(r => ({ x: new Date(r.recorded_at).getTime(), y: Number(r.weight_kg) }));

  if (!heights.length && !weights.length) return null;

  const allX = [...heights, ...weights].map(p => p.x);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const xRange = Math.max(1, maxX - minX);

  const hMin = heights.length ? Math.min(...heights.map(p => p.y)) : 0;
  const hMax = heights.length ? Math.max(...heights.map(p => p.y)) : 0;
  const hPad = Math.max(2, (hMax - hMin) * 0.15);
  const hRange = Math.max(2, (hMax + hPad) - (hMin - hPad));

  const wMin = weights.length ? Math.min(...weights.map(p => p.y)) : 0;
  const wMax = weights.length ? Math.max(...weights.map(p => p.y)) : 0;
  const wPad = Math.max(1, (wMax - wMin) * 0.15);
  const wRange = Math.max(1, (wMax + wPad) - (wMin - wPad));

  const xPos = (x) => padL + ((x - minX) / xRange) * iw;
  const hY   = (y) => padT + ih - ((y - (hMin - hPad)) / hRange) * ih;
  const wY   = (y) => padT + ih - ((y - (wMin - wPad)) / wRange) * ih;

  const hPath = heights.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x)} ${hY(p.y)}`).join(' ');
  const wPath = weights.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.x)} ${wY(p.y)}`).join(' ');

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-control)', padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontVariantNumeric: 'tabular-nums', display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
        <span style={{ color: 'var(--blue)' }}><Icon name="ruler" size={13} /> ส่วนสูง (cm)</span>
        <span style={{ color: 'var(--accent-strong)' }}><Icon name="scale" size={13} /> น้ำหนัก (kg)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* Baseline */}
        <line x1={padL} x2={W - padR} y1={padT + ih} y2={padT + ih} stroke="var(--border)" strokeWidth="1" />

        {/* Height line + dots */}
        {heights.length > 0 && (
          <>
            <path d={hPath} stroke="var(--blue)" strokeWidth="2" fill="none" />
            {heights.map((p, i) => <circle key={i} cx={xPos(p.x)} cy={hY(p.y)} r="3" fill="var(--blue)" />)}
            <text x={padL - 4} y={hY(hMax)} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end" dominantBaseline="middle">{hMax.toFixed(0)}</text>
            <text x={padL - 4} y={hY(hMin)} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end" dominantBaseline="middle">{hMin.toFixed(0)}</text>
          </>
        )}

        {/* Weight line + dots */}
        {weights.length > 0 && (
          <>
            <path d={wPath} stroke="var(--accent-strong)" strokeWidth="2" fill="none" strokeDasharray="4 3" />
            {weights.map((p, i) => <circle key={i} cx={xPos(p.x)} cy={wY(p.y)} r="3" fill="var(--accent-strong)" />)}
            <text x={W - padR + 4} y={wY(wMax)} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="start" dominantBaseline="middle">{wMax.toFixed(1)}</text>
            <text x={W - padR + 4} y={wY(wMin)} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="start" dominantBaseline="middle">{wMin.toFixed(1)}</text>
          </>
        )}

        {/* X axis labels — first + last */}
        <text x={padL} y={H - 8} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)">
          {new Date(minX).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}
        </text>
        <text x={W - padR} y={H - 8} fontSize="9" fill="var(--text-muted)" fontFamily="var(--f-mono)" textAnchor="end">
          {new Date(maxX).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })}
        </text>
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TAB · MILESTONES — timeline of memorable moments
// ════════════════════════════════════════════════════════════════════════════
function MilestonesTab({ member }) {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listMilestones(member.id).then(setItems).catch(() => setItems([]));
  }, [member.id]);

  const refresh = async () => setItems(await listMilestones(member.id));

  // Group by year
  const grouped = useMemo(() => {
    const map = {};
    for (const m of items) {
      const yr = new Date(m.milestone_date).getFullYear();
      (map[yr] = map[yr] || []).push(m);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [items]);

  return (
    <Card>
      <CardHeader
        eyebrow={`ความทรงจำ · ${items.length}`}
        title="Milestones"
        action={<Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ เพิ่ม</Button>}
      />

      {adding && <MilestoneForm memberId={member.id}
        onSubmit={async () => { setAdding(false); await refresh(); }}
        onCancel={() => setAdding(false)} />}

      {items.length === 0 && !adding ? (
        <EmptyState
          icon={<Icon name="star" size={20} />} title="ยังไม่มี milestone"
          description="บันทึกช่วงเวลาสำคัญ — เดินครั้งแรก พูดประโยคแรก โรงเรียนใหม่ รางวัล"
          actionLabel="เพิ่ม milestone แรก"
          onAction={() => setAdding(true)}
          compact
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(([year, list]) => (
            <div key={year}>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                {Number(year) + 543}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map(m => {
                  const cat = MILESTONE_CAT[m.category] || MILESTONE_CAT.general;
                  return (
                    <div key={m.id} style={{
                      display: 'grid', gridTemplateColumns: '34px 60px 1fr auto', gap: 10,
                      padding: '10px 12px', fontSize: 12.5,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-control)', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 17 }}>{cat.icon}</span>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {new Date(m.milestone_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{m.title}</div>
                        {m.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.notes}</div>}
                      </div>
                      <button onClick={() => { if (confirm('ลบ?')) deleteMilestone(m.id).then(refresh); }}
                        aria-label="ลบ"
                        style={{ background: 'none', border: 0, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', padding: 2 }}>×</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function MilestoneForm({ memberId, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    milestone_date: todayStr(),
    title: '', category: 'general', notes: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await createMilestone({
        member_id: memberId,
        milestone_date: form.milestone_date,
        title: form.title.trim(),
        category: form.category,
        notes: form.notes.trim() || null,
      });
      onSubmit();
    } catch (err) { alert(err.message); }
  };
  return (
    <form onSubmit={submit} style={{
      background: 'var(--background-soft)', border: '1px solid var(--border-strong)',
      borderRadius: 'var(--radius-control)', padding: 12, marginBottom: 12,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 6 }}>
        <input value={form.title} onChange={e => set('title', e.target.value)}
          placeholder='เช่น "เดินได้เอง" "ขี่จักรยานเป็น"' required style={fieldInputStyle} />
        <input type="date" value={form.milestone_date} onChange={e => set('milestone_date', e.target.value)}
          style={{ ...fieldInputStyle, fontFamily: 'var(--f-mono)', color: 'var(--text-secondary)' }} />
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {Object.entries(MILESTONE_CAT).map(([k, m]) => (
          <button key={k} type="button" onClick={() => set('category', k)} className="focus-ring"
            style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums',
              padding: '4px 10px', borderRadius: 'var(--radius-pill)', fontSize: 13, cursor: 'pointer',
              background: form.category === k ? 'var(--accent-soft)' : 'var(--surface)',
              color: form.category === k ? 'var(--accent-strong)' : 'var(--text-secondary)',
              border: `1px solid ${form.category === k ? 'var(--accent)' : 'var(--border)'}`
            }}>{m.icon} {m.label}</button>
        ))}
      </div>
      <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="โน้ต / รายละเอียด" style={fieldInputStyle} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" variant="primary" size="sm">+ เพิ่ม</Button>
      </div>
    </form>
  );
}

// ─── Reusable bits ──────────────────────────────────────────────────────────
const fieldInputStyle = {
  background: 'var(--fill)', border: '1px solid transparent',
  borderRadius: 'var(--radius-field)', padding: '7px 10px',
  color: 'var(--text-primary)', fontSize: 12.5, width: '100%',
};

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoChip({ icon, label, value }) {
  return (
    <div style={{
      padding: '8px 12px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)'}}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  );
}

function InfoBlock({ icon, label, value, tone }) {
  const bg = tone === 'danger' ? 'var(--danger-soft)' : 'var(--background-soft)';
  const bd = tone === 'danger' ? 'var(--danger)' : 'var(--border)';
  return (
    <div style={{
      padding: '10px 14px', background: bg, border: '1px solid ' + bd,
      borderRadius: 'var(--radius-control)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: 13, color: 'var(--text-muted)', marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 13, color: tone === 'danger' ? 'var(--danger)' : 'var(--text-primary)', lineHeight: 1.5 }}>
          {value}
        </div>
      </div>
    </div>
  );
}
