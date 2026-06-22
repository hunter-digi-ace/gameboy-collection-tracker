/**
 * Telegram bot command and callback handlers.
 * All handlers receive (ctx, supabase, env).
 */
import {
  searchResultKeyboard, detailKeyboard, confirmRemoveKeyboard,
  ownedGameKeyboard,
} from "./keyboards.js";
import { createSupabaseClient } from "./supabase.js";

// ─── Helpers ──────────────────────────────────────────────

function esc(text) {
  if (!text) return "";
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function formatGameLine(game, isOwned) {
  const icon = isOwned ? "✅" : "❌";
  return `${icon} \`${esc(game.id)}\` *${esc(game.title_en)}* — ${esc(game.platform)} ${esc(game.release_year || "?")}`;
}

function formatGameCard(game, isOwned) {
  const parts = [];
  parts.push(`${isOwned ? "✅" : "🎮"} *${esc(game.title_en)}*`);
  parts.push(`🆔 \`${esc(game.id)}\``);
  parts.push(`📟 ${esc(game.platform)}  |  📅 ${esc(game.release_year || "?")}`);
  if (game.genre) parts.push(`🎯 ${esc(game.genre)}`);
  if (game.regions) parts.push(`🌍 ${esc(game.regions)}`);
  if (game.publisher) parts.push(`🏢 ${esc(game.publisher)}`);
  if (game.developer) parts.push(`👨‍💻 ${esc(game.developer)}`);
  if (isOwned) parts.push(`✅ *In your collection*`);
  return parts.join("\n");
}

function formatCollectionItem(item) {
  const game = item.games || item.bootlegs || {};
  const id = item.game_id || item.bootleg_id;
  const price = item.price_paid ? ` — *${parseFloat(item.price_paid).toFixed(2)}€*` : "";
  const condition = item.condition ? ` [${esc(item.condition)}]` : "";
  return `• \`${esc(id)}\` *${esc(game.title_en || "?")}* (${esc(game.platform || "?")} ${esc(game.release_year || "")})${condition}${price}`;
}

// ─── Auth ─────────────────────────────────────────────────

function checkAuth(ctx, env) {
  const allowed = (env.AUTHORIZED_USERS || env.authorized_users || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) return true; // No auth configured — allow all
  return allowed.includes(String(ctx.from?.id || ""));
}

// ─── /start ──────────────────────────────────────────────

export async function handleStart(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  await ctx.reply(
    `🎮 *Game Boy Collection Tracker*\n\n` +
    `*Quick commands:*\n` +
    `🔍 /search \\<name or ID\\> — Find a game\n` +
    `✅ /check \\<name\\> — See if you own it\n` +
    `➕ /add \\<ID\\> — Add to collection\n` +
    `❌ /remove \\<ID\\> — Remove from collection\n` +
    `💰 /price \\<ID\\> \\<amount\\> — Set price\n` +
    `📋 /list — View your collection\n` +
    `📊 /stats — Collection stats\n\n` +
    `_Just type a game name to search, or send a game ID to look it up\\._`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: {
        keyboard: [
          [{ text: "🔍 Search" }, { text: "📋 Collection" }],
          [{ text: "📊 Stats" }, { text: "✅ Check" }],
        ],
        resize_keyboard: true,
      },
    }
  );
}

// ─── /search (and text-based search) ─────────────────────

