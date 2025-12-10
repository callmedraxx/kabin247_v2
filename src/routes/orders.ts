import { Router, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderStatusUpdateDTO, OrderEmailDTO } from '../models/order';
import { Logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import { getClientRepository, getCatererRepository } from '../repositories';
import { generateOrderHTML, generateOrderEmailHTML } from '../utils/order-pdf';

export const orderRouter = Router();
const orderService = new OrderService();

// Email transporter setup (configure via environment variables)
const getEmailTransporter = () => {
  // For development, use a test account or configure via env vars
  if (process.env.EMAIL_SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST,
      port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
      secure: process.env.EMAIL_SMTP_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASS,
      },
    });
  }
  // Return null if email is not configured (will fail gracefully)
  return null;
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         order_number:
 *           type: string
 *         client_name:
 *           type: string
 *         caterer:
 *           type: string
 *         airport:
 *           type: string
 *         aircraft_tail_number:
 *           type: string
 *         delivery_date:
 *           type: string
 *           format: date
 *         delivery_time:
 *           type: string
 *         order_priority:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *         payment_method:
 *           type: string
 *           enum: [card, ACH]
 *         status:
 *           type: string
 *           enum: [awaiting_quote, awaiting_caterer, quote_sent, quote_approved, in_preparation, ready_for_delivery, delivered, cancelled]
 *         description:
 *           type: string
 *         notes:
 *           type: string
 *         reheating_instructions:
 *           type: string
 *         packaging_instructions:
 *           type: string
 *         dietary_restrictions:
 *           type: string
 *         service_charge:
 *           type: number
 *         subtotal:
 *           type: number
 *         total:
 *           type: number
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         completed_at:
 *           type: string
 *           format: date-time
 *     OrderItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         item_name:
 *           type: string
 *         item_description:
 *           type: string
 *         portion_size:
 *           type: string
 *         price:
 *           type: number
 *         sort_order:
 *           type: integer
 *     CreateOrder:
 *       type: object
 *       required:
 *         - client_name
 *         - caterer
 *         - airport
 *         - delivery_date
 *         - delivery_time
 *         - order_priority
 *         - payment_method
 *         - items
 *       properties:
 *         client_name:
 *           type: string
 *         caterer:
 *           type: string
 *         airport:
 *           type: string
 *         aircraft_tail_number:
 *           type: string
 *         delivery_date:
 *           type: string
 *           format: date
 *         delivery_time:
 *           type: string
 *         order_priority:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *         payment_method:
 *           type: string
 *           enum: [card, ACH]
 *         description:
 *           type: string
 *         notes:
 *           type: string
 *         reheating_instructions:
 *           type: string
 *         packaging_instructions:
 *           type: string
 *         dietary_restrictions:
 *           type: string
 *         service_charge:
 *           type: number
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - item_name
 *               - portion_size
 *               - price
 *             properties:
 *               item_name:
 *                 type: string
 *               item_description:
 *                 type: string
 *               portion_size:
 *                 type: string
 *               price:
 *                 type: number
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrder'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 */
orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const orderData: CreateOrderDTO = req.body;
    const order = await orderService.createOrder(orderData);
    res.status(201).json(order);
  } catch (error: any) {
    Logger.error('Failed to create order', error, {
      method: 'POST',
      url: '/orders',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List orders with pagination, search, filter, and sorting
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of orders
 *       500:
 *         description: Server error
 */
orderRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: OrderSearchParams = {
      search: req.query.search as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await orderService.listOrders(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list orders', error, {
      method: 'GET',
      url: '/orders',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order found
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      Logger.warn('Order not found', {
        method: 'GET',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    Logger.error('Failed to get order by ID', error, {
      method: 'GET',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update an order
 *     tags: [Orders]
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
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
orderRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const orderData: UpdateOrderDTO = req.body;
    const order = await orderService.updateOrder(id, orderData);
    if (!order) {
      Logger.warn('Order not found for update', {
        method: 'PUT',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    Logger.error('Failed to update order', error, {
      method: 'PUT',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Order not found
 */
orderRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const statusData: OrderStatusUpdateDTO = req.body;
    const order = await orderService.updateOrderStatus(id, statusData);
    if (!order) {
      Logger.warn('Order not found for status update', {
        method: 'PATCH',
        url: `/orders/${id}/status`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      updated_at: order.updated_at,
    });
  } catch (error: any) {
    Logger.error('Failed to update order status', error, {
      method: 'PATCH',
      url: `/orders/${req.params.id}/status`,
      orderId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Delete an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */
orderRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await orderService.deleteOrder(id);
    if (!deleted) {
      Logger.warn('Order not found for deletion', {
        method: 'DELETE',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete order', error, {
      method: 'DELETE',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders:
 *   delete:
 *     summary: Bulk delete orders
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Orders deleted successfully
 *       400:
 *         description: Invalid request
 */
orderRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await orderService.deleteOrders(ids);
    res.json({ message: 'Orders deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete orders', error, {
      method: 'DELETE',
      url: '/orders',
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/preview:
 *   get:
 *     summary: Get HTML preview of order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: HTML preview
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const html = generateOrderHTML(order);
    res.json({ html, order_number: order.order_number, order });
  } catch (error: any) {
    Logger.error('Failed to generate order preview', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/preview`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/pdf:
 *   get:
 *     summary: Download order as PDF
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: download
 *         schema:
 *           type: boolean
 *         description: Force download (default: true)
 *     responses:
 *       200:
 *         description: PDF file
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const regenerate = req.query.regenerate === 'true';
    const pdf = await orderService.getOrCreateOrderPdf(id, regenerate);
    
    const download = req.query.download !== 'false';
    const filename = pdf.filename;

    res.setHeader('Content-Type', pdf.mimeType);
    res.setHeader(
      'Content-Disposition',
      download ? `attachment; filename=${filename}` : `inline; filename=${filename}`
    );

    res.end(pdf.buffer);
  } catch (error: any) {
    Logger.error('Failed to generate order PDF', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/pdf`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/email:
 *   post:
 *     summary: Send order via email
 *     tags: [Orders]
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
 *               - recipient
 *             properties:
 *               recipient:
 *                 type: string
 *                 enum: [client, caterer, both]
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *               include_pdf:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Validation error or email not configured
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailData: OrderEmailDTO = req.body;
    if (!emailData.recipient || !['client', 'caterer', 'both'].includes(emailData.recipient)) {
      return res.status(400).json({ error: 'recipient must be one of: client, caterer, both' });
    }

    const transporter = getEmailTransporter();
    if (!transporter) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get email addresses
    const recipients: string[] = [];
    if (emailData.recipient === 'client' || emailData.recipient === 'both') {
      const clients = await getClientRepository().findAll({ search: order.client_name, limit: 1 });
      const client = clients.clients.find(c => c.full_name === order.client_name);
      if (client?.email) {
        recipients.push(client.email);
      } else {
        return res.status(400).json({ error: 'No email address found for client' });
      }
    }

    if (emailData.recipient === 'caterer' || emailData.recipient === 'both') {
      const caterers = await getCatererRepository().findAll({ search: order.caterer, limit: 1 });
      const caterer = caterers.caterers.find(c => c.caterer_name === order.caterer);
      if (caterer?.caterer_email) {
        recipients.push(caterer.caterer_email);
      } else {
        return res.status(400).json({ error: 'No email address found for caterer' });
      }
    }

    // Generate email content
    const subject = emailData.subject || `Order ${order.order_number} - ${order.client_name}`;
    const htmlContent = generateOrderEmailHTML(order, emailData.message);

    // Generate or load PDF if requested
    const pdfResult = emailData.include_pdf === false ? null : await orderService.getOrCreateOrderPdf(id);

    // Send email
    const mailOptions: any = {
      from: process.env.EMAIL_FROM || 'noreply@kabin247.com',
      to: recipients.join(', '),
      subject,
      html: htmlContent,
    };

    if (pdfResult) {
      mailOptions.attachments = [{
        filename: pdfResult.filename,
        content: pdfResult.buffer,
      }];
    }

    await transporter.sendMail(mailOptions);

    res.json({
      message: 'Email sent successfully',
      recipients,
      sent_at: new Date().toISOString(),
    });
  } catch (error: any) {
    Logger.error('Failed to send order email', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/email`,
      orderId: req.params.id,
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/history:
 *   get:
 *     summary: Get order history
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: client_name
 *         schema:
 *           type: string
 *       - in: query
 *         name: caterer
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order history
 */
orderRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const params: OrderSearchParams = {
      search: req.query.search as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      client_name: req.query.client_name as string,
      caterer: req.query.caterer as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await orderService.getOrderHistory(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to get order history', error, {
      method: 'GET',
      url: '/orders/history',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

// Helper functions moved to src/utils/order-pdf.ts
