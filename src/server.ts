/**
 * Node `http` adapter. Everything transport-specific lives here so the app
 * itself stays a pure request/response function.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import type { App } from './app.js';
import { PayloadTooLargeError, toHttpError } from './errors.js';
import { safeStringify } from './logger.js';
import { isHttpMethod, type EdgeRequest, type Logger } from './types.js';

/** Maximum accepted request body size (1 MiB). */
export const MAX_BODY_BYTES = 1024 * 1024;

export interface ServerOptions {
  readonly app: App;
  readonly logger: Logger;
  readonly maxBodyBytes?: number;
}

/** Handle to a listening server. */
export interface RunningServer {
  readonly server: Server;
  readonly port: number;
  readonly host: string;
  close(): Promise<void>;
}

/** Read the request body, enforcing a hard byte ceiling. */
export async function readBody(req: IncomingMessage, limitBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.byteLength;
    if (total > limitBytes) {
      throw new PayloadTooLargeError(limitBytes);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

/** Best-effort client identity for rate limiting. */
export function clientKeyOf(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = first?.split(',')[0]?.trim();
  if (candidate !== undefined && candidate !== '') {
    return candidate;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function flattenHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

/** Translate a Node request into the framework's {@link EdgeRequest}. */
export async function toEdgeRequest(
  req: IncomingMessage,
  maxBodyBytes: number,
  now: () => number = Date.now,
): Promise<EdgeRequest> {
  const headers = flattenHeaders(req);
  const rawMethod = (req.method ?? 'GET').toUpperCase();
  const method = isHttpMethod(rawMethod) ? rawMethod : 'GET';
  const host = headers['host'] ?? 'localhost';
  const url = new URL(req.url ?? '/', `http://${host}`);
  const headerRequestId = headers['x-request-id'];

  return {
    method,
    path: url.pathname,
    url,
    headers,
    query: url.searchParams,
    params: Object.freeze({}),
    body: await readBody(req, maxBodyBytes),
    requestId:
      headerRequestId !== undefined && headerRequestId !== '' ? headerRequestId : randomUUID(),
    clientKey: clientKeyOf(req),
    receivedAt: now(),
  };
}

/** Create (but do not start) an HTTP server bound to the app. */
export function createHttpServer(options: ServerOptions): Server {
  const { app, logger } = options;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      try {
        const edgeRequest = await toEdgeRequest(req, maxBodyBytes);
        const response = await app.handle(edgeRequest);
        const body = edgeRequest.method === 'HEAD' ? '' : response.body;

        res.writeHead(response.status, {
          ...response.headers,
          'content-length': String(Buffer.byteLength(body, 'utf8')),
        });
        res.end(body);
      } catch (cause) {
        const error = toHttpError(cause);
        logger.error('request.failed', { message: error.message, status: error.status });
        if (!res.headersSent) {
          const body = safeStringify({ ...error.toJSON() });
          res.writeHead(error.status, {
            'content-type': 'application/json; charset=utf-8',
            'content-length': String(Buffer.byteLength(body, 'utf8')),
          });
          res.end(body);
        } else {
          res.end();
        }
      }
    })();
  });
}

/** Start listening and resolve once the socket is bound. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const { app, logger } = options;
  const server = createHttpServer(options);
  const { host, port } = app.config;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  const address = server.address() as AddressInfo | null;
  const boundPort = address?.port ?? port;
  logger.info('server.listening', { host, port: boundPort, url: `http://${host}:${boundPort}` });

  return {
    server,
    port: boundPort,
    host,
    close: async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error !== undefined && error !== null ? reject(error) : resolve(),
        );
      });
    },
  };
}
