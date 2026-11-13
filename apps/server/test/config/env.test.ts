import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/config/env.js";

describe("parseConfig", () => {
  it("aplica valores por defecto con un entorno vacío", () => {
    const result = parseConfig({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      env: "development",
      isDev: true,
      port: 8080,
      logLevel: "info",
      gemini: { apiKey: undefined, liveModel: undefined },
      wakeword: { threshold: 0.5 },
    });
  });

  it("convierte tipos y trata las cadenas vacías como no definidas", () => {
    const result = parseConfig({ PORT: "9090", NODE_ENV: "production", GEMINI_API_KEY: "", WAKEWORD_THRESHOLD: "0.7" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.port).toBe(9090);
    expect(result.value.isDev).toBe(false);
    expect(result.value.gemini.apiKey).toBeUndefined();
    expect(result.value.wakeword.threshold).toBe(0.7);
  });

  it("devuelve un error claro si un valor es inválido", () => {
    const result = parseConfig({ PORT: "no-es-numero", LOG_LEVEL: "verbose" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Configuración inválida");
    expect(result.error).toContain("PORT");
    expect(result.error).toContain("LOG_LEVEL");
  });
});
