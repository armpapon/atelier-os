-- ════════════════════════════════════════════════════════════════════════════
--  Drop the legacy CHECK constraint on transactions.type
--
--  CONTEXT (v0.28)
--  The original schema constrained `transactions.type` to a hard-coded set
--  of 7 strings (food, transport, bills, income, shop, family, other).
--  v0.28 added user-defined custom categories — those can have any id,
--  so INSERT/UPDATE now fails with:
--    new row for relation "transactions" violates check constraint
--    "transactions_type_check"
--
--  FIX
--  Drop the constraint. `type` becomes a free-form text column. Validation
--  happens app-side (we never write arbitrary user input here without the
--  category picker, so trust boundary is fine).
--
--  RUN ONCE IN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

-- (Optional) verify it's gone
-- SELECT con.conname
-- FROM   pg_constraint con
-- JOIN   pg_class rel ON rel.oid = con.conrelid
-- WHERE  rel.relname = 'transactions' AND con.contype = 'c';
