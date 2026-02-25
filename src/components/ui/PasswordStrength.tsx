/**
 * @fileoverview Password strength indicator
 * Hiển thị độ mạnh của mật khẩu
 */

import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { calculatePasswordStrength } from "../../lib/validations";

interface PasswordStrengthProps {
  password: string;
  className?: string;
}

const strengthConfig = {
  weak: {
    labelKey: "validation:strength.weak",
    color: "bg-danger",
    bars: 1,
    textColor: "text-danger",
  },
  medium: {
    labelKey: "validation:strength.medium",
    color: "bg-warning",
    bars: 2,
    textColor: "text-warning",
  },
  strong: {
    labelKey: "validation:strength.strong",
    color: "bg-success",
    bars: 3,
    textColor: "text-success",
  },
};

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({
  password,
  className,
}) => {
  const { t } = useTranslation();
  if (!password) return null;

  const strength = calculatePasswordStrength(password);
  const config = strengthConfig[strength];

  return (
    <div className={clsx("space-y-1.5", className)}>
      {/* Strength bars */}
      <div className="flex gap-2">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              bar <= config.bars ? config.color : "bg-surface-active",
            )}
          />
        ))}
      </div>

      {/* Strength label */}
      <p className={clsx("text-xs font-medium", config.textColor)}>
        {t("validation:strength.label")}: {t(config.labelKey)}
      </p>

      {/* Password requirements */}
      <div className="text-xs text-text-muted space-y-0.5">
        <RequirementItem
          met={password.length >= 8}
          text={t("validation:strength.requirements.length")}
        />
        <RequirementItem
          met={/[a-z]/.test(password)}
          text={t("validation:strength.requirements.lowercase")}
        />
        <RequirementItem
          met={/[A-Z]/.test(password)}
          text={t("validation:strength.requirements.uppercase")}
        />
        <RequirementItem
          met={/[0-9]/.test(password)}
          text={t("validation:strength.requirements.number")}
        />
        <RequirementItem
          met={/[^a-zA-Z0-9]/.test(password)}
          text={t("validation:strength.requirements.special")}
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
  <RequirementItemBase met={met} text={text} optional={optional} />
);

const RequirementItemBase: React.FC<{
  met: boolean;
  text: string;
  optional?: boolean;
}> = ({ met, text, optional }) => {
  const { t } = useTranslation();

  return (
  <div className="flex items-center gap-2">
    <div
      className={clsx(
        "w-3 h-3 rounded-full flex items-center justify-center text-xs leading-none",
        met ? "bg-success text-text-inverse" : "bg-surface-active text-text-muted",
      )}
    >
      {met ? "✓" : ""}
    </div>
    <span className={clsx(met && "text-text-secondary")}>
      {text}
      {optional && ` (${t("validation:strength.requirements.optional")})`}
    </span>
  </div>
  );
};

export default PasswordStrength;


