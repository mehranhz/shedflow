import { expect, test, type Page } from "@playwright/test";

import { CUSTOMER_DEMO, requireStack } from "./helpers";

async function openPrivacy(page: Page): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel(/^phone/i).fill(CUSTOMER_DEMO.phone);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
  await page.getByRole("button", { name: /log in|ورود/i }).click();
  await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
  await page.goto("/portal/account/privacy");
  await expect(page.getByRole("heading", { name: /privacy|حریم خصوصی/i })).toBeVisible({
    timeout: 20_000,
  });
}

async function setSwitch(page: Page, name: RegExp, on: boolean): Promise<void> {
  const control = page.getByRole("switch", { name });
  const checked = (await control.getAttribute("aria-checked")) === "true";
  if (checked !== on) {
    await control.click();
  }
}

test.describe("portal privacy consent (T-059)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("records a marketing consent and links policies without removing businesses", async ({ page }) => {
    await openPrivacy(page);

    await expect(page.getByRole("link", { name: /privacy policy|سیاست حریم خصوصی/i })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: /^terms$|^شرایط$/i })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: /export my data|خروجی داده‌های من/i })).toHaveAttribute(
      "href",
      "/portal/privacy",
    );
    await expect(page.getByRole("link", { name: /delete account|حذف حساب/i })).toHaveAttribute(
      "href",
      "/portal/privacy",
    );

    const texts = page.getByRole("switch", { name: /marketing texts|پیامک بازاریابی/i });
    await expect(texts).toBeEnabled({ timeout: 20_000 });
    const wasOn = (await texts.getAttribute("aria-checked")) === "true";

    await setSwitch(page, /marketing texts|پیامک بازاریابی/i, !wasOn);
    await page.getByRole("button", { name: /save privacy choices|ذخیره انتخاب‌های حریم خصوصی/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved|ذخیره شد/i);

    await page.reload();
    await expect(page.getByRole("switch", { name: /marketing texts|پیامک بازاریابی/i })).toHaveAttribute(
      "aria-checked",
      wasOn ? "false" : "true",
    );
    await expect(page.getByText(/recorded|ثبت در/i).first()).toBeVisible();

    await setSwitch(page, /marketing texts|پیامک بازاریابی/i, wasOn);
    await page.getByRole("button", { name: /save privacy choices|ذخیره انتخاب‌های حریم خصوصی/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved|ذخیره شد/i);
  });
});
