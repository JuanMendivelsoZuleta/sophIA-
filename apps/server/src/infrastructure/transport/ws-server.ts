import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  type AnyMessage,
  CLOSE_CODES,
  type ClientMessage,
  clientMessageSchema,
  createMessage,
  decode,
  encode,
  type ServerState,
  type WelcomePayload,
} from "@sophia/protocol";
import { type RawData, WebSocket, WebSocketServer } from "ws";
import type { Logger } from "../../shared/logger.js";

export const WS_PATH = "/ws";

/** Formatos de audio anunciados en el `welcome` (context.md, sección 9.4). */
const AUDIO_FORMATS: Pick<WelcomePayload, "audioIn" | "audioOut"> = {
  audioIn: { format: "pcm_s16le", sampleRate: 16000, channels: 1, frameMs: 80 },
  audioOut: { format: "pcm_s16le", sampleRate: 24000, channels: 1 },
};

/** Tamaño máximo de un frame (1 MiB); un frame de audio de 80 ms a 16 kHz ocupa 2,5 KiB. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

export interface WsServerDeps {
  readonly logger: Logger;
  /** Servidor HTTP al que se engancha el upgrade de `/ws`. */
  readonly httpServer: Server;
  readonly serverVersion: string;
  /** Estado actual del rostro; se envía justo después del `welcome`. */
  readonly getState: () => ServerState;
  /** Frames binarios (audio PCM16 del micrófono) de la sesión activa. Stub hasta el hito 1.3. */
  readonly onAudio?: (chunk: Buffer, sessionId: string) => void;
  /** Mensajes de control válidos de la sesión activa, después del handshake. */
  readonly onMessage?: (msg: ClientMessage, sessionId: string) => void;
  /** Cada cuánto se envía `ping` (por defecto 5 s). */
  readonly pingIntervalMs?: number;
  /** Tiempo sin `pong` tras el cual se cierra la conexión (por defecto 15 s). */
  readonly pongTimeoutMs?: number;
  /** Reloj inyectable para los tests. */
  readonly now?: () => number;
}

export interface WsServer {
  /** Envía un mensaje al rostro activo; devuelve `false` si no hay rostro listo o el mensaje es inválido. */
  send(msg: AnyMessage): boolean;
  /** Cierra la conexión activa y deja de aceptar nuevas. */
  close(): Promise<void>;
}

interface Connection {
  readonly sessionId: string;
  readonly socket: WebSocket;
  readonly log: Logger;
  handshakeDone: boolean;
  lastPongAt: number;
  heartbeat: NodeJS.Timeout | undefined;
}

/**
 * WebSocket del rostro (context.md, secciones 9.1 y 9.6).
 * - Texto = control JSON validado con `@sophia/protocol`; lo inválido se registra y se descarta.
 * - Binario = audio; se entrega a `onAudio` solo tras el handshake.
 * - Un solo rostro activo: una conexión nueva cierra la anterior con 4001.
 */
