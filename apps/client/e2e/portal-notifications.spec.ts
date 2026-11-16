import { expect, test, type Page } from "@playwright/test";

import { CUSTOMER_DEMO, requireStack } from "./helpers";

async function openNotifications(page: Page): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(CUSTOMER_DEMO.email);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
  await page.getByRole("button", { name: /log in|ورود/i }).click();
  await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
  await page.goto("/portal/account/notifications");
  await expect(page.getByRole("heading", { name: /notifications|اعلان/i })).toBeVisible({
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

test.describe("portal notification preferences (T-057)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("keeps security mail required and persists a reminder opt-out", async ({ page }) => {
    await openNotifications(page);

    await expect(page.getByText(/required for account security|برای امنیت حساب لازم است/i)).toBeVisible();
    await expect(page.getByRole("switch", { name: /account security emails|ایمیل‌های امنیت حساب/i })).toBeDisabled();
    await expect(page.getByRole("switch", { name: /booking confirmations|تأیید نوبت/i })).toBeDisabled();
    await expect(page.getByRole("switch", { name: /^sms$|پیامک/i })).toBeDisabled();

    const reminders = page.getByRole("switch", { name: /booking reminders|یادآوری نوبت/i });
    await expect(reminders).toBeEnabled({ timeout: 20_000 });
    const marketing = page.getByRole("switch", { name: /marketing|بازاریابی/i });
    await setSwitch(page, /marketing|بازاریابی/i, false);

    await setSwitch(page, /booking reminders|یادآوری نوبت/i, false);
    await page.getByRole("button", { name: /save notifications|ذخیره اعلان/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved|ذخیره شد/i);

    await page.reload();
    await expect(page.getByRole("switch", { name: /booking reminders|یادآوری نوبت/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(marketing).toHaveAttribute("aria-checked", "false");

    await setSwitch(page, /booking reminders|یادآوری نوبت/i, true);
    await page.getByRole("button", { name: /save notifications|ذخیره اعلان/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved|ذخیره شد/i);
  });
});
