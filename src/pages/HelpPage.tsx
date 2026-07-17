import React from "react";
import {
  ChevronRightIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { Avatar } from "../components/common/Avatar";
import { ROUTE_PATHS } from "../router/paths";

const contacts: {
  name: string;
  role: string;
  email: string;
  /** Ảnh đại diện thật — để trống thì Avatar hiển thị icon người mặc định. */
  avatarUrl?: string;
}[] = [
  {
    name: "Đậu Cao Minh Nhật",
    role: "Support Manager",
    email: "admin@hacomholdings.vn",
    // avatarUrl: "https://…", // thêm dòng này là tự động hiện ảnh
  },
  {
    name: "Vũ Minh Quốc",
    role: "Support Manager",
    email: "admin@hacomholdings.vn",
    // avatarUrl: "https://…", // thêm dòng này là tự động hiện ảnh
  },
];

const HelpPage: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-text-primary">
            Thông tin liên hệ hỗ trợ
          </h1>
          <p className="mx-auto max-w-2xl text-text-secondary">
            Cần trợ giúp với hệ thống Hacom Holdings? Đội ngũ hỗ trợ kỹ thuật của
            chúng tôi luôn sẵn sàng giải đáp các thắc mắc và xử lý sự cố của bạn.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {contacts.map((contact) => (
            <div
              key={contact.name}
              className="flex flex-col rounded-3xl border border-border/60 bg-surface p-8 shadow-sm transition-all hover:shadow-md"
            >
              <div className="mb-6 flex items-center gap-4">
                {contact.avatarUrl ? (
                  <Avatar
                    src={contact.avatarUrl}
                    alt={contact.name}
                    size="xl"
                    className="grayscale transition-all hover:grayscale-0"
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-background text-text-muted ring-1 ring-border/60"
                    aria-hidden="true"
                  >
                    <UserIcon className="h-8 w-8" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-bold text-text-primary">
                    {contact.name}
                  </h2>
                  <p className="text-sm text-text-muted">{contact.role}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-medium text-emerald-500/90">
                      Trực tuyến
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/40 p-4 transition-colors hover:bg-background/60">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1976D2]/10 text-[#1565C0]">
                    <EnvelopeIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-text-muted">Gửi email</p>
                    <p className="truncate text-sm font-medium text-text-primary">
                      {contact.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 space-y-3">
          <Link
            to={ROUTE_PATHS.TIPS}
            className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface p-5 transition-all hover:bg-surface-hover hover:shadow-sm"
          >
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1976D2]/10 text-[#1565C0]">
                <LightBulbIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary">
                  Tính năng tiện ích
                </h3>
                <p className="text-xs text-text-muted">
                  Phím tắt Ctrl+K, chuyển tiếp bằng kéo thả, mẹo dùng nhanh
                </p>
              </div>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-text-muted" />
          </Link>

          <Link
            to={ROUTE_PATHS.FAQ}
            className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface p-5 transition-all hover:bg-surface-hover hover:shadow-sm"
          >
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1976D2]/10 text-[#1565C0]">
                <DocumentTextIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary">
                  Tài liệu hướng dẫn (FAQ)
                </h3>
                <p className="text-xs text-text-muted">
                  Xem các câu hỏi thường gặp và hướng dẫn sử dụng
                </p>
              </div>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-text-muted" />
          </Link>

          <Link
            to={ROUTE_PATHS.REPORT_ISSUE}
            className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface p-5 transition-all hover:bg-surface-hover hover:shadow-sm"
          >
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                <ExclamationTriangleIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary">
                  Báo cáo sự cố hệ thống
                </h3>
                <p className="text-xs text-text-muted">
                  Tạo ticket hỗ trợ cho đội ngũ IT
                </p>
              </div>
            </div>
            <ChevronRightIcon className="h-5 w-5 text-text-muted" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HelpPage;
