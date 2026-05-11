type LogLevel = "debug" | "info" | "warn" | "error";

type LogDetails = Record<string, unknown> | Error | unknown;

type LoggerOptions = {
  debugOnly?: boolean;
};

const DEBUG_FLAGS = [
  "VITE_CHAT_DEBUG_LOGS",
  "VITE_CHAT_SOCKET_DEBUG",
  "VITE_SOCKET_DEBUG",
] as const;

const SENSITIVE_KEY_REGEX =
  /(token|authorization|password|secret|credential|cookie|csrf|content|body|payload|raw|email)/i;
const IDENTIFIER_KEY_REGEX =
  /(^id$|userId|senderId|recipientId|conversationId|messageId|roomId|contactUserId|correlationId|requestId)/i;
const JWT_LIKE_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const EMAIL_LIKE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_STRING_LOG_LENGTH = 160;
const MAX_ARRAY_LOG_LENGTH = 20;
const MAX_OBJECT_DEPTH = 4;

const envValue = (key: string): string | undefined =>
  (import.meta.env as Record<string, string | undefined>)[key];

const isDebugEnabled = (): boolean =>
  import.meta.env.DEV || DEBUG_FLAGS.some((flag) => envValue(flag) === "true");

const isProdConsoleEnabled = (): boolean =>
  envValue("VITE_CHAT_ENABLE_PROD_LOGS") === "true";

const shouldWriteConsole = (options?: LoggerOptions): boolean => {
  if (isDebugEnabled()) {
    return true;
  }

  if (options?.debugOnly) {
    return false;
  }

  return isProdConsoleEnabled();
};

const redactIdentifier = (value: unknown): string => {
  if (typeof value !== "string") {
    return "[redacted-id]";
  }

  const trimmed = value.trim();
  if (trimmed.length <= 6) {
    return "[redacted-id]";
  }

  return `[redacted-id:${trimmed.slice(-6)}]`;
};

const redactString = (value: string): string => {
  if (JWT_LIKE_REGEX.test(value)) {
    return "[redacted-token]";
  }

  if (EMAIL_LIKE_REGEX.test(value)) {
    return "[redacted-email]";
  }

  if (value.length > MAX_STRING_LOG_LENGTH) {
    return `[redacted-string:${value.length}]`;
  }

  return value;
};

export const redactLogValue = (
  value: unknown,
  depth: number = 0,
): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (depth >= MAX_OBJECT_DEPTH) {
    return "[redacted-object-depth]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LOG_LENGTH)
      .map((item) => redactLogValue(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = "[redacted]";
      return;
    }

    if (IDENTIFIER_KEY_REGEX.test(key)) {
      result[key] = redactIdentifier(item);
      return;
    }

    result[key] = redactLogValue(item, depth + 1);
  });

  return result;
};

const writeLog = (
  level: LogLevel,
  scope: string,
  event: string,
  details?: LogDetails,
  options?: LoggerOptions,
): void => {
  if (!shouldWriteConsole(options)) {
    return;
  }

  const entry = {
    ts: new Date().toISOString(),
    scope,
    event,
    details: redactLogValue(details),
  };

  if (level === "error") {
    console.error("[chat-web]", entry);
    return;
  }

  if (level === "warn") {
    console.warn("[chat-web]", entry);
    return;
  }

  if (level === "info") {
    console.info("[chat-web]", entry);
    return;
  }

  console.debug("[chat-web]", entry);
};

export const logger = {
  debug: (
    scope: string,
    event: string,
    details?: LogDetails,
    options?: LoggerOptions,
  ) => writeLog("debug", scope, event, details, options),
  info: (
    scope: string,
    event: string,
    details?: LogDetails,
    options?: LoggerOptions,
  ) => writeLog("info", scope, event, details, options),
  warn: (
    scope: string,
    event: string,
    details?: LogDetails,
    options?: LoggerOptions,
  ) => writeLog("warn", scope, event, details, options),
  error: (
    scope: string,
    event: string,
    details?: LogDetails,
    options?: LoggerOptions,
  ) => writeLog("error", scope, event, details, options),
};
