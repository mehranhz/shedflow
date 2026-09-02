import "server-only";

/**
 * Base URL of the NestJS API. All calls to it happen server-side (Auth.js
 * `authorize`, route handlers, server components), so this never needs a
 * `NEXT_PUBLIC_` prefix and the browser never talks to the API directly.
 */
export const API_URL = process.env.API_URL ?? "http://localhost:3001";
