import React from 'react';
import clsx from 'clsx';

interface FormFieldProps {
  label?: React.ReactNode;
  labelFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  labelFor,
  required = false,
  hint,
  error,
  children,
  className,
}) => {
  return (
    <div className={clsx('ds-form-field', className)}>
      {label && (
        <label className="ds-form-label" htmlFor={labelFor}>
          {label}
          {required && <span className="ds-form-label-required">*</span>}
        </label>
      )}
      <div className="ds-form-control">{children}</div>
      {hint && <div className="ds-form-hint">{hint}</div>}
      {error && <div className="ds-form-error">{error}</div>}
    </div>
  );
};

export default FormField;
