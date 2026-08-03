/**
 * Quyết định CalendarPage phải mở sẵn sự kiện nào khi vừa điều hướng tới.
 * Hai nguồn: location.state (widget lịch tuần) và ?eventId= (chuông thông báo,
 * link dán ra ngoài). state được ưu tiên vì nó cụ thể hơn query còn sót lại.
 */

export type OpenEventRequest = {
  openEventId: string | null;
  view: string | null;
  /** Khoá so trùng — đổi khoá nghĩa là yêu cầu MỚI, phải mở lại. */
  key: string;
};

export const resolveOpenEventRequest = (
  navState: { openEventId?: string; view?: string } | null | undefined,
  search: string,
): OpenEventRequest | null => {
  const queryEventId = new URLSearchParams(search).get("eventId");
  const openEventId = navState?.openEventId ?? queryEventId ?? null;
  const view = navState?.view ?? null;
  if (!openEventId && !view) return null;
  return { openEventId, view, key: `${openEventId ?? ""}|${view ?? ""}` };
};
