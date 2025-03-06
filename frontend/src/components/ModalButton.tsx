import React, { useState, ReactNode } from 'react';
import { Button, ButtonProps, ModalProps } from 'antd';

import InnerModal from './InnerModal';
import { useKeyPress } from 'ahooks';

export interface ModalButtonProps extends ButtonProps {
  buttonText: ReactNode;
  modalProps?: ModalProps;
  onSuccess?: AnyFunction; // 用于内部组件关闭Modal
  render: (onSuccess: AnyFunction) => ReactNode | ReactNode[];
  keyPress?: string[];
}

export type AnyFunction<
  TParams extends unknown[] = unknown[],
  TResult = unknown,
> = (...params: TParams) => TResult;

const ModalButton: React.FC<ModalButtonProps> = props => {
  const {
    buttonText,
    modalProps,
    onSuccess = () => {},
    render,
    keyPress = [],
    ...buttonProps
  } = props;

  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.();
  };

  useKeyPress(keyPress, () => {
    setOpen(open => !open);
  });

  return (
    <>
      <Button
        {...buttonProps}
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {buttonText}
      </Button>
      <InnerModal
        destroyOnClose
        {...modalProps}
        render={render}
        onSuccess={handleSuccess}
        open={open}
        onCancel={e => {
          modalProps?.onCancel?.(e);
          setOpen(false);
        }}
      />
    </>
  );
};

export default ModalButton;
