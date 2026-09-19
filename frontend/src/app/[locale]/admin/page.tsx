'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Settings, Monitor, Cpu, CalendarDays, BadgePercent, Newspaper, BarChart3, MessageSquare,
  Plus, Pencil, Trash2, Loader2, AlertCircle, Check, ShieldCheck, Users, Zap,
  Save, X, ChevronDown, ChevronUp, Gamepad2, TrendingUp, CircleDollarSign, RefreshCw,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import type { Room, Zone, Computer, Booking, PromoCode, NewsItem, BookingStatus } from '@/lib/types';
import { formatPrice, formatDate, formatDateTime, todayISO, zoneTypeLabel, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import BarAdmin from '@/components/admin/BarAdmin';
import ChatAdmin from '@/components/admin/ChatAdmin';

type Tab = 'room' | 'zones' | 'computers' | 'bookings' | 'bar' | 'chat' | 'promos' | 'news' | 'stats';

const TABS: { key: Tab; icon: any; label: string }[] = [
  { key: 'room', icon: Settings, label: 'Xona' },
  { key: 'zones', icon: Users, label: 'Zonalar' },
  { key: 'computers', icon: Monitor, label: 'Kompyuterlar' },
  { key: 'bookings', icon: CalendarDays, label: 'Bronlar' },
  { key: 'bar', icon: Gamepad2, label: 'Gaming Bar' },
  { key: 'chat', icon: MessageSquare, label: 'Chat' },
  { key: 'promos', icon: BadgePercent, label: 'Promo' },
  { key: 'news', icon: Newspaper, label: 'Yangiliklar' },
  { key: 'stats', icon: BarChart3, label: 'Statistika' },
];

export default function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('admin');
  const tG = useTranslations('superAdmin');
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>('room');
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

  // Faqat ADMIN roliga ruxsat — SUPER_ADMIN o'z panelliga o'tadi
  useEffect(() => {
    if (!user) return;
    if (user.role !== 'ADMIN') {
      window.location.href = user.role === 'SUPER_ADMIN' ? '/super-admin' : '/dashboard';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await api.get('/api/rooms/all');
        const myRoom = (data.data as Room[]).find((r) => r.ownerId === user?.id) || null;
        setRoom(myRoom);
      } catch { /* skip */ }
      setLoading(false);
    }
    if (user && user.role === 'ADMIN') load();
  }, [user]);

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-24 text-center">
        <ShieldCheck size={56} className="mx-auto mb-4 text-gray-500" />
        <p className="text-gray-300 font-bold text-xl">{tG('accessDenied')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="neo-card rounded-2xl h-96 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6 flex items-center gap-3">
        <ShieldCheck size={28} className="text-neon-green" /> {t('title')}
      </h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-thin pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap',
              tab === tb.key
                ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                : 'border-neon-cyan/10 text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/20'
            )}
          >
            <tb.icon size={15} />
            {tb.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {!room && tab !== 'room' && tab !== 'bar' && tab !== 'chat' ? (
        <div className="text-center py-20">
          <Gamepad2 size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400 text-lg mb-4">{t('noRoom')}</p>
          <button onClick={() => setTab('room')} className="px-6 py-3 rounded-xl neon-btn text-sm font-bold">
            <Plus size={16} className="inline mr-1" /> {t('createRoom')}
          </button>
        </div>
      ) : tab === 'room' ? (
        <RoomTab room={room} setRoom={setRoom} />
      ) : tab === 'zones' && room ? (
        <ZonesTab room={room} />
      ) : tab === 'computers' && room ? (
        <ComputersTab room={room} />
      ) : tab === 'bookings' && room ? (
        <BookingsTab room={room} />
      ) : tab === 'bar' ? (
        <BarAdmin />
      ) : tab === 'chat' ? (
        <ChatAdmin />
      ) : tab === 'promos' && room ? (
        <PromosTab room={room} />
      ) : tab === 'news' ? (
        <NewsTab room={room} />
      ) : tab === 'stats' && room ? (
        <StatsTab room={room} />
      ) : null}
    </div>
  );
}

