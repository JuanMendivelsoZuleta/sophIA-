import { describe, expect, it } from "vitest";
import {
  type AnyMessage,
  CLOSE_CODES,
  clientMessageSchema,
  createMessage,
  decode,
  encode,
  PROTOCOL_VERSION,
  serverMessageSchema,
} from "../src/index.js";

const TS = 1_763_050_000_000;

const validClientMessages: AnyMessage[] = [
  createMessage(
    "hello",
    {
      deviceId: "rostro-01",
      clientVersion: "0.1.0",
      capabilities: { aec: true, sampleRates: [48000] },
      screen: { w: 1080, h: 1920 },
    },
    { ts: TS },
  ),
  createMessage("mic.start", {}, { ts: TS }),
  createMessage("mic.stop", { reason: "permiso revocado" }, { ts: TS }),
  createMessage("mic.stop", {}, { ts: TS }),
  createMessage("playback.started", { streamId: "r_1" }, { ts: TS }),
  createMessage("playback.finished", { streamId: "r_1" }, { ts: TS }),
  createMessage("touch", { gesture: "long_press" }, { ts: TS }),
  createMessage("pong", { nonce: "n1" }, { ts: TS, id: "m_1" }),
  createMessage("log", { level: "warn", msg: "hola", data: { a: 1 } }, { ts: TS }),
];

const validServerMessages: AnyMessage[] = [
  createMessage(
    "welcome",
    {
      sessionId: "s_7f3a",
      serverVersion: "0.1.0",
      audioIn: { format: "pcm_s16le", sampleRate: 16000, channels: 1, frameMs: 80 },
      audioOut: { format: "pcm_s16le", sampleRate: 24000, channels: 1 },
    },
    { ts: TS },
  ),
  createMessage("state", { state: "ejecutando_tarea", detail: "Revisando git" }, { ts: TS }),
  createMessage("expression", { name: "guiño", durationMs: 800 }, { ts: TS }),
  createMessage("playback.start", { streamId: "r_12" }, { ts: TS }),
  createMessage("playback.flush", { streamId: "r_12" }, { ts: TS }),
  createMessage("playback.flush", {}, { ts: TS }),
  createMessage("playback.end", { streamId: "r_12" }, { ts: TS }),
  createMessage("transcript", { role: "assistant", text: "Hola", final: true }, { ts: TS }),
  createMessage("config", { volume: 0.5, showTranscripts: false }, { ts: TS }),
  createMessage("ping", { nonce: "n1" }, { ts: TS }),
  createMessage("error", { code: "boom", message: "algo falló", recoverable: true }, { ts: TS }),
];

describe("mensajes válidos", () => {
  it.each(validClientMessages.map((m) => [m.type, m] as const))("cliente → servidor: %s", (_type, msg) => {
    expect(clientMessageSchema.safeParse(msg).success).toBe(true);
    expect(serverMessageSchema.safeParse(msg).success).toBe(false);
  });

  it.each(validServerMessages.map((m) => [m.type, m] as const))("servidor → cliente: %s", (_type, msg) => {
    expect(serverMessageSchema.safeParse(msg).success).toBe(true);
    expect(clientMessageSchema.safeParse(msg).success).toBe(false);
  });
});

describe("ida y vuelta", () => {
  it.each([...validClientMessages, ...validServerMessages].map((m) => [m.type, m] as const))(
    "%s: encode → decode conserva el mensaje",
    (_type, msg) => {
      const encoded = encode(msg);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) return;
      const schema = clientMessageSchema.safeParse(msg).success ? clientMessageSchema : serverMessageSchema;
      const decoded = decode(encoded.value, schema);
      expect(decoded).toEqual({ ok: true, value: msg });
    },
  );
});

describe("decode", () => {
  it("rechaza JSON roto sin lanzar", () => {
    const result = decode("{no es json", clientMessageSchema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_json");
  });

  it.each([
    ["un número", "42"],
    ["null", "null"],
    ["un type desconocido", JSON.stringify({ v: 1, type: "nope", ts: TS, payload: {} })],
    ["sin ts", JSON.stringify({ v: 1, type: "mic.start", payload: {} })],
    ["sin payload", JSON.stringify({ v: 1, type: "mic.start", ts: TS })],
    ["un gesto inválido", JSON.stringify({ v: 1, type: "touch", ts: TS, payload: { gesture: "swipe" } })],
    ["un hello incompleto", JSON.stringify({ v: 1, type: "hello", ts: TS, payload: { deviceId: "x" } })],
    ["un mensaje del servidor", JSON.stringify({ v: 1, type: "ping", ts: TS, payload: { nonce: "n" } })],
  ])("rechaza %s como invalid_message", (_name, raw) => {
    const result = decode(raw, clientMessageSchema);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("invalid_message");
  });

  it("detecta una versión no soportada e informa el type", () => {
    const raw = JSON.stringify({ v: 2, type: "hello", ts: TS, payload: {} });
    const result = decode(raw, clientMessageSchema);
    expect(result).toMatchObject({ ok: false, error: { kind: "unsupported_version", version: 2, type: "hello" } });
  });

  it("ignora campos extra (cambios compatibles no suben la versión)", () => {
    const raw = JSON.stringify({ v: 1, type: "mic.start", ts: TS, payload: { nuevo: true }, extra: 1 });
    const result = decode(raw, clientMessageSchema);
    expect(result).toEqual({ ok: true, value: { v: 1, type: "mic.start", ts: TS, payload: {} } });
  });
});

describe("encode", () => {
  it("rechaza un mensaje con payload inválido sin lanzar", () => {
    const bad = createMessage("state", { state: "bailando" as never }, { ts: TS });
    const result = encode(bad);
    expect(result).toMatchObject({ ok: false, error: { kind: "invalid_message", type: "state" } });
  });
});

describe("constantes", () => {
  it("expone la versión 1 y los códigos de cierre", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(CLOSE_CODES.REPLACED).toBe(4001);
  });

  it("createMessage completa v y ts", () => {
    const before = Date.now();
    const msg = createMessage("mic.start", {});
    expect(msg.v).toBe(1);
    expect(msg.ts).toBeGreaterThanOrEqual(before);
  });
});
