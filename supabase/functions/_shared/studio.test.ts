import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isOwnReferenceUrl, renderStudioPrompt, renderTemplate, sanitizeUserText, selectOutputs, StudioRecipeSchema } from './studio'

const root = resolve(__dirname, '../../..')
const recipe = StudioRecipeSchema.parse(JSON.parse(readFileSync(resolve(root, 'content/studios/product-shot.json'), 'utf-8')))

describe('product-shot recipe', () => {
  it('تمر بمخطط الوصفة والـpreset الافتراضي موجود', () => {
    expect(recipe.presets[recipe.defaults.preset]).toBeDefined()
    expect(recipe.model).toBe('nano-banana-pro')
  })

  it('الحزمة الافتراضية: بطل 1:1 + بوست 4:5 + ستوري 9:16، والحد 6', () => {
    expect(selectOutputs(recipe).map((o) => [o.key, o.aspect_ratio])).toEqual([
      ['hero', '1:1'],
      ['post', '4:5'],
      ['story', '9:16'],
    ])
    expect(recipe.outputs.length).toBeLessThanOrEqual(6)
  })

  it('البرومبت بالأقسام المسمّاة، التوقيع، الزاوية، والنفي في [AVOID]', () => {
    const p = renderStudioPrompt(recipe, { preset: 'luxury', output: selectOutputs(recipe, ['post'])[0] })
    for (const section of ['[SUBJECT]', '[COMPOSITION]', '[LIGHTING]', '[LENS]', '[PALETTE]', '[QUALITY]', '[AVOID]']) {
      expect(p).toContain(section)
    }
    expect(p).toContain(recipe.presets.luxury.signature)
    expect(p).toContain('straight-on eye level')
    expect(p).toContain('pseudo-Arabic glyphs')
    expect(p).not.toContain('[TYPOGRAPHY]')
    expect(p).not.toContain('[SCENE]')
    expect(p).not.toMatch(/\{\{|\}\}/)
  })

  it('المشهد والنص العربي يظهران فقط عند طلبهما، والنص حرفيًا بلا علامات اقتباس', () => {
    const p = renderStudioPrompt(recipe, {
      preset: 'ramadan',
      scene: 'على طاولة خشبية في مجلس',
      text: 'عرض رمضان 30%',
      output: selectOutputs(recipe)[0],
    })
    expect(p).toContain('[SCENE] على طاولة خشبية في مجلس')
    expect(p).toContain('exactly these Arabic words and nothing else: عرض رمضان 30%')
    expect(p).toContain('no quotation marks')
    expect(p).not.toContain('«')
  })

  it('preset أو مقاس مجهول يُرفض', () => {
    expect(() => renderStudioPrompt(recipe, { preset: 'nope', output: recipe.outputs[0] })).toThrow()
    expect(() => selectOutputs(recipe, ['hero', 'nope'])).toThrow()
    expect(() => selectOutputs(recipe, ['hero', 'hero'])).toThrow()
  })
})

describe('seed.sql ↔ content/studios (scripts/sync-studios.py)', () => {
  it('pipeline في seed يطابق الوصفة حرفيًا، والتكلفة من النموذج (null)', () => {
    const seed = readFileSync(resolve(root, 'supabase/seed.sql'), 'utf-8')
    const m = seed.match(/\('product-shot',[^\n]*\n\s*'(.*?)'::jsonb, (null|\d+), (true|false), \d+\)/)
    expect(m, 'product-shot row in the generated studios block').not.toBeNull()
    const fromSeed = JSON.parse(m![1].replace(/''/g, "'"))
    const fromFile = JSON.parse(readFileSync(resolve(root, 'content/studios/product-shot.json'), 'utf-8'))
    expect(fromSeed).toEqual(fromFile)
    expect(m![2]).toBe('null')
  })
})

describe('sanitizeUserText / renderTemplate', () => {
  it('يزيل أقواس القالب وعلامات الاقتباس والأسطر، ويقصّ على الحد', () => {
    expect(sanitizeUserText('a {{text}} «b»\nc', 100)).toBe('a text b c')
    expect(sanitizeUserText('x'.repeat(50), 10)).toBe('x'.repeat(10))
    expect(sanitizeUserText(undefined, 10)).toBe('')
  })

  it('الاحتياطي والمتغير المجهول والشرط', () => {
    expect(renderTemplate('A {{x|def}} B {{y}} C', {})).toBe('A def B  C')
    expect(renderTemplate('{{#if t}}T={{t}}{{/if}}\nZ', { t: 'q' })).toBe('T=q\nZ')
    expect(renderTemplate('{{#if t}}T{{/if}}\nZ', {})).toBe('Z')
  })

  it('النفي يُضاف كسطر إن لم يوجد [AVOID]', () => {
    expect(renderTemplate('[SUBJECT] x', {}, 'blurry')).toBe('[SUBJECT] x\n[AVOID] blurry.')
  })
})

describe('isOwnReferenceUrl', () => {
  const project = 'https://abc.supabase.co'
  const uid = '11111111-1111-1111-1111-111111111111'
  const ok = `${project}/storage/v1/object/public/media/up/${uid}/p.png`
  it('يقبل up/ وu/ للمستخدم نفسه فقط', () => {
    expect(isOwnReferenceUrl(ok, project, uid)).toBe(true)
    expect(isOwnReferenceUrl(`${project}/storage/v1/object/public/media/u/${uid}/a.png`, project, uid)).toBe(true)
  })
  it('يرفض مستخدمًا آخر، مضيفًا آخر، http، استعلامًا، أو مسارًا ملتفًا', () => {
    expect(isOwnReferenceUrl(ok.replace(uid, '22222222-2222-2222-2222-222222222222'), project, uid)).toBe(false)
    expect(isOwnReferenceUrl(ok.replace('abc.supabase.co', 'evil.test'), project, uid)).toBe(false)
    expect(isOwnReferenceUrl(ok.replace('https', 'http'), project, uid)).toBe(false)
    expect(isOwnReferenceUrl(`${ok}?x=1`, project, uid)).toBe(false)
    expect(isOwnReferenceUrl(`${project}/storage/v1/object/public/media/up/${uid}/../other/p.png`, project, uid)).toBe(false)
    expect(isOwnReferenceUrl(`${project}/storage/v1/object/public/media/up/${uid}/%2e%2e/x.png`, project, uid)).toBe(false)
    expect(isOwnReferenceUrl('not a url', project, uid)).toBe(false)
    // B33-T3: ترميز % معطوب لا يرمي (كان خطأً داخليًا بدل رفض)
    expect(() => isOwnReferenceUrl(`${ok.replace('p.png', '%E0%A4%A.png')}`, project, uid)).not.toThrow()
    expect(isOwnReferenceUrl(`${ok.replace('p.png', '%E0%A4%A.png')}`, project, uid)).toBe(false)
  })
})
