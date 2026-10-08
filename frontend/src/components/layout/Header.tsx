'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { Bot, Menu, MessageSquare, Wallet, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useChatUnread } from '@/hooks/useChatUnread';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import ProfileDropdown from './ProfileDropdown';
import Logo from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

export default function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const unread = useChatUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Panel — tashqariga bosish va Escape bilan yopiladi
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const links = [
    { href: '/', label: t('home') },
    { href: '/rooms', label: t('rooms') },
    { href: '/location', label: t('location') },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  const navClass = (href: string) =>
    cn('cz-nav-link', isActive(href) && 'cz-nav-link--active');

  // ---- Icon-tugmalar (desktop / tablet uchun) ----
  const chatLink = (
    <Link
      href="/chat"
      data-tip={unread > 0 ? `Xabarlar (${unread})` : 'Xabarlar'}
      data-tip-top
      aria-label={unread > 0 ? `Xabarlar — ${unread} ta o'qilmagan` : 'Xabarlar'}
      aria-current={isActive('/chat') ? 'page' : undefined}
      className={cn('relative shrink-0 cz-icon-btn', isActive('/chat') && 'cz-icon-btn--active')}
    >
      <MessageSquare size={16} aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid min-w-[18px] h-[18px] place-items-center rounded-full border border-white/20 bg-neon-magenta px-1 text-[10px] font-extrabold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );

  const aiLink = (
    <Link
      href="/ai"
      data-tip={t('ai')}
      data-tip-top
      aria-label={t('ai')}
      aria-current={isActive('/ai') ? 'page' : undefined}
      className={cn('shrink-0 cz-icon-btn', isActive('/ai') && 'cz-icon-btn--active')}
    >
      <Bot size={16} aria-hidden="true" />
    </Link>
  );

  const walletLink = (
    <Link
      href="/payments"
      data-tip={t('payments')}
      data-tip-top
      aria-label={t('payments')}
      aria-current={isActive('/payments') ? 'page' : undefined}
      className={cn('shrink-0 cz-icon-btn', isActive('/payments') && 'cz-icon-btn--active')}
    >
      <Wallet size={16} aria-hidden="true" />
    </Link>
  );

  // ---- Mobil panel: 3 ustunli qisqa amallar (faqat <sm) ----
  const mobileAction = (href: string, label: string, icon: React.ReactNode, badge?: React.ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive(href) ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-xs font-medium text-gray-300 transition-colors',
        'hover:border-white/20 hover:text-[var(--acc-a)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]'
      )}
    >
      <span className="relative grid place-items-center">
        {icon}
        {badge}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );

  const mobileChat = mobileAction(
    '/chat',
    unread > 0 ? `Xabarlar (${unread})` : 'Xabarlar',
    <MessageSquare size={18} aria-hidden="true" />,
    unread > 0 ? (
      <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-[16px] place-items-center rounded-full border border-white/20 bg-neon-magenta px-1 text-[10px] font-extrabold text-white">
        {unread > 99 ? '99+' : unread}
      </span>
    ) : null
  );
  const mobileAi = mobileAction('/ai', t('ai'), <Bot size={18} aria-hidden="true" />);
  const mobileWallet = mobileAction('/payments', t('payments'), <Wallet size={18} aria-hidden="true" />);

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">
        <div
          className="cz-header relative flex w-full items-center gap-2 md:gap-3"
          style={{ minHeight: 'var(--ad-header-h)' }}
        >
          {/* LOGO */}
          <Link
            href="/"
            aria-label="Cyber-ZONE — bosh sahifa"
            className="flex min-w-0 shrink-0 items-center gap-2"
          >
            <Logo size={30} />
            <span className="hidden whitespace-nowrap font-[--font-orbitron] text-base font-bold tracking-widest sm:inline md:text-lg">
              CYBER<span className="text-neon-cyan">-ZONE</span>
            </span>
          </Link>

          {/* DESKTOP NAV (lg+) */}
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex"
            aria-label="Asosiy navigatsiya"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
                className={navClass(l.href)}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* DESKTOP ACTIONS (lg+) */}
          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            <ThemeSwitcher />
            <LanguageSwitcher />
            {user ? (
              <>
                {chatLink}
                {aiLink}
                {walletLink}
                <ProfileDropdown />
              </>
            ) : (
              <Link href="/login" className="cz-btn cz-btn--primary">
                {t('login')}
              </Link>
            )}
          </div>

          {/* MOBILE / TABLET ACTIONS (<lg) */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:hidden">
            <ThemeSwitcher />
            <LanguageSwitcher />
            {user && (
              <div className="hidden items-center gap-1.5 sm:flex">
                {chatLink}
                {aiLink}
                {walletLink}
              </div>
            )}
            {user ? (
              <ProfileDropdown />
            ) : (
              <Link href="/login" className="cz-btn cz-btn--primary">
                {t('login')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? 'Menyuni yopish' : 'Menyuni ochish'}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cn('cz-icon-btn shrink-0', menuOpen && 'cz-icon-btn--active')}
            >
              {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* MOBILE PANEL (<lg) — faqat ochilganda */}
        {menuOpen && (
          <div
            ref={menuRef}
            className="menu-pop mt-2 overflow-hidden rounded-3xl glass border border-white/10 shadow-glow lg:hidden"
          >
            <nav aria-label="Mobil navigatsiya" className="flex flex-col p-2">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(navClass(l.href), 'h-11 w-full justify-start text-base')}
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            {!user ? (
              <div className="border-t border-white/10 p-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="cz-btn cz-btn--primary w-full"
                >
                  {t('login')}
                </Link>
              </div>
            ) : (
              <div className="sm:hidden border-t border-white/10 p-2">
                <div className="grid grid-cols-3 gap-2">{mobileChat}{mobileAi}{mobileWallet}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}