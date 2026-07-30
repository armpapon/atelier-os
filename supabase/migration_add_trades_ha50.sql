-- ============================================================================
--  Trading Journal — เพิ่ม HA-50 fields (demo mission 30 ไม้)
--  ระบบใหม่: XAUUSD · TF 1h · EMA50 + Heikin Ashi flip · London–NY 14:00–23:00
--  ใช้วัด "วินัย" ไม่ใช่กำไร — ต้องรู้ว่าไม้นั้นทำตามกติกาไหม + ได้กี่ R
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS exit_price     numeric,  -- ราคาปิดไม้ (ใช้คำนวณ R)
  ADD COLUMN IF NOT EXISTS r_multiple     numeric,  -- R ที่ได้จริง เช่น 1.85 / -1
  ADD COLUMN IF NOT EXISTS followed_rules boolean,  -- ทำตามกติกาไหม (true/false)
  ADD COLUMN IF NOT EXISTS rule_broken    text,     -- ผิดกติกาข้อไหน (null ถ้าไม่ผิด)
  ADD COLUMN IF NOT EXISTS system         text;     -- ระบบที่ใช้ — 'HA-50' = นับเข้า mission
