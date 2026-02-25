/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: { xs: "360px" },
      colors: {
        // Telegram-style colors
        telegram: {
          primary: "#0088cc",
          secondary: "#64b5ef",
          light: "#e6ebee",
          bubble: {
            sent: "#0088cc",
            received: "#ffffff",
          },
        },
        // Zalo-style colors
        zalo: {
          primary: "#0068FF",
          secondary: "#00A5FF",
          accent: "#FF6B00",
          bubble: {
            sent: "#E1FFC7",
            received: "#ffffff",
          },
        },
        // Chat app specific
        chat: {
          sidebar: "#f5f5f5",
          background: "#e6ebee",
          border: "#e4e4e4",
          text: {
            primary: "#000000",
            secondary: "#707579",
            muted: "#8E8E93",
          },
          online: "#00c853",
          offline: "#9e9e9e",
          away: "#ffc107",
        },
        // Dark mode
        dark: {
          background: "#212121",
          sidebar: "#181818",
          chat: "#0f0f0f",
          bubble: {
            sent: "#0088cc",
            received: "#2b2b2b",
          },
          border: "#2f2f2f",
          text: {
            primary: "#ffffff",
            secondary: "#aaaaaa",
          },
        },
      },
      animation: {
        typing: "typing 1.4s infinite",
        "typing-delay-1": "typing 1.4s infinite 0.2s",
        "typing-delay-2": "typing 1.4s infinite 0.4s",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-up": "slideInUp 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
        "bounce-in": "bounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "pulse-online": "pulseOnline 2s infinite",
        "reaction-pop":
          "reactionPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        shake: "shake 0.5s ease-in-out",
      },
      keyframes: {
        typing: {
          "0%, 60%, 100%": { transform: "translateY(0)" },
          "30%": { transform: "translateY(-8px)" },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        slideInRight: {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        slideInUp: {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        bounceIn: {
          "0%": { opacity: "0", transform: "scale(0.3)" },
          "50%": { transform: "scale(1.05)" },
          "70%": { transform: "scale(0.9)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        pulseOnline: {
          "0%": { boxShadow: "0 0 0 0 rgba(0, 200, 83, 0.7)" },
          "70%": { boxShadow: "0 0 0 10px rgba(0, 200, 83, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(0, 200, 83, 0)" },
        },
        reactionPop: {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.3)" },
          "100%": { transform: "scale(1)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "75%": { transform: "translateX(5px)" },
        },
      },
      spacing: {
        sidebar: "320px",
        "info-panel": "360px",
      },
      maxWidth: {
        message: "70%",
      },
      zIndex: {
        modal: "100",
        tooltip: "90",
        dropdown: "80",
        sticky: "70",
      },
    },
  },
  plugins: [],
};
