import React, { useState } from "react";

type Lang = "vi" | "en";

const UPDATED_DATE_VI = "12/06/2026";
const UPDATED_DATE_EN = "June 12, 2026";

const ViContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-gray-200 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chính Sách Bảo Mật</h1>
          <p className="text-sm text-gray-500 mt-0.5">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        </div>
      </div>
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
        <p><span className="font-medium">Ngày có hiệu lực:</span> {UPDATED_DATE_VI}</p>
        <p><span className="font-medium">Công ty/Tổ chức:</span> CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS (HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY)</p>
        <p><span className="font-medium">Email liên hệ:</span> <a href="mailto:admin@hacomholdings.vn" className="text-blue-600 hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Website:</span> <a href="https://www.hacomholdings.vn/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.hacomholdings.vn/</a></p>
      </div>
    </div>

    <Section title="1. Giới thiệu">
      <p>CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS ("chúng tôi", "của chúng tôi") vận hành ứng dụng liên lạc nội bộ được thiết kế và sử dụng riêng trong phạm vi tổ chức.</p>
      <p className="mt-3">Chính sách Bảo mật này giải thích cách chúng tôi thu thập, sử dụng, lưu trữ, chia sẻ và bảo vệ thông tin khi bạn sử dụng ứng dụng.</p>
      <p className="mt-3">Khi sử dụng ứng dụng, bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý với các nội dung được quy định trong Chính sách Bảo mật này.</p>
    </Section>

    <Section title="2. Phạm vi sử dụng ứng dụng">
      <ul className="list-disc pl-5 space-y-2">
        <li>Ứng dụng này chỉ dành cho nhân viên, cộng tác viên, nhà thầu hoặc các cá nhân khác được CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS cho phép sử dụng.</li>
        <li>Ứng dụng không dành cho công chúng và không hỗ trợ đăng ký tài khoản tự do.</li>
        <li>Người dùng không thể tự tạo tài khoản trên ứng dụng. Tài khoản truy cập được tạo, cấp phát, quản lý, thay đổi hoặc vô hiệu hóa bởi các quản trị viên được ủy quyền của tổ chức.</li>
        <li>Ứng dụng được phân phối và sử dụng độc quyền cho các hoạt động nội bộ của HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY và không được thiết kế cho mục đích thương mại đại chúng hoặc người tiêu dùng bên ngoài.</li>
      </ul>
    </Section>

    <Section title="3. Thông tin chúng tôi thu thập">
      <p>Tùy thuộc vào cách bạn sử dụng ứng dụng, chúng tôi có thể thu thập các loại thông tin sau:</p>

      <SubSection title="3.1. Thông tin tài khoản và nhận dạng">
        <ul className="list-disc pl-5 space-y-1">
          <li>Mã nhân viên hoặc mã người dùng do tổ chức cấp</li>
          <li>Họ và tên</li>
          <li>Địa chỉ email công ty</li>
          <li>Thông tin phòng ban, chức vụ hoặc nhóm làm việc</li>
          <li>Các thông tin tài khoản khác được quản trị viên cung cấp nhằm phục vụ việc quản lý truy cập</li>
        </ul>
      </SubSection>

      <SubSection title="3.2. Nội dung liên lạc">
        <ul className="list-disc pl-5 space-y-1">
          <li>Tin nhắn được gửi thông qua ứng dụng</li>
          <li>Nội dung trò chuyện cá nhân hoặc nhóm</li>
          <li>Tệp đính kèm như tài liệu, hình ảnh, âm thanh, video hoặc các nội dung khác được chia sẻ trên ứng dụng</li>
          <li>Dữ liệu liên quan đến tin nhắn như thời gian gửi, trạng thái gửi thành công và trạng thái đã đọc</li>
        </ul>
      </SubSection>

      <SubSection title="3.3. Thông tin thiết bị và kỹ thuật">
        <ul className="list-disc pl-5 space-y-1">
          <li>Loại thiết bị và phiên bản hệ điều hành</li>
          <li>Phiên bản ứng dụng</li>
          <li>Địa chỉ IP</li>
          <li>Định danh thiết bị phục vụ mục đích bảo mật hoặc gửi thông báo</li>
          <li>Nhật ký lỗi, báo cáo sự cố và dữ liệu chẩn đoán</li>
          <li>Mã thông báo thiết bị (Push Notification Token)</li>
        </ul>
      </SubSection>

      <SubSection title="3.4. Thông tin sử dụng">
        <ul className="list-disc pl-5 space-y-1">
          <li>Thời gian đăng nhập và đăng xuất</li>
          <li>Các tính năng được sử dụng</li>
          <li>Hoạt động điều hướng và tương tác trong ứng dụng</li>
          <li>Dữ liệu hiệu suất và các sự kiện phát sinh lỗi</li>
        </ul>
      </SubSection>

      <SubSection title="3.5. Thông tin do quản trị viên cung cấp">
        <p>Tổ chức có thể cung cấp hoặc cập nhật thông tin tài khoản, quyền hạn, nhóm làm việc hoặc quyền truy cập của bạn nhằm phục vụ công tác quản trị và bảo mật hệ thống.</p>
      </SubSection>
    </Section>

    <Section title="4. Mục đích sử dụng thông tin">
      <p>Chúng tôi sử dụng thông tin thu thập được nhằm:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cung cấp dịch vụ liên lạc nội bộ</li>
        <li>Xác thực và phân quyền người dùng</li>
        <li>Quản lý tài khoản và quyền truy cập</li>
        <li>Gửi tin nhắn, thông báo và cảnh báo</li>
        <li>Hỗ trợ trao đổi nhóm và chia sẻ tệp</li>
        <li>Đảm bảo an ninh hệ thống và ngăn chặn truy cập trái phép</li>
        <li>Theo dõi hiệu suất, chẩn đoán và khắc phục sự cố</li>
        <li>Tuân thủ các yêu cầu pháp luật, quy định hoặc chính sách nội bộ</li>
        <li>Cải thiện tính ổn định, độ tin cậy và trải nghiệm sử dụng của ứng dụng</li>
      </ul>
    </Section>

    <Section title="5. Cơ sở pháp lý cho việc xử lý dữ liệu">
      <p>Trong phạm vi pháp luật hiện hành cho phép, chúng tôi xử lý thông tin cá nhân dựa trên một hoặc nhiều cơ sở sau:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Thực hiện các chức năng quản trị, vận hành hoặc quản lý lao động trong tổ chức</li>
        <li>Lợi ích hợp pháp trong việc vận hành và bảo mật hệ thống liên lạc nội bộ</li>
        <li>Tuân thủ nghĩa vụ pháp lý theo quy định của pháp luật</li>
        <li>Sự đồng ý của người dùng trong trường hợp pháp luật yêu cầu</li>
      </ul>
    </Section>

    <Section title="6. Chia sẻ thông tin">
      <p>Chúng tôi không bán thông tin cá nhân của người dùng.</p>
      <p className="mt-3">Thông tin chỉ có thể được chia sẻ trong các trường hợp sau:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Với quản trị viên hệ thống hoặc nhân sự được ủy quyền của công ty</li>
        <li>Với các nhà cung cấp dịch vụ hỗ trợ lưu trữ, hạ tầng máy chủ, nhắn tin, phân tích dữ liệu, báo cáo lỗi hoặc gửi thông báo</li>
        <li>Khi được yêu cầu bởi cơ quan nhà nước có thẩm quyền theo quy định pháp luật</li>
        <li>Để bảo vệ quyền lợi, tài sản hoặc sự an toàn của tổ chức, người dùng hoặc bên thứ ba</li>
        <li>Trong trường hợp sáp nhập, tái cấu trúc doanh nghiệp hoặc giao dịch tương tự theo quy định của pháp luật</li>
      </ul>
      <p className="mt-3">Các bên thứ ba xử lý dữ liệu thay mặt chúng tôi phải thực hiện các biện pháp bảo mật phù hợp và chỉ được sử dụng dữ liệu cho các mục đích được cho phép.</p>
    </Section>

    <Section title="7. Dịch vụ bên thứ ba">
      <p>Ứng dụng có thể sử dụng các dịch vụ hoặc bộ SDK của bên thứ ba như:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Dịch vụ lưu trữ đám mây</li>
        <li>Dịch vụ gửi thông báo đẩy (Push Notification)</li>
        <li>Công cụ báo cáo lỗi và phân tích hệ thống</li>
        <li>Hạ tầng nhắn tin hoặc lưu trữ dữ liệu</li>
      </ul>
      <p className="mt-3">Ứng dụng có thể sử dụng:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li><span className="font-medium">Firebase Cloud Messaging (FCM)</span> để gửi thông báo đẩy.</li>
        <li><span className="font-medium">Firebase Crashlytics</span> (nếu được kích hoạt) để thu thập thông tin chẩn đoán sự cố nhằm cải thiện độ ổn định của ứng dụng.</li>
      </ul>
      <p className="mt-3">Các dịch vụ này có thể xử lý định danh thiết bị hoặc thông tin kỹ thuật cần thiết để cung cấp chức năng của mình.</p>
      <p className="mt-3">Ứng dụng không sử dụng dịch vụ quảng cáo của bên thứ ba và không sử dụng dữ liệu phân tích cho mục đích tiếp thị hoặc quảng cáo.</p>
    </Section>

    <Section title="8. Thời gian lưu trữ dữ liệu">
      <p>Chúng tôi chỉ lưu trữ thông tin trong khoảng thời gian cần thiết để:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cung cấp dịch vụ liên lạc nội bộ</li>
        <li>Duy trì an ninh hệ thống và hồ sơ kiểm tra</li>
        <li>Tuân thủ các yêu cầu pháp lý, thuế, kiểm toán hoặc chính sách lưu trữ nội bộ</li>
        <li>Giải quyết tranh chấp và thực thi các quy định của tổ chức</li>
      </ul>
      <p className="mt-3">Khi thông tin không còn cần thiết, chúng tôi sẽ xóa hoặc ẩn danh dữ liệu theo quy trình lưu trữ và quy định pháp luật hiện hành.</p>
    </Section>

    <Section title="9. Bảo mật dữ liệu">
      <p>Chúng tôi áp dụng các biện pháp kỹ thuật và quản lý phù hợp nhằm bảo vệ thông tin, bao gồm:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Mã hóa dữ liệu trong quá trình truyền tải</li>
        <li>Kiểm soát truy cập và phân quyền theo vai trò</li>
        <li>Cơ chế xác thực bảo mật</li>
        <li>Ghi nhật ký và giám sát hệ thống</li>
        <li>Cập nhật bảo mật định kỳ</li>
        <li>Hạn chế quyền truy cập quản trị</li>
      </ul>
      <p className="mt-3">Tuy nhiên, không có hệ thống nào đảm bảo an toàn tuyệt đối. Vì vậy, chúng tôi không thể cam kết bảo mật tuyệt đối trong mọi trường hợp.</p>
    </Section>

    <Section title="10. Quyền của người dùng">
      <p>Theo quy định pháp luật hiện hành và chính sách nội bộ của tổ chức, người dùng có thể có quyền:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Truy cập thông tin cá nhân của mình</li>
        <li>Yêu cầu chỉnh sửa thông tin không chính xác</li>
        <li>Yêu cầu xóa dữ liệu trong một số trường hợp nhất định</li>
        <li>Phản đối hoặc hạn chế một số hoạt động xử lý dữ liệu</li>
        <li>Rút lại sự đồng ý khi việc xử lý dựa trên sự đồng ý</li>
        <li>Yêu cầu cung cấp thông tin về cách dữ liệu được sử dụng</li>
      </ul>
      <p className="mt-3">Do đây là ứng dụng nội bộ doanh nghiệp, một số yêu cầu có thể cần được thực hiện thông qua quản trị viên hệ thống, bộ phận CNTT, nhân sự hoặc bộ phận tuân thủ.</p>
    </Section>

    <Section title="11. Quản lý tài khoản">
      <p>Tài khoản người dùng được tạo, cập nhật, tạm khóa hoặc xóa bởi quản trị viên được ủy quyền của tổ chức.</p>
      <p className="mt-3">Khi quan hệ lao động, hợp đồng hoặc quyền được cấp phép sử dụng kết thúc, quyền truy cập ứng dụng của bạn có thể bị chấm dứt hoặc hạn chế.</p>
    </Section>

    <Section title="12. Quyền riêng tư của trẻ em">
      <p>Ứng dụng này được thiết kế cho mục đích sử dụng nội bộ của tổ chức và không hướng tới trẻ em.</p>
      <p className="mt-3">Chúng tôi không cố ý thu thập thông tin từ trẻ em.</p>
    </Section>

    <Section title="13. Chuyển dữ liệu quốc tế">
      <p>Trong trường hợp dữ liệu được xử lý hoặc lưu trữ tại quốc gia hoặc khu vực khác, chúng tôi sẽ áp dụng các biện pháp phù hợp nhằm bảo vệ dữ liệu theo quy định của pháp luật hiện hành.</p>
    </Section>

    <Section title="14. Thay đổi Chính sách Bảo mật">
      <p>Chúng tôi có thể cập nhật Chính sách Bảo mật này theo từng thời điểm.</p>
      <p className="mt-3">Khi có thay đổi, chúng tôi sẽ cập nhật "Ngày có hiệu lực" ở đầu văn bản và có thể thông báo cho người dùng thông qua ứng dụng, email hoặc các kênh liên lạc nội bộ khác nếu phù hợp.</p>
      <p className="mt-3">Việc tiếp tục sử dụng ứng dụng sau khi chính sách được cập nhật đồng nghĩa với việc bạn chấp nhận các nội dung sửa đổi.</p>
    </Section>

    <Section title="15. Thông tin liên hệ">
      <p>Nếu bạn có bất kỳ câu hỏi nào liên quan đến Chính sách Bảo mật hoặc việc xử lý dữ liệu cá nhân của mình, vui lòng liên hệ:</p>
      <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-gray-900">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS</p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="text-blue-600 hover:underline">admin@hacomholdings.vn</a></p>
        <p>Địa chỉ: Tầng 5, Tháp B, Tòa nhà CT2 (The Light), Đường Tố Hữu, Phường Đại Mỗ, Thành phố Hà Nội, Việt Nam</p>
        <p>Điện thoại: <a href="tel:+842466646333" className="text-blue-600 hover:underline">(+84) 24 6664 6333</a></p>
      </div>
    </Section>
  </div>
);

