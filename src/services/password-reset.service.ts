import argon2 from 'argon2';
import { getUserRepository, getPasswordResetRepository } from '../repositories';
import { generateOTP, hashToken, compareToken } from '../utils/crypto';
import { env } from '../config/env';
import { Logger } from '../utils/logger';

export class PasswordResetService {
  private userRepository = getUserRepository();
  private passwordResetRepository = getPasswordResetRepository();

  /**
   * Request password reset OTP (only for ADMIN email)
   */
  async requestOTP(email: string): Promise<{ otp: string; expiresAt: Date } | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user || user.role !== 'ADMIN') {
      // Don't reveal if user exists or not
      return null;
    }

    // Check for existing OTP
    const existing = await this.passwordResetRepository.findByUserId(user.id);
    if (existing && existing.request_count >= 5) {
      Logger.warn('Too many OTP requests', { userId: user.id, email });
      throw new Error('Too many password reset attempts. Please try again later.');
    }

    const otp = generateOTP();
    const otpHash = hashToken(otp);
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

    if (existing) {
      // Update existing OTP
      await this.passwordResetRepository.incrementRequestCount(existing.id);
      // Delete and recreate for simplicity
      await this.passwordResetRepository.deleteExpired();
    }

    await this.passwordResetRepository.create({
      user_id: user.id,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    return { otp, expiresAt };
  }

  /**
   * Verify OTP and reset password
   */
  async verifyOTPAndReset(email: string, otp: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return false;
    }

    const otpRecord = await this.passwordResetRepository.findByUserId(user.id);
    if (!otpRecord) {
      return false;
    }

    // Verify OTP
    if (!compareToken(otp, otpRecord.otp_hash)) {
      return false;
    }

    // Check expiry
    if (otpRecord.expires_at < new Date()) {
      return false;
    }

    // Hash new password
    const passwordHash = await argon2.hash(newPassword);

    // Update password (we'll need to add updatePassword to repository or use update)
    const updates: any = {};
    // We'll need to add a method to update password specifically
    // For now, we'll throw an error if the repository doesn't support it
    // Actually, let's add a method to update password in the repository

    // Mark OTP as used
    await this.passwordResetRepository.markAsUsed(otpRecord.id);

    // Update user password
    // Since we can't directly update password_hash through UpdateUserDTO,
    // we'll need to extend the repository or use a direct SQL update
    // For now, let's add a helper in the repository
    await this.userRepository.updatePassword(user.id, passwordHash);

    return true;
  }
}

let passwordResetServiceInstance: PasswordResetService | null = null;

export function getPasswordResetService(): PasswordResetService {
  if (!passwordResetServiceInstance) {
    passwordResetServiceInstance = new PasswordResetService();
  }
  return passwordResetServiceInstance;
}

