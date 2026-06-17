import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import MobileBottomNav from './MobileBottomNav'
import AuthModal from '../auth/AuthModal'
import LandingPage from '../landing/LandingPage'
import AdminPage from '../admin/AdminPage'
import DashboardPage from '../dashboard/DashboardPage'
import ChannelsPage from '../channels/ChannelsPage'
import EditorPage from '../editor/EditorPage'
import MediaLibraryPage from '../media/MediaLibraryPage'
import ProfilePage from '../profile/ProfilePage'
import PricingPage from '../pricing/PricingPage'

const SEEN_KEY = 'gorila_seen_app'

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="text-on-surface">
      <h1 className="text-headline-lg font-bold">{title}</h1>
      <p className="text-on-surface-variant mt-2">Coming soon...</p>
    </div>
  )
}

function MediaPage() {
  return <MediaLibraryPage />
}

function PipelinePage() {
  return <PlaceholderPage title="Pipeline Status" />
}

/* ── Redirect helper: unauthenticated users who haven't seen the app go to /landing ── */

function DefaultRedirect() {
  const { user } = useAuth()
  const hasSeen = localStorage.getItem(SEEN_KEY)

  if (!user && !hasSeen) {
    return <Navigate to="/landing" replace />
  }
  return <Navigate to="/dashboard" replace />
}

/* ── App Shell ── */

export default function AppShell() {
  const { showAuthModal, user } = useAuth()
  const location = useLocation()
  const nav = useNavigate()

  /* Landing page — but if user just logged in, redirect to dashboard */
  if (location.pathname === '/landing') {
    if (user) {
      localStorage.setItem(SEEN_KEY, '1')
      return <Navigate to="/dashboard" replace />
    }
    return (
      <>
        <LandingPage />
        {showAuthModal && <AuthModal />}
      </>
    )
  }

  return (
    <div className="flex min-h-screen bg-surface-container-lowest">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <TopNav />
        <div className="flex-1 p-6 lg:p-8 pb-20 md:pb-6">
          <Routes>
            <Route path="/" element={<DefaultRedirect />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/editor/:filename" element={<EditorPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      <MobileBottomNav />

      {showAuthModal && <AuthModal />}
    </div>
  )
}
