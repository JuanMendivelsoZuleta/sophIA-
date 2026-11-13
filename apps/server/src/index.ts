/**
 * Composition root del servidor (context.md, sección 10.1).
 * Es el único archivo que conoce las implementaciones concretas: crea los adaptadores
 * de infrastructure y los inyecta a mano en application. No lo importa nadie.
 */
import { loadConfig } from "./config/env.js";
import { createHttpServer } from "./infrastructure/transport/http.js";
import { createLogger } from "./shared/logger.js";

const VERSION = "0.1.0";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.ok) {
    console.error(config.error);
    process.exit(1);
  }

  const logger = createLogger({ level: config.value.logLevel, pretty: config.value.isDev });
  const http = createHttpServer({ logger, version: VERSION });

  const port = await http.listen(config.value.port);
  logger.info({ port, env: config.value.env }, `servidor escuchando en http://localhost:${port}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "apagando servidor");
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
