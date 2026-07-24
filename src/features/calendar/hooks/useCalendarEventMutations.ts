/**
 * @fileoverview useCalendarEventMutations — nguồn DUY NHẤT cho nghiệp vụ ghi lịch
 * (tạo/sửa lịch họp & cá nhân, xóa, phản hồi mời họp). Dùng chung cho CalendarPage
 * và WeeklyCalendarWidget để hai màn hình hành xử GIỐNG HỆT nhau (upload đính kèm,
 * xóa field cũ bằng chuỗi rỗng, đi qua calendarStore để giữ cache đồng bộ, map lỗi
 * upload, lưu mock attachment). Tách ra tránh nhân đôi logic → lệch nhau về sau.
 *
 * Mọi mutation đi qua `useCalendarStore` (createEvent/updateEvent/deleteEvent) —
 * lớp dữ liệu chuẩn — rồi gọi `onSuccess` để màn hình tự refetch theo range của nó.
 */

import { useCallback } from "react";
import { useCalendarStore } from "../../../stores/calendarStore";
import { hrCalendarApi } from "../../api/hrCalendarApi";
import { toast } from "../../../utils/toast";
import {
  CALENDAR_ATTACHMENTS_ENABLED,
  CALENDAR_ATTACHMENTS_USE_MOCK,
} from "../../../config";
import {
  uploadCalendarAttachments,
  splitCalendarAttachments,
  CalendarAttachmentUploadError,
} from "../utils/uploadCalendarAttachment";
import { mockSetEventAttachments } from "../utils/calendarAttachmentMockStore";
import {
  meetingVisibilityToApi,
  personalVisibilityToApi,
} from "../utils/calendarVisibility";
import type { MeetingFormData } from "../../../components/ui/MeetingFormModal";
import type { PersonalEventFormData } from "../../../components/ui/PersonalEventFormModal";
import type { CalendarLocalAttachment } from "../../../components/ui/CalendarAttachmentZone";

const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Diễn giải ngày+giờ LOCAL đã chọn thành mốc tuyệt đối (UTC ISO). */
const toIsoInstant = (date: string, time: string): string =>
  new Date(`${date}T${time}:00`).toISOString();

const resolveTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;

/**
 * Người được tag phải nhận được lịch → gửi mọi ref backend resolve được (employee
 * cuid / employeeCode / chat authUserId). Tên free-text (không có identity) lưu vào
 * metadata.attendees. Chủ trì tag từ bạn bè cũng được mời để lịch hiện trên lịch họ.
 */
const buildParticipantPayload = (
  data: MeetingFormData,
): { refs: string[]; freeTextNames: string[] } => {
  const refs = new Set<string>();
  const freeTextNames: string[] = [];
  for (const p of data.participants ?? []) {
    const ref = p.employeeId || p.employeeCode || p.userId;
    if (ref) refs.add(ref);
    else if (p.name.trim()) freeTextNames.push(p.name.trim());
  }
  const chairmanRef = data.chairmanEmployeeCode || data.chairmanUserId;
  if (chairmanRef) refs.add(chairmanRef);
  return { refs: Array.from(refs), freeTextNames };
};

/**
 * Từ attachments trong form: upload file mới, gộp với fileId cũ (remote) → full
 * desired set để BE reconcile. Trả undefined khi flag off HOẶC không có attachment
 * (bỏ field → BE không đụng tới attachments hiện có).
 */
const resolveAttachmentFileIds = async (
  attachments: CalendarLocalAttachment[] | undefined,
): Promise<string[] | undefined> => {
  if (!CALENDAR_ATTACHMENTS_ENABLED) return undefined;
  if (!attachments || attachments.length === 0) return [];
  const { filesToUpload, existingFileIds } = splitCalendarAttachments(attachments);
  const uploaded = await uploadCalendarAttachments(filesToUpload);
  return [...existingFileIds, ...uploaded.map((u) => u.fileId)];
};

/** MOCK: lưu mapping eventId → fileIds vào IndexedDB để list/detail hiển thị lại. */
const persistMockAttachmentMapping = async (
  eventId: string | undefined,
  fileIds: string[] | undefined,
): Promise<void> => {
  if (!CALENDAR_ATTACHMENTS_USE_MOCK || !eventId || fileIds === undefined) return;
  await mockSetEventAttachments(eventId, fileIds);
};

/** Toast lỗi thống nhất: phân biệt lỗi upload đính kèm với lỗi chung. */
const notifyError = (error: unknown, fallback: string): void => {
  toast.error(
    error instanceof CalendarAttachmentUploadError
      ? `Không tải được đính kèm${error.filename ? ` "${error.filename}"` : ""}. Vui lòng thử lại.`
      : fallback,
  );
};

export interface CalendarEventMutations {
  createMeeting: (data: MeetingFormData) => Promise<boolean>;
  updateMeeting: (data: MeetingFormData) => Promise<boolean>;
  createPersonal: (data: PersonalEventFormData) => Promise<boolean>;
  updatePersonal: (data: PersonalEventFormData) => Promise<boolean>;
  remove: (eventId: string) => Promise<boolean>;
  respond: (eventId: string, response: "ACCEPTED" | "DECLINED") => Promise<boolean>;
}

/**
 * @param onSuccess gọi sau mỗi mutation thành công — nơi màn hình refetch theo
 *   range hiện tại của nó (store có thể giữ range khác trang đang xem).
 */
