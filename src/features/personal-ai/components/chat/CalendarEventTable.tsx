/**
 * Bảng lịch trong chat Trợ lý cá nhân. Khi BE trả `calendar_events` ở SSE
 * `done`, render bảng gọn 5 cột (Ngày / Giờ / Sự kiện / Địa điểm / Chủ trì) +
 * nút "Xem chi tiết" mỗi dòng — thay cho markdown thuần. Bấm nút → fetch sự
 * kiện HR theo `event_id` rồi mở EventDetailModal dùng chung với /calendar.
 *
 * `event_id` do AI backend trả: KHÔNG chắc là UUID sự kiện HR (service AI ở
 * repo khác). Nên fetch có thể 404 → nuốt lỗi bằng toast thay vì vỡ UI. Đây là
 * nhánh fallback spec cho phép ("màn chi tiết có thể chỉ hiện thông tin được
 * phép xem" / chưa mở được thì báo nhẹ).
 *
 * Xóa + Phản hồi (Tham gia/Từ chối) đi qua `useCalendarEventMutations` — LUỒNG
 * DUY NHẤT của lịch (calendarStore + hr-api), nên thao tác ở đây tự đồng bộ với
 * trang /calendar và WeeklyCalendarWidget. Modal tự ẩn/hiện Sửa/Xóa/Phản hồi
 * theo quyền (canEdit/canDelete/isParticipant) — không hardcode isViewingOthers.
 * "Sửa" cần cây form của trang Lịch → điều hướng sang /calendar mở đúng event
 * (không nhân đôi form-stack vào chat).
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2Icon } from "lucide-react";
import type { CalendarEventRow } from "../../types";
import { hrCalendarApi, type HRCalendarEvent } from "../../../api/hrCalendarApi";
import { mapHrmEventToExtendedDetail } from "../../../calendar/utils/calendarEventMapping";
import { useCalendarEventMutations } from "../../../calendar/hooks/useCalendarEventMutations";
import { EventDetailModal } from "../../../calendar/components/EventDetailModal";
import { ROUTE_PATHS } from "../../../../router/paths";
import { toast } from "../../../../utils/toast";

interface CalendarEventTableProps {
  events: CalendarEventRow[];
}

const HEADERS = ["Ngày", "Giờ", "Sự kiện", "Địa điểm", "Chủ trì"] as const;

/** "title (event_type)" khi có loại, ngược lại chỉ title. Trống → "-". */
function formatEventCell(row: CalendarEventRow): string {
  const title = row.title?.trim();
  if (!title) return "-";
  const type = row.event_type?.trim();
  return type ? `${title} (${type})` : title;
}

export const CalendarEventTable: React.FC<CalendarEventTableProps> = ({
  events,
}) => {
  const navigate = useNavigate();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hrEvent, setHrEvent] = useState<HRCalendarEvent | null>(null);

  // Xóa/phản hồi đi qua calendarStore (deleteEvent xóa thẳng khỏi events[],
  // respond gọi hr-api) → các view lịch đang mở tự đồng bộ. Không cần onSuccess
  // refetch: chat không sở hữu range lịch nào để refetch.
  const mutations = useCalendarEventMutations();

  const handleOpenDetail = (row: CalendarEventRow) => {
    const eventId = row.detail_action?.event_id ?? row.event_id;
    if (!eventId || openingId) return;
    setOpeningId(eventId);
    hrCalendarApi
      .getEvent(eventId)
      .then((event) => setHrEvent(event))
      .catch(() =>
        toast.error("Không mở được chi tiết sự kiện này."),
      )
      .finally(() => setOpeningId(null));
  };

  // Sửa cần form họp/cá nhân của trang Lịch → điều hướng sang đó mở đúng event
  // (CalendarPage đọc location.state.openEventId). Không nhồi form-stack vào chat.
  const handleEdit = () => {
    if (!hrEvent) return;
    const id = hrEvent.id;
    setHrEvent(null);
    navigate(ROUTE_PATHS.CALENDAR, { state: { openEventId: id, view: "week" } });
  };

  const handleDelete = async () => {
    if (!hrEvent) return;
    const ok = await mutations.remove(hrEvent.id);
    if (ok) setHrEvent(null);
  };

  const handleRespond = async (response: "ACCEPTED" | "DECLINED") => {
    if (!hrEvent) return;
    await mutations.respond(hrEvent.id, response);
    // Cập nhật lại trạng thái phản hồi trong modal đang mở.
    setHrEvent(await hrCalendarApi.getEvent(hrEvent.id).catch(() => hrEvent));
  };

  return (
    <>
      <div className="my-4 overflow-x-auto rounded-2xl border border-border shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-hover text-left text-text-secondary">
              {HEADERS.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {events.map((row, idx) => {
              const canOpen = !!row.detail_action;
              const isOpening =
                openingId === (row.detail_action?.event_id ?? row.event_id);
              return (
                <tr
                  key={`${row.event_id}-${idx}`}
                  className="border-t border-border align-top"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                    {row.day?.trim() || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                    {row.time?.trim() || "-"}
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {formatEventCell(row)}
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {row.location?.trim() || "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-text-primary">
                    {row.chair?.trim() || "-"}
                  </td>
                  {/* Nút cùng dòng — ở cell riêng nên khi bảng cuộn ngang trên
                      mobile vẫn dính đúng dòng của nó. */}
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {canOpen && (
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(row)}
                        disabled={isOpening}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#1976D2]/60 px-2 py-1 text-[12px] font-medium text-[#1565C0] transition-colors hover:bg-[#1976D2]/10 active:bg-[#1976D2]/15 disabled:opacity-60"
                      >
                        {isOpening && (
                          <Loader2Icon
                            size={12}
                            strokeWidth={2}
                            className="animate-spin"
                          />
                        )}
                        Xem chi tiết
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hrEvent && (
        <EventDetailModal
          event={mapHrmEventToExtendedDetail(hrEvent)}
          hrEvent={hrEvent}
          onClose={() => setHrEvent(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRespond={handleRespond}
        />
      )}
    </>
  );
};
