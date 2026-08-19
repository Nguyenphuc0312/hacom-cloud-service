import React, { useState } from "react";

type Lang = "vi" | "en";

const UPDATED_DATE_VI = "25/06/2026";
const UPDATED_DATE_EN = "June 25, 2026";

/* ─── shared primitives ─── */

const Section: React.FC<{ title: string; id?: string; children: React.ReactNode }> = ({ title, id, children }) => (
  <section id={id}>
    <h2 className="mb-4 flex items-center gap-2.5 border-b border-[#eef2f7] pb-2.5 text-[15px] font-semibold tracking-tight text-[#0f172a]">
      <span aria-hidden className="h-4 w-1 rounded-full bg-[#1565C0]" />
      {title}
    </h2>
    <div className="text-sm leading-relaxed text-[#334155] space-y-3">{children}</div>
  </section>
);

const toc_vi = [
  ["Đồng ý với Điều khoản", "#agreement"],
  ["Dịch vụ của chúng tôi", "#services"],
  ["Quyền sở hữu trí tuệ", "#ip"],
  ["Cam kết của người dùng", "#userreps"],
  ["Hoạt động bị cấm", "#prohibited"],
  ["Nội dung do người dùng tạo", "#ugc"],
  ["Giấy phép đóng góp", "#license"],
  ["Giấy phép ứng dụng di động", "#mobile"],
  ["Quản lý dịch vụ", "#sitemanage"],
  ["Chính sách bảo mật", "#ppyes"],
  ["Thời hạn & Chấm dứt", "#terms"],
  ["Thay đổi & Gián đoạn dịch vụ", "#modifications"],
  ["Luật áp dụng", "#law"],
  ["Giải quyết tranh chấp", "#disputes"],
  ["Các điều khoản khác", "#misc"],
  ["Liên hệ chúng tôi", "#contact"],
];

const toc_en = [
  ["Agreement to Our Legal Terms", "#agreement"],
  ["Our Services", "#services"],
  ["Intellectual Property Rights", "#ip"],
  ["User Representations", "#userreps"],
  ["Prohibited Activities", "#prohibited"],
  ["User Generated Contributions", "#ugc"],
  ["Contribution License", "#license"],
  ["Mobile Application License", "#mobile"],
  ["Services Management", "#sitemanage"],
  ["Privacy Policy", "#ppyes"],
  ["Term and Termination", "#terms"],
  ["Modifications and Interruptions", "#modifications"],
  ["Governing Law", "#law"],
  ["Dispute Resolution", "#disputes"],
  ["Miscellaneous", "#misc"],
  ["Contact Us", "#contact"],
];

/* ─── Vietnamese content ─── */

