'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { ChevronDown, Crown, LayoutDashboard, LogOut, UserRound, Wallet } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { confirmDialog } from '@/lib/confirm';
import { cn } from '@/lib/utils';

const rowCls = (active: boolean) =>
  cn(
    'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:shadow-[var(--glow-focus)]',
    active ? 'text-[var(--acc-a)] bg-white/5' : 'text-gray-300 hover:bg-white/5'
  );

/**
 * Profil menyusi (dropdown).
 * - Icon-tugma → pastga ochiluvchi panel.
 * - Panel ichida: Kabinet (USER), Profil, To'lovlar, Admin/Super admin
 *   (ro'li bo'lsa) va — MUHIM — "Chiqish". Logout faqat shu yerda turadi.
 * - Tashqariga bosish va Escape panelni yopadi.
 */
export default function ProfileDropdown() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    const ok = await confirmDialog({
      title: 'Tizimdan chiqish',
      message: 'Hisobingizdan chiqishni tasdiqlaysizmi?',
      confirmLabel: 'Chiqish',
      cancelLabel: 'Bekor qilish',
      danger: true,
    });
    if (ok) logout();
  };

  const isActive = (href: string) => pathname.startsWith(href);

  const initial = (() => {
    const name = user?.fullName || 'U';
    return name.trim()[0]?.toUpperCase() || 'U';
  })();

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profile')}
        data-tip={t('profile')}
        data-tip-top
        className={cn(
          'cz-icon-btn font-bold text-sm',
          open && 'cz-icon-btn--active'
        )}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-[var(--acc-a)] to-[var(--acc-b)] text-[11px] font-extrabold text-[#140b04]">
          {initial}
        </span>
        <ChevronDown size={12} className="ml-0.5 hidden xl:inline" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profil menyusi"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 overflow-hidden rounded-2xl glass border border-white/10 shadow-glow menu-pop"
        >
          <div className="border-b border-white/10 px-3 py-3">
            <p className="truncate text-sm font-semibold text-gray-100">
              {user?.fullName || 'Foydalanuvchi'}
            </p>
            {user?.email && (
              <p className="mt-0.5 truncate text-xs text-[var(--fg-dim)]">{user.email}</p>
            )}
          </div>

          <div className="p-1.5">
            {user?.role === 'USER' && (
              <Link
                href="/dashboard"
                role="menuitem"
                aria-current={isActive('/dashboard') ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={rowCls(isActive('/dashboard'))}
              >
                <LayoutDashboard size={16} className="shrink-0" aria-hidden="true" />
                {t('dashboard')}
              </Link>
            )}
            <Link
              href="/profile"
              role="menuitem"
              aria-current={isActive('/profile') ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={rowCls(isActive('/profile'))}
            >
              <UserRound size={16} className="shrink-0" aria-hidden="true" />
              {t('profile')}
            </Link>
            <Link
              href="/payments"
              role="menuitem"
              aria-current={isActive('/payments') ? 'page' : undefined}
              onClick={() => setOpen(false)}
              className={rowCls(isActive('/payments'))}
            >
              <Wallet size={16} className="shrink-0" aria-hidden="true" />
              {t('payments')}
            </Link>
            {user?.role === 'ADMIN' && (
              <Link
                href="/admin"
                role="menuitem"
                aria-current={isActive('/admin') ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={rowCls(isActive('/admin'))}
              >
                <LayoutDashboard size={16} className="shrink-0" aria-hidden="true" />
                {t('admin')}
              </Link>
            )}
            {user?.role === 'SUPER_ADMIN' && (
              <Link
                href="/super-admin"
                role="menuitem"
                aria-current={isActive('/super-admin') ? 'page' : undefined}
                onClick={() => setOpen(false)}
                className={rowCls(isActive('/super-admin'))}
              >
                <Crown size={16} className="shrink-0" aria-hidden="true" />
                {t('superAdmin')}
              </Link>
            )}
          </div>

          <div className="border-t border-white/10 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className={cn(
                rowCls(false),
                'text-[var(--danger)] hover:bg-red-500/10 focus-visible:shadow-[var(--glow-focus)]'
              )}
            >
              <LogOut size={16} className="shrink-0" aria-hidden="true" />
              {t('logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}