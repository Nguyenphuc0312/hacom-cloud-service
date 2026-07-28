/**
 * MeetingFormModal — form thêm lịch họp trong WeeklyCalendarWidget
 */

import React from "react";
import clsx from "clsx";
import { XMarkIcon, ExclamationTriangleIcon, UsersIcon } from "@heroicons/react/24/outline";
import { Modal, ConfirmDialog } from "./Modal";
import { Button } from "./Button";
import { CalendarAttachmentZone, type CalendarLocalAttachment } from "./CalendarAttachmentZone";
import { useFriendshipStore } from "../../stores/friendshipStore";
import { useAuthStore } from "../../stores/authStore";
import {
  useChatUserSearch,
  type ChatSearchUser,
} from "../../features/chat/hooks/useChatUserSearch";
import { Avatar } from "../common/Avatar";
import { loadUserProfiles } from "../../services/userBatchLoader";
import { resolvePublicResourceUrl } from "../../config";
import { conversationApi } from "../../services/api";
import { getConversationByIdUseCase } from "../../features/chat/usecases/getConversationById";
import { unwrapApiSuccess } from "../../lib/apiContract";
import { RoomType, type Conversation } from "../../types";

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
  /** File đính kèm — BE cần bổ sung purpose `calendar_attachment` để upload thật. */
  attachments: CalendarLocalAttachment[];
  /** ID của người tạo lịch — dùng để phân quyền sửa/xóa */
  createdById?: string;
  /** Tên hiển thị người tạo lịch */
  createdByName?: string;
  /** Chat user id (auth UUID) của người tạo — để tra avatar khi mở form Sửa.
   *  Thiếu field này thì hàng "Người tạo" mất avatar sau khi cập nhật. */
  createdByUserId?: string;
  /** Avatar người tạo nếu nguồn dữ liệu đã có sẵn (khỏi tra lại). */
  createdByAvatarUrl?: string;
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

