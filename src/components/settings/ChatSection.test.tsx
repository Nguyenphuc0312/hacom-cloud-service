import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSection } from "./ChatSection";

const updateSettings = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = {
        "chat.title": "Tin nhắn",
        "chat.description": "Tùy chỉnh hành vi khi đọc và gửi tin nhắn.",
        "chat.autoScroll": "Tự cuộn khi có tin mới",
        "chat.autoScrollDesc": "Tự động cuộn đến tin nhắn mới nhất.",
        "chat.enterKeyLabel": "Hành vi phím Enter",
        "chat.enterSend": "Enter để gửi",
        "chat.enterSendDesc": "Nhấn Enter để gửi.",
        "chat.enterNewline": "Enter để xuống dòng",
        "chat.enterNewlineDesc": "Nhấn Ctrl + Enter để gửi.",
        "chat.saveSearchHistory": "Lưu lịch sử tìm kiếm",
        "chat.saveSearchHistoryDesc": "Ghi nhớ lịch sử tìm kiếm.",
        "chat.downloadFolder.cardTitle": "File tải về",
        "chat.downloadFolder.label": "File được lưu tại thư mục",
        "chat.downloadFolder.description": "File bạn tải về sẽ tự động lưu vào thư mục này.",
        "chat.downloadFolder.loading": "Đang xác định thư mục lưu…",
        "chat.downloadFolder.browserPath": "Do trình duyệt quản lý",
        "chat.downloadFolder.browserDescription": "Trình duyệt không cho ứng dụng đọc hoặc chọn thư mục tải xuống.",
        "chat.downloadFolder.unsupportedPath": "Chưa hỗ trợ trên phiên bản desktop này",
        "chat.downloadFolder.unsupportedDescription": "Cập nhật ứng dụng desktop để chọn thư mục tải file mặc định.",
        "chat.downloadFolder.readError": "Không thể đọc thư mục tải về hiện tại.",
        "chat.downloadFolder.chooseError": "Không thể thay đổi thư mục tải về.",
        "chat.downloadFolder.change": "Thay đổi",
        "chat.downloadFolder.choosing": "Đang chọn…",
        "chat.downloadFolder.changeHint": "Chọn thư mục mặc định cho file tải về",
        "chat.downloadFolder.browserChangeHint": "Chỉ khả dụng trên ứng dụng desktop",
      };
      return messages[key] ?? key;
    },
  }),
}));

vi.mock("../../settings", () => ({
  useSettingsSection: () => ({
    autoScrollOnNewMessage: true,
    enterKeyAction: "send",
    saveSearchHistory: true,
  }),
  useUpdateSettings: () => updateSettings,
}));

describe("ChatSection download folder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "chatDesktop");
  });

  it("truthfully keeps the download location under browser control", () => {
    render(<ChatSection />);

    expect(screen.getByText("Do trình duyệt quản lý")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Thay đổi" }),
    ).toBeDisabled();
  });

  it("loads and changes the desktop default download folder", async () => {
    const files = {
      exists: vi.fn(),
      open: vi.fn(),
      reveal: vi.fn(),
      save: vi.fn(),
      getDownloadDirectory: vi
        .fn()
        .mockResolvedValue({ ok: true, path: "C:\\Users\\Minh\\Downloads" }),
      chooseDownloadDirectory: vi
        .fn()
        .mockResolvedValue({ ok: true, path: "D:\\Hacom files" }),
    };
    Object.defineProperty(window, "chatDesktop", {
      configurable: true,
      value: { files },
    });
    const user = userEvent.setup();

    render(<ChatSection />);

    expect(
      await screen.findByText("C:\\Users\\Minh\\Downloads"),
    ).toBeVisible();
    const changeButton = screen.getByRole("button", { name: "Thay đổi" });
    await waitFor(() => expect(changeButton).toBeEnabled());
    await user.click(changeButton);

    await waitFor(() => {
      expect(files.chooseDownloadDirectory).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("D:\\Hacom files")).toBeVisible();
  });
});
