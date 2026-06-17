import React from "react";
import { ArrowRightOnRectangleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores";
import { ROUTE_PATHS } from "../router/paths";
import { toast } from "../components/ui";

const readClaimedEmployeeCode = (user: Record<string, unknown> | null) => {
  const value = user?.claimedEmployeeCode ?? user?.claimed_employee_code ?? user?.employeeCode;
  return typeof value === "string" && value.trim() ? value.trim() : "-";
};

const readClaimedEmail = (user: Record<string, unknown> | null) => {
  const value = user?.claimedEmail ?? user?.claimed_email ?? user?.email;
  return typeof value === "string" && value.trim() ? value.trim() : "-";
};

export const PendingHrLinkPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logoutSoft = useAuthStore((state) => state.logoutSoft);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const userRecord = user as unknown as Record<string, unknown> | null;

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logoutSoft();
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Không thể đăng xuất.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <ClockIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            Tài khoản đang chờ xác minh nhân sự
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Tài khoản của bạn đã được tạo nhưng chưa được liên kết với hồ sơ
            nhân sự. Vui lòng chờ HR/Super Admin xác minh và liên kết tài khoản.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface-overlay p-4">
        <h2 className="text-sm font-semibold text-text-primary">
          Thông tin bạn đã khai báo
        </h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">Mã nhân sự</dt>
            <dd className="break-all font-semibold text-text-primary">
              {readClaimedEmployeeCode(userRecord)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">Email</dt>
            <dd className="break-all font-semibold text-text-primary">
              {readClaimedEmail(userRecord)}
            </dd>
          </div>
        </dl>
      </section>

      <p className="text-sm leading-6 text-text-secondary">
        Nếu thông tin chưa đúng, vui lòng liên hệ quản trị viên. Tài khoản ở
        trạng thái này chưa được coi là nhân sự chính thức và chưa thể sử dụng
        chat, danh bạ nội bộ hoặc các chức năng theo phòng ban.
      </p>

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
        {isLoggingOut ? "Đang đăng xuất..." : "Đăng xuất"}
      </button>
    </main>
  );
};

export default PendingHrLinkPage;
