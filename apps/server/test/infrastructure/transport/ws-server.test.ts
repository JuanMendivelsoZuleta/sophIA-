import { Writable } from "node:stream";
import { type ClientMessage, createMessage, type ServerMessage } from "@sophia/protocol";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createHttpServer, type HttpServer } from "../../../src/infrastructure/transport/http.js";
import { createWsServer, type WsServer, type WsServerDeps } from "../../../src/infrastructure/transport/ws-server.js";

const hello = (v = 1) => ({
  ...createMessage("hello", {
    deviceId: "rostro-test",
    clientVersion: "0.0.0",
    capabilities: { aec: true, sampleRates: [48000] },
    screen: { w: 1080, h: 1920 },
  }),
  v,
});

/** Cliente de prueba que acumula los mensajes recibidos y permite esperarlos. */
class TestClient {
  readonly messages: ServerMessage[] = [];
  readonly socket: WebSocket;
  readonly closed: Promise<{ code: number; reason: string }>;
  private waiters: Array<() => void> = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on("message", (data, isBinary) => {
      if (!isBinary) this.messages.push(JSON.parse(data.toString()) as ServerMessage);
      for (const wake of this.waiters) wake();
    });
    this.closed = new Promise((resolve) => {
      this.socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  send(msg: unknown): void {
    this.socket.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  /** Espera hasta tener `count` mensajes del tipo dado. */
  async waitFor<T extends ServerMessage["type"]>(type: T, count = 1): Promise<Extract<ServerMessage, { type: T }>[]> {
    const matching = () => this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
    while (matching().length < count) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return matching();
  }
}

interface Harness {
  readonly url: string;
  readonly ws: WsServer;
  readonly logs: Array<{ msg: string; [key: string]: unknown }>;
  readonly audio: Buffer[];
  readonly received: ClientMessage[];
  connect(path?: string): Promise<TestClient>;
}

let http: HttpServer | undefined;
let ws: WsServer | undefined;
const clients: TestClient[] = [];

async function start(overrides: Partial<WsServerDeps> = {}): Promise<Harness> {
  const logs: Harness["logs"] = [];
  const sink = new Writable({
    write(chunk, _enc, done) {
      logs.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  const logger = pino({ level: "debug" }, sink);
  const audio: Buffer[] = [];
  const received: ClientMessage[] = [];

  http = createHttpServer({ logger, version: "test" });
  ws = createWsServer({
    logger,
    httpServer: http.raw,
    serverVersion: "9.9.9",
    getState: () => "reposo",
    onAudio: (chunk) => audio.push(chunk),
    onMessage: (msg) => received.push(msg),
    ...overrides,
  });
  const port = await http.listen(0, "127.0.0.1");
  const url = `ws://127.0.0.1:${port}`;

  return {
    url,
    ws,
    logs,
    audio,
    received,
    connect: async (path = "/ws") => {
      const client = new TestClient(`${url}${path}`);
      clients.push(client);
      await client.opened();
      return client;
    },
  };
}

const waitUntil = async (condition: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("tiempo de espera agotado");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

afterEach(async () => {
  for (const client of clients.splice(0)) client.socket.terminate();
  await ws?.close();
  await http?.close();
  ws = undefined;
  http = undefined;
});

describe("ws-server", () => {
  it("handshake: hello → welcome → state actual", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(hello());

    const [state] = await client.waitFor("state");
    const [welcome] = client.messages;
    expect(welcome).toMatchObject({
      v: 1,
      type: "welcome",
      payload: {
        serverVersion: "9.9.9",
        audioIn: { format: "pcm_s16le", sampleRate: 16000, channels: 1, frameMs: 80 },
        audioOut: { format: "pcm_s16le", sampleRate: 24000, channels: 1 },
      },
    });
    expect(welcome?.type === "welcome" && welcome.payload.sessionId).toMatch(/^s_/);
    expect(state?.payload).toEqual({ state: "reposo" });
    expect(client.messages.map((m) => m.type)).toEqual(["welcome", "state"]);
  });

  it("hello con versión no soportada: responde error y cierra con 4002", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(hello(2));

    const [error] = await client.waitFor("error");
    expect(error?.payload).toMatchObject({ code: "unsupported_version", recoverable: false });
    expect((await client.closed).code).toBe(4002);
  });

  it("descarta mensajes inválidos sin cerrar la conexión", async () => {
    const h = await start();
    const client = await h.connect();
    client.send("{esto no es json");
    client.send({ v: 1, type: "touch", ts: 1, payload: { gesture: "swipe" } });
    client.send({ v: 1, type: "inventado", ts: 1, payload: {} });
    client.send(hello());

    await client.waitFor("state");
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    expect(h.logs.filter((l) => l.msg === "mensaje inválido descartado")).toHaveLength(3);
  });

  it("ignora mensajes de control y audio antes del hello", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(createMessage("touch", { gesture: "tap" }));
    client.socket.send(Buffer.from([1, 2, 3]));
    client.send(hello());
    await client.waitFor("state");

    expect(h.received).toEqual([]);
    expect(h.audio).toEqual([]);
  });

  it("entrega audio binario y mensajes válidos tras el handshake", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(hello());
    await client.waitFor("state");

    client.send(createMessage("mic.start", {}));
    client.socket.send(Buffer.from([1, 2, 3, 4]));
    await waitUntil(() => h.audio.length === 1 && h.received.length === 1);

    expect(h.received[0]?.type).toBe("mic.start");
    expect([...(h.audio[0] ?? [])]).toEqual([1, 2, 3, 4]);
  });

  it("heartbeat: envía ping y mantiene viva la conexión mientras llega pong", async () => {
    const h = await start({ pingIntervalMs: 20, pongTimeoutMs: 80 });
    const client = await h.connect();
    client.socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(data.toString()) as ServerMessage;
      if (msg.type === "ping") client.send(createMessage("pong", { nonce: msg.payload.nonce }));
    });
    client.send(hello());

    await client.waitFor("ping", 8);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it("heartbeat: cierra con 4003 si no llega pong a tiempo", async () => {
    const h = await start({ pingIntervalMs: 20, pongTimeoutMs: 80 });
    const client = await h.connect();
    client.send(hello());

    await client.waitFor("ping");
    expect((await client.closed).code).toBe(4003);
  });

  it("un solo rostro: un cliente nuevo cierra al anterior con 4001", async () => {
    const h = await start();
    const first = await h.connect();
    first.send(hello());
    await first.waitFor("state");

    const second = await h.connect();
    expect(await first.closed).toEqual({ code: 4001, reason: "reemplazado" });

    second.send(hello());
    await second.waitFor("state");
    expect(h.ws.send(createMessage("state", { state: "pensando" }))).toBe(true);
    const states = await second.waitFor("state", 2);
    expect(states[1]?.payload.state).toBe("pensando");
  });

  it("registra la conexión y la desconexión", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(hello());
    await client.waitFor("state");
    client.socket.close(1000, "adiós");

    await waitUntil(() => h.logs.some((l) => l.msg === "rostro desconectado"));
    const sessionLogs = h.logs.filter((l) => typeof l.sessionId === "string");
    expect(sessionLogs.map((l) => l.msg)).toEqual(
      expect.arrayContaining(["rostro conectado", "handshake completado", "rostro desconectado"]),
    );
    expect(h.logs.find((l) => l.msg === "rostro desconectado")).toMatchObject({ code: 1000, reason: "adiós" });
    expect(h.ws.send(createMessage("state", { state: "reposo" }))).toBe(false);
  });

  it("reenvía al logger los mensajes log del rostro", async () => {
    const h = await start();
    const client = await h.connect();
    client.send(hello());
    await client.waitFor("state");
    client.send(createMessage("log", { level: "warn", msg: "batería baja", data: { pct: 5 } }));

    await waitUntil(() => h.logs.some((l) => l.msg === "batería baja"));
    expect(h.logs.find((l) => l.msg === "batería baja")).toMatchObject({ origin: "rostro", data: { pct: 5 } });
  });

  it("rechaza el upgrade en rutas distintas de /ws", async () => {
    const h = await start();
    await expect(h.connect("/otra")).rejects.toThrow(/404/);
  });
});
