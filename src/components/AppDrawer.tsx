import React from 'react';
import { Drawer } from 'antd';
import clsx from 'clsx';

interface AppDrawerProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number | string;
  className?: string;
}

export const AppDrawer: React.FC<AppDrawerProps> = ({
  open,
  title,
  onClose,
  footer,
  children,
  width = 480,
  className,
}) => (
  <Drawer
    open={open}
    title={title}
    onClose={onClose}
    footer={footer}
    width={width}
    className={clsx('ds-app-drawer', className)}
    closeIcon={<span className="ds-modal-close">×</span>}
    destroyOnClose
    maskClosable={false}
    placement="right"
  >
    {children}
  </Drawer>
);
