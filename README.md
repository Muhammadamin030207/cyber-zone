# 🎮 Cyber-ZONE

Kompyuter xonalarini boshqarish va foydalanuvchilarga taqdim etish uchun **SaaS platforma**.

## 🚀 Texnologiyalar

| Qism | Texnologiya |
|------|-------------|
| Frontend | Next.js 14+, React 18, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Auth | JWT + Google OAuth 2.0 |
| Real-time | Socket.io |
| i18n | O'zbek, Русский, English |

## 👥 Rollar

- **Super Admin** — platformaning to'liq boshqaruvchisi (seed skript orqali yaratiladi)
- **Admin** — kompyuter xona egasi (Super Admin yaratadi)
- **User** — foydalanuvchi (o'zi register qiladi yoki Google bilan kiradi)

## 📂 Loyiha tuzilishi

```
cyber-zone/
├── backend/       # Express.js API
│   ├── prisma/    # Database schema + seed
│   └── src/
│       ├── controllers/
│       ├── routes/
│       ├── middlewares/
│       ├── services/
│       ├── lib/
│       └── config/
└── frontend/      # Next.js ilova
```

## 🛠️ Ishga tushirish (Backend)

```bash
cd backend
cp .env.example .env   # Sozlamalarni to'ldiring
npm install
npx prisma migrate dev
npm run seed           # Super Admin yaratish
npm run dev
```

## 📦 Asosiy API Endpointlar

| Method | Endpoint | Tavsif |
|--------|----------|--------|
| POST | `/api/auth/register` | Ro'yxatdan o'tish |
| POST | `/api/auth/login` | Kirish |
| POST | `/api/auth/login/google` | Google bilan kirish |
| GET | `/api/auth/me` | Profil (token bilan) |

*To'liq TZ: [TZ.md](./TZ.md)*