import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ provider?: string }>;
};

export default async function ConnectedPage({ searchParams }: Props) {
  const { provider } = await searchParams;
  const mailHostUrl = env.MAIL_HOST_URL;

  const providerLabel =
    provider === "google"
      ? "Gmail"
      : provider === "microsoft"
        ? "Outlook"
        : "your mail account";

  return (
    <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="28" fill="#e6f4ea"/>
          <path
            d="M17 28l8 8 14-14"
            stroke="#34A853"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12, letterSpacing: "-0.02em" }}>
        Congratulations
      </h1>
      <p style={{ color: "#444", marginBottom: 8, fontSize: 16, lineHeight: 1.5 }}>
        Your {providerLabel} account has been connected successfully.
      </p>
      <p style={{ color: "#666", marginBottom: 32, fontSize: 15, lineHeight: 1.5 }}>
        You can proceed to Benchute Mail.
      </p>

      <a
        href={`${mailHostUrl}/login?connected=${provider === "google" ? "gmail" : "outlook"}`}
        style={{
          display: "inline-block",
          padding: "12px 28px",
          background: "#1a73e8",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
          fontSize: 15,
          marginBottom: 16,
        }}
      >
        Proceed to Mail
      </a>

      <br />
      <a
        href="/"
        style={{ fontSize: 13, color: "#5f6368" }}
      >
        Connect another account
      </a>
    </main>
  );
}
