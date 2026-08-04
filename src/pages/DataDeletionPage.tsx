import React, { useState } from "react";

type Lang = "vi" | "en";

const UPDATED_DATE_VI = "20/06/2026";
const UPDATED_DATE_EN = "June 20, 2026";

const DELETE_MAILTO_VI =
  "mailto:it@hacomholdings.com.vn?subject=Y%C3%AAu%20c%E1%BA%A7u%20xo%C3%A1%20t%C3%A0i%20kho%E1%BA%A3n%20%E1%BB%A9ng%20d%E1%BB%A5ng%20Hacom%20Holdings";
const DELETE_MAILTO_EN =
  "mailto:it@hacomholdings.com.vn?subject=Hacom%20Holdings%20app%20-%20account%20deletion%20request";

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="mb-4 flex items-center gap-2.5 border-b border-[#eef2f7] pb-2.5 text-[15px] font-semibold tracking-tight text-[#0f172a]">
      <span aria-hidden className="h-4 w-1 rounded-full bg-[#1565C0]" />
      {title}
    </h2>
    <div className="text-sm leading-relaxed text-[#334155] [&_a]:font-medium [&_a]:text-[#1565C0] [&_a:hover]:text-[#1976D2] [&_a:hover]:underline [&_ul]:list-none [&_ul]:pl-0 [&_li]:relative [&_li]:pl-5 [&_li]:before:absolute [&_li]:before:left-0.5 [&_li]:before:text-[#1976D2] [&_li]:before:content-['-']">
      {children}
    </div>
  </section>
);

