'use client';

import TopBanner from '@/components/home/TopBanner';
import HomeBreadcrumb from '@/components/home/HomeBreadcrumb';
import HomePage from '@/components/home/HomePage';

/**
 * Bosh sahifa — header ostida:
 * yangilik/reklama banneri (agar mavjud bo'lsa) → breadcrumb → hero karta
 * (real statistika) → tuman chiplari → klub to'ri.
 * Global Header/Footer/BottomTabBar layout'da turadi.
 */
export default function HomeRoute() {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <TopBanner />
      <HomeBreadcrumb />
      <HomePage />
    </div>
  );
}