export async function handleSearch(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const query = (ctx.match || ctx.message?.text || "").trim();
  if (!query) {
    return ctx.reply(
      "🔍 Send me a game name or ID\\.\n_Example:_ `zelda` or `GB-0123`",
      { parse_mode: "MarkdownV2" }
    );
  }

  // If it looks like a game ID, look it up directly
  const idPattern = /^(GB-\d+|GBCB-\d+|GBCC-\d+|GBA-\d+|BOOT-\d+)$/i;
  if (idPattern.test(query)) {
    return handleIdLookup(ctx, supabase, query.toUpperCase());
  }

  // Full-text search
  const { games, bootlegs } = await supabase.searchAll(query, 8);
  const results = [...(games || []), ...(bootlegs || [])];

  if (results.length === 0) {
    return ctx.reply(
      `❌ No games found for *${esc(query)}*\\.\nTry different words\\.`,
      { parse_mode: "MarkdownV2" }
    );
  }

  // Get owned IDs so we can show status inline
  const owned = await supabase.getOwnedGameIds();

  const shown = Math.min(results.length, 8);
  const lines = [`🔍 *Results for "${esc(query)}"* \\(${results.length} found\\)\n`];

  for (let i = 0; i < shown; i++) {
    const g = results[i];
    const id = g.id;
    const isOwned = owned.gameIds.has(id) || owned.bootlegIds.has(id);
    lines.push(formatGameLine(g, isOwned));
  }

  if (results.length > shown) {
    lines.push(`\n_…and ${results.length - shown} more\\. Narrow your search\\._`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "MarkdownV2" });

  // Show first result with action buttons
  const first = results[0];
  const firstOwned = owned.gameIds.has(first.id) || owned.bootlegIds.has(first.id);
  await ctx.reply(
    `📌 *Top result:*\n${formatGameCard(first, firstOwned)}`,
    {
      parse_mode: "MarkdownV2",
      reply_markup: firstOwned
        ? ownedGameKeyboard(first.id)
        : searchResultKeyboard(first.id),
    }
  );
}

// ─── /check — fast "do I own this?" ──────────────────────

export async function handleCheck(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const query = (ctx.match || "").trim();
  if (!query) {
    return ctx.reply(
      "✅ *Quick check* — do you own a game?\n\nUsage: `/check zelda`\n\n_Send a game name or ID and I'll tell you if it's in your collection\\._",
      { parse_mode: "MarkdownV2" }
    );
  }

  // Direct ID match
  const idPattern = /^(GB-\d+|GBCB-\d+|GBCC-\d+|GBA-\d+|BOOT-\d+)$/i;
  if (idPattern.test(query)) {
    return handleIdLookup(ctx, supabase, query.toUpperCase());
  }

  // Search
  const { games, bootlegs } = await supabase.searchAll(query, 5);
  const results = [...(games || []), ...(bootlegs || [])];

  if (results.length === 0) {
    return ctx.reply(`❌ No games found for *${esc(query)}*`, { parse_mode: "MarkdownV2" });
  }

  const owned = await supabase.getOwnedGameIds();
  const ownedResults = results.filter((g) => owned.gameIds.has(g.id) || owned.bootlegIds.has(g.id));
  const notOwnedResults = results.filter((g) => !owned.gameIds.has(g.id) && !owned.bootlegIds.has(g.id));

  const parts = [`🔍 *"${esc(query)}"*\n`];

  if (ownedResults.length > 0) {
    parts.push(`*✅ You own:*`);
    for (const g of ownedResults.slice(0, 5)) {
      // Get price info
      const entry = await supabase.getCollectionEntry(g.id);
      const priceStr = entry?.price_paid ? ` — ${parseFloat(entry.price_paid).toFixed(2)}€` : "";
      parts.push(`  \`${esc(g.id)}\` ${esc(g.title_en)}${esc(priceStr)}`);
    }
    parts.push("");
  }

  if (notOwnedResults.length > 0) {
    parts.push(`*❌ Not owned:*`);
    for (const g of notOwnedResults.slice(0, 5)) {
      parts.push(`  \`${esc(g.id)}\` ${esc(g.title_en)}`);
    }
  }

  if (results.length === 0) {
    parts.push("_No matches found\\._");
  }

  await ctx.reply(parts.join("\n"), { parse_mode: "MarkdownV2" });
}

// ─── ID lookup helper ────────────────────────────────────

async function handleIdLookup(ctx, supabase, gameId) {
  const game = await supabase.getGameById(gameId);
  if (!game) {
    return ctx.reply(`❌ Game *${esc(gameId)}* not found\\.`, { parse_mode: "MarkdownV2" });
  }
  const existing = await supabase.getCollectionEntry(gameId);
  const isOwned = !!(existing && existing.owned);
  const isBootleg = gameId.startsWith("BOOT-");

  const card = formatGameCard(game, isOwned);

  if (isOwned && existing) {
    const extras = [];
    if (existing.price_paid) extras.push(`💰 Paid: *${parseFloat(existing.price_paid).toFixed(2)}€*`);
    if (existing.acquired_date) extras.push(`📅 Acquired: ${existing.acquired_date}`);
    if (existing.condition) extras.push(`📦 ${esc(existing.condition)}`);
    if (existing.notes) extras.push(`📝 ${esc(existing.notes)}`);

    await ctx.reply([card, ...extras].join("\n"), {
      parse_mode: "MarkdownV2",
      reply_markup: ownedGameKeyboard(gameId),
    });
  } else {
    await ctx.reply(card, {
      parse_mode: "MarkdownV2",
      reply_markup: detailKeyboard(gameId, false),
    });
  }
}

