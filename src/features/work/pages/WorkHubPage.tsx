import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUTE_PATHS } from "../../../router/paths";
import { WorkTabBar, type WorkTabId } from "../components/WorkTabBar";
import MyTimesheetPanel from "../../timesheet/pages/MyTimesheetPage";
import MyLeavePanel from "../../leave/pages/MyLeavePage";

const tabFromPath = (pathname: string): WorkTabId =>
  pathname.startsWith(ROUTE_PATHS.LEAVE) ? "leave" : "timesheet";

/**
 * Màn gộp "Công của tôi" + "Nghỉ phép của tôi" sau một thanh tab.
 *
 * Tab bám theo URL nên hai lối vào cũ (/timesheet, /leave) đều còn sống và mở
 * đúng panel; chuyển tab dùng `replace` để không nhồi history mỗi lần bấm.
 * Panel không hoạt động được unmount — mỗi panel tự gọi API riêng, giữ cả hai
 * sống sẽ tốn request vô ích khi người dùng chỉ nhìn một bên.
 */
export const WorkHubPage: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = tabFromPath(pathname);

  const handleChange = (next: WorkTabId) => {
    if (next === active) return;
    navigate(next === "leave" ? ROUTE_PATHS.LEAVE : ROUTE_PATHS.TIMESHEET, {
      replace: true,
    });
  };

  return (
    <div
      id={`work-panel-${active}`}
      role="tabpanel"
      aria-labelledby={`work-tab-${active}`}
      className="h-full min-h-0"
    >
      {active === "leave" ? (
        <MyLeavePanel tabBar={<WorkTabBar value={active} onChange={handleChange} />} />
      ) : (
        <MyTimesheetPanel tabBar={<WorkTabBar value={active} onChange={handleChange} />} />
      )}
    </div>
  );
};

export default WorkHubPage;
