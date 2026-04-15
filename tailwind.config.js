/** @type {import('tailwindcss').Config} */
const withOpacity = (variableName, fallback) =>
  `hsl(var(${variableName}, ${fallback}) / <alpha-value>)`;

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: { xs: "360px" },
      fontFamily: {
        sans: [
          "var(--font-family-sans)",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      fontSize: {
        caption: [
          "var(--font-size-caption, 0.75rem)",
          { lineHeight: "var(--line-height-caption, 1rem)" },
        ],
        "body-sm": [
          "var(--font-size-body-sm, 0.875rem)",
          { lineHeight: "var(--line-height-body-sm, 1.25rem)" },
        ],
        body: [
          "var(--font-size-body, 1rem)",
          { lineHeight: "var(--line-height-body, 1.5rem)" },
        ],
        "title-sm": [
          "var(--font-size-title-sm, 1.125rem)",
          { lineHeight: "var(--line-height-title-sm, 1.5rem)" },
        ],
        title: [
          "var(--font-size-title, 1.25rem)",
          { lineHeight: "var(--line-height-title, 1.75rem)" },
        ],
        xs: [
          "var(--font-size-xs, 0.75rem)",
          { lineHeight: "var(--line-height-xs, 1rem)" },
        ],
        sm: [
          "var(--font-size-sm, 0.875rem)",
          { lineHeight: "var(--line-height-sm, 1.25rem)" },
        ],
        base: [
          "var(--font-size-base, 1rem)",
          { lineHeight: "var(--line-height-base, 1.5rem)" },
        ],
        md: [
          "var(--font-size-md, 1rem)",
          { lineHeight: "var(--line-height-md, 1.5rem)" },
        ],
        lg: [
          "var(--font-size-lg, 1.125rem)",
          { lineHeight: "var(--line-height-lg, 1.75rem)" },
        ],
        xl: [
          "var(--font-size-xl, 1.25rem)",
          { lineHeight: "var(--line-height-xl, 1.75rem)" },
        ],
        "2xl": [
          "var(--font-size-2xl, 1.5rem)",
          { lineHeight: "var(--line-height-2xl, 2rem)" },
        ],
        "3xl": [
          "var(--font-size-3xl, 1.875rem)",
          { lineHeight: "var(--line-height-3xl, 2.25rem)" },
        ],
      },
      fontWeight: {
        regular: "var(--font-weight-regular, 400)",
        medium: "var(--font-weight-medium, 500)",
        semibold: "var(--font-weight-semibold, 600)",
        bold: "var(--font-weight-bold, 700)",
      },
      colors: {
        primary: withOpacity("--color-primary", "206 100% 41%"),
        "primary-hover": withOpacity("--color-primary-hover", "206 100% 35%"),
        "primary-active": withOpacity("--color-primary-active", "206 100% 35%"),
        secondary: withOpacity("--color-secondary", "203 88% 66%"),
        accent: withOpacity("--color-accent", "24 100% 50%"),
        success: withOpacity("--color-success", "152 80% 36%"),
        "success-hover": withOpacity("--color-success-hover", "152 74% 30%"),
        warning: withOpacity("--color-warning", "42 96% 50%"),
        "warning-hover": withOpacity("--color-warning-hover", "38 94% 44%"),
        danger: withOpacity("--color-danger", "0 84% 60%"),
        "danger-hover": withOpacity("--color-danger-hover", "0 72% 50%"),
        background: withOpacity("--color-background", "210 33% 98%"),
        surface: {
          DEFAULT: withOpacity("--color-surface", "0 0% 100%"),
          raised: withOpacity("--color-surface-raised", "0 0% 100%"),
          overlay: withOpacity("--color-surface-overlay", "220 18% 97%"),
          hover: withOpacity("--color-surface-hover", "220 18% 97%"),
          active: withOpacity("--color-surface-active", "215 20% 87%"),
        },
        border: {
          DEFAULT: withOpacity("--color-border", "215 20% 87%"),
          strong: withOpacity("--color-border-strong", "215 16% 65%"),
          focus: withOpacity("--color-border-focus", "206 100% 41%"),
        },
        text: {
          primary: withOpacity("--color-text-primary", "222 47% 11%"),
          secondary: withOpacity("--color-text-secondary", "215 16% 47%"),
          muted: withOpacity("--color-text-muted", "215 13% 65%"),
          inverse: withOpacity("--color-text-inverse", "0 0% 100%"),
          disabled: withOpacity("--color-text-disabled", "215 13% 65%"),
        },
        token: {
          background: withOpacity("--surface-background", "210 33% 98%"),
          elevated: withOpacity("--surface-elevated", "0 0% 100%"),
          hover: withOpacity("--surface-hover", "220 18% 97%"),
          active: withOpacity("--surface-active", "215 20% 87%"),
          border: withOpacity("--surface-border", "215 20% 87%"),
          muted: withOpacity("--surface-text-muted", "215 13% 65%"),
          primary: withOpacity("--surface-text-primary", "222 47% 11%"),
        },
        disabled: {
          bg: withOpacity("--color-disabled-bg", "220 18% 97%"),
          border: withOpacity("--color-disabled-border", "215 20% 87%"),
        },
        state: {
          online: withOpacity("--color-online", "142 71% 45%"),
          offline: withOpacity("--color-offline", "215 13% 65%"),
          away: withOpacity("--color-away", "42 96% 50%"),
          dnd: withOpacity("--color-danger", "0 84% 60%"),
          busy: withOpacity("--color-warning", "42 96% 50%"),
        },
        focus: withOpacity("--color-focus-ring", "206 100% 41%"),

        // Backward compatibility aliases.
        telegram: {
          primary: withOpacity("--color-primary", "206 100% 41%"),
          secondary: withOpacity("--color-secondary", "203 88% 66%"),
          light: withOpacity("--color-background", "210 33% 98%"),
          bubble: {
            sent: withOpacity("--color-primary", "206 100% 41%"),
            received: withOpacity("--color-surface", "0 0% 100%"),
          },
        },
        zalo: {
          primary: withOpacity("--color-primary", "206 100% 41%"),
          secondary: withOpacity("--color-secondary", "203 88% 66%"),
          accent: withOpacity("--color-accent", "24 100% 50%"),
          bubble: {
            sent: withOpacity("--color-secondary", "203 88% 66%"),
            received: withOpacity("--color-surface", "0 0% 100%"),
          },
        },
        chat: {
          sidebar: withOpacity("--color-surface", "0 0% 100%"),
          background: withOpacity("--color-background", "210 33% 98%"),
          border: withOpacity("--color-border", "215 20% 87%"),
          text: {
            primary: withOpacity("--color-text-primary", "222 47% 11%"),
            secondary: withOpacity("--color-text-secondary", "215 16% 47%"),
            muted: withOpacity("--color-text-muted", "215 13% 65%"),
          },
          online: withOpacity("--color-online", "142 71% 45%"),
          offline: withOpacity("--color-offline", "215 13% 65%"),
          away: withOpacity("--color-away", "42 96% 50%"),
        },
        dark: {
          background: withOpacity("--color-background", "222 24% 10%"),
          sidebar: withOpacity("--color-surface", "222 22% 12%"),
          chat: withOpacity("--color-surface-overlay", "221 22% 16%"),
          bubble: {
            sent: withOpacity("--color-primary", "206 100% 41%"),
            received: withOpacity("--color-surface-raised", "222 20% 18%"),
          },
          border: withOpacity("--color-border", "218 17% 28%"),
          text: {
            primary: withOpacity("--color-text-primary", "210 20% 96%"),
            secondary: withOpacity("--color-text-secondary", "215 15% 70%"),
          },
        },
      },
      borderRadius: {
        sm: "var(--radius-sm, 0.5rem)",
        md: "var(--radius-md, 0.75rem)",
        lg: "var(--radius-lg, 1rem)",
        xl: "var(--radius-xl, 1.25rem)",
        "2xl": "var(--radius-2xl, 1.5rem)",
      },
      boxShadow: {
        xs: "var(--shadow-xs, 0 1px 2px hsl(215 25% 15% / 0.08))",
        sm: "var(--shadow-sm, 0 4px 12px hsl(215 25% 15% / 0.12))",
        md: "var(--shadow-md, 0 8px 24px hsl(215 25% 15% / 0.16))",
        lg: "var(--shadow-lg, 0 12px 34px hsl(215 25% 15% / 0.2))",
        elev1: "var(--elevation-1, 0 2px 8px hsl(215 25% 15% / 0.12))",
        elev2: "var(--elevation-2, 0 8px 20px hsl(215 25% 15% / 0.16))",
        elev3: "var(--elevation-3, 0 12px 32px hsl(215 25% 15% / 0.2))",
      },
      spacing: {
        1: "var(--space-1, 4px)",
        2: "var(--space-2, 8px)",
        3: "var(--space-3, 12px)",
        4: "var(--space-4, 16px)",
        5: "var(--space-5, 20px)",
        6: "var(--space-6, 24px)",
        8: "var(--space-8, 32px)",
        10: "var(--space-10, 40px)",
        12: "var(--space-12, 48px)",
        sidebar: "320px",
        "info-panel": "360px",
        "room-item": "var(--size-room-item, 72px)",
        "room-meta": "var(--size-room-meta, 46px)",
        "sidebar-collapsed": "var(--size-sidebar-collapsed, 88px)",
        "sidebar-expanded": "var(--size-sidebar-expanded, 304px)",
        "voice-message-min": "var(--size-voice-message-min, 200px)",
      },
      animation: {
        typing: "typing 1.4s infinite",
        "typing-delay-1": "typing 1.4s infinite 0.2s",
        "typing-delay-2": "typing 1.4s infinite 0.4s",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-up": "slideInUp 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
        "fade-in-fast": "fadeIn 150ms ease-out",
        "bounce-in": "bounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "pulse-online": "pulseOnline 2s infinite",
        "reaction-pop":
          "reactionPop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        shake: "shake 0.5s ease-in-out",
        /* New polished animations */
        "msg-in": "msgSlideIn 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "toolbar-in": "toolbarScaleIn 150ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "typing-dot": "typingDot 1.4s ease-in-out infinite",
        "typing-dot-delay-1": "typingDot 1.4s ease-in-out 0.16s infinite",
        "typing-dot-delay-2": "typingDot 1.4s ease-in-out 0.32s infinite",
        "skeleton-shimmer": "shimmer 1.8s ease-in-out infinite",
        "content-fade": "contentFade 200ms ease-out both",
        "slide-up-fade": "slideUpFade 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "bounce-subtle": "bounceSubtle 1.5s ease-in-out infinite",
        "message-insert":
          "messageInsert var(--motion-duration-message-insert, 140ms) var(--motion-ease-enter, cubic-bezier(0.2, 0.8, 0.2, 1)) both",
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
          "0%": { boxShadow: "0 0 0 0 hsl(var(--color-online) / 0.55)" },
          "70%": { boxShadow: "0 0 0 10px hsl(var(--color-online) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--color-online) / 0)" },
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
        /* New polished keyframes */
        msgSlideIn: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        toolbarScaleIn: {
          from: { opacity: "0", transform: "scale(0.92)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        typingDot: {
          "0%, 44%, 100%": {
            opacity: "0.3",
            transform: "scale(0.8) translateY(0)",
          },
          "22%": { opacity: "1", transform: "scale(1) translateY(-3px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        contentFade: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUpFade: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        messageInsert: {
          from: {
            opacity: "0.72",
            transform: "translateY(8px) scale(0.985)",
          },
          to: {
            opacity: "1",
            transform: "translateY(0) scale(1)",
          },
        },
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
  plugins: [
    // GPU-composited transition helpers
    function ({ addUtilities }) {
      addUtilities({
        ".will-change-transform": { willChange: "transform" },
        ".will-change-opacity": { willChange: "opacity" },
        ".backface-hidden": { backfaceVisibility: "hidden" },
        ".transition-micro": {
          transitionProperty:
            "background-color, color, box-shadow, border-color, opacity, transform",
          transitionTimingFunction: "var(--motion-ease-enter, cubic-bezier(0.2, 0.8, 0.2, 1))",
          transitionDuration: "var(--motion-duration-hover, 150ms)",
        },
        ".transition-fast": {
          transitionProperty:
            "background-color, color, box-shadow, border-color, opacity, transform",
          transitionTimingFunction: "var(--motion-ease-enter, cubic-bezier(0.2, 0.8, 0.2, 1))",
          transitionDuration: "var(--motion-duration-hover-fast, 120ms)",
        },
        ".transition-shell": {
          transitionProperty:
            "width, background-color, color, box-shadow, border-color, opacity, transform",
          transitionTimingFunction: "var(--motion-ease-enter, cubic-bezier(0.2, 0.8, 0.2, 1))",
          transitionDuration: "var(--motion-duration-sidebar, 220ms)",
        },
        ".transition-badge": {
          transitionProperty:
            "background-color, color, box-shadow, border-color, opacity, transform",
          transitionTimingFunction: "var(--motion-ease-enter, cubic-bezier(0.2, 0.8, 0.2, 1))",
          transitionDuration: "var(--motion-duration-badge, 140ms)",
        },
      });
    },
  ],
};
