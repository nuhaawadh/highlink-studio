import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AccountPage } from '@/app/AccountPage'
import { ContactPage } from '@/app/ContactPage'
import { HomePage } from '@/app/HomePage'
import { ImageGeneratePage } from '@/app/ImageGeneratePage'
import { VideoGeneratePage } from '@/app/VideoGeneratePage'
import { LibraryPage } from '@/app/LibraryPage'
import { LegalCenterPage, LegalPage } from '@/app/LegalPage'
import { LoginPage } from '@/app/LoginPage'
import { PlaceholderPage } from '@/app/PlaceholderPage'
import { PricingPage } from '@/app/PricingPage'
import { RequireAuth } from '@/app/RequireAuth'

/**
 * خريطة المسارات (المخطط §8). المرحلة 1: الرئيسية، الدخول، الباقات، توليد الصور، المكتبة حقيقية؛ الباقي placeholders مرقّمة بمرحلتها.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="terms" element={<LegalPage kind="terms" />} />
          <Route path="refund-policy" element={<LegalPage kind="refund" />} />
          <Route path="privacy" element={<LegalPage kind="privacy" />} />
          <Route path="data-deletion" element={<LegalPage kind="deletion" />} />
          <Route path="legal" element={<LegalCenterPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="templates" element={<PlaceholderPage titleKey="nav.templates" phase={2} />} />
          <Route element={<RequireAuth />}>
            <Route path="library" element={<LibraryPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="image-generate" element={<ImageGeneratePage />} />
            <Route path="video-generate" element={<VideoGeneratePage />} />
            <Route path="studio/product" element={<PlaceholderPage titleKey="studios.product" phase={2} />} />
            <Route path="studio/ads" element={<PlaceholderPage titleKey="studios.ads" phase={2} />} />
            <Route path="studio/ugc" element={<PlaceholderPage titleKey="studios.ugc" phase={2} />} />
          </Route>
          <Route path="*" element={<PlaceholderPage titleKey="errors.generic" phase={0} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
