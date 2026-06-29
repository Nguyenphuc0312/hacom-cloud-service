/**
 * MeetingFormModal — form thêm lịch họp trong WeeklyCalendarWidget
 */

import React from "react";
import clsx from "clsx";
import { XMarkIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { useAuthStore } from "../../stores/authStore";
import { Avatar } from "../common/Avatar";
import { resolvePublicResourceUrl } from "../../config";
import { getSafeUserPosition } from "../../utils/userDisplay";

export interface MeetingParticipant {
  name: string;
  hasConflict?: boolean;
  /** HR employee cuid — present when participant was loaded from an existing
   *  HR event (edit mode); strongest ref for the backend to resolve. */
  employeeId?: string;
  /** HR employee code — present when picked from the friends list; lets the
   *  backend resolve this person to a real HR participant. */
  employeeCode?: string;
  /** Chat user id (auth UUID) of the picked friend — backend resolves this to
   *  an employee via authUserId when employeeCode is missing. */
  userId?: string;
}

export interface MeetingReadReceipt {
  userId: string;
  name: string;
  /** ISO timestamp */
  readAt: string;
}

export interface MeetingFormData {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  chairman: string;
  /** HR employee code của chủ trì — khi được chọn từ danh sách bạn bè */
  chairmanEmployeeCode?: string;
  /** Chat user id (auth UUID) của chủ trì — khi được chọn từ danh sách bạn bè */
  chairmanUserId?: string;
  participants: MeetingParticipant[];
  format: "offline" | "online";
  location: string;
  notes: string;
  /** Quyền xem: "private" = chỉ hiện "Bận" cho người khác (BUSY_ONLY);
   *  "public" = ai cũng xem được đầy đủ (PUBLIC). Mặc định "private". */
  visibility: "private" | "public";
  /** ID của người tạo lịch — dùng để phân quyền sửa/xóa */
  createdById?: string;
  /** Tên hiển thị người tạo lịch */
  createdByName?: string;
  /** Danh sách người đã xem (theo tên/ID) */
  readBy?: MeetingReadReceipt[];
}

interface MeetingFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nếu có → nút "Hủy" quay lại bước chọn loại lịch thay vì đóng hẳn. */
  onBack?: () => void;
  onSave: (data: MeetingFormData) => Promise<void> | void;
  defaultDate?: string;
  /** Giờ bắt đầu/kết thúc điền sẵn (HH:mm) khi tạo từ click ô khung giờ trên lưới */
  defaultStartTime?: string;
  defaultEndTime?: string;
  /** Existing meetings on the same date to detect conflicts */
  existingMeetings?: MeetingFormData[];
  /** Nếu có → modal hoạt động ở chế độ chỉnh sửa (giữ id, createdBy, readBy) */
  initialData?: MeetingFormData | null;
  /** Loading state - disables save button */
  isLoading?: boolean;
}

const SAVED_LOCATIONS_KEY = "hacom-meeting-saved-locations";

const getSavedLocations = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_LOCATIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
};

const saveLocation = (loc: string) => {
  const existing = getSavedLocations();
  if (!existing.includes(loc)) {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify([loc, ...existing].slice(0, 20)));
  }
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatDateVN = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
};

const WEEKDAY_VN = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const formatWeekdayVN = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return WEEKDAY_VN[d.getDay()];
};

const formatDuration = (start: string, end: string): string => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return "";
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
};

const timeRangesOverlap = (
  s1: string, e1: string,
  s2: string, e2: string,
): boolean => {
  if (!s1 || !e1 || !s2 || !e2) return false;
  return s1 < e2 && e1 > s2;
};

