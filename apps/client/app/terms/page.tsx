import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "SchedFlow terms of service (draft).",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-foreground">
      <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        DRAFT — have counsel review before charging money.
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: draft. These terms govern use of SchedFlow by hosts and
        invitees.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium">Service</h2>
        <p>
          SchedFlow provides scheduling, booking, and related payment tooling.
          Features and availability may change during the MVP period.
        </p>

        <h2 className="text-lg font-medium">Accounts</h2>
        <p>
          You are responsible for credentials and activity on your account.
          Hosts must have a lawful basis to process invitee data they collect
          through booking forms.
        </p>

        <h2 className="text-lg font-medium">Payments</h2>
        <p>
          Card payments are processed by Stripe. SchedFlow does not store
          primary account numbers. Platform and Connect fees may apply per
          pricing pages.
        </p>

        <h2 className="text-lg font-medium">Acceptable use</h2>
        <p>
          Do not use the service for unlawful activity, abuse, or to circumvent
          security or privacy controls.
        </p>

        <h2 className="text-lg font-medium">Disclaimer</h2>
        <p>
          The service is provided as-is during MVP. Nothing on this page is
          legal advice; counsel should review before commercial launch.
        </p>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </p>
    </main>
  );
}
