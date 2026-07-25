export type OutgoingMail = {
  from: string;
  to: string;
  subject: string;
  body: string;
  cc?: string;
  inReplyTo?: string;
  references?: string;
};

/** Build RFC 2822 message and encode as Gmail raw (base64url). */
export function buildRawMime(mail: OutgoingMail): string {
  const subject = encodeSubject(mail.subject);
  const headers = [
    `From: ${mail.from}`,
    `To: ${mail.to}`,
    ...(mail.cc ? [`Cc: ${mail.cc}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  if (mail.inReplyTo) headers.push(`In-Reply-To: ${mail.inReplyTo}`);
  if (mail.references) headers.push(`References: ${mail.references}`);

  const raw = `${headers.join("\r\n")}\r\n\r\n${mail.body}`;
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  const b64 = Buffer.from(subject, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export function replySubject(original: string): string {
  const s = original.trim() || "(no subject)";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}
