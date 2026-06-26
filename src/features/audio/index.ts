/**
 * Phase 2C — Audio feature barrel (Web)
 */

export { AudioBubble } from "./AudioBubble";
export { RecordingBar } from "./RecordingBar";
export { useAudioRecorder } from "./useAudioRecorder";
export { useAudioUpload } from "./useAudioUpload";
export { useGlobalAudioPlayer, useIsMessagePlaying, usePlaybackInfo } from "./GlobalAudioPlayer";
export {
  type AudioRecorderState,
  type AudioRecorderErrorCode,
  type AudioRecorderError,
  type RecordedClip,
  type PlaybackState,
  type PlaybackInfo,
  type UploadProgress,
  type AudioMessageSendResult,
  AUDIO_DURATION_LIMITS,
  canTransition,
  getGuards,
} from "./AudioRecorderState";
