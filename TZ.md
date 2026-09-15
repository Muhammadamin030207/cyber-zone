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
- **Muhim:** Har bir Admin faqat **bitta** kompyuter xona egasi bo'la oladi (1 admin = 1 xona) — `ownerId` unique constraint orqali
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
- **Asosiy qidiruv:** matn bo'yicha (xona nomi, manzil)
- **Lokatsiya bo'yicha:** Google Maps API, radius (km), eng yaqin xonalar
- **Rayon bo'yicha:** viloya → tuman → mahalla ierarxiyasi
- **Narx bo'yicha:** oraliq (`minPrice`, `maxPrice`), soatlik narx asosida
- **Zona turi bo'yicha:** obshiy / VIP / kabina — bitta yoki bir nechta tanlash
- **Kompyuter xususiyatlari bo'yicha:** GPU (RTX 4060+), RAM (16GB+), monitor (144Hz+), qo'shimcha (VR, konsol)
- **Holat bo'yicha:** faol/nofaol xonalar
- **Saralash (sort):** narx bo'yicha (arzon/qimmat), masofa, reyting, mashhurlik
- **Xaritada ko'rish:** barcha natijalar markerlar bilan xaritada, marker bosilganda xona qisqacha ko'rsatiladi
- **API:** `GET /api/search?query=&location=&lat=&lng=&radius=&type=&price_min=&price_max=&gpu=&ram=&sort=`

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
  - Grafik va diagrammalar (Recharts)

- **Admin uchun:**
  - O'z xonasidagi bronlar statistikasi
  - Kunlik/haftalik/oylik tushum
  - Kompyuterlar bandligi (rejalashtirilgan vs band)
  - Eng ko'p band bo'lgan vaqt (heatmap)
  - Bron status taqsimoti (pending/active/completed)

### 3.8 Promo-kodlar va Chegirmalar
- **Promo-kod tizimi:**
  - Kod nomi (masalan: `YANGIYIL50`)
  - Chegirma turi: foiz (%) yoki summa (so'm)
  - Chegirma miqdori
  - Amal qilish muddati (start_date → end_date)
  - Qo'llanilishi: bitta xona uchun yoki platforma bo'ylab
  - Maksimal ishlatish soni (limit)
  - Bron narxiga qo'llaniladi (faqat oldindan to'lovga)

