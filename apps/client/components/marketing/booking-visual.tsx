import { Clock, CreditCard, Video } from "lucide-react";

import { cn } from "@shedflow/ui/lib/utils";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const DAYS: Array<number | null> = [
  null,
  null,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  28,
  29,
  30,
  null,
  null,
  null,
];

const OPEN = new Set([22, 23, 24, 25, 26, 28, 29]);
const SLOTS = ["9:00 am", "10:30 am", "2:00 pm", "3:30 pm"] as const;

function dayClass(day: number | null) {
  if (day === null) {
    return "mkt-day mkt-day-empty";
  }
  if (day === 24) {
    return "mkt-day mkt-day-open mkt-day-live";
  }
  if (day === 21) {
    return "mkt-day mkt-day-today";
  }
  if (OPEN.has(day)) {
    return "mkt-day mkt-day-open";
  }
  if (day < 21) {
    return "mkt-day mkt-day-muted";
  }
  return "mkt-day";
}

export function BookingVisual({ className }: { className?: string }) {
  return (
    <div className={cn("mkt-ledger", className)} aria-hidden="true">
      <div className="mkt-ledger-top">
        <div className="mkt-ledger-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="mkt-ledger-url">schedflow.com/northwind/strategy</p>
      </div>
      <div className="mkt-ledger-body">
        <div className="mkt-ledger-host">
          <span className="mkt-ledger-brand" />
          <p>Maya Chen · Northwind Coaching</p>
          <h3>45-minute strategy</h3>
          <div className="mkt-ledger-meta">
            <span className="mkt-chip">
              <Clock className="size-3" />
              45 min
            </span>
            <span className="mkt-chip">
              <Video className="size-3" />
              Google Meet
            </span>
            <span className="mkt-chip mkt-chip-price">$120</span>
          </div>
        </div>
        <div className="mkt-ledger-pick">
          <div>
            <div className="mkt-cal-head">
              <strong>September 2026</strong>
              <span>America/Los_Angeles</span>
            </div>
            <div className="mkt-cal mt-3">
              {WEEKDAYS.map((label, index) => (
                <span key={`${label}-${index}`} className="mkt-cal-dow">
                  {label}
                </span>
              ))}
              {DAYS.map((day, index) => (
                <span key={index} className={dayClass(day)}>
                  {day ?? ""}
                </span>
              ))}
            </div>
          </div>
          <div className="mkt-slots">
            {SLOTS.map((slot) => (
              <span
                key={slot}
                className={cn("mkt-slot", slot === "10:30 am" && "mkt-slot-live")}
              >
                {slot}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mkt-ledger-hold">
        <span>Hold · 14:32</span>
        <span className="inline-flex items-center gap-1">
          <CreditCard className="size-3" />
          Checkout $120
        </span>
      </div>
      <div className="mkt-ledger-stamp">Booked</div>
    </div>
  );
}
