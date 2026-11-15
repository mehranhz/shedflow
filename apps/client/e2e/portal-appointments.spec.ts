import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CUSTOMER_DEMO, pickFirstAvailableSlot, requireStack } from "./helpers";

async function loginPortal(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(CUSTOMER_DEMO.email);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
}

test.describe("portal appointments (T-049–T-054)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("home shows the seeded next appointment (T-049)", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 851 });
    await loginPortal(page);
    await expect(page.getByRole("heading", { name: /^home$/i })).toBeVisible();
    const next = page.getByText(/intro call/i).first();
    await expect(next).toBeVisible({ timeout: 20_000 });
    await expect(next).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("link", { name: /manage/i })).toBeVisible();
    await expect(page.getByText("Next appointment", { exact: true })).toBeVisible();
    await expect(page.getByText("Actions needed", { exact: true })).toBeVisible();
    await expect(page.getByText("Receipts pending", { exact: true })).toBeVisible();
    await expect(page.getByText("Waitlist", { exact: true })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("outside the notice window explains why cancel is disabled (T-052)", async ({ page }) => {
    await loginPortal(page);
    await page.goto("/portal/appointments/demo-soon-intro");
    await expect(page.getByRole("heading", { name: /intro call/i })).toBeVisible({
      timeout: 20_000,
    });
    const cancel = page.getByRole("button", { name: /^cancel$/i });
    await expect(cancel).toBeDisabled();
    await expect(page.getByText(/outside the cancellation window/i)).toBeVisible();
  });

  test("past list shows a host no-show (T-052)", async ({ page }) => {
    await loginPortal(page);
    await page.goto("/portal/appointments");
    await page.getByRole("tab", { name: /past/i }).click();
    await expect(page.getByText(/NO_SHOW/)).toBeVisible({ timeout: 20_000 });
  });

  test("unknown appointment uid is an empty not-found state (T-050)", async ({ page }) => {
    await loginPortal(page);
    await page.goto("/portal/appointments/does-not-exist-uid");
    await expect(page.getByText(/appointment not found/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/not on your account/i)).toBeVisible();
  });

  test("customer can save a note and an https attachment link (T-054)", async ({ page }) => {
    await loginPortal(page);
    await page.goto("/portal/appointments/demo-soon-intro");
    await expect(page.getByLabel(/your note/i)).toBeEnabled({ timeout: 20_000 });
    const note = `Bring notes ${Date.now()}`;
    await page.getByLabel(/your note/i).fill(note);
    await page.getByRole("button", { name: /save note/i }).click();
    await expect(page.getByLabel(/your note/i)).toHaveValue(note, { timeout: 20_000 });

    await page.getByLabel(/https url/i).fill("https://files.example/intake.pdf");
    await page.getByLabel(/file name/i).fill("intake.pdf");
    await page.getByLabel(/file type/i).fill("application/pdf");
    await page.getByLabel(/size in bytes/i).fill("2048");
    await page.getByRole("button", { name: /add link/i }).click();
    await expect(page.getByRole("link", { name: "intake.pdf" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("cancel an in-policy appointment without a full reload (T-050)", async ({ page }) => {
    await loginPortal(page);
    await page.goto("/portal/appointments/demo-upcoming-intro");
    await expect(page.getByRole("heading", { name: /intro call/i })).toBeVisible({
      timeout: 20_000,
    });
    const cancel = page.getByRole("button", { name: /^cancel$/i });
    if ((await cancel.count()) > 0 && (await cancel.isEnabled())) {
      await cancel.click();
      await page.getByLabel(/reason/i).fill("Plans changed");
      await page.getByRole("button", { name: /confirm cancellation/i }).click();
    }
    await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("link", { name: /appointments/i }).first().click();
    await page.getByRole("tab", { name: /cancelled/i }).click();
    await expect(page.getByText(/CANCELLED/).first()).toBeVisible({ timeout: 20_000 });
  });

  test("logged-in customer books a free intro and sees it on home (T-051)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginPortal(page);
    await page.goto("/portal/book");
    await page.getByRole("link", { name: /intro call/i }).click();
    await expect(page.getByText(/repeats weekly/i)).toHaveCount(0);
    await pickFirstAvailableSlot(page);
    const email = page.getByLabel(/email/i);
    await expect(email).toHaveValue(CUSTOMER_DEMO.email);
    await expect(email).toHaveAttribute("readonly", "");
    await page.getByLabel(/^name/i).fill("Demo Customer");
    await page.locator("#privacy-accepted").check();
    const schedule = page.getByRole("button", { name: /schedule event/i });
    await expect(schedule).toBeEnabled();
    await schedule.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/portal\/appointments\/.+/, { timeout: 45_000 });
    await page.goto("/portal");
    await expect(page.getByText(/intro call/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
