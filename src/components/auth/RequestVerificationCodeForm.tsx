import React from "react";
import { Button } from "../ui";

export interface RequestVerificationCodeFormProps {
  email: string;
  onEmailChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  isLoading?: boolean;
  error?: string | null;
  emailLabel: string;
  emailPlaceholder: string;
  submitLabel: string;
}

export const RequestVerificationCodeForm: React.FC<
  RequestVerificationCodeFormProps
> = ({
  email,
  onEmailChange,
  onSubmit,
  isLoading = false,
  error,
  emailLabel,
  emailPlaceholder,
  submitLabel,
}) => {
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit();
      }}
      noValidate
    >
      <label className="block text-sm font-medium text-text-secondary">
        {emailLabel}
      </label>
      <input
        type="email"
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        placeholder={emailPlaceholder}
        autoComplete="email"
        className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-focus/20"
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" fullWidth size="lg" isLoading={isLoading}>
        {submitLabel}
      </Button>
    </form>
  );
};

export default RequestVerificationCodeForm;
