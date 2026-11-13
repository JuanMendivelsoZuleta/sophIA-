import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

describe("servido estático de la UI", () => {
  let server: HttpServer;
  let baseUrl: string;
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sophia-face-"));
    await writeFile(join(dir, "index.html"), "<h1>Sofía</h1>");
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets", "app.js"), "console.log(1)");
    server = createHttpServer({
      logger: createLogger({ level: "silent", pretty: false }),
      version: "test",
      staticDir: dir,
    });
    const port = await server.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("sirve index.html en la raíz", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>Sofía</h1>");
  });

  it("sirve archivos con su content-type", async () => {
    const res = await fetch(`${baseUrl}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
  });

  it("responde 404 a un archivo inexistente con extensión", async () => {
    const res = await fetch(`${baseUrl}/assets/nada.js`);
    expect(res.status).toBe(404);
  });

  it("no permite salir de la carpeta", async () => {
    const res = await fetch(`${baseUrl}/..%2F..%2Fpackage.json`);
    expect(res.status).toBe(404);
  });

  it("/health sigue funcionando", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });
});
