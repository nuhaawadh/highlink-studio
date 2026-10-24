import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/lib/auth'

/** حارس المسارات التي تتطلب جلسة. يحفظ المسار مع الاستعلام (?like=…) فترجع صفحة الدخول له بعد الدخول. */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="flex flex-1 items-center justify-center text-muted">…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}
