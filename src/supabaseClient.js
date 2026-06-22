/**
 * Supabase client for the web app.
 * Uses the anon key — safe for client-side use with RLS policies.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

// ─── Auth helpers ─────────────────────────────────────────

/**
 * Send a magic link to the user's email.
 */
export async function signInWithMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Redirect back to the app after clicking the link
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  return { error };
}

/**
 * Sign out.
 */
export async function signOut() {
  return supabase.auth.signOut();
}

/**
 * Get the current session (used on app load to check if already logged in).
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Listen for auth state changes.
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}

/**
 * After first login, link the Supabase auth user to the app_user table.
 * This is what makes RLS policies work — only this user can see the collection.
 */
export async function linkSupabaseUser() {
  const { error } = await supabase.rpc("link_supabase_user");
  if (error) {
    // If already linked, that's fine — the function only works once
    if (!error.message.includes("already")) {
      console.error("Failed to link user:", error);
    }
  }
}
