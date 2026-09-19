'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Crown, Users, Building2, CalendarDays, CircleDollarSign, Activity,
  Search, Plus, Trash2, Loader2, Check, ShieldOff, ShieldCheck,
  KeyRound, MapPin, X, PlusCircle, Wallet, Banknote,
} from 'lucide-react';
import api, { getApiErrorMessage } from '@/lib/api';
import type { User, Room } from '@/lib/types';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { TASHKENT_DISTRICTS } from '@/lib/constants';
import { Coffee } from 'lucide-react';
import BarAll from '@/components/super-admin/BarAll';

type Tab = 'overview' | 'users' | 'rooms' | 'bar' | 'payments';

export default function SuperAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  void params;
  const t = useTranslations('superAdmin');
  const user = useAuthStore((s) => s.user);

  const [tab, setTab] = useState<Tab>('overview');

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 text-center">
        <Crown size={48} className="mx-auto mb-4 text-gray-600" />
        <p className="text-gray-400 text-lg">{t('accessDenied')}</p>
      </div>
    );
  }

  const TABS = [
    { key: 'overview' as Tab, icon: Activity, label: t('tabOverview') },
    { key: 'users' as Tab, icon: Users, label: t('tabUsers') },
    { key: 'rooms' as Tab, icon: Building2, label: t('tabRooms') },
    { key: 'bar' as Tab, icon: Coffee, label: 'Gaming Bar' },
    { key: 'payments' as Tab, icon: Wallet, label: 'To\'lovlar' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-6 flex items-center gap-3">
        <Crown size={28} className="text-yellow-400" /> {t('title')}
      </h1>

      <div className="flex items-center gap-1 mb-6 overflow-x-auto scrollbar-thin pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap',
              tab === tb.key
                ? 'border-yellow-400/40 bg-yellow-400/10 text-yellow-300'
                : 'border-neon-cyan/10 text-gray-400 hover:text-neon-cyan hover:border-neon-cyan/20'
            )}
          >
            <tb.icon size={15} />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? <OverviewTab /> : tab === 'users' ? <UsersTab /> : tab === 'rooms' ? <RoomsTab /> : tab === 'payments' ? <PaymentsTab /> : <BarAll />}
    </div>
  );
}