- **Admin imkoniyatlari:**
  - Promo-kod yaratish (o'z xonasi uchun)
  - Kodni faollashtirish/to'xtatish
  - Kod statistikasi (necha marta ishlatildi, jami tejamkorlik)

- **Foydalanuvchi imkoniyatlari:**
  - Bron qilishda promo-kodni kiritish
  - Koddan foydalanishdan oldin narxni tekshirish
  - Noto'g'ri/muddati tugagan kod uchun xatolik

### 3.9 Bron To'qnashuvini Oldini Olish (Conflict Protection)
- **Asosiy qoida:** Bitta kompyuter bitta vaqtda faqat bitta bron bo'lishi mumkin
- **Algoritim:**
  1. Bron yaratishdan oldin vaqt oralig'i (start_time → end_time) bo'yicha mavjud bronlar tekshiriladi
  2. Agar shu kompyuterdagi har qanday mavjud bron bilan vaqt to'qnashuvi bo'lsa — xatolik qaytariladi
  3. To'qnashuv aniqlansa: `409 Conflict — Bu kompyuter {vaqt} da band`
  4. Avtomatik tanlash: agar foydalanuvchi kompyuter tanlamagan bo'lsa — bo'sh kompyuter avtomatik tanlanadi

- **Transaktsiya himoyasi:**
  - Bron yaratish `Prisma.$transaction` ichida amalga oshiriladi
  - `SELECT ... FOR UPDATE` — kompyuter holati lock qilinadi
  - Bu `race condition` (bir vaqtda ikki foydalanuvchi) ni oldini oladi

- **Avtomatik boshqaruv:**
  - Bron vaqti tugaganda kompyuter "bo'sh" ga o'tishi (cron job / timer)
  - Band bo'lgan kompyuterni boshqa foydalanuvchi ko'rmasligi
  - Real vaqtda yangilanish (Socket.io — booking_status_changed event)
  - Bekor qilingan bron uchun kompyuter darhol bo'shatiladi

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

> **Eslatma:** Barcha pul maydonlari `Decimal` (Prisma uchun `Decimal @db.Decimal(10,2)`) tipida — `Float` ishlatilmaydi. `Decimal(10,2)` — 10 ta umumiy, 2 ta kasr raqami (masalan: 99999999.99 so'm).

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
├── owner_id → users.id (admin) — UNIQUE (1 admin = 1 xona)
├── name
├── description
├── address
├── latitude
├── longitude
├── phone
├── working_hours (JSON: { open: "09:00", close: "23:00" })
├── timezone (string, default: "Asia/Tashkent")
├── images (JSON array [url1, url2])
├── status (active | inactive | pending)
├── created_at
├── updated_at

zones
├── id (UUID)
├── room_id → computer_rooms.id
├── type (obshiy_zal | vip | kabina)
├── name
├── description
├── capacity
├── price_per_hour (Decimal(10,2)) — soatlik narx
├── status
├── created_at
├── updated_at

computers
├── id (UUID)
├── zone_id → zones.id
├── name/number
├── specs (JSON: { cpu, gpu, ram, monitor, storage, peripherals })
├── status (available | occupied | maintenance | broken)
├── created_at
├── updated_at

bookings
├── id (UUID)
├── user_id → users.id
├── room_id → computer_rooms.id
├── zone_id → zones.id
├── computer_id → computers.id (nullable — avtomatik tanlangan)
├── promo_code_id → promo_codes.id (nullable)
├── date (Date)
├── start_time (string "HH:mm")
├── end_time (string "HH:mm")
├── duration_hours (Decimal(4,1))
├── total_price (Decimal(10,2))
├── discount_amount (Decimal(10,2), default: 0)
├── final_price (Decimal(10,2)) — total_price - discount_amount
├── advance_amount (Decimal(10,2)) — final_price * 0.30
├── remaining_amount (Decimal(10,2)) — final_price * 0.70
├── status (pending | confirmed | active | completed | cancelled)
├── notes
├── created_at
├── updated_at

payments
├── id (UUID)
├── booking_id → bookings.id
├── user_id → users.id
├── amount (Decimal(10,2))
├── type (advance | remaining)
├── method (payme | click | uzcard | cash)
├── status (pending | completed | failed | refunded)
├── transaction_id
├── paid_at
├── created_at

promo_codes
├── id (UUID)
├── room_id → computer_rooms.id (nullable — null = platform-wide)
├── code (string, unique, uppercase)
├── discount_type (percentage | fixed)
├── discount_value (Decimal(10,2)) — foiz yoki so'm
├── min_booking_amount (Decimal(10,2), nullable) — kamida shuncha summa bo'lsa ishlaydi
├── max_uses (int, nullable) — cheksiz bo'lsa null
├── used_count (int, default: 0)
├── starts_at (DateTime)
├── expires_at (DateTime)
├── is_active (boolean, default: true)
├── created_by → users.id (admin)
├── created_at
├── updated_at

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
├── rating (int 1-5)
├── comment
├── created_at

notifications
├── id (UUID)
├── user_id → users.id
├── title
├── message
├── type (info | booking | payment | promotion)
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
| Shaxsiy kabinet | `/dashboard` | Bronlar tarixi, profil, bildirishnomalar |
| Bron yaratish | `/booking/[room-id] | Bron formasi + promo-kod kiritish |
| Bron tafsilotlari | `/booking/[id]` | Bron ma'lumotlari, to'lov, status |
| To'lov | `/payment/[booking-id]` | To'lov sahifasi (Payme/Click/UZCARD) |
| Sozlamalar | `/settings` | Profil, til o'zgartirish, parol |

### 6.3 Admin sahifalari (Kompyuter xona egasi)
| Sahifa | URL | Tavsif |
|--------|-----|--------|
| Admin panel | `/admin` | Dashboard, statistika |
| Mening xonam | `/admin/room` | Xona ma'lumotlari |
| Zonalar | `/admin/zones` | Zonalar ro'yxati |
| Kompyuterlar | `/admin/computers` | Kompyuterlar ro'yxati |
| Bronlar | `/admin/bookings` | Bronlarni boshqarish |
| Narxlar | `/admin/pricing` | Tariflarni boshqarish |
| Promo-kodlar | `/admin/promos` | Promo-kodlar yaratish/boshqarish |
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

### 7.11 Promo-kodlar
```
GET    /api/promo/check?code=&room_id=   (user — kodni tekshirish)
POST   /api/promo/apply                   (user — bron qilishda qo'llash)
GET    /api/admin/promos                  (admin — o'z promo-kodlari)
POST   /api/admin/promos                  (admin — yangi kod yaratish)
PATCH  /api/admin/promos/:id              (admin — tahrirlash)
DELETE /api/admin/promos/:id              (admin — o'chirish)
GET    /api/admin/promos/:id/stats        (admin — kod statistikasi)
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
│   ├── __tests__/             # Frontend testlar
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
│   │   ├── lib/               # Prisma, JWT, Redis client
│   │   ├── utils/             # Utility funksiyalar (pricing, booking utils)
│   │   ├── types/             # TypeScript type'lar
│   │   └── config/            # Konfiguratsiya
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.ts            # Seed skript
│   ├── __tests__/             # Backend testlar
│   ├── uploads/               # Yuklangan fayllar
│   ├── logs/                  # Log fayllar (Winston)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI/CD
│
├── .gitignore
├── README.md
└── docker-compose.yml         # PostgreSQL + Redis
```

---

## 10. ISHLAB CHIQISH QADAMLARI

### Bosqich 1: Asosiy tuzilma (Setup) ✅ TAYYOR
1. ✅ Backend: Prisma schema, database migratsiya
2. ✅ Backend: Auth tizimi (register, login, JWT, Google OAuth)
3. Backend: CRUD API endpointlari (rooms, zones, computers)
4. Frontend: Layout, komponentlar, routing (Next.js 14+ App Router)
5. Frontend: Auth sahifalari (login, register, Google)
6. Frontend: i18n (3 til) sozlash

### Bosqich 2: Asosiy funksiyalar
1. Kompyuter xona CRUD (admin)
2. Zonalar va kompyuterlar CRUD
3. Kompyuter xonalar ro'yxati (public — barcha xonalar)
4. Xona sahifasi (batafsil: zonalar, kompyuterlar, narxlar)
5. Qidiruv tizimi (lokatsiya, narx, zona turi)

### Bosqich 3: Bron va to'lov
1. Bron yaratish tizimi (vaqt to'qnashuvini oldini olish + Prisma transaction)
2. Promo-kod tizimi (yaratish, tekshirish, qo'llash)
3. Bron boshqaruv paneli (admin — qabul qilish/rad etish)
4. To'lov tizimi (Payme/Click integratsiya sandbox)
5. Real vaqt yangilanish (Socket.io — booking_status_changed)

### Bosqich 4: Admin panel
1. Admin dashboard (statistika, diagrammalar)
2. Boshqaruv sahifalari (zonalar, kompyuterlar, bronlar)
3. Yangiliklar/reklamalar
4. Promo-kodlar boshqaruvi

### Bosqich 5: Super Admin
1. Super admin dashboard (umumiy statistika)
2. Platform boshqaruvi (adminlarni boshqarish)
3. Umumiy yangiliklar/reklamalar

### Bosqich 6: Frontend to'liq
1. Asosiy sahifa (hero, xarita, top xonalar)
2. Xonalar ro'yxati (filtrlash, xaritada ko'rish)
3. Xona sahifasi (galereya, zonalar, bron formasi)
4. Foydalanuvchi dashboard (bronlar tarixi, profil)
5. Admin panel sahifalari

### Bosqich 7: Testing va sifat nazorati
- **Unit test (Vitest):** auth, pricing, booking algoritmi, promo-kod
- **Integration test:** API endpointlar (supertest)
- **Frontend test:** komponent render testlari
- **E2E test (ixtiyoriy):** Playwright bilan to'liq flow
- **Linting:** ESLint + Prettier (har ikkala qism uchun)
- **CI/CD:** GitHub Actions — lint + test + build (PR va push)

### Bosqich 8: Seed data (Demo ma'lumotlar)
- Super admin (seed skript orqali, allaqachon bor)
- 2-3 ta namuna kompyuter xona (Toshkent shahridagi)
- Har bir xonada 2-3 zona (obshiy, VIP, kabina)
- Har bir zonada 3-5 ta kompyuter (turli specs)
- 5-10 ta namuna bron (turli statuslar bilan)
- Namuna promo-kodlar
- 3-5 ta namuna yangilik

### Bosqich 9: Monitoring va logging
- **Error tracking:** Sentry (frontend + backend)
- **Logging:** Winston (backend) — info/error/warn loglar, faylga yozish
- **Request log:** Morgan (Express) — barcha so'rovlar logi
- **Performance:** response time monitoring
- **Uptime:** healthcheck endpoint (`/api/health`) — PostgreSQL va Redis ulanishini tekshirish

### Bosqich 10: Polish
1. Responsive dizayn tekshirish (mobil, planshet, desktop)
2. Xatolarni tuzatish
3. Performance optimizatsiya (lazy loading, image optimization)
4. SEO (meta taglar, Open Graph, sitemap.xml)
5. Deploy (Vercel — frontend, Railway/DigitalOcean — backend)

---

## 13. TESTING STRATEGIYASI

### 13.1 Test turlari
| Turi | Texnologiya | Nima tekshiriladi |
|------|-------------|-------------------|
| Unit | Vitest | Individual funksiyalar (pricing, utils, validation) |
| Integration | Vitest + Supertest | API endpointlar, database operatsiyalari |
| Component | Vitest + React Testing Library | React komponentlari render |
| E2E | Playwright (ixtiyoriy) | To'liq foydalanuvchi flow |

### 13.2 Test qilinadigan asosiy joylar
- Auth flow (register → login → getMe → refresh → changePassword)
- Bron yaratish (vaqt to'qnashuvini oldini olish — parallel request test)
- Promo-kod (chegirma hisob-kitobi, muddat, limit)
- Narx hisob-kitobi (soatlik × vaqt + zona farqi)
- Qidiruv (filtrlash, lokatsiya radius)
- Rollar bo'yicha ruxsatlar (admin boshqa xona bronini ko'ra olmaydi)
- Input validatsiyasi (Zod — noto'g'ri ma'lumot kiritish)

### 13.3 CI/CD (GitHub Actions)
```yaml
# .github/workflows/ci.yml
# Triggers: push to main, pull_request
# Steps: install → lint → test → build
```

---

## 14. MONITORING VA LOGGING

### 14.1 Backend logging
- **Winston:** asosiy log kutubxoni
  - `logs/error.log` — faqat xatoliklar
  - `logs/combined.log` — barcha loglar
  - Console — development uchun (rangli)
- **Morgan:** HTTP request log (format: `:method :url :status :res[content-length] - :response-time ms`)

### 14.2 Error tracking
- **Sentry:** production xatoliklari avtomatik yuboriladi
  - Backend: `@sentry/node`
  - Frontend: `@sentry/nextjs`
  - Source map yuklash (build paytida)

### 14.3 Healthcheck
```
GET /api/health
→ { status: "ok", db: "connected", redis: "connected", uptime: 12345 }
```

### 14.4 Monitoring (kelajak)
- Grafana + Prometheus — server resource monitoring
- UptimeRobot — sayt tutilmasligini kuzatish

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

*TZ v1.1 — 2026-yil 15-sentabr*
*Loyiha nomi: Cyber-ZONE*
*O'zgarishlar v1.1: Narx Decimal, bron himoyasi, promo-kodlar, testing strategiyasi, seed data, monitoring*
