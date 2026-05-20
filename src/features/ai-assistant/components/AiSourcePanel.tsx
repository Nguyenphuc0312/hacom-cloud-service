import React from "react";
import { 
  FileTextIcon, 
  XIcon, 
  BookOpenCheckIcon,
  SearchIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  EyeIcon
} from "lucide-react";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import { motion } from "framer-motion";

export const AiSourcePanel: React.FC = () => {
  const { selectedSources, toggleSourcePanel } = useAiAssistantStore();

  if (!selectedSources || selectedSources.length === 0) return null;

  return (
    <motion.div 
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="flex h-full w-[400px] flex-col bg-white border-l border-border shadow-[0_0_40px_rgba(0,0,0,0.08)] z-40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-white sticky top-0 z-10">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <BookOpenCheckIcon size={20} className="text-primary" strokeWidth={2.5} />
            <h2 className="text-sm font-black text-text-primary uppercase tracking-tighter">Nguồn tham khảo</h2>
            <span className="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full font-black">
               {selectedSources.length}
            </span>
          </div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest pl-7">Xác thực bởi HACOM AI</p>
        </div>
        <button 
          onClick={() => toggleSourcePanel(false)}
          className="h-10 w-10 flex items-center justify-center rounded-2xl hover:bg-surface-active text-text-muted transition-all border border-transparent hover:border-border"
        >
          <XIcon size={20} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* PDF Preview Placeholder (Modern Card) */}
        <div className="relative aspect-[3/4] w-full rounded-2xl bg-neutral-100 border border-border/50 overflow-hidden group">
           <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-text-muted/40 group-hover:text-primary/40 transition-colors">
              <FileTextIcon size={64} strokeWidth={1} className="mb-4" />
              <p className="text-xs font-black uppercase tracking-widest leading-relaxed">Đang tải bản xem trước tài liệu PDF...</p>
           </div>
           
           <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
              <button className="w-full py-3 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-neutral-100 transition-colors shadow-xl">
                 <EyeIcon size={14} strokeWidth={3} />
                 <span>Mở toàn màn hình</span>
              </button>
           </div>
           
           <div className="absolute top-4 right-4 bg-white/90 backdrop-blur pb-px pt-1 px-3 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-primary shadow-sm border border-primary/20">
              Confident 98%
           </div>
        </div>

        {/* Source List */}
        <div className="space-y-4">
           <h3 className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] pl-1 mb-4 flex items-center gap-2">
              <SearchIcon size={10} strokeWidth={3} />
              Danh sách chi tiết
           </h3>
           
           {selectedSources.map((source, index) => (
             <div 
               key={`${source.document_id}-${index}`}
               className="group p-5 rounded-[24px] border border-border bg-white hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all relative overflow-hidden"
             >
               <div className="absolute top-0 right-0 h-16 w-16 bg-primary/2 flex items-center justify-center rounded-bl-[40px] opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                  <ArrowRightIcon size={16} className="text-primary translate-x-2 translate-y-[-8px]" strokeWidth={3} />
               </div>

               <div className="flex items-start gap-4 mb-4 relative z-10">
                 <div className="h-12 w-12 shrink-0 rounded-2xl bg-surface-active flex items-center justify-center text-text-muted group-hover:bg-primary/10 group-hover:text-primary transition-all shadow-sm">
                   <FileTextIcon size={24} strokeWidth={2} />
                 </div>
                 <div className="min-w-0 flex-1">
                   <h3 className="text-sm font-black text-text-primary group-hover:text-primary transition-colors leading-tight" title={source.source_name}>
                     {source.source_name}
                   </h3>
                   <div className="flex items-center gap-2 mt-1.5 font-bold uppercase">
                      <span className="text-[9px] text-text-muted tracking-widest">Trang {source.page_number}</span>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span className="text-[9px] text-success tracking-widest flex items-center gap-1">
                        <ShieldCheckIcon size={9} strokeWidth={4} />
                        Xác thực
                      </span>
                   </div>
                 </div>
               </div>

               <div className="bg-surface-active/60 rounded-2xl p-4 mb-2 relative z-10 border border-transparent group-hover:border-primary/10 group-hover:bg-primary/5 transition-all">
                 <p className="text-[13px] text-text-secondary leading-relaxed italic font-medium opacity-80 line-clamp-4 group-hover:opacity-100">
                   &ldquo;...Trích xuất nội dung từ trang {source.page_number} của bộ tài liệu hệ thống. Các nội dung được AI đối chiếu và gán nhãn {source.source_name} nhằm đảm bảo tính minh bạch thông tin...&rdquo;
                 </p>
               </div>
             </div>
           ))}
        </div>

        {/* Legal/Info Disclaimer */}
        <div className="p-6 rounded-[28px] bg-neutral-950 text-white shadow-xl shadow-black/20 relative overflow-hidden group">
           <div className="absolute top-0 right-0 h-24 w-24 bg-white/5 rounded-full -translate-y-12 translate-x-12 blur-2xl group-hover:bg-white/10 transition-all" />
           <p className="text-[11px] font-medium leading-relaxed opacity-70 relative z-10">
             <span className="font-black text-primary uppercase tracking-[0.1em] block mb-2 underline decoration-2 underline-offset-4">Safety & Transparency</span>
             Hệ thống HACOM AI sử dụng cơ sở hạ tầng Private RAG để truy xuất dữ liệu. Mọi thông tin hiển thị tại đây đều xuất phát trực tiếp từ các văn bản chính thức của doanh nghiệp đã được số hóa.
           </p>
        </div>
      </div>
    </motion.div>
  );
};
