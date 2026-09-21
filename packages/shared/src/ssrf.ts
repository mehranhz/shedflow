import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
];

function isPrivateV4(ip: string): boolean {
  if (BLOCKED_V4.some((re) => re.test(ip))) {
    return true;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    return true;
  }
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  return false;
}

function isPrivateV6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized === '::'
  );
}

export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateV4(ip);
  }
  if (version === 6) {
    return isPrivateV6(ip);
  }
  return true;
}

/** Parse-time SSRF checks (no DNS). Rejects non-HTTPS and obvious private hosts. */
export function assertSafeWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid webhook URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS');
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Webhook URL host is not allowed');
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new Error('Webhook URL must not target a private IP');
  }
  return url;
}

/** Send-time: resolve DNS and reject private answers. */
export async function assertSafeWebhookUrlResolved(raw: string): Promise<URL> {
  const url = assertSafeWebhookUrl(raw);
  if (isIP(url.hostname)) {
    return url;
  }
  const records = await lookup(url.hostname, { all: true, verbatim: true });
  if (records.length === 0) {
    throw new Error('Webhook URL host could not be resolved');
  }
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error('Webhook URL resolved to a private IP');
    }
  }
  return url;
}
