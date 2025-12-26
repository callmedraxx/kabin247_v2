import { Request, Response, NextFunction } from 'express';
import { User, Role, PermissionMap } from '../models/user';
import { getAuthService } from '../services/auth.service';
import { Logger } from '../utils/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Middleware to require authentication
 * Attaches user to req.user
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Express normalizes headers to lowercase, but check both to be safe
    // Headers can be string | string[], so handle both cases
    const authHeaderValue = req.headers.authorization || req.headers['Authorization'];
    const authHeader = Array.isArray(authHeaderValue) ? authHeaderValue[0] : authHeaderValue;
    
    // Debug logging (only log first few chars of token for security)
    Logger.info('Auth middleware check', {
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.substring(0, 20) : 'none',
      method: req.method,
      url: req.url,
    });
    
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      Logger.warn('Missing or invalid Authorization header', {
        hasHeader: !!authHeader,
        headerPrefix: authHeader && typeof authHeader === 'string' ? authHeader.substring(0, 15) : 'none',
        method: req.method,
        url: req.url,
      });
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const token = authHeader.substring(7).trim(); // Trim any whitespace
    if (!token) {
      Logger.warn('Empty token after Bearer prefix');
      res.status(401).json({ error: 'Invalid token format' });
      return;
    }

    const authService = getAuthService();
    const user = await authService.getUserFromToken(token);

    if (!user) {
      Logger.warn('Token validation failed - user not found or inactive', {
        tokenLength: token.length,
      });
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    Logger.info('Authentication successful', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    req.user = user;
    next();
  } catch (error) {
    Logger.error('Authentication middleware error', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to require specific role
 */
export function requireRole(...roles: Role[]): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Check if user has a specific permission
 */
function hasPermission(user: User, permission: string): boolean {
  // ADMIN has all permissions
  if (user.role === 'ADMIN') {
    return true;
  }

  // CSR must have explicit permission
  if (user.role === 'CSR' && user.permissions) {
    return user.permissions[permission] === true;
  }

  return false;
}

/**
 * Middleware to require specific permission
 * ADMIN bypasses all permission checks
 */
export function requirePermission(permission: string): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!hasPermission(req.user, permission)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Helper to get permissions hash from user permissions
 */
export function getPermissionsHash(permissions: PermissionMap | null): string | undefined {
  if (!permissions) return undefined;
  // Simple hash of permissions for quick comparison
  const sorted = Object.keys(permissions).sort().map(k => `${k}:${permissions[k]}`).join(',');
  return Buffer.from(sorted).toString('base64').substring(0, 16);
}

