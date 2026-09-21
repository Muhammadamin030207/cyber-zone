'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LogIn, LayoutDashboard, Crown, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useChatUnread } from '@/hooks/useChatUnread';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import Logo from '@/components/brand/Logo';
import { confirmDialog } from '@/lib/confirm';

export default function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const unread = useChatUnread();

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Tizimdan chiqish',
      message: 'Hisobingizdan chiqishni tasdiqlaysizmi?',
      confirmLabel: 'Chiqish',
      cancelLabel: 'Bekor qilish',
      danger: true,
    });
    if (ok) logout();
  };

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
        aria-current={isActive(l.href) ? 'page' : undefined}
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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between h-14 md:h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <Logo size={30} />
          <span className="font-[--font-orbitron] font-bold tracking-widest text-base md:text-lg">
            CYBER<span className="text-neon-cyan">-ZONE</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">{navItems}</nav>

        {/* Desktop actions */}
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
                data-tip={unread > 0 ? `Xabarlar (${unread})` : 'Xabarlar'}
                data-tip-top
                aria-label={unread > 0 ? `Xabarlar — ${unread} ta o'qilmagan` : 'Xabarlar'}
                className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  isActive('/chat')
                    ? 'text-neon-cyan bg-neon-cyan/15 border border-neon-cyan/30'
                    : 'text-gray-200 bg-cyber-800 border border-white/10 hover:border-neon-cyan/40'
                }`}
              >
                <MessageSquare size={16} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-neon-magenta text-white text-[10px] font-extrabold grid place-items-center border border-white/20">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <Link
                href="/dashboard"
                data-tip={t('dashboard')}
                data-tip-top
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
                onClick={handleLogout}
                className="px-3 py-2 text-sm font-medium rounded-lg text-red-400 hover:bg-red-500/10"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-bold rounded-xl neon-btn flex items-center gap-1"
            >
              <LogIn size={16} />
              {t('login')}
            </Link>
          )}
        </div>

        {/* Mobile actions — theme + language + chat (BottomTabBar orqali asosiy nav) */}
        <div className="md:hidden flex items-center gap-0.5">
          {user && (
            <Link
              href="/chat"
              aria-label={unread > 0 ? `Xabarlar — ${unread} ta o'qilmagan` : 'Xabarlar'}
              className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                isActive('/chat')
                  ? 'text-neon-cyan bg-neon-cyan/15 border border-neon-cyan/30'
                  : 'text-gray-200 bg-cyber-800 border border-white/10'
              }`}
            >
              <MessageSquare size={17} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-neon-magenta text-white text-[10px] font-extrabold grid place-items-center border border-white/20">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          )}
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}