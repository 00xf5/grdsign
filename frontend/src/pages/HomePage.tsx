import { Link } from "react-router-dom";
import { startGoogleSignIn, startMicrosoftSignIn } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { apiClient } from "../api/client";

export function HomePage() {
  const { loading, me, refresh } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p className="muted">Checking session…</p>
      </main>
    );
  }

  if (!me?.authenticated) {
    return (
      <main className="page hero">
        <p className="brand">Benchute</p>
        <h1>Inbox agent</h1>
        <p className="lede">
          Sign in with Google or Microsoft. Tokens stay encrypted in Turso on the backend.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => startGoogleSignIn("/")}
          >
            Sign in with Google
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => startMicrosoftSignIn("/inbox")}
          >
            Sign in with Microsoft
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="top">
        <p className="brand">Benchute</p>
        <div className="user-chip">
          {me.user.pictureUrl ? (
            <img src={me.user.pictureUrl} alt="" width={32} height={32} />
          ) : null}
          <span>{me.user.email}</span>
        </div>
      </header>

      <section className="panel">
        <h1>Account</h1>
        <p className="lede">
          Gmail:{" "}
          <strong>{me.gmailConnected ? "connected" : "not connected"}</strong>
          {" · "}
          Outlook:{" "}
          <strong>{me.outlookConnected ? "connected" : "not connected"}</strong>
        </p>
        <p className="muted">
          If mail says “Reconnect required”, sign in again below to refresh tokens.
        </p>
        <div className="actions">
          <Link className="btn primary" to="/inbox">
            Open inbox
          </Link>
          <button
            type="button"
            className="btn ghost"
            onClick={() => startGoogleSignIn("/inbox")}
          >
            {me.gmailConnected ? "Reconnect Gmail" : "Connect Gmail"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => startMicrosoftSignIn("/inbox")}
          >
            {me.outlookConnected ? "Reconnect Outlook" : "Connect Outlook"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              await apiClient.disconnectGoogle();
              await refresh();
            }}
          >
            Disconnect Google
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              await apiClient.disconnectMicrosoft();
              await refresh();
            }}
          >
            Disconnect Microsoft
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              await apiClient.logout();
              await refresh();
            }}
          >
            Log out
          </button>
        </div>
      </section>
    </main>
  );
}
