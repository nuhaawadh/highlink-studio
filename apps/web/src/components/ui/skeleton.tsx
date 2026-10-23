import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** هيكل نابض لحالات التحميل والتوليد الجاري. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-[var(--radius-sm)] bg-text/[0.06]', className)} {...props} />
}
