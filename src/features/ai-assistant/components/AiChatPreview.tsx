import React, { useEffect, useRef, useState } from "react";
import { 
  SparklesIcon, 
  CommandIcon, 
  AlertCircleIcon, 
  FileTextIcon, 
  ExternalLinkIcon, 
  CopyIcon,
  RotateCcwIcon,
  CheckIcon,
  ShieldCheckIcon,
  Loader2Icon,
  CpuIcon
} from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { motion, AnimatePresence } from "framer-motion";
import type { AiMessage, AiChatSource } from "../types";
import { useAiAssistantStore } from "../state/aiAssistantStore";
import "../styles/ai-animations.css";

interface AiChatPreviewProps {
  messages: AiMessage[];
  isLoading?: boolean;
}

const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mb-5 flex flex-col gap-4 rounded-3xl bg-neutral-50/50 p-6 border border-border/40 shadow-sm relative overflow-hidden group"
    >
      {/* Animated Gradient Border Layer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-primary/80">
          <div className="relative flex h-2 w-8 items-center justify-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-duration:1s]" />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-duration:1s] [animation-delay:0.2s]" />
            <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-duration:1s] [animation-delay:0.4s]" />
          </div>
          <span>Mental Processing</span>
        </div>
        <CpuIcon size={14} className="text-primary/40 animate-pulse" />
      </div>
      
      <p className="text-[13px] text-text-secondary leading-relaxed font-semibold italic opacity-70 border-l-2 border-primary/20 pl-4 py-1">
        {content || "Đang tìm kiếm thông tin và tổng hợp tri thức HACOM..."}
      </p>
    </motion.div>
  );
};

export const AiChatPreview: React.FC<AiChatPreviewProps> = ({
  messages,
  isLoading = false,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { setSelectedSources, toggleSourcePanel } = useAiAssistantStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSourceClick = (sources: AiChatSource[]) => {
    setSelectedSources(sources);
    toggleSourcePanel(true);
  };

  const handleCopy = (message: AiMessage) => {
    navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex w-full flex-col gap-14 py-10 overflow-x-hidden">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => (
          <motion.div 
            key={message.id}
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className={clsx(
              "flex flex-col gap-5 w-full",
              message.role === "user" ? "items-end" : "items-start"
            )}
          >
            {/* Avatar & Message Wrapper */}
            <div className={clsx(
              "flex gap-6 max-w-[94%] md:max-w-[85%]",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}>
              {/* Avatar Icon */}
              <div className={clsx(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] shadow-xl relative transition-transform hover:scale-105 active:scale-95",
                message.role === "assistant" 
                  ? (message.isError ? "bg-error text-white" : "bg-neutral-900 text-white shadow-black/10")
                  : "bg-white border border-border/60 text-text-primary shadow-sm"
              )}>
                {message.role === "assistant" ? (
                  message.isError ? (
                    <AlertCircleIcon size={24} />
                  ) : (
                    <motion.div
                      animate={{ rotate: message.isStreaming ? [0, 15, -15, 0] : 0 }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <SparklesIcon size={24} strokeWidth={2.5} />
                    </motion.div>
                  )
                ) : (
                  <CommandIcon size={24} strokeWidth={2.5} />
                )}
                
                {/* Active status for assistant */}
                {message.isStreaming && (
                   <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-primary ring-2 ring-white"></span>
                   </span>
                )}
              </div>

              {/* Content Column */}
              <div className={clsx(
                 "flex flex-col gap-4 min-w-0 group/content",
                 message.role === "user" ? "items-end" : "items-start"
              )}>
                {message.thinking && message.role === "assistant" && (
                  <ThinkingBlock content={message.thinking} />
                )}

                <div className={clsx(
                  "relative rounded-[32px] px-8 py-6 transition-all duration-300 overflow-hidden",
                  message.role === "user" 
                    ? "bg-primary text-white rounded-tr-sm shadow-2xl shadow-primary/10 border-b-2 border-primary-hover/30" 
                    : "bg-white border border-border/70 text-text-primary rounded-tl-sm hover:shadow-2xl hover:shadow-black/5 hover:-translate-y-0.5",
                  message.isStreaming && message.role === "assistant" && "ring-2 ring-primary/20 shadow-lg shadow-primary/5 shadow-inner"
                )}>
                  {message.isStreaming && message.role === "assistant" && !message.content && (
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent h-[200%] animate-scan pointer-events-none" />
                  )}
                  <div className={clsx(
                    "text-[15.5px] leading-[1.7] max-w-none prose prose-slate prose-ai",
                    message.role === "user" ? "text-white prose-invert font-semibold" : "text-text-primary font-medium",
                    message.role === "assistant" && "selection:bg-primary/20",
                    // Custom markdown style refinements
                    "[&_p]:m-0 [&_p+p]:mt-6",
                    "[&_ul]:my-6 [&_ul]:pl-6 [&_ol]:my-6 [&_ol]:pl-6",
                    "[&_li]:my-2",
                    "[&_pre]:my-6 [&_pre]:rounded-[24px] [&_pre]:bg-neutral-950 [&_pre]:p-6 [&_pre]:shadow-inner [&_pre]:border [&_pre]:border-white/5",
                    "[&_code]:rounded-lg [&_code]:bg-surface-active [&_code]:px-2 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.82em]",
                    "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-neutral-200",
                    "[&_strong]:font-black text-primary",
                    "[&_blockquote]:my-8 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:bg-neutral-50 [&_blockquote]:py-3 [&_blockquote]:rounded-r-2xl",
                    "[&_h1]:mb-8 [&_h1]:text-2xl [&_h1]:font-black [&_h1]:tracking-tight",
                    "[&_h2]:mb-6 [&_h2]:text-xl [&_h2]:font-black",
                    "[&_h3]:mb-4 [&_h3]:text-lg [&_h3]:font-black",
                    "[&_table]:my-8 [&_table]:rounded-[20px] [&_table]:overflow-hidden [&_table]:border-border/60 [&_table]:shadow-sm"
                  )}>
                    {message.role === "assistant" && message.isStreaming && !message.content && !message.thinking ? (
                      <div className="flex flex-col gap-3 py-1">
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1.5">
                            <motion.div animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ repeat: Infinity, duration: 1 }} className="h-2 w-2 rounded-full bg-primary" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="h-2 w-2 rounded-full bg-primary" />
                            <motion.div animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="h-2 w-2 rounded-full bg-primary" />
                          </div>
                          <span className="text-[14px] font-black text-primary uppercase tracking-[0.1em] animate-pulse">Đang tìm kiếm thông tin...</span>
                        </div>
                        <div className="h-1.5 w-full max-w-[200px] bg-surface-active rounded-full overflow-hidden relative border border-border/10">
                           <div className="absolute inset-0 bg-primary/20 animate-shimmer" />
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeSanitize]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    )}
                    {message.isStreaming && (
                      <motion.span 
                        animate={{ opacity: [1, 0] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-block w-2.5 h-6 ml-2 bg-primary rounded-full translate-y-1.5 shadow-[0_0_10px_rgba(var(--color-primary-rgb),0.5)]" 
                      />
                    )}
                  </div>

                  {/* Enhanced Actions Bar */}
                  {!message.isStreaming && (
                    <div className={clsx(
                      "mt-6 flex items-center gap-5 transition-all duration-300",
                      message.role === "user" ? "justify-end opacity-40 hover:opacity-100" : "opacity-0 group-hover/content:opacity-100"
                    )}>
                       <button 
                         onClick={() => handleCopy(message)}
                         className={clsx(
                           "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] transition-all hover:scale-110",
                           message.role === "user" ? "hover:text-white" : "hover:text-primary text-text-muted"
                         )}
                       >
                         {copiedId === message.id ? (
                           <CheckIcon size={12} strokeWidth={4} className="text-success" />
                         ) : (
                           <CopyIcon size={12} strokeWidth={3} />
                         )}
                         <span>{copiedId === message.id ? "Success" : "Copy Content"}</span>
                       </button>

                       {message.role === "assistant" && index === messages.length - 1 && !message.isStreaming && (
                          <button 
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-text-muted hover:text-primary transition-all hover:scale-110"
                            title="Tạo lại phản hồi"
                          >
                            <RotateCcwIcon size={12} strokeWidth={3} />
                            <span>Regenerate</span>
                          </button>
                       )}
                    </div>
                  )}
                </div>

                {/* Footnotes / Metadata Cluster */}
                <div className="flex flex-wrap items-center gap-4 px-3">
                  {message.role === "assistant" && !message.isError && !message.isStreaming && (
                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-success bg-success/5 px-3.5 py-1.5 rounded-full border border-success/15 shadow-sm">
                      <ShieldCheckIcon size={11} strokeWidth={3.5} />
                      <span>Certified Response</span>
                    </div>
                  )}
                  
                  {message.role === "assistant" && message.sources && message.sources.length > 0 && !message.isStreaming && (
                    <button 
                      onClick={() => handleSourceClick(message.sources!)}
                      className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-primary transition-all hover:bg-primary/15 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
                    >
                      <FileTextIcon size={11} strokeWidth={3.5} />
                      <span>Validated in {message.sources.length} Docs</span>
                      <ExternalLinkIcon size={9} strokeWidth={4} />
                    </button>
                  )}

                  <span className="text-[9px] font-bold text-text-muted/60 uppercase tracking-[0.2em] bg-neutral-50 px-2 py-1 rounded-md">
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Modernized Loading/Thinking State (Ghost) */}
      {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-6 animate-in fade-in duration-700"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-neutral-900 border border-neutral-800 shadow-[0_10px_30px_rgb(0,0,0,0.15)] relative">
            <Loader2Icon size={24} className="text-white animate-spin [animation-duration:1.5s]" strokeWidth={2.5} />
            <div className="absolute inset-0 rounded-[20px] ring-2 ring-primary/20 animate-pulse" />
          </div>
          
          <div className="flex flex-col gap-4 w-full max-w-[85%]">
             <div className="flex items-center gap-5 px-8 py-6 rounded-[32px] bg-white border border-border shadow-xl shadow-black/5 relative overflow-hidden group">
                <div className="flex gap-2">
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, times: [0, 0.5, 1] }}
                    className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.2, times: [0, 0.5, 1] }}
                    className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" 
                  />
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1, delay: 0.4, times: [0, 0.5, 1] }}
                    className="h-2.5 w-2.5 rounded-full bg-primary shadow-sm" 
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                   <span className="text-[12px] font-black text-primary uppercase tracking-[0.2em]">Đang tìm kiếm thông tin...</span>
                   <span className="text-[10px] font-bold text-text-muted opacity-60 uppercase tracking-widest">Accessing HACOM Knowledge Base...</span>
                </div>
                
                {/* Subtle scanning line animation */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent h-[200%] animate-scan pointer-events-none" />
             </div>
          </div>
        </motion.div>
      )}

      <div ref={bottomRef} className="h-10" aria-hidden="true" />
    </div>
  );
};
