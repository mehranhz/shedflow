import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';

export type VerifyEmailProps = {
  name?: string | null;
  verifyUrl: string;
};

export const verifyEmailSubject = 'Verify your SchedFlow email';

export default function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return (
    <EmailShell
      preview="Confirm your email address"
      title="Verify your email"
      ctaLabel="Verify email"
      ctaHref={verifyUrl}
      footer="If you did not create a SchedFlow account, you can ignore this message."
    >
      {paragraph(greeting)}
      {paragraph('Please confirm your email address to finish setting up your account.')}
    </EmailShell>
  );
}
