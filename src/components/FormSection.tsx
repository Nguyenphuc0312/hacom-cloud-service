import React from 'react';
import clsx from 'clsx';

interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  children,
  className,
}) => (
  <section className={clsx('ds-form-section', className)}>
    {(title || description) && (
      <div className="ds-form-section-header">
        {title && <div className="ds-form-section-title">{title}</div>}
        {description && <div className="ds-form-section-desc">{description}</div>}
      </div>
    )}
    <div className="ds-form-section-body">{children}</div>
  </section>
);
