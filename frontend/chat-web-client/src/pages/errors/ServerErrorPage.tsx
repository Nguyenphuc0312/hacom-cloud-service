import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

interface ServerErrorPageProps {
  statusCode?: 500 | 502 | 503 | 504;
  requestId?: string;
  details?: string;
}

export const ServerErrorPage: React.FC<ServerErrorPageProps> = ({
  statusCode = 500,
  requestId,
  details,
}) => (
  <AppErrorPage
    statusCode={statusCode}
    variant="server"
    title="Hệ thống đang gặp sự cố"
    description="Vui lòng thử lại. Nếu lỗi tiếp tục xảy ra, hãy gửi mã yêu cầu cho quản trị viên."
    requestId={requestId}
    details={details}
    primaryAction={{ label: "Thử lại", reload: true }}
    secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
  />
);

export default ServerErrorPage;
