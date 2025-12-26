import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Hash a token or OTP using SHA-256 HMAC
 */
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

/**
 * Generate a cryptographically secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a numeric OTP code
 */
export function generateOTP(length: number = env.OTP_LENGTH): string {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  const otp = Math.floor(Math.random() * (max - min + 1)) + min;
  return otp.toString().padStart(length, '0');
}

/**
 * Compare a plain token/OTP with a hashed version
 */
export function compareToken(plain: string, hashed: string): boolean {
  const hashedPlain = hashToken(plain);
  return crypto.timingSafeEqual(Buffer.from(hashedPlain), Buffer.from(hashed));
}

