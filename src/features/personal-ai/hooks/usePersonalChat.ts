import { useCallback, useEffect, useRef, useState } from "react";
import {
  streamPersonalChat,
  PersonalAiError,
  LevelReportScopeRequiredError,
  uploadLevelReport,
  normalizeCalendarEvents,
  normalizeWorkReportAiDraft,
  uploadPersonalAttachment,
  listPersonalAttachments,
  AiStreamError,
  stripDraftExportLinks,
  isAttachmentGoneError,
} from "../api/personalAiApi";
import { isReportSubmissionText } from "../permissions/reportTags";
import {
  uploadPersonalWeeklyReport,
  AiApiError,
  fetchPersonalSessionMessages,
} from "../../ai-assistant/services/aiChatApi";
import { usePersonalAiStore } from "../stores/personalAiStore";
import {
  getScopeToken,
  handleScopeErrorStatus,
  isTokenValidFor,
  useWorkReportScopeStore,
} from "../stores/workReportScopeStore";
import {
  canSubmitLevelReport,
  capabilityForTag,
  decideScopePreflight,
  fetchWorkReportScopes,
  ScopeFeatureDisabledError,
  ScopeFetchError,
} from "../api/workReportScopeApi";
import {
  fallbackUploadMessage,
  UPLOAD_CONNECTION_ERROR,
  withRetryAfterHint,
} from "../../../services/ai-chat/uploadFailure";
import { handleDraftRetry } from "../services/workReportDraftPoller";
import type { DraftPollHandle } from "../services/workReportDraftPoller";
import { useAuthStore } from "../../../stores/authStore";
import { logger } from "../../../utils/logger";
import type { PersonalAttachment, PersonalChatMessage, PersonalDocument } from "../types";
import { PERSONAL_ATTACHMENT_MODE, isAttachmentExpired } from "../types";

const BAOCAOCV_TRIGGER = /^#baocaocv\s*$/i;
const BAOCAOCONGVIEC_TRIGGER = /^#baocaocongviec\s*$/i;
const BARE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveBackendDocumentIds(
  selectedIds: string[],
  documents: PersonalDocument[],
): string[] {
  if (selectedIds.length === 0) return [];

  const selected = new Set(selectedIds);
  const resolved = documents
    .filter((doc) => selected.has(doc.id) || selected.has(doc.document_id))
    .map((doc) => doc.document_id);

  const candidates = resolved.length > 0
    ? resolved
    : selectedIds.filter((id) => !BARE_UUID_RE.test(id));

  return Array.from(new Set(candidates));
}

