-- ============================================================
-- Game Boy Collection Tracker — Phase 1 Schema
-- Run this in the Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- ============================================================
-- CATALOG TABLES
-- ============================================================

-- Licensed games (GB, GBC, GBA) — 17 columns from main CSVs
CREATE TABLE games (
  id              TEXT PRIMARY KEY,   -- GB-XXXX, GBCB-XXXX, GBCC-XXXX, GBA-XXXX
  title_en        TEXT NOT NULL,
  title_original  TEXT,
  title_romanji   TEXT,
  platform        TEXT NOT NULL,      -- GB, GBC, GBA
  cartridge_type  TEXT,               -- Gray, Black, Clear, GBA Cartridge
  release_year    TEXT,
  release_jp      TEXT,
  release_na      TEXT,
  release_eu      TEXT,
  release_au      TEXT,
  regions         TEXT,               -- comma-separated: JP,NA,EU,AU
  developer       TEXT,
  publisher       TEXT,
  genre           TEXT,
  languages       TEXT,
  notes           TEXT,
  search_vector   tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title_en,'') || ' ' ||
      coalesce(title_original,'') || ' ' ||
      coalesce(title_romanji,'') || ' ' ||
      coalesce(developer,'') || ' ' ||
      coalesce(publisher,'') || ' ' ||
      coalesce(genre,'')
    )
  ) STORED
);

-- Unlicensed / bootleg games — 14 columns (different schema)
CREATE TABLE bootlegs (
  id              TEXT PRIMARY KEY,   -- BOOT-XXXX
  title_en        TEXT NOT NULL,
  title_original  TEXT,
  title_romanji   TEXT,
  platform        TEXT,               -- GB, GBC, GBA, etc.
  release_year    TEXT,
  developer       TEXT,
  publisher       TEXT,
  origin_country  TEXT,               -- Taiwan, China, etc.
  type            TEXT,               -- Original, Hack, Port, etc.
  base_game       TEXT,               -- What game it's based on/hacked from
  original_game   TEXT,               -- Original legitimate game
  genre           TEXT,
  notes           TEXT,
  search_vector   tsvector GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title_en,'') || ' ' ||
      coalesce(title_original,'') || ' ' ||
      coalesce(developer,'') || ' ' ||
      coalesce(publisher,'') || ' ' ||
      coalesce(genre,'')
    )
  ) STORED
);

-- ============================================================
-- COLLECTION TABLE
-- ============================================================

CREATE TABLE collection (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             TEXT REFERENCES games(id) ON DELETE CASCADE,
  bootleg_id          TEXT REFERENCES bootlegs(id) ON DELETE CASCADE,
  owned               BOOLEAN NOT NULL DEFAULT true,
  price_paid          DECIMAL(10,2),
  price_currency      TEXT DEFAULT 'EUR',
  cartridge_front_url TEXT,            -- R2 photo URL (Phase 2)
  pcb_url             TEXT,            -- R2 photo URL (Phase 2)
  condition           TEXT,            -- loose, cib, sealed, etc.
  notes               TEXT,
  acquired_date       DATE DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  -- Each game/bootleg can only appear once in the collection
  CONSTRAINT one_target CHECK (
    (game_id IS NOT NULL AND bootleg_id IS NULL)
    OR (game_id IS NULL AND bootleg_id IS NOT NULL)
  ),
  UNIQUE (game_id),
  UNIQUE (bootleg_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Full-text search
CREATE INDEX idx_games_fts    ON games    USING GIN(search_vector);
CREATE INDEX idx_bootlegs_fts ON bootlegs USING GIN(search_vector);

-- Common filter columns
CREATE INDEX idx_games_platform ON games(platform);
CREATE INDEX idx_games_year     ON games(release_year);
CREATE INDEX idx_games_title    ON games(title_en);
CREATE INDEX idx_games_publisher ON games(publisher);
CREATE INDEX idx_games_developer ON games(developer);

-- Genre is multi-valued ("Action,RPG") so we use GIN with array
CREATE INDEX idx_games_genre ON games USING GIN(
  to_tsvector('simple', coalesce(genre, ''))
);

-- Collection lookups
CREATE INDEX idx_collection_game   ON collection(game_id);
CREATE INDEX idx_collection_boot   ON collection(bootleg_id);
CREATE INDEX idx_collection_owned  ON collection(owned);

-- ============================================================
-- ROW-LEVEL SECURITY (single user, simple policies)
-- ============================================================

ALTER TABLE games      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bootlegs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection ENABLE ROW LEVEL SECURITY;

-- Catalog is public read
CREATE POLICY "Games public read"     ON games    FOR SELECT USING (true);
CREATE POLICY "Bootlegs public read"  ON bootlegs FOR SELECT USING (true);

-- Collection: anon can read/write (Phase 1 single-user)
-- In Phase 3, tighten to auth.uid()
CREATE POLICY "Collection public select" ON collection FOR SELECT USING (true);
CREATE POLICY "Collection public insert" ON collection FOR INSERT WITH CHECK (true);
CREATE POLICY "Collection public update" ON collection FOR UPDATE USING (true);
CREATE POLICY "Collection public delete" ON collection FOR DELETE USING (true);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Search games by text query, returns ranked results
CREATE OR REPLACE FUNCTION search_games(query TEXT, limit_val INT DEFAULT 10)
RETURNS TABLE(
  id TEXT, title_en TEXT, platform TEXT, release_year TEXT,
  developer TEXT, publisher TEXT, genre TEXT, regions TEXT,
  rank REAL
) LANGUAGE SQL STABLE AS $$
  SELECT
    id, title_en, platform, release_year,
    developer, publisher, genre, regions,
    ts_rank(search_vector, websearch_to_tsquery('english', query)) AS rank
  FROM games
  WHERE search_vector @@ websearch_to_tsquery('english', query)
  ORDER BY rank DESC
  LIMIT limit_val;
$$;

-- Search bootlegs by text query
CREATE OR REPLACE FUNCTION search_bootlegs(query TEXT, limit_val INT DEFAULT 10)
RETURNS TABLE(
  id TEXT, title_en TEXT, platform TEXT, release_year TEXT,
  developer TEXT, publisher TEXT, genre TEXT, origin_country TEXT,
  rank REAL
) LANGUAGE SQL STABLE AS $$
  SELECT
    id, title_en, platform, release_year,
    developer, publisher, genre, origin_country,
    ts_rank(search_vector, websearch_to_tsquery('english', query)) AS rank
  FROM bootlegs
  WHERE search_vector @@ websearch_to_tsquery('english', query)
  ORDER BY rank DESC
  LIMIT limit_val;
$$;

-- Get collection stats
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

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collection_updated_at
  BEFORE UPDATE ON collection
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
