import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Blocks, Clapperboard, Images, LayoutDashboard, Link as LinkIcon, Mail, Moon, Newspaper, SlidersHorizontal, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import CamLogo from '@/components/layout/CamLogo';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/releases', label: 'Releases', icon: Blocks },
  { href: '/admin/news', label: 'News', icon: Newspaper },
  { href: '/admin/videos', label: 'Videos', icon: Clapperboard },
  { href: '/admin/gallery', label: 'Gallery', icon: Images },
  { href: '/admin/messages', label: 'Messages', icon: Mail },
  { href: '/admin/site-content', label: 'Site Content', icon: SlidersHorizontal },
  { href: '/admin/social-links', label: 'Social Links', icon: LinkIcon },
];

function AdminThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const NextIcon = theme === 'paper' ? Moon : Sun;
  const nextTheme = theme === 'paper' ? 'INK' : 'PAPER';
  return <button type="button" onClick={cycleTheme} className="admin-theme-toggle" aria-label={`Switch to ${nextTheme} theme`}>
    <NextIcon aria-hidden="true" className="h-4 w-4" />
    <span>{nextTheme}</span>
  </button>;
}

export default function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, loading, navigate]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
    </div>
  );

  if (!user || !isAdmin) return null;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="admin-shell flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="admin-mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'admin-sidebar fixed top-0 left-0 bottom-0 w-64 z-50 border-r flex flex-col transition-transform duration-300 lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-white/8">
          <Link to="/" className="cam-logo-3" aria-label="CAM home">
            <CamLogo className="cam-logo-3--admin" />
          </Link>
          <span className="ml-2 text-xs text-[#72727E] font-medium uppercase tracking-wider">Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {NAV.map(item => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium mb-0.5 transition-colors duration-200',
                isActive(item.href, item.exact)
                  ? 'bg-violet-500/20 text-white border border-violet-500/20'
                  : 'text-[#A8A8B3] hover:text-white hover:bg-white/5'
              )}
            >
              <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/8">
          <AdminThemeToggle />
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-400 text-xs font-bold">
              A
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">Admin</p>
              <p className="text-xs text-[#72727E] truncate">CAM Platform</p>
            </div>
          </div>
          <Link to="/" className="block mt-2 text-xs text-[#72727E] hover:text-white transition-colors text-center py-2">
            ← View Public Site
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar mobile */}
        <header className="admin-mobile-header lg:hidden h-14 border-b flex items-center px-4 gap-3 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-[#A8A8B3]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <CamLogo className="cam-logo-3--admin" />
          <span className="text-sm font-semibold">Admin</span>
          <AdminThemeToggle />
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
