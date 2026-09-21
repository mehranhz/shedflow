/**
 * @deprecated Browser public booking uses `/api/bff/public/*`. Prefer `API_URL`
 * on the server. Kept for any remaining direct references / docs.
 */
export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Public site origin for share links (set to LAN URL when testing on devices). */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
