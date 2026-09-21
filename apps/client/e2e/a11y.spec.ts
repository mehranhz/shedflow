import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { DEMO, requireStack } from "./helpers";

test.describe("a11y (axe)", () => {
  test("login page has no critical/serious violations", async ({ page, request }) => {
    test.skip(!(await requireStack(request)), "Stack not up — start pnpm dev + migrate/seed");

    await page.goto("/login");
    await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const bad = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });

  test("public booking page has no critical/serious violations", async ({
    page,
    request,
  }) => {
    test.skip(!(await requireStack(request)), "Stack not up — start pnpm dev + migrate/seed");

    await page.goto(`/${DEMO.orgSlug}/${DEMO.introSlug}`);
    await expect(page.getByText(/intro call/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const bad = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
