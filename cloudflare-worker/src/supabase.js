/**
 * Supabase client for Cloudflare Worker.
 * Uses service_role key — bypasses RLS, so we manually scope to the owner.
 */

export function createSupabaseClient(env) {
  const url = env.SUPABASE_URL || env.supabase_url;
  const key = env.SUPABASE_SERVICE_KEY || env.supabase_service_key;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY");
  }

  // ─── Low-level HTTP helpers ────────────────────────────

  async function rest(method, path, { query, body, headers: extraHeaders } = {}) {
    const fullUrl = new URL(`${url}/rest/v1/${path}`);

    if (query) {
      for (const [k, v] of Object.entries(query)) {
        fullUrl.searchParams.set(k, v);
      }
    }

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders,
    };

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(fullUrl.toString(), opts);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      throw new Error(`Supabase ${method} ${path} failed (${resp.status}): ${errText.substring(0, 300)}`);
    }

    if (resp.status === 204 || method === "HEAD") return null;
    return resp.json();
  }

  async function rpc(fnName, params = {}) {
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const resp = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      throw new Error(`RPC ${fnName} failed (${resp.status}): ${errText.substring(0, 300)}`);
    }

    return resp.json();
  }

  // ─── Owner ──────────────────────────────────────────────
  // The linked Supabase auth user UUID. Bot writes with this
  // so that RLS policies on the web app side see the data.

  let _ownerId = null;
  async function getOwnerId() {
    if (_ownerId) return _ownerId;
    const rows = await rpc("get_owner_supabase_user_id");
    _ownerId = rows?.[0]?.supabase_user_id || null;
    return _ownerId;
  }

  // ─── Search ─────────────────────────────────────────────

  async function searchGames(query, limit = 8) {
    return rpc("search_games", { query, limit_val: limit });
  }

  async function searchBootlegs(query, limit = 8) {
    return rpc("search_bootlegs", { query, limit_val: limit });
  }

  async function searchAll(query, limit = 10) {
    const [games, bootlegs] = await Promise.all([
      searchGames(query, limit),
      searchBootlegs(query, limit),
    ]);
    return { games: games || [], bootlegs: bootlegs || [] };
  }

  // ─── Game lookup ────────────────────────────────────────

  async function getGameById(id) {
    const result = await rest("GET", `games?id=eq.${encodeURIComponent(id)}`, {
      query: { limit: "1" },
    });
    if (result && result.length > 0) return result[0];

    const bresult = await rest("GET", `bootlegs?id=eq.${encodeURIComponent(id)}`, {
      query: { limit: "1" },
    });
    if (bresult && bresult.length > 0) return bresult[0];

    return null;
  }

  // ─── Collection (scoped to owner) ──────────────────────

  async function getCollectionEntry(gameId) {
    const isBootleg = gameId.startsWith("BOOT-");
    const column = isBootleg ? "bootleg_id" : "game_id";
    const result = await rest("GET", `collection?${column}=eq.${encodeURIComponent(gameId)}`, {
      query: { limit: "1" },
    });
    return result?.[0] || null;
  }

  async function getOwnedGameIds() {
    // Returns Set of game IDs the owner has
    const result = await rest("GET", "collection?owned=is.true&select=game_id,bootleg_id", {});
    if (!result) return { gameIds: new Set(), bootlegIds: new Set() };
    const gameIds = new Set();
    const bootlegIds = new Set();
    for (const row of result) {
      if (row.game_id) gameIds.add(row.game_id);
      if (row.bootleg_id) bootlegIds.add(row.bootleg_id);
    }
    return { gameIds, bootlegIds };
  }

  async function addToCollection(gameId) {
    const game = await getGameById(gameId);
    if (!game) return { error: "Game not found" };

    const isBootleg = gameId.startsWith("BOOT-");
    const body = isBootleg
      ? { bootleg_id: gameId, owned: true }
      : { game_id: gameId, owned: true };

    const result = await rest("POST", "collection", { body });
    return { game, entry: Array.isArray(result) ? result[0] : result };
  }

  async function removeFromCollection(gameId) {
    const isBootleg = gameId.startsWith("BOOT-");
    const column = isBootleg ? "bootleg_id" : "game_id";
    await rest("DELETE", `collection?${column}=eq.${encodeURIComponent(gameId)}`);
    return { success: true };
  }

  async function updateCollection(gameId, updates) {
    const isBootleg = gameId.startsWith("BOOT-");
    const column = isBootleg ? "bootleg_id" : "game_id";
    return rest("PATCH", `collection?${column}=eq.${encodeURIComponent(gameId)}`, {
      body: updates,
    });
  }

  // ─── List collection ────────────────────────────────────

  async function listCollection() {
    const queryUrl =
      `collection?owned=is.true` +
      `&select=id,game_id,bootleg_id,price_paid,condition,acquired_date,` +
      `games:game_id(id,title_en,platform,release_year,genre,regions,publisher),` +
      `bootlegs:bootleg_id(id,title_en,platform,release_year,genre)`;

    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    };

    const resp = await fetch(`${url}/rest/v1/${queryUrl}`, { headers });
    if (!resp.ok) throw new Error(`Failed to list collection: ${resp.status}`);
    return resp.json();
  }

  // ─── Stats ──────────────────────────────────────────────

  async function getStats() {
    const stats = await rpc("get_collection_stats");

    // Total owned + total spent — use consistent client
    const queryUrl = "collection?owned=is.true&select=id,price_paid";
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    };

    const resp = await fetch(`${url}/rest/v1/${queryUrl}`, { headers });
    const data = await resp.json();

    const totalOwned = data?.length || 0;
    const totalSpent =
      data?.reduce((sum, r) => sum + (parseFloat(r.price_paid) || 0), 0) || 0;

    return { stats: stats || [], totalOwned, totalSpent };
  }

  return {
    getOwnerId,
    searchGames,
    searchBootlegs,
    searchAll,
    getGameById,
    getCollectionEntry,
    getOwnedGameIds,
    addToCollection,
    removeFromCollection,
    updateCollection,
    listCollection,
    getStats,
  };
}
