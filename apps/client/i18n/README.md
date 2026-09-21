# Client i18n (next-intl)

## Locale strategy: **cookie + Accept-Language** (no URL prefix)

Public booking paths must stay stable (`/{orgSlug}/{eventSlug}`, `/b/...`, `/embed/...`). Prefixing every route with `/en` or `/fa` would break those product URLs and collide with the `[orgSlug]` segment.

So this app uses next-intl **without i18n routing**:

| Concern | Choice |
| --- | --- |
| URL shape | Unchanged — no `[locale]` segment |
| Preference storage | Cookie `NEXT_LOCALE` |
| First visit | Cookie if set, else `Accept-Language`, else `en` |
| RTL | `dir="rtl"` + `lang="fa"` on `<html>` when locale is `fa` |
| Proxy / middleware | Auth gate only (`proxy.ts`); no locale rewrites |

Marketing, auth, dashboard chrome, and **public booking** (`/[org]`, `/b/...`, `/embed/...`) read the same cookie. Embed mode keeps chrome (and the locale switcher) hidden.

## Layout

```
apps/client/
  i18n/
    config.ts       # locales, defaultLocale, RTL set, cookie name
    request.ts      # getRequestConfig (cookie / Accept-Language)
    navigation.ts   # notes — use next/link (no locale-aware Link)
    README.md       # this file
  messages/
    en.json
    fa.json
  components/i18n/
    locale-switcher.tsx
```

## How to add a language

1. Add `messages/{code}.json` (copy `en.json`, translate).
2. Append `{code}` to `locales` in `i18n/config.ts`.
3. Add a display name in `localeNames`.
4. If the language is RTL, add it to `rtlLocales`.
5. Done — the locale switcher picks it up from the registry.

No route moves, no proxy matcher changes.

## Usage

- Server Components: `const t = await getTranslations('marketing.home')`
- Client Components: `const t = useTranslations('auth.login')`
- Locale typing: `i18n/global.d.ts` augments `AppConfig.Locale`
- Strict message-key typing: optional later via next-intl `createMessagesDeclaration` (catalog is deep + array-heavy)

## Switching locale

`LocaleSwitcher` sets `NEXT_LOCALE` and calls `router.refresh()` so Server Components re-read messages without changing the pathname.
