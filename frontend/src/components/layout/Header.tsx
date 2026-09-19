'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Menu, X, LogIn, LayoutDashboard, Crown, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import Logo from '@/components/brand/Logo';

export default function Header() {
  const t = useTranslations('nav');
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const links = [
    { href: '/', label: t('home') },
    { href: '/rooms', label: t('rooms') },
    { href: '/news', label: t('news') },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  const navItems = (
    <>{links.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        onClick={() => setMobileOpen(false)}
        className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
          isActive(l.href)
            ? 'text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20'
            : 'text-gray-300 hover:text-white hover:bg-white/5 border border-transparent'
        }`}
      >
        {l.label}
      </Link>
    ))}
    </>
  );

  const userInitial = (() => {
    const name = user?.fullName || 'U';
    return name.trim()[0]?.toUpperCase() || 'U';
  })();

  return (
    <header className="sticky top-0 z-50 glass border-b border-neon-cyan/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <Logo size={34} />
          <span className="font-[--font-orbitron] font-bold tracking-widest text-lg">
            CYBER<span className="text-neon-cyan">-ZONE</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">{navItems}</nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
          {user ? (
            <>
              {user.role === 'SUPER_ADMIN' && (
                <Link
                  href="/super-admin"
                  className="px-3 py-2 text-sm font-medium rounded-lg text-yellow-300 hover:bg-yellow-400/10 flex items-center gap-1"
                >
                  <Crown size={16} />
                  {t('superAdmin')}
                </Link>
              )}
              {user.role === 'ADMIN' && (
                <Link
                  href="/admin"
                  className="px-3 py-2 text-sm font-medium rounded-lg text-neon-green hover:bg-neon-green/10 flex items-center gap-1"
                >
                  <LayoutDashboard size={16} />
                  {t('admin')}
                </Link>
              )}
              <Link
                href="/chat"
                title="Xabarlar"
                aria-label="Xabarlar"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isActive('/chat')
                    ? 'text-neon-cyan bg-neon-cyan/15 border border-neon-cyan/30'
                    : 'text-gray-200 bg-cyber-800 border border-white/10 hover:border-neon-cyan/40'
                }`}
              >
                <MessageSquare size={16} />
              </Link>
              <Link
                href="/dashboard"
                title={t('dashboard')}
                aria-label={t('dashboard')}
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                  isActive('/dashboard')
                    ? 'text-neon-cyan bg-neon-cyan/15 border border-neon-cyan/30'
                    : 'text-gray-200 bg-cyber-800 border border-white/10 hover:border-neon-cyan/40'
                }`}
              >
                {userInitial}
              </Link>
              <button
                onClick={logout}
                className="px-3 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-bold rounded-xl neon-btn flex items-center gap-1"
              >
                <LogIn size={16} />
                {t('login')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 rounded-lg text-gray-300 hover:bg-white/5"
            aria-label="Menu"
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden glass border-t border-neon-cyan/15 px-4 py-3 flex flex-col gap-1">
          {navItems}
          <div className="h-px bg-neon-cyan/15 my-2" />
          {user ? (
            <>
              {user.role === 'SUPER_ADMIN' && (
                <Link href="/super-admin" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-yellow-300">{t('superAdmin')}</Link>
              )}
              {user.role === 'ADMIN' && (
                <Link href="/admin" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-neon-green">{t('admin')}</Link>
              )}
              <Link href="/chat" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-gray-300 flex items-center gap-2"><MessageSquare size={16} /> Xabarlar</Link>
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-gray-300">{t('dashboard')}</Link>
              <button onClick={() => { logout(); setMobileOpen(false); }} className="px-3 py-2 text-sm font-medium text-red-400 text-left">
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setMobileOpen(false)} className="px-4 py-2 text-sm font-bold rounded-lg neon-btn text-center">{t('login')}</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}