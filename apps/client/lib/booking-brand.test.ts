import assert from "node:assert/strict";
import test from "node:test";

import { foregroundOn } from "./event-colors.ts";

/** Mirrors `brandStyle` without Next `@/` aliases so node:test can import it. */
function brandStyleForTest(brandColor?: string | null) {
  const DEFAULT_BRAND = "#0069ff";
  const brand =
    brandColor && /^#([0-9a-f]{6})$/i.test(brandColor) ? brandColor : DEFAULT_BRAND;
  const foreground = foregroundOn(brand);
  return {
    "--brand": brand,
    "--brand-foreground": foreground,
    "--primary": brand,
    "--primary-foreground": foreground,
    "--ring": brand,
  };
}

test("brandStyle applies luminance-based foreground for dark brand", () => {
  const style = brandStyleForTest("#0069ff");
  assert.equal(style["--brand"], "#0069ff");
  assert.equal(style["--brand-foreground"], "#ffffff");
  assert.equal(style["--primary"], "#0069ff");
});

test("brandStyle falls back to default brand for invalid colors", () => {
  const style = brandStyleForTest("not-a-color");
  assert.equal(style["--brand"], "#0069ff");
});
