-- ============================================================================
--  Daily Trading Plans — Weekly Bias + Daily Bias + Chart images
--  Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.daily_trading_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date date NOT NULL,

  -- Weekly Bias (อัพเดตทุก Mon · share ระหว่างวัน)
  weekly_bias text CHECK (weekly_bias IN ('bullish', 'bearish', 'neutral')),
  weekly_reason text,
  weekly_key_levels text,           -- Weekly High/Low/FVG (free text)

  -- Daily Bias (อัพเดตทุกวัน)
  daily_bias text CHECK (daily_bias IN ('bullish', 'bearish', 'neutral')),
  daily_reason text,
  daily_invalidation text,
  daily_key_levels text,            -- Asia High/Low, PDH/PDL, Daily FVG

  -- News + Session plan
  news_events text,
  session_plan text,                -- คาดว่า / Entry trigger / Invalidation

  -- End of day reflection
  bias_was_correct boolean,
  end_of_day text,

  -- Chart images (Supabase Storage URLs)
  chart_images text[] DEFAULT ARRAY[]::text[],

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (user_id, plan_date)
);
CREATE INDEX IF NOT EXISTS plans_user_date_idx ON public.daily_trading_plans(user_id, plan_date DESC);

ALTER TABLE public.daily_trading_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_plans" ON public.daily_trading_plans;
CREATE POLICY "own_plans" ON public.daily_trading_plans
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 2. Reuse 'avatars' bucket for chart images (same policies cover trading_charts subfolder)
-- Path pattern: avatars/{user_id}/trading_{plan_id}_{idx}.jpg
-- Existing policies (avatars_public_read / avatars_own_*) already cover this.
