import { describe, expect, it } from 'vitest'
import { GENERATE_ERROR_CODES } from './types'
import { RESOLUTION_MULTIPLIER, applyModelResolution } from './pricing'
import { GENERATE_ERROR_CODES as EDGE_ERROR_CODES, ERROR_MESSAGES_AR } from '../../supabase/functions/_shared/types'
import { RESOLUTION_MULTIPLIER as EDGE_MULTIPLIER, applyModelResolution as edgeApplyModelResolution } from '../../supabase/functions/_shared/pricing'

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
