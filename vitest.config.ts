import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Los tests usan el código fuente del protocolo, sin necesidad de compilarlo.
      "@sophia/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["apps/*/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
