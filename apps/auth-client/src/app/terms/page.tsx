import { LegalShell } from "@/components/LegalShell";

export const metadata = {
  title: "Terms of Service — Benchute",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        <strong>Last updated:</strong> July 26, 2026
      </p>
      <p>
        These Terms of Service (“Terms”) govern your use of Benchute’s mail
        connection and inbox tools (the “Service”), including our auth client
        and self-hosted or hosted inbox applications.
      </p>

      <h2>1. Acceptance</h2>
      <p>
        By signing in, connecting a mailbox, or using the Service, you agree to
        these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>2. The Service</h2>
      <p>
        Benchute helps you connect Google Gmail and/or Microsoft Outlook /
        Microsoft 365 mailboxes and manage mail through an inbox interface.
        Mail provider APIs (Google, Microsoft) remain subject to those
        providers’ own terms.
      </p>

      <h2>3. Accounts and access</h2>
      <p>
        You must use credentials you are authorized to use. You are responsible
        for activity under your Benchute and mailbox connections. Inbox access
        may also be gated by a local username and password configured by the
        operator of a mail-host deployment.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service to violate law or third-party rights;</li>
        <li>attempt to access others’ mailboxes without authorization;</li>
        <li>abuse rate limits, reverse engineer for harm, or disrupt the Service;</li>
        <li>use connected tokens for purposes outside the granted OAuth scopes.</li>
      </ul>

      <h2>5. Data and tokens</h2>
      <p>
        OAuth tokens and related account metadata are stored securely by the
        Service operator (for example in an encrypted database). See our{" "}
        <a href="/privacy">Privacy Statement</a> for details. You may disconnect
        mailboxes at any time via the provider’s account settings and/or
        Benchute disconnect flows where available.
      </p>

      <h2>6. Availability</h2>
      <p>
        The Service is provided “as is.” We do not guarantee uninterrupted
        access. Provider outages, network issues, or misconfiguration may
        affect mail features.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Benchute and its operators are
        not liable for indirect, incidental, or consequential damages arising
        from use of the Service, including mail delivery failures or third-party
        API changes.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms. Continued use after changes constitutes
        acceptance of the updated Terms. The “Last updated” date above will
        change when we revise this page.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these Terms: see our <a href="/support">Support</a>{" "}
        page.
      </p>
    </LegalShell>
  );
}
