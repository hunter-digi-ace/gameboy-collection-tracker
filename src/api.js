/**
 * Database query functions for the web app.
 * Talks to Supabase directly via the JS client (anon key + RLS).
 */

import { supabase } from "./supabaseClient.js";

// ─── Games ────────────────────────────────────────────────

export async function fetchGames({ platform, genre, search, offset = 0, limit = 50 } = {}) {
  let query = supabase
    .from("games")
    .select(
      "id,title_en,platform,release_year,genre,developer,publisher,regions,cartridge_type",
      { count: "exact" }
    );

  if (platform && platform !== "all") {
    query = query.eq("platform", platform);
  }

  if (genre) {
    query = query.ilike("genre", `%${genre}%`);
  }

  if (search) {
    query = query.textSearch("search_vector", search, {
      type: "websearch",
      config: "english",
    });
  }

  query = query.order("title_en", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching games:", error);
    return { games: [], total: 0, error: error.message };
  }

  return { games: data || [], total: count || 0 };
}

// ─── Collection ───────────────────────────────────────────

/**
 * Get owned game IDs (both licensed and bootlegs).
 */
export async function fetchOwnedGameIds() {
  const { data, error } = await supabase
    .from("collection")
    .select("game_id, bootleg_id")
    .eq("owned", true);

  if (error) {
    console.error("Error fetching owned IDs:", error);
    return { gameIds: new Set(), bootlegIds: new Set() };
  }

  const gameIds = new Set();
  const bootlegIds = new Set();
  for (const row of data || []) {
    if (row.game_id) gameIds.add(row.game_id);
    if (row.bootleg_id) bootlegIds.add(row.bootleg_id);
  }

  return { gameIds, bootlegIds };
}

/**
 * Get full collection with joined game data.
 */
export async function fetchCollection() {
  const { data, error } = await supabase
    .from("collection")
    .select(`
      id, game_id, bootleg_id, owned, price_paid, condition,
      acquired_date, cartridge_front_url, pcb_url, notes,
      games:game_id(id,title_en,platform,release_year,genre,regions,publisher)
    `)
    .eq("owned", true);

  if (error) {
    console.error("Error fetching collection:", error);
    return [];
  }

  return data || [];
}

/**
 * Toggle ownership: owned → remove, not owned → add.
 */
export async function toggleOwnership(gameId) {
  const isBootleg = gameId.startsWith("BOOT-");
  const column = isBootleg ? "bootleg_id" : "game_id";

  // Check if currently owned
  const { data: existing } = await supabase
    .from("collection")
    .select("id, owned")
    .eq(column, gameId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("collection")
      .delete()
      .eq("id", existing.id);

    if (error) {
      console.error("Error removing:", error);
      return { owned: existing.owned, error: error.message };
    }
    return { owned: false };
  } else {
    const body = isBootleg
      ? { bootleg_id: gameId, owned: true }
      : { game_id: gameId, owned: true };

    const { error } = await supabase.from("collection").insert(body);

    if (error) {
      console.error("Error adding:", error);
      return { owned: false, error: error.message };
    }
    return { owned: true };
  }
}

/**
 * Update collection entry (price, notes, condition, etc.).
 */
export async function updateCollectionEntry(gameId, updates) {
  const isBootleg = gameId.startsWith("BOOT-");
  const column = isBootleg ? "bootleg_id" : "game_id";

  const { error } = await supabase
    .from("collection")
    .update(updates)
    .eq(column, gameId);

  if (error) {
    console.error("Error updating:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─── Stats ────────────────────────────────────────────────

export async function fetchStats() {
  const { data, error } = await supabase.rpc("get_collection_stats");

  if (error) {
    console.error("Error fetching stats:", error);
    return { stats: [] };
  }

  // Total owned + total spent
  const { data: collection } = await supabase
    .from("collection")
    .select("price_paid")
    .eq("owned", true);

  const totalOwned = collection?.length || 0;
  const totalSpent = (collection || []).reduce(
    (sum, r) => sum + (parseFloat(r.price_paid) || 0),
    0
  );

  return { stats: data || [], totalOwned, totalSpent };
}