export const useCalendarEventMutations = (
  opts?: { onSuccess?: () => void },
): CalendarEventMutations => {
  const onSuccess = opts?.onSuccess;

  const createMeeting = useCallback(
    async (data: MeetingFormData): Promise<boolean> => {
      try {
        const { refs: participantIds, freeTextNames } = buildParticipantPayload(data);
        const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);
        const result = await useCalendarStore.getState().createEvent({
          title: data.title,
          description: data.notes || undefined,
          startAt: toIsoInstant(data.date, data.startTime),
          endAt: toIsoInstant(data.date, data.endTime),
          eventType: "MEETING",
          visibility: meetingVisibilityToApi(data.visibility),
          isAllDay: false,
          location: data.location || undefined,
          timezone: resolveTimezone(),
          participantIds,
          attendees: freeTextNames.length > 0 ? freeTextNames : undefined,
          meetingChairman: data.chairman || undefined,
          // Identity chủ trì → BE lưu để render avatar thật + cấp quyền sửa.
          meetingChairmanRef:
            data.chairmanEmployeeCode || data.chairmanUserId || undefined,
          meetingFormat: data.format,
          attachmentFileIds,
        });
        if (result) {
          // Toast thành công do calendarStore.createEvent phát — không lặp ở đây.
          await persistMockAttachmentMapping(result.id, attachmentFileIds);
          onSuccess?.();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Failed to create meeting:", error);
        notifyError(error, "Không thể thêm lịch. Vui lòng thử lại.");
        return false;
      }
    },
    [onSuccess],
  );

  const updateMeeting = useCallback(
    async (data: MeetingFormData): Promise<boolean> => {
      try {
        const { refs: participantIds, freeTextNames } = buildParticipantPayload(data);
        const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);
        // Gửi cả chuỗi rỗng (khác create): backend chỉ bỏ qua undefined, nên ""
        // mới xóa được ghi chú/địa điểm cũ.
        const success = await useCalendarStore.getState().updateEvent(data.id, {
          title: data.title,
          description: data.notes,
          startAt: toIsoInstant(data.date, data.startTime),
          endAt: toIsoInstant(data.date, data.endTime),
          location: data.location,
          timezone: resolveTimezone(),
          visibility: meetingVisibilityToApi(data.visibility),
          participantIds,
          attendees: freeTextNames,
          meetingChairman: data.chairman || undefined,
          // Identity chủ trì → BE lưu để render avatar thật + cấp quyền sửa.
          meetingChairmanRef:
            data.chairmanEmployeeCode || data.chairmanUserId || undefined,
          meetingFormat: data.format,
          attachmentFileIds,
        });
        if (success) {
          // Toast thành công do calendarStore.updateEvent phát.
          await persistMockAttachmentMapping(data.id, attachmentFileIds);
          onSuccess?.();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Failed to update meeting:", error);
        notifyError(error, "Không thể cập nhật sự kiện");
        return false;
      }
    },
    [onSuccess],
  );

  const createPersonal = useCallback(
    async (data: PersonalEventFormData): Promise<boolean> => {
      try {
        const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);
        const result = await useCalendarStore.getState().createEvent({
          title: data.title,
          description: data.notes || undefined,
          startAt: toIsoInstant(data.date, data.startTime),
          // endDate độc lập với date → hỗ trợ sự kiện qua đêm / nhiều ngày.
          endAt: toIsoInstant(data.endDate, data.endTime),
          eventType: "PERSONAL",
          visibility: personalVisibilityToApi(data.visibility),
          isAllDay: false,
          timezone: resolveTimezone(),
          attachmentFileIds,
        });
        if (result) {
          // Toast thành công do calendarStore.createEvent phát.
          await persistMockAttachmentMapping(result.id, attachmentFileIds);
          onSuccess?.();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Failed to create personal event:", error);
        notifyError(error, "Không thể thêm lịch. Vui lòng thử lại.");
        return false;
      }
    },
    [onSuccess],
  );

  const updatePersonal = useCallback(
    async (data: PersonalEventFormData): Promise<boolean> => {
      try {
        const attachmentFileIds = await resolveAttachmentFileIds(data.attachments);
        const success = await useCalendarStore.getState().updateEvent(data.id, {
          title: data.title,
          description: data.notes,
          startAt: toIsoInstant(data.date, data.startTime),
          endAt: toIsoInstant(data.endDate, data.endTime),
          timezone: resolveTimezone(),
          visibility: personalVisibilityToApi(data.visibility),
          attachmentFileIds,
        });
        if (success) {
          // Toast thành công do calendarStore.updateEvent phát.
          await persistMockAttachmentMapping(data.id, attachmentFileIds);
          onSuccess?.();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Failed to update personal event:", error);
        notifyError(error, "Không thể cập nhật sự kiện");
        return false;
      }
    },
    [onSuccess],
  );

  const remove = useCallback(
    async (eventId: string): Promise<boolean> => {
      try {
        const success = await useCalendarStore.getState().deleteEvent(eventId);
        if (success) {
          // Toast thành công do calendarStore.deleteEvent phát.
          onSuccess?.();
          return true;
        }
        return false;
      } catch (error) {
        console.error("Failed to delete event:", error);
        toast.error("Không thể xóa lịch");
        return false;
      }
    },
    [onSuccess],
  );

  const respond = useCallback(
    async (eventId: string, response: "ACCEPTED" | "DECLINED"): Promise<boolean> => {
      try {
        await hrCalendarApi.updateMyResponse(eventId, response);
        toast.success(
          response === "ACCEPTED" ? "Bạn đã xác nhận tham gia" : "Bạn đã từ chối tham gia",
        );
        onSuccess?.();
        return true;
      } catch (error) {
        console.error("Failed to update participant response:", error);
        toast.error("Không thể cập nhật phản hồi");
        return false;
      }
    },
    [onSuccess],
  );

  return { createMeeting, updateMeeting, createPersonal, updatePersonal, remove, respond };
};
