/**
 * Composition root del servidor (context.md, sección 10.1).
 * Es el único archivo que conoce las implementaciones concretas: crea los adaptadores
 * de infrastructure y los inyecta a mano en application. No lo importa nadie.
 */
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config/env.js";
import { createHttpServer } from "./infrastructure/transport/http.js";
import { createWsServer, WS_PATH } from "./infrastructure/transport/ws-server.js";
import { createLogger } from "./shared/logger.js";

const VERSION = "0.1.0";
/** UI compilada del rostro; vale igual desde `src/` (dev) que desde `dist/` (build). */
const FACE_DIST = fileURLToPath(new URL("../../face/dist", import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const logger = createLogger({ level: config.value.logLevel, pretty: config.value.isDev });
  const http = createHttpServer({ logger, version: VERSION, staticDir: FACE_DIST });
  // La máquina de estados llega en el hito 1.4; mientras tanto el rostro siempre está en reposo.
  const ws = createWsServer({
    logger,
    httpServer: http.raw,
    serverVersion: VERSION,
    getState: () => "reposo",
    onAudio: (chunk) => logger.trace({ bytes: chunk.length }, "audio recibido (sin procesar hasta el hito 1.3)"),
  });

  const port = await http.listen(config.value.port);
  logger.info({ port, env: config.value.env }, `servidor escuchando en http://localhost:${port}`);
  logger.info(`WebSocket del rostro en ws://localhost:${port}${WS_PATH}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "apagando servidor");
    await ws.close();
    await http.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("Error fatal al arrancar el servidor:", error);
  process.exit(1);
});
