import { expect, test } from "@playwright/test";

import {
  DEMO,
  cancelManagedBooking,
  completeFreeBooking,
  loginAsDemo,
  requireStack,
} from "./helpers";

test.describe("smoke (seed)", () => {
  test("login → public book free Intro → manage cancel", async ({ page, request }) => {
    test.skip(!(await requireStack(request)), "Stack not up — start pnpm dev + migrate/seed");

    await loginAsDemo(page);
    await expect(page.getByText(/acme/i).first()).toBeVisible();

    await page.goto(`/${DEMO.orgSlug}/${DEMO.introSlug}`);
    await expect(page.getByText(/intro call/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const stamp = Date.now();
    await completeFreeBooking(page, {
      name: `E2E Guest ${stamp}`,
      email: `e2e.guest.${stamp}@example.com`,
    });

    await cancelManagedBooking(page);
  });
});

test.describe("smoke (register)", () => {
  test("register → create event type → public book → cancel", async ({
    page,
    request,
  }) => {
    test.skip(!(await requireStack(request)), "Stack not up — start pnpm dev + migrate/seed");

    const stamp = Date.now();
    const email = `e2e.owner.${stamp}@example.com`;
    const password = "Password123!";
    const orgName = `E2E Org ${stamp}`;
    const eventTitle = `E2E Intro ${stamp}`;

    await page.goto("/register");
    await page.getByLabel(/^name$/i).fill("E2E Owner");
    await page.getByLabel(/workspace/i).fill(orgName);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/^password$/i).fill(password);
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 });

    await page.goto("/dashboard/event-types/new");
    await page.getByLabel(/event name/i).fill(eventTitle);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/event-types/, { timeout: 30_000 });

    // Public path is shown under the title as /{orgSlug}/{eventSlug}
    const pathText = page.locator("p").filter({ hasText: /^\/[^/]+\/.+/ }).first();
    await expect(pathText).toBeVisible({ timeout: 15_000 });
    const path = (await pathText.innerText()).trim();
    await page.goto(path);

    await expect(page.getByText(eventTitle).first()).toBeVisible({ timeout: 30_000 });
    await completeFreeBooking(page, {
      name: `Guest ${stamp}`,
      email: `guest.${stamp}@example.com`,
    });
    await cancelManagedBooking(page);
  });
});
