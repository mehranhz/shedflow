import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

const colors = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  button: '#0f766e',
  buttonText: '#ffffff',
  bg: '#f8fafc',
};

export type EmailShellProps = {
  preview: string;
  title: string;
  children: React.ReactNode;
  ctaLabel?: string;
  ctaHref?: string;
  footer?: string;
};

export function EmailShell({
  preview,
  title,
  children,
  ctaLabel,
  ctaHref,
  footer,
}: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, fontFamily: 'Georgia, serif', margin: 0 }}>
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${colors.border}`,
            margin: '32px auto',
            maxWidth: '560px',
            padding: '32px 28px',
          }}
        >
          <Text style={{ color: colors.muted, fontSize: '13px', margin: '0 0 8px' }}>
            SchedFlow
          </Text>
          <Heading
            as="h1"
            style={{
              color: colors.text,
              fontSize: '24px',
              fontWeight: 600,
              lineHeight: '1.3',
              margin: '0 0 16px',
            }}
          >
            {title}
          </Heading>
          <Section>{children}</Section>
          {ctaLabel && ctaHref ? (
            <Section style={{ marginTop: '24px' }}>
              <Button
                href={ctaHref}
                style={{
                  backgroundColor: colors.button,
                  borderRadius: '6px',
                  color: colors.buttonText,
                  display: 'inline-block',
                  fontSize: '14px',
                  fontWeight: 600,
                  padding: '12px 20px',
                  textDecoration: 'none',
                }}
              >
                {ctaLabel}
              </Button>
            </Section>
          ) : null}
          {footer ? (
            <Text
              style={{
                color: colors.muted,
                fontSize: '12px',
                lineHeight: '1.5',
                marginTop: '28px',
              }}
            >
              {footer}
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

export function paragraph(text: string): React.ReactElement {
  return (
    <Text style={{ color: colors.text, fontSize: '15px', lineHeight: '1.6', margin: '0 0 12px' }}>
      {text}
    </Text>
  );
}
