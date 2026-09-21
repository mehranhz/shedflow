import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Params } from 'nestjs-pino';

const REQUEST_ID_HEADER = 'x-request-id';

export function buildPinoParams(service: string): Params {
  const level = process.env.LOG_LEVEL ?? 'info';
  return {
    pinoHttp: {
      level,
      genReqId: (req: IncomingMessage) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        if (typeof incoming === 'string' && incoming.trim().length > 0) {
          return incoming.trim();
        }
        if (Array.isArray(incoming) && incoming[0]) {
          return incoming[0];
        }
        return randomUUID();
      },
      customProps: (req) => ({
        service,
        requestId: (req as { id?: string }).id,
      }),
      serializers: {
        req: (req: {
          method?: string;
          url?: string;
          headers?: Record<string, unknown>;
        }) => ({
          method: req.method,
          url: req.url,
          headers: {
            host: req.headers?.host,
            'user-agent': req.headers?.['user-agent'],
            'x-request-id': req.headers?.[REQUEST_ID_HEADER],
          },
        }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["stripe-signature"]',
          'req.body.password',
          'req.body.refreshToken',
          'req.body.token',
        ],
        remove: true,
      },
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return url.startsWith('/health') || url.startsWith('/metrics');
        },
      },
    },
  };
}
