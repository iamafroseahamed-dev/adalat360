import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('shimmer rounded-md bg-muted/60', className)}
      aria-hidden="true"
      {...props}
    />
  )
);

Skeleton.displayName = 'Skeleton';

export { Skeleton };
