import { DatabaseAdapter } from '../database/adapter';
import { RefreshToken } from '../models/user';
import { RefreshTokenRepository } from './refresh-token.repository';

export class PostgreSQLRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(token: { user_id: number; jti: string; token_hash: string; expires_at: Date; user_agent: string | null; ip: string | null }): Promise<RefreshToken> {
    const query = `
      INSERT INTO refresh_tokens (
        user_id, jti, token_hash, expires_at, user_agent, ip, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      token.user_id,
      token.jti,
      token.token_hash,
      token.expires_at,
      token.user_agent,
      token.ip,
    ]);
    return result.rows[0];
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    const query = 'SELECT * FROM refresh_tokens WHERE jti = $1 AND revoked_at IS NULL AND expires_at > NOW()';
    const result = await this.db.query(query, [jti]);
    return result.rows[0] || null;
  }

  async findByUserId(userId: number): Promise<RefreshToken[]> {
    const query = 'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC';
    const result = await this.db.query(query, [userId]);
    return result.rows;
  }

  async revoke(jti: string): Promise<void> {
    const query = 'UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = $1';
    await this.db.query(query, [jti]);
  }

  async revokeAllForUser(userId: number): Promise<void> {
    const query = 'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL';
    await this.db.query(query, [userId]);
  }

  async deleteExpired(): Promise<number> {
    const query = 'DELETE FROM refresh_tokens WHERE expires_at < NOW()';
    const result = await this.db.query(query);
    return result.rowCount || 0;
  }
}

