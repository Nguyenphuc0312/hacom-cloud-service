import { useEffect, useRef, type RefObject } from "react";

type ElementRef = RefObject<HTMLElement | null>;

interface UseClickOutsideOptions {
  /** Chỉ gắn listener khi true (menu đang mở). Mặc định true — cho component chỉ mount lúc mở. */
  active?: boolean;
  /** Đóng thêm khi nhấn Escape. Mặc định false để giữ nguyên hành vi nơi chưa có. */
  escape?: boolean;
  /** Gắn listener ở capture phase (đóng trước khi handler khác kịp chạy). */
  capture?: boolean;
}

/**
 * Đóng dropdown/popover khi mousedown ra ngoài (mọi) `refs` — và Escape nếu bật.
 * Gom ~15 bản copy effect outside-click giống nhau rải khắp repo về một chỗ.
 * Truyền nhiều ref (anchor + popover) thì "ngoài" nghĩa là ngoài tất cả;
 * ref đang null (chưa mount) được bỏ qua.
 */
export function useClickOutside(
  refs: ElementRef | ElementRef[],
  onDismiss: () => void,
  { active = true, escape = false, capture = false }: UseClickOutsideOptions = {},
): void {
  // Đọc refs/callback qua ref-mới-nhất để không phải gỡ/gắn lại listener mỗi
  // render — caller thường truyền arrow function và mảng refs inline.
  const latest = useRef({ refs, onDismiss });
  useEffect(() => {
    latest.current = { refs, onDismiss };
  });

  useEffect(() => {
    if (!active) return;

    const onMouseDown = (event: MouseEvent) => {
      const { refs: current, onDismiss: dismiss } = latest.current;
      const list = Array.isArray(current) ? current : [current];
      const target = event.target as Node;
      if (!list.some((ref) => ref.current?.contains(target))) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current.onDismiss();
    };

    document.addEventListener("mousedown", onMouseDown, capture);
    if (escape) document.addEventListener("keydown", onKeyDown, capture);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, capture);
      if (escape) document.removeEventListener("keydown", onKeyDown, capture);
    };
  }, [active, escape, capture]);
}
