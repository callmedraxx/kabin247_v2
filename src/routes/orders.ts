import { Router, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderStatusUpdateDTO, OrderEmailDTO, CreateOrderFromRefsDTO } from '../models/order';
import { Logger } from '../utils/logger';
import { generateOrderHTML } from '../utils/order-pdf';
import { getEmailService, EmailRecipient } from '../services/email.service';

export const orderRouter = Router();
const orderService = new OrderService();

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
 *         order_type:
 *           type: string
 *           enum: [QE, Serv, Hub]
 *         delivery_fee:
 *           type: number
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
 *         - order_type
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
 *         order_type:
 *           type: string
 *           enum: [QE, Serv, Hub]
 *           description: Type of order - QE (Quick Eats), Serv (Service), Hub
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
 *         delivery_fee:
 *           type: number
 *           description: Delivery fee for the order
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
 *     CreateOrderFromRefs:
 *       type: object
 *       required:
 *         - client_id
 *         - caterer_id
 *         - airport_id
 *         - delivery_date
 *         - delivery_time
 *         - order_priority
 *         - payment_method
 *         - order_type
 *         - items
 *       properties:
 *         client_id:
 *           type: integer
 *         caterer_id:
 *           type: integer
 *         airport_id:
 *           type: integer
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
 *         order_type:
 *           type: string
 *           enum: [QE, Serv, Hub]
 *           description: Type of order - QE (Quick Eats), Serv (Service), Hub
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
 *         delivery_fee:
 *           type: number
 *           description: Delivery fee for the order
 *         service_charge:
 *           type: number
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - item_id
 *               - portion_size
 *               - price
 *             properties:
 *               item_id:
 *                 type: integer
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
 *             oneOf:
 *               - $ref: '#/components/schemas/CreateOrder'
 *               - $ref: '#/components/schemas/CreateOrderFromRefs'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 */
