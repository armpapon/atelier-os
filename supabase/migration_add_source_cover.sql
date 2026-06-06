-- ════════════════════════════════════════════════════════════════════════════
--  Learning Hub — book/course cover images
--
--  CONTEXT (v0.30)
--  User can now upload a cover image for any learning source (book,
--  course, podcast). Currently only YouTube items show a real image
--  (auto-fetched from youtube thumbnail API). Other types show a
--  letter placeholder like "TH" / "BL" — visually weak.
--
--  COLUMN
--  cover_url: public URL into the existing 'avatars' Supabase Storage
--             bucket. Resized to 800px JPEG on upload.
--
--  RUN ONCE IN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.learning_sources
  ADD COLUMN IF NOT EXISTS cover_url text;
