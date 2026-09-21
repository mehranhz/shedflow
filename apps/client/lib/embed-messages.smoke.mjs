/**
 * Smoke-check embed message helpers (no browser).
 * Run: node apps/client/lib/embed-messages.smoke.mjs
 */
import assert from "node:assert/strict";

// Node has no window — helpers must no-op safely when imported via dynamic eval of logic.
function isEmbeddedFrame(win) {
  if (!win) return false;
  try {
    return win.parent !== win;
  } catch {
    return true;
  }
}

function postToEmbedParent(win, message, targetOrigin = "*") {
  if (!win || !isEmbeddedFrame(win)) return false;
  win.parent.postMessage(message, targetOrigin);
  return true;
}

assert.equal(isEmbeddedFrame(undefined), false);
assert.equal(isEmbeddedFrame({ parent: {} }), true);

const top = { parent: null, postMessage() {} };
top.parent = top;
assert.equal(isEmbeddedFrame(top), false);
assert.equal(postToEmbedParent(top, { type: "schedflow:booked" }), false);

const messages = [];
const parent = {
  postMessage(data, origin) {
    messages.push({ data, origin });
  },
};
const frame = { parent };
assert.equal(
  postToEmbedParent(frame, { type: "schedflow:resize", height: 640 }, "https://host.example"),
  true,
);
assert.equal(
  postToEmbedParent(frame, { type: "schedflow:booked", uid: "abc" }, "https://host.example"),
  true,
);
assert.deepEqual(messages, [
  { data: { type: "schedflow:resize", height: 640 }, origin: "https://host.example" },
  { data: { type: "schedflow:booked", uid: "abc" }, origin: "https://host.example" },
]);

console.log("OK: embed message helpers (frame-only postMessage)");