/* ====================== OVERVIEW ====================== */
function OverviewTab() {
  const t = useTranslations('superAdmin');
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/users/stats')
      .then(({ data }) => setStats(data.data))
      .catch(() => { /* skip */ })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="neo-card rounded-2xl h-32 animate-pulse" />)}</div>;
  if (!stats) return <p className="text-gray-500 text-center py-20">Ma'lumot yo'q</p>;

  const cards = [
    { icon: Users, label: t('statUsers'), value: stats.totalUsers, color: 'text-neon-cyan' },
    { icon: ShieldCheck, label: t('statAdmins'), value: stats.totalAdmins, color: 'text-neon-purple' },
    { icon: Building2, label: t('statRooms'), value: stats.totalRooms, color: 'text-neon-green' },
    { icon: CalendarDays, label: t('statBookings'), value: stats.totalBookings, color: 'text-neon-magenta' },
    { icon: CircleDollarSign, label: t('statRevenue'), value: `${formatPrice(stats.totalRevenue)} so'm`, color: 'text-yellow-400' },
    { icon: Activity, label: t('statActive'), value: stats.activeBookings, color: 'text-neon-green' },
  ];

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="neo-card rounded-2xl p-5 text-center">
            <c.icon size={24} className={cn('mx-auto mb-2', c.color)} />
            <div className="text-2xl font-extrabold">{c.value}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{c.label}</div>
          </div>
        ))}
      </div>

      <h3 className="font-bold text-lg mb-3">{t('recentRooms')}</h3>
      <div className="neo-card rounded-2xl divide-y divide-neon-cyan/10">
        {stats.recentRooms?.length === 0 && <p className="text-sm text-gray-500 p-6 text-center">{t('noRooms')}</p>}
        {stats.recentRooms?.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-gray-500 ml-2">{r.address}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">{r._count?.bookings || 0} bron</span>
              <RoomStatusBadge status={r.status} />
            </div>
          </div>
        ))}
      </div>

      <h3 className="font-bold text-lg mt-8 mb-3 flex items-center gap-2">
        <Building2 size={18} className="text-yellow-400" /> {t('districtSales')}
      </h3>
      {!stats.districtStats || stats.districtStats.length === 0 ? (
        <p className="text-sm text-gray-500 neo-card rounded-2xl p-6 text-center">
          Hozircha to'lovlar yo'q. Bron va to'lovlar boshlanishi bilan tumanlar bo'yicha statistikani bu yerda ko'rasiz.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.districtStats.map((d: any) => {
            const max = Math.max(...stats.districtStats.map((x: any) => x.revenue), 1);
            const pct = Math.max(4, Math.round((d.revenue / max) * 100));
            return (
              <div key={d.district} className="neo-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold flex items-center gap-2">
                    <MapPin size={14} className="text-neon-cyan" /> {d.district}
                  </span>
                  <span className="text-yellow-400 font-bold text-sm">{formatPrice(d.revenue)} so'm</span>
                </div>
                <div className="h-2 rounded-full bg-cyber-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-yellow-400" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-gray-500 mt-1.5">{d.bookings} ta bron</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ====================== USERS ====================== */
function UsersTab() {
  const t = useTranslations('superAdmin');
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ email: '', fullName: '', password: '', phone: '' });
  const [adding, setAdding] = useState(false);
  const me = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (roleFilter) params.set('role', roleFilter);
      if (search) params.set('search', search);
      const { data } = await api.get(`/api/users?${params}`);
      setUsers(data.data.users || []);
      setTotal(data.data.total || 0);
    } catch { /* skip */ }
    setLoading(false);
  }, [search, roleFilter]);

  useEffect(() => {
    const h = setTimeout(() => load(), 300);
    return () => clearTimeout(h);
  }, [load]);

  async function toggleStatus(u: User) {
    const next = u.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
    const ok = next === 'BLOCKED'
      ? confirm(`"${u.fullName}" ni bloklash?`)
      : true;
    if (!ok) return;
    try {
      await api.patch(`/api/users/${u.id}/status`, { status: next });
      load();
    } catch (err) { alert(getApiErrorMessage(err)); }
  }

  async function remove(u: User) {
    if (!confirm(`"${u.fullName}" ni o'chirish?`)) return;
    try { await api.delete(`/api/users/${u.id}`); load(); } catch (err) { alert(getApiErrorMessage(err)); }
  }

  async function addAdmin() {
    setAdding(true);
    setMsg(null);
    try {
      await api.post('/api/users/admins', addForm);
      setMsg('Admin yaratildi!');
      setAddForm({ email: '', fullName: '', password: '', phone: '' });
      setShowAdd(false);
      load();
    } catch (err) { setMsg(getApiErrorMessage(err)); }
    setAdding(false);
  }

  const ROLE_BADGE: Record<string, string> = {
    SUPER_ADMIN: 'bg-yellow-400/15 text-yellow-300',
    ADMIN: 'bg-neon-purple/15 text-neon-purple',
    USER: 'bg-neon-cyan/15 text-neon-cyan',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchUsers')}
            className="glass-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none"
        >
          <option value="">{t('allRoles')}</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
        </select>
        <button onClick={() => setShowAdd((s) => !s)} className="px-4 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2">
          <Plus size={15} /> {t('createAdmin')}
        </button>
      </div>

      <div className="text-xs text-gray-500">Jami: {total} ta</div>

      {showAdd && (
        <div className="neo-card rounded-2xl p-5 border border-yellow-400/20">
          <h3 className="font-bold mb-3 flex items-center gap-2"><ShieldCheck size={16} className="text-yellow-400" /> {t('createAdmin')}</h3>
          {msg && (
            <div className={cn('mb-3 px-3 py-2 rounded-lg text-sm', msg.includes('xatolik') || msg.includes('Xatolik') ? 'bg-red-500/10 text-red-300' : 'bg-neon-green/10 text-neon-green')}>
              <Check size={14} className="inline mr-1" />{msg}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={addForm.fullName} onChange={(e) => setAddForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Ism Familiya" className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
            <input value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
            <input type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} placeholder={t('password')} className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
            <input value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+998901234567" className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
          </div>
          <button onClick={addAdmin} disabled={adding} className="mt-3 px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            {adding ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} {t('createAdmin')}
          </button>
        </div>
      )}

      <div className="neo-card rounded-2xl overflow-x-auto">
        {loading ? (
          <div className="space-y-2 p-5">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-14">{t('noUsers')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-5 py-3">{t('name')}</th>
                <th className="text-left px-5 py-3">Email</th>
                <th className="text-left px-5 py-3">Telefon</th>
                <th className="text-left px-5 py-3">Rol</th>
                <th className="text-left px-5 py-3">Holat</th>
                <th className="text-left px-5 py-3">Ro'yxatdan o'tgan</th>
                <th className="px-5 py-3">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="border-t border-neon-cyan/10">
                  <td className="px-5 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-5 py-3 font-medium">{u.fullName}</td>
                  <td className="px-5 py-3 text-gray-300">{u.email}</td>
                  <td className="px-5 py-3 text-gray-400">{u.phone || '—'}</td>
                  <td className="px-5 py-3"><span className={cn('px-2 py-0.5 rounded text-xs font-medium', ROLE_BADGE[u.role])}>{u.role}</span></td>
                  <td className="px-5 py-3">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', u.status === 'ACTIVE' ? 'bg-neon-green/15 text-neon-green' : 'bg-red-500/15 text-red-400')}>{u.status}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{u.createdAt ? formatDate(u.createdAt) : '—'}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1.5">
                      {u.id !== me?.id && (
                        <>
                          <button
                            onClick={() => toggleStatus(u)}
                            title={u.status === 'ACTIVE' ? 'Bloklash' : 'Faollashtirish'}
                            className={cn('p-1.5 rounded-lg hover:bg-white/5', u.status === 'ACTIVE' ? 'text-red-400' : 'text-neon-green')}
                          >
                            {u.status === 'ACTIVE' ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                          </button>
                          <button onClick={() => remove(u)} title="O'chirish" className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ====================== ROOMS ====================== */
const ZONE_TYPES = ['GENERAL_HALL', 'VIP', 'CABIN'];

function RoomsTab() {
  const t = useTranslations('superAdmin');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [admins, setAdmins] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    address: '',
    district: '',
    ownerId: '',
    status: 'PENDING',
  });
  const [zones, setZones] = useState([{ name: 'Umumiy zal', type: 'GENERAL_HALL', pricePerHour: '', computerCount: '20' }]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/rooms/all'); setRooms(data.data || []); } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    api.get('/api/users?role=ADMIN&limit=200')
      .then(({ data }) => setAdmins(data.data?.users || []))
      .catch(() => { /* skip */ });
  }, [load]);

  async function createRoom() {
    if (!form.name || !form.address || !form.ownerId) {
      setMsg('Xona nomi, manzili va adminini tanlang');
      return;
    }
    setCreating(true);
    setMsg(null);
    try {
      await api.post('/api/rooms/super-admin', {
        ...form,
        status: form.status,
        zones: zones.map((z) => ({
          name: z.name,
          type: z.type,
          pricePerHour: Number(z.pricePerHour) || 0,
          computerCount: Number(z.computerCount) || 0,
        })),
      });
      setMsg('Xona yaratildi va adminda tayinlandi!');
      setShowCreate(false);
      setForm({ name: '', address: '', district: '', ownerId: '', status: 'PENDING' });
      setZones([{ name: 'Umumiy zal', type: 'GENERAL_HALL', pricePerHour: '', computerCount: '20' }]);
      load();
    } catch (err) { setMsg(getApiErrorMessage(err)); }
    setCreating(false);
  }

  async function setStatus(room: Room, status: 'ACTIVE' | 'INACTIVE') {
    setMsg(null);
    try {
      await api.put(`/api/rooms/${room.id}`, { status });
      setMsg(`"${room.name}" — ${status === 'ACTIVE' ? 'faollashtirildi' : 'yopildi'}`);
      load();
    } catch (err) { setMsg(getApiErrorMessage(err)); }
  }

  async function remove(room: Room) {
    if (!confirm(`"${room.name}" ni o'chirish?`)) return;
    try { await api.delete(`/api/rooms/${room.id}`); load(); } catch (err) { alert(getApiErrorMessage(err)); }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className="px-3 py-2 rounded-lg text-sm bg-neon-green/10 border border-neon-green/30 text-neon-green">
          <Check size={14} className="inline mr-1" />{msg}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setShowCreate((s) => !s)} className="px-4 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2">
          <PlusCircle size={15} /> {t('createRoom')}
        </button>
      </div>

      {/* Xona yaratish formasi */}
      {showCreate && (
        <div className="neo-card rounded-2xl p-5 border border-yellow-400/20 space-y-4">
          <h3 className="font-bold flex items-center gap-2"><Building2 size={16} className="text-yellow-400" /> {t('createRoom')}</h3>

          <div className="grid sm:grid-cols-2 gap-3">
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Xona nomi (masalan: Obsidian Arena)" className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Manzil" className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none" />
            <select value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none">
              <option value="">Tumanni tanlang</option>
              {TASHKENT_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={form.ownerId} onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))} className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none">
              <option value="">Adminni tanlang</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.fullName} ({a.email})</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="glass-input rounded-xl px-3 py-2.5 text-sm outline-none">
              <option value="PENDING">Kutish holatida (PENDING)</option>
              <option value="ACTIVE">Faol (ACTIVE)</option>
            </select>
          </div>

          {/* Zonalar */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Zonalar va kompyuterlar</p>
            {zones.map((z, zi) => (
              <div key={zi} className="grid sm:grid-cols-4 gap-2 items-center">
                <input value={z.name} onChange={(e) => setZones((zs) => zs.map((x, i) => i === zi ? { ...x, name: e.target.value } : x))} placeholder="Zona nomi" className="glass-input rounded-xl px-3 py-2 text-sm outline-none" />
                <select value={z.type} onChange={(e) => setZones((zs) => zs.map((x, i) => i === zi ? { ...x, type: e.target.value } : x))} className="glass-input rounded-xl px-3 py-2 text-sm outline-none">
                  {ZONE_TYPES.map((zt) => <option key={zt} value={zt}>{zt}</option>)}
                </select>
                <input value={z.pricePerHour} onChange={(e) => setZones((zs) => zs.map((x, i) => i === zi ? { ...x, pricePerHour: e.target.value } : x))} placeholder="Soatlik narx" type="number" className="glass-input rounded-xl px-3 py-2 text-sm outline-none" />
                <div className="flex gap-2">
                  <input value={z.computerCount} onChange={(e) => setZones((zs) => zs.map((x, i) => i === zi ? { ...x, computerCount: e.target.value } : x))} placeholder="Kompyuter soni" type="number" className="glass-input flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
                  <button onClick={() => setZones((zs) => zs.filter((_, i) => i !== zi))} className="px-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"><X size={14} /></button>
                </div>
              </div>
            ))}
            <button onClick={() => setZones((zs) => [...zs, { name: '', type: 'GENERAL_HALL', pricePerHour: '', computerCount: '10' }])} className="px-3 py-1.5 rounded-lg border border-neon-cyan/30 text-neon-cyan text-xs font-bold hover:bg-neon-cyan/10 flex items-center gap-1">
              <Plus size={13} /> Zona qo'shish
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={createRoom} disabled={creating} className="px-5 py-2.5 rounded-xl neon-btn text-sm font-bold flex items-center gap-2 disabled:opacity-50">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Xonani yaratish
            </button>
            <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-xl btn-ghost text-sm font-medium">Bekor qilish</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
      ) : rooms.length === 0 ? (
        <p className="text-gray-500 text-center py-20">{t('noRooms')}</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.id} className="neo-card rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold">{r.name}</h3>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.address}</p>
                </div>
                <RoomStatusBadge status={r.status} />
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                <div className="flex items-center gap-1.5"><Users size={12} className="text-neon-cyan" /> Admin: {r.owner?.fullName || r.ownerId?.slice(0, 8) || '—'}</div>
                {r._count && <div className="text-gray-500">Zonalar: {r._count.zones} · Bronlar: {r._count.bookings} · Reytinglar: {r._count.reviews}</div>}
              </div>
              <div className="flex gap-2 pt-1">
                {r.status !== 'ACTIVE' && (
                  <button onClick={() => setStatus(r, 'ACTIVE')} className="px-3 py-1.5 rounded-lg bg-neon-green/15 text-neon-green text-xs font-bold hover:bg-neon-green/25">
                    <Check size={13} className="inline mr-1" />{t('activate')}
                  </button>
                )}
                {r.status === 'ACTIVE' && (
                  <button onClick={() => setStatus(r, 'INACTIVE')} className="px-3 py-1.5 rounded-lg bg-yellow-500/15 text-yellow-400 text-xs font-bold hover:bg-yellow-500/25">
                    {t('deactivate')}
                  </button>
                )}
                <button onClick={() => remove(r)} className="ml-auto px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold hover:bg-red-500/25">
                  <Trash2 size={13} className="inline mr-1" />{t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ====================== PAYMENTS ====================== */
function PaymentsTab() {
  const [payments, setPayments] = useState<Array<any> | null>(null);
  const [total, setTotal] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/payments?limit=100');
      setPayments(data.data?.payments || []);
      setTotal(data.data?.total || 0);
      setRevenue(data.data?.revenue || 0);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusStyle: Record<string, string> = {
    PENDING: 'bg-yellow-500/15 text-yellow-400',
    COMPLETED: 'bg-neon-green/15 text-neon-green',
    FAILED: 'bg-red-500/15 text-red-400',
    REFUNDED: 'bg-gray-500/15 text-gray-400',
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="neo-card rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Banknote size={13} /> Jami (COMPLETED)</p>
          <p className="text-2xl font-extrabold text-neon-green mt-1">{formatPrice(revenue)} so'm</p>
        </div>
        <div className="neo-card rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Wallet size={13} /> Transaksiyalar</p>
          <p className="text-2xl font-extrabold mt-1">{total}</p>
        </div>
        <div className="neo-card rounded-2xl p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1"><CircleDollarSign size={13} /> Platforma aylanmasi</p>
          <p className="text-2xl font-extrabold text-yellow-400 mt-1">{formatPrice(revenue)} so'm</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-cyber-800 animate-pulse" />)}</div>
      ) : !payments?.length ? (
        <p className="text-gray-500 text-center py-16">To'lovlar hali yo'q</p>
      ) : (
        <div className="neo-card rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-neon-cyan/10">
                <th className="px-4 py-3">Foydalanuvchi</th>
                <th className="px-4 py-3">Xona</th>
                <th className="px-4 py-3">Miqdor</th>
                <th className="px-4 py-3">Tur</th>
                <th className="px-4 py-3">Usul</th>
                <th className="px-4 py-3">Holat</th>
                <th className="px-4 py-3">Sana</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-gray-300">{p.user?.fullName || p.user?.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{p.booking?.room?.name || '—'}</td>
                  <td className="px-4 py-3 font-bold text-neon-cyan">{formatPrice(p.amount)} so'm</td>
                  <td className="px-4 py-3 text-gray-300">{p.type === 'ADVANCE' ? 'Avans (30%)' : 'Qoldiq (70%)'}</td>
                  <td className="px-4 py-3 text-gray-400">{p.method || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', statusStyle[p.status] || 'bg-gray-500/15 text-gray-400')}>{p.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ====================== SHARED ====================== */
function RoomStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-neon-green/15 text-neon-green',
    INACTIVE: 'bg-gray-500/15 text-gray-400',
    PENDING: 'bg-yellow-500/15 text-yellow-400',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium shrink-0', map[status] || 'bg-gray-500/15 text-gray-400')}>{status}</span>;
}