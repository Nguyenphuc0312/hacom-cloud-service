import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRecorder } from "./useAudioRecorder";

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

class MockAnalyserNode {
  fftSize = 0;
  smoothingTimeConstant = 0;
  frequencyBinCount = 128;
  getByteFrequencyData = vi.fn();
  disconnect = vi.fn();
}

class MockSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  state: AudioContextState = "running";
  createMediaStreamSource = vi.fn(() => new MockSourceNode());
  createAnalyser = vi.fn(() => new MockAnalyserNode());
  resume = vi.fn(() => Promise.resolve());
  close = vi.fn(() => Promise.resolve());
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn((mime: string) => mime === "audio/webm;codecs=opus");

  state: RecordingState = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn(() => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.onstop?.();
  });
  requestData = vi.fn();

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
    if (mediaRecorderShouldThrow) {
      throw new Error("unsupported mime");
    }
    mediaRecorderInstances.push(this);
  }
}

let mediaRecorderShouldThrow = false;
let mediaRecorderInstances: MockMediaRecorder[] = [];

const makeStream = () => {
  const track = {
    readyState: "live",
    stop: vi.fn(function stop(this: { readyState: string }) {
      this.readyState = "ended";
    }),
    onended: null as (() => void) | null,
  };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  };
  return {
    stream: stream as unknown as MediaStream,
    track,
  };
};

describe("useAudioRecorder", () => {
  beforeEach(() => {
    mediaRecorderShouldThrow = false;
    mediaRecorderInstances = [];
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts recording immediately after getUserMedia resolves", async () => {
    const { stream, track } = makeStream();
    const getUserMedia = vi.fn(() => Promise.resolve(stream));
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      const ready = await result.current.requestPermission();
      expect(ready).toBe(true);
      result.current.startRecording();
    });

    await waitFor(() => expect(result.current.state).toBe("RECORDING"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(mediaRecorderInstances).toHaveLength(1);
    expect(mediaRecorderInstances[0].start).toHaveBeenCalledWith(250);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("moves to error and stops tracks when MediaRecorder construction fails", async () => {
    mediaRecorderShouldThrow = true;
    const { stream, track } = makeStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => Promise.resolve(stream)) },
    });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      const ready = await result.current.requestPermission();
      expect(ready).toBe(true);
      result.current.startRecording();
    });

    await waitFor(() => expect(result.current.state).toBe("FAILED"));
    expect(result.current.error?.code).toBe("RECORDER_UNSUPPORTED");
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("maps denied microphone permission to an error state", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
        ),
      },
    });
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      const ready = await result.current.requestPermission();
      expect(ready).toBe(false);
    });

    expect(result.current.state).toBe("FAILED");
    expect(result.current.error?.code).toBe("PERMISSION_DENIED");
  });

  it("ignores late getUserMedia resolution after cancel and stops the stale stream", async () => {
    const { stream, track } = makeStream();
    const deferred = createDeferred<MediaStream>();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(() => deferred.promise) },
    });
    const { result } = renderHook(() => useAudioRecorder());

    let permissionPromise: Promise<boolean>;
    act(() => {
      permissionPromise = result.current.requestPermission();
    });
    act(() => {
      result.current.cancelRecording();
    });

    await act(async () => {
      deferred.resolve(stream);
      await permissionPromise;
    });

    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(mediaRecorderInstances).toHaveLength(0);
  });
});
