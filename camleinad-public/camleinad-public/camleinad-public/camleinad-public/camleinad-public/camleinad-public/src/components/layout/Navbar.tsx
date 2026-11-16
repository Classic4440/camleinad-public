import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useTheme, type SiteTheme } from '@/contexts/ThemeContext';
import { Moon, Sun, X } from 'lucide-react';
import CamLogo from '@/components/layout/CamLogo';
import Avatar from '@/components/ui/Avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/music', label: 'Music' },
  { href: '/news', label: 'News' },
];

function ThemeToggle() {
  const { theme, cycleTheme } = useTheme();
  const themeOrder: SiteTheme[] = ['paper', 'mist', 'ink', 'ember'];
  const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length];
  const Icon = theme === 'ink' || theme === 'ember' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
      className="w-9 h-9 inline-flex items-center justify-center rounded-lg glass border border-white/10 text-[#A8A8B3] hover:text-white hover:border-violet-400/40 transition-colors"
    >
      <Icon aria-hidden="true" className="w-4 h-4" />
    </button>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const { user, profile, isAdmin, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={cn(
          'fixed top-[var(--announcement-offset,0px)] left-0 right-0 z-50 transition-all duration-500',
          scrolled ? 'glass-strong shadow-lg shadow-black/30' : 'bg-transparent'
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <CamLogo />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={cn(
                    'relative px-4 py-2 text-sm font-medium transition-colors duration-200 rounded-lg',
                    pathname === link.href || pathname.startsWith(link.href + '/')
                      ? 'text-white'
                      : 'text-[#A8A8B3] hover:text-white'
                  )}
                >
                  {pathname === link.href && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 bg-white/10 rounded-lg"
                    />
                  )}
                  <span className="relative">{link.label}</span>
                </Link>
              ))}
            </nav>

            {/* Right actions */}
            <div className="hidden md:flex items-center gap-3">
              <ThemeToggle />
              {user ? (
                <div className="flex items-center gap-3">
                  {isAdmin && (
                    <Link
                      to="/admin"
                      className="px-3 py-1.5 text-xs font-medium rounded-lg glass border border-violet-500/30 text-violet-300 hover:text-white hover:border-violet-500/60 transition-all duration-200"
                    >
                      Admin
                    </Link>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" aria-label="Open account menu" title="Account menu" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--rule)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                        <Avatar src={profile?.avatar_url} name={profile?.display_name || profile?.username || user.username} size={32} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[60] w-48 max-w-[calc(100vw-2rem)] border-[var(--rule)] bg-[var(--base)] text-[var(--ink)]">
                      <DropdownMenuItem asChild className="cursor-pointer text-[var(--ink)] focus:bg-[var(--surface)] focus:text-[var(--ink)]">
                        <Link to="/profile">Profile</Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[var(--rule)]" />
                      <DropdownMenuItem onSelect={() => void logout()} className="cursor-pointer text-[var(--ink)] focus:bg-[var(--surface)] focus:text-[var(--ink)]">
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 hover:shadow-lg hover:shadow-violet-500/25"
                >
                  Sign In
                </Link>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className={cn('min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-[#A8A8B3] hover:text-white transition-colors', mobileOpen && 'invisible')}
                aria-label="Toggle menu"
                aria-expanded={mobileOpen}
                aria-controls="mobile-navigation"
              >
                <div className="w-5 h-4 flex flex-col justify-between">
                  <span className={cn('block h-0.5 bg-current transition-all duration-300', mobileOpen && 'rotate-45 translate-y-[7px]')} />
                  <span className={cn('block h-0.5 bg-current transition-all duration-300', mobileOpen && 'opacity-0')} />
                  <span className={cn('block h-0.5 bg-current transition-all duration-300', mobileOpen && '-rotate-45 -translate-y-[7px]')} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              id="mobile-navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-72 max-w-[calc(100vw-1rem)] glass-strong md:hidden flex flex-col px-6 pb-8"
            >
              <div className="flex min-h-16 items-center justify-between gap-4">
                <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setMobileOpen(false)}>
                  <CamLogo />
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="z-[60] inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[#A8A8B3] transition-colors hover:text-white"
                  aria-label="Close menu"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1 pt-4">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Link
                      to={link.href}
                      className={cn(
                        'block px-4 py-3 rounded-xl text-base font-medium transition-colors',
                        pathname === link.href ? 'bg-violet-500/20 text-white' : 'text-[#A8A8B3] hover:text-white hover:bg-white/5'
                      )}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>
              <div className="mt-8 flex flex-col gap-3">
                {user ? (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Open account menu" className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--rule)] px-4 py-2 text-left text-sm text-[var(--ink)]">
                          <Avatar src={profile?.avatar_url} name={profile?.display_name || profile?.username || user.username} size={32} />
                          <span className="min-w-0 flex-1 truncate">{profile?.display_name || profile?.username || user.username}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="top" align="end" className="z-[60] w-56 max-w-[calc(100vw-2rem)] border-[var(--rule)] bg-[var(--base)] text-[var(--ink)]">
                        <DropdownMenuItem asChild className="cursor-pointer text-[var(--ink)] focus:bg-[var(--surface)] focus:text-[var(--ink)]">
                          <Link to="/profile">Profile</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[var(--rule)]" />
                        <DropdownMenuItem onSelect={() => void logout()} className="cursor-pointer text-[var(--ink)] focus:bg-[var(--surface)] focus:text-[var(--ink)]">
                          Sign Out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {isAdmin && (
                      <Link to="/admin" className="px-4 py-3 rounded-xl text-center text-sm font-medium glass border border-violet-500/30 text-violet-300">
                        Admin Panel
                      </Link>
                    )}
                  </>
                ) : (
                  <Link to="/auth" className="px-4 py-3 rounded-xl text-center text-sm font-semibold bg-violet-600 text-white">
                    Sign In
                  </Link>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
