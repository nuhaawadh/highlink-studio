import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'new' | 'hot' | 'beta' | 'neutral'

const tones: Record<Tone, string> = {
  new: 'bg-brand text-brand-ink',
  hot: 'bg-brand/20 text-brand',
  beta: 'bg-transparent text-text border border-text/30',
  neutral: 'bg-text/10 text-text',
}

/** شارة صغيرة مائلة (نمط "جديد / رائج / Beta" في المخطط §8). */
export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-block -skew-x-12 rounded-sm px-1.5 py-px font-latin text-[9px] font-bold uppercase leading-normal',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
