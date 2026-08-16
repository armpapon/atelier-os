-- ════════════════════════════════════════════════════════════════════════════
--  บัตรเครดิต — หน้าบัตรจริง (credit_cards.face_url) · v4.41
--
--  ALREADY APPLIED to production on 2026-08-16 via the Supabase MCP, together
--  with the three seed rows that now point at the images this commit ships in
--  public/cards/. This file exists so the repo carries the record of the
--  column — it is idempotent, so re-running it in the SQL Editor is harmless.
--
--  WHAT IT IS
--  A single nullable text column holding ONE of two shapes:
--    · a path to a file the app itself ships — '/cards/kbank-plustinum.png'
--    · a real http(s) address
--  Nothing else is a picture. src/lib/creditCards.js `safeFaceUrl()` is the
--  gate on both sides: the add/edit form stores null for anything it refuses,
--  and the card grid draws no <img> for a row that somehow still holds one
--  (a value written straight into the database, for instance). A refused or
--  empty value is not an error state — the card simply draws its coloured
--  monogram, the way every card did before v4.41.
--
--  There is deliberately no CHECK constraint: the rule is a rendering rule,
--  it changes with the front end, and a database that rejects the row would
--  turn a cosmetic mistake into a failed save.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.credit_cards ADD COLUMN IF NOT EXISTS face_url text;

COMMENT ON COLUMN public.credit_cards.face_url IS
  'Card-face image: an app-shipped path like /cards/ktc-chula.png, or an http(s) URL. NULL = draw the monogram.';
