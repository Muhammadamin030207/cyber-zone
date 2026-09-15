import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000'),
  databaseUrl: process.env.DATABASE_URL!,
  jwt: {
    secret: process.env.JWT_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpires: process.env.ACCESS_TOKEN_EXPIRES || '15m',
    refreshExpires: process.env.REFRESH_TOKEN_EXPIRES || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  email: {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};