import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
}

export const Card: React.FC<CardProps> = ({ as: Component = 'div', className, ...props }) => {
  return <Component className={clsx('ds-card', className)} {...props} />;
};
