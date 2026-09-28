'use client';

import { useCallback, useEffect, useState } from 'react';
import { Monitor, Newspaper, MapPin, LogIn, LayoutDashboard, UserRound, Building2, Menu } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuthStore } from '@/store/auth';
import Logo from '@/components/brand/Logo';
import TopBanner from '@/components/home/TopBanner';
import { cn } from '@/lib/utils';

/**
 * BOSHQILA — «logo + ustiga bosing, menyu ochilsin».
 *
 * Nima uchun shu qaror: oldingi bosh sahifada qidiruv, mashhur xonalar,
 * xarita CTA'si va NEXUS CUP countdown'i bir sahifaga tiqilgan edi. Ular
 * (a) bosh sahifani shovqinli qilardi, (b) countdown boshqa brendni
 * ko'rsatardi. Endi bosh sahifa faqat ikkita narsani beradi:
 *
 *   1. Tepadagi yangilik/reklama banneri (bosiladi -> /news)
 *   2. Markazdagi logo (bosiladi -> menyu)
 *
 * Har bir bo'limning o'z ALOHIDA sahifasi bor: /rooms, /news, /login ...
 * Menyu shu sahifalarni bitta joyda to'playdi — hech narsa bosh sahifaga
 * tiqilmaydi.
 */

type MenuItem = {
  href: string;
  label: string;
  sub: string;
  icon: typeof Monitor;
};

const ITEMS: MenuItem[] = [
  { href: '/rooms', label: 'Kompyuter xonalari', sub: 'Xona tanlang va bron qiling', icon: Monitor },
  { href: '/news', label: 'Yangiliklar', sub: 'E\'lonlar, aktsiyalar, yangi xonalar', icon: Newspaper },
  { href: '/rooms', label: 'Xaritada', sub: 'Toshkent bo\'ylab eng yaqin zona', icon: MapPin },
];

export default function HomePage() {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Escape bilan menyuni yopamiz — klaviatura bilan foydalanuvchi uchun.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Tanlangan bo'limni menyuda ajratib ko'rsatamiz. Sahifa almashganda
  // `key` o'zgaradi -> menyu qatlami qayta mount bo'ladi va `open` resetlanadi
  // (shuning uchun `useEffect` + `setState` kerak bo'lmadi).
  const pathname = usePathname();

  return (
    <div className="min-h-[calc(100dvh-8rem)] flex flex-col">
      {/* 1) Tepadagi yangilik / reklama — birinchi ko'rinadigan element */}
      <TopBanner />

      {/* 2) Markaz — logo. Bosilganda menyu ochiladi. */}
      <div className="flex-1 flex items-center justify-center px-4 py-14">
        <div className="text-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="group inline-flex flex-col items-center gap-4 rounded-3xl px-6 py-8 transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neon-cyan"
          >
            <span className="relative">
              {/* Yumshoq neon halqa — logo «bosiladi» degan vizual signal. */}
              <span
                aria-hidden
                className="absolute inset-0 -m-4 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ boxShadow: '0 0 0 1px var(--acc-a), 0 0 34px -6px var(--acc-a)' }}
              />
              <Logo size={104} className="relative" />
            </span>

            <span className="font-[--font-orbitron] text-2xl sm:text-3xl font-bold tracking-widest">
              CYBER<span className="text-neon-cyan">-ZONE</span>
            </span>

            <span className="inline-flex items-center gap-2 text-xs text-gray-500 group-hover:text-gray-300 transition-colors">
              <Menu size={13} aria-hidden="true" />
              Menyu ochish
            </span>
          </button>
        </div>
      </div>

      {/* 3) Menyu — alohida qatlam, orqasini yopish mumkin. */}
      {open && (
        <div
          key={pathname}
          role="dialog"
          aria-modal="true"
          aria-label="Asosiy menyu"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in"
          onClick={close}
        >
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md neo-card rounded-3xl p-5 shadow-2xl panel-pop"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <Logo size={26} />
                <span className="font-[--font-orbitron] font-bold tracking-widest text-sm">
                  CYBER<span className="text-neon-cyan">-ZONE</span>
                </span>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Menyuni yopish"
                className="w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 grid place-items-center"
              >
                <span aria-hidden className="text-xl leading-none">×</span>
              </button>
            </div>

            <nav className="space-y-1.5" aria-label="Sahifalar">
              {ITEMS.map((it) => (
                <Link
                  key={it.label}
                  href={it.href}
                  role="menuitem"
                  onClick={close}
                  className="flex items-center gap-3.5 rounded-2xl border border-white/10 surface px-4 py-3.5 transition-colors hover:border-neon-cyan/35 hover:bg-neon-cyan/[0.06]"
                >
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 shrink-0">
                    <it.icon size={18} className="text-neon-cyan" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-100">{it.label}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{it.sub}</span>
                  </span>
                </Link>
              ))}
            </nav>

            <div className="h-px bg-white/5 my-4" />

            {/* Kirish / kabinet — ro'yxatdan o'tish yo'li ham shu menyuda.
                `close()` — navigatsiya boshlanganda menyu yopiladi. */}
            {user ? (
              <div className="grid grid-cols-2 gap-2">
                {user.role === 'USER' && (
                  <Link href="/dashboard" onClick={close} className="neon-btn rounded-xl py-3 text-sm font-bold text-center">
                    Kabinet
                  </Link>
                )}
                {user.role === 'ADMIN' && (
                  <Link href="/admin" onClick={close} className="rounded-xl py-3 text-sm font-bold text-center border border-neon-green/30 bg-neon-green/10 text-neon-green">
                    Admin
                  </Link>
                )}
                {user.role === 'SUPER_ADMIN' && (
                  <Link href="/super-admin" onClick={close} className="rounded-xl py-3 text-sm font-bold text-center border border-yellow-400/30 bg-yellow-400/10 text-yellow-300">
                    Super admin
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={close}
                  className={cn(
                    'rounded-xl py-3 text-sm font-semibold text-center border border-white/10 surface',
                    'inline-flex items-center justify-center gap-2 hover:border-neon-cyan/35'
                  )}
                >
                  <UserRound size={15} aria-hidden="true" /> Profil
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" onClick={close} className="neon-btn rounded-xl py-3 text-sm font-bold text-center">
                  <span className="inline-flex items-center gap-2">
                    <LogIn size={15} aria-hidden="true" /> Kirish
                  </span>
                </Link>
                <Link
                  href="/register"
                  onClick={close}
                  className="rounded-xl py-3 text-sm font-semibold text-center border border-white/10 surface hover:border-neon-cyan/35"
                >
                  <span className="inline-flex items-center gap-2">
                    <Building2 size={15} aria-hidden="true" /> Ro&apos;yxatdan o&apos;tish
                  </span>
                </Link>
              </div>
            )}

            {!user && (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-gray-500">
                <LayoutDashboard size={11} aria-hidden="true" />
                Ro&apos;yxatdan o&apos;tmasdan xonalarni ko&apos;rish mumkin
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
