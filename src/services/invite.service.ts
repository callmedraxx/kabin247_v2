import { PermissionMap, Invite } from '../models/user';
import { getInviteRepository, getUserRepository } from '../repositories';
import { hashToken, generateToken } from '../utils/crypto';
import { env } from '../config/env';
import { Logger } from '../utils/logger';

export class InviteService {
  private inviteRepository = getInviteRepository();
  private userRepository = getUserRepository();

  /**
   * Create an invite for a CSR employee
   */
  async createInvite(email: string, permissions: PermissionMap, invitedByUserId: number): Promise<{ token: string; expiresAt: Date; inviteId: number }> {
    // #region agent log
    const logData1 = {location:'invite.service.ts:14',message:'createInvite called',data:{email,permissions,permissionsStringified:JSON.stringify(permissions)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData1)+'\n');}catch(e){}
    // #endregion
    
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Check if there's an active invite for this email
    const existingInvite = await this.inviteRepository.findByEmail(email);
    if (existingInvite) {
      throw new Error('An active invite already exists for this email');
    }

    // Generate invite token
    const token = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.inviteRepository.create({
      email,
      role: 'CSR',
      permissions,
      token_hash: tokenHash,
      expires_at: expiresAt,
      invited_by_user_id: invitedByUserId,
    });

    // #region agent log
    const logData2 = {location:'invite.service.ts:42',message:'Invite created',data:{inviteId:invite.id,storedPermissions:invite.permissions},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData2)+'\n');}catch(e){}
    // #endregion

    return { token, expiresAt, inviteId: invite.id };
  }

  /**
   * Delete an invite by ID
   */
  async deleteInvite(id: number): Promise<boolean> {
    return await this.inviteRepository.delete(id);
  }

  /**
   * Get all invites (for admin management)
   */
  async getAllInvites(): Promise<Invite[]> {
    return await this.inviteRepository.findAll();
  }

  /**
   * Verify invite token
   */
  async verifyInvite(token: string): Promise<{ email: string; permissions: PermissionMap } | null> {
    const tokenHash = hashToken(token);
    const invite = await this.inviteRepository.findByTokenHash(tokenHash);
    
    if (!invite) {
      return null;
    }

    return {
      email: invite.email,
      permissions: invite.permissions,
    };
  }

  /**
   * Accept invite and create user account
   */
  async acceptInvite(token: string, password: string): Promise<{ user: any } | null> {
    // #region agent log
    const logData1 = {location:'invite.service.ts:78',message:'acceptInvite called',data:{tokenLength:token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData1)+'\n');}catch(e){}
    // #endregion
    const tokenHash = hashToken(token);
    const invite = await this.inviteRepository.findByTokenHash(tokenHash);
    
    // #region agent log
    const logData2 = {location:'invite.service.ts:83',message:'Invite lookup result',data:{inviteFound:!!invite,inviteId:invite?.id,inviteEmail:invite?.email,invitePermissions:invite?.permissions,permissionsType:typeof invite?.permissions,permissionsIsNull:invite?.permissions===null,permissionsIsUndefined:invite?.permissions===undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData2)+'\n');}catch(e){}
    // #endregion
    
    if (!invite) {
      return null;
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(invite.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create user (password will be hashed in repository)
    // #region agent log
    const logData3 = {location:'invite.service.ts:93',message:'Creating user with permissions',data:{email:invite.email,role:'CSR',permissions:invite.permissions,permissionsStringified:JSON.stringify(invite.permissions)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData3)+'\n');}catch(e){}
    // #endregion
    const user = await this.userRepository.create({
      email: invite.email,
      password: password,
      role: 'CSR',
      permissions: invite.permissions,
    });

    // #region agent log
    const logData4 = {location:'invite.service.ts:101',message:'User created, checking saved permissions',data:{userId:user.id,userEmail:user.email,savedPermissions:user.permissions,permissionsType:typeof user.permissions,permissionsIsNull:user.permissions===null,permissionsIsUndefined:user.permissions===undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData4)+'\n');}catch(e){}
    // #endregion

    // Mark invite as used
    await this.inviteRepository.markAsUsed(invite.id);

    // #region agent log
    const logData5 = {location:'invite.service.ts:105',message:'Invite marked as used',data:{inviteId:invite.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData5)+'\n');}catch(e){}
    // #endregion

    // Don't return password_hash
    const { password_hash, ...userWithoutPassword } = user;
    return { user: userWithoutPassword };
  }
}

let inviteServiceInstance: InviteService | null = null;

export function getInviteService(): InviteService {
  if (!inviteServiceInstance) {
    inviteServiceInstance = new InviteService();
  }
  return inviteServiceInstance;
}

