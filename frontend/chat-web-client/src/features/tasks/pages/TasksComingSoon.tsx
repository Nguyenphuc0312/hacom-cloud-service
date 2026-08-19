import React from "react";
import { AppErrorPage } from "../../../components/error";
import { ROUTE_PATHS } from "../../../router/paths";

const TasksComingSoon: React.FC = () => (
  <AppErrorPage
    variant="maintenance"
    title="Tính năng đang phát triển"
    description="Quản lý công việc sẽ sớm ra mắt. Vui lòng quay lại sau."
    secondaryAction={{ label: "Về trang chat", to: ROUTE_PATHS.CHAT }}
  />
);

export default TasksComingSoon;
