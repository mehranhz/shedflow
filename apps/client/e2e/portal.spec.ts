import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import { apiUrl, requireStack } from "./helpers";

const CUSTOMER = {
  email: "customer@shedflow.dev",
  password: "Password123!",
} as const;

async function seedCustomerAvailable(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  try {
    const res = await request.post(`${apiUrl()}/auth/login`, {
      data: { email: CUSTOMER.email, password: CUSTOMER.password },
      timeout: 8_000,
    });
    return res.ok();
  } catch {
    return false;
  }
}

test.describe("portal smoke (T-082)", () => {
  test.beforeEach(async ({ request }, testInfo) => {
    if (process.env.E2E_PORTAL !== "1" && !process.env.CI) {
      // Allow local opt-in; CI may set E2E_PORTAL=1 when seed customer exists.
    }
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("manifest link present on /portal", async ({ page, request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
    await page.goto("/portal");
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute("href", /\/portal\/manifest\.webmanifest/);
  });

  test("offline emulation shows fallback (not blank)", async ({ page, context, request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
    await page.goto("/portal");
    await page.waitForLoadState("domcontentloaded");
    await context.setOffline(true);
    await page.goto("/portal/offline");
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await expect(page.locator("body")).not.toBeEmpty();
    await context.setOffline(false);
  });

  test("happy path gated on seed customer (T-044)", async ({ page, request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
    test.skip(
      !(await seedCustomerAvailable(request)),
      "Seed customer (T-044) missing — skip portal happy path",
    );

    await page.goto("/portal/login");
    await page.getByLabel(/email/i).fill(CUSTOMER.email);
    await page.getByLabel(/^password$/i).fill(CUSTOMER.password);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/portal/, { timeout: 45_000 });
  });
});

test.describe("portal a11y (T-082)", () => {
  for (const path of ["/portal", "/portal/offline", "/portal/privacy"] as const) {
    test(`axe ${path}`, async ({ page, request }) => {
      test.skip(!(await requireStack(request)), "Stack not up");
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
