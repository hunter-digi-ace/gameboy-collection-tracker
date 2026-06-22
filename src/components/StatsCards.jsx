export function StatsCards({ stats }) {
  if (!stats || !stats.stats || stats.stats.length === 0) {
    return null;
  }

  const { stats: platformStats, totalOwned, totalSpent } = stats;
  const totalCatalog = 3783; // 3,647 licensed + 136 bootlegs
  const overallPct = ((totalOwned / totalCatalog) * 100).toFixed(1);

  const platformLabels = {
    GB: "Game Boy",
    GBC: "Game Boy Color",
    GBA: "Game Boy Advance",
  };

  const platformColors = {
    GB: "#a0a0a0",
    GBC: "#6b21a8",
    GBA: "#3b82f6",
  };

  return (
    <div class="stats-cards">
      {/* Overall */}
      <div class="stat-card stat-overall">
        <div class="stat-value">{totalOwned}</div>
        <div class="stat-label">Games Owned</div>
        <div class="stat-sub">of {totalCatalog} total ({overallPct}%)</div>
      </div>

      {/* Per platform */}
      {platformStats.map((row) => {
        const owned = parseInt(row.owned_count) || 0;
        const total = parseInt(row.total_catalog) || 0;
        const pct = parseFloat(row.completion_pct) || 0;

        return (
          <div
            class="stat-card"
            key={row.platform}
            style={{ borderTopColor: platformColors[row.platform] || "#888" }}
          >
            <div class="stat-value">{owned}</div>
            <div class="stat-label">{platformLabels[row.platform] || row.platform}</div>
            <div class="stat-sub">
              {owned}/{total} — {pct}%
            </div>
            {/* Mini bar */}
            <div class="mini-bar">
              <div
                class="mini-bar-fill"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  backgroundColor: platformColors[row.platform] || "#888",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Total spent */}
      {totalSpent > 0 && (
        <div class="stat-card stat-spent">
          <div class="stat-value">{totalSpent.toFixed(0)}€</div>
          <div class="stat-label">Total Spent</div>
          <div class="stat-sub">
            Avg {(totalSpent / (totalOwned || 1)).toFixed(1)}€ per game
          </div>
        </div>
      )}
    </div>
  );
}
