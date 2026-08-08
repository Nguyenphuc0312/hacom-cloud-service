import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersonalChat } from "./usePersonalChat";
import { usePersonalAiStore } from "../stores/personalAiStore";
import { useWorkReportScopeStore } from "../stores/workReportScopeStore";
import { AiStreamError } from "../api/personalAiApi";

/**
 * Hỏi đáp tệp đính kèm TẠM (FE__personal-general-attachment__request__07-08-26).
 *
 * Bug thật gặp trên máy user 08/08/26: đính .docx + "tom tắt file cho tôi" thì
 * BE trả "vui lòng gửi file cần tóm tắt" dù chip đã hiện "47 trang · Hỏi đáp
 * tạm", và câu hỏi hiện HAI lần với một bong bóng kẹt ở "Đang tìm kiếm...".
 *
 * Nguyên nhân: `sendWithFile` gọi `addAttachment` (ghi store) rồi `sendMessage`
 * ngay trong cùng một lượt, nhưng `sendMessage` đọc `conversations` từ CLOSURE
 * của render trước → chưa thấy chip → `attachment_ids` rỗng. Test chạy hook
 * thật + store thật, chỉ mock lớp mạng, vì đúng chỗ hỏng là ranh giới
 * closure/store mà test đơn vị của api/store không chạm tới.
 */

const uploadPersonalAttachmentMock = vi.fn();
const streamPersonalChatMock = vi.fn();

vi.mock("../api/personalAiApi", async () => {
  const actual = await vi.importActual<typeof import("../api/personalAiApi")>(
    "../api/personalAiApi",
  );
  return {
    ...actual,
    uploadPersonalAttachment: (...args: unknown[]) =>
      uploadPersonalAttachmentMock(...args),
    streamPersonalChat: (...args: unknown[]) => streamPersonalChatMock(...args),
    // Hàm thường, KHÔNG phải vi.fn(): `clearAllMocks` ở beforeEach sẽ xoá
    // mockResolvedValue của vi.fn() và biến nó thành trả undefined.
    listPersonalAttachments: async () => [],
  };
});

vi.mock("../../../stores/authStore", () => ({
  useAuthStore: (
    selector: (state: { user: { id: string; employeeCode: string } }) => unknown,
  ) => selector({ user: { id: "u1", employeeCode: "HC000001" } }),
}));

vi.mock("../../ai-assistant/services/aiChatApi", async () => {
  const actual = await vi.importActual<
    typeof import("../../ai-assistant/services/aiChatApi")
  >("../../ai-assistant/services/aiChatApi");
  return {
    ...actual,
    // Không có lịch sử để tải — test chỉ quan tâm lượt hỏi mới.
    fetchPersonalSessionMessages: vi.fn().mockResolvedValue([]),
  };
});

const FILE = new File(["noi dung"], "1671020230_DAUCAOMINHNHAT.docx");

beforeEach(() => {
  vi.clearAllMocks();
  useWorkReportScopeStore.getState().reset();
  // `selectedDocumentIds` phải reset cùng: test "Sources đang bật" set nó và
  // Zustand giữ nguyên giữa các test → test sau bị chặn ở nhánh Sources.
  usePersonalAiStore.setState({
    conversations: [],
    activeConversationId: null,
    selectedDocumentIds: [],
  });
  uploadPersonalAttachmentMock.mockResolvedValue({
    attachment_id: "pga-1",
    filename: "1671020230_DAUCAOMINHNHAT.docx",
    pages: 47,
    mode: "personal_attachment_general",
    // BE gắn tệp vào session THẬT này (khác id cục bộ FE dùng lúc upload).
    session_id: "personal-HC1-real",
  });
  streamPersonalChatMock.mockResolvedValue({
    session_id: "personal-HC1-abc",
    answer: "Tóm tắt tài liệu…",
    mode: "personal_attachment_general",
  });
});

