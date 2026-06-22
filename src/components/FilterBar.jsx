import { useState, useEffect, useRef } from "preact/hooks";

const GENRES = [
  "Action", "Adventure", "RPG", "Strategy", "Puzzle",
  "Sports", "Racing", "Fighting", "Shooter", "Platformer",
  "Simulation", "Educational", "Board", "Music", "Compilation",
];

export function FilterBar({ filters, platforms, onFilterChange }) {
  const [localSearch, setLocalSearch] = useState(filters.search || "");
  const debounceRef = useRef(null);

  // Sync external search changes
  useEffect(() => {
    setLocalSearch(filters.search || "");
  }, [filters.search]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalSearch(value);

    // Debounce search input
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ search: value || "" });
    }, 350);
  };

  const handlePlatformChange = (e) => {
    onFilterChange({ platform: e.target.value });
  };

  const handleGenreChange = (e) => {
    onFilterChange({ genre: e.target.value });
  };

  const handleClear = () => {
    setLocalSearch("");
    onFilterChange({ platform: "all", genre: "", search: "" });
  };

  const hasFilters = filters.platform !== "all" || filters.genre || filters.search;

  return (
    <div class="filter-bar">
      <div class="filter-row">
        {/* Platform selector */}
        <select
          class="filter-select"
          value={filters.platform || "all"}
          onChange={handlePlatformChange}
        >
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* Genre selector */}
        <select
          class="filter-select"
          value={filters.genre || ""}
          onChange={handleGenreChange}
        >
          <option value="">All Genres</option>
          {GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {/* Search box */}
        <input
          type="text"
          class="filter-search"
          placeholder="Search games..."
          value={localSearch}
          onInput={handleSearchChange}
        />

        {/* Clear button */}
        {hasFilters && (
          <button class="btn btn-clear" onClick={handleClear}>
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  );
}
