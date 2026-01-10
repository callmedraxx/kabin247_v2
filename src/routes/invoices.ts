import { Router, Request, Response } from 'express';
import { getInvoiceService } from '../services/invoice.service';
import { getEmailService } from '../services/email.service';
import { getOrderRepository, getInvoiceRepository } from '../repositories';
import { Logger } from '../utils/logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { SendInvoiceRequest } from '../models/invoice';

export const invoiceRouter = Router();

// All invoice routes require authentication and admin role
invoiceRouter.use(requireAuth);
invoiceRouter.use(requireRole('ADMIN'));

const invoiceService = getInvoiceService();
const orderRepository = getOrderRepository();
const invoiceRepository = getInvoiceRepository();

/**
 * @swagger
 * /orders/{id}/invoices:
 *   post:
 *     summary: Create and optionally send invoice for an order (Admin only)
 *     tags: [Invoices]
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
 *               - delivery_method
 *             properties:
 *               delivery_method:
 *                 type: string
 *                 enum: [EMAIL, SHARE_MANUALLY]
 *               recipient_email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invoice created successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Order not found
 */
invoiceRouter.post('/orders/:id/invoices', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const adminUserId = req.user!.id!;

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { delivery_method, recipient_email } = req.body as SendInvoiceRequest;

    if (!delivery_method || !['EMAIL', 'SHARE_MANUALLY'].includes(delivery_method)) {
      return res.status(400).json({
        error: 'delivery_method is required and must be either EMAIL or SHARE_MANUALLY',
      });
    }

    if (delivery_method === 'EMAIL' && !recipient_email && !order.client?.email) {
      return res.status(400).json({
        error: 'recipient_email is required when delivery_method is EMAIL',
      });
    }

    // Create invoice
    const result = await invoiceService.createInvoice(
      orderId,
      {
        delivery_method,
        recipient_email: recipient_email || order.client?.email,
      },
      adminUserId
    );

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to create invoice',
      });
    }

    // If EMAIL delivery, Square sends automatically after publishing
    // If SHARE_MANUALLY, we need to publish first to get public_url
    if (delivery_method === 'SHARE_MANUALLY' && result.invoice) {
      // Publish invoice to get public_url
      const publishResult = await invoiceService.publishInvoice(result.invoice.id!, 0);
      if (publishResult.success && publishResult.invoice?.public_url) {
        // Update invoice with public_url
        await invoiceRepository.updatePublicUrl(result.invoice.id!, publishResult.invoice.public_url);
        result.public_url = publishResult.invoice.public_url;
      }
    } else if (delivery_method === 'EMAIL' && result.invoice) {
      // Publish invoice so Square can send it
      // Use the version from the invoice creation response, or default to 0
      const invoiceVersion = result.invoiceVersion || 0;
      Logger.info('Publishing invoice for email delivery', {
        invoiceId: result.invoice.id,
        invoiceVersion,
        squareInvoiceId: result.invoice.square_invoice_id,
      });
      
      const publishResult = await invoiceService.publishInvoice(result.invoice.id!, invoiceVersion);
      
      if (!publishResult.success) {
        Logger.error('Failed to publish invoice for email delivery', {
          invoiceId: result.invoice.id,
          error: publishResult.error,
        });
        // Don't fail the whole request, but log the error
      } else {
        Logger.info('Invoice published successfully, Square will send email', {
          invoiceId: result.invoice.id,
          squareInvoiceId: result.invoice.square_invoice_id,
        });
      }
    }

    Logger.info('Invoice created successfully', {
      orderId,
      invoiceId: result.invoice?.id,
      deliveryMethod: delivery_method,
    });

    return res.json({
      success: true,
      invoice: result.invoice,
      public_url: result.public_url,
      message: delivery_method === 'EMAIL' 
        ? 'Invoice created and sent via Square email'
        : 'Invoice created. Use the public_url to send via your email system.',
    });
  } catch (error: any) {
    Logger.error('Failed to create invoice', error, {
      orderId: req.params.id,
    });
    return res.status(500).json({
      error: error.message || 'Failed to create invoice',
    });
  }
});

/**
 * @swagger
 * /orders/{id}/invoices:
 *   get:
 *     summary: Get all invoices for an order (Admin only)
 *     tags: [Invoices]
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
 *         description: List of invoices
 */
invoiceRouter.get('/orders/:id/invoices', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const invoices = await invoiceRepository.findByOrderId(orderId);

    return res.json({
      invoices,
    });
  } catch (error: any) {
    Logger.error('Failed to get invoices', error, {
      orderId: req.params.id,
    });
    return res.status(500).json({
      error: error.message || 'Failed to get invoices',
    });
  }
});