export function createWsServer({
  logger,
  httpServer,
  serverVersion,
  getState,
  onAudio,
  onMessage,
  pingIntervalMs = 5_000,
  pongTimeoutMs = 15_000,
  now = Date.now,
}: WsServerDeps): WsServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  let active: Connection | undefined;

  const sendTo = (conn: Connection, msg: AnyMessage): boolean => {
    if (conn.socket.readyState !== WebSocket.OPEN) return false;
    const encoded = encode(msg);
    if (!encoded.ok) {
      conn.log.error({ error: encoded.error }, "mensaje saliente inválido; no se envía");
      return false;
    }
    conn.socket.send(encoded.value);
    return true;
  };

  const startHeartbeat = (conn: Connection): void => {
    conn.heartbeat = setInterval(() => {
      if (now() - conn.lastPongAt >= pongTimeoutMs) {
        conn.log.warn({ pongTimeoutMs }, "sin pong dentro del plazo; cerrando conexión");
        conn.socket.close(CLOSE_CODES.HEARTBEAT_TIMEOUT, "heartbeat_timeout");
        return;
      }
      sendTo(conn, createMessage("ping", { nonce: randomUUID() }, { ts: now() }));
    }, pingIntervalMs);
    conn.heartbeat.unref();
  };

  const handleText = (conn: Connection, raw: string): void => {
    const decoded = decode(raw, clientMessageSchema);
    if (!decoded.ok) {
      const { error } = decoded;
      if (error.kind === "unsupported_version" && error.type === "hello") {
        conn.log.warn({ version: error.version }, "hello con versión no soportada; cerrando");
        sendTo(
          conn,
          createMessage(
            "error",
            { code: "unsupported_version", message: error.message, recoverable: false },
            { ts: now() },
          ),
        );
        conn.socket.close(CLOSE_CODES.UNSUPPORTED_VERSION, "unsupported_version");
        return;
      }
      conn.log.warn({ error }, "mensaje inválido descartado");
      return;
    }

    const msg = decoded.value;
    if (msg.type === "pong") conn.lastPongAt = now();

    if (msg.type === "hello") {
      if (conn.handshakeDone) {
        conn.log.warn("hello repetido descartado");
        return;
      }
      conn.handshakeDone = true;
      conn.log.info(
        { deviceId: msg.payload.deviceId, clientVersion: msg.payload.clientVersion },
        "handshake completado",
      );
      sendTo(
        conn,
        createMessage("welcome", { sessionId: conn.sessionId, serverVersion, ...AUDIO_FORMATS }, { ts: now() }),
      );
      sendTo(conn, createMessage("state", { state: getState() }, { ts: now() }));
      return;
    }

    if (!conn.handshakeDone) {
      conn.log.warn({ type: msg.type }, "mensaje antes del hello descartado");
      return;
    }

    if (msg.type === "log") {
      const { level, msg: text, data } = msg.payload;
      conn.log[level]({ origin: "rostro", data }, text);
      return;
    }

    if (msg.type !== "pong") onMessage?.(msg, conn.sessionId);
  };

  const handleConnection = (socket: WebSocket, req: IncomingMessage): void => {
    const sessionId = `s_${randomUUID().slice(0, 8)}`;
    const conn: Connection = {
      sessionId,
      socket,
      log: logger.child({ sessionId }),
      handshakeDone: false,
      lastPongAt: now(),
      heartbeat: undefined,
    };

    if (active !== undefined) {
      active.log.info("otro rostro se conectó; reemplazando esta conexión");
      active.socket.close(CLOSE_CODES.REPLACED, "reemplazado");
    }
    active = conn;
    conn.log.info({ remote: req.socket.remoteAddress }, "rostro conectado");

    socket.on("message", (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        if (!conn.handshakeDone || active !== conn) {
          conn.log.warn("audio recibido fuera de una sesión activa; descartado");
          return;
        }
        onAudio?.(toBuffer(data), sessionId);
        return;
      }
      handleText(conn, toBuffer(data).toString("utf8"));
    });

    socket.on("close", (code: number, reason: Buffer) => {
      clearInterval(conn.heartbeat);
      if (active === conn) active = undefined;
      conn.log.info({ code, reason: reason.toString("utf8") }, "rostro desconectado");
    });

    socket.on("error", (error: Error) => {
      conn.log.warn({ err: error }, "error en el WebSocket");
    });

    startHeartbeat(conn);
  };

  const handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname !== WS_PATH) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  };

  wss.on("connection", handleConnection);
  httpServer.on("upgrade", handleUpgrade);

  return {
    send: (msg) => (active?.handshakeDone ? sendTo(active, msg) : false),
    close: () =>
      new Promise((resolve) => {
        httpServer.off("upgrade", handleUpgrade);
        for (const client of wss.clients) client.close(1001, "servidor apagándose");
        // Si algún cliente no completa el cierre a tiempo, se corta a la fuerza.
        const force = setTimeout(() => {
          for (const client of wss.clients) client.terminate();
        }, 1_000);
        force.unref();
        wss.close(() => {
          clearTimeout(force);
          resolve();
        });
      }),
  };
}

const toBuffer = (data: RawData): Buffer =>
  Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
