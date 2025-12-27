import { DatabaseAdapter } from '../database/adapter';
import { Invite } from '../models/user';
import { InviteRepository } from './invite.repository';

/**
 * Helper function to safely parse JSON from database
 * PostgreSQL JSONB columns return objects directly, not strings
 */
function safeParsePermissions(value: any): any {
  if (value === null || value === undefined) {
    return null;
  }
  // If already an object (from JSONB), return as-is
  if (typeof value === 'object') {
    return value;
  }
  // If it's a string, parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      // If parsing fails, return null or throw based on requirement
      throw new Error(`Failed to parse permissions JSON: ${error}`);
    }
  }
  return value;
}

export class PostgreSQLInviteRepository implements InviteRepository {
  constructor(private db: DatabaseAdapter) {}

  async create(invite: { email: string; role: 'CSR'; permissions: any; token_hash: string; expires_at: Date; invited_by_user_id: number }): Promise<Invite> {
    const query = `
      INSERT INTO invites (
        email, role, permissions, token_hash, expires_at, invited_by_user_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    const result = await this.db.query(query, [
      invite.email,
      invite.role,
      JSON.stringify(invite.permissions),
      invite.token_hash,
      invite.expires_at,
      invite.invited_by_user_id,
    ]);
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findByTokenHash(tokenHash: string): Promise<Invite | null> {
    const query = 'SELECT * FROM invites WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()';
    const result = await this.db.query(query, [tokenHash]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findById(id: number): Promise<Invite | null> {
    const query = 'SELECT * FROM invites WHERE id = $1';
    const result = await this.db.query(query, [id]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async findByEmail(email: string): Promise<Invite | null> {
    const query = 'SELECT * FROM invites WHERE email = $1 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1';
    const result = await this.db.query(query, [email]);
    if (!result.rows[0]) return null;
    
    const row = result.rows[0];
    return {
      ...row,
      permissions: safeParsePermissions(row.permissions),
    };
  }

  async markAsUsed(id: number): Promise<void> {
    // #region agent log
    const logData = {location:'postgresql-invite.repository.ts:92',message:'markAsUsed called',data:{inviteId:id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData)+'\n');}catch(e){}
    // #endregion
    const query = 'UPDATE invites SET used_at = NOW() WHERE id = $1';
    const result = await this.db.query(query, [id]);
    // #region agent log
    const logData2 = {location:'postgresql-invite.repository.ts:96',message:'markAsUsed result',data:{inviteId:id,rowsUpdated:result.rowCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData2)+'\n');}catch(e){}
    // #endregion
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM invites WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }

  async findAll(): Promise<Invite[]> {
    // #region agent log
    const logData = {location:'postgresql-invite.repository.ts:103',message:'findAll invites called',timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData)+'\n');}catch(e){}
    // #endregion
    // Filter to only show unused invites (pending invites)
    const query = 'SELECT * FROM invites WHERE used_at IS NULL ORDER BY created_at DESC';
    const result = await this.db.query(query);
    const invites = result.rows.map((row: any) => ({
      ...row,
      permissions: safeParsePermissions(row.permissions),
    }));
    // #region agent log
    const logData2 = {location:'postgresql-invite.repository.ts:110',message:'findAll invites result',data:{totalInvites:invites.length,invites:invites.map((i: Invite)=>({id:i.id,email:i.email,usedAt:i.used_at,expiresAt:i.expires_at}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData2)+'\n');}catch(e){}
    // #endregion
    return invites;
  }

  async deleteExpired(): Promise<number> {
    const query = 'DELETE FROM invites WHERE expires_at < NOW() AND used_at IS NULL';
    const result = await this.db.query(query);
    return result.rowCount || 0;
  }
}

