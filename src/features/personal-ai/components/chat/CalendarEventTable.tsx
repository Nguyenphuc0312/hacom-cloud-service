/**
 * Bảng lịch trong chat Trợ lý cá nhân. Khi BE trả `calendar_events` ở SSE
 * `done`, render bảng gọn 5 cột (Ngày / Giờ / Sự kiện / Địa điểm / Chủ trì) +
 * nút "Xem chi tiết" mỗi dòng — thay cho markdown thuần. Bấm nút → fetch sự
 * kiện HR theo `event_id` rồi mở EventDetailModal dùng chung với /calendar.
 *
 * Toàn bộ thao tác (xem / sửa / xóa / phản hồi) làm NGAY TRÊN MÀN CHAT, không
 * rời trang. Nghiệp vụ đi qua `useCalendarEventMutations` — LUỒNG DUY NHẤT của
 * lịch (calendarStore + hr-api) — nên tự đồng bộ với /calendar và widget lịch.
 * Modal tự ẩn/hiện Sửa/Xóa/Phản hồi theo quyền BE trả (canEdit/canDelete/
 * isParticipant) — không hardcode isViewingOthers.
 *
 * Sửa: mở đúng form họp/cá nhân (MeetingFormModal/PersonalEventFormModal) ngay
 * trong chat, prefill bằng `buildCalendarEventForm(hrEvent)` (hàm thuần dùng
 * chung với logic của CalendarPage).
 *
 * Xóa: sau khi xóa thành công, GẠCH luôn dòng khỏi bảng trong chat bằng cách
 * patch `message.calendarEvents` (bảng render từ snapshot này, không tự biết
 * event đã mất) → không còn "xóa xong bảng vẫn hiện dòng cũ".
 *
 * `event_id` do AI backend trả: thực tế là UUID sự kiện HR (mở modal + participants
 * đầy đủ chứng minh). Nếu 404 (event đã bị xóa / id lạ) → toast + log chẩn đoán
 * `event_id`, KHÔNG vỡ UI.
 */

import React, { useState } from "react";
import { Loader2Icon } from "lucide-react";
import type { CalendarEventRow } from "../../types";
import { hrCalendarApi, type HRCalendarEvent } from "../../../api/hrCalendarApi";
import {
  mapHrmEventToExtendedDetail,
  buildCalendarEventForm,
} from "../../../calendar/utils/calendarEventMapping";
import { useCalendarEventMutations } from "../../../calendar/hooks/useCalendarEventMutations";
import { EventDetailModal } from "../../../calendar/components/EventDetailModal";
import {
  MeetingFormModal,
  type MeetingFormData,
} from "../../../../components/ui/MeetingFormModal";
import {
  PersonalEventFormModal,
  type PersonalEventFormData,
} from "../../../../components/ui/PersonalEventFormModal";
import { usePersonalAiStore } from "../../stores/personalAiStore";
import { logger } from "../../../../utils/logger";
import { toast } from "../../../../utils/toast";

interface CalendarEventTableProps {
  events: CalendarEventRow[];
  /** Để patch lại danh sách event của message (gạch dòng sau khi xóa). */
  conversationId: string | null;
  messageId: string;
}

const HEADERS = ["Ngày", "Giờ", "Sự kiện", "Địa điểm", "Chủ trì"] as const;

/** "title (event_type)" khi có loại, ngược lại chỉ title. Trống → "-". */
function formatEventCell(row: CalendarEventRow): string {
  const title = row.title?.trim();
  if (!title) return "-";
  const type = row.event_type?.trim();
  return type ? `${title} (${type})` : title;
}

/** event_id dùng để mở/sửa/xóa: ưu tiên trong detail_action, fallback field gốc. */
const rowEventId = (row: CalendarEventRow): string =>
  row.detail_action?.event_id ?? row.event_id;

