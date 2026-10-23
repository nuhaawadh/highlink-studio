import { z } from 'npm:zod@4'

/**
 * مخطط طلب generate-media (المخطط §5، CLAUDE.md القاعدة 10). منفصل عن index.ts ليُختبر بـvitest.
 * المراجع: https فقط وبطول محدود — أي رابط يصل للمزوّد يمر من هنا أولًا (المراجعة المستقلة، البند 12).
 */
export const GenerateRequestSchema = z.object({
  assetId: z.uuid(),
  model: z.string().min(1).max(64),
  prompt: z.string().trim().min(1).max(4000),
  images: z.array(z.url({ protocol: /^https$/ }).max(2048)).max(14).optional(),
  config: z
    .object({
      aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:5', '3:4']).optional(),
      imageSize: z.enum(['1K', '2K', '4K']).optional(),
      duration: z.number().int().min(1).max(30).optional(),
      // كما يسمّيها مخطط المزوّد: 480p/720p/1080p/768P/4k… — التحقق الفعلي ضد enum النموذج في inputs.ts (ADR 0005)
      resolution: z.string().regex(/^(\d{3,4}[pP]|[248][kK])$/).optional(),
      audio: z.boolean().optional(),
      seed: z.number().int().optional(),
    })
    .optional(),
  feature_tag: z.enum(['general', 'product', 'ads', 'ugc', 'shots', 'storyboard', 'characters']).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  maxCredits: z.number().int().positive().optional(),
})

export type GenerateRequestInput = z.infer<typeof GenerateRequestSchema>
