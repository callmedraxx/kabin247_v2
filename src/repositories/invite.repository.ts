import { Invite, CreateInviteDTO } from '../models/user';

export interface InviteRepository {
  create(invite: CreateInviteDTO & { token_hash: string; expires_at: Date }): Promise<Invite>;
  findById(id: number): Promise<Invite | null>;
  findByTokenHash(tokenHash: string): Promise<Invite | null>;
  findByEmail(email: string): Promise<Invite | null>;
  markAsUsed(id: number): Promise<void>;
  delete(id: number): Promise<boolean>;
  deleteExpired(): Promise<number>;
  findAll(): Promise<Invite[]>;
}