const ViContent: React.FC = () => (
  <div className="space-y-8">
    {/* header */}
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Điều Khoản Dịch Vụ</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Cập nhật lần cuối:</span> {UPDATED_DATE_VI}</p>
        <p><span className="font-medium">Công ty:</span> CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        <p><span className="font-medium">Email:</span> <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Điện thoại:</span> <a href="tel:+842466646333" className="font-medium text-[#1565C0] hover:underline">(+84) 24 6664 6333</a></p>
      </div>
    </div>

    {/* TOC */}
    <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fbff] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b] mb-3">Mục lục</p>
      <ol className="list-none space-y-1.5 pl-0">
        {toc_vi.map(([label, href], i) => (
          <li key={href}>
            <a href={href} className="text-sm text-[#1565C0] hover:text-[#1976D2] hover:underline">
              {i + 1}. {label}
            </a>
          </li>
        ))}
      </ol>
    </div>

    <Section title="1. Đồng ý với Điều khoản" id="agreement">
      <p>Chúng tôi là <strong>CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</strong> ("Công ty", "chúng tôi"), đăng ký hoạt động tại Việt Nam, địa chỉ Tầng 5, Tháp B, Tòa The Light, Phường Đại Mỗ, TP. Hà Nội.</p>
      <p>Chúng tôi vận hành <strong>HACOM Chat</strong> — nền tảng liên lạc và cộng tác nội bộ dành riêng cho nhân viên Hacom Holdings ("Dịch vụ").</p>
      <p>Bằng cách truy cập hoặc sử dụng Dịch vụ, bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi toàn bộ các điều khoản pháp lý này. <strong>Nếu bạn không đồng ý, hãy ngừng sử dụng Dịch vụ ngay lập tức.</strong></p>
      <p>Chúng tôi bảo lưu quyền cập nhật các Điều khoản này bất cứ lúc nào. Việc tiếp tục sử dụng Dịch vụ sau khi thay đổi đồng nghĩa với việc bạn chấp nhận phiên bản mới nhất.</p>
      <p className="rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5 text-sm">Dịch vụ chỉ dành cho người dùng từ <strong>18 tuổi trở lên</strong>. Người dưới 18 tuổi không được đăng ký hoặc sử dụng Dịch vụ.</p>
    </Section>

    <Section title="2. Dịch vụ của chúng tôi" id="services">
      <p>HACOM Chat là nền tảng nội bộ cung cấp:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Nhắn tin cá nhân & nhóm (phản hồi, ghim, chỉnh sửa, thu hồi tin nhắn)",
          "Chia sẻ tài liệu: ảnh, video, PDF, Word, Excel",
          "Quản lý lịch & cuộc họp (mời tham gia, theo dõi phản hồi)",
          "Trợ lý AI nội bộ — tra cứu thông tin, tóm tắt tài liệu",
          "Thông báo thời gian thực cho tin nhắn, cuộc họp và thông báo công ty",
          "Danh bạ nhân viên và thông tin nhân sự nội bộ",
          "Hỗ trợ đa ngôn ngữ: Tiếng Việt và Tiếng Anh",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
      <p className="rounded-xl border border-[#d7dce3] bg-[#eef2f7]/70 p-3.5 text-sm text-[#475569]">Ứng dụng <span className="font-medium">không mở cho công chúng</span> và không hỗ trợ tự đăng ký. Tài khoản được cấp phát và quản lý bởi bộ phận IT/HR của tổ chức.</p>
    </Section>

    <Section title="3. Quyền sở hữu trí tuệ" id="ip">
      <p>Chúng tôi sở hữu hoặc được cấp phép toàn bộ quyền sở hữu trí tuệ đối với Dịch vụ, bao gồm mã nguồn, cơ sở dữ liệu, thiết kế giao diện, âm thanh, video, hình ảnh, nhãn hiệu và logo ("Nội dung").</p>
      <p>Chúng tôi cấp cho bạn quyền sử dụng có giới hạn, không độc quyền, không thể chuyển nhượng để truy cập Dịch vụ cho mục đích <strong>sử dụng nội bộ phi thương mại</strong>.</p>
      <p>Nghiêm cấm sao chép, tái phát hành, bán, cấp phép lại hoặc khai thác thương mại bất kỳ phần nào của Dịch vụ mà không có văn bản cho phép từ chúng tôi. Mọi vi phạm sẽ dẫn đến chấm dứt quyền sử dụng ngay lập tức.</p>
      <p>Mọi yêu cầu cấp phép bổ sung xin gửi về: <a href="mailto:admin@hacomholdings.vn" className="text-[#1565C0] hover:underline">admin@hacomholdings.vn</a>.</p>
    </Section>

    <Section title="4. Cam kết của người dùng" id="userreps">
      <p>Khi sử dụng Dịch vụ, bạn cam kết và bảo đảm rằng:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Bạn có đủ năng lực pháp lý và đồng ý tuân thủ các Điều khoản này.",
          "Bạn không phải là người chưa thành niên theo quy định của pháp luật.",
          "Bạn không truy cập Dịch vụ thông qua các phương tiện tự động, bot hoặc script.",
          "Bạn không sử dụng Dịch vụ cho bất kỳ mục đích bất hợp pháp nào.",
          "Việc sử dụng của bạn tuân thủ mọi luật và quy định hiện hành.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">({i + 1})</span>{item}</li>
        ))}
      </ul>
      <p>Nếu bạn cung cấp thông tin sai lệch hoặc không chính xác, chúng tôi có quyền tạm khóa hoặc chấm dứt tài khoản của bạn.</p>
    </Section>

    <Section title="5. Hoạt động bị cấm" id="prohibited">
      <p>Bạn không được sử dụng Dịch vụ cho bất kỳ mục đích nào ngoài mục đích chúng tôi cung cấp. Cụ thể, nghiêm cấm:</p>
      <ul className="list-none pl-0 space-y-1.5">
        {[
          "Thu thập dữ liệu hệ thống mà không có sự cho phép bằng văn bản.",
          "Lừa đảo, gian lận hoặc đánh cắp thông tin tài khoản của người dùng khác.",
          "Can thiệp hoặc phá vỡ các tính năng bảo mật của Dịch vụ.",
          "Tải lên virus, mã độc hoặc nội dung gây hại.",
          "Sử dụng bot, script hoặc công cụ tự động hóa để truy cập Dịch vụ.",
          "Mạo danh người dùng khác hoặc nhân viên của công ty.",
          "Quấy rối, đe dọa hoặc phân biệt đối xử với người dùng khác.",
          "Sử dụng Dịch vụ để cạnh tranh thương mại với chúng tôi.",
          "Đăng nội dung vi phạm pháp luật, khiêu dâm, thù ghét hoặc sai sự thật.",
          "Bán hoặc chuyển nhượng hồ sơ tài khoản của bạn cho người khác.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="6. Nội dung do người dùng tạo" id="ugc">
      <p>Dịch vụ cho phép bạn tạo, chia sẻ và truyền tải nội dung bao gồm tin nhắn, hình ảnh, tệp và các tài liệu khác ("Đóng góp"). Khi đăng Đóng góp, bạn tuyên bố và bảo đảm rằng:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Đóng góp của bạn không vi phạm quyền sở hữu trí tuệ của bên thứ ba.",
          "Bạn có đủ quyền để chia sẻ nội dung đó.",
          "Đóng góp không chứa nội dung bất hợp pháp, tục tĩu, thù ghét hoặc sai sự thật.",
          "Đóng góp không vi phạm quyền riêng tư của bất kỳ cá nhân nào.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
      <p>Chúng tôi có thể xóa hoặc chỉnh sửa bất kỳ Đóng góp nào vi phạm các Điều khoản này mà không cần thông báo trước.</p>
    </Section>

    <Section title="7. Giấy phép đóng góp" id="license">
      <p>Bằng cách đăng Đóng góp, bạn cấp cho chúng tôi quyền sử dụng, sao chép, phân phối và hiển thị nội dung đó trong phạm vi vận hành Dịch vụ. Quyền này không ảnh hưởng đến quyền sở hữu của bạn đối với nội dung.</p>
      <p>Chúng tôi không yêu cầu quyền sở hữu Đóng góp của bạn. Bạn vẫn giữ toàn bộ quyền sở hữu trí tuệ liên quan.</p>
      <p>Chúng tôi có quyền, theo quyết định riêng, chỉnh sửa, phân loại lại hoặc xóa bất kỳ Đóng góp nào bất cứ lúc nào mà không cần thông báo.</p>
    </Section>

    <Section title="8. Giấy phép ứng dụng di động" id="mobile">
      <p>Nếu bạn sử dụng Dịch vụ qua ứng dụng di động, chúng tôi cấp cho bạn quyền sử dụng có giới hạn, không độc quyền, không thể chuyển nhượng để cài đặt và sử dụng ứng dụng trên thiết bị cá nhân của bạn. Bạn không được:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Dịch ngược, giải mã hoặc cố tìm mã nguồn ứng dụng.",
          "Sửa đổi, cải tiến hoặc tạo ra sản phẩm phái sinh từ ứng dụng.",
          "Sử dụng ứng dụng để tạo sản phẩm cạnh tranh trực tiếp.",
          "Phân phối ứng dụng trên mạng hoặc môi trường cho phép nhiều thiết bị truy cập đồng thời.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="9. Quản lý dịch vụ" id="sitemanage">
      <p>Chúng tôi bảo lưu quyền, nhưng không có nghĩa vụ:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Giám sát Dịch vụ để phát hiện vi phạm Điều khoản.",
          "Thực hiện hành động pháp lý phù hợp đối với bất kỳ hành vi vi phạm nào.",
          "Từ chối, hạn chế hoặc vô hiệu hóa quyền truy cập của bất kỳ người dùng nào.",
          "Xóa nội dung quá lớn hoặc gây ảnh hưởng đến hệ thống.",
          "Quản lý Dịch vụ nhằm bảo vệ quyền lợi của chúng tôi và đảm bảo hoạt động bình thường.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="10. Chính sách bảo mật" id="ppyes">
      <p>Chúng tôi quan tâm đến việc bảo vệ dữ liệu và quyền riêng tư của bạn. Vui lòng đọc Chính sách Bảo mật của chúng tôi tại:</p>
      <div className="flex items-center gap-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5">
        <svg className="shrink-0 text-[#1565C0]" width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L3 5v5c0 4.418 3.04 8.07 7 9 3.96-.93 7-4.582 7-9V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <a href="/privacy-policy" className="text-sm font-medium text-[#1565C0] hover:underline">https://chat.hacomholdings.com.vn/privacy-policy</a>
      </div>
      <p>Bằng cách sử dụng Dịch vụ, bạn đồng ý bị ràng buộc bởi Chính sách Bảo mật, được tích hợp vào các Điều khoản này. Dịch vụ được lưu trữ tại <strong>Việt Nam</strong>.</p>
    </Section>

    <Section title="11. Thời hạn & Chấm dứt" id="terms">
      <p>Các Điều khoản này có hiệu lực khi bạn sử dụng Dịch vụ. Chúng tôi bảo lưu quyền từ chối quyền truy cập, đình chỉ hoặc chấm dứt tài khoản của bạn bất cứ lúc nào và vì bất kỳ lý do gì mà không cần thông báo trước, bao gồm trường hợp vi phạm các Điều khoản này.</p>
      <p>Nếu tài khoản bị chấm dứt, bạn không được phép tạo tài khoản mới dưới tên thật, tên giả hoặc tên của bên thứ ba.</p>
    </Section>

    <Section title="12. Thay đổi & Gián đoạn dịch vụ" id="modifications">
      <p>Chúng tôi bảo lưu quyền thay đổi, sửa đổi hoặc xóa nội dung của Dịch vụ bất cứ lúc nào mà không cần thông báo. Chúng tôi không đảm bảo Dịch vụ sẽ hoạt động liên tục và không có lỗi.</p>
      <p>Chúng tôi không chịu trách nhiệm về bất kỳ tổn thất, thiệt hại hoặc sự bất tiện nào phát sinh từ việc bạn không thể truy cập Dịch vụ trong thời gian bảo trì hoặc gián đoạn.</p>
    </Section>

    <Section title="13. Luật áp dụng" id="law">
      <p>Các Điều khoản này được điều chỉnh và giải thích theo <strong>pháp luật Việt Nam</strong>. Hacom Holdings và bạn đồng ý rằng tòa án Việt Nam có thẩm quyền giải quyết mọi tranh chấp phát sinh từ các Điều khoản này.</p>
    </Section>

    <Section title="14. Giải quyết tranh chấp" id="disputes">
      <p>Bạn đồng ý giải quyết mọi tranh chấp liên quan đến Dịch vụ hoặc các Điều khoản này tại tòa án có thẩm quyền tại <strong>Việt Nam</strong>.</p>
      <p>Hacom Holdings cũng có quyền khởi kiện tại tòa án nơi bạn cư trú hoặc nơi đặt trụ sở kinh doanh chính của bạn.</p>
    </Section>

    <Section title="15. Tuyên bố miễn trách nhiệm">
      <p>DỊCH VỤ ĐƯỢC CUNG CẤP THEO TRẠNG THÁI "NGUYÊN TRẠNG". TRONG PHẠM VI TỐI ĐA ĐƯỢC PHÁP LUẬT CHO PHÉP, CHÚNG TÔI KHÔNG ĐƯA RA BẤT KỲ BẢO ĐẢM NÀO, RÕ RÀNG HAY ẨN Ý, VỀ KHẢ NĂNG BÁN HÀNG, SỰ PHÙ HỢP CHO MỤC ĐÍCH CỤ THỂ HOẶC KHÔNG VI PHẠM QUYỀN KHÁC.</p>
      <p>Chúng tôi không chịu trách nhiệm về lỗi, thiếu sót trong nội dung; thiệt hại cá nhân hoặc tài sản phát sinh từ việc sử dụng Dịch vụ; hay gián đoạn hoặc lỗi truyền dẫn.</p>
    </Section>

    <Section title="16. Giới hạn trách nhiệm pháp lý">
      <p>TRONG MỌI TRƯỜNG HỢP, CHÚNG TÔI HOẶC CÁC GIÁM ĐỐC, NHÂN VIÊN, ĐẠI LÝ CỦA CHÚNG TÔI KHÔNG CHỊU TRÁCH NHIỆM VỀ BẤT KỲ THIỆT HẠI TRỰC TIẾP, GIÁN TIẾP, HẬU QUẢ, NGẪU NHIÊN HOẶC PHẠT BỒI THƯỜNG NÀO PHÁT SINH TỪ VIỆC SỬ DỤNG DỊCH VỤ.</p>
    </Section>

    <Section title="17. Dữ liệu người dùng">
      <p>Chúng tôi lưu giữ một số dữ liệu bạn truyền đến Dịch vụ nhằm mục đích quản lý hiệu suất. Mặc dù thực hiện sao lưu định kỳ, bạn hoàn toàn chịu trách nhiệm về dữ liệu của mình. Chúng tôi không chịu trách nhiệm về mất mát hoặc hỏng hóc dữ liệu.</p>
    </Section>

    <Section title="18. Các điều khoản khác" id="misc">
      <p>Các Điều khoản này cùng với mọi chính sách hoặc quy tắc vận hành được đăng trên Dịch vụ cấu thành toàn bộ thỏa thuận giữa bạn và chúng tôi. Nếu bất kỳ điều khoản nào bị xác định là không hợp lệ hoặc không thể thi hành, phần còn lại vẫn tiếp tục có hiệu lực đầy đủ. Chúng tôi có thể chuyển nhượng quyền và nghĩa vụ cho bên khác bất cứ lúc nào.</p>
    </Section>

    <Section title="19. Liên hệ chúng tôi" id="contact">
      <p>Để giải quyết khiếu nại hoặc nhận thêm thông tin về Dịch vụ, vui lòng liên hệ:</p>
      <div className="mt-3 space-y-1.5 rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4 text-sm">
        <p className="font-semibold text-[#0f172a]">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        <p>Địa chỉ: Tầng 5, Tháp B, Tòa nhà CT2 (The Light), Đường Tố Hữu, Phường Đại Mỗ, Thành phố Hà Nội, Việt Nam</p>
        <p>Điện thoại: <a href="tel:+842466646333" className="text-[#1565C0] hover:underline">(+84) 24 6664 6333</a></p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="text-[#1565C0] hover:underline">admin@hacomholdings.vn</a></p>
        <p>Hỗ trợ: <a href="mailto:support@hacomholdings.com.vn" className="text-[#1565C0] hover:underline">support@hacomholdings.com.vn</a></p>
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
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Terms of Service</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Last updated:</span> {UPDATED_DATE_EN}</p>
        <p><span className="font-medium">Company:</span> HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        <p><span className="font-medium">Email:</span> <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Phone:</span> <a href="tel:+842466646333" className="font-medium text-[#1565C0] hover:underline">(+84) 24 6664 6333</a></p>
      </div>
    </div>

    {/* TOC */}
    <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fbff] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b] mb-3">Table of Contents</p>
      <ol className="list-none space-y-1.5 pl-0">
        {toc_en.map(([label, href], i) => (
          <li key={href}>
            <a href={href} className="text-sm text-[#1565C0] hover:text-[#1976D2] hover:underline">
              {i + 1}. {label}
            </a>
          </li>
        ))}
      </ol>
    </div>

    <Section title="1. Agreement to Our Legal Terms" id="agreement">
      <p>We are <strong>HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</strong> ("Company," "we," "us," "our"), registered in Vietnam, located at 5th Floor, Tower B, The Light Building, Dai Mo Ward, Hanoi.</p>
      <p>We operate <strong>HACOM Chat</strong> — an internal communication and collaboration platform designed exclusively for Hacom Holdings employees ("Services").</p>
      <p>By accessing or using the Services, you confirm that you have read, understood, and agreed to be bound by all of these Legal Terms. <strong>If you do not agree, you must discontinue use immediately.</strong></p>
      <p>We reserve the right to update these Terms at any time. Your continued use of the Services after any changes constitutes acceptance of the revised Terms.</p>
      <p className="rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5 text-sm">The Services are intended for users who are at least <strong>18 years old</strong>. Persons under the age of 18 are not permitted to use or register for the Services.</p>
    </Section>

    <Section title="2. Our Services" id="services">
      <p>HACOM Chat is an internal platform providing:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Personal and group messaging (reactions, replies, pinning, editing, recall)",
          "Document sharing: images, videos, PDFs, Word, Excel files",
          "Calendar and meeting management (invitations, attendance tracking)",
          "Internal AI Assistant — information retrieval and document summarization",
          "Real-time notifications for messages, meetings, and company announcements",
          "Employee directory and internal HR information",
          "Multilingual support: Vietnamese and English",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
      <p className="rounded-xl border border-[#d7dce3] bg-[#eef2f7]/70 p-3.5 text-sm text-[#475569]">The application is <span className="font-medium">not open to the general public</span> and does not support self-registration. Accounts are provisioned and managed by the organization's IT/HR department.</p>
    </Section>

    <Section title="3. Intellectual Property Rights" id="ip">
      <p>We own or are licensed to use all intellectual property rights in the Services, including source code, databases, interface designs, audio, video, graphics, trademarks, and logos ("Content").</p>
      <p>We grant you a limited, non-exclusive, non-transferable license to access the Services for <strong>internal, non-commercial use</strong> only.</p>
      <p>You may not copy, reproduce, republish, sell, license, or commercially exploit any part of the Services without our prior written permission. Any violation will result in immediate termination of your right to use the Services.</p>
      <p>To request additional licensing, contact: <a href="mailto:admin@hacomholdings.vn" className="text-[#1565C0] hover:underline">admin@hacomholdings.vn</a>.</p>
    </Section>

    <Section title="4. User Representations" id="userreps">
      <p>By using the Services, you represent and warrant that:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "You have the legal capacity and agree to comply with these Legal Terms.",
          "You are not a minor in the jurisdiction in which you reside.",
          "You will not access the Services through automated or non-human means, whether through a bot, script, or otherwise.",
          "You will not use the Services for any illegal or unauthorized purpose.",
          "Your use of the Services will not violate any applicable law or regulation.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">({i + 1})</span>{item}</li>
        ))}
      </ul>
      <p>If you provide any untrue, inaccurate, or incomplete information, we have the right to suspend or terminate your account.</p>
    </Section>

    <Section title="5. Prohibited Activities" id="prohibited">
      <p>You may not use the Services for any purpose other than that for which we make them available. Prohibited activities include:</p>
      <ul className="list-none pl-0 space-y-1.5">
        {[
          "Systematically retrieving data without written permission.",
          "Tricking, defrauding, or stealing sensitive account information from other users.",
          "Circumventing or disabling security-related features of the Services.",
          "Uploading viruses, malicious code, or harmful content.",
          "Using bots, scripts, or automated tools to access the Services.",
          "Impersonating another user or employee.",
          "Harassing, threatening, or discriminating against other users.",
          "Using the Services to compete commercially with us.",
          "Posting illegal, obscene, hateful, or false content.",
          "Selling or transferring your profile to another person.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="6. User Generated Contributions" id="ugc">
      <p>The Services allow you to create, share, and transmit content including messages, images, files, and other materials ("Contributions"). When posting Contributions, you represent and warrant that:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Your Contributions do not infringe the intellectual property rights of any third party.",
          "You have the necessary rights to share that content.",
          "Your Contributions do not contain illegal, obscene, hateful, or false content.",
          "Your Contributions do not violate the privacy rights of any individual.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
      <p>We may remove or edit any Contributions that violate these Terms without prior notice.</p>
    </Section>

    <Section title="7. Contribution License" id="license">
      <p>By posting Contributions, you grant us the right to use, copy, distribute, and display that content within the scope of operating the Services. This license does not affect your ownership of the content.</p>
      <p>We do not claim ownership of your Contributions. You retain full intellectual property rights associated with them.</p>
      <p>We reserve the right, in our sole discretion, to edit, re-categorize, or delete any Contributions at any time without notice.</p>
    </Section>

    <Section title="8. Mobile Application License" id="mobile">
      <p>If you access the Services via the mobile app, we grant you a revocable, non-exclusive, non-transferable license to install and use the app on your personal devices. You shall not:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Decompile, reverse engineer, or attempt to derive the source code of the app.",
          "Modify, adapt, or create derivative works from the app.",
          "Use the app to create a competing product or service.",
          "Make the app available to multiple users simultaneously over a network.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="9. Services Management" id="sitemanage">
      <p>We reserve the right, but not the obligation, to:</p>
      <ul className="list-none pl-0 space-y-1">
        {[
          "Monitor the Services for violations of these Legal Terms.",
          "Take appropriate legal action against anyone who violates the law or these Terms.",
          "Refuse, restrict, limit, or disable any user's Contributions or access.",
          "Remove files and content that are excessive in size or burdensome to our systems.",
          "Otherwise manage the Services to protect our rights and ensure proper functioning.",
        ].map((item, i) => (
          <li key={i} className="flex gap-2 text-sm"><span className="text-[#1976D2] shrink-0">—</span>{item}</li>
        ))}
      </ul>
    </Section>

    <Section title="10. Privacy Policy" id="ppyes">
      <p>We care about data privacy and security. Please review our Privacy Policy at:</p>
      <div className="flex items-center gap-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5">
        <svg className="shrink-0 text-[#1565C0]" width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 2L3 5v5c0 4.418 3.04 8.07 7 9 3.96-.93 7-4.582 7-9V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <a href="/privacy-policy" className="text-sm font-medium text-[#1565C0] hover:underline">https://chat.hacomholdings.com.vn/privacy-policy</a>
      </div>
      <p>By using the Services, you agree to be bound by our Privacy Policy, which is incorporated into these Legal Terms. The Services are hosted in <strong>Vietnam</strong>.</p>
    </Section>

    <Section title="11. Term and Termination" id="terms">
      <p>These Legal Terms shall remain in full force and effect while you use the Services. We reserve the right to deny access, suspend, or terminate your account at any time for any reason without prior notice, including breach of these Terms.</p>
      <p>If your account is terminated, you are prohibited from registering a new account under your name, a fake name, or any third party's name.</p>
    </Section>

    <Section title="12. Modifications and Interruptions" id="modifications">
      <p>We reserve the right to change, modify, or remove the contents of the Services at any time without notice. We cannot guarantee the Services will be available at all times.</p>
      <p>We will not be liable for any loss, damage, or inconvenience caused by your inability to access the Services during downtime or discontinuance.</p>
    </Section>

    <Section title="13. Governing Law" id="law">
      <p>These Legal Terms shall be governed by and interpreted in accordance with the <strong>laws of Vietnam</strong>. Hacom Holdings and you irrevocably consent that the courts of Vietnam shall have exclusive jurisdiction to resolve any dispute arising in connection with these Legal Terms.</p>
    </Section>

    <Section title="14. Dispute Resolution" id="disputes">
      <p>You agree to submit all disputes related to these Legal Terms to the jurisdiction of the <strong>courts of Vietnam</strong>.</p>
      <p>Hacom Holdings also maintains the right to bring proceedings in the courts of the country where you reside or where your principal place of business is located.</p>
    </Section>

    <Section title="15. Disclaimer">
      <p>THE SERVICES ARE PROVIDED ON AN "AS-IS" AND "AS-AVAILABLE" BASIS. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
      <p>We assume no liability for errors or omissions in content; personal injury or property damage from use of the Services; or interruptions or failures in transmission.</p>
    </Section>

    <Section title="16. Limitations of Liability">
      <p>IN NO EVENT WILL WE OR OUR DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, INCIDENTAL, SPECIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
    </Section>

    <Section title="17. User Data">
      <p>We will maintain certain data you transmit to the Services for the purpose of managing performance. Although we perform regular backups, you are solely responsible for all data you transmit. We shall have no liability to you for any loss or corruption of such data.</p>
    </Section>

    <Section title="18. Miscellaneous" id="misc">
      <p>These Legal Terms and any policies posted by us on the Services constitute the entire agreement between you and us. If any provision is found to be unlawful or unenforceable, the remaining provisions continue in full force. We may assign our rights and obligations to others at any time without restriction.</p>
    </Section>

    <Section title="19. Contact Us" id="contact">
      <p>To resolve a complaint or receive further information, please contact us at:</p>
      <div className="mt-3 space-y-1.5 rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4 text-sm">
        <p className="font-semibold text-[#0f172a]">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        <p>Address: 5th Floor, Tower B, CT2 Building (The Light), To Huu Street, Dai Mo Ward, Hanoi, Vietnam</p>
        <p>Phone: <a href="tel:+842466646333" className="text-[#1565C0] hover:underline">(+84) 24 6664 6333</a></p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="text-[#1565C0] hover:underline">admin@hacomholdings.vn</a></p>
        <p>Support: <a href="mailto:support@hacomholdings.com.vn" className="text-[#1565C0] hover:underline">support@hacomholdings.com.vn</a></p>
      </div>
    </Section>
  </div>
);

/* ─── page shell ─── */

export const TermsPage: React.FC = () => {
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
