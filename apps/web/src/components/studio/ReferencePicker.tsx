import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useI18n } from '@/i18n'
import { checkReferenceFile, uploadReference, UploadError, type UploadErrorCode } from '@/lib/uploads'
import { cn } from '@/lib/utils'

/**
 * منتقي الصور المرجعية في التوليد الحر (الخطوة 5): رفع إلى up/{uid}/ (سياسة 0007/0010: صور فقط، 40 يوميًا، 8MB هنا).
 * `frames` = الخانات إطارات (الأول ثم الأخير) لنماذج صورة→فيديو؛ وإلا مجموعة صور حتى `max`.
 * الخادم يفرض الحد الأدنى نفسه — هنا للعرض وتعطيل الزر قبل الضغط.
 */
export function ReferencePicker({
  userId,
  spec,
  refs,
  onChange,
}: {
  userId: string
  spec: { min: number; max: number; frames: boolean }
  refs: string[]
  onChange: (next: string[]) => void
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)

  const messages: Record<UploadErrorCode, string> = {
    too_large: t('studio.tooLarge'),
    bad_type: t('studio.badType'),
    failed: t('studio.uploadFailed'),
  }

  async function onFile(file: File | undefined, at: number) {
    if (!file) return
    const problem = checkReferenceFile(file)
    if (problem) return void toast.error(messages[problem])
    setUploading(at)
    try {
      const url = await uploadReference(userId, file)
      const next = refs.slice()
      next[at] = url
      onChange(next.filter(Boolean))
    } catch (e) {
      toast.error(e instanceof UploadError ? messages[e.code] : t('studio.uploadFailed'))
    } finally {
      setUploading(null)
    }
  }

  function remove(at: number) {
    onChange(refs.filter((_, i) => i !== at))
  }

  const slots = spec.frames ? spec.max : Math.min(spec.max, refs.length + 1)
  const label = (i: number) =>
    spec.frames ? (i === 0 ? t('refs.first') : i < spec.min ? t('refs.last') : t('refs.lastOptional')) : t('refs.image', { n: i + 1 })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted">{t('refs.title')}</h2>
        <span className="text-[11px] text-muted">{spec.min > 0 ? t('refs.required', { n: spec.min }) : t('refs.optional')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const url = refs[i]
          const busy = uploading === i
          // في المجموعة: الخانة بعد آخر صورة فقط تقبل الإضافة (لا فجوات)
          const disabled = !spec.frames && i > refs.length
          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="relative aspect-square">
                {url ? (
                  <>
                    <img src={url} alt={label(i)} className="size-full border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={t('refs.remove')}
                      title={t('refs.remove')}
                      className="absolute end-1 top-1 flex size-6 items-center justify-center bg-inverse/80 text-inverse-ink hover:bg-inverse"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy || disabled || (spec.frames && i > refs.length)}
                    onClick={() => {
                      setSlot(i)
                      input.current?.click()
                    }}
                    className={cn(
                      'flex size-full flex-col items-center justify-center gap-1 border border-dashed border-border p-2 text-center text-[11px] text-muted transition-colors hover:border-text disabled:opacity-40',
                    )}
                  >
                    {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                    {busy ? t('refs.uploading') : t('refs.add')}
                  </button>
                )}
              </div>
              <span className="text-[11px] text-muted">{label(i)}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted">{t('refs.hint')}</p>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0], slot ?? refs.length)
          e.target.value = ''
        }}
      />
    </div>
  )
}
