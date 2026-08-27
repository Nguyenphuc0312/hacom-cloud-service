import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  ChartPie,
  Cloud,
  CloudUpload,
  ChevronRight,
  Grid2X2,
  List,
  Search,
} from "lucide-react";
import {
  DocumentDuplicateIcon,
  DocumentIcon,
  DocumentTextIcon,
  LinkIcon,
  MicrophoneIcon,
  PhotoIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../stores/authStore";
import { resolveCloudUserId } from "../utils/cloudIdentity";
import { useCloudWorkspace } from "../hooks/useCloudWorkspace";
import { formatBytes, getCloudItemPreview, getCloudItemTitle } from "../utils/cloudFormat";
import { CloudItemIcon } from "../components/CloudItemIcon";
import { CloudQuotaRequestDialog } from "../components/CloudQuotaRequestDialog";
import type { CloudItem } from "../types";
import { ROUTE_PATHS } from "../../../router/paths";
import "../styles/cloud.css";

type Filter = "all" | CloudItem["type"];

const ITEMS_PER_PAGE = 50;

const typeLabel: Record<CloudItem["type"], string> = {
  image: "Ảnh",
  video: "Video",
  file: "File",
  audio: "Tin nhắn thoại",
  link: "Link",
  text: "Văn bản",
};

const typeIcon: Record<CloudItem["type"], React.ReactNode> = {
  image: <PhotoIcon className="h-6 w-6" aria-hidden />,
  video: <VideoCameraIcon className="h-6 w-6" aria-hidden />,
  file: <DocumentIcon className="h-6 w-6" aria-hidden />,
  audio: <MicrophoneIcon className="h-6 w-6" aria-hidden />,
  link: <LinkIcon className="h-6 w-6" aria-hidden />,
  text: <DocumentTextIcon className="h-6 w-6" aria-hidden />,
};

const titleFor = (item: CloudItem) =>
  getCloudItemTitle(item, {
    text: "Văn bản chưa đặt tên",
    link: "Liên kết chưa đặt tên",
    file: "Tệp chưa đặt tên",
  });

const formatSentDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

export default function CloudManagePage() {
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const userId = resolveCloudUserId(authUser?.id);
  const workspace = useCloudWorkspace(userId);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [newestFirst, setNewestFirst] = useState(true);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return workspace.items
      .filter((item) => filter === "all" || item.type === filter)
      .filter((item) => {
        if (!normalized) return true;
        return `${titleFor(item)} ${getCloudItemPreview(item)}`
          .toLocaleLowerCase()
          .includes(normalized);
      })
      .sort((left, right) => {
        const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
        return newestFirst ? -delta : delta;
      });
  }, [filter, newestFirst, query, workspace.items]);

  const pageCount = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  }, [currentPage, items]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, newestFirst, query]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const bytesFor = (kind: CloudItem["type"]) =>
    workspace.items
      .filter((item) => item.type === kind)
      .reduce((total, item) => total + item.sizeBytes, 0);

  const cards: Array<{ type: Filter; label: string; icon: React.ReactNode }> = [
    { type: "all", label: "Tất cả", icon: <DocumentDuplicateIcon className="h-6 w-6" aria-hidden /> },
    { type: "image", label: "Ảnh", icon: typeIcon.image },
    { type: "video", label: "Video", icon: typeIcon.video },
    { type: "file", label: "File", icon: typeIcon.file },
    { type: "audio", label: "Tin nhắn thoại", icon: typeIcon.audio },
  ];

  return (
    <main className="h-screen overflow-y-auto bg-[#F7F8FA] text-[#0B1730]">
      <header className="flex h-20 items-center gap-5 border-b border-[#E5E7EB] bg-white px-8">
        <button
          type="button"
          onClick={() => navigate(ROUTE_PATHS.CLOUD)}
          className="rounded-full p-2 text-[#64748B] hover:bg-[#F1F5F9]"
          aria-label="Quay lại My Documents"
        >
          <ArrowLeft className="h-7 w-7" aria-hidden />
        </button>
        <div>
          <h1 className="text-[27px] font-semibold leading-8">Hacom Cloud</h1>
          <p className="text-[17px] text-[#64748B]">Lưu trữ và truy cập nhanh nội dung quan trọng của bạn</p>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1800px] grid-cols-[minmax(260px,0.28fr)_minmax(0,1fr)] gap-8 p-8">
        <div className="space-y-6">
        <aside className="h-fit rounded-3xl border border-[#E1E6ED] bg-white p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold">Dung lượng lưu trữ</h2>
            <span className="text-sm text-[#64748B]">
              {workspace.quota && workspace.quota.limitBytes > 0
                ? `${((workspace.quota.usedBytes / workspace.quota.limitBytes) * 100).toFixed(1)}%`
                : "0%"}
            </span>
          </div>
          <p className="mt-5 text-2xl font-semibold">
            {formatBytes(workspace.quota?.usedBytes ?? 0)} <span className="text-base font-normal text-[#64748B]">đã dùng</span>
          </p>
          <p className="mt-1 text-sm text-[#64748B]">trên tổng dung lượng {formatBytes(workspace.quota?.limitBytes ?? 0)}</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#EEF2F7]">
            <span
              className="block h-full rounded-full bg-[#1976D2]"
              style={{ width: `${workspace.quota && workspace.quota.limitBytes > 0 ? Math.min(100, workspace.quota.usedBytes / workspace.quota.limitBytes * 100) : 0}%` }}
            />
          </div>
          <p className="mt-4 text-sm text-[#64748B]">Còn trống {formatBytes(workspace.quota?.availableBytes ?? 0)}</p>
        </aside>

        <aside className="flex min-h-[320px] flex-col justify-end rounded-xl bg-[#DCEBFF] p-6 text-center">
          <div className="my-auto">
            <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#2F80ED] text-white shadow-sm">
              <Cloud className="h-9 w-9" aria-hidden />
            </span>
            <h2 className="text-xl font-semibold leading-7 text-[#0B1730]">
              Nâng cấp dung lượng
              <span className="block">My Documents</span>
            </h2>
            <div className="mt-8 space-y-4 text-left text-base text-[#334155]">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B1730]">
                  <ChartPie className="h-6 w-6" aria-hidden />
                </span>
                <span>Không gian lưu trữ lên đến 10 GB</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#0B1730]">
                  <CloudUpload className="h-6 w-6" aria-hidden />
                </span>
                <span>Tự động bảo toàn dữ liệu trò chuyện</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsUpgradeOpen(true)}
            className="mt-6 h-12 w-full rounded-md bg-[#0D6EFD] px-4 text-lg font-semibold text-white transition-colors hover:bg-[#0B63E5]"
          >
            Thêm dung lượng
          </button>
        </aside>
        </div>

        <section className="min-w-0 rounded-3xl border border-[#E1E6ED] bg-white p-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {cards.map((card) => (
              <button
                type="button"
                key={card.type}
                onClick={() => setFilter(filter === card.type ? "all" : card.type)}
                className={`flex min-h-[88px] items-center gap-3 rounded-2xl border px-3 text-left transition-colors ${filter === card.type ? "border-[#1976D2] bg-[#EFF6FF]" : "border-[#E1E6ED] hover:bg-[#F8FAFC]"}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F4F7] text-[#64748B]">{card.icon}</span>
                <span>
                  <span className="block text-base font-semibold leading-tight">{card.label}</span>
                  <span className="text-sm text-[#64748B]">
                    {formatBytes(card.type === "all"
                      ? workspace.items.reduce((total, item) => total + item.sizeBytes, 0)
                      : bytesFor(card.type))}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <h2 className="mr-auto text-xl font-semibold">Tất cả dữ liệu Hacom Cloud</h2>
            <label className="relative flex h-14 min-w-[280px] flex-1 items-center rounded-2xl border border-[#E1E6ED] px-4 text-[#64748B] focus-within:border-[#1976D2] focus-within:ring-2 focus-within:ring-[#1976D2]/15">
              <Search className="mr-3 h-6 w-6" aria-hidden />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tệp" className="min-w-0 flex-1 bg-transparent text-base text-[#0B1730] outline-none placeholder:text-[#64748B]" />
            </label>
            <button type="button" onClick={() => setNewestFirst((value) => !value)} className="flex h-14 items-center gap-3 rounded-2xl border border-[#E1E6ED] px-5 text-base text-[#64748B] hover:bg-[#F8FAFC]">
              <ArrowDownUp className="h-6 w-6" aria-hidden /> Thời gian gửi ({newestFirst ? "mới → cũ" : "cũ → mới"})
            </button>
            <button type="button" onClick={() => setGrid(false)} className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${!grid ? "border-[#1976D2] text-[#1976D2]" : "border-[#E1E6ED] text-[#64748B]"}`} aria-label="Chế độ danh sách"><List className="h-6 w-6" aria-hidden /></button>
            <button type="button" onClick={() => setGrid(true)} className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${grid ? "border-[#1976D2] text-[#1976D2]" : "border-[#E1E6ED] text-[#64748B]"}`} aria-label="Chế độ lưới"><Grid2X2 className="h-6 w-6" aria-hidden /></button>
          </div>

          {workspace.isLoading ? (
            <div className="flex min-h-[460px] items-center justify-center text-[#64748B]">Đang tải dữ liệu…</div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F8FAFC] text-[#64748B]"><DocumentIcon className="h-8 w-8" aria-hidden /></span>
              <h3 className="mt-5 text-xl font-semibold">Chưa có tệp nào</h3>
              <p className="mt-3 text-base text-[#64748B]">Tải tệp lên Hacom Cloud để lưu trữ và truy cập nhanh.</p>
            </div>
          ) : (
            <div className={`mt-7 ${grid ? "grid grid-cols-2 gap-4 xl:grid-cols-3" : "overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white"}`}>
              {!grid ? (
                <div className="grid grid-cols-[minmax(0,1fr)_140px_160px] items-center border-b border-[#E5E7EB] px-6 py-4 text-sm font-semibold text-[#64748B]">
                  <span>Tên</span>
                  <span>Kích thước</span>
                  <span>Ngày gửi</span>
                </div>
              ) : null}
              {paginatedItems.map((item) => (
                <article
                  key={item.id}
                  className={grid
                    ? "flex min-h-[150px] flex-col items-start gap-4 rounded-2xl border border-[#E5E7EB] p-4"
                    : "grid min-h-[88px] grid-cols-[minmax(0,1fr)_140px_160px] items-center px-6 py-4 hover:bg-[#F8FAFC]"}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <CloudItemIcon type={item.type} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{titleFor(item)}</h3>
                      <p className="mt-1 truncate text-sm text-[#64748B]">{getCloudItemPreview(item) || typeLabel[item.type]}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm text-[#64748B]">{formatBytes(item.sizeBytes)}</span>
                  <span className="shrink-0 text-sm text-[#334155]">{formatSentDate(item.createdAt)}</span>
                </article>
              ))}
            </div>
          )}

          {items.length > ITEMS_PER_PAGE ? (
            <nav
              className="mt-6 flex items-center justify-end gap-3 border-t border-[#E5E7EB] pt-5 text-base text-[#334155]"
              aria-label="Phân trang dữ liệu Hacom Cloud"
            >
              <span>Trang</span>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={currentPage}
                onChange={(event) => {
                  const nextPage = Number(event.target.value);
                  if (Number.isFinite(nextPage) && nextPage >= 1 && nextPage <= pageCount) {
                    setCurrentPage(nextPage);
                  }
                }}
                className="h-12 w-[108px] rounded-xl border border-[#DCE2EA] bg-white px-4 text-center text-lg outline-none focus:border-[#1976D2] focus:ring-2 focus:ring-[#1976D2]/15"
                aria-label="Trang hiện tại"
              />
              <span>/ {pageCount}</span>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                className="ml-2 flex h-12 items-center gap-2 rounded-xl px-3 font-semibold transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </nav>
          ) : null}
        </section>
      </div>

      <CloudQuotaRequestDialog
        isOpen={isUpgradeOpen}
        quota={workspace.quota}
        currentRequest={workspace.quotaRequest}
        isLoading={workspace.isRequestingQuota}
        onClose={() => setIsUpgradeOpen(false)}
        onSubmit={workspace.requestQuota}
      />
    </main>
  );
}
