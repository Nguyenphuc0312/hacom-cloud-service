import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FILE_VIEWER_LIFECYCLE_EVENT,
  recordFileViewerLifecycle,
  type FileViewerLifecycleDetails,
  type FileViewerLifecycleEvent,
} from "./fileViewerLifecycleTelemetry";

describe("fileViewerLifecycleTelemetry", () => {
  const events: FileViewerLifecycleEvent[] = [];
  const listener = (event: Event) => {
    events.push((event as CustomEvent<FileViewerLifecycleEvent>).detail);
  };

  beforeEach(() => {
    events.length = 0;
    window.addEventListener(FILE_VIEWER_LIFECYCLE_EVENT, listener);
  });

  afterEach(() => {
    window.removeEventListener(FILE_VIEWER_LIFECYCLE_EVENT, listener);
    vi.unstubAllEnvs();
  });

  it("does not emit unless the telemetry build flag is exactly true", () => {
    vi.stubEnv("VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED", "false");
    recordFileViewerLifecycle("open_requested", "pdf");

    expect(events).toEqual([]);
  });

  it("emits only allowlisted lifecycle fields", () => {
    vi.stubEnv("VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED", "true");
    const privateFileName = "salary-plan-q4.xlsx";
    const privatePath = "C:\\Users\\private\\Downloads\\salary-plan-q4.xlsx";
    const signedUrl = "https://storage.example/file?signature=private-token";

    recordFileViewerLifecycle("source_unavailable", "pdf", {
      source: "network",
      outcome: "error",
      fileName: privateFileName,
      path: privatePath,
      url: signedUrl,
      token: "private-token",
      error: new Error("private raw error"),
    } as unknown as FileViewerLifecycleDetails);

    expect(events).toEqual([
      {
        platform: "web",
        phase: "source_unavailable",
        fileKind: "pdf",
        source: "network",
        outcome: "error",
      },
    ]);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(privateFileName);
    expect(serialized).not.toContain(privatePath);
    expect(serialized).not.toContain(signedUrl);
    expect(serialized).not.toContain("private-token");
    expect(serialized).not.toContain("private raw error");
  });

  it("drops values outside its runtime allowlists", () => {
    vi.stubEnv("VITE_FILE_LIFECYCLE_TELEMETRY_ENABLED", "true");

    recordFileViewerLifecycle("not-a-phase" as never, "pdf");
    recordFileViewerLifecycle("open_requested", "not-a-file-kind" as never);
    recordFileViewerLifecycle("open_requested", "pdf", {
      source: "https://private.example" as never,
      outcome: "raw-error" as never,
    });

    expect(events).toEqual([
      {
        platform: "web",
        phase: "open_requested",
        fileKind: "pdf",
      },
    ]);
  });
});
