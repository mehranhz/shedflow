import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { trackPortalEvent } from "./analytics.ts";

test("trackPortalEvent strips invitee PII keys from payloads", () => {
  const captured: Array<{ event: string; props?: Record<string, unknown> }> = [];
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window: unknown }).window = {
    __schedflowTrack: (event: string, props?: Record<string, unknown>) => {
      captured.push({ event, props });
    },
  };

  trackPortalEvent("portal_cancel", {
    booking_uid: "abc",
    email: "secret@example.com",
    phone: "+15551212",
    inviteeName: "Ada",
    customer_id: "should-drop",
  });

  assert.equal(captured.length, 1);
  assert.equal(captured[0]?.event, "portal_cancel");
  assert.deepEqual(captured[0]?.props, { booking_uid: "abc" });

  (globalThis as { window?: unknown }).window = previous;
});

test("portal message namespaces include shell and nav keys", () => {
  const messagesPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../messages/en.json",
  );
  const en = JSON.parse(readFileSync(messagesPath, "utf8")) as {
    portal?: { shell?: { menu?: string }; nav?: { appointments?: string }; login?: { title?: string } };
  };
  assert.ok(en.portal?.shell?.menu);
  assert.ok(en.portal?.nav?.appointments);
  assert.ok(en.portal?.login?.title);
});
