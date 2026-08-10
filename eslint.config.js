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
      "react-hooks/immutability": "warn",
      "react-hooks/incompatible-library": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/use-memo": "warn",
      "react-refresh/only-export-components": "warn",
      // Tiền tố `_` = "cố ý không dùng" (tham số giữ chỗ cho đúng chữ ký hàm,
      // biến destructure để loại field, catch không cần error). Codebase đã
      // dùng quy ước này sẵn nhưng lint chưa biết nên báo lỗi giả.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
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
