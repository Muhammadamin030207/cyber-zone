# CYBER-ZONE — Kompyuter Xona SaaS Platformasi
## Texnik Topshiriq (TZ) v1.0

---

## 1. LOYIHA HAQIDA

**Cyber-Zone** — bu kompyuter xonalarini boshqarish va ularni foydalanuvchilarga ko'rsatish uchun SaaS (Software as a Service) platformasi. Super admin platformani boshqaradi, kompyuter xona egalari (adminlar) o'z xonalarini yaratadi, oddiy foydalanuvchilar esa xonalarni qidirib, bron qiladi.

---

## 2. FOYDALANUVCHI TURLARI

### 2.1 Super Admin (`super_admin`)
- Platformaning to'liq boshqaruvchisi
- Barcha adminlarni boshqarish (yaratish, bloklash, o'chirish)
- Barcha foydalanuvchilarni boshqarish
- Sayt sozlamalarini boshqarish (tariflar, tillar, dizayn)
- Statistika va hisobotlarni ko'rish
- Yangiliklar/reklamalar nazorati
- To'lov tizimini boshqarish

### 2.2 Admin — Kompyuter Xona Egasi (`admin`)
- O'z kompyuter xonasini yaratishi va boshqarishi
- Xonalar (zonalar) qo'shishi: Obshiy zal, VIP zona, Kabinalar
- Kompyuterlar qo'shishi va ularning holatini boshqarishi
- Narxlarni/tariflarni belgilashi
- Bronlarni boshqarishi (qabul qilish, rad etish)
- Lokatsiya (manzil + xarita) kiritishi
- O'z foydalanuvchilarini ko'rish
- O'z statistikasini ko'rish
- Yangiliklar/reklamalar joylashtirishi

### 2.3 Foydalanuvchi (`user`)
- Ro'yxatdan o'tish / tizimga kirish
- Kompyuter xonalarini qidirish (lokatsiya bo'yicha)
- Xona ma'lumotlarini ko'rish (zonalar, kompyuterlar, narxlar)
- Bron qilish (30% oldindan to'lov bilan)
- Bron holatini kuzatish
- To'lovni amalga oshirish
- Shaxsiy kabinet (tarix, bronlar)

---

## 3. ASOSIY FUNKSIYALAR

### 3.1 Autentifikatsiya va Avtorizatsiya
- **Super Admin:** database orqali yaratiladi (seed skript) — ro'yxatdan o'tmaydi
- **Admin:** Super Admin tomonidan yaratiladi (email + parol beriladi)
- **User:** O'zi ro'yxatdan o'tadi (register) yoki Google OAuth orqali (Gmail)
- **Google OAuth 2.0** integratsiyasi (Gmail bilan kirish)
- JWT token asosida sessiya boshqarish
- Rollar bo'yicha ruxsatlar (permissions)
- Parolni tiklash (email orqali)

### 3.2 Kompyuter Xona Boshqaruvi (Admin)
- **Xona yaratish:**
  - Nomi
  - Lokatsiya (manzil + Google Maps koordinatalari)
  - Telefon raqami
  - Rasmlar (bir nechta)
  - Tavsif
  - Ish vaqti
  - Status (faol/nofaol)

- **Zonalar (xonalar) boshqaruvi:**
  - Obshiy zal (umumiy zal)
  - VIP zona
  - Kabinalar (yakka yoki 2-4 kishilik)
  - Har bir zona uchun: nomi, tavsifi, kompyuterlar soni

- **Kompyuterlar boshqaruvi:**
  - Kompyuter raqami/nomi
  - Zonaga tegishliligi
  - Xususiyatlari (CPU, GPU, RAM, Monitor, Aksessuarlar)
  - Holati (faol/suvga tushgan/ta'mirda/band)
  - Soatlik narxi (zona bo'yicha farq qilishi mumkin)

- **Narxlar/Tariflar:**
  - Soatlik narx
  - Kunlik narx (ixtiyoriy)
  - VIP zona uchun alohida narx
  - Kabina uchun alohida narx
  - Chegirmalar va maxsus takliflar

### 3.3 Bron Tizimi (Booking)
- **Foydalanuvchi tomonidan:**
  - Zonani tanlash (obshiy zal / VIP / kabina)
  - Vaqtni tanlash (sana + boshlanish vaqti)
  - Davomiyligini tanlash (soat)
  - Kompyuterni tanlash (ixtiyoriy yoki avtomatik)
  - Bronni tasdiqlash
  - 30% oldindan to'lovni amalga oshirish
  - Qoldiq to'lov — xonaga kelganida (naqd)

- **Admin tomonidan:**
  - Bronlarni ko'rish (kunlik, haftalik, oylik)
  - Bronni qabul qilish / rad etish
  - Bronni bekor qilish
  - Bron holatini o'zgartirish

- **Avtomatik boshqaruv:**
  - Bron vaqti tugaganda kompyuter "bo'sh" ga o'tishi
  - Band bo'lgan kompyuterni boshqa foydalanuvchi ko'rmasligi
  - Real vaqtda yangilanish (WebSocket)

### 3.4 To'lov Tizimi
- **Oldindan to'lov (30%):**
  - Onlayn to'lov: Payme, Click, UZCARD
  - To'lov holatini kuzatish
  - Chek/sovutma generatsiya qilish
- **Qoldiq to'lov (70%):**
  - Naqd pul (xonada)
  - To'lov tasdig'i

### 3.5 Qidiruv Tizimi
- Lokatsiya bo'yicha qidirish (Google Maps API)
- Rayon bo'yicha filtrlash
- Narx bo'yicha filtrlash
- Zona turi bo'yicha filtrlash
- Kompyuter xususiyatlari bo'yicha qidirish
- Xaritada ko'rish (markerlar bilan)

### 3.6 Yangiliklar / Reklamalar
- Adminlar o'z xonalariga yangiliklar/reklamalar qo'shishi
- Super admin umumiy yangiliklar joylashtirishi
- Banner reklamalar (asosiy sahifada)
- Chegirmalar va maxsus takliflar

### 3.7 Statistika
- **Super admin uchun:**
  - Jami foydalanuvchilar soni
  - Jami kompyuter xonalar soni
  - Jami bronlar soni
  - Jami tushum
  - Faol adminlar
  - Grafik va diagrammalar

- **Admin uchun:**
  - O'z xonasidagi bronlar statistikasi
  - Kunlik/haftalik/oylik tushum
  - Kompyuterlar bandligi
  - Eng ko'p band bo'lgan vaqt

---

## 4. TEXNOLOGIYALAR

### 4.1 Frontend
- **React 18+** + **Next.js 14+** (App Router)
- **TypeScript**
- **Tailwind CSS** — styling
- **shadcn/ui** — UI komponentlari
- **Zustand** — state management
- **Axios** — HTTP so'rovlar
- **React Hook Form + Zod** — formalar validatsiyasi
- **next-intl** — ko'p tillilik (i18n)
- **Socket.io-client** — real vaqt yangilanish
- **Google Maps API** — xarita
- **Recharts / Chart.js** — grafiklar

### 4.2 Backend
- **Node.js 20+**
- **Express.js** — web framework
- **TypeScript**
- **Prisma ORM** — database bilan ishlash
- **PostgreSQL 16** — ma'lumotlar bazasi
- **Redis** — caching + session
- **JWT** — autentifikatsiya
- **Passport.js / Google OAuth 2.0** — Gmail bilan kirish
- **Socket.io** — real vaqt kommunikatsiya
- **Multer + Cloudinary** — fayllar/rasmlar saqlash
- **Nodemailer** — email yuborish
- **Zod** — validatsiya

### 4.3 Deploy
- **Frontend:** Vercel / Netlify
- **Backend:** Railway / DigitalOcean / VPS
- **Database:** Supabase / Neon / self-hosted PostgreSQL
- **Redis:** Upstash / Redis Cloud
- **Domain:** Cyber-ZONE.uz (yoki .com)

---

## 5. MA'LUMOTLAR BAZASI (DATABASE SCHEMA)

### 5.1 Asosiy jadvallar

```
users
├── id (UUID)
├── email
├── password_hash (nullable — Google OAuth uchun)
├── google_id (nullable)
├── full_name
├── phone
├── avatar_url
├── role (super_admin | admin | user)
├── language (uz | ru | en)
├── is_active
├── created_at
├── updated_at

computer_rooms
├── id (UUID)
├── owner_id → users.id (admin)
├── name
├── description
├── address
├── latitude
├── longitude
├── phone
├── working_hours (JSON)
├── images (JSON array)
├── status (active | inactive | pending)
├── created_at
├── updated_at

zones
├── id (UUID)
├── room_id → computer_rooms.id
├── name (obshiy_zal | vip | kabina)
├── description
├── capacity
├── price_per_hour
├── status
├── created_at
├── updated_at

computers
├── id (UUID)
├── zone_id → zones.id
├── name/number
├── specs (JSON: cpu, gpu, ram, monitor, peripherals)
├── status (available | occupied | maintenance | broken)
├── created_at
├── updated_at

bookings
├── id (UUID)
├── user_id → users.id
├── computer_id → computers.id
├── zone_id → zones.id
├── room_id → computer_rooms.id
├── date
├── start_time
├── end_time
├── duration_hours
├── total_price
├── advance_payment (30%)
├── remaining_payment (70%)
├── status (pending | confirmed | active | completed | cancelled)
├── created_at
├── updated_at

payments
├── id (UUID)
├── booking_id → bookings.id
├── user_id → users.id
├── amount
├── type (advance | remaining)
├── method (payme | click | uzcard | cash)
├── status (pending | completed | failed | refunded)
├── transaction_id
├── paid_at
├── created_at

news
├── id (UUID)
├── room_id → computer_rooms.id (nullable — null = platform-wide)
├── author_id → users.id
├── title
├── content
├── image_url
├── type (news | promotion | banner)
├── is_active
├── published_at
├── created_at
├── updated_at

reviews
├── id (UUID)
├── user_id → users.id
├── room_id → computer_rooms.id
├── rating (1-5)
├── comment
├── created_at

notifications
├── id (UUID)
├── user_id → users.id
├── title
├── message
├── type
├── is_read
├── created_at
```

---

## 6. SAHIFALAR (PAGES)

### 6.1 Umumiy sahifalar (Hammaga ochiq)
| Sahifa | URL | Tavsif |
|--------|-----|--------|
| Asosiy sahifa | `/` | Banner, top xonalar, qidiruv |
| Kompyuter xonalar ro'yxati | `/rooms` | Barcha xonalar (filtrlash bilan) |
| Xona sahifasi | `/rooms/[id]` | Batafsil: zonalar, kompyuterlar, narxlar, xarita |
| Qidiruv natijalari | `/search?q=&location=` | Qidiruv natijalari |
| Yangiliklar | `/news` | Yangiliklar va reklamalar |
| Kirish | `/login` | Login sahifasi |
| Ro'yxatdan o'tish | `/register` | Ro'yxatdan o'tish |

### 6.2 Foydalanuvchi sahifalari (User)
| Sahifa | URL | Tavsif |
|--------|-----|--------|
| Shaxsiy kabinet | `/dashboard` | Bronlar tarixi, profil |
| Bron yaratish | `/booking/[room-id]` | Bron formasi |
| Bron tafsilotlari | `/booking/[id]` | Bron ma'lumotlari, to'lov |
| To'lov | `/payment/[booking-id]` | To'lov sahifasi |
| Sozlamalar | `/settings` | Profil, til o'zgartirish |

### 6.3 Admin sahifalari (Kompyuter xona egasi)
| Sahifa | URL | Tavsif |
|--------|-----|--------|
| Admin panel | `/admin` | Dashboard, statistika |
| Mening xonam | `/admin/room` | Xona ma'lumotlari |
| Zonalar | `/admin/zones` | Zonalar ro'yxati |
| Kompyuterlar | `/admin/computers` | Kompyuterlar ro'yxati |
| Bronlar | `/admin/bookings` | Bronlarni boshqarish |
| Narxlar | `/admin/pricing` | Tariflarni boshqarish |
| Yangiliklar | `/admin/news` | Yangiliklar qo'shish |
| Foydalanuvchilar | `/admin/users` | Foydalanuvchilar ro'yxati |
| Sozlamalar | `/admin/settings` | Xona sozlamalari |

### 6.4 Super Admin sahifalari
| Sahifa | URL | Tavsif |
|--------|-----|--------|
| Dashboard | `/super-admin` | Umumiy statistika |
| Adminlar | `/super-admin/admins` | Adminlarni boshqarish |
| Foydalanuvchilar | `/super-admin/users` | Foydalanuvchilarni boshqarish |
| Xonalar | `/super-admin/rooms` | Barcha xonalar |
| Bronlar | `/super-admin/bookings` | Barcha bronlar |
| To'lovlar | `/super-admin/payments` | To'lovlar tarixi |
| Yangiliklar | `/super-admin/news` | Umumiy yangiliklar |
| Sozlamalar | `/super-admin/settings` | Platform sozlamalari |

---

## 7. API ENDPOINTLARI

### 7.1 Auth
```
POST   /api/auth/register          (user)
POST   /api/auth/login
POST   /api/auth/login/google      (Google OAuth)
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/me
```

### 7.2 Users
```
GET    /api/users          (super_admin)
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id      (super_admin)
POST   /api/super-admin/admins  (super_admin — admin yaratish)
```

### 7.3 Computer Rooms
```
GET    /api/rooms              (public — barcha xonalar)
GET    /api/rooms/:id          (public — bitta xona)
POST   /api/rooms              (admin — yangi xona)
PUT    /api/rooms/:id          (admin — o'zgartirish)
DELETE /api/rooms/:id          (super_admin — o'chirish)
GET    /api/rooms/:id/stats    (admin — statistika)
```

### 7.4 Zones
```
GET    /api/rooms/:roomId/zones
POST   /api/rooms/:roomId/zones     (admin)
PUT    /api/zones/:id               (admin)
DELETE /api/zones/:id               (admin)
```

### 7.5 Computers
```
GET    /api/zones/:zoneId/computers
GET    /api/computers/:id
POST   /api/computers               (admin)
PUT    /api/computers/:id           (admin)
DELETE /api/computers/:id           (admin)
PATCH  /api/computers/:id/status    (admin)
```

### 7.6 Bookings
```
GET    /api/bookings                (user — o'z bronlari)
GET    /api/admin/bookings          (admin — xona bronlari)
GET    /api/super-admin/bookings    (super_admin — barcha bronlar)
POST   /api/bookings                (user — yangi bron)
GET    /api/bookings/:id
PUT    /api/bookings/:id/cancel
PATCH  /api/admin/bookings/:id/status   (admin — tasdiqlash/rad etish)
```

### 7.7 Payments
```
POST   /api/payments/create         (user — to'lov yaratish)
POST   /api/payments/callback       (webhook — to'lov tasdig'i)
GET    /api/payments/:bookingId     (to'lov holati)
```

### 7.8 Search
```
GET    /api/search?location=&type=&price_min=&price_max=
GET    /api/rooms/nearby?lat=&lng=&radius=
```

### 7.9 News
```
GET    /api/news                    (public)
GET    /api/rooms/:roomId/news      (xona yangiliklari)
POST   /api/news                    (admin/super_admin)
PUT    /api/news/:id                (admin/super_admin)
DELETE /api/news/:id
```

### 7.10 Stats
```
GET    /api/super-admin/stats       (super_admin)
GET    /api/admin/stats             (admin)
```

---

## 8. UX/UI TALABLARI

### 8.1 Dizayn Prinsiplari
- **Dark theme** — asosiy tema (cyber/gaming uslubida)
- Neon ranglar: ko'k (#00D4FF), pushti (#FF00FF), yashil (#00FF88)
- Zamonaviy, gaming uslubida dizayn
- Responsive — mobil, planshet, desktop
- Tez yuklanish (< 2 sekund)
- Animatsiyalar (Matrix/tech uslubida)

### 8.2 Asosiy Sahifa
- Hero section: Cyber-ZONE logotipi + qidiruv
- Premium xonalar carousel
- Xaritada xonalar (Google Maps markerlar)
- Yangiliklar/reklamalar
- Statistika (foydalanuvchilar, xonalar, bronlar)

### 8.3 Kompyuter Xona Sahfasi
- Galereya (rasmlar slaydshou)
- Xarita (lokatsiya)
- Zonalar va kompyuterlar (interaktiv sxema)
- Narxlar jadvali
- Bron qilish tugmasi
- Sharhlar

---

## 9. LOYIHA TUZILISHI (FOLDER STRUCTURE)

```
cyber-zone/
├── frontend/                  # Next.js frontend
│   ├── src/
│   │   ├── app/               # App Router sahifalar
│   │   ├── components/        # React komponentlari
│   │   │   ├── ui/            # shadcn/ui komponentlari
│   │   │   ├── layout/        # Header, Footer, Sidebar
│   │   │   ├── rooms/         # Xona komponentlari
│   │   │   ├── booking/       # Bron komponentlari
│   │   │   ├── admin/         # Admin panel komponentlari
│   │   │   └── common/        # Umumiy komponentlar
│   │   ├── lib/               # Utility funksiyalar
│   │   ├── hooks/             # Custom React hooks
│   │   ├── store/             # Zustand store
│   │   ├── types/             # TypeScript type'lar
│   │   ├── i18n/              # Tarjimalar
│   │   │   ├── uz.json
│   │   │   ├── ru.json
│   │   │   └── en.json
│   │   └── styles/            # Global stillar
│   ├── public/                # Static fayllar
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                   # Express.js backend
│   ├── src/
│   │   ├── controllers/       # Controller funksiyalar
│   │   ├── services/          # Business logic
│   │   ├── routes/            # API route'lar
│   │   ├── middlewares/       # Auth, validation, error
│   │   ├── prisma/            # Prisma schema va migratsiyalar
│   │   │   └── schema.prisma
│   │   ├── utils/             # Utility funksiyalar
│   │   ├── types/             # TypeScript type'lar
│   │   └── config/            # Konfiguratsiya
│   ├── uploads/               # Yuklangan fayllar
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── .gitignore
├── README.md
└── docker-compose.yml         # (ixtiyoriy) Docker sozlamasi
```

---

## 10. ISHLAB CHIQISH QADAMLARI

### Bosqich 1: Asosiy tuzilma (Setup)
1. Backend: Prisma schema, database migratsiya
2. Backend: Auth tizimi (register, login, JWT)
3. Backend: CRUD API endpointlari
4. Frontend: Layout, komponentlar, routing
5. Frontend: Auth sahifalari (login, register)
6. Frontend: i18n (3 til) sozlash

### Bosqich 2: Asosiy funksiyalar
1. Kompyuter xona CRUD (admin)
2. Zonalar va kompyuterlar CRUD
3. Kompyuter xonalar ro'yxati (public)
4. Xona sahifasi (batafsil)
5. Qidiruv tizimi

### Bosqich 3: Bron va to'lov
1. Bron yaratish tizimi
2. Bron boshqaruv paneli (admin)
3. To'lov tizimi (Payme/Click integratsiya)
4. Real vaqt yangilanish (WebSocket)

### Bosqich 4: Admin panel
1. Admin dashboard (statistika)
2. Boshqaruv sahifalari
3. Yangiliklar/reklamalar

### Bosqich 5: Super Admin
1. Super admin dashboard
2. Platform boshqaruvi
3. Umumiy statistika

### Bosqich 6: Polish
1. Responsive dizayn tekshirish
2. Xatolarni tuzatish
3. Test qilish
4. Deploy

---

## 11. MAXFIYLIK VA XAVFSIZLIK

- Parollar bcrypt bilan hashlanadi
- JWT token limited time (access: 15min, refresh: 7d)
- Role-based access control (RBAC)
- Input validation (Zod) — barcha formalar
- CORS sozlamalari
- Rate limiting (API himoya)
- SQL injection himoyasi (Prisma ORM)
- XSS himoyasi
- CSRF token
- Fayl yuklashda virus tekshirish

---

## 12. QO'SHIMCHA IMKONIYATLAR (FUTURE)

- Mobil ilova (React Native)
- Telegram bot (bron qilish)
- AI kompyuter tavsiyasi
- Loyiha dasturi (loyalty program)
- SMS bildirishnomalar
- Zoom/xarita integratsiyasi
- Turnir tizimi (gaming xonalar uchun)

---

*TZ v1.0 — 2026-yil 15-sentabr*
*Loyiha nomi: Cyber-ZONE*
