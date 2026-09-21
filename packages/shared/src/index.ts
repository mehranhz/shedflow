export const SHEDFLOW_VERSION = '0.0.1';

export * from './errors.js';
export * from './events.js';
export * from './money.js';
export * from './time.js';
export * from './page.js';
export * from './flags.js';
export * from './org-settings.js';
export * from './questions.js';
export * from './idempotency.js';
export * from './auth.js';
export * from './api-keys.js';

// Node-only modules (dns/net/crypto) are NOT re-exported here — importing
// `@shedflow/shared` from the Next.js client would pull them into the browser
// bundle and crash. Use subpaths: `@shedflow/shared/ssrf`, `/webhooks`,
// `/envelope`, `/internalAuth`.
