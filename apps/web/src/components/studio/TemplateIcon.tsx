import { Building2, Calendar, Flag, Gift, Heart, LayoutGrid, Moon, ShoppingBag, Shirt, Sparkles, Utensils, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** غلاف بطاقة القالب: أيقونة الفئة (حقل icon في content/templates) بالأبيض على سطح Ink المعكوس (دليل الهوية: أبيض وأسود) — حتى تُولَّد أغلفة الديمو (المخطط §9) */
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
    <div data-category={category} className={cn('relative flex items-center justify-center overflow-hidden bg-inverse', className)}>
      <Icon className="size-9 text-inverse-ink" strokeWidth={1.5} aria-hidden />
    </div>
  )
}
