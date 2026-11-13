/**
 * Script de prueba del hito 1.1: se conecta al WebSocket del servidor, envía `hello`
 * y muestra el `welcome` y el `state` recibidos; luego se desconecta.
 *
 * Uso (con `pnpm dev` corriendo en otra terminal):  pnpm ws:probe [url]
 */
import { clientMessageSchema, createMessage, decode, serverMessageSchema } from "@sophia/protocol";
import { WebSocket } from "ws";

const url = process.argv[2] ?? `ws://localhost:${process.env.PORT ?? 8080}/ws`;
const TIMEOUT_MS = 5_000;

const hello = createMessage("hello", {
  deviceId: "ws-probe",
  clientVersion: "0.1.0",
  capabilities: { aec: false, sampleRates: [16000] },
  screen: { w: 1080, h: 1920 },
});
// Comprobación de cordura: el script envía exactamente lo que el protocolo espera.
if (!clientMessageSchema.safeParse(hello).success) throw new Error("hello inválido");

const socket = new WebSocket(url);
const timer = setTimeout(() => {
  console.error(`✗ No llegó welcome + state en ${TIMEOUT_MS} ms`);
  socket.terminate();
  process.exitCode = 1;
}, TIMEOUT_MS);

let welcomed = false;

socket.on("open", () => {
  console.log(`→ conectado a ${url}; enviando hello`);
  socket.send(JSON.stringify(hello));
});

socket.on("message", (data, isBinary) => {
  if (isBinary) return;
  const decoded = decode(data.toString(), serverMessageSchema);
  if (!decoded.ok) {
    console.error("✗ mensaje inválido del servidor:", decoded.error);
    return;
  }
  const msg = decoded.value;
  if (msg.type === "welcome") {
    welcomed = true;
    console.log(`← welcome  sesión=${msg.payload.sessionId} servidor=${msg.payload.serverVersion}`);
  } else if (msg.type === "state") {
    console.log(`← estado: ${msg.payload.state}`);
    if (welcomed) {
      clearTimeout(timer);
      console.log("✓ handshake correcto; cerrando");
      socket.close(1000, "ws-probe terminó");
    }
  }
});

socket.on("error", (error) => {
  clearTimeout(timer);
  console.error(`✗ No se pudo conectar a ${url}: ${error.message}. ¿Está corriendo \`pnpm dev\`?`);
  process.exitCode = 1;
});
