import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// الخطوط مستضافة مع التطبيق (دليل الهوية: Tajawal للعربي والإنجليزي، IBM Plex Mono لأسماء الأدوات) —
// لا اعتماد على Google Fonts وقت التشغيل: الخط يطلع صح حتى لو حُجب fonts.googleapis.com أو تأخر.
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/500.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './index.css'
import App from './App'
import { I18nProvider } from '@/i18n'
import { AuthProvider } from '@/lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
