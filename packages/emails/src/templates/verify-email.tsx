import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';

export type VerifyEmailProps = {
  name?: string | null;
  verifyUrl: string;
};

export const verifyEmailSubject = 'Verify your SchedFlow phone';

export default function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return (
    <EmailShell
      preview="Confirm your phone number"
      title="Verify your phone"
      ctaLabel="Verify phone"
      ctaHref={verifyUrl}
      footer="If you did not create a SchedFlow account, you can ignore this message."
    >
      {paragraph(greeting)}
      {paragraph('Please confirm your phone number to finish setting up your account.')}
    </EmailShell>
  );
}