/** Map kết quả tìm user toàn công ty → shape option của picker (giống friendOptions). */
const searchUserToOption = (u: ChatSearchUser) => ({
  id: u.id,
  name: u.displayName,
  avatar: u.avatarUrl ?? "",
  employeeCode: u.employeeCode ?? "",
  department: u.departmentName ?? "",
  title: u.title ?? "",
  isSelf: false as const,
});

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
  const [attachments, setAttachments] = React.useState<CalendarLocalAttachment[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);

  // Sửa lịch → luôn hỏi trước khi bỏ; thêm mới → chỉ hỏi khi đã nhập nội dung/
  // ghi chú/thêm người tham gia hoặc đính kèm (tránh làm phiền form trống).
  const leaveAction = onBack ?? onClose;
  const hasContent =
    isEditMode ||
    !!title.trim() ||
    !!notes.trim() ||
    participants.length > 0 ||
    attachments.length > 0;
  const requestCancel = () => {
    if (hasContent) setShowCancelConfirm(true);
    else leaveAction();
  };

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
        title: f.title || "",
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
      title: currentUser.title || "",
      isSelf: true as const,
    };
  }, [currentUser, looksLikeCode]);
  // Avatar người tạo khi Sửa: event chỉ mang tên + authUserId, không mang ảnh →
  // tra qua batch loader (cùng nguồn với EventDetailModal / avatar stack), nếu
  // không thì để Avatar tự fallback initials. Trước đây hard-code "" nên hàng
  // "Người tạo" mất avatar mỗi lần mở form Sửa.
  const creatorUserId = initialData?.createdByUserId;
  const knownCreatorAvatar = initialData?.createdByAvatarUrl;
  // Chỉ fetch khi nguồn dữ liệu chưa kèm sẵn ảnh; kết quả giữ theo userId để đổi
  // event là tự hết hiệu lực (không cần reset state).
  const [fetchedAvatarByUserId, setFetchedAvatarByUserId] = React.useState<
    Record<string, string>
  >({});
  React.useEffect(() => {
    if (!isOpen || !isEditMode || !creatorUserId || knownCreatorAvatar) return;
    let cancelled = false;
    void loadUserProfiles([creatorUserId]).then((profiles) => {
      const url = profiles[creatorUserId]?.avatarUrl;
      if (cancelled || !url) return;
      setFetchedAvatarByUserId((prev) => ({ ...prev, [creatorUserId]: url }));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isEditMode, creatorUserId, knownCreatorAvatar]);
  const creatorAvatar =
    knownCreatorAvatar ?? (creatorUserId ? fetchedAvatarByUserId[creatorUserId] : "") ?? "";

  // Người tạo ≠ chủ trì: tạo mới → chính bạn; sửa → owner của event (không đổi được).
  const creator = isEditMode
    ? {
        name: initialData?.createdByName || "Không rõ",
        avatar: creatorAvatar,
        isSelf: currentUser?.id != null && creatorUserId === currentUser.id,
      }
    : { name: selfOption?.name ?? "", avatar: selfOption?.avatar ?? "", isSelf: true };

  // Picker mở khi ô nhập đang được dùng (focus) hoặc đang gõ @ — không cần nút
  // "Chọn người" riêng, nó trùng chức năng với chính ô nhập ngay bên dưới.
  const [participantInputFocused, setParticipantInputFocused] = React.useState(false);
  const mentionQuery = participantInput.startsWith("@")
    ? participantInput.slice(1).trim().toLowerCase()
    : "";
  const isMentioning = participantInput.startsWith("@");
  const pickerOpen = participantInputFocused || isMentioning;

  // --- Thêm cả nhóm chat vào người tham gia (tick 1 nhóm → add hết thành viên) ---
  // Nhóm = hội thoại chat GROUP có sẵn, không phải khái niệm "đơn vị HR" (BE chưa
  // hỗ trợ mời theo phòng ban — xem CALENDAR_SPEC.md #15). Mỗi thành viên vẫn được
  // gửi lên BE như 1 participant ref riêng lẻ (participantIds), không đổi contract.
  const [participantTab, setParticipantTab] = React.useState<"person" | "group">("person");
  const [groupList, setGroupList] = React.useState<Conversation[] | null>(null);
  // Đang tải = đã bắt đầu fetch (tab group + chưa có kết quả) — derive thay vì thêm
  // state riêng, và tránh setState đồng bộ ngay trong effect (react-hooks/set-state-in-effect).
  const groupListLoading = participantTab === "group" && groupList === null;
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null);
  const [groupMembers, setGroupMembers] = React.useState<Conversation["participants"]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen || participantTab !== "group" || groupList !== null) return;
    let cancelled = false;
    void conversationApi
      .getConversations(1, 100)
      .then((res) => {
        if (cancelled) return;
        const rows = unwrapApiSuccess(res);
        setGroupList((Array.isArray(rows) ? rows : []).filter((c) => c.type === RoomType.GROUP));
      })
      .catch(() => {
        if (!cancelled) setGroupList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, participantTab, groupList]);

  const openGroupMembers = (groupId: string) => {
    setActiveGroupId(groupId);
    setGroupMembers([]);
    setGroupMembersLoading(true);
    void getConversationByIdUseCase(groupId)
      .then((res) => {
        if (res.success) {
          setGroupMembers(res.data.participants ?? []);
        }
      })
      .finally(() => setGroupMembersLoading(false));
  };

  const allGroupMembersAdded =
    !!groupMembers?.length &&
    groupMembers.every((m) =>
      participants.some((p) => p.userId === m.id || p.name.toLowerCase() === (m.displayName ?? m.username).toLowerCase()),
    );

  const toggleWholeGroup = () => {
    if (!groupMembers?.length) return;
    if (allGroupMembersAdded) {
      const memberIds = new Set(groupMembers.map((m) => m.id));
      setParticipants((prev) => prev.filter((p) => !p.userId || !memberIds.has(p.userId)));
      return;
    }
    setParticipants((prev) => {
      const next = [...prev];
      for (const m of groupMembers) {
        const name = (m.displayName ?? m.username ?? "").trim();
        if (!name) continue;
        const exists = next.some(
          (p) => p.userId === m.id || p.name.toLowerCase() === name.toLowerCase(),
        );
        if (!exists) {
          next.push({ name, userId: m.id, employeeCode: m.employeeCode ?? undefined });
        }
      }
      return next;
    });
  };

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

  // Tìm TOÀN CÔNG TY (không giới hạn bạn bè) — BE resolve participant qua
  // employeeId/employeeCode/authUserId nên người chưa kết bạn vẫn nhận được lịch.
  const chairmanQuery = isChairmanMentioning ? chairmanMentionQuery : chairmanInput.trim();
  const participantQuery = isMentioning ? mentionQuery : participantInput.trim();
  const chairmanSearch = useChatUserSearch(chairmanQuery, {
    enabled: isOpen && chairmanPickerOpen,
  });
  const participantSearch = useChatUserSearch(participantQuery, {
    enabled: isOpen && pickerOpen,
  });
  const knownIds = React.useMemo(() => {
    const ids = new Set(friendOptions.map((f) => f.id));
    if (selfOption) ids.add(selfOption.id);
    return ids;
  }, [friendOptions, selfOption]);
  const chairmanDirectoryOptions = React.useMemo(
    () => chairmanSearch.results.filter((u) => !knownIds.has(u.id)).map(searchUserToOption),
    [chairmanSearch.results, knownIds],
  );
  const participantDirectoryOptions = React.useMemo(
    () => participantSearch.results.filter((u) => !knownIds.has(u.id)).map(searchUserToOption),
    [participantSearch.results, knownIds],
  );
  const chairmanList = [...filteredChairmanOptions, ...chairmanDirectoryOptions];
  const participantList = [...filteredFriendOptions, ...participantDirectoryOptions];

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
      setAttachments(initialData.attachments ?? []);
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
      setAttachments([]);
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
    if (!chairman.trim()) {
      errs.chairman = "Vui lòng nhập chủ trì cuộc họp";
    } else if (!chairmanMeta && chairman.trim() !== initialData?.chairman?.trim()) {
      // Gõ tay tên trơn → không có identity gửi lên BE (meetingChairmanRef), lịch
      // sinh ra mất avatar chủ trì vĩnh viễn và không phân quyền chủ trì được.
      // Chỉ chặn khi tên VỪA ĐỔI: lịch cũ (chưa có identity) sửa việc khác vẫn lưu
      // được, không bắt người dùng dọn dữ liệu cũ mới sửa được giờ họp.
      errs.chairman = "Vui lòng chọn chủ trì từ danh sách (gõ @ để tìm)";
    }
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
      attachments,
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
      onClose={requestCancel}
      title={isEditMode ? "Chỉnh sửa lịch họp" : "Thêm lịch họp"}
      size="lg"
      footer={
        // Hủy (góc trái) tách xa Lưu & Gửi (góc phải) để tránh bấm nhầm;
        // cảnh báo trùng lịch nằm cạnh nút Lưu.
        <div className="flex items-center justify-between gap-3">
          <Button variant="brand-outline" onClick={requestCancel} type="button">
            {onBack ? "Quay lại" : "Hủy"}
          </Button>
          <div className="flex items-center gap-3">
            {hasConflicts && (
              <p className="flex items-center gap-1.5 text-xs text-danger">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                Một số người tham gia có lịch trùng giờ
              </p>
            )}
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

        {/* 2b. Người tạo — chỉ hiển thị, có thể khác chủ trì */}
        {creator.name && (
          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Người tạo</label>
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-overlay px-3 py-2">
              <Avatar
                src={creator.avatar ? resolvePublicResourceUrl(creator.avatar) : undefined}
                alt={creator.name}
                size="sm"
                className="shrink-0"
              />
              <span className="truncate text-sm font-medium text-text-primary">{creator.name}</span>
              {creator.isSelf && (
                <span className="shrink-0 rounded-full bg-[#1976D2]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#1565C0]">
                  Bạn
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              Người tạo lịch có thể khác với người chủ trì cuộc họp.
            </p>
          </div>
        )}

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
              @ Chọn người
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
            placeholder="Họ và tên người chủ trì (gõ @ để tìm trong công ty)"
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
              ) : chairmanList.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  {chairmanSearch.isLoading
                    ? "Đang tìm…"
                    : chairmanQuery.length >= 2
                      ? "Không tìm thấy người phù hợp."
                      : "Gõ tên (từ 2 ký tự) để tìm bất kỳ ai trong công ty."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {chairmanList.map((f) => {
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
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setParticipantTab("person")}
                className={clsx(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-micro",
                  participantTab === "person"
                    ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                    : "border-border bg-surface-overlay text-text-secondary hover:border-[#1976D2]/50 hover:text-[#1565C0]",
                )}
              >
                Từng người
              </button>
              <button
                type="button"
                onClick={() => setParticipantTab("group")}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-micro",
                  participantTab === "group"
                    ? "border-[#1976D2]/60 bg-[#1976D2]/10 text-[#1565C0]"
                    : "border-border bg-surface-overlay text-text-secondary hover:border-[#1976D2]/50 hover:text-[#1565C0]",
                )}
              >
                <UsersIcon className="h-3 w-3" />
                Nhóm chat
              </button>
            </div>
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
            {participantTab === "person" && (
              <input
                type="text"
                value={participantInput}
                onChange={(e) => setParticipantInput(e.target.value)}
                onKeyDown={handleParticipantKeyDown}
                onFocus={() => setParticipantInputFocused(true)}
                onBlur={() => {
                  setParticipantInputFocused(false);
                  if (!isMentioning) addParticipant(participantInput);
                }}
                placeholder={
                  participants.length === 0
                    ? "Nhập tên, gõ @ để tìm trong công ty, Enter/dấu phẩy để thêm"
                    : ""
                }
                className="min-w-[180px] flex-1 bg-transparent py-0.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            )}
          </div>

          {/* Chọn cả nhóm chat — tick 1 nhóm để add hết thành viên vào danh sách trên */}
          {participantTab === "group" && (
            <div className="mt-1.5 flex gap-2">
              <div className="max-h-72 w-2/5 shrink-0 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elev2">
                {groupListLoading ? (
                  <p className="px-2 py-3 text-center text-xs text-text-muted">Đang tải nhóm…</p>
                ) : !groupList?.length ? (
                  <p className="px-2 py-3 text-center text-xs text-text-muted">Bạn chưa ở trong nhóm chat nào.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {groupList.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => openGroupMembers(g.id)}
                          className={clsx(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                            activeGroupId === g.id ? "bg-[#1976D2]/10 text-[#1565C0]" : "hover:bg-surface-hover text-text-primary",
                          )}
                        >
                          <Avatar
                            src={g.avatar ? resolvePublicResourceUrl(g.avatar) : undefined}
                            alt={g.displayName ?? g.name ?? "Nhóm"}
                            size="sm"
                            className="shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {g.displayName ?? g.name ?? "Nhóm không tên"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="max-h-72 flex-1 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elev2">
                {!activeGroupId ? (
                  <p className="px-2 py-3 text-center text-xs text-text-muted">Chọn 1 nhóm bên trái để xem thành viên.</p>
                ) : groupMembersLoading ? (
                  <p className="px-2 py-3 text-center text-xs text-text-muted">Đang tải thành viên…</p>
                ) : !groupMembers?.length ? (
                  <p className="px-2 py-3 text-center text-xs text-text-muted">Nhóm này chưa có thành viên.</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={toggleWholeGroup}
                      className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-[#1565C0] hover:bg-[#1976D2]/10"
                    >
                      <UsersIcon className="h-3.5 w-3.5" />
                      {allGroupMembersAdded ? "Bỏ chọn cả nhóm" : `Thêm cả nhóm (${groupMembers.length} người)`}
                    </button>
                    <ul className="space-y-0.5">
                      {groupMembers.map((m) => {
                        const name = (m.displayName ?? m.username ?? "").trim();
                        const checked = participants.some(
                          (p) => p.userId === m.id || p.name.toLowerCase() === name.toLowerCase(),
                        );
                        return (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() =>
                                toggleParticipant(name, { userId: m.id, employeeCode: m.employeeCode ?? undefined })
                              }
                              className={clsx(
                                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                                checked ? "bg-teal-500/10" : "hover:bg-surface-hover",
                              )}
                            >
                              <span
                                className={clsx(
                                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                  checked ? "border-[#1565C0] bg-[#1565C0] text-white" : "border-border bg-surface-overlay",
                                )}
                              >
                                {checked && (
                                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2.5 6.5L5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <Avatar
                                src={m.avatar ? resolvePublicResourceUrl(m.avatar) : undefined}
                                alt={name}
                                size="sm"
                                className="shrink-0"
                              />
                              <span className={clsx("truncate text-sm font-medium", checked ? "text-teal-700 dark:text-teal-300" : "text-text-primary")}>
                                {name}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Gợi ý chọn từ bạn bè */}
          {participantTab === "person" && pickerOpen && (
            <div className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-elev2">
              {isFriendsLoading && friendOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  Đang tải danh sách bạn bè…
                </p>
              ) : participantList.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-text-muted">
                  {participantSearch.isLoading
                    ? "Đang tìm…"
                    : participantQuery.length >= 2
                      ? "Không tìm thấy người phù hợp."
                      : "Gõ tên (từ 2 ký tự) để tìm bất kỳ ai trong công ty."}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {participantList.map((f) => {
                    const checked = participants.some(
                      (p) => p.name.toLowerCase() === f.name.toLowerCase(),
                    );
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          // Chặn blur của ô nhập: blur sẽ add chuỗi đang gõ thành
                          // free-text VÀ re-render list làm rớt cú click này.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            toggleParticipant(f.name, {
                              employeeCode: f.employeeCode,
                              userId: f.id,
                            });
                            setParticipantInput("");
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
            {participantTab === "person" ? (
              <>Gõ <span className="font-mono text-teal-600 dark:text-teal-400">@</span> để tìm bất kỳ ai trong công ty (không cần là bạn bè) · Tag đỏ = có lịch trùng giờ, vẫn có thể thêm.</>
            ) : (
              "Chọn 1 nhóm chat để thêm nhanh cả nhóm; vẫn có thể bỏ bớt từng người sau khi thêm."
            )}
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

        {/* 6. Địa điểm / Link họp — cùng field "location" ở BE, chỉ đổi nhãn theo
            hình thức. Online chưa có kiểu link có cấu trúc (provider/url riêng)
            ở BE — xem CALENDAR_SPEC.md #14 — nên dùng free-text location sẵn có,
            paste thẳng URL Meet/Zoom/Teams vào đây. */}
        <div className="relative">
          <label className="mb-1 block text-sm font-medium text-text-primary">
            {format === "online" ? "Link họp trực tuyến" : "Địa điểm họp"}
          </label>
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
                placeholder={
                  format === "online"
                    ? "Dán link Google Meet / Zoom / Teams…"
                    : "Nhập địa điểm hoặc chọn từ danh sách đã lưu"
                }
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
            {format === "online"
              ? "Người tham gia sẽ thấy link này trong chi tiết lịch để bấm vào tham gia."
              : "Địa điểm mới sẽ được lưu để dùng lại sau."}
          </p>
        </div>

        {/* 7. Ghi chú + Đính kèm */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">Ghi chú</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thêm ghi chú cho cuộc họp (nếu có)..."
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-[#1976D2]/15 resize-none"
          />
          <CalendarAttachmentZone attachments={attachments} onChange={setAttachments} />
        </div>
      </div>
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => {
          setShowCancelConfirm(false);
          leaveAction();
        }}
        title={onBack ? "Quay lại" : "Hủy thay đổi"}
        message="Bạn có thay đổi chưa lưu. Thoát bây giờ sẽ mất các thay đổi này. Tiếp tục?"
        confirmText={onBack ? "Quay lại" : "Thoát"}
        cancelText="Ở lại"
        variant="warning"
      />
    </Modal>
  );
};

export default MeetingFormModal;
