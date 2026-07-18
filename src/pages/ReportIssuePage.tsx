import React from "react";
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassPlusIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../router/paths";
import { toast } from "react-hot-toast";
import ImagePreviewModal from "../components/modals/ImagePreviewModal";
import { supportApi } from "../services/api";
import uploadClient from "../services/uploadClient";
import { extractApiError, unwrapApiSuccess } from "../lib/apiContract";
import { SupportIssuePriority } from "@hacom/chat-shared-types/chat";
import {
  UPLOAD_INPUT_ACCEPT,
  resolveUploadCategoryForMimeType,
  resolveUploadMaxBytesForFile,
  resolveUploadMimeTypeForFile,
  validateUploadFileType,
} from "../utils/uploadPolicy";

const MAX_FILES = 5;

const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};

/** Môi trường thu thập ngầm — người dùng không phải gõ, và không đoán sai. */
const collectEnvironment = () => ({
  userAgent: navigator.userAgent,
  url: window.location.href,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  locale: navigator.language,
});

/** Trả lỗi (nếu có) khi thêm 1 file — dùng đúng policy upload chung của app. */
const rejectFile = (file: File, current: File[]): string | null => {
  if (current.length >= MAX_FILES) {
    return `Chỉ đính kèm tối đa ${MAX_FILES} tệp.`;
  }
  const mimeType = resolveUploadMimeTypeForFile(file);
  if (!mimeType) {
    return `${file.name}: không nhận dạng được loại tệp.`;
  }
  const validated = validateUploadFileType({ fileName: file.name, mimeType });
  if (!validated.ok) {
    return validated.code === "MIME_EXTENSION_MISMATCH"
      ? `${file.name}: phần mở rộng không khớp loại tệp.`
      : `${file.name}: loại tệp không được hỗ trợ.`;
  }
  const maxBytes = resolveUploadMaxBytesForFile(file);
  if (file.size > maxBytes) {
    return `${file.name} vượt quá ${formatFileSize(maxBytes)} (giới hạn cho ${resolveUploadCategoryForMimeType(mimeType)}).`;
  }
  if (current.some((f) => f.name === file.name && f.size === file.size)) {
    return null; // trùng — bỏ qua im lặng
  }
  return null;
};

const EXTENSION_BY_PASTED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

/**
 * Ảnh dán từ clipboard thường tên rỗng hoặc "image.png" trùng nhau — đặt tên theo
 * thời điểm dán để vừa qua được validate đuôi-khớp-MIME, vừa không bị coi là trùng.
 */
const nameClipboardFile = (file: File, now: Date = new Date()): File | null => {
  const extension = EXTENSION_BY_PASTED_MIME[file.type.toLowerCase()];
  if (!extension) return null;

  const stamp = now
    .toISOString()
    .slice(0, 19)
    .replace(/[-:]/g, "")
    .replace("T", "-");
  return new File([file], `anh-dan-${stamp}${extension}`, { type: file.type });
};

const isImageFile = (file: File): boolean => file.type.startsWith("image/");

