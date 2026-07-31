import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, Badge, Button } from '../ui/index.js';
import {
  getPlan, upsertPlan, uploadChartImage, addChartImageUrl, removeChartImageUrl,
  formatThaiDate, getWeekStart,
} from '../../lib/api/tradingPlans.js';

const BIAS_META = {
  bullish: { label: '↗ Bullish', tone: 'success', color: 'var(--success)' },
  bearish: { label: '↘ Bearish', tone: 'danger',  color: 'var(--danger)'  },
  neutral: { label: '◇ Neutral', tone: 'neutral', color: 'var(--text-muted)' },
};

const todayStr = () => new Date().toISOString().split('T')[0];

export function DailyPlanCard() {
  const [date, setDate]       = useState(todayStr());
  const [plan, setPlan]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  // Edit form state
  const [form, setForm] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPlan(date).then(p => {
      if (cancelled) return;
      setPlan(p);
      if (!p) { setEditing(true); setForm(defaultForm()); }
      else    { setEditing(false); setForm({ ...p }); }
    }).catch(e => setError(e.message)).finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [date]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const saved = await upsertPlan({
        ...form, plan_date: date,
        chart_images: plan?.chart_images || form.chart_images || [],
      });
      setPlan(saved); setForm({ ...saved });
      setEditing(false);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const navDay = (delta) => {
    const d = new Date(date); d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  };

  const weekStart = getWeekStart(date);

  return (
    <Card>
      <CardHeader
        eyebrow={`📋 DAILY TRADING PLAN · WEEK OF ${weekStart}`}
        title={formatThaiDate(date)}
        meta={plan ? `อัพเดตล่าสุด ${new Date(plan.updated_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : 'ยังไม่มีแผนวันนี้'}
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="ghost" size="sm" onClick={() => navDay(-1)} title="วันก่อน">‹</Button>
            <Button variant="ghost" size="sm" onClick={() => setDate(todayStr())} title="วันนี้">วันนี้</Button>
            <Button variant="ghost" size="sm" onClick={() => navDay(+1)} title="วันหน้า">›</Button>
            {plan && !editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>✎ แก้ไข</Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>
          กำลังโหลด…
        </div>
      ) : editing ? (
        <PlanForm form={form} set={set} onSave={handleSave} onCancel={() => { setEditing(!!plan); if (plan) setForm({ ...plan }); }}
          saving={saving} error={error} plan={plan} onImageChange={async () => setPlan(await getPlan(date))} />
      ) : plan ? (
        <PlanView plan={plan} onImageRemove={async (url) => {
          if (!confirm('ลบรูปนี้?')) return;
          await removeChartImageUrl(plan.id, url);
          setPlan(await getPlan(date));
        }} />
      ) : (
        <div style={{
          padding: '32px 20px', textAlign: 'center',
          background: 'var(--background-soft)', border: '1px dashed var(--border-strong)',
          borderRadius: 'var(--radius-control)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
            ยังไม่ได้เขียนแผนวันนี้
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            เริ่มที่ Weekly Bias → Daily Bias → Session Plan
          </div>
          <Button variant="primary" onClick={() => { setEditing(true); setForm(defaultForm()); }}>
            + สร้างแผนวันนี้
          </Button>
        </div>
      )}
    </Card>
  );
}

function defaultForm() {
  return {
    weekly_bias: '', weekly_reason: '', weekly_key_levels: '',
    daily_bias: '', daily_reason: '', daily_invalidation: '', daily_key_levels: '',
    news_events: '', session_plan: '',
    bias_was_correct: null, end_of_day: '',
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  Plan View (read-only)
// ════════════════════════════════════════════════════════════════════════════
function PlanView({ plan, onImageRemove }) {
  const weekly = BIAS_META[plan.weekly_bias];
  const daily  = BIAS_META[plan.daily_bias];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Weekly Bias */}
      <Section icon="🗓" label="Weekly Bias">
        {weekly ? <Badge tone={weekly.tone} size="lg">{weekly.label}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        {plan.weekly_reason && <ParaBlock label="เหตุผล (W1/D1)">{plan.weekly_reason}</ParaBlock>}
        {plan.weekly_key_levels && <ParaBlock label="Key Levels สัปดาห์" mono>{plan.weekly_key_levels}</ParaBlock>}
      </Section>

      {/* Daily Bias */}
      <Section icon="📅" label="Daily Bias">
        {daily ? <Badge tone={daily.tone} size="lg">{daily.label}</Badge> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        {plan.daily_reason       && <ParaBlock label="เหตุผล (H4/H1)">{plan.daily_reason}</ParaBlock>}
        {plan.daily_invalidation && <ParaBlock label="Invalidation">{plan.daily_invalidation}</ParaBlock>}
        {plan.daily_key_levels   && <ParaBlock label="Key Levels วันนี้" mono>{plan.daily_key_levels}</ParaBlock>}
      </Section>

      {plan.news_events && (
        <Section icon="📰" label="News / Events">
          <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{plan.news_events}</div>
        </Section>
      )}

      {plan.session_plan && (
        <Section icon="🎯" label="Session Plan">
          <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{plan.session_plan}</div>
        </Section>
      )}

      {/* Chart images */}
      {plan.chart_images?.length > 0 && (
        <Section icon="📸" label={`Charts (${plan.chart_images.length})`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {plan.chart_images.map((url, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 'var(--radius-control)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <a href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`chart ${i+1}`}
                    style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                </a>
                <button onClick={() => onImageRemove(url)} aria-label="ลบรูป"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--dim)', color: 'var(--text-inverse)', border: 0,
                    cursor: 'pointer', fontSize: 12,
                  }}>×</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* End of day */}
      {(plan.end_of_day || plan.bias_was_correct !== null) && (
        <Section icon="🌙" label="End of Day">
          {plan.bias_was_correct !== null && (
            <Badge tone={plan.bias_was_correct ? 'success' : 'danger'} size="sm">
              Bias {plan.bias_was_correct ? 'ถูก ✓' : 'ผิด ✗'}
            </Badge>
          )}
          {plan.end_of_day && <ParaBlock label="สรุปวันนี้">{plan.end_of_day}</ParaBlock>}
        </Section>
      )}
    </div>
  );
}

function Section({ icon, label, children }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', marginBottom: 8 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function ParaBlock({ label, children, mono }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.65,
        whiteSpace: 'pre-wrap', fontFamily: mono ? 'var(--f-mono)' : 'var(--f-body)',
      }}>{children}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Plan Form (edit)
// ════════════════════════════════════════════════════════════════════════════
function PlanForm({ form, set, onSave, onCancel, saving, error, plan, onImageChange }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handlePickFiles = async (files) => {
    if (!files?.length) return;
    if (!plan) { alert('กรุณาบันทึกแผนก่อนอัพโหลดรูป (กด 💾 บันทึก ก่อน)'); return; }
    setUploading(true);
    try {
      let idx = plan.chart_images?.length || 0;
      for (const file of files) {
        const url = await uploadChartImage(file, plan.id, idx++);
        await addChartImageUrl(plan.id, url);
      }
      await onImageChange();
    } catch (e) { alert('อัพโหลดไม่สำเร็จ: ' + e.message); }
    finally { setUploading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Weekly Bias */}
      <FormSection icon="🗓" label="Weekly Bias (ทุกจันทร์)">
        <BiasPicker value={form.weekly_bias} onChange={v => set('weekly_bias', v)} />
        <FieldTA label="เหตุผล (W1/D1)" value={form.weekly_reason}
          onChange={v => set('weekly_reason', v)} rows={2}
          placeholder='เช่น "ราคา sweep low สัปดาห์ก่อน + rebound จาก Weekly FVG — คาด continuation ขึ้น"' />
        <FieldTA label="Key Levels สัปดาห์" value={form.weekly_key_levels}
          onChange={v => set('weekly_key_levels', v)} rows={2} mono
          placeholder="Weekly High: 4,560&#10;Weekly Low:  4,470&#10;Weekly FVG:  4,510-4,525" />
      </FormSection>

      {/* Daily Bias */}
      <FormSection icon="📅" label="Daily Bias (ทุกเช้า)">
        <BiasPicker value={form.daily_bias} onChange={v => set('daily_bias', v)} />
        <FieldTA label="เหตุผล (H4/H1)" value={form.daily_reason}
          onChange={v => set('daily_reason', v)} rows={2}
          placeholder='เช่น "BOS H4 ขึ้น + ราคา pullback เข้า Daily FVG — รอ entry Long"' />
        <FieldTA label="Invalidation" value={form.daily_invalidation}
          onChange={v => set('daily_invalidation', v)} rows={1}
          placeholder='ถ้า...ราคาทำอะไร...จะเปลี่ยน Bias' />
        <FieldTA label="Key Levels วันนี้" value={form.daily_key_levels}
          onChange={v => set('daily_key_levels', v)} rows={3} mono
          placeholder="Asia High: &#10;Asia Low:  &#10;PDH:       &#10;PDL:       &#10;Daily FVG: " />
      </FormSection>

      {/* News + Session */}
      <FormSection icon="📰" label="News / Events">
        <FieldTA value={form.news_events} onChange={v => set('news_events', v)} rows={1}
          placeholder="เช่น CPI 19:30, FOMC, NFP" />
      </FormSection>

      <FormSection icon="🎯" label="Session Plan (London / NY / Silver Bullet)">
        <FieldTA value={form.session_plan} onChange={v => set('session_plan', v)} rows={5}
          placeholder="London KZ (13:00-16:00): คาดว่า sweep Asia High แล้ว reverse short...&#10;NY KZ (18:00-21:00): ...&#10;Silver Bullet (21:00-22:00): ..." />
      </FormSection>

      {/* Image upload */}
      <FormSection icon="📸" label={`Chart Images${plan?.chart_images?.length ? ` (${plan.chart_images.length})` : ''}`}>
        {plan?.chart_images?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6, marginBottom: 8 }}>
            {plan.chart_images.map((url, i) => (
              <div key={i} style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img src={url} alt={`c${i}`} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => handlePickFiles(e.target.files)} />
        <Button variant="secondary" size="sm" type="button" onClick={() => fileRef.current?.click()}
          disabled={uploading || !plan}>
          {uploading ? '⏳ กำลังอัพโหลด...' : '📸 + เพิ่มรูป Chart'}
        </Button>
        {!plan && (
          <div style={{ marginTop: 6, fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--text-muted)' }}>
            ⚠️ บันทึกแผนก่อน 1 ครั้ง แล้วค่อยอัพโหลดรูปได้
          </div>
        )}
      </FormSection>

      {/* End of day */}
      <FormSection icon="🌙" label="End of Day (เขียนตอนเย็น)">
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 5 }}>
            Bias ถูกไหม?
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { v: true,  label: 'ถูก ✓', tone: 'success' },
              { v: false, label: 'ผิด ✗', tone: 'danger' },
              { v: null,  label: 'ยังไม่สรุป', tone: 'neutral' },
            ].map(b => (
              <button key={String(b.v)} type="button" onClick={() => set('bias_was_correct', b.v)} className="focus-ring"
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                  background: form.bias_was_correct === b.v
                    ? (b.tone === 'success' ? 'var(--success-soft)' : b.tone === 'danger' ? 'var(--danger-soft)' : 'var(--surface-muted)')
                    : 'var(--surface)',
                  color: form.bias_was_correct === b.v
                    ? (b.tone === 'success' ? 'var(--success)' : b.tone === 'danger' ? 'var(--danger)' : 'var(--text-secondary)')
                    : 'var(--text-muted)',
                  border: '1px solid ' + (form.bias_was_correct === b.v
                    ? (b.tone === 'success' ? 'var(--success)' : b.tone === 'danger' ? 'var(--danger)' : 'var(--border)')
                    : 'var(--border)'),
                  fontSize: 12, fontFamily: 'var(--f-mono)',
                }}>{b.label}</button>
            ))}
          </div>
        </div>
        <FieldTA value={form.end_of_day} onChange={v => set('end_of_day', v)} rows={3}
          placeholder='สรุปวันนี้ · สิ่งที่ทำได้ดี · สิ่งที่ต้องปรับ · Action พรุ่งนี้' />
      </FormSection>

      {error && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-control)', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {plan && <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>}
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : '💾 บันทึกแผน'}
        </Button>
      </div>
    </div>
  );
}

function BiasPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {Object.entries(BIAS_META).map(([k, m]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className="focus-ring"
          style={{
            padding: '7px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
            background: value === k ? (k === 'bullish' ? 'var(--success-soft)' : k === 'bearish' ? 'var(--danger-soft)' : 'var(--surface-muted)') : 'var(--surface)',
            color: value === k ? m.color : 'var(--text-muted)',
            border: '1px solid ' + (value === k ? m.color : 'var(--border)'),
            fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 500,
          }}>{m.label}</button>
      ))}
    </div>
  );
}

function FormSection({ icon, label, children }) {
  return (
    <div style={{
      padding: '14px 16px', background: 'var(--background-soft)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-control)',
    }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.14em', marginBottom: 10 }}>
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

function FieldTA({ label, value, onChange, rows = 2, placeholder, mono }) {
  return (
    <div style={{ marginBottom: 8 }}>
      {label && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 4 }}>
          {label}
        </div>
      )}
      <textarea value={value || ''} onChange={e => onChange(e.target.value)}
        rows={rows} placeholder={placeholder}
        style={{
          width: '100%', background: 'var(--fill)', border: '1px solid transparent',
          borderRadius: 'var(--radius-field)', padding: '10px 12px',
          color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.6,
          resize: 'vertical', minHeight: rows * 22,
          fontFamily: mono ? 'var(--f-mono)' : 'var(--f-body)',
        }} />
    </div>
  );
}
