'use client';

import { Home, Monitor, Newspaper, LayoutDashboard, LogIn } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

export default function BottomTabBar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  const tabs = [
    { href: '/', icon: Home, label: 'Bosh' },
    { href: '/rooms', icon: Monitor, label: 'Xonalar' },
    { href: '/news', icon: Newspaper, label: 'Yangiliklar' },
  ];

  const isTab = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden glass border-t border-white/10 pb-safe">
      <div className="flex items-stretch justify-around h-16 px-2">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg',
              isTab(t.href) ? 'text-neon-cyan' : 'text-gray-400 hover:text-gray-300'
            )}
          >
            <t.icon size={20} />
            {t.label}
          </Link>
        ))}

        {user ? (
          <Link
            href="/dashboard"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg',
              isTab('/dashboard') ? 'text-neon-cyan' : 'text-gray-400 hover:text-gray-300'
            )}
          >
            <LayoutDashboard size={20} />
            Kabinet
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg text-gray-400 hover:text-gray-300"
          >
            <LogIn size={20} />
            Kirish
          </Link>
        )}
      </div>
    </nav>
  );
}