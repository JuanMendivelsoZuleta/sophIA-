import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { PROTOCOL_VERSION } from "@sophia/protocol";
import type { Logger } from "../../shared/logger.js";
import { serveStatic } from "./static-files.js";

export interface HttpServerDeps {
  readonly logger: Logger;
  readonly version: string;
  /** Carpeta con la UI compilada (`apps/face/dist`); si no se indica o no existe, solo hay `/health`. */
  readonly staticDir?: string;
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
 * Servidor HTTP del cerebro: `/health` y el servido estático de la UI.
 * El WebSocket `/ws` se engancha a `raw` desde `ws-server.ts`.
 */
export function createHttpServer({ logger, version, staticDir, now = Date.now }: HttpServerDeps): HttpServer {
  const startedAt = now();

  const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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

    if (staticDir !== undefined && (await serveStatic(staticDir, req, res))) return;

    sendJson(res, 404, { error: "not_found" });
  };

  const raw = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logger.error({ err: error }, "error atendiendo petición HTTP");
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      else res.destroy();
    });
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