export const CalendarEventTable: React.FC<CalendarEventTableProps> = ({
  events,
  conversationId,
  messageId,
}) => {
  const patchMessage = usePersonalAiStore((s) => s.patchMessage);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hrEvent, setHrEvent] = useState<HRCalendarEvent | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<MeetingFormData | null>(null);
  const [editingPersonal, setEditingPersonal] =
    useState<PersonalEventFormData | null>(null);

  // Xóa/phản hồi/sửa đi qua calendarStore + hr-api → các view lịch đang mở tự
  // đồng bộ. Không cần onSuccess refetch: chat không sở hữu range lịch nào.
  const mutations = useCalendarEventMutations();

  /** Gạch dòng vừa xóa khỏi bảng trong chat (patch snapshot của message). */
  const removeRowFromTable = (eventId: string) => {
    if (!conversationId) return;
    const remaining = events.filter((r) => rowEventId(r) !== eventId);
    patchMessage(conversationId, messageId, { calendarEvents: remaining });
  };

  // ponytail: KHÔNG patch lại dòng sau khi Sửa. Bảng là snapshot markdown của BE
  // (day = "Thứ Hai 06/07", time = "16:00-17:30"), còn form trả date/time thô
  // (YYYY-MM-DD, HH:mm) — ghép vào sẽ lệch định dạng, hại hơn. Nguồn thật (lịch)
  // đã cập nhật qua mutations; muốn xem lại theo dữ liệu mới thì hỏi lại lịch.

  const handleOpenDetail = (row: CalendarEventRow) => {
    const eventId = rowEventId(row);
    if (!eventId || openingId) return;
    setOpeningId(eventId);
    hrCalendarApi
      .getEvent(eventId)
      .then((event) => setHrEvent(event))
      .catch((err) => {
        // Chẩn đoán: event_id là gì mà không mở được (UUID HR đã xóa? id lạ?).
        logger.warn("CalendarEventTable", "open-detail-failed", {
          eventId,
          error: err instanceof Error ? err.message : String(err),
        });
        toast.error("Không mở được chi tiết sự kiện này.");
      })
      .finally(() => setOpeningId(null));
  };

  const handleEdit = () => {
    if (!hrEvent) return;
    const form = buildCalendarEventForm(hrEvent);
    if (!form) {
      toast.info("Sự kiện này không sửa được ở đây.");
      return;
    }
    setHrEvent(null); // đóng modal chi tiết, mở form
    if (form.kind === "personal") setEditingPersonal(form.data);
    else setEditingMeeting(form.data);
  };

  const handleDelete = async () => {
    if (!hrEvent) return;
    const id = hrEvent.id;
    const ok = await mutations.remove(id);
    if (ok) {
      setHrEvent(null);
      removeRowFromTable(id);
    }
  };

  const handleRespond = async (response: "ACCEPTED" | "DECLINED") => {
    if (!hrEvent) return;
    await mutations.respond(hrEvent.id, response);
    // Cập nhật lại trạng thái phản hồi trong modal đang mở.
    setHrEvent(await hrCalendarApi.getEvent(hrEvent.id).catch(() => hrEvent));
  };

  // Lưu form sửa — throw khi thất bại để form giữ nguyên (giống CalendarPage).
  const handleSaveMeeting = async (data: MeetingFormData) => {
    const ok = await mutations.updateMeeting(data);
    if (!ok) throw new Error("update meeting failed");
    setEditingMeeting(null);
  };
  const handleSavePersonal = async (data: PersonalEventFormData) => {
    const ok = await mutations.updatePersonal(data);
    if (!ok) throw new Error("update personal event failed");
    setEditingPersonal(null);
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
              <th className="px-3 py-2">
                <span className="sr-only">Hành động</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr className="border-t border-border">
                <td
                  colSpan={HEADERS.length + 1}
                  className="px-3 py-4 text-center text-text-muted"
                >
                  Đã xóa hết sự kiện trong danh sách này.
                </td>
              </tr>
            )}
            {events.map((row, idx) => {
              const canOpen = !!row.detail_action;
              const isOpening = openingId === rowEventId(row);
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

      <MeetingFormModal
        isOpen={!!editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSave={handleSaveMeeting}
        initialData={editingMeeting}
      />
      <PersonalEventFormModal
        isOpen={!!editingPersonal}
        onClose={() => setEditingPersonal(null)}
        onSave={handleSavePersonal}
        initialData={editingPersonal}
      />
    </>
  );
};