describe("usePersonalChat — hỏi đáp tệp đính kèm tạm", () => {
  it("gửi attachment_ids của tệp vừa upload (không đọc snapshot cũ của closure)", async () => {
    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendWithFile("tom tắt file cho tôi", FILE);
    });

    expect(uploadPersonalAttachmentMock).toHaveBeenCalledTimes(1);
    expect(streamPersonalChatMock).toHaveBeenCalledTimes(1);

    // Đây là dòng bắt đúng bug: trước khi sửa, attachment_ids không tồn tại nên
    // BE coi như hỏi chay và trả "vui lòng gửi file".
    const body = streamPersonalChatMock.mock.calls[0][0];
    expect(body.attachment_ids).toEqual(["pga-1"]);
    // Tệp tạm và Sources không bao giờ đi cùng nhau.
    expect(body.sources_enabled).toBe(false);
    expect(body.document_ids).toEqual([]);
  });

  it("chỉ thêm MỘT cặp bong bóng — không nhân đôi câu hỏi, không để bong bóng kẹt", async () => {
    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendWithFile("tom tắt file cho tôi", FILE);
    });

    const conv = usePersonalAiStore.getState().conversations[0];
    const userMsgs = conv.messages.filter((m) => m.role === "user");
    const assistantMsgs = conv.messages.filter((m) => m.role === "assistant");

    expect(userMsgs).toHaveLength(1);
    expect(assistantMsgs).toHaveLength(1);
    // Không còn bong bóng nào treo cờ streaming (triệu chứng "Đang tìm kiếm…" mãi).
    expect(conv.messages.some((m) => m.isStreaming)).toBe(false);
  });

  it("gắn tên tệp vào bong bóng user (chip), KHÔNG nhét vào nội dung câu hỏi", async () => {
    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendWithFile("tom tắt file cho tôi", FILE);
    });

    const conv = usePersonalAiStore.getState().conversations[0];
    const userMsg = conv.messages.find((m) => m.role === "user")!;

    expect(userMsg.attachedFile).toMatchObject({
      name: "1671020230_DAUCAOMINHNHAT.docx",
      pages: 47,
    });
    // Câu hỏi gửi lên BE phải sạch — không có tiền tố "[Tệp đính kèm: ...]".
    expect(userMsg.content).toBe("tom tắt file cho tôi");
    expect(streamPersonalChatMock.mock.calls[0][0].question).toBe("tom tắt file cho tôi");
  });

  it("Sources đang bật → chặn và GIỮ tệp, không upload, không tắt Sources ngầm", async () => {
    // Phải có hội thoại SẴN rồi mới tick nguồn: `createConversation` xoá
    // `selectedDocumentIds` (nguồn thuộc phạm vi từng hội thoại).
    const convId = usePersonalAiStore.getState().createConversation();
    usePersonalAiStore.setState({
      activeConversationId: convId,
      selectedDocumentIds: ["doc-1"],
    });

    const { result } = renderHook(() => usePersonalChat());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.sendWithFile("tom tắt file cho tôi", FILE);
    });

    // false = trang giữ lại pendingFile để user chọn lại luồng.
    expect(accepted).toBe(false);
    expect(uploadPersonalAttachmentMock).not.toHaveBeenCalled();
    expect(streamPersonalChatMock).not.toHaveBeenCalled();
    // Sources vẫn nguyên — FE không được tự bỏ tick giúp user.
    expect(usePersonalAiStore.getState().selectedDocumentIds).toEqual(["doc-1"]);
  });

  it("hỏi ĐÚNG session BE đã cất tệp — không mở session mới làm mất tệp", async () => {
    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendWithFile("tóm tắt", FILE);
    });

    const body = streamPersonalChatMock.mock.calls[0][0];
    // Phải hỏi trên session BE trả về lúc upload…
    expect(body.session_id).toBe("personal-HC1-real");
    // …và KHÔNG được xin session mới: `new_conversation: true` khiến BE mở
    // session khác, tệp vừa upload nằm lại session cũ → "Không tìm thấy tệp".
    expect(body.new_conversation).toBeUndefined();
  });

  it("chip Ở LẠI sau khi hỏi và câu hỏi SAU vẫn gửi kèm tệp + hiện tệp ở bong bóng", async () => {
    const { result } = renderHook(() => usePersonalChat());

    await act(async () => {
      await result.current.sendWithFile("tóm tắt", FILE);
    });

    // Request mục 5: chip chỉ mất khi user bấm xoá (DELETE 2xx) hoặc hết hạn.
    const convId = usePersonalAiStore.getState().activeConversationId!;
    const convOf = () =>
      usePersonalAiStore.getState().conversations.find((c) => c.id === convId)!;
    expect(convOf().attachments ?? []).toHaveLength(1);

    // Câu hỏi THỨ HAI (không qua sendWithFile) vẫn phải mang attachment_ids…
    await act(async () => {
      await result.current.sendMessage("file này có gì");
    });
    expect(streamPersonalChatMock.mock.calls[1][0].attachment_ids).toEqual(["pga-1"]);

    // …và bong bóng của nó vẫn cho thấy đang hỏi về tệp nào (ảnh user: câu hỏi
    // thứ hai mất sạch dấu vết tệp dù câu trả lời vẫn dựa trên tệp đó).
    const userMsgs = convOf().messages.filter((m) => m.role === "user");
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs[1].attachedFile?.name).toBe("1671020230_DAUCAOMINHNHAT.docx");
  });

  it("upload lỗi → không gửi câu hỏi, không ghi chip", async () => {
    uploadPersonalAttachmentMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => usePersonalChat());

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.sendWithFile("tom tắt file cho tôi", FILE);
    });

    expect(accepted).toBe(false);
    expect(streamPersonalChatMock).not.toHaveBeenCalled();
    const conv = usePersonalAiStore.getState().conversations[0];
    expect(conv.attachments ?? []).toHaveLength(0);
  });
});
