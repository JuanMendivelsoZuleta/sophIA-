# sophIA

**Sofía** es un asistente de escritorio con presencia física y costo de software $0:

- un **celular Android viejo** es el **rostro** (ojos animados, micrófono y altavoz);
- el **PC** es el **cerebro** (wake word local, conversación por voz con Gemini Live, tareas en la terminal, memoria y Google).

Documentación:

- [`docs/context.md`](docs/context.md): visión, arquitectura, protocolo y decisiones (fuente de verdad).
- [`docs/plan-backend.md`](docs/plan-backend.md): roadmap por fases e hitos.

## Requisitos

| Herramienta                  | Versión       | Para qué                                                       |
| ---------------------------- | ------------- | -------------------------------------------------------------- |
| Node.js                      | 22 o superior | Servidor y tooling                                             |
| pnpm                         | 10            | Monorepo (`corepack enable` lo instala según `packageManager`) |
| Python                       | 3.11          | Sidecar de wake word (desde el hito 1.5)                       |
| adb (Android Platform Tools) | reciente      | Conexión USB con el celular (Fase 2)                           |

## Cómo arrancar

```bash
pnpm install          # instala dependencias y los hooks de git (lefthook)
cp .env.example .env  # opcional en la Fase 0; GEMINI_API_KEY será obligatoria desde el hito 1.4
pnpm dev              # servidor en modo watch
```

Comprobar que está vivo: <http://localhost:8080/health>. Con el servidor corriendo, `pnpm ws:probe` se conecta a `ws://localhost:8080/ws`, hace el handshake y muestra el estado del rostro.

## Scripts

| Script           | Qué hace                                                        |
| ---------------- | --------------------------------------------------------------- |
| `pnpm dev`       | Servidor con recarga automática (`tsx watch`).                  |
| `pnpm ws:probe`  | Cliente de prueba del WebSocket: `hello` → `welcome` → `state`. |
| `pnpm build`     | Compila `packages/*` y `apps/*` a `dist/`.                      |
| `pnpm typecheck` | Verifica tipos en todos los paquetes.                           |
| `pnpm lint`      | Lint y formato con Biome (solo revisa).                         |
| `pnpm format`    | Aplica formato y correcciones seguras de Biome.                 |
| `pnpm test`      | Tests con Vitest.                                               |
| `pnpm depcruise` | Verifica las reglas de capas de la arquitectura limpia.         |

## Estructura

```
apps/server/src/
├── index.ts          composition root (conecta todo a mano)
├── config/           variables de entorno validadas con zod
├── domain/           núcleo puro: estados, reglas, ports (interfaces)
├── application/      casos de uso: orquestador, tools, memoria
├── infrastructure/   adaptadores: HTTP/WS, Gemini, sidecar, SQLite, Google
└── shared/           utilidades puras: logger, Result, audio
packages/protocol/    tipos y esquemas del protocolo WebSocket
```

Las dependencias solo apuntan hacia dentro (`infrastructure → application → domain`); `pnpm depcruise` lo verifica en la CI. Detalle en la sección 10 de `docs/context.md`.

## Flujo de trabajo

- `main` siempre estable y `laboratory` como rama de integración y pruebas.
- Una rama de corta duración por fase (`feat/<fase>-<nombre>`, o `fix/…`, `docs/…`, `chore/…`) creada desde `laboratory`; se sube a GitHub a medida que se avanza.
- Ciclo: PR rama → `laboratory` → pruebas → PR `laboratory` → `main` → se borra la rama.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/) (`feat(voice): agregar barge-in`), validados por commitlint en un hook de git.
- Detalle en la sección 2.1 de `docs/context.md`.

## Privacidad

En el free tier de Gemini, Google puede usar los datos para mejorar sus productos. No le digas información sensible a Sofía. `.env` y `data/` nunca se suben a git.
