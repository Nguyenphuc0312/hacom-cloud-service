import { fetchWorkReportDraftJob, workReportDraftExportUrlFromId } from "../api/personalAiApi";
import type { PersonalChatMessage, WorkReportAiDraftPending, WorkReportAiDraftReady } from "../types";

/**
 * Vòng poll job dựng bản nháp AI (contract §"Không yêu cầu gửi lại tag khi xử
 * lý lâu" + §Luồng màn hình mục 3).
 *
 * Vì sao cần: một bản nháp có thể cần nhiều lượt LLM, vượt giới hạn thời gian
 * chờ của HTTP/SSE. Khi đó SSE chỉ kịp báo `work_report_ai_draft_waiting` kèm
 * `job_id`, còn `..._ready` KHÔNG bao giờ về trên chính stream đó. FE phải tự
 * poll đúng job ấy — contract cấm tuyệt đối việc bắt TBP gõ lại tag.
 */
export const DRAFT_POLL_INTERVAL_MS = 2_000;
export const DRAFT_POLL_TIMEOUT_MS = 5 * 60_000;

export interface DraftPollCallbacks {
  onReady: (draft: WorkReportAiDraftReady) => void;
  onFailed: (message?: string) => void;
  /** Quá 5 phút → dừng poll, để UI hiện nút "Kiểm tra lại". */
  onTimeout: () => void;
}

export interface DraftPollHandle {
  cancel: () => void;
}

/**
 * Poll `jobs/{job_id}` mỗi 2s tới khi `succeeded`/`failed`, tối đa 5 phút.
 *
 * Lỗi mạng giữa chừng KHÔNG dừng vòng lặp: job vẫn đang chạy ở BE, rớt một nhịp
 * poll không có nghĩa là hỏng. Chỉ `failed` từ BE hoặc hết hạn mới dừng — đúng
 * tinh thần "không tự tạo lại job, không tự suy ra draft_id".
 */
export function pollWorkReportDraftJob(
  jobId: string,
  callbacks: DraftPollCallbacks,
  options?: { now?: () => number },
): DraftPollHandle {
  const now = options?.now ?? (() => Date.now());
  const startedAt = now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller.abort();
  };

  const tick = async () => {
    if (stopped) return;

    try {
      const job = await fetchWorkReportDraftJob(jobId, { signal: controller.signal });
      if (stopped) return;

      if (job.status === "succeeded") {
        const exportUrl = workReportDraftExportUrlFromId(job.draft_id);
        // `succeeded` mà thiếu/hỏng draft_id thì không dựng được link tải —
        // báo lỗi vận hành thay vì hiện nút tải dẫn đi đâu không rõ.
        if (job.draft_id && exportUrl) {
          stop();
          callbacks.onReady({ draft_id: job.draft_id, export_url: exportUrl });
        } else {
          stop();
          callbacks.onFailed("Bản nháp đã tạo xong nhưng thiếu mã bản nháp để tải.");
        }
        return;
      }

      if (job.status === "failed") {
        stop();
        callbacks.onFailed(job.error_message);
        return;
      }
    } catch {
      // Rớt một nhịp poll (mạng chập, 5xx thoáng qua) — job vẫn chạy ở BE, thử
      // lại nhịp sau. Hết hạn chờ bên dưới là đường dừng duy nhất.
    }

    if (stopped) return;
    if (now() - startedAt >= DRAFT_POLL_TIMEOUT_MS) {
      stop();
      callbacks.onTimeout();
      return;
    }
    timer = setTimeout(() => void tick(), DRAFT_POLL_INTERVAL_MS);
  };

  timer = setTimeout(() => void tick(), DRAFT_POLL_INTERVAL_MS);
  return { cancel: stop };
}

/**
 * Nút "Kiểm tra lại" sau khi hết hạn chờ — poll tiếp ĐÚNG `job_id` cũ và patch
 * kết quả vào message. Không tạo job mới, không suy ra `draft_id`.
 */
export function handleDraftRetry(
  pending: WorkReportAiDraftPending,
  conversationId: string,
  messageId: string,
  patchMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<PersonalChatMessage>,
  ) => void,
): DraftPollHandle | null {
  if (!pending.job_id) return null;

  patchMessage(conversationId, messageId, {
    aiDraftPending: { ...pending, state: "polling", error_message: undefined },
  });

  return pollWorkReportDraftJob(pending.job_id, {
    onReady: (draft) =>
      patchMessage(conversationId, messageId, {
        aiDraft: draft,
        aiDraftPending: undefined,
      }),
    onFailed: (message) =>
      patchMessage(conversationId, messageId, {
        aiDraftPending: { ...pending, state: "failed", error_message: message },
      }),
    onTimeout: () =>
      patchMessage(conversationId, messageId, {
        aiDraftPending: { ...pending, state: "timeout" },
      }),
  });
}
