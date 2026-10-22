import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import ar from './ar.json'
import en from './en.json'

/**
 * i18n خفيف بلا مكتبة: قاموسان (ar/en)، مفاتيح بنقاط "nav.login"،
 * وتبديل الاتجاه RTL/LTR على <html>. القاعدة: لا نص عربي داخل JSX — كل النصوص هنا.
 */
export type Locale = 'ar' | 'en'
type Dict = typeof ar

const dicts: Record<Locale, Dict> = { ar, en: en as Dict }
const STORAGE_KEY = 'hl.locale'

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'en' ? 'en' : 'ar'
  } catch {
    return 'ar'
  }
}

function lookup(dict: Dict, key: string): string {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, dict)
  return typeof value === 'string' ? value : key
}

interface I18nContextValue {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: (key: string, vars?: Record<string, string | number>) => string
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)
  const dir: 'rtl' | 'ltr' = locale === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* التخزين المحلي قد يكون معطّلًا — لا شيء يعتمد عليه */
    }
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = lookup(dicts[locale], key)
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
      return s
    },
    [locale],
  )

  const value = useMemo(() => ({ locale, dir, t, setLocale }), [locale, dir, t, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
