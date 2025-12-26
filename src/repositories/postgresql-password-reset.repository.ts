import { DatabaseAdapter } from '../database/adapter';
import { PasswordResetOTP } from '../models/user';
import { PasswordResetRepository } from './password-reset.repository';

export class PostgreSQLPasswordResetRepository implements PasswordResetRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(otp: { user_id: number; otp_hash: string; expires_at: Date }): Promise<PasswordResetOTP> {
    // Delete any existing OTPs for this user
    await this.db.query('DELETE FROM password_reset_otps WHERE user_id = $1', [otp.user_id]);
    
    const query = `
      INSERT INTO password_reset_otps (
        user_id, otp_hash, expires_at, request_count, created_at
      ) VALUES ($1, $2, $3, 1, NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      otp.user_id,
      otp.otp_hash,
      otp.expires_at,
    ]);
    return result.rows[0];
  }

  async findByUserId(userId: number): Promise<PasswordResetOTP | null> {
    const query = 'SELECT * FROM password_reset_otps WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1';
    const result = await this.db.query(query, [userId]);
    return result.rows[0] || null;
  }

  async markAsUsed(id: number): Promise<void> {
    const query = 'UPDATE password_reset_otps SET used_at = NOW() WHERE id = $1';
    await this.db.query(query, [id]);
  }

  async incrementRequestCount(id: number): Promise<void> {
    const query = 'UPDATE password_reset_otps SET request_count = request_count + 1 WHERE id = $1';
    await this.db.query(query, [id]);
  }

  async deleteExpired(): Promise<number> {
    const query = 'DELETE FROM password_reset_otps WHERE expires_at < NOW()';
    const result = await this.db.query(query);
    return result.rowCount || 0;
  }
}

