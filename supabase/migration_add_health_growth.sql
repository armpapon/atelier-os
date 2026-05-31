-- ============================================================================
--  Health Profile + Growth Log + Milestones
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- 1. Extend family_members with health profile fields
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS blood_type            text,
  ADD COLUMN IF NOT EXISTS allergies             text,
  ADD COLUMN IF NOT EXISTS chronic_conditions    text,
  ADD COLUMN IF NOT EXISTS current_medications   text,
  ADD COLUMN IF NOT EXISTS doctor_name           text,
  ADD COLUMN IF NOT EXISTS doctor_clinic         text,
  ADD COLUMN IF NOT EXISTS doctor_phone          text,
  ADD COLUMN IF NOT EXISTS insurance_info        text,
  ADD COLUMN IF NOT EXISTS last_checkup          date;

-- 2. Vaccinations — time-series (one row per dose given)
CREATE TABLE IF NOT EXISTS public.vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  vaccine_name text NOT NULL,            -- 'BCG', 'HEP B', 'DTaP', 'MMR', 'Influenza', etc.
  date_given date,
  dose_number int,                       -- เข็มที่ 1, 2, 3
  next_due date,                         -- เข็มถัดไปวันที่
  location text,                         -- โรงพยาบาล/คลินิก
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vaccinations_member_idx ON public.vaccinations(member_id, date_given DESC);

-- 3. Growth records — height/weight measurements over time
CREATE TABLE IF NOT EXISTS public.growth_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  recorded_at date NOT NULL DEFAULT CURRENT_DATE,
  height_cm numeric,
  weight_kg numeric,
  head_cm numeric,                       -- รอบศีรษะ (เด็กเล็ก)
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_member_date_idx ON public.growth_records(member_id, recorded_at DESC);

-- 4. Milestones — moments worth remembering
CREATE TABLE IF NOT EXISTS public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  milestone_date date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  category text DEFAULT 'general' CHECK (category IN ('first','physical','language','social','academic','achievement','general')),
  notes text,
  photo_url text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS milestones_member_date_idx ON public.milestones(member_id, milestone_date DESC);

-- RLS
ALTER TABLE public.vaccinations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_vaccinations"   ON public.vaccinations;
DROP POLICY IF EXISTS "own_growth_records" ON public.growth_records;
DROP POLICY IF EXISTS "own_milestones"     ON public.milestones;

CREATE POLICY "own_vaccinations"   ON public.vaccinations   FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_growth_records" ON public.growth_records FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_milestones"     ON public.milestones     FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
