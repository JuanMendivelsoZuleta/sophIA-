/**
 * Reglas de la arquitectura limpia (context.md, sección 10.1).
 * Las dependencias solo apuntan hacia dentro: infrastructure → application → domain.
 * @type {import('dependency-cruiser').IConfiguration}
 */
const SRC = "^apps/server/src";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Las dependencias circulares hacen el código difícil de entender y probar.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-solo-depende-de-domain",
      severity: "error",
      comment:
        "domain es el núcleo puro: no conoce application, infrastructure, config ni el composition root (solo puede usar utilidades puras de shared).",
      from: { path: `${SRC}/domain/` },
      to: { path: `${SRC}/(application|infrastructure|config)/|${SRC}/index\\.ts$` },
    },
    {
      name: "domain-sin-io",
      severity: "error",
      comment: "domain no usa módulos de Node (fs, net, http, child_process…) ni librerías externas, salvo zod.",
      from: { path: `${SRC}/domain/` },
      to: {
        dependencyTypes: ["core", "npm", "npm-dev", "npm-optional", "npm-peer", "npm-no-pkg", "npm-unknown"],
        pathNot: "node_modules/(zod|@sophia/protocol)/",
      },
    },
    {
      name: "application-no-depende-de-infrastructure",
      severity: "error",
      comment: "application usa los ports de domain; las implementaciones concretas se inyectan desde index.ts.",
      from: { path: `${SRC}/application/` },
      to: { path: `${SRC}/(infrastructure)/|${SRC}/index\\.ts$` },
    },
    {
      name: "shared-es-hoja",
      severity: "error",
      comment: "shared contiene utilidades genéricas y no depende de ninguna capa.",
      from: { path: `${SRC}/shared/` },
      to: { path: `${SRC}/(domain|application|infrastructure|config)/|${SRC}/index\\.ts$` },
    },
    {
      name: "solo-index-importa-todo",
      severity: "error",
      comment: "Nadie importa el composition root.",
      from: { path: `${SRC}/` },
      to: { path: `${SRC}/index\\.ts$` },
    },
    {
      name: "protocol-independiente",
      severity: "error",
      comment: "packages/protocol es compartido y no depende de las apps.",
      from: { path: "^packages/protocol/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-importar-tests",
      severity: "error",
      from: { path: "^(apps|packages)/[^/]+/src/" },
      to: { path: "\\.test\\.ts$|/test/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "apps/server/tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["@sophia/source", "import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".json"],
    },
  },
};
