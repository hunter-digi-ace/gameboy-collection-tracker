/**
 * Database query functions for the web app.
 * Talks to Supabase directly via the JS client (anon key + RLS).
 */
import { supabase } from "./supabaseClient.js";

// ─── Unified game search (games + bootlegs) ──────────────

const GAME_SELECT = "id,title_en,platform,release_year,genre,developer,publisher,regions,cartridge_type";
const BOOT_SELECT = "id,title_en,platform,release_year,genre,developer,publisher,origin_country,type";

function normalizeRow(row, isBootleg) {
  return {
    id: row.id,
    title_en: row.title_en,
    platform: isBootleg ? "Bootleg" : (row.platform || "?"),
    release_year: row.release_year,
    genre: row.genre,
    developer: row.developer,
    publisher: row.publisher,
    regions: row.regions || row.origin_country || "",
    cartridge_type: row.cartridge_type || row.type || "",
    is_bootleg: isBootleg,
  };
}

/**
 * Fetch games + bootlegs, merged and sorted.
 */
export async function fetchAllGames({ platform, genre, search, offset = 0, limit = 50 } = {}) {
  const results = [];
  let total = 0;

  // ── Licensed games ───────────────────────────────────
  if (!platform || platform === "all" || ["GB", "GBC", "GBA"].includes(platform)) {
    let q = supabase.from("games").select(GAME_SELECT, { count: "exact" });

    if (platform && platform !== "all") q = q.eq("platform", platform);
    if (genre) q = q.ilike("genre", `%${genre}%`);
    if (search) q = q.textSearch("search_vector", search, { type: "websearch", config: "english" });

    q = q.order("title_en", { ascending: true }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (!error && data) {
      for (const row of data) results.push(normalizeRow(row, false));
      total += count || 0;
    }
  }

  // ── Bootlegs ─────────────────────────────────────────
  if (!platform || platform === "all" || platform === "Bootleg") {
    let q = supabase.from("bootlegs").select(BOOT_SELECT);

    if (genre) q = q.ilike("genre", `%${genre}%`);
    if (search) q = q.textSearch("search_vector", search, { type: "websearch", config: "english" });

    q = q.order("title_en", { ascending: true });

    const { data, error } = await q;
    if (!error && data) {
      for (const row of data) results.push(normalizeRow(row, true));
      total += data.length;
    }
  }

  // Sort merged + paginate
  results.sort((a, b) => a.title_en.localeCompare(b.title_en));
  const paged = results.slice(offset, offset + limit);

  return { games: paged, total };
}

// Re-export with old name for App.jsx
export { fetchAllGames as fetchGames };

// ─── Dynamic genre list ─────────────────────────────────

export async function fetchGenres() {
  const [gameRes, bootRes] = await Promise.all([
    supabase.from("games").select("genre").not("genre", "is", null),
    supabase.from("bootlegs").select("genre").not("genre", "is", null),
  ]);

  const genreSet = new Set();
  for (const res of [gameRes, bootRes]) {
    if (!res.error && res.data) {
      for (const row of res.data) {
        if (row.genre) {
          row.genre.split(/[,/]/).forEach((g) => {
            const t = g.trim();
            if (t) genreSet.add(t);
          });
        }
      }
    }
  }
  return [...genreSet].sort();
}

// ─── Collection ─────────────────────────────────────────

export async function fetchOwnedGameIds() {
  const { data, error } = await supabase
    .from("collection")
    .select("game_id, bootleg_id")
    .eq("owned", true);

  if (error) { console.error("Error fetching owned IDs:", error); return { gameIds: new Set(), bootlegIds: new Set() }; }

  const gameIds = new Set();
  const bootlegIds = new Set();
  for (const row of data || []) {
    if (row.game_id) gameIds.add(row.game_id);
    if (row.bootleg_id) bootlegIds.add(row.bootleg_id);
  }
  return { gameIds, bootlegIds };
}

export async function fetchCollection() {
  const { data, error } = await supabase
    .from("collection")
    .select(`
      id, game_id, bootleg_id, owned, price_paid, condition,
      acquired_date, cartridge_front_url, pcb_url, notes,
      games:game_id(id,title_en,platform,release_year,genre,regions,publisher)
    `)
    .eq("owned", true);

  if (error) { console.error("Error fetching collection:", error); return []; }
  return data || [];
}

export async function toggleOwnership(gameId) {
  const isBootleg = gameId.startsWith("BOOT-");
  const column = isBootleg ? "bootleg_id" : "game_id";

  const { data: existing } = await supabase
    .from("collection")
    .select("id, owned")
    .eq(column, gameId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("collection").delete().eq("id", existing.id);
    if (error) { console.error("Error removing:", error); return { owned: existing.owned, error: error.message }; }
    return { owned: false };
  } else {
    const body = isBootleg ? { bootleg_id: gameId, owned: true } : { game_id: gameId, owned: true };
    const { error } = await supabase.from("collection").insert(body);
    if (error) { console.error("Error adding:", error); return { owned: false, error: error.message }; }
    return { owned: true };
  }
}

export async function updateCollectionEntry(gameId, updates) {
  const isBootleg = gameId.startsWith("BOOT-");
  const column = isBootleg ? "bootleg_id" : "game_id";
  const { error } = await supabase.from("collection").update(updates).eq(column, gameId);
  if (error) { console.error("Error updating:", error); return { success: false, error: error.message }; }
  return { success: true };
}

// ─── Stats ──────────────────────────────────────────────

export async function fetchStats() {
  const { data, error } = await supabase.rpc("get_collection_stats");
  if (error) { console.error("Error fetching stats:", error); return { stats: [] }; }

  const { data: collection } = await supabase.from("collection").select("price_paid").eq("owned", true);

  const totalOwned = collection?.length || 0;
  const totalSpent = (collection || []).reduce((sum, r) => sum + (parseFloat(r.price_paid) || 0), 0);

  return { stats: data || [], totalOwned, totalSpent };
}
