import React from "react";
import { ArrowLeftIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../router/paths";
import { toast } from "react-hot-toast";

const ReportIssuePage: React.FC = () => {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success("Cảm ơn bạn! Báo cáo của bạn đã được gửi tới đội ngũ IT.");
      (e.target as HTMLFormElement).reset();
    }, 1500);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background/50 animate-content-fade">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        
        <Link to={ROUTE_PATHS.HELP} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeftIcon className="h-4 w-4" />
          Quay lại hỗ trợ
        </Link>

        <h1 className="mb-4 text-3xl font-bold text-text-primary">Báo cáo sự cố hệ thống</h1>
        <p className="mb-8 text-text-secondary">
          Vui lòng mô tả chi tiết sự cố bạn đang gặp phải để chúng tôi có thể hỗ trợ xử lý nhanh nhất có thể.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="issue-title" className="text-sm font-bold text-text-primary">Tiêu đề sự cố</label>
            <input 
              id="issue-title"
              required
              type="text" 
              placeholder="Ví dụ: Không thể gửi ảnh, Lỗi hiển thị tin nhắn..."
              className="w-full rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="issue-desc" className="text-sm font-bold text-text-primary">Mô tả chi tiết</label>
            <textarea 
              id="issue-desc"
              required
              rows={6}
              placeholder="Vui lòng mô tả các bước dẫn đến lỗi hoặc hành vi bất thường mà bạn gặp phải..."
              className="w-full resize-none rounded-2xl border border-border/60 bg-surface px-5 py-4 text-sm text-text-primary focus:border-primary/60 focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-text-primary">Mức độ ưu tiên</label>
            <div className="flex gap-4">
              {["Thấp", "Trung bình", "Cao"].map((level) => (
                <label key={level} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface py-3 text-sm font-medium transition-all hover:bg-surface-hover has-[:checked]:border-primary/60 has-[:checked]:bg-primary/5 has-[:checked]:text-primary">
                  <input type="radio" name="priority" value={level} className="hidden" defaultChecked={level === "Trung bình"} />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
          >
            {isSubmitting ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <PaperAirplaneIcon className="h-5 w-5" />
            )}
            {isSubmitting ? "Đang gửi báo cáo..." : "Gửi báo cáo sự cố"}
          </button>
        </form>

      </div>
    </div>
  );
};

export default ReportIssuePage;
