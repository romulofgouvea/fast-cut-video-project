import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist/", "data/", "bin/", "node_modules/", "src-tauri/"] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // The codebase leans on inferred types and short-lived `any` at trust
      // boundaries (parsed JSON, child_process output); keep those as warnings.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Frontend: browser globals + React rules.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Backend + scripts: Node globals.
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "scripts/**/*.mjs", "*.config.{ts,js}", "e2e/**"],
    languageOptions: { globals: globals.node },
  },

  // Playwright specs + screenshot scripts also run browser-context callbacks.
  {
    files: ["e2e/**/*.spec.ts", "scripts/shots.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Tests: Node + it/describe/expect come from vitest imports, so nothing extra.
  {
    files: ["**/*.test.{ts,tsx}"],
    languageOptions: { globals: { ...globals.node } },
  },

  prettier,
);
