// ── Tax planner persistence (tax_profiles) ───────────────────────────────────
// One row per person per tax year. `income` and `deductions` are jsonb blobs
// owned by src/lib/taxTH.js — the table deliberately knows nothing about caps
// or brackets, so a rule change is a code change, never a migration.
//
// The migration is run BY HAND in the Supabase SQL Editor, and a deploy can
// reach production before it runs. Every read here therefore distinguishes
// "the table is not there yet" from a real failure, so the page can show the
// Thai "ยังไม่ได้รันไฟล์ SQL" state instead of an error or a crash.
import { supabase } from '../supabase.js';

/**
 * Postgres 42P01 / PostgREST PGRST205 = the relation does not exist yet.
 * (PGRST106 is the schema-not-exposed variant — same user-visible cause.)
 */
export function isTableMissing(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg  = String(err.message || '');
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST106'
    || /could not find the table|relation .* does not exist/i.test(msg);
}

/** Thrown by every write when the migration has not been run. */
export const SQL_NOT_RUN_MESSAGE =
  'ยังไม่ได้รันไฟล์ SQL — เปิด Supabase SQL Editor แล้วรัน supabase/migration_add_tax_planner.sql ก่อน';

async function requireUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  return user;
}

/**
 * Every profile for one tax year.
 * @returns {{ rows: object[], missingTable: boolean }}
 *   `missingTable` is the graceful state — NOT an error — so the page can
 *   render its own instructions. Any other failure is thrown, because this
 *   codebase does not swallow errors.
 */
export async function listProfiles(taxYear) {
  if (!supabase) return { rows: [], missingTable: false };
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('*')
    .eq('tax_year', taxYear)
    .order('sort_order', { ascending: true });
  if (error) {
    if (isTableMissing(error)) return { rows: [], missingTable: true };
    throw error;
  }
  // `sort_order` ties are common (everything defaults to 0) — fall back to the
  // owner first, then the name, so the tab order never shuffles between loads.
  const rows = (data || []).slice().sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || (b.is_self ? 1 : 0) - (a.is_self ? 1 : 0)
    || String(a.person_name).localeCompare(String(b.person_name), 'th')
  );
  return { rows, missingTable: false };
}

/** Which tax years already have at least one profile — feeds the year picker. */
export async function listYears() {
  if (!supabase) return { years: [], missingTable: false };
  const { data, error } = await supabase
    .from('tax_profiles')
    .select('tax_year')
    .order('tax_year', { ascending: false });
  if (error) {
    if (isTableMissing(error)) return { years: [], missingTable: true };
    throw error;
  }
  return { years: [...new Set((data || []).map(r => r.tax_year))], missingTable: false };
}

export async function createProfile({ tax_year, person_name, is_self = false, sort_order = 0, income = {}, deductions = {}, notes = null }) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await requireUser();
  const { data, error } = await supabase
    .from('tax_profiles')
    .insert({ user_id: user.id, tax_year, person_name, is_self, sort_order, income, deductions, notes })
    .select()
    .single();
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    // unique (user_id, tax_year, person_name)
    if (String(error.code) === '23505') throw new Error(`ปีภาษีนี้มี "${person_name}" อยู่แล้ว`);
    throw error;
  }
  return data;
}

export async function updateProfile(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('tax_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    if (String(error.code) === '23505') throw new Error('ชื่อนี้ซ้ำกับคนอื่นในปีภาษีเดียวกัน');
    throw error;
  }
  // `.select()` (not `.single()`) so "RLS matched nothing" is distinguishable
  // from "saved" — a silent no-op save is the worst possible outcome here.
  if (!data || data.length === 0) throw new Error('บันทึกไม่สำเร็จ — ไม่พบรายการนี้ (หรือไม่ใช่ของคุณ)');
  return data[0];
}

export async function deleteProfile(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('tax_profiles').delete().eq('id', id).select('id');
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    throw error;
  }
  if (!data || data.length === 0) throw new Error('ลบไม่สำเร็จ — ไม่พบรายการนี้');
}

/**
 * "คัดลอกจากปีก่อน" — clone every person from `fromYear` into `toYear`.
 * Names already present in the target year are LEFT ALONE (never overwritten):
 * the point is to seed a fresh year, not to undo work already done in it.
 * @returns {{ copied: number, skipped: string[] }}
 */
export async function copyYear(fromYear, toYear) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await requireUser();

  const { rows: source, missingTable } = await listProfiles(fromYear);
  if (missingTable) throw new Error(SQL_NOT_RUN_MESSAGE);
  if (!source.length) throw new Error(`ปี ${fromYear + 543} ยังไม่มีข้อมูลให้คัดลอก`);

  const { rows: existing } = await listProfiles(toYear);
  const taken = new Set(existing.map(r => r.person_name));

  const toInsert = source.filter(r => !taken.has(r.person_name)).map(r => ({
    user_id: user.id,
    tax_year: toYear,
    person_name: r.person_name,
    is_self: r.is_self,
    sort_order: r.sort_order,
    // Income carries over as a starting point; ภาษีหัก ณ ที่จ่าย does NOT —
    // last year's withholding is not evidence about this year, and a stale
    // figure there silently fakes a refund.
    income: { ...(r.income || {}), wht: 0 },
    deductions: r.deductions || {},
    notes: r.notes,
  }));

  const skipped = source.filter(r => taken.has(r.person_name)).map(r => r.person_name);
  if (!toInsert.length) return { copied: 0, skipped };

  const { data, error } = await supabase.from('tax_profiles').insert(toInsert).select();
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    throw error;
  }
  return { copied: (data || []).length, skipped };
}
