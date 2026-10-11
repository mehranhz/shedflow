/**
 * Wave 13 customer-payments — auth contracts expected from Wave 9 (T-040…T-042).
 *
 * Wave 9 owns:
 * - `Customer.userId` claim/login linking
 * - `POST /v1/customer/auth/*`, `GET /v1/customer/me`
 * - JWT claim `actorType: 'customer'` (optional; we accept any authenticated user
 *   with linked Customer rows so staff dual-persona still works)
 * - Active org header `X-Customer-Org-Id` / cookie `sf_customer_org`
 *
 * This module scopes payments to `Customer` rows where `userId = jwt.sub`.
 * Until Wave 9 lands claim flows, tests link customers via `userId` directly.
 */
export const WAVE9_CUSTOMER_AUTH_CONTRACT = {
  linkedCustomersViaUserId: true,
  activeOrgHeader: 'x-customer-org-id',
} as const;
