/**
 * @fileoverview Runtime error classification.
 *
 * Distinguishes recoverable runtime failures (stale-deploy chunk loads,
 * transient network blips, expired auth) from genuinely fatal UI crashes so
 * error boundaries can pick a soft recovery path instead of always rendering
 * the heavy full-page "MÃ LỖI 500" screen.
 *
 * Classification is intentionally duck-typed (no import of ApiContractError)
 * to keep this module dependency-free and avoid import cycles.
 */

export type RuntimeErrorKind = "chunk" | "network" | "auth" | "fatal";

interface ApiErrorLike {
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
  isNetworkError?: unknown;
  isAuthError?: unknown;
}

const asErrorLike = (error: unknown): ApiErrorLike | null =>
  error !== null && typeof error === "object" ? (error as ApiErrorLike) : null;

const readMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message ?? "";
  }
  const like = asErrorLike(error);
  if (like && typeof (like as { message?: unknown }).message === "string") {
    return (like as { message: string }).message;
  }
  return typeof error === "string" ? error : "";
};

const readName = (error: unknown): string => {
  if (error instanceof Error) {
    return error.name ?? "";
  }
  const like = asErrorLike(error);
  return like && typeof like.name === "string" ? like.name : "";
};

const readStatus = (error: unknown): number | undefined => {
  const like = asErrorLike(error);
  if (!like) return undefined;
  if (typeof like.status === "number") return like.status;
  if (typeof like.statusCode === "number") return like.statusCode;
  return undefined;
};

/**
 * Vite/webpack/Rollup dynamic-import failures. After a deploy, a client running
 * the previous build requests a chunk whose hashed filename no longer exists →
 * the import rejects with one of these shapes. Browsers word it differently, so
 * we match several known phrasings.
 */
const CHUNK_ERROR_PATTERNS: RegExp[] = [
  /Loading chunk [\w-]+ failed/i,
  /Loading CSS chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i, // Safari
  /'text\/html' is not a valid JavaScript MIME type/i, // server returned index.html for a missing asset
  /expected a JavaScript module script but the server responded with a MIME type of "text\/html"/i,
  /Unable to preload CSS/i,
];

export const isChunkLoadError = (error: unknown): boolean => {
  if (readName(error) === "ChunkLoadError") {
    return true;
  }
  const message = readMessage(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const isNetworkError = (error: unknown): boolean => {
  const like = asErrorLike(error);
  if (like && like.isNetworkError === true) {
    return true;
  }

  const status = readStatus(error);
  if (status === 0) {
    return true;
  }

  const message = readMessage(error);
  if (/network error/i.test(message) || /failed to fetch/i.test(message)) {
    return true;
  }

  // Browser reports offline → treat any bubbled error as a network condition so
  // we show a reconnect/retry affordance rather than a fatal crash screen.
  return typeof navigator !== "undefined" && navigator.onLine === false;
};

export const isAuthError = (error: unknown): boolean => {
  const like = asErrorLike(error);
  if (like && like.isAuthError === true) {
    return true;
  }
  return readStatus(error) === 401;
};

/**
 * Pick a single recovery strategy. Order matters: chunk + auth are checked
 * before network because a stale-deploy or expired session is more specific
 * than a generic connectivity blip.
 */
export const classifyRuntimeError = (error: unknown): RuntimeErrorKind => {
  if (isChunkLoadError(error)) return "chunk";
  if (isAuthError(error)) return "auth";
  if (isNetworkError(error)) return "network";
  return "fatal";
};
