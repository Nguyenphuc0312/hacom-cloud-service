import React, { useState } from "react";

type Lang = "vi" | "en";

const UPDATED_DATE_VI = "12/06/2026";
const UPDATED_DATE_EN = "June 12, 2026";

const ViContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Chính Sách Bảo Mật</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Ngày có hiệu lực:</span> {UPDATED_DATE_VI}</p>
        <p><span className="font-medium">Công ty/Tổ chức:</span> CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS (HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY)</p>
        <p><span className="font-medium">Email liên hệ:</span> <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Website:</span> <a href="https://www.hacomholdings.vn/" target="_blank" rel="noopener noreferrer" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">https://www.hacomholdings.vn/</a></p>
      </div>
    </div>

    <Section title="1. Giới thiệu">
      <p>CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS ("chúng tôi", "của chúng tôi") vận hành <span className="font-medium">HACOM Chat</span> — ứng dụng liên lạc nội bộ được thiết kế và sử dụng riêng trong phạm vi tổ chức, không cung cấp cho công chúng.</p>
      <p className="mt-3">Chính sách Bảo mật này giải thích rõ ràng cách chúng tôi thu thập, sử dụng, lưu trữ, chia sẻ và bảo vệ thông tin khi bạn sử dụng ứng dụng. Chúng tôi cam kết minh bạch trong việc xử lý dữ liệu cá nhân của bạn.</p>
      <p className="mt-3">Khi sử dụng ứng dụng, bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý với các nội dung được quy định trong Chính sách Bảo mật này.</p>
    </Section>

    <Section title="2. Hacom ID — Tài khoản">
      <p>Mỗi tài khoản trong hệ thống HACOM Chat được gắn một <span className="font-semibold text-[#0f172a]">Hacom ID</span> duy nhất — là mã số định danh nội bộ do hệ thống tự cấp phát khi tài khoản được tạo.</p>
      <div className="mt-3 space-y-2">
        <p><span className="font-medium">Hacom ID dùng để:</span></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Xác định duy nhất người dùng trong toàn bộ hệ thống HACOM Chat</li>
          <li>Liên kết tin nhắn, tệp và lịch sử hoạt động với đúng tài khoản</li>
          <li>Hỗ trợ các tính năng tìm kiếm và kết nối giữa các nhân viên trong tổ chức</li>
          <li>Đảm bảo tính toàn vẹn dữ liệu khi tài khoản được cập nhật hoặc đổi thông tin</li>
        </ul>
      </div>
      <p className="mt-3">Hacom ID <span className="font-medium">không được chia sẻ ra bên ngoài tổ chức</span> và chỉ được sử dụng trong phạm vi hệ thống nội bộ HACOM Holdings.</p>
    </Section>

    <Section title="3. Phạm vi và đối tượng sử dụng">
      <ul className="list-disc pl-5 space-y-2">
        <li>Ứng dụng này chỉ dành cho nhân viên, cộng tác viên, nhà thầu hoặc các cá nhân khác được HACOM HOLDINGS cho phép sử dụng chính thức.</li>
        <li>Ứng dụng <span className="font-medium">không mở cho công chúng</span> và không hỗ trợ tự đăng ký tài khoản.</li>
        <li>Tài khoản truy cập được tạo, cấp phát, quản lý và vô hiệu hóa bởi quản trị viên được ủy quyền của tổ chức.</li>
        <li>Ứng dụng được phân phối và sử dụng độc quyền cho các hoạt động nội bộ của HACOM HOLDINGS và không được thiết kế cho mục đích thương mại đại chúng.</li>
      </ul>
    </Section>

    <Section title="4. Thông tin chúng tôi thu thập">
      <p>Tùy thuộc vào cách bạn sử dụng ứng dụng, chúng tôi có thể thu thập các loại thông tin sau:</p>

      <SubSection title="4.1. Thông tin tài khoản và nhận dạng">
        <ul className="list-disc pl-5 space-y-1">
          <li>Hacom ID (mã định danh nội bộ duy nhất)</li>
          <li>Mã nhân viên hoặc mã người dùng do tổ chức cấp</li>
          <li>Họ và tên</li>
          <li>Địa chỉ email công ty</li>
          <li>Thông tin phòng ban, chức vụ hoặc nhóm làm việc</li>
          <li>Ảnh đại diện (nếu được thiết lập)</li>
          <li>Các thông tin tài khoản khác được quản trị viên cung cấp nhằm phục vụ quản lý truy cập</li>
        </ul>
      </SubSection>

      <SubSection title="4.2. Nội dung liên lạc">
        <ul className="list-disc pl-5 space-y-1">
          <li>Tin nhắn văn bản được gửi thông qua ứng dụng</li>
          <li>Nội dung trò chuyện cá nhân (1-1) hoặc nhóm</li>
          <li>Tệp đính kèm như tài liệu, hình ảnh, âm thanh, video hoặc các nội dung khác được chia sẻ</li>
          <li>Dữ liệu liên quan đến tin nhắn: thời gian gửi, trạng thái giao nhận và đã đọc</li>
          <li>Biểu cảm (emoji reactions) trên tin nhắn</li>
        </ul>
      </SubSection>

      <SubSection title="4.3. Thông tin thiết bị và kỹ thuật">
        <ul className="list-disc pl-5 space-y-1">
          <li>Loại thiết bị và phiên bản hệ điều hành</li>
          <li>Phiên bản ứng dụng đang sử dụng</li>
          <li>Địa chỉ IP</li>
          <li>Định danh thiết bị phục vụ mục đích bảo mật hoặc gửi thông báo đẩy</li>
          <li>Nhật ký lỗi, báo cáo sự cố và dữ liệu chẩn đoán</li>
          <li>Mã thông báo thiết bị (Push Notification Token)</li>
        </ul>
      </SubSection>

      <SubSection title="4.4. Thông tin hoạt động sử dụng">
        <ul className="list-disc pl-5 space-y-1">
          <li>Thời gian đăng nhập và đăng xuất</li>
          <li>Trạng thái hoạt động (online, offline, đang bận)</li>
          <li>Các tính năng đã được sử dụng</li>
          <li>Hoạt động điều hướng và tương tác trong ứng dụng</li>
          <li>Dữ liệu hiệu suất và các sự kiện phát sinh lỗi</li>
        </ul>
      </SubSection>

      <SubSection title="4.5. Thông tin do quản trị viên cung cấp">
        <p>Tổ chức có thể cung cấp hoặc cập nhật thông tin tài khoản, quyền hạn, nhóm làm việc hoặc quyền truy cập của bạn nhằm phục vụ công tác quản trị và bảo mật hệ thống.</p>
      </SubSection>
    </Section>

    <Section title="5. Thông tin chúng tôi KHÔNG thu thập">
      <p>Để rõ ràng, HACOM Chat <span className="font-semibold">không thu thập và không xử lý</span> các loại dữ liệu nhạy cảm sau:</p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>
          <span className="font-medium">Thông tin tài chính:</span> số tài khoản ngân hàng, thẻ tín dụng/ghi nợ, thông tin thanh toán, lịch sử giao dịch tài chính. HACOM Chat không cung cấp bất kỳ dịch vụ tài chính, thanh toán hay ví điện tử nào.
        </li>
        <li>
          <span className="font-medium">Thông tin sức khỏe và y tế:</span> hồ sơ bệnh án, chẩn đoán, đơn thuốc, thông tin bảo hiểm y tế hoặc bất kỳ dữ liệu y tế nào. HACOM Chat không cung cấp dịch vụ y tế hay chăm sóc sức khỏe.
        </li>
        <li>
          <span className="font-medium">Danh bạ cá nhân:</span> chúng tôi không truy cập danh bạ điện thoại cá nhân của thiết bị.
        </li>
        <li>
          <span className="font-medium">Thông tin sinh trắc học:</span> vân tay, nhận diện khuôn mặt hoặc giọng nói phục vụ nhận dạng danh tính.
        </li>
        <li>
          <span className="font-medium">Thông tin nhân khẩu học nhạy cảm:</span> quan điểm chính trị, tôn giáo, tín ngưỡng, đời sống tình dục hoặc xu hướng tính dục.
        </li>
      </ul>
    </Section>

    <Section title="6. Mục đích sử dụng thông tin">
      <p>Chúng tôi sử dụng thông tin thu thập được nhằm:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cung cấp dịch vụ liên lạc nội bộ và đảm bảo ứng dụng hoạt động ổn định</li>
        <li>Xác thực danh tính và phân quyền người dùng</li>
        <li>Quản lý tài khoản, nhóm và quyền truy cập</li>
        <li>Gửi tin nhắn, thông báo hệ thống và cảnh báo</li>
        <li>Hỗ trợ trao đổi nhóm và chia sẻ tệp nội bộ</li>
        <li>Đảm bảo an ninh hệ thống và ngăn chặn truy cập trái phép</li>
        <li>Theo dõi hiệu suất, chẩn đoán và khắc phục sự cố kỹ thuật</li>
        <li>Tuân thủ các yêu cầu pháp luật, quy định hoặc chính sách nội bộ</li>
        <li>Cải thiện tính ổn định, độ tin cậy và trải nghiệm sử dụng của ứng dụng</li>
      </ul>
      <p className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3.5 text-sm text-[#854d0e]">
        <span className="font-medium">Lưu ý:</span> Chúng tôi không sử dụng thông tin người dùng cho mục đích quảng cáo, tiếp thị thương mại hoặc bán cho bên thứ ba.
      </p>
    </Section>

    <Section title="7. Cơ sở pháp lý cho việc xử lý dữ liệu">
      <p>Trong phạm vi pháp luật hiện hành cho phép, chúng tôi xử lý thông tin cá nhân dựa trên một hoặc nhiều cơ sở sau:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Thực hiện các chức năng quản trị, vận hành hoặc quản lý lao động trong tổ chức</li>
        <li>Lợi ích hợp pháp trong việc vận hành và bảo mật hệ thống liên lạc nội bộ</li>
        <li>Tuân thủ nghĩa vụ pháp lý theo quy định của pháp luật Việt Nam</li>
        <li>Sự đồng ý của người dùng trong trường hợp pháp luật yêu cầu</li>
      </ul>
    </Section>

    <Section title="8. Chia sẻ thông tin">
      <p>Chúng tôi <span className="font-semibold">không bán</span> thông tin cá nhân của người dùng.</p>
      <p className="mt-3">Thông tin chỉ có thể được chia sẻ trong các trường hợp giới hạn sau:</p>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li>
          <span className="font-medium">Quản trị viên nội bộ:</span> với quản trị viên hệ thống hoặc nhân sự được ủy quyền của công ty, trong phạm vi công việc.
        </li>
        <li>
          <span className="font-medium">Nhà cung cấp dịch vụ kỹ thuật:</span> với các đơn vị hỗ trợ lưu trữ, hạ tầng máy chủ, gửi thông báo, phân tích dữ liệu kỹ thuật hoặc báo cáo lỗi — những đơn vị này chỉ được phép xử lý dữ liệu đúng mục đích được giao.
        </li>
        <li>
          <span className="font-medium">Cơ quan nhà nước có thẩm quyền:</span> khi được yêu cầu theo quy định pháp luật, lệnh tòa án hoặc quy trình pháp lý hợp lệ.
        </li>
        <li>
          <span className="font-medium">Bảo vệ quyền lợi hợp pháp:</span> để bảo vệ quyền lợi, tài sản hoặc sự an toàn của tổ chức, người dùng hoặc bên thứ ba.
        </li>
        <li>
          <span className="font-medium">Tái cơ cấu doanh nghiệp:</span> trong trường hợp sáp nhập, tái cấu trúc hoặc giao dịch doanh nghiệp theo quy định pháp luật.
        </li>
      </ul>
      <p className="mt-3">Các bên thứ ba xử lý dữ liệu thay mặt chúng tôi phải thực hiện các biện pháp bảo mật phù hợp và chỉ được sử dụng dữ liệu cho các mục đích được ủy quyền.</p>
    </Section>

    <Section title="9. Dịch vụ bên thứ ba">
      <p>Ứng dụng có thể sử dụng các dịch vụ kỹ thuật của bên thứ ba phục vụ mục đích vận hành, bao gồm:</p>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li>
          <span className="font-medium">Dịch vụ lưu trữ đám mây:</span> lưu tệp đính kèm, hình ảnh, video được chia sẻ trong ứng dụng.
        </li>
        <li>
          <span className="font-medium">Firebase Cloud Messaging (FCM):</span> gửi thông báo đẩy đến thiết bị người dùng.
        </li>
        <li>
          <span className="font-medium">Công cụ báo cáo lỗi và chẩn đoán:</span> thu thập thông tin kỹ thuật về sự cố để cải thiện độ ổn định ứng dụng (nếu được kích hoạt).
        </li>
        <li>
          <span className="font-medium">Hạ tầng nhắn tin và lưu trữ dữ liệu:</span> cơ sở hạ tầng đảm bảo tin nhắn được truyền tải và lưu trữ an toàn.
        </li>
      </ul>
      <p className="mt-3">Các dịch vụ này có thể xử lý định danh thiết bị hoặc thông tin kỹ thuật cần thiết để thực hiện chức năng của mình theo chính sách bảo mật riêng của họ.</p>
      <p className="mt-4 rounded-xl border border-[#d7dce3] bg-[#eef2f7]/70 p-3.5 text-sm text-[#475569]">
        Ứng dụng <span className="font-medium">không sử dụng dịch vụ quảng cáo</span> của bên thứ ba và không sử dụng dữ liệu người dùng cho mục đích tiếp thị hay quảng cáo thương mại.
      </p>
    </Section>

    <Section title="10. Thời gian lưu trữ dữ liệu">
      <p>Chúng tôi chỉ lưu trữ thông tin trong khoảng thời gian cần thiết để:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cung cấp dịch vụ liên lạc nội bộ liên tục và ổn định</li>
        <li>Duy trì an ninh hệ thống và hồ sơ kiểm tra (audit logs)</li>
        <li>Tuân thủ các yêu cầu pháp lý, thuế, kiểm toán hoặc chính sách lưu trữ nội bộ</li>
        <li>Giải quyết tranh chấp và thực thi các quy định của tổ chức</li>
      </ul>
      <p className="mt-3">Khi tài khoản bị vô hiệu hóa hoặc quan hệ lao động/hợp đồng kết thúc, dữ liệu sẽ được xử lý theo chính sách lưu trữ nội bộ và quy định pháp luật hiện hành.</p>
      <p className="mt-3">Khi thông tin không còn cần thiết, chúng tôi sẽ xóa hoặc ẩn danh hóa dữ liệu theo quy trình đã được phê duyệt.</p>
    </Section>

    <Section title="11. Bảo mật dữ liệu">
      <p>Chúng tôi áp dụng các biện pháp kỹ thuật và quản lý phù hợp nhằm bảo vệ thông tin, bao gồm:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Mã hóa dữ liệu trong quá trình truyền tải (TLS/HTTPS)</li>
        <li>Kiểm soát truy cập và phân quyền theo vai trò (RBAC)</li>
        <li>Cơ chế xác thực bảo mật (JWT, refresh token)</li>
        <li>Ghi nhật ký và giám sát hệ thống</li>
        <li>Cập nhật và vá lỗi bảo mật định kỳ</li>
        <li>Hạn chế quyền truy cập quản trị theo nguyên tắc tối thiểu đặc quyền</li>
      </ul>
      <p className="mt-3">Tuy nhiên, không có hệ thống nào đảm bảo an toàn tuyệt đối. Chúng tôi không thể cam kết bảo mật tuyệt đối trong mọi trường hợp và khuyến khích người dùng bảo vệ thông tin đăng nhập của mình.</p>
    </Section>

    <Section title="12. Quyền của người dùng">
      <p>Theo quy định pháp luật hiện hành và chính sách nội bộ của tổ chức, người dùng có thể có quyền:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Truy cập và xem thông tin cá nhân của mình</li>
        <li>Yêu cầu chỉnh sửa thông tin không chính xác hoặc lỗi thời</li>
        <li>Yêu cầu xóa dữ liệu trong một số trường hợp nhất định (theo quy định pháp luật)</li>
        <li>Phản đối hoặc hạn chế một số hoạt động xử lý dữ liệu</li>
        <li>Rút lại sự đồng ý trong trường hợp pháp luật yêu cầu sự đồng ý</li>
        <li>Yêu cầu thông tin về cách dữ liệu của mình được sử dụng</li>
      </ul>
      <p className="mt-3">Do đây là ứng dụng nội bộ doanh nghiệp, một số yêu cầu cần được thực hiện thông qua quản trị viên hệ thống, bộ phận Công nghệ thông tin, Nhân sự hoặc bộ phận Tuân thủ của tổ chức.</p>
    </Section>

    <Section title="13. Quản lý tài khoản">
      <p className="mb-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5 text-sm text-[#334155]">
        Tài khoản được tạo và quản lý bởi tổ chức. Người dùng không thể tự đăng ký. Nếu cần gỡ bỏ một tài khoản, quản trị viên của tổ chức có thể xóa vĩnh viễn tài khoản đó khỏi hệ thống.
      </p>
      <p>Tài khoản Hacom ID được cấp phát và quản lý bởi doanh nghiệp. Khi nhân sự nghỉ việc hoặc theo yêu cầu của doanh nghiệp, quản trị viên hệ thống sẽ vô hiệu hóa hoặc xóa tài khoản theo quy trình nội bộ.</p>
      <p className="mt-3">Tài khoản người dùng được tạo, cập nhật, tạm khóa hoặc xóa bởi quản trị viên được ủy quyền của tổ chức.</p>
      <p className="mt-3">Khi quan hệ lao động, hợp đồng hoặc quyền được cấp phép sử dụng kết thúc, quyền truy cập ứng dụng của bạn sẽ bị chấm dứt hoặc hạn chế theo chính sách nội bộ.</p>
      <p className="mt-3">Người dùng <span className="font-medium">không thể tự xóa tài khoản</span> — việc này phải được thực hiện thông qua quản trị viên hệ thống.</p>
    </Section>

    <Section title="14. Quyền riêng tư của trẻ em">
      <p>Ứng dụng này được thiết kế cho mục đích sử dụng nội bộ của tổ chức, chỉ dành cho người lao động và cộng tác viên đã trưởng thành theo quy định pháp luật.</p>
      <p className="mt-3">Chúng tôi không cố ý thu thập thông tin từ trẻ em dưới 18 tuổi. Nếu phát hiện trường hợp này, chúng tôi sẽ xóa thông tin ngay khi biết được.</p>
    </Section>

    <Section title="15. Chuyển dữ liệu quốc tế">
      <p>Trong trường hợp dữ liệu cần được xử lý hoặc lưu trữ tại máy chủ đặt tại quốc gia hoặc khu vực khác (ví dụ: dịch vụ đám mây quốc tế), chúng tôi sẽ áp dụng các biện pháp bảo vệ dữ liệu phù hợp theo quy định pháp luật Việt Nam và quốc tế có liên quan.</p>
    </Section>

    <Section title="16. Thay đổi Chính sách Bảo mật">
      <p>Chúng tôi có thể cập nhật Chính sách Bảo mật này theo từng thời điểm nhằm phản ánh thay đổi về dịch vụ, quy định pháp luật hoặc thực tiễn vận hành.</p>
      <p className="mt-3">Khi có thay đổi đáng kể, chúng tôi sẽ:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cập nhật "Ngày có hiệu lực" ở đầu văn bản</li>
        <li>Thông báo cho người dùng thông qua ứng dụng, email hoặc các kênh liên lạc nội bộ khác nếu phù hợp</li>
      </ul>
      <p className="mt-3">Việc tiếp tục sử dụng ứng dụng sau khi chính sách được cập nhật đồng nghĩa với việc bạn chấp nhận các nội dung sửa đổi.</p>
    </Section>

    <Section title="17. Thông tin liên hệ">
      <p>Nếu bạn có bất kỳ câu hỏi, thắc mắc hoặc yêu cầu nào liên quan đến Chính sách Bảo mật hoặc việc xử lý dữ liệu cá nhân của mình, vui lòng liên hệ:</p>
      <div className="mt-4 space-y-1.5 rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4 text-sm">
        <p className="font-semibold text-[#0f172a]">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">admin@hacomholdings.vn</a></p>
        <p>Địa chỉ: Tầng 5, Tháp B, Tòa nhà CT2 (The Light), Đường Tố Hữu, Phường Đại Mỗ, Thành phố Hà Nội, Việt Nam</p>
        <p>Điện thoại: <a href="tel:+842466646333" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">(+84) 24 6664 6333</a></p>
      </div>
      <p className="mt-3 text-sm text-[#64748b]">Đối với các yêu cầu liên quan đến tài khoản hoặc dữ liệu nội bộ, bạn cũng có thể liên hệ trực tiếp với quản trị viên hệ thống hoặc bộ phận Công nghệ thông tin của công ty.</p>
    </Section>
  </div>
);

const EnContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-[#e5e7eb] pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Privacy Policy</h1>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-[#64748b]">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        </div>
      </div>
      <div className="space-y-1.5 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-4 text-sm text-[#334155]">
        <p><span className="font-medium">Effective Date:</span> {UPDATED_DATE_EN}</p>
        <p><span className="font-medium">Company / Organization:</span> HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY (CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS)</p>
        <p><span className="font-medium">Contact Email:</span> <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Website:</span> <a href="https://www.hacomholdings.vn/" target="_blank" rel="noopener noreferrer" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">https://www.hacomholdings.vn/</a></p>
      </div>
    </div>

    <Section title="1. Introduction">
      <p>HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY ("we", "our", or "us") operates <span className="font-medium">HACOM Chat</span> — an internal communication application designed and used exclusively within our organization, not available to the general public.</p>
      <p className="mt-3">This Privacy Policy clearly explains how we collect, use, store, share, and protect information when you use the application. We are committed to transparency in how we handle your personal data.</p>
      <p className="mt-3">By using the application, you acknowledge that you have read, understood, and agreed to this Privacy Policy.</p>
    </Section>

    <Section title="2. Hacom ID — User Identifier">
      <p>Every account in HACOM Chat is assigned a unique <span className="font-semibold text-[#0f172a]">Hacom ID</span> — an internal identifier automatically generated by the system when an account is created.</p>
      <div className="mt-3 space-y-2">
        <p><span className="font-medium">Hacom ID is used to:</span></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Uniquely identify each user across the entire HACOM Chat system</li>
          <li>Link messages, files, and activity history to the correct account</li>
          <li>Support search and connection features between employees within the organization</li>
          <li>Maintain data integrity when accounts are updated or user information changes</li>
        </ul>
      </div>
      <p className="mt-3">Hacom ID is <span className="font-medium">not shared outside the organization</span> and is only used within HACOM Holdings' internal systems.</p>
    </Section>

    <Section title="3. Scope and Eligible Users">
      <ul className="list-disc pl-5 space-y-2">
        <li>This application is intended only for authorized employees, contractors, or other personnel officially approved by HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY.</li>
        <li>The application is <span className="font-medium">not open to the general public</span> and does not support self-registration.</li>
        <li>User accounts are created, assigned, managed, and disabled by the organization's authorized administrators.</li>
        <li>The application is distributed and used exclusively for internal activities of HACOM HOLDINGS and is not designed for mass commercial or consumer use.</li>
      </ul>
    </Section>

    <Section title="4. Information We Collect">
      <p>Depending on how you use the application, we may collect the following types of information:</p>

      <SubSection title="4.1 Account and Identity Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Hacom ID (unique internal identifier)</li>
          <li>Employee or user ID assigned by the organization</li>
          <li>Full name</li>
          <li>Company email address</li>
          <li>Department, role, or team information</li>
          <li>Profile picture (if set)</li>
          <li>Other account details provided by administrators for access management</li>
        </ul>
      </SubSection>

      <SubSection title="4.2 Communication Content">
        <ul className="list-disc pl-5 space-y-1">
          <li>Text messages sent through the application</li>
          <li>Individual (1-on-1) or group chat content</li>
          <li>Files, images, audio, video, or other attachments shared in the app</li>
          <li>Message metadata: time sent, delivery status, and read status</li>
          <li>Emoji reactions on messages</li>
        </ul>
      </SubSection>

      <SubSection title="4.3 Device and Technical Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Device model and operating system version</li>
          <li>Application version in use</li>
          <li>IP address</li>
          <li>Device identifiers used for security or push notification delivery</li>
          <li>Crash logs, error reports, and diagnostic data</li>
          <li>Push notification token or device token</li>
        </ul>
      </SubSection>

      <SubSection title="4.4 Usage and Activity Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Login and logout times</li>
          <li>Activity status (online, offline, busy)</li>
          <li>Features used within the application</li>
          <li>Navigation and interaction within the app</li>
          <li>Performance data and error events</li>
        </ul>
      </SubSection>

      <SubSection title="4.5 Information Provided by Administrators">
        <p>The organization may provide or update your account information, permissions, groups, or access rights for administration and security purposes.</p>
      </SubSection>
    </Section>

    <Section title="5. Information We Do NOT Collect">
      <p>To be clear, HACOM Chat does <span className="font-semibold">not collect or process</span> the following sensitive categories of data:</p>
      <ul className="list-disc pl-5 space-y-2 mt-3">
        <li>
          <span className="font-medium">Financial information:</span> bank account numbers, credit/debit card details, payment information, or financial transaction history. HACOM Chat does not provide any financial services, payment processing, or digital wallet features.
        </li>
        <li>
          <span className="font-medium">Health and medical information:</span> medical records, diagnoses, prescriptions, health insurance information, or any medical data. HACOM Chat does not provide healthcare or medical services.
        </li>
        <li>
          <span className="font-medium">Real-time GPS location:</span> we do not track users' physical locations in real time.
        </li>
        <li>
          <span className="font-medium">Personal device contacts:</span> we do not access the personal contact list on your device.
        </li>
        <li>
          <span className="font-medium">Biometric data:</span> fingerprints, facial recognition, or voice data for identity verification purposes.
        </li>
        <li>
          <span className="font-medium">Sensitive demographic data:</span> political opinions, religion, beliefs, sexual life, or sexual orientation.
        </li>
      </ul>
    </Section>

    <Section title="6. How We Use the Information">
      <p>We use collected information for the following purposes:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>To provide internal communication services and ensure stable app operation</li>
        <li>To authenticate and authorize users</li>
        <li>To manage accounts, groups, and access permissions</li>
        <li>To send messages, system notifications, and alerts</li>
        <li>To enable group communication and internal file sharing</li>
        <li>To maintain system security and prevent unauthorized access</li>
        <li>To monitor performance, diagnose problems, and fix technical issues</li>
        <li>To comply with legal, regulatory, or internal organizational requirements</li>
        <li>To improve the stability, reliability, and usability of the application</li>
      </ul>
      <p className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/70 p-3.5 text-sm text-[#854d0e]">
        <span className="font-medium">Note:</span> We do not use user information for advertising, commercial marketing, or sale to third parties.
      </p>
    </Section>

    <Section title="7. Legal Basis for Processing">
      <p>Where applicable, we process personal information based on one or more of the following grounds:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Performance of employment, administrative, or organizational management functions</li>
        <li>Legitimate interests in operating and securing the internal communication system</li>
        <li>Compliance with legal obligations under Vietnamese law and applicable regulations</li>
        <li>Consent, where required by applicable law</li>
      </ul>
    </Section>

    <Section title="8. How We Share Information">
      <p>We do <span className="font-semibold">not sell</span> your personal information.</p>
      <p className="mt-3">We may share information only in the following limited cases:</p>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li>
          <span className="font-medium">Internal administrators:</span> with authorized system administrators and designated personnel of the Company, within the scope of their responsibilities.
        </li>
        <li>
          <span className="font-medium">Technical service providers:</span> with vendors supporting hosting, storage, notifications, technical analytics, or crash reporting — these vendors are only permitted to process data for the authorized purpose.
        </li>
        <li>
          <span className="font-medium">Competent authorities:</span> when required by law, court order, or lawful request from a competent government authority.
        </li>
        <li>
          <span className="font-medium">Protecting legitimate interests:</span> to protect the rights, property, or safety of the organization, users, or others.
        </li>
        <li>
          <span className="font-medium">Corporate restructuring:</span> in connection with a merger, restructuring, or similar corporate transaction, subject to applicable law.
        </li>
      </ul>
      <p className="mt-3">All third parties that process information on our behalf are expected to handle such information securely and only for the purposes we authorize.</p>
    </Section>

    <Section title="9. Third-Party Services">
      <p>The application may use third-party technical services for operational purposes, including:</p>
      <ul className="list-disc pl-5 space-y-2 mt-2">
        <li>
          <span className="font-medium">Cloud storage services:</span> to store file attachments, images, and videos shared within the app.
        </li>
        <li>
          <span className="font-medium">Firebase Cloud Messaging (FCM):</span> to deliver push notifications to user devices.
        </li>
        <li>
          <span className="font-medium">Crash reporting and diagnostic tools:</span> to collect technical information about errors and improve app stability (if enabled).
        </li>
        <li>
          <span className="font-medium">Messaging and data storage infrastructure:</span> underlying infrastructure that ensures messages are securely transmitted and stored.
        </li>
      </ul>
      <p className="mt-3">These services may process certain technical information according to their own privacy practices.</p>
      <p className="mt-4 rounded-xl border border-[#d7dce3] bg-[#eef2f7]/70 p-3.5 text-sm text-[#475569]">
        The application does <span className="font-medium">not use third-party advertising services</span> and does not use user data for marketing or commercial advertising purposes.
      </p>
    </Section>

    <Section title="10. Data Retention">
      <p>We retain information only for as long as necessary to:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Provide continuous and stable internal communication services</li>
        <li>Maintain system security and audit records</li>
        <li>Comply with legal, regulatory, tax, or internal retention requirements</li>
        <li>Resolve disputes and enforce organizational policies</li>
      </ul>
      <p className="mt-3">When an account is deactivated or the employment/contract relationship ends, data will be handled according to internal retention policies and applicable law.</p>
      <p className="mt-3">When information is no longer needed, we will delete or anonymize it according to approved procedures.</p>
    </Section>

    <Section title="11. Data Security">
      <p>We apply reasonable technical and organizational measures to protect information, including:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Encryption in transit (TLS/HTTPS)</li>
        <li>Role-based access control (RBAC)</li>
        <li>Secure authentication (JWT, refresh token)</li>
        <li>System logging and monitoring</li>
        <li>Regular security updates and patches</li>
        <li>Restricted administrative access based on least-privilege principles</li>
      </ul>
      <p className="mt-3">However, no system is completely secure. We cannot guarantee absolute security and encourage users to protect their login credentials.</p>
    </Section>

    <Section title="12. User Rights and Controls">
      <p>Subject to applicable law and organizational policy, users may have rights to:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Access and view their personal information</li>
        <li>Request correction of inaccurate or outdated information</li>
        <li>Request deletion in certain circumstances (as permitted by applicable law)</li>
        <li>Object to or restrict certain processing activities</li>
        <li>Withdraw consent where processing is based on consent</li>
        <li>Request information about how their data is used</li>
      </ul>
      <p className="mt-3">Because this is an internal enterprise application, some requests may need to be handled through the organization's system administrator, IT department, HR department, or compliance team.</p>
    </Section>

    <Section title="13. Account Management">
      <p className="mb-3 rounded-xl border border-[#1976D2]/15 bg-[#1976D2]/[0.05] p-3.5 text-sm text-[#334155]">
        Accounts are created and managed by the organization. Users cannot self-register. If an account needs to be removed, the organization's administrator can permanently delete it from the system.
      </p>
      <p>Hacom ID accounts are provisioned and managed by the enterprise. When an employee leaves the company or upon the enterprise's request, the system administrator will disable or delete the account in accordance with internal procedures.</p>
      <p className="mt-3">User accounts are created, updated, suspended, and deleted by the organization's authorized administrators.</p>
      <p className="mt-3">If your employment, contract, or authorization ends, your access to the application will be terminated or limited according to internal policy.</p>
      <p className="mt-3">Users <span className="font-medium">cannot self-delete their account</span> — this must be requested through the system administrator.</p>
    </Section>

    <Section title="14. Children's Privacy">
      <p>This application is designed for internal organizational use only, intended for adult employees and collaborators as defined by applicable law.</p>
      <p className="mt-3">We do not knowingly collect information from children under 18 years of age. If we become aware of such a case, we will delete the information promptly.</p>
    </Section>

    <Section title="15. International Data Transfers">
      <p>If data needs to be processed or stored on servers located in another country or region (e.g., international cloud services), we will take appropriate measures to protect the data in accordance with Vietnamese law and applicable international regulations.</p>
    </Section>

    <Section title="16. Changes to This Privacy Policy">
      <p>We may update this Privacy Policy from time to time to reflect changes in our services, applicable laws, or operational practices.</p>
      <p className="mt-3">When significant changes are made, we will:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Revise the "Effective Date" at the top of this document</li>
        <li>Notify users through the application, email, or other internal communication channels if appropriate</li>
      </ul>
      <p className="mt-3">Your continued use of the application after an update means you accept the revised Privacy Policy.</p>
    </Section>

    <Section title="17. Contact Us">
      <p>If you have any questions, concerns, or requests regarding this Privacy Policy or your personal data, please contact:</p>
      <div className="mt-4 space-y-1.5 rounded-xl border border-[#d7dce3] bg-[#f8fbff] p-4 text-sm">
        <p className="font-semibold text-[#0f172a]">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">admin@hacomholdings.vn</a></p>
        <p>Address: 5th Floor, Tower B, CT2 Building (The Light), To Huu Street, Dai Mo Ward, Hanoi, Vietnam</p>
        <p>Phone: <a href="tel:+842466646333" className="font-medium text-[#1565C0] hover:text-[#1976D2] hover:underline">024 666 46333</a></p>
      </div>
      <p className="mt-3 text-sm text-[#64748b]">For requests related to internal accounts or data, you may also contact your system administrator or the Company's IT department directly.</p>
    </Section>
  </div>
);

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

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-4">
    <h3 className="mb-2 text-sm font-semibold text-[#1e293b]">{title}</h3>
    <div className="text-[#334155]">{children}</div>
  </div>
);

export const PrivacyPolicyPage: React.FC = () => {
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
                lang === "vi"
                  ? "bg-[#1565C0] text-white shadow-sm"
                  : "text-[#64748b] hover:text-[#1e293b]"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              onClick={() => setLang("en")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                lang === "en"
                  ? "bg-[#1565C0] text-white shadow-sm"
                  : "text-[#64748b] hover:text-[#1e293b]"
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
