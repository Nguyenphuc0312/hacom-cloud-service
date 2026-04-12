import React from 'react';
import clsx from 'clsx';

interface FormActionsProps {
  children?: React.ReactNode;
  className?: string;
}

export const FormActions: React.FC<FormActionsProps> = ({ children, className }) => (
  <div className={clsx('ds-form-actions', className)}>{children}</div>
);

export default FormActions;
