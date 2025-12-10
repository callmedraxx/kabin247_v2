import { Router, Request, Response } from 'express';
import { getDatabase } from '../database';
import { Logger } from '../utils/logger';

export const healthRouter = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 database:
 *                   type: string
 *                   example: connected
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const dbStatus = db.isConnected() ? 'connected' : 'disconnected';

    res.status(200).json({
      status: 'ok',
      database: dbStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    Logger.error('Health check failed', error, {
      method: 'GET',
      url: '/health',
    });
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

