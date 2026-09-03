import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Tests live under tests/ and reach the app through these aliases (mirrored in
  // tsconfig.json `paths`). Order matters: the more specific prefixes first.
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: dir("./shared/") },
      { find: /^@server\//, replacement: dir("./server/") },
      { find: /^@tests\//, replacement: dir("./tests/") },
      { find: /^@\//, replacement: dir("./src/") },
    ],
  },
  test: {
    // Default env is Node (server + shared). The browser-facing modules under
    // src/ opt into jsdom with a `// @vitest-environment jsdom` docblock at the
    // top of their test file.
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Only the non-UI logic is unit-tested; React components are covered by
      // the Playwright E2E suite (tests/e2e/) instead.
      include: ["shared/**/*.ts", "server/**/*.ts", "src/lib/**/*.ts", "src/store.ts"],
      exclude: [
        "**/*.d.ts",
        "shared/types.ts",
        "server/index.ts",
        // Thin React-hook wrappers around tested logic (the logic itself is covered).
        "src/lib/useStats.ts",
        "src/lib/useGlobalShortcuts.ts",
        // Desktop-only SQLite storage: needs the Tauri runtime, exercised by the app.
        "src/lib/desktopStorage.ts",
      ],
    },
  },
});
