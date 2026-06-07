-- ════════════════════════════════════════════════════════════════════════════
--  Learning Hub — Insights Bank (premium reading companion)
--
--  CONTEXT (v1.1)
--  Reading sessions captured a per-session summary + notes, but there was no
--  durable "wisdom bank" across the whole book. For trading/mindset books the
--  highest-leverage growth tool is turning reading into:
--    · takeaways  — distilled lessons
--    · quotes     — verbatim lines worth keeping (with page ref)
--    · actions    — behaviour changes to actually DO (checkbox)
--
--  RUN ONCE IN SUPABASE SQL EDITOR
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Insights bank — one row per takeaway / quote / action item
CREATE TABLE IF NOT EXISTS public.learning_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id  uuid NOT NULL REFERENCES public.learning_sources(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  kind     text NOT NULL DEFAULT 'takeaway' CHECK (kind IN ('takeaway','quote','action')),
  content  text NOT NULL,
  page_ref int,                       -- page number (quotes / takeaways)
  is_done  boolean DEFAULT false,     -- action items only
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insights_source_idx ON public.learning_insights(source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS insights_user_idx   ON public.learning_insights(user_id, created_at DESC);

ALTER TABLE public.learning_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_learning_insights" ON public.learning_insights;
CREATE POLICY "own_learning_insights" ON public.learning_insights
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2) Optional daily reading goal (minutes) on the source
ALTER TABLE public.learning_sources
  ADD COLUMN IF NOT EXISTS reading_goal_min int;
