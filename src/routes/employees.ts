import { Router, Request, Response } from 'express';
import { getUserService } from '../services/user.service';
import { getInviteService } from '../services/invite.service';
import { getEmailService } from '../services/email.service';
import { env } from '../config/env';
import { requireAuth, requireRole } from '../middleware/auth';
import { PermissionMap } from '../models/user';
import { Logger } from '../utils/logger';

export const employeesRouter = Router();

// All routes require authentication and admin role
employeesRouter.use(requireAuth);
employeesRouter.use(requireRole('ADMIN'));

/**
 * @swagger
 * components:
 *   schemas:
 *     InviteEmployeeRequest:
 *       type: object
 *       required:
 *         - email
 *         - permissions
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *         permissions:
 *           type: object
 *           properties:
 *             orders.read:
 *               type: boolean
 *             orders.update_status:
 *               type: boolean
 *             orders.set_paid:
 *               type: boolean
 *             invoices.send_final:
 *               type: boolean
 *             employees.manage:
 *               type: boolean
 *             invites.create:
 *               type: boolean
 *     UpdateEmployeePermissionsRequest:
 *       type: object
 *       required:
 *         - permissions
 *       properties:
 *         permissions:
 *           type: object
 */

/**
 * @swagger
 * /employees/invite:
 *   post:
 *     summary: Invite a new employee (CSR)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InviteEmployeeRequest'
 *     responses:
 *       201:
 *         description: Invite sent successfully
 *       400:
 *         description: Invalid input or invite already exists
 */
