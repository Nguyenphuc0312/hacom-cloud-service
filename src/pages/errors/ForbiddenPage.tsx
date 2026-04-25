import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

export const ForbiddenPage: React.FC = () => (
  <AppErrorPage
    statusCode={403}
    variant="forbidden"
    title="Bạn không có quyền truy cập"
    description="Tài khoản của bạn chưa được cấp quyền để mở khu vực này."
    primaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
    secondaryAction={{ label: "Liên hệ quản trị", to: ROUTE_PATHS.SETTINGS }}
  />
);

export default ForbiddenPage;
