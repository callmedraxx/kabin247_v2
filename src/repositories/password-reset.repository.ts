import { PasswordResetOTP } from '../models/user';

export interface PasswordResetRepository {
  create(otp: { user_id: number; otp_hash: string; expires_at: Date }): Promise<PasswordResetOTP>;
  findByUserId(userId: number): Promise<PasswordResetOTP | null>;
  markAsUsed(id: number): Promise<void>;
  incrementRequestCount(id: number): Promise<void>;
  deleteExpired(): Promise<number>;
}

