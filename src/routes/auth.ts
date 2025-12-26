import { Router, Request, Response } from 'express';
import { getAuthService } from '../services/auth.service';
import { getPasswordResetService } from '../services/password-reset.service';
import { getUserService } from '../services/user.service';
import { getEmailService } from '../services/email.service';
import { env } from '../config/env';
import { Logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';

export const authRouter = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *     LoginResponse:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: integer
 *             email:
 *               type: string
 *             role:
 *               type: string
 *               enum: [ADMIN, CSR]
 *     SetupAdminRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         password:
 *           type: string
 *     RequestPasswordResetRequest:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *     ResetPasswordRequest:
 *       type: object
 *       required:
 *         - email
 *         - otp
 *         - newPassword
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         otp:
 *           type: string
 *         newPassword:
 *           type: string
 */

/**
 * @swagger
 * /auth/setup-admin:
 *   post:
 *     summary: One-time admin account setup
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetupAdminRequest'
 *     responses:
 *       201:
 *         description: Admin account created successfully
 *       400:
 *         description: Admin already exists or invalid input
 */
authRouter.post('/setup-admin', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const userService = getUserService();
    const admin = await userService.createAdminOnce(email, password);
    
    res.status(201).json({ message: 'Admin account created successfully', admin });
  } catch (error: any) {
    Logger.error('Failed to setup admin', error);
    if (error.message.includes('already exists') || error.message.includes('Maximum of 2 admin')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to setup admin account' });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             description: Refresh token cookie
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const authService = getAuthService();
    const userAgent = req.headers['user-agent'] || null;
    const ip = req.ip || req.socket.remoteAddress || null;
    
    const result = await authService.login(email, password, userAgent, ip);
    
    if (!result) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set refresh token cookie
    authService.setRefreshTokenCookie(res, result.refreshToken, req);

    // Don't send password_hash
    const { password_hash, ...userWithoutPassword } = result.user;
    
    res.json({
      accessToken: result.accessToken,
      user: userWithoutPassword,
    });
  } catch (error: any) {
    Logger.error('Login error', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         headers:
 *           Set-Cookie:
 *             description: New refresh token cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Invalid refresh token
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    
    Logger.info('Refresh endpoint called', {
      hasCookies: !!req.cookies,
      cookieKeys: req.cookies ? Object.keys(req.cookies) : [],
      hasRefreshToken: !!refreshToken,
      userAgent: req.headers['user-agent'],
      origin: req.headers.origin,
    });
    
    if (!refreshToken) {
      Logger.warn('Refresh token missing from cookies', {
        cookies: req.cookies,
        cookieHeader: req.headers.cookie,
      });
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const authService = getAuthService();
    const result = await authService.refresh(refreshToken);
    
    if (!result) {
      Logger.warn('Refresh token validation failed');
      authService.clearRefreshTokenCookie(res, req);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Set new refresh token cookie
    authService.setRefreshTokenCookie(res, result.refreshToken, req);
    
    Logger.info('Token refreshed successfully');
    
    res.json({
      accessToken: result.accessToken,
    });
  } catch (error: any) {
    Logger.error('Refresh token error', error);
    const authService = getAuthService();
    authService.clearRefreshTokenCookie(res, req);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
authRouter.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    
    if (refreshToken) {
      const authService = getAuthService();
      await authService.logout(refreshToken);
      authService.clearRefreshTokenCookie(res, req);
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    Logger.error('Logout error', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

/**
 * @swagger
 * /auth/request-password-reset:
 *   post:
 *     summary: Request password reset OTP (ADMIN only)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RequestPasswordResetRequest'
 *     responses:
 *       200:
 *         description: OTP sent to email (if email is admin)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 */
authRouter.post('/request-password-reset', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const passwordResetService = getPasswordResetService();
    const result = await passwordResetService.requestOTP(email);
    
    // Don't reveal if email exists or not (security best practice)
    // But we need to send the email, so we'll send it if result exists
    if (result) {
      const emailService = getEmailService();
      const resetLink = `${env.FRONTEND_URL}/reset-password?token=${result.otp}`;
      await emailService.sendPasswordResetEmail(email, result.otp, resetLink);
    }
    
    // Always return success to prevent email enumeration
    res.json({ message: 'If the email exists and is an admin account, a password reset OTP has been sent' });
  } catch (error: any) {
    Logger.error('Password reset request error', error);
    if (error.message.includes('Too many')) {
      return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid OTP or password
 */
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordResetService = getPasswordResetService();
    const success = await passwordResetService.verifyOTPAndReset(email, otp, newPassword);
    
    if (!success) {
      return res.status(400).json({ error: 'Invalid OTP or email' });
    }
    
    res.json({ message: 'Password reset successfully' });
  } catch (error: any) {
    Logger.error('Password reset error', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

