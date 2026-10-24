import { useEffect, useRef, useState } from 'react'
import { cssAspect, type ShowcaseMedia } from '@shared/showcase'
import { cn } from '@/lib/utils'

/**
 * صورة أو فيديو من معرض العرض. الفيديو صامت ومتكرر، يشتغل فقط وهو ظاهر على الشاشة ويتوقف إذا خرج (أداء + بطارية الجوال)؛
 * مع "تقليل الحركة" لا يشتغل تلقائيًا — يظهر أول إطار ويشتغل عند المرور أو التركيز فقط.
 * `fill` = يملأ الحاوية (object-cover) بدل أن يأخذ نسبة الناتج.
 */
export function MediaTile({ media, alt, fill = false, className }: { media: ShowcaseMedia; alt: string; fill?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [reduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)

  useEffect(() => {
    const v = ref.current
    if (!v || reduced || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => undefined)
        else v.pause()
      },
      { threshold: 0.35 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [reduced])

  const style = fill ? undefined : { aspectRatio: cssAspect(media.aspect) }
  const base = cn('block w-full bg-inverse object-cover', fill && 'h-full', className)

  if (media.kind === 'image') {
    return <img src={media.url} alt={alt} loading="lazy" decoding="async" className={base} style={style} />
  }
  return (
    <video
      ref={ref}
      // #t=0.1 = أول إطار يظهر كصورة قبل التشغيل (بلا ملف poster منفصل)
      src={`${media.url}#t=0.1`}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={alt}
      className={base}
      style={style}
      onMouseEnter={reduced ? (e) => void e.currentTarget.play().catch(() => undefined) : undefined}
      onMouseLeave={reduced ? (e) => e.currentTarget.pause() : undefined}
      onFocus={reduced ? (e) => void e.currentTarget.play().catch(() => undefined) : undefined}
      onBlur={reduced ? (e) => e.currentTarget.pause() : undefined}
      tabIndex={-1}
    />
  )
}
