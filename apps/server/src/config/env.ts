import { z } from "zod";
import { err, ok, type Result } from "../shared/result.js";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** Convierte cadenas vacías del .env en `undefined` para que cuenten como "no definido". */
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

/**
 * Variables de entorno del servidor.
 * GEMINI_API_KEY y GEMINI_LIVE_MODEL serán obligatorias a partir del hito 1.4 (Gemini Live).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  GEMINI_API_KEY: optionalString,
  GEMINI_LIVE_MODEL: optionalString,
  WAKEWORD_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  readonly env: Env["NODE_ENV"];
  readonly isDev: boolean;
  readonly port: number;
  readonly logLevel: Env["LOG_LEVEL"];
  readonly gemini: { readonly apiKey: string | undefined; readonly liveModel: string | undefined };
  readonly wakeword: { readonly threshold: number };
}

/** Valida un conjunto de variables (por defecto `process.env`) sin lanzar excepciones. */
export function parseConfig(source: Record<string, string | undefined>): Result<AppConfig, string> {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
      .join("\n");
    return err(`Configuración inválida. Revisa tu archivo .env (ver .env.example):\n${details}`);
  }

  const e = parsed.data;
  return ok({
    env: e.NODE_ENV,
    isDev: e.NODE_ENV === "development",
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    gemini: { apiKey: e.GEMINI_API_KEY, liveModel: e.GEMINI_LIVE_MODEL },
    wakeword: { threshold: e.WAKEWORD_THRESHOLD },
  });
}

/**
 * Carga `.env` (si existe) en `process.env` y valida la configuración.
 * Las variables ya definidas en el entorno tienen prioridad sobre el archivo.
 */
export function loadConfig(envFile = ".env"): Result<AppConfig, string> {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return err(`No se pudo leer ${envFile}: ${(error as Error).message}`);
    }
  }
  return parseConfig(process.env);
}
