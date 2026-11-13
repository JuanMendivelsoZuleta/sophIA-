import { z } from "zod";
import { emptyPayload, envelope } from "./envelope.js";

/** Mensajes cliente (rostro) → servidor (context.md, sección 9.3). */

export const helloMessage = envelope(
  "hello",
  z.object({
    deviceId: z.string().min(1),
    clientVersion: z.string().min(1),
    capabilities: z.object({
      aec: z.boolean(),
      sampleRates: z.array(z.number().int().positive()),
    }),
    screen: z.object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
    }),
  }),
);

export const micStartMessage = envelope("mic.start", emptyPayload);

export const micStopMessage = envelope("mic.stop", z.object({ reason: z.string().optional() }));

export const playbackStartedMessage = envelope("playback.started", z.object({ streamId: z.string().min(1) }));

export const playbackFinishedMessage = envelope("playback.finished", z.object({ streamId: z.string().min(1) }));

export const TOUCH_GESTURES = ["tap", "long_press", "double_tap"] as const;
export type TouchGesture = (typeof TOUCH_GESTURES)[number];

export const touchMessage = envelope("touch", z.object({ gesture: z.enum(TOUCH_GESTURES) }));

export const pongMessage = envelope("pong", z.object({ nonce: z.string().min(1) }));

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type ClientLogLevel = (typeof LOG_LEVELS)[number];

export const logMessage = envelope(
  "log",
  z.object({
    level: z.enum(LOG_LEVELS),
    msg: z.string(),
    data: z.unknown().optional(),
  }),
);

export const clientMessageSchema = z.discriminatedUnion("type", [
  helloMessage,
  micStartMessage,
  micStopMessage,
  playbackStartedMessage,
  playbackFinishedMessage,
  touchMessage,
  pongMessage,
  logMessage,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];
export type HelloMessage = z.infer<typeof helloMessage>;
