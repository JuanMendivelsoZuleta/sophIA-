import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".riv": "application/octet-stream",
  ".onnx": "application/octet-stream",
};

const isFile = async (path: string): Promise<boolean> => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/**
 * Sirve archivos estáticos desde `root` (la UI compilada de `apps/face/dist`).
 * Las rutas sin extensión caen en `index.html`. Devuelve `false` si no encontró nada que servir.
 */
export async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const base = resolve(root);
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  let relative: string;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const target = resolve(join(base, normalize(relative)));
  // Evita salir de la carpeta con `..` o rutas absolutas.
  if (target !== base && !target.startsWith(base + sep)) return false;

  let file: string | undefined;
  if (await isFile(target)) file = target;
  else if (extname(target) === "" && (await isFile(join(base, "index.html")))) file = join(base, "index.html");
  if (file === undefined) return false;

  res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  await new Promise<void>((done, fail) => {
    const stream = createReadStream(file);
    stream.on("error", fail);
    stream.on("end", done);
    stream.pipe(res);
  });
  return true;
}
