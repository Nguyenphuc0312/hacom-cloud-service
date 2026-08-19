/**
 * Hai lỗi từng làm lịch "API trả về nhưng không hiện":
 *
 * 1. PHÂN TRANG — hr-api trả 20 event/trang (PaginationDto: pageSize=20, trần 100).
 *    Store gọi listEvents (1 trang) nên mọi event từ #21 biến mất im lặng: không
 *    lỗi, không log, lưới trống. Store phải dùng listAllEvents để gom đủ trang.
 *
 * 2. RACE — WeeklyCalendarWidget và CalendarPage dùng CHUNG store nhưng fetch 2
 *    range khác nhau (cộng interval 60s + refetch-on-focus). Response CŨ về trễ
 *    không được ghi đè response MỚI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEvents = vi.fn();
const listAllEvents = vi.fn();

vi.mock("../features/api/hrCalendarApi", () => ({
  hrCalendarApi: {
    listEvents: (...args: unknown[]) => listEvents(...args),
    listAllEvents: (...args: unknown[]) => listAllEvents(...args),
  },
}));

vi.mock("../utils/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const makeEvent = (id: string) => ({
  id,
  title: `event-${id}`,
  startAt: "2026-07-26T01:00:00.000Z",
  endAt: "2026-07-26T02:00:00.000Z",
  eventType: "MEETING",
  visibility: "PUBLIC",
  participants: [],
  ownerId: "emp-001",
});

/** Promise điều khiển được, để ép thứ tự trả về của 2 request song song. */
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("calendarStore — lấy đủ event (phân trang)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.setState({ events: [], mode: "my", isLoading: false });
  });

  it("dùng listAllEvents để không mất event ngoài trang đầu", async () => {
    const { useCalendarStore } = await import("./calendarStore");
    // 23 event như dữ liệu thật của user — trang đầu chỉ có 20.
    const all = Array.from({ length: 23 }, (_, i) => makeEvent(String(i + 1)));
    listAllEvents.mockResolvedValue({ data: all });

    await useCalendarStore.getState().fetchEvents("2026-01-01", "2026-08-31");

    expect(listAllEvents).toHaveBeenCalledTimes(1);
    // Không được gọi listEvents trực tiếp (chỉ trả 1 trang).
    expect(listEvents).not.toHaveBeenCalled();
    expect(useCalendarStore.getState().events).toHaveLength(23);
  });
});

describe("calendarStore — refetch nền không nhấp nháy", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.setState({ events: [], mode: "my", isLoading: false });
  });

  it("KHÔNG bật loading khi refetch nền mà lưới đã có dữ liệu", async () => {
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.setState({ events: [makeEvent("cu")] as never });

    const pending = deferred<{ data: unknown[] }>();
    listAllEvents.mockReturnValueOnce(pending.promise);

    const p = useCalendarStore
      .getState()
      .fetchEvents("A", "B", { background: true });

    // Đang bay mà vẫn không bật spinner → lưới không nhấp nháy.
    expect(useCalendarStore.getState().isLoading).toBe(false);

    pending.resolve({ data: [makeEvent("moi")] });
    await p;
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual(["moi"]);
  });

  it("VẪN bật loading khi refetch nền nhưng lưới còn trống (lần tải đầu)", async () => {
    const { useCalendarStore } = await import("./calendarStore");

    const pending = deferred<{ data: unknown[] }>();
    listAllEvents.mockReturnValueOnce(pending.promise);

    const p = useCalendarStore
      .getState()
      .fetchEvents("A", "B", { background: true });

    // Chưa có gì để nhìn → phải cho người dùng biết đang tải.
    expect(useCalendarStore.getState().isLoading).toBe(true);

    pending.resolve({ data: [] });
    await p;
  });

  it("bật loading cho fetch thường (đổi tháng)", async () => {
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.setState({ events: [makeEvent("cu")] as never });

    const pending = deferred<{ data: unknown[] }>();
    listAllEvents.mockReturnValueOnce(pending.promise);

    const p = useCalendarStore.getState().fetchEvents("A", "B");

    expect(useCalendarStore.getState().isLoading).toBe(true);

    pending.resolve({ data: [] });
    await p;
  });
});

