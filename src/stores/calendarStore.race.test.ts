/**
 * Lịch "hiện xong rồi biến mất": WeeklyCalendarWidget và CalendarPage dùng CHUNG
 * useCalendarStore nhưng fetch với range KHÁC nhau, và widget còn có interval 60s
 * + refetch-on-focus. Khi tạo lịch xong, onSuccess refetch (range đúng) có thể bị
 * một request khác đang bay ghi đè → event vừa tạo biến mất khỏi lưới.
 *
 * Test này khoá hành vi chống-race của store: kết quả về TRỄ của request CŨ không
 * bao giờ được ghi đè kết quả của request MỚI hơn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEvents = vi.fn();

vi.mock("../features/api/hrCalendarApi", () => ({
  hrCalendarApi: {
    listEvents: (...args: unknown[]) => listEvents(...args),
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
    listEvents
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

    // Event vừa tạo PHẢI còn — nếu bị xoá thì đây đúng là bug "hiện rồi biến mất".
    expect(useCalendarStore.getState().events.map((e) => e.id)).toEqual([
      "vua-tao",
    ]);
  });

  it("giữ nguyên cờ loading đúng khi request cũ về sau request mới", async () => {
    const { useCalendarStore } = await import("./calendarStore");

    const slowOld = deferred<{ data: unknown[] }>();
    const fastNew = deferred<{ data: unknown[] }>();
    listEvents
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