const EnContent: React.FC = () => (
  <div className="space-y-8">
    <div className="border-b border-gray-200 pb-6">
      <div className="flex items-center gap-3 mb-4">
        <img src="/logo.png" alt="HACOM" className="h-10 w-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-0.5">HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        </div>
      </div>
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
        <p><span className="font-medium">Effective Date:</span> {UPDATED_DATE_EN}</p>
        <p><span className="font-medium">Company / Organization:</span> CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS / HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        <p><span className="font-medium">Contact Email:</span> <a href="mailto:admin@hacomholdings.vn" className="text-blue-600 hover:underline">admin@hacomholdings.vn</a></p>
        <p><span className="font-medium">Website:</span> <a href="https://www.hacomholdings.vn/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://www.hacomholdings.vn/</a></p>
      </div>
    </div>

    <Section title="1. Introduction">
      <p>CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS ("we", "our", or "us") operates an internal mobile communication application designed exclusively for internal use within our organization.</p>
      <p className="mt-3">This Privacy Policy explains how we collect, use, disclose, store, and protect information when you use the application.</p>
      <p className="mt-3">By using the application, you acknowledge that you have read and understood this Privacy Policy.</p>
    </Section>

    <Section title="2. Scope of the Application">
      <ul className="list-disc pl-5 space-y-2">
        <li>This application is intended only for authorized employees, contractors, or other personnel approved by CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS / HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY.</li>
        <li>The application is not available to the general public.</li>
        <li>Users cannot create accounts by themselves through the application. Access accounts are created, assigned, managed, and disabled by the organization's administrators.</li>
      </ul>
    </Section>

    <Section title="3. Information We Collect">
      <p>Depending on how you use the application, we may collect the following types of information:</p>

      <SubSection title="3.1 Account and Identity Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Employee or user ID assigned by the organization</li>
          <li>Full name</li>
          <li>Company email address</li>
          <li>Department, role, or team information</li>
          <li>Other account details provided by the administrator for access control</li>
        </ul>
      </SubSection>

      <SubSection title="3.2 Communication Content">
        <ul className="list-disc pl-5 space-y-1">
          <li>Messages sent through the application</li>
          <li>Group or individual chat content</li>
          <li>Files, images, audio, video, or other attachments shared within the app</li>
          <li>Message metadata such as time sent, delivery status, and read status</li>
        </ul>
      </SubSection>

      <SubSection title="3.3 Device and Technical Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Device model and operating system version</li>
          <li>App version</li>
          <li>IP address</li>
          <li>Device identifiers used for security or notification delivery</li>
          <li>Crash reports, logs, and diagnostic data</li>
          <li>Push notification token or device token</li>
        </ul>
      </SubSection>

      <SubSection title="3.4 Usage Information">
        <ul className="list-disc pl-5 space-y-1">
          <li>Login time and logout time</li>
          <li>Feature usage</li>
          <li>Navigation and interaction within the app</li>
          <li>Error events and performance data</li>
        </ul>
      </SubSection>

      <SubSection title="3.5 Information Provided by Administrators">
        <p>The organization may provide or update your account information, permissions, groups, or access rights for administration and security purposes.</p>
      </SubSection>
    </Section>

    <Section title="4. How We Use the Information">
      <p>We use collected information for the following purposes:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>To provide internal communication services</li>
        <li>To authenticate and authorize users</li>
        <li>To manage accounts and access permissions</li>
        <li>To send messages, notifications, and alerts</li>
        <li>To enable group communication and file sharing</li>
        <li>To maintain service security and prevent unauthorized access</li>
        <li>To monitor performance, diagnose problems, and fix errors</li>
        <li>To comply with legal, regulatory, or internal organizational requirements</li>
        <li>To improve the stability, reliability, and usability of the application</li>
      </ul>
    </Section>

    <Section title="5. Legal Basis for Processing">
      <p>Where applicable, we process personal information based on one or more of the following grounds:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Performance of employment, administrative, or organizational functions</li>
        <li>Legitimate interests in operating and securing the internal communication system</li>
        <li>Compliance with legal obligations</li>
        <li>Consent, where required by applicable law</li>
      </ul>
    </Section>

    <Section title="6. How We Share Information">
      <p>We do not sell your personal information.</p>
      <p className="mt-3">We may share information only in the following cases:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>With authorized administrators and designated personnel of the Company</li>
        <li>With service providers that support hosting, storage, messaging, analytics, crash reporting, or notification delivery</li>
        <li>When required by law, regulation, court order, or lawful request from a competent authority</li>
        <li>To protect the rights, property, or safety of the organization, users, or others</li>
        <li>In connection with a corporate transaction, merger, restructuring, or similar event, subject to applicable law</li>
      </ul>
      <p className="mt-3">All third parties that process information on our behalf are expected to handle such information securely and only for the purposes we authorize.</p>
    </Section>

    <Section title="7. Third-Party Services">
      <p>The application may use third-party services or SDKs, such as:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Cloud hosting services</li>
        <li>Push notification services</li>
        <li>Crash reporting or analytics tools</li>
        <li>Messaging or storage infrastructure</li>
      </ul>
      <p className="mt-3">These services may process certain technical information according to their own privacy practices. We recommend reviewing the privacy policies of those providers as applicable.</p>
    </Section>

    <Section title="8. Data Retention">
      <p>We retain information only for as long as necessary to:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Provide the internal communication service</li>
        <li>Maintain security and audit records</li>
        <li>Comply with legal, regulatory, tax, or internal retention requirements</li>
        <li>Resolve disputes and enforce organizational policies</li>
      </ul>
      <p className="mt-3">When information is no longer needed, we will delete or anonymize it according to our retention practices and applicable law.</p>
    </Section>

    <Section title="9. Data Security">
      <p>We apply reasonable technical and organizational measures to protect information, which may include:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Encryption in transit</li>
        <li>Access control and role-based permissions</li>
        <li>Secure authentication</li>
        <li>Logging and monitoring</li>
        <li>Regular security updates</li>
        <li>Restricted administrative access</li>
      </ul>
      <p className="mt-3">However, no system is completely secure. We cannot guarantee absolute security.</p>
    </Section>

    <Section title="10. User Rights and Controls">
      <p>Subject to applicable law and organizational policy, users may have rights to:</p>
      <ul className="list-disc pl-5 space-y-1 mt-2">
        <li>Access their information</li>
        <li>Request correction of inaccurate information</li>
        <li>Request deletion in certain circumstances</li>
        <li>Object to or restrict certain processing</li>
        <li>Withdraw consent where processing is based on consent</li>
        <li>Request information about how their data is used</li>
      </ul>
      <p className="mt-3">Because this is an internal enterprise application, some requests may need to be handled through the organization's administrator, IT department, HR department, or compliance team.</p>
    </Section>

    <Section title="11. Account Management">
      <p>User accounts are created, updated, suspended, and deleted by the organization's administrators.</p>
      <p className="mt-3">If your employment, contract, or authorization ends, your access to the application may be terminated or limited.</p>
    </Section>

    <Section title="12. Children's Privacy">
      <p>This application is intended for internal organizational use only and is not directed to children.</p>
      <p className="mt-3">We do not knowingly collect information from children.</p>
    </Section>

    <Section title="13. International Data Transfers">
      <p>If information is processed or stored in another country or region, we will take appropriate steps to protect it in accordance with applicable law.</p>
    </Section>

    <Section title="14. Changes to This Privacy Policy">
      <p>We may update this Privacy Policy from time to time.</p>
      <p className="mt-3">When we make changes, we will revise the "Effective Date" above and may notify users through the application, email, or other internal communication channels if appropriate.</p>
      <p className="mt-3">Your continued use of the application after an update means you accept the revised Privacy Policy.</p>
    </Section>

    <Section title="15. Contact Us">
      <p>If you have any questions about this Privacy Policy or about your information, please contact:</p>
      <div className="mt-3 bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
        <p className="font-semibold text-gray-900">CÔNG TY CỔ PHẦN ĐẦU TƯ HACOM HOLDINGS / HACOM HOLDINGS INVESTMENT JOINT STOCK COMPANY</p>
        <p>Email: <a href="mailto:admin@hacomholdings.vn" className="text-blue-600 hover:underline">admin@hacomholdings.vn</a></p>
        <p>Address: 5th Floor, Tower B, CT2 Building (The Light), To Huu Street, Dai Mo Ward, Hanoi, Vietnam</p>
        <p>Phone: <a href="tel:+842466646333" className="text-blue-600 hover:underline">024 666 46333</a></p>
      </div>
    </Section>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-lg font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-100">{title}</h2>
    <div className="text-gray-700 text-sm leading-relaxed">{children}</div>
  </section>
);

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mt-4">
    <h3 className="text-sm font-semibold text-gray-800 mb-2">{title}</h3>
    <div className="text-gray-700">{children}</div>
  </div>
);

export const PrivacyPolicyPage: React.FC = () => {
  const [lang, setLang] = useState<Lang>("vi");

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-6 rounded-full bg-gradient-to-b from-[#D32F2F] to-[#C41E3A]" />
            <span className="font-semibold text-gray-900 text-sm">HACOM HOLDINGS</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setLang("vi")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                lang === "vi"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                lang === "en"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-10">
          {lang === "vi" ? <ViContent /> : <EnContent />}
        </div>

        <footer className="mt-6 text-center text-xs text-gray-400 pb-8">
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
