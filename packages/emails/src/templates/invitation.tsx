import * as React from 'react';
import { EmailShell, paragraph } from '../shell.js';

export type InvitationProps = {
  organizationName: string;
  role: string;
  inviteUrl: string;
};

export const invitationSubject = (organizationName: string) =>
  `You're invited to ${organizationName} on SchedFlow`;

export default function Invitation({
  organizationName,
  role,
  inviteUrl,
}: InvitationProps) {
  return (
    <EmailShell
      preview={`Join ${organizationName} on SchedFlow`}
      title="You're invited"
      ctaLabel="Accept invitation"
      ctaHref={inviteUrl}
      footer="This invitation expires. If you were not expecting it, ignore this email."
    >
      {paragraph(
        `You've been invited to join ${organizationName} as ${role.toLowerCase()}.`,
      )}
      {paragraph('Accept the invitation to access the workspace.')}
    </EmailShell>
  );
}
