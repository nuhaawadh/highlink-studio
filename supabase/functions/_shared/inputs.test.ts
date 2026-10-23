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

/** مخططات fal (ADR 0005) — الأسماء تختلف عن Replicate: image_url/image_urls، duration نصية أو "8s"، image_size بدل aspect_ratio، generate_audio */
const falBase: Omit<ModelRow, 'input_schema' | 'type' | 'default_params'> = {
  id: 'x',
  provider: 'fal',
  provider_slug: 'x/y',
  cost_credits: null,
  cost_per_second: 8,
  max_duration_s: 15,
  enabled: true,
  supports: {},
}

const klingT2v: ModelRow = {
  ...falBase,
  type: 'video',
  default_params: { duration: 5, aspectRatio: '16:9' },
  input_schema: {
    required: [],
    properties: {
      prompt: { anyOf: [{ type: 'string', maxLength: 2500 }, { type: 'null' }] },
      duration: { type: 'string', enum: ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'], default: '5' },
      aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' },
      generate_audio: { type: 'boolean', default: true },
      negative_prompt: { type: 'string', default: 'blur, distort, and low quality' },
      cfg_scale: { type: 'number', minimum: 0, maximum: 1, default: 0.5 },
      enable_safety_checker: { type: 'boolean', default: true },
      multi_prompt: { anyOf: [{ type: 'array' }, { type: 'null' }] },
    },
  },
}

const klingI2v: ModelRow = {
  ...klingT2v,
  input_schema: {
    required: ['prompt', 'image_url'],
    properties: {
      prompt: { type: 'string' },
      image_url: { type: 'string' },
      end_image_url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      duration: { type: 'string', enum: ['5', '10'], default: '5' },
      resolution: { type: 'string', enum: ['720p', '1080p'], default: '720p' },
      generate_audio: { type: 'boolean', default: false },
    },
  },
}

const veo: ModelRow = {
  ...klingT2v,
  input_schema: {
    required: ['prompt'],
    properties: {
      prompt: { type: 'string' },
      duration: { type: 'string', enum: ['4s', '6s', '8s'], default: '8s' },
      resolution: { type: 'string', enum: ['720p', '1080p'], default: '720p' },
      aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], default: '16:9' },
      generate_audio: { type: 'boolean', default: true },
    },
  },
}

