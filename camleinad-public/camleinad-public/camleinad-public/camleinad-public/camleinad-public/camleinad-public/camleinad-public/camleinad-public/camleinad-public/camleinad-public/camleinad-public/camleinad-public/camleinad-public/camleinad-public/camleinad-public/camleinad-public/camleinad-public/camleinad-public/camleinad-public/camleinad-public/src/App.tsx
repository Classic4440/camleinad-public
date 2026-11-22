import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
import Layout from '@/components/layout/Layout';
import SiteMetadata from '@/components/layout/SiteMetadata';

const HomePage = lazy(() => import('@/pages/Home'));
const MusicPage = lazy(() => import('@/pages/Music'));
const ReleaseDetailPage = lazy(() => import('@/pages/ReleaseDetail'));
const AboutPage = lazy(() => import('@/pages/About'));
const VideosPage = lazy(() => import('@/pages/Videos'));
const GalleryPage = lazy(() => import('@/pages/Gallery'));
const NewsPage = lazy(() => import('@/pages/News'));
const NewsDetailPage = lazy(() => import('@/pages/NewsDetail'));
const ContactPage = lazy(() => import('@/pages/Contact'));
const AuthPage = lazy(() => import('@/pages/Auth'));
const ProfilePage = lazy(() => import('@/pages/Profile'));
const FanWallPage = lazy(() => import('@/pages/FanWall'));
const PressPage = lazy(() => import('@/pages/Press'));
const NotFoundPage = lazy(() => import('@/pages/NotFound'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const ReleasesAdmin = lazy(() => import('@/pages/admin/Releases'));
const NewsAdmin = lazy(() => import('@/pages/admin/NewsAdmin'));
const VideosAdmin = lazy(() => import('@/pages/admin/VideosAdmin'));
const GalleryAdmin = lazy(() => import('@/pages/admin/GalleryAdmin'));
const MessagesAdmin = lazy(() => import('@/pages/admin/MessagesAdmin'));
const SiteContent = lazy(() => import('@/pages/admin/SiteContent'));
const SocialLinksAdmin = lazy(() => import('@/pages/admin/SocialLinksAdmin'));

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <BrowserRouter>
          <SiteMetadata />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--base)',
                border: '1px solid var(--rule)',
                color: 'var(--ink)',
              },
            }}
          />
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading page"><div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" /></div>}>
            <Routes>
              {/* Auth */}
              <Route path="/auth" element={<Layout><AuthPage /></Layout>} />
              <Route path="/profile" element={<Layout><ProfilePage /></Layout>} />
              <Route path="/fan-wall" element={<Layout><FanWallPage /></Layout>} />
              <Route path="/press" element={<Layout><PressPage /></Layout>} />

              {/* Main public routes */}
              <Route path="/" element={<Layout><HomePage /></Layout>} />
              <Route path="/music" element={<Layout><MusicPage /></Layout>} />
              <Route path="/music/:slug" element={<Layout><ReleaseDetailPage /></Layout>} />
              <Route path="/about" element={<Layout><AboutPage /></Layout>} />
              <Route path="/videos" element={<Layout><VideosPage /></Layout>} />
              <Route path="/gallery" element={<Layout><GalleryPage /></Layout>} />
              <Route path="/news" element={<Layout><NewsPage /></Layout>} />
              <Route path="/news/:slug" element={<Layout><NewsDetailPage /></Layout>} />
              <Route path="/contact" element={<Layout><ContactPage /></Layout>} />

              {/* Admin routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="releases" element={<ReleasesAdmin />} />
                <Route path="news" element={<NewsAdmin />} />
                <Route path="videos" element={<VideosAdmin />} />
                <Route path="gallery" element={<GalleryAdmin />} />
                <Route path="messages" element={<MessagesAdmin />} />
                <Route path="site-content" element={<SiteContent />} />
                <Route path="social-links" element={<SocialLinksAdmin />} />
              </Route>

              {/* 404. */}
              <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </PlayerProvider>
    </AuthProvider>
  );
}
