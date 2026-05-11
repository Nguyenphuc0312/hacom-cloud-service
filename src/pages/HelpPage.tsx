import React from "react";
import { 
  EnvelopeIcon, 
  ChevronRightIcon, 
  DocumentTextIcon, 
  ExclamationTriangleIcon 
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../router/paths";

const HelpPage: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-4xl px-6 py-12">
        
        {/* Header Section */}
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-text-primary">
            Thông tin liên hệ hỗ trợ
          </h1>
          <p className="mx-auto max-w-2xl text-text-secondary">
            Cần trợ giúp với hệ thống Hacom Chat? Đội ngũ hỗ trợ kỹ thuật của chúng tôi luôn sẵn sàng giải đáp các thắc mắc và xử lý sự cố của bạn.
          </p>
        </div>

        {/* Contact Cards Grid */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          
          {/* Card 1: Đậu Cao Minh Nhật */}
          <div className="flex flex-col rounded-3xl border border-border/60 bg-surface p-8 shadow-sm transition-all hover:shadow-md">
            <div className="mb-6 flex items-center gap-4">
              <img 
                src="/Users/chuong/.gemini/antigravity/brain/b124447b-9eaf-45c7-baaa-a85434c60a89/anonymous_avatar_1_1778491250179.png" 
                alt="Đậu Cao Minh Nhật" 
                className="h-16 w-16 rounded-full object-cover shadow-sm ring-2 ring-background grayscale hover:grayscale-0 transition-all"
              />
              <div>
                <h2 className="text-xl font-bold text-text-primary">Đậu Cao Minh Nhật</h2>
                <p className="text-sm text-text-muted">Support Manager</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-500/90">Trực tuyến</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/40 p-4 transition-colors hover:bg-background/60">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <EnvelopeIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">Gửi email</p>
                  <p className="truncate text-sm font-medium text-text-primary">admin@hacomholdings.vn</p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Vũ Minh Quốc */}
          <div className="flex flex-col rounded-3xl border border-border/60 bg-surface p-8 shadow-sm transition-all hover:shadow-md">
            <div className="mb-6 flex items-center gap-4">
              <img 
                src="/Users/chuong/.gemini/antigravity/brain/b124447b-9eaf-45c7-baaa-a85434c60a89/anonymous_avatar_2_1778491276472.png" 
                alt="Vũ Minh Quốc" 
                className="h-16 w-16 rounded-full object-cover shadow-sm ring-2 ring-background grayscale hover:grayscale-0 transition-all"
              />
              <div>
                <h2 className="text-xl font-bold text-text-primary">Vũ Minh Quốc</h2>
                <p className="text-sm text-text-muted">Technical Lead</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-500/90">Trực tuyến</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-background/40 p-4 transition-colors hover:bg-background/60">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <EnvelopeIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">Gửi email</p>
                  <p className="truncate text-sm font-medium text-text-primary">admin@hacomholdings.vn</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Links Section */}
        <div className="mt-8 space-y-3">
          <Link 
            to={ROUTE_PATHS.FAQ}
            className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-surface p-5 transition-all hover:bg-surface-hover hover:shadow-sm"
          >
            <div className="flex items-center gap-4 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                <DocumentTextIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-text-primary">Tài liệu hướng dẫn (FAQ)</h3>
                <p className="text-xs text-text-muted">Xem các câu hỏi thường gặp và hướng dẫn sử dụng</p>
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
                <h3 className="font-bold text-text-primary">Báo cáo sự cố hệ thống</h3>
                <p className="text-xs text-text-muted">Tạo ticket hỗ trợ cho đội ngũ IT</p>
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
