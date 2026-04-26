import React from "react";
import clsx from "clsx";

interface MainHeaderProps {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const MainHeader: React.FC<MainHeaderProps> = ({
  leading,
  title,
  meta,
  actions,
  className,
}) => {
  return (
    <header className={clsx("hc-main-header", className)}>
      <div className="hc-main-header__identity">
        {leading}
        <div className="min-w-0">
          <div className="hc-main-header__title">{title}</div>
          {meta && <div className="hc-main-header__meta">{meta}</div>}
        </div>
      </div>
      {actions && <div className="hc-main-header__actions">{actions}</div>}
    </header>
  );
};

export default MainHeader;
