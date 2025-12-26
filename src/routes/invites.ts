import { Router, Request, Response } from 'express';
import { getInviteService } from '../services/invite.service';
import { Logger } from '../utils/logger';

export const invitesRouter = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AcceptInviteRequest:
 *       type: object
 *       required:
 *         - token
 *         - password
 *       properties:
 *         token:
 *           type: string
 *         password:
 *           type: string
 */

/**
 * @swagger
 * /invites/accept:
 *   post:
 *     summary: Accept invite and create employee account
 *     tags: [Invites]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptInviteRequest'
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Invalid token or password
 */
invitesRouter.post('/accept', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const inviteService = getInviteService();
    const result = await inviteService.acceptInvite(token, password);
    
    if (!result) {
      return res.status(400).json({ error: 'Invalid or expired invite token' });
    }
    
    res.status(201).json({
      message: 'Account created successfully',
      user: result.user,
    });
  } catch (error: any) {
    Logger.error('Failed to accept invite', error);
    if (error.message.includes('already exists')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

