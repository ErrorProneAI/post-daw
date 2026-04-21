import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        AudioBuffer: "readonly",
        AudioContext: "readonly",
        OfflineAudioContext: "readonly",
        HTMLElement: "readonly",
        HTMLCanvasElement: "readonly",
        HTMLInputElement: "readonly",
        File: "readonly",
        FileReader: "readonly",
        Blob: "readonly",
        URL: "readonly",
        DragEvent: "readonly",
        MouseEvent: "readonly",
        PointerEvent: "readonly",
        KeyboardEvent: "readonly",
        crypto: "readonly",
        performance: "readonly",
        fetch: "readonly",
        Event: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
