import { defineConfig } from "tsup";

// Bundle for the Tauri desktop sidecar: one self-contained CommonJS file that
// `@yao-pkg/pkg` turns into a single executable. CJS (not ESM) because pkg's
// snapshot loader does not handle ESM. Everything is inlined (`noExternal`), so
// the produced binary needs no node_modules alongside it.
export default defineConfig({
  entry: { index: "server/index.ts" },
  outDir: "dist/desktop",
  format: ["cjs"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: false,
  // Inject an `import.meta.url` shim so server/index.ts's __dirname math works
  // under the CJS output format.
  shims: true,
  noExternal: [/.*/],
  // pkg wants a plain .cjs entry it can walk.
  outExtension: () => ({ js: ".cjs" }),
});
