# Full-scale 06 — Security and compliance

## 1. Identity

- OIDC, passkeys, Google/Microsoft login, MFA (TOTP/WebAuthn) for OWNER.
- Short-lived access tokens (5–10 m), refresh rotation, DPoP optional for API keys.
- JWKS published by Identity; gateway validates.
- SCIM for enterprise orgs.

## 2. Authorization

- ReBAC or RBAC with custom roles (`policies` JSON).
- Postgres **RLS** `SET app.organization_id` **and** service DB roles.
- Step-up auth for refunds, API key create, org delete.

## 3. Platform security

- WAF + bot mgmt + API schema validation at gateway.
- mTLS mesh, NetworkPolicies.
- Secret manager (GCP SM / AWS SM), automatic rotation.
- KMS for token encryption (CMEK).
- Supply chain: SLSA, signed images, Dependabot/OSV, blocked critical CVEs.
- Annual pentest, bug bounty.
- SSRF: allowlist DNS + IMDS hop deny; egress proxy for webhooks.

## 4. Privacy

- GDPR: Temporal workflow `ErasureWorkflow` fans out to every service; tombstones in Kafka; warehouse purge.
- Regional data residency (EU orgs in `eu-west`).
- DSR portal SLA 30 days, internally 7.
- HIPAA: only if a later product; isolated stack + BAA — **not** default.

## 5. Compliance program

SOC 2 Type II, ISO 27001, GDPR, CCPA. PCI SAQ A + Connect platform questionnaires. VPAT for the booking page. Audit logs immutable (WORM bucket).

## 6. Threat detection

SIEM (Chronicle/Splunk), anomaly on API keys, impossible travel on OWNER login, Stripe Radar on connected accounts (theirs).
