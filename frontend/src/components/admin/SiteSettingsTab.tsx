'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, AlertCircle, Info } from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import { toastError, toastSuccess } from '@/lib/toast';

interface FieldDef {
  key: string;
  label: string;
  hint: string;
  textarea: boolean;
  max: number;
}

const FIELDS: FieldDef[] = [
  { key: 'faq', label: 'FAQ (savol — javob)', hint: 'Har bir qator: savol — javob. AI shularga asoslanib javob beradi.', textarea: true, max: 12000 },
  { key: 'how_to_book', label: 'Qanday bron qilinadi', hint: 'Bosqichma-bosqich yo\'riqnoma (AI uchun).', textarea: true, max: 6000 },
  { key: 'payment_info', label: 'To\'lov usullari', hint: 'To\'lov xizmatlari va qoidalari (AI uchun).', textarea: true, max: 3000 },
  { key: 'cancellation_policy', label: 'Bekor qilish siyosati', hint: 'Bekor qilish/qaytarish shartlari (AI uchun).', textarea: true, max: 3000 },
  { key: 'work_hours_note', label: 'Ish vaqti eslatmasi', hint: 'Umumiy ish vaqti haqida qo\'shimcha izoh (AI uchun).', textarea: true, max: 2000 },
  { key: 'contact_phone', label: 'Aloqa telefoni', hint: '', textarea: false, max: 200 },
  { key: 'contact_email', label: 'Aloqa email', hint: '', textarea: false, max: 200 },
  { key: 'address', label: 'Manzil', hint: '', textarea: false, max: 500 },
];

export default function SiteSettingsTab() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/api/settings/site')
      .then(({ data }) => {
        const s = (data?.data?.settings as Record<string, string> | undefined) || {};
        setValues((prev) => {
          const next: Record<string, string> = {};
          for (const f of FIELDS) next[f.key] = prev[f.key] ?? s[f.key] ?? '';
          return next;
        });
      })
      .catch(() => setValues((prev) => {
        const next: Record<string, string> = {};
        for (const f of FIELDS) next[f.key] = prev[f.key] ?? '';
        return next;
      }))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const f of FIELDS) payload[f.key] = values[f.key]?.trim() ?? '';
      const { data } = await api.put('/api/settings/site', { value: payload });
      const s = (data?.data?.settings as Record<string, string> | undefined) || {};
      setValues((prev) => {
        const next: Record<string, string> = {};
        for (const f of FIELDS) next[f.key] = s[f.key] ?? prev[f.key] ?? '';
        return next;
      });
      toastSuccess('Sayt ma\'lumotlari saqlandi');
    } catch (err) {
      toastError(getApiErrorMessage(err, 'Saqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="surface rounded-2xl p-6 text-center text-gray-400 text-sm">
        <Loader2 size={18} className="inline animate-spin mr-2" /> Yuklanmoqda...
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-neon-cyan/5 border border-neon-cyan/20 text-xs text-gray-300 mb-5">
        <Info size={14} className="text-neon-cyan shrink-0 mt-0.5" />
        <span>
          Bu bo&apos;limdagi ma&apos;lumotlar AI yordamchisi kontekstiga yuboriladi (§6.16) — FAQ, aloqa va qoidalar
          haqidagi savollarga AI faqat shu yerdagi ma&apos;lumot asosida javob beradi.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-sm font-semibold mb-1.5 block">{f.label}</span>
            {f.textarea ? (
              <textarea
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                rows={4}
                maxLength={f.max}
                className="w-full rounded-xl border border-white/10 surface px-3 py-2.5 text-sm outline-none focus:border-neon-cyan/40 resize-y scrollbar-thin"
                placeholder={f.hint}
              />
            ) : (
              <input
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                type={f.key === 'contact_email' ? 'email' : 'text'}
                maxLength={f.max}
                className="w-full rounded-xl border border-white/10 surface px-3 py-2.5 text-sm outline-none focus:border-neon-cyan/40"
                placeholder={f.hint}
              />
            )}
            <span className="block mt-1 text-[11px] text-gray-500">{f.hint}</span>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-6 py-3 rounded-xl neon-btn text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Barchasini saqlash
      </button>

      {saving && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-400">
          <AlertCircle size={13} /> AI konteksti 30 soniya ichida yangilanadi.
        </p>
      )}
    </div>
  );
}