import { expect, test } from "@playwright/test";

import { CUSTOMER_DEMO, requireStack } from "./helpers";

test.describe("portal profile (T-055)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("rejects an invalid phone, then saves the profile name", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(CUSTOMER_DEMO.email);
    await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
    await page.goto("/portal/account/profile");
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();

    const name = page.getByLabel("Name", { exact: true });
    await expect(name).toBeEnabled({ timeout: 20_000 });
    const original = await name.inputValue();
    expect(original.length).toBeGreaterThan(0);

    const phone = page.getByLabel("Phone", { exact: true });
    const originalPhone = await phone.inputValue();
    await phone.fill("12345");
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByText(/invalid phone/i)).toBeVisible();
    await expect(name).toHaveValue(original);

    await phone.fill(originalPhone);
    const next = `Profile ${Date.now()}`;
    await name.fill(next);
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /profile saved/i })).toBeVisible({
      timeout: 20_000,
    });

    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(next, { timeout: 20_000 });

    await page.getByLabel("Name", { exact: true }).fill(original);
    await page.getByRole("button", { name: /save profile/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /profile saved/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
