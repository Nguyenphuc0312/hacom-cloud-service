import React from "react";
import { ChevronDownIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../router/paths";
import clsx from "clsx";

const faqs = [
  {
    question: "Làm cách nào để tìm kiếm tin nhắn cũ?",
    answer: "Bạn có thể sử dụng biểu tượng kính lúp ở góc trên bên phải thanh tiêu đề của cuộc trò chuyện để tìm kiếm theo từ khóa hoặc nội dung cụ thể."
  },
  {
    question: "Làm sao để tạo nhóm chat mới?",
    answer: "Nhấp vào biểu tượng dấu cộng (+) ở đầu danh sách cuộc trò chuyện, chọn 'Tạo nhóm mới' và mời các thành viên bạn muốn tham gia."
  },
  {
    question: "Làm cách nào để thay đổi thông tin cá nhân?",
    answer: "Truy cập vào mục 'Cài đặt' (biểu tượng bánh răng ở thanh điều hướng bên trái), tại đây bạn có thể cập nhật ảnh đại diện, tên hiển thị và mật khẩu."
  },
  {
    question: "Ứng dụng có hỗ trợ gửi tệp dung lượng lớn không?",
    answer: "Hacom Chat hỗ trợ gửi tệp lên đến 100MB. Đối với các tệp lớn hơn, chúng tôi khuyến khích bạn sử dụng liên kết chia sẻ từ Hacom Cloud."
  }
];

const FAQPage: React.FC = () => {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        
        <Link to={ROUTE_PATHS.HELP} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeftIcon className="h-4 w-4" />
          Quay lại hỗ trợ
        </Link>

        <h1 className="mb-8 text-3xl font-bold text-text-primary">Tài liệu hướng dẫn (FAQ)</h1>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-sm transition-all"
            >
              <button 
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="font-bold text-text-primary">{faq.question}</span>
                <ChevronDownIcon className={clsx("h-5 w-5 text-text-muted transition-transform duration-300", openIndex === index && "rotate-180")} />
              </button>
              
              <div className={clsx(
                "overflow-hidden transition-all duration-300 ease-in-out",
                openIndex === index ? "max-h-40 border-t border-border/40 opacity-100" : "max-h-0 opacity-0"
              )}>
                <div className="p-5 text-sm leading-relaxed text-text-secondary">
                  {faq.answer}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl bg-primary/5 p-8 text-center border border-primary/10">
          <p className="mb-4 text-text-secondary">Bạn vẫn chưa tìm thấy câu trả lời?</p>
          <a href="mailto:admin@hacomholdings.vn" className="font-bold text-primary hover:underline">
            Gửi câu hỏi cho chúng tôi →
          </a>
        </div>

      </div>
    </div>
  );
};

export default FAQPage;
