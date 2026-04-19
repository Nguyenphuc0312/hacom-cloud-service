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
});
