import { Link } from '@/i18n/navigation';
import Logo from '@/components/brand/Logo';

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-24 text-center">
      <div className="w-20 h-20 neo-card rounded-3xl flex items-center justify-center mx-auto mb-6">
        <Logo size={46} />
      </div>
      <p className="text-6xl font-extrabold tracking-tight grad-text mb-2">404</p>
      <h1 className="text-xl font-bold mb-2">Sahifa topilmadi</h1>
      <p className="text-gray-400 mb-8">Bu manzil mavjud emas yoki o'chirilgan.</p>
      <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl neon-btn text-sm font-bold">
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}