export function usePersonalChat() {
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    activeConversationId,
    selectedDocumentIds,
    documents,
    createConversation,
    addMessage,
    appendToken,
    finalizeMessage,
    setMessageThinkingPhase,
    markMessageError,
    patchMessage,
    updateServerSessionId,
    loadMessagesForConversation,
    addAttachment,
    setAttachments,
    removeAttachment,
  } = usePersonalAiStore();

  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedSessionIds = useRef(new Set<string>());
  /**
   * §2.5: lượt nộp file đang chờ user chọn phạm vi. Giữ File trong memory để
   * nộp lại đúng lượt đó sau khi chọn — không bắt người dùng đính lại tệp.
   */
  const pendingLevelReportFile = useRef<{ question: string; file: File } | null>(null);
  /**
   * Vòng poll job dựng bản nháp đang chạy, khoá theo `job_id` để hai SSE liên
   * tiếp của CÙNG một job (`..._waiting` rồi `..._job`) không dựng hai vòng poll
   * song song cho cùng một job.
   */
  const draftPollers = useRef(new Map<string, DraftPollHandle>());

  // Rời màn hình giữa lúc đang poll → huỷ hết, tránh timer chạy tiếp sau unmount.
  useEffect(() => {
    const pollers = draftPollers.current;
    return () => {
      pollers.forEach((p) => p.cancel());
      pollers.clear();
    };
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];

  /** Dừng mọi vòng poll bản nháp đang chạy (đã có kết quả, hoặc job hỏng). */
  const stopDraftPolling = useCallback(() => {
    draftPollers.current.forEach((p) => p.cancel());
    draftPollers.current.clear();
  }, []);

  /**
   * Bắt đầu (hoặc tiếp tục) poll một job dựng bản nháp.
   *
   * Cùng `job_id` gọi lại → bỏ qua, vì `..._waiting` rồi `..._job` của cùng một
   * job đều dẫn tới đây và không được dựng hai vòng poll song song.
   */
  const startDraftPolling = useCallback(
    (
      waiting: { job_id: string; period_start?: string; period_end?: string },
      conversationId: string,
      messageId: string,
    ) => {
      if (draftPollers.current.has(waiting.job_id)) return;

      // Dùng chung đường với nút "Kiểm tra lại" ở bubble: cùng patch trạng thái,
      // cùng kết cục (ready / failed / timeout → giữ job_id, không tạo job mới).
      const handle = handleDraftRetry(
        { ...waiting, state: "polling" },
        conversationId,
        messageId,
        (cid, mid, patch) => {
          // Vòng poll kết thúc (mọi nhánh đều xoá `aiDraftPending.state=polling`)
          // → bỏ khoá job để lượt "Kiểm tra lại" sau còn dựng lại được.
          if (patch.aiDraftPending?.state !== "polling") {
            draftPollers.current.delete(waiting.job_id);
          }
          patchMessage(cid, mid, patch);
        },
      );
      if (handle) draftPollers.current.set(waiting.job_id, handle);
    },
    [patchMessage],
  );

  // Fetch messages từ server khi user chọn conversation có serverSessionId nhưng chưa có messages
  useEffect(() => {
    const serverSessionId = activeConversation?.serverSessionId;
    if (!serverSessionId || !activeConversationId) return;
    if ((activeConversation?.messages.length ?? 0) > 0) return;
    if (fetchedSessionIds.current.has(serverSessionId)) return;

    // Backend lấy mã nhân viên từ JWT Bearer token để scope session cá nhân.
    // Chờ tới khi user (đã đăng nhập) sẵn sàng rồi mới fetch; chưa có thì hoãn
    // và đừng đánh dấu đã-fetch để còn retry.
    const employeeCode = user?.employeeCode ?? user?.employee_code ?? "";
    if (!employeeCode) return;

    fetchedSessionIds.current.add(serverSessionId);
    const ac = new AbortController();
    setIsLoadingHistory(true);

    const userId = user?.id ?? "";
    fetchPersonalSessionMessages(serverSessionId, { signal: ac.signal, employeeCode, userId })
      .then((fetched) => {
        if (ac.signal.aborted || !fetched.length) return;
        // Backend trả thêm các role nội bộ của tool-calling:
        // "assistant_tool_call" (content rỗng) và "tool" (kết quả tool). Đây
        // KHÔNG phải tin nhắn hiển thị — nếu giữ lại, kết quả tool hiện nhầm
        // thành tin nhắn và sinh bong bóng rỗng sau khi tải lại. Chỉ lấy
        // user/assistant có nội dung thực.
        const visible = fetched.filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            (m.content ?? "").trim().length > 0,
        );
        const normalized = visible.map((m, idx) => {
          // Khôi phục hộp "Xem báo cáo công việc" (ReportTextBox) sau khi tải
          // lịch sử: câu trả lời của #baocaocv (user thường) là text báo cáo,
          // không có cờ trong metadata. Nhận diện bằng tin user liền trước là
          // "#baocaocv". Loại trừ báo cáo dạng bảng của admin (có exportable_table).
          const prev = visible[idx - 1];
          const isReportRequest =
            m.role === "assistant" &&
            m.metadata?.exportable_table !== true &&
            prev?.role === "user" &&
            BAOCAOCV_TRIGGER.test((prev.content ?? "").trim());
          // Render lại bảng lịch + nút "Xem chi tiết" sau khi F5 (tải lịch sử).
          // Chỉ khôi phục được nếu BE-AI lưu `calendar_events` (kèm event_id) vào
          // metadata — markdown text không chứa event_id nên không parse ngược được.
          const calendarEvents = normalizeCalendarEvents(m.metadata?.calendar_events);
          // Nút "Tải bản nháp AI" phải sống qua F5 / mở lại hội thoại / tải thêm
          // trang lịch sử. BE trả lại cùng shape với SSE ở
          // `metadata.work_report_ai_draft` nên dựng lại y hệt, không parse link
          // trong markdown (link đó cần Authorization, bấm thẳng không tải được).
          const aiDraft = normalizeWorkReportAiDraft(m.metadata?.work_report_ai_draft);
          return {
            id: m.id || crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            // Có nút tải rồi thì cắt link thô trong transcript: link cần
            // Authorization nên bấm thẳng ra 401, để lại chỉ là lối tải hỏng
            // nằm cạnh nút chạy được (request: đúng MỘT nút, không link thô).
            content: aiDraft ? stripDraftExportLinks(m.content) : m.content,
            timestamp: new Date(m.timestamp),
            isStreaming: false as const,
            thinkingPhase: null as null,
            // Render lại nút "In" cho câu trả lời bảng sau khi tải lịch sử.
            ...(m.metadata?.exportable_table === true && { exportableTable: true }),
            // Render lại hộp báo cáo công việc của #baocaocv.
            ...(isReportRequest && { reportRequest: true as const }),
            // Render lại bảng lịch (khi BE trả metadata.calendar_events).
            ...(calendarEvents && { calendarEvents }),
            // Render lại nút tải bản nháp AI (khi BE trả metadata.work_report_ai_draft).
            ...(aiDraft && { aiDraft }),
          };
        });
        if (normalized.length === 0) return;
        loadMessagesForConversation(activeConversationId, normalized);
      })
      .then(() => {
        // Khôi phục chip tệp tạm CHƯA hết hạn khi mở lại hội thoại. Lỗi ở đây
        // không được làm hỏng việc tải lịch sử — chỉ là không có chip.
        if (ac.signal.aborted) return;
        return listPersonalAttachments(serverSessionId, { signal: ac.signal })
          .then((list) => {
            if (ac.signal.aborted) return;
            // KHÔNG ghi đè bằng danh sách RỖNG. Effect này chạy lại ngay sau lượt
            // hỏi đầu tiên (lúc `serverSessionId` vừa có), và nếu BE chưa kịp
            // liệt kê tệp vừa upload thì `[]` sẽ xoá đúng cái chip user vừa đính
            // — chip biến mất ngay trước mắt dù tệp vẫn dùng được.
            if (list.length === 0) return;
            setAttachments(activeConversationId, list);
          })
          .catch(() => { /* không có chip cũng không sao */ });
      })
      .catch(() => { /* Silent — hiển thị empty state làm fallback */ })
      .finally(() => { if (!ac.signal.aborted) setIsLoadingHistory(false); });

    return () => ac.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, activeConversation?.serverSessionId, user?.employeeCode, user?.employee_code]);

  const sendMessage = useCallback(
    async (
      promptText: string,
      scopePromptId?: string,
      // Tệp đính kèm CỦA RIÊNG lượt này — chỉ `sendWithFile` truyền vào, để bong
      // bóng user hiện chip tệp (kiểu ChatGPT). Các chip khác đang treo ở
      // composer không thuộc lượt này nên không suy từ store.
      attachedFile?: PersonalChatMessage["attachedFile"],
    ) => {
      const trimmed = promptText.trim();
      if (!trimmed || isStreaming) return;

      // Đọc TƯƠI: `sendWithFile` có thể vừa tạo hội thoại + ghi chip xong rồi gọi
      // thẳng vào đây trong CÙNG một lượt, lúc đó `activeConversationId` của
      // closure vẫn là null → tạo thêm hội thoại thứ hai, và chip nằm ở hội thoại
      // thứ nhất nên `attachment_ids` rỗng ("vui lòng gửi file" dù chip đã hiện).
      let conversationId =
        usePersonalAiStore.getState().activeConversationId ?? activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      const userMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
        ...(attachedFile && { attachedFile }),
      };
      addMessage(conversationId, userMessage);

      // §4 (bản 2.1, cập nhật 2.2): `selectionToken` chỉ sống trong đúng vòng
      // "BE hỏi (promptId X) → user chọn → FE gửi lại câu hỏi đó kèm token gắn
      // với X". Lần hỏi MỚI — kể cả trùng chữ y hệt, kể cả hội thoại khác —
      // phải gửi KHÔNG kèm token để BE tự quyết (và hỏi lại phạm vi nếu vẫn
      // nhiều scope). `scopePromptId` chỉ do effect gửi-lại-sau-khi-chọn truyền
      // vào; user gõ tay không có nó → không khớp → nhả token. Nhả NGAY ở đây,
      // trước pre-flight, để pre-flight/`withScopeToken` không thấy token cũ.
      const isTokenTurn = isTokenValidFor(trimmed, scopePromptId);
      if (!isTokenTurn && getScopeToken()) {
        useWorkReportScopeStore.getState().releaseScopeToken();
      }

      // §2/§3: PRE-FLIGHT phạm vi cho tag báo cáo cấp (#TBP/#LDDV/#TCT).
      // Biết trước capability của thao tác → gọi `/scopes?capability` NGAY thay
      // vì chờ BE đẩy SSE. Chỉ chạy khi CHƯA có scope đang chọn (getScopeToken
      // rỗng) — câu gửi-lại-sau-khi-chọn đã có token nên bỏ qua, không double.
      const capability = capabilityForTag(trimmed);
      // §7: khóa lựa chọn theo authUserId + capability. Nếu đang giữ token của
      // thao tác/tài khoản khác → ensureScopeKey xóa nó (không tái dùng). Sau đó
      // getScopeToken() chỉ còn giá trị nếu token hợp cho ĐÚNG capability này —
      // câu gửi-lại-sau-khi-chọn có token hợp nên bỏ qua pre-flight, không double.
      if (capability) {
        const scopeStore = useWorkReportScopeStore.getState();
        scopeStore.ensureScopeKey(user?.id ?? "", capability);
      }
      if (capability && !getScopeToken()) {
        const scopeStore = useWorkReportScopeStore.getState();
        try {
          const res = await fetchWorkReportScopes({ capability });
          const decision = decideScopePreflight(res);
          if (decision.kind === "deny") {
            // 0 scope khớp → không hiện thao tác, báo không có quyền (§2).
            addMessage(conversationId, {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Bạn không có phạm vi phù hợp cho thao tác này. Vui lòng liên hệ quản trị nếu cần cấp quyền.",
              timestamp: new Date(),
              isStreaming: false,
            });
            return;
          }
          // §2.4 `autoSelected`: đúng MỘT phạm vi sau khi BE gộp → không hỏi,
          // gửi thẳng KHÔNG kèm token (BE tự bind). `selectionToken` rỗng ở
          // nhánh này là chủ đích; đính token cũ quá TTL từng gây 403.
          if (decision.kind === "pick") {
            // ≥2 phạm vi → mở dropdown; sau khi user chọn, effect gửi lại tag kèm token.
            scopeStore.setScopes(decision.scopes, res.capability);
            scopeStore.requirePick(trimmed, res.capability, res.promptId);
            addMessage(conversationId, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "",
              timestamp: new Date(),
              isStreaming: false,
              scopeRequired: true,
            });
            return;
          }
        } catch (err) {
          // Flag đa-scope tắt (404) → giữ luồng cũ, không pre-flight (§2). 401/503
          // hoặc lỗi khác → để request chat bên dưới chạy và xử lý lỗi thống nhất
          // ở catch của stream (tránh nhân đôi thông báo lỗi).
          if (!(err instanceof ScopeFeatureDisabledError) && err instanceof ScopeFetchError) {
            logger.info("usePersonalChat", "scope-preflight-failed", {
              capability,
              status: err.status,
            });
          }
        }
      }

      // #baocaocv — KHÔNG chặn ở FE nữa. Để request chạy qua SSE để BE quyết
      // định theo quyền của user:
      //   • Admin/Giám đốc → event `selection_request` → DepartmentSelector
      //   • User thường     → event `token` → nội dung báo cáo của bản thân
      // (xem fe-baocaocv-regular-user-fix.md). Streaming path bên dưới đã xử lý
      // cả `onToken` lẫn `onSelectionRequest`, nên chỉ cần để nó chạy tiếp.

      // #baocaocongviec — KHÔNG dựng form ở FE nữa. Để request stream qua SSE; BE
      // sẽ bắn `form_request` kèm `existing` (prefill chống mất dữ liệu) + cấu hình
      // đính kèm. `onFormRequest` bên dưới patch form vào message. Ở đây chỉ tự động
      // hủy các form còn mở trước đó để tránh nhiều form cùng lúc (lưu trùng).
      if (BAOCAOCONGVIEC_TRIGGER.test(trimmed)) {
        const prevConv = conversations.find((c) => c.id === conversationId);
        prevConv?.messages.forEach((m) => {
          if (m.formRequest) {
            patchMessage(conversationId, m.id, {
              // Người dùng KHÔNG bấm hủy ở đây — form cũ tự đóng để nhường form
              // mới. Nói đúng như vậy, đừng báo "đã hủy báo cáo".
              content: "Biểu mẫu này đã đóng để mở biểu mẫu mới bên dưới.",
              formRequest: undefined,
              isStreaming: false,
            });
          }
        });
      }

      // #tongcvtuan — KHÔNG chặn ở FE nữa. Trước đây FE tự dựng widget file tuần
      // (weeklyReportList) và `return`, nên handler BE không bao giờ chạy. Giờ để
      // request stream qua SSE; BE quyết định theo quyền + biến thể ("theo phòng
      // ban") và stream bảng markdown tổng hợp/roll-up. Widget file tuần vẫn còn
      // (weeklyReportList) nếu cần gắn vào một nút riêng.

      // #baocaocv — đánh dấu là yêu cầu xem báo cáo. BE quyết định theo quyền:
      //  • Admin/Giám đốc → event `selection_request` → DepartmentSelector
      //  • User thường     → event `token` → nội dung báo cáo của bản thân,
      //    hiển thị trong bordered box "Xem báo cáo công việc".
      const isReportRequest = BAOCAOCV_TRIGGER.test(trimmed);
      const selectedBackendDocumentIds = resolveBackendDocumentIds(
        selectedDocumentIds,
        documents,
      );

      const assistantMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase:
          isReportRequest || selectedBackendDocumentIds.length > 0
            ? "searching"
            : null,
        ...(isReportRequest && { reportRequest: true }),
      };
      addMessage(conversationId, assistantMessage);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      const convIdSnapshot = conversationId;
      // Đọc TƯƠI từ store, không dùng `conversations` của closure: `sendWithFile`
      // gọi `addAttachment` rồi `await sendMessage(...)` ngay trong cùng một lượt,
      // nên closure vẫn giữ snapshot TRƯỚC lúc có chip → `attachment_ids` rỗng và
      // BE trả "vui lòng gửi file" dù chip đã hiện. Cùng lý do với serverSessionId.
      const targetConv = usePersonalAiStore
        .getState()
        .conversations.find((c) => c.id === conversationId);
      const serverSessionId = targetConv?.serverSessionId ?? null;
      // Gửi new_conversation: true nếu conversation được tạo mới bằng nút "+"
      // (pendingNew) HOẶC chưa có serverSessionId — belt-and-suspenders đảm bảo
      // backend luôn tạo session riêng biệt thay vì redirect vào session cũ nhất.
      const isNewConversation = (targetConv?.pendingNew ?? false) || !serverSessionId;
      // Chip tệp tạm của ĐÚNG hội thoại này (không mang sang hội thoại khác).
      // Bỏ tệp đã hết hạn: gửi ID chết làm BE từ chối cả lượt hỏi, còn user thì
      // vẫn thấy chip nên tưởng tệp còn dùng được (nghiệm thu mục 6).
      const liveAttachments = (targetConv?.attachments ?? []).filter(
        (a) => !isAttachmentExpired(a),
      );
      const attachmentIds = liveAttachments.map((a) => a.attachment_id);
      if (liveAttachments.length < (targetConv?.attachments ?? []).length) {
        // Dùng chính bong bóng vừa tạo, đừng thêm cái thứ hai — bỏ lửng nó sẽ
        // để lại một bong bóng rỗng quay mãi.
        patchMessage(convIdSnapshot, assistantMessage.id, {
          content: "Tệp đính kèm đã hết hạn. Vui lòng tải lại tệp rồi hỏi lại.",
          isStreaming: false,
          thinkingPhase: null,
          isError: true,
        });
        setIsStreaming(false);
        abortRef.current = null;
        return;
      }

      try {
        const response = await streamPersonalChat(
          {
            question: trimmed,
            session_id: serverSessionId,
            ...(isNewConversation && { new_conversation: true }),
            employee_code: user?.employeeCode ?? user?.employee_code ?? "",
            employee_name:
              user?.fullNameFromHr ??
              user?.fullNameFromHR ??
              user?.displayName ??
              user?.username ??
              "",
            department_name: user?.departmentName ?? "",
            org_unit: user?.orgUnit ?? "",
            // Luôn gửi document_ids (mảng rỗng khi bỏ tick hết) để backend
            // chuyển sang chitchat mode thay vì dùng lại RAG context của session.
            document_ids: attachmentIds.length ? [] : selectedBackendDocumentIds,
            // Hỏi đáp tệp tạm: gửi attachment_ids và TẮT Sources. Hai nguồn không
            // bao giờ đi cùng nhau — trộn là điều request cấm thẳng.
            ...(attachmentIds.length > 0 && {
              attachment_ids: attachmentIds,
              sources_enabled: false,
            }),
          },
          {
            onToken: (token) => {
              setMessageThinkingPhase(convIdSnapshot, null);
              appendToken(convIdSnapshot, token);
            },
            onThinking: (phase) => {
              setMessageThinkingPhase(convIdSnapshot, phase);
            },
            onFormRequest: (formData) => {
              patchMessage(convIdSnapshot, assistantMessage.id, {
                content: "",
                formRequest: formData,
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            // §3: BE bắt chọn phạm vi trước khi truy vấn. Lưu câu hỏi + scopes,
            // render widget; sau khi chọn, `sendMessage` gửi lại chính câu hỏi
            // này kèm scope_token (xem WorkReportScopeSelector.onSelected).
            onScopeRequired: (scopeData) => {
              const scopeStore = useWorkReportScopeStore.getState();
              scopeStore.setScopes(scopeData.scopes, scopeData.capability);
              // §4 (2.2): giữ `promptId` của ĐÚNG lần hỏi này — khoá nhận diện
              // để lượt gửi lại sau khi chọn được đính token, còn mọi lượt hỏi
              // khác (kể cả trùng chữ) thì không.
              scopeStore.requirePick(
                scopeData.question || trimmed,
                scopeData.capability,
                scopeData.promptId,
              );
              patchMessage(convIdSnapshot, assistantMessage.id, {
                content: "",
                scopeRequired: true,
                reportRequest: undefined,
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            // Bản nháp AI dựng xong → gắn vào message để render nút tải. Chỉ
            // patch `aiDraft`, KHÔNG đụng `content`: luồng dựng ngầm theo câu
            // hỏi thường vẫn phải giữ nguyên bảng tổng hợp tất định đang stream.
            onDraftReady: (draft) => {
              // Về được ngay trên stream → không cần poll nữa.
              stopDraftPolling();
              patchMessage(convIdSnapshot, assistantMessage.id, {
                aiDraft: draft,
                aiDraftPending: undefined,
              });
            },
            // Bản nháp cần nhiều lượt LLM, vượt hạn chờ của SSE → BE chỉ kịp gửi
            // `job_id`. Tự poll đúng job đó; contract cấm bắt TBP gõ lại tag.
            onDraftWaiting: (waiting) => {
              startDraftPolling(waiting, convIdSnapshot, assistantMessage.id);
            },
            onDraftFailed: (errorMessage) => {
              stopDraftPolling();
              patchMessage(convIdSnapshot, assistantMessage.id, {
                aiDraftPending: {
                  job_id: "",
                  state: "failed",
                  error_message: errorMessage,
                },
              });
            },
            onSelectionRequest: (selectionData) => {
              patchMessage(convIdSnapshot, assistantMessage.id, {
                content: "",
                selectionRequest: selectionData,
                // BE chọn luồng admin → đây là selector, KHÔNG phải report-text.
                // Xóa cờ reportRequest để khi hủy selector không rơi vào
                // ReportTextBox (gây "x2 lần hủy").
                reportRequest: undefined,
                isStreaming: false,
                thinkingPhase: null,
              });
            },
            signal: controller.signal,
          },
        );

        // Cắt link tải bản nháp khỏi câu trả lời: link cần Authorization nên
        // bấm thẳng luôn 401. Cắt vô điều kiện — link hỏng thì hỏng dù nút tải
        // có hiện hay không (nút do `onDraftReady`/metadata dựng, không phải từ
        // link này). Không có link thì hàm trả nguyên chuỗi.
        finalizeMessage(
          convIdSnapshot,
          stripDraftExportLinks(response.answer),
          response.sources,
        );

        // Trả lời dựa trên tệp đính kèm tạm → hiện nhãn nói rõ không dùng dữ liệu
        // Công ty/Sources, để user không hiểu nhầm nguồn của câu trả lời.
        if (response.mode === PERSONAL_ATTACHMENT_MODE) {
          patchMessage(convIdSnapshot, assistantMessage.id, { attachmentMode: true });
        }

        // Câu trả lời lịch: BE trả `calendar_events` ở SSE done → render bảng
        // lịch 5 cột + nút "Xem chi tiết" thay markdown thuần (xem
        // PersonalMessageBubble → CalendarEventTable). Rỗng → giữ text thường.
        if (response.calendar_events && response.calendar_events.length > 0) {
          patchMessage(convIdSnapshot, assistantMessage.id, {
            calendarEvents: response.calendar_events,
          });
        }

        // Lưu export_id + session_id nếu BE trả (SSE done) để Excel xuất từ
        // snapshot dữ liệu gốc (đủ cột + có cột "Mã" cho đồng bộ round-trip).
        // Tách khỏi cờ exportable_table: nút Xuất còn hiện qua fallback bảng
        // markdown; nếu chỉ patch id khi exportable_table=true thì mất id khi BE
        // trả id mà không kèm cờ → payload export thiếu session_id/export_id.
        if (response.export_id) {
          // §5: gắn epoch của scope hiện tại vào snapshot. Đổi scope sau này →
          // epoch tăng → TableExportMenu vô hiệu nút Xuất của bảng scope cũ (chỉ
          // ràng buộc khi bảng thuộc phạm vi báo cáo, tức đang có scope token).
          const scopeEpoch = getScopeToken()
            ? useWorkReportScopeStore.getState().dataEpoch
            : undefined;
          patchMessage(convIdSnapshot, assistantMessage.id, {
            exportableTable: true,
            exportId: response.export_id,
            exportSessionId: response.session_id || serverSessionId || undefined,
            ...(scopeEpoch !== undefined && { scopeEpoch }),
          });
        } else if (response.exportable_table) {
          patchMessage(convIdSnapshot, assistantMessage.id, {
            exportableTable: true,
          });
        }

        // Cập nhật serverSessionId nếu backend trả về session_id mới.
        // Guard: bỏ qua nếu ID mới chỉ là wrapper của ID cũ (backend double-prefix bug:
        // "personal-X-personal-X-uuid" khi nhận "personal-X-uuid" mà Redis đã hết hạn).
        if (
          response.session_id &&
          response.session_id !== serverSessionId &&
          !(serverSessionId && response.session_id.endsWith(serverSessionId))
        ) {
          updateServerSessionId(convIdSnapshot, response.session_id);
        }
      } catch (err) {
        // §5/§7: 400 (chưa chọn scope) / 403 (token hỏng, quyền bị thu hồi) → mở
        // lại widget chọn scope thay vì báo lỗi đỏ. KHÔNG tự gửi lại câu hỏi:
        // handleScopeErrorStatus(403) đã clearSelection (xóa token lỗi) nên
        // `selected` null → effect gửi-lại-sau-khi-chọn KHÔNG chạy tới khi user
        // chủ động chọn lại. Câu hỏi giữ trong pendingQuestion để gửi sau khi chọn.
        // BE từ chối giữa stream và đã nói rõ lý do → hiện đúng câu của BE.
        // Với ATTACHMENT_MODE_REJECTED, GIỮ NGUYÊN chip tệp và ô nhập để user tự
        // chọn lại luồng; FE không tự chuyển tệp sang Sources hay báo cáo.
        if (err instanceof AiStreamError) {
          // NGOẠI LỆ: tệp không còn trên BE thì chip đang trỏ vào ID chết. Giữ nó
          // lại là mọi câu hỏi sau trong hội thoại đều hỏng đúng kiểu này, user
          // không hiểu vì sao và cũng không có cách nào thoát ngoài xoá tay.
          if (isAttachmentGoneError(err)) {
            attachmentIds.forEach((id) => removeAttachment(convIdSnapshot, id));
          }
          finalizeMessage(convIdSnapshot, err.message);
          markMessageError(convIdSnapshot);
          return;
        }

        if (
          err instanceof PersonalAiError &&
          err.kind === "http" &&
          handleScopeErrorStatus(err.status)
        ) {
          // Hủy request đang treo (nếu còn) — dừng loading, không để stream dở dang.
          controller.abort();
          setIsStreaming(false);
          useWorkReportScopeStore.getState().requirePick(trimmed);
          patchMessage(convIdSnapshot, assistantMessage.id, {
            content: "",
            scopeRequired: true,
            isStreaming: false,
            thinkingPhase: null,
          });
          return;
        }

        const content =
          err instanceof PersonalAiError
            ? err.kind === "timeout"
              ? "Yêu cầu quá thời gian. Vui lòng thử lại."
              : err.kind === "network"
                ? "Lỗi kết nối. Vui lòng kiểm tra mạng và thử lại."
                : err.status === 401
                  ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                  : err.status === 503
                    ? "Hệ thống chưa xác nhận được quyền báo cáo. Vui lòng thử lại."
                    : "Đã xảy ra lỗi. Vui lòng thử lại."
            : "Đã xảy ra lỗi không xác định.";

        finalizeMessage(convIdSnapshot, content);
        markMessageError(convIdSnapshot);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      activeConversationId,
      conversations,
      selectedDocumentIds,
      documents,
      user,
      createConversation,
      addMessage,
      appendToken,
      finalizeMessage,
      setMessageThinkingPhase,
      markMessageError,
      patchMessage,
      updateServerSessionId,
      startDraftPolling,
      stopDraftPolling,
      removeAttachment,
    ],
  );

  /**
   * §3: sau khi user chọn xong scope, gửi lại chính câu hỏi đang hoãn kèm
   * `scope_token` (service tự lấy token từ store). Chỉ chạy khi widget đã đóng
   * (`isPicking === false`) và đã có `selected` — tránh gửi lại lúc đang chọn.
   */
  const scopeSelected = useWorkReportScopeStore((s) => s.selected);
  const scopeIsPicking = useWorkReportScopeStore((s) => s.isPicking);
  const scopePendingQuestion = useWorkReportScopeStore((s) => s.pendingQuestion);

  useEffect(() => {
    if (!scopeSelected || scopeIsPicking || !scopePendingQuestion || isStreaming) return;
    // Lượt đang treo là NỘP FILE (§2.5) → effect nộp lại bên dưới lo, không gửi
    // câu hỏi này qua chat (sẽ mất file và chạy nhầm luồng).
    if (pendingLevelReportFile.current) return;
    // §4 (2.2): đây là lượt DUY NHẤT được phép đính token — nó thuộc đúng lần
    // hỏi vừa chốt. Truyền `tokenPromptId` để `isTokenValidFor` nhận ra; user gõ
    // lại y hệt câu đó sau này không có promptId nên sẽ bị nhả token.
    const { tokenPromptId } = useWorkReportScopeStore.getState();
    // Xóa câu hỏi hoãn TRƯỚC khi gửi để effect không chạy lại thành vòng lặp.
    useWorkReportScopeStore.setState({ pendingQuestion: null });
    void sendMessage(scopePendingQuestion, tokenPromptId ?? undefined);
  }, [scopeSelected, scopeIsPicking, scopePendingQuestion, isStreaming, sendMessage]);

  /**
   * Trả `true` khi BE đã nhận file (HTTP 2xx) — contract 07/08/26 §7.10: caller
   * CHỈ được xoá tệp đang chờ sau khi biết chắc đã nộp được. Trước đây trang gọi
   * xoá tệp ngay lúc bấm Gửi, nên mọi lỗi (sai form, sai tuần, hết phiên) đều
   * bắt user đi tìm và đính lại file.
   */
  const sendWithFile = useCallback(
    async (question: string, file: File): Promise<boolean> => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return false;

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      const convIdSnapshot = conversationId;
      const fileServerSessionId =
        usePersonalAiStore.getState().conversations.find((c) => c.id === conversationId)
          ?.serverSessionId ?? null;

      // Tệp KHÔNG kèm lệnh nộp báo cáo → hỏi đáp tệp tạm, không đụng endpoint
      // báo cáo lẫn Sources. Định tuyến bằng parser lệnh chứ không dò `#` thô.
      //
      // Nhánh này KHÔNG tự dựng bong bóng: nó uỷ thác cho `sendMessage`, mà
      // `sendMessage` tự thêm cặp user+assistant của nó. Dựng thêm ở đây thì câu
      // hỏi hiện HAI lần và bong bóng đầu kẹt mãi ở "Đang tìm kiếm trong tài
      // liệu..." (không ai finalize nó).
      if (!isReportSubmissionText(trimmed)) {
        // Sources đang bật + tệp thường = hai nguồn tranh nhau. Bắt user chọn rõ
        // MODE thay vì tự tắt Sources giúp họ: tắt ngầm đúng thứ request cấm, và
        // user sẽ không hiểu vì sao câu trả lời bỏ qua nguồn họ đã tick.
        if (selectedDocumentIds.length > 0) {
          addMessage(conversationId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Bạn đang chọn nguồn trong Sources. Hỏi đáp tệp đính kèm không dùng " +
              "chung với Sources — vui lòng bỏ chọn nguồn trong Sources, hoặc mở " +
              "hội thoại mới rồi gửi lại tệp.",
            timestamp: new Date(),
            isError: true,
          });
          // Giữ nguyên tệp + câu hỏi để user chọn lại luồng, không nuốt mất file.
          return false;
        }

        setIsStreaming(true);
        const uploadController = new AbortController();
        abortRef.current = uploadController;
        let uploaded: PersonalAttachment;
        try {
          uploaded = await uploadPersonalAttachment(
            file,
            fileServerSessionId ?? convIdSnapshot,
            { signal: uploadController.signal },
          );
          // Chỉ sau 2xx có attachment_id mới ghi chip, và ghi theo ĐÚNG hội thoại.
          addAttachment(convIdSnapshot, uploaded);
          // Gắn hội thoại vào ĐÚNG session BE đã cất tệp. Hội thoại mới chưa có
          // serverSessionId nên tệp được upload dưới id cục bộ; không nhận session
          // thật về đây thì lượt hỏi ngay sau gửi `new_conversation: true` → BE mở
          // session KHÁC → "Không tìm thấy tệp đính kèm" ngay câu hỏi ĐẦU TIÊN.
          if (uploaded.session_id && uploaded.session_id !== fileServerSessionId) {
            updateServerSessionId(convIdSnapshot, uploaded.session_id);
          }
        } catch (err) {
          addMessage(convIdSnapshot, {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              err instanceof PersonalAiError && err.kind === "http"
                ? err.message
                : UPLOAD_CONNECTION_ERROR,
            timestamp: new Date(),
            isError: true,
          });
          setIsStreaming(false);
          abortRef.current = null;
          return false;
        }
        // Nhả cờ TRƯỚC khi gửi: `sendMessage` bỏ qua lượt gửi khi `isStreaming`
        // còn bật (guard đầu hàm) — quên nhả là câu hỏi biến mất không dấu vết.
        setIsStreaming(false);
        abortRef.current = null;
        // Chip đã vào store; `sendMessage` đọc TƯƠI từ store nên thấy được
        // `attachment_ids` của lượt này. Kèm tên tệp để bong bóng user hiện chip.
        await sendMessage(trimmed, undefined, {
          name: uploaded.filename,
          pages: uploaded.pages,
        });
        // Hỏi xong thì tệp RỜI ô nhập (kiểu ChatGPT): nó đã thuộc về lượt hỏi vừa
        // gửi và hiện trong bong bóng user. Treo lại ở composer khiến mọi câu hỏi
        // sau vô tình gửi kèm tệp cũ, và khi tệp hết hạn thì cả hội thoại kẹt ở
        // lỗi "Không tìm thấy tệp đính kèm..." không có đường thoát.
        removeAttachment(convIdSnapshot, uploaded.attachment_id);
        return true;
      }

      const userMessage: PersonalChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: `[Tệp đính kèm: ${file.name}]\n\n${trimmed}`,
        timestamp: new Date(),
      };
      addMessage(conversationId, userMessage);

      const assistantId = crypto.randomUUID();
      const assistantMessage: PersonalChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase: "searching",
      };
      addMessage(conversationId, assistantMessage);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const response = await uploadPersonalWeeklyReport(
          file,
          {
            question: trimmed,
            session_id: fileServerSessionId ?? undefined,
            employee_code: user?.employeeCode ?? user?.employee_code ?? "",
            employee_name:
              user?.fullNameFromHr ??
              user?.fullNameFromHR ??
              user?.displayName ??
              user?.username ??
              "",
            department: user?.departmentName ?? "",
            company:
              user?.companyName ?? user?.company_name ?? user?.orgUnit ?? "",
            week_start: "",
            week_end: "",
          },
          { signal: controller.signal },
        );

        const answerText =
          (response.answer && response.answer.trim()) ||
          `Đã nhận tệp "${file.name}". Bạn muốn hỏi gì thêm?`;

        const citations = response.sources
          ?.filter((s) => s.document_id != null)
          .map((s) => ({
            document_id: s.document_id!,
            document_name: s.document_name ?? s.source_name ?? s.source_file ?? "",
            page: s.page_number,
            citation_index: s.citation_index,
          }));
        finalizeMessage(convIdSnapshot, answerText, citations);

        if (response.session_id && response.session_id !== fileServerSessionId) {
          updateServerSessionId(convIdSnapshot, response.session_id);
        }
        return true;
      } catch (err) {
        // Contract 07/08/26 §4: có HTTP response → hiện NGUYÊN VĂN lý do BE trả
        // (err.failure.message đã ưu tiên detail.message → detail → message →
        // error → fallback theo status). Chỉ mất mạng/timeout mới dùng câu
        // "không kết nối được" — và câu đó phải nói rõ báo cáo CHƯA được ghi nhận.
        const content =
          err instanceof AiApiError
            ? err.kind === "http" && err.failure
              ? withRetryAfterHint(err.failure)
              : UPLOAD_CONNECTION_ERROR
            : UPLOAD_CONNECTION_ERROR;

        finalizeMessage(convIdSnapshot, content);
        markMessageError(convIdSnapshot);
        return false;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      activeConversationId,
      user,
      createConversation,
      addMessage,
      finalizeMessage,
      markMessageError,
      updateServerSessionId,
      selectedDocumentIds,
      addAttachment,
      removeAttachment,
      sendMessage,
    ],
  );

  /**
   * Nộp file bản báo cáo CẤP (#TBP_baocao / #LDDV_baocao kèm .xlsx) qua
   * endpoint riêng /api/level-reports/upload. Khác #congviectuan: BE tự suy
   * quyền/phạm vi từ JWT và tự thay bản cũ nếu nộp lại cùng tuần — FE chỉ hiện
   * `message` trả về.
   *
   * `scopeToken` chỉ do effect nộp-lại-sau-khi-chọn truyền vào (§2.5) — lượt nộp
   * đầu luôn gửi trần để BE tự bind nếu chỉ có một phạm vi (§2.4), hoặc trả về
   * danh sách phạm vi để FE mở dropdown mà không mất file.
   */
  const sendLevelReportWithFile = useCallback(
    async (question: string, file: File, scopeToken?: string): Promise<boolean> => {
      const trimmed = question.trim();
      if (!trimmed || isStreaming) return false;

      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = createConversation();
      }

      // §6: KIỂM SOÁT UI trước khi nộp (không chỉ dựa vào BE báo lỗi).
      //  • #TCT_tonghop chỉ tổng hợp — KHÔNG nộp được → chặn thẳng.
      //  • #TBP chỉ DEPARTMENT+SUBMIT, #LDDV chỉ ORG_UNIT+SUBMIT.
      const submitCapability = capabilityForTag(trimmed);

      // §2.6: PRE-FLIGHT `/scopes` TRƯỚC khi gửi file. Bản 2.5 cố ý nộp trần rồi
      // để BE trả 400 kèm `detail.scopes`, nhưng như vậy mỗi lượt nộp đẩy TOÀN BỘ
      // file qua mạng hai lần (400 → chọn phạm vi → 200). File mẫu vài KB không
      // sao; báo cáo thật vài MB trên mạng công ty chậm thì gấp đôi thời gian chờ
      // và là nguồn của những request bị huỷ giữa chừng. BE không tự chặn sớm
      // được: HTTP không cho từ chối trước khi client gửi xong thân request.
      //
      // Nhánh lỗi 400/403 kèm `detail.scopes` bên dưới GIỮ NGUYÊN — nó vẫn là
      // đường lùi khi token hết hạn giữa chừng hoặc pre-flight không chạy được.
      if (submitCapability && !scopeToken) {
        const scopeStore = useWorkReportScopeStore.getState();
        scopeStore.ensureScopeKey(user?.id ?? "", submitCapability);
        try {
          const res = await fetchWorkReportScopes({ capability: submitCapability });
          const decision = decideScopePreflight(res);
          if (decision.kind === "deny") {
            addMessage(conversationId, {
              id: crypto.randomUUID(),
              role: "assistant",
              content:
                "Bạn không có phạm vi phù hợp để nộp báo cáo này. Vui lòng liên hệ quản trị nếu cần cấp quyền.",
              timestamp: new Date(),
              isStreaming: false,
            });
            return false;
          }
          if (decision.kind === "pick") {
            // ≥2 phạm vi → hỏi TRƯỚC khi tốn băng thông. Giữ file trong memory;
            // effect nộp-lại-sau-khi-chọn gửi đúng lượt này kèm token đã chọn.
            scopeStore.setScopes(decision.scopes, res.capability);
            scopeStore.requirePick(trimmed, res.capability, res.promptId);
            pendingLevelReportFile.current = { question: trimmed, file };
            addMessage(conversationId, {
              id: crypto.randomUUID(),
              role: "user",
              content: `[Tệp đính kèm: ${file.name}]\n\n${trimmed}`,
              timestamp: new Date(),
            });
            addMessage(conversationId, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "",
              timestamp: new Date(),
              isStreaming: false,
              scopeRequired: true,
            });
            // Chưa nộp được — file đang giữ trong `pendingLevelReportFile` để
            // effect nộp-lại lo. Trả false để trang KHÔNG xoá chip tệp: user còn
            // thấy mình đang nộp cái gì trong lúc chọn phạm vi.
            return false;
          }
          // `auto`: đúng MỘT phạm vi → BE tự bind, gửi thẳng KHÔNG kèm token (§2.4).
        } catch (err) {
          // Flag đa-scope tắt (404) → luồng cũ, nộp thẳng. Lỗi khác → cũng nộp
          // thẳng và để nhánh 400/403 kèm `detail.scopes` bên dưới lo, thay vì
          // chặn user vì một pre-flight tối ưu băng thông không chạy được.
          if (!(err instanceof ScopeFeatureDisabledError) && err instanceof ScopeFetchError) {
            logger.info("usePersonalChat", "level-report-preflight-failed", {
              capability: submitCapability,
              status: err.status,
            });
          }
        }
      }

      const scope = scopeToken
        ? useWorkReportScopeStore.getState().selected
        : null;
      if (submitCapability && scope && !canSubmitLevelReport(trimmed, scope)) {
        addMessage(conversationId, {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Phạm vi đang chọn không cho phép nộp báo cáo cấp này. Vui lòng chọn đúng phạm vi (phòng ban cho #TBP_baocao, đơn vị cho #LDDV_baocao).",
          timestamp: new Date(),
          isStreaming: false,
        });
        return false;
      }

      addMessage(conversationId, {
        id: crypto.randomUUID(),
        role: "user",
        content: `[Tệp đính kèm: ${file.name}]\n\n${trimmed}`,
        timestamp: new Date(),
      });

      const assistantId = crypto.randomUUID();
      addMessage(conversationId, {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
        thinkingPhase: "searching",
      });

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);
      const convIdSnapshot = conversationId;

      try {
        const response = await uploadLevelReport(
          file,
          { question: trimmed, scopeToken },
          { signal: controller.signal },
        );
        finalizeMessage(convIdSnapshot, response.message);
        // §4: token chỉ sống trong đúng vòng "BE hỏi → user chọn → nộp lại".
        if (scopeToken) useWorkReportScopeStore.getState().releaseScopeToken();
        return true;
      } catch (err) {
        // §2.5: lỗi mang sẵn danh sách phạm vi → mở dropdown NGAY, giữ file trong
        // memory (`pendingLevelReportFile`) để effect bên dưới nộp lại chính lượt
        // này sau khi user chọn. Không gọi `/scopes`, không bắt đính lại tệp.
        if (err instanceof LevelReportScopeRequiredError) {
          const scopeStore = useWorkReportScopeStore.getState();
          scopeStore.ensureScopeKey(user?.id ?? "", err.scope.capability ?? submitCapability!);
          scopeStore.setScopes(err.scope.scopes, err.scope.capability ?? submitCapability);
          scopeStore.requirePick(trimmed, err.scope.capability, err.scope.promptId);
          pendingLevelReportFile.current = { question: trimmed, file };
          patchMessage(convIdSnapshot, assistantId, {
            content: err.message,
            scopeRequired: true,
            isStreaming: false,
            thinkingPhase: null,
          });
          return false;
        }

        // BE bản cũ (chưa ship 2.5) hoặc đường lùi khi không ký được token:
        // `detail` vẫn là chuỗi → giữ xử lý cũ, gọi lại `/scopes` qua widget.
        if (
          err instanceof PersonalAiError &&
          err.kind === "http" &&
          scopeToken &&
          handleScopeErrorStatus(err.status)
        ) {
          finalizeMessage(
            convIdSnapshot,
            "Phạm vi báo cáo không còn hiệu lực. Vui lòng chọn lại phạm vi rồi nộp lại tệp.",
          );
          return false;
        }

        // Contract 07/08/26 §4: HTTP lỗi → hiện NGUYÊN VĂN lý do BE trả.
        // `PersonalAiError.message` đã là `detail.message`/`detail` đọc từ body
        // (xem `parseHttpErrorMessage`); các câu cứng theo status trước đây đè
        // mất lý do thật ("File này là BẢN NHÁP AI…", "Bạn chưa có quyền nộp
        // #TBP_baocao cho bộ phận này." → chỉ còn "Bạn không có quyền…").
        //
        // Riêng 401 giữ câu của FE: tới đây là 401 SAU khi `uploadLevelReport`
        // đã tự làm mới token và gửi lại (§2.6) — tức hết phiên thật. Câu của BE
        // không nói được điều đó, và user cần biết tệp CHƯA được nộp.
        const content =
          err instanceof PersonalAiError
            ? err.kind !== "http"
              ? UPLOAD_CONNECTION_ERROR
              : err.status === 401
                ? "Phiên đăng nhập đã hết hạn. Tệp CHƯA được nộp — vui lòng đăng nhập lại rồi nộp lại tệp."
                : err.message?.trim() || fallbackUploadMessage(err.status)
            : UPLOAD_CONNECTION_ERROR;
        finalizeMessage(convIdSnapshot, content);
        markMessageError(convIdSnapshot);
        return false;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [
      isStreaming,
      activeConversationId,
      createConversation,
      addMessage,
      finalizeMessage,
      markMessageError,
      patchMessage,
      user?.id,
    ],
  );

  /**
   * §2.5: user vừa chọn phạm vi cho một lượt NỘP FILE đang treo → nộp lại chính
   * lượt đó bằng file còn trong memory, kèm token vừa chọn. Không hỏi lại file.
   */
  useEffect(() => {
    const pending = pendingLevelReportFile.current;
    if (!pending) return;
    // User bấm "Hủy" trên widget (đóng dropdown mà không chọn) → bỏ lượt nộp,
    // không giữ File treo trong memory chờ một lựa chọn không bao giờ tới.
    if (!scopeIsPicking && !scopeSelected) {
      pendingLevelReportFile.current = null;
      return;
    }
    if (!scopeSelected || scopeIsPicking || isStreaming) return;
    pendingLevelReportFile.current = null;
    // Câu hỏi hoãn thuộc lượt nộp file này, không phải lượt chat — xóa để effect
    // gửi-lại-chat ở trên không gửi trùng cùng một câu.
    useWorkReportScopeStore.setState({ pendingQuestion: null });
    void sendLevelReportWithFile(
      pending.question,
      pending.file,
      scopeSelected.selectionToken,
    );
  }, [scopeSelected, scopeIsPicking, isStreaming, sendLevelReportWithFile]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  return {
    messages,
    isStreaming,
    isLoadingHistory,
    sendMessage,
    sendWithFile,
    sendLevelReportWithFile,
    stopStreaming,
    /** Nút "Kiểm tra lại" sau khi hết hạn chờ — poll tiếp ĐÚNG job cũ. */
    resumeDraftPolling: startDraftPolling,
  };
}
