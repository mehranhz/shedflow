import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "SchedFlow privacy policy (draft).",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-foreground">
      <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        DRAFT — have counsel review before charging money.
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Last updated: draft. This page describes how SchedFlow processes personal
        data for scheduling and payments.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium">Who we are</h2>
        <p>
          SchedFlow (&quot;we&quot;) provides scheduling software for organizations
          (hosts) and people who book with them (invitees).
        </p>

        <h2 className="text-lg font-medium">Data we process</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account data: name, email, password hash, timezone, locale.</li>
          <li>
            Booking data: invitee name, email, phone (optional), answers, time,
            timezone, and related metadata (including privacy consent timestamp
            when collected).
          </li>
          <li>Payment references via Stripe (no card PAN stored by SchedFlow).</li>
          <li>Technical logs for security and abuse prevention.</li>
        </ul>

        <h2 className="text-lg font-medium">Lawful bases</h2>
        <p>
          Contract for bookings and account services; legitimate interest for
          abuse and security logs.
        </p>

        <h2 className="text-lg font-medium">Your rights (GDPR / CCPA)</h2>
        <p>
          Hosts can export or anonymize customer records via the product APIs.
          Account holders may export (`GET /v1/me/export`) or erase
          (`DELETE /v1/me`) their account data. Erasure anonymizes personal
          fields; booking time rows may remain for the host calendar.
        </p>

        <h2 className="text-lg font-medium">Subprocessors</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Stripe — payments and Connect</li>
          <li>Resend — transactional email</li>
          <li>Neon / Supabase — database hosting</li>
          <li>Vercel — application hosting</li>
          <li>Google / Microsoft — calendar sync (when connected)</li>
          <li>Sentry — error monitoring (when enabled)</li>
        </ul>

        <h2 className="text-lg font-medium">Contact</h2>
        <p>
          Privacy requests: use in-product export/erasure where available, or
          contact the organization that collected your booking data.
        </p>
      </section>

      <p className="mt-10 text-sm text-muted-foreground">
        <Link href="/terms" className="underline underline-offset-2">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/" className="underline underline-offset-2">
          Home
        </Link>
      </p>
    </main>
  );
}
