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
import { extractApiError } from "../../lib/apiContract";
import uploadClient from "../../services/uploadClient";

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

export class AudioUploadError extends Error {
  public readonly code: AudioRecorderErrorCode;
  public readonly statusCode?: number;

  constructor(
    message: string,
    code: AudioRecorderErrorCode,
    statusCode?: number,
  ) {
    super(message);
    this.name = "AudioUploadError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

const toAudioUploadError = (
  error: unknown,
  phase: UploadPhase,
): AudioUploadError => {
  if (error instanceof AudioUploadError) {
    return error;
  }

  if (isAbortError(error)) {
    return new AudioUploadError("Upload cancelled", "UNKNOWN");
  }

  const apiError = extractApiError(error);
  if (apiError.statusCode === 401) {
    return new AudioUploadError(
      "Authentication is required to upload audio",
      "AUTHENTICATION_REQUIRED",
      apiError.statusCode,
    );
  }

  if (phase === "init") {
    return new AudioUploadError(
      apiError.message,
      "UPLOAD_URL_FAILURE",
      apiError.statusCode,
    );
  }

  if (phase === "uploading") {
    return new AudioUploadError(
      apiError.message,
      "STORAGE_UPLOAD_FAILURE",
      apiError.statusCode,
    );
  }

  if (phase === "finalizing") {
    return new AudioUploadError(
      apiError.message,
      "FINALIZE_FAILURE",
      apiError.statusCode,
    );
  }

  return new AudioUploadError(apiError.message, "UNKNOWN", apiError.statusCode);
};

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
      let currentPhase: UploadPhase = "init";

      try {
        // ---- Phase 1: Init upload ----
        currentPhase = "init";
        setUploadState({ phase: "init", progress: 0 });

        const signed = await uploadClient.reserveUpload({
          filename,
          mimeType: clip.mimeType,
          sizeBytes: clip.sizeBytes,
          durationMs,
          purpose: "message_attachment",
          conversationId,
          clientMessageId,
        });

        const { uploadId, uploadUrl, objectKey } = signed;

        if (!uploadUrl || !uploadId) {
          throw new Error("Invalid upload init response");
        }

        // ---- Phase 2: Upload to MinIO ----
        setUploadState({
          phase: "uploading",
          progress: 10,
          uploadId,
        });

        currentPhase = "uploading";
        const file = new File([clip.blob], filename, { type: clip.mimeType });
        await uploadClient.uploadToSignedUrl({
          signedUrl: uploadUrl,
          file,
          method: signed.uploadMethod || "PUT",
          headers: {
            ...(signed.uploadHeaders || {}),
            "Content-Type": clip.mimeType,
          },
          abortSignal: signal,
          onProgress: (progress) => {
            setUploadState({
              phase: "uploading",
              progress: Math.min(90, Math.max(10, progress)),
              uploadId,
            });
          },
        });

        setUploadState({
          phase: "uploading",
          progress: 90,
          uploadId,
        });

        // ---- Phase 3: Complete/Finalize ----
        currentPhase = "finalizing";
        setUploadState({
          phase: "finalizing",
          progress: 95,
          uploadId,
        });

        const completed = await uploadClient.completeUpload({
          uploadId,
          conversationId,
          objectKey,
        });

        const attachment =
          "attachment" in completed && completed.attachment
            ? completed.attachment
            : undefined;
        const fileId = completed.fileId || attachment?.id;
        if (!fileId) {
          throw new AudioUploadError(
            "Upload finalized without a file id",
            "FINALIZE_FAILURE",
          );
        }

        setUploadState({
          phase: "done",
          progress: 100,
          fileId,
          uploadId,
        });

        return { fileId, uploadId };
      } catch (err) {
        const uploadError = toAudioUploadError(err, currentPhase);

        setUploadState({
          phase: "failed",
          progress: 0,
          errorCode: isAbortError(err) ? undefined : uploadError.code,
        });

        throw uploadError;
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
