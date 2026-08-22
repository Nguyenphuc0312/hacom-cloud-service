import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import toastLibDefault from "react-hot-toast";
import { toast } from "./toast";

const toastLib = vi.mocked(toastLibDefault);

/**
 * Regression cover for toasts that never disappeared.
 *
 * Every toast carries an id derived from its message, and react-hot-toast
 * treats a repeat of the same id as an update that restarts the dismiss timer.
 * The de-dupe window used to be shorter than the toast's own lifetime, so an
 * error repeating every couple of seconds (401 -> refresh -> 401) kept renewing
 * itself and stayed on screen indefinitely.
 */
describe("toast de-duplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("suppresses a repeat while the error toast is still on screen", () => {
    vi.useFakeTimers();
    const message = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

    toast.error(message);
    expect(toastLib.error).toHaveBeenCalledTimes(1);

    // The old window was 1800ms; anything inside the 6000ms lifetime must not
    // reach the library, otherwise it restarts the dismiss timer.
    vi.advanceTimersByTime(2000);
    toast.error(message);
    vi.advanceTimersByTime(2000);
    toast.error(message);

    expect(toastLib.error).toHaveBeenCalledTimes(1);
  });

  it("allows the same message again once the toast has expired", () => {
    vi.useFakeTimers();
    const message = "Mất kết nối máy chủ.";

    toast.error(message);
    vi.advanceTimersByTime(6001);
    toast.error(message);

    expect(toastLib.error).toHaveBeenCalledTimes(2);
  });

  it("keeps different messages independent", () => {
    toast.error("Lỗi A");
    toast.error("Lỗi B");

    expect(toastLib.error).toHaveBeenCalledTimes(2);
  });

  it("uses a window matching each severity's own duration", () => {
    vi.useFakeTimers();

    toast.success("Đã lưu");
    // Success lives 4000ms, so a repeat at 4001ms is allowed again.
    vi.advanceTimersByTime(4001);
    toast.success("Đã lưu");

    expect(toastLib.success).toHaveBeenCalledTimes(2);
  });
});