const ReportIssuePage: React.FC = () => {
  const [files, setFiles] = React.useState<File[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const [justPasted, setJustPasted] = React.useState(false);
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [uploadingCount, setUploadingCount] = React.useState(0);
  const [submittedTicket, setSubmittedTicket] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const imageFiles = React.useMemo(() => files.filter(isImageFile), [files]);

  // Một blob URL cho mỗi ảnh, dùng chung cho thumbnail và modal xem lớn.
  // Revoke khi ảnh bị gỡ hoặc rời trang, nếu không là rò bộ nhớ.
  const [previewUrls, setPreviewUrls] = React.useState<Map<File, string>>(
    () => new Map(),
  );

  React.useEffect(() => {
    setPreviewUrls((current) => {
      const next = new Map<File, string>();
      for (const file of imageFiles) {
        next.set(file, current.get(file) ?? URL.createObjectURL(file));
      }
      for (const [file, url] of current) {
        if (!next.has(file)) URL.revokeObjectURL(url);
      }
      return next;
    });
  }, [imageFiles]);

  React.useEffect(
    () => () => {
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    },
    // Chỉ chạy khi unmount — dọn nốt URL còn sống.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Gỡ ảnh đang mở → index trỏ vào chỗ trống; đóng/lùi về ảnh cuối thay vì hiện khung rỗng.
  React.useEffect(() => {
    setPreviewIndex((current) => {
      if (current === null) return null;
      if (imageFiles.length === 0) return null;
      return Math.min(current, imageFiles.length - 1);
    });
  }, [imageFiles.length]);

  const galleryImages = React.useMemo(
    () =>
      imageFiles.map((file) => ({
        url: previewUrls.get(file) ?? "",
        alt: file.name,
      })),
    [imageFiles, previewUrls],
  );

  const addFiles = React.useCallback((incoming: File[]) => {
    setFiles((current) => {
      const next = [...current];
      const errors: string[] = [];

      for (const file of incoming) {
        const error = rejectFile(file, next);
        if (error) {
          errors.push(error);
          continue;
        }
        const duplicate = next.some(
          (f) => f.name === file.name && f.size === file.size,
        );
        if (!duplicate) next.push(file);
      }

      for (const error of errors) toast.error(error);
      return next;
    });
  }, []);

  // Dán ảnh ở bất kỳ đâu trong trang — không bắt user phải focus đúng ô upload.
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? [])
        .map((file) => nameClipboardFile(file))
        .filter((file): file is File => file !== null);

      if (pasted.length === 0) return; // dán chữ vào ô text: để nguyên

      event.preventDefault();
      addFiles(pasted);
      setJustPasted(true);
      window.setTimeout(() => setJustPasted(false), 1200);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  /** Upload 1 tệp qua luồng 2 phase có sẵn (reserve → PUT signed URL → complete). */
  const uploadOne = async (file: File): Promise<string> => {
    const validated = uploadClient.validateUpload(file, "support_attachment");
    const signed = await uploadClient.reserveUpload({
      purpose: "support_attachment",
      filename: file.name,
      mimeType: validated.mimeType,
      sizeBytes: file.size,
    });

    await uploadClient.uploadToSignedUrl({
      signedUrl: signed.uploadUrl,
      method: signed.uploadMethod || "PUT",
      headers: { ...(signed.uploadHeaders || {}), "Content-Type": validated.mimeType },
      file,
    });

    const completed = await uploadClient.completeUpload({
      uploadId: signed.uploadId,
      objectKey: signed.objectKey,
    });

    const fileId = completed.attachment?.id;
    if (!fileId) {
      throw new Error("UPLOAD_COMPLETE_MISSING_FILE_ID");
    }
    return fileId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const priority =
      (data.get("priority") as SupportIssuePriority | null) ?? SupportIssuePriority.MEDIUM;

    setIsSubmitting(true);
    try {
      // Upload trước, lấy fileId; nếu tệp lỗi thì dừng luôn, không tạo ticket thiếu bằng chứng.
      setUploadingCount(files.length);
      const attachmentFileIds: string[] = [];
      for (const file of files) {
        attachmentFileIds.push(await uploadOne(file));
        setUploadingCount((current) => current - 1);
      }

      const created = unwrapApiSuccess(
        await supportApi.createIssue({
          title: String(data.get("title") ?? "").trim(),
          stepsToReproduce: String(data.get("stepsToReproduce") ?? "").trim(),
          expectedResult: String(data.get("expectedResult") ?? "").trim() || null,
          actualResult: String(data.get("actualResult") ?? "").trim() || null,
          priority,
          attachmentFileIds,
          environment: collectEnvironment(),
        }),
      );

      const ticketCode = created.ticketCode;
      setSubmittedTicket(ticketCode ?? null);
      form.reset();
      setFiles([]);
      toast.success(
        ticketCode
          ? `Đã gửi báo cáo. Mã tra cứu: ${ticketCode}`
          : "Đã gửi báo cáo tới đội ngũ IT.",
      );
    } catch (error) {
      const apiError = extractApiError(error);
      toast.error(
        apiError.message || "Không gửi được báo cáo. Vui lòng thử lại hoặc liên hệ đội ngũ IT.",
      );
    } finally {
      setIsSubmitting(false);
      setUploadingCount(0);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <Link
          to={ROUTE_PATHS.HELP}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Quay lại hỗ trợ
        </Link>

        <h1 className="mb-4 text-3xl font-bold text-text-primary">
          Báo cáo sự cố hệ thống
        </h1>
        <p className="mb-8 text-text-secondary">
          Mô tả càng cụ thể, đội ngũ IT càng tái hiện được lỗi nhanh và sửa sớm.
          Thông tin thiết bị và trình duyệt được đính kèm tự động.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="issue-title"
              className="text-sm font-bold text-text-primary"
            >
              Tiêu đề sự cố
            </label>
            <input
              id="issue-title"
              name="title"
              required
              maxLength={200}
              type="text"
              placeholder="Ví dụ: Không gửi được ảnh trong nhóm chat"
              className="w-full rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="issue-steps"
              className="text-sm font-bold text-text-primary"
            >
              Các bước dẫn đến lỗi
            </label>
            <p className="text-xs text-text-muted">
              Đánh số từng bước, bắt đầu từ lúc mở màn hình nào.
            </p>
            <textarea
              id="issue-steps"
              name="stepsToReproduce"
              required
              rows={5}
              maxLength={5000}
              placeholder={"1. Mở nhóm chat \"Kỹ thuật\"\n2. Bấm nút đính kèm, chọn 1 ảnh\n3. Bấm Gửi"}
              className="w-full resize-none rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                htmlFor="issue-expected"
                className="text-sm font-bold text-text-primary"
              >
                Kết quả mong đợi
              </label>
              <textarea
                id="issue-expected"
                name="expectedResult"
                rows={3}
                maxLength={2000}
                placeholder="Ảnh được gửi và hiển thị trong khung chat."
                className="w-full resize-none rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="issue-actual"
                className="text-sm font-bold text-text-primary"
              >
                Kết quả thực tế
              </label>
              <textarea
                id="issue-actual"
                name="actualResult"
                rows={3}
                maxLength={2000}
                placeholder="Ảnh quay vòng mãi rồi hiện chữ đỏ 'Gửi thất bại'."
                className="w-full resize-none rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-text-primary">
              Ảnh chụp màn hình / tệp đính kèm
            </label>
            <p className="text-xs text-text-muted">
              Chụp màn hình rồi nhấn{" "}
              <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-sans text-[11px] font-medium text-text-secondary">
                Ctrl
              </kbd>
              {" + "}
              <kbd className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-sans text-[11px] font-medium text-text-secondary">
                V
              </kbd>{" "}
              để dán thẳng vào đây. Ảnh, video, tài liệu hoặc file nén. Tối đa{" "}
              {MAX_FILES} tệp.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
              className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                isDragging || justPasted
                  ? "border-[#1976D2]/60 bg-[#1976D2]/8"
                  : "border-border/60 bg-surface"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={UPLOAD_INPUT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <ArrowUpTrayIcon className="mx-auto mb-2 h-6 w-6 text-text-muted" />
              <p className="text-sm text-text-secondary">
                Dán ảnh (Ctrl+V), kéo thả tệp vào đây hoặc{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="font-bold text-[#1565C0] hover:underline"
                >
                  chọn từ máy
                </button>
              </p>
            </div>

            {files.length > 0 && (
              <ul className="space-y-2 pt-2">
                {files.map((file) => (
                  <li
                    key={`${file.name}-${file.size}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-surface px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {isImageFile(file) && previewUrls.get(file) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewIndex(imageFiles.indexOf(file))
                          }
                          aria-label={`Xem ảnh lớn: ${file.name}`}
                          className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/40 transition-all hover:ring-2 hover:ring-[#1976D2]/60"
                        >
                          <img
                            src={previewUrls.get(file)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                            <MagnifyingGlassPlusIcon className="h-4 w-4" />
                          </span>
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {file.name}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Xoá ${file.name}`}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter(
                            (f) => !(f.name === file.name && f.size === file.size),
                          ),
                        )
                      }
                      className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-text-primary">
              Mức độ ưu tiên
            </label>
            <div className="flex gap-4">
              {[
                { value: "low", label: "Thấp", hint: "Gây khó chịu" },
                { value: "medium", label: "Trung bình", hint: "Có cách né" },
                { value: "high", label: "Cao", hint: "Không làm việc được" },
              ].map((level) => (
                <label
                  key={level.value}
                  className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-border/60 bg-surface py-3 text-sm font-medium transition-all hover:bg-surface-hover has-[:checked]:border-[#1976D2]/60 has-[:checked]:bg-[#1976D2]/8 has-[:checked]:text-[#1565C0]"
                >
                  <input
                    type="radio"
                    name="priority"
                    value={level.value}
                    className="hidden"
                    defaultChecked={level.value === "medium"}
                  />
                  {level.label}
                  <span className="text-xs font-normal text-text-muted">
                    {level.hint}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1565C0] py-4 font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-[#1976D2] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
          >
            {isSubmitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
            {isSubmitting
              ? uploadingCount > 0
                ? `Đang tải lên ${uploadingCount} tệp...`
                : "Đang gửi báo cáo..."
              : "Gửi báo cáo sự cố"}
          </button>
        </form>

        {submittedTicket && (
          <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
            <p className="text-sm text-text-secondary">
              Báo cáo đã được gửi tới đội ngũ IT. Mã tra cứu của bạn:
            </p>
            <p className="mt-2 text-2xl font-bold tracking-wide text-emerald-600">
              {submittedTicket}
            </p>
            <p className="mt-2 text-xs text-text-muted">
              Lưu lại mã này để hỏi tình trạng xử lý khi cần.
            </p>
          </div>
        )}
      </div>

      <ImagePreviewModal
        isOpen={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        images={galleryImages}
        initialIndex={previewIndex ?? 0}
      />
    </div>
  );
};

export { collectEnvironment, nameClipboardFile, rejectFile, MAX_FILES };
export default ReportIssuePage;
