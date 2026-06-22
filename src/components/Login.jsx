import { useState } from "preact/hooks";
import { signInWithMagicLink } from "../supabaseClient.js";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);

    const { error: err } = await signInWithMagicLink(email.trim());

    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div class="login-page">
      <div class="login-card">
        <div class="login-icon">🎮</div>
        <h1>Game Boy Collection</h1>
        <p class="login-subtitle">Sign in to access your collection tracker</p>

        {!sent ? (
          <form onSubmit={handleSubmit} class="login-form">
            <label for="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onInput={(e) => setEmail(e.target.value)}
              required
              autofocus
              class="input login-input"
            />
            <button type="submit" class="btn btn-primary login-btn" disabled={loading}>
              {loading ? "Sending..." : "Send Magic Link ✉️"}
            </button>
            {error && <p class="message message-error">{error}</p>}
          </form>
        ) : (
          <div class="login-sent">
            <div class="login-check">✅</div>
            <h2>Check your email</h2>
            <p>
              We sent a magic link to <strong>{email}</strong>.
            </p>
            <p class="hint">
              Click the link in the email to sign in. You can close this page.
            </p>
          </div>
        )}

        <p class="login-footer">
          No passwords, no accounts — just a link to your inbox.
        </p>
      </div>
    </div>
  );
}
