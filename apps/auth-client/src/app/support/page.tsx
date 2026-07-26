import { LegalShell } from "@/components/LegalShell";

export const metadata = {
  title: "Support & Service Management — Benchute",
};

/** Microsoft “Service management URL” / support URL for publisher verification. */
export default function SupportPage() {
  return (
    <LegalShell title="Support & Service Management">
      <p>
        <strong>Last updated:</strong> July 26, 2026
      </p>
      <p>
        This page is the public support and service-management contact point
        for Benchute (Microsoft / Entra app publisher verification).
      </p>

      <h2>Product</h2>
      <p>
        Benchute connects Gmail and Microsoft Outlook / Microsoft 365 mailboxes
        and provides an inbox agent interface for reading and managing mail.
      </p>

      <h2>Get help</h2>
      <ul>
        <li>
          <strong>Connect mail:</strong>{" "}
          <a href="/">Auth client home</a>
        </li>
        <li>
          <strong>Open inbox:</strong> use the mail-host URL configured for your
          deployment (linked from the connect success page).
        </li>
        <li>
          <strong>Email support:</strong>{" "}
          <a href="mailto:support@benchute.app">support@benchute.app</a>
          {" "}(replace with your real operator address if different).
        </li>
      </ul>

      <h2>Common issues</h2>
      <ul>
        <li>
          <strong>OAuth / reconnect required</strong> — reconnect from the auth
          client; ensure redirect URIs match your deployed auth-client domain.
        </li>
        <li>
          <strong>Empty inbox</strong> — confirm the correct Microsoft/Google
          account and that <code>INBOX_OWNER_USER_ID</code> points at your
          Benchute user.
        </li>
        <li>
          <strong>Permissions</strong> — revoke access anytime in{" "}
          <a
            href="https://myaccount.microsoft.com/permissions"
            rel="noopener noreferrer"
            target="_blank"
          >
            Microsoft account permissions
          </a>{" "}
          or{" "}
          <a
            href="https://myaccount.google.com/permissions"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google account permissions
          </a>
          .
        </li>
      </ul>

      <h2>Service status &amp; operator notes</h2>
      <p>
        Operational notes for publishers and admins:{" "}
        <a href="/notes">Internal notes</a>.
      </p>
    </LegalShell>
  );
}
