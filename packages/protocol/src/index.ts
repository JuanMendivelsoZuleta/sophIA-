/**
 * Protocolo WebSocket v1 entre el rostro (cliente) y el cerebro (servidor).
 * Los esquemas de los mensajes se agregan en el hito 1.1 (context.md, sección 9).
 */

/** Versión del protocolo que viaja en el campo `v` del envelope. */
export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
