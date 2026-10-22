import { describe, expect, it } from 'vitest'
import { GENERATE_ERROR_CODES } from './types'
import { GENERATE_ERROR_CODES as EDGE_ERROR_CODES, ERROR_MESSAGES_AR } from '../../supabase/functions/_shared/types'

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
})
