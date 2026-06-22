/**
 * grammY bot setup + command registration.
 * The env middleware MUST be registered first so ctx.env is available
 * before any command handler tries to use createSupabaseClient.
 */
import { Bot } from "grammy";
import { createSupabaseClient } from "./supabase.js";
import {
  handleStart, handleSearch, handleCheck, handleAdd,
  handleRemove, handlePrice, handleList, handleStats,
  handleCallback, handleText,
} from "./handlers.js";

export function createBot(token, env) {
  const bot = new Bot(token);

  // ─── CRITICAL: must be first middleware ────────────────
  // Makes env available to every handler via ctx.env
  bot.use(async (ctx, next) => {
    ctx.env = env;
    await next();
  });

  // ─── Commands ──────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleStart(ctx, db, ctx.env);
  });

  bot.command("help", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleStart(ctx, db, ctx.env);
  });

  bot.command("search", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleSearch(ctx, db, ctx.env);
  });

  bot.command("s", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleSearch(ctx, db, ctx.env);
  });

  bot.command("check", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleCheck(ctx, db, ctx.env);
  });

  bot.command("c", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleCheck(ctx, db, ctx.env);
  });

  bot.command("add", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleAdd(ctx, db, ctx.env);
  });

  bot.command("a", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleAdd(ctx, db, ctx.env);
  });

  bot.command("remove", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleRemove(ctx, db, ctx.env);
  });

  bot.command("rm", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleRemove(ctx, db, ctx.env);
  });

  bot.command("delete", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleRemove(ctx, db, ctx.env);
  });

  bot.command("price", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handlePrice(ctx, db, ctx.env);
  });

  bot.command("list", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleList(ctx, db, ctx.env);
  });

  bot.command("l", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleList(ctx, db, ctx.env);
  });

  bot.command("stats", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleStats(ctx, db, ctx.env);
  });

  // ─── Callback queries ──────────────────────────────────

  bot.on("callback_query:data", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleCallback(ctx, db, ctx.env);
  });

  // ─── Text messages ─────────────────────────────────────

  bot.on("message:text", async (ctx) => {
    const db = createSupabaseClient(ctx.env);
    await handleText(ctx, db, ctx.env);
  });

  return bot;
}
