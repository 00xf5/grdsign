/** Decode Gmail API body.data (base64url). */
export function decodeGmailBodyData(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

type PayloadPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: PayloadPart[];
  headers?: Array<{ name: string; value: string }>;
};

export type ExtractedBody = {
  text: string | null;
  html: string | null;
};

/** Prefer html for display; text as fallback. Walks multipart trees. */
export function extractMessageBody(payload: PayloadPart | undefined): ExtractedBody {
  let text: string | null = null;
  let html: string | null = null;

  function walk(part: PayloadPart | undefined): void {
    if (!part) return;
    const mime = (part.mimeType ?? "").toLowerCase();
    if (part.body?.data) {
      const decoded = decodeGmailBodyData(part.body.data);
      if (mime === "text/plain" && !text) text = decoded;
      if (mime === "text/html" && !html) html = decoded;
    }
    for (const child of part.parts ?? []) walk(child);
  }

  walk(payload);
  return { text, html };
}

export function headerMap(
  headers: Array<{ name: string; value: string }> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

/** "Jane Doe <jane@x.com>" → { name, email } */
export function parseFrom(raw: string | null): { name: string; email: string } {
  if (!raw) return { name: "Unknown", email: "" };
  const m = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (!m) return { name: raw, email: "" };
  const name = (m[1] ?? "").trim() || m[2];
  return { name, email: m[2] ?? "" };
}

export function formatMailDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
