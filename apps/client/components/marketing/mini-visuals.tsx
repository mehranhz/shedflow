import { bentoMeta } from "./copy";

export function HoldMini() {
  return (
    <div className="mkt-mini mkt-hold-panel" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing/hold-ring.svg"
        alt=""
        width={72}
        height={72}
        className="mkt-hold-ring"
      />
      <div className="mkt-hold-mini">
        <span>
          <b>Thu 24 · 10:30 am</b>
          <em className="mkt-mono not-italic">open</em>
        </span>
        <span>
          <b>Hold 14:32</b>
          <em className="mkt-mono not-italic">Checkout $120</em>
        </span>
        <span>
          <b>Confirmed</b>
          <em className="mkt-mono not-italic">.ics + Meet</em>
        </span>
      </div>
    </div>
  );
}

export function CreditsMini() {
  return (
    <div className="mkt-mini" aria-hidden="true">
      <p className="text-[0.7rem] text-muted-foreground">4 sessions / period</p>
      <div className="mkt-credits mt-2">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <p className="mt-2 text-[0.7rem] text-muted-foreground">3 remaining</p>
    </div>
  );
}

export function WeekMini() {
  return (
    <div className="mkt-mini" aria-hidden="true">
      <div className="mkt-week">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
          <span key={`${day}-${index}`} />
        ))}
      </div>
    </div>
  );
}

export function UrlMini() {
  return (
    <div className="mkt-mini mkt-url-panel" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marketing/booking-flow.svg"
        alt=""
        width={280}
        height={175}
        className="mkt-flow-art"
      />
      <div className="mkt-urlbar mt-3">
        <span>https://</span>
        <b>schedflow.com/northwind/strategy</b>
      </div>
    </div>
  );
}

export function CodeMini() {
  return (
    <pre className="mkt-mini mkt-code" aria-hidden="true">{`<div
  data-schedflow-inline
  data-org="northwind"
  data-event="strategy">
</div>`}</pre>
  );
}

export function ReceiptMini() {
  return (
    <div className="mkt-receipt-stack">
      <article className="mkt-receipt" aria-hidden="true">
        <header>
          <span>Stripe Checkout</span>
          <span>no PAN</span>
        </header>
        <h3>45-minute strategy</h3>
        <dl>
          <div>
            <dt>Session</dt>
            <dd>$120.00</dd>
          </div>
          <div>
            <dt>Application fee</dt>
            <dd>2%</dd>
          </div>
          <div>
            <dt>Payout</dt>
            <dd>Connect Express</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

export function BentoVisual({
  visual,
}: {
  visual: (typeof bentoMeta)[number]["visual"];
}) {
  switch (visual) {
    case "hold":
      return <HoldMini />;
    case "credits":
      return <CreditsMini />;
    case "week":
      return <WeekMini />;
    case "url":
      return <UrlMini />;
    case "code":
      return <CodeMini />;
    default:
      return null;
  }
}

export function FeatureVisual({
  visual,
}: {
  visual: "week" | "receipt" | "credits" | "url" | "code";
}) {
  switch (visual) {
    case "week":
      return <WeekMini />;
    case "receipt":
      return <ReceiptMini />;
    case "credits":
      return <CreditsMini />;
    case "url":
      return <UrlMini />;
    case "code":
      return <CodeMini />;
    default:
      return null;
  }
}
