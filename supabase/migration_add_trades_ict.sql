-- ============================================================================
--  Trading Journal — เพิ่ม ICT-specific fields ให้ตรงกับ Excel workflow
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS setup_detail   text,     -- รายละเอียด setup ยาว ๆ
  ADD COLUMN IF NOT EXISTS lesson_learned text,     -- สิ่งที่เรียนรู้
  ADD COLUMN IF NOT EXISTS balance_after  numeric,  -- ยอด equity หลัง trade (สำหรับ equity curve จริง)
  ADD COLUMN IF NOT EXISTS pnl_pct        numeric;  -- P&L % เทียบกับ account
