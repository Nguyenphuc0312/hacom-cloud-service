import React from "react";
import { AppErrorPage } from "../../../components/error";
import { ROUTE_PATHS } from "../../../router/paths";

/**
 * Màn thay thế khi `VITE_WORK_MODULE_ENABLED=false` (hiện chỉ production).
 * Code thật vẫn nguyên vẹn — bật lại flag là chạy tiếp.
 */
const WorkComingSoon: React.FC = () => (
  <AppErrorPage
    variant="maintenance"
    title="Tính năng đang phát triển"
    description="Công và nghỉ phép sẽ sớm ra mắt. Vui lòng quay lại sau."
    secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
  />
);

export default WorkComingSoon;
