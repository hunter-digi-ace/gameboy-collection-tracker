/**
 * Cloudflare Worker entry point.
 * Only handles the Telegram webhook. Web app talks to Supabase directly.
 */
import { webhookCallback } from "grammy";
import { createBot } from "./bot.js";

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  // ─── Telegram webhook ──────────────────────────────────
  if (url.pathname === "/telegram" && request.method === "POST") {
    try {
      const token = env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        return new Response("BOT_TOKEN not configured", { status: 500 });
      }

      // Pass env to createBot so middleware can set ctx.env
      const bot = createBot(token, env);

      const handler = webhookCallback(bot, "cloudflare-mod", {
        timeoutMilliseconds: 10_000,
      });

      return handler(request, env, ctx);
    } catch (err) {
      console.error("Telegram webhook error:", err);
      return new Response("Internal error", { status: 500 });
    }
  }

  // ─── Health check ──────────────────────────────────────
  if (url.pathname === "/") {
    return new Response("🟢 GB Collection Bot", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
