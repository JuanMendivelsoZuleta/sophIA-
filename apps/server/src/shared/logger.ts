import { type LevelWithSilent, type Logger, pino } from "pino";

export type { Logger };

export interface LoggerOptions {
  readonly level: LevelWithSilent;
  /** En desarrollo los logs se imprimen legibles con pino-pretty; en producción, JSON. */
  readonly pretty: boolean;
}

export function createLogger({ level, pretty }: LoggerOptions): Logger {
  return pino({
    name: "sophia",
    level,
    ...(pretty
      ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" } } }
      : {}),
  });
}
