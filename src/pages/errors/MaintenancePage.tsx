import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

interface MaintenancePageProps {
  requestId?: string;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({ requestId }) => (
  <AppErrorPage
    statusCode={503}
    variant="maintenance"
    title="Dịch vụ đang bảo trì"
    description="Một số chức năng tạm thời chưa khả dụng."
    requestId={requestId}
    primaryAction={{ label: "Tải lại", reload: true }}
    secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
  />
);

export default MaintenancePage;
