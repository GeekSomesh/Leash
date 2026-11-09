import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // Booting the embedded Postgres (WASM) can take several seconds on a busy machine.
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
