import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
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
        "error",
        {
          patterns: ["**/services/api"],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/hooks/useMessages.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/hooks/useMessages"],
              message:
                "useMessages is deprecated. Use feature-level chat session/send hooks instead.",
            },
          ],
        },
      ],
    },
  },
]);
