import React from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";

export type SocialProvider = "google" | "facebook";

interface SocialLoginRowProps {
  disabled?: boolean;
  onProviderClick?: (provider: SocialProvider) => void;
  enabledProviders?: SocialProvider[];
  unavailableMessage?: string;
}

const providerConfig: Record<
  SocialProvider,
  {
    label: string;
    icon: React.ReactNode;
  }
> = {
  google: {
    label: "Google",
    icon: (
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.3 1.8-1.9 3.8-5.5 3.8-3.3 0-6.1-2.8-6.1-6.2s2.8-6.2 6.1-6.2c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 2.8 14.6 2 12 2 6.9 2 2.8 6.2 2.8 11.4S6.9 20.8 12 20.8c6.9 0 9.2-4.9 8.6-10.6H12z"
        />
      </svg>
    ),
  },
  facebook: {
    label: "Facebook",
    icon: (
      <svg
        className="h-4 w-4 shrink-0 text-[#1877F2]"
        fill="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073c0 6.027 4.388 11.022 10.125 11.927v-8.437H7.078V12.07h3.047V9.413c0-3.007 1.792-4.667 4.533-4.667 1.312 0 2.686.237 2.686.237v2.953h-1.513c-1.49 0-1.956.926-1.956 1.874v2.259h3.328l-.532 3.493h-2.796V24C19.612 23.095 24 18.1 24 12.073z" />
      </svg>
    ),
  },
};

export const SocialLoginRow: React.FC<SocialLoginRowProps> = ({
  disabled = false,
  onProviderClick,
  enabledProviders = [],
  unavailableMessage,
}) => {
  const { t } = useTranslation();
  const disabledReason =
    unavailableMessage ||
    t("common:toast.featureInDevelopment", {
      defaultValue: "This sign-in method is currently unavailable.",
    });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(providerConfig) as SocialProvider[]).map((provider) => {
        const config = providerConfig[provider];
        const providerEnabled = enabledProviders.includes(provider);
        const isUnavailable = !providerEnabled || !onProviderClick;
        const isActionDisabled = disabled || isUnavailable;

        return (
          <button
            key={provider}
            type="button"
            disabled={isActionDisabled}
            onClick={() => {
              if (!isActionDisabled && onProviderClick) {
                onProviderClick(provider);
              }
            }}
            title={isUnavailable ? disabledReason : undefined}
            className={clsx(
              "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-text-secondary",
              "transition-colors duration-200",
              "hover:bg-surface-overlay hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/30",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            aria-label={t("auth:login.socialAria", { provider: config.label })}
            aria-disabled={isActionDisabled}
          >
            {config.icon}
            <span>{config.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default SocialLoginRow;
