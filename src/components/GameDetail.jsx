import { useState, useEffect } from "preact/hooks";
import { toggleOwnership, updateCollectionEntry, fetchCollection } from "../api.js";

export function GameDetail({ game, isOwned: initialOwned, onClose, onOwnedChange }) {
  const [isOwned, setIsOwned] = useState(initialOwned);
  const [collectionData, setCollectionData] = useState(null);
  const [priceInput, setPriceInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Load collection entry data
  useEffect(() => {
    async function load() {
      const items = await fetchCollection();
      const entry = items.find(
        (c) => c.game_id === game.id || c.bootleg_id === game.id
      );
      if (entry) {
        setCollectionData(entry);
        setPriceInput(entry.price_paid ? String(entry.price_paid) : "");
        setNotesInput(entry.notes || "");
      }
    }
    if (isOwned) load();
  }, [game.id, isOwned]);

  // Update owned status when initialOwned changes
  useEffect(() => {
    setIsOwned(initialOwned);
  }, [initialOwned]);

  const handleToggle = async () => {
    const result = await toggleOwnership(game.id);
    if (!result.error) {
      setIsOwned(result.owned);
      onOwnedChange();
      if (!result.owned) {
        setCollectionData(null);
      }
    }
  };

  const handleSavePrice = async () => {
    const amount = parseFloat(priceInput.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      setMessage({ type: "error", text: "Please enter a valid price." });
      return;
    }
    setSaving(true);
    const result = await updateCollectionEntry(game.id, { price_paid: amount });
    setSaving(false);
    if (result.success) {
      setMessage({ type: "success", text: "Price updated!" });
      onOwnedChange();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to save." });
    }
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    const result = await updateCollectionEntry(game.id, { notes: notesInput });
    setSaving(false);
    if (result.success) {
      setMessage({ type: "success", text: "Notes updated!" });
      onOwnedChange();
    } else {
      setMessage({ type: "error", text: result.error || "Failed to save." });
    }
  };

  const platformNames = {
    GB: "Game Boy (DMG)",
    GBC: "Game Boy Color",
    GBA: "Game Boy Advance",
  };

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <button class="modal-close" onClick={onClose}>
          ✕
        </button>

        <div class="modal-header">
          <h2>{game.title_en}</h2>
          <span class={`platform-badge plat-${(game.platform || "").toLowerCase()}`}>
            {platformNames[game.platform] || game.platform}
          </span>
        </div>

        <div class="modal-body">
          {/* Game info */}
          <div class="detail-grid">
            <div class="detail-item">
              <label>ID</label>
              <code>{game.id}</code>
            </div>
            <div class="detail-item">
              <label>Release Year</label>
              <span>{game.release_year || "Unknown"}</span>
            </div>
            <div class="detail-item">
              <label>Cartridge</label>
              <span>{game.cartridge_type || "—"}</span>
            </div>
            <div class="detail-item">
              <label>Regions</label>
              <span>{game.regions || "—"}</span>
            </div>
            <div class="detail-item">
              <label>Genre</label>
              <span>{game.genre || "—"}</span>
            </div>
            <div class="detail-item">
              <label>Developer</label>
              <span>{game.developer || "—"}</span>
            </div>
            <div class="detail-item">
              <label>Publisher</label>
              <span>{game.publisher || "—"}</span>
            </div>
            <div class="detail-item">
              <label>Languages</label>
              <span>{game.languages || "—"}</span>
            </div>
          </div>

          {/* Owned toggle */}
          <div class="detail-actions">
            <button
              class={`btn ${isOwned ? "btn-danger" : "btn-primary"}`}
              onClick={handleToggle}
            >
              {isOwned ? "❌ Remove from Collection" : "➕ Add to Collection"}
            </button>
          </div>

          {/* Collection details (only when owned) */}
          {isOwned && (
            <div class="collection-details">
              <h3>Your Copy</h3>

              {/* Price */}
              <div class="detail-field">
                <label>Price Paid</label>
                <div class="input-group">
                  <input
                    type="text"
                    class="input"
                    placeholder="e.g., 25"
                    value={priceInput}
                    onInput={(e) => setPriceInput(e.target.value)}
                  />
                  <span class="input-suffix">€</span>
                  <button
                    class="btn btn-small btn-primary"
                    onClick={handleSavePrice}
                    disabled={saving}
                  >
                    {saving ? "..." : "Save"}
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div class="detail-field">
                <label>Notes</label>
                <textarea
                  class="input textarea"
                  rows="3"
                  placeholder="Condition, where you got it, etc."
                  value={notesInput}
                  onInput={(e) => setNotesInput(e.target.value)}
                />
                <button
                  class="btn btn-small btn-primary"
                  onClick={handleSaveNotes}
                  disabled={saving}
                  style={{ marginTop: "0.5rem" }}
                >
                  {saving ? "..." : "Save Notes"}
                </button>
              </div>

              {/* Acquired date */}
              {collectionData?.acquired_date && (
                <div class="detail-field">
                  <label>Acquired</label>
                  <span>{collectionData.acquired_date}</span>
                </div>
              )}
            </div>
          )}

          {/* Message feedback */}
          {message && (
            <div class={`message message-${message.type}`}>
              {message.text}
            </div>
          )}

          {/* Photos (Phase 2 placeholder) */}
          {isOwned && collectionData?.cartridge_front_url && (
            <div class="detail-photos">
              <h3>Photos</h3>
              <img
                src={collectionData.cartridge_front_url}
                alt={`${game.title_en} cartridge`}
                class="photo-thumb"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
