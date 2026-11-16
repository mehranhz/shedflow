import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { CUSTOMER_DEMO, requireStack } from "./helpers";

async function openPreferences(page: Page): Promise<void> {
  await page.goto("/portal/login");
  await page.getByLabel(/email/i).fill(CUSTOMER_DEMO.email);
  await page.getByLabel(/^password$/i).fill(CUSTOMER_DEMO.password);
  await page.getByRole("button", { name: /log in|ورود/i }).click();
  await expect(page).toHaveURL(/\/portal\/?$/, { timeout: 45_000 });
  await page.goto("/portal/account/preferences");
  await expect(page.getByRole("heading", { name: /preferences|ترجیحات/i })).toBeVisible({
    timeout: 20_000,
  });
}

async function chooseLanguage(page: Page, name: "English" | "فارسی"): Promise<void> {
  await page.getByRole("combobox", { name: /language|زبان/i }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function chooseTimeZone(page: Page, query: string): Promise<void> {
  await page.getByRole("combobox", { name: /timezone|منطقه زمانی/i }).click();
  await page.getByPlaceholder(/search|جستجو/i).fill(query);
  await page.getByRole("option", { name: new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click();
}

async function setSwitch(page: Page, name: RegExp, on: boolean): Promise<void> {
  const control = page.getByRole("switch", { name });
  const checked = (await control.getAttribute("aria-checked")) === "true";
  if (checked !== on) {
    await control.click();
  }
}

test.describe("portal preferences (T-056)", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(!(await requireStack(request)), "Stack not up");
  });

  test("persists an RTL language and stays axe-clean after the switch", async ({ page }) => {
    await page.context().clearCookies({ name: "NEXT_LOCALE" });
    await openPreferences(page);

    const timezone = page.getByRole("combobox", { name: /timezone|منطقه زمانی/i });
    await expect(timezone).toBeEnabled({ timeout: 20_000 });
    const originalZone = (await timezone.innerText()).replace(/\s+/g, " ").trim();
    const originalCity = originalZone.split(" (")[0] ?? "UTC";

    await chooseTimeZone(page, "Tehran");
    await chooseLanguage(page, "فارسی");
    await setSwitch(page, /reduce motion|کاهش حرکت/i, true);
    await setSwitch(page, /denser text|متن فشرده/i, true);
    await page.getByRole("button", { name: /save preferences|ذخیره ترجیحات/i }).click();

    await expect(page).toHaveURL(/\/portal\/account\/preferences/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "ترجیحات" })).toBeVisible();
    await expect(page.locator(".portal-shell")).toHaveAttribute("data-reduce-motion", "reduce");
    await expect(page.locator(".portal-shell")).toHaveAttribute("data-dense-text", "true");
    await expect(page.locator(".portal-shell")).toHaveAttribute("data-high-contrast", "system");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "ترجیحات" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("combobox", { name: "زبان" })).toContainText("فارسی");
    await expect(page.getByRole("combobox", { name: "منطقه زمانی" })).toContainText(/Tehran/i);
    await expect(page.locator(".portal-shell")).toHaveAttribute("data-reduce-motion", "reduce");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const bad = results.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);

    await chooseLanguage(page, "English");
    await chooseTimeZone(page, originalCity);
    await setSwitch(page, /reduce motion|کاهش حرکت/i, false);
    await setSwitch(page, /denser text|متن فشرده/i, false);
    await page.getByRole("button", { name: /save preferences|ذخیره ترجیحات/i }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /^preferences$/i })).toBeVisible();
  });
});