/* ====================== ROOM TAB ====================== */
function RoomTab({ room, setRoom }: { room: Room | null; setRoom: (r: Room) => void }) {
  const t = useTranslations('admin');
  const tC = useTranslations('common');
  const [form, setForm] = useState({
    name: room?.name || '',
    address: room?.address || '',
    phone: room?.phone || '',
    description: room?.description || '',
    workingHoursOpen: room?.workingHours?.open || '08:00',
    workingHoursClose: room?.workingHours?.close || '23:00',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        phone: form.phone || undefined,
        description: form.description || undefined,
        workingHours: { open: form.workingHoursOpen, close: form.workingHoursClose },
      };
      const { data } = await api.put(`/api/rooms/${room!.id}`, payload);
      setRoom(data.data);
      setMsg('Saqlandi!');
    } catch (err) {
      setMsg(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // Xona yaratish faqat SUPER_ADMIN'ga tegishli — adminga xona tayinlanadi
  if (!room) {
    return (
      <div className="neo-card rounded-2xl p-6 max-w-2xl">
        <h2 className="font-bold text-xl mb-3">Sizning xonangiz hali biriktirilmagan</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-4">
          Kompyuter xona platforma egaligi (Super Admin) tomonidan yaratiladi va sizga tayinlanadi.
          Xona biriktirilgach, bu yerda o\'z xonangizni boshqarishingiz mumkin.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-bold flex items-center gap-2 hover:bg-neon-cyan/10"
        >
          <RefreshCw size={16} /> Yangilash
        </button>
      </div>
    );
  }

  return (
    <div className="neo-card rounded-2xl p-6 max-w-2xl">
      <h2 className="font-bold text-xl mb-4">Xona ma\'lumotlari</h2>
      {msg && (
        <div className={cn('mb-4 px-3 py-2.5 rounded-lg text-sm', msg.includes('xatolik') || msg.includes('Xatolik') ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-neon-green/10 border border-neon-green/30 text-neon-green')}>
          <Check size={14} className="inline mr-1" />{msg}
        </div>
      )}
      <div className="space-y-4">
        <Input label="Nomi" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Neon Arena" />
        <Input label="Manzil" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Toshkent, Yunusobod" />
        <Input label="Telefon" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+998901112233" />
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Tavsif</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Ish boshlanish" value={form.workingHoursOpen} onChange={(v) => setForm((f) => ({ ...f, workingHoursOpen: v }))} placeholder="08:00" />
          <Input label="Ish tugash" value={form.workingHoursClose} onChange={(v) => setForm((f) => ({ ...f, workingHoursClose: v }))} placeholder="23:00" />
        </div>
        <button onClick={save} disabled={saving} className="px-6 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {tC('save')}
        </button>
      </div>
    </div>
  );
}

/* ====================== ZONES TAB ====================== */
function ZonesTab({ room }: { room: Room }) {
  const tC = useTranslations('common');
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', type: 'GENERAL_HALL', capacity: 10, pricePerHour: 10000, description: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/rooms/${room.id}/zones`);
      setZones(data.data || []);
    } catch { /* skip */ }
    setLoading(false);
  }, [room.id]);

  useEffect(() => { load(); }, [load]);

  async function saveZone() {
    setSaving(true);
    try {
      const payload = { ...form, pricePerHour: Number(form.pricePerHour), capacity: Number(form.capacity) };
      if (editId) {
        await api.put(`/api/rooms/${room.id}/zones/${editId}`, payload);
      } else {
        await api.post(`/api/rooms/${room.id}/zones`, payload);
      }
      setForm({ name: '', type: 'GENERAL_HALL', capacity: 10, pricePerHour: 10000, description: '' });
      setEditId(null);
      load();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
    setSaving(false);
  }

  function edit(z: Zone) {
    setEditId(z.id);
    setForm({ name: z.name, type: z.type, capacity: Number(z.capacity), pricePerHour: Number(z.pricePerHour), description: '' });
  }

  async function remove(id: string) {
    if (!confirm('O\'chirmoqchimisiz?')) return;
    try { await api.delete(`/api/rooms/${room.id}/zones/${id}`); load(); } catch { /* skip */ }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">{editId ? 'Zonani tahrirlash' : 'Yangi zona'}</h3>
        <div className="space-y-3">
          <Input label="Nomi" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="VIP Zone" />
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Turi</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none">
              {['GENERAL_HALL', 'VIP', 'CABIN'].map((t) => <option key={t} value={t}>{zoneTypeLabel(t)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Sig'im" type="number" value={String(form.capacity)} onChange={(v) => setForm((f) => ({ ...f, capacity: Number(v) }))} />
            <Input label="Narx/soat (so'm)" type="number" value={String(form.pricePerHour)} onChange={(v) => setForm((f) => ({ ...f, pricePerHour: Number(v) }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={saveZone} disabled={saving} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {editId ? 'Yangilash' : tC('save')}
            </button>
            {editId && <button onClick={() => { setEditId(null); setForm({ name: '', type: 'GENERAL_HALL', capacity: 10, pricePerHour: 10000, description: '' }); }} className="px-4 py-2.5 rounded-xl border border-gray-500/30 text-gray-400 text-sm"><X size={15} /></button>}
          </div>
        </div>
      </div>

      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">Zonalar ({zones.length})</h3>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
        ) : zones.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-10">Hali zona yo'q</p>
        ) : (
          <div className="space-y-2">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-neon-cyan/15 bg-cyber-800/50">
                <div>
                  <span className="font-medium">{z.name}</span>
                  <span className="text-xs text-gray-500 ml-2">({zoneTypeLabel(z.type)})</span>
                  <span className="text-xs text-neon-cyan ml-2">{formatPrice(z.pricePerHour)} so'm/soat</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(z)} className="p-1.5 rounded-lg text-neon-cyan hover:bg-neon-cyan/10"><Pencil size={14} /></button>
                  <button onClick={() => remove(z.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== COMPUTERS TAB ====================== */
function ComputersTab({ room }: { room: Room }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [computers, setComputers] = useState<Computer[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', cpu: '', gpu: '', ram: '', status: 'AVAILABLE' });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/api/rooms/${room.id}/zones`).then(({ data }) => {
      const z: Zone[] = data.data || [];
      setZones(z);
      if (z.length) setSelectedZoneId(z[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [room.id]);

  useEffect(() => {
    if (!selectedZoneId) return;
    api.get(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers`).then(({ data }) => setComputers(data.data || [])).catch(() => setComputers([]));
  }, [selectedZoneId, room.id]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = { name: form.name, specs: { cpu: form.cpu, gpu: form.gpu, ram: form.ram }, status: form.status };
      if (editId) {
        await api.put(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers/${editId}`, payload);
      } else {
        await api.post(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers`, payload);
      }
      setForm({ name: '', cpu: '', gpu: '', ram: '', status: 'AVAILABLE' });
      setEditId(null);
      const { data } = await api.get(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers`);
      setComputers(data.data || []);
    } catch (err) { alert(getApiErrorMessage(err)); }
    setSaving(false);
  }

  function edit(c: Computer) {
    setEditId(c.id);
    setForm({ name: c.name, cpu: c.specs?.cpu || '', gpu: c.specs?.gpu || '', ram: c.specs?.ram || '', status: c.status });
  }

  async function remove(id: string) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    try {
      await api.delete(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers/${id}`);
      setComputers((prev) => prev.filter((c) => c.id !== id));
    } catch { /* skip */ }
  }

  async function toggleStatus(c: Computer) {
    const next = c.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE';
    try {
      await api.patch(`/api/rooms/${room.id}/zones/${selectedZoneId}/computers/${c.id}/status`, { status: next });
      setComputers((prev) => prev.map((x) => x.id === c.id ? { ...x, status: next } : x));
    } catch { /* skip */ }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Zona tanlang</label>
        <select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)} className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none max-w-xs">
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name} ({z.type})</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="neo-card rounded-2xl p-5">
          <h3 className="font-bold mb-4">{editId ? 'Kompyuterni tahrirlash' : 'Yangi kompyuter'}</h3>
          <div className="space-y-3">
            <Input label="Nomi" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="PC-01" />
            <Input label="CPU" value={form.cpu} onChange={(v) => setForm((f) => ({ ...f, cpu: v }))} placeholder="Intel i7-13700K" />
            <Input label="GPU" value={form.gpu} onChange={(v) => setForm((f) => ({ ...f, gpu: v }))} placeholder="RTX 4070" />
            <Input label="RAM" value={form.ram} onChange={(v) => setForm((f) => ({ ...f, ram: v }))} placeholder="32GB DDR5" />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {editId ? 'Yangilash' : 'Saqlash'}
              </button>
              {editId && <button onClick={() => { setEditId(null); setForm({ name: '', cpu: '', gpu: '', ram: '', status: 'AVAILABLE' }); }} className="px-4 py-2.5 rounded-xl border border-gray-500/30 text-gray-400 text-sm"><X size={15} /></button>}
            </div>
          </div>
        </div>

        <div className="neo-card rounded-2xl p-5">
          <h3 className="font-bold mb-4">Kompyuterlar ({computers.length})</h3>
          {computers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">Hali kompyuter yo'q</p>
          ) : (
            <div className="space-y-2">
              {computers.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-neon-cyan/15 bg-cyber-800/50 text-sm">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{c.specs?.cpu || ''}</span>
                    <span className={cn('ml-2 text-xs px-1.5 py-0.5 rounded', c.status === 'AVAILABLE' ? 'bg-neon-green/15 text-neon-green' : 'bg-yellow-500/15 text-yellow-400')}>{c.status}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleStatus(c)} className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10" title="Status"><Monitor size={13} /></button>
                    <button onClick={() => edit(c)} className="p-1.5 rounded-lg text-neon-cyan hover:bg-neon-cyan/10"><Pencil size={13} /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== BOOKINGS TAB ====================== */
function BookingsTab({ room }: { room: Room }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/bookings/admin/bookings').then(({ data }) => setBookings(data.data || [])).finally(() => setLoading(false));
  }, []);

  async function setStatus(id: string, status: BookingStatus) {
    try {
      await api.patch(`/api/bookings/admin/bookings/${id}/status`, { status });
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
    } catch (err) { alert(getApiErrorMessage(err)); }
  }

  const STATUS_BADGE: Record<string, string> = {
    PENDING: 'bg-yellow-500/15 text-yellow-400', CONFIRMED: 'bg-neon-cyan/15 text-neon-cyan',
    ACTIVE: 'bg-neon-green/15 text-neon-green', COMPLETED: 'bg-gray-500/15 text-gray-400', CANCELLED: 'bg-red-500/15 text-red-400',
  };

  return (
    <div className="neo-card rounded-2xl p-5">
      <h3 className="font-bold mb-4">Bronlar ({bookings.length})</h3>
      {loading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
        : bookings.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">Bronlar yo'q</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left pb-2 pr-4">Foydalanuvchi</th>
                <th className="text-left pb-2 pr-4">Sana</th>
                <th className="text-left pb-2 pr-4">Vaqt</th>
                <th className="text-left pb-2 pr-4">Narx</th>
                <th className="text-left pb-2 pr-4">Holat</th>
                <th className="text-left pb-2">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-neon-cyan/10">
                  <td className="py-3 pr-4">{b.userId?.slice(0, 8)}...</td>
                  <td className="py-3 pr-4 text-gray-300">{formatDate(b.date)}</td>
                  <td className="py-3 pr-4 text-gray-300">{b.startTime}—{b.endTime}</td>
                  <td className="py-3 pr-4 font-medium text-neon-cyan">{formatPrice(b.finalPrice)}</td>
                  <td className="py-3 pr-4">
                    <span className={cn('px-2 py-1 rounded text-xs font-medium', STATUS_BADGE[b.status])}>{b.status}</span>
                  </td>
                  <td className="py-3">
                    {b.status === 'PENDING' && (
                      <button onClick={() => setStatus(b.id, 'CONFIRMED')} className="text-xs text-neon-green hover:underline">Tasdiqlash</button>
                    )}
                    {['CONFIRMED', 'ACTIVE'].includes(b.status) && (
                      <button onClick={() => setStatus(b.id, 'COMPLETED')} className="text-xs text-gray-400 hover:underline">Yakunlash</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ====================== PROMOS TAB ====================== */
function PromosTab({ room }: { room: Room }) {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ code: '', discountType: 'PERCENTAGE', discountValue: 10, minBookingAmount: 0, maxUses: 100, startsAt: todayISO(), expiresAt: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/promo'); setPromos(data.data || []); } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = {
        code: form.code.toUpperCase(), discountType: form.discountType,
        discountValue: Number(form.discountValue), minBookingAmount: Number(form.minBookingAmount),
        maxUses: Number(form.maxUses), startsAt: form.startsAt, expiresAt: form.expiresAt,
        roomId: room.id,
      };
      if (editId) { await api.patch(`/api/promo/${editId}`, payload); }
      else { await api.post('/api/promo', payload); }
      setForm({ code: '', discountType: 'PERCENTAGE', discountValue: 10, minBookingAmount: 0, maxUses: 100, startsAt: todayISO(), expiresAt: '' });
      setEditId(null);
      load();
    } catch (err) { alert(getApiErrorMessage(err)); }
    setSaving(false);
  }

  function edit(p: PromoCode) {
    setEditId(p.id);
    setForm({ code: p.code, discountType: p.discountType, discountValue: Number(p.discountValue), minBookingAmount: Number(p.minBookingAmount || 0), maxUses: p.maxUses || 100, startsAt: p.startsAt.slice(0, 10), expiresAt: p.expiresAt.slice(0, 10) });
  }

  async function remove(id: string) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    try { await api.delete(`/api/promo/${id}`); load(); } catch { /* skip */ }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">{editId ? 'Promo tahrirlash' : 'Yangi promo-kod'}</h3>
        <div className="space-y-3">
          <Input label="Kod" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} placeholder="YANGIYIL25" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Turi</label>
              <select value={form.discountType} onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                <option value="PERCENTAGE">Foiz (%)</option>
                <option value="FIXED">Aniq (so'm)</option>
              </select>
            </div>
            <Input label="Qiymat" type="number" value={String(form.discountValue)} onChange={(v) => setForm((f) => ({ ...f, discountValue: Number(v) }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Min summa" type="number" value={String(form.minBookingAmount)} onChange={(v) => setForm((f) => ({ ...f, minBookingAmount: Number(v) }))} />
            <Input label="Maks ishlatish" type="number" value={String(form.maxUses)} onChange={(v) => setForm((f) => ({ ...f, maxUses: Number(v) }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Boshlanish" type="date" value={form.startsAt} onChange={(v) => setForm((f) => ({ ...f, startsAt: v }))} />
            <Input label="Tugash" type="date" value={form.expiresAt} onChange={(v) => setForm((f) => ({ ...f, expiresAt: v }))} />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {editId ? 'Yangilash' : 'Saqlash'}
            </button>
            {editId && <button onClick={() => { setEditId(null); setForm({ code: '', discountType: 'PERCENTAGE', discountValue: 10, minBookingAmount: 0, maxUses: 100, startsAt: todayISO(), expiresAt: '' }); }} className="px-4 py-2.5 rounded-xl border border-gray-500/30 text-gray-400 text-sm"><X size={15} /></button>}
          </div>
        </div>
      </div>

      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">Promo-kodlar ({promos.length})</h3>
        {loading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
          : promos.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">Promo yo'q</p> : (
          <div className="space-y-2">
            {promos.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-neon-cyan/15 bg-cyber-800/50">
                <div>
                  <span className="font-bold text-neon-green">{p.code}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.discountType === 'PERCENTAGE' ? `${p.discountValue}%` : `${formatPrice(p.discountValue)} so'm`}</span>
                  <span className="text-xs text-gray-600 ml-2">Ishlatildi: {p.usedCount}/{p.maxUses || '∞'}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(p)} className="p-1.5 rounded-lg text-neon-cyan hover:bg-neon-cyan/10"><Pencil size={14} /></button>
                  <button onClick={() => remove(p.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== NEWS TAB ====================== */
function NewsTab({ room }: { room: Room | null }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', content: '', type: 'NEWS' as const, imageUrl: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/news'); setNews(data.data || []); } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setSaving(true);
    try {
      const payload: any = { ...form, roomId: room?.id || null, imageUrl: form.imageUrl || undefined };
      if (editId) { await api.put(`/api/news/${editId}`, payload); }
      else { await api.post('/api/news', payload); }
      setForm({ title: '', content: '', type: 'NEWS', imageUrl: '' });
      setEditId(null);
      load();
    } catch (err) { alert(getApiErrorMessage(err)); }
    setSaving(false);
  }

  function edit(n: NewsItem) {
    setEditId(n.id);
    setForm({ title: n.title, content: n.content, type: n.type as any, imageUrl: n.imageUrl || '' });
  }

  async function remove(id: string) {
    if (!confirm("O'chirmoqchimisiz?")) return;
    try { await api.delete(`/api/news/${id}`); load(); } catch { /* skip */ }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">{editId ? 'Yangilikni tahrirlash' : 'Yangi yangilik'}</h3>
        <div className="space-y-3">
          <Input label="Sarlavha" value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Yangi tarif!" />
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Matn</label>
            <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Turi</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as any }))} className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                <option value="NEWS">Yangilik</option>
                <option value="PROMOTION">Aktsiya</option>
                <option value="BANNER">Reklama</option>
              </select>
            </div>
            <Input label="Rasm URL" value={form.imageUrl} onChange={(v) => setForm((f) => ({ ...f, imageUrl: v }))} placeholder="https://..." />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {editId ? 'Yangilash' : 'Saqlash'}
            </button>
            {editId && <button onClick={() => { setEditId(null); setForm({ title: '', content: '', type: 'NEWS', imageUrl: '' }); }} className="px-4 py-2.5 rounded-xl border border-gray-500/30 text-gray-400 text-sm"><X size={15} /></button>}
          </div>
        </div>
      </div>

      <div className="neo-card rounded-2xl p-5">
        <h3 className="font-bold mb-4">Yangiliklar ({news.length})</h3>
        {loading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
          : news.length === 0 ? <p className="text-sm text-gray-500 text-center py-10">Yangilik yo'q</p> : (
          <div className="space-y-2">
            {news.map((n) => (
              <div key={n.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-neon-cyan/15 bg-cyber-800/50">
                <div>
                  <span className="font-medium">{n.title}</span>
                  <span className="text-xs text-gray-500 ml-2">{n.type}</span>
                  <span className="text-xs text-gray-600 ml-2">{formatDate(n.publishedAt)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(n)} className="p-1.5 rounded-lg text-neon-cyan hover:bg-neon-cyan/10"><Pencil size={14} /></button>
                  <button onClick={() => remove(n.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== STATS TAB ====================== */
function StatsTab({ room }: { room: Room }) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/api/rooms/${room.id}/stats`).then(({ data }) => setStats(data.data)).finally(() => setLoading(false));
  }, [room.id]);

  if (loading) return <div className="neo-card rounded-2xl h-64 animate-pulse" />;
  if (!stats) return <p className="text-gray-500 text-center py-10">Statistika mavjud emas</p>;

  const cards = [
    { icon: CalendarDays, label: 'Jami bronlar', value: stats.totalBookings ?? 0, color: 'text-neon-cyan' },
    { icon: CircleDollarSign, label: 'Jami tushum', value: `${formatPrice(stats.totalRevenue ?? 0)} so'm`, color: 'text-neon-green' },
    { icon: TrendingUp, label: 'O\'rtacha narx', value: `${formatPrice(stats.avgBookingPrice ?? 0)} so'm`, color: 'text-neon-magenta' },
    { icon: Users, label: 'Zonalar', value: stats.totalZones ?? room._count?.zones ?? 0, color: 'text-neon-purple' },
    { icon: Monitor, label: 'Kompyuterlar', value: stats.totalComputers ?? 0, color: 'text-yellow-400' },
    { icon: Zap, label: 'Aktiv bronlar', value: stats.activeBookings ?? 0, color: 'text-neon-green' },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="neo-card rounded-2xl p-5 text-center">
          <c.icon size={24} className={`mx-auto mb-2 ${c.color}`} />
          <div className="text-2xl font-extrabold">{c.value}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ====================== SHARED INPUT ====================== */
function Input({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none"
      />
    </div>
  );
}