// ─── /add ────────────────────────────────────────────────

export async function handleAdd(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const gameId = (ctx.match || "").trim().toUpperCase();
  if (!gameId) {
    return ctx.reply(
      "➕ *Add to collection*\n\nUsage: `/add GB-0123`\n_Find IDs with /search_",
      { parse_mode: "MarkdownV2" }
    );
  }

  const existing = await supabase.getCollectionEntry(gameId);
  if (existing && existing.owned) {
    const game = await supabase.getGameById(gameId);
    return ctx.reply(`⚠️ You already own *${esc(game?.title_en || gameId)}*\\.`, {
      parse_mode: "MarkdownV2",
      reply_markup: ownedGameKeyboard(gameId),
    });
  }

  const result = await supabase.addToCollection(gameId);
  if (result.error) {
    return ctx.reply(`❌ ${esc(result.error)}`, { parse_mode: "MarkdownV2" });
  }

  const card = formatGameCard(result.game, true);
  await ctx.reply(`✅ *Added\\!*\n\n${card}`, {
    parse_mode: "MarkdownV2",
    reply_markup: ownedGameKeyboard(gameId),
  });
}

// ─── /remove ─────────────────────────────────────────────

export async function handleRemove(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const gameId = (ctx.match || "").trim().toUpperCase();
  if (!gameId) {
    return ctx.reply("❌ Usage: `/remove GB-0123`", { parse_mode: "MarkdownV2" });
  }

  const existing = await supabase.getCollectionEntry(gameId);
  if (!existing) {
    return ctx.reply(`⚠️ *${esc(gameId)}* is not in your collection\\.`, { parse_mode: "MarkdownV2" });
  }

  const game = await supabase.getGameById(gameId);
  await ctx.reply(`❓ Remove *${esc(game?.title_en || gameId)}* from your collection?`, {
    parse_mode: "MarkdownV2",
    reply_markup: confirmRemoveKeyboard(gameId),
  });
}

// ─── /price ──────────────────────────────────────────────

export async function handlePrice(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const args = (ctx.match || "").trim().split(/\s+/);
  if (!args || args.length < 2) {
    return ctx.reply(
      "💰 *Set price*\n\nUsage: `/price GB-0123 25\\.50`",
      { parse_mode: "MarkdownV2" }
    );
  }

  const gameId = args[0].toUpperCase();
  const amount = parseFloat(args[1].replace(",", "."));

  if (isNaN(amount) || amount < 0) {
    return ctx.reply("⚠️ Please enter a valid number\\.", { parse_mode: "MarkdownV2" });
  }

  const existing = await supabase.getCollectionEntry(gameId);
  if (!existing) {
    return ctx.reply(`⚠️ *${esc(gameId)}* not in your collection\\. /add it first\\.`, { parse_mode: "MarkdownV2" });
  }

  await supabase.updateCollection(gameId, { price_paid: amount });

  const game = await supabase.getGameById(gameId);
  await ctx.reply(`💰 *${esc(game?.title_en || gameId)}* — ${amount.toFixed(2)}€`, {
    parse_mode: "MarkdownV2",
  });
}

// ─── /list ───────────────────────────────────────────────

