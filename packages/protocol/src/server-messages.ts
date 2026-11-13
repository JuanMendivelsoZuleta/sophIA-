import { z } from "zod";
import { envelope } from "./envelope.js";

/** Mensajes servidor (cerebro) → cliente (context.md, sección 9.4). */

export const welcomeMessage = envelope(
  "welcome",
  z.object({
    sessionId: z.string().min(1),
    serverVersion: z.string().min(1),
    audioIn: z.object({
      format: z.literal("pcm_s16le"),
      sampleRate: z.literal(16000),
      channels: z.literal(1),
      frameMs: z.literal(80),
    }),
    audioOut: z.object({
      format: z.literal("pcm_s16le"),
      sampleRate: z.literal(24000),
      channels: z.literal(1),
    }),
  }),
);

/** Estados del rostro (context.md, sección 6). */
export const SERVER_STATES = ["reposo", "escuchando", "pensando", "hablando", "ejecutando_tarea", "error"] as const;
export type ServerState = (typeof SERVER_STATES)[number];

export const stateMessage = envelope(
  "state",
  z.object({
    state: z.enum(SERVER_STATES),
    detail: z.string().optional(),
  }),
);

/** Expresiones conocidas; la lista es abierta, así que el esquema acepta cualquier nombre. */
export const KNOWN_EXPRESSIONS = ["feliz", "confundido", "sorprendido", "guiño"] as const;

export const expressionMessage = envelope(
  "expression",
  z.object({
    name: z.string().min(1),
    durationMs: z.number().int().positive(),
  }),
);

export const playbackStartMessage = envelope("playback.start", z.object({ streamId: z.string().min(1) }));

export const playbackFlushMessage = envelope("playback.flush", z.object({ streamId: z.string().min(1).optional() }));

export const playbackEndMessage = envelope("playback.end", z.object({ streamId: z.string().min(1) }));

export const transcriptMessage = envelope(
  "transcript",
  z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    final: z.boolean(),
  }),
);

export const configMessage = envelope(
  "config",
  z.object({
    volume: z.number().min(0).max(1).optional(),
    eyeTheme: z.string().min(1).optional(),
    showTranscripts: z.boolean().optional(),
  }),
);

export const pingMessage = envelope("ping", z.object({ nonce: z.string().min(1) }));

export const errorMessage = envelope(
  "error",
  z.object({
    code: z.string().min(1),
    message: z.string(),
    recoverable: z.boolean(),
  }),
);

export const serverMessageSchema = z.discriminatedUnion("type", [
  welcomeMessage,
  stateMessage,
  expressionMessage,
  playbackStartMessage,
  playbackFlushMessage,
  playbackEndMessage,
  transcriptMessage,
  configMessage,
  pingMessage,
  errorMessage,
]);

export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type ServerMessageType = ServerMessage["type"];
export type WelcomePayload = z.infer<typeof welcomeMessage>["payload"];
