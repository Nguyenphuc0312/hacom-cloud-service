import React from 'react';
import clsx from 'clsx';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  required,
  children,
  hint,
  error,
  className,
}) => (
  <div className={clsx('ds-form-field', className)}>
    <label className="ds-form-label" htmlFor={htmlFor}>
      {label} {required && <span className="ds-form-label-required">*</span>}
    </label>
    <div className="ds-form-control">{children}</div>
    {hint && <div className="ds-form-hint">{hint}</div>}
    {error && <div className="ds-form-error">{error}</div>}
  </div>
);
