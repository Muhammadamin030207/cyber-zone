import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

export function generateTokens(payload: JwtPayload) {
  const accessToken = jwt.sign(payload, config.jwt.secret as Secret, {
    expiresIn: config.jwt.accessExpires as SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret as Secret, {
    expiresIn: config.jwt.refreshExpires as SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret as Secret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.refreshSecret as Secret) as JwtPayload;
}