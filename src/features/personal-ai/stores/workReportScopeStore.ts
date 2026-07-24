import { create } from "zustand";
import type { WorkReportScope } from "../types";

/**
 * Lựa chọn phạm vi báo cáo công việc đa-scope (spec FE 24/07/2026).
 *
 * Token opaque, KHÔNG decode/sửa/lưu dài hạn: store này chỉ sống trong memory
 * của phiên (không persist middleware, không localStorage) đúng theo §3 spec.
 * Đây là NGUỒN DUY NHẤT của `scope_token` — mọi API ở §4 lấy token từ đây qua
 * `getScopeToken()`, không tự truyền `company`/`department`/`scopeId`.
 */
interface WorkReportScopeState {
  /** Danh sách authorization BE trả về; null = chưa nạp. */
  scopes: WorkReportScope[] | null;
  /** Authorization đang chọn; null = chưa chọn → API §4 phải chờ. */
  selected: WorkReportScope | null;
  /** Đang mở widget bắt buộc chọn scope (count > 1 hoặc BE trả 400/403). */
  isPicking: boolean;
  /** Câu hỏi chat bị hoãn để chờ chọn scope, gửi lại sau khi chọn. */
  pendingQuestion: string | null;
  /**
   * Tăng mỗi lần đổi scope (§5). Component đang giữ bảng/snapshot export dùng
   * giá trị này làm key/dep để bỏ dữ liệu scope cũ, không trộn hai scope.
   */
  dataEpoch: number;

  setScopes: (scopes: WorkReportScope[]) => void;
  select: (scope: WorkReportScope) => void;
  requirePick: (pendingQuestion?: string) => void;
  /** Xóa lựa chọn khi 403 (token hết hạn / quyền bị thu hồi / đổi version). */
  clearSelection: () => void;
  cancelPick: () => void;
  reset: () => void;
}

export const useWorkReportScopeStore = create<WorkReportScopeState>((set) => ({
  scopes: null,
  selected: null,
  isPicking: false,
  pendingQuestion: null,
  dataEpoch: 0,

  setScopes: (scopes) =>
    set(() => ({
      scopes,
      // count == 1 → FE tự chọn nhưng vẫn giữ token (§3). count > 1 → bắt chọn.
      selected: scopes.length === 1 ? scopes[0] : null,
      isPicking: scopes.length > 1,
    })),

  select: (scope) =>
    set((state) => {
      // §5: đổi lựa chọn → dữ liệu/snapshot export của scope cũ không còn hợp lệ.
      // Bump `dataEpoch` để caller (bảng, export, danh sách file) bỏ kết quả cũ
      // thay vì trộn dữ liệu giữa hai scope.
      const changed = state.selected?.authorizationId !== scope.authorizationId;
      return {
        selected: scope,
        isPicking: false,
        dataEpoch: changed ? state.dataEpoch + 1 : state.dataEpoch,
      };
    }),

  requirePick: (pendingQuestion) =>
    set((state) => ({
      isPicking: true,
      pendingQuestion: pendingQuestion ?? state.pendingQuestion,
    })),

  clearSelection: () =>
    set((state) => ({
      selected: null,
      scopes: null,
      isPicking: true,
      dataEpoch: state.dataEpoch + 1,
    })),

  cancelPick: () => set(() => ({ isPicking: false, pendingQuestion: null })),

  reset: () =>
    set((state) => ({
      scopes: null,
      selected: null,
      isPicking: false,
      pendingQuestion: null,
      dataEpoch: state.dataEpoch + 1,
    })),
}));

/**
 * Token của scope đang chọn (undefined = chưa chọn).
 *
 * Đọc ngoài React (service layer) nên dùng `getState()` thay vì hook.
 */
export function getScopeToken(): string | undefined {
  return useWorkReportScopeStore.getState().selected?.selectionToken || undefined;
}

/** Gắn `scope_token` vào query string nếu đang có lựa chọn (§4). */
export function appendScopeToken(params: URLSearchParams): URLSearchParams {
  const token = getScopeToken();
  if (token) params.set("scope_token", token);
  return params;
}

/**
 * Xử lý lỗi liên quan scope theo §5, dùng chung cho mọi caller ở §4.
 *
 *  - 400: chưa chọn scope → mở widget.
 *  - 403: token sai/hết hạn, quyền bị thu hồi/đổi version → XÓA lựa chọn hiện
 *    tại (kể cả danh sách, để nạp lại `/scopes`) rồi bắt chọn lại.
 *  - 401/503: KHÔNG đụng vào lựa chọn (401 là hết phiên đăng nhập; 503 phải
 *    retry, không fallback sang scope cũ) → trả false cho caller tự xử lý.
 *
 * @returns true nếu đã chuyển sang trạng thái bắt chọn scope.
 */
export function handleScopeErrorStatus(status: number): boolean {
  const store = useWorkReportScopeStore.getState();
  if (status === 400) {
    store.requirePick();
    return true;
  }
  if (status === 403) {
    store.clearSelection();
    return true;
  }
  return false;
}

/**
 * Gắn `scope_token` vào một URL đã dựng sẵn (§4).
 *
 * Dùng URL API để token được encode đúng, không nối chuỗi thủ công. URL tương
 * đối được parse tạm với origin hiện tại rồi trả lại đúng dạng ban đầu.
 */
export function appendScopeTokenToUrl(url: string): string {
  const token = getScopeToken();
  if (!token) return url;
  try {
    const isAbsolute = /^https?:\/\//i.test(url);
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("scope_token", token);
    return isAbsolute ? parsed.href : `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Trộn `scope_token` vào JSON body nếu đang có lựa chọn (§4). */
export function withScopeToken<T extends object>(body: T): T & { scope_token?: string } {
  const token = getScopeToken();
  return token ? { ...body, scope_token: token } : body;
}
