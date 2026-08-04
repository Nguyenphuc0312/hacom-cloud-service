import React from "react";
import { AppErrorPage } from "../../components/error";
import { ROUTE_PATHS } from "../../router/paths";

export const NotFoundPage: React.FC = () => (
  <AppErrorPage
    statusCode={404}
    variant="not-found"
    title="Không tìm thấy trang"
    description="Đường dẫn này không tồn tại hoặc đã được thay đổi."
    primaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
    secondaryAction={{ label: "Quay lại", back: true }}
  />
);

export default NotFoundPage;
