import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        // Browser globals (Obsidian runs in Electron/browser context)
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        getComputedStyle: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        MutationObserver: "readonly",
        ResizeObserver: "readonly",
        HTMLElement: "readonly",
        Text: "readonly",
        Range: "readonly",
        Selection: "readonly",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": "warn",
      // These are pervasive due to Obsidian's untyped internal APIs — suppress for now
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
]);
