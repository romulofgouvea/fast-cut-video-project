import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "server/index.ts" },
  outDir: "dist/server",
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Relative imports (server/*, shared/*) are bundled; npm deps stay external.
});
