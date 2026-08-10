/**
 * @fileoverview OfficeOnlinePreview — xem Word/Excel/PowerPoint bằng **Microsoft
 * Office Online viewer**, đúng cách Zalo Web đang làm.
 *
 * Vì sao dùng cái này thay vì tự render (docx-preview / SheetJS):
 * không thư viện JS miễn phí nào dựng lại được đúng bố cục Office (merge cell,
 * shape, header/footer, phân trang, font). Office Online là chính Microsoft
 * render nên khớp 100% với lúc mở bằng Word/Excel — đây là lý do file trên Zalo
 * nhìn "chuẩn" còn bản tự render thì lệch.
 *
 * ⚠️ Ràng buộc: Microsoft **tự tải file từ máy chủ của họ**, nên URL phải công
 * khai truy cập được từ internet (URL ký vẫn được, localhost thì không). Khi
 * không thoả, component gọi `onUnavailable` để phía cha rơi về bản tự render.
 *
 * Iframe cross-origin KHÔNG bắn `onError` khi viewer hỏng — nó chỉ hiện trang
 * trắng. Nên phải bắt bằng thời gian chờ: quá lâu chưa `load` → coi như hỏng.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";

interface OfficeOnlinePreviewProps {
  /** URL file, phải công khai để Microsoft tải được. */
  url: string;
  fileName: string;
  /** Gọi khi viewer không dùng được → cha chuyển sang bản tự render. */
  onUnavailable: () => void;
  className?: string;
}

/**
 * Chờ tối đa bao lâu cho iframe `load`. Office Online với file vài MB thường
 * mất 3–8 giây; 20 giây là đủ rộng để không cắt nhầm mạng chậm, mà vẫn không
 * bắt user nhìn màn hình trống quá lâu khi hỏng thật.
 */
const LOAD_TIMEOUT_MS = 20_000;

const buildViewerUrl = (fileUrl: string): string =>
  `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;

export const OfficeOnlinePreview: React.FC<OfficeOnlinePreviewProps> = ({
  url,
  fileName,
  onUnavailable,
  className,
}) => {
  // Khoá trạng thái theo `url`: đổi file là tự về "đang tải" mà không cần
  // setState trong effect (tránh thêm một vòng render thừa).
  const [loadState, setLoadState] = useState({ key: url, loaded: false });
  const isLoading = !(loadState.key === url && loadState.loaded);

  // Giữ callback trong ref: cha thường truyền hàm inline (đổi mỗi lần render),
  // đưa thẳng vào deps sẽ khiến bộ đếm bị đặt lại liên tục và không bao giờ chạy.
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    // Đã load xong thì KHÔNG đặt hạn chờ nữa.
    //
    // Thiếu điều kiện này là bug đã gặp: hạn chờ vẫn nổ sau 20 giây dù viewer
    // hiển thị đúng, nên tài liệu đang hiện chuẩn bỗng bị thay bằng bản tự
    // render — đúng triệu chứng "đang đúng tự dưng load về cái cũ".
    if (isLoading) {
      const timer = window.setTimeout(() => {
        // Chưa `load` sau ngần này giây → coi như Microsoft không lấy được file.
        onUnavailableRef.current();
      }, LOAD_TIMEOUT_MS);

      return () => window.clearTimeout(timer);
    }
  }, [url, isLoading]);

  const handleLoad = useCallback(() => {
    setLoadState({ key: url, loaded: true });
  }, [url]);

  return (
    <div className={clsx("relative h-full w-full bg-white", className)}>
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1565C0] border-t-transparent" />
          <span className="text-sm text-text-muted">Đang mở tài liệu…</span>
        </div>
      )}
      <iframe
        src={buildViewerUrl(url)}
        title={fileName || "Xem tài liệu"}
        className="h-full w-full border-0"
        onLoad={handleLoad}
        // `allow-same-origin` là BẮT BUỘC, không phải nới lỏng cho tiện.
        //
        // Excel/Word Online là ứng dụng thật: nó cần cookie + localStorage +
        // WebSocket để giữ phiên làm việc. Thiếu cờ này, trình duyệt ép iframe
        // vào origin "null" (opaque) → viewer mất session và hiện
        // "Trying to reconnect. Check your internet connection." lặp vô hạn,
        // dù mạng vẫn tốt. Đã gặp đúng lỗi này 08-08-26.
        //
        // Không hở bảo mật: iframe trỏ sang view.officeapps.live.com nên
        // "same-origin" ở đây là origin CỦA MICROSOFT, khác origin app mình.
        // Nó không đọc được DOM, cookie hay token của app. Vẫn giữ sandbox để
        // chặn allow-top-navigation (viewer không thể tự điều hướng cả trang).
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
      />
    </div>
  );
};

export default OfficeOnlinePreview;