export async function handleList(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const filterPlatform = (ctx.match || "").trim().toUpperCase() || null;

  const items = await supabase.listCollection();

  if (!items || items.length === 0) {
    return ctx.reply(
      "📭 *Your collection is empty*\\.\n\nUse /search to find games and /add to start\\!",
      { parse_mode: "MarkdownV2" }
    );
  }

  // Group by platform
  const grouped = {};
  for (const item of items) {
    const game = item.games || item.bootlegs || {};
    const plat = game.platform || "Other";
    // Filter if platform specified (e.g., /list GB)
    if (filterPlatform && plat !== filterPlatform) continue;
    if (!grouped[plat]) grouped[plat] = [];
    grouped[plat].push(item);
  }

  if (Object.keys(grouped).length === 0) {
    return ctx.reply(`📭 No games found for platform *${esc(filterPlatform)}*\\.`, { parse_mode: "MarkdownV2" });
  }

  const total = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  const parts = [
    filterPlatform
      ? `📋 *${esc(filterPlatform)}* \\(${total} games\\)\n`
      : `📋 *Your Collection* \\(${total} games\\)\n`,
  ];

  const platformOrder = ["GB", "GBC", "GBA", "Bootleg", "Other"];

  for (const plat of platformOrder) {
    if (!grouped[plat] || grouped[plat].length === 0) continue;

    const showCount = filterPlatform ? grouped[plat].length : Math.min(grouped[plat].length, 20);
    parts.push(`*${esc(plat)}* \\(${grouped[plat].length}\\):`);

    const shown = grouped[plat].slice(0, showCount);
    for (const item of shown) {
      parts.push(formatCollectionItem(item));
    }

    if (!filterPlatform && grouped[plat].length > 20) {
      parts.push(`  _…${grouped[plat].length - 20} more\\. /list ${plat} for all\\._`);
    }
    parts.push("");
  }

  // Total spent
  const totalSpent = items.reduce((sum, item) => sum + (parseFloat(item.price_paid) || 0), 0);
  if (totalSpent > 0) {
    parts.push(`💰 *Total spent:* ${totalSpent.toFixed(2)}€`);
  }

  await ctx.reply(parts.join("\n"), { parse_mode: "MarkdownV2" });
}

// ─── /stats ──────────────────────────────────────────────

export async function handleStats(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const { stats, totalOwned, totalSpent } = await supabase.getStats();

  const parts = [`📊 *Collection Statistics*\n`];
  parts.push(`🎮 *Total owned:* ${totalOwned} of 3,783 \\(${((totalOwned / 3783) * 100).toFixed(1)}%\\)\n`);

  const platformNames = {
    GB: "Game Boy \\(DMG\\)",
    GBC: "Game Boy Color",
    GBA: "Game Boy Advance",
  };

  for (const row of stats || []) {
    const name = platformNames[row.platform] || row.platform;
    const owned = parseInt(row.owned_count) || 0;
    const total = parseInt(row.total_catalog) || 0;
    const pct = parseFloat(row.completion_pct) || 0;

    const barLen = Math.round(pct / 5);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);

    parts.push(`*${esc(name)}*`);
    parts.push(`${bar}`);
    parts.push(`${owned} / ${total} \\(${pct}%\\)\n`);
  }

  if (totalSpent > 0) {
    parts.push(`💰 *Total spent:* ${totalSpent.toFixed(2)}€`);
    const avg = totalOwned > 0 ? (totalSpent / totalOwned).toFixed(2) : "0";
    parts.push(`📊 *Avg per game:* ${avg}€`);
  }

  await ctx.reply(parts.join("\n"), { parse_mode: "MarkdownV2" });
}

// ─── Callback query handler ──────────────────────────────