const fluxT2i: ModelRow = {
  ...falBase,
  type: 'image',
  cost_credits: 3,
  cost_per_second: null,
  max_duration_s: null,
  default_params: { imageSize: '1K', aspectRatio: '1:1' },
  input_schema: {
    required: ['prompt'],
    properties: {
      prompt: { type: 'string' },
      image_size: {
        anyOf: [{ type: 'string', enum: ['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] }, { type: 'object' }],
        default: 'landscape_4_3',
      },
      num_images: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
      output_format: { type: 'string', enum: ['jpeg', 'png'], default: 'jpeg' },
      enable_safety_checker: { type: 'boolean', default: true },
      seed: { type: 'integer' },
      sync_mode: { type: 'boolean', default: false },
    },
  },
}

const seedreamEdit: ModelRow = {
  ...fluxT2i,
  input_schema: {
    required: ['prompt', 'image_urls'],
    properties: {
      prompt: { type: 'string' },
      image_urls: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      image_size: { type: 'string', enum: ['square_hd', 'portrait_16_9', 'landscape_16_9'], default: 'square_hd' },
      num_images: { type: 'integer', default: 1 },
    },
  },
}

describe('buildProviderInput — مخططات fal (ADR 0005)', () => {
  it('Kling نص→فيديو: المدة نصية من enum، النسبة، الصوت، الفاحص؛ لا يلمس negative/cfg/multi_prompt', () => {
    const { input, invalid } = buildProviderInput(klingT2v, 'جمل يمشي في العلا', undefined, { duration: 10, aspectRatio: '9:16', audio: true })
    expect(invalid).toEqual([])
    expect(input).toEqual({ prompt: 'جمل يمشي في العلا', duration: '10', aspect_ratio: '9:16', generate_audio: true, enable_safety_checker: true })
  })

  it('بلا خيارات → مدة default_params ونسبته؛ الصوت لا يُرسل إن لم يُطلب (يبقى افتراض المزوّد)', () => {
    const { input } = buildProviderInput(klingT2v, 'p', undefined, undefined)
    expect(input.duration).toBe('5')
    expect(input.aspect_ratio).toBe('16:9')
    expect(input).not.toHaveProperty('generate_audio')
  })

  it('مدة خارج enum تُرفض قبل الحجز', () => {
    const { input, invalid } = buildProviderInput(klingI2v, 'p', ['https://x/a.png'], { duration: 7 })
    expect(input.duration).toBeUndefined()
    expect(invalid).toEqual([{ key: 'duration', value: 7, allowed: ['5', '10'] }])
  })

  it('صورة→فيديو: image_url = أول مرجع، end_image_url = الثاني، الدقة من config.resolution', () => {
    const { input } = buildProviderInput(klingI2v, 'p', ['https://x/a.png', 'https://x/b.png'], { duration: 5, resolution: '1080p' })
    expect(input.image_url).toBe('https://x/a.png')
    expect(input.end_image_url).toBe('https://x/b.png')
    expect(input.resolution).toBe('1080p')
  })

  it('Veo: المدة بصيغة "8s"', () => {
    const { input } = buildProviderInput(veo, 'p', undefined, { duration: 6 })
    expect(input.duration).toBe('6s')
  })

  it('Flux: النسبة → image_size المسمّى، صورة واحدة، PNG، الفاحص؛ 4:5 بلا اسم → أبعاد صريحة', () => {
    const a = buildProviderInput(fluxT2i, 'p', undefined, { aspectRatio: '16:9' })
    expect(a.input).toEqual({ prompt: 'p', image_size: 'landscape_16_9', num_images: 1, output_format: 'png', enable_safety_checker: true })
    const b = buildProviderInput(fluxT2i, 'p', undefined, { aspectRatio: '4:5' })
    expect(b.input.image_size).toEqual({ width: 1024, height: 1280 })
    expect(b.invalid).toEqual([])
  })

  it('image_size بـenum فقط (بلا كائن): نسبة بلا اسم تُرفض', () => {
    const { input, invalid } = buildProviderInput(seedreamEdit, 'p', ['https://x/a.png'], { aspectRatio: '4:5' })
    expect(input.image_size).toBeUndefined()
    expect(invalid[0]?.key).toBe('image_size')
  })

  it('تعديل بالمراجع: image_urls مقصوصة على maxItems؛ النسبة الافتراضية من default_params', () => {
    const refs = Array.from({ length: 12 }, (_, i) => `https://x/${i}.png`)
    const { input } = buildProviderInput(seedreamEdit, 'p', refs, undefined)
    expect((input.image_urls as string[]).length).toBe(10)
    expect(input.image_size).toBe('square_hd')
  })

  it('البذرة تُمرَّر فقط إن عرفها المخطط', () => {
    expect(buildProviderInput(fluxT2i, 'p', undefined, { seed: 42 }).input.seed).toBe(42)
    expect(buildProviderInput(klingT2v, 'p', undefined, { seed: 42 }).input).not.toHaveProperty('seed')
  })

  it('MiniMax: الدقة "768P" تُقبل من "768p"، والحقل المطلوب prompt_expansion_mode يُملأ بافتراض المزوّد', () => {
    const h3: ModelRow = {
      ...klingT2v,
      input_schema: {
        required: ['prompt', 'prompt_expansion_mode'],
        properties: {
          prompt: { type: 'string' },
          prompt_expansion_mode: { type: 'string', default: 'balanced' },
          duration: { type: 'number', minimum: 0.92, maximum: 15, default: 5 },
          resolution: { type: 'string', enum: ['480P', '768P', '1080P'], default: '768P' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
        },
      },
    }
    const { input, invalid } = buildProviderInput(h3, 'p', undefined, { duration: 6, resolution: '1080p' as never })
    expect(invalid).toEqual([])
    expect(input).toEqual({ prompt: 'p', duration: 6, resolution: '1080P', aspect_ratio: '16:9', prompt_expansion_mode: 'balanced' })
    // مدة خارج الحدود الرقمية تُرفض
    expect(buildProviderInput(h3, 'p', undefined, { duration: 20 }).invalid[0]?.key).toBe('duration')
  })

  it('لا يملأ حقل مرجع مطلوبًا بصورة المثال الافتراضية من fal', () => {
    const bria: ModelRow = {
      ...fluxT2i,
      input_schema: {
        required: ['image_url', 'mode'],
        properties: {
          image_url: { type: 'string', default: 'https://storage.googleapis.com/falserverless/example.png' },
          mode: { type: 'string', default: 'high_control' },
        },
      },
    }
    const { input } = buildProviderInput(bria, 'p', undefined, undefined)
    expect(input).not.toHaveProperty('image_url')
    expect(input.mode).toBe('high_control')
    expect(input).not.toHaveProperty('prompt')
  })
})
