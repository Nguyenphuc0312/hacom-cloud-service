/**
 * uploadCalendarAttachment — upload file đính kèm lịch qua chat-api storage.
 *
 * Dùng đúng flow reserve → PUT signed URL → complete như message/voice, nhưng
 * với purpose `calendar_attachment` và KHÔNG kèm conversationId (lịch không thuộc
 * hội thoại nào). BE (chat-api) phải whitelist purpose này cho /files/upload-url
 * và /files/complete — xem contract FE__calendar-attachments__contract__01-07-26.md.
 *
 * Trả về danh sách { fileId, url } đã upload xong → FE gửi fileId vào hr-api
 * qua `attachmentFileIds`.
 *
 * ponytail: reuse uploadClient + validateUpload; không viết lại queue/retry.
 * Upload tuần tự (Promise.all) là đủ cho vài file lịch; nếu cần đồng thời có
 * giới hạn thì thêm p-limit sau.
 */

import uploadClient from "../../../services/uploadClient";
import { extractApiError } from "../../../lib/apiContract";
import { CALENDAR_ATTACHMENTS_USE_MOCK } from "../../../config";
import { mockUploadCalendarFile } from "./calendarAttachmentMockStore";
import type { CalendarLocalAttachment } from "../../../components/ui/CalendarAttachmentZone";

export interface UploadedCalendarAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}

export class CalendarAttachmentUploadError extends Error {
  readonly filename?: string;
  constructor(message: string, filename?: string) {
    super(message);
    this.name = "CalendarAttachmentUploadError";
    this.filename = filename;
  }
}

async function uploadOne(file: File): Promise<UploadedCalendarAttachment> {
  // Validate trước (mime/size/extension) — ném lỗi rõ ràng nếu không hợp lệ.
  uploadClient.validateUpload(file, "calendar_attachment");

  const signed = await uploadClient.reserveUpload({
    purpose: "calendar_attachment",
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  const { uploadId, uploadUrl, objectKey } = signed;
  if (!uploadUrl || !uploadId) {
    throw new CalendarAttachmentUploadError("Phản hồi upload không hợp lệ", file.name);
  }

  await uploadClient.uploadToSignedUrl({
    signedUrl: uploadUrl,
    file,
    method: signed.uploadMethod || "PUT",
    headers: {
      ...(signed.uploadHeaders || {}),
      "Content-Type": file.type,
    },
  });

  // completeUpload không cần conversationId cho calendar_attachment (BE bỏ qua).
  const completed = await uploadClient.completeUpload({ uploadId, objectKey });

  const attachment =
    "attachment" in completed && completed.attachment ? completed.attachment : undefined;
  const fileId = completed.fileId || attachment?.id;
  if (!fileId) {
    throw new CalendarAttachmentUploadError("Upload xong nhưng thiếu fileId", file.name);
  }

  return {
    fileId,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: (attachment as { url?: string } | undefined)?.url,
  };
}

/**
 * Upload danh sách file local; trả về metadata đã upload (theo đúng thứ tự).
 * Chỉ upload các attachment CHƯA có fileId remote (`.uploaded`).
 */
export async function uploadCalendarAttachments(
  files: File[],
): Promise<UploadedCalendarAttachment[]> {
  if (files.length === 0) return [];
  try {
    // MOCK: lưu blob vào IndexedDB, sinh fileId giả — hoạt động thật, không cần BE.
    if (CALENDAR_ATTACHMENTS_USE_MOCK) {
      return await Promise.all(files.map(mockUploadCalendarFile));
    }
    return await Promise.all(files.map(uploadOne));
  } catch (err) {
    if (err instanceof CalendarAttachmentUploadError) throw err;
    const apiError = extractApiError(err);
    throw new CalendarAttachmentUploadError(apiError.message);
  }
}

/**
 * Từ danh sách attachment trong form (local mới + remote đã có), tách ra:
 *  - `filesToUpload`: File local cần upload
 *  - `existingFileIds`: fileId của attachment đã upload trước (giữ khi edit)
 * Sau khi upload xong, gộp existingFileIds + fileId mới = full desired set gửi BE.
 */
export function splitCalendarAttachments(attachments: CalendarLocalAttachment[]): {
  filesToUpload: File[];
  existingFileIds: string[];
} {
  const filesToUpload: File[] = [];
  const existingFileIds: string[] = [];
  for (const a of attachments) {
    if (a.remoteFileId) existingFileIds.push(a.remoteFileId);
    else if (a.file) filesToUpload.push(a.file);
  }
  return { filesToUpload, existingFileIds };
}
