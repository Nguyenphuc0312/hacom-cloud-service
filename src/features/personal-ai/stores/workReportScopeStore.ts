import { create } from "zustand";
import type { WorkReportCapability, WorkReportScope } from "../types";

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
   * Capability của thao tác đang chọn scope (§3). Giữ lại để khi BE trả 403
   * (token hết hạn / quyền đổi version) nạp lại ĐÚNG `/scopes?capability=...`
   * thay vì danh sách chung — nếu không sẽ hiện scope của capability khác.
   * null = chưa biết (luồng SSE cũ / nạp không kèm capability).
   */
  capability: WorkReportCapability | null;
  /**
   * Tăng mỗi lần đổi scope (§5). Component đang giữ bảng/snapshot export dùng
   * giá trị này làm key/dep để bỏ dữ liệu scope cũ, không trộn hai scope.
   */
  dataEpoch: number;
  /**
   * Khóa danh tính của lựa chọn scope hiện tại = `authUserId|capability` (§7).
   * Token scope chỉ hợp lệ cho đúng người + đúng thao tác đã nạp nó. Khi user
   * hoặc capability đổi (đổi tag, đổi quyền, đăng nhập tài khoản khác), khóa
   * lệch → KHÔNG tái sử dụng token cũ; `ensureScopeKey` xóa lựa chọn để nạp lại.
   * null = chưa có lựa chọn gắn khóa. (authorizationVersion nằm trong token BE
   * ký, BE tự kiểm khi verify — FE khóa theo user+capability là đủ ở client.)
   */
  scopeKey: string | null;

  setScopes: (scopes: WorkReportScope[], capability?: WorkReportCapability) => void;
  select: (scope: WorkReportScope) => void;
  requirePick: (pendingQuestion?: string, capability?: WorkReportCapability) => void;
  /**
   * Chốt khóa `authUserId|capability` cho lựa chọn sắp nạp (§7). Nếu khóa mới
   * khác khóa đang giữ → xóa lựa chọn/scopes cũ (không tái dùng token của thao
   * tác/tài khoản khác) rồi ghi khóa mới. Gọi TRƯỚC mỗi lần pre-flight/gửi.
   * @returns true nếu khóa đổi (đã xóa lựa chọn cũ) — caller nên nạp lại /scopes.
   */
  ensureScopeKey: (authUserId: string, capability: WorkReportCapability) => boolean;
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
  capability: null,
  dataEpoch: 0,
  scopeKey: null,

  setScopes: (scopes, capability) =>
    set((state) => ({
      scopes,
      // UX chốt lại: LUÔN mở dropdown khi có scope. count == 1 → pre-select sẵn
      // lựa chọn duy nhất (giữ token) nhưng vẫn `isPicking` để widget hiện ra,
      // user phải xác nhận. count > 1 → chưa chọn, bắt user chọn.
      selected: scopes.length === 1 ? scopes[0] : null,
      isPicking: scopes.length > 0,
      // Giữ capability để nạp lại đúng khi 403; không truyền thì giữ giá trị cũ.
      capability: capability ?? state.capability,
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

  requirePick: (pendingQuestion, capability) =>
    set((state) => ({
      isPicking: true,
      pendingQuestion: pendingQuestion ?? state.pendingQuestion,
      capability: capability ?? state.capability,
    })),

  ensureScopeKey: (authUserId, capability) => {
    const key = `${authUserId}|${capability}`;
    let changed = false;
    set((state) => {
      if (state.scopeKey === key) return {}; // cùng người + thao tác → giữ nguyên.
      // Khóa đổi → token cũ (nếu có) thuộc thao tác/tài khoản khác, KHÔNG tái
      // dùng. Xóa lựa chọn + danh sách để buộc nạp lại /scopes?capability đúng.
      changed = state.selected !== null || state.scopes !== null;
      return {
        scopeKey: key,
        selected: null,
        scopes: null,
        capability,
        dataEpoch: changed ? state.dataEpoch + 1 : state.dataEpoch,
      };
    });
    return changed;
  },

  clearSelection: () =>
    set((state) => ({
      selected: null,
      scopes: null,
      isPicking: true,
      // Giữ `capability` để selector nạp lại đúng `/scopes?capability` (§7 — 403).
      dataEpoch: state.dataEpoch + 1,
    })),

  cancelPick: () => set(() => ({ isPicking: false, pendingQuestion: null })),

  reset: () =>
    set((state) => ({
      scopes: null,
      selected: null,
      isPicking: false,
      pendingQuestion: null,
      capability: null,
      scopeKey: null,
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
