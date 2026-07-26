import { LegalShell } from "@/components/LegalShell";

export const metadata = {
  title: "Privacy Statement — Benchute",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Statement">
      <p>
        <strong>Last updated:</strong> July 26, 2026
      </p>
      <p>
        This Privacy Statement explains how Benchute (“we”, “us”) handles
        information when you use our auth client and inbox Service.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account profile</strong> — email address, name, and provider
          identifiers (for example Google subject or Microsoft object id) from
          sign-in.
        </li>
        <li>
          <strong>Mailbox connection data</strong> — OAuth access and refresh
          tokens (encrypted at rest), granted scopes, and connected mailbox
          email addresses.
        </li>
        <li>
          <strong>Mail content</strong> — message metadata and bodies are
          fetched from Google or Microsoft when you use the inbox; we do not
          sell your mail content.
        </li>
        <li>
          <strong>Technical logs</strong> — basic operational logs (errors,
          auth failures) needed to run and secure the Service.
        </li>
      </ul>

      <h2>2. How we use information</h2>
      <ul>
        <li>to authenticate you and link mailboxes;</li>
        <li>to read, send, and manage mail you request in the inbox;</li>
        <li>to maintain security, debug issues, and improve reliability;</li>
        <li>to comply with law when required.</li>
      </ul>

      <h2>3. Storage and security</h2>
      <p>
        Tokens are encrypted with an application secret before storage in our
        database (Turso / libSQL). Session cookies are httpOnly. You should
        protect inbox login credentials and never share encryption keys.
      </p>

      <h2>4. Sharing</h2>
      <p>
        We do not sell personal data. We share data only with:
      </p>
      <ul>
        <li>
          <strong>Google / Microsoft</strong> — when calling their APIs on your
          behalf under scopes you grant;
        </li>
        <li>
          <strong>Infrastructure providers</strong> — hosting and database
          vendors that process data under our instruction;
        </li>
        <li>
          <strong>Legal requirements</strong> — if required by law or to protect
          rights and safety.
        </li>
      </ul>

      <h2>5. Your choices</h2>
      <ul>
        <li>Disconnect Google or Microsoft access in the provider’s security settings.</li>
        <li>Request deletion of Benchute-stored grants/profile via Support.</li>
        <li>Stop using the Service and revoke local inbox sessions by logging out.</li>
      </ul>

      <h2>6. Children</h2>
      <p>
        The Service is not directed to children under 13 (or the minimum age in
        your jurisdiction).
      </p>

      <h2>7. International transfers</h2>
      <p>
        Data may be processed in regions where our hosting and database
        providers operate. By using the Service you understand that processing
        may occur outside your home country.
      </p>

      <h2>8. Contact</h2>
      <p>
        Privacy questions: <a href="/support">Support</a>.
      </p>
    </LegalShell>
  );
}
