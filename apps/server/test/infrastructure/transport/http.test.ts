import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHttpServer, type HttpServer } from "../../../src/infrastructure/transport/http.js";
import { createLogger } from "../../../src/shared/logger.js";

describe("servidor HTTP", () => {
  let server: HttpServer;
  let baseUrl: string;
  let clock = 1_000;

  beforeEach(async () => {
    clock = 1_000;
    server = createHttpServer({
      logger: createLogger({ level: "silent", pretty: false }),
      version: "test",
      now: () => clock,
    });
    const port = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET /health responde ok con versión y uptime", async () => {
    clock = 1_500;
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "test", protocolVersion: 1, uptimeMs: 500 });
  });

  it("responde 404 en rutas desconocidas", async () => {
    const res = await fetch(`${baseUrl}/no-existe`);
    expect(res.status).toBe(404);
  });
});
