/**
 * k6 load script — public slots GET (T-037 / mvp/13 §6).
 *
 * Not run in CI. Target staging or local API with seeded data:
 *
 *   k6 run -e BASE_URL=http://localhost:3001 -e ORG=acme -e EVENT=intro tests/load/slots.js
 *
 * Goals (staging, pre-launch): 50 VUs × 5 min, p95 < 600ms with ~1k bookings seeded.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const ORG = __ENV.ORG || "acme";
const EVENT = __ENV.EVENT || "intro";

const slotsDuration = new Trend("slots_duration", true);

export const options = {
  scenarios: {
    slots_read: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 50),
      duration: __ENV.DURATION || "5m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    slots_duration: ["p(95)<600"],
  },
};

function monthWindow() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function () {
  const { start, end } = monthWindow();
  const url =
    `${BASE_URL}/v1/public/orgs/${ORG}/event-types/${EVENT}/slots` +
    `?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}` +
    `&tz=${encodeURIComponent("America/New_York")}`;

  const res = http.get(url, {
    tags: { name: "public_slots" },
    headers: { Accept: "application/json" },
  });

  slotsDuration.add(res.timings.duration);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "body has slots array": (r) => {
      try {
        const body = JSON.parse(String(r.body));
        return Array.isArray(body?.slots) || Array.isArray(body?.data?.slots);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
