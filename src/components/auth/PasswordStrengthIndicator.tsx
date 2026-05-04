import React from "react";
import { calculatePasswordStrength } from "../../lib/validations";

interface PasswordStrengthIndicatorProps {
  password?: string;
}

export const PasswordStrengthIndicator: React.FC<PasswordStrengthIndicatorProps> = ({ password = "" }) => {
  let config = { bars: 0, text: "Chưa nhập", color: "bg-slate-200", textColor: "text-slate-700" };
  
  if (password.length > 0) {
    const strength = calculatePasswordStrength(password);
    if (strength === "weak") config = { bars: 1, text: "Yếu", color: "bg-red-500", textColor: "text-red-500" };
    else if (strength === "medium") config = { bars: 2, text: "Trung bình", color: "bg-yellow-500", textColor: "text-yellow-600" };
    else if (strength === "strong") config = { bars: 3, text: "Mạnh", color: "bg-[#22c55e]", textColor: "text-[#22c55e]" };
  }

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex gap-2">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={`h-1.5 flex-1 rounded-full ${
              bar <= config.bars ? config.color : "bg-slate-200"
            } transition-colors`}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-slate-500">
        Độ mạnh mật khẩu: <span className={`font-bold ${config.textColor}`}>{config.text}</span>
      </p>
    </div>
  );
};