employeesRouter.post('/invite', async (req: Request, res: Response) => {
  const { email, permissions } = req.body;
  
  // #region agent log
  console.log('[DEBUG] Invite creation request:', JSON.stringify({email,permissions,permissionsType:typeof permissions,permissionsKeys:permissions?Object.keys(permissions):null,ordersRead:permissions?.['orders.read'],ordersUpdateStatus:permissions?.['orders.update_status'],fullRequestBody:req.body}, null, 2));
  const logData1 = {location:'employees.ts:73',message:'Invite creation request received',data:{email,permissions,permissionsType:typeof permissions,permissionsKeys:permissions?Object.keys(permissions):null,permissionsStringified:JSON.stringify(permissions),ordersRead:permissions?.['orders.read'],ordersUpdateStatus:permissions?.['orders.update_status'],fullRequestBody:JSON.stringify(req.body)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
  try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData1)+'\n');}catch(e){}
  // #endregion
  
  try {
    if (!email || !permissions) {
      return res.status(400).json({ error: 'Email and permissions are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate permissions object
    if (typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Permissions must be an object' });
    }

    // Remove admin-only permissions from CSR invites and filter to only include true permissions
    // NOTE: Frontend bug - sending false when checkboxes are checked. Workaround: detect and invert
    const cleanedPermissions: PermissionMap = {};
    const permissionKeys = Object.keys(permissions);
    const allFalse = permissionKeys.length > 0 && permissionKeys.every(key => permissions[key] === false);
    const hasExpectedKeys = permissionKeys.some(key => key === 'orders.read' || key === 'orders.update_status');
    
    // #region agent log
    console.log(`[DEBUG] Permission analysis: keys=${permissionKeys.length}, allFalse=${allFalse}, hasExpectedKeys=${hasExpectedKeys}`);
    // #endregion
    
    // Workaround for frontend bug: if all permissions are false AND we have expected permission keys,
    // assume the frontend is sending inverted values (false when checked = true)
    const shouldInvert = allFalse && hasExpectedKeys && permissionKeys.length > 0;
    
    // Only include permissions that are explicitly set to true (or inverted from false)
    Object.keys(permissions).forEach(key => {
      let value = permissions[key];
      
      // Workaround: invert if all values are false and we have expected keys (frontend bug)
      if (shouldInvert && value === false) {
        value = true;
        // #region agent log
        console.log(`[DEBUG] Inverting permission ${key} from false to true (frontend bug workaround)`);
        // #endregion
      }
      
      // #region agent log
      console.log(`[DEBUG] Processing permission: ${key} = ${value} (type: ${typeof value}, isTrue: ${value===true}, isFalse: ${value===false})`);
      const logKey = {location:'employees.ts:100',message:'Processing permission key',data:{key,value,valueType:typeof value,isTrue:value===true,isFalse:value===false,shouldInvert},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
      try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logKey)+'\n');}catch(e){}
      // #endregion
      
      if (value === true) {
        // Skip admin-only permissions
        if (key !== 'orders.set_paid' && 
            key !== 'invoices.send_final' && 
            key !== 'employees.manage' && 
            key !== 'invites.create') {
          cleanedPermissions[key] = true;
        }
      }
    });

    // #region agent log
    console.log('[DEBUG] Cleaned permissions:', JSON.stringify(cleanedPermissions, null, 2), 'Keys:', Object.keys(cleanedPermissions), 'IsEmpty:', Object.keys(cleanedPermissions).length === 0);
    const logData2 = {location:'employees.ts:115',message:'Cleaned permissions before creating invite',data:{cleanedPermissions,cleanedPermissionsKeys:Object.keys(cleanedPermissions),cleanedPermissionsStringified:JSON.stringify(cleanedPermissions),ordersRead:cleanedPermissions['orders.read'],ordersUpdateStatus:cleanedPermissions['orders.update_status'],isEmpty:Object.keys(cleanedPermissions).length===0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
    try{require('fs').appendFileSync('/root/kabin247_v2/.cursor/debug.log',JSON.stringify(logData2)+'\n');}catch(e){}
    // #endregion

    const inviteService = getInviteService();
    const userId = req.user!.id;
    
    // Create invite - this may throw if invite already exists
    const { token, expiresAt, inviteId } = await inviteService.createInvite(email, cleanedPermissions, userId);
    
    // Send invite email
    const inviteLink = `${env.FRONTEND_URL}/signup?token=${token}`;
    const emailService = getEmailService();
    const emailResult = await emailService.sendInviteEmail(email, inviteLink);
    
    // If email sending failed, delete the invite to allow retry
    if (!emailResult.success) {
      Logger.warn('Email sending failed, deleting invite', {
        email,
        inviteId,
        error: emailResult.error,
      });
      await inviteService.deleteInvite(inviteId);
      return res.status(500).json({ error: `Failed to send invite email: ${emailResult.error || 'Unknown error'}` });
    }
    
    res.status(201).json({
      message: 'Invite sent successfully',
      expiresAt,
    });
  } catch (error: any) {
    Logger.error('Failed to invite employee', error, {
      email,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    if (error.message.includes('already exists') || error.message.includes('active invite')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to send invite' });
  }
});

/**
 * @swagger
 * /employees:
 *   get:
 *     summary: List all employees (CSR users)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 employees:
 *                   type: array
 *                   items:
 *                     type: object
 */
employeesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userService = getUserService();
    const employees = await userService.listEmployees();
    
    res.json({ employees });
  } catch (error: any) {
    Logger.error('Failed to list employees', error);
    res.status(500).json({ error: 'Failed to list employees' });
  }
});

/**
 * @swagger
 * /employees/{id}/permissions:
 *   patch:
 *     summary: Update employee permissions
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEmployeePermissionsRequest'
 *     responses:
 *       200:
 *         description: Permissions updated successfully
 *       404:
 *         description: Employee not found
 */
employeesRouter.patch('/:id/permissions', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { permissions } = req.body;
    
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'Permissions object is required' });
    }

    // Remove admin-only permissions and filter to only include true permissions
    const cleanedPermissions: PermissionMap = {};
    // Only include permissions that are explicitly set to true
    Object.keys(permissions).forEach(key => {
      if (permissions[key] === true) {
        // Skip admin-only permissions
        if (key !== 'orders.set_paid' && 
            key !== 'invoices.send_final' && 
            key !== 'employees.manage' && 
            key !== 'invites.create') {
          cleanedPermissions[key] = true;
        }
      }
    });

    const userService = getUserService();
    const employee = await userService.updateEmployeePermissions(id, cleanedPermissions);
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ employee });
  } catch (error: any) {
    Logger.error('Failed to update employee permissions', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

/**
 * @swagger
 * /employees/{id}/deactivate:
 *   post:
 *     summary: Deactivate an employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Employee deactivated successfully
 *       404:
 *         description: Employee not found
 */
employeesRouter.post('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const userService = getUserService();
    const success = await userService.deactivateEmployee(id);
    
    if (!success) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee deactivated successfully' });
  } catch (error: any) {
    Logger.error('Failed to deactivate employee', error);
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

/**
 * @swagger
 * /employees/{id}/reactivate:
 *   post:
 *     summary: Reactivate an employee
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Employee reactivated successfully
 *       404:
 *         description: Employee not found
 */
employeesRouter.post('/:id/reactivate', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    const userService = getUserService();
    const success = await userService.reactivateEmployee(id);
    
    if (!success) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    res.json({ message: 'Employee reactivated successfully' });
  } catch (error: any) {
    Logger.error('Failed to reactivate employee', error);
    res.status(500).json({ error: 'Failed to reactivate employee' });
  }
});

/**
 * @swagger
 * /employees/invites:
 *   get:
 *     summary: List all invites (ADMIN only)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all invites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invites:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       email:
 *                         type: string
 *                       role:
 *                         type: string
 *                       permissions:
 *                         type: object
 *                       expires_at:
 *                         type: string
 *                         format: date-time
 *                       used_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 */
employeesRouter.get('/invites', async (req: Request, res: Response) => {
  try {
    const inviteService = getInviteService();
    const invites = await inviteService.getAllInvites();
    
    // Remove sensitive token_hash from response
    const sanitizedInvites = invites.map(({ token_hash, ...invite }) => invite);
    
    res.json({ invites: sanitizedInvites });
  } catch (error: any) {
    Logger.error('Failed to list invites', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

/**
 * @swagger
 * /employees/invites/{id}:
 *   delete:
 *     summary: Revoke/delete an invite (ADMIN only)
 *     tags: [Employees]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Invite revoked successfully
 *       404:
 *         description: Invite not found
 */
employeesRouter.delete('/invites/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid invite ID' });
    }
    
    const inviteService = getInviteService();
    const deleted = await inviteService.deleteInvite(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    
    res.json({ message: 'Invite revoked successfully' });
  } catch (error: any) {
    Logger.error('Failed to revoke invite', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

