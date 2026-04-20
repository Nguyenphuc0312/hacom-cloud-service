import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const SCAN_ROOTS = [
  "components",
  "features",
  "hooks",
  "lib",
  "pages",
  "services",
  "stores",
];
const ALLOWED_FILES = new Set([
  "lib/axios.ts",
  "lib/conversationAdapter.ts",
  "lib/conversationIdentity.ts",
  "lib/socket.ts",
  "features/chat/realtime/registerConversationEvents.ts",
]);
const DISALLOWED_PATTERNS = [
  { label: "roomId", regex: /\broomId\b/ },
  { label: "roomIds", regex: /\broomIds\b/ },
  { label: "room_id", regex: /\broom_id\b/ },
  { label: "/rooms/", regex: /\/rooms\// },
  { label: "joinRoom", regex: /\bjoinRoom\b/ },
  { label: "leaveRoom", regex: /\bleaveRoom\b/ },
  { label: "roomIdMissing", regex: /\broomIdMissing\b/ },
  { label: "room-refresh", regex: /\broom-refresh\b/ },
  {
    label: "ROOM transport aliases",
    regex: /\bROOM_(JOIN|LEAVE|JOINED|LEFT)\b/,
  },
];

const collectSourceFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(absolutePath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.includes(".test.") || entry.name.includes(".spec.")) continue;
    files.push(absolutePath);
  }

  return files;
};

describe("canonical frontend contract boundaries", () => {
  it("keeps roomId and /rooms/* leakage confined to the approved compat boundaries", () => {
    const violations: string[] = [];

    for (const scanRoot of SCAN_ROOTS) {
      const absoluteRoot = path.join(SOURCE_ROOT, scanRoot);
      if (!fs.existsSync(absoluteRoot)) continue;

      for (const absoluteFile of collectSourceFiles(absoluteRoot)) {
        const relativeFile = path.relative(SOURCE_ROOT, absoluteFile).replaceAll("\\", "/");
        if (ALLOWED_FILES.has(relativeFile)) {
          continue;
        }

        const content = fs.readFileSync(absoluteFile, "utf8");
        for (const pattern of DISALLOWED_PATTERNS) {
          if (pattern.regex.test(content)) {
            violations.push(`${relativeFile}: ${pattern.label}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the frontend type hub off the shared-types root umbrella surface", () => {
    const typeHub = fs.readFileSync(path.join(SOURCE_ROOT, "types", "index.ts"), "utf8");

    expect(typeHub).not.toContain('@hacom/chat-shared-types";');
    expect(typeHub).not.toContain("@hacom/chat-shared-types';");
    expect(typeHub).not.toContain('import("@hacom/chat-shared-types")');
    expect(typeHub).toContain('@hacom/chat-shared-types/core');
    expect(typeHub).toContain('@hacom/chat-shared-types/auth');
    expect(typeHub).toContain('@hacom/chat-shared-types/chat');
    expect(typeHub).toContain('@hacom/chat-shared-types/ws');
    expect(typeHub).toContain('@hacom/chat-shared-types/compat');
  });

  it("keeps migrated frontend low-risk consumers on subpath imports only", () => {
    const rootImportPattern =
      /from\s+['"]@hacom\/chat-shared-types['"]|import\(['"]@hacom\/chat-shared-types['"]\)/;
    const cases = [
      {
        file: "lib/apiContract.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "services/api.ts",
        expectedSubpaths: [
          "@hacom/chat-shared-types/core",
          "@hacom/chat-shared-types/auth",
          "@hacom/chat-shared-types/chat",
        ],
      },
      {
        file: "features/auth/api/authApi.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "stores/authStore.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "hooks/usePresence.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/ws"],
      },
      {
        file: "lib/socket.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/ws"],
      },
      {
        file: "services/qrLoginService.ts",
        expectedSubpaths: [
          "@hacom/chat-shared-types/core",
          "@hacom/chat-shared-types/auth",
        ],
      },
      {
        file: "features/auth/utils/authErrorMapper.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "features/auth/model/authState.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "hooks/useFriendship.ts",
        expectedSubpaths: [
          "@hacom/chat-shared-types/core",
          "@hacom/chat-shared-types/chat",
        ],
      },
      {
        file: "stores/friendshipStore.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "features/chat/realtime/friendshipRealtime.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "components/friends/FriendQrWorkspace.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "components/auth/QrLoginPanel.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/auth"],
      },
      {
        file: "components/modals/ShareContactModal.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/auth"],
      },
      {
        file: "pages/VerifyEmailPage.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "pages/ChatPage.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "features/chat/hooks/useSendMessage.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "hooks/useWebSocket.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "features/auth/utils/authErrorMapper.test.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/core"],
      },
      {
        file: "hooks/useFriendship.mapping.test.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "stores/friendshipStore.realtime-qr.test.ts",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
      {
        file: "components/friends/FriendQrWorkspace.test.tsx",
        expectedSubpaths: ["@hacom/chat-shared-types/chat"],
      },
    ] as const;

    for (const entry of cases) {
      const source = fs.readFileSync(path.join(SOURCE_ROOT, entry.file), "utf8");

      expect(source).not.toMatch(rootImportPattern);
      for (const subpath of entry.expectedSubpaths) {
        expect(source).toContain(subpath);
      }
    }
  });

  it("pins the frontend HTTP client to public contract V3", () => {
    const axiosSource = fs.readFileSync(path.join(SOURCE_ROOT, "lib", "axios.ts"), "utf8");

    expect(axiosSource).toContain('@hacom/chat-shared-types/runtime');
    expect(axiosSource).toContain('PUBLIC_CHAT_CONTRACT_VERSION');
    expect(axiosSource).not.toContain('const API_CONTRACT_VERSION = "2"');
  });

  it("exposes runtime diagnostics with build metadata and public contract version", () => {
    const diagnosticsSource = fs.readFileSync(
      path.join(SOURCE_ROOT, "lib", "runtimeDiagnostics.ts"),
      "utf8",
    );
    const mainSource = fs.readFileSync(path.join(SOURCE_ROOT, "main.tsx"), "utf8");
    const diagnosticsTypes = fs.readFileSync(
      path.join(SOURCE_ROOT, "types", "runtimeDiagnostics.d.ts"),
      "utf8",
    );

    expect(diagnosticsSource).toContain("PUBLIC_CHAT_CONTRACT_VERSION");
    expect(diagnosticsSource).toContain("window.__CHAT_WEB_DIAGNOSTICS__");
    expect(diagnosticsSource).toContain("__CHAT_WEB_BUILD_SHA__");
    expect(mainSource).toContain("installChatWebDiagnostics()");
    expect(diagnosticsTypes).toContain("__CHAT_WEB_DIAGNOSTICS__");
  });
});
