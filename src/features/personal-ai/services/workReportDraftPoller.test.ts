import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_POLL_INTERVAL_MS,
  DRAFT_POLL_TIMEOUT_MS,
  pollWorkReportDraftJob,
} from "./workReportDraftPoller";

const fetchJob = vi.fn();
vi.mock("../api/personalAiApi", () => ({
  fetchWorkReportDraftJob: (...args: unknown[]) => fetchJob(...args),
  workReportDraftExportUrlFromId: (id: string | undefined) =>
    id && /^[A-Za-z0-9._-]+$/.test(id)
      ? `/ai-api/api/work-report-drafts/${id}/export.xlsx`
      : null,
}));

/** Chạy hết các timer đang chờ + microtask giữa mỗi nhịp poll. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("pollWorkReportDraftJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchJob.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("poll tới khi succeeded rồi dựng export_url từ draft_id", async () => {
    fetchJob
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "succeeded", draft_id: "d1" });

    const onReady = vi.fn();
    const onFailed = vi.fn();
    const onTimeout = vi.fn();
    pollWorkReportDraftJob("job-1", { onReady, onFailed, onTimeout });

    await advance(DRAFT_POLL_INTERVAL_MS * 3);

    expect(onReady).toHaveBeenCalledWith({
      draft_id: "d1",
      export_url: "/ai-api/api/work-report-drafts/d1/export.xlsx",
    });
    expect(onFailed).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("dừng poll sau khi đã succeeded — không gọi thêm nhịp nào", async () => {
    fetchJob.mockResolvedValue({ status: "succeeded", draft_id: "d1" });

    pollWorkReportDraftJob("job-1", {
      onReady: vi.fn(),
      onFailed: vi.fn(),
      onTimeout: vi.fn(),
    });

    await advance(DRAFT_POLL_INTERVAL_MS);
    expect(fetchJob).toHaveBeenCalledTimes(1);

    await advance(DRAFT_POLL_INTERVAL_MS * 5);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("failed → báo error_message, KHÔNG tự tạo lại job", async () => {
    fetchJob.mockResolvedValueOnce({ status: "failed", error_message: "LLM quá tải" });

    const onFailed = vi.fn();
    const onReady = vi.fn();
    pollWorkReportDraftJob("job-1", { onReady, onFailed, onTimeout: vi.fn() });

    await advance(DRAFT_POLL_INTERVAL_MS);

    expect(onFailed).toHaveBeenCalledWith("LLM quá tải");
    expect(onReady).not.toHaveBeenCalled();
    // Không có nhịp poll nào sau khi failed.
    await advance(DRAFT_POLL_INTERVAL_MS * 3);
    expect(fetchJob).toHaveBeenCalledTimes(1);
  });

  it("succeeded mà thiếu draft_id → coi là lỗi, không hiện nút tải hỏng", async () => {
    fetchJob.mockResolvedValueOnce({ status: "succeeded" });

    const onReady = vi.fn();
    const onFailed = vi.fn();
    pollWorkReportDraftJob("job-1", { onReady, onFailed, onTimeout: vi.fn() });

    await advance(DRAFT_POLL_INTERVAL_MS);

    expect(onReady).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(expect.stringContaining("thiếu mã bản nháp"));
  });

  it("lỗi mạng giữa chừng KHÔNG dừng vòng poll — job vẫn chạy ở BE", async () => {
    fetchJob
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce({ status: "succeeded", draft_id: "d9" });

    const onReady = vi.fn();
    const onFailed = vi.fn();
    pollWorkReportDraftJob("job-1", { onReady, onFailed, onTimeout: vi.fn() });

    await advance(DRAFT_POLL_INTERVAL_MS * 3);

    expect(onFailed).not.toHaveBeenCalled();
    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({ draft_id: "d9" }),
    );
  });

  it("quá 5 phút → onTimeout, giữ job_id cho nút Kiểm tra lại", async () => {
    fetchJob.mockResolvedValue({ status: "running" });

    const onTimeout = vi.fn();
    const onReady = vi.fn();
    pollWorkReportDraftJob("job-1", { onReady, onFailed: vi.fn(), onTimeout });

    await advance(DRAFT_POLL_TIMEOUT_MS + DRAFT_POLL_INTERVAL_MS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onReady).not.toHaveBeenCalled();

    // Đã dừng hẳn — không poll lén sau khi hết hạn.
    const callsAtTimeout = fetchJob.mock.calls.length;
    await advance(DRAFT_POLL_INTERVAL_MS * 5);
    expect(fetchJob).toHaveBeenCalledTimes(callsAtTimeout);
  });

  it("cancel() dừng poll ngay, không gọi callback nào nữa", async () => {
    fetchJob.mockResolvedValue({ status: "running" });

    const onReady = vi.fn();
    const onTimeout = vi.fn();
    const handle = pollWorkReportDraftJob("job-1", {
      onReady,
      onFailed: vi.fn(),
      onTimeout,
    });

    await advance(DRAFT_POLL_INTERVAL_MS * 2);
    handle.cancel();
    const callsAtCancel = fetchJob.mock.calls.length;

    await advance(DRAFT_POLL_TIMEOUT_MS);

    expect(fetchJob).toHaveBeenCalledTimes(callsAtCancel);
    expect(onReady).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
