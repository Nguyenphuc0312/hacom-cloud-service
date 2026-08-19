import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const srcRoot = join(root, "src");
const failures = [];

const normalizePath = (path) => path.replaceAll("\\", "/");

const fail = (message) => {
  failures.push(message);
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const walkFiles = (dir, predicate, files = []) => {
  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "coverage" ||
        entry === ".git"
      ) {
        continue;
      }
      walkFiles(absolutePath, predicate, files);
      continue;
    }

    if (predicate(absolutePath)) {
      files.push(absolutePath);
    }
  }

  return files;
};

const sourceFiles = walkFiles(srcRoot, (path) => /\.[cm]?[tj]sx?$/.test(path));

const sourceTextFiles = sourceFiles.map((absolutePath) => ({
  absolutePath,
  relativePath: normalizePath(relative(root, absolutePath)),
  text: readFileSync(absolutePath, "utf8"),
}));

const isTestFile = (path) =>
  /(\.test\.|\.spec\.|__tests__\/)/.test(normalizePath(path));

const packageJson = readJson(join(root, "package.json"));
const dependencyNames = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

const forbiddenDependencies = [
  "@types/lodash",
  "dompurify",
  "i18next-http-backend",
  "lodash",
  "socket.io-client",
];

for (const dependency of forbiddenDependencies) {
  if (dependencyNames.has(dependency)) {
    fail(`Forbidden dead dependency is still declared: ${dependency}`);
  }
}

const removedLegacyFiles = [
  "src/hooks/useMessages.ts",
  "src/hooks/useConversations.ts",
  "src/hooks/useAutoScrollToBottom.ts",
  "src/features/chat/hooks/useConversationMessages.ts",
  "src/features/chat/hooks/useChatRealtime.ts",
  "src/features/chat/chatSelectors.ts",
];

for (const file of removedLegacyFiles) {
  if (existsSync(join(root, file))) {
    fail(`Removed legacy file still exists: ${file}`);
  }
}

