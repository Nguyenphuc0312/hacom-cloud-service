import React from "react";

/**
 * Khung chuẩn cho các màn HR (Công / Nghỉ phép / Nhóm của tôi).
 *
 * Vì sao cần: `.private-app-route` là flex box cao cố định + `overflow: hidden`
 * (index.css). Trang nào dùng `min-h-full` thì phần dài hơn viewport bị CẮT và
 * không cuộn được — đó là lý do "màn thì ổn, màn thì không chuẩn". Cuộn phải do
 * chính trang sở hữu: `h-full overflow-y-auto`, giống HelpPage/SupportPage.
 *
 * Bề rộng nội dung khoá ở 1280px và canh giữa để màn siêu rộng không kéo dãn
 * chữ, còn laptop vẫn hiển thị đầy đủ.
 */
export const WorkPageShell: React.FC<{
  header: React.ReactNode;
  children: React.ReactNode;
}> = ({ header, children }) => (
  <main className="h-full min-h-0 w-full overflow-y-auto bg-[#eef2f7] text-[#0f172a]">
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 md:px-6">
      {header}
      {children}
    </div>
  </main>
);

export default WorkPageShell;
