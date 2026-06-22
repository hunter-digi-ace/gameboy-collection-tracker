import { toggleOwnership } from "../api.js";

const PLATFORM_CLASSES = {
  GB: "plat-gb",
  GBC: "plat-gbc",
  GBA: "plat-gba",
};

export function GameTable({
  games,
  ownedIds,
  loading,
  onOwnedChange,
  onGameClick,
  page,
  totalPages,
  totalGames,
  onPageChange,
}) {
  const handleToggle = async (e, gameId) => {
    e.stopPropagation();
    const result = await toggleOwnership(gameId);
    if (!result.error) {
      onOwnedChange();
    }
  };

  const handleRowClick = (game) => {
    onGameClick(game);
  };

  if (loading) {
    return (
      <div class="table-container">
        <div class="loading">
          <div class="spinner" />
          <p>Loading games...</p>
        </div>
      </div>
    );
  }

  if (!games || games.length === 0) {
    return (
      <div class="table-container">
        <div class="empty-state">
          <p>No games found matching your filters.</p>
          <p class="hint">Try adjusting your search or filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="table-container">
      <table class="game-table">
        <thead>
          <tr>
            <th class="col-owned">Own</th>
            <th class="col-id">ID</th>
            <th class="col-title">Title</th>
            <th class="col-platform">Platform</th>
            <th class="col-year">Year</th>
            <th class="col-genre">Genre</th>
            <th class="col-publisher">Publisher</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const isOwned = ownedIds.has(game.id);
            return (
              <tr
                key={game.id}
                class={`game-row ${isOwned ? "row-owned" : ""}`}
                onClick={() => handleRowClick(game)}
              >
                <td class="col-owned" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isOwned}
                    onChange={(e) => handleToggle(e, game.id)}
                    title={isOwned ? "Remove from collection" : "Add to collection"}
                  />
                </td>
                <td class="col-id">
                  <code>{game.id}</code>
                </td>
                <td class="col-title">
                  <span class="game-title-link">
                    {game.title_en}
                  </span>
                </td>
                <td class="col-platform">
                  <span class={`platform-badge ${PLATFORM_CLASSES[game.platform] || ""}`}>
                    {game.platform}
                  </span>
                </td>
                <td class="col-year">{game.release_year || "—"}</td>
                <td class="col-genre">{game.genre || "—"}</td>
                <td class="col-publisher">{game.publisher || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="pagination">
          <button
            class="btn btn-page"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            ◀ Previous
          </button>

          <span class="page-info">
            Page {page + 1} of {totalPages} ({totalGames} games)
          </span>

          <button
            class="btn btn-page"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
          >
            Next ▶
          </button>
        </div>
      )}
    </div>
  );
}
