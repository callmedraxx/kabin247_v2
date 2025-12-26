import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { User, Role, PermissionMap } from '../models/user';
import { getUserRepository, getRefreshTokenRepository } from '../repositories';
import { env } from '../config/env';
import { hashToken, generateToken } from '../utils/crypto';
import { Logger } from '../utils/logger';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  perms_hash?: string; // hash of permissions for quick comparison
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private userRepository = getUserRepository();
  private refreshTokenRepository = getRefreshTokenRepository();

  /**
   * Generate access token (JWT) - short-lived
   */
  issueAccessToken(user: User): string {
    const permissionsHash = user.permissions 
      ? hashToken(JSON.stringify(user.permissions)).substring(0, 16)
      : undefined;

    const payload: AccessTokenPayload = {
      sub: user.id.toString(),
      role: user.role,
      perms_hash: permissionsHash,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + env.ACCESS_TOKEN_TTL,
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET);
  }

  /**
   * Generate refresh token - long-lived, stored in DB
   */
  async issueRefreshToken(user: User, userAgent: string | null, ip: string | null): Promise<string> {
    const jti = uuidv4();
    const token = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);

    await this.refreshTokenRepository.create({
      user_id: user.id,
      jti,
      token_hash: tokenHash,
      expires_at: expiresAt,
      user_agent: userAgent,
      ip,
    });

    // Return token that includes jti - format: jti.token
    return `${jti}.${token}`;
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
      return decoded;
    } catch (error: any) {
      Logger.warn('Token verification failed', {
        error: error.message,
        name: error.name,
      });
      return null;
    }
  }

  /**
   * Set refresh token as HttpOnly cookie
   */
  setRefreshTokenCookie(res: Response, refreshToken: string, req?: Request): void {
    // Determine if request is secure (HTTPS)
    const isSecure = req 
      ? req.protocol === 'https' || req.secure || req.get('x-forwarded-proto') === 'https'
      : env.COOKIE_SECURE;
    
    const origin = req?.get('origin') || '';
    // Browser requirement: SameSite=None requires Secure=true on HTTPS
    // Exception: localhost allows Secure=false with SameSite=None
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    
    // For SameSite=None, browsers require Secure=true on HTTPS (except localhost)
    const secureValue = env.COOKIE_SAME_SITE === 'none' && !isLocalhost && isSecure
      ? true  // Force Secure=true for SameSite=None on HTTPS (browser requirement)
      : (env.COOKIE_SAME_SITE === 'none' && isLocalhost)
        ? false  // Allow Secure=false on localhost with SameSite=None
        : env.COOKIE_SECURE;
    
    // Determine cookie domain
    // For kabin247.com subdomains, use .kabin247.com to work across subdomains
    let cookieDomain = env.COOKIE_DOMAIN;
    if (!cookieDomain && origin.includes('kabin247.com')) {
      cookieDomain = '.kabin247.com';
    }
    
    const cookieOptions: any = {
      httpOnly: true,
      secure: secureValue,
      sameSite: env.COOKIE_SAME_SITE,
      maxAge: env.REFRESH_TOKEN_TTL * 1000,
      path: '/',
    };
    
    // Only set domain if specified (undefined allows cookies on exact domain)
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }
    
    Logger.info('Setting refresh token cookie', {
      secure: secureValue,
      sameSite: env.COOKIE_SAME_SITE,
      domain: cookieOptions.domain || 'not set',
      isLocalhost,
      isSecure,
      origin: origin || 'not set',
    });
    
    res.cookie('refreshToken', refreshToken, cookieOptions);
  }

  /**
   * Clear refresh token cookie
   */
  clearRefreshTokenCookie(res: Response, req?: Request): void {
    const origin = req?.get('origin') || '';
    let cookieDomain = env.COOKIE_DOMAIN;
    if (!cookieDomain && origin.includes('kabin247.com')) {
      cookieDomain = '.kabin247.com';
    }
    
    const cookieOptions: any = {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
    };
    
    // Only set domain if specified (must match the domain used when setting)
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }
    
    res.clearCookie('refreshToken', cookieOptions);
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, userAgent: string | null, ip: string | null): Promise<{ user: User; accessToken: string; refreshToken: string } | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.is_active) {
      return null;
    }

    try {
      const valid = await argon2.verify(user.password_hash, password);
      if (!valid) {
        return null;
      }

      const accessToken = this.issueAccessToken(user);
      const refreshToken = await this.issueRefreshToken(user, userAgent, ip);

      return { user, accessToken, refreshToken };
    } catch (error) {
      Logger.error('Password verification error', error);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
    // Parse token: format is jti.token
    const parts = refreshToken.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [jti, token] = parts;
    const tokenHash = hashToken(token);

    const storedToken = await this.refreshTokenRepository.findByJti(jti);
    if (!storedToken) {
      return null;
    }

    // Verify token hash matches
    if (storedToken.token_hash !== tokenHash) {
      return null;
    }

    // Get user
    const user = await this.userRepository.findById(storedToken.user_id);
    if (!user || !user.is_active) {
      return null;
    }

    // Revoke old token (rotation)
    await this.refreshTokenRepository.revoke(jti);

    // Issue new tokens
    const newAccessToken = this.issueAccessToken(user);
    const newRefreshToken = await this.issueRefreshToken(user, storedToken.user_agent, storedToken.ip);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken: string): Promise<boolean> {
    const parts = refreshToken.split('.');
    if (parts.length !== 2) {
      return false;
    }

    const [jti] = parts;
    const storedToken = await this.refreshTokenRepository.findByJti(jti);
    if (!storedToken) {
      return false;
    }

    await this.refreshTokenRepository.revoke(jti);
    return true;
  }

  /**
   * Get user from access token
   */
  async getUserFromToken(token: string): Promise<User | null> {
    const payload = this.verifyAccessToken(token);
    if (!payload) {
      Logger.warn('Token verification returned no payload');
      return null;
    }

    const userId = parseInt(payload.sub, 10);
    if (isNaN(userId)) {
      Logger.warn('Invalid user ID in token payload', { sub: payload.sub });
      return null;
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      Logger.warn('User not found for token', { userId });
      return null;
    }
    
    if (!user.is_active) {
      Logger.warn('User is inactive', { userId, email: user.email });
      return null;
    }

    return user;
  }
}

let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}

