-- ============================================================================
--  Life OS Migration — Manifest, Themes, Goals, Today's Focus, Roadmap
--  Run in: Supabase Dashboard → Database → SQL Editor → New query
-- ============================================================================

-- 1. MANIFEST — your life's north star (1 row per user)
CREATE TABLE IF NOT EXISTS public.manifest (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  statement text DEFAULT '',
  values jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- 2. THEMES — year/quarter/week compass (1 row per user)
CREATE TABLE IF NOT EXISTS public.themes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  year_theme    text DEFAULT '',
  quarter_theme text DEFAULT '',
  week_theme    text DEFAULT '',
  year_label    text DEFAULT '',
  quarter_label text DEFAULT '',
  week_label    text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

-- 3. GOALS — generic life goals (finance, health, learning, family, etc.)
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  current_value numeric DEFAULT 0,
  target_value numeric NOT NULL,
  unit text DEFAULT '',                   -- 'บาท', 'เล่ม', 'ครั้ง', 'kg', '%'
  deadline date,
  category text DEFAULT 'general',        -- 'finance' | 'health' | 'learning' | 'family' | 'trading' | 'general'
  tone text DEFAULT 'amber',              -- color tone
  priority int DEFAULT 0,                 -- 0 = top of list
  status text DEFAULT 'active' CHECK (status IN ('active','completed','paused','cancelled')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS goals_user_status_idx ON public.goals(user_id, status, priority);

-- 4. FOCUS_TODAY — top 3 things that matter today
CREATE TABLE IF NOT EXISTS public.focus_today (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_date date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  done boolean DEFAULT false,
  ord int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS focus_today_user_date_idx ON public.focus_today(user_id, focus_date, ord);

-- 5. ROADMAP_MILESTONES — 6+ month timeline markers
CREATE TABLE IF NOT EXISTS public.roadmap_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date NOT NULL,
  status text DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','missed')),
  color text DEFAULT 'amber',
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roadmap_user_date_idx ON public.roadmap_milestones(user_id, target_date);

-- ============================================================================
--  Row Level Security
-- ============================================================================
ALTER TABLE public.manifest            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_today         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_milestones  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "own_manifest"  ON public.manifest;
DROP POLICY IF EXISTS "own_themes"    ON public.themes;
DROP POLICY IF EXISTS "own_goals"     ON public.goals;
DROP POLICY IF EXISTS "own_focus"     ON public.focus_today;
DROP POLICY IF EXISTS "own_roadmap"   ON public.roadmap_milestones;

CREATE POLICY "own_manifest" ON public.manifest           FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_themes"   ON public.themes             FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_goals"    ON public.goals              FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_focus"    ON public.focus_today        FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_roadmap"  ON public.roadmap_milestones FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
