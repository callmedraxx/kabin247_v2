export type Role = 'ADMIN' | 'CSR';

export interface PermissionMap {
  'orders.read'?: boolean;
  'orders.update_status'?: boolean;
  'orders.set_paid'?: boolean;
  'invoices.send_final'?: boolean;
  'employees.manage'?: boolean;
  'invites.create'?: boolean;
  [key: string]: boolean | undefined;
}

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  is_active: boolean;
  permissions: PermissionMap | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserDTO {
  email: string;
  password: string;
  role: Role;
  permissions?: PermissionMap;
}

export interface UpdateUserDTO {
  email?: string;
  is_active?: boolean;
  permissions?: PermissionMap;
}

export interface Invite {
  id: number;
  email: string;
  role: 'CSR';
  permissions: PermissionMap;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  invited_by_user_id: number;
  created_at: Date;
}

export interface CreateInviteDTO {
  email: string;
  role: 'CSR';
  permissions: PermissionMap;
  invited_by_user_id: number;
}

export interface RefreshToken {
  id: number;
  user_id: number;
  jti: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip: string | null;
  created_at: Date;
}

export interface PasswordResetOTP {
  id: number;
  user_id: number;
  otp_hash: string;
  expires_at: Date;
  used_at: Date | null;
  request_count: number;
  created_at: Date;
}

