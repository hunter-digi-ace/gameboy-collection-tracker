/**
 * Telegram bot command and callback handlers.
 * Uses HTML parse mode throughout — MUCH simpler than MarkdownV2.
 * Only 3 chars to escape: < > &
 */
import {
  searchResultKeyboard, detailKeyboard, confirmRemoveKeyboard,
  ownedGameKeyboard,
} from "./keyboards.js";

// ─── Escape helpers ──────────────────────────────────────

function esc(text) {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function code(text) {
  return `<code>${esc(text)}</code>`;
}

function bold(text) {
  return `<b>${esc(text)}</b>`;
}

function italic(text) {
  return `<i>${esc(text)}</i>`;
}

// ─── Formatting ──────────────────────────────────────────

function formatGameLine(game, isOwned) {
  const icon = isOwned ? "✅" : "❌";
  return `${icon} ${code(game.id)} ${bold(game.title_en)} -- ${esc(game.platform)} ${esc(game.release_year || "?")}`;
}

function formatGameCard(game, isOwned) {
  const p = [];
  p.push(`${isOwned ? "✅" : "🎮"} ${bold(game.title_en)}`);
  p.push(`🆔 ${code(game.id)}`);
  p.push(`📟 ${esc(game.platform)}  |  📅 ${esc(game.release_year || "?")}`);
  if (game.genre) p.push(`🎯 ${esc(game.genre)}`);
  if (game.regions) p.push(`🌍 ${esc(game.regions)}`);
  if (game.publisher) p.push(`🏢 ${esc(game.publisher)}`);
  if (game.developer) p.push(`👨‍💻 ${esc(game.developer)}`);
  if (isOwned) p.push(`✅ <b>In your collection</b>`);
  return p.join("\n");
}

function formatCollectionItem(item) {
  const game = item.games || item.bootlegs || {};
  const id = item.game_id || item.bootleg_id;
  const priceText = item.price_paid ? ` -- <b>${esc(parseFloat(item.price_paid).toFixed(2))}€</b>` : "";
  const condText = item.condition ? ` [${esc(item.condition)}]` : "";
  return `• ${code(id)} ${bold(game.title_en || "?")} (${esc(game.platform || "?")} ${esc(game.release_year || "")})${condText}${priceText}`;
}

// ─── Auth ─────────────────────────────────────────────────

function checkAuth(ctx, env) {
  const allowed = (env.AUTHORIZED_USERS || env.authorized_users || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(String(ctx.from?.id || ""));
}

// ─── /start ──────────────────────────────────────────────

export async function handleStart(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  await ctx.reply(
    `🎮 <b>Game Boy Collection Tracker</b>\n\n` +
    `<b>Commands:</b>\n` +
    `🔍 /search or /s -- Find a game\n` +
    `✅ /check or /c -- See if you own it\n` +
    `➕ /add or /a -- Add to collection\n` +
    `❌ /remove or /rm -- Remove from collection\n` +
    `💰 /price &lt;ID&gt; &lt;amount&gt; -- Set price\n` +
    `📋 /list or /l -- View your collection\n` +
    `📊 /stats -- Collection stats\n\n` +
    `<i>Just type a game name to search, or send an ID to look it up.</i>`,
    {
      parse_mode: "HTML",
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

// ─── /search ─────────────────────────────────────────────

export async function handleSearch(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const query = (ctx.match || ctx.message?.text || "").trim();
  if (!query) {
    return ctx.reply(`🔍 Send me a game name or ID.\n<i>Example:</i> ${code("zelda")} or ${code("GB-0123")}`, { parse_mode: "HTML" });
  }

  if (/^(GB-\d+|GBCB-\d+|GBCC-\d+|GBA-\d+|BOOT-\d+)$/i.test(query)) {
    return handleIdLookup(ctx, supabase, query.toUpperCase());
  }

  const { games, bootlegs } = await supabase.searchAll(query, 8);
  const results = [...(games || []), ...(bootlegs || [])];

  if (results.length === 0) {
    return ctx.reply(`❌ No games found for <b>${esc(query)}</b>.`, { parse_mode: "HTML" });
  }

  const owned = await supabase.getOwnedGameIds();
  const shown = Math.min(results.length, 8);
  const lines = [`🔍 <b>Results for "${esc(query)}"</b> (${results.length} found)\n`];

  for (let i = 0; i < shown; i++) {
    const g = results[i];
    const isOwned = owned.gameIds.has(g.id) || owned.bootlegIds.has(g.id);
    lines.push(formatGameLine(g, isOwned));
  }

  if (results.length > shown) {
    lines.push(`\n<i>…and ${results.length - shown} more. Narrow your search.</i>`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });

  // Top result with buttons
  const first = results[0];
  const firstOwned = owned.gameIds.has(first.id) || owned.bootlegIds.has(first.id);
  await ctx.reply(
    `📌 <b>Top result:</b>\n${formatGameCard(first, firstOwned)}`,
    {
      parse_mode: "HTML",
      reply_markup: firstOwned ? ownedGameKeyboard(first.id) : searchResultKeyboard(first.id),
    }
  );
}

// ─── /check ──────────────────────────────────────────────

export async function handleCheck(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const query = (ctx.match || "").trim();
  if (!query) {
    return ctx.reply(`✅ <b>Quick check</b> -- do you own a game?\n\nUsage: ${code("/check zelda")}\n\n<i>Send a name or ID.</i>`, { parse_mode: "HTML" });
  }

  if (/^(GB-\d+|GBCB-\d+|GBCC-\d+|GBA-\d+|BOOT-\d+)$/i.test(query)) {
    return handleIdLookup(ctx, supabase, query.toUpperCase());
  }

  const { games, bootlegs } = await supabase.searchAll(query, 5);
  const results = [...(games || []), ...(bootlegs || [])];

  if (results.length === 0) {
    return ctx.reply(`❌ No games found for <b>${esc(query)}</b>`, { parse_mode: "HTML" });
  }

  const owned = await supabase.getOwnedGameIds();
  const ownedResults = results.filter(g => owned.gameIds.has(g.id) || owned.bootlegIds.has(g.id));
  const notOwnedResults = results.filter(g => !owned.gameIds.has(g.id) && !owned.bootlegIds.has(g.id));

  const parts = [`🔍 <b>"${esc(query)}"</b>\n`];

  if (ownedResults.length > 0) {
    parts.push(`<b>✅ You own:</b>`);
    for (const g of ownedResults.slice(0, 5)) {
      const entry = await supabase.getCollectionEntry(g.id);
      const priceStr = entry?.price_paid ? ` -- ${esc(parseFloat(entry.price_paid).toFixed(2))}€` : "";
      parts.push(`  ${code(g.id)} ${esc(g.title_en)}${priceStr}`);
    }
    parts.push("");
  }

  if (notOwnedResults.length > 0) {
    parts.push(`<b>❌ Not owned:</b>`);
    for (const g of notOwnedResults.slice(0, 5)) {
      parts.push(`  ${code(g.id)} ${esc(g.title_en)}`);
    }
  }

  await ctx.reply(parts.join("\n"), { parse_mode: "HTML" });
}

// ─── ID lookup ───────────────────────────────────────────

async function handleIdLookup(ctx, supabase, gameId) {
  const game = await supabase.getGameById(gameId);
  if (!game) {
    return ctx.reply(`❌ Game <b>${esc(gameId)}</b> not found.`, { parse_mode: "HTML" });
  }
  const existing = await supabase.getCollectionEntry(gameId);
  const isOwned = !!(existing && existing.owned);
  const card = formatGameCard(game, isOwned);

  if (isOwned && existing) {
    const extras = [];
    if (existing.price_paid) extras.push(`💰 Paid: <b>${esc(parseFloat(existing.price_paid).toFixed(2))}€</b>`);
    if (existing.acquired_date) extras.push(`📅 Acquired: ${esc(existing.acquired_date)}`);
    if (existing.condition) extras.push(`📦 ${esc(existing.condition)}`);
    if (existing.notes) extras.push(`📝 ${esc(existing.notes)}`);
    await ctx.reply([card, ...extras].join("\n"), {
      parse_mode: "HTML",
      reply_markup: ownedGameKeyboard(gameId),
    });
  } else {
    await ctx.reply(card, {
      parse_mode: "HTML",
      reply_markup: detailKeyboard(gameId, false),
    });
  }
}

// ─── /add ────────────────────────────────────────────────

export async function handleAdd(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  const gameId = (ctx.match || "").trim().toUpperCase();
  if (!gameId) return ctx.reply(`➕ <b>Add to collection</b>\n\nUsage: ${code("/add GB-0123")}\n<i>Find IDs with /search</i>`, { parse_mode: "HTML" });

  const existing = await supabase.getCollectionEntry(gameId);
  if (existing && existing.owned) {
    const game = await supabase.getGameById(gameId);
    return ctx.reply(`⚠️ You already own <b>${esc(game?.title_en || gameId)}</b>.`, { parse_mode: "HTML", reply_markup: ownedGameKeyboard(gameId) });
  }

  const result = await supabase.addToCollection(gameId);
  if (result.error) return ctx.reply(`❌ ${esc(result.error)}`, { parse_mode: "HTML" });

  await ctx.reply(`✅ <b>Added!</b>\n\n${formatGameCard(result.game, true)}`, {
    parse_mode: "HTML",
    reply_markup: ownedGameKeyboard(gameId),
  });
}

// ─── /remove ─────────────────────────────────────────────

export async function handleRemove(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  const gameId = (ctx.match || "").trim().toUpperCase();
  if (!gameId) return ctx.reply(`❌ Usage: ${code("/remove GB-0123")}`, { parse_mode: "HTML" });

  const existing = await supabase.getCollectionEntry(gameId);
  if (!existing) return ctx.reply(`⚠️ <b>${esc(gameId)}</b> is not in your collection.`, { parse_mode: "HTML" });

  const game = await supabase.getGameById(gameId);
  await ctx.reply(`❓ Remove <b>${esc(game?.title_en || gameId)}</b> from your collection?`, {
    parse_mode: "HTML",
    reply_markup: confirmRemoveKeyboard(gameId),
  });
}

// ─── /price ──────────────────────────────────────────────

export async function handlePrice(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  const args = (ctx.match || "").trim().split(/\s+/);
  if (!args || args.length < 2) return ctx.reply(`💰 <b>Set price</b>\n\nUsage: ${code("/price GB-0123 25.50")}`, { parse_mode: "HTML" });

  const gameId = args[0].toUpperCase();
  const amount = parseFloat(args[1].replace(",", "."));
  if (isNaN(amount) || amount < 0) return ctx.reply("⚠️ Please enter a valid number.", { parse_mode: "HTML" });

  const existing = await supabase.getCollectionEntry(gameId);
  if (!existing) return ctx.reply(`⚠️ <b>${esc(gameId)}</b> not in your collection. /add it first.`, { parse_mode: "HTML" });

  await supabase.updateCollection(gameId, { price_paid: amount });
  const game = await supabase.getGameById(gameId);
  await ctx.reply(`💰 <b>${esc(game?.title_en || gameId)}</b> -- ${esc(amount.toFixed(2))}€`, { parse_mode: "HTML" });
}

// ─── /list ───────────────────────────────────────────────

export async function handleList(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  const filterPlatform = (ctx.match || "").trim().toUpperCase() || null;
  const items = await supabase.listCollection();

  if (!items || items.length === 0) {
    return ctx.reply("📭 <b>Your collection is empty.</b>\n\nUse /search to find games and /add to start!", { parse_mode: "HTML" });
  }

  const grouped = {};
  for (const item of items) {
    const game = item.games || item.bootlegs || {};
    const plat = game.platform || "Other";
    if (filterPlatform && plat !== filterPlatform) continue;
    if (!grouped[plat]) grouped[plat] = [];
    grouped[plat].push(item);
  }

  if (Object.keys(grouped).length === 0) {
    return ctx.reply(`📭 No games found for platform <b>${esc(filterPlatform)}</b>.`, { parse_mode: "HTML" });
  }

  const total = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  const parts = [filterPlatform ? `📋 <b>${esc(filterPlatform)}</b> (${total} games)\n` : `📋 <b>Your Collection</b> (${total} games)\n`];

  for (const plat of ["GB", "GBC", "GBA", "Bootleg", "Other"]) {
    if (!grouped[plat] || grouped[plat].length === 0) continue;
    const showCount = filterPlatform ? grouped[plat].length : Math.min(grouped[plat].length, 20);
    parts.push(`<b>${esc(plat)}</b> (${grouped[plat].length}):`);
    for (const item of grouped[plat].slice(0, showCount)) {
      parts.push(formatCollectionItem(item));
    }
    if (!filterPlatform && grouped[plat].length > 20) {
      parts.push(`  <i>…${grouped[plat].length - 20} more. /list ${plat} for all.</i>`);
    }
    parts.push("");
  }

  const totalSpent = items.reduce((sum, item) => sum + (parseFloat(item.price_paid) || 0), 0);
  if (totalSpent > 0) {
    parts.push(`💰 <b>Total spent:</b> ${esc(totalSpent.toFixed(2))}€`);
  }
  await ctx.reply(parts.join("\n"), { parse_mode: "HTML" });
}

// ─── /stats ──────────────────────────────────────────────

export async function handleStats(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");

  const { stats, totalOwned, totalSpent } = await supabase.getStats();
  const catalogTotal = 3783;
  const overallPct = ((totalOwned / catalogTotal) * 100).toFixed(1);

  const parts = [`📊 <b>Collection Statistics</b>\n`];
  parts.push(`🎮 <b>Total owned:</b> ${totalOwned} of ${catalogTotal} (${overallPct}%)\n`);

  const platformNames = { GB: "Game Boy (DMG)", GBC: "Game Boy Color", GBA: "Game Boy Advance" };

  for (const row of stats || []) {
    const name = platformNames[row.platform] || row.platform;
    const owned = parseInt(row.owned_count) || 0;
    const total = parseInt(row.total_catalog) || 0;
    const pct = parseFloat(row.completion_pct) || 0;

    const barLen = Math.round(pct / 5);
    const bar = "█".repeat(barLen) + "░".repeat(20 - barLen);

    parts.push(`<b>${esc(name)}</b>`);
    parts.push(`${bar}`);
    parts.push(`${owned} / ${total} (${pct}%)\n`);
  }

  if (totalSpent > 0) {
    const avg = totalOwned > 0 ? (totalSpent / totalOwned).toFixed(2) : "0";
    parts.push(`💰 <b>Total spent:</b> ${esc(totalSpent.toFixed(2))}€`);
    parts.push(`📊 <b>Avg per game:</b> ${esc(avg)}€`);
  }

  await ctx.reply(parts.join("\n"), { parse_mode: "HTML" });
}

// ─── Callback query handler ──────────────────────────────

export async function handleCallback(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) { await ctx.answerCallbackQuery("⛔ Unauthorized"); return; }

  const data = ctx.callbackQuery.data;
  const [action, ...rest] = data.split(":");
  const value = rest.join(":");

  await ctx.answerCallbackQuery();

  switch (action) {
    case "add": {
      const gameId = value.toUpperCase();
      const existing = await supabase.getCollectionEntry(gameId);
      if (existing && existing.owned) {
        await ctx.reply("⚠️ Already in your collection.", { parse_mode: "HTML" });
        return;
      }
      const result = await supabase.addToCollection(gameId);
      if (result.error) {
        await ctx.reply(`❌ ${esc(result.error)}`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`✅ <b>${esc(result.game?.title_en || gameId)}</b> added!`, { parse_mode: "HTML", reply_markup: ownedGameKeyboard(gameId) });
      }
      return;
    }

    case "remove": {
      const gameId = value.toUpperCase();
      const existing = await supabase.getCollectionEntry(gameId);
      if (!existing) { await ctx.reply("⚠️ Not in your collection.", { parse_mode: "HTML" }); return; }
      const game = await supabase.getGameById(gameId);
      await ctx.reply(`❓ Remove <b>${esc(game?.title_en || gameId)}</b>?`, { parse_mode: "HTML", reply_markup: confirmRemoveKeyboard(gameId) });
      return;
    }

    case "confirm_remove": {
      const gameId = value.toUpperCase();
      const game = await supabase.getGameById(gameId);
      await supabase.removeFromCollection(gameId);
      await ctx.reply(`❌ Removed <b>${esc(game?.title_en || gameId)}</b>.`, { parse_mode: "HTML" });
      return;
    }

    case "cancel_remove":
      await ctx.reply("↩️ Cancelled.");
      return;

    case "details": {
      const gameId = value.toUpperCase();
      const game = await supabase.getGameById(gameId);
      if (!game) { await ctx.reply(`❌ Game not found: <b>${esc(gameId)}</b>`, { parse_mode: "HTML" }); return; }
      const existing = await supabase.getCollectionEntry(gameId);
      const isOwned = !!(existing && existing.owned);
      const card = formatGameCard(game, isOwned);

      if (isOwned && existing) {
        const extras = [];
        if (existing.price_paid) extras.push(`💰 Paid: <b>${esc(parseFloat(existing.price_paid).toFixed(2))}€</b>`);
        if (existing.acquired_date) extras.push(`📅 Acquired: ${esc(existing.acquired_date)}`);
        if (existing.condition) extras.push(`📦 Condition: ${esc(existing.condition)}`);
        if (existing.notes) extras.push(`📝 ${esc(existing.notes)}`);
        await ctx.reply([card, ...extras].join("\n"), { parse_mode: "HTML", reply_markup: ownedGameKeyboard(gameId) });
      } else {
        await ctx.reply(card, { parse_mode: "HTML", reply_markup: detailKeyboard(gameId, false) });
      }
      return;
    }

    case "setprice": {
      const [gid, amtStr] = value.split(":");
      const amount = parseFloat(amtStr.replace(",", "."));
      if (isNaN(amount) || amount < 0) { await ctx.reply("⚠️ Invalid amount. Use /price instead.", { parse_mode: "HTML" }); return; }
      const existing = await supabase.getCollectionEntry(gid.toUpperCase());
      if (!existing) { await ctx.reply("⚠️ Not in your collection. /add it first.", { parse_mode: "HTML" }); return; }
      await supabase.updateCollection(gid.toUpperCase(), { price_paid: amount });
      const game = await supabase.getGameById(gid.toUpperCase());
      await ctx.reply(`💰 <b>${esc(game?.title_en || gid)}</b> -- ${esc(amount.toFixed(2))}€ saved!`, { parse_mode: "HTML" });
      return;
    }

    case "search":
      ctx.match = value;
      return handleSearch(ctx, supabase, env);

    default:
      console.log(`Unhandled callback: ${data}`);
  }
}

// ─── Text messages ───────────────────────────────────────

export async function handleText(ctx, supabase, env) {
  if (!checkAuth(ctx, env)) return ctx.reply("⛔ Unauthorized.");
  const text = ctx.message.text.trim();

  if (text === "🔍 Search") return ctx.reply(`🔍 Send me a game name or ID.\n<i>Example:</i> ${code("zelda")} or ${code("GB-0123")}`, { parse_mode: "HTML" });
  if (text === "📋 Collection") return handleList(ctx, supabase, env);
  if (text === "📊 Stats") return handleStats(ctx, supabase, env);
  if (text === "✅ Check") return ctx.reply(`✅ Send me a game name to check if you own it.\n<i>Example:</i> ${code("zelda")}`, { parse_mode: "HTML" });

  ctx.match = text;
  return handleSearch(ctx, supabase, env);
}
