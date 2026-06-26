/**
 * Phase 2C — useAudioUpload (Web)
 *
 * Orchestrates the upload lifecycle for audio recordings:
 *   1. Init upload (get presigned URL)
 *   2. PUT to MinIO via presigned URL
 *   3. Complete/finalize upload
 *   4. Create AUDIO message
 *
 * Retry uses same clientMessageId and fileId.
 */

import { useCallback, useRef, useState } from "react";
import type { RecordedClip } from "./AudioRecorderState";
import type { AudioRecorderErrorCode } from "./AudioRecorderState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadPhase =
  | "init"
  | "uploading"
  | "finalizing"
  | "sending"
  | "done"
  | "failed";

export interface UploadState {
  phase: UploadPhase;
  progress: number; // 0–100
  fileId?: string;
  uploadId?: string;
  errorCode?: AudioRecorderErrorCode;
}

export interface AudioUploadInput {
  clip: RecordedClip;
  conversationId: string;
  clientMessageId: string;
  durationMs: number;
}

export interface AudioUploadResult {
  fileId: string;
  uploadId: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioUpload() {
  const [uploadState, setUploadState] = useState<UploadState>({
    phase: "init",
    progress: 0,
  });

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setUploadState({ phase: "init", progress: 0 });
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const uploadAudio = useCallback(
    async (input: AudioUploadInput): Promise<AudioUploadResult> => {
      const { clip, conversationId, clientMessageId, durationMs } = input;
      const ext = clip.mimeType.includes("webm")
        ? "webm"
        : clip.mimeType.includes("mp4")
          ? "m4a"
          : clip.mimeType.includes("ogg")
            ? "ogg"
            : "audio";

      const filename = `voice-${Date.now()}.${ext}`;

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        // ---- Phase 1: Init upload ----
        setUploadState({ phase: "init", progress: 0 });

        const initRes = await fetch("/api/v1/files/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            filename,
            mimeType: clip.mimeType,
            sizeBytes: clip.sizeBytes,
            durationMs,
            purpose: "audio_message",
            conversationId,
            clientMessageId,
          }),
          signal,
        });

        if (!initRes.ok) {
          const err = await initRes.json().catch(() => ({}));
          throw new Error(
            (err as any).message || `Upload init failed: ${initRes.status}`,
          );
        }

        const initData = await initRes.json();
        const { uploadId, uploadUrl, objectKey } = initData.data || initData;

        if (!uploadUrl || !uploadId) {
          throw new Error("Invalid upload init response");
        }

        // ---- Phase 2: Upload to MinIO ----
        setUploadState({
          phase: "uploading",
          progress: 10,
          uploadId,
        });

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": clip.mimeType,
          },
          body: clip.blob,
          signal,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload failed: ${uploadRes.status}`);
        }

        setUploadState({
          phase: "uploading",
          progress: 90,
          uploadId,
        });

        // ---- Phase 3: Complete/Finalize ----
        setUploadState({
          phase: "finalizing",
          progress: 95,
          uploadId,
        });

        const completeRes = await fetch("/api/v1/files/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
          body: JSON.stringify({
            uploadId,
            objectKey,
          }),
          signal,
        });

        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => ({}));
          throw new Error(
            (err as any).message || `Upload finalize failed: ${completeRes.status}`,
          );
        }

        const completeData = await completeRes.json();
        const fileId = completeData.data?.fileId || completeData.fileId;

        setUploadState({
          phase: "done",
          progress: 100,
          fileId,
          uploadId,
        });

        return { fileId, uploadId };
      } catch (err) {
        const message = (err as Error).message || "Upload failed";
        const isAbort = (err as Error).name === "AbortError";
        const isNetwork = message.includes("fetch") || message.includes("network");

        setUploadState({
          phase: "failed",
          progress: 0,
          errorCode: isAbort
            ? undefined
            : isNetwork
              ? "UPLOAD_NETWORK_FAILURE"
              : "FINALIZE_FAILURE",
        });

        throw err;
      }
    },
    [],
  );

  /** Cancel in-progress upload */
  const cancelUpload = useCallback(() => {
    abortRef.current?.abort();
    reset();
  }, [reset]);

  return {
    uploadState,
    uploadAudio,
    cancelUpload,
    reset,
  };
}
