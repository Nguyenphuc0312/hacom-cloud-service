import React from "react";
import {
  ArrowLeftIcon,
  ArrowUpOnSquareIcon,
  CommandLineIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../router/paths";

interface Tip {
  title: string;
  description: string;
  keys?: string[];
}

interface TipSection {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  tips: Tip[];
}

const sections: TipSection[] = [
  {
    icon: CommandLineIcon,
    title: "Bảng lệnh nhanh (Command Palette)",
    description:
      "Mở bảng lệnh để nhảy tới bất kỳ đâu mà không cần rời bàn phím: tìm hội thoại, tìm người, mở Cài đặt, Bạn bè, tạo cuộc trò chuyện mới…",
    tips: [
      {
        title: "Mở bảng lệnh",
        description:
          "Dùng được ở mọi màn hình sau khi đăng nhập. Trên macOS dùng phím Command thay cho Ctrl.",
        keys: ["Ctrl", "K"],
      },
      {
        title: "Chọn kết quả",
        description:
          "Gõ để lọc, dùng phím mũi tên lên/xuống để di chuyển và Enter để mở kết quả đang chọn.",
        keys: ["↑", "↓", "Enter"],
      },
      {
        title: "Đóng bảng lệnh",
        description: "Nhấn Esc để đóng và quay lại chỗ bạn đang làm việc.",
        keys: ["Esc"],
      },
    ],
  },
  {
    icon: ArrowUpOnSquareIcon,
    title: "Chuyển tiếp bằng cách kéo – thả",
    description:
      "Muốn gửi lại một tệp, ảnh, danh thiếp hay liên kết sang hội thoại khác? Không cần mở menu chuyển tiếp — kéo thẳng tin nhắn đó sang hội thoại ở danh sách bên trái.",
    tips: [
      {
        title: "Kéo tin nhắn sang hội thoại khác",
        description:
          "Giữ chuột trên tin nhắn rồi kéo sang một hội thoại trong danh sách bên trái. Hội thoại sẽ sáng lên khi có thể thả, thả chuột là tin nhắn được chuyển tiếp ngay.",
      },
      {
        title: "Loại tin nhắn kéo được",
        description:
          "Tin nhắn có tệp đính kèm (tệp, ảnh, video), danh thiếp và tin nhắn chứa liên kết. Tin nhắn văn bản thuần, sticker, tin thoại, bình chọn thì dùng nút chuyển tiếp trong menu tin nhắn.",
      },
    ],
  },
  {
    icon: PhotoIcon,
    title: "Kéo – thả tệp từ máy tính để gửi",
    description:
      "Không cần bấm nút kẹp giấy: kéo thẳng tệp từ máy tính (hoặc từ trình duyệt) vào khung chat.",
    tips: [
      {
        title: "Thả tệp vào khung chat",
        description:
          "Kéo một hoặc nhiều tệp từ máy tính vào giữa khung chat. Vùng thả sẽ hiện lên, thả ra là tệp được thêm vào ô soạn tin — bạn có thể viết thêm nội dung trước khi gửi.",
      },
      {
        title: "Tệp quá lớn hoặc sai định dạng",
        description:
          "Nếu tệp vượt giới hạn hoặc không được hỗ trợ, hệ thống sẽ báo ngay khi thả và bỏ qua tệp đó thay vì gửi lỗi.",
      },
    ],
  },
  {
    icon: MagnifyingGlassIcon,
    title: "Xem ảnh & tệp nhanh hơn",
    description:
      "Khi đã mở một ảnh trong hội thoại, bạn có thể xem cả bộ ảnh bằng bàn phím mà không cần đóng đi mở lại.",
    tips: [
      {
        title: "Chuyển ảnh trước / sau",
        description: "Duyệt qua các ảnh trong cùng hội thoại.",
        keys: ["←", "→"],
      },
      {
        title: "Phóng to, thu nhỏ, đưa về mặc định",
        description:
          "Dùng phím + và − để phóng to / thu nhỏ, phím 0 để đưa ảnh về kích thước ban đầu.",
        keys: ["+", "−", "0"],
      },
      {
        title: "Đóng cửa sổ xem ảnh",
        description: "Nhấn Esc để đóng và quay lại hội thoại.",
        keys: ["Esc"],
      },
    ],
  },
];

const KeyCap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-lg border border-border/60 bg-background/60 px-2 py-1 text-xs font-semibold text-text-primary shadow-sm">
    {children}
  </kbd>
);

const TipsPage: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <Link
          to={ROUTE_PATHS.HELP}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Quay lại hỗ trợ
        </Link>

        <div className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1976D2]/10 text-[#1565C0]">
              <LightBulbIcon className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold text-text-primary">
              Tính năng tiện ích
            </h1>
          </div>
          <p className="text-text-secondary">
            Những phím tắt và thao tác nhanh giúp bạn dùng hệ thống Hacom
            Holdings nhanh hơn mỗi ngày.
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="rounded-2xl border border-border/60 bg-surface p-6 shadow-sm"
              >
                <div className="mb-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1976D2]/10 text-[#1565C0]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-text-primary">
                      {section.title}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                      {section.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {section.tips.map((tip) => (
                    <div
                      key={tip.title}
                      className="rounded-xl border border-border/40 bg-background/40 p-4"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {tip.title}
                        </span>
                        {tip.keys && (
                          <span className="flex items-center gap-1">
                            {tip.keys.map((key) => (
                              <KeyCap key={key}>{key}</KeyCap>
                            ))}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-text-secondary">
                        {tip.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-primary/10 bg-primary/5 p-8 text-center">
          <p className="mb-4 text-text-secondary">
            Bạn muốn tìm hiểu thêm về cách sử dụng hệ thống?
          </p>
          <Link
            to={ROUTE_PATHS.FAQ}
            className="font-bold text-primary hover:underline"
          >
            Xem tài liệu hướng dẫn (FAQ) →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TipsPage;