const forbiddenImports = [
  {
    name: "legacy useAutoScrollToBottom",
    regex: /from\s+["'][^"']*useAutoScrollToBottom["']|useAutoScrollToBottom\b/,
  },
  {
    name: "legacy useMessages hook",
    regex: /from\s+["'][^"']*useMessages["']|useMessages\b/,
  },
  {
    name: "legacy useConversationMessages hook",
    regex:
      /from\s+["'][^"']*useConversationMessages["']|useConversationMessages\b(?!RTK)/,
  },
  {
    name: "legacy useChatRealtime hook",
    regex: /from\s+["'][^"']*useChatRealtime["']|useChatRealtime\b/,
  },
  {
    name: "removed lodash dependency",
    regex: /from\s+["']lodash(?:\/[^"']*)?["']|require\(["']lodash(?:\/[^"']*)?["']\)/,
  },
  {
    name: "removed dompurify dependency",
    regex: /from\s+["']dompurify["']|require\(["']dompurify["']\)/,
  },
  {
    name: "removed socket.io-client dependency",
    regex: /from\s+["']socket\.io-client["']|require\(["']socket\.io-client["']\)/,
  },
];

for (const file of sourceTextFiles) {
  for (const check of forbiddenImports) {
    if (check.regex.test(file.text)) {
      fail(`${check.name} referenced in ${file.relativePath}`);
    }
  }
}

const rawConsoleRegex = /\bconsole\.(debug|info|log|warn|error)\s*\(/;
const allowedConsoleFiles = new Set([
  "src/utils/logger.ts",
  "src/utils/apiPerfLogger.ts",
  "src/utils/errorReporter.ts",
  "src/components/input/MessageInput.tsx",
  "src/components/layout/ChatWindow.tsx",
  "src/components/preview/PdfJsViewer.tsx",
  "src/components/ui/UserSearchModal.tsx",
  "src/features/audio/useAudioRecorder.ts",
  "src/features/calendar/components/WeeklyCalendarWidget.tsx",
  "src/features/calendar/hooks/useCalendarEventMutations.ts",
  "src/features/calendar/pages/CalendarPage.tsx",
  "src/features/chat/hooks/useChatUserSearch.ts",
  "src/features/realtime/realtimeMiddleware.ts",
  "src/stores/calendarStore.ts",
]);
const blockingDialogRegex = /\bwindow\.(alert|confirm)\s*\(/;
const rawErrorStackRegex = /\berror\.stack\b|\b\w+Error\.stack\b/;
const allowedErrorStackFiles = new Set([
  "src/components/common/RouterErrorBoundary.tsx",
  "src/components/error/AppErrorBoundary.tsx",
  "src/components/error/FeatureErrorBoundary.tsx",
  "src/utils/errorReporter.ts",
]);
const allowedBlockingDialogFiles = new Set([
  "src/features/personal-ai/pages/PersonalAiWorkspacePage.tsx",
]);

for (const file of sourceTextFiles) {
  if (isTestFile(file.relativePath) || allowedConsoleFiles.has(file.relativePath)) {
    continue;
  }

  if (rawConsoleRegex.test(file.text)) {
    fail(`Raw console call outside logger/test: ${file.relativePath}`);
  }

  if (blockingDialogRegex.test(file.text) && !allowedBlockingDialogFiles.has(file.relativePath)) {
    fail(`Blocking browser dialog used in production code: ${file.relativePath}`);
  }

  if (
    rawErrorStackRegex.test(file.text) &&
    !allowedErrorStackFiles.has(file.relativePath)
  ) {
    fail(`Raw error stack access outside error boundary: ${file.relativePath}`);
  }
}

const messageListCandidates = [
  "src/components/chat/MessageList.tsx",
  "src/components/chat/ConversationViewport.tsx",
  "src/features/chat/simple-virtual-timeline/SimpleVirtualizedChatTimeline.tsx",
];
const messageListPath = messageListCandidates
  .map((candidate) => join(root, candidate))
  .find((candidate) => existsSync(candidate));

if (!messageListPath) {
  fail("Chat timeline component is missing from the frontend source tree");
} else {
  const messageListText = readFileSync(messageListPath, "utf8");
  if (
    !messageListText.includes("useConversationMessagesRTK") &&
    !sourceTextFiles.some(
      ({ text }) => text.includes("useConversationMessagesRTK"),
    )
  ) {
    fail("Chat timeline must read active messages through useConversationMessagesRTK");
  }

  for (const legacyTimelineSelector of [
    "useMessagesByConversation",
    "useCurrentMessages",
    "useMessages(",
  ]) {
    if (messageListText.includes(legacyTimelineSelector)) {
      fail(`Chat timeline still references legacy message selector: ${legacyTimelineSelector}`);
    }
  }
}

const websocketPath = join(root, "src/hooks/useWebSocket.ts");
const websocketText = readFileSync(websocketPath, "utf8");

for (const legacyWrite of [
  ".addMessage(",
  ".updateMessage(",
  ".deleteMessage(",
  "useChatStore.getState().addMessage",
  "useChatStore.getState().updateMessage",
  "useChatStore.getState().deleteMessage",
]) {
  if (websocketText.includes(legacyWrite)) {
    fail(`useWebSocket still dual-writes active messages through Zustand: ${legacyWrite}`);
  }
}

const configPath = join(root, "src/config/index.ts");
const configText = readFileSync(configPath, "utf8");
if (!configText.includes("SAFE_DATA_IMAGE_URL_REGEX")) {
  fail("Resource URL policy must keep an explicit safe data-image allowlist");
}

if (/image\/(?:svg|xml)|svg\+xml|text\/html/i.test(configText)) {
  fail("Resource URL policy must not allow svg/html data URLs");
}

if (!/allowDataImage\s*===\s*true/.test(configText)) {
  fail("Data image URLs must require explicit allowDataImage opt-in");
}

const routerPath = join(root, "src/router/router.tsx");
const routerText = readFileSync(routerPath, "utf8");
if (!routerText.includes('path: "*"') || !routerText.includes("NotFoundPage")) {
  fail("Router must keep an explicit catch-all NotFoundPage route");
}

if (failures.length > 0) {
  console.error("Production readiness gate failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Production readiness gate passed.");
console.log(`Checked ${sourceTextFiles.length} source files.`);
