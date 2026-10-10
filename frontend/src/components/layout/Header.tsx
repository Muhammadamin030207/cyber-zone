'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import {
  Bot,
  CalendarDays,
  ChevronDown,
  Heart,
  Map,
  MapPin,
  MessageSquare,
  Plus,
  Search,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useChatUnread } from '@/hooks/useChatUnread';
import { useFavorites } from '@/lib/favorites';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeSwitcher from './ThemeSwitcher';
import ProfileDropdown from './ProfileDropdown';
import Logo from '@/components/brand/Logo';
import { cn } from '@/lib/utils';

/**
 * YASSI STICKY HEADER (pill emas).
 *
 * Bir qator, shahar tanlagich + qidiruv + ikonlar + til + Kirish/avatar.
 * Logout — faqat avatar dropdown'da (ProfileDropdown).
 * lg'dan pastda: logo + qidiruv ikonka + til + avatar/Kirish. HAMBURGER YO'Q
 * — mobil navigatsiya BottomTabBar'da.
 *
 * Qidiruv `/rooms?q=...` ga yo'naltiradi (rooms sahifasi `q` parametrini
 * o'qiydi). Desktop'da keng input, past kenglikda input paneli ochiladi.
 */
export default function Header() {
  const t = useTranslations('nav');
  const thome = useTranslations('home');
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const unread = useChatUnread();
  const favCount = useFavorites((s) => s.ids.length);

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const role = user?.role;
  const canAddRoom = role === 'ADMIN' || role === 'SUPER_ADMIN';

  // Mobil/tablet qidiruv paneli — tashqariga bosish va Escape bilan yopiladi
  useEffect(() => {
    if (!searchOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [searchOpen]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    router.push({ pathname: '/rooms', query: q ? { q: q } : {} });
    setSearchOpen(false);
    setSearch('');
  }

  // ---- Chiqadigan ikonga asoslangan tugmalar (desktop) ----
  const iconBtn = (href: string, label: string, icon: React.ReactNode, badge?: React.ReactNode) => (
    <Link
      key={href}
      href={href}
      aria-label={label}
      aria-current={isActive(href) ? 'page' : undefined}
      className={cn(
        'relative grid shrink-0 place-items-center cz-icon-btn',
        isActive(href) && 'cz-icon-btn--active'
      )}
    >
      {icon}
      {badge}
    </Link>
  );

  const searchDesktop = (
    <form
      onSubmit={submitSearch}
      role="search"
      aria-label="Xona yoki tuman qidirish"
      className="mx-auto flex h-11 min-w-0 flex-1 max-w-[560px] items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--bg-2)] py-1 pl-4 pr-1 transition-colors focus-within:border-[var(--acc-a)] focus-within:shadow-[var(--glow-focus)]"
    >
      <Search size={17} aria-hidden="true" className="shrink-0 text-[var(--fg-dim)]" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={thome('searchPlaceholder')}
        enterKeyHint="search"
        aria-label={thome('searchPlaceholder')}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:outline-none"
      />
      <button
        type="submit"
        aria-label={thome('searchPlaceholder')}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#140b04]"
        style={{
          background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))',
          boxShadow: '0 8px 24px -10px color-mix(in srgb, var(--acc-a) 80%, transparent)',
        }}
      >
        <Search size={16} aria-hidden="true" />
      </button>
    </form>
  );

  // Desktop ikon amallar: bronlar / xarita / sevimli / chat / AI / hamyon
  const desktopActions = (
    <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
      {iconBtn(
        '/dashboard',
        t('bookings'),
        <CalendarDays size={17} aria-hidden="true" />,
        undefined
      )}
      {iconBtn('/location', t('map'), <Map size={17} aria-hidden="true" />, undefined)}
      {iconBtn(
        '/favorites',
        t('favorites'),
        <Heart size={17} aria-hidden="true" />,
        favCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full border border-white/20 bg-orange-500 px-1 text-[10px] font-extrabold text-white">
            {favCount > 99 ? '99+' : favCount}
          </span>
        ) : null
      )}
      {user && (
        <>
          {iconBtn(
            '/chat',
            unread > 0 ? `Xabarlar — ${unread} ta o'qilmagan` : 'Xabarlar',
            <MessageSquare size={17} aria-hidden="true" />,
            unread > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full border border-white/20 bg-[var(--acc-b)] px-1 text-[10px] font-extrabold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null
          )}
          {iconBtn('/ai', t('ai'), <Bot size={17} aria-hidden="true" />, undefined)}
          {iconBtn('/payments', t('payments'), <Wallet size={17} aria-hidden="true" />, undefined)}
        </>
      )}
      <ThemeSwitcher />
      <LanguageSwitcher />
    </div>
  );

  return (
    <header id="site-header">
      <div className="cz-page-container flex h-[3.75rem] items-center gap-1.5 sm:gap-2 lg:h-[4.25rem] lg:gap-2.5">
        {/* LOGO */}
        <Link
          href="/"
          aria-label="Cyber-ZONE — bosh sahifa"
          className="flex min-w-0 shrink-0 items-center gap-2"
        >
          <Logo size={30} />
          <span className="hidden whitespace-nowrap font-[--font-orbitron] text-[15px] font-bold tracking-widest text-[var(--fg)] sm:inline lg:text-base">
            CYBER<span className="text-neon-cyan">-ZONE</span>
          </span>
        </Link>

        {/* SHAHAR (lg+) */}
        <Link
          href="/location"
          aria-label={`Shahar: ${t('city')}`}
          aria-current={isActive('/location') ? 'page' : undefined}
          className={cn(
            'hidden h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3.5 text-sm font-medium text-[var(--fg-mut)] transition-colors lg:flex',
            'hover:border-[var(--acc-a)] hover:text-[var(--acc-a)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]'
          )}
        >
          <MapPin size={16} aria-hidden="true" className="text-[var(--acc-a)]" />
          <span className="whitespace-nowrap">{t('city')}</span>
          <ChevronDown size={14} aria-hidden="true" className="text-[var(--fg-dim)]" />
        </Link>

        {/* XONA QO'SHISH (admin/super-admin, lg+) */}
        {canAddRoom && (
          <Link
            href={role === 'SUPER_ADMIN' ? '/super-admin' : '/admin'}
            aria-label={t('addRoom')}
            className={cn(
              'hidden h-11 shrink-0 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3.5 text-sm font-medium text-[var(--fg-mut)] transition-colors lg:flex',
              'hover:border-[var(--acc-a)] hover:text-[var(--acc-a)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc-a)]'
            )}
          >
            <Plus size={16} aria-hidden="true" />
            <span className="whitespace-nowrap">{t('addRoom')}</span>
          </Link>
        )}

        {/* QIDIRUV — desktopda keng input */}
        <div className="hidden min-w-0 flex-1 lg:flex">{searchDesktop}</div>

        {/* Ikon-amallar + til (lg+) */}
        {desktopActions}

        {/* <lg: minimal — qidiruv ikonka, til, avatar/Kirish (hamburger YO'Q) */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:hidden">
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            aria-label={thome('searchPlaceholder')}
            aria-expanded={searchOpen}
            className="cz-icon-btn shrink-0"
          >
            <Search size={17} aria-hidden="true" />
          </button>
          <LanguageSwitcher />
          {user ? (
            <ProfileDropdown />
          ) : (
            <Link href="/login" className="cz-btn cz-btn--primary h-11 px-4 text-sm">
              {t('login')}
            </Link>
          )}
        </div>
      </div>

      {/* <lg — qidiruv paneli (ochilganda) */}
      {searchOpen && (
        <div ref={panelRef} className="cz-page-container pb-2 lg:hidden">
          <form
            onSubmit={submitSearch}
            role="search"
            aria-label="Xona yoki tuman qidirish"
            className="flex h-12 items-center gap-1 rounded-full border border-[var(--line-strong)] bg-[var(--bg-2)] py-1 pl-4 pr-1 transition-colors focus-within:border-[var(--acc-a)] focus-within:shadow-[var(--glow-focus)]"
          >
            <Search size={17} aria-hidden="true" className="shrink-0 text-[var(--fg-dim)]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={thome('searchPlaceholder')}
              enterKeyHint="search"
              aria-label={thome('searchPlaceholder')}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] focus:outline-none"
            />
            <button
              type="submit"
              aria-label={thome('searchPlaceholder')}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#140b04]"
              style={{
                background: 'linear-gradient(180deg, var(--acc-a-soft), var(--acc-a))',
                boxShadow: '0 8px 24px -10px color-mix(in srgb, var(--acc-a) 80%, transparent)',
              }}
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </header>
  );
}