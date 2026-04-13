import React from 'react';
import { Modal } from 'antd';
import clsx from 'clsx';

interface AppModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number | string;
  className?: string;
}

export const AppModal: React.FC<AppModalProps> = ({
  open,
  title,
  onClose,
  footer,
  children,
  width = 480,
  className,
}) => (
  <Modal
    open={open}
    title={title}
    onCancel={onClose}
    footer={footer}
    width={width}
    className={clsx('ds-app-modal', className)}
    closeIcon={<span className="ds-modal-close">×</span>}
    centered
    destroyOnClose
    maskClosable={false}
  >
    {children}
  </Modal>
);
