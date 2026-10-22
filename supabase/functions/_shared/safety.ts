/**
 * بوابة أمان البرومبت الرخيصة (المخطط §5 الخطوة 5، §15 الطبقة 2): قائمة كلمات عربية/إنجليزية بمطابقة الكلمة الكاملة
 * بعد التطبيع. ليست بديلًا عن مرشّح المزوّد (safety_filter_level) ولا عن المصنّف الآلي الذي يُضاف لاحقًا —
 * هدفها رفض الواضح قبل حجز الرصيد وقبل أن يصل للمزوّد.
 * لا يستورد شيئًا ولا يلمس Deno — يُختبر بـvitest.
 */

const BLOCKED_TERMS: readonly string[] = [
  // إنجليزي — جنسي صريح
  'nude', 'nudes', 'naked', 'topless', 'nsfw', 'porn', 'porno', 'pornographic', 'pornography', 'xxx', 'hentai', 'erotic', 'erotica',
  'sex', 'sexual', 'intercourse', 'genitals', 'genitalia', 'penis', 'vagina', 'orgasm', 'masturbation',
  // إنجليزي — أطفال
  'loli', 'lolita', 'shota', 'child porn', 'underage sex',
  // إنجليزي — عنف دموي صريح
  'gore', 'dismembered', 'dismemberment', 'beheaded', 'beheading', 'decapitated', 'decapitation', 'mutilated', 'mutilation',
  // عربي — جنسي صريح (بعد التطبيع: ة→ه، أإآ→ا، ى→ي، بلا تشكيل)
  'عاري', 'عاريه', 'عاريات', 'عراه', 'جنس', 'جنسي', 'جنسيه', 'اباحي', 'اباحيه', 'اباحيات', 'بورن', 'سكس', 'ممارسه الجنس', 'اعضاء تناسليه', 'قضيب', 'مهبل',
  // عربي — عنف دموي صريح
  'اشلاء', 'مقطوع الراس', 'قطع الراس', 'تقطيع الجثث', 'جثه مشوهه',
]

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

/** تطبيع: أحرف صغيرة، إزالة التشكيل والتطويل، توحيد الألف والتاء المربوطة والياء، وأي رمز غير حرفي/رقمي → مسافة */
export function normalizePrompt(input: string): string {
  return input
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const NORMALIZED_TERMS = BLOCKED_TERMS.map((t) => normalizePrompt(t)).filter(Boolean)

export interface SafetyResult {
  unsafe: boolean
  /** المصطلح المطابق (مطبّعًا) للتسجيل في السجلات — لا يُعرض للمستخدم */
  term?: string
}

export function checkPromptSafety(prompt: string): SafetyResult {
  const padded = ` ${normalizePrompt(prompt)} `
  for (const term of NORMALIZED_TERMS) {
    if (padded.includes(` ${term} `)) return { unsafe: true, term }
  }
  return { unsafe: false }
}
