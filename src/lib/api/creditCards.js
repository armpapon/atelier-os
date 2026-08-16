// ── บัตรเครดิต persistence (credit_cards) ────────────────────────────────────
// One row per plastic. `fee_profile` and `installments` are jsonb blobs owned
// by src/lib/creditCards.js — the table knows nothing about waiver arithmetic
// or cycle dates, so a rule change is a code change, never a migration.
//
// The migration is run BY HAND in the Supabase SQL Editor, and a deploy can
// reach production before it runs. listCreditCards therefore distinguishes
// "the table is not there yet" from a real failure, so the tab can show its
// calm Thai setup notice instead of an error or a crash.
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
  'ยังไม่ได้ติดตั้งตาราง credit_cards — เปิด Supabase SQL Editor แล้วรัน supabase/migration_add_credit_cards.sql ก่อน';

async function requireUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('ยังไม่ได้เข้าสู่ระบบ');
  return user;
}

/**
 * Every card in one scope, in display order.
 * @returns {{ cards: object[], missing: boolean }}
 *   `missing` is the graceful state — NOT an error — so the tab can render
 *   its own instructions. Any other failure is thrown, because this codebase
 *   does not swallow errors.
 */
export async function listCreditCards(scope) {
  if (!supabase) return { cards: [], missing: false };
  let q = supabase.from('credit_cards').select('*').order('sort_order', { ascending: true });
  if (scope) q = q.eq('scope', scope);
  const { data, error } = await q;
  if (error) {
    if (isTableMissing(error)) return { cards: [], missing: true };
    throw error;
  }
  return { cards: data || [], missing: false };
}

export async function createCreditCard(input) {
  if (!supabase) throw new Error('Supabase not configured');
  const user = await requireUser();
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({ ...input, user_id: user.id })
    .select()
    .single();
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    throw error;
  }
  return data;
}

export async function updateCreditCard(id, patch) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('credit_cards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    throw error;
  }
  // `.select()` (not `.single()`) so "RLS matched nothing" is distinguishable
  // from "saved" — a silent no-op save is the worst possible outcome here.
  if (!data || data.length === 0) throw new Error('บันทึกไม่สำเร็จ — ไม่พบบัตรใบนี้ (หรือไม่ใช่ของคุณ)');
  return data[0];
}

export async function deleteCreditCard(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('credit_cards').delete().eq('id', id).select('id');
  if (error) {
    if (isTableMissing(error)) throw new Error(SQL_NOT_RUN_MESSAGE);
    throw error;
  }
  if (!data || data.length === 0) throw new Error('ลบไม่สำเร็จ — ไม่พบบัตรใบนี้');
}
