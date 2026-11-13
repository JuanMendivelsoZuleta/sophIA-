import { z } from "zod";

/** Versión del protocolo que viaja en el campo `v` del envelope (context.md, sección 9.7). */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/**
 * Crea el esquema de un mensaje: el sobre común `{ v, type, id?, ts, payload }`
 * (context.md, sección 9.2) con un `type` literal y su `payload` específico.
 */
export function envelope<const T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    id: z.string().min(1).optional(),
    ts: z.number().int().nonnegative(),
    payload,
  });
}

/** Payload vacío (`{}`); se ignoran los campos extra para tolerar versiones compatibles. */
export const emptyPayload = z.object({});
