import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

export const UnauthorizedPage: React.FC = () => (
  <AppErrorPage
    statusCode={401}
    variant="unauthorized"
    title="Phiên đăng nhập đã hết hạn"
    description="Vui lòng đăng nhập lại để tiếp tục."
    primaryAction={{ label: "Đăng nhập lại", to: ROUTE_PATHS.LOGIN }}
  />
);

export default UnauthorizedPage;
