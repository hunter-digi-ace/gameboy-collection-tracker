import { useState, useEffect, useCallback } from "preact/hooks";
import { Header } from "./components/Header.jsx";
import { Login } from "./components/Login.jsx";
import { FilterBar } from "./components/FilterBar.jsx";
import { GameTable } from "./components/GameTable.jsx";
import { StatsCards } from "./components/StatsCards.jsx";
import { GameDetail } from "./components/GameDetail.jsx";
import { fetchGames, fetchOwnedGameIds, fetchStats, fetchGenres } from "./api.js";
import { getSession, onAuthStateChange, linkSupabaseUser, signOut } from "./supabaseClient.js";

const PLATFORMS = [
  { value: "all", label: "All Platforms" },
  { value: "GB", label: "Game Boy" },
  { value: "GBC", label: "Game Boy Color" },
  { value: "GBA", label: "Game Boy Advance" },
  { value: "Bootleg", label: "Bootleg / Unlicensed" },
];

export function App() {
  // ─── Auth state ────────────────────────────────────────
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Check if already logged in
    getSession().then((s) => {
      setSession(s);
      setAuthLoading(false);
      if (s) linkSupabaseUser(); // link on first login
    });

    // Listen for auth changes (magic link redirect)
    const { data: sub } = onAuthStateChange((s) => {
      setSession(s);
      if (s) linkSupabaseUser();
    });

    return () => sub?.unsubscribe();
  }, []);

  // ─── App state ─────────────────────────────────────────
  const [games, setGames] = useState([]);
  const [totalGames, setTotalGames] = useState(0);
  const [ownedIds, setOwnedIds] = useState(new Set());
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);

  const [filters, setFilters] = useState({
    platform: "all",
    genre: "",
    search: "",
  });
  const [page, setPage] = useState(0);
  const [genres, setGenres] = useState([]);
  const limit = 50;

  // ─── Data fetching ─────────────────────────────────────
  const loadGames = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);

    try {
      const { games: fetchedGames, total } = await fetchGames({
        ...filters,
        offset: page * limit,
        limit,
      });
      setGames(fetchedGames);
      setTotalGames(total);
    } catch (err) {
      console.error("Failed to load games:", err);
      setError("Failed to load games. Check connection and Supabase configuration.");
    } finally {
      setLoading(false);
    }
  }, [filters, page, session]);

  const loadOwnedIds = useCallback(async () => {
    if (!session) return;
    try {
      const { gameIds, bootlegIds } = await fetchOwnedGameIds();
      // Merge game IDs and bootleg IDs into one set
      const allIds = new Set([...gameIds, ...bootlegIds]);
      setOwnedIds(allIds);
    } catch (err) {
      console.error("Failed to load owned IDs:", err);
    }
  }, [session]);

  const loadStats = useCallback(async () => {
    if (!session) return;
    try {
      const s = await fetchStats();
      setStats(s);
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  }, [session]);

  // Load genres once
  useEffect(() => {
    if (session) { fetchGenres().then(setGenres).catch(() => {}); }
  }, [session]);

  useEffect(() => {
    if (session) {
      loadGames();
      loadOwnedIds();
      loadStats();
    }
  }, [loadGames, loadOwnedIds, loadStats, session]);

  // ─── Handlers ──────────────────────────────────────────
  const handleFilterChange = (newFilters) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPage(0);
  };

  const handleOwnedChange = () => {
    loadOwnedIds();
    loadStats();
  };

  const totalPages = Math.ceil(totalGames / limit);

  // ─── Loading / Login states ────────────────────────────
  if (authLoading) {
    return (
      <div class="app-loading">
        <div class="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  // ─── Authenticated app ─────────────────────────────────
  return (
    <div class="app">
      <Header onSignOut={() => { signOut(); setSession(null); }} />

      <main class="main-content">
        {stats && <StatsCards stats={stats} />}

        <FilterBar
          filters={filters}
          platforms={PLATFORMS}
          genres={genres}
          onFilterChange={handleFilterChange}
        />

        {error && (
          <div class="error-banner">
            <p>{error}</p>
          </div>
        )}

        <GameTable
          games={games}
          ownedIds={ownedIds}
          loading={loading}
          onOwnedChange={handleOwnedChange}
          onGameClick={(game) => setSelectedGame(game)}
          page={page}
          totalPages={totalPages}
          totalGames={totalGames}
          onPageChange={setPage}
        />
      </main>

      {selectedGame && (
        <GameDetail
          game={selectedGame}
          isOwned={ownedIds.has(selectedGame.id)}
          onClose={() => setSelectedGame(null)}
          onOwnedChange={handleOwnedChange}
        />
      )}

      <footer class="footer">
        <p>
          3,647 licensed games + 136 bootlegs • Data from Wikipedia, MobyGames, No-Intro
        </p>
      </footer>
    </div>
  );
}
