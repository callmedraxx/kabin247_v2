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
    const tokenHash = hashToken(token);
    const invite = await this.inviteRepository.findByTokenHash(tokenHash);
    
    if (!invite) {
      return null;
    }

    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(invite.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create user (password will be hashed in repository)
    const user = await this.userRepository.create({
      email: invite.email,
      password: password,
      role: 'CSR',
      permissions: invite.permissions,
    });

    // Mark invite as used
    await this.inviteRepository.markAsUsed(invite.id);

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

