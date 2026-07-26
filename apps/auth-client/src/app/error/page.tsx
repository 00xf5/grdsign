type Props = {
  searchParams: Promise<{ reason?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  email_unverified: "Your email address is not verified. Please verify it with your provider and try again.",
  gmail_scope_denied: "Gmail access was not granted. Please allow all requested permissions.",
  outlook_scope_denied: "Outlook access was not granted. Please allow all requested permissions.",
  missing_refresh_token: "A refresh token was not returned. Please try again — make sure to grant all permissions.",
  email_missing: "Could not retrieve your email address from Microsoft. Please try again.",
  invalid_state: "The login session expired or is invalid. Please start again.",
  missing_code_state: "The OAuth response was incomplete. Please try again.",
  start_failed: "Could not start the login flow. Please try again.",
  callback_failed: "Something went wrong during sign-in. Please try again.",
  access_denied: "Access was denied. Please grant the required permissions and try again.",
};

export default async function ErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const message =
    (reason && ERROR_MESSAGES[reason]) ??
    reason ??
    "An unexpected error occurred. Please try again.";

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ marginBottom: 16 }}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="28" fill="#fce8e6"/>
          <path
            d="M28 18v12M28 34v2"
            stroke="#EA4335"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#d93025" }}>
        Sign-in failed
      </h1>
      <p style={{ color: "#555", marginBottom: 32 }}>{message}</p>
      {reason && (
        <p style={{ fontSize: 12, color: "#aaa", marginBottom: 24, fontFamily: "monospace" }}>
          {reason}
        </p>
      )}
      <a
        href="/"
        style={{
          display: "inline-block",
          padding: "12px 28px",
          background: "#1a73e8",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Try again
      </a>
    </main>
  );
}
