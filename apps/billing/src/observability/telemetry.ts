/**
 * Optional OpenTelemetry + Sentry boot hooks.
 * No-op unless OTEL_EXPORTER_OTLP_ENDPOINT / SENTRY_DSN are set.
 */

export async function initTelemetry(serviceName: string): Promise<void> {
  await initSentry(serviceName);
  await initOtel(serviceName);
}

async function initSentry(serviceName: string): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      release: process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
      serverName: serviceName,
      beforeSend(event) {
        const status = event.contexts?.response?.status_code;
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 401) {
          return null;
        }
        return event;
      },
    });
  } catch {
    // Optional dependency not installed or failed — continue without Sentry.
  }
}

async function initOtel(serviceName: string): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return;
  }
  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = await import(
      '@opentelemetry/semantic-conventions'
    );

    const headers: Record<string, string> = {};
    const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim();
    if (rawHeaders) {
      for (const part of rawHeaders.split(',')) {
        const [key, ...rest] = part.split('=');
        if (key && rest.length > 0) {
          headers[key.trim()] = rest.join('=').trim();
        }
      }
    }

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: `shedflow-${serviceName}`,
      }),
      traceExporter: new OTLPTraceExporter({
        url: endpoint.includes('/v1/traces')
          ? endpoint
          : `${endpoint.replace(/\/$/, '')}/v1/traces`,
        headers,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });
    sdk.start();
  } catch {
    // Optional dependency missing — continue without OTel.
  }
}
