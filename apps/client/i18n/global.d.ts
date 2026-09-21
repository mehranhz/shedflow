import type { AppLocale } from "./config";

/**
 * Locale is typed; full Messages augmentation is omitted for now because the
 * marketing catalog nests deeply (and includes arrays). Keys still work at
 * runtime. To enable strict key checking later, use next-intl’s
 * `createMessagesDeclaration` (see https://next-intl.dev/docs/workflows/typescript).
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
  }
}
