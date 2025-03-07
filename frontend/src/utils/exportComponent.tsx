import React, { ComponentType, ReactNode, Suspense } from 'react';
import type { JSX, PropsWithRef } from 'react';

export default function exportComponent<T>(
  factory: () => Promise<{ default: ComponentType<T> }>,
  fallback?: ReactNode,
) {
  const Component = React.lazy(factory);
  return (props: JSX.IntrinsicAttributes & PropsWithRef<T>) => (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
}
