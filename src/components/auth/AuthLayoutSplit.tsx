import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ROUTE_PATHS } from "../../router/paths";

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
    subtitle: "Dự án nổi bật tại Đà Lạt",
  },
  {
    src: "/hacom-riverside.jpg",
    title: "Hacom Riverside",
    subtitle: "Không gian sống hiện đại bên sông",
  },
  {
    src: "/hacom-tower.jpg",
    title: "Hacom Tower",
    subtitle: "Biểu tượng mới của thành phố",
  },
  {
    src: "/hacom-wind.jpg",
    title: "Hacom Wind",
    subtitle: "Năng lượng xanh cho tương lai",
  },
];

export const AuthLayoutSplit: React.FC<AuthLayoutSplitProps> = ({
  children,
}) => {
  const location = useLocation();
  const isLoginPage = location.pathname === ROUTE_PATHS.LOGIN;

  const [currentIndex, setCurrentIndex] = React.useState(0);
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HACoM_IMAGES.length);
    }, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const currentImage = HACoM_IMAGES[currentIndex];

  return (
    <div className="flex min-h-screen w-full bg-white">
      {/* Left side: Image and Branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden lg:flex">
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={currentImage.src}
            alt={currentImage.title}
            className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
        </div>

        {/* Top Logo */}
        <div className="relative z-10 p-10">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg">
              <img src="/logo-dung.png" alt="Hacom" className="h-9 w-9 object-contain" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black tracking-tight text-white drop-shadow-md">
                Hacom
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/90 drop-shadow-sm">
                Holdings
              </span>
            </div>
          </Link>
        </div>

        {/* Bottom Text */}
        <div className="relative z-10 p-12 text-white">
          <h2 className="mb-2 text-4xl font-bold leading-tight drop-shadow-lg">
            {currentImage.title}
          </h2>
          <p className="max-w-md text-lg font-medium text-white/90 drop-shadow-md">
            {currentImage.subtitle}
          </p>

          {/* Slider indicators (visual only for now) */}
          <div className="mt-8 flex gap-2">
            {HACoM_IMAGES.map((img, idx) => (
              <div
                key={idx}
                className={`h-1.5 w-8 rounded-full transition-all ${img.src === currentImage.src ? "bg-white" : "bg-white/30"
                  }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="relative flex w-full flex-col lg:w-1/2">

        {/* Content Area */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-[440px] animate-fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayoutSplit;
