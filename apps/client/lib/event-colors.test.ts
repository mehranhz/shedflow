import assert from "node:assert/strict";
import test from "node:test";

import { foregroundOn, relativeLuminance } from "./event-colors.ts";

test("relativeLuminance matches WCAG mid-gray", () => {
  const L = relativeLuminance("#808080");
  assert.ok(L > 0.2 && L < 0.4);
});

test("foregroundOn picks white on dark brand", () => {
  assert.equal(foregroundOn("#0069ff"), "#ffffff");
});

test("foregroundOn picks dark text on light brand", () => {
  assert.equal(foregroundOn("#facc15"), "#0f172a");
});
