import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';

export type ResetPasswordProps = {
  name?: string | null;
  resetUrl: string;
};

export const resetPasswordSubject = 'Reset your SchedFlow password';

export default function ResetPassword({ name, resetUrl }: ResetPasswordProps) {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,';
  return (
    <EmailShell
      preview="Reset your password"
      title="Reset your password"
      ctaLabel="Reset password"
      ctaHref={resetUrl}
      footer="If you did not request a password reset, you can ignore this message."
    >
      {paragraph(greeting)}
      {paragraph('Click the button below to choose a new password. This link expires soon.')}
    </EmailShell>
  );
}
