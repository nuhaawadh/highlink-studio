import { describe, expect, it } from 'vitest'
import { buildProviderInput } from './inputs'
import type { ModelRow } from './types'

/** صف nano-banana-pro كما في seed.sql (المخطط من Replicate) */
const nano: ModelRow = {
  id: 'nano-banana-pro',
  type: 'image',
  provider: 'replicate',
  provider_slug: 'google/nano-banana-pro',
  cost_credits: 11,
  cost_per_second: null,
  max_duration_s: null,
  enabled: true,
  supports: { resolution_multipliers: { '1K': 1, '2K': 1, '4K': 2 } },
  default_params: { imageSize: '2K', aspectRatio: '1:1' },
  input_schema: {
    required: ['prompt'],
    properties: {
      prompt: { type: 'string' },
      image_input: { type: 'array', maxItems: 14, default: [] },
      aspect_ratio: { type: 'string', enum: ['match_input_image', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] },
      resolution: { type: 'string', enum: ['1K', '2K', '4K'], default: '2K' },
      output_format: { type: 'string', enum: ['jpg', 'png'], default: 'jpg' },
      safety_filter_level: { type: 'string', enum: ['block_low_and_above', 'block_medium_and_above', 'block_only_high'] },
      allow_fallback_model: { type: 'boolean', default: false },
    },
  },
}

describe('buildProviderInput — من input_schema لا من كود لكل نموذج', () => {
  it('الافتراضيات: 2K، 1:1، PNG، مرشّح متوسط، لا نموذج بديل', () => {
    const { input, invalid } = buildProviderInput(nano, 'عطر على رخام', undefined, undefined)
    expect(invalid).toEqual([])
    expect(input).toEqual({
      prompt: 'عطر على رخام',
      image_input: [],
      aspect_ratio: '1:1',
      resolution: '2K',
      output_format: 'png',
      safety_filter_level: 'block_medium_and_above',
      allow_fallback_model: false,
    })
  })

  it('يمرّر النسبة والدقة المطلوبتين', () => {
    const { input } = buildProviderInput(nano, 'p', undefined, { aspectRatio: '9:16', imageSize: '4K' })
    expect(input.aspect_ratio).toBe('9:16')
    expect(input.resolution).toBe('4K')
  })

  it('مع مراجع وبلا نسبة → match_input_image، ويقصّ المراجع على maxItems', () => {
    const refs = Array.from({ length: 16 }, (_, i) => `https://x.test/${i}.png`)
    const { input } = buildProviderInput(nano, 'p', refs, undefined)
    expect(input.aspect_ratio).toBe('match_input_image')
    expect((input.image_input as string[]).length).toBe(14)
  })

  it('قيمة خارج enum تُرفض ولا تصل للمزوّد', () => {
    const { input, invalid } = buildProviderInput(nano, 'p', undefined, { imageSize: '8K' as never })
    expect(input.resolution).toBeUndefined()
    expect(invalid).toEqual([{ key: 'resolution', value: '8K', allowed: ['1K', '2K', '4K'] }])
  })

  it('نموذج بلا مخطط → البرومبت فقط (لا نرسل مفاتيح لا يعرفها)', () => {
    const bare: ModelRow = { ...nano, input_schema: null, default_params: {} }
    const { input } = buildProviderInput(bare, 'p', ['https://x.test/a.png'], { aspectRatio: '1:1', imageSize: '2K' })
    expect(input).toEqual({ prompt: 'p' })
  })
})
