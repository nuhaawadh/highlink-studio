import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES, GENERATE_ERROR_CODES } from './types'
import { RESOLUTION_MULTIPLIER, applyModelResolution, modelCredits } from './pricing'
import {
  API_ERROR_CODES as EDGE_API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES_AR,
  GENERATE_ERROR_CODES as EDGE_ERROR_CODES,
  ERROR_MESSAGES_AR,
} from '../../supabase/functions/_shared/types'
import { RESOLUTION_MULTIPLIER as EDGE_MULTIPLIER, applyModelResolution as edgeApplyModelResolution, modelCredits as edgeModelCredits } from '../../supabase/functions/_shared/pricing'

/**
 * Edge Functions لا تستورد من خارج supabase/functions/ (قيود التجميع)، فالعقد منسوخ في _shared/types.ts.
 * هذا الاختبار يضمن أن النسختين لا تتباعدان (CLAUDE.md القاعدة 10).
 */
describe('contract parity — packages/shared ↔ _shared', () => {
  it('رموز الأخطاء متطابقة تمامًا', () => {
    expect([...EDGE_ERROR_CODES].sort()).toEqual([...GENERATE_ERROR_CODES].sort())
  })

  it('لكل رمز رسالة عربية غير فارغة', () => {
    for (const code of GENERATE_ERROR_CODES) {
      expect(ERROR_MESSAGES_AR[code], code).toMatch(/\S/)
    }
  })

  it('رموز API v1 متطابقة ولكل واحد رسالة عربية وحالة HTTP منطقية', () => {
    expect([...EDGE_API_ERROR_CODES].sort()).toEqual([...API_ERROR_CODES].sort())
    for (const code of API_ERROR_CODES) {
      expect(API_ERROR_MESSAGES_AR[code], code).toMatch(/\S/)
      expect(API_ERROR_HTTP_STATUS[code], code).toBeGreaterThanOrEqual(400)
      expect(API_ERROR_HTTP_STATUS[code], code).toBeLessThan(500)
    }
    // لا تداخل بين المجموعتين
    for (const code of API_ERROR_CODES) expect((GENERATE_ERROR_CODES as readonly string[]).includes(code), code).toBe(false)
  })

  it('التسعير متطابق: جدول الدقة ودالة applyModelResolution يعطيان نفس النتائج', () => {
    expect(EDGE_MULTIPLIER).toEqual(RESOLUTION_MULTIPLIER)
    const overrides = [undefined, null, { '1K': 1, '2K': 1, '4K': 2 }, { '4K': 3 }, { '2K': -1 }]
    for (const base of [1, 3, 10, 11, 22, 115]) {
      for (const res of ['1K', '2K', '4K'] as const) {
        for (const o of overrides) {
          expect(edgeApplyModelResolution(base, res, o), `${base} ${res} ${JSON.stringify(o)}`).toBe(applyModelResolution(base, res, o))
        }
      }
    }
  })

  it('modelCredits متطابقة بين النسختين على صفوف صور وفيديو بالثانية وبالمقطع (ADR 0005)', () => {
    const rows = [
      { type: 'image' as const, cost_credits: 11, cost_per_second: null, max_duration_s: null, supports: { resolution_multipliers: { '1K': 1, '2K': 1, '4K': 2 } }, default_params: { imageSize: '2K' } },
      { type: 'video' as const, cost_credits: null, cost_per_second: 8, max_duration_s: 15, supports: { audio_cps: 2, cps_by_resolution: { '1080p': 12 } }, default_params: { duration: 5, resolution: '720p' } },
      { type: 'video' as const, cost_credits: 36, cost_per_second: null, max_duration_s: 9, supports: { credits_by_duration: { '9': 60 } }, default_params: { duration: 5 } },
      // Kling 3 عبر Replicate: جدول video_cost_per_second بمفاتيح الدقة والدقة+الصوت
      {
        type: 'video' as const,
        cost_credits: null,
        cost_per_second: 12,
        max_duration_s: 15,
        supports: { video_cost_per_second: { '720p': 12, '720p+audio': 18, '1080p': 16, '1080p+audio': 24, '4K': 30 } },
        default_params: { duration: 5, resolution: '720p' },
      },
    ]
    const opts = [
      {},
      { imageSize: '4K' as const },
      { duration: 10 },
      { duration: 9, audio: true },
      { duration: 5, resolution: '1080p', audio: true },
      { duration: 3, resolution: '480p', audio: true },
      { duration: 15, resolution: '4K', audio: true },
    ]
    for (const r of rows) for (const o of opts) expect(edgeModelCredits(r, o), JSON.stringify([r.type, o])).toBe(modelCredits(r, o))
  })
})
