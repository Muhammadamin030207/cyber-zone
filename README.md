# CyberArena Hub 🎮

O'zbekistondagi kompyuter xonalari uchun zamonaviy bron tizimi, gaming bar buyurtmalari va live chat.

## Xususiyatlari

- **Bron**: 30% oldindan to'lov, QR chipta, o'rin xaritasi (seat map)
- **To'lov**: UZCARD, HUMO, PAYME, CLICK, naqd pul
- **Gaming Bar**: Ichimliklar / Taomlar / Desertlar buyurtma tizimi
- **Live Chat**: Foydalanuvchi ↔ Admin jonli suhbat
- **Tillar**: O'zbek, Rus, Ingliz (i18n)
- **Mavzu**: 3 ta tema — Obsidian Dark, Midnight, Ember
- **PWA**: Mobil ilova sifatida o'rnatish mumkin
- **Super Admin**: Tuman bo'yicha sotish statistikasi, barcha xonalarni boshqarish
- **Admin**: Bronlar, menyu, buyurtmalar, chat, yangiliklar, promo-kodlar
- **Foydalanuvchi**: Bron qilish, to'lov, QR chipta, bar buyurtmasi, chat

## Tez boshlash

### Backend (port 5000)

```bash
cd backend
cp .env.example .env        # .env faylni to'ldiring
npm install
npx prisma generate
npx prisma migrate dev       # yoki migrate deploy (production)
npm run seed                  # ixtiyoriy: demo ma'lumotlar
npm run dev
```

### Frontend (port 3000)

```bash
cd frontend
cp .env.example .env.local   # .env.local faylni to'ldiring
npm install
npm run dev
```

## Muhit o'zgaruvchilari

### Backend (.env)

| O'zgaruvchi | Tavsif | Misol |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@localhost:5433/cyberzone` |
| `REDIS_URL` | Redis connection | `redis://localhost:6380` |
| `JWT_SECRET` | JWT kalit | `super-secret-key-123` |
| `GOOGLE_CLIENT_ID` | Google OAuth | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | — |
| `FRONTEND_URL` | Frontend manzili | `http://localhost:3006` |
| `PORT` | Server porti | `5000` |

### Frontend (.env.local)

| O'zgaruvchi | Tavsif | Misol |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:5000` |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.io URL | `http://localhost:5000` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth | — |

## Deploy (Render)

1. GitHub repoga yuklang
2. [render.com](https://render.com) da "New Blueprint" yarating
3. `render.yaml` avtomatik aniqlanadi
4. `GOOGLE_CLIENT_ID` va `GOOGLE_CLIENT_SECRET` ni qo'lda kiriting
5. Deploy boshlanadi (5-10 daqiqa)

## Test akkauntlari

| Email | Parol | Rol |
|---|---|---|
| `superadmin@cyberzone.uz` | `SuperAdmin123!` | Super Admin |
| `admin@neon.uz` | `Admin123!` | Admin |
| `demo@user.uz` | `Demo123!` | Foydalanuvchi |

## Tech Stack

**Backend**: Node.js, Express, Prisma, PostgreSQL, Redis, Socket.io, JWT
**Frontend**: Next.js 16, React 19, Tailwind CSS v4, next-intl, Zustand, Lucide Icons
