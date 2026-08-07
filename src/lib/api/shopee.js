// Shared Shopee to-ship queue (see migration_add_shopee_orders.sql).
// One queue for the couple: the mail-receiving account syncs orders in,
// either partner ticks them shipped. All calls throw on error — callers
// decide how to degrade (the card falls back to device-local mode when the
// migration hasn't been run yet).
import { supabase } from '../supabase.js';

export async function listShopeeOrders(all = false) {
  let q = supabase.from('shopee_orders').select('*').order('mail_ts', { ascending: true });
  if (!all) q = q.eq('state', 'open');
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Upsert the mail-derived rows (owner side only — RLS enforces owner insert).
export async function saveShopeeOrders(rows) {
  if (!rows.length) return;
  const { data: { user } } = await supabase.auth.getUser();
  const stamped = rows.map(r => ({ ...r, owner_id: user.id, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from('shopee_orders').upsert(stamped, { onConflict: 'order_id' });
  if (error) throw error;
}

// Tick from either partner: 'shipped' records who/when; 'open' re-opens a
// mistaken tick; 'cleared' is the automatic close from a cancel/delivered mail.
export async function setShopeeState(orderId, state) {
  const patch = { state, updated_at: new Date().toISOString() };
  if (state === 'shipped') {
    const { data: { user } } = await supabase.auth.getUser();
    patch.shipped_by = user?.id ?? null;
    patch.shipped_at = new Date().toISOString();
  }
  const { error } = await supabase.from('shopee_orders').update(patch).eq('order_id', orderId);
  if (error) throw error;
}
