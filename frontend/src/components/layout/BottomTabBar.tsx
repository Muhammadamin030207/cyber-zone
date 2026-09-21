'use client';

import { Home, Monitor, Newspaper, LayoutDashboard, LogIn, Crown, UserRound, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

interface TabDef {
  href: string;
  icon: LucideIcon;
  label: string;
  aria: string;
}

export default function BottomTabBar() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const tabs: TabDef[] = [
    { href: '/', icon: Home, label: t('home'), aria: t('home') },
    { href: '/rooms', icon: Monitor, label: t('rooms'), aria: t('rooms') },
    { href: '/news', icon: Newspaper, label: t('news'), aria: t('news') },
  ];

  if (user?.role === 'ADMIN') {
    tabs.push({ href: '/admin', icon: LayoutDashboard, label: t('admin'), aria: t('admin') });
    tabs.push({ href: '/profile', icon: UserRound, label: t('profile'), aria: t('profile') });
  } else if (user?.role === 'SUPER_ADMIN') {
    tabs.push({ href: '/super-admin', icon: Crown, label: t('superAdmin'), aria: t('superAdmin') });
    tabs.push({ href: '/profile', icon: UserRound, label: t('profile'), aria: t('profile') });
  } else if (user) {
    // Chat faqat header'dagi belgi orqali ochiladi (unread badge bilan) — pastki tabni takrorlamaymiz
    tabs.push({ href: '/dashboard', icon: LayoutDashboard, label: t('dashboard'), aria: t('dashboard') });
    // Profil: mobil qurilmada chiqish (logout) shu tab orqali ochiladi
    tabs.push({ href: '/profile', icon: UserRound, label: t('profile'), aria: t('profile') });
  } else {
    tabs.push({ href: '/login', icon: LogIn, label: t('login'), aria: t('login') });
  }

  const isTab = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  return (
    <nav
      aria-label={t('home')}
      className="fixed bottom-0 inset-x-0 z-50 md:hidden glass border-t border-white/10 pb-safe"
    >
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent" />
      <div className="flex items-stretch justify-around h-16 px-2">
        {tabs.map((tab) => {
          const active = isTab(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.aria}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 text-[11px] font-medium transition-colors rounded-lg"
            >
              <span
                className={cn(
                  'flex items-center justify-center w-11 h-7 rounded-full transition-all',
                  active ? 'bg-neon-cyan/15 text-neon-cyan shadow-glow' : 'text-gray-400'
                )}
              >
                <tab.icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              <span
                className={cn(
                  'max-w-full truncate px-1 transition-colors',
                  active ? 'text-neon-cyan font-semibold' : 'text-gray-400'
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}