describe("calendarStore — chống race khi 2 nơi cùng fetch", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.setState({ events: [], mode: "my", isLoading: false });
  });

  it("không để response CŨ về trễ ghi đè response MỚI", async () => {
    const { useCalendarStore } = await import("./calendarStore");

    const slowOld = deferred<{ data: unknown[] }>();
    const fastNew = deferred<{ data: unknown[] }>();
    listAllEvents
      .mockReturnValueOnce(slowOld.promise) // request #1 (cũ, về sau)
      .mockReturnValueOnce(fastNew.promise); // request #2 (mới, về trước)

    const p1 = useCalendarStore.getState().fetchEvents("A", "B");
    const p2 = useCalendarStore.getState().fetchEvents("C", "D");

    // Request MỚI về trước, mang event vừa tạo.
    fastNew.resolve({ data: [makeEvent("vua-tao")] });
    await p2;
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual([
      "vua-tao",
    ]);

    // Request CŨ về sau, mang dữ liệu cũ (chưa có event vừa tạo).
    slowOld.resolve({ data: [] });
    await p1;

    // Event vừa tạo PHẢI còn — nếu bị xoá thì đúng là bug "hiện rồi biến mất".
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual([
      "vua-tao",
    ]);
  });

  it("giữ nguyên cờ loading đúng khi request cũ về sau request mới", async () => {
    const { useCalendarStore } = await import("./calendarStore");

    const slowOld = deferred<{ data: unknown[] }>();
    const fastNew = deferred<{ data: unknown[] }>();
    listAllEvents
      .mockReturnValueOnce(slowOld.promise)
      .mockReturnValueOnce(fastNew.promise);

    const p1 = useCalendarStore.getState().fetchEvents("A", "B");
    const p2 = useCalendarStore.getState().fetchEvents("C", "D");

    fastNew.resolve({ data: [makeEvent("x")] });
    await p2;
    expect(useCalendarStore.getState().isLoading).toBe(false);

    slowOld.resolve({ data: [] });
    await p1;
    // Request cũ không được bật lại spinner sau khi request mới đã xong.
    expect(useCalendarStore.getState().isLoading).toBe(false);
  });
});

describe("calendarStore — rời trang lịch thì hết xem lịch người khác", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useCalendarStore } = await import("./calendarStore");
    useCalendarStore.getState().resetCalendarData();
  });

  it("resetCalendarData trả mode về 'my' và xoá người đang xem", async () => {
    const { useCalendarStore } = await import("./calendarStore");
    listAllEvents.mockResolvedValue({ data: [] });

    useCalendarStore.getState().setViewingUser("auth-cong", "Trần Đăng Công");
    expect(useCalendarStore.getState().mode).toBe("other");

    useCalendarStore.getState().resetCalendarData();

    const s = useCalendarStore.getState();
    expect(s.mode).toBe("my");
    expect(s.viewingUserId).toBeNull();
    expect(s.viewingUserName).toBeNull();
  });

  it("sau khi reset, fetch tiếp theo hỏi lịch CỦA MÌNH chứ không phải người kia", async () => {
    const { useCalendarStore } = await import("./calendarStore");
    listAllEvents.mockResolvedValue({ data: [] });

    useCalendarStore.getState().setViewingUser("auth-cong", "Trần Đăng Công");
    useCalendarStore.getState().resetCalendarData();
    listAllEvents.mockClear();

    // Đây là cú fetch mà WeeklyCalendarWidget ở màn chat gọi khi mount: nó
    // KHÔNG tự set mode, nên mode kẹt ở "other" là widget lặng lẽ tải lịch
    // người kia rồi gắn nhãn "Lịch tuần" như thể lịch mình.
    await useCalendarStore.getState().fetchEvents("2026-08-03", "2026-08-09");

    expect(listAllEvents).toHaveBeenCalledTimes(1);
    const arg = listAllEvents.mock.calls[0][0] as {
      scope: string;
      ownerAuthUserId?: string;
    };
    expect(arg.scope).toBe("mine");
    expect(arg.ownerAuthUserId).toBeUndefined();
  });
});
