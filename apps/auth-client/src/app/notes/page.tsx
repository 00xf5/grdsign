import { LegalShell } from "@/components/LegalShell";

export const metadata = {
  title: "Publisher Notes — Benchute",
};

/** Microsoft “Internal notes” / publisher notes URL. */
export default function NotesPage() {
  return (
    <LegalShell title="Publisher & Internal Notes">
      <p>
        <strong>Last updated:</strong> July 26, 2026
      </p>
      <p>
        Public notes for Microsoft publisher verification, reviewers, and
        operators. This is not end-user marketing content.
      </p>

      <h2>Application purpose</h2>
      <p>
        Benchute is a mail inbox agent. Users authorize Microsoft Graph mail
        permissions (and/or Google Gmail) so the app can list, read, send, and
        manage messages on their behalf through our hosted auth client and
        mail-host applications.
      </p>

      <h2>Architecture (for reviewers)</h2>
      <ul>
        <li>
          <strong>Auth client</strong> — OAuth sign-in / connect; stores encrypted
          tokens in Turso.
        </li>
        <li>
          <strong>Mail host</strong> — gated inbox UI; calls Graph/Gmail using
          stored tokens; does not replace Microsoft’s own security controls.
        </li>
        <li>
          <strong>Scopes requested (Microsoft)</strong> — openid, offline_access,
          profile, email, User.Read, Mail.Read, Mail.Send, Mail.ReadWrite
          (delegated).
        </li>
      </ul>

      <h2>Publisher verification URLs</h2>
      <ul>
        <li>
          Terms of service: <a href="/terms">/terms</a>
        </li>
        <li>
          Privacy statement: <a href="/privacy">/privacy</a>
        </li>
        <li>
          Service management / support: <a href="/support">/support</a>
        </li>
        <li>
          Internal / publisher notes: <a href="/notes">/notes</a> (this page)
        </li>
      </ul>

      <h2>Data residency &amp; retention</h2>
      <p>
        Account and token metadata persist in the operator’s Turso database until
        disconnected or deleted. Message content is retrieved on demand from
        Microsoft Graph / Gmail APIs.
      </p>

      <h2>Contact for verification</h2>
      <p>
        Use <a href="/support">Support</a> for publisher or security review
        questions.
      </p>
    </LegalShell>
  );
}
