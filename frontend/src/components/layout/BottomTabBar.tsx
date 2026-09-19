'use client';

import { Home, Monitor, Newspaper, LayoutDashboard, LogIn, MessageSquare } from 'lucide-react';
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
            className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg"
          >
            <span className={cn(
              'flex items-center justify-center w-10 h-7 rounded-full transition-all',
              isTab(t.href) ? 'bg-neon-cyan/15 text-neon-cyan shadow-glow' : 'text-gray-400'
            )}>
              <t.icon size={20} />
            </span>
            <span className={isTab(t.href) ? 'text-neon-cyan font-semibold' : 'text-gray-400'}>{t.label}</span>
          </Link>
        ))}

        {user ? (
          <>
            <Link
              href="/chat"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg"
            >
              <span className={cn(
                'flex items-center justify-center w-10 h-7 rounded-full transition-all',
                isTab('/chat') ? 'bg-neon-cyan/15 text-neon-cyan shadow-glow' : 'text-gray-400'
              )}>
                <MessageSquare size={20} />
              </span>
              <span className={isTab('/chat') ? 'text-neon-cyan font-semibold' : 'text-gray-400'}>Xabarlar</span>
            </Link>
            <Link
              href="/dashboard"
              className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg"
            >
              <span className={cn(
                'flex items-center justify-center w-10 h-7 rounded-full transition-all',
                isTab('/dashboard') ? 'bg-neon-cyan/15 text-neon-cyan shadow-glow' : 'text-gray-400'
              )}>
                <LayoutDashboard size={20} />
              </span>
              <span className={isTab('/dashboard') ? 'text-neon-cyan font-semibold' : 'text-gray-400'}>Kabinet</span>
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="flex flex-col items-center justify-center gap-0.5 flex-1 text-[11px] font-medium transition-colors rounded-lg"
          >
            <span className="flex items-center justify-center w-10 h-7 rounded-full text-gray-400">
              <LogIn size={20} />
            </span>
            <span className="text-gray-400">Kirish</span>
          </Link>
        )}
      </div>
    </nav>
  );
}