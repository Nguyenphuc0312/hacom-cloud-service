import React from 'react';
import clsx from 'clsx';

interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Section: React.FC<SectionProps> = ({
  as: Component = 'section',
  className,
  ...props
}) => {
  return <Component className={clsx('ds-section', className)} {...props} />;
};
import React from 'react';
import clsx from 'clsx';

interface SectionProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Section: React.FC<SectionProps> = ({
  as: Component = 'section',
  className,
  ...props
}) => {
  return <Component className={clsx('ds-section', className)} {...props} />;
};
