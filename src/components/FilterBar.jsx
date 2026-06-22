import { useState, useEffect, useRef } from "preact/hooks";

export function FilterBar({ filters, platforms, genres, onFilterChange }) {
  const [localSearch, setLocalSearch] = useState(filters.search || "");
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalSearch(filters.search || "");
  }, [filters.search]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ search: value || "" });
    }, 350);
  };

  const hasFilters = filters.platform !== "all" || filters.genre || filters.search;

  return (
    <div class="filter-bar">
      <div class="filter-row">
        <select class="filter-select" value={filters.platform || "all"}
          onChange={(e) => onFilterChange({ platform: e.target.value })}>
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>

        <select class="filter-select" value={filters.genre || ""}
          onChange={(e) => onFilterChange({ genre: e.target.value })}>
          <option value="">All Genres</option>
          {(genres || []).map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>

        <input type="text" class="filter-search" placeholder="Search games..."
          value={localSearch} onInput={handleSearchChange} />

        {hasFilters && (
          <button class="btn btn-clear" onClick={() => { setLocalSearch(""); onFilterChange({ platform: "all", genre: "", search: "" }); }}>
            ✕ Clear
          </button>
        )}
      </div>
    </div>
  );
}
