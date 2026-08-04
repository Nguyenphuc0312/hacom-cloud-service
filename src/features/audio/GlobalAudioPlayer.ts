/**
 * Phase 2C — Global Audio Player (Zustand store)
 *
 * Coordinates playback across all AudioBubble instances.
 * Ensures only one audio message plays at a time.
 * Optimized: only the actively-playing bubble re-renders on time update.
 */

import { create } from "zustand";
import type { AudioRecorderErrorCode, PlaybackState } from "./AudioRecorderState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GlobalAudioPlayerState {
  /** Currently playing message ID, or null */
  activeMessageId: string | null;

  /** Playback state of the active message */
  playbackState: PlaybackState;

  /** Current playback position in ms */
  currentTimeMs: number;

  /** Total duration in ms */
  durationMs: number;

  /** The signed URL currently in use */
  currentUrl: string | null;

  /** Error state */
  errorCode: AudioRecorderErrorCode | null;

  // ---- Actions ----

  /** Start playing a message. Pauses any currently-playing message. */
  play: (messageId: string, url: string, durationMs: number) => void;

  /** Pause the currently-playing message */
  pause: () => void;

  /** Resume the currently-playing message */
  resume: () => void;

  /** Stop and clear */
  stop: () => void;

  /** Seek to a position in ms */
  seek: (timeMs: number) => void;

  /** Update current time (called by the audio element's timeupdate) */
  setCurrentTime: (timeMs: number) => void;

  /** Update duration (called when metadata loads) */
  setDuration: (durationMs: number) => void;

  /** Set error state */
  setError: (code: AudioRecorderErrorCode) => void;

  /** Update URL (e.g., after refreshing expired signed URL) */
  setUrl: (url: string) => void;

  /** Check if a specific message is the active player */
  isActive: (messageId: string) => boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGlobalAudioPlayer = create<GlobalAudioPlayerState>(
  (set, get) => ({
    activeMessageId: null,
    playbackState: "IDLE",
    currentTimeMs: 0,
    durationMs: 0,
    currentUrl: null,
    errorCode: null,

    play: (messageId, url, durationMs) => {
      const current = get();
      // Pause existing player if different
      if (current.activeMessageId && current.activeMessageId !== messageId) {
        // The old AudioBubble will react to activeMessageId change
      }
      set({
        activeMessageId: messageId,
        playbackState: "LOADING",
        currentTimeMs: 0,
        durationMs,
        currentUrl: url,
        errorCode: null,
      });
    },

    pause: () => {
      set({ playbackState: "PAUSED" });
    },

    resume: () => {
      const { activeMessageId } = get();
      if (activeMessageId) {
        set({ playbackState: "PLAYING", errorCode: null });
      }
    },

    stop: () => {
      set({
        activeMessageId: null,
        playbackState: "IDLE",
        currentTimeMs: 0,
        durationMs: 0,
        currentUrl: null,
        errorCode: null,
      });
    },

    seek: (timeMs) => {
      set({ currentTimeMs: timeMs });
    },

    setCurrentTime: (timeMs) => {
      // Throttled: only update if significant change (>100ms) to reduce re-renders
      const current = get().currentTimeMs;
      if (Math.abs(timeMs - current) > 100) {
        set({ currentTimeMs: timeMs });
      }
    },

    setDuration: (durationMs) => {
      set({ durationMs });
    },

    setError: (code) => {
      set({ playbackState: "ERROR", errorCode: code });
    },

    setUrl: (url) => {
      set({ currentUrl: url });
    },

    isActive: (messageId) => {
      return get().activeMessageId === messageId;
    },
  }),
);

// ---------------------------------------------------------------------------
// Selector hooks (optimized — only subscribe to relevant slices)
// ---------------------------------------------------------------------------

/** Subscribe only to whether a specific message is the active player */
export const useIsMessagePlaying = (messageId: string): boolean =>
  useGlobalAudioPlayer(
    (state) =>
      state.activeMessageId === messageId &&
      state.playbackState === "PLAYING",
  );

/** Subscribe to active playback info (for the currently-playing bubble) */
export const usePlaybackInfo = (messageId: string) =>
  useGlobalAudioPlayer((state) => {
    if (state.activeMessageId !== messageId) {
      return { isActive: false, state: "IDLE" as PlaybackState, currentTimeMs: 0, durationMs: 0, url: null as string | null, errorCode: null as AudioRecorderErrorCode | null };
    }
    return {
      isActive: true,
      state: state.playbackState,
      currentTimeMs: state.currentTimeMs,
      durationMs: state.durationMs,
      url: state.currentUrl,
      errorCode: state.errorCode,
    };
  });
