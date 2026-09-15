'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Gamepad2, Menu, X, LogIn, UserPlus, LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import LanguageSwitcher from './LanguageSwitcher';

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
        className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          isActive(l.href)
            ? 'text-neon-cyan bg-neon-cyan/10'
            : 'text-gray-300 hover:text-white hover:bg-white/5'
        }`}
      >
        {l.label}
      </Link>
    ))}
    </>
  );

  return (
    <header className="sticky top-0 z-50 glass border-b border-neon-cyan/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-lg neon-btn flex items-center justify-center">
            <Gamepad2 size={20} />
          </div>
          <span className="font-[--font-orbitron] text-lg font-bold tracking-widest neon-text">
            CYBER<span className="text-white">-ZONE</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">{navItems}</nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              {user.role !== 'USER' && (
                <Link
                  href="/admin"
                  className="px-3 py-2 text-sm font-medium rounded-lg text-neon-green hover:bg-neon-green/10 flex items-center gap-1"
                >
                  <LayoutDashboard size={16} />
                  {t('admin')}
                </Link>
              )}
              <Link
                href="/dashboard"
                className={`px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-1 ${isActive('/dashboard') ? 'text-neon-cyan bg-neon-cyan/10' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
              >
                {t('dashboard')}
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
                className="px-3 py-2 text-sm font-medium rounded-lg text-gray-300 hover:text-white hover:bg-white/5 flex items-center gap-1"
              >
                <LogIn size={16} />
                {t('login')}
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-sm font-bold rounded-lg neon-btn flex items-center gap-1"
              >
                <UserPlus size={16} />
                {t('register')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-2">
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
              {user.role !== 'USER' && (
                <Link href="/admin" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-neon-green">{t('admin')}</Link>
              )}
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-gray-300">{t('dashboard')}</Link>
              <button onClick={() => { logout(); setMobileOpen(false); }} className="px-3 py-2 text-sm font-medium text-red-400 text-left">
                {t('logout')}
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setMobileOpen(false)} className="px-3 py-2 text-sm font-medium text-gray-300">{t('login')}</Link>
              <Link href="/register" onClick={() => setMobileOpen(false)} className="px-4 py-2 text-sm font-bold rounded-lg neon-btn text-center">{t('register')}</Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}