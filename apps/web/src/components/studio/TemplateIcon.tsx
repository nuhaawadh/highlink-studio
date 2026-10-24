import { Building2, Calendar, Flag, Gift, Heart, LayoutGrid, Moon, ShoppingBag, Shirt, Sparkles, Utensils, type LucideIcon } from 'lucide-react'
import type { ShowcaseMedia } from '@shared/showcase'
import { MediaTile } from '@/components/studio/MediaTile'
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

/** غلاف القالب: نتيجة حقيقية من معرض العرض إن وُلّدت (content/showcase)، وإلا أيقونة الفئة على سطح Ink */
export function TemplateCover({ category, icon, media, alt, className }: { category: string; icon?: string; media?: ShowcaseMedia | null; alt?: string; className?: string }) {
  if (media) {
    return (
      <div data-category={category} className={cn('relative overflow-hidden bg-inverse', className)}>
        <MediaTile media={media} alt={alt ?? ''} fill className="absolute inset-0" />
      </div>
    )
  }
  const Icon = ICONS[icon ?? ''] ?? LayoutGrid
  return (
    <div data-category={category} className={cn('relative flex items-center justify-center overflow-hidden bg-inverse', className)}>
      <Icon className="size-9 text-inverse-ink" strokeWidth={1.5} aria-hidden />
    </div>
  )
}
