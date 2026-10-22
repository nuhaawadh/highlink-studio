import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** حقل نص متعدد الأسطر على نمط shadcn — الأنماط من tokens.css. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full resize-none rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-brand disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'
