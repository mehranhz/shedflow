/**
 * Pathnames stay locale-agnostic (no `/en` or `/fa` prefix) so public booking
 * URLs like `/acme/30min` never change. Use `next/link` and `next/navigation`
 * directly; switch locale via the `NEXT_LOCALE` cookie + `router.refresh()`.
 *
 * If you later adopt prefix routing for marketing only, create a parallel
 * `createNavigation` here and keep booking routes outside that tree.
 */

export { localeCookieName, locales, defaultLocale } from "./config";
