import React from 'react';
import clsx from 'clsx';

import './../FormField/FormField.css';
export const FormError: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={clsx('ds-form-error', className)} {...props} />;
