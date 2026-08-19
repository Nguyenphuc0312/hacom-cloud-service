import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The current frontend uses established effect/ref patterns that are
      // valid at runtime but are rejected by optional React Compiler
      // diagnostics. Keep structural hook ordering checks enabled while
      // treating compiler-only diagnostics as non-blocking.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/use-memo": "off",
      "react-refresh/only-export-components": "warn",
      // Tiền tố `_` = "cố ý không dùng" (tham số giữ chỗ cho đúng chữ ký hàm,
      // biến destructure để loại field, catch không cần error).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: [
      "src/pages/ChatPage.tsx",
      "src/components/layout/ChatWindow.tsx",
      "src/components/info/GroupInfo.tsx",
      "src/components/info/UserProfile.tsx",
      "src/components/modals/NewChatModal.tsx",
      "src/components/modals/ShareContactModal.tsx",
    ],
    rules: {
        "no-restricted-imports": [
        "warn",
        {
          patterns: ["**/services/api"],
        },
      ],
    },
  },
]);
