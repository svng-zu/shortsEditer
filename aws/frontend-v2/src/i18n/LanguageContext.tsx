import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { ko, en, Translations, TranslationKey } from './translations'

type Lang = 'ko' | 'en'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ko',
  setLang: () => {},
  t: ko,
})

const LANG_KEY = 'gorilla_lang'
const TRANSLATIONS: Record<Lang, Translations> = { ko, en }

function getSavedLang(): Lang | null {
  const saved = localStorage.getItem(LANG_KEY)
  if (saved === 'ko' || saved === 'en') return saved
  return null
}

function detectLang(): Lang {
  const browserLang = navigator.language || ''
  if (browserLang.startsWith('en')) return 'en'
  return 'ko'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getSavedLang() ?? 'ko')
  const [detected, setDetected] = useState(false)

  useEffect(() => {
    // AWS IP 오감지로 영어 저장된 경우 1회 리셋
    const resetKey = 'gorilla_lang_reset_v1'
    if (!localStorage.getItem(resetKey)) {
      localStorage.removeItem(LANG_KEY)
      localStorage.setItem(resetKey, '1')
    }

    const saved = getSavedLang()
    if (saved) {
      setDetected(true)
      return
    }
    const detected = detectLang()
    setLangState(detected)
    localStorage.setItem(LANG_KEY, detected)
    setDetected(true)
  }, [])

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang)
    localStorage.setItem(LANG_KEY, newLang)
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: TRANSLATIONS[lang] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

export function useT() {
  return useContext(LanguageContext).t
}

export type { Lang, TranslationKey }
