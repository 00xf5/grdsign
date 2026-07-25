export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">B</span>
          <span className="auth-logo-text">Benchute Mail</span>
        </div>

        <h1 className="auth-heading">Sign in to your inbox</h1>

        {error && (
          <p className="auth-error" role="alert">
            Invalid username or password.
          </p>
        )}

        <form action="/api/login" method="POST" className="auth-form">
          <div className="auth-field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              placeholder="admin"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="auth-btn">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
