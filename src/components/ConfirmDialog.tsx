import React from 'react';
import { Modal } from 'antd';
import clsx from 'clsx';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  danger?: boolean;
  className?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading,
  danger,
  className,
}) => (
  <Modal
    open={open}
    title={title}
    onCancel={onCancel}
    footer={[
      <button
        key="cancel"
        type="button"
        className="ds-btn ds-btn--ghost"
        onClick={onCancel}
        disabled={loading}
      >
        {cancelText}
      </button>,
      <button
        key="ok"
        type="button"
        className={clsx('ds-btn', danger ? 'ds-btn--danger' : 'ds-btn--primary')}
        onClick={onConfirm}
        disabled={loading}
      >
        {loading ? '...' : confirmText}
      </button>,
    ]}
    className={clsx('ds-confirm-modal', className)}
    centered
    destroyOnClose
    maskClosable={false}
  >
    {description ? <div className="ds-confirm-desc">{description}</div> : null}
  </Modal>
);
