import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

export const OfflinePage: React.FC = () => (
  <AppErrorPage
    variant="offline"
    title="Mất kết nối mạng"
    description="Kiểm tra kết nối Internet rồi thử lại."
    primaryAction={{ label: "Thử lại", reload: true }}
    secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
  />
);

export default OfflinePage;
