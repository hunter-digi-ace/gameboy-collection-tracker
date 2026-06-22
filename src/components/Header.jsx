export function Header({ onSignOut }) {
  return (
    <header class="header">
      <div class="header-inner">
        <h1>
          <span class="header-icon">🎮</span>
          Game Boy Collection Tracker
        </h1>
        <nav class="header-nav">
          <a
            href="https://t.me/your_bot_username"
            target="_blank"
            rel="noopener"
            title="Open in Telegram"
          >
            📱 Bot
          </a>
          {onSignOut && (
            <button class="btn btn-small" onClick={onSignOut} title="Sign out">
              🚪 Logout
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
