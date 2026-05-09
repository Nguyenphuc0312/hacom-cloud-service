import React from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface AuthLayoutSplitProps {
  children: React.ReactNode;
  imageSrc?: string;
  imageTitle?: string;
  imageSubtitle?: string;
}

const HACoM_IMAGES = [
  {
    src: "/hacom-imperial-dalat.jpg",
    title: "Hacom Imperial Dalat",
    subtitle: "Dự án nổi bật tại Đà Lạt - Kiến trúc tân cổ điển sang trọng giữa ngàn hoa",
  },
  {
    src: "/hacom-riverside.jpg",
    title: "Hacom Riverside",
    subtitle: "Không gian sống hiện đại bên sông - Nơi hội tụ tinh hoa và đẳng cấp thượng lưu",
  },
  {
    src: "/hacom-tower.jpg",
    title: "Hacom Tower",
    subtitle: "Biểu tượng mới của thành phố - Tòa cao ốc phức hợp hiện đại bậc nhất",
  },
  {
    src: "/hacom-wind.jpg",
    title: "Hacom Wind",
    subtitle: "Năng lượng xanh cho tương lai - Kiến tạo giá trị bền vững cho thế hệ mai sau",
  },
];

export const AuthLayoutSplit: React.FC<AuthLayoutSplitProps> = ({
  children,
}) => {
  const [currentIndex, setCurrentIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HACoM_IMAGES.length);
    }, 5000); // Increased to 5s for smoother reading

    return () => clearInterval(interval);
  }, []);

  const currentImage = HACoM_IMAGES[currentIndex];

  return (
    <div className="flex min-h-screen w-full bg-white selection:bg-blue-600/20">
      {/* Left side: Premium Image Slider */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden lg:flex">
        {/* Background Layers */}
        <div className="absolute inset-0 bg-gray-900">
          <AnimatePresence initial={false}>
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <motion.img
                src={currentImage.src}
                alt={currentImage.title}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 7, ease: "linear" }}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
            </motion.div>
          </AnimatePresence>

          {/* Subtle overlay texture */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        </div>

        {/* Branding Header */}
        <div className="relative z-10 p-10">
          <Link to="/" className="inline-block group">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="flex items-center gap-3"
            >
              <img
                src="/hacom-logo-horizontal.png"
                alt="Hacom Holdings"
                className="h-12 w-auto object-contain filter drop-shadow-md"
              />
            </motion.div>
          </Link>
        </div>

        {/* Dynamic Content */}
        <div className="relative z-10 p-12 lg:p-16 text-white max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h2 className="mb-4 text-5xl font-bold tracking-tight leading-[1.1] drop-shadow-2xl">
                {currentImage.title}
              </h2>
              <p className="text-xl font-light text-white/90 leading-relaxed drop-shadow-lg">
                {currentImage.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>

          {/* Premium Progress Indicators */}
          <div className="mt-12 flex gap-3">
            {HACoM_IMAGES.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className="group relative h-1 flex-1 overflow-hidden rounded-full bg-white/20 transition-all hover:bg-white/30"
              >
                {idx === currentIndex && (
                  <motion.div
                    layoutId="progress-bar"
                    className="absolute inset-0 bg-white"
                    initial={{ scaleX: 0, originX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 5, ease: "linear" }}
                  />
                )}
                {idx < currentIndex && <div className="absolute inset-0 bg-white/60" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="relative flex w-full flex-col bg-[#F8FAFC] lg:w-1/2">
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-[560px] rounded-3xl bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 lg:p-12">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayoutSplit;
