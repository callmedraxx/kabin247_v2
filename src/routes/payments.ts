import { Router, Request, Response } from 'express';
import { getPaymentService } from '../services/payment.service';
import { getOrderRepository } from '../repositories';
import { Logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { ProcessPaymentDTO } from '../models/payment';

export const paymentRouter = Router();
export const publicPaymentRouter = Router(); // For endpoints that only need auth, not admin
const paymentService = getPaymentService();
const orderRepository = getOrderRepository();

// All payment routes require authentication and admin role
paymentRouter.use(requireAuth);
paymentRouter.use(requireRole('ADMIN'));

// Public payment router (no auth required for application ID - it's safe to expose)
// The Square Application ID is meant to be used in client-side code

/**
 * @swagger
 * /orders/{id}/payments/process:
 *   post:
 *     summary: Process payment for an order (Admin only)
 *     tags: [Payments]
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
 *             type: object
 *             required:
 *               - amount
 *               - payment_method
 *               - source_id
 *               - idempotency_key
 *             properties:
 *               amount:
 *                 type: number
 *               payment_method:
 *                 type: string
 *                 enum: [card, ACH, cash_app_pay, afterpay]
 *               source_id:
 *                 type: string
 *               idempotency_key:
 *                 type: string
 *               use_stored_card:
 *                 type: boolean
 *               stored_card_id:
 *                 type: number
 *               store_card:
 *                 type: boolean
 *               customer_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *       400:
 *         description: Invalid request
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Order not found
 */
paymentRouter.post('/orders/:id/payments/process', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const adminUserId = req.user!.id!;

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const {
      amount,
      payment_method,
      source_id,
      idempotency_key,
      use_stored_card,
      stored_card_id,
      store_card,
      customer_id,
    } = req.body;

    // Validate required fields
    if (!amount || !payment_method || !source_id || !idempotency_key) {
      return res.status(400).json({
        error: 'Missing required fields: amount, payment_method, source_id, idempotency_key',
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const paymentData: ProcessPaymentDTO = {
      order_id: orderId,
      amount,
      payment_method,
      source_id,
      idempotency_key,
      use_stored_card: use_stored_card || false,
      stored_card_id,
      store_card: store_card || false,
      customer_id,
    };

    const result = await paymentService.processPayment(paymentData, adminUserId);

    if (result.success) {
      Logger.info('Payment processed successfully', {
        orderId,
        amount,
        transactionId: result.payment_transaction?.id,
      });

      return res.json({
        success: true,
        payment_transaction: result.payment_transaction,
        stored_card: result.stored_card,
        message: 'Payment processed successfully',
      });
    } else {
      Logger.warn('Payment processing failed', {
        orderId,
        amount,
        error: result.error,
      });

      return res.status(400).json({
        success: false,
        error: result.error,
        square_error_code: result.square_error_code,
        payment_transaction: result.payment_transaction,
      });
    }
  } catch (error: any) {
    Logger.error('Payment processing error', error, {
      orderId: req.params.id,
      body: req.body,
    });

    return res.status(500).json({
      success: false,
      error: error.message || 'Payment processing failed',
    });
  }
});

/**
 * @swagger
 * /orders/{id}/payments:
 *   get:
 *     summary: Get payment transactions for an order (Admin only)
 *     tags: [Payments]
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
 *         description: List of payment transactions
 *       404:
 *         description: Order not found
 */
paymentRouter.get('/orders/:id/payments', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const transactions = await paymentService.getOrderPayments(orderId);

    return res.json({
      order_id: orderId,
      transactions,
      count: transactions.length,
    });
  } catch (error: any) {
    Logger.error('Failed to get order payments', error, {
      orderId: req.params.id,
    });

    return res.status(500).json({
      error: error.message || 'Failed to retrieve payment transactions',
    });
  }
});

/**
 * @swagger
 * /clients/{id}/stored-cards:
 *   get:
 *     summary: Get stored cards for a client (Admin only)
 *     tags: [Payments]
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
 *         description: List of stored cards
 */
paymentRouter.get('/clients/:id/stored-cards', async (req: Request, res: Response) => {
  try {
    const clientId = parseInt(req.params.id);

    const cards = await paymentService.getStoredCards(clientId);

    return res.json({
      client_id: clientId,
      cards,
      count: cards.length,
    });
  } catch (error: any) {
    Logger.error('Failed to get stored cards', error, {
      clientId: req.params.id,
    });

    return res.status(500).json({
      error: error.message || 'Failed to retrieve stored cards',
    });
  }
});

/**
 * @swagger
 * /stored-cards/{id}:
 *   delete:
 *     summary: Delete a stored card (Admin only)
 *     tags: [Payments]
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
 *         description: Card deleted successfully
 *       404:
 *         description: Card not found
 */
paymentRouter.delete('/stored-cards/:id', async (req: Request, res: Response) => {
  try {
    const cardId = parseInt(req.params.id);

    const deleted = await paymentService.deleteStoredCard(cardId);

    if (!deleted) {
      return res.status(404).json({ error: 'Stored card not found' });
    }

    Logger.info('Stored card deleted', { cardId });

    return res.json({
      success: true,
      message: 'Stored card deleted successfully',
    });
  } catch (error: any) {
    Logger.error('Failed to delete stored card', error, {
      cardId: req.params.id,
    });

    return res.status(500).json({
      error: error.message || 'Failed to delete stored card',
    });
  }
});

/**
 * @swagger
 * /payments/application-id:
 *   get:
 *     summary: Get Square application ID for frontend (Admin only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Square application ID
 */
// Public endpoint for application ID (only requires auth, not admin)
publicPaymentRouter.get('/payments/application-id', async (req: Request, res: Response) => {
  try {
    const applicationId = process.env.SQUARE_APPLICATION_ID;

    if (!applicationId) {
      return res.status(500).json({
        error: 'Square application ID not configured',
      });
    }

    return res.json({
      application_id: applicationId,
      environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
    });
  } catch (error: any) {
    Logger.error('Failed to get Square application ID', error);

    return res.status(500).json({
      error: error.message || 'Failed to retrieve Square application ID',
    });
  }
});

