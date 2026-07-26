import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px 80px",
        color: "#1c1b19",
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: "0 0 8px", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#1f6b4a" }}>
        Benchute
      </p>
      <h1 style={{ fontSize: 28, margin: "0 0 24px", lineHeight: 1.2 }}>{title}</h1>
      <div style={{ fontSize: 15, color: "#3a3835" }}>{children}</div>
      <nav
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: "1px solid #e4e0d8",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          fontSize: 14,
        }}
      >
        <Link href="/">Home</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
        <Link href="/notes">Notes</Link>
      </nav>
    </main>
  );
}