orderRouter.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateOrderDTO | CreateOrderFromRefsDTO;
    const isReferencePayload = 'client_id' in body && 'caterer_id' in body && 'airport_id' in body;
    const order = isReferencePayload
      ? await orderService.createOrderFromReferences(body as CreateOrderFromRefsDTO)
      : await orderService.createOrder(body as CreateOrderDTO);
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

    // Build absolute logo URL for frontend to fetch (use forwarded headers from proxy)
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    const host = req.get('X-Forwarded-Host') || req.get('host');
    const logoUrl = `${protocol}://${host}/assets/logo.png`;
    
    // Pass logo URL to HTML generator
    const orderWithLogo = { ...order, _logoUrl: logoUrl };
    const html = generateOrderHTML(orderWithLogo);
    res.json({ html, order_number: order.order_number, order, logoUrl });
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
 *         description: "Force download (default: true)"
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
 * /orders/{id}/send-to-client:
 *   post:
 *     summary: Send order email to client
 *     description: Sends an email to the client with the order PDF attached. Email template is based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_message:
 *                 type: string
 *                 description: Optional custom message to override the default template
 *               update_status:
 *                 type: boolean
 *                 description: If true, automatically update status to quote_sent when current status is awaiting_quote
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Email not configured or client email not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-client', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get client email from order's nested client object
    const clientEmail = order.client?.email;
    if (!clientEmail) {
      return res.status(400).json({ error: 'No email address found for client' });
    }

    // Get client first name for personalization
    const clientFirstName = order.client?.full_name?.split(' ')[0] || 'Valued Customer';

    // Get template based on order status
    const template = emailService.getTemplate('client', order.status || 'default');
    const subject = template.subject(order.order_number || '');
    const body = req.body.custom_message || template.body(clientFirstName);

    // Generate HTML email
    const html = emailService.generateEmailHTML(body, order.order_number || '');

    // Get PDF attachment
    const pdfResult = await orderService.getOrCreateOrderPdf(id);

    // Send email
    const result = await emailService.sendEmail({
      to: clientEmail,
      subject,
      html,
      attachments: [{
        filename: pdfResult.filename,
        content: pdfResult.buffer,
        contentType: 'application/pdf',
      }],
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Automatically update status from awaiting_quote to quote_sent if requested
    let statusUpdated = false;
    if (req.body.update_status !== false && order.status === 'awaiting_quote') {
      const updatedOrder = await orderService.updateOrderStatus(id, { status: 'quote_sent' });
      if (updatedOrder) {
        order = updatedOrder;
        statusUpdated = true;
      }
    }

    Logger.info('Email sent to client', {
      orderId: id,
      orderNumber: order.order_number,
      recipient: clientEmail,
      status: order.status,
      statusUpdated,
    });

    res.json({
      message: 'Email sent to client successfully',
      recipient: clientEmail,
      order_number: order.order_number,
      status: order.status,
      status_updated: statusUpdated,
      sent_at: new Date().toISOString(),
      messageId: result.messageId,
    });
  } catch (error: any) {
    Logger.error('Failed to send email to client', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-client`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/send-to-caterer:
 *   post:
 *     summary: Send order email to caterer/vendor
 *     description: Sends an email to the caterer with the order PDF attached. Email template is based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_message:
 *                 type: string
 *                 description: Optional custom message to override the default template
 *               update_status:
 *                 type: string
 *                 enum: [awaiting_caterer, quote_sent, quote_approved, in_preparation, ready_for_delivery]
 *                 description: Optional new status to set after sending email
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Email not configured or caterer email not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-caterer', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get caterer email from order's nested caterer_details object
    const catererEmail = order.caterer_details?.caterer_email;
    if (!catererEmail) {
      return res.status(400).json({ error: 'No email address found for caterer' });
    }

    // Get template based on order status
    const template = emailService.getTemplate('caterer', order.status || 'default');
    const subject = template.subject(order.order_number || '');
    const body = req.body.custom_message || template.body('Team');

    // Generate HTML email
    const html = emailService.generateEmailHTML(body, order.order_number || '');

    // Get PDF attachment
    const pdfResult = await orderService.getOrCreateOrderPdf(id);

    // Send email
    const result = await emailService.sendEmail({
      to: catererEmail,
      subject,
      html,
      attachments: [{
        filename: pdfResult.filename,
        content: pdfResult.buffer,
        contentType: 'application/pdf',
      }],
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Update status if requested
    let statusUpdated = false;
    if (req.body.update_status) {
      const validStatuses = ['awaiting_caterer', 'quote_sent', 'quote_approved', 'in_preparation', 'ready_for_delivery'];
      if (validStatuses.includes(req.body.update_status)) {
        const updatedOrder = await orderService.updateOrderStatus(id, { status: req.body.update_status });
        if (updatedOrder) {
          order = updatedOrder;
          statusUpdated = true;
        }
      }
    }

    Logger.info('Email sent to caterer', {
      orderId: id,
      orderNumber: order.order_number,
      recipient: catererEmail,
      status: order.status,
      statusUpdated,
    });

    res.json({
      message: 'Email sent to caterer successfully',
      recipient: catererEmail,
      order_number: order.order_number,
      status: order.status,
      status_updated: statusUpdated,
      sent_at: new Date().toISOString(),
      messageId: result.messageId,
    });
  } catch (error: any) {
    Logger.error('Failed to send email to caterer', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-caterer`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/send-to-both:
 *   post:
 *     summary: Send order email to both client and caterer
 *     description: Sends separate emails to both client and caterer with the order PDF attached. Each email uses a template based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_client_message:
 *                 type: string
 *                 description: Optional custom message for client email
 *               custom_caterer_message:
 *                 type: string
 *                 description: Optional custom message for caterer email
 *               update_status:
 *                 type: boolean
 *                 description: If true, automatically update status to quote_sent when current status is awaiting_quote
 *     responses:
 *       200:
 *         description: Emails sent successfully
 *       400:
 *         description: Email not configured or recipient emails not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-both', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get both emails
    const clientEmail = order.client?.email;
    const catererEmail = order.caterer_details?.caterer_email;

    const errors: string[] = [];
    if (!clientEmail) errors.push('No email address found for client');
    if (!catererEmail) errors.push('No email address found for caterer');

    if (errors.length === 2) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // Get PDF attachment (generate once, use for both)
    const pdfResult = await orderService.getOrCreateOrderPdf(id);
    const attachment = {
      filename: pdfResult.filename,
      content: pdfResult.buffer,
      contentType: 'application/pdf',
    };

    const results: any = {
      client: null,
      caterer: null,
    };

    // Send to client if email available
    if (clientEmail) {
      const clientFirstName = order.client?.full_name?.split(' ')[0] || 'Valued Customer';
      const clientTemplate = emailService.getTemplate('client', order.status || 'default');
      const clientSubject = clientTemplate.subject(order.order_number || '');
      const clientBody = req.body.custom_client_message || clientTemplate.body(clientFirstName);
      const clientHtml = emailService.generateEmailHTML(clientBody, order.order_number || '');

      const clientResult = await emailService.sendEmail({
        to: clientEmail,
        subject: clientSubject,
        html: clientHtml,
        attachments: [attachment],
      });

      results.client = {
        success: clientResult.success,
        email: clientEmail,
        messageId: clientResult.messageId,
        error: clientResult.error,
      };
    }

    // Send to caterer if email available
    if (catererEmail) {
      const catererTemplate = emailService.getTemplate('caterer', order.status || 'default');
      const catererSubject = catererTemplate.subject(order.order_number || '');
      const catererBody = req.body.custom_caterer_message || catererTemplate.body('Team');
      const catererHtml = emailService.generateEmailHTML(catererBody, order.order_number || '');

      const catererResult = await emailService.sendEmail({
        to: catererEmail,
        subject: catererSubject,
        html: catererHtml,
        attachments: [attachment],
      });

      results.caterer = {
        success: catererResult.success,
        email: catererEmail,
        messageId: catererResult.messageId,
        error: catererResult.error,
      };
    }

    // Automatically update status from awaiting_quote to quote_sent if requested
    let statusUpdated = false;
    if (req.body.update_status !== false && order.status === 'awaiting_quote') {
      // Only update if at least one email was sent successfully
      const clientSuccess = results.client?.success;
      const catererSuccess = results.caterer?.success;
      if (clientSuccess || catererSuccess) {
        const updatedOrder = await orderService.updateOrderStatus(id, { status: 'quote_sent' });
        if (updatedOrder) {
          order = updatedOrder;
          statusUpdated = true;
        }
      }
    }

    Logger.info('Emails sent to both client and caterer', {
      orderId: id,
      orderNumber: order.order_number,
      clientEmail,
      catererEmail,
      status: order.status,
      statusUpdated,
    });

    res.json({
      message: 'Emails processed',
      order_number: order.order_number,
      status: order.status,
      status_updated: statusUpdated,
      sent_at: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    Logger.error('Failed to send emails to both', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-both`,
      orderId: req.params.id,
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
