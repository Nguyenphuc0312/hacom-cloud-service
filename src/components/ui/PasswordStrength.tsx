/**
 * @fileoverview Password strength indicator
 * Hiển thị độ mạnh của mật khẩu
 */

import React from "react";
import clsx from "clsx";
import { calculatePasswordStrength } from "../../lib/validations";

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

const strengthConfig = {
  weak: {
    label: "Yếu",
    color: "bg-red-500",
    bars: 1,
    textColor: "text-red-500",
  },
  medium: {
    label: "Trung bình",
    color: "bg-amber-500",
    bars: 2,
    textColor: "text-amber-500",
  },
  strong: {
    label: "Mạnh",
    color: "bg-green-500",
    bars: 3,
    textColor: "text-green-500",
  },
};

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({
  password,
  className,
}) => {
  if (!password) return null;

  const strength = calculatePasswordStrength(password);
  const config = strengthConfig[strength];

  return (
    <div className={clsx("space-y-1.5", className)}>
      {/* Strength bars */}
      <div className="flex gap-1.5">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              bar <= config.bars ? config.color : "bg-gray-200",
            )}
          />
        ))}
      </div>

      {/* Strength label */}
      <p className={clsx("text-xs font-medium", config.textColor)}>
        Độ mạnh: {config.label}
      </p>

      {/* Password requirements */}
      <div className="text-xs text-gray-500 space-y-0.5">
        <RequirementItem met={password.length >= 8} text="Ít nhất 8 ký tự" />
        <RequirementItem
          met={/[a-z]/.test(password)}
          text="Có chữ thường (a-z)"
        />
        <RequirementItem met={/[A-Z]/.test(password)} text="Có chữ hoa (A-Z)" />
        <RequirementItem met={/[0-9]/.test(password)} text="Có số (0-9)" />
        <RequirementItem
          met={/[^a-zA-Z0-9]/.test(password)}
          text="Có ký tự đặc biệt (!@#$...)"
          optional
        />
      </div>
    </div>
  );
};

/**
 * Requirement item component
 */
const RequirementItem: React.FC<{
  met: boolean;
  text: string;
  optional?: boolean;
}> = ({ met, text, optional }) => (
  <div className="flex items-center gap-1.5">
    <div
      className={clsx(
        "w-3 h-3 rounded-full flex items-center justify-center text-[8px]",
        met ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400",
      )}
    >
      {met ? "✓" : ""}
    </div>
    <span className={clsx(met && "text-gray-700")}>
      {text}
      {optional && " (khuyến khích)"}
    </span>
  </div>
);

export default PasswordStrength;