export const MeetingFormModal: React.FC<MeetingFormModalProps> = ({
  isOpen,
  onClose,
  onBack,
  onSave,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  existingMeetings = [],
  initialData = null,
  isLoading = false,
}) => {
  const isEditMode = !!initialData;
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState(defaultDate ?? today());
  const [dateText, setDateText] = React.useState(formatDateVN(defaultDate ?? today()));
  const [startTime, setStartTime] = React.useState("08:00");
  const [endTime, setEndTime] = React.useState("09:00");
  const [chairman, setChairman] = React.useState("");
  const [chairmanInput, setChairmanInput] = React.useState("");
  const [chairmanMeta, setChairmanMeta] = React.useState<{
    employeeCode?: string;
    userId?: string;
  } | null>(null);
  const [showChairmanPicker, setShowChairmanPicker] = React.useState(false);
  const [participantInput, setParticipantInput] = React.useState("");
  const [participants, setParticipants] = React.useState<MeetingParticipant[]>([]);
  const [format, setFormat] = React.useState<"offline" | "online">("offline");
  const [visibility, setVisibility] = React.useState<"private" | "public">("private");
  const [location, setLocation] = React.useState("");
  const [locationInput, setLocationInput] = React.useState("");
  const [showLocationSuggestions, setShowLocationSuggestions] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const savedLocations = React.useMemo(() => getSavedLocations(), [isOpen]);

  // Bạn bè dùng cho @-mention — lấy từ friendshipStore (cache server, có avatar/HR fields)
  const friends = useFriendshipStore((s) => s.friends);
  const isFriendsLoading = useFriendshipStore((s) => s.isFriendsLoading);
  const fetchFriends = useFriendshipStore((s) => s.fetchFriends);
  const currentUser = useAuthStore((s) => s.user);

  React.useEffect(() => {
    if (isOpen && friends.length === 0 && !isFriendsLoading) {
      void fetchFriends();
    }
  }, [isOpen, friends.length, isFriendsLoading, fetchFriends]);

  const looksLikeCode = (s: string): boolean =>
    /^[a-z0-9._-]+$/i.test(s) && !/\s/.test(s);

  const friendOptions = React.useMemo(() => {
    const pickName = (f: typeof friends[number]): string => {
      const hr =
        (f.fullNameFromHR ?? "").trim() ||
        (f.full_name_from_hr ?? "").trim() ||
        (f.hrLegalName ?? "").trim();
      const full =
        (f.fullName ?? "").trim() ||
        [f.firstName, f.lastName].filter(Boolean).join(" ").trim();
      const display =
        (f.effectiveDisplayName ?? "").trim() || (f.displayName ?? "").trim();
      if (hr) return hr;
      if (full) return full;
      if (display && !looksLikeCode(display)) return display;
      return display || f.username || f.email || "";
    };
    return friends
      .map((f) => ({
        id: f.id,
        name: pickName(f),
        avatar: f.avatar || "",
        employeeCode: f.employeeCode || f.employee_code || "",
        department: f.departmentName || f.orgUnit || "",
        title: getSafeUserPosition(f) || "",
        isSelf: false as const,
      }))
      .filter((f) => f.name)
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [friends, looksLikeCode]);

  // Tùy chọn "bản thân" đặt ở đầu danh sách
  const selfOption = React.useMemo(() => {
    if (!currentUser) return null;
    const hr =
      (currentUser.fullNameFromHR ?? "").trim() ||
      (currentUser.full_name_from_hr ?? "").trim() ||
      (currentUser.hrLegalName ?? "").trim();
    const full =
      (currentUser.fullName ?? "").trim() ||
      [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ").trim();
    const display =
      (currentUser.effectiveDisplayName ?? "").trim() ||
      (currentUser.displayName ?? "").trim();
    const name =
      hr || full || (display && !looksLikeCode(display) ? display : "") || display || currentUser.username || "";
    if (!name) return null;
    return {
      id: currentUser.id,
      name,
      avatar: currentUser.avatar || "",
      employeeCode: currentUser.employeeCode || currentUser.employee_code || "",
      department: currentUser.departmentName || currentUser.orgUnit || "",
      title: getSafeUserPosition(currentUser) || "",
      isSelf: true as const,
    };
  }, [currentUser, looksLikeCode]);
  const [showFriendPicker, setShowFriendPicker] = React.useState(false);
  const mentionQuery = participantInput.startsWith("@")
    ? participantInput.slice(1).trim().toLowerCase()
    : "";
  const isMentioning = participantInput.startsWith("@");
  const pickerOpen = showFriendPicker || isMentioning;

  // Chairman @-mention picker
  const isChairmanMentioning = chairmanInput.startsWith("@");
  const chairmanMentionQuery = isChairmanMentioning
    ? chairmanInput.slice(1).trim().toLowerCase()
    : "";
  const chairmanPickerOpen = showChairmanPicker || isChairmanMentioning;
  const filteredChairmanOptions = React.useMemo(() => {
    const q = isChairmanMentioning ? chairmanMentionQuery : chairmanInput.trim().toLowerCase();
    const matchesSelf = (opt: NonNullable<typeof selfOption>) =>
      !q ||
      opt.name.toLowerCase().includes(q) ||
      opt.employeeCode.toLowerCase().includes(q) ||
      opt.department.toLowerCase().includes(q);
    const friendsFiltered = !q
      ? friendOptions
      : friendOptions.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.employeeCode.toLowerCase().includes(q) ||
            f.department.toLowerCase().includes(q),
        );
    if (selfOption && matchesSelf(selfOption)) {
      return [selfOption, ...friendsFiltered.filter((f) => f.id !== selfOption.id)];
    }
    return friendsFiltered;
  }, [friendOptions, selfOption, chairmanMentionQuery, isChairmanMentioning, chairmanInput]);

  const filteredFriendOptions = React.useMemo(() => {
    const q = isMentioning ? mentionQuery : participantInput.trim().toLowerCase();
    const matchesSelf = (opt: NonNullable<typeof selfOption>) =>
      !q ||
      opt.name.toLowerCase().includes(q) ||
      opt.employeeCode.toLowerCase().includes(q) ||
      opt.department.toLowerCase().includes(q);
    const friendsFiltered = !q
      ? friendOptions
      : friendOptions.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.employeeCode.toLowerCase().includes(q) ||
            f.department.toLowerCase().includes(q),
        );
    if (selfOption && matchesSelf(selfOption)) {
      return [selfOption, ...friendsFiltered.filter((f) => f.id !== selfOption.id)];
    }
    return friendsFiltered;
  }, [friendOptions, selfOption, mentionQuery, isMentioning, participantInput]);

  // Reset / pre-fill form khi mở modal
  React.useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setTitle(initialData.title);
      setDate(initialData.date);
      setDateText(formatDateVN(initialData.date));
      setStartTime(initialData.startTime);
      setEndTime(initialData.endTime);
      setChairman(initialData.chairman);
      setChairmanInput(initialData.chairman);
      setChairmanMeta(
        initialData.chairmanEmployeeCode || initialData.chairmanUserId
          ? {
              employeeCode: initialData.chairmanEmployeeCode,
              userId: initialData.chairmanUserId,
            }
          : null,
      );
      setShowChairmanPicker(false);
      setParticipantInput("");
      setParticipants(initialData.participants);
      setFormat(initialData.format);
      setVisibility(initialData.visibility ?? "private");
      setLocation(initialData.location);
      setLocationInput(initialData.location);
      setNotes(initialData.notes);
      setErrors({});
    } else {
      const d0 = defaultDate ?? today();
      setTitle("");
      setDate(d0);
      setDateText(formatDateVN(d0));
      setStartTime(defaultStartTime ?? "08:00");
      setEndTime(defaultEndTime ?? "09:00");
      setChairman("");
      setChairmanInput("");
      setChairmanMeta(null);
      setShowChairmanPicker(false);
      setParticipantInput("");
      setParticipants([]);
      setFormat("offline");
      setVisibility("private");
      setLocation("");
      setLocationInput("");
      setNotes("");
      setErrors({});
    }
  }, [isOpen, defaultDate, defaultStartTime, defaultEndTime, initialData]);

  // Kiểm tra xung đột lịch theo tên người tham gia
  const checkConflict = React.useCallback(
    (name: string): boolean => {
      return existingMeetings.some(
        (m) =>
          m.date === date &&
          timeRangesOverlap(startTime, endTime, m.startTime, m.endTime) &&
          m.participants.some((p) => p.name.toLowerCase() === name.toLowerCase()),
      );
    },
    [existingMeetings, date, startTime, endTime],
  );

  // Cờ trùng lịch derive lúc render — tự cập nhật khi đổi ngày/giờ họp
  const participantsWithConflicts = React.useMemo(
    () => participants.map((p) => ({ ...p, hasConflict: checkConflict(p.name) })),
    [participants, checkConflict],
  );

  const addParticipant = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (participants.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    setParticipants((prev) => [...prev, { name: trimmed }]);
    setParticipantInput("");
  };

  const removeParticipant = (name: string) => {
    setParticipants((prev) => prev.filter((p) => p.name !== name));
  };

  const toggleParticipant = (
    name: string,
    meta?: { employeeCode?: string; userId?: string },
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setParticipants((prev) => {
      const exists = prev.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (exists) {
        return prev.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase());
      }
      return [
        ...prev,
        {
          name: trimmed,
          employeeCode: meta?.employeeCode || undefined,
          userId: meta?.userId || undefined,
        },
      ];
    });
  };


  const handleParticipantKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addParticipant(participantInput);
    } else if (e.key === "Backspace" && !participantInput && participants.length > 0) {
      removeParticipant(participants[participants.length - 1].name);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Vui lòng nhập nội dung cuộc họp";
    if (!date) errs.date = "Vui lòng chọn ngày họp";
    if (!startTime) errs.startTime = "Vui lòng chọn giờ bắt đầu";
    if (!endTime) errs.endTime = "Vui lòng chọn giờ kết thúc";
    if (startTime && endTime && startTime >= endTime) errs.endTime = "Giờ kết thúc phải sau giờ bắt đầu";
    if (!chairman.trim()) errs.chairman = "Vui lòng nhập chủ trì cuộc họp";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const locToSave = location.trim() || locationInput.trim();
    if (locToSave) saveLocation(locToSave);

    // Build meeting data
    const meetingData: MeetingFormData = {
      id: initialData?.id ?? `meeting-${Date.now()}`,
      title: title.trim(),
      date,
      startTime,
      endTime,
      chairman: chairman.trim(),
      chairmanEmployeeCode: chairmanMeta?.employeeCode,
      chairmanUserId: chairmanMeta?.userId,
      participants: participantsWithConflicts,
      format,
      visibility,
      location: locToSave,
      notes: notes.trim(),
      createdById: initialData?.createdById,
      createdByName: initialData?.createdByName,
      readBy: initialData?.readBy,
    };

    // Close modal immediately (optimistic)
    onClose();

    // Call onSave - parent handles API call and loading state
    try {
      await onSave(meetingData);
    } catch {
      // Error is handled by parent
    }
  };

  const filteredSavedLocations = savedLocations.filter(
    (l) => l.toLowerCase().includes(locationInput.toLowerCase()) && locationInput,
  );

  const hasConflicts = participantsWithConflicts.some((p) => p.hasConflict);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? "Chỉnh sửa lịch họp" : "Thêm lịch họp"}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          {hasConflicts && (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
              Một số người tham gia có lịch trùng giờ
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="brand-outline" onClick={onBack ?? onClose} type="button">
              {onBack ? "Quay lại" : "Hủy"}
            </Button>
            <Button variant="brand" onClick={handleSave} type="button" disabled={isLoading}>
              {isLoading ? "Đang lưu..." : isEditMode ? "Cập nhật" : "Lưu & Gửi"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 1. Nội dung cuộc họp */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Nội dung cuộc họp <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Họp tổng kết tháng 5"
            className={clsx(
              "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
              errors.title ? "border-danger" : "border-border",
            )}
          />
          {errors.title && <p className="mt-1 text-xs text-danger">{errors.title}</p>}
        </div>

        {/* 2. Thời gian — ISO 8601, định dạng 24h */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">
            Thời gian <span className="text-danger">*</span>
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              (định dạng 24h — giờ địa phương)
            </span>
          </label>

          {/* Ngày họp — thứ tự ngày / tháng / năm */}
          <div className="mb-2">
            <span className="mb-1 flex items-center justify-between text-xs font-medium text-text-secondary">
              <span>Ngày họp</span>
              {date && (
                <span className="rounded-md bg-teal-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                  {formatWeekdayVN(date)}, {formatDateVN(date)}
                </span>
              )}
            </span>
            <div
              className={clsx(
                "flex items-center gap-1 rounded-lg border bg-surface-overlay px-2 py-1.5",
                "focus-within:ring-2 focus-within:ring-[#1976D2]/15",
                errors.date ? "border-danger" : "border-border",
              )}
            >
              <input
                type="text"
                inputMode="numeric"
                value={dateText}
                onChange={(e) => {
                  const raw = e.target.value;
                  // Cho phép gõ số + dấu /, tự thêm dấu / sau 2 và 4 số
                  const digits = raw.replace(/\D/g, "").slice(0, 8);
                  let formatted = digits;
                  if (digits.length > 4) {
                    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                  } else if (digits.length > 2) {
                    formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                  }
                  setDateText(formatted);
                  // Parse khi đủ 8 số
                  if (digits.length === 8) {
                    const dd = digits.slice(0, 2);
                    const mm = digits.slice(2, 4);
                    const yyyy = digits.slice(4, 8);
                    setDate(`${yyyy}-${mm}-${dd}`);
                  }
                }}
                onBlur={() => {
                  // Đồng bộ lại text từ date hợp lệ; nếu không parse được thì giữ nguyên để user thấy lỗi
                  if (date) setDateText(formatDateVN(date));
                }}
                placeholder="dd/mm/yyyy"
                aria-label="Ngày họp"
                className="flex-1 bg-transparent px-1 font-mono text-sm tabular-nums text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateText(formatDateVN(e.target.value));
                }}
                aria-label="Chọn ngày từ lịch"
                className="ml-auto w-7 cursor-pointer bg-transparent text-text-secondary focus:outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:hidden"
              />
            </div>
            <p className="mt-1 text-[11px] text-text-muted">Tự gõ dd/mm/yyyy hoặc bấm icon lịch để chọn.</p>
          </div>

          {/* Bắt đầu / Kết thúc */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Bắt đầu
              </span>
              <input
                type="time"
                value={startTime}
                step={300}
                onChange={(e) => setStartTime(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary tabular-nums",
                  "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
                  errors.startTime ? "border-danger" : "border-border",
                )}
              />
            </div>
            <div>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Kết thúc
              </span>
              <input
                type="time"
                value={endTime}
                step={300}
                onChange={(e) => setEndTime(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary tabular-nums",
                  "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
                  errors.endTime ? "border-danger" : "border-border",
                )}
              />
            </div>
          </div>

          {/* Tóm tắt thời lượng */}
          {startTime && endTime && startTime < endTime && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-700 dark:text-teal-300">
              <span className="font-mono tabular-nums">
                {startTime} — {endTime}
              </span>
              <span className="text-text-muted">·</span>
              <span>Thời lượng: {formatDuration(startTime, endTime)}</span>
            </p>
          )}

          {(errors.date || errors.startTime || errors.endTime) && (
            <p className="mt-1 text-xs text-danger">
              {errors.date ?? errors.startTime ?? errors.endTime}
            </p>
          )}
        </div>

        {/* 3. Chủ trì */}
        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-text-primary">
              Chủ trì <span className="text-danger">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowChairmanPicker((v) => !v)}
              className={clsx(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-micro",
                chairmanPickerOpen
                  ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                  : "border-border bg-surface-overlay text-text-secondary hover:border-[#1976D2]/50 hover:text-[#1565C0]",
              )}
            >
              @ Chọn từ bạn bè
            </button>
          </div>
          <input
            type="text"
            value={chairmanInput}
            onChange={(e) => {
              setChairmanInput(e.target.value);
              if (!e.target.value.startsWith("@")) {
                setChairman(e.target.value);
                // Gõ tay → tên không còn ứng với người đã chọn từ bạn bè
                setChairmanMeta(null);
              }
            }}
            onBlur={() => {
              // Nếu user gõ @query mà không chọn ai, bỏ ký tự @ khi blur
              if (isChairmanMentioning) {
                setChairmanInput(chairman);
              }
            }}
            placeholder="Họ và tên người chủ trì (gõ @ để tag từ bạn bè)"
            className={clsx(
              "w-full rounded-lg border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15",
              errors.chairman ? "border-danger" : "border-border",
            )}
          />
          {chairmanPickerOpen && (
            <div className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elev2">
              {isFriendsLoading && friendOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  Đang tải danh sách bạn bè…
                </p>
              ) : filteredChairmanOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  {friendOptions.length === 0
                    ? "Bạn chưa có bạn bè nào để tag."
                    : "Không tìm thấy bạn bè phù hợp."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filteredChairmanOptions.map((f) => {
                    const selected = chairman.toLowerCase() === f.name.toLowerCase();
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setChairman(f.name);
                            setChairmanInput(f.name);
                            setChairmanMeta({
                              employeeCode: f.employeeCode || undefined,
                              userId: f.id,
                            });
                            setShowChairmanPicker(false);
                          }}
                          className={clsx(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                            selected ? "bg-[#1976D2]/8" : "hover:bg-surface-hover",
                          )}
                        >
                          <Avatar
                            src={f.avatar ? resolvePublicResourceUrl(f.avatar) : undefined}
                            alt={f.name}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={clsx(
                                  "truncate text-sm font-medium",
                                  selected ? "text-[#1565C0]" : "text-text-primary",
                                )}
                              >
                                {f.name}
                              </span>
                              {f.isSelf && (
                                <span className="shrink-0 rounded-full bg-[#1976D2]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">
                                  Bạn
                                </span>
                              )}
                            </span>
                            {(f.department || f.title) && (
                              <p className="truncate text-[11px] text-text-muted">
                                {[f.title, f.department].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {errors.chairman && <p className="mt-1 text-xs text-danger">{errors.chairman}</p>}
        </div>

        {/* 4. Người tham gia */}
        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-text-primary">
              Người tham gia
            </label>
            <button
              type="button"
              onClick={() => setShowFriendPicker((v) => !v)}
              className={clsx(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-micro",
                pickerOpen
                  ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                  : "border-border bg-surface-overlay text-text-secondary hover:border-[#1976D2]/50 hover:text-[#1565C0]",
              )}
            >
              @ Chọn từ bạn bè
            </button>
          </div>
          <div
            className={clsx(
              "flex min-h-[40px] flex-wrap gap-1.5 rounded-lg border border-border bg-surface-overlay px-2.5 py-1.5",
              "focus-within:ring-2 focus-within:ring-[#1976D2]/15",
            )}
          >
            {participantsWithConflicts.map((p) => (
              <span
                key={p.name}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                  p.hasConflict
                    ? "bg-danger/10 text-danger ring-1 ring-danger/30"
                    : "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200",
                )}
                title={p.hasConflict ? "Người này có lịch trùng giờ họp" : undefined}
              >
                {p.hasConflict && <ExclamationTriangleIcon className="h-3 w-3" />}
                {p.name}
                <button
                  type="button"
                  onClick={() => removeParticipant(p.name)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              onKeyDown={handleParticipantKeyDown}
              onBlur={() => {
                if (!isMentioning) addParticipant(participantInput);
              }}
              placeholder={
                participants.length === 0
                  ? "Nhập tên, gõ @ để tag từ bạn bè, Enter/dấu phẩy để thêm"
                  : ""
              }
              className="min-w-[180px] flex-1 bg-transparent py-0.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
          </div>

          {/* Gợi ý chọn từ bạn bè */}
          {pickerOpen && (
            <div className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elev2">
              {isFriendsLoading && friendOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  Đang tải danh sách bạn bè…
                </p>
              ) : filteredFriendOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  {friendOptions.length === 0
                    ? "Bạn chưa có bạn bè nào để tag."
                    : "Không tìm thấy bạn bè phù hợp."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {filteredFriendOptions.map((f) => {
                    const checked = participants.some(
                      (p) => p.name.toLowerCase() === f.name.toLowerCase(),
                    );
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => {
                            toggleParticipant(f.name, {
                              employeeCode: f.employeeCode,
                              userId: f.id,
                            });
                            if (isMentioning) setParticipantInput("");
                          }}
                          className={clsx(
                            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                            checked
                              ? "bg-teal-500/10"
                              : "hover:bg-surface-hover",
                          )}
                        >
                          <span
                            className={clsx(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              checked
                                ? "border-[#1565C0] bg-[#1565C0] text-white"
                                : "border-border bg-surface-overlay",
                            )}
                          >
                            {checked && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2.5 6.5L5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <Avatar
                            src={f.avatar ? resolvePublicResourceUrl(f.avatar) : undefined}
                            alt={f.name}
                            size="sm"
                            className="shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={clsx(
                                  "truncate text-sm font-medium",
                                  checked
                                    ? "text-teal-700 dark:text-teal-300"
                                    : "text-text-primary",
                                )}
                              >
                                {f.name}
                              </span>
                              {f.isSelf && (
                                <span className="shrink-0 rounded-full bg-[#1976D2]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">
                                  Bạn
                                </span>
                              )}
                            </span>
                            {(f.department || f.title) && (
                              <p className="truncate text-[11px] text-text-muted">
                                {[f.title, f.department].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <p className="mt-1 text-[11px] text-text-muted">
            Gõ <span className="font-mono text-teal-600 dark:text-teal-400">@</span> để tag từ bạn bè · Tag đỏ = có lịch trùng giờ, vẫn có thể thêm.
          </p>
        </div>

        {/* 5. Hình thức */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">Hình thức họp</label>
          <div className="flex gap-2">
            {(["offline", "online"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={clsx(
                  "rounded-lg border px-4 py-1.5 text-sm font-medium transition-micro",
                  format === f && f === "offline" && "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]",
                  format === f && f === "online" && "border-teal-500/60 bg-teal-500/10 text-teal-600 dark:text-teal-400",
                  format !== f && "border-border bg-surface-overlay text-text-secondary hover:bg-surface-hover",
                )}
              >
                {f === "offline" ? "Trực tiếp (Offline)" : "Trực tuyến (Online)"}
              </button>
            ))}
          </div>
        </div>

        {/* 5b. Quyền xem (riêng tư / công khai) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">Quyền xem</label>
          <div className="flex gap-2">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={clsx(
                  "flex-1 rounded-lg border px-4 py-1.5 text-sm font-medium transition-micro",
                  visibility === v
                    ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                    : "border-border bg-surface-overlay text-text-secondary hover:bg-surface-hover",
                )}
              >
                {v === "private" ? "Riêng tư" : "Công khai"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            {visibility === "private"
              ? "Riêng tư: người khác xem lịch của bạn chỉ thấy ô “Bận”, không thấy nội dung."
              : "Công khai: ai xem lịch của bạn cũng thấy đầy đủ chi tiết sự kiện."}
          </p>
        </div>

        {/* 6. Địa điểm */}
        <div className="relative">
          <label className="mb-1 block text-sm font-medium text-text-primary">Địa điểm họp</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={location || locationInput}
                onChange={(e) => {
                  setLocation("");
                  setLocationInput(e.target.value);
                  setShowLocationSuggestions(true);
                }}
                onFocus={() => setShowLocationSuggestions(true)}
                onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
                placeholder="Nhập địa điểm hoặc chọn từ danh sách đã lưu"
                className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15"
              />
              {showLocationSuggestions && filteredSavedLocations.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-elev2">
                  {filteredSavedLocations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onMouseDown={() => {
                        setLocation(loc);
                        setLocationInput(loc);
                        setShowLocationSuggestions(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Địa điểm mới sẽ được lưu để dùng lại sau.
          </p>
        </div>

        {/* 7. Ghi chú */}
        <div>
          <label className="mb-1 block text-sm font-medium text-text-primary">Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thêm ghi chú cho cuộc họp (nếu có)..."
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15 resize-none"
          />
        </div>
      </div>
    </Modal>
  );
};

export default MeetingFormModal;
