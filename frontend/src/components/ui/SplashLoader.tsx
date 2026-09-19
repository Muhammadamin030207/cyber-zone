import Logo from '@/components/brand/Logo';

export default function SplashLoader({ label = 'Yuklanmoqda...' }: { label?: string }) {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 neo-card rounded-2xl flex items-center justify-center animate-pulse">
        <Logo size={38} />
      </div>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}