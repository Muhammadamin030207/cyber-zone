'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { LayoutDashboard, Crown, MessageSquare, UserRound, Wallet, Bot } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useChatUnread } from '@/hooks/useChatUnread';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import Logo from '@/components/brand/Logo';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/utils';

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
    { href: '/location', label: t('location') },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  const navItems = (
    <>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? 'page' : undefined}
          className={cn(
            'cz-nav-link',
            isActive(l.href) && 'cz-nav-link--active'
          )}
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

  const iconBtn = 'cz-icon-btn';

  const chatButton = (
    <Link
      href="/chat"
      data-tip={unread > 0 ? `Xabarlar (${unread})` : 'Xabarlar'}
      data-tip-top
      aria-label={unread > 0 ? `Xabarlar — ${unread} ta o'qilmagan` : 'Xabarlar'}
      className={cn(
        'relative shrink-0',
        iconBtn,
        isActive('/chat') && 'cz-icon-btn--active'
      )}
    >
      <MessageSquare size={16} />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-neon-magenta text-white text-[10px] font-extrabold grid place-items-center border border-white/20">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );

  const AiButton = (
    <Link
      href="/ai"
      data-tip={t('ai')}
      data-tip-top
      aria-label={t('ai')}
      aria-current={isActive('/ai') ? 'page' : undefined}
      className={cn(iconBtn, isActive('/ai') && 'cz-icon-btn--active')}
    >
      <Bot size={16} aria-hidden />
    </Link>
  );

  const profileButton = (
    <Link
      href="/profile"
      data-tip={t('profile')}
      data-tip-top
      aria-label={t('profile')}
      aria-current={isActive('/profile') ? 'page' : undefined}
      className={cn(
        'shrink-0',
        iconBtn,
        isActive('/profile') && 'cz-icon-btn--active'
      )}
    >
      <UserRound size={16} />
    </Link>
  );

  return (
    <header className="sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 pt-2 sm:pt-3 pb-2">
        <div className="cz-header relative flex items-center gap-2 w-full" style={{ minHeight: 'var(--ad-header-h)', paddingInline: 'var(--shell-pad)' }}>
          <Link href="/" className="flex items-center gap-2 group shrink-0" aria-label="Cyber-ZONE — bosh sahifa">
            <Logo size={30} />
            <span className="hidden sm:inline font-[--font-orbitron] font-bold tracking-widest text-base md:text-lg">
              CYBER<span className="text-neon-cyan">-ZONE</span>
            </span>
          </Link>

          <nav
            className="hidden lg:flex flex-1 min-w-0 items-center justify-center gap-0.5"
            aria-label="Asosiy navigatsiya"
          >
            {navItems}
          </nav>

          <div className="hidden lg:flex items-center gap-1.5 shrink-0">
            <ThemeSwitcher />
            <LanguageSwitcher />
            {user ? (
              <>
                {user.role === 'SUPER_ADMIN' && (
                  <Link
                    href="/super-admin"
                    className="cz-nav-link gap-1.5 text-[var(--acc-c)] hover:bg-yellow-400/10"
                  >
                    <Crown size={16} />
                    {t('superAdmin')}
                  </Link>
                )}
                {user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    className="cz-nav-link gap-1.5 text-neon-green hover:bg-neon-green/10"
                  >
                    <LayoutDashboard size={16} />
                    {t('admin')}
                  </Link>
                )}
                {chatButton}
                {AiButton}
                <Link
                  href="/payments"
                  data-tip={t('payments')}
                  data-tip-top
                  aria-label={t('payments')}
                  aria-current={isActive('/payments') ? 'page' : undefined}
                  className={cn(iconBtn, isActive('/payments') && 'cz-icon-btn--active')}
                >
                  <Wallet size={16} aria-hidden />
                </Link>
                {profileButton}
                {user.role === 'USER' && (
                  <Link
                    href="/dashboard"
                    data-tip={t('dashboard')}
                    data-tip-top
                    aria-label={t('dashboard')}
                    aria-current={isActive('/dashboard') ? 'page' : undefined}
                    className={cn(
                      iconBtn,
                      'font-bold text-sm',
                      isActive('/dashboard') && 'cz-icon-btn--active'
                    )}
                  >
                    {userInitial}
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="cz-nav-link text-[var(--danger)] hover:bg-red-500/10"
                >
                  {t('logout')}
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="cz-btn cz-btn--primary"
              >
                {t('login')}
              </Link>
            )}
          </div>

          <div className="hidden md:flex lg:hidden items-center justify-end flex-1 min-w-0 gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
            {user ? (
              <>
                {user.role === 'SUPER_ADMIN' && (
                  <Link
                    href="/super-admin"
                    aria-label={t('superAdmin')}
                    className="cz-icon-btn shrink-0 text-yellow-300 bg-yellow-400/10 border-yellow-400/30"
                  >
                    <Crown size={17} />
                  </Link>
                )}
                {user.role === 'ADMIN' && (
                  <Link
                    href="/admin"
                    aria-label={t('admin')}
                    className="cz-icon-btn shrink-0 text-neon-green bg-neon-green/10 border-neon-green/30"
                  >
                    <LayoutDashboard size={16} />
                  </Link>
                )}
                {user.role === 'USER' && (
                  <Link
                    href="/dashboard"
                    data-tip={t('dashboard')}
                    aria-label={t('dashboard')}
                    aria-current={isActive('/dashboard') ? 'page' : undefined}
                    className={cn(
                      iconBtn,
                      'font-bold text-sm',
                      isActive('/dashboard') && 'cz-icon-btn--active'
                    )}
                  >
                    {userInitial}
                  </Link>
                )}
                {chatButton}
                {profileButton}
              </>
            ) : (
              <Link
                href="/login"
                className="cz-btn cz-btn--primary"
              >
                {t('login')}
              </Link>
            )}
          </div>

          <div className="md:hidden flex items-center gap-2 ml-auto">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
