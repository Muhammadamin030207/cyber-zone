'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import SplashLoader from '@/components/ui/SplashLoader';

export default function CheckoutPayRedirect({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { id } = await params;
      if (cancelled) return;
      const search = new URLSearchParams(window.location.search);
      const q: string[] = [];
      const pid = search.get('pid');
      if (pid) q.push(`pid=${encodeURIComponent(pid)}`);
      router.replace(q.length ? `/checkout/${id}?${q.join('&')}` : `/checkout/${id}`);
    })();
    return () => { cancelled = true; };
  }, [router, params]);

  return (
    <div className="min-h-[60vh] grid place-items-center">
      <SplashLoader label="To'lov holati tekshirilmoqda..." />
    </div>
  );
}