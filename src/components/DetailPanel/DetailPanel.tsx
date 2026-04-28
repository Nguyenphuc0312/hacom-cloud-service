import React from 'react';
import { Modal } from 'antd';
import clsx from 'clsx';

import './DetailPanel-01.css';
import './DetailPanel-02.css';
interface DetailPanelProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  className?: string;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  open,
  title,
  onClose,
  children,
  width = 640,
  className,
}) => (
  <Modal
    open={open}
    title={title}
    onCancel={onClose}
    footer={null}
    width={width}
    className={clsx('ds-detail-modal', className)}
    destroyOnHidden
    mask={{ closable: true }}
  >
    <div className="ds-detail-modal-body">{children}</div>
  </Modal>
);
