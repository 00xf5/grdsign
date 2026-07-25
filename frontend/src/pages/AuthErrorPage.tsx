import { Link } from "react-router-dom";

export function AuthErrorPage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") ?? "unknown";

  return (
    <main className="page">
      <p className="brand">Benchute</p>
      <h1>Auth didn’t complete</h1>
      <p className="lede">
        Reason: <code>{reason}</code>
      </p>
      <Link className="btn primary" to="/">
        Try again
      </Link>
    </main>
  );
}
