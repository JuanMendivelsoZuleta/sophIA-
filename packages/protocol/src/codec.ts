import { z } from "zod";
import { type ClientMessage, clientMessageSchema } from "./client-messages.js";
import { PROTOCOL_VERSION } from "./envelope.js";
import { err, ok, type Result } from "./result.js";
import { type ServerMessage, serverMessageSchema } from "./server-messages.js";

/** Cualquier mensaje del protocolo, en cualquier dirección (los `type` no se repiten). */
export type AnyMessage = ClientMessage | ServerMessage;
export type AnyMessageType = AnyMessage["type"];
export type MessageOf<T extends AnyMessageType> = Extract<AnyMessage, { type: T }>;

const anyMessageSchema = z.union([clientMessageSchema, serverMessageSchema]);

export type ProtocolErrorKind = "invalid_json" | "unsupported_version" | "invalid_message";

export interface ProtocolError {
  readonly kind: ProtocolErrorKind;
  readonly message: string;
  /** `type` del mensaje si se pudo leer (útil para los logs y para detectar un `hello`). */
  readonly type?: string;
  /** Versión recibida cuando `kind` es `unsupported_version`. */
  readonly version?: unknown;
}

const describeIssues = (error: z.ZodError): string =>
  error.issues.map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`).join("; ");

/**
 * Valida y serializa un mensaje a JSON. Nunca lanza: un mensaje inválido
 * (por ejemplo, construido a mano con un payload incorrecto) devuelve un error.
 */
export function encode(msg: AnyMessage): Result<string, ProtocolError> {
  const parsed = anyMessageSchema.safeParse(msg);
  if (!parsed.success) {
    return err({ kind: "invalid_message", message: describeIssues(parsed.error), type: msg.type });
  }
  return ok(JSON.stringify(parsed.data));
}

/**
 * Parsea un frame de texto y lo valida contra `schema`. Nunca lanza.
 * Distingue JSON roto, versión no soportada y mensaje inválido para que el
 * transporte decida qué hacer (registrar y descartar, o cerrar ante un `hello` de otra versión).
 */
export function decode<S extends z.ZodType>(raw: string, schema: S): Result<z.infer<S>, ProtocolError> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return err({ kind: "invalid_json", message: (error as Error).message });
  }

  const header = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : undefined;
  const type = typeof header?.type === "string" ? header.type : undefined;
  const typeField = type === undefined ? {} : { type };

  if (header !== undefined && "v" in header && header.v !== PROTOCOL_VERSION) {
    return err({
      kind: "unsupported_version",
      message: `versión de protocolo no soportada: ${JSON.stringify(header.v)} (se espera ${PROTOCOL_VERSION})`,
      version: header.v,
      ...typeField,
    });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return err({ kind: "invalid_message", message: describeIssues(parsed.error), ...typeField });
  }
  return ok(parsed.data);
}

/**
 * Construye un mensaje con el sobre completo (`v` y `ts` incluidos).
 * No valida: para eso está `encode`, que se llama al enviarlo.
 */
export function createMessage<T extends AnyMessageType>(
  type: T,
  payload: MessageOf<T>["payload"],
  options: { readonly id?: string; readonly ts?: number } = {},
): MessageOf<T> {
  return {
    v: PROTOCOL_VERSION,
    type,
    ...(options.id === undefined ? {} : { id: options.id }),
    ts: options.ts ?? Date.now(),
    payload,
  } as MessageOf<T>;
}

/** Códigos de cierre propios del WebSocket (rango 4000–4999 reservado a la aplicación). */
export const CLOSE_CODES = {
  /** Se conectó otro rostro y reemplazó a este (context.md, sección 9.6). */
  REPLACED: 4001,
  /** El `hello` llegó con una versión de protocolo no soportada (sección 9.7). */
  UNSUPPORTED_VERSION: 4002,
  /** No llegó `pong` dentro del plazo del heartbeat (sección 9.6). */
  HEARTBEAT_TIMEOUT: 4003,
} as const;
