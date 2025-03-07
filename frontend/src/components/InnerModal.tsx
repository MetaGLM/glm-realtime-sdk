import React, { ReactNode, useMemo } from 'react';
import { Modal, ModalProps } from 'antd';
import { AnyFunction } from '@/components/ModalButton.tsx';

interface Props extends ModalProps{
  render: (onSubmit: () => void) => ReactNode | ReactNode[];
  onSuccess?: AnyFunction;
}

const InnerModal: React.FC<Props> = props => {
  const { render, onSuccess = () => {}, ...modalProps } = props;

  const { open } = modalProps;

  const content = useMemo(() => {
    return open ? render(onSuccess) : null;
  }, [open, onSuccess, render]);

  return <Modal {...modalProps}>{content}</Modal>;
};

export default InnerModal;
