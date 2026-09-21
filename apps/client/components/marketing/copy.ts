/**
 * Non-translatable marketing structure (ids, spans, visuals, numeric plan prices).
 * Copy lives in `messages/{locale}.json` under `marketing.*`.
 */

export const personaIds = [
  "coach",
  "clinic",
  "consultant",
  "tutor",
  "salon",
  "trainer",
] as const;

export const statIds = ["hold", "fee", "pci", "start"] as const;

export const bentoMeta = [
  {
    id: "paid",
    span: "mkt-span-4 mkt-lg-7 mkt-tile-wide",
    visual: "hold",
  },
  {
    id: "credits",
    span: "mkt-span-2 mkt-lg-5",
    visual: "credits",
  },
  {
    id: "hours",
    span: "mkt-span-3 mkt-lg-4",
    visual: "week",
  },
  {
    id: "page",
    span: "mkt-span-3 mkt-lg-4",
    visual: "url",
  },
  {
    id: "embed",
    span: "mkt-span-6 mkt-lg-4",
    visual: "code",
  },
] as const;

export const stepIds = ["1", "2", "3", "4", "5"] as const;

export const paymentRowIds = ["1", "2", "3", "4"] as const;

export const featureDeepMeta = [
  { id: "scheduling", visual: "week" },
  { id: "payments", visual: "receipt" },
  { id: "memberships", visual: "credits" },
  { id: "presence", visual: "url" },
  { id: "developers", visual: "code" },
] as const;

export const planPrices = {
  free: { priceDisplay: "$0" },
  pro: { monthly: 29, yearly: 290, yearlyEffectiveMonthly: "24" },
} as const;

export const compareRowMeta = [
  { group: "workspace", row: "eventTypes", free: "three", pro: "unlimited" },
  { group: "workspace", row: "members", free: "one", pro: "unlimited" },
  { group: "workspace", row: "googleCalendar", free: "yes", pro: "yes" },
  { group: "workspace", row: "outlookCalendar", free: "no", pro: "flag" },
  { group: "commerce", row: "freeBookings", free: "yes", pro: "yes" },
  { group: "commerce", row: "paidConnect", free: "no", pro: "yes" },
  { group: "commerce", row: "memberships", free: "no", pro: "yes" },
  { group: "commerce", row: "applicationFee", free: "dash", pro: "fee2" },
  { group: "brand", row: "hostedEmbed", free: "yes", pro: "yes" },
  { group: "brand", row: "hideBadge", free: "no", pro: "yes" },
  { group: "developers", row: "apiWebhooks", free: "no", pro: "yes" },
] as const;

export type CompareGroup = (typeof compareRowMeta)[number]["group"];

export const footerAudienceIds = [
  "coaches",
  "clinics",
  "consultants",
  "tutors",
  "salons",
  "trainers",
] as const;
