/**
 * @fileoverview Production-safe error reporter for error boundaries.
 *
 * Unlike the general {@link logger} (which is gated off in production unless
 * VITE_CHAT_ENABLE_PROD_LOGS is set), boundary errors are ALWAYS surfaced to
 * the console — losing a crash log is never acceptable. Everything is passed
 * through the same redaction pipeline so no token/password/PII leaks.
 *
 * A backend sink can be attached later without touching callers: set
 * `window.__CHAT_WEB_ERROR_SINK__ = (report) => fetch(...)`. The report shape is
 * already redacted and JSON-serialisable.
 */

import { redactLogValue } from "./logger";
import { classifyRuntimeError, type RuntimeErrorKind } from "./errorClassification";
import { chatWebRuntimeDiagnostics } from "../lib/runtimeDiagnostics";

const MAX_STACK_CHARS = 4000;
const MAX_COMPONENT_STACK_CHARS = 4000;

export interface ErrorReportContext {
  /** Which boundary caught this (e.g. "AppRoot", "Danh sách hội thoại"). */
  boundary?: string;
  /** React component stack from componentDidCatch. */
  componentStack?: string;
  /** Route at time of crash (pathname + search). */
  route?: string;
  /** Number of retries already attempted for the failing operation. */
  retryCount?: number;
  /** Extra non-sensitive context. Redacted before logging. */
  extra?: Record<string, unknown>;
}

export interface ErrorReport {
  ts: string;
  kind: RuntimeErrorKind;
  name: string;
  message: string;
  stack?: string;
  componentStack?: string;
  boundary?: string;
  route?: string;
  status?: number;
  requestId?: string;
  endpoint?: string;
  retryCount?: number;
  online: boolean;
  userAgent: string;
  appVersion: string;
  buildSha: string;
  buildTime: string;
  extra?: Record<string, unknown>;
}

type ErrorSink = (report: ErrorReport) => void;

declare global {
  interface Window {
    __CHAT_WEB_ERROR_SINK__?: ErrorSink;
  }
}

const truncate = (value: string | undefined, max: number): string | undefined =>
  value && value.length > max ? `${value.slice(0, max)}…[truncated]` : value;

const pickString = (source: Record<string, unknown>, key: string): string | undefined =>
  typeof source[key] === "string" ? (source[key] as string) : undefined;

const pickNumber = (source: Record<string, unknown>, key: string): number | undefined =>
  typeof source[key] === "number" ? (source[key] as number) : undefined;

const extractApiFields = (
  error: unknown,
): { status?: number; requestId?: string; endpoint?: string } => {
  if (error === null || typeof error !== "object") return {};
  const record = error as Record<string, unknown>;
  return {
    status: pickNumber(record, "status") ?? pickNumber(record, "statusCode"),
    requestId: pickString(record, "requestId"),
    endpoint: pickString(record, "endpoint"),
  };
};

// Lightweight dedupe: React StrictMode (and double renders) can fire the same
// crash twice in quick succession. Avoid spamming the console / sink.
let lastSignature = "";
let lastReportedAt = 0;
const DEDUPE_WINDOW_MS = 1000;

export const reportError = (
  error: unknown,
  context: ErrorReportContext = {},
): ErrorReport | null => {
  const name =
    error instanceof Error
      ? error.name
      : typeof (error as { name?: unknown })?.name === "string"
        ? ((error as { name: string }).name)
        : "Error";
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? ((error as { message: string }).message)
        : String(error);

  const signature = `${context.boundary ?? ""}|${name}|${message}`;
  const now = Date.now();
  if (signature === lastSignature && now - lastReportedAt < DEDUPE_WINDOW_MS) {
    return null;
  }
  lastSignature = signature;
  lastReportedAt = now;

  const apiFields = extractApiFields(error);
  const stack = error instanceof Error ? error.stack : undefined;

  const report: ErrorReport = {
    ts: new Date().toISOString(),
    kind: classifyRuntimeError(error),
    name,
    message,
    stack: truncate(stack, MAX_STACK_CHARS),
    componentStack: truncate(context.componentStack, MAX_COMPONENT_STACK_CHARS),
    boundary: context.boundary,
    route: context.route,
    status: apiFields.status,
    requestId: apiFields.requestId,
    endpoint: apiFields.endpoint,
    retryCount: context.retryCount,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    appVersion: chatWebRuntimeDiagnostics.appVersion,
    buildSha: chatWebRuntimeDiagnostics.buildSha,
    buildTime: chatWebRuntimeDiagnostics.buildTime,
    extra: context.extra,
  };

  // Redact before it ever touches the console or a remote sink.
  const safeReport = redactLogValue(report) as ErrorReport;

  // ALWAYS log boundary crashes, including production. Never swallow.
  console.error("[chat-web][error-boundary]", safeReport);

  try {
    window.__CHAT_WEB_ERROR_SINK__?.(safeReport);
  } catch {
    // A failing sink must never escalate into another crash.
  }

  return safeReport;
};
