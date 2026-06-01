-- ============================================================================
--  Learning Hub — Study Sessions + Page Tracking + Understanding Scores
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- 1. Extend learning_sources with book-specific + video position fields
ALTER TABLE public.learning_sources
  ADD COLUMN IF NOT EXISTS total_pages       int,
  ADD COLUMN IF NOT EXISTS current_page      int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reading_count     int DEFAULT 0,    -- จำนวนรอบที่อ่านจบ
  ADD COLUMN IF NOT EXISTS video_position_sec int DEFAULT 0;   -- last watched second

-- 2. Sessions log — บันทึก session การเรียนทุกครั้ง
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.learning_sources(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  started_at timestamptz DEFAULT now(),
  duration_min int,
  -- Book session
  from_page int, to_page int, pages_read int,
  -- Video/audio session
  video_from_sec int, video_to_sec int,
  -- Self-assessment
  understanding_score int CHECK (understanding_score BETWEEN 1 AND 5),
  -- Reflection
  summary text,                          -- "ได้อะไร" สรุปสั้น
  notes text,                            -- raw scratch notes
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_source_date_idx ON public.learning_sessions(source_id, session_date DESC);
CREATE INDEX IF NOT EXISTS sessions_user_date_idx   ON public.learning_sessions(user_id, session_date DESC);

-- RLS
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_learning_sessions" ON public.learning_sessions;
CREATE POLICY "own_learning_sessions" ON public.learning_sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
