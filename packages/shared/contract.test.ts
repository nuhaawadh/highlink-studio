import { describe, expect, it } from 'vitest'
import { API_ERROR_CODES, GENERATE_ERROR_CODES } from './types'
import { RESOLUTION_MULTIPLIER, applyModelResolution, videoCredits } from './pricing'
import {
  API_ERROR_CODES as EDGE_API_ERROR_CODES,
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES_AR,
  GENERATE_ERROR_CODES as EDGE_ERROR_CODES,
  ERROR_MESSAGES_AR,
} from '../../supabase/functions/_shared/types'
import {
  RESOLUTION_MULTIPLIER as EDGE_MULTIPLIER,
  applyModelResolution as edgeApplyModelResolution,
  videoCredits as edgeVideoCredits,
} from '../../supabase/functions/_shared/pricing'

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

  it('تسعير الفيديو متطابق بين النسختين', () => {
    const supports = { video_cost_per_second: { '720p': 12, '720p+audio': 18, '1080p': 16, '1080p+audio': 24 } }
    for (const d of [3, 5, 10, 15]) {
      for (const res of ['720p', '1080p', '480p', undefined]) {
        for (const audio of [false, true]) {
          for (const s of [supports, undefined]) {
            expect(edgeVideoCredits(12, d, res, audio, s), `${d} ${res} ${audio}`).toBe(videoCredits(12, d, res, audio, s))
          }
        }
      }
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
})
