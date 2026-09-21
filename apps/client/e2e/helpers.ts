import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const DEMO = {
  email: "owner@shedflow.dev",
  password: "Password123!",
  orgSlug: "acme",
  introSlug: "intro",
} as const;

export const apiUrl = () => process.env.E2E_API_URL ?? "http://localhost:3001";

/** Return true when the API is healthy. When false, suites skip unless E2E_REQUIRE_STACK=1. */
export async function requireStack(request: APIRequestContext): Promise<boolean> {
  if (process.env.E2E_SKIP_STACK === "1") {
    return false;
  }
  try {
    const res = await request.get(`${apiUrl()}/health`, { timeout: 5_000 });
    if (res.ok()) {
      return true;
    }
  } catch {
    // fall through
  }
  if (process.env.E2E_REQUIRE_STACK === "1") {
    throw new Error(
      `API health check failed at ${apiUrl()}/health — start pnpm dev + migrate/seed`,
    );
  }
  return false;
}

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(DEMO.email);
  await page.getByLabel(/^password$/i).fill(DEMO.password);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Pick the first enabled calendar day, then the first slot button. */
export async function pickFirstAvailableSlot(page: Page): Promise<void> {
  // Enabled days are not aria-disabled (react-day-picker / shadcn Calendar).
  const enabledDay = page
    .locator("button[data-day]:not([disabled]):not([aria-disabled='true'])")
    .first();
  await expect(enabledDay).toBeVisible({ timeout: 30_000 });
  await enabledDay.click();

  const slot = page.getByRole("option").first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  // Accessible name must include date + time (T-039).
  const label = await slot.getAttribute("aria-label");
  expect(label && /\d/.test(label)).toBeTruthy();
  await slot.click();
}

export async function completeFreeBooking(
  page: Page,
  invitee: { name: string; email: string },
): Promise<string> {
  await pickFirstAvailableSlot(page);

  await page.getByLabel(/^name/i).fill(invitee.name);
  await page.getByLabel(/^email/i).fill(invitee.email);
  await page.locator("#privacy-accepted").check();
  await page.getByRole("button", { name: /schedule event/i }).click();

  await expect(page).toHaveURL(/\/b\/[^/]+\/manage/, { timeout: 45_000 });
  const match = page.url().match(/\/b\/([^/]+)\/manage/);
  expect(match?.[1]).toBeTruthy();
  return match![1]!;
}

export async function cancelManagedBooking(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^cancel$/i }).click();
  await page.getByRole("button", { name: /cancel meeting/i }).click();
  await expect(page).toHaveURL(/\/b\/[^/]+\/cancel/, { timeout: 30_000 });
}
