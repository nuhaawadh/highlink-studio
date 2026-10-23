import { Building2, Calendar, Flag, Gift, Heart, LayoutGrid, Moon, ShoppingBag, Shirt, Sparkles, Utensils, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** غلاف بطاقة القالب: أيقونة الفئة (حقل icon في content/templates) على تدرّج من ألوان البراند في tokens.css — حتى تُولَّد أغلفة الديمو (المخطط §9) */
const ICONS: Record<string, LucideIcon> = {
  moon: Moon,
  gift: Gift,
  flag: Flag,
  calendar: Calendar,
  building: Building2,
  utensils: Utensils,
  sparkles: Sparkles,
  shirt: Shirt,
  heart: Heart,
  'shopping-bag': ShoppingBag,
  'layout-grid': LayoutGrid,
}

export function TemplateCover({ category, icon, className }: { category: string; icon?: string; className?: string }) {
  const Icon = ICONS[icon ?? ''] ?? LayoutGrid
  return (
    <div data-category={category} className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand/20 via-surface to-bg', className)}>
      <div className="pointer-events-none absolute -top-8 start-1/4 size-32 rounded-full bg-brand/15 blur-2xl" />
      <Icon className="relative size-10 text-brand" aria-hidden />
    </div>
  )
}