/**
 * @swagger
 * /orders/{id}/invoices/send:
 *   post:
 *     summary: Send invoice email (for SHARE_MANUALLY delivery method) (Admin only)
 *     tags: [Invoices]
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
 *               - invoice_id
 *               - recipient_email
 *             properties:
 *               invoice_id:
 *                 type: integer
 *               recipient_email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email sent successfully
 */
invoiceRouter.post('/orders/:id/invoices/send', async (req: Request, res: Response) => {
  try {
    const orderId = parseInt(req.params.id);
    const { invoice_id, recipient_email } = req.body;

    if (!invoice_id || !recipient_email) {
      return res.status(400).json({
        error: 'invoice_id and recipient_email are required',
      });
    }

    const order = await orderRepository.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const invoice = await invoiceRepository.findById(invoice_id);
    if (!invoice || invoice.order_id !== orderId) {
      return res.status(404).json({ error: 'Invoice not found for this order' });
    }

    if (invoice.delivery_method !== 'SHARE_MANUALLY') {
      return res.status(400).json({
        error: 'This invoice was created with EMAIL delivery method. Square handles email delivery.',
      });
    }

    if (!invoice.public_url) {
      return res.status(400).json({
        error: 'Invoice does not have a public URL. Please publish the invoice first.',
      });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Create invoice email template
    const subject = `Invoice for Order ${order.order_number} - Payment Required`;
    const body = `
      <p>Dear ${order.client_name},</p>
      <p>Please find below the payment link for your order <strong>${order.order_number}</strong>.</p>
      <p><strong>Total Amount: $${order.total.toFixed(2)}</strong></p>
      <p>Click the link below to complete your payment:</p>
      <p><a href="${invoice.public_url}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">Pay Invoice</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p>${invoice.public_url}</p>
      <p>If you have any questions, please contact us.</p>
      <p>Thank you,<br>Kabin247 Team</p>
    `;

    const html = emailService.generateEmailHTML(body, order.order_number || '');

    const result = await emailService.sendEmail({
      to: recipient_email,
      subject,
      html,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to send email' });
    }

    // Update invoice email_sent_at
    await invoiceRepository.updateEmailSent(invoice_id, new Date());

    Logger.info('Invoice email sent', {
      orderId,
      invoiceId: invoice_id,
      recipient: recipient_email,
    });

    return res.json({
      success: true,
      message: 'Invoice email sent successfully',
      messageId: result.messageId,
    });
  } catch (error: any) {
    Logger.error('Failed to send invoice email', error, {
      orderId: req.params.id,
    });
    return res.status(500).json({
      error: error.message || 'Failed to send invoice email',
    });
  }
});

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get invoice details (Admin only)
 *     tags: [Invoices]
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
 *         description: Invoice details
 */
invoiceRouter.get('/invoices/:id', async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);

    const invoice = await invoiceRepository.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    return res.json({
      invoice,
    });
  } catch (error: any) {
    Logger.error('Failed to get invoice', error, {
      invoiceId: req.params.id,
    });
    return res.status(500).json({
      error: error.message || 'Failed to get invoice',
    });
  }
});

/**
 * @swagger
 * /invoices/{id}/cancel:
 *   post:
 *     summary: Cancel an invoice (Admin only)
 *     tags: [Invoices]
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
 *         description: Invoice cancelled successfully
 */
invoiceRouter.post('/invoices/:id/cancel', async (req: Request, res: Response) => {
  try {
    const invoiceId = parseInt(req.params.id);

    const invoice = await invoiceRepository.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot cancel a paid invoice' });
    }

    if (invoice.status === 'cancelled') {
      return res.json({
        success: true,
        message: 'Invoice is already cancelled',
        invoice,
      });
    }

    // Get invoice version from Square
    const squareInvoiceResult = await invoiceService.getInvoice(invoice.square_invoice_id);
    if (!squareInvoiceResult.success || !squareInvoiceResult.invoice) {
      return res.status(400).json({
        error: 'Failed to get invoice from Square',
      });
    }

    const version = squareInvoiceResult.invoice.version || 0;

    const result = await invoiceService.cancelInvoice(invoiceId, version);

    if (!result.success) {
      return res.status(400).json({
        error: result.error || 'Failed to cancel invoice',
      });
    }

    Logger.info('Invoice cancelled', {
      invoiceId,
    });

    return res.json({
      success: true,
      message: 'Invoice cancelled successfully',
      invoice: result.invoice,
    });
  } catch (error: any) {
    Logger.error('Failed to cancel invoice', error, {
      invoiceId: req.params.id,
    });
    return res.status(500).json({
      error: error.message || 'Failed to cancel invoice',
    });
  }
});

