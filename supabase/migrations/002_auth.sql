-- ============================================================
-- Game Boy Collection Tracker — Auth & Security Migration
-- Run AFTER 001_schema.sql
-- ============================================================

-- Single-user app: one row links the authenticated Supabase user
-- to the collection. The bot (using service_role) bypasses RLS.
CREATE TABLE app_user (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- only one row allowed
  supabase_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  telegram_user_id BIGINT UNIQUE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on app_user too
ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;

-- Only the linked user can see their own row
CREATE POLICY "User can read own app_user row"
  ON app_user FOR SELECT
  USING (supabase_user_id = auth.uid());

-- Only service_role can insert/update (for bootstrapping)
CREATE POLICY "Service can manage app_user"
  ON app_user FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert the single row
INSERT INTO app_user (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ─── Update RLS policies on collection ───────────────────

-- Drop old wide-open policies
DROP POLICY IF EXISTS "Collection public select" ON collection;
DROP POLICY IF EXISTS "Collection public insert" ON collection;
DROP POLICY IF EXISTS "Collection public update" ON collection;
DROP POLICY IF EXISTS "Collection public delete" ON collection;

-- New policies: only the linked user (or service_role) can access collection
CREATE POLICY "Owner can select collection"
  ON collection FOR SELECT
  USING (
    auth.uid() = (SELECT supabase_user_id FROM app_user WHERE id = 1)
  );

CREATE POLICY "Owner can insert collection"
  ON collection FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT supabase_user_id FROM app_user WHERE id = 1)
  );

CREATE POLICY "Owner can update collection"
  ON collection FOR UPDATE
  USING (
    auth.uid() = (SELECT supabase_user_id FROM app_user WHERE id = 1)
  );

CREATE POLICY "Owner can delete collection"
  ON collection FOR DELETE
  USING (
    auth.uid() = (SELECT supabase_user_id FROM app_user WHERE id = 1)
  );

-- ─── Helper: link the authenticated user ────────────────
-- Called from the web app after first login
CREATE OR REPLACE FUNCTION link_supabase_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE app_user
  SET supabase_user_id = auth.uid(),
      updated_at = now()
  WHERE id = 1
    AND supabase_user_id IS NULL;
END;
$$;

-- ─── Helper: link Telegram user (run manually or via bot) ─
CREATE OR REPLACE FUNCTION link_telegram_user(p_telegram_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE app_user
  SET telegram_user_id = p_telegram_id,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- ─── Helper: get the collection owner's UUID ─────────────
-- Used by the Telegram bot to know which user_id to write with
CREATE OR REPLACE FUNCTION get_owner_supabase_user_id()
RETURNS UUID
LANGUAGE SQL STABLE
SECURITY DEFINER
AS $$
  SELECT supabase_user_id FROM app_user WHERE id = 1;
$$;

-- ─── Updated stats: now checks against owner only ───────
DROP FUNCTION IF EXISTS get_collection_stats();
CREATE OR REPLACE FUNCTION get_collection_stats()
RETURNS TABLE(
  platform TEXT,
  total_catalog BIGINT,
  owned_count BIGINT,
  completion_pct NUMERIC
) LANGUAGE SQL STABLE AS $$
  SELECT
    g.platform,
    COUNT(*) AS total_catalog,
    COUNT(c.id) AS owned_count,
    ROUND(COUNT(c.id)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS completion_pct
  FROM games g
  LEFT JOIN collection c ON c.game_id = g.id AND c.owned = true
  GROUP BY g.platform
  ORDER BY g.platform;
$$;

-- Note: catalog tables (games, bootlegs) remain public read.
-- That's intentional — the game list is not private data.
