import { describe, expect, it } from 'vitest'
import { checkPromptSafety } from './safety'

/** بوابة الأمان الرخيصة (المخطط §5 الخطوة 5): قائمة كلمات عربية/إنجليزية مع تطبيع. المصنّف الآلي يُضاف لاحقًا. */
describe('prompt safety wordlist', () => {
  it('يسمح ببرومبتات المنتجات والإعلانات العادية', () => {
    expect(checkPromptSafety('صورة عطر فاخر على رخام أبيض بإضاءة ناعمة').unsafe).toBe(false)
    expect(checkPromptSafety('A luxury perfume bottle on white marble, soft studio light').unsafe).toBe(false)
    expect(checkPromptSafety('عرض خاص لليوم الوطني — خصم 30%').unsafe).toBe(false)
  })

  it('يرفض المحتوى الجنسي الصريح بالعربية والإنجليزية', () => {
    expect(checkPromptSafety('a nude woman on the beach').unsafe).toBe(true)
    expect(checkPromptSafety('صورة امرأة عارية').unsafe).toBe(true)
  })

  it('يرفض أي إشارة جنسية لأطفال حتى بتغيير الحروف', () => {
    expect(checkPromptSafety('NUDE child').unsafe).toBe(true)
    expect(checkPromptSafety('طِفْلة عاريه').unsafe).toBe(true)
  })

  it('يرفض العنف الدموي الصريح', () => {
    expect(checkPromptSafety('gore, dismembered body, blood everywhere').unsafe).toBe(true)
  })

  it('لا يرفض كلمات بريئة تحوي جزءًا من كلمة محظورة', () => {
    expect(checkPromptSafety('Scunthorpe town centre at sunset').unsafe).toBe(false)
    expect(checkPromptSafety('nudge the lighting slightly warmer').unsafe).toBe(false)
  })

  it('يرجع المصطلح المطابق للتسجيل', () => {
    const r = checkPromptSafety('explicit nude photo')
    expect(r.unsafe).toBe(true)
    expect(r.term).toBe('nude')
  })
})
