import React, { useState } from "react";

type Lang = "vi" | "en";

const UPDATED_DATE_VI = "25/06/2026";
const UPDATED_DATE_EN = "June 25, 2026";

/* ─── shared primitives ─── */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="mb-4 flex items-center gap-2.5 border-b border-[#eef2f7] pb-2.5 text-[15px] font-semibold tracking-tight text-[#0f172a]">
      <span aria-hidden className="h-4 w-1 rounded-full bg-[#1565C0]" />
      {title}
    </h2>
    <div className="text-sm leading-relaxed text-[#334155]">{children}</div>
  </section>
);

const FaqItem: React.FC<{ q: string; children: React.ReactNode }> = ({ q, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#eef2f7] last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-medium text-[#1e293b] hover:text-[#1565C0] transition-colors"
      >
        <span>{q}</span>
        <span className={`shrink-0 text-[#1565C0] transition-transform duration-200 ${open ? "rotate-45" : ""}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="pb-4 text-sm leading-relaxed text-[#475569]">{children}</div>
      )}
    </div>
  );
};

/* ─── Vietnamese content ─── */

const ViContent: React.FC = () => (
  <div className="space-y-8">
    {/* header */}
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Trợ giúp & hỗ trợ</h1>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-[#64748b]">Hacom Holdings — Trung tâm hỗ trợ</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Email hỗ trợ:</span>{" "}
          <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">support@hacomholdings.com.vn</a>
        </p>
        <p><span className="font-medium">Giờ hỗ trợ:</span> Thứ 2 – Thứ 6, 8:00 – 17:30 (Giờ Việt Nam)</p>
        <p><span className="font-medium">Phiên bản tài liệu:</span> {UPDATED_DATE_VI}</p>
      </div>
    </div>

    {/* contact */}
    <Section title="1. Liên hệ hỗ trợ">
      <p>Nếu bạn gặp bất kỳ sự cố nào khi sử dụng Hacom Holdings, vui lòng liên hệ với đội ngũ hỗ trợ theo các kênh sau:</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4">
          <p className="text-xs font-semibold text-[#64748b] mb-1.5">Email hỗ trợ kỹ thuật</p>
          <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline break-all">support@hacomholdings.com.vn</a>
          <p className="mt-1.5 text-xs text-[#64748b]">Phản hồi trong vòng 1 ngày làm việc</p>
        </div>
        <div className="rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4">
          <p className="text-xs font-semibold text-[#64748b] mb-1.5">Bộ phận IT nội bộ</p>
          <a href="mailto:it@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline break-all">it@hacomholdings.com.vn</a>
          <p className="mt-1.5 text-xs text-[#64748b]">Dành cho yêu cầu quản trị tài khoản</p>
        </div>
      </div>
    </Section>

    {/* bug report */}
    <Section title="2. Cách báo lỗi">
      <p>Khi gặp sự cố, hãy gửi email đến <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">support@hacomholdings.com.vn</a> với các thông tin sau để chúng tôi xử lý nhanh nhất:</p>
      <ol className="mt-3 space-y-2 list-none pl-0">
        {[
          ["Mô tả lỗi", "Nêu rõ bạn đang làm gì và điều gì xảy ra sai so với kỳ vọng."],
          ["Các bước tái hiện", "Liệt kê từng bước để chúng tôi tự tái hiện được lỗi."],
          ["Thiết bị & trình duyệt", "Ví dụ: Windows 11, Chrome 125 — hoặc iOS 17, Safari."],
          ["Thời điểm xảy ra", "Ngày giờ cụ thể giúp tra cứu log hệ thống."],
          ["Ảnh chụp màn hình (nếu có)", "Đính kèm ảnh hoặc video ngắn nếu lỗi hiện thị trực quan."],
        ].map(([title, desc], i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fbff] p-3">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1565C0] text-[10px] font-bold text-white">{i + 1}</span>
            <span><span className="font-medium text-[#1e293b]">{title}:</span> {desc}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3.5 text-sm text-[#854d0e]">
        <span className="font-medium">Lưu ý:</span> Không chia sẻ mật khẩu hoặc thông tin đăng nhập trong email báo lỗi. Chúng tôi sẽ không bao giờ yêu cầu mật khẩu của bạn.
      </p>
    </Section>

    {/* FAQ */}
    <Section title="3. Câu hỏi thường gặp">
      {/* login */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Đăng nhập & tài khoản</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="Tôi không đăng nhập được, phải làm gì?">
          <ul className="space-y-1.5 pl-4">
            <li>— Kiểm tra lại tên đăng nhập và mật khẩu (phân biệt chữ hoa/thường).</li>
            <li>— Thử làm mới trang hoặc xóa bộ nhớ cache trình duyệt (<kbd className="rounded bg-[#eef2f7] px-1.5 py-0.5 text-xs font-mono">Ctrl+Shift+Delete</kbd>).</li>
            <li>— Nếu tài khoản bị khóa, liên hệ quản trị viên hoặc email <a href="mailto:support@hacomholdings.com.vn" className="text-[#1565C0] hover:underline">support@hacomholdings.com.vn</a>.</li>
            <li>— Tài khoản Hacom Holdings do bộ phận IT cấp phát — bạn không thể tự đăng ký.</li>
          </ul>
        </FaqItem>
        <FaqItem q="Tôi quên mật khẩu, cách lấy lại?">
          <p>Truy cập trang đăng nhập và chọn <span className="font-medium">Quên mật khẩu</span>. Hệ thống sẽ gửi email đặt lại mật khẩu về địa chỉ email công ty của bạn. Nếu không nhận được email sau 5 phút, hãy kiểm tra thư mục Spam hoặc liên hệ bộ phận IT.</p>
        </FaqItem>
        <FaqItem q="Làm thế nào để đổi mật khẩu?">
          <p>Sau khi đăng nhập, vào <span className="font-medium">Cài đặt → Bảo mật → Đổi mật khẩu</span>. Nhập mật khẩu hiện tại, sau đó nhập mật khẩu mới (tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số). Nhấn <span className="font-medium">Lưu</span> để hoàn tất.</p>
        </FaqItem>
        <FaqItem q="Tôi bị yêu cầu đổi mật khẩu khi đăng nhập lần đầu?">
          <p>Đây là yêu cầu bảo mật bắt buộc. Quản trị viên đặt mật khẩu tạm thời khi tạo tài khoản — bạn phải đổi sang mật khẩu riêng trước khi sử dụng ứng dụng.</p>
        </FaqItem>
        <FaqItem q="Tôi có thể đăng nhập trên nhiều thiết bị cùng lúc không?">
          <p>Có. Hacom Holdings hỗ trợ đăng nhập đồng thời trên nhiều thiết bị. Thông báo và tin nhắn sẽ được đồng bộ theo thời gian thực.</p>
        </FaqItem>
      </div>

      {/* messaging */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Nhắn tin</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="Làm sao để gửi tin nhắn cho đồng nghiệp?">
          <p>Nhấn biểu tượng <span className="font-medium">Tạo cuộc trò chuyện</span> (hoặc nút <span className="font-medium">+</span>) ở thanh bên, tìm tên đồng nghiệp và chọn để bắt đầu cuộc trò chuyện riêng tư.</p>
        </FaqItem>
        <FaqItem q="Tôi có thể gửi file/ảnh không?">
          <p>Có. Nhấn biểu tượng <span className="font-medium">ghim</span> (paperclip) trong ô nhập tin nhắn để đính kèm file, ảnh hoặc video. Kéo thả file trực tiếp vào cửa sổ trò chuyện cũng được hỗ trợ.</p>
        </FaqItem>
        <FaqItem q="Tin nhắn đã gửi có xóa được không?">
          <p>Có. Nhấn giữ (hoặc nhấn phải) vào tin nhắn → chọn <span className="font-medium">Xóa</span>. Bạn có thể chọn xóa chỉ với mình hoặc xóa với tất cả người trong cuộc trò chuyện (tùy quyền).</p>
        </FaqItem>
        <FaqItem q="Làm sao để trả lời một tin nhắn cụ thể?">
          <p>Di chuột qua tin nhắn cần trả lời và nhấn biểu tượng <span className="font-medium">Trả lời</span> (mũi tên quay lại). Tin nhắn gốc sẽ được trích dẫn trong phần trả lời của bạn.</p>
        </FaqItem>
        <FaqItem q="Tôi có thể tìm kiếm tin nhắn cũ không?">
          <p>Có. Nhấn biểu tượng <span className="font-medium">Tìm kiếm</span> trong cửa sổ trò chuyện để tìm theo từ khóa trong lịch sử tin nhắn của cuộc hội thoại đó.</p>
        </FaqItem>
      </div>

      {/* groups */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Trò chuyện nhóm</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="Làm sao để tạo nhóm mới?">
          <p>Nhấn <span className="font-medium">+</span> → <span className="font-medium">Tạo nhóm</span>, đặt tên nhóm và thêm thành viên. Nhóm có thể có nhiều thành viên và được quản lý bởi chủ nhóm (owner) và quản trị viên nhóm (admin).</p>
        </FaqItem>
        <FaqItem q="Làm sao để thêm hoặc xóa thành viên nhóm?">
          <p>Mở nhóm → nhấn <span className="font-medium">Thông tin nhóm</span> (biểu tượng ⓘ góc trên bên phải) → <span className="font-medium">Thành viên</span>. Chủ nhóm và admin nhóm có thể thêm hoặc xóa thành viên tại đây.</p>
        </FaqItem>
        <FaqItem q="Tôi có thể tắt thông báo cho một nhóm cụ thể không?">
          <p>Có. Nhấn vào tên nhóm ở đầu cửa sổ chat → chọn <span className="font-medium">Tắt thông báo</span>. Bạn có thể tắt trong 1 giờ, 8 giờ, 1 tuần hoặc cho đến khi bật lại.</p>
        </FaqItem>
        <FaqItem q="Làm sao để rời khỏi một nhóm?">
          <p>Vào <span className="font-medium">Thông tin nhóm → Rời nhóm</span>. Nếu bạn là chủ nhóm, hãy chuyển quyền sở hữu cho thành viên khác trước khi rời.</p>
        </FaqItem>
        <FaqItem q="Ai có thể ghim tin nhắn trong nhóm?">
          <p>Chủ nhóm và admin nhóm có quyền ghim tin nhắn. Tin nhắn được ghim sẽ hiển thị ở đầu cửa sổ chat để mọi thành viên dễ theo dõi.</p>
        </FaqItem>
      </div>

      {/* notifications */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Thông báo & cài đặt</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7]">
        <FaqItem q="Tôi không nhận được thông báo trên trình duyệt?">
          <ul className="space-y-1.5 pl-4">
            <li>— Kiểm tra xem trình duyệt đã cấp quyền thông báo cho trang chat chưa (<span className="font-medium">Settings → Privacy → Notifications</span>).</li>
            <li>— Vào <span className="font-medium">Hacom Holdings → Cài đặt → Thông báo</span> và đảm bảo thông báo đẩy đã được bật.</li>
            <li>— Kiểm tra cài đặt "Không làm phiền" trên hệ điều hành.</li>
          </ul>
        </FaqItem>
        <FaqItem q="Làm sao đổi ngôn ngữ giao diện?">
          <p>Vào <span className="font-medium">Cài đặt → Ngôn ngữ</span> và chọn Tiếng Việt hoặc English. Thay đổi có hiệu lực ngay lập tức, không cần tải lại trang.</p>
        </FaqItem>
        <FaqItem q="Làm sao bật/tắt chế độ tối (Dark mode)?">
          <p>Vào <span className="font-medium">Cài đặt → Giao diện → Chủ đề</span> và chọn Sáng, Tối hoặc Theo hệ thống.</p>
        </FaqItem>
      </div>
    </Section>

    {/* privacy link */}
    <Section title="4. Chính sách bảo mật">
      <p>Hacom Holdings cam kết bảo vệ dữ liệu cá nhân của người dùng theo đúng quy định pháp luật và tiêu chuẩn bảo mật của tổ chức.</p>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4">
        <svg className="shrink-0 text-[#1565C0]" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L3 5v5c0 4.418 3.04 8.07 7 9 3.96-.93 7-4.582 7-9V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <div>
          <p className="text-sm text-[#334155]">Xem đầy đủ Chính sách Bảo mật của chúng tôi tại:</p>
          <a href="/privacy-policy" className="mt-0.5 block font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline text-sm">https://chat.hacomholdings.com.vn/privacy-policy</a>
        </div>
      </div>
    </Section>
  </div>
);

/* ─── English content ─── */

const EnContent: React.FC = () => (
  <div className="space-y-8">
    {/* header */}
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Help & Support</h1>
          <p className="mt-1 text-[11px] font-medium tracking-wide text-[#64748b]">Hacom Holdings — Support Center</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Support email:</span>{" "}
          <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">support@hacomholdings.com.vn</a>
        </p>
        <p><span className="font-medium">Support hours:</span> Monday – Friday, 8:00 – 17:30 (Vietnam Time)</p>
        <p><span className="font-medium">Document version:</span> {UPDATED_DATE_EN}</p>
      </div>
    </div>

    {/* contact */}
    <Section title="1. Contact Support">
      <p>If you encounter any issues while using Hacom Holdings, please reach out through the following channels:</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4">
          <p className="text-xs font-semibold text-[#64748b] mb-1.5">Technical support email</p>
          <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline break-all">support@hacomholdings.com.vn</a>
          <p className="mt-1.5 text-xs text-[#64748b]">Response within 1 business day</p>
        </div>
        <div className="rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4">
          <p className="text-xs font-semibold text-[#64748b] mb-1.5">Internal IT department</p>
          <a href="mailto:it@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline break-all">it@hacomholdings.com.vn</a>
          <p className="mt-1.5 text-xs text-[#64748b]">For account administration requests</p>
        </div>
      </div>
    </Section>

    {/* bug report */}
    <Section title="2. How to Report a Bug">
      <p>When you encounter an issue, email <a href="mailto:support@hacomholdings.com.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">support@hacomholdings.com.vn</a> with the following information to help us resolve it quickly:</p>
      <ol className="mt-3 space-y-2 list-none pl-0">
        {[
          ["Describe the bug", "Explain what you were doing and what happened vs. what you expected."],
          ["Steps to reproduce", "List each step so we can reproduce the bug ourselves."],
          ["Device & browser", "e.g. Windows 11, Chrome 125 — or iOS 17, Safari."],
          ["When it happened", "The exact date and time helps us look up system logs."],
          ["Screenshot (if applicable)", "Attach a screenshot or short video if the bug is visual."],
        ].map(([title, desc], i) => (
          <li key={i} className="flex gap-3 rounded-lg border border-[#eef2f7] bg-[#f8fbff] p-3">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1565C0] text-[10px] font-bold text-white">{i + 1}</span>
            <span><span className="font-medium text-[#1e293b]">{title}:</span> {desc}</span>
          </li>
        ))}
      </ol>
      <p className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3.5 text-sm text-[#854d0e]">
        <span className="font-medium">Note:</span> Never share your password or login credentials in a bug report. We will never ask for your password.
      </p>
    </Section>

    {/* FAQ */}
    <Section title="3. Frequently Asked Questions">
      {/* login */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Login & Account</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="I can't log in — what should I do?">
          <ul className="space-y-1.5 pl-4">
            <li>— Double-check your username and password (case-sensitive).</li>
            <li>— Try refreshing the page or clearing your browser cache (<kbd className="rounded bg-[#eef2f7] px-1.5 py-0.5 text-xs font-mono">Ctrl+Shift+Delete</kbd>).</li>
            <li>— If your account is locked, contact your admin or email <a href="mailto:support@hacomholdings.com.vn" className="text-[#1565C0] hover:underline">support@hacomholdings.com.vn</a>.</li>
            <li>— Hacom Holdings accounts are provisioned by the IT department — you cannot self-register.</li>
          </ul>
        </FaqItem>
        <FaqItem q="I forgot my password — how do I reset it?">
          <p>Go to the login page and click <span className="font-medium">Forgot Password</span>. A password reset email will be sent to your company email address. If you don't receive it within 5 minutes, check your Spam folder or contact the IT department.</p>
        </FaqItem>
        <FaqItem q="How do I change my password?">
          <p>After logging in, go to <span className="font-medium">Settings → Security → Change Password</span>. Enter your current password, then your new password (minimum 8 characters, including upper/lower case letters and a number). Click <span className="font-medium">Save</span> to confirm.</p>
        </FaqItem>
        <FaqItem q="I'm being asked to change my password on first login — is this normal?">
          <p>Yes. This is a mandatory security requirement. Administrators set a temporary password when creating your account — you must change it to a personal password before using the app.</p>
        </FaqItem>
        <FaqItem q="Can I log in on multiple devices at the same time?">
          <p>Yes. Hacom Holdings supports simultaneous login across multiple devices. Messages and notifications are synced in real time.</p>
        </FaqItem>
      </div>

      {/* messaging */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Messaging</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="How do I send a message to a colleague?">
          <p>Click the <span className="font-medium">New Conversation</span> button (or the <span className="font-medium">+</span> icon) in the sidebar, search for your colleague's name, and select them to start a direct message.</p>
        </FaqItem>
        <FaqItem q="Can I send files or images?">
          <p>Yes. Click the <span className="font-medium">paperclip</span> icon in the message input to attach files, images, or videos. You can also drag and drop files directly into the chat window.</p>
        </FaqItem>
        <FaqItem q="Can I delete a message after sending it?">
          <p>Yes. Long-press (or right-click) on a message and select <span className="font-medium">Delete</span>. You can choose to delete it only for yourself or for everyone in the conversation (depending on permissions).</p>
        </FaqItem>
        <FaqItem q="How do I reply to a specific message?">
          <p>Hover over the message you want to reply to and click the <span className="font-medium">Reply</span> icon (curved arrow). The original message will be quoted in your reply.</p>
        </FaqItem>
        <FaqItem q="Can I search through old messages?">
          <p>Yes. Click the <span className="font-medium">Search</span> icon at the top of the chat window to search by keyword within that conversation's message history.</p>
        </FaqItem>
      </div>

      {/* groups */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Group Chat</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7] mb-6">
        <FaqItem q="How do I create a new group?">
          <p>Click <span className="font-medium">+</span> → <span className="font-medium">Create Group</span>, give it a name, and add members. Groups can have multiple members and are managed by the owner and group admins.</p>
        </FaqItem>
        <FaqItem q="How do I add or remove group members?">
          <p>Open the group → click <span className="font-medium">Group Info</span> (ⓘ icon, top right) → <span className="font-medium">Members</span>. The group owner and admins can add or remove members there.</p>
        </FaqItem>
        <FaqItem q="Can I mute notifications for a specific group?">
          <p>Yes. Click the group name at the top of the chat window → select <span className="font-medium">Mute Notifications</span>. You can mute for 1 hour, 8 hours, 1 week, or indefinitely.</p>
        </FaqItem>
        <FaqItem q="How do I leave a group?">
          <p>Go to <span className="font-medium">Group Info → Leave Group</span>. If you are the owner, transfer ownership to another member before leaving.</p>
        </FaqItem>
        <FaqItem q="Who can pin messages in a group?">
          <p>The group owner and admins can pin messages. Pinned messages appear at the top of the chat window so all members can easily refer to them.</p>
        </FaqItem>
      </div>

      {/* notifications */}
      <p className="mb-3 text-xs font-semibold text-[#64748b]">Notifications & Settings</p>
      <div className="rounded-xl border border-[#e5e7eb] divide-y divide-[#eef2f7]">
        <FaqItem q="I'm not receiving browser notifications — how do I fix this?">
          <ul className="space-y-1.5 pl-4">
            <li>— Check that your browser has granted notification permission for the chat site (<span className="font-medium">Settings → Privacy → Notifications</span>).</li>
            <li>— Go to <span className="font-medium">Hacom Holdings → Settings → Notifications</span> and make sure push notifications are enabled.</li>
            <li>— Check your OS "Do Not Disturb" settings.</li>
          </ul>
        </FaqItem>
        <FaqItem q="How do I change the interface language?">
          <p>Go to <span className="font-medium">Settings → Language</span> and select Vietnamese or English. The change takes effect immediately — no reload required.</p>
        </FaqItem>
        <FaqItem q="How do I enable or disable Dark Mode?">
          <p>Go to <span className="font-medium">Settings → Appearance → Theme</span> and choose Light, Dark, or System.</p>
        </FaqItem>
      </div>
    </Section>

    {/* privacy link */}
    <Section title="4. Privacy Policy">
      <p>Hacom Holdings is committed to protecting users' personal data in accordance with applicable law and organizational security standards.</p>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4">
        <svg className="shrink-0 text-[#1565C0]" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L3 5v5c0 4.418 3.04 8.07 7 9 3.96-.93 7-4.582 7-9V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <div>
          <p className="text-sm text-[#334155]">Read our full Privacy Policy at:</p>
          <a href="/privacy-policy" className="mt-0.5 block font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline text-sm">https://chat.hacomholdings.com.vn/privacy-policy</a>
        </div>
      </div>
    </Section>
  </div>
);

/* ─── page shell ─── */

export const SupportPage: React.FC = () => {
  const [lang, setLang] = useState<Lang>("vi");

  return (
    <div className="h-full overflow-y-auto bg-[#eef2f7]">
      <div className="sticky top-0 z-10 border-b border-[#e5e7eb] bg-white/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.10)] md:p-10">
          {lang === "vi" ? <ViContent /> : <EnContent />}
        </div>

        <footer className="mt-8 pb-10 text-center text-xs text-[#94a3b8]">
          <p>
            {lang === "vi"
              ? `Cập nhật lần cuối: ${UPDATED_DATE_VI}`
              : `Last updated: ${UPDATED_DATE_EN}`}
          </p>
          <p className="mt-1">© 2026 HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
};
