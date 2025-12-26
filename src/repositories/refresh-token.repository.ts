import { RefreshToken } from '../models/user';

export interface RefreshTokenRepository {
  create(token: { user_id: number; jti: string; token_hash: string; expires_at: Date; user_agent: string | null; ip: string | null }): Promise<RefreshToken>;
  findByJti(jti: string): Promise<RefreshToken | null>;
  findByUserId(userId: number): Promise<RefreshToken[]>;
  revoke(jti: string): Promise<void>;
  revokeAllForUser(userId: number): Promise<void>;
  deleteExpired(): Promise<number>;
}

