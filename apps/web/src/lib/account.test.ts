import { describe, expect, it } from 'vitest'
import { monthStart, summarizeMonth } from './account'
import catalog from '../../../../content/catalog/models.generated.json'
import { affordableCount, defaultCost, type ModelRow } from './models'

describe('account', () => {
  it('summarizeMonth: المصروف من الخصومات المؤكدة فقط، والحجز لا يُحسب، والاسترداد يُعد', () => {
    const ledger = [
      { amount: 30, kind: 'grant' },
      { amount: -18, kind: 'hold' },
      { amount: -58, kind: 'charge' },
      { amount: -5, kind: 'charge' },
      { amount: 0, kind: 'refund' },
      { amount: 100, kind: 'bonus' },
    ]
    const assets = [
      { type: 'video', status: 'completed' },
      { type: 'image', status: 'completed' },
      { type: 'image', status: 'completed' },
      { type: 'video', status: 'failed' },
      { type: 'video', status: 'processing' },
    ]
    expect(summarizeMonth(ledger, assets)).toEqual({ images: 2, videos: 1, spent: 63, refunded: 1 })
    expect(summarizeMonth([], [])).toEqual({ images: 0, videos: 0, spent: 0, refunded: 0 })
  })

  it('monthStart: أول يوم في الشهر منتصف الليل', () => {
    const d = monthStart(new Date(2026, 9, 25, 14, 30))
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 1, 0])
  })

  it('affordableCount: بأرخص نموذج مسعّر في الكتالوج وتقريب للأسفل، وبلا نماذج null، والرصيد السالب صفر', () => {
    const rows = (catalog as unknown as { models: ModelRow[] }).models.filter((m) => (m as unknown as { enabled: boolean }).enabled)
    for (const type of ['image', 'video']) {
      const models = rows.filter((m) => m.type === type)
      const min = Math.min(...models.map(defaultCost).filter((c) => c > 0))
      expect(min, type).toBeGreaterThan(0)
      expect(affordableCount(models, min * 3 + min - 1), type).toBe(3)
      expect(affordableCount(models, min - 1), type).toBe(0)
    }
    expect(affordableCount([], 30)).toBeNull()
    expect(affordableCount(rows, -5)).toBe(0)
  })
})
