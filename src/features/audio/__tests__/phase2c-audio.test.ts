/**
 * Phase 2C — Audio recorder state machine.
 *
 * Chỉ test phần thuần logic (`AudioRecorderState.ts`): transitions, guards, limits.
 * Hành vi của hook nằm ở `useAudioRecorder.test.tsx` / `useAudioUpload.test.tsx`.
 */
import { describe, expect, it } from "vitest";

import {
  ALLOWED_TRANSITIONS,
  AUDIO_DURATION_LIMITS,
  canTransition,
  getGuards,
  type AudioRecorderState,
} from "../AudioRecorderState";

describe("AudioRecorderState — transitions", () => {
  it("cho phép đường đi thuận: IDLE → ... → RECORDING", () => {
    expect(canTransition("IDLE", "REQUESTING_PERMISSION")).toBe(true);
    expect(canTransition("REQUESTING_PERMISSION", "READY")).toBe(true);
    expect(canTransition("READY", "RECORDING")).toBe(true);
  });

  it("cho phép đường gửi: STOPPING → PREVIEW → ... → SENT", () => {
    expect(canTransition("STOPPING", "PREVIEW")).toBe(true);
    expect(canTransition("PREVIEW", "UPLOADING")).toBe(true);
    expect(canTransition("UPLOADING", "FINALIZING_UPLOAD")).toBe(true);
    expect(canTransition("FINALIZING_UPLOAD", "CREATING_MESSAGE")).toBe(true);
    expect(canTransition("CREATING_MESSAGE", "SENT")).toBe(true);
  });

  it("chặn nhảy cóc và quay ngược", () => {
    expect(canTransition("IDLE", "RECORDING")).toBe(false);
    expect(canTransition("RECORDING", "IDLE")).toBe(false);
    expect(canTransition("RECORDING", "RECORDING")).toBe(false);
    expect(canTransition("SENT", "RECORDING")).toBe(false);
    expect(canTransition("UPLOADING", "RECORDING")).toBe(false);
    expect(canTransition("CREATING_MESSAGE", "UPLOADING")).toBe(false);
  });

  it("cho phép huỷ khi đang ghi, và retry sau khi lỗi", () => {
    expect(canTransition("RECORDING", "CANCELLED")).toBe(true);
    expect(canTransition("CANCELLED", "IDLE")).toBe(true);
    expect(canTransition("FAILED", "UPLOADING")).toBe(true);
  });

  it("mọi bước của luồng upload đều có nhánh sang FAILED", () => {
    for (const state of [
      "UPLOADING",
      "FINALIZING_UPLOAD",
      "CREATING_MESSAGE",
    ] as const) {
      expect(canTransition(state, "FAILED")).toBe(true);
    }
  });

  it("trạng thái lạ / không khai báo thì cấm, không ném lỗi", () => {
    expect(canTransition("KHONG_TON_TAI" as AudioRecorderState, "IDLE")).toBe(
      false,
    );
  });

  it("mọi trạng thái đều thoát được (không có ngõ cụt)", () => {
    for (const [from, targets] of ALLOWED_TRANSITIONS) {
      expect(targets.size, `${from} không có lối ra`).toBeGreaterThan(0);
    }
  });
});

describe("AudioRecorderState — guards", () => {
  it("chặn ghi chồng khi đang ghi hoặc đang dừng", () => {
    expect(getGuards("RECORDING").canStartRecording).toBe(false);
    expect(getGuards("STOPPING").canStartRecording).toBe(false);
    expect(getGuards("IDLE").canStartRecording).toBe(true);
  });

  it("chặn double-send trong suốt luồng upload", () => {
    for (const state of [
      "UPLOADING",
      "FINALIZING_UPLOAD",
      "CREATING_MESSAGE",
      "SENT",
    ] as const) {
      expect(getGuards(state).canSendMessage, state).toBe(false);
    }
    expect(getGuards("IDLE").canSendMessage).toBe(true);
  });

  it("chặn gửi nội dung khác khi micro đang bận", () => {
    expect(getGuards("RECORDING").canSendWhileRecording).toBe(false);
    expect(getGuards("STOPPING").canSendWhileRecording).toBe(false);
    expect(getGuards("IDLE").canSendWhileRecording).toBe(true);
  });
});

describe("AudioRecorderState — duration limits", () => {
  it("khớp giới hạn server và cảnh báo trước khi tự dừng", () => {
    expect(AUDIO_DURATION_LIMITS.MIN_DURATION_MS).toBeGreaterThanOrEqual(500);
    expect(AUDIO_DURATION_LIMITS.MAX_DURATION_MS).toBe(300_000);
    expect(AUDIO_DURATION_LIMITS.WARNING_THRESHOLD_MS).toBeLessThan(
      AUDIO_DURATION_LIMITS.MAX_DURATION_MS,
    );
  });
});
