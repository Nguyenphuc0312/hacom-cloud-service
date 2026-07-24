/**
 * `listAllEvents` gom đủ mọi trang. hr-api trả 20 event/trang (PaginationDto:
 * pageSize=20, trần 100) trong khi lịch không có UI phân trang — thiếu bước gom
 * này thì event từ #21 trở đi biến mất im lặng khỏi lưới.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("./hrApi", () => ({
  hrApiClient: { get: (...args: unknown[]) => get(...args) },
}));

vi.mock("../../utils/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeItem = (id: string) => ({ id, title: `ev-${id}` });

/** Response envelope y như hr-api thật: { data: { items, pagination } }. */
const page = (ids: string[], pageNo: number, totalPages: number, total: number) => ({
  data: {
    data: {
      items: ids.map(makeItem),
      pagination: {
        page: pageNo,
        pageSize: 100,
        total,
        totalPages,
        hasNextPage: pageNo < totalPages,
        hasPreviousPage: pageNo > 1,
      },
    },
  },
});

describe("hrCalendarApi.listAllEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gom đủ event qua nhiều trang", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get
      .mockResolvedValueOnce(page(["1", "2"], 1, 3, 6))
      .mockResolvedValueOnce(page(["3", "4"], 2, 3, 6))
      .mockResolvedValueOnce(page(["5", "6"], 3, 3, 6));

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" });

    expect(get).toHaveBeenCalledTimes(3);
    expect(res.data.map((e) => e.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("chỉ gọi 1 lần khi dữ liệu gọn trong một trang", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get.mockResolvedValueOnce(page(["1", "2"], 1, 1, 2));

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" });

    expect(get).toHaveBeenCalledTimes(1);
    expect(res.data).toHaveLength(2);
  });

  it("xin pageSize tối đa (100) để giảm số vòng gọi", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get.mockResolvedValueOnce(page(["1"], 1, 1, 1));

    await hrCalendarApi.listAllEvents({ scope: "mine" });

    expect(String(get.mock.calls[0][0])).toContain("pageSize=100");
  });

  it("dừng ở maxPages, không lặp vô hạn khi BE trả pagination lỗi", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    // hasNextPage luôn true → phải bị van an toàn chặn lại.
    get.mockResolvedValue(page(["x"], 1, 999, 999));

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" }, 3);

    expect(get).toHaveBeenCalledTimes(3);
    expect(res.data).toHaveLength(3);
  });

  // Mất event âm thầm là loại lỗi khó truy nhất — chạm trần thì phải KÊU TO.
  it("đánh dấu truncated khi bị cắt bớt vì chạm maxPages", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get.mockResolvedValue(page(["x"], 1, 999, 999));

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" }, 2);

    expect(res.truncated).toBe(true);
  });

  it("không đánh dấu truncated khi đã lấy đủ", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get
      .mockResolvedValueOnce(page(["1"], 1, 2, 2))
      .mockResolvedValueOnce(page(["2"], 2, 2, 2));

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" }, 20);

    expect(res.truncated).toBe(false);
    expect(res.data).toHaveLength(2);
  });

  it("không gom thêm khi tài khoản chưa liên kết hồ sơ NS", async () => {
    const { hrCalendarApi } = await import("./hrCalendarApi");
    get.mockResolvedValueOnce({
      data: {
        data: {
          mode: "NO_HR_PROFILE",
          items: [],
          pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
        },
      },
    });

    const res = await hrCalendarApi.listAllEvents({ scope: "mine" });

    expect(get).toHaveBeenCalledTimes(1);
    expect(res.mode).toBe("NO_HR_PROFILE");
  });
});
