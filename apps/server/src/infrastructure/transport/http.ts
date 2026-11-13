import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PROTOCOL_VERSION } from "@sophia/protocol";
import type { Logger } from "../../shared/logger.js";

export interface HttpServerDeps {
  readonly logger: Logger;
  readonly version: string;
  /** Reloj inyectable para los tests. */
  readonly now?: () => number;
}

export interface HttpServer {
  /** Empieza a escuchar; devuelve el puerto real (útil con puerto 0 en tests). */
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
  readonly raw: Server;
}

/**
 * Servidor HTTP del cerebro. En la Fase 0 solo expone `/health`;
 * el servido estático de la UI y el WebSocket `/ws` llegan en el hito 1.1.
 */
export function createHttpServer({ logger, version, now = Date.now }: HttpServerDeps): HttpServer {
  const startedAt = now();

  const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        status: "ok",
        version,
        protocolVersion: PROTOCOL_VERSION,
        uptimeMs: now() - startedAt,
      });
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  };

  const raw = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      logger.error({ err: error }, "error atendiendo petición HTTP");
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    }
  });

  return {
    raw,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        raw.once("error", reject);
        raw.listen(port, host, () => {
          raw.off("error", reject);
          resolve((raw.address() as AddressInfo).port);
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        raw.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
