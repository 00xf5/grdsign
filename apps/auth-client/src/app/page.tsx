import { env } from "@/lib/env";

export default function HomePage() {
  const mailHostUrl = env.MAIL_HOST_URL;

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Connect your mail</h1>
      <p style={{ color: "#555", marginBottom: 32 }}>
        Link a Gmail or Outlook account to get started with Benchute.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <a
          href="/api/auth/google/start"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            background: "#fff",
            border: "1.5px solid #dadce0",
            borderRadius: 8,
            textDecoration: "none",
            color: "#3c4043",
            fontWeight: 500,
            fontSize: 15,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.6 2.2 30.2 0 24 0 14.8 0 6.9 5.4 3 13.3l7.9 6.1C12.8 13.2 18 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.4c-.5 2.8-2.2 5.2-4.6 6.8l7.2 5.6c4.2-3.9 6.6-9.6 6.6-16.4z"/>
            <path fill="#FBBC05" d="M10.9 28.6A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.4 13.3A23.9 23.9 0 0 0 0 24c0 3.8.9 7.4 2.4 10.7l8.5-6.1z"/>
            <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.2-5.6c-2 1.4-4.6 2.1-8 2.1-6 0-11.2-3.7-13.1-9.4l-8.5 6.1C6.9 42.6 14.8 48 24 48z"/>
          </svg>
          Connect Gmail
        </a>

        <a
          href="/api/auth/microsoft/start"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 20px",
            background: "#fff",
            border: "1.5px solid #dadce0",
            borderRadius: 8,
            textDecoration: "none",
            color: "#3c4043",
            fontWeight: 500,
            fontSize: 15,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#F25022" d="M1 1h21v21H1z"/>
            <path fill="#7FBA00" d="M26 1h21v21H26z"/>
            <path fill="#00A4EF" d="M1 26h21v21H1z"/>
            <path fill="#FFB900" d="M26 26h21v21H26z"/>
          </svg>
          Connect Outlook
        </a>
      </div>

      <p style={{ marginTop: 40, fontSize: 13, color: "#888" }}>
        Already connected?{" "}
        <a href={mailHostUrl} style={{ color: "#1a73e8" }}>
          Open Benchute mail
        </a>
      </p>
    </main>
  );
}
