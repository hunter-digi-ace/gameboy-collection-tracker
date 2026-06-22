/**
 * Inline keyboard builders for the Telegram bot.
 */
import { InlineKeyboard } from "grammy";

/**
 * Keyboard for search results — game is NOT owned.
 * Options: Add to collection, View details.
 */
export function searchResultKeyboard(gameId) {
  return new InlineKeyboard()
    .text("➕ Add", `add:${gameId}`)
    .text("ℹ️ Details", `details:${gameId}`);
}

/**
 * Keyboard for a game you ALREADY own.
 * Options: Remove, Set price, View details.
 */
export function ownedGameKeyboard(gameId) {
  return new InlineKeyboard()
    .text("❌ Remove", `remove:${gameId}`)
    .text("💰 Price", `details:${gameId}`)
    .row()
    .text("📋 Collection", "list:all");
}

/**
 * Keyboard for game detail view.
 */
export function detailKeyboard(gameId, isOwned) {
  const kb = new InlineKeyboard();
  if (isOwned) {
    kb.text("❌ Remove", `remove:${gameId}`).row();
    kb.text("💰 Set Price", `details:${gameId}`);
  } else {
    kb.text("➕ Add to Collection", `add:${gameId}`);
  }
  return kb;
}

/**
 * Confirmation keyboard for removal.
 */
export function confirmRemoveKeyboard(gameId) {
  return new InlineKeyboard()
    .text("✅ Yes, remove", `confirm_remove:${gameId}`)
    .text("↩️ Cancel", `cancel_remove:${gameId}`);
}
