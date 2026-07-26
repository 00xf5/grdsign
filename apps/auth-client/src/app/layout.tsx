import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Benchute Auth",
  description: "Connect mail accounts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
