'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Menu, X, LogOut, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { confirmDialog } from '@/lib/confirm';
import Logo from '@/components/brand/Logo';

/** Sidebar menyusi: guruh (yuqorida sarlavha) + ichidagi bo'limlar. */
export interface PanelNavItem {
  key: string;
  icon: LucideIcon;
  label: string;
}
export interface PanelNavGroup {
  title?: string;
  items: PanelNavItem[];
}

type Accent = 'cyan' | 'gold';

interface PanelShellProps {
  title: string;
  subtitle?: string;
  accent?: Accent;
  groups: PanelNavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  children: ReactNode;
}

/** Aktiv bo'lim uchun accent ranglar (admin = neon-cyan, super-admin = gold). */
const ACTIVE: Record<Accent, string> = {
  cyan: 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan shadow-[0_0_18px_-6px_var(--acc-a)]',
  gold: 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300 shadow-[0_0_18px_-6px_rgba(234,179,8,0.35)]',
};
const HOVER: Record<Accent, string> = {
  cyan: 'hover:text-neon-cyan hover:border-neon-cyan/25 hover:bg-neon-cyan/5',
  gold: 'hover:text-yellow-300 hover:border-yellow-400/25 hover:bg-yellow-400/5',
};

function NavList({
  groups,
  active,
  onNavigate,
  accent,
  onPick,
}: {
  groups: PanelNavGroup[];
  active: string;
  onNavigate: (key: string) => void;
  accent: Accent;
  onPick?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto scrollbar-thin py-1" aria-label="Panel bo'limlari">
      {groups.map((g) => (
        <div key={g.title ?? g.items[0]?.key}>
          {g.title && (
            <div className="px-3 mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-500 first:mt-0">
              {g.title}
            </div>
          )}
          <ul className="space-y-1 px-2">
            {g.items.map((it) => {
              const Icon = it.icon;
              const isActive = active === it.key;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate(it.key);
                      onPick?.();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] sm:text-sm font-medium border transition-all text-left',
                      isActive
                        ? ACTIVE[accent]
                        : cn('border-transparent text-gray-400', HOVER[accent])
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserCard({ accent }: { accent: Accent }) {
  const t = useTranslations('common');
  const tNav = useTranslations('nav');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const initial = (() => {
    const name = user?.fullName || 'U';
    return name.trim()[0]?.toUpperCase() || 'U';
  })();

  const handleLogout = async () => {
    const ok = await confirmDialog({
      title: 'Tizimdan chiqish',
      message: 'Hisobingizdan chiqishni tasdiqlaysizmi?',
      confirmLabel: tNav('logout'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (ok) logout();
  };

  return (
    <div className="border-t border-[var(--line)] p-2 pt-3 mt-2 flex items-center gap-2.5">
      <span
        className={cn(
          'w-9 h-9 shrink-0 rounded-xl grid place-items-center text-xs font-extrabold border',
          accent === 'gold'
            ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-300'
            : 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
        )}
        aria-hidden
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold truncate text-gray-200">{user?.fullName}</div>
        <div className="text-[11px] text-gray-500 truncate">{user?.role}</div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        aria-label={tNav('logout')}
        data-tip={tNav('logout')}
        data-tip-top
        className="cz-icon-btn shrink-0 text-gray-400 hover:text-red-400"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

/**
 * Admin / Super-admin panel uchun umumiy shell:
 *   • lg+ : chapda doimiy sidebar (guruhlangan menyu + user kartasi)
 *   • mobilda: yuqori bar + hamburger orqali chapdan chiqadigan drawer
 * Content (children) o'ng tomonda, sarlavha + izoh bilan.
 */
export default function PanelShell({
  title,
  subtitle,
  accent = 'cyan',
  groups,
  active,
  onNavigate,
  children,
}: PanelShellProps) {
  const t = useTranslations('panel');
  const [open, setOpen] = useState(false);

  // Drawer yopiq bo'lganda Escape bilan ochish/qopish
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // Drawer ochiq bo'lganda background skrollni bloklash
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleNavigate = (key: string) => {
    onNavigate(key);
    setOpen(false);
  };

  return (
    <div className="cz-shell py-6 sm:py-8">
      <div className="flex items-start gap-6">
        {/* ============ DESKTOP SIDEBAR ============ */}
        <aside className="hidden lg:flex sticky top-[5.25rem] shrink-0 flex-col w-60 xl:w-64 max-h-[calc(100vh-6.5rem)] neo-card rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-[var(--line)]">
            <span className="w-9 h-9 rounded-xl neo-card grid place-items-center shrink-0">
              <Logo size={22} />
            </span>
            <span className={cn(
              'min-w-0 text-sm font-extrabold tracking-tight truncate',
              accent === 'gold' ? 'text-yellow-300' : 'text-neon-cyan'
            )}>
              {title}
            </span>
          </div>
          <NavList groups={groups} active={active} onNavigate={handleNavigate} accent={accent} />
          <UserCard accent={accent} />
        </aside>

        {/* ============ MOBILE TOP BAR ============ */}
        <div className="flex-1 min-w-0">
          <div className="lg:hidden sticky top-[4.25rem] z-40 px-1 py-2 mb-4 glass rounded-2xl flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t('openMenu')}
              aria-expanded={open}
              className="cz-icon-btn shrink-0"
            >
              <Menu size={18} />
            </button>
            <span className="w-8 h-8 rounded-lg neo-card grid place-items-center shrink-0">
              <Logo size={20} />
            </span>
            <span className={cn(
              'min-w-0 font-extrabold tracking-tight truncate text-[15px]',
              accent === 'gold' ? 'text-yellow-300' : 'text-neon-cyan'
            )}>
              {title}
            </span>
          </div>

          {/* ============ PAGE HEADER + CONTENT ============ */}
          <header className="mb-5 sm:mb-6">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </header>
          {children}
        </div>
      </div>

      {/* ============ MOBILE DRAWER ============ */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[90]">
          <div
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col bg-[var(--bg-1)] border-r border-[var(--line)] drawer-in"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-[var(--line)]">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl neo-card grid place-items-center shrink-0">
                  <Logo size={22} />
                </span>
                <span className={cn(
                  'min-w-0 text-sm font-extrabold tracking-tight truncate',
                  accent === 'gold' ? 'text-yellow-300' : 'text-neon-cyan'
                )}>
                  {title}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('closeMenu')}
                className="cz-icon-btn shrink-0"
              >
                <X size={18} />
              </button>
            </div>
            <NavList
              groups={groups}
              active={active}
              onNavigate={handleNavigate}
              accent={accent}
              onPick={() => setOpen(false)}
            />
            <UserCard accent={accent} />
          </div>
        </div>
      )}
    </div>
  );
}
