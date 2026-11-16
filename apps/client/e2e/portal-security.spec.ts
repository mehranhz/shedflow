import { expect, test, type Page } from "@playwright/test";

import { CUSTOMER_DEMO, requireStack } from "./helpers";

async function openSecurity(page: Page): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel(/^phone/i).fill(CUSTOMER_DEMO.phone);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
  await page.getByRole("button", { name: /log in|ورود/i }).click();
  await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
  await page.goto("/portal/account/security");
  await expect(page.getByRole("heading", { name: /security|امنیت/i })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("portal security settings (T-058)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("shows password, sessions, and linked-account placeholders", async ({ page }) => {
    await openSecurity(page);

    await expect(page.getByLabel(/current password|رمز فعلی/i)).toBeVisible();
    await expect(page.getByLabel(/new password|رمز جدید/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /sessions|نشست/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /google|گوگل/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /apple|اپل/i })).toBeDisabled();
    await expect(page.getByText(/passkeys|کلیدهای عبور/i)).toBeVisible();
  });
});