export async function handleCallback(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) {
    await ctx.answerCallbackQuery("⛔ Unauthorized");
    return;
  }

  const data = ctx.callbackQuery.data;
  const parts = data.split(":");
  const action = parts[0];
  const value = parts.slice(1).join(":");

  await ctx.answerCallbackQuery();

  switch (action) {
    // ── Add ──────────────────────────────────────────
    case "add": {
      const gameId = value.toUpperCase();
      const existing = await supabase.getCollectionEntry(gameId);
      if (existing && existing.owned) {
        await ctx.reply("⚠️ Already in your collection\\.", { parse_mode: "MarkdownV2" });
        return;
      }
      const result = await supabase.addToCollection(gameId);
      if (result.error) {
        await ctx.reply(`❌ ${esc(result.error)}`, { parse_mode: "MarkdownV2" });
      } else {
        await ctx.reply(`✅ *${esc(result.game?.title_en || gameId)}* added\\!`, {
          parse_mode: "MarkdownV2",
          reply_markup: ownedGameKeyboard(gameId),
        });
      }
      return;
    }

    // ── Remove confirmation ──────────────────────────
    case "remove": {
      const gameId = value.toUpperCase();
      const existing = await supabase.getCollectionEntry(gameId);
      if (!existing) {
        await ctx.reply("⚠️ Not in your collection\\.", { parse_mode: "MarkdownV2" });
        return;
      }
      const game = await supabase.getGameById(gameId);
      await ctx.reply(`❓ Remove *${esc(game?.title_en || gameId)}*?`, {
        parse_mode: "MarkdownV2",
        reply_markup: confirmRemoveKeyboard(gameId),
      });
      return;
    }

    // ── Confirm remove ───────────────────────────────
    case "confirm_remove": {
      const gameId = value.toUpperCase();
      const game = await supabase.getGameById(gameId);
      await supabase.removeFromCollection(gameId);
      await ctx.reply(`❌ Removed *${esc(game?.title_en || gameId)}*\\.`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    case "cancel_remove": {
      await ctx.reply("↩️ Cancelled\\.");
      return;
    }

    // ── View details ─────────────────────────────────
    case "details": {
      const gameId = value.toUpperCase();
      const game = await supabase.getGameById(gameId);
      if (!game) {
        await ctx.reply(`❌ Game not found: *${esc(gameId)}*`, { parse_mode: "MarkdownV2" });
        return;
      }
      const existing = await supabase.getCollectionEntry(gameId);
      const isOwned = !!(existing && existing.owned);
      const card = formatGameCard(game, isOwned);

      if (isOwned && existing) {
        const extras = [];
        if (existing.price_paid) extras.push(`💰 Paid: *${parseFloat(existing.price_paid).toFixed(2)}€*`);
        if (existing.acquired_date) extras.push(`📅 Acquired: ${existing.acquired_date}`);
        if (existing.condition) extras.push(`📦 Condition: ${esc(existing.condition)}`);
        if (existing.notes) extras.push(`📝 ${esc(existing.notes)}`);

        await ctx.reply([card, ...extras].join("\n"), {
          parse_mode: "MarkdownV2",
          reply_markup: ownedGameKeyboard(gameId),
        });
      } else {
        await ctx.reply(card, {
          parse_mode: "MarkdownV2",
          reply_markup: detailKeyboard(gameId, false),
        });
      }
      return;
    }

    // ── Set price (inline flow) ──────────────────────
    case "setprice": {
      // value = gameId:amount
      const [gameId, amountStr] = value.split(":");
      const amount = parseFloat(amountStr.replace(",", "."));
      if (isNaN(amount) || amount < 0) {
        await ctx.reply("⚠️ Invalid amount\\. Use /price instead\\.", { parse_mode: "MarkdownV2" });
        return;
      }
      const existing = await supabase.getCollectionEntry(gameId.toUpperCase());
      if (!existing) {
        await ctx.reply("⚠️ Not in your collection\\. /add it first\\.", { parse_mode: "MarkdownV2" });
        return;
      }
      await supabase.updateCollection(gameId.toUpperCase(), { price_paid: amount });
      const game = await supabase.getGameById(gameId.toUpperCase());
      await ctx.reply(`💰 *${esc(game?.title_en || gameId)}* — ${amount.toFixed(2)}€ saved\\!`, {
        parse_mode: "MarkdownV2",
      });
      return;
    }

    // ── Search again ─────────────────────────────────
    case "search": {
      ctx.match = value;
      return handleSearch(ctx, supabase, env);
    }

    default: {
      console.log(`Unhandled callback: ${data}`);
      return;
    }
  }
}

// ─── Text message handler ────────────────────────────────

export async function handleText(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const text = ctx.message.text.trim();

  if (text === "🔍 Search") {
    return ctx.reply("🔍 Send me a game name or ID\\.\n_Example:_ `zelda` or `GB-0123`", {
      parse_mode: "MarkdownV2",
    });
  }

  if (text === "📋 Collection") {
    return handleList(ctx, supabase, env);
  }

  if (text === "📊 Stats") {
    return handleStats(ctx, supabase, env);
  }

  if (text === "✅ Check") {
    return ctx.reply("✅ Send me a game name to check if you own it\\.\n_Example:_ `zelda`", {
      parse_mode: "MarkdownV2",
    });
  }

  // Treat any other text as a search query
  ctx.match = text;
  return handleSearch(ctx, supabase, env);
}
