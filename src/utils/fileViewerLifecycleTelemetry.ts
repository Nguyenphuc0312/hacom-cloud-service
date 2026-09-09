/**
 * Opt-in, privacy-safe browser signals for the in-app attachment viewer.
 *
 * This module deliberately has no network sink. Consumers can observe the
 * event during an approved staging/canary run, while this module emits only
 * the explicitly allowlisted fields below. Never add file names, paths,
 * object keys, URLs, tokens, IDs, or raw errors to this payload.
 */
import type { PreviewType } from "./mimeRegistry";
import { isFileLifecycleTelemetryEnabled } from "../features/chat/config/fileViewerRollout";

export const FILE_VIEWER_LIFECYCLE_EVENT = "chat:file-viewer-lifecycle";

const LIFECYCLE_PHASES = [
  "open_requested",
  "open_blocked",
  "source_ready",
  "source_unavailable",
  "closed",
] as const;

const FILE_KINDS = [
  "image",
  "video",
  "audio",
  "pdf",
  "text",
  "csv",
  "document",
  "spreadsheet",
  "presentation",
  "archive",
  "unknown",
] as const satisfies readonly PreviewType[];

const SOURCE_KINDS = ["cache", "network", "legacy", "none"] as const;
const OUTCOMES = ["success", "blocked", "error"] as const;

export type FileViewerLifecyclePhase = (typeof LIFECYCLE_PHASES)[number];
export type FileViewerLifecycleSource = (typeof SOURCE_KINDS)[number];
export type FileViewerLifecycleOutcome = (typeof OUTCOMES)[number];

export interface FileViewerLifecycleDetails {
  source?: FileViewerLifecycleSource;
  outcome?: FileViewerLifecycleOutcome;
}

export interface FileViewerLifecycleEvent {
  platform: "web";
  phase: FileViewerLifecyclePhase;
  fileKind: PreviewType;
  source?: FileViewerLifecycleSource;
  outcome?: FileViewerLifecycleOutcome;
}

const includes = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && values.includes(value as T);

/**
 * Emits a local, allowlisted event only when telemetry is compiled on.
 * Values outside the allowlist are discarded rather than normalized, so an
 * accidental future call cannot turn arbitrary data into telemetry.
 */
export const recordFileViewerLifecycle = (
  phase: FileViewerLifecyclePhase,
  fileKind: PreviewType,
  details: FileViewerLifecycleDetails = {},
): void => {
  if (!isFileLifecycleTelemetryEnabled() || typeof window === "undefined") return;
  if (!includes(LIFECYCLE_PHASES, phase) || !includes(FILE_KINDS, fileKind)) return;

  const event: FileViewerLifecycleEvent = {
    platform: "web",
    phase,
    fileKind,
  };
  if (includes(SOURCE_KINDS, details.source)) event.source = details.source;
  if (includes(OUTCOMES, details.outcome)) event.outcome = details.outcome;

  window.dispatchEvent(
    new CustomEvent<FileViewerLifecycleEvent>(FILE_VIEWER_LIFECYCLE_EVENT, {
      detail: event,
    }),
  );
};
