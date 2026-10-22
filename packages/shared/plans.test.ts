import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PLANS, SIGNUP_BONUS_CREDITS } from './plans'

// الحارس: الباقات في الواجهة والـseed لا يفترقان أبدًا (قاعدة CLAUDE.md: لا أخطاء في المال).
const root = path.resolve(import.meta.dirname, '../..')
const seed = readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8')
const migration = readFileSync(path.join(root, 'supabase/migrations/0001_init.sql'), 'utf8')

describe('PLANS ↔ seed.sql', () => {
  for (const p of PLANS) {
    it(`${p.id} يطابق صف seed`, () => {
      // ('starter',  'ستارتر',  'Starter',  250,  39,   329,  2, true,  1)
      const row = new RegExp(`\\('${p.id}',[^)]*\\)`).exec(seed)?.[0]
      expect(row, `صف ${p.id} غير موجود في seed.sql`).toBeTruthy()
      const nums = row!.split(',').map((s) => s.trim().replace(/'/g, ''))
      expect(Number(nums[3])).toBe(p.credits)
      expect(Number(nums[4])).toBe(p.priceMonthlySar)
      expect(nums[5] === 'null' ? null : Number(nums[5])).toBe(p.priceYearlySar)
      expect(Number(nums[6])).toBe(p.maxConcurrent)
      expect(nums[7] === 'true').toBe(p.privateByDefault)
    })
  }

  it('رصيد الترحيب يطابق handle_new_user', () => {
    expect(migration).toMatch(new RegExp(`\\b${SIGNUP_BONUS_CREDITS}\\b[\\s\\S]{0,80}'signup'`))
  })

  it('السعر السنوي أرخص من 12 شهرًا', () => {
    for (const p of PLANS) if (p.priceYearlySar) expect(p.priceYearlySar).toBeLessThan(p.priceMonthlySar * 12)
  })
})