const Meta: React.FC<{ rows: Array<[string, React.ReactNode]> }> = ({ rows }) => (
  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[180px_1fr]">
    {rows.map(([k, v], i) => (
      <React.Fragment key={i}>
        <dt className="font-medium text-[#64748b]">{k}</dt>
        <dd className="mb-2 text-[#0f172a] sm:mb-0">{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);

const ContactButton: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    className="mt-3 inline-block rounded-lg bg-[#1565C0] px-4 py-2.5 text-sm font-semibold !text-white shadow-md shadow-[#1565C0]/20 transition-colors hover:bg-[#1976D2] hover:!no-underline"
  >
    {children}
  </a>
);

const Timeline: React.FC<{ items: Array<{ title: string; desc: string }> }> = ({ items }) => (
  <ul className="m-0 list-none p-0">
    {items.map((it, i) => (
      <li key={i} className="relative pl-7 pb-5 last:pb-0">
        <span aria-hidden className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#1565C0]" />
        {i < items.length - 1 && (
          <span aria-hidden className="absolute left-[10px] top-5 bottom-0 w-0.5 bg-[#e5e7eb]" />
        )}
        <strong className="block font-semibold text-[#0f172a]">{it.title}</strong>
        <span className="text-sm text-[#64748b]">{it.desc}</span>
      </li>
    ))}
  </ul>
);

const ViContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Yêu cầu xoá tài khoản và dữ liệu</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-[#475569]">
        Trang này hướng dẫn cán bộ nhân viên Hacom Holdings cách yêu cầu xoá tài khoản và dữ liệu cá nhân khỏi ứng dụng Hacom Holdings trên Android.
      </p>
    </div>

    <Section title="Thông tin ứng dụng">
      <Meta
        rows={[
          ["Tên ứng dụng", "Hacom Holdings"],
          ["Package name", "com.hacom.chat"],
          ["Nhà phát triển", "Công ty Cổ phần Đầu tư Hacom Holdings (HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY)"],
        ]}
      />
    </Section>

    <Section title="Cách yêu cầu xoá">
      <p className="mb-2">Cán bộ nhân viên Hacom Holdings có thể yêu cầu xoá tài khoản và dữ liệu bằng cách gửi email tới Phòng Công nghệ Thông tin với thông tin sau:</p>
      <ul className="space-y-1">
        <li>Họ và tên</li>
        <li>Mã nhân viên hoặc email đăng nhập ứng dụng</li>
        <li>Số điện thoại liên hệ (tuỳ chọn)</li>
        <li>Lý do yêu cầu (tuỳ chọn)</li>
      </ul>
      <ContactButton href={DELETE_MAILTO_VI}>Gửi yêu cầu qua email</ContactButton>
    </Section>

    <Section title="Dữ liệu sẽ được xoá">
      <p className="mb-2">Sau khi yêu cầu được xác minh, các dữ liệu sau sẽ được xoá khỏi hệ thống Hacom Holdings:</p>
      <ul className="space-y-1">
        <li>Hồ sơ tài khoản: họ tên hiển thị, ảnh đại diện, số điện thoại, tiểu sử (bio)</li>
        <li>Tin nhắn cá nhân và tin nhắn bạn đã gửi trong các nhóm</li>
        <li>Ảnh, video, tệp tài liệu đã tải lên hoặc đính kèm trong cuộc trò chuyện</li>
        <li>Sự kiện lịch cá nhân và cuộc họp do bạn tạo</li>
        <li>Tài liệu cá nhân tải lên cho trợ lý AI</li>
        <li>Mã thông báo đẩy (FCM token) và mã định danh cài đặt Firebase (Installation ID)</li>
        <li>Lịch sử báo lỗi gắn với tài khoản (Crashlytics installation UUID)</li>
      </ul>
    </Section>

    <Section title="Dữ liệu được giữ lại">
      <p className="mb-2">Một số dữ liệu sẽ được giữ lại vì lý do bảo mật, kiểm toán hoặc do tính chất kỹ thuật:</p>
      <ul className="space-y-1">
        <li>Nhật ký truy cập (audit log): giữ trong 12 tháng theo quy định bảo mật và pháp lý</li>
        <li>Tin nhắn bạn đã gửi cho người khác sẽ vẫn hiển thị ở phía họ với nhãn "[Người dùng đã xoá]"</li>
        <li>Bản sao lưu hệ thống: tự động hết hạn sau 30 ngày theo chính sách rotation</li>
        <li>Hồ sơ nhân sự cốt lõi (mã nhân viên, lương, hợp đồng) được quản lý bởi hệ thống Nhân sự công ty, không nằm trong phạm vi ứng dụng</li>
      </ul>
    </Section>

    <Section title="Quy trình xử lý">
      <Timeline
        items={[
          { title: "Ngay sau khi nhận yêu cầu (Ngày 0)", desc: "Phòng IT xác minh danh tính người yêu cầu trong vòng 2 ngày làm việc." },
          { title: "Vô hiệu hoá tài khoản (Ngày 1-3)", desc: 'Tài khoản bị khoá truy cập. Thông tin cá nhân (tên, ảnh, số điện thoại) bị ẩn trong giao diện, thay bằng nhãn "Người dùng đã xoá".' },
          { title: "Thời gian ân hạn (30 ngày)", desc: "Trong 30 ngày kể từ khi vô hiệu hoá, bạn có thể email lại để khôi phục tài khoản nếu đổi ý." },
          { title: "Xoá vĩnh viễn (sau 30 ngày)", desc: 'Toàn bộ dữ liệu trong danh mục "Dữ liệu sẽ được xoá" bị xoá vĩnh viễn khỏi máy chủ. Không thể khôi phục.' },
        ]}
      />
    </Section>

    <Section title="Liên hệ">
      <Meta
        rows={[
          ["Email Phòng IT", <a key="m" href="mailto:it@hacomholdings.com.vn">it@hacomholdings.com.vn</a>],
          ["Chính sách quyền riêng tư", <a key="p" href="/privacy-policy">chat.hacomholdings.com.vn/privacy-policy</a>],
          ["Trang chủ", <a key="w" href="https://hacomholdings.com.vn" target="_blank" rel="noopener noreferrer">hacomholdings.com.vn</a>],
        ]}
      />
    </Section>
  </div>
);

const EnContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="mb-4 flex items-center gap-3">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Account &amp; Data Deletion Request</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-[#475569]">
        This page describes how authorized personnel of Hacom Holdings can request the deletion of their account and personal data from the Hacom Holdings Android application.
      </p>
    </div>

    <Section title="Application information">
      <Meta
        rows={[
          ["App name", "Hacom Holdings"],
          ["Package name", "com.hacom.chat"],
          ["Developer", "HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY"],
        ]}
      />
    </Section>

    <Section title="How to request deletion">
      <p className="mb-2">Authorized personnel of Hacom Holdings may request deletion of their account and data by sending an email to the IT Department with the following information:</p>
      <ul className="space-y-1">
        <li>Full name</li>
        <li>Employee code or login email used in the app</li>
        <li>Contact phone number (optional)</li>
        <li>Reason for the request (optional)</li>
      </ul>
      <ContactButton href={DELETE_MAILTO_EN}>Send request by email</ContactButton>
    </Section>

    <Section title="Data that will be deleted">
      <p className="mb-2">Once your request is verified, the following data will be removed from Hacom Holdings systems:</p>
      <ul className="space-y-1">
        <li>Profile information: display name, avatar, phone number, bio</li>
        <li>Direct messages and messages you sent in group conversations</li>
        <li>Photos, videos, and documents you uploaded or attached to conversations</li>
        <li>Personal calendar events and meetings you created</li>
        <li>Personal documents uploaded for the AI assistant</li>
        <li>Push notification token (FCM token) and Firebase Installation ID</li>
        <li>Crash report history linked to your account (Crashlytics installation UUID)</li>
      </ul>
    </Section>

    <Section title="Data that will be retained">
      <p className="mb-2">Some data must be retained for security, audit, or technical reasons:</p>
      <ul className="space-y-1">
        <li>Audit logs: retained for 12 months in accordance with security and legal requirements</li>
        <li>Messages you sent to other users remain visible to them, labeled as "[Deleted User]"</li>
        <li>System backups: automatically expire after 30 days as part of standard rotation</li>
        <li>Core HR records (employee code, salary, contracts) are managed by the corporate HR system and are outside the scope of this application</li>
      </ul>
    </Section>

    <Section title="Processing timeline">
      <Timeline
        items={[
          { title: "Upon receiving the request (Day 0)", desc: "The IT Department verifies the requester's identity within 2 business days." },
          { title: "Account deactivation (Day 1-3)", desc: 'The account is blocked from login. Personal information (name, avatar, phone) is hidden in the UI and replaced with the label "Deleted User".' },
          { title: "Grace period (30 days)", desc: "Within 30 days of deactivation, you may email us to restore the account if you change your mind." },
          { title: "Permanent deletion (after 30 days)", desc: 'All data listed under "Data that will be deleted" is permanently removed from the servers. Recovery is no longer possible.' },
        ]}
      />
    </Section>

    <Section title="Contact">
      <Meta
        rows={[
          ["IT Department email", <a key="m" href="mailto:it@hacomholdings.com.vn">it@hacomholdings.com.vn</a>],
          ["Privacy policy", <a key="p" href="/privacy-policy">chat.hacomholdings.com.vn/privacy-policy</a>],
          ["Website", <a key="w" href="https://hacomholdings.com.vn" target="_blank" rel="noopener noreferrer">hacomholdings.com.vn</a>],
        ]}
      />
    </Section>
  </div>
);

export const DataDeletionPage: React.FC = () => {
  const [lang, setLang] = useState<Lang>("vi");

  return (
    <div className="h-full overflow-y-auto bg-[#eef2f7]">
      <div className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-1.5 rounded-full bg-[#1565C0]" />
            <span className="text-sm font-semibold text-[#0f172a]">HACOM HOLDINGS</span>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-[#eef2f7] p-1 ring-1 ring-inset ring-[#d7dce3]/70">
            <button
              onClick={() => setLang("vi")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                lang === "vi" ? "bg-[#1565C0] text-white shadow-sm" : "text-[#64748b] hover:text-[#1e293b]"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              onClick={() => setLang("en")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                lang === "en" ? "bg-[#1565C0] text-white shadow-sm" : "text-[#64748b] hover:text-[#1e293b]"
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] md:p-10">
          {lang === "vi" ? <ViContent /> : <EnContent />}
        </div>

        <footer className="mt-8 pb-10 text-center text-xs text-[#94a3b8]">
          <p>{lang === "vi" ? `Cập nhật lần cuối: ${UPDATED_DATE_VI}` : `Last updated: ${UPDATED_DATE_EN}`}</p>
          <p className="mt-1">© 2026 HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
};
