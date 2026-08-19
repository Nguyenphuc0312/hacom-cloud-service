import React from "react";
import toastLib from "react-hot-toast";
import { dispatchOpenConversation } from "../../features/chat/events/chatUiEvents";
import { SafeImage } from "../common/SafeImage";
import { getInitials } from "../../utils/mediaFallback";

export interface MessageToastCardProps {
  toastId: string;
  visible: boolean;
  senderName: string;
  conversationName: string;
  isGroup: boolean;
  preview: string;
  avatarUrl?: string | null;
  conversationId: string;
  messageId?: string;
}

const AvatarEl: React.FC<{
  name: string;
  url?: string | null;
}> = ({ name, url }) => {
  const initials = getInitials(name) || "?";
  const fallback = (
    <div
      aria-hidden="true"
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "hsl(var(--color-primary))",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 16,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );

  return (
    <SafeImage
      src={url}
      alt=""
      width={40}
      height={40}
      fallback={fallback}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
};

export const MessageToastCard: React.FC<MessageToastCardProps> = ({
  toastId,
  visible,
  senderName,
  conversationName,
  isGroup,
  preview,
  avatarUrl,
  conversationId,
  messageId,
}) => {
  const [hovered, setHovered] = React.useState(false);
  const avatarName = isGroup ? conversationName : senderName;
  const titleText = isGroup ? conversationName : senderName;
  const bodyText = isGroup ? `${senderName}: ${preview}` : preview;

  const handleCardClick = () => {
    toastLib.dismiss(toastId);
    dispatchOpenConversation({ conversationId, messageId });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    toastLib.dismiss(toastId);
  };

  return (
    <div
      role="status"
      aria-label={`Tin nhắn mới từ ${titleText}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleCardClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "min(360px, calc(100vw - 32px))",
        minHeight: 64,
        padding: "10px 12px 10px 0",
        background: "hsl(var(--color-surface))",
        border: "1px solid hsl(var(--color-border))",
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow:
          "0 4px 16px hsl(215 25% 15% / 0.14), 0 1px 4px hsl(215 25% 15% / 0.08)",
        cursor: "pointer",
        userSelect: "none",
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateX(0) scale(1)"
          : "translateX(12px) scale(0.97)",
        transition:
          "opacity 220ms cubic-bezier(0.16,1,0.3,1), transform 220ms cubic-bezier(0.16,1,0.3,1)",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Left accent bar */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: "hsl(var(--color-primary))",
          borderRadius:
            "var(--radius-lg, 12px) 0 0 var(--radius-lg, 12px)",
          flexShrink: 0,
        }}
      />

      {/* Avatar */}
      <div style={{ paddingLeft: 11, flexShrink: 0 }}>
        <AvatarEl name={avatarName} url={avatarUrl} />
      </div>

      {/* Text */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              lineHeight: "1.3",
              color: "hsl(var(--color-text-primary))",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            {titleText}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "hsl(var(--color-text-muted))",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            vừa xong
          </span>
        </div>

        <div
          style={{
            fontSize: 12,
            lineHeight: "1.4",
            color: "hsl(var(--color-text-secondary))",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "100%",
          }}
        >
          {bodyText}
        </div>
      </div>

      {/* Close button */}
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={handleClose}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "none",
          background: hovered
            ? "hsl(var(--color-surface-active))"
            : "transparent",
          color: "hsl(var(--color-text-muted))",
          cursor: "pointer",
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition:
            "opacity 150ms ease, background-color 150ms ease",
          fontSize: 16,
          lineHeight: 1,
          marginRight: 2,
        }}
      >
        ×
      </button>
    </div>
  );
};
